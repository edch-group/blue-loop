/**
 * The Captain's companions as the campaign menu's ship carries them (companions.ts) [direction: every character earnt
 * sits or stands on the ship somewhere in the campaign menu with the Captain; the mechanic crouched over the antenna
 * fixing it; the Aureline lancer sat with both legs dangling over the railing, facing the camera; the Xel'Naru flying
 * alongside the ship, just below and to the left of it, both arms behind it, with its own bob], after their art:
 * Kaelen, the Aureline lancer, sitting on the foredeck's near rail, his legs over the side, his lance leant on his
 * shoulder; Mara Venn, the engineer, crouched on the hull over the sensor dish astern, its panel open, a wrench in it;
 * Vey'Sharr, the Xel'Naru defector, flying alongside, leaning into the flight, arms swept back, its shards apart round a
 * core of light. Box units as the Captain's (captain-model.ts): built facing +y, about 40 tall.
 */
import type { CompanionId } from '../engine/companions';
import { cloth, turned } from './captain-model';
import { Mesh, type RGB, type V3 } from './ship3d';

// (Materials: 0 plated metal, 1 glass or crystal, 2 glowing, 3 living, 4 dark gloss.)
const METAL = 0, GLASS = 1, GLOW = 2, SOFT = 3, GLOSS = 4;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A limb: a tube through its points, tapering, a ball at each joint. */
function lim(m: Mesh, pts: V3[], r0: number, r1: number, col: RGB, mat: number) {
  m.tube(pts, r0, r1, col, mat, 18);
  for (let i = 1; i < pts.length - 1; i++) m.ball(pts[i][0], pts[i][1], pts[i][2], r0 + ((r1 - r0) * i) / (pts.length - 1), col, mat, 16, 10);
}

/** A rounded plate laid from `a` to `b` (its thickness `t` and width `w` about that line), turned `roll` about it. */
function plate(m: Mesh, a: V3, b: V3, w: number, t: number, col: RGB, mat: number, roll = 0, round = 3) {
  const L = dist(a, b);
  m.orient(a, sub(b, a), () => m.rbox(20 + L / 2, 12, 0, L / 2, w, t, col, mat, round, round, 24, 12), roll);
}

// ---- Kaelen, the Aureline lancer ----
const IVORY: RGB = [0.88, 0.86, 0.8];
const IVORY_SHADE: RGB = [0.74, 0.72, 0.68];
const GOLD: RGB = [0.86, 0.64, 0.28];
const ALIEN: RGB = [0.7, 0.71, 0.74];
const ALIEN_SHADE: RGB = [0.58, 0.59, 0.63];
const UNDERSUIT: RGB = [0.3, 0.27, 0.3];
const CRIMSON: RGB = [0.52, 0.12, 0.12];
const CRIMSON_DARK: RGB = [0.36, 0.08, 0.09];
const LANCE_LIGHT: RGB = [1, 0.8, 0.38];
const EYE: RGB = [0.1, 0.14, 0.32];
/** How far Kaelen slouches forward over his lap. */
const SLOUCH = -0.2;

/**
 * Kaelen, sitting easy on the rail [direction: more relaxed, slouched, spear facing down, one leg on the railing]: his
 * seat at (20, 12, 20), the left leg hanging over the side, the right drawn up with its foot on the rail, his forearm
 * over that knee; slouched forward, head low; the lance held loosely at his left side, its blade pointing down over the
 * side; his cape falling behind him onto the deck.
 */
