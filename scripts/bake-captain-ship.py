"""
The Captain's ship for Unity, baked from its model as Meshy textured it (unity/ModelSources/captain-ship/meshy-<task>/:
model.glb and its textures, fetched by scripts/meshy/fetch.py), placed as its untextured export
(iron-horizon.fbx) lies, so everything measured on that (the deck, the rails, the bells, where the crew stand) holds:

  unity/Assets/Resources/Models/CaptainShip.bytes       the hull, cut down to a size the map can fly (its texture's seams
                                                        kept), in the ship's box units: each corner's place in the texture,
                                                        or, glowing, its colour
  unity/Assets/Resources/Models/CaptainShipColour.png   its colour (rgb), and where it glows (a): its lit windows, the
                                                        porthole, its lamps, the bells' throats

Its four bells are open tubes in the model, the lower two notched where their lips meet, so the sky showed through them
from astern: each throat gets a burning disc, and a dark plate stands behind the lower two (CaptainShip.cs, Ship.shader).

    pip install numpy pillow trimesh pymeshlab scipy
    python3 scripts/bake-captain-ship.py
"""
import glob
import os
import struct
import sys
import zlib

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'unity', 'ModelSources', 'captain-ship')
OUT = os.path.join(ROOT, 'unity', 'Assets', 'Resources', 'Models')

# How many triangles the hull keeps (the model has 417k: far too many for a phone's browser, and the map flies it small).
TRIANGLES = 60000
# Its texture's size in the game (Meshy's is 4096: a quarter of the memory, and the ship is never seen that close).
TEXTURE = 2048
# Box units (CaptainShip.cs: 40 to the model's 1, x along, y across, z up): as long as the old hull, nose to bells, its
# middle where the old one's was, so the Captain, the crew and the cameras keep their places.
LENGTH, NOSE, MID_Z = 43.1, 40.5, 7.3
# The engine block's four bells, their mouths' centres (box units: across, up), as CaptainShip.cs has them; where each
# throat's burning disc closes it (along), how wide; and the dark plate behind the lower two (along; across; up).
BELLS = ((9.96, 5.3), (14.08, 5.3), (10.9, 3.1), (13.2, 3.1))
THROAT_X, THROAT_R = -1.5, (1.05, 1.05, 0.95, 0.95)
BACKING = (-0.9, (10.3, 13.8), (2.2, 3.6))
# Windows Meshy lit where the model has none: its four lights along each side of the bridge sit off the model's three
# window frames there. Its lights in that band (box units: along, up) are painted out with the plating round them, and
# one lit inside each frame (along, up; width, height).
WINDOW_BANDS = (((13.3, 18.3), (8.55, 9.4)),)
WINDOWS = (((14.04, 8.95), (0.5, 0.24)), ((15.75, 8.95), (0.5, 0.24)), ((17.43, 8.95), (0.5, 0.24)))
FIRE = (1.0, 0.5, 0.12)
DARK = (0.13, 0.14, 0.16)
# Corners sharper than this (degrees) keep their own normals.
CREASE = 42


# ---- FBX (binary): the untextured export, for where the ship lies ----

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


# ---- The textured model ----

def load_glb(folder):
    """The model as Meshy textured it: its corners, triangles, each corner's place in the texture, and its textures."""
    import trimesh
    scene = trimesh.load(os.path.join(folder, 'model.glb'))
    geo = list(scene.geometry.values()) if hasattr(scene, 'geometry') else [scene]
    assert len(geo) == 1, 'one mesh expected'
    g = geo[0]
    return np.asarray(g.vertices, float), np.asarray(g.faces, np.int32), np.asarray(g.visual.uv, float)


def placed(glb, fbx):
    """
    The textured model's corners where the untextured export's lie (its file's axes): glTF stands y up, the FBX z up,
    and Meshy scaled it to 2 long; set over the FBX's corners, then nudged until each lies on them.
    """
    from scipy.spatial import cKDTree
    q = glb[:, [0, 2, 1]] * np.array([1, -1, 1])
    q *= (fbx[:, 0].max() - fbx[:, 0].min()) / (q[:, 0].max() - q[:, 0].min())
    q += fbx.mean(0) - q.mean(0)
    tree = cKDTree(fbx[::3])
    for _ in range(6):
        _, i = tree.query(q[::5])
        q += (fbx[::3][i] - q[::5]).mean(0)
    d, _ = tree.query(q[::5])
    print(f'textured model set on the export: median {np.median(d) / (fbx[:, 0].max() - fbx[:, 0].min()) * 100:.2f}% of its length off')
    return q


