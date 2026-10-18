"""Reopen six saved scenes and render both native sizes. No external asset inputs."""
import bpy,json,sys,pathlib
from PIL import Image,ImageChops
R=pathlib.Path(__file__).resolve().parents[1]
rows=[]
settings=[]
names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if names and (R/'qa'/'delivered-scene-settings.json').exists(): settings=[r for r in json.loads((R/'qa'/'delivered-scene-settings.json').read_text()) if r['asset'] not in names]
if names and (R/'qa'/'saved-scene-roundtrip.json').exists(): rows=[r for r in json.loads((R/'qa'/'saved-scene-roundtrip.json').read_text()) if r['asset'] not in names]
for p in sorted((R/'source').glob('*.blend')):
 if names and p.stem not in names: continue
 bpy.ops.wm.open_mainfile(filepath=str(p));s=bpy.context.scene
 assert not bpy.data.libraries
 assert not [i for i in bpy.data.images if i.source=='FILE']
 assert not [o for o in s.objects if o.type=='FONT']
 assert not s.animation_data
 settings.append(dict(asset=p.stem,engine=s.render.engine,samples=s.eevee.taa_render_samples,transparent=s.render.film_transparent,camera_location=list(s.camera.location),camera_rotation=list(s.camera.rotation_euler),ortho_scale=s.camera.data.ortho_scale,view=s.view_settings.view_transform,look=s.view_settings.look,exposure=s.view_settings.exposure,gamma=s.view_settings.gamma,objects=len(s.objects),mesh_objects=sum(o.type=='MESH' for o in s.objects),curve_objects=sum(o.type=='CURVE' for o in s.objects),lights=[dict(location=list(o.location),energy=o.data.energy,size=o.data.size) for o in s.objects if o.type=='LIGHT'],materials=[dict(name=m.name,color=list(m.diffuse_color),metallic=m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,roughness=m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value) for m in bpy.data.materials if m.use_nodes and m.node_tree.nodes.get('Principled BSDF')]))
 (R/'qa'/'delivered-scene-settings.json').write_text(json.dumps(settings,indent=2))
 for size in [512,768]:
  s.render.resolution_x=s.render.resolution_y=size;s.render.resolution_percentage=100
  dst=R/'qa'/'roundtrip'/f'{p.stem}-{size}.png';dst.parent.mkdir(exist_ok=True)
  s.render.filepath=str(dst);bpy.ops.render.render(write_still=True)
  a=Image.open(dst).convert('RGBA');b=Image.open(R/'static'/str(size)/dst.name).convert('RGBA')
  exact=a.tobytes()==b.tobytes()
  import numpy as np
  d=np.abs(np.array(a).astype(int)-np.array(b).astype(int))
  rows.append(dict(asset=p.stem,resolution=size,reopened=True,rendered=True,rgba_pixel_identical=exact,max_channel_difference=int(d.max()),mean_channel_difference=float(d.mean()),alpha_identical=a.getchannel('A').tobytes()==b.getchannel('A').tobytes(),external_images=0,linked_libraries=0,font_objects=0))
  (R/'qa'/'saved-scene-roundtrip.json').write_text(json.dumps(rows,indent=2))
print('ROUNDTRIP_DONE',len(rows))
