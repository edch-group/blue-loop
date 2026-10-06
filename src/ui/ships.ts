/**
 * The little ships armies sail the campaign map in, one model per race, built in CSS 3D inside the map's
 * tilted plane: the hull is its top-down outline stacked in slices (so it has real thickness, darker down
 * its sides), and domes, spheres and spires are stacks of shrinking shapes. It is all static markup: no
 * script runs per frame, so the camera moving them costs no more than moving any other element.
 *
 * Models point along +x in a 40 x 24 box (the hull's viewBox), and turn as a whole with --rot.
 */

type Part = string;

/** The metal everything is made of: a lit deck (light down the spine, darker to the edges), shaded sides. */
const DEFS = `<defs>
  <linearGradient id="sg-deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d869b"/><stop offset="0.42" stop-color="#e9edf4"/><stop offset="0.6" stop-color="#c9d0dc"/><stop offset="1" stop-color="#5f687d"/></linearGradient>
  <linearGradient id="sg-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b88a3a"/><stop offset="0.45" stop-color="#fff2cf"/><stop offset="0.62" stop-color="#e8c47a"/><stop offset="1" stop-color="#8d6526"/></linearGradient>
  <linearGradient id="sg-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3c7e"/><stop offset="0.45" stop-color="#d9cff5"/><stop offset="0.55" stop-color="#9a87d0"/><stop offset="1" stop-color="#2f2558"/></linearGradient>
  <linearGradient id="sg-reef" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f5d66"/><stop offset="0.5" stop-color="#7fc2bf"/><stop offset="1" stop-color="#244b55"/></linearGradient>
  <linearGradient id="sg-void" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0a18"/><stop offset="0.45" stop-color="#4a4080"/><stop offset="0.58" stop-color="#2a2450"/><stop offset="1" stop-color="#07060f"/></linearGradient>
  <linearGradient id="sg-iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a42"/><stop offset="0.45" stop-color="#a4a8b2"/><stop offset="0.6" stop-color="#7a7e88"/><stop offset="1" stop-color="#2a2a30"/></linearGradient>
  <linearGradient id="sg-bronze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a3e14"/><stop offset="0.45" stop-color="#f0c080"/><stop offset="0.62" stop-color="#c9893a"/><stop offset="1" stop-color="#5a3412"/></linearGradient>
  <linearGradient id="sg-pearl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a9ac8"/><stop offset="0.42" stop-color="#ffffff"/><stop offset="0.6" stop-color="#dfe6fa"/><stop offset="1" stop-color="#6a7aa8"/></linearGradient>
  <linearGradient id="sg-ember" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a1a0a"/><stop offset="0.4" stop-color="#ffd060"/><stop offset="0.6" stop-color="#ff7a1e"/><stop offset="1" stop-color="#7a1206"/></linearGradient>
  <linearGradient id="sg-rust" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b5560"/><stop offset="0.5" stop-color="#a8a2a8"/><stop offset="1" stop-color="#4a4450"/></linearGradient>
</defs>`;

/**
 * A hull: its outline stacked in slices from the keel up, narrower towards the keel (so its sides curve under
 * like a real hull's), shaded darker going down; the top slice is the deck, filled with `deck` (a gradient)
 * and carrying the deck's detail.
 */
function hull(path: string, detail: string, o: { slices?: number; step?: number; z0?: number; deck?: string; side?: string; taper?: number; sideFill?: string } = {}): Part {
  const n = o.slices ?? 10;
  const step = o.step ?? 0.62;
  const z0 = o.z0 ?? 0;
  const taper = o.taper ?? 0.22;
  let out = '';
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const sc = 1 - taper * (1 - Math.sin((t * Math.PI) / 2));
    out += `<svg class="s-slice" viewBox="0 0 40 24" preserveAspectRatio="none" style="transform:translateZ(calc(var(--zu, 1px) * ${(z0 + i * step).toFixed(1)})) scale(${sc.toFixed(3)})" aria-hidden="true"><path class="${o.side ?? 's-side'}" style="--k:${t.toFixed(2)}${o.sideFill ? `;fill:color-mix(in srgb, ${o.sideFill} calc(35% + var(--k) * 55%), #0a0810)` : ''}" d="${path}"/></svg>`;
  }
  out += `<svg class="s-slice" viewBox="0 0 40 24" preserveAspectRatio="none" style="transform:translateZ(calc(var(--zu, 1px) * ${(z0 + n * step).toFixed(1)}))" aria-hidden="true">${DEFS}<path class="s-deck" fill="url(#${o.deck ?? 'sg-deck'})" d="${path}"/>${detail}</svg>`;
  return out;
}

