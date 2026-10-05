/* ==================================================================
   CONFIGURAÇÃO DA SR PHONE: os dados da loja ficam SÓ AQUI.
   Todas as partes do site (topo, contato, rodapé, localização, mapa,
   dados para o Google) leem daqui.
   Regra: campo vazio ("") não aparece no site. Nada é inventado.
   ================================================================== */

/* ---------- 1. SITE (SITE_URL) ----------
   url = endereço público do site, sem a barra no fim. É o ÚNICO lugar com o
   endereço: o resto do site e os arquivos gerados leem daqui.
   Hoje é o endereço provisório do Netlify. Quando a loja tiver domínio próprio,
   troque aqui e rode "npm run build": ele atualiza o <head> do index.html,
   o robots.txt e o sitemap.xml. */
var SITE_CONFIG = {
  url: "https://thunderous-genie-1cf391.netlify.app"   // TODO: trocar pelo domínio definitivo (ex.: "https://www.seudominio.com.br")
};

/* ---------- 2. DADOS DA EMPRESA ---------- */
var STORE_CONFIG = {
  nome:            "SR Phone",
  razaoSocial:     "",                    // TODO: inserir informação real (nome empresarial que está no CNPJ)
  cnpj:            "",                    // TODO: inserir informação real. Ex.: "00.000.000/0001-00"
  telefone:        "",                    // telefone fixo, se houver. Ex.: "(22) 2700-0000"
  whatsapp:        "5522974041089",       // DDI + DDD + número, só dígitos
  whatsappVisivel: "(22) 97404-1089",     // como o número aparece escrito
  email:           "",                    // TODO: inserir informação real. Ex.: "contato@seudominio.com.br"
  instagram:       "srphonemacae",        // sem o @

  /* endereço da loja física */
  endereco:        "Av. Atlântica, 386, Sala 211",
  bairro:          "Praia Campista",
  cidade:          "Macaé",
  estado:          "RJ",
  cep:             "27920-325",
  predio:          "Macaé Business Center",   // ajuda o Google Maps a achar a rota
  referencia:      "No edifício Macaé Business Center. A loja fica na sala 211.",

  /* MAPA: no Google Maps, abra a loja › Compartilhar › Incorporar um mapa ›
     copie só o endereço que está dentro de src="...".
     Vazio = o mapa não aparece (o endereço e o botão de rota continuam). */
  mapaEmbed:       "",                    // TODO: inserir o link de incorporação real do Google Maps

  /* as avaliações do Google (nota, quantidade, link e textos) ficam no item 6, lá embaixo */

  /* GARANTIA dos aparelhos NOVOS: o que aparece na página do produto e nas perguntas frequentes.
     Escreva só o que a loja pode comprovar. "" esconde a linha de garantia. */
  garantia:        "Garantia do fabricante, nos termos e prazos definidos pela Apple",

  /* GARANTIA dos SEMINOVOS (CPO). Não herda a garantia dos novos.
     "" = o site diz "As condições de garantia são informadas antes da compra."
     TODO: preencher só com a condição real que a loja oferece (sem inventar prazo). */
  garantiaSeminovos: "",

  /* NOTA FISCAL: true = a loja confirma que emite. null = não confirmado: o site não promete.
     Nos seminovos, enquanto for null, aparece "Consulte as condições de nota fiscal no atendimento."
     "Nota fiscal em todas as vendas" só aparece quando os DOIS forem true. */
  notaFiscalNovos:     true,
  notaFiscalSeminovos: null,   // TODO: true só se a loja confirmar nota fiscal nos seminovos

  /* prazo que a loja REALMENTE cumpre. "" = não promete prazo nenhum */
  prazoResposta:   "Respondemos dentro do horário de atendimento",

  /* HORÁRIO DE FUNCIONAMENTO, confirmado pela loja.
     [rótulo, texto, dias da semana (0 = domingo), abre, fecha] */
  horarioFuncionamento: [
    ["Segunda a sexta", "09:00 às 19:00", [1,2,3,4,5], 9, 19],
    ["Sábado",          "09:00 às 17:00", [6],         9, 17],
    ["Domingo",         "Fechado",        [0],      null, null]
  ],

  /* ================= PAGAMENTO =================
     O ÚNICO lugar com as condições de pagamento. O rodapé, o contato, os cards,
     a página do produto e as perguntas frequentes leem daqui.
     null = não informado: o site não fala disso. Nada é inventado.
     Um produto pode ter o próprio precoPix, parcelas e parcelasSemJuros (data/products.js). */
  pagamento: {
    aceitaPix:           true,
    aceitaCartao:        true,
    aceitaIphoneNaTroca: true,    /* iPhone usado como entrada (só na compra de iPhone) */

    /* número máximo de parcelas no cartão. null esconde o número */
    maxParcelas:         21,

    /* até quantas vezes é SEM JUROS. Só preencha se a loja confirmar.
       Ex.: 12 -> no produto com preço aparece "12x de R$ 416,58 sem juros".
       null = o site não fala de juros e mostra "Consulte as condições de parcelamento". */
    maxParcelasSemJuros: null,

    /* desconto no Pix para TODOS os produtos, em %. Ex.: 5. null = sem desconto automático.
       O precoPix de um produto sempre vale mais que este desconto. */
    descontoPix:         null,

    /* frase que aparece junto das formas de pagamento ("" esconde) */
    observacao:          "O número de parcelas e as condições a gente combina no atendimento.",

    /* logotipo OFICIAL do Pix (arquivo em assets/), mostrado no rodapé. "" = só o nome escrito */
    logoPix:             "",

    /* bandeiras de cartão aceitas, com o logotipo OFICIAL, mostradas no rodapé.
       Ex.: [{ nome: "Visa", img: "assets/bandeiras/visa.svg" }]. [] = só "Cartão de crédito" */
    bandeiras:           []
  },

  /* SERVIÇOS além da venda. Só ligue (true) o que a loja realmente oferece.
     assistenciaTecnica: true mostra "Assistência técnica" no contato, no rodapé e no agendamento,
     com o WhatsApp já escrito. TODO: confirmar com a loja se ela faz assistência técnica. */
  servicos: {
    assistenciaTecnica: false
  },

  /* AGENDAMENTO: horários que o site oferece. diasFechados: 0 = domingo ... 6 = sábado */
  agenda: {
    diasFechados:   [0],
    horarios:       ["09:00","10:00","11:00","13:00","14:00","15:00","16:00","17:00","18:00"],   /* segunda a sexta */
    horariosSabado: ["09:00","10:00","11:00","13:00","14:00","15:00","16:00"],
    diasNaFrente:   14
  }
};

