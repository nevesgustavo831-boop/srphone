/* SR Phone · unboxing 3D (a caixa que a pessoa gira, deslacra e abre)
   ------------------------------------------------------------------
   Este arquivo é um módulo e NÃO vem com a página: js/motion.js só o importa
   quando a pessoa toca em "Abrir a caixa em 3D". Ele traz junto o Three.js
   enxuto de assets/vendor/three/ (só as partes usadas aqui).

   Estados:  SEALED → PEELING → UNSEALED → OPENING → OPENED
     SEALED    caixa lacrada: dá para girar; a aba laranja do lacre pode ser puxada
     PEELING   a pessoa está puxando o lacre (sealProgress 0 → 1); a caixa não gira
     UNSEALED  lacre fora: dá para girar e puxar a tampa para cima
     OPENING   a pessoa está puxando a tampa (openProgress 0 → 1); a caixa não gira
     OPENED    tampa aberta e o iPhone revelado: aparecem os botões de compra

   Tudo é desenhado aqui mesmo (caixa, lacre, tampa e aparelho): nenhuma imagem
   2D fingindo ser 3D e nenhum arquivo de modelo para baixar. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial,
  ShadowMaterial, ExtrudeGeometry, ShapeGeometry, PlaneGeometry, CircleGeometry, BufferGeometry,
  Float32BufferAttribute, Shape, HemisphereLight, DirectionalLight, SpotLight, Color, Vector2, Vector3,
  Raycaster, CanvasTexture, SRGBColorSpace, NeutralToneMapping, PCFShadowMap, DoubleSide,
  PMREMGenerator, RoomEnvironment
} from "../assets/vendor/three/three-sr-0.186.1.min.js";

export const ESTADOS = { SEALED: "SEALED", PEELING: "PEELING", UNSEALED: "UNSEALED", OPENING: "OPENING", OPENED: "OPENED" };
const E = ESTADOS;

/* ---------- medidas da caixa (1 unidade ≈ 10 cm) ---------- */
const W = 1.72, D = 0.92, H = 0.34;          /* caixa deitada: largura, profundidade, altura */
const R = 0.075;                              /* raio dos cantos */
const HL = 0.2, TT = 0.016;                   /* tampa: altura e espessura */
const FOLGA = 0.02, TB = 0.014;               /* base: recuo em relação à tampa e espessura */
const Y_TAMPA = H - HL;                       /* onde a tampa começa (a base aparece abaixo) */
const LP = 1.4, WP = 0.68, TP = 0.072, RP = 0.1;   /* o aparelho */
const Y_FUNDO = TB + 0.1;                     /* altura do berço onde o aparelho deita */

const LIMIAR_LACRE = 0.7, LIMIAR_TAMPA = 0.6;

