"""Reproducible crops/compression of original generated artwork; no synthetic painting."""
from PIL import Image
from pathlib import Path
import json, shutil, hashlib
root=Path(__file__).resolve().parents[1]
out=root/'public/art'; out.mkdir(parents=True,exist_ok=True)
src=root/'design/source-art'; src.mkdir(parents=True,exist_ok=True)
files={'profile':'db4ece0d-01dd-4c26-a050-c6d19ade6dda','auth':'d0332c00-a109-48b4-9120-296550d3fbef','hero':'7305648a-00f2-4a20-a7a8-b7758bbf91aa','world-a':'d1e4ea6d-33c1-4fde-8a06-67acce0f3c27','world-b':'14ef6eea-4a08-400d-9e03-5203cae6f7e8','world-c':'25d1f628-d507-40fd-bf88-7b61aa28879a','boss':'74d80381-d262-4c12-a9dc-a44c747034b6','boss-b':'7a55da54-7c84-44e4-8461-fd1c8b570dbe','boss-c':'cb8c7a9d-87a3-409d-b1e8-49161c50d2a8','extras':'a86244e5-436b-4023-a30b-dbf2679c5de9'}
manifest=[]
def save(im,name,source):
    for width in [480,960,1600]:
        if width>im.width and width!=480: continue
        resized=im.copy(); resized.thumbnail((width,10000),Image.Resampling.LANCZOS)
        path=out/f'{name}-{width}.webp'; resized.save(path,'WEBP',quality=82,method=6)
        manifest.append({'file':str(path.relative_to(root)),'source':source,'size':resized.size,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
for name,id in files.items():
    target=src/f'{name}.png'
    generated=Path(f'/workspace/generated_images/exec-{id}.png')
    if generated.exists(): shutil.copyfile(generated,target)
    if not target.exists(): raise FileNotFoundError(target)
    im=Image.open(target).convert('RGB')
    if name in ['auth','hero','profile']: save(im,name,name)
    else:
        cols,rows=(4,4) if name=='extras' else (2,3)
        for i in range(cols*rows):
            x,y=i%cols,i//cols
            tile=im.crop((round(x*im.width/cols),round(y*im.height/rows),round((x+1)*im.width/cols),round((y+1)*im.height/rows)))
            save(tile,f'{name}-{i+1}',name)
(root/'docs/redesign/art-manifest.json').write_text(json.dumps({'provenance':'Original imagegen artwork. Pillow only crops and compresses. Atlas tiles retain their native resolution; no upscaling. UI labels are HTML.','assets':manifest},ensure_ascii=False,indent=2))
print(len(manifest),'optimized assets;',sum(x['bytes'] for x in manifest),'bytes')
