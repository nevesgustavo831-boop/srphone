# SR PHONE — VERSÃO PREMIUM

Data: 25/09/2026 · Branch: `Srphone`

**Escopo desta etapa:** confiança, conversão, integrações reais, experiência premium e a caixa 3D. Não houve refatoração geral: catálogo, busca, filtros, cores, opções, WhatsApp, trade-in, equipe, janelas, SEO, segurança, PWA e 404 continuam como estavam. Os testes antigos continuam passando, e a varredura de regressão também.

**Nenhum dado foi inventado.** CNPJ, razão social, e-mail, domínio, mapa, avaliações, GA4 e Supabase continuam vazios em `data/config.js`. Os valores usados para testar essas partes (mapa, avaliação, CNPJ, ID do GA4 e servidor Supabase) existem só dentro dos testes automáticos.

---

## Recursos adicionados

### 1. Caixa 3D "Abra a caixa" (o diferencial)

Fica na seção do lacre, logo depois do catálogo:
- A pessoa gira a caixa arrastando.
- Segura a aba laranja e puxa o lacre para baixo.
- Puxa a tampa para cima, e o iPhone aparece com a tela acendendo.
- No fim aparece "Conheça nossos iPhones", com os botões "Ver modelos" e "Falar no WhatsApp".

### 2. Agenda com reserva real (Supabase)

- **Fluxo:** serviço → dia → horários livres → horário → nome e WhatsApp → "Reservar esse horário".
- **O horário fica reservado na hora** (estado pendente) e some para os outros clientes.
- **O banco recusa:**
  - data e horário passados (relógio de Brasília);
  - horário ocupado ou bloqueado;
  - o mesmo WhatsApp em dois horários no mesmo dia.
- **Dois pedidos no mesmo instante** resultam em uma reserva só.
- **Clique duplo** não cria dois pedidos.
- **WhatsApp obrigatório** quando a agenda está online.
- **Horários atualizados:** consultados de novo ao trocar de dia, se tiverem mais de 45 s.
- **Supabase fora do ar ou mal configurado:** aparece "Não conseguimos consultar os horários agora." com o botão "Agendar pelo WhatsApp". A mensagem leva o serviço, o dia e o horário, se escolhido, e há um botão "Tentar de novo".

### 3. "Visite a SR Phone" (Google Maps)

- Com `mapaEmbed` preenchido, aparece o mapa com o título, o endereço e o botão "Traçar rota".
- O mapa só é criado quando a seção chega perto da tela, e usa `loading="lazy"`, `title` e `referrerpolicy`.
- Vazio, o mapa some por completo.

### 4. Avaliações premium

Cartão com estrelas, aspas, texto, iniciais, nome e "Cliente SR Phone · origem · mês/ano", mais o botão "Ver avaliações no Google". Sem avaliações cadastradas nem link, a seção some. Não existe nenhum cartão de exemplo no site.

### 5. Dados da empresa

Razão social e CNPJ ganharam um cartão na seção Contato, além do rodapé e do Schema. Ele só aparece com o dado preenchido.

### 6. GA4

Eventos novos:
- `select_product_option` e `select_product_color`, no card e na página do produto;
- `click_map`;
- `open_unboxing` e `complete_unboxing`.

O script do Google agora só baixa depois que a página termina de carregar.

### 7. Microinterações

- Trocar cor ou opção redesenha só aquele card, com a foto e o preço entrando suaves, sem piscar a grade.
- A foto se aproxima levemente no hover.
- O botão de compra ganha um brilho leve no hover e um anel claro no foco pelo teclado.
- Tudo isso desliga com movimento reduzido.

### 8. Documentação

O LEIA-ME ganhou:
- "Domínio próprio em 3 passos";
- as seções do mapa e das avaliações;
- a da caixa 3D;
- a da agenda com os estados e as regras.

O README também foi atualizado. Os exemplos de domínio e e-mail passaram para `seudominio.com.br`, genérico.

## Integrações prontas

