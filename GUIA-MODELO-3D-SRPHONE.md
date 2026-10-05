# Guia do modelo 3D oficial do mascote SR Phone

Este guia é para quem vai **modelar e animar** o mascote oficial (um artista 3D) e para quem vai **colocar o arquivo no site**.

## 0. Situação hoje (leia primeiro)

- **O modelo 3D oficial ainda não existe.** Ele precisa ser feito por um artista 3D no Blender (ou em outro programa que exporte glTF). Neste ambiente não dá para produzir um personagem profissional final, então nada aqui finge que ele existe.
- **O site já está pronto para ele.** Quando o arquivo `assets/modelos/srphone-assistant.glb` existir, o site passa a mostrar o modelo oficial e as animações dele sozinho. Não precisa mexer em código nem em configuração.
- **Sem GLB** (o normal hoje), aparece o **mascote 3D da marca**, a versão final do site,, montado no próprio código (`js/mascote3d.js`): o celular preto de moldura cobre, com chapéu, monóculo, bigode, braços, mãos, pernas e sapatos, com as 12 animações. Ele serve também de referência de proporção e de movimento para o artista.
- **O molde** `ferramentas/mascote/molde-srphone-assistant.glb` é esse mascote da marca exportado em GLB, com as 12 animações já nos nomes certos. Abra no Blender para ver tamanhos, nomes e tempos. **Ele não é o modelo oficial.**

## 1. O personagem

Um cavalheiro de tecnologia: elegante, premium, simpático, **nunca infantil**.

| Parte | Como é |
|---|---|
| Corpo | um smartphone preto brilhante (a traseira do aparelho é a "frente" do personagem), cantos arredondados, moldura metálica cobre/dourada |
| Câmera | bloco de câmera tripla no alto, do lado esquerdo de quem olha, com aros cobre e lentes escuras |
| Chapéu | fedora de feltro preto ou marrom bem escuro, faixa cobre, aba levemente levantada nas pontas, inclinado para a direita de quem olha |
| Monóculo | aro cobre com vidro escuro, do lado direito de quem olha, com uma correntinha fina pendurada |
| Bigode | cobre, grande, com as pontas enroladas para cima, no meio do corpo |
| Braços e mãos | braços finos de bronze, articulados (ombro, cotovelo, punho), mãos em forma de luva cobre, com indicador e polegar que se mexem (para apontar e fazer joinha) |
| Pernas | finas de bronze, com joelho cobre (como os braços) |
| Sapatos | sociais, de verniz preto, com sola cobre e um detalhe cobre em cima |

Referência de estilo: a arte do mascote no topo do site e o mascote 3D da marca que o site já mostra.

### Proporções

Medidas em relação à **altura do corpo (o celular) = 1,00**:

| Medida | Valor |
|---|---|
| Corpo: altura × largura × espessura | 1,00 × 0,56 × 0,085 |
| Raio dos cantos do corpo | 0,10 |
| Moldura cobre (largura da borda) | ~0,022 |
| Bloco da câmera | 0,205 × 0,205, centro a 0,135 do meio para a esquerda e 0,35 acima do centro |
| Monóculo | aro com ~0,16 de diâmetro, centro a 0,155 para a direita e 0,105 acima do centro |
| Bigode | ~0,40 de largura, centro a 0,09 abaixo do centro |
| Chapéu | copa de ~0,25 de altura, aba de ~0,72 de diâmetro, inclinado ~11° para a direita |
| Braço | ombro no alto da lateral; braço 0,19 + antebraço 0,16 + mão ~0,10 |
| Perna | coxa 0,145 + canela 0,135, saindo de baixo do corpo, afastadas 0,23 entre si |
| Sapato | ~0,21 de comprimento, ~0,11 de largura, ~0,06 de altura |
| **Altura total** (sola ao topo do chapéu) | **~1,5** |

## 2. Materiais

Materiais PBR comuns (Principled BSDF no Blender, que vira "metallic-roughness" no glTF). **Use esses nomes**: o site procura "Dourado" para fazer o metal brilhar quando a pessoa passa o mouse e no joinha.

