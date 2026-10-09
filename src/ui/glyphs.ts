import { BALANCE, baseAttack, baseHealth, CARDS, cardDef, hasDarkspeed, isBurst, raceTrait, SUBRACES, cardCost, keywordLabel, KEYWORDS, keywordsIn, optionList, optionText, persists, plainText, RACE_NAMES, TEXT_RULES, textParts, type CardDef, type CardKind, type Rarity, type ShownKind, shownKind, SHOWN_KIND_NAME } from '../engine';
import { stellariaFlower } from './art';
import { cardScene, renderedArt } from './cardart';
import jewelEmerald from './jewels/emerald.png';
import jewelTopaz from './jewels/topaz.png';
import jewelRuby from './jewels/ruby.png';
import jewelGarnet from './jewels/garnet.png';
import disk from './gems/disk.png';
import dwarfGlow from './gems/dwarf-glow.png';
import dwarf from './gems/dwarf.png';
import glass from './gems/glass.png';
import holeBack from './gems/hole-back.png';
import hole from './gems/hole.png';
import lightDwarfSpikes from './gems/light-dwarf-spikes.png';
import lightDwarfShimmer1 from './gems/light-dwarf-shimmer1.png';
import lightDwarfShimmer2 from './gems/light-dwarf-shimmer2.png';
import lightDwarfSparks from './gems/light-dwarf-sparks.png';
import lightSunCorona1 from './gems/light-sun-corona1.png';
import lightSunCorona2 from './gems/light-sun-corona2.png';
import lightSunFlares1 from './gems/light-sun-flares1.png';
import lightSunFlares2 from './gems/light-sun-flares2.png';
import lightHoleSwirl1 from './gems/light-hole-swirl1.png';
import lightHoleSwirl2 from './gems/light-hole-swirl2.png';
import lightHoleLens from './gems/light-hole-lens.png';
import socketAnomaly from './gems/socket-anomaly.png';
import socketDwarf from './gems/socket-dwarf.png';
import socketStellar from './gems/socket-stellar.png';
import sunCorona from './gems/sun-corona.png';
import sunDisc from './gems/sun-disc.png';

/**
 * Alien glyphs: one simple line-drawn shape per card, coloured by what the
 * card does. Drawn on a 100×60 canvas centred at (50, 30).
 */

