/* SR Phone · mascote 3D do Assistente SR Phone
   ------------------------------------------------------------------
   Este arquivo é um módulo e NÃO vem com a página: js/assistente.js só o importa
   depois que o site terminou de carregar, com o navegador parado e só se houver WebGL.
   Ele traz junto o Three.js enxuto de assets/vendor/three/ (só as partes usadas aqui).

   O personagem:
     1. O MASCOTE DA MARCA (padrão): montado aqui mesmo em 3D, com as peças da arte da SR Phone
        (o iPhone preto de moldura cobre, a câmera tripla champanhe, o chapéu fedora com faixa
        cobre, o monóculo, o bigode), mais braços, mãos com luva, pernas e sapatos de verniz.
        É leve (nenhum arquivo a mais para baixar) e animado por poses com transição suave.
     2. UM GLB DE ARTISTA (opcional): se um dia existir o arquivo de ASSISTENTE.modelo3d
        (data/config.js, por padrão assets/modelos/srphone-assistant.glb), é ele que aparece, e as
        animações dele (Idle, Hover, Wave, Welcome, LookAround, Thinking, Talking01, Talking02,
        Point, Present, ThumbsUp, Goodbye) tocam pelo AnimationMixer. O leitor de GLB só é
        baixado nesse caso. Sem o arquivo, o Netlify (e o npm start) entregam no lugar dele um
        aviso pequeno (assets/modelos/sem-modelo.json), sem erro 404, e fica o mascote da marca.

   Estados (quem escolhe é o js/assistente.js; aqui só se desenha):
     idle · hover · greeting · welcome · lookaround · thinking · speaking · pointing ·
     present · success · goodbye
   Um estado por vez: cada um tem a sua pose e a troca é sempre suave (nunca dois gestos
   brigando). O personagem fica em pé no chão: a respiração é dos joelhos, não uma flutuação. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial,
  MeshBasicMaterial, ExtrudeGeometry, Shape, LatheGeometry, SphereGeometry, CapsuleGeometry,
  CylinderGeometry, TorusGeometry, TubeGeometry, CatmullRomCurve3, PlaneGeometry, CircleGeometry,
  Vector2, Vector3, Box3, Color, HemisphereLight, DirectionalLight, CanvasTexture, SRGBColorSpace,
  NeutralToneMapping, PMREMGenerator, RoomEnvironment
} from "../assets/vendor/three/three-mascote-0.186.1.min.js";

export const ESTADOS = ["idle", "hover", "greeting", "welcome", "lookaround", "thinking", "speaking", "pointing", "present", "success", "goodbye"];
/* nomes das animações dentro do GLB, por estado (data/config.js pode trocar) */
export const ANIMACOES_PADRAO = {
  idle: "Idle", hover: "Hover", greeting: "Wave", welcome: "Welcome", lookaround: "LookAround", thinking: "Thinking",
  speaking: ["Talking01", "Talking02"], pointing: "Point", present: "Present", success: "ThumbsUp", goodbye: "Goodbye"
};
/* as 8 obrigatórias; as outras 4, se faltarem no GLB, usam a animação parecida (RESERVA) */
export const ANIMACOES_OBRIGATORIAS = ["idle", "hover", "greeting", "thinking", "speaking", "pointing", "success"];
const RESERVA = { hover: "idle", welcome: "greeting", goodbye: "greeting", present: "pointing", lookaround: "idle" };
/* o conteúdo de assets/modelos/sem-modelo.json: o GLB oficial ainda não foi colocado */
const SEM_MODELO = "srphone-sem-modelo";
const LEITOR_GLB = "../assets/vendor/three/three-gltf-0.186.1.min.js";
const DECODIFICADOR_MESHOPT = "../assets/vendor/three/meshopt_decoder.module.js";

const PI = Math.PI;
const cl = (v, a, b) => Math.min(b, Math.max(a, v));
const suave = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/* sobe de 0 a 1 entre a e b e volta a 0 entre c e d (para gestos com começo, meio e fim) */
const janela = (t, a, b, c, d) => suave(a, b, t) * (1 - suave(c, d, t));

/* ================= MATERIAIS: preto brilhante, cobre/dourado, vidro escuro, feltro =================
   Só dois tipos de material (padrão e "físico" com especular), para o navegador compilar poucos
   programas de sombreamento: é o que mais pesa na hora de o 3D aparecer. */
function materiais(){
  return {
    /* preto brilhante sem virar espelho: pouco reflexo direto da luz, o reflexo do ambiente desenha o degradê */
    corpo: new MeshPhysicalMaterial({ name: "CorpoPreto", color: 0x060607, roughness: 0.26, metalness: 0,
      specularIntensity: 0.28, envMapIntensity: 0.3 }),
    dourado: new MeshStandardMaterial({ name: "Dourado", color: 0xd8874a, roughness: 0.3, metalness: 1,
      emissive: new Color(0xff7a2a), emissiveIntensity: 0.05, envMapIntensity: 1 }),
    champanhe: new MeshStandardMaterial({ name: "Camera", color: 0xe7d6bb, roughness: 0.38, metalness: 0.55, envMapIntensity: 0.8 }),
    lente: new MeshPhysicalMaterial({ name: "Lente", color: 0x06070a, roughness: 0.08, metalness: 0, specularIntensity: 0.5, envMapIntensity: 0.6 }),
    vidro: new MeshPhysicalMaterial({ name: "VidroMonoculo", color: 0x241a13, roughness: 0.05, metalness: 0,
      specularIntensity: 0.9, transparent: true, opacity: 0.8, envMapIntensity: 1.3 }),
    feltro: new MeshStandardMaterial({ name: "ChapeuFeltro", color: 0x1d1511, roughness: 0.8, metalness: 0, envMapIntensity: 0.35 }),
    /* sapato social de verniz: mais reflexo que o corpo (mesmo tipo de material, sem programa novo) */
    sapato: new MeshPhysicalMaterial({ name: "SapatoVerniz", color: 0x0d0a09, roughness: 0.16, metalness: 0,
      specularIntensity: 0.75, envMapIntensity: 1.1 }),
    braco: new MeshStandardMaterial({ name: "Braco", color: 0x8c5028, roughness: 0.38, metalness: 0.9, envMapIntensity: 0.8 })
  };
}

/* retângulo de cantos arredondados, centrado na origem (x largura, y altura) */
function retangulo(w, h, r, furo){
  const s = furo || new Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/* peça extrudada com borda arredondada, a face da frente em z = profundidade/2 */
function extrudado(forma, prof, borda, curvas){
  const g = new ExtrudeGeometry(forma, { depth: Math.max(0.001, prof - 2 * borda), bevelEnabled: borda > 0,
    bevelThickness: borda, bevelSize: borda, bevelSegments: 3, curveSegments: curvas || 10 });
  g.translate(0, 0, -prof / 2 + borda);
  return g;
}
function malha(geo, mat, x, y, z){ const m = new Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); return m; }
function pivo(nome, x, y, z){ const g = new Group(); g.name = nome; g.position.set(x || 0, y || 0, z || 0); return g; }

