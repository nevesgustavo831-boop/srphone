# SR Phone · Blender: confere e exporta o mascote oficial (srphone-assistant.glb)
# ---------------------------------------------------------------------------
# Para quem for modelar o mascote no Blender (4.2 ou mais novo). O script:
#   1. CONFERE a cena: nomes das 12 animações, material "Dourado", triângulos, ossos,
#      texturas, escala aplicada, orientação (de frente para -Y) e pés na altura zero;
#   2. EXPORTA o GLB com as configurações que o site precisa (glTF binário, +Y para cima,
#      modificadores aplicados, uma animação por ação, texturas WebP, sem câmera, sem luz,
#      sem Draco).
# Depois, comprima com Meshopt (numa pasta com Node.js):
#   npx gltfpack -i srphone-assistant.glb -o srphone-assistant.glb -cc -kn -km
# e coloque o arquivo em assets/modelos/srphone-assistant.glb. Tudo explicado em
# GUIA-MODELO-3D-SRPHONE.md.
#
# Como rodar:
#   a) dentro do Blender: aba Scripting > Open > este arquivo > Run Script
#      (exporta ao lado do .blend, com o nome srphone-assistant.glb)
#   b) pelo terminal:
#      blender mascote.blend --background --python ferramentas/mascote/blender-srphone.py -- --saida srphone-assistant.glb
#   Opções depois do "--":
#      --saida ARQUIVO.glb   onde gravar (padrão: ao lado do .blend)
#      --so-conferir         só confere, não exporta
#      --importar MOLDE.glb  começa de uma cena vazia com o molde importado (para estudar o
#                            molde ou testar este script: ferramentas/mascote/molde-srphone-assistant.glb)
import os
import sys

import bpy

OBRIGATORIAS = ["Idle", "Hover", "Wave", "Thinking", "Talking01", "Talking02", "Point", "ThumbsUp"]
OPCIONAIS = {"Welcome": "Wave", "LookAround": "Idle", "Present": "Point", "Goodbye": "Wave"}
OSSOS_SUGERIDOS = ["Raiz", "Quadril", "Corpo", "Chapeu", "Monoculo", "Bigode",
                   "OmbroD", "CotoveloD", "PulsoD", "MaoD", "OmbroE", "CotoveloE", "PulsoE", "MaoE",
                   "PernaD", "JoelhoD", "PeD", "PernaE", "JoelhoE", "PeE"]
LIMITE_TRIANGULOS = 30000
LIMITE_TEXTURA = 1024
FPS = 30


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    op = {"saida": "", "so_conferir": False, "importar": ""}
    i = 0
    while i < len(a):
        if a[i] == "--saida" and i + 1 < len(a):
            op["saida"] = a[i + 1]; i += 1
        elif a[i] == "--so-conferir":
            op["so_conferir"] = True
        elif a[i] == "--importar" and i + 1 < len(a):
            op["importar"] = a[i + 1]; i += 1
        i += 1
    return op


def importa_molde(caminho):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(caminho))
    print("Molde importado: " + caminho)


def nomes_de_animacao():
    """Nomes que o exportador vai usar: ações e trilhas NLA (o importador de glTF cria trilhas)."""
    nomes = {a.name for a in bpy.data.actions}
    for o in bpy.data.objects:
        if o.animation_data:
            for t in o.animation_data.nla_tracks:
                nomes.add(t.name)
                for s in t.strips:
                    if s.action:
                        nomes.add(s.action.name)
    return nomes


def tem_nome(nomes, alvo):
    a = alvo.lower()
    return any(n.lower() == a or n.lower().startswith(a + "_") for n in nomes)