function lancerModel(): Float32Array {
  const m = new Mesh();
  // Legs: white plate over a dark undersuit; a gold-rimmed knee cop; long greaves; pointed sabatons.
  // (The left hangs over the side; the right is drawn up, its foot set on the rail beside him, toes along it.)
  const legs: [V3, V3, V3, V3][] = [
    [[18.5, 12.6, 20.4], [18.3, 22, 20.7], [18.1, 23.6, 8.6], [0, 2.6, -1.4]],
    [[21.5, 12.6, 20.6], [24, 16.4, 29], [27.6, 12.6, 21.4], [2.8, 0.3, -0.5]],
  ];
  for (const [hip, knee, ankle, toeDir] of legs) {
    lim(m, [hip, knee, ankle], 1.2, 0.9, UNDERSUIT, SOFT);
    // Cuisse over the thigh, its top edge rolled in gold.
    plate(m, lerp(hip, knee, 0.08), lerp(hip, knee, 0.86), 1.5, 1.3, IVORY, METAL);
    plate(m, lerp(hip, knee, 0.08), lerp(hip, knee, 0.15), 1.6, 1.4, GOLD, METAL);
    // Knee cop: a domed plate, a gold rim.
    m.rbox(knee[0], knee[1] + 0.45, knee[2] + 0.1, 1.25, 0.65, 1.2, IVORY, METAL, 2.4, 2.4);
    m.ring(knee[0], knee[1] + 0.95, knee[2] + 0.1, 0.75, 0.13, Math.PI / 2, GOLD, METAL);
    // Greave down the shin, a gold ridge down its front.
    plate(m, lerp(knee, ankle, 0.1), lerp(knee, ankle, 0.94), 1.3, 1.15, IVORY, METAL);
    plate(m, lerp(knee, ankle, 0.14), lerp(knee, ankle, 0.9), 0.22, 1.22, GOLD, METAL);
    // Sabaton: lames over the foot, pointed at the toe (the foot hanging, toes down a little).
    const toe: V3 = [ankle[0] + toeDir[0], ankle[1] + toeDir[1], ankle[2] + toeDir[2]];
    plate(m, [ankle[0] - toeDir[0] * 0.15, ankle[1] - toeDir[1] * 0.15, ankle[2] - 0.2], toe, 1.05, 0.8, IVORY_SHADE, METAL);
    m.ball(ankle[0], ankle[1], ankle[2], 1.1, IVORY, METAL, 14, 9);
  }
  // Hips: a fauld of overlapping lames, tassets over the thighs, a gold belt with a sun boss.
  m.rbox(20, 12.2, 20.6, 3.5, 2.5, 1.6, UNDERSUIT, SOFT, 2.4, 2.4);
  for (let i = 0; i < 3; i++) m.rbox(20, 12.4 + i * 0.1, 22.9 - i * 0.9, 3.55 - i * 0.05, 2.45, 0.55, IVORY, METAL, 2.6, 4);
  for (const sd of [-1, 1]) plate(m, [20 + sd * 1.8, 13.4, 21.6], [20 + sd * 1.9, 17.2, 21.2], 1.55, 0.45, IVORY, METAL, 0, 4);
  m.rbox(20, 12.4, 23.8, 3.6, 2.55, 0.5, GOLD, METAL, 2.6, 6);
  m.ball(20, 14.95, 23.8, 0.55, LANCE_LIGHT, GLOW, 10, 6);
  // Leaning back [direction: Kaelen leaning back a little, at ease, not stiff]: the body above the hips tipped back.
  turned(m, [20, 12.2, 22], 'x', SLOUCH, () => {
    // The cuirass: a narrow waist, the chest swelling over it, sculpted plates, a gold sunburst between.
    m.rbox(20, 12.2, 26, 2.4, 1.8, 2.4, IVORY_SHADE, METAL, 2.6, 2.6);
    m.rbox(20, 12.3, 29.8, 3.2, 2.2, 3.2, IVORY, METAL, 2.4, 2.4);
    for (const sd of [-1, 1]) m.rbox(20 + sd * 1.4, 13.85, 30.5, 1.35, 0.7, 1.8, IVORY, METAL, 2.2, 2.2);
    m.rbox(20, 14.45, 29.6, 0.3, 0.25, 2.2, GOLD, METAL, 3, 3);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      plate(m, [20, 14.55, 29.4], [20 + Math.cos(a) * 1.2, 14.55, 29.4 + Math.sin(a) * 1.2], 0.16, 0.12, GOLD, METAL);
    }
    m.ball(20, 14.65, 29.4, 0.4, LANCE_LIGHT, GLOW, 10, 6);
    // Gorget: a high gold collar.
    m.cyl([20, 12.2, 32.2], [20, 12.2, 33.6], 1.7, 1.45, GOLD, METAL, 20);
    // Pauldrons: three lames each, broad and swept up, gold-edged.
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = 20 + sd * (3.4 + i * 0.3), z = 32.8 - i * 1;
        turned(m, [x, 12.2, z], 'y', sd * (0.4 + i * 0.12), () => {
          m.rbox(x, 12.2, z, 1.6 - i * 0.12, 1.9 - i * 0.1, 0.6, IVORY, METAL, 2.4, 3);
          m.rbox(x, 12.2, z - 0.48, 1.65 - i * 0.12, 1.95 - i * 0.1, 0.14, GOLD, METAL, 2.4, 3);
        });
      }
    }
    // A long slim grey neck; the head, smooth and long, its crown swept back; one great eye; a narrow lipless face.
    m.cyl([20, 12.2, 33.4], [20, 12.5, 35.6], 0.8, 0.72, ALIEN, SOFT, 14);
    turned(m, [20, 12.5, 35.8], 'x', 0.5, () => {
      turned(m, [20, 12.3, 37.6], 'x', -0.5, () => m.rbox(20, 11.6, 38.6, 1.75, 2.9, 1.95, ALIEN, SOFT, 2, 2, 30, 18));
      m.rbox(20, 13, 37.2, 1.6, 1.45, 2.1, ALIEN, SOFT, 2, 2, 28, 16);
      m.rbox(20, 13.4, 35.6, 0.95, 1, 1, ALIEN_SHADE, SOFT, 2, 2, 18, 10);
      m.ball(20, 14.2, 37.7, 0.85, EYE, GLASS, 18, 12);
      m.ball(20, 14.85, 37.75, 0.24, [0.85, 0.92, 1], GLOW, 8, 5);
      m.ring(20, 14.25, 37.7, 0.9, 0.13, Math.PI / 2, ALIEN_SHADE, SOFT);
      m.rbox(20, 14.3, 35.9, 0.45, 0.08, 0.05, ALIEN_SHADE, SOFT, 2, 2, 10, 6);
      // The halo, round his head at the brow, tipped back with it.
      m.ring(20, 12.2, 39.4, 3, 0.2, 0.25, GOLD, GLOW);
    });
  });
  // A crimson tabard from the belt, over his lap and down between his knees, hemmed in gold.
  const tab: V3[][] = [];
  for (let r = 0; r <= 6; r++) {
    const t = r / 6;
    const y = t < 0.6 ? 14.7 + (t / 0.6) * 5.6 : 20.3 + (t - 0.6) * 1.5;
    const z = t < 0.6 ? 22.6 - (t / 0.6) * 0.5 : 22.1 - ((t - 0.6) / 0.4) * 6.5;
    tab.push([-1.3, -0.45, 0.45, 1.3].map((dx) => [20 + dx * (1 - t * 0.15), y + Math.abs(dx) * -0.1, z + (t < 0.6 ? 0.15 * (1.3 - Math.abs(dx)) : 0)] as V3));
  }
  cloth(m, tab, CRIMSON, GOLD);
  const slouch = (p: V3): V3 => {
    const c = Math.cos(SLOUCH), sn = Math.sin(SLOUCH), dy = p[1] - 12.2, dz = p[2] - 22;
    return [p[0], 12.2 + dy * c + dz * sn, 22 - dy * sn + dz * c];
  };
  // The cape: from the shoulders, down his back and over the rail onto the deck behind him.
  const grid: V3[][] = [];
  for (let r = 0; r <= 10; r++) {
    const row: V3[] = [];
    for (let c = 0; c <= 8; c++) {
      const t = r / 10, a = Math.PI * (0.15 + 0.7 * (c / 8));
      const fold = 0.35 * Math.sin(c * 1.7 + t * 4) * t;
      const y = 10.6 - Math.sin(a) * 1.6 - (t > 0.45 ? (t - 0.45) * 9 : 0) + fold;
      const at: V3 = [20 - Math.cos(a) * (4 + t * 1.6), y, Math.max(14.3, 32.2 - t * 26)];
      // (Its top with his shoulders, leaning back.)
      row.push(at[2] > 22 ? slouch(at) : at);
    }
    grid.push(row);
  }
  cloth(m, grid, CRIMSON, CRIMSON_DARK);
  // Arms, from where his shoulders went as he leant back: the right reaching back, its hand braced on the rail behind
  // him [direction: the arm not holding the spear behind him]; the left down at his side, holding the lance loosely,
  // its blade pointing down over the side.
  const arm = (sh: V3, el: V3, wr: V3) => {
    lim(m, [sh, el, wr], 0.9, 0.75, UNDERSUIT, SOFT);
    plate(m, lerp(sh, el, 0.15), lerp(sh, el, 0.9), 1.1, 1.05, IVORY, METAL);
    plate(m, lerp(el, wr, 0.1), lerp(el, wr, 0.92), 1, 0.95, IVORY, METAL);
    plate(m, lerp(el, wr, 0.75), lerp(el, wr, 0.9), 1.06, 1.01, GOLD, METAL);
    m.rbox(el[0], el[1] - 0.4, el[2], 0.8, 0.55, 0.9, IVORY, METAL, 2.4, 2.4);
  };
  const rw: V3 = [24.4, 7.6, 20.6];
  arm(slouch([23.6, 12.2, 31.6]), [25.6, 8.6, 26], rw);
  // (The hand flat on the rail, fingers back.)
  m.rbox(rw[0], rw[1] - 0.8, rw[2] - 0.5, 0.75, 1.1, 0.45, ALIEN, SOFT, 2.4, 2.4);
  const lw: V3 = [15.2, 15.4, 21.8];
  arm(slouch([16.4, 12.2, 31.6]), [15.2, 12.8, 26.6], lw);
  m.rbox(lw[0], lw[1] + 0.1, lw[2], 0.85, 0.9, 0.95, IVORY_SHADE, METAL, 2.6, 2.6);
  // The lance through that hand, its butt up behind his shoulder, its leaf of light hanging down past the hull.
  const d: V3 = [0.05, 0.42, -1];
  const dl = Math.hypot(d[0], d[1], d[2]);
  const at = (k: number): V3 => [lw[0] + (d[0] / dl) * k, lw[1] + (d[1] / dl) * k, lw[2] + (d[2] / dl) * k];
  const butt = at(-10), head = at(22);
  m.cyl(butt, head, 0.28, 0.26, IVORY, METAL, 12);
  for (const t of [0.02, 0.5, 0.97]) m.cyl(lerp(butt, head, t - 0.012), lerp(butt, head, t + 0.012), 0.44, 0.44, GOLD, METAL, 12);
  m.shard(head, d, 7, 1.05, LANCE_LIGHT, GLOW);
  return new Float32Array(m.out);
}

