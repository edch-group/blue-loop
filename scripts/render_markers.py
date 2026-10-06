#!/usr/bin/env python3
# Usage: pip install numpy scipy pillow && python3 scripts/render_markers.py
"""Render the faces and rims of a card's markers (src/ui/gems/marker-*.webp): the type pill and the attack, defence
and stability badges.

Each face is a polished cabochon of coloured stone in a capsule's shape, worked out per pixel the way the rarity gems
are: a dome whose thickness sets how deeply the stone's colour is absorbed (dark and rich at the edges, glowing where
light passes through), veils and clouds inside it, silk (fine needles at three angles, as in ruby and sapphire), a web
of caustic light pooled low in the stone, a few bright inclusions, a fresnel rim and a crisp reflection of the light
above. Each rim is a bevelled band of brushed metal, one per rarity metal. Faces and rims are drawn on the same
capsule, so CSS lays a rim over a face and stretches both to the marker (a little, so the stone still reads).
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'ui', 'gems') + '/'
SS = 2                       # supersampling
RIM = 0.13                   # the rim's width, as a share of the marker's height

SHAPES = {'badge': (256, 136), 'pill': (480, 128)}

# The stones: the colour light keeps passing through them (absorption is its complement), how much silk, how cloudy.
STONES = {
    'ruby':       dict(t=(1.00, 0.10, 0.20), silk=1.0, cloud=0.5, sheen=None),
    'garnet':     dict(t=(0.90, 0.16, 0.08), silk=0.2, cloud=0.6, sheen=None),
    'topaz':      dict(t=(1.00, 0.80, 0.34), silk=0.3, cloud=0.4, sheen=None),
    'citrine':    dict(t=(1.00, 0.90, 0.50), silk=0.2, cloud=0.35, sheen=None),
    'sapphire':   dict(t=(0.14, 0.38, 1.00), silk=1.0, cloud=0.5, sheen=None),
    'emerald':    dict(t=(0.12, 0.85, 0.42), silk=0.1, cloud=0.9, sheen=None),
    'amethyst':   dict(t=(0.70, 0.32, 1.00), silk=0.3, cloud=0.6, sheen=None),
    'aquamarine': dict(t=(0.20, 0.86, 0.86), silk=0.2, cloud=0.4, sheen=None),
    'moonstone':  dict(t=(0.66, 0.70, 0.78), silk=0.0, cloud=0.8, sheen=(0.45, 0.65, 1.0)),
    'smoky':      dict(t=(0.58, 0.58, 0.64), silk=0.3, cloud=0.5, sheen=None),
}
METALS = {
    'silver': ((1.0, 1.0, 1.0), (0.79, 0.82, 0.87), (0.42, 0.45, 0.52)),
    'gold':   ((1.0, 0.96, 0.81), (0.88, 0.71, 0.33), (0.52, 0.34, 0.08)),
    'violet': ((0.97, 0.94, 1.0), (0.73, 0.65, 0.88), (0.38, 0.30, 0.58)),
}


def fbm(shape, base, octaves, seed, gain=0.55):
    g = np.random.default_rng(seed); h, w = shape; out = np.zeros(shape); amp = 1; tot = 0
    for o in range(octaves):
        n = base * 2 ** o
        grid = g.random((max(2, int(n * h / w)) + 3, n + 3))
        up = zoom(grid, (h / (grid.shape[0] - 3), w / (grid.shape[1] - 3)), order=3)[:h, :w]
        out += amp * up; tot += amp; amp *= gain
    out /= tot; out -= out.min(); return out / out.max()


def smoothstep(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def capsule(W, H):
    """Signed distance to a capsule filling W x H (pixels), negative inside, and the coordinates."""
    y, x = np.mgrid[0:H, 0:W].astype(float)
    x = x - (W - 1) / 2; y = y - (H - 1) / 2
    R = H / 2; half = W / 2 - R
    dx = np.maximum(np.abs(x) - half, 0)
    return np.hypot(dx, y) - R, x, y


def face(shape, stone, seed):
    W, H = SHAPES[shape]; W *= SS; H *= SS
    d, x, y = capsule(W, H)
    rim = RIM * H; R = H / 2 - rim * 0.55                # the stone runs a little under the rim
    di = d + rim * 0.45
    t = np.clip(-di / R, 0, 1)
    z = np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1))          # the dome's height, 0 at the edge, 1 along the middle
    gy, gx = np.gradient(z * R)
    n = np.dstack([-gx, -gy, np.ones_like(z)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    s = STONES[stone]; T = np.array(s['t'])
    u, v = x / R, y / R                                   # stone units

    # Body: light through the stone, absorbed by its thickness, and less where it glows from behind.
    veil = fbm(z.shape, 3, 5, seed)
    cloud = fbm(z.shape, 6, 4, seed + 1)
    thick = 0.35 + 1.6 * (1 - z) + s['cloud'] * 0.6 * (cloud - 0.5)
    body = T[None, None] ** (2.2 + 3.2 * thick[..., None]) * (0.3 + 0.55 * z[..., None] ** 1.8)
    body *= (0.82 + 0.36 * veil[..., None])
    if s['sheen'] is not None:                            # a moonstone's blue sheen floating in it
        sheen = smoothstep(0.45, 0.9, fbm(z.shape, 2, 3, seed + 7)) * z
        body += np.array(s['sheen'])[None, None] * sheen[..., None] * 0.3

    # Caustics: light pooled low in the stone, broken into a fine bright web.
    pool = np.exp(-(u / 2.4) ** 2 - ((v - 0.45) / 0.42) ** 2) * z
    web = gaussian_filter((1 - np.abs(np.sin(fbm(z.shape, 4, 3, seed + 2) * 12))) ** 6, 1.4 * SS)
    body += (T ** 0.6)[None, None] * (pool * (0.32 + 0.45 * web))[..., None]

    # Silk: fine needles at three angles, 60 degrees apart, catching the light faintly.
    if s['silk']:
        g = np.random.default_rng(seed + 3); silk = np.zeros(z.shape)
        for _ in range(int(260 * s['silk'] * W / 256)):
            a = np.pi / 3 * g.integers(3) + g.normal(0, 0.03); L = g.uniform(4, 22) * SS
            cx, cy = g.uniform(-W / 2, W / 2), g.uniform(-H / 2, H / 2)
            k = np.linspace(-L / 2, L / 2, int(L))
            px = np.clip((cx + k * np.cos(a) + (W - 1) / 2).astype(int), 0, W - 1)
            py = np.clip((cy + k * np.sin(a) + (H - 1) / 2).astype(int), 0, H - 1)
            silk[py, px] += g.uniform(0.2, 1)
        silk = gaussian_filter(silk, 0.5 * SS) * z
        body += (T ** 0.4 * 0.8 + 0.1)[None, None] * np.clip(silk, 0, 1)[..., None] * 0.22

    # A few bright inclusions.
    g = np.random.default_rng(seed + 4); spark = np.zeros(z.shape)
    for _ in range(int(5 * W / 256)):
        spark[g.integers(H // 4, H * 3 // 4), g.integers(W // 6, W * 5 // 6)] = g.uniform(0.6, 1.4)
    spark = gaussian_filter(spark, 0.7 * SS) * 22 * z
    body += np.clip(spark, 0, 1.2)[..., None] * (T ** 0.2)[None, None]

    # Surface: fresnel at the edge, a broad soft reflection and a crisp one of the light above, top left of centre.
    fres = (1 - z) ** 3
    L1 = np.array([-0.25, -0.75, 0.62]); L1 /= np.linalg.norm(L1)
    hv = L1 + np.array([0, 0, 1.0]); hv /= np.linalg.norm(hv)
    ndh = np.clip((n * hv).sum(2), 0, 1)
    spec = ndh ** 160 * 1.0 + ndh ** 20 * 0.1
    window = smoothstep(0.55, 0.85, z) * np.exp(-((v + 0.45) / 0.13) ** 2) * smoothstep(-2.9, -1.6, u * (W / H) / 2) \
        * smoothstep(2.9, 1.6, u * (W / H) / 2) * 0.32
    col = body + fres[..., None] * 0.18 * (T ** 0.5)[None, None] + (spec + window)[..., None]
    col *= (0.75 + 0.25 * smoothstep(0, 0.25, t))[..., None]   # a dark line where the stone meets its rim

    a = smoothstep(1.0, -1.0, di)
    return finish(col, a, f'marker-{shape}-{stone}.webp')


def rim(shape, metal, seed=90):
    W, H = SHAPES[shape]; W *= SS; H *= SS
    d, x, y = capsule(W, H)
    w = RIM * H
    uu = np.clip(-d / w, 0, 1)                            # 0 at the outer edge, 1 at the inner
    prof = np.sin(np.pi * uu)                             # a rounded band
    gy, gx = np.gradient(prof * w * 0.8)
    n = np.dstack([-gx, -gy, np.ones_like(prof)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    hi, mid, lo = (np.array(c) for c in METALS[metal])
    L = np.array([0.0, -0.7, 0.7]); L /= np.linalg.norm(L)
    lam = np.clip((n * L).sum(2), 0, 1)
    hv = L + np.array([0, 0, 1.0]); hv /= np.linalg.norm(hv)
    spec = np.clip((n * hv).sum(2), 0, 1) ** 40
    k = lam[..., None]
    col = lo[None, None] * (1 - k) + mid[None, None] * k
    col = col + (hi - mid)[None, None] * (spec[..., None] * 1.2)
    # Brushed: fine streaks along the band.
    g = np.random.default_rng(seed)
    brush = gaussian_filter(g.random((H, W)), (0.4 * SS, 6 * SS)); brush = (brush - brush.mean()) / brush.std()
    col *= (1 + 0.02 * brush)[..., None]
    # Grooves at both edges of the band.
    col *= (0.55 + 0.45 * smoothstep(0, 0.18, uu) * smoothstep(1, 0.8, uu))[..., None]
    a = smoothstep(1.0, -1.0, d) * smoothstep(-w - 1.0, -w + 1.0, d)
    return finish(col, a, f'marker-{shape}-rim-{metal}.webp')


def finish(col, a, name):
    img = np.dstack([np.clip(col, 0, 1) * 255, np.clip(a, 0, 1)[..., None] * 255]).astype(np.uint8)
    im = Image.fromarray(img, 'RGBA')
    im = im.resize((im.width // SS, im.height // SS), Image.LANCZOS)
    im.save(OUT + name, 'WEBP', quality=90, method=6)
    print(name, f'{os.path.getsize(OUT + name) // 1024}KB')


if __name__ == '__main__':
    for shape in SHAPES:
        for i, stone in enumerate(STONES):
            face(shape, stone, 10 + 7 * i)
        for metal in METALS:
            rim(shape, metal)
