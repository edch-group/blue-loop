"""An Aureline: one great eye in a sphere of light, tilted plasma halos, a cloak of flame that trails away.

No two are alike. Each figure is an individual: its build, the turn of its head, the shape of its eye and
pupil, its markings, its corona of flares, its halos, the cut of its cloak, its armour or robes and how it
holds what it carries all come from its own traits, drawn from the card (and the figure's place on it).
A scene can still set any trait outright (`look=dict(...)`), and the card's own options (garb, item, crown,
colours) are kept, as in aureline() in src/ui/cardart.ts."""
import hashlib
import numpy as np
from scipy.ndimage import gaussian_filter
from kit import X, Y, col, mix, quad, cubic, poly_mask, smooth, fbm2, fbm3, rotate_pts


def traits(S, key, force=None):
    g = np.random.default_rng(int(hashlib.md5(f'{S.id}/{key}'.encode()).hexdigest()[:8], 16))
    pick = lambda xs: xs[g.integers(len(xs))]
    t = dict(
        # Build and bearing.
        yaw=g.uniform(-0.6, 0.6), pitch=g.uniform(-0.22, 0.18), head=g.uniform(0.82, 1.15), oval=g.uniform(0.94, 1.14),
        shoulders=g.uniform(0.82, 1.2),
        # The eye.
        eye_shape=pick(['almond', 'round', 'narrow', 'wide']), eye_size=g.uniform(0.85, 1.12),
        pupil=pick(['slit', 'round', 'double', 'ring', 'star']), iris2=pick([None, '#ffe7a0', '#ffffff', '#ff9a60', '#9fe0ff']),
        lids=pick(['none', 'heavy', 'lashes']),
        mark=pick(['none', 'sigil', 'tears', 'brow', 'dots', 'crescent']),
        # A corona of flares streaming from the head like hair, or a crest of flame.
        flares=pick([0, 0, 0, 3, 4, 5]), flare_len=g.uniform(0.8, 1.7), crest=g.random() < 0.25,
        # Halos.
        halo_style=pick(['smooth', 'beaded', 'segmented', 'double', 'broken']), halo_tilts=list(g.uniform(-70, 70, 3)),
        halo_size=g.uniform(0.85, 1.2),
        # The cloak.
        cloak_style=pick(['flame', 'veil', 'tatters', 'wings']), cloak_w=g.uniform(0.75, 1.3), cloak_len=g.uniform(0.8, 1.2),
        sway=g.uniform(-1, 1), warmth=g.uniform(-0.25, 0.35),
        # What they wear.
        armour=pick(['chevrons', 'scales', 'breastplate', 'bands']), pauldrons=pick(['round', 'spiked', 'wing', 'none']),
        robe=pick(['#fffaf0', '#f2ede2', '#e6eef8', '#fff1d0', '#f2e8ff']), trim=pick(['#ffe08a', '#e0a020', '#9fd0ff', '#ffffff']),
        stole=pick(['pair', 'single', 'cross']), mantle=g.random() < 0.5, girdle=g.random() < 0.5,
        crown_style=pick(['sunburst', 'circlet', 'spires']), helm=pick(['none', 'none', 'visor', 'plume']),
        # How they stand and hold things.
        pose=pick(['high', 'level', 'rest', 'low']), free=pick(['down', 'palm', 'chest']),
        shield_style=pick(['disc', 'kite', 'hex']), staff_top=pick(['sun', 'crescent', 'ring']), flag=pick(['swallow', 'straight', 'pennant']),
        orb_high=g.random() < 0.5,
    )
    if force: t.update(force)
    return t


def warm(c, k):
    """Shift a colour warmer (toward flame) or cooler (toward white-blue)."""
    return mix(c, '#ff8a30', k) if k > 0 else mix(c, '#e8f2ff', -k)


def aureline(S, x, y, s, item=None, halos=2, cloak=None, eye='#2a6fd0', crown=False, lean=0, garb='robe', sash=None, look=None, key=None,
             facing=1, back=False, stature=1.0, arms=None, helm=None, hold=None):
    """Draw an Aureline with its head at (x, y), at scale s. `facing` -1 turns it to face left; `back` shows it
    from behind; `stature` below 1 kneels or crouches it; `arms` 'raise' lifts both arms (in worship)."""
    T = traits(S, key if key is not None else f'{x:.0f},{y:.0f}', look)
    if helm is not None: T['helm'] = helm
    if facing < 0:
        # Drawn mirrored: the picture is flipped, the figure drawn where its mirror image stands, and flipped back.
        S.cv.c = S.cv.c[:, ::-1].copy()
        _draw(S, T, 160 - x, y, s, item, halos, cloak, eye, crown, -lean, garb, sash, back, stature, arms, hold and (160 - hold[0], hold[1]))
        S.cv.c = S.cv.c[:, ::-1].copy()
    else:
        _draw(S, T, x, y, s, item, halos, cloak, eye, crown, lean, garb, sash, back, stature, arms, hold)


