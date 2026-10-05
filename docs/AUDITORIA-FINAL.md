# AUDITORIA FINAL SR PHONE

Data: 25/09/2026 · Branch: `Srphone`

Escopo: auditoria técnica, visual, comercial e funcional do site inteiro, com as correções aplicadas direto no projeto. O site **não** foi recriado: identidade visual, catálogo, equipe, troca, WhatsApp, SEO, segurança, agendamento e PWA foram mantidos. **Nenhum dado foi inventado.**

---

## Erros encontrados

**Comercial e textos**
1. Produto sem preço mostrava "Consulte o preço", fora do padrão pedido ("Preço sob consulta" + "Consultar no WhatsApp").
2. Um produto não confirmado pela Apple (bloco comentado em `data/products.js`) continuava num arquivo público.
3. Frase "Linha atual da Apple, tudo novo e lacrado" no catálogo, e "direto da linha atual da Apple" no lacre, nos motivos e no FAQ.
4. "1 ano de garantia Apple na rede autorizada" em 6 lugares (lacre, motivos, FAQ, página do produto, garantias e ficha técnica), sem comprovação.
5. Frases de comparação de preço sem preço publicado em 8 produtos: "o MacBook mais barato", "o iPad com o melhor preço da loja", "por bem menos", "preço bem mais amigável", "melhor custo-benefício da lista" etc.
6. Textos que prometiam estoque imediato: "sair com ele no mesmo dia" e "Troca feita na hora".
7. Formas de pagamento e cidade escritas à mão no cartão de contato, na ficha do produto, no FAQ e na descrição do produto, em vez de virem do `data/config.js`.
8. "Seu iPhone usado como entrada" aparecia como forma de pagamento também em Mac, iPad, Watch e AirPods, que não aceitam troca.

**Troca (trade-in)**
9. Não havia o aviso "A simulação não garante o valor final".
10. A saúde da bateria aceitava 0 ou 150% sem avisar.
11. Não havia os eventos `trade_in_start` e `trade_in_submit`.
12. A lista "iPhone que você tem hoje" não tinha iPhone 17 Pro Max, 17 Pro, Air, 17e, 16e, os modelos Plus, os mini e o SE.

**Janelas (modais)**
13. As janelas de vídeo e de foto não tinham `role="dialog"` nem `aria-modal`.
14. No vídeo, o Tab levava o foco para fora da janela.
15. Ao fechar a política de privacidade, o vídeo, a foto ou o produto, o foco não voltava para o botão que abriu a janela.
16. A agenda da loja (`#/agenda`) não fechava com Esc nem com clique fora.
17. Cada janela travava e soltava a rolagem por conta própria, o que abria espaço para conflito entre duas janelas.
18. A foto ampliada começava com `src=""`.

**Textos desatualizados**
19. A agenda da loja mandava preencher "agendaOnline no bloco EDITE AQUI do index.html", um lugar que não existe mais.
20. O comentário da seção Equipe apontava para o "EDITE AQUI".
21. O botão do Google dizia "Veja nossas avaliações no Google".
22. README, LEIA-ME e `docs/RELATORIO.md` falavam em 21 produtos, "Consulte o preço", "imagens guardadas 1 ano" e um passo de 3D do Higgsfield abandonado. A lista de eventos também estava incompleta.
23. O domínio provisório do Netlify aparecia nos exemplos do LEIA-ME e do SQL do Telegram.

**Imagem e cache**
24. Se a foto de um card ou do produto não carregasse, sobrava uma caixa vazia.
25. `/assets/*` ficava em cache "imutável" por 1 ano, mas 3 imagens tinham sido trocadas com o mesmo nome. Quem já tinha visitado continuaria vendo a versão antiga.

**Segurança, CSS e acessibilidade**
26. O `Permissions-Policy` tinha `interest-cohort`, recurso descontinuado que gera aviso no console do Chrome.
27. O CSS tinha 3 regras duplicadas (`.pdp-thumb.thumb-modelo`) e 2 classes sem uso (`.meta-ok`, `.selo-disp`).
28. Os links de seção da barra de categorias tinham 22 px de altura, abaixo do mínimo de toque.
29. O foco pelo teclado ficava pouco visível na busca, na ordenação e nos seletores da troca.
30. O FAQ e os motivos entravam no HTML sem escape.
31. O `assets/icons/icon-32.png` existia mas não era usado.

