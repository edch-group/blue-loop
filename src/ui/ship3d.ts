/**
 * The ships armies sail the campaign map in, as genuine 3D objects in the map's scene (drawn by MapObjects,
 * nebula-objects.ts): one model per race, after the race's own design, built here once as a mesh.
 *
 * They are modelled, not extruded: hulls are lofted through cross-sections (each a superellipse, so a hull can be
 * round, faceted like crystal, or squared off like armour), and dressed with real parts round them: wings and
 * fins with an airfoil's section, engine bells with their burn, armour plates, bands, turrets, smokestacks,
 * spires and shards set at any angle, tentacles and legs, and rows of lit windows that give them their scale.
 * Their look (plated metal, crystal, living chitin, glowing furnaces) is worked out in the shader from each
 * part's material and colour, so there are no images to load.
 *
 * Box units: x along the ship (0 the stern, 40 the bow), y across (12 the keel line), z up from the keel; the ship
 * is 40 long. They map onto its own axes: +x forward, +y up, +z across (to starboard), 1 long.
 *
 * Each vertex: position (3), normal (3), colour (3), material (1). Materials: 0 plated metal, 1 glass or crystal,
 * 2 glowing (engines, suns, furnaces, windows), 3 living (chitin, reef, hide), 4 dark gloss (void-metal, rust),
 * 5 metal in its holder's colour, 6 molten (an ember hull).
 */

export const SHIP_STRIDE = 10;

type V3 = [number, number, number];
type RGB = [number, number, number];
type Xf = (p: V3) => V3;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** A point of the box (x along, y across, z up) in the ship's own axes. */
const P = (x: number, y: number, z: number): V3 => [(x - 20) / 40, z / 40, (y - 12) / 40];
/** A direction in the box, in the ship's own axes. */
const D = (x: number, y: number, z: number): V3 => norm([x, z, y]);

/**
 * A cross-section of a lofted hull, at `x`: half its width `w`, its height above its centre `t` and depth below
 * it `b` (box units), round its centre (`y`, `z`; the keel line and the keel by default). `p` is how square it
 * is: 1 a diamond, 2 an ellipse, more a box with rounded corners.
 */
interface Sec {
  x: number;
  w: number;
  t: number;
  b?: number;
  y?: number;
  z?: number;
  p?: number;
}

/** Where a section's outline is at angle `a` (0 starboard, π/2 the top), in box units. */
function secPoint(s: Sec, a: number): V3 {
  const p = s.p ?? 2;
  const e = (c: number) => Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
  const ca = Math.cos(a), sa = Math.sin(a);
  return [s.x, (s.y ?? 12) + s.w * e(ca), (s.z ?? 0) + (sa >= 0 ? s.t : (s.b ?? s.t)) * e(sa)];
}

/** A hull's section at any `x` along it (between the two it was given either side). */
function secAt(secs: Sec[], x: number): Sec {
  let i = 0;
  while (i < secs.length - 2 && secs[i + 1].x < x) i++;
  const a = secs[i], b = secs[i + 1];
  const k = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x || 1)));
  const l = (u: number | undefined, v: number | undefined, d: number) => (u ?? d) + ((v ?? d) - (u ?? d)) * k;
  return { x, w: l(a.w, b.w, 0), t: l(a.t, b.t, 0), b: l(a.b ?? a.t, b.b ?? b.t, 0), y: l(a.y, b.y, 12), z: l(a.z, b.z, 0), p: l(a.p, b.p, 2) };
}

/** One end of a wing or fin: its leading and trailing edges (x), where it is across and up. */
interface Chord {
  le: number;
  te: number;
  y: number;
  z: number;
}

class Mesh {
  out: number[] = [];
  private xfs: Xf[] = [];

