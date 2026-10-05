/* SR Phone · movimento discreto: entradas das seções, o lacre interativo e
   respeito a quem pede menos movimento no aparelho (prefers-reduced-motion).
   Nada fica animando sem parar: cada elemento entra uma vez e para. */
(function(){
  "use strict";
  var html = document.documentElement;
  var MQL_REDUZ = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- altura do cabeçalho (usada para o topo caber na primeira tela) ---------- */
  var topbarEl = document.getElementById("topbar");
  function medeCabecalho(){ html.style.setProperty("--hdr", topbarEl.offsetHeight + "px"); }
  medeCabecalho();
  window.addEventListener("resize", medeCabecalho);

  /* ---------- aba escondida: pausa o que estiver animando ---------- */
  document.addEventListener("visibilitychange", function(){
    document.body.classList.toggle("paused", document.hidden);
  });


  /* ---------- títulos das seções: palavras sobem por trás de uma máscara ---------- */
  document.querySelectorAll(".sec-head h2").forEach(function(h){
    if (h.children.length) return;
    var palavras = h.textContent.trim().split(/\s+/);
    h.innerHTML = palavras.map(function(p, i){
      return '<span class="w"><span class="wi" style="--i:' + i + '">' + esc(p) + '</span></span>';
    }).join(" ");
  });

  /* ================= ENTRADAS DAS SEÇÕES ================= */
  var alvos = [];
  var comMovimento = "IntersectionObserver" in window && html.classList.contains("js-motion");
  var io = comMovimento ? new IntersectionObserver(function(ents){
    ents.forEach(function(en){
      if (!en.isIntersecting) return;
      en.target.classList.add("in");
      io.unobserve(en.target);
    });
  }, { threshold: 0, rootMargin: "0px 0px -8% 0px" }) : null;
  function observa(el){
    alvos.push(el);
    if (io) io.observe(el); else el.classList.add("in");
  }
  function marca(seletor, passo){
    document.querySelectorAll(seletor).forEach(function(el){
      if (el.classList.contains("rv")) return;
      var irmaos = Array.prototype.filter.call(el.parentNode.children, function(c){ return c.matches(seletor); });
      el.classList.add("rv");
      el.style.setProperty("--d", Math.min(irmaos.indexOf(el), 7) * passo);
      observa(el);
    });
  }
  marca(".perk", 90);
  marca(".roda > li", 70);
  marca(".why-card", 80);
  marca(".faq .qa", 55);
  marca(".reels > *", 90);
  marca(".fotos-loja > *", 110);
  marca(".perfil-foto", 0);
  marca(".av-resumo", 0);
  marca(".av-lista > *", 90);
  marca(".perfil-info > *", 90);
  marca(".ccard", 80);
  marca(".lacre-palco", 0);
  marca(".lacre-lista", 0);
  document.querySelectorAll(".sec-head").forEach(observa);

  /* cards do catálogo: cada um entra quando aparece, inclusive depois de filtrar */
  var grade = document.getElementById("grid");
  function preparaCards(){
    var colunas = Math.max(1, Math.round(grade.clientWidth / 280));
    Array.prototype.forEach.call(grade.children, function(c, i){
      if (c.classList.contains("rv")) return;
      c.classList.add("rv");
      c.style.setProperty("--d", (i % colunas) * 70);
      observa(c);
    });
  }
  preparaCards();
  new MutationObserver(preparaCards).observe(grade, { childList: true });

  function revelaTudo(){ alvos.forEach(function(el){ el.classList.add("in"); }); }

  /* ---------- topo: a câmera desce até o palco e as luzes acendem ----------
     Começa sozinha quando a imagem está visível na tela (e a aba aberta), em ~4 s.
     A rolagem também move a câmera: vale o que estiver mais adiantado. Nada prende a tela. */
  (function(){
    var moldura = document.querySelector(".hero-arte");
    if (!moldura || !html.classList.contains("js-motion") || MQL_REDUZ.matches) return;
    var DUR = 4000, ESPERA = 400;
    var auto = 0, rolagem = 0, mostrado = -1, t0 = 0, rodando = false, iniciou = false, raf = null;
    var inicioRolagem = null;
    function ease(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function pinta(){
      var v = Math.max(auto, rolagem);
      if (Math.abs(v - mostrado) < 0.002) return;       /* só escreve quando muda */
      mostrado = v;
      moldura.style.setProperty("--cam", v.toFixed(3));
    }
    function quadro(agora){
      raf = null;
      if (rodando){
        if (!t0) t0 = agora;
        var t = Math.min(1, Math.max(0, (agora - t0 - ESPERA) / DUR));
        auto = ease(t);
        if (t >= 1) rodando = false;
      }
      pinta();
      if (rodando) raf = requestAnimationFrame(quadro);
    }
    function comeca(){
      if (iniciou || document.hidden) return;
      iniciou = true; rodando = true; t0 = 0;
      if (!raf) raf = requestAnimationFrame(quadro);
    }
    function aoRolar(){
      if (inicioRolagem === null){
        var r = moldura.getBoundingClientRect();
        inicioRolagem = Math.max(0, window.scrollY + r.top - window.innerHeight);
      }
      rolagem = Math.min(1, Math.max(0, (window.scrollY - inicioRolagem) / (window.innerHeight * 0.9)));
      if (rolagem > 0) comeca();
      if (!raf) raf = requestAnimationFrame(quadro);
    }
    window.addEventListener("scroll", aoRolar, { passive: true });
    if ("IntersectionObserver" in window){
      var io2 = new IntersectionObserver(function(e){
        if (e[0].isIntersecting){ comeca(); if (iniciou) io2.disconnect(); }
      }, { threshold: 0.35 });
      io2.observe(moldura);
      document.addEventListener("visibilitychange", function(){
        if (!document.hidden && !iniciou){ var r = moldura.getBoundingClientRect(); if (r.top < window.innerHeight && r.bottom > 0) comeca(); }
      });
    } else comeca();
    MQL_REDUZ.addEventListener && MQL_REDUZ.addEventListener("change", function(e){ if (e.matches){ auto = 1; rodando = false; pinta(); } });
  })();

  /* ---------- se o arquivo do catálogo não carregou, a tela diz isso (sem ficar só no esqueleto) ---------- */
  if (!window.CATALOGO_PRONTO){
    var g = document.getElementById("grid");
    if (g){
      g.setAttribute("aria-busy", "false");
      g.innerHTML = '<div class="cat-erro" role="alert"><b>Não foi possível carregar os produtos agora.</b>' +
        '<span>Verifique a conexão e tente de novo.</span><div class="cat-erro-acoes">' +
        '<button class="btn btn-primary btn-sm" type="button" id="cat-tentar2">Tentar novamente</button></div></div>';
      document.getElementById("cat-tentar2").addEventListener("click", function(){ location.reload(); });
    }
  }

  /* ================= O LACRE: unboxing 3D =================
     A caixa 3D (js/unboxing3d.js + Three.js) só é baixada quando a pessoa toca em
     "Abrir a caixa em 3D". Antes disso a seção mostra uma imagem estática leve.
     Sem WebGL, ou se o 3D não carregar, fica a imagem e os botões do catálogo. */
  var lacre = document.getElementById("lacre");
  var aberto = false;
  function marcaLacreAberto(){
    aberto = true;
    lacre.classList.add("aberto");
    setTimeout(function(){ lacre.classList.add("assentado"); }, 1700);
  }
  (function(){
    var palco = document.getElementById("unbox-palco");
    if (!lacre || !palco) return;
    var botao = document.getElementById("unbox-iniciar");
    var dica = document.getElementById("unbox-dica");
    var acoes = document.getElementById("unbox-acoes");
    var passoBt = document.getElementById("unbox-passo");
    var recomecarBt = document.getElementById("unbox-recomecar");
    var fim = document.getElementById("unbox-fim");
    var espera = document.getElementById("unbox-carregando");
    var capa = document.getElementById("unbox-poster");
    var zapFim = document.getElementById("unbox-zap");
    var api = null, carregando = false;
    if (zapFim && typeof zap === "function") zapFim.href = zap("Olá! Abri a caixa em 3D no site da SR Phone e quero conhecer os iPhones disponíveis.");
    if (capa) capa.addEventListener("error", function(){ capa.hidden = true; });

    function temWebGL(){
      try {
        var c = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
      } catch (_){ return false; }
    }
    /* versão estática: a imagem da caixa, o aviso e os botões para o catálogo */
    function indisponivel(){
      if (api){ try { api.destruir(); } catch (_){} api = null; }
      carregando = false;
      palco.dataset.estado = "indisponivel";
      palco.classList.remove("vivo");
      botao.hidden = true; espera.hidden = true; acoes.hidden = true;
      dica.textContent = "Experiência 3D indisponível no momento. Os iPhones estão no catálogo logo acima.";
      fim.hidden = false;
      if (!aberto) marcaLacreAberto();
    }
    var ROTULO = { SEALED: "Retirar o lacre", PEELING: "Retirar o lacre", UNSEALED: "Abrir a tampa", OPENING: "Abrir a tampa" };
    function aoEstado(e){
      passoBt.textContent = ROTULO[e] || "";
      passoBt.hidden = e === "OPENED";
      passoBt.disabled = e === "PEELING" || e === "OPENING";
      recomecarBt.hidden = e !== "OPENED";
      if (e === "SEALED"){ fim.hidden = true; aberto = false; lacre.classList.remove("aberto", "assentado"); }
    }
    function comeca(){
      if (api || carregando) return;
      if (!temWebGL()) return indisponivel();
      carregando = true;
      botao.hidden = true; espera.hidden = false;
      palco.dataset.estado = "carregando";
      dica.textContent = "Preparando a caixa…";
      var limite = setTimeout(indisponivel, 20000);
      import("./unboxing3d.js").then(function(m){   /* caminho relativo a este arquivo (js/) */
        clearTimeout(limite);
        if (palco.dataset.estado === "indisponivel") return;
        api = m.iniciar(palco, {
          reduzMovimento: MQL_REDUZ.matches,
          audio: typeof ENABLE_UNBOXING_AUDIO !== "undefined" && ENABLE_UNBOXING_AUDIO === true,
          aoEstado: aoEstado,
          aoDica: function(t){ dica.textContent = t; },
          aoLacre: marcaLacreAberto,
          aoTerminar: function(){
            fim.hidden = false;
            if (window.medir) medir("complete_unboxing", { origem: "secao" });
          },
          aoErro: indisponivel
        });
        window.SRUnbox3D = api;
        carregando = false;
        espera.hidden = true; acoes.hidden = false;
        palco.classList.add("vivo");
        aoEstado(api.estado());
        if (window.medir) medir("open_unboxing", { origem: "secao" });
      }).catch(function(e){
        clearTimeout(limite);
        indisponivel();
      });
    }
    botao.addEventListener("click", comeca);
    passoBt.addEventListener("click", function(){ if (api) api.passo(); });
    recomecarBt.addEventListener("click", function(){ if (api){ fim.hidden = true; api.recomecar(); } });
    /* ao sair da página, devolve a memória de vídeo (não quando o navegador guarda a página) */
    window.addEventListener("pagehide", function(e){ if (api && !e.persisted){ api.destruir(); api = null; } });
  })();

  /* ================= MOVIMENTO REDUZIDO, AO VIVO NOS DOIS SENTIDOS ================= */
  /* com movimento reduzido tudo já aparece no lugar; a caixa 3D continua disponível, com menos movimento */
  function fixaEstadosFinais(){ revelaTudo(); }
  function soltaEstadosFinais(){}
  if (MQL_REDUZ.matches) fixaEstadosFinais();
  var aoMudarMovimento = function(e){
    if (e.matches) fixaEstadosFinais();
    else soltaEstadosFinais();
  };
  if (MQL_REDUZ.addEventListener) MQL_REDUZ.addEventListener("change", aoMudarMovimento);
  else if (MQL_REDUZ.addListener) MQL_REDUZ.addListener(aoMudarMovimento);
})();
