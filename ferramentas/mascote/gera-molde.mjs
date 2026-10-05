// Gera o MOLDE do mascote em GLB: o mascote 3D da marca (com pernas e sapatos) e as 12 animações
// que o site espera, com os mesmos nomes (Idle, Hover, Wave, Welcome, LookAround, Thinking,
// Talking01, Talking02, Point, Present, ThumbsUp, Goodbye).
// Serve para duas coisas:
//   1. referência para quem for modelar o mascote oficial: abra no Blender e veja os nomes das
//      peças, o tamanho, a posição da câmera/braços e a duração de cada gesto;
//   2. os testes (npm test) carregam este arquivo para provar que o site lê um GLB de verdade e
//      troca as animações pelo AnimationMixer (também numa versão comprimida com Meshopt).
// NÃO é o modelo oficial e não vai para o site (a pasta ferramentas/ não é publicada).
// Para gerar de novo (precisa do Three.js completo e do gltfpack, numa pasta fora do site):
//   npm i three@0.186.1 esbuild@0.25 gltfpack@1.3.0
//   NODE_MODULES=/caminho/node_modules node ferramentas/mascote/gera-molde.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { iniciaServidor } from "../servidor.mjs";
import { RAIZ } from "../ler-dados.mjs";

const NM = process.env.NODE_MODULES;
if (!NM || !fs.existsSync(path.join(NM, "three"))){ console.error("Defina NODE_MODULES com a pasta node_modules que tem three@0.186.1, esbuild e gltfpack."); process.exit(2); }
const { build } = await import(path.join(NM, "esbuild/lib/main.js"));
const saida = await build({ stdin: { contents: `export { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
  export { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack, CanvasTexture, SRGBColorSpace } from "three";`, resolveDir: NM },
  bundle: true, format: "esm", write: false, nodePaths: [NM], minify: true });
const exportador = saida.outputFiles[0].text;

