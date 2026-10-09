import "dotenv/config";
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import * as store from "./store.js";
import { ProposalInput, sanitizeForPublic } from "./schema.js";
import { extractFromImage, generateEditorial, aiAvailable } from "./extract.js";
import { lookupEditorial, MONTHS_PT } from "./editorial.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
export const PORT = Number(process.env.PORT || 3000);
export const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
/** URL pública dos links: PUBLIC_URL do .env ou, na Vercel, o host da própria requisição. */
function publicUrl(req) {
  if (process.env.PUBLIC_URL) return PUBLIC_URL;
  if (process.env.VERCEL && req.get("host")) return `https://${req.get("host")}`;
  return PUBLIC_URL;
}
const ATTENDANT_TOKEN = process.env.ATTENDANT_TOKEN || "";
// Sem SESSION_SECRET, deriva do token (precisa ser estável entre instâncias serverless). Sem token não há sessão.
const SESSION_SECRET = process.env.SESSION_SECRET
  || (ATTENDANT_TOKEN ? crypto.createHash("sha256").update("fredy-session:" + ATTENDANT_TOKEN).digest("hex") : crypto.randomBytes(32).toString("hex"));
// Aceita "self", "'self'", "none" ou uma lista de domínios (o dotenv remove aspas, então normalizamos aqui).
const FRAME_ANCESTORS = (process.env.FRAME_ANCESTORS || "self")
  .split(/\s+/).filter(Boolean)
  .map((t) => (/^'?(self|none)'?$/i.test(t) ? `'${t.replace(/'/g, "").toLowerCase()}'` : t))
  .join(" ");
// 3,3 MB cabe no limite de 4,5 MB por requisição da Vercel (o navegador comprime a imagem antes de enviar).
const MAX_IMAGE_BYTES = 3.3 * 1024 * 1024;
const IS_PROD = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "12mb" }));

/* ---------- Headers de segurança ---------- */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "frame-src 'self' https://www.google.com https://maps.google.com",
      "connect-src 'self'",
      `frame-ancestors ${FRAME_ANCESTORS}`,
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  next();
});

/* ---------- Rate limit simples (em memória) ---------- */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count += 1;
    hits.set(key, entry);
    if (hits.size > 5000) hits.clear();
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: "Muitas requisições. Aguarde um pouco e tente de novo." });
    }
    next();
  };
}

/* ---------- Sessão do atendente (cookie HttpOnly) ---------- */
function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}
function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((c) => c.trim().split("=")).filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]),
  );
}
function isAuthed(req) {
  if (!ATTENDANT_TOKEN) return true;
  const cookie = parseCookies(req.headers.cookie)["fredy_session"];
  if (!cookie) return false;
  const expected = sign(ATTENDANT_TOKEN);
  return cookie.length === expected.length && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "Faça login pra usar o gerador.", authRequired: true });
}

app.get("/api/session", (req, res) => {
  res.json({ authRequired: Boolean(ATTENDANT_TOKEN), authed: isAuthed(req), aiAvailable: aiAvailable(), publicUrl: publicUrl(req), storage: store.BACKEND_NAME, storageEphemeral: store.STORAGE_EPHEMERAL });
});

app.post("/api/session", rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }), (req, res) => {
  const token = String(req.body?.token || "");
  if (!ATTENDANT_TOKEN) return res.json({ ok: true });
  const a = Buffer.from(token), b = Buffer.from(ATTENDANT_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Senha incorreta." });
  res.setHeader("Set-Cookie", `fredy_session=${sign(ATTENDANT_TOKEN)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${IS_PROD ? "; Secure" : ""}`);
  res.json({ ok: true });
});

app.delete("/api/session", (req, res) => {
  res.setHeader("Set-Cookie", "fredy_session=; Path=/; HttpOnly; Max-Age=0");
  res.json({ ok: true });
});

