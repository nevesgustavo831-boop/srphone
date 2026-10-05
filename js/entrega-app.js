/* SR Phone · calculadora de entrega (mapa, rota, distância, tempo e valor)
   ------------------------------------------------------------------
   Módulo que NÃO vem com a página: js/entrega.js só o baixa quando a pessoa toca em "Calcular entrega".

   Como funciona:
     1. "Para onde devemos entregar?": usar a localização do celular (só depois do toque) ou digitar
        o endereço (sugestões do Google enquanto digita, ou rua, número, bairro, cidade e CEP).
     2. O ponto aparece no mapa com um pino no centro: dá para arrastar o mapa e ajustar.
     3. Confirmado o local, a função do servidor (/api/entrega) calcula a ROTA de carro da loja (A)
        até a pessoa (B) pelas ruas, e o valor com a regra de data/config.js > DELIVERY_CONFIG.
     4. Aparecem a entrega (distância, tempo e valor) e a retirada na loja (grátis). Escolhida uma
        delas, o WhatsApp abre com a mensagem organizada; a pessoa é quem envia.
   Nada de preço inventado: sem rota (serviço fora do ar, sem chave, erro), sem valor, e a pessoa
   vai para o WhatsApp. Acima do limite de km, também sem valor automático.

   Privacidade: o ponto e o endereço ficam só na memória desta página (nada em localStorage,
   sessionStorage ou cookie) e somem ao recarregar. A medição só conta eventos, sem local.

   O mapa: Leaflet (assets/vendor/leaflet, sem código de fora) com os blocos do Google Maps
   (Map Tiles API). A chave do NAVEGADOR (MAPS_BROWSER_KEY) vem da função do servidor: ela aparece
   no navegador de propósito, e quem a protege são as restrições do Google Cloud (só o domínio do
   site e só a Map Tiles API). A chave do servidor nunca chega aqui. */

const CSS_LEAFLET = new URL("../assets/vendor/leaflet/leaflet-1.9.4.css", import.meta.url).href;
const JS_LEAFLET = "../assets/vendor/leaflet/leaflet-1.9.4.esm.min.js";
const MSG_ERRO = "Não conseguimos calcular a entrega agora. Fale com a SR Phone pelo WhatsApp.";
const MSG_FORA = "Esse endereço está fora da nossa área de entrega automática.";
/* tabela de entrega ainda de exemplo (DELIVERY_CONFIG.tarifasConfirmadas false): o cliente é avisado */
const NOTA_VALOR = () => ((window.DELIVERY_CONFIG || {}).tarifasConfirmadas === true
  ? "Valor estimado pela rota. A loja confirma na conversa."
  : "Valor estimado pela rota. A tabela de entrega está em confirmação: o valor final a loja combina com você na conversa.");
const ICO = {
  local: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a1 1 0 0 1 1 1v1.07A8 8 0 0 1 19.93 11H21a1 1 0 1 1 0 2h-1.07A8 8 0 0 1 13 19.93V21a1 1 0 1 1-2 0v-1.07A8 8 0 0 1 4.07 13H3a1 1 0 1 1 0-2h1.07A8 8 0 0 1 11 4.07V3a1 1 0 0 1 1-1Zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/></svg>',
  busca: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24a1 1 0 0 1-1.42 1.42l-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/></svg>',
  loja: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16l1 5a3 3 0 0 1-5 2.24A3 3 0 0 1 12 12a3 3 0 0 1-4-.76A3 3 0 0 1 3 9l1-5Zm1 9.9V20h5v-4h4v4h5v-6.1a5 5 0 0 1-3-.66 5 5 0 0 1-4 .76 5 5 0 0 1-4-.76 5 5 0 0 1-3 .66Z"/></svg>',
  moto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM15 9h3.6L22 12.4V16h-7z"/><circle cx="7" cy="18" r="2.2"/><circle cx="17.5" cy="18" r="2.2"/></svg>',
  pino: '<svg viewBox="0 0 32 44" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 43 16 43s15-16 15-27.2C31 7.6 24.3 1 16 1Z"/><circle cx="16" cy="15.5" r="5.6"/></svg>'
};

let raiz = null, CFG = {}, painel = null, areaMapa = null;
let L = null, mapa = null, marcaA = null, marcaB = null, linha = null, sombra = null, blocos = null;
let ultimoErro = "";                       /* o código do último erro do servidor: NUNCA aparece para o cliente (fica em data-erro e em SREntrega.info()) */
let inicio = null, pedindoInicio = null, movendoPorCodigo = false, tReverso = 0, tAtrib = 0, tSugestao = 0, falhasBloco = 0;
let estado = novoEstado();

