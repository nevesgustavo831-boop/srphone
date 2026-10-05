/* SR Phone · Assistente SR Phone: o mascote no canto da tela e o chat
   ------------------------------------------------------------------
   Configuração: data/config.js > ASSISTENTE (textos, atalhos, modelo 3D e nomes das animações).
   O mascote 3D (js/mascote3d.js + Three.js) NÃO vem com a página: só é baixado depois que o
   site terminou de carregar e o navegador ficou livre, e só com WebGL. Antes disso (e sem WebGL,
   com economia de dados ou mascote minimizado) aparece a imagem parada do mascote.

   Estados do mascote (quem escolhe é o chat):
     idle      parado, respirando           thinking   preparando a resposta (três pontinhos)
     hover     o ponteiro está nele         speaking   a resposta está aparecendo
     welcome   boas-vindas (1ª abertura)    greeting   aceno ("Posso ajudar?")
     pointing  aponta para algo             present    mostra produtos ou opções
     success   joinha (WhatsApp, horário)   goodbye    tchau (fechou o chat)
     lookaround olha em volta, de vez em quando, parado
   Um estado por vez: gestos curtos passam por cima e depois voltam ao estado de base
   (idle, thinking ou speaking). Nunca dois gestos ao mesmo tempo.

   As respostas ficam em js/assistente-cerebro.js, que só é baixado quando a pessoa abre o chat
   (atalhos, troca, "qual iPhone escolher", memória da conversa e a IA do servidor).
   A chave da IA fica no servidor, nunca aqui: veja ASSISTENTE-SRPHONE-FINAL.md. */
