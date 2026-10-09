// Gerador de orçamento em 4 passos: print → revisão → valor → revisão final → link.
import { el, esc, icon, api, toast, initTheme, debounce, copyText, normalizeImage, nightsBetween, toBR, parseBR, brToISO, isoToBR, monthName, firstName, plural } from "./ui.js";
import { fmtBRL, parseMoney, computePricing, highlightBlock, paymentLines, highlightSummary, whatsappText, peopleCount } from "./money.js";

/* =========================================================
   Estado
   ========================================================= */
const DEFAULT_NOTES = "• Sujeito a disponibilidade no momento da reserva\n• Não inclui gastos pessoais\n• Inclui taxas de embarque e encargos";
const BOARDS = ["Café da manhã", "Sem refeição", "Meia pensão", "Pensão completa", "All inclusive"];
const AIRLINES = ["Azul", "Gol", "Latam", "Voepass", "TAP", "Copa", "American", "Outra"];

const S = {
  step: 1,
  cur: 0,
  id: null,
  url: "",
  session: { authRequired: false, authed: true, aiAvailable: false, publicUrl: location.origin },
  attendant: loadAttendant(),
  pending: null, // dataURL do print aguardando extração
  extracting: false,
  proposal: blankProposal(),
};
const libCache = new Map();
let activePhotoHotel = null;

function blankLeg() { return { date: "", origin: "", destination: "", departure: "", arrival: "", duration: "", airline: "Azul", connections: [] }; }
function blankHotel(city = "") { return { name: "", city, checkin: "", checkout: "", nights: null, board: "Café da manhã", room: "", photos: [], libraryKey: "" }; }
export function blankOption(label = "Opção 1") {
  return {
    label,
    destination: { city: "", region: "", tagline: "", highlights: [], climate: "", bestSeason: "" },
    flights: { outbound: blankLeg(), inbound: blankLeg(), oneWay: false },
    hotels: [blankHotel()],
    included: { flights: true, hotel: true, transfers: true, insurance: true, tours: [], extras: [] },
    passengers: { rooms: 1, adults: 2, children: 0 },
    pricing: { mode: "total", amount: null, promo: { applied: false, originalAmount: null, percent: null } },
    payment: { card: { enabled: true, installments: 10 }, boleto: { enabled: true, installments: 12 }, pix: { enabled: true }, featured: "auto", entry: { enabled: false, amount: null }, firstBigger: { enabled: false, amount: null }, highlight: "installment" },
    notes: DEFAULT_NOTES,
    _meta: { uncertainties: [] },
  };
}
function blankProposal() {
  const d = new Date(); d.setDate(d.getDate() + 2);
  return { clientName: "", validUntil: toBR(d), attendant: {}, options: [] };
}
function loadAttendant() {
  try { return JSON.parse(localStorage.getItem("fredy-attendant") || "{}"); } catch { return {}; }
}
function saveAttendant() { try { localStorage.setItem("fredy-attendant", JSON.stringify(S.attendant)); } catch {} }

const opt = () => S.proposal.options[S.cur];
const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function set(o, path, v) {
  const ks = path.split("."); let a = o;
  for (const k of ks.slice(0, -1)) { if (a[k] == null) a[k] = /^\d+$/.test(k) ? [] : {}; a = a[k]; }
  a[ks.at(-1)] = v;
}
const op = (sub) => `proposal.options.${S.cur}.${sub}`;

/* =========================================================
   DOM base
   ========================================================= */
const body = document.getElementById("body");
const foot = document.getElementById("foot");
const progress = document.getElementById("progress");
const title = document.getElementById("modalTitle");

initTheme("#themeToggle");
document.getElementById("btnClose").innerHTML = icon("x");
document.getElementById("btnClose").addEventListener("click", () => {
  if (window.parent !== window) window.parent.postMessage({ type: "fredy-orcamento:close" }, "*");
  else if (S.step > 1 && !confirm("Fechar o gerador? O que não foi gerado será perdido.")) return;
  else location.reload();
});
document.getElementById("btnList").addEventListener("click", openList);

document.addEventListener("fredy:auth-required", showLogin);
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("loginError");
  try {
    await api("/api/session", { method: "POST", body: { token: document.getElementById("loginToken").value } });
    document.getElementById("loginOverlay").hidden = true;
    S.session.authed = true;
    err.textContent = "";
  } catch (ex) { err.textContent = ex.message; }
});
function showLogin() { document.getElementById("loginOverlay").hidden = false; setTimeout(() => document.getElementById("loginToken").focus(), 50); }

/* Colar imagem em qualquer lugar da tela */
document.addEventListener("paste", async (e) => {
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
  if (!file) return;
  e.preventDefault();
  if (sheetDrop) { await handlePrintFile(file, sheetDrop); return; }
  if (S.step === 1) { await handlePrintFile(file); return; }
  if (S.step === 2 && activePhotoHotel != null) await addPhotoFiles([file], activePhotoHotel);
});

/* Campos vinculados ao estado: input/change delegados */
const isToggle = (t) => t.type === "checkbox" || t.type === "radio" || t.tagName === "SELECT";
body.addEventListener("input", (e) => { if (!isToggle(e.target)) onFieldInput(e); });
body.addEventListener("change", (e) => { if (isToggle(e.target)) onFieldInput(e); });
function onFieldInput(e) {
  const t = e.target;
  const path = t.dataset.bind;
  if (!path) return;
  let v;
  if (t.type === "checkbox") v = t.checked;
  else if (t.type === "radio") { if (!t.checked) return; v = t.value; }
  else if (t.dataset.type === "int") v = t.value === "" ? 0 : Math.max(0, parseInt(t.value, 10) || 0);
  else if (t.dataset.type === "money") v = parseMoney(t.value);
  else if (t.dataset.type === "intnull") v = t.value === "" ? null : Math.max(0, parseInt(t.value, 10) || 0);
  else if (t.dataset.type === "lines") v = t.value.split("\n").map((s) => s.trim()).filter(Boolean);
  else if (t.dataset.type === "dotlist") v = t.value.split(/\s*[·\n]\s*/).map((s) => s.trim()).filter(Boolean);
  else if (t.dataset.type === "upper") { v = t.value.toUpperCase(); t.value = v; }
  else if (t.dataset.type === "date") { v = maskDate(t.value); t.value = v; }
  else if (t.dataset.type === "time") { v = maskTime(t.value); t.value = v; }
  else if (t.dataset.type === "isodate") v = isoToBR(t.value);
  else v = t.value;
  set(S, path, v);
  afterChange(path, t);
}
function maskDate(v) { const d = v.replace(/\D/g, "").slice(0, 8); return d.replace(/^(\d{2})(\d)/, "$1/$2").replace(/^(\d{2}\/\d{2})(\d)/, "$1/$2"); }
function maskTime(v) { const d = v.replace(/\D/g, "").slice(0, 4); return d.replace(/^(\d{2})(\d)/, "$1:$2"); }

