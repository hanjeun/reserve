"""Rounded geometry, materials and camera adapted from the delivered RESERVE state assets (MIT)."""
import bpy, math
from mathutils import Vector
from types import SimpleNamespace
M = {}
a = SimpleNamespace(engine="BLENDER_EEVEE_NEXT", samples=128)
def mat(name,h,metal=0,rough=.28):
 m=bpy.data.materials.new(name);m.diffuse_color=(*[((int(h[i:i+2],16)/255+.055)/1.055)**2.4 if int(h[i:i+2],16)/255>.04045 else int(h[i:i+2],16)/255/12.92 for i in (0,2,4)],1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m

def assign(o,m,group):
 o.data.materials.append(M[m]);o['layer']=group
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=True
 return o

def cube(name,loc,scale,m='white',bevel=.15,group='body'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);b=o.modifiers.new('Soft continuous edges','BEVEL');b.width=bevel;b.segments=6;b.affect='EDGES';o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');return assign(o,m,group)

def ball(name,loc,scale,m='blue',group='accent'):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;return assign(o,m,group)

def line(name,points,r=.07,m='blue',group='accent'):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=r;c.bevel_resolution=5;s=c.splines.new('POLY');s.points.add(len(points)-1)
 for p,v in zip(s.points,points):p.co=(*v,1)
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);assign(o,m,group)
 for v in (points[0],points[-1]):ball(name+' rounded end',v,(r,r,r),m,group)
 return o

def circle(name,loc,r,m='blue',thick=.07,group='accent',start=0,end=2*math.pi):
 x,y,z=loc
 if abs((end-start)-2*math.pi)<1e-6:
  c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=thick;c.bevel_resolution=5
  sp=c.splines.new('POLY');sp.points.add(63)
  for i,p in enumerate(sp.points):
   t=start+2*math.pi*i/64;p.co=(x+r*math.cos(t),y,z+r*math.sin(t),1)
  sp.use_cyclic_u=True
  o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);return assign(o,m,group)
 return line(name,[(x+r*math.cos(t),y,z+r*math.sin(t)) for t in [start+(end-start)*i/64 for i in range(65)]],thick,m,group)

def disk(name,loc,r=.5,depth=.17,m='blue',group='accent'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=r,depth=depth,location=loc,rotation=(math.pi/2,0,0));o=bpy.context.object;o.name=name;b=o.modifiers.new('Rounded rim','BEVEL');b.width=.055;b.segments=4;o.modifiers.new('Normals','WEIGHTED_NORMAL');return assign(o,m,group)

def shape(name,pts,m,g='accent',depth=.14,bev=.05):
 n=len(pts);verts=[(x,y-depth/2,z) for x,y,z in pts]+[(x,y+depth/2,z) for x,y,z in pts]
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
 for other in bpy.context.selected_objects:
  if other!=o:other.select_set(False)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
 rem=o.modifiers.new('Watertight soft silhouette','REMESH');rem.mode='VOXEL';rem.voxel_size=.018;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
 sm=o.modifiers.new('Rounded silhouette smoothing','SMOOTH');sm.factor=1;sm.iterations=8;bpy.ops.object.modifier_apply(modifier=sm.name)
 sub=o.modifiers.new('Polished smooth surface','SUBSURF');sub.levels=1;sub.render_levels=1
 return assign(o,m,g)

def normalize_geometry():
 bpy.context.view_layer.update()
 objects=[o for o in bpy.context.scene.objects if o.type in ['MESH','CURVE']]
 points=[o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
 lo=Vector([min(v[i] for v in points) for i in range(3)]);hi=Vector([max(v[i] for v in points) for i in range(3)])
 center=(lo+hi)/2;factor=2.35/max(hi.x-lo.x,hi.z-lo.z)
 for o in objects:
  o.location=Vector((0,0,1.05))+(o.location-center)*factor;o.scale*=factor

def setup(name):
 sc=bpy.context.scene;sc.render.engine=a.engine;sc.cycles.samples=a.samples;sc.cycles.use_denoising=False;sc.cycles.use_adaptive_sampling=True;sc.cycles.adaptive_threshold=.006;sc.cycles.max_bounces=6;sc.eevee.taa_render_samples=a.samples
 sc.render.film_transparent=True;sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.image_settings.color_depth='8';sc.render.image_settings.compression=60
 sc.world.color=(.3,.3,.3);sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=.35
 bpy.ops.object.camera_add(location=(3.2,-9,4.8));cam=bpy.context.object;cam.name='Shared orthographic camera';target=Vector((0,0,1.04));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.75;sc.camera=cam
 for title,loc,power,size in [('Large soft key',(-3,-4,7),550,4.5),('Soft fill',(4,-2,4),350,4),('Edge separation',(1,4,5),650,3)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=title;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
 sc['asset_id']=name;sc['design']='Original rounded geometry; no external assets';sc.render.threads_mode='FIXED';sc.render.threads=8