/** A raised block on the deck (a bridge, an engine pod): its outline stacked straight up, its top lit. */
function block(path: string, z0: number, height: number, top = 'sg-deck', detail = ''): Part {
  return hull(path, detail, { slices: Math.max(2, Math.round(height / 0.8)), step: height / Math.max(2, Math.round(height / 0.8)), z0, deck: top, taper: 0, side: 's-side s-side-block' });
}

/**
 * A round body made of stacked discs: centred at (x, y) in the 40 x 24 box, radius r (box units), from height
 * z0 up; a full sphere, or (dome) only its upper half. Each disc is shaded a little lighter going up.
 */
function orb(x: number, y: number, r: number, z0: number, cls: string, opts: { dome?: boolean; rx?: number; slices?: number; h?: number; bg?: string } = {}): Part {
  const n = opts.slices ?? 8;
  const sx = (opts.rx ?? r) / r;
  let out = '';
  for (let i = 0; i <= n; i++) {
    // From the bottom (-1) or the equator (0) up to the top (1).
    const t = opts.dome ? i / n : -1 + (2 * i) / n;
    const rr = r * Math.sqrt(Math.max(0, 1 - t * t));
    if (rr < 0.4) continue;
    const z = z0 + (opts.dome ? t * r : (t + 1) * r) * 1.6 * (opts.h ?? 1);
    out += disc(x, y, rr * sx, rr, z, `${cls}`, i / n, opts.bg);
  }
  return out;
}

function disc(x: number, y: number, rx: number, ry: number, z: number, cls: string, k: number, bg?: string): string {
  return `<i class="s-disc ${cls}" style="left:${(((x - rx) / 40) * 100).toFixed(2)}%;top:${(((y - ry) / 24) * 100).toFixed(2)}%;width:${(((rx * 2) / 40) * 100).toFixed(2)}%;height:${(((ry * 2) / 24) * 100).toFixed(2)}%;transform:translateZ(calc(var(--zu, 1px) * ${z.toFixed(1)}));--k:${k.toFixed(2)}${bg ? `;background:${bg}` : ''}"></i>`;
}

/** A spire: stacked diamonds narrowing to a point. */
function spire(x: number, y: number, w: number, z0: number, height: number, cls: string, slices = 6, bg?: string): Part {
  let out = '';
  for (let i = 0; i < slices; i++) {
    const t = i / slices;
    const ww = w * (1 - t);
    out += `<i class="s-gem ${cls}" style="left:${(((x - ww / 2) / 40) * 100).toFixed(2)}%;top:${(((y - ww / 2) / 24) * 100).toFixed(2)}%;width:${((ww / 40) * 100).toFixed(2)}%;height:${((ww / 24) * 100).toFixed(2)}%;transform:translateZ(calc(var(--zu, 1px) * ${(z0 + t * height).toFixed(1)})) rotate(45deg);--k:${t.toFixed(2)}${bg ? `;background:${bg}` : ''}"></i>`;
  }
  return out;
}

/** An engine's exhaust: a glowing disc standing upright at the stern (x), facing backwards, at height z. */
function exhaust(x: number, y: number, r: number, z: number): Part {
  return `<i class="s-exhaust" style="left:${(((x - r) / 40) * 100).toFixed(2)}%;top:${(((y - r) / 24) * 100).toFixed(2)}%;width:${(((r * 2) / 40) * 100).toFixed(2)}%;height:${(((r * 2) / 24) * 100).toFixed(2)}%;transform:translateZ(calc(var(--zu, 1px) * ${z.toFixed(1)})) rotateY(90deg)"></i>`;
}

