/* SR Phone · agendamento de visita
   ---------- agendamento ----------
   Quando SUPABASE_URL e SUPABASE_ANON_KEY (data/config.js) estiverem preenchidos, o site
   consulta os horários ocupados (só dia e hora) com a chave pública, e o pedido vai para a
   função do servidor (/api/agendamento), que confere tudo, aplica o limite e o anti-robô e
   grava no banco com a chave secreta (que nunca chega ao navegador). Sem isso preenchido,
   ou com a função fora do ar, o bloco segue pelo WhatsApp e diz isso na tela, sem fingir
   que reservou. A área da equipe fica em /funcionario/. */

var agDias = document.getElementById("ag-dias");
var agHoras = document.getElementById("ag-horas");
var agMotivo = document.getElementById("ag-motivo");
var agNome = document.getElementById("ag-nome");
var agFone = document.getElementById("ag-fone");
var agPreview = document.getElementById("ag-preview");
var agEnviar = document.getElementById("ag-enviar");
var agZap = document.getElementById("ag-zap");
var agStatus = document.getElementById("ag-status");
var agRecado = document.getElementById("ag-recado");
var agAparelho = document.getElementById("ag-aparelho");
var diaSel = null, horaSel = null;

var SEM = ["dom","seg","ter","qua","qui","sex","sáb"];
var MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
var SEM_LONGO = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];

function doisDig(n){ return (n < 10 ? "0" : "") + n; }

/* ---- relógio da loja: tudo em America/Sao_Paulo, não no relógio do aparelho ---- */
var TZ = "America/Sao_Paulo";
function hojeSP(){
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit" })
    .format(new Date());
}
function agoraSP(){
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour:"2-digit", minute:"2-digit", hour12:false })
    .format(new Date());
}
/* datas ficam ancoradas ao meio-dia UTC: assim somar 24h nunca pula nem repete dia */
function diaBase(iso){ return new Date(iso + "T12:00:00Z"); }
function isoDe(d){
  return d.getUTCFullYear() + "-" + doisDig(d.getUTCMonth()+1) + "-" + doisDig(d.getUTCDate());
}

/* ---- conversa com o servidor da agenda ---- */
var AGENDA = STORE_CONFIG.agenda;
/* chave pública do Supabase: a "publishable" (sb_publishable_..., a atual) ou a antiga "anon" (JWT).
   Chave secreta (sb_secret_... ou service_role) é recusada: ela nunca pode ir para o navegador. */
function tipoChave(k){
  k = String(k || "").trim();
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(k)) return "publishable";
  if (/^sb_secret_/.test(k)) return "secreta";
  var partes = k.split(".");
  if (partes.length === 3){
    try {
      var b = partes[1].replace(/-/g, "+").replace(/_/g, "/");
      var dado = JSON.parse(atob(b + "===".slice((b.length + 3) % 4)));
      if (dado && dado.role === "anon") return "anon";
      if (dado && dado.role === "service_role") return "secreta";
    } catch(_){}
  }
  return "invalida";
}
var AG = (typeof SUPABASE_URL === "string" && SUPABASE_URL.trim() && typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY.trim())
  ? { url: SUPABASE_URL.trim().replace(/\/+$/, ""), chave: SUPABASE_ANON_KEY.trim(), tipo: tipoChave(SUPABASE_ANON_KEY) }
  : null;
