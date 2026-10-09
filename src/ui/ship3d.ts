/**
 * The ships armies sail the campaign map in, as genuine 3D objects in the map's scene (drawn by MapObjects,
 * nebula-objects.ts): one model per race, after the race's own design (ships.ts, the flat models they replace),
 * built here once as a mesh. Each hull is its top-down outline (the same paths) extruded into a body that curves
 * under towards its keel; domes, orbs, spires, pylons, legs, tentacles and rings are made as solids round it.
 * Their look (plated metal, crystal, living chitin, glowing furnaces) is worked out in the shader from each
 * part's material and colour, so there are no images to load.
 *
 * Local axes: +x forward (the bow), +y up, +z across (to the right); the ship is 1 long. The flat models' box
 * (40 x 24, x along the ship, y across it, heights in the same units) maps straight onto them.
 *
 * Each vertex: position (3), normal (3), colour (3), material (1). Materials: 0 plated metal, 1 glass or crystal,
 * 2 glowing (engines, suns, furnaces), 3 living (chitin, reef, hide), 4 dark gloss (void-metal, rust), 5 metal
 * in its holder's colour, 6 molten (an ember hull).
 */

export const SHIP_STRIDE = 10;

type V3 = [number, number, number];
type RGB = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** A point of the flat models' box (x along, y across, z up) in the ship's own axes. */
const P = (x: number, y: number, z: number): V3 => [(x - 20) / 40, z / 40, (y - 12) / 40];

/** An SVG path's outline as points (curves sampled), for M/L/H/V/C/S/Q/Z, absolute or relative. */
function outline(d: string): [number, number][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const pts: [number, number][] = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx2 = 0, cy2 = 0;
  const num = () => parseFloat(tokens[i++]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    for (let k = 1; k <= 6; k++) {
      const t = k / 6, u = 1 - t;
      pts.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey]);
    }
    cx2 = x2;
    cy2 = y2;
    x = ex;
    y = ey;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        pts.push([x, y]);
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        x = ox + num();
        y = oy + num();
        pts.push([x, y]);
        break;
      case 'H':
        x = ox + num();
        pts.push([x, y]);
        break;
      case 'V':
        y = oy + num();
        pts.push([x, y]);
        break;
      case 'C': {
        const a = [num(), num(), num(), num(), num(), num()];
        cubic(ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]);
        break;
      }
      case 'S': {
        const a = [num(), num(), num(), num()];
        cubic(2 * x - cx2, 2 * y - cy2, ox + a[0], oy + a[1], ox + a[2], oy + a[3]);
        break;
      }
      case 'Q': {
        const a = [num(), num(), num(), num()];
        const qx = ox + a[0], qy = oy + a[1];
        cubic(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ox + a[2] + (2 / 3) * (qx - ox - a[2]), oy + a[3] + (2 / 3) * (qy - oy - a[3]), ox + a[2], oy + a[3]);
        break;
      }
      case 'Z':
        x = sx;
        y = sy;
        // (Nothing but another command can follow a close.)
        if (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) i = tokens.length;
        break;
      default:
        i++;
    }
  }
  // (A closing point the same as the first is dropped.)
  if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-3) pts.pop();
  return pts;
}

