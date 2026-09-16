"""按 _ref/docs/item-model-references-v1 的参考图重建 8 个道具 + 霰弹枪。

Blender 是 Z 向上；导出 GLB 时转成 three.js 的 Y 向上。
每个模型原点在底面中心，坐下就能贴桌。材质走 Principled BSDF，
否则 glTF 只会写出默认灰塑料。"""
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

# --- 材质：必须写进 Principled 节点，diffuse_color 不会进 GLB ---
def pbr(name, color, metallic=0.0, roughness=.5, transmission=0.0, alpha=1.0, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    r, g, b = color
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Transmission Weight'].default_value = transmission
    bsdf.inputs['Alpha'].default_value = alpha
    bsdf.inputs['IOR'].default_value = 1.45 if transmission else 1.5
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission[0], 1)
        bsdf.inputs['Emission Strength'].default_value = emission[1]
    if alpha < 1:
        try:
            mat.blend_method = 'BLEND'
        except TypeError:
            pass
        if hasattr(mat, 'surface_render_method'):
            try:
                mat.surface_render_method = 'BLENDED'
            except TypeError:
                pass
    return mat


BRASS = pbr('Brass', (.78, .52, .18), metallic=.92, roughness=.28)
STEEL = pbr('Steel', (.55, .56, .58), metallic=.88, roughness=.32)
GUNMETAL = pbr('Gunmetal', (.12, .12, .13), metallic=.7, roughness=.5)
DARK_STEEL = pbr('DarkSteel', (.16, .16, .17), metallic=.8, roughness=.42)
WOOD = pbr('Wood', (.32, .17, .09), metallic=.02, roughness=.64)
WALNUT = pbr('Walnut', (.28, .14, .06), metallic=.04, roughness=.72)
GLASS = pbr('Glass', (.42, .58, .68), metallic=0, roughness=.08, transmission=.95, alpha=.32)
CREAM = pbr('Cream', (.86, .81, .73), roughness=.62)
RED = pbr('Red', (.72, .16, .14), roughness=.52)
FILTER = pbr('Filter', (.84, .60, .30), roughness=.58)
PAPER = pbr('Paper', (.93, .90, .82), roughness=.7)
BEER = pbr('BeerGreen', (.36, .46, .20), metallic=.35, roughness=.38)
BAND = pbr('BeerBand', (.88, .84, .70), roughness=.55)
SILVER = pbr('Silver', (.74, .75, .76), metallic=.9, roughness=.3)
SAW_RED = pbr('SawRed', (.70, .10, .10), roughness=.48)
NAVY = pbr('Navy', (.18, .28, .40), roughness=.46)
YELLOW = pbr('Yellow', (.95, .78, .12), roughness=.4)
ORANGE = pbr('Orange', (.95, .52, .08), roughness=.35, emission=((.95, .45, .05), 1.4))
PLASTIC = pbr('Plastic', (.62, .64, .66), roughness=.42)
LIQUID = pbr('Liquid', (.05, .70, .52), roughness=.12, transmission=.55, alpha=.72)
AMBER = pbr('Amber', (.55, .28, .12), roughness=.55)
LABEL = pbr('Label', (.90, .86, .76), roughness=.64)
PILL = pbr('Pill', (.93, .91, .86), roughness=.5)
PHONE = pbr('Phone', (.11, .11, .12), roughness=.48)
SCREEN = pbr('Screen', (.42, .52, .38), roughness=.22, emission=((.35, .48, .32), .35))
BUTT = pbr('ButtPad', (.07, .07, .07), roughness=.7)
INTERIOR = pbr('Interior', (.22, .20, .18), roughness=.8)


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def shade_flat(obj):
    if obj.type != 'MESH':
        return
    for poly in obj.data.polygons:
        poly.use_smooth = False


def bevel(obj, width=.006, segments=1):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(40)
    return obj