  private v(p: V3, n: V3, c: RGB, m: number) {
    for (let i = this.xfs.length - 1; i >= 0; i--) {
      const f = this.xfs[i];
      const a = f(p);
      n = norm(sub(f(add(p, mul(n, 1e-3))), a));
      p = a;
    }
    this.out.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], m);
  }

  /** Builds parts moved by `f` (in the ship's own axes). */
  with(f: Xf, build: () => void) {
    this.xfs.push(f);
    build();
    this.xfs.pop();
  }

  /** Builds parts on both sides: as given (to port, y under 12), and mirrored to starboard. */
  mirror(build: () => void) {
    build();
    this.with((p) => [p[0], p[1], -p[2]], build);
  }

  /**
   * Builds a part laid along +x from the box's origin (x 20, y 12, z 0), stood at `base` and pointing along `dir`
   * (box units), turned `roll` about its own length.
   */
  orient(base: V3, dir: V3, build: () => void, roll = 0) {
    const f = D(dir[0], dir[1], dir[2]);
    const ref: V3 = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    let u = norm(sub(ref, mul(f, dot(ref, f))));
    let s = cross(f, u);
    if (roll) {
      const c = Math.cos(roll), sn = Math.sin(roll);
      [u, s] = [add(mul(u, c), mul(s, sn)), sub(mul(s, c), mul(u, sn))];
    }
    const o = P(base[0], base[1], base[2]);
    this.with((p) => add(o, add(mul(f, p[0]), add(mul(u, p[1]), mul(s, p[2])))), build);
  }

  /** A flat triangle, facing away from `inside`. */
  tri(a: V3, b: V3, c: V3, col: RGB, mat: number, inside?: V3) {
    const raw = cross(sub(b, a), sub(c, a));
    if (len(raw) < 1e-10) return;
    let n = norm(raw);
    if (inside) {
      const mid: V3 = [(a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]];
      if (dot(n, mid) < 0) n = mul(n, -1);
    }
    this.v(a, n, col, mat);
    this.v(b, n, col, mat);
    this.v(c, n, col, mat);
  }

  /**
   * A hull lofted through its sections (in order along x): smooth, or (`flat`) cut in facets, one to each of its
   * `segs` sides. Its underside is shaded darker; open ends are capped.
   */
  loft(secs: Sec[], col: RGB, mat: number, o: { segs?: number; flat?: boolean; under?: number } = {}) {
    const segs = o.segs ?? 22;
    const under = o.under ?? 0.3;
    const ang = (j: number) => Math.PI / 2 + (j / segs) * Math.PI * 2;
    const G = secs.map((s) => Array.from({ length: segs }, (_, j) => P(...secPoint(s, ang(j)))));
    const C = secs.map((s) => P(s.x, s.y ?? 12, s.z ?? 0));
    const tip = (s: Sec) => s.w < 1e-6 && s.t < 1e-6 && (s.b ?? s.t) < 1e-6;
    const last = secs.length - 1;
    const tone = (j: number) => shade(col, 1 - under * (0.5 - 0.5 * Math.sin(ang(j))));
    const axial = (i: number): V3 => norm(i === 0 ? sub(C[0], C[1]) : i === last ? sub(C[last], C[last - 1]) : [0, 1, 0]);
    const N = G.map((ring, i) =>
      ring.map((p, j) => {
        if (tip(secs[i])) return axial(i);
        const dA = sub(ring[(j + 1) % segs], ring[(j - 1 + segs) % segs]);
        const dL = sub(G[Math.min(i + 1, last)][j], G[Math.max(i - 1, 0)][j]);
        const c = cross(dL, dA);
        if (len(c) < 1e-12) return axial(i);
        const n = norm(c);
        return dot(n, sub(p, C[i])) < 0 ? mul(n, -1) : n;
      }),
    );
    for (let i = 0; i < last; i++) {
      const mid = mul(add(C[i], C[i + 1]), 0.5);
      for (let j = 0; j < segs; j++) {
        const j2 = (j + 1) % segs;
        const a = G[i][j], b = G[i][j2], c = G[i + 1][j2], d = G[i + 1][j];
        if (o.flat) {
          const t = shade(col, 1 - under * (0.5 - 0.5 * Math.sin((ang(j) + ang(j + 1)) / 2)));
          this.tri(a, b, c, t, mat, mid);
          this.tri(a, c, d, t, mat, mid);
        } else {
          const [na, nb, nc, nd] = [N[i][j], N[i][j2], N[i + 1][j2], N[i + 1][j]];
          if (len(sub(a, b)) > 1e-9) {
            this.v(a, na, tone(j), mat);
            this.v(b, nb, tone(j2), mat);
            this.v(c, nc, tone(j2), mat);
          }
          if (len(sub(c, d)) > 1e-9) {
            this.v(a, na, tone(j), mat);
            this.v(c, nc, tone(j2), mat);
            this.v(d, nd, tone(j), mat);
          }
        }
      }
    }
    for (const i of [0, last]) {
      if (tip(secs[i])) continue;
      const n = axial(i);
      for (let j = 0; j < segs; j++) {
        const a = G[i][j], b = G[i][(j + 1) % segs];
        this.v(C[i], n, shade(col, 0.8), mat);
        this.v(a, n, shade(col, 0.8), mat);
        this.v(b, n, shade(col, 0.8), mat);
      }
    }
  }

  /** A block from (x0, y0, z0) to (x1, y1, z1), its top drawn in by `inset` on every side (a bevelled top). */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: RGB, mat: number, inset = 0) {
    const i = inset;
    const b: V3[] = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)];
    const t: V3[] = [P(x0 + i, y0 + i, z1), P(x1 - i, y0 + i, z1), P(x1 - i, y1 - i, z1), P(x0 + i, y1 - i, z1)];
    const c = P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const side = shade(col, 0.88);
      this.tri(b[k], b[k2], t[k2], side, mat, c);
      this.tri(b[k], t[k2], t[k], side, mat, c);
    }
    this.tri(t[0], t[1], t[2], col, mat, c);
    this.tri(t[0], t[2], t[3], col, mat, c);
    this.tri(b[0], b[1], b[2], shade(col, 0.6), mat, c);
    this.tri(b[0], b[2], b[3], shade(col, 0.6), mat, c);
  }

  /** An ellipsoid (box units: x along, y across; z0 its bottom, height 2rz), or (dome) its upper half from z0. */
  orb(x: number, y: number, z0: number, rx: number, ry: number, rz: number, col: RGB, mat: number, dome = false, segs = 18, rings = 10) {
    const cz = dome ? z0 : z0 + rz;
    const at = (i: number, j: number): [V3, V3] => {
      const th = (j / segs) * Math.PI * 2;
      const ph = dome ? (i / rings) * (Math.PI / 2) : (i / rings) * Math.PI - Math.PI / 2;
      const nx = Math.cos(ph) * Math.cos(th), ny = Math.cos(ph) * Math.sin(th), nz = Math.sin(ph);
      return [P(x + nx * rx, y + ny * ry, cz + nz * rz), norm([nx / rx, nz / rz, ny / ry])];
    };
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < segs; j++) {
        const [a, na] = at(i, j), [b, nb] = at(i, j + 1), [c, nc] = at(i + 1, j + 1), [e, ne] = at(i + 1, j);
        this.v(a, na, col, mat);
        this.v(c, nc, col, mat);
        this.v(b, nb, col, mat);
        this.v(a, na, col, mat);
        this.v(e, ne, col, mat);
        this.v(c, nc, col, mat);
      }
    if (dome)
      for (let j = 0; j < segs; j++) {
        const [a] = at(0, j), [b] = at(0, j + 1);
        this.tri(P(x, y, cz), a, b, shade(col, 0.6), mat, P(x, y, cz + 1));
      }
  }

  /** A ball round (x, y, z). */
  ball(x: number, y: number, z: number, r: number, col: RGB, mat: number, segs = 14, rings = 8) {
    this.orb(x, y, z - r, r, r, r, col, mat, false, segs, rings);
  }

  /** A tube through points (box units), its radius going from r0 to r1, shaded smooth; its ends closed. */
  tube(path: V3[], r0: number, r1: number, col: RGB, mat: number, segs = 10, caps = true) {
    const n = path.length;
    const pts = path.map((q) => P(q[0], q[1], q[2]));
    const tan = pts.map((_, k) => norm(sub(pts[Math.min(k + 1, n - 1)], pts[Math.max(k - 1, 0)])));
    // Frames carried along the tube (so it never twists).
    const ref: V3 = Math.abs(tan[0][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let side = norm(cross(tan[0], ref));
    const rings: [V3, V3][][] = [];
    for (let k = 0; k < n; k++) {
      if (k > 0) {
        const s2 = sub(side, mul(tan[k], dot(side, tan[k])));
        if (len(s2) > 1e-6) side = norm(s2);
      }
      const up = cross(side, tan[k]);
      const r = (r0 + (r1 - r0) * (k / (n - 1))) / 40;
      rings.push(
        Array.from({ length: segs }, (_, j) => {
          const t = (j / segs) * Math.PI * 2;
          const d = add(mul(side, Math.cos(t)), mul(up, Math.sin(t)));
          return [add(pts[k], mul(d, r)), d] as [V3, V3];
        }),
      );
    }
    for (let k = 0; k < n - 1; k++)
      for (let j = 0; j < segs; j++) {
        const j2 = (j + 1) % segs;
        const [a, na] = rings[k][j], [b, nb] = rings[k + 1][j], [c, nc] = rings[k + 1][j2], [d, nd] = rings[k][j2];
        this.v(a, na, col, mat);
        this.v(b, nb, col, mat);
        this.v(c, nc, col, mat);
        this.v(a, na, col, mat);
        this.v(c, nc, col, mat);
        this.v(d, nd, col, mat);
      }
    if (caps)
      for (const [k, sgn] of [[0, -1], [n - 1, 1]] as const) {
        const nn = mul(tan[k], sgn);
        for (let j = 0; j < segs; j++) {
          this.v(pts[k], nn, col, mat);
          this.v(rings[k][j][0], nn, col, mat);
          this.v(rings[k][(j + 1) % segs][0], nn, col, mat);
        }
      }
  }

  /** A straight cylinder (or cone) from a to b. */
  cyl(a: V3, b: V3, r0: number, r1: number, col: RGB, mat: number, segs = 14) {
    this.tube([a, b], r0, r1, col, mat, segs);
  }

  /** A ring (a thin torus) round (x, y) at height z, radius R, tube r, tipped about its across axis by `tilt`. */
  ring(x: number, y: number, z: number, R: number, r: number, tilt: number, col: RGB, mat: number) {
    const segs = 40, sides = 8;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const at = (i: number, j: number): [V3, V3] => {
      const a = (i / segs) * Math.PI * 2, b = (j / sides) * Math.PI * 2;
      const cxr = Math.cos(a) * (R + r * Math.cos(b)), cyr = Math.sin(a) * (R + r * Math.cos(b)), czr = r * Math.sin(b);
      const nx = Math.cos(a) * Math.cos(b), ny = Math.sin(a) * Math.cos(b), nz = Math.sin(b);
      return [P(x + cxr * ct - czr * st, y + cyr, z + cxr * st + czr * ct), norm([nx * ct - nz * st, nx * st + nz * ct, ny])];
    };
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < sides; j++) {
        const [a, na] = at(i, j), [b, nb] = at(i + 1, j), [c, nc] = at(i + 1, j + 1), [e, ne] = at(i, j + 1);
        this.v(a, na, col, mat);
        this.v(b, nb, col, mat);
        this.v(c, nc, col, mat);
        this.v(a, na, col, mat);
        this.v(c, nc, col, mat);
        this.v(e, ne, col, mat);
      }
  }

  /** A wing or fin from its root chord to its tip, with an airfoil's diamond section, thinning to the tip. */
  wing(root: Chord, tip: Chord, thick: number, col: RGB, mat: number) {
    const sp = [tip.y - root.y, tip.z - root.z];
    const sl = Math.hypot(sp[0], sp[1]) || 1;
    // Thickness runs square to the span, across the wing.
    const th = [-sp[1] / sl, sp[0] / sl];
    const sec = (c: Chord, t: number): V3[] => {
      const m = c.le - (c.le - c.te) * 0.4;
      return [P(c.le, c.y, c.z), P(m, c.y + th[0] * t, c.z + th[1] * t), P(c.te, c.y, c.z), P(m, c.y - th[0] * t, c.z - th[1] * t)];
    };
    const r = sec(root, thick / 2), t = sec(tip, thick * 0.2);
    const mid = mul(add(add(r[0], r[2]), add(t[0], t[2])), 0.25);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const tone = k < 2 ? col : shade(col, 0.78);
      this.tri(r[k], r[k2], t[k2], tone, mat, mid);
      this.tri(r[k], t[k2], t[k], tone, mat, mid);
    }
    this.tri(t[0], t[1], t[2], col, mat, mid);
    this.tri(t[0], t[2], t[3], col, mat, mid);
    this.tri(r[0], r[1], r[2], col, mat, mid);
    this.tri(r[0], r[2], r[3], col, mat, mid);
  }

  /** A crystal shard (or spike): a six-sided faceted spire laid along +x from the origin, `l` long, `r` thick. */
  shard(base: V3, dir: V3, l: number, r: number, col: RGB, mat: number, roll = 0) {
    this.orient(
      base,
      dir,
      () =>
        this.loft(
          [
            { x: 19.6, w: r * 0.55, t: r * 0.55, p: 2 },
            { x: 20 + l * 0.22, w: r, t: r, p: 2 },
            { x: 20 + l * 0.68, w: r * 0.72, t: r * 0.72, p: 2 },
            { x: 20 + l, w: 0, t: 0 },
          ],
          col,
          mat,
          { segs: 6, flat: true, under: 0.2 },
        ),
      roll,
    );
  }

  /** Lights set into a hull's sides: `n` along it from x0 to x1, at angle `a` round it (both sides). */
  windows(secs: Sec[], x0: number, x1: number, n: number, a: number, r: number, col: RGB) {
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
      const s = secAt(secs, x);
      for (const aa of [a, Math.PI - a]) {
        const [px, py, pz] = secPoint(s, aa);
        this.ball(px, py + Math.cos(aa) * r * 0.2, pz + Math.sin(aa) * r * 0.2, r, col, 2, 6, 4);
      }
    }
  }

  /** A raised ridge down a hull's back from x0 to x1, `w` wide and `h` high, tapering at its ends. */
  spine(secs: Sec[], x0: number, x1: number, w: number, h: number, col: RGB, mat: number) {
    const out: Sec[] = [];
    for (let i = 0; i <= 8; i++) {
      const x = x0 + ((x1 - x0) * i) / 8;
      const top = secPoint(secAt(secs, x), Math.PI / 2);
      const f = i === 0 || i === 8 ? 0 : Math.min(1, Math.sin((Math.PI * i) / 8) * 1.6);
      out.push({ x, w: w * f, t: h * f, b: 0.4 * f, z: top[2] - 0.15, p: 3 });
    }
    this.loft(out, col, mat, { segs: 12, under: 0.15 });
  }

  /** A band round a hull at x (a hoop standing proud of it by `out`, `wide` long). */
  band(secs: Sec[], x: number, wide: number, out: number, col: RGB, mat: number) {
    const s = secAt(secs, x);
    const g = (dx: number, k: number): Sec => ({ ...s, x: x + dx, w: s.w + k, t: s.t + k, b: (s.b ?? s.t) + k });
    this.loft([g(-wide / 2, 0), g(-wide / 2 + 0.05, out), g(wide / 2 - 0.05, out), g(wide / 2, 0)], col, mat, { segs: 24, under: 0.2 });
  }
}

