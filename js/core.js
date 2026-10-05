/* SR Phone · funções comuns: escapar texto, ícones e imagem que não carrega */
var ZAP_PATH = '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm4.52 12.1c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42l-.48-.01c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.12.17 1.77 2.7 4.28 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.19.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z"/>';
var ZAP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ZAP_PATH + '</svg>';
var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

/* escapa texto que vai virar HTML: nada digitado ou colado vira marcação */
function esc(v){
  return String(v == null ? "" : v)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

/* nenhuma imagem quebrada aparece na página: se o arquivo não vier, o <img> some.
   Na foto de produto (card e página do produto) entra o aviso "Imagem em atualização". */
document.addEventListener("error", function(e){
  var el = e.target;
  if (!el || el.tagName !== "IMG") return;
  el.className += " img-falhou";
  var caixa = el.closest ? el.closest(".card-img, .pdp-img") : null;
  if (!caixa || el.parentNode !== caixa || caixa.querySelector(".sem-foto")) return;
  caixa.classList.remove("com-foto", "fundo-claro", "carregando");
  caixa.classList.add("sem-img");
  var tag = caixa.querySelector(".tag-foto");
  if (tag) tag.hidden = true;
  caixa.insertAdjacentHTML("beforeend", '<div class="sem-foto' + (caixa.classList.contains("pdp-img") ? ' sem-foto-g' : '') +
    '" role="img" aria-label="Imagem em atualização"><span>Imagem em atualização</span></div>');
}, true);

/* caminho de um arquivo do site. Nas páginas próprias de produto (/produto/id/) os arquivos
   ficam dois níveis acima: o build grava isso em <meta name="sr-raiz" content="../../">. */
var RAIZ_SITE = (function(){
  var m = document.querySelector('meta[name="sr-raiz"]');
  var v = m ? String(m.getAttribute("content") || "") : "";
  return /^(\.\.\/){1,3}$/.test(v) ? v : "";
})();
function caminhoSite(src){
  src = String(src || "");
  if (!src || !RAIZ_SITE || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(src)) return src;
  return RAIZ_SITE + src;
}

/* dados da loja para textos (data/config.js): lista vazia ou campo vazio nunca vira "undefined".
   Pagamento: a única fonte é STORE_CONFIG.pagamento (cfgPagamento, em js/precos.js) */
/* formas aceitas, na ordem do rodapé: [{ nome, img, troca }] */
function formasPagamento(){
  var c = cfgPagamento(), l = [];
  if (c.aceitaPix) l.push({ nome: "Pix", img: c.logoPix || "" });
  if (c.aceitaCartao) l.push({ nome: "Cartão de crédito", img: "" });
  if (c.aceitaIphoneNaTroca) l.push({ nome: "Seu iPhone na troca", img: "", troca: true });
  return l;
}
/* bandeiras de cartão com logotipo (só no rodapé) */
function bandeirasCartao(){
  var c = cfgPagamento();
  if (!c.aceitaCartao || !Array.isArray(c.bandeiras)) return [];
  return c.bandeiras.filter(function(b){ return b && b.nome; }).map(function(b){ return { nome: String(b.nome), img: b.img || "" }; });
}
function listaPagamentos(){ return formasPagamento().map(function(f){ return f.nome; }); }
function observacaoPagamento(){ return String(cfgPagamento().observacao || "").trim(); }
/* "Pix, cartão de crédito e seu iPhone na troca" */
function juntaLista(l){
  l = l.map(function(t, i){ return i && !/^Pix\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; });
  return l.length < 2 ? (l[0] || "") : l.slice(0, -1).join(", ") + " e " + l[l.length - 1];
}
function cidadeLoja(){ return String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG && STORE_CONFIG.cidade) || "").trim(); }
function textoGarantia(){ return String((typeof STORE_CONFIG !== "undefined" && STORE_CONFIG && STORE_CONFIG.garantia) || "").trim(); }

/* ---------- janelas (produto, vídeo, foto, políticas e agenda) ----------
   Uma regra só para todas: o foco entra na janela e não escapa com Tab, Esc e
   clique fora fecham, o foco volta para o botão que abriu e a página só volta
   a rolar quando não sobra nenhuma janela aberta. */
var JANELAS = [];
function travaRolagem(){ document.body.style.overflow = JANELAS.length ? "hidden" : ""; }
function focaveis(el){
  return Array.prototype.filter.call(
    el.querySelectorAll('a[href],button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled]),summary,iframe,video[controls],[tabindex="0"]'),
    function(x){ return !x.closest("[hidden]") && x.getClientRects().length > 0; });
}
function abreJanela(el, fecha, focoInicial){
  if (!el) return;
  var ja = JANELAS.filter(function(j){ return j.el === el; })[0];
  if (!ja) JANELAS.push({ el: el, fecha: fecha, volta: document.activeElement });
  el.hidden = false;
  travaRolagem();
  var alvo = focoInicial || focaveis(el)[0];
  if (alvo && alvo.focus) alvo.focus();
}
function fechaJanela(el){
  if (!el) return;
  var j = null;
  JANELAS = JANELAS.filter(function(x){ if (x.el === el){ j = x; return false; } return true; });
  el.hidden = true;
  travaRolagem();
  if (j && j.volta && j.volta.focus && j.volta !== document.body && document.contains(j.volta)) j.volta.focus();
  else if (el.contains(document.activeElement) && document.activeElement.blur) document.activeElement.blur();
}
function janelaAberta(){ return JANELAS.length > 0; }
document.addEventListener("keydown", function(e){
  var topo = JANELAS[JANELAS.length - 1];
  if (!topo) return;
  if (e.key === "Escape"){
    e.preventDefault();
    e.stopImmediatePropagation();
    topo.fecha();
    return;
  }
  if (e.key !== "Tab") return;
  var lista = focaveis(topo.el);
  if (!lista.length){ e.preventDefault(); return; }
  var primeiro = lista[0], ultimo = lista[lista.length - 1];
  var dentro = topo.el.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === primeiro || !dentro)){ e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)){ e.preventDefault(); primeiro.focus(); }
});
