// SR Phone · provedores de mapa e rota. Qual usar: MAPS_PROVIDER (padrão: google).
// Para trocar (ex.: Mapbox ou HERE), crie services/entrega/provedores/<nome>.mjs com as mesmas
// funções de google.mjs (sugestoes, lugar, geocodificar, reverso, rota) e registre aqui.
// O mapa do navegador (js/entrega-app.js) também precisa saber desenhar os blocos do novo provedor.
import { criarGoogle } from "./google.mjs";

const PROVEDORES = { google: criarGoogle };

export function obterProvedorMapa(nome, opcoes){
  const criar = PROVEDORES[String(nome || "google").toLowerCase()];
  if (!criar){ const e = new Error("provedor_desconhecido:" + nome); e.codigo = "pedido"; throw e; }
  return criar(opcoes);
}
