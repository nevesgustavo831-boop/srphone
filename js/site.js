/* SR Phone · cabeçalho, contatos, localização, rodapé, equipe, loja, FAQ e políticas */
/* ---------- header ---------- */
var topbar = document.getElementById("topbar");
var burger = document.getElementById("burger");
function onScroll(){ topbar.classList.toggle("stuck", window.scrollY > 12); }
onScroll();
window.addEventListener("scroll", onScroll, {passive:true});
burger.addEventListener("click", function(){
  var aberto = topbar.classList.toggle("open");
  burger.setAttribute("aria-expanded", aberto ? "true" : "false");
  burger.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
});
document.querySelectorAll("#mnav a").forEach(function(a){
  a.addEventListener("click", function(){
    topbar.classList.remove("open");
    burger.setAttribute("aria-expanded","false");
  });
});

/* ---------- dados da loja: tudo vem de STORE_CONFIG (data/config.js) ---------- */
var SC = STORE_CONFIG;
function soDigitos(t){ return String(t || "").replace(/\D/g, ""); }
function linkInstagram(){ var u = String(SC.instagram || "").replace(/^@/, ""); return u ? "https://instagram.com/" + encodeURIComponent(u) : ""; }
function linkTelefone(t){ var d = soDigitos(t); if (!d) return ""; return "tel:+" + (d.length <= 11 ? "55" + d : d); }
function cidadeUF(){ return [SC.cidade, SC.estado].filter(Boolean).join(", "); }
function enderecoLinhas(){
  var l1 = SC.endereco || "";
  var l2 = [SC.bairro, cidadeUF()].filter(Boolean).join(" · ") + (SC.cep ? " · CEP " + SC.cep : "");
  return { l1: l1, l2: l2, completo: [SC.endereco, SC.bairro, cidadeUF(), SC.cep].filter(Boolean).join(", ") };
}
function horarioTexto(){
  return (SC.horarioFuncionamento || []).map(function(d){ return d[0] + ": " + d[1]; });
}
/* mostra/esconde um campo conforme o dado existe; nada é inventado */
function preenche(id, texto, href){
  var el = document.getElementById(id);
  if (!el) return null;
  var alvo = el.querySelector("[data-v]") || el;
  if (!texto){ el.hidden = true; return el; }
  el.hidden = false;
  alvo.textContent = texto;
  if (href && alvo.tagName === "A") alvo.href = href;
  return el;
}

document.getElementById("ano").textContent = new Date().getFullYear();
[["zap-topo", MENSAGENS.geral],
 ["zap-hero", "Olá! Vim pelo site da SR Phone e gostaria de saber valores e disponibilidade."],
 ["c-zap",    MENSAGENS.geral]].forEach(function(z){
  var a = document.getElementById(z[0]);
  if (a) a.href = zap(z[1]);
});
document.querySelectorAll("[data-endereco]").forEach(function(el){
  var e = enderecoLinhas();
  if (e.l1) el.textContent = [SC.endereco.split(",").slice(0, 2).join(","), SC.bairro].filter(Boolean).join(" · ");
  else el.textContent = cidadeUF();
});

document.querySelectorAll("[data-cidade]").forEach(function(el){
  var c = [SC.cidade, SC.estado].filter(Boolean).join(" · ");
  if (c) el.textContent = c;
});
(function(){
  var abertos = (SC.horarioFuncionamento || []).filter(function(d){ return !/fechad/i.test(d[1]); });
  preenche("hero-hora", abertos.map(function(d){ return d[0] + ", " + d[1]; }).join(" · "));
  if (!SC.endereco) document.getElementById("hero-end").hidden = true;
})();

/* cartões da seção Contato */
if (!SC.whatsappVisivel) document.getElementById("c-zap").hidden = true;
document.getElementById("c-zap-num").textContent = SC.whatsappVisivel || "";
if (SC.prazoResposta) document.getElementById("c-zap-prazo").textContent = SC.prazoResposta;
(function(){
  var insta = document.getElementById("c-insta");
  if (SC.instagram){ insta.href = linkInstagram(); document.getElementById("c-insta-user").textContent = "@" + String(SC.instagram).replace(/^@/, ""); }
  else insta.hidden = true;
  var mail = document.getElementById("c-email");
  if (mail){
    if (SC.email){ mail.href = "mailto:" + SC.email; document.getElementById("c-email-v").textContent = SC.email; mail.hidden = false; }
    else mail.hidden = true;
  }
  /* razão social e CNPJ: o cartão só aparece com pelo menos um dos dois preenchido */
  var empresa = document.getElementById("c-empresa");
  if (empresa && (SC.razaoSocial || SC.cnpj)){
    document.getElementById("c-empresa-nome").textContent = SC.razaoSocial || SC.nome || "";
    document.getElementById("c-empresa-cnpj").textContent = SC.cnpj ? "CNPJ " + SC.cnpj : "";
    empresa.hidden = false;
  }
  var tel = document.getElementById("c-tel");
  if (tel){
    if (SC.telefone){ tel.href = linkTelefone(SC.telefone); document.getElementById("c-tel-v").textContent = SC.telefone; tel.hidden = false; }
    else tel.hidden = true;
  }
})();

/* seminovos (CPO) no catálogo? Sem nenhum, o site não fala de seminovo (motivos, perguntas, termos e dados para o Google).
   Voltou a ter CPO em data/products.js, os textos voltam sozinhos. */
var TEM_SEMINOVOS = typeof CATALOGO !== "undefined" && Array.isArray(CATALOGO) && CATALOGO.some(eSeminovo);

/* ---------- textos fixos sobre nota fiscal: "em todas as vendas" só com novos E seminovos confirmados ----------
   O "npm run build" já grava o texto certo no HTML; aqui só acompanha a configuração. */
