/* ==================================================================
   CATÁLOGO DA SR PHONE: cada { ... } é um produto.
   Nada aqui pode ser inventado: campo sem informação fica null (ou "")
   e o site mostra uma frase neutra no lugar ("Preço sob consulta",
   "Consulte disponibilidade"). Nunca aparece R$ 0,00.

   ==================================
   COMO ATUALIZAR PREÇO E ESTOQUE
   ==================================
   Ache o produto abaixo (procure pelo nome) e troque só os números:

       preco: 4999,          <- preço normal, em número: sem R$ e sem ponto de milhar
       precoPix: 4699,       <- preço no Pix (null = não mostra linha de Pix)
       status: "disponivel", <- disponibilidade (valores abaixo)

   Centavos com ponto: 4999.90. Também vale escrever "4.999,90" entre aspas.
   Depois salve o arquivo e suba a pasta de novo na Netlify.

   Valores de status:
       "disponivel"        -> Disponível
       "ultimas-unidades"  -> Últimas unidades
       "sob-encomenda"     -> Sob encomenda
       "indisponivel"      -> Indisponível
       "consultar" ou ""   -> Consulte disponibilidade (use enquanto não confirmar)

   Em vez do status, dá para escrever a quantidade em estoque (a quantidade nunca aparece no site):
       estoque: 8   -> Disponível (mais de 5)
       estoque: 3   -> Últimas unidades (de 1 a 5)
       estoque: 0   -> Indisponível
   O status escrito pela loja (disponivel, ultimas-unidades...) vale mais que o estoque;
   "consultar" não: com estoque preenchido, vale o estoque.

   Parcelas, juros e desconto no Pix para TODOS os produtos ficam em
   data/config.js > STORE_CONFIG.pagamento.
   ==================================

   CAMPOS
   id        = identificador do produto no endereço (#/produto/id). Só letras, números e "-"
   cat       = categoria: "iphone", "watch", "ipad", "mac" ou "airpods"
   nome      = nome do modelo, como aparece no site
   destaque  = true coloca o produto primeiro na ordem "Destaque"
   badge     = selo curto no card (ex.: "Lançamento"). "" = sem selo. Só o que for verdade.
   cond      = condição do aparelho: "Novo lacrado" ou "CPO / seminovo selecionado".
               Só escreva "certificado" ou "recondicionado pela Apple" se a loja tiver o comprovante.

   PREÇO
   preco     = preço normal. null = "Preço sob consulta" e o botão "Consultar no WhatsApp"
   precoPix  = preço no Pix. null = usa o descontoPix de data/config.js, se houver.
               Maior que o preço? É ignorado.
   precoDe   = preço anterior, só se for real. Aparece riscado ("De R$ ... Por R$ ...").
               Menor ou igual ao preço? É ignorado. Nunca crie um preço anterior só para parecer promoção.
   parcelas  = número máximo de parcelas SÓ deste produto. null = vale o de data/config.js
   parcelasSemJuros = até quantas vezes é sem juros SÓ deste produto. null = vale o de data/config.js.
               Só com parcelas sem juros o site mostra o valor da parcela ("12x de R$ ... sem juros").

   PREÇO POR OPÇÃO E POR COR (produto + armazenamento + cor)
   variantes = [{ opcao:"256 GB", preco:7250 },                       <- 256 GB, qualquer cor
                { opcao:"512 GB", cor:"Prateado", preco:9500 },       <- SÓ o 512 GB Prateado
                { opcao:"1 TB", preco:10900, precoPix:10500, estoque:2 }]
               opcao tem que ser escrita igual a uma das "opcoes"; cor igual a uma das "cores".
               Sem "cor", o preço vale para todas as cores daquela opção. Com "cor", só para ela:
               nas outras cores aparece "Preço sob consulta".
               Produto com DUAS OU MAIS opções: cada opção precisa da própria variante com preço.
               O "preco" do produto só vale quando ele tem uma opção só (ou nenhuma), para que o
               preço de um armazenamento nunca apareça sozinho nos outros.
               Status e estoque também podem ir na variante (valem só para aquela opção/cor).
   CONDIÇÃO    novo e seminovo (CPO) ficam em produtos separados, cada um com o próprio preço,
               fotos e texto (ex.: "iPhone 16 Pro Max" e "iPhone 16 Pro Max CPO").
   obsPreco  = frase curta embaixo do preço, quando a tabela da loja não diz o armazenamento
               ou o tamanho. Ex.: "Armazenamento confirmado no atendimento". "" esconde.

   OPÇÕES
   opcoes    = armazenamentos (ou tamanhos/versões), ex.: ["128 GB","256 GB"]
   rotulo    = nome do grupo de opções quando não é armazenamento (ex.: "Versão", "Tamanho")
   cores     = cores reais: [["Nome", "#corClara", "#corEscura"], ...]  ([] esconde)

   IMAGENS (sem imagem, o site mostra "Imagem em atualização"; nunca uma foto aleatória)
   ilustracao = desenho do modelo enquanto não há foto: "iphone-pro" (três câmeras),
               "iphone-duplo" (duas câmeras na diagonal) ou "watch". Aparece com o selo
               "Ilustração", na cor escolhida. Quando a foto chegar, pode apagar esta linha.
   imgs      = fotos REAIS do aparelho na loja, ex.: ["assets/produtos/iphone-16-loja.jpg"]
   fotoCor   = posição da cor que a foto real mostra (0 = primeira cor da lista)
   fundoClaro = true quando a foto tem fundo branco
   oficial   = imagens de divulgação (o site marca "Imagem de divulgação"):
               oficial:{ fotos:[{src:"assets/produtos/iphone-17-preto.webp", cor:0}], fundoClaro:false,
                         video:"youtube:CODIGO" ou "assets/produtos/video.mp4" }
               cor = posição da cor que a imagem mostra; sem cor, vale para todas
               claro:true numa foto = mostra essa foto com o fundo branco original
               A galeria é separada por cor: cada cor mostra só as fotos dela.
               Cor sem foto mostra "Foto desta cor em atualização"; as imagens sem cor
               (chip, recursos) aparecem em todas as cores, depois das fotos da cor.
   giro360   = 12 a 36 fotos do MESMO aparelho girando, na ordem. Vira um giro 360 real
   modelo3d  = arquivo .glb ou .gltf do aparelho, ex.: "assets/produtos/airpods-pro-3.glb"
               Só com o arquivo aparece o botão "Explorar em 3D". Ele só carrega quando a pessoa abre.
   unboxing3d = (futuro) .glb com a animação de abrir a caixa. Veja js/unboxing.js

   TEXTOS
   txt       = frase curta do card
   descricao = texto da página do produto ("" usa um texto padrão da loja)
   specs     = ficha técnica: [["Tela","6,1 polegadas"], ...]  ([] esconde). Só dado oficial.
   ================================================================== */
