/**
 * The little ships armies sail the campaign map in, one model per race, built in CSS 3D inside the map's
 * tilted plane: the hull is its top-down outline stacked in slices (so it has real thickness, darker down
 * its sides), and domes, spheres and spires are stacks of shrinking shapes. It is all static markup: no
 * script runs per frame, so the camera moving them costs no more than moving any other element.
 *
 * Models point along +x in a 40 x 24 box (the hull's viewBox), and turn as a whole with --rot.
 */

type Part = string;

/** A hull: its outline stacked in slices from the waterline up; the top slice carries the deck detail. */
function hull(path: string, deck: string, slices = 6, step = 1.1): Part {
  let out = '';
  for (let i = 0; i < slices; i++) {
    out += `<svg class="s-slice" viewBox="0 0 40 24" style="transform:translateZ(${(i * step).toFixed(1)}px)" aria-hidden="true"><path class="s-side" style="--k:${(i / slices).toFixed(2)}" d="${path}"/></svg>`;
  }
  out += `<svg class="s-slice" viewBox="0 0 40 24" style="transform:translateZ(${(slices * step).toFixed(1)}px)" aria-hidden="true"><path class="s-top" d="${path}"/>${deck}</svg>`;
  return out;
}

/**
 * A round body made of stacked discs: centred at (x, y) in the 40 x 24 box, radius r (box units), from height
 * z0 up; a full sphere, or (dome) only its upper half. Each disc is shaded a little lighter going up.
 */
function orb(x: number, y: number, r: number, z0: number, cls: string, opts: { dome?: boolean; rx?: number; slices?: number; h?: number } = {}): Part {
  const n = opts.slices ?? 8;
  const sx = (opts.rx ?? r) / r;
  let out = '';
  for (let i = 0; i <= n; i++) {
    // From the bottom (-1) or the equator (0) up to the top (1).
    const t = opts.dome ? i / n : -1 + (2 * i) / n;
    const rr = r * Math.sqrt(Math.max(0, 1 - t * t));
    if (rr < 0.4) continue;
    const z = z0 + (opts.dome ? t * r : (t + 1) * r) * 1.6 * (opts.h ?? 1);
    out += disc(x, y, rr * sx, rr, z, `${cls}`, i / n);
  }
  return out;
}

function disc(x: number, y: number, rx: number, ry: number, z: number, cls: string, k: number): string {
  return `<i class="s-disc ${cls}" style="left:${(((x - rx) / 40) * 100).toFixed(2)}%;top:${(((y - ry) / 24) * 100).toFixed(2)}%;width:${(((rx * 2) / 40) * 100).toFixed(2)}%;height:${(((ry * 2) / 24) * 100).toFixed(2)}%;transform:translateZ(${z.toFixed(1)}px);--k:${k.toFixed(2)}"></i>`;
}

/** A spire: stacked diamonds narrowing to a point. */
function spire(x: number, y: number, w: number, z0: number, height: number, cls: string, slices = 6): Part {
  let out = '';
  for (let i = 0; i < slices; i++) {
    const t = i / slices;
    const ww = w * (1 - t);
    out += `<i class="s-gem ${cls}" style="left:${(((x - ww / 2) / 40) * 100).toFixed(2)}%;top:${(((y - ww / 2) / 24) * 100).toFixed(2)}%;width:${((ww / 40) * 100).toFixed(2)}%;height:${((ww / 24) * 100).toFixed(2)}%;transform:translateZ(${(z0 + t * height).toFixed(1)}px) rotate(45deg);--k:${t.toFixed(2)}"></i>`;
  }
  return out;
}

/** The engine glow at the stern (brighter while sailing). */
const FLAME = `<i class="s-flame"></i>`;

const MODELS: (() => string)[] = [
  // Aureline: a sun-barque, a long golden leaf of a hull carrying a glowing sun-sphere amidships.
  () =>
    hull('M39 12C31 4.5 14 3.5 5 7l3 5-3 5c9 3.5 26 2.5 34-5z', '<path class="s-trim" d="M9 12h26"/>') +
    orb(21, 12, 4.6, 8, 's-sun'),
  // Xel'Naru: a crystal shard of a hull, a spire of crystal rising from it.
  () =>
    hull('M39 12 23 3.5 9 6.5 4 12l5 5.5 14 3z', '<path class="s-trim" d="M39 12 23 3.5 18 12l5 8.5M18 12H4"/>', 5) +
    spire(22, 12, 11, 5, 22, 's-crystal', 9),
  // Vorthane: a low raft trailing tentacles, under a great translucent bell.
  () =>
    `<svg class="s-slice" viewBox="0 0 40 24" style="transform:translateZ(1px)" aria-hidden="true"><path class="s-tails" d="M17 7c-5 0-6 2-11 1M16 10.5c-5 0-6 1.5-12 1M16 13.5c-5 0-6-1.5-12-1M17 17c-5 0-6-2-11-1"/></svg>` +
    hull('M17 5c11-1 20 2.5 21 7-1 4.5-10 8-21 7-1.5-4.5-1.5-9.5 0-14z', '', 3, 1) +
    orb(26, 12, 7.4, 3, 's-bell', { dome: true, rx: 9.5, slices: 8 }),
  // Ixquor: a seed pod on spined legs, its living cap swelling up from the bow.
  () =>
    `<svg class="s-slice" viewBox="0 0 40 24" style="transform:translateZ(0.5px)" aria-hidden="true"><path class="s-legs" d="M14 8 8 3M20 7l-3-5.5M14 16l-6 5M20 17l-3 5.5"/></svg>` +
    orb(21, 12, 7, 0.5, 's-pod', { rx: 15, slices: 8, h: 0.55 }) +
    orb(28, 12, 5, 9, 's-cap', { dome: true, slices: 5 }),
];

/** The Lost Races: a battered derelict, holed and listing, a broken mast stump on its deck. */
const DERELICT = () =>
  hull('M38 12 30 5 12 6 6 9l2 3-2 3 6 3 18 1z', '<path class="s-trim" d="M30 5l-3 7 3 7M12 6l4 6-4 6"/><circle class="s-hole" cx="21" cy="10" r="2"/>', 5) +
  spire(31, 12, 3, 5, 6, 's-mast', 3);

const cache = new Map<string, string>();

/** A ship for an army of this race (or a Lost Races derelict): a 3D model to sit in the map's plane. */
export function shipModel(race: number, lost: boolean): string {
  const key = lost ? 'lost' : String(race);
  let html = cache.get(key);
  if (!html) {
    html = `<div class="ship3d ship3d-${lost ? 'lost' : race}">${FLAME}${lost ? DERELICT() : (MODELS[race] ?? MODELS[0])()}</div>`;
    cache.set(key, html);
  }
  return html;
}
