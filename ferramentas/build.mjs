// npm run build
// O site não precisa ser "compilado": ele funciona direto com os arquivos da pasta.
// Este comando faz o que dá trabalho fazer à mão:
//  1. lê o .env (opcional) e grava em data/config.js o domínio, o Supabase e o Analytics;
//  2. confere os dados (config e catálogo) e aponta erros;
//  3. espalha o endereço do site (SITE_CONFIG.url) no <head>, no robots.txt e no sitemap.xml;
//  4. gera uma página própria para cada produto: produto/<id>/index.html
//     (título, descrição, canonical, Open Graph e Twitter Card do produto);
//  5. lista os produtos que ainda estão sem preço, disponibilidade, imagem ou descrição.
// "npm run build -- --conferir" não grava nada: só diz se os arquivos gerados estão em dia (usado no npm test).
import fs from "node:fs";
import path from "node:path";
import { lerDados, lerEnv, RAIZ } from "./ler-dados.mjs";

const CONFERIR = process.argv.includes("--conferir");
const erros = [], avisos = [], gravados = [], desatualizados = [];
const arq = (f) => path.join(RAIZ, f);
const existe = (f) => fs.existsSync(arq(f));
const ler = (f) => fs.readFileSync(arq(f), "utf8");
/* grava só se mudou; no modo --conferir apenas anota o que está diferente */
const semData = (t) => String(t).replace(/<lastmod>[^<]*<\/lastmod>/g, "");
function grava(f, conteudo){
  const atual = existe(f) ? ler(f) : null;
  if (atual !== null && semData(atual) === semData(conteudo)) return;
  if (CONFERIR){ desatualizados.push(f); return; }
  fs.mkdirSync(path.dirname(arq(f)), { recursive: true });
  fs.writeFileSync(arq(f), conteudo);
  gravados.push(f);
}

// ---------- 1. variáveis de ambiente (.env) -> data/config.js ----------
const env = lerEnv();
if (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY) avisos.push("A chave secreta do Supabase (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY) não vai para o site, de propósito. No Netlify ela fica nas variáveis de ambiente (só a função /api/agendamento usa).");
if (env.TURNSTILE_SECRET_KEY) avisos.push("TURNSTILE_SECRET_KEY não vai para o site, de propósito: ela fica só nas variáveis de ambiente do Netlify (a função /api/agendamento confere o anti-robô).");
const papelJwt = (k) => { try { return JSON.parse(Buffer.from(String(k).split(".")[1] || "", "base64").toString("utf8")).role || ""; } catch { return ""; } };
if (env.SUPABASE_ANON_KEY && (papelJwt(env.SUPABASE_ANON_KEY) === "service_role" || /^sb_secret_/.test(env.SUPABASE_ANON_KEY))){
  erros.push("SUPABASE_ANON_KEY do .env é uma chave SECRETA (service_role / sb_secret). Use a chave anon/publishable.");
  delete env.SUPABASE_ANON_KEY;
}
{
  let cfg = ler("data/config.js");
  const antes = cfg;
  const troca = (re, valor) => { if (valor === undefined) return; if (!re.test(cfg)) { erros.push(`data/config.js: não achei ${re}`); return; } cfg = cfg.replace(re, (m, a) => a + JSON.stringify(String(valor).trim())); };
  troca(/(url:\s*)"[^"]*"/, env.SITE_URL !== undefined ? String(env.SITE_URL).replace(/\/+$/, "") : undefined);
  troca(/(var GA_MEASUREMENT_ID\s*=\s*)"[^"]*"/, env.GA_MEASUREMENT_ID);
  troca(/(var SUPABASE_URL\s*=\s*)"[^"]*"/, env.SUPABASE_URL);
  troca(/(var SUPABASE_ANON_KEY\s*=\s*)"[^"]*"/, env.SUPABASE_ANON_KEY);
  troca(/(var TURNSTILE_SITE_KEY\s*=\s*)"[^"]*"/, env.TURNSTILE_SITE_KEY);
  if (cfg !== antes) grava("data/config.js", cfg);
}

