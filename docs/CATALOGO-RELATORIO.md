# CATÁLOGO SR PHONE — RELATÓRIO FINAL

> **Atualização (28/09/2026):** os três aparelhos CPO (iPhone 16 Pro Max CPO, 15 Pro Max CPO e 13 Pro CPO) saíram do site a pedido da loja. O catálogo tem hoje 25 produtos, todos novos. O resto deste relatório fica como histórico.

Data: 25/09/2026 · Branch: `Srphone`

**Escopo:** só a camada comercial do catálogo: preço, Pix, parcelamento, disponibilidade, estoque, apresentação dos produtos, WhatsApp e confiança na hora da compra. Hero, equipe, agenda, trade-in da página inicial, rodapé, FAQ, segurança, CSP, SEO geral, Analytics e Supabase não foram redesenhados.

**Nenhum preço, estoque ou condição comercial foi inventado.** Os preços usados nos testes automáticos são fictícios e existem só dentro do teste. O arquivo do site não recebe nenhum deles.

## Tabela de preços aplicada (25/09/2026)

Os preços abaixo vieram da tabela enviada pela loja. Nenhum outro valor foi criado: sem preço no Pix, sem preço anterior e sem disponibilidade, porque a tabela não trazia essas informações.

| Produto | Opção | Condição | Preço |
|---|---|---|---:|
| iPhone 18 Pro Max | 256 GB | Novo lacrado | R$ 13.000 |
| iPhone 18 Pro | 256 GB | Novo lacrado | R$ 10.500 |
| iPhone 17 Pro Max | 256 GB | Novo lacrado | R$ 7.750 |
| iPhone 17 Pro Max | 512 GB | Novo lacrado | R$ 9.000 |
| iPhone 17 Pro (novo no catálogo) | 256 GB | Novo lacrado | R$ 7.250 |
| iPhone 17 Pro (novo no catálogo) | 512 GB | Novo lacrado | R$ 9.500 (na tabela, preço do Prateado) |
| iPhone 16 | 128 GB | Novo lacrado | R$ 4.650 |
| iPhone 16 Plus (novo no catálogo) | 128 GB | Novo lacrado | R$ 5.250 |
| iPhone 16 Plus (novo no catálogo) | 256 GB | Novo lacrado | R$ 5.550 |
| iPhone 16 Pro Max (novo no catálogo) | sem armazenamento na tabela | Novo lacrado | R$ 6.850 |
| iPhone 16 Pro Max CPO (novo no catálogo) | 256 GB | Seminovo CPO (certificado) | R$ 6.150 |
| iPhone 13 Pro CPO (novo no catálogo) | 256 GB | Seminovo CPO (certificado) | R$ 3.350 |
| iPhone 13 (novo no catálogo) | 128 GB | Novo lacrado | R$ 3.150 |
| Apple Watch Ultra 3 (no lugar do Ultra 4) | 49 mm | Novo lacrado | R$ 4.850 |
| Apple Watch Series 12 (volta ao catálogo) | sem tamanho na tabela | Novo lacrado | R$ 3.500 |
| Apple Watch Series 11 (novo no catálogo) | 42 mm | Novo lacrado | R$ 2.550 |
| Apple Watch Series 11 (novo no catálogo) | 46 mm | Novo lacrado | R$ 2.750 |
| Apple Watch SE 3 | 40 mm | Novo lacrado | R$ 1.950 |
| Apple Watch SE 3 | 44 mm | Novo lacrado | R$ 2.150 |
| iPad 11 | 128 GB | Novo lacrado | R$ 3.150 |
| MacBook Neo | 256 GB | Novo lacrado | R$ 5.000 |
| AirPods Pro 3 | Estojo MagSafe USB-C | Novo lacrado | R$ 3.750 |
| AirPods 4 | Com Cancelamento de Ruído | Novo lacrado | R$ 1.550 |

Ficaram "Preço sob consulta" os valores com "?" na tabela: **iPhone 15**, **iPhone 15 Pro Max CPO** e **iPhone 17**. As outras opções dos produtos acima (por exemplo, o 1 TB do 17 Pro Max ou o AirPods 4 padrão) também continuam sob consulta.

