/**
 * The campaign's landscape, worked out once per universe (seeded): see nebula3d.ts. Pure, so it can run in a
 * worker (nebula.worker.ts) off the page's thread.
 *
 * A mesh landscape like a sea: a heightfield of long rolling swells and smaller waves on them, low in a shallow
 * trough where the strip of systems lies (the strip floats just over it, on the plane y = 0), rising a little
 * away from it, most behind (never peaks). The ground is cut in advance into shards (a jittered
 * grid of cells, each triangle given to the cell its middle falls in), each triangle carrying its own corners,
 * which of its edges lie on a shard's border, and its shard's middle: so when instability comes, the ground can
 * crack along those borders and the shards break away and fall (nebula3d.ts).
 *
 * Over it hang a scattering of stars, most in ink, a few in colour.
 */

// The ground's extent (x across, z toward the viewer) and the size of its mesh's cells.
const X0 = -7, X1 = 7, Z0 = -5.5, Z1 = 4, CELL = 0.11;
// The shards' size.
const SHARD = 0.42;

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
  const h = (x: number, y: number) => val[perm[perm[x & 255] + (y & 255)]];
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
    const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
  const fbm = (x: number, y: number, oct: number) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise(x * f + i * 17.3, y * f - i * 9.1);
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

/** The strip of systems the land lies low under: its systems and routes (world x, z, on the plane y = 0). */
export interface Strip {
  nodes: [number, number][];
  routes: [number, number, number, number][];
}

export interface Geometry {
  /**
   * The ground, as triangles, 16 floats a corner: position (3), normal (3), barycentric (3), whether each edge
   * (opposite each corner) is a shard's border (3), and its shard's middle and a random number (4).
   */
  ground: Float32Array;
  /** The stars over it: x, y, z, size, hue (0 ink; 1 gold, 2 rose, 3 sea blue), phase. */
  stars: Float32Array;
}

export const GROUND_STRIDE = 16;

