// Busca de fotos na internet (tudo em planos gratuitos, sem cartão):
// - Hotel: SerpApi (Google Imagens) — plano grátis de 250 buscas/mês, sem cartão. Buscas repetidas em 1h não contam.
//   (Ainda aceita a Custom Search JSON API do Google pra quem já tinha chave; ela fechou pra contas novas em 2026.)
//   As fotos achadas são de sites de terceiros; o navegador baixa a escolhida via /img/fetch (proxy assinado)
//   e guarda uma cópia nossa (como um upload normal), pra proposta não quebrar se o site original mudar.
// - Destino: Unsplash (ou Pexels) — foto de capa, hotlink direto como as APIs pedem, com crédito do fotógrafo.
import crypto from "node:crypto";
import { sniffImage } from "./store.js";

const SERPAPI_KEY = process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || "";
const SERPAPI_ENDPOINT = process.env.SERPAPI_ENDPOINT || "https://serpapi.com/search.json";
const SEARCH_KEY = process.env.GOOGLE_SEARCH_API_KEY || "";
const SEARCH_CX = process.env.GOOGLE_SEARCH_ENGINE_ID || "";
const SEARCH_ENDPOINT = process.env.GOOGLE_SEARCH_ENDPOINT || "https://www.googleapis.com/customsearch/v1";
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
const PEXELS_KEY = process.env.PEXELS_API_KEY || "";

export const imagesAvailable = () => ({ hotels: Boolean(SERPAPI_KEY || (SEARCH_KEY && SEARCH_CX)), destinations: Boolean(UNSPLASH_KEY || PEXELS_KEY) });

// Cache em memória (vale por instância; na Vercel dura enquanto a função estiver quente).
const cache = new Map();
const TTL = 60 * 60 * 1000;
function remember(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = fn();
  value.catch?.(() => cache.delete(key));
  cache.set(key, { value, exp: Date.now() + TTL });
  if (cache.size > 500) cache.clear();
  return value;
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = body?.error?.message || body?.errors?.[0] || body?.error || `HTTP ${res.status}`;
    throw Object.assign(new Error(String(msg).slice(0, 200)), { status: res.status === 429 ? 429 : 502, upstream: res.status });
  }
  return body;
}

