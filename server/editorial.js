// Dicionário editorial de destinos: tagline, destaques, clima e melhor época.
// Cada destino pode ter várias variações (o botão "Outra variação" alterna entre elas).
// bestMonths: meses (1-12) em que a "melhor época" faz sentido. Fora deles, o campo vai vazio pra não contradizer a venda.

const D = {
  "maceio": {
    variants: [
      { tagline: "O Caribe brasileiro: piscinas naturais e praias de tirar o fôlego", highlights: ["Praia do Gunga e Barra de São Miguel", "Praias de Pajuçara e Jatiúca no centro"] },
      { tagline: "Mar verde-esmeralda, coqueirais e jangadas até as piscinas naturais", highlights: ["Piscinas naturais de Pajuçara", "Praia do Francês e Praia de Ipioca"] },
      { tagline: "Águas mornas e transparentes o ano inteiro", highlights: ["Rota Ecológica dos Milagres", "Praia de Ponta Verde e orla de Jatiúca"] },
    ],
    climate: "Tropical, média 27 graus", bestSeason: "Setembro a março", bestMonths: [9, 10, 11, 12, 1, 2, 3],
  },
  "porto de galinhas": {
    variants: [
      { tagline: "Piscinas naturais de água morna e cristalina", highlights: ["Piscinas naturais na maré baixa", "Praia de Muro Alto e Praia dos Carneiros"] },
      { tagline: "Eleita várias vezes a praia mais bonita do Brasil", highlights: ["Passeio de jangada às piscinas naturais", "Vila charmosa com restaurantes à beira-mar"] },
    ],
    climate: "Tropical, média 26 graus", bestSeason: "Setembro a março", bestMonths: [9, 10, 11, 12, 1, 2, 3],
  },
  "recife": {
    variants: [
      { tagline: "Cultura, história e praias urbanas no coração do Nordeste", highlights: ["Praia de Boa Viagem", "Recife Antigo e Marco Zero"] },
      { tagline: "A Veneza brasileira, entre pontes, frevo e mar morno", highlights: ["Olinda e seus casarios coloniais", "Praia de Boa Viagem"] },
    ],
    climate: "Tropical, média 26 graus", bestSeason: "Setembro a março", bestMonths: [9, 10, 11, 12, 1, 2, 3],
  },
  "natal": {
    variants: [
      { tagline: "A cidade do sol: dunas, lagoas e praias de água morna", highlights: ["Praia de Ponta Negra e Morro do Careca", "Dunas de Genipabu de buggy"] },
      { tagline: "Buggy nas dunas, mergulho em Maracajaú e sol o ano todo", highlights: ["Parrachos de Maracajaú", "Praia de Pipa e Baía dos Golfinhos"] },
    ],
    climate: "Tropical, média 27 graus", bestSeason: "Setembro a fevereiro", bestMonths: [9, 10, 11, 12, 1, 2],
  },
  "fortaleza": {
    variants: [
      { tagline: "Praias urbanas, falésias coloridas e o melhor da cultura cearense", highlights: ["Beach Park e Praia do Futuro", "Cumbuco e Canoa Quebrada"] },
      { tagline: "Sol forte, mar quente e jangadas no horizonte", highlights: ["Praia de Iracema e Meireles", "Passeio a Morro Branco e Praia das Fontes"] },
    ],
    climate: "Tropical, média 28 graus", bestSeason: "Julho a dezembro", bestMonths: [7, 8, 9, 10, 11, 12],
  },
  "jericoacoara": {
    variants: [
      { tagline: "Um vilarejo de areia entre dunas, lagoas e o pôr do sol mais famoso do Brasil", highlights: ["Pôr do sol na Duna", "Lagoa do Paraíso e Lagoa Azul"] },
    ],
    climate: "Tropical seco, média 28 graus", bestSeason: "Julho a janeiro", bestMonths: [7, 8, 9, 10, 11, 12, 1],
  },
  "salvador": {
    variants: [
      { tagline: "Axé, história e mar: a capital mais vibrante do Brasil", highlights: ["Pelourinho e Elevador Lacerda", "Praia do Forte e Farol da Barra"] },
      { tagline: "Cores, música e sabores em cada esquina", highlights: ["Mercado Modelo e Igreja do Bonfim", "Praias de Itapuã e Stella Maris"] },
    ],
    climate: "Tropical, média 26 graus", bestSeason: "Setembro a março", bestMonths: [9, 10, 11, 12, 1, 2, 3],
  },
  "porto seguro": {
    variants: [
      { tagline: "Onde o Brasil começou: praias, história e noites animadas", highlights: ["Arraial d'Ajuda e Trancoso", "Passarela do Álcool e Centro Histórico"] },
      { tagline: "Praias de coqueiros e vilas charmosas no sul da Bahia", highlights: ["Praia do Espelho", "Recife de Fora e Coroa Vermelha"] },
    ],
    climate: "Tropical, média 25 graus", bestSeason: "Setembro a março", bestMonths: [9, 10, 11, 12, 1, 2, 3],
  },
  "joao pessoa": {
    variants: [
      { tagline: "O ponto mais oriental das Américas, com praias tranquilas e mar morno", highlights: ["Praias de Tambaú e Cabo Branco", "Piscinas naturais de Picãozinho"] },
    ],
    climate: "Tropical, média 27 graus", bestSeason: "Setembro a março", bestMonths: [9, 10, 11, 12, 1, 2, 3],
  },
  "sao luis": {
    variants: [
      { tagline: "Azulejos, reggae e a porta de entrada dos Lençóis Maranhenses", highlights: ["Centro Histórico Patrimônio da Humanidade", "Lençóis Maranhenses e Barreirinhas"] },
    ],
    climate: "Tropical, média 27 graus", bestSeason: "Junho a setembro", bestMonths: [6, 7, 8, 9],
  },
  "lencois maranhenses": {
    variants: [
      { tagline: "Dunas brancas e lagoas de água doce num cenário de outro planeta", highlights: ["Lagoa Azul e Lagoa Bonita", "Passeio de lancha pelo Rio Preguiças"] },
    ],
    climate: "Quente, média 28 graus", bestSeason: "Junho a setembro, com as lagoas cheias", bestMonths: [6, 7, 8, 9],
  },
  "fernando de noronha": {
    variants: [
      { tagline: "O paraíso preservado: mar azul, golfinhos e praias de cartão-postal", highlights: ["Baía do Sancho e Baía dos Porcos", "Mergulho e golfinhos na Baía dos Golfinhos"] },
    ],
    climate: "Tropical, média 27 graus", bestSeason: "Agosto a dezembro", bestMonths: [8, 9, 10, 11, 12],
  },
  "rio de janeiro": {
    variants: [
      { tagline: "A Cidade Maravilhosa entre o mar e a montanha", highlights: ["Cristo Redentor e Pão de Açúcar", "Copacabana, Ipanema e Lapa"] },
      { tagline: "Praias icônicas, samba e vistas que só o Rio tem", highlights: ["Bondinho do Pão de Açúcar", "Praia de Ipanema e Arpoador"] },
    ],
    climate: "Tropical, média 25 graus", bestSeason: "Abril a outubro", bestMonths: [4, 5, 6, 7, 8, 9, 10],
  },
  "buzios": {
    variants: [
      { tagline: "A península charmosa com mais de 20 praias e clima mediterrâneo", highlights: ["Praia de Geribá e Ferradura", "Rua das Pedras e Orla Bardot"] },
    ],
    climate: "Tropical, média 25 graus", bestSeason: "Abril a outubro", bestMonths: [4, 5, 6, 7, 8, 9, 10],
  },
  "florianopolis": {
    variants: [
      { tagline: "A Ilha da Magia: 40 praias, lagoas e natureza por todo lado", highlights: ["Praia de Jurerê e Canasvieiras", "Lagoa da Conceição e Praia Mole"] },
    ],
    climate: "Subtropical, média 21 graus", bestSeason: "Dezembro a março", bestMonths: [12, 1, 2, 3],
  },
  "gramado": {
    variants: [
      { tagline: "Charme europeu, chocolate e clima de montanha na Serra Gaúcha", highlights: ["Lago Negro e Rua Coberta", "Canela e a Catedral de Pedra"] },
      { tagline: "O destino mais aconchegante do Sul, em qualquer estação", highlights: ["Natal Luz e Mini Mundo", "Vinícolas do Vale dos Vinhedos"] },
    ],
    climate: "Serra, média 15 graus", bestSeason: "Junho a agosto, no frio", bestMonths: [5, 6, 7, 8, 11, 12],
  },
  "foz do iguacu": {
    variants: [
      { tagline: "Uma das sete maravilhas naturais do mundo", highlights: ["Cataratas do Iguaçu", "Parque das Aves e Itaipu"] },
    ],
    climate: "Subtropical, média 22 graus", bestSeason: "Março a maio", bestMonths: [3, 4, 5, 8, 9, 10],
  },
  "bonito": {
    variants: [
      { tagline: "Rios de água cristalina, grutas e flutuação entre peixes", highlights: ["Gruta do Lago Azul", "Flutuação no Rio da Prata"] },
    ],
    climate: "Tropical, média 24 graus", bestSeason: "Abril a outubro", bestMonths: [4, 5, 6, 7, 8, 9, 10],
  },
  "sao paulo": {
    variants: [
      { tagline: "A capital da gastronomia, da cultura e das compras", highlights: ["Avenida Paulista e MASP", "Mercado Municipal e Vila Madalena"] },
    ],
    climate: "Subtropical, média 20 graus", bestSeason: "", bestMonths: [],
  },
  "cancun": {
    variants: [
      { tagline: "Mar turquesa, resorts all inclusive e a cultura maia a um passo", highlights: ["Isla Mujeres e Playa del Carmen", "Chichén Itzá e cenotes"] },
    ],
    climate: "Tropical, média 28 graus", bestSeason: "Dezembro a abril", bestMonths: [12, 1, 2, 3, 4],
  },
  "punta cana": {
    variants: [
      { tagline: "Praias infinitas de areia branca e resorts com tudo incluso", highlights: ["Praia de Bávaro", "Ilha Saona e Hoyo Azul"] },
    ],
    climate: "Tropical, média 28 graus", bestSeason: "Dezembro a abril", bestMonths: [12, 1, 2, 3, 4],
  },
  "orlando": {
    variants: [
      { tagline: "A capital mundial da diversão", highlights: ["Walt Disney World e Universal", "Outlets e compras"] },
    ],
    climate: "Subtropical, média 23 graus", bestSeason: "Setembro a novembro e fevereiro a abril", bestMonths: [9, 10, 11, 2, 3, 4],
  },
  "buenos aires": {
    variants: [
      { tagline: "Tango, parrillas e charme europeu na capital argentina", highlights: ["Caminito e La Boca", "Palermo, Recoleta e Puerto Madero"] },
    ],
    climate: "Temperado, média 18 graus", bestSeason: "Março a maio e setembro a novembro", bestMonths: [3, 4, 5, 9, 10, 11],
  },
  "santiago": {
    variants: [
      { tagline: "Vinhos, Cordilheira dos Andes e neve a poucas horas da cidade", highlights: ["Valle Nevado e Farellones", "Vinícolas de Casablanca e Valparaíso"] },
    ],
    climate: "Mediterrâneo, média 15 graus", bestSeason: "Junho a setembro, na neve", bestMonths: [6, 7, 8, 9],
  },
  "lisboa": {
    variants: [
      { tagline: "Luz, miradouros e fado numa das capitais mais charmosas da Europa", highlights: ["Belém e Torre de Belém", "Alfama, Sintra e Cascais"] },
    ],
    climate: "Mediterrâneo, média 17 graus", bestSeason: "Abril a outubro", bestMonths: [4, 5, 6, 7, 8, 9, 10],
  },
  "paris": {
    variants: [
      { tagline: "A cidade luz, do café na calçada à Torre Eiffel", highlights: ["Torre Eiffel e Louvre", "Montmartre e Champs-Élysées"] },
    ],
    climate: "Temperado, média 12 graus", bestSeason: "Abril a junho e setembro a outubro", bestMonths: [4, 5, 6, 9, 10],
  },
};

