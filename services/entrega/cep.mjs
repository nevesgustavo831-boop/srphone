// SR Phone · CEP → rua, bairro e cidade (ViaCEP, serviço público e gratuito, sem chave).
// Chamado só pelo servidor. Depois o endereço completo vai para o Google, que acha o ponto.
export async function buscaCep(cep, buscar = fetch){
  const c = String(cep || "").replace(/\D/g, "");
  if (c.length !== 8) return null;
  let r;
  try { r = await buscar("https://viacep.com.br/ws/" + c + "/json/", { signal: AbortSignal.timeout(6000) }); }
  catch { const e = new Error("cep_indisponivel"); e.codigo = "indisponivel"; throw e; }
  if (!r.ok){ const e = new Error("cep_http_" + r.status); e.codigo = r.status === 400 ? "nao_encontrado" : "indisponivel"; throw e; }
  const j = await r.json().catch(() => null);
  if (!j || j.erro) return null;
  return { rua: j.logradouro || "", bairro: j.bairro || "", cidade: j.localidade || "", uf: j.uf || "", cep: j.cep || c };
}
