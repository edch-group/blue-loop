/**
 * The Captain's companions as the campaign menu's ship carries them (companions.ts) [direction: every character earnt
 * sits or stands on the ship somewhere in the campaign menu with the Captain], after their art: Kaelen, the Aureline
 * lancer, standing on the foredeck with his lance upright; Mara Venn, the engineer, kneeling at its hatch; Vey'Sharr,
 * the Xel'Naru defector, hanging in the air over the bridge, its shards apart round a core of light. Box units as the
 * Captain's (captain-model.ts): built facing +y, feet at z 0, about 40 tall.
 */
import type { CompanionId } from '../engine/companions';
import { cloth, turned } from './captain-model';
import { Mesh, type RGB, type V3 } from './ship3d';

// (Materials: 0 plated metal, 1 glass or crystal, 2 glowing, 3 living.)
const METAL = 0, GLASS = 1, GLOW = 2, SOFT = 3;

/** A limb: a tube through its points, tapering, a ball at each joint. */
function lim(m: Mesh, pts: V3[], r0: number, r1: number, col: RGB, mat: number) {
  m.tube(pts, r0, r1, col, mat, 16);
  for (let i = 1; i < pts.length - 1; i++) m.ball(pts[i][0], pts[i][1], pts[i][2], r0 + ((r1 - r0) * i) / (pts.length - 1), col, mat, 14, 8);
}

// ---- Kaelen, the Aureline lancer ----
const IVORY: RGB = [0.86, 0.84, 0.78];
const GOLD: RGB = [0.86, 0.66, 0.3];
const ALIEN: RGB = [0.66, 0.67, 0.7];
const ALIEN_SHADE: RGB = [0.55, 0.56, 0.6];
const CRIMSON: RGB = [0.5, 0.12, 0.12];
const CRIMSON_DARK: RGB = [0.36, 0.08, 0.09];
const LANCE_LIGHT: RGB = [1, 0.8, 0.38];
const EYE: RGB = [0.12, 0.16, 0.34];