/* ---------- Helpers ---------- */
function decodeImage(body, { allowPdf = false } = {}) {
  let data = String(body?.image || "");
  let mime = String(body?.mime || "");
  const m = data.match(/^data:([\w/+.-]+);base64,(.*)$/s);
  if (m) { mime = m[1]; data = m[2]; }
  if (!data) throw Object.assign(new Error("Envie uma imagem."), { status: 400 });
  const tooBig = Object.assign(new Error("Arquivo muito grande. Tire um print menor, recorte só a cotação ou use um PDF mais leve."), { status: 413 });
  if (data.length > MAX_IMAGE_BYTES * 1.4) throw tooBig;
  const buf = Buffer.from(data, "base64");
  if (buf.length > MAX_IMAGE_BYTES) throw tooBig;
  if (allowPdf && buf.slice(0, 5).toString() === "%PDF-") return { buf, data: buf.toString("base64"), mime: "application/pdf" };
  const kind = store.sniffImage(buf);
  if (!kind) throw Object.assign(new Error(allowPdf ? "Formato não aceito. Use PNG, JPEG, WEBP ou PDF." : "Formato não aceito. Use PNG, JPEG ou WEBP."), { status: 415 });
  return { buf, data: buf.toString("base64"), mime: kind.mime };
}

function monthFromDate(ddmmyyyy = "") {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy);
  return m ? Number(m[2]) : null;
}

function legFrom(x) {
  return {
    date: x?.date || "", origin: (x?.origin || "").toUpperCase(), destination: (x?.destination || "").toUpperCase(),
    departure: x?.departure || "", arrival: x?.arrival || "", duration: x?.duration || "", airline: x?.airline || "",
    connections: (x?.connections || []).map((c) => ({ airport: (c.airport || "").toUpperCase(), arrival: c.arrival || "", departure: c.departure || "" })),
  };
}

/** Converte o resultado da IA no formato de "opção" do orçamento. */
function toOption(ex, label = "Opção 1") {
  const month = monthFromDate(ex.outbound?.date);
  const dict = ex.destination?.city ? lookupEditorial(ex.destination.city, month, 0) : null;
  const ed = dict || {
    tagline: ex.editorial?.tagline || "", highlights: ex.editorial?.highlights || [],
    climate: ex.editorial?.climate || "", bestSeason: ex.editorial?.best_season || "",
  };
  const adults = ex.passengers?.adults ?? 2;
  const children = ex.passengers?.children ?? 0;
  return {
    label,
    destination: {
      city: ex.destination?.city || "", region: ex.destination?.region || "",
      tagline: ed.tagline, highlights: ed.highlights, climate: ed.climate, bestSeason: ed.bestSeason,
    },
    flights: { outbound: legFrom(ex.outbound), inbound: legFrom(ex.inbound), oneWay: !ex.inbound },
    hotels: (ex.hotels || []).map((h) => ({
      name: h.name || "", city: h.city || ex.destination?.city || "", checkin: h.checkin || "", checkout: h.checkout || "",
      nights: h.nights ?? null, board: h.board || "Café da manhã", room: h.room || "", photos: [], libraryKey: "",
    })),
    included: {
      flights: ex.included?.flights ?? Boolean(ex.outbound), hotel: ex.included?.hotel ?? (ex.hotels?.length > 0),
      transfers: ex.included?.transfers ?? false, insurance: ex.included?.insurance ?? false,
      tours: ex.included?.tours || [], extras: ex.included?.extras || [],
    },
    passengers: { rooms: ex.passengers?.rooms ?? 1, adults, children },
    pricing: {
      mode: ex.pricing?.total != null || ex.pricing?.per_person == null ? "total" : "perPerson",
      amount: ex.pricing?.total ?? ex.pricing?.per_person ?? null,
      promo: { applied: false, originalAmount: null, percent: null },
    },
    payment: {
      card: { enabled: true, installments: 10 }, boleto: { enabled: true, installments: 12 }, pix: { enabled: true },
      featured: "auto", entry: { enabled: false, amount: null }, firstBigger: { enabled: false, amount: null }, highlight: "installment",
    },
    notes: "",
    _meta: { uncertainties: ex.uncertainties || [], breakdown: ex.pricing?.breakdown || [], taxes: ex.pricing?.taxes ?? null, clientName: ex.client_name || "" },
  };
}

function describeIssues(zodError) {
  const first = zodError.issues[0];
  const where = first?.path?.length ? ` (campo: ${first.path.join(".")})` : "";
  return `Dados inválidos no orçamento${where}: ${(first?.message || "verifique os campos").replace(/\.$/, "")}.`;
}

