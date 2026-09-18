import bpy, math, random, os
from mathutils import Vector
from math import sin, cos, pi

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(12)
scene = bpy.data.scenes.new('RO Knight | Studio')
bpy.context.window.scene = scene
groups = {}
for name in ['01 Body', '02 Armor', '03 Hair & Face', '04 Cloth & Cape', '05 Sword', '06 Studio']:
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    groups[name] = c
group = groups['01 Body']

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

# Materials follow the knight reference: cool steel, warm gold, wine red.
silver=mat('Armor | polished pearl steel','CFD3E1',.72,.28)
silver_light=mat('Armor | bevel highlights','F2EFF4',.66,.23)
silver_dark=mat('Armor | lavender steel shadow','737083',.72,.34)
gold=mat('Armor | royal gold','DDB360',.70,.27)
gold_light=mat('Armor | gold edge','FFE0A0',.68,.25)
gold_dark=mat('Armor | gold recess','8D552B',.65,.35)
under=mat('Cloth | warm charcoal','302326',0,.83)
tabard=mat('Cloth | dark umber tabard','493132',0,.8)
red=mat('Cape | crimson velvet','981D49',0,.8)
red_inner=mat('Cape | burgundy lining','4C1533',0,.9)
red_light=mat('Insignia | ruby enamel','B5164E',.35,.27)
hair=mat('Hair | dark chestnut','3D231E',0,.7)
hair_lit=mat('Hair | chestnut planes','674537',0,.63)
hair_dark=mat('Hair | deep brown','27191B',0,.76)
skin=mat('Skin | warm ivory','F1C3A7',0,.75)
skin_shadow=mat('Skin | rose shadow','BB7C6C',0,.8)
iris=mat('Eyes | amber','B67C28',.1,.34)

def plate(name,outline,y,depth,m,ridge=.025,trim=None):
    # Convex metal plate: outline is in x/z, center ridge faces the viewer.
    count=len(outline);cx=sum(p[0] for p in outline)/count;cz=sum(p[1] for p in outline)/count
    vs=[(x,y,z) for x,z in outline]+[(cx,y-ridge,cz)]+[(x,y+depth,z) for x,z in outline]
    fs=[]
    for i in range(count):
        j=(i+1)%count;fs.extend([(i,j,count),(i,count+1+i,count+1+j,j)])
    fs.append(tuple(count+1+i for i in reversed(range(count))))
    o=mesh(name,vs,fs,m)
    if trim:line(name+' | edge',[(x,y-.003,z) for x,z in outline]+[(outline[0][0],y-.003,outline[0][1])],.014,trim)
    return o

def diamond(name,x,y,z,w,h,m=gold):
    return plate(name,[(x,z+h),(x-w,z),(x,z-h),(x+w,z)],y,.013,m,.028)

def cross_emblem(name,x,y,z,scale=1):
    # Flared heraldic cross with a faceted center jewel.
    pts=[(-.045,.18),(.045,.18),(.037,.057),(.13,.084),(.16,.035),(.06,.009),(.054,-.103),(0,-.158),(-.054,-.103),(-.06,.009),(-.16,.035),(-.13,.084),(-.037,.057)]
    plate(name,[(x+a*scale,z+b*scale) for a,b in pts],y,.02,gold,.027,gold_light)
    diamond(name+' | central facet',x,y-.03,z+.016*scale,.044*scale,.068*scale,gold_light)

