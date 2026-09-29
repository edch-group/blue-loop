import type { CardKind } from '../engine';

/**
 * Alien glyphs: one simple line-drawn shape per card, coloured by what the
 * card does. Drawn on a 100×60 canvas centred at (50, 30).
 */

/** Colour family for each kind of card. */
export const KIND_COLOUR: Record<CardKind, string> = {
  attack: '#e0553a', // red
  defence: '#3f93dc', // blue
  economy: '#d4a21f', // yellow (money)
  basic: '#d4a21f', // Stardust is money too
  global: '#9265d6', // purple
  command: '#8b909b', // silver: neither money nor combat
  mission: '#3a9e91', // teal: personal objectives
};

const ring = (r: number, extra = '') => `<circle cx="50" cy="30" r="${r}" ${extra}/>`;
const rays = (n: number, r1: number, r2: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((i / n) * 360 + offset) * (Math.PI / 180);
    const x1 = 50 + Math.cos(a) * r1, y1 = 30 + Math.sin(a) * r1;
    const x2 = 50 + Math.cos(a) * r2, y2 = 30 + Math.sin(a) * r2;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join('');
const chevrons = (n: number, y0: number, w = 14) =>
  Array.from({ length: n }, (_, i) => `<polyline points="${50 - w},${y0 + i * 9 + 8} 50,${y0 + i * 9} ${50 + w},${y0 + i * 9 + 8}"/>`).join('');
const hexagon = (r: number) =>
  `<polygon points="${Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 + 30) * (Math.PI / 180);
    return `${(50 + Math.cos(a) * r).toFixed(1)},${(30 + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ')}"/>`;

const GLYPHS: Record<string, string> = {
  stardust: `<path class="fill" d="M50 14 L53 27 L66 30 L53 33 L50 46 L47 33 L34 30 L47 27 Z"/>${ring(2, 'class="dot" transform="translate(-24 -10)"')}${ring(1.5, 'class="dot" transform="translate(22 12)"')}`,
  command_directive: `<rect x="34" y="14" width="32" height="32" rx="4"/>${chevrons(2, 20, 9)}`,

  stellar_credits: `${ring(16)}${ring(9, 'class="fill"')}${ring(2.5, 'class="dot"')}`,
  trade_convoy: `<line x1="18" y1="30" x2="82" y2="30"/>${[26, 50, 74].map((x) => `<polygon class="fill" points="${x},22 ${x + 7},30 ${x},38 ${x - 7},30"/>`).join('')}`,
  dyson_tap: `${ring(8, 'class="fill"')}<path d="M50 10 A20 20 0 1 1 30.4 34"/><path d="M50 16 A14 14 0 0 0 36.5 34"/>`,
  asteroid_mining: `<polygon class="fill" points="36,24 44,18 52,22 50,32 40,34"/><polygon points="56,32 64,28 70,34 64,42 56,40"/><polygon points="58,14 64,12 66,18 60,20"/>`,
  deep_scanners: `${ring(3, 'class="dot" transform="translate(-20 12)"')}<path d="M36 34 A14 14 0 0 1 44 22"/><path d="M40 40 A22 22 0 0 1 52 16"/><path d="M44 46 A30 30 0 0 1 60 10"/>`,

  coronal_lance: `${ring(6, 'class="fill" transform="translate(-22 0)"')}<polygon class="fill" points="34,27 82,30 34,33"/>`,
  plasma_barrage: [-18, 0, 18].map((r) => `<polygon class="fill" points="46,44 50,16 54,44" transform="rotate(${r} 50 44)"/>`).join(''),
  gravity_sling: `<path d="M50 30 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 1 1 16 16"/>${ring(3, 'class="dot" transform="translate(16 16)"')}`,
  starbreaker: `${ring(12, 'class="fill"')}<polyline points="50,18 47,27 53,31 49,42"/>${rays(8, 16, 24, 22.5)}`,
  thermal_exchange: `<path class="fill" d="M50 14 A16 16 0 0 0 50 46 Z"/><path d="M50 14 A16 16 0 0 1 50 46"/><polyline points="60,24 64,30 60,36"/><polyline points="40,24 36,30 40,36"/>`,

  coolant_array: [36, 46, 56].map((x, i) => `<rect ${i === 1 ? 'class="fill"' : ''} x="${x}" y="14" width="7" height="32" rx="3.5"/>`).join(''),
  cryo_vault: `${hexagon(17)}${hexagon(9).replace('<polygon', '<polygon class="fill"')}`,
  deflector_grid: `<path d="M26 40 A26 26 0 0 1 74 40"/><path class="fill" d="M32 40 A19 19 0 0 1 68 40 Z"/><path d="M38 40 A12 12 0 0 1 62 40"/>`,
  heat_sink: `<polyline points="36,14 50,23 64,14"/><polyline class="fill" points="36,25 50,34 64,25"/><line x1="30" y1="44" x2="70" y2="44"/>`,

  fleet_command: chevrons(3, 14),
  strategic_directive: `<polygon points="50,10 70,30 50,50 30,30"/>${chevrons(2, 24, 8)}`,

  solar_storm: `${ring(9, 'class="fill"')}${rays(12, 13, 22)}`,
  ice_age: `${rays(6, 0, 18)}${rays(6, 10, 14, 30)}${ring(3, 'class="dot"')}`,
  trade_boom: `${ring(4, 'class="fill"')}${ring(11)}${ring(18, 'stroke-dasharray="3 4"')}`,
  magnetic_storm: `<path d="M30 14 C44 24 44 36 30 46"/><path d="M70 14 C56 24 56 36 70 46"/><path class="fill" d="M40 30 C45 22 55 22 60 30 C55 38 45 38 40 30 Z"/>`,

  solar_maximum: `${ring(10, 'class="fill"')}${rays(8, 14, 24)}${ring(3, 'class="dot"')}`,
  nebula_drift: `<path d="M22 36 C30 22 44 22 50 30 C56 38 70 38 78 24"/><path class="fill" d="M30 40 C38 30 48 32 52 36 C58 42 66 40 72 34"/>${ring(2, 'class="dot" transform="translate(-14 -14)"')}${ring(1.6, 'class="dot" transform="translate(18 12)"')}`,

  // Missions: a target reticle around the mission's own motif.
  mission_ignition: `${ring(18)}<polygon class="fill" points="44,40 50,18 56,40"/>`,
  mission_absolute_zero: `${ring(18)}${rays(6, 3, 12)}`,
  mission_supply_run: `${ring(18)}<rect class="fill" x="41" y="22" width="9" height="12" rx="2"/><rect x="52" y="26" width="9" height="12" rx="2"/>`,
  mission_overclock: `${ring(18)}${chevrons(3, 17, 8)}`,
  mission_stockpile: `${ring(18)}${ring(7, 'class="fill"')}${ring(2, 'class="dot"')}`,
  mission_fortify: `${ring(18)}<path class="fill" d="M50 18 L60 22 L59 33 L50 41 L41 33 L40 22 Z"/>`,
};

/** Inline SVG glyph for a card, tinted by its kind. */
export function cardGlyph(defId: string, kind: CardKind): string {
  return `<svg class="glyph" viewBox="0 0 100 60" style="--g:${KIND_COLOUR[kind]}" aria-hidden="true">${GLYPHS[defId] ?? ring(12)}</svg>`;
}

const OBJECTIVE_GLYPHS: Record<string, string> = {
  deep_freeze: `${rays(6, 0, 18)}${ring(4, 'class="fill"')}`,
  firestorm: `${[-14, 0, 14].map((dx) => `<polygon class="fill" points="${50 + dx - 5},42 ${50 + dx},18 ${50 + dx + 5},42"/>`).join('')}`,
  collector: `<rect x="30" y="18" width="18" height="24" rx="3"/><rect class="fill" x="40" y="14" width="18" height="24" rx="3"/><rect x="50" y="22" width="18" height="24" rx="3"/>`,
  big_spender: `${ring(16)}${ring(9, 'class="fill"')}${rays(8, 18, 22)}`,
  brinkmanship: `${ring(10, 'class="fill"')}<path d="M26 44 L74 44"/><path d="M36 44 A14 14 0 0 1 64 44" stroke-dasharray="3 3"/>`,
  industrialist: `${hexagon(16)}${chevrons(2, 22, 7)}`,
  shieldwall: `<path class="fill" d="M50 12 L66 18 L64 36 L50 48 L36 36 L34 18 Z"/>`,
  arsenal: `${[34, 50, 66].map((x) => `<rect ${x === 50 ? 'class="fill"' : ''} x="${x - 6}" y="18" width="12" height="12" rx="3"/>`).join('')}<line x1="28" y1="42" x2="72" y2="42"/>`,
  cold_front: `${rays(6, 0, 16)}<polyline points="30,46 50,52 70,46"/>`,
  trade_baron: `${[36, 50, 64].map((x) => `<polygon class="fill" points="${x},20 ${x + 7},30 ${x},40 ${x - 7},30"/>`).join('')}`,
  overdrive: `${chevrons(4, 10, 14)}`,
};

const REWARD_GLYPHS: Record<string, string> = {
  command: chevrons(3, 14),
  requisition: `<rect x="36" y="12" width="28" height="36" rx="4"/><polyline points="44,30 50,36 58,24"/>`,
  purge: `<rect x="38" y="14" width="24" height="32" rx="4"/><line x1="30" y1="50" x2="70" y2="10"/>`,
  vent: `${rays(6, 0, 18)}${ring(5, 'class="fill"')}`,
  wide_sensors: `<path d="M34 38 A18 18 0 0 1 66 38"/><path d="M26 42 A26 26 0 0 1 74 42"/>${ring(3, 'class="dot" transform="translate(0 10)"')}`,
  stellar_mint: `${ring(15)}${ring(8, 'class="fill"')}`,
  plasma_focus: `<polygon class="fill" points="34,27 78,30 34,33"/>${ring(5, 'transform="translate(-20 0)"')}`,
  deep_coolant: `${hexagon(16)}${rays(6, 0, 9)}`,
  aegis_lattice: `<path d="M26 42 A24 24 0 0 1 74 42"/><path class="fill" d="M34 42 A16 16 0 0 1 66 42 Z"/>`,
  flare_focus: `${ring(8, 'class="fill"')}${rays(8, 12, 20)}`,
};

/** Symbol for an objective reward. */
export function rewardGlyph(id: string): string {
  return `<svg class="glyph" viewBox="0 0 100 60" aria-hidden="true">${REWARD_GLYPHS[id] ?? ring(12)}</svg>`;
}

/** Symbol for an objective circle. */
export function objectiveGlyph(id: string): string {
  return `<svg class="glyph" viewBox="0 0 100 60" aria-hidden="true">${OBJECTIVE_GLYPHS[id] ?? ring(12)}</svg>`;
}
