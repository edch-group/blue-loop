/**
 * The four alien races, and the vast figure of the player's own race that
 * looms over the battle board. Deliberately not humanoid:
 *
 *   0 Aureline  — a being of tilted plasma halos around one unblinking eye,
 *                 its ribbon arms trailing down around the board.
 *   1 Xel'Naru  — a choir of floating crystal shards around a core of light.
 *   2 Vorthane  — a drifting bell of a creature, rimmed with glowing eyes,
 *                 its tentacles draped over the board's edges.
 *   3 Ixquor    — a branching fungal hive, nodes pulsing, roots reaching down.
 *
 * Drawn in the game's pearl and silver, faintly tinted with the race's colour.
 * Shapes are generated from a fixed seed, so each race always looks the same.
 */

export interface Species {
  name: string;
  /** A line of flavour for tooltips and menus. */
  blurb: string;
  colour: string;
}

export const SPECIES: Species[] = [
  { name: 'Aureline', blurb: 'Plasma halos around a single unblinking eye.', colour: '#6f9fd8' },
  { name: "Xel'Naru", blurb: 'A choir of singing crystal around a core of light.', colour: '#d48a7c' },
  { name: 'Vorthane', blurb: 'A drifting bell of flesh, rimmed with eyes.', colour: '#c9a95e' },
  { name: 'Ixquor', blurb: 'A fungal hive that thinks in branching threads.', colour: '#a08bcb' },
];

