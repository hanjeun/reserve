"""Rebuild four editable RESERVE editing/status icons with Blender 4.3.2.
blender --factory-startup -b --python source/build_assets.py -- --resolution 512 768
No texture, stock model, font, linked library, or raster input is required.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[1]
NAMES = ['edit-operation','edit-identity','intake-paused','waiting-off']
argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--names',nargs='+',choices=NAMES,default=NAMES)
parser.add_argument('--resolution',nargs='+',type=int,default=[512,768])
parser.add_argument('--samples',type=int,default=128)
parser.add_argument('--output',type=Path,default=ROOT)
args=parser.parse_args(argv)
ROOT=args.output.resolve()
M={}
def material(name, hex_color, metallic, roughness):
    m = bpy.data.materials.new(name)
    srgb = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    m.diffuse_color = (*[v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in srgb], 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = m.diffuse_color
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    m['source_srgb'] = '#' + hex_color.upper()
    return m

def assign(obj, mat='white'):
    obj.data.materials.append(M[mat])
    if obj.type == 'MESH':
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj

def rounded_cube(name, loc, size, mat='white', bevel=.15):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Soft continuous edges', 'BEVEL')
    mod.width, mod.segments = bevel, 6
    mod.affect = 'EDGES'
    obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return assign(obj, mat)

def sphere(name, loc, size, mat='blue'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, location=loc)
    obj = bpy.context.object
    obj.name, obj.scale = name, size
    return assign(obj, mat)

def tube(name, points, radius=.07, mat='blue', closed=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions, curve.resolution_u = '3D', 16
    curve.bevel_depth, curve.bevel_resolution = radius, 5
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for point, xyz in zip(spline.points, points):
        point.co = (*xyz, 1)
    spline.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat)
    if not closed:
        for point in (points[0], points[-1]):
            sphere(name + ' rounded end', point, (radius, radius, radius), mat)
    return obj

def lathe(name, center, profile, mat='white', axis='Z', bevel=0):
    """Solid of revolution from a closed radius/height profile, no texture."""
    n = 96
    verts = []
    for radius, height in profile:
        for i in range(n):
            theta = 2*math.pi*i/n
            p = (radius*math.cos(theta), radius*math.sin(theta), height)
            if axis == 'X':
                p = (p[2], p[0], p[1])
            verts.append(tuple(p[j]+center[j] for j in range(3)))
    faces = []
    for j in range(len(profile)):
        k = (j+1) % len(profile)
        for i in range(n):
            faces.append((j*n+i, j*n+(i+1)%n, k*n+(i+1)%n, k*n+i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    # Recalculate orientation, keeping the cross-section editable as a mesh.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.00001)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if bevel:
        mod = obj.modifiers.new('Soft turned rim', 'BEVEL')
        mod.width, mod.segments = bevel, 4
    return assign(obj, mat)

def cylinder(name, loc, radius, depth, mat='blue', axis='Z', bevel=.08):
    rotation = (0, math.pi/2, 0) if axis == 'X' else ((math.pi/2, 0, 0) if axis == 'Y' else (0, 0, 0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    mod = obj.modifiers.new('Rounded rim', 'BEVEL')
    mod.width, mod.segments = bevel, 6
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return assign(obj, mat)


def group_transform(before, center=(0,0,0), scale=1, angle=0):
    bpy.context.view_layer.update()
    matrix=Matrix.Translation(Vector(center)) @ Matrix.Rotation(math.radians(angle),4,'Y') @ Matrix.Scale(scale,4)
    for obj in set(bpy.context.scene.objects)-before:
        obj.matrix_world=matrix @ obj.matrix_world

def extruded(name, outline, center, depth, mat='white', bevel=.045):
    n=len(outline);x0,y0,z0=center
    verts=[(x+x0,y0+y,z+z0) for y in (-depth/2,depth/2) for x,z in outline]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    if bevel:
        mod=obj.modifiers.new('Soft object edge','BEVEL');mod.width=bevel;mod.segments=6
    obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return assign(obj,mat)

def ticket(center=(0,0,1.05),scale=1,angle=0,accent=True):
    before=set(bpy.context.scene.objects);outline=[]
    def arc(cx,cz,r,a,b,n=12):
        for i in range(n+1):
            t=a+(b-a)*i/n;outline.append((cx+r*math.cos(t),cz+r*math.sin(t)))
    arc(.72,-.47,.12,-math.pi/2,0)
    for i in range(25):
        a=-math.pi/2+math.pi*i/24;outline.append((.84-.145*math.cos(a),.145*math.sin(a)))
    arc(.72,.47,.12,0,math.pi/2);arc(-.72,.47,.12,math.pi/2,math.pi)
    for i in range(25):
        a=math.pi/2-math.pi*i/24;outline.append((-.84+.145*math.cos(a),.145*math.sin(a)))
    arc(-.72,-.47,.12,math.pi,3*math.pi/2)
    extruded('Queue ticket notched body',outline,(0,0,0),.22,'white',.028)
    rounded_cube('Ticket accent stripe',(-.20,-.129,.28),(.61,.035,.125),'blue' if accent else 'pale',.040)
    rounded_cube('Ticket quiet line',(-.24,-.129,-.03),(.53,.026,.07),'pale',.025)
    for z in (-.36,-.12,.12,.36):
        sphere('Ticket perforation',(.36,-.125,z),(.032,.015,.032),'pale')
    group_transform(before,center,scale,angle)

def clock_face(center=(0,0,1.05),radius=.72,alarm=False):
    before=set(bpy.context.scene.objects)
    cylinder('Clock rounded pale rim',(0,0,0),1,.34,'pale','Y',.09)
    cylinder('Clock soft white face',(0,-.197,0),.855,.10,'white','Y',.052)
    for x,z in [(0,.66),(.66,0),(0,-.66),(-.66,0)]:
        rounded_cube('Clock quiet hour marker',(x,-.258,z),(.056 if x==0 else .13,.025,.13 if x==0 else .056),'pale',.022)
    tube('Clock blue hour hand',[(0,-.287,0),(0,-.287,.46)],.055,'blue')
    tube('Clock blue minute hand',[(0,-.288,0),(.36,-.288,0)],.055,'blue')
    sphere('Clock small center',(0,-.30,0),(.088,.055,.088),'blue')
    if alarm:
        for s in (-1,1):
            bell=rounded_cube('Alarm rounded bell',(s*.66,.02,.90),(.64,.43,.37),'white',.16)
            bell.rotation_euler.y=s*math.radians(28)
            tube('Alarm short foot',[(s*.54,0,-.71),(s*.66,0,-1.04)],.09,'pale')
        rounded_cube('Alarm top button',(0,0,1.03),(.24,.24,.18),'blue',.065)
    group_transform(before,center,radius)


def gear(center=(.66,-.42,.54),scale=.55):
    """Editable eight-tooth rounded gear with an actual open center."""
    before=set(bpy.context.scene.objects)
    outline=[]
    # Four vertices per tooth make a broad crest and wide, readable valleys.
    for tooth in range(8):
        for f,r in [(-.5,.77),(-.29,1.0),(.29,1.0),(.5,.77)]:
            a=(tooth+f)*2*math.pi/8
            outline.append((r*math.cos(a),r*math.sin(a)))
    n=len(outline);depth=.28;inner=.33
    verts=[]
    for y in (-depth/2,depth/2):
        verts += [(x,y,z) for x,z in outline]
        verts += [(inner*math.cos(math.atan2(z,x)),y,inner*math.sin(math.atan2(z,x))) for x,z in outline]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),
                  (i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)]
    mesh=bpy.data.meshes.new('Eight tooth gear ring mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    obj=bpy.data.objects.new('Rounded eight tooth settings gear',mesh);bpy.context.collection.objects.link(obj)
    bevel=obj.modifiers.new('Soft rounded gear edges','BEVEL');bevel.width=.068;bevel.segments=6
    obj.modifiers.new('Gear weighted normals','WEIGHTED_NORMAL');assign(obj,'ink')
    group_transform(before,center,scale)

def edit_operation():
    clock_face((-.27,.08,1.23),.91)
    gear((.67,-.45,.55),.56)

def edit_identity():
    rounded_cube('Gallery card porcelain body',(-.16,.05,1.11),(1.94,.27,1.64),'white',.17)
    rounded_cube('Gallery pale inset',(-.16,-.107,1.14),(1.59,.040,1.19),'pale',.095)
    # Abstract photo placeholder only: a sun and two soft polygonal mountains.
    cylinder('Small gallery sun',(-.59,-.16,1.45),.13,.052,'white','Y',.030)
    extruded('Quiet gallery mountain',[(-.62,-.40),(-.08,.26),(.48,-.40)],(-.14,-.171,1.13),.055,'white',.045)
    extruded('Small blue gallery mountain',[(.02,-.40),(.42,.06),(.75,-.40)],(-.14,-.200,1.13),.050,'blue',.035)
    # A separate small pencil crosses the lower-right card corner.
    before=set(bpy.context.scene.objects)
    rounded_cube('Pencil pale shaft',(0,0,.12),(.23,.21,.87),'pale',.053)
    rounded_cube('Pencil blue eraser',(0,0,.65),(.25,.23,.20),'blue',.065)
    rounded_cube('Pencil white ferrule',(0,0,.49),(.25,.23,.115),'white',.033)
    extruded('Pencil soft white tip',[(-.115,-.315),(.115,-.315),(0,-.64)],(0,0,0),.21,'white',.024)
    extruded('Pencil neutral point',[(-.048,-.49),(.048,-.49),(0,-.64)],(0,-.009,0),.22,'ink',.012)
    group_transform(before,(.65,-.42,.62),.94,33)

def intake_paused():
    ticket((-.12,.10,1.18),1.22)
    # Neutral pause bars remain visually distinct from an off switch or failure cross.
    for x in (.41,.83):
        rounded_cube('Neutral temporary pause bar',(x,-.43,.57),(.21,.24,.72),'ink',.075)

def waiting_off():
    ticket((-.14,.10,1.21),1.22)
    # Off is represented conventionally by a neutral track and left-side knob.
    rounded_cube('Neutral disabled switch track',(.53,-.44,.56),(1.08,.24,.52),'ink',.25)
    cylinder('White switch knob in left off position',(.27,-.594,.56),.205,.12,'white','Y',.055)
def normalize():
    bpy.context.view_layer.update()
    objects = [o for o in bpy.context.scene.objects if o.type in {'MESH','CURVE'}]
    points = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    center = (lo+hi)/2
    scale = 2.35/max(hi.x-lo.x, hi.z-lo.z)
    for obj in objects:
        obj.location = Vector((0,0,1.05))+(obj.location-center)*scale
        obj.scale *= scale

def setup(name):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.eevee.taa_render_samples = args.samples
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.render.image_settings.compression = 60
    sc.world.color = (.3,.3,.3)
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = .35
    target = Vector((0,0,1.04))
    bpy.ops.object.camera_add(location=(3.2,-9,4.8))
    cam = bpy.context.object
    cam.name = 'Shared RESERVE orthographic camera'
    cam.rotation_euler = (target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type, cam.data.ortho_scale = 'ORTHO', 3.75
    sc.camera = cam
    for title,loc,power,size in [('Large soft key',(-3,-4,7),550,4.5),
                                ('Soft fill',(4,-2,4),350,4),
                                ('Edge separation',(1,4,5),650,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        light = bpy.context.object
        light.name = title
        light.data.energy, light.data.shape, light.data.size = power,'DISK',size
        light.rotation_euler = (target-light.location).to_track_quat('-Z','Y').to_euler()
    sc.render.threads_mode, sc.render.threads = 'FIXED',8
    sc['asset_id'] = name
    sc['design'] = 'Original editable RESERVE editing/status geometry, shared camera, lights and materials'
    sc['motion'] = 'Static only; no animation or CSS'
    sc['source_reference'] = 'RESERVE-state-illustrations-delivery.zip: shared modeling/render pipeline'

for name in args.names:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for datablock in list(bpy.data.materials):
        if datablock.users==0:bpy.data.materials.remove(datablock)
    M={key:material(key,h,metal,rough) for key,h,metal,rough in [
      ('white','f2f5fa',.05,.28),('pale','b8c9de',.08,.30),('blue','3182f6',.12,.25),('ink','8191a6',.04,.36)]}
    globals()[name.replace('-','_')]();normalize();setup(name)
    sc=bpy.context.scene
    sc['palette_note']='Original white #F2F5FA, pale #B8C9DE, small blue #3182F6; existing neutral ink #8191A6 for settings/status details.'
    sc['content_note']='No text, faces, photos, logos, background, decorative frame, or QR code. Static only.'
    for res in args.resolution:
        folder=ROOT/'static'/str(res);folder.mkdir(parents=True,exist_ok=True)
        sc.render.resolution_x=sc.render.resolution_y=res;sc.render.resolution_percentage=100
        sc.render.filepath=str(folder/f'{name}-{res}.png');bpy.ops.render.render(write_still=True)
        evidence={'asset':name,'file':f'static/{res}/{name}-{res}.png','resolution':[res,res],
          'render_percentage':100,'samples':args.samples,'engine':sc.render.engine,
          'blender_version':bpy.app.version_string,'native_render':True,'upscaled':False,'film_transparent':True}
        (ROOT/'source').mkdir(exist_ok=True)
        with (ROOT/'source'/'native-render-evidence.jsonl').open('a') as f:f.write(json.dumps(evidence)+'\n')
    sc.render.resolution_x=sc.render.resolution_y=768;sc.render.filepath=f'//../static/768/{name}-768.png'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source'/f'{name}.blend'),compress=True)
    print('ASSET_DONE',name,flush=True)