// Confere o GLB do mascote sem abrir o 3D: cabeçalho, tamanho, extensões e nomes das animações.
const GLB_PADRAO = "assets/modelos/srphone-assistant.glb";
const ANIM_OBRIGATORIAS = ["idle", "hover", "greeting", "thinking", "speaking", "pointing", "success"];
const ANIM_OPCIONAIS = { welcome: "greeting", lookaround: "idle", present: "pointing", goodbye: "greeting" };
function conferirGLB(rel, nomes){
  const r = { erros: [], avisos: [], ok: "" };
  if (!/\.glb$/i.test(rel)) { r.erros.push(`ASSISTENTE.modelo3d precisa ser um arquivo .glb (tudo num arquivo só): ${rel}`); return r; }
  if (!existe(rel)){
    /* no endereço padrão, sem arquivo é o normal: o site mostra o mascote 3D da marca (feito no código).
       Um GLB de artista é opcional */
    if (rel === GLB_PADRAO){
      if (!existe("assets/modelos/sem-modelo.json")) r.erros.push("assets/modelos/sem-modelo.json sumiu: ele é o aviso que o site recebe enquanto não há GLB. Restaure o arquivo.");
      r.ok = "Mascote: versão 3D da marca (feita no código, sem arquivo para baixar). GLB de artista: opcional, não colocado.";
    }
    else r.erros.push(`ASSISTENTE.modelo3d: o arquivo não existe: ${rel}. Coloque o GLB nessa pasta, use o endereço padrão (${GLB_PADRAO}) ou deixe modelo3d: "" (fica o mascote 3D da marca).`);
    return r;
  }
  const buf = fs.readFileSync(path.join(RAIZ, rel)), mb = buf.length / 1048576;
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546C67 || buf.readUInt32LE(16) !== 0x4E4F534A) { r.erros.push(`${rel} não é um GLB válido (exporte como glTF Binary .glb).`); return r; }
  let json;
  try { json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8")); } catch { r.erros.push(`${rel}: não deu para ler o cabeçalho do GLB.`); return r; }
  if (mb > 8) r.erros.push(`${rel} tem ${mb.toFixed(1)} MB: grande demais para o site. O ideal é até 3 MB (veja GUIA-MODELO-3D-SRPHONE.md).`);
  else if (mb > 5) r.avisos.push(`${rel} tem ${mb.toFixed(1)} MB: pesado para celular. Ideal: até 3 MB (comprima com gltfpack -cc e texturas em WebP).`);
  else if (mb > 3) r.avisos.push(`${rel} tem ${mb.toFixed(1)} MB. Ideal: até 3 MB (comprima com gltfpack -cc e texturas em WebP).`);
  const ext = [...new Set([...(json.extensionsUsed || []), ...(json.extensionsRequired || [])])];
  const recusadas = ext.filter((e) => e === "KHR_draco_mesh_compression" || e === "KHR_texture_basisu");
  if (recusadas.length) r.erros.push(`${rel} usa ${recusadas.join(" e ")}, que o site não abre (precisariam de workers liberados na segurança). Use Meshopt (gltfpack -cc) e texturas WebP ou PNG.`);
  if ((json.buffers || []).some((b) => b.uri) || (json.images || []).some((i) => i.uri)) r.erros.push(`${rel} aponta para arquivos de fora (texturas ou .bin separados). Exporte tudo embutido num GLB só.`);
  const tem = new Set((json.animations || []).map((a) => String(a.name || "").toLowerCase()));
  const falta = (e) => [].concat(nomes[e] || []).filter((n) => !tem.has(String(n).toLowerCase()));
  const faltando = ANIM_OBRIGATORIAS.flatMap(falta);
  if (!tem.size) r.erros.push(`${rel} não tem nenhuma animação. O mínimo é "${nomes.idle || "Idle"}".`);
  else if (faltando.length) r.avisos.push(`${rel}: faltam as animações ${faltando.join(", ")}. Nesses estados o mascote fica no ${nomes.idle || "Idle"}.`);
  const opcionais = Object.keys(ANIM_OPCIONAIS).flatMap((e) => falta(e).map((n) => `${n} (usa ${[].concat(nomes[ANIM_OPCIONAIS[e]] || [])[0] || "Idle"})`));
  if (tem.size && opcionais.length) r.avisos.push(`${rel}: animações extras que ainda não existem: ${opcionais.join(", ")}.`);
  const tris = (json.meshes || []).reduce((s, m) => s + m.primitives.reduce((t, p) => {
    const ac = json.accessors[p.indices !== undefined ? p.indices : p.attributes.POSITION]; return t + Math.round((ac ? ac.count : 0) / (p.indices !== undefined ? 3 : 3)); }, 0), 0);
  if (tris > 60000) r.avisos.push(`${rel} tem cerca de ${tris} triângulos. Recomendado: até 30 mil para o mascote.`);
  /* rig (esqueleto) e materiais: sem esqueleto, as animações só movem peças inteiras (sem dobrar braço, falar...) */
  const ossos = (json.skins || []).reduce((n, sk) => n + (sk.joints || []).length, 0);
  if (tem.size && !ossos) r.avisos.push(`${rel} não tem esqueleto (rig). Braços e rosto não dobram; confira a exportação (GUIA-MODELO-3D-SRPHONE.md).`);
  const materiais = (json.materials || []).length, texturas = (json.textures || []).length;
  if (!materiais) r.avisos.push(`${rel} não tem materiais: vai aparecer cinza.`);
  r.ok = `  mascote 3D: ${rel} · ${mb.toFixed(2)} MB · ${tem.size} animações · ~${tris} triângulos · ${ossos} ossos · ${materiais} materiais · ${texturas} texturas${ext.includes("EXT_meshopt_compression") ? " · Meshopt" : ""}`;
  return r;
}

