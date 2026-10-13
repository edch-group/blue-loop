/**
 * The Captain's model, wherever he stands: on the campaign menu's ship (base3d.ts, his coat's tails streaming as a
 * part of their own) and on the map's (captain-ship.ts, at rest) [direction: the Captain standing atop the campaign
 * map's ship too]. Box units as the ships' (ship3d.ts): 40 to the model's 1.
 */
import { HULL_DEEP, seq } from './captain-ship';
import { Mesh, type RGB, type V3 } from './ship3d';

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** A point of the box (x along, y across, z up) in the model's own axes. */
const B = (x: number, y: number, z: number): V3 => [(x - 20) / 40, z / 40, (y - 12) / 40];

// ---- The Captain ----
const COAT: RGB = [0.27, 0.28, 0.33];
const COAT_SHADE: RGB = [0.21, 0.22, 0.27];
const LINING: RGB = [0.24, 0.36, 0.4];
const TUNIC: RGB = [0.34, 0.37, 0.44];
const LEATHER: RGB = [0.46, 0.33, 0.23];
const STRAP: RGB = [0.3, 0.21, 0.15];
const BUCKLE: RGB = [0.74, 0.68, 0.58];
const SCARF: RGB = [0.52, 0.55, 0.62];
const TROUSERS: RGB = [0.22, 0.22, 0.26];
const BOOT: RGB = [0.3, 0.24, 0.2];
const GLOVE: RGB = [0.2, 0.17, 0.16];
const SKIN: RGB = [0.84, 0.66, 0.54];
const SKIN_SHADE: RGB = [0.74, 0.55, 0.45];
const HAIR: RGB = [0.15, 0.12, 0.11];
const STUBBLE: RGB = [0.3, 0.24, 0.21];
const BANDAGE: RGB = [0.92, 0.89, 0.83];
const PLATE: RGB = [0.62, 0.66, 0.74];
const INK: RGB = [0.1, 0.09, 0.1];
// (Cloth, leather, skin and hair are soft, matt: the "living" material; metal is plated; the blade glows.)
const SOFT = 3;

/** Points along a limb (box units) and their joint balls: a tube from each to the next, tapering. */
export function limb(m: Mesh, pts: V3[], r0: number, r1: number, col: RGB) {
  m.tube(pts, r0, r1, col, SOFT, 18);
  for (let i = 1; i < pts.length - 1; i++) m.ball(pts[i][0], pts[i][1], pts[i][2], r0 + ((r1 - r0) * i) / (pts.length - 1), col, SOFT, 16, 10);
}

/** Turned about a line through a point (box units) along the model's x, y or z: for a feature's own angle. */
export function turned(m: Mesh, at: V3, axis: 'x' | 'y' | 'z', a: number, build: () => void) {
  const c = B(at[0], at[1], at[2]), cs = Math.cos(a), sn = Math.sin(a);
  m.with((p) => {
    const d = sub3(p, c);
    // (Model axes: box x → x, box z → y, box y → z.)
    if (axis === 'x') return [p[0], c[1] + d[1] * cs - d[2] * sn, c[2] + d[1] * sn + d[2] * cs];
    if (axis === 'z') return [c[0] + d[0] * cs + d[2] * sn, p[1], c[2] - d[0] * sn + d[2] * cs];
    return [c[0] + d[0] * cs - d[1] * sn, c[1] + d[0] * sn + d[1] * cs, p[2]];
  }, build);
}

/**
 * The Captain, standing at the rail, facing ahead with the ship [direction: facing forwards with the ship, one leg up on
 * the railing, no sword]: the right boot up on the rail, that forearm across its knee, the left fist on his hip;
 * after the art otherwise: a long coat open over a fitted tunic, a leather harness and belt, a steel plate on the
 * right shoulder, a scarf, worn boots; weathered: stubble, tousled dark hair, a bandaged brow, his face set and tired,
 * looking out ahead. Built facing +y (box), feet at z 0, 40 tall; the coat's tails and the scarf's
 * end are a part of their own (they stream in the wind).
 */