def to_box(v, ref):
    """The file's axes to the ship's box units (x along, nose forward; y across, 12 the middle; z up), as ref lies."""
    k = LENGTH / (ref[:, 0].max() - ref[:, 0].min())
    return np.stack([NOSE - (v[:, 0] - ref[:, 0].min()) * k, v[:, 1] * k + 12, v[:, 2] * k + MID_Z], 1)


def cut_down(v, f, uv):
    """The hull cut to TRIANGLES, its texture's seams kept: its corners, triangles, and each triangle's corners' places in the texture."""
    import pymeshlab
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(vertex_matrix=v, face_matrix=f, v_tex_coords_matrix=uv))
    ms.compute_texcoord_transfer_vertex_to_wedge()
    ms.meshing_merge_close_vertices(threshold=pymeshlab.PercentageValue(0.001))
    ms.meshing_decimation_quadric_edge_collapse_with_texture(targetfacenum=TRIANGLES, qualitythr=0.5, extratcoordw=1.0, preserveboundary=True,
                                                             boundaryweight=1.0, optimalplacement=True, preservenormal=True, planarquadric=True)
    m = ms.current_mesh()
    return m.vertex_matrix(), m.face_matrix(), m.wedge_tex_coord_matrix().reshape(-1, 3, 2)


def texels(box, f, wuv, faces, size):
    """Where on the hull each texel of the texture lies (box units), for the given faces: its place, or nan."""
    at = np.full((size, size, 3), np.nan)
    for t in faces:
        uv = wuv[t] * [size, size]
        uv[:, 1] = size - uv[:, 1]
        lo, hi = np.floor(uv.min(0)).astype(int), np.ceil(uv.max(0)).astype(int)
        xs, ys = np.arange(max(lo[0], 0), min(hi[0] + 1, size)), np.arange(max(lo[1], 0), min(hi[1] + 1, size))
        if len(xs) == 0 or len(ys) == 0: continue
        gx, gy = np.meshgrid(xs + 0.5, ys + 0.5)
        (ax, ay), (bx, by), (cx, cy) = uv
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12: continue
        w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
        w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
        inside = (w0 >= -0.01) & (w1 >= -0.01) & (1 - w0 - w1 >= -0.01)
        p = w0[..., None] * box[f[t, 0]] + w1[..., None] * box[f[t, 1]] + (1 - w0 - w1)[..., None] * box[f[t, 2]]
        at[(gy[inside] - 0.5).astype(int), (gx[inside] - 0.5).astype(int)] = p[inside]
    return at


def colour(folder, box, f, wuv):
    """
    Its colour at TEXTURE square, and where it glows in alpha: what Meshy painted lit (near white, or a hot amber); the
    bridge's windows repainted inside the model's own frames (WINDOW_BANDS).
    """
    art = Image.open(os.path.join(folder, 'texture-base_color.png')).convert('RGB')
    c = np.asarray(art).astype(float) / 255
    cen = box[f].mean(1)
    for (x0, x1), (z0, z1) in WINDOW_BANDS:
        near = np.nonzero((cen[:, 0] > x0 - 0.5) & (cen[:, 0] < x1 + 0.5) & (cen[:, 2] > z0 - 0.3) & (cen[:, 2] < z1 + 0.3) & (np.abs(cen[:, 1] - 12) > 1))[0]
        at = texels(box, f, wuv, near, c.shape[0])
        band = ~np.isnan(at[..., 0]) & (at[..., 0] > x0) & (at[..., 0] < x1) & (at[..., 2] > z0) & (at[..., 2] < z1)
        lit = band & (c.min(2) > 0.6)
        light = c[lit].mean(0)
        plating = band & (c.max(2) < 0.7)
        ref = np.median(c[plating], 0)
        # (Meshy's lights out, and the halos round them.)
        c[band & ((np.abs(c @ np.array([0.3, 0.59, 0.11]) - ref @ np.array([0.3, 0.59, 0.11])) > 0.08) | (c[..., 0] - c[..., 2] > 0.12))] = ref
        # One lit inside each of the model's frames, its corners rounded.
        for (wx, wz), (ww, wh) in WINDOWS:
            u = np.abs(at[..., 0] - wx) / (ww / 2)
            w = np.abs(at[..., 2] - wz) / (wh / 2)
            inside = band & (u ** 4 + w ** 4 < 1)
            c[inside] = light
        print(f'windows repainted along {x0}..{x1}: {lit.sum()} lit texels out, {len(WINDOWS)} lit in the frames')
    art = Image.fromarray((c * 255 + 0.5).astype(np.uint8))
    hi, lo = c.max(2), c.min(2)
    lit = np.clip((lo - 0.62) / 0.2, 0, 1) * np.clip((hi - 0.85) / 0.1, 0, 1)
    warm = np.clip((c[..., 0] - 0.9) / 0.07, 0, 1) * np.clip((c[..., 1] - 0.62) / 0.15, 0, 1) * np.clip((c[..., 0] - c[..., 2] - 0.3) / 0.2, 0, 1)
    glow = Image.fromarray((np.maximum(lit, warm) * 255).astype(np.uint8))
    out = art.resize((TEXTURE, TEXTURE), Image.LANCZOS)
    out.putalpha(glow.resize((TEXTURE, TEXTURE), Image.LANCZOS))
    return out


