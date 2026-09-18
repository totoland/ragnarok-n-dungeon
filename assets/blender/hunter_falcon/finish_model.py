# Executed in build_model.py's namespace after add_details.py.
group=groups['05 Falcon']
for o in list(group.objects):
    if ' primary ' in o.name or ' primary tip ' in o.name or ' feather shaft ' in o.name:
        bpy.data.objects.remove(o,do_unlink=True)
for label,ps,sign in wing_specs:
    a,b,c=[Vector(p) for p in ps]
    for j in range(10):
        t=j/9;root=b.lerp(c,t)
        if sign==1:
            tip=Vector((1.46+.20*t,-.005,2.13+.74*t))
            mid=root.lerp(tip,.53)+Vector((.04,-.028,.018))
        else:
            tip=Vector((.48-.035*t,.09,2.23+.65*t))
            mid=root.lerp(tip,.50)+Vector((-.03,-.028,.023))
        leaf('Falcon | '+label+' primary %02d'%j,root,mid,tip,.048,.012,feather_light if j%3==1 else feather)
        split=root.lerp(tip,.75)
        leaf('Falcon | '+label+' primary tip %02d'%j,split,split.lerp(tip,.6)+Vector((0,-.008,0)),tip,.030,.009,feather_dark)
        line('Falcon | '+label+' feather shaft '+str(j),[root+Vector((0,-.017,0)),mid+Vector((0,-.017,0)),tip],.0025,feather_light)

group=groups['04 Bow & Quiver']
for o in list(group.objects):
    if o.name in ['Bow | curved walnut limbs','Bow | honey inlay']:
        bpy.data.objects.remove(o,do_unlink=True)
def catmull(points,steps=6):
    pp=[Vector(points[0])]+[Vector(p) for p in points]+[Vector(points[-1])];out=[]
    for i in range(1,len(pp)-2):
        a,b,c,d=pp[i-1:i+3]
        for j in range(steps):
            t=j/steps
            out.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    return out+[Vector(points[-1])]
sm=catmull(bowpts)
rs=[.016+.025*(sin(pi*i/(len(sm)-1)))**.7 for i in range(len(sm))]
tube('Bow | curved walnut limbs',sm,rs,leather,12,.7)
line('Bow | honey inlay',[v+Vector((-.012,-.024,0)) for v in sm],.007,tan)

# Clear transform handles for the figure, equipment, and falcon.
asset=bpy.data.objects.new('HUNTER & FALCON | model root',None)
scene.collection.objects.link(asset)
asset['Model type']='Static posed character; individual modeled parts, no animation rig.'
for name,c in groups.items():
    if name=='06 Studio':continue
    root=bpy.data.objects.new(name[3:]+' | edit group',None);c.objects.link(root);root.parent=asset
    for o in list(c.objects):
        if o!=root:o.parent=root

# Put the scene into a clean, material-colored camera view on opening.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            sp=area.spaces.active
            sp.overlay.show_overlays=False
            sp.region_3d.view_perspective='CAMERA'
            sp.region_3d.view_camera_zoom=8
            sp.shading.type='MATERIAL'

scene.render.filepath=os.path.join(OUT,'hunter_falcon_preview.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'hunter_falcon.blend'))
print('FINAL MODEL',len([o for o in scene.objects if o.type=='MESH']),'meshes',sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),'polygons')