// ---- Colours ----
const WHITE_METAL: RGB = [0.92, 0.93, 0.95];
const GOLD: RGB = [0.93, 0.75, 0.38];
const SUN: RGB = [1, 0.84, 0.48];
const CANOPY: RGB = [0.16, 0.22, 0.34];
const WINDOW: RGB = [1, 0.9, 0.62];
const CRYSTAL_DARK: RGB = [0.33, 0.27, 0.6];
const CRYSTAL: RGB = [0.8, 0.73, 0.98];
const CRYSTAL_GLOW: RGB = [0.86, 0.74, 1];
const REEF: RGB = [0.26, 0.5, 0.52];
const REEF_LIGHT: RGB = [0.46, 0.76, 0.72];
const BELL: RGB = [0.6, 0.88, 0.86];
const CORE_CYAN: RGB = [0.55, 1, 0.92];
const CHITIN: RGB = [0.66, 0.54, 0.36];
const CHITIN_DARK: RGB = [0.3, 0.23, 0.16];
const CAP: RGB = [0.62, 0.95, 0.4];
const VOID: RGB = [0.14, 0.12, 0.24];
const VOID_DOME: RGB = [0.28, 0.22, 0.52];
const VIOLET: RGB = [0.78, 0.58, 1];
const IRON: RGB = [0.48, 0.49, 0.53];
const IRON_DARK: RGB = [0.33, 0.33, 0.37];
const BRONZE: RGB = [0.8, 0.55, 0.26];
const FURNACE: RGB = [1, 0.55, 0.18];
const PEARL: RGB = [0.94, 0.95, 1];
const PEARL_SAIL: RGB = [0.92, 0.94, 1];
const STARLIGHT: RGB = [0.92, 0.96, 1];
const SILVER: RGB = [0.78, 0.82, 0.9];
const MOON: RGB = [0.72, 0.77, 0.94];
const EMBER: RGB = [0.92, 0.36, 0.12];
const CRUST: RGB = [0.22, 0.12, 0.1];
const HEART: RGB = [1, 0.95, 0.72];
const TONGUE: RGB = [1, 0.42, 0.06];
const RUST: RGB = [0.5, 0.42, 0.4];
const RUST_DARK: RGB = [0.2, 0.17, 0.17];
const ENGINE: RGB = [1, 0.82, 0.58];