/** Colour family for each kind of card. */
export const KIND_COLOUR: Record<CardKind | ShownKind, string> = {
  unit: '#4f7fbf', // steel blue: every card that stays in play
  surge: '#e07a3a', // ember: one that resolves and goes
  attack: '#e0553a', // red
  defence: '#3f93dc', // blue
  growth: '#3a9e6a', // green: draw, growth and extra plays
  global: '#9265d6', // purple
  command: '#8b909b', // silver: each deck's Heroes
  lightspeed: '#d4952a', // amber: set face down, springs on the enemy's day
  relic: '#1fa6a0', // teal: lasting bonuses, brittle
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
  the_admiralty: `<rect x="34" y="14" width="32" height="32" rx="4"/>${chevrons(3, 17, 9)}<line x1="22" y1="30" x2="30" y2="30"/><line x1="70" y1="30" x2="78" y2="30"/>`,
  orion_galaxy_eater: `${ring(12, 'class="fill"')}${ring(17)}<circle class="dot" cx="24" cy="16" r="3"/><circle class="dot" cx="78" cy="44" r="2.5"/>`,
  absolute_zero: `${ring(12)}${rays(6, 4, 12)}${ring(3, 'class="dot"')}`,
  cryo_lance: `<polygon class="fill" points="30,44 64,18 70,24"/>${rays(6, 3, 7)}`,
  rime_bastion: `<path d="M34 44 V24 L50 16 L66 24 V44"/>${rays(6, 3, 8)}`,
  frostbound_sentinel: `<path d="M34 44 V24 L50 16 L66 24 V44"/><polygon class="fill" points="50,22 56,30 50,38 44,30"/>`,
  glacier_hull: `<polyline points="26,42 38,24 48,34 58,18 74,42"/><path d="M22 46 Q50 38 78 46"/>`,
  thaw_beam: `${ring(9)}<line class="fill" x1="20" y1="14" x2="42" y2="26"/>`,
  empress_solenne: `<rect x="34" y="14" width="32" height="32" rx="4"/>${ring(6, 'class="fill"')}${rays(8, 12, 18)}`,
  the_shardmind: `<rect x="34" y="14" width="32" height="32" rx="4"/><polygon class="fill" points="50,19 59,30 50,41 41,30"/><line x1="22" y1="30" x2="30" y2="30"/><line x1="70" y1="30" x2="78" y2="30"/>`,
  leviathan_thoross: `<rect x="34" y="14" width="32" height="32" rx="4"/><path class="fill" d="M41 36 Q41 22 50 22 Q59 22 59 36 Z"/><line x1="22" y1="30" x2="30" y2="30"/><line x1="70" y1="30" x2="78" y2="30"/>`,
  the_worldroot: `<rect x="34" y="14" width="32" height="32" rx="4"/><path d="M50 40 V22M50 30 L43 23M50 34 L57 26"/>${ring(3, 'class="dot"')}`,
  standing_orders: `<rect x="36" y="12" width="28" height="36" rx="3"/><line class="fill" x1="41" y1="21" x2="59" y2="21"/><line x1="41" y1="29" x2="59" y2="29"/><line x1="41" y1="37" x2="53" y2="37"/>`,
  chain_of_command: `${[28, 50, 72].map((x, i) => `<rect ${i === 1 ? 'class="fill"' : ''} x="${x - 8}" y="24" width="16" height="12" rx="6"/>`).join('')}`,

  // Resonance
  resonance_lattice: `${ring(6, 'class="fill"')}<path d="M36 18 A18 18 0 0 0 36 42M64 18 A18 18 0 0 1 64 42"/><path d="M28 12 A28 28 0 0 0 28 48M72 12 A28 28 0 0 1 72 48"/>`,
  harmonic_singularity: `${ring(7, 'class="fill"')}${ring(12)}<path d="M30 16 A22 22 0 0 0 30 44M70 16 A22 22 0 0 1 70 44"/><path d="M20 10 A32 32 0 0 0 20 50M80 10 A32 32 0 0 1 80 50" stroke-dasharray="3 3"/>`,

  // Recovery, recall and removal
  salvage_drone: `<path d="M34 34 A16 16 0 1 1 50 46"/><polyline points="30,28 34,35 41,31"/>${ring(4, 'class="fill"')}`,
  phase_shift: `<rect x="26" y="18" width="18" height="24" rx="2"/><rect class="fill" x="56" y="18" width="18" height="24" rx="2"/><path d="M44 24 H56M52 20 L56 24 L52 28M56 36 H44M48 32 L44 36 L48 40"/>`,
  tractor_beam: `${ring(4, 'class="fill" transform="translate(-24 0)"')}<path d="M30 26 L72 16 V44 L30 34"/><rect x="66" y="24" width="10" height="12" rx="2"/>`,
  command_breaker: `<rect x="34" y="14" width="32" height="32" rx="4"/><polyline class="fill" points="44,14 52,28 46,32 56,46"/>`,
  event_horizon: `${ring(8, 'class="fill"')}<ellipse cx="50" cy="30" rx="26" ry="8"/><path d="M20 30 C28 18 72 18 80 30" stroke-dasharray="3 3"/>`,

  // Lightspeed
  null_field: `${ring(17)}<line x1="38" y1="18" x2="62" y2="42"/><polygon class="fill" points="44,30 60,27 60,33"/>`,
  signal_jammer: `<path d="M50 44 V22"/><path d="M40 20 A14 14 0 0 1 60 20M34 14 A22 22 0 0 1 66 14"/><line x1="36" y1="44" x2="64" y2="16"/>`,
  frost_snare: `${rays(6, 0, 16)}<path d="M28 44 L50 34 L72 44" class="fill"/>`,
  solar_mirror: `<path class="fill" d="M60 12 L66 14 L66 46 L60 48 Z"/><line x1="24" y1="22" x2="58" y2="30"/><line x1="58" y1="30" x2="24" y2="40"/>`,
  decoy_array: `<rect x="28" y="18" width="18" height="24" rx="2" stroke-dasharray="3 3"/><rect class="fill" x="54" y="18" width="18" height="24" rx="2"/>`,
  temporal_snare: `${ring(18)}<line x1="50" y1="30" x2="50" y2="16"/><line x1="50" y1="30" x2="60" y2="36"/>${ring(3, 'class="dot"')}`,

  // Aureline: lances of light
  helio_lancer: `<polygon class="fill" points="30,34 70,30 30,26"/><line x1="24" y1="42" x2="76" y2="18"/>`,
  focusing_array: `${ring(18)}${ring(10)}${ring(3.5, 'class="dot"')}<line x1="26" y1="30" x2="36" y2="30"/><line x1="64" y1="30" x2="74" y2="30"/>`,
  coronal_chorus: [-22, -8, 6, 20].map((dx) => `<polygon class="fill" points="${50 + dx - 3},44 ${50 + dx},16 ${50 + dx + 3},44"/>`).join(''),
  sunspear: `${ring(8, 'class="fill" transform="translate(-24 0)"')}<polygon class="fill" points="32,26 84,30 32,34"/>${rays(6, 10, 14).replace(/<line/g, '<line transform="translate(-24 0)"')}`,
  dawn_beacon: `<path d="M24 44 A26 26 0 0 1 76 44"/>${ring(7, 'class="fill" transform="translate(0 14)"')}${rays(5, 12, 20, 200)}`,
  sunforge: `<rect x="34" y="34" width="32" height="10" rx="2"/><polygon class="fill" points="40,34 50,14 60,34"/><line x1="24" y1="30" x2="32" y2="30"/><line x1="68" y1="30" x2="76" y2="30"/>`,
  halo_ward: `<ellipse cx="50" cy="30" rx="26" ry="9"/><path class="fill" d="M40 30 A10 10 0 0 1 60 30 Z"/>`,

  // Xel'Naru: shards and prisms
  shard_reactor: `<polygon class="fill" points="50,12 58,30 50,48 42,30"/><polygon points="30,20 36,30 30,40 24,30"/><polygon points="70,20 76,30 70,40 64,30"/>`,
  crystal_storm: [-20, 0, 20].map((dx, i) => `<polygon ${i === 1 ? 'class="fill"' : ''} points="${50 + dx},${14 + i * 2} ${56 + dx},30 ${50 + dx},${46 - i * 2} ${44 + dx},30"/>`).join(''),
  overload_core: `${hexagon(16)}<polyline points="50,18 45,30 55,30 50,42"/>`,
  martyr_crystal: `<polygon class="fill" points="50,12 60,26 50,48 40,26"/>${rays(8, 18, 24, 22.5)}`,
  prism_vent: `<polygon points="50,14 66,42 34,42"/><line x1="18" y1="34" x2="44" y2="30"/><line class="fill" x1="56" y1="30" x2="82" y2="22"/><line x1="56" y1="32" x2="82" y2="36"/>`,
  ember_shard: `<polygon class="fill" points="50,14 57,30 50,46 43,30"/><path d="M36 42 C30 34 34 26 38 22M64 42 C70 34 66 26 62 22"/>`,
  prism_conduit: `<polygon points="50,16 62,40 38,40"/><line x1="20" y1="30" x2="40" y2="30"/><line class="fill" x1="60" y1="30" x2="80" y2="30"/>`,
  fracture_lens: `${ring(15)}<polyline points="38,20 50,30 44,40"/><polyline points="50,30 64,26"/>`,

  // Vorthane: bells and tides
  bell_warden: `<path class="fill" d="M32 34 C32 20 40 14 50 14 S68 20 68 34 Z"/><path d="M36 38 C36 44 34 46 32 48M50 38 V48M64 38 C64 44 66 46 68 48"/>`,
  stinging_veil: `<path d="M28 20 C40 14 60 14 72 20"/>${[34, 44, 56, 66].map((x) => `<path d="M${x} 20 C${x - 2} 30 ${x + 2} 36 ${x} 46"/>`).join('')}${ring(2.5, 'class="dot" transform="translate(-6 16)"')}`,
  tidal_bloom: `<path d="M20 38 C30 28 40 28 50 38 S70 48 80 38"/><path class="fill" d="M34 32 C40 20 60 20 66 32 C58 28 42 28 34 32 Z"/>`,
  abyssal_choir: `${ring(6, 'class="fill"')}${ring(13)}${ring(20, 'stroke-dasharray="4 4"')}`,
  deep_current: `<path d="M18 24 C30 16 40 32 52 24 S74 16 82 24"/><path class="fill" d="M18 36 C30 28 40 44 52 36 S74 28 82 36 L82 40 C74 32 64 48 52 40 S30 32 18 40 Z"/>`,
  tide_pylon: `<rect class="fill" x="45" y="14" width="10" height="32" rx="3"/><path d="M22 36 C30 30 36 30 42 36M58 36 C64 30 70 30 78 36"/>`,
  lure_jelly: `<path class="fill" d="M38 30 C38 20 44 16 50 16 S62 20 62 30 Z"/><path d="M42 30 C42 38 40 42 38 46M50 30 V46M58 30 C58 38 60 42 62 46"/>${ring(2.5, 'class="dot" transform="translate(0 -22)"')}`,

  // Ixquor: the hive
  mycelium_tower: `<path d="M50 48 V18M50 30 L40 22M50 26 L60 18M50 38 L62 32"/>${ring(3, 'class="dot" transform="translate(0 -14)"')}${ring(2.5, 'class="dot" transform="translate(-10 -8)"')}${ring(2.5, 'class="dot" transform="translate(10 -12)"')}`,
  hive_relay: `${hexagon(10)}${hexagon(10).replace('<polygon', '<polygon transform="translate(-17 0)"')}${hexagon(10).replace('<polygon', '<polygon class="fill" transform="translate(17 0)"')}`,
  sporecaster: `${ring(8, 'class="fill"')}${[0, 72, 144, 216, 288].map((a) => `<circle class="dot" cx="${(50 + Math.cos((a * Math.PI) / 180) * 17).toFixed(1)}" cy="${(30 + Math.sin((a * Math.PI) / 180) * 17).toFixed(1)}" r="2.2"/>`).join('')}`,
  rot_bloom: `<path class="fill" d="M50 16 C58 22 58 30 50 34 C42 30 42 22 50 16 Z"/><path d="M50 34 C60 32 68 36 70 44 C62 44 54 40 50 34 Z M50 34 C40 32 32 36 30 44 C38 44 46 40 50 34 Z"/>`,
  canopy: `<path d="M22 34 C22 20 36 14 50 14 S78 20 78 34 Z"/><path d="M50 34 V48M38 34 V42M62 34 V42"/>`,
  regrowth_pod: `<path class="fill" d="M50 16 C60 22 60 36 50 44 C40 36 40 22 50 16 Z"/><path d="M50 44 V50M34 30 A16 16 0 0 1 42 18"/><polyline points="38,16 42,18 40,23"/>`,
  spore_husk: `<path d="M36 44 C32 30 40 16 50 16 S68 30 64 44 Z"/>${[[-6, 0], [6, 4], [0, 12]].map(([dx, dy]) => `<circle class="dot" cx="${50 + dx}" cy="${28 + dy}" r="2.4"/>`).join('')}`,
  // Nyxari: hoods, veils and blades
  nyx_hero_vesh: `<rect x="34" y="14" width="32" height="32" rx="4"/><path d="M40 40 C40 26 44 20 50 18 C56 20 60 26 60 40"/><path class="fill" d="M44 30 L49 28 L49 31 Z M56 30 L51 28 L51 31 Z"/>`,
  nyx_hero_kael: `<rect x="34" y="14" width="32" height="32" rx="4"/><path class="fill" d="M42 42 C38 32 40 24 46 18 C44 26 46 34 50 40 Z"/><path d="M58 42 C62 32 60 24 54 18 C56 26 54 34 50 40"/>`,
  nyx_hero_nyxara: `<rect x="34" y="14" width="32" height="32" rx="4"/>${ring(8, 'class="fill"')}${ring(11)}<line x1="22" y1="30" x2="30" y2="30"/><line x1="70" y1="30" x2="78" y2="30"/>`,
  nyx_night_ambush: `<path d="M38 44 C38 28 44 18 50 16 C56 18 62 28 62 44"/><path class="fill" d="M43 30 L48 28 L48 31 Z M57 30 L52 28 L52 31 Z"/>`,
  nyx_hollow_reaper: `<line x1="40" y1="48" x2="58" y2="14"/><path class="fill" d="M58 14 Q46 12 36 22 Q46 18 57 20 Z"/>`,
  nyx_eclipse_rite: `${ring(9, 'class="fill"')}${ring(13)}${rays(8, 16, 22)}`,

  // Korrath: helms, hammers and anvils
  kor_hero_durga: `<rect x="34" y="14" width="32" height="32" rx="4"/><path class="fill" d="M38 34 H58 Q62 34 64 31 Q62 38 56 38 L55 42 H43 L42 38 Q38 38 38 34 Z"/>`,
  kor_hero_brannoc: `<rect x="34" y="14" width="32" height="32" rx="4"/><path class="fill" d="M42 20 H58 V34 Q50 44 42 34 Z"/><line x1="50" y1="22" x2="50" y2="38"/>`,
  kor_hero_anvil_king: `<rect x="34" y="14" width="32" height="32" rx="4"/><rect class="fill" x="42" y="26" width="16" height="10" rx="1.5"/><line x1="50" y1="36" x2="50" y2="44"/><line x1="22" y1="30" x2="30" y2="30"/><line x1="70" y1="30" x2="78" y2="30"/>`,
  kor_master_smith: `<rect class="fill" x="36" y="18" width="20" height="12" rx="2"/><line x1="46" y1="30" x2="58" y2="46"/>`,
  kor_shieldwall: [30, 50, 70].map((x, i) => `<path ${i === 1 ? 'class="fill"' : ''} d="M${x - 8} 18 H${x + 8} V34 Q${x} 44 ${x - 8} 34 Z"/>`).join(''),
  kor_foundry: `<path d="M32 46 V30 Q50 16 68 30 V46"/><path class="fill" d="M44 46 V38 Q50 32 56 38 V46 Z"/>`,

  // Seren: moons and orbits
  ser_hero_ilyath: `<rect x="34" y="14" width="32" height="32" rx="4"/><line x1="40" y1="40" x2="58" y2="22"/>${ring(2.5, 'class="dot" transform="translate(10 -10)"')}`,
  ser_hero_maren: `<rect x="34" y="14" width="32" height="32" rx="4"/><ellipse cx="50" cy="30" rx="12" ry="5"/>${ring(5, 'class="fill"')}`,
  ser_hero_aster: `<rect x="34" y="14" width="32" height="32" rx="4"/><polyline points="40,38 45,24 52,30 60,20"/>${[[40, 38], [45, 24], [52, 30], [60, 20]].map(([x, y]) => `<circle class="dot" cx="${x}" cy="${y}" r="2"/>`).join('')}<line x1="22" y1="30" x2="30" y2="30"/><line x1="70" y1="30" x2="78" y2="30"/>`,
  ser_orrery_keeper: `${ring(4, 'class="fill"')}<ellipse cx="50" cy="30" rx="18" ry="6" transform="rotate(-20 50 30)"/><ellipse cx="50" cy="30" rx="18" ry="6" transform="rotate(40 50 30)"/>`,
  ser_twin_moons: `${ring(9, 'class="fill" transform="translate(-10 0)"')}${ring(6, 'transform="translate(14 -4)"')}`,
  ser_star_chart: `<rect x="30" y="16" width="40" height="28" rx="2"/><polyline class="fill" points="36,38 44,24 52,30 64,20"/>`,

  // Pyrr: flames
  pyr_hero_ignis: `<rect x="34" y="14" width="32" height="32" rx="4"/><path class="fill" d="M50 18 C56 26 58 32 54 40 C52 36 50 36 48 40 C42 32 44 26 50 18 Z"/>`,
  pyr_hero_ashka: `<rect x="34" y="14" width="32" height="32" rx="4"/><path class="fill" d="M40 40 L44 30 L50 34 L56 26 L60 40 Z"/><path d="M50 26 L52 18"/>`,
  pyr_hero_pyrrhus: `<rect x="34" y="14" width="32" height="32" rx="4"/><path class="fill" d="M50 16 C58 24 60 32 54 42 C52 38 48 38 46 42 C40 32 42 24 50 16 Z"/><line x1="22" y1="30" x2="30" y2="30"/><line x1="70" y1="30" x2="78" y2="30"/>`,
  pyr_cinder_brute: `<path class="fill" d="M50 12 C62 24 64 34 56 46 C54 40 46 40 44 46 C36 34 38 24 50 12 Z"/><polyline points="40,34 46,30 50,36 56,30 60,34"/>`,
  pyr_flare_burst: `${ring(7, 'class="fill"')}${rays(10, 11, 20)}<path d="M54 22 C60 8 74 10 70 24"/>`,
  pyr_supernova_charge: `${ring(5, 'class="fill"')}${ring(11)}${ring(17, 'stroke-dasharray="3 3"')}${rays(8, 19, 24)}`,
  spore_cloud: `${[[-16, -6], [0, -10], [14, -4], [-8, 6], [8, 8]].map(([dx, dy], i) => `<circle ${i === 1 ? 'class="fill"' : ''} cx="${50 + dx}" cy="${30 + dy}" r="${6 + (i % 2) * 2}"/>`).join('')}`,
};

