import { cardDef, type CardDef } from '../engine';

/**
 * Card illustrations: a painted scene for every card, drawn procedurally in
 * SVG (placeholders for commissioned art, but each card its own picture).
 *
 * Every scene sits in a 160×100 window: a sky in the card's palette (its race,
 * or its type for neutral cards), stars, and a subject shaded with gradients
 * and soft glows. Character cards show a figure of their race: an Aureline is
 * a plasma-cloaked being with one great eye inside tilted halos; a Xel'Naru a
 * figure of floating crystal shards round a core of light; a Vorthane a bell
 * of living jelly rimmed with eyes; an Ixquor a walking fungal hive; a Nyxari
 * a hooded void-stalker with slit eyes in an empty hood; a Korrath a squat
 * smith in iron plate with a fiery T-slit visor; a Seren a robed astronomer
 * with a face of stars under a crescent moon; a Pyrr a living flame. Each
 * character has its own pose, props, markings and colouring.
 *
 * Glows are radial gradients (no SVG filters), so a table full of cards stays
 * cheap to draw. Gradient ids are prefixed with the card's id, so two
 * different pictures on one page never share a definition.
 */

interface Pal {
  /** Sky, top to bottom. */
  sky: [string, string, string];
  /** The scene's main light. */
  glow: string;
  /** A second colour for details. */
  accent: string;
  /** Dark shading. */
  deep: string;
}

const PAL: Record<string, Pal> = {
  aureline: { sky: ['#1d3a6b', '#4d6fae', '#e9c98f'], glow: '#ffd98a', accent: '#8fd0ff', deep: '#132446' },
  xelnaru: { sky: ['#2c1638', '#6b2f5e', '#e8a2a8'], glow: '#ffb3c2', accent: '#c9a2ff', deep: '#1b0c24' },
  vorthane: { sky: ['#06273a', '#0f5563', '#58a9a0'], glow: '#ffd98a', accent: '#7ff0e0', deep: '#031520' },
  ixquor: { sky: ['#1b1433', '#3d2b5e', '#6f8f5a'], glow: '#c5ff8a', accent: '#d59cff', deep: '#0e0a1c' },
  attack: { sky: ['#2a1320', '#6a2a2a', '#e08a5a'], glow: '#ffb070', accent: '#ffe0a0', deep: '#180a10' },
  defence: { sky: ['#0f2140', '#2a5585', '#9cc8e8'], glow: '#bfe6ff', accent: '#ffffff', deep: '#08142a' },
  growth: { sky: ['#0f2a24', '#23584a', '#9cd2a0'], glow: '#c8ffd0', accent: '#fff3b0', deep: '#07181a' },
  global: { sky: ['#1a1036', '#4a2a7a', '#c79ae8'], glow: '#f0d0ff', accent: '#ffd98a', deep: '#0c0820' },
  command: { sky: ['#1a1f2a', '#3c4658', '#a9b3c4'], glow: '#e6ecf5', accent: '#ffd98a', deep: '#0d1016' },
  nyxari: { sky: ['#06050e', '#1b1638', '#4e4280'], glow: '#e2d8ff', accent: '#9d8cff', deep: '#03020a' },
  korrath: { sky: ['#141110', '#3a302a', '#a8602e'], glow: '#ffa040', accent: '#e2b06a', deep: '#0c0907' },
  seren: { sky: ['#070c24', '#22306a', '#9aa8d8'], glow: '#f0f4ff', accent: '#a9c4ff', deep: '#050920' },
  pyrr: { sky: ['#1c0505', '#6a140c', '#f06a24'], glow: '#ffd060', accent: '#ff6a1e', deep: '#160302' },
  lightspeed: { sky: ['#2a1a08', '#6a4210', '#e8b45a'], glow: '#ffe2a0', accent: '#fff6dc', deep: '#170d03' },
};

const RACE_PAL = ['aureline', 'xelnaru', 'vorthane', 'ixquor', 'nyxari', 'korrath', 'seren', 'pyrr'];

/** A small seeded random stream, so each card's stars and scatter are always the same. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** One scene being drawn: collects gradient definitions under unique ids. */
class Scene {
  private n = 0;
  defs: string[] = [];
  rand: () => number;
  constructor(
    public u: string,
    public p: Pal,
  ) {
    this.rand = rng(u);
  }
  private id() {
    return `${this.u}-${this.n++}`;
  }
  /** A radial gradient; stops as [offset 0–1, colour, opacity]. */
  radial(stops: [number, string, number?][], cx = 0.5, cy = 0.5, r = 0.5): string {
    const id = this.id();
    this.defs.push(
      `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a ?? 1}"/>`).join('')}</radialGradient>`,
    );
    return `url(#${id})`;
  }
  /** A linear gradient from (x1,y1) to (x2,y2) in the shape's own box (0–1). */
  linear(stops: [number, string, number?][], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string {
    const id = this.id();
    this.defs.push(
      `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a ?? 1}"/>`).join('')}</linearGradient>`,
    );
    return `url(#${id})`;
  }

  // ---- Light ---------------------------------------------------------------

  /** A soft round glow. */
  glow(x: number, y: number, r: number, c = this.p.glow, a = 0.8): string {
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${this.radial([[0, c, a], [0.35, c, a * 0.45], [1, c, 0]])}"/>`;
  }
  /** A star: a hot white core in a coloured body, with a glow and (optionally) soft rays. */
  sun(x: number, y: number, r: number, c = this.p.glow, rays = 0): string {
    let out = this.glow(x, y, r * 3.2, c, 0.55);
    if (rays) {
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + 0.3;
        const l = r * (1.9 + (i % 2) * 0.9);
        const w = r * 0.28;
        const px = Math.cos(a + Math.PI / 2) * w, py = Math.sin(a + Math.PI / 2) * w;
        out += `<polygon points="${f(x + px)},${f(y + py)} ${f(x + Math.cos(a) * l)},${f(y + Math.sin(a) * l)} ${f(x - px)},${f(y - py)}" fill="${c}" opacity="0.55"/>`;
      }
    }
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${this.radial([[0, '#ffffff'], [0.45, '#fff8e6'], [0.8, c], [1, c, 0.9]], 0.42, 0.4, 0.6)}"/>`;
    return out;
  }
  /** A tapering beam of light from (x1,y1) to (x2,y2). */
  beam(x1: number, y1: number, x2: number, y2: number, w: number, c = this.p.glow): string {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
    const g = this.linear([[0, '#ffffff', 1], [0.25, c, 0.95], [1, c, 0]], 0, 0, 1, 0);
    const soft = this.linear([[0, c, 0.5], [1, c, 0]], 0, 0, 1, 0);
    // The gradient runs along the beam: rotate a group so the beam lies along x.
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return `<g transform="rotate(${f(ang)} ${f(x1)} ${f(y1)})">
      <polygon points="${f(x1)},${f(y1 - w * 2.6)} ${f(x1 + l)},${f(y1 - w * 0.5)} ${f(x1 + l)},${f(y1 + w * 0.5)} ${f(x1)},${f(y1 + w * 2.6)}" fill="${soft}"/>
      <polygon points="${f(x1)},${f(y1 - w)} ${f(x1 + l)},${f(y1 - w * 0.15)} ${f(x1 + l)},${f(y1 + w * 0.15)} ${f(x1)},${f(y1 + w)}" fill="${g}"/>
    </g>`.replace(/\n\s*/g, '');
  }
  /** A jagged bolt of energy. */
  bolt(x1: number, y1: number, x2: number, y2: number, c = this.p.accent, kinks = 5, w = 1.6): string {
    const pts: string[] = [];
    for (let i = 0; i <= kinks; i++) {
      const t = i / kinks;
      const j = i === 0 || i === kinks ? 0 : (this.rand() - 0.5) * 10;
      pts.push(`${f(x1 + (x2 - x1) * t + j * 0.4)},${f(y1 + (y2 - y1) * t + j)}`);
    }
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="${w * 3}" stroke-opacity="0.25" stroke-linejoin="round"/><polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linejoin="round"/>`;
  }
  /** Concentric rings of light (a sound, a pulse, a field). */
  rings(x: number, y: number, r0: number, n: number, gap: number, c = this.p.accent, a = 0.7): string {
    return Array.from({ length: n }, (_, i) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r0 + i * gap)}" fill="none" stroke="${c}" stroke-width="${f(1.6 - i * 0.25)}" stroke-opacity="${f(a * (1 - i / (n + 1)))}"/>`).join('');
  }
  /** A tilted orbit ellipse. */
  orbit(x: number, y: number, rx: number, ry: number, rot: number, c = this.p.accent, w = 1.2, a = 0.8): string {
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${rot} ${f(x)} ${f(y)})" fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${a}"/>`;
  }
  /** Motes of light scattered round a point. */
  motes(x: number, y: number, n: number, spread: number, c = this.p.glow, size = 1.4): string {
    let out = '';
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, d = spread * Math.sqrt(this.rand());
      const r = size * (0.5 + this.rand());
      out += `<circle cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d * 0.8)}" r="${f(r)}" fill="${c}" opacity="${f(0.5 + this.rand() * 0.5)}"/>`;
    }
    return out;
  }

  // ---- Things ----------------------------------------------------------------

  /** A planet, lit from the upper left, with an optional ring. */
  planet(x: number, y: number, r: number, a: string, b: string, ring = false): string {
    const body = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${this.radial([[0, a], [0.7, b], [1, this.p.deep]], 0.35, 0.32, 0.75)}"/>`;
    if (!ring) return body;
    const back = `<path d="M${f(x - r * 1.9)} ${f(y)} A${f(r * 1.9)} ${f(r * 0.45)} -12 0 1 ${f(x + r * 1.9)} ${f(y)}" transform="rotate(-12 ${f(x)} ${f(y)})" fill="none" stroke="${a}" stroke-width="${f(r * 0.18)}" stroke-opacity="0.5"/>`;
    const front = `<path d="M${f(x - r * 1.9)} ${f(y)} A${f(r * 1.9)} ${f(r * 0.45)} -12 0 0 ${f(x + r * 1.9)} ${f(y)}" transform="rotate(-12 ${f(x)} ${f(y)})" fill="none" stroke="${a}" stroke-width="${f(r * 0.18)}" stroke-opacity="0.85"/>`;
    return back + body + front;
  }
  /** A faceted crystal: a tall diamond with a lit face and a shaded face. */
  crystal(x: number, y: number, h: number, w: number, rot = 0, c = this.p.glow, a = 1): string {
    const top = `${f(x)},${f(y - h / 2)}`, bot = `${f(x)},${f(y + h / 2)}`;
    const l = `${f(x - w / 2)},${f(y - h * 0.08)}`, r = `${f(x + w / 2)},${f(y - h * 0.08)}`;
    const m = `${f(x + w * 0.08)},${f(y - h * 0.02)}`;
    return `<g transform="rotate(${rot} ${f(x)} ${f(y)})" opacity="${a}">
      <polygon points="${top} ${l} ${bot} ${m}" fill="${this.linear([[0, '#ffffff'], [0.5, c], [1, c, 0.85]], 0, 0, 1, 1)}"/>
      <polygon points="${top} ${m} ${bot} ${r}" fill="${this.linear([[0, c], [1, this.p.deep, 0.9]], 0, 0, 1, 1)}"/>
      <polyline points="${top} ${m} ${bot}" fill="none" stroke="#fff" stroke-width="0.5" stroke-opacity="0.8"/>
    </g>`.replace(/\n\s*/g, '');
  }
  /** A glassy shield dome. */
  dome(x: number, y: number, r: number, c = this.p.glow): string {
    return `<path d="M${f(x - r)} ${f(y)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)} Z" fill="${this.linear([[0, c, 0.55], [1, c, 0.08]])}" stroke="${c}" stroke-width="1.2" stroke-opacity="0.9"/>
      <path d="M${f(x - r * 0.72)} ${f(y - r * 0.3)} A${f(r * 0.8)} ${f(r * 0.8)} 0 0 1 ${f(x - r * 0.1)} ${f(y - r * 0.86)}" fill="none" stroke="#fff" stroke-width="1.4" stroke-opacity="0.8" stroke-linecap="round"/>`;
  }
  /** A hexagonal lattice cell (armour, hives, grids). */
  hex(x: number, y: number, r: number, fill: string, stroke = this.p.accent, a = 1): string {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const t = ((i * 60 + 30) * Math.PI) / 180;
      return `${f(x + Math.cos(t) * r)},${f(y + Math.sin(t) * r)}`;
    }).join(' ');
    return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="0.9" opacity="${a}"/>`;
  }
  /** A card (held, drawn, recovered...). */
  card(x: number, y: number, rot: number, c = this.p.glow, w = 18): string {
    const h = w * 1.4;
    return `<g transform="rotate(${rot} ${f(x)} ${f(y)})"><rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="2" fill="${this.linear([[0, '#ffffff'], [1, c]])}" stroke="#fff" stroke-width="0.8"/><rect x="${f(x - w * 0.36)}" y="${f(y - h * 0.4)}" width="${f(w * 0.72)}" height="${f(h * 0.42)}" rx="1.2" fill="${this.p.sky[1]}" opacity="0.75"/>${this.glow(x, y - h * 0.19, w * 0.22, this.p.glow, 0.9)}</g>`;
  }
  /** A mushroom cap on a stalk. */
  mushroom(x: number, y: number, h: number, w: number, cap = this.p.accent, lean = 0): string {
    const tx = x + lean;
    return `<path d="M${f(x - w * 0.09)} ${f(y)} Q${f(x + lean * 0.4)} ${f(y - h * 0.5)} ${f(tx - w * 0.07)} ${f(y - h)} L${f(tx + w * 0.07)} ${f(y - h)} Q${f(x + lean * 0.4 + w * 0.12)} ${f(y - h * 0.5)} ${f(x + w * 0.09)} ${f(y)} Z" fill="${this.linear([[0, '#e8e0f0'], [1, this.p.deep]], 0, 0, 1, 0)}"/>
      <path d="M${f(tx - w / 2)} ${f(y - h)} Q${f(tx - w * 0.45)} ${f(y - h - w * 0.55)} ${f(tx)} ${f(y - h - w * 0.58)} Q${f(tx + w * 0.45)} ${f(y - h - w * 0.55)} ${f(tx + w / 2)} ${f(y - h)} Q${f(tx)} ${f(y - h + w * 0.12)} ${f(tx - w / 2)} ${f(y - h)} Z" fill="${this.radial([[0, '#ffffff'], [0.4, cap], [1, this.p.deep]], 0.4, 0.3, 0.8)}"/>
      ${this.glow(tx, y - h - w * 0.2, w * 0.5, cap, 0.35)}`;
  }
  /** Rolling waves along a line. */
  waves(y: number, c = this.p.accent, amp = 3, n = 3, a = 0.8): string {
    let out = '';
    for (let k = 0; k < n; k++) {
      const yy = y + k * amp * 2.2;
      let d = `M-5 ${f(yy)}`;
      for (let x = -5; x < 170; x += 20) d += ` q10 ${-amp} 20 0`;
      out += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(1.6 - k * 0.3)}" stroke-opacity="${f(a * (1 - k * 0.25))}"/>`;
    }
    return out;
  }
  /** A ground or horizon: a softly lit curve across the bottom. */
  ground(y: number, c = this.p.deep, bulge = 8): string {
    return `<path d="M-5 ${f(y + bulge)} Q80 ${f(y - bulge)} 165 ${f(y + bulge)} L165 105 L-5 105 Z" fill="${this.linear([[0, this.p.sky[2], 0.6], [0.15, c], [1, c]])}"/>`;
  }
  /** A machine panel (batteries, cannons, arrays). */
  panel(x: number, y: number, w: number, h: number, rx = 2): string {
    return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rx}" fill="${this.linear([[0, '#dfe6f0'], [0.5, '#8d98ab'], [1, '#3a4252']])}" stroke="#fff" stroke-width="0.6" stroke-opacity="0.7"/>`;
  }
}

// ---------------------------------------------------------------------------
// The races, as characters
// ---------------------------------------------------------------------------

interface AurelineOpts {
  /** Eye colour. */
  eye?: string;
  /** Tilted plasma halos round the head. */
  halos?: number;
  /** Cloak colour. */
  cloak?: string;
  /** What they hold. */
  item?: 'lance' | 'shield' | 'staff' | 'banner' | 'orb' | 'none';
  crown?: boolean;
  lean?: number;
  /** What they wear over the plasma: plate armour, long vestments, or nothing. */
  garb?: 'armour' | 'vestment' | 'robe';
  /** A band of colour across the cloak. */
  sash?: string;
}

/** An Aureline: one great eye in a sphere of light, tilted plasma halos, a cloak of flame that trails away. */
function aureline(S: Scene, x: number, y: number, s: number, o: AurelineOpts = {}): string {
  const cloak = o.cloak ?? S.p.glow;
  const eye = o.eye ?? '#2a6fd0';
  const lean = (o.lean ?? 0) * s;
  const hr = 7.5 * s;
  let out = S.glow(x, y, hr * 4.5, cloak, 0.35);
  // The cloak: a teardrop of plasma, from the shoulders to a wisping tail.
  out += `<path d="M${f(x - hr * 1.5)} ${f(y + hr * 0.6)} C${f(x - hr * 2.4)} ${f(y + hr * 3)} ${f(x - hr * 0.8 + lean)} ${f(y + hr * 4.6)} ${f(x + lean * 1.6)} ${f(y + hr * 6)} C${f(x + hr * 0.9 + lean)} ${f(y + hr * 4.4)} ${f(x + hr * 2.4)} ${f(y + hr * 3)} ${f(x + hr * 1.5)} ${f(y + hr * 0.6)} Q${f(x)} ${f(y - hr * 0.2)} ${f(x - hr * 1.5)} ${f(y + hr * 0.6)} Z" fill="${S.linear([[0, '#fff6dc', 0.95], [0.4, cloak, 0.85], [1, cloak, 0]])}"/>`;
  out += `<path d="M${f(x - hr * 0.6)} ${f(y + hr * 1.2)} Q${f(x + lean * 0.5)} ${f(y + hr * 3.2)} ${f(x + lean * 1.4)} ${f(y + hr * 5.2)}" fill="none" stroke="#fff" stroke-width="${f(0.5 * s)}" stroke-opacity="0.6"/>`;
  const garb = o.garb ?? 'robe';
  if (garb === 'armour') {
    // Gold plate over the chest (chevrons) and pauldrons on the shoulders.
    for (let i = 0; i < 3; i++) out += `<path d="M${f(x - hr * (1.3 - i * 0.15))} ${f(y + hr * (1.4 + i * 0.75))} L${f(x)} ${f(y + hr * (2 + i * 0.75))} L${f(x + hr * (1.3 - i * 0.15))} ${f(y + hr * (1.4 + i * 0.75))}" fill="none" stroke="${S.linear([[0, '#fff3c4'], [1, '#b8862a']], 0, 0, 1, 0)}" stroke-width="${f(1.9 * s)}" stroke-linejoin="round"/>`;
    for (const k of [-1, 1]) out += `<path d="M${f(x + k * hr * 0.9)} ${f(y + hr * 1.05)} Q${f(x + k * hr * 1.9)} ${f(y + hr * 0.6)} ${f(x + k * hr * 2)} ${f(y + hr * 1.7)} Q${f(x + k * hr * 1.4)} ${f(y + hr * 1.5)} ${f(x + k * hr * 0.9)} ${f(y + hr * 1.05)} Z" fill="${S.linear([[0, '#fff3c4'], [1, '#a8761e']])}"/>`;
  } else if (garb === 'vestment') {
    // A long robe of pale cloth, with a stole down the front and a gold hem.
    out += `<path d="M${f(x - hr * 1.2)} ${f(y + hr * 0.9)} L${f(x - hr * 2.1)} ${f(y + hr * 5.4)} Q${f(x)} ${f(y + hr * 6)} ${f(x + hr * 2.1)} ${f(y + hr * 5.4)} L${f(x + hr * 1.2)} ${f(y + hr * 0.9)} Q${f(x)} ${f(y + hr * 0.3)} ${f(x - hr * 1.2)} ${f(y + hr * 0.9)} Z" fill="${S.linear([[0, '#fffaf0'], [1, '#d8c8a8']])}" opacity="0.95"/>`;
    out += `<path d="M${f(x - hr * 2.05)} ${f(y + hr * 5.3)} Q${f(x)} ${f(y + hr * 5.9)} ${f(x + hr * 2.05)} ${f(y + hr * 5.3)}" fill="none" stroke="#d9a63a" stroke-width="${f(1.4 * s)}"/>`;
    out += `<path d="M${f(x - hr * 0.35)} ${f(y + hr * 1)} L${f(x - hr * 0.5)} ${f(y + hr * 5.6)} M${f(x + hr * 0.35)} ${f(y + hr * 1)} L${f(x + hr * 0.5)} ${f(y + hr * 5.6)}" fill="none" stroke="${o.sash ?? '#c0392b'}" stroke-width="${f(1.6 * s)}"/>`;
    out += S.sun(x, y + hr * 2.6, 1.3 * s, '#ffd98a');
  }
  if (o.sash && garb !== 'vestment') out += `<path d="M${f(x - hr * 1.5)} ${f(y + hr * 1.3)} Q${f(x)} ${f(y + hr * 3.2)} ${f(x + hr * 1.7)} ${f(y + hr * 2.4)}" fill="none" stroke="${o.sash}" stroke-width="${f(2.2 * s)}" stroke-linecap="round"/>`;
  // Arms of plasma, reaching to where the item is held.
  const hand: [number, number] = [x + hr * 2.4, y + hr * 1.6];
  if (o.item && o.item !== 'none') {
    out += `<path d="M${f(x + hr * 1.2)} ${f(y + hr * 1)} Q${f(x + hr * 2.2)} ${f(y + hr * 0.8)} ${f(hand[0])} ${f(hand[1])}" fill="none" stroke="${cloak}" stroke-width="${f(1.6 * s)}" stroke-linecap="round" stroke-opacity="0.9"/>`;
    out += `<path d="M${f(x - hr * 1.2)} ${f(y + hr * 1)} Q${f(x - hr * 2.1)} ${f(y + hr * 1.6)} ${f(x - hr * 1.6)} ${f(y + hr * 2.6)}" fill="none" stroke="${cloak}" stroke-width="${f(1.5 * s)}" stroke-linecap="round" stroke-opacity="0.8"/>`;
  }
  // Halos behind the head.
  const halos = o.halos ?? 2;
  const tilts = [-18, 22, -62];
  for (let i = 0; i < halos; i++) out += S.orbit(x, y, hr * (1.9 + i * 0.35), hr * (0.62 + i * 0.1), tilts[i], i % 2 ? S.p.accent : '#fff3c4', 1.1 * s, 0.85);
  // The head: a sphere of light with the eye.
  out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(hr)}" fill="${S.radial([[0, '#ffffff'], [0.6, '#fff1c8'], [1, cloak]], 0.4, 0.35, 0.7)}"/>`;
  out += `<path d="M${f(x - hr * 0.78)} ${f(y)} Q${f(x)} ${f(y - hr * 0.72)} ${f(x + hr * 0.78)} ${f(y)} Q${f(x)} ${f(y + hr * 0.72)} ${f(x - hr * 0.78)} ${f(y)} Z" fill="#fff"/>`;
  out += `<circle cx="${f(x + hr * 0.04)}" cy="${f(y)}" r="${f(hr * 0.42)}" fill="${S.radial([[0, '#ffffff'], [0.3, eye], [1, S.p.deep]], 0.45, 0.4, 0.6)}"/>`;
  out += `<ellipse cx="${f(x + hr * 0.04)}" cy="${f(y)}" rx="${f(hr * 0.1)}" ry="${f(hr * 0.3)}" fill="${S.p.deep}"/>`;
  out += `<circle cx="${f(x - hr * 0.14)}" cy="${f(y - hr * 0.16)}" r="${f(hr * 0.1)}" fill="#fff"/>`;
  // Halos in front (the lower half of each).
  for (let i = 0; i < halos; i++) {
    const rx = hr * (1.9 + i * 0.35), ry = hr * (0.62 + i * 0.1);
    out += `<path d="M${f(x - rx)} ${f(y)} A${f(rx)} ${f(ry)} 0 0 0 ${f(x + rx)} ${f(y)}" transform="rotate(${tilts[i]} ${f(x)} ${f(y)})" fill="none" stroke="${i % 2 ? S.p.accent : '#fff3c4'}" stroke-width="${f(1.5 * s)}" stroke-opacity="0.95"/>`;
  }
  if (o.crown) {
    // A sunburst crown: tapered golden rays fanned above the head.
    let rays = '';
    for (let i = -4; i <= 4; i++) {
      const a = -Math.PI / 2 + i * 0.2;
      const r1 = hr * 1.15, r2 = hr * (2.2 + (i % 2 ? 0 : 0.55) - Math.abs(i) * 0.08);
      const w = 0.09;
      rays += `<polygon points="${f(x + Math.cos(a - w) * r1)},${f(y + Math.sin(a - w) * r1)} ${f(x + Math.cos(a) * r2)},${f(y + Math.sin(a) * r2)} ${f(x + Math.cos(a + w) * r1)},${f(y + Math.sin(a + w) * r1)}"/>`;
    }
    out = S.glow(x, y - hr * 1.6, hr * 2, '#fff3c4', 0.8) + `<g fill="${S.linear([[0, '#ffffff'], [1, '#e0a020']])}">${rays}</g>` + out;
  }
  switch (o.item) {
    case 'lance': {
      // A golden shaft through the hand, tipped with a blade of light that trails fire.
      const [bx, by] = [hand[0] - hr * 2.2, hand[1] + hr * 1.8];
      const [tx, ty] = [hand[0] + hr * 4.4, hand[1] - hr * 3];
      out += `<line x1="${f(bx)}" y1="${f(by)}" x2="${f(tx)}" y2="${f(ty)}" stroke="${S.linear([[0, '#8a5a1a'], [1, '#fff3c4']], 0, 1, 1, 0)}" stroke-width="${f(1.5 * s)}" stroke-linecap="round"/>`;
      const ang = Math.atan2(ty - by, tx - bx);
      const L = hr * 1.6, W = hr * 0.45;
      const px = Math.cos(ang), py = Math.sin(ang), nx = -py, ny = px;
      out += S.glow(tx + px * L * 0.5, ty + py * L * 0.5, hr * 1.4, '#fff3c4', 0.8);
      out += `<polygon points="${f(tx - nx * W)},${f(ty - ny * W)} ${f(tx + px * L)},${f(ty + py * L)} ${f(tx + nx * W)},${f(ty + ny * W)} ${f(tx - px * W * 0.8)},${f(ty - py * W * 0.8)}" fill="${S.linear([[0, '#ffffff'], [1, '#ffd98a']])}"/>`;
      out += S.beam(tx + px * L, ty + py * L, tx + px * L * 3.4, ty + py * L * 3.4, 0.9 * s, '#fff3c4');
      break;
    }
    case 'shield':
      out += `<circle cx="${f(hand[0] + hr * 0.6)}" cy="${f(hand[1])}" r="${f(hr * 1.7)}" fill="${S.radial([[0, '#ffffff', 0.9], [0.6, S.p.accent, 0.55], [1, S.p.accent, 0.1]], 0.4, 0.35, 0.65)}" stroke="#fff" stroke-width="${f(0.9 * s)}"/>`;
      out += S.rings(hand[0] + hr * 0.6, hand[1], hr * 0.6, 2, hr * 0.45, '#fff', 0.8);
      break;
    case 'staff':
      out += `<line x1="${f(hand[0] - hr * 0.4)}" y1="${f(hand[1] + hr * 3.4)}" x2="${f(hand[0] + hr * 0.5)}" y2="${f(hand[1] - hr * 3)}" stroke="#f3d99a" stroke-width="${f(1.4 * s)}" stroke-linecap="round"/>`;
      out += S.sun(hand[0] + hr * 0.55, hand[1] - hr * 3.4, 2.6 * s, S.p.glow, 8);
      break;
    case 'banner': {
      const px = hand[0] + hr * 0.3, top = hand[1] - hr * 4;
      out += `<line x1="${f(px)}" y1="${f(hand[1] + hr * 3)}" x2="${f(px)}" y2="${f(top)}" stroke="#f3d99a" stroke-width="${f(1.2 * s)}"/>`;
      out += `<path d="M${f(px)} ${f(top)} Q${f(px + hr * 2)} ${f(top - hr * 0.4)} ${f(px + hr * 4)} ${f(top + hr * 0.3)} L${f(px + hr * 3.4)} ${f(top + hr * 1.3)} L${f(px + hr * 4)} ${f(top + hr * 2.4)} Q${f(px + hr * 2)} ${f(top + hr * 1.7)} ${f(px)} ${f(top + hr * 2.2)} Z" fill="${S.linear([[0, '#2f5fb8'], [1, '#6f9fe8']], 0, 0, 1, 0)}" stroke="#fff3c4" stroke-width="${f(0.6 * s)}"/>`;
      out += S.sun(px + hr * 1.8, top + hr * 1.05, 1.5 * s, '#ffd98a', 6);
      break;
    }
    case 'orb':
      out += S.sun(hand[0], hand[1] - hr * 0.4, 2.8 * s, S.p.glow, 10);
      break;
  }
  return out;
}

interface XelOpts {
  core?: string;
  shard?: string;
  item?: 'blade' | 'lens' | 'reliquary' | 'none';
  cracked?: boolean;
  /** A translucent cape of fine shards behind the figure. */
  cape?: string;
  /** Heavy shoulder crystals. */
  pauldrons?: boolean;
  crown?: boolean;
  /** A wider, heavier figure. */
  bulk?: number;
}