// ---- Mara Venn, the engineer ----
const WORK_COAT: RGB = [0.34, 0.29, 0.24];
const WORK_SHADE: RGB = [0.27, 0.23, 0.2];
const OVERALL: RGB = [0.28, 0.29, 0.33];
const HUMAN: RGB = [0.82, 0.63, 0.53];
const HUMAN_SHADE: RGB = [0.7, 0.52, 0.44];
const GREY_HAIR: RGB = [0.56, 0.54, 0.52];
const GOGGLE: RGB = [0.2, 0.3, 0.34];
const BRASS: RGB = [0.74, 0.56, 0.3];
const AMBER: RGB = [1, 0.62, 0.22];
const SPARK: RGB = [1, 0.84, 0.5];
const STEEL: RGB = [0.62, 0.64, 0.68];
const BOOTS: RGB = [0.27, 0.21, 0.17];
const BELT: RGB = [0.36, 0.25, 0.17];

/** Where Mara's hands are at work, in her own box units (the dish's back, its panel open). */
const MARA_WORK: V3 = [20, 20.6, 21.5];

/**
 * Mara, crouched deep on the hull over the sensor dish: her left foot planted ahead, her right knee down, leaning in; her left
 * hand holding the mast's panel open, her right working a wrench inside it, sparks; her head bowed into the work.
 */
