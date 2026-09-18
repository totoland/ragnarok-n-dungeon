# Execute after build_knight.py in the same namespace.
group=groups['03 Hair & Face']
# Almond-shaped anime eyes, angled brows, and a small sculpted nose.
for s in [-1,1]:
    x=s*.092
    outline=[(x-.064,3.188),(x-.034,3.208),(x+.026,3.204),(x+.062,3.18),(x+.034,3.156),(x-.030,3.153)]
    plate('Eye | almond white '+str(s),outline,-.161,.008,white,.025)
    ell('Eye | amber iris '+str(s),(x,-.192,3.178),(.030,.008,.032),iris,20,12)
    ell('Eye | pupil '+str(s),(x,-.200,3.181),(.013,.005,.026),eye,16,10)
    ell('Eye | glint '+str(s),(x-.010,-.205,3.195),(.008,.003,.009),white,12,8)
    line('Eye | upper lash '+str(s),[(x-.063,-.169,3.188),(x-.027,-.191,3.206),(x+.029,-.190,3.202),(x+.064,-.163,3.18)],.008,hair_dark)
    line('Brow | determined '+str(s),[(x-s*.049,-.17,3.227),(x,-.177,3.245),(x+s*.065,-.147,3.255)],.011,hair_dark)
plate('Nose | bridge',[(-.018,3.163),(.016,3.163),(.032,3.086),(.005,3.069),(-.024,3.085)],-.153,.009,skin,.064)
line('Mouth | quiet smile',[(-.046,-.145,3.022),(-.012,-.157,3.015),(.021,-.158,3.018),(.047,-.14,3.027)],.005,skin_shadow)
ell('Lower lip',(0,-.145,2.996),(.026,.009,.009),skin,16,8)
# Shaped cap, then thick pointed locks sweeping from a crown to the forehead.
vs=[];fs=[];n=40;rows=12
for k in range(rows):
    for j in range(n):
        a=2*pi*j/n;front=max(0,-sin(a));t=.015+(1.97-.79*front-.015)*k/(rows-1)
        vs.append((.256*sin(t)*cos(a),.016+.197*sin(t)*sin(a),3.249+.270*cos(t)))
for k in range(rows-1):
    for j in range(n):a=k*n+j;b=k*n+(j+1)%n;fs.append((a,b,b+n,a+n))
mesh('Hair | crown volume',vs,fs,hair)
bangs=[
 ((-.07,.005,3.51),(-.27,-.15,3.42),(-.29,-.13,3.16),.074),
 ((-.06,-.01,3.54),(-.17,-.24,3.43),(-.12,-.211,3.16),.072),
 ((-.06,-.015,3.52),(-.06,-.27,3.41),(.014,-.208,3.19),.071),
 ((-.05,-.005,3.53),(.084,-.25,3.42),(.12,-.201,3.14),.068),
 ((-.012,.01,3.51),(.205,-.19,3.39),(.25,-.123,3.16),.080),
 ((-.06,.028,3.52),(.26,-.07,3.47),(.32,-.043,3.28),.065),
 ((-.11,.045,3.50),(-.28,-.03,3.42),(-.34,-.023,3.29),.059)]
for i,(a,b,c,w) in enumerate(bangs):
    leaf('Hair | pointed fringe %02d'%i,a,b,c,w,.029,hair_lit if i in [0,2,5] else hair)
    if i in [0,2,4]:
        aa=Vector(a);bb=Vector(b);cc=Vector(c)
        path=[]
        for j in range(8):
            t=.13+j*.095;path.append((1-t)**2*aa+2*t*(1-t)*bb+t*t*cc+Vector((0,-.023,0)))
        line('Hair | fine amber strand '+str(i),path,.003,hair_lit)
for i in range(12):
    a=2*pi*i/12
    start=Vector((-.045,.04,3.49))
    mid=Vector((.22*cos(a),.16*sin(a)+.04,3.48+.022*sin(i*2)))
    end=Vector((.32*cos(a),.245*sin(a)+.05,3.39+.045*cos(i*1.8)))
    if i in [2,3,4]:end.z+=.15
    leaf('Hair | radiating spike %02d'%i,start,mid,end,.055,.034,hair_lit if i%4==0 else hair)
