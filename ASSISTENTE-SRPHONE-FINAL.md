# Assistente SR Phone: relatório final

Este documento explica o que foi feito no Assistente SR Phone (o mascote e o chat), como ele funciona, como ligar a inteligência artificial e o que ainda depende de você.

## Resumo: o que está pronto e o que falta

| Item | Situação |
|---|---|
| Mascote 3D da marca (versão final, feita no código), com **pernas e sapatos** e 12 gestos suaves | ✅ Pronto e funcionando |
| O site usar o **modelo 3D oficial** sozinho, quando o arquivo existir | ✅ Pronto (automático, sem mexer em código) |
| **Modelo 3D oficial** (`srphone-assistant.glb`) | ❌ **Ainda não existe.** Precisa ser feito por um artista 3D (veja `GUIA-MODELO-3D-SRPHONE.md`) |
| Chat: atalhos, preço com pergunta de armazenamento, cores, troca guiada, "qual iPhone escolher", WhatsApp com resumo, memória, "Limpar conversa" | ✅ Pronto |
| Cérebro local (responde sem IA, com os dados do site) | ✅ Pronto |
| Função da IA no servidor (`/api/assistente`), com proteções | ✅ Pronta e testada com respostas simuladas |
| **IA respondendo de verdade no site** | ⚠️ **Depende de você**: criar a chave, cadastrar `AI_API_KEY` no Netlify e publicar por Git ou pelo Netlify CLI |
| Teste com a IA real (chamada de verdade à Anthropic) | ❌ **Não foi feito**: aqui não há chave (e nenhuma chave foi usada) |

Enquanto a IA não estiver ligada, **o site funciona normalmente**: o chat responde com o cérebro local e, uma vez por visita, avisa: *"Estou com dificuldade para acessar o assistente inteligente agora, mas ainda consigo ajudar com informações básicas da SR Phone."* (Se preferir não mostrar esse aviso até ligar a IA, troque `ia: { ligada: true }` por `ligada: false` em `data/config.js`.)

---

## 1. O que foi criado e modificado

### Arquivos novos

| Arquivo | O que é |
|---|---|
| `js/assistente-cerebro.js` | O "cérebro" do chat. Só é baixado quando a pessoa abre o chat. Tem os atalhos, a troca guiada, a escolha de iPhone, o cérebro local, a memória da conversa e a conversa com a IA do servidor |
| `netlify/functions/assistente.mjs` | A função do Netlify, em `/api/assistente`, com limite de pedidos por visitante |
| `services/ai/index.mjs` | O que a função faz: confere o pedido, aplica os limites, monta a conversa, chama a IA e devolve a resposta aos poucos |
| `services/ai/conhecimento.mjs` | Os **dados oficiais** que a IA recebe: loja, pagamento, troca, garantia, catálogo e preços, lidos de `data/config.js`, `data/products.js` e `js/precos.js` |
| `services/ai/prompt.mjs` | As **instruções da IA** (prompt de sistema) e a montagem da conversa |
| `services/ai/seguranca.mjs` | Proteções: pedido para "ignorar as regras", vazamento de chave e preço que não é do aparelho citado (produto + armazenamento + cor) |
| `services/ai/filtro.mjs` | Confere a resposta **enquanto ela chega**: troca `[[preco:ID\|opção\|cor]]` pelo valor do catálogo; valor errado é barrado antes de aparecer; os marcadores viram botões |
| `services/ai/limites.mjs` | Limite de perguntas por visitante |
| `services/ai/provedores/anthropic.mjs` | O provedor de IA (Claude, pelo SDK oficial `@anthropic-ai/sdk`) |
| `services/ai/provedores/demonstracao.mjs` | Um provedor de **demonstração** (resposta fixa, sem chave), só para testar no computador |
| `services/ai/provedores/index.mjs` | A lista de provedores (para trocar de provedor) |
| `assets/modelos/sem-modelo.json` | O aviso que o site recebe enquanto o GLB oficial não existe (não apague) |
| `GUIA-MODELO-3D-SRPHONE.md` | O guia completo para o artista fazer o modelo 3D oficial |
| `ferramentas/mascote/blender-srphone.py` | Script do Blender que confere a cena e exporta o GLB do jeito certo |
| `ferramentas/testes-ia.mjs` | Testes do lado do servidor (sem IA de verdade) |
| `ASSISTENTE-SRPHONE-FINAL.md` | Este relatório |

### Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `js/mascote3d.js` | Pernas, joelhos e sapatos no mascote da marca; ele fica em pé no chão (respira pelos joelhos, em vez de flutuar); 4 gestos novos (welcome, lookaround, present, goodbye); GLB detectado sozinho; animação que falta no GLB usa a parecida |
| `js/assistente.js` | Os gestos novos (boas-vindas ao abrir, aceno no "Posso ajudar?", tchau ao fechar, olhar em volta de vez em quando); a resposta que chega aos poucos; "Limpar conversa"; atalhos do produto; o cérebro saiu para o módulo que só baixa ao abrir |
| `index.html` | Botão "Limpar conversa" e o subtítulo "Assistente virtual" no chat |
| `css/styles.css` | Estilo das respostas rápidas, texto com quebra de linha, cabeçalho do chat no celular |
| `data/config.js` | `ASSISTENTE`: `modelo3d` no endereço padrão, 12 animações, `atalhosProduto` e `ia` (ligada e endereço da função) |
| `js/site.js` | Política de privacidade: como o assistente e a IA tratam a conversa |
| `netlify.toml` | Seção `[functions]`, a regra do GLB ausente e o bloqueio de `services/`, `netlify/` e dos guias |
| `.env.example` | As variáveis da IA (vazias) |
| `ferramentas/servidor.mjs` | `npm start` também roda a função em `/api/assistente` e imita a regra do GLB |
| `ferramentas/build.mjs` | GLB ausente vira aviso (não erro); confere atalhos e a configuração da IA |
| `ferramentas/lint.mjs` | Procura chaves de IA no código; confere que o navegador nunca fala direto com a IA |
| `ferramentas/testes.mjs` | Testes novos do assistente (IA, memória, falhas, perguntas pedidas, segurança) |
| `ferramentas/mascote/gera-molde.mjs` | O molde agora tem as 12 animações |
| `ferramentas/mascote/molde-*.glb`, `assets/assistente/mascote-estatico.webp` | Refeitos com pernas e sapatos |
| `package.json` | Dependência `@anthropic-ai/sdk` e os comandos `test:ia` e `mascote:molde` |
| `docs/ASSISTENTE-SR-PHONE.md` | Removido: o conteúdo foi para este relatório e para o guia do modelo 3D |

---

## 2. Como funciona (arquitetura)

```
Navegador (o site)                                  Servidor (Netlify Function)              IA
─────────────────────────────                       ─────────────────────────────            ─────────
js/assistente.js  (vem com a página, ~9 KB)
  mascote, posição, estados, fila de mensagens
        │ ao abrir o chat
        ▼
js/assistente-cerebro.js  (só baixa ao abrir)
  1. atalhos e fluxos  ──► resposta na hora (dados do site)
  2. pergunta aberta   ──► POST /api/assistente ──► services/ai/index.mjs
                            { últimas mensagens,       ├─ confere o pedido e o limite
                              página aberta }          ├─ "ignore as regras"? recusa sem chamar a IA
                                                       ├─ dados oficiais (conhecimento.mjs)
                                                       ├─ instruções (prompt.mjs)
                                                       └─ provedor (anthropic.mjs) ────────────► Claude
                      ◄── resposta aos poucos ───────── filtro.mjs (confere cada preço) ◄──────
  3. sem IA (sem chave, erro, limite, demora) ──► cérebro local (os mesmos dados do site)
```

