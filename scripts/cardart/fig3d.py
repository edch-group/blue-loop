"""Full 3D scenes for card art: a small raymarching engine (signed distance functions in numpy), a posable
Aureline, Xel'Naru crystal warriors, weapons, ground and rocks, lit by the things that glow in the scene,
with soft shadows. Effects that are better painted (halos, flames, beams, sparks, light shafts) go on after.

World units: an Aureline's head has radius 1 (they stand about 7 tall); y is up; the camera looks along +z.
A scene is a list of objects, each a group of parts inside a bounding sphere (so the march only works on the
parts near each ray)."""
import hashlib
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates
import paint as P
from paint import X, Y, W, H, K, hexc, smooth, fbm2, fbm3, noise3
from kit import col, mix


# ------------------------------------------------------------------------------------------------ maths
def length(v):
    return np.sqrt((v * v).sum(-1))


def norm(v):
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def rot(ax=0.0, ay=0.0, az=0.0):
    cx, sx, cy, sy, cz, sz = np.cos(ax), np.sin(ax), np.cos(ay), np.sin(ay), np.cos(az), np.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return (Ry @ Rx @ Rz).astype(np.float32)


def look_rot(direction, up=(0, 1, 0)):
    """A rotation whose local +y points along `direction`."""
    yv = norm(direction)
    xv = np.cross(np.asarray(up, np.float32), yv)
    if np.linalg.norm(xv) < 1e-4: xv = np.array([1, 0, 0], np.float32)
    xv = norm(xv); zv = np.cross(xv, yv)
    return np.stack([xv, yv, zv], 1).astype(np.float32)


def capsule(p, a, b, r):
    pa = p - a; ba = (b - a).astype(np.float32)
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return length(pa - h[:, None] * ba) - r


def round_cone(p, a, b, r1, r2):
    a = np.asarray(a, np.float32); b = np.asarray(b, np.float32)
    ba = b - a; l2 = (ba * ba).sum(); rr = r1 - r2; a2 = l2 - rr * rr; il2 = 1.0 / l2
    pa = p - a
    y = (pa * ba).sum(-1); z = y - l2
    xv = pa * l2 - y[:, None] * ba
    x2 = (xv * xv).sum(-1); y2 = y * y * l2; z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    out = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    out = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2, out)
    out = np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, out)
    return out


def ellipsoid(p, r):
    r = np.asarray(r, np.float32)
    k0 = length(p / r); k1 = length(p / (r * r))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-6)


def torus(p, R, r):
    return np.hypot(np.hypot(p[:, 0], p[:, 2]) - R, p[:, 1]) - r


def box(p, b, r=0.0):
    q = np.abs(p) - (np.asarray(b, np.float32) - r)
    return length(np.maximum(q, 0)) + np.minimum(q.max(-1), 0) - r


def fan(q, sector, r0, long_, short, width, thick, limit=None):
    """A fan of tapering blades in the xy-plane, radiating from the origin (polar repetition)."""
    ang = np.arctan2(q[:, 0], q[:, 1])
    k = np.round(ang / sector)
    if limit is not None: k = np.clip(k, -limit, limit)
    a = k * sector
    x = q[:, 0] * np.cos(a) - q[:, 1] * np.sin(a)
    y = q[:, 0] * np.sin(a) + q[:, 1] * np.cos(a)
    L = np.where(np.abs(k) % 2 == 0, long_, short)
    t = np.clip((y - r0) / L, 0, 1)
    w = width * (1 - t) + 0.01
    return np.maximum(np.maximum((np.abs(x) - w) * 0.9, np.maximum(r0 - y, y - (r0 + L))), np.abs(q[:, 2]) - thick * (1 - t * 0.6))


def shard(q, r, L, T):
    """A hexagonal crystal along local y: a prism of radius r and half-length L, pointed by pyramids of height T."""
    rad = np.max(np.stack([np.abs(q[:, 0] * np.cos(a) + q[:, 2] * np.sin(a)) for a in (0, np.pi / 3, 2 * np.pi / 3)]), 0)
    return np.maximum(rad - r, (rad * T + np.abs(q[:, 1]) * r - r * (L + T)) / np.sqrt(T * T + r * r))


# ------------------------------------------------------------------------------------------------ scene
class Part:
    """A shape in an object: f(local point) -> distance; a material and its settings."""

    def __init__(self, f, mat, **kw):
        self.f, self.mat, self.kw = f, mat, kw


class Obj:
    """A group of parts within a bounding sphere."""

    def __init__(self, centre, radius, parts, name=''):
        self.c, self.r, self.parts, self.name = np.asarray(centre, np.float32), radius, parts, name


