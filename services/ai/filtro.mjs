// SR Phone · filtro da resposta da IA, pedaço por pedaço, enquanto ela chega.
// 1. Tira os marcadores de ação ([[acao:whatsapp]], [[produto:iphone-17]]) e devolve a lista
//    (só ações conhecidas e produtos que existem no catálogo; os botões quem monta é o site).
// 2. Troca o marcador de preço [[preco:iphone-15|128 GB]] pelo valor OFICIAL do catálogo
//    ("R$ 3.900,00" ou "preço sob consulta"): o valor que a pessoa vê vem do catálogo, não da IA.
// 3. Segura o fim de cada pedaço até a palavra terminar: um preço ("R$ 13.000,00") nunca sai
//    pela metade, e cada valor escrito pela própria IA é conferido com o aparelho, o armazenamento
//    e a cor de que a frase fala (seguranca.mjs) antes de ir para a tela.
// 4. Se aparecer preço que não bate (ou algo com cara de chave), para tudo: o site troca o
//    texto pela frase "Não consigo confirmar essa informação por aqui..." e oferece o WhatsApp.
import { ACOES } from "./prompt.mjs";
import { textoDoPreco } from "./conhecimento.mjs";
import { precosInventados, vazaSegredo } from "./seguranca.mjs";

const RE_MARCADOR = /\[\[\s*(acao|ação|produto)\s*:\s*([a-z0-9-]{1,60})\s*\]\]/gi;
const RE_PRECO = /(?:R\$\s*)?\[\[\s*pre[cç]o\s*:\s*([^\]\[|]{1,60})(?:\|([^\]\[|]{0,60}))?(?:\|([^\]\[|]{0,60}))?\s*\]\]/gi;
/* o valor oficial fica guardado fora do texto: \u0001n\u0002 marca o lugar dele */
const RE_LUGAR = /\u0001(\d+)\u0002/g;

/* conhecimento: o de conhecimento.mjs; contexto: a página aberta (productId, storage, selectedColor);
   orcamentos: valores que o próprio visitante escreveu (Set de centavos) */
export function criarFiltro({ conhecimento, contexto = {}, orcamentos = new Set(), chave }){
  const produtos = conhecimento.produtos;
  let enviado = "", pendente = "", bloqueado = null;
  const acoes = [], oficiais = [];
  function registra(tipo, id){
    id = id.toLowerCase();
    if (tipo === "produto"){
      if (produtos.has(id) && !acoes.some((a) => a.tipo === "produto" && a.id === id) && acoes.filter((a) => a.tipo === "produto").length < 3)
        acoes.push({ tipo: "produto", id });
    } else if (ACOES.includes(id) && !acoes.some((a) => a.tipo === "acao" && a.id === id)) acoes.push({ tipo: "acao", id });
  }
  const tiraMarcadores = (t) => t
    .replace(RE_MARCADOR, (_, tipo, id) => { registra(tipo.startsWith("p") ? "produto" : "acao", id); return ""; })
    .replace(RE_PRECO, (_, id, opcao, cor) => {
      const v = textoDoPreco(conhecimento, id, (opcao || "").trim(), (cor || "").trim());
      if (v === null){ bloqueado = bloqueado || "preco"; return ""; }
      oficiais.push(v);
      return "\u0001" + (oficiais.length - 1) + "\u0002";
    });
  const paraTela = (t) => t.replace(RE_LUGAR, (_, n) => oficiais[Number(n)]);
  /* na conferência, o valor oficial não é conferido de novo (ele é do catálogo) */
  const paraConferir = (t) => t.replace(RE_LUGAR, " preco-oficial ");
  /* até onde dá para mandar: nunca no meio de um marcador aberto, de uma palavra ou de um valor */
  function corte(t){
    const ab = t.lastIndexOf("[[");
    if (ab > -1 && t.indexOf("]]", ab) < 0 && t.length - ab < 200) return ab;
    let i = Math.max(t.lastIndexOf(" "), t.lastIndexOf("\n"));
    if (i <= 0) return 0;
    const m = /(R\$\s*[\d.,]*|\d[\d.,]*(\s*mil)?)\s*$/i.exec(t.slice(0, i));
    if (m) i = m.index;
    return i;
  }
  function confere(t){
    if (vazaSegredo(paraTela(t), chave)) return "segredo";
    if (precosInventados(paraConferir(t), { catalogo: conhecimento.catalogo, contexto, orcamentos, descontoPix: conhecimento.descontoPix }).length) return "preco";
    return null;
  }
  return {
    get bloqueado(){ return bloqueado; },
    /* recebe um pedaço da IA e devolve o que já pode ir para a tela ("" = ainda segurando) */
    empurra(pedaco){
      if (bloqueado) return "";
      pendente = tiraMarcadores(pendente + String(pedaco).replace(/[\u0001\u0002]/g, ""));
      if (bloqueado) return "";
      const i = corte(pendente);
      if (i <= 0) return "";
      const sai = pendente.slice(0, i);
      const motivo = confere(enviado + sai);
      if (motivo){ bloqueado = motivo; return ""; }
      enviado += sai; pendente = pendente.slice(i);
      return paraTela(sai);
    },
    /* fim da resposta: o resto que estava seguro (conferido) e as ações */
    termina(){
      let resto = "";
      if (!bloqueado){
        const fim = tiraMarcadores(pendente).replace(/\[\[[^\]]*$/, "").replace(/\s+$/, "");
        const motivo = bloqueado || confere(enviado + fim);
        if (motivo) bloqueado = motivo;
        else { resto = paraTela(fim); enviado += fim; }
      }
      pendente = "";
      return { texto: resto, acoes, bloqueado, completo: paraTela(enviado) };
    }
  };
}