/* ================= O MASCOTE DA MARCA =================
   Medidas: o corpo (o smartphone) tem 1 unidade de altura. A frente do personagem é a
   traseira do aparelho: câmera no alto, monóculo à direita e bigode no meio, como na arte da loja.
   Em pé: a sola dos sapatos fica em CHAO; o Quadril (embaixo do corpo) segura o corpo e as pernas.
   O corpo gira em volta do quadril (inclina, vira, faz reverência) e as pernas se ajustam
   sozinhas para os pés continuarem no chão (os joelhos dobram para a frente). */
const W = 0.56, H = 1, D = 0.085;
const PERNA = { coxa: 0.145, canela: 0.135, repouso: 0.265, pe: 0.058, largura: 0.115 };
const CHAO = -0.851;                                     /* sola dos sapatos, antes da escala do boneco */
const QUADRIL_Y = CHAO + PERNA.pe + PERNA.repouso;       /* altura do quadril parado */
const ESCALA = 0.94;                                     /* escala do boneco na cena */
const CHAO_CENA = CHAO * ESCALA;                         /* onde fica a sombra (e os pés do GLB) */
const ALTURA_CENA = (QUADRIL_Y + H / 2 - 0.02 + H / 2 - 0.035 + 0.25 - CHAO) * ESCALA;   /* da sola ao topo do chapéu */
function criaBoneco(M){
  const juntas = {};
  const raiz = pivo("Raiz");
  const quadril = pivo("Quadril", 0, QUADRIL_Y, 0); raiz.add(quadril); juntas.quadril = quadril;
  const giro = pivo("Corpo"); quadril.add(giro); juntas.corpo = giro;
  /* as peças do corpo ficam no Tronco, com o centro do aparelho no meio (o giro é no quadril) */
  const corpo = pivo("Tronco", 0, H / 2 - 0.02, 0); giro.add(corpo);

  /* moldura cobre e traseira preta embutida */
  const moldura = retangulo(W, H, 0.1);
  moldura.holes.push(retangulo(W - 0.044, H - 0.044, 0.08, new Shape()));
  corpo.add(malha(extrudado(moldura, D, 0.012, 12), M.dourado));
  corpo.add(malha(extrudado(retangulo(W - 0.04, H - 0.04, 0.082), D - 0.012, 0.004, 12), M.corpo));
  /* botões na lateral */
  const botao = new CapsuleGeometry(0.008, 0.07, 4, 8);
  const b1 = malha(botao, M.dourado, -W / 2 - 0.004, 0.2, 0), b2 = malha(botao, M.dourado, -W / 2 - 0.004, 0.08, 0);
  const b3 = malha(new CapsuleGeometry(0.008, 0.11, 4, 8), M.dourado, W / 2 + 0.004, 0.15, 0);
  corpo.add(b1, b2, b3);

  /* câmera tripla no alto, à esquerda */
  const zf = D / 2;
  const camera = pivo("Camera", -W / 2 + 0.145, H / 2 - 0.15, zf);
  camera.add(malha(extrudado(retangulo(0.205, 0.205, 0.055), 0.022, 0.006, 10), M.champanhe, 0, 0, 0.006));
  const aro = new TorusGeometry(0.036, 0.007, 8, 28), vidroLente = new CircleGeometry(0.034, 28);
  [[-0.045, 0.045], [-0.045, -0.045], [0.048, 0]].forEach(([x, y]) => {
    camera.add(malha(aro, M.dourado, x, y, 0.02));
    const l = malha(vidroLente, M.lente, x, y, 0.018); camera.add(l);
    camera.add(malha(new SphereGeometry(0.009, 10, 8), M.lente, x + 0.01, y + 0.01, 0.02));
  });
  camera.add(malha(new SphereGeometry(0.012, 12, 8), M.champanhe, 0.052, 0.058, 0.019));
  corpo.add(camera);

  /* bigode de cobre, com as pontas enroladas para cima */
  const bigode = pivo("Bigode", 0, -0.09, zf + 0.004); corpo.add(bigode); juntas.bigode = bigode;
  const metade = [   /* lado direito, de dentro para fora e de volta (x, y) */
    [0, 0.018], [0.05, 0.052], [0.105, 0.045], [0.14, 0.012], [0.158, 0.0], [0.176, 0.012], [0.182, 0.034],
    [0.172, 0.05], [0.188, 0.047], [0.2, 0.026], [0.195, -0.004], [0.17, -0.026], [0.13, -0.036],
    [0.08, -0.03], [0.035, -0.012], [0, -0.02]
  ];
  const pts = metade.map(([x, y]) => new Vector2(x, y));
  const esquerda = metade.slice(1, -1).reverse().map(([x, y]) => new Vector2(-x, y));
  const contorno = new CatmullRomCurve3(pts.concat(esquerda).map((p) => new Vector3(p.x, p.y, 0)), true, "centripetal");
  const bigodeForma = new Shape(contorno.getPoints(90).map((p) => new Vector2(p.x, p.y)));
  const gb = extrudado(bigodeForma, 0.03, 0.011, 4);
  bigode.add(malha(gb, M.dourado));

  /* monóculo: aro, vidro escuro, parafusos laterais e a correntinha */
  const monoculo = pivo("Monoculo", 0.155, 0.105, zf + 0.012); corpo.add(monoculo); juntas.monoculo = monoculo;
  monoculo.add(malha(new TorusGeometry(0.078, 0.014, 12, 48), M.dourado));
  monoculo.add(malha(new CircleGeometry(0.07, 40), M.vidro, 0, 0, 0.002));
  const parafuso = new CylinderGeometry(0.014, 0.014, 0.03, 16);
  const p1 = malha(parafuso, M.dourado, 0.1, 0, 0), p2 = malha(parafuso, M.dourado, -0.1, 0, 0);
  p1.rotation.z = p2.rotation.z = PI / 2; monoculo.add(p1, p2);
  const corrente = pivo("Corrente", 0.02, -0.08, 0); monoculo.add(corrente); juntas.corrente = corrente;
  const fio = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0.05, -0.08, 0.01), new Vector3(0.09, -0.19, 0.006), new Vector3(0.108, -0.28, -0.01)]);
  corrente.add(malha(new TubeGeometry(fio, 24, 0.0045, 6, false), M.dourado));

  /* chapéu fedora: copa com vinco, faixa cobre e aba levantada nas pontas, inclinado para a direita */
  const chapeu = pivo("Chapeu", 0.03, H / 2 - 0.035, 0); corpo.add(chapeu); juntas.chapeu = chapeu;
  const inclina = pivo("ChapeuInclinado"); inclina.rotation.set(0.12, 0, -0.2); inclina.scale.setScalar(1.12); chapeu.add(inclina);
  const copaPerfil = [[0, 0.215], [0.07, 0.232], [0.12, 0.25], [0.155, 0.235], [0.172, 0.18], [0.182, 0.1], [0.19, 0.03], [0.192, 0]]
    .map(([r, y]) => new Vector2(r, y));
  const copa = malha(new LatheGeometry(copaPerfil, 40), M.feltro);
  copa.scale.set(1, 1, 0.82); inclina.add(copa);
  const faixa = malha(new CylinderGeometry(0.1945, 0.1945, 0.058, 40, 1, true), M.dourado, 0, 0.03, 0);
  faixa.scale.set(1, 1, 0.82); inclina.add(faixa);
  const abaPerfil = [[0.188, 0.012], [0.25, 0.004], [0.31, 0.006], [0.345, 0.02], [0.36, 0.036], [0.358, 0.028], [0.34, 0.008], [0.3, -0.006], [0.24, -0.008], [0.188, -0.004]]
    .map(([r, y]) => new Vector2(r, y));
  const aba = malha(new LatheGeometry(abaPerfil, 48), M.feltro);
  aba.scale.set(1, 1, 0.8); inclina.add(aba);
  const borda = malha(new TorusGeometry(0.358, 0.006, 6, 64), M.dourado, 0, 0.03, 0);
  borda.rotation.x = PI / 2; borda.scale.set(1, 0.8, 1); inclina.add(borda);

  /* braços finos de bronze e mãos de cobre (esquerda e direita de quem olha).
     Os dois braços usam a mesma conta de ângulos, pensada para o braço da direita:
     ombro z = 0 pendurado, positivo abre para fora; x negativo leva o braço para a frente.
     O braço da esquerda é o espelho (y e z trocam de sinal em aplicaBraco). */
  function braco(lado){
    const s = lado === "D" ? 1 : -1;
    const ombro = pivo("Ombro" + lado, s * (W / 2 + 0.004), 0.02, 0);
    ombro.add(malha(new SphereGeometry(0.028, 14, 10), M.dourado));
    ombro.add(malha(new CapsuleGeometry(0.019, 0.15, 4, 10), M.braco, 0, -0.1, 0));
    const cotovelo = pivo("Cotovelo" + lado, 0, -0.19, 0); ombro.add(cotovelo);
    cotovelo.add(malha(new SphereGeometry(0.021, 12, 8), M.braco));
    cotovelo.add(malha(new CapsuleGeometry(0.017, 0.12, 4, 10), M.braco, 0, -0.08, 0));
    const pulso = pivo("Pulso" + lado, 0, -0.16, 0); cotovelo.add(pulso);
    const punho = malha(new TorusGeometry(0.02, 0.0075, 8, 20), M.dourado); punho.rotation.x = PI / 2; pulso.add(punho);
    /* a mão, em forma de luva: palma com os dedos juntos, o indicador (que se solta para apontar)
       e o polegar na frente. A palma olha para o corpo e os dedos fecham para dentro */
    const mao = pivo("Mao" + lado, 0, -0.008, 0); pulso.add(mao);
    const palma = malha(new SphereGeometry(0.034, 18, 12), M.dourado, 0, -0.03, 0);
    palma.scale.set(0.62, 1.05, 1); mao.add(palma);
    const dedos = pivo("Dedos" + lado, 0, -0.058, -0.006); mao.add(dedos);
    const luva = malha(new CapsuleGeometry(0.02, 0.03, 4, 12), M.dourado, 0, -0.026, 0);
    luva.scale.set(0.7, 1, 1); dedos.add(luva);
    const indicador = pivo("Indicador" + lado, 0, -0.056, 0.02); mao.add(indicador);
    indicador.add(malha(new CapsuleGeometry(0.0095, 0.046, 4, 8), M.dourado, 0, -0.03, 0));
    const polegar = pivo("Polegar" + lado, 0, -0.03, 0.03); mao.add(polegar);
    polegar.add(malha(new CapsuleGeometry(0.0115, 0.036, 4, 8), M.dourado, 0, -0.024, 0));
    return { ombro, cotovelo, pulso, mao, indicador, dedos, polegar, s };
  }
  const bD = braco("D"), bE = braco("E");
  corpo.add(bD.ombro, bE.ombro);
  juntas.D = bD; juntas.E = bE;

  /* pernas finas de bronze (iguais aos braços), joelho cobre e sapato social preto de verniz,
     com sola e fivela cobre. O alto da perna fica escondido embaixo do corpo */
  function perna(lado){
    const s = lado === "D" ? 1 : -1;
    const topo = pivo("Perna" + lado, s * PERNA.largura, 0, 0);
    topo.add(malha(new SphereGeometry(0.024, 12, 8), M.dourado));
    topo.add(malha(new CapsuleGeometry(0.02, PERNA.coxa - 0.04, 4, 10), M.braco, 0, -PERNA.coxa / 2, 0));
    const joelho = pivo("Joelho" + lado, 0, -PERNA.coxa, 0); topo.add(joelho);
    joelho.add(malha(new SphereGeometry(0.022, 12, 8), M.dourado));
    joelho.add(malha(new CapsuleGeometry(0.018, PERNA.canela - 0.04, 4, 10), M.braco, 0, -PERNA.canela / 2, 0));
    const pe = pivo("Pe" + lado, 0, -PERNA.canela, 0); joelho.add(pe);
    const tornozelo = malha(new TorusGeometry(0.02, 0.0065, 8, 20), M.dourado, 0, 0.02, 0);
    tornozelo.rotation.x = PI / 2; pe.add(tornozelo);
    /* o sapato: bico arredondado para a frente (+z), calcanhar atrás, sola cobre embaixo */
    const bico = malha(new SphereGeometry(1, 22, 14), M.sapato, 0, -0.02, 0.04);
    bico.scale.set(0.056, 0.036, 0.095); pe.add(bico);
    const calcanhar = malha(new SphereGeometry(1, 16, 10), M.sapato, 0, -0.022, -0.02);
    calcanhar.scale.set(0.05, 0.034, 0.05); pe.add(calcanhar);
    const sola = malha(extrudado(retangulo(0.112, 0.21, 0.05), 0.012, 0.003, 8), M.dourado, 0, -0.052, 0.028);
    sola.rotation.x = -PI / 2; pe.add(sola);
    pe.add(malha(new SphereGeometry(0.009, 10, 8), M.dourado, 0, 0.014, 0.062));
    return { perna: topo, joelho, pe, s };
  }
  const pD = perna("D"), pE = perna("E");
  quadril.add(pD.perna, pE.perna);
  juntas.pD = pD; juntas.pE = pE;
  return { raiz, juntas };
}