function afterChange(path, t) {
  const m = /hotels\.(\d+)\.(checkin|checkout)$/.exec(path);
  if (m) {
    const h = opt().hotels[m[1]];
    const n = nightsBetween(h.checkin, h.checkout);
    if (n != null) { h.nights = n; const inp = body.querySelector(`[data-bind="${op(`hotels.${m[1]}.nights`)}"]`); if (inp) inp.value = n; }
  }
  if (/flights\.oneWay$/.test(path)) rerenderKeep();
  if (S.step === 3) {
    if (/payment\.(card|boleto|pix)\.enabled$/.test(path) || /payment\.(entry|firstBigger)\.enabled$/.test(path) || /pricing\.mode$/.test(path)) rerenderKeep();
    else refreshPricePreview();
  }
  if (S.step === 4 && /notes$/.test(path)) { syncNotes(t.dataset.prev, t.value); t.dataset.prev = t.value; }
}
function syncNotes(prev, next) {
  if (prev == null) return;
  S.proposal.options.forEach((o, i) => { if (i !== S.cur && o.notes === prev) o.notes = next; });
}

/* =========================================================
   Boot
   ========================================================= */
boot();
async function boot() {
  try {
    S.session = await api("/api/session");
    if (S.session.authRequired && !S.session.authed) showLogin();
  } catch { /* servidor fora: segue, as chamadas vão avisar */ }
  const params = new URLSearchParams(location.search);
  const editId = params.get("edit");
  if (editId) {
    await loadForEdit(editId);
    const st = Number(params.get("step"));
    if (st >= 1 && st <= 5 && S.proposal.options.length) S.step = st;
  }
  renderHeader();
  render();
}

function renderHeader() {
  const who = S.attendant.email || S.attendant.name;
  const node = document.getElementById("creatingAs");
  node.innerHTML = "";
  node.append(who ? `Criando como ${who}` : "Quem está criando? ", el("button", { type: "button", text: who ? "trocar" : "informar", onClick: askAttendant }));
}
function askAttendant() {
  openSheet("Quem está criando o orçamento", (close) => {
    const name = el("input", { class: "input", placeholder: "Seu nome", value: S.attendant.name || "" });
    const email = el("input", { class: "input", type: "email", placeholder: "seu@email.com", value: S.attendant.email || "" });
    const wa = el("input", { class: "input", placeholder: "WhatsApp com DDD (o cliente fala com você por aqui)", value: S.attendant.whatsapp || "" });
    return el("div", { class: "stack" },
      el("p", { class: "hint", text: "Aparece no orçamento como 'Atendimento: nome'. O WhatsApp vira o botão 'Quero essa viagem' na página do cliente." }),
      field("Nome", name), field("E-mail", email), field("WhatsApp", wa),
      el("button", { class: "btn btn-primary btn-block", type: "button", text: "Salvar", onClick: () => {
        S.attendant = { name: name.value.trim(), email: email.value.trim(), whatsapp: wa.value.trim() };
        saveAttendant(); renderHeader(); close();
      } }),
    );
  });
}

/* =========================================================
   Render principal
   ========================================================= */
function render() {
  const scroll = body.scrollTop;
  [...progress.children].forEach((s, i) => { s.className = i + 1 < S.step ? "is-done" : i + 1 === S.step ? "is-current" : ""; });
  title.textContent = S.id ? "Editar orçamento" : "Novo orçamento";
  body.innerHTML = ""; foot.innerHTML = "";
  if (S.extracting) {
    body.append(el("div", { class: "extracting" }, el("div", { class: "spinner" }), el("b", { text: "Lendo o print com IA…" }), el("span", { text: "Voos, hotel, passageiros e valores. Leva uns segundos." })));
    return;
  }
  ({ 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4, 5: renderResult })[S.step]();
  body.scrollTop = S._keepScroll ? scroll : 0;
  S._keepScroll = false;
}
function rerenderKeep() { S._keepScroll = true; render(); }
function go(step) { S.step = step; activePhotoHotel = null; render(); }

/* ---------- Componentes ---------- */
function field(label, input, hint) {
  return el("div", { class: "field" }, label ? el("label", { text: label }) : null, input, hint ? el("div", { class: "hint", text: hint }) : null);
}
function inp(path, { type = "text", placeholder = "", dtype, cls = "input", attrs = {} } = {}) {
  const v = get(S, path);
  const node = el("input", { class: cls, type, placeholder, "data-bind": path, "data-type": dtype, ...attrs });
  if (dtype === "money") node.value = v == null ? "" : fmtBRL(v);
  else if (dtype === "lines") node.value = (v || []).join("\n");
  else if (dtype === "isodate") node.value = brToISO(v);
  else node.value = v ?? "";
  if (dtype === "money") node.addEventListener("blur", () => { const n = parseMoney(node.value); node.value = n == null ? "" : fmtBRL(n); });
  return node;
}
function textarea(path, { placeholder = "", dtype, rows } = {}) {
  const v = get(S, path);
  const node = el("textarea", { class: "textarea", placeholder, "data-bind": path, "data-type": dtype, rows });
  node.value = dtype === "lines" ? (v || []).join("\n") : dtype === "dotlist" ? (v || []).join(" · ") : v ?? "";
  if (/notes$/.test(path)) node.dataset.prev = node.value;
  return node;
}
function select(path, options, { allowOther = true } = {}) {
  const v = get(S, path) ?? "";
  const list = [...options];
  if (allowOther && v && !list.includes(v)) list.unshift(v);
  return el("select", { class: "select", "data-bind": path }, list.map((o) => el("option", { value: o, selected: o === v, text: o })));
}
function check(path, label) {
  return el("label", { class: "check" }, el("input", { type: "checkbox", "data-bind": path, checked: Boolean(get(S, path)) }), el("span", { text: label }));
}
function radio(path, value, label) {
  return el("label", { class: "radio" }, el("input", { type: "radio", name: path, value, "data-bind": path, checked: get(S, path) === value }), el("span", { text: label }));
}
function sec(titleText, ic, bodyNodes, actions) {
  return el("section", { class: "sec" },
    el("div", { class: "sec-head" }, el("h3", { html: `${icon(ic)}<span>${esc(titleText)}</span>` }), actions || null),
    ...[bodyNodes].flat(),
  );
}
function stepTitle(text, help) {
  return el("div", { class: "step-title" }, el("span", { text }), help ? el("span", { class: "help", text: "?", title: help }) : null);
}

/* =========================================================
   Passo 1 — print
   ========================================================= */
function renderStep1() {
  const ai = S.session.aiAvailable;
  const wrap = el("div", {});
  wrap.append(stepTitle("1. Cole ou envie o print da cotação", "Tire um print da cotação no sistema (FRT, Azul Viagens etc.) e cole aqui com Ctrl+V. A IA lê voos, hotel, passageiros e valor."));

  if (!ai) wrap.append(el("div", { class: "banner banner-warn", html: `${icon("warn")}<span>A leitura por IA está desligada neste servidor (falta a chave ANTHROPIC_API_KEY no .env). Você ainda pode preencher manualmente.</span>` }));
  if (S.session.storageEphemeral) wrap.append(el("div", { class: "banner banner-warn", html: `${icon("warn")}<span><b>Sem storage configurado na Vercel.</b> Os orçamentos gerados somem a cada deploy e os links podem parar de abrir. Crie um Blob store (Storage → Blob) e conecte ao projeto.</span>` }));

  if (S.pending) {
    wrap.append(
      el("div", { class: "preview-img" }, el("img", { src: S.pending, alt: "Print da cotação" })),
      el("div", { class: "row", style: { marginTop: "14px", justifyContent: "flex-end" } },
        el("button", { class: "btn", type: "button", text: "Trocar imagem", onClick: () => { S.pending = null; render(); } }),
        el("button", { class: "btn btn-primary", type: "button", html: `${icon("wand")} Extrair dados com IA`, disabled: !ai, onClick: () => runExtraction(S.pending, `Opção ${S.proposal.options.length + 1}`, { asNewOption: S.proposal.options.length > 0 }) }),
      ),
    );
  } else {
    wrap.append(dropzone({ onFile: (f) => handlePrintFile(f) }));
  }
  const has = S.proposal.options.length;
  wrap.append(
    el("div", { class: "or", text: "ou" }),
    has
      ? el("button", { class: "btn btn-block btn-soft", type: "button", html: `Continuar com ${plural(has, "a opção já preenchida", "as opções já preenchidas")} ${icon("arrowR")}`, onClick: () => go(2) })
      : el("button", { class: "btn btn-block", type: "button", html: `${icon("edit")} Preencher manualmente (sem print)`, onClick: () => { S.proposal.options.push(blankOption("Opção 1")); S.cur = 0; go(2); } }),
    el("p", { class: "hint", style: { textAlign: "center", marginTop: "8px" }, text: has ? "Um print novo aqui vira mais uma opção no mesmo link." : "Monte o orçamento do zero: voos, hotéis, valores e pagamento — tudo na mão." }),
  );
  body.append(wrap);
}

