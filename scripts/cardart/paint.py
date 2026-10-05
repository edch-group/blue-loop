"""A small HDR painter for card art: noise, nebula skies, stars, suns, planets, glows, a numpy raymarcher,
bloom and tone mapping. Scenes are laid out in the cards' own 160x100 units (as in cardart.ts)."""
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image

import os
# The working resolution (CARDART_SCALE renders larger, for cleaner edges once scaled down).
SCALE = float(os.environ.get('CARDART_SCALE', '1'))
W, H = int(960 * SCALE), int(600 * SCALE)
K = W / 160  # pixels per art unit
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
X = (xx + 0.5) / K
Y = (yy + 0.5) / K


def hexc(h, gain=1.0):
    """'#rrggbb' -> linear RGB."""
    h = h.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    return (c ** 2.2) * gain


# ---------------------------------------------------------------- noise
def _h(*ints, seed=0):
    h = np.uint32(seed * 2654435761 & 0xffffffff)
    for i, p in zip(ints, (0x27d4eb2d, 0x165667b1, 0x9e3779b1)):
        h = h ^ (i.astype(np.uint32) * np.uint32(p))
        h = (h ^ (h >> np.uint32(15))) * np.uint32(0x2c1b3c6d)
    h = (h ^ (h >> np.uint32(12))) * np.uint32(0x297a2d39)
    h ^= h >> np.uint32(15)
    return h.astype(np.float32) / np.float32(4294967295.0)


