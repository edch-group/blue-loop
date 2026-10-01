/**
 * The campaign map's sky: the heart of the Milky Way, painted in Blue Loop's
 * white style, and kept very quiet: on near-white paper, the faintest off-white
 * mottling marks the band, the core is white light, fine pale-grey filaments
 * trace its dust lanes, and its stars are tiny pale points. Nothing should
 * compete with the systems on the map.
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
  // Painted large, so its detail stays fine and crisp when it is scaled to the screen.
  const W = 2600;
  const H = 1600;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  let seed = 20260930;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;

  // Paper: nearly white.
  ctx.fillStyle = '#fbfbfb';
  ctx.fillRect(0, 0, W, H);

  // The band: a gentle arch from lower left to upper right, its core just right of centre, fading out well before the edges.
  const core = { x: W * 0.55, y: H * 0.52 };
  const angle = (-22 * Math.PI) / 180;
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: -along.y, y: along.x };
  /** A point on the band: t along it (−1 … 1), d across it (in px), bending slightly like an arch. */
  const at = (t: number, d: number) => {
    const bend = -t * t * 140;
    const len = W * 0.42;
    return { x: core.x + along.x * t * len + across.x * (d + bend), y: core.y + along.y * t * len + across.y * (d + bend) };
  };
  /** How strongly the band shows at t: full at the core, gone by its ends. */
  const strength = (t: number) => Math.max(0, 1 - Math.abs(t)) ** 1.4;
  const blob = (x: number, y: number, r: number, grey: number, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${grey},${grey},${grey + 3},${alpha})`);
    g.addColorStop(1, `rgba(${grey},${grey},${grey + 3},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // The faintest veil of off-white along the band, so it reads as a band at all.
  for (let i = 0; i < 160; i++) {
    const t = gauss() * 0.9;
    const k = strength(t);
    if (!k) continue;
    const p = at(t, gauss() * 120);
    blob(p.x, p.y, 90 + rand() * 140, 236, 0.1 * k);
  }
  // Star clouds: small knots of a slightly deeper off-white, the band's mottling.
  for (let i = 0; i < 1400; i++) {
    const t = gauss() * 0.85;
    const k = strength(t);
    if (!k) continue;
    const p = at(t, gauss() * (60 + k * 70));
    blob(p.x, p.y, 6 + rand() * 22, 230, (0.05 + rand() * 0.08) * k);
  }
  // The core: white light, with its bulge just defined against the band.
  blob(core.x, core.y, 200, 255, 0.95);
  blob(core.x, core.y, 90, 255, 1);

  // Dust lanes: fine, crisp filaments of pale grey, wandering along the band (a random walk each) and branching now and then.
  const lane = (t0: number, d0: number, steps: number) => {
    let t = t0;
    let d = d0;
    let drift = 0;
    for (let i = 0; i < steps; i++) {
      t += 0.0016;
      drift += gauss() * 0.7;
      drift *= 0.9;
      d += drift;
      const k = strength(t);
      if (t > 1) return;
      if (!k) continue;
      const p = at(t, d);
      blob(p.x + gauss() * 1.5, p.y + gauss() * 1.5, 1.5 + rand() * 3.5 + k * 3, 214, (0.05 + rand() * 0.07) * k);
      if (rand() < 0.008 && steps > 100) lane(t, d, Math.floor(steps * 0.3));
    }
  };
  for (let l = 0; l < 5; l++) lane(-1 + rand() * 0.2, gauss() * 26, 1200);

  // Very faint gradients come out dithered (a 1px checkerboard), which turns into a dot lattice once the
  // image is scaled down. Soften the clouds and dust by a pixel to smooth it out, then add the stars, crisp.
  const soft = document.createElement('canvas');
  soft.width = W;
  soft.height = H;
  const sctx = soft.getContext('2d')!;
  sctx.filter = 'blur(1.6px)';
  sctx.drawImage(canvas, 0, 0);
  ctx.drawImage(soft, 0, 0);

  // Stars: tiny, crisp pale-grey points, densest along the band.
  for (let i = 0; i < 26000; i++) {
    const onBand = rand() < 0.75;
    const t = gauss() * 0.9;
    const p = onBand ? at(t, gauss() * (70 + strength(t) * 90)) : { x: rand() * W, y: rand() * H };
    if (onBand && !strength(t)) continue;
    ctx.fillStyle = `rgba(150,152,158,${0.05 + rand() * (onBand ? 0.22 : 0.14)})`;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), rand() < 0.9 ? 1 : 2, 1 + (rand() < 0.1 ? 1 : 0));
  }
  // A few brighter ones: a tiny point with the faintest cross.
  for (let i = 0; i < 40; i++) {
    const x = Math.round(rand() * W);
    const y = Math.round(rand() * H);
    ctx.fillStyle = 'rgba(160,162,170,0.12)';
    ctx.fillRect(x - 5, y, 11, 1);
    ctx.fillRect(x, y - 5, 1, 11);
    ctx.fillStyle = 'rgba(150,152,160,0.45)';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  cached = canvas.toDataURL('image/jpeg', 0.86);
  return cached;
}
