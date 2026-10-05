# SR Phone Macaé

Site da SR Phone, loja física de produtos Apple em Macaé (RJ). É HTML, CSS e JavaScript puros: não depende de framework e funciona direto da pasta. O Node.js só é usado para conferir, gerar as páginas de produto e testar.

- O que falta preencher antes de publicar: **CHECKLIST-PRODUCAO.md**
- O relatório técnico desta versão: **AUDITORIA-FINAL-SRPHONE.md**

---

## Configurações necessárias antes da produção

Tudo que depende de informação da loja fica em **`data/config.js`** (ou no `.env`, veja abaixo). Campo vazio não aparece no site e não quebra nada. Nenhum dado foi inventado.

| O que | Onde | Hoje |
|---|---|---|
| Domínio definitivo | `SITE_CONFIG.url` (ou `SITE_URL` no `.env`) e depois `npm run build` | endereço provisório da Netlify |
| CNPJ e razão social | `STORE_CONFIG.cnpj`, `STORE_CONFIG.razaoSocial` | vazio |
| E-mail | `STORE_CONFIG.email` | vazio |
| Mapa do Google | `STORE_CONFIG.mapaEmbed` (link de incorporação) | vazio (mostra endereço e botão de rota) |
| Avaliações no Google | `AVALIACOES_GOOGLE` | preenchido: nota 5,0, 3 avaliações e o link oficial (conferidos em 29/09/2026) |
| Google Analytics 4 | `GA_MEASUREMENT_ID` (ou no `.env`) | vazio (nada é carregado) |
| Agenda online (Supabase) | `SUPABASE_URL` e `SUPABASE_ANON_KEY` (ou no `.env`) | vazio (o agendamento segue pelo WhatsApp) |
| Assistência técnica | `STORE_CONFIG.servicos.assistenciaTecnica` | `false` (só ligue se a loja fizer) |
| Nota fiscal nos seminovos (CPO), se voltarem ao catálogo | `STORE_CONFIG.notaFiscalSeminovos` (`true` só se a loja emitir) | `null`: o site diz "Consulte as condições de nota fiscal no atendimento." |
| Garantia dos seminovos (CPO), se voltarem ao catálogo | `STORE_CONFIG.garantiaSeminovos` (a condição real, sem inventar prazo) | vazio: "As condições de garantia são informadas antes da compra." |
| Preços e estoque que faltam | `data/products.js` | veja a lista no `npm run build` |

---

## Como instalar