/** Small deterministic RNG for the generated shapes. */
function rng(seed: number) {
  let t = seed | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

function defs(c: string): string {
  return `
    <defs>
      <radialGradient id="ti-core" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
        <stop offset="0.35" stop-color="${c}" stop-opacity="0.55"/>
        <stop offset="1" stop-color="${c}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="ti-body" cx="50%" cy="35%" r="65%">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
        <stop offset="0.7" stop-color="#dfe3ec" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#b9c0cf" stop-opacity="0.35"/>
      </radialGradient>
      <linearGradient id="ti-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9aa3b6" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#9aa3b6" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="ti-tint" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${c}" stop-opacity="0.75"/>
        <stop offset="1" stop-color="${c}" stop-opacity="0"/>
      </linearGradient>
    </defs>`;
}

/** 0 · Aureline: tilted halos around an eye; ribbon arms arching down both sides. */
function aureline(c: string): string {
  const halo = (rx: number, ry: number, tilt: number, cls: string, w: number) =>
    `<g class="ti-spin ${cls}"><ellipse cx="500" cy="190" rx="${rx}" ry="${ry}" transform="rotate(${tilt} 500 190)" fill="none" stroke="url(#ti-fade)" stroke-width="${w}"/></g>`;
  const arm = (side: 1 | -1) => {
    const x0 = 500 + side * 70;
    const d = `M${x0} 230 C ${500 + side * 260} 200, ${500 + side * 420} 250, ${500 + side * 450} 430 S ${500 + side * 400} 560, ${500 + side * 330} 590`;
    const fingers = [-30, -10, 12, 30]
      .map((o) => `<path d="M${500 + side * 330} 590 q ${side * (8 + o * 0.2)} 26 ${side * o} 44" stroke="url(#ti-fade)" stroke-width="3" fill="none" stroke-linecap="round"/>`)
      .join('');
    return `<g class="ti-sway ti-sway-${side > 0 ? 'r' : 'l'}"><path d="${d}" stroke="url(#ti-fade)" stroke-width="26" fill="none" stroke-linecap="round" opacity="0.45"/><path d="${d}" stroke="url(#ti-tint)" stroke-width="6" fill="none" stroke-linecap="round"/>${fingers}</g>`;
  };
  return `
    ${arm(-1)}${arm(1)}
    <circle cx="500" cy="190" r="170" fill="url(#ti-core)" class="ti-pulse"/>
    ${halo(230, 62, -14, 'ti-spin-a', 3)}
    ${halo(190, 44, 16, 'ti-spin-b', 2)}
    ${halo(150, 120, 60, 'ti-spin-c', 1.5)}
    <circle cx="500" cy="190" r="58" fill="url(#ti-body)" stroke="#fff" stroke-width="3"/>
    <circle cx="500" cy="190" r="30" fill="none" stroke="${c}" stroke-width="5" opacity="0.8" class="ti-pulse"/>
    <ellipse cx="500" cy="190" rx="9" ry="20" fill="#3b4150" opacity="0.85" class="ti-blink"/>`;
}

/** 1 · Xel'Naru: an arch of crystal shards around a light core; shard-chains for arms. */
function xelnaru(c: string): string {
  const r = rng(11);
  const shard = (x: number, y: number, ang: number, len: number, wid: number, cls = '') => {
    const a = (ang * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const px = -dy * wid, py = dx * wid;
    const tip = [x + dx * len, y + dy * len];
    const mid = [x + dx * len * 0.35, y + dy * len * 0.35];
    return `<path class="${cls}" d="M${f(x)} ${f(y)} L${f(mid[0] + px)} ${f(mid[1] + py)} L${f(tip[0])} ${f(tip[1])} L${f(mid[0] - px)} ${f(mid[1] - py)} Z" fill="url(#ti-body)" stroke="#aab2c4" stroke-width="1.2"/>`;
  };
  let crown = '';
  for (let i = 0; i < 17; i++) {
    const ang = -168 + (i / 16) * 156 + (r() - 0.5) * 6;
    const a = (ang * Math.PI) / 180;
    const base = 70 + r() * 20;
    crown += shard(500 + Math.cos(a) * base, 210 + Math.sin(a) * base, ang, 90 + r() * 90, 10 + r() * 7, i % 3 === 0 ? 'ti-hum' : '');
  }
  const chain = (side: 1 | -1) => {
    let out = '';
    for (let k = 0; k < 9; k++) {
      const t = k / 8;
      const x = 500 + side * (120 + t * 330 - t * t * 40);
      const y = 250 + t * 330 - Math.sin(t * Math.PI) * 60;
      out += shard(x, y, side > 0 ? 60 + t * 40 : 120 - t * 40, 34 - t * 14, 7 - t * 3);
    }
    return `<g class="ti-sway ti-sway-${side > 0 ? 'r' : 'l'}">${out}</g>`;
  };
  let motes = '';
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = 130 + r() * 150;
    motes += `<rect class="ti-drift" x="${f(500 + Math.cos(a) * d)}" y="${f(200 + Math.sin(a) * d * 0.6)}" width="6" height="6" transform="rotate(45 ${f(500 + Math.cos(a) * d)} ${f(200 + Math.sin(a) * d * 0.6)})" fill="${c}" opacity="0.55" style="animation-delay:${f(-r() * 8)}s"/>`;
  }
  return `
    ${chain(-1)}${chain(1)}
    <circle cx="500" cy="210" r="190" fill="url(#ti-core)" class="ti-pulse"/>
    <g class="ti-breathe">${crown}</g>
    ${motes}
    <circle cx="500" cy="210" r="34" fill="#fff" opacity="0.95"/>
    <circle cx="500" cy="210" r="46" fill="none" stroke="${c}" stroke-width="3" opacity="0.7" class="ti-pulse"/>`;
}

/** 2 · Vorthane: a ribbed bell with a rim of eyes, and long tentacles draping over the board. */
function vorthane(c: string): string {
  const r = rng(23);
  let tentacles = '';
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const sx = 330 + t * 340;
    const side = t < 0.5 ? -1 : 1;
    const spread = Math.abs(t - 0.5) * 2; // 0 centre … 1 edge
    const ex = 500 + side * (120 + spread * 380) + (r() - 0.5) * 60;
    const ey = 470 + (1 - spread) * 110 + r() * 40;
    const c1x = sx + side * (40 + spread * 120), c1y = 300 + r() * 40;
    const c2x = ex - side * (20 + r() * 60), c2y = ey - 150 - r() * 60;
    const d = `M${f(sx)} 236 C ${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(ex)} ${f(ey)}`;
    const w = 12 - spread * 6;
    tentacles += `<g class="ti-sway ti-sway-${side > 0 ? 'r' : 'l'}" style="animation-delay:${f(-r() * 6)}s"><path d="${d}" stroke="url(#ti-fade)" stroke-width="${f(w)}" fill="none" stroke-linecap="round" opacity="0.55"/><path d="${d}" stroke="url(#ti-tint)" stroke-width="1.6" fill="none" stroke-dasharray="1 14" stroke-linecap="round"/></g>`;
  }
  let ribs = '';
  for (let i = 1; i < 9; i++) {
    const x = 300 + i * 44.4;
    ribs += `<path d="M500 60 Q ${f(500 + (x - 500) * 0.55)} 120 ${f(x)} 232" fill="none" stroke="#b0b8c8" stroke-width="1.2" opacity="0.6"/>`;
  }
  let eyes = '';
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const x = 318 + t * 364;
    const y = 232 + Math.sin(t * Math.PI) * 10;
    eyes += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(5 + Math.sin(t * Math.PI) * 4)}" fill="${c}" class="ti-glint" style="animation-delay:${f(-t * 3)}s"/>`;
  }
  return `
    ${tentacles}
    <ellipse cx="500" cy="160" rx="260" ry="170" fill="url(#ti-core)" class="ti-pulse" opacity="0.6"/>
    <g class="ti-breathe">
      <path d="M300 236 C 300 110, 390 52, 500 52 C 610 52, 700 110, 700 236 Q 600 262 500 256 Q 400 262 300 236 Z" fill="url(#ti-body)" stroke="#fff" stroke-width="3"/>
      ${ribs}
      ${eyes}
    </g>`;
}

