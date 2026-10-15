"""
The Captain's ship for Unity, baked from its model (unity/ModelSources/captain-ship/iron-horizon.fbx, a Meshy export) and
painted after its art (reference.png, the same ship side on: a guide only, its pixels never laid on the model):

  unity/Assets/Resources/Models/CaptainShip.bytes   the hull, cut down to a size the map can fly, in the ship's box units
  unity/Assets/Resources/Models/CaptainShipPaint.png its paint, each side seen square (rgb), lit glass (a)

The model comes untextured and is not the art to the pixel, so the art cannot simply be laid over it: it is repainted
from its own shape instead, in the art's colours. The hull is parted into its own pieces (plates, panels, frames, panes,
pipes, bands), seen square from each side, and each piece painted by what it is: slate plating, darker panels set in,
amber trim, the windows and porthole lit, the rail's glass; its edges inked as the art inks its own. The lamps and the
bells' throats are marked on the hull itself (CaptainShip.cs, Ship.shader's painted metal).

    pip install numpy pillow pyfqmr scipy scikit-image
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
# The engine block's three bells, their mouths' centres (box units: across, up), as CaptainShip.cs has them.
BELLS = ((9.96, 5.3), (14.08, 5.3), (11.9, 2.5))
# Where the dish's struts meet over it, its lamp (box units: along, up).
DISH_LAMP = (6.1, 10.9)
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

def side_view(box, f, fn, sign):
    """
    The hull seen square from one side (sign −1: from −y; +1 the other), on the paint's grid: at each
    point the face seen there, and the hull's own pieces as it is made (its plates, frames, window panes, bands): parts
    of it parted by a crease or a step, found where the faces' normals turn or the surface jumps.
    """
    from scipy import ndimage
    from skimage import measure
    rx, rz = (PAINT_X[1] - PAINT_X[0]) / PAINT_W, (PAINT_Z[1] - PAINT_Z[0]) / PAINT_H
    tid = nearest(np.stack([(box[:, 0] - PAINT_X[0]) / rx, (PAINT_Z[1] - box[:, 2]) / rz], 1)[f], -sign * box[:, 1][f], PAINT_W, PAINT_H)
    gx, gz = np.meshgrid(PAINT_X[0] + (np.arange(PAINT_W) + 0.5) * rx, PAINT_Z[1] - (np.arange(PAINT_H) + 0.5) * rz)
    t = np.maximum(tid, 0)
    n = fn[t]
    p0 = box[f[t, 0]]
    ny = np.where(np.abs(n[..., 1]) < 1e-3, 1e-3, n[..., 1])
    y = np.clip(p0[..., 1] - (n[..., 0] * (gx - p0[..., 0]) + n[..., 2] * (gz - p0[..., 2])) / ny, p0[..., 1] - 1, p0[..., 1] + 1)
    seen = tid >= 0
    edge = np.zeros_like(seen)
    for dy, dx in ((0, 1), (1, 0)):
        n2, y2, s2 = (np.roll(q, (-dy, -dx), (0, 1)) for q in (n, y, seen))
        edge |= (np.sum(n * n2, -1) < np.cos(np.radians(20))) | (np.abs(y - y2) > 0.06) | (seen != s2)
    lab = measure.label(seen & ~edge, connectivity=1)
    # (The creases themselves go to the piece nearest them.)
    near = ndimage.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
    lab = lab[near[0], near[1]] * seen
    return tid, lab, edge & seen, gx, gz


# The ship's colours, after its art.
SLATE = (0.31, 0.33, 0.37)      # its plating
PANEL = (0.18, 0.19, 0.22)      # panels set into it, slots, the joints between its sections
FRAME = (0.13, 0.14, 0.16)      # the porthole's frame, pipes' fittings, the mast, the rails, anything thin
PIPE = (0.22, 0.24, 0.27)       # its pipes
AMBER = (0.86, 0.55, 0.17)      # its trim: the bow's band, the bells' rims, the lower pipe
WINDOW = (1.0, 0.88, 0.58)      # its lit windows
PORT = (1.0, 0.74, 0.32)        # the porthole's glow
GLASS = (0.42, 0.56, 0.64)      # the deck rail's glass
CYAN = (0.55, 0.92, 1.0)        # its lamps (the bow's, the dish's)


def pieces(box, f, fn, sign):
    """Each of the hull's pieces seen from one side (side_view), with its place, size and how far it stands out."""
    from scipy import ndimage
    from skimage import measure
    tid, lab, edge, gx, gz = side_view(box, f, fn, sign)
    rx, rz = gx[0, 1] - gx[0, 0], gz[0, 0] - gz[1, 0]
    t = np.maximum(tid, 0)
    n = fn[t]
    p0 = box[f[t, 0]]
    ny = np.where(np.abs(n[..., 1]) < 1e-3, 1e-3, n[..., 1])
    out = np.abs(np.clip(p0[..., 1] - (n[..., 0] * (gx - p0[..., 0]) + n[..., 2] * (gz - p0[..., 2])) / ny, p0[..., 1] - 1, p0[..., 1] + 1) - 12)
    seen = tid >= 0
    found = []
    for p in measure.regionprops(lab):
        r0, c0, r1, c1 = p.bbox
        m = lab[r0:r1, c0:c1] == p.label
        # (How far it stands out from what is round it: raised, or set in.)
        pad = 5
        R0, C0, R1, C1 = max(r0 - pad, 0), max(c0 - pad, 0), r1 + pad, c1 + pad
        big = lab[R0:R1, C0:C1] == p.label
        ring = ndimage.binary_dilation(big, iterations=4) & ~big & seen[R0:R1, C0:C1]
        o = out[R0:R1, C0:C1]
        raised = float(np.median(o[big]) - np.median(o[ring])) if ring.any() else 0.0
        cy, cx = p.centroid
        found.append(dict(label=p.label, x=gx[0, 0] + cx * rx, z=gz[0, 0] - cy * rz, area=p.area * rx * rz,
                          w=(c1 - c0) * rx, h=(r1 - r0) * rz, raised=raised))
    return tid, lab, edge, found