/* ---------- 3. GOOGLE ANALYTICS 4 ----------
   Cole o ID de medição (ex.: "G-XXXXXXXXXX"). Vazio = nada é carregado. */
var GA_MEASUREMENT_ID = "";   // TODO: inserir o ID real (G-...) quando a loja criar a propriedade do GA4

/* ---------- 4. AGENDA ONLINE (Supabase) ----------
   Preencha depois de criar o projeto no Supabase e rodar as migrações (passo a passo no README.md):
     SUPABASE_URL      = Project URL (o mesmo valor de NEXT_PUBLIC_SUPABASE_URL), ex.: "https://abcd1234.supabase.co"
     SUPABASE_ANON_KEY = Publishable key (o mesmo valor de NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), começa com "sb_publishable_"
   Preenchidos, o site consulta os horários, o pedido vai pela função do servidor (/api/agendamento,
   que usa a chave SECRETA guardada só no Netlify) e a equipe entra em /funcionario/.
   Vazio = o agendamento funciona pelo WhatsApp e a tela diz isso.
   A publishable é pública de propósito e, sozinha, não lê dado nenhum de cliente (as regras ficam no banco).
   NUNCA cole aqui a Secret key (sb_secret_...), a "service_role", senha ou qualquer segredo. */
var SUPABASE_URL      = "";
var SUPABASE_ANON_KEY = "";

