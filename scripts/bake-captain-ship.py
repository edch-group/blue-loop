"""
The Captain's ship for Unity, baked from its model (unity/ModelSources/captain-ship/iron-horizon.fbx, a Meshy export) and
painted after its art (reference.png, the same ship side on):

  unity/Assets/Resources/Models/CaptainShip.bytes   the hull, cut down to a size the map can fly, in the ship's box units
  unity/Assets/Resources/Models/CaptainShipPaint.png its paint: the art laid over the hull side on (rgb), lit glass (a)

The model comes untextured, so its look is the art's: the art is fitted over the model's own outline seen side on, then
nudged here and there onto the model's own details (its porthole, windows and plates), and each point of the hull takes
its colour from the art where it lies (CaptainShip.cs, Ship.shader's painted metal).

    pip install numpy pillow pyfqmr
    python3 scripts/bake-captain-ship.py
"""
import os
import struct
import sys
import zlib

import numpy as np
import pyfqmr
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'unity', 'ModelSources', 'captain-ship')
OUT = os.path.join(ROOT, 'unity', 'Assets', 'Resources', 'Models')

# How many triangles the hull keeps (the model has 417k: far too many for a phone's browser, and the map flies it small).
TRIANGLES = 48000
# Box units (CaptainShip.cs: 40 to the model's 1, x along, y across, z up): as long as the old hull, nose to bells, its
# middle where the old one's was, so the Captain, the crew and the cameras keep their places.
LENGTH, NOSE, MID_Z = 43.1, 40.5, 7.3
# The paint's extent (box units, x along and z up) and size.
PAINT_X, PAINT_Z, PAINT_W, PAINT_H = (-4.0, 42.0), (0.0, 16.0), 1536, 512
# Corners sharper than this (degrees) keep their own normals.
CREASE = 42


# ---- FBX (binary) ----

def fbx_nodes(path):
    d = open(path, 'rb').read()
    assert d[:20] == b'Kaydara FBX Binary  ', 'not a binary FBX'
    big = struct.unpack('<I', d[23:27])[0] >= 7500

    def prop(o):
        t = chr(d[o]); o += 1
        if t in 'YCILFD':
            f = {'Y': '<h', 'C': '<?', 'I': '<i', 'L': '<q', 'F': '<f', 'D': '<d'}[t]
            return struct.unpack(f, d[o:o + struct.calcsize(f)])[0], o + struct.calcsize(f)
        if t in 'fdlibc':
            n, enc, cl = struct.unpack('<III', d[o:o + 12]); o += 12
            raw = d[o:o + cl]
            if enc: raw = zlib.decompress(raw)
            return np.frombuffer(raw, dtype={'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1', 'c': 'u1'}[t]), o + cl
        if t in 'SR':
            n = struct.unpack('<I', d[o:o + 4])[0]; o += 4
            return d[o:o + n], o + n
        raise ValueError('FBX property ' + t)

    def node(o):
        if big: end, n, _ = struct.unpack('<QQQ', d[o:o + 24]); o += 24
        else: end, n, _ = struct.unpack('<III', d[o:o + 12]); o += 12
        nl = d[o]; o += 1
        if end == 0: return None, o
        name = d[o:o + nl].decode(); o += nl
        props = []
        for _ in range(n):
            v, o = prop(o); props.append(v)
        kids = []
        while o < end:
            k, o = node(o)
            if k is None: break
            kids.append(k)
        return (name, props, kids), end

    o, out = 27, []
    while o < len(d) - 160:
        n, o = node(o)
        if n is None: break
        out.append(n)
    return out


def child(n, name):
    return next(k for k in n[2] if k[0] == name)


