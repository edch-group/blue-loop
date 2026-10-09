import {
  GALAXIES,
  type GalaxyKind,
  BALANCE,
  battleFinds,
  itemText,
  sunHealth,
  defenderOf,
  salvageOptions,
  salvageToDeck,
  applyCampaignAction,
  armoryPrice,
  attackOptions,
  CAMPAIGN,
  campaignPlayer,
  cardDef,
  migrateGame,
  migrateCampaign,
  visibleNodes,
  armiesOf,
  armyAt,
  armyById,
  armyMoves,
  buyProblem,
  flagship,
  regionalStability,
  universeStability,
  META_UPGRADES,
  buyUpgrade,
  buyUpgradeProblem,
  levelOf,
  raceUnlocked,
  heroUnlocked,
  runBonuses,
  metaUpgrade,
  type MetaGroup,
  heroState,
  heroLevel,
  battleOdds,
  GENERALS,
  ORACLE_NAME,
  STELLARIA_NAME,
  QUARTERMASTER,
  armyLeader,
  STAR_TYPES,
  QUARTERMASTER_LINES,
  RECYCLER,
  RECYCLER_LINES,
  recycleValue,
  type Army,
  type StoryScene,
  fusionCost,
  fusionProblem,
  fusedId,
  createCampaign,
  factionById,
  GameError,
  garrisonBonus,
  MAP_HEIGHT,
  MAP_WIDTH,
  nodeById,
  ownedNodes,
  RACE_NAMES,
  RACE_TRAITS,
  RARITY_NAME,
  starOdds,
  SUBRACES,
  type MetaState,
  plainText,
  type CampaignAction,
  type CampaignNode,
  type CampaignState,
  type GameState,
  researchProblem,
  researchProject,
  researchBonus,
  setRulesMode,
  isDraw,
  shownKind,
} from '../engine';
import { markDirty } from './account';
import { loadMeta, saveMeta } from './meta';
import { DeckBuilder, type BuilderMode } from './builder';
import { shipModel } from './ships';
import { stellariaFlower } from './art';
import { MENU_ICON } from './menu-icon';
import { raceRow, cardArtLite, cardStock, cardBodyHtml, effectMark, KIND_COLOUR, stabilityBadge, typeLine } from './glyphs';
import { sound } from './sound';
import { toPageDelta } from './viewport';
import { canNebula, nebulaOn, PLANE_Y, STRIP_WIDTH, type Camera, type MapObject, type Nebula } from './nebula3d';

const KEY = 'blue-loop:campaign:v6';

