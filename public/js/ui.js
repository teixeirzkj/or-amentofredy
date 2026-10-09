// Utilidades de interface compartilhadas.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Ícones (SVG inline, traço 1.75) ---------- */
const P = {
  plane: '<path d="M10.5 13.5 4 11l1-1.5 6.5 1 4-4.5c.8-.9 2.1-.9 3 0s.9 2.2 0 3l-4.5 4 1 6.5-1.5 1-2.5-6.5-3 3 .3 2.2-1.3.8-1.5-3-3-1.5.8-1.3 2.2.3z"/>',
  bed: '<path d="M3 18V8m0 6h18v4M3 14V11a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v3m0-3h6a3 3 0 0 1 3 3"/><circle cx="7" cy="11" r="1.2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  spark: '<path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9.5 12 2 2 3.5-4"/>',
  car: '<path d="M5 15h14M5 15l1.5-5A2 2 0 0 1 8.4 8.5h7.2a2 2 0 0 1 1.9 1.5L19 15M5 15v3m14-3v3"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>',
  ticket: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M12 6v12" stroke-dasharray="2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4m8-4v4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17 14.6c2.4.5 4 2.5 4 5.4"/>',
  night: '<path d="M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.4A5.5 5.5 0 0 1 13.4 3.1 9 9 0 0 0 12 3z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowL: '<path d="M15 5l-7 7 7 7"/>',
  arrowR: '<path d="m9 5 7 7-7 7"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/><path d="m13 7 4 4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  whatsapp: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l.9-1.6-2-1-1 .9a5 5 0 0 1-2.7-2.7l.9-1-1-2z"/>',
  flag: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6M4 4v5h5m11 11v-5h-5"/>',
  print: '<path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M6 10v4m12-4v4"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M9 13h6m-6 4h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.7l6.2-.9z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  warn: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4m0 3h.01"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
  wand: '<path d="m4 20 10-10M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.2 1.4.6-1.4.6L19 14.6l-.6-1.2L17 12.8l1.4-.6z"/>',
};
export function icon(name, cls = "ico") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;
}

/* ---------- Toast ---------- */
let host;
export function toast(msg, kind = "") {
  host ??= document.body.appendChild(el("div", { class: "toast-host" }));
  const t = el("div", { class: `toast ${kind ? "is-" + kind : ""}`, text: msg });
  host.append(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .25s"; setTimeout(() => t.remove(), 260); }, 3200);
}

/* ---------- API ---------- */
export class ApiError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}
export async function api(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    signal,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    if (res.status === 401) document.dispatchEvent(new CustomEvent("fredy:auth-required"));
    throw new ApiError(data?.error || `Erro ${res.status}`, res.status, data);
  }
  return data;
}

/* ---------- Datas ---------- */
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function parseBR(d) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(d || "").trim());
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}
export function toBR(date) {
  if (!(date instanceof Date)) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}
export function isoToBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
export function brToISO(br) {
  const d = parseBR(br);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
}
export function fmtShort(d) {
  const dt = typeof d === "string" ? parseBR(d) : d;
  return dt ? `${dt.getDate()} de ${MONTHS_SHORT[dt.getMonth()]}` : "";
}
export function fmtLong(d) {
  const dt = typeof d === "string" ? parseBR(d) : d;
  return dt ? `${String(dt.getDate()).padStart(2, "0")} de ${MONTHS_LONG[dt.getMonth()]} de ${dt.getFullYear()}` : "";
}
export function monthName(d) {
  const dt = typeof d === "string" ? parseBR(d) : d;
  return dt ? MONTHS_LONG[dt.getMonth()] : "";
}
export function nightsBetween(a, b) {
  const da = parseBR(a), db = parseBR(b);
  if (!da || !db) return null;
  return Math.max(0, Math.round((db - da) / 86400000));
}
export function addDays(br, n) {
  const d = parseBR(br);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return toBR(d);
}

/* ---------- Imagens ---------- */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Redimensiona pra caber em maxPx e comprime (JPEG ou PNG) até ficar abaixo do limite. */
export async function normalizeImage(file, { maxPx = 2200, maxBytes = 4.5 * 1024 * 1024, keepPng = false } = {}) {
  const dataUrl = await fileToDataURL(file);
  if (file.size <= maxBytes && !keepPng) {
    const dims = await imageDims(dataUrl);
    if (dims.w <= maxPx && dims.h <= maxPx) return dataUrl;
  }
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  if (keepPng || file.type === "image/png") {
    const png = canvas.toDataURL("image/png");
    if (png.length * 0.75 <= maxBytes) return png;
  }
  for (const q of [0.92, 0.85, 0.75, 0.65]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length * 0.75 <= maxBytes) return out;
  }
  return canvas.toDataURL("image/jpeg", 0.5);
}
function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
}
async function imageDims(src) { const i = await loadImage(src); return { w: i.width, h: i.height }; }

/* ---------- Diversos ---------- */
export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = el("textarea", { style: { position: "fixed", opacity: 0 } }, text);
    document.body.append(ta); ta.select();
    try { document.execCommand("copy"); return true; } catch { return false; } finally { ta.remove(); }
  }
}
export function initTheme(buttonSel) {
  const root = document.documentElement;
  try { const saved = localStorage.getItem("fredy-theme"); if (saved) root.dataset.theme = saved; } catch {}
  const btn = typeof buttonSel === "string" ? document.querySelector(buttonSel) : buttonSel;
  if (!btn) return;
  btn.innerHTML = icon("sun", "sun") + icon("moon", "moon");
  btn.addEventListener("click", () => {
    const dark = root.dataset.theme === "dark" || (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("fredy-theme", root.dataset.theme); } catch {}
  });
}
export const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "";
export const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
