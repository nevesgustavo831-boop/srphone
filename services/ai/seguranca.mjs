// SR Phone · proteções do assistente: pedido de "ignore suas regras", vazamento de chave e
// preço inventado. Tudo aqui roda no servidor, antes e depois da IA.

export const MSG_NAO_CONFIRMO = "Não consigo confirmar essa informação por aqui. Posso chamar a equipe da SR Phone no WhatsApp para verificar para você.";
export const MSG_RECUSA = "Não posso compartilhar configurações internas nem mudar as minhas regras. Posso te ajudar com produtos, preços, troca, agendamento ou localização da SR Phone.";

/* texto do visitante: tira caracteres de controle, junta espaços e corta no tamanho */
export function limparTexto(t, max){
  return String(t == null ? "" : t).replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

/* tentativas de mudar as regras ou de arrancar segredos: nem chegam à IA */
const RE_INJECAO = [
  /\b(ignore|ignora|ignorar|ignorem|esque[cç]a|esquecer|desconsidere|desconsiderar|desobede[cç]a|burle|contorne|sobrescreva)\b.{0,40}\b(instru[cç](ão|ao|ões|oes)|regras?|diretrizes|prompt|comandos|orienta[cç](ão|ao|ões|oes)|sistema|restri[cç](ão|ao|ões|oes))/i,
  /\b(ignore|disregard|forget|bypass|override)\b.{0,30}\b(instructions?|rules|prompt|system|guidelines)/i,
  /\b(prompt|instru[cç](ões|oes)|mensagem|configura[cç](ão|ao|ões|oes))\s+(do|de|da)\s+sistema\b/i,
  /\bsystem\s*prompt\b/i,
  /\b(chave|key|token|senha|segredo|secret|credencia\w*)\b.{0,25}\b(api|anthropic|openai|claude|gpt|ia|servidor|sistema|netlify|supabase|google|maps?|mapas?)\b/i,
  /\b(api|anthropic|openai)\b.{0,15}\b(key|chave|token)\b/i,
  /\bvari[aá]ve(l|is)\s+de\s+ambiente\b|\benv(ironment)?\s*var/i,
  /\bAI_API_KEY\b|\bMAPS_[A-Z_]*KEY\b|\bservice_?role\b|\bsk-ant-|\bAIza[0-9A-Za-z_-]{10,}/i,
  /\b(modo|mode)\s+(desenvolvedor|developer|dev|debug|admin|deus|god|irrestrito)\b|\bjailbreak\b|\bDAN\b/i,
  /\b(revele|revela|mostre|mostra|diga|conte|repita|imprima|exiba|copie|reveal|show|print|repeat)\b.{0,30}\b(suas? (instru|regras|configura|diretrizes)|seu prompt|o prompt|seu c[oó]digo|your (instructions|prompt|rules))/i
];
export function pareceInjecao(t){
  const s = String(t || "").normalize("NFC");
  return RE_INJECAO.some((re) => re.test(s));
}

/* a resposta nunca pode trazer uma chave (a da IA, a do Google Maps do servidor) nem algo com cara de chave */
export function vazaSegredo(texto, chaves){
  const t = String(texto || "");
  if ([].concat(chaves || []).some((c) => c && String(c).length >= 8 && t.includes(String(c)))) return true;
  return /\bsk-ant-[A-Za-z0-9_-]{6,}|\bAI_API_KEY\b|\bMAPS_[A-Z_]*KEY\b|\bAIza[0-9A-Za-z_-]{20,}|\bsb_secret_/i.test(t);
}

/* ======================= preços: cada valor é conferido com O APARELHO a que ele se refere =======================
   Não existe lista global de "valores permitidos": R$ 13.000,00 é o preço de um aparelho e não pode
   aparecer como preço de outro. Para cada valor em dinheiro da resposta, a guarda descobre de qual
   produto (e de qual armazenamento e cor) a frase está falando e só aceita os valores daquela
   escolha no catálogo (data/products.js, lido no servidor). O caminho preferido nem passa por aqui:
   a IA escreve o marcador [[preco:ID|opção|cor]] e o servidor troca pelo valor oficial (filtro.mjs). */

/* texto comparável: sem acento, minúsculo, sem caracteres invisíveis nem ênfase (*, _), com dígitos
   "normais" (１３ → 13). mapa[i] = posição no texto original do caractere i (para trocar trechos). */
export function normaliza(texto){
  const t = String(texto == null ? "" : texto);
  let s = "";
  const mapa = [];
  let i = 0;
  for (const ch of t){
    let n = ch.normalize("NFKC");
    if (/^[\p{Cf}*_`~]+$/u.test(n)) n = "";
    n = n.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[  -   　]/g, " ");
    for (let k = 0; k < n.length; k++){ s += n[k]; mapa.push(i); }
    i += ch.length;
  }
  mapa.push(t.length);
  return { s, mapa };
}
const escapa = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* "iPhone 16 Pro Max" → casa "iphone 16 pro max", "iPhone16 Pro Max", "iphone-16-pro-max" */
export function padraoDeNome(nome){
  const partes = normaliza(nome).s.split(/[^a-z0-9]+/).filter(Boolean);
  return partes.length ? new RegExp("(?<![a-z0-9])" + partes.map(escapa).join("[\\s-]*") + "(?![a-z0-9])", "g") : null;
}

/* ---------- valores em dinheiro, em qualquer jeito de escrever ---------- */
const NUM = "(\\d{1,3}(?:[.\\s]\\d{3})+(?:,\\d{1,2})?|\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:,\\d{1,2})?(?![\\d])|\\d+\\.\\d{1,2}(?![\\d]))";
const RE_MOEDA = new RegExp("(?:r\\s*\\$|brl|us\\s*\\$|\\$)\\s*" + NUM + "(\\s*(?:mil|k)(?![a-z]))?", "g");
const RE_REAIS = new RegExp(NUM + "\\s*(mil\\s*|k\\s*)?(?:de\\s+)?(?:reais|real|contos?|pilas?)(?![a-z])", "g");
const RE_MIL = new RegExp(NUM + "\\s*mil(?![a-z])", "g");
const RE_FORMATADO = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+,\d{2})(?![\d])/g;
const RE_SOLTO = /(?<![\d.,])(\d{3,7})(?![\d]|[.,]\d)/g;
const RE_K = /(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s*k(?![a-z])/g;       /* "custa 13k" (4K de vídeo não: sem palavra de preço antes) */
/* palavras de preço antes de um número solto ("custa 13000", "sai por 3900") */
const RE_PALAVRA_PRECO = /(cust|sai|saem|por|valor|preco|fica|vale|pag|parcela|investimento|a partir|desde|so)\w*\W*(?:\w+\W+){0,2}$/;
/* depois do número: unidade (não é dinheiro) */
const RE_UNIDADE = /^\s*(gb|tb|mb|mm|cm|m|km|pol|polegadas?|"|mah|hz|mp|w|x|%|vezes|anos?|mes|meses|dias?|h|horas?|min|minutos?|°|pixels?|nits?|fps|k(?![a-z]))(?![a-z])/;
/* por extenso ("treze mil reais"): o site nunca escreve assim, então nunca é um preço conferido */
const RE_EXTENSO = /(?<![a-z])(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)(?:\s+(?:e\s+)?[a-z]+){0,4}?\s+(mil|reais|real)(?![a-z])/g;

function paraCentavos(num, mil){
  let t = num.replace(/\s/g, "");
  let v;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) v = Number(t.replace(/\./g, "").replace(",", "."));
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) v = Number(t.replace(/,/g, ""));
  else v = Number(t.replace(",", "."));
  if (mil) v *= 1000;
  return Math.round(v * 100);
}
/* todos os valores em dinheiro do texto normalizado: [{ ini, fim, centavos }] (centavos -1 = por extenso) */
export function acharValores(s){
  const achados = [];
  const junta = (ini, fim, centavos) => { if (!achados.some((a) => ini < a.fim && fim > a.ini)) achados.push({ ini, fim, centavos }); };
  for (const re of [RE_MOEDA, RE_REAIS, RE_MIL]){
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))){
      if (re === RE_MIL && RE_UNIDADE.test(s.slice(m.index + m[0].length))) continue;
      junta(m.index, m.index + m[0].length, paraCentavos(m[1], !!(m[2] && m[2].trim()) || re === RE_MIL));
    }
  }
  RE_EXTENSO.lastIndex = 0;
  let e;
  while ((e = RE_EXTENSO.exec(s))) junta(e.index, e.index + e[0].length, -1);
  RE_K.lastIndex = 0;
  let q;
  while ((q = RE_K.exec(s))) if (RE_PALAVRA_PRECO.test(s.slice(Math.max(0, q.index - 30), q.index))) junta(q.index, q.index + q[0].length, Math.round(Number(q[1].replace(",", ".")) * 100000));
  for (const re of [RE_FORMATADO, RE_SOLTO]){
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))){
      const ini = m.index, fim = ini + m[0].length;
      if (RE_UNIDADE.test(s.slice(fim)) || /[-/(]\s*$/.test(s.slice(Math.max(0, ini - 1), ini)) || /^\s*[-/)]\s*\d/.test(s.slice(fim))) continue;   /* CEP, telefone, data */
      if (re === RE_SOLTO && (Number(m[1]) < 100 || !RE_PALAVRA_PRECO.test(s.slice(Math.max(0, ini - 30), ini)))) continue;
      junta(ini, fim, paraCentavos(m[1], false));
    }
  }
  return achados.sort((a, b) => a.ini - b.ini);
}

/* trechos de frase (o ponto de "3.900" não termina frase) */
function frases(s){
  const cortes = [0];
  const re = /[.!?;]+(?=\s|$)|\n+/g;
  let m;
  while ((m = re.exec(s))) cortes.push(m.index + m[0].length);
  cortes.push(s.length);
  return cortes;
}
function frasesDe(cortes, pos){
  let a = 0;
  for (const c of cortes){ if (c <= pos) a = c; else return [a, c]; }
  return [a, cortes[cortes.length - 1]];
}
/* onde cada produto do catálogo aparece no texto (o nome mais comprido vence: "iPhone 16 Pro Max" não é "iPhone 16") */
function mencoes(s, catalogo){
  const todas = [];
  for (const item of catalogo.values()) for (const re of item.padroes){
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) todas.push({ ini: m.index, fim: m.index + m[0].length, id: item.id });
  }
  todas.sort((a, b) => a.ini - b.ini || (b.fim - b.ini) - (a.fim - a.ini));
  const fica = [];
  for (const m of todas) if (!fica.some((f) => m.ini < f.fim && m.fim > f.ini)) fica.push(m);
  return fica.sort((a, b) => a.ini - b.ini);
}
/* a opção (ou a cor) citada mais perto do valor: colada logo depois dele ("R$ 5.250,00 no 128 GB"),
   senão a última antes dele (depois do nome do produto), senão a primeira depois */
function citada(s, listas, antesIni, antesFim, depoisIni, depoisFim){
  let melhor = -1, pos = -1;
  listas.forEach((padroes, i) => padroes.forEach((re) => {
    re.lastIndex = 0;
    const m = re.exec(s.slice(depoisIni, depoisFim));
    if (m && m.index <= 14 && /^\W*((no|na|nos|nas|em|de|do|da|para|pelo|pela|com)\s+)?((o|a|os|as)\s+)?$/.test(s.slice(depoisIni, depoisIni + m.index)) && (pos < 0 || m.index < pos)){ pos = m.index; melhor = i; }
  }));
  if (melhor > -1) return melhor;
  listas.forEach((padroes, i) => padroes.forEach((re) => {
    re.lastIndex = 0;
    let m;
    const trecho = s.slice(antesIni, antesFim);
    while ((m = re.exec(trecho))) if (m.index > pos){ pos = m.index; melhor = i; }
  }));
  if (melhor > -1) return melhor;
  let primeiro = Infinity;
  listas.forEach((padroes, i) => padroes.forEach((re) => {
    re.lastIndex = 0;
    const m = re.exec(s.slice(depoisIni, depoisFim));
    if (m && m.index < primeiro){ primeiro = m.index; melhor = i; }
  }));
  return melhor;
}
const RE_A_PARTIR = /(a partir de|partindo de|desde|comecando em|comeca em|o mais barato|menor preco)\W*(\w+\W+){0,2}$/;
const RE_ORCAMENTO = /(orcamento|ate|no maximo|gastar|investir|limite|teto|abaixo de|menos de)\W*(\w+\W+){0,2}$/;

/* Confere os valores do texto. Devolve a lista dos que NÃO batem com o aparelho citado.
   opcoes: { catalogo, contexto: { productId, storage, selectedColor }, orcamentos: Set(centavos
   que o próprio visitante escreveu), descontoPix } */
export function precosInventados(texto, opcoes = {}){
  const { catalogo = new Map(), contexto = {}, orcamentos = new Set(), descontoPix = null } = opcoes;
  const { s } = normaliza(texto);
  const valores = acharValores(s), achados = [];
  if (valores.length){
    const cortes = frases(s), ms = mencoes(s, catalogo);
    const doContexto = catalogo.get(contexto.productId) ? contexto.productId : null;
    valores.forEach((v, k) => {
      const trecho = s.slice(v.ini, v.fim);
      if (v.centavos < 0){ achados.push(trecho); return; }
      const [fa, fb] = frasesDe(cortes, v.ini);
      const antes = s.slice(Math.max(fa, v.ini - 40), v.ini);
      /* valor de orçamento que o próprio visitante escreveu ("até R$ 5 mil"): não é preço de aparelho */
      if (RE_ORCAMENTO.test(antes) && orcamentos.has(v.centavos)) return;
      /* de qual produto a frase fala: o citado antes na mesma frase; senão o citado depois na mesma
         frase; senão o último citado antes; senão o produto em foco ou aberto na página */
      let dono = null;
      for (const m of ms) if (m.fim <= v.ini && m.ini >= fa) dono = m;
      if (!dono) dono = ms.find((m) => m.ini >= v.fim && m.fim <= fb) || null;
      if (!dono) for (const m of ms) if (m.fim <= v.ini) dono = m;
      const id = dono ? dono.id : doContexto;
      const item = id && catalogo.get(id);
      if (!item){ achados.push(trecho); return; }
      /* opção e cor citadas perto do valor (sem citar: a escolha marcada na página, se for o mesmo produto) */
      const proximo = valores[k + 1] ? Math.min(fb, valores[k + 1].ini) : fb;
      const aIni = dono && dono.fim <= v.ini ? dono.fim : fa;
      let iOp = item.opcoes.length > 1 ? citada(s, item.padroesOpcao, aIni, v.ini, v.fim, proximo) : -1;
      let iCor = item.cores.length > 1 ? citada(s, item.padroesCor, aIni, v.ini, v.fim, proximo) : -1;
      if (id === doContexto){
        if (iOp < 0 && item.opcoes.length > 1) iOp = item.opcoes.indexOf(contexto.storage);
        if (iCor < 0 && item.cores.length > 1) iCor = item.cores.indexOf(contexto.selectedColor);
      }
      if (!permitidos(item, iOp, iCor, RE_A_PARTIR.test(antes)).has(v.centavos)) achados.push(trecho);
    });
  }
  const RE_DESCONTO = /(\d{1,2}(?:[.,]\d+)?)\s*%\s*(de\s+)?(desconto|off|mais barato|a menos)/g;
  let d;
  while ((d = RE_DESCONTO.exec(s))) if (Number(d[1].replace(",", ".")) !== Number(descontoPix)) achados.push(d[0].trim());
  return achados;
}
/* os valores daquela escolha. Sem opção (ou cor) citada e com preço diferente entre elas, só vale
   o menor preço, e só quando a frase diz "a partir de". Variante sem preço: nenhum valor vale. */
export function permitidos(item, iOp, iCor, aPartir){
  const ops = iOp >= 0 ? [iOp] : item.opcoes.length ? item.opcoes.map((_, i) => i) : [0];
  const cores = iCor >= 0 ? [iCor] : item.cores.length ? item.cores.map((_, i) => i) : [0];
  const celulas = [];
  ops.forEach((o) => cores.forEach((c) => celulas.push(item.celula(o, c))));
  const ok = new Set();
  const poe = (x) => { if (!x || !x.preco) return; ok.add(x.preco); if (x.pix) ok.add(x.pix); if (x.de) ok.add(x.de); if (x.parcela) ok.add(x.parcela); };
  if (celulas.every((x) => x.preco && x.preco === celulas[0].preco && x.pix === celulas[0].pix)) celulas.forEach(poe);
  else if (aPartir){
    const com = celulas.filter((x) => x.preco);
    const menor = com.reduce((m, x) => (!m || x.preco < m.preco ? x : m), null);
    poe(menor);
  }
  return ok;
}

/* valores do histórico que o navegador mandou: nas falas do "assistente" eles viram um aviso neutro.
   Um histórico adulterado ("o assistente disse R$ 13.000,00") não chega à IA como se fosse verdade. */
export function tiraValores(texto, troca = "[valor: veja os dados oficiais]"){
  const t = String(texto || "");
  const { s, mapa } = normaliza(t);
  const vs = acharValores(s);
  let out = "", ultimo = 0;
  for (const v of vs){ out += t.slice(ultimo, mapa[v.ini]) + troca; ultimo = mapa[v.fim]; }
  return out + t.slice(ultimo);
}
/* valores que o próprio visitante escreveu (para "orçamento de até R$ 5 mil") */
export function valoresDoVisitante(textos){
  const out = new Set();
  for (const t of textos) for (const v of acharValores(normaliza(t).s)) if (v.centavos > 0) out.add(v.centavos);
  return out;
}