class World:
    def __init__(self, cam=(0, 1.5, -14), target=(0, 1.0, 0), fov=0.42):
        self.cam = np.asarray(cam, np.float32)
        f = norm(np.asarray(target, np.float32) - self.cam)
        r = norm(np.cross(np.array([0, 1, 0], np.float32), f)); u = np.cross(f, r)
        self.basis = np.stack([r, u, f], 1)
        self.fov = fov
        self.objs = []
        self.lights = []      # (kind, position or direction, colour, power, shadows)
        self.ambient = hexc('#141826') * 0.3

    def add(self, *objs):
        self.objs.extend(objs)

    def light(self, kind, v, colour, power, shadows=True):
        self.lights.append((kind, np.asarray(v, np.float32) if kind == 'point' else norm(v), hexc(colour), power, shadows))

    # -- distance
    def dist(self, p, shadow=False):
        d = np.full(len(p), 1e3, np.float32)
        for o in self.objs:
            db = length(p - o.c) - o.r
            near = db < 0.6
            d = np.minimum(d, np.where(near, 1e3, np.maximum(db, 0.3)))
            if near.any():
                idx = np.nonzero(near)[0]; q = p[idx]
                dd = np.full(len(idx), 1e3, np.float32)
                for part in o.parts:
                    if shadow and part.kw.get('noshadow'): continue
                    dd = np.minimum(dd, part.f(q))
                d[idx] = np.minimum(d[idx], dd)
        return d

    def which(self, p):
        """The part nearest each point (its object and index)."""
        best = np.full(len(p), 1e3, np.float32); who = np.full(len(p), -1, np.int64)
        flat = [(o, part) for o in self.objs for part in o.parts]
        for i, (o, part) in enumerate(flat):
            near = length(p - o.c) - o.r < 0.6
            if not near.any(): continue
            idx = np.nonzero(near)[0]
            d = part.f(p[idx])
            m = d < best[idx]
            best[idx[m]] = d[m]; who[idx[m]] = i
        return who, flat

    # -- camera
    def rays(self):
        sx = (X.ravel() - 80) / 50; sy = -(Y.ravel() - 50) / 50
        rd = np.stack([sx * self.fov, sy * self.fov, np.ones_like(sx)], 1).astype(np.float32) @ self.basis.T
        return rd / length(rd)[:, None]

    def project(self, P3):
        v = (np.asarray(P3, np.float32) - self.cam) @ self.basis
        return 80 + v[..., 0] / (v[..., 2] * self.fov) * 50, 50 - v[..., 1] / (v[..., 2] * self.fov) * 50, length(np.asarray(P3, np.float32) - self.cam)

    def march(self, steps=160, far=60.0):
        rd = self.rays(); n = len(rd)
        # Start each ray where it first reaches any object's bounding sphere.
        t = np.full(n, far, np.float32)
        for o in self.objs:
            oc = self.cam - o.c
            b = rd @ oc; c = oc @ oc - o.r * o.r
            disc = b * b - c
            tt = np.where(disc > 0, -b - np.sqrt(np.maximum(disc, 0)), far)
            t = np.minimum(t, np.where(c < 0, 0, np.maximum(tt, 0)))
        hit = np.zeros(n, bool); alive = t < far
        for _ in range(steps):
            idx = np.nonzero(alive)[0]
            if idx.size == 0: break
            p = self.cam + rd[idx] * t[idx, None]
            d = self.dist(p)
            h = d < 0.0012 * t[idx]
            hit[idx[h]] = True
            t[idx] += d * 0.9
            alive[idx[h | (t[idx] > far)]] = False
        return rd, t, hit

    def normals(self, p):
        e = 0.002; n = np.zeros_like(p)
        for i in range(3):
            o = np.zeros(3, np.float32); o[i] = e
            n[:, i] = self.dist(p + o) - self.dist(p - o)
        return n / np.maximum(length(n), 1e-6)[:, None]

    def ao(self, p, n):
        a = np.zeros(len(p), np.float32)
        for i, h in enumerate((0.06, 0.16, 0.32, 0.55)):
            a += (h - self.dist(p + n * h)) * (0.7 ** i)
        return np.clip(1 - a * 1.4, 0, 1)

    def shadow(self, p, n, L, maxt, k=8.0, steps=26):
        o = p + n * 0.03
        res = np.ones(len(p), np.float32); t = np.full(len(p), 0.05, np.float32)
        maxt = np.broadcast_to(np.asarray(maxt, np.float32), (len(p),))
        alive = np.ones(len(p), bool)
        for _ in range(steps):
            idx = np.nonzero(alive)[0]
            if idx.size == 0: break
            q = o[idx] + (L[idx] if L.ndim == 2 else L) * t[idx, None]
            d = self.dist(q, shadow=True)
            res[idx] = np.minimum(res[idx], np.clip(k * d / t[idx], 0, 1))
            t[idx] += np.clip(d, 0.04, 0.6)
            alive[idx] = (res[idx] > 0.02) & (t[idx] < maxt[idx])
        return res * res * (3 - 2 * res)

    # -- shading
    def shade(self, p, n, v, who, flat, env_c):
        rgb = np.zeros_like(p)
        ao = self.ao(p, n)
        ndv = np.clip((n * v).sum(-1), 0, 1)
        fres = (1 - ndv) ** 4
        r = -(v - 2 * (n * v).sum(-1)[:, None] * n)
        # Light arriving at each point, from each light (with shadows for those that cast them).
        diff = np.zeros_like(p); spec_dirs = []
        lit_mask = np.array([flat[i][1].mat not in ('plasma', 'blade', 'core', 'emit') for i in who])
        for kind, v3, c, power, shadows in self.lights:
            if kind == 'point':
                Lv = v3 - p; d = length(Lv); L = Lv / d[:, None]
                att = power / (1 + d * d)
                maxt = d - 0.5
            else:
                L = np.broadcast_to(v3, p.shape); att = np.full(len(p), power, np.float32); maxt = 40.0
            ndl = np.clip((n * L).sum(-1), 0, None)
            s = np.ones(len(p), np.float32)
            if shadows and lit_mask.any():
                idx = np.nonzero(lit_mask & (ndl > 0))[0]
                if idx.size:
                    s[idx] = self.shadow(p[idx], n[idx], L[idx] if L.ndim == 2 else L, maxt[idx] if np.ndim(maxt) else maxt)
            diff += (ndl * att * s)[:, None] * c
            spec_dirs.append((L, att * s, c))
        amb = self.ambient * ao[:, None]
        for i in np.unique(who):
            o, part = flat[i]; m = who == i
            kw = part.kw; mat = part.mat
            if mat in ('cloth', 'velvet', 'stone', 'ground', 'skin'):
                a = col(kw.get('c') or '#cccccc')
                if 'tex' in kw: a = a * kw['tex'](p[m])[:, None]
                c = a * (diff[m] + amb[m]) * ao[m, None]
                sheen = (1 - ndv[m]) ** (2 if mat == 'velvet' else 4) * (1.4 if mat == 'velvet' else 0.4)
                c += sheen[:, None] * diff[m] * (a if mat == 'velvet' else 1.0)
                if 'rim' in kw:
                    c += col(kw['rim']) * (np.clip((n[m] * kw['rim_dir']).sum(-1), 0, None) ** 2 * (1 - ndv[m]) * 2.5)[:, None]
            elif mat in ('gold', 'metal'):
                base = col(kw.get('c') or ('#ffcf70' if mat == 'gold' else '#e8e6e0'))
                F = base + (1 - base) * fres[m, None]
                rough = kw.get('rough', 0.0)
                c = F * env_c(r[m]) * ao[m, None] * kw.get('tint', 1.0)
                for L, att, lc in spec_dirs:
                    Lm = L[m] if L.ndim == 2 else L
                    c += F * lc * (np.clip((r[m] * Lm).sum(-1), 0, 1) ** (60 if rough == 0 else 18) * att[m] * (3 if rough == 0 else 1.2))[:, None]
                c += base * diff[m] * (0.3 if mat == 'gold' else 0.45)
            elif mat == 'plasma':
                q = (p[m] - o.c) * kw.get('freq', 3.0)
                g = fbm3(q[:, 0], q[:, 1], q[:, 2], 5, kw.get('seed', 7))
                heat = np.clip(0.62 + 0.8 * (g - 0.5), 0, 1)
                pc = col(kw.get('c', '#ffc860'))
                base = mix(mix('#c05010', pc, heat[:, None]), '#fff6e0', smooth(0.5, 0.9, heat)[:, None])
                c = base * (1.2 + 1.6 * heat[:, None]) * kw.get('power', 1.0) * (0.45 + 0.55 * ao[m, None] ** 1.2) + hexc('#fff0c0') * (fres[m] * 2.5)[:, None]
            elif mat == 'eye':
                c = shade_eye(p[m], n[m], v[m], r[m], ao[m], kw, spec_dirs, m)
            elif mat in ('blade', 'core', 'emit'):
                c = col(kw.get('c', '#fff3c4')) * kw.get('power', 4.0) * (1 + 1.5 * fres[m, None])
            elif mat == 'crystal':
                base = col(kw.get('c', '#ffb3c2'))
                F = 0.04 + 0.96 * fres[m]
                # Deep, dark glass, glowing from within toward its edges.
                deep = mix(base, '#1a0614', 0.75)
                c = deep * (env_c(r[m]) * 0.3 + diff[m] * 0.35) + base * kw.get('glow', 0.6) * ((1 - ndv[m]) ** 1.5 * 1.2 + 0.05)[:, None]
                facet = 0.6 + 0.4 * np.abs(np.sin((n[m] @ np.array([3.1, 1.7, 2.3], np.float32)) * 4)) ** 2
                c = c * facet[:, None]
                for L, att, lc in spec_dirs:
                    Lm = L[m] if L.ndim == 2 else L
                    c += lc * (np.clip((r[m] * Lm).sum(-1), 0, 1) ** 80 * att[m] * 4)[:, None]
                c += hexc('#ffffff') * (F * 0.8)[:, None]
            elif mat == 'shield':
                base = col(kw.get('c', '#8fd0ff'))
                c = base * (0.25 + 2.5 * (1 - ndv[m]) ** 2)[:, None] * kw.get('power', 1.0)
                for L, att, lc in spec_dirs:
                    Lm = L[m] if L.ndim == 2 else L
                    c += lc * (np.clip((r[m] * Lm).sum(-1), 0, 1) ** 60 * att[m] * 2)[:, None]
            else:
                c = diff[m]
            rgb[m] = c
        return rgb

    def render(self, S, env_c=None, rays=None, glow_objects=True):
        """March, shade and composite onto the scene's picture. Returns (depth, hitmask) for effects after."""
        env_c = env_c or default_env
        rd, t, hit = self.march()
        p = self.cam + rd[hit] * t[hit, None]
        n = self.normals(p)
        who, flat = self.which(p)
        rgb = np.nan_to_num(self.shade(p, n, -rd[hit], who, flat, env_c), nan=0.0, posinf=4.0)
        fig = np.zeros((H * W, 3), np.float32); fig[hit] = rgb
        m = hit.reshape(H, W).astype(np.float32)
        S.cv.c = S.cv.c * (1 - m[..., None]) + fig.reshape(H, W, 3) * m[..., None]
        depth = np.where(hit, t, 1e9).reshape(H, W)
        if rays:
            S.cv.c += god_rays(S.cv.c, m, *rays)
        return depth, m > 0

    def visible(self, P3, depth, hitmask):
        px, py, d = self.project(P3)
        ix = np.clip((np.asarray(px) * K).astype(int), 0, W - 1); iy = np.clip((np.asarray(py) * K).astype(int), 0, H - 1)
        return px, py, (~hitmask[iy, ix]) | (depth[iy, ix] > d - 0.08)


