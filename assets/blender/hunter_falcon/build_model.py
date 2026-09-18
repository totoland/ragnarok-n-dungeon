import bpy, math, random, os
from mathutils import Vector
from math import sin, cos, pi

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(12)
scene = bpy.data.scenes.new('Hunter & Falcon | Studio')
bpy.context.window.scene = scene
groups = {}
for name in ['01 Character', '02 Outfit & Leather', '03 Hair & Face', '04 Bow & Quiver', '05 Falcon', '06 Studio']:
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    groups[name] = c
group = groups['01 Character']

def mat(name, h, metallic=0, rough=.65):
    rgb = [int(h[i:i+2],16)/255 for i in (0,2,4)]
    rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb,1)
    m.use_nodes = True
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = (*rgb,1)
    n.inputs['Roughness'].default_value = rough
    n.inputs['Metallic'].default_value = metallic
    return m

skin=mat('Skin | warm peach','E8B597')
skin_shadow=mat('Skin | blush','B97768')
ivory=mat('Linen | ivory','ECE1C8')
linen=mat('Linen | shadow','B6A38A')
leather=mat('Leather | chestnut','755041')
edge=mat('Leather | dark edges','3B2A2D')
tan=mat('Leather | honey','BA8758')
stitch=mat('Stitches | flax','D8B883')
gold=mat('Hardware | antique brass','D8AE69',.65,.3)
hair=mat('Hair | walnut','66504F')
hair_lit=mat('Hair | warm strands','94736A')
hair_dark=mat('Hair | shadow','40333D')
eye=mat('Eyes | deep brown','251C28',0,.32)
iris=mat('Eyes | hazel','A16B43',0,.3)
white=mat('Eye glint','FFF8E7',0,.25)
feather=mat('Falcon | warm grey','95827B')
feather_light=mat('Falcon | ivory coverts','CEB6A0')
feather_dark=mat('Falcon | flight feather tips','5F5155')
stone=mat('Display | charcoal','303D43')
rim=mat('Display | bronze rim','947650',.5,.4)
floor_mat=mat('Studio | slate','253239')

def move(o,name,m):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    group.objects.link(o)
    if m: o.data.materials.append(m)
    return o

def mesh(name,vs,fs,m):
    d=bpy.data.meshes.new(name)
    d.from_pydata(vs,[],fs); d.update()
    o=bpy.data.objects.new(name,d); group.objects.link(o)
    if m: d.materials.append(m)
    return o

def ell(name,p,s,m,seg=20,rings=12,smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=p)
    o=move(bpy.context.object,name,m); o.scale=s
    for f in o.data.polygons: f.use_smooth=smooth
    return o

def box(name,p,s,m,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p)
    o=move(bpy.context.object,name,m)
    for v in o.data.vertices:
        v.co.x*=s[0]; v.co.y*=s[1]; v.co.z*=s[2]
    if bevel:
        mod=o.modifiers.new('Soft tailored edges','BEVEL');mod.width=bevel;mod.segments=2
    return o

def tube(name,pts,radii,m,n=10,elliptic=1,smooth=True):
    pts=[Vector(p) for p in pts];vs=[];fs=[]
    for i,p in enumerate(pts):
        t=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        ref=Vector((0,1,0))
        if abs(t.dot(ref))>.95: ref=Vector((1,0,0))
        u=t.cross(ref).normalized();v=t.cross(u).normalized()
        r=radii[i] if isinstance(radii,(list,tuple)) else radii
        for j in range(n): vs.append(p+r*(cos(j*2*pi/n)*u+sin(j*2*pi/n)*v*elliptic))
    for i in range(len(pts)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.extend([tuple(reversed(range(n))),tuple((len(pts)-1)*n+j for j in range(n))])
    o=mesh(name,vs,fs,m)
    for f in o.data.polygons:f.use_smooth=smooth
    return o

def line(name,pts,r,m):return tube(name,pts,r,m,8)

def leaf(name,a,b,c,w,d,m):
    a,b,c=Vector(a),Vector(b),Vector(c)
    pts=[];rs=[]
    for i in range(9):
        t=i/8;pts.append((1-t)**2*a+2*(1-t)*t*b+t*t*c)
        rs.append(max(.001,w*(sin(pi*(.08+.92*t)))**.7))
    return tube(name,pts,rs,m,8,d/w,False)

def loft(name,rings,m,n=16):
    vs=[];fs=[]
    for z,rx,ry,x,y in rings:
        for i in range(n):
            a=2*pi*i/n;vs.append((x+rx*cos(a),y+ry*sin(a),z))
    for k in range(len(rings)-1):
        for j in range(n):a=k*n+j;b=k*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.extend([tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))])
    return mesh(name,vs,fs,m)

