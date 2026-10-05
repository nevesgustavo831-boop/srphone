/* SR Phone · regras do catálogo, sem tela: preço, disponibilidade, condição, imagens e
   dados para o Google. O site (js/catalog.js) e o "npm run build" (páginas de produto)
   usam este mesmo arquivo, então o que aparece na tela e o que vai para o Google nunca divergem.
   Nada aqui mexe na página. */

var BRL = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
var NOME_CAT = { iphone:"iPhones", watch:"Apple Watch", ipad:"iPads", mac:"MacBook", airpods:"AirPods" };

/* pagamento: a única fonte é STORE_CONFIG.pagamento (data/config.js) */
function cfgPagamento(){ return (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG && STORE_CONFIG.pagamento) || {}; }

/* ---------- produto ---------- */
function apelido(nome){
  return String(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function semValor(v){ return v === undefined || v === null || v === ""; }
/* número de preço: aceita 4999, 4999.9, "4999" e "4.999,90". Vazio ou zero = sem preço */
function numero(v){
  if (semValor(v)) return null;
  var n = typeof v === "number" ? v
        : /,/.test(String(v)) ? parseFloat(String(v).replace(/\./g, "").replace(",", "."))
        : parseFloat(v);
  return isFinite(n) && n > 0 ? n : null;
}
/* aceita os campos novos e os antigos (disp, imagens, tag...) */
function normalizaProduto(p){
  if (!p.cat && p.categoria) p.cat = p.categoria;
  if (!p.imgs && p.imagens) p.imgs = p.imagens;
  p.imgs = (p.imgs || []).filter(Boolean);
  p.opcoes = (p.opcoes || []).filter(Boolean);
  p.cores = p.cores || [];
  if (p.status === undefined && p.disp !== undefined) p.status = p.disp;
  if (!p.id) p.id = apelido(p.nome);
  p.txt = p.txt || "";
  p.cond = p.cond || "";
  p.obsPreco = String(p.obsPreco || "").trim();
  p.badge = String(p.badge || p.tag || "").trim();          /* "tag" é o nome antigo do selo */
  p.variantes = Array.isArray(p.variantes) ? p.variantes.filter(Boolean) : [];
  return p;
}
function temCoresDe(p){ return !!(p.cores && p.cores.length); }
function nomeCorDe(p, iCor){ return temCoresDe(p) && p.cores[iCor] ? String(p.cores[iCor][0]) : ""; }
function rotuloOpcao(p){ return p.rotulo || (p.cat === "watch" ? "Tamanho da caixa" : "Armazenamento"); }
/* novo e lacrado de verdade; seminovo, CPO, usado ou recondicionado não conta */
var RE_SEMINOVO = /seminovo|cpo|usad|recondicionad/i;
function eSeminovo(p){ return !!p && RE_SEMINOVO.test(p.cond); }
function eNovo(p){ return !!p && /lacrad/i.test(p.cond) && !eSeminovo(p); }
/* ---------- nota fiscal e garantia: novos e seminovos têm regras separadas ----------
   Seminovo (CPO) nunca herda a garantia nem a nota fiscal dos novos: só o que estiver
   confirmado em STORE_CONFIG.garantiaSeminovos e STORE_CONFIG.notaFiscalSeminovos. */
function cfgLoja(){ return (typeof STORE_CONFIG !== "undefined" && STORE_CONFIG) || {}; }
var TXT_NF_CONSULTE = "Consulte as condições de nota fiscal no atendimento.";
var TXT_GARANTIA_SEMINOVO = "As condições de garantia são informadas antes da compra.";
var TXT_CONFERE_SEMINOVO = "Você confere o aparelho, o IMEI, o número de série e o estado antes da compra.";
function temNotaFiscal(p){ var c = cfgLoja(); return eSeminovo(p) ? c.notaFiscalSeminovos === true : c.notaFiscalNovos === true; }
/* "Nota fiscal em todas as vendas" só quando novos E seminovos estão confirmados */
function notaFiscalEmTodas(){ var c = cfgLoja(); return c.notaFiscalNovos === true && c.notaFiscalSeminovos === true; }
function garantiaDe(p){
  var c = cfgLoja();
  if (eSeminovo(p)) return String(c.garantiaSeminovos || "").trim() || TXT_GARANTIA_SEMINOVO;
  return String(c.garantia || "").trim();
}
function frase(t){ t = String(t || "").trim(); return t && !/[.!?]$/.test(t) ? t + "." : t; }
function textoNotaFiscal(p){ return temNotaFiscal(p) ? "A venda sai com nota fiscal em seu nome." : TXT_NF_CONSULTE; }

/* a troca por iPhone usado vale na compra de iPhone (e só se a loja aceitar) */
function aceitaTroca(p){ return !!p && p.cat === "iphone" && cfgPagamento().aceitaIphoneNaTroca !== false; }

/* ---------- preço por opção e por cor ----------
   variantes:[{ opcao:"256 GB", preco:7250 },                    <- todas as cores do 256 GB
              { opcao:"512 GB", cor:"Prateado", preco:9500 }]    <- SÓ o 512 GB Prateado
   A combinação mais específica vence: opção + cor > opção > cor > produto.
   O preço do produto (fora das variantes) só vale quando o produto tem UMA opção (ou nenhuma):
   com duas ou mais opções, cada uma precisa do próprio preço. Assim o preço de uma opção
   ou de uma cor nunca "vaza" para as outras. */
function textoDe(v){ return String(semValor(v) ? "" : v).trim(); }
function varianteDe(p, iOpcao, iCor){
  if (!p.variantes.length) return null;
  var op = p.opcoes[iOpcao || 0] || "", cor = nomeCorDe(p, iCor), melhor = null, peso = -1;
  p.variantes.forEach(function(v){
    var vo = textoDe(v.opcao || v.armazenamento), vc = textoDe(v.cor);
    if ((vo && vo !== op) || (vc && vc !== cor)) return;
    var n = (vo ? 2 : 0) + (vc ? 1 : 0);
    if (n > peso){ melhor = v; peso = n; }
  });
  return melhor;
}
var CAMPOS_PRECO = ["preco", "precoPix", "precoDe"];
function ofertaDe(p, iOpcao, iCor){
  var v = varianteDe(p, iOpcao, iCor) || {}, o = {};
  var precoDoProdutoVale = p.opcoes.length <= 1;
  ["preco", "precoPix", "precoDe", "parcelas", "parcelasSemJuros", "status", "estoque"].forEach(function(k){
    var doProduto = (CAMPOS_PRECO.indexOf(k) > -1 && !precoDoProdutoVale) ? null : p[k];
    o[k] = semValor(v[k]) ? doProduto : v[k];
  });
  return o;
}
function indicesOpcoes(p){ return p.opcoes.length ? p.opcoes.map(function(_, i){ return i; }) : [0]; }
function indicesCores(p){ return temCoresDe(p) ? p.cores.map(function(_, i){ return i; }) : [0]; }

/* ---------- disponibilidade: nunca vazia, nunca inventada ----------
   status: disponivel, ultimas-unidades, sob-encomenda, indisponivel, consultar.
   Status escrito pela loja vale sempre. Vazio ou "consultar": usa o estoque, se houver número;
   senão "Consulte disponibilidade". */
var DISPONIBILIDADE = {
  "disponivel":       { chave:"disponivel",       texto:"Disponível",               classe:"disp-ok",     aviso:"Pronto para retirar na loja",                            schema:"InStock" },
  "ultimas-unidades": { chave:"ultimas-unidades", texto:"Últimas unidades",         classe:"disp-ult",    aviso:"Poucas unidades na loja",                                schema:"LimitedAvailability" },
  "sob-encomenda":    { chave:"sob-encomenda",    texto:"Sob encomenda",            classe:"disp-enc",    aviso:"A loja encomenda e confirma o prazo no atendimento",    schema:"BackOrder" },
  "indisponivel":     { chave:"indisponivel",     texto:"Indisponível",             classe:"disp-nao",    aviso:"Sem previsão no momento",                                schema:"OutOfStock" },
  "consultar":        { chave:"consultar",        texto:"Consulte disponibilidade", classe:"disp-neutro", aviso:"Cor, capacidade e prazo a loja confirma no atendimento", schema:"" }
};
/* nomes antigos e escritos à mão continuam valendo */
var APELIDOS_STATUS = {
  "ultimas":"ultimas-unidades", "ultimas unidades":"ultimas-unidades", "últimas unidades":"ultimas-unidades", "últimas":"ultimas-unidades",
  "encomenda":"sob-encomenda", "sob encomenda":"sob-encomenda",
  "estoque":"disponivel", "em estoque":"disponivel", "disponível":"disponivel",
  "indisponível":"indisponivel", "consulte":"consultar", "consulte disponibilidade":"consultar"
};
function chaveStatus(v){ var k = textoDe(v).toLowerCase(); return APELIDOS_STATUS[k] || k; }
function quantidadeEstoque(v){
  if (semValor(v)) return null;
  var q = Number(v);
  return isFinite(q) ? Math.floor(q) : null;
}
function statusDe(p, iOpcao, iCor){
  var o = ofertaDe(p, iOpcao, iCor);
  var k = chaveStatus(o.status);
  /* "Disponível" (ou "Últimas unidades") escrito no PRODUTO vale para as opções e cores com preço.
     Opção ou cor sem preço, num produto que tem preço em outra, fica "Consulte disponibilidade":
     a loja confirmou o que ela precificou (ex.: iPhone 15 de 128 GB), não o resto. Status ou estoque
     escrito na própria variante vale sempre. */
  var va = varianteDe(p, iOpcao, iCor);
  var daVariante = !!va && (!semValor(va.status) || !semValor(va.estoque));
  var positivoSemPreco = function(chave){
    return !daVariante && (chave === "disponivel" || chave === "ultimas-unidades") && !precoDe(p, iOpcao, iCor) && !!menorPreco(p);
  };
  /* "consultar" é a falta de informação: se houver quantidade em estoque, ela vale */
  if (DISPONIBILIDADE[k] && k !== "consultar") return positivoSemPreco(k) ? DISPONIBILIDADE.consultar : DISPONIBILIDADE[k];
  var q = quantidadeEstoque(o.estoque);
  if (q !== null){
    var st = q <= 0 ? DISPONIBILIDADE.indisponivel : q <= 5 ? DISPONIBILIDADE["ultimas-unidades"] : DISPONIBILIDADE.disponivel;
    return positivoSemPreco(st.chave) ? DISPONIBILIDADE.consultar : st;
  }
  return DISPONIBILIDADE.consultar;
}

/* ---------- preços: só número real, nunca R$ 0,00 ---------- */
function precoDe(p, iOpcao, iCor){ return numero(ofertaDe(p, iOpcao, iCor).preco); }
/* menor preço real entre todas as opções e cores (ordenação e textos "a partir de") */
function menorPreco(p){
  var m = null;
  indicesOpcoes(p).forEach(function(i){
    indicesCores(p).forEach(function(c){ var v = precoDe(p, i, c); if (v && (m === null || v < m)) m = v; });
  });
  return m;
}
/* cores em que a opção tem preço informado (para explicar quando a cor escolhida não tem) */
function coresComPreco(p, iOpcao){
  if (!temCoresDe(p)) return [];
  return indicesCores(p).filter(function(c){ return !!precoDe(p, iOpcao, c); }).map(function(c){ return nomeCorDe(p, c); });
}
/* preço anterior só se for maior que o atual: nunca promoção artificial */
function precoAntigo(p, iOpcao, iCor){
  var o = ofertaDe(p, iOpcao, iCor), d = numero(o.precoDe), v = numero(o.preco);
  return d && v && d > v ? d : null;
}
function precoPixDe(p, iOpcao, iCor){
  var c = cfgPagamento();
  if (c.aceitaPix === false) return null;
  var o = ofertaDe(p, iOpcao, iCor), v = numero(o.preco);
  if (!v) return null;
  var px = numero(o.precoPix);
  if (px) return px <= v ? { valor: px, desconto: 0 } : null;      /* Pix maior que o preço: ignorado */
  var d = Number(c.descontoPix) || 0;
  return d > 0 && d < 100 ? { valor: v * (1 - d / 100), desconto: d } : null;
}
/* parcelamento: a ÚNICA função que monta a frase.
   Valor da parcela só aparece com parcelas SEM JUROS confirmadas (dividir com juros daria um valor que não existe). */
function parcelamentoDe(p, iOpcao, iCor){
  var c = cfgPagamento(), o = ofertaDe(p, iOpcao, iCor), v = numero(o.preco);
  if (!v || c.aceitaCartao === false) return null;
  var max = parseInt(semValor(o.parcelas) ? c.maxParcelas : o.parcelas, 10) || 0;
  var sj = parseInt(semValor(o.parcelasSemJuros) ? c.maxParcelasSemJuros : o.parcelasSemJuros, 10) || 0;
  if (max > 0 && sj > max) sj = max;
  if (sj > 0) return { texto: sj + "x de " + BRL.format(v / sj) + " sem juros",
                       detalhe: max > sj ? "ou em até " + max + "x no cartão (consulte as condições)" : "" };
  if (max > 0) return { texto: "Em até " + max + "x no cartão", detalhe: "Consulte as condições de parcelamento" };
  return { texto: "Consulte as condições de parcelamento", detalhe: "" };
}
/* opção que abre marcada: a primeira com preço na cor escolhida (ou a primeira) */
function opcaoInicial(p, iCor){
  var ids = indicesOpcoes(p);
  for (var i = 0; i < ids.length; i++) if (precoDe(p, ids[i], iCor)) return ids[i];
  return 0;
}

/* ---------- imagens: foto da loja, divulgação, vídeo, giro 360 e 3D ---------- */
function fotosApple(p){
  if (!p || !p.oficial || !p.oficial.fotos) return [];
  var corGeral = (p.oficial.cor === undefined) ? null : p.oficial.cor;
  return p.oficial.fotos.filter(Boolean).map(function(f){
    return typeof f === "string" ? { src: f, cor: corGeral }
                                 : { src: f.src, cor: (f.cor === undefined ? null : f.cor), claro: f.claro };
  });
}
function videoInfo(p){
  var v = String((p.oficial && p.oficial.video) || "").trim();
  var m = v.match(/^youtube:([A-Za-z0-9_-]{6,20})$/);
  if (m) return { tipo: "youtube", id: m[1] };
  if (/^assets\/[^"'<>\s]+\.(mp4|webm)$/i.test(v)) return { tipo: "arquivo", src: v };
  return null;
}
function tem360(p){ return !!(p.giro360 && p.giro360.length >= 8); }
function temModelo(p){ return !!(p && p.modelo3d && /\.(glb|gltf)$/i.test(p.modelo3d)); }
function temUnboxing(p){ return !!(p && p.unboxing3d && /\.(glb|gltf)$/i.test(p.unboxing3d)); }
function galeria(p){
  var g = [], cores = temCoresDe(p);
  p.imgs.forEach(function(src){ g.push({ tipo:"loja", src:src, cor: cores ? (p.fotoCor || 0) : null, claro: !!p.fundoClaro }); });
  fotosApple(p).forEach(function(f){
    /* claro: fundo branco; vale o da foto (claro:true) ou, sem ele, o do produto (oficial.fundoClaro) */
    g.push({ tipo:"divulgacao", src:f.src, cor:f.cor, claro: f.claro !== undefined ? !!f.claro : !!(p.oficial && p.oficial.fundoClaro) });
  });
  if (videoInfo(p)) g.push({ tipo:"video" });
  if (tem360(p)) g.push({ tipo:"giro" });
  if (temModelo(p)) g.push({ tipo:"3d" });
  return g;
}
function eImagem(m){ return !!m && (m.tipo === "loja" || m.tipo === "divulgacao"); }
function corInicial(p){
  var g = galeria(p).filter(eImagem);
  var c = g.length ? g[0].cor : null;
  return (typeof c === "number" && p.cores[c]) ? c : 0;
}

/* ---------- textos e dados para o Google ---------- */
function urlProduto(base, p){ return String(base || "").replace(/\/+$/, "") + "/produto/" + p.id + "/"; }
function tiraHtml(t){ return String(t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
/* descrição curta e específica (meta description): nunca inventa preço nem disponibilidade */
function descricaoCurta(p, cidade){
  var loja = " na SR Phone" + (cidade ? ", loja física em " + cidade : "") + ". ";
  var t = eSeminovo(p)
    ? p.nome + " (" + p.cond + ")" + loja + "Condição conferida no atendimento. " + (p.txt ? p.txt.replace(/\.?$/, ". ") : "") +
      "Veja cores, opções e valor, e fale com a loja pelo WhatsApp."
    : p.nome + (eNovo(p) ? " novo e lacrado" : "") + loja + (p.txt ? p.txt.replace(/\.?$/, ". ") : "") +
      "Veja cores, opções e valor, e fale com a loja pelo WhatsApp.";
  return t.length > 200 ? t.slice(0, 197).replace(/\s+\S*$/, "") + "…" : t;
}
/* Product + Offer (schema.org). Só com preço real: produto "sob consulta" não gera Product,
   para não publicar um preço que não existe. Uma Offer por opção/cor com preço próprio. */
function produtoSchema(p, base, nomeLoja){
  if (!menorPreco(p)) return null;
  base = String(base || "").replace(/\/+$/, "");
  var url = base ? urlProduto(base, p) : "";
  var ofertas = [], vistos = {};
  indicesOpcoes(p).forEach(function(i){
    indicesCores(p).forEach(function(c){
      var v = precoDe(p, i, c);
      if (!v) return;
      var va = varianteDe(p, i, c), porCor = !!(va && textoDe(va.cor));
      var chave = i + "|" + (porCor ? c : "*");
      if (vistos[chave]) return;
      vistos[chave] = true;
      var st = statusDe(p, i, c);
      var nome = [p.nome, p.opcoes.length > 1 ? p.opcoes[i] : "", porCor ? nomeCorDe(p, c) : ""].filter(Boolean).join(" ");
      var o = { "@type": "Offer", price: v.toFixed(2), priceCurrency: "BRL" };
      if (url) o.url = url;
      if (nome !== p.nome) o.name = nome;
      if (eNovo(p)) o.itemCondition = "https://schema.org/NewCondition";
      else if (eSeminovo(p)) o.itemCondition = "https://schema.org/UsedCondition";
      if (st.schema) o.availability = "https://schema.org/" + st.schema;
      if (nomeLoja) o.seller = { "@type": "Organization", name: nomeLoja };
      ofertas.push(o);
    });
  });
  if (!ofertas.length) return null;
  var item = { "@context": "https://schema.org", "@type": "Product", name: p.nome, sku: p.id,
               brand: { "@type": "Brand", name: "Apple" }, category: NOME_CAT[p.cat] || "",
               offers: ofertas.length === 1 ? ofertas[0] : ofertas };
  var imgs = galeria(p).filter(eImagem).map(function(m){ return base ? base + "/" + m.src : m.src; });
  if (imgs.length) item.image = imgs.slice(0, 6);
  var desc = p.txt || tiraHtml(p.descricao);
  if (desc) item.description = desc;
  if (url) item.url = url;
  return item;
}

/* ---------- entrega: o valor sai da distância da ROTA (nunca em linha reta) ----------
   Usado pela função do servidor (netlify/functions/entrega.mjs) e pelos testes: o navegador nunca
   calcula o frete, só mostra o que o servidor devolveu.
   Os números ficam em data/config.js > DELIVERY_CONFIG. */
function cfgEntrega(){ return (typeof DELIVERY_CONFIG !== "undefined" && DELIVERY_CONFIG) || {}; }
/* distância com uma casa decimal: a mesma da tela e do cálculo (6,43 km → 6,4 km) */
function kmEntrega(metros){ var m = Number(metros); return isFinite(m) && m >= 0 ? Math.round(m / 100) / 10 : null; }
/* regras de arredondamento do valor (DELIVERY_CONFIG.roundingMode), em centavos */
var ARREDONDA_ENTREGA = {
  "centavos":                 function(c){ return c; },                                  /* 16,63 → 16,63 */
  "dez-centavos":             function(c){ return Math.round(c / 10) * 10; },            /* 16,63 → 16,60 */
  "dez-centavos-acima":       function(c){ return Math.ceil(c / 10) * 10; },             /* 16,63 → 16,70 */
  "cinquenta-centavos-acima": function(c){ return Math.ceil(c / 50) * 50; },             /* 16,63 → 17,00 */
  "final-90":                 function(c){ var v = Math.floor(c / 100) * 100 + 90; return v < c ? v + 100 : v; }  /* 16,63 → 16,90 */
};
/* A ÚNICA conta do frete. { km, valor, foraDaArea }:
     valor = baseFee + km × pricePerKm → arredondamento (roundingMode) → nunca menos que minimumFee.
   Acima de maximumDistanceKm: valor null e foraDaArea true (sem preço automático). */
function calcularEntrega(distanciaKm){
  var c = cfgEntrega(), km = Math.round(Number(distanciaKm) * 10) / 10;
  if (distanciaKm === null || distanciaKm === "" || !isFinite(km) || km < 0) return null;
  var max = Number(c.maximumDistanceKm);
  if (max > 0 && km > max) return { km: km, valor: null, foraDaArea: true };
  var centavos = Math.round(((Number(c.baseFee) || 0) + km * (Number(c.pricePerKm) || 0)) * 100);
  var regra = ARREDONDA_ENTREGA[c.roundingMode] || ARREDONDA_ENTREGA.centavos;
  var minimo = Math.round((Number(c.minimumFee) || 0) * 100);
  return { km: km, valor: Math.max(regra(centavos), minimo) / 100, foraDaArea: false };
}
