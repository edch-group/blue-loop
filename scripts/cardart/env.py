"""Places and things for scenes: skies with an atmosphere, land, cities, ruins, temples, interiors, sun-barques,
asteroids, crowds and the Stellari. Everything in the cards' 160x100 units, drawn onto a Scene."""
import numpy as np
from scipy.ndimage import gaussian_filter
from kit import X, Y, H, W, K, col, mix, quad, cubic, poly_mask, smooth, fbm2, noise2, ridge2, rounded_rect, rotate_pts, bevel_normals, lambert, specular


# ------------------------------------------------------------------------------------------------ skies
def sky(S, top, mid, low, horizon=70, sun=None, clouds=0.6, stars=0.4, seed=0):
    """An open sky (in place of space): a gradient to a glowing horizon, banks of cloud lit from below."""
    t = np.clip(Y / max(horizon, 1), 0, 1)[..., None]
    c = np.where(t < 0.55, col(top) + (col(mid) - col(top)) * (t / 0.55), col(mid) + (col(low) - col(mid)) * ((t - 0.55) / 0.45))
    S.cv.c = c * 0.9
    if stars:
        from paint import stars as pstars
        pstars(S.cv, S.seed % 977 + seed, count=500, bright=stars, spikes=1, region=lambda x, y: y < horizon * 0.6)
    if sun is not None:
        sx, sy, sr, sc = sun
        d = np.hypot(X - sx, (Y - sy) * 1.6)
        S.add(sc, 0.9 * np.exp(-d / 40) + 0.5 * np.exp(-d / 12))
    if clouds:
        n = fbm2(X * 0.025 + seed, Y * 0.12, 5, S.seed % 71 + seed)
        band = smooth(0.45, 0.75, n) * smooth(horizon + 4, horizon * 0.35, Y) * smooth(horizon * 0.15, horizon * 0.45, Y)
        lit = col(low) * 1.4
        if sun is not None:
            lit = lit * (0.6 + 1.2 * np.exp(-np.hypot(X - sun[0], Y - sun[1]) / 50))[..., None]
        under = smooth(0.4, 0.9, fbm2(X * 0.025 + seed, (Y + 1.5) * 0.12, 5, S.seed % 71 + seed))
        S.over(mix(top, mid, 0.5) * 0.5, band * clouds * 0.8)
        S.add(lit, band * clouds * (1 - under) * 0.9)


def god_rays(S, ox, oy, c, amount=0.4, n=10, reach=90):
    th = np.arctan2(Y - oy, X - ox)
    d = np.hypot(X - ox, Y - oy)
    shafts = smooth(0.42, 0.9, fbm2(th * n, th * 0 + S.seed % 7, 2, S.seed % 13)) * smooth(0.2, 0.9, fbm2(th * n * 1.7, d * 0.02, 2, S.seed % 17))
    S.add(c, shafts * amount * np.exp(-d / reach) * smooth(0, 15, d))


def haze(S, y0, y1, c, a=0.5):
    """Air: a band of light (dust, mist) between two heights."""
    S.add(c, a * smooth(y0, (y0 + y1) / 2, Y) * smooth(y1, (y0 + y1) / 2, Y))


# ------------------------------------------------------------------------------------------------ land
def ridges(S, y, c, layers=3, rough=1.0, lit=None, sun_x=80, seed=0):
    """Mountain ranges in layers, the far ones paled by the air, their crests lit from the sun's side."""
    for k in range(layers):
        far = 1 - k / max(layers - 1, 1)
        base = y - far * 14
        h = (fbm2(X * (0.03 + k * 0.012) + seed + k * 5, np.full_like(X, k * 3.0), 5, S.seed % 31 + k) - 0.5) * (18 - k * 4) * rough
        top = base - h - (6 - k)
        m = smooth(top - 0.2, top + 0.2, Y)
        shade = mix(c, S.p['sky'][2], far * 0.55) * (0.25 + 0.25 * far)
        S.over(shade, m)
        if lit is not None:
            side = smooth(30, -10, np.abs(X - sun_x) - 40)
            S.add(lit, np.exp(-np.clip(Y - top, 0, None) / 0.5) * m * (0.25 + 0.6 * side) * (0.5 + far * 0.5))


