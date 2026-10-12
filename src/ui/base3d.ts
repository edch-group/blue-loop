/**
 * The Captain's ship, as the campaign's menu [direction: the whole menu the ship floating through space side on at a
 * slight angle, the Captain standing atop it (as in the art); a click on a section moves the camera to an angle where
 * that is done, all on the same ship, still flying; very detailed models of the Captain and the ship; lit as the rest
 * of the game (not cel shaded)].
 *
 * The ship drifts on through the dust of space, rising and rolling a little, its engines burning and (while it is
 * still a wreck) smoke trailing from its wounds. The Captain stands at its foredeck's rail facing ahead, a boot up on it, the coat and scarf
 * streaming back in the slipstream. Three places on it are the menu's sections: the Captain (the hero panel), the ship
 * (its fitting), and its sensor array (research: the skill tree). Each has a camera that frames it beside its page.
 *
 * Modelled as the map's ships are (ship3d.ts's Mesh; box units, 40 to the model's 1: x along, y across, z up) and
 * lit by the same shader (nebula-objects.ts), so it belongs to the same game.
 */
import { SHIP_FRAG, SHIP_VERT } from './nebula-objects';
import { Mesh, SHIP_STRIDE, type CaptainShipSpec, type RGB, type V3 } from './ship3d';
import { uiZoom } from './viewport';

export type BaseZone = 'hangar' | 'captain' | 'research';
export const BASE_ZONES: BaseZone[] = ['hangar', 'captain', 'research'];