## Erros corrigidos

Todos os 31 acima:

- **1:** "Preço sob consulta" + "Consulte no WhatsApp o valor e as condições de pagamento" no card e na página do produto. O botão "Consultar no WhatsApp" foi mantido. O Schema continua sem `Offer` enquanto não houver preço (tem teste para isso).
- **2:** bloco removido. O relatório antigo não cita mais o nome.
- **3:** texto sugerido: "iPhones, iPads, Macs, Apple Watch e AirPods novos e lacrados. Confira modelos, cores e capacidades disponíveis." As outras frases viraram "na caixa original".
- **4:** novo campo `STORE_CONFIG.garantia` no `data/config.js`, hoje "Garantia do fabricante, nos termos e prazos definidos pela Apple". Todos os pontos leem desse campo. Vazio, a linha some.
- **5:** frases trocadas por características reais do aparelho, sem comparação de preço.
- **6:** agora "tirar suas dúvidas com calma e conferir tudo antes de comprar" e "Troca fechada na loja".
- **7 e 8:** o contato, a ficha, o FAQ e a descrição leem `pagamentos`, `pagamentoNota`, `cidade` e `garantia` do config. "Seu iPhone na troca" só aparece em iPhone.
- **9 a 12:**
  - aviso de simulação no simulador e na página do produto;
  - erro no próprio campo para bateria fora de 1–100% (o valor é corrigido ao sair do campo);
  - trava no botão se faltar o modelo ou a versão (inline, sem `alert()`);
  - eventos de troca no simulador e na página do produto;
  - lista de iPhones atualizada, só com modelos reais.
- **13 a 18:** uma regra única de janelas em `js/core.js` (`abreJanela` e `fechaJanela`) para produto, vídeo, foto, políticas e agenda:
  - foco inicial dentro da janela;
  - Tab preso nela;
  - Esc e clique fora fecham;
  - o foco volta para quem abriu, ou para o card redesenhado do mesmo produto;
  - a rolagem da página só volta quando não sobra nenhuma janela aberta.
- **19 a 23:** textos atualizados. Os exemplos do domínio agora usam `ENDERECO-DO-SITE`, e o `SITE_CONFIG.url` é o único lugar com o endereço (SITE_URL).
- **24:** imagem que não carrega vira "Imagem em atualização" no card e na página do produto.
- **25:** as 3 imagens foram renomeadas com `-v2`, e o cache de `/assets/*` passou para 1 hora com revalidação.
- **26:** `interest-cohort` removido do `_headers` e do `netlify.toml`, que continuam iguais. A CSP não foi afrouxada.
- **27 a 31:** regras duplicadas e sem uso removidas; links da barra com 34 px; anel de foco visível na busca, na ordenação, nos seletores e nos chips; escape no FAQ e nos motivos; `icon-32.png` ligado como favicon.

## Arquivos alterados

- `index.html`
- `404.html`
- `css/styles.css`
- `data/config.js`
- `data/products.js`
- `js/core.js`
- `js/site.js`
- `js/catalog.js`
- `js/trade.js`
- `js/scheduling.js`
- `js/whatsapp.js`
- `js/analytics.js`
- `_headers`
- `netlify.toml`
- `ferramentas/testes.mjs`
- `README.md`
- `LEIA-ME.txt`
- `docs/RELATORIO.md`
- `supabase-avisos-telegram.sql`

Renomeados (mesmo conteúdo, nome novo para furar o cache antigo):

- `assets/produtos/ipad-air-roxo.webp` → `ipad-air-roxo-v2.webp`
- `assets/produtos/ipad-pro-conteudo-caixa.webp` → `ipad-pro-conteudo-caixa-v2.webp`
- `assets/produtos/macbook-air-azul-ceu-teclado.webp` → `macbook-air-azul-ceu-teclado-v2.webp`

## Arquivos criados

- `docs/AUDITORIA-FINAL.md` (este relatório)

## Arquivos removidos

- Nenhum. Os três arquivos acima foram só renomeados.

## Dependências