class Mesh {
  out: number[] = [];
  private v(p: V3, n: V3, c: RGB, m: number) {
    this.out.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], m);
  }
  /** A flat triangle, facing away from `inside` (or as wound). */
  tri(a: V3, b: V3, c: V3, col: RGB, mat: number, inside?: V3) {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (inside) {
      const mid: V3 = [(a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]];
      if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) n = [-n[0], -n[1], -n[2]];
    }
    this.v(a, n, col, mat);
    this.v(b, n, col, mat);
    this.v(c, n, col, mat);
  }
  /** A triangle with its own normals at each corner (smooth). */
  stri(a: V3, na: V3, b: V3, nb: V3, c: V3, nc: V3, col: RGB, mat: number) {
    this.v(a, na, col, mat);
    this.v(b, nb, col, mat);
    this.v(c, nc, col, mat);
  }
  /**
   * A hull: an outline (box units) extruded from z0 up by h, its sides curving in towards the keel (taper), the deck
   * flat on top. Shaded smooth round its sides.
   */
  hull(d: string | [number, number][], z0: number, h: number, taper: number, col: RGB, mat: number, deck?: RGB) {
    const pts = typeof d === 'string' ? outline(d) : d;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const L = 5;
    // Rings from the keel (k 0) to the deck's edge (k L): inset towards the middle, less and less.
    const ring = (k: number) => {
      const t = k / L;
      const sc = 1 - taper * (1 - Math.sin((t * Math.PI) / 2));
      return pts.map(([x, y]) => P(cx + (x - cx) * sc, cy + (y - cy) * sc, z0 + h * t));
    };
    const rings = Array.from({ length: L + 1 }, (_, k) => ring(k));
    const centre = P(cx, cy, z0 + h / 2);
    // Side normals: outwards from the middle across, tipped by the curve under.
    const sideN = (k: number, j: number): V3 => {
      const p = rings[k][j];
      const n = pts.length;
      const a = rings[k][(j + 1) % n], b = rings[k][(j - 1 + n) % n];
      const along = sub(a, b);
      let out = norm([along[2], 0, -along[0]]);
      const away = sub(p, centre);
      if (out[0] * away[0] + out[2] * away[2] < 0) out = [-out[0], 0, -out[2]];
      const tip = taper * Math.cos(((k / L) * Math.PI) / 2) * 1.6;
      return norm([out[0], -tip, out[2]]);
    };
    for (let k = 0; k < L; k++)
      for (let j = 0; j < pts.length; j++) {
        const j2 = (j + 1) % pts.length;
        const a = rings[k][j], b = rings[k][j2], c = rings[k + 1][j2], e = rings[k + 1][j];
        const shade: RGB = [col[0] * (0.7 + 0.3 * (k / L)), col[1] * (0.7 + 0.3 * (k / L)), col[2] * (0.7 + 0.3 * (k / L))];
        this.stri(a, sideN(k, j), b, sideN(k, j2), c, sideN(k + 1, j2), shade, mat);
        this.stri(a, sideN(k, j), c, sideN(k + 1, j2), e, sideN(k + 1, j), shade, mat);
      }
    const top = rings[L], bottom = rings[0];
    const tc = P(cx, cy, z0 + h), bc = P(cx, cy, z0);
    for (let j = 0; j < pts.length; j++) {
      const j2 = (j + 1) % pts.length;
      this.stri(tc, [0, 1, 0], top[j], [0, 1, 0], top[j2], [0, 1, 0], deck ?? col, mat);
      this.stri(bc, [0, -1, 0], bottom[j2], [0, -1, 0], bottom[j], [0, -1, 0], [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6], mat);
    }
  }
  /** A raised block: an outline stood straight up from z0 by h. */
  block(d: string | [number, number][], z0: number, h: number, col: RGB, mat: number) {
    this.hull(d, z0, h, 0, col, mat);
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
        this.stri(a, na, c, nc, b, nb, col, mat);
        this.stri(a, na, e, ne, c, nc, col, mat);
      }
    if (dome) {
      // Its floor.
      for (let j = 0; j < segs; j++) {
        const [a] = at(0, j), [b] = at(0, j + 1);
        this.tri(P(x, y, cz), a, b, col, mat, P(x, y, cz + 1));
      }
    }
  }
  /** A four-sided spire (a diamond at its foot, as the flat models drew them) narrowing to a point. */
  spire(x: number, y: number, w: number, z0: number, h: number, col: RGB, mat: number) {
    const r = w / 2;
    const base: V3[] = [P(x + r, y, z0), P(x, y + r, z0), P(x - r, y, z0), P(x, y - r, z0)];
    const apex = P(x, y, z0 + h);
    const mid = P(x, y, z0 + h * 0.3);
    for (let i = 0; i < 4; i++) {
      this.tri(base[i], base[(i + 1) % 4], apex, col, mat, mid);
      this.tri(base[i], base[(i + 1) % 4], P(x, y, z0), col, mat, mid);
    }
  }
  /** A tube along a path (box units, with heights), its radius going from r0 to r1. */
  tube(path: V3[], r0: number, r1: number, col: RGB, mat: number, segs = 8) {
    const n = path.length;
    for (let k = 0; k < n - 1; k++) {
      const a = path[k], b = path[k + 1];
      const pa = P(a[0], a[1], a[2]), pb = P(b[0], b[1], b[2]);
      const dir = norm(sub(pb, pa));
      let side = norm(cross(dir, [0, 1, 0]));
      if (!isFinite(side[0]) || Math.hypot(...side) < 0.1) side = [1, 0, 0];
      const up = norm(cross(side, dir));
      const ra = (r0 + (r1 - r0) * (k / (n - 1))) / 40, rb = (r0 + (r1 - r0) * ((k + 1) / (n - 1))) / 40;
      for (let j = 0; j < segs; j++) {
        const t0 = (j / segs) * Math.PI * 2, t1 = ((j + 1) / segs) * Math.PI * 2;
        const o = (t: number): V3 => [side[0] * Math.cos(t) + up[0] * Math.sin(t), side[1] * Math.cos(t) + up[1] * Math.sin(t), side[2] * Math.cos(t) + up[2] * Math.sin(t)];
        const q = (p: V3, r: number, t: number): V3 => {
          const d = o(t);
          return [p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r];
        };
        this.stri(q(pa, ra, t0), o(t0), q(pb, rb, t0), o(t0), q(pb, rb, t1), o(t1), col, mat);
        this.stri(q(pa, ra, t0), o(t0), q(pb, rb, t1), o(t1), q(pa, ra, t1), o(t1), col, mat);
      }
    }
  }
  /** A ring (a thin torus) round (x, y) at height z, radius R, tube r, tipped about its across axis by `tilt`. */
  ring(x: number, y: number, z: number, R: number, r: number, tilt: number, col: RGB, mat: number) {
    const segs = 40, sides = 6;
    const at = (i: number, j: number): [V3, V3] => {
      const a = (i / segs) * Math.PI * 2, b = (j / sides) * Math.PI * 2;
      const cxr = Math.cos(a) * (R + r * Math.cos(b)), cyr = Math.sin(a) * (R + r * Math.cos(b)), czr = r * Math.sin(b);
      const nx = Math.cos(a) * Math.cos(b), ny = Math.sin(a) * Math.cos(b), nz = Math.sin(b);
      // Tipped about the across (y) axis.
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const px = cxr * ct - czr * st, pz = cxr * st + czr * ct;
      const qx = nx * ct - nz * st, qz = nx * st + nz * ct;
      return [P(x + px, y + cyr, z + pz), norm([qx, qz, ny])];
    };
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < sides; j++) {
        const [a, na] = at(i, j), [b, nb] = at(i + 1, j), [c, nc] = at(i + 1, j + 1), [e, ne] = at(i, j + 1);
        this.stri(a, na, b, nb, c, nc, col, mat);
        this.stri(a, na, c, nc, e, ne, col, mat);
      }
  }
}

