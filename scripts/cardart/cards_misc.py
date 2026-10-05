"""Cards painted outside a race's own set (the first ones, made while trying the renderer out)."""
import numpy as np
from scipy.ndimage import gaussian_filter
from paint import *
from kit import shard_sdf, P_rot as rot

SCENES = {}


def scene(cid, **opts):
    def wrap(fn):
        SCENES[cid] = (fn, opts)
        return fn
    return wrap


def god_rays(cv, ox, oy, c, amount=0.4, seed=0, n=14):
    th = np.arctan2(Y - oy, X - ox)
    d = np.hypot(X - ox, Y - oy)
    shafts = smooth(0.4, 0.9, fbm2(th * n, th * 0 + seed, 2, seed)) * smooth(0.2, 0.9, fbm2(th * n * 1.7, d * 0.02, 2, seed + 3))
    cv.add(hexc(c), shafts * amount * np.exp(-d / 90) * smooth(0, 30, d))


@scene('solar_storm', pal='global', light_at=(80, 50), light_r=60, bright=0.8, dust=0.8)
def _(S):
    cv = S.cv
    pal = S.p
    # Twisting magnetic loops leap off the limb (prominences), and a flare tears loose.
    sx, sy, r = 80, 54, 19
    sun(cv, sx, sy, r, 13, corona=1.6, streamers=1.8, intensity=1.1)
    g = np.random.default_rng(14)
    for k in range(7):
        a0 = -np.pi / 2 + (k - 3) * 0.42 + g.normal(0, 0.08)
        span = 0.22 + g.random() * 0.18
        hgt = r * (0.35 + g.random() * 0.7)
        ts = np.linspace(0, 1, 40)
        ang = a0 - span / 2 + span * ts
        rad = r * 0.98 + hgt * np.sin(ts * np.pi) ** 0.8
        wob = g.normal(0, 0.6, 2)
        pts = [(sx + np.cos(a) * rr + wob[0] * np.sin(t * 6), sy + np.sin(a) * rr + wob[1] * np.sin(t * 5)) for a, rr, t in zip(ang, rad, ts)]
        tube(cv, pts, 1.3 + g.random() * 0.9, '#ff6a24', amount=0.9, core='#ffe0a0', flicker_seed=20 + k, fuzz=0.7)
    # A coronal mass ejection: a broken arc of plasma racing outward to the upper right.
    ts = np.linspace(-0.9, 0.9, 60)
    pts = [(sx + 34 * np.cos(-0.6 + t * 0.7) * 1.15, sy + 34 * np.sin(-0.6 + t * 0.7)) for t in ts]
    tube(cv, pts, 3.5, '#ff9a50', amount=0.35, flicker_seed=40, fuzz=0.9)
    tube(cv, [(p[0] + 4, p[1] - 3) for p in pts], 1.2, '#ffe0a0', amount=0.35, flicker_seed=41)
    # Charged particles streaming away.
    for k in range(26):
        a = g.uniform(-1.3, 0.1); d0 = g.uniform(26, 60); ln = g.uniform(6, 16)
        p0 = (sx + np.cos(a) * d0, sy + np.sin(a) * d0); p1 = (sx + np.cos(a) * (d0 + ln), sy + np.sin(a) * (d0 + ln))
        beam(cv, *p0, *p1, 0.35, core='#fff4e0', halo='#ffb070', amount=g.uniform(0.08, 0.3), taper=0.0)


