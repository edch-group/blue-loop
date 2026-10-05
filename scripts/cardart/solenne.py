"""Empress Solenne, rendered in full 3D: raymarched, lit by her own light.

She sits enthroned, waist up, before the golden sunburst of her throne. A great sun burns in the round window
behind it and breaks around her in shafts through the dust of a dark hall. Her head is a sphere of churning
plasma; her one great eye lies in a real socket, its iris fibred, its cornea catching the light. Her crown
is gold, her robes ivory under a crimson mantle trimmed in gold, and in her long sleeves she holds the orb
of judgement, which lights her from below. Halos of plasma circle her head, in front of her and behind.

World units: her head has radius 1; y is up; the camera looks along +z."""
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates
import paint as P
from paint import X, Y, W, H, K, hexc, smooth, fbm2, fbm3, noise3
from kit import col, mix
from cards_aureline import scene

CAM = np.array([0.0, 0.25, -11.0], np.float32)
TAN = 0.42
HEAD = np.array([0.0, 2.0, 0.0], np.float32)
ORB = np.array([0.0, -2.55, -1.75], np.float32)
SUNX, SUNY = 122, 20          # the window, in the picture
THRONE = np.array([0.0, 1.6, 3.2], np.float32)
SUN_DIR = np.array([0.55, 0.45, 1.0], np.float32); SUN_DIR /= np.linalg.norm(SUN_DIR)


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], np.float32)


def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], np.float32)


HEAD_R = rot_y(-0.16) @ rot_x(0.1)     # the head turned a little toward us, and bowed
GAZE = np.array([0.12, 0.08, -1.0], np.float32)   # (in the head's own frame: toward us, a little down)
GAZE /= np.linalg.norm(GAZE)


# ---------------------------------------------------------------------------------------- distance functions
def length(v):
    return np.sqrt((v * v).sum(-1))


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def round_cone(p, a, b, r1, r2):
    """iq's round cone between points a and b, radii r1 and r2."""
    ba = b - a; l2 = (ba * ba).sum(); rr = r1 - r2; a2 = l2 - rr * rr; il2 = 1.0 / l2
    pa = p - a
    y = (pa * ba).sum(-1); z = y - l2
    xv = pa * l2 - y[:, None] * ba
    x2 = (xv * xv).sum(-1); y2 = y * y * l2; z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    out = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
    out = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2, out)
    out = np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, out)
    return out


def ellipsoid(p, r):
    k0 = length(p / r); k1 = length(p / (r * r))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-6)


def torus(p, R, r):
    return np.hypot(np.hypot(p[:, 0], p[:, 2]) - R, p[:, 1]) - r


def rays_fan(q, n_sector, r0, long_, short, width, thick, limit=None):
    """A fan of tapering blades in the xy-plane, radiating from the origin (polar repetition: one blade's cost)."""
    ang = np.arctan2(q[:, 0], q[:, 1])
    k = np.round(ang / n_sector)
    if limit is not None:
        k = np.clip(k, -limit, limit)
    a = k * n_sector
    x = q[:, 0] * np.cos(a) - q[:, 1] * np.sin(a)
    y = q[:, 0] * np.sin(a) + q[:, 1] * np.cos(a)
    L = np.where(np.abs(k) % 2 == 0, long_, short)
    t = np.clip((y - r0) / L, 0, 1)
    w = width * (1 - t) + 0.01
    d2 = np.abs(x) - w
    dy = np.maximum(r0 - y, y - (r0 + L))
    d = np.maximum(np.maximum(d2 * 0.9, dy), np.abs(q[:, 2]) - thick * (1 - t * 0.6))
    return d


