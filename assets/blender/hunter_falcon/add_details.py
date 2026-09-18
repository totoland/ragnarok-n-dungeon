# Executed in build_model.py's namespace.
group=groups['04 Bow & Quiver']
# Recurved bow, shaped in the frontal plane with carved contrasting laminations.
bowpts=[(-.69,-.18,1.96),(-.79,-.19,1.89),(-.86,-.20,1.75),(-.83,-.21,1.57),(-.68,-.22,1.33),(-.72,-.22,1.13),(-.81,-.21,.92),(-.81,-.20,.78),(-.71,-.19,.67)]
tube('Bow | curved walnut limbs',bowpts,[.016,.024,.03,.036,.042,.035,.029,.023,.014],leather,10,.7)
line('Bow | honey inlay',[(x-.012,y-.024,z) for x,y,z in bowpts],.008,tan)
line('Bow | taut flax string',[bowpts[0],(-.58,-.21,1.32),bowpts[-1]],.0035,stitch)
tube('Bow | wrapped grip',[(-.682,-.22,1.39),(-.681,-.22,1.26)],[.046,.044],edge,12,.85)
for j in range(7):
    z=1.27+j*.018
    line('Bow grip wrap '+str(j),[(-.72,-.239,z),(-.65,-.246,z+.01)],.005,tan)
# Small arrow held parallel to the forearm.
line('Arrow | shaft',[(-.95,-.27,1.35),(-.19,-.27,1.35)],.008,tan)
mesh('Arrow | forged head',[(-1.05,-.27,1.35),(-.94,-.27,1.382),(-.96,-.29,1.35),(-.94,-.27,1.318)],[(0,1,2),(0,2,3),(0,3,1),(1,3,2)],gold)
for off in [-1,1]:
    mesh('Arrow | fletching '+str(off),[(-.23,-.27,1.35),(-.32,-.27,1.35),(-.33,-.27+off*.042,1.38),(-.22,-.27+off*.042,1.38)],[(0,1,2,3)],ivory)
# Back quiver tilts over the shoulder; arrows remain editable.
qa=Vector((-.16,.18,1.07));qb=Vector((.15,.24,1.69))
tube('Quiver | leather case',[qa,qa.lerp(qb,.15),qb],[.084,.099,.095],leather,14)
for t in [.12,.84,.98]:
    tube('Quiver | rim',[qa.lerp(qb,t-.024),qa.lerp(qb,t+.024)],[.103,.103],tan,14)
