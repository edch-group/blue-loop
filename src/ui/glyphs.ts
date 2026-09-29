import type { CardKind } from '../engine';

/**
 * Alien glyphs: one simple line-drawn shape per card, coloured by what the
 * card does. Drawn on a 100×60 canvas centred at (50, 30).
 */

/** Colour family for each kind of card. */
export const KIND_COLOUR: Record<CardKind, string> = {
  attack: '#e0553a', // red
  defence: '#3f93dc', // blue
  growth: '#3a9e6a', // green: draw, growth and extra plays
  global: '#9265d6', // purple
  command: '#8b909b', // silver: upgrades for the whole deck
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
  // Neutral
  coronal_lance: `${ring(6, 'class="fill" transform="translate(-22 0)"')}<polygon class="fill" points="34,27 82,30 34,33"/>`,
  plasma_relay: `${ring(5, 'class="fill" transform="translate(-20 0)"')}<path d="M36 30 C44 20 50 40 58 30 S70 22 76 30"/>${ring(3, 'class="dot" transform="translate(28 0)"')}`,
  gravity_sling: `<path d="M50 30 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 1 1 16 16"/>${ring(3, 'class="dot" transform="translate(16 16)"')}`,
  thermal_exchange: `<path class="fill" d="M50 14 A16 16 0 0 0 50 46 Z"/><path d="M50 14 A16 16 0 0 1 50 46"/><polyline points="60,24 64,30 60,36"/><polyline points="40,24 36,30 40,36"/>`,
  solar_battery: `<rect x="34" y="18" width="30" height="24" rx="3"/><rect x="64" y="25" width="4" height="10" rx="1"/>${[39, 47, 55].map((x) => `<rect class="fill" x="${x}" y="22" width="5" height="16" rx="1.5"/>`).join('')}`,
  ion_cannon: `${ring(16)}<line x1="30" y1="30" x2="70" y2="30"/><line x1="50" y1="10" x2="50" y2="50"/>${ring(5, 'class="fill"')}`,
  coolant_array: [36, 46, 56].map((x, i) => `<rect ${i === 1 ? 'class="fill"' : ''} x="${x}" y="14" width="7" height="32" rx="3.5"/>`).join(''),
  cryo_vault: `${hexagon(17)}${hexagon(9).replace('<polygon', '<polygon class="fill"')}`,
  deflector_grid: `<path d="M26 40 A26 26 0 0 1 74 40"/><path class="fill" d="M32 40 A19 19 0 0 1 68 40 Z"/><path d="M38 40 A12 12 0 0 1 62 40"/>`,
  heat_sink: `<polyline points="36,14 50,23 64,14"/><polyline class="fill" points="36,25 50,34 64,25"/><line x1="30" y1="44" x2="70" y2="44"/>`,
  deep_scanners: `${ring(3, 'class="dot" transform="translate(-20 12)"')}<path d="M36 34 A14 14 0 0 1 44 22"/><path d="M40 40 A22 22 0 0 1 52 16"/><path d="M44 46 A30 30 0 0 1 60 10"/>`,

  // Global
  solar_storm: `${ring(9, 'class="fill"')}${rays(12, 13, 22)}`,
  ice_age: `${rays(6, 0, 18)}${rays(6, 10, 14, 30)}${ring(3, 'class="dot"')}`,
  solar_maximum: `${ring(10, 'class="fill"')}${rays(8, 14, 24)}${ring(3, 'class="dot"')}`,

  // Command
  ignition_protocol: `<rect x="34" y="14" width="32" height="32" rx="4"/><polygon class="fill" points="44,40 50,20 56,40"/>`,
  coolant_protocol: `<rect x="34" y="14" width="32" height="32" rx="4"/>${rays(6, 0, 11)}`,
  chamber_protocol: `<rect x="34" y="14" width="32" height="32" rx="4"/>${[42, 48, 54].map((x) => `<rect class="fill" x="${x}" y="22" width="4" height="16" rx="2"/>`).join('')}`,
  command_directive: `<rect x="34" y="14" width="32" height="32" rx="4"/>${chevrons(2, 20, 9)}`,

  // Aureline: lances of light
  helio_lancer: `<polygon class="fill" points="30,34 70,30 30,26"/><line x1="24" y1="42" x2="76" y2="18"/>`,
  focusing_array: `${ring(18)}${ring(10)}${ring(3.5, 'class="dot"')}<line x1="26" y1="30" x2="36" y2="30"/><line x1="64" y1="30" x2="74" y2="30"/>`,
  coronal_chorus: [-22, -8, 6, 20].map((dx) => `<polygon class="fill" points="${50 + dx - 3},44 ${50 + dx},16 ${50 + dx + 3},44"/>`).join(''),
  sunspear: `${ring(8, 'class="fill" transform="translate(-24 0)"')}<polygon class="fill" points="32,26 84,30 32,34"/>${rays(6, 10, 14).replace(/<line/g, '<line transform="translate(-24 0)"')}`,
  dawn_beacon: `<path d="M24 44 A26 26 0 0 1 76 44"/>${ring(7, 'class="fill" transform="translate(0 14)"')}${rays(5, 12, 20, 200)}`,
  halo_ward: `<ellipse cx="50" cy="30" rx="26" ry="9"/><path class="fill" d="M40 30 A10 10 0 0 1 60 30 Z"/>`,

  // Xel'Naru: shards and prisms
  shard_reactor: `<polygon class="fill" points="50,12 58,30 50,48 42,30"/><polygon points="30,20 36,30 30,40 24,30"/><polygon points="70,20 76,30 70,40 64,30"/>`,
  crystal_storm: [-20, 0, 20].map((dx, i) => `<polygon ${i === 1 ? 'class="fill"' : ''} points="${50 + dx},${14 + i * 2} ${56 + dx},30 ${50 + dx},${46 - i * 2} ${44 + dx},30"/>`).join(''),
  overload_core: `${hexagon(16)}<polyline points="50,18 45,30 55,30 50,42"/>`,
  martyr_crystal: `<polygon class="fill" points="50,12 60,26 50,48 40,26"/>${rays(8, 18, 24, 22.5)}`,
  prism_vent: `<polygon points="50,14 66,42 34,42"/><line x1="18" y1="34" x2="44" y2="30"/><line class="fill" x1="56" y1="30" x2="82" y2="22"/><line x1="56" y1="32" x2="82" y2="36"/>`,
  fracture_lens: `${ring(15)}<polyline points="38,20 50,30 44,40"/><polyline points="50,30 64,26"/>`,

  // Vorthane: bells and tides
  bell_warden: `<path class="fill" d="M32 34 C32 20 40 14 50 14 S68 20 68 34 Z"/><path d="M36 38 C36 44 34 46 32 48M50 38 V48M64 38 C64 44 66 46 68 48"/>`,
  stinging_veil: `<path d="M28 20 C40 14 60 14 72 20"/>${[34, 44, 56, 66].map((x) => `<path d="M${x} 20 C${x - 2} 30 ${x + 2} 36 ${x} 46"/>`).join('')}${ring(2.5, 'class="dot" transform="translate(-6 16)"')}`,
  tidal_bloom: `<path d="M20 38 C30 28 40 28 50 38 S70 48 80 38"/><path class="fill" d="M34 32 C40 20 60 20 66 32 C58 28 42 28 34 32 Z"/>`,
  abyssal_choir: `${ring(6, 'class="fill"')}${ring(13)}${ring(20, 'stroke-dasharray="4 4"')}`,
  deep_current: `<path d="M18 24 C30 16 40 32 52 24 S74 16 82 24"/><path class="fill" d="M18 36 C30 28 40 44 52 36 S74 28 82 36 L82 40 C74 32 64 48 52 40 S30 32 18 40 Z"/>`,
  lure_jelly: `<path class="fill" d="M38 30 C38 20 44 16 50 16 S62 20 62 30 Z"/><path d="M42 30 C42 38 40 42 38 46M50 30 V46M58 30 C58 38 60 42 62 46"/>${ring(2.5, 'class="dot" transform="translate(0 -22)"')}`,

  // Ixquor: the hive
  mycelium_tower: `<path d="M50 48 V18M50 30 L40 22M50 26 L60 18M50 38 L62 32"/>${ring(3, 'class="dot" transform="translate(0 -14)"')}${ring(2.5, 'class="dot" transform="translate(-10 -8)"')}${ring(2.5, 'class="dot" transform="translate(10 -12)"')}`,
  hive_relay: `${hexagon(10)}${hexagon(10).replace('<polygon', '<polygon transform="translate(-17 0)"')}${hexagon(10).replace('<polygon', '<polygon class="fill" transform="translate(17 0)"')}`,
  sporecaster: `${ring(8, 'class="fill"')}${[0, 72, 144, 216, 288].map((a) => `<circle class="dot" cx="${(50 + Math.cos((a * Math.PI) / 180) * 17).toFixed(1)}" cy="${(30 + Math.sin((a * Math.PI) / 180) * 17).toFixed(1)}" r="2.2"/>`).join('')}`,
  rot_bloom: `<path class="fill" d="M50 16 C58 22 58 30 50 34 C42 30 42 22 50 16 Z"/><path d="M50 34 C60 32 68 36 70 44 C62 44 54 40 50 34 Z M50 34 C40 32 32 36 30 44 C38 44 46 40 50 34 Z"/>`,
  canopy: `<path d="M22 34 C22 20 36 14 50 14 S78 20 78 34 Z"/><path d="M50 34 V48M38 34 V42M62 34 V42"/>`,
  spore_cloud: `${[[-16, -6], [0, -10], [14, -4], [-8, 6], [8, 8]].map(([dx, dy], i) => `<circle ${i === 1 ? 'class="fill"' : ''} cx="${50 + dx}" cy="${30 + dy}" r="${6 + (i % 2) * 2}"/>`).join('')}`,
};

/** Inline SVG glyph for a card, tinted by its kind. */
export function cardGlyph(defId: string, kind: CardKind): string {
  return `<svg class="glyph" viewBox="0 0 100 60" style="--g:${KIND_COLOUR[kind]}" aria-hidden="true">${GLYPHS[defId] ?? ring(12)}</svg>`;
}