def _draw(S, T, x, y, s, item, halos, cloak, eye, crown, lean, garb, sash, back, stature, arms, hold=None):
    cl = warm(col(cloak or S.p['glow']), T['warmth'])
    lean = lean * s + T['sway'] * s * 1.5
    hr = 7.5 * s                      # the body's scale
    hh = hr * T['head']               # the head's radius
    sw = T['shoulders']
    yaw, pitch = T['yaw'], T['pitch']
    turn = np.sin(yaw) * hr * 0.35    # the body turns with the head, a little
    S.glow(x, y + hr * 1.5, hr * 5, cl, 0.2)

    # ---- The cloak.
    T['st'] = stature
    T['cloak_k'] = 0.45 if garb == 'vestment' else 1.0
    _cloak(S, T, x, y, hr, s, sw, lean, cl)

    # ---- What they wear over the plasma.
    cx = x + turn
    if garb == 'armour':
        _armour(S, T, cx, y, hr, s, sw, back)
    elif garb == 'vestment':
        _vestment(S, T, cx, y, hr, s, sw, sash, cl, lean, back)
    if back:
        pass
    elif sash and garb != 'vestment':
        S.tube(quad((cx - hr * 1.5 * sw, y + hr * 1.3), (cx, y + hr * 3.2), (cx + hr * 1.7 * sw, y + hr * 2.4)), 1.1 * s, mix(sash, '#000000', 0.55), sash, shine=0.35, power=12)
    elif garb == 'robe' and T['girdle']:
        S.tube(quad((cx - hr * 1.3 * sw, y + hr * 2.6), (cx, y + hr * 3.1), (cx + hr * 1.3 * sw, y + hr * 2.6)), 0.55 * s, '#5a3a0e', '#ffe7a8', shine=1.2)

    # ---- Arms of plasma: one to what they hold, the other in its own gesture.
    hand, ang = _hand(T, item, x, y, hr)
    if item and item != 'none':
        S.plasma(quad((cx + hr * 1.2 * sw, y + hr * 1.0), ((cx + hr * 1.2 * sw + hand[0]) / 2 + hr * 0.3, min(y + hr * 0.8, hand[1] + hr * 0.6)), hand), 0.75 * s, cl, 0.9, taper=0.3)
    if arms == 'offer' and hold:
        # Both hands held out together, cradling something.
        for k in (-1, 1):
            hnd = (hold[0] + k * hr * 0.6, hold[1] + hr * 0.25)
            S.plasma(quad((cx + k * hr * 1.2 * sw, y + hr * 1.0), (cx + k * hr * 1.6 * sw, hold[1] + hr * 0.6), hnd), 0.7 * s, cl, 0.85, taper=0.35)
    elif arms == 'raise':
        # Both arms lifted to the sky, light in the open hands.
        for k in (-1, 1):
            hnd = (cx + k * hr * 2.7 * sw, y - hr * 1.9)
            S.plasma(quad((cx + k * hr * 1.2 * sw, y + hr * 1.0), (cx + k * hr * 2.9 * sw, y + hr * 0.4), hnd), 0.7 * s, cl, 0.85, taper=0.4)
            S.glow(hnd[0], hnd[1] - hr * 0.2, hr * 0.7, '#fff3c4', 0.7)
    else:
        free = {'down': (cx - hr * 1.6 * sw, y + hr * 2.8), 'palm': (cx - hr * 2.6 * sw, y - hr * 0.2), 'chest': (cx - hr * 0.2, y + hr * 1.9)}[T['free']]
        S.plasma(quad((cx - hr * 1.2 * sw, y + hr * 1.0), (cx - hr * 2.1 * sw, y + hr * 1.4), free), 0.7 * s, cl, 0.75, taper=0.5)
        if T['free'] == 'palm':
            S.glow(free[0], free[1] - hr * 0.3, hr * 0.8, '#fff3c4', 0.6)

    # ---- The head: flares and halos behind, the sphere, the eye, then the near halos and the crown.
    rings = _halos(S, T, x, y, hh, halos)
    _flares(S, T, x, y, hh, s, cl, behind=True)
    for r in rings: _ring(S, T, r, s, front=False)
    _head(S, T, x, y, hh, s, cl, eye, back)
    if T['helm'] != 'none' and garb == 'armour':
        _helm(S, T, x, y, hh, s, cl)
    for r in rings: _ring(S, T, r, s, front=True)
    if T['crest']:
        tip = (x - np.sin(yaw) * hh * 0.4, y - hh * 2.3)
        S.energy([(x - hh * 0.35, y - hh * 0.8), (tip[0] - hh * 0.3, y - hh * 1.6), tip, (x + hh * 0.2, y - hh * 1.4), (x + hh * 0.35, y - hh * 0.8)], cl, 0.9, rim=1.2, fill=0.6, bevel=0.5 * s)
    if crown:
        _crown(S, T, x, y, hh, s)

    # ---- What they hold.
    _item(S, T, item, hand, ang, hr, s)


