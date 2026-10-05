/* SR Phone · WhatsApp: número central (STORE_CONFIG.whatsapp), mensagens prontas e o aviso depois de abrir */

/* texto seguro para a mensagem: nunca "undefined", "null", "NaN" ou "[object Object]" */
function textoLimpo(v){
  if (v === undefined || v === null || typeof v === "object" || typeof v === "function") return "";
  if (typeof v === "number" && !isFinite(v)) return "";
  var t = String(v).replace(/\s+/g, " ").trim();
  return /^(undefined|null|nan|\[object object\])$/i.test(t) ? "" : t;
}
/* última barreira antes de abrir o WhatsApp: tira qualquer resto de campo vazio */
function mensagemSegura(msg){
  return textoLimpo(String(msg == null ? "" : msg)
    .replace(/\[object Object\]|\bundefined\b|\bNaN\b|\bnull\b/g, "")
    .replace(/\(\s*\)/g, "").replace(/\s+([,.!?])/g, "$1").replace(/([,.])\1+/g, "$1"));
}

/* link do WhatsApp com a mensagem já escrita. Só dígitos no número, texto codificado.
   numero é opcional: sem ele, vale o WhatsApp da loja. O wa.me abre o aplicativo no
   celular e o WhatsApp Web no computador. */
function zap(msg, numero){
  var num = String(numero || STORE_CONFIG.whatsapp || "").replace(/\D/g, "");
  return "https://wa.me/" + num + "?text=" + encodeURIComponent(mensagemSegura(msg));
}
/* mensagem em várias linhas (ex.: pedido de entrega): cada linha passa pela mesma limpeza e as
   quebras de linha ficam. Linha "" vira uma linha em branco. */
function zapLinhas(linhas, numero){
  var num = String(numero || STORE_CONFIG.whatsapp || "").replace(/\D/g, "");
  var txt = linhas.map(function(l){ return l === "" ? "" : mensagemSegura(l); }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return "https://wa.me/" + num + "?text=" + encodeURIComponent(txt);
}
function temWhatsapp(){ return String(STORE_CONFIG.whatsapp || "").replace(/\D/g, "").length >= 10; }

/* MENSAGENS PRONTAS: uma para cada ação. Campo vazio fica de fora da frase. */
var MOEDA_ZAP = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
function valorZap(v){ return MOEDA_ZAP.format(v).replace(/ /g, " "); }
var MENSAGENS = {
  geral:        "Olá! Vim pelo site da SR Phone e gostaria de tirar uma dúvida.",
  troca:        "Olá! Gostaria de fazer uma avaliação do meu aparelho como parte do pagamento.",
  assistencia:  "Olá! Gostaria de solicitar atendimento para assistência técnica.",
  agendamento:  "Olá! Gostaria de agendar um atendimento na SR Phone."
};
/* "iPhone 17 Pro 512 GB na cor Prateado" */
function nomeEscolha(p, escolha){
  escolha = escolha || {};
  var cor = textoLimpo(escolha.cor);
  return [textoLimpo(p && p.nome), textoLimpo(escolha.opcao)].filter(Boolean).join(" ") + (cor ? " na cor " + cor : "");
}
/* produto: "Olá! Tenho interesse no iPhone 17 Pro 512 GB na cor Prateado anunciado na SR Phone." */
function mensagemProduto(p, escolha){
  escolha = escolha || {};
  var msg = "Olá! Tenho interesse no " + nomeEscolha(p, escolha) + " anunciado na SR Phone.";
  var preco = Number(escolha.preco), pix = Number(escolha.pix);
  if (preco > 0){
    msg += " Vi o valor de " + valorZap(preco) + " no site.";
    if (pix > 0) msg += " Também vi a opção de " + valorZap(pix) + " no Pix.";
    msg += " Pode confirmar a disponibilidade?";
  } else {
    msg += " Pode me informar o valor e a disponibilidade?";
  }
  return msg;
}
/* troca a partir de um produto: o aparelho que a pessoa quer e o iPhone que ela tem */
function mensagemTroca(p, escolha, entrada, detalhes){
  var ent = textoLimpo(entrada), det = textoLimpo(detalhes);
  return MENSAGENS.troca + " Tenho interesse no " + nomeEscolha(p, escolha) + " anunciado na SR Phone" +
    (ent ? " e tenho um " + ent + (det ? " (" + det + ")" : "") + " para dar de entrada" : "") + ". Quanto fica a diferença?";
}

/* ---------- aviso honesto depois de abrir o WhatsApp + medição do clique ---------- */
(function(){
  var aviso = document.getElementById("aviso-zap");
  var txt = document.getElementById("aviso-txt");
  var t = null;
  function mostra(tipo){
    if (tipo === "agendamento"){
      txt.textContent = "Ela só chega quando você tocar em enviar. O horário ainda não está reservado. A loja confirma pelo WhatsApp, e é a confirmação dela que vale.";
    } else if (tipo === "troca"){
      txt.textContent = "Ela só chega quando você tocar em enviar. O valor da troca é uma estimativa: o número final sai depois que a loja vê o aparelho.";
    } else {
      txt.textContent = "Ela só chega quando você tocar em enviar. Depois disso a loja responde dentro do horário de atendimento.";
    }
    aviso.hidden = false;
    requestAnimationFrame(function(){ aviso.classList.add("on"); });
    clearTimeout(t); t = setTimeout(fecha, 9000);
  }
  function fecha(){
    aviso.classList.remove("on");
    clearTimeout(t);
    setTimeout(function(){ aviso.hidden = true; }, 320);
  }
  document.getElementById("aviso-x").addEventListener("click", fecha);
  document.addEventListener("click", function(e){
    var a = e.target.closest ? e.target.closest('a[href*="wa.me"]') : null;
    if (!a) return;
    /* botão com o formulário incompleto: não abre o WhatsApp (o próprio formulário mostra o que falta) */
    if (a.getAttribute("aria-disabled") === "true"){ e.preventDefault(); return; }
    var origem = a.dataset.zap || a.id || "link";
    var tipo = a.id === "ag-zap" ? "agendamento"
             : (a.id === "zap-troca" || a.id === "pdp-zap-troca") ? "troca"
             : a.dataset.zap === "assistencia" ? "assistencia" : "geral";
    if (window.medir){
      if (/^zap-equipe/.test(a.id)) medir("click_team_contact", { pessoa: a.dataset.pessoa || "" });
      medir("whatsapp_click", { origem: origem, tipo: tipo, item_id: a.dataset.item || "" });
    }
    mostra(tipo);
  }, true);
})();
