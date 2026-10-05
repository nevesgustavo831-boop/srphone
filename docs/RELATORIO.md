# Relatório da reestruturação do site da SR Phone

Data: 24/09/2026 · Branch: `Srphone`

> Relatório da primeira reestruturação. As listas e contagens abaixo foram atualizadas para o catálogo atual (19 produtos). A auditoria completa mais recente está em **docs/AUDITORIA-FINAL.md**.

**Ponto de restauração:** a versão anterior a esta reestruturação é o commit `52b8830`. O primeiro commit da reestruturação (`716ebdf`) só separa os arquivos, sem mudar comportamento. Para voltar a qualquer um dos dois: `git checkout 52b8830 -- .`

Regra seguida do começo ao fim: **nenhum dado foi inventado**. Nada de preço, estoque, CNPJ, telefone, e-mail, endereço, depoimento, avaliação, certificação, chave ou ID. O que não existe ficou vazio, com o local de preenchimento indicado.

---

## Alterações realizadas

### Prioridade 1: bugs e funcionalidades quebradas
- O link direto de produto (`#/produto/...`) não abria o produto ao carregar a página, só quando o endereço mudava. **Corrigido.**
- O campo de telefone do agendamento (`type="tel"`) estava sem o estilo dos outros campos: pequeno e com o visual padrão do navegador. **Corrigido.**
- Depois do último horário do dia, o agendamento abria em "hoje" sem nenhum horário livre. Agora ele abre no primeiro dia que ainda tem horário.
- Quando a imagem da equipe ou a capa de vídeo não carregava, aparecia o ícone de imagem quebrada. **Corrigido.**
- No rodapé, o horário mostrava só "Segunda a sexta". Agora mostra todos os dias.
- Na área do funcionário, `confirm()` e `prompt()` foram trocados por controles na própria tela: o cancelamento pede um segundo toque e o remarcar abre campos de data e hora.

### Prioridade 2: dados da empresa e confiança
- `data/config.js` concentra tudo que é da loja:
  - `SITE_CONFIG` (domínio)
  - `STORE_CONFIG`: nome, razão social, CNPJ, telefone, WhatsApp, e-mail, Instagram, endereço completo, mapa, link de avaliações do Google, horário, preços, pagamentos e agenda
  - `GA_MEASUREMENT_ID`
  - `SUPABASE_URL` e `SUPABASE_ANON_KEY`
  - `EQUIPE` e `AVALIACOES`
- Topo, contato, rodapé, localização, barra do celular e dados estruturados leem dessa configuração. O telefone e o endereço deixaram de estar escritos à mão em vários lugares.
- O rodapé ficou com quatro colunas:
  - marca, razão social, CNPJ e endereço;
  - Navegar;
  - Atendimento: WhatsApp, telefone, e-mail, Instagram e horário;
  - Informações: privacidade, termos, contato e área do funcionário.

  Campos vazios não aparecem.
- Na seção Contato, os cartões de telefone e de e-mail aparecem sozinhos quando esses dados forem preenchidos.
- Nova seção **Avaliações**, com estrutura pronta. Ela só aparece com avaliações reais (`AVALIACOES`) ou com o link do Google (`avaliacoesGoogle`). Hoje as duas estão vazias, então ela não aparece.
- **Mapa:** se `mapaEmbed` estiver vazio, o bloco some e o endereço e o horário ocupam o espaço.
- A política de privacidade avisa sozinha quando o Google Analytics estiver ligado.
- A equipe foi mantida: Maria de Fátima, Especialista Apple, com o texto pedido e o botão "Falar com Maria". Não há nenhuma certificação escrita.

### Prioridade 3: catálogo, preços e estoque
- Os produtos ganharam os campos `id`, `status`, `estoque`, `precoPix` e `destaque`, e aceitam `parcelas` próprias. Todos os campos antigos foram mantidos, e o cabeçalho de `data/products.js` explica cada um.
- **Preço:**
  - com preço, aparece no formato `R$ 4.999,00`, com parcelamento e Pix (só se configurados);
  - sem preço, aparece "Preço sob consulta" e o botão "Consultar no WhatsApp".
