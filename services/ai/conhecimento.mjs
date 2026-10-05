// SR Phone · o que a IA sabe: SÓ os dados oficiais do site.
// data/config.js (loja), data/products.js (catálogo) e js/precos.js (as regras de preço) são
// executados aqui do mesmo jeito que o navegador executa, e viram:
//   texto     → o resumo que a IA lê;
//   catalogo  → o preço de CADA produto + opção + cor (a guarda confere cada valor com o aparelho
//               citado, e o marcador [[preco:...]] vira o valor oficial daqui).
// Nada daqui vem do visitante.
import { lerDadosDoSite, avaliarDados, ARQUIVOS } from "../dados-site.mjs";
import { normaliza, padraoDeNome } from "./seguranca.mjs";
export { avaliarDados, ARQUIVOS };

/* Textos que também estão nas perguntas frequentes do site (js/site.js > PERGUNTAS).
   Mudou lá? Mude aqui. O "npm test" confere que os dois continuam iguais. */
export const FAQ = {
  troca: "Aceitamos somente iPhone como entrada, de qualquer geração. Você diz qual aparelho quer e qual iPhone vai entregar. A gente faz uma estimativa pelo WhatsApp e confirma o valor final quando vê o aparelho, checando estado, bateria e se o iCloud está liberado. O valor é abatido e você paga só a diferença. Android, iPad e Apple Watch não entram na troca.",
  encomenda: "A gente encomenda. Chame no WhatsApp com o modelo, a capacidade e a cor que você quer, que informamos o prazo e o valor."
};
export function faqEntrega(cidade){
  return "Os dois. Você pode retirar pessoalmente na loja" + (cidade ? " em " + cidade : "") + " ou combinar a entrega na cidade e região. O prazo a gente confirma no atendimento.";
}

/* o conhecimento é refeito junto com os dados (a cada 5 minutos) */
let guardado = null;
export async function carregarConhecimento({ origem, buscar = fetch, textos, agora = Date.now() } = {}){
  const dados = await lerDadosDoSite({ origem, buscar, textos, agora });
  if (!textos && guardado && guardado.dados === dados) return guardado.conhecimento;
  const conhecimento = montarConhecimento(dados);
  if (!textos) guardado = { dados, conhecimento };
  return conhecimento;
}

const limpa = (t) => String(t == null ? "" : t).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const frase = (t) => { t = limpa(t); return t && !/[.!?]$/.test(t) ? t + "." : t; };
const centavos = (v) => Math.round(Number(v) * 100);

