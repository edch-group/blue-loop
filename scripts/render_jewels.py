#!/usr/bin/env python3
# Usage: pip install numpy scipy pillow && python3 scripts/render_jewels.py
"""Render the stat jewels (src/ui/jewels/): a round brilliant-cut stone in a gold setting.

Health is an emerald, stability a topaz, and a value about to run out a ruby. Each is
seen from above: the stone's table, star, kite and upper-girdle facets, each lit from
the top left with its own sparkle and fine dark seams; set in a polished gold bezel
with a stepped inner lip, a row of milgrain beads round its rim, and four claws
gripping the stone. The number sits over the table, in HTML.
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

N = 320          # rendered at 4x the largest size shown, then scaled down
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'ui', 'jewels') + '/'
os.makedirs(OUT, exist_ok=True)
y, x = np.mgrid[0:N, 0:N].astype(float)
c = (N - 1) / 2
dx, dy = (x - c) / (N / 2), (y - c) / (N / 2)
r = np.hypot(dx, dy)
th = np.arctan2(dy, dx)

GEM = 0.66      # the stone's girdle
LIP = 0.72      # the bezel's inner lip
BEAD0, BEAD1 = 0.88, 0.97   # the milgrain row
L = np.array([-0.45, -0.62, 0.64]); L /= np.linalg.norm(L)   # key light: top left, in front


def norm3(nx, ny, nz):
    m = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9
    return nx / m, ny / m, nz / m


def env(rx, ry, rz):
    """A studio: a bright softbox up and to the left, a dim floor, a thin rim light right."""
    up = np.clip(-ry * 0.8 - rx * 0.4 + 0.2, 0, 1)
    box = np.exp(-((rx + 0.45) ** 2 + (ry + 0.55) ** 2) / 0.06)
    rim = np.exp(-((rx - 0.75) ** 2 + (ry + 0.1) ** 2) / 0.02) * 0.6
    return np.clip(0.12 + 0.55 * up ** 1.5 + 1.2 * box + rim, 0, 1.6)


def reflect(nx, ny, nz):
    d = nz  # view is (0, 0, 1)
    return 2 * d * nx, 2 * d * ny, 2 * d * nz - 1


def lerp3(a, b, t):
    t = t[..., None]
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def ramp(stops, t):
    """Colour along a ramp of (position, rgb) stops."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,))
    for (p0, c0), (p1, c1) in zip(stops[:-1], stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t - p0) / max(p1 - p0, 1e-6))[m]
        out[m] = np.asarray(c0) * (1 - k[:, None]) + np.asarray(c1) * k[:, None]
    return out


hex2 = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255
GOLD = [(0, hex2('#4a2e08')), (0.18, hex2('#8a5c14')), (0.4, hex2('#d29a2c')), (0.62, hex2('#f2c95a')), (0.82, hex2('#fff1b0')), (1, hex2('#ffffff'))]


def gold(nx, ny, nz, grain=0.0):
    rx, ry, rz = reflect(nx, ny, nz)
    v = env(rx, ry, rz) * 0.6 + np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1) * 0.42 + grain
    return ramp(GOLD, v)


def stone(deep, mid, light):
    """The brilliant-cut stone: its colour, and an alpha for where it is."""
    S16 = 2 * np.pi / 16
    phi = np.mod(th + np.pi / 2, 2 * np.pi)
    sec = np.mod(np.floor(phi / S16), 16)
    a = (phi - (sec + 0.5) * S16) / (S16 / 2)          # -1..1 across a 16th
    rr = r / GEM
    # The table: an octagon.
    oct_a = np.mod(phi, 2 * np.pi / 8) - np.pi / 8
    table_r = 0.46 / np.cos(oct_a) * np.cos(np.pi / 8)
    in_table = rr < table_r
    # Star facets point out from the table's sides; kites reach in from the girdle; upper girdle facets between.
    star_edge = table_r + (0.74 - table_r) * (1 - np.abs(a))
    kite = (~in_table) & (rr >= star_edge) & (rr < 0.86 + 0.14 * (1 - np.abs(a)))
    star = (~in_table) & (rr < star_edge)
    girdle = (~in_table) & ~kite & ~star
    fid = np.where(in_table, 0, np.where(star, 1 + sec, np.where(kite, 17 + sec * 2 + (a > 0), 50 + sec * 2 + (a > 0))))
    # Facet normals: the table flat, the crown facets tilting out at their own angles.
    centre = (sec + 0.5) * S16 - np.pi / 2
    offs = np.where(girdle | kite, np.sign(a) * S16 * 0.25, 0)
    ang = centre + offs
    tilt = np.where(in_table, 0, np.where(star, 0.36, np.where(kite, 0.62, 0.8)))
    nx, ny, nz = norm3(np.sin(tilt) * np.cos(ang), np.sin(tilt) * np.sin(ang), np.cos(tilt))
    rx, ry, rz = reflect(nx, ny, nz)
    e = env(rx, ry, rz)
    rng = np.random.default_rng(7)
    sparkle = rng.random(100)[fid.astype(int)]
    # Light through the stone: deep at the edges, glowing from within, each facet its own brightness.
    inner = np.clip(1 - rr, 0, 1)
    v = 0.22 + 0.36 * inner + 0.26 * sparkle + 0.3 * e
    col = ramp([(0, deep), (0.45, mid), (0.85, light), (1, np.ones(3))], v)
    # Specular: the softbox caught on a few facets, sharp and white.
    spec = np.clip(e - 0.95, 0, 1) ** 1.5 * 1.6
    col = col + spec[..., None]
    # A broad sheen across the table, and a glint at its top left.
    col += (np.exp(-((dx + 0.18) ** 2 + (dy + 0.22) ** 2) / 0.02) * 0.55)[..., None] * in_table[..., None]
    # Seams between facets: darker, hairline.
    seam = np.zeros_like(r)
    for f in (fid,):
        edge = (np.abs(np.diff(f, axis=0, prepend=f[:1])) > 0) | (np.abs(np.diff(f, axis=1, prepend=f[:, :1])) > 0)
        seam = np.maximum(seam, gaussian_filter(edge.astype(float), 0.5) * 1.4)
    col = col * (1 - np.clip(seam, 0, 0.3)[..., None])
    # The girdle's shadow under the lip.
    col = col * (1 - 0.45 * np.clip((rr - 0.9) / 0.1, 0, 1))[..., None]
    return np.clip(col, 0, 1)


