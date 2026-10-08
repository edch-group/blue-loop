"""
The campaign map's sky: a nebula rendered as a real volume, lit by a star.

Two things fill the volume. Glowing gas (domain-warped spectral fBm, so it billows and tears in wisps and
filaments like the real thing) gives off light where the star reaches it. Dark dust, heaped in a few great
clouds, swallows the light behind it. The star sits above and to one side; its light boils away the thin dust
it reaches, so what is left stands in the shadow of the densest knots: columns pointing back at the star, as
in the Pillars of Creation, their tips and edges glowing where the light eats into them. The volume is seen
from the front with perspective (far slices smaller and fainter) and composited back to front.

Deterministic (seeded). Run: python3 scripts/paint_nebula.py [--preview] [--dark]
Writes src/assets/campaign-sky.webp (or --out).
"""
import argparse, time
import numpy as np
from scipy import fft, ndimage
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--preview', action='store_true', help='a quick small render')
ap.add_argument('--dark', action='store_true', help='as a photograph of space, not on the paper')
ap.add_argument('--seed', type=int, default=11)
ap.add_argument('--out', default='src/assets/campaign-sky.webp')
args = ap.parse_args()

W, H, D = (480, 300, 64) if args.preview else (1280, 800, 128)
OUT_W, OUT_H = (960, 600) if args.preview else (2560, 1600)
rng = np.random.default_rng(args.seed)
t0 = time.time()


def log(msg):
    print(f'{time.time() - t0:6.1f}s  {msg}', flush=True)