function lancerModel(): Float32Array {
  const m = new Mesh();
  // Long legs in white plate, gold at the knee; armoured boots.
  for (const sd of [-1, 1]) {
    const x = 20 + sd * 1.5;
    lim(m, [[x, 12, 20], [x + sd * 0.2, 12.3, 11], [x + sd * 0.3, 12, 2.2]], 1.45, 1.15, IVORY, METAL);
    m.ball(x + sd * 0.2, 12.9, 11, 0.95, GOLD, METAL, 12, 8);
    m.rbox(x + sd * 0.3, 12.7, 1.1, 1.3, 2.4, 1.1, IVORY, METAL, 3, 3);
  }
  // A skirt of plates, a gold belt; the cuirass, gold banded; pauldrons.
  m.rbox(20, 12, 19.8, 3.4, 2.2, 2.6, IVORY, METAL, 2.4, 3);
  m.rbox(20, 12, 22.4, 3.2, 2.1, 0.6, GOLD, METAL, 2.6, 6);
  m.rbox(20, 12, 27.4, 3.4, 2.2, 4.6, IVORY, METAL, 2.4, 2.4);
  m.rbox(20, 12.3, 28.6, 2.2, 2, 2.6, IVORY, METAL, 2.2, 2.2);
  m.rbox(20, 14.2, 27.4, 0.4, 0.2, 3.2, GOLD, METAL, 3, 3);
  for (const sd of [-1, 1]) {
    m.ball(20 + sd * 3.6, 12, 31.2, 1.75, IVORY, METAL, 16, 10);
    m.rbox(20 + sd * 3.9, 12, 31.6, 1.7, 1.9, 0.5, GOLD, METAL, 3, 3);
  }
  // The right arm holds the lance upright at his side; the left hangs, its hand open.
  lim(m, [[23.6, 12, 31], [24.6, 13, 26], [24.8, 14.4, 22.4]], 1.05, 0.85, IVORY, METAL);
  m.ball(24.8, 14.6, 22.2, 0.85, ALIEN, SOFT, 12, 8);
  lim(m, [[16.4, 12, 31], [15.4, 12.2, 25.6], [15.6, 12.6, 20.6]], 1.05, 0.85, IVORY, METAL);
  m.ball(15.6, 12.7, 20.2, 0.8, ALIEN, SOFT, 12, 8);
  // The lance: a long white shaft, gold-collared, its leaf-shaped blade of light.
  m.cyl([24.8, 14.6, 3], [24.8, 14.6, 46], 0.28, 0.24, IVORY, METAL, 10);
  for (const z of [21, 24, 45.6]) m.cyl([24.8, 14.6, z - 0.4], [24.8, 14.6, z + 0.4], 0.42, 0.42, GOLD, METAL, 10);
  m.shard([24.8, 14.6, 45.8], [0, 0, 1], 6.5, 0.95, LANCE_LIGHT, GLOW);
  // A slim grey neck; the head long and smooth, tilted back a little, one great eye; the halo round it.
  m.cyl([20, 12.1, 32.2], [20, 12.3, 34.6], 0.75, 0.7, ALIEN, SOFT, 12);
  turned(m, [20, 12.3, 35], 'x', 0.18, () => {
    m.rbox(20, 12.3, 37.6, 1.7, 1.9, 3.1, ALIEN, SOFT, 2, 2, 28, 18);
    m.rbox(20, 12.9, 35.4, 1.1, 1.3, 1.2, ALIEN_SHADE, SOFT, 2, 2, 16, 10);
    m.ball(20, 14.05, 37.2, 0.78, EYE, GLASS, 16, 10);
    m.ball(20, 14.5, 37.3, 0.22, [0.85, 0.9, 1], GLOW, 8, 5);
  });
  m.ring(20, 12.1, 41.2, 2.6, 0.17, 0, GOLD, GLOW);
  // The cape, crimson, falling from his shoulders behind him and blown back a little.
  const grid: V3[][] = [];
  for (let r = 0; r <= 8; r++) {
    const row: V3[] = [];
    for (let c = 0; c <= 8; c++) {
      const t = r / 8, a = Math.PI * (0.12 + 0.76 * (c / 8));
      row.push([20 - Math.cos(a) * (3.8 + t * 1.2), 11.4 - Math.sin(a) * (1.8 + t * 0.8) - t * t * 4, 31.4 - t * 27 + t * t * 4]);
    }
    grid.push(row);
  }
  cloth(m, grid, CRIMSON, CRIMSON_DARK);
  return new Float32Array(m.out);
}

// ---- Mara Venn, the engineer ----
const WORK_COAT: RGB = [0.3, 0.27, 0.24];
const WORK_SHADE: RGB = [0.24, 0.22, 0.2];
const OVERALL: RGB = [0.26, 0.27, 0.3];
const HUMAN: RGB = [0.8, 0.62, 0.52];
const GREY_HAIR: RGB = [0.52, 0.5, 0.48];
const GOGGLE: RGB = [0.18, 0.26, 0.3];
const BRASS: RGB = [0.72, 0.56, 0.32];
const AMBER: RGB = [1, 0.62, 0.22];
const STEEL: RGB = [0.6, 0.62, 0.66];
const BOOTS: RGB = [0.28, 0.22, 0.18];

