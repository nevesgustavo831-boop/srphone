/* SR Phone · catálogo, página do produto, galeria e modelo 3D
   Dados: data/products.js (CATALOGO e CATS) e data/config.js (STORE_CONFIG).
   Regras de preço, cor, disponibilidade e dados para o Google: js/precos.js */

var CATALOGO_OK = typeof CATALOGO !== "undefined" && Array.isArray(CATALOGO) && typeof normalizaProduto === "function";
if (CATALOGO_OK){
  CATALOGO = CATALOGO.filter(function(p){ return p && p.nome; }).map(normalizaProduto);
} else {
  var CATALOGO = [];
}
function produtoPorId(id){ return CATALOGO.filter(function(p){ return p.id === id; })[0] || null; }

/* preço da opção e da cor escolhidas. Sem preço: "Preço sob consulta" (nunca R$ 0,00).
   Se a opção só tem preço em outra cor, isso é dito, em vez de repetir o preço dela. */
function blocoPreco(p, iOpcao, iCor, naPagina){
  var v = precoDe(p, iOpcao, iCor);
  if (!v){
    var outras = coresComPreco(p, iOpcao);
    var dica = outras.length ? "Valor informado só na cor " + outras.join(", ") + ". Nesta cor, consulte no WhatsApp."
             : naPagina ? "Consulte no WhatsApp o valor e as condições de pagamento." : "Valor e condições pelo WhatsApp";
    return '<span class="consulta">Preço sob consulta</span><span class="consulta-s">' + esc(dica) + '</span>';
  }
  var html = "", de = precoAntigo(p, iOpcao, iCor), pix = precoPixDe(p, iOpcao, iCor), parc = parcelamentoDe(p, iOpcao, iCor);
  if (de){
    html += '<span class="de"><span class="sr-only">Preço anterior: </span>De <s>' + BRL.format(de) + '</s>' +
      (naPagina ? ' <span class="off">' + Math.round((de - v) / de * 100) + '% OFF</span>' : '') + '</span>';
  }
  html += '<span class="por">' + (de ? '<small>Por </small>' : '<span class="sr-only">Preço: </span>') + BRL.format(v) + '</span>';
  if (pix) html += '<div class="pix">Pix: ' + BRL.format(pix.valor) +
                   (pix.desconto ? ' <small>(' + pix.desconto + '% de desconto)</small>' : '') + '</div>';
  if (parc) html += '<div class="parc">' + esc(parc.texto) + (parc.detalhe ? ' <small>' + esc(parc.detalhe) + '</small>' : '') + '</div>';
  if (p.obsPreco) html += '<div class="obs-preco">' + esc(p.obsPreco) + '</div>';
  return html;
}
/* o que vai na mensagem do WhatsApp: opção, cor e os valores que a pessoa viu no site */
function escolhaDe(p, iOpcao, iCor){
  var pix = precoPixDe(p, iOpcao, iCor);
  return { opcao: p.opcoes[iOpcao] || "", cor: nomeCorDe(p, iCor), preco: precoDe(p, iOpcao, iCor), pix: pix ? pix.valor : null };
}

/* posição de uma imagem na galeria aberta (compara tipo e arquivo) */
function indiceDaMidia(alvo, padrao){
  for (var i = 0; i < pdpMidias.length; i++)
    if (pdpMidias[i].tipo === alvo.tipo && pdpMidias[i].src === alvo.src) return i;
  return padrao;
}
function valeNaCor(m, iCor){ return m.cor === null || m.cor === undefined || m.cor === iCor; }
function temFotoPorCor(p){ return galeria(p).some(function(m){ return eImagem(m) && typeof m.cor === "number"; }); }
/* a imagem da cor escolhida: foto da loja primeiro. Cor sem foto fica sem imagem, nunca a de outra cor
   (nem uma imagem geral, como a do chip, no lugar do aparelho daquela cor) */
function imagemParaCor(p, iCor){
  var g = galeria(p).filter(eImagem), i;
  for (i = 0; i < g.length; i++) if (g[i].cor === iCor) return g[i];
  if (temFotoPorCor(p)) return null;
  return g[0] || null;
}
/* a galeria separada por cor: só as fotos da cor escolhida (e as que valem para todas).
   Vídeo, giro 360 e 3D aparecem em qualquer cor. Cor sem foto começa com o aviso "em atualização". */
function midiasDaCor(p, iCor){
  var g = galeria(p);
  if (!temCoresDe(p)) return g;
  var daCor = g.filter(function(m){ return !eImagem(m) || valeNaCor(m, iCor); });
  var temDaCor = g.some(function(m){ return eImagem(m) && m.cor === iCor; });
  if (temFotoPorCor(p) && !temDaCor) daCor.unshift({ tipo:"semfoto" });
  return daCor;
}

/* produto sem imagem: aviso discreto, nunca uma foto qualquer */
var ICONES_CAT = {
  iphone:  '<rect x="7" y="2.5" width="10" height="19" rx="2.4"/><path d="M10.5 5.2h3"/>',
  ipad:    '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M11 18.6h2"/>',
  watch:   '<rect x="6.5" y="6" width="11" height="12" rx="3"/><path d="M9 6l.6-3.5h4.8L15 6M9 18l.6 3.5h4.8L15 18"/>',
  mac:     '<rect x="4" y="4.5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20"/>',
  airpods: '<path d="M8.5 4.5a3 3 0 0 0-3 3v.8a3 3 0 0 0 2 2.8v8.4a1.5 1.5 0 0 0 3 0V7.5a3 3 0 0 0-2-3zM15.5 4.5a3 3 0 0 1 3 3v.8a3 3 0 0 1-2 2.8v8.4a1.5 1.5 0 0 1-3 0V7.5a3 3 0 0 1 2-3z"/>'
};
function iconeCat(cat){ return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONES_CAT[cat] || ICONES_CAT.iphone) + '</svg>'; }
/* ILUSTRAÇÃO do modelo (campo "ilustracao" em data/products.js), na cor escolhida.
   É um desenho, não uma foto: aparece com o selo "Ilustração" enquanto a foto do aparelho não chega.
   Só o formato real do modelo: iPhone Pro (três câmeras), iPhone de duas câmeras na diagonal e Apple Watch. */
