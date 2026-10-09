// Cálculo de valores, parcelas e textos de pagamento. Usado pelo gerador e pela página do cliente.

export const fmtBRL = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(n) ? n : 0);

export const fmtNum = (n) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);

/** "8.889,27" | "8889.27" | "R$ 8.889,27" -> 8889.27 */
export function parseMoney(str) {
  if (typeof str === "number") return str;
  let s = String(str || "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/\.\d{3}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function peopleCount(opt) {
  const p = opt?.passengers || {};
  return Math.max(1, (Number(p.adults) || 0) + (Number(p.children) || 0));
}

/** Totais e valores por pessoa (com e sem desconto). */
export function computePricing(opt) {
  const people = peopleCount(opt);
  const pr = opt.pricing || {};
  const amount = Number(pr.amount) || 0;
  const toTotal = (v) => (pr.mode === "perPerson" ? v * people : v);
  const total = toTotal(amount);
  const perPerson = total / people;
  const promo = pr.promo || {};
  const applied = Boolean(promo.applied) && Number(promo.originalAmount) > 0;
  const originalTotal = applied ? toTotal(Number(promo.originalAmount)) : null;
  const savings = applied && originalTotal > total ? originalTotal - total : 0;
  const percent = applied ? (Number(promo.percent) || (originalTotal > 0 ? Math.round((savings / originalTotal) * 100) : 0)) : 0;
  return { people, total, perPerson, applied, originalTotal, originalPerPerson: originalTotal != null ? originalTotal / people : null, savings, percent };
}

function toPerPerson(opt, v, people) {
  const n = Number(v) || 0;
  return opt.pricing?.mode === "perPerson" ? n : n / people;
}

/** Parcelamento por pessoa de um método com N parcelas (considera entrada e 1ª parcela maior). */
export function installmentsFor(opt, n) {
  const { perPerson, people } = computePricing(opt);
  const pay = opt.payment || {};
  const entryPP = pay.entry?.enabled ? toPerPerson(opt, pay.entry.amount, people) : 0;
  let base = Math.max(0, perPerson - entryPP);
  if (pay.firstBigger?.enabled && Number(pay.firstBigger.amount) > 0 && n > 1) {
    const first = toPerPerson(opt, pay.firstBigger.amount, people);
    const rest = Math.max(0, (base - first) / (n - 1));
    return { n, first, each: rest, entryPP };
  }
  return { n, first: null, each: n > 0 ? base / n : base, entryPP };
}

const METHOD_LABEL = { card: "no cartão de crédito", boleto: "no boleto", pix: "no PIX" };

/** Qual método fica em destaque (auto = o de maior parcelamento). */
export function featuredMethod(opt) {
  const pay = opt.payment || {};
  if (pay.featured === "card" && pay.card?.enabled) return "card";
  if (pay.featured === "boleto" && pay.boleto?.enabled) return "boleto";
  const candidates = [];
  if (pay.boleto?.enabled) candidates.push(["boleto", pay.boleto.installments || 1]);
  if (pay.card?.enabled) candidates.push(["card", pay.card.installments || 1]);
  candidates.sort((a, b) => b[1] - a[1]);
  if (candidates.length) return candidates[0][0];
  return pay.pix?.enabled ? "pix" : null;
}

/** Uma linha de texto por forma de pagamento habilitada. */
export function paymentLines(opt) {
  const pay = opt.payment || {};
  const { perPerson } = computePricing(opt);
  const lines = [];
  const build = (method) => {
    const n = pay[method]?.installments || 1;
    const i = installmentsFor(opt, n);
    const parts = [];
    if (i.entryPP > 0) parts.push(`entrada de ${fmtBRL(i.entryPP)}`);
    if (i.first != null) parts.push(`1ª de ${fmtBRL(i.first)} + ${n - 1}× de ${fmtBRL(i.each)}`);
    else parts.push(`${n}× de ${fmtBRL(i.each)}`);
    return { method, n, text: `${parts.join(" + ")} sem juros ${METHOD_LABEL[method]}`, perPerson: true };
  };
  if (pay.boleto?.enabled) lines.push(build("boleto"));
  if (pay.card?.enabled) lines.push(build("card"));
  if (pay.pix?.enabled) lines.push({ method: "pix", n: 1, text: `À vista no PIX · ${fmtBRL(perPerson)} por pessoa`, perPerson: true });
  return lines;
}

/** Bloco de destaque do valor (o número grande), conforme payment.highlight. */
export function highlightBlock(opt) {
  const pr = computePricing(opt);
  const pay = opt.payment || {};
  const lines = paymentLines(opt);
  const mode = pay.highlight || "installment";
  const fm = featuredMethod(opt);
  const totalLine = `Total ${fmtBRL(pr.total)} para ${pr.people} ${pr.people === 1 ? "pessoa" : "pessoas"}`;

  if (mode === "installment" && fm && fm !== "pix") {
    const n = pay[fm]?.installments || 1;
    const i = installmentsFor(opt, n);
    const subs = [`sem juros ${METHOD_LABEL[fm]}`];
    if (i.entryPP > 0) subs.unshift(`entrada de ${fmtBRL(i.entryPP)} por pessoa`);
    if (i.first != null) subs.unshift(`1ª parcela de ${fmtBRL(i.first)}`);
    subs.push(`à vista por ${fmtBRL(pr.perPerson)} por pessoa`, totalLine);
    return {
      mode: "installment",
      kicker: `Em até ${n}× sem juros`,
      prefix: i.first != null ? `${n - 1}× de` : `${n}× de`,
      big: fmtBRL(i.each),
      suffix: "por pessoa",
      subs,
      others: lines.filter((l) => l.method !== fm),
      othersTitle: "Outras formas de pagamento",
      pricing: pr,
    };
  }
  if (mode === "total") {
    return {
      mode: "total", kicker: "Valor total", prefix: "", big: fmtBRL(pr.total), suffix: "",
      subs: [`${fmtBRL(pr.perPerson)} por pessoa · ${pr.people} ${pr.people === 1 ? "pessoa" : "pessoas"}`],
      others: lines, othersTitle: "Formas de pagamento", pricing: pr,
    };
  }
  return {
    mode: "perPerson", kicker: "Valor por pessoa", prefix: "", big: fmtBRL(pr.perPerson), suffix: "",
    subs: [totalLine], others: lines, othersTitle: "Formas de pagamento", pricing: pr,
  };
}

/** Texto curto pro resumo (ex: "Parcela — 12× de R$ 333,33"). */
export function highlightSummary(opt) {
  const h = highlightBlock(opt);
  if (h.mode === "installment") return `Parcela — ${h.prefix} ${h.big}`;
  if (h.mode === "total") return `Valor total — ${h.big}`;
  return `Por pessoa — ${h.big}`;
}

/** Mensagem pronta pro WhatsApp. */
export function whatsappText(proposal, url) {
  const first = proposal.options[0];
  const name = (proposal.clientName || "").split(" ")[0];
  const h = highlightBlock(first);
  const dest = first.destination?.city || "sua viagem";
  const multi = proposal.options.length > 1 ? ` São ${proposal.options.length} opções pra você comparar.` : "";
  const price = h.mode === "installment" ? `${h.prefix} ${h.big} por pessoa` : `${h.big}${h.mode === "perPerson" ? " por pessoa" : ""}`;
  return `Olá${name ? ", " + name : ""}! Preparei sua proposta pra ${dest} 🌴\n\n${price}\n\nVeja todos os detalhes aqui:\n${url}${multi}\n\nQualquer dúvida é só me chamar!`;
}
