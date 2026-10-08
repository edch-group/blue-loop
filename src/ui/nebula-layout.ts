/**
 * The campaign nebula's layout, worked out once per universe (seeded): see nebula3d.ts, which draws the gas
 * itself (raymarched through 3D noise). This only says where the gas gathers: a few broad clumps, behind and
 * below the strip, and the box round the strip that is kept clear of it.
 */

/** The strip of systems the gas is kept clear of: its systems and routes (world x, z, on the plane y = 0). */
export interface Strip {
  nodes: [number, number][];
  routes: [number, number, number, number][];
}

export interface Layout {
  /** Where the gas gathers: x, y, z and radius of each clump (CLUMPS of them). */
  clumps: Float32Array;
  /** Where in the noise this universe's gas is taken from (so each universe's nebula is its own). */
  offset: [number, number, number];
  /** The strip's extent across the plane (min x, max x, min z, max z), kept clear of gas near the plane. */
  strip: [number, number, number, number];
}

export const CLUMPS = 7;

export function nebulaLayout(seed: number, strip: Strip = { nodes: [], routes: [] }): Layout {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296;
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const clumps = new Float32Array(CLUMPS * 4);
  for (let i = 0; i < CLUMPS; i++) {
    // Spread out, not in a row (a row seen end on piles up, seen across it thins out). The strip itself stays clear
    // from where the camera starts; the gas comes between the eye and it only as the camera turns.
    const where = rnd();
    const x = -2.6 + ((i + range(0.1, 0.9)) / CLUMPS) * 5.2;
    // Behind the strip and above it; below it and toward the camera (filling the ground under it); or off its ends.
    const [y, z] = where < 0.4 ? [range(0.0, 0.8), range(-2.0, -0.95)] : where < 0.8 ? [range(-0.95, -0.5), range(0.3, 1.3)] : [range(-0.2, 0.5), range(-0.9, 0.3)];
    // (Off the strip's ends, the middle ones are pushed out past them.)
    const xx = where >= 0.8 ? Math.sign(x || 1) * Math.max(Math.abs(x), 2.7) : x;
    clumps.set([xx, y, z, range(0.6, 0.95)], i * 4);
  }
  const xs = strip.nodes.map((n) => n[0]), zs = strip.nodes.map((n) => n[1]);
  const pad = 0.2;
  return {
    clumps,
    offset: [range(0, 100), range(0, 100), range(0, 100)],
    strip: xs.length ? [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad] : [0, 0, 0, 0],
  };
}
