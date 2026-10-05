/* SR Phone · unboxing em 3D (estrutura pronta para o futuro)
   ------------------------------------------------------------------
   Este arquivo NÃO é baixado com o site. Ele só carrega quando o produto tem
   "unboxing3d" (data/products.js) e a pessoa toca em "Abrir a caixa em 3D".
   Sem esse campo, o botão nem aparece. Nada é fingido.

   O que o arquivo .glb precisa ter: a caixa do aparelho com animações NOMEADAS,
   uma para cada etapa, nesta ordem (os nomes podem mudar em ETAPAS abaixo):
     1. "girar"    a caixa gira e mostra os lados
     2. "lacre"    o lacre é puxado
     3. "tampa"    a tampa abre
     4. "revelar"  o iPhone aparece
   Cada toque em "Próxima etapa" toca a animação seguinte uma vez.
   O visualizador é o mesmo do "Explorar em 3D" (model-viewer), carregado sob demanda.
   Dica de peso: mantenha o .glb abaixo de ~5 MB (texturas em WebP/KTX2, malha simplificada). */
(function(){
  var ETAPAS = [
    { anim: "girar",   texto: "Girar a caixa" },
    { anim: "lacre",   texto: "Puxar o lacre" },
    { anim: "tampa",   texto: "Abrir a tampa" },
    { anim: "revelar", texto: "Revelar o aparelho" }
  ];

  function abrir(p, caixa){
    if (!p || !p.unboxing3d || !caixa || typeof carregaMV !== "function") return;
    fechar(caixa);
    var cx = document.createElement("div");
    cx.className = "pdp-mv"; cx.id = "pdp-unbox";
    cx.innerHTML = '<div class="pdp-mv-msg" id="unbox-msg">Carregando a caixa em 3D…</div>' +
      '<div class="unbox-barra">' +
        '<button type="button" class="btn btn-primary btn-sm" id="unbox-prox" disabled>' + ETAPAS[0].texto + '</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="unbox-fechar">Fechar</button>' +
      '</div>';
    caixa.appendChild(cx);
    var msg = cx.querySelector("#unbox-msg"), prox = cx.querySelector("#unbox-prox");
    cx.querySelector("#unbox-fechar").addEventListener("click", function(){ fechar(caixa); });

    carregaMV(function(ok){
      if (!document.getElementById("pdp-unbox")) return;
      if (!ok){ msg.textContent = "Não foi possível carregar o 3D agora. As fotos continuam disponíveis."; return; }
      var mv = document.createElement("model-viewer");
      mv.setAttribute("src", p.unboxing3d);
      mv.setAttribute("alt", "Caixa do " + p.nome + " em 3D");
      mv.setAttribute("camera-controls", "");
      mv.setAttribute("touch-action", "pan-y");
      mv.setAttribute("shadow-intensity", "1");
      mv.setAttribute("environment-image", "neutral");
      cx.insertBefore(mv, cx.firstChild);
      var etapa = 0;
      mv.addEventListener("load", function(){
        msg.remove();
        var existentes = mv.availableAnimations || [];
        var faltando = ETAPAS.filter(function(e){ return existentes.indexOf(e.anim) === -1; });
        if (faltando.length && window.console) console.warn("unboxing3d sem as animações: " + faltando.map(function(e){ return e.anim; }).join(", "));
        prox.disabled = false;
      });
      mv.addEventListener("error", function(){ msg.textContent = "O arquivo 3D da caixa não abriu."; });
      mv.addEventListener("finished", function(){
        prox.disabled = false;
        prox.textContent = etapa < ETAPAS.length ? ETAPAS[etapa].texto : "Ver de novo";
      });
      prox.addEventListener("click", function(){
        if (etapa >= ETAPAS.length){ etapa = 0; mv.currentTime = 0; }
        var e = ETAPAS[etapa++];
        prox.disabled = true;
        mv.animationName = e.anim;
        mv.currentTime = 0;
        mv.play({ repetitions: 1 });
      });
    });
  }
  function fechar(caixa){
    var v = (caixa || document).querySelector("#pdp-unbox");
    if (v) v.remove();
  }
  window.SRUnboxing = { abrir: abrir, fechar: fechar, etapas: ETAPAS };
})();