const cl = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const suave = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* retângulo de cantos arredondados, centrado na origem */
function retangulo(w, d, r){
  const s = new Shape(), x = -w / 2, y = -d / 2;
  r = Math.max(0.001, Math.min(r, w / 2, d / 2));
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/* bloco maciço de altura h, base em y = 0, bordas levemente arredondadas */
function bloco(w, d, r, h, b){
  const g = new ExtrudeGeometry(retangulo(w - 2 * b, d - 2 * b, r - b),
    { depth: Math.max(0.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); g.translate(0, b, 0);
  return g;
}
/* paredes (anel) de altura h e espessura t */
function paredes(w, d, r, t, h, b){
  const s = retangulo(w - 2 * b, d - 2 * b, r - b);
  s.holes.push(retangulo(w - 2 * t + 2 * b, d - 2 * t + 2 * b, r - t + b));
  const g = new ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); g.translate(0, b, 0);
  return g;
}
function textura(canvas){ const t = new CanvasTexture(canvas); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t; }
function tela(w, h, desenha){ const c = document.createElement("canvas"); c.width = w; c.height = h; desenha(c.getContext("2d"), w, h); return textura(c); }

/* ---------- sons opcionais (ENABLE_UNBOXING_AUDIO): sintetizados, nenhum arquivo ---------- */
function criaSom(ligado){
  let ctx = null;
  const pronto = () => {
    if (!ligado) return null;
    try {
      if (!ctx){ const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
      if (ctx.state === "suspended") ctx.resume();
    } catch (_){ return null; }
    return ctx;
  };
  function ruido(dur, freq, vol, q){
    const c = pronto(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), dado = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dado[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), filtro = c.createBiquadFilter(), g = c.createGain();
    filtro.type = "bandpass"; filtro.frequency.value = freq; filtro.Q.value = q || 1.2;
    g.gain.value = vol; src.buffer = buf;
    src.connect(filtro).connect(g).connect(c.destination); src.start();
  }
  function tom(freq, dur, vol){
    const c = pronto(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
  }
  return {
    destrava: pronto,
    raspa(){ ruido(0.05, 2600, 0.05, 2); },            /* lacre descolando */
    arranca(){ ruido(0.22, 1800, 0.12, 0.8); },        /* lacre saiu */
    abre(){ ruido(0.5, 500, 0.08, 0.6); },             /* tampa subindo (ar) */
    clique(){ tom(1250, 0.07, 0.05); },                /* final */
    fecha(){ try { if (ctx) ctx.close(); } catch (_){} ctx = null; }
  };
}

/* ======================================================================== */
export function iniciar(palco, op = {}){
  const reduz = !!op.reduzMovimento;
  const avisa = (nome, v) => { try { op[nome] && op[nome](v); } catch (_){} };
  const som = criaSom(!!op.audio);

  /* ---------- renderizador: DPR limitado, fundo transparente ---------- */
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "unbox-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Caixa de iPhone em 3D. Arraste para girar, puxe o lacre e abra a tampa.");
  palco.appendChild(canvas);

  const cena = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const ambiente = new RoomEnvironment();
  cena.environment = pmrem.fromScene(ambiente, 0.04).texture;
  cena.environmentIntensity = 0.38;
  ambiente.dispose && ambiente.dispose();

  const camera = new PerspectiveCamera(32, 1, 0.05, 30);
  const alvoCam = new Vector3(0, 0.15, 0);
  const cam = { dist: 1, elev: 24 * Math.PI / 180, alvoY: 0.15 };

  /* ---------- luz: ambiente suave + uma luz principal com sombra + um contraluz quente na revelação ---------- */
  const ceu = new HemisphereLight(0xfff6ee, 0x24160f, 0.5);
  const principal = new DirectionalLight(0xffffff, 2.5);
  principal.position.set(1.6, 3.6, 1.2);
  principal.castShadow = true;
  const tamSombra = Math.min(window.innerWidth, window.innerHeight) < 600 ? 512 : 1024;
  principal.shadow.mapSize.set(tamSombra, tamSombra);
  Object.assign(principal.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 9 });
  principal.shadow.bias = -0.0004;
  principal.shadow.normalBias = 0.02;
  principal.shadow.radius = 3;
  const contraluz = new SpotLight(0xff8a4a, 0, 7, 0.65, 0.85, 1.4);
  contraluz.position.set(-1.7, 2.1, -1.3);
  cena.add(ceu, principal, contraluz, contraluz.target);

  /* chão: só a sombra e um brilho quente embaixo da caixa */
  const chao = new Mesh(new PlaneGeometry(8, 8), new ShadowMaterial({ opacity: 0.34 }));
  chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true;
  const brilhoTex = tela(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,140,80,0.26)"); gr.addColorStop(0.55, "rgba(255,106,33,0.07)"); gr.addColorStop(1, "rgba(255,106,33,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const brilho = new Mesh(new CircleGeometry(1.9, 48), new MeshBasicMaterial({ map: brilhoTex, transparent: true, depthWrite: false }));
  brilho.rotation.x = -Math.PI / 2; brilho.position.y = -0.002;
  cena.add(chao, brilho);

  /* ---------- a caixa ---------- */
  const caixa = new Group();                 /* gira com o arraste */
  cena.add(caixa);
  const papel = new MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.88, metalness: 0 });
  const papelDentro = new MeshStandardMaterial({ color: 0xebe7e0, roughness: 0.95, metalness: 0 });
  const sombreia = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  /* base */
  const WB = W - 2 * FOLGA, DB = D - 2 * FOLGA, RB = R - FOLGA, HB = H - TT - 0.004;
  const base = new Group();
  const fundo = sombreia(new Mesh(bloco(WB, DB, RB, TB, 0.004), papel));
  const paredeBase = sombreia(new Mesh(paredes(WB, DB, RB, TB, HB, 0.003), papel));
  const berco = sombreia(new Mesh(bloco(WB - 2 * TB - 0.006, DB - 2 * TB - 0.006, RB - TB, 0.1, 0.01), papelDentro));
  berco.position.y = TB;
  base.add(fundo, paredeBase, berco);
  base.traverse((o) => { o.userData.parte = "base"; });
  caixa.add(base);

  /* tampa */
  const tampa = new Group();
  tampa.position.y = Y_TAMPA;
  const papelTampa = papel.clone();          /* material próprio: some na revelação */
  const topo = sombreia(new Mesh(bloco(W, D, R, TT, 0.006), papelTampa));
  topo.position.y = HL - TT;
  const paredeTampa = sombreia(new Mesh(paredes(W, D, R, TT, HL - TT + 0.003, 0.004), papelTampa));
  /* marca discreta no topo, em baixo-relevo claro (sem logotipo de terceiros) */
  const marcaTex = tela(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(160,150,138,0.55)";
    g.font = "600 88px Manrope, 'Helvetica Neue', Arial, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    if ("letterSpacing" in g) g.letterSpacing = "24px";
    g.fillText("SR PHONE", w / 2, h / 2 + 4);
  });
  const marca = new Mesh(new PlaneGeometry(0.8, 0.2), new MeshStandardMaterial({ map: marcaTex, transparent: true, roughness: 0.9, depthWrite: false }));
  marca.rotation.x = -Math.PI / 2; marca.position.y = HL + 0.0015;
  tampa.add(topo, paredeTampa, marca);
  tampa.traverse((o) => { o.userData.parte = "tampa"; });
  caixa.add(tampa);

  /* o aparelho, deitado no berço, com a tela para cima */
  const aparelho = new Group();
  aparelho.position.y = Y_FUNDO;
  const aro = sombreia(new Mesh(bloco(LP, WP, RP, TP, 0.018), new MeshStandardMaterial({ color: 0x3f3b38, metalness: 0.75, roughness: 0.32 })));
  const fundoTela = tela(1024, 512, (g, w, h) => {
    g.fillStyle = "#07060a"; g.fillRect(0, 0, w, h);
    const blob = (x, y, r, cor) => { const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w); gr.addColorStop(0, cor); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
    blob(0.66, 0.55, 0.55, "rgba(255,106,33,0.95)");
    blob(0.28, 0.3, 0.45, "rgba(122,31,162,0.8)");
    blob(0.86, 0.18, 0.25, "rgba(255,176,32,0.8)");
    blob(0.4, 0.85, 0.35, "rgba(255,60,90,0.55)");
  });
  fundoTela.repeat.set(1 / (LP - 0.035), 1 / (WP - 0.035));
  fundoTela.offset.set(0.5, 0.5);
  const vidro = new MeshStandardMaterial({ color: 0x151515, map: fundoTela, emissive: 0xffffff, emissiveMap: fundoTela, emissiveIntensity: 0, roughness: 0.16, metalness: 0 });
  const telaMesh = new Mesh(new ShapeGeometry(retangulo(LP - 0.035, WP - 0.035, RP - 0.02), 10), vidro);
  telaMesh.rotation.x = -Math.PI / 2; telaMesh.position.y = TP + 0.0008;
  const ilha = new Mesh(new ShapeGeometry(retangulo(0.046, 0.17, 0.023), 8), new MeshStandardMaterial({ color: 0x000000, roughness: 0.2 }));
  ilha.rotation.x = -Math.PI / 2; ilha.position.set(-LP / 2 + 0.1, TP + 0.0016, 0);
  aparelho.add(aro, telaMesh, ilha);
  aparelho.traverse((o) => { o.userData.parte = "base"; });
  base.add(aparelho);

  /* ---------- o lacre: uma fita que desce pela frente da caixa, com a aba laranja no topo ---------- */
  const ZL = D / 2, ZB = D / 2 - FOLGA, EPS = 0.0022;
  const Y0 = H - 0.035, Y_FIM = 0.035, PONTE = 0.012;
  const LA = Y0 - Y_TAMPA, LB = Math.hypot(PONTE, FOLGA), LC = (Y_TAMPA - PONTE) - Y_FIM;
  const L_COLADO = LA + LB + LC, L_ABA = 0.09, L_TOTAL = L_ABA + L_COLADO, LARG = 0.19;
  /* ponto da superfície a uma distância u do começo da parte colada, com tangente (subindo) e normal (para fora) */
  function superficie(u){
    u = cl(u, 0, L_COLADO);
    if (u <= LA) return { y: Y0 - u, z: ZL, ty: 1, tz: 0 };
    if (u <= LA + LB){
      const k = (u - LA) / LB;
      return { y: Y_TAMPA - PONTE * k, z: ZL - FOLGA * k, ty: PONTE / LB, tz: FOLGA / LB };
    }
    return { y: Y_TAMPA - PONTE - (u - LA - LB), z: ZB, ty: 1, tz: 0 };
  }
  const N_SEG = 72;
  const lacreGeo = new BufferGeometry();
  const posicoes = new Float32Array((N_SEG + 1) * 2 * 3), uvs = new Float32Array((N_SEG + 1) * 2 * 2), idx = [];
  for (let i = 0; i <= N_SEG; i++){
    const v = 1 - i / N_SEG;
    uvs.set([0, v, 1, v], i * 4);
    if (i < N_SEG){ const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  lacreGeo.setAttribute("position", new Float32BufferAttribute(posicoes, 3));
  const pos = lacreGeo.getAttribute("position").array;   /* o atributo guarda uma cópia: escreve nela */
  lacreGeo.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  lacreGeo.setIndex(idx);
  const lacreTex = tela(128, 384, (g, w, h) => {
    const aba = Math.round(h * L_ABA / L_TOTAL);
    g.fillStyle = "#fff0e6"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#FF6A21"; g.fillRect(0, 0, w, aba);
    g.fillRect(0, aba, 12, h - aba); g.fillRect(w - 12, aba, 12, h - aba);
    g.fillStyle = "#1a0d05"; g.font = "800 21px Manrope, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("PUXE", w / 2, aba / 2 + 1);
    g.save(); g.translate(w / 2, aba + (h - aba) / 2); g.rotate(Math.PI / 2);
    g.fillStyle = "rgba(255,106,33,0.9)"; g.font = "700 17px Manrope, Arial, sans-serif";
    if ("letterSpacing" in g) g.letterSpacing = "5px";
    g.fillText("LACRADO · SR PHONE", 0, 0); g.restore();
  });
  const lacreMat = new MeshStandardMaterial({ map: lacreTex, side: DoubleSide, roughness: 0.4, metalness: 0, transparent: true });
  const lacre = new Mesh(lacreGeo, lacreMat);
  lacre.castShadow = true; lacre.receiveShadow = true;
  lacre.userData.parte = "lacre";
  caixa.add(lacre);

  const fita = { voa: 0, lado: 0 };          /* voa: 0 colado · 1 solto e fora da cena */
  function desenhaLacre(p, lado){
    const pp = p * L_COLADO;
    const f = superficie(pp);
    const Tt = [f.ty, f.tz], Nn = [-f.tz, f.ty];
    const raio = 0.018 + 0.022 * p;
    const tmax = mix(0.7, 1.95, suave(0, 0.2, p));   /* em repouso a aba fica levantada; puxando, vem para fora e para baixo */
    for (let i = 0; i <= N_SEG; i++){
      const u = -L_ABA + (i / N_SEG) * L_TOTAL;   /* u < 0: a aba */
      let y, z, x0 = 0;
      if (u >= pp){
        /* ainda colado: sobre a superfície, afastado só o suficiente para não sumir dentro dela */
        const s = superficie(u);
        y = s.y - s.tz * EPS; z = s.z + s.ty * EPS;
      } else {
        const d = pp - u, lim = raio * tmax;
        let a, b;
        if (d < lim){ const th = d / raio; a = raio * Math.sin(th); b = raio * (1 - Math.cos(th)); }
        else {
          a = raio * Math.sin(tmax) + (d - lim) * Math.cos(tmax);
          b = raio * (1 - Math.cos(tmax)) + (d - lim) * Math.sin(tmax);
        }
        y = f.y + a * Tt[0] + (b + EPS) * Nn[0];
        z = f.z + a * Tt[1] + (b + EPS) * Nn[1];
        x0 = lado * d * 0.55;
      }
      /* solto: cai para frente e para baixo */
      if (fita.voa > 0){ const t = fita.voa; y -= t * t * 0.9; z += t * 0.55; x0 += lado * t * 0.3; }
      pos.set([x0 - LARG / 2, y, z, x0 + LARG / 2, y, z], i * 6);
    }
    lacreGeo.attributes.position.needsUpdate = true;
    lacreGeo.computeVertexNormals();
    lacreGeo.computeBoundingSphere();
  }

  /* ---------- estado ---------- */
  let estado = E.SEALED;
  const prog = { lacre: 0, lacreAlvo: 0, tampa: 0, tampaAlvo: 0, revela: 0 };
  const giro = { y: -0.38, x: 0, vy: 0, vx: 0 };
  let arraste = null, animando = [], raf = 0, visivel = true, destruido = false, ultimoRaspa = 0;

  function mudaEstado(novo){
    if (estado === novo) return;
    estado = novo;
    palco.dataset.estado = novo;
    avisa("aoEstado", novo);
  }
  palco.dataset.estado = estado;

  /* tween simples */
  function anima(dur, passo, fim, ease){
    dur = reduz ? Math.min(dur, 180) : dur;
    const a = { t0: 0, dur: Math.max(1, dur), passo, fim, ease: ease || easeInOut };
    animando.push(a); acorda(); return a;
  }

  /* ---------- aplica o estado na cena ---------- */
  function aplica(){
    caixa.rotation.set(giro.x, giro.y, 0);
    /* lacre */
    if (lacre.visible) desenhaLacre(prog.lacre, fita.lado);
    lacreMat.opacity = 1 - cl((fita.voa - 0.55) / 0.45, 0, 1);
    /* tampa: sobe com o gesto e inclina um pouco para trás; na revelação sobe e recua */
    const p = prog.tampa, r = prog.revela;
    tampa.position.y = Y_TAMPA + p * 0.42 + r * 0.9;
    tampa.position.z = -r * 0.7;
    tampa.rotation.x = -0.14 * suave(0.3, 1, p) - r * 0.45;
    const some = suave(0.3, 0.8, r);
    papelTampa.transparent = some > 0; papelTampa.opacity = 1 - some;
    marca.material.opacity = 1 - some;
    tampa.visible = some < 0.999;
    topo.castShadow = paredeTampa.castShadow = some < 0.5;
    /* aparelho sobe alguns centímetros e se inclina para a câmera */
    aparelho.position.y = Y_FUNDO + r * 0.13;
    aparelho.rotation.x = -r * 0.1;
    vidro.emissiveIntensity = r * 0.9;
    vidro.color.setScalar(mix(0.085, 0.42, r));
    /* luz da revelação */
    contraluz.intensity = r * 16;
    contraluz.target.position.set(0, Y_FUNDO + 0.1, 0);
    principal.intensity = 2.5 + r * 0.35;
    ceu.intensity = 0.5 - r * 0.1;
    cena.environmentIntensity = 0.38 + r * 0.14;
    /* câmera: aproxima e olha um pouco mais de cima */
    const movCam = reduz ? 0.35 : 1;
    cam.dist = 1 - r * 0.12 * movCam * (camera.aspect < 1.15 ? 0.25 : 1);   /* tela estreita: aproxima menos */
    cam.elev = (24 + r * 13 * movCam) * Math.PI / 180;
    cam.alvoY = 0.15 + r * 0.03;
    posicionaCamera();
    cena.updateMatrixWorld();
  }

  /* ---------- câmera: enquadra a caixa em qualquer tamanho de tela ---------- */
  let largura = 1, altura = 1;
  function posicionaCamera(){
    const vfov = camera.fov * Math.PI / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const raio = camera.aspect < 1.15 ? 1.13 : 1.08;
    const dist = raio / Math.sin(Math.min(vfov, hfov) / 2) * cam.dist;
    alvoCam.set(0, cam.alvoY, 0);
    camera.position.set(0, alvoCam.y + Math.sin(cam.elev) * dist, Math.cos(cam.elev) * dist);
    camera.lookAt(alvoCam);
    camera.updateMatrixWorld();
  }
  function redimensiona(){
    const r = palco.getBoundingClientRect();
    largura = Math.max(1, Math.round(r.width)); altura = Math.max(1, Math.round(r.height));
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
    aplica(); acorda();
  }
  const ro = "ResizeObserver" in window ? new ResizeObserver(redimensiona) : null;
  if (ro) ro.observe(palco); else window.addEventListener("resize", redimensiona);
  const io = "IntersectionObserver" in window ? new IntersectionObserver((en) => { visivel = en[0].isIntersecting; if (visivel) acorda(); }) : null;
  if (io) io.observe(palco);

  /* ---------- laço de desenho: só roda quando algo muda ---------- */
  let ultimo = 0;
  function quadro(agora){
    raf = 0;
    if (destruido) return;
    const dt = Math.min(0.05, ultimo ? (agora - ultimo) / 1000 : 0.016);
    ultimo = agora;
    let continua = false;
    /* animações (a que termina pode começar outra: roda o "fim" depois de limpar a fila) */
    const fins = [];
    animando = animando.filter((a) => {
      if (!a.t0) a.t0 = agora;
      const t = cl((agora - a.t0) / a.dur, 0, 1);
      a.passo(a.ease(t));
      if (t >= 1){ if (a.fim) fins.push(a.fim); return false; }
      return true;
    });
    fins.forEach((f) => f());
    if (animando.length) continua = true;
    /* o lacre e a tampa seguem o dedo com uma leve resistência */
    const seg = reduz ? 1 : 1 - Math.exp(-dt * 14);
    if (arraste && arraste.modo === "lacre"){ prog.lacre += (prog.lacreAlvo - prog.lacre) * seg; continua = true; }
    if (arraste && arraste.modo === "tampa"){ prog.tampa += (prog.tampaAlvo - prog.tampa) * (reduz ? 1 : 1 - Math.exp(-dt * 18)); continua = true; }
    /* inércia do giro */
    if (!arraste && !reduz && (Math.abs(giro.vy) > 0.0004 || Math.abs(giro.vx) > 0.0004)){
      giro.y += giro.vy; giro.x = cl(giro.x + giro.vx, -0.32, 0.42);
      const am = Math.pow(0.9, dt * 60); giro.vy *= am; giro.vx *= am;
      continua = true;
    }
    if (arraste) continua = true;
    aplica();
    renderer.render(cena, camera);
    posicionaDicas();
    if (continua && visivel && !document.hidden) raf = requestAnimationFrame(quadro);
    else ultimo = 0;
  }
  function acorda(){ if (!raf && !destruido && visivel && !document.hidden) raf = requestAnimationFrame(quadro); }
  const aoVoltarAba = () => { if (!document.hidden) acorda(); };
  document.addEventListener("visibilitychange", aoVoltarAba);

  /* ---------- o que está embaixo do dedo ---------- */
  const ray = new Raycaster(), ponteiro = new Vector2(), tmp = new Vector3();
  function tela2d(v){
    tmp.copy(v).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (tmp.x + 1) / 2 * r.width, y: r.top + (1 - tmp.y) / 2 * r.height, frente: tmp.z < 1 };
  }
  function pontoMundo(local){ return caixa.localToWorld(tmp.copy(local)); }
  function pontoAba(){ return superficieMundo(-L_ABA * 0.45); }
  function superficieMundo(u){
    if (u < 0){ const s = superficie(0); return caixa.localToWorld(new Vector3(0, s.y + (-u) * 0.77, s.z + (-u) * 0.64)); }
    const s = superficie(u); return caixa.localToWorld(new Vector3(0, s.y, s.z + EPS));
  }
  /* a frente da caixa está virada para a câmera? */
  function frenteVisivel(){
    const n = new Vector3(0, 0, 1).applyQuaternion(caixa.quaternion);
    const olhar = new Vector3().subVectors(camera.position, pontoMundo(new Vector3(0, H / 2, ZL))).normalize();
    return n.dot(olhar) > 0.2;
  }
  function oQueTocou(cx, cy, tipo){
    const r = canvas.getBoundingClientRect();
    ponteiro.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ponteiro, camera);
    const hit = ray.intersectObjects(caixa.children, true).filter((h) => h.object.visible)[0];
    /* o lacre é estreito: vale tocar perto dele (mais folga no dedo que no mouse) */
    if (estado === E.SEALED && lacre.visible && frenteVisivel()){
      const folga = tipo === "mouse" ? 16 : 30;
      const a = tela2d(superficieMundo(-L_ABA)), b = tela2d(superficieMundo(L_COLADO * 0.6));
      if (distSegmento(cx, cy, a, b) < folga) return "lacre";
    }
    if (!hit) return null;
    return hit.object.userData.parte || "base";
  }
  function distSegmento(px, py, a, b){
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
    const t = cl(((px - a.x) * vx + (py - a.y) * vy) / l2, 0, 1);
    return Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy));
  }

  /* ---------- dicas na tela (a pílula acompanha a aba ou a tampa) ---------- */
  const pilula = document.createElement("div");
  pilula.className = "unbox-alvo"; pilula.setAttribute("aria-hidden", "true");
  palco.appendChild(pilula);
  function posicionaDicas(){
    let alvo = null, texto = "";
    if (estado === E.SEALED && lacre.visible && frenteVisivel() && !arraste){ alvo = pontoAba(); texto = "Segure e puxe"; }
    else if (estado === E.UNSEALED && !arraste){ alvo = pontoMundo(new Vector3(0, H + 0.02, ZL * 0.5)); texto = "Arraste para abrir"; }
    if (!alvo){ pilula.classList.remove("on"); return; }
    const p = tela2d(alvo), r = palco.getBoundingClientRect();
    pilula.textContent = texto;
    pilula.style.transform = "translate(" + Math.round(p.x - r.left) + "px," + Math.round(p.y - r.top) + "px) translate(-50%,-100%)";
    pilula.classList.add("on");
  }

  /* ---------- gestos (mouse, dedo e caneta) ---------- */
  function cursor(){
    canvas.style.cursor = arraste ? "grabbing" : "grab";
  }
  function aoApertar(e){
    if (destruido || arraste || (e.button !== undefined && e.button > 0)) return;
    if (estado === E.PEELING || estado === E.OPENING) return;
    const alvo = oQueTocou(e.clientX, e.clientY, e.pointerType);
    /* no dedo, tocar fora da caixa deixa a página rolar */
    if (e.pointerType !== "mouse" && !alvo) return;
    som.destrava();
    let modo = "girar";
    if (alvo === "lacre" && estado === E.SEALED){ modo = "lacre"; mudaEstado(E.PEELING); }
    else if (alvo === "tampa" && estado === E.UNSEALED){ modo = "tampa"; mudaEstado(E.OPENING); }
    else if (alvo === "tampa" && estado === E.SEALED) avisa("aoDica", "Primeiro, puxe a aba laranja do lacre.");
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_){}
    arraste = { id: e.pointerId, modo, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() };
    giro.vx = giro.vy = 0;
    animando = animando.filter((a) => !a.giro);
    cursor(); acorda();
    if (modo === "lacre") avisa("aoDica", "Continue puxando para baixo…");
    if (modo === "tampa") avisa("aoDica", "Continue puxando para cima…");
  }
  function aoMover(e){
    if (!arraste){ if (e.pointerType === "mouse") cursor(); return; }
    if (e.pointerId !== arraste.id) return;
    const dx = e.clientX - arraste.x0, dy = e.clientY - arraste.y0;
    if (arraste.modo === "girar"){
      const mx = e.clientX - arraste.x, my = e.clientY - arraste.y;
      giro.y += mx * 0.0085; giro.x = cl(giro.x + my * 0.005, -0.32, 0.42);
      giro.vy = mx * 0.0085; giro.vx = my * 0.005;
    } else if (arraste.modo === "lacre"){
      /* puxar para baixo (e um pouco para o lado) solta o lacre; a curva dá a resistência */
      const dist = Math.max(0, dy) + Math.abs(dx) * 0.3;
      prog.lacreAlvo = Math.pow(cl(dist / (altura * 0.5), 0, 1), 1.12);
      fita.lado = cl(dx / (largura * 0.45), -1, 1);
      const agora = performance.now();
      if (prog.lacre > 0.03 && agora - ultimoRaspa > 70 && Math.abs(e.clientY - arraste.y) > 1){ ultimoRaspa = agora; som.raspa(); }
      if (prog.lacre >= 0.88){ solta(e, true); return; }
    } else if (arraste.modo === "tampa"){
      prog.tampaAlvo = cl(-dy / (altura * 0.42), 0, 1);
      if (prog.tampa >= 0.88){ solta(e, true); return; }
    }
    arraste.x = e.clientX; arraste.y = e.clientY;
    acorda();
  }
  function solta(e, forcado){
    if (!arraste || (e && e.pointerId !== undefined && e.pointerId !== arraste.id && !forcado)) return;
    const modo = arraste.modo;
    try { canvas.releasePointerCapture(arraste.id); } catch (_){}
    arraste = null; cursor();
    if (modo === "lacre"){
      if (prog.lacre >= LIMIAR_LACRE) completaLacre();
      else {
        const de = prog.lacre;
        anima(420, (t) => { prog.lacre = de * (1 - t); }, () => { prog.lacre = prog.lacreAlvo = 0; mudaEstado(E.SEALED); avisa("aoDica", dicaInicial()); }, easeOut);
      }
    } else if (modo === "tampa"){
      if (prog.tampa >= LIMIAR_TAMPA) abreTampa();
      else {
        const de = prog.tampa;
        anima(380, (t) => { prog.tampa = de * (1 - t); }, () => { prog.tampa = prog.tampaAlvo = 0; mudaEstado(E.UNSEALED); avisa("aoDica", "Segure a tampa e puxe para cima."); }, easeOut);
      }
    }
    acorda();
  }
  function aoTocar(e){
    /* só segura a rolagem da página quando o dedo começa em cima da caixa */
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (oQueTocou(t.clientX, t.clientY, "touch")) e.preventDefault();
  }
  canvas.addEventListener("pointerdown", aoApertar);
  canvas.addEventListener("pointermove", aoMover);
  canvas.addEventListener("pointerup", solta);
  canvas.addEventListener("pointercancel", solta);
  canvas.addEventListener("lostpointercapture", solta);
  canvas.addEventListener("touchstart", aoTocar, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  /* ---------- etapas ---------- */
  function dicaInicial(){ return "Arraste para girar a caixa. Para abrir, segure a aba laranja e puxe para baixo."; }
  function completaLacre(){
    const de = prog.lacre;
    mudaEstado(E.PEELING);
    anima(260, (t) => { prog.lacre = mix(de, 1, t); }, () => {
      prog.lacre = prog.lacreAlvo = 1;
      som.arranca();
      anima(620, (t) => { fita.voa = t; }, () => {
        lacre.visible = false;
        mudaEstado(E.UNSEALED);
        avisa("aoLacre");
        avisa("aoDica", "Lacre fora. Agora segure a tampa e puxe para cima.");
      }, (t) => t);
    }, easeOut);
  }
  function abreTampa(){
    const de = prog.tampa;
    mudaEstado(E.OPENING);
    som.abre();
    const g0 = { y: giro.y, x: giro.x };
    const gy = alvoGiro(-0.3);
    giro.vx = giro.vy = 0;
    anima(reduz ? 200 : 1700, (t) => {
      prog.tampa = mix(de, 1, Math.min(1, t * 2));
      prog.revela = t;
      giro.y = mix(g0.y, gy, t); giro.x = mix(g0.x, 0, t);
    }, () => {
      prog.tampa = prog.tampaAlvo = 1; prog.revela = 1;
      mudaEstado(E.OPENED);
      som.clique();
      avisa("aoDica", "Seu iPhone chegou. Arraste para ver de todos os lados.");
      avisa("aoTerminar");
    });
  }
  /* o giro mais curto até o ângulo de frente */
  function alvoGiro(frente){
    const volta = Math.PI * 2;
    let alvo = frente + Math.round((giro.y - frente) / volta) * volta;
    return alvo;
  }
  function viraParaFrente(fim){
    const g0 = { y: giro.y, x: giro.x }, gy = alvoGiro(-0.25);
    giro.vx = giro.vy = 0;
    if (Math.abs(g0.y - gy) < 0.05 && Math.abs(g0.x) < 0.05){ fim(); return; }
    const a = anima(520, (t) => { giro.y = mix(g0.y, gy, t); giro.x = mix(g0.x, 0, t); }, fim);
    a.giro = true;
  }

  /* botão acessível: faz a etapa atual sem precisar arrastar (teclado e leitor de tela) */
  function passo(){
    if (arraste || animando.some((a) => !a.giro)) return;
    if (estado === E.SEALED){
      mudaEstado(E.PEELING);
      viraParaFrente(() => {
        anima(1100, (t) => { prog.lacre = prog.lacreAlvo = t * 0.999; }, completaLacre);
      });
    } else if (estado === E.UNSEALED){
      mudaEstado(E.OPENING);
      anima(500, (t) => { prog.tampa = t * LIMIAR_TAMPA; }, abreTampa);
    }
  }
  function recomecar(){
    if (arraste) return;
    animando = [];
    lacre.visible = true; fita.voa = 0; fita.lado = 0;
    const r0 = prog.revela, t0 = prog.tampa;
    prog.lacre = prog.lacreAlvo = 0; prog.tampaAlvo = 0;
    anima(900, (t) => { prog.revela = r0 * (1 - t); prog.tampa = t0 * (1 - t); }, () => {
      prog.revela = 0; prog.tampa = 0;
      mudaEstado(E.SEALED);
      avisa("aoDica", dicaInicial());
    });
  }

  /* ---------- limpeza: devolve a memória da placa de vídeo ---------- */
  function destruir(){
    if (destruido) return;
    destruido = true;
    if (raf) cancelAnimationFrame(raf);
    if (ro) ro.disconnect(); else window.removeEventListener("resize", redimensiona);
    if (io) io.disconnect();
    document.removeEventListener("visibilitychange", aoVoltarAba);
    cena.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material){
        [].concat(o.material).forEach((m) => { ["map", "emissiveMap"].forEach((k) => m[k] && m[k].dispose()); m.dispose(); });
      }
    });
    if (cena.environment) cena.environment.dispose();
    pmrem.dispose();
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    canvas.remove(); pilula.remove();
    som.fecha();
  }
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); avisa("aoErro", "contexto"); });

  cursor();
  redimensiona();
  avisa("aoDica", dicaInicial());
  /* entrada: a caixa gira de leve para mostrar que é 3D (sem isso com movimento reduzido) */
  if (!reduz){
    const gy = giro.y; giro.y = gy + 0.55;
    const a = anima(1300, (t) => { giro.y = mix(gy + 0.55, gy, t); }, null, easeOut); a.giro = true;
  }

  return {
    estado: () => estado,
    progresso: () => ({ lacre: prog.lacre, tampa: prog.tampa, revela: prog.revela }),
    /* true enquanto algum movimento (giro de entrada, volta do lacre, tampa) ainda está acontecendo */
    animando: () => animando.length > 0,
    /* posição na tela de partes da caixa (usado pela dica e pelos testes automáticos) */
    ponto(nome){
      aplica();
      if (nome === "aba") return tela2d(pontoAba());
      if (nome === "tampa") return tela2d(pontoMundo(new Vector3(0, H, 0)));
      if (nome === "base") return tela2d(pontoMundo(new Vector3(W * 0.35, 0.08, D / 2)));
      return null;
    },
    passo, recomecar, destruir
  };
}