/* ---------- Assinatura das URLs externas (só o que a busca devolveu pode passar pelo proxy) ---------- */
// Segredo estável entre instâncias: SESSION_SECRET se existir, senão derivado da própria chave de busca.
const SIGN_SECRET = crypto.createHash("sha256").update("fredy-img:" + (process.env.SESSION_SECRET || SERPAPI_KEY || SEARCH_KEY || "sem-chave")).digest();
const signUrl = (u) => crypto.createHmac("sha256", SIGN_SECRET).update(u).digest("base64url").slice(0, 32);
export function proxiedUrl(u) {
  return `/img/fetch?u=${encodeURIComponent(u)}&s=${signUrl(u)}`;
}
function verifySignature(u, s) {
  const expected = Buffer.from(signUrl(u));
  const given = Buffer.from(String(s || ""));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/* ---------- Hotel (busca de imagens: SerpApi, ou Custom Search do Google) ---------- */
const BAD_MIME = /gif|svg|bmp|tiff|x-icon/i;
const BAD_EXT = /\.(gif|svg|bmp|tiff?|ico)(\?|$)/i;
/** Prefere fotos grandes e em formato de paisagem/retrato comum; se sobrarem poucas, usa todas. */
function pickGood(list) {
  const good = list.filter((p) => {
    if (!p.w || !p.h) return true;
    return p.w >= 500 && p.h >= 350 && p.w / p.h <= 2.6 && p.h / p.w <= 1.6;
  });
  return (good.length >= 3 ? good : list).slice(0, 10);
}
/** @returns {Promise<{photos:Array<{url,thumb,source,page,w,h}>}>} `url` já é o caminho do proxy. */
export function searchHotelPhotos({ name, city }) {
  if (!SERPAPI_KEY && !(SEARCH_KEY && SEARCH_CX)) throw httpError("Busca de fotos de hotel desligada: defina SERPAPI_API_KEY.", 503);
  const hotel = String(name || "").trim();
  if (!hotel) throw httpError("Informe o nome do hotel.", 400);
  const kind = /hotel|pousada|resort|inn|hostel|flat/i.test(hotel) ? "" : "hotel";
  const q = [`"${hotel}"`, String(city || "").trim(), kind].filter(Boolean).join(" ");
  return remember(`hotel:${q.toLowerCase()}`, () => (SERPAPI_KEY ? serpapiImages(q) : googleCseImages(q)));
}

async function serpapiImages(q) {
  const u = new URL(SERPAPI_ENDPOINT);
  u.search = new URLSearchParams({ engine: "google_images", q, hl: "pt-br", gl: "br", safe: "active", api_key: SERPAPI_KEY }).toString();
  const res = await fetch(u);
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  const err = String(data?.error || "");
  if (!res.ok || err) {
    if (/hasn't returned any results/i.test(err)) return { photos: [] };
    if (res.status === 429 || /run out of searches|plan.*limit|limit.*reached/i.test(err)) {
      throw httpError("A cota grátis de buscas de fotos (SerpApi, 250 por mês) acabou. Suba as fotos manualmente; ela renova no mês que vem.", 429);
    }
    if (res.status === 401 || /invalid api key/i.test(err)) throw httpError("A SerpApi recusou a chave. Confira SERPAPI_API_KEY na Vercel.", 502);
    throw httpError(`A busca de fotos falhou: ${(err || `HTTP ${res.status}`).slice(0, 160)}`, 502);
  }
  const list = (data?.images_results || [])
    .filter((it) => /^https?:\/\//i.test(it.original || "") && !BAD_EXT.test(it.original) && it.thumbnail)
    .map((it) => ({
      link: it.original,
      thumb: it.thumbnail,
      source: String(it.source || "").replace(/^www\./, ""),
      page: it.link || "",
      w: Number(it.original_width) || 0,
      h: Number(it.original_height) || 0,
    }));
  return { photos: pickGood(list).map(({ link, ...p }) => ({ url: proxiedUrl(link), ...p })) };
}

function googleCseImages(q) {
  return (async () => {
    const u = new URL(SEARCH_ENDPOINT);
    u.search = new URLSearchParams({ key: SEARCH_KEY, cx: SEARCH_CX, q, searchType: "image", num: "10", imgType: "photo", safe: "active", hl: "pt-BR", gl: "br" }).toString();
    let data;
    try {
      data = await fetchJson(u);
    } catch (err) {
      if (err.upstream === 403 || err.upstream === 429) throw httpError("A cota gratuita de buscas do Google (100 por dia) acabou por hoje. Suba as fotos manualmente ou tente amanhã.", 429);
      if (err.upstream === 400) throw httpError(`O Google recusou a busca: ${err.message}. Confira GOOGLE_SEARCH_API_KEY e GOOGLE_SEARCH_ENGINE_ID.`, 502);
      throw err;
    }
    const list = (data?.items || [])
      .filter((it) => /^https?:\/\//i.test(it.link || "") && !BAD_MIME.test(it.mime || "") && it.image?.thumbnailLink)
      .map((it) => ({
        link: it.link,
        thumb: it.image.thumbnailLink,
        source: it.displayLink || "",
        page: it.image.contextLink || "",
        w: Number(it.image?.width) || 0,
        h: Number(it.image?.height) || 0,
      }));
    return { photos: pickGood(list).map(({ link, ...p }) => ({ url: proxiedUrl(link), ...p })) };
  })();
}

/* ---------- Proxy de download (uma foto escolhida pelo atendente) ---------- */
const MAX_REMOTE_BYTES = 12 * 1024 * 1024;
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;
function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw httpError("Endereço de foto inválido.", 400); }
  const host = u.hostname;
  if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(host) || IPV4.test(host) || host.includes(":") || host.startsWith("[")) {
    throw httpError("Endereço de foto não permitido.", 400);
  }
  return u;
}
/** Baixa uma foto externa que a busca devolveu (URL assinada). Não guarda nada: quem guarda é o upload normal. */
export async function fetchRemoteImage(rawUrl, signature) {
  if (!verifySignature(String(rawUrl || ""), signature)) throw httpError("Foto não autorizada.", 403);
  let url = assertPublicUrl(rawUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    let res;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = assertPublicUrl(new URL(location, url).href);
        continue;
      }
      break;
    }
    if (!res.ok) throw httpError(`O site da foto não respondeu (HTTP ${res.status}). Tente outra foto.`, 502);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_REMOTE_BYTES) throw httpError("Foto grande demais (mais de 12 MB).", 413);
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > MAX_REMOTE_BYTES) throw httpError("Foto grande demais (mais de 12 MB).", 413);
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    const kind = sniffImage(buf);
    if (!kind) throw httpError("O endereço não devolveu uma imagem (PNG, JPEG ou WEBP). Tente outra foto.", 415);
    return { buf, mime: kind.mime };
  } catch (err) {
    if (err.name === "AbortError") throw httpError("O site da foto demorou demais. Tente outra foto.", 504);
    if (err.status) throw err;
    throw httpError("Não consegui baixar essa foto. Tente outra.", 502);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Destino (Unsplash / Pexels) ---------- */
/** @returns {Promise<Array<{url,thumb,credit,creditLink,source,track}>>} */
export function searchDestinationPhotos({ city, region }) {
  if (!UNSPLASH_KEY && !PEXELS_KEY) throw httpError("Busca de fotos de destino desligada: defina UNSPLASH_ACCESS_KEY ou PEXELS_API_KEY.", 503);
  const c = String(city || "").trim();
  const r = String(region || "").trim();
  if (!c) throw httpError("Informe o destino.", 400);
  return remember(`dest:${c}|${r}`.toLowerCase(), async () => {
    // Cidade + estado/país primeiro (evita "Bonito" virar peixe ou "Natal" virar festa); depois só a cidade, pra ter mais opções.
    const queries = [...new Set([r ? `${c} ${r}` : "", c].filter(Boolean))];
    const seen = new Set();
    const out = [];
    for (const query of queries) {
      const list = UNSPLASH_KEY ? await unsplash(query) : await pexels(query);
      for (const p of list) if (p.url && !seen.has(p.url)) { seen.add(p.url); out.push(p); }
      if (out.length >= 6) break;
    }
    return out.slice(0, 10);
  });
}

/** Consulta o limite de requisições por hora da chave do Unsplash (gasta 1 requisição). */
export async function unsplashRateLimit() {
  if (!UNSPLASH_KEY) throw httpError("UNSPLASH_ACCESS_KEY não configurada.", 503);
  const res = await fetch("https://api.unsplash.com/photos?per_page=1", { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, "Accept-Version": "v1" } });
  return {
    status: res.status,
    limitPerHour: Number(res.headers.get("x-ratelimit-limit")) || null,
    remaining: Number(res.headers.get("x-ratelimit-remaining")) ?? null,
  };
}

