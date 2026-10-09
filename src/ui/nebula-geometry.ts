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

  const nx = Math.round((X1 - X0) / CELL) + 1, nz = Math.round((Z1 - Z0) / CELL) + 1;

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
  // A shard's reach, warped a little by smooth noise so its borders curve gently rather than run dead straight.
  const warp = (x: number, z: number): [number, number] => [x + 0.09 * fbm(x * 2.2 + 11, z * 2.2, 2), z + 0.09 * fbm(x * 2.2, z * 2.2 - 7, 2)];
  const distTo = (k: number, x: number, z: number) => {
    const [wx, wz] = warp(x, z);
    return (seeds[k * 3] - wx) ** 2 + (seeds[k * 3 + 1] - wz) ** 2;
  };
  const shardOf = (x: number, z: number) => {
    const [wx, wz] = warp(x, z);
    const ci = Math.floor((wx - X0) / SHARD + 0.5), cj = Math.floor((wz - Z0) / SHARD + 0.5);
    let best = 0, bd = Infinity;
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || j < 0 || i >= sx || j >= sz) continue;
        const k = j * sx + i;
        const d = (seeds[k * 3] - wx) ** 2 + (seeds[k * 3 + 1] - wz) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    return best;
  };
  // Each point's height and normal (worked out once: most points are shared by six triangles).
  const memo = new Map<string, number[]>();
  const surface = (x: number, z: number) => {
    const key = `${x.toFixed(5)},${z.toFixed(5)}`;
    let v = memo.get(key);
    if (!v) {
      const e = CELL * 0.5;
      const gx = (height(x + e, z) - height(x - e, z)) / (2 * e), gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
      const l = Math.hypot(gx, 1, gz);
      v = [height(x, z), -gx / l, 1 / l, -gz / l];
      memo.set(key, v);
    }
    return v;
  };

  // The mesh: each cell's two triangles, cut along the shards' borders where a border crosses them (so a shard's
  // edge runs smoothly across the cells, never in steps along them). A cut is where two shards' reach is equal,
  // found along each edge; the edges a cut makes are the shard's border (where the cracks glow).
  type V = { x: number; z: number };
  type Edge = { v: V; cut: boolean };
  const out: number[] = [];
  const emit = (a: V, b: V, c: V, edges: number[], s: number) => {
    const sxw = seeds[s * 3], szw = seeds[s * 3 + 1];
    const bary = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const mid = height(sxw, szw);
    [a, b, c].forEach((v, k) => {
      const [y, n0, n1, n2] = surface(v.x, v.z);
      out.push(v.x, y, v.z, n0, n1, n2, ...bary[k], edges[0], edges[1], edges[2], sxw, mid, szw, seeds[s * 3 + 2]);
    });
  };
  // Clip a polygon (its edges flagged as cuts or not) to where shard `s` reaches further than shard `t`.
  const clip = (poly: Edge[], s: number, t: number): Edge[] => {
    const g = (v: V) => distTo(s, v.x, v.z) - distTo(t, v.x, v.z);
    const res: Edge[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], next = poly[(i + 1) % poly.length];
      const gc = g(cur.v), gn = g(next.v);
      if (gc <= 0) res.push(cur);
      if ((gc <= 0) !== (gn <= 0)) {
        const k = gc / (gc - gn);
        const m = { x: cur.v.x + (next.v.x - cur.v.x) * k, z: cur.v.z + (next.v.z - cur.v.z) * k };
        // Leaving the region the edge from here on is a cut; coming back in, the original edge goes on.
        res.push(gc <= 0 ? { v: m, cut: true } : { v: m, cut: cur.cut });
      }
    }
    return res;
  };
  const owner = new Map<V, number>();
  const ownerOf = (v: V) => {
    let k = owner.get(v);
    if (k === undefined) owner.set(v, (k = shardOf(v.x, v.z)));
    return k;
  };
  const tri = (a: V, b: V, c: V) => {
    const owners = [...new Set([a, b, c].map(ownerOf))];
    if (owners.length === 1) {
      emit(a, b, c, [0, 0, 0], owners[0]);
      return;
    }
    for (const s of owners) {
      let poly: Edge[] = [{ v: a, cut: false }, { v: b, cut: false }, { v: c, cut: false }];
      for (const t of owners) if (t !== s && poly.length >= 3) poly = clip(poly, s, t);
      if (poly.length < 3) continue;
      // A fan from its first corner; each triangle's edges opposite its corners (b-c, c-a, a-b).
      for (let i = 1; i < poly.length - 1; i++) {
        const e0 = poly[i].cut ? 1 : 0;
        const e1 = i + 1 === poly.length - 1 && poly[i + 1].cut ? 1 : 0;
        const e2 = i === 1 && poly[0].cut ? 1 : 0;
        emit(poly[0].v, poly[i].v, poly[i + 1].v, [e0, e1, e2], s);
      }
    }
  };
  const qx = nx - 1, qz = nz - 1;
  const grid: V[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) grid.push({ x: X0 + i * CELL, z: Z0 + j * CELL });
  const gv = (i: number, j: number) => grid[j * nx + i];
  for (let j = 0; j < qz; j++)
    for (let i = 0; i < qx; i++) {
      const v00 = gv(i, j), v10 = gv(i + 1, j), v11 = gv(i + 1, j + 1), v01 = gv(i, j + 1);
      tri(v00, v10, v11);
      tri(v00, v11, v01);
    }
  const ground = new Float32Array(out);

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
