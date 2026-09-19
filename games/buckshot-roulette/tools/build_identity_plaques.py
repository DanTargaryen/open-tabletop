"""按 identity-plaques-v1 参考图重建两块金属身份铭牌。

Blender 是 Z 向上；导出 GLB 时转成 three.js 的 Y 向上。
原点在底面中心，坐下就能贴桌。两块铭牌外形尺寸完全一致，
只靠骷髅浮雕轮廓区分。节点名稳定，供回合灯光和后续碎裂动画使用。
不要改 build_item_models.py 里已经完成的枪和道具。
"""
from __future__ import annotations

import json
import math
import os
import struct
import sys

import bpy
import bmesh
from mathutils import Vector

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'web', 'models'))
os.makedirs(OUT, exist_ok=True)

# 两块铭牌共用外形。宽:深 ≈ 2.8:1。
W, D = .46, .164
CORNER = .026
H_BASE = .013
H_FRAME = .023
FRAME_W = .015
CHANNEL_W = .0056
SKULL_Z0 = .0132
SKULL_Z1 = .036

NODES = (
    'DestructionRoot', 'PlaqueBase', 'BrassFrame', 'LightChannel',
    'Rivet_TL', 'Rivet_TR', 'Rivet_BL', 'Rivet_BR', 'SkullRelief',
)


def pbr(name, color, metallic=0.0, roughness=.5, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    r, g, b = color
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission[0], 1)
        bsdf.inputs['Emission Strength'].default_value = emission[1]
    return mat


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def shade_flat(obj):
    if obj.type != 'MESH':
        return
    for poly in obj.data.polygons:
        poly.use_smooth = False


def apply_mods(obj):
    select_only(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def bevel(obj, width=.0022, segments=1):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(38)
    apply_mods(obj)
    shade_flat(obj)
    return obj


def recalc(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def from_pydata(name, verts, faces, mat, loc=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    recalc(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    shade_flat(obj)
    return obj


def cube(name, size, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    shade_flat(obj)
    return obj


def cyl(name, r1, r2, depth, loc, mat, segs=10, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs,
        radius1=r1, radius2=r2, depth=depth,
    )
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    shade_flat(obj)
    return obj


def sphere(name, radius, loc, mat, segs=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs - 2), radius=radius)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    shade_flat(obj)
    return obj


def empty(name, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = .04
    obj.empty_display_type = 'PLAIN_AXES'
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj


def parent(child, parent_obj):
    bpy.context.view_layer.update()
    child.parent = parent_obj
    child.matrix_parent_inverse = parent_obj.matrix_world.inverted()


def join_meshes(name, meshes):
    meshes = [m for m in meshes if m is not None]
    select_only(meshes[0])
    for obj in meshes[1:]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    meshes[0].name = name
    meshes[0].data.name = name
    shade_flat(meshes[0])
    return meshes[0]


def boolean_cut(obj, cutter):
    select_only(obj)
    mod = obj.modifiers.new('Cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    try:
        mod.solver = 'EXACT'
    except TypeError:
        pass
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    shade_flat(obj)
    return obj


def chamfer_pts(width, depth, cut):
    hw, hd = width / 2, depth / 2
    c = min(cut, hw - .004, hd - .004)
    return [
        (hw - c, -hd), (hw, -hd + c), (hw, hd - c), (hw - c, hd),
        (-hw + c, hd), (-hw, hd - c), (-hw, -hd + c), (-hw + c, -hd),
    ]


def prism(name, loop, z0, z1, mat):
    bottom = [(x, y, z0) for x, y in loop]
    top = [(x, y, z1) for x, y in loop]
    n = len(loop)
    faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, j + n, i + n])
    return from_pydata(name, bottom + top, faces, mat)


def ring_prism(name, outer, inner, z0, z1, mat):
    n = len(outer)
    verts = (
        [(x, y, z0) for x, y in outer]
        + [(x, y, z0) for x, y in inner]
        + [(x, y, z1) for x, y in outer]
        + [(x, y, z1) for x, y in inner]
    )
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, 2 * n + j, 2 * n + i])
        faces.append([n + j, n + i, 3 * n + i, 3 * n + j])
        faces.append([2 * n + i, 2 * n + j, 3 * n + j, 3 * n + i])
        faces.append([j, i, n + i, n + j])
    return from_pydata(name, verts, faces, mat)


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.materials):
        for item in list(block):
            block.remove(item)


def ground_and_center():
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    deps = bpy.context.evaluated_depsgraph_get()
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for corner in obj.evaluated_get(deps).bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, world.x), min(mins.y, world.y), min(mins.z, world.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, world.x), max(maxs.y, world.y), max(maxs.z, world.z)
    shift = Vector((-(mins.x + maxs.x) / 2, -(mins.y + maxs.y) / 2, -mins.z))
    for obj in bpy.data.objects:
        if obj.parent is None:
            obj.location += shift


def export(name):
    ground_and_center()
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    return path