export function captainModel(): Float32Array {
  const m = new Mesh();
  // Legs: the right raised, its boot up on the rail ahead; the left straight, planted on the deck.
  limb(m, [[22, 12.6, 21], [22, 18.5, 18.5], [22, 20.4, 10]], 1.75, 1.3, TROUSERS);
  limb(m, [[18, 11.8, 21], [17.8, 11.6, 11.6], [17.6, 11.4, 2.6]], 1.75, 1.3, TROUSERS);
  // Boots: a shaft up the shin, a strap at its top, the foot and its sole (the right's on the rail).
  for (const [ax, ay, az, kx, ky, kz] of [[22, 20.4, 10, 22, 18.5, 18.5], [17.6, 11.4, 2.6, 17.8, 11.6, 11.6]] as const) {
    const d = norm3([kx - ax, ky - ay, kz - az]);
    const top: V3 = [ax + d[0] * 5.5, ay + d[1] * 5.5, az + d[2] * 5.5];
    m.tube([top, [ax, ay, az - 1.2]], 1.5, 1.45, BOOT, SOFT, 18);
    m.ball(top[0], top[1], top[2], 1.55, STRAP, SOFT, 14, 6);
    m.rbox(ax, ay + 1.4, az - 1.45, 1.45, 3, 1.15, BOOT, SOFT, 3, 3);
    m.rbox(ax, ay + 1.4, az - 2.35, 1.5, 3.1, 0.3, HULL_DEEP, SOFT, 4, 4);
  }
  // A guard strapped over the raised knee.
  m.rbox(22, 19.9, 19.2, 1.3, 0.8, 1.6, PLATE, 0, 2, 2.4);
  // Hips, belt (buckle, pouches), the tunic, the harness crossed over it.
  m.rbox(20, 12, 21.3, 3.5, 2.3, 2.3, TROUSERS, SOFT, 2.4, 2.4);
  m.rbox(20, 12, 23.2, 3.6, 2.45, 0.75, STRAP, SOFT, 2.6, 6);
  m.rbox(20, 14.45, 23.2, 0.75, 0.25, 0.55, BUCKLE, 0, 4, 4);
  for (const sd of [-1, 1]) m.rbox(20 + sd * 2.6, 14, 22.6, 0.9, 0.7, 1, LEATHER, SOFT, 3, 3);
  m.rbox(20, 12, 25.6, 3.3, 2.2, 2.8, TUNIC, SOFT, 2.4, 2.4);
  m.rbox(20, 12.1, 29.6, 3.9, 2.5, 3.6, TUNIC, SOFT, 2.4, 2.4);
  for (const sd of [-1, 1]) turned(m, [20, 14.5, 28.5], 'y', sd * 0.5, () => m.rbox(20, 14.45, 28.5, 0.42, 0.22, 4.4, LEATHER, SOFT, 3, 4));
  m.ball(20, 14.65, 28.5, 0.45, BUCKLE, 0, 10, 6);
  // The coat over it, open down the front: its back and sides to the hips, lapels turned back, a raised collar.
  m.rbox(20, 11.2, 28, 4.4, 1.9, 6.4, COAT, SOFT, 2.4, 3);
  for (const sd of [-1, 1]) {
    m.rbox(20 + sd * 3.5, 12.4, 28.2, 1.1, 2.6, 6.2, COAT, SOFT, 2.6, 3);
    turned(m, [20 + sd * 2.6, 14.6, 31], 'y', sd * 0.32, () => m.rbox(20 + sd * 2.6, 14.55, 30.6, 0.65, 0.3, 3.2, LINING, SOFT, 3, 3));
  }
  m.rbox(20, 11, 34.4, 3.3, 1.6, 1.9, COAT, SOFT, 2, 3);
  // Shoulders: the left under the coat; the right under a steel plate two lames deep.
  m.ball(16.1, 12, 32.6, 1.75, COAT, SOFT, 16, 10);
  m.ball(23.9, 12, 32.6, 1.75, COAT, SOFT, 16, 10);
  turned(m, [24.4, 12, 33.2], 'y', -0.35, () => {
    m.rbox(24.4, 12, 33.6, 2.2, 2.2, 0.85, PLATE, 0, 2, 3);
    m.rbox(25.1, 12, 32.4, 1.9, 2, 0.7, PLATE, 0, 2, 3);
  });
  // The right forearm laid across the raised knee, the hand hanging over it; the left fist on his hip.
  limb(m, [[24.2, 12, 32.4], [24.4, 15.6, 24.6], [22.6, 19.6, 21.2]], 1.25, 1.0, COAT_SHADE);
  m.rbox(23, 18.8, 21.8, 1.1, 0.75, 1.1, LINING, SOFT, 2, 3);
  m.ball(22.4, 20.6, 20.8, 1.05, GLOVE, SOFT, 14, 8);
  limb(m, [[15.8, 12, 32.4], [12.8, 11.4, 27.6], [15.2, 12.8, 23.8]], 1.25, 1.0, COAT_SHADE);
  m.rbox(14.6, 12.4, 24.6, 1.1, 1.1, 0.75, LINING, SOFT, 2, 3);
  m.ball(15.6, 13, 23.4, 1.05, GLOVE, SOFT, 14, 8);
  // Neck, scarf wound round it; the head, looking out ahead, chin up a little.
  m.cyl([20, 12.2, 33.6], [20, 12.4, 35.6], 0.9, 0.85, SKIN, SOFT, 14);
  m.rbox(20, 12.1, 34.6, 2.2, 2.1, 1.1, SCARF, SOFT, 2, 2.6);
  turned(m, [20, 12.3, 35.4], 'x', -0.08, () =>
    turned(m, [20, 12.3, 35.4], 'z', 0, () => {
      const H = { x: 20, y: 12.5, z: 37.6, rx: 1.9, ry: 2.15, rz: 2.45 };
      m.rbox(H.x, H.y, H.z, H.rx, H.ry, H.rz, SKIN, SOFT, 2, 2, 32, 20);
      const face = (dx: number, dz: number) => H.y + H.ry * Math.sqrt(Math.max(0, 1 - (dx / H.rx) ** 2 - (dz / H.rz) ** 2));
      // A jaw, stubbled; the mouth a set line.
      m.rbox(H.x, H.y + 0.25, H.z - 1.25, 1.9, 2.05, 1.3, STUBBLE, SOFT, 2, 2, 28, 14);
      m.rbox(H.x, face(0, -0.85) - 0.05, H.z - 0.85, 0.75, 0.2, 0.2, STUBBLE, SOFT, 2, 2, 12, 6);
      m.rbox(H.x, face(0, -1.15) + 0.01, H.z - 1.15, 0.5, 0.1, 0.07, INK, SOFT, 2, 2, 12, 6);
      // Eyes under heavy brows, shadowed; a strong nose; ears.
      for (const sd of [-1, 1]) {
        const ex = H.x + sd * 0.68;
        m.rbox(ex, face(sd * 0.68, 0.2) - 0.08, H.z + 0.2, 0.26, 0.14, 0.17, INK, 0, 2, 2, 12, 8);
        m.rbox(ex, face(sd * 0.68, 0.45) - 0.03, H.z + 0.45, 0.38, 0.18, 0.16, SKIN_SHADE, SOFT, 2, 2, 12, 8);
        turned(m, [ex, face(sd * 0.68, 0.72), H.z + 0.72], 'y', sd * 0.25, () => m.rbox(ex, face(sd * 0.68, 0.72) - 0.04, H.z + 0.72, 0.48, 0.2, 0.13, HAIR, SOFT, 2, 2, 12, 8));
        m.rbox(H.x + sd * 1.88, H.y, H.z - 0.15, 0.26, 0.45, 0.6, SKIN, SOFT, 2, 2, 12, 8);
      }
      m.rbox(H.x, face(0, -0.25) + 0.08, H.z - 0.25, 0.28, 0.36, 0.5, SKIN_SHADE, SOFT, 2, 2, 12, 8);
      // A bandage round the brow.
      m.rbox(H.x, H.y + 0.05, H.z + 1.25, 1.95, 2.2, 0.28, BANDAGE, SOFT, 2, 3, 28, 8);
      // Tousled dark hair: a mop, a fringe swept over, locks over the ears and down the neck, tufts.
      m.rbox(H.x, H.y - 0.4, H.z + 1.2, 2.1, 2.15, 1.55, HAIR, SOFT, 2, 2, 28, 16);
      m.rbox(H.x + 0.5, face(0.5, 1.6) - 0.5, H.z + 1.7, 1.3, 0.6, 0.6, HAIR, SOFT, 2, 2, 18, 10);
      for (const sd of [-1, 1]) m.rbox(H.x + sd * 1.85, H.y - 0.4, H.z + 0.4, 0.5, 1.2, 1.2, HAIR, SOFT, 2, 2, 16, 10);
      m.rbox(H.x, H.y - 1.6, H.z - 0.3, 1.8, 0.8, 1.6, HAIR, SOFT, 2, 2, 20, 12);
      for (const [dx, dy, dz] of [[-0.8, 0.2, 2.5], [0.9, -0.6, 2.5], [0, -1.2, 2.1], [-1.3, -1, 1.9]] as const)
        m.rbox(H.x + dx, H.y + dy, H.z + dz, 0.8, 0.9, 0.55, HAIR, SOFT, 2, 2, 14, 8);
    }),
  );
  return new Float32Array(m.out);
}

