/* SR Phone · botão "Calcular entrega"
   ------------------------------------------------------------------
   Este arquivo é pequeno e vem com a página: só liga os botões com data-entrega e, no primeiro
   toque, baixa a calculadora (js/entrega-app.js, com o mapa). Nada de mapa, localização ou rede
   antes de a pessoa tocar no botão.
   Configuração: data/config.js > DELIVERY_CONFIG. Uso por outras partes do site (ex.: o assistente):
     SREntrega.abrir({ modo: "localizacao" | "endereco", origem: "assistente", produto: "iPhone 17 256 GB" })
   Quando a entrega é calculada, o site recebe o evento "sr:entrega" (window) com a distância,
   o tempo e o valor que vieram do sistema de rotas (nunca coordenadas nem endereço). */
(function(){
  "use strict";
  var CFG = (typeof DELIVERY_CONFIG !== "undefined" && DELIVERY_CONFIG) || {};
  var raiz = document.getElementById("entrega");
  var botoes = document.querySelectorAll("[data-entrega]");
  if (!raiz || CFG.ligada === false){
    Array.prototype.forEach.call(botoes, function(b){ b.hidden = true; });
    return;
  }
  var app = null, carregando = null;
  function carrega(){
    if (!carregando) carregando = import("./entrega-app.js").then(function(m){ app = m.iniciar({ raiz: raiz, CFG: CFG }); return app; });
    carregando.catch(function(){ carregando = null; });          /* sem internet: tenta de novo no próximo toque */
    return carregando;
  }
  function abrir(opcoes){
    return carrega().then(function(a){ a.abrir(opcoes || {}); }, function(){
      /* não deu nem para baixar a calculadora: o WhatsApp da loja resolve */
      if (typeof zap === "function") window.open(zap("Olá, vim pelo site da SR Phone. Gostaria de calcular a entrega do meu pedido."), "_blank", "noopener");
    });
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest ? e.target.closest("[data-entrega]") : null;
    if (!b) return;
    e.preventDefault();
    abrir({ origem: b.getAttribute("data-entrega") || "site" });
  });
  window.SREntrega = {
    abrir: abrir,
    info: function(){ return app ? app.info() : { carregado: false }; }
  };
})();
