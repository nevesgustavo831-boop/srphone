// SR Phone · testes da calculadora de entrega no navegador (chamado pelo ferramentas/testes.mjs).
// Nada de Google de verdade: a função /api/entrega roda aqui mesmo com o provedor FALSO
// (ferramentas/entrega-falsa.mjs) e os blocos do mapa são uma imagem cinza.
// Confere: nada é pedido antes do toque, localização permitida e negada, endereço digitado (sugestões,
// por partes e CEP), rota desenhada, distância e valor que vieram do servidor, fora da área, WhatsApp
// sem envio automático, celular e computador, falhas sem preço inventado, nada guardado no aparelho
// e o Assistente SR Phone repetindo só os números calculados.
import fs from "node:fs";
import path from "node:path";
import { atenderEntrega } from "../services/entrega/index.mjs";
import { avaliarDados, ARQUIVOS } from "../services/dados-site.mjs";
import { criarFalso, LUGARES_TESTE } from "./entrega-falsa.mjs";

/* um bloco de mapa cinza (PNG 1×1) */
const BLOCO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4/f7jfwAJUQPt4Pkw6wAAAABJRU5ErkJggg==", "base64");
const cfgFalsa = (x = {}) => Object.assign({ provedor: "falso", chave: "", chaveNavegador: "chave-navegador-teste", porMinuto: 300, porHora: 5000, origens: [] }, x);
const lugar = (id) => LUGARES_TESTE.find((l) => l.id === "teste-lugar-" + id);
const viaCep = async (u) => String(u).includes("27920325")
  ? new Response(JSON.stringify({ cep: "27920-325", logradouro: "Rua Teste do Centro", bairro: "Centro", localidade: "Macaé", uf: "RJ" }), { status: 200 })
  : new Response(JSON.stringify({ erro: true }), { status: 200 });

