// npm run mascote:imagem → gera assets/assistente/mascote-estatico.webp, a versão parada do mascote.
// Ela aparece antes do 3D carregar, quando o aparelho não tem WebGL e na aba "minimizado".
// A imagem sai do PRÓPRIO 3D (o mascote da marca, ou o GLB de ASSISTENTE.modelo3d se existir),
// na pose parada, com fundo transparente. Mudou o mascote? Rode de novo.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { iniciaServidor } from "../servidor.mjs";
import { lerDados, RAIZ } from "../ler-dados.mjs";

const A = lerDados().ASSISTENTE || {};
const destino = path.join(RAIZ, A.imagem || "assets/assistente/mascote-estatico.webp");
const W = 240, H = 280;                         /* 2x o tamanho no computador (120 x 140) */
const srv = await iniciaServidor(0);
const BASE = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch({ args: ["--enable-unsafe-swiftshader"], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await ctx.route(BASE + "/__mascote.html", (r) => r.fulfill({ contentType: "text/html", body:
    `<!doctype html><html><body style="margin:0;background:transparent"><div id="p" style="width:${W}px;height:${H}px"></div>
     <script type="module">
       import { iniciar } from "/js/mascote3d.js";
       const api = await iniciar(document.getElementById("p"), { modelo: ${JSON.stringify(A.modelo3d || "")}, animacoes: ${JSON.stringify(A.animacoes || {})}, reduzMovimento: true });
       await new Promise((ok) => setTimeout(ok, 900));
       window.info = api.info();
       window.webp = api.capturar("image/webp", 0.9);
     </script></body></html>` }));
  const p = await ctx.newPage();
  await p.goto(BASE + "/__mascote.html");
  await p.waitForFunction(() => window.webp, null, { timeout: 60000 });
  const { webp, info } = await p.evaluate(() => ({ webp: window.webp, info: window.info }));
  if (!/^data:image\/webp/.test(webp)) throw new Error("o navegador não gerou WebP");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(webp.split(",")[1], "base64"));
  console.log(`Imagem do mascote (${info.tipo === "glb" ? "GLB de artista" : "mascote 3D da marca"}) gravada em ${path.relative(RAIZ, destino)} · ${fs.statSync(destino).size} bytes`);
  if (info.erroGLB) console.log("AVISO: o GLB não abriu (" + info.erroGLB + "); a imagem saiu do mascote 3D da marca.");
} finally { await nav.close(); srv.close(); }