/** Inline SVG glyph for a card, tinted by its kind. */
export function cardGlyph(defId: string, kind: CardKind): string {
  return `<svg class="glyph" viewBox="0 0 100 60" style="--g:${KIND_COLOUR[kind]}" aria-hidden="true">${GLYPHS[defId] ?? ring(12)}</svg>`;
}

/**
 * A card's picture: its own painted scene (characters show a figure of their
 * race). With `gem`, the rarity gem sits in a notch cut from its top corner.
 */
export function cardArt(def: CardDef, gem = false): string {
  return `<span class="art-wrap"><span class="art-frame ${gem ? 'art-notched' : ''}">${cardScene(def)}</span>${gem ? rarityGem(def) + costDots(def) : ''}</span>`;
}

/** Each card's picture as an image (drawn once, then reused). */
const sceneImages = new Map<string, string>();
function sceneImage(def: CardDef): string {
  let img = sceneImages.get(def.id);
  if (!img) {
    const painted = !def.fusedFrom && renderedArt(def.id);
    // A rendered picture is an image already (fetched and decoded ahead of time: cardart.ts preloadArt, so not
    // lazy); a fused card made from one draws inline (an SVG used as an
    // image can't load the pictures inside it).
    if (painted) img = `<img class="art" alt="" draggable="false" src="${painted}" />`;
    else if (def.fusedFrom?.some((id) => renderedArt(id))) img = cardScene(def);
    if (img) {
      sceneImages.set(def.id, img);
      return img;
    }
    const svg = cardScene(def).replace('<svg class="art"', '<svg xmlns="http://www.w3.org/2000/svg"');
    img = `<img class="art" alt="" decoding="async" draggable="false" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" />`;
    sceneImages.set(def.id, img);
  }
  return img;
}

/** A picture for a player without an account's (an AI rival, a hot-seat guest): a card picked by their name, so it stays theirs. */
export function pictureFor(name: string): string {
  const pool = CARDS.filter((c) => !c.token);
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length].id;
}

/** How far a player's picture zooms into its card's artwork (1: the artwork's full height fills the circle). */
const AVATAR_ZOOM = 1.5;
/** Where each artwork's subject sits (0–1 across and down), found once from its pixels. */
const avatarFocus = new Map<string, [number, number]>();

/** The artwork placed in its circle: zoomed in, its subject in the middle (as near as the artwork's edges allow). */
function avatarStyle([fx, fy]: [number, number]): string {
  const w = 160 * AVATAR_ZOOM;
  const h = 100 * AVATAR_ZOOM;
  const left = Math.max(100 - w, Math.min(0, 50 - fx * w));
  const top = Math.max(100 - h, Math.min(0, 50 - fy * h));
  return `width:${w}%;height:${h}%;left:${left.toFixed(1)}%;top:${top.toFixed(1)}%`;
}

/**
 * Find an artwork's subject: the part of the picture that stands out from its sky (the colour of its edges),
 * weighted by how much it stands out, so a few stars count for little and the ship or creature for most.
 */
