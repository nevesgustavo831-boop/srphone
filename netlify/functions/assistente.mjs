// SR Phone · função do Netlify: o Assistente SR Phone com IA, em /api/assistente.
// O trabalho todo está em services/ai/ (dados da loja, instruções, guarda de preços, provedor).
// Configuração: variáveis de ambiente no painel do Netlify (Site configuration > Environment
// variables). A única obrigatória é AI_API_KEY. Veja .env.example e ASSISTENTE-SRPHONE-FINAL.md.
import { atender } from "../../services/ai/index.mjs";

export default async (req, context) => atender(req, { ip: context && context.ip });

export const config = {
  path: "/api/assistente",
  /* limite do próprio Netlify, por visitante (IP) e por domínio: 20 perguntas por minuto.
     Acima disso o Netlify responde 429 e o site usa o cérebro local. */
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
