// SR Phone · função do Netlify: pedido de horário do cliente, em /api/agendamento.
// O trabalho todo está em services/agenda/index.mjs. A chave secreta do Supabase
// (SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY) e o segredo do Turnstile (TURNSTILE_SECRET_KEY)
// ficam SÓ nas variáveis de ambiente do Netlify. Veja SEGURANCA-E-PAINEL-FUNCIONARIO.md.
import { atenderAgendamento } from "../../services/agenda/index.mjs";

export default async (req, context) => atenderAgendamento(req, { ip: context && context.ip });

export const config = {
  path: "/api/agendamento",
  /* limite do próprio Netlify por visitante (IP) e domínio, que vale para todas as cópias da função.
     Uma pessoa pede um horário por vez; 6 por minuto já é folga. O banco ainda limita por origem,
     por WhatsApp e no total. */
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