// ---- Matrices (column-major, as WebGL takes them) ----
type M4 = Float32Array;
function perspective(fov: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
function lookAt(eye: V3, target: V3): M4 {
  const f = norm3(sub3(target, eye));
  const r = norm3(cross3(f, [0, 1, 0]));
  const u = cross3(r, f);
  return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot3(r, eye), -dot3(u, eye), dot3(f, eye), 1]);
}
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const translate = (x: number, y: number, z: number): M4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const scale = (s: number): M4 => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
function rotX(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
function rotY(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
function rotZ(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
const IDENTITY = translate(0, 0, 0);
const apply = (m: M4, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
/** A point of the box (x along, y across, z up) in the model's own axes. */
const B = (x: number, y: number, z: number): V3 => [(x - 20) / 40, z / 40, (y - 12) / 40];

// ---- Colours ----
const HULL: RGB = [0.66, 0.68, 0.73];
const HULL_DARK: RGB = [0.4, 0.42, 0.48];
const HULL_DEEP: RGB = [0.26, 0.27, 0.31];
const RUST: RGB = [0.52, 0.41, 0.36];
const SCORCH: RGB = [0.17, 0.15, 0.15];
const ENGINE: RGB = [1, 0.8, 0.52];
const EMBER: RGB = [1, 0.55, 0.22];
const WINDOW: RGB = [1, 0.9, 0.62];
const CANOPY: RGB = [0.16, 0.22, 0.34];
const LAMP_AMBER: RGB = [1, 0.78, 0.36];
const LAMP_CYAN: RGB = [0.55, 0.88, 1];
const STRIPE: RGB = [0.86, 0.62, 0.26];
const PART_TINT: Record<string, RGB> = { dwarf: [0.62, 0.7, 0.82], stellar: [0.93, 0.75, 0.38], anomaly: [0.72, 0.56, 0.98] };

/** A small, fixed sequence of numbers from 0 to 1 (the same ship every time). */
function seq(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** The hull's sections (box units), swelling with the Captain's level. */
function hullSecs(k: number) {
  return [
    { x: 1.5, w: 3.4 * k, t: 2.6 * k, b: 2.4 * k, z: 5, p: 3.4 },
    { x: 4, w: 4.4 * k, t: 3.2 * k, b: 3 * k, z: 5, p: 3.4 },
    { x: 13, w: 4.7 * k, t: 3.4 * k, b: 3.2 * k, z: 5, p: 3.4 },
    { x: 25, w: 4.5 * k, t: 3.2 * k, b: 3 * k, z: 5, p: 3.2 },
    { x: 32, w: 3.7 * k, t: 2.7 * k, b: 2.6 * k, z: 4.9, p: 3 },
    { x: 37, w: 2.1 * k, t: 1.6 * k, b: 1.8 * k, z: 4.6, p: 2.6 },
    { x: 40.5, w: 0.25, t: 0.25, b: 0.35, z: 4.3, p: 2 },
  ];
}
/** The hull's half-width and its top at x (box units), by its sections. */
function hullAt(k: number, x: number) {
  const s = hullSecs(k);
  for (let i = 0; i < s.length - 1; i++)
    if (x <= s[i + 1].x) {
      const t = (x - s[i].x) / (s[i + 1].x - s[i].x);
      const w = s[i].w + (s[i + 1].w - s[i].w) * t, top = s[i].z + s[i].t + (s[i + 1].z + s[i + 1].t - s[i].z - s[i].t) * t;
      return { w, top, z: s[i].z + (s[i + 1].z - s[i].z) * t, b: s[i].b + (s[i + 1].b - s[i].b) * t };
    }
  return { w: 0.2, top: 4.5, z: 4.3, b: 0.3 };
}

/** Where the Captain stands on the foredeck (box units), and the deck's height there. */
const STAND = { x: 32, y: 12 };

/**
 * The Captain's ship, in detail: a battered corvette, lofted and plated, a flat foredeck, a bridge tower with its
 * windows lit, a dorsal spine, an engine block of three bells, pipes and vents and hatches down its flanks, a sensor
 * array astern (research), a mast; every part fitted built on in its place and its rarity's colour; and, while the
 * Captain is still low, the wear of it: scorched and torn plating, a burning gash, the ribs showing.
 */
function shipModel(spec: CaptainShipSpec): { mesh: Float32Array; smoke: V3[]; engines: V3[]; deck: number } {
  const m = new Mesh();
  const lv = Math.max(0, Math.min(15, spec.level));
  const k = 1 + lv * 0.025;
  const worn = lv < 4;
  const rnd = seq(7);
  const tint = (slot: string): RGB => PART_TINT[spec.rarity[slot] ?? 'dwarf'] ?? PART_TINT.dwarf;
  const secs = hullSecs(k);
  const smoke: V3[] = [];
  const engines: V3[] = [];

  // The hull, smooth-plated, its keel darker; a band of hazard stripe at the bow.
  m.loft(secs, HULL, 0, { segs: 36, under: 0.35 });
  m.band(secs, 33.5, 0.9, 0.12, STRIPE, 0);
  m.band(secs, 9, 1.2, 0.18, HULL_DARK, 0);
  m.band(secs, 21, 1.2, 0.18, HULL_DARK, 0);
  // The keel: a fin below, and landing skids folded up against the hull.
  m.wing({ le: 24, te: 10, y: 12, z: 5 - 3 * k }, { le: 17, te: 11, y: 12, z: 5 - 3 * k - 3.2 }, 0.7, HULL_DARK, 0);
  for (const sd of [-1, 1]) {
    m.tube([[12, 12 + sd * 3.4 * k, 2.6], [12, 12 + sd * 3.9 * k, 1.2], [26, 12 + sd * 3.9 * k, 1.4]], 0.35, 0.35, HULL_DEEP, 4, 8);
    m.cyl([26, 12 + sd * 3.9 * k, 1.4], [28.5, 12 + sd * 3.9 * k, 2.2], 0.35, 0.3, HULL_DEEP, 4, 8);
  }

  // The foredeck: a flat plate where the Captain stands, a rail round its edge.
  const dk = hullAt(k, 27);
  const deck = dk.top + 0.55;
  m.box(21, 34, 12 - dk.w * 0.72, 12 + dk.w * 0.72, dk.top - 0.4, deck, HULL_DARK, 0, 0.35);
  for (let x = 21.5; x <= 33.5; x += 1.5)
    for (const sd of [-1, 1]) m.cyl([x, 12 + sd * dk.w * 0.68, deck], [x, 12 + sd * dk.w * 0.68, deck + 1.1], 0.09, 0.09, HULL_DEEP, 0, 6);
  for (const sd of [-1, 1]) m.tube([[21.5, 12 + sd * dk.w * 0.68, deck + 1.1], [33.5, 12 + sd * dk.w * 0.68, deck + 1.1]], 0.1, 0.1, HULL_DEEP, 0, 6);
  // (And across its fore end, where the Captain sets his boot.)
  m.tube([[33.5, 12 - dk.w * 0.68, deck + 1.1], [33.5, 12 + dk.w * 0.68, deck + 1.1]], 0.1, 0.1, HULL_DEEP, 0, 6);
  for (const y of [-1, 1]) m.cyl([33.5, 12 + y * dk.w * 0.25, deck], [33.5, 12 + y * dk.w * 0.25, deck + 1.1], 0.09, 0.09, HULL_DEEP, 0, 6);
  // A hatch and a bollard on it.
  m.cyl([23.4, 12 - 1.6, deck], [23.4, 12 - 1.6, deck + 0.25], 1, 1, HULL, 0, 18);
  m.ring(23.4, 12 - 1.6, deck + 0.27, 0.8, 0.1, 0, HULL_DEEP, 0);
  m.cyl([32.4, 12 + 1.4, deck], [32.4, 12 + 1.4, deck + 0.8], 0.35, 0.3, HULL_DEEP, 0, 10);

  // The dorsal spine, from the engines to the bridge, and the bridge tower on it.
  m.spine(secs, 3, 19, 1, 0.8, HULL_DARK, 5);
  const bz = hullAt(k, 14).top - 0.2;
  const bridge = [
    { x: 9, w: 2.2 * k, t: 0.4, b: 0.2, z: bz, p: 3 },
    { x: 11, w: 2.9 * k, t: 2.6, b: 0.2, z: bz, p: 3 },
    { x: 17, w: 2.6 * k, t: 2.4, b: 0.2, z: bz, p: 3 },
    { x: 19.5, w: 1.7 * k, t: 1.1, b: 0.2, z: bz, p: 2.6 },
    { x: 20.5, w: 0, t: 0, z: bz },
  ];
  m.loft(bridge, HULL, 0, { segs: 24, under: 0.2 });
  // Its windows: a band round the front, dark glass, lit within.
  m.loft(
    [
      { x: 17.2, w: 2.65 * k, t: 0.7, b: 0.1, z: bz + 1.4, p: 3 },
      { x: 19.6, w: 1.75 * k, t: 0.45, b: 0.1, z: bz + 0.8, p: 2.6 },
      { x: 20.3, w: 0, t: 0, z: bz + 0.6 },
    ],
    CANOPY,
    1,
    { segs: 20 },
  );
  for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) m.ball(12 + i * 1.2, 12 + sd * 2.78 * k, bz + 1.5, 0.22, WINDOW, 2, 6, 4);
  // The mast: a lattice of rods, a lamp at its top, a whip antenna, a small dish.
  m.cyl([13.5, 12, bz + 2.6], [13.5, 12, bz + 7.5], 0.18, 0.12, HULL_DEEP, 0, 8);
  m.cyl([13.5, 12, bz + 4.4], [12.2, 12, bz + 4.8], 0.1, 0.1, HULL_DEEP, 0, 6);
  m.cyl([13.5, 12, bz + 5.8], [15, 12, bz + 6.2], 0.08, 0.08, HULL_DEEP, 0, 6);
  m.ball(13.5, 12, bz + 7.6, 0.3, LAMP_AMBER, 2, 8, 5);
  m.cyl([15.5, 12.8, bz + 2.5], [16.4, 13.2, bz + 9], 0.05, 0.03, HULL_DEEP, 0, 5);
  m.orb(12.2, 12, bz + 4.7, 0.7, 0.7, 0.2, HULL, 0, true, 12, 4);
  // Windows down the hull's sides, and running lights.
  m.windows(secs, 6, 31, 12, 0.35, 0.22, WINDOW);
  m.ball(39.6, 12, 4.6, 0.25, LAMP_CYAN, 2, 8, 5);
  for (const sd of [-1, 1]) m.ball(30, 12 + sd * (hullAt(k, 30).w + 0.1), 5, 0.22, sd < 0 ? LAMP_AMBER : LAMP_CYAN, 2, 8, 5);

  // The flanks: pipes run along each, vents and hatches and plates set into it.
  for (const sd of [-1, 1]) {
    const pipe: V3[] = [];
    for (let x = 4; x <= 31; x += 3) pipe.push([x, 12 + sd * (hullAt(k, x).w + 0.25), 4.1 + 0.15 * Math.sin(x)]);
    m.tube(pipe, 0.22, 0.22, HULL_DEEP, 4, 8);
    const pipe2: V3[] = [];
    for (let x = 6; x <= 26; x += 4) pipe2.push([x, 12 + sd * (hullAt(k, x).w + 0.15), 3.2]);
    m.tube(pipe2, 0.14, 0.14, RUST, 4, 6);
    for (let i = 0; i < 16; i++) {
      const x = 5 + rnd() * 27, w = 0.6 + rnd() * 1.6, h = 0.4 + rnd() * 0.9, z = 4.6 + rnd() * 1.8;
      const y = 12 + sd * (hullAt(k, x + w / 2).w - 0.05);
      m.box(x, x + w, sd < 0 ? y - 0.25 : y, sd < 0 ? y : y + 0.25, z, z + h, rnd() < 0.3 ? HULL_DEEP : HULL_DARK, 0, 0.06);
    }
    // Vents: a row of slats.
    for (let i = 0; i < 5; i++) {
      const x = 7 + i * 0.7, y = 12 + sd * (hullAt(k, x).w + 0.02);
      m.box(x, x + 0.4, sd < 0 ? y - 0.15 : y, sd < 0 ? y : y + 0.15, 6.2, 7.2, HULL_DEEP, 0);
    }
  }
  // Greebles on the back: boxes and caps between the bridge and the engines.
  for (let i = 0; i < 14; i++) {
    const x = 3 + rnd() * 6, y = 12 + (rnd() - 0.5) * 5, top = hullAt(k, x).top - 0.2, s = 0.4 + rnd() * 0.8;
    if (rnd() < 0.5) m.box(x, x + s, y, y + s * 0.8, top, top + 0.3 + rnd() * 0.6, rnd() < 0.5 ? HULL_DARK : HULL, 0, 0.05);
    else m.cyl([x, y, top], [x, y, top + 0.4 + rnd() * 0.5], s * 0.4, s * 0.35, HULL_DEEP, 0, 10);
  }

  // The engine block: a housing astern, three bells, burning; vanes between them.
  m.rbox(1.8, 12, 5, 2.4, 4.6 * k, 3.3 * k, HULL_DARK, 0, 4, 4, 32, 16);
  for (const [dy, dz] of [[-2.6, 0.6], [2.6, 0.6], [0, -1.6]] as const) {
    const y = 12 + dy * k, z = 5 + dz * k;
    m.cyl([0, y, z], [-2.6, y, z], 1.25 * k, 1.75 * k, HULL_DEEP, 4, 24);
    m.ring(-2.55, y, z, 1.7 * k, 0.16, Math.PI / 2, HULL_DARK, 0);
    m.ring(-1, y, z, 1.45 * k, 0.12, Math.PI / 2, RUST, 4);
    m.orb(-2.2, y, z - 1.4 * k, 0.35, 1.4 * k, 1.4 * k, worn && dy > 0 ? EMBER : ENGINE, 2, false, 20, 10);
    engines.push(B(-2.6, y, z));
  }
  for (const sd of [-1, 1]) m.wing({ le: 4, te: 0, y: 12 + sd * 4.4 * k, z: 5 }, { le: 2, te: -0.8, y: 12 + sd * 6.6 * k, z: 5.6 }, 0.4, HULL_DARK, 0);

  // The sensor array astern (research): a dish on a turret, its feed horn, a holo emitter ring lit beside it.
  const ax = 5.5, az = hullAt(k, 5.5).top - 0.2;
  m.cyl([ax, 12, az], [ax, 12, az + 1.3], 0.9, 0.7, HULL_DARK, 0, 16);
  m.with(
    (p) => {
      // (The dish tipped back to the sky, round its centre.)
      const c = B(ax, 12, az + 2.2), a = 0.55, cs = Math.cos(a), sn = Math.sin(a);
      const x = p[0] - c[0], y = p[1] - c[1];
      return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs, p[2]];
    },
    () => {
      m.orb(ax, 12, az + 1.7, 2.4, 2.4, 0.55, HULL, 0, false, 28, 10);
      m.ring(ax, 12, az + 2.2, 2.35, 0.12, 0, HULL_DARK, 0);
      for (const a of [0, 2.1, 4.2]) m.cyl([ax + Math.cos(a) * 2.2, 12 + Math.sin(a) * 2.2, az + 2.2], [ax, 12, az + 4.2], 0.06, 0.06, HULL_DEEP, 0, 5);
      m.ball(ax, 12, az + 4.3, 0.32, LAMP_CYAN, 2, 10, 6);
    },
  );
  m.cyl([9.5, 12 - 2.4, hullAt(k, 9.5).top - 0.2], [9.5, 12 - 2.4, hullAt(k, 9.5).top + 0.6], 0.7, 0.55, HULL_DARK, 0, 16);
  m.ring(9.5, 12 - 2.4, hullAt(k, 9.5).top + 0.65, 0.5, 0.1, 0, LAMP_CYAN, 2);

  // Worn: scorched and torn plating, a burning gash in the flank (smoking), the ribs showing at the bow.
  if (worn) {
    const w = hullAt(k, 16).w;
    m.rbox(16.2, 12 + w - 0.02, 4.9, 2.6, 0.12, 1.9, SCORCH, 4, 2.4, 2.4, 20, 10);
    m.orb(16.2, 12 + w + 0.1, 4.4, 1.4, 0.2, 0.7, EMBER, 2, false, 14, 6);
    smoke.push(B(16.2, 12 + w + 0.4, 5));
    m.rbox(30.8, 12 + hullAt(k, 31).w - 0.06, 6, 2, 0.1, 1.1, SCORCH, 4, 2.4, 2.4, 18, 8);
    m.wing({ le: 25, te: 22, y: 12 - hullAt(k, 23).w, z: 6 }, { le: 24.6, te: 22.5, y: 12 - hullAt(k, 23).w - 1.6, z: 7.2 }, 0.12, RUST, 4);
    m.rbox(7.5, 12 - hullAt(k, 7).w + 0.02, 4.8, 1.6, 0.1, 1.3, SCORCH, 4, 2.4, 2.4, 16, 8);
    smoke.push(B(-1.5, 12 + 2.6 * k, 5.6));
  }

  // The parts fitted, each in its place and its rarity's colour.
  if (spec.parts.armour) {
    const c = tint('armour');
    for (const sd of [-1, 1])
      for (const [x0, x1] of [[6, 11], [12, 17], [18, 23], [24, 28]]) {
        const y = 12 + sd * (hullAt(k, (x0 + x1) / 2).w - 0.05);
        m.rbox((x0 + x1) / 2, y, 4.9, (x1 - x0) / 2 - 0.1, 0.32, 2.3, c, 0, 6, 5, 20, 10);
        for (const xr of [x0 + 0.7, x1 - 0.7]) for (const zr of [3, 6.8]) m.ball(xr, y + sd * 0.3, zr, 0.16, HULL_DEEP, 0, 6, 4);
      }
  }
  if (spec.parts.shield) {
    const c = tint('shield');
    const z = hullAt(k, 22).top + 0.1;
    m.cyl([21.5, 12 + 2.5, z - 0.4], [21.5, 12 + 2.5, z + 0.5], 1.1, 1, HULL_DARK, 0, 16);
    m.orb(21.5, 12 + 2.5, z + 0.5, 1.2, 1.2, 1, [0.7, 0.85, 1], 1, true, 18, 8);
    m.ring(21.5, 12 + 2.5, z + 0.55, 1.25, 0.14, 0, c, 0);
  }
  for (const [slot, sd] of [['port', -1], ['starboard', 1]] as const) {
    if (!spec.parts[slot]) continue;
    const c = tint(slot);
    const y = 12 + sd * (hullAt(k, 22).w + 1.4);
    m.box(19.5, 24.5, sd < 0 ? y : y - 1.6, sd < 0 ? y + 1.6 : y, 4.2, 5.2, HULL_DARK, 0, 0.2);
    m.cyl([22, y, 5.2], [22, y, 6.2], 1.1, 1, HULL_DEEP, 0, 14);
    m.ball(22, y, 6.4, 1.1, c, 0, 14, 8);
    for (const dy of [-0.4, 0.4]) m.cyl([22.6, y + dy, 6.5], [28.5, y + dy, 6.7], 0.2, 0.16, c, 0, 10);
  }
  if (spec.parts.booster) {
    const c = tint('booster');
    for (const sd of [-1, 1]) {
      const y = 12 + sd * (4.6 * k + 1.6);
      m.loft(
        [
          { x: -1, w: 1, t: 1, y, z: 5 },
          { x: 1, w: 1.3, t: 1.3, y, z: 5 },
          { x: 9, w: 1.2, t: 1.2, y, z: 5 },
          { x: 11.5, w: 0, t: 0, y, z: 5 },
        ],
        c,
        0,
        { segs: 18 },
      );
      m.cyl([4, 12 + sd * 4.4 * k, 5], [4, y, 5], 0.3, 0.3, HULL_DEEP, 0, 8);
      m.orb(-1.3, y, 4.1, 0.25, 0.9, 0.9, ENGINE, 2, false, 14, 8);
      engines.push(B(-1.4, y, 5));
    }
  }
  if (spec.parts.warp) {
    const c = tint('warp');
    for (const x of [12, 14.5]) {
      m.ring(x, 12, 5, hullAt(k, x).w + 0.9, 0.3, Math.PI / 2, c, 0);
      m.ring(x, 12, 5, hullAt(k, x).w + 0.9, 0.12, Math.PI / 2, LAMP_CYAN, 2);
    }
  }
  return { mesh: new Float32Array(m.out), smoke, engines, deck };
}

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
function limb(m: Mesh, pts: V3[], r0: number, r1: number, col: RGB) {
  m.tube(pts, r0, r1, col, SOFT, 18);
  for (let i = 1; i < pts.length - 1; i++) m.ball(pts[i][0], pts[i][1], pts[i][2], r0 + ((r1 - r0) * i) / (pts.length - 1), col, SOFT, 16, 10);
}

/** Turned about a line through a point (box units) along the model's x, y or z: for a feature's own angle. */
function turned(m: Mesh, at: V3, axis: 'x' | 'y' | 'z', a: number, build: () => void) {
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
function captainModel(): Float32Array {
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
function cloth(m: Mesh, grid: V3[][], col: RGB, hem: RGB) {
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
function streamerModel(): Float32Array {
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

// ---- Particles: dust going by, smoke, the engines' glow, the blade's light ----
const SPRITE_VERT = `
attribute vec3 aPos; attribute vec2 aCorner; attribute vec4 aColor; attribute float aSize;
uniform mat4 uView; uniform mat4 uProj;
varying vec2 vUv; varying vec4 vColor;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  v.xy += aCorner * aSize;
  gl_Position = uProj * v;
  vUv = aCorner;
  vColor = aColor;
}`;
const SPRITE_FRAG = `
precision mediump float;
varying vec2 vUv; varying vec4 vColor;
void main() {
  float r = length(vUv);
  float a = (1.0 - smoothstep(0.0, 1.0, r)) * vColor.a;
  gl_FragColor = vec4(vColor.rgb * a, a);
}`;

/** One of the camera's framings: what it looks at, from which way, how far off, and where on screen that sits. */
interface Pose {
  target: V3;
  yaw: number;
  pitch: number;
  dist: number;
  /** How far the subject is set off centre (screen widths, - to the left), so the page beside it has room. */
  off: number;
}

/** A ship and its Captain on a canvas: hover a section, ask which is at a point, focus a section's camera. */
export class Base3d {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private spriteProg: WebGLProgram;
  private shipBuf: WebGLBuffer | null = null;
  private shipCount = 0;
  private capBuf: WebGLBuffer;
  private capCount: number;
  private tailBuf: WebGLBuffer;
  private tailCount: number;
  private spriteBuf: WebGLBuffer;
  private smoke: V3[] = [];
  private engines: V3[] = [];
  private deck = 8;
  private raf = 0;
  private last = 0;
  private start = performance.now();
  private focused: BaseZone | null = null;
  private view: M4 = IDENTITY;
  private proj: M4 = IDENTITY;
  private eye: V3 = [0, 1, 6];
  private pose: Pose | null = null;
  private lastT = 0;
  private shipKey = '';
  private shipM: M4 = IDENTITY;
  private capM: M4 = IDENTITY;
  private dust: { p: V3; s: number; a: number }[] = [];
  /** Told after each frame (to lay the labels by their places). */
  onFrame: (() => void) | null = null;
  paused = false;

  private constructor(readonly canvas: HTMLCanvasElement, gl: WebGLRenderingContext, ship: CaptainShipSpec) {
    this.gl = gl;
    gl.getExtension('OES_standard_derivatives');
    this.prog = program(gl, SHIP_VERT, SHIP_FRAG.replace(/float flick = [^;]*;/, 'float flick = 1.0;'));
    this.spriteProg = program(gl, SPRITE_VERT, SPRITE_FRAG);
    const cap = captainModel(), tail = streamerModel();
    this.capBuf = this.buffer(cap);
    this.capCount = cap.length / SHIP_STRIDE;
    this.tailBuf = this.buffer(tail);
    this.tailCount = tail.length / SHIP_STRIDE;
    this.spriteBuf = gl.createBuffer()!;
    const r = seq(11);
    for (let i = 0; i < 90; i++) this.dust.push({ p: [(r() - 0.5) * 16, (r() - 0.5) * 7, (r() - 0.5) * 9 - 1], s: 0.008 + r() * 0.02, a: 0.15 + r() * 0.3 });
    this.setShip(ship);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  static mount(canvas: HTMLCanvasElement, ship: CaptainShipSpec): Base3d | null {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, depth: true });
    if (!gl) return null;
    return new Base3d(canvas, gl, ship);
  }

  private buffer(data: Float32Array) {
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  /** The ship as fitted and levelled (rebuilt only when that changes). */
  setShip(spec: CaptainShipSpec) {
    const key = JSON.stringify(spec);
    if (key === this.shipKey) return;
    this.shipKey = key;
    const s = shipModel(spec);
    if (this.shipBuf) this.gl.deleteBuffer(this.shipBuf);
    this.shipBuf = this.buffer(s.mesh);
    this.shipCount = s.mesh.length / SHIP_STRIDE;
    this.smoke = s.smoke;
    this.engines = s.engines;
    this.deck = s.deck;
  }

  /** (A section under the pointer: its label lights, on the page; the scene itself is left as it is.) */
  hover(_zone: BaseZone | null) {}

  /** Frame a section (its page open beside it), or (null) the whole ship. */
  focus(zone: BaseZone | null) {
    this.focused = zone;
  }

  private time() {
    return (performance.now() - this.start) / 1000;
  }

  /** The ship's size on the canvas: 4.2 long. Where each section is, on the ship (its own units, before placing). */
  private static readonly SHIP_SCALE = 4.2;
  private spot(zone: BaseZone): V3 {
    if (zone === 'captain') return apply(this.capM, B(20, 12, 30));
    if (zone === 'research') return apply(this.shipM, B(5.5, 12, 12));
    return apply(this.shipM, B(17, 12, 5));
  }
  private reach(zone: BaseZone) {
    return zone === 'captain' ? 0.32 : zone === 'research' ? 0.38 : 1.9;
  }

  /** The section at a point on the canvas (CSS pixels from its corner, as laid out), if any (the smallest wins). */
  zoneAt(x: number, y: number): BaseZone | null {
    let best: BaseZone | null = null, bestK = 1;
    for (const z of ['captain', 'research', 'hangar'] as BaseZone[]) {
      const c = this.toScreen(this.spot(z)), e = this.toScreen(sub3(this.spot(z), [0, this.reach(z), 0]));
      if (!c || !e) continue;
      const r = Math.abs(e.y - c.y);
      const k = Math.hypot(x - c.x, y - c.y) / (z === 'hangar' ? r * 1.0 : r);
      const flat = z === 'hangar' ? Math.hypot((x - c.x) / (r * 2.6), (y - c.y) / (r * 0.75)) : k;
      if (flat < bestK) {
        bestK = flat;
        best = z;
        if (z !== 'hangar') break;
      }
    }
    return best;
  }

  /** Where a section's label goes on the canvas (CSS pixels, as laid out). */
  labelAt(zone: BaseZone): { x: number; y: number } | null {
    const p = this.spot(zone);
    const lift = zone === 'captain' ? 0.62 : zone === 'research' ? 0.5 : -0.95;
    return this.toScreen([p[0], p[1] + lift, p[2]]);
  }

  private toScreen(p: V3): { x: number; y: number } | null {
    const v = this.view, P = this.proj;
    const ex = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12];
    const ey = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13];
    const ez = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14];
    if (ez >= -0.01) return null;
    const w = -ez;
    return { x: (((P[0] * ex + P[8] * ez) / w + 1) / 2) * this.canvas.clientWidth, y: ((1 - (P[5] * ey) / w) / 2) * this.canvas.clientHeight };
  }

  private loop(now: number) {
    if (!this.canvas.isConnected) return this.destroy();
    this.raf = requestAnimationFrame(this.loop);
    if (now - this.last < 32 || this.paused) return;
    this.last = now;
    this.draw();
    this.onFrame?.();
  }

  /** The camera's framing for a section (or the whole ship), for this canvas's shape. */
  private goal(aspect: number, half: number): Pose {
    const z = this.focused;
    const narrow = Math.min(1, aspect / 1.6);
    if (z === 'captain') return { target: sub3(this.spot('captain'), [0, -0.05, 0]), yaw: 1.0, pitch: 0.02, dist: 1.55 / narrow, off: -0.24 };
    if (z === 'hangar') return { target: this.spot('hangar'), yaw: -0.45, pitch: 0.48, dist: 9 / narrow, off: -0.3 };
    if (z === 'research') return { target: sub3(this.spot('research'), [-0.6, -0.9, 0]), yaw: 0.55, pitch: -0.12, dist: 3.4 / narrow, off: -0.12 };
    // The whole ship, side on and a little from ahead and below (as the art has it), all of it in view.
    const dist = Math.max(3.1 / (half * aspect), 1.85 / half);
    return { target: [-0.3, 0.74, 0], yaw: -0.52, pitch: 0.1, dist, off: 0 };
  }

  private draw() {
    const gl = this.gl, c = this.canvas;
    const lw = c.clientWidth, lh = c.clientHeight;
    if (!lw || !lh) return;
    let dpr = Math.min(2, window.devicePixelRatio || 1) * uiZoom();
    if (lw * lh * dpr * dpr > 4.6e6) dpr = Math.sqrt(4.6e6 / (lw * lh));
    const w = Math.round(lw * dpr), h = Math.round(lh * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const t = this.time();
    // The ship drifts on: rising and falling, rolling and pitching a little.
    const S = Base3d.SHIP_SCALE;
    this.shipM = mul(translate(0, 0.05 * Math.sin(t * 0.7), 0), mul(rotX(0.035 * Math.sin(t * 0.5)), mul(rotZ(0.025 * Math.sin(t * 0.6 + 1)), scale(S))));
    // The Captain on the foredeck, facing ahead and a little toward us.
    const at = B(STAND.x, STAND.y, this.deck);
    this.capM = mul(this.shipM, mul(translate(at[0], at[1], at[2]), mul(rotY(1.3), mul(scale(0.7 / S), translate(-B(20, 12, 0)[0], 0, -B(20, 12, 0)[2])))));
    // The tails and scarf streaming: swung from the waist, a gust now and then.
    const gust = 0.08 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 5.1 + 1);
    const pivot = B(20, 11, 23);
    const tailM = mul(this.capM, mul(translate(pivot[0], pivot[1], pivot[2]), mul(rotZ(-gust), mul(rotX(gust * 0.5), translate(-pivot[0], -pivot[1], -pivot[2])))));

    // The camera eases toward its framing.
    const aspect = lw / lh;
    const fov = (32 * Math.PI) / 180;
    const half = Math.tan(fov / 2);
    const g = this.goal(aspect, half);
    if (!this.pose) this.pose = { ...g, target: [...g.target] as V3 };
    const dt = Math.min(0.2, t - this.lastT);
    this.lastT = t;
    const p = this.pose, e = 1 - Math.exp(-dt * 2.6);
    for (let i = 0; i < 3; i++) p.target[i] += (g.target[i] - p.target[i]) * e;
    p.yaw += (g.yaw - p.yaw) * e;
    p.pitch += (g.pitch - p.pitch) * e;
    p.dist += (g.dist - p.dist) * e;
    p.off += (g.off - p.off) * e;
    const yaw = p.yaw + 0.03 * Math.sin(t * 0.17);
    const dir: V3 = [Math.sin(yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.cos(yaw) * Math.cos(p.pitch)];
    this.eye = [p.target[0] + dir[0] * p.dist, p.target[1] + dir[1] * p.dist, p.target[2] + dir[2] * p.dist];
    this.view = lookAt(this.eye, p.target);
    this.proj = perspective(fov, aspect, 0.05, 80);
    // (Set off centre by shearing the projection: the subject moves aside, its perspective unchanged.)
    this.proj[8] = -p.off * 2;

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    const pr = this.prog;
    gl.useProgram(pr);
    const u = (n: string) => gl.getUniformLocation(pr, n);
    gl.uniformMatrix4fv(u('uView'), false, this.view);
    gl.uniformMatrix4fv(u('uProj'), false, this.proj);
    gl.uniform3fv(u('uEye'), this.eye);
    gl.uniform3f(u('uColor'), 0.86, 0.62, 0.26);
    gl.uniform1f(u('uTime'), t);
    gl.uniform1f(u('uAlpha'), 1);
    gl.uniform1f(u('uBurn'), 0.6);
    const attrs: [string, number, number][] = [['aPos', 3, 0], ['aNorm', 3, 3], ['aCol', 3, 6], ['aMat', 1, 9]];
    const locs = attrs.map(([n]) => gl.getAttribLocation(pr, n));
    const drawMesh = (buf: WebGLBuffer | null, count: number, model: M4) => {
      if (!buf) return;
      gl.uniformMatrix4fv(u('uModel'), false, model);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      attrs.forEach(([, size, off], i) => {
        if (locs[i] < 0) return;
        gl.enableVertexAttribArray(locs[i]);
        gl.vertexAttribPointer(locs[i], size, gl.FLOAT, false, SHIP_STRIDE * 4, off * 4);
      });
      gl.drawArrays(gl.TRIANGLES, 0, count);
    };
    drawMesh(this.shipBuf, this.shipCount, this.shipM);
    drawMesh(this.capBuf, this.capCount, this.capM);
    drawMesh(this.tailBuf, this.tailCount, tailM);
    locs.forEach((l) => l >= 0 && gl.disableVertexAttribArray(l));

    this.drawSprites(t);
  }

  /** The dust going by, the smoke from the ship's wounds, its engines' glow, and the light round the blade. */
  private drawSprites(t: number) {
    const gl = this.gl;
    const out: number[] = [];
    const quad = (p: V3, size: number, c: [number, number, number, number]) => {
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) out.push(p[0], p[1], p[2], cx, cy, c[0], c[1], c[2], c[3], size);
    };
    // Dust: drifting past astern (the ship flies on ahead), wrapping round.
    for (const d of this.dust) {
      const x = ((((d.p[0] - t * 0.9 * (0.6 + d.s * 30)) % 16) + 24) % 16) - 8;
      quad([x, d.p[1] + 0.5, d.p[2]], d.s, [0.42, 0.47, 0.6, d.a]);
    }
    // Engines: a soft glow behind each bell.
    for (const e of this.engines) quad(apply(this.shipM, [e[0] - 0.01, e[1], e[2]]), 0.17 + 0.01 * Math.sin(t * 9), [1, 0.78, 0.48, 0.55]);
    // Smoke: puffs leaving each wound, drifting astern and up, swelling and fading.
    for (const s of this.smoke) {
      const from = apply(this.shipM, s);
      for (let i = 0; i < 10; i++) {
        const age = (t * 0.45 + i / 10) % 1;
        quad([from[0] - age * 1.6, from[1] + age * 0.5, from[2] + Math.sin(i * 3.1) * age * 0.15], 0.06 + age * 0.22, [0.35, 0.34, 0.36, 0.42 * (1 - age) * Math.min(1, age * 8)]);
      }
    }
    const data = new Float32Array(out);
    const sp = this.spriteProg;
    gl.useProgram(sp);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uProj'), false, this.proj);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const a = (n: string) => gl.getAttribLocation(sp, n);
    const layout: [string, number, number][] = [['aPos', 3, 0], ['aCorner', 2, 3], ['aColor', 4, 5], ['aSize', 1, 9]];
    for (const [n, size, off] of layout) {
      const l = a(n);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, 40, off * 4);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 10);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    for (const [n] of layout) gl.disableVertexAttribArray(a(n));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return p;
}