- **Disponibilidade:** Disponível, Últimas unidades, Sob encomenda, Indisponível ou "Consulte disponibilidade" quando não há dado. A quantidade em estoque nunca aparece no site.
- **Produto sem foto:** aparece "Imagem em atualização" com um ícone discreto da categoria. Os desenhos vetoriais e o falso 3D desenhado foram retirados, como você tinha pedido.
- A ordem "Destaque" coloca primeiro os produtos com `destaque:true`. A busca procura também em capacidades, cores e categoria.
- **Página do produto:**
  - uma galeria única com fotos da loja, imagens de divulgação, vídeo, giro 360 e 3D;
  - setas, contador, miniaturas, deslizar do dedo e setas do teclado;
  - disponibilidade com explicação, preço, parcelamento e Pix;
  - cor e capacidade, troca de iPhone, WhatsApp e "Agendar atendimento na loja";
  - o foco do teclado fica preso dentro da janela e volta para onde estava ao fechar.
- Esqueleto de carregamento enquanto o catálogo monta. Se os produtos não carregarem, aparece a mensagem "Não foi possível carregar os produtos agora", com o botão "Tentar novamente", no lugar de um erro técnico.

### Prioridade 4: WhatsApp e conversão
- O número fica em um lugar só (`STORE_CONFIG.whatsapp`). Todos os links usam `wa.me`, com número só em dígitos e texto codificado. O `wa.me` abre o aplicativo no celular e o WhatsApp Web no computador.
- Mensagem por produto, com capacidade e cor. Exemplo: *"Olá! Vi o iPhone 16 256 GB na cor Rosa no site da SR Phone e gostaria de saber disponibilidade e condições de pagamento."*
- "Agendar atendimento na loja", na página do produto, leva o nome do aparelho para o agendamento.
- **Topo novo**, sem a rolagem longa de 5 telas. A primeira tela mostra:
  - que é uma loja física em Macaé;
  - o que vende;
  - o endereço e o horário;
  - os botões **"Ver iPhones"** (já filtra o catálogo) e **"Falar no WhatsApp"**.

  A arte da loja preenche a primeira tela inteira no computador (passa por trás do cabeçalho), com o texto por cima e a câmera descendo até o palco quando o site abre. No celular, ela ocupa a largura toda em cima e o texto vem logo abaixo.

### Prioridade 5: agendamento
- A arquitetura Supabase foi mantida:
  - horários ocupados;
  - bloqueio contra reserva duplicada no banco;
  - confirmação, cancelamento, remarcação e bloqueio pelo funcionário.