function corSegura(c, padrao){ return /^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : padrao; }
var ILUSTRA_N = 0;
function lente(u, x, y, r){
  return '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 1.6) + '" fill="#121214" stroke="rgba(255,255,255,.22)" stroke-width=".8"/>' +
    '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#il-vidro' + u + ')"/>' +
    '<circle cx="' + (x - r * .35) + '" cy="' + (y - r * .35) + '" r="' + (r * .22) + '" fill="#fff" opacity=".55"/>';
}
var ILUSTRA = {
  "iphone-pro": function(u){
    return '<rect x="58" y="12" width="84" height="176" rx="15" fill="url(#il-corpo' + u + ')" stroke="rgba(255,255,255,.2)"/>' +
      '<rect x="141" y="52" width="2.4" height="24" rx="1.2" fill="url(#il-corpo' + u + ')"/>' +
      '<rect x="66" y="20" width="44" height="44" rx="11" fill="url(#il-modulo' + u + ')" stroke="rgba(255,255,255,.18)"/>' +
      lente(u, 77, 32, 6.6) + lente(u, 77, 52, 6.6) + lente(u, 96, 42, 6.6) +
      '<circle cx="98.5" cy="27.5" r="2.4" fill="#F4E9CC" opacity=".9"/><circle cx="98.5" cy="56" r="2.6" fill="#0c0c0d"/>';
  },
  "iphone-duplo": function(u){
    return '<rect x="58" y="12" width="84" height="176" rx="15" fill="url(#il-corpo' + u + ')" stroke="rgba(255,255,255,.2)"/>' +
      '<rect x="141" y="52" width="2.4" height="24" rx="1.2" fill="url(#il-corpo' + u + ')"/>' +
      '<rect x="66" y="20" width="38" height="38" rx="10" fill="url(#il-modulo' + u + ')" stroke="rgba(255,255,255,.18)"/>' +
      lente(u, 76, 30, 6) + lente(u, 94, 48, 6) + '<circle cx="95" cy="29" r="2.2" fill="#F4E9CC" opacity=".9"/>';
  },
  "watch": function(u){
    return '<rect x="76" y="6" width="48" height="52" rx="9" fill="url(#il-modulo' + u + ')"/>' +
      '<rect x="76" y="142" width="48" height="52" rx="9" fill="url(#il-modulo' + u + ')"/>' +
      '<rect x="60" y="46" width="80" height="108" rx="24" fill="url(#il-corpo' + u + ')" stroke="rgba(255,255,255,.2)"/>' +
      '<rect x="139" y="74" width="7" height="18" rx="3.5" fill="url(#il-corpo' + u + ')"/><rect x="139.5" y="100" width="3.5" height="16" rx="1.7" fill="url(#il-corpo' + u + ')"/>' +
      '<rect x="67" y="53" width="66" height="94" rx="18" fill="#050505"/>' +
      '<text x="100" y="108" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="22" font-weight="600" fill="#F4F1EC">10:09</text>';
  }
};
function temIlustracao(p){ return !!(p && ILUSTRA[p.ilustracao]); }
function ilustracaoSVG(p, iCor){
  var c = temCoresDe(p) ? (p.cores[iCor] || p.cores[0]) : null;
  var claro = corSegura(c && c[1], "#8A8A8F"), escuro = corSegura(c && c[2], "#3A3A3D"), u = "-" + (++ILUSTRA_N);
  return '<svg class="ilustra" viewBox="0 0 200 200" aria-hidden="true" focusable="false">' +
    '<defs><linearGradient id="il-corpo' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + claro + '"/><stop offset="1" stop-color="' + escuro + '"/></linearGradient>' +
    '<linearGradient id="il-modulo' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + escuro + '"/><stop offset="1" stop-color="' + claro + '" stop-opacity=".7"/></linearGradient>' +
    '<radialGradient id="il-vidro' + u + '" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#2E3A55"/><stop offset=".6" stop-color="#0B0F18"/><stop offset="1" stop-color="#000"/></radialGradient></defs>' +
    '<ellipse cx="100" cy="193" rx="46" ry="4" fill="#000" opacity=".35"/>' + ILUSTRA[p.ilustracao](u) + '</svg>';
}
/* produto sem foto: a ilustração do modelo (se houver) ou um aviso discreto; nunca uma foto qualquer */
function semFoto(p, grande, nomeCor, iCor){
  if (temIlustracao(p) && !nomeCor){
    var cor = nomeCorDe(p, iCor);
    return '<div class="sem-foto com-ilustra' + (grande ? ' sem-foto-g' : '') + '" role="img" aria-label="' +
      esc("Ilustração do " + p.nome + (cor ? " na cor " + cor : "") + ". A foto do aparelho entra em breve.") + '">' +
      ilustracaoSVG(p, iCor) + '</div><span class="tag-foto tag-ilustra">Ilustração</span>';
  }
  var qual = nomeCor ? "Foto desta cor" : "Imagem";
  return '<div class="sem-foto' + (grande ? ' sem-foto-g' : '') + '" role="img" aria-label="' +
    esc((nomeCor ? "Foto do " + p.nome + " na cor " + nomeCor : "Imagem do " + p.nome) + " em atualização") + '">' +
    iconeCat(p.cat) + '<span>' + esc(qual) + ' em atualização</span></div>';
}

/* =================================================================
   CATÁLOGO: filtros, busca, ordem e cards
   ================================================================= */
var filtro = "todos", termo = "", ordem = "rel";
var chips = document.getElementById("chips");
var grid = document.getElementById("grid");
var vazio = document.getElementById("vazio");
var catConta = document.getElementById("cat-conta");
var corEscolhida = {}, opcaoEscolhida = {};

function erroCatalogo(){
  grid.setAttribute("aria-busy", "false");
  grid.innerHTML = '<div class="cat-erro" role="alert"><b>Não foi possível carregar os produtos agora.</b>' +
    '<span>Verifique a conexão e tente de novo. Se preferir, fale com a loja pelo WhatsApp.</span>' +
    '<div class="cat-erro-acoes"><button class="btn btn-primary btn-sm" type="button" id="cat-tentar">Tentar novamente</button>' +
    '<a class="btn btn-ghost btn-sm" href="' + esc(zap("Olá! Vim pelo site da SR Phone e queria ver os aparelhos disponíveis.")) +
    '" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a></div></div>';
  document.getElementById("cat-tentar").addEventListener("click", function(){ location.reload(); });
  if (catConta) catConta.hidden = true;
}

/* ordenar por preço só aparece se algum produto tiver preço */
(function(){
  if (CATALOGO.some(function(p){ return !!menorPreco(p); })) return;
  var sel = document.getElementById("ordena");
  if (!sel) return;
  Array.prototype.slice.call(sel.options).forEach(function(o){
    if (o.value === "menor" || o.value === "maior") o.remove();
  });
})();

function conta(id){ return CATALOGO.filter(function(p){ return id === "todos" || p.cat === id; }).length; }
if (CATALOGO_OK && typeof CATS !== "undefined"){
  CATS.forEach(function(c){
    var b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.id = "chip-" + c.id;
    b.innerHTML = esc(c.label) + '<em>' + conta(c.id) + '</em>';
    b.setAttribute("aria-pressed", c.id === filtro ? "true" : "false");
    b.addEventListener("click", function(){
      filtro = c.id;
      Array.prototype.forEach.call(chips.children, function(el){
        el.setAttribute("aria-pressed", el === b ? "true" : "false");
      });
      render();
      if (window.medir) medir("filter_product", { categoria: c.id });
    });
    chips.appendChild(b);
  });
}
var buscaTimer = null;
document.getElementById("busca").addEventListener("input", function(e){
  termo = e.target.value.trim().toLowerCase();
  render();
  clearTimeout(buscaTimer);
  if (termo.length >= 2) buscaTimer = setTimeout(function(){
    if (window.medir) medir("search_product", { search_term: termo });
  }, 900);
});
document.getElementById("ordena").addEventListener("change", function(e){ ordem = e.target.value; render(); });

/* busca: nome, categoria, armazenamento/opções, cor e selo. Sem acento e sem ordem:
   "iphone 256 azul" acha o iPhone com 256 GB na cor azul */