# Parts of the figure; each returns its distance. `parts` gives them all, for telling materials apart.
def parts(p):
    out = {}
    # The head, its eye socket, and the eyeball within.
    h = (p - HEAD) @ HEAD_R
    head = length(h) - 1.0
    sock = ellipsoid(h - np.array([0.0, 0.03, -0.93], np.float32), np.array([0.7, 0.38, 0.45], np.float32))
    out['head'] = smax(head, -sock, 0.08)
    out['eye'] = length(h - np.array([0.0, 0.03, -0.45], np.float32)) - 0.56
    # Neck of plasma, down into the collar.
    out['neck'] = round_cone(p, np.array([0, 1.25, 0.1], np.float32), np.array([0, 0.6, 0.15], np.float32), 0.34, 0.46)
    # The robe: a broad bell from the shoulders, folds running down it.
    a, b = np.array([0, 0.45, 0.25], np.float32), np.array([0, -5.5, 0.5], np.float32)
    body = round_cone(p, a, b, 1.35, 2.6)
    ang = np.arctan2(p[:, 0], -(p[:, 2] - 0.3))
    depth = smooth(0.2, -1.0, p[:, 1]) * (0.6 + 0.4 * smooth(-1, -5, p[:, 1]))
    folds = (0.07 * np.sin(ang * 11 + 1.8 * np.sin(p[:, 1] * 0.7)) + 0.035 * np.sin(ang * 23 - p[:, 1] * 0.9)
             + 0.05 * (noise3(p[:, 0] * 1.5, p[:, 1] * 0.4, p[:, 2] * 1.5, 5) - 0.5)) * depth
    out['robe'] = body + folds
    # Sleeves, long and wide, meeting in front where her hands hold the orb.
    sl = []
    for k in (-1, 1):
        sl.append(round_cone(p, np.array([k * 1.45, 0.15, 0.15], np.float32), np.array([k * 0.42, -2.8, -1.2], np.float32), 0.42, 0.68)
                  + 0.035 * np.sin(p[:, 1] * 9 + k))
    out['sleeve'] = np.minimum(sl[0], sl[1])
    # The mantle: crimson over the shoulders, open at the front.
    mant = round_cone(p, np.array([0, 0.95, 0.3], np.float32), np.array([0, -1.75, 0.45], np.float32), 1.25, 2.35)
    ma = np.arctan2(p[:, 0], p[:, 2])
    mant = mant + (0.06 * np.sin(ma * 9 + 0.6 * np.sin(p[:, 1] * 2)) + 0.03 * np.sin(ma * 21)) * smooth(0.6, -1.6, p[:, 1])
    wv = 0.32 + 0.3 * (0.95 - p[:, 1])
    opening = np.maximum(np.abs(p[:, 0]) - wv, p[:, 2] + 0.1)
    out['mantle'] = np.maximum(smax(mant, -opening, 0.05), -1.75 - p[:, 1])
    # A collar of gold at the throat, and a standing fan of gold lace behind the head.
    out['collar'] = torus((p - np.array([0, 0.82, 0.12], np.float32)) @ rot_x(-0.25), 0.58, 0.1)

    # The crown: a band round the head and a fan of gold rays above it.
    out['crown'] = np.minimum(torus((h - np.array([0, 0.66, 0.0], np.float32)) @ rot_x(0.3), 0.78, 0.08),
                              rays_fan((h - np.array([0, 0.0, -0.15], np.float32)) @ rot_x(0.12), 0.22, 0.98, 1.0, 0.6, 0.17, 0.07, limit=3))
    # Hands of plasma cradling it.
    out['hands'] = np.minimum(ellipsoid(p - np.array([-0.38, -2.85, -1.55], np.float32), np.array([0.32, 0.2, 0.3], np.float32)),
                              ellipsoid(p - np.array([0.38, -2.85, -1.55], np.float32), np.array([0.32, 0.2, 0.3], np.float32)))
    # The orb of judgement.
    out['orb'] = length(p - ORB) - 0.42
    # The throne's sunburst, behind her: a ring and a great fan of blades.
    t = p - THRONE
    out['throne'] = np.minimum(np.hypot(length(t[:, :2]) - 1.95, t[:, 2]) - 0.1,
                               rays_fan(t, 0.15, 2.05, 1.8, 1.15, 0.14, 0.07))
    return out


