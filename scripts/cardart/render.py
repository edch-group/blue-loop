#!/usr/bin/env python3
"""Render card pictures: python3 scripts/cardart/render.py [card ids or races...]
Writes src/assets/cards/<id>.webp (640x400). Needs numpy, scipy and pillow."""
import os, sys, time
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(__file__))
from kit import Scene
import cards_aureline, aureline_moments, solenne, aureline_3d, cards_misc  # (these register into the Aureline set)

SCENES = {}
RACE = {}
for mod, race in ((cards_aureline, 'aureline'), (cards_misc, None)):
    for k, v in mod.SCENES.items():
        SCENES[k] = v
        RACE[k] = race
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'assets', 'cards')


def render(cid):
    t = time.time()
    fn, opts = SCENES[cid]
    S = Scene(cid, opts.pop('pal', 'aureline'), **opts)
    opts['pal'] = S.p
    fn(S)
    S.finish(os.path.join(OUT, f'{cid}.webp'), **getattr(fn, 'finish', {}))
    return cid, time.time() - t


# Cards whose picture was supplied (painted elsewhere, not rendered here): never overwritten by a batch,
# only when named on their own.
SUPPLIED = {'empress_solenne', 'coronal_chorus'}
# (and every card given an image-model prompt: generate.py paints those)
import glob, json
for _f in glob.glob(os.path.join(os.path.dirname(__file__), 'prompts', '*.json')):
    SUPPLIED |= set(json.load(open(_f))['cards'])

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    args = sys.argv[1:] or list(SCENES)
    ids = [c for a in args for c in ([k for k, r in RACE.items() if r == a and k not in SUPPLIED] if a in RACE.values() else [a])]
    if not sys.argv[1:]: ids = [c for c in ids if c not in SUPPLIED]
    with Pool(int(os.environ.get('JOBS', os.cpu_count() or 2))) as pool:
        for cid, dt in pool.imap_unordered(render, ids):
            print(f'{cid} {dt:.1f}s', flush=True)
