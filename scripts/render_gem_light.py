#!/usr/bin/env python3
# Usage: pip install numpy scipy pillow && python3 scripts/render_gem_light.py
"""Render the light each rarity gem throws out onto its card (src/ui/gems/light-*.png).

The body inside the gem is trying to break out: a white dwarf's searing spikes and shimmering filaments, a
sun's corona streaming out in curling streamers with prominences looping off its edge, a black hole's
accretion streaks spiralling in and its lensed ring. Each is a few layers that CSS turns, breathes and
flickers out of step (styles.css, "The rarity gem's light"), so the light never repeats.

Each image is nearly four gem-widths across with the gem in the middle (its window, radius G, is left dark: the
gem covers it). Alpha carries the light, so it reads over the white card and over the picture alike.
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

N = 384
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'ui', 'gems') + '/'
y, x = np.mgrid[0:N, 0:N]
c = (N - 1) / 2
dx, dy = (x - c) / (N / 2), (y - c) / (N / 2)
r = np.hypot(dx, dy)
th = np.arctan2(dy, dx)
G = 0.26           # the gem's radius, in this image's half-widths (the image is 1 / G gem-widths across)
px = 2 / N         # one pixel, in the same units


def smoothstep(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


# Light starts just inside the gem's rim (under its bezel) and fades out before the image's edge.
ENVELOPE = smoothstep(G * 0.8, G * 1.02, r) * smoothstep(1.0, 0.62, r)


class Light:
    """Light added up in colour; saved as colour and alpha (alpha = how much light)."""
    def __init__(self):
        self.c = np.zeros((N, N, 3)); self.a = np.zeros((N, N))

    def add(self, amount, colour):
        colour = np.asarray(colour, dtype=float)
        if colour.ndim == 1: colour = np.broadcast_to(colour, (N, N, 3))
        self.c += colour * amount[..., None]; self.a += amount

    def save(self, name, gain=1.0):
        a = 1 - np.exp(-self.a * gain * ENVELOPE)          # soft saturation: bright cores, no hard clipping
        rgb = self.c / np.maximum(self.a, 1e-6)[..., None]
        img = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(a, 0, 1)[..., None] * 255]).astype(np.uint8)
        Image.fromarray(img, 'RGBA').save(OUT + name, optimize=True)
        print(name, f'{os.path.getsize(OUT + name) // 1024}KB')


def mix(a, b, t):
    t = np.clip(t, 0, 1)[..., None]
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def polar_noise(seed, n_th, n_r, sig_th, sig_r, warp=0.0):
    """Noise laid out in (angle, radius) and sampled back into the image: blurred long along the radius and
    narrow across it, it makes radial streaks; `warp` curls them (the angle drifts with the radius)."""
    g = np.random.default_rng(seed)
    P = gaussian_filter(g.random((n_th, n_r)), (sig_th, sig_r), mode=('wrap', 'nearest'))
    P = (P - P.min()) / (P.max() - P.min())
    ang = (th + warp * np.log(np.maximum(r, 1e-3) / G)) % (2 * np.pi)
    return map_coordinates(P, [ang / (2 * np.pi) * n_th, np.clip(r, 0, 1) * (n_r - 1)], order=1, mode='wrap')


def splat(points, weights, sigma):
    """Points (in image units) drawn as soft dots, summed."""
    img = np.zeros((N, N))
    xs = np.clip(((points[:, 0] + 1) / 2 * N).astype(int), 0, N - 1)
    ys = np.clip(((points[:, 1] + 1) / 2 * N).astype(int), 0, N - 1)
    np.add.at(img, (ys, xs), weights)
    return gaussian_filter(img, sigma)


def rays(light, seed, n, width, length, colour_in, colour_out, bright, angles=None):
    """Thin straight rays out of the gem: random filaments, or set spikes when `angles` is given."""
    g = np.random.default_rng(seed)
    angs = angles if angles is not None else g.random(n) * 2 * np.pi
    for a in angs:
        L = length * (0.35 + 0.65 * g.random()) if angles is None else length
        w = width * (0.6 + 0.8 * g.random()) if angles is None else width
        b = bright * (0.3 + 0.7 * g.random()) if angles is None else bright
        d = np.abs(wrap(th - a)) * r                     # distance across the ray
        along = np.exp(-np.maximum(r - G, 0) / L)
        amt = b * np.exp(-(d / (w * (1 + 2.5 * (r - G)))) ** 2) * along * (np.abs(wrap(th - a)) < np.pi / 2)
        light.add(amt, mix(colour_in, colour_out, (r - G) / (L * 2.2)))


# The light is subtle: fine grain and soft falloff, the same kind of detail as inside the gems (noise turned and
# swirled, not drawn strokes), faint enough that the card shows through it.

# ---------------------------------------------------------------- White dwarf: a searing point, finely rayed
ICE, WHITE, DEEP = [0.6, 0.78, 1.0], [0.92, 0.97, 1.0], [0.32, 0.5, 0.95]
near = np.maximum(r - G, 0)

L = Light()   # its glare, with faint diffraction spikes (four, and four fainter between)
L.add(2.0 * np.exp(-near / 0.08), mix(WHITE, ICE, near / 0.16))
rays(L, 1, 0, 0.005, 0.26, WHITE, ICE, 1.4, angles=np.radians([0, 90, 180, 270]))
rays(L, 2, 0, 0.004, 0.12, WHITE, ICE, 0.7, angles=np.radians([45, 135, 225, 315]))
L.save('light-dwarf-spikes.png')

for i, seed in enumerate([11, 12]):   # two fields of very fine radial grain, turned slowly against each other: shimmer
    L = Light()
    grain = polar_noise(seed, 1440, 128, 0.7, 26)
    grain = np.clip(grain * 1.6 - 0.65, 0, 1) ** 1.8
    L.add(6.0 * grain * np.exp(-near / 0.15), mix(WHITE, DEEP, near / 0.32))
    L.save(f'light-dwarf-shimmer{i + 1}.png')

L = Light()   # a few motes of light caught in it
g = np.random.default_rng(21)
for _ in range(16):
    rr = G * 1.15 + (0.85 - G * 1.15) * g.random() ** 1.5; aa = g.random() * 2 * np.pi
    d2 = (dx - rr * np.cos(aa)) ** 2 + (dy - rr * np.sin(aa)) ** 2
    L.add((1.0 + 1.0 * g.random()) * (1.1 - rr) * np.exp(-d2 / (2 * (px * 0.8) ** 2)), WHITE)
L.save('light-dwarf-sparks.png')

# ---------------------------------------------------------------- Stellar: a sun's corona spilling over its socket
CORE, GOLD, ORANGE, RED = [1.0, 0.93, 0.7], [1.0, 0.76, 0.3], [1.0, 0.52, 0.14], [0.86, 0.24, 0.06]

def sun_heat(t):
    """0 (hottest, nearest) to 1: white-gold, gold, orange, red."""
    t = np.clip(t, 0, 1)[..., None]
    return np.where(t < 0.33, mix(CORE, GOLD, t[..., 0] / 0.33), np.where(t < 0.66, mix(GOLD, ORANGE, (t[..., 0] - 0.33) / 0.33), mix(ORANGE, RED, (t[..., 0] - 0.66) / 0.34)))

for i, (seed, warp) in enumerate([(31, 0.35), (32, -0.28)]):   # the corona: fine streamers, curling a little as they leave
    L = Light()
    s = polar_noise(seed, 1080, 128, 1.2, 20, warp)
    s2 = polar_noise(seed + 100, 360, 128, 4, 12, warp * 1.3)
    streak = np.clip(s * 1.5 - 0.66, 0, 1) ** 2 * (0.4 + 0.8 * s2)
    L.add(10.0 * streak * np.exp(-near / (0.12 + 0.09 * s2)), sun_heat(0.25 + near / 0.32))
    L.add(1.4 * np.exp(-near / 0.05), CORE)
    L.save(f'light-sun-corona{i + 1}.png')

for i, seed in enumerate([41, 42]):   # prominences: thin threads of plasma arching off the rim, broken and faint
    g = np.random.default_rng(seed)
    L = Light()
    for _ in range(3):
        a0, span, h = g.random() * 2 * np.pi, 0.1 + 0.16 * g.random(), 0.06 + 0.1 * g.random()
        lean = (g.random() - 0.5) * 0.3
        t = np.linspace(0, 1, 1400)
        for strand in range(3):   # each loop a few threads, a hair apart
            off = (strand - 1) * 0.006
            rr = G * 0.98 + (h + off) * np.sin(np.pi * t)
            aa = a0 + span * (t - 0.5) + lean * np.sin(np.pi * t) ** 2 + off
            pts = np.stack([rr * np.cos(aa), rr * np.sin(aa)], axis=1)
            knots = np.interp(t, np.linspace(0, 1, 12), g.random(12)) ** 2     # brighter and dimmer along it
            w = (0.25 + 0.75 * knots) / len(t) * 90
            L.add(splat(pts, w, 1.0) * 1.0, sun_heat(np.full((N, N), 0.3)))
            L.add(splat(pts, w, 3.0) * 1.6, ORANGE)
    L.save(f'light-sun-flares{i + 1}.png')

# ---------------------------------------------------------------- Anomaly: light dragged round a black hole
LILAC, VIOLET, MAGENTA, NIGHT = [0.9, 0.84, 1.0], [0.6, 0.4, 1.0], [0.82, 0.36, 0.95], [0.26, 0.1, 0.5]

for i, (seed, k, gain) in enumerate([(51, 2.2, 8.0), (52, 1.5, 6.0)]):   # dust lanes along spirals: noise, swirled
    L = Light()
    lanes = polar_noise(seed, 1080, 128, 1.0, 18, k)
    broad = polar_noise(seed + 100, 240, 128, 6, 10, k)
    lane = np.clip(lanes * 1.6 - 0.7, 0, 1) ** 1.8 * (0.3 + 0.9 * broad)
    col = mix(mix(LILAC, VIOLET, near / 0.25), MAGENTA, np.clip(broad - 0.55, 0, 1) * 2)
    L.add(gain * lane * np.exp(-near / 0.18), col)
    L.save(f'light-hole-swirl{i + 1}.png')

L = Light()   # the lensed ring just outside the socket, rippling, and a dim violet haze
ripple = polar_noise(61, 720, 64, 2, 2)
ring = np.exp(-((r - G * 1.12) / (0.006 + 0.006 * ripple)) ** 2) * (0.4 + 0.8 * ripple)
L.add(2.2 * ring, mix(LILAC, VIOLET, ripple))
L.add(0.9 * np.exp(-near / 0.12), mix(VIOLET, NIGHT, near / 0.28))
L.save('light-hole-lens.png')