// ---------- 2. configuração ----------
const d = lerDados();
const url = String(d.SITE_CONFIG && d.SITE_CONFIG.url || "").trim().replace(/\/+$/, "");
if (!url) avisos.push("SITE_CONFIG.url está vazio: canonical, Open Graph, robots.txt, sitemap.xml e páginas de produto não foram atualizados.");
else if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(url)) erros.push("SITE_CONFIG.url precisa ser só o endereço, com https:// e sem caminho. Ex.: https://www.seudominio.com.br");
const S = d.STORE_CONFIG || {};
if (String(S.whatsapp || "").replace(/\D/g, "").length < 12) erros.push("STORE_CONFIG.whatsapp precisa ter DDI + DDD + número (ex.: 5522999999999).");
if (S.mapaEmbed && !/^https:\/\/(www\.)?google\.com\/maps\/embed/.test(S.mapaEmbed)) erros.push("STORE_CONFIG.mapaEmbed precisa ser o link de incorporação do Google Maps (https://www.google.com/maps/embed?...).");
{
  // avaliações do Google: só dados reais, então aqui só se confere o formato
  const A = d.AVALIACOES_GOOGLE || {}, lista = Array.isArray(A.lista) ? A.lista : [];
  const nome = "AVALIACOES_GOOGLE";
  if (A.link && !/^https:\/\//.test(A.link)) erros.push(`${nome}.link precisa começar com https://`);
  if (A.linkAvaliar && !/^https:\/\//.test(A.linkAvaliar)) erros.push(`${nome}.linkAvaliar precisa começar com https:// (ou fique vazio)`);
  if (lista.length || A.link){
    if (!(A.nota >= 1 && A.nota <= 5)) erros.push(`${nome}.nota precisa ser a nota do Google, de 1 a 5 (ex.: 5.0).`);
    if (!Number.isInteger(A.total) || A.total < lista.length) erros.push(`${nome}.total precisa ser a quantidade de avaliações do Google (no mínimo ${lista.length}, o tamanho da lista).`);
    if (A.conferidoEm && !/^\d{4}-\d{2}-\d{2}$/.test(A.conferidoEm)) erros.push(`${nome}.conferidoEm precisa ser ano-mês-dia (ex.: 2026-09-29).`);
  }
  lista.forEach((a, i) => {
    if (!a || !String(a.nome || "").trim() || !String(a.texto || "").trim()) erros.push(`${nome}.lista[${i}]: falta o nome ou o texto.`);
    else if (!(Number.isInteger(a.nota) && a.nota >= 1 && a.nota <= 5)) erros.push(`${nome}.lista[${i}] (${a.nome}): nota precisa ser de 1 a 5.`);
  });
}
if (d.GA_MEASUREMENT_ID && !/^G-[A-Z0-9]{4,}$/i.test(d.GA_MEASUREMENT_ID)) erros.push("GA_MEASUREMENT_ID deve ter o formato G-XXXXXXXXXX.");
if ((d.SUPABASE_URL && !d.SUPABASE_ANON_KEY) || (!d.SUPABASE_URL && d.SUPABASE_ANON_KEY)) erros.push("Preencha SUPABASE_URL e SUPABASE_ANON_KEY juntos (ou deixe os dois vazios).");
if (d.SUPABASE_URL && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(d.SUPABASE_URL).replace(/\/+$/, ""))) avisos.push("SUPABASE_URL não parece o endereço de um projeto Supabase (https://xxxx.supabase.co). Se usar domínio próprio, libere-o no Content-Security-Policy (_headers e netlify.toml).");
if (d.TURNSTILE_SITE_KEY && !/^[0-9A-Za-z_-]{10,80}$/.test(String(d.TURNSTILE_SITE_KEY).trim())) erros.push("TURNSTILE_SITE_KEY não parece uma Site Key do Cloudflare Turnstile (ex.: 0x4AAAAAAA...). O segredo (Secret Key) NUNCA vai aqui.");
if (d.TURNSTILE_SITE_KEY && !d.SUPABASE_URL) avisos.push("TURNSTILE_SITE_KEY preenchida, mas a agenda online está desligada (SUPABASE_URL vazio): a caixinha anti-robô não aparece.");
if (d.SUPABASE_ANON_KEY){
  const k = String(d.SUPABASE_ANON_KEY).trim();
  if (papelJwt(k) === "service_role") erros.push("SUPABASE_ANON_KEY é a chave service_role! Troque pela chave pública (publishable). A service_role nunca pode ir para o site.");
  else if (/^sb_secret_/.test(k)) erros.push("SUPABASE_ANON_KEY é uma chave secreta (sb_secret_). Use a publishable (sb_publishable_...).");
  else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(k) && papelJwt(k) !== "anon")
    erros.push("SUPABASE_ANON_KEY não parece uma chave pública do Supabase. Use a Publishable key (sb_publishable_...) de Project Settings > API Keys.");
}
for (const p of d.EQUIPE || []) if (p.foto && !existe(p.foto)) erros.push(`Equipe: a foto de ${p.nome} não existe: ${p.foto}`);
{
  // Assistente SR Phone: imagem parada e, quando houver, o modelo 3D oficial (GLB)
  const A = d.ASSISTENTE || {};
  if (A.ligado !== false){
    if (!A.imagem || !existe(A.imagem)) erros.push(`ASSISTENTE.imagem não existe: ${A.imagem || "(vazio)"}. Gere com "npm run mascote:imagem".`);
    const infoGLB = A.modelo3d ? conferirGLB(A.modelo3d, A.animacoes || {}) : null;
    if (infoGLB) avisos.push(...infoGLB.avisos), erros.push(...infoGLB.erros), (infoGLB.ok && console.log(infoGLB.ok));
    const ATALHOS = new Set(["iphones", "preco", "cores", "troca", "agendar", "localizacao", "whatsapp", "recomendar"]);
    for (const [lista, nome] of [[A.atalhos, "atalhos"], [A.atalhosProduto, "atalhosProduto"]])
      for (const a of lista || []) if (!a || !ATALHOS.has(a.id) || !String(a.texto || "").trim())
        erros.push(`ASSISTENTE.${nome}: atalho inválido ${JSON.stringify(a)}. Use um destes ids: ${[...ATALHOS].join(", ")}.`);
    /* a IA: o site só conhece o endereço da função. Chave, modelo e limites ficam no servidor */
    const ia = A.ia || {};
    if (ia.ligada !== false && !/^\/[A-Za-z0-9/_.-]+$/.test(String(ia.endpoint || "")))
      erros.push(`ASSISTENTE.ia.endpoint precisa ser um endereço do próprio site (ex.: /api/assistente). A chave da IA nunca vai aqui: ela fica nas variáveis de ambiente do Netlify.`);
    if (Object.keys(ia).some((k) => !["ligada", "endpoint"].includes(k)))
      erros.push(`ASSISTENTE.ia só aceita "ligada" e "endpoint". Chave, modelo e limites da IA ficam nas variáveis de ambiente do Netlify (veja .env.example).`);
  }
}

