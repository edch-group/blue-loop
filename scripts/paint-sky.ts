/**
 * The campaign map's sky: the heart of the Milky Way, in Blue Loop's white
 * style: the photograph, but high-key. The sky is a faint off-white, the band
 * lighter, glowing white at its bulging core and mottled with star clouds, its
 * dust lanes crisp channels of a slightly deeper off-white (a main rift down its
 * spine, finer filaments alongside), and its stars tiny white points packed
 * into the band. Every tone stays within a few percent of white, and the
 * detail is pixel-sharp, so it never competes with the systems.
 *
 * Painted pixel by pixel on a canvas, deterministically (the same sky every
 * time). It takes a few seconds, so it is painted once and shipped as
 * (No longer shipped: the map now uses scripts/paint_dark_sky.py for src/assets/campaign-sky.webp.) Formerly
 * `npm run sky` (scripts/render-sky.mjs; needs playwright-core and a Chromium).
 */

export const SKY_W = 2560;
export const SKY_H = 1600;

let cached: string | null = null;

/** A data URL of the painted sky (painted on first use). */
export function galaxyImage(): string {
  if (cached) return cached;
  const W = SKY_W;
  const H = SKY_H;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  let seed = 20261001;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  // Smooth value noise, and fractal sums of it.
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x: number, y: number, octaves: number) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * f, y * f);
      f *= 2.03;
      amp *= 0.5;
    }
    return sum / (1 - 0.5 ** octaves);
  };
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  // The band: a long gentle arch from lower left to upper right, across the whole sky; its core just right of centre.
  const core = { x: W * 0.54, y: H * 0.52 };
  const angle = (-20 * Math.PI) / 180;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const half = W * 0.62;

  const img = ctx.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Band coordinates: u along it (−1 … 1 across the sky), v across it (px), bent into an arch.
      const rx = x - core.x;
      const ry = y - core.y;
      const u = (rx * ca + ry * sa) / half;
      const au = Math.abs(u);
      const v = -rx * sa + ry * ca + u * u * 160;
      // The band swells at the core and tapers to its ends; its edges are ragged.
      const width = (150 + 260 * Math.exp(-u * u * 7)) * (0.8 + 0.4 * fbm(u * 4 + 7, v / 300 + 3, 3));
      const along = smooth(1.3, 0.55, au);
      const profile = Math.exp(-((v / width) ** 2)) * along;
      const bulge = Math.exp(-((rx / 380) ** 2 + (ry / 250) ** 2));
      // Star clouds: bright knots and patches within the band.
      const cloud = fbm(x / 170, y / 170, 5);
      const clump = smooth(0.2, 0.9, cloud);
      // Dust: a main rift down the band's spine, wandering and splitting, plus finer filaments that run with the band.
      const spine = (fbm(u * 3.2 + 11, 0.5, 4) - 0.5) * 120;
      const riftW = (16 + 46 * Math.exp(-u * u * 5)) * (0.6 + 0.8 * fbm(u * 7 + 2, 1.5, 3));
      const rift = smooth(1, 0.55, Math.abs(v - spine) / riftW) * smooth(1.05, 0.5, au) * (1 - bulge * 0.55);
      const ridge = 1 - Math.abs(2 * fbm(u * 10 + (v / 90) * 0.3, v / 60, 5) - 1);
      const lanes = smooth(0.8, 0.92, ridge) * Math.exp(-((v / (width * 0.7)) ** 2)) * along;
      const dust = Math.min(1, rift + lanes * 0.75);

      // Tones, all within a few percent of white: off-white sky, a lighter band, a white core, deeper dust.
      let tone = 248.5 + profile * (3 + 4 * clump) + bulge * 6 - dust * (3 + 8 * profile);
      // Stars: tiny white points, packed in the band's clouds, missing in the dust; faint grey ones scattered for grain.
      const density = profile * (0.25 + clump) * (1 - dust) + bulge * 0.6;
      const r = rand();
      if (r < Math.min(0.3, density * 0.22)) tone = Math.max(tone, 253 + rand() * 2);
      else if (r > 0.9993) tone -= 10 + rand() * 25;
      const i = (y * W + x) * 4;
      // Dither: so few tones would show as terraces, so a little noise turns them into smooth gradients.
      const t = Math.max(0, Math.min(255, Math.round(tone + rand() - 0.5)));
      px[i] = t;
      px[i + 1] = t;
      px[i + 2] = Math.min(255, t + 1.5);
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // A handful of brighter stars: a white point in a faint grey ring, some with the faintest cross.
  for (let n = 0; n < 80; n++) {
    const x = Math.round(rand() * W);
    const y = Math.round(rand() * H);
    const big = rand() < 0.35;
    ctx.fillStyle = 'rgba(170,172,180,0.18)';
    ctx.fillRect(x - 2, y - 2, 5, 5);
    if (big) {
      ctx.fillStyle = 'rgba(170,172,180,0.12)';
      ctx.fillRect(x - 7, y, 15, 1);
      ctx.fillRect(x, y - 7, 1, 15);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  cached = canvas.toDataURL('image/webp', 0.9);
  return cached;
}
