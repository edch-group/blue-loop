#!/usr/bin/env python3
"""Generate card pictures with an image model on fal.ai, from a race's prompts and reference images.

    FAL_KEY=... python3 scripts/cardart/generate.py aureline helio_lancer halo_ward   # some cards
    FAL_KEY=... python3 scripts/cardart/generate.py aureline                          # every card in the file

Each card's prompt is put together from prompts/<race>.json (the style, the race's look, the framing and the
card's own scene); the race's reference images (refs/<race>-*.jpg) go with it, so every card shows the same
species. The full picture is kept in generated/<id>.png, and the card's 640x400 picture is written to
src/assets/cards/<id>.webp, where the game picks it up. Needs Pillow; set FAL_MODEL to try another model."""
import base64, glob, json, os, sys, time, urllib.error, urllib.request
from io import BytesIO
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(HERE, '..', '..', 'src', 'assets', 'cards')
KEEP = os.path.join(HERE, 'generated')
MODEL = os.environ.get('FAL_MODEL', 'fal-ai/nano-banana-pro/edit')


def data_uri(path):
    with open(path, 'rb') as f:
        return 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()


def call(prompt, refs):
    key = os.environ.get('FAL_KEY') or os.environ.get('FAL_API_KEY')
    if not key: sys.exit('Set FAL_KEY (your fal.ai API key) in the environment.')
    body = json.dumps({'prompt': prompt, 'image_urls': refs, 'num_images': 1, 'aspect_ratio': '16:9', 'output_format': 'png'}).encode()
    req = urllib.request.Request(f'https://fal.run/{MODEL}', data=body, headers={'Authorization': f'Key {key}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            out = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{e.code} from {MODEL}: {e.read().decode(errors="replace")[:2000]}') from None
    url = out['images'][0]['url']
    with urllib.request.urlopen(url, timeout=120) as r:
        return Image.open(BytesIO(r.read())).convert('RGB')


def card_crop(img):
    """The card's 16:10 window, cut from the middle of a wider picture (or the top of a taller one)."""
    w, h = img.size
    if w / h > 1.6:
        cw = int(h * 1.6); left = (w - cw) // 2
        img = img.crop((left, 0, left + cw, h))
    else:
        ch = int(w / 1.6); img = img.crop((0, 0, w, ch))
    return img.resize((640, 400), Image.LANCZOS)


def main():
    race, ids = sys.argv[1], sys.argv[2:]
    spec = json.load(open(os.path.join(HERE, 'prompts', f'{race}.json')))
    refs = [data_uri(p) for p in sorted(glob.glob(os.path.join(HERE, 'refs', f'{race}-*.jpg')))]
    os.makedirs(KEEP, exist_ok=True)
    failed = []
    for cid in ids or list(spec['cards']):
        prompt = ' '.join([spec['cards'][cid], spec['race'], spec['style'], spec['framing']])
        t = time.time()
        try:
            img = call(prompt, refs)
        except Exception as e:
            print(f'{cid}: failed: {e}', flush=True); failed.append(cid)
            if str(e)[:3] in ('401', '403', '404', '422'): break   # the request itself is wrong: the rest would fail too
            continue
        img.save(os.path.join(KEEP, f'{cid}.png'))
        card_crop(img).save(os.path.join(CARDS, f'{cid}.webp'), quality=88)
        print(f'{cid}: {img.size[0]}x{img.size[1]} in {time.time() - t:.0f}s', flush=True)
    if failed: sys.exit(f'failed: {" ".join(failed)}')


if __name__ == '__main__':
    main()