- **Nenhuma adicionada ou removida.** O site continua em HTML, CSS e JavaScript puros, sem `npm install` para funcionar.
- **Externas no navegador:** todas já existiam e estão liberadas na CSP.
  - Google Fonts.
  - Google Analytics: só carrega com um ID válido.
  - Supabase: só com URL e chave configuradas.
  - model-viewer (jsDelivr): só quando um produto tiver `.glb`, e hoje nenhum tem.
  - YouTube-nocookie e Google Maps: só se configurados.
- **Ferramentas:** Node 18+ para `build`, `lint` e `test`; o Playwright é usado só pelo `npm test`.

## Produtos incompletos

Total: 19 produtos em 5 categorias.

- **Sem preço (19 de 19):**
  - iPhones: 18 Pro Max, 18 Pro, 17 Pro Max, Air, 17, 17e, 15 e 16;
  - Apple Watch Ultra 4 e SE 3;
  - iPad Pro, iPad Air e iPad 11;
  - MacBook Neo, MacBook Air e MacBook Pro;
  - AirPods Pro 3, AirPods 4 e AirPods Max 2.
- **Sem estoque ou disponibilidade (18 de 19):** todos, menos o iPhone 15, que está como "Disponível" / "Em estoque", como no site original.
- **Sem foto:** nenhum produto. Estas cores ainda não têm foto própria e mostram "Foto na cor X em atualização":
  - iPhone 15: Verde, Amarelo e Rosa;
  - iPad Pro: Preto-espacial.
- **Sem descrição:** nenhum.

## Dados comerciais ainda pendentes

São dados que só a loja pode fornecer. Enquanto estiverem vazios, o site esconde o bloco.

**No `data/config.js`:**
- `cnpj`
- `razaoSocial`
- `telefone` (fixo, se houver)
- `email`
- `AVALIACOES`: só avaliações reais e autorizadas.

**No `data/products.js`:**
- preço de cada produto: `preco`, e se quiser `precoPix` e `precoDe`;
- disponibilidade de cada produto: `status` ou `estoque`.

**Para confirmar:**
- O texto da garantia (`garantia`). Se a loja comprovar 1 ano de garantia Apple em todos os aparelhos, pode escrever isso no campo.
- "Nota fiscal em todas as vendas".
- O selo "Em estoque" do iPhone 15.
- Os selos "Mais vendido" (iPhone 17, MacBook Air e AirPods Pro 3), "Custo-benefício" (iPad 11 e AirPods 4), "Offshore" (Apple Watch Ultra 4), "Mais fino" e "Entrada no Mac". Todos vieram do site original.

## Integrações pendentes

| Integração | Onde | Estado hoje |
|---|---|---|
| Supabase (agenda online) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | vazio → o agendamento funciona pelo WhatsApp |
| Aviso no Telegram | `supabase-avisos-telegram.sql` | depende do Supabase |
| GA4 | `GA_MEASUREMENT_ID` | vazio → nada é carregado |
| Google Maps | `mapaEmbed` | vazio → o mapa some; endereço e "Traçar rota" continuam |
| Google Reviews | `avaliacoesGoogle` | vazio → a seção de avaliações some |
| Domínio próprio | `SITE_CONFIG.url` + `npm run build` | usa o endereço provisório do Netlify |

## Testes executados

**`npm run build`:**
- confere o config e o catálogo;
- aplica o SITE_URL;
- lista os produtos incompletos.

**`npm run lint`:**
- sintaxe;
- segredos;
- script embutido;
- `alt`;
- ids;
- CSP igual nos dois arquivos.

**`npm test`:** 81 verificações no Chromium, com os mesmos cabeçalhos do Netlify.
- Em 9 larguras: carrega sem erro, sem rolagem lateral, catálogo com 19 produtos, chamadas na primeira tela e botões com pelo menos 40 px.
- Catálogo e busca:
  - filtro e busca funcionam;
  - produto sem preço mostra "Preço sob consulta";
  - nenhum "undefined" ou "null" na página;
  - 28 links de WhatsApp com número e mensagem.
- Página do produto:
  - abre;
  - a mensagem cita o produto;
  - o Tab fica preso nela;
  - Esc fecha e o foco volta ao card;
  - o link direto funciona;
  - a galeria avança;
  - o JSON-LD é válido;
  - sem preço, não há `Offer`.