def close_bells(box, f, uv):
    """The bells closed: a burning disc deep in each throat, a dark plate behind the lower two. Their triangles, and their colour."""
    verts, tris, cols = [box], [f], []
    n = len(box)

    def add(points, faces, c):
        nonlocal n
        verts.append(np.array(points))
        tris.append(np.array(faces) + n)
        cols.append(np.tile(c, (len(faces), 1)))
        n += len(points)

    seg = 28
    for (y, z), r in zip(BELLS, THROAT_R):
        ring = [(THROAT_X, y + r * np.cos(a), z + r * np.sin(a)) for a in np.linspace(0, 2 * np.pi, seg, endpoint=False)]
        add([(THROAT_X, y, z)] + ring, [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)], FIRE)
    x, (ya, yb), (za, zb) = BACKING
    add([(x, ya, za), (x, yb, za), (x, yb, zb), (x, ya, zb)], [(0, 1, 2), (0, 2, 3)], DARK)
    added = sum(len(t) for t in tris[1:])
    glow = np.r_[np.zeros(len(f), bool), np.ones(added - 2, bool), np.zeros(2, bool)]
    col = np.concatenate([np.zeros((len(f), 3))] + cols)
    return np.concatenate(verts), np.concatenate(tris), np.concatenate([uv, np.zeros((added, 3, 2))]), col, glow


def main():
    folder = max(glob.glob(os.path.join(SRC, 'meshy-*')), key=os.path.getmtime)
    fbx, _ = load_fbx(os.path.join(SRC, 'iron-horizon.fbx'))
    v, f, uv = load_glb(folder)
    print(f'model ({os.path.basename(folder)}): {len(v)} corners, {len(f)} triangles')
    v = to_box(placed(v, fbx), fbx)
    bv, bf, wuv = cut_down(v, f, uv)
    print(f'cut down to {len(bv)} corners, {len(bf)} triangles')
    os.makedirs(OUT, exist_ok=True)
    colour(folder, bv, bf, wuv).save(os.path.join(OUT, 'CaptainShipColour.png'), optimize=True)
    bv, bf, wuv, col, glow = close_bells(bv, bf, wuv)
    # (The bells' throats, painted pale by Meshy, burning: what lies deep in each, facing astern.)
    cen, fn = bv[bf].mean(1), np.cross(bv[bf[:, 1]] - bv[bf[:, 0]], bv[bf[:, 2]] - bv[bf[:, 0]])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    for (y, z), r in zip(BELLS, THROAT_R):
        # (Facing along the ship either way: Meshy's winding comes out turned with its axes.)
        throat = (cen[:, 0] < -0.5) & (cen[:, 0] > -2.0) & (np.hypot(cen[:, 1] - y, cen[:, 2] - z) < r + 0.35) & (np.abs(fn[:, 0]) > 0.5)
        col[throat], glow[throat] = FIRE, True

    # Each triangle's corners: their place, their normal (shared where smooth), and either their place in the texture
    # (painted metal, 8) or, for the bells' discs and plate, their own colour (9 glowing, 10 plain).
    cn = creased_normals(bv, bf)
    mat = np.where(glow, 9, np.where(np.any(col > 0, 1), 10, 8))
    q = 512
    pos = np.round(bv[bf].reshape(-1, 3) * q).astype(np.int16)
    nor = np.round(cn.reshape(-1, 3) * 127).astype(np.int8)
    m = np.repeat(mat, 3).astype(np.uint8)
    rgb = np.repeat(np.round(col * 255), 3, 0).astype(np.uint8)
    tex = np.round(np.clip(wuv.reshape(-1, 2), 0, 1) * 65535).astype('<u2')
    key = np.concatenate([pos.view(np.uint8).reshape(-1, 6), nor.view(np.uint8).reshape(-1, 3), m[:, None], rgb, tex.view(np.uint8).reshape(-1, 4)], 1)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    print(f'{len(uniq)} vertices')
    with open(os.path.join(OUT, 'CaptainShip.bytes'), 'wb') as o:
        o.write(b'BLCS')
        o.write(struct.pack('<iiif', 3, len(uniq), len(bf), q))
        o.write(uniq.astype(np.uint8).tobytes())
        o.write(inv.astype('<u4' if len(uniq) > 65535 else '<u2').tobytes())
    print('written', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    sys.exit(main())