def band(name,z,rx,ry,h,m,x=0,y=0):
    return loft(name,[(z-h/2,rx,ry,x,y),(z+h/2,rx,ry,x,y)],m,32)

# Short heroic proportions, relaxed asymmetrical stance.
for side,x,y in [('L',-.17,0),('R',.18,.06)]:
    tube('Trousers '+side,[(x,y,.59),(x,y,.86),(x*.82,0,1.04)],[.12,.137,.145],linen,12)
    ell('Boot toe '+side,(x,y-.105,.16),(.14,.24,.105),leather)
    ell('Sole '+side,(x,y-.10,.091),(.146,.246,.040),edge)
    loft('Boot shaft '+side,[(.17,.13,.13,x,y),(.30,.115,.115,x,y),(.58,.125,.125,x,y)],leather)
    band('Boot cuff '+side,.58,.144,.145,.10,tan,x,y)
    for z in [.27,.40]:
        band('Boot strap '+side,z,.127,.132,.044,edge,x,y)
        box('Boot clasp '+side,(x+.065,y-.127,z),(.053,.025,.046),gold,.006)
    for j in range(4):
        z=.44+j*.028
        line('Boot lacing '+side,[(x-.035,y-.128,z),(x+.035,y-.132,z+.025)],.006,stitch)

loft('Tunic | fitted linen body',[(.92,.24,.16,0,0),(1.08,.235,.17,0,0),(1.33,.26,.18,0,0),(1.55,.29,.16,0,0),(1.63,.15,.12,0,0)],ivory,20)
tube('Neck',[(0,0,1.57),(0,0,1.76)],[.10,.105],skin,16)
ell('Head',(0,-.014,1.965),(.245,.205,.29),skin,32,20)
ell('Ear L',(-.241,-.005,1.961),(.051,.035,.075),skin)
ell('Ear R',(.241,-.005,1.961),(.051,.035,.075),skin)
ell('Ear inset R',(.265,-.029,1.96),(.024,.012,.043),skin_shadow)
ell('Nose',(0,-.211,1.95),(.035,.039,.048),skin)

# Left arm holds the bow, right forearm supports the falcon.
for side,shoulder,elbow,hand in [
    ('L',(-.27,0,1.51),(-.39,-.05,1.28),(-.57,-.21,1.33)),
    ('R',(.27,0,1.51),(.43,-.03,1.27),(.73,-.10,1.46))]:
    s,e,h=Vector(shoulder),Vector(elbow),Vector(hand)
    end=s.lerp(e,.53)
    tube('Linen sleeve '+side,[s,s.lerp(e,.25),end],[.135,.145,.125],ivory,14)
    tube('Sleeve binding '+side,[end,end.lerp(e,.12)],[.13,.126],tan,14)
    tube('Upper arm '+side,[end,e],[.093,.083],skin,16)
    tube('Forearm '+side,[e,h],[.085,.066],skin,16)
    a=e.lerp(h,.24);b=e.lerp(h,.83)
    tube('Leather bracer '+side,[a,b],[.096,.082],leather,12)
    for t in [.3,.73]:
        p=e.lerp(h,t);q=e.lerp(h,t+.085)
        tube('Bracer straps '+side,[p,q],[.10-.02*t,.10-.02*t],tan,12)
    ell('Gloved palm '+side,h,(.088,.072,.081),tan)
    for j in range(3):
        p=h+Vector((-.039+j*.027,-.055,-.012))
        ell('Glove finger '+side+str(j),p,(.018,.025,.052),leather,12,8)

group=groups['02 Outfit & Leather']
# Split hip panels and cream hem beneath the leather corslet.
for side in [-1,1]:
    ob=box('Split tabard '+str(side),(side*.155,-.113,.989),(.23,.105,.285),tan,.035)
    ob.rotation_euler.y=side*-.13
    line('Tabard piping '+str(side),[(side*.055,-.176,1.09),(side*.062,-.176,.87),(side*.245,-.16,.86)],.009,stitch)
loft('Chest leather corslet',[(1.09,.245,.177,0,0),(1.20,.244,.186,0,0),(1.34,.258,.187,0,0)],leather,20)
band('Waist belt',1.105,.26,.192,.078,edge)
box('Belt buckle',(0,-.203,1.106),(.105,.038,.09),gold,.008)
box('Buckle inset',(0,-.226,1.106),(.059,.009,.049),edge,.003)
line('Buckle pin',[(0,-.234,1.08),(0,-.234,1.13)],.007,gold)
for x in [-.17,-.115,.115,.17]:
    ell('Belt rivet',(x,-.195,1.107),(.012,.008,.012),gold,10,6)
