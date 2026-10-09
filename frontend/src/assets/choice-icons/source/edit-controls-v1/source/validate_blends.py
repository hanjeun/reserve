"""Inspect editable scenes and reproduce 512px PNGs into a separate QA folder.
blender --factory-startup -b --python source/validate_blends.py -- --output /tmp/reserve-control-check
No scene is saved or modified on disk by this checker.
"""
import bpy,json,sys,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NAMES=['edit-operation','edit-identity','intake-paused','waiting-off']
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--reference',type=Path)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
args.output.mkdir(parents=True,exist_ok=True)
def scene_style():
 s=bpy.context.scene
 return {'camera':{'location':list(s.camera.location),'rotation':list(s.camera.rotation_euler),'type':s.camera.data.type,'ortho_scale':s.camera.data.ortho_scale},
 'lights':sorted([{'name':o.name,'location':list(o.location),'rotation':list(o.rotation_euler),'energy':o.data.energy,'shape':o.data.shape,'size':o.data.size} for o in s.objects if o.type=='LIGHT'],key=lambda x:x['name']),
 'world_color':list(s.world.color),'view_transform':s.view_settings.view_transform,'look':s.view_settings.look,'exposure':s.view_settings.exposure,'gamma':s.view_settings.gamma,
 'materials':{m.name:{'base_color':list(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value),'metallic':m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value} for m in bpy.data.materials if m.use_nodes and m.node_tree.nodes.get('Principled BSDF') and m.users}}
reference=None
if args.reference:
 bpy.ops.wm.open_mainfile(filepath=str(args.reference));reference=scene_style()
results=[]
for name in NAMES:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'source'/f'{name}.blend'))
 s=bpy.context.scene;style=scene_style()
 assert bpy.app.version_string=='4.3.2'
 assert s.render.engine=='BLENDER_EEVEE_NEXT' and s.eevee.taa_render_samples==128
 assert s.render.film_transparent and s.render.image_settings.color_mode=='RGBA' and s.render.image_settings.color_depth=='8'
 assert s.render.resolution_x==s.render.resolution_y==768
 assert not bpy.data.actions and not bpy.data.libraries
 assert not any(o.type=='FONT' for o in s.objects)
 assert not any(o.animation_data for o in s.objects)
 assert not [i for i in bpy.data.images if i.source=='FILE' and i.users]
 if reference:
  for k in ['camera','lights','world_color','view_transform','look','exposure','gamma']:assert style[k]==reference[k],(name,k,style[k],reference[k])
  for m in ['white','pale','blue','ink']:
   if m in style['materials']:assert style['materials'][m]==reference['materials'][m],(name,m)
 result={'asset':name,'blender_version':bpy.app.version_string,'engine':s.render.engine,'samples':s.eevee.taa_render_samples,'mesh_objects':sum(o.type=='MESH' for o in s.objects),'curve_objects':sum(o.type=='CURVE' for o in s.objects),'external_images':0,'linked_libraries':0,'animations':0,'text_objects':0,'static_only':True,'style_matches_reference_exactly':bool(reference),'style':style}
 s.render.resolution_x=s.render.resolution_y=512;s.render.filepath=str(args.output/f'{name}-512.png')
 bpy.ops.render.render(write_still=True)
 result['roundtrip_png']=f'{name}-512.png';results.append(result)
 (args.output/'blend-validation.json').write_text(json.dumps(results,indent=2)+'\n')
 print('VALIDATED',name,flush=True)