def default_env(r):
    up = np.clip(r[:, 1], -1, 1)
    return hexc('#3a2a18') * (0.5 + 0.5 * up)[:, None] + hexc('#fff0c8') * (np.clip(up, 0, 1) ** 8 * 2)[:, None]


def shade_eye(p, n, v, r, ao, kw, spec_dirs, m):
    ce, g, iris_c = kw['centre'], kw['gaze'], kw.get('iris', '#ffb000')
    d = p - ce; d /= length(d)[:, None]
    th = np.arccos(np.clip((d * g).sum(-1), -1, 1))
    right = norm(np.cross(np.array([0, 1, 0], np.float32), g)); up = np.cross(g, right)
    u, w = (d * right).sum(-1), (d * up).sum(-1)
    phi = np.arctan2(w, u)
    fib = fbm3(np.cos(phi) * 6, np.sin(phi) * 6, th * 30, 4, kw.get('seed', 11))
    iris = th < kw.get('iris_size', 0.48)
    sclera = hexc('#f6efe4') * (0.85 + 0.15 * fib[:, None])
    irisc = mix(mix(iris_c, '#000000', 0.7), iris_c, np.clip(fib * 1.2 + (0.48 - th) * 1.2, 0, 1)[:, None]) * 1.7
    irisc = irisc + col(kw.get('iris2', '#fff0b0')) * (smooth(0.24, 0.1, th) * 0.9)[:, None]
    irisc = irisc * (1 - 0.75 * smooth(0.4, 0.48, th)[:, None])
    pt = kw.get('pupil', 'slit')
    if pt == 'slit':
        pupil = (np.abs(u) < 0.05 + 0.02 * (1 - np.abs(w) / 0.3)) & (np.abs(w) < 0.3)
    elif pt == 'round':
        pupil = th < 0.16
    else:
        pupil = (np.abs(np.abs(u) - 0.07) < 0.03) & (np.abs(w) < 0.26)
    c = np.where(iris[:, None], irisc, sclera)
    c = np.where((pupil & iris)[:, None], hexc('#050302'), c)
    c = c * (0.55 + 0.6 * ao[:, None])
    for L, att, lc in spec_dirs:
        Lm = L[m] if L.ndim == 2 else L
        c += lc * (np.clip((r * Lm).sum(-1), 0, 1) ** 300 * att[m] * 10)[:, None]
    c += hexc('#ffffff') * ((1 - np.clip((n * v).sum(-1), 0, 1)) ** 4 * 0.5)[:, None]
    return c


