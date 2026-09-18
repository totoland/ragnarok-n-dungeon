# Final silhouette and render adjustments in the shared build namespace.
import bmesh
o=bpy.data.objects['Cape | sculpted crimson fabric']
if sum(p.normal.y for p in o.data.polygons)>0:
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
for o in scene.objects:
    if o.name.startswith('Face | shaped'):
        for p in o.data.polygons:p.use_smooth=True
    if o.name.startswith('Surcoat | left split panel') or o.name.startswith('Surcoat | right long panel'):
        o.location.y-=.045
    if o.name.startswith('Surcoat | gold cross'):
        o.location.y-=.045
# Replace rounded toe volumes with tapered armored sabatons.
group=groups['01 Body']
parent=bpy.data.objects['Body | edit group']
for label,x,y in [('L',-.255,-.015),('R',.285,.055)]:
    for o in list(group.objects):
        if o.name.startswith('Sabatons | pointed toe '+label) or o.name.startswith('Sabatons | articulated toe '+label):
            bpy.data.objects.remove(o,do_unlink=True)
    cx=x*1.18;sgn=-1 if label=='L' else 1
    vs=[];fs=[];slices=[(.10,.128,.125),(-.04,.159,.165),(-.18,.15,.119),(-.31,.115,.079),(-.42,.014,.020)]
    for yy,w,h in slices:
        for j in range(8):
            a=2*pi*j/8
            vs.append((cx+sgn*max(0,-yy)*.12+w*cos(a),y+yy,.07+h*sin(a) if sin(a)>0 else .065+.03*sin(a)))
    for k in range(4):
        for j in range(8):a=k*8+j;b=k*8+(j+1)%8;fs.append((a,b,b+8,a+8))
    fs.extend([tuple(reversed(range(8))),tuple(32+j for j in range(8))])
    o=mesh('Sabatons | pointed shell '+label,vs,fs,silver);o.parent=parent
    for yy,w,h in slices[1:-1]:
        pts=[]
        for j in range(9):
            a=pi*j/8
            pts.append((cx+sgn*max(0,-yy)*.12+w*cos(a),y+yy-.008,.073+h*sin(a)))
        o=line('Sabatons | overlap seam '+label,pts,.008,silver_dark);o.parent=parent
scene.render.filepath=os.path.join(OUT,'ro_knight_preview.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'ro_knight.blend'))
print('KNIGHT POLISH SAVED')