function fatosDaLoja(d, temSeminovos){
  const S = d.STORE_CONFIG || {}, P = S.pagamento || {}, f = [];
  f.push(`Loja: ${S.nome}, loja de produtos Apple em ${S.cidade}/${S.estado}.`);
  const end = [S.endereco, S.bairro, S.cidade && S.estado ? `${S.cidade}/${S.estado}` : S.cidade, S.cep ? "CEP " + S.cep : ""].filter(Boolean).join(", ");
  if (end) f.push(`Endereço: ${end}.${S.referencia ? " " + frase(S.referencia) : ""}`);
  const horas = (S.horarioFuncionamento || []).map((h) => `${h[0]}: ${h[1]}`).join("; ");
  if (horas) f.push(`Horário de atendimento: ${horas}.`);
  if (S.whatsappVisivel) f.push(`WhatsApp da loja: ${S.whatsappVisivel}.`);
  if (S.telefone) f.push(`Telefone: ${S.telefone}.`);
  if (S.email) f.push(`E-mail: ${S.email}.`);
  if (S.instagram) f.push(`Instagram: @${S.instagram}.`);
  if (S.prazoResposta) f.push(`Resposta no WhatsApp: ${frase(S.prazoResposta)}`);

  const formas = [];
  if (P.aceitaPix) formas.push("Pix");
  if (P.aceitaCartao) formas.push("cartão de crédito" + (P.maxParcelas ? ` em até ${P.maxParcelas}x` : ""));
  if (formas.length) f.push(`Formas de pagamento: ${formas.join(" e ")}.`);
  f.push(P.maxParcelasSemJuros ? `Parcelas sem juros: até ${P.maxParcelasSemJuros}x.` : "Juros e parcelas sem juros: o site NÃO informa; as condições do cartão são combinadas no atendimento.");
  f.push(P.descontoPix ? `Desconto no Pix: ${P.descontoPix}% (já calculado no preço Pix de cada produto).` : "Desconto no Pix: o site NÃO tem desconto geral; só vale o preço Pix que aparece em algum produto.");
  if (P.observacao) f.push(`Sobre o pagamento: ${frase(P.observacao)}`);
  f.push("Promoções, cupons e descontos: não existem além do que aparece nos preços abaixo.");

  f.push(P.aceitaIphoneNaTroca !== false ? `Troca (iPhone usado como entrada, só na compra de iPhone): ${FAQ.troca}` : "Troca: a loja não está aceitando aparelho usado como entrada.");
  if (S.garantia) f.push(`Garantia dos aparelhos novos: ${frase(S.garantia)}`);
  if (temSeminovos) f.push(`Garantia dos seminovos (CPO): ${frase(String(S.garantiaSeminovos || "").trim() || d.TXT_GARANTIA_SEMINOVO)}`);
  f.push(S.notaFiscalNovos === true ? "Nota fiscal: a loja emite nota fiscal nos aparelhos novos." : "Nota fiscal: consulte as condições no atendimento.");
  if (temSeminovos && S.notaFiscalSeminovos !== true) f.push(`Nota fiscal dos seminovos: ${d.TXT_NF_CONSULTE}`);
  f.push("Originais: aparelhos Apple novos e lacrados" + (temSeminovos ? " e alguns seminovos selecionados (CPO), identificados no catálogo" : "") + ". Antes de fechar, a pessoa confere o aparelho, o IMEI e o número de série.");
  f.push(`Entrega ou retirada: ${faqEntrega(S.cidade)}`);
  if ((d.DELIVERY_CONFIG || {}).ligada !== false) f.push("Valor da entrega: o site calcula na calculadora de entrega, pela rota da loja até o endereço da pessoa (ação entrega). O assistente nunca informa, estima nem calcula valor, distância ou tempo de entrega.");
  f.push(`Modelo que não está no catálogo ou sem estoque: ${FAQ.encomenda}`);
  f.push(S.servicos && S.servicos.assistenciaTecnica ? "Assistência técnica: a loja oferece; o atendimento é pelo WhatsApp." : "Assistência técnica: o site não oferece. Não prometa conserto.");
  const ag = S.agenda || {};
  f.push("Agendamento: pelo próprio site, na seção \"Agendar atendimento\", escolhendo dia e horário" +
    (ag.horarios ? ` (segunda a sexta: ${ag.horarios.join(", ")}` + (ag.horariosSabado ? `; sábado: ${ag.horariosSabado.join(", ")}` : "") + "; domingo fechado)" : "") +
    ". A loja confirma pelo WhatsApp.");
  return f;
}

function linhaProduto(d, p){
  const BRL = (v) => d.BRL.format(v).replace(/\s/g, " ");
  const opcoes = p.opcoes.length ? p.opcoes : [""];
  const cores = d.temCoresDe(p) ? p.cores.map((c) => String(c[0])) : [];
  const iCores = cores.length ? cores.map((_, i) => i) : [0];
  const partes = [`- [${p.id}] ${p.nome} · ${NOME_CATEGORIA[p.cat] || p.cat} · ${p.cond || "condição informada no atendimento"}`];
  if (cores.length) partes.push(`Cores: ${cores.join(", ")}`);
  const status = new Set(), linhasPreco = [];
  opcoes.forEach((op, i) => {
    const porCor = iCores.map((c) => {
      const v = d.precoDe(p, i, c), px = d.precoPixDe(p, i, c), de = d.precoAntigo(p, i, c);
      status.add(d.statusDe(p, i, c).texto);
      const parc = d.parcelamentoDe(p, i, c);
      const sj = parc && /(\d+)x de/.exec(parc.texto);
      return v ? BRL(v) + (px ? ` (Pix ${BRL(px.valor)})` : "") + (de ? ` (antes ${BRL(de)})` : "") + (sj ? ` (${parc.texto})` : "") : "preço sob consulta";
    });
    const iguais = porCor.every((x) => x === porCor[0]);
    const valor = iguais ? porCor[0] : porCor.map((x, c) => `${cores[c]} ${x}`).join(", ");
    linhasPreco.push(op ? `${op}: ${valor}` : valor);
  });
  partes.push(p.opcoes.length ? `${d.rotuloOpcao(p)} e preços: ${linhasPreco.join("; ")}` : `Preço: ${linhasPreco[0]}`);
  if (p.obsPreco) partes.push(frase(p.obsPreco));
  partes.push(`Disponibilidade: ${[...status].join(" / ")}`);
  if (p.parcelas || p.parcelasSemJuros) partes.push(`Cartão neste produto: ${limpa((d.parcelamentoDe(p, 0, 0) || {}).texto)}`);
  if (p.txt) partes.push(`Resumo: ${limpa(p.txt)}`);
  const specs = (p.specs || []).map((s) => `${limpa(s[0])}: ${limpa(s[1])}`).join("; ");
  if (specs) partes.push(`Ficha: ${specs}`);
  /* a página do produto no site (a mesma que o build gera em produto/<id>/) */
  const base = String((d.SITE_CONFIG || {}).url || "").replace(/\/+$/, "");
  partes.push(`Página: ${base}/produto/${p.id}/`);
  return partes.join(" · ");
}
const NOME_CATEGORIA = { iphone: "iPhone", watch: "Apple Watch", ipad: "iPad", mac: "MacBook", airpods: "AirPods" };