def god_rays(img, mask, cx, cy, strength=0.03, n=48, decay=0.965, threshold=1.5):
    src = np.clip(img * (1 - mask[..., None]) - threshold, 0, None)
    acc = np.zeros_like(src); w = 1.0
    px, py = cx * K, cy * K
    for i in range(n):
        s = 1 - i * 0.012
        coords = [py + (P.yy - py) * s, px + (P.xx - px) * s]
        acc += np.stack([map_coordinates(src[..., c], coords, order=1, mode='constant') for c in range(3)], -1) * w
        w *= decay
    return acc * strength


# ------------------------------------------------------------------------------------------------ the Aureline
def traits(key, force=None):
    g = np.random.default_rng(int(hashlib.md5(key.encode()).hexdigest()[:8], 16))
    pick = lambda xs: xs[g.integers(len(xs))]
    t = dict(
        head=g.uniform(0.85, 1.0), shoulders=g.uniform(0.78, 0.92), height=g.uniform(0.98, 1.1),
        socket=pick([(0.7, 0.38), (0.62, 0.32), (0.74, 0.44), (0.6, 0.4)]), pupil=pick(['slit', 'slit', 'round', 'double']),
        iris2=pick(['#fff0b0', '#ffffff', '#ffb070', '#bfe8ff']), plasma=pick(['#ffc860', '#ffd890', '#ffb050', '#ffe0a0']),
        helm=pick(['none', 'crest', 'visor', 'none']), pauldron=pick(['round', 'spiked', 'layered']),
        cape=pick(['#7a0f1a', '#1a2a5a', '#e8dcc0', '#5a1a5a', '#0e3a3a', '#8a5a14']),
        tabard=pick(['#efe6d6', '#e8e0f0', '#f0e2c0']),
    )
    if force: t.update(force)
    return t


