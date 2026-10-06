#!/usr/bin/env python3
# Usage: pip install numpy scipy pillow && python3 scripts/render_energy.py
"""Render the energy cost gems (src/ui/gems/energy-*.png), in the rarity gems' manner (render_gems.py).

Each is a small polished cabochon in a fine, quiet silver bezel: a stone of the energy's colour with a glowing core deep
inside it (wisps of light round the core, faint motes in the stone), and the glass's window reflection and glint
over the top. Green is energy, amber the cost past a day's most energy, grey a cost that can't be paid now.
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom

N = 96
SS = 3
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'ui', 'gems') + '/'
M = N * SS
y, x = np.mgrid[0:M, 0:M].astype(float)
c = (M - 1) / 2
dx, dy = (x - c) / (M / 2), (y - c) / (M / 2)
r = np.hypot(dx, dy)
th = np.arctan2(dy, dx)
SOCK = 0.9          # the stone's radius; the bezel runs from here to the edge


def smoothstep(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def fbm(octaves, base, seed, gain=0.55):
    g = np.random.default_rng(seed); out = np.zeros((M, M)); amp = 1.0; tot = 0
    for o in range(octaves):
        n = base * 2 ** o
        up = zoom(g.random((n + 3, n + 3)), M / (n + 1), order=3)[:M, :M]
        out += amp * up; tot += amp; amp *= gain
    out /= tot; out -= out.min(); return out / out.max()


ENERGY = {
    'green': dict(deep=(0.02, 0.16, 0.08), mid=(0.10, 0.62, 0.34), core=(0.80, 1.00, 0.86), glow=1.0),
    'amber': dict(deep=(0.20, 0.08, 0.01), mid=(0.86, 0.52, 0.10), core=(1.00, 0.95, 0.74), glow=1.0),
    'grey':  dict(deep=(0.10, 0.11, 0.13), mid=(0.42, 0.45, 0.50), core=(0.72, 0.75, 0.80), glow=0.35),
}

stone = smoothstep(SOCK + 0.01, SOCK - 0.01, r)
bezel = smoothstep(SOCK - 0.02, SOCK + 0.005, r) * smoothstep(1.0, 0.975, r)
# The bezel: a rounded band, lit from above (the same both sides), with grooves at its edges.
u = np.clip((r - SOCK) / (1 - SOCK), 0, 1)
prof = np.sin(np.pi * u)
gy, gx = np.gradient(prof * 0.25)
nb = np.dstack([-gx * SS * 10, -gy * SS * 10, np.ones_like(r)]); nb /= np.linalg.norm(nb, axis=2, keepdims=True)
L = np.array([0.0, -0.7, 0.7]); L /= np.linalg.norm(L)
lam = np.clip((nb * L).sum(2), 0, 1)
metal = 0.42 + 0.22 * lam + 0.12 * np.clip((nb * (L + [0, 0, 1]) / np.linalg.norm(L + [0, 0, 1])).sum(2), 0, 1) ** 30
metal *= 0.6 + 0.4 * smoothstep(0, 0.2, u) * smoothstep(1, 0.8, u)
metal_rgb = metal[..., None] * np.array([0.78, 0.81, 0.87])

z = np.sqrt(np.clip(1 - (r / SOCK) ** 2, 0, 1))      # the stone's dome
wisp = fbm(5, 3, 7)
swirl = fbm(4, 4, 9)
motes = gaussian_filter((np.random.default_rng(5).random((M, M)) > 0.9993).astype(float), 0.7 * SS) * 30

for name, k in ENERGY.items():
    deep, mid, core = (np.array(k[q]) for q in ('deep', 'mid', 'core'))
    t = np.clip(1 - r / SOCK, 0, 1)
    body = deep + (mid - deep) * (t ** 0.8)[..., None]                              # rich at the edge, brighter in
    body *= (0.8 + 0.4 * swirl)[..., None]
    rc = np.hypot(dx, dy + 0.06)
    glow = np.exp(-(rc / 0.22) ** 2) * k['glow']                                    # the core, a little low
    wisps = np.exp(-(rc / 0.5) ** 2) * np.clip(wisp * 1.6 - 0.55, 0, 1) ** 1.5 * k['glow']
    body += core * (glow * 1.1 + wisps * 0.6)[..., None]
    body += core * (np.clip(motes, 0, 1) * z * 0.7 * k['glow'])[..., None]
    body *= (0.7 + 0.3 * smoothstep(0, 0.12, t))[..., None]                         # dark where it meets the bezel
    # Glass: a soft window reflection top left, a sharp glint, light caught low on the rim.
    hl = np.exp(-(((dx + 0.24) / 0.22) ** 2 + ((dy + 0.32) / 0.12) ** 2)) * 0.55
    hl += np.exp(-(((dx + 0.3) / 0.06) ** 2 + ((dy + 0.38) / 0.045) ** 2)) * 0.9
    hl += np.exp(-((r - (SOCK - 0.06)) / 0.04) ** 2) * np.clip(dy + 0.1, 0, 1) * 0.3
    rgb = np.where(stone[..., None] > 0.5, body + hl[..., None], metal_rgb)
    a = np.maximum(stone, bezel)
    img = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(a, 0, 1)[..., None] * 255]).astype(np.uint8)
    Image.fromarray(img, 'RGBA').resize((N, N), Image.LANCZOS).save(OUT + f'energy-{name}.png', optimize=True)
    print(f'energy-{name}.png', os.path.getsize(OUT + f'energy-{name}.png') // 1024, 'KB')