/* ================= POSES =================
   Cada estado devolve a pose-alvo naquele instante (t = segundos no estado, g = segundos no total).
   O animador aproxima a pose atual da pose-alvo aos poucos: nada pula de uma pose para outra.
   Braços: [x, y, z] na conta do braço da direita (z positivo abre para fora, x negativo vai para a
   frente); o da esquerda é espelhado sozinho. Mão: fecha (0 aberta, 1 fechada), ind (indicador,
   0 esticado), pol (polegar: 0 esticado na direção da mão, 1 dobrado para a frente).
   Pernas: agacha (quanto o quadril desce; os joelhos dobram), pulo (quanto sobe; acima da perna
   esticada, os pés saem do chão) e, em cada pé, [frente, ponta]: quanto o pé vai para a frente
   (negativo = para trás) e quanto a ponta do sapato levanta. */
function maoRepouso(){ return { fecha: 0.3, ind: 0.3, pol: 0.15 }; }
function poseBase(){
  return {
    corpo: [0, 0, 0], chapeu: [0, 0, 0], chapeuY: 0, monoculo: 0, bigode: 1, brilho: 0.05, pulo: 0, agacha: 0.006,
    peD: [0, 0], peE: [0, 0],
    D: { ombro: [-0.06, 0, 0.42], cot: [-0.42, 0, 0.12], pulso: [0, 0, 0], mao: maoRepouso() },
    E: { ombro: [-0.06, 0, 0.42], cot: [-0.42, 0, 0.12], pulso: [0, 0, 0], mao: maoRepouso() }
  };
}
/* braço aberto para o lado, palma para cima ("olha só", "fique à vontade") */
function bracoAberto(abre){
  return { ombro: [-0.42, 0, 1.05 + (abre || 0)], cot: [-0.55, 0, 0.3], pulso: [0.25, 0.9, 0], mao: { fecha: 0.06, ind: 0.06, pol: 0.4 } };
}
/* braço apontando para uma direção da tela (dx para a direita, dy para cima), no lado s */
function miraBraco(dx, dy, s){
  const ang = Math.atan2(dx * s, -dy);         /* 0 = para baixo, pi/2 = para fora, pi = para cima */
  return { ombro: [-0.25, 0, cl(ang, 0.35, 2.85)], cot: [-0.12, 0, 0.05], pulso: [0, 0, 0], mao: { fecha: 1, ind: 0, pol: 0.1 } };
}
function misturaBraco(b, alvo, k){
  ["ombro", "cot", "pulso"].forEach((n) => { for (let i = 0; i < 3; i++) b[n][i] += (alvo[n][i] - b[n][i]) * k; });
  ["fecha", "ind", "pol"].forEach((n) => { b.mao[n] += (alvo.mao[n] - b.mao[n]) * k; });
}
const POSES = {
  idle(p, t, g, c){
    p.corpo = [0.02 * Math.sin(g * 0.9) - c.olharY * 0.12, 0.07 * Math.sin(g * 0.62) + c.olharX * 0.28, 0.03 * Math.sin(g * 1.05 + 1)];
    p.D.ombro = [-0.06 + 0.07 * Math.sin(g * 0.9), 0, 0.42 + 0.05 * Math.sin(g * 1.25)];
    p.E.ombro = [-0.06 + 0.07 * Math.sin(g * 0.9 + 2.2), 0, 0.42 + 0.05 * Math.sin(g * 1.25 + 1.3)];
    p.D.cot[0] = -0.42 - 0.08 * Math.sin(g * 1.1); p.E.cot[0] = -0.42 - 0.08 * Math.sin(g * 1.1 + 1.7);
    p.chapeu = [0.015 * Math.sin(g * 0.8), 0, 0.012 * Math.sin(g * 0.7 + 0.5)];
    p.monoculo = 0.04 * Math.sin(g * 0.75);
    /* de vez em quando o bigode dá uma mexidinha (a cada ~7 s) */
    p.bigode = 1 + 0.07 * janela(g % 7.3, 0, 0.12, 0.2, 0.36);
    /* respira: os joelhos dobram e esticam bem devagar (os pés não saem do chão) */
    p.agacha = 0.008 + 0.007 * Math.sin(g * 2 * PI / 4.6);
  },
  hover(p, t, g, c){
    POSES.idle(p, t, g, c);
    p.corpo = [0.06 - c.olharY * 0.2, c.olharX * 0.42 + 0.03 * Math.sin(g * 0.7), -0.04 + 0.02 * Math.sin(g)];
    /* percebeu: levanta a mão e acena devagar */
    const sobe = suave(0, 0.5, t);
    misturaBraco(p.D, { ombro: [-0.25, 0, 2.2], cot: [-0.15, 0, 0.75 + 0.2 * Math.sin(t * 4)], pulso: [0, 0, 0.15 * Math.sin(t * 4 + 0.6)],
      mao: { fecha: 0.05, ind: 0.05, pol: 0.25 } }, sobe);
    p.brilho = 0.24;
  },
  greeting(p, t, g, c){
    POSES.idle(p, t, g, c);
    const acena = janela(t, 0.05, 0.35, 2.1, 2.5);
    misturaBraco(p.D, { ombro: [-0.25, 0, 2.3], cot: [-0.15, 0, 0.72 + 0.3 * Math.sin(t * 6.2)], pulso: [0, 0, 0.2 * Math.sin(t * 6.2 + 0.8)],
      mao: { fecha: 0.02, ind: 0.02, pol: 0.25 } }, acena);
    /* a outra mão vai à aba do chapéu e o levanta um pouco */
    const tira = janela(t, 0.35, 0.8, 1.55, 2.0);
    misturaBraco(p.E, { ombro: [-0.3, 0, 2.55], cot: [-0.1, 0, 1.55], pulso: [0, 0, 0.3], mao: { fecha: 0.7, ind: 0.6, pol: 0.3 } }, tira);
    p.chapeu = [-0.24 * tira, 0, 0.12 * tira]; p.chapeuY = 0.05 * tira;
    const rev = janela(t, 0.5, 0.8, 1.2, 1.6);
    p.corpo[0] += 0.07 * rev;   /* reverência discreta */
    p.agacha += 0.012 * rev;
    p.brilho = 0.18;
  },
  /* boas-vindas (primeira vez que a pessoa abre o chat): mão no peito, reverência de cavalheiro
     com um pé para trás, e a outra mão se abre como quem diz "fique à vontade" */
  welcome(p, t, g, c){
    POSES.idle(p, t, g, c);
    const curva = janela(t, 0.35, 0.95, 1.85, 2.5);
    const abre = janela(t, 0.15, 0.7, 2.55, 3.15);
    misturaBraco(p.D, { ombro: [-0.9, 0, -0.25], cot: [-1.3, 0, -0.6], pulso: [0.25, 0, 0], mao: { fecha: 0.1, ind: 0.1, pol: 0.3 } }, curva);
    misturaBraco(p.E, bracoAberto(0.25), abre);
    p.corpo[0] += 0.2 * curva;
    p.chapeu[0] -= 0.08 * curva;
    p.corpo[1] -= 0.12 * abre;
    p.peD = [-0.05 * curva, 0.12 * curva];
    p.agacha += 0.028 * curva;
    p.bigode = 1 + 0.06 * janela(t, 2.4, 2.55, 2.7, 2.9);
    p.brilho = 0.2;
  },
  /* olha em volta: vira para um lado e para o outro, com a mão na testa, sem sair do lugar */
  lookaround(p, t, g, c){
    POSES.idle(p, t, g, c);
    const esq = janela(t, 0.15, 0.7, 1.25, 1.7), dir = janela(t, 1.55, 2.1, 2.75, 3.25);
    const mao = janela(t, 0.05, 0.5, 3.0, 3.5);
    p.corpo[1] += 0.5 * esq - 0.5 * dir;
    p.corpo[0] -= 0.035 * (esq + dir);
    misturaBraco(p.D, { ombro: [-1.05, 0, 0.1], cot: [-1.75, 0, 0.32], pulso: [0.45, 0, 0], mao: { fecha: 0.1, ind: 0.1, pol: 0.2 } }, mao);
    p.peE = [0.03 * esq, 0]; p.peD = [0.03 * dir, 0];
    p.monoculo = 0.1 * Math.sin(t * 3) * (esq + dir);
    p.brilho = 0.08;
  },
  /* apresenta: os dois braços se abrem, palmas para cima, virado para o que está mostrando */
  present(p, t, g, c){
    POSES.idle(p, t, g, c);
    const on = janela(t, 0.05, 0.45, 2.0, 2.5);
    const s = c.alvoX >= 0 ? 1 : -1;
    misturaBraco(p.D, bracoAberto(s > 0 ? 0.25 : 0), on);
    misturaBraco(p.E, bracoAberto(s < 0 ? 0.25 : 0), on);
    p.corpo[1] += s * 0.22 * on; p.corpo[0] -= 0.05 * on;
    p.agacha += 0.016 * janela(t, 0.05, 0.3, 0.45, 0.85);   /* uma dobradinha de "tchã-rã" */
    p.brilho = 0.1 + 0.2 * on;
  },
  /* tchau: a mão vai à aba do chapéu, faz a continência de cavalheiro e acena de leve */
  goodbye(p, t, g, c){
    POSES.idle(p, t, g, c);
    const aba = janela(t, 0.05, 0.4, 0.95, 1.3);
    const sai = janela(t, 0.95, 1.3, 1.75, 2.15);
    misturaBraco(p.D, { ombro: [-0.55, 0, 1.95], cot: [-0.3, 0, 1.45], pulso: [0, 0, 0.2], mao: { fecha: 0.75, ind: 0, pol: 0.3 } }, aba);
    misturaBraco(p.D, { ombro: [-0.3, 0, 2.25], cot: [-0.15, 0, 0.55 + 0.2 * Math.sin(t * 6.5)], pulso: [0, 0, 0.2], mao: { fecha: 0.08, ind: 0.05, pol: 0.3 } }, sai);
    const aceno = janela(t, 0.3, 0.6, 0.85, 1.15);
    p.corpo[0] += 0.09 * aceno; p.chapeu[0] -= 0.12 * aba; p.agacha += 0.01 * aceno;
    p.brilho = 0.15;
  },
  thinking(p, t, g, c){
    POSES.idle(p, t, g, c);
    p.corpo = [0.03 * Math.sin(g * 1.6), -0.2 + 0.03 * Math.sin(g * 0.7), 0.08];
    /* a mão do lado do monóculo sobe até ele e ajusta de leve */
    const sobe = suave(0, 0.6, t);
    misturaBraco(p.D, { ombro: [-0.95, 0, -0.22], cot: [-1.95 + 0.06 * Math.sin(g * 2.3), 0, 0.05], pulso: [0.35, 0, 0],
      mao: { fecha: 0.9, ind: 0.2, pol: 0.3 } }, sobe);
    p.E.ombro = [-0.25, 0, 0.32]; p.E.cot = [-1.05, 0, 0.1];
    p.monoculo = 0.12 * Math.sin(g * 1.3);
    /* e bate a ponta do sapato, pensando */
    p.peE = [0.02, 0.3 * Math.max(0, Math.sin(g * 5.2)) * suave(0.4, 0.9, t)];
    p.brilho = 0.1;
  },
  speaking(p, t, g, c){
    POSES.idle(p, t, g, c);
    p.corpo = [0.035 * Math.sin(g * 2.9) + 0.03, c.olharX * 0.3 + 0.05 * Math.sin(g * 1.1), 0.03 * Math.sin(g * 1.7)];
    const v = Math.sin(t * 3.1), sobe = suave(0, 0.45, t);
    if (c.gesto === 0){          /* uma mão aberta, palma para cima, que vai e volta */
      misturaBraco(p.D, { ombro: [-0.7, 0, 0.55 + 0.1 * v], cot: [-0.95 - 0.18 * v, 0, 0.3], pulso: [0.2, 0.9, 0], mao: { fecha: 0.08, ind: 0.08, pol: 0.35 } }, sobe);
    } else if (c.gesto === 1){   /* as duas mãos se abrem de leve */
      misturaBraco(p.D, { ombro: [-0.5, 0, 0.75 + 0.08 * v], cot: [-0.85, 0, 0.35], pulso: [0.2, 0.8, 0], mao: { fecha: 0.1, ind: 0.1, pol: 0.35 } }, sobe);
      misturaBraco(p.E, { ombro: [-0.5, 0, 0.75 + 0.08 * Math.sin(t * 3.1 + 1)], cot: [-0.85, 0, 0.35], pulso: [0.2, 0.8, 0], mao: { fecha: 0.1, ind: 0.1, pol: 0.35 } }, sobe);
    } else {                     /* indicador para cima, marcando o que diz */
      misturaBraco(p.E, { ombro: [-0.45, 0, 0.62], cot: [-0.3, 0, 2.0 + 0.12 * v], pulso: [0, 0, 0.2], mao: { fecha: 1, ind: 0, pol: 0.1 } }, sobe);
    }
    p.bigode = 1 + 0.035 * Math.abs(Math.sin(g * 6));
    p.brilho = 0.12;
  },
  pointing(p, t, g, c){
    POSES.idle(p, t, g, c);
    const dx = c.alvoX, dy = c.alvoY, s = dx >= 0 ? 1 : -1;
    const ida = janela(t, 0.05, 0.45, 1.9, 2.3);
    misturaBraco(s > 0 ? p.D : p.E, miraBraco(dx, dy, s), ida);
    p.corpo[1] += s * 0.3 * ida; p.corpo[0] += 0.04 * ida;
    p.brilho = 0.14;
  },
  success(p, t, g, c){
    POSES.idle(p, t, g, c);
    const on = janela(t, 0.05, 0.3, 1.5, 1.85);
    /* joinha com a mão direita e um pulinho */
    /* antebraço em pé: o polegar esticado (pol 0) fica apontando para cima */
    misturaBraco(p.D, { ombro: [-0.35, 0, 1.15], cot: [-0.15, 0, 1.45], pulso: [0, -1.4, 0], mao: { fecha: 1, ind: 1, pol: 0 } }, on);
    /* sem jogar o corpo para trás: o preto brilhante continua preto (não reflete o teto) */
    p.corpo[2] = 0.05 * Math.sin(t * 5) * on; p.corpo[0] += 0.02 * on;
    p.pulo = 0.045 * Math.max(0, Math.sin(cl(t / 0.6, 0, 1) * PI));
    p.chapeuY = 0.02 * Math.max(0, Math.sin(cl((t - 0.08) / 0.6, 0, 1) * PI));
    p.brilho = 0.12 + 0.55 * janela(t, 0.05, 0.3, 0.7, 1.4);
  }
};

