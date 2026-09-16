"""把 web/models 里的 GLB 逐个渲染成预览图，用来和 docs 里的参考图比对。

跑法：py -3.11 tools/render_model_previews.py [模型名...]
输出到 tools/_previews/，不进版本库内容目录。
相机机位照抄参考图的提示词：三点四分之一视角、仰角 25 度、深灰无缝背景。
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', 'web', 'models')
OUT = os.path.join(HERE, '_previews')
NAMES = ['magnifier', 'cigarette', 'beer', 'cuffs', 'saw',
         'adrenaline', 'expiredMedicine', 'burnerPhone', 'shotgun']


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def bounds():
    low = Vector((math.inf,) * 3)
    high = Vector((-math.inf,) * 3)
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            low = Vector(map(min, low, world))
            high = Vector(map(max, high, world))
    return low, high


def setup(low, high):
    centre = (low + high) / 2
    radius = max((high - low).length / 2, .05)

    world = bpy.context.scene.world or bpy.data.worlds.new('World')
    bpy.context.scene.world = world
    world.use_nodes = True
    # 环境光不能太暗，否则金属件没有可反射的东西，会渲成一团黑。
    world.node_tree.nodes['Background'].inputs[0].default_value = (.16, .17, .19, 1)

    bpy.ops.mesh.primitive_plane_add(size=radius * 40, location=(centre.x, centre.y, low.z - .001))
    backdrop = bpy.context.object
    material = bpy.data.materials.new('Backdrop')
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (.035, .035, .038, 1)
    bsdf.inputs['Roughness'].default_value = .85
    backdrop.data.materials.append(material)

    # 暖色主光 + 冷色边缘光，和参考图的打光一致。
    for name, offset, energy, color, size in (
        ('key', (2.4, -2.8, 3.0), 1.0, (1, .95, .88), 2.2),
        ('fill', (-3.0, -1.4, 1.4), .22, (.86, .9, 1), 3.0),
        ('rim', (-1.4, 3.0, 2.2), .40, (.78, .86, 1), 1.8),
    ):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy * 260 * radius ** 2
        light.color = color
        light.size = size * radius
        obj = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(obj)
        obj.location = centre + Vector(offset) * radius
        direction = centre - obj.location
        obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    camera_data = bpy.data.cameras.new('Camera')
    camera_data.lens = 85
    camera = bpy.data.objects.new('Camera', camera_data)
    bpy.context.collection.objects.link(camera)
    elevation = math.radians(float(os.environ.get('PREVIEW_ELEVATION', '25')))
    azimuth = math.radians(float(os.environ.get('PREVIEW_AZIMUTH', '-52')))
    distance = radius * 6.4
    camera.location = centre + Vector((math.cos(elevation) * math.sin(azimuth),
                                       -math.cos(elevation) * math.cos(azimuth),
                                       math.sin(elevation))) * distance
    camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = camera


def render(name):
    clear()
    path = os.path.join(MODELS, name + '.glb')
    bpy.ops.import_scene.gltf(filepath=path)
    low, high = bounds()
    setup(low, high)

    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    # 默认的 AgX 会把颜色洗淡，比对参考图时必须看原色。
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.film_transparent = False
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print(f'[render] {name}')


def main():
    os.makedirs(OUT, exist_ok=True)
    extra = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for name in (extra or NAMES):
        render(name)


if __name__ == '__main__':
    main()