/* ---------- 4a. ANTI-ROBÔ DO AGENDAMENTO (Cloudflare Turnstile, opcional) ----------
   "Site Key" do widget (Cloudflare > Turnstile). Ela é PÚBLICA. O segredo do widget
   (TURNSTILE_SECRET_KEY) fica SÓ no Netlify: é lá que o servidor confere cada pedido.
   Preencha os dois juntos. Vazio = sem a caixinha (os limites de pedidos continuam valendo). */
var TURNSTILE_SITE_KEY = "";

/* ---------- 4b. CAIXA 3D (seção "Abra a caixa") ----------
   Sons discretos no lacre, na tampa e no final. Só tocam depois que a pessoa
   mexe na caixa (nunca sozinhos ao abrir o site). false = sem som. */
var ENABLE_UNBOXING_AUDIO = false;

/* ---------- 5. EQUIPE ----------
   Cada pessoa vira um cartão na seção "Equipe". Para mais alguém, copie o bloco { ... }.
   nome, cargo, texto = o que aparece escrito
   selo  = etiqueta discreta ao lado do cargo ("" esconde)
   foto  = arquivo da foto, ex.: "assets/equipe/maria-de-fatima.jpg" ("" mostra as iniciais).
           Ao TROCAR uma foto, use um nome de arquivo novo: o navegador guarda as imagens
           por muito tempo e continuaria mostrando a antiga.
   enquadramento = parte da foto que aparece no recorte, "horizontal vertical".
           "50% 20%" = centro, perto do topo. Se a cabeça ficar cortada, diminua o segundo número.
   temas = assuntos em que a pessoa ajuda ([] esconde)
   botao = texto do botão ("" esconde o botão)
   whatsapp = número da própria pessoa, só dígitos com DDI+DDD. "" usa o WhatsApp da loja
   mensagem = o texto que já abre escrito no WhatsApp */
var EQUIPE = [
  { nome:"Maria de Fátima",
    cargo:"Especialista Apple",
    selo:"Atendimento especializado",
    foto:"assets/equipe/maria-de-fatima.jpg",
    enquadramento:"50% 38%",
    texto:"Maria de Fátima faz parte da equipe com foco em oferecer um atendimento próximo, atencioso e personalizado. Com conhecimento no ecossistema Apple, auxilia clientes na escolha de iPhones, iPads, Macs e acessórios, buscando sempre indicar a opção mais adequada para cada necessidade. Seu objetivo é tornar a experiência de compra simples, segura e agradável, do primeiro atendimento ao pós-venda.",
    temas:["iPhone","iPad","Mac","Acessórios"],
    botao:"Falar com Maria",
    whatsapp:"",
    mensagem:"Olá, Maria! Vim pelo site da SR Phone e queria uma ajuda para escolher meu aparelho." }
];

/* ---------- 6. AVALIAÇÕES DO GOOGLE ----------
   Copiadas da ficha oficial da loja no Google. Só avaliação REAL, com o nome e o
   texto EXATAMENTE como estão no Google: sem corrigir o português, sem resumir e sem
   acrescentar nada. Não coloque avaliação de outro lugar nem escrita pela loja.
   nota        = a nota média que o Google mostra (ex.: 5.0 ou 4.8)
   total       = a quantidade de avaliações que o Google mostra
   link        = link oficial da ficha no Google (botão "Ver avaliações no Google")
   linkAvaliar = link DIRETO para o cliente escrever uma avaliação. Ele fica no Perfil da
                 Empresa no Google, em "Pedir avaliações". Vazio = o botão
                 "Avalie a SR Phone" não aparece. Nunca coloque um link inventado.
   conferidoEm = o dia em que os dados foram copiados do Google (ano-mês-dia).
                 A data de cada avaliação ("6 meses atrás") muda sozinha no Google, e aqui
                 não: por isso o site só mostra essa data até 30 dias depois deste dia.
                 Depois disso ela some, em vez de ficar errada.
   Chegou avaliação nova? Atualize nota, total, a lista e conferidoEm.
   Lista vazia e link vazio = a seção some do site. */
