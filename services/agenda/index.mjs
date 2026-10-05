// SR Phone · pedido de horário, do lado do servidor (POST /api/agendamento).
// Chamado por netlify/functions/agendamento.mjs (no Netlify) e por ferramentas/servidor.mjs (npm start).
//
// O caminho do pedido:  site → esta função → banco (criar_agendamento).
// Aqui o pedido é conferido de novo (nada do navegador é confiável), passa pelo limite de pedidos
// por visitante, pelo anti-robô (Cloudflare Turnstile, quando configurado) e só então vai ao banco,
// que confere TUDO mais uma vez (horário livre, dia bloqueado, limites) e grava numa operação só.
//
// Variáveis de ambiente (SÓ no Netlify, nunca no site):
//   SUPABASE_SECRET_KEY (sb_secret_...) ou SUPABASE_SERVICE_ROLE_KEY: a chave secreta do Supabase.
//      Dá acesso total ao banco: fica só aqui, nunca é devolvida ao navegador nem vai para o registro.
//   SUPABASE_URL: endereço do projeto (vazio = o mesmo de data/config.js).
//   TURNSTILE_SECRET_KEY: segredo do Cloudflare Turnstile. Preenchido, todo pedido precisa do
//      "não sou robô" válido, conferido AQUI no servidor (o navegador só manda o token).
//   AGENDA_ORIGENS: outros endereços que podem chamar a função (o próprio site já pode).
//
// Resposta: { ok: true } ou { ok: false, erro } com um código curto. Nunca detalhe técnico do banco.
// Privacidade: nome e telefone só passam por aqui a caminho do banco; o registro (console) guarda
// só o código do resultado. O IP vira um resumo (HMAC) que o banco usa para o limite e apaga em 2 dias.
import { createHmac } from "node:crypto";
import { lerDadosDoSite } from "../dados-site.mjs";
import { criarLimitador, chaveDoVisitante } from "../ai/limites.mjs";
import { limparTexto } from "../ai/seguranca.mjs";

const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/* erros do banco que a tela sabe explicar para o cliente (o resto vira "indisponivel") */
const ERROS_DO_BANCO = new Set(["horario_ocupado", "dia_bloqueado", "pedido_duplicado", "limite_por_telefone",
  "muitos_pedidos", "muitas_tentativas", "data_fora_do_periodo", "horario_passado", "fora_do_horario",
  "nome_invalido", "telefone_invalido", "hora_invalida"]);
const STATUS = { invalido: 400, nome_invalido: 400, telefone_invalido: 400, hora_invalida: 400, data_fora_do_periodo: 400,
  horario_passado: 409, fora_do_horario: 409, horario_ocupado: 409, dia_bloqueado: 409, pedido_duplicado: 409,
  limite_por_telefone: 429, muitos_pedidos: 429, muitas_tentativas: 429, limite: 429,
  origem: 403, robo: 403, metodo: 405, formato: 415, grande: 413, indisponivel: 503 };

/* tipo da chave: só a SECRETA serve aqui (a pública não tem permissão de gravar pedido) */
export function tipoChaveServidor(k){
  k = String(k || "").trim();
  if (/^sb_secret_[A-Za-z0-9_-]{10,}$/.test(k)) return "secreta";
  const partes = k.split(".");
  if (partes.length === 3){
    try {
      const p = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
      if (p && p.role === "service_role") return "service_role";
      if (p && p.role === "anon") return "publica";
    } catch { /* não é JWT */ }
  }
  if (/^sb_publishable_/.test(k)) return "publica";
  return k ? "invalida" : "";
}

export function configDoAmbiente(env = process.env){
  const inteiro = (v, padrao, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };
  return {
    url: String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""),
    chave: String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    turnstile: String(env.TURNSTILE_SECRET_KEY || "").trim(),
    porMinuto: inteiro(env.AGENDA_LIMITE_MINUTO, 3, 1, 30),
    porHora: inteiro(env.AGENDA_LIMITE_HORA, 12, 2, 200),
    origens: String(env.AGENDA_ORIGENS || env.AI_ORIGENS || "").split(",").map((s) => s.trim()).filter(Boolean),
    local: env.SR_AMBIENTE_LOCAL === "1"
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
const falha = (erro) => json({ ok: false, erro }, STATUS[erro] || 400);
const registra = (o) => console.error(JSON.stringify({ agenda: o }));   /* só códigos: nada de nome, telefone ou IP */

function origemPermitida(req, cfg){
  const o = req.headers.get("origin");
  if (!o) return false;
  let host;
  try { host = new URL(o).host; } catch { return false; }
  if (host === new URL(req.url).host) return true;
  return cfg.origens.some((x) => { try { return new URL(x).host === host; } catch { return x === host; } });
}

/* confere o pedido: a validação definitiva é a do banco, esta é a primeira barreira */
export function validarPedido(d){
  if (!d || typeof d !== "object" || Array.isArray(d)) return { erro: "invalido" };
  const data = String(d.data || ""), hora = String(d.hora || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(Date.parse(data + "T12:00:00Z"))) return { erro: "invalido" };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { erro: "hora_invalida" };
  const sem = (t, max) => limparTexto(String(t == null ? "" : t).replace(/[<>]/g, " "), max).replace(/\s+/g, " ").trim();
  const servico = sem(d.servico, 120);
  if (servico.length < 2) return { erro: "invalido" };
  const nome = sem(d.nome, 80);
  if (nome.length > 60 || /\d/.test(nome) || nome.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "").length < 2) return { erro: "nome_invalido" };
  let dig = String(d.telefone || "").replace(/\D/g, "");
  if ((dig.length === 12 || dig.length === 13) && dig.startsWith("55")) dig = dig.slice(2);
  if (dig.length < 10 || dig.length > 11 || (dig.length === 11 && dig[2] !== "9")) return { erro: "telefone_invalido" };
  const telefone = "(" + dig.slice(0, 2) + ") " + dig.slice(2, dig.length - 4) + "-" + dig.slice(-4);
  const aparelho = sem(d.aparelho, 60);
  const token = String(d.turnstile || "");
  if (token.length > 2048) return { erro: "invalido" };
  return { data, hora, servico, nome, telefone, aparelho, token, isca: String(d.site || "") };
}