function semAcento(t){ return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function textoBusca(p){
  var cat = (typeof CATS !== "undefined" ? CATS : []).filter(function(c){ return c.id === p.cat; })[0];
  var opcoes = p.opcoes.concat((p.variantes || []).map(function(v){ return v && (v.opcao || v.armazenamento) || ""; }));
  return semAcento([p.nome, p.txt, p.badge, p.cond, p.cat, NOME_CAT[p.cat] || "", cat ? cat.label : "",
    opcoes.join(" "), opcoes.join(" ").replace(/\s+/g, ""),
    p.cores.map(function(c){ return c[0]; }).join(" ")].join(" "));
}
function achou(p, termoBusca){
  var t = textoBusca(p);
  return semAcento(termoBusca).split(/\s+/).filter(Boolean).every(function(w){ return t.indexOf(w) > -1; });
}
/* preço usado para ordenar: o que o card mostra; se a opção escolhida não tem preço, o menor das outras */
function precoOrdem(p){ var c = corDoCard(p); return precoDe(p, opcaoDoCard(p, c), c) || menorPreco(p); }
function corDoCard(p){ return corEscolhida[p.id] !== undefined ? corEscolhida[p.id] : corInicial(p); }
function opcaoDoCard(p, iCor){ return opcaoEscolhida[p.id] !== undefined ? opcaoEscolhida[p.id] : opcaoInicial(p, iCor); }
/* card: imagem, nome, opções, disponibilidade, preço (Pix e parcelas) e o botão */
function cardHTML(p){
  var cores = temCoresDe(p);
  var iCor = corDoCard(p);
  var iOp = opcaoDoCard(p, iCor);
  var nomeCor = cores && p.cores[iCor] ? p.cores[iCor][0] : "";
  var img = imagemParaCor(p, iCor);
  var st = statusDe(p, iOp, iCor), v = precoDe(p, iOp, iCor), de = precoAntigo(p, iOp, iCor);

  var selos = '<div class="selos">' +
    (de ? '<span class="selo selo-off">-' + Math.round((de - v) / de * 100) + '%<span class="sr-only"> de desconto</span></span>' : '') +
    (p.badge ? '<span class="selo selo-tag">' + esc(p.badge) + '</span>' : '') + '</div>';
  var bolinhas = !cores ? '<div class="cores" aria-hidden="true"></div>'
    : '<div class="cores" role="group" aria-label="Cores do ' + esc(p.nome) + '">' + p.cores.map(function(c, ci){
        return '<button class="cor" type="button" data-cor="' + ci + '" title="' + esc(c[0]) + '" ' +
          'aria-label="Cor ' + esc(c[0]) + '" aria-pressed="' + (ci === iCor ? "true" : "false") + '" ' +
          'style="background:' + esc(c[1]) + '"></button>';
      }).join("") + '</div>';
  /* mais de uma opção: dá para escolher no card (vai para a mensagem e para o preço) */
  var opcoes = !p.opcoes.length ? ''
    : p.opcoes.length === 1 ? '<div class="opts"><span class="opt">' + esc(p.opcoes[0]) + '</span></div>'
    : '<div class="opts" role="group" aria-label="' + esc(rotuloOpcao(p) + " do " + p.nome) + '">' + p.opcoes.map(function(o, oi){
        return '<button class="opt" type="button" data-op="' + oi + '" aria-pressed="' + (oi === iOp ? "true" : "false") + '">' + esc(o) + '</button>';
      }).join("") + '</div>';
  var alt = p.nome + (nomeCor ? " na cor " + nomeCor : "");
  var midia = img
    ? '<img src="' + esc(caminhoSite(img.src)) + '" alt="' + esc(alt + (img.tipo === "loja" ? ", foto do aparelho na loja" : ", imagem de divulgação")) +
      '" loading="lazy" decoding="async" width="400" height="400">' +
      '<span class="tag-foto' + (img.tipo === "loja" ? "" : " tag-apple") + '">' +
      (img.tipo === "loja" ? "Foto real da loja" : "Imagem de divulgação") + '</span>'
    : semFoto(p, false, galeria(p).some(eImagem) ? nomeCor : "", iCor);

  return '<article class="card" data-id="' + esc(p.id) + '">' + selos +
    '<button class="card-abrir" type="button" aria-label="Ver detalhes do ' + esc(p.nome) + '"></button>' +
    (videoInfo(p) ? '<button class="tag-video" type="button" aria-label="Ver o vídeo do ' + esc(p.nome) + '">' + PLAY_SVG + 'Vídeo</button>' : '') +
    '<div class="card-img' + (img && img.claro ? ' fundo-claro' : '') + (img ? ' com-foto' : temIlustracao(p) ? ' com-ilustra' : ' sem-img') + '">' + midia + '</div>' +
    '<div class="card-body">' + bolinhas +
      '<h3>' + esc(p.nome) + '</h3>' +
      (p.txt ? '<p class="tagline">' + esc(p.txt) + '</p>' : '') +
      opcoes +
      '<div class="meta">' + (p.cond ? esc(p.cond) + ' · ' : '') + '<b class="' + st.classe + '">' + esc(st.texto) + '</b></div>' +
      '<div class="preco">' + blocoPreco(p, iOp, iCor, false) + '</div>' +
      '<a class="btn btn-primary btn-sm" data-zap="card" data-item="' + esc(p.id) + '" href="' + esc(zap(mensagemProduto(p, escolhaDe(p, iOp, iCor)))) +
        '" target="_blank" rel="noopener noreferrer">' + ZAP_SVG + (v ? 'Comprar pelo WhatsApp' : 'Consultar no WhatsApp') + '</a>' +
    '</div></article>';
}
function render(){
  if (!CATALOGO_OK) return erroCatalogo();
  var itens = CATALOGO.map(function(p, i){ return { p: p, i: i }; }).filter(function(x){
    var p = x.p;
    return (filtro === "todos" || p.cat === filtro) && (!termo || achou(p, termo));
  });
  if (ordem === "az") itens.sort(function(a, b){ return a.p.nome.localeCompare(b.p.nome, "pt-BR"); });
  else if (ordem === "menor" || ordem === "maior"){
    itens.sort(function(a, b){
      var va = precoOrdem(a.p), vb = precoOrdem(b.p);   /* sem preço nunca vira zero: vai para o fim */
      if (!va && !vb) return a.i - b.i;
      if (!va) return 1;
      if (!vb) return -1;
      return ordem === "menor" ? va - vb : vb - va;
    });
  } else {
    itens.sort(function(a, b){ return (b.p.destaque ? 1 : 0) - (a.p.destaque ? 1 : 0) || a.i - b.i; });
  }
  vazio.hidden = itens.length > 0;
  catConta.textContent = itens.length === 1 ? "1 produto" : itens.length + " produtos";
  catConta.hidden = itens.length === 0;
  grid.innerHTML = itens.map(function(x){ return cardHTML(x.p); }).join("");
  grid.setAttribute("aria-busy", "false");
}
/* medição de escolha de cor e opção (só produto e o que foi escolhido, nada pessoal) */
function medeEscolha(evento, p, origem, valor){
  if (window.medir) medir(evento, { item_id: p.id, item_name: p.nome, item_variant: valor || "", origem: origem });
}
/* trocar cor ou opção redesenha só aquele card (sem piscar a grade inteira) */
function atualizaCard(id){
  var velho = grid.querySelector('.card[data-id="' + id + '"]');
  var p = produtoPorId(id);
  if (!velho || !p) return render();
  var tmp = document.createElement("div");
  tmp.innerHTML = cardHTML(p);
  var novo = tmp.firstChild;
  novo.className = velho.className;          /* mantém a entrada já feita (rv in) */
  novo.style.cssText = velho.style.cssText;
  novo.classList.add("trocou");
  velho.parentNode.replaceChild(novo, velho);
}
/* o card é redesenhado ao trocar cor ou opção: o foco volta para o mesmo botão */
function focaNoCard(id, seletor){
  var b = grid.querySelector('.card[data-id="' + id + '"] ' + seletor);
  if (b) b.focus({ preventScroll: true });
}
/* um só ouvinte para todos os cards (continua valendo depois de filtrar) */
grid.addEventListener("click", function(e){
  var card = e.target.closest ? e.target.closest(".card") : null;
  if (!card) return;
  var p = produtoPorId(card.dataset.id);
  if (!p) return;
  var cor = e.target.closest(".cor");
  if (cor){
    corEscolhida[p.id] = +cor.dataset.cor; atualizaCard(p.id); focaNoCard(p.id, '[data-cor="' + cor.dataset.cor + '"]');
    medeEscolha("select_product_color", p, "card", p.cores[+cor.dataset.cor] && p.cores[+cor.dataset.cor][0]);
    return;
  }
  var op = e.target.closest(".opt[data-op]");
  if (op){
    opcaoEscolhida[p.id] = +op.dataset.op; atualizaCard(p.id); focaNoCard(p.id, '[data-op="' + op.dataset.op + '"]');
    medeEscolha("select_product_option", p, "card", p.opcoes[+op.dataset.op]);
    return;
  }
  if (e.target.closest(".tag-video")){ abrePdp(p, "video"); return; }
  if (e.target.closest(".card-abrir")){
    if (window.medir) medir("select_item", { item_list_name: "Catálogo", items: [itemGA(p, opcaoDoCard(p, corDoCard(p)), corDoCard(p))] });
    abrePdp(p);
  }
});

try { render(); }
catch (e){ if (window.console) console.error(e); CATALOGO_OK = false; erroCatalogo(); }

/* ---------- dados estruturados do produto (schema.org Product) ----------
   Vão só na página do produto aberto (é o que o Google pede) e só com preço real:
   "Preço sob consulta" não vira Offer. O mesmo js/precos.js monta os dados do build. */
function publicaSchemaProduto(p){
  var velho = document.getElementById("ld-produto");
  if (velho) velho.parentNode.removeChild(velho);
  if (!p || typeof SITE_CONFIG === "undefined" || !SITE_CONFIG.url) return;
  var dados = produtoSchema(p, SITE_CONFIG.url, STORE_CONFIG.nome);
  if (!dados) return;
  var s = document.createElement("script");
  s.type = "application/ld+json"; s.id = "ld-produto";
  s.textContent = JSON.stringify(dados);
  document.head.appendChild(s);
}
/* item para o Google Analytics: só dados do produto, nada pessoal */
function itemGA(p, iOpcao, iCor){
  var it = { item_id: p.id, item_name: p.nome, item_category: NOME_CAT[p.cat] || p.cat,
             item_variant: [p.opcoes[iOpcao] || "", nomeCorDe(p, iCor)].filter(Boolean).join(" / ") };
  var v = precoDe(p, iOpcao, iCor);
  if (v) it.price = v;
  return it;
}

/* ---------- bateria (usado na troca da página do produto e no montador de troca) ---------- */
var FAIXAS = [
  { min:90, cor:"#3FD28B", txt:"Bateria ótima" },
  { min:85, cor:"#FF6A21", txt:"Bateria boa" },
  { min:80, cor:"#FFB020", txt:"Bateria com desgaste" },
  { min:0,  cor:"#FF5A4E", txt:"Bateria desgastada: a Apple indica troca abaixo de 80%" }
];
function faixaBateria(v){
  for (var i = 0; i < FAIXAS.length; i++){ if (v >= FAIXAS[i].min) return FAIXAS[i]; }
  return FAIXAS[FAIXAS.length - 1];
}
function pintaBarra(range, caixa, valor){
  var f = faixaBateria(valor);
  var min = +range.min, max = +range.max;
  var pct = ((Math.min(Math.max(valor, min), max) - min) / (max - min) * 100).toFixed(1);
  range.style.setProperty("--trk",
    "linear-gradient(to right," + f.cor + " 0%," + f.cor + " " + pct + "%,var(--surface-3) " + pct + "%,var(--surface-3) 100%)");
  caixa.style.setProperty("--bat-c", f.cor);
  return f;
}

/* =================================================================
   PÁGINA DO PRODUTO
   ================================================================= */
var pdp = document.getElementById("pdp");
var pdpAtual = null, pdpCor = 0, pdpCap = 0, pdpIdx = 0, pdpMidias = [];
var pdpTroca = false, pdpBatIgnora = false, pdpProntoTroca = false;
/* página própria do produto (/produto/id/): o build grava o id e o título da página inicial no <head> */
var PAGINA_PRODUTO = (function(){ var m = document.querySelector('meta[name="sr-produto"]'); var v = m ? m.getAttribute("content") : ""; return /^[a-z0-9-]{1,80}$/.test(v || "") ? v : ""; })();
var TITULO_INICIO = (function(){ var m = document.querySelector('meta[name="sr-titulo-inicio"]'); return (m && m.getAttribute("content")) || document.title; })();
/* troca o endereço sem recarregar. Só em http(s): aberto direto do computador (file://) o navegador pode recusar */
function trocaEndereco(url){
  if (!/^https?:$/.test(location.protocol)) return;
  try { history.replaceState(null, "", url); } catch(_){}
}
var CUBO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l8 4.4v9.6l-8 4.4-8-4.4V7.2z"/><path d="M4 7.2l8 4.4 8-4.4M12 11.6V21"/></svg>';

/* textos da página do produto: cidade, garantia e pagamento vêm de STORE_CONFIG (data/config.js) */
function naCidade(){ return cidadeLoja() ? " em " + cidadeLoja() : ""; }
function pagamentosDo(p){
  /* "Seu iPhone na troca" só aparece em produto que aceita troca (iPhone) */
  return formasPagamento().filter(function(f){ return !f.troca || aceitaTroca(p); }).map(function(f){ return f.nome; });
}
function pdpFaq(p){
  var pags = pagamentosDo(p), nota = observacaoPagamento();
  return [
    ["Entrega e retirada",
     "Você retira na loja" + naCidade() + " ou combina a entrega na cidade e região. O prazo a gente confirma no atendimento, junto com o valor. Na retirada, a gente separa o aparelho, deixa conferido e, se quiser, já configura e transfere seus dados na hora."],
    /* novo: garantia e nota fiscal da configuração dos novos. Seminovo: só o que foi confirmado para seminovos */
    ["Garantia e nota fiscal", eNovo(p)
     ? (garantiaDe(p) ? frase(garantiaDe(p)) + " " : "") +
       (temNotaFiscal(p) ? "A venda é registrada com nota fiscal em seu nome, o seu comprovante." : TXT_NF_CONSULTE) +
       " Antes de fechar, você confere a caixa lacrada, o IMEI e o número de série."
     : "Este aparelho é " + p.cond + ": a condição é conferida no atendimento. " + frase(garantiaDe(p)) + " " +
       textoNotaFiscal(p) + " " + TXT_CONFERE_SEMINOVO],
    ["Formas de pagamento",
     pags.length ? juntaLista(pags) + "." + (aceitaTroca(p) ? " Na troca, aceitamos só iPhone." : "") + (nota ? " " + nota : "") : ""]
  ].filter(function(q){ return q[1]; });
}
/* bloco de confiança perto do botão: só o que está confirmado nos dados da loja */
var ICONES_CONFIANCA = {
  lacre: '<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
  loja:  '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  zap:   '<path d="M21 12a9 9 0 1 0-3.2 6.9L21 21z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  troca: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>'
};
function confiancaDe(p){
  var l = [];
  if (eNovo(p)) l.push(["lacre", "Novo e lacrado"]);
  else if (eSeminovo(p)) l.push(["lacre", "Condição conferida no atendimento"]);
  if (STORE_CONFIG.endereco) l.push(["loja", "Retirada na loja" + naCidade()]);
  if (temWhatsapp()) l.push(["zap", "Atendimento pelo WhatsApp"]);
  if (aceitaTroca(p)) l.push(["troca", "Seu iPhone na troca"]);
  return l;
}

function pintaTrilha(p){
  var el = document.getElementById("pdp-trilha");
  if (!el) return;
  el.innerHTML =
    '<a href="#topo" data-trilha="topo">Início</a><i>›</i>' +
    '<a href="#catalogo" data-trilha="' + esc(p.cat) + '">' + esc(NOME_CAT[p.cat] || "Catálogo") + '</a><i>›</i>' +
    '<span aria-current="page">' + esc(p.nome) + '</span>';
  el.querySelectorAll("[data-trilha]").forEach(function(a){
    a.addEventListener("click", function(){
      var alvo = a.dataset.trilha;
      fechaPdp();
      if (alvo !== "topo"){
        var chip = document.getElementById("chip-" + alvo);
        if (chip) chip.click();
      }
    });
  });
}

/* ---------- modelo 3D real (.glb/.gltf): só carrega quando a pessoa abre ---------- */
/* o visualizador 3D fica no próprio site (assets/vendor/model-viewer), sem depender de CDN de fora.
   O endereço sai do próprio js/catalog.js: vale na página inicial e nas páginas de produto (produto/x/). */
var MV_SRC = (function(){
  var el = document.querySelector('script[src$="js/catalog.js"]');
  try { return el ? new URL("../assets/vendor/model-viewer/model-viewer-4.0.0.min.js", el.src).href
                   : new URL("assets/vendor/model-viewer/model-viewer-4.0.0.min.js", document.baseURI).href; }
  catch(_){ return "/assets/vendor/model-viewer/model-viewer-4.0.0.min.js"; }
})();
var mvEstado = 0;            /* 0 parado · 1 carregando · 2 pronto · 3 falhou */
var mvFila = [];
function carregaMV(cb){
  if (mvEstado === 2) return cb(true);
  if (mvEstado === 3) return cb(false);
  mvFila.push(cb);
  if (mvEstado === 1) return;
  mvEstado = 1;
  var s = document.createElement("script");
  s.type = "module"; s.src = MV_SRC;
  s.onload  = function(){ mvEstado = 2; escoa(true); };
  s.onerror = function(){ mvEstado = 3; escoa(false); };
  document.head.appendChild(s);
}
function escoa(ok){
  var f = mvFila; mvFila = [];
  f.forEach(function(cb){ try { cb(ok); } catch(_){} });
}
function tira3D(){
  var v = document.getElementById("pdp-mv");
  if (v && v.parentNode) v.parentNode.removeChild(v);
}
function montaVisualizador(p){
  if (document.getElementById("pdp-mv")) return;
  var caixa = document.getElementById("pdp-img");
  var cx = document.createElement("div");
  cx.className = "pdp-mv"; cx.id = "pdp-mv";
  var capa = imagemParaCor(p, pdpCor);
  cx.innerHTML = '<div class="pdp-mv-msg" id="pdp-mv-msg"><span class="giro-ico" aria-hidden="true"></span>Carregando o modelo 3D…</div>';
  caixa.appendChild(cx);
  carregaMV(function(ok){
    var msg = document.getElementById("pdp-mv-msg");
    if (!document.getElementById("pdp-mv")) return;
    if (!ok){
      if (msg) msg.textContent = "Não foi possível carregar o 3D agora. As fotos do aparelho continuam disponíveis abaixo.";
      return;
    }
    var mv = document.createElement("model-viewer");
    mv.setAttribute("src", caminhoSite(p.modelo3d));
    if (capa) mv.setAttribute("poster", caminhoSite(capa.src));
    mv.setAttribute("alt", "Modelo 3D do " + p.nome);
    mv.setAttribute("camera-controls", "");
    mv.setAttribute("touch-action", "pan-y");
    mv.setAttribute("shadow-intensity", "1");
    mv.setAttribute("exposure", "0.95");
    mv.setAttribute("environment-image", "neutral");
    mv.setAttribute("loading", "eager");
    if (!semMovimento()) mv.setAttribute("auto-rotate", "");
    mv.addEventListener("load", function(){ if (msg) msg.remove(); });
    mv.addEventListener("error", function(){
      if (msg){ msg.textContent = "O arquivo do modelo 3D não abriu. As fotos do aparelho continuam disponíveis abaixo."; msg.hidden = false; }
    });
    cx.insertBefore(mv, cx.firstChild);
  });
}

/* ---------- giro 360 com fotos reais (quando o produto tiver giro360) ---------- */
var giroParar = null;
function paraGiro(){ if (giroParar){ giroParar(); giroParar = null; } }
function montaGiro(caixa, p){
  var fotos = p.giro360;
  caixa.insertAdjacentHTML("afterbegin", '<div class="giro360' + (p.fundoClaro ? ' fundo-claro' : '') + '">' +
    fotos.map(function(src, i){
      return '<img src="' + esc(caminhoSite(src)) + '" alt="' + esc(p.nome) + ', vista ' + (i + 1) + '"' + (i === 0 ? ' class="on"' : '') + ' decoding="async">';
    }).join("") + '</div>');
  var palco = caixa.querySelector(".giro360");
  var quadros = palco.querySelectorAll("img");
  var atual = 0, seg = false, x0 = 0, acumulado = 0, loop = null, t = 0;
  var passo = Math.max(6, palco.clientWidth / fotos.length);
  function mostra(i){
    i = ((i % fotos.length) + fotos.length) % fotos.length;
    quadros[atual].classList.remove("on"); quadros[i].classList.add("on"); atual = i;
  }
  function inicio(e){ seg = true; x0 = (e.touches ? e.touches[0] : e).clientX; acumulado = 0; }
  function move(e){
    if (!seg) return;
    var x = (e.touches ? e.touches[0] : e).clientX;
    acumulado += x - x0; x0 = x;
    while (Math.abs(acumulado) >= passo){ mostra(atual + (acumulado > 0 ? 1 : -1)); acumulado += acumulado > 0 ? -passo : passo; }
    if (e.cancelable) e.preventDefault();
  }
  function fim(){ seg = false; }
  palco.addEventListener("mousedown", inicio);
  palco.addEventListener("touchstart", inicio, { passive: true });
  window.addEventListener("mousemove", move);
  palco.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", fim);
  palco.addEventListener("touchend", fim);
  if (!semMovimento()) (function anima(){ loop = requestAnimationFrame(anima); if (!seg && ++t % 5 === 0) mostra(atual + 1); })();
  giroParar = function(){
    if (loop) cancelAnimationFrame(loop);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", fim);
  };
}

function videoHTML(p){
  var v = videoInfo(p);
  if (!v) return "";
  var capa = (fotosApple(p)[0] || {}).src || p.imgs[0] || "";
  if (v.tipo === "arquivo"){
    return '<div class="pdp-video"><video controls playsinline preload="metadata"' +
      (capa ? ' poster="' + esc(caminhoSite(capa)) + '"' : '') + ' src="' + esc(caminhoSite(v.src)) + '"></video></div>';
  }
  return '<div class="pdp-video"><button class="pdp-video-capa" type="button" data-yt="' + esc(v.id) + '" aria-label="Assistir ao vídeo do ' + esc(p.nome) + '">' +
    (capa ? '<img src="' + esc(caminhoSite(capa)) + '" alt="">' : '') +
    '<span>' + PLAY_SVG + '</span><b>Toque para assistir · YouTube</b></button></div>';
}

/* ---------- galeria: imagem grande, setas, contador, miniaturas e legenda ---------- */
var LEGENDAS = {
  loja: "Foto real do aparelho na loja.",
  divulgacao: "Imagem de divulgação do modelo. Não é a foto do aparelho do estoque da loja.",
  giro: "Giro 360 com fotos do aparelho. Arraste para girar.",
  "3d": "Modelo 3D do aparelho. Arraste para girar."
};
function vaiPara(i){
  if (!pdpMidias.length) return;
  pdpIdx = (i + pdpMidias.length) % pdpMidias.length;
  pintaPdp();
}
function pintaGaleria(){
  var p = pdpAtual, caixa = document.getElementById("pdp-img");
  var m = pdpMidias[pdpIdx] || null;
  paraGiro();
  if (!m || m.tipo !== "3d") tira3D();
  Array.prototype.slice.call(caixa.children).forEach(function(el){
    if (!(m && m.tipo === "3d" && el.id === "pdp-mv")) caixa.removeChild(el);
  });
  caixa.className = "pdp-img" + (eImagem(m) && m.claro ? " fundo-claro" : "") + (m && m.tipo === "video" ? " com-video" : "");

  if (!m) caixa.innerHTML = semFoto(p, true, "", pdpCor);
  else if (m.tipo === "semfoto") caixa.innerHTML = semFoto(p, true, nomeCorDe(p, pdpCor), pdpCor);
  else if (eImagem(m)){
    caixa.classList.add("carregando");
    var cor = temCoresDe(p) && p.cores[pdpCor] ? " na cor " + p.cores[pdpCor][0] : "";
    var img = new Image();
    img.decoding = "async";
    img.alt = p.nome + (m.tipo === "loja" ? cor + ", foto do aparelho na loja" : ", imagem de divulgação");
    img.onload = img.onerror = function(){ caixa.classList.remove("carregando"); };
    img.src = caminhoSite(m.src);
    caixa.appendChild(img);
  } else if (m.tipo === "video"){
    caixa.insertAdjacentHTML("afterbegin", videoHTML(p));
    var capaYt = caixa.querySelector(".pdp-video-capa");
    if (capaYt) capaYt.addEventListener("click", function(){
      capaYt.parentNode.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(capaYt.dataset.yt) +
        '?autoplay=1&rel=0&playsinline=1" title="Vídeo do ' + esc(p.nome) + '" ' +
        'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    });
  } else if (m.tipo === "giro") montaGiro(caixa, p);
  else if (m.tipo === "3d") montaVisualizador(p);

  var varias = pdpMidias.length > 1;
  document.getElementById("pdp-ant").hidden = !varias;
  document.getElementById("pdp-prox").hidden = !varias;
  var cont = document.getElementById("pdp-cont");
  cont.hidden = !varias;
  cont.textContent = (pdpIdx + 1) + " / " + pdpMidias.length;

  var th = document.getElementById("pdp-thumbs");
  th.hidden = !varias;
  th.innerHTML = varias ? pdpMidias.map(function(x, i){
    var rot = x.tipo === "loja" ? "Foto real " : x.tipo === "divulgacao" ? "Imagem de divulgação " :
              x.tipo === "semfoto" ? "Foto em atualização " :
              x.tipo === "video" ? "Vídeo " : x.tipo === "giro" ? "Giro 360 " : "Modelo 3D ";
    var dentro = eImagem(x) ? '<img src="' + esc(caminhoSite(x.src)) + '" alt="" loading="lazy" decoding="async">' +
                   (x.tipo === "loja" ? '<span class="selo3d">Loja</span>' : '')
               : x.tipo === "video" ? PLAY_SVG + '<span class="selo3d">Vídeo</span>'
               : x.tipo === "giro" ? '<b class="th-giro">360°</b>'
               : x.tipo === "semfoto" ? iconeCat(p.cat)
               : CUBO_SVG + '<span class="selo3d">3D</span>';
    return '<button class="pdp-thumb' + (eImagem(x) && x.claro ? ' fundo-claro' : '') +
      (x.tipo === "video" ? ' thumb-video' : x.tipo === "3d" ? ' thumb-modelo' : x.tipo === "semfoto" ? ' thumb-semfoto' : '') + '" type="button" data-i="' + i + '" ' +
      'aria-label="' + esc(rot + (i + 1) + " de " + pdpMidias.length) + '" aria-pressed="' + (i === pdpIdx ? "true" : "false") + '">' +
      dentro + '</button>';
  }).join("") : "";

  var leg = document.getElementById("pdp-legenda");
  var txt = !m ? (temIlustracao(p) ? "Ilustração do modelo, fora de escala. A foto do aparelho entra em breve." : "") : m.tipo === "video"
    ? (videoInfo(p).tipo === "youtube" ? "Vídeo pelo YouTube. Não é o aparelho do estoque da loja." : "Vídeo do aparelho.")
    : LEGENDAS[m.tipo] || "";
  leg.textContent = txt;
  leg.hidden = !txt;
  leg.className = "pdp-legenda" + (m && m.tipo === "loja" ? " real" : "");

  var b3d = document.getElementById("pdp-abrir3d");
  b3d.hidden = !temModelo(p) || (m && m.tipo === "3d");
  var bUn = document.getElementById("pdp-unboxing");
  if (bUn) bUn.hidden = !temUnboxing(p);
}

function pintaInfo(){
  var p = pdpAtual, cores = temCoresDe(p), st = statusDe(p, pdpCap, pdpCor);
  pintaTrilha(p);
  document.title = p.nome + naCidade() + " | SR Phone";
  document.getElementById("pdp-nome").textContent = p.nome;

  /* 1. armazenamento (ou tamanho/versão) · 2. cor */
  var escolhas = document.getElementById("pdp-escolhas");
  escolhas.innerHTML = "";
  if (p.opcoes.length){
    var rotulo = rotuloOpcao(p);
    var gk = document.createElement("div");
    gk.className = "pdp-grupo";
    gk.innerHTML = '<div class="k" id="pdp-k-op">' + esc(rotulo) + ': <b>' + esc(p.opcoes[pdpCap]) + '</b></div>';
    var bx = document.createElement("div"); bx.className = "pdp-opcs";
    bx.setAttribute("role", "group"); bx.setAttribute("aria-labelledby", "pdp-k-op");
    p.opcoes.forEach(function(o, oi){
      var b = document.createElement("button");
      b.className = "pdp-op"; b.type = "button"; b.textContent = o;
      b.dataset.op = oi;
      b.setAttribute("aria-pressed", oi === pdpCap ? "true" : "false");
      b.addEventListener("click", function(){
        pdpCap = oi; pintaInfo();
        medeEscolha("select_product_option", p, "produto", o);
        var de = escolhas.querySelector('[data-op="' + oi + '"]'); if (de) de.focus();
      });
      bx.appendChild(b);
    });
    gk.appendChild(bx); escolhas.appendChild(gk);
  }
  if (cores){
    var gc = document.createElement("div");
    gc.className = "pdp-grupo";
    gc.innerHTML = '<div class="k" id="pdp-k-cor">Cor: <b>' + esc(p.cores[pdpCor][0]) + '</b></div>';
    var box = document.createElement("div"); box.className = "pdp-opcs";
    box.setAttribute("role", "group"); box.setAttribute("aria-labelledby", "pdp-k-cor");
    p.cores.forEach(function(c, ci){
      var b = document.createElement("button");
      b.className = "pdp-cor"; b.type = "button"; b.title = c[0];
      b.dataset.cor = ci;
      b.setAttribute("aria-label", "Cor " + c[0]);
      b.setAttribute("aria-pressed", ci === pdpCor ? "true" : "false");
      b.style.background = c[1];
      b.addEventListener("click", function(){
        var atual = pdpMidias[pdpIdx];
        pdpCor = ci;
        pdpMidias = midiasDaCor(p, ci);
        /* vendo vídeo, giro ou 3D: continua nele; vendo foto: vai para a primeira foto da cor nova */
        pdpIdx = (atual && (atual.tipo === "video" || atual.tipo === "giro" || atual.tipo === "3d")) ? indiceDaMidia(atual, 0) : 0;
        pintaPdp();
        medeEscolha("select_product_color", p, "produto", c[0]);
        var de = escolhas.querySelector('[data-cor="' + ci + '"]'); if (de) de.focus();
      });
      box.appendChild(b);
    });
    gc.appendChild(box); escolhas.appendChild(gc);
  }

  /* 3. disponibilidade · 4. preço, Pix e parcelas (da opção escolhida) */
  document.getElementById("pdp-cond").innerHTML = (p.cond ? esc(p.cond) + ' · ' : '') +
    '<b class="' + st.classe + '">' + esc(st.texto) + '</b> <span class="disp-aviso">' + esc(st.aviso) + '</span>';
  document.getElementById("pdp-preco").innerHTML = blocoPreco(p, pdpCap, pdpCor, true);

  /* 5. botões · 6. confiança */
  pintaAcoes();
  document.getElementById("pdp-gar").innerHTML = confiancaDe(p).map(function(g){
    return '<li><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONES_CONFIANCA[g[0]] + '</svg><span>' + esc(g[1]) + '</span></li>';
  }).join("");

  var rot = rotuloOpcao(p);
  var specs = [["Condição", p.cond], ["Modelo", p.nome]];
  if (p.opcoes.length) specs.push([rot + (p.opcoes.length > 1 ? "s disponíveis" : ""), p.opcoes.join(" · ")]);
  if (cores) specs.push(["Cores disponíveis", p.cores.map(function(c){ return c[0]; }).join(" · ")]);
  specs.push(["Disponibilidade", st.texto]);   /* da opção escolhida */
  if (eNovo(p)) specs = specs.concat([
    ["Garantia", garantiaDe(p)],
    ["Nota fiscal", temNotaFiscal(p) ? "Sim, emitida em nome do comprador" : TXT_NF_CONSULTE],
    ["Acompanha", "Caixa lacrada com os acessórios originais do fabricante"]
  ]);
  else if (eSeminovo(p)) specs = specs.concat([
    ["Conferência", "Condição conferida no atendimento. " + TXT_CONFERE_SEMINOVO],
    ["Garantia", garantiaDe(p)],
    ["Nota fiscal", temNotaFiscal(p) ? "Sim, emitida em nome do comprador" : TXT_NF_CONSULTE]
  ]);
  if (aceitaTroca(p)) specs.push(["Aceita na troca", "Somente iPhone, mediante avaliação"]);
  specs = specs.concat([
    ["Formas de pagamento", pagamentosDo(p).join(" · ")],
    ["Entrega", "Retirada na loja" + naCidade() + " ou entrega combinada na região"]
  ]);
  if (p.specs && p.specs.length) specs = p.specs.concat(specs);
  document.getElementById("pdp-specs").innerHTML = specs.filter(function(s){ return s[1]; }).map(function(s){
    return '<tr><th scope="row">' + esc(s[0]) + '</th><td>' + esc(s[1]) + '</td></tr>';
  }).join("");

  document.getElementById("pdp-faq").innerHTML = pdpFaq(p).map(function(q){
    return '<details class="qa"><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>';
  }).join("");

  document.getElementById("pdp-desc").innerHTML =
    (p.descricao || (p.txt ? '<p>' + esc(p.txt) + '</p>' : '')) +
    (eNovo(p)
      ? '<p>O ' + esc(p.nome) + ' vendido aqui é novo e lacrado. Antes de fechar a compra você confere a caixa, o IMEI e o número de série' +
        (temNotaFiscal(p) ? ', e a venda sai com nota fiscal em seu nome, o seu comprovante para a garantia.</p>' : '. ' + esc(TXT_NF_CONSULTE) + '</p>')
      : '<p>Este aparelho é ' + esc(p.cond) + ': não é novo nem lacrado. Condição conferida no atendimento: a loja confirma pelo WhatsApp, antes da compra, a procedência, o estado do aparelho, a saúde da bateria e os itens que acompanham. ' +
        esc(TXT_CONFERE_SEMINOVO) + '</p><p>' + esc(frase(garantiaDe(p))) + ' ' + esc(textoNotaFiscal(p)) + '</p>' +
        (/cpo/i.test(p.cond + " " + p.nome) ? '<p>CPO, aqui, identifica um seminovo selecionado pela loja. Não é uma afirmação de recondicionamento oficial da Apple: se o aparelho tiver certificação, a loja informa e mostra no atendimento.</p>' : '')) +
    (aceitaTroca(p)
      ? '<p>Tem um iPhone antigo? A gente avalia e abate do valor deste. Na troca, trabalhamos só com iPhone.</p>'
      : '<p>A troca de aparelho usado vale apenas na compra de iPhone.</p>') +
    (pagamentosDo(p).length ? '<p>Formas de pagamento: ' + esc(juntaLista(pagamentosDo(p))) + '. As condições a gente fecha no atendimento.</p>' : '') +
    '<p>Se a cor ou a capacidade que você quer não estiver na loja no momento, encomendamos e informamos o prazo pelo WhatsApp.</p>';
}

/* botões do produto: a mensagem leva produto, opção, cor e os valores vistos no site */
function pintaAcoes(){
  var p = pdpAtual, cores = temCoresDe(p);
  var escolha = escolhaDe(p, pdpCap, pdpCor);
  var acoes = document.getElementById("pdp-acoes");
  acoes.innerHTML =
    '<a class="btn btn-primary btn-lg" id="pdp-zap" data-zap="produto" target="_blank" rel="noopener noreferrer" href="' + esc(zap(mensagemProduto(p, escolha))) + '">' +
      ZAP_SVG + (escolha.preco ? 'Comprar pelo WhatsApp' : 'Consultar no WhatsApp') + '</a>' +
    '<a class="btn btn-ghost" href="#agendar" id="pdp-agendar" data-agendar="produto">Agendar atendimento na loja</a>';
  document.getElementById("pdp-agendar").addEventListener("click", function(){
    if (window.agendaInteresse) agendaInteresse(p.nome + (escolha.opcao ? " " + escolha.opcao : ""));
    fechaPdp();
  });
  pintaTrocaPdp(escolha);
}
/* troca na página do produto: botão próprio, com o iPhone de entrada, o estado e a bateria */
function pintaTrocaPdp(escolha){
  var b = document.getElementById("pdp-zap-troca");
  var p = pdpAtual;
  if (!b || !pdpProntoTroca || !aceitaTroca(p)) return;
  var ent = document.getElementById("pdp-entrada").value;
  if (!ent){
    b.setAttribute("aria-disabled", "true");
    b.href = zap(mensagemProduto(p, escolha));
    return;
  }
  var det = document.getElementById("pdp-estado").value.toLowerCase();
  if (!pdpBatIgnora){
    var vb = parseInt(document.getElementById("pdp-bat-num").value, 10);
    if (isNaN(vb)) vb = parseInt(document.getElementById("pdp-bateria").value, 10);
    det += ", bateria em " + Math.min(Math.max(vb || 0, 1), 100) + "%";
  }
  b.setAttribute("aria-disabled", "false");
  b.href = zap(mensagemTroca(p, escolha, ent, det));
  var erro = document.getElementById("pdp-troca-erro");
  if (erro){ erro.hidden = true; erro.textContent = ""; }
}
function pintaPdp(){
  if (!pdpAtual) return;
  pintaGaleria();
  pintaInfo();
}

function ligaTrocaPdp(){
  if (pdpProntoTroca) return;
  var origem = document.getElementById("f-entrada");
  var destino = document.getElementById("pdp-entrada");
  if (!origem) return;
  destino.innerHTML = origem.innerHTML;
  destino.value = "";
  var bat = document.getElementById("pdp-bateria");
  var num = document.getElementById("pdp-bat-num");
  var tag = document.getElementById("pdp-bat-tag");
  var na = document.getElementById("pdp-bat-na");
  var wrap = document.getElementById("pdp-wrap-bat");
  function pinta(){
    var f = pintaBarra(bat, wrap, +bat.value);
    if (document.activeElement !== num) num.value = bat.value;
    num.disabled = pdpBatIgnora;
    tag.textContent = pdpBatIgnora ? "" : f.txt;
  }
  function solta(){ if (pdpBatIgnora){ pdpBatIgnora = false; na.setAttribute("aria-pressed", "false"); bat.disabled = false; } }
  num.addEventListener("input", function(){
    var v = parseInt(num.value, 10);
    if (isNaN(v)) return;
    bat.value = Math.min(Math.max(v, 1), 100);
    solta(); pinta(); pintaAcoes();
  });
  num.addEventListener("blur", function(){
    var v = parseInt(num.value, 10);
    if (isNaN(v) || v < 1) v = +bat.value;
    num.value = Math.min(Math.max(v, 1), 100);
    pinta(); pintaAcoes();
  });
  bat.addEventListener("input", function(){ solta(); pinta(); pintaAcoes(); });
  na.addEventListener("click", function(){
    pdpBatIgnora = !pdpBatIgnora;
    na.setAttribute("aria-pressed", pdpBatIgnora ? "true" : "false");
    bat.disabled = pdpBatIgnora;
    pinta(); pintaAcoes();
  });
  destino.addEventListener("change", function(){
    document.getElementById("pdp-estado").parentElement.hidden = !destino.value;
    wrap.hidden = !destino.value;
    document.getElementById("pdp-bat-dica").hidden = !destino.value;
    pintaAcoes();
  });
  document.getElementById("pdp-estado").addEventListener("change", pintaAcoes);
  var bTroca = document.getElementById("pdp-zap-troca");
  bTroca.innerHTML = ZAP_SVG + "Calcular minha troca no WhatsApp";
  bTroca.addEventListener("click", function(e){
    var erro = document.getElementById("pdp-troca-erro");
    if (bTroca.getAttribute("aria-disabled") === "true"){
      e.preventDefault();
      erro.textContent = "Escolha o iPhone que você tem hoje para calcular a troca.";
      erro.hidden = false;
      destino.focus();
      return;
    }
    if (window.medir && pdpAtual) medir("trade_in_submit", { origem: "produto", item_id: pdpAtual.id, item_name: pdpAtual.nome });
  });
  document.getElementById("tb-sem").addEventListener("click", function(){ trocaAba(false); });
  document.getElementById("tb-com").addEventListener("click", function(){
    trocaAba(true);
    if (window.medir && pdpAtual) medir("trade_in_start", { origem: "produto", item_id: pdpAtual.id });
  });
  pdpProntoTroca = true;
  pinta();
}
function trocaAba(com){
  pdpTroca = com;
  document.getElementById("tb-sem").setAttribute("aria-pressed", com ? "false" : "true");
  document.getElementById("tb-com").setAttribute("aria-pressed", com ? "true" : "false");
  document.getElementById("troca-campos").hidden = !com;
  if (pdpAtual) pintaAcoes();
}

function abrePdp(p, comecaEm){
  if (!p) return;

  var jaAberta = !pdp.hidden;
  pdpAtual = p;
  pdp.setAttribute("data-produto", p.id);      /* qual produto está aberto (os testes esperam por ele) */
  pdpCor = corEscolhida[p.id] !== undefined ? corEscolhida[p.id] : corInicial(p);
  pdpCap = opcaoDoCard(p, pdpCor);
  if (window.medir) medir("view_item", { items: [itemGA(p, pdpCap, pdpCor)] });
  pdpMidias = midiasDaCor(p, pdpCor);
  pdpIdx = 0;
  if (comecaEm === "video") pdpMidias.forEach(function(x, i){ if (x.tipo === "video") pdpIdx = i; });
  ligaTrocaPdp();
  document.querySelector(".pdp-troca").hidden = !aceitaTroca(p);
  var sel = document.getElementById("pdp-entrada");
  if (sel){
    sel.value = "";
    document.getElementById("pdp-estado").parentElement.hidden = true;
    document.getElementById("pdp-wrap-bat").hidden = true;
    document.getElementById("pdp-bat-dica").hidden = true;
    var erroTroca = document.getElementById("pdp-troca-erro");
    if (erroTroca){ erroTroca.hidden = true; erroTroca.textContent = ""; }
  }
  pdpTroca = false;
  trocaAba(false);
  pintaPdp();
  publicaSchemaProduto(p);
  /* endereço: na página própria do produto (/produto/id/) fica o endereço limpo;
     no resto, #/produto/id (dá para copiar e mandar) */
  if (PAGINA_PRODUTO === p.id && !location.hash) { /* já está no endereço certo */ }
  else if (location.hash !== "#/produto/" + p.id) trocaEndereco((PAGINA_PRODUTO ? RAIZ_SITE : "") + "#/produto/" + p.id);
  pdp.scrollTop = 0;
  if (jaAberta) document.getElementById("pdp-close").focus();
  else abreJanela(pdp, fechaPdp, document.getElementById("pdp-close"));
}
function fechaPdp(){
  if (pdp.hidden) return;
  document.title = TITULO_INICIO;
  publicaSchemaProduto(null);
  paraGiro();
  tira3D();
  var caixa = document.getElementById("pdp-img");
  Array.prototype.forEach.call(caixa.querySelectorAll(".pdp-video"), function(v){ v.parentNode.removeChild(v); });
  if (PAGINA_PRODUTO) trocaEndereco(RAIZ_SITE || "./");
  else if (/^#\/produto\//.test(location.hash || "")) trocaEndereco(location.pathname + location.search);
  if (pdpAtual && temCoresDe(pdpAtual)) corEscolhida[pdpAtual.id] = pdpCor;
  if (pdpAtual && pdpAtual.opcoes.length > 1) opcaoEscolhida[pdpAtual.id] = pdpCap;
  var id = pdpAtual ? pdpAtual.id : "";
  if (pdpAtual) render();
  fechaJanela(pdp);
  /* o card que abriu foi redesenhado: o foco volta para o card novo do mesmo produto */
  if (id && (!document.activeElement || document.activeElement === document.body)){
    var volta = grid.querySelector('.card[data-id="' + id + '"] .card-abrir');
    if (volta) volta.focus({ preventScroll: true });
  }
}
document.getElementById("pdp-close").addEventListener("click", fechaPdp);
pdp.addEventListener("click", function(e){ if (e.target === pdp) fechaPdp(); });
document.getElementById("pdp-ant").addEventListener("click", function(){ vaiPara(pdpIdx - 1); });
document.getElementById("pdp-prox").addEventListener("click", function(){ vaiPara(pdpIdx + 1); });
document.getElementById("pdp-thumbs").addEventListener("click", function(e){
  var b = e.target.closest ? e.target.closest(".pdp-thumb") : null;
  if (b) vaiPara(+b.dataset.i);
});
document.getElementById("pdp-abrir3d").addEventListener("click", function(){
  pdpMidias.forEach(function(x, i){ if (x.tipo === "3d") pdpIdx = i; });
  pintaPdp();
});
(function(){
  var b = document.getElementById("pdp-unboxing");
  if (!b) return;
  b.addEventListener("click", function(){
    var p = pdpAtual;
    if (!temUnboxing(p)) return;
    b.disabled = true;
    carregaScript(caminhoSite("js/unboxing.js"), function(ok){
      b.disabled = false;
      if (ok && window.SRUnboxing) window.SRUnboxing.abrir(p, document.getElementById("pdp-img"));
    });
  });
})();
function carregaScript(src, cb){
  var s = document.createElement("script");
  s.src = src; s.async = true;
  s.onload = function(){ cb(true); };
  s.onerror = function(){ cb(false); };
  document.head.appendChild(s);
}

/* setas do teclado e deslizar o dedo trocam a imagem
   (Tab preso na janela e Esc ficam na regra comum das janelas, em js/core.js) */
document.addEventListener("keydown", function(e){
  var topo = JANELAS[JANELAS.length - 1];
  if (pdp.hidden || !topo || topo.el !== pdp) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) return;
  if (e.key === "ArrowLeft"){ vaiPara(pdpIdx - 1); }
  else if (e.key === "ArrowRight"){ vaiPara(pdpIdx + 1); }
});
(function(){
  var caixa = document.getElementById("pdp-img"), x0 = null, y0 = 0;
  caixa.addEventListener("touchstart", function(e){
    var m = pdpMidias[pdpIdx];
    if (m && (m.tipo === "giro" || m.tipo === "3d")) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  caixa.addEventListener("touchend", function(e){
    if (x0 === null || pdpMidias.length < 2) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) vaiPara(pdpIdx + (dx < 0 ? 1 : -1));
  }, { passive: true });
})();

/* abre direto pelo endereço:
   /produto/iphone-17/ (página própria, gerada pelo "npm run build"), #/produto/iphone-17
   e ?produto=iphone-17 (para onde a Netlify manda um produto novo que ainda não tem página) */
function idNoEndereco(){
  var m = (location.hash || "").match(/^#\/produto\/([a-z0-9-]{1,80})$/);
  if (m) return m[1];
  m = (location.search || "").match(/[?&]produto=([a-z0-9-]{1,80})(?:&|$)/);
  if (m) return m[1];
  return (!location.hash && PAGINA_PRODUTO) ? PAGINA_PRODUTO : "";
}
function abrePelaURL(){
  var id = idNoEndereco();
  if (!id) return false;
  var alvo = produtoPorId(id) || CATALOGO.filter(function(x){ return apelido(x.nome) === id; })[0];
  if (alvo){ abrePdp(alvo); return true; }
  produtoNaoEncontrado();
  return false;
}
/* link de um produto que saiu do catálogo: aviso educado no catálogo, nunca tela quebrada */
function produtoNaoEncontrado(){
  if (!pdp.hidden) fechaPdp();
  trocaEndereco(PAGINA_PRODUTO ? RAIZ_SITE || "./" : location.pathname + "#catalogo");
  var av = document.getElementById("cat-aviso");
  if (!av){
    av = document.createElement("p");
    av.id = "cat-aviso"; av.className = "cat-aviso"; av.setAttribute("role", "status");
    grid.parentNode.insertBefore(av, grid);
  }
  av.innerHTML = "<b>Esse produto não está mais no catálogo.</b> Veja os modelos abaixo ou " +
    '<a href="' + esc(zap("Olá! Vim pelo site da SR Phone e procuro um aparelho que não achei no catálogo.")) + '" target="_blank" rel="noopener noreferrer">fale com a loja no WhatsApp</a>.';
  av.hidden = false;
  vaiParaCatalogo();
}
window.addEventListener("hashchange", function(){ if (!abrePelaURL() && !pdp.hidden) fechaPdp(); });
if (CATALOGO_OK) abrePelaURL();

/* ---------- inclinação leve dos cards (só com mouse e sem movimento reduzido) ---------- */
(function(){
  if (semMovimento()) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  function peca(caixa){ return caixa ? caixa.querySelector("img") : null; }
  grid.addEventListener("mousemove", function(e){
    var caixa = e.target.closest ? e.target.closest(".card-img") : null;
    var el = peca(caixa);
    if (!el) return;
    var r = caixa.getBoundingClientRect();
    var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    caixa.classList.add("tilt"); caixa.classList.remove("solta");
    el.style.transform = "rotateY(" + (px * 7).toFixed(2) + "deg) rotateX(" + (-py * 5).toFixed(2) + "deg) translateZ(4px) scale(1.025)";
  });
  grid.addEventListener("mouseout", function(e){
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".card-img")) return;
    var caixa = e.target.closest ? e.target.closest(".card-img") : null;
    var el = peca(caixa);
    if (!el) return;
    caixa.classList.remove("tilt"); caixa.classList.add("solta");
    el.style.transform = "";
  });
})();

/* ---------- busca do cabeçalho: espelha o campo do catálogo ---------- */
function semMovimento(){ return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
function vaiParaCatalogo(){
  var alvo = document.getElementById("catalogo");
  if (alvo) alvo.scrollIntoView({ behavior: semMovimento() ? "auto" : "smooth", block: "start" });
}
(function(){
  var topo = document.getElementById("busca-topo");
  var campo = document.getElementById("busca");
  var lupa = document.getElementById("lupa");
  var barra = document.getElementById("topbar");
  if (!topo || !campo) return;
  var indo = false;
  topo.addEventListener("input", function(){
    if (indo) return;
    /* a busca do cabeçalho procura no catálogo inteiro, não só na categoria que estava aberta */
    if (filtro !== "todos" && topo.value.trim()) escolheCategoria("todos", false);
    indo = true; campo.value = topo.value;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    indo = false;
  });
  campo.addEventListener("input", function(){ if (indo) return; indo = true; topo.value = campo.value; indo = false; });
  topo.addEventListener("keydown", function(e){
    if (e.key !== "Enter") return;
    e.preventDefault(); vaiParaCatalogo(); topo.blur();
  });
  if (lupa && barra){
    lupa.addEventListener("click", function(){
      var abriu = !barra.classList.contains("busca");
      barra.classList.toggle("busca", abriu);
      lupa.setAttribute("aria-expanded", abriu ? "true" : "false");
      if (abriu) topo.focus();
    });
  }
})();

/* ---------- categorias: faixa do cabeçalho + círculos ---------- */
function escolheCategoria(id, rolar){
  var chip = document.getElementById("chip-" + id);
  if (chip) chip.click();
  Array.prototype.forEach.call(document.querySelectorAll(".catlink, .cat-bolha"), function(b){
    b.setAttribute("aria-pressed", b.dataset.cat === id ? "true" : "false");
  });
  if (rolar) vaiParaCatalogo();
}
(function(){
  if (!CATALOGO_OK || typeof CATS === "undefined") return;
  var faixa = document.getElementById("cat-nav");
  var roda = document.getElementById("roda");
  if (faixa){
    CATS.forEach(function(c){
      var b = document.createElement("button");
      b.type = "button"; b.className = "catlink"; b.dataset.cat = c.id;
      b.textContent = c.label;
      b.setAttribute("aria-pressed", c.id === filtro ? "true" : "false");
      b.addEventListener("click", function(){ escolheCategoria(c.id, true); });
      faixa.appendChild(b);
    });
  }
  if (roda){
    CATS.filter(function(c){ return c.id !== "todos"; }).forEach(function(c){
      var daCat = CATALOGO.filter(function(p){ return p.cat === c.id; });
      if (!daCat.length) return;
      var comImg = daCat.filter(function(p){ return imagemParaCor(p, corInicial(p)); })[0];
      var img = comImg ? imagemParaCor(comImg, corInicial(comImg)) : null;
      var n = daCat.length;
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button"; b.className = "cat-bolha"; b.dataset.cat = c.id;
      b.setAttribute("aria-pressed", c.id === filtro ? "true" : "false");
      b.setAttribute("aria-label", "Ver " + c.label + ", " + n + (n === 1 ? " aparelho" : " aparelhos"));
      b.innerHTML = '<span class="cat-disco' + (img ? '' : ' cat-disco-ico') + '">' +
          (img ? '<img src="' + esc(caminhoSite(img.src)) + '" alt="" loading="lazy" decoding="async">' : iconeCat(c.id)) + '</span>' +
        '<span class="cat-nome">' + esc(c.label) + '<span class="cat-qtd">' + n + (n === 1 ? " aparelho" : " aparelhos") + '</span></span>';
      b.addEventListener("click", function(){ escolheCategoria(c.id, true); });
      li.appendChild(b);
      roda.appendChild(li);
    });
  }
  if (chips){
    chips.addEventListener("click", function(e){
      var b = e.target.closest ? e.target.closest(".chip") : null;
      if (!b || !b.id) return;
      var id = b.id.replace("chip-", "");
      Array.prototype.forEach.call(document.querySelectorAll(".catlink, .cat-bolha"), function(x){
        x.setAttribute("aria-pressed", x.dataset.cat === id ? "true" : "false");
      });
    });
  }
})();
/* links que já abrem o catálogo filtrado, ex.: "Ver iPhones" no topo */
document.querySelectorAll("[data-cat-link]").forEach(function(a){
  a.addEventListener("click", function(e){
    if (!CATALOGO_OK) return;
    e.preventDefault();
    escolheCategoria(a.dataset.catLink, true);
  });
});
window.CATALOGO_PRONTO = true;
