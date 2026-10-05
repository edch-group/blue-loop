"""The scene kit: the same helpers the SVG card art is drawn with (sun, beam, planet, dome, rings...), painted
with light instead. A card's scene is written much as it is in src/ui/cardart.ts, in its 160x100 units."""
import hashlib
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
import paint as P
from paint import X, Y, W, H, K, hexc, smooth, fbm2, fbm3, noise2, ridge2

PAL = {
    'aureline': dict(sky=['#1d3a6b', '#4d6fae', '#e9c98f'], glow='#ffd98a', accent='#8fd0ff', deep='#132446'),
    'xelnaru': dict(sky=['#2c1638', '#6b2f5e', '#e8a2a8'], glow='#ffb3c2', accent='#c9a2ff', deep='#1b0c24'),
    'vorthane': dict(sky=['#06273a', '#0f5563', '#58a9a0'], glow='#ffd98a', accent='#7ff0e0', deep='#031520'),
    'ixquor': dict(sky=['#1b1433', '#3d2b5e', '#6f8f5a'], glow='#c5ff8a', accent='#d59cff', deep='#0e0a1c'),
    'attack': dict(sky=['#2a1320', '#6a2a2a', '#e08a5a'], glow='#ffb070', accent='#ffe0a0', deep='#180a10'),
    'defence': dict(sky=['#0f2140', '#2a5585', '#9cc8e8'], glow='#bfe6ff', accent='#ffffff', deep='#08142a'),
    'growth': dict(sky=['#0f2a24', '#23584a', '#9cd2a0'], glow='#c8ffd0', accent='#fff3b0', deep='#07181a'),
    'global': dict(sky=['#1a1036', '#4a2a7a', '#c79ae8'], glow='#f0d0ff', accent='#ffd98a', deep='#0c0820'),
    'command': dict(sky=['#1a1f2a', '#3c4658', '#a9b3c4'], glow='#e6ecf5', accent='#ffd98a', deep='#0d1016'),
    'nyxari': dict(sky=['#06050e', '#1b1638', '#4e4280'], glow='#e2d8ff', accent='#9d8cff', deep='#03020a'),
    'korrath': dict(sky=['#141110', '#3a302a', '#a8602e'], glow='#ffa040', accent='#e2b06a', deep='#0c0907'),
    'seren': dict(sky=['#070c24', '#22306a', '#9aa8d8'], glow='#f0f4ff', accent='#a9c4ff', deep='#050920'),
    'pyrr': dict(sky=['#1c0505', '#6a140c', '#f06a24'], glow='#ffd060', accent='#ff6a1e', deep='#160302'),
    'lightspeed': dict(sky=['#2a1a08', '#6a4210', '#e8b45a'], glow='#ffe2a0', accent='#fff6dc', deep='#170d03'),
}

# Light falls from the upper left, a little toward the viewer (x right, y down, z out of the screen).
LIGHT = np.array([-0.55, -0.65, 0.52], np.float32); LIGHT /= np.linalg.norm(LIGHT)
HALF = LIGHT + np.array([0, 0, 1], np.float32); HALF /= np.linalg.norm(HALF)


def col(c):
    return hexc(c) if isinstance(c, str) else np.asarray(c, np.float32)


def mix(a, b, t):
    return col(a) + (col(b) - col(a)) * t


