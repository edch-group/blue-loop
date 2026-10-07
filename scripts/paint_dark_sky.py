"""
The campaign map's sky: the heart of the Milky Way at night, painted as a
photograph would show it. A near-black sky; the galactic band running across
it, warm and dense at its bulging core and cooler towards its ends, torn by
dark dust lanes; faint glowing gas here and there; and stars by the tens of
thousands, packed into the band, a few bright ones with a soft halo.

Deterministic (seeded). Run: python3 scripts/paint_dark_sky.py
Writes src/assets/campaign-sky.webp.
"""
import numpy as np
from PIL import Image, ImageFilter

W, H = 2560, 1600
rng = np.random.default_rng(7)


def noise(scale, octaves=5, persistence=0.55):
    """Fractal value noise in [0, 1], by summing smoothly upscaled random grids."""
    out = np.zeros((H, W), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        gw = max(2, int(W / scale * 2 ** o))
        gh = max(2, int(H / scale * 2 ** o))
        grid = rng.random((gh, gw)).astype(np.float32)
        img = Image.fromarray((grid * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        out += amp * (np.asarray(img, np.float32) / 255)
        total += amp
        amp *= persistence
    out /= total
    return (out - out.min()) / (out.max() - out.min())


y, x = np.mgrid[0:H, 0:W].astype(np.float32)
# The band: a gentle diagonal across the sky.
angle = np.deg2rad(-18)
u = (x - W * 0.5) * np.cos(angle) - (y - H * 0.52) * np.sin(angle)  # along the band
v = (x - W * 0.5) * np.sin(angle) + (y - H * 0.52) * np.cos(angle)  # across it
wobble = (noise(900, 3) - 0.5) * 140
width = 230 + 120 * np.exp(-(u / 700) ** 2)  # bulging at the core
band = np.exp(-(((v + wobble) / width) ** 2))
core = np.exp(-((u / 520) ** 2 + ((v + wobble) / 260) ** 2))

clouds = noise(260, 7, 0.62)
fine = noise(40, 4, 0.7)
mottle = noise(18, 3, 0.7)
density = band * (0.25 + 0.75 * clouds ** 1.3) * (0.6 + 0.4 * fine) * (0.8 + 0.2 * mottle) + 0.9 * core * (0.6 + 0.4 * clouds)

# Dust lanes: dark filaments down the band's spine.
lanes = noise(180, 6)
rift = np.exp(-(((v + wobble * 0.6 - 30) / 70) ** 2)) * np.clip((lanes - 0.42) * 2.6, 0, 1)
filaments = np.clip((noise(110, 5) - 0.55) * 3.0, 0, 1) * band
dust = np.clip(rift * 0.85 + filaments * 0.55, 0, 0.92)
density *= 1 - dust

# Colour: deep blue-black sky; the band cool white, warming to gold-peach at the core.
sky = np.zeros((H, W, 3), np.float32)
sky[..., 0] = 0.012 + 0.010 * (y / H)
sky[..., 1] = 0.016 + 0.010 * (y / H)
sky[..., 2] = 0.034 + 0.016 * (y / H)
warm = np.clip(core * 1.4, 0, 1)[..., None]
cool = np.array([0.62, 0.70, 0.92], np.float32)
gold = np.array([1.00, 0.80, 0.58], np.float32)
tint = cool * (1 - warm) + gold * warm
glow = (density ** 1.35)[..., None] * 0.34
sky += glow * tint

# Faint gas: a magenta and a teal patch near the band.
for cx, cy, r, col, a in [(0.36, 0.43, 260, (0.85, 0.30, 0.55), 0.06), (0.66, 0.60, 300, (0.25, 0.55, 0.75), 0.05), (0.52, 0.47, 180, (0.95, 0.45, 0.35), 0.05)]:
    d = np.exp(-(((x - W * cx) ** 2 + (y - H * cy) ** 2) / (2 * r * r)))
    sky += (d * (0.4 + 0.6 * clouds) * a)[..., None] * np.array(col, np.float32)

# Stars: far more in the band. Colour by temperature.
temps = np.array([[0.70, 0.80, 1.00], [0.90, 0.94, 1.00], [1.00, 1.00, 1.00], [1.00, 0.93, 0.80], [1.00, 0.82, 0.62]], np.float32)
weights = np.array([0.12, 0.25, 0.30, 0.22, 0.11])
stars = np.zeros((H, W, 3), np.float32)
prob = 0.25 + 3.0 * band + 2.0 * core
prob /= prob.sum()
n = 150000
idx = rng.choice(H * W, size=n, p=prob.ravel())
sy, sx = np.divmod(idx, W)
bright = rng.exponential(0.16, n).astype(np.float32)
bright = np.clip(bright, 0, 1.2)
cols = temps[rng.choice(len(temps), size=n, p=weights)]
np.add.at(stars, (sy, sx), cols * bright[:, None])
stars_img = stars.copy()
# A slight bloom, so the brighter ones read as points of light, not pixels.
blur = np.stack([np.asarray(Image.fromarray(np.clip(stars[..., c] * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255 for c in range(3)], -1)
sky += stars_img * 0.85 + blur * 1.6

# A few bright stars with soft halos.
for _ in range(22):
    cx, cy = rng.random() * W, rng.random() * H
    col = temps[rng.integers(len(temps))]
    r = rng.uniform(1.4, 4.0)
    x0, x1 = int(max(0, cx - 60)), int(min(W, cx + 60))
    y0, y1 = int(max(0, cy - 60)), int(min(H, cy + 60))
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    halo = np.exp(-d2 / (2 * r * r)) * 0.9 + np.exp(-d2 / (2 * (r * 5) ** 2)) * 0.10
    sky[y0:y1, x0:x1] += halo[..., None] * col

# A faint vignette, and a gentle tone curve.
vig = 1 - 0.35 * (((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
sky *= np.clip(vig, 0.5, 1)[..., None]
sky = 1 - np.exp(-sky * 1.25)
img = Image.fromarray(np.clip(sky * 255, 0, 255).astype(np.uint8))
img.save('src/assets/campaign-sky.webp', quality=86, method=6)
print('wrote', img.size)