| Integração | Situação |
|---|---|
| WhatsApp contextual | funcionando: produto, opção, cor, preço, troca, agenda e caixa 3D |
| GA4 | pronta; liga sozinha com o ID |
| Supabase (agenda) | pronta e testada num PostgreSQL 16 local com as regras do `supabase.sql`; liga com URL e chave anon |
| Google Maps | pronta; liga com o link de incorporação |
| Google Reviews | pronta; liga com o link do perfil e/ou as avaliações reais |
| Domínio próprio | pronto; basta trocar `SITE_CONFIG.url` e rodar o build |
| Schema.org | `ElectronicsStore` com CNPJ, razão social, telefone e e-mail quando preenchidos; `Offer` só com preço real |

## Integrações aguardando dados

- `STORE_CONFIG.cnpj` e `razaoSocial`
- `STORE_CONFIG.email` e `telefone`, se houver fixo
- `SITE_CONFIG.url` com o domínio próprio (hoje, o endereço provisório do Netlify)
- `STORE_CONFIG.mapaEmbed`
- `STORE_CONFIG.avaliacoesGoogle` e `AVALIACOES` (só reais, autorizadas)
- `GA_MEASUREMENT_ID`
- `SUPABASE_URL` e `SUPABASE_ANON_KEY`, depois de rodar o `supabase.sql` no projeto Supabase
- Preços e disponibilidade em `data/products.js` (etapa anterior)

## Unboxing 3D

### Como carrega

1. A página traz só uma **imagem estática** da caixa (`assets/unboxing/caixa-lacrada-v1.webp`, 11 KB, `loading="lazy"`) e o botão "Abrir a caixa em 3D". A imagem foi renderizada da própria cena 3D.
2. No toque, `js/motion.js` confere se o aparelho tem WebGL e faz `import("./unboxing3d.js")`.
3. O módulo `js/unboxing3d.js` importa o **Three.js enxuto** (`assets/vendor/three/three-sr-0.186.1.min.js`: 564 KB, cerca de 145 KB com gzip). É o Three.js 0.186.1 oficial, só com as classes usadas.
   - A entrada está em `ferramentas/three/entrada.mjs`, com o comando para gerar de novo.
   - O pacote completo teria cerca de 2,1 MB sem minificar.
4. Sem WebGL, com erro ao importar ou se passar de 20 s: fica a imagem estática com "Experiência 3D indisponível no momento" e os botões "Ver modelos" e "Falar no WhatsApp".

### A cena

Tudo é desenhado em código, sem modelo externo e sem imagem 2D fingindo 3D:
- **Caixa:** base e tampa separadas, em papel branco fosco com bordas arredondadas (ExtrudeGeometry com chanfro). Tampa com a marca "SR PHONE" discreta em baixo-relevo e berço interno.
- **Lacre:** uma fita de 72 segmentos que desce pela frente e cruza a junção da tampa com a base, com a aba laranja "PUXE".
- **Aparelho:** aro metálico, tela de vidro com papel de parede quente e ilha.
- **Luz:** ambiente de estúdio (RoomEnvironment), uma luz principal com sombra e um contraluz quente que acende na revelação.
- **Chão:** só a sombra e um brilho suave.

### Estados

Estão em `ESTADOS`:

| Estado | O que acontece |
|---|---|
| `SEALED` | pode girar e puxar a aba |
| `PEELING` | puxando o lacre; a caixa não gira |
| `UNSEALED` | pode girar e puxar a tampa |
| `OPENING` | puxando a tampa; a caixa não gira |
| `OPENED` | revelado; pode girar para ver o aparelho |

A tampa não abre antes de o lacre sair. Ao tentar, aparece "Primeiro, puxe a aba laranja do lacre."

### O lacre (`sealProgress` de 0 a 1)

- O puxão para baixo (e um pouco para o lado) vira progresso por uma curva, que dá a sensação de resistência. O desenho segue o dedo com suavização.
- A parte descolada faz uma curva a partir da frente de descolamento: a ponta levanta e o raio aumenta com o progresso, afastando a fita da caixa.
- A fita acompanha o lado do ponteiro e projeta sombra na caixa.
- **Soltou antes de 70%:** volta suave.
- **Passou de 70% ao soltar, ou de 88% durante o gesto:** completa sozinho, a fita cai e some.

### A tampa (`openProgress` de 0 a 1)

- Acompanha o gesto para cima e inclina um pouco para trás.
- **Passou de 60%:** completa sozinha.
- **Revelação (cerca de 1,7 s):**
  - a tampa sobe e some;
  - a câmera se aproxima pouco (menos em tela estreita) e olha mais de cima;
  - a luz principal e o contraluz aumentam;
  - a tela do aparelho acende;
  - o aparelho sobe alguns centímetros e se inclina para a câmera.

