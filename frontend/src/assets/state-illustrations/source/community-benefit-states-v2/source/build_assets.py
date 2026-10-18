"""Rebuild six editable RESERVE community/benefit states with Blender 4.3.2.
blender --factory-startup -b --python source/build_assets.py -- --resolution 512 768
No texture, stock model, font, linked library, or raster input is required.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[1]
NAMES = ['empty-feed','empty-comment','draft-transfer','draft-conflict','benefit-review-pending','benefit-review-rejected']
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


def card(name,x,z,w=1.35,h=1.7,y=0,mat='white'):
    return rounded_cube(name,(x,y,z),(w,.20,h),mat,.13)
def bar(name,x,z,w=.6,mat='pale',y=-.13):
    return rounded_cube(name,(x,y,z),(w,.055,.105),mat,.045)
def document(name,x,z,y=0,variant=0):
    card(name,x,z,1.05,1.45,y)
    bar(name+' heading',x-.10,z+.43,.48,'pale',y-.13)
    bar(name+' content a',x,z+.13,.68,'pale',y-.13)
    bar(name+' content b',x+(.12 if variant else -.12),z-.14,.43,'blue' if variant else 'ink',y-.13)
def arrow(name,pts,r=.07,mat='blue'):
    tube(name,pts,r,mat)
    a=Vector(pts[-2]); b=Vector(pts[-1]); v=(b-a).normalized(); normal=Vector((-v.z,0,v.x))
    for s in [-1,1]:
        tip=b-v*.25+normal*s*.19
        tube(name+' soft arrowhead',[tuple(tip),tuple(b)],r,mat)
def empty_feed():
    card('Post card',0,1.05,1.85,2.04)
    rounded_cube('Small empty photo inset',(-.20,-.126,1.30),(1.04,.055,.82),'pale',.10)
    # Physical embossed landscape geometry, not an image texture.
    extruded('Quiet photo mountain',[(-.37,-.20),(-.08,.19),(.11,-.04),(.25,.10),(.43,-.20)],(-.20,-.177,1.30),.027,'white',.025)
    sphere('Photo blue sun',(.09,-.192,1.53),(.09,.025,.09),'blue')
    bar('Post lower line',-.25,.56,.91)
    bar('Post lower short line',-.43,.34,.55,'pale')
def bubble(name,x,z,w,h,y,mat):
    rounded_cube(name,(x,y,z),(w,.25,h),mat,.22)
    extruded(name+' reply tail',[(-.20,0),(.14,0),(-.20,-.30)],(x-.28,y,z-h*.35),.20,mat,.065)
def empty_comment():
    bubble('Primary comment',-.25,1.43,1.85,.95,.12,'white')
    bubble('Indented reply',.40,.65,1.30,.70,-.18,'pale')
    # Small indentation connector emphasizes comments rather than a messenger inbox.
    tube('Thread indentation connector',[(-.83,-.08,.85),(-.83,-.08,.53),(-.43,-.08,.53)],.055,'blue')
def draft_transfer():
    document('Previous draft',-.73,1.10,.16)
    document('New app draft',.79,.93,-.02,1)
    arrow('Single direction transfer',[(-.36,-.36,1.13),(.42,-.36,1.13)],.075)
def draft_conflict():
    document('Saved draft',-.73,1.05,.05)
    document('Latest information',.73,1.05,.05,1)
    # Geometric unequal comparison mark, not a chart, warning or failure badge.
    tube('Comparison upper bar',[(-.34,-.40,.91),(.34,-.40,.91)],.063,'ink')
    tube('Comparison lower bar',[(-.34,-.40,.56),(.34,-.40,.56)],.063,'ink')
    tube('Comparison difference stroke',[(-.17,-.47,.39),(.17,-.47,1.09)],.060,'blue')
def benefit_card():
    card('Benefit information card',-.15,1.07,1.80,1.73)
    # Gift relief denotes a benefit; no coupon cutouts or payment currency.
    rounded_cube('Gift box',(-.46,-.17,1.34),(.61,.11,.48),'pale',.075)
    rounded_cube('Gift lid',(-.46,-.20,1.61),(.72,.12,.14),'pale',.055)
    rounded_cube('Gift narrow ribbon',(-.46,-.244,1.36),(.10,.035,.55),'white',.025)
    for sign in [-1,1]:
        pts=[]
        for i in range(25):
            a=2*math.pi*i/24;pts.append((-.46+sign*.14+.14*math.cos(a),-.22,1.77+.095*math.sin(a)))
        tube('Gift bow',pts,.035,'pale',True)
    bar('Benefit information line',-.36,.89,.78)
    bar('Benefit information short line',-.51,.66,.49)
def benefit_review_pending():
    benefit_card()
    # Magnifying glass: inspection, without clock, payment or completion tick.
    pts=[(.64+.32*math.cos(t*2*math.pi/64),-.40,.83+.32*math.sin(t*2*math.pi/64)) for t in range(65)]
    tube('Review magnifier rim',pts,.072,'ink',True)
    tube('Review magnifier handle',[(.84,-.40,.59),(1.06,-.40,.34)],.10,'blue')
def benefit_review_rejected():
    benefit_card()
    # Bent return-to-edit arrow, not a warning, circular refresh or failure cross.
    arrow('Return for revision',[(.76,-.39,1.14),(.94,-.39,1.06),(.94,-.39,.63),(.36,-.39,.63)],.067,'blue')
    tube('Editing pencil body',[(.42,-.48,.16),(.83,-.48,.50)],.102,'pale')
    extruded('Editing pencil tip',[(-.096,0),(.096,0),(0,-.204)],(.37,-.48,.15),.144,'ink',.02)

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
    sc['design'] = 'Original procedural extra-icon geometry; recent six-category RESERVE shared style'
    sc['motion'] = 'Static only; no animation'
    sc['source_reference'] = 'RESERVE-state-illustrations-delivery.zip: shared modeling/render pipeline'

for name in args.names:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for datablock in list(bpy.data.materials):
        if datablock.users==0:bpy.data.materials.remove(datablock)
    M={key:material(key,h,metal,rough) for key,h,metal,rough in [
      ('white','f2f5fa',.05,.28),('pale','b8c9de',.08,.30),('blue','3182f6',.12,.25),
      ('gold','e9bc55',.05,.34),('coral','ed7177',.03,.35),('ink','8191a6',.04,.36)]}
    globals()[name.replace('-','_')]();normalize();setup(name)
    sc=bpy.context.scene
    sc['palette_note']='White and pale dominate; blue only accents.'
    sc['external_assets']='None: mesh and curve geometry only; no images/fonts/linked libraries.'
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
