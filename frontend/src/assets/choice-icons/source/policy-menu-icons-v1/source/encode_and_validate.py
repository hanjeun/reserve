"""Encode and inspect independent native Blender renders; create QA-only downsamples.
Copyright (c) 2026 RESERVE asset-kit contributors. MIT, see LICENSE-CODE.txt.
Run python3 source/encode_and_validate.py after build_assets.py.
"""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
NAMES=['edit-booking-policy','edit-deposit','edit-refund']
QA=[]
for size in (512,768):
 for name in NAMES:
  path=ROOT/'static'/str(size)/f'{name}-{size}.png';im=Image.open(path).convert('RGBA');rgba=np.array(im)
  assert im.size==(size,size)
  assert path.read_bytes()[24:26]==bytes([8,6]), 'PNG must have IHDR bit-depth 8 and color type RGBA'
  before=im.tobytes();im.save(path,optimize=True)
  assert Image.open(path).convert('RGBA').tobytes()==before
  alpha=im.getchannel('A');bbox=alpha.getbbox();assert bbox and alpha.getextrema()==(0,255)
  assert min(bbox[0],bbox[1],size-bbox[2],size-bbox[3])>=size*.08
  assert not np.any(rgba[0,:,3]) and not np.any(rgba[-1,:,3]) and not np.any(rgba[:,0,3]) and not np.any(rgba[:,-1,3])
  webp=path.with_suffix('.webp');limit=20000 if size==512 else 32000
  quality=92
  while True:
   im.save(webp,'WEBP',quality=quality,method=6,lossless=False,alpha_quality=100,exact=True)
   assert webp.stat().st_size<=limit, (name,size,webp.stat().st_size,limit)
   break
  decoded=Image.open(webp).convert('RGBA');assert not getattr(Image.open(webp),'is_animated',False)
  assert decoded.getchannel('A').tobytes()==alpha.tobytes()
  tests={}
  for theme,bg in [('light','#FFFFFF'),('dark','#161C27')]:
   b=Image.new('RGBA',im.size,bg)
   a=np.asarray(Image.alpha_composite(b,im).convert('RGB')).astype(float)
   c=np.asarray(Image.alpha_composite(b,decoded).convert('RGB')).astype(float)
   delta=np.abs(a-c);mask=rgba[:,:,3]>0;edge=(rgba[:,:,3]>0)&(rgba[:,:,3]<255)
   tests[theme]={'foreground_mean_absolute_rgb_error':float(delta[mask].mean()),'edge_mean_absolute_rgb_error':float(delta[edge].mean())}
   assert delta[mask].mean()<3.0 and delta[edge].mean()<3.0
  QA.append({'asset':name,'resolution':[size,size],'png_bytes':path.stat().st_size,'webp_bytes':webp.stat().st_size,'webp_quality':quality,'webp_limit_bytes':limit,'alpha_bbox':bbox,'alpha_range':[0,255],'canvas_edges_fully_transparent':True,'webp_alpha_exact':True,'png_recompression_pixel_identical':True,'static':True,'png_bit_depth':8,'png_color_type':6,'webp_method':6,'webp_exact':True,'composite_comparison':tests})
(ROOT/'previews').mkdir(exist_ok=True)
for theme,color,ink in [('light','#FFFFFF','#223047'),('dark','#161C27','#E8EEF7')]:
 for source_size in (512,768):
  sheet=Image.new('RGB',(960,430),color);d=ImageDraw.Draw(sheet)
  d.text((18,14),f'Actual 48 / 56 / 64 px canvases, from {source_size}px WebP. Inspect at 100%.',fill=ink)
  for i,name in enumerate(NAMES):
   left=i*320
   d.text((left+18,53),name,fill=ink)
   for j,size in enumerate((48,56,64)):
    im=Image.open(ROOT/'static'/str(source_size)/f'{name}-{source_size}.webp').convert('RGBA').resize((size,size),Image.Resampling.LANCZOS)
    sheet.paste(im,(left+20+j*95,95+(64-size)//2),im);d.text((left+20+j*95,173),f'{size}px',fill=ink)
   # Direct visual comparison to the other two: repeated unlabelled row.
   for j,name2 in enumerate(NAMES):
    im=Image.open(ROOT/'static'/str(source_size)/f'{name2}-{source_size}.webp').convert('RGBA').resize((48,48),Image.Resampling.LANCZOS)
    sheet.paste(im,(left+22+j*95,232),im)
  d.text((18,320),'Lower row repeats the three distinct states at 48px without labels.',fill=ink)
  d.text((18,344),'No artwork is enlarged here. Backgrounds and labels exist only on review sheets.',fill=ink)
  sheet.save(ROOT/'previews'/f'{theme}-actual-48-56-64-from{source_size}.png',optimize=True)
 overview=Image.new('RGB',(960,355),color);d=ImageDraw.Draw(overview)
 for i,name in enumerate(NAMES):
  im=Image.open(ROOT/'static'/'768'/f'{name}-768.png').convert('RGBA').resize((310,310),Image.Resampling.LANCZOS)
  overview.paste(im,(i*320+5,0),im);d.text((i*320+34,323),name,fill=ink)
 overview.save(ROOT/'previews'/f'{theme}-overview.png',optimize=True)
(ROOT/'qa'/'image-validation.json').write_text(json.dumps(QA,indent=2)+'\n')
print(json.dumps(QA,indent=2))
