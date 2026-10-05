// SR Phone · limite de perguntas por visitante (proteção contra abuso e conta alta).
// Guarda só um resumo (hash) do IP, nunca o IP, e só na memória da função: cada cópia da função
// no Netlify conta separado. Por isso a função também usa o limite do próprio Netlify
// (netlify/functions/assistente.mjs > config.rateLimit), que vale para todas as cópias.
import { createHash } from "node:crypto";

export function chaveDoVisitante(ip){
  return createHash("sha256").update("srphone:" + String(ip || "sem-ip")).digest("hex").slice(0, 16);
}

export function criarLimitador({ porMinuto = 8, porHora = 60 } = {}){
  const vistos = new Map();
  return {
    porMinuto, porHora,
    permite(chave, agora = Date.now()){
      const l = (vistos.get(chave) || []).filter((t) => agora - t < 3600e3);
      if (l.filter((t) => agora - t < 60e3).length >= porMinuto || l.length >= porHora){ vistos.set(chave, l); return false; }
      l.push(agora);
      vistos.set(chave, l);
      if (vistos.size > 5000) for (const [k, v] of vistos) if (!v.length || agora - v[v.length - 1] > 3600e3) vistos.delete(k);
      if (vistos.size > 20000) vistos.clear();              /* ataque com muitos IPs: a memória nunca cresce sem limite */
      return true;
    }
  };
}