def sdf(p):
    o = parts(p)
    d = o['head']
    for k in ('eye', 'neck', 'robe', 'sleeve', 'mantle', 'collar', 'crown', 'hands', 'orb', 'throne'):
        d = np.minimum(d, o[k])
    return d


# ---------------------------------------------------------------------------------------- the march
def march(steps=140):
    sx = (X.ravel() - 80) / 50; sy = -(Y.ravel() - 50) / 50
    rd = np.stack([sx * TAN, sy * TAN, np.ones_like(sx)], 1).astype(np.float32)
    rd /= length(rd)[:, None]
    n = len(rd)
    t = np.full(n, 6.0, np.float32)   # start near the scene (nothing lies closer than z = -5)
    hit = np.zeros(n, bool); alive = np.ones(n, bool)
    for i in range(steps):
        idx = np.nonzero(alive)[0]
        if idx.size == 0: break
        p = CAM + rd[idx] * t[idx, None]
        d = sdf(p)
        h = d < 0.0015 * t[idx]
        hit[idx[h]] = True
        t[idx] += d * 0.9
        dead = h | (t[idx] > 22)
        alive[idx[dead]] = False
    return rd, t, hit


def normals(p):
    e = 0.0025
    n = np.zeros_like(p)
    for i in range(3):
        o = np.zeros(3, np.float32); o[i] = e
        n[:, i] = sdf(p + o) - sdf(p - o)
    return n / np.maximum(length(n), 1e-6)[:, None]


def occlusion(p, n):
    ao = np.zeros(len(p), np.float32)
    for i, h in enumerate((0.06, 0.15, 0.3, 0.5)):
        ao += (h - sdf(p + n * h)) * (0.7 ** i)
    return np.clip(1 - ao * 1.6, 0, 1)


def project(P3):
    v = P3 - CAM
    sx = v[..., 0] / (v[..., 2] * TAN); sy = v[..., 1] / (v[..., 2] * TAN)
    return 80 + sx * 50, 50 - sy * 50, length(v)


# ---------------------------------------------------------------------------------------- shading
def env(r):
    """What polished gold sees: the sun in the window behind, a warm glow of the hall, dark above."""
    sun = np.clip((r * SUN_DIR).sum(-1), 0, 1)
    warm = np.clip(0.5 + 0.5 * r[:, 1], 0, 1)
    return (hexc('#fff0c8') * (sun ** 60 * 14 + sun ** 6 * 1.6)[:, None]
            + hexc('#3a2410') * (0.4 + 0.6 * warm)[:, None]
            + hexc('#ffd98a') * (np.clip(-r[:, 1], 0, 1) ** 2 * 0.6)[:, None])


def soft_shadow(p, n, L, maxt, k=10.0, steps=28):
    """How much of a light reaches each point (1: all), marching toward it."""
    o = p + n * 0.02
    res = np.ones(len(p), np.float32); t = np.full(len(p), 0.04, np.float32)
    alive = np.ones(len(p), bool)
    for _ in range(steps):
        idx = np.nonzero(alive)[0]
        if idx.size == 0: break
        q = o[idx] + (L[idx] if L.ndim == 2 else L) * t[idx, None]
        d = sdf_shadow(q)
        res[idx] = np.minimum(res[idx], np.clip(k * d / t[idx], 0, 1))
        t[idx] += np.clip(d, 0.03, 0.4)
        alive[idx] = (res[idx] > 0.02) & (t[idx] < (maxt[idx] if np.ndim(maxt) else maxt))
    return res * res * (3 - 2 * res)