Precisa do **Node.js 18 ou mais novo** (https://nodejs.org).

```bash
npm install          # instala o Playwright (testes) e o SDK da IA (@anthropic-ai/sdk, usado só na função do servidor)
npm run navegadores  # baixa o Chromium dos testes (uma vez só)
```

## Como executar

```bash
npm start            # abre o site em http://localhost:8080 (igual à Netlify: cabeçalhos, 404 e páginas de produto)
```

Também dá para abrir o `index.html` direto no navegador, mas algumas coisas (página própria do produto, agenda online) só funcionam servidas por `npm start` ou pela Netlify.

## Como gerar o build

```bash
npm run build
```

O build:

1. lê o `.env` (se existir) e grava em `data/config.js` o domínio, o Supabase e o Analytics;
2. confere a configuração e o catálogo (preço inválido, opção inexistente, cor inexistente, imagem que não existe, id repetido, chave secreta no lugar da pública…);
3. espalha o domínio (`SITE_CONFIG.url`) no `<head>`, no `robots.txt` e no `sitemap.xml`;
4. gera uma página por produto em `produto/<id>/index.html` (título, descrição, canonical, Open Graph e Twitter Card próprios), e apaga a página de produto que saiu do catálogo;
5. lista o que ainda está incompleto no catálogo e nos dados da empresa.

**Rode `npm run build` sempre que mudar `data/products.js`, `data/config.js` ou o `index.html`**, antes de publicar.

## Como testar

```bash
npm run lint         # sintaxe, segredos no código, script embutido, alt, ids, links sem rel, CSP igual nos dois arquivos
npm test             # build em dia + links + testes do assistente com IA e da entrega (servidor) + testes no navegador (celular e computador)
npm run test:ia      # só os testes do servidor do assistente com IA (sem chave e sem navegador)
npm run test:entrega # só os testes do servidor da calculadora de entrega (sem Google e sem chave)
npm run links        # só a verificação de links, âncoras, imagens, imports e sitemap
npm run test:banco   # testa as migrações do Supabase num PostgreSQL local (precisa do PostgreSQL instalado)
                     # com POSTGREST=/caminho/do/postgrest, testa também o site de verdade contra a API e o banco
```

O `npm test` cobre, entre outros: larguras de 320 a 1920 px sem rolagem lateral, catálogo, produto, troca de armazenamento e cor, WhatsApp, busca, menu do celular, troca, assistência, agendamento, 404, página própria do produto, Google Analytics, dados para o Google e a caixa 3D.

## Como publicar (Netlify)

**Arrastando a pasta (mais simples):**

1. `npm run build` e `npm test` sem erro.
2. Na Netlify, abra o site > **Deploys** e arraste a **pasta do projeto** (sem a pasta `node_modules`; o zip de entrega já vem sem ela).
3. Em 1 minuto o site está no ar.
4. Confira se as fotos subiram: abra `https://SEU-SITE.netlify.app/assets/produtos/iphone-18-pro-bordo.webp`. Tem que aparecer a foto do iPhone. Se aparecer a página "não encontrada", a pasta `assets` não foi junto: arraste de novo a pasta inteira (a que tem o `index.html` e a pasta `assets` dentro).

**Ligado ao GitHub:** em Site configuration > Build & deploy, use o comando `npm run build` e a pasta de publicação `.`. As variáveis `SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `GA_MEASUREMENT_ID` podem ficar em Site configuration > Environment variables.

O `netlify.toml` já cuida de: cabeçalhos de segurança, cache, 404 própria, esconder as pastas de trabalho (`ferramentas/`, `docs/`, `supabase/`) e mandar um produto novo, que ainda não tem página própria, para o início com o produto aberto.

---

## Como alterar WhatsApp, endereço e dados da empresa

Tudo em `data/config.js`, no bloco `STORE_CONFIG`. É o único lugar: topo, contato, rodapé, mapa, mensagens e dados para o Google leem daqui.

- **WhatsApp:** `whatsapp` (só dígitos, com 55 e DDD, ex.: `5522974041089`) e `whatsappVisivel` (como aparece escrito).
- **Endereço:** `endereco`, `bairro`, `cidade`, `estado`, `cep`, `predio`, `referencia`.
- **Empresa:** `razaoSocial`, `cnpj`, `email`, `telefone`, `instagram`.
- **Mapa:** no Google Maps, abra a loja > Compartilhar > Incorporar um mapa > copie só o endereço de dentro do `src="..."` para `mapaEmbed`.
- **Avaliações do Google:** bloco `AVALIACOES_GOOGLE` (veja abaixo).
- **Horário da loja:** `horarioFuncionamento`. **Horários do agendamento:** `agenda` (mantenha igual à tabela `agenda_horarios` do Supabase).
- **Pagamento:** `pagamento` (Pix, cartão, troca, parcelas, parcelas sem juros, desconto no Pix).
- **Nota fiscal e garantia:** `notaFiscalNovos` e `garantia` valem só para os aparelhos novos. Os seminovos (CPO) têm os próprios campos, `notaFiscalSeminovos` e `garantiaSeminovos`, e nunca herdam os dos novos. "Nota fiscal em todas as vendas" só aparece quando os dois campos de nota fiscal forem `true`. Depois de mudar, rode `npm run build`: as páginas dos seminovos são geradas já com o texto certo.

## Avaliações do Google

A seção "Quem compra, recomenda." fica logo depois do catálogo. Tudo o que ela mostra está em `data/config.js`, no bloco `AVALIACOES_GOOGLE`. Nada é escrito direto no HTML.

- `nota` e `total`: a nota média e a quantidade de avaliações, **do jeito que o Google mostra**.
- `link`: o link oficial da ficha no Google (botão "Ver avaliações no Google", que abre em nova aba).
- `linkAvaliar`: o link direto para o cliente escrever uma avaliação. Ele fica no Perfil da Empresa no Google, em "Pedir avaliações". Vazio = o botão "Avalie a SR Phone" não aparece. Nunca coloque um link inventado.
- `lista`: uma linha por avaliação, com `nome`, `nota`, `texto` e `data`. Copie o nome e o texto **exatamente** como estão no Google: sem corrigir, resumir ou completar. Sem foto: o site mostra só a inicial do nome.
- `conferidoEm`: o dia em que você copiou os dados do Google. A data de cada avaliação ("6 meses atrás") muda sozinha no Google e aqui não. Por isso o site só mostra essa data até 30 dias depois de `conferidoEm`; depois ela some sozinha, em vez de ficar errada.

Chegou avaliação nova? Atualize `nota`, `total`, a `lista` e `conferidoEm`, e rode `npm run build`: ele confere o formato (link com https, nota de 1 a 5, total nunca menor que a lista).

O site **não** publica nota no Schema.org (`aggregateRating`). O Google não aceita, na página da própria loja, marcação de avaliações copiadas do Google. Isso não daria estrelas na busca e ainda arriscaria penalização. O link do Google entra só no `sameAs`, que liga o site à ficha da loja.

## Assistente SR Phone (mascote 3D e chat com IA)

O mascote da loja (em pé, com chapéu, monóculo, bigode e sapatos) fica no canto de baixo da tela e abre o **Assistente SR Phone**: um chat com atalhos (Ver iPhones, Consultar preço, Trocar meu aparelho, Agendar atendimento, Localização, Falar no WhatsApp), troca guiada, ajuda para escolher um iPhone e passagem para a equipe no WhatsApp com um resumo pronto. Com um produto aberto, ele sabe qual é.

- **Textos, atalhos, modelo 3D e IA**: `data/config.js` > `ASSISTENTE` (`ligado: false` desliga tudo; `ia.ligada: false` desliga só a IA).
- **Modelo 3D**: o mascote é o 3D da marca, feito no código (versão final, sem arquivo para baixar). Um GLB de artista é opcional: se existir `assets/modelos/srphone-assistant.glb`, o site passa a usar esse arquivo sozinho. Como fazer o arquivo: **`GUIA-MODELO-3D-SRPHONE.md`**.
- **IA**: as perguntas abertas vão para a função `netlify/functions/assistente.mjs`, que só conhece os dados oficiais do site. A chave fica só no Netlify (`AI_API_KEY`). Sem chave, o chat usa o cérebro local. Como ligar, testar e publicar: **`ASSISTENTE-SRPHONE-FINAL.md`**.
- `npm run mascote:imagem` refaz a imagem parada do mascote a partir do 3D atual.

## Colocar em produção (IA, Google Maps, chaves e custos)

Passo a passo do que falta configurar fora do código (Anthropic, Google Cloud, variáveis do Netlify, alertas de custo, o GLB do mascote e os valores do frete): **`PRODUCAO-SRPHONE.md`**. O que está pronto, o que depende de você e os resultados dos testes: **`AUDITORIA-PRODUCAO-SRPHONE.md`**.

## Calculadora de entrega (mapa, rota e valor)

O botão **Calcular entrega** (seção Localização e página de cada produto) abre um mapa no estilo dos apps de transporte: a pessoa usa a localização do celular (só depois de tocar) ou digita o endereço, vê a rota da loja até ela, a distância, o tempo e o valor estimado, e escolhe entre **Entrega SR Phone** e **Retirar na SR Phone (grátis)**. A escolha abre o WhatsApp com a mensagem pronta; a pessoa confere e envia. O Assistente SR Phone também oferece a calculadora ("Quanto fica para entregar aqui?").

- **Valores** (taxa, valor por km, mínimo e limite de km): `data/config.js` > `DELIVERY_CONFIG`. Os de agora são de **exemplo**.
- **Rota, endereços e valor** são calculados na função `netlify/functions/entrega.mjs` com o Google Maps Platform. As chaves ficam só no Netlify (`MAPS_SERVER_KEY` e `MAPS_BROWSER_KEY`). Sem chave, a calculadora não inventa valor: mostra a retirada e o WhatsApp.
- A localização e o endereço não são guardados em lugar nenhum.
- Como ligar o Google, mudar os valores e testar: **`ENTREGA-SRPHONE.md`**.

## Como alterar o domínio

1. Troque `SITE_CONFIG.url` em `data/config.js` (ou `SITE_URL` no `.env`), com `https://` e sem barra no fim.
2. Rode `npm run build`: canonical, Open Graph, Twitter Card, `robots.txt`, `sitemap.xml` e as páginas de produto passam a usar o novo endereço.
3. Publique e ligue o domínio na Netlify (Domain management).
4. Se usar a agenda com aviso no Telegram, atualize o `link_agenda` (migração 2).

O `npm run links` avisa se o domínio aparecer escrito à mão em algum arquivo.

## Como adicionar produtos

Em `data/products.js`, copie um bloco `{ id:"...", ... }` parecido e troque os campos. O passo a passo de cada campo está no topo do arquivo. Depois: `npm run build`.

- `id`: só letras minúsculas, números e `-` (vira o endereço `/produto/<id>/`).
- `cond`: `"Novo lacrado"` ou `"CPO / seminovo selecionado"`. Novo e seminovo são produtos separados. Hoje o catálogo não tem seminovos: o site não fala de seminovo em lugar nenhum. Se um CPO voltar para `data/products.js`, os textos de seminovo voltam sozinhos (rode `npm run build`).
- `opcoes`: armazenamentos ou tamanhos. `cores`: `[["Nome", "#corClara", "#corEscura"]]`.
- Fotos em `assets/produtos/` e o caminho em `oficial.fotos` (divulgação) ou `imgs` (foto real da loja). Sem foto, use `ilustracao` (`"iphone-pro"`, `"iphone-duplo"` ou `"watch"`) para mostrar o desenho do modelo com o selo "Ilustração".
- Ficha técnica em `specs`: só dado oficial.

## Como alterar preços

O preço fica em `variantes`, por armazenamento e, se precisar, por cor:

```js
variantes:[{ opcao:"256 GB", preco:7250 },                    // 256 GB, qualquer cor
           { opcao:"512 GB", cor:"Prateado", preco:9500 }],   // SÓ o 512 GB Prateado
```

- Opção ou cor sem preço aparece como **"Preço sob consulta"**, com o botão "Consultar no WhatsApp". Nunca aparece R$ 0,00.
- O `preco` fora das variantes só vale para produto com **uma** opção (ou nenhuma). Com duas ou mais opções, o build acusa erro: assim o preço de um armazenamento nunca aparece nos outros.
- `precoPix` (valor no Pix) e `precoDe` (preço anterior, só se for real) também podem ir na variante.
- Quando a tabela da loja não diz o armazenamento, deixe o produto sem `opcoes` e use `obsPreco` (ex.: "Armazenamento confirmado no atendimento").

## Como alterar o estoque

No produto ou na variante:

- `status: "disponivel" | "ultimas-unidades" | "sob-encomenda" | "indisponivel" | "consultar"`
- ou `estoque: 8` (a quantidade nunca aparece: mais de 5 = Disponível, 1 a 5 = Últimas unidades, 0 = Indisponível).

Sem informação real, deixe `"consultar"`: o site mostra **"Consulte disponibilidade"** e o WhatsApp continua funcionando.

---

## Como configurar o Supabase (agenda online)

1. Crie um projeto em https://supabase.com (região São Paulo).
2. Aplique as migrações da pasta `supabase/migrations/`, na ordem:
   - pelo painel: **SQL Editor** > cole o conteúdo de `20260926120000_agenda.sql` > **Run**, depois o de `20260928120000_horario_loja.sql` (horário novo: segunda a sexta 09:00 às 19:00, sábado 09:00 às 17:00), o de `20260928140000_segurar_horario.sql` (o "Segurar horário") e, por último, o de `20261002120000_area_equipe_seguranca.sql` (Área da Equipe, bloqueios, MFA, registro das ações e o pedido só pelo servidor). Se quiser aviso no Telegram, faça o mesmo com `20260926120100_avisos_telegram.sql`;
   - ou pela Supabase CLI: `supabase link` e `supabase db push`.
3. **Authentication > Sign In / Providers:** desligue **"Allow new users to sign up"** (só a loja cria usuários).
4. **Project Settings > API Keys:** preencha (em `data/config.js` ou no `.env`) e rode `npm run build`:

   | No site | Valor | Onde fica no Supabase |
   |---|---|---|
   | `SUPABASE_URL` | o mesmo de `NEXT_PUBLIC_SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`) |
   | `SUPABASE_ANON_KEY` | o mesmo de `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_...`) |

   Se o `.env` (ou o Netlify) já tiver os nomes `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, o build também os aceita. A chave `anon` antiga (começa com `eyJ`) continua funcionando.
5. A **Secret key** (`sb_secret_...`, ou a antiga **service_role**) vai SÓ no Netlify, em **Site configuration > Environment variables**, com o nome `SUPABASE_SECRET_KEY`. Quem usa é a função do servidor `/api/agendamento`, que grava o pedido do cliente depois de conferir tudo. Nunca no site: o build e o lint recusam e o site ignora.
6. Confira: o agendamento do site passa a dizer "Reservar esse horário", e a **Área da equipe** aparece no rodapé (`/funcionario/`).

Passo a passo completo da Área da Equipe, do MFA, do anti-robô e de tudo o que é configurado à mão: **SEGURANCA-E-PAINEL-FUNCIONARIO.md**.

Como o site fala com o Supabase: a Publishable key vai só no cabeçalho `apikey` (ela não é um JWT, então não pode ir em `Authorization: Bearer`) e serve só para ler os horários ocupados (dia e hora). O pedido do cliente vai para a função `/api/agendamento` (no Netlify), nunca direto ao banco. Na Área da Equipe, depois do login, as ações levam também o token da pessoa (`Authorization: Bearer ...`), e o banco confere se ela está na tabela `funcionarios`, ativa (e com o código de 6 dígitos, quando o MFA é exigido).

Se a agenda continuar mandando para o WhatsApp: confira se a URL começa com `https://` e se a chave é a **Publishable** (`sb_publishable_...`), rode `npm run build` de novo e publique. O site só volta para o WhatsApp quando o Supabase não responde.