**Híbrido.** O que tem resposta certa com os dados do site é respondido no próprio navegador, com ou sem IA: os 6 atalhos, localização, agenda, "falar com alguém", a troca guiada e "qual iPhone escolher". As perguntas abertas vão para a IA, que recebe **só os dados oficiais** (loja e catálogo) junto com a página aberta.

**A IA não inventa**, em três camadas:
1. As instruções proíbem inventar preço, estoque, cor, garantia, promoção, pagamento, prazo, produto, endereço, horário, desconto e condição. Quando não houver o dado, a resposta é: *"Não consigo confirmar essa informação por aqui. Posso chamar a equipe da SR Phone no WhatsApp para verificar para você."*
2. Os dados que ela recebe dizem o que o site **não** informa (juros, desconto, disponibilidade "consulte").
3. A IA **não escreve o número do preço**: ela escreve `[[preco:iphone-15|128 GB]]` e o servidor troca pelo valor do catálogo ("R$ 3.900,00", "preço sob consulta" ou "a partir de ..."). O valor que a pessoa vê sai de `data/products.js`.
4. Se a IA escrever um valor mesmo assim, o **filtro** confere o valor com o **aparelho, o armazenamento e a cor** de que a frase fala (não com uma lista de todos os preços). R$ 13.000,00 é preço do iPhone 18 Pro Max de 256 GB e não passa como preço do iPhone 15. Valor errado, variante sem preço, desconto, soma ou parcela calculada: a resposta é trocada por aquela frase e pelo botão do WhatsApp **antes** de o valor aparecer na tela. Vale para "R$13000", "13 mil reais", "13.000", "13k", "treze mil reais" e outros jeitos de escrever.
5. O histórico vem do navegador e pode ter sido editado: valores em dinheiro nas falas antigas do assistente são trocados por "[valor: veja os dados oficiais]" antes de ir para a IA.

**Botões.** A IA não escreve links. Ela coloca marcadores (`[[acao:whatsapp]]`, `[[produto:iphone-17]]`...) e o site monta os botões com os dados do próprio site. Produto que não existe e ação desconhecida são ignorados.

**Estados do mascote.** Primeira abertura: boas-vindas (welcome). Enviou a pergunta: pensa (thinking). Chegou o primeiro pedaço da resposta: fala (speaking) enquanto o texto aparece. No fim: volta ao normal (idle), apresenta (present) quando mostra produtos ou aponta (pointing) quando oferece uma ação. WhatsApp: joinha (success). Fechou o chat: tchau (goodbye). Parado há um tempo: olha em volta (lookaround), no máximo 4 vezes por página. Com movimento reduzido, nada disso anima: vira pose parada.

**Memória.** A conversa fica **só nesta aba do navegador** (sessionStorage), no máximo 30 mensagens; a IA recebe as últimas 10. Recarregar a página ou abrir um produto mantém a conversa. Fechar a aba ou tocar em "Limpar conversa" (ícone de lixeira no topo do chat) apaga. Nada é guardado em servidor.

**Contexto do produto.** Com um produto aberto, o chat sabe qual é e qual opção e cor estão marcadas ("quanto custa esse?"). Para a IA vão só: o id, o nome, o armazenamento, a cor e o endereço da página. O preço ela pega do catálogo, não do navegador. O último produto citado na conversa vale mais que o da página ("Quero o 16 Pro Max" → "Tem preto?").

**WhatsApp.** O botão "Continuar no WhatsApp" abre a conversa com um resumo já escrito, por exemplo:

```
Olá, vim pelo Assistente SR Phone.
Produto: iPhone 17 Pro 256 GB na cor Prateado
Dúvida: Tem na cor preta?
Troca: iPhone 13 · 128 GB · bateria 84%
```

A mensagem **nunca é enviada sozinha**: a pessoa vê e toca em enviar.

---

## 3. Onde colocar o GLB

Coloque o arquivo em **`assets/modelos/srphone-assistant.glb`**. Não precisa mudar mais nada: com o arquivo lá, o site mostra o GLB; sem ele (o normal), o mascote 3D da marca. Depois rode `npm run build` (confere o arquivo) e `npm run mascote:imagem` (refaz a imagem parada).

