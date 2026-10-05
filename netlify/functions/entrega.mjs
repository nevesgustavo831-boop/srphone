// SR Phone · função do Netlify: cálculo de entrega (rota, distância, tempo e valor), em /api/entrega.
// O trabalho todo está em services/entrega/. Os valores (taxa, valor por km, mínimo e limite) ficam
// em data/config.js > DELIVERY_CONFIG. As chaves ficam nas variáveis de ambiente do Netlify:
// MAPS_SERVER_KEY (obrigatória, só do servidor) e MAPS_BROWSER_KEY (desenho do mapa). Veja PRODUCAO-SRPHONE.md.
import { atenderEntrega } from "../../services/entrega/index.mjs";

export default async (req, context) => atenderEntrega(req, { ip: context && context.ip });

export const config = {
  path: "/api/entrega",
  /* limite do próprio Netlify por visitante (IP) e domínio: as sugestões de endereço pedem
     várias vezes enquanto a pessoa digita, por isso o número é maior que o do assistente */
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
