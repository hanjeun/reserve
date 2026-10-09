"""Rebuild only three new RESERVE camera/browser states, using Blender 4.3.2.
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
NAMES=['camera-denied','camera-unavailable','browser-unsupported']
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

def camera_body():
    rounded_cube('Camera rounded porcelain body',(-.12,.04,1.07),(1.97,.48,1.30),'white',.20)
    rounded_cube('Camera top viewfinder hump',(-.33,.035,1.78),(.69,.42,.27),'white',.11)
    rounded_cube('Camera small blue shutter',(.56,.025,1.76),(.25,.28,.12),'blue',.047)
    cylinder('Camera quiet outer lens rim',(-.26,-.259,1.10),.53,.18,'pale','Y',.065)
    cylinder('Camera porcelain lens ring',(-.26,-.367,1.10),.417,.09,'white','Y',.043)
    cylinder('Camera neutral lens glass',(-.26,-.426,1.10),.31,.052,'ink','Y',.030)
    # No reflective/specular enhancement is added to these shared materials.
    rounded_cube('Camera small quiet viewfinder',(.56,-.213,1.44),(.25,.030,.15),'pale',.043)

def camera_denied():
    camera_body()
    # Standalone padlock silhouette, deliberately unlike a circular QR badge.
    cx=.69;y=-.57
    points=[(cx-.19,y,.64)]
    for i in range(25):
        a=math.pi-math.pi*i/24
        points.append((cx+.19*math.cos(a),y,.80+.19*math.sin(a)))
    points.append((cx+.19,y,.64))
    tube('Permission lock neutral rounded shackle',points,.078,'ink')
    rounded_cube('Permission lock pale rounded body',(cx,y-.012,.57),(.65,.24,.51),'pale',.095)
    cylinder('Permission lock tiny blue keyhole',(cx,y-.151,.605),.063,.022,'blue','Y',.010)
    rounded_cube('Permission lock keyhole stem',(cx,y-.165,.52),(.070,.028,.125),'blue',.026)

def camera_unavailable():
    camera_body()
    # A neutral physical camera-off stroke cuts through the lens, no lock/X/QR.
    # The light separator is real geometry and keeps the mark legible on glass.
    tube('Unavailable stroke light separation',[(-.87,-.536,1.70),(.66,-.536,.40)],.118,'white')
    tube('Unavailable diagonal neutral stroke',[(-.87,-.664,1.70),(.66,-.664,.40)],.082,'ink')

def browser_unsupported():
    rounded_cube('Browser rounded porcelain window',(0,.02,1.12),(2.21,.35,1.70),'white',.17)
    rounded_cube('Browser quiet inset content',(0,-.174,.94),(1.87,.040,1.05),'pale',.10)
    rounded_cube('Browser light empty page',(0,-.201,.94),(1.70,.026,.89),'white',.055)
    # Three quiet dots identify a generic browser without copying a brand/logo.
    for x in (-.78,-.56,-.34):
        sphere('Browser neutral window control',(x,-.174,1.68),(.055,.028,.055),'ink')
    rounded_cube('Browser small blue tab indicator',(.54,-.180,1.68),(.42,.030,.065),'blue',.025)
    # Open restriction ring plus diagonal bar, separate from camera-off stroke.
    cx=.63;cz=.52;y=-.42
    cylinder('Unsupported quiet badge base',(cx,y,cz),.40,.13,'white','Y',.047)
    points=[(cx+.288*math.cos(2*math.pi*i/80),y-.094,cz+.288*math.sin(2*math.pi*i/80)) for i in range(80)]
    tube('Unsupported neutral restriction ring',points,.057,'ink',True)
    tube('Unsupported restriction diagonal',[(cx-.20,y-.116,cz-.20),(cx+.20,y-.116,cz+.20)],.057,'ink')

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
    sc['design'] = 'Original procedural camera/browser state geometry; unchanged RESERVE shared style'
    sc['motion'] = 'Static only; no animation or drivers'
    sc['source_reference'] = 'RESERVE-state-illustrations-delivery.zip: shared modeling/render pipeline'

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
    sc['semantic_state']={'camera-denied':'Camera permission blocked: padlock','camera-unavailable':'Camera missing, busy or failed to start: camera-off stroke','browser-unsupported':'Unsupported browser: generic browser window plus neutral restriction mark'}[name]
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