function dropzone({ onFile, compact = false }) {
  const z = el("div", { class: "dropzone" },
    el("div", { class: "ico-big", html: icon("upload") }),
    el("h3", { text: compact ? "Cole, arraste ou clique" : "Clique para enviar ou arraste uma imagem" }),
    el("p", { text: "Também dá pra colar com Ctrl+V em qualquer lugar desta tela" }),
    el("div", { class: "formats", text: "Formatos aceitos: PNG, JPEG, WEBP · imagens grandes são comprimidas sozinhas" }),
    el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", onChange: (e) => { const f = e.target.files?.[0]; if (f) onFile(f); } }),
  );
  z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("is-over"); });
  z.addEventListener("dragleave", () => z.classList.remove("is-over"));
  z.addEventListener("drop", (e) => { e.preventDefault(); z.classList.remove("is-over"); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); });
  return z;
}

async function handlePrintFile(file, target) {
  if (!file.type.startsWith("image/")) return toast("Envie uma imagem (PNG, JPEG ou WEBP).", "error");
  try {
    const dataUrl = await normalizeImage(file, { maxPx: 2200, maxBytes: 3 * 1024 * 1024, keepPng: true });
    if (target) target.onPrint(dataUrl);
    else { S.pending = dataUrl; render(); }
  } catch { toast("Não consegui ler essa imagem.", "error"); }
}

async function runExtraction(dataUrl, label = "Opção 1", { asNewOption = false } = {}) {
  S.extracting = true; render();
  try {
    const { option } = await api("/api/extract", { method: "POST", body: { image: dataUrl, label } });
    option.notes = DEFAULT_NOTES;
    if (!option.hotels.length) option.hotels = [blankHotel(option.destination.city)];
    if (!option.flights.outbound.airline) option.flights.outbound.airline = "Azul";
    if (!option.flights.inbound.airline) option.flights.inbound.airline = "Azul";
    S.proposal.options.push(option);
    S.cur = S.proposal.options.length - 1;
    if (!S.proposal.clientName && option._meta?.clientName) S.proposal.clientName = option._meta.clientName;
    S.pending = null; S.extracting = false;
    await hydrateLibrary(option);
    go(2);
    toast(asNewOption ? `${label} adicionada a partir do print.` : "Dados extraídos! Confira tudo antes de seguir.", "success");
  } catch (err) {
    S.extracting = false; render();
    toast(err.message || "Falha ao extrair. Tente outro print.", "error");
  }
}

/** Liga hotéis extraídos à biblioteca de fotos, se já existirem lá. */
async function hydrateLibrary(option) {
  for (const h of option.hotels) {
    if (!h.name) continue;
    try {
      const { hotels } = await api(`/api/library?q=${encodeURIComponent(h.name)}`);
      const hit = hotels.find((x) => x.name.toLowerCase() === h.name.toLowerCase()) || (hotels.length === 1 ? hotels[0] : null);
      if (hit) { h.libraryKey = hit.key; libCache.set(hit.key, hit); }
    } catch { /* biblioteca indisponível: segue sem */ }
  }
}

/* =========================================================
   Abas de opções (passos 2, 3 e 4)
   ========================================================= */
function optionsBar() {
  const tabs = el("div", { class: "option-tabs" });
  S.proposal.options.forEach((o, i) => {
    const t = el("button", { type: "button", class: `option-tab ${i === S.cur ? "is-active" : ""}`, onClick: () => { S.cur = i; render(); } },
      el("span", { text: o.label || `Opção ${i + 1}` }),
      S.proposal.options.length > 1 ? el("span", { class: "rm", html: icon("x"), title: "Remover opção", onClick: (e) => { e.stopPropagation(); removeOption(i); } }) : null,
    );
    tabs.append(t);
  });
  tabs.append(el("button", { type: "button", class: "option-tab add-option", html: `${icon("plus")} Adicionar opção (colar print)`, onClick: openAddOption }));
  return el("div", { class: "options-bar" },
    el("h4", { text: "Opções (1 link, vários orçamentos)" }),
    el("p", { text: "Cada opção é um orçamento completo (voo, hotel, valor). O cliente compara e escolhe no link." }),
    tabs,
  );
}
function removeOption(i) {
  if (!confirm(`Remover a ${S.proposal.options[i].label}?`)) return;
  S.proposal.options.splice(i, 1);
  S.proposal.options.forEach((o, k) => { o.label = `Opção ${k + 1}`; });
  S.cur = Math.min(S.cur, S.proposal.options.length - 1);
  render();
}
let sheetDrop = null;
function openAddOption() {
  const label = `Opção ${S.proposal.options.length + 1}`;
  openSheet(`Adicionar ${label}`, (close) => {
    sheetDrop = { onPrint: (dataUrl) => { close(); runExtraction(dataUrl, label, { asNewOption: true }); } };
    return el("div", { class: "stack" },
      el("p", { class: "hint", text: "Cole o print da outra cotação (outro hotel, outra data, outro valor). A IA preenche e você revisa." }),
      S.session.aiAvailable ? dropzone({ compact: true, onFile: (f) => handlePrintFile(f, sheetDrop) }) : el("div", { class: "banner banner-warn", html: `${icon("warn")}<span>IA desligada neste servidor. Use as opções abaixo.</span>` }),
      el("div", { class: "or", text: "ou" }),
      el("div", { class: "grid g2" },
        el("button", { class: "btn", type: "button", text: "Duplicar opção atual", onClick: () => {
          const copy = JSON.parse(JSON.stringify(opt())); copy.label = label; copy._meta = { uncertainties: [] };
          S.proposal.options.push(copy); S.cur = S.proposal.options.length - 1; close(); render();
        } }),
        el("button", { class: "btn", type: "button", text: "Opção em branco", onClick: () => {
          const o = blankOption(label); o.destination.city = opt().destination.city; o.passengers = { ...opt().passengers };
          S.proposal.options.push(o); S.cur = S.proposal.options.length - 1; close(); render();
        } }),
      ),
    );
  }, () => { sheetDrop = null; });
}

/* =========================================================
   Passo 2 — revisão dos dados
   ========================================================= */