/* ---------- API do atendente ---------- */
app.post("/api/extract", requireAuth, rateLimit({ windowMs: 10 * 60 * 1000, max: 30 }), async (req, res, next) => {
  try {
    const { data, mime } = decodeImage(req.body, { allowPdf: true });
    const extraction = await extractFromImage({ data, mime });
    res.json({ option: toOption(extraction, req.body?.label || "Opção 1") });
  } catch (err) { next(err); }
});

app.get("/api/editorial", requireAuth, rateLimit({ windowMs: 10 * 60 * 1000, max: 60 }), async (req, res, next) => {
  try {
    const city = String(req.query.city || "").trim();
    if (!city) return res.status(400).json({ error: "Informe a cidade." });
    const month = req.query.month ? Number(req.query.month) : null;
    const variant = Number(req.query.variant || 0);
    const dict = lookupEditorial(city, month, variant);
    if (dict) return res.json({ source: "dictionary", ...dict });
    if (!aiAvailable()) return res.json({ source: "none", tagline: "", highlights: [], climate: "", bestSeason: "", variant: 0, total: 0 });
    const avoid = req.query.avoid ? String(req.query.avoid).slice(0, 500) : "";
    const ed = await generateEditorial({ city, month: month ? MONTHS_PT[month - 1] : "", avoid });
    res.json({ source: "ai", tagline: ed.tagline, highlights: ed.highlights, climate: ed.climate, bestSeason: ed.best_season, variant, total: 0 });
  } catch (err) { next(err); }
});

app.post("/api/uploads", requireAuth, rateLimit({ windowMs: 10 * 60 * 1000, max: 120 }), async (req, res, next) => {
  try {
    const { buf } = decodeImage(req.body);
    res.json(await store.saveUpload(buf));
  } catch (err) { next(err); }
});

app.get("/api/library", requireAuth, async (req, res, next) => {
  try { res.json({ hotels: await store.searchLibrary(String(req.query.q || "")) }); } catch (err) { next(err); }
});
app.get("/api/library/:key", requireAuth, async (req, res, next) => {
  try {
    const h = await store.getLibraryHotel(String(req.params.key).slice(0, 160));
    if (!h) return res.status(404).json({ error: "Hotel não está na biblioteca." });
    res.json(h);
  } catch (err) { next(err); }
});
app.post("/api/library/report", requireAuth, async (req, res, next) => {
  try {
    const ok = await store.reportLibraryPhoto(String(req.body?.key || ""), String(req.body?.url || ""));
    res.json({ ok });
  } catch (err) { next(err); }
});

function stripMeta(input) {
  const options = (input.options || []).map(({ _meta, ...o }) => o);
  return { ...input, options };
}

app.get("/api/proposals", requireAuth, async (req, res, next) => {
  try { res.json({ proposals: await store.listProposals() }); } catch (err) { next(err); }
});

app.post("/api/proposals", requireAuth, rateLimit({ windowMs: 10 * 60 * 1000, max: 60 }), async (req, res, next) => {
  try {
    const parsed = ProposalInput.safeParse(stripMeta(req.body || {}));
    if (!parsed.success) return res.status(400).json({ error: describeIssues(parsed.error), issues: parsed.error.issues.slice(0, 5) });
    const now = new Date().toISOString();
    const proposal = { id: store.newId(), ...parsed.data, createdAt: now, updatedAt: now, stats: { views: 0, chosenOption: null } };
    await store.saveProposal(proposal);
    for (const o of proposal.options) for (const h of o.hotels) await store.addToLibrary({ name: h.name, city: h.city, photos: h.photos });
    res.status(201).json({ id: proposal.id, url: `${publicUrl(req)}/p/${proposal.id}`, proposal });
  } catch (err) { next(err); }
});