async function unsplash(query) {
  const u = new URL("https://api.unsplash.com/search/photos");
  u.search = new URLSearchParams({ query, orientation: "landscape", per_page: "8", content_filter: "high" }).toString();
  const data = await fetchJson(u, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, "Accept-Version": "v1" } });
  return (data?.results || []).map((r) => ({
    url: `${r.urls.raw}&w=1800&q=80&auto=format&fit=max`,
    thumb: r.urls.small,
    alt: String(r.description || r.alt_description || "").slice(0, 160),
    credit: r.user?.name || "",
    creditLink: r.user?.links?.html ? `${r.user.links.html}?utm_source=fredy&utm_medium=referral` : "",
    source: "Unsplash",
    track: r.links?.download_location || "",
  }));
}

async function pexels(query) {
  const u = new URL("https://api.pexels.com/v1/search");
  u.search = new URLSearchParams({ query, orientation: "landscape", per_page: "8", locale: "pt-BR" }).toString();
  const data = await fetchJson(u, { headers: { Authorization: PEXELS_KEY } });
  return (data?.photos || []).map((p) => ({
    url: p.src?.large2x || p.src?.large,
    thumb: p.src?.medium,
    alt: String(p.alt || "").slice(0, 160),
    credit: p.photographer || "",
    creditLink: p.photographer_url || "",
    source: "Pexels",
    track: "",
  }));
}

/** Unsplash pede que a escolha de uma foto dispare o "download" (só telemetria deles). */
export async function trackDownload(track) {
  if (!UNSPLASH_KEY || !/^https:\/\/api\.unsplash\.com\//.test(track || "")) return;
  try { await fetch(track, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, "Accept-Version": "v1" } }); } catch { /* telemetria */ }
}
