// npm run test:entrega (também roda dentro do npm test) → confere o cálculo de entrega do lado do
// servidor, SEM chamar o Google de verdade e sem chave: um provedor falso (ferramentas/entrega-falsa.mjs)
// e respostas simuladas das APIs do Google.
// Confere: a regra de preço (taxa + km, mínimo, limite), a configuração central, o pedido do navegador
// (nada dele é confiável), a rota pelas ruas, fora da área, falhas sem preço inventado, limites,
// a chave que nunca vai para o navegador e o registro sem endereço nem ponto.
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./ler-dados.mjs";
import { avaliarDados, ARQUIVOS } from "../services/dados-site.mjs";
import { atenderEntrega, validarPedido, configDoAmbiente, kmEmLinhaReta, sessaoPermite } from "../services/entrega/index.mjs";
import { criarGoogle, decodificaPolilinha } from "../services/entrega/provedores/google.mjs";
import { obterProvedorMapa } from "../services/entrega/provedores/index.mjs";
import { buscaCep } from "../services/entrega/cep.mjs";
import { criarFalso, LOJA_TESTE, LUGARES_TESTE } from "./entrega-falsa.mjs";
import * as funcao from "../netlify/functions/entrega.mjs";

const ok = [], falhas = [];
function confere(cond, texto){ (cond ? ok : falhas).push(texto); }
/* a função registra só { entrega, erro }; guardamos para conferir que não vaza endereço nem ponto */
const registros = [];
const erroOriginal = console.error;
console.error = (...a) => { registros.push(a.map(String).join(" ")); };