/** A Xel'Naru: a core of light held in a figure of floating crystal shards. */
function xelnaru(S: Scene, x: number, y: number, s: number, o: XelOpts = {}): string {
  const core = o.core ?? '#ffe0ea';
  const shard = o.shard ?? S.p.glow;
  const b = o.bulk ?? 1;
  let out = S.glow(x, y + 8 * s, 34 * s, shard, 0.35);
  if (o.cape) {
    out += `<path d="M${f(x - 12 * s * b)} ${f(y - 2 * s)} L${f(x - 26 * s * b)} ${f(y + 36 * s)} L${f(x - 12 * s)} ${f(y + 32 * s)} L${f(x)} ${f(y + 40 * s)} L${f(x + 12 * s)} ${f(y + 32 * s)} L${f(x + 26 * s * b)} ${f(y + 36 * s)} L${f(x + 12 * s * b)} ${f(y - 2 * s)} Z" fill="${S.linear([[0, o.cape, 0.75], [1, o.cape, 0.1]])}" stroke="#fff" stroke-width="${f(0.5 * s)}" stroke-opacity="0.6"/>`;
    for (let i = -2; i <= 2; i++) out += `<line x1="${f(x + i * 3 * s)}" y1="${f(y)}" x2="${f(x + i * 9 * s)}" y2="${f(y + 36 * s)}" stroke="#fff" stroke-width="${f(0.4 * s)}" stroke-opacity="0.5"/>`;
  }
  // Trailing shards below (no legs: it floats).
  out += S.crystal(x - 5 * s * b, y + 24 * s, 12 * s, 5 * s, -8, shard, 0.8);
  out += S.crystal(x + 5 * s * b, y + 26 * s, 10 * s, 4 * s, 10, shard, 0.7);
  out += S.crystal(x, y + 33 * s, 7 * s, 3 * s, 0, shard, 0.55);
  // Torso shards round the core.
  out += S.crystal(x - 7 * s * b, y + 8 * s, 18 * s, 8 * s * b, 14, shard);
  out += S.crystal(x + 7 * s * b, y + 8 * s, 18 * s, 8 * s * b, -14, shard);
  // Shoulders and arms.
  out += S.crystal(x - 15 * s * b, y + 2 * s, 11 * s, 6 * s, 60, shard);
  out += S.crystal(x + 15 * s * b, y + 2 * s, 11 * s, 6 * s, -60, shard);
  out += S.crystal(x - 20 * s * b, y + 12 * s, 12 * s, 4.5 * s, 20, shard, 0.9);
  out += S.crystal(x + 21 * s * b, y + 12 * s, 12 * s, 4.5 * s, -25, shard, 0.9);
  if (o.pauldrons) for (const k of [-1, 1]) out += S.crystal(x + k * 17 * s * b, y - 3 * s, 16 * s, 10 * s, k * -70, S.p.accent);
  // The core of light.
  out += S.sun(x, y + 8 * s, 4.6 * s, core);
  if (o.cracked) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      out += S.beam(x, y + 8 * s, x + Math.cos(a) * 34 * s, y + 8 * s + Math.sin(a) * 26 * s, 0.9 * s, core);
    }
    out += S.bolt(x - 2 * s, y + 4 * s, x - 9 * s, y - 6 * s, core, 3, 0.9 * s);
    out += S.bolt(x + 2 * s, y + 10 * s, x + 12 * s, y + 18 * s, core, 3, 0.9 * s);
    out += S.motes(x, y + 8 * s, 14, 20 * s, core, 1.1 * s);
  }
  // The head: a tall shard with two points of light.
  out += S.crystal(x, y - 10 * s, 16 * s, 8 * s, 0, shard);
  out += `<circle cx="${f(x - 1.6 * s)}" cy="${f(y - 11 * s)}" r="${f(0.9 * s)}" fill="#fff"/><circle cx="${f(x + 1.6 * s)}" cy="${f(y - 11 * s)}" r="${f(0.9 * s)}" fill="#fff"/>`;
  out += S.glow(x, y - 11 * s, 5 * s, '#ffffff', 0.5);
  if (o.crown) {
    [-3, -2, -1, 0, 1, 2, 3].forEach((i) => (out += S.crystal(x + i * 4.2 * s, y - 20 * s - (3 - Math.abs(i)) * 1.6 * s, (6 + (3 - Math.abs(i)) * 2) * s, 2.6 * s, i * 9, S.p.accent)));
    out += S.orbit(x, y - 22 * s, 18 * s, 4 * s, 0, '#fff', 0.8 * s, 0.7);
  }
  switch (o.item) {
    case 'blade':
      // A long crystal blade, gripped by the right arm and raised.
      out += S.glow(x + 30 * s, y - 4 * s, 16 * s, S.p.accent, 0.45);
      out += S.crystal(x + 31 * s, y - 6 * s, 50 * s, 7 * s, 38, '#ffffff');
      out += `<line x1="${f(x + 18 * s)} " y1="${f(y + 11 * s)}" x2="${f(x + 25 * s)}" y2="${f(y + 4 * s)}" stroke="#d9a63a" stroke-width="${f(2.2 * s)}" stroke-linecap="round"/>`;
      out += `<line x1="${f(x + 19 * s)}" y1="${f(y + 1 * s)}" x2="${f(x + 28 * s)}" y2="${f(y + 10 * s)}" stroke="#d9a63a" stroke-width="${f(1.6 * s)}" stroke-linecap="round"/>`;
      break;
    case 'lens':
      out += `<circle cx="${f(x + 26 * s)}" cy="${f(y + 6 * s)}" r="${f(8 * s)}" fill="${S.radial([[0, '#ffffff', 0.9], [0.7, S.p.accent, 0.4], [1, S.p.accent, 0.1]])}" stroke="#fff" stroke-width="${f(0.8 * s)}"/>`;
      out += S.bolt(x + 21 * s, y + 1 * s, x + 30 * s, y + 11 * s, '#fff', 3, 0.6 * s);
      out += S.beam(x + 32 * s, y + 6 * s, x + 50 * s, y - 4 * s, 1.2 * s, S.p.accent);
      break;
    case 'reliquary':
      out += `<path d="M${f(x + 18 * s)} ${f(y + 14 * s)} h${f(14 * s)} l${f(-2 * s)} ${f(12 * s)} h${f(-10 * s)} Z" fill="${S.linear([[0, '#f3d99a'], [1, '#8a6a2a']])}" stroke="#fff3c4" stroke-width="${f(0.6 * s)}"/>`;
      out += S.crystal(x + 25 * s, y + 10 * s, 10 * s, 4 * s, 0, '#fff');
      out += S.glow(x + 25 * s, y + 12 * s, 9 * s, S.p.glow, 0.6);
      break;
  }
  return out;
}

interface VorOpts {
  bell?: string;
  eyes?: number;
  item?: 'bell' | 'trident' | 'lantern' | 'none';
  helm?: boolean;
  /** Tentacle length. */
  reach?: number;
  crown?: boolean;
}

/** A Vorthane: a ribbed bell of living jelly, rimmed with glowing eyes, trailing tentacles. */
function vorthane(S: Scene, x: number, y: number, s: number, o: VorOpts = {}): string {
  const bell = o.bell ?? S.p.accent;
  const w = 20 * s, h = 16 * s;
  const reach = (o.reach ?? 1) * s;
  let out = S.glow(x, y, w * 1.6, bell, 0.35);
  // Tentacles, swaying.
  for (let i = 0; i < 7; i++) {
    const tx = x - w * 0.8 + (i * w * 1.6) / 6;
    const sway = (i % 2 ? 1 : -1) * 4 * s;
    out += `<path d="M${f(tx)} ${f(y + h * 0.1)} q${f(sway)} ${f(10 * reach)} 0 ${f(20 * reach)} t${f(-sway * 0.6)} ${f(14 * reach)}" fill="none" stroke="${bell}" stroke-width="${f((i % 3 ? 1 : 1.6) * s)}" stroke-opacity="${f(0.75 - Math.abs(i - 3) * 0.08)}" stroke-linecap="round"/>`;
  }
  // The bell.
  out += `<path d="M${f(x - w)} ${f(y + h * 0.2)} C${f(x - w)} ${f(y - h * 1.3)} ${f(x + w)} ${f(y - h * 1.3)} ${f(x + w)} ${f(y + h * 0.2)} Q${f(x)} ${f(y + h * 0.55)} ${f(x - w)} ${f(y + h * 0.2)} Z" fill="${S.radial([[0, '#ffffff', 0.95], [0.45, bell, 0.8], [1, bell, 0.35]], 0.42, 0.25, 0.8)}" stroke="#fff" stroke-width="${f(0.6 * s)}" stroke-opacity="0.7"/>`;
  for (const k of [-0.55, 0, 0.55]) out += `<path d="M${f(x + k * w * 0.4)} ${f(y - h * 0.95)} Q${f(x + k * w * 0.9)} ${f(y - h * 0.3)} ${f(x + k * w)} ${f(y + h * 0.28)}" fill="none" stroke="#fff" stroke-width="${f(0.6 * s)}" stroke-opacity="0.55"/>`;
  if (o.helm) out += `<path d="M${f(x - w * 1.02)} ${f(y - h * 0.1)} C${f(x - w)} ${f(y - h * 1.45)} ${f(x + w)} ${f(y - h * 1.45)} ${f(x + w * 1.02)} ${f(y - h * 0.1)}" fill="none" stroke="#d9b36a" stroke-width="${f(2.4 * s)}"/><path d="M${f(x)} ${f(y - h * 1.1)} l${f(-3 * s)} ${f(-7 * s)} l${f(3 * s)} ${f(2 * s)} l${f(3 * s)} ${f(-2 * s)} Z" fill="#d9b36a"/>`;
  if (o.crown) for (let i = -2; i <= 2; i++) out += `<path d="M${f(x + i * 6 * s)} ${f(y - h * 1.02 + Math.abs(i) * 2 * s)} l${f(-2 * s)} ${f(-8 * s + Math.abs(i) * 2 * s)} l${f(4 * s)} 0 Z" fill="#ffe7a8" opacity="0.95"/>`;
  // The rim of eyes.
  const eyes = o.eyes ?? 5;
  for (let i = 0; i < eyes; i++) {
    const t = eyes === 1 ? 0.5 : i / (eyes - 1);
    const ex = x - w * 0.78 + t * w * 1.56;
    const ey = y + h * 0.12 + Math.sin(t * Math.PI) * h * 0.22;
    out += S.glow(ex, ey, 3.2 * s, S.p.glow, 0.8);
    out += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(1.3 * s)}" fill="#fff"/><circle cx="${f(ex)}" cy="${f(ey + 0.2 * s)}" r="${f(0.6 * s)}" fill="${S.p.deep}"/>`;
  }
  switch (o.item) {
    case 'bell':
      out += `<path d="M${f(x + w * 1.2)} ${f(y + 20 * s)} c0 ${f(-9 * s)} ${f(3 * s)} ${f(-13 * s)} ${f(7 * s)} ${f(-13 * s)} s${f(7 * s)} ${f(4 * s)} ${f(7 * s)} ${f(13 * s)} Z" fill="${S.linear([[0, '#ffe7a8'], [1, '#9a6a1e']])}" stroke="#fff3c4" stroke-width="${f(0.6 * s)}"/>`;
      out += S.rings(x + w * 1.2 + 7 * s, y + 14 * s, 11 * s, 3, 4.5 * s, S.p.glow, 0.6);
      break;
    case 'trident': {
      const tx = x + w * 1.25;
      out += `<line x1="${f(tx)}" y1="${f(y + 40 * s)}" x2="${f(tx)}" y2="${f(y - 26 * s)}" stroke="#d9b36a" stroke-width="${f(1.4 * s)}"/>`;
      out += `<path d="M${f(tx - 6 * s)} ${f(y - 18 * s)} v${f(-8 * s)} M${f(tx + 6 * s)} ${f(y - 18 * s)} v${f(-8 * s)} M${f(tx - 6 * s)} ${f(y - 18 * s)} q${f(6 * s)} ${f(5 * s)} ${f(12 * s)} 0" fill="none" stroke="#d9b36a" stroke-width="${f(1.4 * s)}" stroke-linecap="round"/>`;
      out += S.glow(tx, y - 26 * s, 6 * s, S.p.glow, 0.7);
      break;
    }
    case 'lantern':
      out += `<line x1="${f(x + w * 0.6)}" y1="${f(y + 8 * s)}" x2="${f(x + w * 1.1)}" y2="${f(y + 20 * s)}" stroke="${bell}" stroke-width="${f(1 * s)}"/>`;
      out += S.sun(x + w * 1.15, y + 24 * s, 3 * s, S.p.glow);
      break;
  }
  return out;
}

interface IxOpts {
  cap?: string;
  /** Branches of the hive. */
  arms?: number;
  item?: 'spores' | 'pods' | 'none';
  crown?: boolean;
  tall?: number;
}

/** An Ixquor: a walking fungal hive, a branching stalk with glowing caps and pulsing nodes. */
function ixquor(S: Scene, x: number, y: number, s: number, o: IxOpts = {}): string {
  const cap = o.cap ?? S.p.glow;
  const t = (o.tall ?? 1) * s;
  let out = S.glow(x, y - 4 * t, 30 * s, cap, 0.3);
  // Root-legs.
  for (const k of [-1, -0.4, 0.4, 1]) out += `<path d="M${f(x + k * 3 * s)} ${f(y + 6 * t)} q${f(k * 6 * s)} ${f(8 * t)} ${f(k * 12 * s)} ${f(14 * t)}" fill="none" stroke="#cbb8e6" stroke-width="${f(1.6 * s)}" stroke-linecap="round" stroke-opacity="0.85"/>`;
  // The trunk.
  out += `<path d="M${f(x - 5 * s)} ${f(y + 8 * t)} Q${f(x - 7 * s)} ${f(y - 8 * t)} ${f(x - 2 * s)} ${f(y - 22 * t)} L${f(x + 2 * s)} ${f(y - 22 * t)} Q${f(x + 7 * s)} ${f(y - 8 * t)} ${f(x + 5 * s)} ${f(y + 8 * t)} Z" fill="${S.linear([[0, '#efe6ff'], [1, S.p.deep]], 0, 0, 1, 0)}"/>`;
  // Branches with caps and nodes.
  const arms = o.arms ?? 4;
  for (let i = 0; i < arms; i++) {
    const side = i % 2 ? 1 : -1;
    const by = y - (6 + i * 5) * t;
    const ex = x + side * (12 + (i % 3) * 3) * s, ey = by - 8 * t;
    out += `<path d="M${f(x)} ${f(by)} Q${f(x + side * 6 * s)} ${f(by - 1 * t)} ${f(ex)} ${f(ey)}" fill="none" stroke="#dccff0" stroke-width="${f(1.5 * s)}" stroke-linecap="round"/>`;
    out += S.mushroom(ex, ey + 1 * t, 2 * t, 9 * s, i % 2 ? cap : S.p.accent, side * 1.5 * s);
  }
  out += S.mushroom(x, y - 20 * t, 4 * t, 16 * s, cap, 0);
  // Pulsing nodes down the trunk (its eyes).
  for (let i = 0; i < 3; i++) {
    out += S.glow(x, y - i * 7 * t, 4 * s, cap, 0.8);
    out += `<circle cx="${f(x)}" cy="${f(y - i * 7 * t)}" r="${f(1.3 * s)}" fill="#fff"/>`;
  }
  if (o.crown) {
    for (let i = -3; i <= 3; i++) out += S.mushroom(x + i * 5 * s, y - 30 * t - (3 - Math.abs(i)) * 2 * t, 3 * t, 6 * s, i % 2 ? S.p.accent : '#fff3c4', i * s);
    out += S.glow(x, y - 36 * t, 14 * s, '#fff3c4', 0.5);
  }
  switch (o.item) {
    case 'spores':
      out += S.motes(x + 18 * s, y - 20 * t, 22, 16 * s, cap, 1.3 * s);
      break;
    case 'pods':
      for (let i = 0; i < 3; i++) {
        const px = x + (15 + i * 5) * s, py = y + (2 - i * 4) * t;
        out += `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(3 * s)}" ry="${f(4 * s)}" fill="${S.radial([[0, '#ffffff'], [0.5, S.p.accent], [1, S.p.deep]], 0.4, 0.35, 0.7)}"/>`;
        out += S.glow(px, py, 5 * s, S.p.accent, 0.4);
      }
      break;
  }
  return out;
}

/** A tongue of flame, its base at (x, y) and its tip h above (below, for negative h), white-hot at the base. */
function tongue(S: Scene, x: number, y: number, h: number, w: number, lean = 0, c = S.p.accent, a = 1): string {
  const tx = x + lean, ty = y - h, d = Math.sign(h) || 1;
  const fill = d > 0 ? S.linear([[0, c, 0.2], [0.45, c, 0.9], [1, '#fff3c4', 0.95]]) : S.linear([[0, '#fff3c4', 0.95], [0.55, c, 0.9], [1, c, 0.2]]);
  return `<path d="M${f(x - w / 2)} ${f(y)} C${f(x - w * 0.6)} ${f(y - h * 0.45)} ${f(tx - w * 0.2)} ${f(y - h * 0.72)} ${f(tx)} ${f(ty)} C${f(tx + w * 0.3)} ${f(y - h * 0.62)} ${f(x + w * 0.62)} ${f(y - h * 0.4)} ${f(x + w / 2)} ${f(y)} Q${f(x)} ${f(y + w * 0.35 * d)} ${f(x - w / 2)} ${f(y)} Z" fill="${fill}" opacity="${a}"/>`;
}

/** A flame in three layers: red outside, orange, a yellow heart. */
function blaze(S: Scene, x: number, y: number, h: number, w: number, lean = 0, outer = '#e8301a'): string {
  return tongue(S, x, y, h, w, lean, outer) + tongue(S, x, y, h * 0.72, w * 0.68, lean * 0.7, '#ff8a1e') + tongue(S, x, y, h * 0.42, w * 0.4, lean * 0.4, '#ffe27a');
}

/** A crescent moon of radius r, lit on its left before rotating by rot degrees. */
function crescent(S: Scene, x: number, y: number, r: number, rot = 0, c = '#f4f7ff', k = 0.55): string {
  return `<path d="M${f(x)} ${f(y - r)} A${f(r)} ${f(r)} 0 1 0 ${f(x)} ${f(y + r)} A${f(r * k)} ${f(r)} 0 1 1 ${f(x)} ${f(y - r)} Z" transform="rotate(${f(rot)} ${f(x)} ${f(y)})" fill="${S.linear([[0, '#ffffff'], [1, c]], 0, 0, 1, 1)}"/>`;
}

/** An eclipse: a black disc rimmed in a corona of pale light. */
function eclipse(S: Scene, x: number, y: number, r: number, c = '#f0e8ff'): string {
  return S.glow(x, y, r * 2.6, c, 0.6) + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 1.08)}" fill="${c}" opacity="0.9"/><circle cx="${f(x + r * 0.06)}" cy="${f(y + r * 0.04)}" r="${f(r)}" fill="${S.radial([[0, '#000000'], [0.85, '#07050f'], [1, '#1a1430']])}"/>`;
}

/** An anvil standing on the ground at (x, y) (its foot), w wide. */
function anvil(S: Scene, x: number, y: number, w: number, hot = true): string {
  const u = w / 30;
  let out = `<path d="M${f(x - 15 * u)} ${f(y - 16 * u)} H${f(x + 9 * u)} Q${f(x + 16 * u)} ${f(y - 16 * u)} ${f(x + 19 * u)} ${f(y - 19 * u)} Q${f(x + 15 * u)} ${f(y - 11 * u)} ${f(x + 6 * u)} ${f(y - 10 * u)} L${f(x + 4 * u)} ${f(y - 5 * u)} H${f(x + 9 * u)} V${f(y)} H${f(x - 11 * u)} V${f(y - 5 * u)} H${f(x - 6 * u)} L${f(x - 8 * u)} ${f(y - 10 * u)} Q${f(x - 13 * u)} ${f(y - 11 * u)} ${f(x - 15 * u)} ${f(y - 16 * u)} Z" fill="${S.linear([[0, '#d4d8e2'], [0.3, '#7a7f8c'], [1, '#202128']])}" stroke="#121216" stroke-width="${f(0.5 * u)}"/>`;
  out += `<path d="M${f(x - 14 * u)} ${f(y - 16 * u)} H${f(x + 9 * u)}" stroke="#fff" stroke-width="${f(0.6 * u)}" stroke-opacity="0.7"/>`;
  if (hot) out += S.glow(x - 2 * u, y - 18 * u, 8 * u, '#ffa040', 0.9) + `<rect x="${f(x - 7 * u)}" y="${f(y - 19 * u)}" width="${f(10 * u)}" height="${f(3 * u)}" rx="${f(0.8 * u)}" fill="${S.linear([[0, '#fff3c4'], [1, '#ff6a1a']])}"/>`;
  return out;
}

interface NyxOpts {
  /** Cloak colour (a shade of ink). */
  cloak?: string;
  eye?: string;
  item?: 'blades' | 'veil' | 'scythe' | 'lantern' | 'orb' | 'none';
  /** An eclipse behind the head and a crown of shadow thorns. */
  crown?: boolean;
  /** A pale silver mask in the hood. */
  mask?: boolean;
  lean?: number;
  wisps?: number;
}

/** A Nyxari: a tall hooded void-stalker, a cloak of ink fraying into smoke, slit eyes of pale light in an empty hood. */
function nyxari(S: Scene, x: number, y: number, s: number, o: NyxOpts = {}): string {
  const cloak = o.cloak ?? '#1d1838';
  const eye = o.eye ?? S.p.glow;
  const rim = S.p.accent;
  const lean = (o.lean ?? 0) * s;
  let out = S.glow(x, y + 16 * s, 38 * s, rim, 0.34);
  if (o.crown) {
    out += eclipse(S, x + 1 * s, y - 6 * s, 12 * s, '#efe6ff');
    for (let i = -3; i <= 3; i++) {
      const a = -Math.PI / 2 + i * 0.3, r1 = 9 * s, r2 = (23 - Math.abs(i) * 2.2) * s;
      out += `<polygon points="${f(x + Math.cos(a - 0.1) * r1)},${f(y - 4 * s + Math.sin(a - 0.1) * r1)} ${f(x + Math.cos(a) * r2)},${f(y - 4 * s + Math.sin(a) * r2)} ${f(x + Math.cos(a + 0.1) * r1)},${f(y - 4 * s + Math.sin(a + 0.1) * r1)}" fill="#0b0918" stroke="#efe6ff" stroke-width="${f(0.6 * s)}" stroke-opacity="0.9"/>`;
    }
  }
  const hand: [number, number] = [x + 16 * s, y + 15 * s];
  const left: [number, number] = [x - 16 * s, y + 17 * s];
  if (o.item === 'veil') {
    // A veil spread wide behind, held up by both hands, falling to the ground.
    out += `<path d="M${f(left[0])} ${f(left[1])} C${f(x - 26 * s)} ${f(y - 18 * s)} ${f(x + 26 * s)} ${f(y - 18 * s)} ${f(hand[0])} ${f(hand[1])} C${f(hand[0] + 12 * s)} ${f(y + 26 * s)} ${f(x + 30 * s)} ${f(y + 40 * s)} ${f(x + 26 * s)} ${f(y + 46 * s)} L${f(x - 26 * s)} ${f(y + 46 * s)} C${f(x - 30 * s)} ${f(y + 40 * s)} ${f(left[0] - 12 * s)} ${f(y + 26 * s)} ${f(left[0])} ${f(left[1])} Z" fill="${S.linear([[0, rim, 0.42], [1, rim, 0.05]])}" stroke="#e8e0ff" stroke-width="${f(0.6 * s)}" stroke-opacity="0.7"/>`;
    for (const k of [-1, -0.5, 0.5, 1]) out += `<path d="M${f(x + k * 14 * s)} ${f(y - 9 * s)} Q${f(x + k * 30 * s)} ${f(y + 14 * s)} ${f(x + k * 24 * s)} ${f(y + 45 * s)}" fill="none" stroke="#fff" stroke-width="${f(0.4 * s)}" stroke-opacity="0.35"/>`;
  }
  // Smoke fraying from the hem.
  const wisps = o.wisps ?? 4;
  for (let i = 0; i < wisps; i++) {
    const wx = x - 14 * s + lean + (i * 28 * s) / Math.max(1, wisps - 1);
    const dir = i % 2 ? 1 : -1;
    out += `<path d="M${f(wx)} ${f(y + 38 * s)} q${f(dir * 7 * s)} ${f(2 * s)} ${f(dir * 11 * s)} ${f(5 * s)} t${f(dir * 10 * s)} ${f(-1 * s)}" fill="none" stroke="${rim}" stroke-width="${f(1.4 * s)}" stroke-linecap="round" stroke-opacity="0.22"/>`;
  }
  // The cloak, its hem torn into points.
  let hem = '';
  for (let i = 1; i <= 6; i++) hem += ` L${f(x - 18 * s + (i * 36 * s) / 6 + lean)} ${f(y + (i % 2 ? 35 : 42) * s)}`;
  out += `<path d="M${f(x - 8 * s)} ${f(y + 4 * s)} C${f(x - 13 * s)} ${f(y + 12 * s)} ${f(x - 18 * s + lean * 0.5)} ${f(y + 26 * s)} ${f(x - 18 * s + lean)} ${f(y + 42 * s)}${hem} C${f(x + 18 * s + lean * 0.5)} ${f(y + 26 * s)} ${f(x + 13 * s)} ${f(y + 12 * s)} ${f(x + 8 * s)} ${f(y + 4 * s)} Z" fill="${S.linear([[0, cloak], [0.75, cloak, 0.95], [1, cloak, 0.3]])}" stroke="${rim}" stroke-width="${f(0.6 * s)}" stroke-opacity="0.75"/>`;
  out += `<path d="M${f(x)} ${f(y + 8 * s)} L${f(x - 3.5 * s + lean)} ${f(y + 38 * s)} L${f(x + 3.5 * s + lean)} ${f(y + 38 * s)} Z" fill="#07060f" opacity="0.85"/>`;
  for (const k of [-1, 1]) out += `<path d="M${f(x + k * 4 * s)} ${f(y + 9 * s)} Q${f(x + k * 9 * s)} ${f(y + 22 * s)} ${f(x + k * 10 * s + lean)} ${f(y + 37 * s)}" fill="none" stroke="${rim}" stroke-width="${f(0.5 * s)}" stroke-opacity="0.35"/>`;
  // Sleeves reaching to the hands.
  if (o.item && o.item !== 'none') {
    out += `<path d="M${f(x + 6 * s)} ${f(y + 6 * s)} Q${f(x + 12 * s)} ${f(y + 8 * s)} ${f(hand[0])} ${f(hand[1] - 1.5 * s)} L${f(hand[0] - 1 * s)} ${f(hand[1] + 2.5 * s)} Q${f(x + 9 * s)} ${f(y + 16 * s)} ${f(x + 6 * s)} ${f(y + 14 * s)} Z" fill="${cloak}" stroke="${rim}" stroke-width="${f(0.5 * s)}" stroke-opacity="0.7"/>`;
    out += `<path d="M${f(x - 6 * s)} ${f(y + 6 * s)} Q${f(x - 12 * s)} ${f(y + 9 * s)} ${f(left[0])} ${f(left[1] - 1.5 * s)} L${f(left[0] + 1 * s)} ${f(left[1] + 2.5 * s)} Q${f(x - 9 * s)} ${f(y + 17 * s)} ${f(x - 6 * s)} ${f(y + 15 * s)} Z" fill="${cloak}" stroke="${rim}" stroke-width="${f(0.5 * s)}" stroke-opacity="0.7"/>`;
    for (const [hx, hy] of [hand, left]) out += `<circle cx="${f(hx)}" cy="${f(hy + 0.5 * s)}" r="${f(1.3 * s)}" fill="#b8b0d8"/>`;
  }
  // The hood, pointed and swept back, and the emptiness inside it.
  out += `<path d="M${f(x - 10 * s)} ${f(y + 6 * s)} C${f(x - 11 * s)} ${f(y - 4 * s)} ${f(x - 8 * s)} ${f(y - 11 * s)} ${f(x - 4 * s - lean * 0.3)} ${f(y - 15 * s)} C${f(x + 4 * s)} ${f(y - 10 * s)} ${f(x + 10 * s)} ${f(y - 4 * s)} ${f(x + 10 * s)} ${f(y + 6 * s)} Q${f(x)} ${f(y + 9 * s)} ${f(x - 10 * s)} ${f(y + 6 * s)} Z" fill="${S.linear([[0, '#2c2654'], [1, cloak]], 0, 0, 1, 1)}" stroke="${rim}" stroke-width="${f(0.7 * s)}" stroke-opacity="0.9"/>`;
  out += `<ellipse cx="${f(x + 0.5 * s)}" cy="${f(y + 1 * s)}" rx="${f(5 * s)}" ry="${f(6 * s)}" fill="${S.radial([[0, '#000000'], [0.8, '#05040c'], [1, cloak]])}"/>`;
  if (o.mask) out += `<path d="M${f(x - 3.8 * s)} ${f(y - 3 * s)} Q${f(x + 0.5 * s)} ${f(y - 6 * s)} ${f(x + 4.8 * s)} ${f(y - 3 * s)} L${f(x + 3.4 * s)} ${f(y + 4 * s)} Q${f(x + 0.5 * s)} ${f(y + 7.5 * s)} ${f(x - 2.4 * s)} ${f(y + 4 * s)} Z" fill="${S.linear([[0, '#f6f2ff'], [1, '#8a80b8']], 0, 0, 1, 1)}"/>`;
  out += S.glow(x + 0.5 * s, y, 5 * s, eye, 0.5);
  for (const k of [-1, 1]) out += `<path d="M${f(x + 0.5 * s + k * 0.9 * s)} ${f(y + 0.4 * s)} L${f(x + 0.5 * s + k * 3.6 * s)} ${f(y - 1.4 * s)} L${f(x + 0.5 * s + k * 3.2 * s)} ${f(y + 0.5 * s)} Z" fill="${o.mask ? S.p.deep : eye}"/>`;
  if (o.mask) for (const k of [-1, 1]) out += `<circle cx="${f(x + 0.5 * s + k * 2.4 * s)}" cy="${f(y - 0.3 * s)}" r="${f(0.6 * s)}" fill="${eye}"/>`;
  out += `<path d="M${f(x)} ${f(y + 6.5 * s)} l${f(1.4 * s)} ${f(1.4 * s)} l${f(-1.4 * s)} ${f(1.4 * s)} l${f(-1.4 * s)} ${f(-1.4 * s)} Z" fill="#e8e0ff"/>`;
  switch (o.item) {
    case 'blades':
      for (const [[hx, hy], k] of [[hand, 1], [left, -1]] as [[number, number], number][]) {
        out += S.glow(hx + k * 8 * s, hy - 12 * s, 10 * s, rim, 0.5);
        out += `<path d="M${f(hx)} ${f(hy)} C${f(hx + k * 10 * s)} ${f(hy - 4 * s)} ${f(hx + k * 14 * s)} ${f(hy - 16 * s)} ${f(hx + k * 8 * s)} ${f(hy - 26 * s)} C${f(hx + k * 10 * s)} ${f(hy - 14 * s)} ${f(hx + k * 6 * s)} ${f(hy - 6 * s)} ${f(hx)} ${f(hy)} Z" fill="${S.linear([[0, '#ffffff'], [0.6, '#c8bcff'], [1, '#5a4c9a']], 0, 0, 1, 1)}" stroke="#fff" stroke-width="${f(0.4 * s)}"/>`;
      }
      break;
    case 'scythe': {
      const [bx, by, tx, ty] = [hand[0] - 7 * s, hand[1] + 24 * s, hand[0] + 5 * s, hand[1] - 28 * s];
      out += `<line x1="${f(bx)}" y1="${f(by)}" x2="${f(tx)}" y2="${f(ty)}" stroke="#2a2440" stroke-width="${f(1.8 * s)}" stroke-linecap="round"/><line x1="${f(bx)}" y1="${f(by)}" x2="${f(tx)}" y2="${f(ty)}" stroke="${rim}" stroke-width="${f(0.5 * s)}" stroke-opacity="0.6"/>`;
      out += S.glow(tx - 12 * s, ty + 4 * s, 14 * s, rim, 0.45);
      out += `<path d="M${f(tx)} ${f(ty)} Q${f(tx - 14 * s)} ${f(ty - 4 * s)} ${f(tx - 26 * s)} ${f(ty + 9 * s)} Q${f(tx - 13 * s)} ${f(ty + 1 * s)} ${f(tx + 0.5 * s)} ${f(ty + 4 * s)} Z" fill="${S.linear([[0, '#ffffff'], [1, '#8a7cd0']], 0, 0, 1, 1)}" stroke="#fff" stroke-width="${f(0.4 * s)}"/>`;
      break;
    }
    case 'lantern': {
      const [lx, ly] = [hand[0] + 1 * s, hand[1] + 9 * s];
      out += `<line x1="${f(hand[0])}" y1="${f(hand[1])}" x2="${f(lx)}" y2="${f(ly - 4 * s)}" stroke="#b8b0d8" stroke-width="${f(0.5 * s)}"/>`;
      out += S.glow(lx, ly, 12 * s, eye, 0.7) + `<path d="M${f(lx - 3 * s)} ${f(ly - 4 * s)} H${f(lx + 3 * s)} L${f(lx + 2.2 * s)} ${f(ly + 4 * s)} H${f(lx - 2.2 * s)} Z" fill="${eye}" fill-opacity="0.35" stroke="#e8e0ff" stroke-width="${f(0.5 * s)}"/>` + S.sun(lx, ly, 1.5 * s, eye);
      break;
    }
    case 'orb':
      out += eclipse(S, hand[0] + 1 * s, hand[1] - 5 * s, 4.5 * s, '#efe6ff');
      break;
  }
  return out;
}