def aureline3d(key, at=(0, 0, 0), yaw=0.0, lean=0.0, garb='armour', head_turn=(0.0, 0.0), arms=None, iris='#2a6fd0',
               crown=False, cape=True, weapon=None, shield=None, look=None, scale=1.0, wind=(0.0, 0.0, 1.0)):
    """A posable Aureline, standing at `at` (its feet), turned by `yaw` (0 faces the camera), leaning by `lean`.
    `arms`: dict side -> (elbow, hand) in the figure's own frame (x to its left as we see it, y up, -z toward us).
    `weapon`: ('lance', hand side, direction) ; `shield`: (side, style). Returns (Obj, info for effects)."""
    T = traits(key, look)
    s = scale * T['height']
    R = rot(lean, yaw, 0)
    origin = np.asarray(at, np.float32)

    def W_(v):  # local -> world
        return origin + (np.asarray(v, np.float32) * s) @ R.T

    def L_(p):  # world -> local
        return ((p - origin) @ R) / s

    head_c = np.array([0, 6.0, 0], np.float32)
    hr = T['head']
    HR = rot(head_turn[1], head_turn[0], 0)
    sw = T['shoulders']
    parts = []

    def part(f, mat, **kw):
        parts.append(Part(lambda p, f=f: f(L_(p)) * s, mat, **kw))

    # Head: plasma, an eye socket, the eyeball.
    sx, sy = T['socket']
    def head(q):
        h = (q - head_c) @ HR / hr
        sock = ellipsoid(h - np.array([0, 0.03, -0.93], np.float32), (sx, sy, 0.45))
        return smax(length(h) - 1.0, -sock, 0.08) * hr
    part(head, 'plasma', c=T['plasma'], seed=int(hashlib.md5(key.encode()).hexdigest()[:4], 16) % 97, noshadow=True)
    eye_local = head_c + (np.array([0, 0.03 * hr, -0.45 * hr], np.float32) @ HR.T)
    part(lambda q: length(q - eye_local) - 0.56 * hr, 'eye', centre=W_(eye_local), gaze=norm((np.array([0, -0.05, -1.0], np.float32) @ HR.T) @ R.T),
         iris=iris, iris2=T['iris2'], pupil=T['pupil'])
    part(lambda q: round_cone(q, (0, 5.2, 0.05), (0, 4.55, 0.05), 0.32, 0.42), 'plasma', c=T['plasma'], noshadow=True)

    # Body: an armoured torso over a tabard, or long robes.
    if garb == 'armour':
        # A fitted cuirass, narrow at the waist, over long flowing skirts.
        part(lambda q: smin(round_cone(q, (0, 4.45, 0.05), (0, 2.75, 0.1), 0.95 * sw, 0.6), ellipsoid(q - np.array([0, 3.95, -0.08], np.float32), (0.95 * sw, 0.7, 0.62)), 0.3), 'gold',
             c='#ffcf70')
        def skirt(q):
            ang = np.arctan2(q[:, 0], -q[:, 2])
            # Swept back by the wind and the charge.
            q2 = q - np.asarray(wind, np.float32) * smooth(2.7, 0.0, q[:, 1])[:, None] * 0.6
            return round_cone(q2, (0, 2.8, 0.1), (0, 0.15, 0.25), 0.62, 1.25) + (0.06 * np.sin(ang * 10 + q[:, 1]) + 0.03 * np.sin(ang * 21)) * smooth(2.6, 1.0, q[:, 1])
        part(skirt, 'cloth', c=T['tabard'])
        part(lambda q: torus(q - np.array([0, 2.75, 0.1], np.float32), 0.63, 0.08), 'gold')
        for k in (-1, 1):
            pc = np.array([k * 1.05 * sw, 4.45, 0.05], np.float32)
            if T['pauldron'] == 'spiked':
                part(lambda q, pc=pc, k=k: smin(ellipsoid(q - pc, (0.48, 0.32, 0.46)), round_cone(q, pc, pc + np.array([k * 0.6, 0.5, 0], np.float32), 0.18, 0.02), 0.08), 'gold')
            elif T['pauldron'] == 'layered':
                part(lambda q, pc=pc: np.minimum(ellipsoid(q - pc, (0.48, 0.32, 0.46)), ellipsoid(q - pc - np.array([0, -0.26, 0], np.float32), (0.55, 0.24, 0.5))), 'gold')
            else:
                part(lambda q, pc=pc: ellipsoid(q - pc, (0.5, 0.34, 0.48)), 'gold')
    else:
        def robe(q):
            ang = np.arctan2(q[:, 0], -q[:, 2])
            return round_cone(q, (0, 4.6, 0.1), (0, 0.3, 0.3), 1.05 * sw, 1.9) + (0.06 * np.sin(ang * 11 + np.sin(q[:, 1])) + 0.03 * np.sin(ang * 23)) * smooth(4.2, 2.5, q[:, 1])
        part(robe, 'cloth', c=T['tabard'])
        part(lambda q: torus((q - np.array([0, 4.55, 0.05], np.float32)) @ rot(-0.2, 0, 0), 0.55, 0.1), 'gold')
    if cape:
        def cape_f(q):
            q = q - np.asarray(wind, np.float32) * smooth(4.5, 0.0, q[:, 1])[:, None] * 1.4
            c = round_cone(q, (0, 4.7, 0.45), (0, 0.4, 1.3), 1.0 * sw, 1.8)
            c = c + 0.07 * np.sin(np.arctan2(q[:, 0], q[:, 2] - 0.5) * 9 + q[:, 1] * 0.4)
            return np.maximum(np.maximum(c, -(q[:, 2] - 0.55)), -(c + 0.16))
        part(cape_f, 'velvet', c=T['cape'])

    # Arms: upper arm and forearm to a hand of plasma.
    arms = arms or {}
    hands = {}
    for side, k in (('left', -1), ('right', 1)):
        sh = np.array([k * 1.15 * sw, 4.35, 0.05], np.float32)
        el, hd = arms.get(side, ((k * 1.55 * sw, 2.9, 0.1), (k * 1.45 * sw, 1.6, -0.2)))
        el, hd = np.asarray(el, np.float32), np.asarray(hd, np.float32)
        part(lambda q, a=sh, b=el: round_cone(q, a, b, 0.25, 0.2), 'gold' if garb == 'armour' else 'cloth', c=None if garb == 'armour' else T['tabard'])
        part(lambda q, a=el, b=hd: round_cone(q, a, b, 0.2 if garb == 'armour' else 0.36, 0.16 if garb == 'armour' else 0.44), 'gold' if garb == 'armour' else 'cloth', c=None if garb == 'armour' else T['tabard'])
        part(lambda q, c=hd: ellipsoid(q - c, (0.2, 0.2, 0.24)), 'plasma', c=T['plasma'], power=1.3, noshadow=True)
        hands[side] = W_(hd)
    # Helm or crown.
    if garb == 'armour' and T['helm'] != 'none':
        def helm(q):
            h = (q - head_c) @ HR / hr
            shell = np.abs(length(h) - 1.04) - 0.06
            brim = -(h[:, 1] - (0.38 - 0.15 * h[:, 0] ** 2)) if T['helm'] != 'visor' else -(h[:, 1] - 0.42)
            d = np.maximum(shell, brim)
            if T['helm'] == 'crest':
                d = smin(d, ellipsoid(h - np.array([0, 1.0, 0.3], np.float32), (0.05, 0.42, 0.85)), 0.05)
            return d * hr
        part(helm, 'gold')
    if crown:
        part(lambda q: torus(((q - head_c) @ HR / hr - np.array([0, 0.66, 0], np.float32)) @ rot(0.3, 0, 0), 0.78, 0.08) * hr, 'gold')
        part(lambda q: fan(((q - head_c) @ HR / hr - np.array([0, 0, -0.15], np.float32)) @ rot(0.12, 0, 0), 0.22, 0.98, 1.0, 0.6, 0.17, 0.07, limit=3) * hr, 'gold')
    info = dict(head=W_(head_c), head_r=hr * s, hands=hands, T=T, R=R, s=s, W=W_, origin=origin)
    # A weapon held in a hand.
    if weapon:
        kind, side, direction = weapon
        hp = hands[side]
        dvec = norm(np.asarray(direction, np.float32) @ R.T)
        parts.extend(lance3d(hp, dvec, s))
        info['blade_tip'] = hp + dvec * 6.6 * s
        info['blade'] = hp + dvec * 5.6 * s
    if shield:
        side, style = shield
        hp = hands[side]
        face = norm(np.array([0.25 * (1 if side == 'right' else -1), 0.1, -1.0], np.float32) @ R.T)
        parts.extend(shield3d(hp + face * 0.35 * s, face, s, style))
        info['shield'] = hp + face * 0.35 * s
    centre = W_((0, 3.5, 0.3))
    return Obj(centre, 6.5 * s + (6.8 * s if weapon else 0), parts, key), info


