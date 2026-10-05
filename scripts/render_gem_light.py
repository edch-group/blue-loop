#!/usr/bin/env python3
# Usage: pip install numpy scipy pillow && python3 scripts/render_gem_light.py
"""Render the light each rarity gem throws out onto its card (src/ui/gems/light-*.png).

The body inside the gem is trying to break out: a white dwarf's searing spikes and shimmering filaments, a
sun's corona streaming out in curling streamers with prominences looping off its edge, a black hole's
accretion streaks spiralling in and its lensed ring. Each is a few layers that CSS turns, breathes and
flickers out of step (styles.css, "The rarity gem's light"), so the light never repeats.

Each image is five gem-widths across with the gem in the middle (its window, radius G, is left dark: the
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
G = 0.2            # the gem's radius, in this image's half-widths
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


def sparkles(seed, n, r0, r1, size, colour, light, bright=1.0):
    """Tiny four-pointed sparkles scattered round the gem, dimmer further out."""
    g = np.random.default_rng(seed)
    for _ in range(n):
        rr = r0 + (r1 - r0) * g.random() ** 1.6; aa = g.random() * 2 * np.pi
        cx, cy = rr * np.cos(aa), rr * np.sin(aa)
        s = size * (0.5 + g.random()); b = bright * (0.35 + 0.65 * g.random()) * (1.15 - rr)
        ddx, ddy = dx - cx, dy - cy
        core = np.exp(-(ddx ** 2 + ddy ** 2) / (2 * (s * 0.35) ** 2))
        spikes = np.exp(-(ddx / (s * 0.1)) ** 2) * np.exp(-np.abs(ddy) / (s * 1.4)) + np.exp(-(ddy / (s * 0.1)) ** 2) * np.exp(-np.abs(ddx) / (s * 1.4))
        light.add(b * (core * 1.5 + spikes * 0.7), colour)


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


# ---------------------------------------------------------------- White dwarf: searing, crystalline
ICE, WHITE, DEEP = [0.55, 0.75, 1.0], [0.92, 0.97, 1.0], [0.25, 0.45, 0.95]

L = Light()   # the spikes: four long, four short, like light through a telescope's vanes
rays(L, 1, 0, 0.010, 0.42, WHITE, ICE, 2.6, angles=np.radians([0, 90, 180, 270]))
rays(L, 2, 0, 0.007, 0.2, WHITE, ICE, 1.4, angles=np.radians([45, 135, 225, 315]))
L.add(1.6 * np.exp(-np.maximum(r - G, 0) / 0.09), mix(WHITE, ICE, (r - G) / 0.2))   # the glare round the gem
L.save('light-dwarf-spikes.png')

for i, (seed, n) in enumerate([(11, 110), (12, 90)]):   # two fields of fine filaments, turned against each other: shimmer
    L = Light()
    rays(L, seed, n, 0.0035, 0.2, WHITE, DEEP, 1.1)
    L.save(f'light-dwarf-shimmer{i + 1}.png')

L = Light()
sparkles(21, 26, G * 1.2, 0.85, 0.022, ICE, L, 1.6)
L.save('light-dwarf-sparks.png')

# ---------------------------------------------------------------- Stellar: a sun boiling over its socket
CORE, GOLD, ORANGE, RED = [1.0, 0.95, 0.75], [1.0, 0.78, 0.3], [1.0, 0.5, 0.12], [0.85, 0.2, 0.05]

def sun_heat(t):
    """0 (hottest, nearest) to 1: white-gold, gold, orange, red."""
    t = np.clip(t, 0, 1)[..., None]
    return np.where(t < 0.33, mix(CORE, GOLD, t[..., 0] / 0.33), np.where(t < 0.66, mix(GOLD, ORANGE, (t[..., 0] - 0.33) / 0.33), mix(ORANGE, RED, (t[..., 0] - 0.66) / 0.34)))

for i, (seed, warp) in enumerate([(31, 0.55), (32, -0.4)]):   # the corona: streamers that curl as they leave
    L = Light()
    s = polar_noise(seed, 720, 160, 2.2, 22, warp)
    s2 = polar_noise(seed + 100, 360, 160, 5, 14, warp * 1.4)
    streak = np.clip(s * 1.45 - 0.62, 0, 1) ** 2.4 + 0.35 * np.clip(s2 * 1.3 - 0.55, 0, 1) ** 2
    fall = np.exp(-np.maximum(r - G, 0) / (0.17 + 0.14 * s2))
    L.add(6.5 * streak * fall, sun_heat(0.3 + (r - G) / 0.4))
    L.add(0.9 * np.exp(-np.maximum(r - G, 0) / 0.05), CORE)
    L.save(f'light-sun-corona{i + 1}.png', 1.2)

for i, seed in enumerate([41, 42]):   # prominences: loops of plasma lifting off the rim, with their glow
    g = np.random.default_rng(seed)
    L = Light()
    for _ in range(5):
        a0, span, h = g.random() * 2 * np.pi, 0.2 + 0.32 * g.random(), 0.16 + 0.3 * g.random()
        lean = (g.random() - 0.5) * 0.6
        t = np.linspace(0, 1, 900)
        rr = G * 0.98 + h * np.sin(np.pi * t) * (1 + 0.06 * np.sin(3 * np.pi * t + g.random() * 6))
        aa = a0 + span * (t - 0.5) + lean * np.sin(np.pi * t) ** 2
        pts = np.stack([rr * np.cos(aa), rr * np.sin(aa)], axis=1)
        flick = 0.55 + 0.45 * np.sin(23 * t + g.random() * 6) ** 2
        w = flick / len(t) * 115                          # about one unit of light per pixel of loop
        core = splat(pts, w, 0.9); glow = splat(pts, w, 3.5)
        L.add(core * 2.8, sun_heat(np.full((N, N), 0.4)))
        L.add(glow * 2.0, RED)
    # embers flung off
    sparkles(seed + 5, 18, G * 1.3, 0.8, 0.014, GOLD, L, 1.2)
    L.save(f'light-sun-flares{i + 1}.png', 1.1)

# ---------------------------------------------------------------- Anomaly: a black hole dragging the light round
LILAC, VIOLET, MAGENTA, NIGHT = [0.93, 0.86, 1.0], [0.62, 0.38, 1.0], [0.85, 0.3, 0.95], [0.24, 0.08, 0.5]

def spiral(L, seed, n, k, width, bright, dark=0.0):
    """Streaks along logarithmic spirals (angle = a0 + k ln(r / G)), each a broken length of arm."""
    g = np.random.default_rng(seed)
    lr = np.log(np.maximum(r, 1e-3) / G)
    for _ in range(n):
        a0 = g.random() * 2 * np.pi; kk = k * (0.8 + 0.4 * g.random())
        r1 = G * (1.0 + 0.6 * g.random()); r2 = r1 + 0.15 + 0.5 * g.random()
        d = np.abs(wrap(th - (a0 + kk * lr))) * r
        seg = smoothstep(r1 - 0.03, r1 + 0.03, r) * smoothstep(r2, r2 - 0.12, r)
        amt = np.exp(-(d / (width * (0.6 + 0.8 * g.random()) * (1 + 1.5 * (r - G)))) ** 2) * seg
        is_dark = g.random() < dark
        col = NIGHT if is_dark else mix(LILAC, MAGENTA if g.random() < 0.35 else VIOLET, (r - G) / 0.5)
        L.add(bright * (0.4 + 0.6 * g.random()) * amt, col)

L = Light(); spiral(L, 51, 46, 2.6, 0.006, 1.6, dark=0.25); L.save('light-hole-swirl1.png')
L = Light(); spiral(L, 52, 30, 1.8, 0.011, 1.1, dark=0.4); L.save('light-hole-swirl2.png')

L = Light()   # the lensed ring just outside the socket, and light bent round it, rippling
ripple = polar_noise(61, 360, 64, 3, 2)
ring = np.exp(-((r - G * 1.32) / (0.012 + 0.01 * ripple)) ** 2) * (0.6 + 0.8 * ripple)
L.add(2.2 * ring, mix(LILAC, VIOLET, ripple))
L.add(0.8 * np.exp(-((r - G * 1.62) / 0.03) ** 2) * ripple ** 2, VIOLET)
L.add(0.7 * np.exp(-np.maximum(r - G, 0) / 0.18), mix(VIOLET, NIGHT, (r - G) / 0.4))
sparkles(62, 14, G * 1.5, 0.85, 0.016, LILAC, L, 1.0)
L.save('light-hole-lens.png')
