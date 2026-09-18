# Baphomet finish pass: the scythe, the studio, grouping and the saved file.
# Runs in the shared namespace after add_baphomet_details.py.
import bmesh

# ------------------------------------------------------------------ scythe
# The haft is defined from the grip outward so it always passes through the raised hand.
group = groups['04 Scythe']
GRIP = JOINT['handL']
DIR = SCYTHE_DIR
TOP = GRIP - DIR*1.10          # where the blade is socketed
BUTT = GRIP + DIR*2.40
tube('Scythe | charred haft', [TOP, GRIP, BUTT], [.072, .080, .062], haft, 14)
for t, w in [(-.92, .055), (.16, .062), (.52, .060), (2.24, .056)]:
    P = GRIP + DIR*t
    ridge('Scythe | leather binding %.2f' % t, P, DIR, .086, w*.42, bind)
ell('Scythe | iron butt cap', BUTT, (.085, .085, .085), steel_dark, 12, 8)
ridge('Scythe | blade socket', TOP + DIR*.10, DIR, .105, .042, steel_dark)
tube('Scythe | socket collar', [TOP + DIR*.22, TOP - DIR*.14], [.098, .088], steel_dark, 14)

# Crescent blade, hooked forward over the top of the haft.
BLADE_Y = .24
outline = [(-2.30, 5.26), (-2.26, 5.70), (-1.82, 6.02), (-1.24, 6.06),
           (-1.04, 5.94), (-1.44, 5.82), (-1.92, 5.60), (-2.14, 5.26)]
plate('Scythe | crescent blade', outline, BLADE_Y - .03, .07, steel, .055, steel_dark)
line('Scythe | honed inner edge',
     [(-1.04, BLADE_Y - .035, 5.94), (-1.44, BLADE_Y - .035, 5.82), (-1.92, BLADE_Y - .035, 5.60), (-2.14, BLADE_Y - .035, 5.26)],
     .022, steel_lit)
line('Scythe | blackened spine',
     [(-2.30, BLADE_Y + .045, 5.26), (-2.26, BLADE_Y + .045, 5.70), (-1.82, BLADE_Y + .045, 6.02), (-1.24, BLADE_Y + .045, 6.06)],
     .030, steel_dark)
for j, (x, z) in enumerate([(-2.08, 5.52), (-1.80, 5.70), (-1.50, 5.82)]):
    leaf('Scythe | forge scar %d' % j, (x, BLADE_Y - .05, z), (x + .10, BLADE_Y - .055, z + .04), (x + .22, BLADE_Y - .05, z + .06), .018, .010, ember)

# ------------------------------------------------------------------ normals
for o in scene.objects:
    if o.type == 'MESH':
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data); bm.free()

# ------------------------------------------------------------------ studio
group = groups['05 Studio']
plinth = mat('Studio | obsidian plinth', '241C26', .35, .45)
ground = mat('Studio | ember lit ash', '1A141C', .05, .78)
crystal = glow('Studio | amethyst shard', '5A3390', 1.1, .2)
crystal_lit = glow('Studio | amethyst core', '9E6FD8', 2.2, .14)
mote = glow('Studio | drifting ember', 'FF6A18', 16.0, .4)
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=2.05, depth=.13, location=(0, 0, -.02))
move(bpy.context.object, 'Display | obsidian base', plinth)
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=2.06, depth=.022, location=(0, 0, -.062))
move(bpy.context.object, 'Display | ember rim', mote)
box('Studio | ground', (0, 0, -.11), (200, 200, .05), ground, 0)
# Crystal shards from the reference, ringing the plinth.
random.seed(9)
for j in range(12):
    a = 2*pi*j/12 + .5
    if -1.9 < a - pi < -0.6:      # leave the camera-side arc open
        continue
    r = 1.50 + .45*random.random()
    h = .30 + .58*random.random()
    x, y = r*cos(a), r*sin(a)*.85
    tilt = Vector((.14*(random.random()-.5), .14*(random.random()-.5), 0))
    tube('Crystal | shard %d' % j, [(x, y, -.02), (x+tilt.x*.4, y+tilt.y*.4, h*.55), (x+tilt.x, y+tilt.y, h)],
         [.072+.04*random.random(), .042, .003], crystal if j % 3 else crystal_lit, 6, 1, False)
