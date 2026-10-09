// Schema da proposta salva. Tudo que chega do navegador passa por aqui (zod remove campos desconhecidos).
// Textos longos são cortados no limite em vez de rejeitados: o atendente nunca deve ficar travado por um campo grande.
import { z } from "zod";

const S = (max = 200) => z.preprocess((v) => (v == null ? "" : String(v)), z.string()).transform((s) => s.slice(0, max));
const num = z.preprocess((v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v)), z.number().finite().nullable());
const int = z.preprocess((v) => Math.min(99, Math.max(0, parseInt(v, 10) || 0)), z.number().int());
const intOrNull = (max) => z.preprocess((v) => (v == null || v === "" ? null : Math.min(max, Math.max(0, parseInt(v, 10) || 0))), z.number().int().nullable());
const bool = (def) => z.preprocess((v) => (v == null ? def : Boolean(v)), z.boolean());
const arr = (item, max) => z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(item)).transform((a) => a.slice(0, max));
const obj = (shape) => z.preprocess((v) => (v && typeof v === "object" ? v : {}), z.object(shape));

const Connection = obj({ airport: S(8), arrival: S(5), departure: S(5) });

export const Leg = obj({
  date: S(10),
  origin: S(8),
  destination: S(8),
  departure: S(5),
  arrival: S(5),
  duration: S(20),
  airline: S(40),
  connections: arr(Connection, 4),
});

const PhotoUrl = S(600);
const isPhotoUrl = (u) => u.startsWith("/uploads/") || /^https:\/\//.test(u);

export const Hotel = obj({
  name: S(120),
  city: S(80),
  checkin: S(10),
  checkout: S(10),
  nights: intOrNull(365),
  board: S(40),
  room: S(160),
  photos: arr(PhotoUrl, 8).transform((a) => a.filter(isPhotoUrl)),
  libraryKey: S(160),
});

export const Option = obj({
  label: S(40),
  destination: obj({
    city: S(80),
    region: S(80),
    tagline: S(200),
    highlights: arr(S(140), 6),
    climate: S(80),
    bestSeason: S(80),
  }),
  flights: obj({
    outbound: Leg,
    inbound: Leg,
    oneWay: bool(false),
  }),
  hotels: arr(Hotel, 5),
  included: obj({
    flights: bool(true),
    hotel: bool(true),
    transfers: bool(false),
    insurance: bool(false),
    tours: arr(S(140), 12),
    extras: arr(S(140), 12),
  }),
  passengers: obj({ rooms: int, adults: int, children: int }),
  pricing: obj({
    mode: z.preprocess((v) => (v === "perPerson" ? "perPerson" : "total"), z.enum(["total", "perPerson"])),
    amount: num,
    promo: obj({ applied: bool(false), originalAmount: num, percent: num }),
  }),
  payment: obj({
    card: obj({ enabled: bool(true), installments: z.preprocess((v) => Math.min(24, Math.max(1, parseInt(v, 10) || 10)), z.number().int()) }),
    boleto: obj({ enabled: bool(true), installments: z.preprocess((v) => Math.min(24, Math.max(1, parseInt(v, 10) || 12)), z.number().int()) }),
    pix: obj({ enabled: bool(true) }),
    featured: z.preprocess((v) => (["auto", "card", "boleto"].includes(v) ? v : "auto"), z.enum(["auto", "card", "boleto"])),
    entry: obj({ enabled: bool(false), amount: num }),
    firstBigger: obj({ enabled: bool(false), amount: num }),
    highlight: z.preprocess((v) => (["installment", "perPerson", "total"].includes(v) ? v : "installment"), z.enum(["installment", "perPerson", "total"])),
  }),
  notes: S(3000),
  // Avisos da leitura por IA ainda não conferidos pelo atendente (somem ao clicar em "Conferi").
  flags: arr(obj({ field: S(40), note: S(200) }), 10),
});

export const ProposalInput = z.object({
  clientName: S(120),
  validUntil: S(10),
  attendant: obj({ name: S(80), email: S(120), whatsapp: S(30) }),
  options: z.array(Option).min(1, "Adicione pelo menos uma opção.").max(6, "Máximo de 6 opções por link."),
});

export function sanitizeForPublic(p) {
  // O cliente não precisa do e-mail do atendente nem de estatísticas internas.
  const { attendant, stats, ...rest } = p;
  const options = (rest.options || []).map(({ flags, ...o }) => o);
  return { ...rest, options, attendant: { name: attendant?.name || "", whatsapp: attendant?.whatsapp || "" }, chosenOption: stats?.chosenOption ?? null };
}