### Gestos

- `pointerdown`, `pointermove`, `pointerup`, `pointercancel` e `lostpointercapture`, com `setPointerCapture`: funciona com mouse, dedo e caneta.
- **Rotação:** amortecimento, inércia, limite vertical e cursor `grab`/`grabbing`.
- **No dedo:** o `touchstart` só segura a rolagem quando o dedo começa em cima da caixa. Fora dela a página rola normalmente. O canvas usa `touch-action: pan-y`.
- **Acessível:** botões "Retirar o lacre", "Abrir a tampa" e "Recomeçar" fazem cada etapa sem arrastar. A dica muda a cada etapa (`aria-live`), e o canvas tem descrição.

### Movimento reduzido e som

- **Movimento reduzido:**
  - animações curtas;
  - sem inércia;
  - sem giro de entrada;
  - câmera quase parada;
  - pulso da dica desligado.
- **Som:** `ENABLE_UNBOXING_AUDIO` em `data/config.js` (desligado por padrão). São sons sintetizados na hora com Web Audio, sem arquivo: raspar do lacre, lacre saindo, ar da tampa e clique final. O áudio só começa depois do primeiro toque na caixa.

### Economia

- DPR limitado a 1,6; sombra de 512 px no celular e 1024 px no computador.
- Poucas luzes e texturas geradas em canvas (as maiores com 1024×512).
- O desenho só roda enquanto algo se move e pausa fora da tela ou com a aba escondida.
- `destruir()` devolve a memória de vídeo ao sair da página.
- Usa `PCFShadowMap` (a opção antiga `PCFSoftShadowMap` avisa no console no Three.js 0.186).

## Arquivos criados

- `js/unboxing3d.js`: a caixa 3D (módulo)
- `assets/vendor/three/three-sr-0.186.1.min.js` e `assets/vendor/three/LICENSE`: Three.js enxuto (licença MIT)
- `assets/unboxing/caixa-lacrada-v1.webp`: imagem estática da caixa
- `ferramentas/three/entrada.mjs`: o que entra no Three.js enxuto e como gerar de novo
- `docs/PREMIUM-FINAL.md`: este relatório

## Arquivos modificados

- `index.html`: seção do lacre com o palco 3D; agenda na ordem serviço → dia → horário → nome → WhatsApp; bloco do mapa; cartão da empresa
- `css/styles.css`: palco 3D, dica, CTA final, mapa, avaliações, agenda e microinterações; saiu o CSS do selo 2D, que não é mais usado
- `js/motion.js`: botão e carregamento da caixa 3D (substitui o selo 2D) e versão estática
- `js/scheduling.js`: reserva, WhatsApp obrigatório online, consulta sob demanda, carregamento e plano B pelo WhatsApp
- `js/site.js`: "Visite a SR Phone", `click_map`, avaliações premium, cartão da empresa e termo de uso da reserva
- `js/catalog.js`: eventos de cor e opção; card redesenhado sozinho; aproximação no hover
- `js/analytics.js`: eventos novos e script depois da carga
- `data/config.js`: `ENABLE_UNBOXING_AUDIO` e exemplos de e-mail genéricos
- `supabase.sql`: pendente reserva o horário; troca de índice com migração segura; duplicidade por WhatsApp; corrida entre dois pedidos; estados documentados
- `ferramentas/lint.mjs`: confere módulos ES e os `import`
- `ferramentas/build.mjs`: exemplo de domínio genérico
- `ferramentas/testes.mjs`: 40 verificações novas
- `LEIA-ME.txt`, `README.md`

## Dependências

- **Site:** nenhuma dependência de npm. Novo só o Three.js 0.186.1 (MIT), servido pelo próprio site e baixado sob demanda. Não passa por CDN, então a política de segurança (CSP) não mudou.
- **Ferramentas:** o Playwright continua opcional para `npm test`. Para regerar o Three.js enxuto, use `three` e `esbuild` numa pasta fora do site (comando em `ferramentas/three/entrada.mjs`).

## Configuração: onde inserir cada dado

