// Teste de ponta a ponta da agenda e da Área da Equipe, com as peças de verdade:
//   - o Supabase Auth (GoTrue, o servidor de login do Supabase) compilado do código oficial,
//   - o PostgREST (o mesmo motor da API do Supabase),
//   - o PostgreSQL com as migrações do Supabase Auth + as de supabase/migrations,
//   - a função do servidor /api/agendamento rodando como no Netlify (ferramentas/servidor.mjs),
//   - o navegador (Playwright) abrindo o site e a página /funcionario/.
// Um "gateway" pequeno faz o papel do Supabase na frente: /auth/v1 → GoTrue, /rest/v1 → PostgREST,
// exige o cabeçalho apikey e troca a chave secreta pelo token de service_role (como o Supabase faz).
//
// Chamado por ferramentas/testa-banco.sh com: PGHOST, PGPORT, POSTGREST (binário), GOTRUE (binário)
// e GOTRUE_MIGRACOES (a pasta migrations do código do Supabase Auth).
import { createRequire } from "node:module";
import { execSync, execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { RAIZ } from "./ler-dados.mjs";

const require = createRequire(import.meta.url);
function carregaPlaywright(){
  try { return require("playwright"); } catch {}
  return require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
}
const { chromium } = carregaPlaywright();

const { PGHOST, PGPORT, POSTGREST, GOTRUE, GOTRUE_MIGRACOES } = process.env;
const SEGREDO_JWT = "segredo-de-teste-local-com-mais-de-32-caracteres";
const SUPA = "https://srphone-teste.supabase.co";
const PUB = "sb_publishable_teste_local_0123456789";
const SECRETA = "sb_" + "secret_teste_local_naopodevazar_0123456789";   /* falsa, montada aqui para não parecer chave real */
const SAIDA = process.env.SAIDA_TESTE || "";      /* pasta para as fotos de tela (opcional) */
const DB = "equipe";

/* ---------------- utilidades ---------------- */
const psql = (q, db = DB) => execFileSync("psql", ["-h", PGHOST, "-p", PGPORT, "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", q],
  { encoding: "utf8", env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } }).trim();
const psqlArq = (arq) => execFileSync("psql", ["-h", PGHOST, "-p", PGPORT, "-U", "postgres", "-d", DB, "-v", "ON_ERROR_STOP=1", "-qAt", "-f", arq],
  { encoding: "utf8", env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(carga){
  const cab = b64({ alg: "HS256", typ: "JWT" }), corpo = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...carga });
  return `${cab}.${corpo}.${crypto.createHmac("sha256", SEGREDO_JWT).update(`${cab}.${corpo}`).digest("base64url")}`;
}
const JWT_SERVICO = jwt({ role: "service_role", iss: "supabase" });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function porta(){ return new Promise((ok) => { const s = http.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); }); }
async function ate(fn, ms = 15000){
  const fim = Date.now() + ms;
  while (Date.now() < fim){ try { if (await fn()) return true; } catch {} await espera(150); }
  return false;
}
/* código de 6 dígitos (TOTP, RFC 6238), igual ao do app autenticador */
function totp(segredo, deslocamento = 0){
  const alf = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredo.replace(/[\s=]/g, "").toUpperCase()) bits += alf.indexOf(c).toString(2).padStart(5, "0");
  const chave = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const passo = Buffer.alloc(8);
  passo.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + deslocamento));
  const h = crypto.createHmac("sha1", chave).update(passo).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const somaDias = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const diaSemana = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
function proximoDiaUtil(apos){ let d = somaDias(hojeSP(), apos); while (![1, 2, 3, 4, 5].includes(diaSemana(d))) d = somaDias(d, 1); return d; }

const falhas = [], ok = [];
const confere = (c, t) => { (c ? ok : falhas).push(t); if (!c) console.log("  FALHOU: " + t); };
const processos = [];