O que o banco garante sozinho (não depende da tela): um horário reservado some para os outros; dois pedidos no mesmo instante, só um passa (índice único); horário bloqueado ou dia fechado não aceita pedido; horário fora da grade da loja, data passada, telefone inválido, pedido repetido e excesso de pedidos (por WhatsApp, por origem e no total) são recusados; visitante não lê nome nem telefone de ninguém.

## Como adicionar funcionários ao agendamento

1. Supabase > **Authentication > Users > Add user** (e-mail e senha da pessoa).
2. **SQL Editor**:

```sql
insert into public.funcionarios (user_id, nome, role)
select id, 'Nome da pessoa', 'funcionario' from auth.users where email = 'email@dapessoa.com';
```

   Para a dona/o dono da loja use `'admin'` no lugar de `'funcionario'`: o MFA (código de 6 dígitos do app autenticador) passa a ser exigido.

3. A pessoa entra pelo link **Área da equipe** (rodapé) ou em `https://SEU-DOMINIO/funcionario/` (o endereço antigo `#/agenda` leva para lá): vê a agenda do dia, bloqueia e libera horários, fecha o dia inteiro, confirma, cancela e remarca agendamentos.

Quem tem login no Supabase mas não está em `funcionarios` (ou está com `ativo = false`) vê "Acesso não liberado" e não entra. Não existe cadastro pelo site.

