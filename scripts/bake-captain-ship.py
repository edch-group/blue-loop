"""
The Captain's ship for Unity, baked from its model (unity/ModelSources/captain-ship/iron-horizon.fbx, a Meshy export) and
painted after its art (reference.png, the same ship side on: a guide only, its pixels never laid on the model):

  unity/Assets/Resources/Models/CaptainShip.bytes   the hull, cut down to a size the map can fly, in the ship's box units,
                                                    each corner's colour and whether it glows

The model comes untextured and is not the art to the pixel, so the art is not laid over it: it is repainted from its own
shape in the art's colours. The hull is parted into its own pieces (plates, panels, frames, panes, pipes, bands), seen
square from each side, and each piece sorted by what it is: slate plating, darker panels set in, amber trim, the windows
and porthole lit, the rail's glass; each face of the hull takes its piece's colour, so every border runs along the
model's own edges. The lamps and the bells' fiery throats are marked on it too (CaptainShip.cs, Ship.shader).

    pip install numpy pillow pyfqmr scipy scikit-image
    python3 scripts/bake-captain-ship.py
"""
import os
import struct
import sys
import zlib

import numpy as np
import pyfqmr

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'unity', 'ModelSources', 'captain-ship')
OUT = os.path.join(ROOT, 'unity', 'Assets', 'Resources', 'Models')

# How many triangles the hull keeps (the model has 417k: far too many for a phone's browser, and the map flies it small).
TRIANGLES = 48000
# Box units (CaptainShip.cs: 40 to the model's 1, x along, y across, z up): as long as the old hull, nose to bells, its
# middle where the old one's was, so the Captain, the crew and the cameras keep their places.
LENGTH, NOSE, MID_Z = 43.1, 40.5, 7.3
# The side views' extent (box units, x along and z up) and size, in which the hull's pieces are found.
VIEW_X, VIEW_Z, VIEW_W, VIEW_H = (-4.0, 42.0), (0.0, 16.0), 1536, 512
# The engine block's four bells, their mouths' centres (box units: across, up), as CaptainShip.cs has them.
BELLS = ((9.96, 5.3), (14.08, 5.3), (10.9, 3.1), (13.2, 3.1))
# Each bell's throat (box units: across, up; the two upper bells, then the two lower), where its burning disc closes it,
# and the dark plate behind the lower two (along; across from, to; up from, to).
THROATS = BELLS
THROAT_X = -1.5
BACKING = (-0.9, (9.6, 14.5), (1.7, 3.6))
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
    rx, rz = (VIEW_X[1] - VIEW_X[0]) / VIEW_W, (VIEW_Z[1] - VIEW_Z[0]) / VIEW_H
    tid = nearest(np.stack([(box[:, 0] - VIEW_X[0]) / rx, (VIEW_Z[1] - box[:, 2]) / rz], 1)[f], -sign * box[:, 1][f], VIEW_W, VIEW_H)
    gx, gz = np.meshgrid(VIEW_X[0] + (np.arange(VIEW_W) + 0.5) * rx, VIEW_Z[1] - (np.arange(VIEW_H) + 0.5) * rz)
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
FIRE = (1.0, 0.5, 0.12)         # the bells' throats burning
LAMP = (1.0, 0.86, 0.4)         # the mast's lamp
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