const textos = Object.fromEntries(ARQUIVOS.map((f) => [f, fs.readFileSync(path.join(RAIZ, f), "utf8")]));
const D = avaliarDados(textos);
const E = D.DELIVERY_CONFIG;
const BASE = "http://127.0.0.1:9";
const cfg = (x = {}) => Object.assign({ provedor: "falso", chave: "", chaveNavegador: "chave-navegador-teste", porMinuto: 300, porHora: 5000, origens: [] }, x);
const pedido = (corpo, extra = {}) => new Request(BASE + "/api/entrega", { method: extra.method || "POST",
  headers: Object.assign({ "content-type": "application/json", origin: BASE }, extra.headers || {}),
  body: extra.method === "GET" ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
let ipN = 0;
async function chama(corpo, o = {}){
  const r = await atenderEntrega(pedido(corpo, o), { cfg: o.cfg || cfg(), provedor: o.provedor === undefined ? criarFalso(o.falso) : o.provedor,
    ip: o.ip || "10.0.0." + (++ipN), lerDados: o.lerDados || (async () => D), buscar: o.buscar });
  return { status: r.status, j: await r.json().catch(() => null), cab: r.headers };
}
const lugar = (id) => LUGARES_TESTE.find((l) => l.id === "teste-lugar-" + id);
/* a regra escrita de novo aqui, de propósito, para conferir a do site */
const esperado = (km) => Math.max(E.minimumFee, Math.round((E.baseFee + km * E.pricePerKm) * 100) / 100);

// ---------- 1. a configuração central e a regra de preço ----------
{
  confere(E && ["baseFee", "pricePerKm", "minimumFee", "maximumDistanceKm"].every((k) => typeof E[k] === "number"),
    "configuração: DELIVERY_CONFIG em data/config.js tem taxa, valor por km, mínimo e limite (números)");
  confere(E.endpoint === "/api/entrega" && !Object.keys(E).some((k) => /key|chave|token|secret/i.test(k)), "configuração: DELIVERY_CONFIG só tem o endereço da função, nenhuma chave");
  const r = D.calcularEntrega(6.4);
  confere(r && r.km === 6.4 && r.valor === esperado(6.4) && !r.foraDaArea, `preço: 6,4 km = taxa + km × valor por km (R$ ${esperado(6.4).toFixed(2)})`);
  confere(D.calcularEntrega(0.3).valor === E.minimumFee, "preço: perto demais vale o valor mínimo");
  confere(D.calcularEntrega(E.maximumDistanceKm).valor === esperado(E.maximumDistanceKm) && !D.calcularEntrega(E.maximumDistanceKm).foraDaArea, "preço: exatamente no limite ainda tem valor automático");
  const fora = D.calcularEntrega(E.maximumDistanceKm + 0.1);
  confere(fora.foraDaArea === true && fora.valor === null, "preço: acima do limite, sem valor automático");
  confere(D.calcularEntrega(-1) === null && D.calcularEntrega("abc") === null && D.calcularEntrega(NaN) === null, "preço: distância inválida não vira valor");
  confere(D.kmEntrega(6430) === 6.4 && D.kmEntrega(6450) === 6.5 && D.kmEntrega(-5) === null, "preço: metros da rota viram km com uma casa");
  /* mudar em data/config.js muda o cálculo (o site e o servidor usam o mesmo arquivo) */
  const outro = avaliarDados({ ...textos, "data/config.js": textos["data/config.js"].replace(/baseFee:\s*[\d.]+/, "baseFee: 10").replace(/pricePerKm:\s*[\d.]+/, "pricePerKm: 2") });
  confere(outro.calcularEntrega(5).valor === 20, "configuração: trocar baseFee e pricePerKm em data/config.js muda o valor (10 + 5 × 2 = 20)");
  const site = fs.readFileSync(path.join(RAIZ, "js/entrega-app.js"), "utf8");
  confere(!/baseFee|pricePerKm|minimumFee|calcularEntrega|ARREDONDA_ENTREGA/.test(site), "navegador: a tela da entrega não calcula preço (o valor vem do servidor)");
  /* arredondamento: R$ 16,63 antes de arredondar (taxa 7,03 + 6,4 km × 1,50) */
  const comRegra = (regra) => avaliarDados({ ...textos, "data/config.js": textos["data/config.js"].replace(/baseFee:\s*[\d.]+/, "baseFee: 7.03").replace(/roundingMode:\s*"[^"]*"/, `roundingMode: "${regra}"`) });
  const regras = { "centavos": 16.63, "dez-centavos": 16.6, "dez-centavos-acima": 16.7, "cinquenta-centavos-acima": 17, "final-90": 16.9 };
  confere(Object.entries(regras).every(([r, v]) => comRegra(r).calcularEntrega(6.4).valor === v),
    "arredondamento: R$ 16,63 vira 16,63 (centavos), 16,60, 16,70, 17,00 ou 16,90, conforme DELIVERY_CONFIG.roundingMode");
  confere(E.roundingMode === "centavos" && D.calcularEntrega(6.4).valor === 16.6, "arredondamento: o padrão é o valor normal, com duas casas");
  confere(comRegra("final-90").calcularEntrega(0.3).valor === E.minimumFee, "arredondamento: o valor mínimo continua valendo depois do arredondamento");
  confere(Object.keys(D.ARREDONDA_ENTREGA).sort().join() === Object.keys(regras).sort().join(), "arredondamento: as regras documentadas são exatamente as que existem");
}

// ---------- 2. o pedido do navegador: nada dele é confiável ----------
{
  confere(validarPedido({ acao: "apagar" }).erro === "invalido" && validarPedido(null).erro === "invalido", "pedido: ação desconhecida é recusada");
  confere(validarPedido({ acao: "sugestoes", texto: "ab" }).erro === "invalido", "pedido: sugestão com menos de 3 letras é recusada");
  confere(validarPedido({ acao: "sugestoes", texto: "Rua A", sessao: "<script>" }).erro === "invalido", "pedido: sessão com caracteres estranhos é recusada");
  confere(validarPedido({ acao: "lugar", id: "../../x" }).erro === "invalido", "pedido: id de lugar estranho é recusado");
  confere(validarPedido({ acao: "endereco", bairro: "Centro" }).erro === "invalido", "pedido: endereço sem rua e sem CEP é recusado");
  confere(validarPedido({ acao: "endereco", cep: "123" }).erro === "invalido", "pedido: CEP com menos de 8 números é recusado");
  confere(validarPedido({ acao: "rota", lat: 40.7, lng: -74 }).erro === "invalido", "pedido: ponto fora do Brasil é recusado");
  confere(validarPedido({ acao: "rota", lat: "abc", lng: 1 }).erro === "invalido", "pedido: coordenada que não é número é recusada");
  const p = validarPedido({ acao: "rota", lat: "-22.38", lng: "-41.78", valor: 1, preco: 0 });
  confere(p.ponto && p.ponto.lat === -22.38 && !("valor" in p) && !("preco" in p), "pedido: valor ou preço mandado pelo navegador é ignorado");
  const e = validarPedido({ acao: "endereco", rua: "Rua\u0000\u202E  A " + "x".repeat(200), cep: "27920-325" });
  confere(!/[\u0000\u202E]/.test(e.rua) && e.rua.startsWith("Rua A") && e.rua.length <= 90 && e.cep === "27920325", "pedido: endereço é limpo (sem caracteres de controle) e cortado");
}

// ---------- 3. a função: método, origem, formato e tamanho ----------
{
  let r = await chama({}, { method: "GET" });
  confere(r.status === 405, "função: só aceita POST");
  r = await chama({ acao: "inicio" }, { headers: { origin: "https://site-estranho.com" } });
  confere(r.status === 403, "função: outro site não pode usar");
  const semOrigem = await atenderEntrega(new Request(BASE + "/api/entrega", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acao: "inicio" }) }),
    { cfg: cfg(), provedor: criarFalso(), ip: "10.7.7.7", lerDados: async () => D });
  confere(semOrigem.status === 403, "função: pedido sem \"Origin\" (script, não navegador) é recusado");
  r = await chama({ acao: "inicio" }, { headers: { origin: "https://parceiro.com.br" }, cfg: cfg({ origens: ["https://parceiro.com.br"] }) });
  confere(r.status === 200 && r.j.ok, "função: endereço liberado em MAPS_ORIGENS pode usar");
  r = await chama({ acao: "inicio" }, { headers: { "content-type": "text/plain" } });
  confere(r.status === 415, "função: só aceita JSON");
  r = await chama({ acao: "sugestoes", texto: "x".repeat(5000) });
  confere(r.status === 413, "função: pedido grande demais é recusado");
  r = await chama("{quebrado");
  confere(r.status === 400 && r.j.erro === "invalido", "função: JSON quebrado é recusado");
  confere(funcao.config && funcao.config.path === "/api/entrega" && funcao.config.rateLimit && typeof funcao.default === "function",
    "função: netlify/functions/entrega.mjs responde em /api/entrega, com limite do Netlify por IP");
  confere(r.cab.get("cache-control") === "no-store", "função: respostas não ficam guardadas em cache");
}

// ---------- 4. sem chave, sem valor inventado ----------
{
  const r = await chama({ acao: "rota", lat: -22.38, lng: -41.78 }, { provedor: null, cfg: cfg({ chave: "" }) });
  confere(r.j && r.j.ok === false && r.j.erro === "sem_chave" && r.j.valor === undefined, "sem MAPS_SERVER_KEY: responde sem_chave e nenhum valor");
  const c = configDoAmbiente({ MAPS_SERVER_KEY: " k1 ", MAPS_BROWSER_KEY: "k2", ENTREGA_LIMITE_MINUTO: "9999" });
  confere(c.chave === "k1" && c.chaveNavegador === "k2" && c.porMinuto === 300 && c.provedor === "google", "configuração do servidor: MAPS_SERVER_KEY e MAPS_BROWSER_KEY separadas, limites absurdos segurados");
  confere(configDoAmbiente({ MAPS_API_KEY: "antiga" }).chave === "antiga" && configDoAmbiente({ MAPS_SERVER_KEY: "nova", MAPS_API_KEY: "antiga" }).chave === "nova",
    "compatibilidade: o nome antigo MAPS_API_KEY ainda funciona (MAPS_SERVER_KEY tem prioridade)");
  let erro = "";
  try { obterProvedorMapa("inexistente", { chave: "x" }); } catch (e){ erro = String(e.message || e); }
  confere(!!erro, "provedor: nome desconhecido em MAPS_PROVIDER dá erro claro");
}

// ---------- 5. início: a loja (ponto A) e o mapa ----------
{
  const f = criarFalso();
  let r = await chama({ acao: "inicio" }, { provedor: f });
  confere(r.j.ok && r.j.origem.lat === LOJA_TESTE.lat && /Atlântica, 386/.test(r.j.origem.endereco) && /Sala 211|Praia Campista/.test(r.j.origem.endereco),
    "início: a loja é o ponto A, com o endereço oficial de data/config.js (Av. Atlântica, 386, Praia Campista)");
  confere(r.j.origem.nome === "SR Phone Macaé" && /Av\. Atlântica, 386, Sala 211 - Praia Campista, Macaé - RJ, 27920-325/.test(r.j.origem.endereco),
    "início: nome e endereço da origem vêm só de STORE_CONFIG (SR Phone Macaé · Av. Atlântica, 386, Sala 211 · Praia Campista · Macaé - RJ · 27920-325)");
  confere(r.j.mapa && r.j.mapa.chave === "chave-navegador-teste" && Object.keys(r.j.mapa).sort().join() === "chave,tipo", "início: devolve SÓ a chave do navegador (a sessão dos blocos o navegador cria com ela)");
  r = await chama({ acao: "inicio" }, { cfg: cfg({ chaveNavegador: "" }) });
  confere(r.j.ok && r.j.mapa === null, "início: sem MAPS_BROWSER_KEY, o cálculo funciona sem o desenho do mapa");
  r = await chama({ acao: "inicio" }, { lerDados: async () => Object.assign(Object.create(D), { DELIVERY_CONFIG: { ...E, ligada: false } }) });
  confere(r.j.ok === false && r.j.erro === "desligada", "início: DELIVERY_CONFIG.ligada = false desliga a função também");
  const comPonto = Object.assign(Object.create(D), { DELIVERY_CONFIG: { ...E, origem: { nome: "SR Phone Macaé", lat: -22.39, lng: -41.79 } } });
  const f2 = criarFalso();
  r = await chama({ acao: "inicio" }, { provedor: f2, lerDados: async () => comPonto });
  confere(r.j.origem.lat === -22.39 && !f2.chamadas.includes("geocodificar"), "início: com lat e lng em DELIVERY_CONFIG.origem, usa o ponto fixo (sem procurar no mapa)");
}

// ---------- 5b. a chave do SERVIDOR nunca sai da função (nem em erro) ----------
{
  const SEGREDO = "chave-servidor-SEGREDO-123456";
  const cs = cfg({ chave: SEGREDO });
  const pedidos = [{ acao: "inicio" }, { acao: "sugestoes", texto: "Rua Teste" }, { acao: "lugar", id: lugar("centro").id },
    { acao: "endereco", rua: "Rua Teste do Centro" }, { acao: "reverso", lat: lugar("centro").lat, lng: lugar("centro").lng },
    { acao: "rota", lat: lugar("centro").lat, lng: lugar("centro").lng }, { acao: "rota", lat: lugar("campos").lat, lng: lugar("campos").lng }];
  let textos = "";
  for (const corpo of pedidos){
    /* o provedor falso, e o do Google de verdade com o Google recusando ou com a rede caindo
       (o erro da rede traz o endereço pedido, que tem a chave: ele não pode vazar) */
    const provedores = [criarFalso(), criarFalso({ falha: "chave_invalida", tudo: true }),
      criarGoogle({ chave: SEGREDO, buscar: async () => new Response("{}", { status: 403 }) }),
      criarGoogle({ chave: SEGREDO, buscar: async (u) => { throw new TypeError("falhou " + String(u)); } })];
    for (const prov of provedores){
      const r = await atenderEntrega(pedido(corpo), { cfg: cs, provedor: prov, ip: "10.3.3." + (++ipN % 200),
        lerDados: async () => Object.assign(Object.create(D), { DELIVERY_CONFIG: { ...E, origem: { nome: "SR Phone Macaé", lat: -22.39, lng: -41.79 } } }) });
      textos += await r.text();
    }
  }
  confere(!textos.includes(SEGREDO) && !registros.some((l) => l.includes(SEGREDO)), "segurança: MAPS_SERVER_KEY nunca aparece em resposta (nem de erro) nem no registro");
}

// ---------- 6. endereço: sugestões, escolha, por partes, CEP e localização ----------
{
  let r = await chama({ acao: "sugestoes", texto: "Rua Teste", sessao: "sessao-abc-123" });
  confere(r.j.ok && r.j.sugestoes.length === LUGARES_TESTE.length && r.j.sugestoes[0].id && r.j.sugestoes[0].principal, "endereço: sugestões enquanto digita");
  r = await chama({ acao: "lugar", id: lugar("cavaleiros").id, sessao: "sessao-abc-123" });
  confere(r.j.ok && r.j.local.lat === lugar("cavaleiros").lat && /Cavaleiros/.test(r.j.local.endereco), "endereço: a sugestão escolhida vira um ponto no mapa");
  r = await chama({ acao: "lugar", id: "teste-lugar-nao-existe" });
  confere(r.j.ok === false && r.j.erro === "nao_encontrado", "endereço: lugar que não existe → nao_encontrado");
  r = await chama({ acao: "endereco", rua: "Rua Teste do Centro", numero: "45", bairro: "Centro", cidade: "Macaé" });
  confere(r.j.ok && r.j.local.lat === lugar("centro").lat, "endereço: rua, número, bairro e cidade viram um ponto");
  const viaCep = async (u) => String(u).includes("27920325")
    ? new Response(JSON.stringify({ cep: "27920-325", logradouro: "Rua Teste do Centro", bairro: "Centro", localidade: "Macaé", uf: "RJ" }), { status: 200 })
    : new Response(JSON.stringify({ erro: true }), { status: 200 });
  r = await chama({ acao: "endereco", cep: "27920-325" }, { buscar: viaCep });
  confere(r.j.ok && r.j.local.lat === lugar("centro").lat, "endereço: só o CEP completa rua, bairro e cidade (ViaCEP) e acha o ponto");
  r = await chama({ acao: "endereco", cep: "00000-000" }, { buscar: viaCep });
  confere(r.j.ok === false && r.j.erro === "nao_encontrado", "endereço: CEP inexistente → nao_encontrado");
  confere((await buscaCep("123", viaCep)) === null, "CEP: CEP incompleto nem é consultado");
  r = await chama({ acao: "reverso", lat: lugar("cavaleiros").lat, lng: lugar("cavaleiros").lng });
  confere(r.j.ok && /Cavaleiros/.test(r.j.endereco), "localização: o ponto do celular vira o endereço mostrado na tela");
  r = await chama({ acao: "reverso", lat: -3.1, lng: -60.0 });
  confere(r.j.ok === false && r.j.erro === "longe", "localização: ponto a centenas de km da loja nem é consultado");
}

// ---------- 7. a rota pelas ruas, a distância, o tempo e o valor ----------
{
  const c = lugar("cavaleiros"), f = criarFalso();
  const r = await chama({ acao: "rota", lat: c.lat, lng: c.lng }, { provedor: f });
  const reta = kmEmLinhaReta(LOJA_TESTE, c);
  confere(r.j.ok && f.chamadas.includes("rota"), "rota: calculada pelo sistema de rotas (Routes API no Google)");
  confere(r.j.distanciaKm > Math.round(reta * 10) / 10, `rota: a distância é a da ROTA (${r.j.distanciaKm} km), não a linha reta (${reta.toFixed(1)} km)`);
  confere(r.j.valor === esperado(r.j.distanciaKm), `rota: valor = regra de DELIVERY_CONFIG sobre a distância da rota (R$ ${r.j.valor})`);
  confere(Number.isInteger(r.j.duracaoMin) && r.j.duracaoMin >= 1, "rota: tempo estimado em minutos");
  confere(Array.isArray(r.j.rota) && r.j.rota.length > 2 && r.j.origem && r.j.destino, "rota: devolve o desenho da rota, o ponto A e o ponto B");
  const o = lugar("ostras"), f2 = criarFalso();
  const r2 = await chama({ acao: "rota", lat: o.lat, lng: o.lng }, { provedor: f2 });
  confere(kmEmLinhaReta(LOJA_TESTE, o) < E.maximumDistanceKm && r2.j.ok && r2.j.foraDaArea === true && r2.j.valor === null && f2.chamadas.includes("rota"),
    "fora da área: perto em linha reta, mas a ROTA passa do limite → sem valor automático");
  const k = lugar("campos"), f3 = criarFalso();
  const r3 = await chama({ acao: "rota", lat: k.lat, lng: k.lng }, { provedor: f3 });
  confere(r3.j.ok && r3.j.foraDaArea === true && r3.j.valor === null && !f3.chamadas.includes("rota"),
    "fora da área: longe já em linha reta → sem valor e sem gastar consulta de rota");
}

// ---------- 8. falhas: nunca um preço inventado ----------
{
  const c = lugar("cavaleiros");
  registros.length = 0;
  let r = await chama({ acao: "rota", lat: c.lat, lng: c.lng }, { falso: { falha: "indisponivel" } });
  confere(r.j.ok === false && r.j.erro === "indisponivel" && r.j.valor === undefined, "falha: serviço de mapas fora do ar → erro, sem valor");
  confere(registros.length === 1 && registros[0] === JSON.stringify({ entrega: "rota", erro: "indisponivel" }), "falha: o registro do servidor tem só a ação e o código do erro");
  confere(!registros.some((l) => /-22\.|-41\.|Rua|Cavaleiros/.test(l)), "privacidade: nenhum endereço nem coordenada vai para o registro do servidor");
  r = await chama({ acao: "rota", lat: c.lat, lng: c.lng }, { falso: { semRota: true } });
  confere(r.j.ok === false && r.j.erro === "sem_rota", "falha: sem caminho de carro → sem_rota, sem valor");
  r = await chama({ acao: "sugestoes", texto: "Rua Teste" }, { falso: { falha: "chave_invalida", tudo: true } });
  confere(r.j.ok === false && r.j.erro === "chave_invalida", "falha: chave recusada pelo Google → chave_invalida");
  /* outro endereço de loja (o ponto da loja fica guardado depois da primeira vez) */
  const outraLoja = Object.assign(Object.create(D), { STORE_CONFIG: { ...D.STORE_CONFIG, predio: "Prédio de teste sem ponto" } });
  r = await chama({ acao: "inicio" }, { falso: { falha: "indisponivel", tudo: true }, lerDados: async () => outraLoja });
  confere(r.j.ok === false, "falha: sem achar a loja no mapa, a calculadora não começa (e o site mostra o WhatsApp)");
}

// ---------- 9. limite por visitante ----------
{
  const limite = cfg({ porMinuto: 5, porHora: 50 });
  const res = [];
  for (let i = 0; i < 7; i++) res.push((await chama({ acao: "inicio" }, { cfg: limite, ip: "10.9.9.9" })).j);
  confere(res.slice(0, 5).every((x) => x.ok) && res[5].erro === "limite" && res[6].erro === "limite", "limite: passou do limite por minuto → limite");
  const outro = await chama({ acao: "inicio" }, { cfg: limite, ip: "10.9.9.10" });
  confere(outro.j.ok, "limite: outro visitante continua podendo usar");
  /* por sessão de digitação: 40 sugestões em 10 minutos */
  const t0 = 1e12, lista = [];
  for (let i = 0; i < 41; i++) lista.push(sessaoPermite("sessao-teste-limite-1", t0 + i));
  confere(lista.slice(0, 40).every(Boolean) && lista[40] === false && sessaoPermite("sessao-teste-limite-2", t0) && sessaoPermite("sessao-teste-limite-1", t0 + 11 * 60e3),
    "limite: no máximo 40 sugestões por sessão de digitação em 10 minutos (outra sessão, ou depois da janela, volta a poder)");
  const cheio = []; for (let i = 0; i < 45; i++) cheio.push((await chama({ acao: "sugestoes", texto: "Rua Teste", sessao: "sessao-teste-limite-3" }, { cfg: cfg(), ip: "10.8.8." + (i % 200) })).j);
  confere(cheio.slice(0, 40).every((x) => x.ok) && cheio.slice(40).every((x) => x.erro === "limite"), "limite: a função recusa a 41ª sugestão da mesma sessão, mesmo mudando de IP");
}
// ---------- 9b. configuração central (valores e endereço num lugar só) ----------
{
  const cfgTxt = textos["data/config.js"];
  confere(/VALORES COMERCIAIS DA SR PHONE – EDITAR AQUI/.test(cfgTxt), "configuração: os valores do frete têm o aviso \"VALORES COMERCIAIS DA SR PHONE – EDITAR AQUI\"");
  confere(!Object.keys(E.origem || {}).some((k) => !["lat", "lng"].includes(k)) && !/Atlântica|27920|Praia Campista/.test(JSON.stringify(E)),
    "configuração: DELIVERY_CONFIG não repete o endereço da loja (só o ponto opcional)");
  const codigo = ["services/entrega/index.mjs", "services/entrega/provedores/google.mjs", "js/entrega-app.js", "js/entrega.js", "js/precos.js", "services/ai/conhecimento.mjs", "js/site.js", "js/assistente-cerebro.js"]
    .map((f) => fs.readFileSync(path.join(RAIZ, f), "utf8")).join("\n");
  confere(!/Atlântica|27920|Praia Campista|Business Center|Sala 211/.test(codigo), "configuração: nenhum arquivo de código repete o endereço da loja (só data/config.js)");
}

// ---------- 10. o provedor do Google (com respostas simuladas, sem rede) ----------
{
  const chamadas = [];
  const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  const falsoFetch = async (url, init = {}) => {
    const u = String(url); chamadas.push({ u, init });
    if (u.includes("computeRoutes")) return resp({ routes: [{ distanceMeters: 6430, duration: "1080s", polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" } }] });
    if (u.includes("places:autocomplete")) return resp({ suggestions: [{ placePrediction: { placeId: "ChIJteste123456", text: { text: "Rua A, 1 - Centro" },
      structuredFormat: { mainText: { text: "Rua A, 1" }, secondaryText: { text: "Centro, Macaé - RJ" } } } }] });
    if (u.includes("/places/")) return resp({ location: { latitude: -22.37, longitude: -41.78 }, formattedAddress: "Rua A, 1 - Centro, Macaé - RJ" });
    if (u.includes("geocode") && u.includes("latlng")) return resp({ status: "OK", results: [{ formatted_address: "Rua B, 2 - Macaé - RJ" }] });
    if (u.includes("geocode")) return resp({ status: "OK", results: [{ formatted_address: "Rua A, 1", geometry: { location: { lat: -22.37, lng: -41.78 }, location_type: "ROOFTOP" } }] });
    if (u.includes("createSession")) return resp({ session: "sessao-google", expiry: "1893456000" });
    return resp({}, 404);
  };
  const g = criarGoogle({ chave: "chave-servidor-teste", buscar: falsoFetch });
  const rota = await g.rota({ origem: { lat: -22.39, lng: -41.79 }, destino: { lat: -22.37, lng: -41.78 }, transito: false });
  const pr = chamadas.find((c) => c.u.includes("computeRoutes")), corpo = JSON.parse(pr.init.body);
  confere(rota.metros === 6430 && rota.segundos === 1080 && rota.pontos.length === 3, "Google: a Routes API devolve metros, segundos e o desenho da rota");
  confere(pr.init.headers["X-Goog-Api-Key"] === "chave-servidor-teste" && /distanceMeters/.test(pr.init.headers["X-Goog-FieldMask"]) && corpo.travelMode === "DRIVE" && corpo.routingPreference === "TRAFFIC_UNAWARE",
    "Google: rota de carro, só os campos necessários (FieldMask), chave no cabeçalho");
  const sug = await g.sugestoes({ texto: "Rua A", sessao: "sessao-abc-123", perto: { lat: -22.39, lng: -41.79 } });
  const ps = JSON.parse(chamadas.find((c) => c.u.includes("autocomplete")).init.body);
  confere(sug[0].id === "ChIJteste123456" && sug[0].principal === "Rua A, 1" && ps.sessionToken === "sessao-abc-123" && ps.includedRegionCodes[0] === "br",
    "Google: sugestões (Places Autocomplete New) com sessão, só no Brasil, perto da loja");
  const l = await g.lugar({ id: "ChIJteste123456", sessao: "sessao-abc-123" });
  confere(l.lat === -22.37 && /Centro/.test(l.endereco), "Google: lugar escolhido (Place Details New) vira ponto e endereço");
  confere((await g.geocodificar("Rua A, 1")).preciso === true && (await g.reverso({ lat: -22.37, lng: -41.78 })).endereco === "Rua B, 2 - Macaé - RJ", "Google: endereço → ponto e ponto → endereço (Geocoding)");
  confere(!("sessaoMapa" in g) && !chamadas.some((c) => /tile\.googleapis/.test(c.u)), "Google: o servidor não usa a Map Tiles API (o mapa é do navegador, com a outra chave)");
  const zero = await criarGoogle({ chave: "x", buscar: async () => resp({ routes: [{ duration: "0s" }] }) }).rota({ origem: { lat: 0, lng: 0 }, destino: { lat: 0, lng: 0 } });
  confere(zero && zero.metros === 0, "Google: rota de 0 m (o Google omite a distância) não vira erro");
  confere(JSON.stringify(decodificaPolilinha("_p~iF~ps|U_ulLnnqC_mqNvxq`@")) === JSON.stringify([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]), "Google: decodifica a polilinha (exemplo oficial do Google)");
  for (const [st, cod] of [[403, "chave_invalida"], [429, "limite"], [500, "indisponivel"]]){
    let c = "";
    try { await criarGoogle({ chave: "x", buscar: async () => resp({}, st) }).rota({ origem: { lat: 0, lng: 0 }, destino: { lat: 0, lng: 0 } }); } catch (e){ c = e.codigo; }
    confere(c === cod, `Google: erro HTTP ${st} vira "${cod}"`);
  }
  let c2 = "";
  try { await criarGoogle({ chave: "x", buscar: async () => resp({ status: "REQUEST_DENIED" }) }).geocodificar("Rua"); } catch (e){ c2 = e.codigo; }
  confere(c2 === "chave_invalida", "Google: Geocoding REQUEST_DENIED vira chave_invalida");
  let c3 = "";
  try { await criarGoogle({ chave: "x", buscar: async () => { throw new TypeError("rede"); } }).rota({ origem: { lat: 0, lng: 0 }, destino: { lat: 0, lng: 0 } }); } catch (e){ c3 = e.codigo; }
  confere(c3 === "indisponivel", "Google: sem rede vira indisponivel");
}

// ---------- 11. o navegador: chaves, privacidade e localização ----------
{
  const js = ["js/entrega.js", "js/entrega-app.js"].map((f) => fs.readFileSync(path.join(RAIZ, f), "utf8")).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  confere(!/localStorage|sessionStorage|document\.cookie|indexedDB/.test(js), "privacidade: a calculadora não grava o local em localStorage, sessionStorage, cookie ou IndexedDB");
  confere(!/routes\.googleapis|places\.googleapis|maps\/api\/geocode|MAPS_API_KEY|MAPS_SERVER_KEY/.test(js), "navegador: nada de Routes, Places ou Geocoding direto do navegador, nem a chave do servidor");
  const app = fs.readFileSync(path.join(RAIZ, "js/entrega-app.js"), "utf8");
  const usos = app.match(/getCurrentPosition|watchPosition/g) || [];
  confere(usos.length === 1 && /function usarLocalizacao\(\)\{[\s\S]*?getCurrentPosition/.test(app) && !/watchPosition/.test(app),
    "localização: só um pedido, dentro de usarLocalizacao (chamada pelo toque em \"Usar minha localização\")");
  const medir = app.match(/medir\("[a-z_]+", \{[^}]*\}/g) || [];
  confere(medir.length >= 4 && medir.every((m) => !/lat|lng|endereco|local\b/.test(m)), "privacidade: a medição (analytics) da entrega não leva coordenada nem endereço");
  const cab = fs.readFileSync(path.join(RAIZ, "_headers"), "utf8");
  confere(/geolocation=\(self\)/.test(cab) && /img-src[^;]*tile\.googleapis\.com/.test(cab), "segurança: localização só no próprio site e blocos do mapa liberados na CSP");
}

console.error = erroOriginal;
console.log("\nSR Phone · testes da calculadora de entrega (servidor)\n");
for (const t of ok) console.log("  ok    " + t);
for (const t of falhas) console.log("  FALHA " + t);
console.log(`\n${ok.length} ok, ${falhas.length} falha(s)\n`);
process.exit(falhas.length ? 1 : 0);
