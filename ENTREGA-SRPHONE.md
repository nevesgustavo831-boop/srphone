# Calculadora de entrega SR Phone

O cliente escolhe o local no mapa, vê a rota da SR Phone até o endereço e recebe a estimativa de
distância, tempo e valor da entrega, como num app de transporte. Funciona principalmente no celular.

**Como ligar o Google Maps, criar as chaves, colocar no Netlify e acompanhar os custos:
`PRODUCAO-SRPHONE.md`.** Este arquivo explica como a calculadora funciona e como mudar os valores.

## Resumo

**Pronto e testado (com mapa e rotas de TESTE, sem o Google de verdade, porque aqui não há chave):**

- Botão **Calcular entrega** na seção Localização e na página de cada produto.
- "Para onde devemos entregar?": **Usar minha localização** (só depois do toque) ou **Digitar endereço**
  (sugestões enquanto digita: rua, avenida, shopping, bairro; também rua/número/bairro/cidade/CEP ou só o CEP).
- Mapa com a loja (A), o cliente (B) e a rota pelas ruas. Pino no centro para ajustar o ponto.
- Distância e tempo da **rota** (nunca linha reta) e valor pela regra de `DELIVERY_CONFIG`.
- **Retirar na SR Phone · R$ 0,00** sempre visível, com o endereço da loja.
- Acima do limite: sem valor automático e **Consultar entrega pelo WhatsApp**.
- Mensagem organizada no WhatsApp com o produto (do catálogo), o endereço, a distância, o tempo e o
  valor. A pessoa confere e envia (nada é enviado sozinho).
- Assistente SR Phone: "Quanto fica para entregar aqui?" abre a calculadora e depois repete os números
  que vieram do sistema de rotas.
- Serviço fora do ar ou sem chave: "Não conseguimos calcular a entrega agora. Fale com a SR Phone pelo
  WhatsApp." (nunca um preço inventado).

**Os valores (R$ 7 + R$ 1,50 por km, mínimo R$ 8, até 30 km) são de EXEMPLO** e estão marcados assim
(`tarifasConfirmadas: false`): o cliente vê o valor calculado com o aviso "A tabela de entrega está em
confirmação: o valor final a loja combina com você na conversa". Troque pelos valores reais da loja em
`data/config.js` (item 5) e mude para `tarifasConfirmadas: true`.

## 1. Como funciona para o cliente

1. Toca em **Calcular entrega**. Só aí o site baixa o mapa (antes disso, nada de mapa nem de localização).
2. Escolhe **Usar minha localização** (o navegador pergunta se pode) ou **Digitar endereço**.
3. O ponto aparece no mapa. Se precisar, arrasta o mapa até o pino ficar no lugar certo e escreve o
   número, apartamento ou referência. Toca em **Confirmar local**.
4. Vê as duas opções:
   - **Entrega SR Phone**: valor, distância (km) e tempo aproximado, com o botão **Escolher esta entrega**.
   - **Retirar na SR Phone · R$ 0,00**, com o endereço da loja.
5. Ao escolher, o WhatsApp da loja abre com a mensagem pronta. Exemplo (aberta na página do produto):

```
Olá, vim pelo site da SR Phone.

Produto:
iPhone 16 Pro Max 256 GB

Cor:
Preto

Preço no site:
R$ ...

Endereço:
Rua ..., 100 - Cavaleiros, Macaé - RJ · Apto 302

Ponto no mapa:
https://www.google.com/maps/search/?api=1&query=...

Distância:
6,4 km

Tempo estimado:
18 min

Entrega estimada:
R$ 16,60

Gostaria de confirmar o pedido e a entrega.
```

O produto, o armazenamento, a cor e o preço vêm do **catálogo do site** (`data/products.js`), pela
escolha que está aberta na página do produto (ou pelo produto da conversa com o assistente). Aberta
pela seção Localização, a mensagem não tem a parte do produto.

## 2. Por que Google Maps Platform (e por que sem o "Maps JavaScript API")

- O site **já usa o Google Maps** (mapa da seção Localização e o botão "Traçar rota"), então a
  entrega reaproveita o mesmo fornecedor.
- É o que tem o melhor cadastro de endereços do Brasil e a **Routes API** devolve a distância e o tempo
  reais pelas ruas, além do desenho da rota.
- **O mapa comum do Google (Maps JavaScript API) não é usado.** O guia de segurança do próprio Google
  para ele pede uma política de segurança (CSP) com `'unsafe-eval'`, `'strict-dynamic'`, código com
  "nonce" e `worker-src blob:`. O site bloqueia isso de propósito (é o que impede código injetado de
  rodar). Então:
  - o **desenho** do mapa usa o **Leaflet** (código aberto, guardado dentro do site em
    `assets/vendor/leaflet/`) com os **blocos do Google** (**Map Tiles API**), pedidos pelo navegador
    com a chave de navegador;
  - **rota, sugestões de endereço e endereço/ponto** são calculados na **função do servidor**
    (`/api/entrega`), com a chave do servidor, que nunca vai para o navegador.