/* Cloudflare Turnstile: o token do navegador é conferido aqui, com o segredo, junto da Cloudflare */
export async function confereTurnstile(cfg, token, ip, buscar = fetch){
  if (!cfg.turnstile) return true;                    /* não configurado: o resto das proteções continua */
  if (!token) return false;
  const corpo = new URLSearchParams({ secret: cfg.turnstile, response: token });
  if (ip) corpo.set("remoteip", ip);
  const r = await buscar(TURNSTILE_URL, { method: "POST", body: corpo, signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const j = await r.json().catch(() => ({}));
  if (j && j.success === true && (!j.action || j.action === "agendamento")) return true;
  registra({ resultado: "robo", codigos: Array.isArray(j && j["error-codes"]) ? j["error-codes"].slice(0, 3) : [] });
  return false;
}

/* resumo do IP para o limite do banco: HMAC com a chave secreta (sem ela, não dá para voltar ao IP) */
export const resumoDoIp = (chave, ip) => createHmac("sha256", chave).update("agenda:" + String(ip || "sem-ip")).digest("hex").slice(0, 32);

/* opcoes: { ip, env, cfg, buscar, lerDados } (os últimos servem para os testes) */
export async function atenderAgendamento(req, opcoes = {}){
  const cfg = opcoes.cfg || configDoAmbiente(opcoes.env);
  const buscar = opcoes.buscar || fetch;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "POST" } });
  if (req.method !== "POST") return falha("metodo");
  if (!origemPermitida(req, cfg)) return falha("origem");
  if (!/application\/json/i.test(req.headers.get("content-type") || "")) return falha("formato");
  if (Number(req.headers.get("content-length") || 0) > 4096) return falha("grande");
  const bruto = await req.text();
  if (bruto.length > 4096) return falha("grande");
  let dados;
  try { dados = JSON.parse(bruto); } catch { return falha("invalido"); }
  const p = validarPedido(dados);
  if (p.erro) return falha(p.erro);
  /* campo invisível preenchido = robô: recusa igual a um pedido inválido, sem tocar no banco */
  if (p.isca) return falha("invalido");

  const ip = opcoes.ip || req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!limitadorPara(cfg).permite(chaveDoVisitante("agenda:" + ip))) return falha("limite");

  /* sem a chave secreta (ou com a chave errada), a agenda online não grava: o site segue pelo WhatsApp */
  const tipo = tipoChaveServidor(cfg.chave);
  if (tipo !== "secreta" && tipo !== "service_role"){ registra({ resultado: tipo === "publica" ? "chave_publica_no_lugar_da_secreta" : "sem_chave" }); return falha("indisponivel"); }
  let url = cfg.url;
  if (!url){
    try { const d = await (opcoes.lerDados || lerDadosDoSite)({ origem: new URL(req.url).origin }); url = String(d.SUPABASE_URL || "").trim().replace(/\/+$/, ""); }
    catch { url = ""; }
  }
  const local = cfg.local && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(url) && !local){ registra({ resultado: "sem_url" }); return falha("indisponivel"); }

  try {
    if (!(await confereTurnstile(cfg, p.token, ip, buscar))) return falha("robo");
  } catch {
    registra({ resultado: "turnstile_fora" });
    return falha("indisponivel");
  }

  const cab = { "Content-Type": "application/json", apikey: cfg.chave };
  if (tipo === "service_role") cab.Authorization = "Bearer " + cfg.chave;
  let r, j;
  try {
    r = await buscar(url + "/rest/v1/rpc/criar_agendamento", {
      method: "POST", headers: cab, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ p_data: p.data, p_hora: p.hora, p_servico: p.servico, p_nome: p.nome,
        p_telefone: p.telefone, p_aparelho: p.aparelho, p_origem: resumoDoIp(cfg.chave, ip) })
    });
    j = await r.json().catch(() => null);
  } catch {
    registra({ resultado: "banco_fora" });
    return falha("indisponivel");
  }
  if (r.ok){ registra({ resultado: "ok" }); return json({ ok: true }); }
  const msg = String((j && j.message) || "");
  if (ERROS_DO_BANCO.has(msg)){ registra({ resultado: msg }); return falha(msg); }
  registra({ resultado: "erro_banco", http: r.status, codigo: String((j && j.code) || "").slice(0, 12) });
  return falha("indisponivel");
}