def verify(path):
    data = open(path, 'rb').read()
    json_len = struct.unpack_from('<I', data, 12)[0]
    payload = json.loads(data[20:20 + json_len].decode('utf-8'))
    mats = payload.get('materials', [])
    nodes = [n.get('name') for n in payload.get('nodes', [])]
    missing = [name for name in NODES if name not in nodes]
    colors = []
    for mat in mats:
        pbr_data = mat.get('pbrMetallicRoughness', {})
        colors.append((
            mat.get('name'),
            [round(c, 3) for c in pbr_data.get('baseColorFactor', [1, 1, 1, 1])[:3]],
            pbr_data.get('metallicFactor', 1),
            pbr_data.get('roughnessFactor', 1),
            mat.get('emissiveFactor'),
        ))
    grey = all(c[1] == [.8, .8, .8] for c in colors) if colors else True
    print(f'  {os.path.basename(path)}  meshes={len(payload.get("meshes", []))}  mats={len(mats)}  nodes={len(nodes)}  grey={grey}')
    print(f'    nodes={nodes}')
    for row in colors:
        print(f'    {row[0]}  rgb={row[1]}  m={row[2]}  r={row[3]}  e={row[4]}')
    if missing:
        raise SystemExit(f'{path} 缺少节点 {missing}')
    if grey:
        raise SystemExit(f'{path} 材质仍是默认灰，导出失败')
    needed = {'Gunmetal', 'AgedBrass', 'DarkSteel', 'SkullMetal', 'AmberLight'}
    have = {c[0] for c in colors}
    if not needed.issubset(have):
        raise SystemExit(f'{path} 材质不全，现有 {have}')


def skull_a_loop():
    """宽额、方颌、六颗方牙。"""
    return [
        (-.034, .050), (-.022, .058), (.022, .058), (.034, .050),
        (.040, .032), (.042, .010), (.038, -.008), (.032, -.018),
        (.026, -.018), (.026, -.040), (.018, -.040), (.018, -.018),
        (.016, -.018), (.016, -.040), (.008, -.040), (.008, -.018),
        (.006, -.018), (.006, -.040), (-.002, -.040), (-.002, -.018),
        (-.004, -.018), (-.004, -.040), (-.012, -.040), (-.012, -.018),
        (-.014, -.018), (-.014, -.040), (-.022, -.040), (-.022, -.018),
        (-.024, -.018), (-.024, -.040), (-.032, -.040), (-.032, -.018),
        (-.038, -.008), (-.042, .010), (-.040, .032),
    ]


def skull_b_loop():
    """窄额、内收眉骨、不含牙齿的颅骨外轮廓。"""
    return [
        (-.015, .058), (.015, .058),
        (.020, .046), (.026, .028), (.028, .008),
        (.022, -.008), (.014, -.020),
        (-.014, -.020), (-.022, -.008),
        (-.028, .008), (-.026, .028), (-.020, .046),
    ]