/**
 * A sheet of cloth through a grid of points (box units; rows down it, columns across), each face shaded on whichever
 * side is seen.
 */
export function cloth(m: Mesh, grid: V3[][], col: RGB, hem: RGB) {
  for (let r = 0; r < grid.length - 1; r++)
    for (let c = 0; c < grid[r].length - 1; c++) {
      const [a, b, d, e] = [grid[r][c], grid[r][c + 1], grid[r + 1][c], grid[r + 1][c + 1]].map((q) => B(q[0], q[1], q[2]));
      const tone = r === grid.length - 2 ? hem : col;
      m.tri(a, b, e, tone, SOFT);
      m.tri(a, e, d, tone, SOFT);
    }
}

/**
 * The coat's skirt and the scarf's end, streaming back in the wind (a part of their own, swung as one): the skirt a
 * sheet from the waist round his back and sides, falling and blown back, rippling, its hem torn ragged.
 */
export function streamerModel(): Float32Array {
  const m = new Mesh();
  const cols = 14, rows = 12;
  const grid: V3[][] = [];
  const rnd = seq(5);
  const tear = Array.from({ length: cols + 1 }, () => 0.72 + rnd() * 0.28);
  for (let r = 0; r <= rows; r++) {
    const row: V3[] = [];
    for (let c = 0; c <= cols; c++) {
      // Round the waist from his left side, across the back, to his right (an arc behind him).
      const a = Math.PI * (0.05 + 0.9 * (c / cols));
      const t = (r / rows) * tear[c];
      const rx = 3.9 + t * 1.8, ry = 2.6 + t * 1.2;
      const back = t * t * 7.5 + t * 2;
      const ripple = Math.sin(c * 1.3 + t * 7) * 0.35 * t;
      row.push([20 - Math.cos(a) * rx, 12 - Math.sin(a) * ry - back + ripple, 23.4 - t * 19 + t * t * 5]);
    }
    grid.push(row);
  }
  cloth(m, grid, COAT, COAT_SHADE);
  // The scarf's end, flying back from the neck.
  m.tube([[20, 10.6, 34.4], [19, 9, 34], [17.6, 7.2, 33.6], [16.4, 5.4, 33.6]], 0.75, 0.4, SCARF, SOFT, 12);
  return new Float32Array(m.out);
}