def conferir():
    erros, avisos = [], []
    cena = bpy.context.scene
    malhas = [o for o in cena.objects if o.type == "MESH"]
    armaduras = [o for o in cena.objects if o.type == "ARMATURE"]
    if not malhas:
        erros.append("A cena não tem nenhuma malha (o personagem).")

    # animações
    nomes = nomes_de_animacao()
    faltam = [n for n in OBRIGATORIAS if not tem_nome(nomes, n)]
    if faltam:
        erros.append("Faltam as animações: " + ", ".join(faltam) + ". Os nomes precisam ser exatamente esses.")
    extras = ["%s (o site usa %s)" % (n, r) for n, r in OPCIONAIS.items() if not tem_nome(nomes, n)]
    if extras:
        avisos.append("Animações extras que ainda não existem: " + ", ".join(extras) + ".")

    # triângulos (com os modificadores aplicados, como sai no GLB)
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in malhas:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    if tris > 2 * LIMITE_TRIANGULOS:
        erros.append("%d triângulos: pesado demais para o celular. Máximo recomendado: %d." % (tris, LIMITE_TRIANGULOS))
    elif tris > LIMITE_TRIANGULOS:
        avisos.append("%d triângulos. Recomendado: até %d (ideal 10 a 20 mil)." % (tris, LIMITE_TRIANGULOS))

    # materiais: pelo menos um "Dourado" (acende no hover e no joinha)
    mats = {m.name for o in malhas for m in o.data.materials if m}
    if not any(k in m.lower() for m in mats for k in ("dourad", "gold", "cobre", "copper")):
        avisos.append("Nenhum material com 'Dourado' no nome. Renomeie o metal cobre/dourado para 'Dourado' (o site faz ele brilhar).")

    # texturas
    for img in bpy.data.images:
        if img.size[0] > LIMITE_TEXTURA or img.size[1] > LIMITE_TEXTURA:
            avisos.append("Textura %s tem %dx%d. Máximo: %dx%d (ideal 512x512)." % (img.name, img.size[0], img.size[1], LIMITE_TEXTURA, LIMITE_TEXTURA))

    # ossos
    for arm in armaduras:
        n = len(arm.data.bones)
        if n > 60:
            avisos.append("Esqueleto %s com %d ossos. Recomendado: até 40." % (arm.name, n))
        sem = [b for b in OSSOS_SUGERIDOS if b not in arm.data.bones]
        if sem and len(sem) < len(OSSOS_SUGERIDOS):
            avisos.append("Ossos com nomes diferentes do guia (não é erro, só facilita): " + ", ".join(sem[:8]) + ("..." if len(sem) > 8 else ""))

    # escala aplicada
    for o in malhas + armaduras:
        if any(abs(s - 1) > 1e-3 for s in o.scale):
            avisos.append("%s está com escala %s. Aplique (Ctrl+A > Scale) antes de exportar." % (o.name, tuple(round(s, 3) for s in o.scale)))

    # tamanho, pés no chão e frente para -Y (no glTF vira +Z, a frente que o site espera)
    if malhas:
        from mathutils import Vector
        pts = [o.matrix_world @ Vector(c) for o in malhas for c in o.bound_box]
        zmin, zmax = min(p.z for p in pts), max(p.z for p in pts)
        altura = zmax - zmin
        if altura < 0.05 or altura > 50:
            avisos.append("Altura total %.3f: estranha. O site ajusta sozinho, mas o ideal é ~1,5 (metros)." % altura)
        if abs(zmin) > 0.05 * max(altura, 1e-6):
            avisos.append("A sola dos sapatos está em Z = %.3f. Deixe os pés em Z = 0 (origem no chão, entre os pés)." % zmin)
        cam = [o for o in malhas if "camera" in o.name.lower() or "câmera" in o.name.lower()]
        if cam:
            y = sum((o.matrix_world @ Vector(c)).y for o in cam for c in o.bound_box) / (8 * len(cam))
            if y > 0.01:
                avisos.append("A câmera do celular parece estar virada para +Y. A frente do personagem deve olhar para -Y (vista Front, tecla 1 do teclado numérico).")

    if [o for o in cena.objects if o.type in ("CAMERA", "LIGHT")]:
        avisos.append("Câmeras e luzes da cena não vão para o GLB (o site tem as próprias).")

    print("\n=== Mascote SR Phone: conferência ===")
    print("Malhas: %d · Esqueletos: %d · Triângulos: %d · Animações: %d" % (len(malhas), len(armaduras), tris, len(nomes)))
    for a in avisos:
        print("AVISO: " + a)
    for e in erros:
        print("ERRO:  " + e)
    if not erros:
        print("OK: pode exportar.")
    return erros, avisos


def exportar(saida):
    cena = bpy.context.scene
    cena.render.fps = FPS
    # trilhas NLA com os nomes das animações (ex.: o molde importado) viram uma animação cada;
    # sem trilhas, cada ação vira uma animação (o jeito normal de animar um esqueleto)
    tem_trilhas = any(o.animation_data and any(tem_nome({t.name}, n) for t in o.animation_data.nla_tracks for n in OBRIGATORIAS)
                      for o in bpy.data.objects)
    op = {
        "filepath": saida,
        "export_format": "GLB",
        "export_yup": True,
        "export_apply": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_materials": "EXPORT",
        "export_image_format": "WEBP",
        "export_cameras": False,
        "export_lights": False,
        "export_extras": False,
        "export_animations": True,
        "export_animation_mode": "NLA_TRACKS" if tem_trilhas else "ACTIONS",
        "export_force_sampling": True,
        "export_optimize_animation_size": True,
        "export_skins": True,
        "export_all_influences": False,
        "export_morph": False,
        "export_draco_mesh_compression_enable": False,
    }
    # só passa as opções que esta versão do Blender conhece
    conhecidas = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    ignoradas = [k for k in op if k not in conhecidas]
    op = {k: v for k, v in op.items() if k in conhecidas}
    if ignoradas:
        print("(esta versão do Blender não tem as opções: " + ", ".join(ignoradas) + ")")
    bpy.ops.export_scene.gltf(**op)
    mb = os.path.getsize(saida) / 1048576
    print("\nGLB gravado: %s (%.2f MB)" % (saida, mb))
    if mb > 3:
        print("AVISO: acima de 3 MB. Comprima com: npx gltfpack -i %s -o %s -cc -kn -km" % (saida, saida))
    else:
        print("Próximo passo: npx gltfpack -i %s -o srphone-assistant.glb -cc -kn -km" % saida)
    print("Depois: coloque em assets/modelos/srphone-assistant.glb e rode npm run build.")


def principal():
    op = argumentos()
    if op["importar"]:
        importa_molde(op["importar"])
    erros, _ = conferir()
    if op["so_conferir"]:
        return 1 if erros else 0
    if erros:
        print("\nNão exportei: corrija os erros acima.")
        return 1
    saida = op["saida"] or os.path.join(os.path.dirname(bpy.data.filepath) or os.getcwd(), "srphone-assistant.glb")
    exportar(os.path.abspath(saida))
    return 0


if __name__ == "__main__":
    codigo = principal()
    if bpy.app.background:
        sys.exit(codigo)
