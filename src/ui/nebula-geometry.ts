/**
 * The campaign nebula's shape, worked out once per universe (seeded): see nebula3d.ts. Pure, so it can run
 * in a worker (nebula.worker.ts) off the page's thread.
 *
 * Modelled on a reference sculpt (a smooth, low-frequency monochrome nebula): a few separate sculptural forms set
 * round the strip with open space between them, each a big rounded bulb with a tapering arm reaching off it.
 * The forms are soft overlapping blobs (metaballs) melted smoothly together and meshed with surface nets
 * (normals from the field); no fine billows. How the surface is lit and drawn is nebula3d.ts's.
 */

// The box the gas is meshed in, and the size of the cells it is meshed with.
const BX = 4.1, BY = 2.0, BZ = 3.4, CELL = 0.07;

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

/** The strip of systems the gas is cleared round: its systems and routes (world x, z, on the plane y = 0). */
export interface Strip {
  nodes: [number, number][];
  routes: [number, number, number, number][];
}

export function buildNebula(seed: number, strip: Strip = { nodes: [], routes: [] }): Geometry {
  const { fbm, rnd } = makeNoise(seed);
  const blobs: Blob[] = [];
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const puff = (x: number, y: number, z: number, r: number, free = 0) => blobs.push({ x, y, z, r, free });
  // A tapering arm of overlapping lobes from one point to another (r0 at its root, r1 at its tip).
  const arm = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, free = 0) => {
    const n = Math.max(4, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / (Math.min(r0, r1) * 0.45)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, sway = Math.sin(t * Math.PI) * 0.12;
      puff(ax + (bx - ax) * t, ay + (by - ay) * t + sway, az + (bz - az) * t, r0 + (r1 - r0) * t, free * t);
    }
  };
  // Modelled on the reference: separate, smooth sculptural forms, each a big rounded bulb with a tapering arm
  // reaching off it, set round the strip with open space between them. Three or four behind it, rising high; two
  // beneath it; one off each end, curling toward the near side.
  const form = (x: number, y: number, z: number, r: number) => {
    puff(x, y, z, r);
    puff(x + range(-0.3, 0.3) * r, y - r * 0.45, z + range(-0.2, 0.2) * r, r * 0.8);
    const a = range(0, Math.PI * 2), len = r * range(1.6, 2.4);
    arm(x, y, z, x + Math.cos(a) * len, y + range(-0.2, 0.5) * r, z + Math.sin(a) * len * 0.5, r * 0.8, r * 0.45, 0.4);
  };
  const behind = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < behind; i++) form(-2.7 + ((i + range(0.3, 0.7)) / behind) * 5.4, range(-0.45, 0.0), range(-2.3, -1.8), range(0.5, 0.72));
  for (let i = 0; i < 2; i++) form(i ? range(0.6, 1.8) : range(-1.8, -0.6), range(-1.35, -1.05), range(-0.8, 0.2), range(0.45, 0.6));
  for (const side of [-1, 1]) form(side * range(3.2, 3.6), range(-0.6, -0.2), range(-0.6, 0.4), range(0.45, 0.6));

  // Channels through the gas where the strip runs: a tube round each route and a hollow round each system,
  // so the lines of light and the stars are seen from above, and hidden only by gas rising between them and the eye.
  const clearing = (x: number, y: number, z: number) => {
    if (Math.abs(y) > 0.55) return 0;
    let d2 = Infinity;
    for (const [ax, az, bx, bz] of strip.routes) {
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      d2 = Math.min(d2, ((x - ax - vx * t) ** 2 + (z - az - vz * t) ** 2) / (0.13 * 0.13));
    }
    for (const [nx, nz] of strip.nodes) d2 = Math.min(d2, ((x - nx) ** 2 + (z - nz) ** 2) / (0.2 * 0.2));
    return 1.2 * Math.exp(-(d2 + (y * y) / (0.16 * 0.16)));
  };

  // The blobs binned in a coarse grid, each in every bin its reach touches, so a point only weighs those near it.
  const BIN = 0.5;
  const bins = new Map<number, Blob[]>();
  const key = (i: number, j: number, k: number) => ((i + 64) * 128 + (j + 64)) * 128 + (k + 64);
  for (const b of blobs) {
    const reach = b.r * Math.sqrt(6);
    for (let i = Math.floor((b.x - reach) / BIN); i <= Math.floor((b.x + reach) / BIN); i++)
      for (let j = Math.floor((b.y - reach) / BIN); j <= Math.floor((b.y + reach) / BIN); j++)
        for (let k = Math.floor((b.z - reach) / BIN); k <= Math.floor((b.z + reach) / BIN); k++) {
          const at = key(i, j, k);
          const list = bins.get(at);
          if (list) list.push(b);
          else bins.set(at, [b]);
        }
  }
  const none: Blob[] = [];

  // The field: positive inside the gas. Each blob falls off smoothly, and they melt together where they meet.
  const field = (x: number, y: number, z: number) => {
    const wx = x + fbm(x * 0.5, y * 0.5, z * 0.5, 1) * 0.25;
    const wy = y + fbm(x * 0.5 + 31, y * 0.5, z * 0.5, 1) * 0.25;
    const wz = z + fbm(x * 0.5, y * 0.5 + 47, z * 0.5, 1) * 0.25;
    const near = bins.get(key(Math.floor(wx / BIN), Math.floor(wy / BIN), Math.floor(wz / BIN))) ?? none;
    // (Nothing near: well outside the gas, with no need for the finer noise.)
    if (!near.length) return -0.3;
    let sum = 0;
    for (const b of near) {
      const d2 = ((wx - b.x) ** 2 + (wy - b.y) ** 2 + (wz - b.z) ** 2) / (b.r * b.r);
      if (d2 < 6) sum += Math.exp(-d2 * 1.6);
    }
    // Billows on billows: a little finer noise heaps the surface like cumulus (only near the surface: deep
    // inside or well outside, it changes nothing).
    // (Smooth and low-frequency, like a sculpted form: no fine billows.)
    return sum - 0.35 - clearing(x, y, z);
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
  for (let n = 0; n < 0; n++) {
    const x = range(-BX, BX), y = range(-BY * 0.8, BY), z = range(-BZ, BZ);
    const v = field(x, y, z);
    if (v < 0 && v > -0.18 && rnd() < 0.5) motes.push(x, y, z, rnd(), range(1.2, 2.6));
  }
  return { mesh: new Float32Array(mesh), motes: new Float32Array(motes) };
}