@scene('coronal_lance', pal='attack', light_at=(30, 20), light_r=70, bright=0.7, dust=1.2)
def _(S):
    cv = S.cv
    pal = S.p
    px, py, pr = 118, 60, 26
    hit = (px - pr * 0.72, py - pr * 0.45)

    def burn(dx, dy, dz):
        # Where the lance strikes, the crust glows white hot and cracks spread out in lava.
        d = np.hypot(dx + 0.72, dy + 0.45)
        cracks = smooth(0.7, 0.9, ridge2(dx * 2.6 + 4, dy * 2.6, 3, 5)) ** 2
        heat = np.exp(-(d / 0.3) ** 2) * 4 + cracks * np.exp(-(d / 1.3) ** 2) * 3
        return hexc('#ff6a1e')[None, None] * heat[..., None] + hexc('#fff0c0') * (np.exp(-(d / 0.12) ** 2) * 10)[..., None]
    planet(cv, px, py, pr, 23, cols=('#1a1214', '#3e2a28', '#7a5446'), atmos='#ff7a4a', light=(-0.9, -0.55, 0.05), ambient=0.004, emit=burn)
    # The lance: from a source far off to the upper left, a hard white core in a sheath of fire.
    beam(cv, -10, -2, hit[0], hit[1], 3.2, core='#fffaf0', halo='#ff8a3a', amount=1.2, taper=0.6)
    tube(cv, [(-10, -2), hit], 9, '#ff5a1e', amount=0.18)
    # Impact: a flash, and debris spraying back out.
    glow(cv, *hit, 3, hexc('#fff0d0'), 2.5, 2.4)
    glow(cv, *hit, 10, hexc('#ff8a3a'), 0.5, 2.2)
    g = np.random.default_rng(24)
    for k in range(60):
        a = np.pi + g.normal(-0.4, 0.7); ln = g.uniform(2, 14); d0 = g.uniform(1, 5)
        p0 = (hit[0] + np.cos(a) * d0, hit[1] + np.sin(a) * d0); p1 = (hit[0] + np.cos(a) * (d0 + ln), hit[1] + np.sin(a) * (d0 + ln))
        tube(cv, [p0, p1], 0.22, '#ffc070', amount=g.uniform(0.3, 1.2))


