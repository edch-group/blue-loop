import type { CardDef } from '../engine';

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

/** The window a card's picture sits in: a sky in its palette, with stars and the picture. */
export function cardScene(def: CardDef): string {
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

/** Whether a card has a picture of its own (rather than the fallback). */
export function hasOwnArt(defId: string): boolean {
  return defId in ART;
}