/* ---------------- 1. banco: Supabase Auth + nossas migrações ---------------- */
psql(`drop database if exists ${DB} with (force)`, "postgres");
psql(`create database ${DB}`, "postgres");
psql(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login noinherit createrole; end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end $$;
      alter role supabase_auth_admin set search_path = auth;`, "postgres");
psql(`create schema auth authorization supabase_auth_admin; grant all on database ${DB} to supabase_auth_admin;
      grant usage on schema auth to anon, authenticated, service_role; grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`);
const DB_URL_AUTH = `postgres://supabase_auth_admin@/${DB}?host=${encodeURIComponent(PGHOST)}&port=${PGPORT}&sslmode=disable`;
const envAuth = (extra) => ({ ...process.env, GOTRUE_DB_DRIVER: "postgres", DATABASE_URL: DB_URL_AUTH, GOTRUE_JWT_SECRET: SEGREDO_JWT,
  GOTRUE_DB_MIGRATIONS_PATH: GOTRUE_MIGRACOES, API_EXTERNAL_URL: SUPA + "/auth/v1", GOTRUE_LOG_LEVEL: "error", ...extra });
execFileSync(GOTRUE, ["migrate"], { cwd: path.dirname(GOTRUE_MIGRACOES), env: envAuth({ GOTRUE_SITE_URL: "http://127.0.0.1" }), stdio: "pipe" });
for (const m of ["20260926120000_agenda", "20260928120000_horario_loja", "20260928140000_segurar_horario", "20261002120000_area_equipe_seguranca"]){
  psqlArq(path.join(RAIZ, "supabase/migrations", m + ".sql"));
  psqlArq(path.join(RAIZ, "supabase/migrations", m + ".sql"));
}
confere(psql("select count(*) from pg_proc where proname = 'criar_agendamento'") === "1", "banco: migrações aplicadas (duas vezes) sobre o Supabase Auth de verdade");

/* ---------------- 2. servidores: PostgREST, Supabase Auth, gateway e o site ---------------- */
const P_REST = await porta(), P_AUTH = await porta(), P_GW = await porta();
const { iniciaServidor } = await import("./servidor.mjs");
const srv = await iniciaServidor(0);
const BASE = `http://127.0.0.1:${srv.address().port}`;
function sobe(bin, args, env, nome){
  const p = spawn(bin, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  p.stdout.on("data", (d) => { log += d; }); p.stderr.on("data", (d) => { log += d; });
  processos.push(p);
  p.log = () => log.slice(-3000);
  p.nome = nome;
  return p;
}
const rest = sobe(POSTGREST, [], { ...process.env, PGRST_DB_URI: `postgres://postgres@/${DB}?host=${encodeURIComponent(PGHOST)}&port=${PGPORT}`,
  PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon", PGRST_JWT_SECRET: SEGREDO_JWT, PGRST_SERVER_HOST: "127.0.0.1",
  PGRST_SERVER_PORT: String(P_REST), PGRST_DB_POOL: "6" }, "PostgREST");
const auth = sobe(GOTRUE, ["serve"], envAuth({ GOTRUE_API_HOST: "127.0.0.1", PORT: String(P_AUTH), GOTRUE_SITE_URL: BASE,
  GOTRUE_URI_ALLOW_LIST: BASE + "/**", GOTRUE_DISABLE_SIGNUP: "true", GOTRUE_EXTERNAL_EMAIL_ENABLED: "true", GOTRUE_MAILER_AUTOCONFIRM: "true",
  GOTRUE_JWT_EXP: "3600", GOTRUE_JWT_AUD: "authenticated", GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated", GOTRUE_JWT_ADMIN_ROLES: "service_role",
  GOTRUE_MFA_TOTP_ENROLL_ENABLED: "true", GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true", GOTRUE_RATE_LIMIT_VERIFY: "1000",
  GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "1000", GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000", GOTRUE_MFA_RATE_LIMIT_CHALLENGE_AND_VERIFY: "1000",
  GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "true" }), "Supabase Auth");
const REST = `http://127.0.0.1:${P_REST}`, AUTH = `http://127.0.0.1:${P_AUTH}`, GW = `http://127.0.0.1:${P_GW}`;

/* o "Supabase" na frente: chave no apikey; a secreta vira o token de service_role (só aqui dentro) */
const vistoPeloNavegador = [];      /* tudo o que o navegador recebeu da "API do Supabase" */
const gw = http.createServer(async (req, res) => {
  const partes = []; for await (const c of req) partes.push(c);
  const u = new URL(req.url, "http://x"), k = req.headers.apikey;
  if (u.pathname === "/verify") u.pathname = "/auth/v1/verify";          /* link do e-mail gerado sem o prefixo */
  let autorizacao = req.headers.authorization;
  const livre = req.method === "GET" && u.pathname === "/auth/v1/verify";       /* o link do e-mail não leva apikey */
  if (k === SECRETA) autorizacao = "Bearer " + JWT_SERVICO;
  else if (k !== PUB && !livre){ res.writeHead(401, { "Content-Type": "application/json" }); res.end('{"message":"Invalid API key"}'); return; }
  let alvo = null;
  if (u.pathname.startsWith("/rest/v1/")) alvo = REST + u.pathname.slice(8) + u.search;
  else if (u.pathname.startsWith("/auth/v1/")) alvo = AUTH + u.pathname.slice(8) + u.search;
  if (!alvo){ res.writeHead(404); res.end(); return; }
  const h = { "Content-Type": req.headers["content-type"] || "application/json" };
  if (autorizacao) h.Authorization = autorizacao;
  if (req.headers.prefer) h.Prefer = req.headers.prefer;
  if (req.headers["x-forwarded-for"]) h["X-Forwarded-For"] = req.headers["x-forwarded-for"];
  try {
    const r = await fetch(alvo, { method: req.method, headers: h, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(partes), redirect: "manual" });
    const corpo = Buffer.from(await r.arrayBuffer());
    const sai = { "Content-Type": r.headers.get("content-type") || "application/json" };
    if (r.headers.get("location")) sai.Location = r.headers.get("location");
    res.writeHead(r.status, sai); res.end(corpo);
  } catch (e){ res.writeHead(502); res.end(String(e.message)); }
}).listen(P_GW, "127.0.0.1");

const pronto = await ate(async () => (await fetch(REST + "/")).status < 500 && (await fetch(AUTH + "/health")).ok, 20000);
if (!pronto){ console.log(rest.log(), auth.log()); throw new Error("PostgREST ou Supabase Auth não subiram"); }

/* a função do servidor (/api/agendamento) fala com o "Supabase" pela chave secreta, como no Netlify */
process.env.SUPABASE_URL = GW;
process.env.SUPABASE_SECRET_KEY = SECRETA;
process.env.AGENDA_LIMITE_MINUTO = "30";
process.env.AGENDA_LIMITE_HORA = "200";
delete process.env.TURNSTILE_SECRET_KEY;
const limpaLimites = () => psql("delete from public.agenda_limites");

/* ---------------- 3. contas: criadas pela administração (API admin), nunca pelo site ---------------- */
async function criaConta(email, senha){
  const r = await fetch(AUTH + "/admin/users", { method: "POST", headers: { Authorization: "Bearer " + JWT_SERVICO, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha, email_confirm: true }) });
  const j = await r.json();
  if (!r.ok) throw new Error("conta " + email + ": " + JSON.stringify(j));
  return j.id;
}
const CONTAS = {
  func:    { email: "func@loja.test",    senha: "Senha-Func-123" },
  maria:   { email: "maria@loja.test",   senha: "Senha-Maria-123" },
  dona:    { email: "dona@loja.test",    senha: "Senha-Dona-123" },
  cliente: { email: "cliente@x.test",    senha: "Senha-Cliente-123" },
  ex:      { email: "ex@loja.test",      senha: "Senha-Ex-123" }
};
for (const c of Object.values(CONTAS)) c.id = await criaConta(c.email, c.senha);
psql(`insert into public.funcionarios (user_id, nome, role, ativo) values
  ('${CONTAS.func.id}', 'Func Teste', 'funcionario', true), ('${CONTAS.maria.id}', 'Maria de Fatima', 'funcionario', true),
  ('${CONTAS.dona.id}', 'Dona da Loja', 'admin', true), ('${CONTAS.ex.id}', 'Ex Funcionario', 'funcionario', false)`);
confere(psql(`select email || '|' || exige_mfa from public.funcionarios where role = 'admin'`) === "dona@loja.test|true", "banco: e-mail veio do Supabase Auth e o admin nasceu com MFA obrigatório");

/* cadastro público desligado: ninguém cria conta pelo site */
{
  const r = await fetch(GW + "/auth/v1/signup", { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ email: "intruso@x.test", password: "Senha-Intruso-123" }) });
  confere(r.status >= 400 && psql("select count(*) from auth.users where email = 'intruso@x.test'") === "0", `cadastro público recusado pelo Supabase Auth (HTTP ${r.status})`);
}

