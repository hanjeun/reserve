"""Encode native PNGs, build review sheets and write a checksummed manifest.

Run after Blender: python3 source/encode_and_validate.py
Requires Pillow. Delivered PNG/WebP files are never resized by this script.
Only clearly labeled review sheets contain 48/64/192-pixel downsampled views.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['food','beauty','sports','performance','popup','other']
OUTPUTS = []
QA = []
for size in (512,768):
    for name in NAMES:
        png = ROOT/'static'/str(size)/f'{name}-{size}.png'
        image = Image.open(png).convert('RGBA')
        assert image.size == (size,size), (png,image.size)
        original_pixels = image.tobytes()
        image.save(png,'PNG',optimize=True)
        assert Image.open(png).convert('RGBA').tobytes() == original_pixels
        alpha = image.getchannel('A')
        box = alpha.getbbox()
        assert box is not None
        assert alpha.getextrema() == (0,255)
        edge = [alpha.crop((0,0,size,1)),alpha.crop((0,size-1,size,size)),
                alpha.crop((0,0,1,size)),alpha.crop((size-1,0,size,size))]
        assert all(p.getextrema() == (0,0) for p in edge), (name,'clipped')
        assert min(box[0],box[1],size-box[2],size-box[3]) >= size*.10, (name,box)
        webp = png.with_suffix('.webp')
        image.save(webp,'WEBP',quality=92,method=6,lossless=False,alpha_quality=100,exact=True)
        decoded = Image.open(webp).convert('RGBA')
        assert decoded.size == image.size
        assert decoded.getchannel('A').tobytes() == alpha.tobytes(), (name,'alpha changed')
        record = {'asset':name,'resolution':[size,size],'alpha_bbox':list(box),
                  'alpha_range':[0,255],'all_canvas_edges_alpha_zero':True,
                  'minimum_margin_px':min(box[0],box[1],size-box[2],size-box[3]),
                  'png_recompression_pixel_identical':True,'webp_alpha_pixel_identical':True}
        QA.append(record)
        for path in (png,webp):
            OUTPUTS.append({'file':str(path.relative_to(ROOT)),
                            'resolution':[size,size], 'bytes':path.stat().st_size,
                            'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                            'transparent':True,'native_resolution':True})

(ROOT/'previews').mkdir(exist_ok=True)
for theme,color,ink in [('light','#FFFFFF','#223047'),('dark','#161C27','#E8EEF7')]:
    # Actual 48 and 64-pixel canvases, not enlarged screenshots of small icons.
    small = Image.new('RGB',(960,260),color)
    draw = ImageDraw.Draw(small)
    draw.text((20,12),'Actual icon canvas: 48 px (top) / 64 px (bottom)',fill=ink)
    for index,name in enumerate(NAMES):
        for row,size in enumerate((48,64)):
            icon = Image.open(ROOT/'static'/'512'/f'{name}-512.png').convert('RGBA')
            icon = icon.resize((size,size),Image.Resampling.LANCZOS)
            x = index*160+(160-size)//2
            y = 48+row*105
            small.paste(icon,(x,y),icon)
            draw.text((index*160+28,y+size+9),f'{name} {size}px',fill=ink)
    small.save(ROOT/'previews'/f'{theme}-actual-48-64.png',optimize=True)
    # A larger overview lets reviewers see materials and silhouette details.
    large = Image.new('RGB',(1296,256),color)
    draw = ImageDraw.Draw(large)
    for index,name in enumerate(NAMES):
        icon = Image.open(ROOT/'static'/'768'/f'{name}-768.png').convert('RGBA')
        icon = icon.resize((208,208),Image.Resampling.LANCZOS)
        large.paste(icon,(index*216+4,8),icon)
        draw.text((index*216+24,229),name,fill=ink)
    large.save(ROOT/'previews'/f'{theme}-overview.webp','WEBP',lossless=True,method=6)

manifest = {'title':'RESERVE category icons — first-set style',
            'asset_count':6,'asset_ids':NAMES,
            'reference':'RESERVE-state-illustrations-delivery.zip (first 28 set)',
            'production':'Blender 4.3.2 / Eevee Next / 128 samples',
            'static_file_count':24, 'rendered_independently_at':[512,768],
            'transparent_film':True,'no_ai_upscaling':True,
            'encoding':{'png':'RGBA8 lossless','webp':'quality 92, method 6, lossless alpha; lossy RGB'},
            'palette_srgb':['#F2F5FA','#B8C9DE','#3182F6'],
            'color_note':'These are material base colors; AgX, light and reflection alter output pixel colors.',
            'motion':{'type':'CSS image transforms','entrance_seconds':1.4,'entrance_iterations':1,
                      'loop_seconds':2.4,'loop_iterations':'infinite','loop_optional':True,
                      'reduced_motion':'still','fixed_fps':None,'true_3d_animation':False},
            'license':{'original_images_and_scenes':'CC0-1.0 to extent rights exist',
                       'original_source_code':'MIT','third_party_production_tools':'Their own licenses'},
            'qa':QA, 'files':OUTPUTS}
seen = {entry['file'] for entry in OUTPUTS}
for path in sorted(ROOT.rglob('*')):
    relative = str(path.relative_to(ROOT))
    if path.is_file() and relative not in seen and path.name != 'manifest.json' and '__pycache__' not in path.parts and path.suffix not in ('.blend1','.log'):
        manifest['files'].append({'file':relative,'bytes':path.stat().st_size,
                                  'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'static_files':len(OUTPUTS),'checks_passed':True,'qa':QA},indent=2))
