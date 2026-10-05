# Auditoria final · SR Phone

Data: 26/09/2026 · Branch: `Srphone` · Base: a versão aprovada (identidade visual, cores, logo, animações e layout mantidos)

## 1. Resumo

O projeto inteiro foi lido antes de qualquer mudança (HTML, CSS, os 14 scripts, dados, build, lint, testes, SQL e configuração da Netlify). As correções seguiram a ordem pedida: funcionamento, segurança, confiabilidade, catálogo, experiência, performance, SEO e acabamento. Nada foi redesenhado. As únicas mudanças visuais resolvem um problema: a ilustração no lugar do "Imagem em atualização", a frase do armazenamento embaixo do preço, o aviso de produto que saiu do catálogo e a fonte dos campos nas telas de toque (evita o zoom do iPhone).

Resultado conferido: `npm install`, `npm run lint`, `npm run build` e `npm test` sem erro (267 testes no navegador, 0 falhas), links sem nada quebrado, e as migrações do Supabase testadas num PostgreSQL real, inclusive com dois pedidos simultâneos no mesmo horário.

## 2. O que foi corrigido

**Catálogo e preço**
- Preços confirmados aplicados (lista na seção 7), com a regra nova de preço por **armazenamento e cor** (`js/precos.js`): o R$ 9.500 do iPhone 17 Pro 512 GB vale só para o Prateado; nas outras cores aparece "Preço sob consulta", com a explicação "Valor informado só na cor Prateado".
- Corrigido um risco real: o preço escrito no produto valia para **todas** as opções. Agora ele só vale para produto de uma opção; com duas ou mais, o build acusa erro e o site mostra "Preço sob consulta".
- Produtos cuja tabela não diz o armazenamento (iPhone 17, iPhone 16 Pro Max, iPhone 15 Pro Max CPO) ou o tamanho (Series 12) ficaram sem botão de opção e com a frase "Armazenamento confirmado no atendimento", em vez de chutar um valor.
- iPhone 18 Pro / Pro Max: a ficha dizia **quatro** câmeras (duas teleobjetivas). A imagem oficial mostra **três**. A ficha agora traz só o que é certo (três câmeras, A20 Pro, unibody de alumínio, IP68, USB-C); resolução, brilho, núcleos e horas de bateria não confirmados saíram.
- iPhone 17e: a "teleobjetiva de 12 MP" aparecia como uma segunda câmera; é o zoom 2x da câmera Fusion de 48 MP. Corrigido, e saíram os números não confirmados.
- iPhone 17 Pro / Pro Max: material conforme o material oficial enviado ("Ceramic Shield na frente e atrás").
- CPO: de "Seminovo CPO (certificado)" para **"CPO / seminovo selecionado"**. A página explica que CPO não é afirmação de recondicionamento oficial da Apple, sem "Novo e lacrado", sem "Caixa lacrada" e sem prometer nota fiscal; para o Google vai como `UsedCondition`.
- Disponibilidade explícita em todos os produtos (`"consultar"` onde não há estoque real). Com estoque preenchido, a quantidade passa a valer sobre o "consultar".
- Sete produtos sem foto ganharam **ilustração do modelo** na cor escolhida (iPhone Pro com três câmeras, iPhone 13 com duas na diagonal, Apple Watch), com o selo "Ilustração". Antes: ícone com "Imagem em atualização".

**WhatsApp**: mensagens por ação, nos textos pedidos (produto, produto com cor, troca, assistência, agendamento), com uma barreira final que tira "undefined", "null", "NaN" e "[object Object]".

**Troca**: modelo sem armazenamento definido gerava a frase "Quero um iPhone 17 de ." Corrigido.

**Busca do cabeçalho**: não achava produto de outra categoria se um filtro estivesse aberto. Agora procura no catálogo inteiro.

**Agendamento**: máscara de WhatsApp, campo-isca contra robô, prazo de 12 s quando o servidor não responde (antes podia ficar girando), mensagens para os novos erros do banco, "Área do funcionário" só com agenda online. Sem Supabase, o aviso da área da equipe não mostra mais instrução técnica ao visitante.

**Assistência técnica**: não existia no site (nem no original). Ficou pronta e **desligada** até a loja confirmar o serviço.

## 3. Segurança