interface KorOpts {
  /** Iron plate. */
  plate?: string;
  /** Bronze trim. */
  trim?: string;
  /** The forge-glow of visor and heart. */
  ember?: string;
  item?: 'hammer' | 'shield' | 'tongs' | 'none';
  crown?: boolean;
  horns?: boolean;
  beard?: boolean;
  cape?: string;
  bulk?: number;
}

/** A Korrath: a squat smith in iron plate, a T-slit visor and a forge-heart glowing through, a beard of hot braids. */
function korrath(S: Scene, x: number, y: number, s: number, o: KorOpts = {}): string {
  const plate = o.plate ?? '#8a8f9c';
  const trim = o.trim ?? '#c9893a';
  const ember = o.ember ?? S.p.glow;
  const b = o.bulk ?? 1;
  const iron = S.linear([[0, '#e4e8f0'], [0.35, plate], [1, '#24252c']], 0, 0, 1, 1);
  const bronze = S.linear([[0, '#ffe2a8'], [0.5, trim], [1, '#5a3412']], 0, 0, 1, 1);
  let out = S.glow(x, y + 18 * s, 36 * s, ember, 0.32);
  if (o.cape) out += `<path d="M${f(x - 12 * s * b)} ${f(y + 7 * s)} L${f(x - 19 * s * b)} ${f(y + 38 * s)} Q${f(x)} ${f(y + 41 * s)} ${f(x + 19 * s * b)} ${f(y + 38 * s)} L${f(x + 12 * s * b)} ${f(y + 7 * s)} Z" fill="${S.linear([[0, o.cape], [1, '#1a0a06']])}" stroke="${trim}" stroke-width="${f(0.6 * s)}"/>`;
  // Legs and boots.
  for (const k of [-1, 1]) {
    out += `<rect x="${f(x + k * 5.5 * s * b - 3.5 * s)}" y="${f(y + 27 * s)}" width="${f(7 * s)}" height="${f(9 * s)}" rx="${f(1.5 * s)}" fill="${iron}"/>`;
    out += `<rect x="${f(x + k * 5.5 * s * b - 4.8 * s + k * 0.8 * s)}" y="${f(y + 34.5 * s)}" width="${f(9.6 * s)}" height="${f(4 * s)}" rx="${f(1.4 * s)}" fill="#2a2420" stroke="${trim}" stroke-width="${f(0.5 * s)}"/>`;
  }
  // Arms (behind the pauldrons): thick plate, bronze fists.
  const hand: [number, number] = [x + 18 * s * b, y + 19 * s];
  const left: [number, number] = [x - 17 * s * b, y + 23 * s];
  for (const [hx, hy, k] of [[...hand, 1], [...left, -1]] as [number, number, number][]) {
    out += `<path d="M${f(x + k * 12 * s * b)} ${f(y + 9 * s)} Q${f(x + k * 17 * s * b)} ${f(y + 12 * s)} ${f(hx)} ${f(hy)}" fill="none" stroke="#24252c" stroke-width="${f(7 * s)}" stroke-linecap="round"/>`;
    out += `<path d="M${f(x + k * 12 * s * b)} ${f(y + 9 * s)} Q${f(x + k * 17 * s * b)} ${f(y + 12 * s)} ${f(hx)} ${f(hy)}" fill="none" stroke="${plate}" stroke-width="${f(5.4 * s)}" stroke-linecap="round"/>`;
    out += `<circle cx="${f(hx)}" cy="${f(hy)}" r="${f(3 * s)}" fill="${bronze}" stroke="#3a220c" stroke-width="${f(0.4 * s)}"/>`;
  }
  // The barrel of a body, banded, with the forge-heart in the chest.
  out += `<path d="M${f(x - 12 * s * b)} ${f(y + 7 * s)} Q${f(x - 16 * s * b)} ${f(y + 18 * s)} ${f(x - 11 * s * b)} ${f(y + 29 * s)} L${f(x + 11 * s * b)} ${f(y + 29 * s)} Q${f(x + 16 * s * b)} ${f(y + 18 * s)} ${f(x + 12 * s * b)} ${f(y + 7 * s)} Q${f(x)} ${f(y + 4 * s)} ${f(x - 12 * s * b)} ${f(y + 7 * s)} Z" fill="${iron}" stroke="#16161c" stroke-width="${f(0.5 * s)}"/>`;
  out += `<path d="M${f(x - 14 * s * b)} ${f(y + 13 * s)} Q${f(x)} ${f(y + 16 * s)} ${f(x + 14 * s * b)} ${f(y + 13 * s)}" fill="none" stroke="#2e2f38" stroke-width="${f(0.6 * s)}"/>`;
  out += `<path d="M${f(x - 13 * s * b)} ${f(y + 23 * s)} Q${f(x)} ${f(y + 26 * s)} ${f(x + 13 * s * b)} ${f(y + 23 * s)} L${f(x + 12 * s * b)} ${f(y + 26.5 * s)} Q${f(x)} ${f(y + 29.5 * s)} ${f(x - 12 * s * b)} ${f(y + 26.5 * s)} Z" fill="${bronze}"/>`;
  out += S.glow(x, y + 25.5 * s, 4 * s, ember, 0.9) + `<rect x="${f(x - 2 * s)}" y="${f(y + 24 * s)}" width="${f(4 * s)}" height="${f(3.2 * s)}" rx="${f(0.6 * s)}" fill="#ffe0a0"/>`;
  out += S.glow(x, y + 17 * s, 8 * s, ember, 0.9);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    out += `<line x1="${f(x + Math.cos(a) * 2.4 * s)}" y1="${f(y + 17 * s + Math.sin(a) * 2.4 * s)}" x2="${f(x + Math.cos(a) * 5.5 * s)}" y2="${f(y + 17 * s + Math.sin(a) * 5.5 * s)}" stroke="${ember}" stroke-width="${f(0.7 * s)}"/>`;
  }
  out += `<circle cx="${f(x)}" cy="${f(y + 17 * s)}" r="${f(2.4 * s)}" fill="${S.radial([[0, '#ffffff'], [0.5, '#ffe0a0'], [1, ember]])}"/>`;
  // Pauldrons.
  for (const k of [-1, 1]) {
    out += `<path d="M${f(x + k * 5 * s * b)} ${f(y + 6 * s)} Q${f(x + k * 12 * s * b)} ${f(y + 0.5 * s)} ${f(x + k * 19 * s * b)} ${f(y + 8 * s)} Q${f(x + k * 19.5 * s * b)} ${f(y + 13 * s)} ${f(x + k * 15 * s * b)} ${f(y + 14 * s)} Q${f(x + k * 11 * s * b)} ${f(y + 9 * s)} ${f(x + k * 5 * s * b)} ${f(y + 6 * s)} Z" fill="${bronze}" stroke="#3a220c" stroke-width="${f(0.4 * s)}"/>`;
    for (const t of [0.4, 0.75]) out += `<circle cx="${f(x + k * (8 + t * 9) * s * b)}" cy="${f(y + (4 + t * 4) * s)}" r="${f(0.6 * s)}" fill="#fff3c4"/>`;
  }
  // The beard: braids of hot metal, beaded with embers.
  if (o.beard !== false) {
    out += `<path d="M${f(x - 6.5 * s)} ${f(y + 3 * s)} Q${f(x - 7.5 * s)} ${f(y + 10 * s)} ${f(x - 3 * s)} ${f(y + 15 * s)} L${f(x)} ${f(y + 18 * s)} L${f(x + 3 * s)} ${f(y + 15 * s)} Q${f(x + 7.5 * s)} ${f(y + 10 * s)} ${f(x + 6.5 * s)} ${f(y + 3 * s)} Z" fill="${S.linear([[0, '#e8904a'], [1, '#6a2e12']])}"/>`;
    for (const k of [-3, 0, 3]) {
      out += `<path d="M${f(x + k * s)} ${f(y + 4 * s)} V${f(y + (k ? 14 : 17) * s)}" stroke="#4a1e0a" stroke-width="${f(0.5 * s)}" stroke-dasharray="${f(1.2 * s)} ${f(0.6 * s)}"/>`;
      out += S.glow(x + k * s, y + (k ? 14.6 : 17.6) * s, 2 * s, ember, 0.9) + `<circle cx="${f(x + k * s)}" cy="${f(y + (k ? 14.6 : 17.6) * s)}" r="${f(0.8 * s)}" fill="#ffe0a0"/>`;
    }
  }
  if (o.horns) for (const k of [-1, 1]) out += `<path d="M${f(x + k * 6.5 * s)} ${f(y - 5 * s)} Q${f(x + k * 15 * s)} ${f(y - 6 * s)} ${f(x + k * 14 * s)} ${f(y - 16 * s)} Q${f(x + k * 11 * s)} ${f(y - 9 * s)} ${f(x + k * 6 * s)} ${f(y - 9 * s)} Z" fill="${bronze}" stroke="#3a220c" stroke-width="${f(0.4 * s)}"/>`;
  // The helm, with its T-slit visor full of fire.
  out += `<path d="M${f(x - 7.5 * s)} ${f(y + 4 * s)} L${f(x - 7.5 * s)} ${f(y - 3 * s)} Q${f(x - 7.5 * s)} ${f(y - 11 * s)} ${f(x)} ${f(y - 11 * s)} Q${f(x + 7.5 * s)} ${f(y - 11 * s)} ${f(x + 7.5 * s)} ${f(y - 3 * s)} L${f(x + 7.5 * s)} ${f(y + 4 * s)} Q${f(x)} ${f(y + 6 * s)} ${f(x - 7.5 * s)} ${f(y + 4 * s)} Z" fill="${iron}" stroke="#16161c" stroke-width="${f(0.5 * s)}"/>`;
  out += `<path d="M${f(x - 7.6 * s)} ${f(y - 5 * s)} Q${f(x)} ${f(y - 6.6 * s)} ${f(x + 7.6 * s)} ${f(y - 5 * s)}" fill="none" stroke="${trim}" stroke-width="${f(1.3 * s)}"/>`;
  out += `<path d="M${f(x)} ${f(y - 11 * s)} V${f(y - 5.5 * s)}" stroke="${trim}" stroke-width="${f(1.4 * s)}"/>`;
  out += S.glow(x, y - 1 * s, 8 * s, ember, 0.65) + `<path d="M${f(x - 5.4 * s)} ${f(y - 2 * s)} H${f(x + 5.4 * s)} M${f(x)} ${f(y - 2 * s)} V${f(y + 3 * s)}" stroke="#ffe8b0" stroke-width="${f(1.4 * s)}" stroke-linecap="round"/>`;
  if (o.crown) {
    out += S.glow(x, y - 13 * s, 10 * s, ember, 0.6);
    out += `<path d="M${f(x - 8 * s)} ${f(y - 8 * s)} L${f(x - 8.5 * s)} ${f(y - 15 * s)} L${f(x - 5 * s)} ${f(y - 11 * s)} L${f(x - 2.5 * s)} ${f(y - 17 * s)} L${f(x)} ${f(y - 12 * s)} L${f(x + 2.5 * s)} ${f(y - 17 * s)} L${f(x + 5 * s)} ${f(y - 11 * s)} L${f(x + 8.5 * s)} ${f(y - 15 * s)} L${f(x + 8 * s)} ${f(y - 8 * s)} Q${f(x)} ${f(y - 10 * s)} ${f(x - 8 * s)} ${f(y - 8 * s)} Z" fill="${S.linear([[0, '#5a5c66'], [1, '#1c1c22']])}" stroke="${trim}" stroke-width="${f(0.5 * s)}"/>`;
    for (const k of [-8.5, -2.5, 2.5, 8.5]) out += S.glow(x + k * s, y - (Math.abs(k) > 5 ? 15 : 17) * s, 2.6 * s, '#ffe0a0', 0.95);
  }
  switch (o.item) {
    case 'hammer': {
      const [bx, by, tx, ty] = [hand[0] - 3 * s, hand[1] + 9 * s, hand[0] + 7 * s, hand[1] - 22 * s];
      out += `<line x1="${f(bx)}" y1="${f(by)}" x2="${f(tx)}" y2="${f(ty)}" stroke="#4a2e18" stroke-width="${f(2 * s)}" stroke-linecap="round"/>`;
      const ang = (Math.atan2(ty - by, tx - bx) * 180) / Math.PI;
      out += S.glow(tx - 3 * s, ty, 10 * s, ember, 0.7);
      out += `<g transform="rotate(${f(ang)} ${f(tx)} ${f(ty)})"><rect x="${f(tx - 4.5 * s)}" y="${f(ty - 8 * s)}" width="${f(9 * s)}" height="${f(16 * s)}" rx="${f(1.2 * s)}" fill="${iron}" stroke="#16161c" stroke-width="${f(0.5 * s)}"/><rect x="${f(tx - 4.5 * s)}" y="${f(ty - 8 * s)}" width="${f(9 * s)}" height="${f(2.6 * s)}" rx="${f(1 * s)}" fill="${S.linear([[0, '#fff3c4'], [1, ember]], 0, 0, 1, 0)}"/><rect x="${f(tx - 4.8 * s)}" y="${f(ty - 1 * s)}" width="${f(9.6 * s)}" height="${f(2 * s)}" fill="${bronze}"/></g>`;
      out += `<circle cx="${f(hand[0])}" cy="${f(hand[1])}" r="${f(3 * s)}" fill="${bronze}"/>`;
      break;
    }
    case 'shield': {
      const [sx, sy, w, h] = [x + 7 * s * b, y + 5 * s, 18 * s, 30 * s];
      out += `<path d="M${f(sx)} ${f(sy)} H${f(sx + w)} V${f(sy + h * 0.72)} Q${f(sx + w / 2)} ${f(sy + h * 1.08)} ${f(sx)} ${f(sy + h * 0.72)} Z" fill="${iron}" stroke="${trim}" stroke-width="${f(1.5 * s)}"/>`;
      out += `<path d="M${f(sx + w / 2)} ${f(sy + 2 * s)} V${f(sy + h * 0.86)} M${f(sx + 2 * s)} ${f(sy + h * 0.36)} H${f(sx + w - 2 * s)}" stroke="${trim}" stroke-width="${f(1 * s)}"/>`;
      out += S.glow(sx + w / 2, sy + h * 0.36, 6 * s, ember, 0.8) + `<circle cx="${f(sx + w / 2)}" cy="${f(sy + h * 0.36)}" r="${f(3 * s)}" fill="${bronze}" stroke="#3a220c" stroke-width="${f(0.4 * s)}"/>`;
      for (const [rx, ry] of [[1.6, 1.6], [w - 1.6 * s, 1.6], [1.6, h * 0.62], [w - 1.6 * s, h * 0.62]]) out += `<circle cx="${f(sx + (rx === 1.6 ? 1.8 * s : rx))}" cy="${f(sy + (ry === 1.6 ? 1.8 * s : ry))}" r="${f(0.6 * s)}" fill="#fff3c4"/>`;
      break;
    }
    case 'tongs': {
      const [tx, ty] = [hand[0] + 12 * s, hand[1] - 8 * s];
      out += `<path d="M${f(hand[0])} ${f(hand[1])} L${f(tx)} ${f(ty - 1.5 * s)} M${f(hand[0])} ${f(hand[1])} L${f(tx)} ${f(ty + 1.5 * s)}" stroke="#3a3a44" stroke-width="${f(1.1 * s)}" stroke-linecap="round"/>`;
      out += S.glow(tx + 3 * s, ty, 9 * s, ember, 0.9) + `<rect x="${f(tx)}" y="${f(ty - 2 * s)}" width="${f(8 * s)}" height="${f(4 * s)}" rx="${f(0.8 * s)}" fill="${S.linear([[0, '#ffffff'], [0.5, '#ffe0a0'], [1, ember]], 0, 0, 1, 0)}"/>`;
      out += S.motes(tx + 4 * s, ty - 4 * s, 8, 8 * s, '#ffe0a0', 0.6 * s);
      break;
    }
  }
  return out;
}

interface SerOpts {
  robe?: string;
  item?: 'orrery' | 'staff' | 'chart' | 'scope' | 'none';
  /** Little moons circling the figure. */
  moons?: number;
  /** A circlet of stars. */
  crown?: boolean;
  /** The crescent moon behind the head. */
  halo?: boolean;
}

/** A Seren: a tall, still astronomer in pale robes hemmed with night, a hood full of stars, a crescent moon behind. */
function seren(S: Scene, x: number, y: number, s: number, o: SerOpts = {}): string {
  const robe = o.robe ?? '#d6e0ff';
  const night = '#141c48';
  let out = S.glow(x, y + 14 * s, 36 * s, S.p.glow, 0.3);
  if (o.halo !== false) out += S.glow(x - 4 * s, y - 4 * s, 18 * s, '#ffffff', 0.35) + crescent(S, x + 2 * s, y - 2 * s, 16 * s, 32, '#e8eeff', 0.42);
  if (o.crown) {
    out += S.orbit(x, y - 13 * s, 12 * s, 3 * s, 0, '#ffffff', 0.7 * s, 0.7);
    for (let i = -2; i <= 2; i++) out += S.sun(x + i * 4.6 * s, y - 14 * s - (2 - Math.abs(i)) * 1.8 * s, (i ? 0.8 : 1.3) * s, '#e8f0ff', i ? 0 : 6);
  }
  const moons = o.moons ?? 0;
  if (moons) out += S.orbit(x, y + 18 * s, 26 * s, 7 * s, -8, '#e8f0ff', 0.6 * s, 0.45);
  const moonAt = (i: number) => {
    const a = Math.PI * (1.05 + (i / Math.max(1, moons)) * 2);
    return [x + Math.cos(a) * 26 * s, y + 18 * s + Math.sin(a) * 7 * s - Math.cos(a) * 3.6 * s, Math.sin(a)] as const;
  };
  for (let i = 0; i < moons; i++) {
    const [mx, my, z] = moonAt(i);
    if (z < 0) out += S.planet(mx, my, (1.8 + (i % 2)) * s, '#ffffff', '#8a9ad0');
  }
  // The robe, pale, flaring to a hem of night sewn with stars.
  out += `<path d="M${f(x - 7 * s)} ${f(y + 6 * s)} C${f(x - 10 * s)} ${f(y + 18 * s)} ${f(x - 14 * s)} ${f(y + 32 * s)} ${f(x - 16 * s)} ${f(y + 44 * s)} Q${f(x)} ${f(y + 47 * s)} ${f(x + 16 * s)} ${f(y + 44 * s)} C${f(x + 14 * s)} ${f(y + 32 * s)} ${f(x + 10 * s)} ${f(y + 18 * s)} ${f(x + 7 * s)} ${f(y + 6 * s)} Q${f(x)} ${f(y + 3 * s)} ${f(x - 7 * s)} ${f(y + 6 * s)} Z" fill="${S.linear([[0, '#ffffff'], [0.5, robe], [1, '#5a6cae']], 0, 0, 1, 1)}"/>`;
  out += `<path d="M${f(x - 14.4 * s)} ${f(y + 36 * s)} Q${f(x)} ${f(y + 39 * s)} ${f(x + 14.4 * s)} ${f(y + 36 * s)} L${f(x + 16 * s)} ${f(y + 44 * s)} Q${f(x)} ${f(y + 47 * s)} ${f(x - 16 * s)} ${f(y + 44 * s)} Z" fill="${night}"/>`;
  out += `<path d="M${f(x - 14.4 * s)} ${f(y + 36 * s)} Q${f(x)} ${f(y + 39 * s)} ${f(x + 14.4 * s)} ${f(y + 36 * s)}" fill="none" stroke="#e8eeff" stroke-width="${f(0.7 * s)}"/>`;
  const hemStars: [number, number][] = [[-11, 40.5], [-6, 42.6], [-1, 41], [4, 43], [9, 41.4], [12.5, 42.8]];
  out += `<polyline points="${hemStars.map(([dx, dy]) => `${f(x + dx * s)},${f(y + dy * s)}`).join(' ')}" fill="none" stroke="#c8d6ff" stroke-width="${f(0.35 * s)}" stroke-opacity="0.7"/>`;
  for (const [dx, dy] of hemStars) out += `<circle cx="${f(x + dx * s)}" cy="${f(y + dy * s)}" r="${f(0.55 * s)}" fill="#fff"/>`;
  for (const k of [-1, 1]) out += `<path d="M${f(x + k * 2.2 * s)} ${f(y + 7 * s)} L${f(x + k * 3.2 * s)} ${f(y + 37 * s)}" stroke="#9fb4ff" stroke-width="${f(0.8 * s)}"/>`;
  // Bell sleeves, the hands folded or holding.
  const hand: [number, number] = [x + 13 * s, y + 18 * s];
  for (const k of [-1, 1]) out += `<path d="M${f(x + k * 6 * s)} ${f(y + 7 * s)} Q${f(x + k * 11 * s)} ${f(y + 10 * s)} ${f(x + k * 15 * s)} ${f(y + 21 * s)} Q${f(x + k * 11 * s)} ${f(y + 23 * s)} ${f(x + k * 7.5 * s)} ${f(y + 21 * s)} Z" fill="${S.linear([[0, '#ffffff'], [1, robe]], 0, 0, 1, 1)}" stroke="#9fb4ff" stroke-width="${f(0.4 * s)}"/>`;
  // The hood, and the night sky where a face would be.
  out += `<path d="M${f(x - 7.5 * s)} ${f(y + 6 * s)} C${f(x - 9 * s)} ${f(y - 2 * s)} ${f(x - 7 * s)} ${f(y - 9.5 * s)} ${f(x)} ${f(y - 10 * s)} C${f(x + 7 * s)} ${f(y - 9.5 * s)} ${f(x + 9 * s)} ${f(y - 2 * s)} ${f(x + 7.5 * s)} ${f(y + 6 * s)} Q${f(x)} ${f(y + 8 * s)} ${f(x - 7.5 * s)} ${f(y + 6 * s)} Z" fill="${S.linear([[0, '#ffffff'], [1, robe]], 0, 0, 1, 1)}"/>`;
  out += `<ellipse cx="${f(x)}" cy="${f(y + 0.5 * s)}" rx="${f(4.4 * s)}" ry="${f(5.4 * s)}" fill="${S.radial([[0, '#2a3a80'], [1, '#070c24']], 0.5, 0.4, 0.6)}"/>`;
  for (const [dx, dy, r] of [[-2.2, 3.6, 0.35], [2.4, 3.2, 0.3], [0.4, 4.6, 0.25], [-0.6, -3.4, 0.3]]) out += `<circle cx="${f(x + dx * s)}" cy="${f(y + dy * s)}" r="${f(r * s)}" fill="#fff"/>`;
  for (const k of [-1, 1]) out += `<path d="M${f(x + k * 3 * s)} ${f(y)} Q${f(x + k * 1.9 * s)} ${f(y + 1.1 * s)} ${f(x + k * 0.8 * s)} ${f(y)}" fill="none" stroke="#e8f0ff" stroke-width="${f(0.6 * s)}" stroke-linecap="round"/>`;
  out += S.sun(x, y - 4.4 * s, 0.7 * s, '#e8f0ff', 4);
  for (let i = 0; i < moons; i++) {
    const [mx, my, z] = moonAt(i);
    if (z >= 0) out += S.planet(mx, my, (1.8 + (i % 2)) * s, '#ffffff', '#8a9ad0');
  }
  switch (o.item) {
    case 'orrery': {
      const [ox, oy] = [hand[0] + 5 * s, hand[1] - 6 * s];
      out += S.glow(ox, oy, 12 * s, S.p.glow, 0.6);
      [-22, 38, 96].forEach((rot, i) => {
        out += S.orbit(ox, oy, (7 + i * 1.2) * s, 2.6 * s, rot, i === 1 ? '#ffd98a' : '#e8f0ff', 0.6 * s, 0.9);
        const a = rot * 0.05 + i * 2;
        const px = Math.cos(a) * (7 + i * 1.2) * s, py = Math.sin(a) * 2.6 * s, r = (rot * Math.PI) / 180;
        out += S.planet(ox + px * Math.cos(r) - py * Math.sin(r), oy + px * Math.sin(r) + py * Math.cos(r), 1.1 * s, i === 1 ? '#ffe2a0' : '#bfd0ff', '#4a5a9a');
      });
      out += S.sun(ox, oy, 1.8 * s, '#fff3c4');
      out += `<line x1="${f(ox)}" y1="${f(oy + 4 * s)}" x2="${f(hand[0])}" y2="${f(hand[1] + 1 * s)}" stroke="#d9b36a" stroke-width="${f(0.7 * s)}"/>`;
      break;
    }
    case 'staff': {
      const tx = hand[0] + 2 * s, ty = y - 18 * s;
      out += `<line x1="${f(hand[0] - 1 * s)}" y1="${f(y + 44 * s)}" x2="${f(tx)}" y2="${f(ty)}" stroke="${S.linear([[0, '#ffffff'], [1, '#8a9ad0']], 0, 0, 1, 0)}" stroke-width="${f(1.1 * s)}" stroke-linecap="round"/>`;
      out += S.glow(tx, ty - 3 * s, 10 * s, '#ffffff', 0.5) + crescent(S, tx, ty - 3 * s, 5 * s, -90, '#e8eeff', 0.5) + S.sun(tx, ty - 4.6 * s, 1.3 * s, '#e8f0ff', 6);
      break;
    }
    case 'chart':
      out += `<rect x="${f(x - 13 * s)}" y="${f(y + 15 * s)}" width="${f(26 * s)}" height="${f(11 * s)}" rx="${f(0.8 * s)}" fill="${S.linear([[0, '#1d2a66'], [1, '#0b1238']])}" stroke="#e8eeff" stroke-width="${f(0.5 * s)}"/>`;
      for (const k of [-1, 1]) out += `<rect x="${f(x + k * 13.4 * s - 1.2 * s)}" y="${f(y + 14 * s)}" width="${f(2.4 * s)}" height="${f(13 * s)}" rx="${f(1.2 * s)}" fill="${S.linear([[0, '#fff3c4'], [1, '#9a7a3a']], 0, 0, 1, 0)}"/>`;
      out += `<polyline points="${f(x - 9 * s)},${f(y + 23 * s)} ${f(x - 4 * s)},${f(y + 18 * s)} ${f(x + 1 * s)},${f(y + 21 * s)} ${f(x + 6 * s)},${f(y + 17.5 * s)} ${f(x + 9 * s)},${f(y + 23 * s)}" fill="none" stroke="#c8d6ff" stroke-width="${f(0.4 * s)}"/>`;
      for (const [dx, dy] of [[-9, 23], [-4, 18], [1, 21], [6, 17.5], [9, 23]]) out += `<circle cx="${f(x + dx * s)}" cy="${f(y + dy * s)}" r="${f(0.6 * s)}" fill="#fff"/>`;
      break;
    case 'scope': {
      const [bx, by, tx, ty] = [hand[0] - 2 * s, hand[1] + 2 * s, hand[0] + 16 * s, hand[1] - 14 * s];
      out += `<line x1="${f(bx)}" y1="${f(by)}" x2="${f(tx)}" y2="${f(ty)}" stroke="#5a4320" stroke-width="${f(4.2 * s)}" stroke-linecap="round"/><line x1="${f(bx)}" y1="${f(by)}" x2="${f(tx)}" y2="${f(ty)}" stroke="#e8c47a" stroke-width="${f(3 * s)}" stroke-linecap="round"/>`;
      out += `<line x1="${f(bx + (tx - bx) * 0.35)}" y1="${f(by + (ty - by) * 0.35)}" x2="${f(bx + (tx - bx) * 0.4)}" y2="${f(by + (ty - by) * 0.4)}" stroke="#7a5a26" stroke-width="${f(3.4 * s)}"/>`;
      out += S.glow(tx, ty, 6 * s, '#ffffff', 0.9) + S.beam(tx, ty, tx + 16 * s, ty - 18 * s, 0.7 * s, '#e8f0ff');
      break;
    }
  }
  return out;
}

interface PyrOpts {
  /** The outer flame. */
  flame?: string;
  /** The white-hot heart. */
  core?: string;
  item?: 'fireball' | 'whip' | 'brand' | 'none';
  /** Plates of cooling magma rock over the body (the Cinderborn). */
  ember?: boolean;
  /** A corona of flame round the head. */
  crown?: boolean;
  /** Wings of fire. */
  wings?: boolean;
  pose?: 'stand' | 'dance' | 'cast';
  bulk?: number;
}

