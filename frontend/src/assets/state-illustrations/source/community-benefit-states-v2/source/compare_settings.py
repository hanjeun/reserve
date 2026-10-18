"""Compare actual reopened delivered scenes against actual reopened legacy reference."""
import json
from pathlib import Path
r=Path(__file__).resolve().parents[1]
a=json.loads((r/'qa/reference-scene-inspection.json').read_text())[0]
rows=[]
for b in json.loads((r/'qa/delivered-scene-settings.json').read_text()):
 tests={'engine':b['engine']==a['engine'],'samples':b['samples']==a['samples'],'transparent':b['transparent']==a['transparent'],'camera_location':b['camera_location']==a['camera']['location'],'camera_rotation':b['camera_rotation']==a['camera']['rotation'],'ortho':b['ortho_scale']==a['camera']['ortho'],'view':b['view']==a['color']['view'],'look':b['look']==a['color']['look'],'exposure':b['exposure']==a['color']['exposure'],'gamma':b['gamma']==a['color']['gamma']}
 la=sorted([(l['location'],l['energy'],l['size']) for l in a['lights']]);lb=sorted([(l['location'],l['energy'],l['size']) for l in b['lights']]);tests['lighting']=la==lb
 ma={m['name']:m for m in a['materials']};mb={m['name']:m for m in b['materials']}
 tests['materials']=all(all(ma[n][k]==mb[n][k] for k in ['color','metallic','roughness']) for n in ['white','pale','blue','ink'] if n in mb)
 rows.append({'asset':b['asset'],'reference':a['path'],'checks':tests,'all_identical':all(tests.values())})
assert len(rows)==6 and all(x['all_identical'] for x in rows), rows
(r/'qa/style-settings-comparison.json').write_text(json.dumps(rows,indent=2))
print('STYLE_SETTINGS_MATCH',len(rows))