function renderStep2() {
  const o = opt();
  const wrap = el("div", {});
  wrap.append(stepTitle("2. Revise os dados extraídos", "Confira cada campo com o print. O que a IA não achou fica em branco."), optionsBar());

  const unc = o._meta?.uncertainties || [];
  if (unc.length) wrap.append(el("div", { class: "banner banner-warn" }, el("span", { html: icon("warn") }), el("div", {}, el("b", { text: "A IA ficou em dúvida em:" }), el("ul", {}, unc.map((u) => el("li", { text: u }))))));

  /* Destino */
  const cityInput = inp(op("destination.city"), { placeholder: "Ex: Maceió" });
  cityInput.addEventListener("blur", () => { if (o.destination.city && !o.destination.tagline) fetchEditorial(0); });
  wrap.append(sec("Destino", "pin", [field("Cidade destino", cityInput)]));

  /* Editorial */
  const edBtn = el("button", { class: "btn btn-sm btn-soft", type: "button", html: `${icon("refresh")} Outra variação`, onClick: () => fetchEditorial((o._meta?.variant ?? 0) + 1) });
  wrap.append(sec("Editorial do destino (aparece no topo do link)", "spark", [
    el("p", { class: "sec-desc", text: "Estes 4 campos aparecem no topo da proposta. Preenchemos automaticamente com base no destino e no mês da viagem — se sobrou vazio, é porque o dicionário não tinha info ou a época contradizia a venda (ex: melhor época 'Set a Mar' e cliente viajando em maio). Deixe vazio pra sumir ou escreva o que quiser." }),
    edBtn,
    field("Tagline (subtítulo embaixo do nome do destino)", inp(op("destination.tagline"), { placeholder: "Ex: O Caribe brasileiro: piscinas naturais e praias de tirar o fôlego" })),
    field("Destaques (texto livre — aparece como bullet, separe com ·)", textarea(op("destination.highlights"), { dtype: "dotlist", placeholder: "Praia do Gunga e Barra de São Miguel · Praias de Pajuçara e Jatiúca no centro", rows: 2 })),
    el("div", { class: "grid g2" },
      field("Clima", inp(op("destination.climate"), { placeholder: "Tropical, média 27 graus" })),
      field("Melhor época (deixe vazio se contradiz a data da viagem)", inp(op("destination.bestSeason"), { placeholder: "Ex: Setembro a março" })),
    ),
  ]));

  /* Voos */
  wrap.append(sec("Voo de ida", "plane", legFields("flights.outbound")));
  wrap.append(sec("Voo de volta", "plane", [
    check(op("flights.oneWay"), "Somente ida (sem voo de volta)"),
    o.flights.oneWay ? null : el("div", { style: { marginTop: "12px" } }, legFields("flights.inbound")),
  ]));

  /* Hospedagem */
  const hotelsSec = sec("Hospedagem", "bed", [
    ...o.hotels.map((h, i) => hotelBlock(h, i)),
    el("p", { class: "inline-note", style: { marginTop: "12px" }, text: "Use só pra pacote multi-cidade — uns dias numa cidade e outros em outra, com um preço só. Pra dar opções de escolha ao cliente (comparar hotéis/preços), use o '+ Adicionar opção' no topo." }),
    el("button", { class: "btn btn-block btn-soft", type: "button", style: { marginTop: "8px" }, html: `${icon("plus")} Adicionar hotel de outra cidade`, onClick: () => { o.hotels.push(blankHotel()); rerenderKeep(); } }),
  ]);
  wrap.append(hotelsSec);

  /* Incluso */
  wrap.append(sec("O que está incluso", "check", [
    el("div", { class: "grid g2" },
      check(op("included.flights"), "Aéreo ida e volta"), check(op("included.hotel"), "Hospedagem"),
      check(op("included.transfers"), "Traslados aeroporto/hotel"), check(op("included.insurance"), "Seguro viagem"),
    ),
    field("Passeios (um por linha)", textarea(op("included.tours"), { dtype: "lines", placeholder: "City Tour e Litoral Sul", rows: 2 })),
    field("Outros serviços inclusos (um por linha)", textarea(op("included.extras"), { dtype: "lines", placeholder: "Serviço Assento Azul Juntos\nBagagem despachada 23kg", rows: 2 })),
  ]));

  /* Passageiros */
  wrap.append(sec("Passageiros", "users", [
    el("div", { class: "grid g3" },
      field("Quartos", inp(op("passengers.rooms"), { type: "number", dtype: "int", attrs: { min: 0 } })),
      field("Adultos", inp(op("passengers.adults"), { type: "number", dtype: "int", attrs: { min: 0 } })),
      field("Crianças", inp(op("passengers.children"), { type: "number", dtype: "int", attrs: { min: 0 } })),
    ),
  ]));

  body.append(wrap);
  foot.append(
    el("button", { class: "btn", type: "button", html: `${icon("arrowL")} Voltar`, onClick: () => go(1) }),
    el("button", { class: "btn btn-primary", type: "button", html: `Continuar ${icon("arrowR")}`, onClick: () => { if (validateStep2()) go(3); } }),
  );
}

function legFields(base) {
  const leg = get(S, op(base));
  const conns = el("div", {}, leg.connections.map((c, i) => el("div", { class: "conn-row" },
    field("Aeroporto", inp(op(`${base}.connections.${i}.airport`), { dtype: "upper", placeholder: "REC", attrs: { maxlength: 4 } })),
    field("Chegada", inp(op(`${base}.connections.${i}.arrival`), { dtype: "time", placeholder: "10:55" })),
    field("Partida", inp(op(`${base}.connections.${i}.departure`), { dtype: "time", placeholder: "17:50" })),
    el("button", { class: "conn-rm", type: "button", html: icon("x"), title: "Remover conexão", onClick: () => { leg.connections.splice(i, 1); rerenderKeep(); } }),
  )));
  return [
    el("div", { class: "grid g3" },
      field("Data", inp(op(`${base}.date`), { dtype: "date", placeholder: "DD/MM/AAAA" })),
      field("Origem", inp(op(`${base}.origin`), { dtype: "upper", placeholder: "CWB", attrs: { maxlength: 4 } })),
      field("Destino final", inp(op(`${base}.destination`), { dtype: "upper", placeholder: "MCZ", attrs: { maxlength: 4 } })),
    ),
    el("div", { class: "grid g3" },
      field("Duração total", inp(op(`${base}.duration`), { placeholder: "5h 45m" })),
      field("Partida", inp(op(`${base}.departure`), { dtype: "time", placeholder: "05:25" })),
      field("Chegada", inp(op(`${base}.arrival`), { dtype: "time", placeholder: "11:10" })),
    ),
    el("div", { class: "grid g2" }, field("Cia aérea", select(op(`${base}.airline`), AIRLINES))),
    el("div", { class: "sub-label", text: "Conexões" }),
    conns,
    el("button", { class: "btn btn-sm", type: "button", style: { marginTop: "8px" }, html: `${icon("plus")} Adicionar conexão`, onClick: () => { leg.connections.push({ airport: "", arrival: "", departure: "" }); rerenderKeep(); } }),
  ];
}