for i in range(4):
    leaf('Hair | crown cowlick '+str(i),(-.09,.06,3.47),(-.12+i*.05,.06,3.65),(-.19+i*.09,.05,3.65+(.10 if i==2 else 0)),.038,.025,hair_lit if i%2==0 else hair)
for s in [-1,1]:
    for j in range(3):
        leaf('Hair | sideburn '+str(s)+str(j),(s*.22,.055-j*.045,3.31),(s*.267,.048-j*.047,3.12),(s*(.236-.022*j),.046-j*.039,2.986+.035*j),.047,.024,hair)
for j in range(6):
    leaf('Hair | nape '+str(j),(-.2+j*.075,.17,3.27),(-.20+j*.078,.23,3.11),(-.22+j*.084,.145,2.941+abs(j-2.5)*.019),.051,.025,hair_dark if j%3==0 else hair)

group=groups['04 Cloth & Cape']
# A thick wind-swept cape. Its sculpted folds work from every viewing angle.
def cape_point(u,v):
    width=.36+.82*sin(v*pi*.66)
    x=u*width+.21*v*v
    z=2.73-2.13*v+.13*u*u*v+.11*sin(2*pi*u+1)*v*v
    y=.18+.51*sin(v*pi*.7)+.12*cos(u*3*pi+.8)*sin(pi*v*.85)+.12*u*v
    return Vector((x,y,z))
nu=48;nv=32;vs=[];fs=[]
for i in range(nv+1):
    for j in range(nu+1):vs.append(cape_point(-1+2*j/nu,i/nv))
for i in range(nv):
    for j in range(nu):
        a=i*(nu+1)+j;fs.append((a,a+1,a+nu+2,a+nu+1))
o=mesh('Cape | sculpted crimson fabric',vs,fs,red)
o.data.materials.append(red_inner)
for f in o.data.polygons:f.use_smooth=True
mod=o.modifiers.new('Velvet fabric thickness','SOLIDIFY');mod.thickness=.013;mod.material_offset=1
for s in [-1,1]:
    line('Cape | gold side edging '+str(s),[cape_point(s*.965,i/64)+Vector((0,-.014,0)) for i in range(65)],.015,gold)
line('Cape | sweeping gold hem',[cape_point(-.965+1.93*j/100,.982)+Vector((0,-.014,0)) for j in range(101)],.017,gold)
for s in [-1,1]:
    ell('Cape | golden shoulder clasp '+str(s),(s*.28,-.044,2.73),(.060,.033,.06),gold,16,10)
# Split dark surcoat beneath the waist, with a crimson lining and gold hems.
def tail(name,pts):
    o=mesh(name,pts,[tuple(range(len(pts)))],tabard)
    sol=o.modifiers.new('Cloth thickness','SOLIDIFY');sol.thickness=.018
    line(name+' | gold edging',pts+[pts[0]],.014,gold)
    return o
tail('Surcoat | right long panel',[(.02,-.211,1.78),(.32,-.17,1.77),(.35,-.21,1.44),(.45,-.22,.89),(.31,-.24,.74),(.09,-.259,.90),(-.015,-.24,1.42)])
tail('Surcoat | left split panel',[(-.29,-.171,1.77),(-.035,-.212,1.78),(-.13,-.229,1.32),(-.26,-.231,.82),(-.49,-.18,.71),(-.53,-.13,.85),(-.40,-.161,1.31)])
tail('Surcoat | rear pennant',[(-.21,.27,1.73),(.21,.27,1.73),(.25,.29,.63),(.05,.25,.38),(-.07,.25,.49),(-.16,.25,1.05)])
cross_emblem('Surcoat | gold cross',.306,-.267,1.018,.60)
# Embroidered slim center stripe.
line('Surcoat | center piping',[(-.05,-.26,1.73),(-.082,-.267,1.45),(-.13,-.256,1.25)],.008,gold_light)
band('Waist | broad leather belt',1.846,.29,.203,.11,leather)
band('Waist | lower utility belt',1.702,.319,.219,.059,under)
for x in [-.20,.18]:
    box('Waist | gold keeper',(x,-.178,1.846),(.041,.056,.121),gold,.008)