def face_paint(box, f, fn):
    """
    Each face's colour, and whether it glows: painted part by part of the hull as it is made (seen square from each
    side, its pieces sorted by what they are), each face taking its piece's colour, so every border between colours runs
    along the model's own edges. Faces neither side shows (tops, undersides, the backs of things) take the colour of the
    face beside them they run smoothly on from (a band round its top, plating over the hull's back); what is still
    unknown is plating.
    """
    colour = dict(slate=SLATE, panel=PANEL, frame=FRAME, pipe=PIPE, amber=AMBER, window=WINDOW, port=PORT, glass=GLASS, lamp=CYAN)
    nf = len(f)
    col = np.full((nf, 3), np.nan)
    glow = np.zeros(nf, bool)
    shade = np.ones(nf)
    side = np.where(fn[:, 1] > 0, 1, -1)
    for sign in (1, -1):
        tid, lab, edge, found = pieces(box, f, fn, sign)
        kinds = {pc['label']: kind_of(pc) for pc in found}
        counts = {}
        for k in kinds.values(): counts[k] = counts.get(k, 0) + 1
        print(f'{"+" if sign > 0 else "-"}y side:', ', '.join(f'{v} {k}' for k, v in sorted(counts.items())))
        # Each face: the piece most of it is seen in, from its own side (or, when its side never shows it, the other).
        t, l = tid.ravel(), lab.ravel()
        m = (t >= 0) & (l > 0)
        pair = t[m].astype(np.int64) * (lab.max() + 1) + l[m]
        up, cnt = np.unique(pair, return_counts=True)
        fa, la = up // (lab.max() + 1), up % (lab.max() + 1)
        o = np.lexsort((-cnt, fa))
        fa, la = fa[o], la[o]
        first = np.r_[True, fa[1:] != fa[:-1]]
        fa, la = fa[first], la[first]
        mine = (side[fa] == sign) | np.isnan(col[fa, 0])
        fa, la = fa[mine], la[mine]
        for fi, li in zip(fa, la):
            k = kinds.get(li, 'slate')
            col[fi] = colour[k]
            glow[fi] = k in ('window', 'port', 'lamp')
            # (Plates a shade apart, as the art's are.)
            shade[fi] = 0.95 + 0.1 * ((li * 2654435761) % 1000) / 1000 if k in ('slate', 'panel') else 1
    # Faces neither side shows: from their neighbours across smooth edges (never a light's glow).
    e = np.sort(np.stack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]], 1).reshape(-1, 2), 1)
    fid = np.repeat(np.arange(nf), 3)
    key = e[:, 0] * len(box) + e[:, 1]
    o = np.argsort(key)
    key, fid = key[o], fid[o]
    same = key[1:] == key[:-1]
    a, b = fid[:-1][same], fid[1:][same]
    smooth = np.sum(fn[a] * fn[b], 1) > np.cos(np.radians(35))
    a, b = a[smooth], b[smooth]
    known = ~np.isnan(col[:, 0])
    src = np.where(glow[:, None], np.array(SLATE), col)
    for _ in range(300):
        go_ab = known[a] & ~known[b]
        go_ba = known[b] & ~known[a]
        if not (go_ab.any() or go_ba.any()): break
        col[b[go_ab]] = src[a[go_ab]]
        src[b[go_ab]] = src[a[go_ab]]
        known[b[go_ab]] = True
        col[a[go_ba]] = src[b[go_ba]]
        src[a[go_ba]] = src[b[go_ba]]
        known[a[go_ba]] = True
    col[~known] = SLATE
    cen = box[f].mean(1)
    # An amber stripe round the engine block's fore edge.
    col[(cen[:, 0] > 3.0) & (cen[:, 0] < 3.6) & (cen[:, 2] > 1.8) & (cen[:, 2] < 7.9) & np.all(col == SLATE, 1)] = AMBER
    # The bells: each mouth's lip amber, each throat burning.
    for y, z in BELLS:
        r = np.hypot(cen[:, 1] - y, cen[:, 2] - z)
        col[(cen[:, 0] < -1.6) & (r > 1.25) & (r < 2.2) & (fn[:, 0] < -0.5)] = AMBER
        throat = (cen[:, 0] < -0.8) & (r < 1.25) & (fn[:, 0] < 0.3)
        col[throat] = FIRE
        glow[throat] = True
    # The lamps: the mast's at its top (amber), the dish's at its feed, where its struts meet (cyan).
    mast = (cen[:, 2] > 13.55) & (cen[:, 0] > 13.9) & (cen[:, 0] < 14.9)
    col[mast], glow[mast] = LAMP, True
    near = (np.abs(cen[:, 0] - DISH_LAMP[0]) < 0.3) & (np.abs(cen[:, 2] - DISH_LAMP[1]) < 0.3)
    if near.any():
        dish = np.linalg.norm(cen - np.array([DISH_LAMP[0], np.median(cen[near, 1]), DISH_LAMP[1]]), axis=1) < 0.38
        col[dish], glow[dish] = CYAN, True
    return np.clip(col * shade[:, None], 0, 1), glow


def close_bells(box, f, fn, col, glow):
    """
    The bells, closed: the model's are open tubes, the lower two notched where their lips meet, so the sky shows through
    them from astern. Each throat gets a burning disc across it, deep in the bell, and a dark plate stands behind the
    lower two.
    """
    verts, tris, cols, glows = [box], [], [], []
    n = len(box)

    def add(points, faces, c, g):
        nonlocal n
        verts.append(np.array(points))
        tris.append(np.array(faces) + n)
        cols.append(np.tile(c, (len(faces), 1)))
        glows.append(np.full(len(faces), g))
        n += len(points)

    seg = 28
    for (y, z), r in zip(THROATS, (1.05, 1.05, 0.95, 0.95)):
        ring = [(THROAT_X, y + r * np.cos(a), z + r * np.sin(a)) for a in np.linspace(0, 2 * np.pi, seg, endpoint=False)]
        add([(THROAT_X, y, z)] + ring, [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)], FIRE, True)
    x, (ya, yb), (za, zb) = BACKING
    add([(x, ya, za), (x, yb, za), (x, yb, zb), (x, ya, zb)], [(0, 1, 2), (0, 2, 3)], FRAME, False)
    box = np.concatenate(verts)
    f = np.concatenate([f] + tris)
    fn2 = np.cross(box[f[:, 1]] - box[f[:, 0]], box[f[:, 2]] - box[f[:, 0]])
    fn2 /= np.maximum(np.linalg.norm(fn2, axis=1, keepdims=True), 1e-12)
    return box, f, fn2, np.concatenate([col] + cols), np.concatenate([glow] + glows)


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
    col, glow = face_paint(bv, bf, fn)
    bv, bf, fn, col, glow = close_bells(bv, bf, fn, col, glow)
    os.makedirs(OUT, exist_ok=True)

    # Each triangle's corners with their own normals (shared where smooth), its colour, and its material: 8 painted
    # metal, lit; 9 glowing (the windows, the porthole, the lamps, the bells' throats).
    cn = creased_normals(bv, bf)
    mat = np.where(glow, 9, 8)
    q = 512
    pos = np.round(bv[bf].reshape(-1, 3) * q).astype(np.int16)
    nor = np.round(cn.reshape(-1, 3) * 127).astype(np.int8)
    m = np.repeat(mat, 3).astype(np.uint8)
    rgb = np.repeat(np.round(col * 255), 3, 0).astype(np.uint8)
    key = np.concatenate([pos.view(np.uint8).reshape(-1, 6), nor.view(np.uint8).reshape(-1, 3), m[:, None], rgb], 1)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    print(f'{len(uniq)} vertices')
    with open(os.path.join(OUT, 'CaptainShip.bytes'), 'wb') as o:
        o.write(b'BLCS')
        o.write(struct.pack('<iiif', 2, len(uniq), len(bf), q))
        o.write(uniq.astype(np.uint8).tobytes())
        o.write(inv.astype('<u4' if len(uniq) > 65535 else '<u2').tobytes())
    print('written', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    sys.exit(main())