function engineerModel(): Float32Array {
  const m = new Mesh();
  // Legs: the left in a deep crouch, its knee by her chest; the right knee down on the roof, on her toes.
  lim(m, [[18.5, 12.2, 9.4], [18.2, 16.8, 12.6], [18.1, 16.4, 2.2]], 1.6, 1.25, OVERALL, SOFT);
  lim(m, [[21.5, 11.8, 9.2], [21.8, 15.8, 2.4], [21.8, 10.6, 2.6]], 1.6, 1.25, OVERALL, SOFT);
  // Knee pads; boots, thick-soled.
  m.ball(18.2, 17.9, 12.8, 1.2, BELT, SOFT, 12, 8);
  m.ball(21.8, 16.9, 2.5, 1.15, BELT, SOFT, 12, 8);
  m.rbox(18.1, 17.3, 1.1, 1.35, 2.4, 1.15, BOOTS, SOFT, 3, 3);
  m.rbox(18.1, 17.5, 0.2, 1.45, 2.5, 0.3, [0.14, 0.12, 0.11], SOFT, 4, 4);
  turned(m, [21.8, 10.4, 2], 'x', 0.7, () => m.rbox(21.8, 9.4, 2, 1.25, 2, 1.1, BOOTS, SOFT, 3, 3));
  // Leaning in, from the hips.
  turned(m, [20, 12, 9.6], 'x', 0.62, () => {
    m.rbox(20, 12, 10.4, 3.4, 2.3, 2, OVERALL, SOFT, 2.4, 2.4);
    // A tool belt slung round: pouches, a hammer, a coil of cable.
    m.rbox(20, 12, 12.3, 3.55, 2.45, 0.7, BELT, SOFT, 2.6, 6);
    for (const [dx, dy] of [[-2.8, 1.4], [2.8, 1.4], [3.3, -0.6]] as const) m.rbox(20 + dx, 12 + dy, 11.6, 0.85, 0.65, 1.15, BELT, SOFT, 3, 3);
    m.cyl([23.6, 11.4, 12.4], [24.2, 10.8, 8.8], 0.18, 0.18, STEEL, METAL, 8);
    m.ring(16.4, 11.2, 11.4, 1, 0.28, Math.PI / 2, [0.18, 0.2, 0.22], GLOSS);
    // The work coat: heavy, its collar up, its skirt falling round her hips.
    m.rbox(20, 12, 16.6, 3.7, 2.45, 4.2, WORK_COAT, SOFT, 2.4, 2.6);
    m.rbox(20, 11.8, 20.8, 3.2, 2.1, 1.3, WORK_COAT, SOFT, 2.2, 3);
    m.rbox(20, 11.2, 21.6, 2.4, 1.4, 1.1, WORK_SHADE, SOFT, 2, 3);
    for (const sd of [-1, 1]) {
      m.ball(20 + sd * 3.6, 12, 19.6, 1.65, WORK_COAT, SOFT, 16, 10);
      m.rbox(20 + sd * 2.6, 13.9, 15.8, 0.9, 0.5, 3.4, WORK_SHADE, SOFT, 2.6, 3);
    }
    m.rbox(20, 10.4, 10.6, 3.6, 1.2, 2.8, WORK_SHADE, SOFT, 2.4, 3);
    // Her head, bowed into the work: grey hair cropped short, goggles pushed up on her brow.
    turned(m, [20, 12.4, 22], 'x', 0.35, () => {
      m.cyl([20, 12.2, 21.4], [20, 12.5, 23.2], 0.85, 0.8, HUMAN, SOFT, 12);
      m.rbox(20, 12.8, 25.2, 1.75, 2, 2.3, HUMAN, SOFT, 2, 2, 28, 16);
      m.rbox(20, 13.1, 23.9, 1.35, 1.7, 1, HUMAN_SHADE, SOFT, 2, 2, 20, 10);
      m.rbox(20, 14.75, 25.1, 0.28, 0.4, 0.55, HUMAN_SHADE, SOFT, 2, 2, 10, 6);
      for (const sd of [-1, 1]) m.rbox(20 + sd * 0.7, 14.65, 25.6, 0.24, 0.1, 0.13, [0.1, 0.09, 0.1], 0, 2, 2, 10, 6);
      m.rbox(20, 12.4, 26.5, 1.88, 2.05, 1.25, GREY_HAIR, SOFT, 2, 2, 24, 12);
      m.rbox(20, 11.4, 25.2, 1.75, 1.15, 1.9, GREY_HAIR, SOFT, 2, 2, 20, 10);
      for (const sd of [-1, 1]) {
        m.ball(20 + sd * 0.8, 14.55, 26.6, 0.58, GOGGLE, GLASS, 12, 8);
        m.rbox(20 + sd * 0.8, 14.3, 26.6, 0.68, 0.32, 0.66, BRASS, METAL, 3, 3);
      }
      m.rbox(20, 12.6, 26.6, 1.95, 2.1, 0.2, BELT, SOFT, 2, 3, 24, 6);
    });
  });
  // Her left hand up holding the mast's panel open; her right in it with a wrench. (Each arm from where its shoulder
  // went as she leant in.)
  const lean = (p: V3): V3 => {
    const a = 0.62, c = Math.cos(a), sn = Math.sin(a), dy = p[1] - 12, dz = p[2] - 9.6;
    return [p[0], 12 + dy * c + dz * sn, 9.6 - dy * sn + dz * c];
  };
  const lsh = lean([16.4, 12, 19.6]), rsh = lean([23.6, 12, 19.6]);
  const [wx, wy, wz] = MARA_WORK;
  lim(m, [lsh, [15.6, 17.4, 19.6], [18.4, wy - 0.6, wz + 1.6]], 1.05, 0.9, WORK_SHADE, SOFT);
  m.rbox(16.4, 16.8, 19.4, 0.95, 1, 1.25, AMBER, GLOW, 3, 3);
  m.ball(18.6, wy - 0.3, wz + 1.7, 0.85, HUMAN, SOFT, 12, 8);
  lim(m, [rsh, [24.2, 17, 16.6], [21.4, wy - 0.8, wz - 1.2]], 1.05, 0.9, WORK_SHADE, SOFT);
  m.ball(21.3, wy - 0.5, wz - 1.2, 0.85, HUMAN, SOFT, 12, 8);
  // The panel, swung open off the mast, in her hand; the wrench in the works; sparks.
  plate(m, [18.6, wy + 0.1, wz + 2.8], [18.6, wy + 0.1, wz - 0.4], 1.5, 0.12, STEEL, METAL, Math.PI / 2, 4);
  m.cyl([21.3, wy - 0.5, wz - 1.2], [wx + 0.4, wy + 0.9, wz - 0.2], 0.24, 0.24, STEEL, METAL, 8);
  m.rbox(wx + 0.5, wy + 1, wz - 0.1, 0.55, 0.5, 0.25, STEEL, METAL, 3, 3);
  for (const [dx, dy, dz, r] of [[0.9, 1.3, 0.4, 0.22], [1.6, 0.6, 1.1, 0.14], [0.2, 0.4, 1.4, 0.12], [1.8, 1.4, -0.5, 0.1], [-0.4, 1.2, 0.9, 0.1]] as const)
    m.ball(wx + dx, wy + dy, wz + dz, r, SPARK, GLOW, 6, 4);
  // A toolbox open on the roof beside her.
  m.rbox(25.4, 12.6, 1.5, 2, 1.3, 1.5, [0.55, 0.2, 0.16], METAL, 4, 4);
  m.rbox(25.4, 12.6, 3.05, 2.05, 1.35, 0.12, [0.16, 0.15, 0.16], METAL, 4, 4);
  m.cyl([24.4, 12.6, 3.2], [26.4, 12.6, 3.2], 0.14, 0.14, STEEL, METAL, 6);
  return new Float32Array(m.out);
}

