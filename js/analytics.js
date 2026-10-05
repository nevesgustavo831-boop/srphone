/* SR Phone · medição (Google Analytics 4)
   Desligada até existir um ID real em GA_MEASUREMENT_ID (data/config.js).
   Sem ID nada é baixado e medir() não faz nada.
   Eventos usados no site:
     view_item (abriu um produto) · select_item (tocou no card de um produto)
     whatsapp_click (qualquer botão do WhatsApp, com origem e tipo)
     trade_in_start / trade_in_submit (troca) · service_click (assistência técnica)
     schedule_start (começou a agendar) · schedule_complete (horário reservado de verdade)
     search_product · filter_product · select_product_option · select_product_color
     click_map · open_unboxing · complete_unboxing · click_team_contact
   Só vão nome do evento e dados do produto/ação. Nunca nome, telefone,
   e-mail ou o conteúdo digitado nos formulários. */
(function(){
  window.medir = function(){};               /* sem GA: medir() existe e não faz nada (nunca dá erro) */
  var ID = String(typeof GA_MEASUREMENT_ID === "string" ? GA_MEASUREMENT_ID : "").trim();
  if (!/^G-[A-Z0-9]{4,}$/i.test(ID)) return;
  if (window.__srGA) return;                 /* nunca carrega o script duas vezes */
  window.__srGA = true;
  /* o script do Google só baixa depois que a página carregou (não disputa com a primeira tela);
     os eventos ficam na fila (dataLayer) até ele chegar */
  function baixa(){
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ID);
    s.id = "sr-gtag";
    document.head.appendChild(s);
  }
  function quandoOcioso(){ if (window.requestIdleCallback) requestIdleCallback(baixa, { timeout: 3000 }); else setTimeout(baixa, 1); }
  if (document.readyState === "complete") quandoOcioso();
  else window.addEventListener("load", quandoOcioso, { once: true });
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  gtag("js", new Date());
  gtag("config", ID, { anonymize_ip: true });
  var PERMITIDOS = ["item_id", "item_name", "item_category", "item_variant", "item_list_name", "origem", "tipo",
                    "categoria", "search_term", "pessoa", "motivo", "modo", "etapa"];
  var PERMITIDOS_ITEM = ["item_id", "item_name", "item_category", "item_variant"];
  window.medir = function(evento, dados){
    var limpo = {};
    PERMITIDOS.forEach(function(k){
      if (dados && dados[k] !== undefined && dados[k] !== null && dados[k] !== "") limpo[k] = String(dados[k]).slice(0, 80);
    });
    /* comércio (view_item, select_item): lista de produtos no formato do GA4, em reais */
    if (dados && Array.isArray(dados.items)){
      var total = 0;
      limpo.items = dados.items.slice(0, 10).map(function(it){
        var i = {};
        PERMITIDOS_ITEM.forEach(function(k){ if (it && it[k]) i[k] = String(it[k]).slice(0, 80); });
        if (it && Number(it.price) > 0){ i.price = Number(it.price); total += i.price; }
        return i;
      });
      limpo.currency = "BRL";
      if (total > 0) limpo.value = total;
    }
    gtag("event", evento, limpo);
  };
})();
