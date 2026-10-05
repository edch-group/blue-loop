"""An Aureline: one great eye in a sphere of light, tilted plasma halos, a cloak of flame that trails away.
The same figure (and options) as aureline() in src/ui/cardart.ts, painted with light."""
import numpy as np
from scipy.ndimage import gaussian_filter
from kit import X, Y, col, mix, quad, cubic, poly_mask, smooth, fbm2, fbm3, noise2, LIGHT, lambert, specular, roi, seg_field


def aureline(S, x, y, s, item=None, halos=2, cloak=None, eye='#2a6fd0', crown=False, lean=0, garb='robe', sash=None):
    cloak = cloak or S.p['glow']
    lean = lean * s
    hr = 7.5 * s
    S.glow(x, y + hr * 1.5, hr * 5, cloak, 0.22)

    # ---- The cloak: a teardrop of plasma, from the shoulders to a wisping tail.
    left = cubic((x - hr * 1.5, y + hr * 0.6), (x - hr * 2.4, y + hr * 3), (x - hr * 0.8 + lean, y + hr * 4.6), (x + lean * 1.6, y + hr * 6))
    right = cubic((x + lean * 1.6, y + hr * 6), (x + hr * 0.9 + lean, y + hr * 4.4), (x + hr * 2.4, y + hr * 3), (x + hr * 1.5, y + hr * 0.6))
    top = quad((x + hr * 1.5, y + hr * 0.6), (x, y - hr * 0.2), (x - hr * 1.5, y + hr * 0.6))
    m = poly_mask(left + right + top, blur=0.35 * s)
    v = np.clip((Y - (y + hr * 0.4)) / (hr * 5.6), 0, 1)
    # Flames run down its length; the edges break up into tongues, and the tail into wisps.
    cxl = x + lean * 1.6 * v
    u = (X - cxl) / (hr * 2.2)
    flow = fbm2(u * 2.2 + fbm2(X * 0.12, Y * 0.12, 2, S.seed % 7) * 1.4, Y * 0.05 / s - v * 2, 5, S.seed % 11)
    streak = fbm2(u * 5 + flow * 2, Y * 0.03 / s, 3, S.seed % 13)
    eaten = smooth(0.1 + v * 0.5, 0.5 + v * 0.45, flow * 0.8 + streak * 0.2 + (1 - v) * 0.3)
    body = m * eaten
    S.absorb(body * 0.55 * (1 - v), tint=(0.7, 0.85, 1.2))
    heat = (1 - v) ** 1.3
    S.add('#fff6dc', body * heat ** 2 * (0.2 + 0.6 * flow) * 0.6)
    S.add(mix(cloak, '#ff9a30', 0.35), body * (0.3 + 0.7 * heat) * (0.4 + 1.1 * streak) * 0.75)
    S.add(cloak, gaussian_filter(body, 3 * s * 6) * 0.2)
    # A bright seam down the front.
    S.plasma(quad((x - hr * 0.6, y + hr * 1.2), (x + lean * 0.5, y + hr * 3.2), (x + lean * 1.4, y + hr * 5.2)), 0.25 * s, '#fff6dc', 0.6, taper=0.8)

    # ---- What they wear over the plasma.
    if garb == 'armour':
        for k in (-1, 1):
            pts = quad((x + k * hr * 0.9, y + hr * 1.05), (x + k * hr * 1.9, y + hr * 0.6), (x + k * hr * 2.05, y + hr * 1.75)) + quad((x + k * hr * 2.05, y + hr * 1.75), (x + k * hr * 1.4, y + hr * 1.5), (x + k * hr * 0.9, y + hr * 1.05))
            S.gold(pts, bevel=0.7 * s)
        for i in range(3):
            w = hr * (1.3 - i * 0.15)
            yy = y + hr * (1.4 + i * 0.75)
            pts = [(x - w, yy), (x, yy + hr * 0.6), (x + w, yy)]
            S.tube(pts, 0.6 * s, '#5a3a0e', '#ffe7a8', shine=1.2, power=22)
    elif garb == 'vestment':
        robe = [(x - hr * 1.2, y + hr * 0.9), (x - hr * 2.1, y + hr * 5.4)] + quad((x - hr * 2.1, y + hr * 5.4), (x, y + hr * 6), (x + hr * 2.1, y + hr * 5.4)) + [(x + hr * 1.2, y + hr * 0.9)] + quad((x + hr * 1.2, y + hr * 0.9), (x, y + hr * 0.3), (x - hr * 1.2, y + hr * 0.9))
        S.cloth(robe, '#fffaf0', '#c8b48e', folds=5, bevel=1.2 * s, alpha=0.97, fan=(x, y - hr * 2))
        S.tube(quad((x - hr * 2.05, y + hr * 5.3), (x, y + hr * 5.9), (x + hr * 2.05, y + hr * 5.3)), 0.7 * s, '#7a5214', '#ffe08a', shine=1.2)
        st = sash or '#c0392b'
        for k in (-1, 1):
            strip = [(x + k * hr * 0.2, y + hr * 1.0), (x + k * hr * 0.5, y + hr * 1.0), (x + k * hr * 0.68, y + hr * 5.6), (x + k * hr * 0.32, y + hr * 5.65)]
            S.cloth(strip, st, mix(st, '#000000', 0.45), folds=2, fold_dir=(0, 1), bevel=0.4 * s)
        S.sun(x, y + hr * 2.6, 1.3 * s, '#ffd98a', rays=6)
    if sash and garb != 'vestment':
        S.tube(quad((x - hr * 1.5, y + hr * 1.3), (x, y + hr * 3.2), (x + hr * 1.7, y + hr * 2.4)), 1.1 * s, mix(sash, '#000000', 0.55), sash, shine=0.35, power=12)

    # ---- Arms of plasma, reaching to where the item is held.
    hand = (x + hr * 2.4, y + hr * 1.6)
    if item and item != 'none':
        S.plasma(quad((x + hr * 1.2, y + hr * 1.0), (x + hr * 2.2, y + hr * 0.8), hand), 0.75 * s, cloak, 0.9, taper=0.3)
        S.plasma(quad((x - hr * 1.2, y + hr * 1.0), (x - hr * 2.1, y + hr * 1.6), (x - hr * 1.6, y + hr * 2.6)), 0.7 * s, cloak, 0.7, taper=0.5)

    # ---- Halos: rings of plasma tilted round the head, the far side behind it, the near side in front.
    tilts = [-18, 22, -62]
    rings = []
    for i in range(halos):
        rx, ry = hr * (1.9 + i * 0.35), hr * (0.62 + i * 0.1)
        c = S.p['accent'] if i % 2 else '#fff3c4'
        a = np.radians(tilts[i])
        ts = np.linspace(0, 2 * np.pi, 120)
        px = x + rx * np.cos(ts) * np.cos(a) - ry * np.sin(ts) * np.sin(a)
        py = y + rx * np.cos(ts) * np.sin(a) + ry * np.sin(ts) * np.cos(a)
        rings.append((px, py, np.sin(ts), c))
    def draw_ring(px, py, z, c, front):
        keep = z >= 0 if front else z < 0
        idx = np.nonzero(keep)[0]
        if len(idx) < 2: return
        # Split at the wrap-around so each half is one continuous run.
        runs = np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1)
        for run in runs:
            if len(run) < 2: continue
            pts = list(zip(px[run], py[run]))
            S.plasma(pts, 0.55 * s * (1.25 if front else 0.9), c, 1.1 if front else 0.6, core='#ffffff')
    for px, py, z, c in rings: draw_ring(px, py, z, c, False)

    # ---- The head: a sphere of light, plasma churning on its surface.
    dx, dy = (X - x) / hr, (Y - y) / hr
    d = np.hypot(dx, dy)
    nz = np.sqrt(np.clip(1 - d * d, 0, 1))
    m = smooth(1.0, 0.96, d)
    churn = fbm3(dx * 3 + S.seed % 5, dy * 3, nz * 3, 4, S.seed % 17)
    core = smooth(1.0, 0.0, d)
    headc = mix(mix(cloak, '#c87a20', 0.25), '#fff1c8', core[..., None] ** 0.8) * (0.55 + 0.7 * core[..., None] + 0.6 * churn[..., None])
    S.over(headc, m)
    S.add(cloak, m * (1 - nz) ** 3 * 1.0)
    S.glow(x, y, hr * 2.2, cloak, 0.25)

    # ---- The eye: an almond of white, a fibrous iris with a slit pupil, wet glints.
    ex = x + hr * 0.04
    ax, ah = hr * 0.8, hr * 0.37
    ux = (X - x) / ax
    half = ah * np.clip(1 - ux * ux, 0, 1)
    edge = half - np.abs(Y - y)
    almond = smooth(-0.12 * s, 0.12 * s, edge) * (np.abs(ux) < 1)
    inner = np.clip(edge / np.maximum(half, 1e-3), 0, 1)
    sclera = mix('#9aa6c0', '#fbf8f2', smooth(0, 0.7, inner)[..., None])
    S.over(sclera * 0.85, almond)
    ir = hr * 0.42
    rr = np.hypot(X - ex, Y - y) / ir
    th = np.arctan2(Y - y, X - ex)
    fib = fbm2(th * 9, rr * 3, 3, S.seed % 19)
    ec = col(eye)
    iris = ec * (0.5 + 1.4 * fib[..., None]) * (1 - 0.6 * smooth(0.75, 1.0, rr)[..., None])
    iris = iris + col('#ffe7a0') * (smooth(0.55, 0.2, rr) * 0.9)[..., None]
    lid_shadow = smooth(0.0, 0.5, (Y - (y - half)) / np.maximum(2 * half, 1e-3))
    S.over(iris * (0.55 + 0.6 * lid_shadow[..., None]) * 1.2, smooth(1.0, 0.94, rr) * almond)
    pupil = np.hypot((X - ex) / (hr * 0.1), (Y - y) / (hr * 0.3))
    S.over(col(S.p['deep']) * 0.1, smooth(1.0, 0.8, pupil) * almond)
    S.add('#ffffff', almond * 4 * np.exp(-(((X - (x - hr * 0.14)) / (hr * 0.09)) ** 2 + ((Y - (y - hr * 0.15)) / (hr * 0.07)) ** 2)))
    S.add('#ffffff', almond * 1.5 * np.exp(-(((X - (x + hr * 0.2)) / (hr * 0.04)) ** 2 + ((Y - (y + hr * 0.12)) / (hr * 0.04)) ** 2)))
    # The lids: a lit rim round the almond.
    S.add('#fff3c4', np.exp(-(edge / (0.12 * s)) ** 2) * (np.abs(ux) < 1.02) * 0.9)

    for px, py, z, c in rings: draw_ring(px, py, z, c, True)

    if crown:
        S.glow(x, y - hr * 1.6, hr * 2, '#fff3c4', 0.6)
        for i in range(-4, 5):
            a = -np.pi / 2 + i * 0.2
            r1, r2 = hr * 1.15, hr * (2.2 + (0 if i % 2 else 0.55) - abs(i) * 0.08)
            w = 0.09
            S.gold([(x + np.cos(a - w) * r1, y + np.sin(a - w) * r1), (x + np.cos(a) * r2, y + np.sin(a) * r2), (x + np.cos(a + w) * r1, y + np.sin(a + w) * r1)], bevel=0.35 * s)
            S.add('#fff6e0', 1.5 * np.exp(-np.hypot(X - (x + np.cos(a) * r2), Y - (y + np.sin(a) * r2)) ** 2 / (0.6 * s) ** 2))

    # ---- What they hold.
    if item == 'lance':
        bx, by = hand[0] - hr * 2.2, hand[1] + hr * 1.8
        tx, ty = hand[0] + hr * 4.4, hand[1] - hr * 3
        S.tube([(bx, by), (tx, ty)], 0.75 * s, '#5a3a0e', '#ffe7a8', shine=1.4, power=24)
        ang = np.arctan2(ty - by, tx - bx)
        L, Wd = hr * 1.6, hr * 0.45
        px_, py_ = np.cos(ang), np.sin(ang); nx_, ny_ = -py_, px_
        S.glow(tx + px_ * L * 0.5, ty + py_ * L * 0.5, hr * 1.4, '#fff3c4', 0.7)
        blade = [(tx - nx_ * Wd, ty - ny_ * Wd), (tx + px_ * L, ty + py_ * L), (tx + nx_ * Wd, ty + ny_ * Wd), (tx - px_ * Wd * 0.8, ty - py_ * Wd * 0.8)]
        S.energy(blade, '#ffe7a8', 1.2, rim=1.4, fill=1.2, bevel=0.6 * s)
        S.beam(tx + px_ * L, ty + py_ * L, tx + px_ * L * 3.4, ty + py_ * L * 3.4, 0.9 * s, '#fff3c4')
    elif item == 'shield':
        S.shield_disc(hand[0] + hr * 0.6, hand[1], hr * 1.7, S.p['accent'])
    elif item == 'staff':
        S.tube([(hand[0] - hr * 0.4, hand[1] + hr * 3.4), (hand[0] + hr * 0.5, hand[1] - hr * 3)], 0.7 * s, '#6a4a1a', '#f3d99a', shine=1.2)
        S.sun(hand[0] + hr * 0.55, hand[1] - hr * 3.4, 2.6 * s, S.p['glow'], rays=8)
    elif item == 'banner':
        px_, top_ = hand[0] + hr * 0.3, hand[1] - hr * 4
        S.tube([(px_, hand[1] + hr * 3), (px_, top_)], 0.6 * s, '#6a4a1a', '#f3d99a', shine=1.2)
        flag = quad((px_, top_), (px_ + hr * 2, top_ - hr * 0.4), (px_ + hr * 4, top_ + hr * 0.3)) + [(px_ + hr * 3.4, top_ + hr * 1.3), (px_ + hr * 4, top_ + hr * 2.4)] + quad((px_ + hr * 4, top_ + hr * 2.4), (px_ + hr * 2, top_ + hr * 1.7), (px_, top_ + hr * 2.2))
        S.cloth(flag, '#2f5fb8', '#6f9fe8', folds=3, bevel=0.6 * s, grad=(0, 0, 1, 0))
        S.plasma(flag + [flag[0]], 0.2 * s, '#fff3c4', 0.45, core=None, flicker=False)
        S.sun(px_ + hr * 1.8, top_ + hr * 1.05, 1.5 * s, '#ffd98a', rays=6)
        S.add('#ffffff', 2 * np.exp(-np.hypot(X - px_, Y - top_) ** 2 / (0.8 * s) ** 2))
    elif item == 'orb':
        S.sun(hand[0], hand[1] - hr * 0.4, 2.8 * s, S.p['glow'], rays=10)