function hotelBlock(h, i) {
  const o = opt();
  const base = `hotels.${i}`;
  const nameInput = inp(op(`${base}.name`), { placeholder: "Nome do hotel" });
  const ac = el("div", { class: "autocomplete" }, nameInput);
  const search = debounce(async () => {
    const q = nameInput.value.trim();
    ac.querySelector(".ac-list")?.remove();
    if (q.length < 3) return;
    try {
      const { hotels } = await api(`/api/library?q=${encodeURIComponent(q)}`);
      if (!hotels.length || document.activeElement !== nameInput) return;
      const list = el("div", { class: "ac-list" }, el("div", { class: "ac-title", text: "Já na biblioteca — escolha pra puxar as fotos" }),
        hotels.map((x) => el("div", { class: "ac-item", onMousedown: (e) => { e.preventDefault(); pickLibrary(h, x); } },
          el("span", { html: `<b>${esc(x.name)}</b><span class="ac-city">${esc(x.city)}</span>` }), el("span", { class: "ac-n", text: plural(x.photos.length, "foto", "fotos") }))));
      ac.append(list);
    } catch { /* sem biblioteca */ }
  }, 280);
  nameInput.addEventListener("input", search);
  nameInput.addEventListener("blur", () => setTimeout(() => ac.querySelector(".ac-list")?.remove(), 120));

  const lib = h.libraryKey ? libCache.get(h.libraryKey) : null;
  if (h.libraryKey && !lib) loadLibrary(h.libraryKey).then(() => rerenderKeep());

  const selected = el("div", { class: "photo-grid" }, h.photos.map((url, k) => el("div", { class: "photo", title: "A primeira foto vira a capa da proposta · clique no X pra tirar" },
    el("img", { src: url, alt: "" }),
    el("button", { class: "pbtn", type: "button", html: icon("x"), title: "Tirar do orçamento", onClick: () => { h.photos.splice(k, 1); rerenderKeep(); } }),
  )));

  const drop = el("div", { class: "photo-drop" },
    el("span", { html: `${icon("image")} Cole, arraste ou clique pra adicionar foto (${h.photos.length}/8)` }),
    el("input", { type: "file", multiple: true, accept: "image/png,image/jpeg,image/webp", onChange: (e) => addPhotoFiles([...e.target.files], i) }),
  );
  drop.addEventListener("click", () => { activePhotoHotel = i; body.querySelectorAll(".photo-drop.is-active").forEach((d) => d.classList.remove("is-active")); drop.classList.add("is-active"); });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); addPhotoFiles([...e.dataTransfer.files], i); });
  if (activePhotoHotel === i) drop.classList.add("is-active");

  const libGrid = lib && lib.photos.length ? el("div", {},
    el("div", { class: "lib-title", html: `${icon("image")} Fotos da biblioteca pra este hotel` }),
    el("div", { class: "lib-hint", text: "Clique numa foto pra usar no orçamento. Viu uma foto errada? Toque na bandeira pra reportar — ela some da biblioteca." }),
    el("div", { class: "photo-grid" }, lib.photos.map((url) => el("div", { class: `photo ${h.photos.includes(url) ? "is-selected" : ""}`, onClick: () => togglePhoto(h, url) },
      el("img", { src: url, alt: "", loading: "lazy" }),
      el("button", { class: "pbtn flag", type: "button", html: icon("flag"), title: "Reportar foto errada", onClick: (e) => { e.stopPropagation(); reportPhoto(h, url); } }),
    ))),
  ) : null;

  return el("div", { class: "hotel-block" },
    el("div", { class: "hotel-block-head" },
      el("span", { text: o.hotels.length > 1 ? `Hotel ${i + 1}` : "Hotel" }),
      o.hotels.length > 1 ? el("button", { class: "btn btn-sm btn-danger", type: "button", html: `${icon("trash")} Remover`, onClick: () => { o.hotels.splice(i, 1); rerenderKeep(); } }) : null,
    ),
    field("Nome do hotel", ac),
    el("div", { class: "grid g2" },
      field("Cidade", inp(op(`${base}.city`), { placeholder: "Maceió" })),
      field("Regime", select(op(`${base}.board`), BOARDS)),
    ),
    el("div", { class: "grid g3" },
      field("Check-in", inp(op(`${base}.checkin`), { dtype: "date", placeholder: "DD/MM/AAAA" })),
      field("Check-out", inp(op(`${base}.checkout`), { dtype: "date", placeholder: "DD/MM/AAAA" })),
      field("Noites", inp(op(`${base}.nights`), { type: "number", dtype: "intnull", attrs: { min: 0 } })),
    ),
    field("Tipo de quarto (opcional)", inp(op(`${base}.room`), { placeholder: "Ex: Apartamento Superior vista mar" })),
    el("div", { class: "sub-label", text: "Fotos do hotel (opcional)" }),
    el("p", { class: "hint", text: "Cole até 8 fotos (Ctrl+V), arraste da área de trabalho ou clique pra selecionar. Dica: copie direto do site do hotel com botão direito → 'Copiar imagem'." }),
    libGrid,
    h.photos.length ? el("div", { class: "lib-title", style: { color: "var(--muted)" }, html: `${icon("check")} No orçamento` }) : null,
    h.photos.length ? selected : null,
    drop,
  );
}

async function loadLibrary(key) {
  try { const h = await api(`/api/library/${encodeURIComponent(key)}`); libCache.set(key, h); } catch { libCache.set(key, { photos: [] }); }
}
async function pickLibrary(h, lib) {
  h.name = lib.name; if (!h.city) h.city = lib.city; h.libraryKey = lib.key;
  libCache.set(lib.key, lib);
  rerenderKeep();
}
function togglePhoto(h, url) {
  const k = h.photos.indexOf(url);
  if (k >= 0) h.photos.splice(k, 1);
  else if (h.photos.length >= 8) return toast("Máximo de 8 fotos por hotel.", "error");
  else h.photos.push(url);
  rerenderKeep();
}
async function reportPhoto(h, url) {
  if (!confirm("Reportar esta foto como errada? Ela some da biblioteca deste hotel.")) return;
  try {
    await api("/api/library/report", { method: "POST", body: { key: h.libraryKey, url } });
    const lib = libCache.get(h.libraryKey); if (lib) lib.photos = lib.photos.filter((p) => p !== url);
    const k = h.photos.indexOf(url); if (k >= 0) h.photos.splice(k, 1);
    rerenderKeep(); toast("Foto reportada. Obrigado!", "success");
  } catch (err) { toast(err.message, "error"); }
}
async function addPhotoFiles(files, hotelIdx) {
  const h = opt().hotels[hotelIdx];
  if (!h) return;
  const imgs = files.filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) return;
  if (h.photos.length + imgs.length > 8) toast("Máximo de 8 fotos por hotel — vou adicionar só até completar.", "error");
  for (const f of imgs.slice(0, 8 - h.photos.length)) {
    try {
      const dataUrl = await normalizeImage(f, { maxPx: 1600, maxBytes: 1.2 * 1024 * 1024 });
      const { url } = await api("/api/uploads", { method: "POST", body: { image: dataUrl } });
      h.photos.push(url);
    } catch (err) { toast(err.message || "Falha ao enviar foto.", "error"); }
  }
  activePhotoHotel = hotelIdx;
  rerenderKeep();
}

