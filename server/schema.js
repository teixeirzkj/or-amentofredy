// Schema da proposta salva. Tudo que chega do navegador passa por aqui (zod remove campos desconhecidos).
import { z } from "zod";

const S = (max = 200) => z.string().max(max).default("");
const num = z.number().finite().nullable().default(null);
const int = z.number().int().min(0).max(99).default(0);

const Connection = z.object({ airport: S(8), arrival: S(5), departure: S(5) });

export const Leg = z.object({
  date: S(10),
  origin: S(8),
  destination: S(8),
  departure: S(5),
  arrival: S(5),
  duration: S(20),
  airline: S(40),
  connections: z.array(Connection).max(4).default([]),
});

const PhotoUrl = z.string().max(500).refine((u) => u.startsWith("/uploads/") || /^https:\/\//.test(u), "foto inválida");

export const Hotel = z.object({
  name: S(120),
  city: S(80),
  checkin: S(10),
  checkout: S(10),
  nights: z.number().int().min(0).max(365).nullable().default(null),
  board: S(40),
  room: S(80),
  photos: z.array(PhotoUrl).max(8).default([]),
  libraryKey: S(160),
});

export const Option = z.object({
  label: S(40),
  destination: z.object({
    city: S(80),
    region: S(80),
    tagline: S(160),
    highlights: z.array(S(120)).max(6).default([]),
    climate: S(80),
    bestSeason: S(80),
  }),
  flights: z.object({
    outbound: Leg,
    inbound: Leg,
    oneWay: z.boolean().default(false),
  }),
  hotels: z.array(Hotel).max(5).default([]),
  included: z.object({
    flights: z.boolean().default(true),
    hotel: z.boolean().default(true),
    transfers: z.boolean().default(false),
    insurance: z.boolean().default(false),
    tours: z.array(S(120)).max(12).default([]),
    extras: z.array(S(120)).max(12).default([]),
  }),
  passengers: z.object({ rooms: int, adults: int, children: int }),
  pricing: z.object({
    mode: z.enum(["total", "perPerson"]).default("total"),
    amount: num,
    promo: z.object({
      applied: z.boolean().default(false),
      originalAmount: num,
      percent: num,
    }).default({}),
  }),
  payment: z.object({
    card: z.object({ enabled: z.boolean().default(true), installments: z.number().int().min(1).max(24).default(10) }).default({}),
    boleto: z.object({ enabled: z.boolean().default(true), installments: z.number().int().min(1).max(24).default(12) }).default({}),
    pix: z.object({ enabled: z.boolean().default(true) }).default({}),
    featured: z.enum(["auto", "card", "boleto"]).default("auto"),
    entry: z.object({ enabled: z.boolean().default(false), amount: num }).default({}),
    firstBigger: z.object({ enabled: z.boolean().default(false), amount: num }).default({}),
    highlight: z.enum(["installment", "perPerson", "total"]).default("installment"),
  }),
  notes: S(2000),
});

export const ProposalInput = z.object({
  clientName: S(120),
  validUntil: S(10),
  attendant: z.object({ name: S(80), email: S(120), whatsapp: S(30) }).default({}),
  options: z.array(Option).min(1).max(6),
});

export function sanitizeForPublic(p) {
  // O cliente não precisa do e-mail do atendente nem de estatísticas internas.
  const { attendant, stats, ...rest } = p;
  return { ...rest, attendant: { name: attendant?.name || "", whatsapp: attendant?.whatsapp || "" }, chosenOption: stats?.chosenOption ?? null };
}