@scene('leviathan_thoross', pal=dict(sky=['#06273a', '#0f5563', '#58a9a0'], glow='#5fd8c8', accent='#9a7aff', deep='#031520'), light_at=(80, 20), light_r=80, bright=1.0, dust=0.7)
def _(S):
    cv = S.cv
    pal = S.p
    god_rays(cv, 70, -40, '#9ff0e0', 0.22, seed=32, n=7)
    g = np.random.default_rng(34)
    cx, rim, a, b = 80, 46, 34, 30
    # Tentacles first (they hang behind the bell): long and fine, swaying, fading as they fall.
    for k in range(22):
        x0 = cx + (k / 21 - 0.5) * a * 1.7
        ph, amp, fr = g.uniform(0, 6), g.uniform(2, 6), g.uniform(0.05, 0.11)
        ys = np.linspace(rim, 104, 50)
        pts = [(x0 + amp * np.sin(y * fr + ph) * (y - rim) / 50 + (x0 - cx) * (y - rim) / 120, y) for y in ys]
        d, t = polyline_dist(X, Y, pts)
        w = 0.35 + 0.25 * (1 - t)
        fade = np.exp(-t * 2.2)
        cv.add(hexc('#7ff0e0'), np.exp(-(d / w) ** 2) * fade * 0.9 + np.exp(-d / 2.5) * fade * 0.06)
        # Beads of light along them.
        cv.add(hexc('#e0fff8'), np.exp(-(d / 0.5) ** 2) * fade * smooth(0.75, 0.9, noise2(t * 25, k * 3.3, 50)) * 0.35)
    # Oral arms: thick frilled ribbons in violet, curling down the middle.
    for k in range(4):
        x0 = cx + (k - 1.5) * 6
        ph = g.uniform(0, 6)
        ys = np.linspace(rim - 2, 88, 40)
        pts = [(x0 + 4 * np.sin(y * 0.12 + ph) * (y - rim + 4) / 30, y) for y in ys]
        d, t = polyline_dist(X, Y, pts)
        frill = 0.75 + 0.5 * fbm2(t * 40, d * 0.3 + k, 3, 40 + k)
        w = (2.6 - 1.8 * t) * frill
        body = np.exp(-(d / w) ** 4)
        edge = np.exp(-((d - w * 0.85) / 0.45) ** 2)
        cv.over(hexc('#2a1a4a') * 0.25, body * 0.55 * (1 - t * 0.6))
        cv.add(hexc('#d59cff'), edge * (1 - t) * 1.0 + body * 0.12)
    # The bell: a translucent dome (normals from a squashed hemisphere), its edge scalloped.
    nx = (X - cx) / a
    scallop = 1.6 * np.abs(np.sin(nx * np.pi * 4.5)) ** 0.6 * smooth(rim - 8, rim, Y)
    ny = (rim + scallop - Y) / b
    dome = (nx * nx + np.maximum(ny, 0) ** 2 < 1) & (ny > -0.04)
    nz = np.sqrt(np.clip(1 - nx * nx - np.maximum(ny, 0) ** 2, 0, 1))
    fres = (1 - nz) ** 2.2
    th = np.arctan2(ny, nx)
    ribs = np.abs(np.cos(th * 8)) ** 30 * nz
    lam = 0.5 + 0.5 * fbm2(X * 0.25, Y * 0.25, 4, 41)
    # Light shows through the body: a little absorption, glowing walls, ribs and a lit crown.
    soft = smooth(1.0, 0.93, np.sqrt(nx * nx + np.maximum(ny, 0) ** 2)) * smooth(-0.04, 0.02, ny)
    cv.absorb(soft * 0.35, tint=(1.2, 0.8, 0.7))
    cv.add(hexc('#b8fff2'), soft * (fres * 1.8 + ribs * 0.35 + 0.04 * lam))
    cv.add(hexc('#7ff0e0'), soft * smooth(0.3, 1.0, ny) * nz * 0.18)
    # The bell's rim: a thick, bright lip.
    cv.add(hexc('#c8fff4'), soft * smooth(0.12, 0.0, ny) * 0.8)
    # Inside: four glowing horseshoes, and the warm core.
    for k in range(4):
        ang = np.pi / 2 + (k - 1.5) * 0.55
        hx, hy = cx + np.cos(ang) * a * 0.32, rim - b * 0.32 - np.sin(ang) * 0 - (abs(k - 1.5) < 1) * 3
        d = np.abs(np.hypot((X - hx) / 1.0, (Y - hy) / 0.8) - 4.2)
        cv.add(hexc('#ffb0e8'), soft * np.exp(-(d / 0.8) ** 2) * smooth(-1, 2, Y - hy) * 0.7)
    gauss(cv, cx, rim - b * 0.45, 9, hexc('#ffd98a'), 0.6)
    # Specular: a soft window of light near the top left.
    cv.add(hexc('#ffffff'), soft * np.exp(-(((nx + 0.38) / 0.18) ** 2 + ((ny - 0.62) / 0.12) ** 2)) * 1.2)
    # Eyes round the rim: glowing globes with dark slit pupils.
    for k in range(11):
        ex = cx + (k / 10 - 0.5) * a * 1.62
        ey = rim + 1.6 * abs(np.sin((ex - cx) / a * np.pi * 4.5)) ** 0.6 - 1.2 - 2.2 * (1 - ((ex - cx) / a) ** 2)
        r = 1.6
        dd = np.hypot(X - ex, Y - ey) / r
        cv.over(hexc('#fff6d8') * 1.6, smooth(1.0, 0.85, dd))
        cv.over(hexc('#140a06') * 0.2, smooth(1.0, 0.7, np.hypot((X - ex) / 0.35, (Y - ey) / 1.15) / r))
        glow(cv, ex, ey, 1.8, hexc('#ffd98a'), 0.5, 2.5)
    # A crown of light: fine golden spines along the top of the bell.
    for k in range(9):
        ang = np.pi * (0.2 + 0.6 * k / 8)
        bx, by = cx + np.cos(ang) * a * 0.93, rim - np.sin(ang) * b * 0.93
        ln = 5 + 4 * np.sin(k / 8 * np.pi)
        beam(cv, bx, by, bx + np.cos(ang) * ln, by - np.sin(ang) * ln, 0.5, core='#fff6d8', halo='#ffc860', amount=0.5, taper=1.0)
    # Drifting motes.
    pts = np.zeros((H, W, 3), np.float32)
    xs, ys = g.random(160) * W, g.random(160) * H
    np.add.at(pts, (ys.astype(int), xs.astype(int)), hexc('#bfffee') * g.random((160, 1)) * 3)
    cv.c += gaussian_filter(pts, (1.4, 1.4, 0)) * 4