function findFocus(img: HTMLImageElement): [number, number] {
  const W = 80;
  const H = 50;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [0.5, 0.5];
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  // The sky: the average colour of the border.
  const sky = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) continue;
      for (let k = 0; k < 3; k++) sky[k] += px[(y * W + x) * 4 + k];
      n++;
    }
  for (let k = 0; k < 3; k++) sky[k] /= n;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const w = Math.max(0, Math.hypot(px[i] - sky[0], px[i + 1] - sky[1], px[i + 2] - sky[2]) - 40) ** 2;
      sx += w * (x + 0.5);
      sy += w * (y + 0.5);
      sw += w;
    }
  return sw > 0 ? [sx / sw / W, sy / sw / H] : [0.5, 0.5];
}

/** Pictures drawn before their artwork's subject was found: placed once it is. */
function focusPending() {
  document.querySelectorAll<HTMLElement>('.avatar[data-avatar]').forEach((el) => {
    const id = el.dataset.avatar!;
    const img = el.querySelector<HTMLImageElement>('img');
    if (!img) return;
    el.removeAttribute('data-avatar');
    const place = () => {
      let f = avatarFocus.get(id);
      if (!f) {
        try {
          f = findFocus(img);
        } catch {
          f = [0.5, 0.5];
        }
        avatarFocus.set(id, f);
      }
      img.setAttribute('style', avatarStyle(f));
    };
    if (img.complete && img.naturalWidth) place();
    else img.addEventListener('load', place, { once: true });
  });
}
let watching = false;

/** A player's picture: their card's artwork, cropped to a circle round its subject (a blank disc if there is no such card). */
export function playerAvatar(cardId: string | undefined, cls = ''): string {
  let def: CardDef | null = null;
  try {
    def = cardId ? cardDef(cardId) : null;
  } catch {
    def = null;
  }
  if (!def) return `<span class="avatar ${cls}"></span>`;
  const focus = avatarFocus.get(def.id);
  const img = sceneImage(def).replace('<img ', `<img style="${avatarStyle(focus ?? [0.5, 0.5])}" `);
  if (focus) return `<span class="avatar ${cls}">${img}</span>`;
  // Not found yet: drawn centred for now, and placed as soon as it is (once it is in the page).
  if (!watching && typeof MutationObserver !== 'undefined') {
    watching = true;
    new MutationObserver(focusPending).observe(document.body, { childList: true, subtree: true });
    requestAnimationFrame(focusPending);
  }
  return `<span class="avatar ${cls}" data-avatar="${def.id}">${img}</span>`;
}

/**
 * The card's stock, taking after its picture (styles.css, "card stock"): behind a card with a rendered picture,
 * its circuit traces carry the picture's colours; behind a Hero, a faint engraving of the picture. Empty for
 * a card without one, which keeps the plain stock.
 */
export function cardStock(def: CardDef): string {
  const url = def.fusedFrom ? undefined : renderedArt(def.id);
  // (Every card also has its dark corner sections, where its attack and stability sit: styles.css, "corners".)
  return `<span class="card-corners" aria-hidden="true"></span>` + (url ? `<span class="card-stock" style="--art:url('${url}')" aria-hidden="true"></span>` : '');
}

/**
 * A card's picture as a single image rather than live SVG: for long lists of cards (the deck builder),
 * where hundreds of live pictures would make every redraw slow.
 */
export function cardArtLite(def: CardDef, gem = false): string {
  return `<span class="art-wrap"><span class="art-frame ${gem ? 'art-notched' : ''}">${sceneImage(def)}</span>${gem ? rarityGem(def) + costDots(def) : ''}</span>`;
}

/** Each game mode's picture: a Hero of a race found only there in spirit (an Aureline for Core, a Nyxari for the Lost Races). */
const MODE_ART: Record<'core' | 'lost', string> = { core: 'empress_solenne', lost: 'nyx_hero_nyxara' };

/**
 * The game mode picked as two cards down the left of the screen (above the page on a narrow one): each with its
 * picture, name and a line of what it is. `act`: the action each card sends, with its mode.
 */
let shownMode: 'core' | 'lost' | undefined;
export function modeCards(current: 'core' | 'lost', act: string, modes: Record<'core' | 'lost', { name: string; blurb: string }>, top = ''): string {
  // The page is redrawn on a switch, so the grey eases in/out by animation, only on the render that switched.
  const switched = shownMode !== undefined && shownMode !== current;
  shownMode = current;
  // (The Lost Races' own painting, once it has been made: scripts/cardart, "lost mode_lost_races". It is four
  // panels, one race each, kept whole and shown as four tiles so every race is seen.)
  const art = (m: 'core' | 'lost') => {
    const own = m === 'lost' && renderedArt('mode_lost_races');
    return own ? `<span class="mode-quads">${[0, 1, 2, 3].map((i) => `<i style="background-image:url(${own});background-position-x:${(i * 100) / 3}%"></i>`).join('')}</span>` : sceneImage(cardDef(MODE_ART[m]));
  };
  const card = (m: 'core' | 'lost') =>
    `<button class="mode-card ${current === m ? 'on' : ''}${switched ? ' mode-switch' : ''}" data-act="${act}" data-arg="${m}" aria-pressed="${current === m}"><span class="mode-card-art">${art(m)}</span><span class="mode-card-text"><b>${escType(modes[m].name.toLowerCase())}</b><small>${escType(modes[m].blurb)}</small></span></button>`;
  return `<aside class="mode-cards">${top ? `<div class="mode-cards-top">${top}</div>` : ''}<div class="mode-cards-in" role="group" aria-label="Game mode">${card('core')}${card('lost')}</div></aside>`;
}

const RARITY_TITLE: Record<Rarity, string> = { dwarf: 'White Dwarf', stellar: 'Stellar', anomaly: 'Anomaly (one per deck)' };

/** A stable per-card phase, so gems on neighbouring cards shine out of step. */
function phase(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return ((h % 997) / 997).toFixed(3);
}

/** The back of every card: the landing page in small (its white sun, the name beneath, the Stellari rising from the foot, half of it showing). */
export function cardBackFace(): string {
  return `<span class="cback" aria-hidden="true"><span class="cback-flower">${stellariaFlower()}</span><span class="cback-sun"></span><span class="cback-title">blue loop</span></span>`;
}

/**
 * The rarity gem in a card's top corner: a tiny cabochon of dark glass in a
 * silver bezel, with a glowing body inside it. A white dwarf (standard) that
 * glares and twinkles; a sun (Stellar) that slowly turns inside its corona; a
 * black hole (Anomaly) whose accretion disk streams around it without rest.
 * The layers are pre-rendered images (scripts/render_gems.py).
 */
const GEM_LIGHT: Record<Rarity, string[]> = {
  dwarf: ['shimmer1', 'shimmer2', 'spikes', 'sparks'],
  stellar: ['corona1', 'corona2', 'flares1', 'flares2'],
  anomaly: ['swirl2', 'swirl1', 'lens'],
};

export function rarityGem(def: CardDef): string {
  const r: Rarity = def.rarity ?? 'dwarf';
  const body =
    r === 'anomaly'
      ? '<i class="g g-ah-glow"></i><i class="g g-ah-swirl"></i><i class="g g-ah-swirl g-ah-swirl2"></i><i class="g g-ah-core"></i>'
      : r === 'stellar'
        ? '<i class="g g-sun-corona"></i><i class="g g-sun-disc"></i>'
        : '<i class="g g-dwarf-glow"></i><i class="g g-dwarf"></i>';
  // The light it throws out onto the card (scripts/render_gem_light.py): layers that turn and flicker out of step.
  const light = GEM_LIGHT[r].map((l) => `<i class="gl gl-${l}"></i>`).join('');
  return `<span class="gem gem-${r}" style="--gp:${phase(def.id)}" title="${RARITY_TITLE[r]}"><i class="gem-seat"></i><i class="gem-light">${light}</i><i class="g g-socket"></i><i class="gem-window">${body}</i><i class="g g-glass"></i></span>`;
}