/** Lit windows: a row of small bright dots on a deck. */
const windows = (pts: [number, number][]) => pts.map(([x, y]) => `<circle class="s-win" cx="${x}" cy="${y}" r="0.42"/>`).join('');

/** The engine glow at the stern (brighter while sailing). */
const FLAME = `<i class="s-flame"></i>`;

const AUR_HULL = 'M39.5 12C34 7.6 23 6.2 13 6.6L5 8.4 2.5 10.2v3.6L5 15.6l8 1.8c10 .4 21-1 26.5-5.4z';
const XEL_HULL = 'M39.5 12 29 5.2 13 6.2 5 9.2 3 12l2 2.8 8 3 16 1z';
const MODELS: (() => string)[] = [
  // Aureline: a sun-barque, a long sleek hull of white metal with golden trim, carrying its sun amidships
  // between two pylons, a bridge forward and twin engines astern.
  () =>
    hull(AUR_HULL, `<path class="s-trim" d="M6 12h31"/><path class="s-panel" d="M13 6.9v10.2M22 6.5v11M30 7.6v8.8M6 9.4l7-1.6M6 14.6l7 1.6"/>${windows([[33, 11.2], [34.4, 11.2], [33, 12.8], [34.4, 12.8]])}`, { slices: 10 }) +
    block('M32 12c-.6-1.6-2.6-2.4-5-2.2l-1 2.2 1 2.2c2.4.2 4.4-.6 5-2.2z', 6.8, 2.4, 'sg-deck', windows([[30.4, 12], [29.2, 11.2], [29.2, 12.8]])) +
    block('M7 8.2h6.5l.8 1.4H7.4zM7 15.8h6.5l.8-1.4H7.4z', 6.8, 2.2, 'sg-gold') +
    block('M16.2 8.6h1.2v1.6h-1.2zM16.2 13.8h1.2v1.6h-1.2z', 6.8, 4, 'sg-gold') +
    orb(16.8, 12, 3.4, 9.1, 's-sun', { slices: 9 }) +
    exhaust(7, 8.9, 0.9, 7.9) +
    exhaust(7, 15.1, 0.9, 7.9),
  // Xel'Naru: a shard of dark crystal, faceted, with a tall crystal spire rising from it and two lesser ones.
  () =>
    hull(XEL_HULL, '<path class="s-facet" d="M39.5 12 29 5.2 21 12l8 6.8M21 12H3M13 6.2 21 12l-8 5.8M5 9.2 13 12l-8 2.8"/>', { slices: 9, step: 0.6, deck: 'sg-glass', side: 's-side s-side-crystal', taper: 0.3 }) +
    spire(21, 12, 9, 5.6, 22, 's-crystal', 18) +
    spire(13.5, 8.6, 3.6, 5.4, 7, 's-crystal', 8) +
    spire(13.5, 15.4, 3.6, 5.4, 7, 's-crystal', 8) +
    exhaust(4, 12, 1.4, 3.6),
  // Vorthane: a low living raft trailing tentacles, under a great glassy bell.
  () =>
    `<svg class="s-slice" viewBox="0 0 40 24" preserveAspectRatio="none" style="transform:translateZ(calc(var(--zu, 1px) * 1))" aria-hidden="true"><path class="s-tails" d="M17 7c-5 0-6 2-11 1M16 10.5c-5 0-6 1.5-12 1M16 13.5c-5 0-6-1.5-12-1M17 17c-5 0-6-2-11-1"/></svg>` +
    hull('M17 5c11-1 20 2.5 21 7-1 4.5-10 8-21 7-1.5-4.5-1.5-9.5 0-14z', '<path class="s-glow" d="M20 8.5v7M24 7.6v8.8M28 7.4v9.2M32 8v8"/>', { slices: 6, step: 0.6, deck: 'sg-reef', side: 's-side s-side-reef', taper: 0.3 }) +
    orb(26, 12, 7.4, 3.6, 's-bell', { dome: true, rx: 9.5, slices: 9 }) +
    disc(26, 12, 4, 3, 5, 's-core', 0.5),
  // Ixquor: a chitin seed pod on spined legs, plated, its living cap swelling up from the bow.
  () =>
    `<svg class="s-slice" viewBox="0 0 40 24" preserveAspectRatio="none" style="transform:translateZ(calc(var(--zu, 1px) * 0.5))" aria-hidden="true"><path class="s-legs" d="M14 8 8 3M20 7l-3-5.5M14 16l-6 5M20 17l-3 5.5"/></svg>` +
    orb(21, 12, 7, 0.5, 's-pod', { rx: 15, slices: 9, h: 0.55 }) +
    `<svg class="s-slice" viewBox="0 0 40 24" preserveAspectRatio="none" style="transform:translateZ(calc(var(--zu, 1px) * 8.4))" aria-hidden="true"><path class="s-plates" d="M11 8.5c1.5 2 1.5 5 0 7M15 6.8c2 3 2 7.4 0 10.4M19.5 6.2c2 3.4 2 8.2 0 11.6"/></svg>` +
    orb(28, 12, 5, 8, 's-cap', { dome: true, slices: 6 }),
  // Nyxari: a low black blade of a ship, swept crescent wings either side of a hooded dome with one violet eye.
  () =>
    `<svg class="s-slice" viewBox="0 0 40 24" preserveAspectRatio="none" style="transform:translateZ(calc(var(--zu, 1px) * 0.6))" aria-hidden="true"><path d="M8 3c-3 1-5 .6-7 1.6M8 21c-3-1-5-.6-7-1.6M14 12H2" fill="none" stroke="#9d8cff" stroke-width="0.7" stroke-linecap="round" stroke-opacity="0.5"/></svg>` +
    hull('M39 12C30 9.4 22 5.4 7 1.5c6 4.4 8.6 7.4 8.6 10.5S13 18.1 7 22.5C22 18.6 30 14.6 39 12z', '<path class="s-facet" d="M39 12H16M30 9.6 15.6 12 30 14.4M22 6.4 15.6 12 22 17.6"/><path d="M8.5 2.6c5 3.6 7.6 6.4 7.6 9.4s-2.6 5.8-7.6 9.4" fill="none" stroke="#b8a8ff" stroke-width="0.5"/>', { slices: 5, step: 0.55, deck: 'sg-void', sideFill: '#3a3270', taper: 0.35 }) +
    orb(22, 12, 3.8, 3.2, 's-dome', { dome: true, rx: 5.6, slices: 6, bg: 'radial-gradient(circle at 40% 35%, #6a5ca8, #1d1838 65%, #07060f)' }) +
    disc(25.4, 12, 1.1, 0.8, 7.2, 's-eye', 0.5, 'radial-gradient(circle, #fff, #c8b8ff 40%, rgba(157, 140, 255, 0) 75%)') +
    exhaust(15, 12, 1.1, 3.4),
  // Korrath: a squat armoured forge-barge of dark iron banded in bronze, a ram at the bow, smokestacks and a
  // furnace glowing amidships, two great engines astern.
  () =>
    hull('M38.5 12 35 6.4 26 5 9 5.4 3.5 7.6v8.8L9 18.6l17 .4 9-1.4z', '<path d="M9 5.6v12.8M18 5.2v13.6M26 5.2v13.6" fill="none" stroke="#c9893a" stroke-width="0.8"/><path class="s-panel" d="M4 12h31M35 6.4 38.5 12 35 17.6"/>' + windows([[30, 9], [31.6, 9], [30, 15], [31.6, 15]]), { slices: 10, step: 0.6, deck: 'sg-iron', sideFill: '#6a6460', taper: 0.12 }) +
    block('M35 8.6 38.4 12 35 15.4 33 15.4V8.6z', 6.4, 1.6, 'sg-bronze') +
    block('M24 9h5v6h-5z', 6.4, 2.6, 'sg-iron', windows([[28, 10.6], [28, 13.4]])) +
    orb(19, 12, 2.6, 6.4, 's-furnace', { dome: true, slices: 4, bg: 'radial-gradient(circle at 45% 40%, #fff3c4, #ffa040 45%, #c8401a 75%, #5a1a08)' }) +
    block('M12 7.4h2.4v2.4H12zM12 14.2h2.4v2.4H12z', 6.4, 6, 'sg-bronze') +
    disc(13.2, 8.6, 1, 1, 12.8, 's-smoke', 0.5, 'radial-gradient(circle, rgba(200, 190, 180, 0.7), rgba(120, 110, 100, 0) 70%)') +
    disc(13.2, 15.4, 1, 1, 12.8, 's-smoke', 0.5, 'radial-gradient(circle, rgba(200, 190, 180, 0.7), rgba(120, 110, 100, 0) 70%)') +
    exhaust(3.6, 9, 1.4, 3.8) +
    exhaust(3.6, 15, 1.4, 3.8),
  // Seren: a slender pale star-skiff under a crescent sail, an orrery turning above its deck, two moons on its rings.
  () =>
    hull('M39.5 12C33 9.4 22 8.4 10 9.2L4 11v2l6 1.8c12 .8 23-.2 29.5-2.8z', '<path d="M8 12h30" fill="none" stroke="#a9c4ff" stroke-width="0.5"/>' + windows([[33, 12], [30, 12], [27, 12]]), { slices: 6, step: 0.6, deck: 'sg-pearl', sideFill: '#8a9ac8', taper: 0.3 }) +
    `<svg class="s-slice" viewBox="0 0 40 24" preserveAspectRatio="none" style="transform:translateZ(calc(var(--zu, 1px) * 9))" aria-hidden="true"><path d="M15 4.6a7.4 7.4 0 1 0 0 14.8 5.6 5.6 0 0 1 0-14.8z" fill="#e8eeff" fill-opacity="0.85" stroke="#fff" stroke-width="0.3"/></svg>` +
    block('M12.4 11.4h1.2v1.2h-1.2z', 3.7, 5.4, 'sg-pearl') +
    orb(21, 12, 2, 6.4, 's-star', { slices: 6, bg: 'radial-gradient(circle at 40% 35%, #fff, #e8f0ff 45%, #a9c4ff)' }) +
    disc(21, 12, 6.5, 2.4, 8, 's-ring', 0.5, 'transparent;border:0.35px solid rgba(232, 240, 255, 0.9);box-sizing:border-box') +
    disc(21, 12, 4.6, 4.6, 8.8, 's-ring', 0.5, 'transparent;border:0.3px solid rgba(255, 217, 138, 0.9);box-sizing:border-box') +
    orb(27.2, 13.2, 0.9, 7.2, 's-moon', { slices: 3, bg: 'radial-gradient(circle at 40% 35%, #fff, #8a9ad0)' }) +
    orb(17.6, 8.6, 0.7, 8, 's-moon', { slices: 3, bg: 'radial-gradient(circle at 40% 35%, #fff, #8a9ad0)' }) +
    exhaust(4, 12, 1.1, 2.4),
  // Pyrr: a living flare, a hull like a flame laid on its side, its tongues streaming astern round a white-hot heart.
  () =>
    `<svg class="s-slice" viewBox="0 0 40 24" preserveAspectRatio="none" style="transform:translateZ(calc(var(--zu, 1px) * 0.8))" aria-hidden="true"><path d="M12 7C8 5 5 7 1 4.5M10 12c-4-1-6 1-9 0M12 17c-4 2-7 0-11 2.5" fill="none" stroke="#ff7a1e" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.8"/><path d="M12 7C8 5 5 7 1 4.5M10 12c-4-1-6 1-9 0M12 17c-4 2-7 0-11 2.5" fill="none" stroke="#ffe27a" stroke-width="0.5" stroke-linecap="round"/></svg>` +
    hull('M39 12C36.4 7.4 29 5.2 21 6.6 16 4.2 12 5 7 2.6c3 3.4 3.8 5.4-2 6.8 4 1.4 4 3.8 0 5.2 5.8 1.4 5 3.4 2 6.8 5-2.4 9-1.6 14-4 8 1.4 15.4-.8 18-5.4z', '<path d="M38 12C30 10.6 22 9 14 6M38 12c-8 1.4-16 3-24 6M38 12H9" fill="none" stroke="#fff3c4" stroke-width="0.45" stroke-opacity="0.8"/>', { slices: 6, step: 0.6, deck: 'sg-ember', sideFill: '#c8401a', taper: 0.3 }) +
    orb(24, 12, 3.2, 3.4, 's-heart', { slices: 7, bg: 'radial-gradient(circle at 42% 38%, #ffffff, #fff0a0 30%, #ff9a2a 60%, #e8301a)' }) +
    spire(16, 12, 3.2, 3.8, 6, 's-tongue', 5, 'linear-gradient(135deg, #fff3c4, #ff7a1e 60%, #c8201a)') +
    spire(12, 8.6, 2, 3.8, 3.6, 's-tongue', 4, 'linear-gradient(135deg, #fff3c4, #ff7a1e 60%, #c8201a)') +
    spire(12, 15.4, 2, 3.8, 3.6, 's-tongue', 4, 'linear-gradient(135deg, #fff3c4, #ff7a1e 60%, #c8201a)') +
    exhaust(6, 12, 1.6, 3),
];