for j in range(5):
    a=qb+Vector((-.055+(j%3)*.052,(j//3)*.055-.025,0))
    b=a+Vector((.11,.017,.245+(j%3)*.04))
    line('Quiver arrow shaft '+str(j),[a,b],.0075,tan)
    for s in [-1,1]:
        leaf('Quiver arrow feather '+str(j)+str(s),b-Vector((.035,0,.09)),b+Vector((s*.04,0,-.025)),b+Vector((s*.03,0,.02)),.025,.005,ivory)

group=groups['05 Falcon']
# Falcon is supported by the glove, with its wings in a high landing pose.
ell('Falcon | breast',(.84,-.055,1.82),(.15,.145,.23),feather_light,20,14)
body=ell('Falcon | back',(.89,.025,1.86),(.145,.145,.25),feather)
body.rotation_euler.y=.20
ell('Falcon | head',(.785,-.11,2.055),(.125,.12,.133),feather_light,24,16)
ell('Falcon | crown',(.794,-.089,2.111),(.115,.104,.081),feather)
# Hooked beak oriented forward-left, dark cheek bars and vivid eyes.
leaf('Falcon | cheek stripe',(.755,-.217,2.084),(.762,-.225,2.015),(.79,-.207,1.965),.023,.010,feather_dark)
ell('Falcon | eye',(.758,-.223,2.070),(.024,.010,.025),eye,16,10)
ell('Falcon | eye catchlight',(.752,-.233,2.078),(.007,.003,.008),white,10,6)
ell('Falcon | cere',(.699,-.195,2.042),(.053,.039,.033),gold,16,10)
leaf('Falcon | hooked beak',(.707,-.213,2.05),(.64,-.246,2.037),(.653,-.245,1.994),.026,.025,edge)
# Tail fans downward behind the glove.
for j in range(7):
    a=(.88+(j-3)*.013,.082,1.77)
    b=(.95+(j-3)*.031,.15,1.57)
    c=(1.00+(j-3)*.043,.19,1.39+abs(j-3)*.017)
    leaf('Falcon | tail %02d'%j,a,b,c,.039,.012,feather_dark if j%2==0 else feather)
    line('Tail rachis '+str(j),[a,b,c],.003,feather_light)
for x in [.784,.88]:
    tube('Falcon | scaled leg',[(x,-.075,1.67),(x-.022,-.10,1.548)],[.02,.016],gold,10)
    for j in range(3):
        a=(x-.022,-.10,1.55);b=(x-.05+j*.027,-.15,1.51);c=(x-.056+j*.027,-.18,1.48)
        line('Falcon | gripping toe',[a,b,c],.009,gold)
        line('Falcon | black talon',[c,(c[0],c[1]-.012,c[2]-.017)],.005,edge)
# Wing armatures are a swept V; long primaries overlap like real flight feathers.
wing_specs=[
    ('near',[(.93,-.012,1.97),(1.16,.005,2.22),(1.40,.05,2.47)],1),
    ('far',[(.78,.075,1.98),(.70,.14,2.29),(.64,.16,2.50)],-1)]
for label,ps,sign in wing_specs:
    a,b,c=[Vector(p) for p in ps]
    tube('Falcon | '+label+' wing leading edge',[a,b,c],[.09,.084,.041],feather,12,.7)
    # Primaries point up and out, giving the silhouette a distinct fingered edge.
    for j in range(9):
        t=j/8
        root=b.lerp(c,t)
        if sign==1:
            tip=Vector((1.26+.29*t,-.006,2.28+.57*t))
            mid=root.lerp(tip,.53)+Vector((.04,-.03,.06))
        else:
            tip=Vector((.50+.06*t,.11,2.32+.57*t))
            mid=root.lerp(tip,.5)+Vector((-.038,-.028,.045))
        leaf('Falcon | '+label+' primary %02d'%j,root,mid,tip,.040,.013,feather_light if j%3==1 else feather)
        # Dark distal panels and pale central shafts articulate every feather.
        split=root.lerp(tip,.66)
        leaf('Falcon | '+label+' primary tip %02d'%j,split,split.lerp(tip,.6)+Vector((0,-.009,0)),tip,.029,.009,feather_dark)
        line('Falcon | '+label+' feather shaft '+str(j),[root+Vector((0,-.017,0)),mid+Vector((0,-.017,0)),tip],.0028,feather_light)
    for j in range(7):
        t=j/6;root=a.lerp(b,t)
        tip=root+Vector((.13 if sign==1 else -.11,-.017,-.15+.035*t))
        leaf('Falcon | '+label+' secondary '+str(j),root,root.lerp(tip,.5)+Vector((0,-.04,0)),tip,.045,.017,feather_dark if j%3==0 else feather)
    for row in range(2):
        for j in range(7):
            t=j/7;root=a.lerp(c,t)+Vector((0,-.051-row*.012,-row*.048))
            tip=root+Vector((.068 if sign==1 else -.05,-.008,-.09))
            leaf('Falcon | '+label+' covert '+str(row)+' '+str(j),root,root.lerp(tip,.5),tip,.036,.012,feather_light if (j+row)%3==0 else feather)
# Subtle breast markings.
for row in range(3):
    for j in range(3):
        x=.79+j*.044;z=1.76+row*.063;y=-.188+(abs(j-1)*.012)
        leaf('Falcon | breast fleck', (x,y,z+.023),(x+.009,y-.007,z),(x,y,z-.015),.01,.005,feather)

group=groups['06 Studio']
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1.02,depth=.095,location=(.1,0,.006))
move(bpy.context.object,'Display | round plinth',stone)
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1.026,depth=.018,location=(.1,0,-.025))
move(bpy.context.object,'Display | fine brass rim',rim)
box('Studio | seamless ground',(0,0,-.092),(200,200,.04),floor_mat,0)
cam_data=bpy.data.cameras.new('Portrait camera');cam_data.type='ORTHO';cam_data.ortho_scale=3.56
cam=bpy.data.objects.new('Camera | three quarter',cam_data);group.objects.link(cam)
cam.location=(4.1,-9.5,4.1)
target=Vector((.23,0,1.43));cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler()
scene.camera=cam
def light(name,p,energy,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape=d.bl_rna.properties['shape'].enum_items[0].identifier;d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);group.objects.link(o);o.location=p;o.rotation_euler=(Vector((.2,0,1.3))-Vector(p)).to_track_quat('-Z','Y').to_euler()
light('Key | warm softbox',(-3,-4,6),480,4,(1,.85,.72))
light('Fill | cool softbox',(4,-2,3.4),340,3,(.76,.86,1))
light('Rim | feather highlights',(1.5,3,5),620,3,(1,.85,.67))
world=bpy.data.worlds.new('Studio ambience');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs[0].default_value=(.20,.26,.32,1);bg.inputs[1].default_value=.4;scene.world=world
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1200;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=os.path.join(OUT,'hunter_falcon_preview.png')
scene.render.film_transparent=False
# Pack the supplied reference with the editable project.
ref='/var/folders/q2/n87b8ppd3n1bmpvq1z4lb9wh0000gn/T/codex-clipboard-c89d184c-04c8-4340-ba81-7c96c9943ff1.png'
im=bpy.data.images.load(ref,check_existing=True);im.name='REFERENCE | supplied hunter sprite';im.pack()
scene['About']='Stylized 3D interpretation of the supplied hunter and falcon sprite. Separate editable mesh parts; posed static model, no animation rig.'
scene['Reference']='Packed image: REFERENCE | supplied hunter sprite'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'hunter_falcon.blend'))
print('PHASE 2 COMPLETE',len(scene.objects),'objects; saved',bpy.data.filepath)
