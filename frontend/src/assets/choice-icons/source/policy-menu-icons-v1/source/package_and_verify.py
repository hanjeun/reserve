"""Compile factual validation, hash preservation and package only this new kit.
Copyright (c) 2026 RESERVE asset-kit contributors. MIT.
The prior-file snapshot must have been created before modeling. It is never
regenerated here, so the preservation test cannot silently move its baseline.
"""
from pathlib import Path
import hashlib,json,zipfile,shutil
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT.parent
WORK=BASE/'reserve-policy-icons-work';NAMES=['edit-booking-policy','edit-deposit','edit-refund']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
qa=ROOT/'qa'
assert (qa/'blend-validation.json').exists()
assert (qa/'independent-visual-review.json').exists()
visual_review=json.loads((qa/'independent-visual-review.json').read_text())
assert visual_review['overall_result']=='PASS', visual_review['overall_result']
blend_review=json.loads((qa/'blend-validation.json').read_text())
for entry in blend_review['files']:
 assert entry['sha256']==sha(ROOT/'source'/(entry['asset']+'.blend')), 'Scene audit must match the final delivered blend'
evidence=[json.loads(line) for line in (ROOT/'source'/'native-render-evidence.jsonl').read_text().splitlines()]
assert {(e['asset'],e['resolution'][0]) for e in evidence} == {(n,r) for n in NAMES for r in (512,768)} and len(evidence)==6
roundtrip=[]
for name in NAMES:
 p=ROOT/'static'/'512'/f'{name}-512.png';r=WORK/'roundtrip'/f'{name}-512.png'
 a=np.array(Image.open(p).convert('RGBA'));b=np.array(Image.open(r).convert('RGBA'))
 delta=np.abs(a.astype(int)-b.astype(int))
 record={'asset':name,'resolution':[512,512],'saved_scene_reopened_and_rerendered':True,'rgba_pixel_identical':bool(np.array_equal(a,b)),'max_channel_difference':int(delta.max()),'mean_absolute_channel_difference':float(delta.mean()),'alpha_pixel_identical':bool(np.array_equal(a[:,:,3],b[:,:,3]))}
 assert record['rgba_pixel_identical'],record
 roundtrip.append(record)
(qa/'roundtrip-validation.json').write_text(json.dumps(roundtrip,indent=2)+'\n')
before=json.loads((WORK/'original-sha256-before.json').read_text());changed=[];missing=[]
for relative,info in before['files'].items():
 p=BASE/relative
 if not p.exists():missing.append(relative)
 elif sha(p)!=info['sha256']:changed.append(relative)