// ---- Vey'Sharr, the Xel'Naru defector ----
const SHARD: RGB = [0.62, 0.48, 0.86];
const SHARD_DEEP: RGB = [0.44, 0.32, 0.7];
const SHARD_PALE: RGB = [0.76, 0.66, 0.95];
const CORE: RGB = [0.94, 0.9, 1];
const SCRAP: RGB = [0.27, 0.28, 0.33];

/**
 * Vey'Sharr in flight: leaning hard into it, both arms swept back behind it (the right's forearm still a blade, along
 * its side), its legs trailing; every shard apart from the next, the core blazing in its chest.
 */
function defectorModel(): Float32Array {
  const m = new Mesh();
  // (Heavy shards, as the art's: broad slabs of crystal, not splinters.)
  const sh = (base: V3, dir: V3, l: number, r: number, col: RGB = SHARD, roll = 0) => m.shard(base, dir, l * 1.05, r * 1.85, col, GLASS, roll);
  turned(m, [20, 12, 24], 'x', 0.8, () => {
    m.ball(20, 12.4, 28, 1.6, CORE, GLOW, 16, 10);
    // Ribs of shards curving out and back from the core, a gap between each; a breastbone; shoulders.
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 3; i++) sh([20 + sd * 1.7, 13, 30 - i * 1.9], [sd, 0.2, -0.15 - i * 0.25], 3.2 - i * 0.4, 0.85, i % 2 ? SHARD_DEEP : SHARD, i);
      sh([20 + sd * 2.4, 12, 32.6], [sd, -0.3, 0.25], 3.2, 1.25, SHARD, sd);
    }
    sh([20, 13.4, 31.6], [0, 0.25, 1], 2.4, 0.7, SHARD_DEEP);
    // A breastplate of slabs over the core, and a broad back.
    for (const [dx, dz, c] of [[-1.6, 30.6, SHARD], [1.6, 30.6, SHARD_PALE], [-1.4, 26.4, SHARD_DEEP], [1.4, 26.4, SHARD]] as const) sh([20 + dx * 0.4, 13.2, dz], [dx, 0.9, (dz - 28.5) * 0.3], 2.6, 1, c);
    m.rbox(20, 10.8, 29.4, 3, 1.4, 3.2, SHARD_DEEP, GLASS, 3, 3);
    sh([20, 13.2, 26.2], [0, 0.15, -1], 2.4, 0.9, SHARD);
    // Back shards, like folded wings.
    for (const sd of [-1, 1]) sh([20 + sd * 1.2, 10.4, 30.6], [sd * 0.4, -1, 0.5], 4.6, 0.9, SHARD_DEEP, sd);
    // Arms swept back behind it: upper arm, forearm, a fist of small shards; the right's forearm a long blade.
    for (const sd of [-1, 1]) {
      sh([20 + sd * 4, 11.4, 31.2], [sd * 0.25, -0.75, -0.55], 4.4, 0.85, SHARD);
      if (sd < 0) {
        sh([16.6, 7.6, 28.4], [-0.1, -0.85, -0.45], 3.8, 0.75, SHARD_DEEP);
        sh([16.3, 4.4, 26.6], [0, -0.8, -0.4], 1.8, 0.85, SHARD);
      } else {
        sh([23.4, 7.6, 28.4], [0.05, -0.9, -0.4], 12, 1.15, SHARD_PALE);
        // The scrap of the ship's cloth tied round it, streaming back.
        m.ring(23.6, 7.4, 28.4, 0.95, 0.26, 1.1, SCRAP, SOFT);
        m.tube([[23.8, 7, 28.8], [24.4, 4.4, 29.6], [24.8, 1.6, 29.6]], 0.28, 0.1, SCRAP, SOFT, 8);
      }
    }
    // Hips and legs trailing behind, apart, tapering to points.
    sh([20, 12, 23.2], [0, -0.1, -1], 3, 1.6, SHARD_DEEP);
    for (const sd of [-1, 1]) {
      sh([20 + sd * 1.6, 11.8, 20.6], [sd * 0.1, -0.3, -1], 5.4, 1.1, SHARD, sd);
      sh([20 + sd * 2, 10.2, 14.6], [sd * 0.05, -0.55, -1], 5, 0.95, SHARD_DEEP, sd);
      sh([20 + sd * 2.1, 7.6, 9.6], [0, -0.75, -1], 4.4, 0.75, SHARD, sd);
    }
    // The head, lifted to look ahead: a crown of sharp shards swept back round one burning slit of light.
    turned(m, [20, 12.4, 35], 'x', -0.55, () => {
      m.rbox(20, 13.1, 37, 1.1, 0.4, 0.25, CORE, GLOW, 2, 2, 12, 6);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.1 + 0.8 * (i / 6));
        sh([20 + Math.cos(a) * 1.4, 12.4, 36.4 + Math.sin(a) * 0.6], [Math.cos(a) * 0.6, -0.5, 1], 3.2 + (i === 3 ? 1.8 : 0), 0.6, i % 2 ? SHARD : SHARD_DEEP, i);
      }
      sh([20, 12.6, 35], [0, 0, -1], 1.6, 1.2, SHARD_DEEP);
    });
  });
  return new Float32Array(m.out);
}

