/* SR Phone · o cérebro do Assistente SR Phone
   ------------------------------------------------------------------
   Módulo que NÃO vem com a página: js/assistente.js só o importa quando a pessoa abre o chat.

   Híbrido:
     1. ATALHOS e FLUXOS respondem aqui mesmo, com os dados do site (sempre, com ou sem IA):
        ver iPhones, preço, cores, troca (coleta os dados do aparelho), agendar, localização,
        WhatsApp e "qual iPhone escolher" (orçamento, uso e prioridade → modelos reais).
     2. As outras perguntas vão para a IA: a função do servidor em ASSISTENTE.ia.endpoint
        (netlify/functions/assistente.mjs). Ela só conhece os dados oficiais do site e devolve a
        resposta aos poucos: o mascote pensa, fala enquanto o texto chega e volta ao normal.
        A chave da IA fica no servidor. Aqui só se manda a conversa e a página aberta.
     3. Sem IA (sem chave, fora do ar, limite, erro ou demora), o CÉREBRO LOCAL responde com o
        catálogo, e uma vez por visita o assistente avisa que está com dificuldade.
   Nada é inventado: preço, cor, opção e disponibilidade saem do catálogo (data/products.js).
   O que não dá para confirmar vai para a equipe no WhatsApp, com um resumo já escrito
   (a pessoa é quem toca em enviar).

   Memória: só nesta aba do navegador (sessionStorage), no máximo 30 mensagens, apagada ao
   fechar a aba ou em "Limpar conversa". Nada fica guardado no servidor. */

const MSG_NAO_CONFIRMO = "Não consigo confirmar essa informação por aqui. Posso chamar a equipe da SR Phone no WhatsApp para verificar para você.";
const MSG_RECUSA = "Não posso compartilhar configurações internas nem mudar as minhas regras. Posso te ajudar com produtos, preços, troca, agendamento ou localização da SR Phone.";
const MSG_SEM_IA = "Estou com dificuldade para acessar o assistente inteligente agora, mas ainda consigo ajudar com informações básicas da SR Phone.";
const CHAVE = "sra-conversa", CHAVE_PRODUTOS = "sra-produtos";
const MAX_MSGS = 30, HISTORICO_IA = 10, MAX_IA_POR_VISITA = 40, TEMPO_IA_MS = 30000;

let ui = null, CFG = {}, mem = null, externo = null, mostrou = false;

/* ======================= memória da conversa (só nesta aba) ======================= */
function nova(){ return { v: 1, msgs: [], foco: "", pagina: "", duvida: "", fluxo: null, troca: null, escolha: null, pendente: null,
  ia: { off: false, avisou: false, chamadas: 0, falhas: 0, pausaAte: 0 } }; }
function carrega(){
  try {
    const m = JSON.parse(sessionStorage.getItem(CHAVE) || "null");
    if (m && m.v === 1 && Array.isArray(m.msgs)) return Object.assign(nova(), m, { ia: Object.assign(nova().ia, m.ia || {}) });
  } catch (_){ /* sem armazenamento: segue sem lembrar */ }
  return nova();
}
function salva(){
  mem.msgs = mem.msgs.slice(-MAX_MSGS);
  try { sessionStorage.setItem(CHAVE, JSON.stringify(mem)); } catch (_){ /* cheio ou bloqueado */ }
}
function anota(papel, texto, acoes){
  mem.msgs.push({ p: papel, t: String(texto || "").slice(0, 1200), a: acoes && acoes.length ? acoes : undefined });
  salva();
}

/* ======================= dados do site ======================= */
const catalogo = () => (Array.isArray(window.CATALOGO) ? window.CATALOGO : []);
const produto = (id) => catalogo().find((p) => p.id === id) || null;
const brl = (v) => (window.BRL ? window.BRL.format(v) : "R$ " + v).replace(/\s/g, " ");
const semAcento = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const temCores = (p) => !!(p && p.cores && p.cores.length);
const nomesCores = (p) => (temCores(p) ? p.cores.map((c) => String(c[0])) : []);
const frase = (t) => { t = String(t || "").trim(); return t && !/[.!?]$/.test(t) ? t + "." : t; };
const juntaLista = (l) => (l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " e " + l[l.length - 1]);
const ouLista = (l) => (l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " ou " + l[l.length - 1]);
const loja = () => window.SC || window.STORE_CONFIG || {};
function faq(re){
  const l = Array.isArray(window.PERGUNTAS) ? window.PERGUNTAS : [];
  for (const q of l) if (re.test(q[0]) && q[1]) return String(q[1]).trim();
  return "";
}
/* o produto de que se fala: o último citado na conversa ("Quero o 16 Pro Max" → "Tem preto?") vale mais
   que o aberto na página; abrir outro produto na página faz dele o assunto */
function produtoDoContexto(){
  const aberto = ui.produtoAberto();
  if (aberto && aberto.id !== mem.pagina){ mem.pagina = aberto.id; mem.foco = aberto.id; salva(); }
  else if (!aberto && mem.pagina){ mem.pagina = ""; salva(); }
  return produto(mem.foco) || aberto;
}
function escolhaDoAberto(p){
  if (ui.produtoAberto() !== p) return null;
  const e = ui.escolhaAtual(p) || {};
  return { iOp: Math.max(0, p.opcoes.indexOf(e.opcao)), iCor: Math.max(0, nomesCores(p).indexOf(e.cor)), e };
}
function status(p, iOp, iCor){ return typeof window.statusDe === "function" ? window.statusDe(p, iOp, iCor) : { chave: "consultar", texto: "Consulte disponibilidade" }; }
function fraseStatus(st){
  return !st || st.chave === "consultar" ? "A disponibilidade a loja confirma no atendimento." : `Disponibilidade: ${st.texto}${st.aviso ? " (" + st.aviso.charAt(0).toLowerCase() + st.aviso.slice(1) + ")" : ""}.`;
}
const precoDe = (p, i, c) => (typeof window.precoDe === "function" ? window.precoDe(p, i, c) : null);
const menorPreco = (p) => (typeof window.menorPreco === "function" ? window.menorPreco(p) : null);
function resumoProduto(p){ const v = menorPreco(p); return p.nome + (v ? ": a partir de " + brl(v) : ": preço sob consulta"); }

