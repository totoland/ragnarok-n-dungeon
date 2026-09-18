# Run once after adjust_sword_grip.py in the shared build namespace.
from mathutils import Matrix, Vector
import shutil

backup=os.path.join(OUT,'ro_knight_sword_lowered.blend')
if not os.path.exists(backup):shutil.copy2(os.path.join(OUT,'ro_knight.blend'),backup)

old_H=H.copy();old_W=W.copy()
old_basis=Matrix((across,front,g)).transposed()
new_H=Vector((-.80,-.29,2.0))
new_g=Vector((0,0,1))
angle=math.radians(-20)
new_across=Vector((cos(angle),sin(angle),0))
new_front=new_g.cross(new_across).normalized()
new_basis=Matrix((new_across,new_front,new_g)).transposed()
rotation=new_basis@old_basis.transposed()
transform=Matrix.Translation(new_H)@rotation.to_4x4()@Matrix.Translation(-old_H)
new_W=transform@old_W

# Rotate the complete weapon and closed hand as one assembly.
sword_parent=bpy.data.objects['Sword | edit group']
sword_parent.matrix_world=transform@sword_parent.matrix_world
sword_parent['Grip center']=list(new_H)
sword_parent['Blade direction']=list(new_g)
for o in list(scene.objects):
    if o.name.startswith('Grip |') and o.name not in ['Grip | gold wrist cuff','Grip | silver cuff lip']:
        o.matrix_world=transform@o.matrix_world

# Re-aim the forearm so the raised fist stays connected to the elbow.
old_A=elbow+(old_W-elbow)*.16;old_B=old_W
new_A=elbow+(new_W-elbow)*.16;new_B=new_W
old_dir=(old_B-old_A).normalized();new_dir=(new_B-new_A).normalized()
turn=old_dir.rotation_difference(new_dir)
stretch=(new_B-new_A).length/(old_B-old_A).length
for o in list(scene.objects):
    if o.type=='MESH' and o.name.startswith('Vambrace |') and '-1' in o.name:
        mw=o.matrix_world.copy();inv=mw.inverted()
        for v in o.data.vertices:
            p=mw@v.co-old_A
            p+=old_dir*p.dot(old_dir)*(stretch-1)
            v.co=inv@(new_A+turn@p)
        o.data.update()
for name in ['Arm | dark undersleeve L','Grip | gold wrist cuff','Grip | silver cuff lip']:
    o=bpy.data.objects.get(name)
    if o:bpy.data.objects.remove(o,do_unlink=True)
group=groups['01 Body']
o=tube('Arm | dark undersleeve L',[(-.37,0,2.60),elbow,new_W],[.14,.125,.083],under,16)
o.parent=bpy.data.objects['Body | edit group']
group=groups['02 Armor']
for name,p1,p2,r1,r2,material in [
    ('Grip | gold wrist cuff',new_W-new_dir*.035,new_W+new_dir*.017,.113,.109,gold),
    ('Grip | silver cuff lip',new_W-new_dir*.039,new_W-new_dir*.018,.118,.116,silver)]:
    o=tube(name,[p1,p2],[r1,r2],material,16);o.parent=bpy.data.objects['Armor | edit group']

H=new_H;W=new_W;g=new_g;front=new_front;across=new_across
scene.camera.data.ortho_scale=5.04
target=Vector((-.13,0,2.16))
scene.camera.location=(3.87,-11,4.60)
scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene['Sword pose']='Upright blade, tip pointing vertically up. Hand rotates with the hilt; forearm remains connected.'
bpy.context.view_layer.update()
grip=bpy.data.objects['Sword | leather grip']
grip_center=sum((grip.matrix_world@v.co for v in grip.data.vertices),Vector())/len(grip.data.vertices)
blade=bpy.data.objects['Sword | diamond-section steel blade']
blade_tip=blade.matrix_world@blade.data.vertices[3].co
print('Grip alignment error:',(grip_center-H).length)
print('Blade tip:',tuple(blade_tip),'hand:',tuple(H),'vertical rise:',blade_tip.z-H.z)
scene.render.filepath=os.path.join(OUT,'ro_knight_preview.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'ro_knight.blend'))
