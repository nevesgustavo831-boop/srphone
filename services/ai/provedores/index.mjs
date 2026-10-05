// SR Phone · lista de provedores de IA. Qual usar: variável de ambiente AI_PROVIDER (padrão: anthropic).
// Para trocar de provedor, crie services/ai/provedores/<nome>.mjs com a mesma função
// responder({ sistema, mensagens, cfg, sinal }) (veja anthropic.mjs) e registre aqui.
// O resto do assistente (regras, dados, guarda de preços, site) não muda.
const PROVEDORES = {
  anthropic: () => import("./anthropic.mjs"),
  /* só para testar no computador sem chave (resposta fixa, avisa que é demonstração) */
  demonstracao: () => import("./demonstracao.mjs")
};
export const SEM_CHAVE = new Set(["demonstracao"]);

export async function obterProvedor(nome){
  const carrega = PROVEDORES[String(nome || "anthropic").toLowerCase()];
  if (!carrega){ const e = new Error("provedor_desconhecido:" + nome); e.codigo = "pedido"; throw e; }
  return carrega();
}