- Busca no projeto inteiro por `password`, `secret`, `token`, `api_key`, `service_role`, `private`, `authorization` e `bearer`: nenhuma credencial. As ocorrências são o campo de senha do login da equipe (`type="password"`), o cabeçalho `Authorization: Bearer <token da sessão do funcionário>` montado em tempo de execução (a Publishable key vai só em `apikey`), os avisos que recusam a service_role (site, build e lint) e o token do Telegram, que fica só numa tabela do banco sem acesso pela API.
- A chave `service_role`/`sb_secret_` é recusada em três lugares: no navegador (a agenda desliga), no build e no lint. O `.env.example` não tem nenhum valor; o `.env` está no `.gitignore`.
- XSS e injeção de HTML: todo texto vindo de dado, formulário ou banco passa por `esc()`. Nome e motivo são limpos também no banco. A descrição de produto em HTML vem só de `data/products.js`, arquivo da loja.
- Parâmetros de URL (`#/produto/id`, `?produto=id`) aceitam só letras minúsculas, números e hífen. Não há redirecionamento aberto: o site nunca redireciona para um endereço vindo da URL.
- Todos os links externos com `target="_blank"` têm `rel="noopener noreferrer"`; o lint recusa link sem isso.
- Armazenamento no navegador: nenhum `localStorage`. Só a sessão do login da equipe fica em `sessionStorage` (apagada ao fechar a aba).
- Supabase: RLS em todas as tabelas. O visitante só chama duas funções e só vê dia e hora ocupados. Funcionário precisa estar ativo na tabela `funcionarios`. As funções `security definer` fixam o `search_path`.
- Anti-spam no banco: horário fora da grade da loja, 2 pedidos pendentes por WhatsApp no máximo, e trava geral de 15 pedidos novos em 10 minutos. No site: campo-isca, bloqueio de clique duplo e 1 minuto de espera depois de 5 senhas erradas na área da equipe.
- Content-Security-Policy mantida sem `unsafe-inline` para script, igual no `_headers` e no `netlify.toml` (o lint confere). Pastas de trabalho (`ferramentas/`, `docs/`, `supabase/`, `package.json`, `.env.example`) respondem 404 na Netlify.
- Console: removidos os avisos de configuração (o build aponta esses erros). Ficaram só os registros de falha real (catálogo que não carrega e 3D de produto com arquivo incompleto), que não aparecem no uso normal.

## 4. Performance

Medido com o servidor local, tela de celular (390 px), sem cache:

| Página | Arquivos | Peso transferido | LCP (local) | CLS |
|---|---:|---:|---:|---:|
| Início | 21 | 697 KB (imagens 339, scripts 231, CSS 83, HTML 44) | 0,56 s | 0 |
| /produto/iphone-17-pro/ | 25 | 885 KB | 0,49 s | 0 |

A Netlify comprime HTML, CSS e JS na entrega, então o peso real é menor. Imagens com largura e altura (CLS 0), carregamento sob demanda (`loading="lazy"`), imagem do topo com prioridade, scripts `defer`, `preconnect` das fontes, Three.js (caixa 3D), mapa, agenda e Google Analytics só baixam quando são usados. As fotos de produto não perderam qualidade. O único arquivo duplicado (`assets/logo-srphone.png`, idêntico ao ícone de 512 px e sem uso) foi removido.

## 5. SEO

- **Página própria para cada produto**: `/produto/<id>/` (25 páginas geradas pelo `npm run build`), cada uma com title, meta description, canonical, Open Graph (`og:type=product`, imagem do produto) e Twitter Card próprios, e o produto já aberto. Os caminhos de CSS, JS e imagens foram ajustados para funcionar dois níveis abaixo. Dentro do site, o endereço `#/produto/<id>` continua valendo.
- Na Netlify, um produto novo que ainda não ganhou página vai para `/?produto=<id>`, que abre o produto. Produto que saiu do catálogo mostra um aviso educado.
- **Product/Offer** (schema.org) só na página do produto e só com preço real, em BRL, com uma Offer por opção/cor que tem preço próprio, `sku`, disponibilidade (quando informada), condição e o endereço canônico. O grafo com vários produtos na página inicial foi retirado (o Google pede Product em página de produto).
- **LocalBusiness** (`ElectronicsStore`) só com dados reais: endereço, horário, telefone do WhatsApp, Instagram, formas de pagamento; CNPJ, razão social, e-mail e perfil do Google entram sozinhos quando preenchidos. Coordenadas não foram inventadas.
- **sitemap.xml** com 26 endereços (início + 25 produtos); **robots.txt** libera tudo o que é público e cita o sitemap.
- Domínio: um lugar só (`SITE_CONFIG.url` ou `SITE_URL` no `.env`). Trocar e rodar o build atualiza canonical, Open Graph, Twitter, robots, sitemap e páginas de produto.