/** 3 · Ixquor: a fractal crown of branching threads with pulsing nodes, and root limbs. */
function ixquor(c: string): string {
  const r = rng(37);
  let lines = '';
  let nodes = '';
  const grow = (x: number, y: number, ang: number, len: number, depth: number) => {
    const a = (ang * Math.PI) / 180;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    const bend = (r() - 0.5) * len * 0.5;
    lines += `<path d="M${f(x)} ${f(y)} Q ${f((x + x2) / 2 + bend)} ${f((y + y2) / 2 - bend * 0.3)} ${f(x2)} ${f(y2)}" stroke="#a7afc0" stroke-width="${f(1 + depth * 1.6)}" fill="none" stroke-linecap="round" opacity="${f(0.45 + depth * 0.1)}"/>`;
    if (depth === 0 || len < 14) {
      nodes += `<circle cx="${f(x2)}" cy="${f(y2)}" r="${f(3 + r() * 4)}" fill="${c}" class="ti-glint" style="animation-delay:${f(-r() * 4)}s"/>`;
      return;
    }
    const kids = 2 + (r() < 0.3 ? 1 : 0);
    for (let k = 0; k < kids; k++) grow(x2, y2, ang + (k - (kids - 1) / 2) * (22 + r() * 16) + (r() - 0.5) * 10, len * (0.64 + r() * 0.12), depth - 1);
  };
  for (let i = 0; i < 7; i++) grow(500 + (i - 3) * 14, 250, -90 + (i - 3) * 20, 70 + r() * 20, 4);
  const root = (side: 1 | -1) => {
    let d = `M${500 + side * 30} 270`;
    let out = '';
    for (let k = 0; k < 3; k++) {
      const off = k * 22;
      d = `M${500 + side * (30 + off * 0.3)} ${270 + off * 0.4} C ${500 + side * (200 + off)} ${300 + off}, ${500 + side * (380 - off)} ${330 + off}, ${500 + side * (430 - off * 1.6)} ${560 - off * 0.5}`;
      out += `<path d="${d}" stroke="url(#ti-fade)" stroke-width="${10 - k * 3}" fill="none" stroke-linecap="round" opacity="${0.6 - k * 0.12}"/>`;
    }
    return `<g class="ti-sway ti-sway-${side > 0 ? 'r' : 'l'}">${out}</g>`;
  };
  return `
    ${root(-1)}${root(1)}
    <circle cx="500" cy="200" r="210" fill="url(#ti-core)" class="ti-pulse" opacity="0.7"/>
    <g class="ti-breathe">${lines}${nodes}</g>
    <ellipse cx="500" cy="262" rx="64" ry="30" fill="url(#ti-body)" stroke="#fff" stroke-width="3"/>
    <circle cx="486" cy="260" r="5" fill="${c}" class="ti-glint"/><circle cx="500" cy="254" r="6" fill="${c}" class="ti-glint" style="animation-delay:-1s"/><circle cx="514" cy="262" r="4.5" fill="${c}" class="ti-glint" style="animation-delay:-2s"/>`;
}

const DRAW = [aureline, xelnaru, vorthane, ixquor];

/** The looming figure of a race, drawn behind and above the battle board. */
export function titanSvg(species: number): string {
  const i = ((species % 4) + 4) % 4;
  const c = SPECIES[i].colour;
  return `<svg class="titan-art titan-${i}" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMin meet" aria-hidden="true">${defs(c)}${DRAW[i](c)}</svg>`;
}
