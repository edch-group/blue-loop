/**
 * The campaign nebula's shape, worked out once per universe (seeded): see nebula3d.ts. Pure, so it can run
 * in a worker (nebula.worker.ts) off the page's thread.
 *
 * Kept minimal, in the board's own language: a few loose clusters of gas, each a handful of overlapping bubbles
 * (paper discs drawn round with a fine ink circle, as the board's rings are), a big one at the heart and smaller
 * ones drifting off it, and a light sprinkle of dust. Nothing sits on the strip's routes or systems.
 */

// The space the gas fills.
const BX = 2.7, BZ = 1.3;

// ---------- noise (seeded value noise, fBm) ----------

function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256).map(() => rnd() * 2 - 1);
  const h = (x: number, y: number, z: number) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const a = h(xi, yi, zi) + (h(xi + 1, yi, zi) - h(xi, yi, zi)) * u;
    const b = h(xi, yi + 1, zi) + (h(xi + 1, yi + 1, zi) - h(xi, yi + 1, zi)) * u;
    const c = h(xi, yi, zi + 1) + (h(xi + 1, yi, zi + 1) - h(xi, yi, zi + 1)) * u;
    const d = h(xi, yi + 1, zi + 1) + (h(xi + 1, yi + 1, zi + 1) - h(xi, yi + 1, zi + 1)) * u;
    const e = a + (b - a) * v, f = c + (d - c) * v;
    return e + (f - e) * w;
  };
  const fbm = (x: number, y: number, z: number, oct: number) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 5.7);
      amp *= 0.5;
      f *= 2.03;
    }
    return sum;
  };
  return { fbm, rnd };
}

/** The strip of systems the gas is kept clear of: its systems and routes (world x, z, on the plane y = 0). */
export interface Strip {
  nodes: [number, number][];
  routes: [number, number, number, number][];
}

export interface Geometry {
  /** The bubbles: x, y, z, radius (world units), gold (0 or 1: a rim that catches the light), phase (0 to 1). */
  bubbles: Float32Array;
  /** The dust: x, y, z, size (pixels), phase. */
  dots: Float32Array;
}

export function buildNebula(seed: number, strip: Strip = { nodes: [], routes: [] }): Geometry {
  const { rnd } = makeNoise(seed);
  const range = (a: number, b: number) => a + rnd() * (b - a);
  // How near the strip a point is (world units across the plane, from its nearest route or system).
  const nearStrip = (x: number, z: number) => {
    let d = Infinity;
    for (const [nx, nz] of strip.nodes) d = Math.min(d, Math.hypot(x - nx, z - nz));
    for (const [ax, az, bx, bz] of strip.routes) {
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    return d;
  };
  // A bubble is kept off the strip: if it would cut through the plane over a route or system, it is lifted
  // (or sunk) clear of it.
  const place = (x: number, y: number, z: number, r: number): number => {
    const gap = nearStrip(x, z) - 0.07;
    if (gap >= r) return y;
    const need = Math.sqrt(Math.max(0, r * r - Math.max(0, gap) ** 2)) + 0.05;
    return Math.abs(y) >= need ? y : (y >= 0 ? 1 : -1) * need;
  };

  const bubbles: number[] = [];
  const dots: number[] = [];
  const clusters = 5 + Math.floor(rnd() * 2);
  for (let c = 0; c < clusters; c++) {
    // Spread along the strip, behind it or below it, so the strip itself is clear from where the camera starts
    // (they come between the eye and it only as the camera is turned round).
    const cx = -BX * 0.8 + ((c + range(0.2, 0.8)) / clusters) * BX * 1.6;
    const behind = rnd() < 0.65;
    const cy = behind ? range(-0.35, 0.5) : range(-0.95, -0.55);
    const cz = behind ? range(-BZ, -0.75) : range(-0.5, 0.4);
    const heart = range(0.2, 0.32);
    const count = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i++) {
      // The heart, then smaller bubbles drifting off it, each a little further and smaller.
      const r = i === 0 ? heart : heart * range(0.3, 0.75) * (1 - i * 0.06);
      const a = range(0, Math.PI * 2), e = range(-0.6, 0.6), out = i === 0 ? 0 : heart * range(0.7, 1.5) + r * 0.6;
      const x = cx + Math.cos(a) * Math.cos(e) * out, z = cz + Math.sin(a) * Math.cos(e) * out * 0.8;
      const y = place(x, cy + Math.sin(e) * out * 0.7, z, r);
      bubbles.push(x, y, z, r, rnd() < 0.18 ? 1 : 0, rnd());
    }
    // A little dust about each cluster.
    for (let i = 0; i < 22; i++) {
      const a = range(0, Math.PI * 2), e = range(-1, 1), out = heart * range(1.2, 2.8);
      dots.push(cx + Math.cos(a) * out, cy + e * out * 0.5, cz + Math.sin(a) * out * 0.7, range(1.4, 2.4), rnd());
    }
  }
  return { bubbles: new Float32Array(bubbles), dots: new Float32Array(dots) };
}