export function loadCampaign(): CampaignState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as CampaignState) : null;
    // Campaigns from before the loop (version 5 and older) cannot be resumed.
    if (!s || s.version !== 6) return null;
    if (s.battle) migrateGame(s.battle.game);
    return migrateCampaign(s);
  } catch {
    return null;
  }
}
function saveCampaign(s: CampaignState | null) {
  try {
    if (s && !s.winner) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
    markDirty();
  } catch {
    // best-effort
  }
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const lower = (t: string) => esc(t.toLowerCase());

import { FACTION_COLOUR, factionAvatar } from './factions';
export { FACTION_COLOUR };
const NEUTRAL = '#c9cbd0';
/** Each kind of relic's mark, drawn in ink. */
const glyph = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
/** Each kind of galaxy's mark, in ink. */
const GALAXY_GLYPH: Record<GalaxyKind, string> = {
  blackHole: '<ellipse cx="12" cy="12" rx="10" ry="3.6"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/><path d="M5 9.5a8 8 0 0 1 14 0"/>',
  pulsar: '<circle cx="12" cy="12" r="2.4"/><path d="M12 9.6 7 2M12 14.4 17 22"/><path d="M9 6.5a7 7 0 0 0-3.6 8M15 17.5a7 7 0 0 0 3.6-8"/>',
  meteors: '<circle cx="16.5" cy="16.5" r="2.4"/><path d="M14.8 14.8 4 4M18 12.5 10 4.5M12.5 18 4.5 10"/>',
  nebula: '<path d="M4 15c0-3 2.5-5 5-4.5C10 7 14 6 16 9c3 0 4.5 2.5 4 5-.5 2.5-3 3.5-5 3H8c-2.5 0-4-1-4-2z"/>',
  darkMatter: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="13" cy="15" r="1.5" fill="currentColor"/>',
};

const RELIC_GLYPH: Record<string, string> = {
  weapon: glyph('M5 19 17 7l2-3-3 2L4 18M8 16l-3 3M14 6l4 4'),
  helm: glyph('M5 16V12a7 7 0 0 1 14 0v4M5 16h14M9 9l3-4 3 4'),
  mantle: glyph('M8 4h8l3 16H5zM12 4v16'),
  sigil: glyph('M12 3l2.6 5.6L20 9.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.4-.9z'),
  core: glyph('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'),
  facet: glyph('M12 3 20 9l-3 11H7L4 9zM4 9h16M12 3l-3 6 3 11 3-11z'),
  ring: glyph('M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM9 6l3-3 3 3'),
  carapace: glyph('M5 13a7 7 0 0 1 14 0v3H5zM12 6v10M5 13h14'),
  gland: glyph('M12 4c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z'),
  mask: glyph('M5 6h14v6a7 7 0 0 1-14 0zM8.5 10.5h2M13.5 10.5h2'),
  plate: glyph('M6 4h12v9a6 6 0 0 1-12 0zM6 9h12'),
  star: glyph('M12 3v18M3 12h18M6 6l12 12M18 6 6 18'),
  ember: glyph('M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-4 3-5 0 2 1 3 2 3 0-3-1-5 0-8z'),
};
/** Materials: a paper crate drawn in ink. Earned from systems taken, finds and battles; spent on everything (cards, fusing, repairs). */
const MATERIALS =
  '<svg class="cur cur-materials" viewBox="0 0 20 20" aria-label="materials"><path d="M10 1.5 17 6v8l-7 4.5L3 14V6Z" fill="#e3e2dc"/><path d="M10 1.5 17 6 10 9.6 3 6Z" fill="#ffffff"/><path d="M10 9.6V18.5L3 14V6Z" fill="#f0efea"/><path d="M10 1.5 17 6v8l-7 4.5L3 14V6ZM10 9.6V18.5M3 6l7 3.6L17 6" fill="none" stroke="#6b7590" stroke-width="1" stroke-linejoin="round"/></svg>';
/** A station on the map: an armoury (a crate) or a research station (a ringed flask). */
const ARMORY_ICON =
  '<svg class="cur cur-station" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7 10 3.5 17 7v7L10 17.5 3 14Z" fill="#c99a52" stroke="#7d5a26" stroke-width=".9" stroke-linejoin="round"/><path d="M3 7 10 10.5 17 7M10 10.5v7" fill="none" stroke="#7d5a26" stroke-width=".9"/></svg>';
const RESEARCH_ICON =
  '<svg class="cur cur-station" viewBox="0 0 20 20" aria-hidden="true"><path d="M8 2.5h4M8.8 2.5v5L4.5 15a1.6 1.6 0 0 0 1.4 2.4h8.2a1.6 1.6 0 0 0 1.4-2.4l-4.3-7.5v-5" fill="#9fd3d9" stroke="#2f6f79" stroke-width=".9" stroke-linejoin="round"/><ellipse cx="10" cy="12.5" rx="7.5" ry="2.4" fill="none" stroke="#a98fe0" stroke-width="1"/></svg>';
/** A scanner array: a dish with two rings of signal. */
const SCANNER =
  '<svg class="cur cur-scanner" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 15.5 9.2 10.3" stroke="#6e7f9f" stroke-width="1.4" stroke-linecap="round"/><path d="M3 11a6 6 0 0 0 6 6L3 11Z" fill="#8fa3c6" stroke="#6e7f9f" stroke-width=".9" stroke-linejoin="round"/><path d="M11.2 6.8a3.4 3.4 0 0 1 2 2M11.6 3.6a6.6 6.6 0 0 1 4.8 4.8" fill="none" stroke="#6fb3bc" stroke-width="1.3" stroke-linecap="round"/><circle cx="9.6" cy="9.9" r="1.2" fill="#6fb3bc"/></svg>';
/** A Finite Stellari bloom: a small six-petalled flower. */
const BLOOM =
  '<svg class="cur cur-bloom" viewBox="0 0 20 20" aria-hidden="true">' +
  [0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="10" cy="5.2" rx="2.6" ry="4.4" fill="#f2b8e6" stroke="#c97bc0" stroke-width=".6" transform="rotate(${a} 10 10)"/>`).join('') +
  '<circle cx="10" cy="10" r="2.6" fill="#fff4b0" stroke="#e0b450" stroke-width=".6"/></svg>';

/** A Stellari petal: what a wormhole gives, banked for every run after. */
const PETAL =
  '<svg class="cur cur-petal" viewBox="0 0 20 20" aria-label="petals"><path d="M10 1.5C14.5 5 15.5 11 10 18.5 4.5 11 5.5 5 10 1.5Z" fill="#ffffff" stroke="#6b7590" stroke-width="1" stroke-linejoin="round"/><path d="M10 4.5v11" stroke="#6b7590" stroke-width=".7" opacity=".55"/></svg>';

/** A hero's portrait: their card's picture, cropped round. */
function portrait(cardId: string): string {
  return `<span class="cmp-portrait">${cardArtLite(cardDef(cardId))}</span>`;
}


/** One of the Lost Races: a faded figure, half gone into the dark. */
const LOST_PORTRAIT = `<span class="cmp-portrait cmp-portrait-lost"><svg viewBox="0 0 80 80" aria-hidden="true">
  <defs><radialGradient id="lost-bg" cx=".5" cy=".35"><stop offset="0" stop-color="#4a4658"/><stop offset="1" stop-color="#15131c"/></radialGradient>
  <linearGradient id="lost-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9c4dc" stop-opacity=".85"/><stop offset="1" stop-color="#c9c4dc" stop-opacity="0"/></linearGradient></defs>
  <rect width="80" height="80" fill="url(#lost-bg)"/>
  <path d="M40 20c-10 0-15 8-15 18 0 8-6 18-12 42h54c-6-24-12-34-12-42 0-10-5-18-15-18z" fill="url(#lost-fade)"/>
  <circle cx="35.5" cy="37" r="1.4" fill="#fff" opacity=".8"/><circle cx="44.5" cy="37" r="1.4" fill="#fff" opacity=".8"/>
  ${[[14, 16], [64, 22], [22, 58], [60, 54]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="#fff" opacity=".35"/>`).join('')}
</svg></span>`;

/** An army's face: its general, or (one of the Lost Races) a faded figure. */
function armyFace(a: Army): string {
  return a.lost ? LOST_PORTRAIT : portrait(a.general);
}

/** The Lost Races' colour on the map: a pale, washed-out violet. */
const LOST_COLOUR = '#9a94b0';

/** Oriel the Wanderer: a hooded figure carrying a lantern, under a scatter of failing stars. */
export const ORACLE_PORTRAIT = `<span class="cmp-portrait cmp-portrait-oracle"><svg viewBox="0 0 80 80" aria-hidden="true">
  <defs>
    <radialGradient id="or-sky" cx=".5" cy=".3"><stop offset="0" stop-color="#2c2550"/><stop offset="1" stop-color="#0d0b1c"/></radialGradient>
    <radialGradient id="or-lamp"><stop offset="0" stop-color="#fffbe6"/><stop offset=".4" stop-color="#ffd98a"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>
    <linearGradient id="or-cloak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d6a9c"/><stop offset="1" stop-color="#2a2748"/></linearGradient>
  </defs>
  <rect width="80" height="80" fill="url(#or-sky)"/>
  ${[[12, 14, 0.9], [66, 10, 0.6], [58, 26, 0.4], [20, 34, 0.5], [70, 44, 0.7], [8, 54, 0.4]].map(([x, y, o]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="#fff" opacity="${o}"/>`).join('')}
  <path d="M40 18c-11 0-17 10-17 22 0 6-3 14-9 40h52c-6-26-9-34-9-40 0-12-6-22-17-22z" fill="url(#or-cloak)"/>
  <path d="M40 22c-7 0-11 7-11 15 0 4 4 7 11 7s11-3 11-7c0-8-4-15-11-15z" fill="#14122a"/>
  <circle cx="36.5" cy="36" r="1.2" fill="#bfe6ff"/><circle cx="43.5" cy="36" r="1.2" fill="#bfe6ff"/>
  <path d="M58 44v10" stroke="#c9b27a" stroke-width="1.2"/>
  <circle cx="58" cy="60" r="11" fill="url(#or-lamp)"/>
  <rect x="55" y="55" width="6" height="9" rx="1.5" fill="#fff3c4" stroke="#c9b27a" stroke-width="1"/>
</svg></span>`;

/** The armoury's quartermaster: a broad figure in work goggles, behind a crate, under a hanging lamp. */
const QUARTERMASTER_PORTRAIT = `<span class="cmp-portrait cmp-portrait-keeper"><svg viewBox="0 0 80 80" aria-hidden="true">
  <defs>
    <linearGradient id="qm-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3a2c"/><stop offset="1" stop-color="#1c1510"/></linearGradient>
    <radialGradient id="qm-lamp" cx=".5" cy="0"><stop offset="0" stop-color="#ffd28a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd28a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="80" height="80" fill="url(#qm-bg)"/>
  <rect width="80" height="60" fill="url(#qm-lamp)"/>
  <path d="M14 80c2-16 12-24 26-24s24 8 26 24z" fill="#7a5a3c"/>
  <path d="M30 58l10 8 10-8" fill="none" stroke="#5a4029" stroke-width="2"/>
  <circle cx="40" cy="38" r="14" fill="#c99a74"/>
  <path d="M26 34c2-10 26-10 28 0" fill="#3a2a1e"/>
  <rect x="27" y="33" width="26" height="7" rx="3.5" fill="#2a2420"/>
  <circle cx="34" cy="36.5" r="3.2" fill="#9fd4e8" stroke="#c9a46a" stroke-width="1.2"/>
  <circle cx="46" cy="36.5" r="3.2" fill="#9fd4e8" stroke="#c9a46a" stroke-width="1.2"/>
  <path d="M33 46c4 3 10 3 14 0" fill="none" stroke="#6b4632" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M30 48c3 6 17 6 20 0" fill="#8a6a50" opacity=".7"/>
  <rect x="48" y="62" width="26" height="18" rx="2" fill="#9a7b4f" stroke="#5a4029" stroke-width="1.5"/>
  <path d="M48 70h26M61 62v18" stroke="#5a4029" stroke-width="1.2"/>
</svg></span>`;

/** The recycler: an old woman in a patched hood and scarf, a ring of salvage glowing behind her. */
const RECYCLER_PORTRAIT = `<span class="cmp-portrait cmp-portrait-keeper"><svg viewBox="0 0 80 80" aria-hidden="true">
  <defs>
    <radialGradient id="rc-bg" cx=".5" cy=".4"><stop offset="0" stop-color="#2f4a3a"/><stop offset="1" stop-color="#101a14"/></radialGradient>
  </defs>
  <rect width="80" height="80" fill="url(#rc-bg)"/>
  <circle cx="40" cy="36" r="27" fill="none" stroke="#8fd1a4" stroke-width="2" stroke-dasharray="10 5" opacity=".55"/>
  ${[0, 120, 240].map((r) => `<path d="M40 7l4 5h-8z" fill="#8fd1a4" opacity=".7" transform="rotate(${r} 40 36)"/>`).join('')}
  <path d="M16 80c2-18 11-26 24-26s22 8 24 26z" fill="#6d6458"/>
  <path d="M22 62c6 6 30 6 36 0l-3 8c-8 4-22 4-30 0z" fill="#b5623e"/>
  <path d="M40 18c-12 0-18 10-18 22 0 4 2 8 4 10h28c2-2 4-6 4-10 0-12-6-22-18-22z" fill="#857a6a"/>
  <circle cx="40" cy="40" r="11" fill="#d8b49a"/>
  <path d="M33 39q2-2 4 0M43 39q2-2 4 0" fill="none" stroke="#4a3426" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M35 46q5 3 10 0" fill="none" stroke="#7a4c3a" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M30 34q3-3 6-2M44 32q3-1 6 2" fill="none" stroke="#efe6da" stroke-width="1.2" stroke-linecap="round"/>
  <rect x="29" y="24" width="7" height="5" rx="1" fill="#a39684" transform="rotate(-12 32 26)"/>
</svg></span>`;

const STELLARIA = STELLARIA_NAME;

/** A stable 0–1 value per id, to spread animation phases so stars never pulse in step. */
function seedOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000).toFixed(3);
}
const TRACK_TINT: Record<string, string> = { weapons: '#e2a494', defences: '#a3c3df', economy: '#e0cd94', resources: '#abd2b5' };
/** Each race's style of play, for choosing one. */
const RACE_BLURB = [
  'Lancers of light: many attack cards, each making the others hit harder.',
  'Crystal overloaders: big bursts of heat, and run your own sun hot to hit harder still.',
  'Tidal bells: stack shields, keep them, and sting whoever strikes them.',
  'The hive: grow, spread wide, and play more cards each turn.',
  'Void-stalkers: spring traps from the dark, and unmake whatever your rival builds.',
  'Forge-smiths: hammer grafts onto each other behind walls that will not fall.',
  'Star-readers: move the planets, read what is coming, and attune again and again.',
  'Flare-born: spend everything in one burst, and run your own sun hot to thrive.',
];

/** What the campaign screen needs from the app that hosts it. */
export interface CampaignHost {
  render(): void;
  toast(text: string): void;
  /** Play a campaign battle on the battle screen. */
  playBattle(game: GameState): void;
  toMenu(): void;
  /** The shared settings buttons (sound, music, AI speed), for the campaign's settings sheet. */
  settingsButtons(): string;
  /** The big centred announcement, as on the battle screen's "your turn". */
  banner(text: string, sub: string): void;
  /** Show a card large. */
  zoom(id: string): void;
}

type ArmoryTab = 'buy' | 'recycle' | 'fuse';

type Sheet =
  /** An armoury on the map, the flagship visiting: buying its stock, recycling or fusing; the card picked (or, fusing, the two). */
  | { kind: 'armory'; nodeId: string; tab: ArmoryTab; pick?: string; fuse?: string[] }
  /** A research station on the map: its one upgrade. */
  | { kind: 'research'; nodeId: string }
  | { kind: 'log' }
  | { kind: 'attack'; armyId: string; toId: string }
  | { kind: 'help' }
  | { kind: 'settings' };

/** Map stages already listening for drags and zooms (kept through redraws, which no longer rebuild them). */
const boundStages = new WeakSet<HTMLElement>();

/** How the map's units scale into the nebula's space (the strip spans STRIP_WIDTH there). */
const MAP_K = STRIP_WIDTH / MAP_WIDTH;

/** Two column-major 4x4 matrices multiplied (a after b). */
function mul4(a: number[], b: number[]): number[] {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

/** The recentre button's mark: crosshairs in a ring. */
const RECENTRE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>';

export class CampaignView {
  state: CampaignState | null = null;
  private selected: string | null = null;
  /** The army picked to march: its routes light up, and tapping one sends it. */
  private army: string | null = null;
  /** The line reached in the story scene on screen. */
  private storyLine = 0;

  /** What happened in the last battle or turn, shown once the player is free to read it. */
  private report: { title: string; lines: string[] } | null = null;
  /** A battle just fought, as its report shows it: who won where, and what it brought (or cost). */
  private battleReport: {
    won: boolean;
    draw?: boolean;
    system: string;
    hero: string | null;
    level: number | null;
    xp: number;
    materials: number;
    salvaged: { id: string; toDeck: boolean } | null;
    finds: ReturnType<CampaignView['findsFor']>;
    damage: number;
  } | null = null;
  private sheet: Sheet | null = null;
  /** New-campaign setup choices (the hero: an index into the race's heroes). */
  private setup = { rivals: 3, race: 0, hero: 0 };
  private shopOpen = false;
  /** The routes to draw as lines of light, between the stars where they stand on screen (drawRays). */
  private rays: { a: string; b: string; gone?: boolean; colour?: string }[] = [];
  /** The systems seen as the map was last drawn (the ships flying over it are drawn after it). */
  private seenNow = new Set<string>();
  /** Whether the ships fly over the 3D map, on a plane of their own above it (so no sun or glow is drawn over them). */
  private flyOver(): boolean {
    return canNebula();
  }
  /** The systems the player can travel to this move (their suns pulse, as sonar, on the 3D map). */
  private reach = new Set<string>();
  /** The other factions' turns, as they happen: whose it is, and what of it can be seen. */
  private waiting: { factionId: string | null; lines: string[] } | null = null;
  /** Visits to the armoury's keepers (each visit, they say something else). */
  private keeperVisit = 0;
  /** The base's deck and armoury: the main deck builder, put to the campaign's use. */
  readonly builder = new DeckBuilder({
    render: () => this.host.render(),
    toast: (text) => this.host.toast(text),
    zoom: (id) => this.host.zoom(id),
    done: () => {
      this.sheet = null;
      this.host.render();
    },
  });

  constructor(private host: CampaignHost) {}

  // ---- Lifecycle ------------------------------------------------------------

  /** Open the new-campaign screen. */
  openSetup() {
    this.state = null;
    this.sheet = null;
    this.ships.clear();
  }

  /** "universe 2 · turn 12", for the banner on entering the campaign. */
  turnLine(): string {
    return this.state ? `universe ${this.state.universe} · turn ${this.state.turn}` : '';
  }

  resume(): boolean {
    const s = loadCampaign();
    if (!s) return false;
    this.state = s;
    this.ships.clear();
    this.sheet = null;
    this.selected = null;
    this.view = null;
    this.skipSilentScenes();
    // Left while the others were moving: they carry on.
    if (s.phase === 'ai' && s.aiStepwise && !s.battle) window.setTimeout(() => void this.runOthers(), 0);
    return true;
  }

  /** The battle screen hands back a battle in progress (to save) or finished. */
  saveBattle(game: GameState) {
    if (!this.state?.battle) return;
    this.state.battle.game = game;
    saveCampaign(this.state);
  }

  /** What the player found in the wreckage of a battle just won (gear for their hero, modules for their ship). */
  findsFor(game: GameState): { name: string; text: string; rarity: string; kind: 'gear' | 'module'; mark: string; cursed?: boolean }[] {
    const s = this.state;
    if (!s?.battle || !game.winnerId) return [];
    const b = s.battle;
    const winner = game.winnerId === game.players[0].id ? b.attacker : b.defender;
    if (winner !== s.playerId) return [];
    const { items } = battleFinds(s, game);
    // (Each marked by what it does: its first boon's kind.)
    const mark = (boons: string[] | undefined) => (boons?.[0] ?? 'boon_star').replace(/^boon_/, '').replace(/_\d+$/, '');
    return [
      ...items.map((i) => ({ name: i.name, text: i.cursed ? i.text : itemText(i), rarity: i.rarity, kind: 'gear' as const, mark: i.cursed ? 'heat' : mark(i.boons), cursed: !!i.cursed })),

    ];
  }

  /** The cards the player may salvage from a battle just won (on the battle screen), each with where it would go. */
  salvageFor(game: GameState): { id: string; toDeck: boolean }[] {
    const s = this.state;
    if (!s?.battle) return [];
    return salvageOptions(s, game).map((id) => ({ id, toDeck: salvageToDeck(s, id) }));
  }

  /** `salvage`: the card picked on the battle screen, null for none (unset, auto-resolved: it is offered on the map). */
  finishBattle(game: GameState, auto = false, salvage?: string | null) {
    // What the player has before, to show what the battle changed.
    const s0 = this.state;
    const b = s0?.battle;
    const me0 = s0 ? campaignPlayer(s0) : null;
    const armyId = b && s0 ? (b.attacker === s0.playerId ? b.armyId : b.defender === s0.playerId ? b.defenderArmyId : null) : null;
    const army0 = armyId && s0 ? s0.armies.find((a) => a.id === armyId) : undefined;
    const before = me0 && b ? { materials: me0.materials, xp: army0 ? heroState(me0, army0.general).xp : 0, damage: army0?.damage ?? 0, system: nodeById(s0!, b.nodeId).name } : null;
    const finds = !auto && s0 ? this.findsFor(game) : [];
    const salvaged = salvage && s0 ? { id: salvage, toDeck: salvageToDeck(s0, salvage) } : null;
    this.withReport('battle report', () => this.apply({ type: 'finishBattle', game, auto, ...(salvage !== undefined ? { salvage } : {}) }));
    const s = this.state;
    if (before && s && b) {
      const me = campaignPlayer(s);
      const army = armyId ? s.armies.find((a) => a.id === armyId) : undefined;
      const xp = army0 ? heroState(me, army0.general).xp : 0;
      // Who won: the battle's own winner (auto-resolved, the log says whether the attackers won).
      const attackerName = factionById(s, b.attacker).name;
      const attackerWon = auto ? this.report?.lines.some((l) => l.startsWith(`${attackerName} wins the battle for`)) ?? false : game.winnerId === game.players[0].id;
      this.battleReport = {
        won: attackerWon === (b.attacker === s.playerId),
        draw: auto ? this.report?.lines.some((l) => l.includes('ends in a draw')) ?? false : isDraw(game),
        system: before.system,
        hero: army0?.general ?? null,
        level: army0 && heroLevel(xp) > heroLevel(before.xp) ? heroLevel(xp) : null,
        xp: xp - before.xp,
        materials: me.materials - before.materials,
        salvaged,
        finds,
        damage: Math.max(0, (army?.damage ?? 0) - before.damage),
      };
    }
    // A defence over: the others carry on with their turns.
    if (this.state?.phase === 'ai' && this.state.aiStepwise && !this.state.battle) window.setTimeout(() => void this.runOthers(), 0);
  }

  /** Run an action and keep its new log lines as a report. */
  private withReport(title: string, run: () => boolean) {
    const seq = this.state?.log[this.state.log.length - 1]?.seq ?? 0;
    if (!run() || !this.state) return false;
    const lines = this.state.log.filter((l) => l.seq > seq).map((l) => l.text);
    this.report = lines.length ? { title, lines } : null;
    return true;
  }

  get inBattle() {
    return !!this.state?.battle;
  }

  private apply(action: CampaignAction): boolean {
    if (!this.state) return false;
    const universe = this.state.universe;
    try {
      this.state = applyCampaignAction(this.state, action);
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
      this.host.toast(err.message);
      sound.error();
      return false;
    }
    this.skipSilentScenes();
    this.bankPetals();
    saveCampaign(this.state);
    // Through the wormhole: a new strip, framed afresh.
    if (this.state && this.state.universe !== universe && !this.state.winner) {
      this.view = null;
      this.selected = null;
      this.army = null;
      this.host.banner(`universe ${this.state.universe}`, 'through the wormhole');
    }
    // Every move is a turn: once the flagship has made its move (and anything it brought on is settled), time moves on.
    if (action.type !== 'endTurn' && action.type !== 'aiStep' && this.moveSpent()) {
      const f = flagship(this.state!, this.state!.playerId);
      window.setTimeout(() => this.passTime(!(f?.moved || (f?.steps ?? 0) > 0)), 420);
    }
    return true;
  }

  /** Whether what a system holds is known: the wormhole and its guardian, or a ship seen standing there. */
  private known(nodeId: string): boolean {
    const s = this.state!;
    const n = nodeById(s, nodeId);
    return !!n.heart || !!armyAt(s, nodeId);
  }

  /**
   * The flagship sets out down a route. Its ship flies first; whatever the system holds shows as it arrives:
   * a find taken, or (if it is guarded) the battle, opening as the ship gets halfway.
   */
  private setOut(armyId: string, toId: string, auto: boolean): boolean {
    this.sheet = null;
    this.army = null;
    this.advance = { armyId, toId };
    sound.flare();
    this.host.render();
    setTimeout(() => {
      this.advance = null;
      const waiting = this.state?.story.queue.length ?? 0;
      const seq = this.state?.log[this.state.log.length - 1]?.seq ?? 0;
      if (!this.state || this.state.battle || !this.apply({ type: 'move', armyId, toId })) return this.host.render();
      this.selected = toId;
      // What was there, found as the ship arrives.
      const found = this.state.log.find((l) => l.seq > seq && / finds /.test(l.text));
      if (found) {
        this.host.toast(found.text);
        sound.buy();
      }
      const battle = (this.state as CampaignState).battle;
      if (!battle) return this.host.render();
      this.readWaiting(waiting);
      if (auto) {
        this.finishBattle(battle.game, true);
        // (Auto-resolved here, so the map redraws with the result.)
        this.host.render();
      } else this.host.playBattle(battle.game);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1150);
    return true;
  }

  /** The flagship has made its move and nothing is waiting on the player: the turn is spent. */
  private moveSpent(): boolean {
    const s = this.state;
    if (!s || s.phase !== 'player' || s.battle || s.conquest || s.cardRewards.length || s.winner) return false;
    const a = flagship(s, s.playerId);
    // (Moved, or with nowhere to go at all: there is no waiting, so time moves on by itself.)
    return !!a && armyMoves(s, a).length === 0;
  }

  /** Time moves on: the raiders move, the collapse comes on. (`wait`: the flagship holds where it is.) */
  private passTime(wait = false) {
    if (!wait && !this.moveSpent()) return;
    if (!this.apply({ type: 'endTurn', stepwise: true })) return;
    this.selected = null;
    this.army = null;
    this.sheet = null;
    void this.runOthers();
  }

  /** Petals grabbed at a wormhole go straight into the account's lasting progress (they outlive the run). */
  private bankPetals() {
    const s = this.state;
    if (!s || s.petals <= s.petalsBanked) return;
    const meta = loadMeta();
    saveMeta({ ...meta, petals: meta.petals + (s.petals - s.petalsBanked), best: Math.max(meta.best, s.universe - 1) });
    this.state = applyCampaignAction(s, { type: 'petalsBanked' });
  }

  /** The lines of a scene that are shown: the generals' (Oriel, the guide, no longer speaks on the map). */
  private shownLines(scene: StoryScene) {
    return scene.lines.filter((l) => l.speaker.kind !== 'oracle');
  }

  /**
   * Going into a battle, the lines still waiting to be read (the first `n` scenes) count as read: they are not
   * left to pile up for after it. (Anything the battle itself brings on still shows.)
   */
  private readWaiting(n: number) {
    for (let i = 0; i < n && this.state?.story.queue.length; i++) this.state = applyCampaignAction(this.state, { type: 'readStory' });
    this.storyLine = 0;
    if (this.state) saveCampaign(this.state);
  }

  /** Scenes with nothing left to show (only Oriel's lines) are passed over. */
  private skipSilentScenes() {
    while (this.state && this.state.story.queue[0] && !this.shownLines(this.state.story.queue[0]).length) {
      this.state = applyCampaignAction(this.state, { type: 'readStory' });
      this.storyLine = 0;
    }
    // One thing at a time, at most: only the newest word waits; anything older is let go, unread.
    while (this.state && this.state.story.queue.length > 1) {
      this.state = applyCampaignAction(this.state, { type: 'readStory' });
      this.storyLine = 0;
    }
  }

  /**
   * The other factions take their turns one at a time. Those in sight are shown moving, on a waiting
   * screen, with whatever they do that can be seen; those out of sight move unseen and at once (so with
   * none in sight, the next turn simply begins). A battle against the player pauses it; finishing the
   * battle carries on.
   */
  private async runOthers() {
    const pause = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const begun = this.state;
    if (!begun) return;
    const turn = begun.turn;
    // The raiders move at once (a moment for any in sight, so their ships are seen to go).
    for (;;) {
      const s = this.state;
      if (!s || s.phase !== 'ai' || s.battle || s.winner || s.turn !== turn) break;
      const next = s.aiQueue[0] ?? null;
      const inSight = next !== null && this.factionInSight(next);
      if (!this.apply({ type: 'aiStep' })) break;
      if (inSight) {
        this.host.render();
        await pause(220);
      }
    }
    this.waiting = null;
    this.host.render();
  }

  /** Whether a faction can be seen at all: any of its systems or armies in sight. */
  private factionInSight(factionId: string): boolean {
    const s = this.state!;
    const seen = visibleNodes(s, s.playerId);
    return s.nodes.some((n) => n.owner === factionId && seen.has(n.id)) || s.armies.some((a) => a.owner === factionId && seen.has(a.nodeId));
  }

  /** The waiting screen while the others move: who is moving, and what of it can be seen. */
  private renderWaiting(): string {
    const w = this.waiting!;
    const s = this.state!;
    const f = w.factionId ? s.factions.find((x) => x.id === w.factionId) : null;
    const name = f ? (f.lost ? 'the lost races' : lower(f.name)) : 'the others';
    return `
      <div class="cmp-waiting" aria-live="polite">
        <div class="cmp-waiting-card" style="--fc:${f ? this.colourOf(f.id) : NEUTRAL}">
          <div class="cmp-waiting-head">${f ? this.avatarOf(f.id, 'cmp-waiting-av') : ''}<div><small>the other factions move</small><b>${esc(name)}</b></div><span class="cmp-waiting-dots"><i></i><i></i><i></i></span></div>
          ${w.lines.length ? `<ul class="cmp-waiting-feed">${w.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`;
  }

  /** A key on the map: nothing to do (there is no waiting: every turn is a move). */
  onKey(_key: string): boolean {
    return false;
  }



  // ---- Clicks -----------------------------------------------------------------

  /** Returns true if the click was a campaign action. */
  onClick(act: string, arg: string, el: HTMLElement): boolean {
    const s = this.state;
    const n = () => Number(arg);
    switch (act) {
      case 'cmp-rivals':
        this.setup.rivals = n();
        break;
      case 'cmp-race':
        if (this.setup.race !== n()) this.setup.hero = 0;
        this.setup.race = n();
        break;
      case 'cmp-shop':
        this.shopOpen = !this.shopOpen;
        break;
      case 'cmp-hero-pick':
        this.setup.hero = n();
        sound.hover();
        break;
      case 'cmp-new-run':
        // (Off to the upgrades and a new run: the finished one is gone.)
        this.openSetup();
        saveCampaign(null);
        break;
      case 'cmp-meta-buy': {
        const meta = loadMeta();
        const why = buyUpgradeProblem(meta, arg);
        if (why) {
          this.host.toast(why);
          sound.error();
          break;
        }
        saveMeta(buyUpgrade(meta, arg));
        sound.upgrade();
        break;
      }
      case 'cmp-start': {
        const meta = loadMeta();
        const hero = GENERALS[this.setup.race][this.setup.hero];
        if (!raceUnlocked(meta, this.setup.race) || !heroUnlocked(meta, hero)) {
          this.host.toast('Unlock that race and hero with Stellari petals first.');
          sound.error();
          break;
        }
        saveMeta({ ...meta, runs: meta.runs + 1 });
        this.state = createCampaign({ seed: (Math.random() * 2 ** 31) | 0, race: this.setup.race, hero, run: runBonuses(meta) });
        this.selected = null;
        this.view = null;
        this.skipSilentScenes();
        saveCampaign(this.state);
        sound.objective();
        this.army = null;
        this.storyLine = 0;
        // The map is up: announce the run (the setup page before it gets none).
        this.host.render();
        this.host.banner('universe 1', 'reach the wormhole');
        return true;
      }
      case 'cmp-zoom':
        if (this.view) {
          this.selected = null;
          this.view.zoom *= Number(arg);
          this.clampView();
        }
        break;
      case 'cmp-home-view':
        this.selected = null;
        this.view = this.homeView();
        break;
      case 'cmp-recentre':
        this.nebula?.reset();
        return true;
      case 'cmp-deselect':
        if (this.swallowClick || (!this.selected && !this.army)) return true;
        this.selected = null;
        this.army = null;
        break;
      case 'cmp-army': {
        if (this.swallowClick) return true;
        const army = armyById(s!, arg);
        // Your own ship: nothing to show (it is always the one that moves). Anyone else's: the system it stands in.
        if (army.owner === s!.playerId) {
          this.army = null;
          this.selected = null;
        } else this.selected = army.nodeId;
        sound.hover();
        break;
      }
      case 'cmp-story-next': {
        const scene = s?.story.queue[0];
        if (!scene) break;
        if (this.storyLine < this.shownLines(scene).length - 1) this.storyLine++;
        else {
          this.storyLine = 0;
          this.apply({ type: 'readStory' });
        }
        sound.hover();
        break;
      }
      case 'cmp-story-skip':
        this.storyLine = 0;
        this.apply({ type: 'readStory' });
        break;
      case 'cmp-stabilise':
        if (this.apply({ type: 'stabilise', nodeId: arg })) sound.shield();
        break;
      case 'cmp-heal-army':
        if (this.apply({ type: 'healArmy', armyId: arg, all: el.dataset.all === '1' })) el.dataset.all === '1' ? sound.upgrade() : sound.repair();
        break;
      case 'cmp-research':
        if (el.dataset.project && this.apply({ type: 'research', nodeId: arg, projectId: el.dataset.project })) sound.upgrade();
        break;
      case 'cmp-visit': {
        // A station the flagship stands in: its armoury, or its research.
        const node = nodeById(s!, arg);
        if (node.station?.kind === 'armory') {
          this.keeperVisit++;
          this.sheet = { kind: 'armory', nodeId: arg, tab: 'buy' };
        } else if (node.station?.kind === 'research') this.sheet = { kind: 'research', nodeId: arg };
        sound.hover();
        break;
      }
      case 'cmp-armory-tab':
        if (this.sheet?.kind === 'armory' && (arg === 'buy' || arg === 'recycle' || arg === 'fuse')) {
          this.sheet = { kind: 'armory', nodeId: this.sheet.nodeId, tab: arg };
          this.keeperVisit++;
        }
        break;
      case 'cmp-buy': {
        if (this.sheet?.kind !== 'armory') break;
        const nodeId = this.sheet.nodeId;
        const index = this.stock(nodeId).indexOf(arg);
        if (index >= 0 && this.apply({ type: 'buyCard', nodeId, index })) {
          sound.buy();
          this.sheet = { kind: 'armory', nodeId, tab: 'buy' };
        }
        break;
      }
      case 'cmp-recycle':
        if (this.sheet?.kind !== 'armory') break;
        if (this.apply({ type: 'recycle', defId: arg })) {
          sound.shuffle();
          if (this.sheet?.kind === 'armory') this.sheet = { kind: 'armory', nodeId: this.sheet.nodeId, tab: 'recycle', pick: campaignPlayer(this.state!).reserve.includes(arg) ? arg : undefined };
        }
        break;
      case 'cmp-tip':
        this.popTip = this.popTip === el.dataset.tip ? null : el.dataset.tip ?? null;
        break;
      case 'cmp-select':
        this.popTip = null;
        if (this.swallowClick) return true;
        // A star in the flagship's reach sends it there (no need to pick the ship first); a known foe gets a
        // look at the matchup first.
        if (s && s.phase === 'player' && !s.battle) {
          const army = (this.army ? s.armies.find((a) => a.id === this.army) : undefined) ?? flagship(s, s.playerId);
          const move = army ? armyMoves(s, army).find((m) => m.toId === arg) : undefined;
          if (army && move) {
            // Into the unknown (who knows what a system holds until you get there): the ship just sets out.
            if (!this.known(arg) && !nodeById(s, arg).owner) return this.setOut(army.id, arg, false);
            if (move.battle) this.sheet = { kind: 'attack', armyId: army.id, toId: arg };
            else if (this.apply({ type: 'move', armyId: army.id, toId: arg })) {
              sound.play();
              // (Arrived: a station's popover to use it; anywhere else, nothing.)
              this.selected = nodeById(s, arg).station ? arg : null;
              this.army = null;
            }
            break;
          }
        }
        // (No popover for the starting world, nor where your ship stands, unless it is a station to use there.
        // The camera stays where it is: a focused system just shows its planets.)
        if (s && (nodeById(s, arg).home || (flagship(s, s.playerId)?.nodeId === arg && !nodeById(s, arg).station))) {
          this.selected = null;
          break;
        }
        this.selected = arg;
        sound.hover();
        break;
      case 'cmp-sheet':
        this.sheet = { kind: arg as 'log' | 'help' };
        break;
      case 'cmp-fuse': {
        if (this.sheet?.kind !== 'armory' || this.sheet.fuse?.length !== 2) break;
        const reserve = campaignPlayer(s!).reserve;
        const [x, y] = this.sheet.fuse;
        const a = reserve.indexOf(x);
        const b = reserve.findIndex((id, k) => id === y && k !== a);
        if (a >= 0 && b >= 0 && this.apply({ type: 'fuse', a, b })) {
          sound.upgrade();
          this.sheet = { kind: 'armory', nodeId: this.sheet.nodeId, tab: 'fuse' };
        }
        break;
      }
      case 'cmp-close':
        if (this.battleReport && !this.sheet) {
          this.battleReport = null;
          this.report = null;
        } else if (this.report && !this.sheet) this.report = null;
        else this.sheet = null;
        break;
      case 'cmp-attack-pick':
        this.sheet = { kind: 'attack', armyId: el.dataset.army!, toId: arg };
        break;
      case 'cmp-travel':
        return this.setOut(el.dataset.army!, arg, false);
      case 'cmp-fight': {
        if (this.sheet?.kind !== 'attack') break;
        const { armyId, toId } = this.sheet;
        return this.setOut(armyId, toId, false);
      }
      case 'cmp-defend':
        this.readWaiting(s!.story.queue.length);
        this.host.playBattle(s!.battle!.game);
        return true;
      case 'cmp-conquer':
        if (this.apply({ type: 'conquer', choice: 'settle' })) sound.upgrade();
        break;
      case 'cmp-card':
        if (this.apply({ type: 'chooseCard', defId: arg || null })) sound.buy();
        break;
      case 'cmp-end-turn':
        // Hold where it stands for a turn (the collapse still comes on).
        this.sheet = null;
        this.passTime(true);
        sound.endTurn();
        return true;
      case 'cmp-menu':
        this.sheet = { kind: 'settings' };
        break;
      case 'cmp-exit':
        this.sheet = null;
        this.host.toMenu();
        return true;
      case 'cmp-abandon':
        saveCampaign(null);
        this.state = null;
        this.host.toMenu();
        return true;
      default:
        return false;
    }
    this.host.render();
    return true;
  }

  // ---- Rendering ----------------------------------------------------------------

  /** Emblem and colour follow a faction's race (the player may be any of the four). */
  private raceKey(factionId: string): string {
    const f = this.state?.factions.find((x) => x.id === factionId);
    return `f${(f?.race ?? 0) + 1}`;
  }
  private avatarOf(factionId: string, cls = ''): string {
    return factionId === 'lost' ? `<span class="fav ${cls} fav-lost">${LOST_PORTRAIT}</span>` : factionAvatar(this.raceKey(factionId), cls);
  }
  private colourOf(factionId: string): string {
    return factionId === 'lost' ? LOST_COLOUR : FACTION_COLOUR[this.raceKey(factionId)];
  }

  render(): string {
    // (Cards show, and battles play, under the run's rules: Core for a core race, else Lost Races.)
    setRulesMode(this.state ? this.state.mode : this.setup.race < 4 ? 'core' : 'lost');
    if (!this.state) return this.renderSetup();
    const html = this.renderCampaign();
    this.lastFocus = this.selected;
    return html;
  }

  /** The system that was focused at the last render and no longer is: its orbits and panel fade out. */
  private leavingFocus(): CampaignNode | null {
    return this.lastFocus && this.lastFocus !== this.selected ? nodeById(this.state!, this.lastFocus) : null;
  }

  private renderCampaign(): string {
    const s = this.state!;
    // A dialog up (a battle, a conquest, a sheet) takes the stage: the guide waits until it closes.
    const overlay = this.renderOverlay();
    // Ships hold still under a dialog, and sail once it closes (so a march after a battle is seen).
    this.fleetHeld = !!overlay && !this.waiting;
    const scene = !overlay && s.story.queue[0] && this.shownLines(s.story.queue[0]).length ? s.story.queue[0] : null;
    const me = campaignPlayer(s);
    return `
      <main class="cmp ${canNebula() ? 'cmp-3d' : ''}">
        <canvas class="cmp-nebula" data-key="cmp-nebula" aria-hidden="true"></canvas>
        <header class="cmp-top">
          <div class="cmp-top-left">
            ${this.renderGalaxy()}
            ${this.renderStability()}
            ${scene ? this.renderStory(scene) : ''}
          </div>
          <div class="cmp-purse">
            <span data-tip="Materials: paid once by every system taken, battles and missions. Spent on cards at space stations.">${MATERIALS}<b>${me.materials}</b></span>
            <span data-tip="Stellari petals grabbed this run (they are kept, whatever happens)">${PETAL}<b>${s.petals}</b></span>
          </div>
          <nav class="cmp-nav">
            <button class="icon-btn" data-act="cmp-menu" aria-label="Settings" title="Settings">${MENU_ICON}</button>
          </nav>
        </header>
        <section class="cmp-map">${this.renderMap()}</section>
        ${this.renderRelics()}
        <canvas class="cmp-nebula-front" data-key="cmp-nebula-front" aria-hidden="true"></canvas>
        ${this.flyOver() ? `<div class="cmp-fleet-top" data-key="cmp-fleet-top"><div class="cmp-plane cmp-plane-top" style="width:${MAP_WIDTH}px;height:${MAP_HEIGHT}px">${this.renderFleet(this.seenNow)}</div></div>` : ''}
        <button class="icon-btn cmp-recentre" data-act="cmp-recentre" data-key="cmp-recentre" aria-label="Back to the whole strip" title="Back to the whole strip" style="display:none">${RECENTRE_ICON}</button>
        ${this.renderPop()}
        ${this.waiting ? this.renderWaiting() : overlay}
      </main>`;
  }

  /** What this galaxy is like (touching every battle in it): its mark, its name, and what it does on a hover or tap. */
  private renderGalaxy(): string {
    const kind = this.state!.galaxy;
    if (!kind) return '';
    const g = GALAXIES[kind];
    return `<button class="cmp-galaxy" data-tip-title="${esc(g.name.toLowerCase())}" data-tip="${esc(g.text)}" data-tip-note="Every battle in this galaxy, both sides." aria-label="${esc(g.name)}"><svg viewBox="0 0 24 24" aria-hidden="true">${GALAXY_GLYPH[kind]}</svg><b>${esc(g.name.toLowerCase())}</b></button>`;
  }

  /**
   * The relics found on the way, down the right of the screen: each a paper token with its kind's mark in ink,
   * rimmed in gold (a blessing) or red (a curse), saying what it does on a hover or tap.
   */
  private renderRelics(): string {
    const relics = campaignPlayer(this.state!).relics ?? [];
    if (!relics.length) return '';
    const tokens = relics
      .map(
        (r) =>
          `<button class="cmp-relic ${r.cursed ? 'cursed' : 'blessed'} rarity-${r.rarity}" data-key="relic-${r.id}" data-tip-title="${esc(r.name.toLowerCase())}" data-tip="${esc(r.cursed ? r.text : itemText(r))}" data-tip-note="${r.cursed ? 'Cursed: it weighs on your flagship in every battle.' : "A blessing on your hero's card in every battle."}" aria-label="${esc(r.name)}">${RELIC_GLYPH[r.slot] ?? RELIC_GLYPH.weapon}</button>`,
      )
      .join('');
    return `<aside class="cmp-relics" aria-label="Relics">${tokens}</aside>`;
  }

  private renderSetup(): string {
    const meta = loadMeta();
    const buy = (id: string, label: string) => {
      const why = buyUpgradeProblem(meta, id);
      const cost = metaUpgrade(id)!.cost(levelOf(meta, id));
      return `<button class="pill-btn cmp-buy" data-act="cmp-meta-buy" data-arg="${esc(id)}" ${why ? `disabled data-tip="${esc(why)}"` : ''}>${label} · ${PETAL}${cost}</button>`;
    };
    const r = this.setup.race;
    const colour = (race: number) => FACTION_COLOUR[`f${race + 1}`];
    // Down the left: every race, picked or locked.
    const races = RACE_NAMES.map((name, i) => {
      const open = raceUnlocked(meta, i);
      // (The Lost Races, unlocked with petals, under a heading of their own; a run as one plays every mechanic.)
      return `${i === 0 ? '<small class="cmp-rs-head">core races</small>' : ''}${i === 4 ? '<small class="cmp-rs-head" data-tip="Unlocked with Stellari petals. A run as one of them is played in Lost Races mode: every race and mechanic.">lost races</small>' : ''}<button class="cmp-rs ${r === i ? 'on' : ''} ${open ? '' : 'locked'}" data-act="cmp-race" data-arg="${i}" style="--rc:${colour(i)}">
        ${factionAvatar(`f${i + 1}`, 'cmp-rs-emblem')}<b>${lower(name)}</b>${open ? '' : `<i class="cmp-rs-lock">${PETAL}${metaUpgrade(`race:${i}`)!.cost(0)}</i>`}
      </button>`;
    }).join('');
    // The picked race: its own card, then its sub-races.
    const raceOpen = raceUnlocked(meta, r);
    const subs = Object.values(SUBRACES).filter((x) => x.race === r);
    const raceCard = `<div class="cmp-rc cmp-rc-race ${subs.length ? '' : 'wide'}">
      <span class="cmp-rc-mark">${factionAvatar(`f${r + 1}`)}</span>
      <div class="cmp-rc-body">
        <b class="cmp-rc-name">${lower(RACE_NAMES[r])}</b>
        <p>${esc(RACE_BLURB[r])}</p>
        ${RACE_TRAITS[r] ? `<div class="cmp-rc-traits"><em class="cmp-trait-bonus">+ ${esc(plainText(RACE_TRAITS[r]!.bonus))}</em></div>` : ''}
        ${raceOpen ? '' : buy(`race:${r}`, 'unlock')}
      </div>
    </div>`;
    const subCards = subs
      .map((x) => `<div class="cmp-rc cmp-rc-sub"><small>sub-race</small><b class="cmp-rc-name">${lower(x.name)}</b><p>${esc(x.theme)}.</p></div>`)
      .join('');
    // Its heroes, each a card with its art.
    const heroes = GENERALS[r]
      .map((g, i) => {
        const def = cardDef(g);
        const open = heroUnlocked(meta, g);
        const sub = def.sub && SUBRACES[def.sub] ? SUBRACES[def.sub].name : '';
        return `<div class="cmp-hc ${this.setup.hero === i ? 'on' : ''} ${open ? '' : 'locked'}" data-act="cmp-hero-pick" data-arg="${i}" role="button">
          <span class="cmp-hc-art">${cardArtLite(def)}</span>
          <div class="cmp-hc-body">
            <b class="cmp-rc-name">${lower(def.name)}</b>
            <small>${esc(RARITY_NAME[def.rarity ?? 'dwarf'] ?? '')}${sub ? ` · ${esc(sub)}` : ''}</small>
            <p>${esc(plainText(def.text))}</p>
            ${open ? '' : buy(`hero:${g}`, 'unlock')}
          </div>
        </div>`;
      })
      .join('');
    const pickedHero = GENERALS[r][this.setup.hero];
    const ready = raceOpen && heroUnlocked(meta, pickedHero);
    return `
      <main class="cmp-setup setup-page" style="--rc:${colour(r)}">
        <header class="setup-top">
          <button class="btn btn-small" data-act="cmp-exit">‹ back</button>
          <h2 class="menu-heading">a dying universe</h2>
          <button class="cmp-petals cmp-shop-btn" data-act="cmp-shop" data-tip="Spend Stellari petals on lasting upgrades">${PETAL}<b>${meta.petals}</b><span>upgrades</span></button>
        </header>
        <div class="setup-body cmp-setup-body">
          <nav class="cmp-rs-list">${races}</nav>
          <div class="cmp-setup-right">
            <div class="cmp-rc-row">${raceCard}${subCards}</div>
            <div class="cmp-hc-row">${heroes}</div>
          </div>
        </div>
        <footer class="setup-foot"><button class="btn-primary" data-act="cmp-start" ${ready ? '' : 'disabled'}>begin run</button></footer>
        ${this.shopOpen ? this.renderShop(meta, buy) : ''}
      </main>`;
  }

  /** The petal shop: lasting upgrades, by group, each with its level and the next level's price. */
  private renderShop(meta: MetaState, buy: (id: string, label: string) => string): string {
    const groups: [MetaGroup, string][] = [['start', 'a stronger start'], ['flagship', 'a tougher flagship'], ['perk', 'run perks']];
    const shop = groups
      .map(([g, title]) => {
        const rows = META_UPGRADES.filter((u) => u.group === g)
          .map((u) => {
            const level = levelOf(meta, u.id);
            const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
            return `<div class="cmp-up"><div><b>${esc(u.name.toLowerCase())}</b><small>${esc(u.text)}</small></div><span class="cmp-up-pips">${pips}</span>${level < u.max ? buy(u.id, 'buy') : '<span class="cmp-up-max">max</span>'}</div>`;
          })
          .join('');
        return `<section><div class="cmp-label">${title}</div><div class="cmp-ups">${rows}</div></section>`;
      })
      .join('');
    return `
      <div class="cmp-shop">
        <div class="cmp-shop-panel">
          <header><b>upgrades</b><span class="cmp-petals">${PETAL}<b>${meta.petals}</b></span><button class="icon-btn" data-act="cmp-shop" aria-label="Close">×</button></header>
          ${meta.runs ? `<p class="muted">Best run: ${meta.best} universe${meta.best === 1 ? '' : 's'} crossed, in ${meta.runs} run${meta.runs === 1 ? '' : 's'}.</p>` : ''}
          <div class="cmp-shop-groups">${shop}</div>
        </div>
      </div>`;
  }

  /** Regional stability: the lead-up's turns draining away, then how fast the universe is collapsing. */
  private renderStability(): string {
    const s = this.state!;
    const left = regionalStability(s);
    const total = universeStability(s);
    const segments = Array.from({ length: total }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('');
    const columns = CAMPAIGN.columns + 1 - s.collapseCol;
    const tip = left
      ? `Regional stability: ${left} move${left === 1 ? '' : 's'} left. Then the strip collapses from the near end, a whole column with every move, each marked a move before it goes. Whatever stands there is lost.`
      : `The strip is collapsing: a column with every move, from the near end. Marked systems go next: be out of them. ${columns} column${columns === 1 ? '' : 's'} left, the wormhole last.`;
    return `
      <div class="cmp-stability ${left ? '' : 'unstable'}" data-tip="${esc(tip)}">
        <span class="stability-label">${left ? `regional stability ${left}` : `collapsing · ${columns} left`}</span>
        <div class="stability-bar">${segments}</div>
      </div>`;
  }

  /**
   * The map is a tilted plane in perspective (CSS 3D). Stars stand upright on
   * it as billboards; links and territory lie flat on the surface. Selecting a
   * system swoops the camera in, and its planets orbit the star.
   */
  private renderMap(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    // The picked army's routes: battles ringed in red, marches in its colour.
    // (Always the flagship's: no need to pick the ship first. Unknown systems are all ringed alike: a red ring
    // would give away what they hold; only a known foe is ringed in red.)
    const picked = (this.army ? s.armies.find((a) => a.id === this.army) : undefined) ?? flagship(s, me.id) ?? null;
    const moves = picked && s.phase === 'player' && !s.battle && !s.winner ? armyMoves(s, picked) : [];
    const targets = new Set(moves.filter((m) => m.battle && this.known(m.toId)).map((m) => m.toId));
    const marches = new Set(moves.filter((m) => !targets.has(m.toId)).map((m) => m.toId));
    this.reach = new Set(moves.map((m) => m.toId));
    // Focusing a system no longer zooms the camera into it, so nothing else on the map fades away from it
    // either (no "far" systems, no links masked out): the focused system just shows its planets.
    const focus = null as CampaignNode | null;
    const prev = null as CampaignNode | null;
    const leaving = this.leavingFocus();
    const farFrom = (f: CampaignNode | null, x: number, y: number, id: string, r: number) => !!f && f.id !== id && Math.hypot(x - f.x, y - f.y) > r;
    // Fog of war: only systems linked to yours (two links from a scanner) are drawn; routes into the fog fade out.
    const seen = visibleNodes(s, me.id);
    this.seenNow = seen;
    const drawn = new Set<string>();
    this.rays = [];
    const links = s.nodes
      .flatMap((n) =>
        n.links.map((id) => {
          const key = [n.id, id].sort().join('-');
          if (drawn.has(key)) return '';
          drawn.add(key);
          const m = nodeById(s, id);
          if (!seen.has(n.id) && !seen.has(m.id)) return '';
          if (!seen.has(n.id) || !seen.has(m.id)) {
            const [a, b] = seen.has(n.id) ? [n, m] : [m, n];
            return `<line x1="${a.x}" y1="${a.y}" x2="${(a.x + (b.x - a.x) * 0.45).toFixed(1)}" y2="${(a.y + (b.y - a.y) * 0.45).toFixed(1)}" class="cmp-link cmp-link-fog" />`;
          }
          if (n.collapsed || m.collapsed) {
            this.rays.push({ a: n.id, b: m.id, gone: true });
            return '';
          }
          const same = n.owner && n.owner === m.owner;
          // (Drawn flat on the screen over the map, after it is laid out: drawRays. A line on the tilted plane
          // was drawn small and scaled up, and came out pixelated.)
          this.rays.push({ a: n.id, b: m.id, colour: same ? this.colourOf(n.owner!) : undefined });
          return '';
        }),
      )
      .join('');
    // When zoomed in, the links fade out away from the focused system.
    const mask = focus ? `style="--mx:${focus.x}px;--my:${focus.y}px"` : '';
    const nodes = s.nodes
      .filter((n) => seen.has(n.id))
      .map((n) => {
        const colour = n.owner ? this.colourOf(n.owner) : NEUTRAL;
        const far = farFrom(focus, n.x, n.y, n.id, 250);
        const wasFar = farFrom(prev, n.x, n.y, n.id, 250);
        // ('cmp-n3' first: it is what the element is, so a redraw keeps the same element for the same system.)
        const cls = [
          'cmp-n3',
          far !== wasFar ? (far ? 'cmp-fade-out' : 'cmp-fade-in') : '',
          leaving?.id === n.id ? 'cmp-leaving' : '',
          n.owner === me.id ? 'cmp-mine' : '',
          n.owner ? 'cmp-owned' : '',
          n.heart ? 'cmp-heart' : '',
          n.dimmed ? 'cmp-dim' : '',
          n.star ? `cmp-st-${n.star}` : '',
          n.collapsing ? 'cmp-collapsing' : '',
          n.collapsed ? 'cmp-collapsed' : '',
          n.ruined ? 'cmp-ruined' : '',
          n.cache ? 'cmp-cache' : '',
          targets.has(n.id) ? 'cmp-target' : '',
          marches.has(n.id) ? 'cmp-march' : '',
          this.selected === n.id ? 'cmp-selected' : '',
          n.hazard.length ? 'cmp-hazard' : '',
          s.battle?.nodeId === n.id ? 'cmp-contested' : '',
          far ? 'cmp-far' : '',
        ].join(' ');
        const badges = [
          n.garrison.length ? `<i class="cmp-badge">▣${n.garrison.length}</i>` : '',
          n.damage ? `<i class="cmp-badge cmp-dmg">✸${n.damage}</i>` : '',
          n.scanner ? `<i class="cmp-badge cmp-scan" title="Scanner array">${SCANNER}</i>` : '',
          n.collapsing ? `<i class="cmp-badge cmp-doom" title="Collapsing: gone next turn">⚠</i>` : '',
        ].join('');
        return `
          <div class="${cls}" data-key="sys-${n.id}" style="left:${n.x}px;top:${n.y}px;--fc:${colour}">
            <div class="cmp-turf"></div>
            ${targets.has(n.id) ? `<div class="cmp-ring cmp-ring-target" data-act="cmp-select" data-arg="${n.id}"></div>` : ''}
            ${marches.has(n.id) ? `<div class="cmp-ring cmp-ring-march" data-act="cmp-select" data-arg="${n.id}"></div>` : ''}
            ${n.hazard.length ? '<div class="cmp-ring cmp-ring-hazard"></div>' : ''}
            ${n.collapsing ? '<div class="cmp-ring cmp-ring-collapse"></div>' : ''}
            ${n.home ? '<div class="cmp-ring cmp-ring-home"></div>' : ''}
            ${this.selected === n.id || leaving?.id === n.id ? this.renderOrbits(n) : ''}
            <button class="cmp-bb" data-act="cmp-select" data-arg="${n.id}" aria-label="${esc(n.name)}">
              <span class="cmp-badges">${badges}</span>
              <span class="cmp-star" style="--seed:${seedOf(n.id)}">${n.heart ? `<i class="cmp-bloom3d" title="The ${esc(STELLARIA)}">${stellariaFlower()}</i>` : ''}<i class="cmp-flare"></i><i class="cmp-corona"></i><i class="cmp-core"></i></span>
            </button>
          </div>`;
      })
      .join('');
    return `
      <div class="cmp-stage ${focus ? 'cmp-zoomed' : ''}" data-act="cmp-deselect">
        <svg class="cmp-rays" aria-hidden="true"></svg>
        <div class="cmp-plane" style="width:${MAP_WIDTH}px;height:${MAP_HEIGHT}px">
          <div class="cmp-grid" style="--gk:${(MAP_WIDTH / 3500).toFixed(3)}"></div>
          <svg class="cmp-links ${focus ? 'cmp-links-focus' : ''} ${!!focus !== !!prev ? 'cmp-links-fade' : ''}" ${mask} width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">${links}</svg>
          ${nodes}
          ${this.flyOver() ? '' : this.renderFleet(seen)}
        </div>
      </div>`;
  }

  /** The picked army: its general, its state, and what tapping the map will do with it. */
  private renderArmy(a: Army): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const here = nodeById(s, a.nodeId);
    const moves = s.phase === 'player' && !s.battle ? armyMoves(s, a) : [];
    const fights = moves.filter((m) => m.battle).length;
    const marches = moves.length - fights;
    const hint = a.moved
      ? 'This army has marched this turn. It can refit or move again next turn.'
      : a.refit
        ? 'This army is refitting this turn (its deck or repairs). It can march next turn.'
      : moves.length
        ? `Tap a system next to ${esc(here.name)}: ${marches ? `a <b class="cmp-hint-march">green</b> ring to march there` : ''}${marches && fights ? ', or ' : ''}${fights ? `a <b class="cmp-hint-fight">red</b> ring to fight for it` : ''}.`
        : 'No route is open to this army.';
    const lvl = a.lost ? '' : `level ${heroLevel(heroState(me, a.general).xp)} · `;
    return `
      <div class="pop-head pop-head-army" style="--fc:${this.colourOf(a.owner)}">
        ${armyFace(a)}
        <div><h3>${lower(armyLeader(a))}</h3><small>${lvl}${a.deck.length} cards · in ${lower(here.name)}${a.damage ? ` · ✸${a.damage}` : ''}</small></div>
        <button class="pop-x" data-act="cmp-deselect" aria-label="Close">×</button>
      </div>
      <p class="cmp-hint">${hint}</p>
      ${a.damage && here.owner === me.id ? `<div class="pop-row">${this.repairButtons('cmp-heal-army', a.id, a.damage, CAMPAIGN.armyHealCost, a.moved ? 'It has marched this turn: repair it next turn.' : '')}</div>` : ''}`;
  }

  /** Repair one point, or all of it (as far as the materials go). */
  private repairButtons(act: string, id: string, damage: number, cost: number, blocked: string): string {
    const materials = campaignPlayer(this.state!).materials;
    const all = Math.min(damage, Math.floor(materials / cost));
    const dis = (need: number) => (blocked ? `disabled title="${esc(blocked)}"` : materials < need ? 'disabled' : '');
    return `<button class="pill-btn" data-act="${act}" data-arg="${id}" ${dis(cost)}>repair 1 · ${MATERIALS}${cost}</button>${
      damage > 1 ? `<button class="pill-btn" data-act="${act}" data-arg="${id}" data-all="1" ${dis(cost)}>repair all · ${MATERIALS}${Math.max(1, all) * cost}</button>` : ''
    }`;
  }

  /** Where each army's ship was last drawn, and the way it faces (radians), to sail it on from there. */
  private ships = new Map<string, { node: string; angle: number; x: number; y: number; dur: number; out?: boolean }>();
  /** Ships to set sailing once the map is drawn: where to, and how long it takes. */
  private sails = new Map<string, { x: number; y: number }>();
  /** An army setting out to attack: its ship runs halfway down the route before the battle opens. */
  private advance: { armyId: string; toId: string } | null = null;
  /** The words of the chip last tapped in the popover (shown under its chips). */
  private popTip: string | null = null;
  /** Where the popover was last placed (in the map's box), so a redraw doesn't jump it. */
  private popPos: { x: number; y: number } | null = null;
  /** What the popover was last about (a new subject is placed afresh, not where the last one was). */
  private popKey: string | null = null;
  /** A dialog is up: ships stay where they were drawn. */
  private fleetHeld = false;

  /**
   * The armies' ships, lying on the map beside their systems with their generals' portraits flying above.
   * A ship rests just short of its star on the route it came in by, facing the star; when its army moves,
   * the ship sails down the route to its new system (drawn where it was, then sent on in afterRender).
   */
  private renderFleet(seen: Set<string>): string {
    const s = this.state!;
    const DOCK = 62;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const live = new Set<string>();
    const out = s.armies
      .filter((a) => seen.has(a.nodeId))
      .map((a) => {
        live.add(a.id);
        const n = nodeById(s, a.nodeId);
        const mem = this.ships.get(a.id);
        if (mem && this.fleetHeld) return this.shipHtml(a, mem.x, mem.y, mem.angle, mem.dur);
        const from = mem && mem.node !== a.nodeId ? s.nodes.find((m) => m.id === mem.node) : undefined;
        let angle = mem?.angle ?? -Math.PI / 2;
        if (from) angle = Math.atan2(n.y - from.y, n.x - from.x);
        // Back from an attack that didn't take the system: it turns round and comes home up the same route.
        else if (mem?.out && this.advance?.armyId !== a.id) angle += Math.PI;
        let x = n.x - Math.cos(angle) * DOCK;
        let y = n.y - Math.sin(angle) * DOCK;
        // Setting out to attack: halfway down the route, facing the enemy.
        const adv = this.advance?.armyId === a.id ? s.nodes.find((m) => m.id === this.advance!.toId) : undefined;
        if (adv) {
          angle = Math.atan2(adv.y - n.y, adv.x - n.x);
          x = n.x + (adv.x - n.x) * 0.5;
          y = n.y + (adv.y - n.y) * 0.5;
        }
        let shown = { x, y };
        let dur = mem?.dur ?? 1;
        if (mem && (mem.x !== x || mem.y !== y) && !reduce && (from ? seen.has(from.id) : true)) {
          dur = Math.min(1.8, Math.max(0.9, Math.hypot(x - mem.x, y - mem.y) / 180));
          shown = { x: mem.x, y: mem.y };
          this.sails.set(a.id, { x, y });
        }
        this.ships.set(a.id, { node: a.nodeId, angle, x, y, dur, out: !!adv });
        return this.shipHtml(a, shown.x, shown.y, angle, dur);
      })
      .join('');
    for (const id of [...this.ships.keys()]) if (!live.has(id) && !s.armies.some((a) => a.id === id)) this.ships.delete(id);
    return out;
  }

  /** One army's ship (and the portrait flying above it), drawn at (x, y) facing angle. */
  private shipHtml(a: Army, x: number, y: number, angle: number, dur: number): string {
    const s = this.state!;
    const mine = a.owner === s.playerId;
    const cls = ['cmp-ship', mine ? 'cmp-ship-mine' : '', a.lost ? 'cmp-ship-lost' : '', this.army === a.id ? 'cmp-ship-on' : '', this.sails.has(a.id) ? 'sailing' : ''].join(' ');
    const race = a.lost ? 0 : factionById(s, a.owner).race;
    return `<div class="${cls}" data-key="ship-${a.id}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--rot:${((angle * 180) / Math.PI).toFixed(1)}deg;--dur:${dur.toFixed(2)}s;--ac:${this.colourOf(a.owner)}">
        <div class="cmp-ship-hull" data-act="cmp-army" data-arg="${a.id}"><i class="cmp-ship-shadow"></i><div class="cmp-ship-float">${shipModel(race, !!a.lost)}</div></div>
      </div>`;
  }



  /** Send the ships drawn where they were on to where they are going (the CSS transition does the sailing). */
  private sailShips(root: HTMLElement) {
    for (const [id, to] of this.sails) {
      const el = root.querySelector<HTMLElement>(`[data-key="ship-${id}"]`);
      if (!el) continue;
      void el.offsetWidth;
      el.classList.add('sailing');
      el.style.left = `${to.x.toFixed(1)}px`;
      el.style.top = `${to.y.toFixed(1)}px`;
      const done = () => el.classList.remove('sailing');
      el.addEventListener('transitionend', (e) => e.propertyName === 'left' && done(), { once: false });
      setTimeout(done, 2200);
    }
    this.sails.clear();
  }

  /** An army on the map: its general's portrait in a ring of its faction's colour (dimmed once it has moved). */


  /** The selected system's planets, orbiting its star (sized by level, tinted by track). */
  private renderOrbits(n: CampaignNode): string {
    return n.planets
      .map((pl, j) => {
        const level = 1 + Math.min(2, n.fortification);
        const r = 30 + j * 16;
        const period = 16 + j * 9;
        // Spread the planets around their orbits, deterministically per system.
        const delay = -((n.x * 7 + n.y * 3 + j * 97) % period);
        const size = 7 + level * 2.5;
        return `
          <div class="cmp-orbit-ring" style="--r:${r}px"></div>
          <div class="cmp-orbit" style="--t:${period}s;--d:${delay}s">
            <div class="cmp-arm" style="--r:${r}px">
              <div class="cmp-counter">
                <span class="cmp-orb-planet" style="--pc:${TRACK_TINT[pl.tint]};--ps:${size}px" title="${esc(pl.name)}"><em>${lower(pl.name)}</em></span>
              </div>
            </div>
          </div>`;
      })
      .join('');
  }

  /** Free camera over the map: where it looks (map units) and how far it is zoomed (1 = whole map fits). */
  private view: { x: number; y: number; zoom: number } | null = null;
  /** Where the camera is right now (it outlives re-renders, so a glide can start from it). */
  private cam: Cam | null = null;
  /** A glide in progress: where it started and when. */
  private glide: { from: Cam; start: number } | null = null;
  /** The system focused at the last render, to fade out what belonged to it. */
  private lastFocus: string | null = null;
  private drag: { id: number; x: number; y: number; moved: boolean; pan?: boolean; pinch?: { d: number; zoom: number; mx?: number; my?: number } } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  /** Set after a drag so the click that ends it does not select or deselect. */
  private swallowClick = false;
  private stageEl: HTMLElement | null = null;
  private nebula: Nebula | null = null;

  private static readonly TILT = 0; // (Bird's-eye: straight down on the strip.)
  private static readonly MAX_ZOOM = 12;



  private homeView() {
    const s = this.state!;
    const army = flagship(s, s.playerId);
    const at = army ? nodeById(s, army.nodeId) : ownedNodes(s, s.playerId)[0] ?? s.nodes[0];
    // On the strip: the lanes from top to bottom, and a few columns of the way ahead.
    if (at.col !== undefined) return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, zoom: 0.9 };
    return { x: at.x, y: at.y, zoom: 6 };
  }

  /** Fit the map to its stage and move the camera (called after every render and on resize). */
  afterRender(root: HTMLElement) {
    // (In development, reachable from the console.)
    if (import.meta.env.DEV) (window as unknown as { campaignView?: CampaignView }).campaignView = this;
    const stage = root.querySelector<HTMLElement>('.cmp-stage');
    this.stageEl = stage;
    if (stage) this.sailShips(stage);
    else this.sails.clear();
    requestAnimationFrame(() => this.placePop());
    if (!stage || !this.state) {
      this.cam = null;
      this.glide = null;
      return;
    }
    if (!boundStages.has(stage)) {
      boundStages.add(stage);
      stage.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      stage.addEventListener('pointermove', (e) => this.onPointerMove(e));
      stage.addEventListener('pointerup', (e) => this.onPointerUp(e));
      stage.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      stage.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.view ??= this.homeView();
    this.showNebula(root);
    // (Without WebGL, the strip lies flat on the page, fitted to the screen, as it used to.)
    if (!this.nebula) {
      this.applyCamera(true);
      if (!this.glide) this.fitStrip(stage);
    }
    this.drawRays(stage);
    // (Again once the stars have settled from any grow-in, so the lines meet them exactly.)
    window.setTimeout(() => stage.isConnected && this.drawRays(stage), 700);
    this.placePop();
  }

  /** The routes as lines of light, drawn flat on the screen between the stars as they stand (crisp at any size). */
  private drawRays(stage: HTMLElement) {
    const svg = stage.querySelector<SVGSVGElement>('.cmp-rays');
    if (!svg) return;
    const box = stage.getBoundingClientRect();
    const at = new Map<string, [number, number]>();
    for (const el of stage.querySelectorAll<HTMLElement>('.cmp-n3[data-key^="sys-"]')) {
      const star = el.querySelector('.cmp-star');
      if (!star) continue;
      const r = star.getBoundingClientRect();
      at.set(el.dataset.key!.slice(4), [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top]);
    }
    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);
    // Neon, as the battle's beams are: a blurred halo, a tube of colour, a lighter band in it, a white-hot thread
    // down its middle, humming (in the holder's colour, if held). Halos are blurred together, in one pass.
    const gone: string[] = [];
    const lit: { ends: string; style: string; held: boolean }[] = [];
    for (const { a, b, gone: isGone, colour } of this.rays) {
      const p = at.get(a);
      const q = at.get(b);
      if (!p || !q) continue;
      const ends = `x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"`;
      if (isGone) gone.push(`<line ${ends} class="cmp-link-gone" />`);
      else lit.push({ ends, style: colour ? ` style="--fc:${colour}"` : '', held: !!colour });
    }
    const layer = (cls: string) => lit.map((l) => `<line ${l.ends} class="${cls} ${l.held ? 'cmp-ray-held' : ''}"${l.style} />`).join('');
    svg.innerHTML = `<defs><filter id="cmp-neon" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter></defs>
      ${gone.join('')}
      <g class="cmp-ray-halo" filter="url(#cmp-neon)">${layer('cmp-ray-glow')}</g>
      <g class="cmp-ray">${layer('cmp-ray-tube')}${layer('cmp-ray-band')}${layer('cmp-ray-core')}</g>`;
  }

  /**
   * The whole strip on screen, nothing to scroll or zoom: measure where its stars (and the Stellari) fall,
   * and scale and centre the camera so they fill the stage with a margin all round.
   */
  private fitStrip(stage: HTMLElement) {
    const v = this.view;
    if (!v || !this.state?.nodes.some((n) => n.col !== undefined)) return;
    for (let pass = 0; pass < 3; pass++) {
      const marks = stage.querySelectorAll<HTMLElement>('.cmp-n3 .cmp-star, .cmp-bloom3d');
      if (!marks.length) return;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const m of marks) {
        const r = m.getBoundingClientRect();
        x0 = Math.min(x0, r.left);
        y0 = Math.min(y0, r.top);
        x1 = Math.max(x1, r.right);
        y1 = Math.max(y1, r.bottom);
      }
      const box = stage.getBoundingClientRect();
      const pad = Math.min(48, box.width * 0.04);
      const ratio = Math.min((box.width - 2 * pad) / (x1 - x0), (box.height - 2 * pad) / (y1 - y0));
      const dx = (x0 + x1) / 2 - (box.left + box.width / 2);
      const dy = (y0 + y1) / 2 - (box.top + box.height / 2);
      if (Math.abs(ratio - 1) < 0.02 && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      const scale = this.fitScale(stage, CampaignView.TILT) * v.zoom;
      v.x += dx / scale;
      v.y += dy / (scale * Math.cos((CampaignView.TILT * Math.PI) / 180));
      v.zoom *= ratio;
      this.cam = this.cameraTarget(stage);
      this.writeCamera();
    }
  }

  /** Scale at which the whole map fits the stage, for a given tilt. */
  private fitScale(stage: HTMLElement, tiltDeg: number) {
    const tilt = (tiltDeg * Math.PI) / 180;
    return Math.min(stage.clientWidth / MAP_WIDTH, stage.clientHeight / (MAP_HEIGHT * Math.cos(tilt) + 140));
  }

  /**
   * Where the camera should be: over the focused system (closer and steeper),
   * or wherever the free camera looks.
   */
  private cameraTarget(stage: HTMLElement): Cam {
    const fit = this.fitScale(stage, CampaignView.TILT);
    const v = this.view!;
    // Stars keep a readable size at any zoom. (Focusing a system no longer moves the camera.)
    const ui = Math.min(5, Math.max(0.7, 1 / (fit * v.zoom)));
    return { x: v.x, y: v.y, scale: fit * v.zoom, tilt: CampaignView.TILT, ui };
  }

  /**
   * Move the camera. Zooming into or out of a system glides there (position,
   * zoom and tilt together, with the stars turning and resizing as it goes);
   * pans and pinches follow the finger at once, and a pan during a glide
   * steers it rather than cutting it short.
   */
  private applyCamera(_animate: boolean) {
    // (The strip is fitted to the screen and the camera never moves on its own: no glides, it is simply set.)
    const stage = this.stageEl;
    if (!stage || !this.state || !this.view) return;
    this.glide = null;
    this.cam = this.cameraTarget(stage);
    this.writeCamera();
  }




  /**
   * The nebula, and the 3D space the strip lies in (nebula3d.ts): this universe's gas, with channels cleared
   * along the strip's routes; the map is laid on its plane whenever the camera moves.
   */
  private showNebula(root: HTMLElement) {
    const s = this.state!;
    const back = root.querySelector<HTMLCanvasElement>('canvas.cmp-nebula');
    this.nebula = back ? nebulaOn(back, root.querySelector<HTMLCanvasElement>('canvas.cmp-nebula-front')) : null;
    if (!this.nebula) return;
    this.nebula.onCamera = (cam) => this.layPlane(cam);
    const world = (x: number, y: number): [number, number] => [(x - MAP_WIDTH / 2) * MAP_K, (y - MAP_HEIGHT / 2) * MAP_K];
    const at = new Map(s.nodes.map((n) => [n.id, world(n.x, n.y)]));
    const routes = this.rays.flatMap(({ a, b }) => {
      const p = at.get(a), q = at.get(b);
      return p && q ? [[p[0], p[1], q[0], q[1]] as [number, number, number, number]] : [];
    });
    let seed = s.universe * 7919;
    for (const ch of s.nodes[0]?.name ?? '') seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    this.nebula.show(seed, { nodes: [...at.values()], routes });
    // The map's things in 3D: every system's star (ringed in its holder's colour); nothing over them (what a system
    // holds is found by going there).
    const hex = (c: string): [number, number, number] => {
      const m = /^#?([0-9a-f]{6})$/i.exec(c);
      const v = m ? parseInt(m[1], 16) : 0x999999;
      return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    };
    const objects: MapObject[] = s.nodes.map((n) => {
      const [x, z] = at.get(n.id)!;
      return {
        x,
        z,
        heart: !!n.heart,
        ring: n.owner ? hex(this.colourOf(n.owner)) : undefined,
        dim: !!(n.dimmed || n.collapsing),
        dead: !!(n.collapsed || n.ruined),
        reach: this.reach.has(n.id),
        seed: parseFloat(seedOf(n.id)) * 10 || 0,
      };
    });
    this.nebula.setObjects(objects);
    // The routes, as tubes of soft light in the scene (in the holder's colour where both ends are held).
    this.nebula.setRoutes(
      this.rays.flatMap(({ a, b, gone, colour }) => {
        const p = at.get(a), q = at.get(b);
        return p && q ? [{ a: p, b: q, gone, colour: colour ? hex(colour) : undefined }] : [];
      }),
    );
    this.nebula.setGalaxy(s.galaxy ?? null);
    // Instability: the land is gone up to half a column past the last collapsed system, and cracked up to half a
    // column past the last one collapsing.
    const half = (CAMPAIGN.colGap / 2) * MAP_K;
    const edge = (f: (n: CampaignNode) => boolean) => {
      const xs = s.nodes.filter(f).map((n) => at.get(n.id)![0]);
      return xs.length ? Math.max(...xs) + half : -50;
    };
    const gone = edge((n) => !!n.collapsed);
    this.nebula.setCollapse(gone, Math.max(gone, edge((n) => !!n.collapsing)));
    if (this.nebula.camera) this.layPlane(this.nebula.camera);
  }

  /**
   * Lay the map on the nebula's plane: the plane's transform is the camera's own (its projection, view, and
   * where the plane lies in the nebula's space), so every star, ring and ship stands exactly where the gas is
   * drawn. Stars and marks turn to face the camera (--bb) and keep a readable size (--ui); the routes are then
   * redrawn between the stars as they now stand.
   */
  private layPlane(cam: Camera) {
    const stage = this.stageEl;
    const plane = stage?.querySelector<HTMLElement>('.cmp-plane');
    const back = stage?.closest('.cmp')?.querySelector<HTMLCanvasElement>('canvas.cmp-nebula');
    if (!stage || !plane || !back || !stage.isConnected) return;
    // The stage's place on the canvas, in CSS pixels (the page may be zoomed).
    const cr = back.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const zoom = cr.width / (back.clientWidth || cr.width) || 1;
    const ox = (sr.left - cr.left) / zoom, oy = (sr.top - cr.top) / zoom;
    const W = cam.width, H = cam.height, K = MAP_K;
    // Column-major 4x4s: the plane's own pixels into the nebula's space, then view, projection, and the stage's pixels.
    const model = [K, 0, 0, 0, 0, 0, K, 0, 0, K, 0, 0, (-K * MAP_WIDTH) / 2, PLANE_Y, (-K * MAP_HEIGHT) / 2, 1];
    const screen = [W / 2, 0, 0, 0, 0, -H / 2, 0, 0, 0, 0, -100, 0, W / 2 - ox, H / 2 - oy, 0, 1];
    const m = mul4(screen, mul4(Array.from(cam.proj), mul4(Array.from(cam.view), model)));
    plane.style.transform = `matrix3d(${m.map((v) => +v.toPrecision(8)).join(',')})`;
    // The ships' plane, over the canvas (laid from the canvas's own corner).
    const top = stage.closest('.cmp')?.querySelector<HTMLElement>('.cmp-plane-top');
    const topScreen = [W / 2, 0, 0, 0, 0, -H / 2, 0, 0, 0, 0, -100, 0, W / 2, H / 2, 0, 1];
    if (top) top.style.transform = `matrix3d(${mul4(topScreen, mul4(Array.from(cam.proj), mul4(Array.from(cam.view), model))).map((v) => +v.toPrecision(8)).join(',')})`;
    // Facing the camera, in the plane's own axes (its x, its y across the strip, its z up out of it).
    const [r, u, f] = [cam.right, cam.up, cam.forward];
    const bb = [r[0], r[2], r[1], 0, -u[0], -u[2], -u[1], 0, -f[0], -f[2], -f[1], 0, 0, 0, 0, 1];
    plane.style.setProperty('--bb', `matrix3d(${bb.map((v) => +v.toFixed(5)).join(',')})`);
    top?.style.setProperty('--bb', `matrix3d(${bb.map((v) => +v.toFixed(5)).join(',')})`);
    // A star's pixels on screen per pixel of the plane, at the distance the camera looks to: keep them that size.
    // (Measured at a distance between the camera's and its resting one, so they grow a little as it closes in.)
    const look = Math.sqrt(Math.hypot(cam.eye[0] - cam.target[0], cam.eye[1] - cam.target[1], cam.eye[2] - cam.target[2]) * (this.nebula?.homeDist ?? 5));
    const perPx = ((H / 2) * cam.proj[5] * K) / look;
    plane.style.setProperty('--ui', Math.max(0.4, Math.min(8, 1 / perPx)).toFixed(4));
    top?.style.setProperty('--ui', Math.max(0.4, Math.min(8, 1 / perPx)).toFixed(4));
    plane.style.setProperty('--tilt', '0deg');
    this.drawRays(stage);
    this.placePop();
    const recentre = stage.closest('.cmp')?.querySelector<HTMLElement>('.cmp-recentre');
    if (recentre) recentre.style.display = this.nebula?.away ? '' : 'none';
  }

  private writeCamera() {
    const plane = this.stageEl?.querySelector<HTMLElement>('.cmp-plane');
    const c = this.cam;
    if (!plane || !c) return;
    plane.style.transform = `rotateX(${c.tilt.toFixed(2)}deg) scale3d(${c.scale.toFixed(4)}, ${c.scale.toFixed(4)}, ${c.scale.toFixed(4)}) translate(${(-c.x).toFixed(1)}px, ${(-c.y).toFixed(1)}px)`;
    plane.style.setProperty('--tilt', `${c.tilt.toFixed(2)}deg`);
    plane.style.setProperty('--ui', c.ui.toFixed(4));
    this.placePop();
  }

  private clampView() {
    const v = this.view!;
    v.zoom = Math.max(1, Math.min(CampaignView.MAX_ZOOM, v.zoom));
    v.x = Math.max(0, Math.min(MAP_WIDTH, v.x));
    v.y = Math.max(0, Math.min(MAP_HEIGHT, v.y));
  }

  private onPointerDown(e: PointerEvent) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.view) {
      const [a, b] = [...this.pointers.values()];
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: true, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom } };
      return;
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, pan: e.button === 2 || e.shiftKey };
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.drag || !this.view || !this.stageEl || !this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.drag.pinch && this.pointers.size >= 2) {
      // Two fingers: spreading them zooms toward their middle, moving them together pans.
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const pin = this.drag.pinch;
      if (this.nebula && pin.mx !== undefined && pin.my !== undefined) {
        const at = this.canvasPoint(mx, my);
        if (at && d > 0) this.nebula.zoom(pin.d / d, at.x, at.y);
        const step = toPageDelta(mx - pin.mx, my - pin.my);
        this.nebula.pan(step.x, step.y);
      }
      pin.d = d;
      pin.mx = mx;
      pin.my = my;
      return;
    }
    if (e.pointerId !== this.drag.id) return;
    // A finger's movement on screen, turned into the page's own directions (the page may be sideways).
    const { x: dx, y: dy } = toPageDelta(e.clientX - this.drag.x, e.clientY - this.drag.y);
    if (!this.drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!this.drag.moved) {
      this.drag.moved = true;
      // Dragging while zoomed on a system lets go of it: the camera glides back out while the drag pans on.
      if (this.selected) {
        const n = nodeById(this.state!, this.selected);
        this.view = { ...this.view, x: n.x, y: n.y };
        this.selected = null;
        this.host.render();
      }
      try {
        this.stageEl!.setPointerCapture(e.pointerId);
      } catch {
        // The pointer has gone; the drag ends with it.
      }
    }
    // A drag orbits round the strip; a right-drag (or shift-drag) slides over it.
    if (this.drag.pan) this.nebula?.pan(dx, dy);
    else this.nebula?.orbit(dx, dy);
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
  }

  private onPointerUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.drag?.moved) this.swallowClick = true;
    if (this.pointers.size === 0) this.drag = null;
    window.setTimeout(() => (this.swallowClick = false), 0);
  }

  private onWheel(e: WheelEvent) {
    // The wheel (or a trackpad's pinch) zooms toward the pointer.
    e.preventDefault();
    const at = this.canvasPoint(e.clientX, e.clientY);
    if (!this.nebula || !at) return;
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    this.nebula.zoom(Math.exp(e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0015)), at.x, at.y);
  }

  /** A point on the screen, in the nebula canvas's own CSS pixels. */
  private canvasPoint(cx: number, cy: number): { x: number; y: number } | null {
    const back = this.stageEl?.closest('.cmp')?.querySelector<HTMLCanvasElement>('canvas.cmp-nebula');
    if (!back) return null;
    const r = back.getBoundingClientRect();
    const zx = r.width / (back.clientWidth || r.width) || 1, zy = r.height / (back.clientHeight || r.height) || 1;
    return { x: (cx - r.left) / zx, y: (cy - r.top) / zy };
  }



  /** What is picked on the map (a system or an army), in a popover beside it. */
  private renderPop(): string {
    const s = this.state!;
    let key = '';
    let body = '';
    if (this.selected) {
      key = `n-${this.selected}`;
      body = this.renderNode(nodeById(s, this.selected));
    } else if (this.army && s.armies.some((a) => a.id === this.army)) {
      key = `a-${this.army}`;
      body = this.renderArmy(armyById(s, this.army));
    }
    if (!body) {
      this.popPos = null;
      this.popKey = null;
      return '';
    }
    if (this.popKey !== key) this.popPos = null;
    this.popKey = key;
    const at = this.popPos ? `left:${this.popPos.x}px;top:${this.popPos.y}px` : 'left:0;top:0;visibility:hidden';
    return `<aside class="cmp-pop glass" data-key="pop-${key}" style="${at}">${body}</aside>`;
  }

  /**
   * Where a point of the map's plane (lifted this many pixels, upright, as a star stands on it) shows on the
   * stage: the plane's own transform (translate, scale, tilt about its origin at 50% 54%), then the stage's
   * perspective (1500px, seen from 50% 40%). The same sums the browser does to draw it.
   */
  private project(w: number, h: number, px: number, py: number, lift: number): { x: number; y: number } {
    const c = this.cam!;
    const t = (c.tilt * Math.PI) / 180;
    const X = w * 0.5 + c.scale * (px - c.x);
    const Y = c.scale * (py - c.y);
    const z = Y * Math.sin(t);
    const y0 = h * 0.54 + Y * Math.cos(t);
    const ox = w * 0.5, oy = h * 0.4, d = 1500;
    const f = d / (d - z);
    return { x: ox + (X - ox) * f, y: oy + (y0 - oy) * f - lift * c.ui * c.scale * f };
  }

  /** Put the popover beside what it is about: to its right if there is room, else to its left, kept on screen. */
  private placePop() {
    const stage = this.stageEl;
    const pop = stage?.closest('.cmp')?.querySelector<HTMLElement>('.cmp-pop');
    if (!stage || !pop) return;
    // Where the subject is: worked out from the camera, as the map itself is drawn (measuring elements inside
    // the tilted 3D plane is unreliable in some browsers, which put the popover by the wrong system).
    const s = this.state;
    const node = this.selected && s ? s.nodes.find((n) => n.id === this.selected) : undefined;
    const ship = !node && this.army ? this.ships.get(this.army) : undefined;
    const at = node ? { x: node.x, y: node.y, lift: 24 } : ship ? { x: ship.x, y: ship.y, lift: 6 } : null;
    const box = pop.offsetParent as HTMLElement | null;
    if (!at || !box || (!this.cam && !this.nebula?.camera)) return;
    // Everything in the popover's own CSS pixels: the page may be zoomed (body zoom), so screen measurements
    // are scaled back by how much bigger the popover's box is drawn than it is laid out.
    const st = stage.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const bw = box.offsetWidth || b.width;
    const bh = box.offsetHeight || b.height;
    const zx = b.width / bw || 1;
    const zy = b.height / bh || 1;
    const lw = stage.offsetWidth || st.width;
    const lh = stage.offsetHeight || st.height;
    const neb = this.nebula;
    const back = stage.closest('.cmp')?.querySelector<HTMLCanvasElement>('canvas.cmp-nebula');
    const proj = (x: number, y: number, lift: number) => {
      if (neb?.camera && back) {
        // In the nebula's space: the point on its plane, through the camera, onto the canvas, into the box.
        const q = neb.toScreen((x - MAP_WIDTH / 2) * MAP_K, PLANE_Y, (y - MAP_HEIGHT / 2) * MAP_K) ?? { x: -999, y: -999 };
        const cr = back.getBoundingClientRect();
        const cz = cr.width / (back.clientWidth || cr.width) || 1;
        return { x: (q.x * cz + cr.left - b.left) / zx, y: (q.y * cz + cr.top - b.top) / zy - lift };
      }
      const q = this.project(lw, lh, x, y, lift);
      // The stage's layout pixels, drawn on screen, then back into the box's layout pixels.
      return { x: ((q.x * st.width) / lw + st.left - b.left) / zx, y: ((q.y * st.height) / lh + st.top - b.top) / zy };
    };
    const p = proj(at.x, at.y, at.lift);
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    // Clear of the planets' orbits round a selected star.
    const gap = this.selected ? 70 : 34;
    const cx = p.x;
    const cy = p.y;
    // An army's popover goes on the far side from its routes, so they stay clear to tap.
    let right = true;
    if (this.army && !this.selected) {
      const army = s?.armies.find((a) => a.id === this.army);
      const ends = s && army && s.phase === 'player' ? armyMoves(s, army).map((m) => nodeById(s, m.toId)) : [];
      if (ends.length) right = ends.reduce((t, n) => t + proj(n.x, n.y, 0).x, 0) / ends.length < cx;
    }
    let x = right ? cx + gap : cx - gap - w;
    if (x + w > bw - 12) x = cx - gap - w;
    if (x < 12) x = cx + gap;
    x = Math.max(12, Math.min(bw - w - 12, x));
    const y = Math.max(64, Math.min(bh - h - 84, cy - h / 2));
    this.popPos = { x: Math.round(x), y: Math.round(y) };
    pop.style.left = `${this.popPos.x}px`;
    pop.style.top = `${this.popPos.y}px`;
    pop.style.visibility = '';
  }

  /**
   * The selected system's popover, beside its star: a header, then what is true of it as a row of icon chips
   * (tap one, or hover, for its words), then what you can do there.
   */
  private renderNode(n: CampaignNode): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const mine = n.owner === me.id;
    const owner = n.owner ? factionById(s, n.owner) : null;
    const chip = (body: string, tip: string, tone = '') => `<button class="pop-chip ${tone}" data-act="cmp-tip" data-tip="${esc(tip)}" title="${esc(tip)}">${body}</button>`;
    const icon = (body: string) => `<svg class="pi" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
    const hp = sunHealth(n);
    // What a system holds is known only once you hold it or your flagship is there.
    const known = mine || flagship(s, me.id)?.nodeId === n.id;
    const chips = [
      n.owner || n.heart || n.ruined ? '' : chip(`${icon('<circle cx="8" cy="8" r="6"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.4M8 11.4v.1"/>')}<b>unknown</b>`, `What ${n.name} holds is unknown until you get there: defenders, or something to find. ${starOdds(n)}`),
      n.star ? chip(`<i class="pop-star pop-star-${n.star}"></i><b>${lower(STAR_TYPES[n.star].name)}</b>`, `${STAR_TYPES[n.star].name}. ${STAR_TYPES[n.star].text} + ${STAR_TYPES[n.star].boon} − ${STAR_TYPES[n.star].cost}`) : '',
      n.heart ? chip(`${icon('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/>')}<b>wormhole</b>`, 'Torn open by a Stellari bloom: beat its guardian and go through, into the next universe, with the petals you grab.', 'gold') : '',
      chip(`${icon('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/>')}<b>${hp}</b>`, `Suns have ${hp} max health in a battle here, both sides (before the star, the galaxy and ships' hulls): more the further along the strip, and in every universe after the first.`),
      n.scanner ? chip(SCANNER, 'Scanner array: whoever holds it sees systems two links away.') : '',
      (n.stellaria ?? 0) > 0 ? chip(`${BLOOM}<b>${n.stellaria}</b>`, `A Finite Stellari bloom: +${CAMPAIGN.stellariaMaterials} materials a turn to whoever holds it, for ${n.stellaria} more turn${n.stellaria === 1 ? '' : 's'}.`, 'good') : '',
      n.dimmed ? chip(icon('<path d="M10.5 2.5a5.5 5.5 0 1 0 3 9 5 5 0 0 1-3-9z"/>'), 'Its star has guttered: it yields less than it did.', 'muted') : '',
      n.collapsing ? chip(`${icon('<path d="M8 2 14.5 13.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/>')}<b>collapsing</b>`, 'Collapsing: regional stability has failed here, and it will be gone next turn, with anything still in it.', 'bad') : '',
      (n.stableUntil ?? 0) > s.turn ? chip(`${icon('<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>')}<b>${n.stableUntil}</b>`, `Stabilised: it holds until turn ${n.stableUntil}.`, 'good') : '',
      known && n.station?.kind === 'armory'
        ? chip(`${ARMORY_ICON}<b>${n.station.cards.length ? `space station · ${n.station.cards.length}` : 'space station · sold out'}</b>`, n.station.cards.length ? `A space station: ${n.station.cards.length} card${n.station.cards.length === 1 ? '' : 's'} for sale, each only once. Bring your flagship here to dock.` : 'A space station, sold out.', n.station.cards.length ? 'gold' : 'muted')
        : '',
      known && n.station?.kind === 'research'
        ? chip(`${RESEARCH_ICON}<b>${n.station.takenBy ? 'research · taken' : 'research'}</b>`, n.station.takenBy ? `A research station. Its upgrade has been taken${n.station.takenBy === me.id ? ' (by you)' : ''}.` : `A research station: bring your flagship here and pick one of its ${n.station.options.length} upgrades, free.`, n.station.takenBy ? 'muted' : 'good')
        : '',
    ].join('');
    // What you can do here.
    const attackers = s.phase === 'player' && !s.battle ? attackOptions(s, me.id).find((o) => o.toId === n.id)?.armyIds ?? [] : [];
    // A known foe (the wormhole's guardian, a ship standing there) is attacked; anywhere else, the flagship just travels.
    const travellers = s.phase === 'player' && !s.battle && !n.owner && !this.known(n.id) ? armiesOf(s, me.id).filter((a) => armyMoves(s, a).some((m) => m.toId === n.id)).map((a) => a.id) : [];
    const attack = this.known(n.id)
      ? attackers.map((id) => `<button class="btn-primary pop-attack" data-act="cmp-attack-pick" data-arg="${n.id}" data-army="${id}">${armyFace(armyById(s, id))}attack</button>`).join('')
      : travellers.map((id) => `<button class="btn-primary pop-attack" data-act="cmp-travel" data-arg="${n.id}" data-army="${id}">${armyFace(armyById(s, id))}travel</button>`).join('');
    const here = armyAt(s, n.id);
    const army = here
      ? `<div class="pop-army" style="--ac:${this.colourOf(here.owner)}">
          ${armyFace(here)}<span><b>${lower(armyLeader(here))}</b><small>${here.owner === me.id ? (here.moved ? 'marched this turn' : here.refit ? 'refitting' : 'ready') : here.lost ? 'lost race' : lower(factionById(s, here.owner).name)}${here.damage ? ` · ✸${here.damage}` : ''}</small></span>
          ${
            here.owner === me.id
              ? `<span class="pop-acts">${!here.moved && !here.refit && s.phase === 'player' ? `<button class="pill-btn ${this.army === here.id ? 'pill-on' : ''}" data-act="cmp-army" data-arg="${here.id}">march</button>` : ''}${
                  here.damage && mine ? this.repairButtons('cmp-heal-army', here.id, here.damage, CAMPAIGN.armyHealCost, here.moved ? 'It has marched this turn: repair it next turn.' : '') : ''
                }</span>`
              : ''
          }
        </div>`
      : '';
    const tip = this.popTip ? `<p class="pop-tip">${esc(this.popTip)}</p>` : '';
    // A station your flagship stands in: visit it.
    const atStation = n.station && flagship(s, me.id)?.nodeId === n.id && s.phase === 'player' && !s.battle;
    const visit = atStation ? `<button class="btn-primary pop-attack" data-act="cmp-visit" data-arg="${n.id}">${n.station!.kind === 'armory' ? `${ARMORY_ICON}dock at the space station` : `${RESEARCH_ICON}visit the research station`}</button>` : '';
    return `
      <div class="pop-head" style="--fc:${n.owner ? this.colourOf(n.owner) : NEUTRAL}">
        ${n.owner ? this.avatarOf(n.owner, 'cmp-head-av') : '<i></i>'}
        <div><small>${owner ? (mine ? 'yours' : lower(owner.name)) : n.heart ? 'the wormhole · its guardian' : n.ruined ? 'a ruin · pass through' : `unexplored · depth ${n.tier + 1}`}${n.home ? ' · arrival' : ''}${n.collapsing ? ' · collapsing' : ''}</small></div>
        <button class="pop-x" data-act="cmp-deselect" aria-label="Close">×</button>
      </div>
      <div class="pop-chips">${chips}</div>
      ${tip}
      ${attack ? `<div class="pop-row">${attack}</div>` : ''}
      ${visit ? `<div class="pop-row">${visit}</div>` : ''}
      ${army}
`;
  }

  // ---- Overlays -------------------------------------------------------------------

  private renderOverlay(): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    if (s.winner) {
      // The run is over: how far it got, and what it banked.
      const meta = loadMeta();
      return this.modal(
        'the run is over',
        `<div class="center"><h2>${s.universe > 1 ? `${s.universe - 1} universe${s.universe - 1 === 1 ? '' : 's'} crossed` : 'lost in the first universe'}</h2>
          <p>${s.petals ? `${PETAL} ${s.petals} petal${s.petals === 1 ? '' : 's'} grabbed this run, and banked.` : 'No petals this time: reach a wormhole to grab some.'} You have ${PETAL} ${meta.petals} to spend.</p>
          <div class="cmp-attack-go"><button class="btn-primary" data-act="cmp-new-run">upgrades · new run</button><button class="btn" data-act="cmp-abandon">back to menu</button></div></div>`,
      );
    }
    if (s.battle) {
      const b = s.battle;
      const node = nodeById(s, b.nodeId);
      const attacker = factionById(s, b.attacker);
      const mine = b.attacker === me.id;
      const army = s.armies.find((a) => a.id === b.armyId);
      return this.modal(
        mine ? `the battle for ${lower(node.name)}` : `${lower(army ? armyLeader(army) : attacker.name)} attack${army?.lost ? '' : 's'} ${lower(node.name)}`,
        `${this.matchup(b.armyId, node, b.defender === s.playerId)}
          <div class="cmp-attack-go"><button class="btn-primary" data-act="cmp-defend">${mine ? 'back to it' : 'defend'}</button></div>`,
        false,
        '',
        'cmp-modal-narrow cmp-attack',
      );
    }
    if (s.conquest) {
      const n = nodeById(s, s.conquest.nodeId);
      return this.modal(`${lower(n.name)} has fallen`, `<div class="center-row"><button class="btn-primary" data-act="cmp-conquer">take it · ${MATERIALS}+${n.yield.materials}</button></div>`, false, '', 'cmp-modal-narrow');
    }
    const reward = s.cardRewards[0];
    if (reward) {
      const cards = reward.options.map((id) => `<button class="cmp-pick" data-act="cmp-card" data-arg="${id}">${cardHtml(id)}</button>`).join('');
      return this.modal(
        `★ ${lower(reward.source)} · choose a new card`,
        `<div class="cmp-cards">${cards}</div>
         <div class="center-row"><button class="btn" data-act="cmp-card" data-arg="">skip</button></div>`,
      );
    }
    const sh = this.sheet;
    if (!sh && this.battleReport) return this.renderBattleReport();
    if (!sh && this.report) {
      const lines = this.report.lines.map((l) => `<div>${esc(l)}</div>`).join('');
      return this.modal(this.report.title, `<div class="log-list cmp-report">${lines}</div><div class="center-row"><button class="btn-primary" data-act="cmp-close">continue</button></div>`, true);
    }
    if (!sh) return '';
    switch (sh.kind) {
      case 'armory':
        return this.renderArmory(sh);
      case 'research':
        return this.renderResearch(sh.nodeId);
      case 'log':
        return this.modal('campaign log', `<div class="log-list">${s.log.map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`, true);
      case 'settings':
        return this.modal(
          `settings · turn ${s.turn}`,
          `<div class="menu-list">
            ${this.host.settingsButtons()}
            <button class="btn" data-act="cmp-sheet" data-arg="help">how the loop works</button>
            <button class="btn" data-act="cmp-exit">main menu</button>
          </div>
          <p class="muted center-text">Your run is saved; continue it from the main menu.</p>`,
          true,
        );
      case 'help':
        return this.modal(
          'how the campaign works',
          `<div class="cmp-legend">
            <div>${MATERIALS}<span><b>Materials</b> pay for everything. Earned: every system you take, finds and battles. Spent: cards at space stations, fusing cards and repairs.</span></div>
          </div>
          <ul class="rules">
            <li><b>The loop:</b> each universe is a strip of systems, ${CAMPAIGN.lanes} lanes wide, that you cross from the near end to the wormhole past the far end. Beat the wormhole's guardian to go through, into a harder universe. The run goes on until your flagship is lost.</li>
            <li><b>The collapse:</b> regional stability lasts ${CAMPAIGN.stabilityTurns} moves in the first universe, ${CAMPAIGN.stabilityStep} fewer in each one after (never under ${CAMPAIGN.stabilityMin}). Then the strip gives way from the near end, a whole column with every move, each marked (⚠) a move before. Whatever stands there is lost, your flagship too.</li>
            <li><b>Every move is a turn.</b> Your flagship flies one route at a time, any way you like, back on itself too. Into a system you hold it simply moves; into a <b>find</b> (a derelict, a depot, an archive) it takes what is there with no fight; into any other, it fights. After each move the raiders move and the collapse comes on. Changing the deck or repairing costs no move; <b>wait</b> holds position for one.</li>
            <li><b>Win</b> a system and it is yours: it pays its materials once, your flagship moves in, and it counts for petals. Nothing pays by the move. Some worlds hold a treasury or archives: more credits or research, taken with the system.</li>
            <li><b>Stellari petals</b> are grabbed at every wormhole: a few for getting there, more for every share of the strip you conquered. They are banked at once and outlive the run. Spend them between runs on a stronger start, a tougher flagship, run perks, and new races and heroes.</li>
            <li><b>Its deck</b> starts with ${CAMPAIGN.armySize} cards: your hero and your race's own, with a few neutral cards. It grows with every card you salvage or put in, and never drops below ${CAMPAIGN.armySize}.</li>
            <li><b>Battles</b> are the card game, by its rules. Your hero is in your deck, played like any card, and your ship's rooms add their walls, guns and modules to the cards standing in them.</li>
            <li>${ARMORY_ICON} <b>Space stations</b> sell ${CAMPAIGN.armoryStock} cards each, every one only once. ${RESEARCH_ICON} <b>Research stations</b> offer ${CAMPAIGN.researchOptions} upgrades each: pick one, free. Both are better deep in the strip. Bring your flagship to one to use it.</li>
            <li><b>Your base:</b> your deck, your <b>hero</b> (train, learn skills, wear gear) and your <b>ship</b> (rooms' walls and guns, the command room, shields and hull), and your missions.</li>
            <li>A system with no flagship in it fights as a <b>garrison</b>: more cards, thicker walls and a bigger sun the further along the strip, and the further along the run.</li>
            <li><b>Stars</b> differ. ${(['red', 'white', 'brown', 'neutron'] as const).map((k) => `<b>${STAR_TYPES[k].name}:</b> ${esc(STAR_TYPES[k].boon)} ${esc(STAR_TYPES[k].cost)}`).join(' ')}</li>
            <li><b>Raiders</b> roam the strip: the last of peoples the collapse has already taken. They hunt a flagship that comes near, raid systems you hold, and flee the collapse. Beat them for their relics: ${MATERIALS} ${CAMPAIGN.lostRelicMaterials} and a card.</li>
            <li>Your sun carries its heat on as <b>damage</b> (it starts battles hotter). Repair it with ${MATERIALS} materials in a system you hold.</li>
            <li><b>Fog of war:</b> you only see systems linked to yours. Hold a system with a <b>scanner</b> to see two links out from it.</li>
            <li><b>${esc(ORACLE_NAME)}</b> offers guidance under the move count. Read it or dismiss it; turn it off in settings.</li>
          </ul>`,
          true,
        );
      case 'attack': {
        const to = nodeById(s, sh.toId);
        return this.modal(
          `attack ${lower(to.name)}?`,
          `${this.matchup(sh.armyId, to)}
           <div class="cmp-attack-go"><button class="btn-primary" data-act="cmp-fight">fight</button><button class="btn" data-act="cmp-close">back</button></div>`,
          false,
          '',
          'cmp-modal-narrow cmp-attack',
        );
      }
    }
  }

  /** The two sides of a battle, and, in a few plain words, whatever tips it. */
  private matchup(armyId: string, to: CampaignNode, defending = false): string {
    const s = this.state!;
    const attacker = s.armies.find((a) => a.id === armyId) ?? null;
    const defender = defenderOf(s, to, s.armies.find((a) => a.id === armyId));
    const odds = attacker ? battleOdds(s, attacker, to) : null;
    // Each side's sun as the battle starts it: its heat, of its max health.
    const sun = (o: { heat: number; mods: { maxHealthDelta?: number } } | undefined) =>
      o ? `<small class="cmp-vs-sun" title="Its sun starts at ${Math.max(0, o.heat)} heat, of ${BALANCE.supernovaAt + (o.mods.maxHealthDelta ?? 0)} max health">${Math.max(0, o.heat)}<i>/</i>${BALANCE.supernovaAt + (o.mods.maxHealthDelta ?? 0)}</small>` : '';
    const side = (army: Army | null, n: CampaignNode, o?: { heat: number; mods: { maxHealthDelta?: number } }) => {
      const name = army ? armyLeader(army) : n.owner ? `${factionById(s, n.owner).name} guard` : n.heart ? 'the Heart Wardens' : `${n.name} sentinels`;
      const face = army ? armyFace(army) : n.owner ? this.avatarOf(n.owner, 'cmp-vs-av') : '<span class="cmp-portrait cmp-vs-blank"></span>';
      const colour = army ? this.colourOf(army.owner) : n.owner ? this.colourOf(n.owner) : NEUTRAL;
      return `<div class="cmp-vs-side" style="--fc:${colour}">${face}<b>${lower(name)}</b>${sun(o)}</div>`;
    };
    // What tips the fight, said plainly: each side's sun and modifiers, as the battle would start them.
    const tips: string[] = [];
    // (Said from the player's side: attacking, or defending.)
    const sides = odds ? ([[defending ? 'They' : 'You', defending ? 'Their' : 'Your', odds.attacker], [defending ? 'You' : 'They', defending ? 'Your' : 'Their', odds.defender]] as const) : [];
    for (const [who, whose, side] of sides) {
      const mine = (who === 'You') === true;
      const tone = (good: boolean) => (good === mine ? 'good' : 'bad');
      const m = side.mods;
      if (side.heat > 0) tips.push(`<li class="${tone(false)}">${whose} sun starts ${side.heat} hotter${!mine && to.gate && !to.owner && !defending ? ': they are weakened' : ''}.</li>`);
      if (side.heat < 0) tips.push(`<li class="${tone(true)}">${whose} sun starts ${-side.heat} cooler.</li>`);
      if (m.shieldPerTurn) tips.push(`<li class="${tone(true)}">${who} gain ${m.shieldPerTurn} shield${m.shieldPerTurn === 1 ? '' : 's'} every day.</li>`);
      if (m.coolPerTurn) tips.push(`<li class="${tone(true)}">${whose} sun cools by ${m.coolPerTurn} every day.</li>`);
      if (m.heatPerTurn) tips.push(`<li class="${tone(false)}">${whose} sun heats by ${m.heatPerTurn} every day.</li>`);
      if (m.extraDraw) tips.push(`<li class="${tone(m.extraDraw > 0)}">${who} draw ${Math.abs(m.extraDraw)} ${m.extraDraw > 0 ? 'more' : 'fewer'} every day.</li>`);
      if (m.openingHand) tips.push(`<li class="${tone(m.openingHand > 0)}">${who} start with ${Math.abs(m.openingHand)} ${m.openingHand > 0 ? 'more' : 'fewer'} card${Math.abs(m.openingHand) === 1 ? '' : 's'} in hand.</li>`);
    }
    const g = garrisonBonus(to);
    const held = g.tableau.length + (g.lightspeed ? 1 : 0);
    if (held) tips.push(`<li class="${defending ? 'good' : 'bad'}">${held} of ${defending ? 'your' : 'their'} cards start in play.</li>`);
    if (defender?.lost) tips.push(`<li class="good">Win to take their relics: ${MATERIALS} ${CAMPAIGN.lostRelicMaterials} and a card.</li>`);
    const why = odds ? [...new Set([...odds.attacker.sources, ...odds.defender.sources])] : [];
    if (why.length) tips.push(`<li class="cmp-tips-why">From: ${esc(why.join(', '))}.</li>`);
    return `
      <div class="cmp-vs-row">${side(attacker, attacker ? nodeById(s, attacker.nodeId) : to, odds?.attacker)}<span class="cmp-vs">vs</span>${side(defender, to, odds?.defender)}</div>
      ${tips.length ? `<ul class="cmp-tips">${tips.join('')}</ul>` : ''}`;
  }

  /** A story scene, one line at a time: the speaker's portrait, name and words. */
  private renderStory(scene: StoryScene): string {
    const s = this.state!;
    // One line of a scene, never a conversation: its first.
    const lines = this.shownLines(scene);
    const i = 0;
    const line = lines[i];
    const sp = line.speaker;
    const who =
      sp.kind === 'oracle'
        ? { name: ORACLE_NAME, sub: 'the guide', face: ORACLE_PORTRAIT, colour: '#8f86c9' }
        : (() => {
            const f = s.factions.find((x) => x.id === sp.faction);
            return { name: cardDef(sp.card).name, sub: f ? (f.id === s.playerId ? `your general · ${RACE_NAMES[f.race]}` : RACE_NAMES[f.race]) : '', face: portrait(sp.card), colour: f ? this.colourOf(f.id) : NEUTRAL };
          })();
    // Guidance, not a gate: it sits under the turn count, and the game goes on around it.
    return `
      <aside class="cmp-guide ${sp.kind === 'oracle' ? 'cmp-guide-oracle' : ''}" data-key="guide:${esc(scene.id)}:${i}" style="--sc:${who.colour}">
        <div class="cmp-guide-face" title="${esc(who.name)}${who.sub ? ` · ${esc(who.sub)}` : ''}">${who.face}</div>
        <div class="cmp-guide-body">
          <small class="cmp-guide-who">${esc(who.name.toLowerCase())}</small>
          <p class="cmp-guide-text">${esc(line.text)}</p>
        </div>
        <button class="cmp-guide-next" data-act="cmp-story-skip" aria-label="Dismiss">×</button>
      </aside>`;
  }



  /** What the player has to spend, for the base's and the stations' headers. */
  private purse(): string {
    const me = campaignPlayer(this.state!);
    return `<div class="cmp-purse"><span title="Materials">${MATERIALS}<b>${me.materials}</b></span><span title="Cards in your reserve, waiting for your deck">▤<b>${me.reserve.length}</b></span></div>`;
  }

  /** An armoury's stock (empty if the node has none). */
  private stock(nodeId: string): string[] {
    const st = nodeById(this.state!, nodeId).station;
    return st?.kind === 'armory' ? st.cards : [];
  }

  /** An armoury on the map, full screen like the base: its stock to buy (each card once), and its keepers to recycle and fuse. */
  private renderArmory(sh: Extract<Sheet, { kind: 'armory' }>): string {
    const n = nodeById(this.state!, sh.nodeId);
    this.builder.setMode(this.armoryMode(sh));
    return `
      <div class="cmp-base">
        <header class="cmp-base-top">
          <nav class="cmp-tabs"><span class="cmp-tab cmp-tab-on">${ARMORY_ICON} ${lower(n.name)} space station</span></nav>
          ${this.purse()}
          <button class="icon-btn" data-act="cmp-close" aria-label="Back to the map" title="Back to the map">×</button>
        </header>
        ${this.builder.render()}
      </div>`;
  }

  /** A research station on the map: its upgrades to pick one from (free), and the upgrades your flagship carries already. */
  private renderResearch(nodeId: string): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const n = nodeById(s, nodeId);
    if (n.station?.kind !== 'research') return '';
    const st = n.station;
    const done = (me.research?.done ?? []).map((id) => researchProject(id)).filter((x) => !!x);
    const b = researchBonus(me.research);
    const sums = [
      b.mods.extraPlays ? `+${b.mods.extraPlays} energy a day` : '',
      b.march ? `+${b.march} march` : '',
      b.mods.maxHealthDelta ? `+${b.mods.maxHealthDelta} max health` : '',
      b.mods.openingHand ? `+${b.mods.openingHand} opening hand` : '',
      b.mods.startingHeat ? `sun starts ${-b.mods.startingHeat} cooler` : '',
      b.mend ? `repair ${b.mend} a turn` : '',
      b.sight ? 'farther sight' : '',
      b.loot ? 'more gear found' : '',
      b.dread ? 'the weak surrender' : '',
    ].filter(Boolean);
    const taken = st.takenBy;
    // Each upgrade on offer, a choice to tap: the one taken marked, the others greyed once it is.
    const offers = st.options
      .map((id) => {
        const p = researchProject(id);
        if (!p) return '';
        const why = taken ? null : researchProblem(s, me, n, id);
        const picked = st.project === id;
        const inner = `${RESEARCH_ICON}<div><b>${esc(p.name)}</b><small>tier ${p.tier}${picked ? ' · taken' : ''}</small><p>${esc(p.text)}</p></div>`;
        return taken || why
          ? `<div class="cmp-rs-offer ${picked ? '' : 'taken'}" ${why ? `title="${esc(why)}"` : ''}>${inner}</div>`
          : `<button class="cmp-rs-offer cmp-rs-pick" data-act="cmp-research" data-arg="${n.id}" data-project="${esc(id)}">${inner}</button>`;
      })
      .join('');
    return this.modal(
      `${lower(n.name)} research station`,
      `<div class="cmp-rs-station">
          ${taken ? `<p class="muted center-text">${taken === me.id ? 'You have taken its upgrade.' : `Taken already, by ${esc(factionById(s, taken).name)}.`}</p>` : '<p class="muted center-text">Pick one upgrade, free. The others are lost.</p>'}
          <div class="cmp-rs-offers">${offers}</div>
          ${done.length ? `<p class="cmp-rs-sum">Your flagship carries: ${done.map((x) => esc(x!.name)).join(', ')}.${sums.length ? ` (${sums.join(' · ')})` : ''}</p>` : ''}
        </div>`,
      true,
      '',
      'cmp-modal-narrow',
    );
  }

  /**
   * A battle's report, laid out rather than told: the result and where; the hero (their new level, or the
   * experience); what was won, as tokens; the card salvaged, as itself; and the finds, as their marks.
   */
  private renderBattleReport(): string {
    const r = this.battleReport!;
    const token = (icon: string, n: number, label: string) => (n ? `<span class="br-token" data-tip-title="${esc(label.toLowerCase())}" data-tip="${n > 0 ? 'Won in this battle.' : 'Spent in this battle.'}">${icon}<b>${n > 0 ? '+' : ''}${n}</b></span>` : '');
    const hero = r.hero
      ? `<div class="br-hero ${r.level ? 'br-levelled' : ''}">${portrait(r.hero)}${r.level ? `<span class="br-level">level ${r.level}</span>` : r.xp ? `<span class="br-xp">+${r.xp} xp</span>` : ''}</div>`
      : '';
    const tokens = [token(MATERIALS, r.materials, 'Materials'), r.damage ? `<span class="br-token br-bad" data-tip-title="damage" data-tip="Your flagship's sun starts this much hotter until it is repaired.">✸<b>${r.damage}</b></span>` : ''].join('');
    const finds = r.finds
      .map((f) => `<span class="find rarity-${f.rarity}" data-tip-title="${esc(lower(f.name))}" data-tip="${esc(f.text)}" data-tip-note="${f.kind === 'module' ? 'Ship module: fit it in the ship tab.' : 'Hero gear: equip it in the hero tab.'}">${effectMark(f.mark)}<i class="find-kind">${f.kind === 'module' ? MODULE_ICON : GEAR_ICON}</i></span>`)
      .join('');
    const card = r.salvaged ? `<div class="br-card">${cardHtml(r.salvaged.id)}</div>` : '';
    return this.modal(
      '',
      `<div class="br ${r.won ? 'br-won' : r.draw ? '' : 'br-lost'}">
        <div class="br-head"><h2>${r.won ? 'victory' : r.draw ? 'draw' : 'defeat'}</h2><small>${esc(lower(r.system))}</small></div>
        <div class="br-body">
          ${hero}
          <div class="br-spoils">${tokens ? `<div class="br-tokens">${tokens}</div>` : ''}${finds ? `<div class="finds-row">${finds}</div>` : ''}</div>
          ${card}
        </div>
        <button class="btn-primary" data-act="cmp-close">continue</button>
      </div>`,
      false,
      '',
      'cmp-modal-narrow cmp-br',
    );
  }




  /** The armoury in the deck builder (no deck): its stock to buy, or your reserve to recycle or fuse, run by its keepers. */
  private armoryMode(sh: Extract<Sheet, { kind: 'armory' }>): BuilderMode {
    const s = () => this.state!;
    const me = () => campaignPlayer(s());
    const count = (list: string[], id: string) => list.filter((x) => x === id).length;
    const tab = sh.tab;
    const list = () => (tab === 'buy' ? this.stock(sh.nodeId) : me().reserve);
    const picks = sh.fuse ?? [];
    return {
      owned: (id) => count(list(), id),
      cards: () => [...new Set(list())].map((id) => cardDef(id)),
      deck: () => null,
      tap: (id) => {
        if (tab === 'fuse') {
          const at = picks.lastIndexOf(id);
          const next = at >= 0 ? picks.filter((_, k) => k !== at) : picks.length < 2 && count(picks, id) < count(me().reserve, id) ? [...picks, id] : [...picks.slice(0, 1), id];
          this.sheet = { kind: 'armory', nodeId: sh.nodeId, tab, fuse: next };
        } else this.sheet = { kind: 'armory', nodeId: sh.nodeId, tab, pick: sh.pick === id ? undefined : id };
        sound.hover();
        this.host.render();
      },
      picked: (id) => (tab === 'fuse' ? picks.includes(id) : sh.pick === id),
      badge: (id) =>
        tab === 'buy'
          ? { text: `${MATERIALS}${armoryPrice(id)}`, title: `${armoryPrice(id)} materials`, on: me().materials >= armoryPrice(id) }
          : tab === 'recycle'
            ? { text: `×${count(me().reserve, id)}`, title: `${count(me().reserve, id)} in your reserve: recycles for ${recycleValue(id)} materials each`, on: true }
            : { text: `×${count(me().reserve, id)}`, title: `${count(me().reserve, id)} in your reserve`, on: picks.includes(id) },
      head: () => {
        const keeper = tab === 'buy' ? QUARTERMASTER : RECYCLER;
        const lines = tab === 'buy' ? QUARTERMASTER_LINES : RECYCLER_LINES;
        const line = lines[(s().turn * 3 + this.keeperVisit) % lines.length];
        const sub = (['buy', 'recycle', 'fuse'] as const).map((t) => `<button class="cmp-tab ${t === tab ? 'cmp-tab-on' : ''}" data-act="cmp-armory-tab" data-arg="${t}">${t}</button>`).join('');
        return `
          <nav class="cmp-tabs cmp-armory-tabs">${sub}</nav>
          <div class="cmp-keeper">
            ${tab === 'buy' ? QUARTERMASTER_PORTRAIT : RECYCLER_PORTRAIT}
            <div><b>${esc(keeper.name.toLowerCase())}</b><small>${esc(keeper.role)}</small></div>
          </div>
          <p class="cmp-keeper-line">“${esc(line)}”</p>`;
      },
      foot: () => {
        if (tab === 'fuse') {
          if (picks.length < 2) return `<p class="muted">Pick two reserve cards to fuse into one that does both, for materials. Heroes, global and Lightspeed cards can't be fused, nor can a fused card again.</p>`;
          const [a, b] = picks;
          const problem = fusionProblem(a, b);
          if (problem) return `<p class="cmp-warn">${esc(problem)}</p>`;
          const cost = fusionCost(a, b);
          return `<div class="cmp-keeper-pick">${cardHtml(fusedId(a, b))}</div>
            <p class="muted">${esc(cardDef(a).name)} and ${esc(cardDef(b).name)} become one card. <b>This cannot be undone.</b></p>
            <button class="btn-primary" data-act="cmp-fuse" ${me().materials < cost ? 'disabled' : ''}>fuse · ${MATERIALS} ${cost}</button>`;
        }
        const id = sh.pick && list().includes(sh.pick) ? sh.pick : null;
        if (!id) return `<p class="muted">${tab === 'buy' ? 'Tap a card to look it over. Each is sold once: what you buy waits in your reserve, and is gone from here for good.' : 'Tap a reserve card to break it down for half its space station price, in materials.'}</p>`;
        const why = tab === 'buy' ? buyProblem(s(), me(), nodeById(s(), sh.nodeId), this.stock(sh.nodeId).indexOf(id)) : null;
        return `<div class="cmp-keeper-pick">${cardHtml(id)}</div>${
          tab === 'buy'
            ? `<button class="btn-primary" data-act="cmp-buy" data-arg="${id}" ${why ? `disabled title="${esc(why)}"` : ''}>buy · ${MATERIALS} ${armoryPrice(id)}</button>`
            : `<button class="btn-primary" data-act="cmp-recycle" data-arg="${id}">recycle · +${MATERIALS} ${recycleValue(id)}</button>`
        }`;
      },
    };
  }

  private modal(title: string, body: string, closable = false, tabs = '', cls = 'modal-wide'): string {
    return `
      <div class="overlay ${closable ? 'overlay-soft' : ''}" ${closable ? 'data-act="cmp-close"' : ''}>
        <div class="modal ${cls} cmp-modal">
          <div class="bar-title">${title}${closable ? '<button class="modal-x" data-act="cmp-close" aria-label="Close">×</button>' : ''}</div>
          ${tabs}
          <div class="modal-body">${body}</div>
        </div>
      </div>`;
  }
}