export interface ShipModel {
  mesh: Float32Array;
  /** Where its engines are, in its own axes (for their glow, and a trail while it flies). */
  engines: V3[];
  /** The colour its engines burn. */
  glow: RGB;
  /** Suns it carries (the Aureline's captive sun): where, in its own axes, and how big; they radiate heat. */
  suns: { at: V3; r: number }[];
}

/** Suns the ship being built carries (see ShipModel.suns). */
let carried: { at: V3; r: number }[] = [];

/** An engine: a housing collared in its holder's colour, flaring to its bell, the burn inside; facing astern. */
function engine(m: Mesh, x: number, y: number, z: number, r: number, l: number, e: V3[], burn: RGB = ENGINE, housing: RGB = IRON, mat = 0) {
  m.cyl([x + l * 0.5, y, z], [x, y, z], r * 0.75, r * 0.9, housing, mat);
  m.cyl([x + l * 0.32, y, z], [x + l * 0.12, y, z], r * 0.95, r * 0.95, housing, 5);
  m.cyl([x, y, z], [x - l * 0.5, y, z], r * 0.8, r, shade(housing, 0.75), mat);
  m.cyl([x - l * 0.45, y, z], [x - l * 0.52, y, z], r * 0.82, r * 0.82, burn, 2);
  e.push(P(x - l * 0.6, y, z));
}