## 6. Responsividade

Testado automaticamente em 320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1366, 1440 e 1920 px: sem rolagem lateral, catálogo presente, "Ver iPhones" e "Falar no WhatsApp" no começo da página, botões com 40 px ou mais, cabeçalho numa linha só e nenhum link visível apontando para "#". Página do produto (com foto, ilustração e seminovo) e política de privacidade testadas em 320 e 375 px: cabem na tela.

iOS/Safari: `viewport-fit=cover` e `safe-area` na barra fixa, nos botões de fechar e no topo; `100svh` no topo; `-webkit-backdrop-filter` em todos os desfoques; campos com 16 px nas telas de toque (sem zoom ao tocar); vídeos com `playsinline`; alvos de toque de 40 a 44 px. **Não foi possível testar num iPhone de verdade**: os testes usam o Chromium com tela e toque de celular.

## 7. Catálogo

28 produtos, 5 categorias. Preços aplicados da tabela confirmada:

| Produto | Opção | Condição | Preço |
|---|---|---|---:|
| iPhone 13 | 128 GB | Novo lacrado | R$ 3.150 |
| iPhone 13 Pro CPO | 256 GB | CPO / seminovo selecionado | R$ 3.350 |
| iPhone 15 | 128 GB | Novo lacrado | R$ 3.900 |
| iPhone 15 Pro Max CPO | armazenamento a confirmar | CPO / seminovo selecionado | R$ 5.150 |
| iPhone 16 | 128 GB | Novo lacrado | R$ 4.650 |
| iPhone 16 Plus | 128 GB / 256 GB | Novo lacrado | R$ 5.250 / R$ 5.550 |
| iPhone 16 Pro Max | armazenamento a confirmar | Novo lacrado | R$ 6.850 |
| iPhone 16 Pro Max CPO | 256 GB | CPO / seminovo selecionado | R$ 6.150 |
| iPhone 17 | armazenamento a confirmar | Novo lacrado | R$ 5.450 |
| iPhone 17 Pro | 256 GB (todas as cores) | Novo lacrado | R$ 7.250 |
| iPhone 17 Pro | 512 GB **Prateado** | Novo lacrado | R$ 9.500 |
| iPhone 17 Pro Max | 256 GB / 512 GB | Novo lacrado | R$ 7.750 / R$ 9.000 |
| iPhone 18 Pro | 256 GB | Novo lacrado | R$ 10.500 |
| iPhone 18 Pro Max | 256 GB | Novo lacrado | R$ 13.000 |
| iPad 11 | 128 GB | Novo lacrado | R$ 3.150 |
| Apple Watch SE 3 | 40 mm / 44 mm | Novo lacrado | R$ 1.950 / R$ 2.150 |
| Apple Watch Series 11 | 42 mm / 46 mm | Novo lacrado | R$ 2.550 / R$ 2.750 |
| Apple Watch Ultra 3 | 49 mm | Novo lacrado | R$ 4.850 |
| Apple Watch Series 12 | tamanho a confirmar | Novo lacrado | R$ 3.500 |
| AirPods Pro 3 | Estojo MagSafe USB-C | Novo lacrado | R$ 3.750 |
| AirPods 4 | Com Cancelamento de Ruído | Novo lacrado | R$ 1.550 |
| MacBook Neo | 256 GB | Novo lacrado | R$ 5.000 |

Sem preço (mostram "Preço sob consulta"): iPhone Air, iPhone 17e, iPad Pro, iPad Air, MacBook Air, MacBook Pro, AirPods Max 2, e as opções/cores sem valor na tabela. Nenhum preço, estoque ou Pix foi inventado.

## 8. Agendamento

Migrações em `supabase/migrations/` (Supabase CLI ou SQL Editor), repetíveis sem erro:

- `agendamentos` com estados pendente, confirmado, cancelado e bloqueado, e registro de quem mexeu (`atualizado_por`).
- **Índice único parcial** em (data, hora) para pendente/confirmado/bloqueado: o próprio banco impede duas reservas no mesmo horário, mesmo com dois pedidos no mesmo instante (testado com duas conexões simultâneas).
- `agenda_horarios`: a grade da loja. O servidor recusa horário fora dela (domingo, 03:00…).
- `funcionarios` com `ativo`: tirar acesso sem apagar histórico.
- Funções: `horarios_ocupados` (só dia e hora), `solicitar_horario` (valida tudo no fuso de Brasília), `confirmar_`, `cancelar_`, `remarcar_agendamento`, `bloquear_horario`, `bloquear_dia`, `limpar_pendentes_vencidos` e `apagar_dados_antigos` (LGPD, padrão 180 dias).
- Aviso no Telegram (opcional): se o Telegram falhar, a reserva continua (testado).
- Sem credenciais, o site continua funcionando: o pedido segue pelo WhatsApp com serviço, dia e hora. Com o servidor fora do ar: "Não conseguimos consultar os horários agora" e o botão do WhatsApp.

## 9. Integrações

- **WhatsApp**: número único em `STORE_CONFIG.whatsapp`; todos os botões testados (formato `https://wa.me/55…?text=…`).
- **Google Analytics 4**: `GA_MEASUREMENT_ID` vazio = nada carregado. Com ID: `view_item`, `select_item` (com item, variante e preço em BRL), `whatsapp_click`, `trade_in_start`, `service_click`, `schedule_start`, `schedule_complete`, além dos eventos de catálogo, mapa e caixa 3D. Nenhum dado pessoal (testado).
- **Supabase**: Publishable key (`sb_publishable_...`) só no cabeçalho `apikey`, nunca como Bearer (ela não é JWT; mandada como Bearer, o Supabase recusava e o site caía no WhatsApp). Secret key e service_role recusadas no build e ignoradas no site. Login do funcionário confere `e_funcionario()` antes de abrir a agenda. Prazo de 12 s por chamada; plano B pelo WhatsApp só quando o servidor não responde.
- **Google Maps**: aparece só com o link real e só carrega perto da tela.
- **Avaliações do Google**: seção "Quem compra, recomenda." logo depois do catálogo, com as 3 avaliações reais (nomes e textos idênticos aos do Google), nota 5,0, 3 avaliações e o link oficial. Sem Schema de nota: o Google não aceita marcar na própria página avaliações copiadas de outro site.
- **Assistente SR Phone**: mascote 3D no canto (boneco provisório com pernas e sapatos até chegar o GLB oficial, que o site detecta sozinho) e chat híbrido: atalhos e fluxos com os dados reais, perguntas abertas pela IA do servidor (só com os dados oficiais e com guarda de preço inventado) e passagem para o WhatsApp com resumo. O 3D só baixa depois da página carregar; sem WebGL fica a imagem parada. Detalhes em `ASSISTENTE-SRPHONE-FINAL.md` e `GUIA-MODELO-3D-SRPHONE.md`.
- **Privacidade (LGPD)**: a política agora descreve o que o site faz de verdade: agenda (com Supabase), WhatsApp, simulador local, cookies do GA quando ligado, `sessionStorage` só na área da equipe, fontes do Google, mapa e jsDelivr, e como pedir para ver, corrigir ou apagar os dados.

## 10. Testes executados

| Comando | Resultado |
|---|---|
| `npm install` | up to date, 0 vulnerabilidades |
| `npm run lint` | LINT SEM ERROS (14 arquivos JavaScript + HTML + 25 páginas de produto) |
| `npm run build` | BUILD CONCLUÍDO COM SUCESSO |
| `npm run build -- --conferir` | Arquivos gerados em dia |
| `npm run links` | 27 páginas, 872 referências, NENHUM LINK, ÂNCORA, IMAGEM OU IMPORT QUEBRADO |
| `npm run test:ia` (servidor do assistente) | **38 ok, 0 falha(s)** |
| `npm test` (navegador) | **458 ok, 0 falha(s)** |
| `npm run test:banco` | TESTES DO BANCO: TUDO OK · CONCORRÊNCIA: 2 pedidos simultâneos, 1 reservado, o outro recebeu horario_ocupado · TELEGRAM: aviso enviado; com o Telegram fora do ar a reserva continua; token invisível para o visitante · SITE + API (PostgREST 12): **23 ok, 0 falha(s)** |