document.querySelectorAll("[data-nf-todas][data-nf-novos]").forEach(function(el){
  el.textContent = notaFiscalEmTodas() ? el.getAttribute("data-nf-todas") : el.getAttribute("data-nf-novos");
});

/* ---------- assistência técnica: só aparece quando a loja confirma o serviço ----------
   STORE_CONFIG.servicos.assistenciaTecnica = true (data/config.js). Desligado, nada aparece. */
function temAssistencia(){ return !!(SC.servicos && SC.servicos.assistenciaTecnica === true); }
(function(){
  if (!temAssistencia()) return;
  ["c-assist", "f-assist"].forEach(function(id){
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    var a = el.tagName === "A" ? el : el.querySelector("a");
    if (a) a.href = zap(MENSAGENS.assistencia);
  });
})();
document.addEventListener("click", function(e){
  var a = e.target.closest ? e.target.closest('[data-zap="assistencia"]') : null;
  if (a && window.medir) medir("service_click", { origem: a.id || "rodape", tipo: "assistencia" });
}, true);

/* ---------- rodapé ---------- */
(function(){
  var e = enderecoLinhas();
  preenche("f-empresa", SC.razaoSocial ? SC.razaoSocial + " (" + SC.nome + ")" : SC.nome);
  preenche("f-cnpj", SC.cnpj ? "CNPJ " + SC.cnpj : "");
  preenche("f-end", e.completo);
  preenche("f-tel", SC.telefone, linkTelefone(SC.telefone));
  preenche("f-zap", SC.whatsappVisivel ? "WhatsApp " + SC.whatsappVisivel : "", zap(MENSAGENS.geral));
  preenche("f-email", SC.email, SC.email ? "mailto:" + SC.email : "");
  preenche("f-insta", SC.instagram ? "@" + String(SC.instagram).replace(/^@/, "") : "", linkInstagram());
  var hora = document.getElementById("f-hora");
  var linhas = horarioTexto();
  if (hora){
    hora.hidden = !linhas.length;
    hora.innerHTML = linhas.map(function(l){ return '<span>' + esc(l) + '</span>'; }).join("");
  }
  var fim = document.getElementById("cnpj-out");
  if (fim && SC.cnpj) fim.textContent = " · CNPJ " + SC.cnpj;
})();

/* ---------- localização ---------- */
(function(){
  var e = enderecoLinhas();
  var buscaMapa = SC.endereco ? [SC.predio, e.completo].filter(Boolean).join(", ") : SC.nome + " " + cidadeUF();

  var end = document.getElementById("loc-end");
  if (SC.endereco){
    end.innerHTML = esc(e.l1) + '<span>' + esc(e.l2) + '</span>';
  } else {
    end.innerHTML = esc(cidadeUF() || "Macaé, RJ") +
      '<span>O endereço completo a gente passa no WhatsApp ao combinar a retirada.</span>';
  }
  if (SC.referencia){
    document.getElementById("loc-ref").hidden = false;
    document.getElementById("loc-ref-txt").textContent = SC.referencia;
  }
  var rota = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(buscaMapa);
  document.getElementById("loc-rota").href = rota;
  document.getElementById("loc-rota").dataset.mapa = "rota";
  document.getElementById("loc-zap").href = zap("Olá! Gostaria de saber como chegar à loja da SR Phone.");
  document.getElementById("ret-zap").href = zap("Olá! Gostaria de fechar uma compra e retirar na loja da SR Phone. Como funciona?");

  /* MAPA: só aparece com o link de incorporação do Google Maps. Vazio = o bloco some
     e o endereço e o horário ocupam o espaço, sem buraco na página. */
  var mapa = document.getElementById("mapa");
  var locIn = document.querySelector(".loc-in");
  var embedOk = typeof SC.mapaEmbed === "string" &&
    /^https:\/\/(www\.)?google\.com\/maps\/embed(\?|\/)/.test(SC.mapaEmbed);
  /* link errado em mapaEmbed: o mapa não aparece (o "npm run build" aponta o erro) */
  if (embedOk){
    /* "Visite a SR Phone": mapa, endereço e rota. O mapa do Google (pesado) só é
       criado quando a seção chega perto da tela; antes disso, nada é baixado. */
    mapa.hidden = false;
    mapa.innerHTML = '<div class="mapa-quadro" id="mapa-quadro"><span class="mapa-espera">Carregando o mapa…</span></div>' +
      '<figcaption class="mapa-leg"><span class="mapa-txt"><b>Visite a SR Phone</b>' +
      (e.l1 ? '<span>' + esc(e.l1) + (e.l2 ? ' · ' + esc(e.l2) : '') + '</span>' : '') + '</span>' +
      '<a class="btn btn-primary btn-sm" href="' + esc(rota) + '" target="_blank" rel="noopener noreferrer" data-mapa="rota-mapa">Traçar rota</a></figcaption>';
    var poeMapa = function(){
      var q = document.getElementById("mapa-quadro");
      if (!q || q.querySelector("iframe")) return;
      q.innerHTML = '<iframe src="' + esc(SC.mapaEmbed) + '" loading="lazy" title="Mapa com a localização da loja ' + esc(SC.nome) + '" ' +
        'referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups" allowfullscreen></iframe>';
    };
    if ("IntersectionObserver" in window){
      var ioMapa = new IntersectionObserver(function(en){
        if (en[0].isIntersecting){ poeMapa(); ioMapa.disconnect(); }
      }, { rootMargin: "400px 0px" });
      ioMapa.observe(mapa);
    } else poeMapa();
  } else {
    mapa.hidden = true;
    mapa.innerHTML = "";
    if (locIn) locIn.classList.add("sem-mapa");
  }

  var agora = new Date(), diaHoje = agora.getDay(), horaAgora = agora.getHours() + agora.getMinutes() / 60;
  var linhas = SC.horarioFuncionamento || [];
  document.getElementById("horarios").innerHTML = linhas.map(function(d){
    var ehHoje = d[2] && d[2].indexOf(diaHoje) > -1;
    var fechado = /fechad/i.test(d[1]);
    return '<li' + (ehHoje ? ' class="hoje"' : '') + '><b>' + esc(d[0]) + '</b>' +
      '<span class="' + (fechado ? 'fechado' : '') + '">' + esc(d[1]) + '</span></li>';
  }).join("");

  /* aberto agora? (relógio do aparelho da pessoa) */
  var selo = document.getElementById("status-loja");
  var hoje = linhas.filter(function(d){ return d[2] && d[2].indexOf(diaHoje) > -1; })[0];
  if (hoje){
    var aberto = hoje[3] !== null && horaAgora >= hoje[3] && horaAgora < hoje[4];
    selo.hidden = false;
    if (aberto){
      selo.className = "status aberto";
      selo.innerHTML = '<i></i>Aberto agora';
    } else {
      selo.className = "status fechado";
      var proximo = null;
      for (var k = 1; k <= 7 && !proximo; k++){
        var d2 = (diaHoje + (hoje[3] !== null && horaAgora < hoje[3] ? 0 : k)) % 7;
        var achou = linhas.filter(function(x){ return x[2] && x[2].indexOf(d2) > -1 && x[3] !== null; })[0];
        if (achou) proximo = { dia: d2, hora: achou[3] };
      }
      var NOMES = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
      var quando = proximo
        ? (proximo.dia === diaHoje && horaAgora < proximo.hora
            ? "abre às " + (proximo.hora < 10 ? "0" : "") + proximo.hora + "h"
            : "abre " + NOMES[proximo.dia] + " às " + (proximo.hora < 10 ? "0" : "") + proximo.hora + "h")
        : "";
      selo.innerHTML = '<i></i>Fechado' + (quando ? " · " + esc(quando) : "");
    }
  }
})();