# Foundation: tall anime proportions and a wide balanced stance.
group=groups['01 Body']
for side,x,y in [('L',-.255,-.015),('R',.285,.055)]:
    hip=(x*.72,0,1.73);knee=(x,y,1.02);ankle=(x*1.18,y,.27)
    tube('Black chausses '+side,[ankle,knee,hip],[.11,.14,.185],under,16)
    ell('Sabatons | heel '+side,(ankle[0],y,.18),(.145,.19,.17),silver_dark,16,10,False)
    foot=ell('Sabatons | pointed toe '+side,(ankle[0]+(-.025 if side=='L' else .035),y-.17,.115),(.165,.30,.107),silver,16,8,False)
    for j in range(3):
        yy=y-.11-j*.085
        plate('Sabatons | articulated toe '+side+str(j),[(ankle[0]-.13+j*.014,.17-j*.022),(ankle[0],.225-j*.028),(ankle[0]+.13-j*.014,.17-j*.022),(ankle[0]+.11-j*.016,.10),(ankle[0]-.11+j*.016,.10)],yy,.045,silver,.022)
    # Greaves taper at the ankle and flare beneath each knee.
    loft('Greave | rear shell '+side,[(.27,.112,.125,ankle[0],y),(.68,.145,.142,x*1.07,y),(.92,.172,.151,x,y)],silver_dark,12)
    plate('Greave | ridged front '+side,[(x-.17,.91),(x,.965),(x+.17,.91),(ankle[0]+.107,.32),(ankle[0],.25),(ankle[0]-.107,.32)],y-.147,.065,silver,.076,silver_light)
    line('Greave | center seam '+side,[(ankle[0],y-.224,.31),(x,y-.226,.90)],.006,silver_light)
    plate('Ankle | flared guard '+side,[(ankle[0]-.14,.33),(ankle[0],.375),(ankle[0]+.14,.33),(ankle[0]+.17,.22),(ankle[0]+.09,.20),(ankle[0],.255),(ankle[0]-.13,.20)],y-.158,.05,silver,.05,silver_dark)
    ell('Knee | articulated joint '+side,(x,y,1.02),(.166,.15,.145),under,16,10)
    plate('Poleyn | diamond knee '+side,[(x,1.19),(x-.18,1.05),(x-.145,.96),(x,.914),(x+.145,.96),(x+.18,1.05)],y-.143,.055,silver,.082,silver_light)
    for j in range(2):
        z=1.27+j*.20;xx=x*(1-(z-1.02)*.35)
        loft('Cuisse | thigh plate '+side+str(j),[(z-.1,.159,.161,xx,y),(z+.12,.172,.177,xx*.97,y)],silver,12)
        line('Cuisse | articulated rim '+side+str(j),[(xx-.14,y-.08,z-.095),(xx-.08,y-.151,z-.095),(xx+.08,y-.151,z-.095),(xx+.14,y-.08,z-.095)],.012,silver_light)

loft('Torso | padded dark gambeson',[(1.64,.285,.18,0,0),(1.9,.255,.175,0,0),(2.20,.29,.19,0,0),(2.50,.365,.20,0,0),(2.69,.30,.15,0,0)],under,20)
tube('Neck',[(0,0,2.67),(0,-.005,2.95)],[.112,.108],skin,20)
loft('Face | shaped jaw and cranium',[(2.88,.057,.061,0,-.035),(2.915,.13,.092,0,-.025),(3.00,.205,.14,0,0),(3.14,.241,.173,0,0),(3.31,.232,.17,0,.006),(3.43,.168,.129,0,.014),(3.47,.052,.06,0,.02)],skin,32)
for s in [-1,1]:
    ell('Ear '+str(s),(s*.237,.0,3.12),(.043,.033,.072),skin,16,10)
    ell('Ear inner '+str(s),(s*.252,-.022,3.12),(.022,.010,.043),skin_shadow,12,8)
for side,s in [('L',-1),('R',1)]:
    shoulder=Vector((s*.37,0,2.60));elbow=Vector((s*.52,0,2.19));hand=Vector((s*.65,-.075,1.77))
    tube('Arm | dark undersleeve '+side,[shoulder,elbow,hand],[.14,.125,.094],under,16)
    ell('Gauntlet | leather fist '+side,hand,(.116,.105,.15),edge,16,10)