Como o arquivo precisa ser feito (proporções, materiais, ossos, as 12 animações e os nomes, escala, orientação, origem, tamanho, texturas, exportação e compressão): **`GUIA-MODELO-3D-SRPHONE.md`**. O script `ferramentas/mascote/blender-srphone.py` confere e exporta pelo Blender (testado com o Blender 4.5).

---

## 4. Como ligar a IA (passo a passo)

1. **Crie a chave** em https://console.anthropic.com (API Keys) e cadastre uma forma de pagamento (a IA cobra por uso).
2. No **Netlify**: *Site configuration > Environment variables > Add a variable*:
   - `AI_API_KEY` = a chave (escopo: **Functions**). É a única obrigatória.
   - As outras são opcionais (item 5).
3. **Publique por Git (deploy contínuo) ou pelo Netlify CLI** (`npx netlify deploy --prod`). O Netlify instala o `@anthropic-ai/sdk` e empacota a função sozinho.
   > **Importante:** arrastar a pasta para o painel do Netlify (Netlify Drop) publica **só o site**, sem a função. Nesse caso o chat continua funcionando com o cérebro local.
4. **Confira**: abra o site, abra o chat e faça uma pergunta aberta (por exemplo, "Qual a diferença entre o iPhone 17 e o 17 Pro?"). A resposta vai aparecendo aos poucos. Em *Netlify > Logs > Functions* aparecem linhas como `{"assistente":"ok","uso":{...}}`. Elas só têm números, nunca a conversa.

**Custo.** O modelo padrão é o `claude-sonnet-5` (Claude Sonnet 5, US$ 2 / US$ 10 por milhão de tokens, preço da página oficial do modelo em 30/09/2026; veja `PRODUCAO-SRPHONE.md`, itens 3 e 4), com esforço baixo (`low`), que é rápido e mais econômico para chat. As instruções e o catálogo ficam em cache, o que barateia cada pergunta. Para gastar menos, use `AI_MODEL=claude-haiku-4-5` (US$ 1 / US$ 5). O limite por visitante (8 por minuto, 60 por hora) e o limite do Netlify (20 por minuto por IP) seguram abusos.

**Reserva automática.** O recurso da Anthropic que, se o Claude recusar uma pergunta por política de segurança, tenta outro modelo na mesma chamada (`fallbacks: "default"`) só é enviado nos modelos que a documentação oficial cita para ele (Claude Fable 5 e Claude Opus 5). No padrão (`claude-sonnet-5`) ele **não** é enviado. Se o Claude recusar, a pessoa recebe a frase padrão e o botão do WhatsApp.

---

## 5. Variáveis de ambiente (só no servidor)

| Variável | Obrigatória? | Padrão | Para quê |
|---|---|---|---|
| `AI_API_KEY` | **sim** | vazio | A chave da IA. **Nunca coloque em outro lugar** (código, `data/config.js`, GitHub) |
| `AI_PROVIDER` | não | `anthropic` | Qual provedor usar (`anthropic`; `demonstracao` só no computador) |
| `AI_MODEL` | não | `claude-sonnet-5` | Qual modelo. ID malformado ou que a API não conhece: a função usa o padrão e registra o aviso `modelo_invalido` |
| `AI_ESFORCO` | não | `low` | Quanto a IA pensa: `low`, `medium` ou `high` (vazio ou inválido = `low`; se o modelo não aceitar o nível, ele não é enviado) |
| `AI_MAX_TOKENS` | não | `8192` | Tamanho máximo da resposta (no Sonnet 5 o raciocínio conta junto) |
| `AI_TIMEOUT_MS` | não | `25000` | Tempo máximo (depois disso, o chat usa o cérebro local) |
| `AI_LIMITE_MINUTO` / `AI_LIMITE_HORA` | não | `8` / `60` | Perguntas por visitante |
| `AI_ORIGENS` | não | vazio | Outros domínios que podem chamar a função (o próprio site já pode) |
| `AI_DESLIGADA` | não | vazio | `1` desliga a IA sem apagar a chave |

