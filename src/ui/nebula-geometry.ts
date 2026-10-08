/**
 * The campaign nebula's shape, worked out once per universe (seeded): see nebula3d.ts. Pure, so it can run
 * in a worker (nebula.worker.ts) off the page's thread.
 */

const SX = 2.2, SY = 1.15, SZ = 1.2;            // half-size of the volume (x across, y up, z toward the viewer)
const NX = 128, NZ = 72, NY = 42;               // the sampling grid (x, z per slice) and the number of slices
const LEVELS = [0.0, 0.55];                     // contour levels: the cloud's outline, and its denser core

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

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- the volume, and its schematic ----------

export interface Geometry {
  lines: Float32Array;   // x, y, z, lit, weight per vertex (pairs make segments)
  dots: Float32Array;    // x, y, z, size, weight per dot
}

export function buildNebula(seed: number): Geometry {
  const { fbm, rnd } = makeNoise(seed);
  // Pillars: columns rising from the bank toward the light, leaning a little, with dense knots at their heads.
  const count = 3 + Math.floor(rnd() * 2);
  const pillars = Array.from({ length: count }, (_, i) => ({
    x: -SX * 0.75 + (i + 0.3 + rnd() * 0.4) * ((SX * 1.5) / count),
    z: (rnd() - 0.6) * SZ * 0.9,
    top: 0.05 + rnd() * 0.55,
    r: 0.10 + rnd() * 0.08,
    lean: (rnd() - 0.5) * 0.5,
  }));
  const density = (x: number, y: number, z: number) => {
    // Fold space through slow noise so the gas billows and tears rather than sitting in round blobs.
    const wx = fbm(x * 0.7, y * 0.7, z * 0.7, 3) * 0.55;
    const wy = fbm(x * 0.7 + 31, y * 0.7, z * 0.7, 3) * 0.35;
    const wz = fbm(x * 0.7, y * 0.7 + 47, z * 0.7, 3) * 0.55;
    const px = x + wx, py = y + wy, pz = z + wz;
    const n = fbm(px * 1.15, py * 1.15, pz * 1.15, 4);
    // The cloud bank: dense below a ragged top that rises and falls across the strip.
    const top = -0.5 + 0.75 * fbm(px * 0.55, 3.3, pz * 0.55, 3) + 0.16 * Math.sin(px * 1.3 + 0.8) + 0.12 * Math.sin(pz * 2.1 - px * 0.7);
    let d = smooth(0.12, -0.18, py - top) * 1.3;
    // The pillars, narrowing as they rise, with a knot at the head.
    for (const p of pillars) {
      const cx = p.x + p.lean * (py - top), r = p.r * (1 + 0.9 * Math.max(0, p.top - py));
      const dist = Math.hypot(px - cx, (pz - p.z) * 0.9);
      const body = smooth(r * 1.1, r * 0.4, dist) * smooth(p.top + 0.05, p.top - 0.08, py);
      const knot = smooth(r * 1.7, r * 0.5, Math.hypot(px - (p.x + p.lean * (p.top - top)), py - p.top, (pz - p.z) * 0.9));
      d = Math.max(d, body * 1.2, knot * 1.5);
    }
    // Thin veils high up, torn into filaments.
    const veil = Math.max(0, 1 - Math.abs(fbm(px * 0.9 + 70, py * 1.6, pz * 0.9, 3)) * 5) * smooth(0.6, 0.25, Math.abs(py - 0.5)) * 0.62;
    // Fade out toward the volume's edges, so it has no box to it.
    const edge = smooth(1, 0.62, Math.hypot(x / SX, z / SZ) + 0.18 * fbm(x * 0.8 + 11, 0, z * 0.8, 2)) * smooth(SY, SY * 0.8, Math.abs(y));
    return (Math.max(d, veil) - 0.5 + n * 0.55) * edge - (1 - edge) * 0.6;
  };

  // Sample the grid, slice by slice from the top, carrying the light down each column as it is absorbed.
  const field = new Float32Array(NY * NZ * NX);
  const light = new Float32Array(NY * NZ * NX);
  const sun = new Float32Array(NZ * NX).fill(1);
  const X = (i: number) => -SX + (2 * SX * i) / (NX - 1);
  const Z = (k: number) => -SZ + (2 * SZ * k) / (NZ - 1);
  const Y = (j: number) => SY - (2 * SY * j) / (NY - 1);
  const dy = (2 * SY) / (NY - 1);
  for (let j = 0; j < NY; j++) {
    const y = Y(j);
    for (let k = 0; k < NZ; k++) {
      for (let i = 0; i < NX; i++) {
        const at = (j * NZ + k) * NX + i;
        const d = density(X(i), y, Z(k));
        field[at] = d;
        light[at] = sun[k * NX + i];
        sun[k * NX + i] *= Math.exp(-Math.max(0, d + 0.15) * dy * 6);
      }
    }
  }

  // Trace each slice's contours (marching squares, with the crossing points interpolated).
  const lines: number[] = [];
  const at = (j: number, k: number, i: number) => (j * NZ + k) * NX + i;
  for (let j = 1; j < NY - 1; j++) {
    const y = Y(j);
    for (let L = 0; L < LEVELS.length; L++) {
      const iso = LEVELS[L];
      const weight = L === 0 ? 0.45 : 1;
      for (let k = 0; k < NZ - 1; k++) {
        for (let i = 0; i < NX - 1; i++) {
          const a = field[at(j, k, i)] - iso, b = field[at(j, k, i + 1)] - iso;
          const c = field[at(j, k + 1, i + 1)] - iso, d = field[at(j, k + 1, i)] - iso;
          const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
          if (code === 0 || code === 15) continue;
          const x0 = X(i), x1 = X(i + 1), z0 = Z(k), z1 = Z(k + 1);
          const t = (p: number, q: number) => p / (p - q);
          // Crossing points on the four edges: bottom (a-b), right (b-c), top (d-c), left (a-d).
          const e = [
            () => [x0 + (x1 - x0) * t(a, b), z0],
            () => [x1, z0 + (z1 - z0) * t(b, c)],
            () => [x0 + (x1 - x0) * t(d, c), z1],
            () => [x0, z0 + (z1 - z0) * t(a, d)],
          ];
          const pairs = SEGMENTS[code];
          // Only the dense cores catch the light in gold; the thin outer gas stays ink.
          const lit = L === 0 ? 0 : light[at(j, k, i)];
          for (let s = 0; s < pairs.length; s += 2) {
            const [p, q] = [e[pairs[s]](), e[pairs[s + 1]]()];
            lines.push(p[0], y, p[1], lit, weight, q[0], y, q[1], lit, weight);
          }
        }
      }
    }
  }

  // Dust: dots scattered through the gas, thicker where it is denser; and a dotted floor grid beneath.
  const dots: number[] = [];
  for (let n = 0; n < 45000 && dots.length < 20000 * 5; n++) {
    const x = (rnd() * 2 - 1) * SX, y = (rnd() * 2 - 1) * SY, z = (rnd() * 2 - 1) * SZ;
    const d = density(x, y, z);
    if (rnd() < smooth(-0.15, 0.35, d) * 0.9) dots.push(x, y, z, 1 + rnd() * 1.2, 0.5 + 0.5 * smooth(-0.2, 0.6, d));
  }
  const floor = -SY - 0.08;
  for (let x = -SX * 1.3; x <= SX * 1.3 + 1e-6; x += 0.1) for (let z = -SZ * 1.2; z <= SZ * 1.2 + 1e-6; z += 0.1) dots.push(x, floor, z, 1.6, -0.35);
  // Far stars, and a few bright ones marked with a cross as on a chart.
  for (let n = 0; n < 500; n++) {
    const a = rnd() * Math.PI * 2, b = (rnd() - 0.3) * 1.2, r = 9 + rnd() * 3;
    dots.push(Math.cos(a) * Math.cos(b) * r, Math.sin(b) * r, Math.sin(a) * Math.cos(b) * r, 1 + rnd() * 1.5, -0.6);
  }
  for (let n = 0; n < 10; n++) {
    const x = (rnd() * 2 - 1) * SX * 1.1, y = (rnd() * 2 - 1) * SY, z = (rnd() * 2 - 1) * SZ, l = 0.02 + rnd() * 0.02;
    lines.push(x - l, y, z, 2, 1, x + l, y, z, 2, 1, x, y - l, z, 2, 1, x, y + l, z, 2, 1);
  }
  return { lines: new Float32Array(lines), dots: new Float32Array(dots) };
}

/** Marching squares: for each corner pattern, the pairs of edges its contour runs between. */
const SEGMENTS: number[][] = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [3, 2], [0, 2], [0, 1, 2, 3], [1, 2], [3, 1], [0, 1], [3, 0], []];

