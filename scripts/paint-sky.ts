/**
 * The campaign map's sky: the heart of the Milky Way, painted in Blue Loop's
 * white style. It is the photograph turned inside out: on pale paper, the
 * galactic band is a warm cream-and-gold glow crossing the sky, its dust
 * lanes soft taupe filaments, its edges a lavender-blue haze, and its stars
 * tiny slate specks, densest along the band, with a few brighter blue ones.
 *
 * Painted on a canvas, deterministically (the same sky every time). Painting
 * takes about half a second, too slow to do on a phone each time the campaign
 * opens, so it is painted once and shipped as src/assets/campaign-sky.jpg.
 * After changing this file, regenerate it with `npm run sky`
 * (scripts/render-sky.mjs; needs playwright-core and a Chromium).
 */

let cached: string | null = null;

/** A data URL of the painted sky (painted on first use). */
export function galaxyImage(): string {
  if (cached) return cached;
  const W = 1800;
  const H = 1100;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  let seed = 20260930;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;

  // Paper.
  const paper = ctx.createLinearGradient(0, 0, 0, H);
  paper.addColorStop(0, '#fcfbf8');
  paper.addColorStop(1, '#f1efe9');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // The band: a gentle arc from lower left to upper right, its core just right of centre.
  const core = { x: W * 0.54, y: H * 0.54 };
  const angle = (-24 * Math.PI) / 180;
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: -along.y, y: along.x };
  /** A point on the band: t along it (−1 … 1), d across it (in px), bending slightly like an arch. */
  const at = (t: number, d: number) => {
    const bend = -t * t * 170;
    const len = W * 0.72;
    return { x: core.x + along.x * t * len + across.x * (d + bend), y: core.y + along.y * t * len + across.y * (d + bend) };
  };
  const blob = (x: number, y: number, r: number, colour: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${colour},${alpha})`);
    g.addColorStop(1, `rgba(${colour},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // Outer haze: lavender and blue, wide and very faint.
  for (let i = 0; i < 220; i++) {
    const t = rand() * 2.3 - 1.15;
    const p = at(t, gauss() * 300);
    blob(p.x, p.y, 160 + rand() * 240, rand() < 0.5 ? '186,194,232' : '204,190,232', 0.018 + rand() * 0.02);
  }
  // Star clouds: the band is clumps of light, not a smooth tube. Each cloud is a knot of small soft blobs.
  for (let c = 0; c < 140; c++) {
    const t = rand() * 2.1 - 1.05;
    const near = 1 - Math.min(1, Math.abs(t) * 1.05);
    const centre = at(t, gauss() * (60 + near * 70));
    const size = 30 + rand() * 70 + near * 50;
    const warm = rand() < 0.35 + near * 0.5;
    for (let k = 0; k < 14; k++) {
      blob(centre.x + gauss() * size, centre.y + gauss() * size * 0.7, 18 + rand() * size * 0.8, warm ? '240,212,168' : '220,212,238', (0.03 + near * 0.05) * (0.6 + rand()));
    }
  }
  // The core: a soft bulge of warm white light, gold at its rim.
  for (let i = 0; i < 60; i++) {
    const p = at(gauss() * 0.14, gauss() * 60);
    blob(p.x, p.y, 60 + rand() * 120, rand() < 0.55 ? '244,214,160' : '252,238,208', 0.07 + rand() * 0.06);
  }
  blob(core.x, core.y, 240, '255,250,238', 0.6);
  blob(core.x, core.y, 110, '255,255,250', 0.55);

  // Dust lanes: fine taupe filaments wandering along the band (a random walk each), branching now and then, darkest near the core.
  const lane = (t0: number, d0: number, steps: number, dir: number) => {
    let t = t0;
    let d = d0;
    let drift = 0;
    for (let i = 0; i < steps; i++) {
      t += dir * 0.0026;
      drift += gauss() * 1.4;
      drift *= 0.9;
      d += drift;
      if (Math.abs(t) > 1.05) return;
      const near = 1 - Math.min(1, Math.abs(t));
      const p = at(t, d);
      // Lanes swell and thin as they go, like smoke.
      const r = (5 + rand() * 12 + near * 10) * (0.6 + 0.5 * Math.sin(i * 0.05 + t0 * 7) ** 2);
      blob(p.x + gauss() * r * 0.6, p.y + gauss() * r * 0.6, r, rand() < 0.75 ? '150,132,118' : '128,118,132', (0.014 + near * 0.028) * (0.5 + rand()));
      if (rand() < 0.012 && steps > 60) lane(t, d, Math.floor(steps * 0.25), dir);
    }
  };
  for (let l = 0; l < 4; l++) lane(-1.05 + rand() * 0.3, gauss() * 40, 760 + Math.floor(rand() * 80), 1);
  // A few dark clouds near the core.
  for (let i = 0; i < 40; i++) {
    const p = at(gauss() * 0.4, gauss() * 55);
    blob(p.x, p.y, 14 + rand() * 34, '150,132,118', 0.02 + rand() * 0.03);
  }

  // Stars: tiny slate specks, densest along the band.
  for (let i = 0; i < 11000; i++) {
    const onBand = rand() < 0.65;
    const p = onBand ? at(rand() * 2.2 - 1.1, gauss() * 170) : { x: rand() * W, y: rand() * H };
    const r = 0.3 + rand() ** 4 * 1.1;
    ctx.fillStyle = `rgba(${rand() < 0.7 ? '96,106,132' : '142,124,112'},${0.14 + rand() * 0.4})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A few bright ones: a small blue-white glint with fine spikes.
  for (let i = 0; i < 45; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 0.9 + rand() * 1.3;
    const tint = rand() < 0.75 ? '122,150,226' : '226,168,122';
    blob(x, y, r * 4.5, tint, 0.22);
    ctx.strokeStyle = `rgba(${tint},0.35)`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - r * 5, y);
    ctx.lineTo(x + r * 5, y);
    ctx.moveTo(x, y - r * 5);
    ctx.lineTo(x, y + r * 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${tint},0.7)`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  cached = canvas.toDataURL('image/jpeg', 0.86);
  return cached;
}
