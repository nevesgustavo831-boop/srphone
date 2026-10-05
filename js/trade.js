/* ---------- montador de troca ---------- */
var selModelo = document.getElementById("f-modelo");
var selVersao = document.getElementById("f-versao");
var selEntrada = document.getElementById("f-entrada");
var selEstado = document.getElementById("f-estado");
var wrapEstado = document.getElementById("wrap-estado");
var wrapBat = document.getElementById("wrap-bateria");
var bat = document.getElementById("f-bateria");
var batNum = document.getElementById("bat-num");
var batTag = document.getElementById("bat-tag");
var batNa = document.getElementById("bat-na");
var batDica = document.getElementById("bat-dica");
var batIgnora = false;
var preview = document.getElementById("preview");
var btnTroca = document.getElementById("zap-troca");
var trocaErro = document.getElementById("troca-erro");
var batErro = document.getElementById("bat-num-erro");

/* a troca vale na compra de iPhone, então só iPhones entram aqui */
CATALOGO.filter(function(p){ return p.cat === "iphone"; }).forEach(function(p){
  var o = document.createElement("option"); o.textContent = p.nome; selModelo.appendChild(o);
});
selModelo.value = "iPhone 17";
if (!selModelo.value && selModelo.options.length) selModelo.selectedIndex = 0;

function modeloEscolhido(){ return CATALOGO.filter(function(x){ return x.nome === selModelo.value; })[0] || null; }
/* armazenamentos do modelo. Modelo sem armazenamento definido na tabela: "A confirmar" (nunca uma lista vazia) */
var SEM_VERSAO = "A confirmar no atendimento";
function preencheVersoes(){
  var p = modeloEscolhido();
  selVersao.innerHTML = "";
  var lista = p && p.opcoes.length ? p.opcoes : [SEM_VERSAO];
  lista.forEach(function(o){
    var op = document.createElement("option"); op.textContent = o; selVersao.appendChild(op);
  });
  selVersao.disabled = lista.length === 1 && lista[0] === SEM_VERSAO;
}

function valorBateria(){ return +bat.value; }
function pintaBateria(){
  var v = +bat.value;
  var f = pintaBarra(bat, wrapBat, v);
  if (document.activeElement !== batNum) batNum.value = v;
  batNum.disabled = batIgnora;
  batTag.textContent = batIgnora ? "" : f.txt;
}
function montaMensagem(){
  var versao = selVersao.value && selVersao.value !== SEM_VERSAO ? selVersao.value : "";
  var produto = (typeof nomeEscolha === "function") ? nomeEscolha({ nome: selModelo.value }, { opcao: versao })
              : selModelo.value + (versao ? " " + versao : "");
  var m;
  if (selEntrada.value){
    m = MENSAGENS.troca + " Tenho interesse no " + produto + " anunciado na SR Phone.";
    var det = selEstado.value.toLowerCase();
    if (!batIgnora){
      var vb2 = parseInt(batNum.value, 10);
      if (isNaN(vb2)) vb2 = parseInt(bat.value, 10);
      vb2 = Math.min(Math.max(vb2 || 0, 1), 100);
      det += ", bateria em " + vb2 + "%";
    }
    m += " Tenho um " + selEntrada.value + " (" + det + ") para dar de entrada. Quanto fica a diferença?";
  } else {
    m = "Olá! Tenho interesse no " + produto + " anunciado na SR Phone. Qual o valor e as formas de pagamento?";
  }
  return m;
}
/* validação: mensagem no próprio formulário, nunca alert() */
function mostraErro(el, campo, texto){
  if (el){ el.textContent = texto || ""; el.hidden = !texto; }
  if (campo){ if (texto) campo.setAttribute("aria-invalid", "true"); else campo.removeAttribute("aria-invalid"); }
}
function erroBateria(){
  if (!selEntrada.value || batIgnora || batNum.value === "") return "";
  var v = Number(batNum.value);
  return (!isFinite(v) || v < 1 || v > 100 || Math.round(v) !== v) ? "A saúde da bateria vai de 1% a 100%. Se não souber, toque em \"Não sei\"." : "";
}
function erroTroca(){
  if (!selModelo.value) return "Escolha o iPhone que você quer.";
  if (!selVersao.value && !selVersao.disabled) return "Escolha a versão do iPhone.";
  return "";
}
function atualiza(){
  var temEntrada = !!selEntrada.value;
  wrapEstado.hidden = !temEntrada;
  wrapBat.hidden = !temEntrada;
  batDica.hidden = selEntrada.value.indexOf("iPhone") !== 0;
  pintaBateria();
  var msg = montaMensagem();
  preview.innerHTML = '<b>Sua mensagem</b>' + esc(msg);
  btnTroca.href = zap(msg);
  var falta = erroTroca();
  btnTroca.setAttribute("aria-disabled", falta ? "true" : "false");
  if (!falta) mostraErro(trocaErro, null, "");
  var eBat = erroBateria();
  mostraErro(batErro, batNum, eBat);
  if (eBat) batTag.textContent = "";
}
/* medição: começo da simulação (uma vez) e envio para o WhatsApp */
var trocaComecou = false;
function comecaTroca(){
  if (trocaComecou) return;
  trocaComecou = true;
  if (window.medir) medir("trade_in_start", { origem: "simulador" });
}
(function(){
  var caixa = selModelo.closest ? selModelo.closest(".form") : null;
  if (!caixa) return;
  caixa.addEventListener("change", comecaTroca);
  caixa.addEventListener("input", comecaTroca);
  batNa.addEventListener("click", comecaTroca);
})();
btnTroca.addEventListener("click", function(e){
  var falta = erroTroca();
  if (falta){
    e.preventDefault();
    mostraErro(trocaErro, null, falta);
    (selModelo.value ? selVersao : selModelo).focus();
    return;
  }
  if (window.medir) medir("trade_in_submit", { origem: "simulador", item_name: selModelo.value, modo: selEntrada.value ? "com_entrada" : "sem_entrada" });
});
bat.addEventListener("input", function(){
  if (batIgnora){
    batIgnora = false;
    batNa.setAttribute("aria-pressed","false");
    bat.disabled = false;
  }
  atualiza();
});
batNum.addEventListener("input", function(){
  var v = parseInt(batNum.value, 10);
  if (isNaN(v)) return;
  v = Math.min(Math.max(v, 1), 100);
  bat.value = v;
  if (batIgnora){ batIgnora = false; batNa.setAttribute("aria-pressed","false"); bat.disabled = false; }
  atualiza();
});
batNum.addEventListener("blur", function(){
  var v = parseInt(batNum.value, 10);
  if (isNaN(v) || v < 1) v = +bat.value;
  batNum.value = Math.min(Math.max(v, 1), 100);
  atualiza();
});
batNa.addEventListener("click", function(){
  batIgnora = !batIgnora;
  batNa.setAttribute("aria-pressed", batIgnora ? "true" : "false");
  bat.disabled = batIgnora;
  atualiza();
});
selModelo.addEventListener("change", function(){ preencheVersoes(); atualiza(); });
[selVersao, selEntrada, selEstado].forEach(function(el){ el.addEventListener("change", atualiza); });
selEntrada.value = "iPhone 13";
preencheVersoes();
atualiza();
