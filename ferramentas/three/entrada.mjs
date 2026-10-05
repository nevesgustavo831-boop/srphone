// Entrada do Three.js enxuto usado pelo unboxing 3D (js/unboxing3d.js).
// Só o que a cena usa entra no arquivo final, o resto do Three.js fica de fora.
// Para gerar de novo (numa pasta fora do site, com Node.js):
//   npm i three@0.186.1 esbuild@0.25
//   npx esbuild ferramentas/three/entrada.mjs --bundle --format=esm --minify --legal-comments=eof \
//     --outfile=assets/vendor/three/three-sr-0.186.1.min.js
// Ao trocar a versão, troque também o nome do arquivo (e o import em js/unboxing3d.js).
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, MeshStandardMaterial, MeshBasicMaterial,
  ShadowMaterial, ExtrudeGeometry, ShapeGeometry, PlaneGeometry, CircleGeometry, BufferGeometry,
  Float32BufferAttribute, Shape, HemisphereLight, DirectionalLight, SpotLight, Color, Vector2, Vector3,
  Raycaster, CanvasTexture, SRGBColorSpace, NeutralToneMapping, PCFShadowMap, DoubleSide, PMREMGenerator
} from "three";
export { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