if (AG && (!/^https:\/\//.test(AG.url) || (AG.tipo !== "publishable" && AG.tipo !== "anon"))){
  /* agenda desligada: SUPABASE_URL precisa começar com https:// e a chave tem que ser a pública
     (publishable ou anon). O "npm run build" aponta o erro; aqui o site segue pelo WhatsApp, sem quebrar */
  AG = null;
}
var agendaOnline = !!AG;

/* toda conversa com o servidor tem prazo: sem resposta em 12 s, a tela sai do "carregando"
   e oferece o WhatsApp (nunca fica girando para sempre) */
/* A chave pública vai SEMPRE no cabeçalho "apikey". A publishable (sb_publishable_) não é JWT e
   nunca vai em "Authorization: Bearer" (o Supabase recusa). Lá só vai o login do funcionário
   (o token dele) ou, com a chave antiga "anon", a própria chave, como o Supabase pede. */
function agFetch(caminho, opcoes){
  opcoes = opcoes || {};
  var h = opcoes.headers || {};
  h["apikey"] = AG.chave;
  h["Content-Type"] = "application/json";
  if (!h["Authorization"] && AG.tipo === "anon") h["Authorization"] = "Bearer " + AG.chave;
  opcoes.headers = h;
  var ctl = typeof AbortController === "function" ? new AbortController() : null, relogio = null;
  if (ctl){ opcoes.signal = ctl.signal; relogio = setTimeout(function(){ ctl.abort(); }, 12000); }
  return fetch(AG.url + caminho, opcoes).then(function(r){ clearTimeout(relogio); return r; },
    function(e){ clearTimeout(relogio); throw e; });
}
function rpc(nome, corpo, token){
  var h = token ? { Authorization: "Bearer " + token } : {};
  return agFetch("/rest/v1/rpc/" + nome, {
    method: "POST", headers: h, body: JSON.stringify(corpo || {})
  }).then(function(r){
    return r.text().then(function(t){
      var j = null;
      try { j = t ? JSON.parse(t) : null; } catch(_){ j = t; }
      if (!r.ok) throw { http: r.status, dado: j };
      return j;
    });
  });
}

/* horários já ocupados (pedidos pendentes, confirmados ou bloqueados). Vem só dia e hora. */
var ocupados = {};     /* "2026-09-23 14:00" -> true */
var ocupadosOk = false, ocupadosEm = 0;
var agFalhou = false;  /* servidor fora do ar ou mal configurado: segue pelo WhatsApp */
var reservado = "";    /* horário que este visitante acabou de reservar */
function chave(iso, hora){ return iso + " " + hora; }
function modoOnline(){ return agendaOnline && !agFalhou; }

var agHorasInfo = document.getElementById("ag-horas-info");
function carregandoHoras(sim){
  agHoras.classList.toggle("carregando", sim);
  if (sim) agHoras.setAttribute("aria-busy", "true"); else agHoras.removeAttribute("aria-busy");
  if (agHorasInfo) agHorasInfo.textContent = sim ? "Consultando os horários livres…" : "";
}
function carregaOcupados(){
  if (!agendaOnline) return Promise.resolve();
  var de = hojeSP();
  var ate = isoDe(new Date(diaBase(de).getTime() + (AGENDA.diasNaFrente + 1) * 86400000));
  return rpc("horarios_ocupados", { de: de, ate: ate }).then(function(linhas){
    ocupados = {};
    (linhas || []).forEach(function(l){ ocupados[chave(l.data, l.hora)] = true; });
    ocupadosOk = true; ocupadosEm = Date.now();
  }).catch(function(){
    ocupadosOk = false;   /* sem resposta: não inventa disponibilidade */
  });
}
/* consulta de novo quando a lista tem mais de 45 s (outra pessoa pode ter reservado) */
function atualizaOcupados(){
  if (!modoOnline() || Date.now() - ocupadosEm < 45000) return Promise.resolve();
  carregandoHoras(true);
  return carregaOcupados().then(function(){
    carregandoHoras(false);
    if (!ocupadosOk) entraNoPlanoB();
  });
}

/* ---- dias ---- */
function montaDias(){
  agDias.innerHTML = "";
  var hoje = hojeSP();
  var base = diaBase(hoje);
  var fechados = AGENDA.diasFechados || [];
  var primeiro = null;
  for (var i = 0; i < AGENDA.diasNaFrente; i++){
    var d = new Date(base.getTime() + i * 86400000);
    if (fechados.indexOf(d.getUTCDay()) > -1) continue;
    (function(data){
      var iso = isoDe(data);
      var b = document.createElement("button");
      b.className = "dia"; b.type = "button";
      b.setAttribute("aria-pressed","false");
      b.dataset.iso = iso;
      var rotulo = (iso === hoje) ? "hoje" : SEM[data.getUTCDay()];
      b.innerHTML = '<i>'+rotulo+'</i><b>'+doisDig(data.getUTCDate())+'</b><em>'+MES[data.getUTCMonth()]+'</em>';
      b.setAttribute("aria-label", SEM_LONGO[data.getUTCDay()]+", "+data.getUTCDate()+" de "+MES[data.getUTCMonth()]);
      b.addEventListener("click", function(){
        diaSel = data; horaSel = null;
        Array.prototype.forEach.call(agDias.children, function(el){
          el.setAttribute("aria-pressed", el === b ? "true" : "false");
        });
        montaHoras();
        agAtualiza();
        atualizaOcupados().then(function(){ montaHoras(); agAtualiza(); });
      });
      agDias.appendChild(b);
      /* começa no primeiro dia que ainda tem horário (hoje, depois do último horário, não serve) */
      if (!primeiro && temHorarioLivre(data)) primeiro = b;
    })(d);
  }
  if (primeiro){
    diaSel = diaBase(primeiro.dataset.iso);
    primeiro.setAttribute("aria-pressed", "true");
    montaHoras();
  }
}

function horariosDoDia(data){
  return (data.getUTCDay() === 6 && AGENDA.horariosSabado && AGENDA.horariosSabado.length)
    ? AGENDA.horariosSabado : AGENDA.horarios;
}
function temHorarioLivre(data){
  var iso = isoDe(data), hoje = hojeSP(), agora = agoraSP();
  return horariosDoDia(data).some(function(h){ return !(iso === hoje && h <= agora); });
}

/* ---- horários ---- */
function montaHoras(){
  agHoras.innerHTML = "";
  if (!diaSel) return;
  var iso = isoDe(diaSel);
  var hoje = hojeSP();
  var agora = agoraSP();
  var lista = horariosDoDia(diaSel);

  var mostrados = 0, livres = 0;
  lista.forEach(function(hStr){
    /* horário que já passou não aparece (relógio da loja, não do aparelho) */
    if (iso === hoje && hStr <= agora) return;
    var b = document.createElement("button");
    b.className = "hora"; b.type = "button"; b.textContent = hStr;
    b.setAttribute("aria-pressed", hStr === horaSel ? "true" : "false");
    if (modoOnline() && ocupados[chave(iso, hStr)]){
      b.disabled = true;
      b.classList.add("ocupada");
      b.title = "Horário já reservado";
      b.setAttribute("aria-label", hStr + ", já reservado");
      if (hStr === horaSel) horaSel = null;
    } else {
      livres++;
      b.addEventListener("click", function(){
        horaSel = hStr;
        Array.prototype.forEach.call(agHoras.children, function(el){
          el.setAttribute("aria-pressed", el === b ? "true" : "false");
        });
        agAtualiza();
      });
    }
    agHoras.appendChild(b);
    mostrados++;
  });

  if (!mostrados || !livres){
    var vazio = document.createElement("p");
    vazio.className = "ag-vazio";
    vazio.textContent = (iso === hoje && !mostrados)
      ? "Não há mais horários hoje. Escolha outro dia."
      : "Nenhum horário livre neste dia. Escolha outro dia.";
    agHoras.appendChild(vazio);
  }
}

/* ---- validação: mensagem no próprio campo, nunca alert() ---- */
function limpaNome(){ return agNome.value.trim().replace(/[<>]/g, "").replace(/\s+/g, " ").slice(0, 60); }
function limpaFone(){ return agFone ? agFone.value.replace(/[^\d()+\-\s]/g, "").trim().slice(0, 20) : ""; }
function erroCampo(campo, texto){
  if (!campo) return;
  var p = document.getElementById(campo.id + "-erro");
  if (texto){
    campo.setAttribute("aria-invalid", "true");
    if (p){ p.textContent = texto; p.hidden = false; }
  } else {
    campo.removeAttribute("aria-invalid");
    if (p){ p.textContent = ""; p.hidden = true; }
  }
}
function validaNome(obrigatorio){
  var n = limpaNome();
  if (!n) return obrigatorio ? "Escreva seu nome para a loja saber quem vai atender." : "";
  if (n.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 2) return "Escreva seu nome com pelo menos 2 letras.";
  if (/\d/.test(n)) return "O nome não deve ter números.";
  return "";
}
/* online o WhatsApp é obrigatório: é por ele que a loja confirma a reserva */
function validaFone(){
  var t = limpaFone();
  if (!t) return modoOnline() ? "Escreva seu WhatsApp com DDD para a loja confirmar o horário." : "";
  var d = t.replace(/\D/g, "");
  if (d.length === 12 || d.length === 13){ if (d.slice(0, 2) !== "55") return "Confira o número: use DDD e número, ex.: (22) 99999-0000."; d = d.slice(2); }
  if (d.length < 10 || d.length > 11) return "Confira o número: use DDD e número, ex.: (22) 99999-0000.";
  if (d.length === 11 && d.charAt(2) !== "9") return "Celular com 11 dígitos começa com 9 depois do DDD.";
  return "";
}
function validaTudo(focar){
  var eNome = validaNome(modoOnline()), eFone = validaFone();
  var eQuando = !diaSel ? "Escolha o dia." : !horaSel ? "Escolha o horário." : "";
  erroCampo(agNome, eNome);
  erroCampo(agFone, eFone);
  var q = document.getElementById("ag-quando-erro");
  if (q){ q.textContent = eQuando; q.hidden = !eQuando; }
  if (focar){
    if (eQuando){ var alvo = (diaSel ? agHoras : agDias).querySelector("button:not([disabled])"); if (alvo) alvo.focus(); }
    else if (eNome) agNome.focus();
    else if (eFone) agFone.focus();
  }
  return !(eNome || eFone || eQuando);
}

/* ---- mensagem do WhatsApp: serviço, dia e horário (se escolhido) ---- */
var agInteresse = "";   /* produto vindo da página do produto, ex.: "iPhone 17 256 GB" */
function agendaInteresse(texto){
  agInteresse = String(texto || "").slice(0, 80);
  Array.prototype.forEach.call(agMotivo.options, function(o){ if (/comprar/i.test(o.textContent)) agMotivo.value = o.value || o.textContent; });
  comecaAgendamento("produto");
  agAtualiza();
}
function textoDia(d){ return SEM_LONGO[d.getUTCDay()] + ", " + doisDig(d.getUTCDate()) + "/" + doisDig(d.getUTCMonth()+1); }
function agMensagem(pedido){
  var nome = limpaNome();
  var m = pedido
    ? "Olá! Acabei de reservar um horário pelo site da SR Phone."
    : MENSAGENS.agendamento;
  if (nome) m += " Meu nome é " + nome + ".";
  var servico = agMotivo.value.charAt(0).toLowerCase() + agMotivo.value.slice(1);   /* "iPhone" continua "iPhone" */
  m += " Serviço: " + servico + (agInteresse ? " (" + agInteresse + ")" : "") + ".";
  if (agAparelho && limpaAparelho()) m += " Meu aparelho: " + limpaAparelho() + ".";
  if (diaSel) m += " Dia: " + textoDia(diaSel) + (horaSel ? ", às " + horaSel : "") + ".";
  m += pedido ? " Aguardo a confirmação." : (horaSel ? " Esse horário está disponível?" : " Quais horários estão livres?");
  return m;
}

var agEnviando = false;
function agAtualiza(){
  var pronto = !!(diaSel && horaSel);
  var jaReservado = pronto && reservado === chave(isoDe(diaSel), horaSel);
  if (!pronto){
    agPreview.innerHTML = '<b>Seu pedido</b>' + esc("Escolha o dia e o horário que ficam melhores para você.");
  } else {
    agPreview.innerHTML = '<b>Seu pedido</b>' +
      esc(agMotivo.value + (agInteresse ? " (" + agInteresse + ")" : "") + " · " + textoDia(diaSel) + " às " + horaSel + (limpaNome() ? " · " + limpaNome() : ""));
    var q = document.getElementById("ag-quando-erro");
    if (q) q.hidden = true;
  }
  agEnviar.disabled = agEnviando || jaReservado;
  agEnviar.setAttribute("aria-busy", agEnviando ? "true" : "false");
  agEnviar.textContent = agEnviando ? "Reservando…" : jaReservado ? "Horário reservado" : (modoOnline() ? "Reservar esse horário" : "Agendar pelo WhatsApp");
  var op = document.getElementById("ag-fone-op");
  if (op) op.hidden = modoOnline();
  if (agFone) { if (modoOnline()) agFone.setAttribute("aria-required", "true"); else agFone.removeAttribute("aria-required"); }
  /* no plano B o botão do WhatsApp acompanha o serviço, o dia e o horário escolhidos */
  if (agFalhou) agZap.href = zap(agMensagem(false));
  var passo = document.getElementById("ag-passo-txt");
  if (passo) passo.textContent = modoOnline()
    ? "Você escolhe o serviço, o dia e o horário. Ao pedir, o horário fica reservado para você, e a loja confirma pelo WhatsApp."
    : "Você escolhe o serviço, o dia e o horário, e a mensagem já sai pronta no WhatsApp. A loja confirma o horário na conversa.";
}

/* ---- medição: começou a agendar (uma vez por visita) ---- */
var agComecou = false;
function comecaAgendamento(origem){
  if (agComecou) return;
  agComecou = true;
  if (window.medir) medir("schedule_start", { origem: origem || "formulario", modo: modoOnline() ? "online" : "whatsapp" });
}
document.addEventListener("click", function(e){
  var a = e.target.closest ? e.target.closest('a[href="#agendar"]') : null;
  if (a) comecaAgendamento(a.dataset.agendar || "link");
}, true);
document.getElementById("agendar").addEventListener("focusin", function(){ comecaAgendamento("formulario"); });

/* ---- enviar o pedido ---- */
function agEstado(tipo, html){
  agStatus.hidden = false;
  agStatus.className = "ag-status " + tipo;
  agStatus.innerHTML = html;
}
/* plano B: o servidor da agenda não respondeu. Ninguém fica preso: segue pelo WhatsApp */
function entraNoPlanoB(){
  agFalhou = true;
  agEstado("aviso", "<b>Não conseguimos consultar os horários agora.</b>" +
    "<span>Você pode agendar pelo WhatsApp: a mensagem já vai com o serviço, o dia e o horário que você escolher.</span>" +
    '<button type="button" class="ag-tentar" id="ag-tentar">Tentar de novo</button>');
  agZap.textContent = "Agendar pelo WhatsApp";
  agZap.hidden = false;
  document.getElementById("ag-tentar").addEventListener("click", function(){
    ocupadosEm = 0;
    carregandoHoras(true);
    carregaOcupados().then(function(){
      carregandoHoras(false);
      if (ocupadosOk){ agFalhou = false; agStatus.hidden = true; agZap.hidden = true; }
      else if (agHorasInfo) agHorasInfo.textContent = "Ainda sem resposta. Siga pelo WhatsApp.";
      montaHoras(); agAtualiza();
    });
  });
  montaHoras();
  agAtualiza();
}

/* ---- o pedido vai para a função do servidor (nunca direto ao banco) ---- */
function pedeNoServidor(corpo){
  var ctl = typeof AbortController === "function" ? new AbortController() : null;
  var relogio = ctl ? setTimeout(function(){ ctl.abort(); }, 15000) : null;
  return fetch("/api/agendamento", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo), signal: ctl ? ctl.signal : undefined, credentials: "same-origin"
  }).then(function(r){
    clearTimeout(relogio);
    return r.text().then(function(t){
      var j = null;
      try { j = t ? JSON.parse(t) : null; } catch(_){ j = null; }
      if (r.ok && j && j.ok === true) return j;
      throw { http: r.status, erro: (j && typeof j.erro === "string") ? j.erro : "" };
    });
  }, function(e){ clearTimeout(relogio); throw e; });
}
function limpaAparelho(){ return agAparelho.value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60); }