/* busca: tira as palavras de pergunta, armazenamento e cor, e procura no catálogo (a mesma busca do site) */
const PALAVRAS = /\b(qual|quais|quanto|quantos|custa|custam|o|a|os|as|do|da|de|dos|das|preco|precos|valor|valores|tem|tens|voces|vcs|me|mostra|mostrar|ver|quero|queria|gostaria|um|uma|e|eh|esta|estao|sai|fica|ficam|por|pra|para|no|na|nos|nas|com|cor|cores|esse|essa|este|ele|ela|disponivel|disponiveis|estoque|ainda|sobre|mais|barato|caro|comprar|compro|modelo|aparelho|celular|loja|ai|aí|hoje|agora|novo|nova|lacrado|lacrada|oi|ola|favor|por favor)\b/g;
const CORES = ["pret", "branc", "azul", "rosa", "verde", "amarel", "vermelh", "rox", "lilas", "lavand", "prat", "dourad", "ouro", "cinz", "grafit", "laranj", "bord", "vinho", "natural", "titani", "estelar", "meia-noite", "meia noite", "glacial", "bege", "marrom", "creme", "gelo", "areia", "salvia", "ultramarin", "turquesa", "anil", "ceu", "nevoa", "cosmic", "cosmico", "deserto", "jet", "estrela"];
const RE_COR = new RegExp("\\b(" + CORES.map((c) => c.replace(/[-\s]/g, "[-\\s]?")).join("|") + ")[a-z]*", "g");
function buscaProdutos(texto){
  const limpo = semAcento(texto).replace(/[^a-z0-9\s-]/g, " ").replace(/\b\d+\s*(gb|tb|mm)\b/g, " ")
    .replace(RE_COR, " ").replace(PALAVRAS, " ").replace(/\s+/g, " ").trim();
  if (limpo.length < 2 || typeof window.achou !== "function") return [];
  const exatos = catalogo().filter((p) => semAcento(p.nome) === limpo);
  if (exatos.length) return exatos;
  return catalogo().filter((p) => window.achou(p, limpo)).slice(0, 4);
}
function corPedida(texto){ const m = semAcento(texto).match(RE_COR); return m ? m[0] : ""; }
function indiceCor(p, pedida){
  const raiz = semAcento(pedida).replace(/[-\s]/g, "").replace(/(o|a|os|as)$/, "").slice(0, 5);
  if (!raiz) return -1;
  return nomesCores(p).findIndex((c) => semAcento(c).replace(/[-\s]/g, "").includes(raiz) || (raiz === "prat" && /prata|prateado|silver/.test(semAcento(c))));
}
function indiceOpcao(p, texto){
  const t = semAcento(texto);
  return p.opcoes.findIndex((o) => {
    const num = (String(o).match(/\d+/) || [])[0], un = semAcento(o).replace(/[\d\s]/g, "");
    return num && new RegExp("\\b" + num + "\\s*(" + (un || "gb") + ")?\\b").test(t) && (un !== "tb" || /tb|tera/.test(t) || num !== "1");
  });
}
/* guarda o produto de que a conversa trata ("Quero o 16 Pro Max" → "Tem preto?") */
function lembraProduto(texto){
  const l = buscaProdutos(texto);
  if (l.length === 1){ mem.foco = l[0].id; salva(); }
}

/* ======================= WhatsApp: resumo organizado (a pessoa é quem envia) ======================= */
function limpaLinha(t){ return typeof window.mensagemSegura === "function" ? window.mensagemSegura(t) : String(t || "").replace(/\s+/g, " ").trim(); }
function linkZap(linhas){
  const num = String(loja().whatsapp || "").replace(/\D/g, "");
  return "https://wa.me/" + num + "?text=" + encodeURIComponent(linhas.map(limpaLinha).filter(Boolean).join("\n"));
}
function linhasTroca(){
  const d = (mem.troca && mem.troca.dados) || {};
  return PASSOS_TROCA.filter((p) => d[p.k]).map((p) => "• " + p.rotulo + ": " + d[p.k]);
}
function resumoZap(motivo){
  const linhas = ["Olá, vim pelo Assistente SR Phone."];
  const p = produtoDoContexto();
  if (p){
    const e = escolhaDoAberto(p);
    const nome = typeof window.nomeEscolha === "function" ? window.nomeEscolha(p, e ? e.e : {}) : p.nome;
    linhas.push((motivo === "troca" ? "Produto de interesse: " : "Produto: ") + nome);
  }
  if (motivo === "troca"){
    const t = linhasTroca();
    if (t.length) linhas.push("Quero avaliar meu iPhone na troca:", ...t, "Pode avaliar para mim?");
    else linhas.push("Quero avaliar meu iPhone na troca.");
  } else {
    if (motivo === "entrega") linhas.push("Gostaria de consultar a entrega do meu pedido.");
    if (mem.duvida) linhas.push("Dúvida: " + mem.duvida.slice(0, 200));
    if (mem.troca && mem.troca.concluida){
      const d = mem.troca.dados;
      linhas.push("Troca: " + [d.modelo, d.armazenamento, d.bateria && "bateria " + d.bateria].filter(Boolean).join(" · "));
    }
  }
  return linhas;
}
const acaoZap = (motivo, rotulo) => ({ id: "zap", motivo: motivo || "duvida", rotulo: rotulo || "Continuar no WhatsApp" });

/* ======================= ações: descrições guardáveis → botões ======================= */
function paraTela(r){
  const acoes = (r.acoes || []).map(botao).filter(Boolean);
  return { texto: r.texto, acoes, gesto: r.gesto, depois: r.depois };
}
function botao(d){
  if (!d || !d.id) return null;
  switch (d.id){
    case "zap":
      return { rotulo: d.rotulo, href: linkZap(resumoZap(d.motivo)), zap: true, primario: true,
        aoClicar: () => ui.mede("assistant_whatsapp_clicked", { origem: "assistente", tipo: d.motivo }) };
    case "produto": {
      const p = produto(d.produto);
      if (!p) return null;
      return { rotulo: "Ver o " + p.nome, fazer: () => {
        ui.mede("assistant_product_clicked", { item_id: p.id, item_name: p.nome });
        mem.foco = p.id; salva();
        if (ui.folha()) ui.fechar();
        if (typeof window.abrePdp === "function") window.abrePdp(p);
        ui.gesto("success");
      } };
    }
    case "ir":
      return { rotulo: d.rotulo, primario: !!d.primario, fazer: () => {
        if (d.secao === "agendar"){
          ui.mede("assistant_schedule_clicked", { origem: "assistente" });
          if (d.interesse && typeof window.agendaInteresse === "function") window.agendaInteresse(d.interesse);
        }
        if (d.secao === "troca") ui.mede("assistant_trade_started", { origem: "simulador" });
        ui.vaiPara(d.secao);
      } };
    case "rota":
      return /^https:\/\//.test(d.href || "") ? { rotulo: "Traçar rota", href: d.href, primario: true } : null;
    case "catalogo":
      return { rotulo: d.rotulo || "Ver o catálogo", fazer: () => ui.vaiPara("catalogo") };
    case "atalho":
      return { rotulo: d.rotulo, primario: !!d.primario, fazer: () => ui.enviar(d.rotulo, () => atalho(d.atalho, d.rotulo, true)) };
    case "responde":
      return { rotulo: d.rotulo, resposta: true, fazer: () => ui.enviar(d.rotulo, () => perguntar(d.valor || d.rotulo, true)) };
    case "entrega":
      /* a calculadora de entrega (js/entrega.js): o mapa, a rota e o valor são dela, nunca daqui */
      if (!window.SREntrega) return null;
      return { rotulo: d.rotulo || "Calcular entrega", primario: !!d.primario, fazer: () => {
        /* o produto da conversa vai junto (só o id e a escolha: nome e preço a calculadora pega do catálogo) */
        const p = produtoDoContexto(), e = p ? escolhaDoAberto(p) : null;
        const produto = p ? { id: p.id, opcao: e ? e.e.opcao : "", cor: e ? e.e.cor : "" } : null;
        ui.mede("assistant_delivery_clicked", { origem: "assistente", tipo: d.modo || "resultado" });
        window.SREntrega.abrir({ modo: d.modo || "", origem: "assistente", produto });
      } };
    case "trocaPdp":
      return { rotulo: d.rotulo, fazer: () => {
        ui.mede("assistant_trade_started", { origem: "produto" });
        const b = document.getElementById("tb-com"), caixa = document.querySelector(".pdp-troca");
        if (ui.folha()) ui.fechar();
        if (b) b.click();
        if (caixa) caixa.scrollIntoView({ behavior: ui.reduz() ? "auto" : "smooth", block: "center" });
      } };
    default: return null;
  }
}
const responde = (rotulo, valor) => ({ id: "responde", rotulo, valor: valor || rotulo });
const CANCELAR = responde("Cancelar", "cancelar");
function gestoPara(acoes){
  if ((acoes || []).some((a) => a.id === "produto")) return "present";
  return (acoes || []).length ? "pointing" : "";
}