- Mapbox ou HERE também serviriam. Para trocar, crie um arquivo em `services/entrega/provedores/`
  com as mesmas funções do `google.mjs` e registre em `provedores/index.mjs` (`MAPS_PROVIDER`).

**As APIs do Google realmente usadas pelo código:**

| API | Para quê | Quem chama | Chave |
|---|---|---|---|
| Routes API | rota de carro: distância, tempo e desenho | função do servidor | `MAPS_SERVER_KEY` |
| Places API (New) | sugestões enquanto digita e o ponto do endereço escolhido | função do servidor | `MAPS_SERVER_KEY` |
| Geocoding API | "Usar minha localização" e o pino ajustado → endereço escrito; rua/número/CEP → ponto; a loja → ponto (se `DELIVERY_CONFIG.origem` estiver vazio) | função do servidor | `MAPS_SERVER_KEY` |
| Map Tiles API | os blocos (imagens) do mapa e o texto de direitos | navegador | `MAPS_BROWSER_KEY` |

A Geocoding API é necessária por causa da localização do celular: o GPS dá só um ponto, e a Places
API (New) não transforma ponto em endereço. Sem ela, a mensagem do WhatsApp teria só coordenadas.
Maps JavaScript API, Directions API (antiga), Distance Matrix e Places (antiga) **não** precisam
ser ativadas.

## 3. Arquitetura (onde está cada coisa)

| Parte | Arquivo |
|---|---|
| A loja (origem fixa): nome, prédio, endereço, bairro, cidade, CEP | `data/config.js` → `STORE_CONFIG` |
| Ponto exato da loja (opcional) e valores da entrega | `data/config.js` → `DELIVERY_CONFIG` |
| A ÚNICA conta do valor (a mesma no site e no servidor) | `js/precos.js` → `calcularEntrega()` e `kmEntrega()` |
| Botões "Calcular entrega" e o espaço da janela | `index.html` (`data-entrega`, `#entrega`) |
| Liga os botões e baixa a calculadora só no toque | `js/entrega.js` |
| A tela: mapa, localização, endereço, resultado, WhatsApp | `js/entrega-app.js` |
| Visual (celular e computador) | `css/styles.css` (bloco "calculadora de entrega") |
| Mapa (Leaflet 1.9.4, sem alterações) | `assets/vendor/leaflet/` |
| Mensagem do WhatsApp com várias linhas | `js/whatsapp.js` → `zapLinhas()` |
| Função do servidor (`/api/entrega`) | `netlify/functions/entrega.mjs` |
| Regras do servidor: validação, origem, limites, rota, valor | `services/entrega/index.mjs` |
| Google: rota, sugestões, endereço | `services/entrega/provedores/google.mjs` |
| CEP → rua, bairro e cidade (ViaCEP) | `services/entrega/cep.mjs` |
| Leitura de `data/config.js` pelo servidor | `services/dados-site.mjs` |
| Assistente: intenção "entrega" e a resposta com os números | `js/assistente-cerebro.js`, `js/assistente.js` |
| Testes | `ferramentas/testes-entrega.mjs`, `ferramentas/testes-entrega-navegador.mjs`, `ferramentas/entrega-falsa.mjs` |

O caminho de um cálculo:

```
navegador (js/entrega-app.js)                 servidor (/api/entrega)                   Google
  toca "Confirmar local" ── { acao: "rota", lat, lng } ──▶ confere Origin, pedido e limite
                                                            longe demais em linha reta? → "fora"
                                                            ─────────── Routes API ──────────▶ rota
                                                            valor = calcularEntrega(km da rota)
  mostra km, tempo, valor ◀── { distanciaKm, duracaoMin, valor, rota } ──
```

A linha reta só serve para recusar, sem gastar consulta, um ponto que já está longe demais (a rota
nunca é mais curta que a linha reta). **O preço sempre usa a distância da rota.** O navegador nunca
manda nem calcula o valor: ele só recebe.

## 4. Chaves e Google Cloud

Tudo em `PRODUCAO-SRPHONE.md` (itens 4 a 11 e 14). Resumo:

- `MAPS_SERVER_KEY`: só no Netlify; restrita a Routes API, Places API (New) e Geocoding API.
  (O nome antigo `MAPS_API_KEY` ainda funciona.)
- `MAPS_BROWSER_KEY`: aparece no navegador, **de propósito** (é assim com qualquer mapa na web). Quem a
  protege são as restrições do Google Cloud: só o domínio do site e só a Map Tiles API.