app.put("/api/proposals/:id", requireAuth, rateLimit({ windowMs: 10 * 60 * 1000, max: 120 }), async (req, res, next) => {
  try {
    const existing = await store.getProposal(req.params.id);
    if (!existing) return res.status(404).json({ error: "Orçamento não encontrado." });
    const parsed = ProposalInput.safeParse(stripMeta(req.body || {}));
    if (!parsed.success) return res.status(400).json({ error: describeIssues(parsed.error), issues: parsed.error.issues.slice(0, 5) });
    const proposal = { ...existing, ...parsed.data, id: existing.id, createdAt: existing.createdAt, stats: existing.stats, updatedAt: new Date().toISOString() };
    await store.saveProposal(proposal);
    for (const o of proposal.options) for (const h of o.hotels) await store.addToLibrary({ name: h.name, city: h.city, photos: h.photos });
    res.json({ id: proposal.id, url: `${publicUrl(req)}/p/${proposal.id}`, proposal });
  } catch (err) { next(err); }
});

app.get("/api/proposals/:id", requireAuth, async (req, res, next) => {
  try {
    const p = await store.getProposal(req.params.id);
    if (!p) return res.status(404).json({ error: "Orçamento não encontrado." });
    res.json({ proposal: p, url: `${publicUrl(req)}/p/${p.id}` });
  } catch (err) { next(err); }
});

/* ---------- API pública (o cliente abre pelo link) ---------- */
app.get("/api/public/proposals/:id", rateLimit({ windowMs: 60 * 1000, max: 120 }), async (req, res, next) => {
  try {
    const p = await store.getProposal(req.params.id);
    if (!p) return res.status(404).json({ error: "Orçamento não encontrado." });
    if (req.query.preview !== "1") {
      p.stats = { ...(p.stats || {}), views: (p.stats?.views || 0) + 1, lastViewedAt: new Date().toISOString() };
      store.saveProposal(p).catch(() => {});
    }
    res.json({ proposal: sanitizeForPublic(p) });
  } catch (err) { next(err); }
});

app.post("/api/public/proposals/:id/choose", rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res, next) => {
  try {
    const p = await store.getProposal(req.params.id);
    if (!p) return res.status(404).json({ error: "Orçamento não encontrado." });
    const idx = Number(req.body?.option);
    if (!Number.isInteger(idx) || idx < 0 || idx >= p.options.length) return res.status(400).json({ error: "Opção inválida." });
    p.stats = { ...(p.stats || {}), chosenOption: idx, chosenAt: new Date().toISOString() };
    await store.saveProposal(p);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------- Páginas e arquivos ---------- */
app.get("/uploads/:id", async (req, res, next) => {
  try {
    const img = await store.getUpload(req.params.id);
    if (!img) return res.status(404).send("Foto não encontrada.");
    res.setHeader("Content-Type", img.mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(img.buf);
  } catch (err) { next(err); }
});
app.get("/p/:id", (req, res) => {
  if (!store.isValidId(req.params.id)) return res.status(404).send("Orçamento não encontrado.");
  res.sendFile(path.join(PUBLIC_DIR, "proposta.html"));
});
app.use(express.static(PUBLIC_DIR, { index: "index.html", dotfiles: "deny", extensions: ["html"] }));

/* ---------- Erros ---------- */
app.use((req, res) => res.status(404).json({ error: "Não encontrado." }));
app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || (err.type === "entity.too.large" ? 413 : 500);
  let message = err.message || "Erro.";
  if (err.type === "entity.too.large") message = "Imagem muito grande pra enviar. Tire um print menor ou recorte só a cotação.";
  else if (err.code === "EROFS" || err.code === "EACCES" || err.code === "EPERM") { status = 503; message = "O servidor não consegue gravar arquivos. Na Vercel, crie um Blob store (Storage → Blob), conecte ao projeto e faça o deploy de novo."; }
  else if (/^Blob/.test(err.name || "")) { status = 503; message = `Falha no Vercel Blob: ${err.message}. Confira se o Blob store está conectado ao projeto (Storage → Blob → Projects).`; }
  else if (status >= 500 && IS_PROD) message = `Erro interno no servidor (${err.name || "Error"}). Tente de novo.`;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

export const STARTUP_INFO = `IA: ${aiAvailable() ? "ativa" : "SEM CHAVE (defina ANTHROPIC_API_KEY no .env)"} · Login: ${ATTENDANT_TOKEN ? "exigido" : "aberto"} · Storage: ${store.BACKEND_NAME}`;
export default app;