def ground_plane(S, y, c, lit=None, rocks=True):
    """Near ground: rough, dark, catching the light along its crests."""
    m = smooth(y - 0.3, y + 0.3, Y + (fbm2(X * 0.05, X * 0, 3, S.seed % 37) - 0.5) * 4)
    tex = 0.4 + 0.9 * fbm2(X * 0.15, Y * 0.5, 5, S.seed % 41)
    rk = smooth(0.62, 0.8, ridge2(X * 0.08, Y * 0.3, 4, S.seed % 43))
    S.over(col(c) * (tex * (0.5 + 0.5 * np.exp(-(Y - y) / 6)))[..., None], m)
    if lit is not None:
        S.add(lit, m * rk * np.exp(-(Y - y) / 8) * 0.08 + np.exp(-((Y - y) / 0.6) ** 2) * 0.3)


def cliff(S, pts, c, lit='#ffd9a0'):
    """A rock outcrop: a lit, fractured mass."""
    m = poly_mask(pts)
    n = bevel_normals(m, 2.5)
    cr = ridge2(X * 0.12, Y * 0.12, 5, S.seed % 47)
    tex = 0.5 + 0.8 * fbm2(X * 0.3, Y * 0.3, 4, S.seed % 53)
    base = col(c) * (tex * (0.2 + 0.9 * lambert(n)))[..., None]
    S.over(base, m)
    S.add(lit, m * smooth(0.8, 0.98, cr) * 0.06)
    S.add(lit, np.clip(m - gaussian_filter(m, 3), 0, 1) * lambert(n) * 0.8)


def asteroid(S, x, y, r, c='#6a5a52', lit='#ffe0b0', seed=0):
    th = np.arctan2(Y - y, X - x)
    rr = r * (1 + 0.22 * (fbm2(np.cos(th) * 2 + seed, np.sin(th) * 2, 3, S.seed % 59 + seed) - 0.5) * 2)
    d = np.hypot(X - x, Y - y)
    m = smooth(rr + 0.2, rr - 0.2, d)
    n = bevel_normals(m, r * 0.7)
    crater = smooth(0.55, 0.9, ridge2((X - x) / r * 3 + seed, (Y - y) / r * 3, 3, S.seed % 61 + seed))
    alb = col(c) * (0.6 + 0.6 * fbm2((X - x) / r * 4, (Y - y) / r * 4, 4, seed + 5))[..., None] * (1 - 0.3 * crater[..., None])
    S.over(alb * (0.06 + 1.2 * lambert(n)[..., None]), m)
    S.add(lit, m * np.exp(-((d - rr) / 0.5) ** 2) * lambert(n) * 0.5)


# ------------------------------------------------------------------------------------------------ built
WHITE_METAL = ('#f4f1ea', '#8a8fa0')


def spire(S, x, base, h, w, c0='#f4efe2', c1='#5a6a8a', windows=True, tip='#ffe7a8'):
    pts = [(x - w / 2, base), (x - w / 2, base - h * 0.75), (x - w * 0.15, base - h * 0.9), (x, base - h), (x + w * 0.15, base - h * 0.9), (x + w / 2, base - h * 0.75), (x + w / 2, base)]
    S.solid(pts, lambda m: mix(c0, c1, np.clip((Y - (base - h)) / h, 0, 1)[..., None]), bevel=min(w * 0.3, 1.2), shine=0.8, edge='#ffffff')
    if windows:
        g = np.random.default_rng(int(x * 31 + h))
        for _ in range(int(h / 3)):
            wx, wy = x + g.uniform(-0.3, 0.3) * w, base - g.uniform(0.05, 0.7) * h
            S.add('#ffd98a', 1.4 * np.exp(-(((X - wx) / 0.35) ** 2 + ((Y - wy) / 0.5) ** 2)))
    S.add(tip, 2 * np.exp(-((X - x) ** 2 + (Y - (base - h)) ** 2) / 0.6))


def city(S, base, x0, x1, scale=1.0, haze_c=None, seed=0):
    """A skyline of white-and-gold spires and domes, paling into the distance."""
    g = np.random.default_rng(S.seed % 1000 + seed)
    x = x0
    while x < x1:
        w = g.uniform(3, 7) * scale; h = g.uniform(10, 34) * scale
        if g.random() < 0.25:
            # A dome.
            r = w * 1.2
            pts = [(x - r + r * np.cos(a) * 0 + r * np.cos(a), base - r * 0.9 * np.sin(a)) for a in np.linspace(np.pi, 0, 20)]
            pts = [(x + r * np.cos(a), base - r * 0.9 * np.sin(a)) for a in np.linspace(np.pi, 0, 20)]
            S.solid(pts, '#e8e2d2', bevel=r * 0.5, shine=1.0, edge='#ffffff')
            S.add('#ffe7a8', 1.5 * np.exp(-((X - x) ** 2 + (Y - (base - r * 0.9)) ** 2) / 0.4))
        else:
            spire(S, x, base, h, w)
        x += w * g.uniform(0.9, 1.6)
    if haze_c is not None:
        haze(S, base - 30 * scale, base + 2, haze_c, 0.1)