group=groups['02 Armor']
# Breastplate spans the chest, with dark metal collar and gold borders.
loft('Cuirass | back plate',[(2.21,.30,.215,0,.015),(2.49,.369,.22,0,.015),(2.66,.31,.18,0,.01)],silver_dark,16)
chest=[(-.31,2.65),(-.13,2.69),(0,2.57),(.13,2.69),(.31,2.65),(.37,2.39),(.24,2.22),(0,2.16),(-.24,2.22),(-.37,2.39)]
plate('Cuirass | sculpted breastplate',chest,-.203,.10,silver,.13,gold)
line('Cuirass | lower raised piping',[(-.36,-.219,2.38),(-.235,-.26,2.23),(0,-.242,2.17),(.235,-.26,2.23),(.36,-.219,2.38)],.009,gold_light)
cross_emblem('Cuirass | golden cross',.09,-.342,2.433,1.14)
diamond('Cuirass | left heraldic lozenge',-.18,-.315,2.44,.10,.083,gold)
diamond('Cuirass | right heraldic lozenge',.27,-.284,2.48,.055,.074,gold)
band('Gorget | silver neck ring',2.768,.139,.14,.088,silver)
line('Gorget | gold lip',[(.145*cos(t*2*pi/32),.145*sin(t*2*pi/32),2.805) for t in range(33)],.010,gold)
for s in [-1,1]:
    plate('Gorget | upturned wing '+str(s),[(s*.135,2.72),(s*.22,2.85),(s*.34,2.80),(s*.39,2.48),(s*.30,2.37),(s*.22,2.57)],-.08,.08,silver_dark,.027,gold)
    line('Gorget | inner silver trim '+str(s),[(s*.18,-.10,2.73),(s*.255,-.10,2.79),(s*.32,-.10,2.54)],.010,silver_light)
    # Pauldron shell and layered lower lames.
    x=s*.43
    ell('Pauldron | steel dome '+str(s),(x,.01,2.59),(.254,.225,.245),silver,16,10,False)
    outline=[(x-s*.18,2.77),(x+s*.10,2.79),(x+s*.26,2.58),(x+s*.22,2.37),(x-s*.08,2.36),(x-s*.18,2.49)]
    plate('Pauldron | heraldic face '+str(s),outline,-.17,.12,silver,.058,gold)
    cross_emblem('Pauldron | golden cross '+str(s),x+s*.02,-.237,2.59,.80)
    diamond('Pauldron | raised boss '+str(s),x+s*.16,-.191,2.705,.058,.043,gold_light)
    for z in [2.37,2.29]:
        tube('Upper arm | overlapping lame '+str(s),[(s*.47,0,z+.047),(s*.49,0,z-.047)],[.16,.151],silver,12)
    ell('Couter | joint '+str(s),(s*.52,0,2.18),(.155,.145,.133),silver_dark,16,10,False)
    plate('Couter | pointed elbow '+str(s),[(s*.52,2.31),(s*.52-.16,2.20),(s*.52,2.045),(s*.52+.16,2.20)],-.141,.055,silver,.043,silver_light)
    tube('Vambrace | forearm shell '+str(s),[(s*.55,0,2.12),(s*.635,-.069,1.82)],[.153,.113],silver,12)
    plate('Vambrace | front ridge '+str(s),[(s*.55-.13,2.13),(s*.55+.13,2.13),(s*.635+.085,1.85),(s*.635,1.79),(s*.635-.085,1.85)],-.142,.045,silver,.035,silver_light)
    for j in range(4):
        ell('Vambrace | rivet '+str(s)+str(j),(s*.57-.050,-.176,2.04-j*.047),(.009,.005,.009),silver_dark,10,6)
    band('Gauntlet | golden cuff '+str(s),1.832,.124,.121,.041,gold,s*.64,-.065)
    plate('Gauntlet | dorsal shield '+str(s),[(s*.65-.11,1.805),(s*.65+.11,1.805),(s*.65+.13,1.69),(s*.65,1.625),(s*.65-.13,1.69)],-.174,.045,silver,.049,silver_dark)
    for j in range(4):
        x=s*.65-.082+j*.053
        ell('Gauntlet | finger joint '+str(s)+str(j),(x,-.186,1.67),(.027,.043,.044),silver,12,8,False)
        plate('Gauntlet | knuckle spike '+str(s)+str(j),[(x-.025,1.705),(x,1.758),(x+.025,1.705),(x,1.675)],-.196,.02,silver,.027)

# Scale mail under the breastplate, with individual metal tiles.
for row in range(4):
    z=1.94+row*.057
    for j in range(8):
        x=-.27+j*.073+(row%2)*.015
        if x>.28:continue
        y=-.19*math.sqrt(max(.1,1-(x/.35)**2))-.012
        plate('Mail | scale %d %d'%(row,j),[(x-.03,z+.028),(x+.03,z+.028),(x+.031,z-.017),(x,z-.034),(x-.031,z-.017)],y,.01,silver_dark if (row+j)%4==0 else silver,.012)
print('KNIGHT BODY BUILT',len(scene.objects))