def kind_of(pc):
    """What a piece is, by its place, size and relief (the model's own: the art only says what colour each kind is)."""
    x, z, ar, w, h, raised = pc['x'], pc['z'], pc['area'], pc['w'], pc['h'], pc['raised']
    if 15.5 < x < 20.5 and 4 < z < 5.8 and 1.5 < ar < 4.5 and w > 1.8: return 'port'
    if 0.04 < ar < 0.3 and 0.25 < w < 0.8 and 0.15 < h < 0.5 and 1.1 < w / h < 3 and -0.3 < raised < -0.04 and (5.9 < z < 6.8 or 8.6 < z < 9.8): return 'window'
    if 23 < x < 35.5 and 8.1 < z < 8.9 and 0.4 < ar < 1.4: return 'glass'
    if 32 < x < 33 and 4.3 < z < 4.9 and ar < 0.15: return 'lamp'
    # (The porthole's heavy frame, round its glass.)
    if 14.8 < x - w / 2 and x + w / 2 < 21.2 and 3.3 < z - h / 2 and z + h / 2 < 7.6: return 'frame'
    if w > 4 and w / max(h, 1e-3) > 7:
        return 'amber' if 2.55 < z < 3.1 and x > 4 else 'pipe'
    # (The bells: dark, ringed in amber.)
    if x < 0 and h > 0.8: return 'amber' if w < 0.7 else 'panel'
    if h > 2.2 and w < 1.7 and z > 3:
        return 'amber' if x > 34.5 else 'panel'
    if min(w, h) < 0.16 and ar < 0.3: return 'frame'
    if 0.15 < ar < 6 and raised < -0.04: return 'panel'
    if 0.25 < ar < 0.5 and h > 1.5 * w and 5.4 < z < 6.6: return 'panel'
    return 'slate'


def paint(box, f, fn):
    """
    The paint, both sides of the hull (−y in the lower half, +y the upper), over the box (x along, z up): painted piece by
    piece of the hull as it is made, each by what it is (slate plating, panels set in, joints and pipes, amber trim, lit
    windows and porthole, the rail's glass), its edges inked as the art inks its own; lit (alpha) only its windows and
    porthole.
    """
    colour = dict(slate=SLATE, panel=PANEL, frame=FRAME, pipe=PIPE, amber=AMBER, window=WINDOW, port=PORT, glass=GLASS, lamp=CYAN)
    halves, seen = [], {}
    for sign in (1, -1):
        tid, lab, edge, found = pieces(box, f, fn, sign)
        seen[sign] = np.bincount(tid[tid >= 0], minlength=len(f))
        col = np.tile(np.array(SLATE), (lab.max() + 1, 1))
        lit = np.zeros(lab.max() + 1)
        counts = {}
        for pc in found:
            k = kind_of(pc)
            counts[k] = counts.get(k, 0) + 1
            col[pc['label']] = colour[k]
            lit[pc['label']] = k in ('window', 'port', 'lamp')
        C, A = col[lab], lit[lab]
        # (An amber stripe round the engine block's fore edge.)
        rx, rz = (PAINT_X[1] - PAINT_X[0]) / PAINT_W, (PAINT_Z[1] - PAINT_Z[0]) / PAINT_H
        gx, gz = np.meshgrid(PAINT_X[0] + (np.arange(PAINT_W) + 0.5) * rx, PAINT_Z[1] - (np.arange(PAINT_H) + 0.5) * rz)
        stripe = (gx > 3.15) & (gx < 3.45) & (gz > 1.8) & (gz < 7.9) & (tid >= 0) & (np.all(C == SLATE, -1))
        C = np.where(stripe[..., None], np.array(AMBER), C)
        out = np.where((edge & (A < 0.5))[..., None], C * 0.5, C)
        print(f'{"+" if sign > 0 else "-"}y side:', ', '.join(f'{v} {k}' for k, v in sorted(counts.items())))
        rgba = np.concatenate([out, A[..., None]], 2)
        rgba, _ = fill(rgba, tid >= 0, rounds=40)
        halves.append(rgba)
    out = np.concatenate(halves, 0)
    # (A patch of plain plating in the corner, for what neither side's paint shows.)
    out[:4, :4] = [*SLATE, 0]
    out[:4, 4:8] = [*AMBER, 0]
    return out, seen