def column(S, x, y0, y1, w, c0='#f6f1e4', c1='#8a7a62', broken=False):
    """A fluted column with a capital and base (broken off, for ruins)."""
    top = y0
    if broken:
        top = y0 + (y1 - y0) * 0.35
        pts = [(x - w / 2, y1), (x - w / 2, top + 2), (x - w * 0.1, top - 1.5), (x + w * 0.2, top + 1), (x + w / 2, top - 0.5), (x + w / 2, y1)]
    else:
        pts = [(x - w / 2, y1), (x - w / 2, top), (x + w / 2, top), (x + w / 2, y1)]
    m = poly_mask(pts)
    u = (X - x) / (w / 2)
    flute = 0.75 + 0.25 * np.abs(np.cos(u * np.pi * 3)) ** 0.5
    nz = np.sqrt(np.clip(1 - u * u, 0, 1))
    lit = np.clip(-u * 0.55 + nz * 0.8, 0, 1)
    base = mix(c0, c1, np.clip((Y - top) / max(y1 - top, 1), 0, 1)[..., None] * 0.6)
    S.over(base * (0.15 + 0.95 * lit * flute)[..., None], m)
    if not broken:
        S.solid(rounded_rect(x - w * 0.75, y0 - 2.2, w * 1.5, 2.6, 0.8), c0, bevel=0.6, shine=0.6)
    S.solid(rounded_rect(x - w * 0.7, y1 - 2.0, w * 1.4, 2.4, 0.8), c0, bevel=0.6, shine=0.6)


def steps(S, y, n, x0, x1, rise=2.4, c='#e8e0cc', shrink=3.0):
    """Stairs climbing away from the viewer."""
    for i in range(n):
        yy = y - i * rise
        a, b = x0 + i * shrink, x1 - i * shrink
        S.solid([(a, yy), (b, yy), (b, yy - rise), (a, yy - rise)], mix(c, '#3a3226', 0.35 + 0.05 * i), bevel=0.4, shine=0.4)
        S.add('#fff3d0', np.exp(-((Y - (yy - rise)) / 0.3) ** 2) * (X > a) * (X < b) * 0.6)


def floor(S, y, vp_x, c, reflect=0.45, tiles=True):
    """A polished floor from y down: it mirrors what stands above it, with tile seams running to the vanishing point."""
    m = smooth(y - 0.2, y + 0.2, Y)
    iy = np.clip(((2 * y - Y) * K).astype(int), 0, H - 1)
    mirrored = S.cv.c[iy, (X * K).astype(int).clip(0, W - 1)]
    fade = np.exp(-(Y - y) / 18)[..., None]
    base = col(c) * (0.3 + 0.4 * (1 - fade))
    S.over(base + mirrored * reflect * fade, m)
    if tiles:
        depth = np.maximum(Y - y, 0.3)
        u = (X - vp_x) / depth
        seams = smooth(0.06, 0.0, np.abs(((u * 2) % 1) - 0.5) - 0.44) + smooth(0.08, 0.0, np.abs(((np.log(depth) * 3) % 1) - 0.5) - 0.45)
        S.add('#fff3d0', m * np.clip(seams, 0, 1) * 0.12 * fade[..., 0])


def wall(S, pts_wall, holes=(), c0='#e9e3d6', c1='#6a6458', panels=True, trim='#ffe08a'):
    """An interior wall, with openings (windows) cut through to the sky behind."""
    m = poly_mask(pts_wall)
    for h in holes:
        m = m * (1 - poly_mask(h))
    a = np.asarray(pts_wall, float)
    y0, y1 = a[:, 1].min(), a[:, 1].max()
    n = bevel_normals(m, 1.0)
    base = mix(c0, c1, np.clip((Y - y0) / max(y1 - y0, 1), 0, 1)[..., None])
    tex = 0.85 + 0.15 * fbm2(X * 0.4, Y * 0.4, 3, S.seed % 67)
    if panels:
        tex = tex * (1 - 0.18 * smooth(0.12, 0.0, np.abs(((X / 14) % 1) - 0.5) - 0.38))
    S.over(base * (0.25 + 0.75 * lambert(n))[..., None] * tex[..., None], m)
    for h in holes:
        S.tube(list(h) + [h[0]], 0.6, mix(trim, '#000000', 0.6), trim, shine=1.2)
    return m