def _s(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def noise2(x, y, seed=0):
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = _s(x - ix), _s(y - iy)
    ix, iy = ix.astype(np.int64), iy.astype(np.int64)
    a = _h(ix, iy, seed=seed); b = _h(ix + 1, iy, seed=seed)
    c = _h(ix, iy + 1, seed=seed); d = _h(ix + 1, iy + 1, seed=seed)
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy


def noise3(x, y, z, seed=0):
    ix, iy, iz = np.floor(x), np.floor(y), np.floor(z)
    fx, fy, fz = _s(x - ix), _s(y - iy), _s(z - iz)
    ix, iy, iz = ix.astype(np.int64), iy.astype(np.int64), iz.astype(np.int64)
    def L(a, b, t): return a + (b - a) * t
    out = []
    for dz in (0, 1):
        r0 = L(_h(ix, iy, iz + dz, seed=seed), _h(ix + 1, iy, iz + dz, seed=seed), fx)
        r1 = L(_h(ix, iy + 1, iz + dz, seed=seed), _h(ix + 1, iy + 1, iz + dz, seed=seed), fx)
        out.append(L(r0, r1, fy))
    return L(out[0], out[1], fz)


def worley2(x, y, seed=0):
    """Distance to the nearest and second-nearest feature point (cells)."""
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    d1 = np.full(x.shape, 9.0, np.float32); d2 = np.full(x.shape, 9.0, np.float32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            cx, cy = ix + ox, iy + oy
            px = cx + _h(cx, cy, seed=seed); py = cy + _h(cx, cy, seed=seed + 7)
            d = np.hypot(px - x, py - y)
            d2 = np.where(d < d1, d1, np.minimum(d2, d)); d1 = np.minimum(d1, d)
    return d1, d2


def fbm2(x, y, octaves=5, seed=0, gain=0.5, lac=2.03):
    s, a, t = 0, 1.0, 0
    for o in range(octaves):
        s = s + a * noise2(x, y, seed + o * 17)
        t += a; a *= gain; x = x * lac + 3.1; y = y * lac - 1.7
    return s / t


def fbm3(x, y, z, octaves=5, seed=0, gain=0.5, lac=2.03):
    s, a, t = 0, 1.0, 0
    for o in range(octaves):
        s = s + a * noise3(x, y, z, seed + o * 17)
        t += a; a *= gain; x = x * lac + 3.1; y = y * lac - 1.7; z = z * lac + 0.9
    return s / t


def ridge2(x, y, octaves=5, seed=0):
    s, a, t = 0, 1.0, 0
    for o in range(octaves):
        n = 1 - np.abs(noise2(x, y, seed + o * 31) * 2 - 1)
        s = s + a * n * n; t += a; a *= 0.5; x = x * 2.1 + 1.3; y = y * 2.1 - 0.7
    return s / t


def smooth(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- canvas
class Canvas:
    def __init__(self):
        self.c = np.zeros((H, W, 3), np.float32)

    def add(self, rgb, amount=1.0):
        """Add light (emission)."""
        self.c += np.asarray(rgb, np.float32) * (amount[..., None] if np.ndim(amount) == 2 else amount)

    def over(self, rgb, alpha):
        """Paint over (an opaque or partly opaque surface)."""
        a = np.clip(alpha, 0, 1)[..., None]
        self.c = self.c * (1 - a) + np.asarray(rgb, np.float32) * a

    def absorb(self, amount, tint=(1, 1, 1)):
        """Dim (dust lanes): multiply by exp(-amount * tint)."""
        self.c *= np.exp(-amount[..., None] * np.asarray(tint, np.float32))


# ---------------------------------------------------------------- sky
def nebula(cv, pal, seed, scale=1.0, warp=1.0, dust=1.0, glow_at=(80, 40), glow_r=70, bright=1.0):
    """A deep, domain-warped nebula in the palette's colours, with dark dust lanes."""
    s = 0.022 / scale
    px, py = X * s, Y * s
    qx = fbm2(px + 1.7, py + 9.2, 4, seed) * 4 * warp
    qy = fbm2(px + 8.3, py + 2.8, 4, seed + 5) * 4 * warp
    n = fbm2(px * 1.6 + qx, py * 1.6 + qy, 6, seed + 9)
    m = fbm2(px * 3.1 + qy * 0.6, py * 3.1 - qx * 0.6, 5, seed + 13)
    # Base: the sky's gradient, top to bottom.
    t = np.clip(Y / 100, 0, 1)[..., None]
    top, mid, low = (hexc(c) for c in pal['sky'])
    base = np.where(t < 0.62, top + (mid - top) * (t / 0.62), mid + (low - mid) * ((t - 0.62) / 0.38))
    cv.c = base * 0.12
    # Gas: brighter near the scene's light, in two colours.
    d = np.hypot(X - glow_at[0], (Y - glow_at[1]) * 1.3)
    near = np.exp(-(d / glow_r) ** 2)
    gas = smooth(0.42, 0.9, n) ** 2.2
    cv.add(hexc(pal['sky'][1]), smooth(0.25, 0.85, n) ** 1.5 * 0.4 * bright)
    cv.add(hexc(pal['glow']), gas * (0.08 + 0.5 * near) * bright)
    cv.add(hexc(pal['accent']), smooth(0.5, 0.92, m) ** 2.5 * gas * 0.35 * bright)
    cv.add(hexc(pal['sky'][2]), smooth(0.6, 0.95, m) * smooth(0.5, 0.9, n) * near * 0.3 * bright)
    cv.add(hexc(pal['glow']), near * 0.12 * bright)
    # Dust: dark filaments that eat the light.
    lanes = ridge2(px * 1.6 + qx * 0.5, py * 1.6 + qy * 0.5, 3, seed + 21)
    cv.absorb(smooth(0.6, 1.0, lanes) * 1.0 * dust * smooth(0.3, 0.7, n), tint=(0.9, 1.0, 1.15))


def stars(cv, seed, count=900, bright=1.0, spikes=4, tint=None, region=None):
    g = np.random.default_rng(seed)
    pts = np.zeros((H, W, 3), np.float32)
    xs = g.random(count) * W; ys = g.random(count) * H
    if region is not None:
        keep = region(xs / K, ys / K); xs, ys = xs[keep], ys[keep]
    b = np.minimum(g.pareto(2.6, len(xs)) * 0.18, 4) * bright
    temp = g.random(len(xs))
    cols = np.stack([1 - 0.25 * (temp < 0.3), 0.92 + 0.0 * temp, 0.8 + 0.3 * (temp < 0.3)], 1).astype(np.float32)
    if tint is not None: cols = cols * 0.6 + np.asarray(tint) * 0.4
    np.add.at(pts, (ys.astype(int), xs.astype(int)), cols * b[:, None])
    cv.c += gaussian_filter(pts, (0.7, 0.7, 0)) * 3 + gaussian_filter(pts, (2.5, 2.5, 0)) * 0.6
    # The brightest get diffraction spikes.
    for i in np.argsort(-b)[:spikes]:
        cx, cy, s = xs[i], ys[i], b[i]
        for ang in (0, np.pi / 2):
            u = (xx - cx) * np.cos(ang) + (yy - cy) * np.sin(ang)
            v = -(xx - cx) * np.sin(ang) + (yy - cy) * np.cos(ang)
            cv.add(cols[i], min(s, 3) * 0.35 * np.exp(-np.abs(v) / 0.6) * np.exp(-np.abs(u) / (6 + 8 * min(s, 2))))


# ---------------------------------------------------------------- bodies
def glow(cv, x, y, r, col, amount=1.0, falloff=2.0):
    d = np.hypot(X - x, Y - y) / r
    cv.add(col, amount / (1 + d ** falloff))


def gauss(cv, x, y, r, col, amount=1.0):
    cv.add(col, amount * np.exp(-((X - x) ** 2 + (Y - y) ** 2) / (r * r)))


def sun(cv, x, y, r, seed, hot=('#fff4d8', '#ffb347', '#ff6a1e'), corona=1.0, streamers=1.0, intensity=1.0, rot=0.0):
    dx, dy = (X - x) / r, (Y - y) / r
    d = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    inside = d < 1
    mu = np.sqrt(np.clip(1 - d * d, 0, 1))
    # Surface: granulation on the sphere, with limb darkening and sunspots.
    nz = mu
    # Granules: bright cells in dark lanes, squashed toward the limb, over slower churning.
    k = 1 / np.maximum(mu, 0.25)
    ux = np.arcsin(np.clip(dx, -1, 1)) * 26 + rot; uy = np.arcsin(np.clip(dy, -1, 1)) * 26
    d1, d2 = worley2(ux + fbm2(ux * 0.7, uy * 0.7, 2, seed) * 0.8, uy, seed)
    cells = smooth(0.0, 0.35, d2 - d1)
    g = cells * 0.18 + fbm3(dx * 4, dy * 4, nz * 4, 4, seed + 1) * 0.82
    spots = smooth(0.8, 0.86, fbm3(dx * 3, dy * 3, nz * 3, 3, seed + 3)) * 0
    c0, c1, c2 = (hexc(c) for c in hot)
    limb = 0.25 + 0.75 * mu ** 0.5
    heat = np.clip(0.5 + 1.1 * (g - 0.5) - spots * 0.5, 0, 1) * limb
    surf = (c2 + (c1 - c2) * smooth(0.2, 0.6, heat)[..., None] + (c0 - c1) * smooth(0.55, 0.95, heat)[..., None])
    a = smooth(1.0, 0.985, d)
    cv.over(surf * (1.2 + 3.0 * heat[..., None] ** 1.5) * intensity, a)
    # Corona: falls off with distance, broken into streamers.
    out = np.clip(d - 1, 0, None)
    stream = fbm2(th * 5 + seed, out * 1.5 - rot, 4, seed + 7)
    rays = 0.5 + streamers * (stream - 0.5) * 1.6
    cor = np.exp(-out * 3.2) * (0.6 + 0.8 * np.clip(rays, 0, None)) + 0.35 * np.exp(-out * 0.9) * np.clip(rays, 0, None)
    cv.add(c1, cor * (d >= 0.99) * 0.7 * corona * intensity)
    cv.add(c0, np.exp(-out * 9) * (d >= 0.99) * 1.2 * intensity)


def planet(cv, x, y, r, seed, kind='rock', cols=('#5a2a22', '#a0523a', '#d9a27a'), atmos='#ff9a6a',
           light=(-0.7, -0.5, 0.5), ambient=0.03, emit=None, rings=None):
    dx, dy = (X - x) / r, (Y - y) / r
    d2 = dx * dx + dy * dy
    inside = d2 < 1
    dz = np.sqrt(np.clip(1 - d2, 0, 1))
    L = np.asarray(light, np.float32); L = L / np.linalg.norm(L)
    ndl = dx * L[0] + dy * L[1] + dz * L[2]
    c0, c1, c2 = (hexc(c) for c in cols)
    if kind == 'gas':
        band = fbm2(dy * 3 + fbm2(dx * 2, dy * 8, 3, seed) * 0.8, dx * 0.4, 4, seed + 1)
        t = np.sin(dy * 9 + band * 6) * 0.5 + 0.5
        alb = c0 + (c1 - c0) * t[..., None] + (c2 - c1) * smooth(0.6, 0.9, band)[..., None]
    else:
        n = fbm3(dx * 2.5, dy * 2.5, dz * 2.5, 6, seed)
        cr = ridge2(dx * 4 + 7, dy * 4 + 3, 4, seed + 4)
        alb = c0 + (c1 - c0) * smooth(0.35, 0.65, n)[..., None] + (c2 - c1) * smooth(0.6, 0.85, n + cr * 0.2)[..., None]
    # Lambert with a soft terminator, and a little light wrapped round from the atmosphere.
    lit = np.clip(ndl, 0, None) ** 0.9 + 0.15 * smooth(-0.25, 0.15, ndl) * 0.4
    col = alb * (lit[..., None] * 1.6 + ambient)
    if emit is not None: col = col + emit(dx, dy, dz)
    cv.over(col, smooth(1.0, 0.99, np.sqrt(d2)))
    # Atmosphere: a thin rim of scattered light on the lit side, and a halo just outside.
    A = hexc(atmos)
    fres = (1 - dz) ** 3 * inside
    side = np.clip(ndl * 0.8 + 0.4, 0, 1)
    cv.add(A, fres * side * 1.6)
    out = np.clip(np.sqrt(d2) - 1, 0, None)
    halo_side = np.clip((dx * L[0] + dy * L[1]) / np.maximum(np.sqrt(d2), 1e-3) * 0.7 + 0.4, 0, 1)
    cv.add(A, np.exp(-out * 22) * (~inside) * halo_side * 0.9)


def polyline_dist(px, py, pts):
    """Distance from each pixel (art units) to a polyline, and the position along it (0..1)."""
    best = np.full(px.shape, 1e9, np.float32); along = np.zeros(px.shape, np.float32)
    seg_len = [np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:])]
    total = sum(seg_len); acc = 0
    for (ax, ay), (bx, by), ln in zip(pts[:-1], pts[1:], seg_len):
        vx, vy = bx - ax, by - ay
        t = np.clip(((px - ax) * vx + (py - ay) * vy) / max(ln * ln, 1e-9), 0, 1)
        dd = np.hypot(px - ax - t * vx, py - ay - t * vy)
        m = dd < best
        best = np.where(m, dd, best); along = np.where(m, (acc + t * ln) / total, along)
        acc += ln
    return best, along


def beam(cv, ax, ay, bx, by, width, core='#ffffff', halo='#ffb070', amount=1.0, taper=0.4):
    d, t = polyline_dist(X, Y, [(ax, ay), (bx, by)])
    w = width * (taper + (1 - taper) * t)
    cv.add(hexc(core), amount * 4 * np.exp(-(d / (w * 0.35)) ** 2))
    cv.add(hexc(halo), amount * 1.6 * np.exp(-(d / w) ** 2))
    cv.add(hexc(halo), amount * 0.35 * np.exp(-(d / (w * 4))))


def tube(cv, pts, width, col, amount=1.0, core=None, flicker_seed=None, fuzz=0.0):
    d, t = polyline_dist(X, Y, pts)
    f = 1.0
    if flicker_seed is not None: f = 0.6 + 0.8 * noise2(t * 30, t * 0 + 0.5, flicker_seed)
    if fuzz:
        turb = fbm2(X * 0.35, Y * 0.35, 3, (flicker_seed or 0) + 99)
        d = d * (1 - fuzz * 0.6) + fuzz * width * (turb - 0.5) * 3
        d = np.abs(d)
    cv.add(hexc(col), amount * f * np.exp(-(d / width) ** 2) * 1.4)
    cv.add(hexc(col), amount * f * 0.25 * np.exp(-d / (width * 3)))
    if core: cv.add(hexc(core), amount * f * 2.5 * np.exp(-(d / (width * 0.3)) ** 2))


# ---------------------------------------------------------------- raymarching (numpy, orthographic-ish camera)
def raymarch(sdf, bounds, cam_z=6.0, fov=0.5, steps=90, eps=2e-3, far=14.0, centre=(80, 50), scale=40):
    """March rays from a camera at (0,0,-cam_z) through the art window: art (x, y) maps to world
    ((x-cx)/scale, -(y-cy)/scale). Only pixels inside `bounds` (x0, y0, x1, y1 in art units) are marched.
    Returns (hit mask, positions, normals, steps-taken glow, ray dirs, sel) over the selected pixels."""
    x0, y0, x1, y1 = bounds
    sel = (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)
    wx = (X[sel] - centre[0]) / scale; wy = -(Y[sel] - centre[1]) / scale
    n = wx.size
    ro = np.zeros((n, 3), np.float32); ro[:, 2] = -cam_z
    rd = np.stack([wx * fov / 1.0 * cam_z / cam_z, wy * fov, np.ones(n, np.float32)], 1)
    # Aim so that the plane z=0 shows the art window at the given scale.
    rd[:, 0] = wx / cam_z; rd[:, 1] = wy / cam_z
    rd /= np.linalg.norm(rd, axis=1, keepdims=True)
    t = np.zeros(n, np.float32); hit = np.zeros(n, bool); alive = np.ones(n, bool)
    near = np.zeros(n, np.float32)  # closest approach (for glows)
    near[:] = 1e9
    for _ in range(steps):
        idx = np.nonzero(alive)[0]
        if idx.size == 0: break
        p = ro[idx] + rd[idx] * t[idx, None]
        d = sdf(p)
        near[idx] = np.minimum(near[idx], d)
        h = d < eps * (1 + t[idx])
        hit[idx[h]] = True
        t[idx] += np.maximum(d, eps * 0.5)
        dead = h | (t[idx] > far)
        alive[idx[dead]] = False
    p = ro + rd * t[:, None]
    e = 1.5e-3
    nrm = np.zeros_like(p)
    for i in range(3):
        o = np.zeros(3, np.float32); o[i] = e
        nrm[:, i] = sdf(p + o) - sdf(p - o)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-6)
    return hit, p, nrm, near, rd, sel