/* ---------- o preço de cada produto + opção + cor, direto das regras do site (js/precos.js) ---------- */
function apelidos(p){
  const nomes = [p.nome, p.id];
  if (/^Apple /.test(p.nome)) nomes.push(p.nome.replace(/^Apple /, ""));
  if (/^Apple Watch (Ultra|Series) /.test(p.nome)) nomes.push(p.nome.replace(/^Apple Watch /, ""));
  /* "17 Pro Max", "16 Plus", "17e": o iPhone sem a palavra "iPhone" (número sozinho não: "15" é ambíguo) */
  const resto = p.cat === "iphone" ? p.nome.replace(/^iPhone\s+/i, "") : "";
  if (resto && /\d/.test(resto) && /[a-z]/i.test(resto)) nomes.push(resto);
  return nomes;
}
function itemDoCatalogo(d, p){
  const cores = d.temCoresDe(p) ? p.cores.map((c) => String(c[0])) : [];
  const nOp = Math.max(1, p.opcoes.length), nCor = Math.max(1, cores.length);
  const celulas = [];
  for (let o = 0; o < nOp; o++) for (let c = 0; c < nCor; c++){
    const v = d.precoDe(p, o, c), px = d.precoPixDe(p, o, c), de = d.precoAntigo(p, o, c);
    const parc = v && d.parcelamentoDe(p, o, c), sj = parc && /(\d+)x de/.exec(parc.texto);
    celulas.push({ preco: v ? centavos(v) : null, pix: px ? centavos(px.valor) : null, de: de ? centavos(de) : null, parcela: sj ? centavos(v / Number(sj[1])) : null });
  }
  const padroes = (lista) => lista.map(padraoDeNome).filter(Boolean);
  return {
    id: p.id, nome: p.nome, opcoes: p.opcoes.slice(), cores,
    padroes: padroes(apelidos(p)),
    /* "49 mm, GPS + Cellular" também vale escrito só "49 mm"; "Estelar (branco)" também vale "Estelar" */
    padroesOpcao: p.opcoes.map((o) => padroes([o, String(o).split(",")[0]])),
    padroesCor: cores.map((c) => padroes([c, c.replace(/\s*\(.*\)\s*/, "")])),
    celula: (o, c) => celulas[Math.max(0, o) * nCor + Math.max(0, c)]
  };
}
const igual = (a, b) => normaliza(a).s.replace(/[^a-z0-9]+/g, "") === normaliza(b).s.replace(/[^a-z0-9]+/g, "");
/* o texto do marcador [[preco:ID|opção|cor]]: SEMPRE do catálogo. null = marcador com produto,
   opção ou cor que não existe (a resposta é barrada). */