- Janelas: foco, Tab, Esc, clique fora e volta do foco na política, no vídeo, na foto e na agenda da loja.
- Troca: aviso de simulação, erro de bateria, correção automática e mensagem.
- Agendamento: validação do telefone e dias disponíveis.
- Também: movimento reduzido e página 404.

**Segunda auditoria no navegador (script próprio):**
- 9 larguras sem overflow, sem texto proibido, sem imagem quebrada e sem alvo de toque menor que 24 px;
- os 19 produtos, todas as cores e todas as miniaturas: 129 mídias abertas, nenhuma quebrada;
- WhatsApp com o número central e o nome do produto;
- 60 paradas de Tab com foco visível.

**Teste funcional (as 20 etapas):**

| # | Etapa | Resultado |
|---|---|---|
| 1 | abrir a home | OK |
| 2 | menu (Esc fecha) | OK |
| 3 | buscar "macbook" | OK: 3 resultados |
| 4 | filtrar Apple Watch | OK: 2 resultados |
| 5 | abrir produto | OK |
| 6 | trocar cor | OK: a galeria muda |
| 7 | trocar armazenamento | OK: vai para a mensagem |
| 8 | abrir WhatsApp | OK: nova aba + aviso |
| 9 | iniciar a troca | OK |
| 10 | agendamento | OK |
| 11 | fechar janela (X, clique fora, Esc) | OK |
| 12 | teclado (pular para o conteúdo, Enter abre, Esc volta o foco) | OK |
| 13 | mobile | OK |
| 14 | 404 | OK: status 404, início e catálogo |
| 15 | links internos e do rodapé | OK: todos os destinos existem |
| 16 | equipe: Maria de Fátima, Especialista Apple | OK |
| 17 | mapa: some sem link; rota funciona | OK |
| 18 | avaliações: somem sem dado real | OK |
| 19 | produto sem imagem (simulado) | OK: "Imagem em atualização" |
| 20 | produto sem preço | OK |

**Busca final:**
- `TODO`, `FIXME`, `HACK`, `TEMP`, `placeholder`, `example.com`, `localhost`, `console.log`, `alert(` e `debugger`: só usos legítimos. São atributos `placeholder` de campos, `localhost` nas instruções do `npm start` e `console.log` nas ferramentas de linha de comando.
- Nenhum `alert()` nem `debugger` no site.

**Segredos:** nenhum no código. Não há `service_role`, senha, token, JWT nem chave privada; só a trava que recusa a `service_role`.

## Build

BUILD: OK

## Lint

LINT: OK

## Console

CONSOLE: LIMPO

Nenhum erro, aviso ou 404 do projeto em nenhuma largura, em nenhum produto e em nenhuma janela.

A única mensagem que aparece nos testes é a das fontes do Google (`ERR_CERT_AUTHORITY_INVALID`), causada pelo proxy do ambiente de testes. Não acontece no site publicado.

## Mobile

Testado em:
- 320, 360, 375, 390, 414, 430, 768 e 1024 px;
- e também 1280 px.

Resultado: sem rolagem lateral, janelas dentro da tela, rolagem da página liberada depois de fechar, e barra fixa, WhatsApp e troca funcionando.

## Segurança

- `interest-cohort` removido do `Permissions-Policy`, que agora não gera aviso.
- CSP mantida sem `unsafe-inline` para script e sem `unsafe-eval`. `_headers` e `netlify.toml` continuam iguais.
- HSTS, nosniff, `X-Frame-Options DENY`, `frame-ancestors 'none'`, Referrer-Policy e COOP preservados.
- Cache: código e dados sempre revalidados; imagens por 1 hora; arquivos trocados renomeados. Não há service worker, então nenhuma versão antiga fica presa depois de um deploy.
- FAQ e motivos passam por escape antes de entrar no HTML.
- O WhatsApp não abre quando o formulário da troca está incompleto.

## SEO

- Title, description, canonical, Open Graph, Twitter Card, `robots.txt` e `sitemap.xml` saem do mesmo SITE_URL, aplicado pelo `npm run build`.
- JSON-LD `ElectronicsStore` só com os dados reais do config, sem CNPJ, nota ou preço inventados.
- `Product`/`Offer` só aparecem para produto com preço real (hoje nenhum). O teste confere isso.
- O título da página do produto usa a cidade do config.
- Favicon de 32 px adicionado.