Os 11 fluxos E2E pedidos estão no `npm test`: carregar a home, abrir o catálogo, abrir o produto, trocar a variante (e o preço), clicar no WhatsApp, pesquisar, abrir o menu do celular, abrir a troca, abrir a assistência, abrir o agendamento e a 404. Também: página própria de produto, imagens quebradas na página inteira, Google Analytics, dados estruturados, caixa 3D, movimento reduzido, mapa, avaliações e dados da empresa.

## 11. Resultados do build

```
SR Phone · build
  produtos: 28   endereço: https://thunderous-genie-1cf391.netlify.app
  arquivos atualizados: nenhum (já estavam em dia)

Produtos incompletos (preencha em data/products.js):
  sem preco: 7 → iPhone Air, iPhone 17e, iPad Pro, iPad Air, MacBook Air, MacBook Pro, AirPods Max 2
  sem disponibilidade: 27 → (todos, menos o iPhone 15)
  sem imagem: 7 → os sete com ilustração
  sem descricao: 0

Dados da empresa ainda vazios em data/config.js: cnpj, razaoSocial, email, mapaEmbed
Google Analytics: desligado (GA_MEASUREMENT_ID vazio).
Agenda online: desligada (SUPABASE_URL vazio). O agendamento usa o WhatsApp.

BUILD CONCLUÍDO COM SUCESSO
```

## 12. Pendências que dependem exclusivamente do proprietário

CNPJ, razão social, e-mail, domínio definitivo, ID do Google Analytics, URL e Publishable key do Supabase (e os e-mails dos funcionários), link do Google Maps, estoque real, os preços que faltam, o armazenamento do iPhone 17, do 16 Pro Max e do 15 Pro Max CPO, o tamanho do Series 12, o preço do 17 Pro 512 GB nas outras cores, as fotos dos sete modelos com ilustração, a ficha completa do iPhone 18 Pro, se a loja faz assistência técnica, as condições dos seminovos CPO (procedência, garantia, nota fiscal) e se "nota fiscal em todas as vendas" vale também para eles. A lista com caixas de seleção está no **CHECKLIST-PRODUCAO.md**.

## 13. Recomendações futuras (não obrigatórias)

- Testar num iPhone real depois de publicar (Safari e o app do Instagram abrindo o site).
- Depois de ligar o domínio: enviar o sitemap no Google Search Console e conferir as páginas de produto no Rich Results Test.
- Agendar `limpar_pendentes_vencidos()` e `apagar_dados_antigos()` no Database > Cron do Supabase.
- Trocar as ilustrações por fotos reais assim que chegarem (basta apagar a linha `ilustracao` e preencher `oficial.fotos`).
- Com o domínio definitivo, considerar uma imagem de compartilhamento (Open Graph) própria para cada categoria.

## Correção final: páginas CPO, nota fiscal e garantia

- As páginas `/produto/iphone-13-pro-cpo/`, `/produto/iphone-15-pro-max-cpo/` e `/produto/iphone-16-pro-max-cpo/` são geradas pelo build **já com o texto certo no HTML**: os textos gerais que falavam de aparelho novo, lacrado, caixa lacrada, nota fiscal ou garantia do fabricante são trocados por "CPO / seminovo selecionado", "Condição conferida no atendimento", "Você confere o aparelho, o IMEI, o número de série e o estado antes da compra", "Consulte as condições de nota fiscal no atendimento." e "As condições de garantia são informadas antes da compra." O texto institucional ("A SR Phone também vende aparelhos Apple novos") fica separado da condição do CPO.
- Configuração nova em `data/config.js`: `notaFiscalNovos: true`, `notaFiscalSeminovos: null` e `garantiaSeminovos: ""`. O seminovo nunca herda a garantia nem a nota fiscal dos novos. "Nota fiscal em todas as vendas" virou "Nos aparelhos novos" enquanto a nota dos seminovos não for confirmada.
- Testes novos abrem as três páginas CPO (HTML inicial e página aberta) e conferem que não aparece "Aparelho novo", "Caixa lacrada", "Novo e lacrado", "garantia do fabricante" nem "em todas as vendas", e que aparece "CPO / seminovo selecionado".

