/* SR Phone · Área da Equipe (/funcionario/)
   ---------------------------------------------------------------------------
   Login de verdade pelo Supabase Auth (e-mail e senha da conta criada pela administração,
   com verificação em duas etapas quando ligada). Esta tela só MOSTRA o que o banco deixa:
   quem decide se a pessoa é da equipe é o banco (tabela funcionarios, ativo = true, e MFA
   quando exigido), em TODA chamada. Descobrir o endereço /funcionario/ não dá acesso a nada.

   Sessão: só os tokens legítimos do Supabase Auth (access_token e refresh_token), guardados no
   sessionStorage desta aba (some ao fechar o navegador). Nada de chave secreta, senha ou token
   próprio. "Sair" encerra a sessão no Supabase e apaga tudo daqui. Sessão vencida: volta ao login.

   Segurança da tela: nada que veio do banco ou da pessoa vira HTML (só textContent). */
(function(){
  "use strict";

  /* ---------------- configuração ---------------- */
  function $(id){ return document.getElementById(id); }
  function tipoChave(k){
    k = String(k || "").trim();
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(k)) return "publishable";
    if (/^sb_secret_/.test(k)) return "secreta";
    var p = k.split(".");
    if (p.length === 3){
      try {
        var b = p[1].replace(/-/g, "+").replace(/_/g, "/");
        var d = JSON.parse(atob(b + "===".slice((b.length + 3) % 4)));
        if (d && d.role === "anon") return "anon";
        if (d && d.role === "service_role") return "secreta";
      } catch(_){}
    }
    return "invalida";
  }
  var AG = (typeof SUPABASE_URL === "string" && SUPABASE_URL.trim() && typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY.trim())
    ? { url: SUPABASE_URL.trim().replace(/\/+$/, ""), chave: SUPABASE_ANON_KEY.trim(), tipo: tipoChave(SUPABASE_ANON_KEY) } : null;
  /* só a chave PÚBLICA serve aqui; chave secreta no site = agenda desligada (e o build acusa) */
  if (AG && (!/^https:\/\//.test(AG.url) || (AG.tipo !== "publishable" && AG.tipo !== "anon"))) AG = null;
  var AGENDA = (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG.agenda) || { horarios: [], horariosSabado: [], diasFechados: [0] };
  var ROBO_CHAVE = (typeof TURNSTILE_SITE_KEY === "string" && /^[0-9A-Za-z_-]{10,80}$/.test(TURNSTILE_SITE_KEY.trim())) ? TURNSTILE_SITE_KEY.trim() : "";
  var CHAVE_SESSAO = "srphone_equipe";

  var MOTIVOS_HORARIO = ["Almoço", "Compromisso", "Atendimento externo", "Outro"];
  var MOTIVOS_DIA = ["Feriado", "Loja fechada", "Evento", "Folga", "Outro"];
  var MSG_ALTERADO = "Este horário acabou de ser alterado por outro funcionário. Atualizamos a agenda para você.";
  var MSG_GERAL = "Não foi possível concluir agora. Tente de novo.";
  var MSG_REDE = "Sem conexão com a agenda. Confira a internet e tente de novo.";

  /* ---------------- datas: sempre no relógio da loja (Brasília) ---------------- */
  var TZ = "America/Sao_Paulo";
  var SEM = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  var SEM_CURTO = ["dom","seg","ter","qua","qui","sex","sáb"];
  var MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  function dois(n){ return (n < 10 ? "0" : "") + n; }
  function hojeSP(){ return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  function agoraSP(){ return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); }
  function base(iso){ return new Date(iso + "T12:00:00Z"); }
  function isoDe(d){ return d.getUTCFullYear() + "-" + dois(d.getUTCMonth() + 1) + "-" + dois(d.getUTCDate()); }
  function somaDias(iso, n){ return isoDe(new Date(base(iso).getTime() + n * 86400000)); }
  function br(iso){ var p = String(iso).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function rotuloDia(iso){
    var h = hojeSP();
    if (iso === h) return "Hoje";
    if (iso === somaDias(h, 1)) return "Amanhã";
    return SEM_CURTO[base(iso).getUTCDay()] + ", " + br(iso);
  }
  function tituloDia(iso){
    var d = base(iso), t = SEM[d.getUTCDay()];
    return t.charAt(0).toUpperCase() + t.slice(1) + ", " + br(iso) + (iso === hojeSP() ? " · hoje" : "");
  }
  function gradeDoDia(iso){
    var d = base(iso).getUTCDay();
    if ((AGENDA.diasFechados || []).indexOf(d) > -1) return [];
    return (d === 6 && AGENDA.horariosSabado && AGENDA.horariosSabado.length) ? AGENDA.horariosSabado : (AGENDA.horarios || []);
  }

  /* ---------------- montar elementos sem HTML ---------------- */
  function cria(tag, classe, texto){
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
  }
  function botao(texto, classe, aoClicar){
    var b = cria("button", "eq-btn " + (classe || "eq-btn-sec"), texto);
    b.type = "button";
    b.addEventListener("click", aoClicar);
    return b;
  }
  function limpa(el){ while (el.firstChild) el.removeChild(el.firstChild); }

  /* ---------------- telas ---------------- */
  var TELAS = ["eq-carregando", "eq-sem-config", "eq-login", "eq-recuperar", "eq-nova-senha", "eq-mfa", "eq-sem-acesso", "eq-painel"];
  function mostra(id){
    TELAS.forEach(function(t){ var e = $(t); if (e) e.hidden = t !== id; });
    $("eq-usuario").hidden = id !== "eq-painel";
    if (id !== "eq-painel") paraRelogios();
    var foco = { "eq-login": "eq-email", "eq-recuperar": "eq-rec-email", "eq-nova-senha": "eq-nova1", "eq-mfa": "eq-mfa-codigo" }[id];
    if (foco) setTimeout(function(){ var f = $(foco); if (f && !f.closest("[hidden]")) f.focus(); }, 30);
  }
  function erroEm(id, texto){ var e = $(id); if (!e) return; e.textContent = texto || ""; e.hidden = !texto; }
  function carregandoErro(texto){
    var c = $("eq-carregando");
    limpa(c);
    c.appendChild(cria("span", "", texto));
    c.appendChild(botao("Tentar de novo", "eq-btn-sec", function(){ location.reload(); }));
    mostra("eq-carregando");
  }

  /* ---------------- conversa com o Supabase (prazo de 15 s) ---------------- */
  function chamar(caminho, opcoes, token){
    opcoes = opcoes || {};
    var h = { "apikey": AG.chave, "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    else if (AG.tipo === "anon") h.Authorization = "Bearer " + AG.chave;
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var relogio = ctl ? setTimeout(function(){ ctl.abort(); }, 15000) : null;
    return fetch(AG.url + caminho, { method: opcoes.method || "GET", headers: h, signal: ctl ? ctl.signal : undefined,
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined, cache: "no-store", credentials: "omit" })
      .then(function(r){
        clearTimeout(relogio);
        return r.text().then(function(t){
          var j = null;
          try { j = t ? JSON.parse(t) : null; } catch(_){ j = null; }
          if (!r.ok) throw { http: r.status, dado: j, codigo: codigoDe(j) };
          return j;
        });
      }, function(){ clearTimeout(relogio); throw { rede: true }; });
  }
  /* o código curto do erro (as funções do banco devolvem 'horario_alterado', 'sem_permissao'...) */
  function codigoDe(j){
    if (!j || typeof j !== "object") return "";
    var m = String(j.message || j.error_code || j.code || j.error || "");
    return /^[a-z_]{3,40}$/.test(m) ? m : String(j.error_code || j.code || "");
  }

  /* ---------------- sessão (tokens do Supabase Auth) ---------------- */
  var sessao = null;
  function cargaDoToken(t){
    try {
      var b = String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(escape(atob(b + "===".slice((b.length + 3) % 4)))));
    } catch(_){ return {}; }
  }
  function guarda(r){
    if (!r || !r.access_token || !r.refresh_token) return false;
    var c = cargaDoToken(r.access_token);
    sessao = { access_token: r.access_token, refresh_token: r.refresh_token,
               expira: Number(c.exp) || Math.floor(Date.now() / 1000) + Number(r.expires_in || 3600),
               aal: c.aal || "aal1", email: (r.user && r.user.email) || c.email || "" };
    try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao)); } catch(_){}
    return true;
  }
  function recupera(){
    try { var t = sessionStorage.getItem(CHAVE_SESSAO); sessao = t ? JSON.parse(t) : null; } catch(_){ sessao = null; }
    if (sessao && (!sessao.access_token || !sessao.refresh_token)) sessao = null;
  }
  function esquece(){
    sessao = null;
    try { sessionStorage.removeItem(CHAVE_SESSAO); } catch(_){}
    /* restos do painel antigo (#/agenda) também saem */
    try { sessionStorage.removeItem("srphone_adm"); } catch(_){}
  }
  var renovando = null;
  function renova(){
    if (!sessao) return Promise.reject({ http: 401 });
    if (renovando) return renovando;
    renovando = chamar("/auth/v1/token?grant_type=refresh_token", { method: "POST", corpo: { refresh_token: sessao.refresh_token } })
      .then(function(j){ if (!guarda(j)) throw { http: 401 }; return sessao.access_token; })
      .then(function(t){ renovando = null; return t; }, function(e){ renovando = null; e = e || {}; e.renovacao = true; throw e; });
    return renovando;
  }
  function tokenValido(){
    if (!sessao) return Promise.reject({ http: 401 });
    if (sessao.expira - Date.now() / 1000 > 60) return Promise.resolve(sessao.access_token);
    return renova();
  }
  /* uma chamada com o login da pessoa. Token vencido: renova uma vez; não deu, volta ao login */
  function fimDaSessao(e){
    if (e && !e.rede && (e.renovacao || e.http === 401)){ expirou(); return { http: 401, sessaoAcabou: true }; }
    return e;
  }
  function comLogin(fn){
    return tokenValido().then(fn, function(e){ throw fimDaSessao(e); }).catch(function(e){
      if (e && e.sessaoAcabou) throw e;
      if (e && e.http === 401 && sessao) return renova().then(fn).catch(function(e2){ throw fimDaSessao(e2); });
      throw e;
    });
  }
  function expirou(){
    esquece();
    mostra("eq-login");
    erroEm("eq-erro-login", "Sua sessão terminou. Entre de novo.");
  }
  function rpc(nome, corpo){
    return comLogin(function(t){ return chamar("/rest/v1/rpc/" + nome, { method: "POST", corpo: corpo || {} }, t); });
  }
  /* sair: encerra a sessão no Supabase (o refresh_token deixa de valer) e apaga tudo daqui */
  function sair(texto){
    var tk = sessao && sessao.access_token;
    esquece();
    fechaDialogos();
    mostra("eq-login");
    $("eq-senha").value = "";
    erroEm("eq-erro-login", "");
    erroEm("eq-ok-login", texto || "Você saiu da conta.");
    if (tk) chamar("/auth/v1/logout?scope=local", { method: "POST" }, tk).catch(function(){});
  }

  /* ---------------- anti-robô no login (só se a loja configurou o Turnstile) ----------------
     Com "Captcha protection" ligado no Supabase Auth, o login e o "esqueci minha senha" só passam
     com o token; o Supabase confere no servidor dele. Sem a proteção ligada lá, o token é ignorado. */
  var robo = { carregou: false, ids: {}, tokens: {} };
  function preparaRobo(caixaId){
    if (!ROBO_CHAVE) return;
    var caixa = $(caixaId);
    caixa.hidden = false;
    function desenha(){
      if (robo.ids[caixaId] !== undefined || !window.turnstile) return;
      robo.ids[caixaId] = window.turnstile.render(caixa, { sitekey: ROBO_CHAVE, action: "login", theme: "dark", language: "pt-br", size: "flexible",
        callback: function(t){ robo.tokens[caixaId] = t; }, "expired-callback": function(){ robo.tokens[caixaId] = ""; } });
    }
    if (window.turnstile) return desenha();
    if (robo.carregou) return;
    robo.carregou = true;
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = function(){ desenha(); if (caixaId !== "eq-robo-login" && !$("eq-login").hidden) preparaRobo("eq-robo-login"); };
    s.onerror = function(){ caixa.hidden = true; };
    document.head.appendChild(s);
  }
  function tokenRobo(caixaId){ return robo.tokens[caixaId] || ""; }
  function recomecaRobo(caixaId){
    robo.tokens[caixaId] = "";
    if (window.turnstile && robo.ids[caixaId] !== undefined) try { window.turnstile.reset(robo.ids[caixaId]); } catch(_){}
  }

  /* ---------------- login ---------------- */
  var falhas = 0, travadoAte = 0;
  function mensagemLogin(e){
    var c = (e && e.codigo) || "";
    if (e && e.rede) return MSG_REDE;
    if (/captcha/.test(c) || /captcha/i.test(JSON.stringify((e && e.dado) || {}))) return "Confirme a verificação de segurança e tente de novo.";
    if (e && e.http === 429 || c === "over_request_rate_limit") return "Muitas tentativas. Espere alguns minutos e tente de novo.";
    if (c === "email_not_confirmed") return "Este e-mail ainda não foi confirmado. Fale com a administração da loja.";
    if (c === "user_banned") return "Esta conta está bloqueada. Fale com a administração da loja.";
    if (e && e.http === 400) return "E-mail ou senha não conferem.";
    return MSG_GERAL;
  }
  $("eq-form-login").addEventListener("submit", function(ev){
    ev.preventDefault();
    var b = $("eq-entrar");
    if (b.disabled) return;
    erroEm("eq-erro-login", ""); erroEm("eq-ok-login", "");
    if (Date.now() < travadoAte){ erroEm("eq-erro-login", "Muitas tentativas. Espere um minuto e tente de novo."); return; }
    var email = $("eq-email").value.trim(), senha = $("eq-senha").value;
    if (!email || !senha){ erroEm("eq-erro-login", "Preencha o e-mail e a senha."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ erroEm("eq-erro-login", "Confira o e-mail."); return; }
    b.disabled = true; b.textContent = "Entrando…";
    var corpo = { email: email, password: senha };
    if (tokenRobo("eq-robo-login")) corpo.gotrue_meta_security = { captcha_token: tokenRobo("eq-robo-login") };
    chamar("/auth/v1/token?grant_type=password", { method: "POST", corpo: corpo })
      .then(function(j){
        if (!guarda(j)) throw { http: 500 };
        falhas = 0;
        $("eq-senha").value = "";
        return verificaAcesso();
      })
      .catch(function(e){
        if (e && e.http === 400 && ++falhas >= 5){ travadoAte = Date.now() + 60000; falhas = 0; }
        erroEm("eq-erro-login", mensagemLogin(e));
      })
      .then(function(){ b.disabled = false; b.textContent = "Entrar"; recomecaRobo("eq-robo-login"); });
  });

  /* ---------------- esqueci minha senha ---------------- */
  $("eq-esqueci").addEventListener("click", function(){
    $("eq-rec-email").value = $("eq-email").value.trim();
    erroEm("eq-erro-recuperar", ""); erroEm("eq-ok-recuperar", "");
    mostra("eq-recuperar");
    preparaRobo("eq-robo-recuperar");
  });
  $("eq-rec-voltar").addEventListener("click", function(){ mostra("eq-login"); });
  $("eq-form-recuperar").addEventListener("submit", function(ev){
    ev.preventDefault();
    var b = $("eq-rec-enviar"), email = $("eq-rec-email").value.trim();
    if (b.disabled) return;
    erroEm("eq-erro-recuperar", ""); erroEm("eq-ok-recuperar", "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ erroEm("eq-erro-recuperar", "Confira o e-mail."); return; }
    b.disabled = true;
    var corpo = { email: email };
    if (tokenRobo("eq-robo-recuperar")) corpo.gotrue_meta_security = { captcha_token: tokenRobo("eq-robo-recuperar") };
    var volta = encodeURIComponent(location.origin + "/funcionario/");
    chamar("/auth/v1/recover?redirect_to=" + volta, { method: "POST", corpo: corpo })
      .then(function(){ return true; }, function(e){ if (e && (e.rede || e.http === 429 || /captcha/.test(e.codigo || ""))) throw e; return true; })
      .then(function(){
        /* a mesma resposta exista ou não a conta: ninguém descobre quais e-mails são da equipe */
        erroEm("eq-ok-recuperar", "Se este e-mail for de uma conta da equipe, o link para criar a senha nova chega em alguns minutos. Confira também a caixa de spam.");
      }, function(e){ erroEm("eq-erro-recuperar", mensagemLogin(e)); })
      .then(function(){ b.disabled = false; recomecaRobo("eq-robo-recuperar"); });
  });

  /* ---------------- link do e-mail (convite ou senha nova): #access_token=...&type=... ---------------- */
  var trocandoSenha = false;     /* senha nova pedida antes do código de 6 dígitos (conta com MFA) */
  function linkDoEmail(){
    var h = location.hash || "";
    if (h.length < 2) return false;
    var p = {};
    h.slice(1).split("&").forEach(function(par){
      var i = par.indexOf("=");
      if (i > 0) try { p[decodeURIComponent(par.slice(0, i))] = decodeURIComponent(par.slice(i + 1).replace(/\+/g, " ")); } catch(_){}
    });
    if (!p.access_token && !p.error_code && !p.error) return false;
    /* o token sai da barra de endereço na hora (não fica no histórico nem em print de tela) */
    history.replaceState(null, "", location.pathname + location.search);
    if (p.error || p.error_code){
      mostra("eq-login");
      erroEm("eq-erro-login", "Esse link expirou ou já foi usado. Peça outro em \"Esqueci minha senha\".");
      return true;
    }
    if ((p.type === "recovery" || p.type === "invite") && guarda(p)){
      trocandoSenha = true;
      mostra("eq-nova-senha");
      return true;
    }
    if (guarda(p)){ verificaAcesso(); return true; }
    return false;
  }
  $("eq-form-nova").addEventListener("submit", function(ev){
    ev.preventDefault();
    var a = $("eq-nova1").value, b2 = $("eq-nova2").value, b = $("eq-nova-salvar");
    if (b.disabled) return;
    erroEm("eq-erro-nova", "");
    if (a.length < 8 || !/[A-Za-z]/.test(a) || !/\d/.test(a)){ erroEm("eq-erro-nova", "Use pelo menos 8 caracteres, com letras e números."); return; }
    if (a !== b2){ erroEm("eq-erro-nova", "As duas senhas não são iguais."); return; }
    b.disabled = true;
    comLogin(function(t){ return chamar("/auth/v1/user", { method: "PUT", corpo: { password: a } }, t); })
      .then(function(){
        $("eq-nova1").value = ""; $("eq-nova2").value = "";
        trocandoSenha = false;
        return verificaAcesso();
      })
      .catch(function(e){
        var c = (e && e.codigo) || "";
        if (e && e.sessaoAcabou) return;
        /* conta com verificação em duas etapas: primeiro o código, depois a senha nova */
        if (c === "insufficient_aal"){ iniciaMfa(false, false); return; }
        erroEm("eq-erro-nova", c === "weak_password" ? "Senha fraca. Use pelo menos 8 caracteres, com letras e números."
          : c === "same_password" ? "A senha nova precisa ser diferente da anterior."
          : c === "insufficient_aal" ? "Confirme o código de 6 dígitos antes de trocar a senha." : (e && e.rede ? MSG_REDE : MSG_GERAL));
      })
      .then(function(){ b.disabled = false; });
  });

  /* ---------------- quem é: o banco decide (meu_acesso) ---------------- */
  var eu = { nome: "", role: "", mfa: false };
  function verificaAcesso(){
    if (!sessao){ mostra("eq-login"); return Promise.resolve(); }
    return rpc("meu_acesso").then(function(j){
      var s = j && j.situacao;
      if (s === "ok"){
        eu = { nome: String(j.nome || ""), role: String(j.role || ""), mfa: !!j.mfa };
        abrePainel();
      } else if (s === "mfa_codigo") iniciaMfa(false, false);
      else if (s === "mfa_cadastrar") iniciaMfa(true, false);
      else mostra("eq-sem-acesso");
    }).catch(function(e){
      if (e && e.sessaoAcabou) return;
      if (e && e.http === 404) carregandoErro("A agenda do servidor ainda não foi atualizada. Avise a administração (falta rodar a migração do Supabase).");
      else if (e && e.rede) carregandoErro(MSG_REDE);
      else if (e && e.http === 401){ expirou(); }
      else carregandoErro(MSG_GERAL);
    });
  }
  $("eq-sem-acesso-sair").addEventListener("click", function(){ sair(); });
  $("eq-sair").addEventListener("click", function(){ sair(); });
  $("eq-mfa-sair").addEventListener("click", function(){ sair(); });

  /* ---------------- verificação em duas etapas (MFA do Supabase Auth, TOTP) ---------------- */
  var mfa = { fator: "", voluntario: false };
  function iniciaMfa(cadastrar, voluntario){
    mfa.voluntario = !!voluntario;
    mostra("eq-mfa");
    erroEm("eq-erro-mfa", "");
    $("eq-mfa-codigo").value = "";
    $("eq-mfa-voltar").hidden = !voluntario;
    $("eq-mfa-cadastro").hidden = true;
    $("eq-mfa-pede").hidden = false;
    $("eq-mfa-ok").disabled = true;
    comLogin(function(t){ return chamar("/auth/v1/user", {}, t); }).then(function(u){
      var fatores = ((u && u.factors) || []).filter(function(f){ return f.factor_type === "totp"; });
      var pronto = fatores.filter(function(f){ return f.status === "verified"; })[0];
      if (pronto){ mfa.fator = pronto.id; $("eq-mfa-ok").disabled = false; $("eq-mfa-codigo").focus(); return; }
      /* começa um cadastro novo: apaga as tentativas que ficaram pela metade */
      return Promise.all(fatores.map(function(f){
        return comLogin(function(t){ return chamar("/auth/v1/factors/" + encodeURIComponent(f.id), { method: "DELETE" }, t); }).catch(function(){});
      })).then(function(){
        return comLogin(function(t){ return chamar("/auth/v1/factors", { method: "POST", corpo: { factor_type: "totp", friendly_name: "SR Phone", issuer: "SR Phone" } }, t); });
      }).then(function(f){
        mfa.fator = f.id;
        $("eq-mfa-qr").src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(String((f.totp && f.totp.qr_code) || ""));
        $("eq-mfa-segredo").textContent = String((f.totp && f.totp.secret) || "").replace(/(.{4})/g, "$1 ").trim();
        $("eq-mfa-cadastro").hidden = false;
        $("eq-mfa-pede").hidden = true;
        $("eq-mfa-ok").disabled = false;
      });
    }).catch(function(e){
      if (e && e.sessaoAcabou) return;
      erroEm("eq-erro-mfa", e && e.rede ? MSG_REDE : (e && e.http === 422)
        ? "A verificação em duas etapas está desligada no Supabase. Avise a administração (Authentication > Multi-Factor)." : MSG_GERAL);
    });
  }
  $("eq-form-mfa").addEventListener("submit", function(ev){
    ev.preventDefault();
    var b = $("eq-mfa-ok"), codigo = $("eq-mfa-codigo").value.replace(/\D/g, "");
    if (b.disabled || !mfa.fator) return;
    erroEm("eq-erro-mfa", "");
    if (codigo.length !== 6){ erroEm("eq-erro-mfa", "Digite os 6 números do app autenticador."); return; }
    b.disabled = true; b.textContent = "Conferindo…";
    var id = encodeURIComponent(mfa.fator);
    comLogin(function(t){ return chamar("/auth/v1/factors/" + id + "/challenge", { method: "POST", corpo: {} }, t); })
      .then(function(d){ return comLogin(function(t){ return chamar("/auth/v1/factors/" + id + "/verify", { method: "POST", corpo: { challenge_id: d.id, code: codigo } }, t); }); })
      .then(function(j){
        if (!guarda(j)) throw { http: 500 };
        $("eq-mfa-codigo").value = "";
        if (trocandoSenha){ mostra("eq-nova-senha"); return; }
        return verificaAcesso();
      })
      .catch(function(e){
        if (e && e.sessaoAcabou) return;
        erroEm("eq-erro-mfa", e && e.rede ? MSG_REDE : (e && e.http === 429) ? "Muitas tentativas. Espere um pouco e tente de novo."
          : "Código incorreto ou vencido. Confira o app e tente de novo.");
      })
      .then(function(){ b.disabled = false; b.textContent = "Confirmar"; });
  });
  $("eq-mfa-voltar").addEventListener("click", function(){ abrePainel(); });
  $("eq-ativar-mfa").addEventListener("click", function(){ iniciaMfa(true, true); });

  /* ---------------- o painel ---------------- */
  var estado = { dia: hojeSP(), mes: hojeSP().slice(0, 7), linhas: [], resumo: {}, varios: false, sel: {}, aba: "agenda", filtro: "proximos" };
  var relogios = [];
  function paraRelogios(){ relogios.forEach(clearInterval); relogios = []; }
  function abrePainel(){
    $("eq-ola").textContent = eu.nome ? "Olá, " + eu.nome.split(" ")[0] : "Olá";
    $("eq-ativar-mfa").hidden = eu.mfa;
    $("eq-testar-aviso").hidden = eu.role !== "admin";
    mostra("eq-painel");
    trocaAba(estado.aba, true);
    paraRelogios();
    /* a cada minuto: mostra o que o resto da equipe fez e os prazos dos horários segurados */
    relogios.push(setInterval(function(){
      if (document.visibilityState === "visible" && !algumDialogoAberto() && !$("eq-painel").hidden && !estado.varios) recarrega(true);
    }, 60000));
    /* a sessão é renovada antes de vencer; se não der, volta ao login */
    relogios.push(setInterval(function(){
      if (sessao && sessao.expira - Date.now() / 1000 < 300) renova().catch(function(e){ if (e && !e.rede) expirou(); });
    }, 30000));
  }
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "visible" && sessao && !$("eq-painel").hidden && !algumDialogoAberto()) recarrega(true);
  });
  function recarrega(silencioso){
    if (estado.aba === "bloqueios") return carregaBloqueios();
    return Promise.all([carregaMes(), carregaDia(silencioso), carregaPendentes()]);
  }

  /* mensagens na tela (nunca código técnico) */
  var msgRelogio = null;
  function aviso(texto, tipo){
    var m = $("eq-msg");
    m.textContent = texto;
    m.className = "eq-msg " + (tipo || "ok");
    m.hidden = false;
    clearTimeout(msgRelogio);
    msgRelogio = setTimeout(function(){ m.hidden = true; }, 8000);
  }
  function mensagemErro(e){
    if (!e) return MSG_GERAL;
    if (e.rede) return MSG_REDE;
    var c = e.codigo || e.resultado || "";
    if (/^(horario_alterado|ocupado|horario_ocupado|nao_encontrado)$/.test(c)) return MSG_ALTERADO;
    if (c === "expirado") return "O prazo desse horário segurado acabou. Atualizamos a agenda para você.";
    if (c === "dia_bloqueado") return "Este dia está bloqueado. Para mexer nos horários, desbloqueie o dia primeiro.";
    if (c === "horario_passado" || c === "data_passada") return "Esse horário já passou.";
    if (c === "fora_do_horario") return "Esse horário não está na grade da loja.";
    if (c === "loja_fechada") return "A loja não abre nesse dia.";
    if (c === "data_fora_do_periodo") return "Essa data está longe demais. Escolha uma data mais próxima.";
    if (c === "motivo_invalido") return "Escolha um motivo da lista.";
    if (c === "duracao_invalida") return "Escolha 15 minutos, 30 minutos, 1 hora ou 2 horas.";
    if (c === "hora_invalida" || c === "data_invalida") return "Confira a data e o horário.";
    if (c === "sem_permissao") return "Seu acesso mudou. Entre de novo.";
    return MSG_GERAL;
  }
  /* erro de uma ação: conflito recarrega; sem permissão confere de novo quem é */
  function falhou(e, ondeMostrar){
    if (e && e.sessaoAcabou) return;
    var texto = mensagemErro(e);
    if (ondeMostrar) erroEm(ondeMostrar, texto); else aviso(texto, "erro");
    if (e && e.codigo === "sem_permissao"){ fechaDialogos(); verificaAcesso(); return; }
    recarrega(true);
  }
  function resultadoTexto(r){ return { ok: true, codigo: r, resultado: r }; }

  /* ---------------- abas ---------------- */
  function trocaAba(aba, foco){
    estado.aba = aba;
    var ag = aba === "agenda";
    $("eq-aba-agenda").setAttribute("aria-selected", ag ? "true" : "false");
    $("eq-aba-bloqueios").setAttribute("aria-selected", ag ? "false" : "true");
    $("eq-aba-agenda").tabIndex = ag ? 0 : -1;
    $("eq-aba-bloqueios").tabIndex = ag ? -1 : 0;
    $("eq-agenda").hidden = !ag;
    $("eq-bloqueios").hidden = ag;
    if (!ag) saiDoModoVarios();
    recarrega(!foco);
  }
  $("eq-aba-agenda").addEventListener("click", function(){ trocaAba("agenda"); });
  $("eq-aba-bloqueios").addEventListener("click", function(){ trocaAba("bloqueios"); });
  $("eq-aba-agenda").parentNode.addEventListener("keydown", function(e){
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var outra = estado.aba === "agenda" ? "bloqueios" : "agenda";
    trocaAba(outra);
    $("eq-aba-" + outra).focus();
  });

  /* ---------------- calendário ---------------- */
  function carregaMes(){
    var de = estado.mes + "-01";
    var fim = isoDe(new Date(Date.UTC(Number(estado.mes.slice(0, 4)), Number(estado.mes.slice(5, 7)), 0, 12)));
    pintaMes();
    return rpc("resumo_periodo", { p_de: de, p_ate: fim }).then(function(l){
      estado.resumo = {};
      (l || []).forEach(function(r){ estado.resumo[r.data] = r; });
      pintaMes();
    }).catch(function(e){ if (!(e && e.sessaoAcabou)) pintaMes(); });
  }
  function pintaMes(){
    var a = Number(estado.mes.slice(0, 4)), m = Number(estado.mes.slice(5, 7)) - 1;
    $("eq-cal-mes").textContent = MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + " de " + a;
    var caixa = $("eq-cal-dias");
    limpa(caixa);
    var primeiro = new Date(Date.UTC(a, m, 1, 12)), dias = new Date(Date.UTC(a, m + 1, 0, 12)).getUTCDate();
    for (var v = 0; v < primeiro.getUTCDay(); v++) caixa.appendChild(cria("span", "eq-cal-vazio"));
    var hoje = hojeSP();
    for (var d = 1; d <= dias; d++){
      (function(iso){
        var r = estado.resumo[iso] || {};
        var b = cria("button", "eq-cal-dia");
        b.type = "button";
        b.dataset.iso = iso;
        b.appendChild(cria("span", "eq-cal-n", Number(iso.slice(8))));
        var marcas = cria("span", "eq-cal-marcas");
        if (r.dia_bloqueado){ b.classList.add("bloq"); marcas.appendChild(cria("i", "m-bl")); }
        if (r.pendentes > 0) marcas.appendChild(cria("i", "m-pe"));
        else if (r.agendados > 0) marcas.appendChild(cria("i", "m-ag"));
        b.appendChild(marcas);
        if (iso === hoje) b.classList.add("hoje");
        if (iso < hoje) b.classList.add("passou");
        if (!gradeDoDia(iso).length) b.classList.add("fechado");
        b.setAttribute("aria-pressed", iso === estado.dia ? "true" : "false");
        var partes = [SEM[base(iso).getUTCDay()] + ", " + Number(iso.slice(8)) + " de " + MESES[m]];
        if (r.agendados) partes.push(r.agendados + (r.agendados === 1 ? " agendamento" : " agendamentos"));
        if (r.pendentes) partes.push(r.pendentes + " a confirmar");
        if (r.dia_bloqueado) partes.push("dia bloqueado");
        b.setAttribute("aria-label", partes.join(", "));
        b.addEventListener("click", function(){ escolheDia(iso); });
        caixa.appendChild(b);
      })(estado.mes + "-" + dois(d));
    }
  }
  function escolheDia(iso){
    saiDoModoVarios();
    estado.dia = iso;
    pintaPendentes();
    if (iso.slice(0, 7) !== estado.mes){ estado.mes = iso.slice(0, 7); carregaMes(); } else pintaMes();
    carregaDia(false);
  }
  function mudaMes(n){
    var a = Number(estado.mes.slice(0, 4)), m = Number(estado.mes.slice(5, 7)) - 1 + n;
    estado.mes = isoDe(new Date(Date.UTC(a, m, 1, 12))).slice(0, 7);
    carregaMes();
  }
  $("eq-mes-ant").addEventListener("click", function(){ mudaMes(-1); });
  $("eq-mes-prox").addEventListener("click", function(){ mudaMes(1); });
  $("eq-atualizar").addEventListener("click", function(){ recarrega(false); });

  /* pedidos de clientes esperando confirmação (hoje + 60 dias) */
  var pendentes = { total: 0, primeiro: "" };
  function pintaPendentes(){
    var b = $("eq-pendentes"), t = pendentes.total;
    b.hidden = !t;
    if (!t) return;
    b.textContent = (t === 1 ? "1 pedido de cliente aguardando confirmação" : t + " pedidos de clientes aguardando confirmação") +
      (pendentes.primeiro !== estado.dia ? " · ver " + rotuloDia(pendentes.primeiro).toLowerCase() : "");
    b.dataset.dia = pendentes.primeiro;
  }
  function carregaPendentes(){
    var h = hojeSP();
    return rpc("resumo_periodo", { p_de: h, p_ate: somaDias(h, 60) }).then(function(l){
      pendentes = { total: 0, primeiro: "" };
      (l || []).forEach(function(r){ if (r.pendentes > 0){ pendentes.total += r.pendentes; if (!pendentes.primeiro || r.data < pendentes.primeiro) pendentes.primeiro = r.data; } });
      pintaPendentes();
    }).catch(function(){});
  }
  $("eq-pendentes").addEventListener("click", function(){ if (this.dataset.dia) escolheDia(this.dataset.dia); });

  /* ---------------- o dia ---------------- */
  var pedidoDia = 0;
  function carregaDia(silencioso){
    var dia = estado.dia, n = ++pedidoDia;
    $("eq-dia-titulo").textContent = tituloDia(dia);
    if (!silencioso){ var l = $("eq-horas"); limpa(l); l.appendChild(cria("li", "eq-vazio", "Carregando…")); }
    return rpc("agenda_dia", { p_data: dia }).then(function(linhas){
      if (n !== pedidoDia) return;
      estado.linhas = linhas || [];
      pintaDia();
    }).catch(function(e){
      if (n !== pedidoDia || (e && e.sessaoAcabou)) return;
      var l = $("eq-horas"); limpa(l);
      l.appendChild(cria("li", "eq-vazio", "Não foi possível carregar os horários. " + mensagemErro(e)));
      if (e && e.codigo === "sem_permissao") verificaAcesso();
    });
  }
  function diaBloqueado(){ return estado.linhas.some(function(l){ return l.detalhe === "dia"; }) || !!(estado.resumo[estado.dia] || {}).dia_bloqueado; }
  function motivoDoDia(){ var l = estado.linhas.filter(function(x){ return x.detalhe === "dia"; })[0]; return l ? l.motivo : ""; }
  function pintaDia(){
    var dia = estado.dia, passou = dia < hojeSP(), bloq = diaBloqueado();
    var linhas = estado.linhas, lista = $("eq-horas");
    limpa(lista);
    var livres = linhas.filter(function(l){ return l.estado === "livre"; }).length;
    var agendados = linhas.filter(function(l){ return l.estado === "agendado"; }).length;
    var aviso = $("eq-dia-aviso");
    aviso.hidden = true;
    if (!linhas.length){ aviso.textContent = "A loja não abre neste dia."; aviso.hidden = false; }
    else if (bloq){ aviso.textContent = "Dia bloqueado" + (motivoDoDia() ? ": " + motivoDoDia() : "") + ". Os clientes não conseguem agendar neste dia."; aviso.hidden = false; }
    $("eq-varios").hidden = passou || bloq || livres < 2 || estado.varios;
    $("eq-bloq-dia").hidden = passou || bloq || !linhas.length;
    $("eq-desbloq-dia").hidden = !bloq;
    $("eq-desbloq-dia").dataset.agendados = String(agendados);
    linhas.forEach(function(l){ lista.appendChild(linhaDoHorario(l)); });
    atualizaSelecao();
  }
  var ROTULO = { livre: "Livre", agendado: "Agendado", segurado: "Segurado", bloqueado: "Bloqueado", indisponivel: "Indisponível" };
  function linhaDoHorario(l){
    var li = cria("li", "eq-hora " + l.estado);
    li.dataset.hora = l.hora;
    var hora = cria("span", "eq-h", l.hora);
    var info = cria("span", "eq-info");
    var tag = cria("b", "eq-tag " + l.estado, ROTULO[l.estado] || l.estado);
    info.appendChild(tag);
    var detalhe = "";
    if (l.estado === "agendado"){
      detalhe = (l.cliente || "") + (l.servico ? " · " + l.servico : "");
      if (l.detalhe === "pendente") info.appendChild(cria("small", "eq-sub pend", "Aguardando confirmação"));
    } else if (l.estado === "segurado"){
      detalhe = "Por " + (l.segurado_por_nome || "equipe") + " · libera em " + tempoTexto(l.expira_em_min) + (l.motivo_seguro ? " · " + l.motivo_seguro : "");
    } else if (l.estado === "bloqueado"){
      detalhe = (l.motivo || "Bloqueio da loja") + (l.detalhe === "dia" ? " (dia inteiro)" : "");
    } else if (l.estado === "indisponivel") detalhe = "Já passou";
    if (detalhe) info.appendChild(cria("span", "eq-det", detalhe));
    var acoes = cria("span", "eq-acoes");
    if (l.estado === "livre"){
      if (estado.varios){
        var rot = cria("label", "eq-marca-sel");
        var cx = document.createElement("input");
        cx.type = "checkbox";
        cx.checked = !!estado.sel[l.hora];
        cx.setAttribute("aria-label", "Selecionar " + l.hora);
        cx.addEventListener("change", function(){ if (cx.checked) estado.sel[l.hora] = true; else delete estado.sel[l.hora]; atualizaSelecao(); });
        rot.appendChild(cx);
        rot.appendChild(cria("span", "", "Selecionar"));
        acoes.appendChild(rot);
      } else {
        acoes.appendChild(botao("Bloquear", "eq-btn-sec", function(){ pedeBloqueio([l.hora]); }));
        acoes.appendChild(botao("Segurar", "eq-btn-sec eq-btn-disc", function(){ abreSegurar(l.hora); }));
      }
    } else if (l.estado === "agendado"){
      acoes.appendChild(botao("Ver", "eq-btn-sec", function(){ abreVer(l.id); }));
    } else if (l.estado === "segurado"){
      acoes.appendChild(botao("Confirmar", "eq-btn-sec", function(){ acaoSegurado(this, "confirmar_horario", l.id, "Horário " + l.hora + " confirmado."); }));
      acoes.appendChild(botao("Liberar", "eq-btn-sec", function(){ acaoSegurado(this, "liberar_horario", l.id, "Horário " + l.hora + " liberado. Ele já aparece para os clientes."); }));
    } else if (l.estado === "bloqueado" && l.detalhe === "horario"){
      acoes.appendChild(botao("Liberar", "eq-btn-sec", function(){ pedeLiberar({ id: l.id, data: estado.dia, hora: l.hora, motivo: l.motivo }); }));
    }
    li.appendChild(hora); li.appendChild(info); li.appendChild(acoes);
    return li;
  }
  function tempoTexto(min){
    min = Math.max(1, Number(min) || 1);
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }

  /* ---------------- selecionar vários ---------------- */
  function atualizaSelecao(){
    var n = Object.keys(estado.sel).length;
    $("eq-sel").hidden = !estado.varios;
    $("eq-sel-txt").textContent = n ? (n === 1 ? "1 horário selecionado" : n + " horários selecionados") : "Toque nos horários livres";
    $("eq-sel-bloquear").disabled = !n;
  }
  function saiDoModoVarios(){ estado.varios = false; estado.sel = {}; atualizaSelecao(); }
  $("eq-varios").addEventListener("click", function(){ estado.varios = true; estado.sel = {}; pintaDia(); });
  $("eq-sel-cancelar").addEventListener("click", function(){ saiDoModoVarios(); pintaDia(); });
  $("eq-sel-bloquear").addEventListener("click", function(){
    var horas = Object.keys(estado.sel).sort();
    if (horas.length) pedeBloqueio(horas);
  });

  /* ---------------- janela de confirmação ---------------- */
  var dlg = $("eq-dlg"), dlgAcao = null;
  function algumDialogoAberto(){ return dlg.open || $("eq-ver").open || $("eq-seg").open; }
  function fechaDialogos(){ ["eq-dlg", "eq-ver", "eq-seg"].forEach(function(id){ var d = $(id); if (d.open) d.close(); }); }
  function abreDialogo(d){
    if (typeof d.showModal === "function"){ if (!d.open) d.showModal(); }
    else d.setAttribute("open", "");
  }
  /* o = { titulo, dados: [[rótulo, valor]], texto, motivos, aviso, botao, perigo, acao(motivo, detalhe) → Promise } */
  function confirma(o){
    $("eq-dlg-titulo").textContent = o.titulo;
    var dl = $("eq-dlg-dados"); limpa(dl);
    (o.dados || []).forEach(function(par){ dl.appendChild(cria("dt", "", par[0])); dl.appendChild(cria("dd", "", par[1])); });
    dl.hidden = !(o.dados && o.dados.length);
    erroEm("eq-dlg-texto", o.texto || ""); $("eq-dlg-texto").className = "eq-dlg-texto";
    erroEm("eq-dlg-aviso", o.aviso || ""); $("eq-dlg-aviso").className = "eq-dlg-aviso";
    erroEm("eq-dlg-erro", "");
    var sel = $("eq-dlg-sel"), det = $("eq-dlg-det");
    $("eq-dlg-motivo").hidden = !o.motivos;
    limpa(sel);
    if (o.motivos){
      var vazio = cria("option", "", "Sem motivo"); vazio.value = ""; sel.appendChild(vazio);
      o.motivos.forEach(function(m){ var op = cria("option", "", m); op.value = m; sel.appendChild(op); });
    }
    det.value = ""; det.hidden = true; $("eq-dlg-det-rot").hidden = true;
    var ok = $("eq-dlg-ok");
    ok.textContent = o.botao; ok.disabled = false;
    ok.className = "eq-btn " + (o.perigo ? "eq-btn-perigo" : "eq-btn-pri");
    dlgAcao = o;
    abreDialogo(dlg);
    (o.motivos ? sel : ok).focus();
  }
  $("eq-dlg-sel").addEventListener("change", function(){
    var outro = this.value === "Outro";
    $("eq-dlg-det").hidden = !outro; $("eq-dlg-det-rot").hidden = !outro;
    if (outro) $("eq-dlg-det").focus();
  });
  $("eq-dlg-cancelar").addEventListener("click", function(){ dlg.close(); });
  dlg.addEventListener("close", function(){ dlgAcao = null; });
  $("eq-dlg-ok").addEventListener("click", function(){
    var o = dlgAcao, b = this;
    if (!o || b.disabled) return;
    b.disabled = true;
    var motivo = o.motivos ? $("eq-dlg-sel").value : "", detalhe = motivo === "Outro" ? $("eq-dlg-det").value.replace(/[<>]/g, "").trim().slice(0, 60) : "";
    o.acao(motivo, detalhe).then(function(texto){
      if (dlg.open) dlg.close();
      aviso(texto, "ok");
      recarrega(true);
    }).catch(function(e){
      if (e && (e.sessaoAcabou)) return;
      var c = e && e.codigo;
      if (c === "horario_alterado" || c === "ocupado" || c === "nao_encontrado" || c === "dia_bloqueado" || c === "sem_permissao"){
        if (dlg.open) dlg.close();
        falhou(e);
      } else { erroEm("eq-dlg-erro", mensagemErro(e)); b.disabled = false; }
    });
  });

  /* ---------------- bloquear, liberar, dia inteiro ---------------- */
  function pedeBloqueio(horas){
    var dia = estado.dia;
    confirma({
      titulo: horas.length > 1 ? "Bloquear horários" : "Bloquear horário",
      dados: [["Data", br(dia)], [horas.length > 1 ? "Horários" : "Horário", horas.join(", ")]],
      motivos: MOTIVOS_HORARIO,
      texto: "Os clientes deixam de ver " + (horas.length > 1 ? "esses horários" : "esse horário") + " na hora.",
      botao: "Confirmar bloqueio",
      acao: function(motivo, detalhe){
        return rpc("bloquear_horarios", { p_data: dia, p_horas: horas, p_motivo: motivo, p_detalhe: detalhe }).then(function(n){
          saiDoModoVarios();
          return n > 1 ? n + " horários bloqueados em " + br(dia) + "." : "Horário " + horas[0] + " de " + br(dia) + " bloqueado.";
        });
      }
    });
  }
  function pedeLiberar(b){
    confirma({
      titulo: "Liberar horário",
      dados: [["Data", br(b.data)], ["Horário", b.hora], ["Motivo do bloqueio", b.motivo || "Bloqueio da loja"]],
      texto: "O horário volta a aparecer para os clientes.",
      botao: "Liberar",
      acao: function(){
        return rpc("liberar_bloqueio", { p_id: b.id }).then(function(){ return "Horário " + b.hora + " de " + br(b.data) + " liberado."; });
      }
    });
  }
  $("eq-bloq-dia").addEventListener("click", function(){
    var dia = estado.dia;
    var ag = estado.linhas.filter(function(l){ return l.estado === "agendado"; }).length;
    confirma({
      titulo: "Bloquear dia inteiro",
      texto: "Deseja bloquear todos os horários de " + br(dia) + "?",
      motivos: MOTIVOS_DIA,
      aviso: ag ? "Este dia já tem " + (ag === 1 ? "1 agendamento de cliente. Ele continua marcado" : ag + " agendamentos de clientes. Eles continuam marcados") + ": avise o cliente, se for preciso." : "",
      botao: "Confirmar bloqueio",
      acao: function(motivo, detalhe){
        return rpc("bloquear_dia_inteiro", { p_data: dia, p_motivo: motivo, p_detalhe: detalhe }).then(function(j){
          var n = (j && j.agendamentos) || 0;
          return "Dia " + br(dia) + " bloqueado." + (n ? " " + (n === 1 ? "O agendamento de cliente continua marcado." : "Os " + n + " agendamentos de clientes continuam marcados.") : "");
        });
      }
    });
  });
  function pedeDesbloquearDia(dia, agendados){
    /* antes de desbloquear, confere no banco quantos agendamentos de cliente existem no dia */
    if (agendados < 0){
      rpc("resumo_periodo", { p_de: dia, p_ate: dia }).then(function(l){
        pedeDesbloquearDia(dia, ((l || [])[0] || {}).agendados || 0);
      }).catch(function(e){ falhou(e); });
      return;
    }
    confirma({
      titulo: "Desbloquear dia",
      texto: "Os horários livres de " + br(dia) + " voltam a aparecer para os clientes.",
      aviso: agendados > 0 ? "Este dia tem " + (agendados === 1 ? "1 agendamento de cliente. Ele continua" : agendados + " agendamentos de clientes. Eles continuam") + " como está, e os horários bloqueados um a um também." : "",
      botao: "Desbloquear",
      acao: function(){
        return rpc("desbloquear_dia", { p_data: dia }).then(function(j){
          var n = (j && j.agendamentos) || 0;
          return "Dia " + br(dia) + " desbloqueado." + (n ? " " + (n === 1 ? "O agendamento de cliente continua como estava." : "Os " + n + " agendamentos de clientes continuam como estavam.") : "");
        });
      }
    });
  }
  $("eq-desbloq-dia").addEventListener("click", function(){ pedeDesbloquearDia(estado.dia, Number(this.dataset.agendados) || 0); });

  /* segurado: confirmar ou liberar (devolvem 'ok', 'expirado', 'ocupado' ou 'nao_encontrado') */
  function acaoSegurado(b, nome, id, texto){
    if (b.disabled) return;
    b.disabled = true;
    rpc(nome, { p_id: id }).then(function(r){
      if (r === "ok"){ aviso(texto, "ok"); recarrega(true); }
      else falhou(resultadoTexto(r));
    }).catch(function(e){ falhou(e); b.disabled = false; });
  }

  /* ---------------- segurar ---------------- */
  var seg = $("eq-seg"), segHora = "";
  function abreSegurar(hora){
    segHora = hora;
    $("eq-seg-quando").textContent = tituloDia(estado.dia) + ", às " + hora + ". Ninguém mais pega esse horário até o prazo acabar.";
    $("eq-seg-motivo").value = "";
    erroEm("eq-seg-erro", "");
    seg.querySelector('input[value="30"]').checked = true;
    $("eq-seg-ok").disabled = false;
    abreDialogo(seg);
    seg.querySelector('input[value="30"]').focus();
  }
  $("eq-seg-cancelar").addEventListener("click", function(){ seg.close(); });
  $("eq-seg-ok").addEventListener("click", function(){
    var b = this, marcado = seg.querySelector('input[name="eq-seg-min"]:checked');
    var min = marcado ? Number(marcado.value) : 0, dia = estado.dia, hora = segHora;
    if (b.disabled) return;
    if ([15, 30, 60, 120].indexOf(min) < 0){ erroEm("eq-seg-erro", "Escolha o tempo."); return; }
    b.disabled = true;
    rpc("segurar_horario", { p_data: dia, p_hora: hora, p_duracao_minutos: min, p_motivo: $("eq-seg-motivo").value.replace(/[<>]/g, "").trim().slice(0, 120) })
      .then(function(){
        seg.close();
        aviso("Horário " + hora + " segurado por " + (min >= 60 ? min / 60 + (min === 60 ? " hora" : " horas") : min + " minutos") + ".", "ok");
        recarrega(true);
      })
      .catch(function(e){
        if (e && /horario_ocupado|horario_alterado|dia_bloqueado|sem_permissao/.test(e.codigo || "")){ seg.close(); falhou(e.codigo === "horario_ocupado" ? { codigo: "horario_alterado" } : e); }
        else { erroEm("eq-seg-erro", mensagemErro(e)); b.disabled = false; }
      });
  });

  /* ---------------- "Ver" um agendamento ---------------- */
  var ver = $("eq-ver"), verAtual = null;
  function abreVer(id){
    rpc("ver_agendamento", { p_id: id }).then(function(a){
      verAtual = a;
      $("eq-ver-status").textContent = a.status === "pendente" ? "Aguardando confirmação" : "Confirmado";
      $("eq-ver-status").className = "eq-tag " + (a.status === "pendente" ? "pend" : "conf");
      var dl = $("eq-ver-dados"); limpa(dl);
      [["Cliente", a.pela_equipe ? "Reservado pela equipe" : a.cliente], ["Telefone", a.telefone], ["Data", tituloDia(a.data)],
       ["Horário", a.hora], ["Serviço ou interesse", a.servico], ["Aparelho", a.aparelho]].forEach(function(p){
        if (!p[1]) return;
        dl.appendChild(cria("dt", "", p[0])); dl.appendChild(cria("dd", "", p[1]));
      });
      var fone = String(a.telefone || "").replace(/\D/g, "");
      var zap = $("eq-ver-zap");
      zap.hidden = fone.length < 10;
      if (fone.length >= 10){
        var primeiro = String(a.cliente || "").split(" ")[0];
        zap.href = "https://wa.me/" + (fone.length <= 11 ? "55" + fone : fone) + "?text=" +
          encodeURIComponent("Olá" + (primeiro ? ", " + primeiro : "") + "! Aqui é da SR Phone, sobre o seu horário de " + br(a.data) + " às " + a.hora + ".");
      }
      $("eq-ver-confirmar").hidden = a.status !== "pendente";
      $("eq-ver-remarca").hidden = true;
      erroEm("eq-ver-erro", "");
      ["eq-ver-confirmar", "eq-ver-remarcar", "eq-ver-cancelar"].forEach(function(b){ $(b).disabled = false; });
      $("eq-ver-cancelar").textContent = "Cancelar agendamento";
      $("eq-ver-cancelar").dataset.confirma = "";
      abreDialogo(ver);
      $("eq-ver-fechar").focus();
    }).catch(function(e){ falhou(e); });
  }
  $("eq-ver-fechar").addEventListener("click", function(){ ver.close(); });
  ver.addEventListener("close", function(){ verAtual = null; });
  function acaoVer(b, chamada, texto){
    if (!verAtual || b.disabled) return;
    b.disabled = true;
    chamada().then(function(r){
      if (r !== "ok"){ ver.close(); falhou(resultadoTexto(r === "dia_bloqueado" ? "dia_bloqueado" : r)); return; }
      ver.close(); aviso(texto, "ok"); recarrega(true);
    }).catch(function(e){
      if (e && /sem_permissao/.test(e.codigo || "")){ ver.close(); falhou(e); return; }
      erroEm("eq-ver-erro", mensagemErro(e)); b.disabled = false;
    });
  }
  $("eq-ver-confirmar").addEventListener("click", function(){
    var a = verAtual;
    acaoVer(this, function(){ return rpc("confirmar_horario", { p_id: a.id }); }, "Horário de " + br(a.data) + " às " + a.hora + " confirmado.");
  });
  $("eq-ver-cancelar").addEventListener("click", function(){
    var b = this, a = verAtual;
    if (b.dataset.confirma !== "1"){                     /* segundo toque para cancelar */
      b.dataset.confirma = "1";
      b.textContent = "Toque de novo para cancelar";
      setTimeout(function(){ if (b.dataset.confirma === "1"){ b.dataset.confirma = ""; b.textContent = "Cancelar agendamento"; } }, 5000);
      return;
    }
    acaoVer(b, function(){ return rpc("cancelar_agendamento", { p_id: a.id }); }, "Agendamento de " + br(a.data) + " às " + a.hora + " cancelado. O horário voltou a ficar livre.");
  });
  /* remarcar: data e um horário da grade da loja */
  function horasDaRemarcacao(){
    var sel = $("eq-ver-hora"), iso = $("eq-ver-data").value;
    limpa(sel);
    var g = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? gradeDoDia(iso) : [];
    if (!g.length){ var o = cria("option", "", "A loja não abre nesse dia"); o.value = ""; sel.appendChild(o); }
    g.forEach(function(h){ var op = cria("option", "", h); op.value = h; sel.appendChild(op); });
  }
  $("eq-ver-remarcar").addEventListener("click", function(){
    if (!verAtual) return;
    var r = $("eq-ver-remarca");
    r.hidden = !r.hidden;
    if (!r.hidden){
      $("eq-ver-data").value = verAtual.data;
      $("eq-ver-data").min = hojeSP();
      horasDaRemarcacao();
      $("eq-ver-hora").value = verAtual.hora;
      $("eq-ver-data").focus();
    }
  });
  $("eq-ver-data").addEventListener("change", horasDaRemarcacao);
  $("eq-ver-remarca-ok").addEventListener("click", function(){
    var a = verAtual, nd = $("eq-ver-data").value, nh = $("eq-ver-hora").value;
    if (!a) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd) || !/^\d{2}:\d{2}$/.test(nh)){ erroEm("eq-ver-erro", "Escolha a nova data e o novo horário."); return; }
    if (nd < hojeSP() || (nd === hojeSP() && nh <= agoraSP())){ erroEm("eq-ver-erro", "Esse horário já passou."); return; }
    acaoVer(this, function(){ return rpc("remarcar_agendamento", { p_id: a.id, p_data: nd, p_hora: nh }); },
      "Agendamento remarcado para " + br(nd) + " às " + nh + ". Avise o cliente pelo WhatsApp.");
  });

  /* ---------------- aba Bloqueios ---------------- */
  function carregaBloqueios(){
    var lista = $("eq-lista-bloqueios"), filtro = estado.filtro;
    Array.prototype.forEach.call(document.querySelectorAll(".eq-filtro"), function(b){ b.setAttribute("aria-pressed", b.dataset.filtro === filtro ? "true" : "false"); });
    if (!lista.children.length){ lista.appendChild(cria("li", "eq-vazio", "Carregando…")); }
    return rpc("bloqueios_ativos", { p_filtro: filtro }).then(function(l){
      if (filtro !== estado.filtro) return;
      limpa(lista);
      if (!l || !l.length){ lista.appendChild(cria("li", "eq-vazio", filtro === "hoje" ? "Nenhum bloqueio hoje." : "Nenhum bloqueio ativo.")); return; }
      l.forEach(function(b){
        var li = cria("li", "eq-item " + (b.tipo === "dia" ? "dia" : "horario"));
        var q = cria("span", "eq-item-quando");
        q.appendChild(cria("b", "", rotuloDia(b.data)));
        q.appendChild(cria("span", "", b.tipo === "dia" ? "Dia inteiro" : b.hora));
        var info = cria("span", "eq-info");
        info.appendChild(cria("span", "eq-det", b.motivo || (b.tipo === "dia" ? "Dia bloqueado" : "Bloqueio da loja")));
        if (b.por_nome) info.appendChild(cria("small", "eq-sub", "por " + b.por_nome));
        var acoes = cria("span", "eq-acoes");
        if (b.tipo === "dia") acoes.appendChild(botao("Desbloquear", "eq-btn-sec", function(){ pedeDesbloquearDia(b.data, -1); }));
        else acoes.appendChild(botao("Liberar", "eq-btn-sec", function(){ pedeLiberar({ id: b.id, data: b.data, hora: b.hora, motivo: b.motivo }); }));
        li.appendChild(q); li.appendChild(info); li.appendChild(acoes);
        lista.appendChild(li);
      });
    }).catch(function(e){
      if (e && e.sessaoAcabou) return;
      limpa(lista);
      lista.appendChild(cria("li", "eq-vazio", "Não foi possível carregar os bloqueios. " + mensagemErro(e)));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll(".eq-filtro"), function(b){
    b.addEventListener("click", function(){ estado.filtro = b.dataset.filtro; carregaBloqueios(); });
  });

  /* ---------------- aviso do Telegram (só admin vê o botão; o banco confere) ---------------- */
  $("eq-testar-aviso").addEventListener("click", function(){
    var b = this;
    if (b.disabled) return;
    b.disabled = true;
    rpc("testar_aviso").then(function(r){
      aviso(r === "enviado" ? "Mensagem de teste enviada. Confira o Telegram." : "O aviso do Telegram ainda não foi configurado no banco.", r === "enviado" ? "ok" : "erro");
    }).catch(function(e){ aviso(e && e.http === 404 ? "O aviso do Telegram não está instalado no banco." : mensagemErro(e), "erro"); })
      .then(function(){ b.disabled = false; });
  });

  /* ---------------- começo ---------------- */
  if (!AG){ mostra("eq-sem-config"); return; }
  /* sem <dialog> (navegador muito antigo): as janelas viram blocos na própria página */
  if (typeof dlg.showModal !== "function") document.documentElement.classList.add("sem-dialog");
  preparaRobo("eq-robo-login");
  if (linkDoEmail()) return;
  recupera();
  if (!sessao){ mostra("eq-login"); return; }
  /* sessão guardada nesta aba: confere com o servidor (renova se precisar) antes de mostrar qualquer coisa */
  verificaAcesso();
})();
