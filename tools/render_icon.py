"""Render a character GLB as a square app icon.

    tools/render_icon.sh assets/heroes/knight.glb /tmp/icon.png [--pad 1.0]

The game has no artwork outside the models - every texture is drawn procedurally at runtime -
so the launcher icon has to come from the same place everything else does. Renders on a
transparent film; the ground and vignette are composited afterwards by the .sh wrapper, which
also cuts the maskable variant with more padding so the subject survives a circular mask.
"""

import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb, out = argv[0], argv[1]
pad = float(argv[argv.index("--pad") + 1]) if "--pad" in argv else 1.0
size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
top = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)

sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.studio_light = "Default"
sc.display.shading.show_shadows = False
sc.display.shading.show_cavity = True          # a little contact definition at icon size
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"

# Bust framing: head and shoulders read at 192px where a full figure turns to soup.
aim_z = top * 0.735
cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = top * 0.44 * pad
cam = bpy.data.objects.new("cam", cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
ang = math.radians(22)                          # slight three-quarter turn, not flat-on
cam.location = Vector((math.sin(ang) * 8, -math.cos(ang) * 8, aim_z))
cam.rotation_euler = (Vector((0, 0, aim_z)) - cam.location).to_track_quat("-Z", "Y").to_euler()

sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print(f"ICON| {glb} -> {out}  ({size}px, pad {pad}, aim z={aim_z:.2f})")