function engineerModel(): Float32Array {
  const m = new Mesh();
  // Kneeling: the left knee up, its foot planted; the right knee on the deck, the shin laid back along it.
  lim(m, [[18.4, 11.6, 13.4], [18.2, 16, 13], [18.2, 16.6, 2.4]], 1.55, 1.2, OVERALL, SOFT);
  m.rbox(18.2, 17.4, 1.1, 1.3, 2.4, 1.1, BOOTS, SOFT, 3, 3);
  lim(m, [[21.6, 11.8, 13.4], [21.8, 13.2, 1.4], [21.8, 8, 1.2]], 1.55, 1.2, OVERALL, SOFT);
  m.rbox(21.8, 7.2, 1.2, 1.2, 1.4, 1.1, BOOTS, SOFT, 3, 3);
  // Leaning in over the hatch: hips, a tool belt, the work coat over her back, a harness of tools.
  turned(m, [20, 12, 13.6], 'x', 0.32, () => {
    m.rbox(20, 12, 14.4, 3.4, 2.2, 2.1, OVERALL, SOFT, 2.4, 2.4);
    m.rbox(20, 12, 16.2, 3.5, 2.35, 0.7, BOOTS, SOFT, 2.6, 6);
    for (const sd of [-1, 1]) m.rbox(20 + sd * 2.6, 13.9, 15.8, 0.8, 0.6, 1.1, BRASS, METAL, 3, 3);
    m.rbox(20, 12, 20.4, 3.6, 2.3, 4, WORK_COAT, SOFT, 2.4, 2.6);
    m.rbox(20, 12.4, 24.6, 3, 1.9, 1.4, WORK_COAT, SOFT, 2.2, 3);
    for (const sd of [-1, 1]) m.ball(20 + sd * 3.6, 12, 23.6, 1.6, WORK_COAT, SOFT, 14, 9);
    // Her head, bowed toward her work: grey hair cropped short, goggles pushed up on her brow.
    m.cyl([20, 12.4, 25.4], [20, 12.8, 27.2], 0.85, 0.8, HUMAN, SOFT, 12);
    m.rbox(20, 13, 29.2, 1.8, 2, 2.3, HUMAN, SOFT, 2, 2, 28, 16);
    m.rbox(20, 12.6, 30.4, 1.9, 2.05, 1.3, GREY_HAIR, SOFT, 2, 2, 24, 12);
    m.rbox(20, 11.9, 29, 1.7, 1.2, 1.9, GREY_HAIR, SOFT, 2, 2, 20, 10);
    for (const sd of [-1, 1]) {
      m.ball(20 + sd * 0.8, 14.7, 30.4, 0.55, GOGGLE, GLASS, 12, 8);
      m.ring(20 + sd * 0.8, 14.9, 30.4, 0.58, 0.1, Math.PI / 2, BRASS, METAL);
      m.rbox(20 + sd * 0.7, 14.75, 28.9, 0.22, 0.1, 0.12, [0.1, 0.09, 0.1], 0, 2, 2, 10, 6);
    }
    m.rbox(20, 13.3, 30.3, 2, 2.05, 0.18, BOOTS, SOFT, 2, 3, 24, 6);
    // The right arm reaching down into the hatch, a wrench in its hand; the left forearm on her knee, the shield
    // emitter strapped to it glowing.
    lim(m, [[23.6, 12, 23.4], [24.4, 15.4, 19.4], [22.8, 18.6, 15]], 1.05, 0.9, WORK_SHADE, SOFT);
    m.ball(22.8, 19, 14.6, 0.85, HUMAN, SOFT, 12, 8);
    lim(m, [[16.4, 12, 23.4], [15.6, 14.6, 18.6], [17.4, 16.6, 14.8]], 1.05, 0.9, WORK_SHADE, SOFT);
    m.rbox(16.6, 15.8, 16.4, 0.85, 0.85, 1.1, AMBER, GLOW, 3, 3);
    m.ball(17.6, 17, 14.4, 0.8, HUMAN, SOFT, 12, 8);
  });
  m.cyl([22.9, 18.4, 11.6], [23.1, 21.4, 6], 0.28, 0.28, STEEL, METAL, 8);
  m.rbox(23.1, 21.6, 5.6, 0.9, 0.35, 0.6, STEEL, METAL, 3, 3);
  return new Float32Array(m.out);
}

// ---- Vey'Sharr, the Xel'Naru defector ----
const SHARD: RGB = [0.62, 0.48, 0.86];
const SHARD_DEEP: RGB = [0.44, 0.32, 0.7];
const CORE: RGB = [0.94, 0.9, 1];
const SCRAP: RGB = [0.27, 0.28, 0.33];