async function fetchEditorial(variant) {
  const o = opt();
  if (!o.destination.city) return toast("Informe a cidade primeiro.", "error");
  const dt = parseBR(o.flights.outbound.date) || parseBR(o.hotels[0]?.checkin);
  const month = dt ? dt.getMonth() + 1 : "";
  try {
    const ed = await api(`/api/editorial?city=${encodeURIComponent(o.destination.city)}&month=${month}&variant=${variant}&avoid=${encodeURIComponent(o.destination.tagline || "")}`);
    if (ed.source === "none") return toast("Sem editorial pronto pra esse destino e a IA está desligada. Escreva o seu.", "error");
    Object.assign(o.destination, { tagline: ed.tagline, highlights: ed.highlights, climate: ed.climate, bestSeason: ed.bestSeason });
    o._meta ??= {}; o._meta.variant = ed.variant;
    rerenderKeep();
  } catch (err) { toast(err.message, "error"); }
}

function validateStep2() {
  const o = opt();
  if (!o.destination.city.trim()) { toast("Informe a cidade de destino.", "error"); return false; }
  return true;
}

/* =========================================================
   Passo 3 — valor e desconto
   ========================================================= */
function renderStep3() {
  const o = opt();
  const wrap = el("div", {});
  wrap.append(stepTitle("3. Valor e desconto"), optionsBar());

  const breakdown = o._meta?.breakdown?.length ? el("div", { class: "banner banner-info" }, el("span", { html: icon("info") }), el("div", {}, el("b", { text: "No print:" }), el("ul", {}, o._meta.breakdown.map((b) => el("li", { text: `${b.label}: ${fmtBRL(b.value)}` }))))) : null;

  const perPerson = o.pricing.mode === "perPerson";
  const promo = o.pricing.promo.applied;
  const people = peopleCount(o);
  const unit = perPerson ? "por pessoa" : "total";

  const valueSec = sec("Valor do pacote", "money", [
    breakdown,
    el("div", { class: "row", style: { gap: "16px" } }, el("span", { class: "label", text: "O valor é total ou por pessoa?" }), radio(op("pricing.mode"), "total", "Valor total"), radio(op("pricing.mode"), "perPerson", "Por pessoa")),
    el("div", { class: "row", style: { gap: "16px", marginTop: "12px" } }, el("span", { class: "label", text: "Aplicou promocode?" }), radio(op("pricing.promo.applied"), "no", "Não"), radio(op("pricing.promo.applied"), "yes", "Sim")),
    promo ? el("div", { class: "stack", style: { marginTop: "12px" } },
      field(`Valor original ${unit} — sem desconto (R$)`, inp(op("pricing.promo.originalAmount"), { dtype: "money", placeholder: "R$ 0,00" })),
      field("Percentual de desconto (%)", inp(op("pricing.promo.percent"), { type: "number", dtype: "intnull", attrs: { min: 0, max: 100 } }), "Só pra exibir no orçamento (não calcula automaticamente)."),
      field(`Valor ${unit} com desconto — final (R$)`, inp(op("pricing.amount"), { dtype: "money", cls: "input is-big", placeholder: "R$ 0,00" }), `Total pra ${plural(people, "pessoa", "pessoas")} aparece na prévia abaixo.`),
    ) : field(`Valor ${unit} (R$)`, inp(op("pricing.amount"), { dtype: "money", cls: "input is-big", placeholder: "R$ 0,00" })),
    el("div", { id: "discountCard" }),
  ]);
  // radios de promo usam yes/no → converte pra boolean
  valueSec.querySelectorAll(`[name="${op("pricing.promo.applied")}"]`).forEach((r) => { r.checked = (r.value === "yes") === promo; r.removeAttribute("data-bind"); r.addEventListener("change", () => { o.pricing.promo.applied = r.value === "yes"; rerenderKeep(); }); });
  wrap.append(valueSec);

  const payIco = (n) => `<span class="pay-ico">${icon(n)}</span>`;
  const instSel = (path) => { const s = select(path, Array.from({ length: 24 }, (_, i) => String(i + 1)), { allowOther: false }); s.querySelectorAll("option").forEach((x) => { x.textContent = `${x.value}×`; x.selected = Number(x.value) === get(S, path); }); s.addEventListener("change", () => { set(S, path, Number(s.value)); refreshPricePreview(); }); s.removeAttribute("data-bind"); return s; };

  wrap.append(sec("Forma de pagamento", "card", [
    el("p", { class: "sec-desc", text: "Marque as formas que o cliente pode usar e escolha as parcelas. O texto do orçamento é montado sozinho." }),
    el("div", { class: "pay-row" }, el("span", { html: payIco("card") }), check(op("payment.card.enabled"), "Cartão de crédito"), o.payment.card.enabled ? instSel(op("payment.card.installments")) : null, o.payment.card.enabled ? el("span", { class: "small muted", text: "sem juros" }) : null),
    el("div", { class: "pay-row" }, el("span", { html: payIco("doc") }), check(op("payment.boleto.enabled"), "Boleto bancário"), o.payment.boleto.enabled ? instSel(op("payment.boleto.installments")) : null, o.payment.boleto.enabled ? el("span", { class: "small muted", text: "sem juros" }) : null),
    el("div", { class: "pay-row" }, el("span", { html: payIco("spark") }), check(op("payment.pix.enabled"), "À vista no PIX")),
    el("div", { class: "row", style: { marginTop: "12px" } }, el("span", { class: "label", text: "Qual aparece em destaque?" }), segmented(op("payment.featured"), [["auto", "Automático"], ["card", "Cartão"], ["boleto", "Boleto"]])),
    el("p", { class: "hint", text: "Automático = o maior parcelamento (menor parcela). Vale quando o destaque do valor é a parcela." }),
    el("div", { class: "toggle-block", style: { marginTop: "12px" } },
      check(op("payment.entry.enabled"), "Cobrar uma entrada e parcelar o restante"),
      el("p", { class: "hint", text: "A entrada é cobrada à parte e o sistema parcela só o que sobra nas parcelas escolhidas acima. Funciona quando o destaque é a parcela." }),
      o.payment.entry.enabled ? field(`Entrada (R$ ${unit})`, inp(op("payment.entry.amount"), { dtype: "money", placeholder: "R$ 0,00" })) : null,
    ),
    el("div", { class: "toggle-block" },
      check(op("payment.firstBigger.enabled"), "1ª parcela maior que as demais"),
      el("p", { class: "hint", text: "Comum no aéreo: a 1ª parcela é maior e o restante se divide nas parcelas seguintes. Funciona quando o destaque é a parcela (2× ou mais)." }),
      o.payment.firstBigger.enabled ? field(`1ª parcela (R$ ${unit})`, inp(op("payment.firstBigger.amount"), { dtype: "money", placeholder: "R$ 0,00" })) : null,
    ),
  ]));

  wrap.append(sec("Como destacar o valor", "star", [
    el("p", { class: "sec-desc", text: "Escolha qual número aparece grande no orçamento (link, PDF e WhatsApp)." }),
    el("div", { class: "choice-grid" }, [["installment", "Parcela", "Nx em destaque · total embaixo"], ["perPerson", "Por pessoa", "Valor por pessoa em destaque"], ["total", "Valor total", "Valor cheio em destaque"]].map(([v, b, s]) =>
      el("div", { class: `choice ${o.payment.highlight === v ? "is-active" : ""}`, onClick: () => { o.payment.highlight = v; rerenderKeep(); } }, el("b", { text: b }), el("span", { text: s })))),
    el("div", { class: "sub-label", text: "Prévia de como o cliente vê" }),
    el("div", { id: "pricePreview" }),
  ]));

  body.append(wrap);
  refreshPricePreview();
  foot.append(
    el("button", { class: "btn", type: "button", html: `${icon("arrowL")} Voltar`, onClick: () => go(2) }),
    el("button", { class: "btn btn-primary", type: "button", html: `Continuar ${icon("arrowR")}`, onClick: () => { if (validateStep3()) go(4); } }),
  );
}
function segmented(path, items) {
  const s = el("div", { class: "seg" });
  const cur = get(S, path);
  for (const [v, label] of items) s.append(el("button", { type: "button", class: cur === v ? "is-active" : "", text: label, onClick: () => { set(S, path, v); rerenderKeep(); } }));
  return s;
}
function refreshPricePreview() {
  const o = opt();
  const host = document.getElementById("pricePreview");
  if (host) {
    const h = highlightBlock(o);
    host.innerHTML = "";
    host.append(el("div", { class: "price-preview" },
      el("div", { class: "price-kicker", text: h.kicker }),
      el("div", { class: "price-big" }, h.prefix ? el("span", { class: "prefix", text: h.prefix }) : null, el("span", { class: "big", text: h.big }), h.suffix ? el("span", { class: "suffix", text: h.suffix }) : null),
      el("ul", {}, h.subs.map((s) => el("li", { text: s }))),
      h.others.length ? el("div", { class: "others" }, el("h5", { text: h.othersTitle }), el("ul", {}, h.others.map((l) => el("li", { text: l.text })))) : null,
    ));
  }
  const dc = document.getElementById("discountCard");
  if (dc) {
    const pr = computePricing(o);
    dc.innerHTML = "";
    if (pr.total > 0) dc.append(el("div", { class: "discount-card" },
      pr.applied && pr.originalTotal > pr.total ? el("div", {}, el("s", { text: `De: ${fmtBRL(pr.originalTotal)}` })) : null,
      el("div", { class: "final", text: fmtBRL(pr.total) }),
      el("div", { class: "small muted", text: `${fmtBRL(pr.perPerson)} por pessoa · ${plural(pr.people, "pessoa", "pessoas")}` }),
      pr.applied && pr.percent ? el("div", { class: "badge", text: `🎉 ${pr.percent}% de desconto` }) : null,
    ));
  }
}
function validateStep3() {
  const o = opt();
  if (!(Number(o.pricing.amount) > 0)) { toast("Informe o valor do pacote.", "error"); return false; }
  if (!o.payment.card.enabled && !o.payment.boleto.enabled && !o.payment.pix.enabled) { toast("Marque pelo menos uma forma de pagamento.", "error"); return false; }
  return true;
}