def _cloak(S, T, x, y, hr, s, sw, lean, cl):
    w, L = 2.4 * T['cloak_w'] * sw, 6 * T['cloak_len'] * T.get('st', 1.0)
    style = T['cloak_style']
    tail = (x + lean * 1.6, y + hr * L)
    if style == 'wings':
        # Two great lobes sweeping out from the shoulders, and a short body between.
        polys = []
        for k in (-1, 1):
            base = [(x + k * hr * 1.0 * sw, y + hr * 0.7)]
            # Swept back and down like flames streaming off the shoulders.
            out = cubic(base[0], (x + k * hr * 3.0 * sw, y + hr * 0.1), (x + k * hr * 3.6 * sw, y + hr * 2.2), (x + k * hr * 2.6 * sw + lean, y + hr * 5.2 * T['cloak_len']))
            back = cubic(out[-1], (x + k * hr * 2.2 * sw, y + hr * 3.4), (x + k * hr * 1.5 * sw, y + hr * 2.2), (x + k * hr * 0.4, y + hr * 1.2))
            polys.append(out + back)
        body = cubic((x - hr * 1.2 * sw, y + hr * 0.6), (x - hr * 1.5, y + hr * 3), (x - hr * 0.5 + lean, y + hr * 4), tail) + cubic(tail, (x + hr * 0.5 + lean, y + hr * 4), (x + hr * 1.5, y + hr * 3), (x + hr * 1.2 * sw, y + hr * 0.6))
        m = np.clip(poly_mask(polys[0], 0.35 * s) + poly_mask(polys[1], 0.35 * s) + poly_mask(body, 0.35 * s), 0, 1)
    else:
        left = cubic((x - hr * 1.5 * sw, y + hr * 0.6), (x - hr * w, y + hr * 3), (x - hr * 0.8 + lean, y + hr * L * 0.77), tail)
        right = cubic(tail, (x + hr * 0.9 + lean, y + hr * L * 0.73), (x + hr * w, y + hr * 3), (x + hr * 1.5 * sw, y + hr * 0.6))
        top = quad((x + hr * 1.5 * sw, y + hr * 0.6), (x, y - hr * 0.2), (x - hr * 1.5 * sw, y + hr * 0.6))
        m = poly_mask(left + right + top, blur=0.35 * s)
    v = np.clip((Y - (y + hr * 0.4)) / (hr * (L - 0.4)), 0, 1)
    u = (X - (x + lean * 1.6 * v)) / (hr * 2.2)
    flow = fbm2(u * 2.2 + fbm2(X * 0.12, Y * 0.12, 2, S.seed % 7) * 1.4, Y * 0.05 / s - v * 2, 5, S.seed % 11)
    if style == 'wings':
        streak = fbm2(np.arctan2(Y - y, X - x) * 14, np.hypot(X - x, Y - y) * 0.08 / s, 3, S.seed % 13)
        eaten = smooth(0.2 + v * 0.4, 0.55 + v * 0.35, streak * 0.6 + flow * 0.4 + (1 - v) * 0.2)
    elif style == 'tatters':
        streak = fbm2(u * 11, Y * 0.02 / s, 2, S.seed % 13)
        eaten = smooth(0.25 + v * 0.35, 0.45 + v * 0.3, streak * 0.7 + flow * 0.3 + (1 - v) * 0.35)
    elif style == 'veil':
        streak = 0.5 + 0.5 * np.sin(u * 14 + flow * 3)
        eaten = smooth(0.0 + v * 0.45, 0.6 + v * 0.4, flow * 0.6 + (1 - v) * 0.5) * 0.85
    else:
        streak = fbm2(u * 5 + flow * 2, Y * 0.03 / s, 3, S.seed % 13)
        eaten = smooth(0.1 + v * 0.5, 0.5 + v * 0.45, flow * 0.8 + streak * 0.2 + (1 - v) * 0.3)
    body = m * eaten
    heat = (1 - v) ** 1.3
    S.absorb(body * 0.55 * (1 - v), tint=(0.7, 0.85, 1.2))
    k = T.get('cloak_k', 1.0)
    S.add('#fff6dc', body * heat ** 2 * (0.2 + 0.6 * flow) * 0.6 * k)
    S.add(mix(cl, '#ff9a30', 0.35), body * (0.3 + 0.7 * heat) * (0.4 + 1.1 * streak) * 0.75 * k)
    S.add(cl, gaussian_filter(body, 3 * s * 6) * 0.2)
    S.plasma(quad((x - hr * 0.6, y + hr * 1.2), (x + lean * 0.5, y + hr * 3.2), (x + lean * 1.4, y + hr * L * 0.85)), 0.25 * s, '#fff6dc', 0.5, taper=0.8)


def _armour(S, T, x, y, hr, s, sw, back=False):
    style = 'none' if back else T['armour']
    if style == 'none':
        pass
    elif style == 'chevrons':
        for i in range(3):
            w = hr * (1.3 - i * 0.15) * sw
            yy = y + hr * (1.4 + i * 0.75)
            S.tube([(x - w, yy), (x, yy + hr * 0.6), (x + w, yy)], 0.6 * s, '#5a3a0e', '#ffe7a8', shine=1.2, power=22)
    elif style == 'scales':
        for r in range(5):
            n = 5 - (r > 2)
            for c in range(n):
                px = x + (c - (n - 1) / 2) * hr * 0.5 * sw + (r % 2) * hr * 0.12
                py = y + hr * (1.25 + r * 0.42)
                S.tube(quad((px - hr * 0.26, py), (px, py + hr * 0.36), (px + hr * 0.26, py)), 0.28 * s, '#5a3a0e', '#ffe7a8', shine=1.1)
    elif style == 'breastplate':
        plate = [(x - hr * 1.05 * sw, y + hr * 1.1), (x + hr * 1.05 * sw, y + hr * 1.1), (x + hr * 0.95 * sw, y + hr * 2.6), (x, y + hr * 3.5), (x - hr * 0.95 * sw, y + hr * 2.6)]
        S.gold(plate, bevel=0.8 * s)
        S.tube([(x, y + hr * 1.3), (x, y + hr * 3.2)], 0.18 * s, '#3a2408', '#a07a30', shine=0.2)
        S.sun(x, y + hr * 2.0, 1.1 * s, '#fff3c4', rays=8)
    else:
        for i in range(4):
            yy = y + hr * (1.3 + i * 0.55)
            w = hr * (1.25 - i * 0.12) * sw
            S.tube(quad((x - w, yy), (x, yy + hr * 0.25), (x + w, yy)), 0.42 * s, '#5a3a0e', '#ffe7a8', shine=1.2)
            S.glow(x, yy + hr * 0.13, 0.6 * s, '#fff3c4', 0.6)
    pd = T['pauldrons']
    for k in (-1, 1):
        if pd == 'round':
            pts = quad((x + k * hr * 0.9 * sw, y + hr * 1.05), (x + k * hr * 1.9 * sw, y + hr * 0.6), (x + k * hr * 2.05 * sw, y + hr * 1.75)) + quad((x + k * hr * 2.05 * sw, y + hr * 1.75), (x + k * hr * 1.4 * sw, y + hr * 1.5), (x + k * hr * 0.9 * sw, y + hr * 1.05))
            S.gold(pts, bevel=0.7 * s)
        elif pd == 'spiked':
            S.gold([(x + k * hr * 0.9 * sw, y + hr * 1.0), (x + k * hr * 2.6 * sw, y + hr * 0.2), (x + k * hr * 1.9 * sw, y + hr * 1.5), (x + k * hr * 1.1 * sw, y + hr * 1.6)], bevel=0.6 * s)
        elif pd == 'wing':
            for f in range(3):
                a0 = (x + k * hr * (0.9 + f * 0.25) * sw, y + hr * (1.0 + f * 0.25))
                S.gold([a0, (a0[0] + k * hr * (1.8 - f * 0.3), a0[1] - hr * (0.9 - f * 0.25)), (a0[0] + k * hr * 0.5, a0[1] + hr * 0.45)], bevel=0.4 * s)