def load_fbx(path):
    """The model's one mesh: its corners and triangles (in the file's own axes: x along, nose to -x; z up)."""
    objects = next(n for n in fbx_nodes(path) if n[0] == 'Objects')
    geo = [k for k in objects[2] if k[0] == 'Geometry']
    assert len(geo) == 1, 'one mesh expected'
    v = child(geo[0], 'Vertices')[1][0].reshape(-1, 3)
    p = child(geo[0], 'PolygonVertexIndex')[1][0]
    ends = np.nonzero(p < 0)[0]
    sizes = np.diff(np.concatenate([[-1], ends]))
    idx = np.where(p < 0, ~p, p)
    if (sizes == 3).all():
        return v, idx.reshape(-1, 3)
    tris, start = [], 0
    for s in sizes:
        poly = idx[start:start + s]
        tris += [(poly[0], poly[i], poly[i + 1]) for i in range(1, s - 1)]
        start += s
    return v, np.array(tris)


# ---- Raster helpers ----

def raster(tris2d, w, h, value=None):
    """Triangles (n,3,2, in pixels) filled into a w×h mask (or, with value, the triangle's index where nearest)."""
    out = np.zeros((h, w), bool)
    for t in tris2d:
        lo = np.floor(t.min(0)).astype(int); hi = np.ceil(t.max(0)).astype(int)
        xs = np.arange(max(lo[0], 0), min(hi[0] + 1, w)); ys = np.arange(max(lo[1], 0), min(hi[1] + 1, h))
        if len(xs) == 0 or len(ys) == 0: continue
        gx, gy = np.meshgrid(xs + 0.5, ys + 0.5)
        (ax, ay), (bx, by), (cx, cy) = t
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12: continue
        w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
        w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
        m = (w0 >= -0.02) & (w1 >= -0.02) & (1 - w0 - w1 >= -0.02)
        out[(gy[m] - 0.5).astype(int), (gx[m] - 0.5).astype(int)] = True
    return out


def nearest(tris2d, depth, w, h):
    """Triangles (n,3,2, in pixels) drawn into a w×h grid, the nearest (greatest depth) winning: each pixel's triangle, or -1."""
    zb = np.full(h * w, -np.inf)
    tid = np.full(h * w, -1)
    lo = np.floor(tris2d.min(1)).astype(int)
    hi = np.ceil(tris2d.max(1)).astype(int)
    size = np.maximum(hi[:, 0] - lo[:, 0], hi[:, 1] - lo[:, 1]) + 1
    for a, b in ((0, 2), (2, 4), (4, 8), (8, 16), (16, 32), (32, 64), (64, 128), (128, 1 << 16)):
        idx = np.nonzero((size > a) & (size <= b))[0]
        if len(idx) == 0: continue
        n = int(min(b, size[idx].max()))
        for chunk in np.array_split(idx, len(idx) * n * n // 4000000 + 1):
            gx = lo[chunk, 0][:, None, None] + np.arange(n)[None, None, :] + 0.5
            gy = lo[chunk, 1][:, None, None] + np.arange(n)[None, :, None] + 0.5
            t = tris2d[chunk]
            ax, ay, bx, by, cx, cy = (t[:, i, j][:, None, None] for i in range(3) for j in range(2))
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            den = np.where(np.abs(den) < 1e-12, 1e-12, den)
            w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
            w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
            inside = (w0 >= 0) & (w1 >= 0) & (1 - w0 - w1 >= 0) & (gx >= 0) & (gx < w) & (gy >= 0) & (gy < h)
            d = depth[chunk]
            z = (w0 * d[:, 0][:, None, None] + w1 * d[:, 1][:, None, None] + (1 - w0 - w1) * d[:, 2][:, None, None])[inside]
            pix = np.broadcast_to(gy.astype(int) * w + gx.astype(int), inside.shape)[inside]
            tri = np.broadcast_to(chunk[:, None, None], inside.shape)[inside]
            order = np.argsort(z)
            pix, z, tri = pix[order], z[order], tri[order]
            _, first = np.unique(pix[::-1], return_index=True)
            last = len(pix) - 1 - first
            better = z[last] > zb[pix[last]]
            zb[pix[last][better]] = z[last][better]
            tid[pix[last][better]] = tri[last][better]
    return tid.reshape(h, w)


def shift(a, dy, dx):
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = a[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return out


def erode(m, r=1):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1): out &= shift(m, dy, dx)
    return out


def dilate(m, r=1):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1): out |= shift(m, dy, dx)
    return out


