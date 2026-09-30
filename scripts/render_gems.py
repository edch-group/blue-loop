#!/usr/bin/env python3
# Usage: pip install numpy scipy pillow && python3 scripts/render_gems.py
"""Render the rarity gems as layered RGBA images (src/ui/gems/).

Each gem is a tiny polished cabochon of dark glass set in a silver bezel, with
deep space inside it and the body glowing within: a white dwarf, a sun, or a
black hole. Layers are animated in CSS (the sun turns, the disk streams).
"""
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom, map_coordinates

N = 192
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'ui', 'gems') + '/'
y, x = np.mgrid[0:N, 0:N]
c = (N - 1) / 2
dx, dy = (x - c) / (N / 2), (y - c) / (N / 2)
r = np.hypot(dx, dy)
th = np.arctan2(dy, dx)
SOCK = 0.93   # socket (window) radius

def fbm(octaves, base, seed, gain=0.55):
    g = np.random.default_rng(seed); out = np.zeros((N, N)); amp = 1.0; tot = 0
    for o in range(octaves):
        n = base * 2 ** o
        up = zoom(g.random((n + 3, n + 3)), N / (n + 1), order=3)[:N, :N]
        out += amp * up; tot += amp; amp *= gain
    out /= tot; out -= out.min(); out /= out.max(); return out

def smoothstep(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def save(name, rgb, a):
    img = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(a, 0, 1)[..., None] * 255]).astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(OUT + name, optimize=True)

def light_layer(light, clip=None):
    """Emitted light → RGBA over whatever is below (alpha = brightness)."""
    a = np.clip(light.max(axis=2), 0, 1)
    rgb = np.where(a[..., None] > 1e-4, light / np.maximum(a[..., None], 1e-4), 0)
    if clip is not None: a = a * clip
    return np.clip(rgb, 0, 1), a

window = smoothstep(SOCK, SOCK - 0.03, r)          # 1 inside the glass window

# ---------- Sockets: a glass bed in the rarity's colour, in a bezel of its metal ----------
# White Dwarf: silver on icy blue. Stellar: gold on amber. Anomaly: violet silver on deep purple.
# The bed glows brightest at the centre, so the colour reads even at a few pixels across.
SOCKETS = {
    'dwarf': dict(centre=[0.62, 0.78, 1.0], edge=[0.10, 0.20, 0.42], metal=[0.95, 0.96, 0.99]),
    'stellar': dict(centre=[1.0, 0.72, 0.30], edge=[0.42, 0.14, 0.02], metal=[1.0, 0.84, 0.46]),
    'anomaly': dict(centre=[0.70, 0.42, 1.0], edge=[0.12, 0.03, 0.26], metal=[0.84, 0.76, 1.0]),
}
bez_in, bez_out = SOCK - 0.012, 0.995
bezel = smoothstep(bez_in - 0.01, bez_in + 0.01, r) * smoothstep(bez_out, bez_out - 0.02, r)
# Metal: lit from the top left, a bright rim edge and a darker groove.
light_dir = (-dx * 0.6 - dy * 0.8) / np.maximum(r, 1e-3)
u = np.clip((r - bez_in) / (bez_out - bez_in), 0, 1)
metal = 0.55 + 0.38 * light_dir * np.sin(u * np.pi) + 0.35 * np.exp(-((u - 0.35) / 0.12) ** 2) * (0.5 + 0.5 * light_dir)
neb = fbm(4, 6, 11)
stars = (np.random.default_rng(3).random((N, N)) > 0.9985) * np.random.default_rng(4).random((N, N)) * 0.5
stars = gaussian_filter(stars, 0.6) * 3
for name, k in SOCKETS.items():
    t = (1 - r / SOCK).clip(0, 1)[..., None] ** 0.9
    bed = np.array(k['edge']) + (np.array(k['centre']) - np.array(k['edge'])) * t
    bed = bed * (0.85 + 0.3 * neb[..., None]) + stars[..., None] * 0.6
    metal_rgb = np.clip(metal, 0, 1.1)[..., None] * np.array(k['metal'])
    rgb = np.where(bezel[..., None] > 0.5, metal_rgb, bed)
    save(f'socket-{name}.png', rgb, np.maximum(window, bezel))

# ---------- Glass: the cabochon's highlights, drawn over everything ----------
hl = np.exp(-(((dx + 0.32) / 0.28) ** 2 + ((dy + 0.42) / 0.16) ** 2)) * 0.75          # soft window reflection
hl += np.exp(-(((dx + 0.42) / 0.07) ** 2 + ((dy + 0.5) / 0.05) ** 2)) * 0.9           # sharp specular glint
rim = np.exp(-((r - (SOCK - 0.05)) / 0.035) ** 2) * np.clip(dy + 0.2, 0, 1) * 0.35       # light caught at the lower rim
save('glass.png', np.ones((N, N, 3)), np.clip((hl + rim) * window, 0, 1))