assert not changed and not missing,(changed,missing)
original_roots=['reserve-original-style-kit/static/','reserve-empty-news-addon/original-style/static/','reserve-category-kit/static/','reserve-extra-icons-13/static/']
original_images=[p for p in before['files'] if any(p.startswith(r) for r in original_roots) and Path(p).suffix in ('.png','.webp')]
refined_app=[p for p in before['files'] if p.startswith('reserve-small-refinement-v1/app/') and Path(p).suffix=='.webp']
refined_native=[p for p in before['files'] if p.startswith('reserve-small-refinement-v1/work/renders/') and Path(p).suffix=='.png']
refined_sources=[p for p in before['files'] if p.startswith('reserve-small-refinement-v1/work/source/') and Path(p).suffix=='.blend']
archives=[p for p in before['files'] if '/' not in p and Path(p).suffix=='.zip']
camera_images=[p for p in before['files'] if p.startswith('reserve-camera-browser-v1/static/') and Path(p).suffix in ('.png','.webp')]
camera_sources=[p for p in before['files'] if p.startswith('reserve-camera-browser-v1/source/') and Path(p).suffix=='.blend']
assert len(original_images)==192 and len(refined_app)==16 and len(refined_sources)==8 and len(camera_images)==12 and len(camera_sources)==3
preserve={'snapshotted_files':len(before['files']),'unchanged_files':len(before['files']),'changed_files':changed,'missing_files':missing,'original_48_production_image_files_verified':len(original_images),'eight_refinement_app_webps_verified':len(refined_app),'eight_refinement_native_pngs_verified':len(refined_native),'eight_refinement_blends_verified':len(refined_sources),'three_camera_browser_production_image_files_verified':len(camera_images),'three_camera_browser_blends_verified':len(camera_sources),'prior_zip_count_verified':len(archives),'prior_zips':{p:before['files'][p] for p in archives},'also_verified':'Locally available earlier source, review, motion, site, retired-page and archive files; none modified','unavailable_latest_four':{'name':'RESERVE-edit-controls-v1.zip','library_file_id':'libfile_66105d91013c819196b377009243c467','historical_recorded_bytes':2614668,'historical_recorded_sha256':'5420c7b3b05a6895fdc1ffcd0902cb903f41d84b1ef738814aedbc80e8916931','current_bytes_verified':False,'reason':'Local folder/archive still absent in this run. The preceding authorized Library helper download returned HTTP 403; no new download or access restriction bypass was attempted. Historical hash is not current verification.'}}
(qa/'preservation-report.json').write_text(json.dumps(preserve,indent=2)+'\n')
shutil.copyfile(WORK/'original-sha256-before.json',qa/'preservation-before-sha256.json')
shutil.copyfile(WORK/'render.log',qa/'native-render.log')
shutil.copyfile(WORK/'validate-blends.log',qa/'blend-reopen-render.log')
execution={'executed':['Six independent native PNG renders: three icons × 512 and 768, Blender 4.3.2 / Eevee Next / 128 samples','PNG lossless optimization with RGBA equality check','Six static WebP encodes, quality 92, method 6, lossless alpha; sizes checked against 20000/32000-byte ceilings','Canvas dimensions, alpha extrema, transparent borders, margins and exact WebP alpha checked','PNG/WebP light and dark composites numerically compared, including partial-alpha edges','All three delivered blends reopened, editable objects and no external images/libraries/fonts/actions checked','Exact shared scene settings and all three used material definitions compared to locally available waiting-onsite.blend; the fourth neutral material remains available in rebuild code but is unused by these new icons','All three saved scenes rerendered at 512 with RGBA pixel-identical comparison','Independent visual review of actual 48/56/64 px on light/dark from both production resolutions, plus same-pipeline camera/browser and extra-icon style comparison','SHA-256 preservation check against pre-work snapshot','ZIP integrity, safe paths, payload allowlist, 12 production images, 3 blends and per-file hashes verified'], 'not_executed':['Current-byte/source inspection or SHA verification of unavailable latest-four edit-controls ZIP; historical reference only','Rerender round-trip comparison at 768 from saved blends (independent native 768 renders were executed)','User-study, accessibility usability test, real-browser/app integration or physical-device display test','Animation, Lottie, video, site/app code, Git, deployment or operational work'], 'renderer_messages':'Initial EGL context and read-only cache warnings appeared; software rendering completed successfully at requested engine, settings and resolution. No warning was treated as render completion.', 'geometry_polish':'Independent visual QA found a non-blocking visible shaft overlap on the refund arrowhead and a faint endpoint seam at native size. The shaft was replaced with one continuous rounded mesh and its join was concealed behind the blue head; refund was independently rerendered at both production resolutions, then image/scene/visual checks were repeated.', 'qa_script_repairs':'Inherited validation logic compares shared materials by source color, ignoring unused default materials and generated numeric suffixes. Audit results describe the checks actually executed in this new run.'}
(qa/'execution-report.json').write_text(json.dumps(execution,indent=2)+'\n')
imageqa=json.loads((qa/'image-validation.json').read_text())
manifest={'title':'RESERVE policy menu icons v1','version':1,'asset_count':3,'asset_ids':NAMES,'production_static_files':12,'editable_blends':3,'rendered_independently_at':[512,768],'production':'Blender 4.3.2 / Eevee Next / 128 samples','palette_srgb':['#F2F5FA','#B8C9DE','#3182F6','#8191A6'],'alpha':'RGBA8 PNG; static lossy-RGB WebP with pixel-identical lossless alpha','webp_quality':92,'webp_method':6,'webp_exact':True,'webp_alpha_quality':100,'webp_byte_limits':{'512':20000,'768':32000},'model_and_image_license':'CC0-1.0','original_code_license':'MIT','source_pipelines':['RESERVE original-style first 28','original-style empty-news','RESERVE six categories','RESERVE extra 13','RESERVE camera and browser states v1'],'latest_four_current_source_verified':False,'image_checks':imageqa,'files':[]}
for p in sorted(ROOT.rglob('*')):
 if p.is_file() and p.name not in ('manifest.json','SHA256SUMS.txt'):
  assert p.suffix not in ('.blend1','.pyc','.mp4','.webm','.html','.css','.js','.mjs'),p
  manifest['files'].append({'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p)})
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
allfiles=sorted(p for p in ROOT.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt')
(ROOT/'SHA256SUMS.txt').write_text(''.join(f'{sha(p)}  {p.relative_to(ROOT)}\n' for p in allfiles))
archive=BASE/'RESERVE-policy-menu-icons-v1.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(ROOT.rglob('*')):
  if p.is_file():z.write(p,arcname=str(Path(ROOT.name)/p.relative_to(ROOT)))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert all(not p.startswith('/') and '..' not in Path(p).parts for p in z.namelist())
 assert len([p for p in z.namelist() if '/static/' in p and p.endswith(('.png','.webp'))])==12
 assert len([p for p in z.namelist() if p.endswith('.blend')])==3
 for p in ROOT.rglob('*'):
  if p.is_file():assert z.read(str(Path(ROOT.name)/p.relative_to(ROOT)))==p.read_bytes()
summary={'archive':str(archive),'zip_bytes':archive.stat().st_size,'zip_sha256':sha(archive),'zip_entries':len(z.namelist()),'production_image_bytes':sum(f['bytes'] for f in manifest['files'] if f['file'].startswith('static/')),'images':[f for f in manifest['files'] if f['file'].startswith('static/')],'blend_files':[f for f in manifest['files'] if f['file'].endswith('.blend')],'preservation':preserve,'roundtrip':roundtrip,'execution':execution}
(WORK/'delivery-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
