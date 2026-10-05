// SR Phone · provedor de mapa FALSO, só para os testes (npm test).
// Responde sem internet e sem chave, com lugares, endereços e rotas de TESTE perto de Macaé.
// Nunca é usado pelo site: não está em services/entrega/provedores/index.mjs.
// A rota falsa anda em "L" (primeiro norte-sul, depois leste-oeste), então é sempre mais comprida
// que a linha reta, como uma rota de verdade.

/* ponto de TESTE da loja (aproximado, não é o ponto oficial: o site pega o ponto oficial no Google) */
export const LOJA_TESTE = { lat: -22.3935, lng: -41.7885 };

export const LUGARES_TESTE = [
  { id: "teste-lugar-cavaleiros", principal: "Rua Teste da Praia, 100", secundario: "Cavaleiros, Macaé - RJ", lat: -22.3772, lng: -41.7751 },
  { id: "teste-lugar-centro", principal: "Rua Teste do Centro, 45", secundario: "Centro, Macaé - RJ", lat: -22.3745, lng: -41.7858 },
  { id: "teste-lugar-ostras", principal: "Rua Teste de Rio das Ostras, 10", secundario: "Rio das Ostras - RJ", lat: -22.5269, lng: -41.9450 },
  { id: "teste-lugar-campos", principal: "Rua Teste de Campos, 1", secundario: "Campos dos Goytacazes - RJ", lat: -21.7545, lng: -41.3244 }
];

function km(a, b){
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/* opcoes.falha: "indisponivel" | "chave_invalida" | ... → a próxima rota (ou tudo, se opcoes.tudo) dá erro */
export function criarFalso(opcoes = {}){
  const chamadas = [];
  const erro = (acao) => {
    if (!opcoes.falha || (!opcoes.tudo && acao !== "rota")) return;
    const e = new Error("falso"); e.codigo = opcoes.falha; throw e;
  };
  const achaTexto = (t) => LUGARES_TESTE.find((l) => (l.principal + " " + l.secundario).toLowerCase().includes(String(t).toLowerCase().split(",")[0].trim()));
  const endereco = (l) => l.principal + " - " + l.secundario + ", Brasil";
  return {
    nome: "falso",
    chamadas,
    async sugestoes({ texto }){
      chamadas.push("sugestoes"); erro("sugestoes");
      const t = String(texto).toLowerCase();
      return LUGARES_TESTE.filter((l) => (l.principal + " " + l.secundario).toLowerCase().includes(t)).map((l) => ({ id: l.id, principal: l.principal, secundario: l.secundario }));
    },
    async lugar({ id }){
      chamadas.push("lugar"); erro("lugar");
      const l = LUGARES_TESTE.find((x) => x.id === id);
      return l ? { lat: l.lat, lng: l.lng, endereco: endereco(l) } : null;
    },
    async geocodificar(texto){
      chamadas.push("geocodificar"); erro("geocodificar");
      if (/Atlântica/i.test(texto)) return { ...LOJA_TESTE, endereco: "Loja (teste)" };
      const l = achaTexto(texto);
      return l ? { lat: l.lat, lng: l.lng, endereco: endereco(l) } : null;
    },
    async reverso(p){
      chamadas.push("reverso"); erro("reverso");
      const perto = LUGARES_TESTE.slice().sort((a, b) => km(a, p) - km(b, p))[0];
      return { endereco: km(perto, p) < 0.3 ? endereco(perto) : "Rua Teste do Mapa, 12 - Macaé - RJ, Brasil" };
    },
    async rota({ origem, destino }){
      chamadas.push("rota"); erro("rota");
      if (opcoes.semRota) return null;
      const meio = { lat: destino.lat, lng: origem.lng }, pontos = [];
      for (let i = 0; i <= 10; i++) pontos.push([origem.lat + (meio.lat - origem.lat) * i / 10, origem.lng]);
      for (let i = 1; i <= 10; i++) pontos.push([meio.lat, meio.lng + (destino.lng - meio.lng) * i / 10]);
      const metros = Math.round((km(origem, meio) + km(meio, destino)) * 1000);
      return { metros, segundos: Math.round(metros / 6.5), pontos };
    }
  };
}