def lance3d(hand, direction, s):
    """A sun-lance: white-metal shaft banded in gold, a swept guard, a long leaf of hard light."""
    Rm = look_rot(direction)
    def loc(p): return ((p - hand) @ Rm) / s
    parts = [
        Part(lambda p: capsule(loc(p), np.array([0, -2.6, 0], np.float32), np.array([0, 4.4, 0], np.float32), 0.075) * s, 'metal', c='#f2efe6'),
        Part(lambda p: np.min(np.stack([torus(loc(p) - np.array([0, y, 0], np.float32), 0.08, 0.035) for y in (-2.4, -1.0, 1.4, 3.9)]), 0) * s, 'gold'),
        Part(lambda p: smin(ellipsoid(loc(p) - np.array([0, 4.45, 0], np.float32), (0.45, 0.1, 0.12)),
                            ellipsoid(loc(p) - np.array([0, 4.3, 0], np.float32), (0.14, 0.3, 0.14)), 0.05) * s, 'gold'),
        Part(lambda p: ellipsoid(loc(p) - np.array([0, 5.55, 0], np.float32), (0.26, 1.15, 0.05)) * s, 'blade', c='#fff0c0', power=4.5, noshadow=True),
    ]
    return parts


def shield3d(c, face, s, style='disc'):
    Rm = look_rot(face)  # local y is the face normal
    def loc(p): return ((p - c) @ Rm) / s
    if style == 'kite':
        def f(p):
            q = loc(p)
            d2 = np.maximum.reduce([-q[:, 2] - 1.9, q[:, 2] - 1.2, np.abs(q[:, 0]) * 1.1 + q[:, 2] * 0.55 - 1.3, np.abs(q[:, 0]) - 1.15])
            return np.maximum(d2, np.abs(q[:, 1]) - 0.08) * s
    else:
        def f(p):
            q = loc(p)
            return np.maximum(np.hypot(q[:, 0], q[:, 2]) - 1.45, np.abs(q[:, 1]) - 0.07 + 0.04 * (np.hypot(q[:, 0], q[:, 2]) / 1.45) ** 2) * s
    rim = (lambda p: torus(loc(p), 1.45, 0.08) * s) if style != 'kite' else None
    parts = [Part(f, 'shield', c='#9fd8ff', power=1.0)]
    if rim: parts.append(Part(rim, 'gold'))
    parts.append(Part(lambda p: ellipsoid(loc(p) - np.array([0, -0.1, 0], np.float32), (0.35, 0.12, 0.35)) * s, 'gold'))
    return parts