// ---- Colours (after the flat models' gradients) ----
const WHITE_METAL: RGB = [0.9, 0.91, 0.94];
const GOLD: RGB = [0.92, 0.76, 0.42];
const SUN: RGB = [1, 0.86, 0.52];
const CRYSTAL_DARK: RGB = [0.36, 0.3, 0.62];
const CRYSTAL: RGB = [0.82, 0.76, 0.98];
const REEF: RGB = [0.28, 0.55, 0.57];
const REEF_LIGHT: RGB = [0.44, 0.74, 0.7];
const BELL: RGB = [0.62, 0.88, 0.86];
const CORE_CYAN: RGB = [0.62, 1, 0.94];
const CHITIN: RGB = [0.62, 0.52, 0.38];
const CHITIN_DARK: RGB = [0.3, 0.24, 0.18];
const CAP: RGB = [0.6, 0.86, 0.45];
const VOID: RGB = [0.13, 0.11, 0.24];
const VOID_DOME: RGB = [0.3, 0.25, 0.55];
const EYE: RGB = [0.8, 0.7, 1];
const IRON: RGB = [0.46, 0.47, 0.52];
const BRONZE: RGB = [0.8, 0.56, 0.26];
const FURNACE: RGB = [1, 0.58, 0.22];
const PEARL: RGB = [0.93, 0.95, 1];
const PEARL_SAIL: RGB = [0.9, 0.93, 1];
const STARLIGHT: RGB = [0.94, 0.97, 1];
const RING_GOLD: RGB = [1, 0.86, 0.55];
const MOON: RGB = [0.74, 0.79, 0.95];
const EMBER: RGB = [0.9, 0.36, 0.12];
const HEART: RGB = [1, 0.95, 0.7];
const TONGUE: RGB = [1, 0.55, 0.16];
const RUST: RGB = [0.5, 0.46, 0.5];
const MAST: RGB = [0.43, 0.42, 0.47];
const ENGINE: RGB = [1, 0.82, 0.58];