var AVALIACOES_GOOGLE = {
  nota:        5.0,
  total:       3,
  link:        "https://share.google/sjQlVjj1sHdcyBoGe",
  linkAvaliar: "",
  conferidoEm: "2026-09-29",
  lista: [
    { nome:"Kaio Lima",       nota:5, texto:"Ótimo atendimento, melhor preço que encontrei na região.", data:"6 meses atrás" },
    { nome:"Amanda Laureano", nota:5, texto:"Loja de excelência e qualidade",                          data:"6 meses atrás" },
    { nome:"Läräh Bärcëllös", nota:5, texto:"atendimento perfeito!!",                                  data:"6 meses atrás" }
  ]
};

/* ---------- 7. ASSISTENTE SR PHONE (o mascote 3D e o chat) ----------
   ligado     = false esconde o mascote e o chat do site inteiro.
   nome, mensagemInicial = o que aparece no chat. mensagemProduto aparece (uma vez por produto)
              quando a pessoa abre o assistente com um produto aberto; {produto} vira o nome dele.
   atalhos    = os botões rápidos do chat (o texto pode mudar; a ordem também).
   atalhosProduto = os botões rápidos quando a pessoa está com um produto aberto.
   modelo3d   = um GLB de artista, OPCIONAL. O mascote do site é o 3D da marca, feito no código
                (js/mascote3d.js: o iPhone de moldura cobre, chapéu, monóculo e bigode da arte da loja).
                Se um dia existir um GLB feito por artista, coloque em assets/modelos/srphone-assistant.glb
                e rode "npm run build" (ele confere o arquivo e as animações): o site usa o GLB sozinho.
                "" = nunca procurar GLB.
                Como o arquivo precisa ser feito: GUIA-MODELO-3D-SRPHONE.md.
   animacoes  = o nome de cada animação dentro do GLB, por estado do mascote.
   imagem     = a versão parada do mascote (aparece antes do 3D carregar e quando não há 3D).
   ia         = o assistente inteligente. ligada: false = o chat responde só com o cérebro local
                (os dados do site), sem chamar a IA. endpoint = o endereço da função do servidor
                (netlify/functions/assistente.mjs). A CHAVE DA IA NUNCA FICA AQUI: ela fica só nas
                variáveis de ambiente do Netlify (AI_API_KEY). Veja ASSISTENTE-SRPHONE-FINAL.md. */
var ASSISTENTE = {
  ligado:          true,
  nome:            "Assistente SR Phone",
  mensagemInicial: "Olá! 👋 Sou o assistente virtual da SR Phone. Posso te ajudar a encontrar um aparelho, entender como funciona a troca ou tirar suas dúvidas.",
  mensagemProduto: "Está olhando o {produto}? Posso te ajudar com preço, armazenamento, cores ou troca do seu aparelho.",
  atalhos: [
    { id: "iphones",     texto: "Ver iPhones" },
    { id: "preco",       texto: "Consultar preço" },
    { id: "troca",       texto: "Trocar meu aparelho" },
    { id: "agendar",     texto: "Agendar atendimento" },
    { id: "localizacao", texto: "Localização" },
    { id: "whatsapp",    texto: "Falar no WhatsApp" }
  ],
  atalhosProduto: [
    { id: "preco",       texto: "Ver preço" },
    { id: "cores",       texto: "Ver cores" },
    { id: "troca",       texto: "Trocar meu iPhone" },
    { id: "whatsapp",    texto: "Falar com a loja" }
  ],
  modelo3d:  "assets/modelos/srphone-assistant.glb",
  animacoes: { idle: "Idle", hover: "Hover", greeting: "Wave", welcome: "Welcome", lookaround: "LookAround",
               thinking: "Thinking", speaking: ["Talking01", "Talking02"], pointing: "Point",
               present: "Present", success: "ThumbsUp", goodbye: "Goodbye" },
  imagem:    "assets/assistente/mascote-estatico.webp",
  ia: {
    ligada:   true,
    endpoint: "/api/assistente"
  }
};