# ------------------------------------------------------------------------------------------------ the Xel'Naru
def xelnaru3d(key, at=(0, 0, 0), yaw=0.0, lean=0.0, scale=1.0, colour='#ffb3c2', core='#ffe0ea', blade=True):
    """A Xel'Naru warrior: a figure of hovering crystal shards round a core of light, a crystal blade for an arm."""
    g = np.random.default_rng(int(hashlib.md5(key.encode()).hexdigest()[:8], 16))
    s = scale; R = rot(lean, yaw, 0); origin = np.asarray(at, np.float32)
    def L_(p): return ((p - origin) @ R) / s
    shards = []
    def add(c, d, r, L, T): shards.append((np.asarray(c, np.float32), look_rot(d), r, L, T))
    add((0, 6.3, 0), (0, 1, 0.1), 0.35, 0.5, 0.6)                              # the crown shard (its head)
    add((-0.55, 6.0, 0.1), (-0.5, 1, 0), 0.18, 0.25, 0.4); add((0.55, 6.0, 0.1), (0.5, 1, 0), 0.18, 0.25, 0.4)
    for k in (-1, 1):                                                       # shoulders
        add((k * 1.35, 4.5, 0), (k * 1, 0.4, 0), 0.32, 0.35, 0.45)
    add((0, 4.1, -0.1), (0, 1, 0), 0.6, 0.5, 0.7)                             # the chest
    add((0, 2.4, 0), (0, 1, 0), 0.45, 0.6, 0.6)                               # the waist
    for k in (-1, 1):                                                       # legs
        add((k * 0.55, 0.9, 0), (k * 0.1, 1, 0), 0.25, 0.55, 0.5)
    add((-1.9, 3.4, -0.3), (-0.4, -1, -0.3), 0.22, 0.6, 0.4)                  # its left arm
    if blade:
        add((2.2, 4.2, -0.8), (0.6, 0.5, -0.6), 0.2, 1.4, 0.9)               # its blade arm
    for i in range(10):                                                     # loose shards orbiting
        a = g.uniform(0, 2 * np.pi); rr = g.uniform(1.6, 2.6); y = g.uniform(1.5, 6.0)
        add((np.cos(a) * rr, y, np.sin(a) * rr * 0.6), g.normal(0, 1, 3), g.uniform(0.07, 0.14), g.uniform(0.1, 0.25), g.uniform(0.1, 0.2))
    def body(p):
        q = L_(p)
        d = np.full(len(q), 1e3, np.float32)
        for c, Rm, r, L, T in shards:
            d = np.minimum(d, shard((q - c) @ Rm, r, L, T))
        return d * s
    core_c = np.array([0, 4.1, -0.15], np.float32)
    parts = [Part(body, 'crystal', c=colour, glow=0.7),
             Part(lambda p: (length(L_(p) - core_c) - 0.42) * s, 'core', c=core, power=6.0, noshadow=True)]
    W_ = lambda v: origin + (np.asarray(v, np.float32) * s) @ R.T
    info = dict(core=W_(core_c), blade_tip=W_((3.4, 5.2, -1.9)), head=W_((0, 6.3, 0)))
    return Obj(W_((0, 3.6, 0)), 7.0 * s, parts, key), info


