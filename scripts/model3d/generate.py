#!/usr/bin/env python3
"""Make a character's 3D model on fal.ai from its card art, so the API key stays a repository secret.

    FAL_KEY=... python3 scripts/model3d/generate.py captain

Two steps: an image model repaints the card's picture as a clean full-body reference (the figure whole, head to
toe, in an A-pose on a plain background, as image-to-3D wants it, and as rigging wants it); then an image-to-3D model
makes a textured mesh of it. The reference is kept in generated/<id>.png, the mesh in src/assets/models/<id>.glb.
Set FAL_3D_MODEL to try another image-to-3D model."""
import base64, json, os, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
KEEP = os.path.join(HERE, 'generated')
OUT = os.path.join(ROOT, 'src', 'assets', 'models')
IMAGE_MODEL = 'fal-ai/nano-banana-pro/edit'
MESH_MODEL = os.environ.get('FAL_3D_MODEL', 'fal-ai/hunyuan3d/v2')
FALLBACK = 'fal-ai/trellis'

CHARACTERS = {
    'captain': {
        'art': 'src/assets/cards/human_captain.webp',
        'look': 'the same man as in the picture: a weathered human starship captain with a short dark beard and swept-back '
                'hair, a long dark storm-grey greatcoat with a high collar, a grey scarf, brown leather crossed straps and '
                'belt, dark trousers tucked into tall brown boots',
    },
}


def key():
    k = os.environ.get('FAL_KEY') or os.environ.get('FAL_API_KEY')
    if not k: sys.exit('Set FAL_KEY (your fal.ai API key) in the environment.')
    return k


def run(model, payload, timeout=900):
    req = urllib.request.Request(f'https://fal.run/{model}', data=json.dumps(payload).encode(),
                                 headers={'Authorization': f'Key {key()}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{e.code} from {model}: {e.read().decode(errors="replace")[:2000]}') from None


def fetch(url):
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()


def urls(x):
    if isinstance(x, str) and x.startswith('http'): yield x
    elif isinstance(x, dict):
        for v in x.values(): yield from urls(v)
    elif isinstance(x, list):
        for v in x: yield from urls(v)


def data_uri(path):
    kind = 'webp' if path.endswith('.webp') else 'png' if path.endswith('.png') else 'jpeg'
    with open(path, 'rb') as f:
        return f'data:image/{kind};base64,' + base64.b64encode(f.read()).decode()


def reference(cid, c):
    prompt = (f'Character reference for a 3D model of {c["look"]}. The whole figure, head to toe with the boots fully in '
              'view, standing straight and facing the camera, in a relaxed A-pose: arms held down and a little out from the '
              'body, hands open and empty, feet slightly apart; the coat hanging naturally. Holding nothing. Neutral '
              'expression. Plain flat light grey background, nothing else in the picture, even soft studio light, no '
              'shadows on the ground. Painterly realistic detail, the same colours and face as the picture.')
    out = run(IMAGE_MODEL, {'prompt': prompt, 'image_urls': [data_uri(os.path.join(ROOT, c['art']))], 'num_images': 1,
                            'aspect_ratio': '3:4', 'output_format': 'png'}, timeout=300)
    img = fetch(out['images'][0]['url'])
    os.makedirs(KEEP, exist_ok=True)
    path = os.path.join(KEEP, f'{cid}.png')
    with open(path, 'wb') as f: f.write(img)
    print('reference:', path)
    return path


def mesh(cid, ref):
    uri = data_uri(ref)
    for model, payload in ((MESH_MODEL, {'input_image_url': uri, 'textured_mesh': True}),
                           (FALLBACK, {'image_url': uri})):
        try:
            out = run(model, payload)
        except RuntimeError as e:
            print('failed:', e)
            continue
        print(model, json.dumps(out)[:1500])
        glb = next((u for u in urls(out) if '.glb' in u.split('?')[0]), None) or next(urls(out), None)
        if not glb: continue
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, f'{cid}.glb')
        with open(path, 'wb') as f: f.write(fetch(glb))
        print('mesh:', path, os.path.getsize(path), 'bytes, from', model)
        return
    sys.exit('No image-to-3D model gave a mesh.')


def main():
    for cid in sys.argv[1:]:
        c = CHARACTERS.get(cid)
        if not c: sys.exit(f'No character {cid!r} (have: {", ".join(CHARACTERS)}).')
        mesh(cid, reference(cid, c))


if __name__ == '__main__':
    main()