def sdf_shadow(p):
    """Everything that casts a shadow (the glowing head and orb make light, so they don't)."""
    o = parts(p)
    d = o['robe']
    for k in ('sleeve', 'mantle', 'collar', 'crown', 'throne', 'hands'):
        d = np.minimum(d, o[k])
    return d


def point_light(p, n, at, colour, power):
    L = at - p; d = length(L); L = L / d[:, None]
    return np.clip((n * L).sum(-1), 0, None)[:, None] * hexc(colour) * (power / (1 + d * d))[:, None], L


def shade(p, n, v, mat):
    rgb = np.zeros_like(p)
    ao = occlusion(p, n)
    ndv = np.clip((n * v).sum(-1), 0, 1)
    fres = (1 - ndv) ** 4
    head_l, Lh = point_light(p, n, HEAD, '#fff2d0', 5.0)
    orb_l, Lo = point_light(p, n, ORB, '#ffe6b0', 7.0)
    cloth = np.isin(mat, ['robe', 'sleeve', 'mantle', 'throne', 'fan', 'collar'])
    if cloth.any():
        ci = np.nonzero(cloth)[0]
        dh = length(HEAD - p[ci]) - 1.05; do = length(ORB - p[ci]) - 0.45
        head_l[ci] *= soft_shadow(p[ci], n[ci], Lh[ci], dh)[:, None]
        orb_l[ci] *= soft_shadow(p[ci], n[ci], Lo[ci], do)[:, None]
    # A warm key from the front left (the hall's braziers), and the window's light from behind and above.
    KEY = np.array([-0.55, 0.45, -0.7], np.float32); KEY /= np.linalg.norm(KEY)
    key_l = np.clip((n * KEY).sum(-1), 0, None)[:, None] * hexc('#ffb870') * 0.55
    head_l = head_l + key_l
    rim = np.clip((n * SUN_DIR).sum(-1), 0, None) ** 1.5
    # Cloth: ivory robe and sleeves, crimson mantle.
    for name, alb in (('robe', '#efe6d6'), ('sleeve', '#e9dfcc'), ('mantle', '#7a0f1a')):
        m = mat == name
        if not m.any(): continue
        a = hexc(alb)
        diff = head_l[m] + orb_l[m] + hexc('#1c2438') * 0.35
        sheen = (fres[m] * 0.6)[:, None] * (head_l[m] + orb_l[m] + hexc('#ffe0a0') * 0.3)
        if name == 'mantle':
            # Velvet: dark where it faces us, glowing where it turns away.
            sheen = (((1 - ndv[m]) ** 2) * 1.4)[:, None] * (head_l[m] + orb_l[m] + hexc('#ff6a50') * 0.15)
        c = a * diff * ao[m, None] + sheen + hexc('#ffcf80') * (rim[m] * 3.2 * (1 - ndv[m]) ** 1.2)[:, None]
        if name == 'robe':
            # A panel of gold embroidery down the front.
            band = smooth(0.24, 0.18, np.abs(p[m, 0])) * (p[m, 2] < 0)
            emb = 0.5 + 0.5 * np.sin(p[m, 1] * 14) * np.sin(p[m, 0] * 30)
            gold = hexc('#c89838') * (diff * 1.3 + 0.2) + hexc('#fff0c0') * (np.clip((n[m] * Lo[m]).sum(-1), 0, 1) ** 20 * 2)[:, None]
            c = c * (1 - band[:, None]) + gold * (band * (0.7 + 0.3 * emb))[:, None]
        if name == 'mantle':
            # Gold trim down the edges of the opening.
            wv = 0.32 + 0.3 * (0.95 - p[m, 1])
            trim = np.maximum(smooth(0.1, 0.03, np.abs(np.abs(p[m, 0]) - wv - 0.02)) * (p[m, 2] < 0.4), smooth(-1.6, -1.68, p[m, 1]))
            gold = hexc('#d4a040') * (diff * 1.4 + 0.25)
            c = c * (1 - trim[:, None]) + gold * trim[:, None]
        rgb[m] = c
    # Gold: the crown, collar, hem and the throne.
    for name in ('crown', 'collar', 'fan', 'throne'):
        m = mat == name
        if not m.any(): continue
        r = -(v[m] - 2 * (n[m] * v[m]).sum(-1)[:, None] * n[m])
        F = hexc('#ffcf70') + (1 - hexc('#ffcf70')) * fres[m, None]
        spec_h = np.clip((r * Lh[m]).sum(-1), 0, 1) ** 80 * 6
        spec_o = np.clip((r * Lo[m]).sum(-1), 0, 1) ** 80 * 5
        spec_o = spec_o + np.clip((r * KEY).sum(-1), 0, 1) ** 12 * 1.6 + 0.25
        tint = {'throne': 0.3, 'fan': 0.8, 'crown': 1.3}.get(name, 1.0)
        if name == 'fan':
            F = hexc('#f2e2c0') * 0.5 + 0.5 * F
        c = F * (env(r) + (spec_h + spec_o)[:, None] * hexc('#fff4dc')) * ao[m, None] * tint
        c += hexc('#ffcf70') * (head_l[m] + orb_l[m]) * 0.25
        rgb[m] = c
    # Plasma: the head and neck, churning, brightest where it faces us and at its limb.
    for name in ('head', 'neck', 'hands'):
        m = mat == name
        if not m.any(): continue
        q = (p[m] - HEAD) * 3.2
        g = fbm3(q[:, 0], q[:, 1], q[:, 2], 5, 7)
        cells = fbm3(q[:, 0] * 3, q[:, 1] * 3, q[:, 2] * 3, 3, 9)
        # Light, not matter: a white-gold glow, deepening to amber in slow swirls, brightest at the limb.
        heat = np.clip(0.62 + 0.8 * (g - 0.5) + 0.15 * (cells - 0.5), 0, 1)
        base = mix(mix('#e07a20', '#ffc860', heat[:, None]), '#fff6e0', smooth(0.5, 0.9, heat)[:, None])
        inner = ao[m] ** 1.2
        rgb[m] = base * (1.3 + 1.6 * heat[:, None]) * (0.45 + 0.55 * inner[:, None]) + hexc('#fff0c0') * (fres[m] * 3.0)[:, None]
    # The eye: white, a fibred amber iris, a slit pupil, a wet cornea.
    m = mat == 'eye'
    if m.any():
        ce = HEAD + HEAD_R @ np.array([0.0, 0.03, -0.45], np.float32)
        d = p[m] - ce; d /= length(d)[:, None]
        g = HEAD_R @ GAZE
        cosang = np.clip((d * g).sum(-1), -1, 1); th = np.arccos(cosang)
        right = np.cross(np.array([0, 1, 0], np.float32), g); right /= np.linalg.norm(right)
        up = np.cross(g, right)
        u, w = (d * right).sum(-1), (d * up).sum(-1)
        phi = np.arctan2(w, u)
        fib = fbm3(np.cos(phi) * 6, np.sin(phi) * 6, th * 30, 4, 11)
        iris = th < 0.48
        sclera = hexc('#f6efe4') * (0.9 + 0.1 * fib[:, None])
        irisc = mix('#5a2a04', '#ffb000', np.clip(fib * 1.2 + (0.48 - th) * 1.2, 0, 1)[:, None]) * 1.6
        irisc = irisc + hexc('#fff0b0') * (smooth(0.24, 0.1, th) * 1.0)[:, None]
        limbal = smooth(0.4, 0.48, th)
        irisc = irisc * (1 - 0.75 * limbal[:, None])
        pupil = (np.abs(u) < 0.05 + 0.02 * (1 - np.abs(w) / 0.3)) & (np.abs(w) < 0.3) & iris
        c = np.where(iris[:, None], irisc, sclera)
        c = np.where(pupil[:, None], hexc('#050302'), c)
        lit = 0.55 + 0.45 * ao[m]
        c = c * (lit * 1.3)[:, None]
        r = -(v[m] - 2 * (n[m] * v[m]).sum(-1)[:, None] * n[m])
        c += hexc('#ffffff') * (np.clip((r * Lo[m]).sum(-1), 0, 1) ** 300 * 30 + np.clip((r * SUN_DIR).sum(-1), 0, 1) ** 200 * 12 + fres[m] * 0.6)[:, None]
        rgb[m] = c
    m = mat == 'orb'
    if m.any():
        rgb[m] = hexc('#fff6e0') * (6 + 4 * fres[m, None])
    return rgb