@scene('the_shardmind', pal='xelnaru', light_at=(80, 48), light_r=45, bright=0.6, dust=1.3)
def _(S):
    cv = S.cv
    pal = S.p
    sky = cv.c.copy()
    g = np.random.default_rng(53)
    shards = []
    # A crown of great shards round the core, tilted toward the viewer, and smaller ones drifting outside it.
    for k in range(12):
        a = k / 12 * 2 * np.pi + g.uniform(-0.25, 0.25)
        rr = 0.75 + g.uniform(0, 0.55)
        c = np.array([np.cos(a) * rr * 1.3, np.sin(a) * rr * 0.9 + 0.05, g.uniform(-0.5, 0.4)], np.float32)
        # Point outward from the core, tumbling a little.
        R_ = rot(g.uniform(-0.6, 0.6), g.uniform(0, np.pi), a - np.pi / 2 + g.uniform(-0.45, 0.45))
        big = g.uniform(0.7, 1.35)
        shards.append((c, R_, 0.12 * big, g.uniform(0.12, 0.34) * big, g.uniform(0.12, 0.22) * big))
    for k in range(10):
        a = g.uniform(0, 2 * np.pi); rr = g.uniform(1.6, 2.3)
        c = np.array([np.cos(a) * rr * 1.3, np.sin(a) * rr * 0.75, g.uniform(-0.6, 0.6)], np.float32)
        R_ = rot(*g.uniform(0, np.pi, 3))
        shards.append((c, R_, g.uniform(0.04, 0.08), g.uniform(0.05, 0.14), g.uniform(0.06, 0.1)))
    # The great shard above the core: the mind's spire.
    shards.append((np.array([0.05, 1.15, 0.2], np.float32), rot(0.25, 0.4, 0.12), 0.17, 0.32, 0.26))
    sdf = shard_sdf(shards)
    cx, cy, scale = 80, 50, 26
    hit, p, nrm, near, rd, sel = raymarch(sdf, (0, 0, 160, 100), cam_z=7, steps=80, centre=(cx, cy), scale=scale)
    h = hit
    P, N, V = p[h], nrm[h], -rd[h]
    # Light: the core inside (warm white), a cool key from the upper left, and the sky refracted through.
    toc = -P; dist = np.linalg.norm(toc, axis=1, keepdims=True); Lc = toc / dist
    ndl_c = np.clip((N * Lc).sum(1), 0, None)
    trans = np.clip(-(N * Lc).sum(1), 0, None)  # light coming through from the far side
    key = np.array([-0.5, 0.7, -0.5], np.float32); key /= np.linalg.norm(key)
    ndl_k = np.clip(N @ key, 0, None)
    Hk = key + V; Hk /= np.linalg.norm(Hk, axis=1, keepdims=True)
    spec = np.clip((N * Hk).sum(1), 0, None) ** 60
    ndv = np.clip((N * V).sum(1), 0, 1)
    fres = 0.04 + 0.96 * (1 - ndv) ** 5
    att = 1 / (0.3 + dist[:, 0] ** 2)
    # Refraction: the sky behind, bent by the facet and tinted rose.
    xs = (X[sel][h] + N[:, 0] * 9).clip(0, 159.9); ys = (Y[sel][h] - N[:, 1] * 9).clip(0, 99.9)
    behind = sky[(ys * K).astype(int), (xs * K).astype(int)]
    rose, violet, white = hexc('#ffb3c2'), hexc('#c9a2ff'), hexc('#fff4fa')
    facet = 0.6 + 0.4 * np.abs(np.sin((N @ np.array([3.1, 1.7, 2.3], np.float32)) * 4))
    # Deeper glass: the sky through it, darkened and tinted; facets catch the light unevenly; the end
    # nearest the core glows.
    facet = facet ** 2
    col = (behind * hexc('#d06a9a') * 1.1 * (1 - fres)[:, None]
           + violet * (ndl_k ** 2 * 0.25 * facet)[:, None]
           + rose * ((ndl_c * 0.5 + trans * 1.6) * att ** 1.3 * facet)[:, None]
           + white * (spec * 2.5 + fres * 0.25)[:, None])
    col *= 0.85
    img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
    idx = np.nonzero(sel); hi = (idx[0][h], idx[1][h])
    img[hi] = col; m[hi] = 1
    # Soften the silhouette a touch (no aliasing).
    m2 = gaussian_filter(m, 0.6)
    img = gaussian_filter(img, (0.5, 0.5, 0)) / np.maximum(gaussian_filter(m, 0.5)[..., None], 1e-3) * (m2 > 0)[..., None]
    # The core: light behind the shards first, then the shards over it.
    glow(cv, cx, cy, 4, hexc('#fff0f6'), 3.0, 2.4)
    glow(cv, cx, cy, 12, hexc('#ff9ac0'), 0.9, 2.0)
    th = np.arctan2(Y - cy, X - cx); d = np.hypot(X - cx, Y - cy)
    cv.add(hexc('#ffc8dc'), smooth(0.6, 0.95, fbm2(th * 4, th * 0, 2, 54)) * np.exp(-d / 26) * 0.7)
    cv.over(img, m2)
    # Edge glints: where the march passed close to a shard without hitting, a thin rim of light.
    rim = scatter(sel, np.exp(-(near / 0.006)) * (~hit))
    cv.add(hexc('#ffd0e0'), rim * 0.05)
