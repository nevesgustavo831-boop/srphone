// SR Phone · cálculo de entrega, do lado do servidor.
// Chamado por netlify/functions/entrega.mjs (no Netlify) e por ferramentas/servidor.mjs (npm start).
//
// O navegador manda:  POST /api/entrega  (JSON) com { acao, ... }
//   inicio                          → a loja (ponto A) e a chave de navegador dos blocos do mapa
//   sugestoes { texto, sessao }     → sugestões de endereço enquanto digita
//   lugar     { id, sessao }        → o ponto do endereço escolhido na lista
//   endereco  { rua, numero, bairro, cidade, cep } → o ponto de um endereço digitado por partes
//   reverso   { lat, lng }          → o endereço de um ponto (localização do celular, pino ajustado)
//   rota      { lat, lng }          → distância e tempo da ROTA da loja até o ponto, valor e desenho
// E recebe { ok: true, ... } ou { ok: false, erro } (sem_chave, limite, indisponivel, sem_rota,
// nao_encontrado, invalido...). Sem valor inventado: sem rota, sem preço.
//
// Privacidade: o ponto e o endereço da pessoa só passam por aqui para calcular. Nada é guardado
// e nada vai para o registro (só o tipo do pedido e o resultado: ok ou o código do erro).
// As chaves ficam SÓ nas variáveis de ambiente do Netlify:
//   MAPS_SERVER_KEY  (só aqui no servidor: Routes, Places New e Geocoding; nunca vai para o navegador).
//                    O nome antigo MAPS_API_KEY ainda é aceito, para não quebrar quem já configurou.
//   MAPS_BROWSER_KEY (blocos do mapa no navegador, Map Tiles API). Ela aparece no navegador de
//                    propósito: quem a protege são as restrições do Google Cloud (domínio e API).
import { lerDadosDoSite } from "../dados-site.mjs";
import { obterProvedorMapa } from "./provedores/index.mjs";
import { buscaCep } from "./cep.mjs";
import { criarLimitador, chaveDoVisitante } from "../ai/limites.mjs";
import { limparTexto } from "../ai/seguranca.mjs";

const inteiro = (v, padrao, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };
const RAIO_MAX_KM = 300;                 /* além disso nem se consulta o mapa (abuso ou engano) */

export function configDoAmbiente(env = process.env){
  return {
    provedor: String(env.MAPS_PROVIDER || "google").trim(),
    chave: String(env.MAPS_SERVER_KEY || env.MAPS_API_KEY || "").trim(),
    chaveNavegador: String(env.MAPS_BROWSER_KEY || "").trim(),
    porMinuto: inteiro(env.ENTREGA_LIMITE_MINUTO, 40, 5, 300),
    porHora: inteiro(env.ENTREGA_LIMITE_HORA, 400, 10, 5000),
    origens: String(env.MAPS_ORIGENS || env.AI_ORIGENS || "").split(",").map((s) => s.trim()).filter(Boolean)
  };
}