/* medição: clique para ir até a loja (rota ou mapa) */
document.addEventListener("click", function(e){
  var a = e.target.closest ? e.target.closest("[data-mapa]") : null;
  if (a && window.medir) medir("click_map", { origem: a.dataset.mapa });
}, true);

/* ---------- barra fixa no celular ---------- */
(function(){
  var barra = document.getElementById("barra-fixa");
  if (!barra) return;
  document.getElementById("barra-zap").href = zap(MENSAGENS.geral);
  document.body.classList.add("com-barra");
  function ver(){
    /* some quando o rodapé aparece, para não cobrir os contatos */
    var rod = document.querySelector("footer");
    var perto = rod && rod.getBoundingClientRect().top < window.innerHeight + 40;
    barra.classList.toggle("on", window.scrollY > 420 && !perto);
  }
  ver(); window.addEventListener("scroll", ver, {passive:true});
  window.addEventListener("resize", ver);
})();

/* ---------- formas de pagamento no rodapé ---------- */
(function(){
  var bloco = document.getElementById("foot-pag");
  var ul = document.getElementById("pags");
  var nota = document.getElementById("pag-nota");
  if (!bloco || !ul) return;
  var lista = formasPagamento().concat(bandeirasCartao());
  if (!lista.length){ bloco.hidden = true; return; }

  ul.innerHTML = lista.map(function(p){
    return '<li class="pag' + (p.img ? ' com-img' : '') + '">' +
      (p.img
        ? '<img src="' + esc(caminhoSite(p.img)) + '" alt="' + esc(p.nome) + '" loading="lazy" decoding="async">'
        : '<span>' + esc(p.nome) + '</span>') +
      '</li>';
  }).join('');

  /* se o arquivo do logotipo não vier, volta a mostrar o nome escrito:
     nunca fica um quadrado branco vazio no rodapé */
  Array.prototype.forEach.call(ul.querySelectorAll("img"), function(im){
    im.addEventListener("error", function(){
      var li = im.parentNode;
      if (!li) return;
      li.classList.remove("com-img");
      li.innerHTML = '<span>' + esc(im.getAttribute("alt") || "") + '</span>';
    });
  });

  if (nota && observacaoPagamento()){
    nota.textContent = observacaoPagamento();
    nota.hidden = false;
  }
})();

/* cartão "Formas de pagamento" da seção Contato: a mesma lista do rodapé */
(function(){
  var card = document.getElementById("c-pag");
  var box = document.getElementById("c-pag-lista");
  if (!card || !box) return;
  var nomes = listaPagamentos();
  if (!nomes.length){ card.hidden = true; return; }
  box.innerHTML = nomes.map(function(n){ return '<span>' + esc(n) + '</span>'; }).join("");
  var nota = document.getElementById("c-pag-nota");
  if (nota && observacaoPagamento()){ nota.textContent = observacaoPagamento(); nota.hidden = false; }
})();

