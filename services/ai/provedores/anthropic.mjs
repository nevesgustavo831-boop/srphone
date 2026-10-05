// SR Phone · provedor de IA: Claude, da Anthropic (SDK oficial @anthropic-ai/sdk).
// Todo provedor tem a mesma cara: responder({ sistema, mensagens, cfg, sinal }) é um gerador que
// entrega { tipo: "texto", texto } enquanto a resposta chega e, no fim, { tipo: "fim", motivo }.
// Erros saem com .codigo: "chave_invalida", "limite", "tempo", "indisponivel", "pedido", "cancelado",
// "modelo_invalido".
import Anthropic from "@anthropic-ai/sdk";

/* ---------- os modelos que o projeto aceita (fonte única) ----------
   Conferido em 30/09/2026 na documentação oficial da Anthropic: tabela "Model status" de
   platform.claude.com/docs/en/about-claude/model-deprecations (todos "Active"), a página de cada modelo
   (platform.claude.com/docs/en/models/<modelo>/overview) e o SDK oficial instalado (@anthropic-ai/sdk 0.129.0).
   Modelo fora desta lista não é usado.
     esforco = níveis de "effort" que a página oficial de effort (.../build-with-claude/effort) lista para
               o modelo. Vazio = a página do modelo diz "Default effort: Not supported": nada é enviado.
     reserva = reserva automática no servidor (fallbacks "default", beta server-side-fallback-2026-07-01).
               Só onde a página oficial (.../build-with-claude/refusals-and-fallback) cita o modelo; nos
               outros o parâmetro não é enviado.
   Fora da lista, por decisão da loja: claude-fable-5-1, claude-opus-5-5 e claude-sonnet-5-5.
   Fora também: os modelos só do Project Glasswing (Mythos), os descontinuados e os aposentados.
   Quando a Anthropic lançar ou aposentar um modelo: confira na documentação e ajuste uma linha aqui. */
const TODOS = ["low", "medium", "high", "xhigh", "max"];
export const MODELOS = {
  "claude-sonnet-5":            { esforco: TODOS, reserva: false },
  "claude-sonnet-4-6":          { esforco: ["low", "medium", "high", "max"], reserva: false },
  "claude-sonnet-4-5":          { esforco: [], reserva: false },
  "claude-sonnet-4-5-20250929": { esforco: [], reserva: false },
  "claude-haiku-4-5":           { esforco: [], reserva: false },
  "claude-haiku-4-5-20251001":  { esforco: [], reserva: false },
  "claude-fable-5":             { esforco: TODOS, reserva: true },
  "claude-opus-5":              { esforco: TODOS, reserva: true },
  "claude-opus-4-8":            { esforco: TODOS, reserva: false },
  "claude-opus-4-7":            { esforco: TODOS, reserva: false },
  "claude-opus-4-6":            { esforco: ["low", "medium", "high", "max"], reserva: false },
  "claude-opus-4-5":            { esforco: ["low", "medium", "high"], reserva: false },
  "claude-opus-4-5-20251101":   { esforco: ["low", "medium", "high"], reserva: false }
};

/* O modelo padrão (AI_MODEL vazio): Claude Sonnet 5 (claude-sonnet-5; "Active (legacy)", aposentadoria
   não antes de 30/06/2027). Preço oficial por milhão de tokens: US$ 2 entrada / US$ 10 saída.
   O raciocínio (adaptive thinking) vem ligado por padrão e o projeto não mexe nele; o esforço "low"
   a documentação indica para chat ("Suitable for chat"). Mais barato: AI_MODEL=claude-haiku-4-5 (US$ 1 / US$ 5). */
export const MODELO_PADRAO = "claude-sonnet-5";
export const modeloValido = (m) => Object.prototype.hasOwnProperty.call(MODELOS, String(m || ""));
/* o "effort" só vai quando o modelo aceita aquele nível; senão fica o padrão do próprio modelo */
export const aceitaEsforco = (m, nivel) => modeloValido(m) && MODELOS[m].esforco.includes(nivel);
export const aceitaReserva = (m) => modeloValido(m) && MODELOS[m].reserva;

function traduzErro(e){
  const codigo =
    e instanceof Anthropic.APIUserAbortError ? "cancelado" :
    e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? "chave_invalida" :
    e instanceof Anthropic.RateLimitError ? "limite" :
    e instanceof Anthropic.APIConnectionTimeoutError ? "tempo" :
    e instanceof Anthropic.NotFoundError ? "modelo_invalido" :                /* o ID de AI_MODEL não existe */
    e instanceof Anthropic.BadRequestError ? "pedido" :
    "indisponivel";
  const erro = new Error("anthropic_" + codigo + (e && e.status ? "_" + e.status : ""));
  erro.codigo = codigo;
  return erro;
}

/* AI_MODEL vazio → o padrão. AI_MODEL fora da lista oficial → o padrão (e avisa no registro da função).
   Modelo da lista que a API passe a recusar (404, ex.: aposentado) → tenta uma vez com o padrão, antes
   de qualquer texto chegar, para o chat não parar por um erro de configuração. */
export async function* responder(args){
  const pedido = args.cfg.modelo || "";
  let modelo = pedido || MODELO_PADRAO;
  if (pedido && !modeloValido(pedido)){
    console.error(JSON.stringify({ assistente: "aviso", codigo: "modelo_invalido", usando: MODELO_PADRAO }));
    modelo = MODELO_PADRAO;
  }
  let respondeu = false;
  try {
    for await (const ev of chama(args, modelo)){ respondeu = true; yield ev; }
  } catch (e){
    if (e.codigo !== "modelo_invalido" || respondeu || modelo === MODELO_PADRAO) throw e;
    console.error(JSON.stringify({ assistente: "aviso", codigo: "modelo_invalido", usando: MODELO_PADRAO }));
    yield* chama(args, MODELO_PADRAO);
  }
}

async function* chama({ sistema, mensagens, cfg, sinal }, modelo){
  const cliente = new Anthropic({ apiKey: cfg.chave, timeout: cfg.timeoutMs, maxRetries: 1, ...(cfg.fetch ? { fetch: cfg.fetch } : {}) });
  const pedido = {
    model: modelo,
    max_tokens: cfg.maxTokens,
    /* as instruções e os dados da loja não mudam de uma pergunta para outra: ficam em cache (mais barato e rápido) */
    system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
    messages: mensagens
  };
  if (cfg.esforco && aceitaEsforco(modelo, cfg.esforco)) pedido.output_config = { effort: cfg.esforco };
  let fluxo;
  try {
    fluxo = aceitaReserva(modelo)
      ? cliente.beta.messages.stream({ ...pedido, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, { signal: sinal })
      : cliente.messages.stream(pedido, { signal: sinal });
    for await (const ev of fluxo){
      if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") yield { tipo: "texto", texto: ev.delta.text };
    }
    const final = await fluxo.finalMessage();
    const uso = final.usage || {};
    yield { tipo: "fim", motivo: final.stop_reason, modelo: final.model,
      uso: { entrada: uso.input_tokens, saida: uso.output_tokens, cache: uso.cache_read_input_tokens } };
  } catch (e){
    throw traduzErro(e);
  }
}