export function textoDoPreco(conhecimento, id, opcao, cor){
  const item = conhecimento.catalogo.get(String(id || "").trim().toLowerCase());
  if (!item) return null;
  const d = conhecimento.dados;
  const BRL = (c) => d.BRL.format(c / 100).replace(/\s/g, " ");
  let iOp = -1, iCor = -1;
  if (opcao){ iOp = item.opcoes.findIndex((o) => igual(o, opcao) || igual(String(o).split(",")[0], opcao)); if (iOp < 0 && item.opcoes.length) return null; }
  if (cor){ iCor = item.cores.findIndex((c) => igual(c, cor) || igual(c.replace(/\s*\(.*\)\s*/, ""), cor)); if (iCor < 0 && item.cores.length) return null; }
  if (item.opcoes.length <= 1) iOp = 0;
  if (item.cores.length <= 1) iCor = 0;
  const ops = iOp >= 0 ? [iOp] : item.opcoes.map((_, i) => i);
  const cores = iCor >= 0 ? [iCor] : item.cores.map((_, i) => i);
  const cel = [];
  ops.forEach((o) => cores.forEach((c) => cel.push({ o, c, x: item.celula(o, c) })));
  const com = cel.filter((k) => k.x.preco);
  if (!com.length) return "preço sob consulta";
  const um = (x) => BRL(x.preco) + (x.pix ? ` (${BRL(x.pix)} no Pix)` : "");
  if (com.length === cel.length && com.every((k) => k.x.preco === com[0].x.preco && k.x.pix === com[0].x.pix)) return um(com[0].x);
  /* sem a opção e com preços diferentes entre as opções: o menor, "a partir de" (como no card) */
  if (iOp < 0 && item.opcoes.length > 1) return "a partir de " + BRL(Math.min(...com.map((k) => k.x.preco)));
  /* a opção tem preço diferente por cor: cada valor com a cor dele */
  const grupos = new Map();
  com.forEach((k) => { const g = um(k.x); grupos.set(g, (grupos.get(g) || []).concat(item.cores[k.c])); });
  const lista = [...grupos].map(([v, cs]) => `${v} na cor ${cs.join(" ou ")}`).join("; ");
  return lista + (com.length < cel.length ? "; nas outras cores, preço sob consulta" : "");
}

export function montarConhecimento(d){
  const produtos = (d.CATALOGO || []).filter((p) => p && p.nome).map((p) => d.normalizaProduto(p));
  const temSeminovos = produtos.some((p) => d.eSeminovo(p));
  const linhas = produtos.map((p) => linhaProduto(d, p));
  const mapa = new Map(produtos.map((p) => [p.id, p]));
  const S = d.STORE_CONFIG || {};
  const texto =
    "LOJA\n" + fatosDaLoja(d, temSeminovos).map((l) => "- " + l).join("\n") +
    "\n\nCATÁLOGO (preços em reais, como aparecem no site. \"Preço sob consulta\" = o site não tem o preço: não diga valor. " +
    "\"Consulte disponibilidade\" = o site não sabe se tem na loja: não prometa estoque)\n" + linhas.join("\n");
  return {
    texto, produtos: mapa,
    catalogo: new Map(produtos.map((p) => [p.id, itemDoCatalogo(d, p)])),
    descontoPix: (S.pagamento && Number(S.pagamento.descontoPix)) || null,
    dados: d
  };
}

/* o produto aberto na página (ou em foco na conversa), com a escolha de opção e cor, SÓ se existir no catálogo */
export function descreverContexto(conhecimento, contexto, foco){
  const d = conhecimento.dados, linhas = [];
  const BRL = (v) => d.BRL.format(v).replace(/\s/g, " ");
  const p = contexto.productId && conhecimento.produtos.get(contexto.productId);
  if (p){
    const iOp = Math.max(0, p.opcoes.indexOf(contexto.storage));
    const iCor = d.temCoresDe(p) ? Math.max(0, p.cores.findIndex((c) => String(c[0]) === contexto.selectedColor)) : 0;
    const opcao = p.opcoes[iOp] || "", cor = d.temCoresDe(p) ? String(p.cores[iCor][0]) : "";
    const v = d.precoDe(p, iOp, iCor), px = d.precoPixDe(p, iOp, iCor);
    linhas.push(`Produto aberto na página: ${p.nome} [${p.id}]` + (opcao ? `, opção marcada: ${opcao}` : "") + (cor ? `, cor marcada: ${cor}` : "") +
      `. Preço dessa escolha no site: ${v ? BRL(v) + (px ? ` (Pix ${BRL(px.valor)})` : "") : "preço sob consulta"}. Disponibilidade: ${d.statusDe(p, iOp, iCor).texto}.`);
  } else linhas.push("Nenhum produto aberto na página.");
  const f = foco && foco !== (p && p.id) && conhecimento.produtos.get(foco);
  if (f) linhas.push(`Produto em foco na conversa (citado depois do produto da página, vale mais que ele): ${f.nome} [${f.id}].`);
  if (contexto.currentUrl) linhas.push(`Página: ${contexto.currentUrl}`);
  return linhas.join("\n");
}
