/**
 * The campaign nebula's shape, worked out once per universe (seeded): see nebula3d.ts. Pure, so it can run
 * in a worker (nebula.worker.ts) off the page's thread.
 *
 * The gas is a field of soft overlapping blobs (metaballs): a loose body of a few billows with one or two
 * rounded pillars rising out of it, and plumes of displaced gas drifting free around it, all folded a little
 * by slow noise. Its surface is meshed smoothly (surface nets, with normals from the field), and motes of
 * dust are scattered round it. How the surface is drawn (paper, contour lines, shimmer) is nebula3d.ts's.
 */

// The box the gas is meshed in, and the size of the cells it is meshed with.
const BX = 2.6, BY = 1.35, BZ = 1.5, CELL = 0.045;

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

export interface Geometry {
  /** Triangles: x, y, z, normal x, y, z, and how free the gas there is to drift (0 the body, 1 a loose plume). */
  mesh: Float32Array;
  /** Dust motes: x, y, z, phase (0 to 1), size. */
  motes: Float32Array;
}

interface Blob { x: number; y: number; z: number; r: number; free: number }

export function buildNebula(seed: number): Geometry {
  const { fbm, rnd } = makeNoise(seed);
  const blobs: Blob[] = [];
  const range = (a: number, b: number) => a + rnd() * (b - a);
  // The body: puffs heaped along a loose, wandering spine, so it billows like a cloud rather than a hill.
  const puffs = 48 + Math.floor(rnd() * 10);
  for (let i = 0; i < puffs; i++) {
    const t = rnd() - 0.5;
    const spine = { x: t * 2.6, y: -0.25 + 0.18 * Math.sin(t * 5 + seed) - Math.abs(t) * 0.35, z: 0.25 * Math.sin(t * 3.7 + seed * 0.3) };
    const r = range(0.15, 0.33) * (1 - Math.abs(t) * 0.6);
    blobs.push({ x: spine.x + range(-0.22, 0.22), y: spine.y + range(-0.2, 0.25), z: spine.z + range(-0.32, 0.32), r, free: 0 });
  }
  // One or two pillars: a column of shrinking puffs rising and leaning, with a rounder head.
  const pillars = 1 + Math.floor(rnd() * 2);
  for (let p = 0; p < pillars; p++) {
    let x = range(-0.9, 0.9), z = range(-0.3, 0.2), y = -0.05;
    const lean = range(-0.1, 0.1), steps = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < steps; i++) {
      blobs.push({ x: x + range(-0.05, 0.05), y, z, r: 0.24 - i * 0.018, free: (i / steps) * 0.3 });
      x += lean + range(-0.04, 0.04);
      y += 0.14;
      z += range(-0.03, 0.03);
    }
    blobs.push({ x, y: y + 0.02, z, r: 0.2, free: 0.35 });
  }
  // Wisps of displaced gas streaming off the body: trails of ever smaller puffs, freer the further they go.
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    let x = Math.cos(a) * 1.05, y = range(-0.4, 0.35), z = Math.sin(a) * 0.5;
    const dx = Math.cos(a) * 0.17, dy = range(0.0, 0.08), dz = Math.sin(a) * 0.09;
    const len = 3 + Math.floor(rnd() * 4);
    for (let n = 0; n < len; n++) {
      x += dx + range(-0.05, 0.05); y += dy + range(-0.04, 0.04); z += dz + range(-0.04, 0.04);
      blobs.push({ x, y, z, r: 0.13 * (1 - n / (len + 1)) + 0.03, free: 0.4 + (0.6 * n) / len });
    }
  }
  // And a few loose puffs, far out on their own.
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, out = range(1.7, 2.2);
    blobs.push({ x: Math.cos(a) * out * 1.1, y: range(-0.3, 0.7), z: Math.sin(a) * out * 0.55, r: range(0.06, 0.11), free: 1 });
  }

  // The field: positive inside the gas. Each blob falls off smoothly, and they melt together where they meet.
  const field = (x: number, y: number, z: number) => {
    const wx = x + fbm(x * 0.8, y * 0.8, z * 0.8, 2) * 0.22;
    const wy = y + fbm(x * 0.8 + 31, y * 0.8, z * 0.8, 2) * 0.22;
    const wz = z + fbm(x * 0.8, y * 0.8 + 47, z * 0.8, 2) * 0.22;
    let sum = 0;
    for (const b of blobs) {
      const d2 = ((wx - b.x) ** 2 + (wy - b.y) ** 2 + (wz - b.z) ** 2) / (b.r * b.r);
      if (d2 < 6) sum += Math.exp(-d2 * 2.8);
    }
    // Billows on billows: a little finer noise heaps the surface like cumulus.
    return sum - 0.2 + fbm(wx * 2.6, wy * 2.6, wz * 2.6, 3) * 0.16;
  };
  const freeAt = (x: number, y: number, z: number) => {
    let best = 0, near = Infinity;
    for (const b of blobs) {
      const d = Math.hypot(x - b.x, y - b.y, z - b.z) / b.r;
      if (d < near) {
        near = d;
        best = b.free;
      }
    }
    return best;
  };

  // Surface nets: one vertex in each cell the surface passes through (at the average of where it crosses
  // the cell's edges), and a quad across each grid edge it crosses, joining the four cells round that edge.
  const nx = Math.ceil((2 * BX) / CELL) + 1, ny = Math.ceil((2 * BY) / CELL) + 1, nz = Math.ceil((2 * BZ) / CELL) + 1;
  const P = (i: number, b: number) => -b + i * CELL;
  const f = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[id(i, j, k)] = field(P(i, BX), P(j, BY), P(k, BZ));
  const vert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i: number, j: number, k: number) => (k * (ny - 1) + j) * (nx - 1) + i;
  const vx: number[] = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const c: number[] = [];
        for (let n = 0; n < 8; n++) c.push(f[id(i + (n & 1), j + ((n >> 1) & 1), k + ((n >> 2) & 1))]);
        const ins = c.filter((v) => v > 0).length;
        if (ins === 0 || ins === 8) continue;
        let sx = 0, sy = 0, sz = 0, m = 0;
        for (const [a, b] of EDGES) {
          if (c[a] > 0 === c[b] > 0) continue;
          const t = c[a] / (c[a] - c[b]);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          m++;
        }
        vert[cid(i, j, k)] = vx.length / 3;
        vx.push(P(i, BX) + (sx / m) * CELL, P(j, BY) + (sy / m) * CELL, P(k, BZ) + (sz / m) * CELL);
      }
    }
  }
  // Each vertex's normal (pointing out of the gas) and how free the gas there is.
  const count = vx.length / 3;
  const nrm = new Float32Array(count * 3), free = new Float32Array(count);
  const e = CELL * 0.5;
  for (let v = 0; v < count; v++) {
    const [x, y, z] = [vx[v * 3], vx[v * 3 + 1], vx[v * 3 + 2]];
    let gx = field(x - e, y, z) - field(x + e, y, z), gy = field(x, y - e, z) - field(x, y + e, z), gz = field(x, y, z - e) - field(x, y, z + e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[v * 3] = gx / l; nrm[v * 3 + 1] = gy / l; nrm[v * 3 + 2] = gz / l;
    free[v] = freeAt(x, y, z);
  }
  const mesh: number[] = [];
  const put = (v: number) => mesh.push(vx[v * 3], vx[v * 3 + 1], vx[v * 3 + 2], nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2], free[v]);
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    put(a); put(b); put(c); put(a); put(c); put(d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const here = f[id(i, j, k)] > 0;
        // The edge to the next point along x, y and z: where the surface crosses it, join the cells round it.
        if (i < nx - 1 && here !== f[id(i + 1, j, k)] > 0)
          quad(vert[cid(i, j - 1, k - 1)], vert[cid(i, j, k - 1)], vert[cid(i, j, k)], vert[cid(i, j - 1, k)], here);
        if (j < ny - 1 && here !== f[id(i, j + 1, k)] > 0)
          quad(vert[cid(i - 1, j, k - 1)], vert[cid(i - 1, j, k)], vert[cid(i, j, k)], vert[cid(i, j, k - 1)], here);
        if (k < nz - 1 && here !== f[id(i, j, k + 1)] > 0)
          quad(vert[cid(i - 1, j - 1, k)], vert[cid(i, j - 1, k)], vert[cid(i, j, k)], vert[cid(i - 1, j, k)], here);
      }
    }
  }

  // Motes of dust hanging round the gas, thickest near its surface.
  const motes: number[] = [];
  for (let n = 0; n < 4000 && motes.length < 420 * 5; n++) {
    const x = range(-BX, BX), y = range(-BY * 0.8, BY), z = range(-BZ, BZ);
    const v = field(x, y, z);
    if (v < 0 && v > -0.18 && rnd() < 0.5) motes.push(x, y, z, rnd(), range(1.2, 2.6));
  }
  return { mesh: new Float32Array(mesh), motes: new Float32Array(motes) };
}