## Arquivos alterados nesta versão

Novos: `js/precos.js`, `ferramentas/links.mjs`, `ferramentas/testa-banco.sh`, `ferramentas/sql/supabase-local.sql`, `ferramentas/sql/testes-agenda.sql`, `.env.example`, `.gitignore`, `package-lock.json`, `CHECKLIST-PRODUCAO.md`, `AUDITORIA-FINAL-SRPHONE.md`, `docs/LEIA-ANTES.md` e as 28 páginas `produto/<id>/index.html`.

Movidos: `supabase.sql` → `supabase/migrations/20260926120000_agenda.sql` (reforçado) e `supabase-avisos-telegram.sql` → `supabase/migrations/20260926120100_avisos_telegram.sql`.

Alterados: `index.html`, `css/styles.css`, `data/config.js`, `data/products.js`, `js/catalog.js`, `js/core.js`, `js/whatsapp.js`, `js/analytics.js`, `js/site.js`, `js/scheduling.js`, `js/trade.js`, `js/motion.js`, `ferramentas/build.mjs`, `ferramentas/ler-dados.mjs`, `ferramentas/lint.mjs`, `ferramentas/servidor.mjs`, `ferramentas/testes.mjs`, `netlify.toml`, `package.json`, `robots.txt`, `sitemap.xml`, `README.md`, `LEIA-ME.txt`.

Removido: `assets/logo-srphone.png` (cópia idêntica de `assets/icons/icon-512.png`, sem uso).

## Aparelhos CPO retirados (28/09/2026)

A pedido da loja, os três seminovos saíram do site: iPhone 16 Pro Max CPO, iPhone 15 Pro Max CPO e iPhone 13 Pro CPO.

- Catálogo com **25 produtos**, todos novos e lacrados. As páginas `/produto/<id>-cpo/` foram apagadas pelo build e saíram do sitemap (26 endereços).
- Link antigo de CPO (por exemplo, vindo do Google) abre o início com o aviso "não está mais no catálogo".
- Sem seminovo no catálogo, o site não fala de seminovo: "Aparelhos com procedência", garantia, perguntas frequentes, termos de uso, texto do catálogo e dados para o Google (LocalBusiness) falam só dos novos.
- As regras de seminovo continuam no código: se um CPO voltar para `data/products.js`, os textos e as proteções (sem "novo e lacrado", sem garantia do fabricante, nota fiscal e garantia só com confirmação) voltam sozinhos. Isso é testado com um CPO de teste que só existe dentro do teste.
- As linhas de CPO na tabela de preços da seção 5 ficam como histórico.

## Segurar horário (28/09/2026)

Reserva temporária feita pela equipe (15, 30, 60 ou 120 minutos), com confirmar e liberar. Migração nova: `supabase/migrations/20260928140000_segurar_horario.sql`. As antigas não mudaram.

- **Banco:**
  - status `segurado` e colunas `segurado_por`, `segurado_ate` e `motivo_seguro`, com índices;
  - funções `segurar_horario`, `liberar_horario`, `confirmar_horario`, `agenda_do_dia` (grade do painel) e `equipe_nomes`;
  - histórico `agendamentos_log`, gravado por gatilho, só com ids e estados.
- **Trava contra duplicidade:**
  - O índice único parcial passa a incluir `segurado` (`agendamentos_horario_travado`).
  - Como `now()` não pode entrar num índice, um gatilho `BEFORE INSERT/UPDATE` encerra, na mesma transação, o segurado vencido do horário que vai ser ocupado.
  - As consultas tratam o segurado vencido como livre. Sem cron.
- **Segurança:**
  - quem segurou é sempre `auth.uid()`, forçado pelo gatilho mesmo em gravação direta pela API;
  - o prazo máximo de 2 horas é garantido no banco;
  - no Supabase, função nova nasce liberada para `anon`. A migração retira essa permissão de todas as funções da equipe, novas e antigas; o teste local agora imita isso.
- **Testes:**
  - `ferramentas/sql/testes-segurar.sql`: os 10 cenários pedidos;
  - `ferramentas/testa-banco.sh`: concorrência de verdade com duas sessões;
  - `ferramentas/testa-agenda-real.mjs`: painel real contra PostgREST, com prazo vencendo pelo relógio;
  - `ferramentas/testes.mjs`: painel com servidor simulado em 360, 768 e 1280 px.
  - Cinco defeitos introduzidos de propósito na migração foram todos pegos pelos testes.