/* ======================= fala: guarda na memória e mostra ======================= */
function fala(r){
  anota("a", r.texto, r.acoes);
  return ui.fala(paraTela(r));
}
function naoSei(){ return { texto: MSG_NAO_CONFIRMO, acoes: [acaoZap("duvida")], gesto: "pointing" }; }
/* o mascote pensa, a resposta (local) aparece */
function respondeLocal(r){
  return ui.pergunta(() => Promise.resolve(typeof r === "function" ? r() : r).catch(naoSei).then((x) => {
    x = typeof x === "string" ? { texto: x } : (x && x.texto ? x : naoSei());
    anota("a", x.texto, x.acoes);
    return paraTela(x);
  }));
}

/* ======================= atalhos ======================= */
const ATALHOS = {
  iphones(){
    const n = catalogo().filter((p) => p.cat === "iphone").length;
    return { texto: "Separei os iPhones do catálogo" + (n ? " (" + n + " modelos)" : "") + ". Toque em um para ver cores, armazenamento e preço.",
      acoes: [{ id: "atalho", atalho: "recomendar", rotulo: "Me ajude a escolher" }],
      depois: () => {
        ui.fechaProduto();
        if (ui.folha()) ui.fechar();
        if (typeof window.escolheCategoria === "function") window.escolheCategoria("iphone", true);
        setTimeout(() => { if (ui.aberto()) ui.aponta(document.getElementById("catalogo")); }, ui.reduz() ? 50 : 700);
      } };
  },
  preco(){
    const p = produtoDoContexto();
    if (p) return precoLocal(p, "");
    return { texto: "Me diga o modelo que você procura (por exemplo: iPhone 17 ou Apple Watch) que eu mostro o preço. Se preferir, veja o catálogo.",
      acoes: [{ id: "catalogo" }] };
  },
  cores(){
    const p = produtoDoContexto();
    if (!p) return { texto: "De qual modelo você quer ver as cores? Me diga o nome (por exemplo: iPhone 17 Pro)." };
    return respostaCor(p, "");
  },
  troca(){ return comecaTroca(""); },
  recomendar(){ return comecaEscolha(); },
  agendar(){
    const p = ui.produtoAberto(), e = p ? escolhaDoAberto(p) : null;
    const online = !!window.agendaOnline;
    return { texto: "Você escolhe o dia e o horário na agenda da loja. " + (online
        ? "O horário fica reservado assim que você pede, e a loja confirma pelo WhatsApp."
        : "A mensagem sai pronta no WhatsApp e a loja confirma o horário na conversa."),
      acoes: [{ id: "ir", secao: "agendar", rotulo: "Escolher dia e horário", primario: true,
        interesse: p ? p.nome + (e && e.e.opcao ? " " + e.e.opcao : "") : "" }],
      gesto: "pointing" };
  },
  localizacao(){
    const e = typeof window.enderecoLinhas === "function" ? window.enderecoLinhas() : { completo: "" };
    const ref = loja().referencia || "";
    const horas = typeof window.horarioTexto === "function" ? window.horarioTexto() : [];
    const rota = document.getElementById("loc-rota");
    return { texto: (e.completo ? "A loja fica em " + e.completo + "." : "A loja fica em Macaé.") + (ref ? " " + ref : "") +
        (horas.length ? " Horário: " + horas.join("; ") + "." : ""),
      acoes: [rota ? { id: "rota", href: rota.href } : null, { id: "ir", secao: "localizacao", rotulo: "Ver no site" }].filter(Boolean),
      gesto: "pointing" };
  },
  entrega(n){
    const f = faq(/entregam/i);
    if (!window.SREntrega) return { texto: (f || "A entrega é combinada com a loja.") + " O valor da entrega a equipe informa pelo WhatsApp.",
      acoes: [acaoZap("entrega", "Consultar entrega no WhatsApp")], gesto: "pointing" };
    const pedeValor = !n || /(quanto|valor|preco|custa|taxa|calcul|frete|aqui|pra ca|para ca|meu endereco|minha casa|ate )/.test(n);
    return { texto: (!pedeValor && f ? f + " " : "") + "Posso calcular a entrega pela rota, da SR Phone até o seu endereço. Como você prefere informar o local?",
      acoes: [{ id: "entrega", modo: "localizacao", rotulo: "Usar minha localização", primario: true }, { id: "entrega", modo: "endereco", rotulo: "Digitar endereço" }],
      gesto: "pointing" };
  },
  whatsapp(){
    const vis = loja().whatsappVisivel || "";
    return { texto: "É só tocar no botão: o WhatsApp da loja" + (vis ? " (" + vis + ")" : "") +
        " abre com um resumo da nossa conversa já escrito. A mensagem só é enviada quando você tocar em enviar.",
      acoes: [acaoZap("contato", "Continuar no WhatsApp")], gesto: "pointing" };
  }
};
function horario(){
  const h = typeof window.horarioTexto === "function" ? window.horarioTexto() : [];
  return { texto: h.length ? "Horário de atendimento: " + h.join("; ") + "." : "O horário a loja informa pelo WhatsApp.",
    acoes: [{ id: "ir", secao: "localizacao", rotulo: "Ver endereço" }] };
}