/** The Lost Races: a battered derelict, holed and listing, a broken mast stump on its deck. */
const DERELICT = () =>
  hull('M38 12 30 5 12 6 6 9l2 3-2 3 6 3 18 1z', '<path class="s-panel" d="M30 5l-3 7 3 7M12 6l4 6-4 6M20 5.6v12.8"/><circle class="s-hole" cx="21" cy="10" r="2"/><circle class="s-hole" cx="15" cy="14.5" r="1.1"/>', { slices: 8, step: 0.6, deck: 'sg-rust', taper: 0.25 }) +
  block('M27 10h3v4h-3z', 4.5, 2, 'sg-rust') +
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

/**
 * Campaign battles: where each race's ship has its rooms, in the model's own units (40 long, 24 across; the
 * bow at +x), so every room sits inside the hull. `sy` stretches the model across (seen side on, a slim hull
 * needs more height for its rooms); `cols` are the room columns, stern to bow, each one room or two (one
 * above the other); `sun` is where a ship that carries its sun has it (null: it burns behind the ship); `cmd`
 * the command room, at the bow (null: a station, with no hero).
 */
export interface ShipLayout {
  sy: number;
  cols: [x: number, rows: 1 | 2][];
  sun: number | null;
  cmd: number | null;
}
export const SHIP_LAYOUTS: ShipLayout[] = [
  { sy: 1.4, cols: [[14.6, 2], [19.6, 1], [24.6, 2]], sun: 7.4, cmd: 30.6 }, // Aureline: its sun carried astern
  { sy: 1.4, cols: [[10.6, 2], [15.6, 1], [20.6, 2]], sun: null, cmd: 26.6 }, // Xel'Naru
  { sy: 1.12, cols: [[20, 2], [25, 1], [30, 2]], sun: null, cmd: 35 }, // Vorthane
  { sy: 1.18, cols: [[13.5, 2], [18.5, 1], [23.5, 2]], sun: null, cmd: 29.5 }, // Ixquor
  { sy: 2.1, cols: [[19.4, 2], [24, 1], [28.6, 2]], sun: null, cmd: 33.4 }, // Nyxari
  { sy: 1.05, cols: [[9.6, 2], [25, 1], [30, 2]], sun: 17.4, cmd: 35 }, // Korrath: the sun in the furnace
  { sy: 2.5, cols: [[16, 2], [21, 1], [26, 2]], sun: null, cmd: 31.6 }, // Seren
  { sy: 1.12, cols: [[10.6, 2], [15.6, 1], [29.6, 2]], sun: 22.6, cmd: 35 }, // Pyrr: the sun its white-hot heart
];
/** A station (no hero): the derelict's hull, rooms amidships. */
export const STATION_LAYOUT: ShipLayout = { sy: 1.15, cols: [[14, 2], [19, 1], [24, 2]], sun: null, cmd: null };
