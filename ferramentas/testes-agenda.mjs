// npm run test:agenda (também roda no npm test)
// Testes da função do servidor do pedido de horário (services/agenda/index.mjs), sem rede:
// o banco e a Cloudflare são simulados. Confere validação, anti-robô, limites, a chave secreta
// (nunca devolvida) e as mensagens (nunca detalhe técnico do banco).
import { atenderAgendamento, validarPedido, tipoChaveServidor, resumoDoIp } from "../services/agenda/index.mjs";

const falhas = [], ok = [];
const confere = (c, t) => (c ? ok : falhas).push(t);
const SECRETA = "sb_" + "secret_teste_unitario_0123456789abcdef";   /* falsa */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT_SERVICO = `${b64({ alg: "HS256" })}.${b64({ role: "service_role" })}.assinatura`;
const JWT_ANON = `${b64({ alg: "HS256" })}.${b64({ role: "anon" })}.assinatura`;
const ORIGEM = "https://www.srphone.test";
const dia = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
const PEDIDO = { data: dia, hora: "10:00", servico: "Comprar um aparelho", nome: "Ana Souza", telefone: "(22) 99999-0001", aparelho: "iPhone 13 <b>128</b> GB" };
const cfgBase = (extra = {}) => ({ url: "https://abcd.supabase.co", chave: SECRETA, turnstile: "", porMinuto: 100, porHora: 1000, origens: [], local: false, ...extra });
function pedido(corpo, { origem = ORIGEM, tipo = "application/json", metodo = "POST", bruto } = {}){
  const h = { "Content-Type": tipo };
  if (origem) h.Origin = origem;
  return new Request(ORIGEM + "/api/agendamento", { method: metodo, headers: h, body: metodo === "GET" ? undefined : (bruto !== undefined ? bruto : JSON.stringify(corpo)) });
}
/* banco e Cloudflare de mentira: guarda o que chegou e responde o combinado */
function simulador(respostaBanco = { status: 200, json: "id-1" }, respostaRobo = { success: true, action: "agendamento" }){
  const chamadas = [];
  const buscar = async (url, op = {}) => {
    chamadas.push({ url: String(url), op, corpo: op.body instanceof URLSearchParams ? Object.fromEntries(op.body) : (op.body ? JSON.parse(op.body) : null) });
    if (/siteverify/.test(url)){ if (respostaRobo === "fora") throw new Error("rede"); return new Response(JSON.stringify(respostaRobo)); }
    return new Response(JSON.stringify(respostaBanco.json), { status: respostaBanco.status });
  };
  return { buscar, chamadas };
}
async function chama(corpo, { cfg = cfgBase(), sim = simulador(), ...op } = {}){
  const r = await atenderAgendamento(pedido(corpo, op), { cfg, ip: op.ip || "200.10.20.30", buscar: sim.buscar });
  const texto = await r.text();
  let j = null; try { j = JSON.parse(texto); } catch {}
  return { status: r.status, j, texto, sim };
}
/* o registro (console) nunca leva nome, telefone, IP ou chave */
const registros = [];
const erroOriginal = console.error;
console.error = (...a) => registros.push(a.join(" "));