/* ---------- dados estruturados do negócio local (só o que é real e está no STORE_CONFIG) ---------- */
function pagamentosAceitos(){
  var c = cfgPagamento(), l = [];
  if (c.aceitaPix) l.push("Pix");
  if (c.aceitaCartao) l.push("Cartão de crédito");
  return l;
}
(function(){
  if (!SC.endereco) return;   /* sem endereço confirmado, não publica marcação */
  var base = String((typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.url) || "").replace(/\/+$/, "");
  var DIAS = {0:"Sunday",1:"Monday",2:"Tuesday",3:"Wednesday",4:"Thursday",5:"Friday",6:"Saturday"};
  var horarios = (SC.horarioFuncionamento || []).filter(function(d){ return d[3] !== null && d[3] !== undefined; })
    .map(function(d){
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: d[2].map(function(n){ return DIAS[n]; }),
        opens: (d[3] < 10 ? "0" : "") + d[3] + ":00",
        closes: (d[4] < 10 ? "0" : "") + d[4] + ":00"
      };
    });
  var dados = {
    "@context": "https://schema.org",
    "@type": "ElectronicsStore",
    name: SC.nome,
    description: "Loja física de produtos Apple em " + cidadeUF() + ": iPhone, iPad, Apple Watch, MacBook e AirPods novos e lacrados, " + (TEM_SEMINOVOS ? "iPhones seminovos " : "") + "e avaliação de iPhone usado na troca.",
    address: {
      "@type": "PostalAddress",
      streetAddress: SC.endereco,
      addressLocality: SC.cidade || undefined,
      addressRegion: SC.estado || undefined,
      postalCode: SC.cep || undefined,
      addressCountry: "BR"
    },
    areaServed: (SC.cidade || "Macaé") + " e região",
    openingHoursSpecification: horarios
  };
  if (base){ dados.url = base + "/"; dados.image = base + "/assets/hero-srphone.jpg"; dados.logo = base + "/assets/icons/icon-512.png"; }
  if (SC.predio) dados.address.streetAddress = SC.endereco + " (" + SC.predio + ")";
  if (pagamentosAceitos().length) dados.paymentAccepted = pagamentosAceitos().join(", ");
  var fone = soDigitos(SC.telefone) || soDigitos(SC.whatsapp);
  if (fone) dados.telephone = "+" + (fone.length <= 11 ? "55" + fone : fone);
  if (SC.email) dados.email = SC.email;
  if (SC.cnpj) dados.taxID = SC.cnpj;
  if (SC.razaoSocial) dados.legalName = SC.razaoSocial;
  var perfis = [linkInstagram(), linkGoogleAval(avalGoogle().link)].filter(Boolean);
  if (perfis.length) dados.sameAs = perfis;
  var s = document.createElement("script");
  s.type = "application/ld+json";
  s.id = "ld-loja";
  s.textContent = JSON.stringify(dados);
  document.head.appendChild(s);
})();

/* ---------- fotos da loja ---------- */
var FOTOS_LOJA = [
  { src:"assets/loja-foto-1.jpg", txt:"No balcão da loja, com a caixa lacrada" },
  { src:"assets/loja-foto-2.jpg", txt:"Aparelhos conferidos antes de sair" }
];
(function(){
  var caixa = document.getElementById("fotos-loja");
  var lbF = document.getElementById("foto-lb");
  var imgF = document.getElementById("foto-lb-img");
  if (!FOTOS_LOJA.length){ caixa.hidden = true; return; }
  caixa.innerHTML = FOTOS_LOJA.map(function(f, i){
    return '<button class="foto-loja" type="button" data-i="' + i + '" aria-label="Ampliar foto: ' + esc(f.txt) + '">' +
      '<img src="' + esc(caminhoSite(f.src)) + '" alt="" loading="lazy" decoding="async">' +
      '<span>' + esc(f.txt) + '</span></button>';
  }).join('');
  caixa.querySelectorAll(".foto-loja").forEach(function(b){
    b.addEventListener("click", function(){
      var f = FOTOS_LOJA[+b.dataset.i];
      imgF.src = caminhoSite(f.src); imgF.alt = f.txt;
      abreJanela(lbF, fecha, document.getElementById("foto-lb-close"));
    });
  });
  /* se a foto não carregar (arquivo que não subiu para o servidor), o bloco some
     em vez de deixar um retângulo preto quebrado no meio da página */
  caixa.querySelectorAll(".foto-loja img").forEach(function(im){
    im.addEventListener("error", function(){
      var b = im.parentNode;
      if (b && b.parentNode) b.parentNode.removeChild(b);
      if (!caixa.querySelector(".foto-loja")) caixa.hidden = true;
    });
  });
  function fecha(){ fechaJanela(lbF); imgF.removeAttribute("src"); imgF.alt = ""; }
  document.getElementById("foto-lb-close").addEventListener("click", fecha);
  lbF.addEventListener("click", function(e){ if (e.target === lbF) fecha(); });
})();