export async function testaEntregaNoNavegador({ nav, BASE, confere, RAIZ, IGNORAR }){
  const textos = Object.fromEntries(ARQUIVOS.map((f) => [f, fs.readFileSync(path.join(RAIZ, f), "utf8")]));
  const D = avaliarDados(textos), E = D.DELIVERY_CONFIG;
  const esperado = (km) => Math.max(E.minimumFee, Math.round((E.baseFee + km * E.pricePerKm) * 100) / 100);
  const reais = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/\s/g, " ");
  /* algum valor em reais que não seja o "R$ 0,00" da retirada */
  const temValor = (t) => /R\$\s(?!0,00)/.test(t);

  /* uma aba com a função de entrega FALSA e o mapa cinza. opcoes.falso: opções do provedor falso;
     opcoes.api: "500" (a função quebra) ou "sem_chave" (sem MAPS_SERVER_KEY) */
  async function abre(contexto, opcoes = {}, url = "/"){
    const ctx = await nav.newContext(contexto);
    const pedidos = [], erros = [];
    let n = 0;
    await ctx.route("**/api/entrega", async (route) => {
      const r = route.request();
      pedidos.push(JSON.parse(r.postData() || "{}"));
      if (opcoes.api === "500") return route.fulfill({ status: 500, contentType: "text/plain", body: "erro" });
      if (opcoes.api === "404") return route.fulfill({ status: 404, contentType: "text/html", body: "<h1>404</h1>" });
      const resp = await atenderEntrega(new Request(r.url(), { method: r.method(), headers: r.headers(), body: r.postData() }), {
        cfg: cfgFalsa(opcoes.cfg), provedor: opcoes.api === "sem_chave" ? null : criarFalso(opcoes.falso), ip: "10.1.1." + (++n % 200), buscar: viaCep });
      await route.fulfill({ status: resp.status, contentType: "application/json", body: await resp.text() });
    });
    await ctx.route("https://tile.googleapis.com/**", (route) => {
      const u = route.request().url();
      if (u.includes("/createSession")) return opcoes.mapa === "falha"
        ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: 403 } }) })
        : route.fulfill({ contentType: "application/json", body: JSON.stringify({ session: "sessao-teste", expiry: "1893456000", tileWidth: 512, tileHeight: 512, imageFormat: "png" }) });
      if (u.includes("/viewport")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ copyright: "Dados do mapa (teste)" }) });
      return route.fulfill({ contentType: "image/png", body: BLOCO });
    });
    if (opcoes.config) await ctx.route("**/data/config.js", (route) => route.fulfill({ contentType: "text/javascript", body: opcoes.config }));
    /* teclado do celular de mentira: a área visível (visualViewport) encolhe quando o teste manda */
    if (opcoes.teclado) await ctx.addInitScript(() => {
      const alvo = new EventTarget(); let alt = 0;
      Object.defineProperty(alvo, "height", { get: () => alt || innerHeight });
      window.__teclado = (aberto) => { alt = aberto ? Math.round(innerHeight * 0.5) : 0; alvo.dispatchEvent(new Event("resize")); };
      Object.defineProperty(window, "visualViewport", { configurable: true, get: () => alvo });
    });
    /* conta os pedidos de localização (o site não pode pedir sozinho) */
    await ctx.addInitScript(() => {
      window.__geo = 0;
      try { localStorage.setItem("sra-dica", "1"); } catch (_){ /* sem storage */ }
      if (navigator.geolocation){
        const orig = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        navigator.geolocation.getCurrentPosition = (...a) => { window.__geo++; return orig(...a); };
      }
    });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => erros.push("erro de script: " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !IGNORAR.test(m.text())) erros.push(m.text()); });
    p.on("response", (r) => { if (r.url().startsWith(BASE) && r.status() >= 400 && !/favicon|\/api\/entrega/.test(r.url())) erros.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
    await p.goto(BASE + url, { waitUntil: "load" });
    /* o site montou: os botões "Calcular entrega" já respondem (sem pausa fixa) */
    await p.waitForFunction(() => document.readyState === "complete" && window.SREntrega && typeof window.SREntrega.abrir === "function", null, { timeout: 15000 }).catch(() => {});
    /* a medição (analytics) da calculadora: guardamos o que ela manda */
    await p.evaluate(() => { window.__medidas = []; const m = window.medir; window.medir = (e, d) => { window.__medidas.push([e, d]); if (m) m(e, d); }; });
    return { ctx, p, pedidos, erros };
  }
  const painel = (p) => p.locator("#entrega .ent-painel");
  async function esperaEndereco(p){
    await p.waitForSelector("#entrega .ent-endereco");
    await p.waitForFunction(() => !/Buscando/.test(document.querySelector("#entrega .ent-endereco").textContent), null, { timeout: 8000 });
  }
  async function confirmaEespera(p){
    await p.click("#entrega >> text=Confirmar local");
    await p.waitForFunction(() => /resultado|fora|erro/.test(document.getElementById("entrega").getAttribute("data-passo")), null, { timeout: 10000 });
  }
  const sujeira = async (p) => p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));

  // ---------- a. celular, localização PERMITIDA, do botão da seção Localização ----------
  for (const w of [375, 390, 430, 768]){
    const c = lugar("cavaleiros");
    const { ctx, p, pedidos, erros } = await abre({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true,
      geolocation: { latitude: c.lat, longitude: c.lng }, permissions: ["geolocation"] });
    const antes = await p.evaluate(() => ({ geo: window.__geo, leaflet: !!document.querySelector("link[data-leaflet]"), botao: !!document.querySelector('#localizacao [data-entrega]:not([hidden])') }));
    confere(antes.geo === 0 && !antes.leaflet && pedidos.length === 0, `entrega ${w}px: ao abrir o site, nada de localização, mapa ou consulta de rota`);
    confere(antes.botao, `entrega ${w}px: botão "Calcular entrega" na seção Localização`);
    await p.click('#localizacao [data-entrega]');
    await p.waitForSelector("#entrega .ent-escolha.principal");
    const inicio = await p.evaluate(() => {
      const r = document.querySelector("#entrega .ent-caixa").getBoundingClientRect(), t = document.querySelector("#entrega .ent-painel").innerText;
      return { geo: window.__geo, cheia: Math.round(r.width) === innerWidth && Math.round(r.height) >= innerHeight - 1, titulo: /Para onde devemos entregar\?/.test(t),
        opcoes: /Usar minha localização/.test(t) && /Digitar endereço/.test(t), retirada: /Retirar na SR Phone[\s\S]*R\$\s0,00[\s\S]*Av\. Atlântica, 386/.test(t),
        mapa: !!document.querySelector("#entrega .leaflet-container"), marcaA: !!document.querySelector("#entrega .ent-marca-a") };
    });
    confere(inicio.geo === 0, `entrega ${w}px: abrir a calculadora ainda NÃO pede a localização (só o toque em "Usar minha localização")`);
    confere(inicio.cheia && inicio.titulo && inicio.opcoes, `entrega ${w}px: tela cheia com "Para onde devemos entregar?", localização e endereço`);
    confere(inicio.retirada, `entrega ${w}px: mostra "Retirar na SR Phone · R$ 0,00" com o endereço da loja`);
    confere(inicio.mapa && inicio.marcaA, `entrega ${w}px: mapa com a loja (ponto A)`);
    await p.click("#entrega .ent-escolha.principal");
    await esperaEndereco(p);
    const conf = await p.evaluate(() => ({ geo: window.__geo, end: document.querySelector("#entrega .ent-endereco").textContent,
      pino: !document.querySelector("#entrega .ent-alvo").hidden }));
    confere(conf.geo === 1 && /Cavaleiros/.test(conf.end) && conf.pino, `entrega ${w}px: localização permitida → ponto no mapa com pino para ajustar e o endereço`);
    await confirmaEespera(p);
    const rota = pedidos.find((x) => x.acao === "rota");
    const res = await p.evaluate(() => {
      const t = document.querySelector("#entrega .ent-opcao-card.escolhida").innerText, b = document.querySelector('#entrega a[data-zap="entrega"]');
      const painelR = document.querySelector("#entrega .ent-painel").getBoundingClientRect(), mapaR = document.querySelector("#entrega .ent-mapa-area").getBoundingClientRect();
      return { t, href: b && b.href, alvo: b && b.target, altura: b ? b.getBoundingClientRect().height : 0, info: window.SREntrega.info(),
        linhas: document.querySelectorAll("#entrega .leaflet-overlay-pane path").length, marcas: document.querySelectorAll("#entrega .ent-marca-a, #entrega .ent-marca-b").length,
        embaixo: innerWidth >= 900 || painelR.top > mapaR.top, sobra: document.documentElement.scrollWidth - innerWidth,
        cabe: painelR.bottom <= innerHeight + 1 && painelR.top < innerHeight - 120 };
    });
    const q = res.info.cotacao;
    confere(rota && rota.lat === c.lat && rota.lng === c.lng && !("valor" in rota), `entrega ${w}px: o navegador manda só o ponto; a rota e o valor vêm do servidor`);
    confere(q && q.distanciaKm > 0 && res.t.includes(String(q.distanciaKm).replace(".", ",") + " km") && res.t.includes("aproximadamente " + q.duracaoMin + " min"),
      `entrega ${w}px: mostra a distância da rota (${q && q.distanciaKm} km) e o tempo (${q && q.duracaoMin} min)`);
    confere(q && q.valor === esperado(q.distanciaKm) && res.t.includes(reais(q.valor)), `entrega ${w}px: valor = taxa + km × valor por km (${q && reais(q.valor)})`);
    confere(res.linhas >= 2 && res.marcas === 2, `entrega ${w}px: rota desenhada no mapa com os pontos A (loja) e B (cliente)`);
    confere(/Entrega SR Phone/.test(res.t) && /Escolher esta entrega/.test(res.t) && res.altura >= 48, `entrega ${w}px: "Entrega SR Phone" com botão grande "Escolher esta entrega"`);
    confere(/A tabela de entrega está em confirmação/.test(res.t), `entrega ${w}px: com a tabela de exemplo (tarifasConfirmadas false), o cliente é avisado que o valor final é combinado`);
    confere(res.embaixo && res.sobra <= 0 && res.cabe, `entrega ${w}px: mapa em cima, painel embaixo e inteiro na tela, sem rolagem para os lados`);
    const msg = decodeURIComponent((res.href || "").split("text=")[1] || "");
    confere(/^https:\/\/wa\.me\/\d+\?text=/.test(res.href || "") && res.alvo === "_blank" && msg.startsWith("Olá, vim pelo site da SR Phone.") &&
      /Endereço:\nRua Teste da Praia, 100/.test(msg) && msg.includes("Distância:\n" + String(q.distanciaKm).replace(".", ",") + " km") &&
      msg.includes("Tempo estimado:\n" + q.duracaoMin + " min") && msg.includes("Entrega estimada:\n" + reais(q.valor)) && /Gostaria de confirmar a entrega\.$/.test(msg),
      `entrega ${w}px: WhatsApp com a mensagem organizada (endereço, distância, tempo e valor)`);
    confere(ctx.pages().length === 1, `entrega ${w}px: nenhuma mensagem é aberta ou enviada sozinha (só no toque da pessoa)`);
    const guardado = await sujeira(p);
    confere(!/-22\.\d|-41\.\d|Cavaleiros|Rua Teste/.test(guardado), `entrega ${w}px: nada do local (coordenada ou endereço) no localStorage, sessionStorage ou cookie`);
    const medidas = await p.evaluate(() => JSON.stringify(window.__medidas));
    confere(/delivery_open/.test(medidas) && /delivery_location/.test(medidas) && /delivery_quote/.test(medidas) && !/-22\.|-41\.|lat|lng|Rua|Cavaleiros/.test(medidas),
      `entrega ${w}px: a medição conta abrir, localização e cálculo, sem coordenada nem endereço`);
    await p.keyboard.press("Escape");
    confere(await p.evaluate(() => document.getElementById("entrega").hidden), `entrega ${w}px: Esc fecha a calculadora`);
    confere(!erros.length, `entrega ${w}px: sem erro no console nem bloqueio da segurança (CSP)${erros.length ? " → " + erros.join(" | ") : ""}`);
    await ctx.close();
  }

  // ---------- b. localização NEGADA → digitar o endereço (sugestões) ----------
  {
    const { ctx, p, erros } = await abre({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    await ctx.clearPermissions();
    await p.click('#localizacao [data-entrega]');
    await p.click("#entrega .ent-escolha.principal");
    await p.waitForSelector("#entrega #ent-busca", { timeout: 20000 });
    const t = await painel(p).innerText();
    confere(/não permitiu o uso da localização/i.test(t) && /Endereço de entrega/.test(t), "entrega: localização negada → aviso gentil e o campo de endereço");
    await p.fill("#entrega #ent-busca", "Rua Teste do Centro");
    await p.waitForSelector("#entrega .ent-sugestao");
    const acessivel = await p.evaluate(() => { const c = document.getElementById("ent-busca"); return c.getAttribute("role") === "combobox" && c.getAttribute("aria-expanded") === "true"; });
    confere(acessivel, "entrega: sugestões de endereço enquanto digita (lista acessível)");
    await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter");
    await esperaEndereco(p);
    confere(/Centro/.test(await p.locator("#entrega .ent-endereco").innerText()), "entrega: escolher a sugestão (teclado) centraliza o mapa no endereço");
    await p.fill("#entrega #ent-compl", "Apto 302");
    await confirmaEespera(p);
    const href = await p.getAttribute('#entrega a[data-zap="entrega"]', "href");
    confere(/Apto 302/.test(decodeURIComponent(href)), "entrega: o complemento (apartamento, referência) vai na mensagem do WhatsApp");
    confere(!erros.length, "entrega (negada): sem erro" + (erros.length ? " → " + erros.join(" | ") : ""));
    await ctx.close();
  }

  // ---------- c. computador: endereço por partes e por CEP; mapa ao lado ----------
  {
    const { ctx, p, erros } = await abre({ viewport: { width: 1280, height: 860 } });
    await p.click('#localizacao [data-entrega]');
    await p.click("#entrega >> text=Digitar endereço");
    await p.click("#entrega .ent-partes summary");
    await p.fill("#entrega #ent-rua", "Rua Teste do Centro");
    await p.fill("#entrega #ent-numero", "45");
    await p.fill("#entrega #ent-bairro", "Centro");
    confere(await p.inputValue("#entrega #ent-cidade") === D.STORE_CONFIG.cidade, "entrega: no formulário por partes, a cidade já vem com a da loja");
    await p.click("#entrega >> text=Buscar no mapa");
    await esperaEndereco(p);
    await confirmaEespera(p);
    const lado = await p.evaluate(() => {
      const m = document.querySelector("#entrega .ent-mapa-area").getBoundingClientRect(), pa = document.querySelector("#entrega .ent-painel").getBoundingClientRect();
      return { lado: pa.left >= m.right - 1 && Math.abs(pa.top - m.top) < 2, larg: Math.round(pa.width), valor: !!document.querySelector("#entrega .ent-valor") };
    });
    confere(lado.lado && lado.larg >= 360 && lado.valor, `entrega 1280px: mapa de um lado, informações do outro (${lado.larg}px) e o valor calculado`);
    await p.click("#entrega >> text=Alterar endereço");
    await p.click("#entrega >> text=Buscar outro endereço");
    await p.fill("#entrega #ent-busca", "27920-325");
    await p.keyboard.press("Enter");
    await esperaEndereco(p);
    confere(/Centro/.test(await p.locator("#entrega .ent-endereco").innerText()), "entrega: CEP no campo de busca acha o endereço (ViaCEP + mapa)");
    confere(!erros.length, "entrega 1280px: sem erro" + (erros.length ? " → " + erros.join(" | ") : ""));
    await ctx.close();
  }

  // ---------- c2. endereço inexistente e mapa que não abre (a chave do navegador recusada) ----------
  {
    const { ctx, p, erros } = await abre({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }, { mapa: "falha" });
    await p.click('#localizacao [data-entrega]');
    await p.click("#entrega >> text=Digitar endereço");
    const semMapa = await p.evaluate(() => ({ mapa: window.SREntrega.info().mapa, classe: document.getElementById("entrega").classList.contains("sem-mapa") }));
    confere(!semMapa.mapa && semMapa.classe, "entrega: se o mapa não abrir (chave do navegador recusada), a calculadora continua sem o desenho");
    await p.fill("#entrega #ent-busca", "Rua que nao existe de jeito nenhum");
    await p.waitForSelector("#entrega .ent-sem");
    confere(/Nenhum endereço encontrado/.test(await p.locator("#entrega .ent-sem").innerText()), "entrega: endereço inexistente nas sugestões → \"Nenhum endereço encontrado\"");
    await p.click("#entrega .ent-partes summary");
    await p.fill("#entrega #ent-rua", "Rua que nao existe de jeito nenhum");
    await p.click("#entrega >> text=Buscar no mapa");
    await p.waitForSelector("#entrega .ent-aviso.erro");
    confere(/Não achamos esse endereço/.test(await painel(p).innerText()) && await p.locator("#entrega #ent-busca").count() === 1,
      "entrega: endereço inexistente por partes → aviso e o campo de endereço de novo (sem valor)");
    await p.fill("#entrega #ent-busca", "Rua Teste do Centro");
    await p.click("#entrega .ent-sugestao");
    await esperaEndereco(p);
    await confirmaEespera(p);
    confere(await p.locator("#entrega .ent-valor").count() === 1, "entrega: sem o desenho do mapa, a rota e o valor continuam vindo do servidor");
    const outros = erros.filter((e) => !/status of 403/.test(e));       /* o 403 do Google é o próprio teste */
    confere(!outros.length, "entrega (sem mapa): sem erro de script" + (outros.length ? " → " + outros.join(" | ") : ""));
    await ctx.close();
  }

  // ---------- c3. teclado aberto no celular: o mapa sai da frente do campo ----------
  {
    const c = lugar("cavaleiros");
    const { ctx, p } = await abre({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true,
      geolocation: { latitude: c.lat, longitude: c.lng }, permissions: ["geolocation"] }, { teclado: true });
    await p.click('#localizacao [data-entrega]');
    await p.click("#entrega .ent-escolha.principal");
    await esperaEndereco(p);
    await p.focus("#entrega #ent-compl");
    await p.evaluate(() => window.__teclado(true));
    await p.waitForFunction(() => document.getElementById("entrega").classList.contains("com-teclado") &&
      getComputedStyle(document.querySelector("#entrega .ent-mapa-area")).display === "none", null, { timeout: 5000 }).catch(() => {});
    const aberto = await p.evaluate(() => ({ classe: document.getElementById("entrega").classList.contains("com-teclado"),
      mapa: getComputedStyle(document.querySelector("#entrega .ent-mapa-area")).display, campo: document.getElementById("ent-compl").getBoundingClientRect().top }));
    await p.evaluate(() => { document.activeElement.blur(); window.__teclado(false); });
    await p.waitForFunction(() => !document.getElementById("entrega").classList.contains("com-teclado") &&
      getComputedStyle(document.querySelector("#entrega .ent-mapa-area")).display !== "none", null, { timeout: 5000 }).catch(() => {});
    const fechado = await p.evaluate(() => ({ classe: document.getElementById("entrega").classList.contains("com-teclado"), mapa: getComputedStyle(document.querySelector("#entrega .ent-mapa-area")).display }));
    confere(aberto.classe && aberto.mapa === "none" && aberto.campo < 400 && !fechado.classe && fechado.mapa !== "none",
      "entrega 390px: com o teclado aberto o mapa sai da frente do campo; com o teclado fechado ele volta");
    await ctx.close();
  }

  // ---------- d. fora da área (rota acima do limite) e longe demais ----------
  for (const [id, nome] of [["ostras", "a rota passa do limite"], ["campos", "longe já em linha reta"]]){
    const { ctx, p } = await abre({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    await p.click('#localizacao [data-entrega]');
    await p.click("#entrega >> text=Digitar endereço");
    await p.fill("#entrega #ent-busca", lugar(id).principal);
    await p.click("#entrega .ent-sugestao");
    await esperaEndereco(p);
    await confirmaEespera(p);
    const r = await p.evaluate(() => ({ passo: document.getElementById("entrega").getAttribute("data-passo"), t: document.querySelector("#entrega .ent-painel").innerText,
      href: (document.querySelector('#entrega a[data-zap="entrega"]') || {}).href || "", info: window.SREntrega.info() }));
    confere(r.passo === "fora" && r.t.includes("Esse endereço está fora da nossa área de entrega automática.") && /Consultar entrega pelo WhatsApp/.test(r.t) && !r.info.cotacao && !temValor(r.t),
      `entrega fora da área (${nome}): sem valor automático e "Consultar entrega pelo WhatsApp"`);
    confere(/fora da área de entrega automática do site\. Vocês conseguem entregar aqui\?$/.test(decodeURIComponent(r.href)), `entrega fora da área (${nome}): mensagem do WhatsApp pedindo a consulta`);
    await ctx.close();
  }

  // ---------- e. falhas: serviço fora do ar e sem chave → nada de preço inventado ----------
  for (const [api, nome, falso, codigo] of [["", "serviço de mapas fora do ar na hora da rota", { falha: "indisponivel" }, "indisponivel"], ["500", "função quebrada", null, "indisponivel"],
    ["sem_chave", "sem MAPS_SERVER_KEY", null, "sem_chave"], ["404", "função não publicada (pasta arrastada no Netlify)", null, "sem_funcao"]]){
    const c = lugar("cavaleiros");
    const { ctx, p } = await abre({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true,
      geolocation: { latitude: c.lat, longitude: c.lng }, permissions: ["geolocation"] }, { api, falso });
    await p.click('#localizacao [data-entrega]');
    if (!api){ await p.click("#entrega .ent-escolha.principal"); await esperaEndereco(p); await confirmaEespera(p); }
    else await p.waitForFunction(() => document.getElementById("entrega").getAttribute("data-passo") === "erro", null, { timeout: 20000 });
    const t = await painel(p).innerText();
    const href = await p.getAttribute('#entrega a[data-zap="entrega"]', "href");
    confere(t.includes("Não conseguimos calcular a entrega agora. Fale com a SR Phone pelo WhatsApp.") && !temValor(t) && /^https:\/\/wa\.me\//.test(href) && /Retirar na SR Phone/.test(t),
      `entrega (${nome}): mensagem de erro, WhatsApp e retirada, sem nenhum valor`);
    const cod = await p.evaluate(() => [document.getElementById("entrega").getAttribute("data-erro"), window.SREntrega.info().erro]);
    confere(!/sem_chave|sem_funcao|chave_invalida|indisponivel|limite|Código/i.test(t) && cod[0] === codigo && cod[1] === codigo,
      `entrega (${nome}): nenhum código interno na tela; o motivo "${codigo}" fica só para a loja (data-erro / SREntrega.info())`);
    await ctx.close();
  }

  // ---------- f. produto aberto: o nome vai na mensagem; DELIVERY_CONFIG.ligada = false esconde tudo ----------
  {
    const c = lugar("centro");
    const { ctx, p } = await abre({ viewport: { width: 1280, height: 860 }, geolocation: { latitude: c.lat, longitude: c.lng }, permissions: ["geolocation"] }, {}, "/produto/iphone-17/");
    await p.waitForSelector("#pdp:not([hidden]) .pdp-entrega");
    await p.click("#pdp .pdp-entrega");
    await p.click("#entrega .ent-escolha.principal");
    await esperaEndereco(p);
    await confirmaEespera(p);
    const msg = decodeURIComponent(await p.getAttribute('#entrega a[data-zap="entrega"]', "href"));
    const ctxP = await p.evaluate(() => window.SREntrega.info().produto);
    const doCatalogo = await p.evaluate(() => { const e = escolhaDe(pdpAtual, pdpCap, pdpCor); return { id: pdpAtual.id, opcao: e.opcao, cor: e.cor, preco: e.preco }; });
    confere(ctxP && ctxP.id === doCatalogo.id && ctxP.armazenamento === doCatalogo.opcao && ctxP.cor === doCatalogo.cor && ctxP.preco === doCatalogo.preco,
      "entrega: o pedido leva o contexto do produto do catálogo (id, nome, armazenamento, cor e preço atual)");
    confere(msg.includes("Produto:\n" + ["iPhone 17", doCatalogo.opcao].filter(Boolean).join(" ")) && (!doCatalogo.cor || msg.includes("Cor:\n" + doCatalogo.cor)) &&
      (!(doCatalogo.preco > 0) || msg.includes("Preço no site:\n" + reais(doCatalogo.preco))) && /Gostaria de confirmar o pedido e a entrega\.$/.test(msg),
      "entrega: aberta na página do produto, a mensagem leva produto, armazenamento, cor e preço do site");
    await p.keyboard.press("Escape");
    confere(await p.evaluate(() => !document.getElementById("pdp").hidden && document.getElementById("entrega").hidden), "entrega: fechar a calculadora volta para o produto");
    await ctx.close();
    const desligada = textos["data/config.js"].replace(/(DELIVERY_CONFIG\s*=\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?ligada:\s*)true/, "$1false");
    const d = await abre({ viewport: { width: 390, height: 800 } }, { config: desligada });
    confere(desligada !== textos["data/config.js"] && await d.p.evaluate(() => [...document.querySelectorAll("[data-entrega]")].every((b) => b.hidden) && !window.SREntrega),
      "entrega: DELIVERY_CONFIG.ligada = false esconde os botões da calculadora");
    await d.ctx.close();
  }

  // ---------- g. Assistente SR Phone: "Quanto fica para entregar aqui?" ----------
  for (const w of [390, 1280]){
    const movel = w < 800;
    const { ctx, p, erros } = await abre({ viewport: { width: w, height: movel ? 800 : 860 }, isMobile: movel, hasTouch: movel });
    await p.evaluate(() => window.SRAssistente.abrir());
    await p.waitForFunction(() => document.querySelectorAll("#sra-msgs .sra-msg.bot").length >= 1 && !window.SRAssistente.info().ocupado, null, { timeout: 40000 });
    await p.fill("#sra-texto", "Quanto fica para entregar aqui?");
    await p.press("#sra-texto", "Enter");
    await p.waitForFunction(() => !window.SRAssistente.info().ocupado, null, { timeout: 40000 });
    const oferta = p.locator("#sra-msgs .sra-msg.bot").last();
    const botoes = await oferta.locator(".sra-acao").allInnerTexts();
    confere(botoes.some((b) => /Usar minha localização/.test(b)) && botoes.some((b) => /Digitar endereço/.test(b)) && !/R\$|\d+ ?km/.test(await oferta.innerText()),
      `assistente ${w}px: "Quanto fica para entregar aqui?" → oferece "Usar minha localização" ou "Digitar endereço", sem inventar valor`);
    confere(await p.evaluate(() => window.__geo) === 0, `assistente ${w}px: responder não pede a localização sozinho`);
    await oferta.locator(".sra-acao", { hasText: "Digitar endereço" }).click();
    await p.waitForSelector("#entrega #ent-busca");
    await p.fill("#entrega #ent-busca", "Rua Teste da Praia");
    await p.click("#entrega .ent-sugestao");
    await esperaEndereco(p);
    await confirmaEespera(p);
    const q = await p.evaluate(() => window.SREntrega.info().cotacao);
    await p.click("#entrega .ent-fechar");
    await p.waitForFunction(() => window.SRAssistente.info().aberto && !window.SRAssistente.info().ocupado, null, { timeout: 40000 });
    /* a resposta aparece aos poucos: espera a frase inteira */
    await p.waitForFunction(() => /rota até esse endereço/.test(([...document.querySelectorAll("#sra-msgs .sra-msg.bot p.sr-only")].pop() || {}).textContent || ""), null, { timeout: 10000 }).catch(() => {});
    const fala = await p.evaluate(() => ([...document.querySelectorAll("#sra-msgs .sra-msg.bot p.sr-only")].pop() || {}).textContent || "");
    const certo = "A rota até esse endereço possui aproximadamente " + String(q.distanciaKm).replace(".", ",") + " km. A entrega estimada ficou em " + reais(q.valor) + ". O tempo estimado é de " + q.duracaoMin + " min.";
    confere(fala.replace(/\u00a0/g, " ").includes(certo), `assistente ${w}px: depois do cálculo, repete os números do sistema de rotas ("${certo}")` + (fala.includes(certo) ? "" : " → " + fala));
    confere(!/-22\.\d|-41\.\d|Rua Teste/.test(await sujeira(p)), `assistente ${w}px: a conversa guardada na aba não tem endereço nem coordenada`);
    confere(!erros.length, `assistente ${w}px (entrega): sem erro` + (erros.length ? " → " + erros.join(" | ") : ""));
    await ctx.close();
  }
}