Para tirar o acesso sem apagar o histórico (vale na hora): `update public.funcionarios set ativo = false where email = 'email@dapessoa.com';`

Horários da agenda: tabela `agenda_horarios` (dia da semana e hora). Mantenha igual a `STORE_CONFIG.agenda` em `data/config.js`.

## Segurar horário (reserva temporária da equipe)

Para quando alguém da loja está conversando com um cliente (no WhatsApp, por exemplo) e não quer perder o horário enquanto a conversa termina.

**Para ligar:** no Supabase, **SQL Editor** > cole o conteúdo de `supabase/migrations/20260928140000_segurar_horario.sql` > **Run** (e depois o `20261002120000_area_equipe_seguranca.sql`). Os dois podem rodar mais de uma vez e não apagam dados.

**Como usar (Área da Equipe > Agenda):**

1. Escolha o dia no calendário. Cada horário aparece como Livre, Agendado, Segurado, Bloqueado ou Indisponível (já passou).
2. Num horário **Livre**, toque em **Segurar**, escolha **15 minutos, 30 minutos, 1 hora ou 2 horas**, escreva o motivo se quiser ("Cliente falando pelo WhatsApp") e toque em **Segurar**.
3. O horário fica **SEGURADO**, com quem segurou, até que horas, o motivo e "libera em N min" (atualiza de minuto em minuto). Os botões:
   - **Confirmar**: vira agendamento confirmado.
   - **Liberar**: o horário volta a ficar livre na hora, para qualquer cliente.