/* =========================================================
   Passo 4 — revisão final
   ========================================================= */
function renderStep4() {
  const o = opt();
  const P = S.proposal;
  const wrap = el("div", {});
  wrap.append(stepTitle("4. Revisão final"), el("p", { class: "step-sub", text: "Confira o orçamento inteiro. Edite o que quiser direto aqui — ou use 'Editar' pra voltar e ajustar viagem e valor com detalhe. Quando estiver tudo certo, gere o link ou PDF." }), optionsBar());

  const valid = inp("proposal.validUntil", { type: "date", dtype: "isodate" });
  wrap.append(sec("Cliente e validade", "users", [
    field("Nome do cliente", inp("proposal.clientName", { placeholder: "Nome completo" })),
    field("Proposta válida até", valid),
  ]));

  const legTxt = (l) => [l.date, l.origin && l.destination ? `${l.origin} → ${l.destination}` : "", l.departure && l.arrival ? `${l.departure}-${l.arrival}` : ""].filter(Boolean).join(" · ") || "—";
  const inc = [o.included.transfers && "Traslados", o.included.insurance && "Seguro viagem", ...o.included.tours, ...o.included.extras].filter(Boolean).join(" · ") || "—";
  wrap.append(sec("Viagem", "plane", [
    el("dl", { class: "summary" },
      el("dt", { text: "Destino" }), el("dd", { text: o.destination.city || "—" }),
      el("dt", { text: "Ida" }), el("dd", { text: legTxt(o.flights.outbound) }),
      el("dt", { text: "Volta" }), el("dd", { text: o.flights.oneWay ? "Somente ida" : legTxt(o.flights.inbound) }),
      el("dt", { text: "Passageiros" }), el("dd", { text: `${plural(peopleCount(o), "pessoa", "pessoas")} · ${plural(o.passengers.rooms, "quarto", "quartos")}` }),
      el("dt", { text: "Hotel" }), el("dd", { text: o.hotels.map((h) => h.name).filter(Boolean).join(" + ") || "—" }),
      el("dt", { text: "Fotos" }), el("dd", { text: plural(o.hotels.reduce((s, h) => s + h.photos.length, 0), "foto", "fotos") }),
      el("dt", { text: "Inclui" }), el("dd", { text: inc }),
    ),
  ], el("button", { class: "btn btn-sm btn-soft", type: "button", html: `${icon("edit")} Editar viagem`, onClick: () => go(2) })));

  const pr = computePricing(o);
  wrap.append(sec("Valor", "money", [
    field(o.pricing.mode === "perPerson" ? "Valor por pessoa (R$)" : "Valor total (R$)", inp(op("pricing.amount"), { dtype: "money", cls: "input is-big" })),
    el("dl", { class: "summary", style: { marginTop: "12px" } },
      el("dt", { text: "Total" }), el("dd", { text: `${fmtBRL(pr.total)} · ${plural(pr.people, "pessoa", "pessoas")}` }),
      el("dt", { text: "Por pessoa" }), el("dd", { text: fmtBRL(pr.perPerson) }),
      pr.applied ? el("dt", { text: "Promocode" }) : null, pr.applied ? el("dd", { text: `De ${fmtBRL(pr.originalTotal)} · ${pr.percent}% off` }) : null,
      el("dt", { text: "Destaque" }), el("dd", { text: highlightSummary(o) }),
    ),
  ], el("button", { class: "btn btn-sm btn-soft", type: "button", html: `${icon("edit")} Editar valor`, onClick: () => go(3) })));

  wrap.append(sec("Forma de pagamento", "card", [el("ul", { class: "pay-lines" }, paymentLines(o).map((l) => el("li", { text: l.text })))],
    el("button", { class: "btn btn-sm btn-soft", type: "button", html: `${icon("edit")} Editar`, onClick: () => go(3) })));

  wrap.append(sec("Observações", "doc", [textarea(op("notes"), { rows: 5 })]));

  wrap.append(
    el("button", { class: "btn preview-btn", type: "button", html: `${icon("eye")} Ver prévia (como o cliente vê)`, onClick: previewProposal }),
    el("p", { class: "hint", style: { textAlign: "center", marginTop: "6px" }, text: "Abre o orçamento numa aba nova, igual o cliente recebe. Pode voltar, editar e ver de novo — o link continua o mesmo." }),
  );
  body.append(wrap);
  foot.append(
    el("button", { class: "btn", type: "button", html: `${icon("arrowL")} Voltar`, onClick: () => go(3) }),
    el("button", { class: "btn btn-primary", type: "button", id: "btnGenerate", html: `Tudo certo — gerar ${icon("arrowR")}`, onClick: generate }),
  );
}