{
  // Calculadora de entrega: só números e o endereço da função (a chave do mapa fica no Netlify)
  const E = d.DELIVERY_CONFIG;
  if (!E) erros.push("data/config.js: falta DELIVERY_CONFIG (a configuração da calculadora de entrega).");
  else if (E.ligada !== false){
    for (const k of ["baseFee", "pricePerKm", "minimumFee", "maximumDistanceKm"])
      if (typeof E[k] !== "number" || !isFinite(E[k]) || E[k] < 0) erros.push(`DELIVERY_CONFIG.${k} precisa ser um número (sem aspas), zero ou maior. Ex.: ${k}: 7`);
    if (!(E.maximumDistanceKm > 0)) erros.push("DELIVERY_CONFIG.maximumDistanceKm precisa ser maior que zero (o limite da entrega automática, em km).");
    const regras = Object.keys(d.ARREDONDA_ENTREGA || {});
    if (E.roundingMode !== undefined && !regras.includes(E.roundingMode))
      erros.push(`DELIVERY_CONFIG.roundingMode precisa ser uma destas regras: ${regras.map((r) => `"${r}"`).join(", ")}.`);
    if (!/^\/[A-Za-z0-9/_.-]+$/.test(String(E.endpoint || ""))) erros.push("DELIVERY_CONFIG.endpoint precisa ser um endereço do próprio site (ex.: /api/entrega). As chaves do mapa ficam nas variáveis de ambiente do Netlify.");
    const o = E.origem || {};
    if ((o.lat === null) !== (o.lng === null) || (o.lat !== null && !(o.lat >= -34 && o.lat <= 6 && o.lng >= -74 && o.lng <= -28)))
      erros.push("DELIVERY_CONFIG.origem: preencha lat e lng juntos, com o ponto da loja no Brasil (ou deixe os dois null para o Google achar pelo endereço).");
    if (Object.keys(E).some((k) => /key|chave|token|secret|senha/i.test(k))) erros.push("DELIVERY_CONFIG não pode ter chave. As chaves do mapa ficam nas variáveis de ambiente do Netlify (MAPS_SERVER_KEY e MAPS_BROWSER_KEY).");
  }
}