- **Correção nos testes antigos:** o auxiliar `__espera_erro` engolia a própria falha quando a operação passava. Com a correção, os testes antigos continuam passando.

## Calculadora de entrega (29/09/2026)

Cálculo de entrega no estilo dos apps de transporte: mapa, rota da loja até o cliente, distância, tempo e valor. Guia completo: `ENTREGA-SRPHONE.md`.

- **Escolha do serviço:** Google Maps Platform, porque o site já usa o Google Maps. O mapa JavaScript do Google exigiria afrouxar a CSP (`unsafe-eval`, estilos embutidos, workers), então o desenho usa o Leaflet 1.9.4 (guardado no site, carregado só no toque) com os blocos da Map Tiles API. Rota (Routes API), sugestões (Places API New) e endereço/ponto (Geocoding API) ficam na função do servidor.
- **Valor:** só no servidor, com a regra de `DELIVERY_CONFIG` (`js/precos.js` > `precoEntrega`, a mesma conta em todo lugar). Distância da ROTA, nunca linha reta. Acima do limite, sem valor automático. Os valores atuais são de exemplo.
- **Origem fixa:** a loja (Av. Atlântica, 386, Sala 211, Praia Campista, Macaé - RJ, 27920-325), pelo endereço de `STORE_CONFIG` ou pelo ponto de `DELIVERY_CONFIG.origem`. O navegador não escolhe a origem.
- **Segurança:** `MAPS_API_KEY` só no Netlify; a chave do navegador só abre os blocos do mapa (restrição por domínio e API no Google). A função confere método, origem, JSON, tamanho, pontos no Brasil e a até 300 km, e limita pedidos por visitante. CSP ganhou só `https://tile.googleapis.com`; `Permissions-Policy` passou para `geolocation=(self)`. O lint recusa chave do Google no projeto, chamada do navegador às APIs de rota/endereço e qualquer armazenamento do local.
- **Privacidade:** localização só depois do toque; ponto e endereço só na memória da tela; nada no analytics; registro do servidor só com a ação e o código do erro; política de privacidade atualizada.
- **Falhas:** sem chave, Google fora do ar, função quebrada ou sem rota → "Não conseguimos calcular a entrega agora. Fale com a SR Phone pelo WhatsApp.", sem valor.
- **Assistente:** "Quanto fica para entregar aqui?" oferece "Usar minha localização" ou "Informar endereço"; depois do cálculo, repete só os números vindos da rota. A IA foi instruída a nunca estimar entrega e ganhou a ação `entrega`.
- **Testes:** `npm run test:entrega` (78, servidor, com provedor falso e respostas simuladas do Google) e 67 no navegador dentro do `npm test` (525 no total, 0 falhas). Não testado com o Google de verdade (sem chave neste ambiente).
- **Não mexido:** catálogo, preços dos produtos, mascote 3D, avaliações, agendamento, troca e SEO. No site, só entraram os dois botões "Calcular entrega" e a janela da calculadora.

## Versão de produção (29/09/2026)

Guia completo, com a auditoria dos 7 pontos pedidos: `PRODUCAO-SRPHONE.md`.

- **Google Maps:** mantidos Leaflet + Map Tiles API (o Maps JavaScript API exigiria CSP com `'unsafe-eval'`, conforme o guia de segurança do Google). APIs realmente usadas: Routes API, Places API (New) e Geocoding API (servidor) e Map Tiles API (navegador). A sessão do mapa passou a ser criada no navegador, com a mesma chave das imagens.
- **Chaves:** `MAPS_SERVER_KEY` (servidor; `MAPS_API_KEY` ainda aceito) e `MAPS_BROWSER_KEY` (navegador). Funções recusam pedido sem `Origin`. Teste novo: a chave do servidor nunca aparece em resposta, erro ou registro, inclusive quando o Google recusa ou a rede cai.
- **Frete:** `calcularEntrega` é a única conta; `roundingMode` com 5 regras documentadas; retirada R$ 0,00; contexto do produto vindo do catálogo; mensagem do WhatsApp no formato pedido.
- **IA:** modelo padrão definido pela loja (hoje `claude-sonnet-5`; veja "Correção final da integração Anthropic" abaixo); `AI_MODEL` malformado ou inexistente cai no padrão com aviso `modelo_invalido`; lista de "esforço" corrigida conforme a documentação (Opus 4.5 em diante); injeção e vazamento cobrem as chaves do Google Maps.
- **Mascote:** o GLB final não existe (dito claramente). O build passou a conferir também esqueleto (rig), materiais e texturas.
- **Celular:** mapa sai da frente com o teclado aberto; testes em 375, 390, 430, 768 e 1280 px.
- **Testes:** IA no servidor 46, entrega no servidor 85, navegador 571; 0 falhas. Google e IA de verdade não testados (sem chaves).