const CLIPES = [   /* nome, estado, duração (s), repete?, extras */
  ["Idle", "idle", 9.2, true], ["Hover", "hover", 4.2, true, { t0: 0.8 }], ["Wave", "greeting", 2.6, false],
  ["Welcome", "welcome", 3.2, false], ["LookAround", "lookaround", 3.6, false],
  ["Thinking", "thinking", 4.4, true, { t0: 0.8 }], ["Talking01", "speaking", 3.0, true, { gesto: 0, t0: 0.6 }],
  ["Talking02", "speaking", 3.0, true, { gesto: 1, t0: 0.6 }], ["Point", "pointing", 2.4, false, { alvoX: -1, alvoY: 0.4 }],
  ["Present", "present", 2.6, false, { alvoX: -1, alvoY: 0.2 }], ["ThumbsUp", "success", 1.9, false],
  ["Goodbye", "goodbye", 2.2, false]
];
const srv = await iniciaServidor(0);
const BASE = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
try {
  const p = await nav.newPage();
  await p.route(BASE + "/__exportador.js", (r) => r.fulfill({ contentType: "text/javascript", body: exportador }));
  await p.route(BASE + "/__molde.html", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><script type="module">
    import { montaBonecoProvisorio } from "/js/mascote3d.js";
    import { GLTFExporter, AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from "/__exportador.js";
    const CLIPES = ${JSON.stringify(CLIPES)};
    const b = montaBonecoProvisorio();
    /* uma textura pequena (metal escovado na câmera): os testes conferem que textura de GLB abre com o CSP do site */
    const tela = document.createElement("canvas"); tela.width = tela.height = 64;
    const g2 = tela.getContext("2d"); g2.fillStyle = "#e7d6bb"; g2.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 2){ g2.fillStyle = "rgba(0,0,0," + (0.03 + (y * 7 % 5) / 100) + ")"; g2.fillRect(0, y, 64, 1); }
    const { CanvasTexture, SRGBColorSpace } = await import("/__exportador.js");
    const tx = new CanvasTexture(tela); tx.colorSpace = SRGBColorSpace; tx.name = "MetalEscovado";
    b.materiais.champanhe.map = tx; b.materiais.champanhe.color.set(0xffffff); b.materiais.champanhe.needsUpdate = true;
    const nos = []; b.raiz.traverse((o) => { if (o.name && !o.isMesh) nos.push(o); });
    const FPS = 30, clipes = [];
    for (const [nome, estado, dur, repete, extra = {}] of CLIPES){
      const ctx = Object.assign({ olharX: 0, olharY: 0, alvoX: -1, alvoY: 0, gesto: 0, reduz: false, instantaneo: true }, extra);
      const n = Math.round(dur * FPS) + 1, tempos = [], q = nos.map(() => []), pos = nos.map(() => []), esc = nos.map(() => []);
      for (let i = 0; i < n; i++){
        const t = (extra.t0 || 0) + i / FPS;
        b.animador.atualiza(estado, t, t, 1 / FPS, ctx);
        tempos.push(i / FPS);
        nos.forEach((o, k) => { q[k].push(...o.quaternion.toArray()); pos[k].push(...o.position.toArray()); esc[k].push(...o.scale.toArray()); });
      }
      /* laço sem emenda: o último trecho vai se misturando com o primeiro quadro */
      const funde = (v, largura) => { if (!repete) return v; const m = Math.round(n * 0.15);
        for (let i = n - m; i < n; i++){ const a = (i - (n - m)) / (m - 1); for (let c = 0; c < largura; c++) v[i * largura + c] += (v[c] - v[i * largura + c]) * a; } return v; };
      const trilhas = [];
      nos.forEach((o, k) => {
        const varia = (v, l) => v.some((x, i) => Math.abs(x - v[i % l]) > 1e-4);
        if (varia(q[k], 4)) trilhas.push(new QuaternionKeyframeTrack(o.name + ".quaternion", tempos, funde(q[k], 4)));
        if (varia(pos[k], 3)) trilhas.push(new VectorKeyframeTrack(o.name + ".position", tempos, funde(pos[k], 3)));
        if (varia(esc[k], 3)) trilhas.push(new VectorKeyframeTrack(o.name + ".scale", tempos, funde(esc[k], 3)));
      });
      clipes.push(new AnimationClip(nome, dur, trilhas));
    }
    /* volta à pose parada antes de exportar */
    b.animador.atualiza("idle", 0, 0, 1, { olharX: 0, olharY: 0, alvoX: -1, alvoY: 0, gesto: 0, instantaneo: true });
    const glb = await new GLTFExporter().parseAsync(b.raiz, { binary: true, animations: clipes });
    window.glb = Array.from(new Uint8Array(glb));
    window.resumo = clipes.map((c) => c.name + " " + c.duration + "s " + c.tracks.length + " trilhas");
  </script>` }));
  await p.goto(BASE + "/__molde.html");
  await p.waitForFunction(() => window.glb, null, { timeout: 60000 });
  const { glb, resumo } = await p.evaluate(() => ({ glb: window.glb, resumo: window.resumo }));
  const destino = path.join(RAIZ, "ferramentas/mascote/molde-srphone-assistant.glb");
  fs.writeFileSync(destino, Buffer.from(glb));
  console.log("Molde gravado: " + path.relative(RAIZ, destino) + " · " + fs.statSync(destino).size + " bytes\n  " + resumo.join("\n  "));
  /* versão comprimida (Meshopt), como o modelo oficial deve chegar */
  const comprimido = destino.replace(/\.glb$/, "-meshopt.glb");
  execFileSync(path.join(NM, ".bin/gltfpack"), ["-i", destino, "-o", comprimido, "-cc", "-kn", "-km"], { stdio: "inherit" });
  console.log("Comprimido (Meshopt): " + path.relative(RAIZ, comprimido) + " · " + fs.statSync(comprimido).size + " bytes");
} finally { await nav.close(); srv.close(); }