4. Ninguém confirmou até o fim do prazo? O horário volta a ficar livre **sozinho**, sem cron e sem ninguém clicar. Em até 1 minuto a grade do painel mostra "Livre" de novo.

**Segurado x bloqueado:** *bloqueado* é a loja fechando o horário (almoço, feriado, reunião) e não expira; *segurado* é temporário e expira.

**O que o banco garante sozinho:**
- enquanto o prazo vale, o horário não aparece para o cliente e não pode ser pedido, segurado por outra pessoa, bloqueado nem usado numa remarcação;
- se duas pessoas tentarem ao mesmo tempo (duas da equipe, ou uma da equipe e um cliente), só uma consegue;
- prazo vencido nunca prende o horário;
- quem segurou é sempre o usuário logado: o banco ignora qualquer id mandado pelo navegador;
- só funcionário ativo segura, libera ou confirma, e o visitante do site não consegue nem chamar essas funções;
- o cliente nunca vê nome da equipe, motivo nem nada interno: para ele o horário só aparece como indisponível;
- tudo fica no histórico `agendamentos_log`: quem segurou, confirmou, liberou ou cancelou, e quando, além dos prazos que venceram.

**Como testar depois de rodar o SQL:**
1. Entre na Área da Equipe, escolha no calendário um dia com horário livre e segure um horário por 15 minutos.
2. Numa janela anônima do navegador, abra o agendamento do site nesse dia: o horário aparece indisponível.
3. Volte ao painel e toque em **Liberar**. Na janela anônima, recarregue: o horário voltou.
4. Segure de novo e toque em **Confirmar**: ele vira "Confirmado".
5. Para ver o prazo vencer, segure por 15 minutos e espere: depois do prazo, a grade mostra "Livre" sozinha e o site volta a oferecer o horário.