# ------------------------------------------------------------------------------------------- geometry
def quad(p0, p1, p2, n=24):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2 = (np.asarray(p, float) for p in (p0, p1, p2))
    return list(map(tuple, (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2))


def cubic(p0, p1, p2, p3, n=30):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(p, float) for p in (p0, p1, p2, p3))
    return list(map(tuple, (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3))


def rotate_pts(pts, ang_deg, cx, cy):
    a = np.radians(ang_deg); c, s = np.cos(a), np.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def roi(pts, margin):
    a = np.asarray(pts, float)
    x0, y0 = a.min(0) - margin; x1, y1 = a.max(0) + margin
    i0, i1 = max(0, int(y0 * K)), min(H, int(np.ceil(y1 * K)) + 1)
    j0, j1 = max(0, int(x0 * K)), min(W, int(np.ceil(x1 * K)) + 1)
    if i1 <= i0 or j1 <= j0: return None
    return (slice(i0, i1), slice(j0, j1))


def poly_mask(pts, blur=0.0):
    """A polygon (art units) as an anti-aliased mask over the whole picture."""
    ss = 3
    img = Image.new('L', (W * ss, H * ss))
    ImageDraw.Draw(img).polygon([(x * K * ss, y * K * ss) for x, y in pts], fill=255)
    m = np.asarray(img.resize((W, H), Image.BOX), np.float32) / 255
    return gaussian_filter(m, blur * K) if blur else m


def seg_field(pts, sl):
    """Over a window: distance to a polyline, position along it (0..1), signed distance, and the side normal."""
    xs, ys = X[sl], Y[sl]
    best = np.full(xs.shape, 1e9, np.float32); along = np.zeros_like(best); sd = np.zeros_like(best)
    nxs = np.zeros_like(best); nys = np.zeros_like(best)
    lens = [np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:])]
    total = max(sum(lens), 1e-6); acc = 0
    for (ax, ay), (bx, by), ln in zip(pts[:-1], pts[1:], lens):
        vx, vy = bx - ax, by - ay
        t = np.clip(((xs - ax) * vx + (ys - ay) * vy) / max(ln * ln, 1e-9), 0, 1)
        px, py = xs - ax - t * vx, ys - ay - t * vy
        d = np.hypot(px, py)
        m = d < best
        nx, ny = (-vy / max(ln, 1e-9), vx / max(ln, 1e-9))
        side = np.sign(px * nx + py * ny)
        best = np.where(m, d, best); along = np.where(m, (acc + t * ln) / total, along)
        sd = np.where(m, d * side, sd); nxs = np.where(m, nx, nxs); nys = np.where(m, ny, nys)
        acc += ln
    return best, along, sd, nxs, nys