function validateAll() {
  const P = S.proposal;
  if (!P.clientName.trim()) return "Informe o nome do cliente.";
  for (const [i, o] of P.options.entries()) {
    if (!o.destination.city.trim()) return `${o.label || "Opção " + (i + 1)}: informe o destino.`;
    if (!(Number(o.pricing.amount) > 0)) return `${o.label || "Opção " + (i + 1)}: informe o valor.`;
  }
  return null;
}
async function save() {
  const err = validateAll();
  if (err) { toast(err, "error"); return null; }
  const payload = { ...S.proposal, attendant: S.attendant };
  let res;
  try {
    res = S.id ? await api(`/api/proposals/${S.id}`, { method: "PUT", body: payload }) : await api("/api/proposals", { method: "POST", body: payload });
  } catch (e) {
    // O orçamento sumiu do servidor (ex.: storage temporário na Vercel): cria de novo com um link novo.
    if (S.id && e.status === 404) { S.id = null; res = await api("/api/proposals", { method: "POST", body: payload }); toast("O orçamento anterior não existe mais no servidor — gerei um link novo.", ""); }
    else throw e;
  }
  S.id = res.id; S.url = res.url;
  return res;
}
async function previewProposal() {
  try {
    const w = window.open("", "_blank");
    const res = await save();
    if (!res) { w?.close(); return; }
    const u = `${S.url}?preview=1`;
    if (w) w.location = u; else window.open(u, "_blank");
  } catch (e) { toast(e.message, "error"); }
}
async function generate() {
  const btn = document.getElementById("btnGenerate");
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Gerando…`;
  try { const res = await save(); if (res) go(5); else { btn.disabled = false; btn.innerHTML = `Tudo certo — gerar ${icon("arrowR")}`; } }
  catch (e) { toast(e.message, "error"); btn.disabled = false; btn.innerHTML = `Tudo certo — gerar ${icon("arrowR")}`; }
}

/* =========================================================
   Passo 5 — resultado
   ========================================================= */
function renderResult() {
  [...progress.children].forEach((s) => (s.className = "is-done"));
  const P = S.proposal;
  const wa = whatsappText(P, S.url);
  const link = el("input", { class: "input", readonly: true, value: S.url, onClick: (e) => e.target.select() });
  const waBox = el("textarea", { class: "textarea" }); waBox.value = wa;
  body.append(el("div", { class: "result" },
    el("div", { class: "ok", html: icon("check") }),
    el("h2", { text: "Orçamento gerado!" }),
    el("p", { text: `Pronto pra enviar pra ${firstName(P.clientName) || "o cliente"}. O link é fixo: se você editar depois, o cliente vê a versão nova no mesmo endereço.` }),
    el("div", { class: "link-box" }, link, el("button", { class: "btn btn-primary", type: "button", html: `${icon("copy")} Copiar link`, onClick: async () => { await copyText(S.url); toast("Link copiado!", "success"); } })),
    el("div", { class: "actions" },
      el("a", { class: "btn", href: S.url, target: "_blank", rel: "noopener", html: `${icon("eye")} Abrir` }),
      el("a", { class: "btn", href: `${S.url}?print=1&preview=1`, target: "_blank", rel: "noopener", html: `${icon("print")} Baixar PDF` }),
      el("button", { class: "btn", type: "button", html: `${icon("edit")} Editar`, onClick: () => go(4) }),
      el("button", { class: "btn btn-ghost", type: "button", html: `${icon("plus")} Novo orçamento`, onClick: () => { if (confirm("Começar um novo orçamento?")) location.href = location.pathname; } }),
    ),
    el("div", { class: "wa-box" },
      el("div", { class: "sub-label", text: "Mensagem pronta pro WhatsApp" }),
      waBox,
      el("div", { class: "row", style: { marginTop: "8px" } },
        el("button", { class: "btn btn-sm", type: "button", html: `${icon("copy")} Copiar mensagem`, onClick: async () => { await copyText(waBox.value); toast("Mensagem copiada!", "success"); } }),
        el("a", { class: "btn btn-sm btn-soft", target: "_blank", rel: "noopener", href: `https://wa.me/?text=${encodeURIComponent(wa)}`, html: `${icon("whatsapp")} Abrir no WhatsApp` }),
      ),
    ),
  ));
  if (window.parent !== window) window.parent.postMessage({ type: "fredy-orcamento:generated", id: S.id, url: S.url, whatsapp: wa, clientName: P.clientName }, "*");
}

/* =========================================================
   Lista / edição
   ========================================================= */
function openList() {
  openSheet("Meus orçamentos", (close) => {
    const host = el("div", { class: "plist" }, el("div", { class: "muted small", text: "Carregando…" }));
    fillList(host, close);
    return host;
  });
}
async function fillList(host, close) {
    try {
      const { proposals } = await api("/api/proposals");
      host.innerHTML = "";
      if (!proposals.length) host.append(el("div", { class: "muted small", text: "Nenhum orçamento gerado ainda." }));
      for (const p of proposals) {
        const url = `${S.session.publicUrl}/p/${p.id}`;
        host.append(el("div", { class: "pitem" },
          el("div", {}, el("b", { text: `${p.clientName || "Sem nome"} · ${p.destination || "—"}` }),
            el("div", { class: "meta" }, el("span", { text: new Date(p.updatedAt).toLocaleDateString("pt-BR") }), el("span", { text: plural(p.options, "opção", "opções") }), el("span", { text: `${p.views} ${p.views === 1 ? "visita" : "visitas"}` }), p.chosenOption != null ? el("span", { class: "pill pill-success", text: `Escolheu a opção ${p.chosenOption + 1}` }) : null, p.createdBy ? el("span", { text: p.createdBy }) : null)),
          el("div", { class: "acts" },
            el("button", { class: "btn btn-sm", type: "button", html: icon("copy"), title: "Copiar link", onClick: async () => { await copyText(url); toast("Link copiado!", "success"); } }),
            el("a", { class: "btn btn-sm", href: url, target: "_blank", rel: "noopener", html: icon("eye"), title: "Abrir" }),
            el("button", { class: "btn btn-sm btn-soft", type: "button", html: icon("edit"), title: "Editar", onClick: async () => { close(); await loadForEdit(p.id); go(4); } }),
          ),
        ));
      }
    } catch (err) { host.innerHTML = ""; host.append(el("div", { class: "hint", text: err.message })); }
}
async function loadForEdit(id) {
  try {
    const { proposal, url } = await api(`/api/proposals/${encodeURIComponent(id)}`);
    S.proposal = { clientName: proposal.clientName, validUntil: proposal.validUntil, attendant: proposal.attendant, options: proposal.options.map((o) => ({ ...o, _meta: { uncertainties: [] } })) };
    S.id = proposal.id; S.url = url; S.cur = 0; S.step = 4;
    toast("Orçamento carregado pra edição.", "success");
  } catch (err) { toast(err.message, "error"); }
}

/* =========================================================
   Sheet (mini-modal)
   ========================================================= */
function openSheet(titleText, build, onClose) {
  const overlay = document.getElementById("sheetOverlay");
  const sheet = document.getElementById("sheet");
  const close = () => { overlay.hidden = true; sheet.innerHTML = ""; onClose?.(); };
  sheet.innerHTML = "";
  sheet.append(el("div", { class: "sheet-head" }, el("h3", { text: titleText }), el("button", { class: "icon-btn", type: "button", html: icon("x"), onClick: close })));
  const content = build(close);
  Promise.resolve(content).then((node) => sheet.append(node));
  overlay.hidden = false;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}
