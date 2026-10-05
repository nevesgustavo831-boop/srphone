// npm run links (também roda no npm test)
// Procura, sem abrir o navegador:
//  - links e imagens do HTML que apontam para arquivo que não existe (index, 404 e páginas de produto);
//  - âncoras (#secao) que não existem na página;
//  - imagens, vídeos e fotos citados no catálogo, na configuração e nos scripts;
//  - url() do CSS, ícones do manifest, import de módulos JavaScript;
//  - sitemap apontando para página que não existe;
//  - endereço do site escrito fora da configuração central (SITE_CONFIG.url).
import fs from "node:fs";
import path from "node:path";
import { lerDados, RAIZ } from "./ler-dados.mjs";

const erros = [];
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const existe = (abs) => fs.existsSync(abs);
const semComentarios = (h) => h.replace(/<!--[\s\S]*?-->/g, "");
const externo = (v) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v);

// ---------- HTML ----------
const paginas = ["index.html", "404.html"];
if (existe(path.join(RAIZ, "produto")))
  for (const d of fs.readdirSync(path.join(RAIZ, "produto"))) if (existe(path.join(RAIZ, "produto", d, "index.html"))) paginas.push(`produto/${d}/index.html`);
let checados = 0;
for (const f of paginas){
  const h = semComentarios(ler(f));
  const pasta = path.dirname(path.join(RAIZ, f));
  const ids = new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of h.matchAll(/\s(href|src|poster)="([^"]*)"/g)){
    const v = m[2];
    if (!v || externo(v) || v === "#") continue;
    if (v.startsWith("#")){
      if (v.startsWith("#/")) continue;                         /* rotas do site (#/produto/..., #/agenda) */
      if (!ids.has(v.slice(1))) erros.push(`${f}: âncora ${v} não existe na página`);
      continue;
    }
    const alvo = v.split(/[?#]/)[0];
    const abs = alvo.startsWith("/") ? path.join(RAIZ, alvo) : path.join(pasta, alvo);
    checados++;
    if (!existe(abs) && !existe(path.join(abs, "index.html"))) erros.push(`${f}: ${m[1]}="${v}" aponta para arquivo que não existe`);
  }
  for (const m of h.matchAll(/srcset="([^"]+)"/g))
    for (const parte of m[1].split(",")){
      const v = parte.trim().split(/\s+/)[0];
      if (!v || externo(v)) continue;
      checados++;
      if (!existe(v.startsWith("/") ? path.join(RAIZ, v) : path.join(pasta, v))) erros.push(`${f}: srcset com arquivo que não existe: ${v}`);
    }
  /* âncoras que o JavaScript usa para rolar (href="#x" criados nos scripts) */
  if (f !== "404.html") for (const alvo of ["catalogo", "agendar", "troca", "contato", "localizacao", "conteudo", "topo"])
    if (!ids.has(alvo)) erros.push(`${f}: a seção #${alvo}, usada pelos botões, não existe`);
}