let limitador = null;
function limitadorPara(cfg){
  if (!limitador || limitador.porMinuto !== cfg.porMinuto || limitador.porHora !== cfg.porHora)
    limitador = criarLimitador({ porMinuto: cfg.porMinuto, porHora: cfg.porHora });
  return limitador;
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const falha = (erro) => json({ ok: false, erro });

/* todo navegador manda "Origin" num POST (mesmo do próprio site). Sem ele, é script/robô: recusado */
function origemPermitida(req, cfg){
  const o = req.headers.get("origin");
  if (!o) return false;
  let host;
  try { host = new URL(o).host; } catch { return false; }
  if (host === new URL(req.url).host) return true;
  return cfg.origens.some((x) => { try { return new URL(x).host === host; } catch { return x === host; } });
}

/* distância em linha reta (só para recusar o que está longe demais; o preço usa a ROTA) */
export function kmEmLinhaReta(a, b){
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
const ACOES = new Set(["inicio", "sugestoes", "lugar", "endereco", "reverso", "rota"]);
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
function ponto(d){
  const lat = num(d.lat), lng = num(d.lng);
  /* só pontos no Brasil */
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -34 && lat <= 6 && lng >= -74 && lng <= -28 ? { lat, lng } : null;
}
/* confere o pedido do navegador: nada dele é confiável */
export function validarPedido(d){
  if (!d || typeof d !== "object" || !ACOES.has(d.acao)) return { erro: "invalido" };
  const p = { acao: d.acao };
  const sessao = String(d.sessao || "");
  if (sessao && !/^[A-Za-z0-9-]{8,64}$/.test(sessao)) return { erro: "invalido" };
  p.sessao = sessao;
  if (d.acao === "sugestoes"){
    p.texto = limparTexto(d.texto, 120);
    if (p.texto.length < 3) return { erro: "invalido" };
  } else if (d.acao === "lugar"){
    p.id = String(d.id || "");
    if (!/^[A-Za-z0-9_-]{10,300}$/.test(p.id)) return { erro: "invalido" };
  } else if (d.acao === "endereco"){
    for (const k of ["rua", "numero", "bairro", "cidade", "cep"]) p[k] = limparTexto(d[k], k === "rua" || k === "bairro" ? 90 : 40);
    p.cep = p.cep.replace(/\D/g, "");
    if (p.cep && p.cep.length !== 8) return { erro: "invalido" };
    if (!p.rua && !p.cep) return { erro: "invalido" };
  } else if (d.acao === "reverso" || d.acao === "rota"){
    p.ponto = ponto(d);
    if (!p.ponto) return { erro: "invalido" };
  }
  return p;
}

/* a loja: o ponto de data/config.js ou, se vazio, o endereço dela no mapa (guardado) */
const origensGuardadas = new Map();
async function origemDaLoja(d, prov){
  const S = d.STORE_CONFIG || {}, E = d.DELIVERY_CONFIG || {}, O = E.origem || {};
  const endereco = [S.endereco, S.bairro].filter(Boolean).join(" - ") + ", " + [S.cidade, S.estado].filter(Boolean).join(" - ") + (S.cep ? ", " + S.cep : "");
  /* nome e endereço saem só de STORE_CONFIG (a fonte única): nome + cidade, prédio, endereço, bairro, CEP */
  const base = { nome: [S.nome, S.cidade].filter(Boolean).join(" "), endereco };
  const fixo = ponto(O);
  if (fixo) return { ...base, ...fixo };
  const chave = [S.predio, endereco].join("|");
  if (!origensGuardadas.has(chave)){
    const achou = await prov.geocodificar([S.predio, endereco, "Brasil"].filter(Boolean).join(", "));
    if (!achou){ const e = new Error("origem"); e.codigo = "indisponivel"; throw e; }
    origensGuardadas.set(chave, { lat: achou.lat, lng: achou.lng });
  }
  return { ...base, ...origensGuardadas.get(chave) };
}
/* o desenho do mapa: só a chave de NAVEGADOR (a sessão dos blocos o próprio navegador cria com ela) */
function mapaPara(cfg, prov){
  return cfg.chaveNavegador ? { tipo: prov.nome, chave: cfg.chaveNavegador } : null;
}
/* rota com no máximo ~400 pontos (o desenho continua fiel e a resposta fica leve) */
function afina(pts, max = 400){
  if (pts.length <= max) return pts;
  const passo = Math.ceil(pts.length / max), out = pts.filter((_, i) => i % passo === 0);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]);
}

/* sugestões por sessão de digitação (o mesmo token do Google): no máximo 40 em 10 minutos.
   Uma pessoa digitando um endereço usa bem menos; um script preso num laço para aqui. */
const SUGESTOES_POR_SESSAO = 40, JANELA_SESSAO_MS = 10 * 60e3;
const sessoes = new Map();
export function sessaoPermite(sessao, agora = Date.now()){
  if (!sessao) return true;
  const s = sessoes.get(sessao);
  if (!s || agora - s.desde > JANELA_SESSAO_MS){ sessoes.set(sessao, { desde: agora, n: 1 }); }
  else if (++s.n > SUGESTOES_POR_SESSAO) return false;
  if (sessoes.size > 5000) for (const [k, v] of sessoes) if (agora - v.desde > JANELA_SESSAO_MS) sessoes.delete(k);
  if (sessoes.size > 5000) sessoes.clear();                 /* nunca cresce sem limite */
  return true;
}