try {
  // ---------- validação ----------
  const v = validarPedido(PEDIDO);
  confere(v.telefone === "(22) 99999-0001" && v.nome === "Ana Souza" && /^iPhone 13 .*128.* GB$/.test(v.aparelho) && !/[<>]/.test(v.aparelho), "validação: pedido bom passa, aparelho sem HTML");
  confere(validarPedido({ ...PEDIDO, telefone: "+55 22 99999-0001" }).telefone === "(22) 99999-0001", "validação: aceita +55 e formata o WhatsApp");
  confere(validarPedido({ ...PEDIDO, telefone: "22 89999-0001" }).erro === "telefone_invalido", "validação: celular de 11 dígitos sem o 9 recusado");
  confere(validarPedido({ ...PEDIDO, telefone: "123" }).erro === "telefone_invalido", "validação: telefone curto recusado");
  confere(validarPedido({ ...PEDIDO, nome: "Ana 2" }).erro === "nome_invalido" && validarPedido({ ...PEDIDO, nome: "A" }).erro === "nome_invalido", "validação: nome com número ou curto recusado");
  confere(validarPedido({ ...PEDIDO, nome: "Zé" }).nome === "Zé", "validação: nome com acento vale");
  confere(validarPedido({ ...PEDIDO, nome: "<script>x</script>" }).erro === "nome_invalido" || !/[<>]/.test(validarPedido({ ...PEDIDO, nome: "<script>x</script>" }).nome || ""), "validação: HTML no nome não passa adiante");
  confere(validarPedido({ ...PEDIDO, hora: "25:00" }).erro === "hora_invalida" && validarPedido({ ...PEDIDO, data: "ontem" }).erro === "invalido", "validação: data e hora inválidas recusadas");
  confere(validarPedido([]).erro === "invalido" && validarPedido(null).erro === "invalido", "validação: corpo que não é objeto recusado");

  // ---------- tipo de chave ----------
  confere(tipoChaveServidor(SECRETA) === "secreta" && tipoChaveServidor(JWT_SERVICO) === "service_role" && tipoChaveServidor(JWT_ANON) === "publica"
    && tipoChaveServidor("sb_publishable_abc") === "publica" && tipoChaveServidor("") === "", "chave: reconhece secreta, service_role e pública");

  // ---------- portas de entrada ----------
  confere((await chama(PEDIDO, { metodo: "GET" })).status === 405, "função: GET recusado (405)");
  confere((await chama(PEDIDO, { origem: "" })).status === 403, "função: sem Origin (robô fora do navegador) recusado (403)");
  confere((await chama(PEDIDO, { origem: "https://site-pirata.test" })).status === 403, "função: outro site recusado (403)");
  confere((await chama(PEDIDO, { tipo: "text/plain" })).status === 415, "função: corpo que não é JSON recusado (415)");
  confere((await chama(null, { bruto: "{" + "x".repeat(5000) })).status === 413, "função: corpo grande demais recusado (413)");
  confere((await chama(null, { bruto: "{quebrado" })).j.erro === "invalido", "função: JSON quebrado recusado");
  {
    const r = await chama({ ...PEDIDO, site: "http://spam.test" });
    confere(r.j.erro === "invalido" && !r.sim.chamadas.length, "função: campo invisível preenchido (robô) não chega ao banco");
  }

  // ---------- sem chave ou com a chave errada: não grava, o site vai para o WhatsApp ----------
  {
    const r1 = await chama(PEDIDO, { cfg: cfgBase({ chave: "" }) });
    const r2 = await chama(PEDIDO, { cfg: cfgBase({ chave: "sb_publishable_abcdefghij" }) });
    const r3 = await chama(PEDIDO, { cfg: cfgBase({ url: "http://abcd.supabase.co" }) });
    confere(r1.status === 503 && r1.j.erro === "indisponivel" && !r1.sim.chamadas.length && r2.j.erro === "indisponivel" && !r2.sim.chamadas.length && r3.j.erro === "indisponivel",
      "função: sem chave secreta, com a chave pública ou com endereço sem https → 'indisponivel', sem chamar o banco");
  }

  // ---------- pedido aceito ----------
  {
    const r = await chama(PEDIDO);
    const c = r.sim.chamadas[0];
    confere(r.status === 200 && r.j.ok === true && c.url === "https://abcd.supabase.co/rest/v1/rpc/criar_agendamento", "função: pedido aceito chama criar_agendamento");
    confere(c.op.headers.apikey === SECRETA && !c.op.headers.Authorization, "função: chave sb_secret vai só no apikey (nunca como Bearer)");
    confere(/^[a-f0-9]{32}$/.test(c.corpo.p_origem) && c.corpo.p_origem === resumoDoIp(SECRETA, "200.10.20.30") && !JSON.stringify(c.corpo).includes("200.10.20.30"),
      "função: o banco recebe só o resumo (HMAC) do IP, nunca o IP");
    confere(Object.keys(c.corpo).sort().join() === "p_aparelho,p_data,p_hora,p_nome,p_origem,p_servico,p_telefone", "função: manda só os campos do pedido");
    confere(!r.texto.includes(SECRETA) && !r.texto.includes("id-1"), "função: a resposta não traz a chave nem o id do banco");
    const r2 = await chama(PEDIDO, { cfg: cfgBase({ chave: JWT_SERVICO }) });
    confere(r2.sim.chamadas[0].op.headers.Authorization === "Bearer " + JWT_SERVICO && !r2.texto.includes(JWT_SERVICO), "função: chave service_role antiga vai também como Bearer (e nunca volta na resposta)");
  }

  // ---------- erros do banco: código curto conhecido ou 'indisponivel' (nada técnico) ----------
  for (const [msg, status] of [["horario_ocupado", 409], ["dia_bloqueado", 409], ["muitas_tentativas", 429], ["pedido_duplicado", 409]]){
    const r = await chama(PEDIDO, { sim: simulador({ status: 400, json: { code: "P0001", message: msg, details: null } }) });
    confere(r.status === status && r.j.erro === msg, `função: banco recusou com ${msg} → ${status} e o mesmo código`);
  }
  {
    const r = await chama(PEDIDO, { sim: simulador({ status: 404, json: { code: "42P01", message: 'relation "public.agendamentos" does not exist', hint: "x" } }) });
    confere(r.status === 503 && r.j.erro === "indisponivel" && !/relation|public\.|42P01|does not exist/.test(r.texto), "função: erro técnico do banco vira 'indisponivel', sem detalhe para o cliente");
  }

  // ---------- anti-robô (Cloudflare Turnstile) ----------
  {
    const cfg = cfgBase({ turnstile: "segredo-turnstile-teste" });
    const sem = await chama(PEDIDO, { cfg });
    confere(sem.status === 403 && sem.j.erro === "robo" && !sem.sim.chamadas.length, "Turnstile ligado: sem o token, recusado sem chamar a Cloudflare nem o banco");
    const bom = await chama({ ...PEDIDO, turnstile: "token-do-navegador" }, { cfg });
    const verif = bom.sim.chamadas[0];
    confere(bom.j.ok === true && /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/.test(verif.url) && verif.corpo.secret === "segredo-turnstile-teste"
      && verif.corpo.response === "token-do-navegador" && verif.corpo.remoteip === "200.10.20.30" && /criar_agendamento/.test(bom.sim.chamadas[1].url),
      "Turnstile ligado: o servidor confere o token com a Cloudflare (segredo + token + IP) antes do banco");
    confere(!bom.texto.includes("segredo-turnstile-teste"), "Turnstile: o segredo nunca volta na resposta");
    const ruim = await chama({ ...PEDIDO, turnstile: "falso" }, { cfg, sim: simulador(undefined, { success: false, "error-codes": ["invalid-input-response"] }) });
    confere(ruim.j.erro === "robo" && ruim.sim.chamadas.length === 1, "Turnstile: token recusado pela Cloudflare → 'robo', banco não é chamado");
    const outraAcao = await chama({ ...PEDIDO, turnstile: "t" }, { cfg, sim: simulador(undefined, { success: true, action: "login" }) });
    confere(outraAcao.j.erro === "robo", "Turnstile: token de outro formulário (action diferente) não vale");
    const fora = await chama({ ...PEDIDO, turnstile: "t" }, { cfg, sim: simulador(undefined, "fora") });
    confere(fora.j.erro === "indisponivel", "Turnstile: Cloudflare fora do ar → 'indisponivel' (o site oferece o WhatsApp)");
  }

  // ---------- limite por visitante ----------
  {
    const cfg = cfgBase({ porMinuto: 2, porHora: 10 });
    const rs = [];
    for (let i = 0; i < 4; i++) rs.push((await chama(PEDIDO, { cfg, ip: "177.1.1.1" })).j);
    const outro = (await chama(PEDIDO, { cfg, ip: "177.1.1.2" })).j;
    confere(rs.filter((j) => j.ok).length === 2 && rs.slice(2).every((j) => j.erro === "limite") && outro.ok === true, "limite: 2 por minuto por visitante; outro visitante continua podendo pedir");
  }

  const tudo = registros.join("\n");
  confere(!/Ana Souza|99999-0001|200\.10\.20\.30|177\.1\.1|sb_secret|segredo-turnstile/.test(tudo), "registro do servidor: só códigos (sem nome, telefone, IP ou chave)");
} finally {
  console.error = erroOriginal;
}

console.log(`\nSR Phone · função de agendamento (services/agenda): ${ok.length} ok, ${falhas.length} falha(s)`);
for (const f of falhas) console.log("  FALHOU: " + f);
if (falhas.length) process.exit(1);
console.log("TESTES DA FUNÇÃO DE AGENDAMENTO: TUDO OK\n");
