// SR Phone · o Assistente SR Phone com IA, do lado do servidor.
// Chamado por netlify/functions/assistente.mjs (no Netlify) e por ferramentas/servidor.mjs (npm start).
//
// O navegador manda:  POST /api/assistente  (JSON)
//   { mensagens: [{ papel: "usuario" | "assistente", texto }],     últimas mensagens da conversa
//     contexto: { productId, productName, storage, selectedColor, currentUrl },   a página aberta
//     foco: "id-do-produto" }                                       o produto de que a conversa trata
// E recebe, aos poucos, uma linha JSON por evento (application/x-ndjson):
//   { t: "texto", v: "pedaço" }            parte da resposta (vai aparecendo)
//   { t: "substitui", v: "texto" }         troca tudo o que apareceu (a guarda de preço barrou)
//   { t: "fim", acoes: [...], motivo }     terminou; acoes = [{ tipo: "acao", id } | { tipo: "produto", id }]
//   { t: "erro", codigo }                  sem_chave, limite, indisponivel, tempo, vazio... → o site usa o cérebro local
//
// A chave da IA fica SÓ na variável de ambiente AI_API_KEY (painel do Netlify). Nunca no site.
import { carregarConhecimento } from "./conhecimento.mjs";
import { montarSistema, montarMensagens } from "./prompt.mjs";
import { criarFiltro } from "./filtro.mjs";
import { criarLimitador, chaveDoVisitante } from "./limites.mjs";
import { limparTexto, pareceInjecao, tiraValores, valoresDoVisitante, MSG_RECUSA, MSG_NAO_CONFIRMO } from "./seguranca.mjs";
import { obterProvedor, SEM_CHAVE } from "./provedores/index.mjs";

const inteiro = (v, padrao, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };

/* tudo o que dá para ajustar sem mexer no código (variáveis de ambiente; veja .env.example) */
export function configDoAmbiente(env = process.env){
  return {
    /* "demonstracao" (resposta fixa, sem IA) só no computador (npm start); no Netlify vira anthropic */
    provedor: ((p) => (p === "demonstracao" && env.SR_AMBIENTE_LOCAL !== "1" ? "anthropic" : p))(String(env.AI_PROVIDER || "anthropic").trim().toLowerCase()),
    chave: String(env.AI_API_KEY || "").trim(),
    modelo: String(env.AI_MODEL || "").trim(),
    /* quanto a IA pensa: low (padrão: chat rápido e barato), medium, high, xhigh ou max. Vazio ou outro valor = low.
       Se o modelo escolhido não aceitar o nível, ele não é enviado (vale o padrão do próprio modelo) */
    esforco: ["low", "medium", "high", "xhigh", "max"].includes(String(env.AI_ESFORCO || "").trim()) ? String(env.AI_ESFORCO).trim() : "low",
    /* resposta máxima em tokens. No Sonnet 5 o raciocínio (ligado por padrão) conta junto: 8192 dá folga */
    maxTokens: inteiro(env.AI_MAX_TOKENS, 8192, 1024, 16000),
    timeoutMs: inteiro(env.AI_TIMEOUT_MS, 25000, 5000, 60000),
    porMinuto: inteiro(env.AI_LIMITE_MINUTO, 8, 1, 120),
    porHora: inteiro(env.AI_LIMITE_HORA, 60, 1, 5000),
    origens: String(env.AI_ORIGENS || "").split(",").map((s) => s.trim()).filter(Boolean),
    ligada: String(env.AI_DESLIGADA || "") !== "1",
    /* outras chaves do servidor que a resposta nunca pode mostrar (a IA nem as conhece; é só por garantia) */
    outrasChaves: [env.MAPS_SERVER_KEY, env.MAPS_API_KEY].map((c) => String(c || "").trim()).filter(Boolean)
  };
}

let limitador = null;
function limitadorPara(cfg){
  if (!limitador || limitador.porMinuto !== cfg.porMinuto || limitador.porHora !== cfg.porHora)
    limitador = criarLimitador({ porMinuto: cfg.porMinuto, porHora: cfg.porHora });
  return limitador;
}