const BUILDERS: ((m: Mesh, e: V3[]) => RGB)[] = [
  // Aureline: a sun-barque. A long sleek hull of white metal belted in gold, a bridge forward under dark glass,
  // its sun carried amidships in a golden cradle, outrigger engines on swept pylons and twin engines astern.
  (m, e) => {
    const hull: Sec[] = [
      { x: 3.5, w: 2.5, t: 2.0, b: 1.8, z: 3.4, p: 2.6 },
      { x: 6, w: 3.3, t: 2.5, b: 2.3, z: 3.4, p: 2.6 },
      { x: 13, w: 3.8, t: 2.9, b: 2.8, z: 3.4, p: 2.6 },
      { x: 22, w: 3.6, t: 2.8, b: 2.7, z: 3.4, p: 2.6 },
      { x: 30, w: 2.8, t: 2.2, b: 2.0, z: 3.3, p: 2.4 },
      { x: 36, w: 1.5, t: 1.3, b: 1.1, z: 3.1, p: 2.2 },
      { x: 40.5, w: 0, t: 0, z: 3.0 },
    ];
    m.loft(hull, WHITE_METAL, 0);
    // Its gold belt, and its spine in its holder's colour.
    m.loft(hull.slice(0, -1).map((s): Sec => ({ ...s, w: s.w + 0.14, t: 0.32, b: 0.32, z: (s.z ?? 0) - 0.3, p: 2 })).concat([{ x: 40.6, w: 0, t: 0, z: 2.7 }]), GOLD, 0, { segs: 18 });
    m.spine(hull, 8, 33, 0.6, 0.55, WHITE_METAL, 5);
    for (const x of [9, 26]) m.band(hull, x, 0.8, 0.14, GOLD, 0);
    // The bridge, under dark glass.
    m.loft(
      [
        { x: 23, w: 1.4, t: 0.4, b: 0.2, z: 5.7, p: 2.4 },
        { x: 25, w: 1.7, t: 1.7, b: 0.2, z: 5.7, p: 2.4 },
        { x: 29, w: 1.6, t: 1.6, b: 0.2, z: 5.5, p: 2.4 },
        { x: 32, w: 0, t: 0, z: 5.2 },
      ],
      WHITE_METAL,
      0,
    );
    m.loft(
      [
        { x: 28.4, w: 1.45, t: 0.9, b: 0.2, z: 6.2, p: 2.2 },
        { x: 30.4, w: 1.1, t: 0.6, b: 0.2, z: 5.9, p: 2.2 },
        { x: 31.9, w: 0, t: 0, z: 5.4 },
      ],
      CANOPY,
      1,
    );
    m.windows(hull, 9, 31, 11, 0.32, 0.26, WINDOW);
    // The sun, in its cradle (radiating heat: nebula-objects.ts draws its corona).
    m.ball(16, 12, 11.6, 3.0, SUN, 2, 22, 14);
    carried.push({ at: P(16, 12, 11.6), r: 3.0 / 40 });
    m.ring(16, 12, 11.6, 4.0, 0.34, Math.PI / 2, GOLD, 0);
    m.ring(16, 12, 11.6, 4.7, 0.16, 0.45, GOLD, 5);
    m.mirror(() => m.tube([[16, 9.4, 5.9], [16, 8.0, 8.4], [16, 8.0, 11.6]], 0.6, 0.45, GOLD, 0));
    // Fins: one above, a keel below.
    m.wing({ le: 10, te: 4.2, y: 12, z: 5.6 }, { le: 6.4, te: 3.4, y: 12, z: 9.6 }, 0.6, WHITE_METAL, 0);
    m.wing({ le: 30, te: 8, y: 12, z: 1.3 }, { le: 23, te: 11, y: 12, z: -0.8 }, 0.7, GOLD, 0);
    // Outriggers on swept pylons, each with its engine.
    m.mirror(() => {
      m.wing({ le: 15, te: 9, y: 9.0, z: 3.6 }, { le: 11.5, te: 6.5, y: 3.8, z: 4.6 }, 0.7, WHITE_METAL, 0);
      const pod: Sec[] = [
        { x: 3.4, w: 1.0, t: 1.0, y: 3.6, z: 4.6 },
        { x: 5, w: 1.3, t: 1.3, y: 3.6, z: 4.6 },
        { x: 12, w: 1.3, t: 1.3, y: 3.6, z: 4.6 },
        { x: 15, w: 0.8, t: 0.8, y: 3.6, z: 4.6 },
        { x: 16.4, w: 0, t: 0, y: 3.6, z: 4.6 },
      ];
      m.loft(pod, WHITE_METAL, 0, { segs: 16 });
      m.band(pod, 13, 0.6, 0.12, GOLD, 0);
      m.band(pod, 6.5, 0.5, 0.1, WHITE_METAL, 5);
      engine(m, 3.4, 3.6, 4.6, 1.0, 1.6, e);
    });
    engine(m, 3.8, 10.7, 3.4, 1.3, 2.0, e);
    engine(m, 3.8, 13.3, 3.4, 1.3, 2.0, e);
    m.ball(40.6, 12, 3.0, 0.3, SUN, 2, 8, 5);
    return ENGINE;
  },

  // Xel'Naru: a shard of dark crystal cut in facets, a great crystal spire rising from it, lesser shards round it
  // at every angle and a few drifting free, a violet light running down its ridge.
  (m, e) => {
    const hull: Sec[] = [
      { x: 1.5, w: 0, t: 0, z: 3 },
      { x: 4, w: 1.8, t: 1.6, b: 1.2, z: 3 },
      { x: 12, w: 3.6, t: 3.6, b: 2.6, z: 3 },
      { x: 21, w: 4.4, t: 4.8, b: 3.2, z: 3 },
      { x: 31, w: 2.8, t: 2.8, b: 2.0, z: 3 },
      { x: 41, w: 0, t: 0, z: 3 },
    ];
    m.loft(hull, CRYSTAL_DARK, 1, { segs: 6, flat: true, under: 0.35 });
    // A lighter crystal laid along its flanks.
    m.mirror(() => m.shard([6, 9.6, 2.6], [1, -0.08, 0.02], 26, 1.4, [0.5, 0.42, 0.8], 1));
    m.tube(hull.slice(1, -1).map((s) => [s.x, 12, (s.z ?? 0) + s.t + 0.05] as V3).concat([[40.6, 12, 3.1]]), 0.22, 0.12, CRYSTAL_GLOW, 2, 6);
    const spire = (b: V3, d: V3, l: number, r: number, c: RGB = CRYSTAL, glow = true) => {
      m.shard(b, d, l, r, c, 1);
      if (glow) {
        const dd = norm(d);
        m.ball(b[0] + dd[0] * (l + 0.6), b[1] + dd[1] * (l + 0.6), b[2] + dd[2] * (l + 0.6), Math.max(0.35, r * 0.28), CRYSTAL_GLOW, 2, 8, 5);
      }
    };
    spire([21, 12, 6.5], [-0.35, 0, 1], 21, 3.0);
    spire([16, 12, 6.0], [-0.8, 0, 0.9], 9, 1.6, CRYSTAL, false);
    m.mirror(() => {
      spire([14, 9.6, 5], [-0.45, -0.55, 0.9], 11, 1.9);
      spire([28, 10.4, 4.4], [0.35, -0.5, 0.75], 7, 1.3);
      spire([8, 11, 4], [-0.9, -0.35, 0.5], 6, 1.1, CRYSTAL, false);
      spire([20, 9, 0.6], [-0.2, -0.4, -1], 5, 1.2, CRYSTAL_DARK, false);
    });
    // Shards drifting free beside it.
    spire([33, 3.5, 9], [0.3, 0.2, 1], 3.2, 0.8, CRYSTAL, false);
    spire([9, 20.5, 10], [-0.2, 0.3, 1], 2.6, 0.7, CRYSTAL, false);
    spire([25, 2, 2.5], [0.5, -0.1, 0.6], 2.2, 0.6, CRYSTAL, false);
    engine(m, 2.6, 12, 3, 1.2, 1.4, e, CRYSTAL_GLOW, CRYSTAL_DARK, 1);
    return CRYSTAL_GLOW;
  },

  // Vorthane: a living reef-raft under a great ribbed glass bell, lit at its crown, coral along its rim, a lantern
  // hung below and long tentacles trailing astern.
  (m, e) => {
    const raft: Sec[] = [
      { x: 7, w: 0, t: 0, z: 1.8 },
      { x: 8, w: 3.5, t: 0.8, b: 1.0, z: 1.8 },
      { x: 13, w: 7, t: 1.2, b: 1.6, z: 1.8 },
      { x: 24, w: 8.6, t: 1.4, b: 1.8, z: 1.8 },
      { x: 34, w: 6.5, t: 1.2, b: 1.5, z: 1.8 },
      { x: 39, w: 2.5, t: 0.8, b: 0.9, z: 1.8 },
      { x: 40, w: 0, t: 0, z: 1.8 },
    ];
    m.loft(raft, REEF, 3, { segs: 28 });
    // Coral along its rim.
    for (let i = 0; i < 13; i++) {
      const x = 9.5 + i * 2.3;
      const s = secAt(raft, x);
      for (const side of [-1, 1]) {
        const h = 0.5 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 0.18;
        m.ball(x, 12 + side * (s.w - 0.3), 2.6, h, i % 3 ? REEF_LIGHT : [0.9, 0.55, 0.6], 3, 8, 5);
      }
    }
    // The bell, ribbed, crowned with light.
    m.orb(24, 12, 3.0, 8.2, 6.8, 10.4, BELL, 1, true, 28, 14);
    for (let k = 0; k < 10; k++) {
      const th = (k / 10) * Math.PI * 2;
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const ph = (i / 8) * 1.32;
        pts.push([24 + Math.cos(th) * Math.cos(ph) * 8.35, 12 + Math.sin(th) * Math.cos(ph) * 6.95, 3.0 + Math.sin(ph) * 10.55]);
      }
      m.tube(pts, 0.38, 0.22, REEF_LIGHT, 3, 6);
    }
    m.ring(24, 12, 3.2, 7.6, 0.6, 0, REEF_LIGHT, 3);
    m.ball(24, 12, 13.7, 1.3, CORE_CYAN, 2);
    m.ring(24, 12, 13.2, 1.7, 0.3, 0, REEF_LIGHT, 3);
    // Its lantern, hung below.
    m.cyl([24, 12, 0.6], [24, 12, -1.2], 0.3, 0.3, REEF_LIGHT, 3, 8);
    m.ball(24, 12, -2.4, 1.3, CORE_CYAN, 2);
    // Tentacles trailing astern, and feelers forward.
    for (let k = 0; k < 7; k++) {
      const y0 = 12 + (k - 3) * 1.9;
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push([12 - t * 22, 12 + (y0 - 12) * (1 + t * 0.9) + Math.sin(t * 5 + k) * 0.9, 0.6 - t * 3.2 + Math.sin(t * 7 + k * 1.7) * 0.7]);
      }
      m.tube(pts, 0.75, 0.12, k % 2 ? REEF_LIGHT : REEF, 3, 8, false);
    }
    m.mirror(() => m.tube([[36, 10.5, 0.8], [40, 9.5, -0.6], [42.5, 9.8, -1.6]], 0.4, 0.1, REEF_LIGHT, 3, 6, false));
    e.push(P(8, 12, 1.4));
    return CORE_CYAN;
  },

  // Ixquor: a segmented chitin seed pod on six jointed legs, mandibles at its bow, a glowing cap swelling from
  // its back, its eyes and spots alight.
  (m, e) => {
    const body: Sec[] = [{ x: 2, w: 0, t: 0, z: 6 }];
    for (let x = 3; x <= 36; x += 1.5) {
      const base = 6.2 * Math.pow(Math.sin((Math.PI * (x - 1.5)) / 37), 0.65);
      const ridge = Math.round((x - 3) / 1.5) % 3 === 2 ? 0.9 : 1;
      body.push({ x, w: base * ridge, t: base * 0.95 * ridge, b: base * 0.75 * ridge, z: 6 });
    }
    body.push({ x: 38, w: 0, t: 0, z: 6 });
    m.loft(body, CHITIN, 3, { segs: 24, under: 0.4 });
    for (const x of [8, 13, 18, 23]) m.shard([x, 12, secPoint(secAt(body, x), Math.PI / 2)[2] - 0.4], [-0.6, 0, 1], 3.4, 0.8, CHITIN_DARK, 3);
    // Legs, jointed, three a side.
    m.mirror(() => {
      for (const x of [12, 18, 24]) {
        const hip: V3 = [x, 12 - 4.6, 4.4], knee: V3 = [x + (x - 18) * 0.25, 12 - 9.4, 8.6], foot: V3 = [x + (x - 18) * 0.55, 12 - 12.8, -1.4];
        m.tube([hip, knee], 0.85, 0.6, CHITIN_DARK, 3, 8);
        m.ball(knee[0], knee[1], knee[2], 0.75, CHITIN, 3, 8, 5);
        m.tube([knee, [(knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2 - 0.4, (knee[2] + foot[2]) / 2 + 1], foot], 0.6, 0.18, CHITIN_DARK, 3, 8);
      }
      m.tube([[34, 10.2, 4.4], [38.6, 9.4, 3.6], [41, 10.6, 2.6], [41.6, 11.5, 2.0]], 0.6, 0.12, CHITIN_DARK, 3, 8);
      m.ball(35.4, 9.9, 6.8, 0.75, [1, 0.62, 0.2], 2, 10, 6);
    });
    // The cap, glowing, ringed in dark chitin.
    m.orb(28.5, 12, 9.4, 4.0, 3.6, 3.0, CAP, 2, true, 20, 10);
    m.ring(28.5, 12, 9.5, 3.8, 0.45, 0, CHITIN_DARK, 3);
    m.windows(body, 8, 30, 7, -0.15, 0.32, CAP);
    m.ball(2.4, 12, 6, 1.5, CAP, 2);
    e.push(P(1.4, 12, 6));
    return CAP;
  },

  // Nyxari: a low black blade, faceted, its crescent wings swept out and curling forward to points edged in violet
  // light; a hooded dark-glass canopy with one violet eye, canted fins, twin engines.
  (m, e) => {
    const hull: Sec[] = [
      { x: 3, w: 1.2, t: 0.9, b: 0.6, z: 2.2 },
      { x: 9, w: 2.6, t: 1.8, b: 1.0, z: 2.2 },
      { x: 19, w: 3.2, t: 2.4, b: 1.2, z: 2.2 },
      { x: 30, w: 2.0, t: 1.4, b: 0.8, z: 2.2 },
      { x: 42, w: 0, t: 0, z: 2.0 },
    ];
    m.loft(hull, VOID, 4, { segs: 6, flat: true, under: 0.2 });
    m.mirror(() => {
      m.wing({ le: 25, te: 8.5, y: 10, z: 2.3 }, { le: 20, te: 12, y: 4, z: 1.7 }, 1.2, VOID, 4);
      m.wing({ le: 20, te: 12, y: 4, z: 1.7 }, { le: 33, te: 29.5, y: 0.4, z: 1.1 }, 0.7, VOID, 4);
      m.wing({ le: 33, te: 29.5, y: 0.4, z: 1.1 }, { le: 37.5, te: 36.5, y: 1.6, z: 0.95 }, 0.4, VOID, 4);
      m.tube([[25, 9.9, 2.4], [22.2, 6.8, 2.0], [20, 4, 1.75], [26, 1.6, 1.4], [33, 0.35, 1.15], [37.5, 1.6, 0.97]], 0.18, 0.1, VIOLET, 2, 6, false);
      m.wing({ le: 17, te: 12.5, y: 7.2, z: 2.1 }, { le: 14.5, te: 12.8, y: 4.4, z: 1.9 }, 0.9, VOID, 5);
      m.wing({ le: 9, te: 4, y: 10.6, z: 3.6 }, { le: 6, te: 3.4, y: 8.6, z: 7.2 }, 0.45, VOID, 4);
      engine(m, 3.4, 10.7, 2.2, 0.95, 1.4, e, VIOLET, VOID, 4);
    });
    m.orb(23, 12, 4.0, 4.6, 2.4, 2.3, VOID_DOME, 1, true, 18, 9);
    m.wing({ le: 24.5, te: 15, y: 12, z: 4.6 }, { le: 19, te: 14, y: 12, z: 7.4 }, 0.5, VOID, 4);
    m.ball(27.4, 12, 4.7, 0.8, VIOLET, 2, 12, 8);
    return VIOLET;
  },

  // Korrath: a squat armoured forge-barge of dark iron, plated and banded in bronze, a bronze ram at its bow, a
  // stepped bridge, smokestacks breathing fire, a gun turret forward, furnace vents glowing down its flanks and
  // three great engines astern.
  (m, e) => {
    const hull: Sec[] = [
      { x: 2.8, w: 4.6, t: 2.6, b: 2.2, z: 3.2, p: 6 },
      { x: 5, w: 5.6, t: 3.2, b: 2.6, z: 3.2, p: 6 },
      { x: 14, w: 6.0, t: 3.4, b: 2.8, z: 3.2, p: 6 },
      { x: 26, w: 5.8, t: 3.3, b: 2.8, z: 3.2, p: 6 },
      { x: 33, w: 4.6, t: 2.8, b: 2.4, z: 3.2, p: 5 },
      { x: 36.5, w: 2.6, t: 2.0, b: 1.6, z: 3.0, p: 4 },
    ];
    m.loft(hull, IRON, 0, { segs: 28 });
    m.loft(
      [
        { x: 34.5, w: 2.4, t: 1.9, b: 1.7, z: 2.8, p: 1 },
        { x: 38, w: 1.5, t: 1.0, b: 1.5, z: 2.3, p: 1 },
        { x: 42.5, w: 0, t: 0, z: 1.4 },
      ],
      BRONZE,
      0,
      { segs: 4, flat: true },
    );
    m.mirror(() => {
      for (const x of [6.6, 12.6, 18.6, 24.6]) {
        m.box(x, x + 5.4, 12 - 6.55, 12 - 5.7, 0.9, 5.7, IRON_DARK, 0, 0.2);
        m.box(x + 5.45, x + 5.95, 12 - 6.25, 12 - 5.85, 1.8, 4.8, FURNACE, 2);
      }
    });
    for (const x of [6.2, 18.5, 30.5]) m.band(hull, x, 0.9, 0.5, BRONZE, 0);
    m.box(15, 33, 11.1, 12.9, 6.45, 6.85, IRON, 5);
    // The bridge, stepped.
    m.box(6.5, 16.5, 8.2, 15.8, 6.4, 9.2, IRON, 0, 0.6);
    m.box(8.6, 14.4, 9.4, 14.6, 9.2, 11.8, IRON_DARK, 0, 0.4);
    m.box(14.0, 14.45, 10.0, 14.0, 10.1, 11.0, WINDOW, 2);
    m.mirror(() => m.box(10, 13.5, 9.35, 9.45, 10.0, 10.7, WINDOW, 2));
    m.cyl([11.5, 12, 11.8], [11.5, 12, 15], 0.18, 0.1, BRONZE, 0, 6);
    // Smokestacks, burning.
    for (const [x, y, top] of [[20.5, 9.8, 13.4], [20.5, 14.2, 13.4], [24.6, 12, 11.6]] as const) {
      m.cyl([x, y, 6.4], [x, y, top], 1.35, 1.05, IRON_DARK, 0);
      m.cyl([x, y, top - 1.0], [x, y, top + 0.2], 1.25, 1.25, BRONZE, 0);
      m.ball(x, y, top + 0.15, 0.8, FURNACE, 2, 10, 6);
    }
    // A gun turret forward.
    m.cyl([29.5, 12, 6.1], [29.5, 12, 7.5], 2.1, 2.0, IRON_DARK, 0, 18);
    m.orb(29.5, 12, 7.5, 1.9, 1.9, 1.3, IRON, 0, true, 16, 6);
    for (const y of [11.35, 12.65]) m.cyl([30.5, y, 8.0], [35.6, y, 8.3], 0.34, 0.28, IRON_DARK, 0, 8);
    for (const y of [8.2, 12, 15.8]) engine(m, 2.8, y, 3.4, 1.75, 2.4, e, [1, 0.62, 0.3], IRON_DARK);
    return [1, 0.62, 0.3];
  },

  // Seren: a slender pale star-skiff under a tall crescent sail, an orrery turning at its bow with a star at its
  // heart and two moons on its rings, outrigger floats, a gold keel.
  (m, e) => {
    const hull: Sec[] = [
      { x: 2.6, w: 0.9, t: 0.8, b: 0.9, z: 3.2, p: 2.2 },
      { x: 5, w: 1.7, t: 1.3, b: 1.5, z: 3.2, p: 2.2 },
      { x: 14, w: 2.4, t: 1.7, b: 2.0, z: 3.2, p: 2.2 },
      { x: 26, w: 2.3, t: 1.6, b: 1.9, z: 3.2, p: 2.2 },
      { x: 35, w: 1.3, t: 1.0, b: 1.1, z: 3.1, p: 2.2 },
      { x: 42, w: 0, t: 0, z: 3.0 },
    ];
    m.loft(hull, PEARL, 0);
    m.loft(hull.slice(0, -1).map((s): Sec => ({ ...s, w: s.w + 0.1, t: 0.22, b: 0.22, z: (s.z ?? 0) - 0.4, p: 2 })).concat([{ x: 42.1, w: 0, t: 0, z: 2.6 }]), GOLD, 0, { segs: 16 });
    m.windows(hull, 9, 30, 9, 0.35, 0.22, WINDOW);
    m.wing({ le: 26, te: 9, y: 12, z: 1.4 }, { le: 19, te: 11.5, y: 12, z: -2.8 }, 0.45, GOLD, 0);
    // The mast, its boom and its sail: a crescent, bellied, rimmed in gold.
    m.cyl([15, 12, 4.6], [15, 12, 21], 0.42, 0.24, SILVER, 0, 8);
    m.ball(15, 12, 21.3, 0.5, STARLIGHT, 2, 8, 5);
    m.cyl([15, 12, 6.0], [7.6, 12, 6.2], 0.22, 0.18, SILVER, 0, 6);
    const rows = 18;
    const edge = (s: number): [V3, V3] => {
      const d = s * 6.95;
      const z = 13 + d;
      const xo = 15 - Math.sqrt(Math.max(0, 56.25 - d * d)), xi = 21.5 - Math.sqrt(Math.max(0, 72 - d * d));
      const belly = 1.1 * (1 - s * s);
      return [[xo, 12 + belly * 0.6, z], [Math.min(xi, 14.8), 12 + belly * 0.2, z]];
    };
    const rim: V3[] = [];
    for (let i = 0; i < rows; i++) {
      const s0 = -0.995 + (1.99 * i) / rows, s1 = -0.995 + (1.99 * (i + 1)) / rows;
      const [a0, b0] = edge(s0), [a1, b1] = edge(s1);
      m.tri(P(...a0), P(...b0), P(...b1), PEARL_SAIL, 3);
      m.tri(P(...a0), P(...b1), P(...a1), PEARL_SAIL, 3);
      rim.push(a0);
      if (i === rows - 1) rim.push(a1);
    }
    m.tube(rim, 0.2, 0.2, GOLD, 0, 6, false);
    // The orrery.
    m.cyl([28, 12, 4.4], [28, 12, 8.4], 0.32, 0.22, GOLD, 0, 8);
    m.ball(28, 12, 10.2, 1.5, STARLIGHT, 2, 16, 10);
    m.ring(28, 12, 10.2, 3.0, 0.16, 0.5, GOLD, 0);
    m.ring(28, 12, 10.2, 4.3, 0.13, -0.38, SILVER, 5);
    m.ball(28 + Math.cos(0.7) * 3 * Math.cos(0.5), 12 + Math.sin(0.7) * 3, 10.2 + Math.cos(0.7) * 3 * Math.sin(0.5), 0.6, MOON, 0, 10, 6);
    m.ball(28 + Math.cos(3.7) * 4.3 * Math.cos(-0.38), 12 + Math.sin(3.7) * 4.3, 10.2 + Math.cos(3.7) * 4.3 * Math.sin(-0.38), 0.5, MOON, 0, 10, 6);
    // Outrigger floats.
    m.mirror(() => {
      m.wing({ le: 21, te: 16.5, y: 10, z: 3.0 }, { le: 18, te: 14, y: 5.8, z: 2.4 }, 0.35, SILVER, 0);
      m.loft(
        [
          { x: 7, w: 0, t: 0, y: 5.4, z: 2.4 },
          { x: 8.4, w: 0.65, t: 0.65, y: 5.4, z: 2.4 },
          { x: 19, w: 0.75, t: 0.75, y: 5.4, z: 2.4 },
          { x: 23, w: 0, t: 0, y: 5.4, z: 2.4 },
        ],
        PEARL,
        5,
        { segs: 12 },
      );
      m.ball(7.2, 5.4, 2.4, 0.3, STARLIGHT, 2, 6, 4);
    });
    engine(m, 3.0, 12, 3.2, 0.95, 1.3, e, STARLIGHT, SILVER);
    return STARLIGHT;
  },

  // Pyrr: a living flare. A molten hull like a flame laid on its side, its tongues streaming astern, flame spikes
  // down its back and flanks, its white-hot heart burning through a ring of crust.
  (m, e) => {
    const hull: Sec[] = [
      { x: 1.5, w: 0.6, t: 0.5, b: 0.5, z: 3 },
      { x: 6, w: 2.2, t: 1.8, b: 1.4, z: 3 },
      { x: 12, w: 3.6, t: 2.8, b: 2.0, z: 3.1 },
      { x: 20, w: 4.4, t: 3.4, b: 2.4, z: 3.2 },
      { x: 28, w: 3.8, t: 3.0, b: 2.2, z: 3.2 },
      { x: 35, w: 2.4, t: 1.9, b: 1.4, z: 3.1 },
      { x: 41, w: 0, t: 0, z: 3 },
    ];
    m.loft(hull, EMBER, 6, { segs: 22 });
    for (let k = 0; k < 6; k++) {
      const al = (k / 6) * Math.PI * 2 + 0.3;
      const pts: V3[] = [];
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        const r = 2.4 + t * 3.4;
        pts.push([9 - t * 17, 12 + Math.cos(al) * r + Math.sin(t * 6 + k) * 0.8, 3 + Math.sin(al) * r * 0.8 + Math.cos(t * 5 + k * 2) * 0.6]);
      }
      m.tube(pts, 1.2, 0.08, k % 2 ? TONGUE : [1, 0.6, 0.12], 2, 8, false);
    }
    m.shard([24, 12, 5.6], [-0.7, 0, 1], 7.5, 1.4, TONGUE, 2);
    m.shard([18, 12, 5.8], [-0.8, 0, 0.9], 6, 1.15, TONGUE, 2);
    m.shard([12.5, 12, 5.0], [-0.9, 0, 0.7], 4.4, 0.95, TONGUE, 2);
    m.mirror(() => {
      m.shard([21, 8.6, 3.4], [-0.6, -0.8, 0.2], 6.4, 1.1, EMBER, 6);
      m.shard([14, 9.4, 2.9], [-0.7, -0.7, 0.05], 4.6, 0.9, EMBER, 6);
      m.shard([27, 9.5, 2.0], [-0.4, -0.6, -0.6], 3.6, 0.8, EMBER, 6);
    });
    m.ring(27.5, 12, 5.9, 2.3, 0.5, 0, CRUST, 4);
    m.ball(27.5, 12, 6.0, 1.9, HEART, 2, 18, 12);
    m.ball(2, 12, 3, 1.4, HEART, 2);
    e.push(P(1, 12, 3));
    return TONGUE;
  },
];