def console(S, x, y, w, h, screen='#9fe0ff'):
    """A bridge console: a white-metal desk with a glowing screen of lines and stars."""
    S.solid([(x, y + h), (x + w * 0.1, y), (x + w * 0.9, y), (x + w, y + h)], lambda m: mix('#e8e6e0', '#5a5e6a', np.clip((Y - y) / h, 0, 1)[..., None]), bevel=0.8, shine=1.0, edge='#ffe7a8')
    sx0, sx1, sy0, sy1 = x + w * 0.18, x + w * 0.82, y + h * 0.15, y + h * 0.55
    m = poly_mask([(sx0, sy0), (sx1, sy0), (sx1, sy1), (sx0, sy1)])
    lines = smooth(0.15, 0.0, np.abs(((Y - sy0) / 1.2) % 1 - 0.5) - 0.3) * (0.5 + 0.5 * noise2(X * 0.8, Y * 2, S.seed % 23))
    S.over(col('#08121e'), m)
    S.add(screen, m * (0.12 + lines * 0.6))


def hologram(S, x, y, r, c='#9fe0ff'):
    """A star chart of light above a projector: rings, worlds and the cone it hangs in."""
    S.add(c, 0.18 * smooth(r * 1.2, 0, np.abs(X - x) - (Y - (y - r)) * 0.15) * smooth(y - r * 1.1, y + r * 1.4, Y) * smooth(y + r * 1.6, y + r * 1.3, Y))
    for k, (rx, ry) in enumerate(((r, r * 0.3), (r * 0.7, r * 0.22), (r * 0.4, r * 0.12))):
        e = np.sqrt(((X - x) / rx) ** 2 + ((Y - y) / ry) ** 2)
        S.add(c, 0.9 * np.exp(-((e - 1) / (0.04 + k * 0.01)) ** 2))
    g = np.random.default_rng(S.seed % 97)
    for _ in range(9):
        a = g.uniform(0, 2 * np.pi); rr = g.uniform(0.2, 1.0)
        px, py = x + np.cos(a) * r * rr, y + np.sin(a) * r * 0.3 * rr - g.uniform(0, r * 0.4)
        S.add('#ffffff', 2 * np.exp(-((X - px) ** 2 + (Y - py) ** 2) / 0.25))
    S.add('#fff3c4', 3 * np.exp(-((X - x) ** 2 + (Y - y) ** 2) / 1.0))


def barque(S, x, y, L, facing=1, sun='#ffd98a', engines='#ffb070', detail=True):
    """An Aureline sun-barque, side on: a hull of white metal and gold, its sun carried between two pylons,
    a bridge forward and twin engines astern. `facing` 1 points the bow right."""
    f = facing
    P = lambda u, v: (x + f * u * L, y + v * L)
    hull = [P(-0.5, -0.02), P(-0.3, -0.06), P(0.3, -0.06), P(0.5, 0.0), P(0.32, 0.07), P(-0.42, 0.07), P(-0.5, 0.03)]
    S.solid(hull, lambda m: mix(WHITE_METAL[0], WHITE_METAL[1], np.clip((Y - (y - 0.06 * L)) / (0.13 * L), 0, 1)[..., None]), bevel=max(L * 0.02, 0.3), shine=1.2, power=50, edge='#ffe7a8')
    S.tube([P(-0.42, 0.0), P(0.42, 0.0)], max(L * 0.006, 0.2), '#7a5214', '#ffe08a', shine=1.0)
    for px in (-0.1, 0.12):
        S.solid([P(px - 0.02, -0.06), P(px + 0.01, -0.2), P(px + 0.03, -0.2), P(px + 0.02, -0.06)], '#e8e2d2', bevel=max(L * 0.006, 0.2), shine=1.0)
    S.sun(*P(0.02, -0.15), max(L * 0.045, 0.8), sun, rays=6)
    S.solid([P(0.22, -0.06), P(0.26, -0.11), P(0.34, -0.11), P(0.38, -0.06)], '#f4efe2', bevel=max(L * 0.01, 0.2), shine=1.0)
    if detail and L > 20:
        for i in range(8):
            S.add('#ffd98a', 1.2 * np.exp(-((X - P(-0.3 + i * 0.075, 0.02)[0]) ** 2 + (Y - P(0, 0.02)[1]) ** 2) / max(L * 0.004, 0.08)))
    for v in (-0.01, 0.045):
        ex, ey = P(-0.52, v)
        S.glow(ex, ey, L * 0.05, engines, 0.8)
        S.beam(ex, ey, ex - f * L * 0.35, ey, max(L * 0.012, 0.3), engines)


