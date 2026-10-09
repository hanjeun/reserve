"""Reopen delivered .blend files; audit shared settings and rerender each at 512px.
Run: blender --factory-startup -b --python source/validate_blends.py
Copyright (c) 2026 RESERVE asset-kit contributors. MIT.
"""
import bpy,json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'reserve-camera-browser-work'/'roundtrip';OUT.mkdir(parents=True,exist_ok=True)
NAMES=['camera-denied','camera-unavailable','browser-unsupported']
def snapshot():
 sc=bpy.context.scene
 return {'engine':sc.render.engine,'samples':sc.eevee.taa_render_samples,'transparent':sc.render.film_transparent,
 'color_mode':sc.render.image_settings.color_mode,'color_depth':sc.render.image_settings.color_depth,
 'view_transform':sc.view_settings.view_transform,'look':sc.view_settings.look,'exposure':sc.view_settings.exposure,'gamma':sc.view_settings.gamma,
 'display':sc.display_settings.display_device,'view_settings_view':sc.view_settings.view_transform,
 'world_color':list(sc.world.color),'world_use_nodes':sc.world.use_nodes,
 'camera':{'location':list(sc.camera.location),'rotation':list(sc.camera.rotation_euler),'type':sc.camera.data.type,'ortho_scale':sc.camera.data.ortho_scale},
 'lights':{o.name:{'location':list(o.location),'rotation':list(o.rotation_euler),'energy':o.data.energy,'shape':o.data.shape,'size':o.data.size,'type':o.data.type} for o in sc.objects if o.type=='LIGHT'},
 'materials':{m.get('source_srgb'):{'source_srgb':m.get('source_srgb'),'base_color':list(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value),'metallic':m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value,'roughness':m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value} for m in bpy.data.materials if m.use_nodes and m.get('source_srgb')}}
# The shared source copy is not needed to rerender or edit a delivered blend.
# Compare audited settings to an existing local same-pipeline .blend read-only.
reference=ROOT.parent/'reserve-extra-icons-13'/'source'/'waiting-onsite.blend'
reference_snapshot=None
if reference.exists():
 bpy.ops.wm.open_mainfile(filepath=str(reference));reference_snapshot=snapshot()
results=[]
for name in NAMES:
 path=ROOT/'source'/f'{name}.blend';bpy.ops.wm.open_mainfile(filepath=str(path));sc=bpy.context.scene
 state=snapshot();assert state['engine']=='BLENDER_EEVEE_NEXT' and state['samples']==128
 assert state['transparent'] and state['color_mode']=='RGBA' and state['color_depth']=='8'
 assert state['view_transform']=='AgX' and state['look']=='AgX - Medium High Contrast'
 assert len(state['lights'])==3 and state['camera']['ortho_scale']==3.75
 assert not bpy.data.libraries and not [im for im in bpy.data.images if im.source=='FILE']
 assert not [o for o in sc.objects if o.type=='FONT']
 assert all(m.get('source_srgb') in {'#F2F5FA','#B8C9DE','#3182F6','#8191A6'} for o in sc.objects if o.type in {'MESH','CURVE'} for m in o.data.materials)
 assert not [o for o in sc.objects if o.animation_data]
 assert not bpy.data.actions
 assert {m['source_srgb'] for m in state['materials'].values()}=={'#F2F5FA','#B8C9DE','#3182F6','#8191A6'}
 assert sc.render.resolution_x==sc.render.resolution_y==768
 compared=None
 if reference_snapshot:
  for key in state:
   if key!='materials':assert state[key]==reference_snapshot[key],(name,key,state[key],reference_snapshot[key])
  for key in state['materials']:assert state['materials'][key]==reference_snapshot['materials'][key]
  compared=True
 file_state={'asset':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'blend_reopened':True,'editable_mesh_count':sum(o.type=='MESH' for o in sc.objects),'editable_curve_count':sum(o.type=='CURVE' for o in sc.objects),'external_libraries':0,'external_images':0,'font_objects':0,'animated_objects':0,'actions':0,'settings_exact_match_to_available_extra13_reference':compared,'settings':state}
 sc.render.resolution_x=sc.render.resolution_y=512;sc.render.resolution_percentage=100
 sc.render.filepath=str(OUT/f'{name}-512.png');bpy.ops.render.render(write_still=True)
 file_state['rerendered_saved_scene_at_512']=True
 results.append(file_state)
(ROOT/'qa'/'blend-validation.json').write_text(json.dumps({'blender_version':bpy.app.version_string,'reference_path_at_validation':str(reference),'files':results},indent=2)+'\n')
print('ALL_BLEND_VALIDATIONS_PASSED')
