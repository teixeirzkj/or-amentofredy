// Lê o print da cotação com a API da Anthropic e devolve os dados estruturados do orçamento.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// A API de saída estruturada limita campos com união de tipos (nullable) a 16 por schema.
// Por isso nenhum campo é nullable: texto ausente = "", número ausente = 0. normalize() converte de volta pra null.
const Connection = z.object({
  airport: z.string().describe("Código IATA do aeroporto de conexão, ex: CNF"),
  arrival: z.string().describe("Hora de chegada na conexão, HH:MM"),
  departure: z.string().describe("Hora de partida da conexão, HH:MM"),
});

const FlightLeg = z.object({
  date: z.string().describe("Data no formato DD/MM/AAAA"),
  origin: z.string().describe("Código IATA da origem, ex: CWB"),
  destination: z.string().describe("Código IATA do destino final, ex: MCZ"),
  departure: z.string().describe("Hora de partida da origem, HH:MM"),
  arrival: z.string().describe("Hora de chegada no destino final, HH:MM"),
  duration: z.string().describe("Duração total, ex: 5h 45m. Calcule pela diferença entre partida e chegada se o print não mostrar."),
  airline: z.string().describe("Companhia aérea, ex: Azul, Gol, Latam, Copa"),
  connections: z.array(Connection).describe("Conexões/escalas, em ordem. Vazio se voo direto."),
});

const Hotel = z.object({
  name: z.string().describe("Nome do hotel como aparece no print"),
  city: z.string().describe("Cidade do hotel"),
  checkin: z.string().describe("Data de entrada, DD/MM/AAAA"),
  checkout: z.string().describe("Data de saída, DD/MM/AAAA"),
  nights: z.number().int().describe("Número de noites. 0 se não aparecer."),
  board: z.string().describe("Regime: Café da manhã, Sem refeição, Meia pensão, Pensão completa, All inclusive"),
  room: z.string().describe("Tipo de quarto/apartamento, se aparecer"),
});

export const EditorialSchema = z.object({
  tagline: z.string().describe("Subtítulo curto e vendedor pro destino, em português, sem ponto final. Ex: O Caribe brasileiro: piscinas naturais e praias de tirar o fôlego"),
  highlights: z.array(z.string()).describe("2 a 3 destaques curtos do destino (praias, pontos turísticos). Ex: Praia do Gunga e Barra de São Miguel"),
  climate: z.string().describe("Clima resumido, ex: Tropical, média 27 graus"),
  best_season: z.string().describe("Melhor época pra visitar, ex: Setembro a março. Vazio se não souber."),
});

export const ExtractionSchema = z.object({
  client_name: z.string().describe("Nome do cliente/passageiro principal, se aparecer"),
  destination: z.object({
    city: z.string().describe("Cidade de destino principal, ex: Maceió"),
    region: z.string().describe("Estado ou país, ex: Alagoas"),
  }),
  passengers: z.object({
    rooms: z.number().int().describe("Quartos. 0 se não aparecer."),
    adults: z.number().int().describe("Adultos (ADT). 0 se não aparecer."),
    children: z.number().int().describe("Crianças (CHD). 0 se não aparecer."),
  }),
  has_outbound: z.boolean().describe("true se o print mostra voo de ida"),
  outbound: FlightLeg.describe("Voo de ida. Campos vazios se não houver."),
  has_inbound: z.boolean().describe("true se o print mostra voo de volta"),
  inbound: FlightLeg.describe("Voo de volta. Campos vazios se somente ida."),
  hotels: z.array(Hotel),
  included: z.object({
    flights: z.boolean(),
    hotel: z.boolean(),
    transfers: z.boolean().describe("Traslados aeroporto/hotel"),
    insurance: z.boolean().describe("Seguro viagem"),
    tours: z.array(z.string()).describe("Passeios inclusos, um por item, ex: City Tour e Litoral Sul"),
    extras: z.array(z.string()).describe("Outros serviços inclusos, ex: Serviço Assento Azul Juntos, bagagem despachada"),
  }),
  pricing: z.object({
    total: z.number().describe("Preço total da reserva em reais, número puro. 0 se não aparecer."),
    per_person: z.number().describe("Preço por pessoa, se o print mostrar. 0 se não aparecer."),
    taxes: z.number().describe("Taxas de embarque/encargos, se aparecer. 0 se não."),
    insurance_value: z.number().describe("Valor do seguro, se aparecer. 0 se não."),
    breakdown: z.array(z.object({ label: z.string(), value: z.number() })).describe("Linhas de valores que aparecem no print"),
  }),
  editorial: EditorialSchema,
  uncertainties: z.array(z.string()).describe("Campos em que você não teve certeza, em português, pra o atendente conferir"),
});

/** Converte "" e 0 de volta pra null e remove trechos de voo ausentes (formato que o resto do servidor espera). */
function normalize(ex) {
  const nz = (v) => (v === 0 ? null : v);
  const ns = (v) => (v === "" ? null : v);
  const leg = (l, has) => (has && l && (l.origin || l.departure || l.date) ? l : null);
  return {
    ...ex,
    client_name: ns(ex.client_name),
    destination: { city: ns(ex.destination?.city), region: ns(ex.destination?.region) },
    passengers: { rooms: nz(ex.passengers?.rooms), adults: nz(ex.passengers?.adults), children: ex.passengers?.children ?? 0 },
    outbound: leg(ex.outbound, ex.has_outbound),
    inbound: leg(ex.inbound, ex.has_inbound),
    hotels: (ex.hotels || []).filter((h) => h.name).map((h) => ({ ...h, nights: nz(h.nights), room: ns(h.room), board: ns(h.board) })),
    pricing: { ...ex.pricing, total: nz(ex.pricing?.total), per_person: nz(ex.pricing?.per_person), taxes: nz(ex.pricing?.taxes), insurance_value: nz(ex.pricing?.insurance_value) },
  };
}