// The gem images, bundled (so they resolve in the web, desktop and iOS builds) and handed to CSS.
const GEM_IMAGES: Record<string, string> = {
  socketDwarf, socketStellar, socketAnomaly, glass, dwarf, dwarfGlow, sunDisc, sunCorona, holeBack, hole, disk,
  lightDwarfSpikes, lightDwarfShimmer1, lightDwarfShimmer2, lightDwarfSparks, lightSunCorona1, lightSunCorona2, lightSunFlares1, lightSunFlares2, lightHoleSwirl1, lightHoleSwirl2, lightHoleLens,
};
for (const [name, url] of Object.entries(GEM_IMAGES)) document.documentElement.style.setProperty(`--gem-${name}`, `url("${url}")`);

/**
 * The Anomaly's black hole, seen from above: its accretion disk as streaks of light circling the hole,
 * each a short arc spiralling inward, white and dense near the hole, sparse and dim further out. Drawn once,
 * then turned (two copies at different speeds) so the disk swirls.
 */
function swirlTile(seed: number, n: number): string {
  let h = seed;
  const rnd = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let paths = '';
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rnd(), 0.75);
    const r0 = 23 + t * 26;
    const a0 = rnd() * Math.PI * 2;
    const span = (0.5 + rnd() * 1.6) * (1.1 - t * 0.5);
    const steps = 8;
    let d = '';
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const a = a0 + span * f;
      const r = r0 * (1 - 0.1 * f);
      d += `${k ? 'L' : 'M'}${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
    }
    const op = (0.08 + 0.85 * Math.pow(1 - t, 1.6)).toFixed(2);
    const w = (0.35 + rnd() * 0.9 * (1 - t * 0.5)).toFixed(2);
    const c = rnd() < 0.3 ? '#cdb8ff' : rnd() < 0.5 ? '#e9e2ff' : '#ffffff';
    paths += `<path d="${d}" stroke="${c}" stroke-width="${w}" opacity="${op}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke-linecap="round">${paths}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
document.documentElement.style.setProperty('--gem-swirl', swirlTile(41, 170));
document.documentElement.style.setProperty('--gem-swirl2', swirlTile(97, 110));

/** The small line at the bottom of a card: just its type and race (rarity shows in the gem). */
const escType = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * A card's type and race, for the foot of the card: the type is a small pill (placed at the top middle
 * of the card by the stylesheet), the race small text where the line sits.
 */
export function typeLine(def: CardDef): string {
  const race = def.race !== undefined ? `<span class="card-race">${escType(RACE_NAMES[def.race].toLowerCase())}</span>` : '';
  return `<span class="card-type">${escType(SHOWN_KIND_NAME[shownKind(def)])}</span>${race}`;
}

/**
 * Under the picture, a race card's race in a row: its race (and sub-race), then its racial bonus and nerf
 * by name (their full text on hover), which every card of that race carries.
 */
export function raceRow(def: CardDef): string {
  if (def.race === undefined) return '';
  const sub = def.sub && SUBRACES[def.sub] ? ` · ${SUBRACES[def.sub].name}` : '';
  // (The race's trait is a keyword on the card's text, where it applies: see raceTraitTags.)
  return `<span class="card-racerow"><b>${escType(`${RACE_NAMES[def.race]}${sub}`.toLowerCase())}</b></span>`;
}

/**
 * The race's bonus and nerf that touch this card, as keywords ("Darkspeed", "Shatter"): each only where it
 * applies. Those that only change the card's own attack or stability are in its numbers instead.
 */
export function raceTraitTags(def: CardDef): { name: string; text: string; nerf: boolean }[] {
  const t = raceTrait(def.race);
  if (!t) return [];
  const reaches = (on: string) => (on === 'darkspeed' ? hasDarkspeed(def) : on === 'attune' ? !!def.attune : false);
  const tag = (line: string) => ({ name: line.split(':')[0], text: plainText(line.slice(line.indexOf(':') + 1).trim()), nerf: false });
  return reaches(t.bonusOn) ? [tag(t.bonus)] : [];
}

/** The same as plain words ("attack · aureline"), for lists. */
export function typeWords(def: CardDef): string {
  const k = SHOWN_KIND_NAME[shownKind(def)];
  return escType(def.race !== undefined ? `${k} · ${RACE_NAMES[def.race].toLowerCase()}` : k);
}

/**
 * Card stock: a faint circuit board, drawn once as a tile per rarity and handed
 * to CSS (--circuit-dwarf, --circuit-stellar, --circuit-anomaly). Traces run in
 * straight lines and 45° bends between solder pads, with a few vias and a chip.
 */
