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
 * of living jelly rimmed with eyes; an Ixquor a walking fungal hive. Each
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
  lightspeed: { sky: ['#2a1a08', '#6a4210', '#e8b45a'], glow: '#ffe2a0', accent: '#fff6dc', deep: '#170d03' },
};

const RACE_PAL = ['aureline', 'xelnaru', 'vorthane', 'ixquor'];

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
  command_directive: (S) => S.planet(80, 98, 40, '#a9b3c4', '#1a1f2a') + [0, 1, 2].map((i) => `<polyline points="${60},${56 - i * 12} 80,${44 - i * 12} 100,${56 - i * 12}" fill="none" stroke="#fff" stroke-width="3" stroke-opacity="${1 - i * 0.25}"/>`).join('') + S.glow(80, 30, 20, '#fff', 0.5),
  ignition_protocol: (S) => S.panel(56, 24, 48, 56, 6) + `<polygon points="72,68 80,34 88,68" fill="${S.linear([[0, '#fff'], [1, '#ff7a3a']])}"/>` + S.sun(80, 36, 5, '#ffb070', 8),
  coolant_protocol: (S) => S.panel(56, 24, 48, 56, 6) + [0, 60, 120].map((a) => `<line x1="80" y1="36" x2="80" y2="68" stroke="#dff2ff" stroke-width="2.4" transform="rotate(${a} 80 52)"/>`).join('') + S.glow(80, 52, 16, '#dff2ff', 0.8),
  chamber_protocol: (S) => S.panel(56, 24, 48, 56, 6) + [68, 78, 88].map((x) => `<rect x="${x}" y="34" width="6" height="36" rx="3" fill="${S.linear([[0, '#fff'], [1, '#e05a5a']])}"/>`).join('') + S.glow(80, 52, 22, '#ffd0d0', 0.5),
  the_admiralty: (S) => S.planet(28, 84, 30, '#a9b3c4', '#1a1f2a') + [50, 80, 110].map((x, i) => `<polygon points="${x - 14},${60 - i * 6} ${x + 14},${60 - i * 6} ${x + 8},${50 - i * 6} ${x - 8},${50 - i * 6}" fill="${S.linear([[0, '#e6ecf5'], [1, '#56657e']])}"/>` + S.glow(x, 55 - i * 6, 6, '#ffd98a', 0.9)).join('') + S.sun(128, 22, 5, '#ffd98a', 8),
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
  war_council: (S) => S.panel(30, 54, 100, 10, 4) + [44, 66, 94, 116].map((x) => S.panel(x - 6, 34, 12, 20, 5) + S.glow(x, 32, 6, '#ffd98a', 0.8)).join('') + S.sun(80, 26, 8, '#ffb070', 8),
  logistics_command: (S) => S.panel(48, 18, 64, 66, 4) + [30, 42, 54, 66].map((y, i) => `<rect x="56" y="${y}" width="${i === 2 ? 30 : 48}" height="4" rx="2" fill="#fff" opacity="0.8"/>`).join('') + S.card(126, 52, 14, '#e6ecf5', 18) + S.glow(126, 52, 14, '#9fd0ff', 0.4),

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
};
Object.assign(ART, ART2);

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
