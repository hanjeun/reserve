"""Package this new kit only, with a manifest and SHA-256 verification.
python3 source/package_zip.py [--output /path/RESERVE-edit-controls-v1.zip]
Run encoding and QA before packaging. No previous kit is changed.
"""
from pathlib import Path
import argparse,hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT.parent/'RESERVE-edit-controls-v1.zip');args=p.parse_args()
NAMES=['edit-operation','edit-identity','intake-paused','waiting-off']
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def included():return sorted(p for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.blend1','.log'] and p.name not in ['manifest.json','SHA256SUMS.txt'])
assert len(list((ROOT/'static').rglob('*.webp')))==8
assert len(list((ROOT/'static').rglob('*.png')))==8
assert len(list((ROOT/'source').glob('*.blend')))==4
assert not any(p.suffix in ['.css','.gif','.mp4','.webm'] for p in included())
qa=json.loads((ROOT/'qa'/'image-validation.json').read_text())
assert len(qa['checks'])==8 and all(x['webp_target_pass'] for x in qa['checks'])
manifest={'title':'RESERVE editing and status icons','version':'1','created_date':'2026-10-09','asset_ids':NAMES,'asset_count':4,'static_file_count':16,'png_count':8,'webp_count':8,'editable_blend_count':4,
 'subjects':{'edit-operation':'Rounded clock and small neutral gear','edit-identity':'Abstract gallery card and small pencil','intake-paused':'Queue ticket and neutral temporary pause bars','waiting-off':'Queue ticket and neutral off switch with knob on the left'},
 'production':{'blender':'4.3.2','engine':'BLENDER_EEVEE_NEXT','samples':128,'independent_native_render_sizes':[512,768],'film_transparent':True,'upscaled':False,'static_only':True,'animation':False,'css':False},
 'encoding':{'png':{'mode':'RGBA','bit_depth':8,'lossless':True},'webp':{'quality':92,'method':6,'rgb_lossless':False,'alpha_quality':100,'alpha_pixel_identical_to_png':True}},
 'webp_targets_bytes':{'512':20000,'768':32000},'webp_targets_all_pass':True,
 'palette_base_srgb':{'white':'#F2F5FA','pale':'#B8C9DE','blue':'#3182F6','neutral_ink':'#8191A6'},
 'shared_style':'Camera, lights, world, material parameters, color management and normalization continue the existing RESERVE pipeline unchanged. See qa/blend-validation.json.',
 'licenses':{'original_images_and_geometry':'CC0-1.0 to extent rights exist and can lawfully be waived','original_code':'MIT','third_party_tools':'Their own licenses'},
 'preservation_report':'qa/original-preservation.json','actual_size_review':'previews/*-actual-48-56-64-from512.png and *-from768.png',
 'notes':['Material base colors differ from rendered pixels under AgX and lighting.','Preview sheets contain review-only backgrounds and labels; icon files do not.','Existing popup/intake-both/intake-reservation/waiting-both assets are reused outside this package, without alteration.'],
 'files':[{'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':digest(p)} for p in included()]}
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
files=included()+[ROOT/'manifest.json']
(ROOT/'SHA256SUMS.txt').write_text(''.join(f'{digest(p)}  {p.relative_to(ROOT)}\n' for p in sorted(files)))
files.append(ROOT/'SHA256SUMS.txt')
with zipfile.ZipFile(args.output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(files):z.write(p,'RESERVE-edit-controls-v1/'+str(p.relative_to(ROOT)))
with zipfile.ZipFile(args.output) as z:
 assert z.testzip() is None
 for p in files:assert z.read('RESERVE-edit-controls-v1/'+str(p.relative_to(ROOT)))==p.read_bytes()
print(json.dumps({'zip':str(args.output),'bytes':args.output.stat().st_size,'sha256':digest(args.output),'archive_file_count':len(files),'static_files':qa['files'],'all_archive_bytes_verified':True},indent=2))