def scatter(sel, values, fill=0.0):
    out = np.full((H, W) + values.shape[1:], fill, np.float32)
    out[sel] = values
    return out


# ---------------------------------------------------------------- finishing
def bloom(c, strength=0.6, threshold=0.8):
    bright = np.clip(c - threshold, 0, None)
    acc = np.zeros_like(c)
    for s, w in ((3, 0.5), (9, 0.35), (24, 0.25), (60, 0.18)):
        acc += gaussian_filter(bright, (s * SCALE, s * SCALE, 0)) * w
    return c + acc * strength


def aces(x):
    a, b, cc, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((x * (a * x + b)) / (x * (cc * x + d) + e), 0, 1)


def finish(cv, path, exposure=0.9, bloom_amt=0.5, grain=0.012, vignette=0.35, ca=0.6, seed=0, size=None):
    c = bloom(cv.c * exposure, bloom_amt)
    # Lens: a touch of chromatic aberration toward the edges.
    if ca:
        from scipy.ndimage import map_coordinates
        cx, cy = W / 2, H / 2
        for ch, k in ((0, 1 + ca * 0.002), (2, 1 - ca * 0.002)):
            c[..., ch] = map_coordinates(c[..., ch], [cy + (yy - cy) / k, cx + (xx - cx) / k], order=1, mode='nearest')
    v = np.hypot((xx / W - 0.5) * 1.1, yy / H - 0.5)
    c *= (1 - vignette * smooth(0.35, 0.85, v))[..., None]
    out = aces(c) ** (1 / 2.2)
    out += (np.random.default_rng(seed).random((H, W, 1)).astype(np.float32) - 0.5) * grain
    img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGB')
    if size: img = img.resize(size, Image.LANCZOS)
    img.save(path, quality=90)
    return img
