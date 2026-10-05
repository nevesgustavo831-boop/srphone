// Lê data/config.js, data/products.js e js/precos.js do jeito que o navegador lê
// (sem executar o resto do site). As regras de preço são as MESMAS do site.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

export const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export function lerDados(){
  const ctx = { console, Intl };
  vm.createContext(ctx);
  for (const f of ["data/config.js", "data/products.js", "js/precos.js"]){
    const codigo = fs.readFileSync(path.join(RAIZ, f), "utf8");
    vm.runInContext(codigo + "\n;globalThis.__ok = true;", ctx, { filename: f });
  }
  // var no topo do arquivo vira propriedade do contexto; as funções de js/precos.js também
  return Object.assign(ctx, {
    SITE_CONFIG: ctx.SITE_CONFIG, STORE_CONFIG: ctx.STORE_CONFIG, CATALOGO: ctx.CATALOGO, CATS: ctx.CATS,
    GA_MEASUREMENT_ID: ctx.GA_MEASUREMENT_ID, SUPABASE_URL: ctx.SUPABASE_URL, SUPABASE_ANON_KEY: ctx.SUPABASE_ANON_KEY, TURNSTILE_SITE_KEY: ctx.TURNSTILE_SITE_KEY,
    EQUIPE: ctx.EQUIPE, AVALIACOES_GOOGLE: ctx.AVALIACOES_GOOGLE, ASSISTENTE: ctx.ASSISTENTE, DELIVERY_CONFIG: ctx.DELIVERY_CONFIG
  });
}

export function apelido(nome){
  return String(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// .env (opcional) + variáveis do sistema. As do sistema valem mais.
export function lerEnv(){
  const env = {};
  const arq = path.join(RAIZ, ".env");
  if (fs.existsSync(arq)){
    for (const linha of fs.readFileSync(arq, "utf8").split(/\r?\n/)){
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !/^\s*#/.test(linha)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  for (const k of Object.keys(process.env))
    if (/^(SITE_URL|SUPABASE_URL|SUPABASE_ANON_KEY|GA_MEASUREMENT_ID|TURNSTILE_SITE_KEY|TURNSTILE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)$/.test(k)) env[k] = process.env[k];
  /* nomes que a integração do Supabase (Netlify/Vercel) cria sozinha: valem se os do site estiverem vazios.
     Só a chave PÚBLICA (publishable/anon). A secreta nunca é lida para o site. */
  if (!env.SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL) env.SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!env.SUPABASE_ANON_KEY && (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY))
    env.SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return env;
}
