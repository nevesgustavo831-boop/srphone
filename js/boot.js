/* SR Phone · roda antes da primeira pintura (fica no <head>, é bem pequeno):
   marca que o JavaScript está ativo e se o aparelho aceita movimento, e liga as fontes do Google
   sem travar a página. */
(function(){
  var d = document.documentElement;
  d.classList.add("js");
  var reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduz) d.classList.add("js-motion");
})();
/* fontes do Google sem travar a primeira pintura: o <link data-fontes media="print"> passa a valer
   quando termina de carregar. Se o Google demorar ou estiver bloqueado, ficam as fontes do aparelho
   (as alternativas escritas no CSS) e nada espera por ele. Sem JavaScript vale o <noscript>. */
(function(){
  function liga(){
    var l = document.querySelectorAll("link[data-fontes]");
    for (var i = 0; i < l.length; i++) (function(el){
      if (el.sheet) el.media = "all";
      else el.addEventListener("load", function(){ el.media = "all"; });
    })(l[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", liga); else liga();
})();