function circuitTile(colour: string, seed: number, strength = 0.27): string {
  let h = seed;
  const rand = () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
  const S = 200;
  const g = 10; // the grid the traces follow
  const pt = () => g * (2 + Math.floor(rand() * (S / g - 4)));
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let paths = '';
  let pads = '';
  for (let i = 0; i < 16; i++) {
    let x = pt(), y = pt();
    const pts = [`${x},${y}`];
    pads += `<circle cx="${x}" cy="${y}" r="2.6" fill="none"/>`;
    let [dx, dy] = dirs[Math.floor(rand() * 4)];
    for (let leg = 0; leg < 3; leg++) {
      const n = 2 + Math.floor(rand() * 5);
      for (let k = 0; k < n; k++) {
        const nx = x + dx * g, ny = y + dy * g;
        if (nx < g || ny < g || nx > S - g || ny > S - g) break;
        x = nx;
        y = ny;
      }
      pts.push(`${x},${y}`);
      // Bend 45° (a diagonal step), then carry on straight.
      const turn = rand() < 0.5 ? 1 : -1;
      const ddx = dx === 0 ? turn : dx, ddy = dy === 0 ? turn : dy;
      const bx = x + ddx * g, by = y + ddy * g;
      if (bx < g || by < g || bx > S - g || by > S - g) break;
      x = bx;
      y = by;
      pts.push(`${x},${y}`);
      if (dx === 0) [dx, dy] = [0, dy];
      else [dx, dy] = [dx, 0];
    }
    paths += `<polyline fill="none" points="${pts.join(' ')}"/>`;
    pads += `<circle cx="${x}" cy="${y}" r="2.6" fill="none"/>`;
    if (rand() < 0.5) pads += `<circle cx="${pt()}" cy="${pt()}" r="1.4" stroke="none"/>`;
  }
  // A chip: a small square with pins.
  const cx = pt(), cy = pt();
  let chip = `<rect x="${cx - 12}" y="${cy - 12}" width="24" height="24" rx="2" fill="none"/>`;
  for (let k = -8; k <= 8; k += 8) chip += `<path d="M${cx + k} ${cy - 12}v-5M${cx + k} ${cy + 12}v5M${cx - 12} ${cy + k}h-5M${cx + 12} ${cy + k}h5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><g fill="${colour}" stroke="${colour}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" fill-opacity="0.5" opacity="${strength}">${paths}${pads}${chip}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const CIRCUIT: Record<Rarity, [string, number]> = { dwarf: ['#6f86ad', 7], stellar: ['#c08a24', 11], anomaly: ['#8c5ad6', 19] };
for (const [r, [colour, seed]] of Object.entries(CIRCUIT)) document.documentElement.style.setProperty(`--circuit-${r}`, circuitTile(colour, seed));
// The stat jewels (scripts/render_jewels.py): a garnet for attack, a topaz for stability, a ruby when it is about to run out.
for (const [k, url] of Object.entries({ emerald: jewelEmerald, topaz: jewelTopaz, ruby: jewelRuby, garnet: jewelGarnet })) document.documentElement.style.setProperty(`--jewel-${k}`, `url(${url})`);
// The same traces, fainter and in silver, for the interface: buttons, panels, pop-ups.
document.documentElement.style.setProperty('--circuit-ui', circuitTile('#8a96ad', 23, 0.2));

/** A card out of play (in hand, zoomed, in the builder): its attack and stability once played. */
export function stabilityBadge(def: CardDef): string {
  // (A card that goes straight to the discard pile once played never stands in play: no stability to show.)
  if (!persists(def.id) || isBurst(def)) return '';
  const atk = baseAttack(def);
  return cardJewels({ atk: atk > 0 ? atk : undefined, hp: baseHealth(def.id), hero: def.kind === 'command' });
}

// A sword, point straight up: blade, crossguard, grip and pommel.
const SWORD = '<svg class="atk-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0.6 10 3.2v6.3H6V3.2Z" fill="currentColor"/><rect x="3.4" y="9.5" width="9.2" height="1.9" rx="0.95" fill="currentColor"/><rect x="7" y="11" width="2" height="3" fill="currentColor"/><circle cx="8" cy="14.5" r="1.4" fill="currentColor"/></svg>';
/** Stability's clock, drawn (not the ◷ character, which sits off-centre beside the number). */
export const STAB_ICON = '<svg class="stab-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 4.4V8h3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Health's heart, drawn. */
export const HP_ICON = '<svg class="hp-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.2 2.3 8.6A3.4 3.4 0 0 1 8 4a3.4 3.4 0 0 1 5.7 4.6Z" fill="currentColor"/></svg>';

/**
 * A card's numbers as jewels, each set into a lobe of the card itself: stability (a topaz) at the top right,
 * attack (a garnet) at the bottom left, health (an emerald) at the bottom right. A value about to run out
 * turns ruby; an attacker that has attacked today is dimmed. A Hero never fades, so has no stability. The
 * numbers may come as html (a preview's before and after).
 */
/** A card's jewels: its attack (bottom left, a garnet) and its stability (bottom right, a topaz; a ruby when nearly beaten down). */
export function cardJewels(o: { atk?: number | string; dim?: boolean; hp: number | string; hero?: boolean; lowHp?: boolean }): string {
  const jewel = (cls: string, n: number | string, title: string) => `<b class="jewel ${cls}" data-tip="${title}"><i>${n}</i></b>`;
  const lobe = (pos: string, inner: string) => `<span class="card-jewels jewels-${pos}">${inner}</span>`;
  const atkTitle = 'Attack: once each of your days it can attack a rival card or their sun for this much, then it is dimmed until your next day. A card it attacks hits back with its own attack and Sting.';
  const hpTitle = `Stability: attacks, stings, aimed heat past its defence and Erode wear this down; at 0 ${o.hero ? 'the Hero falls' : 'it burns away'}.`;
  return (
    (o.atk === undefined ? '' : lobe('bl', jewel(`jewel-atk${o.dim ? ' jewel-dim' : ''}`, o.atk, atkTitle + (o.dim ? ' Dimmed: it has attacked today, and is undimmed at your next dawn.' : '')))) +
    lobe('br', jewel(`jewel-stab${o.lowHp ? ' jewel-low' : ''}`, o.hp, hpTitle))
  );
}

/** A card's attack (bottom left, beside its stability): what it deals when it attacks, and what it hits back with. */
export function attackBadge(n: number, dimmed = false): string {
  const title = `Attack ${n}: once each of your days it can attack a rival card or their sun for ${n}, then it is dimmed until your next day. A card it attacks hits back with its own attack and Sting.${dimmed ? ' Dimmed: it has acted today.' : ''}`;
  return `<b class="stat-atk${dimmed ? ' stat-atk-dim' : ''}" title="${title}">${SWORD}${n}</b>`;
}

/** What a card costs to play, in energy: a green gem with the number, on its picture's top-left corner. */
/**
 * What a card costs to play, in energy, as the energy lights show it: one green dot per energy, in a column
 * down the left of its picture (two columns from 4). Dots past the usual most energy in a day (5) are amber: the extra a planet or
 * a card gives. Free cards have none; a card that spends all your energy shows an X.
 */
export function costDots(def: CardDef): string {
  if (def.spendAll) return '<span class="cost-dots" title="Spends all your energy (at least 1)"><i class="cost-x">X</i></span>';
  const n = cardCost(def.id);
  if (n <= 0) return '';
  const dots = Array.from({ length: n }, (_, i) => `<i${i >= BALANCE.maxPlays ? ' class="over"' : ''}></i>`).join('');
  // (Up to 3 in one column; from 4, two columns filled row by row: 4 a square, 5 with one hanging below on the
  // left, 6 two columns of three, the last (past the day's most energy) amber.)
  return `<span class="cost-dots${n > 3 ? ' cost-dots-2col' : ''}" title="Costs ${n} energy to play">${dots}</span>`;
}

const escText = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Heat, cool and shields are drawn as symbols on cards: two chevrons up, two down, a hex (as the shields' lattice by the sun). */
const SYMBOL_SVG: Record<string, string> = {
  heat: '<polyline points="2,6.5 6,2.5 10,6.5"/><polyline points="2,10.5 6,6.5 10,10.5"/>',
  cool: '<polyline points="2,1.5 6,5.5 10,1.5"/><polyline points="2,5.5 6,9.5 10,5.5"/>',
  shield: '<path class="kw-ico-fill" d="M6 1.2 10.2 3.6 10.2 8.4 6 10.8 1.8 8.4 1.8 3.6Z"/><path d="M6 3.9 7.8 4.95 7.8 7.05 6 8.1 4.2 7.05 4.2 4.95Z" stroke-width="0.9"/>',
}

/** Marks for what a hero's ability or a boon does, by its effect (the heat, cool and shield symbols, and a few more). */
const EFFECT_SVG: Record<string, string> = {
  ...SYMBOL_SVG,
  draw: '<rect x="3" y="1.8" width="6" height="8.4" rx="1.2" class="kw-ico-fill"/>',
  energy: '<circle cx="6" cy="6" r="3.2" class="kw-ico-fill"/>',
  wall: '<path d="M2 9.8h8M2.6 9.8V5.2h6.8v4.6M2.6 5.2 6 2.2l3.4 3"/>',
  repair: '<path d="M6 2.2v7.6M2.2 6h7.6"/>',
  time: '<circle cx="6" cy="6" r="4"/><path d="M6 3.6V6l1.8 1.2"/>',
  plant: '<path d="M6 10.4V5.2M6 5.2C6 3 7.8 1.8 9.8 1.8 9.8 4 8.2 5.2 6 5.2zM6 7C6 5.2 4.6 4.2 2.4 4.2 2.4 6.2 3.8 7 6 7z"/>',
  star: '<path d="M6 1.6 7.2 4.6 10.4 4.8 7.9 6.8 8.7 9.9 6 8.2 3.3 9.9 4.1 6.8 1.6 4.8 4.8 4.6z" class="kw-ico-fill"/>',
  // A ship room's walls and guns.
  walls: '<path d="M6 1.4 9.6 2.8V6C9.6 8.4 8 10 6 10.8 4 10 2.4 8.4 2.4 6V2.8Z"/>',
  guns: '<circle cx="6" cy="6" r="3.2"/><path d="M6 1.2v2M6 8.8v2M1.2 6h2M8.8 6h2"/>',
};
/**
 * Each mechanic's mark (12 x 12, drawn in lines like the effect marks), for the strip over a card in play: what
 * the card does, read at a glance.
 */
const MECHANIC_SVG: Record<string, string> = {
  pierce: '<path d="M1.6 6h8.2M7.4 3.6 9.8 6 7.4 8.4"/><path d="M5 2v8"/>',
  guard: '<path d="M6 1.4 10 3v3.2C10 8.6 8.2 10 6 10.8 3.8 10 2 8.6 2 6.2V3Z"/><path d="M6 4v2.6M6 8.2v.1"/>',
  sturdy: '<rect x="1.8" y="2.4" width="8.4" height="7.2" rx="0.8"/><path d="M1.8 6h8.4M6 2.4V6M4 6v3.6M8 6v3.6"/>',
  bulwark: '<path d="M6 2 9 3.2v2.6C9 7.8 7.6 9 6 9.8 4.4 9 3 7.8 3 5.8V3.2Z"/><path d="M1.2 6H2.4M9.6 6h1.2"/>',
  resonance: '<circle cx="6" cy="6" r="1.2" class="kw-ico-fill"/><path d="M3.4 3.4a3.7 3.7 0 0 0 0 5.2M8.6 3.4a3.7 3.7 0 0 1 0 5.2M1.8 1.8a6 6 0 0 0 0 8.4M10.2 1.8a6 6 0 0 1 0 8.4"/>',
  forge: '<path d="M2 5h7l-1.6 2H4.4L4 8.8h4.4M3.4 10.2h5.2M9 5 10.4 3.6"/>',
  brittle: '<path d="M2 2h8v8H2z"/><path d="M6 2 5 4.6 7 6l-1.6 4"/>',
  anchor: '<circle cx="6" cy="2.6" r="1"/><path d="M6 3.6v6.8M3.8 5.2h4.4M2.2 7.2a3.8 3.8 0 0 0 7.6 0"/>',
  offering: '<path d="M2.6 3h6.8L8.6 6.4a2.6 2.6 0 0 1-5.2 0Z"/><path d="M6 9v1.4M4 10.4h4"/>',
  rootbreak: '<path d="M6 1.6v3.2M6 4.8 3.6 7.2 2.4 10.2M6 4.8l2.2 2L8 10.2M6 4.8v5.4"/>',
  erode: '<path d="M6 1.8C7.8 4.2 8.8 5.6 8.8 7a2.8 2.8 0 0 1-5.6 0c0-1.4 1-2.8 2.8-5.2Z"/><path d="M4.6 7.4h2.8"/>',
  decay: '<path d="M2.4 2.4 4 4M9.6 2.4 8 4M6 1.6v2.2"/><circle cx="6" cy="7.4" r="2.8"/><path d="M4.8 7.4h2.4"/>',
  restore: '<path d="M6 10S2 7.6 2 4.8A2.1 2.1 0 0 1 6 3.6a2.1 2.1 0 0 1 4 1.2C10 7.6 6 10 6 10Z"/><path d="M6 4.8v3M4.5 6.3h3"/>',
  renew: '<path d="M9.6 4.2A3.9 3.9 0 1 0 10 7.4"/><path d="M10 1.8v2.6H7.4"/>',
  recover: '<rect x="3.4" y="4" width="5.2" height="6.6" rx="0.8"/><path d="M6 1.2v4.6M4.4 2.8 6 1.2l1.6 1.6"/>',
  recall: '<rect x="2" y="3.4" width="5.2" height="6.6" rx="0.8"/><path d="M10.4 2.4v3.4H6.6M8 4.4 6.6 5.8 8 7.2"/>',
  consume: '<path d="M10.4 4.4A4.6 4.6 0 1 0 10.4 7.6L6.4 6Z"/>',
  chosen: '<circle cx="6" cy="6" r="3.8"/><circle cx="6" cy="6" r="1.2" class="kw-ico-fill"/><path d="M6 .8v1.6M6 9.6v1.6M.8 6h1.6M9.6 6h1.6"/>',
  shift: '<path d="M1.8 4h8.4M8 1.8 10.2 4 8 6.2M10.2 8H1.8M4 5.8 1.8 8 4 10.2"/>',
  displace: '<path d="M2 2l8 8M10 2 2 10M6.8 2H10v3.2M2 6.8V10h3.2"/>',
  destroy: '<path d="M6 1.2 7.1 4.2 10.4 3.4 8.4 6l2 2.6-3.3-.8L6 10.8 4.9 7.8l-3.3.8L3.6 6 1.6 3.4l3.3.8Z"/>',
  eject: '<path d="M2 7.4V10h8V7.4M6 1.4v6M3.8 3.6 6 1.4l2.2 2.2"/>',
  sting: '<path d="M2 10 7.4 4.6M7.4 4.6 10.4 1.6 9.2 6.2 5.8 2.8Z"/>',
  soothe: '<path d="M6 1.6C7.6 3.8 8.6 5.2 8.6 6.6a2.6 2.6 0 0 1-5.2 0C3.4 5.2 4.4 3.8 6 1.6Z"/><path d="M1.6 10.2c1.4-1 3-1 4.4 0s3 1 4.4 0"/>',
  fusion: '<circle cx="4.4" cy="6" r="2.8"/><circle cx="7.6" cy="6" r="2.8"/>',
  plant: '<path d="M6 10.4V5.2M6 5.2C6 3 7.8 1.8 9.8 1.8 9.8 4 8.2 5.2 6 5.2zM6 7C6 5.2 4.6 4.2 2.4 4.2 2.4 6.2 3.8 7 6 7z"/>',
  catalyst: '<path d="M6 1.4 7 5 10.6 6 7 7 6 10.6 5 7 1.4 6 5 5Z"/>',
  tidewall: '<path d="M6 1.6 9.4 3v2.8C9.4 8 7.8 9.4 6 10.2 4.2 9.4 2.6 8 2.6 5.8V3Z"/><path d="M3.6 6.4c.8-.6 1.6-.6 2.4 0s1.6.6 2.4 0"/>',
  hold: '<rect x="2.6" y="5.4" width="6.8" height="5" rx="1"/><path d="M4 5.4V3.8a2 2 0 0 1 4 0v1.6"/>',
  thermosiphon: '<path d="M6 1.4v9.2M2 3.7l8 4.6M10 3.7 2 8.3"/>',
  overheated: '<path d="M5 2.2a1 1 0 0 1 2 0v4.4a2.2 2.2 0 1 1-2 0Z"/><path d="M6 4.4v3.2M8.6 2.4h1.6M8.6 4.4h1.2"/>',
  grows: '<path d="M2.4 6.4 6 2.8l3.6 3.6M2.4 9.6 6 6l3.6 3.6"/>',
  spend: '<rect x="1.6" y="3.6" width="7.6" height="4.8" rx="1"/><path d="M10.4 5.2v1.6"/>',
  darkspeed: '<path d="M7.6 1.6a4.6 4.6 0 1 0 2.8 7.4A3.8 3.8 0 0 1 7.6 1.6Z"/><path d="M6.4 3.6 4.6 6.2h2l-1.6 2.6"/>',
  abundance: '<rect x="1.6" y="3" width="4.6" height="6.4" rx="0.8"/><rect x="4.4" y="2" width="4.6" height="6.4" rx="0.8"/><path d="M10.2 7.8v3M8.7 9.3h3"/>',
  orbit: '<circle cx="6" cy="6" r="1.8"/><ellipse cx="6" cy="6" rx="4.8" ry="2.2" transform="rotate(-25 6 6)"/>',
  attune: '<circle cx="6" cy="6" r="4.2"/><circle cx="9" cy="3" r="1.2" class="kw-ico-fill"/><circle cx="6" cy="6" r="1" class="kw-ico-fill"/>',
  lightspeed: '<path d="M6.8 1.2 2.8 6.6h3l-.6 4.2 4-5.4h-3Z"/>',
  global: '<circle cx="6" cy="6" r="4.4"/><path d="M1.6 6h8.8M6 1.6c1.6 1.6 1.6 7.2 0 8.8M6 1.6c-1.6 1.6-1.6 7.2 0 8.8"/>',
};

/** A mechanic's mark (a keyword's own symbol; the star where it has none). */
export function mechanicMark(id: string): string {
  return `<svg class="kw-ico mech-${id}" viewBox="0 0 12 12" aria-hidden="true">${MECHANIC_SVG[id] ?? EFFECT_SVG.star}</svg>`;
}

/** What an effect type (or a boon's kind) is marked with. */
export function effectMark(raw: string): string {
  // (A hero's "as the battle begins" boons are marked as what they do.)
  const kind = raw.replace(/^open/, '');
  const k =
    kind === 'heat' || kind === 'pierce' || kind === 'playheat' ? 'heat'
    : kind === 'cool' || kind === 'playcool' ? 'cool'
    : kind === 'shield' || kind === 'playshield' ? 'shield'
    : kind === 'draw' || kind === 'playdraw' || kind === 'recall' || kind === 'recover' ? 'draw'
    : kind === 'plays' || kind === 'energy' ? 'energy'
    : kind === 'sturdy' || kind === 'bulwark' || kind === 'guard' || kind === 'tidewall' || kind === 'taunt' ? 'wall'
    : kind === 'repair' || kind === 'restore' ? 'repair'
    : kind === 'stability' ? 'time'
    : kind === 'walls' || kind === 'guns' ? kind
    : kind === 'plant' ? 'plant'
    : 'star';
  return `<svg class="kw-ico eff-${k}" viewBox="0 0 12 12" aria-hidden="true">${EFFECT_SVG[k]}</svg>`;
}

/** The heat, cool or shield symbol on its own (also used by the dawn forecast). */
export function symbolIcon(id: 'heat' | 'cool' | 'shield' | string): string {
  return `<svg class="kw-ico" viewBox="0 0 12 12" aria-hidden="true">${SYMBOL_SVG[id] ?? ''}</svg>`;
}

/**
 * A keyword as HTML, in its colour: its name in title case ("Sturdy 1"), or
 * for heat, cool and shields its symbol and number. `named` adds the name to a
 * symbol too, for where it is being explained.
 */
export function keywordHtml(id: string, value?: string, opts: { named?: boolean; data?: boolean } = {}): string {
  const k = KEYWORDS[id];
  if (!k) return escText(value ?? id);
  const data = opts.data ? ` data-kw="${id}"${value ? ` data-kv="${escText(value)}"` : ''}` : '';
  const label = keywordLabel(id, value);
  // Energy gained: "Gain" and a green dot per energy.
  if (id === 'energy' && value) return `<b class="kw kw-${k.group} kw-gain"${data} aria-label="${escText(label)}">Gain<span class="gain-dots">${'<i></i>'.repeat(Math.max(1, Number(value) || 1))}</span></b>`;
  // An energy cost: a green dot per energy (never a lightning bolt: that is Lightspeed's).
  if (id === 'cost' && value) return `<b class="kw kw-${k.group} kw-gain kw-cost"${data} aria-label="${escText(label)}"><span class="gain-dots">${'<i></i>'.repeat(Math.max(1, Number(value) || 1))}</span></b>`;
  if (!k.symbol) return `<b class="kw kw-${k.group}"${data}>${escText(label)}</b>`;
  const icon = symbolIcon(id);
  const shown = opts.named ? label : value ?? '';
  return `<b class="kw kw-${k.group} kw-sym"${data} aria-label="${escText(label)}">${icon}${escText(shown)}</b>`;
}

/**
 * Card text as HTML: each keyword in its colour, with its value ("Sturdy 1"),
 * and heat, cool and shields as symbols. Hovering one (in the deck builder and
 * the shop) explains it; in a game the zoomed card lists the explanations alongside.
 */
/** A card's text as it reads on the card: its own, after any keyword its race gives it (Darkspeed). */
export function cardBodyHtml(def: CardDef, chosen?: string, live: Record<number, number> = {}): string {
  // Its race's keywords that apply to it, side by side on one row.
  const tags = raceTraitTags(def);
  const row = tags.length ? `<span class="card-traits">${tags.map((g) => `<b class="kw kw-trait ${g.nerf ? 'kw-trait-nerf' : ''}" data-tip="${escText(g.text)}">${escText(g.name)}</b>`).join(' ')}</span>${PARA}` : '';
  return row + cardTextHtml(def.text, chosen, false, live);
}

export function cardTextHtml(text: string, chosen?: string, inline = false, live: Record<number, number> = {}): string {
  const parts = textParts(text);
  // Nothing but a few symbols ("Heat 2", "Heat 2. Cool 1"): they sit in the middle of the text box.
  const symbols = parts.filter((p) => 'kw' in p);
  const only = symbols.length > 0 && symbols.length <= 3 && parts.every((p) => ('kw' in p ? KEYWORDS[p.kw]?.symbol : /^[\s.,]*$/.test(p.text)));
  // A Hero's abilities: each line wrapped as one (`data-ability`, its index), so a Hero's line can be its button.
  let ability = -1;
  let open = false;
  const html = parts
    .map((p, i) => {
      // Each sentence is a paragraph of its own: a full stop becomes a break (and the last one just ends it).
      if ('text' in p) {
        const t = escText(p.text).replace(/\.(\s+|$)/g, (_, sp: string, at: number, str: string) => (sp || (at + 1 === str.length && i < parts.length - 1) ? PARA : ''));
        if (!open || !t.includes(PARA)) return t;
        open = false;
        return t.replace(PARA, `</span>${PARA}`);
      }
      if (p.kw === 'act') {
        const close = open ? '</span>' : '';
        open = true;
        return `${close}<span class="card-ability" data-ability="${++ability}">`;
      }
      // A Hero's abilities: a divider under what it does as it leads, and the heading over them.
      if (p.kw === 'abilities') return `<span class="card-abilities-head">each turn, one of:</span>`;
      // A card's choices, one per line: the one picked (as the card is played) stands out.
      if (p.kw === 'options')
        return `<span class="card-opts${chosen ? ' card-opts-chosen' : ''}">${optionList(p.value)
          .map((o) => `<span class="card-opt${o === chosen ? ' on' : ''}" data-opt="${escText(o)}"><span>${cardTextHtml(optionText(o), undefined, true)}</span></span>`)
          .join('')}</span>`;
      // A number its card's neighbours or the table have changed: shown as it now stands.
      if (i in live && p.value !== undefined) {
        const was = Number(p.value);
        const kw = keywordHtml(p.kw, String(live[i]), { data: true });
        return kw.replace('class="kw ', `class="kw ${live[i] > was ? 'kw-up' : 'kw-down'} `).replace('<b ', `<b title="${was} on the card, ${live[i]} as it stands" `);
      }
      return keywordHtml(p.kw, p.value, { data: true });
    })
    .join('') + (open ? '</span>' : '');
  return only && !inline ? `<span class="card-text-mid">${html}</span>` : html;
}

