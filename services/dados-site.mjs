// SR Phone · os dados oficiais do site, lidos pelas funções do servidor (assistente e entrega).
// data/config.js (loja, entrega), data/products.js (catálogo) e js/precos.js (regras de preço e de
// entrega) são executados aqui do mesmo jeito que o navegador executa. Assim o servidor e o site
// usam os MESMOS valores: mudou em data/config.js, mudou nos dois.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ARQUIVOS = ["data/config.js", "data/products.js", "js/precos.js"];
const VALIDADE_MS = 5 * 60 * 1000;

/* executa os três arquivos num contexto separado (sem rede, sem disco, sem process) */
export function avaliarDados(textos){
  const ctx = { console: { log(){}, warn(){}, error(){} }, Intl };
  vm.createContext(ctx);
  for (const f of ARQUIVOS) vm.runInContext(String(textos[f] || ""), ctx, { filename: f, timeout: 1000 });
  if (!Array.isArray(ctx.CATALOGO) || !ctx.STORE_CONFIG || typeof ctx.precoDe !== "function") throw new Error("dados_incompletos");
  return ctx;
}

/* No Netlify os arquivos vão junto com a função (netlify.toml > included_files). Se não estiverem
   no disco, a função lê do próprio site (são arquivos públicos). */
function lerDoDisco(){
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const raizes = [process.env.LAMBDA_TASK_ROOT, process.cwd(), path.resolve(aqui, ".."), path.resolve(aqui, "../..")].filter(Boolean);
  for (const r of raizes){
    if (!ARQUIVOS.every((f) => fs.existsSync(path.join(r, f)))) continue;
    const t = {};
    for (const f of ARQUIVOS) t[f] = fs.readFileSync(path.join(r, f), "utf8");
    return t;
  }
  return null;
}
async function lerDoSite(origem, buscar){
  const t = {};
  for (const f of ARQUIVOS){
    const r = await buscar(new URL("/" + f, origem), { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error("dados_http_" + r.status);
    t[f] = await r.text();
  }
  return t;
}

/* os dados (guardados por 5 minutos em cada cópia da função) */
let guardado = null;
export async function lerDadosDoSite({ origem, buscar = fetch, textos, agora = Date.now() } = {}){
  if (textos) return avaliarDados(textos);
  if (guardado && agora - guardado.quando < VALIDADE_MS) return guardado.dados;
  const dados = avaliarDados(lerDoDisco() || await lerDoSite(origem, buscar));
  guardado = { quando: agora, dados };
  return dados;
}