def setting():
    """The gold bezel: inner lip, polished band, milgrain, and four claws."""
    col = np.zeros((N, N, 3))
    alpha = np.zeros((N, N))
    grain = (gaussian_filter(np.random.default_rng(3).random((N, N)), [0.6, 6]) - 0.5) * 0.12   # (a brushed finish)
    # The band: a half-round from the lip out to the beads.
    band = (r >= LIP) & (r < BEAD0)
    u = np.clip((r - LIP) / (BEAD0 - LIP), 0, 1)
    tilt = (u - 0.5) * 2.2
    nx, ny, nz = norm3(np.sin(tilt) * np.cos(th), np.sin(tilt) * np.sin(th), np.cos(tilt))
    col[band] = gold(nx, ny, nz, grain)[band]
    alpha[band] = 1
    # The inner lip: a narrow bevel stepping down to the stone, dark in its groove.
    lip = (r >= GEM) & (r < LIP)
    w = (r - GEM) / (LIP - GEM)
    lt = -0.9 + 0.3 * w
    nx, ny, nz = norm3(np.sin(lt) * np.cos(th), np.sin(lt) * np.sin(th), np.cos(lt))
    col[lip] = (gold(nx, ny, nz) * (0.55 + 0.45 * w[..., None]))[lip]
    alpha[lip] = 1
    # Milgrain: a ring of tiny beads.
    n_beads = 44
    bead_r = (BEAD0 + BEAD1) / 2
    k = np.round(th / (2 * np.pi / n_beads)) * (2 * np.pi / n_beads)
    bx, by = bead_r * np.cos(k), bead_r * np.sin(k)
    rb = (BEAD1 - BEAD0) / 2 * 1.05
    d = np.hypot(dx - bx, dy - by) / rb
    beads = d < 1
    bz = np.sqrt(np.clip(1 - d * d, 0, 1))
    nx, ny, nz = norm3((dx - bx) / rb, (dy - by) / rb, bz)
    col[beads] = gold(nx, ny, nz)[beads]
    alpha[beads] = 1
    # (The base under the beads, dark between them.)
    base = (r >= BEAD0 - 0.01) & (r < bead_r) & ~beads
    col[base] = hex2('#3a2408') * 1.0
    alpha[base] = 1
    # Four claws over the stone's edge, on the diagonals.
    for ang in np.deg2rad([45, 135, 225, 315]):
        cx, cy = 0.66 * np.cos(ang), 0.66 * np.sin(ang)
        # A teardrop along the radius: longer than wide.
        ux, uy = np.cos(ang), np.sin(ang)
        along = (dx - cx) * ux + (dy - cy) * uy
        across = -(dx - cx) * uy + (dy - cy) * ux
        e = (along / 0.12) ** 2 + (across / 0.075) ** 2
        claw = e < 1
        cz = np.sqrt(np.clip(1 - e, 0, 1))
        nx, ny, nz = norm3(along / 0.12 * ux - across / 0.075 * uy, along / 0.12 * uy + across / 0.075 * ux, cz * 1.2)
        cc = gold(nx, ny, nz)
        col[claw] = cc[claw]
        alpha[claw] = 1
    return col, alpha


def render(name, deep, mid, light):
    st = stone(hex2(deep), hex2(mid), hex2(light))
    set_col, set_a = setting()
    col = np.where((set_a > 0)[..., None], set_col, st)
    # The whole disc, its rim the beads' own outline (soft, for antialiasing).
    alpha = np.where(r < BEAD0, 1.0, np.where(set_a > 0, 1.0, 0.0))
    alpha = gaussian_filter(alpha, 0.8) * (r < BEAD1 + 0.03)
    img = np.dstack([np.clip(col, 0, 1) * 255, alpha * 255]).astype(np.uint8)
    Image.fromarray(img, 'RGBA').resize((160, 160), Image.LANCZOS).save(OUT + f'{name}.png', optimize=True)


render('emerald', '#022a16', '#0c8a48', '#7dffbe')
render('topaz', '#4a2200', '#d98a12', '#ffe7a0')
render('ruby', '#3a0008', '#cc1830', '#ffa0ac')
print('wrote', OUT)