/**
 * Which numbers in a card's text stand changed in play, by their place among the text's parts: the
 * effects given are matched to the heat, cool and shield numbers of the text, in order (the numbers
 * after {dawn} for its dawn effects, the ones before it for what it does as it is played).
 */
export function liveValues(text: string, effects: { type: string; amount: number; now: number }[], dawn: boolean): Record<number, number> {
  const out: Record<number, number> = {};
  const left = [...effects];
  let afterDawn = false;
  textParts(text).forEach((p, i) => {
    if (!('kw' in p)) return;
    if (p.kw === 'dawn') afterDawn = true;
    if (afterDawn !== dawn) return;
    const j = left.findIndex((l) => l.type === p.kw && String(l.amount) === p.value);
    if (j < 0) {
      // A summed amount (a Fusion card's folded into the card's own): the like effects it is made of, together.
      const want = Number(p.value);
      const parts: number[] = [];
      let sum = 0;
      left.forEach((l, k) => {
        if (l.type === p.kw && sum < want) parts.push(k), (sum += l.amount);
      });
      if (sum !== want || parts.length < 2) return;
      const now = parts.reduce((n, k) => n + left[k].now, 0);
      if (now !== want) out[i] = now;
      for (const k of parts.reverse()) left.splice(k, 1);
      return;
    }
    if (left[j].now !== left[j].amount) out[i] = left[j].now;
    left.splice(j, 1);
  });
  return out;
}