/** The Lost Races: a broken derelict, listing, its back snapped and its ribs showing, a mast stump, wreckage. */
function derelict(m: Mesh) {
  m.with(
    (p) => {
      const c = Math.cos(0.24), s = Math.sin(0.24);
      return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
    },
    () => {
      const fore: Sec[] = [
        { x: 24, w: 3.3, t: 2.5, b: 2.1, z: 3, p: 3 },
        { x: 25.5, w: 3.8, t: 3.0, b: 2.4, z: 3.2, p: 3 },
        { x: 31, w: 3.2, t: 2.6, b: 2.0, z: 3, p: 3 },
        { x: 37, w: 1.6, t: 1.4, b: 1.2, z: 2.8, p: 3 },
        { x: 39, w: 0.5, t: 0.4, b: 0.3, z: 2.8, p: 3 },
      ];
      const aft: Sec[] = [
        { x: 4, w: 3, t: 2.2, b: 2, z: 3.2, p: 3 },
        { x: 6, w: 3.6, t: 2.8, b: 2.4, z: 3.2, p: 3 },
        { x: 15.5, w: 3.8, t: 3.0, b: 2.4, z: 3.4, p: 3 },
        { x: 17, w: 3.3, t: 2.5, b: 2.1, z: 3.4, p: 3 },
      ];
      m.with((p) => {
        const c = Math.cos(0.14), sn = Math.sin(0.14);
        const q: V3 = [p[0] - 0.06, p[1] - 0.01, p[2]];
        return [q[0] * c - q[2] * sn + 0.06, q[1], q[0] * sn + q[2] * c];
      }, () => {
        m.loft(fore, RUST, 4, { segs: 12, flat: true });
        m.cyl([28, 12, 5.4], [29.6, 12.9, 11.2], 0.5, 0.32, RUST_DARK, 4, 8);
        m.cyl([29.1, 10.6, 9.0], [29.5, 15.2, 8.0], 0.22, 0.18, RUST_DARK, 4, 6);
        m.box(25.5, 28, 8.15, 8.4, 2.2, 4.2, RUST_DARK, 4);
        m.box(31, 33.5, 15.0, 15.3, 1.8, 3.6, RUST_DARK, 4);
      });
      m.loft(aft, RUST, 4, { segs: 12, flat: true });
      // The ribs across the break, some snapped short.
      for (const [x, span] of [[18.2, 1], [19.6, 0.55], [21, 0.9], [22.4, 0.4]] as const) {
        const pts: V3[] = [];
        for (let i = 0; i <= 8; i++) {
          const a = -0.25 + (Math.PI + 0.5) * span * (i / 8);
          pts.push([x, 12 + Math.cos(a) * 3.5, 3.2 + Math.sin(a) * 2.9]);
        }
        m.tube(pts, 0.36, 0.3, [0.62, 0.42, 0.32], 4, 6);
      }
      m.cyl([16.5, 12, 0.9], [25, 12, 0.7], 0.6, 0.6, RUST_DARK, 4, 8);
      m.ball(20.5, 11, 1.2, 0.5, [1, 0.45, 0.2], 2, 6, 4);
      m.box(8.5, 14, 9.6, 14.4, 5.6, 7.8, RUST, 4, 0.4);
      m.box(14.0, 14.2, 10.4, 12.2, 6.4, 7.2, RUST_DARK, 4);
      m.box(9, 11, 15.6, 15.85, 2.6, 4.4, RUST_DARK, 4);
      engine(m, 3.6, 12, 3.2, 1.3, 1.6, [], RUST_DARK, RUST, 4);
      m.ball(12, 12, 8.1, 0.32, [1, 0.3, 0.2], 2, 6, 4);
    },
  );
  // Wreckage drifting beside it.
  m.shard([16, 4, 7], [0.3, -0.5, 0.8], 2.2, 0.8, RUST, 4, 0.6);
  m.shard([31, 20, 6], [-0.6, 0.2, 0.4], 1.8, 0.7, RUST_DARK, 4, 1.4);
  m.shard([6, 18, 9], [0.2, 0.7, -0.3], 1.4, 0.55, RUST, 4, 2.2);
}

const models = new Map<string, ShipModel>();

/** A race's ship (or, `race` -1, a Lost Races derelict), built once. */
export function shipModel3d(race: number): ShipModel {
  const key = String(race);
  let model = models.get(key);
  if (!model) {
    const m = new Mesh();
    const engines: V3[] = [];
    let glow: RGB = [1, 0.4, 0.3];
    carried = [];
    if (race < 0) derelict(m);
    else glow = (BUILDERS[race] ?? BUILDERS[0])(m, engines);
    model = { mesh: new Float32Array(m.out), engines, glow, suns: carried };
    models.set(key, model);
  }
  return model;
}
