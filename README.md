# Frédy · Orçamentos

Gerador de orçamentos de viagem: o atendente cola o print da cotação (FRT, Azul Viagens…), a IA lê os dados, o atendente revisa em 4 passos e gera um link bonito pro cliente, com uma ou mais opções pra comparar.

## Rodando

```bash
npm install
cp .env.example .env     # edite ANTHROPIC_API_KEY (e ATTENDANT_TOKEN se quiser senha)
npm start                # http://localhost:3000
```

- `http://localhost:3000/` → gerador (o "pop-up").
- `http://localhost:3000/p/<id>` → página pública que o cliente recebe.
- `npm run dev` reinicia sozinho quando um arquivo do servidor muda.

Sem `ANTHROPIC_API_KEY`, tudo funciona exceto a leitura do print (dá pra preencher manualmente).

## Como funciona

```
public/            frontend sem build (HTML + CSS + JS em módulos)
  index.html       gerador em 4 passos  (js/wizard.js, css/wizard.css)
  proposta.html    página do cliente    (js/proposta.js, css/proposta.css)
  js/money.js      cálculo de valor, parcelas e textos (usado nos dois lados)
  js/ui.js         utilidades (ícones, toast, datas, imagens, api)
  css/base.css     identidade Frédy: azul + branco, modo escuro
server/
  app.js           Express: rotas, sessão por cookie, rate limit, headers de segurança
  index.js         sobe o servidor local (npm start)
  extract.js       leitura do print com a API da Anthropic (saída estruturada via zod)
  editorial.js     dicionário de destinos (tagline, destaques, clima, melhor época)
  schema.js        validação do orçamento que chega do navegador
  store.js         propostas, fotos e biblioteca por hotel (escolhe o backend abaixo)
  storage/fs.js    backend local: JSON e fotos em data/
  storage/blob.js  backend Vercel Blob (ativo quando BLOB_READ_WRITE_TOKEN existe)
api/index.js       entrada da Vercel (reexporta o app Express)
vercel.json        rewrites + limites da função
data/              (só local) proposals/, uploads/ e library.json
```

### Fluxo do atendente

1. **Print** – cola (Ctrl+V), arrasta ou escolhe a imagem. "Extrair dados com IA" preenche tudo.
2. **Revisão** – destino, editorial (com "Outra variação"), voo de ida/volta com conexões, hotéis (com biblioteca de fotos e upload), o que está incluso, passageiros. "+ Adicionar opção" cola outro print no mesmo link.
3. **Valor** – total ou por pessoa, promocode, formas de pagamento (cartão/boleto/PIX, parcelas, entrada, 1ª parcela maior) e como destacar o valor, com prévia ao vivo.
4. **Revisão final** – cliente, validade, resumo, observações, "Ver prévia" e "Tudo certo — gerar".
5. **Resultado** – link fixo, "Baixar PDF" (impressão da página), mensagem pronta pro WhatsApp. "Meus orçamentos" lista tudo, mostra visitas e qual opção o cliente escolheu.

### Página do cliente

Barra "Escolha sua opção" (quando há mais de uma), capa com destino e tagline, voos com conexões, hotel com galeria e lightbox, mapa, "Sobre o destino", "Tudo isso incluso", valor em destaque com desconto, observações, rodapé com validade e botão "Quero essa viagem" (abre o WhatsApp do atendente e registra a escolha).

## Deploy na Vercel

O repositório já está preparado (`vercel.json` + `api/index.js`). Na Vercel não há disco persistente, então propostas e fotos vão pro **Vercel Blob** (store público ou privado, tanto faz: tudo é gravado como privado e as fotos são servidas pelo app).

