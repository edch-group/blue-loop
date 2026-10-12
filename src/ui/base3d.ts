/**
 * The Captain's base [direction: the campaign's sections spread out like a base, all 3D: a hangar holding the ship,
 * the hero sitting, and a research panel where the general upgrades are taken]: a deck floating on the paper, three
 * stations on it. To the left, the hangar bay, its arch and gantry over the Captain's own ship (as fitted, the map's
 * model); in the middle, the Captain in a command chair on a dais; to the right, the research console, its screen lit
 * and a petal's hologram turning over its pedestal. Each station lights up under the pointer and opens its page.
 *
 * Modelled as the ships are (ship3d.ts's Mesh, box units: 40 to the world's 1; x across, y toward the eye, z up) and
 * drawn with the ships' own shader (nebula-objects.ts), so it is lit and textured as the map's ships are.
 */
import { SHIP_VERT } from './nebula-objects';
import { captainShip3d, Mesh, SHIP_STRIDE, type CaptainShipSpec, type RGB, type V3 } from './ship3d';
import { uiZoom } from './viewport';

export type BaseZone = 'hangar' | 'captain' | 'research';
export const BASE_ZONES: BaseZone[] = ['hangar', 'captain', 'research'];

/** Where each station stands on the deck (world x, z), and the point its label hangs from (world, above it). */
const SPOT: Record<BaseZone, { x: number; z: number; label: V3; r: number; cx?: number }> = {
  hangar: { x: -2.0, z: -0.15, label: [-1.95, 1.95, -0.3], r: 1.2 },
  captain: { x: 0, z: 0.2, label: [0, 1.6, 0.1], r: 0.75 },
  research: { x: 1.95, z: -0.05, label: [2.35, 1.55, -0.2], r: 1, cx: 0.4 },
};

/** The deck's own material: pale as the paper, its light in two soft bands. */
const PAPER = 7;

// ---- Colours (a cartoon's: clean, a little brighter than life) ----
const DECK: RGB = [0.96, 0.96, 0.97];
const STEEL: RGB = [0.86, 0.89, 0.94];
const STEEL_DARK: RGB = [0.5, 0.56, 0.68];
const WHITE: RGB = [0.97, 0.97, 0.98];
const LAMP: RGB = [1, 0.88, 0.58];
const CYAN: RGB = [0.5, 0.84, 1];
const SCREEN: RGB = [0.46, 0.74, 1];
const HAZARD: RGB = [0.98, 0.74, 0.28];
const INK: RGB = [0.12, 0.12, 0.18];
const SEAT: RGB = [0.36, 0.42, 0.56];
const CRATE: RGB = [0.86, 0.66, 0.38];
const PETAL_GLASS: RGB = [0.66, 0.84, 1];

/** Builds parts placed on the deck at world (x, z): the station's own box units round its centre (box 20, 12). */
function at(m: Mesh, x: number, z: number, build: () => void) {
  m.with((p) => [p[0] + x, p[1], p[2] + z], build);
}

/** Builds parts turned `a` (radians) about the world's x axis, round a point (world). */
function tiltX(m: Mesh, pivot: V3, a: number, build: () => void) {
  const c = Math.cos(a), s = Math.sin(a);
  m.with((p) => {
    const y = p[1] - pivot[1], z = p[2] - pivot[2];
    return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
  }, build);
}

/** Builds parts turned `a` (radians) about the world's up axis, round the origin. */
function turnY(m: Mesh, a: number, build: () => void) {
  const c = Math.cos(a), s = Math.sin(a);
  m.with((p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c], build);
}