# ------------------------------------------------------------------------------------------------ the ground and things on it
def ground3d(y=0.0, c='#3a3028', rough=0.35, centre=(0, 0, 30), radius=400, scorch=None):
    """Rough ground, a broad plane with stones and ridges in it."""
    def f(p):
        h = (fbm2(p[:, 0] * 0.25, p[:, 2] * 0.25, 4, 3) - 0.5) * rough * 2 + (fbm2(p[:, 0] * 1.5, p[:, 2] * 1.5, 3, 5) - 0.5) * rough * 0.4
        return (p[:, 1] - y - h) * 0.7
    tex = lambda p: 0.55 + 0.7 * fbm2(p[:, 0] * 0.8, p[:, 2] * 0.8, 4, 9)
    return Obj((centre[0], y - radius + 1.5, centre[2]), radius, [Part(f, 'ground', c=c, tex=tex)], 'ground')


def rock3d(c, r, seed=0, colour='#4a4038'):
    c = np.asarray(c, np.float32)
    def f(p):
        q = p - c
        return (length(q / np.array([1.0, 0.7, 1.0], np.float32)) - r) * 0.7 + (noise3(q[:, 0] * 1.4 / r + seed, q[:, 1] * 1.4 / r, q[:, 2] * 1.4 / r, seed) - 0.5) * r * 0.5
    return Obj(c, r * 1.5, [Part(f, 'stone', c=colour, tex=lambda p: 0.6 + 0.6 * fbm2(p[:, 0] * 2, p[:, 1] * 2 + p[:, 2], 3, seed))], 'rock')


# ------------------------------------------------------------------------------------------------ effects painted after
def halo2d(S, world, depth, hitmask, centre, R, tilt, roll, c, w, bright=1.0):
    ts = np.linspace(0, 2 * np.pi, 360)
    ring = np.stack([np.cos(ts) * R, np.zeros_like(ts), np.sin(ts) * R], 1).astype(np.float32) @ rot(tilt, 0, roll).T + centre
    px, py, vis = world.visible(ring, depth, hitmask)
    idx = np.nonzero(vis)[0]
    if idx.size < 2: return
    for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
        if len(run) < 2: continue
        S.plasma(list(zip(px[run], py[run])), w, c, bright, core='#ffffff')


def glow_at(S, world, P3, depth, hitmask, r, c, a):
    px, py, vis = world.visible(np.asarray(P3, np.float32)[None], depth, hitmask)
    S.glow(float(px[0]), float(py[0]), r, c, a * (1.0 if vis[0] else 0.35))


def flames2d(S, world, pts3, depth, hitmask, c, w=1.2, a=0.8):
    """A trail of plasma behind a figure (painted where nothing stands in front of it)."""
    px, py, d = world.project(np.asarray(pts3, np.float32))
    S.plasma(list(zip(px, py)), w, c, a, core='#fff3c4', taper=0.8)