Nenhuma dessas variáveis vai para o navegador: o `npm run build` não as lê e o `npm run lint` acusa erro se o código do navegador tentar.

---

## 6. Como testar no computador

```
npm install
npm start                      → http://localhost:8080 (sem chave: cérebro local + aviso)
```

- **Ver o chat com "IA" sem chave** (resposta de demonstração, que chega aos poucos):
  `AI_PROVIDER=demonstracao npm start`
  (no Windows PowerShell: `$env:AI_PROVIDER="demonstracao"; npm start`)
- **Com a IA de verdade**: crie o arquivo `.env` (ele nunca vai para o GitHub) com `AI_API_KEY=sua-chave` e rode `npm start`.
- **Conferências**: `npm run lint`, `npm run build`, `npm run test:ia` (servidor, sem navegador) e `npm test` (tudo, com navegador).

---

## 7. Como publicar no Netlify

- **Com Git (recomendado)**: conecte o repositório no Netlify. *Build command*: `npm run build` (ou vazio); *Publish directory*: `.`. O `netlify.toml` já tem a pasta das funções e as regras.
- **Com o Netlify CLI**: `npx netlify login`, depois `npx netlify deploy --build --prod`.
- **Arrastando a pasta** (Netlify Drop): o site funciona, mas **sem a IA** (a função não é publicada).

Depois de publicar, confira: o site abre, o chat abre, uma pergunta aberta é respondida (com a chave cadastrada) e `https://seu-site/services/ai/index.mjs` responde 404.

---

## 8. Como trocar o provedor de IA

1. Crie `services/ai/provedores/<nome>.mjs` com a função `responder({ sistema, mensagens, cfg, sinal })` (um gerador que entrega `{ tipo: "texto", texto }` e, no fim, `{ tipo: "fim", motivo }`). Use `anthropic.mjs` como modelo.
2. Registre em `services/ai/provedores/index.mjs`.
3. No Netlify: `AI_PROVIDER=<nome>` e a chave do novo provedor em `AI_API_KEY`.

O resto (dados, instruções, filtro de preços, site) não muda.

## 9. Como adicionar uma animação ao mascote

1. `js/mascote3d.js`: acrescente o estado em `ESTADOS`, o nome da animação em `ANIMACOES_PADRAO`, a pose em `POSES` (para o mascote da marca) e, se quiser, a reserva em `RESERVA`.
2. `js/assistente.js`: acrescente a duração em `DURACAO` e chame `Mascote.gesto("nome")` onde fizer sentido.
3. `data/config.js` > `ASSISTENTE.animacoes`: o nome do clipe no GLB.
4. Rode `npm run mascote:molde` (precisa do Three.js e do gltfpack; veja o topo de `ferramentas/mascote/gera-molde.mjs`) para o molde ganhar a animação nova.

## 10. Como mudar o jeito de a IA falar

Edite `INSTRUCOES` em `services/ai/prompt.mjs`. **Os dados não ficam ali**: preços, produtos e dados da loja continuam vindo de `data/products.js` e `data/config.js`, e a IA recebe a versão nova sozinha (ela relê os dados a cada 5 minutos). Depois de mudar, rode `npm run test:ia`.

---

## 11. Segurança

