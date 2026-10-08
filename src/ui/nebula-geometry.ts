/**
 * The campaign nebula's shape, worked out once per universe (seeded): see nebula3d.ts. Pure, so it can run
 * in a worker (nebula.worker.ts) off the page's thread.
 *
 * Not a solid: loose clusters of gas. A few filaments curve through the space, and clumps of gas are strung
 * along them (with a few strays between); each clump is drawn as a stipple of fine dots, thick at its heart
 * and thinning out, torn by noise so it never closes into a round cloud, and a few soft washes give it body.
 * The strip's routes and systems are kept clear.
 */

// The space the gas fills.
const BX = 2.7, BY = 1.1, BZ = 1.3;

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
  /** The stipple: x, y, z, size, tone (0 ink, 1 gold), phase (0 to 1), per dot. */
  dots: Float32Array;
  /** The soft washes: x, y, z, size (world units), tint (0 slate, 1 gold, 2 blue), phase. */
  haze: Float32Array;
}

export function buildNebula(seed: number, strip: Strip = { nodes: [], routes: [] }): Geometry {
  const { fbm, rnd } = makeNoise(seed);
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const gauss = () => {
    let u = 0;
    while (u === 0) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };

  // Kept clear: a tube round each route and a hollow round each system, near the plane they lie on.
  const clear = (x: number, y: number, z: number) => {
    if (Math.abs(y) > 0.2) return false;
    for (const [nx, nz] of strip.nodes) if ((x - nx) ** 2 + (z - nz) ** 2 < 0.16 * 0.16) return true;
    for (const [ax, az, bx, bz] of strip.routes) {
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      if ((x - ax - vx * t) ** 2 + (z - az - vz * t) ** 2 < 0.09 * 0.09) return true;
    }
    return false;
  };

  // The clumps: strung along a few filaments that curve through the space, and a few strays.
  const clumps: { x: number; y: number; z: number; r: number; weight: number }[] = [];
  const filaments = 5 + Math.floor(rnd() * 3);
  for (let f = 0; f < filaments; f++) {
    let x = range(-BX * 0.9, BX * 0.9), y = range(-0.6, 0.6), z = range(-BZ * 0.8, BZ * 0.6);
    let a = range(0, Math.PI * 2), b = range(-0.4, 0.4);
    const steps = 6 + Math.floor(rnd() * 8);
    for (let i = 0; i < steps; i++) {
      clumps.push({ x, y, z, r: range(0.12, 0.32), weight: range(0.5, 1) });
      a += range(-0.6, 0.6);
      b = Math.max(-0.6, Math.min(0.6, b + range(-0.3, 0.3)));
      const step = range(0.18, 0.32);
      x += Math.cos(a) * Math.cos(b) * step * 1.4;
      y += Math.sin(b) * step * 0.6;
      z += Math.sin(a) * Math.cos(b) * step * 0.7;
      if (Math.abs(x) > BX || Math.abs(y) > BY || Math.abs(z) > BZ) break;
    }
  }
  for (let i = 0; i < 10; i++) clumps.push({ x: range(-BX, BX), y: range(-0.8, 0.8), z: range(-BZ, BZ), r: range(0.06, 0.14), weight: range(0.3, 0.6) });

  // The stipple: each clump a scatter of dots, dense at its heart and thinning out, kept only where the noise
  // lets it (so the clump is torn and open, never a round ball). A few dots catch the light, in gold.
  const dots: number[] = [];
  for (const c of clumps) {
    const n = Math.round(c.weight * 900 * (c.r / 0.22) ** 2);
    for (let i = 0; i < n; i++) {
      const x = c.x + gauss() * c.r, y = c.y + gauss() * c.r * 0.7, z = c.z + gauss() * c.r;
      if (fbm(x * 2.2 + 5, y * 2.2, z * 2.2, 3) < -0.05 + rnd() * 0.25 || clear(x, y, z)) continue;
      dots.push(x, y, z, range(1.1, 2.3), rnd() < 0.05 ? 1 : 0, rnd());
    }
  }
  // Dust between the clumps: thin, everywhere.
  for (let i = 0; i < 900; i++) {
    const x = range(-BX, BX), y = range(-BY * 0.8, BY), z = range(-BZ, BZ);
    if (!clear(x, y, z)) dots.push(x, y, z, range(0.9, 1.6), 0, rnd());
  }

  // The washes: a few soft blots on each clump, mostly slate, now and then catching gold or blue.
  const haze: number[] = [];
  for (const c of clumps) {
    const n = 1 + Math.floor(c.weight * 3);
    for (let i = 0; i < n; i++) {
      const x = c.x + gauss() * c.r * 0.6, y = c.y + gauss() * c.r * 0.4, z = c.z + gauss() * c.r * 0.6;
      if (clear(x, y, z)) continue;
      const roll = rnd();
      haze.push(x, y, z, c.r * range(1.6, 2.6), roll < 0.12 ? 1 : roll < 0.24 ? 2 : 0, rnd());
    }
  }
  return { dots: new Float32Array(dots), haze: new Float32Array(haze) };
}