def bevel_normals(mask, radius):
    """Normals for a raised shape: its mask, rounded off at the edges over `radius` art units."""
    h = gaussian_filter(mask, max(radius * K, 0.5))
    gy, gx = np.gradient(h)
    k = 1.0 / max(radius * K, 0.5) ** 0 * radius * K * 1.6
    n = np.stack([-gx * k, -gy * k, np.ones_like(h)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def lambert(n, light=LIGHT):
    return np.clip((n * light).sum(-1), 0, None)


def specular(n, power=40):
    return np.clip((n * HALF).sum(-1), 0, None) ** power


class Scene:
    """One card's picture: a sky in its palette (nebula, stars), then whatever the card draws, then the finish."""

    def __init__(self, card_id, pal, light_at=(80, 40), light_r=60, bright=0.8, dust=1.0, stars=True, warp=1.0):
        self.id = card_id
        self.p = PAL[pal] if isinstance(pal, str) else pal
        self.seed = int(hashlib.md5(card_id.encode()).hexdigest()[:7], 16)
        self.g = np.random.default_rng(self.seed)
        self.cv = P.Canvas()
        P.nebula(self.cv, self.p, self.seed % 9973, glow_at=light_at, glow_r=light_r, bright=bright, dust=dust, warp=warp)
        if stars: P.stars(self.cv, self.seed % 7919, bright=0.75, count=700)

    @property
    def c(self):
        return self.cv.c

    def finish(self, path, size=(640, 400), **kw):
        return P.finish(self.cv, path, size=size, seed=self.seed % 1000, **kw)

    # ---------------------------------------------------------------- painting primitives
    def add(self, rgb, amount, sl=None):
        if sl is None: self.cv.add(col(rgb), amount)
        else: self.cv.c[sl] += col(rgb) * (amount[..., None] if np.ndim(amount) == 2 else amount)

    def over(self, rgb, alpha, sl=None):
        a = np.clip(alpha, 0, 1)[..., None]
        rgb = np.asarray(rgb, np.float32)
        if sl is None: self.cv.c = self.cv.c * (1 - a) + rgb * a
        else: self.cv.c[sl] = self.cv.c[sl] * (1 - a) + rgb * a

    def absorb(self, amount, tint=(1, 1, 1)):
        self.cv.absorb(amount, tint)

    # ---------------------------------------------------------------- light
    def glow(self, x, y, r, c=None, a=0.8):
        """A soft round glow (a pool of light, not a hard disc)."""
        c = self.p['glow'] if c is None else c
        d = np.hypot(X - x, Y - y) / max(r, 1e-3)
        self.add(c, a * 0.9 * (np.exp(-d * d * 3) * 0.8 + 0.25 / (1 + 12 * d * d)))

    def spikes(self, x, y, n, length, width, c, a=0.6, phase=0.3):
        th = np.arctan2(Y - y, X - x); d = np.hypot(X - x, Y - y)
        step = 2 * np.pi / n
        rel = np.abs(((th - phase + step / 2) % step) - step / 2)
        k = np.arange(n)
        lens = length * (1 + 0.45 * (np.round((th - phase) / step) % 2))
        self.add(c, a * np.exp(-(rel * d / width) ** 2) * np.exp(-d / lens) * smooth(0, 2, d))

    def sun(self, x, y, r, c=None, rays=0, corona=1.0):
        c = self.p['glow'] if c is None else c
        cc = col(c)
        hot = ('#fffaf0', c, '#%02x%02x%02x' % tuple(int(v) for v in np.clip((cc ** (1 / 2.2)) * 255 * np.array([1.0, 0.7, 0.45]), 0, 255)))
        if r < 5:
            # Too small for a surface: a hot point with a halo.
            self.glow(x, y, r * 3.2, c, 0.6)
            d = np.hypot(X - x, Y - y) / r
            self.add('#ffffff', 3 * np.exp(-d * d * 2.5))
            self.add(c, 1.5 * np.exp(-d * d * 0.8))
        else:
            P.sun(self.cv, x, y, r, self.seed % 97, hot=hot, corona=corona, streamers=1.2, intensity=0.9)
        if rays:
            self.spikes(x, y, rays, r * 0.9 + 1.5, r * 0.1 + 0.25, c, 0.3, phase=0.3)

    def beam(self, x1, y1, x2, y2, w, c=None, fade=True, core='#ffffff', a=1.0):
        """A tapering beam of light from (x1, y1), hot white at its root, fading out toward (x2, y2)."""
        c = self.p['glow'] if c is None else c
        pts = [(x1, y1), (x2, y2)]
        sl = roi(pts, w * 14 + 12)
        if sl is None: return
        d, t, *_ = seg_field(pts, sl)
        width = w * (1 - 0.75 * t)
        f = (1 - t) ** 0.8 if fade else 1.0
        self.add(core, a * 3.2 * f * np.exp(-(d / (width * 0.32 + 0.05)) ** 2), sl)
        self.add(c, a * 1.4 * f * np.exp(-(d / (width * 0.9 + 0.1)) ** 2), sl)
        self.add(c, a * 0.3 * f * np.exp(-d / (width * 2.5 + 0.5)), sl)

    def plasma(self, pts, w, c, a=1.0, core='#fff6e0', flicker=True, taper=0.0):
        """A glowing strand of plasma along a path."""
        sl = roi(pts, w * 14 + 5)
        if sl is None: return
        d, t, *_ = seg_field(pts, sl)
        width = w * (1 - taper * t)
        f = (0.7 + 0.6 * noise2(t * 18, t * 0 + self.seed % 13, self.seed % 31)) if flicker else 1.0
        self.add(c, a * f * 1.3 * np.exp(-(d / (width + 0.05)) ** 2), sl)
        self.add(c, a * f * 0.22 * np.exp(-d / (width * 3 + 0.3)), sl)
        if core: self.add(core, a * f * 1.8 * np.exp(-(d / (width * 0.35 + 0.04)) ** 2), sl)

    def bolt(self, x1, y1, x2, y2, c=None, kinks=5, w=1.6):
        c = self.p['accent'] if c is None else c
        def jag(a, b, depth):
            if depth == 0: return [a, b]
            mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            dx, dy = b[0] - a[0], b[1] - a[1]
            off = self.g.normal(0, 0.18) * np.hypot(dx, dy)
            m = (mx - dy / max(np.hypot(dx, dy), 1e-6) * off, my + dx / max(np.hypot(dx, dy), 1e-6) * off)
            return jag(a, m, depth - 1)[:-1] + jag(m, b, depth - 1)
        pts = jag((x1, y1), (x2, y2), 5)
        self.plasma(pts, w * 0.35, c, 1.2, core='#ffffff', flicker=False)
        for k in range(3):
            i = self.g.integers(4, len(pts) - 4)
            a = pts[i]; ang = np.arctan2(y2 - y1, x2 - x1) + self.g.choice([-1, 1]) * self.g.uniform(0.4, 0.9)
            ln = np.hypot(x2 - x1, y2 - y1) * self.g.uniform(0.12, 0.25)
            br = jag(a, (a[0] + np.cos(ang) * ln, a[1] + np.sin(ang) * ln), 3)
            self.plasma(br, w * 0.2, c, 0.6, core='#ffffff', flicker=False, taper=0.8)

    def rings(self, x, y, r0, n, gap, c=None, a=0.7):
        """Concentric rings of light: a pulse, a sound, a field."""
        c = self.p['accent'] if c is None else c
        d = np.hypot(X - x, Y - y)
        for i in range(n):
            r = r0 + i * gap; w = max(0.25, 0.55 - i * 0.08)
            amt = a * (1 - i / (n + 1))
            wav = 0.85 + 0.3 * noise2(np.arctan2(Y - y, X - x) * 3 + i, d * 0 + i, self.seed % 17 + i)
            self.add(c, amt * wav * (1.4 * np.exp(-((d - r) / w) ** 2) + 0.12 * np.exp(-np.abs(d - r) / (w * 4))))
            self.add('#ffffff', amt * 0.6 * np.exp(-((d - r) / (w * 0.4)) ** 2))

    def orbit(self, x, y, rx, ry, rot, c=None, w=1.2, a=0.8):
        """A tilted orbit: a fine ring of light."""
        c = self.p['accent'] if c is None else c
        t = np.radians(rot)
        u = (X - x) * np.cos(t) + (Y - y) * np.sin(t); v = -(X - x) * np.sin(t) + (Y - y) * np.cos(t)
        e = np.sqrt((u / rx) ** 2 + (v / ry) ** 2)
        grad = np.hypot(u / rx ** 2, v / ry ** 2) / np.maximum(e, 1e-6)
        d = np.abs(e - 1) / np.maximum(grad, 1e-6)
        ww = 0.22 * w + 0.1
        self.add(c, a * (1.2 * np.exp(-(d / ww) ** 2) + 0.1 * np.exp(-d / (ww * 5))))

    def motes(self, x, y, n, spread, c=None, size=1.4):
        c = self.p['glow'] if c is None else c
        buf = np.zeros((H, W), np.float32)
        for _ in range(n):
            a = self.g.random() * 2 * np.pi; d = spread * np.sqrt(self.g.random())
            px, py = x + np.cos(a) * d, y + np.sin(a) * d * 0.8
            if 0 <= px < 160 and 0 <= py < 100:
                buf[int(py * K), int(px * K)] += size * (0.4 + self.g.random())
        self.add(c, gaussian_filter(buf, size * K * 0.25) * 30 + gaussian_filter(buf, size * K) * 3)
        self.add('#ffffff', gaussian_filter(buf, size * K * 0.12) * 40)

    # ---------------------------------------------------------------- materials
    def solid(self, pts, base, light=None, bevel=1.2, shine=0.6, power=30, rough=0.15, emit=0.0, alpha=1.0, edge=None):
        """A raised, lit solid from a polygon: rounded at its edges, lit from the upper left.
        `base` is a colour, or a function (mask -> HxWx3) for gradients."""
        m = poly_mask(pts)
        n = bevel_normals(m, bevel)
        lit = lambert(n)
        spec = specular(n, power)
        b = base(m) if callable(base) else col(base)
        tex = 1 + rough * (fbm2(X * 0.6, Y * 0.6, 3, self.seed % 41) - 0.5)
        rgb = b * (0.18 + 1.05 * lit[..., None]) * tex[..., None] + shine * spec[..., None] * (col(light) if light else 1.0)
        if emit: rgb = rgb + b * emit
        self.over(rgb, m * alpha)
        if edge:
            # A thin bright line round the top edges.
            e = np.clip(gaussian_filter(m, 0.4 * K) - gaussian_filter(m, 1.0 * K), 0, None) * 4
            self.add(edge, e * m * smooth(-0.2, 0.4, -(n[..., 0] + n[..., 1])))
        return m

    def gold(self, pts, bevel=0.9, dark='#5a3a0e', light='#ffe3a0'):
        def base(m):
            return mix(dark, light, smooth(0, 1, 1 - (Y - Y[m > 0.5].min() if (m > 0.5).any() else Y) / 40)[..., None] * 0 + 0.55)
        return self.solid(pts, mix(dark, light, 0.55), light='#fff6e0', bevel=bevel, shine=1.6, power=24, rough=0.25)

    def tube(self, pts, w, dark, light, shine=1.2, power=30, glow=None, a=1.0, taper=0.0):
        """A solid round rod along a path (a shaft, a pole, a cord): shaded as a cylinder."""
        sl = roi(pts, w * 3 + 1)
        if sl is None: return
        d, t, sd, nx, ny = seg_field(pts, sl)
        ww = w * (1 - taper * t) + 0.05
        u = np.clip(sd / ww, -1, 1)
        nz = np.sqrt(np.clip(1 - u * u, 0, 1))
        n = np.stack([nx * u, ny * u, nz], -1)
        lit = lambert(n); spec = specular(n, power)
        rgb = mix(dark, light, lit[..., None] ** 0.8) * (0.3 + 0.9 * lit[..., None]) + shine * spec[..., None]
        m = smooth(ww + 0.08, ww - 0.08, d)
        self.over(rgb, m * a, sl)
        if glow: self.add(glow, 0.35 * np.exp(-d / (ww * 2.5)) * a, sl)

    def cloth(self, pts, c0, c1, folds=6, fold_dir=(1, 0), bevel=1.0, sheen=0.25, alpha=1.0, grad=(0, 0, 0, 1), fan=None):
        """Cloth: a polygon with soft folds running across it, a colour gradient, and a little sheen."""
        m = poly_mask(pts)
        n = bevel_normals(m, bevel)
        a = np.asarray(pts, float)
        x0, y0 = a.min(0); x1, y1 = a.max(0)
        gx0, gy0, gx1, gy1 = grad
        tt = np.clip(((X - x0) / max(x1 - x0, 1e-3) - gx0) * (gx1 - gx0) + ((Y - y0) / max(y1 - y0, 1e-3) - gy0) * (gy1 - gy0), 0, 1)
        fx, fy = fold_dir
        if fan is not None:
            # Pleats fanning out from a point (a robe hanging from the shoulders).
            ang = np.arctan2(X - fan[0], np.maximum(Y - fan[1], 0.5))
            ph = ang * folds * 2 + fbm2(X * 0.08, Y * 0.05, 2, self.seed % 53) * 1.2
            fx, fy = np.cos(ang), -np.sin(ang) * 0.3
        else:
            ph = (X * fx + Y * fy) * folds / max(np.hypot(x1 - x0, y1 - y0), 1) * 2 * np.pi + fbm2(X * 0.1, Y * 0.1, 2, self.seed % 53) * 1.0
        slope = np.sin(ph) * 0.8
        nn = n.copy(); nn[..., 0] += slope * fx; nn[..., 1] += slope * fy
        nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
        lit = lambert(nn)
        base = mix(c0, c1, tt[..., None])
        rgb = base * (0.12 + 0.75 * lit[..., None] ** 1.3) + sheen * specular(nn, 12)[..., None] * base
        self.over(rgb, m * alpha)
        return m

    def energy(self, pts, c, a=1.0, rim=1.2, fill=0.18, bevel=1.5):
        """A shape of hard light: glassy, brightest at its edges."""
        m = poly_mask(pts, 0.15)
        n = bevel_normals(m, bevel)
        edge = (1 - n[..., 2]) ** 1.5
        self.absorb(m * 0.3 * a)
        self.add(c, a * m * (fill + rim * edge * 3))
        self.add('#ffffff', a * m * specular(n, 30) * 1.2)
        return m

    # ---------------------------------------------------------------- things
    def planet(self, x, y, r, a, b, ring=False, kind='rock', light=(-0.75, -0.55, 0.4), atmos=None, emit=None):
        """A lit planet in two colours (light and shadow), with its atmosphere, and maybe a ring."""
        da, db = col(a), col(b)
        to_hex = lambda v: '#%02x%02x%02x' % tuple(int(x) for x in np.clip(v ** (1 / 2.2) * 255, 0, 255))
        cols = (to_hex(db * 0.5), to_hex(db * 0.6 + da * 0.4), to_hex(da))
        if ring:
            self._ring(x, y, r, a, back=True)
        P.planet(self.cv, x, y, r, self.seed % 89, kind=kind, cols=cols, atmos=atmos or a, light=light, ambient=0.02, emit=emit)
        if ring:
            self._ring(x, y, r, a, back=False)

    def _ring(self, x, y, r, c, back):
        t = np.radians(-12)
        u = (X - x) * np.cos(t) + (Y - y) * np.sin(t); v = -(X - x) * np.sin(t) + (Y - y) * np.cos(t)
        e = np.sqrt((u / (r * 1.9)) ** 2 + (v / (r * 0.45)) ** 2)
        band = smooth(0.78, 0.82, e) * smooth(1.02, 0.98, e) * (0.6 + 0.4 * np.sin(e * 60) ** 2)
        side = (v < 0) if back else (v >= 0)
        inside_planet = np.hypot(X - x, Y - y) < r
        m = band * side * (1 if not back else ~inside_planet)
        self.over(col(c) * 0.9 * (0.6 + 0.6 * smooth(-1, 1, -u / r)[..., None]), m * 0.85)

    def ground(self, y, c=None, bulge=8):
        """A world's curve across the foot of the picture, its rim lit by its atmosphere."""
        c = self.p['deep'] if c is None else c
        R = (85 ** 2 + bulge ** 2) / (2 * bulge)
        cx, cy = 80, y + R
        d = np.hypot(X - cx, Y - cy)
        inside = d < R
        depth = (R - d)
        terrain = fbm2(X * 0.09, (Y - y) * 0.35 + X * 0.02, 5, self.seed % 61)
        surf = col(c) * (0.5 + 0.9 * terrain[..., None]) * (0.45 + 0.9 * np.exp(-depth / 10)[..., None])
        # City-like glints and lit ridges catching the sky's light.
        rid = smooth(0.75, 0.95, ridge2(X * 0.12, (Y - y) * 0.6, 4, self.seed % 67))
        surf = surf + col(self.p['sky'][2]) * (rid * np.exp(-depth / 6) * 0.25)[..., None]
        self.over(surf, smooth(0.3, -0.3, d - R))
        self.add(self.p['sky'][2], np.exp(-np.abs(d - R) / 0.5) * 1.1 + np.exp(-np.clip(d - R, 0, None) / 5) * (~inside) * 0.25)
        self.add('#ffffff', np.exp(-(np.abs(d - R) / 0.25) ** 2) * 0.5)

    def dome(self, x, y, r, c=None):
        """A dome of hard light: clear at the middle, bright at the rim, with a fine lattice."""
        c = self.p['glow'] if c is None else c
        nx, ny = (X - x) / r, (y - Y) / r
        rr = np.sqrt(nx * nx + ny * ny)
        inside = (rr < 1) & (ny > 0)
        nz = np.sqrt(np.clip(1 - rr * rr, 0, 1))
        fres = (1 - nz) ** 2.2
        m = smooth(1.0, 0.985, rr) * smooth(-0.01, 0.02, ny)
        # A hex lattice projected onto it.
        hx, hy = nx * 7, ny * 7 + nz * 2
        lat = np.abs(np.sin(hx * 3.1)) * 0 + smooth(0.08, 0.0, np.abs(((hx + (np.floor(hy) % 2) * 0.5) % 1) - 0.5) * np.abs(((hy) % 1) - 0.5) * 4)
        self.absorb(m * 0.15)
        self.add(c, m * (fres * 1.6 + 0.06 + lat * 0.25 * (0.3 + fres)))
        self.add('#ffffff', m * np.exp(-(((nx + 0.45) / 0.22) ** 2 + ((ny - 0.6) / 0.14) ** 2)) * 1.0)
        # The base line, where it meets the ground.
        self.add(c, np.exp(-((Y - y) / 0.4) ** 2) * smooth(1.05, 0.9, np.abs(nx)) * 1.2)

    def shield_disc(self, x, y, r, c=None):
        """A round shield of hard light, seen face on."""
        c = self.p['accent'] if c is None else c
        d = np.hypot(X - x, Y - y) / r
        m = smooth(1.0, 0.96, d)
        nz = np.sqrt(np.clip(1 - d * d * 0.85, 0, 1))
        self.absorb(m * 0.25)
        self.add(c, m * (0.15 + 1.6 * (1 - nz) ** 2))
        for k in (0.35, 0.62):
            self.add('#ffffff', 0.7 * np.exp(-((d - k) / 0.03) ** 2) * m)
        self.add('#ffffff', 1.2 * np.exp(-((d - 0.97) / 0.035) ** 2))
        self.add('#ffffff', m * np.exp(-((((X - x) / r + 0.35) / 0.25) ** 2 + (((Y - y) / r + 0.4) / 0.15) ** 2)) * 1.2)
        self.glow(x, y, r * 1.5, c, 0.25)

    def hexagon(self, x, y, r, c=None, stroke='#ffffff'):
        c = self.p['glow'] if c is None else c
        pts = [(x + np.cos(np.radians(i * 60 + 30)) * r, y + np.sin(np.radians(i * 60 + 30)) * r) for i in range(6)]
        self.energy(pts, c, 1.0, rim=1.3, fill=0.12, bevel=r * 0.12)
        inner = [(x + (px - x) * 0.6, y + (py - y) * 0.6) for px, py in pts]
        self.plasma(inner + [inner[0]], 0.25, c, 0.5, flicker=False)
        self.plasma(pts + [pts[0]], 0.35, stroke, 0.7, flicker=False)
        self.add('#ffffff', 1.0 * np.exp(-(((X - (x - r * 0.35)) / (r * 0.25)) ** 2 + ((Y - (y - r * 0.4)) / (r * 0.15)) ** 2)))

    def crystal(self, x, y, h, w, rot=0, c=None, a=1.0):
        """A faceted crystal (a hexagonal prism with pointed ends), raymarched and lit, the sky seen through it."""
        c = self.p['glow'] if c is None else c
        r = w / 2 / 10; L = h * 0.18 / 10; T = h * 0.32 / 10
        Rz = P_rot(0.35, 0.5, np.radians(-rot))
        sdf = shard_sdf([(np.zeros(3, np.float32), Rz, r, L, T)])
        ext = max(h, w) * 0.65
        bounds = (x - ext, y - ext, x + ext, y + ext)
        hit, p, nrm, near, rd, sel = P.raymarch(sdf, bounds, cam_z=8, steps=70, centre=(x, y), scale=10)
        if not hit.any(): return
        N, V = nrm[hit], -rd[hit]
        ndv = np.clip((N * V).sum(1), 0, 1)
        fres = 0.04 + 0.96 * (1 - ndv) ** 5
        L3 = np.array([-0.55, 0.65, -0.52], np.float32); L3 /= np.linalg.norm(L3)  # world y is up
        lit = np.clip(N @ L3, 0, None)
        Hh = L3 + V; Hh /= np.linalg.norm(Hh, axis=1, keepdims=True)
        spec = np.clip((N * Hh).sum(1), 0, None) ** 50
        facet = 0.55 + 0.45 * np.abs(np.sin((N @ np.array([3.1, 1.7, 2.3], np.float32)) * 4)) ** 2
        xs = (X[sel][hit] + N[:, 0] * 6).clip(0, 159.9); ys = (Y[sel][hit] - N[:, 1] * 6).clip(0, 99.9)
        behind = self.cv.c[(ys * K).astype(int), (xs * K).astype(int)]
        cc = col(c)
        out = (behind * cc * 1.2 * (1 - fres)[:, None] + cc * ((0.25 + lit * 0.9) * facet)[:, None] * 0.9
               + col('#ffffff') * (spec * 3 + fres * 0.5)[:, None])
        img = np.zeros((H, W, 3), np.float32); m = np.zeros((H, W), np.float32)
        idx = np.nonzero(sel); hi = (idx[0][hit], idx[1][hit])
        img[hi] = out; m[hi] = 1
        m2 = gaussian_filter(m, 0.6)
        img = gaussian_filter(img, (0.5, 0.5, 0)) / np.maximum(gaussian_filter(m, 0.5)[..., None], 1e-3) * (m2 > 0)[..., None]
        self.glow(x, y, max(h, w) * 0.6, c, 0.25 * a)
        self.over(img, m2 * a)

    def card(self, x, y, rot, c=None, w=18):
        """A playing card, lit, with a glowing picture window."""
        c = self.p['glow'] if c is None else c
        h = w * 1.4
        pts = rotate_pts([(x - w / 2, y - h / 2), (x + w / 2, y - h / 2), (x + w / 2, y + h / 2), (x - w / 2, y + h / 2)], rot, x, y)
        self.solid(pts, mix('#fffaf0', c, 0.35), bevel=0.5, shine=0.5, edge='#ffffff')
        win = rotate_pts([(x - w * 0.36, y - h * 0.4), (x + w * 0.36, y - h * 0.4), (x + w * 0.36, y + h * 0.02), (x - w * 0.36, y + h * 0.02)], rot, x, y)
        m = poly_mask(win)
        self.over(col(self.p['sky'][1]) * 0.6, m)
        cx, cy = rotate_pts([(x, y - h * 0.19)], rot, x, y)[0]
        self.glow(cx, cy, w * 0.3, c, 0.9)
        for i in range(3):
            ly = y + h * (0.12 + i * 0.09)
            seg = rotate_pts([(x - w * 0.3, ly), (x + w * (0.3 - i * 0.08), ly)], rot, x, y)
            self.tube(seg, 0.35, '#9a8a70', '#c8b898', shine=0.1)

    def panel(self, x, y, w, h, rx=2, c0='#aeb8c8', c1='#1e2432'):
        """A machine panel: brushed metal, bevelled, with seams and lights."""
        pts = rounded_rect(x, y, w, h, rx)
        def base(m): return mix(c0, c1, np.clip((Y - y) / max(h, 1), 0, 1)[..., None])
        self.solid(pts, base, bevel=1.0, shine=1.4, power=50, rough=0.35, edge='#ffe7a8')
        self.tube([(x + rx, y + 0.9), (x + w - rx, y + 0.9)], 0.45, '#5a3a0e', '#ffe7a8', shine=1.2)
        for i in range(1, 3):
            sx = x + w * i / 3
            self.over(col('#202838'), smooth(0.25, 0.0, np.abs(X - sx)) * (Y > y + 1.5) * (Y < y + h - 1.5) * 0.5)
        for i in range(3):
            self.glow(x + w * (0.2 + i * 0.12), y + h * 0.25, 0.9, self.p['glow'], 0.9)

    def waves(self, y, c=None, amp=3, n=3, a=0.8):
        c = self.p['accent'] if c is None else c
        for k in range(n):
            yy = y + k * amp * 2.2
            line = yy + amp * 0.5 * np.sin(X / 20 * 2 * np.pi + k)
            d = np.abs(Y - line)
            w = 0.5 - k * 0.1
            self.add(c, a * (1 - k * 0.25) * (1.2 * np.exp(-(d / w) ** 2) + 0.15 * np.exp(-d / (w * 4))))

    def mushroom(self, x, y, h, w, cap=None, lean=0):
        cap = self.p['accent'] if cap is None else cap
        tx = x + lean
        stalk = quad((x - w * 0.09, y), (x + lean * 0.4, y - h * 0.5), (tx - w * 0.07, y - h)) + quad((tx + w * 0.07, y - h), (x + lean * 0.4 + w * 0.12, y - h * 0.5), (x + w * 0.09, y))
        self.solid(stalk, '#d8d0e0', bevel=1.2, shine=0.3)
        top = quad((tx - w / 2, y - h), (tx - w * 0.45, y - h - w * 0.55), (tx, y - h - w * 0.58)) + quad((tx, y - h - w * 0.58), (tx + w * 0.45, y - h - w * 0.55), (tx + w / 2, y - h)) + quad((tx + w / 2, y - h), (tx, y - h + w * 0.12), (tx - w / 2, y - h))
        self.solid(top, cap, bevel=2.0, shine=0.5, emit=0.25)
        self.glow(tx, y - h - w * 0.2, w * 0.5, cap, 0.35)


def rounded_rect(x, y, w, h, r):
    pts = []
    for cx, cy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for a in np.radians(np.linspace(a0, a0 + 90, 6)):
            pts.append((cx + np.cos(a) * r, cy + np.sin(a) * r))
    return pts


def P_rot(ax, ay, az):
    cx, sx, cy, sy, cz, sz = np.cos(ax), np.sin(ax), np.cos(ay), np.sin(ay), np.cos(az), np.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return (Rz @ Ry @ Rx).astype(np.float32)


def shard_sdf(shards):
    angs = [0, np.pi / 3, 2 * np.pi / 3]
    def f(p):
        d = np.full(len(p), 1e9, np.float32)
        for c, R_, r, L, T in shards:
            q = (p - c) @ R_
            rad = np.max(np.stack([np.abs(q[:, 0] * np.cos(a) + q[:, 2] * np.sin(a)) for a in angs]), 0)
            side = rad - r
            cap = (rad * T + np.abs(q[:, 1]) * r - r * (L + T)) / np.sqrt(T * T + r * r)
            d = np.minimum(d, np.maximum(side, cap))
        return d
    return f