## Revisão técnica final (30/09/2026)

Relatório completo: `AUDITORIA-PRODUCAO-SRPHONE.md`. Em resumo: lista oficial de modelos da IA
(`MODELOS`) no lugar das expressões regulares; `AI_ESFORCO` vazio vira `low`; resposta máxima 8192;
provedor de demonstração só no computador; troca no chat anota dado fora da ordem; URL de cada produto
no conhecimento da IA; origem da entrega só de `STORE_CONFIG`; bloco "VALORES COMERCIAIS DA SR PHONE –
EDITAR AQUI"; limite de 40 sugestões por sessão; teto de memória dos limites; `.env.example` só com
nomes. Testes: IA 54, entrega 91, navegador 579; 0 falhas.

## Correção final da integração Anthropic (30/09/2026)

Só a integração com a Anthropic mudou (Google Maps, entrega, design, catálogo, mascote, WhatsApp,
agendamento, troca, avaliações e SEO ficaram como estavam).

- **Modelo padrão:** `claude-sonnet-5` (Claude Sonnet 5). `AI_MODEL` continua configurável; vazio usa
  o `claude-sonnet-5`.
- **Retirados da lista `MODELOS`, por decisão da loja:** `claude-opus-5-5`, `claude-sonnet-5-5` e
  `claude-fable-5-1`. Com um deles em `AI_MODEL`, a função usa o padrão sem chamar o nome retirado.
- **Conferido em 30/09/2026 na documentação oficial** (platform.claude.com): a tabela "Model status"
  (todos os modelos que ficaram na lista aparecem como "Active"), a página de cada modelo, a página de
  *effort* e a página de reserva automática (*refusals and fallback*).
- **Parâmetros opcionais:** `effort` só nos níveis que a página de effort lista para cada modelo (no
  padrão vai `low`); a reserva automática (`fallbacks` + beta) só nos modelos que a página de reserva
  cita (Fable 5 e Opus 5; **não** no Sonnet 5); `thinking`, `temperature`, `top_p` e `top_k` nunca são
  enviados.
- **Testes:** IA no servidor 58, entrega no servidor 91, navegador 579; 0 falhas. As chamadas à
  Anthropic nos testes são **simuladas** (sem chave e sem IA de verdade).

## Entrega final (30/09/2026)

Relatório completo, comandos, resultados e a lista única do que falta: `AUDITORIA-PRODUCAO-SRPHONE.md`.

- **Preços do assistente:** a guarda deixou de usar uma lista global de valores (a falha: "O iPhone 15
  de 128 GB custa R$ 13.000,00" passava porque o valor existe no iPhone 18 Pro Max). Agora cada valor
  é conferido com o produto, o armazenamento e a cor da frase; a IA escreve `[[preco:ID|opção|cor]]` e o
  servidor põe o valor do catálogo; o histórico do navegador chega à IA sem valores em dinheiro.
- **Catálogo:** "Disponível" do produto não vale para a opção sem preço; o build lista as opções sem preço.
- **Entrega:** nenhum código técnico na tela; tarifas de exemplo marcadas (`tarifasConfirmadas: false`)
  e avisadas ao cliente.
- **Mascote:** o 3D da marca (feito no código) é a versão final, com gestos mais suaves e a imagem
  parada refeita; GLB de artista opcional. Banner do celular mais baixo ("Ver iPhones" inteiro em 390 × 844).
- **Fontes:** as do Google não travam mais a primeira pintura.
- **Testes:** esperas por condição no lugar das pausas fixas; endereços externos simulados; bloqueios de
  rede do ambiente listados à parte. IA e Google Maps testados só simulados.