### Seminovos CPO

Os três CPO aparecem como "Seminovo CPO (certificado)" no card e na página. Neles o site não mostra "Novo e lacrado", "Caixa lacrada" nem a linha de nota fiscal: a página diz que o aparelho não é novo e que a loja confirma estado, bateria e acessórios pelo WhatsApp. Para o Google, eles vão como `RefurbishedCondition` (e não como novos). A busca por "cpo" ou "seminovo" encontra os três.

## Produtos encontrados

**28 produtos** em 5 categorias:
- iPhone: 15 (três deles seminovos CPO)
- Apple Watch: 4
- iPad: 3
- MacBook: 3
- AirPods: 3

## Produtos sem preço

- **iPhones:** Air, 17, 17e, 15 e 15 Pro Max CPO
- **iPads:** iPad Pro e iPad Air
- **Macs:** MacBook Air e MacBook Pro
- **AirPods:** AirPods Max 2

Eles mostram "Preço sob consulta" e o botão "Consultar no WhatsApp".

## Produtos sem disponibilidade

Todos, menos o iPhone 15 ("Disponível", que veio do site original). A tabela não trazia estoque, então eles mostram "Consulte disponibilidade".

## Produtos sem foto própria por cor

- **iPhone 15:** Verde, Amarelo e Rosa
- **iPad Pro:** Preto-espacial
- **Sem nenhuma foto ainda** (mostram "Imagem em atualização"): iPhone 16 Pro Max, 16 Pro Max CPO, 15 Pro Max CPO, 13 Pro CPO e 13, Apple Watch Series 12 e Series 11
- **Usando as fotos de divulgação de outro modelo com as mesmas cores:** iPhone 17 Pro (fotos do 17 Pro Max) e iPhone 16 Plus (fotos do iPhone 16), como já acontecia no 18 Pro

Nessas cores aparece "Foto desta cor em atualização". O site nunca mostra a foto de outra cor no lugar.

Todos os outros produtos têm foto em todas as cores. AirPods Pro 3 e AirPods 4 têm uma cor só, e as fotos valem para ela.

## Alterações realizadas

### Pagamento

Tudo agora fica num lugar só: `data/config.js`, no bloco `STORE_CONFIG.pagamento`. Ele substitui os antigos `precos`, `pagamentos` e `pagamentoNota`.

| Campo | O que controla |
|---|---|
| `aceitaPix`, `aceitaCartao`, `aceitaIphoneNaTroca` | formas aceitas |
| `maxParcelas` | máximo de parcelas; mantive 21, que veio do site original da loja |
| `maxParcelasSemJuros` | parcelas sem juros; `null`, porque não foi confirmado |
| `descontoPix` | desconto no Pix para todos; `null` |
| `observacao` | frase junto das formas de pagamento |
| `logoPix`, `bandeiras` | logotipos do rodapé |

O rodapé, o contato, os cards, a página do produto e as perguntas frequentes leem desse bloco.

### Estrutura de preço

- Todos os produtos têm os campos `preco`, `precoPix`, `precoDe`, `parcelas`, `parcelasSemJuros`, `status` e `estoque`. Todos estão `null` ou vazios até a loja preencher.
- **Sem preço** (null, vazio ou 0): aparece "Preço sob consulta" e o botão "Consultar no WhatsApp". Não há parcelamento, não aparece R$ 0,00 e não entra `Offer` nos dados para o Google.
- **Com preço:** o preço aparece em destaque, "Pix: R$ …" logo abaixo (só se houver) e o botão vira "Comprar pelo WhatsApp".
- **Preço anterior:** "De ~~R$ …~~ Por R$ …" só aparece se `precoDe` for maior que o preço. Se não for, é ignorado. Os selos "-X%" e "% OFF" saem desse mesmo valor real.
- **Pix maior que o preço:** é ignorado.
- **Parcelamento:** uma função só (`parcelamentoDe`) monta a frase.
  - Com parcelas sem juros confirmadas: "12x de R$ … sem juros".
  - Sem essa confirmação: "Em até 21x no cartão · Consulte as condições de parcelamento". O site não calcula valor de parcela com juros.
