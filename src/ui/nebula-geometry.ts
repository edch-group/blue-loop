/**
 * The campaign nebula's shape, worked out once per universe (seeded): see nebula3d.ts. Pure, so it can run
 * in a worker (nebula.worker.ts) off the page's thread.
 *
 * (The strip of systems lies on the plane y = 0, over the cloud bank: the gas is kept below it across the
 * strip's footprint, and the pillars stand behind it.)
 *
 * The gas is cut into a dozen horizontal layers and built up like a laser-cut contour model: each layer a
 * solid slab, its top face filled, its side walls shaded by the way they face the light, and one outline
 * round its top edge. Opaque, so the nearer layers hide what lies behind them.
 */

const SX = 3.0, SY = 1.0, SZ = 1.6;            // half-size of the volume (x across, y up, z toward the viewer)
const NX = 112, NZ = 64;                        // the sampling grid of each layer
const LAYERS = 13;                              // how many layers the gas is cut into
const ISO = 0;                                  // the gas's surface

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

export interface Geometry {
  /** Triangles: x, y, z, tone, kind per vertex (tone: how light the surface is, 0 to 1; kind: 0 a flat face, drawn as
   * the board's dotted paper, 1 a wall). */
  faces: Float32Array;
  /** Line segments: x, y, z per vertex, in pairs. */
  lines: Float32Array;
}

/** The strip of systems the gas is kept clear of: its systems and routes (world x, z, on the plane y = 0). */
export interface Strip {
  nodes: [number, number][];
  routes: [number, number, number, number][];
}