/* ================= ANIMADOR DO MASCOTE DA MARCA ================= */
function animadorProvisorio(boneco, M){
  const j = boneco.juntas;
  const atual = poseBase(); let alvo = poseBase();
  let pulo = 0;
  function aproxima(a, b, k){ return a + (b - a) * k; }
  function aproximaVet(a, b, k){ for (let i = 0; i < 3; i++) a[i] = aproxima(a[i], b[i], k); }
  function aproximaBraco(a, b, k){
    aproximaVet(a.ombro, b.ombro, k); aproximaVet(a.cot, b.cot, k); aproximaVet(a.pulso, b.pulso, k);
    ["fecha", "ind", "pol"].forEach((d) => { a.mao[d] = aproxima(a.mao[d], b.mao[d], k); });
  }
  function aplicaBraco(b, pose){
    const s = b.s;
    b.ombro.rotation.set(pose.ombro[0], s * pose.ombro[1], s * pose.ombro[2]);
    b.cotovelo.rotation.set(pose.cot[0], s * pose.cot[1], s * pose.cot[2]);
    b.pulso.rotation.set(pose.pulso[0], s * pose.pulso[1], s * pose.pulso[2]);
    /* os dedos fecham para dentro (na direção da palma); o polegar vai para a frente e para cima */
    b.dedos.rotation.z = -s * pose.mao.fecha * 1.7;
    b.indicador.rotation.z = -s * pose.mao.ind * 1.7;
    b.polegar.rotation.set(-pose.mao.pol * 1.4, 0, -s * 0.35 * (1 - pose.mao.pol));
  }
  /* a perna alcança o pé sozinha (duas partes, lei dos cossenos): altura = do quadril ao tornozelo,
     frente = quanto o pé está à frente do quadril. O sapato fica sempre deitado no chão */
  function aplicaPerna(pp, altura, frente, ponta){
    const L1 = PERNA.coxa, L2 = PERNA.canela;
    const d = cl(Math.hypot(altura, frente), 0.05, L1 + L2 - 1e-4);
    const a = Math.atan2(frente, altura);
    const alfa = Math.acos(cl((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const beta = Math.acos(cl((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const coxa = a + alfa, dobra = PI - beta;
    pp.perna.rotation.set(-coxa, 0, 0);
    pp.joelho.rotation.set(dobra, 0, 0);
    pp.pe.rotation.set(coxa - dobra - ponta, pp.s * 0.2, 0);    /* pontas levemente para fora */
  }
  const obj = {
    tipo: "marca",
    salto: 0,
    atualiza(estado, t, g, dt, c){
      alvo = poseBase();
      (POSES[estado] || POSES.idle)(alvo, t, g, c);
      const k = c.instantaneo ? 1 : 1 - Math.exp(-dt * (c.reduz ? 14 : 6));
      aproximaVet(atual.corpo, alvo.corpo, k); aproximaVet(atual.chapeu, alvo.chapeu, k);
      atual.chapeuY = aproxima(atual.chapeuY, alvo.chapeuY, k);
      atual.monoculo = aproxima(atual.monoculo, alvo.monoculo, k);
      atual.bigode = aproxima(atual.bigode, alvo.bigode, Math.min(1, k * 1.6));
      atual.brilho = aproxima(atual.brilho, alvo.brilho, k * 0.8);
      atual.agacha = aproxima(atual.agacha, alvo.agacha, k);
      for (let i = 0; i < 2; i++){ atual.peD[i] = aproxima(atual.peD[i], alvo.peD[i], k); atual.peE[i] = aproxima(atual.peE[i], alvo.peE[i], k); }
      pulo = aproxima(pulo, alvo.pulo || 0, Math.min(1, k * 2));
      aproximaBraco(atual.D, alvo.D, k); aproximaBraco(atual.E, alvo.E, k);

      /* o quadril desce (joelhos) ou sobe (pulo) e acompanha um pouco o giro do corpo */
      j.quadril.position.y = QUADRIL_Y - atual.agacha + pulo;
      j.quadril.rotation.y = atual.corpo[1] * 0.35;
      j.corpo.rotation.set(atual.corpo[0], atual.corpo[1] * 0.65, atual.corpo[2]);
      const altura = PERNA.repouso - atual.agacha + pulo;
      aplicaPerna(j.pD, altura, atual.peD[0], atual.peD[1]);
      aplicaPerna(j.pE, altura, atual.peE[0], atual.peE[1]);
      obj.salto = pulo;
      j.chapeu.rotation.set(atual.chapeu[0], atual.chapeu[1], atual.chapeu[2]);
      j.chapeu.position.y = H / 2 - 0.035 + atual.chapeuY;
      j.monoculo.rotation.z = atual.monoculo;
      j.corrente.rotation.z = -atual.corpo[2] * 1.5 + 0.08 * Math.sin(g * 1.4);
      j.bigode.scale.set(1 + (atual.bigode - 1) * 0.4, atual.bigode, 1);
      aplicaBraco(j.D, atual.D); aplicaBraco(j.E, atual.E);
      M.dourado.emissiveIntensity = atual.brilho;
      return Math.abs(alvo.corpo[1] - atual.corpo[1]) + Math.abs(alvo.corpo[0] - atual.corpo[0]) +
        Math.abs(alvo.D.ombro[2] - atual.D.ombro[2]) + Math.abs(alvo.E.ombro[2] - atual.E.ombro[2]) +
        Math.abs(alvo.agacha - atual.agacha) * 10;
    }
  };
  return obj;
}

/* ================= O MODELO OFICIAL (GLB) ================= */
/* lê só o cabeçalho JSON do GLB, para saber as extensões antes de baixar o leitor */
function jsonDoGLB(buf){
  const v = new DataView(buf);
  if (buf.byteLength < 20 || v.getUint32(0, true) !== 0x46546C67) throw new Error("glb_invalido");
  const tam = v.getUint32(12, true);
  if (v.getUint32(16, true) !== 0x4E4F534A) throw new Error("glb_invalido");
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, tam)));
}
/* não há GLB de artista: no lugar dele veio o aviso assets/modelos/sem-modelo.json
   (Netlify e npm start) ou um 404 (outra hospedagem). Não é erro: fica o mascote da marca */
function semModelo(buf){
  if (buf.byteLength > 2048 || buf.byteLength < 2) return false;
  const txt = new TextDecoder().decode(new Uint8Array(buf));
  return txt.indexOf(SEM_MODELO) > -1;
}
async function carregaGLB(url){
  const r = await fetch(url, { credentials: "same-origin" });
  if (r.status === 404) throw new Error(SEM_MODELO);
  if (!r.ok) throw new Error("glb_http_" + r.status);
  const buf = await r.arrayBuffer();
  if (semModelo(buf)) throw new Error(SEM_MODELO);
  const json = jsonDoGLB(buf);
  const ext = (json.extensionsUsed || []).concat(json.extensionsRequired || []);
  const recusadas = ext.filter((e) => e === "KHR_draco_mesh_compression" || e === "KHR_texture_basisu");
  if (recusadas.length) throw new Error("glb_extensao_nao_suportada:" + recusadas.join(","));
  const leitor = await import(LEITOR_GLB);
  const loader = new leitor.GLTFLoader();
  if (ext.indexOf("EXT_meshopt_compression") > -1){
    const { MeshoptDecoder } = await import(DECODIFICADOR_MESHOPT);
    await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  const base = url.slice(0, url.lastIndexOf("/") + 1);
  const gltf = await new Promise((ok, erro) => loader.parse(buf, base, ok, erro));
  return { gltf, leitor };
}
function animadorGLB(gltf, leitor, nomes){
  const mixer = new leitor.AnimationMixer(gltf.scene);
  const porNome = {};
  (gltf.animations || []).forEach((c) => { porNome[c.name.toLowerCase()] = c; });
  const acha = (n) => porNome[String(n || "").toLowerCase()] || null;
  const acoes = new Map();
  function acao(clip, umaVez){
    if (!clip) return null;
    let a = acoes.get(clip);
    if (!a){ a = mixer.clipAction(clip); acoes.set(clip, a); }
    a.setLoop(umaVez ? leitor.LoopOnce : leitor.LoopRepeat, Infinity);
    a.clampWhenFinished = !!umaVez;
    return a;
  }
  const UMA_VEZ = { greeting: true, welcome: true, lookaround: true, pointing: true, present: true, success: true, goodbye: true };
  const falas = [].concat(nomes.speaking || []).map(acha).filter(Boolean);
  const encontradas = (gltf.animations || []).map((c) => c.name);
  const esperadas = ESTADOS.reduce((l, e) => l.concat(nomes[e] || []), []);
  const faltando = esperadas.filter((n) => n && !acha(n));
  /* a animação do estado; se o GLB não tiver, a parecida (Welcome → Wave, Present → Point...) */
  function clipeDe(estado){
    let e = estado;
    for (let i = 0; i < 3 && e; i++){ const c = acha(nomes[e]); if (c) return c; e = RESERVA[e]; }
    return null;
  }
  let tocando = null, estadoAtual = "", fala = 0, tempoFala = 0;
  function troca(clip, umaVez){
    const nova = acao(clip, umaVez) || acao(acha(nomes.idle), false);
    if (!nova || nova === tocando){ if (nova && umaVez){ nova.reset().play(); } return; }
    nova.reset(); nova.enabled = true; nova.setEffectiveTimeScale(1); nova.setEffectiveWeight(1);
    nova.play();
    if (tocando) nova.crossFadeFrom(tocando, 0.4, false);
    tocando = nova;
  }
  /* materiais dourados do GLB (nome com Dourado/Gold/Cobre/Copper) acendem no hover e no sucesso */
  const dourados = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach((m) => {
      if (m && m.emissive && /dourad|gold|cobre|copper|laranja|orange/i.test(m.name || "") && dourados.indexOf(m) < 0){
        m.userData.srBrilho = m.emissiveIntensity || 0; if (!m.emissive.getHex()) m.emissive.setHex(0xff7a2a);
        dourados.push(m);
      }
    });
  });
  return {
    tipo: "glb", encontradas, faltando,
    clipe(){ return tocando ? tocando.getClip().name : ""; },
    atualiza(estado, t, g, dt, c){
      if (estado !== estadoAtual){
        estadoAtual = estado;
        if (estado === "speaking"){ fala = c.gesto % Math.max(1, falas.length); tempoFala = 0; troca(falas[fala] || acha(nomes.idle), false); }
        else { const c = clipeDe(estado); troca(c, !!c && c !== acha(nomes.idle) && !!UMA_VEZ[estado]); }
      } else if (estado === "speaking" && falas.length > 1){
        tempoFala += dt;
        if (tocando && tempoFala >= tocando.getClip().duration * 2){ tempoFala = 0; fala = (fala + 1) % falas.length; troca(falas[fala], false); }
      }
      mixer.update(c.reduz ? 0 : dt);
      const brilho = estado === "success" ? 0.5 : estado === "hover" ? 0.25 : 0;
      dourados.forEach((m) => { m.emissiveIntensity += ((m.userData.srBrilho + brilho) - m.emissiveIntensity) * Math.min(1, dt * 6); });
      return 0;
    }
  };
}

/* ================= SOMBRA: mancha suave embaixo (sem mapa de sombra, que pesa) ================= */
function sombra(){
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(0.55, "rgba(0,0,0,.18)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  const m = new Mesh(new PlaneGeometry(0.62, 0.62), new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -PI / 2; m.position.y = CHAO_CENA + 0.002; m.renderOrder = -1;
  return m;
}

/* ================= A CENA ================= */
export async function iniciar(palco, opcoes){
  opcoes = opcoes || {};
  const nomes = Object.assign({}, ANIMACOES_PADRAO, opcoes.animacoes || {});
  const leve = opcoes.qualidade === "baixa";
  const dprMax = leve ? 1.5 : 2;
  /* celular: 30 quadros por segundo sempre; computador: 30 parado, 60 durante gestos */
  const fpsParado = 30, fpsGesto = leve ? 30 : 60;

  const renderer = new WebGLRenderer({ antialias: !leve, alpha: true, powerPreference: "low-power", premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  const canvas = renderer.domElement;
  canvas.className = "sra-canvas";
  canvas.setAttribute("aria-hidden", "true");

  const cena = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environment = ambiente;
  pmrem.dispose();

  /* enquadra o personagem em pé: dos sapatos (com a sombra) ao alto do chapéu */
  const camera = new PerspectiveCamera(22, 1, 0.1, 20);
  camera.position.set(0, -0.02, 4.45);
  camera.lookAt(0, -0.07, 0);

  /* luz suave, uma chave quente no alto à esquerda e um contorno laranja por trás (destaca no fundo escuro) */
  cena.add(new HemisphereLight(0xfff1e2, 0x1a0e07, 0.55));
  const chave = new DirectionalLight(0xffd9b3, 2.1); chave.position.set(-2, 3, 4); cena.add(chave);
  const contorno = new DirectionalLight(0xff8a3d, 2.6); contorno.position.set(3, 1.4, -3); cena.add(contorno);
  const recorte = new DirectionalLight(0xa9b8ff, 0.35); recorte.position.set(-3, 0.5, -2); cena.add(recorte);

  const flutua = new Group(); cena.add(flutua);
  const chao = sombra(); cena.add(chao);

  /* o personagem: o GLB de artista (se o arquivo existir) ou o mascote da marca */
  let animador, personagem, M = null, erroGLB = "", modelo = opcoes.modelo ? "" : "desligado";
  if (opcoes.modelo){
    try {
      const { gltf, leitor } = await carregaGLB(opcoes.modelo);
      personagem = gltf.scene;
      /* encaixa o modelo: a mesma altura do mascote da marca, centrado, com a sola no chão (na sombra) */
      const caixa = new Box3().setFromObject(personagem), tam = caixa.getSize(new Vector3());
      const esc = ALTURA_CENA / Math.max(0.0001, tam.y);
      personagem.scale.setScalar(esc);
      const centro = caixa.getCenter(new Vector3()).multiplyScalar(esc);
      personagem.position.set(-centro.x, CHAO_CENA - caixa.min.y * esc, -centro.z);
      const envolve = new Group(); envolve.add(personagem); personagem = envolve;
      animador = animadorGLB(gltf, leitor, nomes);
      modelo = "oficial";
    } catch (e){
      const msg = String((e && e.message) || e);
      if (msg === SEM_MODELO) modelo = "ausente";          /* ainda não colocaram o arquivo: normal */
      else { modelo = "erro"; erroGLB = msg; }
      personagem = null;
    }
  }
  if (!personagem){
    M = materiais();
    const b = criaBoneco(M);
    personagem = b.raiz;
    personagem.scale.setScalar(ESCALA);
    animador = animadorProvisorio(b, M);
  }
  flutua.add(personagem);

  /* ---------- estado, olhar e laço de desenho ---------- */
  let estado = "idle", desde = 0, relogio = 0, ultimo = 0, raf = 0;
  let ativo = true, visivel = !document.hidden, reduz = !!opcoes.reduzMovimento;
  const ctx = { olharX: 0, olharY: 0, alvoX: -1, alvoY: 0, gesto: 0, reduz, instantaneo: false };
  const olhar = new Vector2(), olharAlvo = new Vector2();
  let movimentoRestante = 0, quadros = 0;

  function tamanho(){
    const w = Math.max(1, palco.clientWidth), h = Math.max(1, palco.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprMax));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    /* canvas mais estreito: afasta a câmera para os braços continuarem cabendo */
    camera.position.z = 4.45 * Math.max(1, 0.86 / camera.aspect);
    camera.updateProjectionMatrix();
    pede();
  }
  function passo(agora){
    raf = 0;
    if (!ativo || !visivel) return;
    const fpsMax = estado === "idle" ? fpsParado : fpsGesto;
    if (ultimo && agora - ultimo < 1000 / fpsMax - 3){ raf = requestAnimationFrame(passo); return; }
    const dt = ultimo ? Math.min(0.1, (agora - ultimo) / 1000) : 1 / 60;
    ultimo = agora;
    relogio += dt; desde += dt;
    olhar.lerp(olharAlvo, 1 - Math.exp(-dt * 4));
    ctx.olharX = olhar.x; ctx.olharY = olhar.y; ctx.reduz = reduz;
    /* movimento reduzido: sem flutuação nem movimento contínuo; cada gesto vira uma pose parada
       (o meio dele: a mão levantada, o joinha...) enquanto durar */
    const g = reduz ? 0 : relogio, t = reduz ? 1 : desde;
    const falta = animador.atualiza(estado, t, g, dt, ctx);
    /* o GLB também vira de leve para o ponteiro e para o chat (no mascote da marca isso está nas poses) */
    if (animador.tipo === "glb") personagem.rotation.y += (ctx.olharX * 0.3 - personagem.rotation.y) * (reduz ? 1 : 1 - Math.exp(-dt * 5));
    /* em pé no chão: sem flutuação. A sombra só encolhe quando ele dá um pulinho */
    const alto = (animador.salto || 0) * ESCALA;
    chao.scale.setScalar(1 - alto * 2.2); chao.material.opacity = 0.85 - alto * 4;
    renderer.render(cena, camera);
    quadros++;
    if (reduz){
      movimentoRestante -= dt;
      if (movimentoRestante > 0 || falta > 0.002) raf = requestAnimationFrame(passo);
      else ultimo = 0;
    } else raf = requestAnimationFrame(passo);
  }
  function pede(segundos){
    if (segundos) movimentoRestante = Math.max(movimentoRestante, segundos);
    if (!raf && ativo && visivel){ ultimo = 0; raf = requestAnimationFrame(passo); }
  }
  function aoVisibilidade(){ visivel = !document.hidden; if (visivel) pede(0.5); }
  document.addEventListener("visibilitychange", aoVisibilidade);
  let obs = null;
  if (typeof ResizeObserver === "function"){ obs = new ResizeObserver(tamanho); obs.observe(palco); }

  palco.appendChild(canvas);
  tamanho();
  /* prepara os materiais sem travar a página (o navegador compila em paralelo quando consegue) */
  try { await renderer.compileAsync(cena, camera); } catch (_){ renderer.compile(cena, camera); }
  pede(reduz ? 0.3 : 1);

  return {
    canvas,
    tipo: animador.tipo,
    /* troca de estado. dados.alvo = direção na tela para onde apontar {x, y} (y para cima) */
    estado(nome, dados){
      if (ESTADOS.indexOf(nome) < 0) nome = "idle";
      if (dados && dados.alvo){
        const n = Math.hypot(dados.alvo.x, dados.alvo.y) || 1;
        ctx.alvoX = dados.alvo.x / n; ctx.alvoY = dados.alvo.y / n;
      }
      if (nome === "speaking" && nome !== estado) ctx.gesto = (ctx.gesto + 1 + Math.floor(Math.random() * 2)) % 3;
      if (nome !== estado){ estado = nome; desde = 0; }
      pede(reduz ? 0.3 : 2.6);
    },
    /* para onde olhar (-1..1): o ponteiro no hover ou o painel do chat aberto */
    olhar(x, y){ olharAlvo.set(cl(x, -1, 1), cl(y, -1, 1)); pede(reduz ? 0.3 : 0.8); },
    /* troca de gesto no meio da fala (para não repetir sempre o mesmo) */
    variar(){ ctx.gesto = (ctx.gesto + 1) % 3; desde = 0; pede(1); },
    __gesto(n){ ctx.gesto = n % 3; desde = 0; pede(1); },   /* só para os testes e o ensaio */
    reduzirMovimento(v){ reduz = !!v; pede(1); },
    pausar(){ ativo = false; if (raf){ cancelAnimationFrame(raf); raf = 0; } ultimo = 0; },
    retomar(){ if (!ativo){ ativo = true; pede(1); } },
    redimensionar: tamanho,
    /* foto do quadro atual (desenha e captura no mesmo instante), ex.: para gerar a imagem parada */
    capturar(tipo, qualidade){ renderer.render(cena, camera); return canvas.toDataURL(tipo || "image/png", qualidade); },
    info(){
      return { tipo: animador.tipo, modelo, estado, quadros, pausado: !ativo || !visivel, erroGLB, clipe: animador.clipe ? animador.clipe() : "",
        animacoes: animador.encontradas || [], faltando: animador.faltando || [], reduz,
        dpr: renderer.getPixelRatio(), largura: canvas.width, altura: canvas.height };
    },
    destruir(){
      this.pausar();
      document.removeEventListener("visibilitychange", aoVisibilidade);
      if (obs) obs.disconnect();
      cena.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        [].concat(o.material || []).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      ambiente.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };
}

/* Para as ferramentas (ferramentas/mascote/gera-molde.mjs): o mascote da marca e o animador dele,
   sem cena nem renderer. É assim que o molde GLB (com as animações nomeadas) é gerado. */
export function montaBonecoProvisorio(){
  const M = materiais(), b = criaBoneco(M);
  return { raiz: b.raiz, materiais: M, animador: animadorProvisorio(b, M) };
}