Histórico, no SQL Editor: `select * from public.agendamentos_log order by em desc limit 50;` (por agendamento) e `select * from public.audit_logs order by em desc limit 50;` (ações da equipe).

## Como configurar o Google Analytics

1. Crie uma propriedade GA4 e um fluxo de dados da Web com o domínio do site.
2. Copie o **ID da métrica** (`G-XXXXXXXXXX`) para `GA_MEASUREMENT_ID` (em `data/config.js` ou no `.env`) e rode `npm run build`.

Vazio = nada do Google é carregado. Eventos enviados: `view_item`, `select_item`, `whatsapp_click`, `trade_in_start`, `trade_in_submit`, `service_click`, `schedule_start`, `schedule_complete`, `search_product`, `filter_product`, `select_product_option`, `select_product_color`, `click_map`, `open_unboxing`, `complete_unboxing`, `click_team_contact`. Nunca vão nome, telefone, e-mail ou o que a pessoa digita. Com o GA ligado, a política de privacidade do site passa a citar os cookies de medição sozinha.

## Assistência técnica

O site está pronto para oferecer assistência técnica (card no contato, link no rodapé, assunto no agendamento e WhatsApp com "Olá! Gostaria de solicitar atendimento para assistência técnica."). Fica **desligado** até a loja confirmar o serviço: `STORE_CONFIG.servicos.assistenciaTecnica = true`.

