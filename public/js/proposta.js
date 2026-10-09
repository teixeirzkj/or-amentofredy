// Página pública da proposta: renderiza o orçamento que o atendente gerou.
import { el, esc, icon, api, toast, initTheme, fmtShort, fmtLong, parseBR, nightsBetween, firstName, plural } from "./ui.js";
import { highlightBlock, fmtBRL } from "./money.js";

const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const id = location.pathname.split("/").filter(Boolean)[1];
const isPreview = params.get("preview") === "1";
let proposal = null;
let current = 0;

initTheme("#themeToggle");
document.querySelector(".topbar-brand").addEventListener("click", (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

load();

async function load() {
  try {
    const data = await api(`/api/public/proposals/${encodeURIComponent(id)}${isPreview ? "?preview=1" : ""}`);
    proposal = data.proposal;
    if (proposal.chosenOption != null) current = proposal.chosenOption;
    document.title = `${proposal.options[current]?.destination?.city || "Proposta"} · proposta pra ${firstName(proposal.clientName) || "você"} · Frédy`;
    renderPills();
    render();
    if (params.get("print") === "1") setTimeout(() => window.print(), 900);
  } catch (err) {
    app.innerHTML = "";
    app.append(el("div", { class: "error-state" },
      el("h2", { text: "Proposta não encontrada" }),
      el("p", { text: "Esse link pode ter expirado ou estar incompleto. Fale com quem te enviou pra receber um novo." }),
    ));
  }
}

function renderPills() {
  const sw = document.getElementById("optionSwitch");
  const host = document.getElementById("optionPills");
  host.innerHTML = "";
  if (proposal.options.length < 2) { sw.hidden = true; return; }
  sw.hidden = false;
  proposal.options.forEach((o, i) => {
    host.append(el("button", {
      type: "button", role: "tab", "aria-selected": String(i === current),
      class: `option-pill ${i === current ? "is-active" : ""} ${proposal.chosenOption === i ? "is-chosen" : ""}`,
      text: o.label || `Opção ${i + 1}`,
      onClick: () => { current = i; renderPills(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    }));
  });
}

function render() {
  const o = proposal.options[current];
  app.innerHTML = "";
  app.append(renderHero(o), renderContent(o), renderCta(o));
}

/* ---------- Hero ---------- */
function heroImage(o) {
  for (const h of o.hotels || []) if (h.photos?.[0]) return h.photos[0];
  return null;
}
function tripDates(o) {
  const a = o.flights?.outbound?.date || o.hotels?.[0]?.checkin;
  const b = o.flights?.oneWay ? o.hotels?.at(-1)?.checkout : (o.flights?.inbound?.date || o.hotels?.at(-1)?.checkout);
  return { a, b };
}
function totalNights(o) {
  const n = (o.hotels || []).reduce((s, h) => s + (h.nights ?? nightsBetween(h.checkin, h.checkout) ?? 0), 0);
  if (n) return n;
  const { a, b } = tripDates(o);
  return nightsBetween(a, b) || 0;
}
function renderHero(o) {
  const img = heroImage(o);
  const { a, b } = tripDates(o);
  const nights = totalNights(o);
  const p = o.passengers || {};
  const pax = [p.adults ? plural(p.adults, "adulto", "adultos") : null, p.children ? plural(p.children, "criança", "crianças") : null].filter(Boolean).join(" + ");
  const chips = [];
  if (a) chips.push(chip("cal", b && b !== a ? `${fmtShort(a)} — ${fmtShort(b)}` : fmtShort(a)));
  if (nights) chips.push(chip("night", plural(nights, "noite", "noites")));
  if (pax) chips.push(chip("users", `${pax}${p.rooms ? " · " + plural(p.rooms, "quarto", "quartos") : ""}`));
  return el("section", { class: "hero" },
    el("div", { class: `hero-bg ${img ? "" : "is-pattern"}`, style: img ? { backgroundImage: `url("${img}")` } : {} }),
    el("div", { class: "hero-inner" },
      el("span", { class: "hero-kicker", text: "Proposta de viagem" }),
      el("h1", { text: o.destination?.city || "Sua viagem" }),
      o.destination?.tagline ? el("p", { class: "hero-tagline", text: o.destination.tagline }) : null,
      el("div", { class: "hero-chips" }, chips),
    ),
  );
}
function chip(ic, text) { return el("span", { class: "chip", html: icon(ic) + esc(text) }); }

/* ---------- Conteúdo ---------- */
function card(title, ic, ...body) {
  return el("section", { class: "pcard" },
    title ? el("div", { class: "pcard-title", html: `<span class="ico-wrap">${icon(ic)}</span><span>${esc(title)}</span>` }) : null,
    ...body,
  );
}

function renderContent(o) {
  const name = firstName(proposal.clientName);
  const list = [];

  list.push(el("section", { class: "pcard greeting" },
    el("h2", { html: name ? `Olá, <em>${esc(name)}</em>` : "Olá!" }),
    el("p", { text: "Preparei uma proposta especial pra sua viagem. Confira cada detalhe abaixo e me chame quando quiser — é só dar o sim. 🌊" }),
  ));

  if (o.included?.flights !== false && (o.flights?.outbound?.origin || o.flights?.outbound?.departure)) {
    list.push(card("Voos", "plane",
      renderLeg("Ida", o.flights.outbound),
      !o.flights.oneWay && (o.flights.inbound?.origin || o.flights.inbound?.departure) ? renderLeg("Volta", o.flights.inbound) : null,
    ));
  }

  (o.hotels || []).forEach((h, i, arr) => {
    if (!h.name) return;
    list.push(renderHotel(h, arr.length > 1 ? `Onde você vai ficar · ${i + 1}/${arr.length}` : "Onde você vai ficar"));
    list.push(renderMap(h, o));
  });

  if (o.destination?.highlights?.length || o.destination?.climate || o.destination?.bestSeason) {
    list.push(card(`Sobre ${o.destination.city || "o destino"}`, "spark",
      o.destination.highlights?.length ? el("ul", { class: "highlights" }, o.destination.highlights.map((h) => el("li", { html: icon("spark") + esc(h) }))) : null,
      (o.destination.climate || o.destination.bestSeason) ? el("div", { class: "tiles" },
        o.destination.climate ? tile("sun", "Clima", o.destination.climate) : null,
        o.destination.bestSeason ? tile("cal", "Melhor época", o.destination.bestSeason) : null,
      ) : null,
    ));
  }

  const inc = includedItems(o);
  if (inc.length) list.push(card("Tudo isso incluso", "check", el("div", { class: "included" }, inc.map(([ic, t]) => el("div", { class: "item", html: `<span class="ico-wrap">${icon(ic)}</span><span>${esc(t)}</span>` })))));

  list.push(renderPrice(o));

  const notes = (o.notes || "").split("\n").map((s) => s.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
  if (notes.length) {
    list.push(el("section", { class: "pcard notes-card" },
      el("div", { class: "pcard-title", text: "Observações" }),
      el("ul", {}, notes.map((n) => el("li", { text: n }))),
    ));
  }

  const gen = proposal.createdAt ? fmtLong(new Date(proposal.createdAt)) : "";
  list.push(el("div", { class: "footnote" },
    gen ? el("span", { html: `Proposta gerada em <b>${esc(gen)}</b>${proposal.validUntil ? ` · válida até <b>${esc(proposal.validUntil)}</b>` : ""}.` }) : null,
    el("span", { html: "Este é um <b>orçamento</b> — os valores só são garantidos após a confirmação da reserva." }),
    el("span", { class: "small", text: "Valores e condições sujeitos a disponibilidade no momento da reserva." }),
    proposal.attendant?.name ? el("span", { class: "small", html: `Atendimento: <b>${esc(proposal.attendant.name)}</b>` }) : null,
  ));
  list.push(el("div", { class: "made-with" }, el("span", { text: "feito com" }), el("span", { class: "logo-chip" }, el("img", { src: "/assets/logo-fredy.png", alt: "Frédy" }))));

  return el("div", { class: "content" }, list);
}

function tile(ic, label, val) {
  return el("div", { class: "tile" }, el("div", { class: "label", html: icon(ic) + esc(label) }), el("div", { class: "val", text: val }));
}

function includedItems(o) {
  const inc = o.included || {};
  const items = [];
  if (inc.flights) items.push(["plane", o.flights?.oneWay ? "Aéreo (somente ida)" : "Aéreo ida e volta"]);
  if (inc.hotel) {
    const n = totalNights(o);
    items.push(["bed", n ? `${plural(n, "noite", "noites")} de hospedagem` : "Hospedagem"]);
  }
  if (inc.transfers) items.push(["car", "Traslados"]);
  for (const t of inc.tours || []) items.push(["map", t]);
  if (inc.insurance) items.push(["shield", "Seguro viagem"]);
  for (const t of inc.extras || []) items.push(["star", t]);
  return items;
}

/* ---------- Voos ---------- */
function minutesBetween(a, b) {
  const [h1, m1] = (a || "").split(":").map(Number), [h2, m2] = (b || "").split(":").map(Number);
  if ([h1, m1, h2, m2].some((x) => Number.isNaN(x))) return null;
  let d = h2 * 60 + m2 - (h1 * 60 + m1);
  if (d < 0) d += 1440;
  return d;
}
const fmtMin = (m) => (m == null ? "" : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);

function renderLeg(label, leg) {
  const conns = (leg.connections || []).filter((c) => c.airport);
  const stops = conns.length;
  const list = el("ul", { class: "conn-list", hidden: true }, conns.map((c) => {
    const ground = minutesBetween(c.arrival, c.departure);
    return el("li", { html: `${icon("pin")}<span>Conexão em <b>${esc(c.airport)}</b> · chega ${esc(c.arrival || "—")} · sai ${esc(c.departure || "—")}</span>${ground != null ? `<span class="ground">${fmtMin(ground)} em solo</span>` : ""}` });
  }));
  const toggle = stops ? el("button", { type: "button", class: "conn-toggle", "aria-expanded": "false", html: `Ver conexões (${stops}) ${icon("chevron")}`, onClick: (e) => {
    const open = list.hidden; list.hidden = !open; e.currentTarget.setAttribute("aria-expanded", String(open));
  } }) : null;
  return el("div", { class: "leg" },
    el("div", { class: "leg-head" },
      el("span", { text: `${label}${leg.date ? " · " + fmtShort(leg.date) : ""}` }),
      leg.airline ? el("span", { class: "airline", html: icon("plane") + esc(leg.airline) }) : null,
    ),
    el("div", { class: "leg-row" },
      el("div", { class: "leg-time" }, el("b", { text: leg.departure || "—" }), el("span", { text: leg.origin || "" })),
      el("div", { class: "leg-line" },
        el("div", { text: leg.duration || "" }),
        el("div", { class: "track", html: icon("plane") }),
        el("div", { class: `stops ${stops ? "" : "direct"}`, text: stops ? plural(stops, "parada", "paradas") : "direto" }),
      ),
      el("div", { class: "leg-time" }, el("b", { text: leg.arrival || "—" }), el("span", { text: leg.destination || "" })),
    ),
    toggle, list,
  );
}

/* ---------- Hotel ---------- */
function renderHotel(h, title) {
  const nights = h.nights ?? nightsBetween(h.checkin, h.checkout);
  const photos = (h.photos || []).slice(0, 8);
  const gallery = photos.length ? el("div", { class: "gallery" },
    el("div", { class: "gallery-main", onClick: () => openLightbox(photos, 0) }, el("img", { src: photos[0], alt: h.name, loading: "eager" })),
    photos.length > 1 ? el("div", { class: "gallery-thumbs" }, photos.slice(1, 6).map((p, i) => el("div", { class: "gallery-thumb", onClick: () => openLightbox(photos, i + 1) },
      el("img", { src: p, alt: "", loading: "lazy" }),
      i === 4 && photos.length > 6 ? el("div", { class: "more", text: `+${photos.length - 6}` }) : null,
    ))) : null,
  ) : null;
  return el("section", { class: "pcard" },
    el("div", { class: "pcard-title", html: `<span class="ico-wrap">${icon("bed")}</span><span>${esc(title)}</span>` }),
    el("div", { class: "hotel-head" },
      el("div", {},
        el("h3", { text: h.name }),
        el("div", { class: "dates", text: [h.checkin && h.checkout ? `${h.checkin} — ${h.checkout}` : h.checkin || "", nights ? plural(nights, "noite", "noites") : ""].filter(Boolean).join(" · ") }),
      ),
      h.board ? el("span", { class: "pill", text: h.board }) : null,
    ),
    gallery,
    h.room ? el("p", { class: "hotel-note", html: `${icon("bed")} ${esc(h.room)}` }) : null,
  );
}

function renderMap(h, o) {
  const q = [h.name, h.city || o.destination?.city].filter(Boolean).join(", ");
  const embed = `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed&hl=pt-BR`;
  const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return card("Localização & arredores", "pin",
    el("div", { class: "map-box" },
      el("div", { class: "map-head", html: `<span>${icon("pin")} ${esc(q)}</span><a class="btn btn-sm btn-soft" target="_blank" rel="noopener" href="${esc(link)}">Ver no mapa ${icon("link")}</a>` }),
      el("iframe", { src: embed, loading: "lazy", referrerpolicy: "no-referrer-when-downgrade", title: `Mapa: ${q}` }),
    ),
  );
}

/* ---------- Valor ---------- */
function renderPrice(o) {
  const h = highlightBlock(o);
  const pr = h.pricing;
  return el("section", { class: "pcard price-card" },
    el("div", { class: "price-kicker", text: h.kicker }),
    el("div", { class: "price-big" },
      h.prefix ? el("span", { class: "prefix", text: h.prefix }) : null,
      el("span", { class: "big", text: h.big }),
      h.suffix ? el("span", { class: "suffix", text: h.suffix }) : null,
    ),
    el("ul", { class: "price-subs" }, h.subs.map((s) => el("li", { text: s }))),
    pr.applied && pr.savings > 0 ? el("div", { class: "discount", html: `🎉 ${pr.percent ? pr.percent + "% de desconto · " : ""}você economiza ${fmtBRL(pr.savings)} <s>${fmtBRL(pr.originalTotal)}</s>` }) : null,
    h.others.length ? el("div", { class: "others" }, el("h4", { text: h.othersTitle }), el("ul", {}, h.others.map((l) => el("li", { text: l.text })))) : null,
  );
}

/* ---------- CTA ---------- */
function renderCta(o) {
  const label = proposal.options.length > 1 ? `Quero a ${o.label || "opção " + (current + 1)}` : "Quero essa viagem";
  const inner = el("div", { class: "cta-inner" });
  if (proposal.chosenOption === current) {
    inner.append(el("div", { class: "cta-chosen", html: `${icon("check")} Você escolheu esta opção — já vou dar sequência!` }));
  } else {
    inner.append(el("button", { type: "button", class: "btn btn-primary", html: `${icon("whatsapp")} ${esc(label)}`, onClick: () => choose(o) }));
  }
  return el("div", { class: "cta-bar" }, inner);
}

async function choose(o) {
  try {
    if (!isPreview) await api(`/api/public/proposals/${encodeURIComponent(id)}/choose`, { method: "POST", body: { option: current } });
    proposal.chosenOption = current;
    const phone = (proposal.attendant?.whatsapp || "").replace(/\D/g, "");
    const msg = `Olá${proposal.attendant?.name ? ", " + proposal.attendant.name : ""}! Vi a proposta pra ${o.destination?.city || "a viagem"} e quero seguir com a ${o.label || "opção " + (current + 1)} 🙌`;
    renderPills(); render();
    if (phone) window.open(`https://wa.me/${phone.startsWith("55") ? phone : "55" + phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    else toast("Escolha registrada! Seu atendente já vai falar com você.", "success");
  } catch {
    toast("Não consegui registrar agora. Responda a mensagem do seu atendente, por favor.", "error");
  }
}

/* ---------- Lightbox ---------- */
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbCount = document.getElementById("lbCount");
let lbPhotos = [], lbIdx = 0;
document.getElementById("lbClose").innerHTML = icon("x");
document.getElementById("lbPrev").innerHTML = icon("arrowL");
document.getElementById("lbNext").innerHTML = icon("arrowR");
function openLightbox(photos, i) { lbPhotos = photos; lbIdx = i; showLb(); lb.hidden = false; document.body.style.overflow = "hidden"; }
function closeLightbox() { lb.hidden = true; document.body.style.overflow = ""; }
function showLb() { lbImg.src = lbPhotos[lbIdx]; lbCount.textContent = `${lbIdx + 1} / ${lbPhotos.length}`; }
function stepLb(d) { lbIdx = (lbIdx + d + lbPhotos.length) % lbPhotos.length; showLb(); }
document.getElementById("lbClose").addEventListener("click", closeLightbox);
document.getElementById("lbPrev").addEventListener("click", () => stepLb(-1));
document.getElementById("lbNext").addEventListener("click", () => stepLb(1));
lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
document.addEventListener("keydown", (e) => {
  if (lb.hidden) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") stepLb(-1);
  if (e.key === "ArrowRight") stepLb(1);
});
let touchX = null;
lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener("touchend", (e) => { if (touchX == null) return; const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 40) stepLb(dx < 0 ? 1 : -1); touchX = null; });