const ALIASES = {
  "maceio al": "maceio", "porto de galinhas pe": "porto de galinhas", "ipojuca": "porto de galinhas",
  "florianopolis sc": "florianopolis", "floripa": "florianopolis", "rio": "rio de janeiro", "foz": "foz do iguacu",
  "noronha": "fernando de noronha", "lencois": "lencois maranhenses", "barreirinhas": "lencois maranhenses",
  "armacao dos buzios": "buzios", "canela": "gramado", "punta cana dr": "punta cana",
};

export function normalizeCity(name = "") {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * @param {string} city
 * @param {number|null} month  mês da viagem (1-12)
 * @param {number} variant  índice da variação
 * @returns {{tagline,highlights,climate,bestSeason,variant,total}|null}
 */
export function lookupEditorial(city, month = null, variant = 0) {
  let key = normalizeCity(city);
  key = ALIASES[key] || key;
  let entry = D[key];
  if (!entry && key) {
    const hit = Object.keys(D).find((k) => key.startsWith(k) || k.startsWith(key));
    if (hit) entry = D[hit];
  }
  if (!entry) return null;
  const total = entry.variants.length;
  const idx = ((variant % total) + total) % total;
  const v = entry.variants[idx];
  const seasonOk = !month || entry.bestMonths.length === 0 || entry.bestMonths.includes(month);
  return {
    tagline: v.tagline,
    highlights: v.highlights,
    climate: entry.climate,
    bestSeason: seasonOk ? entry.bestSeason : "",
    variant: idx,
    total,
  };
}

export const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
