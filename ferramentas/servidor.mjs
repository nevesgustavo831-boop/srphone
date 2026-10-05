// npm start → abre o site em http://localhost:8080 para conferir antes de publicar.
// Aplica os mesmos cabeçalhos de segurança do arquivo _headers (igual ao Netlify).
// Também roda as funções do servidor, como o Netlify faz: o assistente (/api/assistente), o
// cálculo de entrega (/api/entrega) e o pedido de horário (/api/agendamento). Para testar com a IA ou o mapa de verdade, ponha AI_API_KEY,
// MAPS_SERVER_KEY e MAPS_BROWSER_KEY no arquivo .env (ele nunca vai para o GitHub). Sem chave, o chat
// usa o cérebro local e a entrega oferece a retirada e o WhatsApp.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./ler-dados.mjs";

/* aqui é o computador de quem desenvolve (npm start / npm test): libera o provedor "demonstracao" da IA */
process.env.SR_AMBIENTE_LOCAL = "1";

/* variáveis da IA e do mapa do arquivo .env (só no computador; no Netlify elas ficam no painel) */
(function(){
  const arq = path.join(RAIZ, ".env");
  if (!fs.existsSync(arq)) return;
  for (const linha of fs.readFileSync(arq, "utf8").split(/\r?\n/)){
    const m = linha.match(/^\s*((?:AI|MAPS|ENTREGA|AGENDA)_[A-Z0-9_]+|SUPABASE_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|TURNSTILE_SECRET_KEY)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
})();

/* a função do servidor, igual ao Netlify: recebe um Request e devolve um Response (com streaming) */
const FUNCOES = { "/api/assistente": "../netlify/functions/assistente.mjs", "/api/entrega": "../netlify/functions/entrega.mjs",
  "/api/agendamento": "../netlify/functions/agendamento.mjs" };
async function atendeFuncao(req, res, porta, arquivo){
  try {
    const partes = []; let tam = 0;
    for await (const c of req){ tam += c.length; if (tam > 64 * 1024) break; partes.push(c); }
    const cabecalhos = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") cabecalhos.set(k, v);
    const pedido = new Request(`http://127.0.0.1:${porta}${req.url}`, {
      method: req.method, headers: cabecalhos,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(partes)
    });
    const { default: funcao } = await import(arquivo);
    const resposta = await funcao(pedido, { ip: req.socket.remoteAddress || "127.0.0.1" });
    const h = {}; resposta.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(resposta.status, h);
    if (resposta.body) for await (const pedaco of resposta.body){ res.write(pedaco); }
    res.end();
  } catch (e){
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("erro na função local: " + String(e && e.message || e));
  }
}

/* igual ao netlify.toml: enquanto o GLB oficial não existe, entrega o aviso no lugar (sem 404) */
const REESCRITAS = { "/assets/modelos/srphone-assistant.glb": "/assets/modelos/sem-modelo.json" };

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml"
};

function cabecalhosGlobais(){
  const linhas = fs.readFileSync(path.join(RAIZ, "_headers"), "utf8").split("\n");
  const h = {}; let dentro = false;
  for (const l of linhas){
    if (/^\/\*\s*$/.test(l)) { dentro = true; continue; }
    if (/^\S/.test(l)) { dentro = false; continue; }
    const m = dentro && l.match(/^\s+([A-Za-z-]+):\s*(.+)$/);
    if (m && m[1] !== "Strict-Transport-Security") h[m[1]] = m[2].replace("upgrade-insecure-requests", "").trim();
  }
  return h;
}

const INTERNOS = /^\/(ferramentas|docs|supabase|node_modules|services|netlify)(\/|$)|^\/(README\.md|LEIA-ME\.txt|CHECKLIST-PRODUCAO\.md|AUDITORIA-FINAL-SRPHONE\.md|GUIA-MODELO-3D-SRPHONE\.md|ASSISTENTE-SRPHONE-FINAL\.md|ENTREGA-SRPHONE\.md|PRODUCAO-SRPHONE\.md|AUDITORIA-PRODUCAO-SRPHONE\.md|SEGURANCA-E-PAINEL-FUNCIONARIO\.md|package(-lock)?\.json|\.env(\.example)?)$/;

export function iniciaServidor(porta = 0){
  const cab = cabecalhosGlobais();
  const srv = http.createServer((req, res) => {
    let caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (FUNCOES[caminho]){ atendeFuncao(req, res, srv.address().port, FUNCOES[caminho]); return; }
    /* igual à Netlify (netlify.toml): pastas de trabalho do projeto não vão para o visitante */
    if (INTERNOS.test(caminho)) caminho = "/__interno__";
    if (REESCRITAS[caminho] && !fs.existsSync(path.join(RAIZ, caminho))) caminho = REESCRITAS[caminho];
    /* produto sem página própria (ainda não rodou o build): abre pelo endereço de sempre */
    const prod = caminho.match(/^\/produto\/([a-z0-9-]+)\/?$/);
    if (prod && !fs.existsSync(path.join(RAIZ, "produto", prod[1], "index.html"))){
      res.writeHead(302, { Location: "/?produto=" + prod[1] }); res.end(); return;
    }
    /* igual à Netlify: pasta sem a barra no fim ganha a barra (os endereços relativos da página dependem dela) */
    if (!path.extname(caminho) && !caminho.endsWith("/") && fs.existsSync(path.join(RAIZ, caminho, "index.html"))){
      const u = new URL(req.url, "http://x");
      res.writeHead(301, { Location: caminho + "/" + u.search }); res.end(); return;
    }
    if (caminho.endsWith("/")) caminho += "index.html";
    const arq = path.join(RAIZ, path.normalize(caminho).replace(/^(\.\.[/\\])+/, ""));
    const dentroDaRaiz = arq.startsWith(RAIZ) && !arq.includes(`${path.sep}.git`) && !arq.includes(`${path.sep}node_modules`);
    const ok = dentroDaRaiz && fs.existsSync(arq) && fs.statSync(arq).isFile();
    const alvo = ok ? arq : path.join(RAIZ, "404.html");
    res.writeHead(ok ? 200 : 404, { ...cab, "Content-Type": TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(alvo).pipe(res);
  });
  return new Promise((ok) => srv.listen(porta, "127.0.0.1", () => ok(srv)));
}

if (process.argv[1] && process.argv[1].endsWith("servidor.mjs")){
  const porta = Number(process.env.PORT) || 8080;
  iniciaServidor(porta).then(() => console.log(`Site da SR Phone em http://localhost:${porta}  (Ctrl+C para parar)`));
}