- **Preço por armazenamento:** campo opcional `variantes` (`[{ opcao:"256 GB", preco, precoPix, precoDe, status, estoque }]`). É compatível com os produtos atuais: sem `variantes`, vale o preço do produto.

### Disponibilidade

- **Status padronizados:** `disponivel`, `ultimas-unidades`, `sob-encomenda`, `indisponivel` e `consultar`. Status vazio vira "Consulte disponibilidade". Os nomes antigos continuam aceitos.
- **Estoque em número:** mais de 5 = Disponível; de 1 a 5 = Últimas unidades; 0 = Indisponível. O status escrito pela loja sempre vale mais. Sem número, o site não supõe nada.

### Selos (`badge`)

- O campo `tag` virou `badge`, direto no produto. Vazio = sem selo. O nome antigo ainda funciona.
- Tirei o selo "Em estoque" do iPhone 15, porque repetia o status "Disponível". Um selo não deve carregar estoque: ele ficaria desatualizado quando o status mudasse.
- Os outros selos (Mais vendido, Custo-benefício, Offshore, Mais fino, Entrada no Mac) continuam, esperando sua confirmação.

### Cards

- Nova ordem: imagem → nome → frase curta → opções → disponibilidade → preço, Pix e parcelas → botão.
- Quando há mais de uma opção (armazenamento, tamanho ou versão), dá para escolher no próprio card. A escolha muda o preço (se houver variantes), a disponibilidade e a mensagem do WhatsApp.
- O foco do teclado continua no botão escolhido.

### Página do produto

- Nova ordem:
  1. nome;
  2. armazenamento;
  3. cor;
  4. disponibilidade;
  5. preço, Pix e parcelas;
  6. botão principal;
  7. confiança;
  8. troca (só iPhone);
  9. descrição;
  10. ficha técnica.
- A escolha do card passa para a página do produto, e a da página volta para o card.

### Bloco de confiança

Fica perto do botão e só mostra o que está confirmado nos dados:
- "Novo e lacrado" (da condição do produto);
- "Retirada na loja em Macaé" (do endereço);
- "Atendimento pelo WhatsApp";
- "Seu iPhone na troca", só em iPhone.

Saiu desse bloco o item "Nota fiscal e garantia".

### Troca na página do produto

- Ganhou um botão próprio, "Calcular minha troca no WhatsApp", com a mensagem da troca.
- O botão principal continua com a mensagem do produto.
- Sem o iPhone de entrada escolhido, o botão não abre o WhatsApp e explica o que falta.
- Mac, iPad, Apple Watch e AirPods não mostram troca.

### WhatsApp

A mensagem agora é:

> "Olá! Tenho interesse no [produto], [opção], na cor [cor]. Vi no site da SR Phone e gostaria de confirmar disponibilidade e condições de pagamento."

- Com preço, entra também "Vi o valor de R$ … no site."
- Com Pix, entra "Também vi a opção de R$ … no Pix."
- Campo vazio fica de fora: nunca aparece "undefined" ou "null".

### Busca, ordenação e Google

- **Busca:** encontra por nome, categoria, armazenamento, cor e selo, sem acento e em qualquer ordem. Exemplos: "iphone 512 salvia" e "macbook 13 polegadas".
- **Ordenação por preço:** vale o menor preço real. Produto sem preço vai para o fim nas duas ordens e nunca conta como zero. Enquanto nenhum produto tinha preço, a opção de ordenar por preço ficava escondida; com a tabela aplicada, ela aparece.
- **Dados para o Google:**
  - `Offer` só para produto com preço.
  - Com variantes, uma `Offer` por opção com preço.
  - Disponibilidade só quando a loja informou.
  - "NewCondition" só para produto novo.

### Cor sem foto e acessibilidade

- **Cor sem foto:** o aviso agora é "Foto desta cor em atualização".
- **Acessibilidade:**
  - opções e cores com `aria-pressed` e rótulo de grupo;
  - preço anterior e atual com texto para leitor de tela;
  - foco preservado ao trocar cor e opção.

### Celular e build