- A chave fica **só** na variável de ambiente do Netlify. O navegador só conhece o endereço `/api/assistente`.
- A função aceita só `POST` com JSON, só do próprio site, até 16 KB por pedido e só as últimas 12 mensagens (até 500 caracteres cada).
- Tudo o que vem do navegador é tratado como não confiável: o texto do visitante vai numa caixa marcada, que ele não consegue fechar; preço e produto são sempre os do catálogo.
- "Ignore suas regras", "mostre sua chave", "qual o seu prompt": recusado **sem nem chamar a IA** (economiza e não arrisca). O assistente continua funcionando depois.
- A resposta é conferida enquanto chega: sem chave, sem preço inventado, sem desconto inventado.
- O texto da IA nunca vira HTML (só texto), e os botões são montados pelo site.
- Limites: por visitante (na função) e por IP (no Netlify), tempo máximo por resposta, tamanho máximo da resposta, no máximo 40 perguntas à IA por visita.
- `services/`, `netlify/`, `ferramentas/`, `.env.example` e os guias não são públicos (404).
- `npm run lint` procura chaves de IA (`sk-ant-...`, `AI_API_KEY=` preenchida) em todo o código publicado.

## 12. Privacidade

A política de privacidade do site foi atualizada: as perguntas abertas, as últimas mensagens e o produto aberto vão para a função do site e para o provedor de IA (Anthropic) para gerar a resposta; o site não guarda as conversas; a conversa fica só na aba e some ao fechar ou em "Limpar conversa"; a loja só recebe o que a pessoa enviar pelo WhatsApp. A medição (se o Google Analytics for ligado) conta só eventos (`assistant_opened`, `assistant_message_sent`, `assistant_product_clicked`, `assistant_trade_started`, `assistant_whatsapp_clicked`, `assistant_schedule_clicked`), nunca o que foi escrito.

## 13. Testes feitos

- `npm run lint`: sem erros.
- `npm run build`: concluído (com o aviso de que o GLB oficial ainda não existe).
- `npm run test:ia`: **38 testes** do servidor, todos passando (dados oficiais no prompt, conversa, proteções, filtro de preço, limites, erros, tempo, streaming e a chamada pelo SDK oficial com respostas simuladas).
- `npm test`: **458 testes no navegador (Chromium), todos passando**, incluindo: as perguntas de teste pedidas; IA com streaming e os estados do mascote; memória depois de recarregar; "Limpar conversa"; IA fora do ar, no limite, com preço barrado e com texto malicioso; GLB oficial (molde com as 12 animações), sem GLB e sem WebGL; movimento reduzido; celular (375, 390, 430 e 768 px), tablet e computador; console sem erros.
- Script do Blender: rodado no Blender 4.5 (como módulo Python): importou o molde, conferiu, exportou as 12 animações; o GLB exportado (comprimido com o gltfpack) abriu no site com todas elas.

**O que não foi testado aqui:** a IA de verdade (não há chave), a publicação real no Netlify (streaming e limite de IP do Netlify) e aparelhos físicos.

## 14. O que depende de você

- [ ] Encomendar o **modelo 3D oficial** a um artista 3D, com o `GUIA-MODELO-3D-SRPHONE.md`, e colocar em `assets/modelos/srphone-assistant.glb`.
- [ ] Criar a **chave da IA** (Anthropic) e cadastrar `AI_API_KEY` no Netlify (escopo Functions).
- [ ] Publicar por **Git ou Netlify CLI** (não pela pasta arrastada), para a função ir junto.
- [ ] Fazer umas perguntas no site publicado e conferir os logs da função.
- [ ] (Opcional) Ajustar `AI_MODEL` e os limites conforme o custo.
- [ ] (Opcional) Ligar o Google Analytics (`GA_MEASUREMENT_ID`) para ver os eventos do assistente.

## 15. Limitações conhecidas

- O filtro liga cada valor ao aparelho citado **antes dele na frase**. Numa frase como "o iPhone 15 e o 16 custam R$ X e R$ Y, respectivamente", ele liga os dois valores ao último aparelho e barra a resposta (a pessoa recebe a frase padrão e o WhatsApp). É o lado seguro: nunca mostra um valor errado.
- O limite da função conta por cópia da função (o Netlify pode ter várias). O limite do Netlify (por IP) cobre todas, se o seu plano tiver esse recurso.
- A prévia (artefato) não tem servidor: lá o chat usa só o cérebro local.
- Sem JavaScript, não há mascote nem chat (o resto do site funciona).