/* ---------- equipe: o cartão de uma pessoa (serve para qualquer item de EQUIPE) ---------- */
function slugNome(t){
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function iniciaisNome(t){
  return String(t || "").split(/\s+/).filter(function(w){ return w.length > 2; })
    .slice(0, 2).map(function(w){ return w.charAt(0); }).join("").toUpperCase();
}
function perfilEquipe(p){
  var id = "equipe-" + slugNome(p.nome);
  var alt = p.nome + (p.cargo ? ", " + p.cargo + " da SR Phone" : ", da equipe SR Phone");
  var foto = p.foto
    ? '<img src="' + esc(caminhoSite(p.foto)) + '" alt="' + esc(alt) + '" width="800" height="1000" loading="lazy" decoding="async"' +
      (p.enquadramento ? ' style="object-position:' + esc(p.enquadramento) + '"' : '') + '>'
    : '';
  var cargo = (p.cargo || p.selo)
    ? '<p class="perfil-cargo">' + (p.cargo ? '<b>' + esc(p.cargo) + '</b>' : '') +
      (p.selo ? '<span class="perfil-selo">' + esc(p.selo) + '</span>' : '') + '</p>'
    : '';
  var temas = (p.temas && p.temas.length)
    ? '<div class="perfil-temas"><span class="k" id="' + id + '-temas">Ajuda com</span><ul aria-labelledby="' + id + '-temas">' +
      p.temas.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var temZap = soDigitos(p.whatsapp || SC.whatsapp);
  var botao = (p.botao && temZap)
    ? '<div class="perfil-acao"><a class="btn btn-primary btn-lg" id="zap-' + id + '" data-pessoa="' + esc(p.nome) + '" href="' +
      esc(zap(p.mensagem || ("Olá! Vim pelo site da SR Phone e queria falar com " + p.nome + "."), p.whatsapp)) +
      '" target="_blank" rel="noopener noreferrer">' + ZAP_SVG + esc(p.botao) + '</a></div>'
    : '';
  return '<article class="perfil" id="' + id + '" aria-labelledby="' + id + '-nome">' +
    '<figure class="perfil-foto"><span class="perfil-mono" aria-hidden="true">' + esc(iniciaisNome(p.nome)) + '</span>' + foto + '</figure>' +
    '<div class="perfil-info">' +
      '<h3 class="perfil-nome" id="' + id + '-nome">' + esc(p.nome) + '</h3>' + cargo +
      (p.texto ? '<p class="perfil-txt">' + esc(p.texto) + '</p>' : '') + temas + botao +
    '</div></article>';
}
(function(){
  var sec = document.getElementById("equipe");
  var lista = document.getElementById("equipe-lista");
  if (!sec || !lista) return;
  var pessoas = EQUIPE.filter(function(p){ return p && p.nome; });
  if (!pessoas.length){ sec.hidden = true; return; }
  lista.innerHTML = pessoas.map(perfilEquipe).join("");
})();

/* ---------- avaliações do Google: só as reais (AVALIACOES_GOOGLE em data/config.js) ----------
   O texto de cada cliente entra exatamente como está no Google. Nada de Schema.org de nota
   aqui: o Google não aceita marcar na própria página avaliações copiadas de outro site. */
function avalGoogle(){ return (typeof AVALIACOES_GOOGLE !== "undefined" && AVALIACOES_GOOGLE) || {}; }
function linkGoogleAval(u){ return /^https:\/\//.test(String(u || "")) ? String(u) : ""; }
var G_SVG = '<svg viewBox="0 0 48 48" focusable="false">' +
  '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
  '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
  '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
  '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
var ESTRELAS_SVG = '<svg viewBox="0 0 120 24" focusable="false">' + [0, 1, 2, 3, 4].map(function(i){
  return '<path transform="translate(' + i * 24 + ' 0)" d="M12 2.4l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.2l-6 3.3 1.3-6.6-4.9-4.6 6.7-.8z"/>';
}).join("") + '</svg>';
/* estrelas desenhadas (não dependem da fonte). "rotulo" é o que o leitor de tela fala */
function estrelasAval(nota, rotulo){
  var pct = Math.round(Math.max(0, Math.min(5, nota)) / 5 * 1000) / 10;
  return '<span class="av-estrelas" role="img" aria-label="' + esc(rotulo) + '">' +
    '<span class="av-estrelas-base" aria-hidden="true">' + ESTRELAS_SVG + '</span>' +
    '<span class="av-estrelas-cheias" aria-hidden="true" style="width:' + pct + '%">' + ESTRELAS_SVG + '</span></span>';
}
function notaBR(n){ return (Math.round(n * 10) / 10).toFixed(1).replace(".", ","); }
(function(){
  var sec = document.getElementById("avaliacoes");
  if (!sec) return;
  var AVAL = avalGoogle();
  var lista = (Array.isArray(AVAL.lista) ? AVAL.lista : [])
    .filter(function(a){ return a && String(a.nome || "").trim() && String(a.texto || "").trim(); });
  var link = linkGoogleAval(AVAL.link);
  if (!lista.length && !link){ sec.hidden = true; return; }
  sec.hidden = false;

  /* resumo: nota, estrelas, Google e quantidade, do jeito que o Google mostra */
  var nota = +AVAL.nota, total = Math.floor(+AVAL.total);
  var temNota = nota >= 1 && nota <= 5, temTotal = total >= 1;
  document.getElementById("av-g").innerHTML = G_SVG;
  var elNota = document.getElementById("av-nota"), elEstrelas = document.getElementById("av-estrelas");
  elNota.hidden = elEstrelas.hidden = !temNota;
  if (temNota){
    elNota.textContent = notaBR(nota);
    elEstrelas.innerHTML = estrelasAval(nota, "Nota " + notaBR(nota) + " de 5 estrelas");
  }
  var elTotal = document.getElementById("av-total");
  elTotal.hidden = !temTotal;
  if (temTotal) elTotal.textContent = total.toLocaleString("pt-BR") + (total === 1 ? " avaliação" : " avaliações");
  var bGoogle = document.getElementById("av-google");
  bGoogle.hidden = !link;
  if (link) bGoogle.href = link;
  var avaliar = linkGoogleAval(AVAL.linkAvaliar), bAvaliar = document.getElementById("av-avaliar");
  bAvaliar.hidden = !avaliar;
  if (avaliar) bAvaliar.href = avaliar;

  /* a data relativa ("6 meses atrás") envelhece: só aparece até 30 dias depois de conferidoEm */
  var conferido = Date.parse(String(AVAL.conferidoEm || "") + "T12:00:00-03:00");
  var dataEmDia = !isNaN(conferido) && Date.now() - conferido <= 30 * 864e5;

  var ul = document.getElementById("av-lista");
  ul.hidden = !lista.length;
  if (!lista.length){
    document.getElementById("av-corpo").classList.add("sem-lista");
    document.getElementById("av-sub").textContent = "As avaliações dos clientes ficam no nosso perfil do Google.";
    return;
  }
  ul.innerHTML = lista.map(function(a){
    var n = Math.max(1, Math.min(5, Math.round(+a.nota || 5)));
    var inicial = (Array.from(String(a.nome).trim())[0] || "").toUpperCase();
    var data = dataEmDia && a.data ? '<span class="av-data"><span class="av-sep" aria-hidden="true"> · </span>' + esc(a.data) + '</span>' : '';
    return '<li class="av"><figure>' +
      '<div class="av-topo">' + estrelasAval(n, n + " de 5 estrelas") +
        '<span class="av-g" aria-hidden="true">' + G_SVG + '</span></div>' +
      '<blockquote>' + esc(a.texto) + '</blockquote>' +
      '<figcaption><span class="av-mono" aria-hidden="true">' + esc(inicial) + '</span>' +
        '<span class="av-quem"><b>' + esc(a.nome) + '</b><span>Avaliação no Google' + data + '</span></span>' +
      '</figcaption></figure></li>';
  }).join("");
})();

/* ---------- por que a SR Phone ---------- */
var MOTIVOS = [
  ["procedencia","Aparelhos com procedência","Novos e lacrados, na caixa original" + (TEM_SEMINOVOS ? ", e seminovos CPO identificados no catálogo" : "") + ". Você confere o aparelho, o IMEI e o número de série antes de sair com ele."],
  /* nota fiscal e garantia: novos e seminovos separados (data/config.js). Nada é prometido sem confirmação */
  ["nota", notaFiscalEmTodas() ? "Nota fiscal em todas as vendas" : "Nota fiscal nos aparelhos novos",
   notaFiscalEmTodas() ? "Compra registrada, do jeito certo. A nota é o que garante seu direito na assistência e na troca."
   : SC.notaFiscalNovos === true ? "Compra de aparelho novo registrada, do jeito certo." +
       (TEM_SEMINOVOS ? " Nos seminovos (CPO), " + TXT_NF_CONSULTE.charAt(0).toLowerCase() + TXT_NF_CONSULTE.slice(1) : "") : ""],
  ["garantia", "Garantia", (textoGarantia() || TEM_SEMINOVOS) ?
   (textoGarantia() ? (TEM_SEMINOVOS ? "Nos aparelhos novos: " : "") + frase(textoGarantia()) + " " : "") +
   (TEM_SEMINOVOS ? "Nos seminovos (CPO): " + frase(String(SC.garantiaSeminovos || "").trim() || TXT_GARANTIA_SEMINOVO) + " " : "") +
   "Qualquer dúvida depois da compra, você continua falando com a gente." : ""],
  ["atendimento","Atendimento personalizado","Nada de robô. Você fala com alguém da loja, que ajuda você a escolher o modelo certo para o seu uso e o seu bolso."],
  ["avaliacao","Avaliação do seu iPhone","Seu iPhone atual vira desconto no próximo. A gente avalia com transparência e diz exatamente quanto abate. Na troca, trabalhamos só com iPhone."],
  ["local","Loja em " + (cidadeUF() || "Macaé, RJ"),"Loja física, com endereço e gente para olhar no olho. Dá para retirar pessoalmente ou combinar a entrega na região."]
];
var ICOS = {
  procedencia:'<path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
  nota:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  garantia:'<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 21l5-2.5L17 21l-1.5-7"/>',
  atendimento:'<path d="M21 12a9 9 0 1 0-3.2 6.9L21 21z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  avaliacao:'<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
  local:'<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'
};
document.getElementById("why").innerHTML = MOTIVOS.filter(function(m){ return m[2]; }).map(function(m){
  return '<div class="why-card"><div class="why-ico"><svg viewBox="0 0 24 24" aria-hidden="true">'+ICOS[m[0]]+'</svg></div>'+
    '<h3>'+esc(m[1])+'</h3><p>'+esc(m[2])+'</p></div>';
}).join('');

/* ---------- FAQ ---------- */
var PERGUNTAS = [
  ["Os aparelhos são originais?","Sim. Trabalhamos com aparelhos Apple novos e lacrados" + (TEM_SEMINOVOS ? (SC.notaFiscalNovos === true ? ", com nota fiscal," : "") +
    " e com alguns iPhones seminovos selecionados (CPO), que aparecem identificados no catálogo. Nos seminovos, a condição é conferida no atendimento." : (SC.notaFiscalNovos === true ? ", com nota fiscal." : ".")) +
    " Antes de fechar, você confere o aparelho, o IMEI e o número de série."],
  ["Como funciona dar o usado na troca?","Aceitamos somente iPhone como entrada, de qualquer geração. Você diz qual aparelho quer e qual iPhone vai entregar. A gente faz uma estimativa pelo WhatsApp e confirma o valor final quando vê o aparelho, checando estado, bateria e se o iCloud está liberado. O valor é abatido e você paga só a diferença. Android, iPad e Apple Watch não entram na troca."],
  ["Quais são as formas de pagamento?", listaPagamentos().length ? juntaLista(listaPagamentos()) + ". " + observacaoPagamento() : ""],
  ["Como fica a garantia?", (textoGarantia() || TEM_SEMINOVOS) ?
    (textoGarantia() ? (TEM_SEMINOVOS ? "Nos aparelhos novos: " : "") + frase(textoGarantia()) + (SC.notaFiscalNovos === true ? " A nota fiscal é o seu comprovante: guarde-a bem." : "") + " " : "") +
    (TEM_SEMINOVOS ? "Nos seminovos (CPO): " + frase(String(SC.garantiaSeminovos || "").trim() || TXT_GARANTIA_SEMINOVO) +
      (SC.notaFiscalSeminovos === true ? "" : " " + TXT_NF_CONSULTE) + " " : "") +
    "Qualquer dúvida depois da compra, pode falar com a loja." : ""],
  ["Vocês entregam ou só retirada?","Os dois. Você pode retirar pessoalmente na loja" + (SC.cidade ? " em " + SC.cidade : "") + " ou combinar a entrega na cidade e região. O prazo a gente confirma no atendimento."],
  ["Se o modelo que eu quero não estiver na loja?","A gente encomenda. Chame no WhatsApp com o modelo, a capacidade e a cor que você quer, que informamos o prazo e o valor."]
];
document.getElementById("faq").innerHTML = PERGUNTAS.filter(function(q){ return q[1]; }).map(function(q,i){
  return '<details class="qa"'+(i===0?' open':'')+'><summary>'+esc(q[0])+'</summary><p>'+esc(q[1].trim())+'</p></details>';
}).join('');

/* ---------- vídeos da loja ---------- */
var VIDEOS = [
  { t:"Por dentro da loja", s:"Aparelhos Apple novos e lacrados, com nota fiscal.", d:"0:28", poster:"assets/capa-loja.jpg", src:"assets/loja.mp4" },
  { t:"Aparelhos na loja", s:"iPhones lacrados, em várias cores e capacidades.", d:"0:32", poster:"assets/capa-estoque.jpg", src:"assets/estoque.mp4" },
  { t:"Formas de pagar", s:"Cartão, parcelamento e condições combinadas na hora.", d:"0:26", poster:"assets/capa-pagamento.jpg", src:"assets/pagamento.mp4" },
  { t:"Hora do upgrade", s:"Seu aparelho atual vira entrada no próximo.", d:"0:44", poster:"assets/capa-upgrade.jpg", src:"assets/upgrade.mp4" }
];
var reels = document.getElementById("reels");
var lb = document.getElementById("lb");
var lbVideo = document.getElementById("lb-video");

VIDEOS.forEach(function(v,i){
  var b = document.createElement("button");
  b.className = "reel"; b.type = "button"; b.id = "reel-"+i;
  b.setAttribute("aria-label", "Assistir: " + v.t);
  b.innerHTML =
    '<img src="'+esc(caminhoSite(v.poster))+'" alt="Cena do vídeo: '+esc(v.t)+'" loading="lazy" decoding="async">'+
    '<span class="reel-dur">'+esc(v.d)+'</span>'+
    '<span class="reel-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>'+
    '<span class="reel-txt"><b>'+esc(v.t)+'</b><span>'+esc(v.s)+'</span></span>';
  b.addEventListener("click", function(){ abrirVideo(v); });
  reels.appendChild(b);
});

var lbFalha = document.getElementById("lb-falha");
function abrirVideo(v){
  lbFalha.hidden = true; lbVideo.hidden = false;
  lbVideo.src = caminhoSite(v.src); lbVideo.poster = caminhoSite(v.poster);
  lbVideo.load();
  abreJanela(lb, fecharVideo, document.getElementById("lb-close"));
  var p = lbVideo.play(); if (p && p.catch) p.catch(function(){});
}
lbVideo.addEventListener("error", function(){
  if (lb.hidden || !lbVideo.getAttribute("src")) return;
  lbVideo.hidden = true; lbFalha.hidden = false;
});
function fecharVideo(){
  lbVideo.pause(); lbVideo.removeAttribute("src"); lbVideo.load();
  fechaJanela(lb);
}
document.getElementById("lb-close").addEventListener("click", fecharVideo);
lb.addEventListener("click", function(e){ if (e.target===lb) fecharVideo(); });

/* ---------- modais de política e termos ---------- */
var modal = document.getElementById("modal");
var TEXTOS = {
  priv: ["Política de privacidade",
    function(){
      var loja = esc(SC.razaoSocial ? SC.razaoSocial + " (" + SC.nome + ")" : SC.nome) + (SC.cnpj ? ", CNPJ " + esc(SC.cnpj) : "");
      var p = [];
      p.push("<p>Esta política explica, de forma simples, quais dados o site da " + loja + " trata e por quê, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). O site é uma vitrine: não tem cadastro de clientes, carrinho nem pagamento on-line.</p>");
      p.push("<h4>Pedido de horário</h4>" + (agendaOnline
        ? "<p>Ao tocar em <b>Reservar esse horário</b>, o nome, o WhatsApp, o assunto, o dia e a hora que você informou são gravados na agenda da loja (serviço Supabase), só para a loja confirmar e realizar o atendimento. Outros visitantes enxergam apenas quais horários estão ocupados, nunca o nome, o telefone ou o assunto de ninguém. Só a equipe da loja, com login, lê esses dados. Pedidos antigos podem ser apagados pela loja depois do atendimento.</p>"
        : "<p>Hoje o pedido de horário é feito pelo WhatsApp: o site só monta a mensagem, e nada do que você digita é gravado em servidor.</p>"));
      p.push("<h4>WhatsApp</h4><p>Os botões do WhatsApp apenas abrem a conversa com a loja com uma mensagem já escrita. Ela só é enviada quando você toca em enviar, e a conversa segue as regras de privacidade do próprio WhatsApp.</p>");
      p.push("<h4>Simulador de troca, busca e formulários</h4><p>O simulador de troca, a busca e as escolhas de cor e armazenamento funcionam só no seu navegador. Nada disso é enviado para a loja, a não ser o que você decidir mandar pelo WhatsApp.</p>");
      if (document.getElementById("sra")) p.push("<h4>Assistente SR Phone</h4><p>O assistente virtual responde com as informações do site. Para as perguntas abertas, ele usa um serviço de inteligência artificial: a sua pergunta, as últimas mensagens da conversa e o produto que está aberto na página vão para a função do site que gera a resposta, e dela para o provedor de IA (Anthropic). O site não guarda essas conversas em servidor. Não escreva no chat dados pessoais, senhas ou documentos. A conversa fica só nesta aba do navegador e some quando você fecha a aba ou toca em \"Limpar conversa\". A loja só recebe o que você decidir mandar pelo botão do WhatsApp, com o resumo que você vê antes de enviar. O assistente também guarda neste aparelho se o mascote está minimizado.</p>");
      if (window.SREntrega) p.push("<h4>Calculadora de entrega</h4><p>Para calcular a entrega, o site precisa saber para onde entregar. A localização do aparelho só é pedida quando você toca em <b>Usar minha localização</b>, e o navegador pergunta antes; se preferir, digite o endereço. O ponto e o endereço vão para a função do site que calcula a rota, e dela para o Google Maps Platform (rota, endereços e mapa). O site não guarda a sua localização nem o seu endereço: eles ficam só na tela aberta e somem ao fechar ou recarregar a página. A medição de visitas conta apenas que um cálculo foi feito, nunca o local. A loja só recebe o endereço e o ponto no mapa se você escolher a entrega e enviar a mensagem pelo WhatsApp.</p>");
      p.push("<h4>Cookies e armazenamento no navegador</h4>" + (window.__srGA
        ? "<p>Usamos o Google Analytics 4 para contar visitas e cliques de forma agregada (por exemplo, quantas pessoas abriram um produto ou tocaram no WhatsApp). Ele grava cookies de medição no seu navegador e não recebe o seu nome, telefone nem o que você digita nos campos. Não usamos cookies de publicidade.</p>"
        : "<p>O site não usa cookies de rastreamento nem de publicidade.</p>") +
        "<p>A área da equipe (login dos funcionários) guarda a sessão de acesso no armazenamento do navegador (sessionStorage), apagada ao fechar a aba. O assistente guarda só as duas preferências descritas acima, sem nenhum dado pessoal.</p>");
      p.push("<h4>Serviços de terceiros</h4><p>As fontes do site são carregadas do Google Fonts" +
        (SC.mapaEmbed ? ", o mapa vem do Google Maps (carregado só quando você chega na seção)" : "") +
        (window.SREntrega ? ", o mapa da calculadora de entrega vem do Google Maps (carregado só quando você abre a calculadora)" : "") +
        " e o modelo 3D, quando existe, de um servidor público (jsDelivr). Esses serviços recebem dados técnicos da conexão, como o endereço IP, como acontece em qualquer site.</p>");
      p.push("<h4>Seus direitos</h4><p>Você pode pedir para ver, corrigir ou apagar os dados que enviou no pedido de horário, ou tirar qualquer dúvida sobre privacidade, falando com a loja pelo WhatsApp" +
        (SC.whatsappVisivel ? " " + esc(SC.whatsappVisivel) : "") + (SC.email ? " ou pelo e-mail " + esc(SC.email) : "") + ".</p>");
      return p.join("");
    }],
  term: ["Termos de uso",
    function(){ return "" +
    "<p>As informações deste site (modelos, capacidades, condições e disponibilidade) são apresentadas para consulta e podem mudar sem aviso. O valor, o prazo e as condições de cada compra são confirmados no atendimento pelo WhatsApp.</p>" +
    "<p>O simulador de troca desta página gera apenas uma mensagem para iniciar a conversa. Ele não calcula, não estima e não garante nenhum valor de entrada: a avaliação do aparelho usado é feita pela loja.</p>" +
    (agendaOnline
      ? "<p>Ao pedir um horário pelo site, ele fica reservado para você e deixa de aparecer para outros clientes. " +
        "A loja confirma pelo WhatsApp e, se não puder atender, cancela a reserva ou propõe outro horário.</p>"
      : "") +
    "<p>A SR Phone é uma revenda independente e não possui vínculo, representação ou autorização oficial da Apple Inc. Apple, iPhone, iPad e Apple Watch são marcas da Apple Inc., citadas aqui apenas para identificar os produtos comercializados.</p>" +
    "<p>A garantia dos aparelhos novos é a do fabricante, nos termos e prazos definidos por ele.</p>" +
    (TEM_SEMINOVOS ? "<p>Aparelhos seminovos (identificados como CPO / seminovo selecionado) não são novos: procedência, estado, saúde da bateria, acessórios e garantia são informados pela loja no atendimento, antes da compra. A sigla CPO não indica, por si só, recondicionamento oficial da Apple.</p>" : "") +
    "<p>Os preços, quando aparecem, valem para o momento da consulta. Produto sem preço no site tem o valor informado no atendimento.</p>"; }]
};
function abrirModal(k){
  document.getElementById("modal-t").textContent = TEXTOS[k][0];
  var corpo = TEXTOS[k][1];
  document.getElementById("modal-c").innerHTML = (typeof corpo === "function") ? corpo() : corpo;
  abreJanela(modal, fecharModal, document.getElementById("modal-close"));
}
function fecharModal(){ fechaJanela(modal); }
document.getElementById("open-priv").addEventListener("click", function(){ abrirModal("priv"); });
document.getElementById("open-term").addEventListener("click", function(){ abrirModal("term"); });
document.getElementById("modal-close").addEventListener("click", fecharModal);
modal.addEventListener("click", function(e){ if (e.target===modal) fecharModal(); });

/* Esc fecha o menu do celular (as janelas fecham pela regra comum, em js/core.js) */
document.addEventListener("keydown", function(e){
  if (e.key !== "Escape" || janelaAberta()) return;
  if (topbar.classList.contains("open")){
    topbar.classList.remove("open");
    burger.setAttribute("aria-expanded","false");
    burger.focus();
  }
});