/* ---------------- 4. navegador ---------------- */
const nav = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const IGNORAR = /fonts\.(googleapis|gstatic)|ERR_CERT|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|status of 4\d\d|challenges\.cloudflare/;
const TELAS = { iphone: { width: 390, height: 844, isMobile: true, hasTouch: true }, android: { width: 412, height: 915, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true }, computador: { width: 1366, height: 900 } };
async function contexto(tela = "iphone"){
  const t = TELAS[tela];
  const ctx = await nav.newContext({ viewport: { width: t.width, height: t.height }, isMobile: !!t.isMobile, hasTouch: !!t.hasTouch });
  await ctx.route(BASE + "/data/config.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
    body: fs.readFileSync(path.join(RAIZ, "data/config.js"), "utf8") + `;SUPABASE_URL = "${SUPA}"; SUPABASE_ANON_KEY = "${PUB}";` }));
  await ctx.route(SUPA + "/**", async (r) => {
    try {
      const u = new URL(r.request().url());
      const resposta = await r.fetch({ url: GW + u.pathname + u.search, maxRedirects: 0 });
      const corpo = await resposta.body();
      vistoPeloNavegador.push(corpo.toString("utf8"));
      await r.fulfill({ status: resposta.status(), headers: resposta.headers(), body: corpo });
    } catch { /* página fechada no meio do pedido (ex.: "Sair" logo antes de fechar a aba) */ }
  });
  /* o anti-robô da Cloudflare não é usado neste teste (sem TURNSTILE_SITE_KEY) */
  await ctx.route("https://challenges.cloudflare.com/**", (r) => r.abort());
  const p = await ctx.newPage();
  const erros = [], pedidos = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !IGNORAR.test(m.text())) erros.push(m.text()); });
  p.on("request", (q) => pedidos.push(q.url()));
  return { ctx, p, erros, pedidos };
}
async function entra(p, conta, esperado = "#eq-painel"){
  await p.goto(BASE + "/funcionario/", { waitUntil: "load" });
  await p.waitForSelector("#eq-login:not([hidden])", { timeout: 10000 });
  await p.fill("#eq-email", conta.email);
  await p.fill("#eq-senha", conta.senha);
  await p.click("#eq-entrar");
  await p.waitForSelector(esperado + ":not([hidden])", { timeout: 10000 });
}
async function vaiParaDia(p, iso){
  for (let i = 0; i < 3; i++){
    if (await p.locator(`.eq-cal-dia[data-iso="${iso}"]`).count()) break;
    await p.click("#eq-mes-prox");
    await p.waitForTimeout(150);
  }
  await p.click(`.eq-cal-dia[data-iso="${iso}"]`);
  await p.waitForFunction((d) => document.querySelector(`.eq-cal-dia[data-iso="${d}"]`).getAttribute("aria-pressed") === "true"
    && !document.querySelector("#eq-horas .eq-vazio"), iso, { timeout: 10000 });
}
const linha = (p, hora) => p.locator(`#eq-horas li[data-hora="${hora}"]`);
async function estadoDe(p, hora){ return (await linha(p, hora).getAttribute("class") || "").replace("eq-hora", "").trim(); }
async function confirmaDialogo(p, motivo, detalhe){
  await p.waitForSelector("#eq-dlg[open]");
  if (motivo !== undefined) await p.selectOption("#eq-dlg-sel", motivo);
  if (detalhe) await p.fill("#eq-dlg-det", detalhe);
  await p.click("#eq-dlg-ok");
  await p.waitForFunction(() => !document.querySelector("#eq-dlg").open || !document.querySelector("#eq-dlg-erro").hidden, null, { timeout: 10000 });
}
async function semRolagemLateral(p){ return p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1); }
async function foto(p, nome){ if (SAIDA) await p.screenshot({ path: path.join(SAIDA, nome + ".png"), fullPage: false }); }