/* ---------- 8. ENTREGA (botão "Calcular entrega", com mapa e rota) ----------
   A pessoa escolhe o local no mapa (localização do celular ou endereço digitado) e o site mostra
   a ROTA de verdade da loja até lá, com distância, tempo e o valor da entrega. A distância é a da
   rota pelas ruas (nunca em linha reta). A origem é SEMPRE a loja (endereço do item 2).

   COMO O VALOR É CALCULADO (js/precos.js > calcularEntrega, a única conta do frete):
       valor = baseFee + (distância da rota em km × pricePerKm), depois o arredondamento
       (roundingMode) e nunca menos que minimumFee.
       A distância entra com uma casa decimal (6,43 km → 6,4 km), a mesma que aparece na tela.
       Ex.: 7 + 6,4 × 1,50 = R$ 16,60.
   Acima de maximumDistanceKm: sem preço automático; o site oferece "Consultar entrega pelo WhatsApp".

   TODO: os valores abaixo são de EXEMPLO. Confirme com a loja antes de publicar.

   O mapa e as rotas usam o Google Maps Platform. As CHAVES não ficam aqui: ficam nas variáveis de
   ambiente do Netlify (MAPS_SERVER_KEY e MAPS_BROWSER_KEY). Sem elas, o botão mostra a retirada na
   loja e o WhatsApp. Passo a passo em PRODUCAO-SRPHONE.md. */
var DELIVERY_CONFIG = {
  ligada:            true,

  /* ===== VALORES COMERCIAIS DA SR PHONE – EDITAR AQUI ===== */
  /* false = os quatro valores abaixo ainda são de EXEMPLO (a loja não confirmou). O site calcula,
     mas avisa o cliente que a tabela está em confirmação e que o valor final é combinado na conversa.
     Quando a loja confirmar a taxa, o km, o mínimo e o limite: troque para true. */
  tarifasConfirmadas: false,
  baseFee:           7,       /* taxa inicial, em reais */
  pricePerKm:        1.5,     /* valor por quilômetro da rota, em reais */
  minimumFee:        8,       /* valor mínimo da entrega, em reais */
  maximumDistanceKm: 30,      /* limite da entrega automática, em km de rota */

  /* arredondamento do valor (exemplo com R$ 16,63 antes de arredondar):
       "centavos"                 → R$ 16,63  (padrão: valor normal, com duas casas)
       "dez-centavos"             → R$ 16,60  (os R$ 0,10 mais próximos)
       "dez-centavos-acima"       → R$ 16,70  (sobe para os próximos R$ 0,10)
       "cinquenta-centavos-acima" → R$ 17,00  (sobe para os próximos R$ 0,50)
       "final-90"                 → R$ 16,90  (sobe para o próximo valor terminado em ,90) */
  roundingMode:      "centavos",
  /* ===== fim dos valores comerciais ===== */

  /* true = o tempo considera o trânsito do momento (no Google, custa mais por consulta) */
  considerarTransito: false,

  /* a loja no mapa (origem fixa de toda entrega). Nome e endereço vêm do item 2 (STORE_CONFIG):
     "SR Phone" + cidade, prédio, endereço, bairro, cidade e CEP. Não repita o endereço aqui.
     lat e lng (opcional): o ponto exato da porta da loja. Para pegar: no Google Maps, clique com o
     botão direito na entrada do prédio e toque nos números que aparecem.
     Vazio (null) = o sistema encontra a loja pelo endereço. */
  origem: {
    lat:  null,
    lng:  null
  },

  /* endereço da função do servidor que calcula a rota (netlify/functions/entrega.mjs) */
  endpoint: "/api/entrega"
};
