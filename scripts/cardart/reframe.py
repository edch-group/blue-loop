#!/usr/bin/env python3
"""Re-crop a generated card picture so its figure sits lower, clear of the card's type badge.

    python3 scripts/cardart/reframe.py halo_ward 100          # 100px more sky on top
    python3 scripts/cardart/reframe.py halo_ward 100 --look   # also write generated/<id>.reframed.png to check

The full picture (generated/<id>.png) is never changed. The sky is extended upward by `lift` pixels, gently: the
topmost rows (stars lifted out) carry straight on upward, softening into broad light and colour as they rise, with the
painting's grain and fresh stars like its own scattered over them. Nothing is mirrored or
stretched. The card's 16:10 window is then cut from the top, so everything moves down by `lift`.
Needs numpy, scipy and Pillow."""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(HERE, '..', '..', 'src', 'assets', 'cards')
KEEP = os.path.join(HERE, 'generated')


def stars(img):
    """The picture's stars: points of light smaller than 7px in every direction (a line, a rim or an edge is not one)."""
    lum = img.mean(axis=2)
    opened = np.max([ndimage.grey_opening(lum, footprint=fp) for fp in (
        np.ones((1, 7)), np.ones((7, 1)), np.eye(7), np.fliplr(np.eye(7)))], axis=0)
    peak = np.clip(lum - opened, 0, None)
    mask = ndimage.gaussian_filter((peak > 18).astype(float), 1.0).clip(0, 1)
    layer = np.clip(img - opened[..., None], 0, None) * mask[..., None]
    return layer


def new_stars(star, rows, w, rng):
    """Stars for `rows` new rows, as many to the row as `star` (a band of the picture's star layer) has, each as bright
    and as coloured as one of its own: small round points, made fresh, so no shard or spark is copied with them."""
    lum = star.mean(axis=2)
    lab, n = ndimage.label(lum > 20)
    found = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None: continue
        hgt, wid = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if hgt > 5 or wid > 5: continue                    # round and small, or it is not a star
        cut = star[sl] * (lab[sl] == i)[..., None]
        found.append((cut.reshape(-1, 3).max(axis=0), max(hgt, wid)))
    out = np.zeros((rows, w, 3))
    if not found: return out
    count = int(len(found) * rows / len(star))
    yy, xx = np.mgrid[-4:5, -4:5]
    for _ in range(count):
        colour, size = found[rng.integers(len(found))]
        r = 0.45 + 0.18 * size
        spot = np.exp(-(yy ** 2 + xx ** 2) / (2 * r * r))[..., None] * colour
        y, x = rng.integers(0, rows), rng.integers(0, w)
        y0, y1, x0, x1 = max(0, y - 4), min(rows, y + 5), max(0, x - 4), min(w, x + 5)
        out[y0:y1, x0:x1] += spot[y0 - y + 4:y1 - y + 4, x0 - x + 4:x1 - x + 4]
    return out


def extend(img, lift, seed=1):
    """The picture with `lift` new rows of sky on top. The topmost rows (stars lifted out) carry straight on upward, so
    a column or a pylon running off the top keeps going, and soften as they rise; the painting's grain and stars like
    its own are laid over them."""
    h, w, _ = img.shape
    rng = np.random.default_rng(seed)
    star = stars(img)
    base = img - star
    edge = ndimage.gaussian_filter(base[:12].mean(axis=0), (2, 0))          # the top edge, a row, gently smoothed
    soft = ndimage.gaussian_filter(edge, (40, 0))                          # the same, as broad light and colour
    t = (np.arange(lift)[::-1] + 1) / lift                       # 1 at the new top, falling to the seam
    mix = 0.75 * t ** 1.5
    sky = edge[None] * (1 - mix[:, None, None]) + soft[None] * mix[:, None, None]
    # Grain as fine as the painting's own (its high-pass, measured where there are no stars), and its stars.
    hp = base[:lift * 2] - ndimage.gaussian_filter(base[:lift * 2], (1.5, 1.5, 0))
    sigma = 1.48 * np.median(np.abs(hp - np.median(hp)))
    sky += ndimage.gaussian_filter(rng.normal(0, 1, (lift, w, 1)), (0.7, 0.7, 0)) * sigma * 2.2
    sky += new_stars(star[:max(lift * 3, 200)], lift, w, rng)
    out = np.concatenate([sky, img], axis=0)
    # A soft seam: the first rows of the painting fade in over the continued edge.
    fade = 10
    a = np.linspace(0, 1, fade)[:, None, None]
    out[lift:lift + fade] = out[lift:lift + fade] * a + (sky[-1:] * (1 - a))
    return out.clip(0, 255)


def card_crop(img):
    w, h = img.size
    if w / h > 1.6:
        cw = int(h * 1.6); left = (w - cw) // 2
        img = img.crop((left, 0, left + cw, h))
    else:
        img = img.crop((0, 0, w, int(w / 1.6)))
    return img.resize((640, 400), Image.LANCZOS)


def main():
    cid, lift = sys.argv[1], int(sys.argv[2])
    img = np.asarray(Image.open(os.path.join(KEEP, f'{cid}.png')).convert('RGB'), dtype=float)
    out = Image.fromarray(extend(img, lift).astype(np.uint8))
    if '--look' in sys.argv: out.save(os.path.join(KEEP, f'{cid}.reframed.png'))
    card_crop(out).save(os.path.join(CARDS, f'{cid}.webp'), quality=88)
    print(f'{cid}: {out.size[0]}x{out.size[1]}, lifted {lift}px')


if __name__ == '__main__':
    main()
