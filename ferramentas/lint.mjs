// npm run lint
// Conferências automáticas que evitam site quebrado ou inseguro:
//  - sintaxe de todos os arquivos JavaScript;
//  - nenhuma chave secreta, senha ou token no código público;
//  - nenhum <script> embutido nem onclick no HTML (a política de segurança bloqueia);
//  - toda imagem com texto alternativo, ids sem repetição e arquivos locais existentes;
//  - a política de segurança igual no _headers e no netlify.toml;
//  - assistente com IA: o código do servidor (services/, netlify/) confere a sintaxe e não tem chave;
//    o código do navegador nunca fala com a API da IA nem lê variável de servidor.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { RAIZ } from "./ler-dados.mjs";

const erros = [], avisos = [];
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const lista = (dir, ext) => fs.readdirSync(path.join(RAIZ, dir)).filter((f) => f.endsWith(ext)).map((f) => dir + "/" + f);

// ---------- JavaScript ----------
const js = [...lista("js", ".js"), ...lista("data", ".js")];
for (const f of js){
  const codigo = ler(f);
  /* módulo (import/export, ex.: js/unboxing3d.js): o próprio Node confere como módulo */
  if (/^\s*(import|export)\s/m.test(codigo)){
    const r = spawnSync(process.execPath, ["--check", path.join(RAIZ, f)], { encoding: "utf8" });
    if (r.status !== 0) erros.push(`${f}: erro de sintaxe: ${(r.stderr || "").split("\n").find((l) => /Error/.test(l)) || "módulo inválido"}`);
    for (const m of codigo.matchAll(/^\s*import[^"']+["'](\.{1,2}\/[^"']+)["']/gm)){
      if (!fs.existsSync(path.join(RAIZ, path.dirname(f), m[1]))) erros.push(`${f}: import de arquivo que não existe: ${m[1]}`);
    }
    continue;
  }
  try { new vm.Script(codigo, { filename: f }); }
  catch (e){ erros.push(`${f}: erro de sintaxe: ${e.message}`); }
}

// ---------- código do servidor (assistente com IA): módulos válidos ----------
const todos = (dir) => fs.existsSync(path.join(RAIZ, dir)) ? fs.readdirSync(path.join(RAIZ, dir), { recursive: true }).map((f) => dir + "/" + f).filter((f) => /\.mjs$/.test(f)) : [];
const servidor = [...todos("services"), ...todos("netlify/functions")];
for (const f of servidor){
  const r = spawnSync(process.execPath, ["--check", path.join(RAIZ, f)], { encoding: "utf8" });
  if (r.status !== 0) erros.push(`${f}: erro de sintaxe: ${(r.stderr || "").split("\n").find((l) => /Error/.test(l)) || "módulo inválido"}`);
}
if (!servidor.includes("netlify/functions/assistente.mjs")) erros.push("netlify/functions/assistente.mjs não existe (a função do assistente com IA).");
if (!servidor.includes("netlify/functions/entrega.mjs")) erros.push("netlify/functions/entrega.mjs não existe (a função do cálculo de entrega).");
if (!servidor.includes("netlify/functions/agendamento.mjs")) erros.push("netlify/functions/agendamento.mjs não existe (a função do pedido de horário).");

// ---------- segredos ----------
const publicos = [...js, ...servidor, "index.html", "404.html", "funcionario/index.html", "manifest.webmanifest", "_headers", "netlify.toml", ".env.example", "robots.txt", "sitemap.xml",
  ...fs.readdirSync(path.join(RAIZ, "supabase/migrations")).map((f) => "supabase/migrations/" + f)].filter((f) => fs.existsSync(path.join(RAIZ, f)));
const SEGREDOS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "chave secreta do Supabase (sb_secret_)"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "chave privada"],
  [/\b(senha|password|secret|token|api_?key|authorization)\s*[:=]\s*["'][^"'\s]{12,}["']/i, "senha, token ou chave escrita no código"],
  [/^[ \t]*SUPABASE_(SERVICE_ROLE|SECRET)_KEY[ \t]*=[ \t]*[^\s#]+/m, "chave secreta do Supabase preenchida (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY)"],
  [/^[ \t]*TURNSTILE_SECRET_KEY[ \t]*=[ \t]*[^\s#]+/m, "TURNSTILE_SECRET_KEY preenchida"],
  [/\b0x4AAAAAAA[A-Za-z0-9_-]{20,}\b(?![^\n]*SITE)/, "segredo do Cloudflare Turnstile (0x4AAAAAAA...)"],
  [/\bBearer\s+eyJ[A-Za-z0-9_-]{20,}/, "token Bearer fixo no código"],
  [/AKIA[0-9A-Z]{16}/, "chave da AWS"],
  [/sk-ant-[A-Za-z0-9_-]{10,}/, "chave da Anthropic (sk-ant-)"],
  [/\bsk-(proj-)?[A-Za-z0-9]{32,}/, "chave de API de IA (sk-...)"],
  [/^[ \t]*AI_API_KEY[ \t]*=[ \t]*[^\s#]+/m, "AI_API_KEY preenchida"],
  [/^[ \t]*MAPS_(API|BROWSER|SERVER)_KEY[ \t]*=[ \t]*[^\s#]+/m, "chave do Google Maps preenchida (MAPS_SERVER_KEY, MAPS_BROWSER_KEY ou MAPS_API_KEY)"],
  [/AIza[0-9A-Za-z_-]{35}/, "chave de API do Google (AIza...)"]
];
for (const f of publicos){
  const t = ler(f);
  for (const [re, nome] of SEGREDOS) if (re.test(t)) erros.push(`${f}: parece haver ${nome}.`);
  for (const jwt of t.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g) || []){
    try {
      const p = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString("utf8"));
      if (p.role === "service_role") erros.push(`${f}: chave service_role do Supabase no código público!`);
    } catch { /* não é JWT */ }
  }
}

// ---------- HTML (inclui as páginas de produto geradas pelo build) ----------
const paginasProduto = fs.existsSync(path.join(RAIZ, "produto"))
  ? fs.readdirSync(path.join(RAIZ, "produto")).map((d) => `produto/${d}/index.html`).filter((f) => fs.existsSync(path.join(RAIZ, f)))
  : [];
for (const f of ["index.html", "404.html", "funcionario/index.html", ...paginasProduto]){
  const h = ler(f);
  const pasta = path.dirname(path.join(RAIZ, f));
  const alvoDe = (v) => v.startsWith("/") ? path.join(RAIZ, v) : path.join(pasta, v);
  const semComentarios = h.replace(/<!--[\s\S]*?-->/g, "");
  if (/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/i.test(semComentarios)) erros.push(`${f}: <script> embutido. Coloque o código em um arquivo .js (a política de segurança bloqueia script embutido).`);
  if (/\son[a-z]+\s*=\s*["']/i.test(semComentarios)) erros.push(`${f}: atributo onclick/onload no HTML. Use addEventListener em um arquivo .js.`);
  if (/href=["']javascript:/i.test(semComentarios)) erros.push(`${f}: link javascript:`);
  for (const img of semComentarios.match(/<img\b[^>]*>/gi) || []) if (!/\salt=/.test(img)) erros.push(`${f}: imagem sem alt: ${img.slice(0, 80)}`);
  const ids = [...semComentarios.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const rep = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (rep.length) erros.push(`${f}: ids repetidos: ${[...new Set(rep)].join(", ")}`);
  for (const m of semComentarios.matchAll(/\s(?:src|href)="(?!https?:|#|mailto:|tel:|data:)([^"?#]+)"/g)){
    const alvo = m[1];
    if (alvo && alvo !== "/" && !fs.existsSync(alvoDe(alvo))) erros.push(`${f}: arquivo não encontrado: ${alvo}`);
  }
  for (const m of semComentarios.matchAll(/srcset="([^"]+)"/g))
    for (const parte of m[1].split(",")){
      const alvo = parte.trim().split(/\s+/)[0];
      if (alvo && !fs.existsSync(alvoDe(alvo))) erros.push(`${f}: arquivo do srcset não encontrado: ${alvo}`);
    }
  if (/target="_blank"(?![^>]*rel="[^"]*noopener)/.test(semComentarios)) erros.push(`${f}: link com target="_blank" sem rel="noopener noreferrer".`);
}

// ---------- assistente com IA: o navegador nunca vê a chave nem fala direto com a IA ----------
for (const f of js){
  const t = ler(f);
  if (/process\.env|AI_API_KEY\s*[:=]|x-api-key|api\.anthropic\.com|@anthropic-ai\/sdk/.test(t))
    erros.push(`${f}: código do navegador falando com a API da IA ou lendo variável do servidor. A IA fica só na função (netlify/functions/assistente.mjs).`);
}
{
  const toml = ler("netlify.toml");
  if (!/\[functions\][\s\S]*directory\s*=\s*"netlify\/functions"/.test(toml)) erros.push('netlify.toml: falta [functions] directory = "netlify/functions" (a função do assistente).');
  if (!/from\s*=\s*"\/assets\/modelos\/srphone-assistant\.glb"\s*\n\s*to\s*=\s*"\/assets\/modelos\/sem-modelo\.json"\s*\n\s*status\s*=\s*200/.test(toml))
    erros.push("netlify.toml: falta a regra do mascote (srphone-assistant.glb → sem-modelo.json, status 200, sem force).");
  for (const pasta of ["services", "netlify"]) if (!new RegExp('from\\s*=\\s*"/' + pasta + '/\\*"').test(toml)) erros.push(`netlify.toml: a pasta ${pasta}/ precisa responder 404 (não é pública).`);
}

// ---------- entrega: rota, endereço e valor só no servidor; o navegador só pede os blocos do mapa ----------
const semComentario = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
for (const f of js){
  const t = semComentario(ler(f));
  if (/MAPS_API_KEY|MAPS_SERVER_KEY|MAPS_BROWSER_KEY|routes\.googleapis\.com|places\.googleapis\.com|maps\.googleapis\.com\/maps\/api\/(geocode|directions|distancematrix)/.test(t))
    erros.push(`${f}: código do navegador chamando a API de rotas/endereços do Google ou lendo a chave. Isso fica só na função (netlify/functions/entrega.mjs).`);
}
if (/localStorage|sessionStorage|document\.cookie|indexedDB/.test(semComentario(ler("js/entrega-app.js") + ler("js/entrega.js"))))
  erros.push("js/entrega-app.js: a calculadora de entrega não pode guardar o local da pessoa (localStorage, sessionStorage, cookie ou IndexedDB).");

// ---------- área da equipe e agendamento: o navegador nunca vê segredo nem monta HTML com dados ----------
for (const f of js){
  const t = semComentario(ler(f));
  if (/SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|TURNSTILE_SECRET_KEY|siteverify/.test(t))
    erros.push(`${f}: código do navegador citando chave secreta ou conferindo o anti-robô. Isso fica só no servidor (services/agenda/).`);
}
if (fs.existsSync(path.join(RAIZ, "js/funcionario.js"))){
  const t = semComentario(ler("js/funcionario.js"));
  if (/\.innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(t)) erros.push("js/funcionario.js: a Área da Equipe não pode montar HTML com texto (use textContent).");
  if (/localStorage/.test(t)) erros.push("js/funcionario.js: a sessão da equipe fica só no sessionStorage (some ao fechar o navegador).");
  if (/rpc\("solicitar_horario"|\/rest\/v1\/agendamentos/.test(t)) erros.push("js/funcionario.js: a equipe só mexe na agenda pelas funções do banco (nada de gravar direto na tabela).");
} else erros.push("js/funcionario.js não existe (a Área da Equipe).");
if (/solicitar_horario|\/rest\/v1\/agendamentos/.test(semComentario(ler("js/scheduling.js"))))
  erros.push("js/scheduling.js: o pedido do cliente vai só pela função do servidor (/api/agendamento), nunca direto ao banco.");
{
  const toml = ler("netlify.toml");
  for (const md of fs.readdirSync(RAIZ).filter((f) => /\.md$/.test(f) || f === "LEIA-ME.txt"))
    if (!new RegExp('from\\s*=\\s*"/' + md.replace(/\./g, "\\.") + '"').test(toml)) erros.push(`netlify.toml: o documento ${md} precisa responder 404 (não é público).`);
  if (!/for\s*=\s*"\/funcionario\/\*"[\s\S]*?X-Robots-Tag\s*=\s*"noindex/.test(toml)) erros.push("netlify.toml: /funcionario/* precisa de X-Robots-Tag noindex.");
}

// ---------- política de segurança igual nos dois arquivos ----------
const cspH = (ler("_headers").match(/Content-Security-Policy:\s*(.+)/) || [])[1];
const cspN = (ler("netlify.toml").match(/Content-Security-Policy\s*=\s*"([^"]+)"/) || [])[1];
if (!cspH || !cspN) erros.push("Content-Security-Policy não encontrada no _headers ou no netlify.toml.");
else if (cspH.trim() !== cspN.trim()) erros.push("A Content-Security-Policy do _headers é diferente da do netlify.toml. Deixe as duas iguais.");
else if (/script-src[^;]*'unsafe-inline'/.test(cspH)) avisos.push("script-src ainda permite 'unsafe-inline'.");
if (cspH && !/img-src[^;]*https:\/\/tile\.googleapis\.com/.test(cspH)) erros.push("Content-Security-Policy: img-src precisa de https://tile.googleapis.com (os blocos do mapa da entrega).");
if (cspH && !/connect-src[^;]*https:\/\/tile\.googleapis\.com/.test(cspH)) erros.push("Content-Security-Policy: connect-src precisa de https://tile.googleapis.com (os direitos do mapa da entrega).");
if (cspH && /cdn\.jsdelivr\.net|unpkg\.com|'unsafe-eval'/.test(cspH)) erros.push("Content-Security-Policy: sem CDN de terceiros (cdn.jsdelivr.net, unpkg) e sem 'unsafe-eval': as bibliotecas ficam em assets/vendor/.");
if (cspH && !(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(cspH) && /frame-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(cspH)))
  erros.push("Content-Security-Policy: o anti-robô (Turnstile) precisa de https://challenges.cloudflare.com em script-src e frame-src.");
const ppH = (ler("_headers").match(/Permissions-Policy:\s*(.+)/) || [])[1];
const ppN = (ler("netlify.toml").match(/Permissions-Policy\s*=\s*"([^"]+)"/) || [])[1];
if (!ppH || !ppN || ppH.trim() !== ppN.trim()) erros.push("A Permissions-Policy do _headers é diferente da do netlify.toml. Deixe as duas iguais.");
else if (!/geolocation=\(self\)/.test(ppH)) erros.push("Permissions-Policy: use geolocation=(self) (a localização só no próprio site, para a calculadora de entrega; nunca geolocation=*).");

// ---------- avisos úteis ----------
for (const f of js){
  const t = ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (/\b(alert|confirm|prompt)\(/.test(t)) avisos.push(`${f}: usa alert/confirm/prompt. Prefira mensagem na própria tela.`);
}

console.log(`\nSR Phone · lint\n  arquivos JavaScript: ${js.length}`);
for (const a of avisos) console.log("  aviso: " + a);
if (erros.length){
  console.error("\nERROS:\n  - " + erros.join("\n  - ") + "\n");
  process.exit(1);
}
console.log("\nLINT SEM ERROS\n");