# ---------------------------------------------------------------------------------------- the picture
def background(S):
    """A dark hall of carved stone: high up, a round window onto the sun; dust turning in its light."""
    S.cv.c = mix('#05070e', '#0c0a0c', np.clip(Y / 100, 0, 1)[..., None])
    sx, sy, sr = SUNX, SUNY, 13
    # The wall: dark stone in great carved courses, warmed toward the window.
    course = smooth(0.06, 0.0, np.abs(((Y / 9) % 1) - 0.5) - 0.44) + smooth(0.05, 0.0, np.abs((((X + (np.floor(Y / 9) % 2) * 7) / 14) % 1) - 0.5) - 0.46)
    stone = 0.8 + 0.25 * fbm2(X * 0.15, Y * 0.15, 5, 3)
    warmth = np.exp(-np.hypot(X - sx, Y - sy) / 45)
    S.cv.c = S.cv.c * stone[..., None] * (1 - 0.5 * np.clip(course, 0, 1))[..., None] * 1.4 + hexc('#3a2410') * (warmth * stone * 0.5)[..., None]
    # A great arch behind the throne, its inner edge catching the window's light.
    ad = np.hypot((X - 80) / 46, (Y - 44) / 56)
    arch = smooth(1.0, 0.97, ad) * (Y < 100)
    S.cv.c = S.cv.c * (1 - 0.55 * arch[..., None])
    P.sun(S.cv, sx, sy, sr, 41, hot=('#fffaf0', '#ffc860', '#ff7a20'), corona=0.6, streamers=1.0, intensity=1.2)
    d = np.hypot(X - sx, Y - sy)
    wall = smooth(sr + 3, sr + 4.5, d)
    frame = np.exp(-((d - (sr + 4)) / 0.9) ** 2)
    S.cv.c = S.cv.c * (1 - smooth(sr + 1.5, sr + 3, d) * (1 - wall))[..., None] + hexc('#2a1a0c') * ((1 - wall) * smooth(sr + 1.5, sr + 3, d))[..., None]
    S.add('#ffcf80', frame * 0.6)
    # Tracery: stone bars across the window, dark against the sun.
    th = np.arctan2(Y - sy, X - sx)
    bars = (smooth(0.5, 0.2, np.abs(((th / (2 * np.pi) * 8) % 1) - 0.5) * 2 * np.pi / 8 * d) * (d > sr * 0.35)
            + smooth(0.6, 0.3, np.abs(d - sr * 0.35)) + smooth(0.5, 0.25, np.abs(d - sr * 0.72)))
    bars = np.clip(bars, 0, 1) * (d < sr + 2)
    S.cv.c = S.cv.c * (1 - bars[..., None] * 0.92) + hexc('#3a2410') * (bars * 0.3)[..., None]
    dust = fbm2(X * 0.05, Y * 0.08, 5, 13) * fbm2(X * 0.4, Y * 0.4, 3, 17)
    S.add('#ffc070', dust * np.exp(-np.hypot(X - sx, Y - sy) / 60) * 0.35)