/** Hero gear's mark. */
export const GEAR_ICON = '<svg viewBox="0 0 16 16"><path d="M8 1.8 13.5 4v4c0 3.4-2.4 5.6-5.5 6.4C4.9 13.6 2.5 11.4 2.5 8V4z"/></svg>';
/** A ship module's mark: a chip in a room. */
export const MODULE_ICON = '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.6"/><path d="M6 1.5v2M10 1.5v2M6 12.5v2M10 12.5v2M1.5 6h2M1.5 10h2M12.5 6h2M12.5 10h2"/><circle cx="8" cy="8" r="1.6"/></svg>';

/** A small read-only card face. */
export function cardHtml(defId: string): string {
  const def = cardDef(defId);
  return `
    <div class="card cmp-card kind-${def.kind} rarity-${def.rarity ?? 'dwarf'}" style="--kc:${KIND_COLOUR[shownKind(def)]}">
      ${cardStock(def)}<div class="card-glyph">${cardArtLite(def, true)}</div>${raceRow(def)}${stabilityBadge(def)}
      <div class="card-name">${lower(def.name)}</div>
      <div class="card-text">${cardBodyHtml(def)}</div>
      <div class="card-kind">${typeLine(def)}</div>
    </div>`;
}

/** The map camera: what it looks at (map units), how far it is zoomed, and how steeply it looks down. */
interface Cam {
  x: number;
  y: number;
  scale: number;
  tilt: number;
  /** Star size factor: counters the free zoom so stars stay readable (see cameraTarget). */
  ui: number;
}