var CATALOGO = [
  { id:"iphone-18-pro-max", cat:"iphone", nome:"iPhone 18 Pro Max", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-18-pro-preto.webp", cor:0 },
      { src:"assets/produtos/iphone-18-pro-prateado.webp", cor:1 },
      { src:"assets/produtos/iphone-18-pro-glacial.webp", cor:2 },
      { src:"assets/produtos/iphone-18-pro-bordo.webp", cor:3 },
      "assets/produtos/iphone-18-pro-cores.webp"
    ], fundoClaro:false },
    txt:"Topo de linha, com a maior tela da família Pro.",
    opcoes:["256 GB","512 GB","1 TB","2 TB"],
    variantes:[{ opcao:"256 GB", preco:13000 }],
    cores:[["Preto","#2B2C2E","#141516"],["Prateado","#DDDFE2","#A8ACB2"],["Glacial","#C9D6DD","#8FA2AC"],["Bordô","#6E2230","#3E1019"]],
    descricao:"<p>A maior tela da linha Pro, com 6,9 polegadas. Chip A20 Pro, corpo unibody de alumínio e sistema de três câmeras traseiras: principal, ultra-angular e teleobjetiva.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,9 polegadas, com ProMotion"],["Chip","A20 Pro"],["Câmeras traseiras","Três câmeras: principal, ultra-angular e teleobjetiva"],["Material","Unibody de alumínio"],["Resistência","IP68"],["Conector","USB-C"]] },

  { id:"iphone-18-pro", cat:"iphone", nome:"iPhone 18 Pro", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-18-pro-preto.webp", cor:0 },
      { src:"assets/produtos/iphone-18-pro-prateado.webp", cor:1 },
      { src:"assets/produtos/iphone-18-pro-glacial.webp", cor:2 },
      { src:"assets/produtos/iphone-18-pro-bordo.webp", cor:3 },
      "assets/produtos/iphone-18-pro-cores.webp"
    ], fundoClaro:false },
    txt:"Toda a linha Pro no tamanho de sempre.",
    opcoes:["256 GB","512 GB","1 TB","2 TB"],
    variantes:[{ opcao:"256 GB", preco:10500 }],
    cores:[["Preto","#2B2C2E","#141516"],["Prateado","#DDDFE2","#A8ACB2"],["Glacial","#C9D6DD","#8FA2AC"],["Bordô","#6E2230","#3E1019"]],
    descricao:"<p>A linha Pro numa tela de 6,3 polegadas, que cabe melhor na mão e no bolso. O mesmo chip A20 Pro e o mesmo sistema de três câmeras traseiras do Pro Max, em corpo unibody de alumínio.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,3 polegadas, com ProMotion"],["Chip","A20 Pro"],["Câmeras traseiras","Três câmeras: principal, ultra-angular e teleobjetiva"],["Material","Unibody de alumínio"],["Resistência","IP68"],["Conector","USB-C"]] },

  { id:"iphone-17-pro-max", cat:"iphone", nome:"iPhone 17 Pro Max", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-17-pro-max-laranja.webp", cor:0 },
      { src:"assets/produtos/iphone-17-pro-max-laranja-tela.webp", cor:0 },
      { src:"assets/produtos/iphone-17-pro-max-azul-profundo.webp", cor:1 },
      { src:"assets/produtos/iphone-17-pro-max-prateado.webp", cor:2 },
      { src:"assets/produtos/iphone-17-pro-max-prateado-tela.webp", cor:2 },
      { src:"assets/produtos/iphone-17-pro-max-prateado-lateral.webp", cor:2 },
      "assets/produtos/iphone-17-pro-max-recursos.webp",
      "assets/produtos/iphone-17-pro-max-cores.webp"
    ], fundoClaro:false },
    txt:"A geração 17 Pro na tela maior, com câmera tripla de 48 MP.",
    opcoes:["256 GB","512 GB","1 TB","2 TB"],
    variantes:[{ opcao:"256 GB", preco:7750 },
                { opcao:"512 GB", preco:9000 }],
    cores:[["Laranja-cósmico","#E0773A","#A94E1E"],["Azul-profundo","#34405A","#1B2233"],["Prateado","#DDDFE2","#A8ACB2"]],
    descricao:"<p>O maior iPhone da geração 17 Pro: tela de 6,9 polegadas, chip A19 Pro e corpo unibody de alumínio. São três câmeras Fusion de 48 MP (principal, ultra-angular e teleobjetiva), com zoom de qualidade óptica de até 8x.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,9 polegadas, ProMotion até 120 Hz"],["Chip","A19 Pro"],["Câmeras traseiras","Três câmeras Fusion de 48 MP: principal, ultra-angular e teleobjetiva, com zoom de qualidade óptica de até 8x"],["Câmera frontal","Center Stage de 18 MP"],["Material","Unibody de alumínio forjado a quente, Ceramic Shield na frente e atrás"],["Resistência","IP68"],["Conector","USB-C"]] },

  { id:"iphone-17-pro", cat:"iphone", nome:"iPhone 17 Pro", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-17-pro-max-laranja.webp", cor:0 },
      { src:"assets/produtos/iphone-17-pro-max-laranja-tela.webp", cor:0 },
      { src:"assets/produtos/iphone-17-pro-max-azul-profundo.webp", cor:1 },
      { src:"assets/produtos/iphone-17-pro-max-prateado.webp", cor:2 },
      { src:"assets/produtos/iphone-17-pro-max-prateado-tela.webp", cor:2 },
      { src:"assets/produtos/iphone-17-pro-max-prateado-lateral.webp", cor:2 },
      "assets/produtos/iphone-17-pro-max-recursos.webp",
      "assets/produtos/iphone-17-pro-max-cores.webp"
    ], fundoClaro:false },
    txt:"A geração 17 Pro em 6,3 polegadas, com três câmeras de 48 MP.",
    opcoes:["256 GB","512 GB","1 TB"],
    variantes:[{ opcao:"256 GB", preco:7250 },
                { opcao:"512 GB", cor:"Prateado", preco:9500 }],   /* 9.500 é o preço do 512 GB Prateado; outras cores: sob consulta */
    cores:[["Laranja-cósmico","#E0773A","#A94E1E"],["Azul-profundo","#34405A","#1B2233"],["Prateado","#DDDFE2","#A8ACB2"]],
    descricao:"<p>O mesmo chip A19 Pro e as mesmas três câmeras Fusion de 48 MP do 17 Pro Max, numa tela de 6,3 polegadas que cabe melhor na mão. Corpo unibody de alumínio e zoom de qualidade óptica de até 8x.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,3 polegadas, ProMotion até 120 Hz"],["Chip","A19 Pro"],["Câmeras traseiras","Três câmeras Fusion de 48 MP: principal, ultra-angular e teleobjetiva, com zoom de qualidade óptica de até 8x"],["Câmera frontal","Center Stage de 18 MP"],["Material","Unibody de alumínio forjado a quente, Ceramic Shield na frente e atrás"],["Resistência","IP68"],["Conector","USB-C"]] },

  { id:"iphone-air", cat:"iphone", nome:"iPhone Air", destaque:false, badge:"Mais fino", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-air-preto-espacial.webp", cor:0 },
      { src:"assets/produtos/iphone-air-branco-nuvem.webp", cor:1 },
      { src:"assets/produtos/iphone-air-dourado-claro.webp", cor:2 },
      { src:"assets/produtos/iphone-air-azul-ceu.webp", cor:3 },
      "assets/produtos/iphone-air-cores.webp"
    ], fundoClaro:false },
    txt:"O iPhone mais fino que a Apple já fez.",
    opcoes:["256 GB","512 GB","1 TB"],
    cores:[["Preto-espacial","#35383D","#1B1D20"],["Branco-nuvem","#EFEFEC","#C2C2BD"],["Dourado-claro","#E5D3B0","#BBA47C"],["Azul-céu","#A9C6DF","#6F94B2"]],
    descricao:"<p>5,64 mm de espessura e 165 gramas, em estrutura de titânio. Tela de 6,5 polegadas com ProMotion de até 120 Hz e chip A19 Pro. É o iPhone para quem quer o aparelho mais leve possível sem abrir mão de desempenho.</p>",
    specs:[["Espessura","5,64 mm"],["Peso","165 gramas"],["Tela","Super Retina XDR OLED de 6,5 polegadas, ProMotion até 120 Hz"],["Chip","A19 Pro: CPU de 6 núcleos e GPU de 5 núcleos"],["Câmera traseira","Fusion de 48 MP, com zoom digital até 10x"],["Câmera frontal","Center Stage de 18 MP, ƒ/1.9"],["Material","Estrutura em titânio, frente em Ceramic Shield 2"],["Resistência","IP68: até 6 metros por 30 minutos"],["Bateria","Até 27 horas de vídeo; 50% em 30 minutos com carregador de 20 W"],["Conector","USB-C"]] },

  { id:"iphone-17", cat:"iphone", nome:"iPhone 17", destaque:false, badge:"Mais vendido", cond:"Novo lacrado",
    preco:5450, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-17-preto.webp", cor:0 },
      { src:"assets/produtos/iphone-17-branco.webp", cor:1 },
      { src:"assets/produtos/iphone-17-azul-nevoa.webp", cor:2 },
      { src:"assets/produtos/iphone-17-salvia.webp", cor:3 },
      { src:"assets/produtos/iphone-17-lavanda.webp", cor:4 }
    ], fundoClaro:false },
    txt:"Tela de 6,3 polegadas com ProMotion, chip A19 e câmeras de 48 MP.",
    opcoes:[],
    obsPreco:"Armazenamento (256 GB ou 512 GB) confirmado no atendimento",
    cores:[["Preto","#2B2C2E","#151617"],["Branco","#EFEFEC","#C3C3BE"],["Azul-névoa","#9FBBD4","#6B8CA8"],["Sálvia","#AEBFA8","#7B8F76"],["Lavanda","#C6BCE0","#8E82B5"]],
    descricao:"<p>A geração atual com tela ProMotion de até 120 Hz (antes exclusiva da linha Pro) e pico de 3.000 nits no sol. Chip A19, câmera principal de 48 MP com ultra-angular também de 48 MP e frontal Center Stage de 18 MP.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,3 polegadas, ProMotion até 120 Hz"],["Brilho","Até 3.000 nits de pico em ambiente externo"],["Chip","A19: CPU de 6 núcleos, GPU de 5 núcleos e Neural Engine de 16 núcleos"],["Câmeras traseiras","48 MP principal (ƒ/1.6, estabilização por sensor) e 48 MP ultra-angular"],["Armazenamento","256 GB ou 512 GB"],["Câmera frontal","Center Stage de 18 MP, ƒ/1.9, com foco automático"],["Material","Estrutura de alumínio, frente em Ceramic Shield 2"],["Resistência","IP68: até 6 metros por 30 minutos"],["Bateria","Até 30 horas de reprodução de vídeo"],["Conector","USB-C"]] },

  { id:"iphone-17e", cat:"iphone", nome:"iPhone 17e", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-17e-preto.webp", cor:0 },
      { src:"assets/produtos/iphone-17e-branco.webp", cor:1 },
      { src:"assets/produtos/iphone-17e-rosa-palido.webp", cor:2 }
    ], fundoClaro:false },
    txt:"A porta de entrada da geração 17, com o mesmo chip da linha.",
    opcoes:["256 GB","512 GB"],
    cores:[["Preto","#2B2C2E","#151617"],["Branco","#EFEFEC","#C3C3BE"],["Rosa-pálido","#F2D3D6","#C99EA3"]],
    descricao:"<p>Leva o chip A19 da geração 17 num modelo de entrada. Tela de 6,1 polegadas e câmera Fusion de 48 MP, com zoom 2x de qualidade óptica. Uma boa opção para quem está saindo de um iPhone antigo.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,1 polegadas"],["Chip","A19"],["Câmera traseira","Fusion de 48 MP (ƒ/1.6), com zoom 2x de qualidade óptica"],["Material","Estrutura de alumínio, frente em Ceramic Shield 2"],["Resistência","IP68: até 6 metros por 30 minutos"],["Conector","USB-C"]] },

  { id:"iphone-15", cat:"iphone", nome:"iPhone 15", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"disponivel", estoque:null,
    imgs:[], giro360:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-15-azul-frente-verso.webp", cor:0 },
      { src:"assets/produtos/iphone-15-azul-verso.webp", cor:0 },
      { src:"assets/produtos/iphone-15-azul-camera.webp", cor:0 },
      { src:"assets/produtos/iphone-15-preto-frente-verso.webp", cor:1 },
      { src:"assets/produtos/iphone-15-preto-verso.webp", cor:1 }
    ], fundoClaro:false },
    txt:"Geração 15, com USB-C, Ilha Dinâmica e câmera de 48 MP.",
    opcoes:["128 GB","256 GB","512 GB"],
    variantes:[{ opcao:"128 GB", preco:3900 }],
    cores:[["Azul","#C3D4DE","#8FA6B4"],["Preto","#2B2C2E","#151617"],["Verde","#C6D2C6","#93A393"],["Amarelo","#EFE2B4","#C6B478"],["Rosa","#F2D6DA","#C9A0A7"]],
    descricao:"<p>Foi o primeiro iPhone da linha padrão com USB-C e Ilha Dinâmica, e trouxe a câmera principal de 48 MP para fora da linha Pro. Chip A16 Bionic, tela de 6,1 polegadas e até 20 horas de vídeo. Para quem está saindo de um iPhone 11 ou 12, o salto é grande.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,1 polegadas (2556 x 1179) com Ilha Dinâmica"],["Chip","A16 Bionic: CPU de 6 núcleos e Neural Engine de 16 núcleos"],["Câmeras traseiras","Principal de 48 MP (ƒ/1.6, estabilização óptica) e ultra-angular de 12 MP"],["Câmera frontal","TrueDepth de 12 MP"],["Material","Estrutura de alumínio, frente em Ceramic Shield e traseira em vidro colorido por infusão"],["Resistência","IP68: até 6 metros por 30 minutos"],["Bateria","Até 20 horas de vídeo; 50% em cerca de 30 minutos com carregador de 20 W"],["Recarga sem fio","MagSafe até 15 W"],["Conector","USB-C"]] },

  { id:"iphone-16", cat:"iphone", nome:"iPhone 16", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-16-preto.webp", cor:0 },
      { src:"assets/produtos/iphone-16-branco.webp", cor:1 },
      { src:"assets/produtos/iphone-16-rosa.webp", cor:2 },
      { src:"assets/produtos/iphone-16-verde-acinzentado.webp", cor:3 },
      { src:"assets/produtos/iphone-16-ultramarino.webp", cor:4 }
    ], fundoClaro:false },
    txt:"Geração anterior, novo e lacrado, com chip A18 e Controle da Câmera.",
    opcoes:["128 GB","256 GB","512 GB"],
    variantes:[{ opcao:"128 GB", preco:4650 }],
    cores:[["Preto","#2B2C2E","#151617"],["Branco","#EFEFEC","#C3C3BE"],["Rosa","#F4C4CB","#C88F99"],["Verde-acinzentado","#BFCBC0","#8A9A8C"],["Ultramarino","#7E8FD4","#4E5CA0"]],
    descricao:"<p>Geração anterior, novo e lacrado. Tela de 6,1 polegadas, chip A18, câmera Fusion de 48 MP e o botão de Controle da Câmera. Para a maioria das pessoas, dá conta de tudo.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,1 polegadas (2556 x 1179)"],["Chip","A18: CPU de 6 núcleos, GPU de 5 núcleos e Neural Engine de 16 núcleos"],["Câmeras traseiras","Fusion de 48 MP (ƒ/1.6) e ultra-angular de 12 MP (ƒ/2.2)"],["Câmera frontal","TrueDepth de 12 MP, ƒ/1.9"],["Material","Estrutura de alumínio, frente em Ceramic Shield, traseira em vidro colorido por infusão"],["Resistência","IP68: até 6 metros por 30 minutos"],["Bateria","Até 22 horas de reprodução de vídeo"],["Conector","USB-C"]] },

  { id:"iphone-16-plus", cat:"iphone", nome:"iPhone 16 Plus", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-16-preto.webp", cor:0 },
      { src:"assets/produtos/iphone-16-branco.webp", cor:1 },
      { src:"assets/produtos/iphone-16-rosa.webp", cor:2 },
      { src:"assets/produtos/iphone-16-verde-acinzentado.webp", cor:3 },
      { src:"assets/produtos/iphone-16-ultramarino.webp", cor:4 }
    ], fundoClaro:false },
    txt:"O iPhone 16 com tela de 6,7 polegadas e até 27 horas de vídeo.",
    opcoes:["128 GB","256 GB","512 GB"],
    variantes:[{ opcao:"128 GB", preco:5250 },
                { opcao:"256 GB", preco:5550 }],
    cores:[["Preto","#2B2C2E","#151617"],["Branco","#EFEFEC","#C3C3BE"],["Rosa","#F4C4CB","#C88F99"],["Verde-acinzentado","#BFCBC0","#8A9A8C"],["Ultramarino","#7E8FD4","#4E5CA0"]],
    descricao:"<p>Tudo do iPhone 16 numa tela maior, de 6,7 polegadas: chip A18, câmera Fusion de 48 MP, Controle da Câmera e Botão de Ação. A bateria rende até 27 horas de vídeo.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,7 polegadas (2796 x 1290)"],["Chip","A18: CPU de 6 núcleos, GPU de 5 núcleos e Neural Engine de 16 núcleos"],["Câmeras traseiras","Fusion de 48 MP (ƒ/1.6) e ultra-angular de 12 MP (ƒ/2.2)"],["Câmera frontal","TrueDepth de 12 MP, ƒ/1.9"],["Botões","Controle da Câmera e Botão de Ação"],["Material","Estrutura de alumínio, frente em Ceramic Shield, traseira em vidro colorido por infusão"],["Resistência","IP68: até 6 metros por 30 minutos"],["Bateria","Até 27 horas de reprodução de vídeo"],["Conector","USB-C"]] },

  { id:"iphone-16-pro-max", cat:"iphone", nome:"iPhone 16 Pro Max", destaque:false, badge:"", cond:"Novo lacrado",
    preco:6850, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-16-pro-max-deserto.webp", cor:0 },
      { src:"assets/produtos/iphone-16-pro-max-natural.webp", cor:1 },
      { src:"assets/produtos/iphone-16-pro-max-branco.webp", cor:2 },
      { src:"assets/produtos/iphone-16-pro-max-preto.webp", cor:3 }
    ], fundoClaro:false },
    obsPreco:"Armazenamento confirmado no atendimento",
    txt:"Geração anterior do Pro Max, em titânio, com zoom óptico de 5x.",
    opcoes:[],
    cores:[["Titânio-deserto","#BFA48F","#8E7462"],["Titânio natural","#C2BCB2","#8F897F"],["Titânio branco","#E8E6E1","#B9B6AF"],["Titânio preto","#3C3C3D","#1D1D1E"]],
    descricao:"<p>O maior iPhone da geração 16: tela de 6,9 polegadas, chip A18 Pro e estrutura de titânio. Câmera Fusion de 48 MP, ultra-angular também de 48 MP e teleobjetiva com zoom óptico de 5x, mais o Controle da Câmera.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,9 polegadas, ProMotion até 120 Hz e sempre ativa"],["Chip","A18 Pro"],["Câmeras traseiras","Fusion de 48 MP, ultra-angular de 48 MP e teleobjetiva de 12 MP com zoom óptico de 5x"],["Armazenamento","256 GB, 512 GB ou 1 TB (a loja confirma qual tem)"],["Câmera frontal","TrueDepth de 12 MP"],["Botões","Controle da Câmera e Botão de Ação"],["Material","Estrutura de titânio, frente em Ceramic Shield"],["Resistência","IP68: até 6 metros por 30 minutos"],["Bateria","Até 33 horas de reprodução de vídeo"],["Conector","USB-C (USB 3)"]] },

  { id:"iphone-13", cat:"iphone", nome:"iPhone 13", destaque:false, badge:"", cond:"Novo lacrado",
    preco:3150, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/iphone-13-estelar.webp", cor:0 },
      { src:"assets/produtos/iphone-13-estelar-lado.webp", cor:0, claro:true },
      { src:"assets/produtos/iphone-13-estelar-camera.webp", cor:0, claro:true },
      { src:"assets/produtos/iphone-13-estelar-detalhe.webp", cor:0, claro:true }
    ], fundoClaro:false },
    txt:"Tela de 6,1 polegadas, chip A15 Bionic e câmera dupla de 12 MP.",
    opcoes:["128 GB"],
    cores:[["Estelar (branco)","#EDE6DA","#C2B9A9"]],   /* a loja só tem o iPhone 13 na cor branca (Estelar) */
    descricao:"<p>Tela Super Retina XDR de 6,1 polegadas, chip A15 Bionic e câmera dupla de 12 MP com modo Cinema. A bateria rende até 19 horas de vídeo. Uma forma de ter iPhone gastando menos.</p>",
    specs:[["Tela","Super Retina XDR OLED de 6,1 polegadas (2532 x 1170)"],["Chip","A15 Bionic: CPU de 6 núcleos, GPU de 4 núcleos e Neural Engine de 16 núcleos"],["Câmeras traseiras","Grande-angular e ultra-angular de 12 MP"],["Câmera frontal","TrueDepth de 12 MP"],["Material","Estrutura de alumínio, frente em Ceramic Shield"],["Resistência","IP68: até 6 metros por 30 minutos"],["Bateria","Até 19 horas de reprodução de vídeo"],["Conector","Lightning"]] },

  { id:"apple-watch-ultra-3", cat:"watch", nome:"Apple Watch Ultra 3", destaque:false, badge:"Offshore", cond:"Novo lacrado",
    preco:4850, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/apple-watch-ultra-3-titanio-natural.webp", cor:0 },
      { src:"assets/produtos/apple-watch-ultra-3-titanio-preto.webp", cor:1 }
    ], fundoClaro:false },
    txt:"Para quem treina pesado, mergulha ou trabalha embarcado.",
    opcoes:["49 mm, GPS + Cellular"],
    cores:[["Titânio natural","#D6D1C8","#9E978B"],["Titânio preto","#3A3A3C","#1B1B1D"]],
    descricao:"<p>Caixa de 49 mm em titânio, tela grande-angular com pico de 3.000 nits e bateria que atravessa vários dias: até 42 horas de uso normal. Tem 5G, SOS de Emergência via satélite, resistência à água de 100 metros e mergulho recreativo até 40 metros. Em Macaé, é o modelo para quem embarca.</p>",
    specs:[["Caixa","49 mm em titânio, natural ou preto"],["Tela","Retina sempre ativa OLED LTPO3 grande-angular, pico de 3.000 nits"],["Chip","S10 de 2 núcleos, 64 GB"],["Bateria","Até 42 horas de uso normal; até 72 horas no Modo Pouca Energia"],["Resistência à água","100 metros; mergulho recreativo até 40 metros"],["Conectividade","GPS de dupla frequência, 5G e SOS de Emergência via satélite"]] },

  { id:"apple-watch-series-12", cat:"watch", nome:"Apple Watch Series 12", destaque:false, badge:"", cond:"Novo lacrado",
    preco:3500, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/apple-watch-series-12-bronze-escuro.webp", cor:0 },
      { src:"assets/produtos/apple-watch-series-12-bronze-escuro-frente.webp", cor:0 },
      { src:"assets/produtos/apple-watch-series-12-bronze-escuro-pulseira.webp", cor:0 },
      { src:"assets/produtos/apple-watch-series-12-cinza-espacial.webp", cor:3 }
    ], fundoClaro:false },
    obsPreco:"Tamanho da caixa (42 ou 46 mm) confirmado no atendimento",
    txt:"O Watch completo para o dia a dia e para treinar.",
    opcoes:[],
    cores:[["Bronze-escuro","#6E4A3A","#43291E"],["Dourado-claro","#E3C9A8","#B69C7C"],["Preto","#2E2F31","#141516"],["Cinza-espacial","#5A5C60","#303236"]],
    descricao:"<p>O Watch completo: tela sempre ativa com pico de 2.000 nits, chip S11 e o conjunto completo de sensores de saúde: cardíaco elétrico e óptico, oxigênio no sangue e temperatura. Disponível em alumínio, titânio ou cerâmica, com versões GPS ou GPS + Cellular.</p>",
    specs:[["Caixas","42 mm e 46 mm"],["Materiais","Alumínio, titânio ou cerâmica"],["Tela","Retina sempre ativa OLED LTPO3, pico de 2.000 nits"],["Chip","S11 de 2 núcleos, 64 GB"],["Sensores","Cardíaco elétrico (3ª geração) e óptico, oxigênio no sangue, temperatura, bússola e altímetro"],["Resistência","50 metros (ISO 22810) e IP6X contra poeira"],["Bateria","Até 24 horas de uso normal; 38 horas no Modo Pouca Energia"],["Versões","GPS ou GPS + Cellular"]] },

  { id:"apple-watch-series-11", cat:"watch", nome:"Apple Watch Series 11", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/apple-watch-series-11-preto-brilhante.webp", cor:0 },
      { src:"assets/produtos/apple-watch-series-11-preto-brilhante-frente.webp", cor:0 },
      { src:"assets/produtos/apple-watch-series-11-seguranca.webp", claro:true },
      { src:"assets/produtos/apple-watch-series-11-conteudo-caixa.webp", claro:true }
    ], fundoClaro:false },
    txt:"Tela sempre ativa, sensores de saúde e até 24 horas de bateria.",
    opcoes:["42 mm","46 mm"],
    variantes:[{ opcao:"42 mm", preco:2550 },
                { opcao:"46 mm", preco:2750 }],
    cores:[["Preto brilhante","#1E1F21","#0A0A0B"]],   /* a loja só tem o Series 11 em Preto brilhante */
    descricao:"<p>Tela sempre ativa com pico de 2.000 nits, chip S10 e sensores cardíaco elétrico e óptico, de oxigênio no sangue e de temperatura. A bateria vai até 24 horas no uso normal, e a versão com celular tem 5G. Caixa de 42 ou 46 mm.</p>",
    specs:[["Caixas","42 mm e 46 mm"],["Material","Caixa de alumínio Preto brilhante, com pulseira esportiva preta"],["Tela","Retina sempre ativa OLED LTPO3, pico de 2.000 nits"],["Chip","S10 de 2 núcleos, 64 GB"],["Sensores","Cardíaco elétrico e óptico, oxigênio no sangue, temperatura, bússola e altímetro"],["Resistência","50 metros (ISO 22810) e IP6X contra poeira"],["Bateria","Até 24 horas de uso normal; 38 horas no Modo Pouca Energia"],["Versões","GPS ou GPS + Cellular (5G)"]] },

  { id:"apple-watch-se-3", cat:"watch", nome:"Apple Watch SE 3", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/apple-watch-se-3-meia-noite.webp", cor:0 },
      { src:"assets/produtos/apple-watch-se-3-meia-noite-frente.webp", cor:0 },
      { src:"assets/produtos/apple-watch-se-3-estelar.webp", cor:1 },
      { src:"assets/produtos/apple-watch-se-3-estelar-frente.webp", cor:1 }
    ], fundoClaro:false },
    txt:"O essencial do Apple Watch: saúde, segurança e treinos.",
    opcoes:["40 mm","44 mm"],
    variantes:[{ opcao:"40 mm", preco:1950 },
                { opcao:"44 mm", preco:2150 }],
    cores:[["Meia-noite","#2A2E38","#14171D"],["Estelar","#E6DED2","#BBB0A0"]],
    descricao:"<p>O essencial do Apple Watch: tela sempre ativa, chip S10, sensor cardíaco, detecção de queda e resistência à água de 50 metros para nadar. Caixa de alumínio em 40 ou 44 mm.</p>",
    specs:[["Caixas","40 mm e 44 mm"],["Material","Caixa de alumínio, em Meia-noite ou Estelar"],["Tela","Retina sempre ativa OLED LTPO com vidro Ion-X, pico de 1.000 nits"],["Chip","S10 de 2 núcleos, 64 GB"],["Sensores","Cardíaco óptico (2ª geração), temperatura, bússola, altímetro e acelerômetro"],["Resistência à água","50 metros (ISO 22810), indicada para natação"],["Bateria","Até 18 horas de uso normal; 32 horas no Modo Pouca Energia"],["Versões","GPS ou GPS + Cellular"]] },

  { id:"ipad-pro", cat:"ipad", nome:"iPad Pro", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/ipad-pro-prateado.webp", cor:0 },
      { src:"assets/produtos/ipad-pro-detalhes.webp", cor:0 },
      { src:"assets/produtos/ipad-pro-conteudo-caixa-v2.webp", cor:0 }
    ], fundoClaro:false },
    txt:"Para quem edita, projeta e leva trabalho pesado no tablet.",
    opcoes:["256 GB","512 GB","1 TB","2 TB"],
    cores:[["Prateado","#DCDEE1","#A9ADB2"],["Preto-espacial","#3A3C40","#1C1E21"]],
    descricao:"<p>O iPad mais potente: chip M5 e tela Ultra Retina XDR com OLED em camada dupla, em 11 ou 13 polegadas. Porta Thunderbolt para monitores e SSDs externos, e compatibilidade com o Apple Pencil Pro. É o modelo para edição de vídeo, projeto e desenho profissional.</p>",
    specs:[["Telas","11 e 13 polegadas, Ultra Retina XDR com OLED em camada dupla"],["Chip","M5: 9 núcleos com 12 GB (256/512 GB) ou 10 núcleos com 16 GB (1/2 TB)"],["Câmeras","Traseira de 12 MP (ƒ/1.8); frontal TrueDepth de 12 MP"],["Conector","Thunderbolt / USB 4, mais Smart Connector"],["Apple Pencil","Apple Pencil Pro e Apple Pencil (USB-C)"],["Bateria","Até 10 horas de navegação no Wi-Fi ou vídeo"],["Versões","Wi-Fi ou Wi-Fi + Cellular"]] },

  { id:"ipad-air", cat:"ipad", nome:"iPad Air", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/ipad-air-azul.webp", cor:0 },
      { src:"assets/produtos/ipad-air-roxo-v2.webp", cor:1 },
      { src:"assets/produtos/ipad-air-estelar.webp", cor:2 },
      { src:"assets/produtos/ipad-air-cinza-espacial.webp", cor:3 }
    ], fundoClaro:false },
    txt:"Potência de sobra para estudo, trabalho e desenho.",
    opcoes:["128 GB","256 GB","512 GB","1 TB"],
    cores:[["Azul","#9FBDD8","#6389A8"],["Roxo","#BDAFD8","#8878AE"],["Estelar","#E7DECF","#BCB09C"],["Cinza-espacial","#5C5F64","#303338"]],
    descricao:"<p>Chip M4 num corpo leve, em 11 ou 13 polegadas. Dá conta de edição, desenho e multitarefa pesada, e funciona com o Apple Pencil Pro. Para a maioria das pessoas, é potência de sobra.</p>",
    specs:[["Telas","11 e 13 polegadas, Liquid Retina"],["Chip","M4: CPU de 8 núcleos, GPU de 9 núcleos e Neural Engine de 16 núcleos"],["Câmeras","Traseira de 12 MP (ƒ/1.8); frontal Center Stage de 12 MP"],["Conector","USB-C, mais Smart Connector"],["Apple Pencil","Apple Pencil Pro e Apple Pencil (USB-C)"],["Bateria","Até 10 horas de navegação no Wi-Fi ou vídeo"],["Versões","Wi-Fi ou Wi-Fi + Cellular"]] },

  { id:"ipad-11", cat:"ipad", nome:"iPad 11", destaque:false, badge:"Custo-benefício", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/ipad-11-azul.webp", cor:0 },
      { src:"assets/produtos/ipad-11-prateado.webp", cor:1 },
      { src:"assets/produtos/ipad-11-rosa.webp", cor:2 },
      { src:"assets/produtos/ipad-11-amarelo.webp", cor:3 }
    ], fundoClaro:false },
    txt:"O iPad para estudar, assistir e navegar, com tela de 11 polegadas.",
    opcoes:["128 GB","256 GB","512 GB"],
    variantes:[{ opcao:"128 GB", preco:3150 }],
    cores:[["Azul","#8FB6DC","#5586B0"],["Prateado","#DCDEE1","#A9ADB2"],["Rosa","#F0C6CE","#C4939C"],["Amarelo","#EFDB9A","#C4A957"]],
    descricao:"<p>A entrada da linha, com tela de 11 polegadas e chip A16. Dá conta de aula, leitura, streaming e navegação com folga.</p>",
    specs:[["Tela","11 polegadas, Liquid Retina"],["Chip","A16"],["Câmeras","Traseira de 12 MP; frontal de 12 MP"],["Conector","USB-C"],["Bateria","Até 10 horas de navegação no Wi-Fi ou vídeo"],["Versões","Wi-Fi ou Wi-Fi + Cellular"]] }