/** A Pyrr: a living flame shaped like a dancer, legs of fire, a mane of flame, eyes like coals. */
function pyrr(S: Scene, x: number, y: number, s: number, o: PyrOpts = {}): string {
  const fl = o.flame ?? '#ff3a1a';
  const mid = '#ff9a2a', core = o.core ?? '#ffe27a';
  const b = o.bulk ?? 1;
  const pose = o.pose ?? 'stand';
  let out = S.glow(x, y + 12 * s, 40 * s, fl, 0.42);
  if (o.wings) for (const k of [-1, 1]) for (let i = 0; i < 6; i++) out += tongue(S, x + k * 7 * s, y + 10 * s, (28 - i * 3) * s, 8 * s, k * (14 + i * 7) * s, i % 2 ? mid : fl, 0.9);
  if (o.crown) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      out += tongue(S, x + Math.cos(a) * 7 * s, y + Math.sin(a) * 7 * s, 9 * s, 4 * s, 0, i % 2 ? mid : fl, 0.9).replace('<path', `<path transform="rotate(${f((a * 180) / Math.PI + 90)} ${f(x + Math.cos(a) * 7 * s)} ${f(y + Math.sin(a) * 7 * s)})"`);
    }
    out += S.glow(x, y, 16 * s, core, 0.6);
  }
  // Legs: flames pointing down, mid-stride.
  for (const k of [-1, 1]) out += tongue(S, x + k * 4 * s * b, y + 21 * s, -19 * s, 7.5 * s * b, k * (pose === 'dance' ? 9 : 4) * s, fl) + tongue(S, x + k * 4 * s * b, y + 21 * s, -13 * s, 4.5 * s * b, k * (pose === 'dance' ? 7 : 3) * s, mid);
  // Arms: streams of fire.
  const hands: [number, number][] = pose === 'dance' ? [[x + 15 * s * b, y - 13 * s], [x - 15 * s * b, y - 11 * s]] : pose === 'cast' ? [[x + 21 * s * b, y + 6 * s], [x - 15 * s * b, y + 19 * s]] : [[x + 16 * s * b, y + 18 * s], [x - 16 * s * b, y + 18 * s]];
  hands.forEach(([hx, hy], i) => {
    const k = i ? -1 : 1, sx = x + k * 9 * s * b, sy = y + 6 * s;
    const cx = pose === 'dance' ? x + k * 18 * s * b : x + k * 15 * s * b, cy = pose === 'dance' ? y + 4 * s : y + 8 * s;
    const d = `M${f(sx)} ${f(sy)} Q${f(cx)} ${f(cy)} ${f(hx)} ${f(hy)}`;
    out += `<path d="${d}" fill="none" stroke="${fl}" stroke-width="${f(4.4 * s * b)}" stroke-linecap="round" stroke-opacity="0.85"/><path d="${d}" fill="none" stroke="${mid}" stroke-width="${f(2.6 * s * b)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${core}" stroke-width="${f(1 * s)}" stroke-linecap="round"/>`;
    out += tongue(S, hx, hy, 6 * s, 3.4 * s, k * 1.5 * s, mid) + S.glow(hx, hy, 4 * s, core, 0.9);
  });
  // The body: a flame turned on its head, white-hot within.
  out += `<path d="M${f(x - 11 * s * b)} ${f(y + 5 * s)} Q${f(x - 9 * s * b)} ${f(y + 18 * s)} ${f(x)} ${f(y + 27 * s)} Q${f(x + 9 * s * b)} ${f(y + 18 * s)} ${f(x + 11 * s * b)} ${f(y + 5 * s)} Q${f(x)} ${f(y + 1 * s)} ${f(x - 11 * s * b)} ${f(y + 5 * s)} Z" fill="${S.radial([[0, '#fffbe0'], [0.35, core], [0.7, mid], [1, fl]], 0.5, 0.35, 0.7)}"/>`;
  for (const k of [-1, 1]) out += tongue(S, x + k * 9 * s * b, y + 7 * s, 8 * s, 4 * s, k * 3 * s, fl, 0.9);
  out += tongue(S, x, y + 25 * s, 20 * s, 12 * s * b, 0, mid, 0.55) + tongue(S, x - 3 * s * b, y + 22 * s, 12 * s, 5 * s, -1 * s, fl, 0.5) + tongue(S, x + 3 * s * b, y + 22 * s, 12 * s, 5 * s, 1 * s, fl, 0.5);
  if (o.ember) {
    const rock = S.linear([[0, '#5a3a32'], [1, '#1a0c0a']], 0, 0, 1, 1);
    for (const k of [-1, 1]) out += `<path d="M${f(x + k * 3 * s)} ${f(y + 4 * s)} L${f(x + k * 11.5 * s * b)} ${f(y + 4.5 * s)} L${f(x + k * 10 * s * b)} ${f(y + 11 * s)} L${f(x + k * 4 * s)} ${f(y + 9 * s)} Z" fill="${rock}" stroke="${core}" stroke-width="${f(0.7 * s)}" stroke-linejoin="round"/>`;
    out += `<path d="M${f(x - 5 * s * b)} ${f(y + 12 * s)} L${f(x + 5 * s * b)} ${f(y + 12 * s)} L${f(x + 3 * s)} ${f(y + 19 * s)} L${f(x - 3 * s)} ${f(y + 19 * s)} Z" fill="${rock}" stroke="${core}" stroke-width="${f(0.7 * s)}" stroke-linejoin="round"/>`;
    out += `<path d="M${f(x - 2 * s)} ${f(y + 12.4 * s)} L${f(x)} ${f(y + 15.5 * s)} L${f(x + 2.5 * s)} ${f(y + 14 * s)}" fill="none" stroke="${core}" stroke-width="${f(0.5 * s)}"/>`;
  }
  // The mane: flames streaming up and back.
  [[-5, 14, -5], [-2.5, 19, -3], [0, 22, -1], [2.5, 18, 1], [5, 13, 3]].forEach(([dx, h, l]) => (out += blaze(S, x + dx * s, y - 2 * s, h * s, 6 * s, l * s, fl)));
  // The head and its coal eyes.
  out += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(6 * s)}" ry="${f(6.6 * s)}" fill="${S.radial([[0, '#ffffff'], [0.45, core], [1, mid]], 0.45, 0.4, 0.65)}"/>`;
  for (const k of [-1, 1]) out += `<path d="M${f(x + k * 0.9 * s)} ${f(y + 0.6 * s)} Q${f(x + k * 2.6 * s)} ${f(y - 1.6 * s)} ${f(x + k * 4.2 * s)} ${f(y - 1.2 * s)} Q${f(x + k * 3 * s)} ${f(y + 1.4 * s)} ${f(x + k * 0.9 * s)} ${f(y + 0.6 * s)} Z" fill="#4a0800"/>`;
  out += S.motes(x, y - 14 * s, 10, 22 * s, core, 0.8 * s);
  const [hx, hy] = hands[0];
  switch (o.item) {
    case 'fireball':
      out += S.sun(hx + 2 * s, hy - 3 * s, 3.6 * s, mid, 10);
      break;
    case 'whip': {
      const d = `M${f(hx)} ${f(hy)} C${f(hx + 14 * s)} ${f(hy - 16 * s)} ${f(hx + 2 * s)} ${f(hy - 26 * s)} ${f(hx + 16 * s)} ${f(hy - 34 * s)} S${f(hx + 30 * s)} ${f(hy - 30 * s)} ${f(hx + 28 * s)} ${f(hy - 42 * s)}`;
      out += `<path d="${d}" fill="none" stroke="${fl}" stroke-width="${f(3 * s)}" stroke-linecap="round" stroke-opacity="0.7"/><path d="${d}" fill="none" stroke="${core}" stroke-width="${f(1.1 * s)}" stroke-linecap="round"/>` + S.glow(hx + 28 * s, hy - 42 * s, 5 * s, core, 0.9);
      break;
    }
    case 'brand':
      out += S.glow(hx + 6 * s, hy - 14 * s, 12 * s, mid, 0.6) + `<path d="M${f(hx - 1 * s)} ${f(hy + 1 * s)} L${f(hx + 12 * s)} ${f(hy - 26 * s)} L${f(hx + 14 * s)} ${f(hy - 22 * s)} L${f(hx + 2 * s)} ${f(hy + 2 * s)} Z" fill="${S.linear([[0, '#fff3c4'], [0.5, core], [1, fl]], 0, 1, 1, 0)}" stroke="#fff" stroke-width="${f(0.4 * s)}"/>`;
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Every card's picture
// ---------------------------------------------------------------------------

type Draw = (S: Scene) => string;

const ART: Record<string, Draw> = {
  // ---- Neutral attack ----
  coronal_lance: (S) => S.planet(132, 66, 20, '#e8a07a', '#6a2a2a') + S.beam(8, 20, 124, 62, 3.4) + S.glow(124, 62, 16, '#fff', 0.9),
  plasma_relay: (S) => S.sun(24, 50, 8) + [48, 80, 112].map((x, i) => S.panel(x - 5, 42 - i * 3, 10, 16 + i * 3) + S.glow(x, 50 - i * 3, 7, S.p.accent, 0.8)).join('') + `<path d="M32 50 C44 38 52 62 64 50 S84 36 96 47 S116 58 132 44" fill="none" stroke="#fff" stroke-width="1.6"/>` + S.glow(138, 42, 10, '#fff', 0.9),
  gravity_sling: (S) => S.planet(62, 58, 20, '#9ac0e8', '#2a4a7a') + `<path d="M20 90 C30 30 110 20 122 52 C130 72 112 84 100 78" fill="none" stroke="${S.p.accent}" stroke-width="1.4" stroke-dasharray="3 3"/>` + S.sun(100, 78, 3.6, S.p.glow) + S.beam(100, 78, 150, 20, 1.6),
  thermal_exchange: (S) => S.sun(48, 50, 16, '#ffb070', 10) + S.sun(116, 50, 13, '#9fd0ff', 0) + `<path d="M66 40 Q82 30 98 40" fill="none" stroke="#ffe0a0" stroke-width="2"/><polygon points="98,40 92,36 93,43" fill="#ffe0a0"/><path d="M98 62 Q82 72 66 62" fill="none" stroke="#bfe6ff" stroke-width="2"/><polygon points="66,62 72,66 71,59" fill="#bfe6ff"/>`,
  solar_battery: (S) => S.panel(40, 30, 72, 42, 5) + S.panel(112, 42, 6, 18, 1) + [52, 70, 88].map((x) => `<rect x="${x}" y="37" width="12" height="28" rx="2" fill="${S.linear([[0, '#fff3c4'], [1, '#ff9a3a']])}"/>` + S.glow(x + 6, 51, 10, S.p.glow, 0.7)).join('') + S.bolt(10, 20, 40, 50, '#ffe0a0'),
  ion_cannon: (S) => S.planet(40, 60, 26, '#b8c4d8', '#303848') + S.panel(56, 48, 46, 14, 3) + S.panel(44, 44, 18, 22, 4) + S.beam(100, 55, 160, 30, 3, '#9fd0ff') + S.glow(100, 55, 10, '#dff2ff', 1),
  tractor_beam: (S) => S.panel(12, 38, 26, 22, 6) + `<polygon points="38,44 150,18 150,86 38,56" fill="${S.linear([[0, '#9fd0ff', 0.55], [1, '#9fd0ff', 0.05]], 0, 0, 1, 0)}"/>` + S.card(120, 52, -12, '#e08a5a', 20) + S.rings(40, 50, 4, 3, 4, '#dff2ff'),
  command_breaker: (S) => S.panel(52, 26, 56, 52, 6) + `<path d="M72 30 L84 50 L76 54 L90 78" fill="none" stroke="#fff" stroke-width="2.4"/>` + S.bolt(64, 20, 96, 84, '#ffb070', 6, 1.4) + S.motes(80, 52, 16, 36, '#ffe0a0'),
  event_horizon: (S) => S.glow(80, 52, 60, '#c79ae8', 0.5) + S.orbit(80, 52, 56, 12, -10, '#ffd98a', 3, 0.9) + `<circle cx="80" cy="52" r="15" fill="#05030a"/>` + S.orbit(80, 52, 22, 22, 0, '#fff', 1, 0.6) + `<path d="M24 58 A56 12 -10 0 0 136 46" fill="none" stroke="#ffe7a8" stroke-width="3.4" transform="rotate(-10 80 52)"/>`,
  entropy_pulse: (S) => S.card(80, 52, 0, '#c8a0e8', 30) + S.rings(80, 52, 22, 4, 8, '#e0b0ff', 0.8) + S.motes(80, 52, 30, 50, '#f0d0ff', 1.2),
  decay_wave: (S) => [30, 62, 94, 126].map((x, i) => S.card(x, 56 + (i % 2) * 4, (i - 1.5) * 6, '#a08bcb', 20)).join('') + S.waves(28, '#f0d0ff', 5, 3, 0.7),
  // ---- Neutral defence ----
  coolant_array: (S) => [40, 64, 88, 112].map((x) => `<rect x="${x}" y="22" width="12" height="60" rx="6" fill="${S.linear([[0, '#ffffff'], [1, '#5aa0e0']], 0, 0, 1, 0)}"/>` + S.glow(x + 6, 30, 7, '#dff2ff', 0.8)).join('') + S.motes(80, 70, 20, 60, '#dff2ff', 1),
  cryo_vault: (S) => S.hex(80, 52, 32, S.linear([[0, '#ffffff', 0.9], [1, '#5aa0e0', 0.5]]), '#fff') + S.hex(80, 52, 18, S.radial([[0, '#ffffff'], [1, '#9fd0ff']]), '#fff') + S.glow(80, 52, 30, '#dff2ff', 0.6),
  deflector_grid: (S) => S.planet(80, 96, 34, '#b8d8ff', '#2a4a7a') + S.dome(80, 80, 52, '#bfe6ff') + [40, 60, 80, 100, 120].map((x) => S.bolt(x, 0, x + 4, 30, '#ffb070', 3, 1)).join(''),
  heat_sink: (S) => [30, 44, 58, 72].map((y) => S.panel(40, y, 80, 6, 2)).join('') + S.glow(80, 20, 22, '#ffb070', 0.8) + `<path d="M80 12 v70" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 3"/>` + S.card(130, 50, 12, '#bfe6ff', 16),
  bulwark_plating: (S) => [[50, 52], [80, 44], [110, 52], [65, 70], [95, 70]].map(([x, y]) => S.hex(x, y, 16, S.linear([[0, '#e6ecf5'], [1, '#56657e']]), '#fff')).join('') + S.glow(80, 44, 26, '#bfe6ff', 0.5),
  aegis_monolith: (S) => S.ground(84) + `<polygon points="68,86 72,14 88,10 92,86" fill="${S.linear([[0, '#e6ecf5'], [0.5, '#8d98ab'], [1, '#2a3242']], 0, 0, 1, 0)}"/>` + S.dome(80, 86, 60, '#bfe6ff') + S.glow(80, 20, 20, '#fff', 0.8) + S.rings(80, 20, 6, 3, 6, '#fff', 0.6),
  // ---- Neutral growth ----
  deep_scanners: (S) => S.panel(20, 62, 30, 20, 4) + `<path d="M35 62 L48 40" stroke="#dfe6f0" stroke-width="2"/>` + S.rings(48, 40, 10, 5, 12, '#c8ffd0', 0.7) + S.planet(130, 30, 8, '#c8ffd0', '#23584a') + S.planet(118, 64, 5, '#fff3b0', '#6a5a2a'),
  resonance_lattice: (S) => S.sun(80, 50, 9, S.p.glow) + [-1, 1].map((k) => S.rings(80, 50, 16, 4, 9, '#c8ffd0', 0.8).replace(/<circle/g, `<circle`) + S.card(80 + k * 52, 52, k * 8, '#9cd2a0', 18)).join(''),
  harmonic_singularity: (S) => `<circle cx="80" cy="50" r="10" fill="#040a08"/>` + S.orbit(80, 50, 30, 8, -12, '#fff3b0', 2.4) + S.rings(80, 50, 14, 6, 9, '#c8ffd0', 0.8) + [-1, 1].map((k) => S.card(80 + k * 60, 54, k * 10, '#9cd2a0', 16)).join(''),
  salvage_drone: (S) => S.panel(64, 20, 32, 16, 6) + [-1, 1].map((k) => `<line x1="${80 + k * 16}" y1="28" x2="${80 + k * 30}" y2="22" stroke="#dfe6f0" stroke-width="1.4"/><ellipse cx="${80 + k * 30}" cy="22" rx="10" ry="2" fill="#dfe6f0" opacity="0.7"/>`).join('') + `<polygon points="72,36 88,36 104,86 56,86" fill="${S.linear([[0, '#c8ffd0', 0.5], [1, '#c8ffd0', 0]])}"/>` + S.card(80, 70, 8, '#9cd2a0', 18),
  phase_shift: (S) => S.card(52, 52, -10, '#9cd2a0', 26) + S.card(108, 52, 10, '#fff3b0', 26) + `<path d="M64 30 Q80 18 96 30" fill="none" stroke="#fff" stroke-width="1.8"/><polygon points="96,30 90,26 91,33" fill="#fff"/><path d="M96 76 Q80 88 64 76" fill="none" stroke="#fff" stroke-width="1.8"/><polygon points="64,76 70,80 69,73" fill="#fff"/>` + S.motes(80, 52, 14, 20, '#fff'),
  standing_orders: (S) => S.panel(52, 16, 56, 72, 4) + [28, 40, 52, 64].map((y, i) => `<rect x="60" y="${y}" width="${i === 3 ? 26 : 40}" height="4" rx="2" fill="#fff" opacity="0.85"/>`).join('') + S.sun(104, 78, 6, '#ffd98a', 8),
  chain_of_command: (S) => [36, 62, 88, 114].map((x, i) => `<rect x="${x}" y="${i % 2 ? 42 : 46}" width="26" height="${i % 2 ? 20 : 12}" rx="${i % 2 ? 10 : 6}" fill="none" stroke="${S.linear([[0, '#fff'], [1, '#8d98ab']])}" stroke-width="4"/>`).join('') + S.glow(80, 52, 40, '#bfe6ff', 0.4) + S.motes(80, 52, 12, 50, '#dff2ff'),
  chrono_anchor: (S) => S.rings(80, 50, 30, 1, 1, '#fff3b0', 0.9) + `<line x1="80" y1="50" x2="80" y2="26" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><line x1="80" y1="50" x2="96" y2="58" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M60 72 Q80 90 100 72 M80 20 v60" fill="none" stroke="#c8ffd0" stroke-width="3"/>` + S.glow(80, 50, 16, '#fff', 0.8) + [-1, 1].map((k) => S.card(80 + k * 54, 52, 0, '#9cd2a0', 16)).join(''),
  stasis_field: (S) => S.card(80, 52, 0, '#9cd2a0', 28) + `<rect x="54" y="18" width="52" height="68" rx="8" fill="${S.linear([[0, '#dff2ff', 0.45], [1, '#dff2ff', 0.1]])}" stroke="#fff" stroke-width="1.2"/>` + S.motes(80, 52, 20, 36, '#fff', 1.1),
  // ---- Orbit ----
  gravity_assist: (S) => S.sun(30, 70, 10, '#ffd98a', 8) + S.orbit(30, 70, 46, 20, -18, '#fff', 1, 0.6) + S.planet(72, 52, 9, '#9ac0e8', '#2a4a7a') + `<path d="M76 46 C96 30 120 26 150 18" fill="none" stroke="#ffe0a0" stroke-width="1.6" stroke-dasharray="4 3"/>` + S.beam(84, 44, 150, 18, 2.2, '#ffb070'),
  orbital_slingshot: (S) => S.sun(80, 56, 11, '#ffd98a', 6) + S.orbit(80, 56, 54, 18, -8, '#fff', 1.2, 0.7) + S.planet(130, 50, 7, '#c8ffd0', '#23584a') + `<path d="M130 50 C150 34 120 10 86 16" fill="none" stroke="#c8ffd0" stroke-width="1.8"/><polygon points="86,16 94,12 93,20" fill="#c8ffd0"/>` + S.motes(110, 30, 10, 26, '#fff'),
  tidal_brake: (S) => S.sun(118, 50, 12, '#ffcf8a', 5) + S.orbit(118, 50, 40, 16, 10, '#9fd0ff', 1.2, 0.8) + S.planet(84, 44, 8, '#e8a07a', '#6a2a2a') + S.dome(52, 70, 34, '#bfe6ff') + S.waves(84, '#bfe6ff', 3, 3, 0.6),
  dead_world_mine: (S) => S.planet(80, 98, 48, '#8a8f99', '#2c2f36') + S.ground(78, '#3a3e46', 4) + S.panel(62, 52, 36, 22, 3) + `<polygon points="70,52 80,36 90,52" fill="${S.linear([[0, '#dfe6f0'], [1, '#56657e']])}"/>` + S.glow(80, 62, 12, '#c8ffd0', 0.8) + S.sun(136, 20, 6, '#ffd98a'),
  perihelion_forge: (S) => S.sun(24, 50, 16, '#ffb070', 10) + S.planet(84, 52, 18, '#d8a070', '#5a2a1a') + [76, 86, 96].map((x, i) => S.panel(x - 3, 30 - i * 2, 6, 14)).join('') + S.glow(86, 36, 12, '#ffb070', 0.9) + S.beam(102, 52, 160, 52, 2.6, '#ffb070'),
  sunward_lance: (S) => S.sun(140, 30, 12, '#ffe7a8', 8) + S.orbit(140, 30, 60, 26, 14, '#fff', 1, 0.5) + S.planet(96, 54, 8, '#ffd0a0', '#7a4a2a') + S.beam(10, 90, 132, 34, 3, '#ffe7a8') + S.glow(132, 34, 14, '#fff', 0.9),
  comet_shard: (S) => S.crystal(48, 40, 22, 12, -30, '#e8b0ff') + `<path d="M56 46 C90 60 120 74 158 88" fill="none" stroke="${S.linear([[0, '#e8b0ff', 0.9], [1, '#e8b0ff', 0]], 0, 0, 1, 0)}" stroke-width="7" stroke-linecap="round"/>` + S.planet(120, 34, 10, '#c8a0e8', '#3a2a5a') + S.orbit(120, 34, 24, 8, -10, '#fff', 1, 0.6) + S.motes(80, 60, 14, 30, '#f0d0ff'),
  tide_lock: (S) => S.planet(80, 54, 22, '#7ad0c8', '#1a4a5a') + S.orbit(80, 54, 44, 14, -6, '#bfe6ff', 1.4, 0.9) + S.dome(80, 54, 36, '#bfe6ff') + S.planet(124, 50, 5, '#c8ffd0', '#23584a') + S.waves(90, '#9fe0d8', 3, 3, 0.7),
  // Attuned cards: the three planets (dead grey, abundant green, industrial ember) round their sun.
  orrery: (S) => S.sun(80, 52, 9, '#fff3b0', 6) + S.orbit(80, 52, 30, 10, -8, '#fff', 1, 0.7) + S.orbit(80, 52, 48, 16, -8, '#fff', 1, 0.55) + S.orbit(80, 52, 66, 22, -8, '#fff', 1, 0.4) + S.planet(108, 46, 4, '#c8c8d0', '#4a4a58') + S.planet(36, 62, 6, '#c8ffd0', '#23584a') + S.planet(140, 38, 7, '#ffb070', '#5a2a1a') + `<path d="M80 52 L140 38" stroke="#ffe0a0" stroke-width="0.8" opacity="0.6"/>`,
  ecliptic_lance: (S) => S.orbit(80, 60, 70, 18, -6, '#ffe0a0', 1.4, 0.8) + S.sun(80, 60, 10, '#ffd98a', 6) + S.planet(22, 70, 6, '#c8c8d0', '#4a4a58') + S.planet(140, 52, 7, '#ffb070', '#5a2a1a') + S.beam(140, 52, 60, 8, 2.4, '#ffb070') + S.glow(140, 52, 10, '#ffb070', 0.8),
  solstice_choir: (S) => S.sun(80, 44, 16, '#ffd98a', 12) + S.orbit(80, 44, 52, 16, 0, '#fff3b0', 1.2, 0.8) + S.planet(132, 44, 6, '#c8ffd0', '#23584a') + S.planet(28, 44, 6, '#ffb070', '#5a2a1a') + [56, 72, 88, 104].map((x) => S.dome(x, 92, 7, '#fff3b0')).join('') + S.motes(80, 70, 14, 30, '#fff'),
  precession_engine: (S) => S.crystal(80, 70, 40, 14, 0, '#d6c8ff') + S.orbit(80, 48, 60, 14, 18, '#d6c8ff', 1.2, 0.8) + S.orbit(80, 48, 60, 14, -18, '#d6c8ff', 1.2, 0.6) + S.planet(132, 32, 6, '#ffb070', '#5a2a1a') + S.planet(30, 36, 5, '#c8c8d0', '#4a4a58') + S.glow(80, 40, 12, '#d6c8ff', 0.7),
  moon_warden: (S) => S.planet(80, 62, 24, '#c8c8d0', '#3a3a48') + S.dome(80, 62, 34, '#bfe6ff') + S.orbit(80, 62, 50, 14, -6, '#bfe6ff', 1.2, 0.8) + S.planet(126, 54, 5, '#c8ffd0', '#23584a') + S.waves(92, '#9fe0d8', 3, 3, 0.6),
  seasonal_bloom: (S) => S.ground(86, '#2a4a30', 10) + S.mushroom(60, 86, 26, 18, '#c8ffd0') + S.mushroom(96, 86, 20, 14, '#ffb070', 6) + S.mushroom(78, 86, 14, 10, '#c8c8d0', -4) + S.orbit(80, 30, 56, 10, 0, '#fff', 1, 0.5) + S.planet(132, 28, 5, '#c8ffd0', '#23584a'),
  grand_orrery: (S) => S.sun(80, 50, 12, '#fff3b0', 10) + [26, 40, 54, 68].map((r, i) => S.orbit(80, 50, r, r / 3, -10 + i * 4, '#ffe0a0', 1.2, 0.85 - i * 0.12)).join('') + S.planet(104, 44, 5, '#c8c8d0', '#4a4a58') + S.planet(42, 60, 6, '#c8ffd0', '#23584a') + S.planet(132, 38, 7, '#ffb070', '#5a2a1a') + S.planet(18, 52, 8, '#9ac0e8', '#2a4a7a', true) + S.motes(80, 50, 18, 70, '#fff'),
  orbit_root: (S) => S.sun(80, 48, 9, '#fff3b0', 4) + S.orbit(80, 48, 36, 12, 0, '#c8ffd0', 1.4, 0.9) + S.orbit(80, 48, 58, 20, 0, '#c8ffd0', 1, 0.6) + `<path d="M80 96 C76 80 84 70 80 58 M80 80 C66 74 60 66 56 58 M80 76 C94 72 100 64 104 56" fill="none" stroke="#9cd2a0" stroke-width="2.2" stroke-linecap="round"/>` + S.planet(116, 46, 5, '#c8ffd0', '#23584a') + S.planet(36, 52, 6, '#fff3b0', '#6a5a2a'),
  // Recovery and recall: cards coming back.
  recall_beacon: (S) => S.panel(70, 58, 20, 30, 3) + S.glow(80, 52, 16, S.p.glow, 0.9) + `<path d="M80 52 L80 20" stroke="#fff" stroke-width="1.6"/>` + S.card(80, 22, 0, '#dfe6f0', 18) + `<path d="M56 46 Q80 28 104 46" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.8"/><path d="M48 54 Q80 22 112 54" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>` + S.motes(80, 40, 12, 26, '#fff'),
  sunlit_return: (S) => S.sun(80, 34, 14, '#fff3b0', 6) + S.card(80, 70, 0, '#ffd28a', 20) + `<path d="M40 78 A42 42 0 0 1 56 40" fill="none" stroke="#fff" stroke-width="1.8"/><polygon points="56,40 49,42 54,47" fill="#fff"/>` + S.motes(80, 52, 14, 30, '#fff3b0'),
  shard_recall: (S) => `<polygon points="80,16 96,50 80,88 64,50" fill="${S.linear([[0, '#ffe0f4'], [1, S.p.deep]])}" opacity="0.9"/>` + S.card(118, 56, 12, '#ffb3e0', 18) + `<path d="M108 34 Q96 20 84 26" fill="none" stroke="#fff" stroke-width="1.6"/><polygon points="84,26 91,22 90,30" fill="#fff"/>` + S.glow(80, 50, 14, S.p.glow, 0.8) + S.motes(80, 50, 14, 24, '#ffe0f4'),
  returning_tide: (S) => `<path d="M14 70 C40 50 60 86 86 66 S130 50 150 66 L150 100 L14 100 Z" fill="${S.linear([[0, '#bfe4ff'], [1, S.p.deep]])}" opacity="0.85"/>` + S.card(80, 46, -6, '#bfe4ff', 20) + `<path d="M52 78 Q48 52 66 40" fill="none" stroke="#fff" stroke-width="1.6"/><polygon points="66,40 59,41 63,47" fill="#fff"/>` + S.motes(80, 46, 12, 22, '#fff'),
  compost_cycle: (S) => `<ellipse cx="80" cy="84" rx="56" ry="10" fill="${S.radial([[0, S.p.glow], [1, S.p.deep]])}" opacity="0.8"/>` + `<path d="M80 84 C72 66 88 56 80 40" fill="none" stroke="#9cd2a0" stroke-width="2.4" stroke-linecap="round"/>` + S.card(80, 34, 0, '#c5ff8a', 16) + `<path d="M46 70 A36 36 0 0 1 58 28" fill="none" stroke="#fff" stroke-width="1.6"/><polygon points="58,28 51,30 56,35" fill="#fff"/><path d="M114 70 A36 36 0 0 0 102 28" fill="none" stroke="#fff" stroke-width="1.6" opacity="0.7"/>` + S.motes(80, 60, 12, 30, '#c5ff8a'),
  // ---- Globals ----
  solar_storm: (S) => S.sun(80, 54, 14, '#ffb070', 14) + [20, 50, 110, 140].map((x) => S.bolt(80, 54, x, 10 + (x % 3) * 20, '#ffe0a0', 4, 1.2)).join(''),
  ice_age: (S) => S.planet(80, 60, 30, '#ffffff', '#6aa0d0') + [0, 60, 120].map((a) => `<line x1="80" y1="30" x2="80" y2="90" stroke="#fff" stroke-width="2" transform="rotate(${a} 80 60)"/>`).join('') + S.glow(80, 60, 44, '#dff2ff', 0.5),
  solar_maximum: (S) => S.sun(80, 54, 20, '#ffd98a', 16) + S.rings(80, 54, 30, 3, 10, '#ffe7a8', 0.6),
  // ---- Commands ----
  // Command cards: the heroes who lead each race, crowned.
  command_directive: (S) => S.sun(132, 20, 6, '#fff3c4', 9) + aureline(S, 66, 32, 1.35, { item: 'shield', crown: true, halos: 3, garb: 'armour', eye: '#2a6fd0', cloak: '#ffe7b0', sash: '#2f5fb8' }),
  ignition_protocol: (S) => S.planet(140, 88, 22, '#e08a5a', '#4d6fae') + aureline(S, 58, 30, 1.35, { item: 'lance', crown: true, halos: 2, garb: 'armour', eye: '#c0392b', cloak: '#ffb070', sash: '#c0392b', lean: -1 }),
  coolant_protocol: (S) => S.glow(80, 30, 60, '#bfe6ff', 0.4) + xelnaru(S, 68, 32, 1.4, { item: 'lens', crown: true, pauldrons: true, shard: '#bfe6ff', core: '#f0faff', cape: '#8fb8e8' }) + S.motes(80, 40, 14, 70, '#e6f6ff'),
  chamber_protocol: (S) => S.ground(92, '#0e0a1c') + ixquor(S, 72, 68, 1.2, { item: 'pods', crown: true, arms: 6, cap: '#d59cff', tall: 1.1 }) + S.motes(80, 50, 18, 60, '#d59cff', 1),
  tide_regent: (S) => S.waves(92, S.p.accent, 2, 2, 0.5) + vorthane(S, 70, 34, 1.4, { item: 'trident', crown: true, eyes: 7, bell: '#9ff0e0' }),
  the_admiralty: (S) => S.glow(80, 34, 70, '#7ff0e0', 0.3) + [[40, 42, 0.85, 'lantern'], [80, 30, 1.1, 'trident'], [120, 42, 0.85, 'bell']].map(([x, y, sc, it]) => vorthane(S, x as number, y as number, sc as number, { helm: true, crown: x === 80, eyes: 5, item: it as 'lantern', reach: 0.7, bell: x === 80 ? '#bff8f0' : '#7fd8f0' })).join(''),
  // ---- Lightspeed ----
  null_field: (S) => S.rings(80, 52, 14, 4, 10, '#ffe2a0', 0.8) + S.beam(0, 20, 64, 44, 2, '#ff9a5a') + `<line x1="60" y1="30" x2="100" y2="74" stroke="#fff" stroke-width="3"/>` + S.glow(72, 46, 12, '#fff', 0.8),
  signal_jammer: (S) => S.panel(72, 50, 16, 34, 3) + S.rings(80, 46, 8, 4, 9, '#ffe2a0', 0.8) + `<line x1="40" y1="84" x2="120" y2="14" stroke="#fff" stroke-width="3"/>`,
  frost_snare: (S) => S.hex(80, 52, 26, S.linear([[0, '#ffffff', 0.8], [1, '#6aa0d0', 0.4]]), '#fff') + [0, 60, 120].map((a) => `<line x1="80" y1="30" x2="80" y2="74" stroke="#fff" stroke-width="1.6" transform="rotate(${a} 80 52)"/>`).join('') + S.motes(80, 52, 18, 50, '#ffe2a0'),
  solar_mirror: (S) => `<path d="M104 10 L116 14 L116 90 L104 94 Z" fill="${S.linear([[0, '#ffffff'], [1, '#c8a060']], 0, 0, 1, 0)}"/>` + S.beam(10, 30, 104, 50, 2.2, '#ff9a5a') + S.beam(104, 50, 20, 84, 2.2, '#ffe2a0') + S.glow(104, 50, 12, '#fff', 0.9),
  decoy_array: (S) => S.card(60, 52, -6, '#e8b45a', 28).replace('<g', '<g opacity="0.5"') + S.card(100, 52, 6, '#ffe2a0', 28) + `<rect x="42" y="30" width="36" height="46" rx="3" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="3 3" transform="rotate(-6 60 52)"/>`,
  temporal_snare: (S) => S.rings(80, 50, 26, 1, 1, '#ffe2a0', 0.95) + `<line x1="80" y1="50" x2="80" y2="30" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><line x1="80" y1="50" x2="94" y2="56" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` + S.rings(80, 50, 34, 3, 8, '#ffe2a0', 0.5) + S.glow(80, 50, 18, '#fff', 0.7),
  // ---- Aureline (non-characters) ----
  focusing_array: (S) => S.rings(80, 52, 10, 4, 9, '#fff3c4', 0.8) + S.sun(80, 52, 6) + [-40, 40].map((d) => S.beam(80 + d * 1.9, 52 + d * 0.3, 80 + d * 0.2, 52, 1.6)).join(''),
  sunspear: (S) => S.sun(30, 60, 12, S.p.glow, 10) + S.beam(38, 58, 156, 24, 4) + S.planet(150, 90, 10, '#ffb070', '#6a2a2a'),
  dawn_beacon: (S) => S.ground(74) + `<rect x="74" y="34" width="12" height="44" fill="${S.linear([[0, '#fff3c4'], [1, '#8a6a2a']], 0, 0, 1, 0)}"/>` + S.sun(80, 30, 7, S.p.glow, 12) + S.beam(80, 30, 10, 12, 1.4, '#fff3c4') + S.beam(80, 30, 150, 12, 1.4, '#fff3c4'),
  sunforge: (S) => S.ground(78) + `<path d="M50 80 L58 56 L102 56 L110 80 Z" fill="${S.linear([[0, '#b8a078'], [1, '#3a2a18']])}"/>` + S.sun(80, 48, 10, '#ffb070', 12) + S.motes(80, 40, 16, 30, '#ffe0a0'),
  // ---- Xel'Naru (non-characters) ----
  shard_reactor: (S) => S.crystal(80, 52, 56, 22, 0) + S.crystal(46, 56, 30, 12, -18) + S.crystal(114, 56, 30, 12, 18) + S.sun(80, 56, 6, '#fff') + S.bolt(80, 50, 150, 20, S.p.accent, 4),
  crystal_storm: (S) => [0, 1, 2, 3, 4, 5, 6].map((i) => S.crystal(20 + i * 20, 20 + ((i * 37) % 60), 22, 8, 30 + i * 10, i % 2 ? S.p.accent : S.p.glow)).join('') + S.motes(80, 50, 20, 70, '#fff'),
  overload_core: (S) => S.hex(80, 52, 28, S.radial([[0, '#ffffff'], [0.5, '#ff8aa0'], [1, S.p.deep]]), '#fff') + S.bolt(80, 24, 80, 80, '#fff', 5, 1.6) + S.glow(80, 52, 36, '#ff8aa0', 0.5) + [40, 120].map((x) => S.bolt(80, 52, x, 20, S.p.accent, 3, 1)).join(''),
  prism_vent: (S) => `<polygon points="80,20 108,76 52,76" fill="${S.linear([[0, '#ffffff', 0.9], [1, S.p.accent, 0.4]], 0, 0, 1, 1)}" stroke="#fff" stroke-width="0.8"/>` + S.beam(0, 50, 64, 48, 1.6, '#fff') + ['#ff8a8a', '#ffd98a', '#8affc0', '#8ac8ff', '#c08aff'].map((c, i) => S.beam(94, 48 + i, 160, 30 + i * 12, 1, c)).join(''),
  prism_conduit: (S) => [40, 120].map((x) => S.crystal(x, 52, 40, 14, x < 80 ? -10 : 10)).join('') + S.beam(46, 50, 114, 50, 2, '#dff2ff') + S.sun(80, 50, 6, '#dff2ff'),
  ember_shard: (S) => S.crystal(80, 50, 50, 18, 8, '#ffb070') + S.glow(80, 50, 34, '#ff7a3a', 0.6) + S.motes(80, 60, 26, 44, '#ffd08a', 1.4),
  shard_renewal: (S) => S.crystal(80, 52, 44, 16, 0) + [0, 1, 2, 3, 4, 5].map((i) => S.crystal(80 + Math.cos(i) * 36, 52 + Math.sin(i) * 26, 12, 5, i * 40, S.p.accent, 0.8)).join('') + S.rings(80, 52, 30, 2, 8, '#fff', 0.5),
  // ---- Vorthane (non-characters) ----
  stinging_veil: (S) => S.waves(86, S.p.accent, 3, 2) + [30, 52, 74, 96, 118].map((x, i) => `<path d="M${x} 12 C${x - 6} 40 ${x + 6} 56 ${x} 90" fill="none" stroke="${S.p.accent}" stroke-width="2" stroke-opacity="0.8"/>` + S.glow(x, 20 + i * 10, 5, S.p.glow, 0.9)).join(''),
  tidal_bloom: (S) =>
    S.waves(70, S.p.accent, 3, 3, 0.7) +
    S.glow(80, 54, 40, S.p.accent, 0.5) +
    [-60, -30, 0, 30, 60].map((a) => `<path d="M80 64 C${80 + a * 0.3 - 10} 50 ${80 + a * 0.9 - 6} 32 ${80 + a * 0.8} 26 C${80 + a * 0.9 + 6} 32 ${80 + a * 0.3 + 10} 50 80 64 Z" fill="${S.radial([[0, '#ffffff'], [0.6, S.p.accent, 0.8], [1, S.p.accent, 0.3]], 0.5, 0.25, 0.8)}" stroke="#fff" stroke-width="0.5" stroke-opacity="0.7"/>`).join('') +
    S.sun(80, 58, 4, S.p.glow),
  deep_current: (S) => [0, 1, 2, 3].map((i) => `<path d="M-5 ${30 + i * 16} C30 ${18 + i * 16} 60 ${44 + i * 16} 90 ${30 + i * 16} S140 ${18 + i * 16} 165 ${30 + i * 16}" fill="none" stroke="${S.p.accent}" stroke-width="${3 - i * 0.5}" stroke-opacity="${0.9 - i * 0.18}"/>`).join('') + S.motes(80, 50, 20, 70, '#dffff8', 1),
  tide_pylon: (S) => S.ground(80, '#031520') + `<rect x="72" y="18" width="16" height="66" rx="4" fill="${S.linear([[0, '#dffff8'], [1, '#0f5563']], 0, 0, 1, 0)}"/>` + S.glow(80, 22, 14, S.p.glow, 0.9) + S.waves(70, S.p.accent, 3, 2) + [44, 116].map((x) => S.dome(x, 80, 16, S.p.accent)).join(''),
  undertow: (S) => `<path d="M80 52 m-40 0 a40 30 0 1 1 80 0 a30 22 0 1 1 -60 0 a20 14 0 1 1 40 0 a10 7 0 1 1 -20 0" fill="none" stroke="${S.p.accent}" stroke-width="2.6"/>` + S.card(86, 50, 30, '#58a9a0', 14) + S.motes(80, 52, 16, 50, '#dffff8'),
  // ---- Ixquor (non-characters) ----
  mycelium_tower: (S) => S.ground(84, '#0e0a1c') + S.mushroom(80, 86, 56, 34, S.p.glow) + S.mushroom(52, 86, 24, 16, S.p.accent, -4) + S.mushroom(110, 86, 30, 18, S.p.accent, 5) + S.motes(80, 30, 16, 40, S.p.glow),
  hive_relay: (S) => [[60, 40], [80, 52], [100, 40], [60, 64], [100, 64], [80, 28], [80, 76]].map(([x, y], i) => S.hex(x, y, 12, S.radial([[0, i === 1 ? '#ffffff' : S.p.accent], [1, S.p.deep]]), S.p.glow)).join('') + S.glow(80, 52, 30, S.p.glow, 0.4),
  rot_bloom: (S) => S.ground(86, '#0e0a1c') + [0, 1, 2, 3, 4].map((i) => `<path d="M80 70 Q${58 + i * 11} ${40 - (i % 2) * 8} ${50 + i * 15} ${30 + (i % 2) * 10}" fill="none" stroke="${S.p.glow}" stroke-width="2"/>` + S.glow(50 + i * 15, 30 + (i % 2) * 10, 6, S.p.accent, 0.9)).join('') + S.glow(80, 70, 20, '#d59cff', 0.6),
  canopy: (S) => S.ground(88, '#0e0a1c') + S.mushroom(80, 90, 30, 110, S.p.accent) + S.motes(80, 70, 20, 60, S.p.glow, 1),
  spore_cloud: (S) => [[50, 44, 18], [80, 36, 22], [110, 46, 18], [66, 62, 16], [96, 62, 16]].map(([x, y, r]) => S.glow(x, y, r * 1.4, S.p.accent, 0.8) + `<circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="${S.radial([[0, '#ffffff'], [1, S.p.accent]])}" opacity="0.7"/>`).join('') + S.motes(80, 52, 30, 70, S.p.glow),
  regrowth_pod: (S) => `<path d="M80 18 C104 30 104 70 80 86 C56 70 56 30 80 18 Z" fill="${S.radial([[0, '#ffffff'], [0.4, S.p.glow], [1, S.p.deep]], 0.45, 0.4, 0.7)}"/>` + S.card(80, 54, 0, '#c5ff8a', 14) + `<path d="M40 60 A40 40 0 0 1 60 24" fill="none" stroke="#fff" stroke-width="1.6"/><polygon points="60,24 53,25 57,31" fill="#fff"/>`,
  spore_husk: (S) => `<path d="M52 86 C44 50 58 20 80 20 S116 50 108 86 Z" fill="${S.linear([[0, '#e6d8f0'], [1, '#3d2b5e']])}"/>` + `<path d="M70 40 L76 60 L68 76" fill="none" stroke="#1b1433" stroke-width="2"/>` + S.motes(84, 52, 14, 18, S.p.glow, 1.6) + S.glow(84, 52, 20, S.p.glow, 0.5),
  hive_rooting: (S) => S.ground(62, '#0e0a1c') + [30, 60, 90, 120].map((x) => `<path d="M${x} 62 q-6 14 -2 30 M${x} 62 q8 12 6 28" fill="none" stroke="${S.p.glow}" stroke-width="1.6"/>` + S.card(x, 44, 0, '#c5ff8a', 16)).join('') + S.motes(80, 80, 20, 60, S.p.glow),

  // ---- Characters: Aureline ----
  helio_lancer: (S) => S.planet(140, 86, 22, '#e8c98f', '#4d6fae') + aureline(S, 54, 30, 1.3, { item: 'lance', lean: -1, garb: 'armour' }),
  halo_ward: (S) => aureline(S, 62, 30, 1.25, { item: 'shield', halos: 3, eye: '#3aa0a0', cloak: '#bfe6ff', sash: '#3a7ab8' }),
  coronal_chorus: (S) => S.ground(88, '#132446') + S.sun(80, 10, 5, '#fff3c4', 10) + [[36, 44, 0.85, '#ffd98a', 'vestment'], [80, 32, 1, '#fff3c4', 'vestment'], [124, 44, 0.85, '#ffc78a', 'vestment']].map(([x, y, s, c, g]) => aureline(S, x as number, y as number, s as number, { cloak: c as string, halos: 1, item: 'none', garb: g as 'vestment', sash: '#e0a020' }) + S.rings(x as number, (y as number) - 14, 6, 3, 4, '#fff3c4', 0.55)).join(''),
  aureline_sun_priest: (S) => S.sun(130, 18, 7, S.p.glow, 10) + aureline(S, 60, 28, 1.25, { item: 'staff', halos: 1, eye: '#d08a2a', cloak: '#ffe7b0', garb: 'vestment', sash: '#c0392b' }),
  aurelia_first_light: (S) => S.glow(80, 34, 70, '#fff3c4', 0.5) + aureline(S, 74, 40, 1.4, { item: 'orb', halos: 2, crown: true, eye: '#e0a020', cloak: '#fff1c8', garb: 'vestment', sash: '#e0a020' }),
  aureline_war_herald: (S) => S.ground(90, '#132446') + aureline(S, 50, 32, 1.2, { item: 'banner', halos: 2, eye: '#c0392b', cloak: '#ffc78a', garb: 'armour', sash: '#2f5fb8' }),

  // ---- Characters: Xel'Naru ----
  martyr_crystal: (S) => S.glow(80, 50, 50, '#ffe0ea', 0.5) + xelnaru(S, 80, 32, 1.45, { cracked: true, core: '#fff6f0' }),
  fracture_lens: (S) => xelnaru(S, 56, 32, 1.4, { item: 'lens', shard: '#e0c0ff' }),
  xelnaru_reliquarist: (S) => S.ground(92, '#1b0c24') + xelnaru(S, 58, 30, 1.35, { item: 'reliquary', shard: '#f0c0d0', core: '#fff0c0', cape: '#b08ad0' }),
  xelnaru_champion: (S) => S.planet(22, 88, 18, '#e8a2a8', '#2c1638') + xelnaru(S, 60, 32, 1.4, { item: 'blade', bulk: 1.25, shard: '#ff9ab0', pauldrons: true }),
  kyrvessa_prism_queen: (S) => S.glow(80, 20, 60, '#c9a2ff', 0.45) + xelnaru(S, 80, 36, 1.45, { crown: true, shard: '#ffc8e0', core: '#ffffff', cape: '#c9a2ff' }) + S.motes(80, 40, 16, 70, '#fff'),

  // ---- Characters: Vorthane ----
  bell_warden: (S) => vorthane(S, 64, 34, 1.2, { item: 'bell', helm: true }),
  lure_jelly: (S) => S.waves(92, S.p.accent, 2, 2, 0.6) + [[36, 44, 0.75], [80, 34, 0.9], [124, 46, 0.72]].map(([x, y, s], i) => vorthane(S, x, y, s, { item: 'lantern', eyes: 3 + i, bell: i === 1 ? '#9ff0d8' : '#7fd8f0', reach: 0.7 })).join(''),
  abyssal_choir: (S) => [[40, 36, 0.8], [80, 28, 0.95], [120, 36, 0.8]].map(([x, y, s]) => vorthane(S, x, y, s, { eyes: 4, reach: 0.8 }) + S.rings(x, y - 14 * s, 12 * s, 3, 5 * s, S.p.glow, 0.5)).join(''),
  riptide_ambush: (S) => [16, 40, 64, 96, 120, 144].map((x, i) => `<path d="M${x} 104 C${x - 10} 70 ${x + 10} 40 ${x + (i % 2 ? 6 : -6)} 4" fill="none" stroke="#1f6a4a" stroke-width="${4 + (i % 3)}" stroke-linecap="round"/>`).join('') + [[52, 40], [84, 58], [110, 34]].map(([x, y]) => S.glow(x, y, 10, S.p.glow, 0.9) + `<circle cx="${x - 3}" cy="${y}" r="1.6" fill="#fff"/><circle cx="${x + 3}" cy="${y}" r="1.6" fill="#fff"/>`).join('') + S.waves(90, S.p.accent, 2, 2, 0.5),
  hero_of_rathune: (S) => S.ground(92, '#031520') + vorthane(S, 62, 34, 1.25, { item: 'trident', helm: true, bell: '#8fe0d0', eyes: 5 }),
  ommarath_deep_bell: (S) => S.glow(80, 40, 70, '#7ff0e0', 0.4) + vorthane(S, 80, 40, 2, { eyes: 9, crown: true, reach: 0.7, bell: '#9ff0f0' }) + S.motes(80, 70, 18, 70, '#dffff8', 1),

  // ---- Characters: Ixquor ----
  sporecaster: (S) => S.ground(92, '#0e0a1c') + ixquor(S, 56, 66, 1.05, { item: 'spores', arms: 4 }),
  ixquor_brood_tender: (S) => S.ground(92, '#0e0a1c') + ixquor(S, 58, 66, 1.05, { item: 'pods', arms: 3, cap: '#d59cff' }),
  the_brood_queen: (S) => S.glow(80, 30, 70, '#c5ff8a', 0.35) + ixquor(S, 80, 70, 1.25, { crown: true, arms: 6, tall: 1.05 }) + S.motes(80, 40, 20, 70, '#c5ff8a', 1.1),
};

/** The second set's pictures. */
const ART2: Record<string, Draw> = {
  // ---- Neutral attack ----
  nova_shell: (S) => S.sun(62, 52, 14, '#ffb070', 10) + S.dome(62, 70, 34, '#bfe6ff') + S.beam(76, 46, 156, 26, 2.6),
  photon_drill: (S) => S.panel(10, 44, 40, 14, 4) + S.panel(46, 47, 18, 8, 2) + S.beam(64, 51, 150, 51, 2.2, '#fff3c4') + S.dome(128, 80, 26, '#9fd0ff') + S.glow(128, 51, 10, '#fff', 0.9),
  ember_drone: (S) => S.panel(62, 38, 36, 18, 6) + [-1, 1].map((k) => `<ellipse cx="${80 + k * 26}" cy="40" rx="12" ry="3" fill="#dfe6f0" opacity="0.8"/>`).join('') + S.glow(80, 62, 14, '#ffb070', 0.9) + S.motes(80, 74, 14, 20, '#ffd0a0', 1.2),
  siege_array: (S) => S.ground(86) + [36, 70, 104].map((x, i) => S.panel(x, 56 - i * 4, 24, 26 + i * 4, 3) + S.beam(x + 12, 56 - i * 4, 150, 8 + i * 6, 1.6)).join(''),
  scatter_shot: (S) => S.glow(24, 50, 16, '#ffb070', 0.9) + [18, 34, 50, 66, 82].map((y, i) => S.beam(28, 50, 150, y, 1.1 + (i % 2) * 0.4, i % 2 ? '#ffe0a0' : '#ffb070')).join(''),
  flux_lance: (S) => S.bolt(10, 30, 150, 66, '#ffe0a0', 7, 2) + S.card(124, 30, 12, '#ffb070', 18) + S.glow(150, 66, 12, '#fff', 0.8),
  void_bolt: (S) => `<circle cx="120" cy="50" r="13" fill="#05030a"/>` + S.orbit(120, 50, 22, 6, -14, '#c79ae8', 2) + S.beam(8, 70, 108, 52, 2.4, '#c79ae8') + S.card(130, 26, 18, '#b8a0d8', 14),
  comet_hail: (S) => S.planet(118, 78, 22, '#d8a070', '#5a2a1a') + [[20, 10], [50, 4], [80, 14]].map(([x, y]) => S.beam(x, y, x + 34, y + 40, 1.6, '#ffe0a0') + S.glow(x + 34, y + 40, 5, '#fff', 0.9)).join(''),
  // ---- Neutral defence ----
  frost_lattice: (S) => [[60, 40], [80, 52], [100, 40], [70, 64], [90, 64]].map(([x, y]) => S.hex(x, y, 12, S.linear([[0, '#ffffff', 0.9], [1, '#9fd0ff', 0.4]]), '#fff')).join('') + S.glow(80, 52, 32, '#dff2ff', 0.5),
  mirror_plating: (S) => S.planet(80, 98, 30, '#b8d8ff', '#2a4a7a') + [-1, 0, 1].map((k) => `<rect x="${f(68 + k * 30)}" y="${f(30 + Math.abs(k) * 8)}" width="24" height="36" rx="3" fill="${S.linear([[0, '#ffffff'], [1, '#9fc0e8']], 0, 0, 1, 1)}" stroke="#fff" transform="rotate(${k * 12} ${80 + k * 30} 48)"/>`).join(''),
  cold_front: (S) => S.waves(30, '#dff2ff', 4, 4, 0.8) + S.dome(80, 92, 40, '#bfe6ff') + S.motes(80, 40, 30, 70, '#fff', 1),
  radiator_fins: (S) => S.glow(80, 70, 30, '#ffb070', 0.6) + [44, 56, 68, 80, 92, 104, 116].map((x) => `<rect x="${x}" y="24" width="6" height="56" rx="2" fill="${S.linear([[0, '#ffffff'], [1, '#5aa0e0']])}"/>`).join(''),
  bastion_node: (S) => S.ground(86) + S.hex(80, 52, 30, S.linear([[0, '#e6ecf5'], [1, '#56657e']]), '#fff') + S.hex(80, 52, 16, S.radial([[0, '#ffffff'], [1, '#9fd0ff']]), '#fff') + S.dome(80, 86, 56, '#bfe6ff'),
  blink_bulwark: (S) => S.ground(86) + S.bolt(14, 14, 62, 50, '#ffe9a8', 6, 1.6) + S.hex(92, 52, 28, S.linear([[0, '#e6ecf5'], [1, '#56657e']]), '#fff') + S.hex(92, 52, 14, S.radial([[0, '#ffffff'], [1, '#ffe9a8']]), '#fff') + S.motes(56, 46, 22, 14, '#fff3c4', 1.2),
  sunflash_aegis: (S) => S.glow(80, 52, 40, '#ffd27a', 0.5) + S.bolt(10, 20, 58, 52, '#fff3c4', 6, 1.6) + S.dome(84, 88, 50, '#ffe2a8') + S.hex(84, 50, 20, S.radial([[0, '#ffffff'], [1, '#ffc46a']]), '#fff'),
  riptide_sentinel: (S) => S.waves(70, '#bfe6ff', 3, 5, 0.7) + S.bolt(12, 16, 60, 50, '#dff2ff', 6, 1.6) + S.hex(96, 50, 26, S.linear([[0, '#d8f0ff'], [1, '#2a5a8a']]), '#fff') + S.dome(96, 84, 44, '#9fd0ff'),
  debris_field: (S) => S.motes(80, 50, 26, 70, '#c8d0dc', 2.4) + S.dome(80, 80, 44, '#bfe6ff') + S.planet(80, 100, 26, '#9fb8d8', '#2a4a7a'),
  // ---- Neutral growth ----
  survey_probe: (S) => S.panel(30, 44, 20, 12, 4) + `<line x1="40" y1="44" x2="40" y2="30" stroke="#dfe6f0" stroke-width="1.4"/>` + S.rings(40, 30, 6, 3, 6, '#c8ffd0', 0.7) + S.orbit(110, 50, 34, 12, -10, '#fff', 1, 0.6) + S.planet(110, 50, 10, '#c8ffd0', '#23584a'),
  star_chart: (S) => S.panel(36, 18, 88, 66, 4) + [[50, 34], [70, 50], [92, 30], [110, 60], [64, 70]].map(([x, y]) => S.glow(x, y, 4, '#fff3b0', 1)).join('') + `<polyline points="50,34 70,50 92,30 110,60" fill="none" stroke="#fff3b0" stroke-width="0.8" stroke-dasharray="2 2"/>`,
  gravity_well: (S) => S.rings(80, 50, 8, 6, 8, '#c8ffd0', 0.7) + `<circle cx="80" cy="50" r="8" fill="#040a08"/>` + S.planet(128, 30, 8, '#e8a07a', '#6a2a2a') + `<path d="M120 34 Q100 44 90 48" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 2"/>`,
  relay_station: (S) => S.ground(88) + `<line x1="80" y1="88" x2="80" y2="30" stroke="#dfe6f0" stroke-width="3"/>` + S.panel(70, 26, 20, 8, 2) + S.rings(80, 30, 10, 4, 10, '#fff3b0', 0.7) + S.card(130, 40, 14, '#c8ffd0', 14),
  archive_vault: (S) => S.panel(40, 30, 80, 56, 4) + [52, 68, 84, 100].map((x, i) => S.card(x + 6, 56, (i - 1.5) * 4, i % 2 ? '#c8ffd0' : '#fff3b0', 14)).join('') + S.glow(80, 30, 26, '#c8ffd0', 0.5),
  supply_cache: (S) => S.ground(86) + [[56, 66], [80, 58], [104, 66], [68, 50], [92, 50]].map(([x, y]) => S.panel(x - 12, y - 8, 24, 16, 2)).join('') + S.glow(80, 44, 20, '#fff3b0', 0.5),
  // ---- Neutral lightspeed ----
  flare_trap: (S) => S.rings(80, 52, 10, 4, 10, '#ffe2a0', 0.8) + S.sun(80, 52, 8, '#ffb070', 8) + S.bolt(10, 20, 70, 48, '#fff6dc', 4, 1.4),
  counter_pulse: (S) => S.dome(80, 80, 60, '#ffe2a0') + S.rings(80, 80, 20, 4, 12, '#fff6dc', 0.6) + S.beam(150, 10, 104, 46, 2, '#ffb070'),
  snare_beacon: (S) => S.panel(70, 48, 20, 30, 4) + S.glow(80, 44, 14, '#fff6dc', 1) + S.rings(80, 44, 14, 4, 12, '#ffe2a0', 0.6) + S.card(126, 60, 14, '#ffe2a0', 16),
  ghost_signal: (S) => [0, 1, 2].map((i) => S.card(60 + i * 20, 52 - i * 4, -10 + i * 10, '#fff6dc', 20).replace('<g ', `<g opacity="${0.35 + i * 0.3}" `)).join('') + S.bolt(120, 18, 150, 70, '#ffb070', 4, 1.4),
  // ---- Neutral Command ----
  war_council: (S) => S.ground(92, '#1b0c24') + xelnaru(S, 62, 30, 1.4, { item: 'reliquary', crown: true, cape: '#c9a2ff', shard: '#ffc8e0', core: '#fff0c0' }),
  logistics_command: (S) => S.ground(92, '#0e0a1c') + S.planet(136, 26, 12, '#9cd2a0', '#3d2b5e') + ixquor(S, 64, 68, 1.15, { item: 'spores', crown: true, arms: 5, cap: '#c5ff8a' }),
  // Orion: a starless maw, a ring of fire round its edge, planets spiralling in.
  orion_galaxy_eater: (S) =>
    S.glow(80, 52, 70, '#b07cff', 0.35) +
    `<circle cx="80" cy="52" r="30" fill="${S.radial([[0, '#000000'], [0.7, '#0a0614'], [1, '#3a1f66']])}"/>` +
    S.rings(80, 52, 31, 3, 5, '#ffb070', 0.75) +
    [[28, 20, 7, '#e08a5a', '#4d6fae'], [132, 84, 6, '#9cd2a0', '#2c4a3a'], [138, 24, 5, '#c9d4e6', '#4a5266']].map(([x, y, r, a, b]) => S.planet(x as number, y as number, r as number, a as string, b as string)).join('') +
    S.motes(80, 52, 22, 70, '#ffd9a0', 1) +
    `<path d="M50 30 Q80 10 112 34 M48 74 Q80 96 114 70" fill="none" stroke="#ffcf9a" stroke-width="1.2" opacity="0.6"/>`,
  // Thermosiphon: cold suns, and what they drive.
  absolute_zero: (S) => S.planet(80, 50, 26, '#ffffff', '#3a6ea8') + [0, 30, 60, 90, 120, 150].map((a) => `<line x1="80" y1="14" x2="80" y2="86" stroke="#e6f6ff" stroke-width="1.4" stroke-opacity="0.8" transform="rotate(${a} 80 50)"/>`).join('') + S.rings(80, 50, 32, 3, 9, '#9fd0ff', 0.6) + S.bolt(80, 50, 150, 12, '#bfe6ff', 4, 1.6) + S.glow(80, 50, 16, '#ffffff', 0.9),
  cryo_lance: (S) => S.sun(36, 70, 9, '#bfe6ff') + S.crystal(96, 40, 70, 10, 55, '#bfe6ff') + S.beam(36, 70, 150, 14, 1.8, '#e6f6ff') + S.motes(110, 34, 10, 40, '#ffffff'),
  rime_bastion: (S) => S.ground(88, '#0f1a28') + [52, 80, 108].map((x, i) => S.crystal(x, 58 - (i === 1 ? 10 : 0), i === 1 ? 54 : 40, 14, (i - 1) * 12, '#cfeaff')).join('') + S.dome(80, 88, 58, '#bfe6ff'),
  frostbound_sentinel: (S) => S.sun(130, 22, 5, '#bfe6ff') + xelnaru(S, 74, 34, 1.3, { item: 'blade', pauldrons: true, shard: '#cfeaff', core: '#ffffff', cape: '#5d86c0' }) + S.dome(74, 92, 50, '#bfe6ff'),
  glacier_hull: (S) => S.waves(90, '#7fd8f0', 2, 2, 0.5) + `<path d="M24 72 L48 30 L70 50 L92 22 L118 46 L138 72 Z" fill="${S.linear([[0, '#ffffff'], [1, '#6aa0d0']])}" stroke="#fff" stroke-width="1"/>` + S.dome(80, 76, 64, '#9ff0e0'),
  thaw_beam: (S) => S.planet(118, 56, 22, '#e6f6ff', '#6aa0d0') + S.beam(0, 20, 108, 52, 2.4, '#ffb070') + S.glow(104, 52, 14, '#ffd98a', 0.9) + S.motes(112, 56, 12, 30, '#ffe0a0'),
  // Bomb Commands: the greatest of each race, in grander scenes.
  empress_solenne: (S) => S.sun(80, 26, 16, '#ffd98a', 16) + S.rings(80, 26, 26, 3, 9, '#ffe7a8', 0.5) + aureline(S, 80, 36, 1.5, { item: 'banner', crown: true, halos: 3, garb: 'vestment', eye: '#ffb000', cloak: '#ffcf80', sash: '#c0392b' }),
  the_shardmind: (S) => S.glow(80, 40, 74, '#c9a2ff', 0.35) + [[34, 40, 0.75], [126, 40, 0.75]].map(([x, y, sc]) => xelnaru(S, x, y, sc, { item: 'none', shard: '#8fb8e8', core: '#e6f6ff', cracked: true })).join('') + xelnaru(S, 80, 30, 1.45, { item: 'lens', crown: true, pauldrons: true, bulk: 1.2, cape: '#7a5cc8', shard: '#e6d8ff', core: '#ffffff' }) + S.motes(80, 40, 20, 80, '#e6d8ff'),
  leviathan_thoross: (S) => S.waves(88, S.p.accent, 3, 2, 0.6) + S.glow(80, 40, 80, '#3fd0c0', 0.3) + vorthane(S, 80, 26, 1.7, { item: 'bell', crown: true, helm: true, eyes: 9, reach: 1.2, bell: '#dffcf6' }),
  the_worldroot: (S) => S.ground(90, '#0b1410') + S.glow(80, 70, 70, '#8cff9a', 0.3) + [[30, 76, 0.7], [130, 76, 0.7]].map(([x, y, sc]) => ixquor(S, x, y, sc, { item: 'none', arms: 3, cap: '#9cd2a0' })).join('') + ixquor(S, 80, 72, 1.35, { item: 'spores', crown: true, arms: 8, cap: '#8cff9a', tall: 1.3 }) + S.motes(80, 40, 24, 90, '#c5ff8a', 1),

  // ---- Aureline ----
  aureline_skirmisher: (S) => S.ground(90, '#132446') + aureline(S, 70, 32, 1.1, { item: 'lance', lean: 1, halos: 1, garb: 'robe', cloak: '#ffe0a0' }),
  dawnblade: (S) => S.sun(120, 26, 12, '#fff3c4', 10) + `<polygon points="40,86 48,80 112,24 116,28 54,90" fill="${S.linear([[0, '#ffffff'], [1, '#ffd98a']], 0, 0, 1, 1)}" stroke="#fff" stroke-width="0.6"/>` + S.glow(112, 26, 10, '#fff', 0.9),
  lancer_squadron: (S) => S.ground(90, '#132446') + [[34, 40, 0.8], [80, 30, 0.95], [126, 40, 0.8]].map(([x, y, s]) => aureline(S, x, y, s, { item: 'lance', garb: 'armour', halos: 1, lean: -0.6 })).join(''),
  aureline_archon: (S) => S.glow(80, 30, 50, '#ffd98a', 0.4) + aureline(S, 64, 30, 1.3, { item: 'staff', halos: 3, crown: true, eye: '#c0392b', cloak: '#ffcf8a', garb: 'armour', sash: '#8a2be2' }),
  the_sun_throne: (S) => S.glow(80, 40, 70, '#fff3c4', 0.5) + S.sun(80, 30, 16, '#ffd98a', 14) + `<path d="M50 90 L56 52 L72 60 L80 46 L88 60 L104 52 L110 90 Z" fill="${S.linear([[0, '#fff3c4'], [1, '#b8862a']])}" stroke="#fff" stroke-width="0.8"/>`,
  gilded_lens: (S) => `<circle cx="80" cy="50" r="24" fill="${S.radial([[0, '#ffffff', 0.7], [1, '#ffd98a', 0.2]])}" stroke="#ffd98a" stroke-width="4"/>` + S.beam(8, 50, 56, 50, 2, '#ffd98a') + S.beam(104, 50, 156, 40, 3, '#fff3c4'),
  radiant_hymn: (S) => S.sun(80, 22, 7, '#fff3c4', 10) + [40, 80, 120].map((x, i) => S.rings(x, 64, 6, 3, 6, '#ffd98a', 0.7) + S.glow(x, 64, 8, i === 1 ? '#fff' : '#ffd98a', 0.7)).join(''),
  solar_aegis: (S) => S.sun(80, 30, 9, '#ffd98a', 10) + `<path d="M80 40 L108 50 L102 80 L80 92 L58 80 L52 50 Z" fill="${S.linear([[0, '#fff3c4'], [1, '#4d6fae']])}" stroke="#fff" stroke-width="1"/>`,
  aureline_cantor: (S) => S.rings(110, 30, 6, 4, 7, '#ffd98a', 0.5) + aureline(S, 60, 30, 1.2, { item: 'orb', halos: 2, eye: '#2a9fd0', cloak: '#dff2ff', garb: 'vestment', sash: '#ffd98a' }),
  lance_volley: (S) => [14, 30, 46].map((y, i) => S.beam(6, y + 20, 150, y + 4, 1.8, i === 1 ? '#fff3c4' : '#ffd98a')).join('') + S.planet(140, 80, 16, '#e8c98f', '#4d6fae'),
  glory_charge: (S) => S.ground(88, '#132446') + S.beam(10, 70, 150, 34, 4, '#fff3c4') + S.sun(150, 34, 8, '#fff', 8) + S.motes(60, 70, 20, 40, '#ffd98a', 1.2),
  banner_of_dawn: (S) => S.ground(90, '#132446') + `<line x1="60" y1="90" x2="60" y2="14" stroke="#dfe6f0" stroke-width="2"/><path d="M60 16 C80 10 96 24 116 18 L116 48 C96 54 80 40 60 46 Z" fill="${S.linear([[0, '#ffd98a'], [1, '#e06030']], 0, 0, 1, 0)}"/>` + S.sun(88, 32, 5, '#fff', 6),
  halo_sentinel: (S) => aureline(S, 66, 30, 1.25, { item: 'shield', halos: 2, eye: '#2a6fd0', cloak: '#c8dcff', garb: 'armour', sash: '#ffd98a' }),
  prism_of_dawn: (S) => S.crystal(80, 52, 50, 26, 0, '#fff3c4') + S.beam(8, 30, 70, 50, 2, '#ffe2a0') + S.beam(90, 52, 156, 30, 2, '#ff9a6a') + S.beam(90, 56, 156, 76, 2, '#8fd0ff'),
  sunfire_volley: (S) => S.sun(30, 30, 12, '#ffd98a', 10) + [44, 58, 72].map((y) => S.beam(36, 34, 154, y, 1.8, '#ffb070')).join('') + S.waves(84, '#8fd0ff', 2, 2, 0.6),
  aureline_quartermaster: (S) => S.ground(92, '#132446') + aureline(S, 52, 32, 1.15, { item: 'none', halos: 1, cloak: '#e9c98f', garb: 'robe', sash: '#2f5fb8' }) + [110, 124, 138].map((x, i) => `<line x1="${x}" y1="86" x2="${x + 4}" y2="${30 + i * 6}" stroke="#ffd98a" stroke-width="2"/>`).join(''),
  helio_bastion: (S) => S.ground(86, '#132446') + `<polygon points="50,86 56,30 104,30 110,86" fill="${S.linear([[0, '#e6ecf5'], [1, '#4d6fae']])}" stroke="#fff" stroke-width="0.8"/>` + S.sun(80, 24, 8, '#ffd98a', 8) + S.waves(70, '#8fd0ff', 2, 2, 0.5),
  aureline_vanguard: (S) => S.planet(24, 88, 20, '#e8c98f', '#4d6fae') + aureline(S, 80, 32, 1.25, { item: 'shield', lean: 1, halos: 1, eye: '#c0392b', cloak: '#ffcf8a', garb: 'armour' }),
  sunlance_charge: (S) => S.panel(20, 40, 30, 22, 6) + S.beam(48, 50, 156, 50, 4, '#fff3c4') + S.glow(48, 50, 14, '#fff', 0.9) + S.rings(140, 50, 6, 3, 8, '#ffd98a', 0.6),

  // ---- Xel'Naru ----
  shard_lancer: (S) => xelnaru(S, 56, 32, 1.3, { item: 'blade', shard: '#ff9ab0' }) + S.beam(84, 40, 156, 30, 2, '#ffb3c2'),
  searing_core: (S) => S.glow(80, 52, 40, '#ffb3c2', 0.6) + [0, 60, 120, 180, 240, 300].map((a) => S.crystal(80 + Math.cos((a * Math.PI) / 180) * 24, 52 + Math.sin((a * Math.PI) / 180) * 20, 22, 8, a + 90)).join('') + S.sun(80, 52, 9, '#ffe0ea', 6),
  crystal_bloom: (S) => S.ground(88, '#1b0c24') + [-2, -1, 0, 1, 2].map((k) => S.crystal(80 + k * 14, 66 - (2 - Math.abs(k)) * 8, 26 + (2 - Math.abs(k)) * 10, 10, k * 14, k % 2 ? '#c9a2ff' : '#9fd0ff')).join(''),
  fault_line: (S) => S.planet(80, 96, 50, '#e8a2a8', '#2c1638') + S.bolt(40, 60, 120, 62, '#ffe0ea', 8, 1.6) + S.glow(80, 60, 20, '#ffb3c2', 0.6),
  echo_shard: (S) => [0, 1, 2].map((i) => S.crystal(56 + i * 24, 52, 40 - i * 6, 14 - i * 2, 10, '#ffb3c2', 1 - i * 0.3)).join(''),
  shatter_point: (S) => S.card(80, 52, 0, '#c9a2ff', 30) + [0, 72, 144, 216, 288].map((a) => S.crystal(80 + Math.cos((a * Math.PI) / 180) * 34, 52 + Math.sin((a * Math.PI) / 180) * 26, 14, 6, a, '#ffe0ea')).join('') + S.glow(80, 52, 18, '#fff', 0.6),
  prism_ward: (S) => S.crystal(80, 50, 64, 30, 0, '#9fd0ff') + S.dome(80, 86, 50, '#c9a2ff'),
  xelnaru_oracle: (S) => S.glow(80, 30, 40, '#c9a2ff', 0.4) + xelnaru(S, 70, 32, 1.3, { item: 'lens', shard: '#d0b0ff', core: '#fff6f0', cape: '#8a5ab0' }),
  molten_cascade: (S) => S.glow(80, 20, 40, '#ffb070', 0.6) + [40, 60, 80, 100, 120].map((x, i) => `<path d="M${x} 10 Q${x + 6} ${40 + i * 3} ${x - 4} 92" fill="none" stroke="${i % 2 ? '#ffb3c2' : '#ffd0a0'}" stroke-width="${3 - (i % 2)}" stroke-linecap="round"/>`).join(''),
  shard_storm: (S) => S.glow(80, 50, 60, '#ffb3c2', 0.4) + Array.from({ length: 12 }, (_, i) => S.crystal(14 + i * 12, 20 + ((i * 37) % 60), 14, 5, i * 30, i % 3 ? '#ffb3c2' : '#c9a2ff')).join(''),
  heat_bleed: (S) => S.sun(46, 50, 14, '#ffb3c2', 8) + `<path d="M62 50 Q86 30 110 50" fill="none" stroke="#ffe0ea" stroke-width="2"/>` + S.crystal(124, 52, 40, 16, 0, '#9fd0ff'),
  crystal_matrix: (S) => [[50, 34], [80, 26], [110, 34], [50, 66], [80, 74], [110, 66]].map(([x, y]) => S.crystal(x, y, 18, 8, 0, '#c9a2ff') + `<line x1="80" y1="50" x2="${x}" y2="${y}" stroke="#ffe0ea" stroke-width="0.8" opacity="0.7"/>`).join('') + S.sun(80, 50, 7, '#ffe0ea', 6),
  xelnaru_warden: (S) => S.ground(92, '#1b0c24') + xelnaru(S, 64, 30, 1.35, { item: 'none', bulk: 1.3, pauldrons: true, shard: '#9fd0ff', core: '#e0f4ff' }),
  shard_echo: (S) => S.card(56, 52, -10, '#ffb3c2', 24) + S.card(104, 52, 10, '#ffb3c2', 24).replace('<g ', '<g opacity="0.5" ') + `<path d="M70 28 Q80 18 92 28" fill="none" stroke="#fff" stroke-width="1.6"/>`,
  tactical_withdrawal: (S) => S.card(108, 50, 8, '#bfe6ff', 26) + S.card(56, 54, -10, '#bfe6ff', 22).replace('<g ', '<g opacity="0.55" ') + `<path d="M98 30 Q80 16 62 32" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M62 32 l2 -6 M62 32 l6 1" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` + S.glow(56, 54, 16, '#dff2ff', 0.6),
  rally_banner: (S) => S.ground(90, '#132446') + `<line x1="70" y1="92" x2="70" y2="16" stroke="${S.linear([[0, '#fff3c4'], [1, '#a8761e']])}" stroke-width="2.4"/><path d="M71 18 Q96 14 116 22 Q104 32 116 42 Q96 36 71 40 Z" fill="${S.linear([[0, '#ffd98a'], [1, '#c0392b']], 0, 0, 1, 0)}"/>` + S.sun(92, 29, 3.5, '#fff3c4', 6) + S.glow(70, 16, 8, '#fff', 0.8),
  spore_return: (S) => S.ground(90, '#0e0a1c') + [[50, 70], [80, 56], [110, 70]].map(([x, y]) => S.glow(x, y, 10, '#c5ff8a', 0.7) + `<circle cx="${x}" cy="${y}" r="5" fill="${S.radial([[0, '#f0ffd0'], [1, '#6f8f5a']])}"/>`).join('') + `<path d="M118 40 Q80 10 42 40" fill="none" stroke="#d59cff" stroke-width="1.6" stroke-dasharray="3 3"/>` + S.motes(80, 40, 18, 60, '#c5ff8a', 1),
  overcharge: (S) => S.sun(80, 52, 18, '#ffb3c2', 14) + S.rings(80, 52, 28, 3, 10, '#ffe0ea', 0.6) + S.bolt(80, 10, 80, 90, '#fff', 6, 1.2),
  refraction_veil: (S) => `<path d="M20 10 Q80 50 20 90" fill="none" stroke="#ffe2a0" stroke-width="3"/>` + S.beam(150, 30, 60, 50, 2, '#ffb070') + S.beam(60, 50, 130, 86, 1.6, '#ffe2a0'),
  shard_mother: (S) => S.glow(80, 30, 60, '#ffb3c2', 0.4) + xelnaru(S, 80, 36, 1.4, { crown: true, cape: '#ff9ab0', shard: '#ffc8e0', bulk: 1.15 }) + S.motes(80, 70, 12, 60, '#ffe0ea', 1),
  fracture_burst: (S) => S.glow(80, 50, 70, '#ffe0ea', 0.6) + S.sun(80, 50, 14, '#fff', 16) + Array.from({ length: 10 }, (_, i) => S.crystal(80 + Math.cos(i * 0.63) * 50, 50 + Math.sin(i * 0.63) * 34, 12, 5, i * 36 + 90, '#ffb3c2')).join(''),
  cinder_ward: (S) => S.dome(80, 80, 46, '#ffb3c2') + S.motes(80, 70, 20, 40, '#ffd0a0', 1.4) + S.crystal(80, 60, 30, 12, 0, '#9fd0ff'),

  // ---- Vorthane ----
  vorthane_tidecaller: (S) => S.waves(86, S.p.accent, 3, 3, 0.7) + vorthane(S, 70, 34, 1.15, { item: 'trident', eyes: 4, bell: '#7ff0e0' }),
  brine_lash: (S) => S.dome(40, 86, 30, '#7ff0e0') + `<path d="M50 70 C80 20 110 80 150 30" fill="none" stroke="#dffff8" stroke-width="3" stroke-linecap="round"/>` + S.glow(150, 30, 10, '#fff', 0.8),
  kelp_wall: (S) => [30, 50, 70, 90, 110, 130].map((x, i) => `<path d="M${x} 100 Q${x + (i % 2 ? 10 : -10)} 60 ${x} ${18 + (i % 3) * 6}" fill="none" stroke="${i % 2 ? '#3fae8a' : '#58a9a0'}" stroke-width="6" stroke-linecap="round"/>`).join('') + S.dome(80, 96, 60, '#7ff0e0'),
  abyss_lantern: (S) => [[50, 40, 0.85], [110, 46, 0.75]].map(([x, y, s]) => vorthane(S, x, y, s, { item: 'lantern', eyes: 4, reach: 0.7 })).join('') + S.motes(80, 70, 14, 60, '#ffd98a', 1),
  pressure_wave: (S) => S.rings(40, 50, 10, 6, 12, '#7ff0e0', 0.8) + S.card(130, 50, 12, '#58a9a0', 18),
  coral_bastion: (S) => S.ground(88, '#031520') + [[50, 60, 30], [80, 50, 44], [110, 62, 28]].map(([x, y, h]) => `<path d="M${x} 90 L${x} ${y} M${x} ${y + 12} L${x - 10} ${y + 2} M${x} ${y + 18} L${x + 10} ${y + 8}" stroke="#ff9a8a" stroke-width="4" stroke-linecap="round"/>` + S.glow(x, y, h / 4, '#ffb0a0', 0.6)).join('') + S.dome(80, 90, 56, '#7ff0e0'),
  riptide: (S) => `<path d="M10 70 C40 30 80 30 90 50 C100 70 70 80 70 64 C70 52 86 52 88 58" fill="none" stroke="#7ff0e0" stroke-width="3" stroke-linecap="round"/>` + S.waves(80, S.p.accent, 3, 2, 0.6) + S.glow(88, 58, 8, '#fff', 0.8),
  deep_hymn: (S) => S.glow(80, 40, 50, '#7ff0e0', 0.35) + S.rings(80, 40, 8, 5, 9, '#dffff8', 0.6) + S.waves(84, S.p.accent, 2, 3, 0.6),
  jelly_swarm: (S) => [[30, 30, 0.5], [60, 48, 0.6], [94, 26, 0.55], [124, 50, 0.5], [76, 18, 0.4]].map(([x, y, s], i) => vorthane(S, x, y, s, { eyes: 3, reach: 0.9, bell: i % 2 ? '#9ff0d8' : '#7fd8f0' })).join(''),
  undertow_shrine: (S) => S.ground(88, '#031520') + `<path d="M56 88 L56 46 Q80 26 104 46 L104 88" fill="${S.linear([[0, '#58a9a0'], [1, '#0f5563']])}" stroke="#7ff0e0"/>` + S.glow(80, 60, 14, '#dffff8', 0.8) + S.waves(70, '#dffff8', 2, 2, 0.4),
  maelstrom: (S) => [40, 32, 24, 16, 8].map((r, i) => S.orbit(80, 50, r * 1.7, r, i * 20, i % 2 ? '#7ff0e0' : '#dffff8', 1.6, 0.8)).join('') + `<circle cx="80" cy="50" r="5" fill="#031520"/>`,
  tidal_surge: (S) => `<path d="M-5 90 Q40 20 90 50 Q120 70 165 30 L165 105 L-5 105 Z" fill="${S.linear([[0, '#7ff0e0', 0.8], [1, '#0f5563', 0.9]])}"/>` + S.dome(120, 86, 30, '#dffff8') + S.planet(30, 24, 8, '#9cd2a0', '#23584a'),
  vorthane_elder: (S) => S.glow(80, 30, 50, '#7ff0e0', 0.3) + vorthane(S, 80, 34, 1.4, { eyes: 7, helm: true, reach: 1.2, bell: '#b0f0e8' }),
  stinging_coral: (S) => S.ground(90, '#031520') + [40, 64, 88, 112].map((x, i) => `<path d="M${x} 90 L${x + 4} ${44 + (i % 2) * 10}" stroke="#ff8a9a" stroke-width="4" stroke-linecap="round"/>` + S.glow(x + 4, 44 + (i % 2) * 10, 5, '#ffd0d8', 0.9)).join('') + S.dome(80, 90, 60, '#7ff0e0'),
  sunken_bell: (S) => S.ground(92, '#031520') + `<path d="M60 84 Q60 40 80 36 Q100 40 100 84 Z" fill="${S.linear([[0, '#d8c08a'], [1, '#5a4a2a']])}" stroke="#fff3c4" stroke-width="0.8"/>` + S.rings(80, 50, 30, 3, 10, '#7ff0e0', 0.5),
  ink_cloud: (S) => S.motes(80, 50, 40, 60, '#031520', 6) + S.glow(80, 50, 30, '#0f5563', 0.8) + S.dome(80, 80, 34, '#7ff0e0') + S.card(132, 30, 12, '#58a9a0', 14),
  abyssal_snap: (S) => `<path d="M30 30 Q80 70 130 30" fill="none" stroke="#dffff8" stroke-width="3"/><path d="M30 76 Q80 36 130 76" fill="none" stroke="#dffff8" stroke-width="3"/>` + S.card(80, 52, 0, '#58a9a0', 16) + S.glow(80, 52, 20, '#7ff0e0', 0.6),
  trench_warden: (S) => S.ground(92, '#031520') + vorthane(S, 66, 34, 1.3, { item: 'bell', helm: true, eyes: 6, bell: '#5fc0b0' }),
  tidebreaker: (S) => S.waves(70, '#dffff8', 5, 3, 0.8) + S.card(110, 30, 24, '#58a9a0', 18) + `<path d="M110 50 Q130 70 150 60" fill="none" stroke="#fff" stroke-width="1.4"/>`,

  // ---- Ixquor ----
  spore_drone: (S) => S.ground(92, '#0e0a1c') + ixquor(S, 64, 66, 0.95, { item: 'spores', arms: 2, cap: '#9fd0ff' }),
  chitin_spire: (S) => S.ground(92, '#0e0a1c') + `<path d="M64 92 L74 20 L86 20 L96 92 Z" fill="${S.linear([[0, '#d59cff'], [1, '#3d2b5e']])}" stroke="#c5ff8a" stroke-width="0.8"/>` + [30, 46, 62, 78].map((y) => `<path d="M70 ${y + 8} L90 ${y}" stroke="#c5ff8a" stroke-width="1" opacity="0.6"/>`).join('') + S.dome(80, 92, 40, '#c5ff8a'),
  hive_warrior: (S) => S.ground(92, '#0e0a1c') + ixquor(S, 70, 68, 1.1, { arms: 4, cap: '#ff9a8a', tall: 1.1 }),
  seed_pod: (S) => S.ground(92, '#0e0a1c') + `<ellipse cx="80" cy="60" rx="20" ry="26" fill="${S.radial([[0, '#e8ffd0'], [1, '#3f7a3a']])}"/>` + S.glow(80, 56, 16, '#c5ff8a', 0.6),
  bloom_burst: (S) => [[40, 70], [80, 60], [120, 72], [60, 40], [100, 38]].map(([x, y], i) => S.mushroom(x, y + 20, 14, 18, i % 2 ? '#d59cff' : '#c5ff8a')).join('') + S.motes(80, 30, 26, 70, '#c5ff8a', 1.2),
  creeping_vines: (S) => [0, 1, 2].map((i) => `<path d="M-5 ${80 - i * 12} C40 ${50 - i * 10} 80 ${90 - i * 10} 165 ${40 + i * 10}" fill="none" stroke="${i % 2 ? '#6f8f5a' : '#9cd28a'}" stroke-width="${3 - i * 0.6}"/>`).join('') + S.card(124, 40, 14, '#d59cff', 16),
  hive_mind: (S) => S.glow(80, 50, 50, '#d59cff', 0.4) + [[50, 34], [110, 34], [50, 70], [110, 70], [80, 22], [80, 82]].map(([x, y]) => `<line x1="80" y1="52" x2="${x}" y2="${y}" stroke="#c5ff8a" stroke-width="1" opacity="0.7"/>` + S.glow(x, y, 6, '#c5ff8a', 0.9)).join('') + S.glow(80, 52, 12, '#fff', 0.8),
  mycelial_net: (S) => S.ground(70, '#0e0a1c', 2) + Array.from({ length: 9 }, (_, i) => `<path d="M${10 + i * 18} 100 Q${20 + i * 18} 80 ${14 + i * 18} 70" fill="none" stroke="#c5ff8a" stroke-width="1" opacity="0.7"/>`).join('') + [40, 80, 120].map((x) => S.mushroom(x, 70, 20, 22, '#d59cff')).join(''),
  sporelings: (S) => S.ground(92, '#0e0a1c') + [[40, 76, 0.55], [80, 70, 0.65], [120, 78, 0.5]].map(([x, y, s]) => ixquor(S, x, y, s, { arms: 2, item: 'spores' })).join(''),
  brood_chamber: (S) => [[60, 40], [80, 52], [100, 40], [70, 66], [90, 66], [80, 28]].map(([x, y]) => S.hex(x, y, 12, S.radial([[0, '#e8ffd0'], [1, '#3d2b5e']]), '#c5ff8a')).join('') + S.dome(80, 92, 50, '#c5ff8a'),
  spore_burst: (S) => S.glow(80, 50, 50, '#c5ff8a', 0.5) + S.mushroom(80, 92, 30, 40, '#d59cff') + S.motes(80, 34, 40, 70, '#e8ffd0', 1.4),
  root_network: (S) => S.ground(56, '#0e0a1c', 2) + `<path d="M80 56 C70 70 50 76 30 96 M80 56 C90 74 110 80 134 96 M80 56 L80 98" fill="none" stroke="#c5ff8a" stroke-width="1.6"/>` + S.card(80, 30, 0, '#d59cff', 18),
  ixquor_gardener: (S) => S.ground(92, '#0e0a1c') + ixquor(S, 54, 66, 1, { item: 'pods', arms: 3, cap: '#e8ffd0' }) + S.mushroom(120, 92, 18, 20, '#c5ff8a'),
  thorn_hedge: (S) => S.ground(88, '#0e0a1c') + Array.from({ length: 7 }, (_, i) => `<path d="M${20 + i * 20} 90 L${26 + i * 20} ${50 + (i % 2) * 10} L${32 + i * 20} 90" fill="#3f6a3a" stroke="#c5ff8a" stroke-width="0.6"/>`).join('') + S.glow(80, 56, 20, '#c5ff8a', 0.4),
  husk_shell: (S) => `<path d="M40 86 Q40 30 80 24 Q120 30 120 86 Z" fill="${S.linear([[0, '#d59cff', 0.8], [1, '#3d2b5e', 0.9]])}" stroke="#c5ff8a"/>` + [44, 58, 72].map((y) => `<path d="M46 ${y} Q80 ${y - 8} 114 ${y}" fill="none" stroke="#c5ff8a" stroke-width="0.8" opacity="0.6"/>`).join(''),
  spore_trap: (S) => S.mushroom(80, 92, 24, 50, '#ffe2a0') + S.motes(80, 40, 24, 50, '#fff6dc', 1.2) + S.card(130, 30, 14, '#ffe2a0', 14),
  overgrowth: (S) => Array.from({ length: 8 }, (_, i) => S.mushroom(12 + i * 20, 100, 30 + ((i * 13) % 30), 18, i % 2 ? '#d59cff' : '#c5ff8a', (i - 4) * 2)).join(''),
  fruiting_body: (S) => S.ground(92, '#0e0a1c') + S.mushroom(80, 92, 44, 56, '#ff9a8a') + S.glow(80, 40, 24, '#ffb070', 0.5),
  ixquor_broodguard: (S) => S.ground(92, '#0e0a1c') + ixquor(S, 64, 68, 1.1, { arms: 3, cap: '#9fd0ff', tall: 0.95 }) + S.dome(64, 92, 40, '#c5ff8a'),
  // ---- Energy dumps ----
  solar_torrent: (S) => S.sun(24, 30, 12, '#ffd98a', 10) + [26, 40, 54, 68, 82].map((y, i) => S.beam(30, 34, 158, y, 2.4 - i * 0.2, i % 2 ? '#ffb070' : '#ffe0a0')).join(''),
  deep_freeze: (S) => S.planet(80, 98, 40, '#dff2ff', '#2a5585') + [36, 58, 80, 102, 124].map((x, i) => S.crystal(x, 58 - (i % 2) * 10, 34, 10, (i - 2) * 8, '#bfe6ff')).join('') + S.motes(80, 30, 30, 70, '#ffffff', 1.2),
  overflow_archive: (S) => [0, 1, 2, 3, 4].map((i) => S.card(40 + i * 20, 70 - i * 9, -20 + i * 10, i % 2 ? '#c8ffd0' : '#fff3b0', 18)).join('') + S.glow(120, 30, 20, '#c8ffd0', 0.6),
  radiant_barrage: (S) => S.ground(90, '#132446') + [20, 44, 68].map((x) => S.beam(x, 90, x + 90, 16, 2, '#fff3c4')).join('') + S.dome(40, 90, 30, '#ffd98a'),
  meltdown: (S) => S.glow(80, 60, 70, '#ffb070', 0.6) + S.sun(80, 60, 18, '#ffb3c2', 16) + [0, 1, 2, 3, 4, 5].map((i) => S.crystal(80 + Math.cos(i) * 46, 60 + Math.sin(i) * 30, 16, 6, i * 50, '#ffe0ea')).join(''),
  abyssal_rampart: (S) => [62, 46, 30].map((r, i) => S.dome(80, 92, r + 10, i === 2 ? '#dffff8' : '#7ff0e0')).join('') + S.waves(90, '#7ff0e0', 2, 2, 0.6),
  hive_surge: (S) => S.ground(92, '#0e0a1c') + Array.from({ length: 6 }, (_, i) => S.mushroom(22 + i * 24, 96, 20 + (i % 3) * 10, 16, i % 2 ? '#c5ff8a' : '#9fd0ff')).join('') + S.motes(80, 40, 30, 70, '#c5ff8a', 1.2),
  // ---- Defence that answers at once ----
  frost_bulwark: (S) => S.dome(80, 86, 50, '#bfe6ff') + S.hex(80, 56, 16, S.linear([[0, '#ffffff', 0.9], [1, '#9fd0ff', 0.5]]), '#fff') + S.motes(80, 40, 22, 60, '#ffffff', 1.1),
  glacier_shell: (S) => `<path d="M30 90 L52 30 L70 54 L86 18 L104 50 L120 34 L134 90 Z" fill="${S.linear([[0, '#ffffff'], [1, '#7fb6e6']])}" stroke="#fff" stroke-width="0.8"/>` + S.dome(80, 90, 62, '#bfe6ff'),
  stellar_aegis: (S) => S.glow(80, 60, 70, '#dff2ff', 0.6) + S.dome(80, 92, 74, '#ffffff') + S.dome(80, 92, 52, '#9fd0ff') + S.sun(80, 72, 8, '#ffffff', 10),
  solar_bastion: (S) => S.ground(88) + `<polygon points="40,88 48,40 64,40 64,28 96,28 96,40 112,40 120,88" fill="${S.linear([[0, '#e6ecf5'], [1, '#4a5a74']])}" stroke="#fff" stroke-width="0.8"/>` + S.sun(80, 20, 7, '#ffd98a', 10) + S.dome(80, 88, 64, '#bfe6ff'),
  dawn_rampart: (S) => S.sun(80, 26, 8, '#ffd98a', 10) + [44, 62, 80, 98, 116].map((x) => `<rect x="${x - 7}" y="48" width="14" height="40" rx="2" fill="${S.linear([[0, '#fff3c4'], [1, '#4d6fae']])}" stroke="#fff" stroke-width="0.6"/>`).join('') + S.dome(80, 88, 56, '#ffd98a'),
  prism_sanctum: (S) => S.ground(90, '#1b0c24') + S.crystal(80, 54, 60, 28, 0, '#9fd0ff') + S.crystal(50, 66, 34, 14, -12, '#c9a2ff') + S.crystal(110, 66, 34, 14, 12, '#c9a2ff') + S.glow(80, 50, 30, '#dff2ff', 0.5),
  leviathan_shell: (S) => `<path d="M20 90 Q80 6 140 90 Z" fill="${S.linear([[0, '#58a9a0'], [1, '#063040']])}" stroke="#7ff0e0" stroke-width="1.2"/>` + [30, 44, 58, 72].map((y) => `<path d="M${30 + (y - 30) * 0.3} ${y + 14} Q80 ${y - 20} ${130 - (y - 30) * 0.3} ${y + 14}" fill="none" stroke="#7ff0e0" stroke-width="0.8" opacity="0.6"/>`).join('') + S.glow(80, 60, 14, '#dffff8', 0.8),
  chitin_fortress: (S) => S.ground(90, '#0e0a1c') + [[54, 70, 18], [80, 58, 24], [106, 70, 18]].map(([x, y, r]) => S.hex(x, y, r, S.linear([[0, '#d59cff'], [1, '#3d2b5e']]), '#c5ff8a')).join('') + S.dome(80, 90, 60, '#c5ff8a'),
  hive_tyrant: (S) => S.glow(80, 30, 60, '#ff9a8a', 0.35) + ixquor(S, 80, 70, 1.25, { arms: 5, cap: '#ff9a8a', tall: 1.1, crown: true }),
  // ---- The bombs ----
  dawnstar_cannon: (S) => S.ground(86, '#132446') + S.panel(36, 52, 56, 24, 5) + S.panel(78, 44, 50, 12, 4) + S.beam(128, 50, 158, 30, 3, '#fff3c4') + S.sun(132, 48, 6, '#ffd98a', 8),
  aureline_sunguard: (S) => S.dome(80, 92, 70, '#ffe7b0') + aureline(S, 80, 34, 1.3, { item: 'shield', halos: 3, garb: 'armour', eye: '#2a6fd0', cloak: '#ffe7b0' }),
  hymn_of_the_sun: (S) => S.sun(80, 40, 22, '#ffd98a', 16) + [24, 56, 104, 136].map((x, i) => S.beam(x, 92, 80, 42, 1.4 + (i % 2) * 0.6, '#fff3c4')).join('') + S.motes(80, 60, 20, 70, '#fff3c4', 1.2),
  prism_colossus: (S) => S.glow(80, 44, 70, '#ffb3c2', 0.4) + xelnaru(S, 80, 30, 1.9, { bulk: 1.4, pauldrons: true, shard: '#ff9ab0', core: '#ffffff', item: 'blade' }),
  shard_tempest: (S) => [10, 30, 50, 70, 90, 110, 130, 150].map((x, i) => `<polygon points="${x},${20 + (i % 3) * 14} ${x + 6},${34 + (i % 3) * 14} ${x - 4},${40 + (i % 3) * 14}" fill="${S.linear([[0, '#fff'], [1, '#ff7a9a']])}" opacity="0.9"/>`).join('') + S.glow(80, 60, 40, '#ffb3c2', 0.6) + S.bolt(20, 20, 140, 80, '#ffe0ea', 6, 2),
  crystal_reliquary: (S) => S.ground(88, '#1b0c24') + `<path d="M56 86 L60 46 L80 34 L100 46 L104 86 Z" fill="${S.linear([[0, '#f0c0d0'], [1, '#6b2f5e']])}" stroke="#fff" stroke-width="0.8"/>` + S.glow(80, 58, 20, '#fff0c0', 0.9) + S.card(122, 46, 12, '#ffb3c2', 16) + S.card(38, 46, -12, '#ffb3c2', 16),
  abyssal_titan: (S) => S.waves(94, S.p.accent, 2, 2, 0.5) + vorthane(S, 80, 34, 2.1, { helm: true, eyes: 8, item: 'trident', reach: 0.6, bell: '#8fe0d0' }),
  tidal_wave: (S) => `<path d="M0 90 Q40 20 90 40 Q120 52 104 70 Q140 50 160 64 L160 100 L0 100 Z" fill="${S.linear([[0, '#9ff0f0'], [1, '#0f5563']])}"/>` + S.waves(80, '#dffff8', 3, 2, 0.6) + S.motes(90, 40, 20, 50, '#ffffff', 1),
  pressure_dome: (S) => S.ground(90, '#031520') + S.dome(80, 90, 60, '#7ff0e0') + S.dome(80, 90, 44, '#bff8f0') + S.rings(80, 70, 30, 3, 10, '#7ff0e0', 0.4),
  hive_colossus: (S) => S.glow(80, 30, 70, '#c5ff8a', 0.3) + ixquor(S, 80, 72, 1.5, { arms: 7, tall: 1.2, cap: '#c5ff8a' }) + S.motes(80, 30, 20, 70, '#c5ff8a', 1),
  sporestorm: (S) => S.ground(90, '#0e0a1c') + S.motes(80, 50, 40, 80, '#c5ff8a', 1.8) + S.motes(80, 40, 30, 70, '#d59cff', 1.4) + S.glow(80, 50, 40, '#c5ff8a', 0.4),
  great_mycelium: (S) => S.ground(70, '#0e0a1c') + [24, 52, 80, 108, 136].map((x, i) => `<path d="M${x} 70 q${i % 2 ? 8 : -8} 14 ${i % 2 ? -2 : 2} 30" fill="none" stroke="#c5ff8a" stroke-width="1.6" opacity="0.8"/>` + S.glow(x, 66, 8, '#c5ff8a', 0.7)).join('') + ixquor(S, 80, 66, 0.9, { arms: 4, item: 'pods' }),
  dreadnought: (S) => S.planet(130, 86, 26, '#a9b3c4', '#1a1f2a') + `<polygon points="14,58 60,40 130,46 150,54 130,62 60,68" fill="${S.linear([[0, '#e6ecf5'], [1, '#56657e']])}" stroke="#fff" stroke-width="0.6"/>` + S.glow(150, 54, 8, '#ffb070', 0.9) + S.beam(60, 54, 6, 54, 1.6, '#9fd0ff'),
  star_breaker: (S) => S.planet(118, 54, 24, '#e08a5a', '#5a2a1a') + S.bolt(10, 20, 112, 50, '#fff3c4', 6, 2.4) + S.motes(118, 54, 18, 40, '#ffb070', 1.4) + S.glow(112, 50, 14, '#fff', 0.9),
  fusion_reactor: (S) => S.panel(48, 30, 64, 54, 8) + S.sun(80, 56, 12, '#ffd98a', 10) + S.orbit(80, 56, 22, 8, -20, '#9fd0ff', 1.4) + S.orbit(80, 56, 22, 8, 40, '#9fd0ff', 1.4),
};
Object.assign(ART, ART2);

/** Fusion cards: a piece grafted onto another, shown as a part joining a plate with a seam of light. */
const ART_FUSION: Record<string, Draw> = {
  thermal_graft: (S) => S.panel(40, 44, 50, 34, 6) + S.glow(98, 60, 22, '#ffb070', 0.8) + S.sun(98, 60, 8, '#ffd98a', 8) + S.beam(90, 60, 66, 60, 1.6, '#ffd98a'),
  shield_lattice: (S) => S.panel(30, 40, 50, 38, 6) + S.hex(102, 58, 15, 'rgba(160,210,255,0.35)', '#cfe6ff') + S.hex(102, 58, 9, 'rgba(160,210,255,0.25)', '#cfe6ff') + S.beam(88, 58, 80, 58, 1.4, '#cfe6ff'),
  reinforced_plating: (S) => S.panel(36, 32, 60, 46, 4) + S.panel(46, 40, 60, 46, 4) + S.motes(76, 56, 10, 20, '#e6ecf5', 1.2),
  coolant_shunt: (S) => S.panel(30, 42, 48, 36, 6) + S.orbit(104, 60, 16, 6, 0, '#9fe0ff', 1.6) + S.glow(104, 60, 12, '#9fe0ff', 0.6) + S.beam(92, 60, 78, 60, 1.4, '#9fe0ff'),
  data_splice: (S) => S.card(52, 52, -8) + S.card(96, 50, 8) + S.bolt(66, 50, 86, 50, '#d6c8ff', 4, 1.4),
  sunforged_lens: (S) => S.sun(46, 46, 12, '#ffd98a', 12) + S.rings(104, 56, 6, 3, 5, '#ffe7a8', 0.8) + S.beam(58, 48, 98, 56, 2.2, '#ffe7a8'),
  shard_splice: (S) => S.crystal(56, 74, 34, 14, -8, '#e8d6ff') + S.crystal(96, 74, 30, 12, 10, '#ffd0e8') + S.bolt(64, 50, 90, 52, '#fff', 4, 1.2),
  tidal_graft: (S) => S.ground(86, '#031520') + S.dome(58, 80, 26, '#7ff0e0') + S.dome(104, 80, 16, '#bff8f0') + S.waves(84, '#9ff0f0', 2, 2, 0.6),
  barnacle_shell: (S) => S.dome(80, 78, 34, '#9fd8d0') + [56, 70, 84, 98].map((x, i) => S.dome(x, 78 - (i % 2) * 4, 7, '#e6fff8')).join('') + S.motes(80, 50, 10, 30, '#bff8f0', 1),
  siphon_tendril: (S) => S.dome(56, 74, 22, '#7ff0e0') + `<path d="M74 70 Q96 52 118 64 T142 50" fill="none" stroke="#9ff0f0" stroke-width="3" stroke-linecap="round"/>` + S.glow(142, 50, 8, '#ffb070', 0.8),
  sap_graft: (S) => S.ground(86, '#0e0a1c') + S.mushroom(70, 86, 34, 20, '#d59cff') + S.glow(92, 58, 12, '#9fe0ff', 0.7) + S.motes(92, 58, 10, 16, '#9fe0ff', 1.2),
  thorn_graft: (S) => S.ground(86, '#0e0a1c') + S.mushroom(66, 86, 30, 18, '#c5ff8a') + `<path d="M84 70 L118 46 M92 74 L124 62 M88 60 L110 34" stroke="#ffb070" stroke-width="2.2" stroke-linecap="round"/>` + S.glow(118, 46, 6, '#ffb070', 0.9),
  spore_catalyst: (S) => S.ground(86, '#0e0a1c') + S.glow(80, 50, 36, '#c5ff8a', 0.45) + S.mushroom(80, 86, 40, 26, '#c5ff8a') + S.rings(80, 48, 14, 3, 9, '#c5ff8a', 0.6) + S.mushroom(46, 86, 16, 10, '#d59cff', -6) + S.mushroom(114, 86, 16, 10, '#d59cff', 6),
  seed_burst: (S) => S.ground(88, '#0e0a1c') + S.motes(80, 52, 30, 46, '#c5ff8a', 1.6) + S.glow(80, 52, 16, '#c5ff8a', 0.6) + [44, 64, 96, 116].map((x) => S.mushroom(x, 88, 10, 7, '#d59cff')).join(''),
  sapling: (S) => S.ground(88, '#0e0a1c') + `<path d="M80 88 C80 70 78 62 80 50" stroke="#c9f0a0" stroke-width="2.4" fill="none"/><path d="M80 62 C70 54 62 56 60 50 C70 48 76 52 80 58Z" fill="#9fe07a"/><path d="M80 56 C90 48 98 50 100 44 C90 42 84 46 80 52Z" fill="#b8f08a"/>` + S.glow(80, 50, 10, '#c5ff8a', 0.5),
  spore_graft: (S) => S.ground(86, '#0e0a1c') + S.mushroom(58, 86, 30, 18, '#c5ff8a') + S.mushroom(98, 86, 22, 14, '#d59cff', 6) + S.motes(80, 48, 14, 30, '#c5ff8a', 1.2),
};
Object.assign(ART, ART_FUSION);

/** The newer races' pictures: Nyxari, Korrath, Seren and Pyrr. */
const ART_RACES: Record<string, Draw> = {
  // ---- Nyxari: Veilwalkers ----
  nyx_umbral_snare: (S) =>
    S.beam(166, 14, 92, 46, 1.6, '#ffb070') +
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i / 8) * Math.PI * 2 + 0.2; return `<line x1="80" y1="52" x2="${f(80 + Math.cos(a) * 70)}" y2="${f(52 + Math.sin(a) * 50)}" stroke="${S.p.accent}" stroke-width="0.7" stroke-opacity="0.6"/>`; }).join('') +
    [10, 20, 32, 46].map((r) => `<polygon points="${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.2; return `${f(80 + Math.cos(a) * r * 1.3)},${f(52 + Math.sin(a) * r)}`; }).join(' ')}" fill="none" stroke="${S.p.accent}" stroke-width="0.8" stroke-opacity="0.7"/>`).join('') +
    S.glow(84, 50, 16, '#ffb070', 0.8) + S.rings(84, 50, 5, 2, 5, S.p.glow, 0.8),
  nyx_mirror_veil: (S) =>
    S.sun(20, 26, 6, '#ffb070', 8) + S.beam(26, 30, 72, 50, 1.6, '#ffb070') +
    S.glow(82, 52, 34, S.p.accent, 0.4) +
    `<ellipse cx="82" cy="52" rx="18" ry="32" fill="${S.linear([[0, '#3a3270'], [0.5, '#0a0818'], [1, '#2a2450']], 0, 0, 1, 1)}" stroke="#e8e0ff" stroke-width="1.4"/><path d="M72 32 Q70 46 74 62" fill="none" stroke="#fff" stroke-width="1.2" stroke-opacity="0.6"/>` +
    S.sun(84, 48, 2.6, '#ffb070') + S.beam(76, 50, 24, 74, 1.4, '#ffd0a0'),
  nyx_null_shroud: (S) =>
    S.glow(80, 40, 40, '#ffd98a', 0.4) +
    `<path d="M62 44 L58 22 L68 34 L74 16 L80 32 L86 16 L92 34 L102 22 L98 44 Z" fill="${S.linear([[0, '#fff3c4'], [1, '#b8862a']])}"/>` +
    `<path d="M32 96 C40 76 34 54 46 40 Q56 30 64 36 L74 24 L80 34 L86 24 L96 36 Q104 30 114 40 C126 54 120 76 128 96 Z" fill="${S.linear([[0, '#1d1838', 0.96], [1, '#06050e']])}" stroke="${S.p.accent}" stroke-width="0.9" stroke-opacity="0.8"/>` +
    [52, 68, 92, 108].map((x) => `<path d="M${x} 36 Q${x - 3} 64 ${x + 2} 94" fill="none" stroke="${S.p.accent}" stroke-width="0.5" stroke-opacity="0.4"/>`).join('') +
    S.card(136, 26, 14, S.p.glow, 13) + S.motes(80, 70, 12, 50, S.p.glow, 0.9),
  nyx_veil_sentry: (S) =>
    S.ground(84, '#03020a') +
    `<path d="M70 88 L74 26 L80 14 L86 26 L90 88 Z" fill="${S.linear([[0, '#3a3270'], [1, '#07060f']], 0, 0, 1, 0)}" stroke="${S.p.accent}" stroke-width="0.8"/>` +
    S.glow(80, 38, 12, S.p.glow, 0.9) + `<path d="M75 38 Q80 34 85 38 Q80 42 75 38 Z" fill="#fff"/><circle cx="80" cy="38" r="1.3" fill="${S.p.deep}"/>` +
    [-1, 1].map((k) => `<path d="M${80 + k * 8} 30 C${80 + k * 30} 40 ${80 + k * 26} 70 ${80 + k * 40} 90" fill="none" stroke="${S.p.accent}" stroke-width="1.2" stroke-opacity="0.55"/>`).join('') +
    S.dome(80, 88, 46, S.p.accent),
  nyx_veil_lantern: (S) =>
    `<path d="M80 0 V30" stroke="#8a80b8" stroke-width="0.9"/>` + S.glow(80, 50, 40, S.p.glow, 0.5) +
    `<path d="M70 30 H90 L94 36 V62 L90 68 H70 L66 62 V36 Z" fill="${S.p.glow}" fill-opacity="0.25" stroke="#e8e0ff" stroke-width="1"/><path d="M68 30 H92 M66 68 H94 M80 30 V68" stroke="#e8e0ff" stroke-width="0.7" stroke-opacity="0.6"/>` +
    S.sun(80, 50, 5, S.p.glow) +
    [-1, 1].map((k) => `<path d="M${80 + k * 30} 0 C${80 + k * 22} 30 ${80 + k * 40} 60 ${80 + k * 30} 100" fill="none" stroke="${S.p.accent}" stroke-width="5" stroke-opacity="0.18"/>`).join('') +
    S.motes(80, 52, 14, 34, '#e8e0ff', 0.8),
  nyx_night_ambush: (S) =>
    crescent(S, 132, 22, 10, 20, '#e8e0ff') + S.glow(132, 22, 18, '#e8e0ff', 0.3) +
    nyxari(S, 66, 34, 1.15, { item: 'blades', lean: 1.4, eye: '#ff9ad0', wisps: 5 }) +
    [[26, 60], [130, 64]].map(([x, y]) => `<path d="M${x - 3} ${y} L${x} ${y - 1.4} L${x + 3} ${y} M${x + 5} ${y} L${x + 8} ${y - 1.4} L${x + 11} ${y}" stroke="${S.p.glow}" stroke-width="1"/>`).join(''),
  nyx_gloom_warden: (S) =>
    S.ground(92, '#03020a') + nyxari(S, 62, 30, 1.2, { item: 'scythe', cloak: '#241c44', wisps: 6 }) + S.rings(62, 50, 34, 2, 6, S.p.accent, 0.4),
  // ---- Nyxari: Unmakers ----
  nyx_shade_stalker: (S) =>
    S.ground(90, '#03020a') + S.planet(134, 24, 9, '#8a80b8', '#1b1638') + nyxari(S, 58, 40, 1.0, { item: 'blades', lean: 2, cloak: '#141028', wisps: 3 }),
  nyx_dusk_raider: (S) =>
    S.planet(40, 120, 52, '#ff9a6a', '#3a2050') + S.glow(40, 70, 40, '#ff9a6a', 0.35) +
    S.beam(150, 22, 66, 54, 1.2, S.p.accent) +
    `<polygon points="60,58 92,44 84,52 104,50 82,60 90,66" fill="${S.linear([[0, '#3a3270'], [1, '#07060f']])}" stroke="${S.p.glow}" stroke-width="0.7"/>` + S.glow(60, 58, 6, S.p.glow, 0.9),
  nyx_unmaker_blade: (S) =>
    `<g transform="translate(-4 4)">${S.hex(64, 54, 22, S.linear([[0, '#4e4280'], [1, '#1b1638']]), S.p.accent)}</g>` +
    `<g transform="translate(6 -4)" clip-path="none">${S.hex(98, 46, 14, S.linear([[0, '#4e4280'], [1, '#1b1638']]), S.p.accent, 0.8)}</g>` +
    S.glow(84, 50, 26, S.p.glow, 0.5) +
    `<path d="M24 92 C60 70 100 40 146 8 C108 46 74 70 34 96 Z" fill="${S.linear([[0, '#ffffff'], [0.5, '#c8bcff'], [1, '#2a2450']], 0, 1, 1, 0)}" stroke="#fff" stroke-width="0.6"/>` +
    `<line x1="18" y1="98" x2="30" y2="90" stroke="#2a2440" stroke-width="4" stroke-linecap="round"/>` + S.motes(90, 50, 12, 24, '#e8e0ff', 0.9),
  nyx_void_rend: (S) =>
    S.glow(80, 50, 36, S.p.accent, 0.5) +
    `<path d="M70 6 L84 24 L74 40 L90 56 L78 72 L88 96 L96 72 L86 56 L100 40 L90 24 Z" fill="#000" stroke="#e8e0ff" stroke-width="1.4" stroke-linejoin="round"/>` +
    S.motes(86, 50, 14, 10, S.p.glow, 0.8) + S.card(120, 64, 18, S.p.glow, 13) + `<path d="M96 54 Q108 54 114 58" fill="none" stroke="#e8e0ff" stroke-width="0.8" stroke-dasharray="2 2"/>` +
    [[40, 30], [44, 70], [126, 30]].map(([x, y]) => S.hex(x, y, 3.4, '#2a2450', S.p.accent, 0.7)).join(''),
  nyx_unravel: (S) =>
    S.card(50, 50, -10, S.p.glow, 26) +
    [0, 1, 2, 3, 4].map((i) => `<path d="M${62} ${36 + i * 7} C${82} ${30 + i * 7} ${96} ${50 + i * 4} ${112 + i * 6} ${30 + i * 12} S${140} ${60 - i * 4} ${156} ${40 + i * 10}" fill="none" stroke="${i % 2 ? S.p.accent : '#e8e0ff'}" stroke-width="0.9" stroke-opacity="${0.9 - i * 0.12}"/>`).join('') +
    S.motes(130, 50, 16, 26, '#e8e0ff', 0.8),
  nyx_phantom_strike: (S) =>
    S.planet(132, 64, 18, '#c8a0b8', '#2a1838') + S.glow(118, 58, 12, '#fff', 0.8) +
    [0, 1, 2].map((i) => `<path d="M${30 + i * 28} ${30 + i * 8} C${44 + i * 28} ${26 + i * 8} ${56 + i * 28} ${36 + i * 8} ${62 + i * 28} ${48 + i * 4} C${52 + i * 28} ${40 + i * 8} ${42 + i * 28} ${34 + i * 8} ${30 + i * 28} ${30 + i * 8} Z" fill="${S.p.glow}" opacity="${f(0.25 + i * 0.3)}"/>`).join('') +
    S.beam(28, 30, 118, 58, 1, '#e8e0ff'),
  nyx_hollow_reaper: (S) =>
    S.glow(80, 40, 60, S.p.accent, 0.3) + S.ground(94, '#03020a') +
    nyxari(S, 74, 30, 1.35, { item: 'scythe', mask: true, eye: '#ff6a8a', cloak: '#120e22', wisps: 6 }) +
    S.motes(80, 80, 16, 60, S.p.glow, 0.9),
  nyx_shadow_court: (S) =>
    S.ground(84, '#03020a') + eclipse(S, 80, 22, 10) +
    `<path d="M20 84 L28 70 H132 L140 84 Z" fill="${S.linear([[0, '#3a3270'], [1, '#07060f']])}" stroke="${S.p.accent}" stroke-width="0.6"/>` +
    [[42, 48, 0.62], [118, 48, 0.62], [80, 42, 0.78]].map(([x, y, s], i) => nyxari(S, x, y, s, { item: 'none', crown: false, wisps: 0, mask: i === 2 })).join(''),
  nyx_eclipse_rite: (S) =>
    eclipse(S, 80, 34, 16) + S.ground(82, '#03020a') +
    `<ellipse cx="80" cy="88" rx="48" ry="8" fill="none" stroke="${S.p.accent}" stroke-width="1.2" stroke-opacity="0.8"/><ellipse cx="80" cy="88" rx="36" ry="5.6" fill="none" stroke="${S.p.glow}" stroke-width="0.6" stroke-dasharray="2 3"/>` +
    [[46, 66, -12], [80, 62, 0], [114, 66, 12]].map(([x, y, r]) => S.card(x, y, r, S.p.glow, 12)).join('') + S.glow(80, 34, 50, '#ff8a6a', 0.2),
  // ---- Nyxari: Heroes ----
  nyx_hero_vesh: (S) =>
    crescent(S, 30, 22, 9, -20, '#e8e0ff') + nyxari(S, 80, 30, 1.35, { item: 'veil', mask: true, crown: true, eye: '#c8b8ff', cloak: '#2a2050' }),
  nyx_hero_kael: (S) =>
    S.glow(80, 40, 60, '#ff6a8a', 0.2) + S.ground(94, '#03020a') + nyxari(S, 74, 30, 1.35, { item: 'blades', mask: true, eye: '#ff4a6a', cloak: '#1a1030', lean: 0.6 }) + S.motes(80, 60, 12, 70, '#ff9ab0', 0.8),
  nyx_hero_nyxara: (S) =>
    S.glow(80, 30, 76, S.p.accent, 0.35) + nyxari(S, 80, 34, 1.45, { item: 'orb', crown: true, mask: true, eye: '#ffffff', cloak: '#100c20', wisps: 7 }) + S.motes(80, 50, 20, 76, '#e8e0ff', 0.9),

  // ---- Korrath: Forgeborn ----
  kor_rivet_graft: (S) =>
    S.panel(26, 32, 62, 44, 3) + S.panel(70, 40, 62, 44, 3) +
    [0, 1, 2, 3, 4].map((i) => S.glow(76, 46 + i * 8, 4, S.p.glow, 0.9) + `<circle cx="76" cy="${46 + i * 8}" r="1.6" fill="#ffe0a0"/>`).join('') +
    [0, 1, 2, 3].map((i) => `<circle cx="34" cy="${40 + i * 10}" r="1.4" fill="#5a5c66"/><circle cx="124" cy="${48 + i * 10}" r="1.4" fill="#5a5c66"/>`).join(''),
  kor_slag_graft: (S) =>
    S.panel(30, 30, 100, 40, 4) + S.glow(80, 46, 24, S.p.glow, 0.8) +
    `<path d="M56 44 Q80 30 104 44 Q100 54 92 52 L90 66 Q86 72 84 66 L82 54 Q76 52 72 56 L70 74 Q66 80 64 74 L64 52 Q58 52 56 44 Z" fill="${S.linear([[0, '#fff3c4'], [0.4, '#ffa040'], [1, '#c8401a']])}"/>` +
    S.motes(80, 40, 10, 24, '#ffe0a0', 1),
  kor_anvil_graft: (S) =>
    S.ground(86, S.p.deep) + anvil(S, 80, 88, 70, false) + S.glow(80, 50, 24, '#9fd0ff', 0.6) + S.rings(80, 52, 30, 2, 8, '#bfe6ff', 0.5) +
    [-1, 1].map((k) => `<path d="M${80 + k * 10} 46 q${k * 4} -8 0 -16 t0 -16" fill="none" stroke="#e6ecf5" stroke-width="2" stroke-opacity="0.5" stroke-linecap="round"/>`).join(''),
  kor_forge_hammer: (S) =>
    S.ground(86, S.p.deep) + anvil(S, 70, 88, 64) + S.glow(66, 54, 26, '#fff3c4', 0.7) +
    [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => { const a = -Math.PI + (i / 8) * Math.PI; return `<line x1="${f(66 + Math.cos(a) * 8)}" y1="${f(54 + Math.sin(a) * 6)}" x2="${f(66 + Math.cos(a) * (20 + (i % 3) * 6))}" y2="${f(54 + Math.sin(a) * (16 + (i % 3) * 5))}" stroke="#ffe0a0" stroke-width="1" stroke-linecap="round"/>`; }).join('') +
    `<line x1="132" y1="10" x2="84" y2="40" stroke="#4a2e18" stroke-width="3.4" stroke-linecap="round"/><g transform="rotate(-32 76 46)"><rect x="66" y="38" width="22" height="14" rx="2" fill="${S.linear([[0, '#e4e8f0'], [0.4, '#8a8f9c'], [1, '#24252c']])}"/><rect x="74" y="38" width="4" height="14" fill="#c9893a"/></g>`,
  kor_ore_hauler: (S) =>
    S.ground(80, S.p.deep) + `<path d="M-5 92 L165 86" stroke="#6a6060" stroke-width="1.4"/>` +
    `<path d="M40 52 H112 L104 78 H48 Z" fill="${S.linear([[0, '#a8a2a8'], [1, '#2e2f36']])}" stroke="#c9893a" stroke-width="1.2"/>` +
    [[56, 50, 8], [72, 46, 10], [90, 48, 9], [102, 51, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${S.radial([[0, '#ffe0a0'], [0.5, '#c86a2a'], [1, '#3a2010']])}"/>` + S.glow(x, y, r * 1.4, S.p.glow, 0.5)).join('') +
    [54, 76, 98].map((x) => `<circle cx="${x}" cy="82" r="6" fill="#24252c" stroke="#c9893a" stroke-width="1.4"/>`).join('') +
    `<rect x="112" y="58" width="16" height="20" rx="2" fill="#5a5c66"/>` + S.glow(124, 64, 5, S.p.glow, 0.9) + S.motes(80, 40, 8, 26, '#ffe0a0', 0.9),
  kor_master_smith: (S) =>
    S.ground(92, S.p.deep) + anvil(S, 120, 92, 40) + korrath(S, 54, 36, 1.4, { item: 'hammer' }) + S.motes(116, 66, 14, 16, '#ffe0a0', 0.9),
  // ---- Korrath: Bastion-kin ----
  kor_shieldwall: (S) =>
    S.ground(88, S.p.deep) +
    [18, 46, 74, 102, 130].map((x, i) => `<path d="M${x} ${30 + (i % 2) * 4} H${x + 26} V${70 + (i % 2) * 4} Q${x + 13} ${90 + (i % 2) * 4} ${x} ${70 + (i % 2) * 4} Z" fill="${S.linear([[0, '#e4e8f0'], [0.35, '#8a8f9c'], [1, '#24252c']], 0, 0, 1, 1)}" stroke="#c9893a" stroke-width="1.6"/>` + S.glow(x + 13, 46 + (i % 2) * 4, 5, S.p.glow, 0.8) + `<circle cx="${x + 13}" cy="${46 + (i % 2) * 4}" r="3" fill="#c9893a"/>`).join(''),
  kor_bastion_kin: (S) =>
    S.ground(92, S.p.deep) + korrath(S, 62, 36, 1.4, { item: 'shield', trim: '#d8a050' }),
  kor_iron_sentinel: (S) =>
    S.ground(90, S.p.deep) +
    `<path d="M58 92 L60 30 Q80 16 100 30 L102 92 Z" fill="${S.linear([[0, '#e4e8f0'], [0.35, '#7a7f8c'], [1, '#1c1d22']], 0, 0, 1, 1)}" stroke="#16161c"/>` +
    S.glow(80, 40, 12, S.p.glow, 0.9) + `<path d="M70 40 H90" stroke="#ffe8b0" stroke-width="2" stroke-linecap="round"/>` +
    [[56, 50, -1], [56, 70, -1], [104, 50, 1], [104, 70, 1]].map(([x, y, k]) => `<polygon points="${x},${y - 4} ${x + k * 12},${y} ${x},${y + 4}" fill="#c9893a"/>`).join('') +
    `<path d="M62 60 Q80 64 98 60" fill="none" stroke="#c9893a" stroke-width="2"/>`,
  kor_rampart_lord: (S) =>
    `<path d="M-5 70 H20 V62 H32 V70 H128 V62 H140 V70 H165 V105 H-5 Z" fill="${S.linear([[0, '#6a6460'], [1, '#1a1612']])}" stroke="#c9893a" stroke-width="0.8"/>` +
    korrath(S, 74, 26, 1.32, { item: 'shield', crown: true, cape: '#7a2a14', bulk: 1.1 }),
  kor_siege_ram: (S) =>
    S.dome(140, 96, 40, '#bfe6ff') + S.glow(116, 60, 18, '#fff3c4', 0.8) +
    `<polygon points="10,46 92,46 116,60 92,74 10,74" fill="${S.linear([[0, '#e4e8f0'], [0.4, '#7a7f8c'], [1, '#1c1d22']])}" stroke="#c9893a" stroke-width="1.2"/>` +
    [30, 50, 70].map((x) => `<rect x="${x}" y="44" width="4" height="32" fill="#c9893a"/>`).join('') +
    S.glow(12, 60, 10, S.p.glow, 0.9) + [0, 1, 2, 3, 4].map((i) => S.bolt(116, 60, 130 + i * 4, 30 + i * 14, '#ffe0a0', 3, 0.8)).join(''),
  kor_foundry: (S) =>
    S.ground(70, S.p.deep) +
    `<path d="M40 92 V58 Q80 30 120 58 V92 Z" fill="${S.linear([[0, '#6a6460'], [1, '#1a1612']])}" stroke="#c9893a" stroke-width="1"/>` +
    S.glow(80, 76, 22, S.p.glow, 0.9) + `<path d="M66 92 V74 Q80 62 94 74 V92 Z" fill="${S.linear([[0, '#fff3c4'], [1, '#ff6a1a']])}"/>` +
    [[50, 22], [110, 16]].map(([x, top]) => `<rect x="${x - 4}" y="${top}" width="8" height="${50 - top}" fill="#3a3330"/>` + S.glow(x, top - 4, 8, '#8a807a', 0.6)).join('') +
    `<path d="M-5 96 Q40 90 66 92" stroke="#ffa040" stroke-width="2.4" fill="none"/>`,
  kor_molten_pour: (S) =>
    S.ground(86, S.p.deep) +
    `<g transform="rotate(38 56 34)"><path d="M40 22 H72 L68 46 H44 Z" fill="${S.linear([[0, '#a8a2a8'], [1, '#2e2f36']])}" stroke="#c9893a" stroke-width="1"/></g>` +
    `<path d="M70 40 Q86 46 88 78" fill="none" stroke="#ffa040" stroke-width="5" stroke-linecap="round"/><path d="M70 40 Q86 46 88 78" fill="none" stroke="#fff3c4" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M68 78 H108 L104 90 H72 Z" fill="#3a3330" stroke="#c9893a"/>` + S.glow(88, 80, 16, S.p.glow, 0.9) + `<ellipse cx="88" cy="79" rx="17" ry="2.6" fill="#ffd08a"/>` + S.motes(88, 72, 10, 16, '#ffe0a0', 0.9),
  kor_temper: (S) =>
    `<path d="M-5 70 H165 V105 H-5 Z" fill="${S.linear([[0, '#3a6a8a', 0.8], [1, '#0a1a2a']])}"/>` + S.waves(70, '#bfe6ff', 1.6, 2, 0.6) +
    `<path d="M70 10 L90 10 L88 80 L80 92 L72 80 Z" fill="${S.linear([[0, '#ffe0a0'], [0.45, '#ff8a3a'], [0.6, '#8aa8c8'], [1, '#bfe6ff']])}" stroke="#fff" stroke-width="0.6"/>` +
    `<rect x="64" y="4" width="32" height="6" rx="2" fill="#c9893a"/>` +
    [-1, 1].map((k) => [0, 1, 2, 3].map((i) => S.glow(80 + k * (12 + i * 9), 62 - i * 12, 12 - i * 2, '#e6ecf5', 0.55)).join('')).join('') + S.rings(80, 70, 14, 3, 7, '#bfe6ff', 0.5),
  // ---- Korrath: Heroes ----
  kor_hero_durga: (S) =>
    S.ground(92, S.p.deep) + anvil(S, 128, 92, 34) + korrath(S, 54, 36, 1.4, { item: 'tongs', crown: true, beard: false, cape: '#5a2a3a', trim: '#e0a860' }),
  kor_hero_brannoc: (S) =>
    S.ground(92, S.p.deep) + S.dome(66, 92, 58, '#ffd08a') + korrath(S, 64, 36, 1.4, { item: 'shield', horns: true, cape: '#2a3a5a', plate: '#9aa0ae' }),
  kor_hero_anvil_king: (S) =>
    S.glow(80, 30, 70, S.p.glow, 0.3) + S.ground(94, S.p.deep) + anvil(S, 24, 96, 30) + korrath(S, 76, 32, 1.48, { item: 'hammer', crown: true, cape: '#7a1a0a', bulk: 1.18, plate: '#6a6e7a' }) + S.motes(80, 50, 14, 70, '#ffe0a0', 0.9),

  // ---- Seren: Tidecasters ----
  ser_astral_lance: (S) =>
    crescent(S, 30, 30, 14, 10) + S.glow(30, 30, 24, '#ffffff', 0.4) + S.beam(40, 34, 124, 62, 2.2, '#e8f0ff') +
    S.planet(132, 66, 12, '#bfd0ff', '#2a3a80') + S.orbit(132, 66, 26, 7, -12, S.p.accent, 0.9, 0.7) + S.glow(124, 62, 10, '#fff', 0.9),
  ser_tide_turner: (S) =>
    S.planet(132, 80, 22, '#9fb8e8', '#22306a') + `<path d="M118 50 Q132 30 150 44" fill="none" stroke="#e8f0ff" stroke-width="1.2" stroke-dasharray="3 2"/><polygon points="150,44 143,42 146,48" fill="#e8f0ff"/>` +
    seren(S, 60, 28, 1.15, { moons: 3, item: 'none' }),
  ser_planet_shepherd: (S) =>
    S.orbit(80, 60, 66, 22, -6, S.p.accent, 1.2, 0.6) +
    [[20, 62, 6, '#bfd0ff'], [60, 80, 8, '#e8c98f'], [112, 78, 7, '#9fd8c8'], [142, 54, 5, '#d8b8ff']].map(([x, y, r, c]) => S.planet(x as number, y as number, r as number, c as string, '#22306a')).join('') +
    `<path d="M80 92 V30 Q80 18 90 18 Q98 18 98 26" fill="none" stroke="#e8f0ff" stroke-width="2" stroke-linecap="round"/>` + S.glow(98, 28, 6, '#fff', 0.8) + S.motes(80, 60, 10, 60, '#e8f0ff', 0.7),
  ser_eclipse_caster: (S) =>
    S.planet(96, 52, 22, '#ffd8a0', '#8a4a2a') + `<circle cx="74" cy="48" r="14" fill="${S.radial([[0, '#2a3060'], [1, '#050920']], 0.6, 0.5, 0.6)}" stroke="#e8f0ff" stroke-width="0.8"/>` +
    S.glow(84, 50, 30, '#ffffff', 0.25) + `<path d="M40 84 Q70 70 100 84" fill="none" stroke="${S.p.accent}" stroke-width="1.2"/><polygon points="40,84 46,79 47,86" fill="${S.p.accent}"/>` + S.card(136, 26, 10, S.p.glow, 12),
  ser_twin_moons: (S) =>
    S.planet(54, 34, 16, '#ffffff', '#8a9ad0') + S.planet(110, 40, 11, '#e8eeff', '#5a6aa8') + S.glow(54, 34, 30, '#fff', 0.3) +
    S.orbit(82, 38, 44, 10, -6, '#e8f0ff', 0.8, 0.5) + S.ground(86, S.p.deep) + S.dome(80, 90, 52, '#bfd0ff'),
  // ---- Seren: Seers ----
  ser_star_chart: (S) =>
    `<rect x="28" y="22" width="104" height="60" rx="2" fill="${S.linear([[0, '#1d2a66'], [1, '#0b1238']])}" stroke="#e8eeff" stroke-width="0.8"/>` +
    [24, 136].map((x) => `<rect x="${x}" y="18" width="8" height="68" rx="4" fill="${S.linear([[0, '#fff3c4'], [1, '#9a7a3a']], 0, 0, 1, 0)}"/>`).join('') +
    S.orbit(80, 52, 30, 30, 0, '#9fb4ff', 0.5, 0.5) + `<path d="M80 26 V78 M54 52 H106" stroke="#9fb4ff" stroke-width="0.4" stroke-opacity="0.6"/>` +
    `<polyline points="44,66 56,40 72,46 88,30 104,40 116,62" fill="none" stroke="#fff" stroke-width="0.7"/>` +
    [[44, 66], [56, 40], [72, 46], [88, 30], [104, 40], [116, 62]].map(([x, y]) => S.sun(x, y, 1.2, '#e8f0ff')).join(''),
  ser_orrery_keeper: (S) =>
    S.ground(94, S.p.deep) + seren(S, 58, 30, 1.2, { item: 'orrery', robe: '#c8d6ff' }),
  ser_stargazer: (S) =>
    S.ground(80, S.p.deep) +
    `<rect x="36" y="64" width="48" height="24" fill="${S.linear([[0, '#9aa8d8'], [1, '#2a3460']])}"/><path d="M38 64 A22 22 0 0 1 82 64 Z" fill="${S.linear([[0, '#ffffff'], [1, '#6a7ab8']], 0, 0, 1, 1)}"/><path d="M56 64 L58 44 L66 43 L64 64 Z" fill="#0a1030"/>` + [44, 56, 68].map((x) => S.glow(x, 76, 2.4, '#ffe2a0', 0.9)).join('') +
    `<line x1="62" y1="58" x2="104" y2="28" stroke="#5a4320" stroke-width="6" stroke-linecap="round"/><line x1="62" y1="58" x2="104" y2="28" stroke="#e8c47a" stroke-width="4" stroke-linecap="round"/>` +
    S.sun(130, 14, 3, '#e8f0ff', 8) + S.beam(130, 14, 106, 28, 1.2, '#e8f0ff') + S.beam(108, 26, 160, 60, 1.4, '#ffd8a0'),
  ser_oracle: (S) =>
    S.glow(80, 30, 50, '#ffffff', 0.25) + seren(S, 68, 30, 1.25, { item: 'chart', crown: true, robe: '#e8eeff' }) +
    [[124, 20], [136, 34], [128, 48], [144, 56]].map(([x, y]) => S.sun(x, y, 1.1, '#e8f0ff')).join('') + `<polyline points="124,20 136,34 128,48 144,56" fill="none" stroke="#c8d6ff" stroke-width="0.6"/>`,
  ser_lantern_of_ages: (S) =>
    `<path d="M80 0 V22" stroke="#c8d6ff" stroke-width="0.9"/>` + S.glow(80, 52, 40, '#bfd0ff', 0.45) +
    `<path d="M66 24 H94 L90 30 V74 L94 80 H66 L70 74 V30 Z" fill="#bfd0ff" fill-opacity="0.18" stroke="#e8eeff" stroke-width="1"/>` +
    S.orbit(80, 52, 8, 3, -20, '#ffffff', 0.8, 0.9) + S.sun(80, 52, 3, '#e8f0ff') + S.motes(80, 52, 14, 8, '#fff', 0.5) +
    `<path d="M74 34 H86 L80 44 Z M80 60 L86 70 H74 Z" fill="none" stroke="#d9b36a" stroke-width="0.8"/>`,
  ser_moonwell: (S) =>
    S.planet(80, 20, 11, '#ffffff', '#8a9ad0') + S.glow(80, 20, 24, '#fff', 0.35) + S.ground(72, S.p.deep) +
    `<ellipse cx="80" cy="82" rx="36" ry="9" fill="${S.linear([[0, '#3a4a8a'], [1, '#0a1030']])}" stroke="#e8eeff" stroke-width="1.6"/>` +
    S.glow(80, 82, 10, '#fff', 0.9) + `<ellipse cx="80" cy="82" rx="6" ry="2" fill="#fff"/>` + S.beam(80, 30, 80, 80, 1.4, '#e8f0ff') +
    [30, 130].map((x) => `<rect x="${x - 3}" y="56" width="6" height="30" fill="${S.linear([[0, '#e8eeff'], [1, '#5a6aa8']], 0, 0, 1, 0)}"/>`).join('') + S.dome(80, 86, 54, '#bfd0ff'),
  ser_constellation: (S) => {
    const pts: [number, number][] = [[80, 18], [80, 32], [66, 42], [56, 56], [94, 42], [108, 30], [80, 56], [70, 76], [64, 94], [90, 76], [100, 92]];
    const lines = [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [1, 6], [6, 7], [7, 8], [6, 9], [9, 10]];
    return S.glow(80, 50, 50, S.p.accent, 0.3) + lines.map(([a, b]) => `<line x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}" stroke="#c8d6ff" stroke-width="0.9" stroke-opacity="0.8"/>`).join('') + pts.map(([x, y], i) => S.sun(x, y, i === 0 ? 2.6 : 1.4, '#e8f0ff', i === 0 ? 6 : 0)).join('') + S.motes(80, 50, 20, 70, '#ffffff', 0.5);
  },
  ser_star_needle: (S) =>
    S.sun(18, 22, 3, '#e8f0ff', 6) + S.beam(20, 24, 160, 74, 0.6, '#ffffff') +
    `<path d="M92 36 A22 22 0 0 1 104 74" fill="none" stroke="#bfd0ff" stroke-width="2.4"/><path d="M108 32 A22 22 0 0 1 120 70" fill="none" stroke="#bfd0ff" stroke-width="1.4" stroke-opacity="0.6"/>` +
    S.glow(102, 52, 8, '#fff', 0.9) + S.motes(104, 52, 8, 12, '#e8f0ff', 0.6) + S.card(140, 26, 12, S.p.glow, 12),
  ser_almanac: (S) =>
    `<path d="M80 80 Q56 72 26 78 V36 Q56 30 80 38 Q104 30 134 36 V78 Q104 72 80 80 Z" fill="${S.linear([[0, '#f4f7ff'], [1, '#a8b8e8']])}" stroke="#5a6aa8" stroke-width="0.8"/><path d="M80 38 V80" stroke="#5a6aa8" stroke-width="0.8"/>` +
    [0, 1, 2, 3].map((i) => `<circle cx="${36 + i * 11}" cy="50" r="4" fill="#1d2a66"/>` + `<path d="M${36 + i * 11} 46 A4 4 0 0 ${i < 2 ? 1 : 0} ${36 + i * 11} 54 A${f(4 * (1 - i / 3))} 4 0 0 ${i < 2 ? 0 : 1} ${36 + i * 11} 46 Z" fill="#fff"/>`).join('') +
    [0, 1, 2, 3, 4].map((i) => `<line x1="88" y1="${46 + i * 6}" x2="${124 - (i % 2) * 8}" y2="${46 + i * 6}" stroke="#5a6aa8" stroke-width="0.8"/>`).join('') +
    S.planet(128, 18, 8, '#ffffff', '#8a9ad0') + S.glow(128, 18, 16, '#fff', 0.3),
  // ---- Seren: Heroes ----
  ser_hero_ilyath: (S) =>
    S.ground(94, S.p.deep) + seren(S, 56, 30, 1.25, { item: 'scope', robe: '#dce4ff' }) + S.planet(140, 18, 6, '#ffe2a0', '#8a5a2a', true),
  ser_hero_maren: (S) =>
    S.planet(130, 80, 26, '#9fd8e8', '#1a3a6a', true) + seren(S, 60, 34, 1.15, { item: 'staff', moons: 4, robe: '#c0dcff' }),
  ser_hero_aster: (S) => {
    const pts: [number, number][] = [[18, 20], [34, 12], [30, 40], [130, 14], [146, 30], [138, 48]];
    return S.glow(80, 34, 74, S.p.accent, 0.35) + `<polyline points="${pts.slice(0, 3).map((p) => p.join(',')).join(' ')}" fill="none" stroke="#c8d6ff" stroke-width="0.6"/><polyline points="${pts.slice(3).map((p) => p.join(',')).join(' ')}" fill="none" stroke="#c8d6ff" stroke-width="0.6"/>` + pts.map(([x, y]) => S.sun(x, y, 1.2, '#e8f0ff')).join('') + seren(S, 80, 32, 1.4, { item: 'orrery', crown: true, moons: 5, robe: '#eef2ff' });
  },

  // ---- Pyrr: Cinderborn ----
  pyr_flare_imp: (S) =>
    S.ground(88, S.p.deep) + blaze(S, 70, 80, 36, 26, -4) + `<ellipse cx="66" cy="68" rx="2" ry="2.6" fill="#4a0800"/><ellipse cx="76" cy="68" rx="2" ry="2.6" fill="#4a0800"/><path d="M66 75 Q71 78 76 75" fill="none" stroke="#4a0800" stroke-width="1"/>` +
    blaze(S, 112, 86, 14, 10, 3) + S.motes(80, 50, 12, 40, '#ffe27a', 1),
  pyr_cinder_brute: (S) =>
    S.ground(92, S.p.deep) + pyrr(S, 74, 30, 1.42, { ember: true, bulk: 1.3, flame: '#e8301a' }),
  pyr_ash_walker: (S) =>
    `<path d="M-5 84 Q80 76 165 86 V105 H-5 Z" fill="${S.linear([[0, '#8a7a74'], [1, '#2a2020']])}"/>` + S.motes(80, 40, 30, 80, '#c8bcb4', 1) +
    pyrr(S, 76, 30, 1.36, { ember: true, flame: '#c8401a', core: '#ffc860' }) +
    [[30, 92], [50, 90]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="1.4" fill="#ff8a1e" opacity="0.8"/>`).join(''),
  pyr_heat_bloom: (S) =>
    S.ground(84, S.p.deep) + `<path d="M80 92 C80 80 78 74 80 64" stroke="#5a2a1a" stroke-width="2.6" fill="none"/>` +
    [-70, -35, 0, 35, 70].map((a) => { return `<g transform="rotate(${a} 80 62)">${blaze(S, 80, 62, 30, 13, 0, '#e8301a')}</g>`; }).join('') +
    S.sun(80, 62, 4.4, '#ffe27a') + S.rings(80, 62, 36, 2, 6, '#ffb070', 0.45),
  pyr_ember_guard: (S) =>
    S.ground(88, S.p.deep) +
    `<path d="M24 92 L30 50 L52 44 L66 54 L86 42 L108 52 L128 46 L136 92 Z" fill="${S.linear([[0, '#5a3a32'], [1, '#140806']])}" stroke="#ffb040" stroke-width="0.8"/>` +
    `<path d="M40 60 L52 70 L46 84 M80 52 L86 66 L76 80 L84 90 M114 58 L106 72 L118 84" fill="none" stroke="#ffd060" stroke-width="1.6"/>` +
    [52, 86, 128].map((x) => blaze(S, x, x === 86 ? 44 : 48, 18, 10)).join('') + [[34, 50, -1], [134, 48, 1]].map(([x, y, k]) => `<polygon points="${x},${y} ${x + k * 10},${y - 12} ${x + k * 4},${y + 2}" fill="#2a1410" stroke="#ffb040" stroke-width="0.6"/>`).join(''),
  pyr_magma_heart: (S) =>
    S.glow(80, 52, 50, '#ff6a1e', 0.6) + `<circle cx="80" cy="52" r="24" fill="${S.radial([[0, '#fffbe0'], [0.3, '#ffd060'], [0.7, '#ff6a1e'], [1, '#8a1a0a']], 0.45, 0.4, 0.6)}"/>` +
    `<path d="M60 40 L72 46 L70 60 L58 62 Z M84 30 L98 34 L100 48 L88 46 Z M86 58 L100 60 L96 74 L82 70 Z" fill="${S.linear([[0, '#4a2a22'], [1, '#140806']])}" stroke="#ffd060" stroke-width="1"/>` +
    S.rings(80, 52, 30, 3, 8, '#ff9a2a', 0.5),
  // ---- Pyrr: Flarekin ----
  pyr_flare_burst: (S) =>
    S.sun(52, 66, 18, '#ff8a1e', 14) + `<path d="M58 50 C64 10 120 6 116 44" fill="none" stroke="#ff6a1e" stroke-width="5" stroke-linecap="round" stroke-opacity="0.8"/><path d="M58 50 C64 10 120 6 116 44" fill="none" stroke="#ffe27a" stroke-width="1.8" stroke-linecap="round"/>` +
    S.motes(116, 44, 16, 22, '#ffd060', 1.2) + S.card(140, 70, 14, S.p.glow, 12),
  pyr_supernova_charge: (S) =>
    S.glow(80, 50, 70, '#ff6a1e', 0.6) + S.rings(80, 50, 14, 5, 10, '#ffd060', 0.7) + S.sun(80, 50, 10, '#ffe27a', 16) +
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i / 8) * Math.PI * 2 + 0.4; return S.bolt(80 + Math.cos(a) * 12, 50 + Math.sin(a) * 10, 80 + Math.cos(a) * 70, 50 + Math.sin(a) * 48, '#ffe27a', 3, 0.7); }).join(''),
  pyr_pyre_shield: (S) =>
    S.ground(88, S.p.deep) + [16, 32, 48, 64, 80, 96, 112, 128, 144].map((x, i) => blaze(S, x, 88 - Math.sin((i / 8) * Math.PI) * 4, 30 + Math.sin((i / 8) * Math.PI) * 26, 16, (x - 80) * 0.08)).join('') + S.dome(80, 88, 58, '#ffd060'),
  pyr_flarekin_dancer: (S) =>
    S.ground(94, S.p.deep) + [0, 1, 2].map((i) => `<path d="M${30 + i * 10} 90 C${50 + i * 10} 60 ${110 - i * 6} 80 ${130 - i * 4} ${40 + i * 10}" fill="none" stroke="#ffb040" stroke-width="${1.6 - i * 0.4}" stroke-opacity="0.6"/>`).join('') +
    pyrr(S, 80, 34, 1.3, { pose: 'dance', flame: '#ff4a1a' }),
  pyr_stoker: (S) =>
    S.ground(86, S.p.deep) +
    `<path d="M50 70 H110 L104 88 H56 Z" fill="${S.linear([[0, '#6a5a50'], [1, '#1a1210']])}" stroke="#c9893a" stroke-width="1"/>` +
    [[60, 68, 6], [72, 66, 7], [86, 67, 7], [100, 68, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${S.radial([[0, '#ffe27a'], [0.5, '#ff6a1e'], [1, '#3a0a04']])}"/>`).join('') +
    blaze(S, 80, 64, 26, 30, 2) + `<line x1="124" y1="30" x2="92" y2="64" stroke="#5a5c66" stroke-width="2.4" stroke-linecap="round"/>` + S.motes(80, 30, 18, 30, '#ffd060', 1),
  pyr_flare_temple: (S) =>
    S.ground(88, S.p.deep) +
    [[30, 130, 88, 76], [44, 116, 76, 64], [58, 102, 64, 52]].map(([x1, x2, y1, y2]) => `<path d="M${x1} ${y1} L${x1 + 6} ${y2} H${x2 - 6} L${x2} ${y1} Z" fill="${S.linear([[0, '#a8604a'], [1, '#3a140c']])}" stroke="#ffb040" stroke-width="0.6"/>`).join('') +
    `<path d="M76 64 V88 H84 V64 Z" fill="#2a0a04"/>` + S.glow(80, 76, 8, '#ffd060', 0.8) + blaze(S, 80, 52, 40, 26, 0) + S.motes(80, 20, 12, 30, '#ffd060', 1),
  pyr_vent_cooler: (S) =>
    S.ground(84, S.p.deep) + `<path d="M64 88 L70 66 H90 L96 88 Z" fill="${S.linear([[0, '#5a5c66'], [1, '#1c1d22']])}" stroke="#9fd0ff" stroke-width="0.8"/>` +
    [0, 1, 2, 3, 4].map((i) => S.glow(80 + (i % 2 ? 8 : -8) * (i / 2), 58 - i * 11, 9 + i * 2.4, '#d8ecff', 0.55)).join('') +
    S.glow(80, 66, 10, '#9fd0ff', 0.8) + S.card(132, 30, 12, '#bfe6ff', 12),
  pyr_solar_tyrant: (S) =>
    S.glow(80, 50, 70, '#ff3a1a', 0.5) + S.sun(80, 50, 22, '#ff4a1a', 18) +
    `<path d="M70 46 L76 50 L70 52 Z M90 46 L84 50 L90 52 Z" fill="#6a0a00"/><path d="M68 42 L77 46 M92 42 L83 46" stroke="#6a0a00" stroke-width="1.6"/>` +
    [-2, -1, 0, 1, 2].map((i) => tongue(S, 80 + i * 8, 30 + Math.abs(i) * 3, 16 - Math.abs(i) * 3, 6, i * 2, '#ffd060')).join(''),
  // ---- Pyrr: Heroes ----
  pyr_hero_ignis: (S) =>
    S.ground(94, S.p.deep) + pyrr(S, 56, 32, 1.36, { pose: 'cast', item: 'fireball', flame: '#ff5a1a' }) + S.beam(92, 36, 160, 16, 1.2, '#ffd060'),
  pyr_hero_ashka: (S) =>
    `<path d="M-5 90 Q80 82 165 92 V105 H-5 Z" fill="${S.linear([[0, '#6a4a40'], [1, '#1a0c0a']])}"/>` + pyrr(S, 60, 32, 1.36, { ember: true, crown: true, item: 'whip', flame: '#d8281a', core: '#ffc040' }),
  pyr_hero_pyrrhus: (S) =>
    S.glow(80, 40, 80, '#ff6a1e', 0.45) + pyrr(S, 80, 32, 1.38, { wings: true, crown: true, item: 'brand', flame: '#ff3a1a', core: '#fff0a0' }) + S.motes(80, 60, 20, 80, '#ffd060', 1),
};
/** Dusk: a sun sinking behind the horizon, the sky banded in its last light. */
function dusk(S: Scene, x = 80, c = '#ff8a4a'): string {
  return S.glow(x, 84, 64, c, 0.45) + S.glow(x, 84, 30, '#ffd0a0', 0.5) + S.sun(x, 86, 13, '#ffb070', 10) + S.ground(86, '#120a1a');
}

const ART_DUSK: Record<string, Draw> = {
  twilight_sentry: (S) => dusk(S, 118) + `<path d="M50 86 V44 L64 32 L78 44 V86 Z" fill="${S.linear([[0, '#6a7088'], [1, '#1a1c2a']])}" stroke="#ffb070" stroke-width="0.8"/>` + S.glow(64, 48, 6, '#ffd0a0', 0.9) + S.rings(64, 58, 30, 2, 8, '#ffd0a0', 0.4),
  evening_star: (S) => dusk(S, 50, '#c46aa0') + S.glow(120, 26, 14, '#fff', 0.7) + `<path d="M120 14 L123 23 L132 26 L123 29 L120 38 L117 29 L108 26 L117 23 Z" fill="#fff"/>` + S.card(126, 60, 12, '#ffd0a0', 10),
  gloaming_battery: (S) => dusk(S, 34) + [70, 92, 114, 136].map((x, i) => `<rect x="${x - 7}" y="${50 + (i % 2) * 6}" width="14" height="${30 - (i % 2) * 6}" rx="2" fill="${S.linear([[0, i % 2 ? '#4a4a58' : '#ffb070'], [1, '#1a1612']])}" stroke="#ffd0a0" stroke-width="0.6"/>`).join('') + S.beam(92, 48, 140, 14, 1.4, '#ffb070'),
  vesper_bell: (S) => dusk(S, 120, '#8a7ad0') + `<path d="M62 30 Q80 22 98 30 L104 70 H56 Z" fill="${S.linear([[0, '#d8c8a0'], [1, '#6a5030']])}" stroke="#fff3c4" stroke-width="0.8"/>` + `<circle cx="80" cy="74" r="4" fill="#fff3c4"/>` + S.rings(80, 50, 34, 3, 10, '#bfe6ff', 0.45),
  aureline_vesper_knight: (S) => dusk(S, 124) + aureline(S, 62, 34, 1.15, { item: 'lance', cloak: '#6a3a5a', halos: 2 }),
  shard_twilight: (S) => dusk(S, 40, '#d06aa0') + [0, 1, 2].map((i) => S.crystal(96 + i * 16, 64 - i * 10, 30 - i * 4, 9, -18 + i * 14, '#ffb3c2')).join('') + S.beam(112, 40, 156, 18, 1.2, '#ffe0ea'),
  ebb_tide: (S) => S.glow(80, 70, 60, '#ff8a4a', 0.35) + S.sun(80, 72, 12, '#ffb070', 8) + S.waves(74, '#7ff0e0', 4, 3, 0.7) + S.rings(80, 50, 40, 2, 10, '#dffff8', 0.4),
  night_bloom: (S) => dusk(S, 126, '#a06ad0') + S.mushroom(70, 86, 34, 30, '#d59cff') + S.mushroom(96, 86, 22, 18, '#c5ff8a', 6) + S.motes(80, 50, 30, 30, '#d59cff', 1),
  nyx_nightfall: (S) => dusk(S, 110, '#6a4ad0') + nyxari(S, 56, 34, 1.1, { item: 'blades', cloak: '#141028', wisps: 5 }),
  kor_banked_forge: (S) => dusk(S, 126) + anvil(S, 66, 74, 46, true) + S.glow(66, 64, 16, '#ffb040', 0.7) + S.motes(66, 46, 14, 20, '#ffd060', 1),
  ser_evening_vigil: (S) => dusk(S, 118, '#8a7ad0') + seren(S, 58, 30, 1.1, { item: 'scope', moons: 2, halo: true }),
  pyr_banked_embers: (S) => dusk(S, 40) + `<path d="M76 86 Q90 70 104 86 Z" fill="#2a1410"/>` + [0, 1, 2, 3].map((i) => S.glow(80 + i * 7, 82 - (i % 2) * 3, 5, '#ff6a1a', 0.9)).join('') + S.motes(92, 60, 16, 24, '#ffb040', 0.8) + S.glow(92, 50, 18, '#9fd0ff', 0.25),
};

Object.assign(ART, ART_RACES, ART_DUSK);


/** The window a card's picture sits in: a sky in its palette, with stars and the picture. */
export function cardScene(def: CardDef): string {
  if (def.fusedFrom) return fusedScene(def);
  const palette = PAL[def.race !== undefined ? RACE_PAL[def.race] : def.kind] ?? PAL.command;
  const S = new Scene(`a-${def.id}`, palette);
  const p = S.p;
  const body = (ART[def.id] ?? ((s: Scene) => s.sun(80, 50, 12)))(S);
  // Stars: a few bright, many faint.
  let stars = '';
  const r = rng(`${def.id}*`);
  for (let i = 0; i < 26; i++) {
    const x = r() * 160, y = r() * 70, b = r();
    stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(b > 0.9 ? 0.9 : 0.4)}" fill="#fff" opacity="${f(0.25 + b * 0.6)}"/>`;
  }
  const sky = S.linear([[0, p.sky[0]], [0.62, p.sky[1]], [1, p.sky[2]]]);
  const haze = S.radial([[0, p.glow, 0.35], [1, p.glow, 0]], 0.5, 0.45, 0.6);
  const vignette = S.radial([[0.55, '#000', 0], [1, '#000', 0.45]], 0.5, 0.5, 0.75);
  return `<svg class="art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${S.defs.join('')}</defs><rect width="160" height="100" fill="${sky}"/>${stars}<rect width="160" height="100" fill="${haze}"/>${body}<rect width="160" height="100" fill="${vignette}"/></svg>`;
}

/** A fused card: its two cards' pictures, split along a glowing diagonal seam. */
function fusedScene(def: CardDef): string {
  const [a, b] = def.fusedFrom!.map((id) => cardScene(cardDef(id)));
  const clip = `fz-${def.id.replace(/[^a-z0-9]/gi, '')}`;
  const inner = (svg: string) => svg.replace('<svg class="art"', '<svg width="160" height="100"');
  return `<svg class="art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><clipPath id="${clip}"><path d="M96 0H160V100H64Z"/></clipPath><linearGradient id="${clip}-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>${inner(a)}<g clip-path="url(#${clip})">${inner(b)}</g><path d="M93 0 99 0 67 100 61 100Z" fill="url(#${clip}-g)"/><path d="M96 0 64 100" stroke="#fff" stroke-width=".8" opacity=".9"/></svg>`;
}

/** Whether a card has a picture of its own (rather than the fallback). */
export function hasOwnArt(defId: string): boolean {
  return defId in ART;
}