| Material (nome) | Cor base | Metálico | Rugosidade | Observação |
|---|---|---|---|---|
| **CorpoPreto** | #060607 | 0 | 0,25 a 0,35 | brilhante, mas sem virar espelho |
| **Dourado** | #D8874A | 1 | ~0,30 | moldura, bigode, monóculo, faixa do chapéu, mãos, joelhos, sola. **O nome precisa ter "Dourado"** (ou Gold, Cobre, Copper) |
| **BracoBronze** | #8C5028 | 0,9 | ~0,38 | braços e pernas |
| **Camera** | #E7D6BB | 0,55 | ~0,38 | bloco da câmera (champanhe) |
| **Lente** | #06070A | 0 | ~0,08 | vidro das lentes |
| **VidroMonoculo** | #241A13 | 0 | ~0,05 | o único transparente (Alpha Blend, opacidade ~0,8) |
| **ChapeuFeltro** | #1D1511 | 0 | ~0,80 | copa e aba |
| **SapatoVerniz** | #0D0A09 | 0 | ~0,16 | sapatos |

- Não precisa de textura: cores e valores já dão o visual. Se usar textura, veja o item 6.
- Evite materiais de dois lados (double-sided) e transparência além do monóculo: pesam no celular.

## 3. Esqueleto (rig) e ossos

Um esqueleto (Armature) com **até ~40 ossos**. As peças podem ser rígidas (cada malha 100% presa a um osso), que é o mais leve e combina com o estilo. Braços e pernas podem ter pesos suaves, se preferir.

`D` = lado **direito de quem olha** de frente (o lado do monóculo). `E` = lado esquerdo de quem olha (o lado da câmera).

```
Raiz                      (no chão, entre os pés; normalmente parado)
└── Quadril               (embaixo do corpo; sobe e desce na respiração e no pulinho)
    ├── Corpo             (gira no quadril: inclina, vira, faz reverência)
    │   ├── Chapeu
    │   ├── Monoculo  └── Corrente (opcional)
    │   ├── Bigode
    │   ├── OmbroD └── CotoveloD └── PulsoD └── MaoD ├── DedosD ├── IndicadorD └── PolegarD
    │   └── OmbroE └── CotoveloE └── PulsoE └── MaoE ├── DedosE ├── IndicadorE └── PolegarE
    ├── PernaD └── JoelhoD └── PeD
    └── PernaE └── JoelhoE └── PeE
```

- Os nomes não são obrigatórios para o site funcionar, mas deixam tudo mais fácil de conferir (o script do Blender avisa quando são diferentes).
- Até 4 ossos por vértice (o padrão do glTF). Sem "shape keys" (morph targets): não são usadas.

## 4. Animações

**Os nomes precisam ser exatamente estes** (maiúscula ou minúscula tanto faz). Cada animação é uma **Action** separada no Blender. 30 quadros por segundo.

| Animação | Estado no site | Tipo | Duração | O que o mascote faz |
|---|---|---|---|---|
| **Idle** | parado | repete | 6 a 10 s | respira dobrando os joelhos de leve, braços balançam, bigode mexe de vez em quando. Pés parados |
| **Hover** | ponteiro em cima | repete | 3 a 5 s | inclina para a pessoa, levanta a mão direita e acena devagar |
| **Wave** | cumprimento (dica "Posso ajudar?") | uma vez | ~2,6 s | acena com a mão direita; a esquerda levanta um pouco o chapéu |
| **Welcome** | primeira vez que abre o chat | uma vez | ~3,2 s | mão direita no peito, reverência de cavalheiro com um pé para trás, mão esquerda se abre ("fique à vontade") |
| **LookAround** | de vez em quando, parado | uma vez | ~3,6 s | mão na testa, olha para um lado e para o outro, sem sair do lugar |
| **Thinking** | preparando a resposta | repete | 3 a 5 s | mão no monóculo, corpo inclinado, bate a ponta do sapato |
| **Talking01** | falando (resposta aparecendo) | repete | 2 a 4 s | uma mão aberta, palma para cima, vai e volta |
| **Talking02** | falando (o site alterna com a 01) | repete | 2 a 4 s | as duas mãos se abrem de leve |
| **Point** | aponta para algo da página | uma vez | ~2,4 s | aponta com o braço esticado para a **esquerda da tela** e um pouco para cima |
| **Present** | mostra produtos ou opções | uma vez | ~2,6 s | abre os dois braços, palmas para cima, virado para a **esquerda da tela** |
| **ThumbsUp** | deu certo (WhatsApp, horário) | uma vez | ~1,9 s | joinha com a mão direita e um pulinho (os pés saem do chão) |
| **Goodbye** | fechou o chat | uma vez | ~2,2 s | mão na aba do chapéu (continência de cavalheiro) e um aceno curto |