def _vestment(S, T, x, y, hr, s, sw, sash, cl, lean, back=False):
    """Long robes that hang from the shoulders, sway with the body, and burn away into the plasma below."""
    st = T.get('st', 1.0)
    bot = y + hr * 5.6 * st
    sway = lean * 1.2
    robe = (quad((x - hr * 1.15 * sw, y + hr * 0.9), (x - hr * 1.9 * sw, y + hr * 3.0 * st), (x - hr * 2.3 * sw + sway, bot))
            + quad((x - hr * 2.3 * sw + sway, bot), (x + sway, bot + hr * 0.5), (x + hr * 2.3 * sw + sway, bot))
            + quad((x + hr * 2.3 * sw + sway, bot), (x + hr * 1.9 * sw, y + hr * 3.0 * st), (x + hr * 1.15 * sw, y + hr * 0.9))
            + quad((x + hr * 1.15 * sw, y + hr * 0.9), (x, y + hr * 0.3), (x - hr * 1.15 * sw, y + hr * 0.9)))
    # Where the cloth gives way to light: a ragged line, low on the robe.
    v = (Y - (y + hr * 0.9)) / (bot - y - hr * 0.9)
    edge = 0.62 + 0.22 * (fbm2(X * 0.25 / s, Y * 0.04, 3, S.seed % 29) - 0.5) * 2
    alpha = 1 - smooth(edge - 0.1, edge + 0.04, v)
    m = S.cloth(robe, T['robe'], mix(T['robe'], '#8a7454', 0.5), folds=5, bevel=1.2 * s, alpha=0.97 * alpha, fan=(x, y - hr * 2))
    burn = poly_mask(robe) * np.exp(-((v - edge) / 0.05) ** 2)
    S.add(mix(cl, '#ff9a30', 0.4), burn * 0.7)
    S.add('#fff6dc', burn * 0.2)
    # A collar of gold.
    S.tube(quad((x - hr * 1.0 * sw, y + hr * 0.95), (x, y + hr * 1.5), (x + hr * 1.0 * sw, y + hr * 0.95)), 0.45 * s, mix(T['trim'], '#000000', 0.6), T['trim'], shine=1.2)
    if not back:
        stc = sash or '#c0392b'
        if T['stole'] == 'pair':
            for k in (-1, 1):
                S.cloth([(x + k * hr * 0.2, y + hr * 1.0), (x + k * hr * 0.5, y + hr * 1.0), (x + k * hr * 0.7 + sway * 0.5, bot - hr * 0.2), (x + k * hr * 0.3 + sway * 0.5, bot - hr * 0.1)], stc, mix(stc, '#000000', 0.45), folds=2, fold_dir=(0, 1), bevel=0.4 * s, alpha=alpha)
        elif T['stole'] == 'single':
            S.cloth([(x - hr * 0.35, y + hr * 1.0), (x + hr * 0.35, y + hr * 1.0), (x + hr * 0.5 + sway * 0.5, bot), (x - hr * 0.5 + sway * 0.5, bot)], stc, mix(stc, '#000000', 0.45), folds=2, fold_dir=(0, 1), bevel=0.5 * s, alpha=alpha)
        else:
            S.cloth([(x - hr * 1.1 * sw, y + hr * 1.0), (x - hr * 0.7 * sw, y + hr * 0.95), (x + hr * 1.6 * sw, y + hr * 4.0 * st), (x + hr * 1.1 * sw, y + hr * 4.3 * st)], stc, mix(stc, '#000000', 0.45), folds=3, fold_dir=(1, 1), bevel=0.5 * s, alpha=alpha)
    if T['mantle']:
        mant = quad((x - hr * 1.9 * sw, y + hr * 2.0), (x - hr * 1.5 * sw, y + hr * 0.4), (x, y + hr * 0.45)) + quad((x, y + hr * 0.45), (x + hr * 1.5 * sw, y + hr * 0.4), (x + hr * 1.9 * sw, y + hr * 2.0)) + quad((x + hr * 1.9 * sw, y + hr * 2.0), (x, y + hr * 2.5), (x - hr * 1.9 * sw, y + hr * 2.0))
        S.cloth(mant, T['trim'], mix(T['trim'], '#3a2408', 0.6), folds=4, bevel=0.8 * s, fan=(x, y - hr))
    if not back:
        S.sun(x, y + hr * (2.9 if T['mantle'] else 2.6), 1.3 * s, '#ffd98a', rays=6)


def _helm(S, T, x, y, hh, s, cl):
    """A helm of gold over the crown of the head, the eye left bare beneath its brim."""
    dx, dy = (X - x) / hh, (Y - y) / (hh * T['oval'])
    d = np.hypot(dx * 1.06, dy * 1.06)
    nz = np.sqrt(np.clip(1 - d * d, 0, 1))
    brim = -0.42 + 0.18 * dx * dx + np.sin(T['pitch']) * 0.3
    m = smooth(1.0, 0.97, d) * smooth(brim + 0.03, brim - 0.03, dy)
    n = np.stack([dx, dy, nz], -1)
    from kit import LIGHT, HALF
    lit = np.clip((n * LIGHT).sum(-1), 0, None)
    spec = np.clip((n * HALF).sum(-1), 0, None) ** 30
    gold = mix('#5a3a0e', '#ffe3a0', lit[..., None] ** 0.7) * (0.3 + 0.9 * lit[..., None]) + spec[..., None] * 1.5
    S.over(gold, m)
    S.add('#fff3c4', np.exp(-((dy - brim) / 0.04) ** 2) * smooth(1.0, 0.9, d) * 1.0)
    if T['helm'] == 'visor':
        S.gold([(x - hh * 0.12, y - hh * 0.85), (x - np.sin(T['yaw']) * hh * 0.3, y - hh * 2.0), (x + hh * 0.18, y - hh * 0.9)], bevel=0.3 * s)
    else:
        top = (x, y - hh * 1.0)
        S.plasma(quad(top, (x - hh * 1.2, y - hh * 1.9), (x - hh * 2.6, y - hh * 1.3)), 0.9 * s, mix(cl, '#ff8a30', 0.5), 0.9, core='#fff3c4', taper=0.9)


