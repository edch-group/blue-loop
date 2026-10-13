/**
 * The Captain's ship, as one model wherever it is seen: on the campaign's menu (base3d.ts, large, the Captain on its
 * deck) and on the map (nebula-objects.ts, flying between systems) [direction: the hero's ship on the map the same
 * model as the campaign menu's]. Box units as the ships' (ship3d.ts): 40 to the model's 1, x along, y across, z up.
 */
import { captainModel, streamerModel } from './captain-model';
import { COMPANION_PLACES, companionModel } from './companion-models';
import type { CompanionId } from '../engine/companions';
import type { PartSlot } from '../engine/parts';
import { Mesh, SHIP_STRIDE, type CaptainShipSpec, type RGB, type ShipModel, type V3 } from './ship3d';

/** A point of the box (x along, y across, z up) in the model's own axes. */
const B = (x: number, y: number, z: number): V3 => [(x - 20) / 40, z / 40, (y - 12) / 40];

// ---- Colours ----
const HULL: RGB = [0.66, 0.68, 0.73];
const HULL_DARK: RGB = [0.4, 0.42, 0.48];
export const HULL_DEEP: RGB = [0.26, 0.27, 0.31];
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
export function seq(seed: number) {
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
/**
 * Where each part's slot is on the ship (box units: x along, y across, z up), as the hangar marks it [direction: a
 * birdseye view of the actual ship, parts attached to it directly]: over the place its part is built.
 */
export function slotSpots(level: number): Record<PartSlot, V3> {
  const k = 1 + Math.max(0, Math.min(15, level)) * 0.025;
  return {
    armour: [9.5, 12 - hullAt(k, 9.5).w - 0.4, hullAt(k, 9.5).top - 1],
    shield: [21.5, 14.5, hullAt(k, 22).top + 1.6],
    port: [24, 12 - (hullAt(k, 22).w + 1.4), 6.6],
    starboard: [24, 12 + hullAt(k, 22).w + 1.4, 6.6],
    booster: [3, 12 + 4.6 * k + 1.6, 6],
    warp: [13.2, 12 + hullAt(k, 13.2).w + 0.9, 6],
  };
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

/**
 * The Captain's ship, in detail: a battered corvette, lofted and plated, a flat foredeck, a bridge tower with its
 * windows lit, a dorsal spine, an engine block of three bells, pipes and vents and hatches down its flanks, a sensor
 * array astern (research), a mast; every part fitted built on in its place and its rarity's colour; and, while the
 * Captain is still low, the wear of it: scorched and torn plating, a burning gash, the ribs showing.
 */
export function captainShipModel(spec: CaptainShipSpec): { mesh: Float32Array; smoke: V3[]; engines: V3[]; deck: number; bridge: number; rail: { y: number; z: number }; dish: number } {
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
  return { mesh: new Float32Array(m.out), smoke, engines, deck, bridge: bz + 2.6, rail: { y: 12 + dk.w * 0.68, z: deck + 1.2 }, dish: hullAt(k, 8.7).top - 0.1 };
}

const mapModels = new Map<string, ShipModel & { smoke: V3[] }>();

/** The ship as the map flies it (built once for each fitting). */
/**
 * The ship with the Captain standing on its foredeck, as the menu shows him (base3d.ts: there his coat's tails stream
 * in the wind; here they are still): at the rail, facing ahead and a little out, his height 0.7 of the menu ship's 4.2.
 */
function withCaptain(ship: Float32Array, deck: number): Float32Array {
  return placed(ship, [captainModel(), streamerModel()], B(32, 12, deck), B(20, 12, 0), 0.7 / 4.2, 1.3);
}

/**
 * The companions aboard [direction: the map's ship shows the friends on it too, both ships identical]: each where the
 * menu's ship has them (companion-models.ts COMPANION_PLACES), as it stands, sits or flies there.
 */
function withCrew(ship: Float32Array, crew: string[], rail: { y: number; z: number }, dish: number): Float32Array {
  let out = ship;
  for (const id of crew) {
    const pl = COMPANION_PLACES[id as CompanionId];
    if (!pl) continue;
    const at = pl.on === 'rail' ? B(pl.x, rail.y, rail.z) : pl.on === 'dish' ? B(pl.x, pl.y, dish) : B(pl.x, pl.y, pl.z);
    out = placed(out, [companionModel(id as CompanionId)], at, B(pl.anchor[0], pl.anchor[1], pl.anchor[2]), pl.size / 4.2, pl.turn);
  }
  return out;
}

/** Figures set on the ship: each scaled by `k` about its `mid`, turned by `turn` about the vertical, and stood at `at`. */
function placed(ship: Float32Array, parts: Float32Array[], at: V3, mid: V3, k: number, turn: number): Float32Array {
  const c = Math.cos(turn), sn = Math.sin(turn);
  const out = new Float32Array(ship.length + parts.reduce((n, p) => n + p.length, 0));
  out.set(ship);
  let o = ship.length;
  for (const p of parts) {
    for (let i = 0; i < p.length; i += SHIP_STRIDE) {
      const x = (p[i] - mid[0]) * k, y = (p[i + 1] - mid[1]) * k, z = (p[i + 2] - mid[2]) * k;
      out[o + i] = at[0] + c * x + sn * z;
      out[o + i + 1] = at[1] + y;
      out[o + i + 2] = at[2] - sn * x + c * z;
      out[o + i + 3] = c * p[i + 3] + sn * p[i + 5];
      out[o + i + 4] = p[i + 4];
      out[o + i + 5] = -sn * p[i + 3] + c * p[i + 5];
      for (let j = 6; j < SHIP_STRIDE; j++) out[o + i + j] = p[i + j];
    }
    o += p.length;
  }
  return out;
}

export function captainShipMap(spec: CaptainShipSpec): ShipModel & { smoke: V3[] } {
  const key = JSON.stringify(spec);
  let m = mapModels.get(key);
  if (!m) {
    const s = captainShipModel(spec);
    m = { mesh: withCrew(withCaptain(s.mesh, s.deck), spec.crew ?? [], s.rail, s.dish), engines: s.engines, glow: ENGINE, suns: [], smoke: s.smoke };
    mapModels.set(key, m);
  }
  return m;
}
