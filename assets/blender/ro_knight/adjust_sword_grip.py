# Run after the knight build scripts, in their shared namespace.
from mathutils import Matrix
import shutil

backup=os.path.join(OUT,'ro_knight_before_grip.blend')
if not os.path.exists(backup):shutil.copy2(os.path.join(OUT,'ro_knight.blend'),backup)

# The grip, fingers and wrist share one physical frame.
H=Vector((-.745,-.325,1.875))
g=Vector((.76,-.08,-.646)).normalized()
front=Vector((0,-1,0));front=(front-g*front.dot(g)).normalized()
across=front.cross(g).normalized()
W=H+across*.142-front*.025
elbow=Vector((-.52,0,2.19))

# Reposition the complete sword so the grip center passes through the fist.
old_guard=Vector((-.48,-.225,1.61))
old_tip=Vector((1.20,-.54,.24))
old_axis=(old_tip-old_guard).normalized()
old_center=old_guard-old_axis*.24
q=old_axis.rotation_difference(g)
sword_parent=bpy.data.objects['Sword | edit group']
sword_parent.matrix_basis=Matrix.Translation(H) @ q.to_matrix().to_4x4() @ Matrix.Translation(-old_center)
sword_parent['Grip center']=list(H)
group=groups['05 Sword']
socket=tube('Sword | guard socket',[swordpoint(-.105),swordpoint(.085)],[.072,.081],gold,10,smooth=False)
socket.parent=sword_parent

# Bend the forearm toward the hilt, preserving its metal plates and rivets.
A0=Vector((-.55,0,2.12));B0=Vector((-.635,-.069,1.82))
A1=elbow+(W-elbow)*.16;B1=W
d0=(B0-A0).normalized();d1=(B1-A1).normalized()
rq=d0.rotation_difference(d1);ratio=(B1-A1).length/(B0-A0).length
for o in list(scene.objects):
    if o.type=='MESH' and (o.name.startswith('Vambrace |') and '-1' in o.name):
        mw=o.matrix_world.copy();inv=mw.inverted()
        for v in o.data.vertices:
            p=mw@v.co-A0
            p+=d0*p.dot(d0)*(ratio-1)
            v.co=inv@(A1+rq@p)
        o.data.update()

# Replace the old hanging hand with four curled fingers and an opposing thumb.
for o in list(scene.objects):
    old_hand=(o.name=='Gauntlet | leather fist L' or o.name=='Arm | dark undersleeve L' or (o.name.startswith('Gauntlet |') and '-1' in o.name))
    if old_hand:bpy.data.objects.remove(o,do_unlink=True)
group=groups['01 Body'];body_parent=bpy.data.objects['Body | edit group']
def body_attach(o):o.parent=body_parent;return o
body_attach(tube('Arm | dark undersleeve L',[(-.37,0,2.60),elbow,W],[.14,.125,.083],under,16))
palm=body_attach(ell('Grip | leather palm',H-front*.070,(.108,.070,.105),edge,20,14))
# Ellipsoid local Z follows the grip; local Y is depth and local X crosses the palm.
basis=Matrix((across,front,g)).transposed()
palm.rotation_euler=basis.to_euler()
body_attach(tube('Grip | connected wrist',[W,H+across*.065-front*.057],[.083,.09],edge,16))

group=groups['02 Armor'];armor_parent=bpy.data.objects['Armor | edit group']
def armor_attach(o):o.parent=armor_parent;return o
arm_dir=(W-elbow).normalized()
armor_attach(tube('Grip | gold wrist cuff',[W-arm_dir*.035,W+arm_dir*.017],[.113,.109],gold,16))
armor_attach(tube('Grip | silver cuff lip',[W-arm_dir*.039,W-arm_dir*.018],[.118,.116],silver,16))

def finger_path(t,lo,hi,count=12,r=.079):
    out=[]
    for j in range(count):
        ang=math.radians(lo+(hi-lo)*j/(count-1))
        out.append(H+g*t+(across*cos(ang)+front*sin(ang))*r)
    return out

for j,t in enumerate([-.079,-.026,.027,.080]):
    radius=.022 if j==0 else .025
    armor_attach(tube('Grip | finger %d leather flexion'%j,finger_path(t,-38,218,25),radius,edge,10))
    for k,(lo,hi) in enumerate([(-34,36),(43,115),(122,210)]):
        armor_attach(tube('Grip | finger %d steel segment %d'%(j,k),finger_path(t,lo,hi,8),radius+.005,silver,8,smooth=False))
    # Small rivets on the middle armored phalanges.
    p=finger_path(t,78,79,2,r=.110)[0]
    armor_attach(ell('Grip | finger rivet '+str(j),p,(.008,.006,.008),silver_dark,10,6))

# Thumb crosses the near side, closing against the index finger.
thumb_points=[W+g*.072+front*.006,
              H+g*.137+across*.083+front*.025,
              H+g*.136+across*.017+front*.093,
              H+g*.082-across*.031+front*.096]
armor_attach(tube('Grip | thumb leather',thumb_points,[.040,.037,.032,.026],edge,12))
for k in range(3):
    a=Vector(thumb_points[k]);b=Vector(thumb_points[k+1])
    armor_attach(tube('Grip | thumb steel segment '+str(k),[a.lerp(b,.06),a.lerp(b,.91)],[.041-k*.005,.036-k*.004],silver,10,smooth=False))

# Dorsal plate joins the wrist and rear of the curled knuckles.
coords=[(-.103,.078),(.102,.078),(.114,-.040),(.067,-.096),(-.068,-.096),(-.111,-.035)]
vs=[H+g*u+across*v-front*.137 for u,v in coords]
vs.append(H-front*.153)
o=armor_attach(mesh('Grip | dorsal armor',vs,[(i,(i+1)%6,6) for i in range(6)],silver))
armor_attach(line('Grip | dorsal plate rim',vs[:6]+[vs[0]],.008,silver_dark))

scene['Grip revision']='Sword hilt centered through a closed four-finger grip; opposing thumb and bent connected wrist.'
scene.render.filepath=os.path.join(OUT,'ro_knight_preview.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'ro_knight.blend'))
print('GRIP UPDATED. Center',tuple(H),'Wrist',tuple(W),'Finger inner radius',.079-.025-.005,'Hilt radius .055')