def stellari(S, x, y, r, tilt=0.55, open_=1.0, glow=1.0, stem=None):
    """The Stellari: a white flower of twelve long petals round a star of eighteen, glowing from within.
    `tilt` squashes it as seen from the side; `stem` (length) grows it from the ground with leaves."""
    if stem:
        S.tube(quad((x, y + stem), (x - 1.2, y + stem * 0.5), (x, y + r * 0.1)), max(r * 0.05, 0.35), '#2a5a3a', '#bfe8c0', shine=0.4)
        for k in (-1, 1):
            leaf = quad((x, y + stem * 0.65), (x + k * stem * 0.35, y + stem * 0.35), (x + k * stem * 0.5, y + stem * 0.55)) + quad((x + k * stem * 0.5, y + stem * 0.55), (x + k * stem * 0.25, y + stem * 0.62), (x, y + stem * 0.65))
            S.cloth(leaf, '#9fe0b0', '#2a5a3a', folds=2, bevel=0.6, sheen=0.4)
    S.glow(x, y, r * 2.4, '#fffaf0', 0.35 * glow)
    for layer, (n, length, width, a0) in enumerate(((12, 1.0, 0.29, 0.0), (18, 0.42, 0.11, 0.17))):
        acc = np.zeros((H, W), np.float32)
        rim = np.zeros((H, W), np.float32)
        for i in range(n):
            a = a0 + i * 2 * np.pi / n
            u = (X - x) * np.cos(a) + (Y - y) / tilt * np.sin(a)
            v = -(X - x) * np.sin(a) + (Y - y) / tilt * np.cos(a)
            if layer == 0:
                # Long petals that open out from the heart.
                L = r * length * open_
                e = np.sqrt(((u - L * 0.5) / (L * 0.55)) ** 2 + (v / (r * width)) ** 2)
            else:
                L = r * length
                e = np.abs(v) / (r * width) + np.abs(u - L * 0.45) / (L * 0.55)
            m = smooth(1.0, 0.85, e)
            acc = np.maximum(acc, m * (0.6 + 0.4 * (1 - np.clip(u / (r * length), 0, 1))))
            rim = np.maximum(rim, np.exp(-((e - 0.93) / 0.06) ** 2) * (u > 0))
        S.absorb(acc * 0.25)
        S.add('#fffaf2', acc * (0.55 if layer == 0 else 1.1) * glow + rim * 0.9 * glow)
        S.add('#e8f0ff', acc * 0.25 * glow)
    S.add('#ffffff', 4 * glow * np.exp(-(((X - x) / (r * 0.12)) ** 2 + ((Y - y) / (r * 0.12 * tilt)) ** 2)))
    S.glow(x, y, r * 0.6, '#fff6e0', 0.8 * glow)


def explosion(S, x, y, r, c='#ff8a3a'):
    d = np.hypot(X - x, Y - y) / r
    turb = fbm2((X - x) / r * 3, (Y - y) / r * 3, 5, S.seed % 79)
    body = smooth(1.0, 0.3, d + (turb - 0.5) * 0.8)
    S.add(c, body * (0.8 + turb) * 1.4)
    S.add('#fff3c4', smooth(0.5, 0.0, d + (turb - 0.5) * 0.6) * 2.5)
    S.glow(x, y, r * 2.5, c, 0.4)


def sparks(S, x, y, n, spread, c='#ffd070', up=True):
    g = np.random.default_rng(S.seed % 991 + int(x))
    for _ in range(n):
        a = (-np.pi / 2 if up else 0) + g.normal(0, 0.9)
        d0 = g.uniform(0, spread * 0.3); ln = g.uniform(1, 4)
        p0 = (x + np.cos(a) * d0, y + np.sin(a) * d0)
        p1 = (p0[0] + np.cos(a) * ln, p0[1] + np.sin(a) * ln + ln * 0.4)
        S.beam(*p0, *p1, 0.2, c, a=g.uniform(0.3, 1.0))