export interface ShipModel {
  mesh: Float32Array;
  /** Where its engines are, in its own axes (for their glow, and a trail while it flies). */
  engines: V3[];
}

const AUR_HULL = 'M39.5 12C34 7.6 23 6.2 13 6.6L5 8.4 2.5 10.2v3.6L5 15.6l8 1.8c10 .4 21-1 26.5-5.4z';
const XEL_HULL = 'M39.5 12 29 5.2 13 6.2 5 9.2 3 12l2 2.8 8 3 16 1z';

/** An engine's glow: a small bright orb at the stern, and where it is. */
function engine(m: Mesh, x: number, y: number, z: number, r: number, list: V3[]) {
  m.orb(x, y, z - r, r * 0.6, r, r, ENGINE, 2, false, 10, 6);
  list.push(P(x - r * 0.6, y, z));
}

const BUILDERS: ((m: Mesh, e: V3[]) => void)[] = [
  // Aureline: a sun-barque, a long sleek hull of white metal with golden trim, carrying its sun amidships between
  // two pylons, a bridge forward and twin engines astern.
  (m, e) => {
    m.hull(AUR_HULL, 0, 6.2, 0.22, WHITE_METAL, 0);
    m.block([[6, 11.6], [37, 11.6], [37, 12.4], [6, 12.4]], 6.2, 0.3, WHITE_METAL, 5);
    m.block('M32 12c-.6-1.6-2.6-2.4-5-2.2l-1 2.2 1 2.2c2.4.2 4.4-.6 5-2.2z', 6.2, 2.4, WHITE_METAL, 0);
    m.block('M7 8.2h6.5l.8 1.4H7.4z', 6.2, 2.2, GOLD, 0);
    m.block('M7 15.8h6.5l.8-1.4H7.4z', 6.2, 2.2, GOLD, 0);
    m.block('M16.2 8.6h1.2v1.6h-1.2z', 6.2, 4.6, GOLD, 0);
    m.block('M16.2 13.8h1.2v1.6h-1.2z', 6.2, 4.6, GOLD, 0);
    m.orb(16.8, 12, 9.1, 3.4, 3.4, 3.4, SUN, 2);
    engine(m, 7, 8.9, 7.9, 0.9, e);
    engine(m, 7, 15.1, 7.9, 0.9, e);
  },
  // Xel'Naru: a shard of dark crystal, faceted, with a tall crystal spire rising from it and two lesser ones.
  (m, e) => {
    m.hull(XEL_HULL, 0, 5.4, 0.3, CRYSTAL_DARK, 1, [0.55, 0.48, 0.82]);
    m.spire(21, 12, 9, 5.4, 22, CRYSTAL, 1);
    m.spire(13.5, 8.6, 3.6, 5.4, 7, CRYSTAL, 1);
    m.spire(13.5, 15.4, 3.6, 5.4, 7, CRYSTAL, 1);
    engine(m, 4, 12, 3.6, 1.4, e);
  },
  // Vorthane: a low living raft trailing tentacles, under a great glassy bell with a glowing core.
  (m, e) => {
    for (const [y0, y1] of [[7, 8], [10.5, 11.5], [13.5, 12.5], [17, 16]])
      m.tube([[17, y0, 1.6], [13, y0 - (y1 - y0) * 0.6, 1.2], [9, y1, 1], [5, y1 + (y1 - y0) * 0.5, 0.9]], 0.7, 0.3, REEF_LIGHT, 3);
    m.hull('M17 5c11-1 20 2.5 21 7-1 4.5-10 8-21 7-1.5-4.5-1.5-9.5 0-14z', 0, 3.6, 0.3, REEF, 3, REEF_LIGHT);
    m.orb(26, 12, 3.6, 9.5, 7.4, 11.8, BELL, 1, true);
    m.orb(26, 12, 4.4, 2.6, 2.2, 2.2, CORE_CYAN, 2);
    e.push(P(17, 12, 2));
  },
  // Ixquor: a chitin seed pod on spined legs, plated, its living cap swelling up from the bow.
  (m, e) => {
    for (const [x0, y0, x1, y1] of [[14, 8, 8, 3], [20, 7, 17, 1.5], [14, 16, 8, 21], [20, 17, 17, 22.5]]) m.tube([[x0, y0, 4], [(x0 + x1) / 2, (y0 + y1) / 2, 3], [x1, y1, 0]], 0.8, 0.35, CHITIN_DARK, 3);
    m.orb(21, 12, 0.5, 15, 7, 6.2, CHITIN, 3);
    for (const x of [11, 15, 19.5]) m.ring(x, 12, 6.5, 5.4 - Math.abs(x - 16) * 0.35, 0.35, Math.PI / 2, CHITIN_DARK, 3);
    m.orb(28, 12, 8, 5, 5, 6, CAP, 3, true);
    m.orb(28, 12, 9.5, 2.2, 2.2, 2.6, [0.85, 1, 0.7], 2);
    e.push(P(6, 12, 6.5));
  },
  // Nyxari: a low black blade of a ship, swept crescent wings either side of a hooded dome with one violet eye.
  (m, e) => {
    m.hull('M39 12C30 9.4 22 5.4 7 1.5c6 4.4 8.6 7.4 8.6 10.5S13 18.1 7 22.5C22 18.6 30 14.6 39 12z', 0, 2.8, 0.35, VOID, 4, [0.2, 0.17, 0.36]);
    m.orb(22, 12, 2.8, 5.6, 3.8, 6, VOID_DOME, 1, true);
    m.orb(25.4, 12, 6.2, 1.1, 0.9, 1, EYE, 2);
    engine(m, 15, 12, 3.4, 1.1, e);
  },
  // Korrath: a squat armoured forge-barge of dark iron banded in bronze, a ram at the bow, smokestacks and a
  // furnace glowing amidships, two great engines astern.
  (m, e) => {
    m.hull('M38.5 12 35 6.4 26 5 9 5.4 3.5 7.6v8.8L9 18.6l17 .4 9-1.4z', 0, 6, 0.12, IRON, 0);
    for (const x of [9, 18, 26]) m.block([[x - 0.5, 5.2], [x + 0.5, 5.2], [x + 0.5, 18.8], [x - 0.5, 18.8]], 0.4, 5.9, BRONZE, 5);
    m.block('M35 8.6 38.4 12 35 15.4 33 15.4V8.6z', 6, 1.6, BRONZE, 0);
    m.block('M24 9h5v6h-5z', 6, 2.6, IRON, 0);
    m.orb(19, 12, 6, 2.6, 2.6, 4.2, FURNACE, 2, true);
    for (const y of [8.6, 15.4]) m.tube([[13.2, y, 6], [13.2, y, 12.4]], 1.2, 1, BRONZE, 0);
    engine(m, 3.6, 9, 3.8, 1.4, e);
    engine(m, 3.6, 15, 3.8, 1.4, e);
  },
  // Seren: a slender pale star-skiff under a crescent sail, an orrery turning above its deck, two moons on its rings.
  (m, e) => {
    m.hull('M39.5 12C33 9.4 22 8.4 10 9.2L4 11v2l6 1.8c12 .8 23-.2 29.5-2.8z', 0, 3.6, 0.3, PEARL, 0);
    // The sail: a crescent laid over the deck, aft.
    const sail: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = Math.PI / 2 + (i / 16) * Math.PI;
      sail.push([15 + Math.cos(t) * 7.4, 12 - Math.sin(t) * 7.4]);
    }
    for (let i = 16; i >= 0; i--) {
      const t = Math.PI / 2 + (i / 16) * Math.PI;
      sail.push([15 + Math.cos(t) * 3.4, 12 - Math.sin(t) * 7.4]);
    }
    m.block(sail, 9, 0.4, PEARL_SAIL, 1);
    m.block('M12.4 11.4h1.2v1.2h-1.2z', 3.6, 5.4, PEARL, 0);
    m.orb(21, 12, 6.4, 2, 2, 2, STARLIGHT, 2);
    m.ring(21, 12, 8.4, 4.6, 0.25, 0, RING_GOLD, 5);
    m.ring(21, 12, 8.4, 6.2, 0.2, 0.9, STARLIGHT, 0);
    m.orb(27.2, 13.2, 7.6, 0.9, 0.9, 0.9, MOON, 0);
    m.orb(17.6, 8.6, 8.4, 0.7, 0.7, 0.7, MOON, 0);
    engine(m, 4, 12, 2.4, 1.1, e);
  },
  // Pyrr: a living flare, a hull like a flame laid on its side, its tongues streaming astern round a white-hot heart.
  (m, e) => {
    for (const [y0, y1] of [[7, 4.5], [12, 12], [17, 19.5]]) m.tube([[12, y0, 1.2], [8, (y0 + y1) / 2 + (y0 - 12) * 0.2, 1], [1, y1, 0.8]], 1, 0.15, TONGUE, 2);
    m.hull('M39 12C36.4 7.4 29 5.2 21 6.6 16 4.2 12 5 7 2.6c3 3.4 3.8 5.4-2 6.8 4 1.4 4 3.8 0 5.2 5.8 1.4 5 3.4 2 6.8 5-2.4 9-1.6 14-4 8 1.4 15.4-.8 18-5.4z', 0, 3.6, 0.3, EMBER, 6);
    m.orb(24, 12, 3.4, 3.2, 3.2, 3.2, HEART, 2);
    m.spire(16, 12, 3.2, 3.6, 6, TONGUE, 2);
    m.spire(12, 8.6, 2, 3.6, 3.6, TONGUE, 2);
    m.spire(12, 15.4, 2, 3.6, 3.6, TONGUE, 2);
    engine(m, 6, 12, 3, 1.6, e);
  },
];

/** The Lost Races: a battered derelict, listing, a broken mast stump on its deck. */
function derelict(m: Mesh) {
  m.hull('M38 12 30 5 12 6 6 9l2 3-2 3 6 3 18 1z', 0, 4.8, 0.25, RUST, 4);
  m.block('M27 10h3v4h-3z', 4.8, 2, RUST, 4);
  m.spire(31, 12, 3, 4.8, 6, MAST, 4);
}

const models = new Map<string, ShipModel>();

/** A race's ship (or, `race` -1, a Lost Races derelict), built once. */
export function shipModel3d(race: number): ShipModel {
  const key = String(race);
  let model = models.get(key);
  if (!model) {
    const m = new Mesh();
    const engines: V3[] = [];
    if (race < 0) derelict(m);
    else (BUILDERS[race] ?? BUILDERS[0])(m, engines);
    model = { mesh: new Float32Array(m.out), engines };
    models.set(key, model);
  }
  return model;
}