def _hand(T, item, x, y, hr):
    """Where the holding hand is, and the angle of what it holds (degrees, screen: negative is up)."""
    pose = T['pose']
    if item == 'lance':
        return {'high': ((x + hr * 2.1, y + hr * 0.9), -62), 'level': ((x + hr * 2.4, y + hr * 1.6), -34), 'rest': ((x + hr * 2.3, y + hr * 2.0), -84), 'low': ((x + hr * 2.5, y + hr * 2.1), -8)}[pose]
    if item == 'shield':
        return ((x + hr * 2.3, y + hr * (1.0 if pose in ('high', 'level') else 2.0)), 0)
    if item in ('staff', 'banner'):
        return ((x + hr * 2.4, y + hr * (1.2 if pose == 'high' else 1.7)), {'high': -84, 'level': -78, 'rest': -90, 'low': -72}[pose])
    if item == 'orb':
        return ((x + hr * 2.2, y + (hr * 0.2 if T['orb_high'] else hr * 1.6)), 0)
    return ((x + hr * 2.4, y + hr * 1.6), 0)


def _halos(S, T, x, y, hh, n):
    rings = []
    for i in range(n):
        rx, ry = hh * (1.9 + i * 0.35) * T['halo_size'], hh * (0.62 + i * 0.1) * T['halo_size']
        c = S.p['accent'] if i % 2 else '#fff3c4'
        a = np.radians(T['halo_tilts'][i])
        span = 2 * np.pi * (0.72 if T['halo_style'] == 'broken' else 1.0)
        ts = np.linspace(0.3 * i, 0.3 * i + span, 140)
        for off in ((0, 0.12) if T['halo_style'] == 'double' else (0,)):
            k = 1 + off
            px = x + rx * k * np.cos(ts) * np.cos(a) - ry * k * np.sin(ts) * np.sin(a)
            py = y + rx * k * np.cos(ts) * np.sin(a) + ry * k * np.sin(ts) * np.cos(a)
            rings.append((px, py, np.sin(ts), c, off > 0))
    return rings


def _ring(S, T, ring, s, front):
    px, py, z, c, thin = ring
    keep = z >= 0 if front else z < 0
    style = T['halo_style']
    if style == 'segmented':
        keep = keep & (np.arange(len(px)) % 16 < 11)
    idx = np.nonzero(keep)[0]
    if len(idx) < 2: return
    w = 0.55 * s * (1.2 if front else 0.9) * (0.55 if thin or style == 'double' else 1)
    for run in np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1):
        if len(run) < 2: continue
        S.plasma(list(zip(px[run], py[run])), w, c, 1.1 if front else 0.6, core='#ffffff')
    if style == 'beaded':
        for i in idx[::12]:
            S.add('#ffffff', (1.6 if front else 0.8) * np.exp(-((X - px[i]) ** 2 + (Y - py[i]) ** 2) / (0.55 * s) ** 2))
            S.add(c, (0.8 if front else 0.4) * np.exp(-((X - px[i]) ** 2 + (Y - py[i]) ** 2) / (1.4 * s) ** 2))


def _flares(S, T, x, y, hh, s, cl, behind):
    n = T['flares']
    if not n: return
    g = np.random.default_rng(int(hh * 1000) + n)
    back = -np.sign(T['yaw']) if abs(T['yaw']) > 0.1 else 0
    for i in range(n):
        a = -np.pi / 2 + (i - (n - 1) / 2) * 0.42 + back * 0.5
        L = hh * T['flare_len'] * g.uniform(0.7, 1.3)
        p0 = (x + np.cos(a) * hh * 0.9, y + np.sin(a) * hh * 0.9)
        bend = back * hh * 0.8 + g.uniform(-0.4, 0.4) * hh
        p1 = (p0[0] + np.cos(a) * L * 0.6 + bend * 0.4, p0[1] + np.sin(a) * L * 0.6)
        p2 = (p0[0] + np.cos(a) * L + bend, p0[1] + np.sin(a) * L * 0.8 + L * 0.25)
        S.plasma(quad(p0, p1, p2), 1.15 * s, mix(cl, '#ff9a30', 0.4), 0.8, core='#fff3c4', taper=0.9)