const DIA = proximoDiaUtil(2), DIA2 = proximoDiaUtil(4), DIA3 = proximoDiaUtil(6);
let erroGeral = null;
try {
  /* ===== cliente: vê, reserva, não pega bloqueado nem ocupado ===== */
  limpaLimites();
  psql(`select set_config('request.jwt.claims', '{"sub":"${CONTAS.func.id}","role":"authenticated"}', false);
        select public.bloquear_horarios('${DIA}', array['11:00'], 'Almoço');`);
  const C = await contexto();
  await C.p.goto(BASE + "/#agendar", { waitUntil: "load" });
  await C.p.waitForFunction(() => typeof ocupadosOk !== "undefined" && ocupadosOk === true, null, { timeout: 10000 });
  confere(await C.p.evaluate(() => agFalhou === false) && (await C.p.textContent("#ag-enviar")).trim() === "Reservar esse horário", "cliente: vê os horários do banco (agenda online, sem cair no WhatsApp)");
  await C.p.click(`#ag-dias .dia[data-iso="${DIA}"]`);
  await C.p.waitForTimeout(200);
  const b11 = C.p.locator("#ag-horas .hora", { hasText: "11:00" });
  confere(await b11.isDisabled(), "cliente: o horário bloqueado pela equipe (11:00) não aparece livre");
  confere(await C.p.locator("#ag-horas .hora:not([disabled])", { hasText: "09:00" }).count() === 1, "cliente: vê os horários livres (09:00)");
  await C.p.click("#ag-horas .hora:not([disabled]) >> text=09:00");
  await C.p.fill("#ag-nome", "Ana Cliente");
  await C.p.locator("#ag-fone").pressSequentially("22999990011");
  await C.p.fill("#ag-aparelho", "iPhone 13 128 GB");
  await C.p.click("#ag-enviar");
  await C.p.waitForFunction(() => !agEnviando, null, { timeout: 10000 });
  confere(/Horário reservado/.test(await C.p.locator("#ag-status").innerText()), "cliente: reserva válida funciona (Horário reservado)");
  confere(psql(`select status || '|' || telefone || '|' || aparelho from public.agendamentos where nome = 'Ana Cliente'`) === "pendente|(22) 99999-0011|iPhone 13 128 GB",
    "banco: pedido gravado como pendente, com WhatsApp e aparelho");
  confere(C.pedidos.some((u) => u.endsWith("/api/agendamento")) && !C.pedidos.some((u) => /rpc\/(criar_agendamento|solicitar_horario)|rest\/v1\/agendamentos/.test(u)),
    "cliente: o pedido foi pela função do servidor, nunca direto ao banco");
  /* lista velha na tela: tenta o bloqueado e o ocupado → o servidor recusa e a tela explica */
  for (const [hora, nome, tel] of [["11:00", "Bruno Cliente", "22999990022"], ["09:00", "Caio Cliente", "22999990033"]]){
    await C.p.evaluate(() => { ocupados = {}; ocupadosEm = Date.now(); reservado = ""; montaHoras(); agAtualiza(); });
    await C.p.click(`#ag-horas .hora >> text=${hora}`);
    await C.p.fill("#ag-nome", nome);
    await C.p.fill("#ag-fone", ""); await C.p.locator("#ag-fone").pressSequentially(tel);
    await C.p.click("#ag-enviar");
    await C.p.waitForFunction(() => !agEnviando, null, { timeout: 10000 });
    confere(/acabou de ser reservado/.test(await C.p.locator("#ag-status").innerText()) && psql(`select count(*) from public.agendamentos where nome = '${nome}'`) === "0",
      `cliente: não reserva horário ${hora === "11:00" ? "bloqueado" : "ocupado"} (${hora}), nem com a tela desatualizada`);
  }
  confere(!C.erros.length, "site do cliente sem erro" + (C.erros.length ? " → " + C.erros.join(" | ") : ""));
  await C.ctx.close();

  /* sem a chave secreta no servidor: o site não finge que reservou e oferece o WhatsApp */
  {
    delete process.env.SUPABASE_SECRET_KEY;
    const X = await contexto();
    await X.p.goto(BASE + "/#agendar", { waitUntil: "load" });
    await X.p.waitForFunction(() => ocupadosOk === true, null, { timeout: 10000 });
    await X.p.click(`#ag-dias .dia[data-iso="${DIA2}"]`); await X.p.waitForTimeout(150);
    await X.p.click("#ag-horas .hora:not([disabled]) >> nth=0");
    await X.p.fill("#ag-nome", "Davi Cliente"); await X.p.locator("#ag-fone").pressSequentially("22999990044");
    await X.p.click("#ag-enviar");
    await X.p.waitForFunction(() => !agEnviando, null, { timeout: 10000 });
    confere(await X.p.evaluate(() => agFalhou === true) && await X.p.locator("#ag-zap").isVisible() && psql("select count(*) from public.agendamentos where nome = 'Davi Cliente'") === "0",
      "função sem a chave secreta: plano B pelo WhatsApp, sem fingir reserva");
    await X.ctx.close();
    process.env.SUPABASE_SECRET_KEY = SECRETA;
  }

  /* ===== robô: muitos pedidos ao mesmo tempo ===== */
  limpaLimites();
  process.env.AGENDA_LIMITE_MINUTO = "3";
  {
    const antes = Number(psql("select count(*) from public.agendamentos"));
    const horas = ["09:00", "10:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => fetch(BASE + "/api/agendamento", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify({ data: DIA3, hora: horas[i % 8], servico: "Comprar um aparelho", nome: "Robo Robo", telefone: "2297777" + String(1000 + i), aparelho: "" })
    }).then((r) => r.json())));
    const aceitos = rs.filter((j) => j.ok).length;
    confere(aceitos <= 3 && Number(psql("select count(*) from public.agendamentos")) - antes === aceitos,
      `robô: 20 pedidos simultâneos, ${aceitos} aceitos (limite por visitante), o resto recusado (${[...new Set(rs.filter((j) => !j.ok).map((j) => j.erro))].join(", ")})`);
    const semOrigem = await fetch(BASE + "/api/agendamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    confere(semOrigem.status === 403, "robô: pedido sem Origin (script fora do navegador) recusado");
    const isca = await fetch(BASE + "/api/agendamento", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify({ data: DIA3, hora: "09:00", servico: "x x", nome: "Robo Isca", telefone: "22977770001", site: "http://spam" }) });
    confere(!(await isca.json()).ok && psql("select count(*) from public.agendamentos where nome = 'Robo Isca'") === "0", "robô: campo invisível preenchido não chega ao banco");
  }
  process.env.AGENDA_LIMITE_MINUTO = "30";
  /* direto na API com a chave pública: nada de criar pedido nem ler dado de cliente */
  {
    const h = { apikey: PUB, "Content-Type": "application/json" };
    const r1 = await fetch(GW + "/rest/v1/rpc/criar_agendamento", { method: "POST", headers: h,
      body: JSON.stringify({ p_data: DIA3, p_hora: "09:00", p_servico: "x", p_nome: "Robo Direto", p_telefone: "22977770002" }) });
    const r2 = await fetch(GW + "/rest/v1/agendamentos", { method: "POST", headers: h, body: JSON.stringify({ data: DIA3, hora: "09:00", nome: "Robo Direto" }) });
    const r3 = await fetch(GW + "/rest/v1/agendamentos?select=nome,telefone", { headers: h });
    const r4 = await fetch(GW + "/rest/v1/rpc/solicitar_horario", { method: "POST", headers: h, body: JSON.stringify({ p_data: DIA3, p_hora: "09:00", p_motivo: "x", p_nome: "Robo Direto", p_telefone: "22977770002" }) });
    confere(r1.status >= 400 && r2.status >= 400 && r4.status >= 400 && psql("select count(*) from public.agendamentos where nome = 'Robo Direto'") === "0",
      `chave pública: não cria pedido direto (rpc ${r1.status}, insert ${r2.status}, função antiga ${r4.status})`);
    const lido = r3.ok ? await r3.json() : [];
    confere(!r3.ok || !lido.length, `chave pública: não lê nome nem telefone de cliente (HTTP ${r3.status})`);
    const o = await (await fetch(GW + `/rest/v1/rpc/horarios_ocupados`, { method: "POST", headers: h, body: JSON.stringify({ de: hojeSP(), ate: somaDias(hojeSP(), 30) }) })).json();
    confere(Array.isArray(o) && o.length > 0 && o.every((x) => Object.keys(x).sort().join(",") === "data,hora"), "público: horários ocupados só com dia e hora (sem nome, telefone ou motivo)");
    for (const f of ["agenda_dia", "ver_agendamento", "bloqueios_ativos", "meu_acesso", "bloquear_horarios"]){
      const r = await fetch(GW + "/rest/v1/rpc/" + f, { method: "POST", headers: h, body: "{}" });
      if (r.status < 400){ confere(false, "chave pública chamou " + f); break; }
    }
    confere(true, "chave pública: nenhuma função da equipe responde sem login");
  }

  /* ===== /funcionario sem login, com usuário comum e com ex-funcionário ===== */
  {
    const V = await contexto();
    await V.p.goto(BASE + "/funcionario/", { waitUntil: "load" });
    await V.p.waitForSelector("#eq-login:not([hidden])");
    confere(await V.p.locator("#eq-painel").isHidden() && !V.pedidos.some((u) => /rest\/v1/.test(u)), "não autenticado: /funcionario/ mostra só o login e não consulta a agenda");
    confere(await V.p.locator("text=Criar conta").count() === 0 && await V.p.locator("#eq-esqueci").isVisible(), "login: e-mail, senha, Entrar e Esqueci minha senha; sem cadastro público");
    /* tentar abrir o painel "na marra" pelo console: o banco não entrega nada */
    const forcado = await V.p.evaluate(async (a) => (await fetch(a.supa + "/rest/v1/rpc/agenda_dia", { method: "POST", headers: { apikey: a.pub, "Content-Type": "application/json" },
      body: JSON.stringify({ p_data: a.dia }) })).status, { supa: SUPA, pub: PUB, dia: DIA });
    confere(forcado === 401 || forcado === 403, `não autenticado: a agenda não sai do banco nem chamando direto (HTTP ${forcado})`);
    await V.p.fill("#eq-email", CONTAS.func.email); await V.p.fill("#eq-senha", "senha-errada-1");
    await V.p.click("#eq-entrar");
    await V.p.waitForSelector("#eq-erro-login:not([hidden])");
    confere(/não conferem/.test(await V.p.textContent("#eq-erro-login")), "login: senha errada dá mensagem simples, sem detalhe técnico");
    await V.p.goto(BASE + "/#/agenda", { waitUntil: "load" });
    await V.p.waitForURL(/\/funcionario\/$/, { timeout: 5000 }).catch(() => {});
    confere(/\/funcionario\/$/.test(V.p.url()), "endereço antigo #/agenda leva para /funcionario/");
    await V.ctx.close();

    const U = await contexto();
    await entra(U.p, CONTAS.cliente, "#eq-sem-acesso");
    confere(await U.p.locator("#eq-painel").isHidden(), "autenticado que não é da equipe: 'Acesso não liberado', sem painel");
    const tk = await U.p.evaluate(() => JSON.parse(sessionStorage.getItem("srphone_equipe")).access_token);
    const r = await fetch(GW + "/rest/v1/rpc/agenda_dia", { method: "POST", headers: { apikey: PUB, Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify({ p_data: DIA }) });
    const r2 = await fetch(GW + "/rest/v1/agendamentos?select=nome,telefone", { headers: { apikey: PUB, Authorization: "Bearer " + tk } });
    confere(/sem_permissao/.test(await r.text()) && (await r2.json()).length === 0, "autenticado que não é da equipe: o banco não entrega agenda nem dados de cliente");
    await U.p.click("#eq-sem-acesso-sair");
    await U.ctx.close();

    const E = await contexto();
    await entra(E.p, CONTAS.ex, "#eq-sem-acesso");
    confere(true, "ex-funcionário (ativo = false): 'Acesso não liberado'");
    await E.ctx.close();
  }

  /* ===== funcionário ativo: bloquear, liberar, vários, dia inteiro, ver, conflito ===== */
  const F = await contexto("iphone");
  await entra(F.p, CONTAS.func);
  confere((await F.p.textContent("#eq-ola")).trim() === "Olá, Func", "funcionário ativo entra (Olá, Func)");
  await vaiParaDia(F.p, DIA);
  await foto(F.p, "equipe-iphone-agenda");
  confere(await estadoDe(F.p, "09:00") === "agendado" && await estadoDe(F.p, "11:00") === "bloqueado" && await estadoDe(F.p, "10:00") === "livre",
    "agenda do dia: Agendado, Bloqueado e Livre nos horários certos");
  confere(!(await linha(F.p, "09:00").innerText()).includes("99999-0011"), "agenda do dia: o telefone do cliente não aparece na lista (só no Ver)");
  /* bloquear um horário */
  await linha(F.p, "10:00").locator("button", { hasText: "Bloquear" }).click();
  await F.p.waitForSelector("#eq-dlg[open]");
  confere(/Data/.test(await F.p.textContent("#eq-dlg-dados")) && await F.p.locator("#eq-dlg-sel option").count() === 5 && (await F.p.textContent("#eq-dlg-ok")).trim() === "Confirmar bloqueio",
    "bloquear: janela com data, horário, motivo (Almoço, Compromisso, Atendimento externo, Outro) e Confirmar bloqueio");
  await confirmaDialogo(F.p, "Compromisso");
  await F.p.waitForFunction(() => document.querySelector('#eq-horas li[data-hora="10:00"]').classList.contains("bloqueado"), null, { timeout: 8000 });
  confere(psql(`select motivo from public.agendamentos where data = '${DIA}' and hora = '10:00' and status = 'bloqueado'`) === "Compromisso", "bloquear horário: gravado no banco e a agenda atualizou sozinha");
  const ocupadoProCliente = await (await fetch(GW + "/rest/v1/rpc/horarios_ocupados", { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ de: DIA, ate: DIA }) })).json();
  confere(ocupadoProCliente.some((o) => o.hora === "10:00"), "bloquear horário: some das opções do cliente na hora");
  /* liberar */
  await linha(F.p, "10:00").locator("button", { hasText: "Liberar" }).click();
  await confirmaDialogo(F.p);
  await F.p.waitForFunction(() => document.querySelector('#eq-horas li[data-hora="10:00"]').classList.contains("livre"), null, { timeout: 8000 });
  confere(psql(`select count(*) from public.agendamentos where data = '${DIA}' and hora = '10:00' and status = 'bloqueado'`) === "0", "liberar horário: o bloqueio saiu e o horário voltou para o cliente");
  confere(await linha(F.p, "09:00").locator("button", { hasText: "Liberar" }).count() === 0, "agendamento de cliente não tem botão Liberar");
  /* vários de uma vez */
  await F.p.click("#eq-varios");
  await linha(F.p, "13:00").locator("input[type=checkbox]").check();
  await linha(F.p, "14:00").locator("input[type=checkbox]").check();
  confere(/2 horários selecionados/.test(await F.p.textContent("#eq-sel-txt")), "selecionar vários: contador mostra 2");
  await F.p.click("#eq-sel-bloquear");
  await confirmaDialogo(F.p, "Almoço");
  await F.p.waitForFunction(() => document.querySelector('#eq-horas li[data-hora="14:00"]').classList.contains("bloqueado"), null, { timeout: 8000 });
  confere(psql(`select string_agg(hora, ',' order by hora) from public.agendamentos where data = '${DIA}' and status = 'bloqueado' and motivo = 'Almoço'`) === "11:00,13:00,14:00",
    "bloquear selecionados: 13:00 e 14:00 numa operação só");
  /* Ver o agendamento e confirmar */
  await linha(F.p, "09:00").locator("button", { hasText: "Ver" }).click();
  await F.p.waitForSelector("#eq-ver[open]");
  const dados = await F.p.textContent("#eq-ver-dados");
  confere(/Ana Cliente/.test(dados) && /99999-0011/.test(dados) && /iPhone 13 128 GB/.test(dados) && /Comprar um aparelho|Avaliar|Retirar|Conhecer|Outro/.test(dados),
    "Ver: cliente, telefone, data, horário, serviço e aparelho");
  confere(/wa\.me\/5522999990011/.test(await F.p.getAttribute("#eq-ver-zap", "href")), "Ver: botão do WhatsApp do cliente");
  await F.p.click("#eq-ver-confirmar");
  await F.p.waitForFunction(() => !document.querySelector("#eq-ver").open, null, { timeout: 8000 });
  confere(psql(`select status from public.agendamentos where nome = 'Ana Cliente'`) === "confirmado", "Ver: confirmar o agendamento");
  /* dia inteiro com agendamento existente */
  await F.p.click("#eq-bloq-dia");
  await F.p.waitForSelector("#eq-dlg[open]");
  confere(new RegExp("bloquear todos os horários de " + DIA.split("-").reverse().join("/")).test(await F.p.textContent("#eq-dlg-texto"))
    && /1 agendamento de cliente/.test(await F.p.textContent("#eq-dlg-aviso")), "bloquear dia: pergunta com a data e avisa do agendamento existente");
  await confirmaDialogo(F.p, "Feriado");
  await F.p.waitForSelector("#eq-desbloq-dia:not([hidden])", { timeout: 8000 });
  confere(psql(`select motivo from public.bloqueios_dia where data = '${DIA}'`) === "Feriado" && psql(`select status from public.agendamentos where nome = 'Ana Cliente'`) === "confirmado",
    "bloquear dia: dia fechado no banco e o agendamento do cliente continua");
  confere(await estadoDe(F.p, "09:00") === "agendado" && await estadoDe(F.p, "15:00") === "bloqueado", "bloquear dia: grade mostra o agendamento e o resto bloqueado");
  {
    const r = await fetch(BASE + "/api/agendamento", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify({ data: DIA, hora: "16:00", servico: "Conhecer a loja", nome: "Eva Cliente", telefone: "22999990055" }) });
    confere((await r.json()).erro === "dia_bloqueado", "bloquear dia: cliente não reserva nesse dia");
  }
  await foto(F.p, "equipe-iphone-dia-bloqueado");
  /* desbloquear */
  await F.p.click("#eq-desbloq-dia");
  await F.p.waitForSelector("#eq-dlg[open]");
  confere(/1 agendamento de cliente/.test(await F.p.textContent("#eq-dlg-aviso")), "desbloquear dia: confere antes e avisa que o agendamento continua");
  await confirmaDialogo(F.p);
  await F.p.waitForSelector("#eq-bloq-dia:not([hidden])", { timeout: 8000 });
  confere(psql(`select count(*) from public.bloqueios_dia where data = '${DIA}'`) === "0" && psql(`select status from public.agendamentos where nome = 'Ana Cliente'`) === "confirmado"
    && await estadoDe(F.p, "13:00") === "bloqueado" && await estadoDe(F.p, "15:00") === "livre", "desbloquear dia: tira só o bloqueio do dia (agendamento e bloqueios de horário ficam)");

  /* ===== dois funcionários ao mesmo tempo ===== */
  const M = await contexto("android");
  await entra(M.p, CONTAS.maria);
  await vaiParaDia(M.p, DIA);
  /* Maria bloqueia 15:00; a tela do Func ainda mostra 15:00 livre e ele tenta bloquear */
  await linha(M.p, "15:00").locator("button", { hasText: "Bloquear" }).click();
  await confirmaDialogo(M.p, "Atendimento externo");
  await M.p.waitForFunction(() => document.querySelector('#eq-horas li[data-hora="15:00"]').classList.contains("bloqueado"), null, { timeout: 8000 });
  confere(await estadoDe(F.p, "15:00") === "livre", "conflito: a tela do outro funcionário ainda estava desatualizada");
  await linha(F.p, "15:00").locator("button", { hasText: "Bloquear" }).click();
  await confirmaDialogo(F.p);
  await F.p.waitForFunction(() => document.querySelector('#eq-horas li[data-hora="15:00"]').classList.contains("bloqueado"), null, { timeout: 8000 });
  confere(/acabou de ser alterado por outro funcionário. Atualizamos a agenda para você/.test(await F.p.textContent("#eq-msg"))
    && psql(`select count(*) from public.agendamentos where data = '${DIA}' and hora = '15:00' and status = 'bloqueado'`) === "1",
    "conflito: o banco recusa a segunda operação, a tela avisa e atualiza (um bloqueio só)");
  /* Maria libera o 13:00; o Func tenta liberar o mesmo */
  await linha(M.p, "13:00").locator("button", { hasText: "Liberar" }).click();
  await confirmaDialogo(M.p);
  await M.p.waitForFunction(() => document.querySelector('#eq-horas li[data-hora="13:00"]').classList.contains("livre"), null, { timeout: 8000 });
  await linha(F.p, "13:00").locator("button", { hasText: "Liberar" }).click();
  await confirmaDialogo(F.p);
  await F.p.waitForFunction(() => document.querySelector('#eq-horas li[data-hora="13:00"]').classList.contains("livre"), null, { timeout: 8000 });
  confere(/acabou de ser alterado/.test(await F.p.textContent("#eq-msg")), "conflito: liberar o que outro funcionário já liberou também avisa e atualiza");
  confere(!M.erros.length && !F.erros.length, "painéis sem erro de JavaScript" + (M.erros.concat(F.erros).length ? " → " + M.erros.concat(F.erros).join(" | ") : ""));
  await M.ctx.close();

  /* ===== aba Bloqueios ===== */
  psql(`select set_config('request.jwt.claims', '{"sub":"${CONTAS.func.id}","role":"authenticated"}', false); select public.bloquear_dia_inteiro('${DIA2}', 'Loja fechada');`);
  await F.p.click("#eq-aba-bloqueios");
  await F.p.click('.eq-filtro[data-filtro="todos"]');
  await F.p.waitForFunction(() => document.querySelectorAll("#eq-lista-bloqueios .eq-item").length >= 3, null, { timeout: 8000 });
  const lista = await F.p.textContent("#eq-lista-bloqueios");
  confere(/Dia inteiro/.test(lista) && /Loja fechada/.test(lista) && /Almoço/.test(lista) && /por Func Teste|por Maria/.test(lista), "Bloqueios: lista dias e horários, com motivo e quem bloqueou");
  await F.p.locator("#eq-lista-bloqueios .eq-item.dia button", { hasText: "Desbloquear" }).first().click();
  await confirmaDialogo(F.p);
  await F.p.waitForFunction(() => !/Loja fechada/.test(document.querySelector("#eq-lista-bloqueios").textContent), null, { timeout: 8000 });
  confere(psql(`select count(*) from public.bloqueios_dia where data = '${DIA2}'`) === "0", "Bloqueios: desbloquear o dia pela lista");
  await F.p.click('.eq-filtro[data-filtro="hoje"]');
  await F.p.waitForTimeout(400);
  confere(!/Almoço/.test(await F.p.textContent("#eq-lista-bloqueios")) || DIA === hojeSP(), "Bloqueios: filtro Hoje mostra só o de hoje");
  await F.p.click("#eq-aba-agenda");

  /* registro das ações */
  confere(psql(`select count(distinct acao) from public.audit_logs where acao in ('bloqueou_horario','liberou_horario','bloqueou_dia','desbloqueou_dia','confirmou')`) === "5"
    && psql(`select count(*) from public.audit_logs where funcionario_nome = '' or funcionario_id is null`) === "0",
    "registro: cada ação com quem fez, o quê, dia, horário e registro");

  /* ===== segredos e sessão ===== */
  const guardado = await F.p.evaluate(() => JSON.stringify({ s: Object.assign({}, sessionStorage), l: Object.assign({}, localStorage) }));
  confere(!guardado.includes(SECRETA) && !guardado.includes(JWT_SERVICO) && !guardado.includes(CONTAS.func.senha) && !/srphone_adm/.test(guardado),
    "navegador: no sessionStorage só a sessão do Supabase Auth (sem chave secreta, sem senha)");
  confere(!vistoPeloNavegador.some((t) => t.includes(SECRETA) || t.includes(JWT_SERVICO) || t.includes(SEGREDO_JWT)), "navegador: nenhuma resposta trouxe chave secreta");
  for (const arq of ["/js/funcionario.js", "/js/scheduling.js", "/data/config.js", "/funcionario/", "/"]){
    const t = await (await fetch(BASE + arq)).text();
    if (t.includes(SECRETA) || t.includes(JWT_SERVICO) || /sb_secret_[A-Za-z0-9_-]{10,}|"role"\s*:\s*"service_role"/.test(t)) confere(false, "chave secreta em " + arq);
  }
  confere(true, "arquivos públicos sem chave secreta");
  /* sessão vencida com renovação válida: renova sozinho e continua no painel */
  await F.p.evaluate(() => { const s = JSON.parse(sessionStorage.getItem("srphone_equipe")); s.expira = Math.floor(Date.now() / 1000) - 10; sessionStorage.setItem("srphone_equipe", JSON.stringify(s)); });
  await F.p.reload({ waitUntil: "load" });
  await F.p.waitForSelector("#eq-painel:not([hidden])", { timeout: 10000 });
  confere(true, "sessão perto de vencer: renovada pelo Supabase Auth sem pedir senha de novo");
  /* sair */
  const antigo = await F.p.evaluate(() => JSON.parse(sessionStorage.getItem("srphone_equipe")).refresh_token);
  await F.p.click("#eq-sair");
  await F.p.waitForSelector("#eq-login:not([hidden])");
  confere(await F.p.evaluate(() => sessionStorage.getItem("srphone_equipe") === null), "sair: a sessão some do navegador");
  await ate(async () => (await fetch(GW + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: antigo }) })).status >= 400, 5000);
  const reuso = await fetch(GW + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: antigo }) });
  confere(reuso.status >= 400, `sair: a sessão foi encerrada no Supabase Auth (renovar depois de sair: HTTP ${reuso.status})`);
  /* sessão vencida de verdade (renovação não vale mais): volta ao login */
  await F.p.evaluate((rt) => sessionStorage.setItem("srphone_equipe", JSON.stringify({ access_token: "a.b.c", refresh_token: rt, expira: 1, aal: "aal1" })), antigo);
  await F.p.reload({ waitUntil: "load" });
  await F.p.waitForSelector("#eq-login:not([hidden])", { timeout: 10000 });
  confere(/sessão terminou/.test(await F.p.textContent("#eq-erro-login")) && await F.p.evaluate(() => sessionStorage.getItem("srphone_equipe") === null),
    "sessão expirada: volta ao login com aviso e limpa a sessão");
  await F.ctx.close();

  /* ===== esqueci minha senha (link do e-mail de verdade, gerado pelo Supabase Auth) ===== */
  {
    const R = await contexto();
    await R.p.goto(BASE + "/funcionario/", { waitUntil: "load" });
    await R.p.click("#eq-esqueci");
    await R.p.fill("#eq-rec-email", "naoexiste@x.test");
    await R.p.click("#eq-rec-enviar");
    await R.p.waitForSelector("#eq-ok-recuperar:not([hidden])", { timeout: 8000 });
    confere(/Se este e-mail for de uma conta da equipe/.test(await R.p.textContent("#eq-ok-recuperar")), "esqueci minha senha: mesma resposta exista ou não a conta");
    const link = await (await fetch(AUTH + "/admin/generate_link", { method: "POST", headers: { Authorization: "Bearer " + JWT_SERVICO, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recovery", email: CONTAS.func.email, redirect_to: BASE + "/funcionario/" }) })).json();
    await R.p.goto(link.action_link, { waitUntil: "load" });
    await R.p.waitForSelector("#eq-nova-senha:not([hidden])", { timeout: 10000 });
    confere(!/access_token/.test(R.p.url()), "link do e-mail: o token sai da barra de endereço na hora");
    await R.p.fill("#eq-nova1", "Nova-Senha-456"); await R.p.fill("#eq-nova2", "Nova-Senha-456");
    await R.p.click("#eq-nova-salvar");
    await R.p.waitForSelector("#eq-painel:not([hidden])", { timeout: 10000 });
    await R.p.click("#eq-sair");
    CONTAS.func.senha = "Nova-Senha-456";
    await entra(R.p, CONTAS.func);
    confere(true, "esqueci minha senha: link → senha nova → entra com a senha nova");
    await R.ctx.close();
  }

  /* ===== MFA (verificação em duas etapas) do administrador ===== */
  {
    /* com a senha, mas sem o código: o banco não entrega nada (aal1) */
    const l = await (await fetch(GW + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
      body: JSON.stringify({ email: CONTAS.dona.email, password: CONTAS.dona.senha }) })).json();
    const r = await fetch(GW + "/rest/v1/rpc/agenda_dia", { method: "POST", headers: { apikey: PUB, Authorization: "Bearer " + l.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ p_data: DIA }) });
    confere(/sem_permissao/.test(await r.text()), "MFA: admin só com a senha (aal1) não lê a agenda (o banco exige o código)");
    const A = await contexto("computador");
    await entra(A.p, CONTAS.dona, "#eq-mfa");
    await A.p.waitForSelector("#eq-mfa-cadastro:not([hidden])", { timeout: 10000 });
    confere(/^data:image\/svg\+xml/.test(await A.p.getAttribute("#eq-mfa-qr", "src")), "MFA: cadastro mostra o código QR do Supabase Auth");
    const segredo = (await A.p.textContent("#eq-mfa-segredo")).replace(/\s/g, "");
    await A.p.fill("#eq-mfa-codigo", "000000");
    await A.p.click("#eq-mfa-ok");
    await A.p.waitForSelector("#eq-erro-mfa:not([hidden])", { timeout: 8000 });
    confere(/incorreto/.test(await A.p.textContent("#eq-erro-mfa")), "MFA: código errado recusado");
    await A.p.fill("#eq-mfa-codigo", totp(segredo));
    await A.p.click("#eq-mfa-ok");
    await A.p.waitForSelector("#eq-painel:not([hidden])", { timeout: 10000 });
    confere(await A.p.evaluate(() => JSON.parse(sessionStorage.getItem("srphone_equipe")).aal) === "aal2" && await A.p.locator("#eq-testar-aviso").isVisible(),
      "MFA: com o código certo entra (sessão aal2); admin vê o teste do aviso");
    await foto(A.p, "equipe-computador-agenda");
    await A.p.click("#eq-sair");
    /* login seguinte: só pede o código (o autenticador já está cadastrado) */
    await entra(A.p, CONTAS.dona, "#eq-mfa");
    await A.p.waitForFunction(() => !document.querySelector("#eq-mfa-ok").disabled, null, { timeout: 8000 });
    confere(await A.p.locator("#eq-mfa-cadastro").isHidden(), "MFA: no login seguinte pede só o código de 6 dígitos");
    let entrou = false;
    for (const d of [0, 1]){
      if (d) await espera(30000 - (Date.now() % 30000) + 500);
      await A.p.fill("#eq-mfa-codigo", totp(segredo));
      await A.p.click("#eq-mfa-ok");
      entrou = await A.p.waitForSelector("#eq-painel:not([hidden])", { timeout: 6000 }).then(() => true, () => false);
      if (entrou) break;
    }
    confere(entrou, "MFA: entra de novo com o código");
    confere(!A.erros.length, "admin sem erro" + (A.erros.length ? " → " + A.erros.join(" | ") : ""));
    await A.ctx.close();
  }

  /* ===== celular, tablet e computador: login, calendário, seleção, bloqueio, desbloqueio, Ver ===== */
  for (const tela of Object.keys(TELAS)){
    limpaLimites();
    const T = await contexto(tela);
    await T.p.goto(BASE + "/funcionario/", { waitUntil: "load" });
    await T.p.waitForSelector("#eq-login:not([hidden])");
    const loginOk = await semRolagemLateral(T.p);
    await foto(T.p, `equipe-${tela}-login`);
    await entra(T.p, CONTAS.maria);
    await vaiParaDia(T.p, DIA3);
    const painelOk = await semRolagemLateral(T.p);
    const livre = (await T.p.locator("#eq-horas li.livre").first().getAttribute("data-hora"));
    await linha(T.p, livre).locator("button", { hasText: "Bloquear" }).click();
    await confirmaDialogo(T.p, "Outro", "Inventário");
    await T.p.waitForFunction((h) => document.querySelector(`#eq-horas li[data-hora="${h}"]`).classList.contains("bloqueado"), livre, { timeout: 8000 });
    const motivo = psql(`select motivo from public.agendamentos where data = '${DIA3}' and hora = '${livre}' and status = 'bloqueado'`);
    await foto(T.p, `equipe-${tela}-bloqueado`);
    await linha(T.p, livre).locator("button", { hasText: "Liberar" }).click();
    await confirmaDialogo(T.p);
    await T.p.waitForFunction((h) => document.querySelector(`#eq-horas li[data-hora="${h}"]`).classList.contains("livre"), livre, { timeout: 8000 });
    const ag = T.p.locator("#eq-horas li.agendado button", { hasText: "Ver" });
    let verOk = true;
    if (await ag.count()){
      await ag.first().click();
      await T.p.waitForSelector("#eq-ver[open]");
      verOk = await T.p.evaluate(() => { const r = document.querySelector("#eq-ver").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
      await foto(T.p, `equipe-${tela}-ver`);
      await T.p.click("#eq-ver-fechar");
    }
    const alvos = await T.p.evaluate(() => Array.prototype.filter.call(document.querySelectorAll("#eq-painel button, .eq-topo button"), (b) => b.offsetParent)
      .map((b) => b.getBoundingClientRect().height).filter((h) => h < 40).length);
    await T.p.click("#eq-sair");
    confere(loginOk && painelOk && motivo === "Outro: Inventário" && verOk && alvos === 0 && !T.erros.length,
      `${tela}: login, calendário, bloquear, liberar e Ver sem rolagem lateral, botões grandes, sem erro` + (T.erros.length ? " → " + T.erros.join(" | ") : ""));
    await T.ctx.close();
  }
} catch (e){
  erroGeral = e;
  console.log("ERRO NO TESTE: " + (e && e.stack || e));
  for (const p of processos) console.log("--- " + p.nome + " ---\n" + p.log());
} finally {
  await nav.close().catch(() => {});
  gw.close(); srv.close();
  for (const p of processos) p.kill("SIGTERM");
}

console.log(`\nSITE + ÁREA DA EQUIPE (Supabase Auth de verdade + PostgREST + navegador): ${ok.length} ok, ${falhas.length} falha(s)`);
for (const t of ok) console.log("  ok: " + t);
for (const t of falhas) console.log("  FALHOU: " + t);
process.exit(falhas.length || erroGeral ? 1 : 0);