// ---------- 3. catálogo ----------
const cats = new Set((d.CATS || []).map((c) => c.id));
const STATUS = new Set(["", "disponivel", "ultimas-unidades", "sob-encomenda", "indisponivel", "consultar",
  /* nomes antigos, ainda aceitos */ "ultimas", "encomenda", "estoque", "consulte"]);
const ILUSTRACOES = new Set(["iphone-pro", "iphone-duplo", "watch"]);
const vazio = (v) => v === "" || v === null || v === undefined;
const valor = (v) => vazio(v) ? null : Number(typeof v === "number" ? v : /,/.test(String(v)) ? String(v).replace(/\./g, "").replace(",", ".") : v);
function confereOferta(nome, o){
  for (const campo of ["preco", "precoPix", "precoDe"]){
    const v = valor(o[campo]);
    if (v !== null && !(v > 0)) erros.push(`${nome}: ${campo} precisa ser um número maior que zero (ou null)`);
  }
  for (const campo of ["parcelas", "parcelasSemJuros", "estoque"]){
    if (!vazio(o[campo]) && !(Number.isInteger(Number(o[campo])) && Number(o[campo]) >= 0)) erros.push(`${nome}: ${campo} precisa ser um número inteiro (ou null)`);
  }
  if (!STATUS.has(String(o.status || "").toLowerCase())) erros.push(`${nome}: status "${o.status}" inválido. Use disponivel, ultimas-unidades, sob-encomenda, indisponivel ou consultar`);
  const preco = valor(o.preco), pix = valor(o.precoPix), de = valor(o.precoDe);
  if (pix && !preco) avisos.push(`${nome}: tem precoPix mas não tem preco (o Pix só aparece junto com o preço).`);
  if (pix && preco && pix > preco) avisos.push(`${nome}: precoPix (${pix}) maior que o preço (${preco}): o Pix foi ignorado.`);
  if (de && (!preco || de <= preco)) avisos.push(`${nome}: precoDe (${de}) não é maior que o preço: foi ignorado.`);
}
/* condições de pagamento (data/config.js > STORE_CONFIG.pagamento) */
const PG = S.pagamento || {};
if (!S.pagamento) avisos.push("STORE_CONFIG.pagamento não existe: o site não mostra formas nem condições de pagamento.");
for (const k of ["maxParcelas", "maxParcelasSemJuros"])
  if (!vazio(PG[k]) && !(Number.isInteger(Number(PG[k])) && Number(PG[k]) >= 0)) erros.push(`STORE_CONFIG.pagamento.${k} precisa ser um número inteiro (ou null).`);
if (!vazio(PG.descontoPix) && !(Number(PG.descontoPix) >= 0 && Number(PG.descontoPix) < 100)) erros.push("STORE_CONFIG.pagamento.descontoPix precisa ser uma porcentagem entre 0 e 99 (ou null).");
if (Number(PG.maxParcelas) > 0 && Number(PG.maxParcelasSemJuros) > Number(PG.maxParcelas))
  avisos.push("STORE_CONFIG.pagamento: maxParcelasSemJuros é maior que maxParcelas; o site usa maxParcelas como limite.");
