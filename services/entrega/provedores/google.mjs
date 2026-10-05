// SR Phone · entrega pelo Google Maps Platform (só no servidor, com a chave MAPS_SERVER_KEY).
//   Routes API      → rota de carro da loja até o cliente (distância, tempo e o desenho da rota)
//   Places API (New)→ sugestões de endereço enquanto a pessoa digita e o ponto do endereço escolhido
//   Geocoding API   → endereço digitado por partes (ou CEP) → ponto; ponto → endereço (localização)
// A Map Tiles API (desenho do mapa) NÃO passa por aqui: o navegador usa a MAPS_BROWSER_KEY,
// restrita ao domínio do site e só a essa API (js/entrega-app.js).
// Todo provedor tem as mesmas funções (veja services/entrega/provedores/index.mjs).
const TEMPO_MS = 8000;

function erro(codigo, status){ const e = new Error("google_" + codigo + (status ? "_" + status : "")); e.codigo = codigo; return e; }
function erroHttp(status){
  return erro(status === 401 || status === 403 ? "chave_invalida" : status === 429 ? "limite" : status === 400 ? "pedido" : "indisponivel", status);
}
/* Geocoding API responde 200 com o problema no "status" */
function erroGeocoding(status){
  return erro(status === "REQUEST_DENIED" ? "chave_invalida" : status === "OVER_QUERY_LIMIT" || status === "OVER_DAILY_LIMIT" ? "limite" : status === "INVALID_REQUEST" ? "pedido" : "indisponivel", status);
}

/* rota do Google (polilinha codificada, precisão 5) → [[lat, lng], ...] */
export function decodificaPolilinha(txt){
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < txt.length){
    for (const eixo of [0, 1]){
      let b, desloc = 0, r = 0;
      do { b = txt.charCodeAt(i++) - 63; r |= (b & 0x1f) << desloc; desloc += 5; } while (b >= 0x20 && i <= txt.length);
      const d = (r & 1) ? ~(r >> 1) : (r >> 1);
      if (eixo === 0) lat += d; else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

export function criarGoogle({ chave, buscar = fetch }){
  async function pede(url, init = {}){
    let r;
    try { r = await buscar(url, { ...init, signal: AbortSignal.timeout(TEMPO_MS) }); }
    catch (e){ throw erro(e && e.name === "TimeoutError" ? "tempo" : "indisponivel"); }
    if (!r.ok) throw erroHttp(r.status);
    try { return await r.json(); } catch { throw erro("indisponivel"); }
  }
  const cab = (mascara) => ({ "Content-Type": "application/json", "X-Goog-Api-Key": chave, ...(mascara ? { "X-Goog-FieldMask": mascara } : {}) });

  return {
    nome: "google",

    /* sugestões de endereço (Places Autocomplete New), perto da loja, só no Brasil */
    async sugestoes({ texto, sessao, perto }){
      const j = await pede("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: cab("suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"),
        body: JSON.stringify({ input: texto, sessionToken: sessao, languageCode: "pt-BR", regionCode: "br", includedRegionCodes: ["br"],
          locationBias: { circle: { center: { latitude: perto.lat, longitude: perto.lng }, radius: 40000 } } })
      });
      return (j.suggestions || []).map((s) => s.placePrediction).filter((p) => p && p.placeId).slice(0, 5).map((p) => ({
        id: p.placeId,
        principal: (p.structuredFormat && p.structuredFormat.mainText && p.structuredFormat.mainText.text) || (p.text && p.text.text) || "",
        secundario: (p.structuredFormat && p.structuredFormat.secondaryText && p.structuredFormat.secondaryText.text) || ""
      }));
    },

    /* o ponto do endereço escolhido na lista (Place Details New, só local e endereço) */
    async lugar({ id, sessao }){
      const u = new URL("https://places.googleapis.com/v1/places/" + encodeURIComponent(id));
      u.searchParams.set("languageCode", "pt-BR"); u.searchParams.set("regionCode", "br");
      if (sessao) u.searchParams.set("sessionToken", sessao);
      const j = await pede(u, { headers: cab("location,formattedAddress") });
      if (!j.location) return null;
      return { lat: j.location.latitude, lng: j.location.longitude, endereco: j.formattedAddress || "" };
    },

    /* endereço escrito → ponto (Geocoding) */
    async geocodificar(texto){
      const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      u.searchParams.set("address", texto); u.searchParams.set("components", "country:BR");
      u.searchParams.set("language", "pt-BR"); u.searchParams.set("region", "br"); u.searchParams.set("key", chave);
      const j = await pede(u);
      if (j.status === "ZERO_RESULTS") return null;
      if (j.status !== "OK") throw erroGeocoding(j.status);
      const r = j.results[0];
      return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, endereco: r.formatted_address || "",
        preciso: /ROOFTOP|RANGE_INTERPOLATED/.test(r.geometry.location_type || "") };
    },

    /* ponto → endereço (para mostrar onde o pino está) */
    async reverso({ lat, lng }){
      const u = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      u.searchParams.set("latlng", lat + "," + lng); u.searchParams.set("language", "pt-BR");
      u.searchParams.set("result_type", "street_address|premise|subpremise|route"); u.searchParams.set("key", chave);
      const j = await pede(u);
      if (j.status === "ZERO_RESULTS") return null;
      if (j.status !== "OK") throw erroGeocoding(j.status);
      return { endereco: j.results[0].formatted_address || "" };
    },

    /* rota de carro pelas ruas (Routes API): metros, segundos e o desenho */
    async rota({ origem, destino, transito }){
      const ponto = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
      const j = await pede("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: cab("routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"),
        body: JSON.stringify({ origin: ponto(origem), destination: ponto(destino), travelMode: "DRIVE",
          routingPreference: transito ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE", computeAlternativeRoutes: false,
          languageCode: "pt-BR", regionCode: "BR", units: "METRIC" })
      });
      const r = (j.routes || [])[0];
      if (!r) return null;
      /* o Google omite distanceMeters quando é 0 (mesmo lugar) */
      return { metros: Number(r.distanceMeters) || 0, segundos: parseInt(String(r.duration || "0").replace("s", ""), 10) || 0,
        pontos: r.polyline && r.polyline.encodedPolyline ? decodificaPolilinha(r.polyline.encodedPolyline) : [] };
    }
  };
}