def _head(S, T, x, y, hh, s, cl, eye, back=False):
    yaw, pitch = T['yaw'], T['pitch']
    dx, dy = (X - x) / hh, (Y - y) / (hh * T['oval'])
    d = np.hypot(dx, dy)
    nz = np.sqrt(np.clip(1 - d * d, 0, 1))
    m = smooth(1.0, 0.96, d)
    churn = fbm3(dx * 3 + S.seed % 5, dy * 3, nz * 3, 4, S.seed % 17)
    core = smooth(1.0, 0.0, np.hypot(dx - np.sin(yaw) * 0.3, dy - np.sin(pitch) * 0.3))
    headc = mix(mix(cl, '#c87a20', 0.25), '#fff1c8', core[..., None] ** 0.8) * (0.55 + 0.7 * core[..., None] + 0.6 * churn[..., None])
    S.over(headc, m)
    S.add(cl, m * (1 - nz) ** 3 * 1.0)
    S.glow(x, y, hh * 2.2, cl, 0.25)
    if back:
        return

    # The eye sits where the head is looking: foreshortened as it turns away.
    fx, fy = np.cos(yaw) * 0.85 + 0.15, np.cos(pitch)
    ex, ey = x + np.sin(yaw) * hh * 0.62, y + np.sin(pitch) * hh * 0.6 * T['oval']
    es = T['eye_size']
    shape = T['eye_shape']
    ax, ah, pw = {'almond': (0.8, 0.37, 1.0), 'round': (0.58, 0.5, 0.5), 'narrow': (0.86, 0.24, 1.3), 'wide': (0.84, 0.47, 0.75)}[shape]
    ax, ah = ax * hh * es * fx, ah * hh * es * fy
    ux = (X - ex) / ax
    base = np.clip(1 - ux * ux, 0, 1) ** pw
    half_up = ah * base * (0.62 if T['lids'] == 'heavy' else 1.0)
    half_dn = ah * base
    up = Y < ey
    half = np.where(up, half_up, half_dn)
    edge = half - np.abs(Y - ey)
    almond = smooth(-0.12 * s, 0.12 * s, edge) * (np.abs(ux) < 1)
    inner = np.clip(edge / np.maximum(half, 1e-3), 0, 1)
    S.over(mix('#9aa6c0', '#fbf8f2', smooth(0, 0.7, inner)[..., None]) * 0.85, almond)
    ir = hh * 0.42 * es * (1.12 if shape == 'round' else 1.0)
    iex = ex + np.sin(yaw) * hh * 0.05
    rr = np.hypot((X - iex) / fx, Y - ey) / ir
    th = np.arctan2(Y - ey, X - iex)
    fib = fbm2(th * 9, rr * 3, 3, S.seed % 19)
    ec = col(eye)
    iris = ec * (0.5 + 1.4 * fib[..., None]) * (1 - 0.6 * smooth(0.75, 1.0, rr)[..., None])
    if T['iris2']:
        iris = iris + col(T['iris2']) * (smooth(0.6, 0.25, rr) * 0.9)[..., None]
    lid_shadow = smooth(0.0, 0.5, (Y - (ey - half_up)) / np.maximum(half_up + half_dn, 1e-3))
    S.over(iris * (0.55 + 0.6 * lid_shadow[..., None]) * 1.2, smooth(1.0, 0.94, rr) * almond)
    deep = col(S.p['deep']) * 0.1
    pu = T['pupil']
    px_, py_ = (X - iex) / (hh * es * fx), (Y - ey) / (hh * es)
    if pu == 'slit':
        pm = smooth(1.0, 0.8, np.hypot(px_ / 0.1, py_ / 0.3))
    elif pu == 'round':
        pm = smooth(1.0, 0.85, np.hypot(px_, py_) / 0.17)
    elif pu == 'double':
        pm = np.maximum(smooth(1.0, 0.8, np.hypot((px_ - 0.08) / 0.05, py_ / 0.27)), smooth(1.0, 0.8, np.hypot((px_ + 0.08) / 0.05, py_ / 0.27)))
    elif pu == 'ring':
        rp = np.hypot(px_, py_)
        pm = smooth(0.2, 0.17, rp) * smooth(0.06, 0.09, rp)
        S.add('#ffffff', almond * np.exp(-(rp / 0.05) ** 2) * 2.0)
    else:
        a4 = np.arctan2(py_, px_)
        pm = smooth(1.0, 0.8, np.hypot(px_, py_) / (0.08 + 0.12 * np.abs(np.cos(2 * a4)) ** 6))
    S.over(deep, pm * almond)
    gx, gy = ex - hh * 0.16 * es * fx, ey - hh * 0.15 * es
    S.add('#ffffff', almond * 4 * np.exp(-(((X - gx) / (hh * 0.09)) ** 2 + ((Y - gy) / (hh * 0.07)) ** 2)))
    S.add('#ffffff', almond * 1.5 * np.exp(-(((X - (ex + hh * 0.2 * fx)) / (hh * 0.04)) ** 2 + ((Y - (ey + hh * 0.12)) / (hh * 0.04)) ** 2)))
    S.add('#fff3c4', np.exp(-(edge / (0.12 * s)) ** 2) * (np.abs(ux) < 1.02) * (1.6 if T['lids'] == 'heavy' else 0.9) * np.where(up, 1.0, 0.7))
    if T['lids'] == 'lashes':
        for k in range(5):
            u0 = -0.6 + k * 0.3
            bx_, by_ = ex + u0 * ax, ey - ah * (1 - u0 * u0)
            S.plasma([(bx_, by_), (bx_ + u0 * hh * 0.25, by_ - hh * 0.3)], 0.15 * s, '#fff3c4', 0.8, flicker=False, taper=0.8)

    # Markings, glowing on the face.
    mk = T['mark']
    mc = S.p['accent'] if T['iris2'] is None else '#ffe7a0'
    top = ey - ah - hh * 0.22
    if mk == 'sigil':
        rr2 = np.hypot(X - ex, Y - top)
        S.add(mc, 1.2 * np.exp(-((rr2 - hh * 0.12) / (0.12 * s)) ** 2) + 2 * np.exp(-(rr2 / (0.15 * s)) ** 2))
    elif mk == 'tears':
        for k in (-1, 1):
            u0 = k * 0.35
            sx_ = ex + u0 * ax
            S.plasma([(sx_, ey + ah * 0.9), (sx_ + k * hh * 0.05, ey + hh * 0.65), (sx_ + k * hh * 0.08, y + hh * 0.92)], 0.14 * s, mc, 0.9, flicker=False, taper=0.7)
    elif mk == 'brow':
        S.plasma(quad((ex - ax * 0.9, top + hh * 0.12), (ex, top - hh * 0.12), (ex + ax * 0.9, top + hh * 0.12)), 0.16 * s, mc, 0.9, flicker=False)
    elif mk == 'dots':
        for k in (-1, 0, 1):
            S.add(mc, 2 * np.exp(-((X - (ex + k * ax * 0.45)) ** 2 + (Y - (top + abs(k) * hh * 0.08)) ** 2) / (0.22 * s) ** 2))
    elif mk == 'crescent':
        side = -np.sign(T['yaw'] or 1)
        cx_, cy_ = x + side * hh * 0.62, y - hh * 0.1
        r1 = np.hypot(X - cx_, Y - cy_); r2 = np.hypot(X - cx_ - side * hh * 0.08, Y - cy_)
        S.add(mc, 1.4 * smooth(hh * 0.2, hh * 0.17, r1) * smooth(hh * 0.15, hh * 0.18, r2) * m)