def god_rays(img, mask, cx, cy, n=48, decay=0.965, strength=0.035):
    """Light streaming out from (cx, cy) past whatever blocks it (screen-space radial blur)."""
    src = img * (1 - mask[..., None])
    src = np.clip(src - 1.5, 0, None)
    acc = np.zeros_like(src); w = 1.0
    px, py = cx * K, cy * K
    for i in range(n):
        s = 1 - i * 0.012
        coords = [py + (P.yy - py) * s, px + (P.xx - px) * s]
        acc += np.stack([map_coordinates(src[..., c], coords, order=1, mode='constant') for c in range(3)], -1) * w
        w *= decay
    return acc * strength


def halos(S, depth, hitmask):
    """Two plasma halos round her head, hidden where she stands in front of them."""
    for R, tilt, roll, c, wdt in ((1.75, 0.35, -0.25, '#fff3c4', 0.55), (2.2, -0.25, 0.4, '#8fd0ff', 0.4)):
        ts = np.linspace(0, 2 * np.pi, 400)
        ring = np.stack([np.cos(ts) * R, np.zeros_like(ts), np.sin(ts) * R], 1).astype(np.float32)
        ring = ring @ rot_x(tilt).T
        cz, sz = np.cos(roll), np.sin(roll)
        ring = ring @ np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], np.float32).T + HEAD
        px, py, dist = project(ring)
        ix = np.clip((px * K).astype(int), 0, W - 1); iy = np.clip((py * K).astype(int), 0, H - 1)
        vis = ~hitmask[iy, ix] | (depth[iy, ix] > dist - 0.05)
        idx = np.nonzero(vis)[0]
        for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
            if len(run) < 2: continue
            near = ring[run, 2].mean() < HEAD[2]
            S.plasma(list(zip(px[run], py[run])), wdt, c, 1.2 if near else 0.7, core='#ffffff')