const SYSTEM = `Você lê prints (capturas de tela) de cotações de pacotes de viagem feitas em sistemas de agência (ex: FRT, Azul Viagens, CVC, Decolar) e extrai os dados pra montar um orçamento pro cliente.

Regras:
- Extraia só o que está no print. Se um texto não aparece, use "" (string vazia); se um número não aparece, use 0; listas vazias quando não houver. Nunca invente horários, datas ou valores.
- Passageiros: "ADT" = adulto, "CHD" = criança, "INF" = bebê. Se o print lista um ADT por linha, conte-os.
- Datas sempre em DD/MM/AAAA e horas em HH:MM (24h).
- Códigos de aeroporto em IATA maiúsculo (CWB, MCZ, CNF, REC, GRU...).
- No voo com conexão, "origin" e "destination" são os aeroportos de origem e destino FINAL do trecho; cada parada vai em "connections" com a hora que o avião chega e a hora que parte dessa conexão.
- Itinerários costumam listar os trechos em ordem: o primeiro bloco é a ida e o segundo a volta.
- Valores em reais como número (8889.27, não "R$ 8.889,27").
- "editorial" é a única parte que vem do seu conhecimento, não do print: escreva algo curto e vendedor sobre o destino, em português do Brasil.
- Traslado e seguro viagem entram só como true em "included.transfers" e "included.insurance"; não repita esses itens em "extras". Em "extras" vão só serviços além disso (bagagem despachada, assento marcado, passeio extra...), em texto curto.
- Liste em "uncertainties" tudo que ficou ambíguo ou cortado no print.`;

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY não configurada no servidor (.env)."), { status: 503 });
  }
  client ??= new Anthropic();
  return client;
}

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Converte erros da API da Anthropic em mensagens pro atendente (e nunca repassa 401, que o front trata como "faça login"). */
function mapAiError(err) {
  if (!err?.status) return err;
  // Mensagem original da API (ex.: "credit balance is too low"), sem o JSON em volta.
  const detail = (err?.error?.error?.message || err?.error?.message || String(err.message || "")).replace(/^d{3}s*/, "").slice(0, 300);
  console.error("[anthropic]", err.status, detail);
  const mk = (msg, status) => Object.assign(new Error(msg), { status, detail });
  if (err.status === 401 || err.status === 403) return mk("A chave da API da Anthropic no servidor é inválida. Avise quem cuida do sistema.", 503);
  if (err.status === 404) return mk(`A Anthropic não reconheceu o modelo "${MODEL}". Ajuste a variável ANTHROPIC_MODEL.`, 503);
  if (err.status === 429 || err.status === 529) return mk("A IA está ocupada agora. Tente de novo em alguns segundos.", 429);
  if (/credit|billing|balance/i.test(detail)) return mk("A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com → Billing.", 402);
  if (err.status === 400 || err.status === 413) return mk(`A IA não aceitou a requisição: ${detail}`, 422);
  return mk(`Falha ao falar com a IA (${err.status}): ${detail}`, 502);
}
async function withAi(fn) {
  try { return await fn(); } catch (err) { throw mapAiError(err); }
}

/**
 * @param {{ data: string, mime: string }} image  base64 (sem prefixo data:) + mime
 * @returns {Promise<z.infer<typeof ExtractionSchema>>}
 */
export async function extractFromImage({ data, mime }) {
  const anthropic = getClient();
  const response = await withAi(() => anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data } },
          { type: "text", text: "Extraia os dados desta cotação de viagem." },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionSchema) },
  }));

  if (response.stop_reason === "refusal") {
    throw Object.assign(new Error("A IA não conseguiu processar essa imagem. Tente outro print ou preencha manualmente."), { status: 422 });
  }
  if (!response.parsed_output) {
    throw Object.assign(new Error("A IA respondeu em um formato inesperado. Tente de novo."), { status: 502 });
  }
  return normalize(response.parsed_output);
}

/** Gera uma nova variação do editorial de um destino (quando ele não está no dicionário local). */
export async function generateEditorial({ city, month, avoid }) {
  const anthropic = getClient();
  const prompt =
    `Escreva o editorial curto e vendedor (português do Brasil) pro destino "${city}" pra um orçamento de viagem` +
    (month ? ` em ${month}` : "") +
    `. Tagline sem ponto final; 2 a 3 destaques curtos; clima resumido; melhor época (vazio se ${month ? "contradisser o mês da viagem" : "não souber"}).` +
    (avoid ? ` Faça diferente desta versão: ${JSON.stringify(avoid)}` : "");

  const response = await withAi(() => anthropic.messages.parse({
    model: MODEL,
    max_tokens: 1000,
    output_config: { format: zodOutputFormat(EditorialSchema), effort: "low" },
    messages: [{ role: "user", content: prompt }],
  }));
  if (!response.parsed_output) throw Object.assign(new Error("Não consegui gerar o editorial."), { status: 502 });
  return response.parsed_output;
}