- Sem `MAPS_BROWSER_KEY` (ou com ela recusada): a calculadora funciona sem o desenho do mapa.
- Sem `MAPS_SERVER_KEY`: a calculadora não calcula e mostra a retirada e o WhatsApp.

**Ponto da loja:** por padrão, o servidor acha a loja pelo endereço de `STORE_CONFIG`
(Macaé Business Center, Av. Atlântica, 386, Sala 211, Praia Campista, Macaé - RJ, 27920-325) e guarda
o ponto. Para mais precisão (e uma consulta a menos), preencha `DELIVERY_CONFIG.origem.lat` e `lng`
com o ponto exato da entrada do prédio (as instruções estão no próprio `data/config.js`). O cliente
nunca muda a origem.

**Direitos do mapa:** o canto do mapa mostra "Google" e o texto de direitos que a própria Map Tiles
API devolve. Confira nos termos atuais da Map Tiles API se é preciso usar a **imagem oficial** do
logotipo do Google; se for, coloque a imagem em `assets/` e troque o texto "Google" em
`js/entrega-app.js` (função `montaEsqueleto`).

## 5. Como mudar os valores

Em `data/config.js`, item 8:

```js
var DELIVERY_CONFIG = {
  ligada:            true,
  baseFee:           7,       /* taxa inicial, em reais */
  pricePerKm:        1.5,     /* valor por quilômetro da rota, em reais */
  minimumFee:        8,       /* valor mínimo da entrega, em reais */
  maximumDistanceKm: 30,      /* limite da entrega automática, em km de rota */
  roundingMode:      "centavos",
  considerarTransito: false,
  ...
};
```

- **Conta** (`calcularEntrega`, em `js/precos.js`, a única do projeto):
  `valor = baseFee + km da rota × pricePerKm` → arredondamento → nunca menos que `minimumFee`.
  Exemplo: 6,4 km → 7 + 6,4 × 1,5 = **R$ 16,60**. 0,5 km → 7,75 → vale o mínimo, **R$ 8,00**.
- A distância entra com uma casa decimal (6,43 km → 6,4 km), a mesma que aparece na tela.
- **Arredondamento** (`roundingMode`), com o exemplo de R$ 16,63 antes de arredondar:

| Regra | Resultado | O que faz |
|---|---|---|
| `"centavos"` (padrão) | R$ 16,63 | valor normal, com duas casas |
| `"dez-centavos"` | R$ 16,60 | os R$ 0,10 mais próximos |
| `"dez-centavos-acima"` | R$ 16,70 | sobe para os próximos R$ 0,10 |
| `"cinquenta-centavos-acima"` | R$ 17,00 | sobe para os próximos R$ 0,50 |
| `"final-90"` | R$ 16,90 | sobe para o próximo valor terminado em ,90 |

- Acima de `maximumDistanceKm`: sem valor automático, só a consulta pelo WhatsApp.
- `considerarTransito: true`: o tempo considera o trânsito da hora (no Google, a consulta custa mais).
- `ligada: false`: some o botão "Calcular entrega" do site e a função para de responder.
- Números **sem aspas** e com ponto (1.5, não "1,5"). O `npm run build` avisa se algo estiver errado
  (inclusive regra de arredondamento que não existe).
- O site e o servidor leem o **mesmo arquivo**: mudou aqui, mudou nos dois (depois de publicar).

## 6. Como testar no computador

```
npm start               → abre em http://localhost:8080 (roda a função /api/entrega também)
npm run test:entrega    → testes do servidor (sem Google, sem chave)
npm test                → tudo, inclusive a calculadora num navegador de verdade
```

Para testar com o Google de verdade no computador, crie um arquivo `.env` (ele nunca vai para o
GitHub) com `MAPS_SERVER_KEY=...` e `MAPS_BROWSER_KEY=...`. Na chave do navegador, cadastre também
`http://localhost:8080/*` nos sites permitidos enquanto testa (e tire depois).

A **localização do celular** só funciona em `https://` (ou `localhost`). No site publicado já é https.

## 7. Segurança

- `MAPS_SERVER_KEY` só existe no servidor (Netlify). Ela não vai no HTML, no JavaScript, nas respostas
  da função (nem nas de erro), no armazenamento do navegador nem no registro (os testes conferem).
- O `npm run lint` recusa qualquer chave do Google (`AIza...`) escrita no projeto, qualquer chamada do
  navegador às APIs de rota/endereço e qualquer armazenamento do local do cliente.
- A proteção do site (CSP) tem só `https://tile.googleapis.com` a mais (blocos e direitos do mapa).
  Nada de `unsafe-eval` nem de scripts de fora.