/** A companion's figure, built once. */
const BUILT = new Map<CompanionId, Float32Array>();
export function companionModel(id: CompanionId): Float32Array {
  let b = BUILT.get(id);
  if (!b) BUILT.set(id, (b = id === 'lancer' ? lancerModel() : id === 'engineer' ? engineerModel() : defectorModel()));
  return b;
}

/**
 * Where each is (box units of the ship) and how it is set there:
 * - `rail`: sitting on the foredeck's near rail at `x`, its seat (`anchor`) on the rail's top;
 * - `dish`: crouched on the hull just fore of the sensor dish, at (`x`, `y`), its feet (`anchor`) on the hull's top;
 * - `air`: flying free alongside at (`x`, `y`, `z`), its `anchor` there, rising and falling on its own, not with the ship.
 * `turn` is which way it faces (radians about the vertical; 0 is toward the near side, where the camera is), `size`
 * its height against the Captain's 0.7.
 */
export type CompanionPlace = { on: 'rail' | 'dish' | 'air'; x: number; y: number; z: number; anchor: V3; turn: number; size: number };
export const COMPANION_PLACES: Record<CompanionId, CompanionPlace> = {
  lancer: { on: 'rail', x: 25.2, y: 0, z: 0, anchor: [20, 12, 19.2], turn: -0.4, size: 0.8 },
  engineer: { on: 'dish', x: 8.7, y: 13, z: 0, anchor: [20, 13, 0], turn: -1.25, size: 0.66 },
  defector: { on: 'air', x: 5, y: 19, z: -0.6, anchor: [20, 12, 24], turn: Math.PI / 2 - 0.25, size: 1 },
};