- **Celular:** em 320 px, um botão comprido alargava a coluna da página do produto além da borda. Corrigi.
- **`npm run build`:** passou a conferir status válidos, números de preço, parcelas e estoque, variantes com opção existente, Pix maior que o preço, preço anterior inválido e o bloco `pagamento`.

## Arquivos alterados

- `data/products.js`: guia "COMO ATUALIZAR PREÇO E ESTOQUE" no topo, campos padronizados nos 19 produtos e `badge`
- `data/config.js`: bloco `STORE_CONFIG.pagamento`
- `js/catalog.js`: preço, Pix, parcelas, variantes, disponibilidade, cards, página do produto, busca, ordenação e dados para o Google
- `js/whatsapp.js`: mensagem com contexto
- `js/core.js`: funções de pagamento
- `js/site.js`: rodapé, contato e FAQ leem o novo bloco de pagamento
- `index.html`: ordem da página do produto e botão próprio da troca
- `css/styles.css`: linhas de preço, opções no card, bloco de confiança e correção em 320 px
- `ferramentas/build.mjs`: validações do catálogo e do pagamento
- `ferramentas/testes.mjs`: 30 verificações novas da camada comercial
- `LEIA-ME.txt`: onde editar preço, estoque e pagamento
- `docs/CATALOGO-RELATORIO.md`: este relatório

## Onde editar preço

`data/products.js`: ache o produto pelo nome e preencha `preco`, `precoPix` e, se for real, `precoDe`.

Preço diferente por armazenamento: campo `variantes` do produto. O passo a passo está no topo do arquivo.

## Onde editar estoque

`data/products.js`, no mesmo produto:
- `status`: `"disponivel"`, `"ultimas-unidades"`, `"sob-encomenda"`, `"indisponivel"` ou `"consultar"`;
- ou `estoque` com a quantidade (ela não aparece no site).

## Onde editar pagamento

`data/config.js` › `STORE_CONFIG.pagamento`: Pix, cartão, troca, `maxParcelas`, `maxParcelasSemJuros`, `descontoPix`, `observacao`, `logoPix` e `bandeiras`.

Um produto pode ter o próprio `parcelas` e `parcelasSemJuros` em `data/products.js`.

## Testes

`npm test`: **111 ok, 0 falhas.** Entre elas, as 30 novas da camada comercial, com um catálogo de teste de preços fictícios:
- nenhum card nem página mostra R$ 0,00, "undefined", "null" ou "NaN";
- produto sem preço (inclusive preço 0) mostra "Preço sob consulta" e "Consultar no WhatsApp";
- produto sem status mostra "Consulte disponibilidade";
- estoque 3 vira "Últimas unidades" e estoque 0 vira "Indisponível";
- preço anterior menor que o preço não aparece;
- Pix maior que o preço é ignorado;
- preço escrito com vírgula ("4.999,90") funciona;
- parcelas sem juros não confirmadas mostram texto neutro; confirmadas mostram o valor da parcela;
- variantes: preço e estoque de cada opção, com o foco preservado;
- o WhatsApp de todos os cards cita o produto, a opção, a cor e o preço;
- ordenação por menor e maior preço, com os produtos sem preço no fim;
- busca por nome + armazenamento + cor, sem acento, e por tamanho;
- `Offer` só para produto com preço; variantes viram várias `Offer`; disponibilidade no Schema vem do status;
- a ordem da página do produto está certa;
- o bloco de confiança não tem nota fiscal, garantia Apple, "original" nem "imediata";
- a troca sem iPhone de entrada não abre o WhatsApp e explica no campo; com o iPhone, a mensagem leva o aparelho;
- Mac não mostra troca de iPhone.

Também rodei:
- **Varredura completa:** 9 larguras (320 a 1280), os 19 produtos, todas as cores e miniaturas (129 mídias) e o teclado. Nenhum erro, nenhum transbordo e nenhum alvo de toque menor que 24 px.
- **Com o catálogo de teste, em 320, 360, 375, 390 e 430 px:** preço, Pix e parcelas não quebram o card nem a página do produto.

## Build

BUILD: OK

## Lint

LINT: OK

## Testes

TESTES: OK (111 ok, 0 falhas)