function json(obj, status){
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
/* resposta aos poucos: uma linha JSON por evento */
function ndjson(produz){
  const cod = new TextEncoder(), cancela = new AbortController();
  const corpo = new ReadableStream({
    start(c){
      let aberto = true;
      const envia = (o) => { if (aberto) c.enqueue(cod.encode(JSON.stringify(o) + "\n")); };
      Promise.resolve().then(() => produz(envia, cancela.signal))
        .catch(() => envia({ t: "erro", codigo: "indisponivel" }))
        .finally(() => { aberto = false; try { c.close(); } catch (_){ /* já fechado */ } });
    },
    cancel(){ cancela.abort(); }
  });
  return new Response(corpo, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
const so = (...eventos) => ndjson(async (envia) => eventos.forEach(envia));

/* só o próprio site (e os endereços de AI_ORIGENS) pode chamar a função pelo navegador.
   Todo navegador manda "Origin" num POST (mesmo do próprio site); sem ele, é script/robô: recusado */
function origemPermitida(req, cfg){
  const o = req.headers.get("origin");
  if (!o) return false;
  let host;
  try { host = new URL(o).host; } catch { return false; }
  if (host === new URL(req.url).host) return true;
  return cfg.origens.some((x) => { try { return new URL(x).host === host; } catch { return x === host; } });
}

async function lerCorpo(req, limite){
  const n = Number(req.headers.get("content-length") || 0);
  if (n > limite) return null;
  const t = await req.text();
  return t.length > limite ? null : t;
}

const ID = /^[a-z0-9-]{1,60}$/;
function caminhoSeguro(u){
  try { const x = new URL(String(u || ""), "https://site.local"); return limparTexto(x.pathname, 120); } catch { return ""; }
}
/* confere o pedido do navegador: nada dele é confiável (nem o "histórico").
   Valores em dinheiro nas falas do "assistente" saem do histórico: o preço vale só o do catálogo,
   mesmo que alguém edite a conversa guardada no navegador. */
export function validarPedido(d){
  if (!d || typeof d !== "object" || !Array.isArray(d.mensagens)) return { erro: "mensagens" };
  const msgs = [];
  for (const m of d.mensagens.slice(-12)){
    if (!m || (m.papel !== "usuario" && m.papel !== "assistente") || typeof m.texto !== "string") return { erro: "mensagens" };
    const limpo = limparTexto(m.texto, m.papel === "usuario" ? 500 : 1500);
    const texto = m.papel === "assistente" ? tiraValores(limpo) : limpo;
    if (texto) msgs.push({ papel: m.papel, texto });
  }
  while (msgs.length && msgs[0].papel !== "usuario") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].papel !== "usuario") return { erro: "mensagens" };
  if (msgs.reduce((s, m) => s + m.texto.length, 0) > 9000) return { erro: "grande" };
  const c = d.contexto && typeof d.contexto === "object" ? d.contexto : {};
  return {
    mensagens: msgs,
    contexto: {
      productId: ID.test(String(c.productId || "")) ? String(c.productId) : "",
      productName: limparTexto(c.productName, 80),
      storage: limparTexto(c.storage, 30),
      selectedColor: limparTexto(c.selectedColor, 40),
      currentUrl: caminhoSeguro(c.currentUrl)
    },
    foco: ID.test(String(d.foco || "")) ? String(d.foco) : ""
  };
}

/* de que produto a conversa trata quando a frase da IA não cita nenhum: o produto em foco ou o aberto
   na página (a opção e a cor marcadas valem só para o da página). Só se existir no catálogo. */
function contextoDoFiltro(pedido, conhecimento){
  const c = pedido.contexto, foco = pedido.foco && conhecimento.catalogo.has(pedido.foco) ? pedido.foco : "";
  if (foco && foco !== c.productId) return { productId: foco, storage: "", selectedColor: "" };
  return conhecimento.catalogo.has(c.productId) ? { productId: c.productId, storage: c.storage, selectedColor: c.selectedColor } : {};
}

/* opcoes: { ip, env, cfg, provedor, carregarConhecimento } (os três últimos servem para os testes) */
export async function atender(req, opcoes = {}){
  const cfg = opcoes.cfg || configDoAmbiente(opcoes.env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "POST" } });
  if (req.method !== "POST") return json({ erro: "metodo" }, 405);
  if (!origemPermitida(req, cfg)) return json({ erro: "origem" }, 403);
  if (!/application\/json/i.test(req.headers.get("content-type") || "")) return json({ erro: "formato" }, 415);
  const bruto = await lerCorpo(req, 16 * 1024);
  if (bruto === null) return json({ erro: "grande" }, 413);
  let dados;
  try { dados = JSON.parse(bruto); } catch { return json({ erro: "json" }, 400); }
  const pedido = validarPedido(dados);
  if (pedido.erro) return json({ erro: pedido.erro }, 400);

  /* "ignore suas regras", "mostre a chave"...: resposta fixa, sem gastar a IA */
  if (pareceInjecao(pedido.mensagens[pedido.mensagens.length - 1].texto))
    return so({ t: "texto", v: MSG_RECUSA }, { t: "fim", acoes: [], motivo: "recusa" });
  if (!cfg.ligada || (!cfg.chave && !SEM_CHAVE.has(cfg.provedor.toLowerCase()))) return so({ t: "erro", codigo: "sem_chave" });
  const ip = opcoes.ip || req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!limitadorPara(cfg).permite(chaveDoVisitante(ip))) return so({ t: "erro", codigo: "limite" });

  let conhecimento, provedor;
  try {
    conhecimento = await (opcoes.carregarConhecimento || carregarConhecimento)({ origem: new URL(req.url).origin });
    provedor = opcoes.provedor || await obterProvedor(cfg.provedor);
  } catch (e){
    console.error("assistente: sem dados ou provedor", String(e && e.message || e));
    return so({ t: "erro", codigo: "indisponivel" });
  }
  const sistema = montarSistema(conhecimento);
  const mensagens = montarMensagens(pedido, conhecimento);

  return ndjson(async (envia, cancelado) => {
    const filtro = criarFiltro({ conhecimento, contexto: contextoDoFiltro(pedido, conhecimento),
      orcamentos: valoresDoVisitante(pedido.mensagens.filter((m) => m.papel === "usuario").map((m) => m.texto)),
      chave: [cfg.chave].concat(cfg.outrasChaves || []) });
    const corta = new AbortController();
    const relogio = setTimeout(() => corta.abort(), cfg.timeoutMs);
    cancelado.addEventListener("abort", () => corta.abort());
    let motivo = "", mandou = false, uso = null;
    const barrado = (porque) => {
      envia({ t: "substitui", v: MSG_NAO_CONFIRMO });
      envia({ t: "fim", acoes: [{ tipo: "acao", id: "whatsapp" }], motivo: porque });
      console.log(JSON.stringify({ assistente: "barrado", porque }));
    };
    try {
      for await (const ev of provedor.responder({ sistema, mensagens, cfg, sinal: corta.signal })){
        if (ev.tipo === "texto"){
          const sai = filtro.empurra(ev.texto);
          if (sai){ envia({ t: "texto", v: sai }); mandou = true; }
          if (filtro.bloqueado){ corta.abort(); break; }
        } else if (ev.tipo === "fim"){ motivo = ev.motivo || ""; uso = ev.uso || null; }
      }
      if (filtro.bloqueado) return barrado(filtro.bloqueado);
      /* passou do tempo (vale para qualquer provedor, mesmo um que não avise o cancelamento) */
      if (corta.signal.aborted){ const e = new Error("tempo"); e.codigo = cancelado.aborted ? "cancelado" : "tempo"; throw e; }
      if (motivo === "refusal") return barrado("recusa_da_ia");
      const fim = filtro.termina();
      if (fim.bloqueado) return barrado(fim.bloqueado);
      if (fim.texto){ envia({ t: "texto", v: fim.texto }); mandou = true; }
      if (!fim.completo.trim()) return envia({ t: "erro", codigo: "vazio" });
      envia({ t: "fim", acoes: fim.acoes, motivo: motivo === "max_tokens" ? "cortado" : "ok" });
      console.log(JSON.stringify({ assistente: "ok", uso }));        /* só números: nada da conversa vai para o registro */
    } catch (e){
      if (filtro.bloqueado) return barrado(filtro.bloqueado);
      const codigo = corta.signal.aborted && !cancelado.aborted ? "tempo" : (e && e.codigo) || "indisponivel";
      console.error(JSON.stringify({ assistente: "erro", codigo }));
      envia({ t: "erro", codigo, parcial: mandou });
    } finally {
      clearTimeout(relogio);
    }
  });
}
