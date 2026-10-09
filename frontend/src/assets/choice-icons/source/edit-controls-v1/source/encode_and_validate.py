"""Encode native renders without resizing them; build labeled QA-only composites.
python3 source/encode_and_validate.py
Requires Pillow and NumPy. WebP RGB is quality92/method6; alpha is lossless.
"""
from pathlib import Path
import argparse,hashlib,json,struct
from PIL import Image,ImageDraw
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
NAMES=['edit-operation','edit-identity','intake-paused','waiting-off']
p=argparse.ArgumentParser();p.add_argument('--partial',action='store_true');args=p.parse_args()
files=[];qa=[]
for size in (512,768):
 for name in NAMES:
  png=ROOT/'static'/str(size)/f'{name}-{size}.png'
  if not png.exists():
   if args.partial:continue
   raise RuntimeError(f'Missing {png}')
  im=Image.open(png);assert im.mode=='RGBA' and im.size==(size,size)
  original=im.tobytes();im.save(png,'PNG',optimize=True)
  assert Image.open(png).tobytes()==original
  header=png.read_bytes();assert header[24]==8 and header[25]==6
  alpha=im.getchannel('A');a=np.array(alpha);box=alpha.getbbox()
  assert alpha.getextrema()==(0,255)
  assert not any((a[0,:].any(),a[-1,:].any(),a[:,0].any(),a[:,-1].any()))
  margin=min(box[0],box[1],size-box[2],size-box[3]);assert margin>=size*.10,(name,box)
  webp=png.with_suffix('.webp');im.save(webp,'WEBP',quality=92,method=6,lossless=False,alpha_quality=100,exact=True)
  dec=Image.open(webp).convert('RGBA');assert dec.size==im.size and dec.getchannel('A').tobytes()==alpha.tobytes()
  # Composite errors are measured only where pixels are visible.
  errors={}
  for label,color in [('light',(255,255,255,255)),('dark',(22,28,39,255))]:
   x=np.array(Image.alpha_composite(Image.new('RGBA',im.size,color),im).convert('RGB')).astype(float)
   y=np.array(Image.alpha_composite(Image.new('RGBA',im.size,color),dec).convert('RGB')).astype(float)
   v=(a>0);mse=((x[v]-y[v])**2).mean();errors[label]={'visible_rmse':round(mse**.5,4),'visible_psnr_db':round(10*np.log10(255**2/mse),3)}
  qa.append({'asset':name,'resolution':size,'mode':'RGBA','bit_depth':8,'native_render':True,'alpha_bbox':list(box),'minimum_margin_px':margin,'alpha_range':[0,255],'all_canvas_edges_alpha_zero':True,'png_recompression_pixel_identical':True,'webp_alpha_pixel_identical':True,'webp_target_bytes':20000 if size==512 else 32000,'webp_target_pass':webp.stat().st_size<=(20000 if size==512 else 32000),'composite_rgb_error':errors})
  for path in [png,webp]:files.append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'width':size,'height':size})
(ROOT/'qa'/'image-validation.json').write_text(json.dumps({'files':files,'checks':qa},indent=2)+'\n')
for theme,color,ink in [('light','#FFFFFF','#223047'),('dark','#161C27','#E8EEF7')]:
 for source_size in (512,768):
  if not all((ROOT/'static'/str(source_size)/f'{name}-{source_size}.webp').exists() for name in NAMES):continue
  small=Image.new('RGB',(1060,295),color);d=ImageDraw.Draw(small)
  d.text((20,14),f'Actual 48 / 56 / 64px canvases from native {source_size}px. View at 100% zoom.',fill=ink)
  for i,name in enumerate(NAMES):
   x=15+i*262;d.text((x+8,43),name,fill=ink)
   for row,ext in enumerate(('png','webp')):
    y=75+row*106;d.text((x+5,y+20),ext.upper(),fill=ink)
    for s,dx in [(48,43),(56,111),(64,183)]:
     im=Image.open(ROOT/'static'/str(source_size)/f'{name}-{source_size}.{ext}').convert('RGBA').resize((s,s),Image.Resampling.LANCZOS)
     small.paste(im,(x+dx,y+(64-s)//2),im);d.text((x+dx+10,y+68),f'{s}px',fill=ink)
  small.save(ROOT/'previews'/f'{theme}-actual-48-56-64-from{source_size}.png',optimize=True)
 size=768 if all((ROOT/'static'/'768'/f'{name}-768.png').exists() for name in NAMES) else 512
 if not all((ROOT/'static'/str(size)/f'{name}-{size}.png').exists() for name in NAMES):continue
 large=Image.new('RGB',(1024,300),color);d=ImageDraw.Draw(large)
 for i,name in enumerate(NAMES):
  im=Image.open(ROOT/'static'/str(size)/f'{name}-{size}.webp').convert('RGBA').resize((256,256),Image.Resampling.LANCZOS)
  large.paste(im,(i*256,0),im);d.text((i*256+45,264),name,fill=ink)
 large.save(ROOT/'previews'/f'{theme}-overview.png',optimize=True)
 print(theme,'previews ready')
print(json.dumps({'render_count':len(qa),'files':files,'all_webp_targets_pass':all(x['webp_target_pass'] for x in qa)},indent=2))