for j in range(22):
    a = 2*pi*random.random(); r = .7 + 2.1*random.random()
    ell('Ember | drifting mote %d' % j, (r*cos(a), r*sin(a)*.8, .35 + 3.9*random.random()),
        (.022 + .022*random.random(),)*3, mote, 8, 6)

d = bpy.data.cameras.new('Baphomet portrait'); d.type = 'ORTHO'; d.ortho_scale = 7.3
cam = bpy.data.objects.new('Camera | baphomet portrait', d); group.objects.link(cam)
cam.location = (4.6, -12.5, 5.4)
target = Vector((-.25, 0, 3.15))
cam.rotation_euler = (target - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam


def light(name, p, energy, size, color):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); group.objects.link(o); o.location = p
    o.rotation_euler = (Vector((0, 0, 3.1)) - Vector(p)).to_track_quat('-Z', 'Y').to_euler()


light('Key | warm softbox', (-4.5, -6.0, 8.0), 720, 6, (1, .86, .72))
light('Fill | cold violet bounce', (5.5, -3.5, 5.0), 380, 5.5, (.62, .60, 1))
light('Rim | ember backlight', (-2.6, 5.0, 6.6), 900, 4, (1, .46, .20))
light('Kicker | horn highlight', (5.0, 2.5, 6.4), 420, 3, (1, .74, .52))
light('Front | eye light', (-.6, -7.0, 4.3), 60, 2.5, (1, .93, .86))
world = bpy.data.worlds.new('Baphomet studio world'); world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (.040, .026, .058, 1); bg.inputs[1].default_value = .42
scene.world = world

engines = scene.render.bl_rna.properties['engine'].enum_items.keys()
for cand in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    if cand in engines:
        scene.render.engine = cand
        break
if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'use_bloom'):
    scene.eevee.use_bloom = True
scene.render.resolution_x = 1250; scene.render.resolution_y = 1600; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(OUT, 'baphomet_preview.png')
scene.render.film_transparent = False

# ------------------------------------------------------------------ grouping + save
asset = bpy.data.objects.new('BAPHOMET | model root', None); scene.collection.objects.link(asset)
for name, c in groups.items():
    if name == '05 Studio':
        continue
    root = bpy.data.objects.new(name[3:] + ' | edit group', None); c.objects.link(root); root.parent = asset
    for o in list(c.objects):
        if o != root:
            o.parent = root

ref = os.path.join(OUT, 'reference_baphomet.jpg')
if os.path.exists(ref):
    im = bpy.data.images.load(ref, check_existing=True)
    im.name = 'REFERENCE | supplied Baphomet'
    im.pack()
    # Without a fake user the image has zero users and Blender drops it on save, which is
    # why ro_knight.blend does not actually carry the reference it claims to.
    im.use_fake_user = True
scene['About'] = ('Stylized Baphomet dungeon boss from the supplied illustration. Spiralling ram horns, '
                  'bleached mane ruff, sun-baked hide with molten fissures, cloven hooves and a crescent scythe.')
scene['Model'] = ('Static posed mesh character. Separate body, fur and mane, head and horns, and scythe '
                  'collections with parent handles. Not rigged.')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces.active
            sp.overlay.show_overlays = False; sp.shading.type = 'MATERIAL'
            sp.region_3d.view_perspective = 'CAMERA'; sp.region_3d.view_camera_zoom = 8
for o in scene.objects:
    o.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'baphomet.blend'))
print('BAPHOMET SAVED', bpy.data.filepath, len(scene.objects), 'objects')
