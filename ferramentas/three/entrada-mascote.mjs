// Entrada do Three.js enxuto do mascote 3D do Assistente (js/mascote3d.js).
// Sai em duas partes que dividem o mesmo núcleo (nada é baixado duas vezes):
//   three-mascote-0.186.1.min.js  o que a cena e o mascote da marca usam (vem sempre)
//   three-gltf-0.186.1.min.js     leitor de GLB + AnimationMixer (só baixa se houver GLB de artista)
// A caixa 3D (js/unboxing3d.js) continua com o arquivo dela, sem mudança.
// Para gerar de novo (numa pasta fora do site, com Node.js):
//   npm i three@0.186.1 esbuild@0.25
//   NODE_PATH=./node_modules npx esbuild \
//     three-mascote-0.186.1.min=<site>/ferramentas/three/entrada-mascote.mjs \
//     three-gltf-0.186.1.min=<site>/ferramentas/three/entrada-gltf.mjs \
//     --bundle --splitting --format=esm --minify --legal-comments=eof \
//     --chunk-names=three-nucleo-[hash].min --outdir=<site>/assets/vendor/three
//   cp node_modules/three/examples/jsm/libs/meshopt_decoder.module.js <site>/assets/vendor/three/
// Ao trocar a versão, troque também os nomes dos arquivos (e os imports em js/mascote3d.js).
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial,
  MeshBasicMaterial, ExtrudeGeometry, Shape, LatheGeometry, SphereGeometry, CapsuleGeometry,
  CylinderGeometry, TorusGeometry, TubeGeometry, CatmullRomCurve3, PlaneGeometry, CircleGeometry,
  Vector2, Vector3, Box3, Color, HemisphereLight, DirectionalLight, CanvasTexture, SRGBColorSpace,
  NeutralToneMapping, PMREMGenerator
} from "three";
export { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