/* ======================= preço e cor (do catálogo) ======================= */
function textoPreco(p, iOp, iCor){
  const cores = nomesCores(p), op = p.opcoes[iOp] || "";
  const idx = iCor >= 0 ? [iCor] : (cores.length ? cores.map((_, i) => i) : [0]);
  const vals = idx.map((c) => ({ c, v: precoDe(p, iOp, c) }));
  const nome = [p.nome, op].filter(Boolean).join(" ") + (iCor >= 0 && cores[iCor] ? " na cor " + cores[iCor] : "");
  if (!vals.every((x) => x.v === vals[0].v))
    return `O ${nome} tem preço por cor: ` + vals.map((x) => `${cores[x.c]}: ${x.v ? brl(x.v) : "sob consulta"}`).join("; ") + ".";
  const c0 = idx[0], v = vals[0].v;
  if (!v) return `O ${nome}: preço sob consulta. ${fraseStatus(status(p, iOp, c0))} Posso chamar a equipe no WhatsApp com o modelo, a opção e a cor já escritos.`.replace(/\.\./g, ".");
  let t = `O ${nome} está por ${brl(v)}.`;
  const pix = typeof window.precoPixDe === "function" ? window.precoPixDe(p, iOp, c0) : null;
  if (pix) t += ` No Pix: ${brl(pix.valor)}.`;
  const parc = typeof window.parcelamentoDe === "function" ? window.parcelamentoDe(p, iOp, c0) : null;
  if (parc && parc.texto) t += " " + parc.texto + (parc.detalhe ? " (" + parc.detalhe.charAt(0).toLowerCase() + parc.detalhe.slice(1) + ")" : "") + ".";
  if (p.obsPreco) t += " " + frase(p.obsPreco);
  return (t + " " + fraseStatus(status(p, iOp, c0))).replace(/\.\./g, ".");
}
function precoLocal(p, texto){
  const aberto = escolhaDoAberto(p);
  let iOp = indiceOpcao(p, texto);
  const pedida = corPedida(texto), iCorPedida = pedida ? indiceCor(p, pedida) : -1;
  if (iOp < 0 && aberto) iOp = aberto.iOp;
  if (iOp < 0 && p.opcoes.length > 1){
    const precos = p.opcoes.map((_, i) => nomesCores(p).length ? nomesCores(p).map((__, c) => precoDe(p, i, c) || 0).join("/") : String(precoDe(p, i, 0) || 0));
    if (new Set(precos).size > 1){
      mem.pendente = { tipo: "opcao", produto: p.id, cor: iCorPedida }; salva();
      return { texto: `O ${p.nome} tem ${juntaLista(p.opcoes)}. Qual ${String(window.rotuloOpcao ? window.rotuloOpcao(p) : "armazenamento").toLowerCase()} você quer: ${ouLista(p.opcoes)}?`,
        acoes: p.opcoes.map((o) => responde(o)) };
    }
  }
  if (iOp < 0) iOp = 0;
  const iCor = iCorPedida >= 0 ? iCorPedida : (aberto ? aberto.iCor : -1);
  const tem = precoDe(p, iOp, iCor >= 0 ? iCor : 0);
  const acoes = [aberto ? acaoZap("produto", tem ? "Comprar pelo WhatsApp" : "Consultar no WhatsApp") : { id: "produto", produto: p.id }];
  if (!aberto) acoes.push(acaoZap("produto", tem ? "Falar com a loja" : "Consultar no WhatsApp"));
  return { texto: textoPreco(p, iOp, iCor), acoes, gesto: "pointing" };
}
function respostaCor(p, texto){
  const cores = nomesCores(p);
  if (!cores.length) return { texto: `No catálogo, o ${p.nome} não tem cores listadas. A equipe confirma as opções no WhatsApp.`, acoes: [acaoZap("cor")] };
  const pedida = corPedida(texto), aberto = escolhaDoAberto(p), iOp = aberto ? aberto.iOp : 0;
  const ver = ui.produtoAberto() === p ? [] : [{ id: "produto", produto: p.id }];
  if (!pedida) return { texto: `O ${p.nome} aparece no catálogo nas cores ${juntaLista(cores)}. Na página dele, toque na cor para ver a foto.`, acoes: ver };
  const i = indiceCor(p, pedida);
  if (i >= 0) return { texto: `Sim, o ${p.nome} aparece no catálogo na cor ${cores[i]}. ${fraseStatus(status(p, iOp, i))}`, acoes: ver.concat([acaoZap("cor", "Confirmar no WhatsApp")]) };
  return { texto: `Não encontrei o ${p.nome} na cor ${pedida} no catálogo. Ele aparece nas cores ${juntaLista(cores)}. Se quiser, a equipe verifica outras possibilidades no WhatsApp.`,
    acoes: [acaoZap("cor")] };
}
function respondePendente(texto){
  const pend = mem.pendente;
  mem.pendente = null; salva();
  const p = pend && pend.tipo === "opcao" ? produto(pend.produto) : null;
  if (!p) return null;
  const iOp = indiceOpcao(p, texto);
  if (iOp < 0) return null;
  const pedida = corPedida(texto);
  const iCor = pedida ? indiceCor(p, pedida) : pend.cor >= 0 ? pend.cor : -1;
  const tem = precoDe(p, iOp, iCor >= 0 ? iCor : 0);
  return { texto: textoPreco(p, iOp, iCor), acoes: [{ id: "produto", produto: p.id }, acaoZap("produto", tem ? "Falar com a loja" : "Consultar no WhatsApp")], gesto: "pointing" };
}