/** A rounded block from corner to corner (box units): `n` how square (2 round, 4 or more a softened box). */
function block(m: Mesh, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: RGB, mat: number, n = 5, nv = n) {
  m.rbox((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, col, mat, n, nv);
}

/** A round puck (a disc with soft edges) standing from z0 to z1. */
function puck(m: Mesh, x: number, y: number, z0: number, z1: number, r: number, col: RGB, mat: number, nv = 6) {
  m.rbox(x, y, (z0 + z1) / 2, r, r, (z1 - z0) / 2, col, mat, 2, nv, 48, 14);
}

/** The deck: a broad oval puck, a lit rim round its edge; a pad under each station. */
function deck(m: Mesh) {
  m.with((p) => [p[0] * 3.45, p[1], p[2] * 1.45], () => {
    m.rbox(20, 12, -4, 40, 40, 4, DECK, PAPER, 2, 7, 96, 16);
    m.ring(20, 12, -1.2, 39.6, 0.35, 0, CYAN, 2);
  });
  at(m, SPOT.hangar.x, SPOT.hangar.z, () => {
    puck(m, 20, 12, -0.6, 1, 42, WHITE, PAPER);
    m.ring(20, 12, 1.02, 38.5, 0.55, 0, HAZARD, 2);
  });
  at(m, SPOT.research.x, SPOT.research.z, () => puck(m, 32, 10, -0.6, 1, 37, WHITE, PAPER));
}

/** The hangar bay: a rounded arch behind the ship, a gantry over it with two lamps, clamps under it. */
function hangar(m: Mesh) {
  at(m, SPOT.hangar.x, SPOT.hangar.z, () => {
    for (const x of [-24, 64]) {
      block(m, x - 3, x + 3, -23, -17, 0, 70, STEEL, 0, 4, 8);
      puck(m, x, -20, 0, 4, 5, STEEL_DARK, 0);
      for (let z = 14; z < 62; z += 12) m.ball(x + 3.2, -20, z, 1.1, LAMP, 2, 12, 8);
    }
    block(m, -28, 68, -23, -17, 64, 71, STEEL, 0, 6, 4);
    // The gantry, reaching forward over the ship, two lamps under it.
    block(m, 17, 23, -18, 25, 64.5, 69, STEEL, 0, 5, 4);
    for (const y of [0, 16]) {
      m.rbox(20, y, 62.5, 2.4, 2.4, 2.2, STEEL_DARK, 0, 2, 3);
      m.ball(20, y, 60.4, 1.6, LAMP, 2, 14, 8);
    }
    m.tube([[20, 22, 64.5], [20, 22, 47]], 0.3, 0.3, STEEL_DARK, 0, 8);
    m.ring(20, 22, 45.5, 1.6, 0.5, Math.PI / 2, HAZARD, 0);
    // Clamps the ship rests on.
    for (const [x, y] of [[6, 12], [33, 5], [33, 19]] as const) {
      m.rbox(x, y, 6, 1.5, 1.5, 6, STEEL_DARK, 0, 2, 6);
      puck(m, x, y, 10.6, 12.6, 2.6, STEEL, 0);
    }
    m.tube([[62, -16, 1.6], [56, -4, 1.4], [44, 4, 1.4], [36, 10, 6]], 0.8, 0.8, HAZARD, 0, 10, false);
    // A couple of crates by the pad's edge.
    block(m, -21, -13, 25, 33, 0.5, 8.5, CRATE, 0, 5);
    block(m, -12, -6, 26.5, 32.5, 0.5, 6.5, CRATE, 0, 5);
  });
}

/** Builds parts turned `a` (radians) about the world's forward axis, round a point (world): a sideways lean. */
function tiltZ(m: Mesh, pivot: V3, a: number, build: () => void) {
  const c = Math.cos(a), s = Math.sin(a);
  m.with((p) => {
    const x = p[0] - pivot[0], y = p[1] - pivot[1];
    return [pivot[0] + x * c - y * s, pivot[1] + x * s + y * c, p[2]];
  }, build);
}

/** A point of the box (x along, y toward the eye, z up) as the world has it (for pivots). */
const W = (x: number, y: number, z: number): V3 => [(x - 20) / 40, z / 40, (y - 12) / 40];

// The Captain's colours, after the art: a long charcoal coat, worn leather, a grey scarf, dark tousled hair.
const COAT_GREY: RGB = [0.25, 0.26, 0.31];
const COAT_SHADE: RGB = [0.2, 0.21, 0.26];
const LEATHER: RGB = [0.48, 0.34, 0.24];
const TUNIC: RGB = [0.34, 0.37, 0.44];
const LINING: RGB = [0.24, 0.36, 0.4];
const PLATE: RGB = [0.64, 0.68, 0.76];
const STRAP: RGB = [0.3, 0.21, 0.15];
const BUCKLE: RGB = [0.72, 0.66, 0.56];
const SCARF: RGB = [0.52, 0.55, 0.62];
const TROUSERS: RGB = [0.21, 0.21, 0.25];
const WORN_BOOT: RGB = [0.3, 0.24, 0.2];
const TAN: RGB = [0.86, 0.68, 0.55];
const TAN_SHADE: RGB = [0.76, 0.56, 0.45];
const DARK_HAIR: RGB = [0.15, 0.12, 0.11];
const STUBBLE: RGB = [0.3, 0.24, 0.21];
const BANDAGE: RGB = [0.93, 0.9, 0.84];
const BLADE: RGB = [0.78, 0.74, 1];

/**
 * The Captain in a command chair on a round dais, after the art [direction: on his last legs, struggling through
 * space]: slumped, worn out, head hung a little and to one side; tousled dark hair and stubble, a bandage round his
 * brow, a scarf, a long tattered coat over a leather jerkin and belt, worn boots; one arm hanging off the chair, the
 * other on its arm; his sword (its blade glowing violet) leant against the chair.
 */
function captain(m: Mesh) {
  at(m, SPOT.captain.x, SPOT.captain.z, () => {
    puck(m, 20, 12, -0.6, 1.8, 30, WHITE, PAPER);
    puck(m, 20, 12, 1.4, 3.6, 23, WHITE, PAPER);
    m.ring(20, 12, 3.4, 22.4, 0.4, 0, CYAN, 2);
    // The chair: a stout pillar, a cushioned seat, a tall rounded back, padded arms.
    m.rbox(20, 6, 9.5, 2.4, 2.4, 6.5, STEEL_DARK, 0, 2, 6);
    block(m, 11.5, 28.5, -2, 14, 14.5, 19.5, SEAT, 0, 4);
    block(m, 12, 28, -6, 0, 17, 49, SEAT, 0, 4, 3);
    for (const x of [9, 31]) {
      block(m, x - 2, x + 2, -1, 14, 22.5, 26.5, SEAT, 0, 3);
      m.rbox(x, 2, 19.5, 1.2, 1.2, 3.5, STEEL_DARK, 0, 2, 6);
    }
    // Legs sprawled: knees apart, one foot pushed out, worn boots with a knee guard.
    for (const s of [-1, 1]) {
      const x = 20 + s * 3.6, kx = 20 + s * 6.2, fx = 20 + s * (s < 0 ? 8.4 : 7);
      const fy = s < 0 ? 17 : 14.5;
      m.tube([[x, 0, 21.4], [kx, 12, 21.6]], 2.6, 2.4, TROUSERS, 0, 16, false);
      m.ball(kx, 12, 21.4, 2.4, TROUSERS, 0, 16, 10);
      m.rbox(kx, 13.4, 21, 1.6, 1.1, 1.8, WORN_BOOT, 0, 2, 2);
      m.tube([[kx, 12.4, 20], [fx, fy - 2, 8.5]], 2.2, 2.1, TROUSERS, 0, 16, false);
      m.tube([[fx, fy - 2, 11], [fx, fy - 1.8, 6]], 2.3, 2.2, WORN_BOOT, 0, 16, false);
      m.rbox(fx, fy, 5.3, 2.5, 4, 2, WORN_BOOT, 0, 3, 3);
    }
    // The upper body, slumped forward and to one side.
    tiltX(m, W(20, 1, 20), 0.14, () =>
      tiltZ(m, W(20, 1, 20), 0.07, () => {
        // The coat's long tails, hanging under the chair's arms, their hems ragged; its skirts draped over the lap.
        for (const sd of [-1, 1]) {
          const x = 20 + sd * 9.6;
          block(m, x - 1, x + 1, -5, 3, 9, 22, COAT_GREY, 0, 3, 4);
          for (const [dy, low] of [[-3.4, 6.4], [-0.4, 7.6], [2, 6]] as const) block(m, x - 0.9, x + 0.9, dy - 1.4, dy + 1.4, low, 10, COAT_GREY, 0, 3, 3);
          m.rbox(20 + sd * 6.3, 6.4, 23.6, 2.5, 6.4, 0.85, COAT_GREY, 0, 3, 3);
          m.rbox(20 + sd * 6.6, 12.6, 22.6, 1.6, 1.2, 1.2, COAT_GREY, 0, 2, 2);
        }
        // The long coat round him, open down the front: the tunic showing there, a leather harness crossed over it,
        // the belt; lapels turned back along the opening, showing the lining.
        m.rbox(20, 0.4, 30, 6.6, 4.8, 9.9, COAT_GREY, 0, 2.4, 2.8);
        m.rbox(20, 4.6, 30, 3, 0.9, 8.8, TUNIC, 0, 3, 3);
        for (const sd of [-1, 1]) tiltZ(m, W(20, 5.5, 30.5), sd * 0.5, () => m.rbox(20, 5.55, 30.5, 0.6, 0.3, 6.6, LEATHER, 0, 3, 4));
        m.ball(20, 5.75, 30.5, 0.7, BUCKLE, 0, 12, 8);
        m.rbox(20, 5.1, 22.2, 3.1, 0.75, 1.05, STRAP, 0, 4, 4);
        m.rbox(20, 5.85, 22.2, 0.9, 0.3, 0.75, BUCKLE, 0, 4, 4);
        for (const sd of [-1, 1]) tiltZ(m, W(20 + sd * 3.3, 5.3, 34), sd * 0.3, () => m.rbox(20 + sd * 3.3, 5.35, 33.4, 0.95, 0.45, 5.2, LINING, 0, 3, 3));
        m.rbox(20, -1.4, 40.6, 5.3, 2.2, 3.1, COAT_GREY, 0, 2, 3);
        // Shoulders: the left under the coat, the right under a worn steel plate, two lames deep.
        m.rbox(13.2, 0.2, 37, 3, 3, 2.4, COAT_GREY, 0, 2, 2);
        m.rbox(26.8, 0.2, 37, 3, 3, 2.4, COAT_GREY, 0, 2, 2);
        m.rbox(27.4, 0.4, 38.6, 3.5, 3.5, 1.5, PLATE, 0, 2, 3);
        m.rbox(28.4, 0.6, 36.6, 3.1, 3.2, 1.15, PLATE, 0, 2, 3);
        // One arm on the chair's arm, the other hanging over its side; the coat's cuffs turned back.
        m.tube([[13.4, 0.5, 36.4], [10.2, 0.8, 31], [9.6, 2.6, 27.6]], 1.75, 1.5, COAT_SHADE, 0, 16, false);
        m.ball(9.6, 2.6, 27.6, 1.5, COAT_SHADE, 0, 14, 8);
        m.tube([[9.6, 2.6, 27.6], [9.5, 9.4, 26.9]], 1.5, 1.35, COAT_SHADE, 0, 16, false);
        m.rbox(9.5, 9.4, 26.9, 1.75, 0.9, 1.75, LINING, 0, 2, 3);
        m.ball(9.5, 11.2, 27, 1.35, TAN, 0, 14, 8);
        m.tube([[26.6, 0.5, 36.4], [31, 1.4, 29.5], [32.8, 3.2, 22]], 1.75, 1.45, COAT_SHADE, 0, 16, false);
        m.rbox(32.8, 3.2, 22.4, 1.7, 1.7, 0.95, LINING, 0, 2, 3);
        m.ball(33, 3.6, 20.2, 1.35, TAN, 0, 14, 8);
        // A bandage round the hanging arm.
        m.rbox(32.1, 2.5, 25.6, 1.65, 1.65, 0.6, BANDAGE, 0, 2, 4);
        // The scarf, wound round the neck, an end hanging down the chest.
        m.rbox(20, 1, 40, 4.4, 4, 2, SCARF, 0, 2, 2.6);
        m.rbox(17.6, 3.8, 35, 1.6, 0.8, 4, SCARF, 0, 3, 3);
        // The head, hung a little: weathered, unsmiling.
        tiltX(m, W(20, 1, 41), 0.1, () =>
          tiltZ(m, W(20, 1, 41), -0.12, () => {
            const H = { x: 20, y: 1.4, z: 46.2, rx: 4.3, ry: 4.6, rz: 5 };
            m.rbox(H.x, H.y, H.z, H.rx, H.ry, H.rz, TAN, 0, 2, 2, 32, 20);
            const face = (dx: number, dz: number) => H.y + H.ry * Math.sqrt(Math.max(0, 1 - (dx / H.rx) ** 2 - (dz / H.rz) ** 2));
            // Stubble round the jaw and over the lip.
            m.rbox(H.x, H.y + 0.5, H.z - 2.6, 4.25, 4.45, 2.7, STUBBLE, 0, 2, 2, 28, 14);
            m.rbox(H.x, face(0, -1.6) - 0.15, H.z - 1.6, 1.6, 0.45, 0.45, STUBBLE, 0, 2, 2, 12, 8);
            // The mouth: a flat, tired line.
            m.rbox(H.x, face(0, -2.3) + 0.02, H.z - 2.3, 1.1, 0.25, 0.16, INK, 0, 2, 2, 12, 6);
            // Eyes half shut under heavy, drawn brows; shadows under them.
            for (const sd of [-1, 1]) {
              const ex = H.x + sd * 1.5;
              m.rbox(ex, face(sd * 1.5, 0.3) - 0.2, H.z + 0.2, 0.6, 0.35, 0.45, INK, 0, 2, 2, 14, 8);
              m.rbox(ex, face(sd * 1.5, 0.75) - 0.1, H.z + 0.75, 0.85, 0.45, 0.42, TAN_SHADE, 0, 2, 2, 14, 8);
              m.rbox(ex, face(sd * 1.5, -0.55) - 0.25, H.z - 0.55, 0.7, 0.3, 0.22, TAN_SHADE, 0, 2, 2, 12, 6);
              m.with(
                (q) => {
                  // (The brows drawn down toward the nose: tired, set.)
                  const piv = W(ex, 0, H.z + 1.5), a = sd * 0.28, c = Math.cos(a), sn = Math.sin(a);
                  const x = q[0] - piv[0], y = q[1] - piv[1];
                  return [piv[0] + x * c - y * sn, piv[1] + x * sn + y * c, q[2]];
                },
                () => m.rbox(ex, face(sd * 1.5, 1.5) - 0.1, H.z + 1.5, 1.1, 0.45, 0.32, DARK_HAIR, 0, 2, 2, 12, 8),
              );
              m.rbox(H.x + sd * 4.3, H.y, H.z - 0.3, 0.6, 1, 1.3, TAN, 0, 2, 2, 14, 8);
            }
            m.rbox(H.x, face(0, -0.6) + 0.1, H.z - 0.6, 0.6, 0.75, 1, TAN_SHADE, 0, 2, 2, 14, 8);
            // A bandage round the brow, its end trailing.
            m.rbox(H.x, H.y + 0.1, H.z + 3, 4.4, 4.7, 0.55, BANDAGE, 0, 2, 3, 32, 8);
            m.rbox(H.x - 3.4, H.y - 3.4, H.z + 2, 0.45, 0.8, 1.3, BANDAGE, 0, 2, 2);
            // Tousled dark hair: a mop, a fringe swept over, locks over the ears and down to the collar, tufts on top.
            m.rbox(H.x, H.y - 0.9, H.z + 2.7, 4.75, 4.75, 3.3, DARK_HAIR, 0, 2, 2, 28, 16);
            m.rbox(H.x + 1.1, face(1.1, 3.6) - 1.1, H.z + 3.7, 2.8, 1.3, 1.3, DARK_HAIR, 0, 2, 2, 20, 10);
            for (const sd of [-1, 1]) m.rbox(H.x + sd * 4.2, H.y - 0.8, H.z + 0.9, 1.1, 2.6, 2.6, DARK_HAIR, 0, 2, 2, 18, 10);
            m.rbox(H.x, H.y - 3.5, H.z - 0.6, 3.9, 1.7, 3.4, DARK_HAIR, 0, 2, 2, 22, 12);
            m.rbox(H.x - 1.7, H.y + 0.4, H.z + 5.3, 1.7, 1.9, 1.1, DARK_HAIR, 0, 2, 2, 16, 8);
            m.rbox(H.x + 1.9, H.y - 1.2, H.z + 5.4, 1.6, 1.8, 1.1, DARK_HAIR, 0, 2, 2, 16, 8);
          }),
        );
      }),
    );
    // His sword, leant against the chair: a dark hilt, its blade glowing violet.
    tiltZ(m, W(34, 8, 3.6), -0.28, () => {
      m.rbox(34, 8, 21, 0.5, 0.25, 17, BLADE, 2, 3, 6);
      m.rbox(34, 8, 39, 2.4, 0.6, 0.5, STEEL_DARK, 0, 3, 3);
      m.rbox(34, 8, 42, 0.5, 0.5, 2.6, STRAP, 0, 2, 4);
      m.ball(34, 8, 45, 0.8, STEEL_DARK, 0, 10, 6);
    });
  });
}

/** The research console: a rounded desk, its top tilted up and lit, a screen over it; a stool; a holo pedestal. */
function research(m: Mesh) {
  at(m, SPOT.research.x, SPOT.research.z, () => {
    block(m, 3, 37, -5, 7, 1, 19, WHITE, 0, 5, 4);
    tiltX(m, [0, 19 / 40, (1 - 12) / 40], 0.28, () => {
      block(m, 1.5, 38.5, -5, 10, 17.5, 22, WHITE, 0, 6, 3);
      for (let i = 0; i < 5; i++) m.rbox(8 + i * 6, 3.8, 22, 2.2, 2.2, 0.5, i % 2 ? CYAN : SCREEN, 2, 3, 3, 16, 8);
    });
    m.rbox(20, -4, 25, 1, 1, 4, STEEL_DARK, 0, 2, 6);
    tiltX(m, [0, 28 / 40, (-5 - 12) / 40], -0.16, () => {
      block(m, 4, 36, -7, -3, 27, 47, STEEL_DARK, 0, 6, 6);
      block(m, 5.6, 34.4, -4, -2.6, 28.6, 45.4, SCREEN, 2, 8, 8);
    });
    // Its stool.
    m.rbox(20, 21, 7, 0.9, 0.9, 6.5, STEEL_DARK, 0, 2, 6);
    puck(m, 20, 21, 12.5, 15.5, 5, SEAT, 0, 3);
    // The holo pedestal beside it, a ring of light on top.
    puck(m, 56, 4, 0, 9, 5.5, WHITE, 0, 4);
    m.ring(56, 4, 9.1, 4, 0.4, 0, CYAN, 2);
    m.ball(56, 4, 10, 1.6, CYAN, 2, 14, 8);
    m.tube([[37, 0, 1.6], [44, 2, 1.3], [51, 4, 1.3]], 0.6, 0.6, STEEL_DARK, 0, 10, false);
  });
}

/** The light round a station's floor when it is under the pointer: a thin bright ring and a soft wide one. */
function halo(zone: BaseZone): Float32Array {
  const m = new Mesh();
  const [x, y, r] = zone === 'hangar' ? [20, 12, 43.5] : zone === 'captain' ? [20, 12, 31.5] : [32, 10, 38.5];
  at(m, SPOT[zone].x, SPOT[zone].z, () => {
    m.ring(x, y, 1.1, r, 0.45, 0, CYAN, 2);
    m.ring(x, y, 1.1, r + 2.4, 0.22, 0, CYAN, 2);
  });
  return new Float32Array(m.out);
}

/** The petal hologram: six glass petals round a lit heart (the Stellari's), turning over the pedestal. */
function hologram(): Float32Array {
  const m = new Mesh();
  for (let k = 0; k < 6; k++)
    turnY(m, (k / 6) * Math.PI * 2, () =>
      m.with(
        (p) => {
          // (Tipped up from flat, so the flower opens like a cup.)
          const a = 0.8, c = Math.cos(a), s = Math.sin(a);
          return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
        },
        () => m.orb(20 + 7, 12, -0.7, 7, 2.8, 0.7, PETAL_GLASS, 2, false, 16, 8),
      ),
    );
  m.ball(20, 12, 1, 2.2, CYAN, 2, 14, 8);
  return new Float32Array(m.out);
}

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
/** Placed at (x, y, z), turned `yaw` about the up axis, scaled `s`. */
function place(x: number, y: number, z: number, yaw: number, s: number): M4 {
  const c = Math.cos(yaw), n = Math.sin(yaw);
  return new Float32Array([c * s, 0, -n * s, 0, 0, s, 0, 0, n * s, 0, c * s, 0, x, y, z, 1]);
}
const IDENTITY = place(0, 0, 0, 0, 1);

/** The shadow pools under each station: a soft dark disc on the deck (world x, z, radius x, radius z). */
const SHADOWS: [number, number, number, number][] = [
  [SPOT.hangar.x + 0.1, SPOT.hangar.z + 0.05, 1.1, 0.55],
  [SPOT.captain.x, SPOT.captain.z, 0.62, 0.4],
  [SPOT.research.x + 0.4, SPOT.research.z, 0.95, 0.42],
];
const SHADOW_VERT = `
attribute vec2 aPos; attribute vec2 aUv;
uniform mat4 uView; uniform mat4 uProj;
varying vec2 vUv;
void main() { vUv = aUv; gl_Position = uProj * uView * vec4(aPos.x, 0.034, aPos.y, 1.0); }`;
const SHADOW_FRAG = `
precision mediump float;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float a = (1.0 - smoothstep(0.15, 1.0, r)) * 0.16;
  gl_FragColor = vec4(vec3(0.22, 0.24, 0.32) * a, a);
}`;

function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return p;
}