def cube(name, size, loc, mat, rot=(0, 0, 0), edge=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    if edge:
        bevel(obj, edge)
    shade_flat(obj)
    return obj


def cyl(name, r1, r2, depth, loc, mat, segs=12, rot=(0, 0, 0), edge=0.0):
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
    if edge:
        bevel(obj, edge)
    shade_flat(obj)
    return obj


def torus(name, major, minor, loc, mat, segs=12, minor_segs=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor,
        major_segments=segs, minor_segments=minor_segs,
        location=loc, rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    shade_flat(obj)
    return obj


def sphere(name, radius, loc, mat, segs=10, rot=(0, 0, 0), scale=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs - 2), radius=radius)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    if scale:
        obj.scale = scale
        select_only(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    shade_flat(obj)
    return obj


def empty(name, loc):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = .02
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj


def from_pydata(name, verts, faces, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    shade_flat(obj)
    return obj


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            block.remove(item)
    keep = {m.name for m in (
        BRASS, STEEL, GUNMETAL, DARK_STEEL, WOOD, WALNUT, GLASS, CREAM, RED, FILTER, PAPER,
        BEER, BAND, SILVER, SAW_RED, NAVY, YELLOW, ORANGE, PLASTIC, LIQUID, AMBER, LABEL,
        PILL, PHONE, SCREEN, BUTT, INTERIOR,
    )}
    for item in list(bpy.data.materials):
        if item.name not in keep:
            bpy.data.materials.remove(item)


def ground_and_center():
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not meshes:
        return
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
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    json_len, json_type = struct.unpack_from('<I4s', data, 12)
    payload = json.loads(data[20:20 + json_len].decode('utf-8'))
    mats = payload.get('materials', [])
    colors = []
    for mat in mats:
        pbr = mat.get('pbrMetallicRoughness', {})
        colors.append((
            mat.get('name'),
            [round(c, 3) for c in pbr.get('baseColorFactor', [1, 1, 1, 1])[:3]],
            pbr.get('metallicFactor', 1),
            pbr.get('roughnessFactor', 1),
        ))
    grey = all(c[1] == [.8, .8, .8] for c in colors) if colors else True
    print(f'  {os.path.basename(path)}  meshes={len(payload.get("meshes", []))}  mats={len(mats)}  grey={grey}')
    for row in colors:
        print(f'    {row[0]}  rgb={row[1]}  m={row[2]}  r={row[3]}')
    if grey:
        raise SystemExit(f'{path} 材质仍是默认灰，导出失败')


# --- 9 个道具 + 枪 ---
def magnifier():
    torus('Frame', .078, .013, (0, 0, .026), BRASS, segs=16, minor_segs=8)
    cyl('Lens', .068, .068, .007, (0, 0, .026), GLASS, segs=16)
    cyl('Ferrule', .014, .015, .02, (.078, 0, .026), BRASS, segs=8, rot=(0, math.pi / 2, 0))
    cyl('Handle', .014, .024, .14, (.16, 0, .026), WOOD, segs=8, rot=(0, math.pi / 2, 0))
    sphere('Pommel', .026, (.238, 0, .026), BRASS, segs=8)


def cigarette():
    cube('Pack', (.09, .038, .15), (0, 0, .075), CREAM, edge=.003)
    cube('Cavity', (.074, .028, .10), (0, 0, .09), INTERIOR)
    cube('Band', (.092, .040, .042), (0, 0, .068), RED)
    # 盒盖从后沿掀开，薄片而不是一块砖。
    cube('Lid', (.09, .038, .012), (0, -.028, .168), CREAM, rot=(1.15, 0, 0), edge=.002)
    cube('LidBand', (.091, .039, .01), (0, -.022, .155), RED, rot=(1.15, 0, 0))
    cyl('Stick', .0075, .0075, .1, (.01, 0, .16), PAPER, segs=8, rot=(.4, .12, 0))
    cyl('Tip', .008, .008, .026, (.018, .006, .205), FILTER, segs=8, rot=(.4, .12, 0))


def beer():
    cyl('BodyLow', .048, .05, .05, (0, 0, .038), BEER, segs=12)
    cyl('Stripe', .051, .051, .036, (0, 0, .078), BAND, segs=12)
    cyl('BodyHigh', .05, .047, .05, (0, 0, .118), BEER, segs=12)
    cyl('Base', .046, .048, .016, (0, 0, .01), SILVER, segs=12)
    cyl('Lid', .046, .044, .01, (0, 0, .148), SILVER, segs=12)
    cube('Tab', (.02, .01, .002), (.012, 0, .154), SILVER, edge=.001)
    torus('Ring', .007, .002, (.008, .014, .156), SILVER, segs=8, minor_segs=6)


def attach(child, parent_obj):
    bpy.context.view_layer.update()
    child.parent = parent_obj
    child.matrix_parent_inverse = parent_obj.matrix_world.inverted()


def cuffs():
    # 铐环靠近，锁扣朝内，链子从锁扣里穿出来，不能漂在两圈中间。
    torus('RingL', .05, .012, (-.078, 0, .024), STEEL, segs=12, minor_segs=8)
    torus('RingR', .05, .012, (.078, 0, .024), STEEL, segs=12, minor_segs=8)
    cube('LockL', (.032, .028, .028), (-.038, .042, .028), STEEL, edge=.003)
    cube('LockR', (.032, .028, .028), (.038, .042, .028), STEEL, edge=.003)
    cube('HingeL', (.018, .014, .018), (-.078, -.05, .024), STEEL, edge=.002)
    cube('HingeR', (.018, .014, .018), (.078, -.05, .024), STEEL, edge=.002)
    cube('Bar', (.05, .01, .01), (0, .046, .03), STEEL)
    for i, x in enumerate((-.018, 0, .018)):
        torus(f'Link{i}', .015, .0055, (x, .05, .04), STEEL, segs=8, minor_segs=6,
              rot=(math.pi / 2, 0, (i % 2) * math.pi / 2))


def saw():
    # 锯片左端伸进 D 形手柄，近侧红框压在刀身上，不能和手柄脱开。
    length, h0, h1, thick, teeth, depth = .24, .074, .04, .016, 8, .016
    outline = [(0, h0)]
    for i in range(teeth):
        outline.append((length * (i + .5) / teeth, -depth))
        outline.append((length * (i + 1) / teeth, 0))
    outline.append((length, h1))
    front = [(x, thick / 2, z) for x, z in outline]
    back = [(x, -thick / 2, z) for x, z in outline]
    verts = front + back
    k = len(outline)
    faces = [list(range(k)), list(range(2 * k - 1, k - 1, -1))]
    for i in range(k):
        j = (i + 1) % k
        faces.append([i, j, j + k, i + k])
    from_pydata('Blade', verts, faces, STEEL, loc=(-.11, 0, .034))
    cube('Tang', (.05, .016, .055), (-.1, 0, .05), STEEL)
    cube('GripTop', (.1, .034, .022), (-.145, 0, .086), SAW_RED, edge=.004)
    cube('GripBot', (.1, .034, .022), (-.145, 0, .014), SAW_RED, edge=.004)
    cube('GripFar', (.024, .034, .094), (-.184, 0, .05), SAW_RED, edge=.004)
    cube('GripNear', (.036, .034, .094), (-.1, 0, .05), SAW_RED, edge=.004)


def adrenaline():
    rot = (0, math.pi / 2, 0)
    cyl('Barrel', .022, .022, .12, (.02, 0, .026), PLASTIC, segs=10, rot=rot)
    cyl('Dose', .017, .017, .09, (.03, 0, .026), LIQUID, segs=10, rot=rot)
    cube('Flange', (.008, .05, .036), (-.042, 0, .026), PLASTIC, edge=.003)
    cyl('Rod', .008, .008, .07, (-.08, 0, .026), PLASTIC, segs=8, rot=rot)
    cyl('Thumb', .022, .022, .01, (-.12, 0, .026), PLASTIC, segs=8, rot=rot)
    cyl('Collar', .016, .016, .02, (.086, 0, .026), DARK_STEEL, segs=8, rot=rot)
    cyl('Hub', .012, .01, .016, (.108, 0, .026), DARK_STEEL, segs=8, rot=rot)
    cyl('Needle', .0035, .0015, .055, (.145, 0, .026), STEEL, segs=6, rot=rot)


def expired_medicine():
    cyl('Bottle', .052, .048, .11, (0, 0, .07), AMBER, segs=12)
    cyl('Shoulder', .048, .03, .028, (0, 0, .138), AMBER, segs=12)
    cyl('Neck', .03, .028, .026, (0, 0, .164), AMBER, segs=12)
    cyl('Hole', .02, .02, .028, (0, 0, .168), INTERIOR, segs=10)
    cyl('LabelBand', .054, .054, .048, (0, 0, .075), LABEL, segs=12)
    # 正反两面都画 X，无论槽位怎么转都能看见。
    for y, name in ((.055, 'XF'), (-.055, 'XB')):
        cube(f'{name}1', (.008, .004, .042), (0, y, .075), RED, rot=(0, .7, 0))
        cube(f'{name}2', (.008, .004, .042), (0, y, .075), RED, rot=(0, -.7, 0))
    cyl('Cap', .032, .032, .022, (.095, .01, .018), CREAM, segs=12, rot=(1.15, .2, 0))
    cyl('CapTop', .03, .028, .006, (.102, .016, .028), CREAM, segs=12, rot=(1.15, .2, 0))
    sphere('PillA', .02, (-.05, -.07, .01), PILL, segs=8, scale=(1.15, .72, .4))
    sphere('PillB', .02, (-.01, -.09, .01), PILL, segs=8, scale=(1.15, .72, .4))
    cube('ScoreA', (.036, .002, .002), (-.05, -.07, .018), LABEL)
    cube('ScoreB', (.036, .002, .002), (-.01, -.09, .018), LABEL)


def burner_phone():
    cube('Body', (.092, .16, .024), (0, 0, .014), PHONE, edge=.008)
    cube('Bezel', (.072, .05, .004), (0, .042, .027), DARK_STEEL)
    cube('Glass', (.064, .042, .003), (0, .042, .030), SCREEN)
    for row in range(4):
        for col in range(3):
            cube(f'Key{row}{col}', (.02, .016, .006),
                 ((col - 1) * .026, -.01 - row * .022, .028), PHONE, edge=.002)


def shotgun():
    # 枪口朝 +X。泵动前托单独挂在 Pump 节点上，开火时沿弹仓管后拉再推回。
    stock = [
        (-.56, -.01), (-.56, .125), (-.34, .105), (-.12, .085),
        (-.12, .02), (-.26, .005), (-.42, -.012),
    ]
    thick = .06
    front = [(x, thick / 2, z) for x, z in stock]
    back = [(x, -thick / 2, z) for x, z in stock]
    k = len(stock)
    faces = [list(range(k)), list(range(2 * k - 1, k - 1, -1))]
    for i in range(k):
        j = (i + 1) % k
        faces.append([i, j, j + k, i + k])
    from_pydata('Stock', front + back, faces, WALNUT, loc=(0, 0, .02))
    cube('Pad', (.022, .074, .13), (-.57, 0, .055), BUTT, rot=(0, .1, 0), edge=.003)
    cube('Receiver', (.26, .07, .08), (-.02, 0, .06), GUNMETAL, edge=.005)
    cube('Eject', (.06, .007, .028), (.04, .038, .068), DARK_STEEL)
    cyl('Barrel', .015, .0135, .62, (.38, 0, .078), GUNMETAL, segs=10, rot=(0, math.pi / 2, 0))
    cyl('Bore', .0075, .0075, .03, (.68, 0, .078), INTERIOR, segs=8, rot=(0, math.pi / 2, 0))
    cyl('Tube', .01, .01, .48, (.32, 0, .032), DARK_STEEL, segs=8, rot=(0, math.pi / 2, 0))
    pump = empty('Pump', (.26, 0, .032))
    wood = cyl('PumpWood', .024, .024, .24, (.26, 0, .032), WALNUT, segs=10, rot=(0, math.pi / 2, 0))
    attach(wood, pump)
    for i, x in enumerate((.18, .26, .34)):
        groove = cyl(f'Groove{i}', .0255, .0255, .014, (x, 0, .032), WOOD, segs=10, rot=(0, math.pi / 2, 0))
        attach(groove, pump)
    torus('Guard', .032, .005, (-.09, 0, .014), GUNMETAL, segs=10, minor_segs=6,
          rot=(math.pi / 2, 0, 0))
    cube('Trigger', (.012, .008, .018), (-.09, 0, .024), DARK_STEEL)
    cube('Sight', (.012, .01, .01), (.64, 0, .096), GUNMETAL)
    empty('grip', (-.2, 0, .03))
    empty('muzzle', (.69, 0, .078))
    empty('chamber', (.04, 0, .09))


MODELS = [
    ('magnifier', magnifier),
    ('cigarette', cigarette),
    ('beer', beer),
    ('cuffs', cuffs),
    ('saw', saw),
    ('adrenaline', adrenaline),
    ('expiredMedicine', expired_medicine),
    ('burnerPhone', burner_phone),
    ('shotgun', shotgun),
]


def main():
    wanted = set(sys.argv[1:]) if len(sys.argv) > 1 else {name for name, _ in MODELS}
    for name, fn in MODELS:
        if name not in wanted:
            continue
        print('build', name)
        reset()
        fn()
        path = export(name)
        verify(path)


if __name__ == '__main__':
    main()
