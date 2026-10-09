/**
 * The flagship as a genuine 3D object in the map's scene (drawn by MapObjects, nebula-objects.ts): a mesh built
 * here once, a sleek hull of plated metal: a lofted fuselage, swept wings, an engine pod at each wing's tip, a tail
 * fin and a glass canopy, the engines glowing at the back. Its look (plating, panel lines, wear, a stripe in its
 * holder's colour, a glossy canopy, burning engines) is worked out in the shader from where on the hull each point
 * lies, so there are no images to load. Local axes: +x forward (the nose), +y up, +z to starboard; about 1 long.
 *
 * Each vertex: position (3), normal (3), material (1): 0 hull plating, 1 canopy glass, 2 engine glow, 3 dark metal.
 */

export const SHIP_STRIDE = 7;

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function buildShip(): Float32Array {
  const out: number[] = [];
  const vert = (p: V3, n: V3, mat: number) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], mat);
  /** A flat triangle, its normal facing away from `inside`. */
  const tri = (a: V3, b: V3, c: V3, mat: number, inside?: V3) => {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (inside) {
      const m: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const away = sub(m, inside);
      if (n[0] * away[0] + n[1] * away[1] + n[2] * away[2] < 0) n = [-n[0], -n[1], -n[2]];
    }
    vert(a, n, mat);
    vert(b, n, mat);
    vert(c, n, mat);
  };
  /** A flat slab: a polygon (in order) given thickness along `up`, faces and edges. */
  const slab = (poly: V3[], up: V3, t: number, mat: number) => {
    const top = poly.map((p) => [p[0] + up[0] * t, p[1] + up[1] * t, p[2] + up[2] * t] as V3);
    const bot = poly.map((p) => [p[0] - up[0] * t, p[1] - up[1] * t, p[2] - up[2] * t] as V3);
    const c: V3 = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length, s[2] + p[2] / poly.length] as V3, [0, 0, 0]);
    for (let i = 1; i < poly.length - 1; i++) {
      tri(top[0], top[i], top[i + 1], mat, c);
      tri(bot[0], bot[i], bot[i + 1], mat, c);
    }
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      tri(top[i], top[j], bot[j], mat, c);
      tri(top[i], bot[j], bot[i], mat, c);
    }
  };
  /** A surface of revolution about an axis line (x along it), smooth-shaded: radii by station, from x0 to x1. */
  const loft = (x0: number, x1: number, radius: (s: number) => number, at: (x: number, a: number, r: number) => V3, mat: number, rings = 22, segs = 18) => {
    const P = (i: number, j: number): V3 => {
      const s = i / rings;
      return at(x0 + (x1 - x0) * s, (j / segs) * Math.PI * 2, radius(s));
    };
    // Normals from the surface itself (central differences), so it shades smoothly.
    const N = (i: number, j: number): V3 => {
      const a = P(Math.min(rings, i + 1), j), b = P(Math.max(0, i - 1), j), c = P(i, j + 1), d = P(i, j - 1);
      return norm(cross(sub(c, d), sub(a, b)));
    };
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < segs; j++) {
        const q: [number, number][] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const [a, b] = q[k];
          vert(P(a, b), N(a, b), mat);
        }
      }
  };

  // ---- The fuselage: a long, flattened body, broad amidships, tapering to a sharp nose and a squared tail ----
  const body = (s: number) => (s < 0.12 ? 0.075 + 0.2 * s : s < 0.58 ? 0.1 - 0.02 * Math.max(0, s - 0.4) : 0.096 * Math.pow(Math.max(0, 1 - ((s - 0.58) / 0.42) ** 2), 0.7));
  loft(-0.5, 0.5, body, (x, a, r) => [x, Math.sin(a) * r * 0.55, Math.cos(a) * r], 0);
  // The tail's end, closed by the main engine's nozzle: a dark ring and the glow inside it.
  const tailR = body(0);
  for (let j = 0; j < 18; j++) {
    const a0 = (j / 18) * Math.PI * 2, a1 = ((j + 1) / 18) * Math.PI * 2;
    const ring = (a: number, r: number): V3 => [-0.5, Math.sin(a) * r * 0.55, Math.cos(a) * r];
    tri(ring(a0, tailR), ring(a1, tailR), ring(a1, tailR * 0.7), 3, [0, 0, 0]);
    tri(ring(a0, tailR), ring(a1, tailR * 0.7), ring(a0, tailR * 0.7), 3, [0, 0, 0]);
    tri([-0.51, 0, 0], ring(a1, tailR * 0.7), ring(a0, tailR * 0.7), 2, [0, 0, 0]);
  }
  // ---- The canopy: a long glass blister on the spine, forward ----
  loft(0.02, 0.36, (s) => 0.05 * Math.pow(Math.sin(Math.PI * s), 0.6), (x, a, r) => [x, 0.034 + Math.abs(Math.sin(a)) * r * 0.75, Math.cos(a) * r * 0.85], 1, 10, 14);
  // ---- The wings: swept back, a little drooped, thin ----
  for (const side of [-1, 1]) {
    const w = (x: number, y: number, z: number): V3 => [x, y, z * side];
    slab([w(0.1, -0.012, 0.08), w(-0.34, -0.012, 0.09), w(-0.46, -0.03, 0.44), w(-0.3, -0.03, 0.44)], [0, 1, 0], 0.009, 0);
    // An engine pod at the wing's tip: a slim cylinder, its nozzle glowing.
    loft(-0.5, -0.18, (s) => (s > 0.85 ? 0.032 * Math.sqrt(Math.max(0, 1 - ((s - 0.85) / 0.15) ** 2)) + 0.004 : 0.032), (x, a, r) => [x, -0.03 + Math.sin(a) * r, side * 0.46 + Math.cos(a) * r], 3, 10, 12);
    for (let j = 0; j < 12; j++) {
      const a0 = (j / 12) * Math.PI * 2, a1 = ((j + 1) / 12) * Math.PI * 2;
      const ring = (a: number, r: number): V3 => [-0.5, -0.03 + Math.sin(a) * r, side * 0.46 + Math.cos(a) * r];
      tri([-0.505, -0.03, side * 0.46], ring(a1, 0.026), ring(a0, 0.026), 2, [0, -0.03, side * 0.46]);
    }
    // A small canard, forward.
    slab([w(0.3, 0, 0.05), w(0.2, 0, 0.06), w(0.17, -0.004, 0.15), w(0.22, -0.004, 0.15)], [0, 1, 0], 0.005, 0);
  }
  // ---- The tail fin: swept, upright ----
  slab([[-0.2, 0.04, 0], [-0.46, 0.04, 0], [-0.5, 0.2, 0], [-0.4, 0.2, 0]], [0, 0, 1], 0.007, 0);
  return new Float32Array(out);
}

/** Where its engines' nozzles are, in its own axes (for their glow, and a trail while it flies). */
export const SHIP_ENGINES: V3[] = [
  [-0.52, 0, 0],
  [-0.52, -0.03, 0.46],
  [-0.52, -0.03, -0.46],
];