| Dado | Onde |
|---|---|
| CNPJ | `data/config.js` › `STORE_CONFIG.cnpj` |
| Razão social | `data/config.js` › `STORE_CONFIG.razaoSocial` |
| E-mail | `data/config.js` › `STORE_CONFIG.email` |
| Domínio | `data/config.js` › `SITE_CONFIG.url`, depois `npm run build` e publicar (LEIA-ME › "Domínio próprio em 3 passos") |
| Google Maps | `data/config.js` › `STORE_CONFIG.mapaEmbed` (Maps › Compartilhar › Incorporar um mapa › só o link de dentro do `src`) |
| Google Reviews | `data/config.js` › `STORE_CONFIG.avaliacoesGoogle` (link do perfil) e `AVALIACOES` (avaliações reais) |
| GA4 | `data/config.js` › `GA_MEASUREMENT_ID` (`G-XXXXXXXXXX`) |
| Supabase | rodar `supabase.sql` no SQL Editor e preencher `data/config.js` › `SUPABASE_URL` e `SUPABASE_ANON_KEY` (só a chave anon/publishable; a `service_role` é recusada pelo site, pelo build e pelo lint) |
| Som da caixa 3D | `data/config.js` › `ENABLE_UNBOXING_AUDIO = true` |

## Performance

- **Primeira carga** (celular, sem compressão): 705 KB contra 691 KB antes (+14,7 KB, perto de 4 KB com gzip). É o HTML e o CSS da seção nova e o código de carregamento. Continuam os mesmos 21 pedidos.
- **Nada disso baixa na abertura do site:**
  - Three.js e caixa 3D: só no toque em "Abrir a caixa em 3D";
  - Google Maps: só quando a seção chega perto da tela;
  - Supabase: só quando a agenda chega perto da tela;
  - GA4: só com ID e depois da carga.

  Há um teste automático para isso.
- **Troca de cor ou opção:** redesenha um card só, em vez da grade inteira.
- **Imagem estática da caixa:** 11 KB.

## Testes

`npm test`: **151 ok, 0 falhas.** São 111 que já existiam mais 40 novos.

- **Caixa 3D:**
  - carrega só no toque;
  - a tampa não abre antes do lacre;
  - o lacre solto cedo volta;
  - o lacre sai inteiro;
  - a tampa abre;
  - o CTA final aparece com os links certos;
  - "Recomeçar" funciona;
  - o console fica limpo.
- **Sem WebGL:** imagem estática, aviso e botões, sem baixar o Three.js e sem erro.
- **Movimento reduzido:** o teclado abre a caixa em dois passos.
- **Celular** (320 e 390 px, toque real via protocolo do Chrome): o dedo na caixa não rola a página, fora dela rola, e o dedo abre a caixa. Sem rolagem lateral.
- **GA4:** sem ID, nada é carregado. Com ID, um script só; os eventos de filtro, opção, cor, busca e produto chegam, sem dado pessoal.
- **Supabase simulado:**
  - horário reservado desabilitado;
  - WhatsApp obrigatório;
  - clique duplo gera um pedido só;
  - "Horário reservado";
  - consulta só perto da agenda;
  - fora do ar, o plano B com serviço, dia e horário.
- **Mapa, avaliações e empresa:** somem vazios. Preenchidos:
  - o mapa entra só perto da tela;
  - aparecem "Visite a SR Phone" e "Traçar rota";
  - avaliações com estrelas e "Cliente SR Phone";
  - CNPJ e razão social no contato, no rodapé e no Schema, sem nota inventada.
- **Banco de verdade:** o `supabase.sql` rodou num PostgreSQL 16 local.
  - A versão antiga, com 3 pedidos no mesmo horário, migrou certo: ficou o mais antigo e os outros foram cancelados com a observação.
  - Rodar duas vezes não dá erro.
  - O banco recusou horário ocupado, pedido duplicado, falta de WhatsApp, data passada, horário passado, nome curto e horário bloqueado.
  - O `anon` não lê a tabela nem confirma pedidos.
  - Cancelar libera o horário.
  - Dois pedidos simultâneos geram uma reserva só.
- **Regressão:**
  - 9 larguras;
  - os 19 produtos com todas as cores e mídias (129);
  - teclado;
  - os 20 testes funcionais da auditoria.

  Nada quebrou.

## Build

BUILD: OK

## Lint

LINT: OK

## Testes

TESTES: OK (151 ok, 0 falhas)