// ---------- arquivos citados nos dados e nos scripts ----------
const d = lerDados();
const arquivosDados = [];
for (const p of d.CATALOGO || []){
  for (const f of p.imgs || []) arquivosDados.push([p.nome, f]);
  for (const f of ((p.oficial && p.oficial.fotos) || [])) arquivosDados.push([p.nome, typeof f === "string" ? f : f.src]);
  for (const f of p.giro360 || []) arquivosDados.push([p.nome, f]);
  for (const f of [p.modelo3d, p.unboxing3d].filter(Boolean)) arquivosDados.push([p.nome, f]);
  if (p.oficial && /^assets\//.test(p.oficial.video || "")) arquivosDados.push([p.nome, p.oficial.video]);
}
for (const e of d.EQUIPE || []) if (e.foto) arquivosDados.push(["Equipe " + e.nome, e.foto]);
const PG = (d.STORE_CONFIG && d.STORE_CONFIG.pagamento) || {};
if (PG.logoPix) arquivosDados.push(["Logo do Pix", PG.logoPix]);
for (const b of PG.bandeiras || []) if (b && b.img) arquivosDados.push(["Bandeira " + b.nome, b.img]);
for (const [dono, f] of arquivosDados){ checados++; if (!existe(path.join(RAIZ, f))) erros.push(`${dono}: arquivo não existe: ${f}`); }

const scripts = fs.readdirSync(path.join(RAIZ, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f);
for (const f of scripts){
  const t = ler(f);
  for (const m of t.matchAll(/["'](assets\/[^"'\s]+\.(?:jpe?g|png|webp|avif|svg|mp4|webm|glb|gltf))["']/g)){ checados++; if (!existe(path.join(RAIZ, m[1]))) erros.push(`${f}: arquivo não existe: ${m[1]}`); }
  for (const m of t.matchAll(/(?:\bimport\s*\(|\bfrom\s+)\s*["'](\.{1,2}\/[^"']+)["']/g)){ checados++; if (!existe(path.join(RAIZ, path.dirname(f), m[1]))) erros.push(`${f}: import de arquivo que não existe: ${m[1]}`); }
  for (const m of t.matchAll(/caminhoSite\(["']([^"']+)["']\)/g)){ checados++; if (!existe(path.join(RAIZ, m[1]))) erros.push(`${f}: arquivo não existe: ${m[1]}`); }
}
// ---------- CSS e manifest ----------
for (const m of ler("css/styles.css").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)){
  const v = m[1];
  if (externo(v) || v.startsWith("data:") || v.startsWith("#")) continue;
  checados++;
  if (!existe(path.join(RAIZ, "css", v))) erros.push(`css/styles.css: url(${v}) aponta para arquivo que não existe`);
}
const manifesto = JSON.parse(ler("manifest.webmanifest"));
for (const i of manifesto.icons || []){ checados++; if (!existe(path.join(RAIZ, i.src))) erros.push(`manifest.webmanifest: ícone não existe: ${i.src}`); }

// ---------- sitemap, robots e domínio central ----------
const url = String(d.SITE_CONFIG && d.SITE_CONFIG.url || "").replace(/\/+$/, "");
if (url){
  for (const m of ler("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)){
    const caminho = m[1].startsWith(url) ? m[1].slice(url.length) : null;
    if (caminho === null){ erros.push(`sitemap.xml: ${m[1]} não usa SITE_CONFIG.url (rode npm run build)`); continue; }
    const abs = path.join(RAIZ, caminho, caminho.endsWith("/") || !caminho ? "index.html" : "");
    checados++;
    if (!existe(abs)) erros.push(`sitemap.xml: ${m[1]} aponta para página que não existe`);
  }
  if (!ler("robots.txt").includes(`Sitemap: ${url}/sitemap.xml`)) erros.push("robots.txt: a linha Sitemap não usa SITE_CONFIG.url (rode npm run build)");
  if (!ler("index.html").includes(`<link rel="canonical" href="${url}/">`)) erros.push("index.html: canonical não usa SITE_CONFIG.url (rode npm run build)");
  /* o endereço do site só pode estar escrito na configuração e nos arquivos que o build gera */
  const host = url.replace(/^https?:\/\//, "");
  const livres = ["css/styles.css", "404.html", "manifest.webmanifest", ...scripts, "data/products.js"];
  for (const f of livres) if (ler(f).includes(host)) erros.push(`${f}: tem o endereço do site escrito à mão. Use SITE_CONFIG.url (data/config.js).`);
}

console.log(`\nSR Phone · links\n  páginas: ${paginas.length}   referências conferidas: ${checados}`);
if (erros.length){
  console.error("\nLINKS QUEBRADOS:\n  - " + erros.join("\n  - ") + "\n");
  process.exit(1);
}
console.log("\nNENHUM LINK, ÂNCORA, IMAGEM OU IMPORT QUEBRADO\n");