- `Permissions-Policy: geolocation=(self)`: a localização só pode ser pedida pelo próprio site.
- A função confere: só POST, com `Origin` do próprio site (ou de `MAPS_ORIGENS`; sem `Origin` = robô,
  recusado), só JSON, pedido pequeno (4 KB), pontos só no Brasil e a até 300 km da loja, tempo máximo de
  8 s por consulta ao Google, limite por visitante (`ENTREGA_LIMITE_MINUTO` e `ENTREGA_LIMITE_HORA`) e
  também o limite do próprio Netlify por IP (90 por minuto). Valor mandado pelo navegador é ignorado.

## 8. Privacidade

- A localização **só é pedida depois do toque** em "Usar minha localização" (o site nunca pede ao abrir).
- O ponto e o endereço ficam **só na memória da tela aberta**: nada em `localStorage`,
  `sessionStorage`, cookie ou banco. Somem ao fechar ou recarregar a página (os testes conferem).
- A medição (Google Analytics, quando ligado) conta só "abriu", "usou localização", "calculou" e
  "escolheu", **sem coordenada nem endereço**.
- O registro da função no Netlify guarda só a ação e o código do erro (ex.: `{"entrega":"rota","erro":"indisponivel"}`).
- Para calcular, o ponto e o endereço passam pela função e pelo Google Maps Platform.
- A loja só recebe o endereço e o ponto no mapa se a pessoa escolher a entrega e enviar a mensagem.
- A **política de privacidade** do site tem o item "Calculadora de entrega".
- O Assistente guarda a conversa na aba (como já fazia), mas a resposta da entrega tem só o valor, os
  km e os minutos, nunca o endereço.

## 9. O que o cliente vê em cada situação

| Situação | O cliente vê |
|---|---|
| Deu tudo certo | Entrega (valor, km, tempo) + retirada R$ 0,00 + WhatsApp |
| Endereço acima do limite | "Esse endereço está fora da nossa área de entrega automática." + Consultar entrega pelo WhatsApp + retirada |
| Localização negada | "Você não permitiu o uso da localização. Tudo bem: digite o endereço de entrega." |
| Endereço que não existe | "Nenhum endereço encontrado" nas sugestões, ou aviso para conferir e o campo de novo |
| Sem caminho de carro até o ponto | Aviso para ajustar o ponto, WhatsApp e retirada |
| Google fora do ar, sem chave, chave recusada, função não publicada, sem internet | "Não conseguimos calcular a entrega agora. Fale com a SR Phone pelo WhatsApp." + retirada (sem valor) + "A retirada na loja não tem custo..." Nenhum código técnico na tela: o motivo fica em `SREntrega.info().erro` e no atributo `data-erro` (o que cada um quer dizer: `PRODUCAO-SRPHONE.md`, item 15) |
| Só o desenho do mapa falhou | A calculadora continua, sem o mapa, e calcula normalmente |
| Muitos pedidos seguidos | As sugestões param por um instante; no cálculo, o aviso com o WhatsApp (sem valor) |

## 10. Testes

- `npm run test:entrega` (servidor): regra de preço e arredondamento, mudança em `data/config.js`,
  validação do pedido, Origin obrigatório, chave do servidor que nunca sai (nem em erro do Google), sem
  chave, nome antigo `MAPS_API_KEY`, loja como ponto A, sugestões, endereço por partes, CEP,
  localização → endereço, rota maior que a linha reta, fora da área, falhas sem valor, registro sem
  endereço, limite por visitante e as chamadas ao Google com respostas simuladas.
- `npm test` (navegador): nada pedido ao abrir o site, localização permitida e negada, sugestões com
  teclado, endereço inexistente, formulário por partes, CEP, rota com A e B, distância, tempo e valor
  iguais aos do servidor, fora da área, WhatsApp sem envio automático, contexto do produto, 375, 390,
  430, 768 e 1280 px, teclado aberto, mapa recusado, falha do serviço, função quebrada, sem chave,
  `ligada: false`, nada guardado no navegador, medição sem local e o assistente repetindo os números.
- **Não testado:** as chamadas reais ao Google (sem chave aqui) e a permissão de localização num
  iPhone/Android de verdade. Faça isso depois de publicar (`PRODUCAO-SRPHONE.md`, item 13).

## 11. Limitações conhecidas

- É uma **estimativa**: o site não cobra nem reserva a entrega; a loja confirma na conversa.
- O tempo, por padrão, não considera o trânsito da hora (`considerarTransito`).
- Publicar arrastando a pasta no Netlify (Netlify Drop) não publica funções: a calculadora mostra a
  retirada e o WhatsApp. Use o deploy pelo GitHub.
- A prévia (Artifact) não tem servidor, então mostra a tela de "Não conseguimos calcular a entrega agora".
- O limite por visitante da função vale por cópia da função (o Netlify pode ter várias); o limite do
  próprio Netlify por IP e as cotas do Google Cloud completam essa proteção.
- As imagens padrão do Leaflet (`images/`) não estão no projeto porque a calculadora não as usa.