@scene('empress_solenne', space=False)
def _(S):
    background(S)
    rd, t, hit = march()
    hitmask = hit.reshape(H, W)
    depth = np.where(hit, t, 1e9).reshape(H, W)
    p = CAM + rd[hit] * t[hit, None]
    n = normals(p)
    o = parts(p)
    names = list(o)
    mat = np.array(names)[np.argmin(np.stack([o[k] for k in names]), 0)]
    rgb = shade(p, n, -rd[hit], mat)
    fig = np.zeros((H * W, 3), np.float32); fig[hit] = rgb
    fig = fig.reshape(H, W, 3)
    m = hitmask.astype(np.float32)
    S.cv.c = S.cv.c * (1 - m[..., None]) + fig * m[..., None]
    # Light round her: the sun's shafts breaking past her and the throne, and her own glow.
    S.cv.c += god_rays(S.cv.c, m, SUNX, SUNY, strength=0.03)
    hx, hy, _ = project(HEAD)
    S.glow(float(hx), float(hy), 16, '#ffd890', 0.35)
    ox, oy, _ = project(ORB)
    S.glow(float(ox), float(oy), 9, '#fff0c8', 0.8)
    halos(S, depth, hitmask)
    # Gems in the crown's band.
    for a, c in ((-0.6, '#ff4a3a'), (0.0, '#8fd0ff'), (0.6, '#ff4a3a')):
        g = HEAD + HEAD_R @ np.array([np.sin(a) * 0.8, 0.62 + 0.05, -np.cos(a) * 0.8 * 0.98], np.float32)
        gx, gy, gd = project(g)
        ix, iy = int(gx * K), int(gy * K)
        if not hitmask[iy, ix] or depth[iy, ix] > gd - 0.1:
            S.add(c, 3.0 * np.exp(-((X - gx) ** 2 + (Y - gy) ** 2) / 0.35))
            S.add('#ffffff', 3.0 * np.exp(-((X - gx) ** 2 + (Y - gy) ** 2) / 0.08))
    S.motes(80, 55, 26, 70, '#ffd9a0', 0.7)


_.finish = dict(exposure=0.85, bloom_amt=0.55, vignette=0.45, grain=0.015)