/* ---- anti-robô (Cloudflare Turnstile): só com TURNSTILE_SITE_KEY em data/config.js ----
   A chave do site é pública. O token que o widget devolve é conferido NO SERVIDOR, com o segredo
   (TURNSTILE_SECRET_KEY, só no Netlify): aqui ele só é repassado, nunca "vale" sozinho. */
var ROBO_CHAVE = (typeof TURNSTILE_SITE_KEY === "string" && /^[0-9A-Za-z_-]{10,80}$/.test(TURNSTILE_SITE_KEY.trim())) ? TURNSTILE_SITE_KEY.trim() : "";
var roboToken = "", roboWidget = null, roboCarregando = false;
function roboAtivo(){ return !!ROBO_CHAVE && modoOnline(); }
function roboRecomeca(){
  roboToken = "";
  if (roboWidget !== null && window.turnstile) try { window.turnstile.reset(roboWidget); } catch(_){}
}
function carregaRobo(){
  var caixa = document.getElementById("ag-robo");
  if (!ROBO_CHAVE || !caixa || roboCarregando || roboWidget !== null) return;
  roboCarregando = true;
  caixa.hidden = false;
  var sc = document.createElement("script");
  sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  sc.async = true;
  sc.onload = function(){
    if (!window.turnstile){ entraNoPlanoB(); return; }
    roboWidget = window.turnstile.render(caixa, {
      sitekey: ROBO_CHAVE, action: "agendamento", theme: "dark", language: "pt-br", size: "flexible",
      callback: function(t){ roboToken = t; },
      "expired-callback": function(){ roboToken = ""; },
      "error-callback": function(){ roboToken = ""; }
    });
  };
  /* sem o anti-robô (bloqueado pela rede, por exemplo) o pedido online não passa: segue pelo WhatsApp */
  sc.onerror = function(){ caixa.hidden = true; entraNoPlanoB(); };
  document.head.appendChild(sc);
}