/**
 * Cel shading [direction: a cel shaded, cartoony look, smooth edges without everything looking blocky]: each colour
 * in flat bands of light (lit, half-lit, a cool shade), a crisp highlight on the glossy, a thin rim of light at the
 * edges; lights glow flat and steady. The paper deck's bands are softer.
 */
const TOON_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vLN; varying float vMat; varying vec3 vCol;
uniform vec3 uEye; uniform float uAlpha;
float band(float x, float at) { float w = max(fwidth(x), 1e-4) * 0.9; return smoothstep(at - w, at + w, x); }
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - vW);
  if (dot(n, v) < 0.0) n = -n;
  float m = vMat;
  if (m > 1.5 && m < 2.5) {
    gl_FragColor = vec4(mix(vCol, vec3(1.0), 0.2) * uAlpha, uAlpha);
    return;
  }
  vec3 l = normalize(vec3(0.42, 0.85, 0.35));
  float d = dot(n, l);
  vec3 shade = vec3(0.72, 0.76, 0.9);
  float k = m > 6.5 ? 0.9 + 0.1 * band(d, 0.0) : 0.0;
  vec3 c;
  if (m > 6.5) c = vCol * mix(shade, vec3(1.0), 0.55 + 0.45 * band(d, 0.0));
  else c = vCol * mix(shade * 0.82, vec3(1.0), 0.45 * band(d, -0.1) + 0.55 * band(d, 0.45));
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 48.0);
  if (m < 6.5) c += vec3(1.0) * band(spec, 0.55) * (m > 0.5 && m < 1.5 ? 0.45 : 0.22);
  float rim = 1.0 - max(dot(n, v), 0.0);
  c = mix(c, vec3(1.0), band(rim, 0.78) * 0.16 * (1.0 - k));
  gl_FragColor = vec4(min(c, vec3(1.0)) * uAlpha, uAlpha);
}`;

/** The ink outline: each model drawn again, swollen along its normals by about a pixel and a half, in ink, set just behind itself (so only its rim shows round the edge). */
const OUTLINE_VERT = `
attribute vec3 aPos; attribute vec3 aNorm;
uniform mat4 uView; uniform mat4 uProj; uniform mat4 uModel; uniform float uWidth;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vec4 v = uView * w;
  vec3 vn = normalize(mat3(uView) * normalize(mat3(uModel) * aNorm));
  v.xyz += vn * uWidth * -v.z;
  vec4 p = uProj * v;
  p.z += 0.0012 * p.w;
  gl_Position = p;
}`;
const OUTLINE_FRAG = `
precision mediump float;
void main() { gl_FragColor = vec4(0.16, 0.17, 0.24, 1.0); }`;

interface Part {
  buf: WebGLBuffer;
  count: number;
  zone: BaseZone | null;
  model: () => M4;
  /** Inked round its edge (not the hologram's light). */
  outline: boolean;
}

/** A base drawn on a canvas: hover a station to light it, ask which station is at a point, where each label goes. */
export class Base3d {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private inkProg: WebGLProgram;
  private shadowProg: WebGLProgram;
  private shadowBuf: WebGLBuffer;
  private parts: Part[] = [];
  private halos = new Map<BaseZone, { buf: WebGLBuffer; count: number }>();
  private raf = 0;
  private last = 0;
  private start = performance.now();
  private hovered: BaseZone | null = null;
  private glow: Record<BaseZone, number> = { hangar: 0, captain: 0, research: 0 };
  private view: M4 = IDENTITY;
  private proj: M4 = IDENTITY;
  private eye: V3 = [0, 2, 6];
  private shipKey = '';
  /** Told after each frame (to lay the labels by their stations). */
  onFrame: (() => void) | null = null;
  /** Covered (a page open over it): not drawn. */
  paused = false;

  private constructor(readonly canvas: HTMLCanvasElement, gl: WebGLRenderingContext, ship: CaptainShipSpec) {
    this.gl = gl;
    gl.getExtension('OES_standard_derivatives');
    this.prog = program(gl, SHIP_VERT, TOON_FRAG);
    this.inkProg = program(gl, OUTLINE_VERT, OUTLINE_FRAG);
    this.shadowProg = program(gl, SHADOW_VERT, SHADOW_FRAG);
    const quads: number[] = [];
    for (const [x, z, rx, rz] of SHADOWS) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      for (const [u, v] of c) quads.push(x + u * rx, z + v * rz, u, v);
    }
    this.shadowBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quads), gl.STATIC_DRAW);
    const mesh = (build: (m: Mesh) => void) => {
      const m = new Mesh();
      build(m);
      return new Float32Array(m.out);
    };
    for (const z of BASE_ZONES) {
      const data = halo(z);
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.halos.set(z, { buf, count: data.length / SHIP_STRIDE });
    }
    this.add(mesh(deck), null, () => IDENTITY);
    this.add(mesh(hangar), 'hangar', () => IDENTITY);
    this.add(mesh(captain), 'captain', () => IDENTITY);
    this.add(mesh(research), 'research', () => IDENTITY);
    // The hologram turns slowly, bobbing, over its pedestal.
    const holo = SPOT.research;
    this.add(hologram(), 'research', () => {
      const t = this.time();
      return place(holo.x + 0.9, 0.72 + 0.03 * Math.sin(t * 1.3), holo.z - 0.2, t * 0.5, 0.95);
    }, false);
    this.setShip(ship);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** A base on this canvas, or null where WebGL isn't to be had. */
  static mount(canvas: HTMLCanvasElement, ship: CaptainShipSpec): Base3d | null {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, depth: true });
    if (!gl) return null;
    return new Base3d(canvas, gl, ship);
  }

  private add(data: Float32Array, zone: BaseZone | null, model: () => M4, outline = true) {
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.parts.push({ buf, count: data.length / SHIP_STRIDE, zone, model, outline });
  }

  /** The Captain's ship in the bay, as fitted (rebuilt only when it changes). */
  setShip(spec: CaptainShipSpec) {
    const key = JSON.stringify(spec);
    if (key === this.shipKey) return;
    this.shipKey = key;
    this.parts = this.parts.filter((p) => p.model !== this.shipModel);
    const model = captainShip3d(spec);
    this.add(model.mesh, 'hangar', this.shipModel);
  }

  private shipModel = (): M4 => {
    const t = this.time();
    // (Resting on its clamps, lifting and settling a hair as if its engines idled.)
    return place(SPOT.hangar.x + 0.5, 0.36 + 0.006 * Math.sin(t * 1.7), SPOT.hangar.z + 0.05, -0.42, 1.75);
  };

  private time() {
    return (performance.now() - this.start) / 1000;
  }

  hover(zone: BaseZone | null) {
    this.hovered = zone;
  }

  /** The station at a point on the canvas (CSS pixels from its corner, as laid out), if any. */
  zoneAt(x: number, y: number): BaseZone | null {
    let best: BaseZone | null = null, bestK = 1;
    for (const z of BASE_ZONES) {
      const s = SPOT[z];
      const sx = s.x + (s.cx ?? 0);
      const c = this.toScreen([sx, s.r * 0.55, s.z]);
      const e = this.toScreen([sx + s.r, s.r * 0.55, s.z]);
      if (!c || !e) continue;
      const rx = Math.abs(e.x - c.x);
      const k = Math.hypot((x - c.x) / rx, (y - c.y) / (rx * 0.9));
      if (k < bestK) {
        bestK = k;
        best = z;
      }
    }
    return best;
  }

  /** Where a station's label goes on the canvas (CSS pixels, as laid out). */
  labelAt(zone: BaseZone): { x: number; y: number } | null {
    return this.toScreen(SPOT[zone].label);
  }

  private toScreen(p: V3): { x: number; y: number } | null {
    const v = this.view, P = this.proj;
    const ex = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12];
    const ey = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13];
    const ez = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14];
    if (ez >= -0.01) return null;
    const w = -ez;
    return { x: (((P[0] * ex) / w + 1) / 2) * this.canvas.clientWidth, y: ((1 - (P[5] * ey) / w) / 2) * this.canvas.clientHeight };
  }

  private loop(now: number) {
    if (!this.canvas.isConnected) return this.destroy();
    this.raf = requestAnimationFrame(this.loop);
    // (At most 30 frames a second: it is a calm scene.)
    if (now - this.last < 32 || this.paused) return;
    this.last = now;
    this.draw();
    this.onFrame?.();
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
    // The camera: before the deck, a little above it, drawn back far enough that all three stations fit; swaying.
    const aspect = lw / lh;
    const fov = (30 * Math.PI) / 180;
    const half = Math.tan(fov / 2);
    const dist = Math.max(3.75 / (half * aspect), 1.45 / half);
    const yaw = 0.035 * Math.sin(t * 0.21);
    const dir: V3 = norm3([Math.sin(yaw), 0.42, Math.cos(yaw)]);
    const target: V3 = [0, 0.62, 0];
    this.eye = [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist];
    this.view = lookAt(this.eye, target);
    this.proj = perspective(fov, aspect, 0.1, 60);

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // (Each station's light eases in and out.)
    for (const z of BASE_ZONES) this.glow[z] += ((this.hovered === z ? 1 : 0) - this.glow[z]) * 0.35;

    // The ink first: every model's outline, a little behind it.
    const ip = this.inkProg;
    gl.useProgram(ip);
    gl.uniformMatrix4fv(gl.getUniformLocation(ip, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(ip, 'uProj'), false, this.proj);
    // (About 1.4 CSS pixels wide, whatever the distance.)
    gl.uniform1f(gl.getUniformLocation(ip, 'uWidth'), (1.4 * 2 * half) / lh);
    const ipos = gl.getAttribLocation(ip, 'aPos'), inorm = gl.getAttribLocation(ip, 'aNorm');
    gl.enableVertexAttribArray(ipos);
    gl.enableVertexAttribArray(inorm);
    for (const part of this.parts) {
      if (!part.outline) continue;
      gl.uniformMatrix4fv(gl.getUniformLocation(ip, 'uModel'), false, part.model());
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buf);
      gl.vertexAttribPointer(ipos, 3, gl.FLOAT, false, SHIP_STRIDE * 4, 0);
      gl.vertexAttribPointer(inorm, 3, gl.FLOAT, false, SHIP_STRIDE * 4, 12);
      gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
    gl.disableVertexAttribArray(ipos);
    gl.disableVertexAttribArray(inorm);

    const p = this.prog;
    gl.useProgram(p);
    const u = (n: string) => gl.getUniformLocation(p, n);
    gl.uniformMatrix4fv(u('uView'), false, this.view);
    gl.uniformMatrix4fv(u('uProj'), false, this.proj);
    gl.uniform3fv(u('uEye'), this.eye);
    gl.uniform3f(u('uColor'), 0.55, 0.62, 0.78);
    gl.uniform1f(u('uTime'), t);
    gl.uniform1f(u('uAlpha'), 1);
    gl.uniform1f(u('uBurn'), 0);
    const attrs: [string, number, number][] = [['aPos', 3, 0], ['aNorm', 3, 3], ['aCol', 3, 6], ['aMat', 1, 9]];
    const locs = attrs.map(([n]) => gl.getAttribLocation(p, n));
    for (const part of this.parts) {
      gl.uniformMatrix4fv(u('uModel'), false, part.model());
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buf);
      attrs.forEach(([, size, off], i) => {
        if (locs[i] < 0) return;
        gl.enableVertexAttribArray(locs[i]);
        gl.vertexAttribPointer(locs[i], size, gl.FLOAT, false, SHIP_STRIDE * 4, off * 4);
      });
      gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
    // The hovered station's floor lit by its ring of light (faded in and out, blended, not written to depth).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniformMatrix4fv(u('uModel'), false, IDENTITY);
    for (const z of BASE_ZONES) {
      const h = this.halos.get(z);
      if (!h || this.glow[z] < 0.01) continue;
      gl.uniform1f(u('uAlpha'), this.glow[z]);
      gl.bindBuffer(gl.ARRAY_BUFFER, h.buf);
      attrs.forEach(([, size, off], i) => {
        if (locs[i] < 0) return;
        gl.enableVertexAttribArray(locs[i]);
        gl.vertexAttribPointer(locs[i], size, gl.FLOAT, false, SHIP_STRIDE * 4, off * 4);
      });
      gl.drawArrays(gl.TRIANGLES, 0, h.count);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    locs.forEach((l) => l >= 0 && gl.disableVertexAttribArray(l));

    // The shadows, laid over the deck (blended, not written to depth).
    const sp = this.shadowProg;
    gl.useProgram(sp);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uProj'), false, this.proj);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuf);
    const pa = gl.getAttribLocation(sp, 'aPos'), ua = gl.getAttribLocation(sp, 'aUv');
    gl.enableVertexAttribArray(pa);
    gl.enableVertexAttribArray(ua);
    gl.vertexAttribPointer(pa, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(ua, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLES, 0, SHADOWS.length * 6);
    gl.disableVertexAttribArray(pa);
    gl.disableVertexAttribArray(ua);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