---

## Onde fica cada coisa

| O que | Arquivo |
|---|---|
| Dados da loja, domínio, GA4, Supabase, equipe, avaliações, assistente | `data/config.js` |
| Catálogo: produtos, preços, estoque, fotos, ficha técnica | `data/products.js` |
| Regras de preço, cor, disponibilidade e dados para o Google | `js/precos.js` (usado pelo site e pelo build) |
| Visual | `css/styles.css` |
| Funcionamento | `js/` (catálogo, WhatsApp, agenda, troca, analytics, caixa 3D, assistente e mascote 3D…) |
| Modelo 3D oficial do mascote (quando existir) | `assets/modelos/srphone-assistant.glb` |
| Páginas de produto (geradas, não edite) | `produto/<id>/index.html` |
| Banco da agenda | `supabase/migrations/` |
| Assistente com IA (servidor): função, dados, instruções, proteções e provedor | `netlify/functions/assistente.mjs` e `services/ai/` |
| Calculadora de entrega: valores | `data/config.js` > `DELIVERY_CONFIG` |
| Calculadora de entrega: tela e mapa | `js/entrega.js`, `js/entrega-app.js` e `assets/vendor/leaflet/` |
| Calculadora de entrega (servidor): rota, endereços, valor e provedor | `netlify/functions/entrega.mjs` e `services/entrega/` |
| Variáveis de exemplo | `.env.example` |
| Segurança e cache | `_headers` e `netlify.toml` (a Content-Security-Policy é igual nos dois) |
| Ferramentas (build, lint, links, testes, servidor local) | `ferramentas/` |
| Relatórios antigos | `docs/` |

## Segurança: o que nunca fazer

- Nunca colocar no código a chave `service_role`/`sb_secret_`, senha, token de bot ou qualquer segredo. O token do Telegram fica só dentro do banco.
- Nunca commitar o arquivo `.env` (ele está no `.gitignore`).
- A chave da IA (`AI_API_KEY`) fica só nas variáveis de ambiente do Netlify. Nunca em `data/config.js`, no código ou no GitHub.
- As chaves do Google Maps ficam só no Netlify: `MAPS_SERVER_KEY` (secreta, só do servidor) e `MAPS_BROWSER_KEY` (aparece no navegador de propósito; protegida pelas restrições de domínio e de API no Google Cloud). Passo a passo em `PRODUCAO-SRPHONE.md`.
- Nunca escrever "certificado", "Garantia Apple", "nota fiscal" ou "entrega imediata" em produto sem comprovante da loja.