function pedirHorario(){
  if (agEnviando) return;                  /* nada de pedido duplicado (duplo clique) */
  var isca = document.getElementById("ag-site");
  if (isca && isca.value){                 /* campo invisível preenchido = robô: nada é enviado */
    agEstado("erro", "<b>Não reservado</b><span>Não deu para reservar agora. Tente de novo ou chame a loja no WhatsApp.</span>");
    return;
  }
  if (!validaTudo(true)) return;
  var iso = isoDe(diaSel), hora = horaSel;

  if (!modoOnline()){
    /* sem servidor: é só uma mensagem, e a tela diz isso */
    agZap.href = zap(agMensagem(false));
    agZap.textContent = "Agendar pelo WhatsApp";
    agZap.hidden = false;
    if (!agFalhou) agEstado("aviso",
      "<b>A mensagem foi preparada no WhatsApp.</b>" +
      "<span>O horário ainda não está reservado: a loja confirma pela conversa. " +
      "Se o WhatsApp não abriu, toque no botão abaixo.</span>");
    agZap.click();
    return;
  }

  /* anti-robô (Cloudflare Turnstile), quando a loja configurou: sem o "não sou robô", não envia */
  if (roboAtivo() && !roboToken){
    agEstado("aviso", "<b>Falta um passo</b><span>Confirme a verificação de segurança logo acima do botão e toque de novo.</span>");
    return;
  }
  agEnviando = true;
  agAtualiza();
  pedeNoServidor({
    data: iso, hora: hora,
    servico: agMotivo.value + (agInteresse ? " (" + agInteresse + ")" : ""), nome: limpaNome(), telefone: limpaFone(),
    aparelho: agAparelho ? limpaAparelho() : "", site: isca ? isca.value : "", turnstile: roboToken
  }).then(function(){
    reservado = chave(iso, hora);
    ocupados[reservado] = true;
    agZap.href = zap(agMensagem(true));
    agZap.textContent = "Avisar a loja no WhatsApp";
    agZap.hidden = false;
    agEstado("ok",
      "<b>Horário reservado</b>" +
      "<span>" + esc(textoDia(diaSel) + " às " + hora) + " ficou guardado para você. A loja confirma pelo WhatsApp; " +
      "se não puder atender, ela avisa e sugere outro horário.</span>");
    if (window.medir) medir("schedule_complete", { modo: "online", motivo: agMotivo.value });
  }).catch(function(e){
    var m = (e && e.erro) || "";
    roboRecomeca();                         /* o token do anti-robô vale uma vez só */
    /* sem resposta do servidor (fora do ar, sem internet, função não publicada, chave faltando): plano B */
    if (!e || !e.http || e.http >= 500 || e.http === 404 || m === "indisponivel" || (m === "robo" && !roboAtivo())){ entraNoPlanoB(); return; }
    var texto;
    if (/horario_ocupado/.test(m))        texto = "Esse horário acabou de ser reservado por outra pessoa. Escolha outro, por favor.";
    else if (/dia_bloqueado/.test(m))     texto = "A loja não vai atender nesse dia. Escolha outro dia, por favor.";
    else if (m === "robo")                texto = "Não conseguimos confirmar a verificação de segurança. Confirme de novo e toque em reservar.";
    else if (m === "limite" || /muitas_tentativas/.test(m) || (e.http === 429 && !m)) texto = "Muitos pedidos seguidos deste aparelho. Espere um pouco ou chame a loja no WhatsApp.";
    else if (/horario_passado/.test(m))   texto = "Esse horário já passou. Escolha outro.";
    else if (/pedido_duplicado/.test(m))  texto = "Este WhatsApp já tem um horário reservado nesse dia. Para mudar, fale com a loja.";
    else if (/nome_invalido/.test(m))     { texto = "Escreva seu nome (pelo menos 2 letras)."; erroCampo(agNome, texto); }
    else if (/telefone_invalido/.test(m)) { texto = "Confira o seu WhatsApp com DDD."; erroCampo(agFone, texto); }
    else if (/data_fora|invalido|hora_invalida/.test(m)) texto = "Confira o dia e o horário escolhidos e tente de novo.";
    else if (/fora_do_horario/.test(m))   texto = "Esse horário não está na agenda da loja. Escolha outro, por favor.";
    else if (/limite_por_telefone/.test(m)) texto = "Este WhatsApp já tem pedidos de horário aguardando a loja. Para mudar, fale com a loja.";
    else if (/muitos_pedidos/.test(m))    texto = "Muitos pedidos ao mesmo tempo. Tente de novo em alguns minutos ou chame a loja no WhatsApp.";
    else texto = "Não deu para reservar agora. Tente de novo ou chame a loja no WhatsApp.";
    agZap.href = zap(agMensagem(false));
    agZap.textContent = "Agendar pelo WhatsApp";
    agZap.hidden = false;
    agEstado("erro", "<b>Não reservado</b><span>" + esc(texto) + "</span>");
    ocupadosEm = 0;
    return atualizaOcupados().then(montaHoras);
  }).then(function(){
    agEnviando = false;
    agAtualiza();
  });
}