def fbm(shape, beta, scale=1.0):
    """Gaussian noise with a power-law spectrum (amplitude ~ k^-beta), unit variance. `scale` stretches depth."""
    white = rng.standard_normal(shape, dtype=np.float32)
    spec = fft.rfftn(white, workers=-1)
    del white
    k2 = None
    for i, n in enumerate(shape):
        k = (fft.rfftfreq(n) if i == len(shape) - 1 else fft.fftfreq(n)).astype(np.float32) * (H if len(shape) == 3 else 1)
        if i == 0 and len(shape) == 3: k = k * scale
        sh = [1] * len(shape); sh[i] = -1
        k = (k.reshape(sh)) ** 2
        k2 = k if k2 is None else k2 + k
    spec *= np.maximum(k2, 1.0) ** (-beta / 2)
    del k2
    out = fft.irfftn(spec, s=shape, workers=-1).astype(np.float32)
    out -= out.mean(); out /= out.std() + 1e-9
    return out


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def warp(field, amount, beta=2.3):
    """Fold a field through a slow random displacement, so its blobs stretch into wisps."""
    sm = tuple(max(4, n // 4) for n in field.shape)
    wy = ndimage.zoom(fbm(sm, beta), 4, order=1)[:D, :H, :W] * (H * amount)
    wx = ndimage.zoom(fbm(sm, beta), 4, order=1)[:D, :H, :W] * (H * amount)
    zz, yy, xx = np.meshgrid(*(np.arange(n, dtype=np.float32) for n in field.shape), indexing='ij', sparse=True)
    return ndimage.map_coordinates(field, [np.broadcast_to(zz, field.shape), yy + wy, xx + wx], order=1, mode='mirror').astype(np.float32)


shape = (D, H, W)                 # z (depth, 0 nearest), y (0 top), x
log(f'grid {W}x{H}x{D}')
zz, yy, xx = np.meshgrid(np.arange(D, dtype=np.float32) / D, np.arange(H, dtype=np.float32) / H, np.arange(W, dtype=np.float32) / W, indexing='ij', sparse=True)
aspect = W / H

# --- Glowing gas: wisps everywhere, thickest in a broad lane across the middle. ---
g = warp(fbm(shape, 1.6, 2.0), 0.10)
g += 0.45 * (1 - 2 * np.abs(warp(fbm(shape, 1.45, 2.0), 0.05)))      # torn filaments
lane = np.exp(-((yy - 0.55 - 0.12 * np.sin(xx * 4.0 + 0.7)) / 0.42) ** 2)
gas = np.clip(g * 0.5 + lane * 1.1 - 0.55, 0, None) ** 1.4
gas *= 1 - 0.5 * zz
del g, lane
log('gas')

# --- Dust: a few great dark clouds, lumpy and torn. ---
n = warp(fbm(shape, 1.7, 1.5), 0.08)
heaps = np.zeros((1, H, W), np.float32)
for cx, cy, rx, ry in ((0.20, 0.95, 0.24, 0.55), (0.55, 1.05, 0.14, 0.45), (0.86, 0.90, 0.20, 0.50), (0.70, 0.10, 0.22, 0.14), (0.06, 0.12, 0.12, 0.18)):
    heaps = np.maximum(heaps, np.exp(-(((xx[0] - cx) / rx) ** 2 + ((yy[0] - cy) / ry) ** 2)))
# Pillars: tall columns rising from the dark bank at the bottom, leaning toward the star, with dense knots at
# their heads (what shields them).
for cx, top, w in ((0.30, 0.38, 0.035), (0.40, 0.50, 0.028), (0.74, 0.30, 0.04)):
    lean = (1 - yy[0]) * 0.18                   # lean right as they rise toward the star
    col = np.exp(-((xx[0] - cx - lean * 0 + (yy[0] - 1) * -0.18) / (w * (1 + 0.6 * (yy[0] - top)))) ** 2) * smoothstep(top - 0.02, top + 0.08, yy[0])
    knot = np.exp(-(((xx[0] - cx - (top - 1) * -0.18 + 0.0) / (w * 1.2)) ** 2 + ((yy[0] - top - 0.03) / 0.04) ** 2))
    heaps = np.maximum(heaps, np.maximum(col * 1.1, knot * 1.6))
dust = np.clip(n * 0.9 + heaps * 3.0 - 1.6 + 0.8 * np.exp(-((zz - 0.45) / 0.3) ** 2), 0, None)
del n, heaps
log('dust')

# --- The star's light, from above and to the right: march it down sheared columns. ---
SHEAR = -0.35                       # x moves this much per unit y as the light travels down
KAPPA = 0.35


def optical_depth(field):
    """The dust the light has crossed to reach each voxel, slice by slice along a slanted path."""
    out = np.empty_like(field)
    for z in range(D):
        # Shear the slice so the light runs straight down its columns, sum, shear back.
        m = np.array([[1, 0], [SHEAR, 1]], np.float32)
        s = ndimage.affine_transform(field[z], m, order=1, mode='nearest')
        c = np.cumsum(s, axis=0)
        out[z] = ndimage.affine_transform(c, np.array([[1, 0], [-SHEAR, 1]], np.float32), order=1, mode='nearest')
    # Light scatters a little sideways: soften the shadow edges so they don't streak.
    return ndimage.gaussian_filter(out, (0.8, 1.0, 1.6)) * KAPPA


# Photo-evaporation: thin dust in the light is boiled away; dense knots survive and shade columns behind them.
for i in range(3):
    tau = optical_depth(dust)
    dust *= 0.05 + 0.95 * smoothstep(1.2, 6.0, tau + dust * 3.0)
    log(f'erode {i + 1}')
tau = optical_depth(dust)
light = np.exp(-tau)
del tau
# The ionisation fronts: dust surfaces where the light is still strong.
# Only the skin of the dust glows: where it is dense enough to stop the light but the light has only just reached.
front = smoothstep(0.05, 0.6, dust) * light * (1 - light) * 4
log('lit')

# --- Seen from the front, with perspective, back to front. ---
if True:
    gas_col = np.array([[0.55, 0.32, 0.85], [0.95, 0.45, 0.30]], np.float32)   # violet to ember, by depth/height
    front_col = np.array([1.00, 0.72, 0.42], np.float32)
    dust_col = np.array([0.05, 0.03, 0.04], np.float32)
else:
    gas_col = np.array([[0.62, 0.66, 0.78], [0.72, 0.70, 0.74]], np.float32)   # slate wash
    front_col = np.array([1.0, 1.0, 1.0], np.float32)
    dust_col = np.array([0.42, 0.45, 0.54], np.float32)

acc = np.zeros((H, W, 3), np.float32)
vy, vx = H * 0.45, W * 0.5
for z in range(D - 1, -1, -1):
    s = 1 - 0.40 * z / D
    m = np.array([1 / s, 1 / s]); off = np.array([vy, vx]) * (1 - 1 / s)
    sl = lambda f: ndimage.affine_transform(f, m, off, order=1, mode='constant', cval=0)
    gz, dz, lz, fz = sl(gas[z]), sl(dust[z]), sl(light[z]), sl(front[z])
    fade = 1 - 0.6 * z / D
    mix = smoothstep(0.2, 0.8, yy[0] + 0.3 * np.sin(xx[0] * 6))[..., None]
    gc = gas_col[0] * (1 - mix) + gas_col[1] * mix
    emit = gz[..., None] * gc * (0.25 + 0.75 * lz[..., None]) * 0.10 * fade
    emit += fz[..., None] * front_col * 0.45 * fade
    a = (1 - np.exp(-dz * 0.9))[..., None]
    # Over: this slice's dust hides what lies behind; its own colour is its lit or shaded surface.
    surf = dust_col * (0.6 + 0.8 * lz[..., None])
    acc = acc * (1 - a) + a * surf + emit
log('composited')
del gas, dust, light, front

stars = np.zeros((H, W), np.float32)
k = int(W * H * 0.0015)
stars[rng.integers(0, H, k), rng.integers(0, W, k)] = rng.pareto(2.0, k).astype(np.float32) * 0.3
stars = ndimage.gaussian_filter(stars, 0.6) * 4
# A few bright stars with soft halos and four diffraction spikes, as a telescope sees them.
yy2, xx2 = np.mgrid[0:H, 0:W].astype(np.float32)
for _ in range(5):
    sy, sx = rng.uniform(0, H), rng.uniform(0, W); b = rng.uniform(0.4, 1.0)
    dy, dx = yy2 - sy, xx2 - sx
    r2 = dx * dx + dy * dy
    spike = (np.exp(-np.abs(dy) * 1.2) * np.exp(-np.abs(dx) / (H * 0.025)) + np.exp(-np.abs(dx) * 1.2) * np.exp(-np.abs(dy) / (H * 0.025)))
    stars += b * (np.exp(-r2 / 2.0) * 3 + np.exp(-r2 / (H * 0.02) ** 2) * 0.25 + spike * 0.5)
img = acc + stars[..., None] + np.array([0.01, 0.01, 0.02], np.float32)
img = 1 - np.exp(-img * 1.4)
if not args.dark:
    # On the paper: the photograph printed pale. Its light and shade are kept (bright gas is the paper's
    # white, the dust a soft slate), its colour mostly drained.
    paper = np.array([0.965, 0.961, 0.948], np.float32)
    lum = img @ np.array([0.3, 0.55, 0.15], np.float32)
    tone = img * 0.35 + lum[..., None] * 0.65
    img = paper * (0.66 + 0.34 * np.clip(tone * 1.25, 0, 1)) * np.array([0.985, 0.99, 1.0], np.float32)
img = np.clip(img, 0, 1)
Image.fromarray((img * 255 + 0.5).astype(np.uint8)).resize((OUT_W, OUT_H), Image.LANCZOS).save(args.out, quality=90)
log(f'wrote {args.out}')