def _crown(S, T, x, y, hh, s):
    st = T['crown_style']
    S.glow(x, y - hh * 1.6, hh * 2, '#fff3c4', 0.5)
    if st == 'sunburst':
        for i in range(-4, 5):
            a = -np.pi / 2 + i * 0.2
            r1, r2 = hh * 1.15, hh * (2.2 + (0 if i % 2 else 0.55) - abs(i) * 0.08)
            S.gold([(x + np.cos(a - 0.09) * r1, y + np.sin(a - 0.09) * r1), (x + np.cos(a) * r2, y + np.sin(a) * r2), (x + np.cos(a + 0.09) * r1, y + np.sin(a + 0.09) * r1)], bevel=0.35 * s)
            S.add('#fff6e0', 1.5 * np.exp(-np.hypot(X - (x + np.cos(a) * r2), Y - (y + np.sin(a) * r2)) ** 2 / (0.6 * s) ** 2))
    elif st == 'circlet':
        ring = [(x + np.cos(t) * hh * 1.05, y - hh * 0.55 + np.sin(t) * hh * 0.28) for t in np.linspace(np.pi, 2 * np.pi, 30)]
        S.tube(ring, 0.55 * s, '#5a3a0e', '#ffe7a8', shine=1.4)
        for t in np.linspace(np.pi * 1.15, np.pi * 1.85, 5):
            gx, gy = x + np.cos(t) * hh * 1.05, y - hh * 0.55 + np.sin(t) * hh * 0.28
            S.gold([(gx - hh * 0.12, gy), (gx, gy - hh * (0.5 if abs(t - 1.5 * np.pi) < 0.1 else 0.3)), (gx + hh * 0.12, gy)], bevel=0.25 * s)
            S.add('#9fe0ff' if abs(t - 1.5 * np.pi) < 0.1 else '#fff3c4', 1.5 * np.exp(-((X - gx) ** 2 + (Y - gy) ** 2) / (0.35 * s) ** 2))
    else:
        for k, (dx_, h) in enumerate(((-0.55, 1.6), (0, 2.4), (0.55, 1.6))):
            bx = x + dx_ * hh
            S.gold([(bx - hh * 0.18, y - hh * 0.8), (bx, y - hh * h - 0.6), (bx + hh * 0.18, y - hh * 0.8)], bevel=0.3 * s)
            S.add('#fff6e0', 1.8 * np.exp(-((X - bx) ** 2 + (Y - (y - hh * h - 0.6)) ** 2) / (0.6 * s) ** 2))


def _item(S, T, item, hand, ang, hr, s):
    if item == 'lance':
        _lance(S, hand, ang, hr, s)
    elif item == 'shield':
        cx_, cy_ = hand[0] + hr * 0.6, hand[1]
        st = T['shield_style']
        if st == 'disc':
            S.shield_disc(cx_, cy_, hr * 1.7, S.p['accent'])
        elif st == 'kite':
            pts = [(cx_, cy_ - hr * 1.9), (cx_ + hr * 1.35, cy_ - hr * 0.9), (cx_ + hr * 0.9, cy_ + hr * 1.1), (cx_, cy_ + hr * 2.3), (cx_ - hr * 0.9, cy_ + hr * 1.1), (cx_ - hr * 1.35, cy_ - hr * 0.9)]
            S.energy(pts, S.p['accent'], 1.0, rim=1.3, fill=0.35, bevel=1.0 * s)
            S.tube(pts + [pts[0]], 0.45 * s, '#5a3a0e', '#ffe7a8', shine=1.2)
            S.sun(cx_, cy_ - hr * 0.1, 1.2 * s, '#fff3c4', rays=8)
        else:
            S.hexagon(cx_, cy_, hr * 1.7, S.p['accent'])
    elif item == 'staff':
        a = np.radians(ang)
        dx, dy = np.cos(a), np.sin(a)
        b = (hand[0] - dx * hr * 3.2, hand[1] - dy * hr * 3.2); t = (hand[0] + dx * hr * 3.3, hand[1] + dy * hr * 3.3)
        S.tube([b, t], 0.7 * s, '#6a4a1a', '#f3d99a', shine=1.2)
        top = T['staff_top']
        if top == 'sun':
            S.sun(t[0], t[1] - hr * 0.3, 2.6 * s, S.p['glow'], rays=8)
        elif top == 'crescent':
            ring = [(t[0] + np.cos(q) * hr * 0.9, t[1] - hr * 0.9 + np.sin(q) * hr * 0.9) for q in np.linspace(0.3 * np.pi, 2.7 * np.pi * 0.9, 30)]
            S.tube(ring, 0.45 * s, '#6a4a1a', '#f3d99a', shine=1.3)
            S.sun(t[0], t[1] - hr * 0.9, 1.4 * s, '#fff3c4', rays=6)
        else:
            ring = [(t[0] + np.cos(q) * hr * 0.8, t[1] - hr * 0.8 + np.sin(q) * hr * 0.8) for q in np.linspace(0, 2 * np.pi, 40)]
            S.plasma(ring, 0.35 * s, S.p['accent'], 1.0, core='#ffffff')
            S.glow(t[0], t[1] - hr * 0.8, hr * 0.6, '#ffffff', 0.7)
    elif item == 'banner':
        a = np.radians(ang)
        dx, dy = np.cos(a), np.sin(a)
        b = (hand[0] - dx * hr * 3, hand[1] - dy * hr * 3); t = (hand[0] + dx * hr * 4, hand[1] + dy * hr * 4)
        S.tube([b, t], 0.6 * s, '#6a4a1a', '#f3d99a', shine=1.2)
        px_, top_ = t
        fl = T['flag']
        if fl == 'swallow':
            flag = quad((px_, top_), (px_ + hr * 2, top_ - hr * 0.4), (px_ + hr * 4, top_ + hr * 0.3)) + [(px_ + hr * 3.4, top_ + hr * 1.3), (px_ + hr * 4, top_ + hr * 2.4)] + quad((px_ + hr * 4, top_ + hr * 2.4), (px_ + hr * 2, top_ + hr * 1.7), (px_, top_ + hr * 2.2))
        elif fl == 'straight':
            flag = quad((px_, top_), (px_ + hr * 2, top_ - hr * 0.5), (px_ + hr * 3.6, top_)) + quad((px_ + hr * 3.6, top_ + hr * 2.6), (px_ + hr * 2, top_ + hr * 2.1), (px_, top_ + hr * 2.6))
        else:
            flag = quad((px_, top_), (px_ + hr * 2.5, top_ - hr * 0.2), (px_ + hr * 5, top_ + hr * 1.0)) + quad((px_ + hr * 5, top_ + hr * 1.0), (px_ + hr * 2.5, top_ + hr * 1.4), (px_, top_ + hr * 2.0))
        S.cloth(flag, '#2f5fb8', '#6f9fe8', folds=3, bevel=0.6 * s, grad=(0, 0, 1, 0))
        S.plasma(flag + [flag[0]], 0.2 * s, '#fff3c4', 0.45, core=None, flicker=False)
        S.sun(px_ + hr * 1.6, top_ + hr * 1.0, 1.5 * s, '#ffd98a', rays=6)
        S.add('#ffffff', 2 * np.exp(-np.hypot(X - px_, Y - top_) ** 2 / (0.8 * s) ** 2))
    elif item == 'orb':
        S.sun(hand[0], hand[1] - hr * 0.4, 2.8 * s, S.p['glow'], rays=10)