box('Waist | belt buckle',(-.08,-.222,1.844),(.103,.04,.096),gold,.009)
box('Waist | belt buckle inset',(-.08,-.247,1.844),(.065,.01,.058),edge,.004)
# Ruby compass-shaped RO belt insignia.
x=.12;y=-.247;z=1.847
line('Waist | ruby compass ring',[(x+.077*cos(2*pi*j/48),y,z+.077*sin(2*pi*j/48)) for j in range(49)],.017,red_light)
for j in range(4):
    a=j*pi/2;d=Vector((sin(a),0,cos(a)));c=Vector((x,y-.019,z));side=Vector((cos(a),0,-sin(a)))
    pts=[c+d*.119,c+d*.040+side*.025,c,c+d*.040-side*.025]
    mesh('Waist | compass point '+str(j),pts,[(0,1,2),(0,2,3)],red_light)
diamond('Waist | ruby center',x,y-.024,z,.024,.031,red_light)
# Small sword hanger and two gold loops.
line('Belt | diagonal sword hanger',[(-.19,-.201,1.86),(-.33,-.251,1.58),(-.38,-.26,1.45)],.039,leather)
for z in [1.74,1.57]:box('Belt | sword hanger hardware',(-.275 if z>1.6 else -.335,-.285,z),(.11,.033,.053),gold,.008)

group=groups['05 Sword']
# A broad, sharply faceted sword crosses the pose from the left fist.
guard=Vector((-.48,-.225,1.61));tip=Vector((1.20,-.54,.24));axis=(tip-guard).normalized()
side=Vector((-axis.z,0,axis.x)).normalized();normal=axis.cross(side).normalized()
if normal.y>0:normal=-normal
def swordpoint(t,w=0,d=0):return guard+axis*t+side*w+normal*d
length=(tip-guard).length
v=[swordpoint(.04,-.12),swordpoint(.04,.12),swordpoint(length-.27,.105),tip,swordpoint(length-.27,-.105),swordpoint(.06,0,.050),swordpoint(length-.27,0,.025),swordpoint(.06,0,-.028),swordpoint(length-.27,0,-.02)]
f=[(0,1,5),(1,2,6,5),(2,3,6),(3,4,6),(4,0,5,6),(1,0,7),(2,1,7,8),(3,2,8),(4,3,8),(0,4,8,7)]
o=mesh('Sword | diamond-section steel blade',v,f,silver)
o.data.materials.append(silver_light);o.data.materials.append(silver_dark)
for i,p in enumerate(o.data.polygons):p.material_index=[1,1,1,2,2,0,0,0,0,0][i]
line('Sword | bright center ridge',[swordpoint(.07,0,.052),swordpoint(length-.27,0,.027),tip],.004,silver_light)
tube('Sword | leather grip',[swordpoint(-.08),swordpoint(-.40)],[.055,.048],edge,12)
for j in range(9):
    t=-.11-j*.031
    ringpts=[swordpoint(t,.055*cos(k*2*pi/20),.055*sin(k*2*pi/20)) for k in range(21)]
    line('Sword | spiral grip wire '+str(j),ringpts,.006,gold_dark)
ell('Sword | faceted pommel',swordpoint(-.45),(.087,.073,.087),gold,12,8,False)
ell('Sword | pommel ruby',swordpoint(-.465)+Vector((0,-.065,0)),(.030,.011,.033),red_light,12,8)
# Swept crescent crossguard, with a gold outer lip and wine-red inlay.
curve=[]
for j in range(41):
    u=-1+2*j/40
    curve.append(swordpoint(-.035-.22*u*u,.40*u,0))
tube('Sword | crescent guard',curve,[.040+.012*(1-abs(-1+2*j/40)) for j in range(41)],gold,12,.72)
line('Sword | crescent bright lip',[p+normal*.030 for p in curve],.011,gold_light)
line('Sword | burgundy guard inlay',[p+normal*.038-axis*.018 for p in curve[4:-4]],.013,red_light)
diamond('Sword | guard ruby',guard.x,guard.y-.059,guard.z,.042,.053,red_light)
for s in [-1,1]:ell('Sword | guard finial '+str(s),swordpoint(-.26,s*.405),(.057,.049,.066),gold,12,8,False)
print('KNIGHT DETAILS BUILT',len(scene.objects))