function novoEstado(){ return { passo: "", origem: "site", produto: null, local: null, complemento: "", cotacao: null, sessao: novaSessao(), aviso: "" }; }
function novaSessao(){
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (_){ /* sem crypto: gera abaixo */ }
  return "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
const reduz = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const medir = (evento, dados) => { if (window.medir) window.medir(evento, dados || {}); };
const brl = (v) => (window.BRL ? window.BRL.format(v) : "R$ " + Number(v).toFixed(2)).replace(/\s/g, " ");
const km = (v) => String(v).replace(".", ",") + " km";
const loja = () => window.STORE_CONFIG || {};

/* ---------- elementos (sempre textContent: nada que venha de fora vira HTML) ---------- */
function h(tag, props, filhos){
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})){
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "texto") el.textContent = v;
    else if (k === "icone") el.insertAdjacentHTML("afterbegin", ICO[v]);      /* ícones fixos deste arquivo */
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const f of [].concat(filhos || [])) if (f) el.append(f);
  return el;
}
const botao = (texto, fazer, classe, extra) => h("button", Object.assign({ type: "button", class: "btn " + (classe || "btn-ghost"), onclick: fazer }, extra || {}), [texto]);

/* ---------- servidor ---------- */
async function api(corpo){
  const corta = new AbortController(), relogio = setTimeout(() => corta.abort(), 15000);
  try {
    const r = await fetch(CFG.endpoint || "/api/entrega", { method: "POST", credentials: "same-origin", signal: corta.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (r.status === 429) return anota({ ok: false, erro: "limite" });
    /* 404/405: a função do servidor não foi publicada (ex.: site enviado arrastando a pasta no Netlify) */
    if (r.status === 404 || r.status === 405) return anota({ ok: false, erro: "sem_funcao" });
    const j = await r.json().catch(() => null);
    return anota(j && typeof j === "object" ? j : { ok: false, erro: "indisponivel" });
  } catch (_){
    return anota({ ok: false, erro: "indisponivel" });
  } finally { clearTimeout(relogio); }
}
function anota(r){ ultimoErro = r.ok ? "" : String(r.erro || "indisponivel").replace(/[^a-z_]/g, "").slice(0, 30); return r; }
function garanteInicio(){
  if (inicio) return Promise.resolve(true);
  if (!pedindoInicio) pedindoInicio = api({ acao: "inicio" }).then(async (r) => {
    pedindoInicio = null;
    if (!r.ok || !r.origem) return false;
    inicio = r;
    if (r.mapa) await preparaMapa().catch(() => { inicio.mapa = null; });
    return true;
  });
  return pedindoInicio;
}

/* ---------- mapa ---------- */
function carregaCss(){
  if (document.querySelector('link[data-leaflet]')) return Promise.resolve();
  return new Promise((ok) => {
    const l = h("link", { rel: "stylesheet", href: CSS_LEAFLET, "data-leaflet": "1" });
    l.onload = ok; l.onerror = ok; setTimeout(ok, 4000);
    document.head.append(l);
  });
}
/* a sessão dos blocos (Map Tiles API), criada com a mesma chave de navegador que pede os blocos */
async function sessaoDoMapa(chave){
  const corta = new AbortController(), relogio = setTimeout(() => corta.abort(), 8000);
  try {
    const r = await fetch("https://tile.googleapis.com/v1/createSession?key=" + encodeURIComponent(chave), {
      method: "POST", signal: corta.signal, credentials: "omit", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapType: "roadmap", language: "pt-BR", region: "BR", scale: "scaleFactor2x", highDpi: true }) });
    const j = r.ok ? await r.json() : null;
    if (!j || !j.session) throw new Error("sessao");
    return String(j.session);
  } finally { clearTimeout(relogio); }
}
async function preparaMapa(){
  if (mapa || !inicio || !inicio.mapa) return;
  inicio.mapa.sessao = await sessaoDoMapa(inicio.mapa.chave);
  await carregaCss();
  L = await import(JS_LEAFLET);
  areaMapa.hidden = false;
  const o = inicio.origem, t = inicio.mapa, anima = !reduz();
  mapa = L.map(areaMapa.querySelector(".ent-mapa"), { attributionControl: false, minZoom: 8, maxZoom: 19, zoomSnap: 0.5,
    zoomAnimation: anima, fadeAnimation: anima, markerZoomAnimation: anima, tap: false }).setView([o.lat, o.lng], 14);
  blocos = L.tileLayer("https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=" + encodeURIComponent(t.sessao) + "&key=" + encodeURIComponent(t.chave),
    { tileSize: 256, maxZoom: 19, minZoom: 8 }).addTo(mapa);
  blocos.on("tileerror", () => { if (++falhasBloco === 8) areaMapa.querySelector(".ent-mapa-aviso").hidden = false; });
  marcaA = L.marker([o.lat, o.lng], { keyboard: false, title: o.nome, icon: L.divIcon({ className: "ent-marca ent-marca-a", html: "<span>A</span>", iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(mapa);
  mapa.on("moveend", () => {
    atribuicao();
    if (movendoPorCodigo){ movendoPorCodigo = false; return; }
    if (estado.passo === "confirmar") pinoMovido();
  });
  atribuicao();
}
/* direitos do mapa: o texto que o Google manda para a área que está na tela */
function atribuicao(){
  if (!mapa || !inicio || !inicio.mapa) return;
  clearTimeout(tAtrib);
  tAtrib = setTimeout(async () => {
    const b = mapa.getBounds(), t = inicio.mapa;
    const u = new URL("https://tile.googleapis.com/tile/v1/viewport");
    for (const [k, v] of Object.entries({ session: t.sessao, key: t.chave, zoom: Math.round(mapa.getZoom()),
      north: b.getNorth().toFixed(5), south: b.getSouth().toFixed(5), east: b.getEast().toFixed(5), west: b.getWest().toFixed(5) })) u.searchParams.set(k, v);
    try { const j = await (await fetch(u)).json(); areaMapa.querySelector(".ent-copy").textContent = j.copyright || ""; } catch (_){ /* fica o "Google" */ }
  }, 500);
}
function moveMapa(fn){
  if (!mapa) return;
  movendoPorCodigo = true;
  fn();
  setTimeout(() => { movendoPorCodigo = false; }, reduz() ? 50 : 900);
}
function limpaRota(){
  for (const x of [linha, sombra, marcaB]) if (x) x.remove();
  linha = sombra = marcaB = null;
}
function desenhaRota(c){
  if (!mapa) return;
  mapa.invalidateSize({ animate: false });                   /* o painel mudou de tamanho: mede o mapa de novo */
  limpaRota();
  if (c.rota && c.rota.length > 1){
    sombra = L.polyline(c.rota, { color: "#150d08", weight: 9, opacity: 0.55, interactive: false }).addTo(mapa);
    linha = L.polyline(c.rota, { color: "#FF6A21", weight: 5, opacity: 1, interactive: false }).addTo(mapa);
  }
  marcaB = L.marker([c.destino.lat, c.destino.lng], { keyboard: false, title: "Local da entrega",
    icon: L.divIcon({ className: "ent-marca ent-marca-b", html: "<span>B</span>", iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(mapa);
  const limites = L.latLngBounds([[c.origem.lat, c.origem.lng], [c.destino.lat, c.destino.lng]].concat(c.rota || []));
  /* no celular o painel sobe um pouco por cima do mapa: sobra mais espaço embaixo */
  const baixo = window.matchMedia("(max-width: 899px)").matches ? 60 : 40;
  moveMapa(() => mapa.fitBounds(limites, { paddingTopLeft: [40, 40], paddingBottomRight: [40, baixo], animate: !reduz(), maxZoom: 16 }));
}
/* o pino fixo no centro: a pessoa arrasta o mapa até o lugar certo */
function pinoMovido(){
  const c = mapa.getCenter(), l = estado.local;
  if (l && Math.abs(c.lat - l.lat) < 0.00004 && Math.abs(c.lng - l.lng) < 0.00004) return;
  estado.local = { lat: c.lat, lng: c.lng, endereco: "" };
  const e = painel.querySelector(".ent-endereco");
  if (e) e.textContent = "Buscando o endereço…";
  procuraEndereco();
}
function procuraEndereco(){
  clearTimeout(tReverso);
  tReverso = setTimeout(async () => {
    const l = estado.local;
    if (!l) return;
    const r = await api({ acao: "reverso", lat: l.lat, lng: l.lng });
    if (estado.local !== l) return;                            /* a pessoa já mexeu de novo */
    l.endereco = r.ok ? r.endereco : "";
    const e = painel.querySelector(".ent-endereco");
    if (e) e.textContent = l.endereco || "Local marcado no mapa";
  }, 650);
}

/* ---------- passos da tela ---------- */
function retirada(){
  const S = loja();
  const end = [S.endereco, S.bairro, [S.cidade, S.estado].filter(Boolean).join(" - ")].filter(Boolean).join("\n");
  return h("div", { class: "ent-opcao-card" }, [
    h("div", { class: "ent-opcao-topo" }, [h("span", { class: "ent-opcao-ico", icone: "loja" }), h("b", { texto: "Retirar na SR Phone" }), h("span", { class: "ent-gratis", texto: brl(0) })]),
    h("p", { class: "ent-opcao-end", texto: end }),
    h("a", { class: "btn btn-ghost ent-btn", href: linkZap(mensagemRetirada()), target: "_blank", rel: "noopener noreferrer",
      onclick: () => medir("delivery_choose", { tipo: "retirada", origem: estado.origem }) }, ["Escolher retirada"])
  ]);
}
function titulo(t, sub){ return [h("h3", { class: "ent-h", texto: t }), sub ? h("p", { class: "ent-sub", texto: sub }) : null]; }
function aviso(t, tipo){ return t ? h("p", { class: "ent-aviso" + (tipo ? " " + tipo : ""), role: tipo === "erro" ? "alert" : null, texto: t }) : null; }
function voltar(texto, fazer){ return h("button", { type: "button", class: "ent-link", onclick: fazer, texto }); }

const PASSOS = {
  carregando: () => [h("p", { class: "ent-carregando", texto: "Abrindo o mapa…" })],
  inicio: () => [
    ...titulo("Para onde devemos entregar?"),
    aviso(estado.aviso),
    h("div", { class: "ent-escolhas" }, [
      h("button", { type: "button", class: "ent-escolha principal", onclick: usarLocalizacao }, [
        h("span", { class: "ent-escolha-ico", icone: "local" }), h("span", {}, [h("b", { texto: "Usar minha localização" }), h("small", { texto: "O navegador vai pedir sua permissão" })])]),
      h("button", { type: "button", class: "ent-escolha", onclick: () => mostra("endereco") }, [
        h("span", { class: "ent-escolha-ico", icone: "busca" }), h("span", {}, [h("b", { texto: "Digitar endereço" }), h("small", { texto: "Rua, avenida, shopping, bairro ou CEP" })])])
    ]),
    retirada()
  ],
  localizando: () => [
    ...titulo("Procurando sua localização…", "Se o navegador perguntar, toque em Permitir."),
    h("p", { class: "ent-carregando" }),
    voltar("Prefiro digitar o endereço", () => mostra("endereco"))
  ],
  endereco: () => {
    const lista = h("ul", { class: "ent-sugestoes", id: "ent-sugestoes", role: "listbox", hidden: true, "aria-label": "Sugestões de endereço" });
    const campo = h("input", { id: "ent-busca", type: "search", class: "ent-campo", autocomplete: "off", enterkeyhint: "search", maxlength: "120",
      placeholder: "Rua, avenida, shopping ou CEP", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": "ent-sugestoes" });
    campo.addEventListener("input", () => sugere(campo, lista));
    campo.addEventListener("keydown", (e) => teclaSugestao(e, campo, lista));
    const partes = h("details", { class: "ent-partes" }, [
      h("summary", { texto: "Prefiro preencher rua, número, bairro e CEP" }),
      h("form", { class: "ent-form", novalidate: true, onsubmit: (e) => { e.preventDefault(); buscaPorPartes(e.target); } }, [
        campoRotulado("Rua", "rua", { autocomplete: "address-line1", maxlength: "90" }),
        h("div", { class: "ent-linha" }, [campoRotulado("Número", "numero", { inputmode: "numeric", maxlength: "20" }), campoRotulado("CEP", "cep", { inputmode: "numeric", autocomplete: "postal-code", maxlength: "9" })]),
        campoRotulado("Bairro", "bairro", { maxlength: "90" }),
        campoRotulado("Cidade", "cidade", { value: loja().cidade || "", autocomplete: "address-level2", maxlength: "40" }),
        h("button", { type: "submit", class: "btn btn-primary ent-btn" }, ["Buscar no mapa"])
      ])
    ]);
    setTimeout(() => campo.focus({ preventScroll: true }), 60);
    return [
      ...titulo("Para onde devemos entregar?"),
      aviso(estado.aviso, estado.aviso ? "erro" : ""),
      h("label", { class: "ent-rotulo", for: "ent-busca", texto: "Endereço de entrega" }),
      h("div", { class: "ent-busca" }, [h("span", { class: "ent-busca-ico", icone: "busca" }), campo]),
      lista,
      h("p", { class: "ent-fonte", texto: "Sugestões de endereço: Google" }),
      partes,
      voltar("Usar minha localização", usarLocalizacao)
    ];
  },
  confirmar: () => [
    ...titulo("Confira o local da entrega", mapa ? "Arraste o mapa para colocar o pino no lugar certo." : ""),
    h("p", { class: "ent-endereco", texto: (estado.local && estado.local.endereco) || "Buscando o endereço…" }),
    h("label", { class: "ent-rotulo", for: "ent-compl", texto: "Número, apartamento ou referência (opcional)" }),
    h("input", { id: "ent-compl", class: "ent-campo", maxlength: "80", autocomplete: "address-line2", value: estado.complemento,
      oninput: (e) => { estado.complemento = e.target.value; } }),
    h("button", { type: "button", class: "btn btn-primary btn-lg ent-btn", onclick: calcula }, ["Confirmar local"]),
    voltar("Buscar outro endereço", () => mostra("endereco"))
  ],
  calculando: () => [...titulo("Calculando a rota…"), h("p", { class: "ent-carregando" })],
  resultado: () => {
    const c = estado.cotacao;
    return [
      ...titulo("Como você prefere receber?"),
      h("div", { class: "ent-opcao-card escolhida" }, [
        h("div", { class: "ent-opcao-topo" }, [h("span", { class: "ent-opcao-ico", icone: "moto" }), h("b", { texto: "Entrega SR Phone" }), h("span", { class: "ent-valor", texto: brl(c.valor) })]),
        h("p", { class: "ent-rota-info" }, [h("span", { texto: km(c.distanciaKm) }), h("span", { texto: "aproximadamente " + c.duracaoMin + " min" })]),
        h("p", { class: "ent-nota", texto: NOTA_VALOR() }),
        h("a", { class: "btn btn-primary btn-lg ent-btn", href: linkZap(mensagemEntrega()), target: "_blank", rel: "noopener noreferrer", "data-zap": "entrega",
          onclick: () => medir("delivery_choose", { tipo: "entrega", origem: estado.origem }) }, ["Escolher esta entrega"])
      ]),
      retirada(),
      h("p", { class: "ent-destino", texto: "Entrega em: " + enderecoTexto() }),
      voltar("Alterar endereço", () => defineLocal(estado.local))
    ];
  },
  fora: () => [
    ...titulo("Fora da área de entrega"),
    aviso(MSG_FORA, "erro"),
    h("a", { class: "btn btn-primary btn-lg ent-btn", href: linkZap(mensagemFora()), target: "_blank", rel: "noopener noreferrer", "data-zap": "entrega",
      onclick: () => medir("delivery_choose", { tipo: "consulta", origem: estado.origem }) }, ["Consultar entrega pelo WhatsApp"]),
    retirada(),
    voltar("Alterar endereço", () => mostra("endereco"))
  ],
  erro: () => [
    /* o topo da janela já diz "Calcular entrega": aqui vai direto ao aviso */
    aviso(estado.aviso || MSG_ERRO, "erro"),
    h("a", { class: "btn btn-primary btn-lg ent-btn", href: linkZap(mensagemErro()), target: "_blank", rel: "noopener noreferrer", "data-zap": "entrega",
      onclick: () => medir("delivery_choose", { tipo: "consulta", origem: estado.origem }) }, ["Falar com a SR Phone no WhatsApp"]),
    retirada(),
    h("p", { class: "ent-nota", texto: "A retirada na loja não tem custo. A entrega a equipe combina com você pela conversa." }),
    inicio && estado.local ? voltar("Tentar de novo", calcula) : null
  ]
};
function campoRotulado(rotulo, nome, extra){
  const id = "ent-" + nome;
  return h("div", { class: "ent-campo-g" }, [h("label", { class: "ent-rotulo", for: id, texto: rotulo }),
    h("input", Object.assign({ id, name: nome, class: "ent-campo", autocomplete: "off" }, extra || {}))]);
}
function mostra(passo){
  estado.passo = passo;
  raiz.setAttribute("data-passo", passo);
  /* o motivo técnico (sem_chave, sem_funcao, chave_invalida...) fica só no atributo, para a loja
     conferir no navegador (PRODUCAO-SRPHONE.md, item 13); a tela mostra só a mensagem clara */
  if (passo === "erro" && ultimoErro) raiz.setAttribute("data-erro", ultimoErro); else raiz.removeAttribute("data-erro");
  const conteudo = (PASSOS[passo] || PASSOS.inicio)();
  painel.replaceChildren(...conteudo.filter(Boolean));
  painel.scrollTop = 0;
  if (passo !== "endereco" && passo !== "inicio") estado.aviso = "";
  raiz.classList.toggle("sem-mapa", areaMapa.hidden);
  const alvo = areaMapa.querySelector(".ent-alvo");
  alvo.hidden = !(mapa && passo === "confirmar");
  areaMapa.querySelector(".ent-mapa-dica").hidden = alvo.hidden;
  if (passo === "confirmar") limpaRota();
  if (mapa) setTimeout(() => mapa.invalidateSize(), 60);
}

/* ---------- localização do celular (só depois do toque em "Usar minha localização") ---------- */
function usarLocalizacao(){
  if (!navigator.geolocation){
    estado.aviso = "Este navegador não informa a localização. Digite o endereço.";
    return mostra("endereco");
  }
  mostra("localizando");
  navigator.geolocation.getCurrentPosition((pos) => {
    if (estado.passo !== "localizando") return;
    medir("delivery_location", { tipo: "permitida" });
    defineLocal({ lat: pos.coords.latitude, lng: pos.coords.longitude, endereco: "" });
  }, (err) => {
    if (estado.passo !== "localizando") return;
    const negada = err && err.code === 1;
    medir("delivery_location", { tipo: negada ? "negada" : "erro" });
    estado.aviso = negada ? "Você não permitiu o uso da localização. Tudo bem: digite o endereço de entrega."
      : "Não conseguimos encontrar sua localização agora. Digite o endereço de entrega.";
    mostra("endereco");
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}
function defineLocal(local){
  estado.local = local;
  estado.cotacao = null;
  mostra("confirmar");
  if (mapa) moveMapa(() => mapa.setView([local.lat, local.lng], 17, { animate: !reduz() }));
  if (!local.endereco) procuraEndereco();
}

/* ---------- endereço: sugestões enquanto digita ---------- */
function sugere(campo, lista){
  clearTimeout(tSugestao);
  const t = campo.value.trim();
  if (t.length < 3 || /^\d{5}-?\d{0,3}$/.test(t)){ fechaLista(campo, lista); return; }
  tSugestao = setTimeout(async () => {
    const r = await api({ acao: "sugestoes", texto: t, sessao: estado.sessao });
    if (campo.value.trim() !== t) return;
    if (!r.ok){
      if (r.erro !== "limite"){ estado.aviso = MSG_ERRO; mostra("erro"); }
      return;
    }
    lista.replaceChildren(...r.sugestoes.map((s, i) => {
      const li = h("li", { role: "option", id: "ent-sug-" + i, "aria-selected": "false", class: "ent-sugestao",
        onclick: () => escolheSugestao(s) }, [h("b", { texto: s.principal }), h("small", { texto: s.secundario })]);
      li.addEventListener("mousedown", (e) => e.preventDefault());
      return li;
    }));
    if (!r.sugestoes.length) lista.replaceChildren(h("li", { class: "ent-sem", texto: "Nenhum endereço encontrado. Confira ou preencha por partes." }));
    lista.hidden = false; campo.setAttribute("aria-expanded", "true");
  }, 300);
}
function fechaLista(campo, lista){ lista.hidden = true; lista.replaceChildren(); campo.setAttribute("aria-expanded", "false"); campo.removeAttribute("aria-activedescendant"); }
function teclaSugestao(e, campo, lista){
  const itens = Array.from(lista.querySelectorAll(".ent-sugestao"));
  let i = itens.findIndex((x) => x.getAttribute("aria-selected") === "true");
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){
    if (!itens.length) return;
    e.preventDefault();
    i = e.key === "ArrowDown" ? (i + 1) % itens.length : (i <= 0 ? itens.length - 1 : i - 1);
    itens.forEach((x, k) => x.setAttribute("aria-selected", k === i ? "true" : "false"));
    campo.setAttribute("aria-activedescendant", itens[i].id);
  } else if (e.key === "Enter"){
    e.preventDefault();
    if (i >= 0) itens[i].click();
    else if (/^\d{5}-?\d{3}$/.test(campo.value.trim())) buscaCep(campo.value.trim());
    else if (itens.length) itens[0].click();
  } else if (e.key === "Escape" && !lista.hidden){
    e.preventDefault(); e.stopPropagation(); fechaLista(campo, lista);
  }
}
async function escolheSugestao(s){
  mostra("calculando");
  const r = await api({ acao: "lugar", id: s.id, sessao: estado.sessao });
  estado.sessao = novaSessao();                               /* a sessão de sugestões termina aqui */
  if (!r.ok || !r.local){ return falhou(r.erro === "nao_encontrado" ? "Não achamos esse endereço no mapa. Tente de outro jeito." : ""); }
  defineLocal(r.local);
}
async function buscaCep(cep){ return buscaEndereco({ cep }); }
function buscaPorPartes(form){
  const d = Object.fromEntries(new FormData(form).entries());
  if (!String(d.rua || "").trim() && String(d.cep || "").replace(/\D/g, "").length !== 8){
    estado.aviso = "Preencha a rua ou o CEP.";
    return mostra("endereco");
  }
  buscaEndereco(d);
}
async function buscaEndereco(d){
  mostra("calculando");
  const r = await api(Object.assign({ acao: "endereco" }, d));
  if (!r.ok || !r.local){
    if (r.erro === "nao_encontrado" || r.erro === "invalido"){ estado.aviso = "Não achamos esse endereço. Confira os dados ou tente as sugestões."; return mostra("endereco"); }
    return falhou();
  }
  if (d.numero) estado.complemento = estado.complemento || "";
  defineLocal(r.local);
}
function falhou(texto){
  estado.aviso = texto || "";
  medir("delivery_quote", { tipo: "erro", origem: estado.origem });
  avisa({ tipo: "erro" });
  mostra("erro");
}

/* ---------- a rota e o valor (vêm do servidor, nunca daqui) ---------- */
async function calcula(){
  if (!estado.local) return mostra("endereco");
  mostra("calculando");
  const l = estado.local;
  const r = await api({ acao: "rota", lat: l.lat, lng: l.lng });
  if (estado.local !== l) return;
  if (!r.ok){
    return falhou(r.erro === "sem_rota" ? "Não encontramos um caminho de carro até esse ponto. Ajuste o local ou fale com a SR Phone pelo WhatsApp." : "");
  }
  if (r.foraDaArea){
    estado.cotacao = null;
    medir("delivery_quote", { tipo: "fora", origem: estado.origem });
    avisa({ tipo: "fora" });
    mostra("fora");
    return desenhaRota({ origem: r.origem || inicio.origem, destino: { lat: l.lat, lng: l.lng }, rota: [] });
  }
  estado.cotacao = { distanciaKm: r.distanciaKm, duracaoMin: r.duracaoMin, valor: r.valor, rota: r.rota, origem: r.origem, destino: r.destino };
  medir("delivery_quote", { tipo: "dentro", origem: estado.origem });
  avisa({ tipo: "calculada", distanciaKm: r.distanciaKm, duracaoMin: r.duracaoMin, valor: r.valor });
  mostra("resultado");
  desenhaRota(estado.cotacao);
}
/* o resto do site (ex.: o assistente) fica sabendo SÓ dos números calculados */
function avisa(d){ window.dispatchEvent(new CustomEvent("sr:entrega", { detail: Object.assign({ origem: estado.origem, produtoId: estado.produto ? estado.produto.id : "" }, d) })); }

/* ---------- mensagens do WhatsApp (a pessoa confere e envia) ---------- */
function linkZap(linhas){
  if (typeof window.zapLinhas === "function") return window.zapLinhas(linhas);
  return "https://wa.me/" + String(loja().whatsapp || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(linhas.join("\n"));
}
function enderecoTexto(){
  const e = String((estado.local && estado.local.endereco) || "").replace(/,\s*Brasil$/i, "");
  return [e || "Local marcado no mapa", String(estado.complemento || "").trim()].filter(Boolean).join(" · ");
}
function pontoNoMapa(){
  const l = estado.local;
  return l ? ["", "Ponto no mapa:", "https://www.google.com/maps/search/?api=1&query=" + l.lat.toFixed(6) + "," + l.lng.toFixed(6)] : [];
}
const OLA = ["Olá, vim pelo site da SR Phone.", ""];
/* o produto, do catálogo do site: nome com armazenamento, cor e o preço que está no site */
function linhasProduto(){
  const p = estado.produto;
  if (!p) return [];
  return ["Produto:", [p.nome, p.armazenamento].filter(Boolean).join(" "), "", ...(p.cor ? ["Cor:", p.cor, ""] : []),
    ...(p.preco > 0 ? ["Preço no site:", brl(p.preco), ""] : [])];
}
const linhasEndereco = () => ["Endereço:", enderecoTexto(), ...pontoNoMapa(), ""];
function mensagemEntrega(){
  const c = estado.cotacao;
  return [...OLA, ...linhasProduto(), ...linhasEndereco(), "Distância:", km(c.distanciaKm), "", "Tempo estimado:", c.duracaoMin + " min", "",
    "Entrega estimada:", brl(c.valor), "", estado.produto ? "Gostaria de confirmar o pedido e a entrega." : "Gostaria de confirmar a entrega."];
}
function mensagemRetirada(){
  return [...OLA, ...linhasProduto(), "Retirada na loja:", "Retirar na SR Phone (" + brl(0) + ")", "", estado.produto ? "Gostaria de confirmar o pedido e retirar na loja." : "Gostaria de retirar na loja."];
}
function mensagemFora(){
  return [...OLA, ...linhasProduto(), ...linhasEndereco(), "Esse endereço ficou fora da área de entrega automática do site. Vocês conseguem entregar aqui?"];
}
function mensagemErro(){
  return [...OLA, ...linhasProduto(), ...(estado.local ? linhasEndereco() : []), "Gostaria de calcular a entrega do meu pedido."];
}

/* ---------- o produto (contexto do pedido): sempre do catálogo do site, nunca copiado ----------
   abrir({ produto: "iphone-17" }) ou abrir({ produto: { id: "iphone-17", opcao: "256 GB", cor: "Preto" } });
   sem produto, vale o que está aberto na página do produto. */
function contextoProduto(pedido){
  const W = window;
  if (typeof W.escolhaDe !== "function") return null;
  let p = null, iOp = 0, iCor = 0;
  if (pedido){
    const id = typeof pedido === "string" ? pedido : pedido.id;
    p = typeof W.produtoPorId === "function" ? W.produtoPorId(String(id || "")) : null;
    if (p && typeof pedido === "object"){
      iOp = Math.max(0, (p.opcoes || []).indexOf(pedido.opcao));
      iCor = Math.max(0, (p.cores || []).findIndex((c) => c && c[0] === pedido.cor));
    }
  }
  if (!p){
    const pdp = document.getElementById("pdp");
    if (!pdp || pdp.hidden || !W.pdpAtual) return null;
    p = W.pdpAtual; iOp = W.pdpCap || 0; iCor = W.pdpCor || 0;
  }
  const e = W.escolhaDe(p, iOp, iCor);
  return { id: p.id, nome: p.nome, armazenamento: e.opcao || "", cor: e.cor || "", preco: Number(e.preco) > 0 ? Number(e.preco) : null };
}
function montaEsqueleto(){
  raiz.replaceChildren(h("div", { class: "ent-caixa" }, [
    h("header", { class: "ent-topo" }, [
      h("h2", { id: "ent-titulo", texto: "Calcular entrega" }),
      h("button", { type: "button", class: "ent-fechar", "aria-label": "Fechar a calculadora de entrega", onclick: fechar, texto: "×" })
    ]),
    h("div", { class: "ent-corpo" }, [
      areaMapa = h("div", { class: "ent-mapa-area", hidden: true }, [
        h("div", { class: "ent-mapa", role: "region", "aria-label": "Mapa com a loja (A) e o local da entrega (B)" }),
        h("div", { class: "ent-alvo", hidden: true, "aria-hidden": "true", icone: "pino" }),
        h("p", { class: "ent-mapa-dica", hidden: true, texto: "Arraste o mapa para ajustar" }),
        h("p", { class: "ent-mapa-aviso", hidden: true, texto: "O mapa não carregou agora, mas o cálculo continua pelo endereço." }),
        h("div", { class: "ent-atrib" }, [h("b", { texto: "Google" }), h("span", { class: "ent-copy" })])
      ]),
      painel = h("div", { class: "ent-painel", "aria-live": "polite" })
    ])
  ]));
}
function fechar(){
  if (raiz.hidden) return;
  if (typeof window.fechaJanela === "function") window.fechaJanela(raiz); else raiz.hidden = true;
}
export function abrir(o){
  o = o || {};
  estado.origem = o.origem || "site";
  estado.produto = contextoProduto(o.produto) || estado.produto;
  if (raiz.hidden){
    if (typeof window.abreJanela === "function") window.abreJanela(raiz, fechar, raiz.querySelector(".ent-fechar"));
    else raiz.hidden = false;
  }
  medir("delivery_open", { origem: estado.origem });
  if (!inicio) mostra("carregando");
  garanteInicio().then((ok) => {
    if (!ok){ estado.aviso = ""; return mostra("erro"); }
    if (o.modo === "localizacao") return usarLocalizacao();
    if (o.modo === "endereco") return mostra("endereco");
    if (estado.cotacao){ mostra("resultado"); desenhaRota(estado.cotacao); return; }
    if (estado.local) return mostra("confirmar");
    mostra("inicio");
  });
}
export function info(){
  return { passo: estado.passo, mapa: !!mapa, pronto: !!inicio, produto: estado.produto, erro: ultimoErro,
    cotacao: estado.cotacao ? { distanciaKm: estado.cotacao.distanciaKm, duracaoMin: estado.cotacao.duracaoMin, valor: estado.cotacao.valor } : null };
}
/* teclado aberto no celular (a área visível encolhe com um campo em foco): o mapa sai de cena para
   o campo e os botões ficarem à vista; quando o teclado fecha, o mapa volta */
function acompanhaTeclado(){
  const vv = window.visualViewport;
  if (!vv) return;
  const ajusta = () => {
    const f = document.activeElement;
    const aberto = !raiz.hidden && vv.height < window.innerHeight * 0.75 && raiz.contains(f) && /^(INPUT|TEXTAREA)$/.test(f.tagName);
    if (raiz.classList.contains("com-teclado") === aberto) return;
    raiz.classList.toggle("com-teclado", aberto);
    if (!aberto && mapa) setTimeout(() => mapa.invalidateSize(), 60);
  };
  vv.addEventListener("resize", ajusta);
  raiz.addEventListener("focusin", () => setTimeout(ajusta, 300));
  raiz.addEventListener("focusout", () => setTimeout(ajusta, 300));
}
export function iniciar(opcoes){
  raiz = opcoes.raiz; CFG = opcoes.CFG || {};
  montaEsqueleto();
  acompanhaTeclado();
  return { abrir, info };
}