/* opcoes: { ip, env, cfg, provedor, lerDados, buscar } (os últimos servem para os testes) */
export async function atenderEntrega(req, opcoes = {}){
  const cfg = opcoes.cfg || configDoAmbiente(opcoes.env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "POST" } });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  if (!origemPermitida(req, cfg)) return json({ ok: false, erro: "origem" }, 403);
  if (!/application\/json/i.test(req.headers.get("content-type") || "")) return json({ ok: false, erro: "formato" }, 415);
  if (Number(req.headers.get("content-length") || 0) > 4096) return json({ ok: false, erro: "grande" }, 413);
  const bruto = await req.text();
  if (bruto.length > 4096) return json({ ok: false, erro: "grande" }, 413);
  let dados;
  try { dados = JSON.parse(bruto); } catch { return json({ ok: false, erro: "invalido" }, 400); }
  const p = validarPedido(dados);
  if (p.erro) return json({ ok: false, erro: p.erro }, 400);

  if (!cfg.chave && !opcoes.provedor) return falha("sem_chave");
  const ip = opcoes.ip || req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!limitadorPara(cfg).permite(chaveDoVisitante("entrega:" + ip))) return falha("limite");

  try {
    const d = await (opcoes.lerDados || lerDadosDoSite)({ origem: new URL(req.url).origin });
    const E = d.DELIVERY_CONFIG || {};
    if (E.ligada === false) return falha("desligada");
    const prov = opcoes.provedor || obterProvedorMapa(cfg.provedor, { chave: cfg.chave, buscar: opcoes.buscar });
    const origem = await origemDaLoja(d, prov);
    const longe = (pt) => kmEmLinhaReta(origem, pt) > RAIO_MAX_KM;

    if (p.acao === "inicio") return json({ ok: true, origem, mapa: mapaPara(cfg, prov), limiteKm: Number(E.maximumDistanceKm) || null });
    if (p.acao === "sugestoes"){
      if (!sessaoPermite(p.sessao)) return falha("limite");
      return json({ ok: true, sugestoes: await prov.sugestoes({ texto: p.texto, sessao: p.sessao, perto: origem }) });
    }
    if (p.acao === "lugar"){
      const l = await prov.lugar({ id: p.id, sessao: p.sessao });
      return l ? json({ ok: true, local: l }) : falha("nao_encontrado");
    }
    if (p.acao === "endereco"){
      let { rua, numero, bairro, cidade, cep } = p, uf = "";
      if (cep && (!rua || !cidade)){
        const c = await buscaCep(cep, opcoes.buscar);
        if (!c) return falha("nao_encontrado");
        rua = rua || c.rua; bairro = bairro || c.bairro; cidade = cidade || c.cidade; uf = c.uf;
      }
      const texto = [[rua, numero].filter(Boolean).join(", "), bairro, [cidade, uf].filter(Boolean).join(" - "), cep, "Brasil"].filter(Boolean).join(", ");
      const l = await prov.geocodificar(texto);
      if (!l || longe(l)) return falha("nao_encontrado");
      return json({ ok: true, local: l });
    }
    if (p.acao === "reverso"){
      if (longe(p.ponto)) return falha("longe");
      const r = await prov.reverso(p.ponto);
      return json({ ok: true, endereco: r ? r.endereco : "" });
    }
    /* rota: longe em linha reta = longe pela rua (a rota nunca é mais curta que a linha reta) */
    const limite = Number(E.maximumDistanceKm) || 0;
    if (longe(p.ponto) || (limite > 0 && kmEmLinhaReta(origem, p.ponto) > limite))
      return json({ ok: true, foraDaArea: true, distanciaKm: null, duracaoMin: null, valor: null, origem, destino: p.ponto, rota: [] });
    const r = await prov.rota({ origem, destino: p.ponto, transito: !!E.considerarTransito });
    if (!r) return falha("sem_rota");
    const km = d.kmEntrega(r.metros), preco = d.calcularEntrega(km);
    if (!preco) return falha("sem_rota");
    return json({ ok: true, distanciaKm: preco.km, duracaoMin: Math.max(1, Math.round(r.segundos / 60)), valor: preco.valor,
      foraDaArea: preco.foraDaArea, origem, destino: p.ponto, rota: afina(r.pontos) });
  } catch (e){
    const codigo = (e && e.codigo) || "indisponivel";
    console.error(JSON.stringify({ entrega: p.acao, erro: codigo }));       /* só o tipo e o código: nada do endereço */
    return falha(codigo);
  }
}