- A configuração virou `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Com eles vazios, o agendamento funciona pelo WhatsApp e diz isso na tela.
- O site **recusa a chave service_role**: se ela for colada por engano, a agenda online desliga. O `npm run build` e o `npm run lint` também avisam.
- **Validação no próprio campo**, sem `alert()`:
  - nome obrigatório no modo online, com pelo menos 2 letras e sem números;
  - telefone opcional, mas, se preenchido, precisa ter DDD e número válidos;
  - dia e horário obrigatórios.
- O foco vai para o campo com problema, e não há envio duplicado: o botão fica "Enviando…" e bloqueado.
- Enquanto a agenda online consulta os horários, aparece um indicador. Se a consulta falhar, aparece um aviso claro.

### Prioridade 6: responsividade e celular
- Testado em 320, 375, 390, 430, 768 e 1280 px, sem rolagem para os lados.
- Todos os botões principais têm pelo menos 40 px de altura, e os alvos de toque têm pelo menos 24 px. As bolinhas de cor têm área de toque de 30 px.
- O campo de busca, os links do rodapé, a trilha e a barra de bateria ficaram mais fáceis de tocar.

### Prioridade 7: performance
- **Imagens mais leves (os originais continuam na pasta):**
  - a arte do topo virou WebP em 2 tamanhos (57 KB e 27 KB, contra 137 KB do JPG);
  - a foto do iPhone 15 virou WebP (10 KB, contra 566 KB do PNG);
  - o logo do topo e do rodapé passou para ícones de 96 e 192 px (11 e 28 KB, contra 165 KB).
- `loading="lazy"` nas imagens abaixo da primeira tela e `fetchpriority="high"` na arte do topo.
- O model-viewer (3D), o `js/unboxing.js`, os vídeos e o player do YouTube só carregam quando a pessoa usa.
- Saíram as animações constantes: brasas no fundo, fumaça e fundo que se movia. As entradas das seções acontecem uma vez só.
- CSS e JavaScript em arquivos separados, guardados pelo navegador e conferidos com o servidor a cada visita (`must-revalidate`).

### Prioridade 8: SEO
- Título mais descritivo. A meta description ficou sem o endereço, que pode mudar.
- Adicionados `og:url` e as tags `twitter:title`, `twitter:description` e `twitter:image`.
- Dados estruturados **ElectronicsStore (LocalBusiness)** só com dados reais: endereço, horário, WhatsApp, Instagram e logo. CNPJ, e-mail e razão social entram sozinhos quando forem preenchidos.
- **Product + Offer** só para produtos com preço. Hoje nenhum tem, então nada é publicado; não há preço, avaliação nem estoque inventados.
- `SITE_CONFIG.url` centraliza o domínio, e o `npm run build` atualiza o canonical, o Open Graph, o `robots.txt` e o `sitemap.xml`, que agora tem data de atualização.

### Prioridade 9: organização do código
- Antes: um `index.html` de 5.162 linhas com tudo dentro. Agora: `index.html` com cerca de 729 linhas, mais os arquivos abaixo.
  - `css/styles.css`
  - `data/config.js` e `data/products.js`
  - `js/` com um arquivo por assunto: `boot`, `core`, `analytics`, `whatsapp`, `site`, `catalog`, `scheduling`, `trade`, `motion` e `unboxing`
- Os comandos `npm start`, `npm run build`, `npm run lint` e `npm test` foram criados sem nenhuma dependência obrigatória.

### Prioridade 10: visual, 3D e extras
- Visual escuro e sóbrio mantido, com microinterações discretas.
- **3D:** o botão "Explorar em 3D" e a miniatura "3D" só aparecem com um arquivo `.glb` ou `.gltf` configurado. O visualizador só carrega quando a pessoa abre.
- **Unboxing 3D:** a estrutura está pronta em `js/unboxing.js`. São 4 etapas (girar, lacre, tampa, revelar) ligadas a animações nomeadas no `.glb`, carregadas sob demanda. Sem `unboxing3d`, nada aparece.
- **PWA:** `manifest.webmanifest` com nome, ícones (inclusive "maskable"), `theme_color` e `background_color`. **Sem service worker** de propósito: para um site-vitrine, o risco de mostrar preço ou estoque antigo em cache é maior que o benefício.
- **Página 404** com a marca, "Erro 404", "Voltar ao início" e "Ver produtos".

### Acessibilidade
- Auditoria com **axe-core** (padrões WCAG 2.1 A/AA e boas práticas): **0 problemas** na página, no celular e com o produto aberto.
- O que foi corrigido para chegar nisso:
  - região principal (`<main>`) e link "Pular para o conteúdo";
  - barra do celular como navegação rotulada;
  - contraste do dia escolhido, dos selos e do contador da galeria;
  - nome acessível no botão de WhatsApp do topo;
  - texto alternativo repetido nas fotos da loja.
- Também foram mantidos ou melhorados:
  - foco visível e navegação por teclado;
  - `aria-invalid` e `aria-describedby` nos campos com erro;
  - `aria-busy` durante os carregamentos;
  - respeito a `prefers-reduced-motion`.

### Segurança
- **CSP mais rígida:** o `script-src` não aceita mais `'unsafe-inline'`, porque o site não tem mais nenhum script dentro do HTML. Também foram adicionados `object-src 'none'`, `manifest-src 'self'` e os domínios do GA4, que só são usados se ele for ligado.
- Mantidos: HSTS, `X-Content-Type-Options`, `X-Frame-Options DENY`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `form-action 'none'` e `base-uri 'none'`.
- O `_headers` e o `netlify.toml` estão iguais, e o `npm run lint` confere isso.
- Nenhuma chave privada no código. O `npm run lint` procura `service_role`, `sb_secret_`, chaves privadas, senhas e tokens.

---

## Arquivos criados
- `css/styles.css`
- `data/config.js`
- `data/products.js`
- `js/boot.js`, `js/core.js`, `js/analytics.js`, `js/whatsapp.js`, `js/site.js`, `js/catalog.js`, `js/scheduling.js`, `js/trade.js`, `js/motion.js`, `js/unboxing.js`
- `ferramentas/ler-dados.mjs`, `ferramentas/build.mjs`, `ferramentas/lint.mjs`, `ferramentas/servidor.mjs`, `ferramentas/testes.mjs`
- `package.json`
- `manifest.webmanifest`
- `assets/icons/`: favicon-48, icon-32, icon-180, logo-96, logo-192, icon-512, maskable-192 e maskable-512
- `assets/hero-srphone.webp` e `assets/hero-srphone-800.webp`
- `docs/RELATORIO.md` (este arquivo)

## Arquivos modificados
- `index.html`
- `404.html`
- `_headers`
- `netlify.toml`
- `robots.txt`
- `sitemap.xml`
- `LEIA-ME.txt`
- `README.md`

Nenhum arquivo de imagem ou vídeo original foi apagado.

## Dependências adicionadas
**Nenhuma obrigatória.** O site continua sendo HTML, CSS e JavaScript puros, publicados arrastando a pasta.
- **Node.js 18+:** opcional, só para os comandos de conferência.
- **Playwright:** opcional, só para o `npm test`. Não está no `package.json` para o `npm install` não baixar um navegador inteiro sem necessidade. Para instalar: `npm i -D playwright && npx playwright install chromium`.
- **Bibliotecas externas que já existiam:** Google Fonts e model-viewer (este só carrega quando há 3D). Nenhuma nova foi adicionada.

## Informações que ainda preciso fornecer
Todas em `data/config.js`:

| Informação | Campo | Hoje |
|---|---|---|
| CNPJ | `STORE_CONFIG.cnpj` | vazio |
| Razão social | `STORE_CONFIG.razaoSocial` | vazio |
| Telefone fixo (se houver) | `STORE_CONFIG.telefone` | vazio |
| E-mail | `STORE_CONFIG.email` | vazio |
| Mapa do Google | `STORE_CONFIG.mapaEmbed` | vazio (o bloco some) |
| Link das avaliações no Google | `STORE_CONFIG.avaliacoesGoogle` | vazio |
| Avaliações reais autorizadas | `AVALIACOES` | vazio (a seção some) |
| Google Analytics 4 | `GA_MEASUREMENT_ID` | vazio (desligado) |
| Agenda online | `SUPABASE_URL` e `SUPABASE_ANON_KEY` | vazios (funciona pelo WhatsApp) |
| Domínio próprio | `SITE_CONFIG.url` | endereço atual do Netlify |

**Preenchidos com dados reais que já existiam:** WhatsApp (22) 97404-1089, Instagram @srphonemacae, endereço completo com CEP e referência, e horário.

**Confirme se estes textos, que já estavam no site original, continuam verdadeiros:**
- "nota fiscal em todas as vendas";
- a garantia (hoje o site diz "garantia do fabricante, nos termos e prazos definidos pela Apple", em `data/config.js` › `garantia`);
- "Novo lacrado" em todos os produtos;
- os selos "Mais vendido", "Mais fino", "Custo-benefício", "Entrada no Mac", "Offshore" e "Em estoque" (iPhone 15).

## Produtos incompletos
Esta lista é gerada pelo `npm run build`, que a atualiza sempre que for rodado.
- **Sem preço (19 de 19):** todos.
- **Sem disponibilidade (18 de 19):** todos, menos o iPhone 15 (Disponível).
- **Sem imagem:** nenhum. Todos os 19 têm imagens de divulgação separadas por cor.
- **Cores ainda sem foto própria:** iPhone 15 (Verde, Amarelo e Rosa) e iPad Pro (Preto-espacial). Nelas aparece "Foto na cor X em atualização".
- **Sem descrição:** nenhum.
- **Saíram do catálogo:** iPad mini, Apple Watch Series 12 e um modelo que não foi anunciado oficialmente pela Apple.

## Configurações: onde alterar
| O que | Onde |
|---|---|
| Preços | `data/products.js` › `preco`, `precoPix`, `precoDe` (e `parcelas`); regras gerais em `data/config.js` › `precos` |
| Estoque | `data/products.js` › `status` (ou `estoque`) |
| Fotos | arquivo em `assets/produtos/` + `imgs` (foto real da loja) ou `oficial.fotos` (divulgação) |
| WhatsApp | `data/config.js` › `whatsapp` e `whatsappVisivel` |
| Endereço | `data/config.js` › `endereco`, `bairro`, `cidade`, `estado`, `cep`, `referencia` |
| CNPJ | `data/config.js` › `cnpj` e `razaoSocial` |
| Equipe | `data/config.js` › `EQUIPE` |
| Analytics | `data/config.js` › `GA_MEASUREMENT_ID` |
| Supabase | `data/config.js` › `SUPABASE_URL` e `SUPABASE_ANON_KEY` (passo a passo no LEIA-ME) |
| Domínio | `data/config.js` › `SITE_CONFIG.url`, depois `npm run build` |

## Testes
- **`npm test` (navegador Chromium real, com a mesma política de segurança do Netlify): 48 ok, 0 falhas.**
  - Em 320, 375, 390, 430, 768 e 1280 px:
    - carrega sem erro;
    - sem rolagem para os lados;
    - catálogo com os 19 produtos;
    - "Ver iPhones" e "Falar no WhatsApp" na primeira tela;
    - botões com pelo menos 40 px.
  - Catálogo e produto:
    - filtro, busca e "Preço sob consulta";
    - 30 links de WhatsApp com número e mensagem;
    - a página do produto abre e cita o produto na mensagem;
    - Esc fecha;
    - o link direto abre;
    - a galeria avança;
    - dados estruturados válidos.
  - Agendamento: telefone inválido mostra erro e o válido limpa o erro.
  - Movimento reduzido: nada fica escondido.
  - Página 404.
- **Agendamento com Supabase simulado:**
  - mostra que está carregando os horários;
  - nome obrigatório, com o foco no campo;
  - "Enviando…";
  - **dois cliques geram um único pedido**;
  - mensagem de sucesso.
- **Modo só WhatsApp:** validações e abertura do WhatsApp com a mensagem pronta.
- **Acessibilidade (axe-core):** 0 problemas em 3 cenários.
- **Alvos de toque:** nenhum elemento tocável com menos de 24 px (as bolinhas de cor têm área ampliada).
- **Peso da primeira tela:** cerca de 400 KB sem compressão, em 17 arquivos. O Netlify comprime HTML, CSS e JS, então a transferência real é menor.
- **Console do navegador:** nenhum erro em nenhum teste.
- **Não deu para testar de verdade**, porque as chaves não existem: GA4 e Supabase reais. Os dois foram testados com servidor simulado ou com o carregamento desligado.

## Build
```
npm run build  →  BUILD CONCLUÍDO COM SUCESSO
npm run lint   →  LINT SEM ERROS
npm test       →  48 ok, 0 falha(s)
```
**BUILD CONCLUÍDO COM SUCESSO.** Não restam erros.

## Observações
- **O topo de cinema foi trocado por um topo direto.** O anterior pedia cerca de 4 telas de rolagem antes do catálogo no computador, e os botões só apareciam no fim. Para conversão e velocidade, o topo novo mostra tudo na primeira tela. A versão anterior está no commit `52b8830`, caso queira recuperar algo.
- **Fontes:** continuam vindo do Google Fonts. Hospedar as fontes no próprio site deixaria o carregamento um pouco mais rápido e privado; é um passo opcional.
- **Modelo 3D do AirPods Pro 3:** já foi gerado no Higgsfield. Falta baixar o arquivo `.glb` e preencher `modelo3d` (veja o README).