agEnviar.addEventListener("click", pedirHorario);
agMotivo.addEventListener("change", agAtualiza);
agNome.addEventListener("input", function(){ if (agNome.getAttribute("aria-invalid")) erroCampo(agNome, validaNome(modoOnline())); agAtualiza(); });
agNome.addEventListener("blur", function(){ if (limpaNome()) erroCampo(agNome, validaNome(modoOnline())); });
/* máscara: (22) 99999-0000 enquanto a pessoa digita (aceita colar com +55) */
function mascaraFone(v){
  var d = String(v || "").replace(/\D/g, "");
  if (d.length > 11 && d.slice(0, 2) === "55") d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return "(" + d;
  if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}
if (agFone){
  agFone.addEventListener("input", function(e){
    if (!e || e.inputType !== "deleteContentBackward"){
      var novo = mascaraFone(agFone.value);
      if (novo !== agFone.value) agFone.value = novo;
    }
    if (agFone.getAttribute("aria-invalid")) erroCampo(agFone, validaFone()); agAtualiza();
  });
  agFone.addEventListener("blur", function(){ if (limpaFone()) erroCampo(agFone, validaFone()); });
}

if (agRecado){
  agRecado.textContent = agendaOnline
    ? "O horário fica reservado assim que você pede. A loja confirma pelo WhatsApp e, se não puder atender, sugere outro."
    : "Por enquanto o pedido é feito pelo WhatsApp: a mensagem já sai escrita e a loja confirma o horário na conversa.";
}