export function buildNebula(seed: number, strip: Strip = { nodes: [], routes: [] }): Geometry {
  // The strip's footprint on the plane, a little padded: the gas stays below the plane there.
  const xs = strip.nodes.map((n) => n[0]), zs = strip.nodes.map((n) => n[1]);
  const foot = xs.length ? [Math.min(...xs) - 0.3, Math.max(...xs) + 0.3, Math.min(...zs) - 0.3, Math.max(...zs) + 0.3] : [0, 0, 0, 0];
  const { fbm, rnd } = makeNoise(seed);
  // A few broad pillars rising out of the bank toward the light, leaning a little, with knots at their heads.
  const count = 2 + Math.floor(rnd() * 2);
  const pillars = Array.from({ length: count }, (_, i) => ({
    x: -SX * 0.55 + (i + 0.25 + rnd() * 0.5) * ((SX * 1.1) / count),
    z: (rnd() - 0.65) * SZ * 0.7,
    top: 0.35 + rnd() * 0.5,
    r: 0.16 + rnd() * 0.08,
    lean: (rnd() - 0.5) * 0.4,
  }));
  const density = (x: number, y: number, z: number) => {
    // Space folded through slow noise, so the shapes billow rather than sitting as plain blobs.
    const px = x + fbm(x * 0.6, y * 0.6, z * 0.6, 2) * 0.45;
    const pz = z + fbm(x * 0.6, y * 0.6 + 47, z * 0.6, 2) * 0.45;
    // The bank: solid below a top that rises and falls in a few broad swells.
    const top = -0.45 + 0.6 * fbm(px * 0.5, 3.3, pz * 0.5, 2) + 0.15 * Math.sin(px * 1.2 + 0.8);
    let d = (top - y) * 2.2;
    for (const p of pillars) {
      const base = -0.35;
      const cx = p.x + p.lean * (y - base);
      const r = p.r * (1 + 0.6 * Math.max(0, (p.top - y) / (p.top - base)));
      const body = (r - Math.hypot(px - cx, (pz - p.z) * 0.9)) * 4 - Math.max(0, y - p.top) * 8;
      const knot = (p.r * 1.45 - Math.hypot(px - (p.x + p.lean * (p.top - base)), (y - p.top) * 1.3, (pz - p.z) * 0.9)) * 4;
      d = Math.max(d, body, knot);
    }
    // Frayed a little at the edges, and rounded off toward the volume's rim (no box to it).
    const rim = Math.hypot(x / SX, z / SZ) + 0.15 * fbm(x + 11, 0, z, 2);
    const g = d + fbm(px * 1.1, y * 1.1, pz * 1.1, 3) * 0.5 - smooth(0.6, 1, rim) * 3;
    // Over the strip's footprint, nothing above just under its plane.
    const inFoot = smooth(foot[0] - 0.15, foot[0] + 0.15, x) * smooth(foot[1] + 0.15, foot[1] - 0.15, x) * smooth(foot[2] - 0.15, foot[2] + 0.15, z) * smooth(foot[3] + 0.15, foot[3] - 0.15, z);
    return g - inFoot * smooth(-0.3, -0.12, y) * 6;
  };

  const X = (i: number) => -SX + (2 * SX * i) / (NX - 1);
  const Z = (k: number) => -SZ + (2 * SZ * k) / (NZ - 1);
  const dy = (2 * SY) / LAYERS;
  const faces: number[] = [];
  const lines: number[] = [];
  const field = new Float32Array(NZ * NX);
  // The light comes from above and to one side: walls facing it are lit, the rest shaded.
  const lx = 0.55, lz = 0.35;
  for (let j = 0; j < LAYERS; j++) {
    const y = SY - (j + 0.5) * dy;
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) field[k * NX + i] = density(X(i), y, Z(k)) - ISO;
    // Higher layers are lighter, as if lit from above.
    const plate = 0.72 + 0.28 * (1 - j / (LAYERS - 1));
    for (let k = 0; k < NZ - 1; k++) {
      for (let i = 0; i < NX - 1; i++) {
        const a = field[k * NX + i], b = field[k * NX + i + 1], c = field[(k + 1) * NX + i + 1], d = field[(k + 1) * NX + i];
        const inside = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (!inside) continue;
        const x0 = X(i), x1 = X(i + 1), z0 = Z(k), z1 = Z(k + 1);
        const cross = (p: number, q: number) => p / (p - q);
        // The part of this cell inside the gas: its corners that are in, and where its edges cross out.
        const corners: [number, number, number][] = [[x0, z0, a], [x1, z0, b], [x1, z1, c], [x0, z1, d]];
        const poly: number[][] = [];
        const edges: number[][] = [];
        for (let e = 0; e < 4; e++) {
          const [px, pz, pv] = corners[e], [qx, qz, qv] = corners[(e + 1) % 4];
          if (pv > 0) poly.push([px, pz]);
          if (pv > 0 !== qv > 0) {
            const t = cross(pv, qv);
            const pt = [px + (qx - px) * t, pz + (qz - pz) * t];
            poly.push(pt);
            edges.push(pt);
          }
        }
        for (let n = 1; n + 1 < poly.length; n++) {
          faces.push(poly[0][0], y, poly[0][1], plate, 0, poly[n][0], y, poly[n][1], plate, 0, poly[n + 1][0], y, poly[n + 1][1], plate, 0);
        }
        // The layer's edge through this cell: its outline, and its wall down to the layer below.
        for (let n = 0; n + 1 < edges.length; n += 2) {
          const [p, q] = [edges[n], edges[n + 1]];
          lines.push(p[0], y, p[1], q[0], y, q[1]);
          // The wall faces out of the gas: away from where the field rises.
          const gx = b - a + c - d, gz = d - a + c - b;
          const gl = Math.hypot(gx, gz) || 1;
          const lit = Math.max(0, (-gx * lx - gz * lz) / gl);
          const wall = 0.5 + 0.38 * lit - 0.1 * (j / LAYERS);
          const yb = y - dy;
          faces.push(p[0], y, p[1], wall, 1, q[0], y, q[1], wall, 1, q[0], yb, q[1], wall, 1, p[0], y, p[1], wall, 1, q[0], yb, q[1], wall, 1, p[0], yb, p[1], wall, 1);
        }
      }
    }
  }
  return { faces: new Float32Array(faces), lines: new Float32Array(lines) };
}