def fill(rgba, known, rounds=400):
    """Colours spread outward from the known pixels into the rest (each unknown takes its known neighbours' mean)."""
    c = rgba * known[..., None]
    k = known.astype(float)
    for _ in range(rounds):
        if k.min() > 0: break
        s = np.zeros_like(c); n = np.zeros_like(k)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            s += shift(c, dy, dx); n += shift(k, dy, dx)
        new = (k == 0) & (n > 0)
        c[new] = s[new] / n[new][:, None]
        k[new] = 1
    return c, k > 0


# ---- The hull ----

def to_box(v):
    """The file's axes to the ship's box units: x along (nose forward), y across (12 the middle), z up."""
    k = LENGTH / (v[:, 0].max() - v[:, 0].min())
    return np.stack([NOSE - (v[:, 0] - v[:, 0].min()) * k, v[:, 1] * k + 12, v[:, 2] * k + MID_Z], 1)


def creased_normals(v, f):
    """Each triangle's corners' normals: the mean of the faces round the corner that turn less than CREASE from it."""
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    area = np.linalg.norm(fn, axis=1, keepdims=True)
    unit = fn / np.maximum(area, 1e-12)
    faces_of = [[] for _ in range(len(v))]
    for fi, tri in enumerate(f):
        for c in tri: faces_of[c].append(fi)
    cos = np.cos(np.radians(CREASE))
    out = np.zeros((len(f), 3, 3))
    for vi, fs in enumerate(faces_of):
        if not fs: continue
        fs = np.array(fs)
        u = unit[fs]
        near = (u @ u.T) >= cos
        acc = near.astype(float) @ fn[fs]
        acc /= np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-12)
        for j, fi in enumerate(fs):
            out[fi, list(f[fi]).index(vi)] = acc[j]
    return out


# ---- The paint ----

def fit_art(box, f, art_mask):
    """Where the art's pixels lie over the hull side on: u = a + s·x, v = b − t·z, fitted to the model's outline."""
    res = 0.05
    x0, z0 = box[:, 0].min() - 1, box[:, 2].min() - 1
    w, h = int((box[:, 0].max() + 1 - x0) / res), int((box[:, 2].max() + 1 - z0) / res)
    pts = np.stack([(box[:, 0] - x0) / res, (box[:, 2] - z0) / res], 1)
    sil = raster(pts[f], w, h)
    zs, xs = np.nonzero(sil)
    bx, bz = xs * res + x0 + res / 2, zs * res + z0 + res / 2
    ys, us = np.nonzero(art_mask)
    s = (us.max() - us.min()) / (bx.max() - bx.min()); t = (ys.max() - ys.min()) / (bz.max() - bz.min())
    p = [us.min() - s * bx.min(), s, ys.min() + t * bz.max(), t]

    def iou(a, s, b, t):
        u = np.round(a + s * bx).astype(int); vv = np.round(b - t * bz).astype(int)
        ok = (u >= 0) & (u < art_mask.shape[1]) & (vv >= 0) & (vv < art_mask.shape[0])
        cell = s * res * t * res
        inter = art_mask[vv[ok], u[ok]].sum() * cell
        return inter / (len(bx) * cell + art_mask.sum() - inter)

    best = iou(*p)
    for scale in (1, 0.5, 0.25, 0.12):
        step = [8 * scale, 0.5 * scale, 8 * scale, 0.5 * scale]
        better = True
        while better:
            better = False
            for i in range(4):
                for sg in (-1, 1):
                    q = list(p); q[i] += sg * step[i]
                    val = iou(*q)
                    if val > best: best, p, better = val, q, True
    print(f'art fitted over the hull: overlap {best:.3f}')
    return p