if (typeof temAssistencia === "function" && temAssistencia() && agMotivo){
  var opAssist = document.createElement("option");
  opAssist.textContent = "Assistência técnica";
  agMotivo.insertBefore(opAssist, agMotivo.options[agMotivo.options.length - 1] || null);
}
/* "Área da equipe" no rodapé só aparece com a agenda online configurada */
(function(){ var li = document.getElementById("f-adm"); if (li) li.hidden = !agendaOnline; })();

montaDias();
agAtualiza();
if (agendaOnline){
  /* a agenda só consulta o servidor quando a pessoa chega perto dela (nada na abertura do site);
     enquanto responde, os horários mostram que estão sendo conferidos */
  var consultaInicial = function(){
    carregaRobo();
    carregandoHoras(true);
    carregaOcupados().then(function(){
      carregandoHoras(false);
      if (!ocupadosOk) entraNoPlanoB();
      montaHoras();
      agAtualiza();
    });
  };
  var secaoAgenda = document.getElementById("agendar");
  if ("IntersectionObserver" in window && secaoAgenda){
    var ioAgenda = new IntersectionObserver(function(en){
      if (en[0].isIntersecting){ ioAgenda.disconnect(); consultaInicial(); }
    }, { rootMargin: "600px 0px" });
    ioAgenda.observe(secaoAgenda);
  } else consultaInicial();
}

/* =========================================================================
   ÁREA DA EQUIPE: agora é a página /funcionario/ (login de verdade, Supabase Auth).
   Links antigos (#/agenda, por exemplo no aviso do Telegram) e os links dos e-mails do
   Supabase (convite e "esqueci minha senha", que chegam aqui com #access_token=...&type=...)
   seguem para lá. O fragmento (#...) nunca vai para o servidor nem para o registro de acesso.
   ========================================================================= */
(function(){
  function rota(){
    var h = location.hash || "";
    if (/^#\/agenda/.test(h)) location.replace("/funcionario/");
    else if (/[#&]type=(recovery|invite)\b/.test(h) && /access_token=/.test(h)) location.replace("/funcionario/" + h);
    else if (/[#&]error_code=/.test(h) && /type=|otp_expired|access_denied/.test(h)) location.replace("/funcionario/" + h);
  }
  window.addEventListener("hashchange", rota);
  rota();
})();