function defectorModel(): Float32Array {
  const m = new Mesh();
  const sh = (base: V3, dir: V3, l: number, r: number, col: RGB = SHARD, roll = 0) => m.shard(base, dir, l, r, col, GLASS, roll);
  // The core of light in its chest.
  m.ball(20, 12.4, 28, 1.6, CORE, GLOW, 16, 10);
  // The chest: ribs of shards curving out and down from the core on either side, a gap between each; a breastbone
  // shard over it; shoulders of broad shards.
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 3; i++) sh([20 + sd * 1.5, 12.6, 30 - i * 1.9], [sd, 0.25, -0.15 - i * 0.25], 3.2 - i * 0.4, 0.8, i % 2 ? SHARD_DEEP : SHARD, i);
    sh([20 + sd * 2.2, 12, 32.6], [sd, 0, 0.35], 3, 1.2, SHARD, sd);
  }
  sh([20, 13.2, 31.6], [0, 0.2, 1], 2.4, 0.7, SHARD_DEEP);
  sh([20, 13, 26.4], [0, 0.15, -1], 2.4, 0.9, SHARD);
  // The hips and legs: shards hanging one below another, apart, tapering to points (it floats).
  sh([20, 12, 23.2], [0, 0, -1], 3, 1.6, SHARD_DEEP);
  for (const sd of [-1, 1]) {
    sh([20 + sd * 1.6, 12, 20.6], [sd * 0.08, 0, -1], 5.4, 1.1, SHARD, sd);
    sh([20 + sd * 1.9, 12.2, 14.4], [sd * 0.05, 0.1, -1], 5.2, 0.95, SHARD_DEEP, sd);
    sh([20 + sd * 2, 12.6, 8.4], [0, 0.15, -1], 4.6, 0.75, SHARD, sd);
  }
  // The left arm: three shards down, a fist of small ones; the right made a long blade, held out and down.
  sh([16, 12, 30.6], [-0.3, 0, -1], 4.6, 0.85, SHARD);
  sh([14.9, 12.2, 25.2], [-0.05, 0.2, -1], 4.2, 0.75, SHARD_DEEP);
  sh([14.7, 12.8, 20.4], [0, 0.3, -1], 2, 0.9, SHARD);
  sh([24, 12, 30.6], [0.35, 0.2, -1], 4.4, 0.85, SHARD);
  sh([25.6, 13, 25.6], [0.3, 0.55, -0.8], 13, 1.15, [0.72, 0.6, 0.94]);
  // A scrap of the ship's cloth tied round that arm.
  m.ring(24.9, 12.4, 28.2, 1.05, 0.28, 0.3, SCRAP, SOFT);
  m.tube([[24.6, 11.4, 28.4], [24.2, 9.6, 27.4], [23.4, 8.4, 26]], 0.3, 0.12, SCRAP, SOFT, 8);
  // The head: a crown of sharp shards round one burning slit of light.
  m.rbox(20, 12.6, 37, 1.1, 0.4, 0.25, CORE, GLOW, 2, 2, 12, 6);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.1 + 0.8 * (i / 6));
    sh([20 + Math.cos(a) * 1.4, 12, 36.4 + Math.sin(a) * 0.6], [Math.cos(a) * 0.6, -0.1, 1], 3.2 + (i === 3 ? 1.6 : 0), 0.6, i % 2 ? SHARD : SHARD_DEEP, i);
  }
  sh([20, 12.2, 35], [0, 0, -1], 1.6, 1.2, SHARD_DEEP);
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
 * Where each stands on the ship (box units: on the foredeck, or over the bridge, `bridge` true), which way it faces
 * (radians about the vertical: the Captain's own is 1.3, facing ahead) and its height against the Captain's.
 */
export const COMPANION_PLACES: Record<CompanionId, { x: number; y: number; bridge?: boolean; turn: number; size: number }> = {
  lancer: { x: 26.4, y: 14.8, turn: 1.2, size: 0.76 },
  engineer: { x: 23.2, y: 8.6, turn: 0.15, size: 0.68 },
  defector: { x: 17.6, y: 12, bridge: true, turn: 1.0, size: 0.74 },
};