for i in range(4):
    z=1.205+i*.036
    line('Corslet cross lace A'+str(i),[(-.04,-.194,z),(.04,-.194,z+.034)],.006,stitch)
    line('Corslet cross lace B'+str(i),[(.04,-.196,z),(-.04,-.196,z+.034)],.006,stitch)

# Shoulder straps, scarf, pouches, and seams.
for side in [-1,1]:
    line('Harness strap '+str(side),[(side*.19,.13,1.18),(side*.23,.12,1.52),(side*.19,0,1.61),(side*.185,-.16,1.49),(side*.18,-.18,1.31)],.036,leather)
    box('Harness brass keeper '+str(side),(side*.19,-.191,1.47),(.076,.025,.055),gold,.006)
band('Scarf collar',1.635,.141,.135,.091,ivory)
leaf('Scarf folded tail L',(-.07,-.14,1.66),(-.16,-.24,1.50),(-.055,-.214,1.385),.062,.018,ivory)
leaf('Scarf folded tail R',(.07,-.14,1.66),(.11,-.23,1.54),(.15,-.212,1.455),.065,.018,ivory)
line('Scarf crease',[(-.06,-.184,1.62),(-.098,-.245,1.52),(-.055,-.225,1.42)],.007,linen)
for x,z in [(.29,1.045),(-.29,1.065)]:
    box('Belt satchel',(x,-.01,z),(.15,.19,.195),leather,.035)
    box('Satchel flap',(x,-.105,z+.053),(.16,.035,.095),tan,.017)
    ell('Satchel brass stud',(x,-.132,z+.025),(.012,.008,.012),gold,12,8)
    line('Satchel stitched edge',[(x-.06,-.126,z+.06),(x-.06,-.126,z+.022),(x+.06,-.126,z+.022),(x+.06,-.126,z+.06)],.004,stitch)

group=groups['03 Hair & Face']
# Large readable eyes beneath sculpted, swept bangs.
for s in [-1,1]:
    x=s*.091
    ell('Eye socket '+str(s),(x,-.200,1.990),(.064,.023,.066),skin_shadow)
    ell('Eye white '+str(s),(x,-.216,1.993),(.052,.014,.050),white)
    ell('Hazel iris '+str(s),(x-.007,-.23,1.991),(.029,.009,.041),iris)
    ell('Pupil '+str(s),(x-.009,-.238,1.993),(.017,.006,.032),eye)
    ell('Eye glint '+str(s),(x-.018,-.243,2.01),(.011,.004,.013),white,12,8)
    line('Upper eyelid '+str(s),[(x-.051,-.222,2.016),(x,-.236,2.035),(x+.047,-.222,2.019)],.010,eye)
    line('Brow '+str(s),[(x-.048,-.203,2.071),(x,-.221,2.084),(x+.035,-.208,2.073)],.012,hair_dark)
line('Mouth',[(-.035,-.207,1.863),(0,-.22,1.856),(.031,-.207,1.865)],.006,skin_shadow)
# Hair cap follows the crown, leaving the face open.
vs=[];fs=[];n=40;rings=12
for k in range(rings):
    for j in range(n):
        a=2*pi*j/n
        front=max(0,-sin(a));theta_max=1.92-.77*front
        t=.018+(theta_max-.018)*k/(rings-1)
        vs.append((.264*sin(t)*cos(a),.016+.225*sin(t)*sin(a),1.997+.288*cos(t)))
for k in range(rings-1):
    for j in range(n):a=k*n+j;b=k*n+(j+1)%n;fs.append((a,b,b+n,a+n))
mesh('Hair | shaped crown',vs,fs,hair)
for i in range(11):
    x=-.22+i*.043
    start=(x*.7,.01,2.264-abs(x)*.22)
    mid=(x-.075,-.205,2.24-abs(x)*.14)
    end=(x-.035,-.232+abs(x)*.15,2.017+(.075 if i in [3,4,5] else 0)+.035*sin(i))
    leaf('Swept fringe %02d'%i,start,mid,end,.043,.025,hair_lit if i%3==0 else hair)
    if i%2==0:
        line('Hair fine highlight '+str(i),[start,Vector(start).lerp(Vector(mid),.7),Vector(mid).lerp(Vector(end),.6)],.0045,hair_lit)
for s in [-1,1]:
    for j in range(4):
        leaf('Side lock '+str(s)+str(j),(s*.20,.075-j*.05,2.15),(s*.28,.075-j*.05,2.02),(s*(.22+.008*j),.06-j*.05,1.85+.025*j),.043,.023,hair_lit if j==1 else hair)
for j in range(5):
    leaf('Nape lock '+str(j),(-.18+j*.09,.18,2.07),(-.18+j*.09,.25,1.97),(-.16+j*.08,.17,1.81),.062,.027,hair)

print('PHASE 1 COMPLETE',len(scene.objects))
