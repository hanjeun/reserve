"""Rebuild six original RESERVE category scenes with Blender 4.3.2.

blender -b --python source/build_assets.py -- --resolution 512 768
All geometry is editable and procedural. No textures, linked assets or fonts.
Shared camera, lights, palette and shading match the delivered first 28 set.
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['food', 'beauty', 'sports', 'performance', 'popup', 'other']
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--names', nargs='+', choices=NAMES, default=NAMES)
parser.add_argument('--resolution', nargs='+', type=int, default=[512, 768])
parser.add_argument('--samples', type=int, default=128)
parser.add_argument('--output', type=Path, default=ROOT)
args = parser.parse_args(argv)
ROOT = args.output.resolve()
M = {}

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

def food():
    # Continuous thick-walled open cup, rounded lip and inner basin.
    profile = [(0,.37),(.42,.37),(.49,.39),(.54,.45),(.58,.57),
               (.65,1.37),(.655,1.49),(.64,1.54),(.61,1.565),(.575,1.55),
               (.558,1.51),(.55,1.4),(.485,.66),(.45,.57),(.37,.535),(0,.535)]
    lathe('Rounded hollow porcelain cup', (-.12,0,0), profile, 'white', bevel=.025)
    # Handle is behind the lip/body at the junction, with a readable blue loop.
    pts = [(.58+.40*math.cos(2*math.pi*i/80), .015, 1.02+.38*math.sin(2*math.pi*i/80)) for i in range(80)]
    tube('Rounded blue cup handle', pts, .105, 'blue', closed=True)
    saucer = [(0,.22),(.7,.22),(.94,.24),(1.02,.28),(1.03,.31),
              (1.0,.35),(.94,.365),(.75,.32),(.57,.295),(0,.295)]
    lathe('Small blue saucer', (0,0,0), saucer, 'blue', bevel=.018)

def beauty():
    rounded_cube('Rounded pump bottle body', (0,0,.94), (1.20,.77,1.61), 'white', .245)
    cylinder('Blue pump collar', (0,0,1.82), .29, .19, 'blue', bevel=.055)
    cylinder('Pale pump stem', (0,0,2.02), .10, .25, 'pale', bevel=.035)
    rounded_cube('Rounded blue pump head', (.12,-.015,2.20), (.83,.32,.20), 'blue', .085)
    # Integrated down-facing outlet makes the pump recognizable without a label.
    rounded_cube('Pump nozzle outlet', (.44,-.015,2.12), (.15,.28,.22), 'blue', .063)

def sports():
    cylinder('Pale dumbbell grip', (0,0,1.05), .155, 1.54, 'pale', 'X', .045)
    for side in (-1,1):
        cylinder('Blue inner weight', (side*.67,0,1.05), .55, .33, 'blue', 'X', .10)
        cylinder('Blue outer weight', (side*.94,0,1.05), .43, .23, 'blue', 'X', .09)
        cylinder('Pale dumbbell end cap', (side*1.075,0,1.05), .17, .06, 'pale', 'X', .025)
    # A quiet 12 degree tilt adds an active silhouette without a dynamic pose.
    pivot = Vector((0,0,1.05))
    transform = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(-12),4,'Y') @ Matrix.Translation(-pivot)
    for obj in list(bpy.context.scene.objects):
        obj.matrix_world = transform @ obj.matrix_world

def performance():
    # Rounded outline and semicircular ticket notches are built directly;
    # no Boolean dependency, no sharp card corners.
    outline = []
    def arc(cx, cz, radius, first, last, steps=16):
        for i in range(steps+1):
            a = first+(last-first)*i/steps
            outline.append((cx+radius*math.cos(a),cz+radius*math.sin(a)))
    arc(.855,-.57,.12,-math.pi/2,0)
    for i in range(25):
        t = -math.pi/2+math.pi*i/24
        outline.append((.975-.18*math.cos(t),.18*math.sin(t)))
    arc(.855,.57,.12,0,math.pi/2)
    arc(-.855,.57,.12,math.pi/2,math.pi)
    for i in range(25):
        t = math.pi/2-math.pi*i/24
        outline.append((-.975+.18*math.cos(t),.18*math.sin(t)))
    arc(-.855,-.57,.12,math.pi,3*math.pi/2)
    n = len(outline)
    verts = [(x-.19,y,z+1.13) for y in (-.09,.19) for x,z in outline]
    faces = [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh = bpy.data.meshes.new('Ticket rounded notched outline')
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    ticket = bpy.data.objects.new('Rounded admission ticket',mesh)
    bpy.context.collection.objects.link(ticket)
    bevel = ticket.modifiers.new('Soft ticket edges','BEVEL')
    bevel.width, bevel.segments = .035,4
    ticket.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    assign(ticket,'white')
    # Thin card inset and sparse perforation remain visible at small sizes.
    rounded_cube('Blue ticket stripe', (-.39,-.118,1.45), (.94,.04,.18), 'blue', .065)
    for z in (.66,.90,1.14,1.38,1.62):
        sphere('Ticket perforation', (.37,-.116,z), (.033,.015,.035), 'pale')
    # One small extruded eighth note, in front of the lower right ticket corner.
    sphere('Blue note head', (.60,-.43,.57), (.23,.095,.17), 'blue')
    rounded_cube('Blue note stem', (.765,-.43,.93), (.125,.17,.76), 'blue', .06)
    tube('Blue note flag',[(.765,-.43,1.285),(.95,-.43,1.21),(1.01,-.43,1.08)],.085,'blue')

def popup():
    rounded_cube('Popup shop shell',(0,.15,1.0),(1.9,.75,1.45),'white',.18)
    rounded_cube('Empty shop window',(0,-.26,.99),(1.47,.09,.76),'pale',.12)
    rounded_cube('Small shop sill',(0,-.42,.63),(1.60,.32,.12),'white',.06)
    rounded_cube('Window divider',(.30,-.322,1.0),(.065,.05,.70),'white',.025)
    rounded_cube('Blue awning canopy',(0,0,1.89),(2.16,1.05,.30),'blue',.15)
    for x in (-.76,-.38,0,.38,.76):
        rounded_cube('Rounded awning scallop',(x,-.49,1.67),(.34,.33,.39),
                     'blue' if abs(x)<.01 or abs(x)>.6 else 'white',.14)

def other():
    rounded_cube('Rounded calendar',(-.15,0,1.04),(1.8,.33,1.7),'white',.18)
    rounded_cube('Blue calendar header',(-.15,-.19,1.63),(1.55,.07,.29),'blue',.075)
    for x in (-.7,.4):
        tube('Pale calendar binding',[(x,-.22,1.66),(x,-.22,1.98),(x,.03,1.98)],.075,'pale')
    for x in (-.65,-.15,.35):
        for z in (.63,1.03):
            rounded_cube('Blank rounded calendar cell',(x,-.19,z),(.28,.045,.22),'pale',.055)

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
    sc['design'] = 'Original procedural category geometry; first RESERVE set shared style'
    sc['motion'] = 'CSS only: 1.4 s entrance and optional 2.4 s repeating subtle motion'
    sc['source_reference'] = 'RESERVE-state-illustrations-delivery.zip: shared modeling/render pipeline'

for name in args.names:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablock in list(bpy.data.materials):
        if datablock.users == 0:
            bpy.data.materials.remove(datablock)
    # These are exactly the first delivered set's three neutral/blue materials.
    M = {name:material(name,h,metal,rough) for name,h,metal,rough in
         [('white','f2f5fa',.05,.28),('pale','b8c9de',.08,.30),('blue','3182f6',.12,.25)]}
    globals()[name]()
    normalize()
    setup(name)
    sc = bpy.context.scene
    for res in args.resolution:
        folder = ROOT/'static'/str(res)
        folder.mkdir(parents=True,exist_ok=True)
        sc.render.resolution_x = sc.render.resolution_y = res
        sc.render.resolution_percentage = 100
        sc.render.filepath = str(folder/f'{name}-{res}.png')
        bpy.ops.render.render(write_still=True)
        evidence = {'asset':name,'file':f'static/{res}/{name}-{res}.png',
                    'resolution':[res,res], 'render_percentage':100,
                    'samples':args.samples,'engine':sc.render.engine,
                    'blender_version':bpy.app.version_string,
                    'native_render':True,'upscaled':False,'film_transparent':True}
        (ROOT/'source').mkdir(exist_ok=True)
        with (ROOT/'source'/'native-render-evidence.jsonl').open('a') as stream:
            stream.write(json.dumps(evidence)+'\n')
    sc.render.resolution_x = sc.render.resolution_y = 768
    sc.render.filepath = f'//../static/768/{name}-768.png'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source'/f'{name}.blend'),compress=True)
    print('ASSET_DONE',name,flush=True)
