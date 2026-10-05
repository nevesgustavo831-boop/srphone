// SR Phone · provedor de DEMONSTRAÇÃO: não chama IA nenhuma e não precisa de chave.
// Serve para ver o chat funcionando por inteiro no computador (npm start) antes de ter a chave:
//   AI_PROVIDER=demonstracao npm start
// A resposta é sempre um texto fixo, que diz com todas as letras que é uma demonstração, e chega
// aos poucos, como a da IA. NUNCA deixe AI_PROVIDER=demonstracao no Netlify.
const espera = (ms, sinal) => new Promise((ok) => { const t = setTimeout(ok, ms); if (sinal) sinal.addEventListener("abort", () => { clearTimeout(t); ok(); }); });

export async function* responder({ mensagens, sinal }){
  const ultima = String((mensagens[mensagens.length - 1] || {}).content || "");
  const contexto = (ultima.match(/<contexto_da_pagina>([\s\S]*?)<\/contexto_da_pagina>/) || [])[1] || "";
  const produto = (contexto.match(/\[([a-z0-9-]+)\]/) || [])[1];
  const texto = "Esta é uma resposta de demonstração: a IA de verdade ainda não está ligada neste site. " +
    "A sua pergunta chegou ao servidor junto com os dados oficiais da loja. Com a chave da IA configurada no Netlify, quem responde aqui é a IA." +
    (produto ? " [[produto:" + produto + "]]" : "") + " [[acao:whatsapp]]";
  for (const pedaco of texto.match(/[\s\S]{1,14}/g)){
    if (sinal && sinal.aborted) return;
    await espera(35, sinal);
    yield { tipo: "texto", texto: pedaco };
  }
  yield { tipo: "fim", motivo: "end_turn", uso: null };
}