def blur(x, k):
    for ax in (0, 1):
        x = sum(np.roll(x, d, ax) for d in range(-k, k + 1)) / (2 * k + 1)
    return x


def warp(box, f, art, fit):
    """
    How far the art's details lie from the model's own, here and there along the hull (box units, x along and z up): the
    model was made from the art but not to the pixel, so its porthole, windows and plates sit a little off the art's.
    The hull's relief side on (the model lit across its faces) is matched against the art's edges a patch at a time, the
    matches it is sure of kept and smoothed: a field (dx, dz) to add to a point of the hull for where the art draws it.
    """
    a, s, b, t = fit
    r = 0.04
    x0, x1, z0, z1 = PAINT_X[0], PAINT_X[1], PAINT_Z[0], PAINT_Z[1]
    w, h = int((x1 - x0) / r), int((z1 - z0) / r)
    fn = np.cross(box[f[:, 1]] - box[f[:, 0]], box[f[:, 2]] - box[f[:, 0]])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    # (Seen from the art's side, -y: the nearest face at each point, lit from above and astern.)
    tid = nearest(np.stack([(box[:, 0] - x0) / r, (z1 - box[:, 2]) / r], 1)[f], -box[:, 1][f], w, h)
    light = np.array([-0.45, -0.55, 0.7]) / np.linalg.norm([-0.45, -0.55, 0.7])
    relief = np.abs(fn[np.maximum(tid, 0)] @ light)
    seen = tid >= 0
    relief[~seen] = relief[seen].mean()
    gx, gz = np.meshgrid(x0 + (np.arange(w) + 0.5) * r, z1 - (np.arange(h) + 0.5) * r)
    u = np.clip(a + s * gx, 0, art.shape[1] - 1).astype(int)
    v = np.clip(b - t * gz, 0, art.shape[0] - 1).astype(int)
    drawn = art[v, u].mean(2)

    def edges(x):
        gy_, gx_ = np.gradient(blur(x, 1))
        return blur(np.hypot(gx_, gy_), 1)

    eg = edges(relief) * seen

    def match(ea, step, half, reach, sig, pen):
        """Each patch of the relief (every step, half wide) sought in the art's edges within reach: a smooth field of how
        far the art lies from it (box units), with how sure it is of each place."""
        half, reach = int(half / r), int(reach / r)
        n, m = 2 * half, 2 * half + 2 * reach
        found = []
        for zc in np.arange(1.0, 15.0, step):
            for xc in np.arange(x0 + 2, x1 - 1, step):
                cx, cy = int((xc - x0) / r), int((z1 - zc) / r)
                if cy - half - reach < 0 or cy + half + reach > h or cx - half - reach < 0 or cx + half + reach > w: continue
                if seen[cy - half:cy + half, cx - half:cx + half].mean() < 0.6: continue
                p = eg[cy - half:cy + half, cx - half:cx + half]
                p = p - p.mean()
                if p.std() < 1e-3: continue
                q = ea[cy - half - reach:cy + half + reach, cx - half - reach:cx + half + reach]
                q = q - q.mean()
                cc = np.fft.irfft2(np.conj(np.fft.rfft2(p, (m, m))) * np.fft.rfft2(q, (m, m)), (m, m))[:2 * reach + 1, :2 * reach + 1]
                cs = np.cumsum(np.cumsum(np.pad(q * q, ((1, 0), (1, 0))), 0), 1)
                energy = cs[n:, n:] - cs[:-n, n:] - cs[n:, :-n] + cs[:-n, :-n]
                ncc = cc / np.sqrt(np.maximum(energy[:2 * reach + 1, :2 * reach + 1], 1e-9) * (p * p).sum())
                dy, dx = np.mgrid[-reach:reach + 1, -reach:reach + 1]
                iy, ix = np.unravel_index(np.argmax(ncc - pen * np.hypot(dx, dy) / reach), ncc.shape)
                best = ncc[iy, ix]
                if best > 0.3 and best > ncc[reach, reach] + 0.01:
                    found.append((xc, zc, (ix - reach) * r, -(iy - reach) * r, min(best - 0.3, 0.5)))
        px, pz, pdx, pdz, conf = np.array(found).T

        def field(qx, qz, val, wt, sg):
            e = wt * np.exp(-((qx[..., None] - px) ** 2 + (qz[..., None] - pz) ** 2) / (2 * sg * sg))
            return (e * val).sum(-1) / (e.sum(-1) + 1e-3), e.sum(-1)

        keep = conf > 0
        for _ in range(2):
            mx, _ = field(px, pz, pdx, conf * keep, sig * 1.5)
            mz, _ = field(px, pz, pdz, conf * keep, sig * 1.5)
            keep &= (np.abs(pdx - mx) < 0.4) & (np.abs(pdz - mz) < 0.4)
        print(f'art matched to the hull at {keep.sum()} of {len(px)} places (patches {2 * half * r:.1f} wide)')

        def at(qx, qz):
            out = []
            for rows in np.array_split(np.arange(qx.shape[0]), max(1, qx.size * len(px) // 4000000)):
                fx, wsum = field(qx[rows], qz[rows], pdx, conf * keep, sig)
                fz, _ = field(qx[rows], qz[rows], pdz, conf * keep, sig)
                k = wsum / (wsum + 0.05)
                out.append((fx * k, fz * k))
            return np.concatenate([o[0] for o in out]), np.concatenate([o[1] for o in out])

        return at

    def drawn_at(fx, fz):
        u = np.clip(a + s * (gx + fx), 0, art.shape[1] - 1).astype(int)
        v = np.clip(b - t * (gz + fz), 0, art.shape[0] - 1).astype(int)
        return edges(art[v, u].mean(2))

    # Coarse, then finer and finer: each pass matching what the last left over (where nothing was matched, nothing moves).
    passes = []
    fx, fz = np.zeros_like(gx), np.zeros_like(gz)
    for step, half, reach, sig, pen in ((1.0, 1.8, 1.6, 2.0, 0.08), (0.6, 1.0, 0.7, 1.0, 0.1), (0.4, 0.6, 0.4, 0.6, 0.15)):
        f = match(drawn_at(fx, fz), step, half, reach, sig, pen)
        passes.append(f)
        dx, dz = f(gx, gz)
        fx, fz = fx + dx, fz + dz

    def at(qx, qz):
        tx, tz = np.zeros_like(qx), np.zeros_like(qz)
        for f in passes:
            dx, dz = f(qx, qz)
            tx, tz = tx + dx, tz + dz
        return np.clip(tx, -2, 2), np.clip(tz, -2, 2)

    at.relief = eg
    at.edges = edges
    return at


def ship_mask(art):
    """The art's ship: everything but the paper round it (lit windows, near white, are the ship's: the paper is what
    reaches the edge of the picture)."""
    bg = np.median(np.concatenate([art[:16, :16], art[:16, -16:], art[-16:, :16], art[-16:, -16:]]).reshape(-1, 3), 0)
    plain = np.abs(art - bg).max(2) <= 0.08
    paper = Image.fromarray((plain * 255).astype(np.uint8)).copy()
    from PIL import ImageDraw
    for corner in ((0, 0), (paper.width - 1, 0), (0, paper.height - 1), (paper.width - 1, paper.height - 1)):
        if paper.getpixel(corner) == 255: ImageDraw.floodfill(paper, corner, 128)
    ship = np.asarray(paper) != 128
    # (Paper seen through the ship, between the dish's struts or the rail's bars, is still paper; but not lit glass, as
    # pale as the paper: the windows are small.)
    holes = Image.fromarray(((ship & plain) * 255).astype(np.uint8)).copy()
    h = np.asarray(holes)
    while True:
        ys, xs = np.nonzero(np.asarray(holes) == 255)
        if len(ys) == 0: break
        ImageDraw.floodfill(holes, (int(xs[0]), int(ys[0])), 100)
        blob = np.asarray(holes) == 100
        ImageDraw.floodfill(holes, (int(xs[0]), int(ys[0])), 1 if blob.sum() > 300 else 2)
    return ship & (np.asarray(holes) != 1)


def paint(art, fit, moved):
    """The paint, over the box (x along, z up): the art's colours, its lit glass and lamps in alpha, gaps filled."""
    a, s, b, t = fit
    h, w = art.shape[:2]
    ship = ship_mask(art)
    r, g, bl = art[..., 0], art[..., 1], art[..., 2]
    hi, lo = art.max(2), art.min(2)
    # Lit glass and lamps: near white and bright, or a hot warm glow (the porthole's rim, the bells' throats).
    lit = np.clip((lo - 0.55) / 0.25, 0, 1) * np.clip((hi - 0.85) / 0.1, 0, 1)
    warm = np.clip((r - 0.88) / 0.08, 0, 1) * np.clip((g - 0.6) / 0.15, 0, 1)
    glow = np.maximum(lit, warm)
    # (Not a highlight's thin glint along a pipe or a rail: only lit patches with some body to them; but the engines'
    # throats, seen edge on, all of theirs.)
    body = dilate(erode(glow > 0.5, 2), 3)
    body[:, :int(a)] = True
    bg = np.median(np.concatenate([art[:16, :16], art[:16, -16:], art[-16:, :16], art[-16:, -16:]]).reshape(-1, 3), 0)
    pale = (np.abs(art - bg).max(2) <= 0.08) & (hi < 0.962)
    glow = glow * body * ship * ~pale
    # Over the box's grid.
    xs = np.linspace(PAINT_X[0], PAINT_X[1], PAINT_W, endpoint=False) + (PAINT_X[1] - PAINT_X[0]) / PAINT_W / 2
    zs = np.linspace(PAINT_Z[1], PAINT_Z[0], PAINT_H, endpoint=False) - (PAINT_Z[1] - PAINT_Z[0]) / PAINT_H / 2
    gx, gz = np.meshgrid(xs, zs)
    dx, dz = np.zeros_like(gx), np.zeros_like(gz)
    for rows in np.array_split(np.arange(PAINT_H), 16):
        dx[rows], dz[rows] = moved(gx[rows], gz[rows])
    u, v = a + s * (gx + dx), b - t * (gz + dz)
    inside = (u >= 0) & (u <= w - 1) & (v >= 0) & (v <= h - 1)
    ui, vi = np.clip(u, 0, w - 1), np.clip(v, 0, h - 1)
    u0, v0 = np.floor(ui).astype(int), np.floor(vi).astype(int)
    u1, v1 = np.minimum(u0 + 1, w - 1), np.minimum(v0 + 1, h - 1)
    fu, fv = (ui - u0)[..., None], (vi - v0)[..., None]
    # (The lights are set apart from the art's colours, which are left as the plating round them: each is put on the
    # hull by itself below.)
    lamps = glow > 0.02
    plating, _ = fill(np.concatenate([art, np.ones_like(glow[..., None])], 2), ~dilate(lamps, 2), rounds=60)
    rgba = np.concatenate([plating[..., :3], np.zeros_like(glow[..., None])], 2)

    def bil(img):
        return (img[v0, u0] * (1 - fu) * (1 - fv) + img[v0, u1] * fu * (1 - fv) + img[v1, u0] * (1 - fu) * fv + img[v1, u1] * fu * fv)

    out = bil(rgba)
    # (The art's own edge, half its paper, left out: what lies past it takes the colour just within.)
    known = inside & (bil(erode(ship, 2)[..., None].astype(float))[..., 0] > 0.99)
    out, filled = fill(out, known)
    out[~filled] = [0.33, 0.36, 0.4, 0]
    out[~known, 3] = 0
    lights(out, art, glow, fit, moved, gx, gz)
    return out


def lights(out, art, glow, fit, moved, gx, gz):
    """
    The art's lights (windows, the porthole, lamps, the bells' throats) put on the hull each where the model has it: the
    lit patch, as the art draws it, sought round where the paint would lay it for the window, porthole or lamp in the
    model's own relief that it fits best (its outline against the relief's edges), and set there whole, unwarped.
    """
    a, s, b, t = fit
    eg, edges = moved.relief, moved.edges
    r = 0.04
    x0, z1 = PAINT_X[0], PAINT_Z[1]
    hh, ww = eg.shape
    from PIL import ImageDraw
    marks = Image.fromarray(((glow > 0.3) * 255).astype(np.uint8)).copy()
    n_set = n_kept = 0
    while True:
        ys, xs = np.nonzero(np.asarray(marks) == 255)
        if len(ys) == 0: break
        ImageDraw.floodfill(marks, (int(xs[0]), int(ys[0])), 100)
        blob = np.asarray(marks) == 100
        ImageDraw.floodfill(marks, (int(xs[0]), int(ys[0])), 1)
        by, bx = np.nonzero(blob)
        if len(by) < 4: continue
        # Its patch of the art (a margin round it, for its halo), and where it is in the box.
        pad = 6
        v0, v1, u0, u1 = max(by.min() - pad, 0), min(by.max() + pad + 1, art.shape[0]), max(bx.min() - pad, 0), min(bx.max() + pad + 1, art.shape[1])
        cu, cv = bx.mean(), by.mean()
        cx, cz = (cu - a) / s, (b - cv) / t
        # (Where the paint would lay it: the hull point the warp sends there, found by stepping back along it.)
        hx, hz = cx, cz
        for _ in range(4):
            dx, dz = moved(np.array([[hx]]), np.array([[hz]]))
            hx, hz = cx - dx[0, 0], cz - dz[0, 0]
        # Its outline, on the relief's grid, matched against the relief's edges nearby.
        reach = int(1.0 / r)
        half_u, half_v = (u1 - u0) / 2 / s, (v1 - v0) / 2 / t
        nx, nz = int(np.ceil(half_u / r)) + 2, int(np.ceil(half_v / r)) + 2
        px, pz = int((hx - x0) / r), int((z1 - hz) / r)
        best = None
        if cx > 0 and len(by) >= 12 and pz - nz - reach >= 0 and pz + nz + reach < hh and px - nx - reach >= 0 and px + nx + reach < ww:
            ox = (np.arange(-nx, nx + 1)) * r
            oz = -(np.arange(-nz, nz + 1)) * r
            qx, qz = np.meshgrid(ox, oz)
            uu = np.clip(cu + qx * s, 0, art.shape[1] - 1).astype(int)
            vv = np.clip(cv - qz * t, 0, art.shape[0] - 1).astype(int)
            tpl = edges(dilate(blob, 1)[vv, uu].astype(float))
            tpl = tpl - tpl.mean()
            if tpl.std() > 1e-4:
                scores = np.full((2 * reach + 1, 2 * reach + 1), -1.0)
                for j in range(-reach, reach + 1):
                    for i in range(-reach, reach + 1):
                        q = eg[pz + j - nz:pz + j + nz + 1, px + i - nx:px + i + nx + 1]
                        q = q - q.mean()
                        den = np.sqrt((q * q).sum() * (tpl * tpl).sum())
                        if den > 1e-9: scores[j + reach, i + reach] = (q * tpl).sum() / den - 0.15 * np.hypot(i, j) / reach
                j, i = np.unravel_index(np.argmax(scores), scores.shape)
                if scores[j, i] > 0.2:
                    best = (hx + (i - reach) * r, hz - (j - reach) * r)
        if best is None: n_kept += 1
        else: n_set += 1
        lx, lz = best or (hx, hz)
        # Set there: each paint point near it takes the art's light at the same place in the patch.
        sel = (gx >= lx - half_u) & (gx <= lx + half_u) & (gz >= lz - half_v) & (gz <= lz + half_v)
        uu = np.round(cu + (gx[sel] - lx) * s).astype(int)
        vv = np.round(cv - (gz[sel] - lz) * t).astype(int)
        ok = (uu >= u0) & (uu < u1) & (vv >= v0) & (vv < v1)
        g = glow[vv[ok], uu[ok]]
        idx = tuple(np.array(np.nonzero(sel))[:, ok])
        cur = out[idx]
        cur[:, :3] = np.where((g > cur[:, 3])[:, None], art[vv[ok], uu[ok]], cur[:, :3])
        cur[:, 3] = np.maximum(cur[:, 3], g)
        out[idx] = cur
    print(f'lights set on the hull: {n_set} on its own windows and lamps, {n_kept} where the paint lays them')


def main():
    v, f = load_fbx(os.path.join(SRC, 'iron-horizon.fbx'))
    print(f'model: {len(v)} corners, {len(f)} triangles')
    box = to_box(v)
    art = np.asarray(Image.open(os.path.join(SRC, 'reference.png')).convert('RGB')).astype(float) / 255

    simp = pyfqmr.Simplify()
    simp.setMesh(box.astype(np.float64), f.astype(np.int32))
    simp.simplify_mesh(target_count=TRIANGLES, aggressiveness=5, preserve_border=True, verbose=0)
    bv, bf, _ = simp.getMesh()
    keep = np.linalg.norm(np.cross(bv[bf[:, 1]] - bv[bf[:, 0]], bv[bf[:, 2]] - bv[bf[:, 0]]), axis=1) > 1e-9
    bf = bf[keep]
    print(f'cut down to {len(bv)} corners, {len(bf)} triangles')

    fit = fit_art(bv, bf, ship_mask(art))
    pm = paint(art, fit, warp(bv, bf, art, fit))
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(pm, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'CaptainShipPaint.png'), optimize=True)

    # Each triangle's corners with their own normals (shared where smooth), and its material: 8, painted metal; 9 the
    # same where the engines' throats face astern (their glow seen from behind as well as side on).
    cn = creased_normals(bv, bf)
    fn = np.cross(bv[bf[:, 1]] - bv[bf[:, 0]], bv[bf[:, 2]] - bv[bf[:, 0]])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    cx = bv[bf].mean(1)[:, 0]
    mat = np.where((cx < -0.6) & (np.abs(fn[:, 0]) > 0.55), 9, 8)
    q = 512
    pos = np.round(bv[bf].reshape(-1, 3) * q).astype(np.int16)
    nor = np.round(cn.reshape(-1, 3) * 127).astype(np.int8)
    m = np.repeat(mat, 3).astype(np.uint8)
    key = np.concatenate([pos.view(np.uint8).reshape(-1, 6), nor.view(np.uint8).reshape(-1, 3), m[:, None]], 1)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    print(f'{len(uniq)} vertices')
    with open(os.path.join(OUT, 'CaptainShip.bytes'), 'wb') as o:
        o.write(b'BLCS')
        o.write(struct.pack('<iiif', 1, len(uniq), len(bf), q))
        o.write(struct.pack('<4f', PAINT_X[0], PAINT_X[1], PAINT_Z[0], PAINT_Z[1]))
        o.write(uniq.astype(np.uint8).tobytes())
        o.write(inv.astype('<u4' if len(uniq) > 65535 else '<u2').tobytes())
    print('written', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    sys.exit(main())