const ids = new Map(), nomes = new Map();
const incompletos = { preco: [], "preco em parte das opcoes": [], disponibilidade: [], imagem: [], descricao: [] };
const produtos = (d.CATALOGO || []).filter((p) => p && p.nome).map((p) => d.normalizaProduto(p));
for (const p of produtos){
  const nome = p.nome;
  if (!/^[a-z0-9-]+$/.test(p.id)) erros.push(`id inválido em ${nome}: use só letras minúsculas, números e "-"`);
  if (ids.has(p.id)) erros.push(`id repetido: ${p.id}`);
  if (nomes.has(nome.toLowerCase())) erros.push(`produto repetido: ${nome}`);
  ids.set(p.id, true); nomes.set(nome.toLowerCase(), true);
  if (!cats.has(p.cat)) erros.push(`${nome}: categoria "${p.cat}" não existe em CATS`);
  confereOferta(nome, p);
  const opcoes = p.opcoes, cores = p.cores.map((c) => String(c[0]));
  /* com duas ou mais opções, o preço do produto valeria para todas: cada opção precisa do próprio preço */
  if (opcoes.length > 1 && ["preco", "precoPix", "precoDe"].some((k) => valor(p[k])))
    erros.push(`${nome}: tem ${opcoes.length} opções (${opcoes.join(", ")}) e preço no produto. Coloque o preço em "variantes", uma para cada opção que tem preço confirmado.`);
  for (const c of p.cores) if (!/^#[0-9a-f]{3,8}$/i.test(String(c[1] || "")) || !/^#[0-9a-f]{3,8}$/i.test(String(c[2] || ""))) erros.push(`${nome}: a cor "${c[0]}" precisa de duas cores no formato #RRGGBB`);
  for (const v of p.variantes){
    const op = String((v.opcao || v.armazenamento) || "").trim(), cor = String(v.cor || "").trim();
    if (op && !opcoes.includes(op)) erros.push(`${nome}: variante "${op}" não está em opcoes (${opcoes.join(", ") || "nenhuma"})`);
    else if (!op && opcoes.length > 1) erros.push(`${nome}: variante sem "opcao" num produto com várias opções. Diga a qual opção o preço vale.`);
    if (cor && !cores.includes(cor)) erros.push(`${nome}: variante com cor "${cor}", que não está em cores (${cores.join(", ")})`);
    confereOferta(`${nome} ${[op, cor].filter(Boolean).join(" ")}`, { ...p, ...Object.fromEntries(Object.entries(v).filter(([, x]) => !vazio(x))) });
  }
  if (p.ilustracao && !ILUSTRACOES.has(p.ilustracao)) erros.push(`${nome}: ilustracao "${p.ilustracao}" não existe. Use: ${[...ILUSTRACOES].join(", ")}`);
  if (/certificad|recondicionad[oa] pela apple/i.test(p.cond + " " + p.nome)) avisos.push(`${nome}: diz "certificado". Só mantenha se a loja tiver o comprovante da certificação.`);
  const imagens = [...p.imgs, ...d.fotosApple(p).map((f) => f.src)];
  for (const f of imagens) if (!existe(f)) erros.push(`${nome}: imagem não encontrada: ${f}`);
  for (const f of [p.modelo3d, p.unboxing3d].filter(Boolean)) if (!existe(f)) erros.push(`${nome}: arquivo 3D não encontrado: ${f}`);
  if (!d.menorPreco(p)) incompletos.preco.push(nome);
  else {
    /* produto com preço em algumas opções/cores: quais ainda estão "Preço sob consulta" */
    const faltam = [];
    (opcoes.length ? opcoes : [""]).forEach((op, i) => {
      const cs = cores.length ? cores : [""];
      const sem = cs.filter((_, c) => !d.precoDe(p, i, c));
      if (sem.length === cs.length) faltam.push(op || "preço");
      else if (sem.length) faltam.push(`${op ? op + " " : ""}(${sem.join(", ")})`);
    });
    if (faltam.length) incompletos["preco em parte das opcoes"].push(`${nome}: ${faltam.join(", ")}`);
  }
  const semStatus = (o) => (vazio(o.status) || /^consult/.test(String(o.status))) && vazio(o.estoque);
  if (semStatus(p) && !p.variantes.some((v) => !semStatus(v))) incompletos.disponibilidade.push(nome);
  if (!imagens.length) incompletos.imagem.push(nome + (p.ilustracao ? " (com ilustração)" : ""));
  if (!p.descricao) incompletos.descricao.push(nome);
}

// ---------- 4. endereço do site no <head>, páginas de produto, robots e sitemap ----------
const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const desfaz = (t) => String(t).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const tiraAtributos = (attrs, nomes) => attrs.replace(new RegExp(`\\s(?:${nomes.join("|")})="[^"]*"`, "g"), "");
/* textos fixos sobre nota fiscal: "em todas as vendas" só com novos E seminovos confirmados (data/config.js) */
const RE_NF = /<(p|span|b)((?:\s[^>]*?)?\sdata-nf-todas="([^"]*)"(?:\s[^>]*?)?\sdata-nf-novos="([^"]*)"[^>]*)>([\s\S]*?)<\/\1>/g;
const aplicaNotaFiscal = (h) => h.replace(RE_NF, (m, tag, attrs, todas, novos) => `<${tag}${attrs}>${d.notaFiscalEmTodas() ? todas : novos}</${tag}>`);
/* página de produto CPO / seminovo: os textos gerais que falam de aparelho novo, lacrado, caixa lacrada,
   nota fiscal ou garantia do fabricante são trocados, JÁ NO HTML, pelo texto do atributo data-cpo */
const RE_CPO = /<(p|span|b)((?:\s[^>]*?)?\sdata-cpo="([^"]*)"[^>]*)>([\s\S]*?)<\/\1>/g;
function textosCpo(h, p){
  const fichas = {
    "{nf}": d.textoNotaFiscal(p),
    "{garantia}": d.frase(d.garantiaDe(p)),
    "{nf_curto}": d.temNotaFiscal(p) ? "Emitida em nome do comprador" : "Consulte no atendimento",
    "{garantia_curto}": String(S.garantiaSeminovos || "").trim() || "Informada antes da compra"
  };
  return h.replace(RE_CPO, (m, tag, attrs, texto) => {
    const limpo = desfaz(texto).replace(/\{[a-z_]+\}/g, (k) => { if (!(k in fichas)) erros.push(`index.html: data-cpo com ficha desconhecida ${k}`); return fichas[k] || ""; });
    return `<${tag}${tiraAtributos(attrs, ["data-cpo", "data-nf-todas", "data-nf-novos"])}>${esc(limpo.replace(/\s+/g, " ").trim())}</${tag}>`;
  });
}
const semMarcasCpo = (h) => h.replace(RE_CPO, (m, tag, attrs, texto, dentro) => `<${tag}${tiraAtributos(attrs, ["data-cpo"])}>${dentro}</${tag}>`);
const cidade = [S.cidade].filter(Boolean).join("");
if (url && !erros.length){
  const hoje = new Date().toISOString().slice(0, 10);
  let html = aplicaNotaFiscal(ler("index.html"));
  const troca = [
    [/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}/">`],
    [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}/">`],
    [/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${url}/assets/hero-srphone.jpg">`],
    [/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${url}/assets/hero-srphone.jpg">`]
  ];
  for (const [re, novo] of troca){
    if (!re.test(html)) erros.push(`index.html: não achei ${re}`);
    html = html.replace(re, novo);
  }
  /* o endereço que aparece antes do JavaScript: o mesmo de STORE_CONFIG (o site troca igual, em js/site.js) */
  const enderecoCurto = S.endereco ? [String(S.endereco).split(",").slice(0, 2).join(","), S.bairro].filter(Boolean).join(" · ") : [S.cidade, S.estado].filter(Boolean).join(" · ");
  html = html.replace(/(<span data-endereco>)[^<]*(<\/span>)/g, (m, a, b) => a + esc(enderecoCurto) + b);
  grava("index.html", html);

  /* página própria de cada produto: a mesma página do site, com o <head> do produto e os
     caminhos dos arquivos ajustados (a página fica dois níveis abaixo: produto/<id>/) */
  const tituloInicio = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "SR Phone";
  const relativo = (v) => !/^(?:[a-z][a-z0-9+.-]*:|\/|#|\{)/i.test(v) && v !== "";
  const sobeDois = (h) => h
    .replace(/\s(src|href|poster)="([^"]*)"/g, (m, at, v) => relativo(v) ? ` ${at}="../../${v}"` : m)
    .replace(/\s(srcset)="([^"]*)"/g, (m, at, v) => ` ${at}="${v.split(",").map((parte) => { const s = parte.trim(); return relativo(s) ? "../../" + s : s; }).join(", ")}"`);
  const paginas = [];
  for (const p of produtos){
    const canon = d.urlProduto(url, p);
    const titulo = `${p.nome}${cidade ? " em " + cidade : ""} | SR Phone`;
    const desc = d.descricaoCurta(p, cidade ? cidade + (S.estado ? "/" + S.estado : "") : "");
    const img = d.galeria(p).filter(d.eImagem)[0];
    const imgUrl = img ? `${url}/${img.src}` : `${url}/assets/hero-srphone.jpg`;
    const imgAlt = img ? `${p.nome}, imagem de divulgação` : "Logo da SR Phone sobre um pódio iluminado";
    /* seminovo: textos gerais de "novo / lacrado / nota fiscal / garantia do fabricante" trocados no HTML */
    let h = sobeDois(d.eSeminovo(p) ? textosCpo(html, p) : semMarcasCpo(html));
    const meta = [
      [/<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`],
      [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`],
      [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(p.nome + " | SR Phone " + cidade)}">`],
      [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`],
      [/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(imgUrl)}">`],
      [/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${esc(imgAlt)}">`],
      [/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="product">`],
      [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(canon)}">`],
      [/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(p.nome + " | SR Phone " + cidade)}">`],
      [/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`],
      [/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(imgUrl)}">`],
      [/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(canon)}">`],
      [/(<meta name="viewport"[^>]*>)/, `$1\n<!-- Página gerada por "npm run build" a partir do index.html e de data/products.js. Não edite: rode o build. -->\n` +
        `<meta name="sr-raiz" content="../../">\n<meta name="sr-produto" content="${esc(p.id)}">\n<meta name="sr-titulo-inicio" content="${esc(tituloInicio)}">`],
      [/(<main id="conteudo" tabindex="-1">)/, `$1\n<noscript><section class="wrap sem-js"><h1>${esc(p.nome)}</h1>` +
        (d.eSeminovo(p)
          ? `<p><b>${esc(p.cond)}.</b> Não é novo nem lacrado. Condição conferida no atendimento.</p><p>${esc(d.TXT_CONFERE_SEMINOVO)}</p>` +
            `<p>${esc(d.frase(d.garantiaDe(p)))} ${esc(d.textoNotaFiscal(p))}</p>`
          : (p.cond ? `<p><b>${esc(p.cond)}.</b></p>` : "")) +
        `<p>${esc(p.txt || "")}</p>` +
        `<p>Para ver fotos, opções, cores e valor, ative o JavaScript do navegador ou fale com a loja pelo WhatsApp.</p></section></noscript>`]
    ];
    for (const [re, novo] of meta){
      if (!re.test(h)) { erros.push(`página de ${p.nome}: não achei ${re}`); continue; }
      h = h.replace(re, novo);
    }
    grava(`produto/${p.id}/index.html`, h);
    paginas.push(p);
  }
  /* páginas de produto que saíram do catálogo: apagadas (a Netlify manda para o início) */
  if (existe("produto")){
    for (const dir of fs.readdirSync(arq("produto"))){
      if (!ids.has(dir) && fs.existsSync(arq(`produto/${dir}/index.html`))){
        if (CONFERIR) desatualizados.push(`produto/${dir}/ (produto que saiu do catálogo)`);
        else { fs.rmSync(arq(`produto/${dir}`), { recursive: true, force: true }); gravados.push(`produto/${dir}/ (apagada)`); }
      }
    }
  }

  grava("robots.txt",
`# Gerado por "npm run build" a partir de SITE_CONFIG.url (data/config.js).
# Tudo o que é público pode ser indexado. As pastas de trabalho do projeto não vão para o visitante.
User-agent: *
Allow: /
Disallow: /ferramentas/
Disallow: /docs/
Disallow: /supabase/
Disallow: /funcionario/

Sitemap: ${url}/sitemap.xml
`);
  grava("sitemap.xml",
`<?xml version="1.0" encoding="UTF-8"?>
<!-- Gerado por "npm run build" a partir de SITE_CONFIG.url (data/config.js) e de data/products.js.
     Página inicial + uma página por produto. Seções (#catalogo, #troca...) são âncoras da página inicial. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}/</loc>
    <lastmod>${hoje}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${paginas.map((p) => `  <url>
    <loc>${esc(d.urlProduto(url, p))}</loc>
    <lastmod>${hoje}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join("\n")}
</urlset>
`);
}

// ---------- relatório ----------
if (CONFERIR){
  if (erros.length){ console.error("\nERROS:\n  - " + erros.join("\n  - ") + "\n"); process.exit(1); }
  if (desatualizados.length){
    console.error("\nArquivos gerados desatualizados (rode \"npm run build\"):\n  - " + desatualizados.join("\n  - ") + "\n");
    process.exit(1);
  }
  console.log("Arquivos gerados em dia.");
  process.exit(0);
}
console.log(`\nSR Phone · build\n  produtos: ${produtos.length}   endereço: ${url || "(vazio)"}`);
console.log(`  arquivos atualizados: ${gravados.length ? gravados.length + " → " + (gravados.length > 6 ? gravados.slice(0, 6).join(", ") + "…" : gravados.join(", ")) : "nenhum (já estavam em dia)"}`);
console.log("\nProdutos incompletos (preencha em data/products.js):");
for (const [k, lista] of Object.entries(incompletos))
  console.log(`  sem ${k}: ${lista.length}${lista.length ? " → " + lista.join(", ") : ""}`);
const vazios = ["cnpj", "razaoSocial", "email", "mapaEmbed"].filter((k) => !S[k]);
if (!(d.AVALIACOES_GOOGLE && d.AVALIACOES_GOOGLE.link)) vazios.push("AVALIACOES_GOOGLE.link");
if (vazios.length) console.log(`\nDados da empresa ainda vazios em data/config.js: ${vazios.join(", ")}`);
if (!d.GA_MEASUREMENT_ID) console.log("Google Analytics: desligado (GA_MEASUREMENT_ID vazio).");
if (!d.SUPABASE_URL) console.log("Agenda online: desligada (SUPABASE_URL vazio). O agendamento usa o WhatsApp.");
if (d.DELIVERY_CONFIG && d.DELIVERY_CONFIG.ligada !== false){
  const E = d.DELIVERY_CONFIG;
  console.log(`Entrega: taxa R$ ${E.baseFee} + R$ ${E.pricePerKm}/km, mínimo R$ ${E.minimumFee}, até ${E.maximumDistanceKm} km, arredondamento "${E.roundingMode || "centavos"}"${E.tarifasConfirmadas === true ? " (confirmados pela loja)" : " (valores de EXEMPLO: tarifasConfirmadas false; o site avisa o cliente)"}. ` +
    "Precisa de MAPS_SERVER_KEY e MAPS_BROWSER_KEY no Netlify; sem elas, o site oferece a retirada e o WhatsApp. Veja PRODUCAO-SRPHONE.md.");
}
for (const a of avisos) console.log("\nAVISO: " + a);
if (erros.length){
  console.error("\nERROS:\n  - " + erros.join("\n  - "));
  console.error("\nBUILD COM ERROS: corrija os itens acima.\n");
  process.exit(1);
}
console.log("\nBUILD CONCLUÍDO COM SUCESSO\n");