/* ======================= fluxo: troca (coleta os dados; o valor quem diz é a equipe) ======================= */
const PASSOS_TROCA = [
  { k: "modelo", rotulo: "Modelo", pergunta: "Qual é o modelo do seu iPhone? Por exemplo: iPhone 13 Pro.", opcoes: [] },
  { k: "armazenamento", rotulo: "Armazenamento", pergunta: "Quanto de armazenamento ele tem?", opcoes: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB", "Não sei"] },
  { k: "bateria", rotulo: "Saúde da bateria", pergunta: "Qual é a saúde da bateria? Fica em Ajustes > Bateria > Saúde da Bateria. É só escrever o número (por exemplo: 84).", opcoes: ["Não sei"] },
  { k: "tela", rotulo: "Tela", pergunta: "Como está a tela?", opcoes: ["Perfeita", "Riscos leves", "Trincada ou com defeito"] },
  { k: "faceid", rotulo: "Face ID", pergunta: "O Face ID (ou o Touch ID) funciona?", opcoes: ["Funciona", "Não funciona"] },
  { k: "cameras", rotulo: "Câmeras", pergunta: "E as câmeras?", opcoes: ["Todas funcionam", "Alguma com defeito"] },
  { k: "traseira", rotulo: "Traseira", pergunta: "Como está a traseira (o vidro de trás)?", opcoes: ["Perfeita", "Riscos leves", "Trincada"] },
  { k: "funcionamento", rotulo: "Funcionamento geral", pergunta: "Por último: no geral, tudo funciona?", opcoes: ["Tudo funciona", "Tem algum defeito"] }
];
const NAO_IPHONE = /\b(samsung|galaxy|motorola|moto\s?[a-z0-9]|xiaomi|redmi|poco|android|ipad|apple watch|watch|realme|lg|asus|nokia|huawei|oppo|vivo|infinix|pixel)\b/;
function modeloIphone(texto){
  const t = semAcento(texto).replace(/[^a-z0-9\s]/g, " ");
  const m = t.match(/\b(?:iphone\s*)?(1[1-9]|x[rs]?|se|[5-8])(?:\s*(pro\s*max|pro|plus|mini|max|e))?\b/);
  if (!m || (!/iphone/.test(t) && !/^(1[1-9]|x[rs]?)$/.test(m[1]))) return "";
  const num = m[1].toUpperCase().replace(/^XS$/, "XS").replace(/^XR$/, "XR");
  const sufixo = (m[2] || "").replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^E$/, "e");
  return "iPhone " + num + (sufixo ? (sufixo === "e" ? "" : " ") + sufixo : "");
}
/* "84%", "bateria em 84" ou só "84" (quando é o único número) */
function bateriaDe(texto){
  const t = semAcento(texto);
  const m = t.match(/(\d{1,3})\s*(%|por\s*cento)/) || t.match(/(?:bateria|saude)\D{0,25}(\d{1,3})\b/) || t.match(/^\D*(\d{1,3})\D*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 100 ? n + "%" : null;
}
function armazenamentoDe(texto){
  const m = semAcento(texto).match(/\b(64|128|256|512|1)\s*(gb|g|tb|t|giga|tera)?\b/);
  if (!m) return "";
  return m[1] === "1" ? (/(tb|t|tera)/.test(m[2] || "") ? "1 TB" : "") : m[1] + " GB";
}
const querCancelar = (t) => /^(cancelar|cancela|parar|pare|sair|deixa pra la|esquece)\b/.test(semAcento(t).trim());
function comecaTroca(texto){
  const p = ui.produtoAberto();
  const aceita = !(loja().pagamento && loja().pagamento.aceitaIphoneNaTroca === false);
  if (!aceita) return { texto: "No momento a loja não está aceitando aparelho usado como entrada. A equipe explica as formas de pagamento no WhatsApp.", acoes: [acaoZap("troca")] };
  if (NAO_IPHONE.test(semAcento(texto))) return encerraNaoIphone();
  mem.troca = { dados: {}, concluida: false };
  const avisos = [];
  const modelo = modeloIphone(texto), bat = /bateria|saude/.test(semAcento(texto)) ? bateriaDe(texto) : null, arm = armazenamentoDe(texto);
  if (modelo){ mem.troca.dados.modelo = modelo; avisos.push("modelo " + modelo); }
  if (arm){ mem.troca.dados.armazenamento = arm; avisos.push(arm); }
  if (bat){ mem.troca.dados.bateria = bat; avisos.push("bateria em " + bat); }
  mem.fluxo = { tipo: "troca" };
  salva();
  ui.mede("assistant_trade_started", { origem: "chat" });
  let t = "A SR Phone aceita iPhone como entrada na compra de outro iPhone: o valor é abatido e você paga só a diferença. Quem avalia e diz o valor é a equipe, depois de ver o aparelho (estado, bateria e iCloud liberado).";
  t += avisos.length ? " Já anotei: " + juntaLista(avisos) + "." : "";
  t += " Vou anotar os dados do seu aparelho para a equipe.";
  const extra = p && typeof window.aceitaTroca === "function" && window.aceitaTroca(p) ? [{ id: "trocaPdp", rotulo: "Calcular na página do produto" }] : [{ id: "ir", secao: "troca", rotulo: "Prefiro o simulador da página" }];
  return proximaDaTroca(t, extra);
}
function proximaDaTroca(prefixo, extra){
  const passo = PASSOS_TROCA.find((x) => !mem.troca.dados[x.k]);
  if (!passo) return concluiTroca();
  mem.fluxo = { tipo: "troca", passo: passo.k }; salva();
  return { texto: (prefixo ? prefixo + "\n\n" : "") + passo.pergunta, acoes: passo.opcoes.map((o) => responde(o)).concat([CANCELAR], extra || []) };
}
function encerraNaoIphone(){
  mem.fluxo = null; salva();
  return { texto: "A SR Phone aceita somente iPhone como entrada. Android, iPad e Apple Watch não entram na troca. A equipe explica as outras formas de pagamento no WhatsApp.", acoes: [acaoZap("troca")] };
}
/* dado dito fora da ordem ("minha bateria está com 84%" quando a pergunta é o modelo): anota e segue */
function anotaForaDaOrdem(texto, k, d){
  const n = semAcento(texto), notas = [];
  if (k !== "bateria" && !d.bateria && /(bateria|saude|%)/.test(n)){ const b = bateriaDe(texto); if (b){ d.bateria = b; notas.push("bateria em " + b); } }
  if (k !== "armazenamento" && !d.armazenamento && /\b(gb|tb|giga|tera)\b/.test(n)){ const a = armazenamentoDe(texto); if (a){ d.armazenamento = a; notas.push(a); } }
  return notas;
}
function respondeTroca(texto){
  if (querCancelar(texto)){ mem.fluxo = null; salva(); return { texto: "Tudo bem, parei por aqui. Para retomar, é só tocar em \"Trocar meu aparelho\"." }; }
  const k = mem.fluxo.passo, d = mem.troca.dados, n = semAcento(texto);
  const notas = k === "modelo" || k === "armazenamento" || k === "bateria" ? anotaForaDaOrdem(texto, k, d) : [];
  const anotei = notas.length ? "Anotei: " + juntaLista(notas) + "." : "";
  if (k === "modelo"){
    if (NAO_IPHONE.test(n)) return encerraNaoIphone();
    const m = modeloIphone(texto);
    if (!m){
      salva();
      return { texto: anotei ? anotei + "\n\nAgora me diga o modelo do seu iPhone, como aparece em Ajustes > Geral > Sobre (por exemplo: iPhone 13 Pro)."
        : "Não reconheci o modelo. Escreva como aparece em Ajustes > Geral > Sobre, por exemplo: iPhone 13 Pro.", acoes: [CANCELAR] };
    }
    d.modelo = m;
    const arm = armazenamentoDe(texto); if (arm && !d.armazenamento) d.armazenamento = arm;
  } else if (k === "bateria"){
    if (/nao sei|sei la|nao lembro/.test(n)) d.bateria = "Não sei";
    else { const b = bateriaDe(texto); if (!b) return { texto: "Me diga um número de 1 a 100 (por exemplo: 84) ou toque em \"Não sei\".", acoes: [responde("Não sei"), CANCELAR] }; d.bateria = b; }
  } else if (k === "armazenamento") d.armazenamento = armazenamentoDe(texto) || (/nao sei/.test(n) ? "Não sei" : String(texto).trim().slice(0, 30));
  else d[k] = String(texto).trim().slice(0, 80);
  salva();
  return proximaDaTroca(anotei);
}
function concluiTroca(){
  mem.fluxo = null; mem.troca.concluida = true; salva();
  return { texto: "Pronto! Anotei os dados do seu aparelho:\n" + linhasTroca().join("\n") +
      "\n\nQuem avalia e diz o valor é a equipe da SR Phone, depois de ver o aparelho. Toque em \"Continuar no WhatsApp\": a mensagem já vai organizada, e você envia quando quiser.",
    acoes: [acaoZap("troca", "Continuar no WhatsApp"), { id: "ir", secao: "agendar", rotulo: "Agendar avaliação na loja" }], gesto: "pointing" };
}

/* ======================= fluxo: qual iPhone escolher (só modelos reais do catálogo) ======================= */
const PASSOS_ESCOLHA = [
  { k: "orcamento", pergunta: "Vamos achar o iPhone certo para você. Quanto você pretende investir?", opcoes: ["Até R$ 5 mil", "Até R$ 8 mil", "Até R$ 11 mil", "Sem limite"] },
  { k: "uso", pergunta: "Para que você mais usa o celular?", opcoes: ["Fotos e vídeos", "Jogos e desempenho", "Dia a dia"] },
  { k: "prioridade", pergunta: "E o que pesa mais para você?", opcoes: ["Câmera", "Bateria", "Tela grande", "Tamanho compacto"] }
];
function comecaEscolha(){
  mem.escolha = {}; mem.fluxo = { tipo: "escolha" }; salva();
  return proximaDaEscolha();
}
function proximaDaEscolha(prefixo){
  const passo = PASSOS_ESCOLHA.find((x) => mem.escolha[x.k] === undefined);
  if (!passo) return recomenda();
  mem.fluxo = { tipo: "escolha", passo: passo.k }; salva();
  return { texto: (prefixo ? prefixo + " " : "") + passo.pergunta, acoes: passo.opcoes.map((o) => responde(o)).concat([CANCELAR]) };
}
function orcamentoDe(texto){
  const n = semAcento(texto);
  if (/sem limite|tanto faz|qualquer|nao importa/.test(n)) return Infinity;
  const m = n.replace(/r\$/g, "").match(/(\d+(?:[.,]\d+)?)\s*(mil|k)?/);
  if (!m) return null;
  let v = Number(m[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (m[2] || v < 100) v *= 1000;
  return v > 0 ? v : null;
}
function respondeEscolha(texto){
  if (querCancelar(texto)){ mem.fluxo = null; salva(); return { texto: "Tudo bem! Se quiser, veja todos os iPhones no catálogo.", acoes: [{ id: "atalho", atalho: "iphones", rotulo: "Ver iPhones" }] }; }
  const k = mem.fluxo.passo, n = semAcento(texto);
  if (k === "orcamento"){
    const v = orcamentoDe(texto);
    if (v === null) return { texto: "Me diga um valor aproximado (por exemplo: até 6 mil) ou escolha uma opção.", acoes: PASSOS_ESCOLHA[0].opcoes.map((o) => responde(o)).concat([CANCELAR]) };
    mem.escolha.orcamento = v === Infinity ? "sem" : v;
  } else if (k === "uso") mem.escolha.uso = /foto|video|camera/.test(n) ? "fotos" : /jogo|desempenho|game|rapido/.test(n) ? "desempenho" : "dia";
  else mem.escolha.prioridade = /camera|foto/.test(n) ? "camera" : /bateria/.test(n) ? "bateria" : /grande|maior/.test(n) ? "tela" : /compact|pequen|menor/.test(n) ? "compacto" : "camera";
  salva();
  return proximaDaEscolha();
}
function specDe(p, re){ const s = (p.specs || []).find((x) => re.test(x[0])); return s ? String(s[1]) : ""; }
function recomenda(){
  mem.fluxo = null; salva();
  const e = mem.escolha, max = e.orcamento === "sem" ? Infinity : Number(e.orcamento) || Infinity;
  const todos = catalogo().filter((p) => p.cat === "iphone").map((p) => {
    const tela = specDe(p, /^tela/i).match(/(\d+[,.]\d+)\s*polegadas/);
    const pol = tela ? parseFloat(tela[1].replace(",", ".")) : 0;
    const chip = Number((specDe(p, /chip/i).match(/A(\d+)/) || [])[1] || 0);
    const tres = /tr[eê]s/i.test(specDe(p, /c[aâ]meras? traseira/i));
    return { p, v: menorPreco(p), pol, chip, tres };
  });
  const dentro = todos.filter((x) => (max === Infinity ? true : x.v && x.v <= max));
  const foraSemPreco = max !== Infinity && todos.some((x) => !x.v);
  const pontos = (x) => {
    let s = 0;
    if (e.uso === "fotos" || e.prioridade === "camera") s += x.tres ? 3 : 0;
    if (e.uso === "desempenho") s += x.chip / 10;
    if (e.prioridade === "tela" || e.prioridade === "bateria") s += x.pol >= 6.5 ? 3 : 0;
    if (e.prioridade === "compacto") s += x.pol && x.pol <= 6.3 ? 3 : 0;
    if (e.uso === "dia" && x.v) s += 1;
    return s;
  };
  dentro.sort((a, b) => pontos(b) - pontos(a) || b.chip - a.chip || (e.uso === "dia" ? (a.v || 1e9) - (b.v || 1e9) : (b.v || 0) - (a.v || 0)));
  const top = dentro.slice(0, 3);
  if (!top.length) return { texto: "Nesse orçamento não encontrei iPhone com preço no site." + (foraSemPreco ? " Alguns modelos estão com preço sob consulta." : "") +
      " A equipe pode indicar opções no WhatsApp.", acoes: [acaoZap("escolha", "Pedir indicação no WhatsApp"), { id: "atalho", atalho: "iphones", rotulo: "Ver iPhones" }] };
  const linhas = top.map((x) => "• " + resumoProduto(x.p) + "." + (x.pol ? " Tela de " + String(x.pol).replace(".", ",") + " polegadas." : "") + (x.p.txt ? " " + frase(x.p.txt) : ""));
  let t = "Pelo que você me disse, estes modelos do catálogo combinam com você:\n" + linhas.join("\n");
  if (e.prioridade === "bateria") t += "\n\nPara bateria, escolhi os de tela maior. A duração de cada um a equipe confirma no WhatsApp.";
  if (foraSemPreco) t += "\n\nAlguns modelos estão com preço sob consulta e ficaram de fora; a equipe informa no WhatsApp.";
  return { texto: t, acoes: top.map((x) => ({ id: "produto", produto: x.p.id })).concat([acaoZap("escolha", "Falar com a loja")]), gesto: "present" };
}

function continuaFluxo(texto){
  if (!mem.fluxo) return null;
  /* pergunta sobre outro assunto no meio do fluxo: pausa o fluxo e responde */
  const n = semAcento(texto);
  if (!querCancelar(texto) && /(onde fica|endereco|horario de|agend|whats|atendente|quanto custa|preco d)/.test(n) && !/^\d/.test(n)){ mem.fluxo = null; salva(); return null; }
  if (mem.fluxo.tipo === "troca" && mem.troca) return respondeTroca(texto);
  if (mem.fluxo.tipo === "escolha" && mem.escolha) return respondeEscolha(texto);
  mem.fluxo = null; salva();
  return null;
}

/* ======================= intenções que sempre respondem aqui (com ou sem IA) ======================= */
const RE_INJECAO = /\b(ignore|ignora|ignorar|esque[cç]a|desconsidere|disregard|forget|bypass)\b.{0,40}\b(instru|regra|diretriz|prompt|rules|instructions|sistema|system)|\bsystem\s*prompt\b|\bprompt\s+(do|de)\s+sistema\b|\b(chave|key|token|senha|segredo|secret)\b.{0,25}\b(api|anthropic|openai|ia|servidor|sistema)\b|\bapi\s*key\b|vari[aá]ve(l|is)\s+de\s+ambiente|AI_API_KEY|MAPS_[A-Z_]*KEY|service_?role|\bjailbreak\b|\b(modo|mode)\s+(desenvolvedor|developer|debug|admin)\b/i;
const querTroca = (n) => /(troc|usad[oa]|\bentrada\b|abat|parte do pagamento)/.test(n) ||
  /\b(aceitam|pegam|aceita|pega)\b.{0,25}\b(meu|minha|celular|iphone|aparelho|telefone)/.test(n) ||
  (/(bateria|saude)/.test(n) && /(aceit|pega|troc|avali)/.test(n)) || /quanto (vale|paga|pagam|da)\b.{0,20}\b(meu|minha)/.test(n);
const RE_NAVEGACAO = /^(oi|ola|opa|bom dia|boa tarde|boa noite|obrigad|valeu)|(falar|conversar)\s+com|\batendente\b|\bhumano\b|whats|agend|marcar\s+(um\s+|uma\s+)?(horario|atendimento|visita)|onde fica|endereco|localiza|como chego/;
const querEntrega = (n) => /\b(entreg\w*|frete|delivery|motoboy)\b/.test(n);
const querEscolher = (n) => /\b(qual|que)\s+(e\s+|eh\s+)?(o\s+)?(melhor|iphone\s+(devo|compro|comprar|escolho|escolher|vale|voce indica|vc indica))|\bme\s+(indica|indique|recomenda|recomende)\b|(ajuda|ajude|ajudar)\b.{0,15}\bescolher|nao sei qual (iphone|comprar|escolher)/.test(n);
function decideLocal(texto){
  const r = continuaFluxo(texto);
  if (r) return r;
  if (mem.pendente){ const x = respondePendente(texto); if (x) return x; }
  if (RE_INJECAO.test(texto)) return { texto: MSG_RECUSA };
  const n = semAcento(texto);
  if (/^(oi|ola|opa|bom dia|boa tarde|boa noite|e ai|eai|hey)\b/.test(n) && n.length < 24) return { texto: "Olá! Como posso ajudar? Os atalhos abaixo levam direto ao que você precisa." };
  if (/^(obrigad|valeu|brigad|show|perfeito|otimo|beleza)/.test(n) && n.length < 40) return { texto: "Por nada! Se precisar, é só chamar.", gesto: "success" };
  if (querTroca(n)) return comecaTroca(texto);
  if (querEscolher(n)) return comecaEscolha();
  if (/(agend|marcar\s+(um\s+|uma\s+)?(horario|atendimento|visita|hora)|reservar\s+(um\s+)?horario)/.test(n)) return ATALHOS.agendar();
  if (querEntrega(n)) return ATALHOS.entrega(n);
  if (/(endereco|onde fica|onde voces|onde e a loja|localiza|como chego|chegar na loja|rota|mapa)/.test(n)) return ATALHOS.localizacao();
  if (/(falar|conversar)\s+com\s+(alguem|um atendente|uma pessoa|atendente|humano|vendedor|a loja|voces|a equipe|gente)|\batendente\b|\bhumano\b|whats/.test(n)) return ATALHOS.whatsapp();
  return null;
}

/* ======================= cérebro local (sem IA): catálogo + perguntas frequentes ======================= */
function cerebroLocal(texto){
  const r = decideLocal(texto);
  if (r) return r;
  const n = semAcento(texto);
  if (/(horario|que horas|abre|fecha|aberto|aberta)/.test(n)) return horario();
  if (/(pagamento|pagar|pix|cartao|parcel|juros|boleto)/.test(n)){ const t = faq(/formas de pagamento/i); if (t) return { texto: t, acoes: [acaoZap("pagamento", "Tirar dúvida no WhatsApp")] }; }
  if (/(garantia|nota fiscal|\bnf\b)/.test(n)){ const t = faq(/garantia/i); if (t) return { texto: t }; }
  if (/(original|lacrad|procedencia|falsific)/.test(n)){ const t = faq(/originais/i); if (t) return { texto: t }; }
  if (/(entrega|entregam|retir|frete)/.test(n)){ const t = faq(/entregam/i); if (t) return { texto: t }; }
  const achados = buscaProdutos(texto), um = achados.length === 1 ? achados[0] : null;
  const pedeCor = /\bcor(es)?\b/.test(n) || !!corPedida(texto);
  if (pedeCor){
    const p = um || produtoDoContexto();
    if (p) return respostaCor(p, texto);
    if (achados.length > 1) return listaProdutos(achados);
    return { texto: "De qual modelo você quer saber a cor? Me diga o nome (por exemplo: iPhone 17 Pro)." };
  }
  if (/(preco|valor|quanto|custa|sai por)/.test(n)){
    const p = um || (!achados.length ? produtoDoContexto() : null);
    if (p) return precoLocal(p, texto);
    if (achados.length > 1) return listaProdutos(achados);
    if (/iphone|ipad|watch|macbook|airpods/.test(n)) return modeloFora();
    return ATALHOS.preco();
  }
  if (um) return { texto: `Sim, o ${um.nome} está no catálogo: ${resumoProduto(um).slice(um.nome.length + 2)}. ${fraseStatus(status(um, 0, 0))}` + (um.txt ? " " + frase(um.txt) : ""),
    acoes: [{ id: "produto", produto: um.id }, acaoZap("produto", "Falar com a loja")], gesto: "present" };
  if (achados.length > 1) return listaProdutos(achados);
  if (/iphone|ipad|apple watch|macbook|airpods/.test(n)) return modeloFora();
  if (/^(esse|essa|este|esta|ele|ela)\b|\b(dele|dela|desse|deste)\b/.test(n) && produtoDoContexto()) return precoLocal(produtoDoContexto(), texto);
  return naoSei();
}
function listaProdutos(l){
  return { texto: "Achei estes modelos: " + l.map(resumoProduto).join("; ") + ".", acoes: l.slice(0, 3).map((p) => ({ id: "produto", produto: p.id })), gesto: "present" };
}
function modeloFora(){
  return { texto: "Não encontrei esse modelo no catálogo do site. " + (faq(/não estiver na loja/i) || "A equipe pode verificar no WhatsApp."), acoes: [acaoZap("encomenda")] };
}

/* ======================= a IA (função do servidor), com a resposta chegando aos poucos ======================= */
function iaDisponivel(){
  const ia = CFG.ia || {};
  return ia.ligada !== false && !!ia.endpoint && !mem.ia.off && mem.ia.chamadas < MAX_IA_POR_VISITA && Date.now() >= (mem.ia.pausaAte || 0);
}
function corpoParaIA(){
  const foco = produtoDoContexto(), p = ui.produtoAberto(), e = p ? (ui.escolhaAtual(p) || {}) : {};
  return {
    mensagens: mem.msgs.slice(-HISTORICO_IA).map((m) => ({ papel: m.p === "u" ? "usuario" : "assistente", texto: m.t })),
    contexto: { productId: p ? p.id : "", productName: p ? p.nome : "", storage: e.opcao || "", selectedColor: e.cor || "", currentUrl: location.pathname },
    foco: foco && foco !== p ? foco.id : ""
  };
}
async function lerLinhas(resposta, ao){
  const leitor = resposta.body.getReader(), dec = new TextDecoder();
  let resto = "", res = { ok: false, codigo: "vazio" };
  for (;;){
    const { value, done } = await leitor.read();
    if (value) resto += dec.decode(value, { stream: true });
    let i;
    while ((i = resto.indexOf("\n")) > -1){
      const linha = resto.slice(0, i).trim(); resto = resto.slice(i + 1);
      if (!linha) continue;
      let ev; try { ev = JSON.parse(linha); } catch (_){ continue; }
      if (ev.t === "texto" && typeof ev.v === "string") ao.texto(ev.v);
      else if (ev.t === "substitui" && typeof ev.v === "string") ao.substitui(ev.v);
      else if (ev.t === "fim") res = { ok: true, acoes: Array.isArray(ev.acoes) ? ev.acoes : [] };
      else if (ev.t === "erro") res = { ok: false, codigo: String(ev.codigo || "indisponivel") };
    }
    if (done) break;
  }
  return res;
}
async function pedeIA(ao){
  mem.ia.chamadas++; salva();
  const corta = new AbortController(), relogio = setTimeout(() => corta.abort(), TEMPO_IA_MS);
  try {
    const r = await fetch(CFG.ia.endpoint, { method: "POST", credentials: "same-origin", signal: corta.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoParaIA()) });
    if (r.status === 429) return { ok: false, codigo: "limite" };
    if (r.status === 404 || r.status === 405) return { ok: false, codigo: "sem_funcao" };
    if (!r.ok || !/ndjson/.test(r.headers.get("content-type") || "") || !r.body) return { ok: false, codigo: "indisponivel" };
    return await lerLinhas(r, ao);
  } catch (_){
    return { ok: false, codigo: corta.signal.aborted ? "tempo" : "indisponivel" };
  } finally { clearTimeout(relogio); }
}
/* a IA não respondeu: por quanto tempo não tentar de novo */
function anotaFalha(codigo){
  if (/^(sem_chave|sem_funcao|chave_invalida|pedido|modelo_invalido)$/.test(codigo)) mem.ia.off = true;             /* nesta visita, só o cérebro local */
  else if (codigo === "limite") mem.ia.pausaAte = Date.now() + 60000;
  else if (++mem.ia.falhas >= 2){ mem.ia.pausaAte = Date.now() + 5 * 60000; mem.ia.falhas = 0; }
  salva();
}
function acoesDaIA(lista){
  const out = [];
  for (const a of lista || []){
    if (!a || typeof a.id !== "string") continue;
    if (a.tipo === "produto"){ if (produto(a.id)) out.push({ id: "produto", produto: a.id }); continue; }
    if (a.id === "whatsapp") out.push(acaoZap("duvida"));
    else if (a.id === "agendar") out.push(ATALHOS.agendar().acoes[0]);
    else if (a.id === "troca") out.push({ id: "atalho", atalho: "troca", rotulo: "Informar os dados do meu iPhone", primario: true });
    else if (a.id === "localizacao") out.push(...ATALHOS.localizacao().acoes);
    else if (a.id === "iphones") out.push({ id: "atalho", atalho: "iphones", rotulo: "Ver iPhones" });
    else if (a.id === "recomendar") out.push({ id: "atalho", atalho: "recomendar", rotulo: "Me ajude a escolher", primario: true });
    else if (a.id === "entrega") out.push(...ATALHOS.entrega().acoes);
  }
  return out.slice(0, 4);
}
function viaIA(pergunta){
  return ui.aoVivo((novaBolha) => {
    let b = null;
    const bolha = () => (b = b || novaBolha());
    return pedeIA({ texto: (v) => bolha().anexa(v), substitui: (v) => bolha().troca(v) }).then((res) => {
      const texto = b ? b.texto().trim() : "";
      if (res.ok && texto){
        mem.ia.falhas = 0;
        const acoes = acoesDaIA(res.acoes);
        anota("a", texto, acoes);
        return b.termina(paraTela({ texto, acoes, gesto: gestoPara(acoes) }));
      }
      /* sem IA: o cérebro local responde (e avisa uma vez por visita) */
      anotaFalha(res.ok ? "vazio" : res.codigo);
      const local = cerebroLocal(pergunta);
      let t = local.texto;
      if (!mem.ia.avisou){ mem.ia.avisou = true; t = MSG_SEM_IA + "\n\n" + t; }
      anota("a", t, local.acoes);
      bolha().troca(t);
      return b.termina(paraTela(Object.assign({}, local, { texto: t })));
    });
  });
}

/* ======================= entradas (chamadas pelo js/assistente.js) ======================= */
export function perguntar(texto, rapida){
  texto = String(texto || "").trim().slice(0, 300);
  if (!texto) return Promise.resolve();
  ui.mede("assistant_message_sent", { tipo: rapida ? "resposta" : "texto" });
  anota("u", texto);
  /* no meio da troca, "iPhone 13" é o aparelho da pessoa, não o produto que ela quer.
     "Dúvida" do resumo do WhatsApp: só pergunta de verdade (não "quero falar com alguém") */
  const n = semAcento(texto);
  if (!mem.fluxo && !querTroca(n)){
    if (!rapida && !RE_NAVEGACAO.test(n)){ mem.duvida = texto; salva(); }
    lembraProduto(texto);
  }
  const r = decideLocal(texto);
  if (r) return respondeLocal(r);
  if (externo){
    const ctx = { produto: ui.produtoAberto(), pagina: location.pathname };
    return respondeLocal(() => Promise.resolve(externo(texto, ctx, { local: (t) => paraTela(cerebroLocal(t)) }))
      .then((x) => (typeof x === "string" ? { texto: x } : { texto: x && x.texto, gesto: x && x.gesto })));
  }
  if (iaDisponivel()) return viaIA(texto);
  return respondeLocal(cerebroLocal(texto));
}
export function atalho(id, texto){
  ui.mede("assistant_message_sent", { tipo: "atalho", origem: id });
  anota("u", texto);
  mem.fluxo = null; mem.pendente = null; mem.duvida = ""; salva();
  const f = ATALHOS[id];
  return respondeLocal(f ? f() : naoSei());
}
function falaProduto(p){
  let vistos = [];
  try { vistos = String(sessionStorage.getItem(CHAVE_PRODUTOS) || "").split(",").filter(Boolean); } catch (_){ /* sem memória */ }
  if (!p || vistos.includes(p.id) || !CFG.mensagemProduto) return;
  vistos.push(p.id);
  try { sessionStorage.setItem(CHAVE_PRODUTOS, vistos.join(",")); } catch (_){ /* sem memória */ }
  fala({ texto: String(CFG.mensagemProduto).replace(/\{produto\}/g, p.nome) });
}
/* o chat abriu: mostra a conversa desta visita (ou dá olá) e fala do produto aberto */
export function aoAbrir(o){
  const p = ui.produtoAberto();
  produtoDoContexto();
  if (!mostrou){
    mostrou = true;
    if (mem.msgs.length){
      const ultima = mem.msgs.length - 1;
      ui.mostraHistorico(mem.msgs.map((m, i) => ({ eu: m.p === "u", texto: m.t,
        acoes: (m.a || []).filter((a) => i === ultima || a.id !== "responde").map(botao).filter(Boolean) })));
    } else {
      if (o && o.primeiraVez) ui.espera(700);
      fala({ texto: String(CFG.mensagemInicial || "Olá! Sou o assistente virtual da SR Phone.") });
    }
  }
  if (p) falaProduto(p);
}
export function limpar(){
  const ia = mem.ia;
  mem = nova(); mem.ia = ia;
  try { sessionStorage.removeItem(CHAVE); sessionStorage.removeItem(CHAVE_PRODUTOS); } catch (_){ /* sem memória */ }
  salva();
  mostrou = true;
  ui.limpaTela();
  fala({ texto: String(CFG.mensagemInicial || "Olá! Sou o assistente virtual da SR Phone.") });
  const p = ui.produtoAberto();
  if (p){ mem.foco = p.id; falaProduto(p); }
}
/* a calculadora de entrega terminou (evento "sr:entrega" com origem "assistente"): o assistente
   repete SÓ os números que vieram do sistema de rotas. Nada de endereço nem de ponto no mapa. */
const MSG_ENTREGA_FORA = "Esse endereço está fora da nossa área de entrega automática. A equipe da SR Phone vê a entrega com você pelo WhatsApp.";
const MSG_ENTREGA_ERRO = "Não conseguimos calcular a entrega agora. Fale com a SR Phone pelo WhatsApp.";
export function resultadoEntrega(d){
  d = d || {};
  const n = (v) => typeof v === "number" && isFinite(v) && v >= 0;
  if (d.tipo === "calculada" && n(d.valor) && n(d.distanciaKm) && n(d.duracaoMin)){
    const km = String(d.distanciaKm).replace(".", ",") + " km";
    return fala({ texto: "A rota até esse endereço possui aproximadamente " + km + ". A entrega estimada ficou em " + brl(d.valor) +
        ". O tempo estimado é de " + d.duracaoMin + " min. " + ((window.DELIVERY_CONFIG || {}).tarifasConfirmadas === true
          ? "É uma estimativa pela rota; a loja confirma na conversa."
          : "É uma estimativa pela rota, e a tabela de entrega está em confirmação: o valor final a loja combina na conversa."),
      acoes: [{ id: "entrega", rotulo: "Ver a entrega calculada", primario: true }], gesto: "success" });
  }
  if (d.tipo === "fora") return fala({ texto: MSG_ENTREGA_FORA, acoes: [acaoZap("entrega", "Consultar entrega pelo WhatsApp")], gesto: "pointing" });
  return fala({ texto: MSG_ENTREGA_ERRO, acoes: [acaoZap("entrega", "Falar com a SR Phone no WhatsApp")], gesto: "pointing" });
}
export function definirCerebro(fn){ externo = typeof fn === "function" ? fn : null; }
export function info(){
  return { mensagens: mem.msgs.length, foco: mem.foco, fluxo: mem.fluxo ? mem.fluxo.tipo : "", troca: mem.troca ? mem.troca.dados : null,
    ia: { disponivel: iaDisponivel(), desligada: mem.ia.off, chamadas: mem.ia.chamadas, avisou: mem.ia.avisou } };
}
export function iniciar(ponte){
  ui = ponte; CFG = ponte.CFG || {}; mem = carrega();
  return { perguntar, atalho, aoAbrir, limpar, definirCerebro, info, resultadoEntrega };
}