(function(){
  "use strict";
  var CFG = (typeof ASSISTENTE !== "undefined" && ASSISTENTE) || {};
  var raiz = document.getElementById("sra");
  if (!raiz || CFG.ligado === false) return;

  var botao = document.getElementById("sra-abrir");
  var palco = document.getElementById("sra-palco");
  var imgEstatica = document.getElementById("sra-img");
  var balao = document.getElementById("sra-balao");
  var btMin = document.getElementById("sra-min");
  var btVolta = document.getElementById("sra-volta");
  var chat = document.getElementById("sra-chat");
  var msgs = document.getElementById("sra-msgs");
  var atalhosEl = document.getElementById("sra-atalhos");
  var form = document.getElementById("sra-form");
  var campo = document.getElementById("sra-texto");
  var btFechar = document.getElementById("sra-fechar");
  var btEsconder = document.getElementById("sra-esconder");
  var btLimpar = document.getElementById("sra-limpar");
  var titulo = document.getElementById("sra-titulo");

  var MQL_REDUZ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var MQL_MOVEL = window.matchMedia("(max-width: 820px)");
  var MQL_FOLHA = window.matchMedia("(max-width: 560px)");
  var MQL_FINO = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduz = MQL_REDUZ.matches;

  /* memória curta e só deste aparelho: nada vai para servidor. Sem armazenamento, segue sem lembrar */
  function le(k, sessao){ try { return (sessao ? sessionStorage : localStorage).getItem(k); } catch (_){ return null; } }
  function grava(k, v, sessao){ try { (sessao ? sessionStorage : localStorage).setItem(k, v); } catch (_){} }
  function mede(evento, dados){ if (window.medir) medir(evento, dados || {}); }
  function txt(v){ return String(v == null ? "" : v); }

  /* ---------- textos e imagem vindos da configuração ---------- */
  var NOME = txt(CFG.nome) || "Assistente SR Phone";
  if (titulo) titulo.textContent = NOME;
  var IMG = typeof caminhoSite === "function" ? caminhoSite(CFG.imagem || "") : (CFG.imagem || "");
  if (IMG){
    imgEstatica.src = IMG;
    Array.prototype.forEach.call(raiz.querySelectorAll("img[data-sra-img]"), function(i){ i.src = IMG; });
  }
  raiz.hidden = false;
  document.body.classList.add("com-sra");

  /* =================================================================
     O MASCOTE: estado de base + gesto curto + hover, e quem desenha (3D ou imagem)
     ================================================================= */
  var DURACAO = { greeting: 2600, welcome: 3200, lookaround: 3600, pointing: 2400, present: 2600, success: 1900, goodbye: 2200 };
  var Mascote = (function(){
    var base = "idle", gesto = null, hover = false, alvo = null, timer = null, desenho = null, fimGesto = [];
    function efetivo(){ return gesto || (base === "idle" && hover ? "hover" : base); }
    function aplica(){
      var e = efetivo();
      raiz.setAttribute("data-estado", e);
      if (desenho) desenho.estado(e, alvo ? { alvo: alvo } : null);
    }
    return {
      atual: efetivo,
      base: function(nome){ base = nome; aplica(); },
      gesto: function(nome, dados, depois){
        clearTimeout(timer);
        gesto = nome; alvo = (dados && dados.alvo) || null;
        aplica();
        timer = setTimeout(function(){ gesto = null; aplica(); if (depois) depois(); }, (reduz ? 0.6 : 1) * (DURACAO[nome] || 2000));
      },
      emGesto: function(){ return !!gesto; },
      /* a pessoa perguntou (ou a IA pediu outro estado): o gesto em andamento termina já */
      interrompe: function(){ if (gesto){ clearTimeout(timer); gesto = null; aplica(); } },
      hover: function(v){ if (hover !== v){ hover = v; aplica(); } },
      conecta: function(d){ desenho = d; aplica(); }
    };
  })();

  /* estados pedidos por fora (SRAssistente.estado) */
  function estado(nome, dados){
    if (nome === "idle" || nome === "thinking" || nome === "speaking"){ Mascote.interrompe(); Mascote.base(nome); }
    else if (DURACAO[nome]) Mascote.gesto(nome, dados);
    else if (nome === "hover") Mascote.hover(true);
  }

  /* direção (na tela) do mascote até um elemento: para apontar para ele */
  function direcaoPara(el){
    if (!el || !el.getBoundingClientRect) return { x: -1, y: 0.2 };
    var a = botao.getBoundingClientRect(), b = el.getBoundingClientRect();
    var ax = a.left + a.width / 2, ay = a.top + a.height * 0.45;
    var bx = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth), by = Math.min(Math.max(b.top + b.height / 2, 0), innerHeight);
    return { x: bx - ax, y: ay - by };
  }
  function aponta(el){ Mascote.gesto("pointing", { alvo: direcaoPara(el) }); }

  /* =================================================================
     3D: carrega tarde, só com WebGL; pausa quando não aparece
     ================================================================= */
  var api3D = null, carregando3D = false;
  function temWebGL(){
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (_){ return false; }
  }
  /* economia de dados, internet 2G ou aparelho com pouca memória: fica a imagem parada */
  function economia(){
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2);
  }
  function carrega3D(){
    if (api3D || carregando3D || minimizado || !mostrando()) return;
    if (!temWebGL() || economia()){ raiz.classList.add("sem-3d"); return; }
    carregando3D = true;
    import("./mascote3d.js").then(function(m){
      return m.iniciar(palco, {
        modelo: CFG.modelo3d ? (typeof caminhoSite === "function" ? caminhoSite(CFG.modelo3d) : CFG.modelo3d) : "",
        animacoes: CFG.animacoes, qualidade: MQL_MOVEL.matches ? "baixa" : "alta", reduzMovimento: reduz
      });
    }).then(function(api){
      api3D = api;
      raiz.classList.add("com-3d");
      Mascote.conecta(api);
      olharAtual();
      atualizaPausa();
    }).catch(function(){
      raiz.classList.add("sem-3d");        /* fica a imagem parada; o chat funciona igual */
    }).then(function(){ carregando3D = false; });
  }
  function atualizaPausa(){
    if (!api3D) return;
    if (minimizado || !mostrando() || document.hidden) api3D.pausar(); else api3D.retomar();
  }
  /* depois do conteúdo principal: página carregada + navegador parado + um respiro */
  function depoisDoPrincipal(fn){
    var vai = function(){ setTimeout(function(){
      if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 3000 }); else fn();
    }, 1200); };
    if (document.readyState === "complete") vai(); else window.addEventListener("load", vai, { once: true });
  }
  var liberado3D = false;
  depoisDoPrincipal(function(){ liberado3D = true; carrega3D(); });

  /* =================================================================
     ONDE O MASCOTE APARECE
     Computador: sempre, no canto de baixo à direita. Celular e tablet (até 820 px): só junto com a
     barra de atalhos (depois de rolar um pouco e fora do rodapé), logo acima dela, para nunca
     cobrir o topo nem os contatos. Com o chat ou um produto aberto, fica à vista.
     Some quando abre vídeo, foto, política ou a área do funcionário.
     ================================================================= */
  var barra = document.getElementById("barra-fixa");
  var pdpEl = document.getElementById("pdp");
  var minimizado = le("sra-minimizado") === "1";
  var aberto = false;
  function pdpAberto(){ return !!(pdpEl && !pdpEl.hidden); }
  function janelaQueEsconde(){
    return ["lb", "foto-lb", "modal", "adm", "entrega"].some(function(id){ var e = document.getElementById(id); return e && !e.hidden; });
  }
  function mostrando(){
    if (janelaQueEsconde()) return false;
    if (!MQL_MOVEL.matches || aberto || pdpAberto()) return true;
    return !!(barra && barra.classList.contains("on"));
  }
  function posiciona(){
    var ve = mostrando();
    raiz.classList.toggle("fora", !ve);
    raiz.classList.toggle("minimizado", minimizado);
    raiz.classList.toggle("com-barra", !!(barra && barra.classList.contains("on")) && !pdpAberto());
    raiz.classList.toggle("no-produto", pdpAberto());
    raiz.classList.toggle("chat-aberto", aberto);
    document.body.classList.toggle("sra-pdp", pdpAberto());
    if (!ve && aberto) fechar(false);
    if (ve && liberado3D) carrega3D();
    atualizaPausa();
    montaAtalhos();
  }
  var obs = new MutationObserver(posiciona);
  if (barra) obs.observe(barra, { attributes: true, attributeFilter: ["class"] });
  ["pdp", "lb", "foto-lb", "modal", "adm", "entrega"].forEach(function(id){
    var e = document.getElementById(id);
    if (e) obs.observe(e, { attributes: true, attributeFilter: ["hidden"] });
  });
  [MQL_MOVEL, MQL_FOLHA].forEach(function(m){ if (m.addEventListener) m.addEventListener("change", posiciona); });
  document.addEventListener("visibilitychange", atualizaPausa);
  if (MQL_REDUZ.addEventListener) MQL_REDUZ.addEventListener("change", function(e){
    reduz = e.matches; if (api3D) api3D.reduzirMovimento(reduz);
  });

  /* com o chat aberto no celular, o mascote fica em pé em cima do painel */
  var ro = typeof ResizeObserver === "function" ? new ResizeObserver(function(){
    raiz.style.setProperty("--sra-chat-h", chat.offsetHeight + "px");
  }) : null;
  if (ro) ro.observe(chat);

  /* ---------- minimizar ---------- */
  function minimiza(v){
    minimizado = v;
    grava("sra-minimizado", v ? "1" : "0");
    if (v && aberto) fechar(false);
    posiciona();
    (v ? btVolta : botao).focus({ preventScroll: true });
    mede("assistant_minimize", { modo: v ? "minimizado" : "visivel" });
  }
  btMin.addEventListener("click", function(){ minimiza(true); });
  if (btEsconder) btEsconder.addEventListener("click", function(){ minimiza(true); });
  btVolta.addEventListener("click", function(){ minimiza(false); });

  /* =================================================================
     INTERAÇÃO COM O MASCOTE: ponteiro, toque e teclado (nada depende só do hover)
     ================================================================= */
  var olhando = { x: 0, y: 0 };
  function olharAtual(){
    if (!api3D) return;
    if (aberto && !MQL_FOLHA.matches) api3D.olhar(-0.6, 0.1);   /* o painel fica à esquerda dele */
    else api3D.olhar(olhando.x, olhando.y);
  }
  botao.addEventListener("pointerenter", function(e){ if (e.pointerType === "mouse") entrou(); });
  botao.addEventListener("pointerleave", function(e){ if (e.pointerType === "mouse") saiu(); });
  botao.addEventListener("focus", function(){ if (!MQL_FOLHA.matches) entrou(); });
  botao.addEventListener("blur", saiu);
  botao.addEventListener("pointermove", function(e){
    if (e.pointerType !== "mouse") return;
    var r = botao.getBoundingClientRect();
    olhando.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    olhando.y = -((e.clientY - r.top) / r.height - 0.45) * 2;
    olharAtual();
  });
  function entrou(){
    /* a pessoa chegou: o aceno da dica ou o "olhar em volta" dão lugar ao hover */
    if (/^(greeting|lookaround)$/.test(Mascote.atual())) Mascote.interrompe();
    Mascote.hover(true);
    if (!aberto && balao) balao.hidden = false;
    if (liberado3D) carrega3D();
  }
  function saiu(){
    Mascote.hover(false);
    olhando.x = olhando.y = 0; olharAtual();
    if (balao) balao.hidden = true;
  }
  /* uma dica discreta ("Posso ajudar?", com um aceno), uma vez por visita, só no computador */
  if (balao && !MQL_MOVEL.matches && le("sra-dica", true) !== "1"){
    depoisDoPrincipal(function(){
      setTimeout(function(){
        if (aberto || minimizado || !mostrando()) return;
        grava("sra-dica", "1", true);
        balao.hidden = false;
        if (Mascote.atual() === "idle") Mascote.gesto("greeting");
        setTimeout(function(){ if (!botao.matches(":hover")) balao.hidden = true; }, 5000);
      }, 2500);
    });
  }
  /* parado há um tempo, ele olha em volta (no máximo 4 vezes por página; nunca com movimento reduzido) */
  var olhadas = 0;
  (function proximaOlhada(){
    setTimeout(function(){
      if (api3D && !reduz && !aberto && !minimizado && !document.hidden && mostrando() && Mascote.atual() === "idle"){
        olhadas++; Mascote.gesto("lookaround");
      }
      if (olhadas < 4) proximaOlhada();
    }, 25000 + Math.random() * 20000);
  })();
  botao.addEventListener("click", function(){ if (aberto) fechar(true, true); else abrir("mascote"); });

  /* =================================================================
     O CHAT
     ================================================================= */
  var focoAntes = null;
  function abrir(origem){
    if (aberto) return;
    aberto = true;
    focoAntes = document.activeElement;
    if (balao) balao.hidden = true;
    chat.hidden = false;
    botao.setAttribute("aria-expanded", "true");
    botao.setAttribute("aria-label", "Fechar o " + NOME);
    posiciona();
    raiz.style.setProperty("--sra-chat-h", chat.offsetHeight + "px");
    olharAtual();
    mede("assistant_opened", { origem: origem || "mascote" });

    var saudou = le("sra-saudou", true) === "1";
    if (!saudou){
      grava("sra-saudou", "1", true);
      Mascote.gesto("welcome");                        /* boas-vindas de cavalheiro, uma vez por visita */
    } else {
      Mascote.gesto("pointing", { alvo: direcaoPara(chat) });   /* já se conheceram: aponta para o painel */
    }
    /* o cérebro (respostas, memória e IA) chega agora; ele dá o olá ou mostra a conversa desta visita */
    cerebro().then(function(m){ m.aoAbrir({ primeiraVez: !saudou }); }, function(){
      if (!saudou) fala({ texto: txt(CFG.mensagemInicial) });
    });
    /* no celular, o teclado não abre sozinho: o foco vai para o título do painel */
    if (MQL_FINO.matches) campo.focus({ preventScroll: true }); else titulo.focus({ preventScroll: true });
  }
  /* tchau = a pessoa fechou (botão, Esc ou toque no mascote): ele se despede */
  function fechar(devolveFoco, tchau){
    if (!aberto) return;
    aberto = false;
    chat.hidden = true;
    botao.setAttribute("aria-expanded", "false");
    botao.setAttribute("aria-label", "Abrir " + NOME.replace(/^Assistente\b/, "Assistente Virtual"));
    Mascote.interrompe();
    Mascote.base("idle");
    posiciona();
    if (tchau && mostrando() && !minimizado) Mascote.gesto("goodbye");
    olharAtual();
    if (devolveFoco !== false){
      var volta = focoAntes && document.contains(focoAntes) && focoAntes !== document.body && focoAntes.offsetParent !== null ? focoAntes : botao;
      if (chat.contains(volta)) volta = botao;
      volta.focus({ preventScroll: true });
    }
  }
  btFechar.addEventListener("click", function(){ fechar(true, true); });
  botao.setAttribute("aria-label", "Abrir " + NOME.replace(/^Assistente\b/, "Assistente Virtual"));

  /* teclado dentro do painel: Esc fecha e Tab circula só por ele.
     Não deixa o evento chegar às outras janelas do site (ex.: o produto aberto atrás). */
  chat.addEventListener("keydown", function(e){
    if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); fechar(true, true); return; }
    if (e.key !== "Tab") return;
    e.stopPropagation();
    var lista = Array.prototype.filter.call(chat.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]'),
      function(x){ return x.getClientRects().length > 0; });
    if (!lista.length) return;
    var i = lista.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0){ e.preventDefault(); lista[lista.length - 1].focus(); }
    else if (!e.shiftKey && i === lista.length - 1){ e.preventDefault(); lista[0].focus(); }
  });
  botao.addEventListener("keydown", function(e){
    if (e.key === "Escape" && aberto){ e.preventDefault(); e.stopPropagation(); fechar(true, true); }
  });

  /* ---------- mensagens ----------
     Uma fila só: a mensagem da pessoa, o "pensando", a resposta (local ou da IA, chegando aos
     poucos) e os botões saem sempre na ordem. Enquanto uma resposta está a caminho, o envio
     fica em espera (o campo continua livre para escrever). */
  var fila = Promise.resolve(), ultimaResposta = null, pressa = false, ocupado = false;
  var btEnviar = form.querySelector("button[type=submit]");
  function rolaFim(){ msgs.scrollTop = msgs.scrollHeight; }
  function enfileira(fn){ var p = fila.then(fn); fila = p.catch(function(){}); return p; }
  function espera(ms){ return enfileira(function(){ return new Promise(function(ok){ setTimeout(ok, reduz || pressa ? 0 : ms); }); }); }
  function msgUsuario(texto){
    pressa = true;                 /* o que ainda estava sendo escrito termina na hora */
    return enfileira(function(){
      pressa = false;
      var d = document.createElement("div");
      d.className = "sra-msg eu";
      d.textContent = texto;
      msgs.appendChild(d);
      rolaFim();
    });
  }
  function marcaOcupado(v){
    ocupado = v;
    if (btEnviar) btEnviar.setAttribute("aria-disabled", v ? "true" : "false");
    raiz.classList.toggle("sra-ocupado", v);
  }
  /* a pessoa mandou algo (texto, atalho ou botão de resposta): mostra e espera o cérebro responder */
  function enviar(texto, responder){
    if (ocupado || !texto) return Promise.resolve();
    marcaOcupado(true);
    msgUsuario(texto);
    return Promise.resolve().then(responder).catch(function(){}).then(function(){ marcaOcupado(false); });
  }
  /* ações que vêm com a resposta: link (WhatsApp, rota), botão que mexe na página ou resposta rápida */
  function montaAcoes(caixa, acoes){
    if (!acoes || !acoes.length) return null;
    var l = document.createElement("div");
    l.className = "sra-acoes";
    acoes.forEach(function(a){
      var el;
      if (a.href){
        el = document.createElement("a");
        el.href = a.href;
        if (/^https?:/.test(a.href)){ el.target = "_blank"; el.rel = "noopener noreferrer"; }
        if (a.zap) el.setAttribute("data-zap", "assistente");
        if (a.aoClicar) el.addEventListener("click", a.aoClicar);
      } else {
        el = document.createElement("button"); el.type = "button";
        el.addEventListener("click", function(){
          if (ocupado) return;
          if (a.resposta) Array.prototype.forEach.call(l.querySelectorAll(".resposta"), function(b){ b.disabled = true; });
          a.fazer(el);
        });
      }
      el.className = "sra-acao" + (a.primario ? " primario" : "") + (a.resposta ? " resposta" : "");
      if (a.zap && typeof ZAP_SVG === "string") el.innerHTML = ZAP_SVG;
      el.appendChild(document.createTextNode(a.rotulo));
      l.appendChild(el);
    });
    caixa.appendChild(l);
    return l;
  }
  function gestoDaResposta(r, acoes){
    if (!r) return;
    if (r.gesto === "success") Mascote.gesto("success");
    else if (r.gesto === "present") Mascote.gesto("present", { alvo: direcaoPara(chat) });
    else if (r.gesto === "pointing") aponta(r.alvo || (acoes && acoes.querySelector(".primario")) || chat);
  }
  function balaoBot(){
    var d = document.createElement("div");
    d.className = "sra-msg bot";
    var visto = document.createElement("p"); visto.setAttribute("aria-hidden", "true");
    var lido = document.createElement("p"); lido.className = "sr-only";
    d.appendChild(visto); d.appendChild(lido);
    msgs.appendChild(d);
    return { caixa: d, visto: visto, lido: lido };
  }
  /* a resposta aparece aos poucos (o mascote "fala"); o leitor de tela recebe a frase inteira de uma vez */
  function escreve(r){
    ultimaResposta = r;
    return new Promise(function(fim){
      var b = balaoBot();
      Mascote.interrompe(); Mascote.base("speaking");
      var tudo = txt(r.texto), inicio = Date.now();
      var dura = Math.min(1400, 250 + tudo.length * 12);       /* pelo relógio: no máximo ~1,4 s por mensagem */
      function termina(){
        b.visto.textContent = tudo; b.lido.textContent = tudo;
        var acoes = montaAcoes(b.caixa, r.acoes);
        rolaFim();
        Mascote.base("idle");
        gestoDaResposta(r, acoes);
        if (typeof r.depois === "function") r.depois();
        fim();
      }
      if (reduz || pressa || !tudo){ termina(); return; }
      (function digita(){
        if (pressa){ termina(); return; }
        var i = Math.min(tudo.length, Math.ceil(tudo.length * (Date.now() - inicio) / dura));
        b.visto.textContent = tudo.slice(0, i);
        rolaFim();
        if (i < tudo.length) setTimeout(digita, 30); else termina();
      })();
    });
  }
  function fala(r){ return enfileira(function(){ return escreve(r); }); }
  /* pergunta → o mascote pensa (três pontinhos) → responde */
  function pergunta(resolver){
    return enfileira(function(){
      Mascote.interrompe(); Mascote.base("thinking");
      var inicio = Date.now();
      return Promise.resolve().then(resolver).then(function(r){
        var falta = Math.max(0, (reduz ? 150 : 750) - (Date.now() - inicio));
        return new Promise(function(ok){ setTimeout(function(){ ok(r); }, pressa ? 0 : falta); });
      }).then(escreve);
    });
  }
  /* resposta da IA: o mascote pensa até o primeiro pedaço chegar, fala enquanto o texto chega
     (um pouco suavizado) e, no fim, mostra os botões e volta ao normal */
  function aoVivo(produz){
    return enfileira(function(){
      Mascote.interrompe(); Mascote.base("thinking");
      return produz(function novaBolha(){
        var b = null, alvo = "", mostrado = 0, timer = 0, aoFim = null;
        function garante(){ if (!b){ b = balaoBot(); Mascote.interrompe(); Mascote.base("speaking"); } }
        function passo(){
          timer = 0;
          mostrado = (reduz || pressa) ? alvo.length : Math.min(alvo.length, mostrado + Math.max(2, Math.ceil((alvo.length - mostrado) / 6)));
          b.visto.textContent = alvo.slice(0, mostrado);
          rolaFim();
          if (mostrado < alvo.length) timer = setTimeout(passo, 30);
          else if (aoFim){ var f = aoFim; aoFim = null; f(); }
        }
        function pede(){ if (!timer) timer = setTimeout(passo, 0); }
        return {
          anexa: function(t){ garante(); alvo += txt(t); pede(); },
          troca: function(t){ garante(); alvo = txt(t); mostrado = 0; pede(); },
          texto: function(){ return alvo; },
          termina: function(r){
            garante();
            return new Promise(function(ok){
              aoFim = function(){
                alvo = alvo.trim();
                b.visto.textContent = alvo; b.lido.textContent = alvo;
                var acoes = montaAcoes(b.caixa, r && r.acoes);
                rolaFim();
                Mascote.base("idle");
                gestoDaResposta(r, acoes);
                ultimaResposta = r;
                ok();
              };
              pede();
            });
          }
        };
      });
    });
  }
  /* a conversa desta visita (depois de recarregar ou trocar de página): aparece de uma vez */
  function mostraHistorico(lista){
    msgs.setAttribute("aria-live", "off");
    lista.forEach(function(m){
      var d = document.createElement("div");
      d.className = "sra-msg " + (m.eu ? "eu" : "bot") + " sra-antiga";
      if (m.eu) d.textContent = m.texto;
      else { var p = document.createElement("p"); p.textContent = m.texto; d.appendChild(p); montaAcoes(d, m.acoes); }
      msgs.appendChild(d);
    });
    rolaFim();
    setTimeout(function(){ msgs.setAttribute("aria-live", "polite"); }, 50);
  }

  /* =================================================================
     O CÉREBRO: js/assistente-cerebro.js, baixado só quando a pessoa abre o chat
     ================================================================= */
  function produtoAberto(){ return (pdpAberto() && typeof pdpAtual !== "undefined" && pdpAtual) ? pdpAtual : null; }
  function escolhaAtual(p){
    if (typeof escolhaDe === "function" && typeof pdpCap !== "undefined") return escolhaDe(p, pdpCap, pdpCor);
    return { opcao: "", cor: "", preco: null, pix: null };
  }
  function fechaProdutoSeAberto(){ if (pdpAberto() && typeof fechaPdp === "function") fechaPdp(); }
  function vaiPara(id, depois){
    fechaProdutoSeAberto();
    var alvo = document.getElementById(id);
    if (!alvo) return;
    if (MQL_FOLHA.matches) fechar(false);                   /* no celular o painel sai da frente */
    alvo.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "start" });
    setTimeout(function(){ if (depois) depois(alvo); if (aberto) aponta(alvo); }, reduz ? 50 : 650);
  }
  var PONTE = {
    CFG: CFG,
    fala: fala, pergunta: pergunta, aoVivo: aoVivo, espera: espera, enviar: enviar, mostraHistorico: mostraHistorico,
    limpaTela: function(){ msgs.textContent = ""; },
    produtoAberto: produtoAberto, escolhaAtual: escolhaAtual,
    vaiPara: vaiPara, fechaProduto: fechaProdutoSeAberto, fechar: function(){ fechar(false); },
    aponta: aponta, gesto: function(n, dados){ Mascote.gesto(n, dados); },
    folha: function(){ return MQL_FOLHA.matches; }, reduz: function(){ return reduz; }, aberto: function(){ return aberto; },
    mede: mede
  };
  var cerebroMod = null, carregandoCerebro = null;
  function cerebro(){
    if (!carregandoCerebro) carregandoCerebro = import("./assistente-cerebro.js").then(function(m){ cerebroMod = m.iniciar(PONTE); return cerebroMod; });
    carregandoCerebro.catch(function(){ carregandoCerebro = null; });     /* falhou (sem internet): tenta de novo na próxima */
    return carregandoCerebro;
  }
  /* sem o cérebro (não carregou): manda a pessoa para a equipe, com a pergunta escrita */
  function semCerebro(pergunta){
    var msg = "Olá, vim pelo site da SR Phone. " + (pergunta ? "Dúvida: " + txt(pergunta).slice(0, 200) : "Gostaria de tirar uma dúvida.");
    return fala({ texto: "Não consegui carregar as respostas agora. A equipe da SR Phone responde no WhatsApp, e a sua pergunta já vai escrita.",
      acoes: [{ rotulo: "Continuar no WhatsApp", href: typeof zap === "function" ? zap(msg) : "#", zap: true, primario: true }] });
  }

  /* ---------- atalhos: os gerais, ou os do produto quando há um produto aberto ---------- */
  var atalhosDe = null;
  function montaAtalhos(){
    var lista = pdpAberto() && CFG.atalhosProduto && CFG.atalhosProduto.length ? CFG.atalhosProduto : (CFG.atalhos || []);
    var chave = lista.map(function(a){ return a && a.id; }).join(",");
    if (chave === atalhosDe) return;
    atalhosDe = chave;
    atalhosEl.textContent = "";
    lista.forEach(function(a){
      if (!a || !a.id || !a.texto) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "sra-atalho"; b.textContent = a.texto;
      b.setAttribute("data-atalho", a.id);
      b.addEventListener("click", function(){
        enviar(a.texto, function(){ return cerebro().then(function(m){ return m.atalho(a.id, a.texto); }, function(){ return semCerebro(a.texto); }); });
      });
      atalhosEl.appendChild(b);
    });
  }

  form.addEventListener("submit", function(e){
    e.preventDefault();
    var t = campo.value.trim().slice(0, 300);
    if (!t || ocupado) return;
    campo.value = "";
    enviar(t, function(){ return cerebro().then(function(m){ return m.perguntar(t); }, function(){ return semCerebro(t); }); });
  });
  if (btLimpar) btLimpar.addEventListener("click", function(){
    if (ocupado) return;
    cerebro().then(function(m){ m.limpar(); titulo.focus({ preventScroll: true }); }, function(){ msgs.textContent = ""; });
  });

  /* =================================================================
     SUCESSO: o mascote faz joinha quando algo se conclui
     ================================================================= */
  document.addEventListener("click", function(e){
    var a = e.target.closest ? e.target.closest('a[href*="wa.me"]') : null;
    if (!a || a.getAttribute("aria-disabled") === "true" || !mostrando() || minimizado) return;
    setTimeout(function(){ Mascote.gesto("success"); }, 150);
  }, true);
  var agStatus = document.getElementById("ag-status");
  if (agStatus) new MutationObserver(function(){
    if (agStatus.classList.contains("ok") && !agStatus.hidden) Mascote.gesto("success");
  }).observe(agStatus, { attributes: true, attributeFilter: ["class", "hidden"] });

  posiciona();

  /* =================================================================
     ENTREGA: o assistente abriu a calculadora (js/entrega.js). Quando ela calcula, o assistente
     repete os números que vieram do sistema de rotas; quando ela fecha, o chat volta a aparecer.
     ================================================================= */
  var entregaPendente = false, entregaEl = document.getElementById("entrega");
  window.addEventListener("sr:entrega", function(e){
    var d = e.detail || {};
    if (d.origem !== "assistente") return;
    entregaPendente = true;
    cerebro().then(function(m){ m.resultadoEntrega(d); }, function(){ /* sem cérebro: a própria calculadora já mostrou tudo */ });
  });
  if (entregaEl) new MutationObserver(function(){
    if (!entregaEl.hidden || !entregaPendente) return;
    entregaPendente = false;
    if (!minimizado) abrir("entrega");
  }).observe(entregaEl, { attributes: true, attributeFilter: ["hidden"] });

  /* =================================================================
     PARA O SITE, OUTRAS INTEGRAÇÕES E OS TESTES
     ================================================================= */
  window.SRAssistente = {
    abrir: function(){ if (minimizado) minimiza(false); abrir("api"); },
    fechar: function(){ fechar(true); },
    estado: estado,                              /* "idle", "thinking", "speaking", "success", "pointing", "present"... */
    apontarPara: function(el){ aponta(typeof el === "string" ? document.querySelector(el) : el); },
    falar: function(texto, acoes){ return fala({ texto: txt(texto), acoes: acoes }); },
    /* troca a IA do servidor por outra fn(pergunta, contexto, { local }) → texto ou { texto, gesto } (ou uma Promise disso) */
    definirCerebro: function(fn){ return cerebro().then(function(m){ m.definirCerebro(fn); }); },
    limpar: function(){ return cerebro().then(function(m){ m.limpar(); }); },
    contexto: function(){ var p = produtoAberto(); return { produto: p ? { id: p.id, nome: p.nome } : null, pagina: location.pathname }; },
    info: function(){
      return { estado: Mascote.atual(), aberto: aberto, minimizado: minimizado, visivel: mostrando(), ocupado: ocupado,
        tresD: api3D ? api3D.info() : null, carregando3D: carregando3D, liberado3D: liberado3D,
        conversa: cerebroMod ? cerebroMod.info() : null };
    }
  };
})();