def _lance(S, hand, ang, hr, s):
    """A sun-lance: a shaft of white metal banded in gold, a wrapped grip, a swept guard, and a long leaf
    of hard light for a blade, a ridge of fire down its middle."""
    a = np.radians(ang)
    dx, dy = np.cos(a), np.sin(a)
    nx, ny = -dy, dx
    P = lambda u, v: (hand[0] + (dx * u + nx * v) * hr, hand[1] + (dy * u + ny * v) * hr)
    r = 0.36 * s
    S.tube([P(-2.1, 0), P(2.75, 0)], r, '#6a6458', '#fbf8f0', shine=1.0, power=30)
    for u in (-1.9, -0.9, 1.2, 2.45):
        S.tube([P(u - 0.07, 0), P(u + 0.07, 0)], r * 1.35, '#5a3a0e', '#ffe3a0', shine=1.4)
    S.tube([P(-0.5, 0), P(0.55, 0)], r * 1.12, '#2a1c12', '#8a6a48', shine=0.3, power=10)
    for u in np.linspace(-0.45, 0.5, 7):
        S.tube([P(u, -0.08), P(u + 0.06, 0.08)], r * 0.25, '#1a120a', '#5a4630', shine=0.1)
    S.gold([P(-2.1, -0.12), P(-2.55, 0), P(-2.1, 0.12)], bevel=0.2 * s)
    S.gold([P(2.7, -0.1), P(2.55, -0.7), P(2.95, -0.32), P(3.05, 0), P(2.95, 0.32), P(2.55, 0.7), P(2.7, 0.1)], bevel=0.25 * s)
    blade = quad(P(3.0, 0), P(3.6, -0.55), P(5.0, 0)) + quad(P(5.0, 0), P(3.6, 0.55), P(3.0, 0))
    S.glow(*P(3.9, 0), hr * 1.1, '#fff3c4', 0.55)
    S.energy(blade, '#ffe7a8', 1.0, rim=1.5, fill=0.5, bevel=0.35 * s)
    S.plasma([P(3.05, 0), P(4.85, 0)], 0.16 * s, '#ffd98a', 1.0, core='#ffffff', flicker=False, taper=0.7)
    S.add('#ffffff', 2.5 * np.exp(-((X - P(5.0, 0)[0]) ** 2 + (Y - P(5.0, 0)[1]) ** 2) / (0.5 * s) ** 2))


def mini(S, x, y, s, cloak='#ffd98a', back=True, lance=False, kneel=False, seed=0):
    """A far-off Aureline, a few pixels high: a dark robed shape, rim-lit, under a small bright head and halo."""
    g = np.random.default_rng(int(x * 97 + y * 13) + seed)
    hr = 7.5 * s
    h = hr * (2.6 if kneel else 4.8) * g.uniform(0.85, 1.1)
    w = hr * g.uniform(1.1, 1.5) * (1.25 if kneel else 1.0)
    lean = g.uniform(-0.25, 0.25) * hr
    body = cubic((x - w * 0.45, y + hr * 0.8), (x - w * 0.9, y + h * 0.45), (x - w * 1.0 + lean, y + h), (x + lean, y + h)) + cubic((x + lean, y + h), (x + w * 1.0 + lean, y + h), (x + w * 0.9, y + h * 0.45), (x + w * 0.45, y + hr * 0.8))
    m = poly_mask(body, 0.12 * s)
    S.over(col('#120e0c'), m * 0.9)
    # Rim light down the side facing the light, and a little glow through the cloth.
    rim = np.clip(m - gaussian_filter(m, max(0.4 * s * 6, 0.6)), 0, 1)
    S.add(cloak, rim * 2.0 + m * 0.08)
    d = np.hypot(X - x, Y - y) / (hr * 0.75)
    S.over(mix(cloak, '#fff1c8', 0.6) * 1.2, smooth(1.0, 0.8, d))
    S.glow(x, y, hr * 1.4, cloak, 0.25)
    e = np.sqrt(((X - x) / (hr * 1.5)) ** 2 + ((Y - (y - hr * 0.1)) / (hr * 0.4)) ** 2)
    S.add('#fff3c4', np.exp(-((e - 1) / 0.08) ** 2) * 0.6)
    if lance:
        S.tube([(x + w * 0.9, y + h * 0.9), (x + w * 1.1, y - hr * 3)], max(0.22 * s, 0.14), '#5a5448', '#fbf8f0', shine=0.6)
        S.add('#fff3c4', 2.5 * np.exp(-((X - (x + w * 1.12)) ** 2 + (Y - (y - hr * 3.3)) ** 2) / max(0.5 * s, 0.14) ** 2))
