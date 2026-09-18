# Execute in the shared knight build namespace.
import bmesh
for o in scene.objects:
    if o.type=='MESH':
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
group=groups['06 Studio']
plinth=mat('Studio | obsidian plinth','252C38',.35,.42)
ground=mat('Studio | deep blue grey','202C3A',.05,.7)
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1.22,depth=.095,location=(.08,0,-.013))
move(bpy.context.object,'Display | obsidian base',plinth)
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1.228,depth=.017,location=(.08,0,-.043))
move(bpy.context.object,'Display | fine gold rim',gold_dark)
box('Studio | ground',(0,0,-.086),(200,200,.04),ground,0)
d=bpy.data.cameras.new('Knight portrait');d.type='ORTHO';d.ortho_scale=4.47
cam=bpy.data.objects.new('Camera | knight portrait',d);group.objects.link(cam)
cam.location=(4,-11,4.3)
target=Vector((.05,0,1.86));cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler();scene.camera=cam
def light(name,p,energy,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);group.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,0,1.9))-Vector(p)).to_track_quat('-Z','Y').to_euler()
light('Key | large warm softbox',(-3.5,-4.5,6.5),650,4,(1,.87,.76))
light('Fill | cool silver reflections',(4,-2.5,4.8),500,3.8,(.72,.82,1))
light('Rim | warm cape glow',(-2,3,5.5),800,3,(1,.72,.54))
light('Front | eye light',(0,-5,3),110,2.5,(1,.96,.92))
world=bpy.data.worlds.new('Knight studio world');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.25,.30,.4,1);bg.inputs[1].default_value=.5;scene.world=world
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1250;scene.render.resolution_y=1600;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=os.path.join(OUT,'ro_knight_preview.png')
scene.render.film_transparent=False
asset=bpy.data.objects.new('RO KNIGHT | model root',None);scene.collection.objects.link(asset)
for name,c in groups.items():
    if name=='06 Studio':continue
    root=bpy.data.objects.new(name[3:]+' | edit group',None);c.objects.link(root);root.parent=asset
    for o in list(c.objects):
        if o!=root:o.parent=root
ref='/var/folders/q2/n87b8ppd3n1bmpvq1z4lb9wh0000gn/T/codex-clipboard-2c11d043-6253-465b-b1f8-7a95f83db33c.png'
im=bpy.data.images.load(ref,check_existing=True);im.name='REFERENCE | supplied RO Knight';im.pack()
scene['About']='Stylized RO Knight based on supplied illustration. Silver and gold plate armor, crimson cape, dark surcoat, spiky brown hair, amber eyes and crescent-guard sword.'
scene['Model']='Static posed mesh character. Separate body, armor, hair and face, cloth and cape, sword collections. Not rigged.'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            sp=area.spaces.active;sp.overlay.show_overlays=False;sp.shading.type='MATERIAL'
            sp.region_3d.view_perspective='CAMERA';sp.region_3d.view_camera_zoom=8
for o in scene.objects:o.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'ro_knight.blend'))
print('SAVED NEW KNIGHT FILE',bpy.data.filepath,len(scene.objects),'objects')