/** Between a card's sentences: a paragraph break. */
const PARA = '<span class="card-para"></span>';



/**
 * The explanations beside a zoomed card: its keywords (Dawn included), the
 * rules its text names in plain words, and its defence badge.
 */
export function keywordList(text: string, stats: { defence?: number; health?: number } = {}, first: string[] = []): string {
  // (`first`: rows that lead the list, already drawn: the card's race, and what it gives the card.)
  const rows: string[] = [...first];
  const row = (head: string, body: string) => rows.push(`<div>${head}<span>${escText(body)}</span></div>`);
  // Each mechanic once, by name alone (no numbers): "Heat", not "Heat 1" and "Heat +1".
  const texts = [text, ...[...text.matchAll(/\{options:([^}]+)\}/g)].flatMap((m) => optionList(m[1]).map(optionText))].join(' ');
  // (Gaining energy explains itself.)
  // (Gaining energy explains itself; a Hero's ability names are not keywords.)
  for (const k of keywordsIn(texts)) if (KEYWORDS[k.id] && k.id !== 'energy' && k.id !== 'cost' && k.id !== 'act' && k.id !== 'abilities') row(keywordHtml(k.id, undefined, { named: true }), KEYWORDS[k.id].explain(k.value));
  const plain = plainText(text);
  for (const r of TEXT_RULES) if (r.pattern.test(plain)) row(`<b class="kw kw-${r.group}">${escText(r.name)}</b>`, r.explain);
  if (stats.defence !== undefined) row(`<b class="kw kw-defence">⛨ Defence</b>`, 'Takes heat before stability.');
  if (stats.health !== undefined) row(`<b class="kw kw-stability">Stability</b>`, 'Attacks, stings and heat past its defence wear it down; at 0 it burns away.');
  // (In a column no taller than the card: it scrolls, and an arrow bobs at its foot while there is more below.)
  return rows.length ? `<div class="kw-wrap"><div class="kw-list">${rows.join('')}</div><i class="kw-more" aria-hidden="true"></i></div>` : '';
}