export function buildNebula(seed: number, strip: Strip = { nodes: [], routes: [] }): Geometry {
  const { fbm, rnd } = makeNoise(seed);
  const range = (a: number, b: number) => a + rnd() * (b - a);
  // The strip's footprint, a little padded: the land lies low there.
  const xs = strip.nodes.map((n) => n[0]), zs = strip.nodes.map((n) => n[1]);
  const fx0 = xs.length ? Math.min(...xs) - 0.35 : -2.4, fx1 = xs.length ? Math.max(...xs) + 0.35 : 2.4;
  const fz0 = zs.length ? Math.min(...zs) - 0.35 : -0.6, fz1 = zs.length ? Math.max(...zs) + 0.35 : 0.6;

  const height = (x: number, z: number) => {
    // How far outside the footprint (0 inside it).
    const dx = Math.max(fx0 - x, 0, x - fx1), dzBack = Math.max(fz0 - z, 0), dzFront = Math.max(z - fz1, 0);
    const out = Math.hypot(dx, dzBack, dzFront);
    // Rolling, like a sea: long swells and smaller waves on them, a little higher away from the strip (most
    // behind it), and never peaks.
    const swell = Math.sin(x * 0.55 + z * 0.25 + fbm(x * 0.2, z * 0.2, 2) * 3) * 0.5 + 0.5;
    const waves = fbm(x * 0.45 + 3, z * 0.6, 4);
    const rise = smooth(0, 1.2, out) * (0.35 + 0.35 * Math.min(1, dzBack / 2));
    return -0.32 + 0.05 * fbm(x * 1.3, z * 1.3, 2) + rise * (swell * 0.7 + waves * 0.6);
  };

  // The heights on the grid, and normals from them.
  const nx = Math.round((X1 - X0) / CELL) + 1, nz = Math.round((Z1 - Z0) / CELL) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = height(X0 + i * CELL, Z0 + j * CELL);
  const at = (i: number, j: number) => H[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  const normal = (i: number, j: number) => {
    const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL);
    const l = Math.hypot(gx, 1, gz);
    return [-gx / l, 1 / l, -gz / l];
  };

  // The shards: a jittered grid of seeds; each point belongs to its nearest.
  const sx = Math.ceil((X1 - X0) / SHARD) + 2, sz = Math.ceil((Z1 - Z0) / SHARD) + 2;
  const seeds = new Float32Array(sx * sz * 3);
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sx; i++) {
      const k = (j * sx + i) * 3;
      seeds[k] = X0 + (i - 0.5 + range(0.1, 0.9)) * SHARD;
      seeds[k + 1] = Z0 + (j - 0.5 + range(0.1, 0.9)) * SHARD;
      seeds[k + 2] = rnd();
    }
  const shardOf = (x: number, z: number) => {
    const ci = Math.floor((x - X0) / SHARD + 0.5), cj = Math.floor((z - Z0) / SHARD + 0.5);
    let best = 0, bd = Infinity;
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || j < 0 || i >= sx || j >= sz) continue;
        const k = j * sx + i;
        const d = (seeds[k * 3] - x) ** 2 + (seeds[k * 3 + 1] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    return best;
  };
  // Each quad's two triangles (A: 00, 10, 11; B: 00, 11, 01), and the shard each belongs to.
  const qx = nx - 1, qz = nz - 1;
  const tri = new Int32Array(qx * qz * 2);
  for (let j = 0; j < qz; j++)
    for (let i = 0; i < qx; i++) {
      const x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL;
      tri[(j * qx + i) * 2] = shardOf(x + CELL * 0.17, z - CELL * 0.17);
      tri[(j * qx + i) * 2 + 1] = shardOf(x - CELL * 0.17, z + CELL * 0.17);
    }
  const shard = (i: number, j: number, t: number) => (i < 0 || j < 0 || i >= qx || j >= qz ? -1 : tri[(j * qx + i) * 2 + t]);

  const ground = new Float32Array(qx * qz * 6 * GROUND_STRIDE);
  let o = 0;
  const corner = (i: number, j: number, bary: number[], edges: number[], s: number) => {
    const n = normal(i, j);
    const sxw = seeds[s * 3], szw = seeds[s * 3 + 1];
    ground.set([X0 + i * CELL, at(i, j), Z0 + j * CELL, n[0], n[1], n[2], bary[0], bary[1], bary[2], edges[0], edges[1], edges[2], sxw, height(sxw, szw), szw, seeds[s * 3 + 2]], o);
    o += GROUND_STRIDE;
  };
  for (let j = 0; j < qz; j++)
    for (let i = 0; i < qx; i++) {
      const a = shard(i, j, 0), b = shard(i, j, 1);
      // A's edges, opposite each corner: 00 faces 10-11 (the quad to the right's B), 10 faces 11-00 (B), 11 faces
      // 00-10 (the quad below's B).
      const ea = [+(shard(i + 1, j, 1) !== a), +(b !== a), +(shard(i, j - 1, 1) !== a)];
      corner(i, j, [1, 0, 0], ea, a);
      corner(i + 1, j, [0, 1, 0], ea, a);
      corner(i + 1, j + 1, [0, 0, 1], ea, a);
      // B's edges: 00 faces 11-01 (the quad above's A), 11 faces 01-00 (the quad to the left's A), 01 faces 00-11 (A).
      const eb = [+(shard(i, j + 1, 0) !== b), +(shard(i - 1, j, 0) !== b), +(a !== b)];
      corner(i, j, [1, 0, 0], eb, b);
      corner(i + 1, j + 1, [0, 1, 0], eb, b);
      corner(i, j + 1, [0, 0, 1], eb, b);
    }

  // Stars over the land, mostly behind the strip and above the mountains: most in ink, a few in colour.
  const stars: number[] = [];
  for (let n = 0; n < 340; n++) {
    const x = range(-9, 9), z = range(-9, 1.5), y = range(0.4, 4.5);
    if (y < height(x, z) + 0.3) continue;
    const roll = rnd();
    stars.push(x, y, z, range(1.2, 3.2), roll < 0.08 ? 1 : roll < 0.13 ? 2 : roll < 0.18 ? 3 : 0, rnd());
  }
  return { ground, stars: new Float32Array(stars) };
}