def prism_with_holes(name, outer, holes, z0, z1, mat):
    """二维外轮廓加孔洞，再沿 Z 挤成有厚度的实体。"""
    bm = bmesh.new()

    def ring(pts, z):
        verts = [bm.verts.new((float(x), float(y), float(z))) for x, y in pts]
        for i, vert in enumerate(verts):
            bm.edges.new((vert, verts[(i + 1) % len(verts)]))
        return verts

    ring(outer, z0)
    for hole in holes:
        ring(hole, z0)
    bm.edges.ensure_lookup_table()
    bmesh.ops.triangle_fill(bm, use_beauty=True, edges=list(bm.edges))
    bottom = list(bm.faces)
    if not bottom:
        bm.free()
        return prism(name, outer, z0, z1, mat)
    extruded = bmesh.ops.extrude_face_region(bm, geom=bottom)
    top_verts = [item for item in extruded['geom'] if isinstance(item, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top_verts, vec=(0, 0, z1 - z0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    recalc(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    shade_flat(obj)
    return obj


def rect(cx, cy, w, h, slant=0.0, clockwise=True):
    hw, hh = w / 2, h / 2
    pts = [
        (cx - hw, cy - hh + slant),
        (cx + hw, cy - hh - slant),
        (cx + hw, cy + hh - slant),
        (cx - hw, cy + hh + slant),
    ]
    return list(reversed(pts)) if clockwise else pts


def make_skull(kind, skull_mat, gunmetal):
    if kind == 'a':
        holes = [
            rect(-.015, .024, .018, .014),
            rect(.015, .024, .018, .014),
            [(0, .010), (.007, -.008), (-.007, -.008)],
        ]
        skull = prism_with_holes('SkullRelief', skull_a_loop(), holes, SKULL_Z0, SKULL_Z1, skull_mat)
        extras = [
            skull,
            cube('Brow', (.076, .013, .0065), (0, .038, SKULL_Z1 + .001), skull_mat),
        ]
    else:
        holes = [
            rect(-.013, .027, .011, .020, slant=.007),
            rect(.013, .027, .011, .020, slant=-.007),
            [(0, .014), (.0042, -.016), (-.0042, -.016)],
        ]
        skull = prism_with_holes('SkullRelief', skull_b_loop(), holes, SKULL_Z0, SKULL_Z1, skull_mat)
        z_mid = (SKULL_Z0 + SKULL_Z1) / 2
        extras = [
            skull,
            cube('ToothR1', (.0052, .024, SKULL_Z1 - SKULL_Z0 - .002), (.009, -.034, z_mid), skull_mat),
            cube('ToothR2', (.0046, .034, SKULL_Z1 - SKULL_Z0 - .002), (.0024, -.039, z_mid), skull_mat),
            cube('ToothL2', (.0046, .034, SKULL_Z1 - SKULL_Z0 - .002), (-.0024, -.039, z_mid), skull_mat),
            cube('ToothL1', (.0052, .024, SKULL_Z1 - SKULL_Z0 - .002), (-.009, -.034, z_mid), skull_mat),
            cube('Crack', (.0018, .042, .012), (-.010, .048, SKULL_Z1 - .004), gunmetal, rot=(0, 0, .68)),
        ]
    skull = join_meshes('SkullRelief', extras)
    bevel(skull, .0014)
    skull.name = 'SkullRelief'
    skull.data.name = 'SkullRelief'
    return skull


def make_rivet(name, x, y, steel):
    shaft = cyl(name + 'Shaft', .0052, .0052, .007, (x, y, H_BASE + .002), steel, segs=10)
    head = sphere(name, .0074, (x, y, H_BASE + .007), steel, segs=10)
    rivet = join_meshes(name, [head, shaft])
    bevel(rivet, .001)
    rivet.name = name
    rivet.data.name = name
    return rivet


def build_plaque(kind):
    gunmetal = pbr('Gunmetal', (.12, .125, .13), metallic=.74, roughness=.56)
    brass = pbr('AgedBrass', (.70, .48, .20), metallic=.92, roughness=.40)
    steel = pbr('DarkSteel', (.17, .175, .18), metallic=.86, roughness=.36)
    skull_mat = pbr('SkullMetal', (.46, .47, .48), metallic=.84, roughness=.34)
    amber = pbr('AmberLight', (.32, .16, .05), metallic=.08, roughness=.48, emission=((.95, .48, .10), .16))

    root = empty('DestructionRoot')
    base = prism('PlaqueBase', chamfer_pts(W, D, CORNER), 0, H_BASE, gunmetal)
    bevel(base, .0024)

    inner_cut = max(.01, CORNER - FRAME_W * .35)
    frame = ring_prism(
        'BrassFrame',
        chamfer_pts(W + .001, D + .001, CORNER + .0005),
        chamfer_pts(W - 2 * FRAME_W, D - 2 * FRAME_W, inner_cut),
        .002, H_FRAME, brass,
    )
    bevel(frame, .002)

    ch_outer = chamfer_pts(W - 2 * FRAME_W + .0008, D - 2 * FRAME_W + .0008, inner_cut)
    ch_inner = chamfer_pts(
        W - 2 * (FRAME_W + CHANNEL_W),
        D - 2 * (FRAME_W + CHANNEL_W),
        max(.008, inner_cut - CHANNEL_W * .4),
    )
    channel = ring_prism('LightChannel', ch_outer, ch_inner, H_BASE - .001, H_BASE + .0036, amber)

    panel = W / 2 - FRAME_W - CHANNEL_W - .012
    pane_d = D / 2 - FRAME_W - CHANNEL_W - .012
    rivets = [
        make_rivet('Rivet_TL', -panel, pane_d, steel),
        make_rivet('Rivet_TR', panel, pane_d, steel),
        make_rivet('Rivet_BL', -panel, -pane_d, steel),
        make_rivet('Rivet_BR', panel, -pane_d, steel),
    ]
    skull = make_skull(kind, skull_mat, gunmetal)
    for obj in (base, frame, channel, skull, *rivets):
        parent(obj, root)
    return root


def script_args():
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1:]
    skip = {'-b', '--background', '--python', '-P', '--python-exit-code'}
    out = []
    i = 1
    while i < len(sys.argv):
        token = sys.argv[i]
        if token in skip:
            i += 2 if token in {'--python', '-P'} else 1
            continue
        if token.endswith('.py'):
            i += 1
            continue
        out.append(token)
        i += 1
    return out


def main():
    wanted = set(script_args())
    jobs = [('identity-plaque-a', 'a'), ('identity-plaque-b', 'b')]
    if wanted:
        jobs = [job for job in jobs if job[0] in wanted or job[1] in wanted]
    if not jobs:
        jobs = [('identity-plaque-a', 'a'), ('identity-plaque-b', 'b')]
    for name, kind in jobs:
        print('build', name, flush=True)
        reset()
        build_plaque(kind)
        path = export(name)
        verify(path)


if __name__ == '__main__':
    main()