# ---------- White dwarf: a small, searing blue-white star ----------
cr = 0.17
core = smoothstep(cr, cr * 0.8, r)
b1 = np.exp(-np.maximum(r - cr * 0.8, 0) / 0.045)
b2 = 1 / (1 + (np.maximum(r - cr, 0) / 0.12) ** 2)
light = core[..., None] * 1.4 + b1[..., None] * np.array([0.85, 0.92, 1.0]) * 1.0 + b2[..., None] * np.array([0.45, 0.6, 1.0]) * 0.55
save('dwarf.png', *light_layer(light, window))
twinkle = (1 / (1 + (np.maximum(r - cr, 0) / 0.26) ** 2)) * 0.5
save('dwarf-glow.png', np.ones((N, N, 3)) * np.array([0.7, 0.8, 1.0]), twinkle * window)

# ---------- Sun: granulated photosphere with limb darkening; a corona ----------
R = 0.58
mu = np.sqrt(np.clip(1 - (r / R) ** 2, 0, 1))
limb = 0.3 + 0.93 * mu ** 0.55
# Granulation: bright cells with dark lanes (a cellular-looking fbm), plus faculae and spots.
g1 = fbm(4, 24, 5, gain=0.5)
cells = 1 - np.abs(g1 - 0.5) * 2
cells = cells ** 3
spots = smoothstep(0.8, 0.9, fbm(3, 5, 17))
fac = fbm(3, 6, 23)
t = limb * (0.86 + 0.2 * cells) * (1 - 0.55 * spots) * (0.95 + 0.1 * fac)
tt = np.clip(t, 0, 1.15)[..., None]
c_limb = np.array([0.78, 0.26, 0.04]); c_mid = np.array([1.0, 0.63, 0.14]); c_hot = np.array([1.0, 0.93, 0.72])
col = np.where(tt < 0.72, c_limb + (c_mid - c_limb) * (tt / 0.72), c_mid + (c_hot - c_mid) * np.clip((tt - 0.72) / 0.4, 0, 1))
save('sun-disc.png', col, smoothstep(R, R - 0.012, r))
outer = np.maximum(r - R, 0)
wisps = 0.7 + 0.6 * fbm(4, 8, 29)
cor = (np.exp(-outer / 0.05) * 0.85 + np.exp(-outer / 0.16) * 0.4) * wisps * smoothstep(R - 0.05, R + 0.005, r)
save('sun-corona.png', np.ones((N, N, 3)) * np.array([1.0, 0.62, 0.22]), np.clip(cor, 0, 1) * window)

# ---------- Black hole ----------
Rs = 0.22
# Behind: the far side of the disk lensed up over the shadow and down under it, the photon ring
# hugging the shadow, all brighter on the approaching (left) side (relativistic beaming).
beam = 0.4 + 0.6 * (0.5 - 0.5 * np.cos(th)) ** 1.4
arc_up = np.exp(-((r - Rs * 1.5) / 0.085) ** 2) * smoothstep(0.15, -0.6, dy / np.maximum(r, 1e-3)) * 1.6
arc_dn = np.exp(-((r - Rs * 1.25) / 0.035) ** 2) * smoothstep(-0.1, 0.6, dy / np.maximum(r, 1e-3)) * 0.5
turb = 0.75 + 0.5 * fbm(4, 10, 31)
lum = (arc_up * 1.2 + arc_dn) * turb * beam
hot = np.array([1.0, 0.95, 0.85]); warm = np.array([1.0, 0.5, 0.14])
light = (warm + (hot - warm) * np.clip(lum, 0, 1)[..., None] ** 1.5) * lum[..., None] * 1.3
light += np.exp(-np.maximum(r - Rs, 0) / 0.22)[..., None] * np.array([0.3, 0.12, 0.45]) * 0.3
save('hole-back.png', *light_layer(light, window))
# The shadow and a razor-thin photon ring.
ring = np.exp(-((r - Rs * 1.04) / 0.012) ** 2) * (0.55 + 0.45 * beam) * 1.6
light = (warm + (hot - warm) * 0.8) * ring[..., None]
rgb, a = light_layer(light)
shadow = smoothstep(Rs, Rs - 0.012, r)
a = np.maximum(a, shadow); rgb = rgb * (1 - shadow[..., None])
save('hole.png', rgb, a * window)
# The accretion disk, face-on (CSS tilts it into perspective and turns it): gas streaks that run
# along the orbit, white-hot at the inner edge and cooling to deep orange outside.
rin, rout = 0.25, 0.78
nr, na = 48, 720
field = np.random.default_rng(41).random((nr, na))
field = gaussian_filter(field, sigma=(2.2, 18), mode=('nearest', 'wrap'))
field = (field - field.min()) / (field.max() - field.min())
rr = np.clip((r - rin) / (rout - rin), 0, 1) * (nr - 1)
aa = ((th + np.pi) / (2 * np.pi)) * na
st = map_coordinates(field, [rr, aa % na], order=1, mode='wrap')
heat = np.clip(1 - (r - rin) / (rout - rin), 0, 1)
band = smoothstep(rin, rin + 0.03, r) * smoothstep(rout, rout - 0.4, r)
dl = band * (0.45 + 0.9 * st ** 1.4) * (0.25 + 1.3 * heat ** 2.2)
dcol = np.array([0.7, 0.18, 0.04]) + (np.array([1.0, 0.93, 0.78]) - np.array([0.7, 0.18, 0.04])) * heat[..., None] ** 1.2
save('disk.png', *light_layer(dcol * dl[..., None] * 1.4))
print('ok')
