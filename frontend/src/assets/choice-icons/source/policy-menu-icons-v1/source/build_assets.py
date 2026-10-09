"""Rebuild only three new RESERVE policy/deposit/refund icons, using Blender 4.3.2.
blender --factory-startup -b --python source/build_assets.py -- --resolution 512 768
Native independent renders. No stock assets, textures, raster inputs or fonts.
Shared geometry helpers, materials, normalization, camera, lighting and color
management continue the original RESERVE category / extra-icon pipeline.
Copyright (c) 2026 RESERVE asset-kit contributors. MIT, see LICENSE-CODE.txt.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector,Matrix
NAMES=['edit-booking-policy','edit-deposit','edit-refund']
parser=argparse.ArgumentParser()
parser.add_argument('--names',nargs='+',choices=NAMES,default=NAMES)
parser.add_argument('--resolution',nargs='+',type=int,default=[512,768])
parser.add_argument('--samples',type=int,default=128)
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1])
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
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

def coin(name, center, radius=.43, depth=.13):
    """One text-free solid coin with a single shallow rounded rim."""
    x,y,z=center
    cylinder(name+' single coin body',(x,y,z),radius,depth,'pale','Y',.038)
    cylinder(name+' shallow white face',(x,y-depth/2-.011,z),radius-.052,.026,'white','Y',.014)

def edit_booking_policy():
    rounded_cube('Policy vertical rounded clipboard backing',(0,.055,1.08),(1.52,.23,2.04),'pale',.15)
    rounded_cube('Policy white writing sheet',(0,-.085,1.06),(1.34,.075,1.81),'white',.085)
    rounded_cube('Policy top rounded clip',(0,-.111,2.08),(.68,.20,.27),'pale',.072)
    rounded_cube('Policy quiet clip inset',(0,-.226,2.075),(.36,.022,.078),'white',.026)
    for i,z in enumerate((1.57,1.12,.67),1):
        tube(f'Policy row {i} small blue check',[(-.49,-.158,z),(-.395,-.158,z-.088),(-.245,-.158,z+.105)],.048,'blue')
        rounded_cube(f'Policy row {i} neutral line',(.225,-.144,z),(.57,.048,.083),'pale',.033)

def edit_deposit():
    rounded_cube('Deposit horizontal wallet rear shell',(0,.09,.88),(2.08,.35,1.26),'pale',.18)
    # The sole coin is physically partly occluded by the front wallet body.
    coin('Deposit',(-.37,.022,1.59),.43,.13)
    rounded_cube('Deposit horizontal white wallet front',(0,-.175,.80),(2.13,.29,1.18),'white',.17)
    rounded_cube('Deposit small blue clasp',(.79,-.359,.94),(.45,.13,.32),'blue',.085)
    cylinder('Deposit quiet clasp fastener',(.76,-.434,.94),.043,.016,'white','Y',.01)

def continuous_shaft(name, points, radius=.125):
    """One smooth mesh with a hemispherical top cap and no overlapping balls."""
    pts=[Vector(p) for p in points]
    axis=(pts[1]-pts[0]).normalized()
    rings=[]
    # Hemisphere of the upper free endpoint, including the pole.
    for i in range(13):
        a=(math.pi/2)*i/12
        rings.append((pts[0]-axis*radius*math.cos(a),axis,radius*math.sin(a)))
    for i,p in enumerate(pts[1:],1):
        t=(pts[min(i+1,len(pts)-1)]-pts[i-1]).normalized()
        rings.append((p,t,radius))
    sides=64;verts=[]
    for p,t,r in rings:
        n=Vector((-t.z,0,t.x))
        for i in range(sides):
            a=2*math.pi*i/sides
            verts.append(tuple(p+Vector((0,1,0))*r*math.cos(a)+n*r*math.sin(a)))
    faces=[]
    for j in range(len(rings)-1):
        for i in range(sides):
            faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
    faces.append(tuple(range((len(rings)-1)*sides,len(rings)*sides)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    return assign(obj,'pale')

def edit_refund():
    coin('Refund',(-.03,.015,1.64),.49,.15)
    # One open bent return arrow: a short right stem, quarter-round bend,
    # and a horizontal shaft pointing left. It does not encircle the coin.
    points=[(.69,-.03,1.03),(.69,-.03,.70)]
    for i in range(1,25):
        a=-math.pi*i/48
        points.append((.43+.26*math.cos(a),-.03,.70+.26*math.sin(a)))
    points.append((-.48,-.03,.44))
    continuous_shaft('Refund rounded open return shaft',points,.125)
    extruded('Refund small blue left arrowhead',[(-.91,.44),(-.44,.78),(-.44,.10)],(0,-.03,0),.28,'blue',.047)

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
    sc['design'] = 'Original procedural policy/deposit/refund geometry; unchanged RESERVE shared style'
    sc['motion'] = 'Static only; no animation or drivers'
    sc['source_reference'] = 'RESERVE-state-illustrations-delivery.zip: shared modeling/render pipeline'

(ROOT/'source').mkdir(parents=True,exist_ok=True)
evidence=ROOT/'source'/'native-render-evidence.jsonl'
previous=[json.loads(line) for line in evidence.read_text().splitlines()] if evidence.exists() else []
evidence.write_text(''.join(json.dumps(row)+'\n' for row in previous if row['asset'] not in args.names))
for name in args.names:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for material_block in list(bpy.data.materials):
        if material_block.users==0:bpy.data.materials.remove(material_block)
    M={key:material(key,h,metal,rough) for key,h,metal,rough in [
      ('white','f2f5fa',.05,.28),('pale','b8c9de',.08,.30),
      ('blue','3182f6',.12,.25),('ink','8191a6',.04,.36)]}
    globals()[name.replace('-','_')]();normalize();setup(name)
    sc=bpy.context.scene
    sc['palette_note']='Only shared neutral #F2F5FA #B8C9DE #8191A6 and small blue #3182F6 accents'
    sc['provenance']='Original code-native procedural modeling; no images, textures, stock models, fonts, external libraries or image generation.'
    sc['semantic_state']={'edit-booking-policy':'Booking policy: vertical clipboard with three blue check rows','edit-deposit':'Deposit: horizontal wallet with one coin partly inserted and a small blue clasp','edit-refund':'Refund: one coin above an open rounded leftward bent return arrow'}[name]
    (ROOT/'source').mkdir(parents=True,exist_ok=True)
    for res in args.resolution:
        folder=ROOT/'static'/str(res);folder.mkdir(parents=True,exist_ok=True)
        sc.render.resolution_x=sc.render.resolution_y=res;sc.render.resolution_percentage=100
        sc.render.filepath=str(folder/f'{name}-{res}.png')
        bpy.ops.render.render(write_still=True)
        record={'asset':name,'file':f'static/{res}/{name}-{res}.png','resolution':[res,res],
          'render_percentage':100,'samples':args.samples,'engine':sc.render.engine,
          'blender_version':bpy.app.version_string,'native_render':True,'upscaled':False,'film_transparent':True}
        with (ROOT/'source'/'native-render-evidence.jsonl').open('a') as f:f.write(json.dumps(record)+'\n')
    sc.render.resolution_x=sc.render.resolution_y=768
    sc.render.filepath=f'//../static/768/{name}-768.png'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source'/f'{name}.blend'),compress=True)
    print('ASSET_DONE',name,flush=True)