Regras:

- **As 8 primeiras da lista oficial são obrigatórias**: Idle, Hover, Wave, Thinking, Talking01, Talking02, Point, ThumbsUp. **Welcome, LookAround, Present e Goodbye são desejáveis**: se faltarem, o site usa a parecida (Welcome e Goodbye usam Wave, Present usa Point, LookAround usa Idle).
- As que **repetem** precisam começar e terminar na mesma pose (laço sem emenda).
- As de **uma vez** começam e terminam perto da pose do Idle: o site faz a transição suave (0,4 s) entre elas.
- **Não mova a Raiz** para longe (sem "root motion"): o personagem fica no lugar. Só o pulinho do ThumbsUp tira os pés do chão.
- **Point e Present** vão para a esquerda da tela porque o mascote fica no canto direito e o chat abre à esquerda dele. O site vira o personagem de leve na direção do ponteiro e do chat, mas **não espelha** a animação.
- Os nomes podem mudar em `data/config.js` > `ASSISTENTE.animacoes`, se o artista preferir outros.
- A boca não precisa mexer. Bigode e monóculo podem ter movimentos bem discretos.

## 5. Escala, orientação e origem

- **Unidade**: metro. Altura total de **~1,5** (a escala exata não importa: o site ajusta o tamanho sozinho).
- **Para cima**: +Z no Blender (vira +Y no glTF, que é o que o site espera).
- **Frente**: o personagem olha para **-Y no Blender** (na vista Front, tecla 1 do teclado numérico, você vê o bigode e o monóculo). No glTF isso vira +Z, a frente que o site espera.
- **Origem**: no chão (Z = 0), entre os pés. O site coloca a sola dos sapatos em cima da sombra.
- **Aplique as transformações** (Ctrl+A > All Transforms) antes de exportar: escala 1, rotação 0.

## 6. Tamanho e desempenho

| Item | Limite | Ideal |
|---|---|---|
| Triângulos (personagem inteiro) | até 30 mil | 10 a 20 mil |
| Ossos | até ~40 | 25 a 35 |
| Materiais | até ~10 | os 8 da tabela |
| Texturas (se houver) | até 1024 × 1024, no máximo 4 | 512 × 512, em WebP |
| **Arquivo GLB final** (depois de comprimir) | **até 5 MB** (o build avisa acima de 3 MB e recusa acima de 8 MB) | **até 1,5 MB** |

Texturas, se usar: cor base (sRGB), ORM (oclusão, rugosidade e metálico juntos) e normal. Tudo **embutido** no GLB, em **WebP**.

## 7. Exportação (Blender)

### Jeito fácil: o script

`ferramentas/mascote/blender-srphone.py` confere a cena e exporta com as configurações certas.

- **Dentro do Blender**: aba *Scripting* > *Open* > escolha o arquivo > *Run Script*. O GLB sai ao lado do `.blend`, com o nome `srphone-assistant.glb`. O resultado da conferência aparece no console (*Window > Toggle System Console* no Windows).
- **Pelo terminal**:
  ```
  blender mascote.blend --background --python ferramentas/mascote/blender-srphone.py -- --saida srphone-assistant.glb
  ```
  Só conferir, sem exportar: troque `--saida ...` por `--so-conferir`. Estudar o molde: `--importar ferramentas/mascote/molde-srphone-assistant.glb`.

O script confere: as 12 animações (8 obrigatórias), o material "Dourado", o total de triângulos, o tamanho das texturas, o número de ossos, a escala aplicada, os pés em Z = 0 e a frente para -Y. Se faltar algo obrigatório, ele não exporta e diz o que corrigir.

> Testado com o Blender 4.5: importou o molde, conferiu, exportou as 12 animações, e o arquivo (comprimido com o gltfpack) abriu no site com todas elas.

### Jeito manual

*File > Export > glTF 2.0*:

- **Format**: glTF Binary (.glb)
- **Include**: desmarque *Cameras* e *Punctual Lights*
- **Transform**: *+Y Up* marcado
- **Data > Mesh**: *Apply Modifiers*, *UVs* e *Normals* marcados; *Tangents* e *Vertex Colors* desmarcados
- **Data > Material**: *Export*; **Images**: *WebP*
- **Data > Shape Keys**: desmarcado
- **Data > Skinning**: marcado; *Include All Bone Influences* desmarcado
- **Data > Compression**: **desmarcado** (é o Draco, que o site não aceita)
- **Animation**: marcado; *Mode*: **Actions**; *Always Sample Animations* e *Optimize Animation Size* marcados

## 8. Compressão (obrigatória antes de ir para o site)

Numa pasta com Node.js:

```
npx gltfpack -i srphone-assistant.glb -o srphone-assistant.glb -cc -kn -km
```

- `-cc` comprime com **Meshopt**, que o site abre;
- `-kn` mantém os nomes das peças e dos ossos;
- `-km` mantém os nomes dos materiais (o "Dourado" precisa continuar existindo).

**Não use Draco** (a opção *Compression* do Blender) **nem KTX2/Basis** (`gltfpack -tc` ou `-tu`): eles precisam de "workers" que a política de segurança do site bloqueia. O build recusa e explica o motivo.

## 9. Requisitos técnicos (Three.js)

O site usa o Three.js 0.186 (GLTFLoader + AnimationMixer). O arquivo precisa ser:

- **glTF 2.0 binário** (`.glb`), com uma cena só e **tudo embutido** (malhas, materiais, texturas, animações). Nada de `.bin` ou imagem separada;
- extensões aceitas: `EXT_meshopt_compression`, `KHR_mesh_quantization`, `KHR_texture_transform`, `EXT_texture_webp`, `KHR_materials_*` (use o mínimo possível);
- extensões **recusadas**: `KHR_draco_mesh_compression` e `KHR_texture_basisu`;
- animações com os nomes da tabela do item 4; o site toca uma por vez, com transição de 0,4 s;
- sem câmeras e sem luzes (o site tem luz, reflexo e sombra próprios);
- até 4 ossos por vértice.

O leitor de GLB (+14 KB) e o decodificador Meshopt (+8 KB) só são baixados quando o arquivo existe.

## 10. Como colocar no site

1. Copie o arquivo para `assets/modelos/srphone-assistant.glb` (o nome e a pasta precisam ser exatamente esses).
2. Rode `npm run build`. Ele confere o formato, o tamanho, as extensões, as texturas e as animações, e avisa o que faltar.
3. Rode `npm run mascote:imagem`. Ele refaz a imagem parada do mascote (`assets/assistente/mascote-estatico.webp`), que aparece antes do 3D carregar e nos aparelhos sem 3D.
4. Rode `npm start` e abra http://localhost:8080 para conferir: passe o mouse, abra o chat, pergunte algo.
5. Publique como sempre.

### Como o site sabe que o arquivo existe

- Com o arquivo no lugar, o Netlify entrega o GLB, e o site mostra o modelo oficial.
- Sem o arquivo, o `netlify.toml` entrega no lugar dele um aviso pequeno (`assets/modelos/sem-modelo.json`), **sem erro 404 no console**, e o site mostra o mascote 3D da marca. O `npm start` faz igual.
- Em outra hospedagem (sem essa regra), o site recebe um 404 e também mostra o mascote 3D da marca.
- Para desligar o GLB de vez: `modelo3d: ""` em `data/config.js`.

## 11. Lista de entrega para o artista

- [ ] Arquivo `.glb` (e o `.blend` de origem, para ajustes futuros)
- [ ] Personagem com corpo de celular, moldura cobre, câmera, chapéu com faixa, monóculo, bigode, braços, mãos, pernas e sapatos
- [ ] Materiais com os nomes do item 2 ("Dourado" no metal cobre)
- [ ] Esqueleto com os ossos do item 3
- [ ] As 8 animações obrigatórias (e, se possível, as 4 extras), com os nomes exatos do item 4
- [ ] Laços sem emenda (Idle, Hover, Thinking, Talking01, Talking02)
- [ ] Altura ~1,5, pés em Z = 0, frente para -Y, transformações aplicadas
- [ ] Até 30 mil triângulos; texturas até 1024 (ideal 512) em WebP
- [ ] Sem câmera, sem luz, sem Draco
- [ ] O script `blender-srphone.py` roda sem ERRO
- [ ] Comprimido com `gltfpack -cc -kn -km`, com até 3 MB
