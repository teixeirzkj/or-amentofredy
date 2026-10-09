// Lê o print da cotação com a API da Anthropic e devolve os dados estruturados do orçamento.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const Connection = z.object({
  airport: z.string().nullable().describe("Código IATA do aeroporto de conexão, ex: CNF"),
  arrival: z.string().nullable().describe("Hora de chegada na conexão, HH:MM"),
  departure: z.string().nullable().describe("Hora de partida da conexão, HH:MM"),
});

const FlightLeg = z.object({
  date: z.string().nullable().describe("Data no formato DD/MM/AAAA"),
  origin: z.string().nullable().describe("Código IATA da origem, ex: CWB"),
  destination: z.string().nullable().describe("Código IATA do destino final, ex: MCZ"),
  departure: z.string().nullable().describe("Hora de partida da origem, HH:MM"),
  arrival: z.string().nullable().describe("Hora de chegada no destino final, HH:MM"),
  duration: z.string().nullable().describe("Duração total, ex: 5h 45m"),
  airline: z.string().nullable().describe("Companhia aérea, ex: Azul, Gol, Latam"),
  connections: z.array(Connection).describe("Conexões/escalas, em ordem. Vazio se voo direto."),
});

const Hotel = z.object({
  name: z.string().nullable().describe("Nome do hotel como aparece no print"),
  city: z.string().nullable().describe("Cidade do hotel"),
  checkin: z.string().nullable().describe("Data de entrada, DD/MM/AAAA"),
  checkout: z.string().nullable().describe("Data de saída, DD/MM/AAAA"),
  nights: z.number().int().nullable(),
  board: z.string().nullable().describe("Regime: Café da manhã, Sem refeição, Meia pensão, Pensão completa, All inclusive"),
  room: z.string().nullable().describe("Tipo de quarto/apartamento, se aparecer"),
});

export const EditorialSchema = z.object({
  tagline: z.string().describe("Subtítulo curto e vendedor pro destino, em português, sem ponto final. Ex: O Caribe brasileiro: piscinas naturais e praias de tirar o fôlego"),
  highlights: z.array(z.string()).describe("2 a 3 destaques curtos do destino (praias, pontos turísticos). Ex: Praia do Gunga e Barra de São Miguel"),
  climate: z.string().describe("Clima resumido, ex: Tropical, média 27 graus"),
  best_season: z.string().describe("Melhor época pra visitar, ex: Setembro a março. Vazio se não souber."),
});

export const ExtractionSchema = z.object({
  client_name: z.string().nullable().describe("Nome do cliente/passageiro principal, se aparecer"),
  destination: z.object({
    city: z.string().nullable().describe("Cidade de destino principal, ex: Maceió"),
    region: z.string().nullable().describe("Estado ou país, ex: Alagoas"),
  }),
  passengers: z.object({
    rooms: z.number().int().nullable(),
    adults: z.number().int().nullable(),
    children: z.number().int().nullable(),
  }),
  outbound: FlightLeg.nullable().describe("Voo de ida"),
  inbound: FlightLeg.nullable().describe("Voo de volta. null se somente ida."),
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
    total: z.number().nullable().describe("Preço total da reserva em reais, número puro"),
    per_person: z.number().nullable().describe("Preço por pessoa, se o print mostrar"),
    taxes: z.number().nullable().describe("Taxas de embarque/encargos, se aparecer"),
    insurance_value: z.number().nullable(),
    breakdown: z.array(z.object({ label: z.string(), value: z.number() })).describe("Linhas de valores que aparecem no print"),
  }),
  editorial: EditorialSchema,
  uncertainties: z.array(z.string()).describe("Campos em que você não teve certeza, em português, pra o atendente conferir"),
});

const SYSTEM = `Você lê prints (capturas de tela) de cotações de pacotes de viagem feitas em sistemas de agência (ex: FRT, Azul Viagens, CVC, Decolar) e extrai os dados pra montar um orçamento pro cliente.

Regras:
- Extraia só o que está no print. Se um dado não aparece, use null (ou lista vazia). Nunca invente horários, datas ou valores.
- Datas sempre em DD/MM/AAAA e horas em HH:MM (24h).
- Códigos de aeroporto em IATA maiúsculo (CWB, MCZ, CNF, REC, GRU...).
- No voo com conexão, "origin" e "destination" são os aeroportos de origem e destino FINAL do trecho; cada parada vai em "connections" com a hora que o avião chega e a hora que parte dessa conexão.
- Itinerários costumam listar os trechos em ordem: o primeiro bloco é a ida e o segundo a volta.
- Valores em reais como número (8889.27, não "R$ 8.889,27").
- "editorial" é a única parte que vem do seu conhecimento, não do print: escreva algo curto e vendedor sobre o destino, em português do Brasil.
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
  if (err?.status === 401 || err?.status === 403) return Object.assign(new Error("A chave da API da Anthropic no servidor é inválida. Avise quem cuida do sistema."), { status: 503 });
  if (err?.status === 429 || err?.status === 529) return Object.assign(new Error("A IA está ocupada agora. Tente de novo em alguns segundos."), { status: 429 });
  if (err?.status === 400 || err?.status === 413) return Object.assign(new Error("A IA não aceitou essa imagem. Tente um print menor ou mais nítido."), { status: 422 });
  if (err?.status) return Object.assign(new Error("Falha ao falar com a IA. Tente de novo."), { status: 502 });
  return err;
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
  return response.parsed_output;
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