def main():
    v, f = load_fbx(os.path.join(SRC, 'iron-horizon.fbx'))
    print(f'model: {len(v)} corners, {len(f)} triangles')
    box = to_box(v)

    simp = pyfqmr.Simplify()
    simp.setMesh(box.astype(np.float64), f.astype(np.int32))
    simp.simplify_mesh(target_count=TRIANGLES, aggressiveness=5, preserve_border=True, verbose=0)
    bv, bf, _ = simp.getMesh()
    keep = np.linalg.norm(np.cross(bv[bf[:, 1]] - bv[bf[:, 0]], bv[bf[:, 2]] - bv[bf[:, 0]]), axis=1) > 1e-9
    bf = bf[keep]
    print(f'cut down to {len(bv)} corners, {len(bf)} triangles')

    fn = np.cross(bv[bf[:, 1]] - bv[bf[:, 0]], bv[bf[:, 2]] - bv[bf[:, 0]])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    pm, seen = paint(bv, bf, fn)
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(pm, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'CaptainShipPaint.png'), optimize=True)

    # Each triangle's corners with their own normals (shared where smooth), and its material: painted metal, 8 on the
    # −y side (the paint's lower half), 10 on the +y side (its upper), 13 plain plating, 14 the bells' amber lips; 9 the engines' throats, deep in
    # the bells, lit.
    cn = creased_normals(bv, bf)
    cen = bv[bf].mean(1)
    side = np.where(np.abs(fn[:, 1]) > 0.05, np.sign(fn[:, 1]), np.sign(cen[:, 1] - 12 + 1e-9))
    mat = np.where(side > 0, 10, 8)
    # Faces hidden from their side (behind a pipe, under a lug), big enough to have been seen if they were: plain
    # plating (13), not the paint of whatever hides them.
    rx, rz = (PAINT_X[1] - PAINT_X[0]) / PAINT_W, (PAINT_Z[1] - PAINT_Z[0]) / PAINT_H
    q2 = np.stack([bv[:, 0] / rx, bv[:, 2] / rz], 1)[bf]
    e1, e2 = q2[:, 1] - q2[:, 0], q2[:, 2] - q2[:, 0]
    px_area = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]) / 2
    shown = np.where(side > 0, seen[1], seen[-1])
    mat[(shown == 0) & (px_area > 3)] = 13
    for y, z in BELLS:
        r = np.hypot(cen[:, 1] - y, cen[:, 2] - z)
        # (Each bell's mouth ringed in amber (14), its throat burning (9).)
        mat[(cen[:, 0] < -1.6) & (r > 1.25) & (r < 2.2) & (fn[:, 0] < -0.5)] = 14
        mat[(cen[:, 0] < -0.8) & (r < 1.25) & (fn[:, 0] < 0.3)] = 9
    # The lamps: the mast's at its top (12, amber), the dish's at its feed, where its struts meet (11, cyan).
    mat[(cen[:, 2] > 13.55) & (cen[:, 0] > 13.9) & (cen[:, 0] < 14.9)] = 12
    near = (np.abs(cen[:, 0] - DISH_LAMP[0]) < 0.3) & (np.abs(cen[:, 2] - DISH_LAMP[1]) < 0.3)
    if near.any():
        at = np.array([DISH_LAMP[0], np.median(cen[near, 1]), DISH_LAMP[1]])
        mat[np.linalg.norm(cen - at, axis=1) < 0.38] = 11
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