,

  { id:"macbook-neo", cat:"mac", nome:"MacBook Neo", destaque:false, badge:"Entrada no Mac", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false,
    oficial:{ fotos:[
      { src:"assets/produtos/macbook-neo-prateado-frente.webp", cor:0 },
      { src:"assets/produtos/macbook-neo-prateado-teclado.webp", cor:0 },
      { src:"assets/produtos/macbook-neo-blush-frente.webp", cor:1 },
      { src:"assets/produtos/macbook-neo-blush-teclado.webp", cor:1 },
      { src:"assets/produtos/macbook-neo-amarelo-frente.webp", cor:2 },
      { src:"assets/produtos/macbook-neo-amarelo-teclado.webp", cor:2 },
      { src:"assets/produtos/macbook-neo-indigo-frente.webp", cor:3 },
      { src:"assets/produtos/macbook-neo-indigo-teclado.webp", cor:3 }
    ], fundoClaro:false },
    txt:"A porta de entrada no Mac, com bateria que atravessa o dia.",
    opcoes:["256 GB","512 GB"],
    variantes:[{ opcao:"256 GB", preco:5000 }],
    cores:[["Prateado","#DCDEE1","#A9ADB2"],["Blush","#F0CFC9","#C59A93"],["Amarelo-cítrico","#EFDA92","#C4A94F"],["Índigo","#4A5480","#2A304F"]],
    descricao:"<p>A porta de entrada no Mac. Tela de 13 polegadas, chip A18 Pro (o mesmo da família iPhone) e até 16 horas de vídeo na bateria. Para quem usa o computador para estudo, trabalho de escritório, navegação e vídeo.</p>",
    specs:[["Tela","13 polegadas IPS com LED, 2408 x 1506, 500 nits"],["Chip","A18 Pro: CPU de 6 núcleos, GPU de 5 núcleos e Neural Engine de 16 núcleos"],["Memória","8 GB de memória unificada"],["Armazenamento","SSD de 256 GB ou 512 GB"],["Portas","USB-C (USB 3, com recarga e DisplayPort), USB-C (USB 2) e fone de 3,5 mm"],["Câmera","FaceTime HD de 1080p"],["Bateria","Até 16 horas de streaming de vídeo"],["Peso","1,23 kg, 1,27 cm de espessura"]] },

  { id:"macbook-air", cat:"mac", nome:"MacBook Air", destaque:false, badge:"Mais vendido", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], giro360:[], fundoClaro:false, rotulo:"Tamanho",
    oficial:{ fotos:[
      { src:"assets/produtos/macbook-air-meia-noite-frente.webp", cor:3 },
      { src:"assets/produtos/macbook-air-meia-noite-teclado.webp", cor:3 },
      { src:"assets/produtos/macbook-air-meia-noite-portas.webp", cor:3 },
      { src:"assets/produtos/macbook-air-meia-noite-conteudo-caixa.webp", cor:3 },
      { src:"assets/produtos/macbook-air-prateado-frente.webp", cor:1 },
      { src:"assets/produtos/macbook-air-prateado-teclado.webp", cor:1 },
      { src:"assets/produtos/macbook-air-prateado-portas.webp", cor:1 },
      { src:"assets/produtos/macbook-air-prateado-conteudo-caixa.webp", cor:1 },
      { src:"assets/produtos/macbook-air-estelar-frente.webp", cor:2 },
      { src:"assets/produtos/macbook-air-estelar-teclado.webp", cor:2 },
      { src:"assets/produtos/macbook-air-estelar-portas.webp", cor:2 },
      { src:"assets/produtos/macbook-air-estelar-conteudo-caixa.webp", cor:2 },
      { src:"assets/produtos/macbook-air-azul-ceu-frente.webp", cor:0 },
      { src:"assets/produtos/macbook-air-azul-ceu-teclado-v2.webp", cor:0 },
      { src:"assets/produtos/macbook-air-azul-ceu-portas.webp", cor:0 },
      { src:"assets/produtos/macbook-air-azul-ceu-conteudo-caixa.webp", cor:0 },
      "assets/produtos/macbook-air-m5.webp"
    ], fundoClaro:false },
    txt:"Leve, silencioso e com bateria para o dia inteiro.",
    opcoes:["13 polegadas","15 polegadas"],
    cores:[["Azul-céu","#A9C6DF","#6F94B2"],["Prateado","#DCDEE1","#A9ADB2"],["Estelar","#E7DECF","#BCB09C"],["Meia-noite","#2A2E38","#14171D"]],
    descricao:"<p>Chip M5, sem ventoinha (ou seja, completamente silencioso) e até 18 horas de bateria em vídeo. Pesa 1,23 kg na versão de 13 polegadas. É o notebook certo para a maioria das pessoas: aguenta trabalho, edição leve e muitas abas sem esquentar.</p>",
    specs:[["Telas","Liquid Retina de 13,6 e 15,3 polegadas"],["Chip","M5: CPU de 10 núcleos e GPU de 8 ou 10 núcleos"],["Memória","A partir de 16 GB, com opções de 24 GB e 32 GB"],["Armazenamento","SSD a partir de 512 GB, até 4 TB"],["Portas","MagSafe 3, dois Thunderbolt 4 (até 40 Gb/s) e fone de 3,5 mm"],["Câmera","Center Stage de 12 MP"],["Bateria","Até 18 horas de vídeo; 15 horas de navegação"],["Peso","1,23 kg (13\u0022) e 1,51 kg (15\u0022)"]] },

  { id:"macbook-pro", cat:"mac", nome:"MacBook Pro", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false, rotulo:"Tamanho",
    oficial:{ fotos:[
      { src:"assets/produtos/macbook-pro-prateado-frente.webp", cor:1 },
      { src:"assets/produtos/macbook-pro-prateado-teclado.webp", cor:1 },
      { src:"assets/produtos/macbook-pro-preto-frente.webp", cor:0 },
      { src:"assets/produtos/macbook-pro-preto-teclado.webp", cor:0 },
      "assets/produtos/macbook-pro-m5-max.webp",
      "assets/produtos/macbook-pro-ia.webp",
      "assets/produtos/macbook-pro-apple-intelligence.webp",
      "assets/produtos/macbook-pro-bateria.webp"
    ], fundoClaro:false },
    txt:"Para edição de vídeo, renderização e trabalho pesado o dia todo.",
    opcoes:["14 polegadas","16 polegadas"],
    cores:[["Preto-espacial","#3A3C40","#1C1E21"],["Prateado","#DCDEE1","#A9ADB2"]],
    descricao:"<p>Tela Liquid Retina XDR com ProMotion de até 120 Hz e contraste de 1.000.000:1, chip que vai do M5 ao M5 Max e até 24 horas de bateria. Tem HDMI, leitor de cartão SD e Thunderbolt 5. É a máquina de quem edita vídeo, renderiza ou compila código o dia inteiro.</p>",
    specs:[["Telas","Liquid Retina XDR de 14,2 e 16,2 polegadas, ProMotion até 120 Hz"],["Contraste","1.000.000:1"],["Chips","M5 (CPU 10 núcleos), M5 Pro (até 18 núcleos) e M5 Max (até 40 núcleos de GPU)"],["Memória","De 16 GB a 128 GB de memória unificada"],["Armazenamento","SSD de 1 TB a 8 TB"],["Portas","Três Thunderbolt (5 no Pro/Max), MagSafe 3, HDMI, leitor de cartão SD e fone de 3,5 mm"],["Bateria","Até 24 horas de streaming de vídeo"],["Peso","A partir de 1,55 kg (14\u0022) e 2,14 kg (16\u0022)"]] },

  { id:"airpods-pro-3", cat:"airpods", nome:"AirPods Pro 3", destaque:false, badge:"Mais vendido", cond:"Novo lacrado",
    preco:3750, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false, rotulo:"Versão",
    oficial:{ fotos:["assets/produtos/airpods-pro-3-fones.webp", "assets/produtos/airpods-pro-3-estojo.webp",
                     "assets/produtos/airpods-pro-3-cancelamento.webp", "assets/produtos/airpods-pro-3-frequencia.webp",
                     "assets/produtos/airpods-pro-3-audicao.webp"], fundoClaro:false },
    txt:"Cancelamento de ruído, à prova de suor e com teste de audição.",
    opcoes:["Estojo MagSafe USB-C"],
    cores:[["Branco","#F3F3F1","#CFCFCA"]],
    descricao:"<p>Cancelamento Ativo de Ruído com chip H2, até 8 horas de bateria por carga e 24 horas com o estojo. Resistência IP57 contra poeira, suor e água. Dá para treinar com eles. Traz também medição de frequência cardíaca no exercício e os recursos de saúde auditiva: Teste de Audição e Modo Aparelho Auditivo.</p>",
    specs:[["Chip","H2 da Apple, com banda ultralarga de 2ª geração no estojo"],["Áudio","Cancelamento Ativo de Ruído, Áudio Adaptativo, Modo Ambiente e Detecção de Conversa"],["Bateria","Até 8 horas com cancelamento ativo; até 24 horas com o estojo"],["Recarga rápida","5 minutos rendem cerca de 1 hora de uso"],["Resistência","IP57: poeira, suor e água"],["Estojo","MagSafe com USB-C, compatível com Qi e carregador do Apple Watch, com alto-falante"],["Saúde auditiva","Teste de Audição, Modo Aparelho Auditivo e frequência cardíaca no treino"]] },

  { id:"airpods-4", cat:"airpods", nome:"AirPods 4", destaque:false, badge:"Custo-benefício", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false, rotulo:"Versão",
    oficial:{ fotos:["assets/produtos/airpods-4-fones.webp", "assets/produtos/airpods-4-estojo.webp",
                     "assets/produtos/airpods-4-isolamento-voz.webp", "assets/produtos/airpods-4-conteudo-caixa.webp"], fundoClaro:false },
    txt:"O AirPods do dia a dia, com ou sem cancelamento de ruído.",
    opcoes:["Padrão","Com Cancelamento de Ruído"],
    variantes:[{ opcao:"Com Cancelamento de Ruído", preco:1550 }],
    cores:[["Branco","#F3F3F1","#CFCFCA"]],
    descricao:"<p>Vem em duas versões: a padrão e a versão com Cancelamento Ativo de Ruído. As duas usam o chip H2 e têm resistência IP54 para treinar. A padrão entrega até 5 horas por carga e 30 horas com o estojo; a versão com cancelamento, 4 horas e 20 horas no total.</p>",
    specs:[["Versões","Padrão ou com Cancelamento Ativo de Ruído"],["Chip","H2 da Apple"],["Bateria (padrão)","Até 5 horas por carga; 30 horas com o estojo"],["Bateria (com cancelamento)","Até 4 horas por carga; 20 horas com o estojo"],["Recarga rápida","5 minutos rendem cerca de 1 hora de uso"],["Resistência","IP54: poeira, suor e água"],["Conexão","Bluetooth 5.3"],["Peso","4,3 gramas por fone"]] },

  { id:"airpods-max-2", cat:"airpods", nome:"AirPods Max 2", destaque:false, badge:"", cond:"Novo lacrado",
    preco:null, precoPix:null, precoDe:null, parcelas:null, parcelasSemJuros:null, status:"consultar", estoque:null,
    imgs:[], fundoClaro:false, rotulo:"Versão",
    oficial:{ fotos:[
      { src:"assets/produtos/airpods-max-2-meia-noite.webp", cor:0 },
      { src:"assets/produtos/airpods-max-2-estelar.webp", cor:1 },
      { src:"assets/produtos/airpods-max-2-azul.webp", cor:2 },
      { src:"assets/produtos/airpods-max-2-roxo.webp", cor:3 },
      { src:"assets/produtos/airpods-max-2-laranja.webp", cor:4 }
    ], fundoClaro:false },
    txt:"Fone de ouvido over-ear, com até 20 horas de bateria.",
    opcoes:["Com Smart Case"],
    cores:[["Meia-noite","#2A2E38","#14171D"],["Estelar","#E7DECF","#BCB09C"],["Azul","#7FA3C9","#4E7398"],["Roxo","#A899CE","#7364A0"],["Laranja","#E5803F","#B4551C"]],
    descricao:"<p>O fone over-ear da Apple: driver dinâmico próprio, cancelamento ativo de ruído e Áudio Espacial com rastreamento dinâmico da cabeça. Até 20 horas de bateria com o cancelamento ligado, e 5 minutos de recarga rendem cerca de 1,5 hora. O controle é pela Digital Crown, igual à do Apple Watch.</p>",
    specs:[["Chip","H2 da Apple em cada concha"],["Áudio","Driver dinâmico da Apple, cancelamento ativo de ruído, Áudio Espacial com rastreamento de cabeça e Áudio Adaptativo"],["Controles","Digital Crown para volume, reprodução, chamadas e Siri"],["Bateria","Até 20 horas com cancelamento ativo"],["Recarga rápida","5 minutos rendem cerca de 1,5 hora de áudio"],["Conexão","Bluetooth 5.3, com USB-C"],["Peso","384,8 gramas (mais 134,5 g da Smart Case)"]] }
];
/* ================================================================== */

var CATS = [
  { id:"todos",  label:"Tudo" },
  { id:"iphone", label:"iPhone" },
  { id:"watch",  label:"Apple Watch" },
  { id:"ipad",   label:"iPad" },
  { id:"mac",    label:"MacBook" },
  { id:"airpods",label:"AirPods" }
];