1. Importe o repositório na Vercel (framework: *Other*, sem build command).
2. Em **Storage → Create → Blob**, crie um store e conecte ao projeto. Isso cria a variável `BLOB_READ_WRITE_TOKEN` sozinha. Sem ela o app roda, mas perde os dados a cada deploy.
3. Em **Settings → Environment Variables**, adicione:
   - `ANTHROPIC_API_KEY` – chave da Anthropic (leitura do print).
   - `ATTENDANT_TOKEN` – senha da equipe (recomendado, já que a URL é pública).
   - `SESSION_SECRET` – texto longo e aleatório.
   - `FRAME_ANCESTORS` – `self https://app.seudominio.com.br` quando for embutir no Frédy.
   - `PUBLIC_URL` – opcional; sem ela o link usa o domínio da própria requisição.
   - `GOOGLE_PLACES_API_KEY` – fotos do hotel (ver abaixo).
   - `UNSPLASH_ACCESS_KEY` ou `PEXELS_API_KEY` – foto de capa do destino.
4. Faça o deploy. O gerador fica em `https://SEU-PROJETO.vercel.app/`.

## Fotos automáticas

Depois da leitura do print, o gerador busca sozinho até 6 fotos do hotel e uma foto de capa do destino. O atendente pode trocar, tirar ou subir as suas.

- **Hotel → Google Places API (New).** No [Google Cloud Console](https://console.cloud.google.com) crie um projeto, ative *Places API (New)*, crie uma chave em *APIs e serviços → Credenciais* e restrinja a chave a essa API. A chave fica só no servidor: as fotos passam pelo proxy `/img/place/...` (nada é copiado; o navegador e o CDN guardam por um dia). O Google dá uma franquia mensal gratuita que cobre o uso de uma agência; acima disso cobra por mil buscas.
- **Destino → Unsplash** ([unsplash.com/developers](https://unsplash.com/developers), *New Application → Access Key*; 50 buscas/hora no modo demo, mais do que suficiente) **ou Pexels** ([pexels.com/api](https://www.pexels.com/api/)). A foto é usada por link direto, com crédito do fotógrafo no canto da capa, como as duas plataformas pedem.

Sem nenhuma chave o app funciona igual, só sem as fotos automáticas.

Limites que valem na Vercel: cada requisição aceita até 4,5 MB, por isso o navegador comprime o print para até 3 MB e as fotos para 1,2 MB antes de enviar; a função tem 120 s de teto (`vercel.json`), suficiente pra leitura do print.

Localmente continua igual (`npm start` usa `data/`). Se quiser testar o Blob na sua máquina, copie o `BLOB_READ_WRITE_TOKEN` pro `.env`.

## Embutir no Frédy depois

O gerador foi feito pra virar um pop-up:

```html
<iframe src="https://SEU-DOMINIO/" style="position:fixed;inset:0;border:0;width:100%;height:100%"></iframe>
```

Ele avisa a página pai via `postMessage`:
- `{ type: "fredy-orcamento:close" }` quando o X é clicado;
- `{ type: "fredy-orcamento:generated", id, url, whatsapp, clientName }` quando o link é gerado (dá pra colar direto na conversa).

Configure `FRAME_ANCESTORS` no `.env` com o domínio do Frédy pra liberar o iframe. Pra abrir um orçamento existente: `/?edit=<id>`.

## Segurança

- A chave da Anthropic fica só no servidor; o navegador nunca a vê.
- Com `ATTENDANT_TOKEN` definido, o gerador pede senha e guarda a sessão em cookie `HttpOnly`. As rotas públicas (`/api/public/*`, `/p/:id`) ficam abertas: o id do link é aleatório (72 bits).
- Imagens são validadas pelos bytes iniciais (PNG/JPEG/WEBP), limitadas a 5 MB e renomeadas no servidor.
- Rate limit em memória nas rotas de IA, upload e criação.
- CSP, `nosniff`, `Referrer-Policy` e `frame-ancestors` configurados.

## Próximos passos sugeridos

- Trocar o armazenamento em JSON por um banco quando houver volume (a interface está em `server/store.js`).
- Login individual por atendente (hoje é uma senha de equipe + nome/e-mail informados no gerador).
- Gerar PDF no servidor (hoje usa a impressão do navegador, com estilo próprio).
