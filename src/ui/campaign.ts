import {
  GALAXIES,
  type GalaxyKind,
  BALANCE,
  battleFinds,
  vaultFinds,
  relicText,
  RELIC_POWERS,
  defenderOf,
  salvageOptions,
  salvageKind,
  salvageToDeck,
  applyCampaignAction,
  armoryPrice,
  CAMPAIGN,
  campaignPlayer,
  cardDef,
  migrateGame,
  migrateCampaign,
  visibleNodes,
  armyAt,
  armyById,
  armyMoves,
  buyProblem,
  flagship,
  META_UPGRADES,
  upgradeOpen,
  buyUpgrade,
  refundUpgrade,
  resetSkills,
  resetSkillsProblem,
  SKILL_RESET_PETALS,
  buyUpgradeProblem,
  levelFor,
  pointCost,
  pointsLeft,
  levelOf,
  raceConquests,
  runBonuses,
  type MetaGroup,
  battleOdds,
  ORACLE_NAME,
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
  fuseProblem,
  recycleProblem,
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
  type MetaState,
  type CampaignAction,
  type CampaignNode,
  type CampaignState,
  type GameState,
  researchProblem,
  researchProject,
  RETIRED_RESEARCH,
  setRulesMode,
  shownKind,
  overlordById,
  type ChallengeKind,
  type Relic,
  markedId,
  NYX_MARKS,
  RIFTS,
  spinGalaxy,
  timePreview,
  struggleLine,
  SLAY_LOOT,

  captainCard,
  runHangar,
  captainPointsSpent,
  resetCaptain,
  resetCaptainProblem,
  treePetalsSpent,
  captainBuild,
  fitPart,
  partSlots,
  SHIP_PARTS,
  SHIP_SLOTS,
  type PartSlot,
  stowParts,
  shipPart,
  setAffinity,
  CORE_RACES,
  KINSHIP_BOOST,
  FELLOWSHIP_BOOST,
  AFFINITY_SKILL,
  priceOf,
  captainMeta,
  captainPrice,
  captainBuyProblem,
  buyCaptain,
  equipCaptainAbility,
  setCaptainLead,
  captainAbility,
  captainLead,
  captainSlots,
  CAPTAIN_ABILITIES,
  CAPTAIN_LEADS,
  CAPTAIN_SLOT_PRICES,
  CAPTAIN_STAT_PRICES,
  CAPTAIN_STABILITY_STEP,
  type CaptainBuy,
  type CaptainStat,
} from '../engine';
import { account, markDirty } from './account';
import { profile } from './profile';
import { loadMeta, saveMeta } from './meta';
import { DeckBuilder } from './builder';
import { shipModel } from './ships';
import { partShape, schematic } from './hangar';
import { stellariaFlower } from './art';
import { choiceRow, setLink, settingsPanel } from './settings';
import { MENU_ICON } from './menu-icon';
import { renderedArt } from './cardart';
import { playerAvatar, raceRow, cardArtLite, cardStock, cardBodyHtml, cardTextHtml, effectMark, mechanicMark, KIND_COLOUR, stabilityBadge, typeLine } from './glyphs';
import { sound } from './sound';
import { reducedMotion } from './fx';
import { voices } from './voice';
import { canNebula, nebulaOn, PLANE_Y, STRIP_WIDTH, type Camera, type MapObject, type Nebula } from './nebula3d';
import { FLY_SECONDS, WARP_SECONDS } from './nebula-objects';
import type { CaptainShipSpec } from './ship3d';

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
/** Where a relic does its work, for its tip. */
const relicNote = (r: Relic) => (r.cursed ? 'Cursed emblem.' : !r.power ? 'Hero card.' : RELIC_POWERS[r.power].kind === 'once' ? 'Once per battle.' : RELIC_POWERS[r.power].kind === 'ability' ? 'Hero ability, one a day.' : '');

import { FACTION_COLOUR, factionAvatar } from './factions';
import { relicMark } from './relic-art';
import orielFace from '../assets/portraits/oriel.webp';
import heskFace from '../assets/portraits/hesk.webp';
import tallowFace from '../assets/portraits/tallow.webp';
import lostFace from '../assets/portraits/lost.webp';
export { FACTION_COLOUR };
const NEUTRAL = '#c9cbd0';
/** A mark drawn in ink (the skill tree's icons, and more). */
const glyph = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
/** Each kind of galaxy's mark, in ink. */
const GALAXY_GLYPH: Record<GalaxyKind, string> = {
  blackHole: '<ellipse cx="12" cy="12" rx="10" ry="3.6"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/><path d="M5 9.5a8 8 0 0 1 14 0"/>',
  pulsar: '<circle cx="12" cy="12" r="2.4"/><path d="M12 9.6 7 2M12 14.4 17 22"/><path d="M9 6.5a7 7 0 0 0-3.6 8M15 17.5a7 7 0 0 0 3.6-8"/>',
  meteors: '<circle cx="16.5" cy="16.5" r="2.4"/><path d="M14.8 14.8 4 4M18 12.5 10 4.5M12.5 18 4.5 10"/>',
  nebula: '<path d="M4 15c0-3 2.5-5 5-4.5C10 7 14 6 16 9c3 0 4.5 2.5 4 5-.5 2.5-3 3.5-5 3H8c-2.5 0-4-1-4-2z"/>',
  darkMatter: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="13" cy="15" r="1.5" fill="currentColor"/>',
};

/** Materials: a paper crate drawn in ink. Earned from systems taken, finds and battles; spent on everything (cards, fusing, repairs). */
const MATERIALS =
  '<svg class="cur cur-materials" viewBox="0 0 20 20" aria-label="materials"><path d="M10 1.5 17 6v8l-7 4.5L3 14V6Z" fill="#e3e2dc"/><path d="M10 1.5 17 6 10 9.6 3 6Z" fill="#ffffff"/><path d="M10 9.6V18.5L3 14V6Z" fill="#f0efea"/><path d="M10 1.5 17 6v8l-7 4.5L3 14V6ZM10 9.6V18.5M3 6l7 3.6L17 6" fill="none" stroke="#6b7590" stroke-width="1" stroke-linejoin="round"/></svg>';
/** A station on the map: an armoury (a crate) or a research station (a ringed flask). */
const ARMORY_ICON =
  '<svg class="cur cur-station" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7 10 3.5 17 7v7L10 17.5 3 14Z" fill="#c99a52" stroke="#7d5a26" stroke-width=".9" stroke-linejoin="round"/><path d="M3 7 10 10.5 17 7M10 10.5v7" fill="none" stroke="#7d5a26" stroke-width=".9"/></svg>';
const RESEARCH_ICON =
  // A test tube, leaning, glowing brew in its lower half, a lip at its mouth.
  '<svg class="cur cur-station" viewBox="0 0 20 20" aria-hidden="true"><g transform="rotate(25 10 10)"><path d="M7 2.2v12.2a3 3 0 0 0 6 0V2.2Z" fill="#eef6fb"/><path d="M7 9.6h6v4.8a3 3 0 0 1-6 0Z" fill="#6aa6ff"/><path d="M6.2 2.2h7.6M7 2.2v12.2a3 3 0 0 0 6 0V2.2" fill="none" stroke="#2f5f86" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';

/** Experience: two chevrons rising (a level up), in gold. */
const XP_MARK =
  '<svg class="cur cur-xp" viewBox="0 0 20 20" aria-label="experience"><path d="M4.6 10.2 10 5l5.4 5.2M4.6 15.2 10 10l5.4 5.2" fill="none" stroke="#b8953f" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** A Stellari petal: what a wormhole gives, banked for every run after. Symmetrical both ways: a pale blue almond. */
/** How long a Power Struggle's rival takes to come alongside, before its screen opens. */
const STRUGGLE_ARRIVE_MS = 1600;

/** The ship: a hull from above, nose to the right (the setup page's ship tab). */
const SHIP_ICON =
  '<svg class="cur cur-ship" viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 10c0-1.6 1.6-2.6 3.6-2.7L13 7c2.4 0 4 1.3 4.6 3-.6 1.7-2.2 3-4.6 3l-6.9-.3C4.1 12.6 2.5 11.6 2.5 10Z" fill="#dfe8f6" stroke="#6b7590" stroke-width=".9" stroke-linejoin="round"/><path d="M7 7.2 9.5 4.5h2L10.4 7M7 12.8l2.5 2.7h2l-1.1-2.5" fill="none" stroke="#6b7590" stroke-width=".9" stroke-linejoin="round"/><circle cx="12.6" cy="10" r="1.2" fill="#6b7590"/></svg>';

/** Each of the Captain's abilities and leads at a glance, for the hero panel's discs: its mark and its amount. */
const CAP_MARKS: Record<string, [string, string]> = {
  brace: ['shield', '1'], patch: ['cool', '1'], scout: ['draw', '1'], volley: ['heat', '2'], bulwark: ['shield', '3'], vent: ['cool', '2'],
  strafe: ['heat', '3'], overdrive: ['energy', '1'], rally: ['chosen', '+2'], mend: ['renew', '1'],
  steady: ['cool', '1'], iron: ['shield', '1'], salvo: ['heat', '3'], gunnery: ['heat', '+1'],
};

const PETAL =
  '<svg class="cur cur-petal" viewBox="0 0 20 20" aria-label="petals"><path d="M10 1.8C15.6 6 15.6 14 10 18.2 4.4 14 4.4 6 10 1.8Z" fill="#d8e4f6" stroke="#97a2ba" stroke-width=".9" stroke-linejoin="round"/><path d="M10 4.6v10.8" stroke="#97a2ba" stroke-width=".7" stroke-linecap="round" opacity=".7"/></svg>';

/** The skill tree's seven branches, one off each petal of the Stellari, each its own colour. */
const UP_BRANCHES: { g: MetaGroup; title: string; dir: number; colour: string }[] = [
  // (One off each of the seven petals the flower shows above the foot of the screen, every 30° from left to right.)
  { g: 'sun', title: 'a cooler sun', dir: 180, colour: '#5f9fdc' },
  { g: 'command', title: 'kinder planets', dir: 210, colour: '#4fae84' },
  { g: 'flagship', title: 'stronger defences', dir: 240, colour: '#c99a3e' },
  { g: 'perk', title: 'the long road', dir: 270, colour: '#9a7fd0' },
  { g: 'start', title: 'a stronger start', dir: 300, colour: '#d9814f' },
  { g: 'spoils', title: 'spoils of war', dir: 330, colour: '#c4564a' },
  { g: 'lore', title: 'lasting wisdom', dir: 360, colour: '#3fa9a4' },
];

/** A research project's mark, as the skill tree's like upgrades have it (by its icon). */
const RESEARCH_MARK = (): Record<string, string> => ({
  cool: UPGRADE_LOOK.cryo.icon,
  energy: UPGRADE_LOOK.foundry.icon,
  hull: UPGRADE_LOOK.plating.icon,
  mend: UPGRADE_LOOK.mend.icon,
  draw: UPGRADE_LOOK.cards.icon,
  loot: UPGRADE_LOOK.scouts.icon,
});

/** Each lasting upgrade's mark, what it gives at a level as a plain sentence (its total, not what each point adds), and its number. */
const UPGRADE_LOOK: Record<string, { icon: string; say: (level: number) => string; value: (level: number) => string }> = {
  materials: { icon: glyph('M12 2.5 20 7v10l-8 4.5L4 17V7ZM4 7l8 4.5L20 7M12 11.5v10'), say: (l) => `Start each run with ${3 * l} materials.`, value: (l) => `+${3 * l}` },
  cards: { icon: glyph('M7 3.5h9a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5ZM11.5 8.5v7M8 12h7'), say: (l) => `${l} more race card${l === 1 ? '' : 's'} in your starting deck.`, value: (l) => `+${l}` },
  pick: { icon: glyph('M6 4.5h8.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V6A1.5 1.5 0 0 1 6 4.5ZM16 7.5l2.6.7a1.5 1.5 0 0 1 1 1.8l-3 11.2M8 12.5l2 2 3.5-4.5'), say: (l) => `Choose ${l} card${l === 1 ? '' : 's'} for your starting deck.`, value: (l) => `+${l}` },
  shields: { icon: glyph('M12 2.8 19.5 6v5.5c0 4.6-3.2 7.8-7.5 9.5-4.3-1.7-7.5-4.9-7.5-9.5V6Z'), say: (l) => `Your sun starts each battle with ${l} shield${l === 1 ? '' : 's'}.`, value: (l) => `+${l}` },
  walls: { icon: glyph('M3.5 20.5h17M5 20.5V9h14v11.5M5 9V5.5h3V9M10.5 9V5.5h3V9M16 9V5.5h3V9M9 20.5v-5h6v5'), say: (l) => `+${l} defence on every tableau slot.`, value: (l) => `+${l}` },
  bastion: { icon: glyph('M5 20.5V8l3-2 4 2 4-2 3 2v12.5ZM9.5 20.5v-5h5v5'), say: (l) => `Your Guards have +${2 * l} defence.`, value: (l) => `+${2 * l}` },
  grace: { icon: glyph('M12 3v4M12 17v4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M3 12h4M17 12h4M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8M12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z'), say: (l) => `Stability holds ${l} longer in every galaxy.`, value: (l) => `+${l}` },
  armory: { icon: glyph('M4 8.5 12 4l8 4.5v7L12 20l-8-4.5ZM4 8.5l8 4.5 8-4.5M12 13v7M8.5 6.2l8 4.5'), say: (l) => `Space station cards cost ${l} less.`, value: (l) => `−${l}` },
  petals: { icon: glyph('M12 2.5c4 3.2 5 8.6 0 15.5-5-6.9-4-12.3 0-15.5ZM12 5.5v10M5 20.5h14'), say: (l) => `${20 * l}% more petals at every wormhole.`, value: (l) => `+${20 * l}%` },
  hoard: { icon: glyph('M3.5 13.5 9 10.5l5.5 3v6l-5.5 3-5.5-3ZM3.5 13.5 9 16.5l5.5-3M9 16.5v6M9.5 7.5 15 4.5l5.5 3v6l-5.5 3M9.5 7.5 15 10.5l5.5-3M15 10.5v6'), say: (l) => `${6 * l} materials in every new galaxy.`, value: (l) => `+${6 * l}` },
  favour: { icon: glyph('M12 3.5c3 2.4 3.8 6.4 0 11.5-3.8-5.1-3-9.1 0-11.5ZM4.5 9.5c3.6-.6 7 1.4 7.5 5.5-4.4.5-7.3-1.6-7.5-5.5ZM19.5 9.5c-3.6-.6-7 1.4-7.5 5.5 4.4.5 7.3-1.6 7.5-5.5ZM12 15v5.5'), say: (l) => `Your sun cools ${3 * l} after each battle won.`, value: (l) => `${3 * l}` },
  cryo: { icon: glyph('M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6.5l2.5-2M9.5 19.5l2.5-2 2.5 2'), say: (l) => `Your sun starts each battle ${l} cooler.`, value: (l) => `${l}` },
  plating: { icon: glyph('M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17ZM12 7.5v9M7.5 12h9'), say: (l) => `+${2 * l} max health on your sun.`, value: (l) => `+${2 * l}` },
  mend: { icon: glyph('M14.5 4.5a4 4 0 0 0-4.8 5.3L4.5 15a2.1 2.1 0 0 0 3 3l5.2-5.2a4 4 0 0 0 5.3-4.8l-2.5 2.5-2.4-.6-.6-2.4Z'), say: (l) => `Your sun cools ${l} each jump.`, value: (l) => `${l}` },
  mantle: { icon: glyph('M12 4.5c4.2 0 7.5 2 7.5 4.5S16.2 13.5 12 13.5 4.5 11.5 4.5 9 7.8 4.5 12 4.5ZM12 13.5c-3.6 0-6.5 2.8-7 6.5h14c-.5-3.7-3.4-6.5-7-6.5Z'), say: (l) => `Your sun gains ${l} shield every day of battle.`, value: (l) => `+${l}` },
  abundance: { icon: glyph('M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16ZM5 10c3 1 5 0 7-2M9 19c0-3 2-5 6-5'), say: (l) => `The abundant planet draws ${l} more card${l === 1 ? '' : 's'}.`, value: (l) => `+${l}` },
  foundry: { icon: glyph('M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16ZM4.5 9.5h15M4.5 14.5h15M10 4.5v15'), say: (l) => `The industrial planet gives ${l} more energy.`, value: (l) => `+${l}` },
  coldworld: { icon: glyph('M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16ZM12 8.5v7M9 10l6 4M15 10l-6 4'), say: (l) => `The dead planet cools your sun ${2 * l} each dawn.`, value: (l) => `${2 * l}` },
  kinship: { icon: glyph('M12 3.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM6 20.5c0-3.6 2.7-6.5 6-6.5s6 2.9 6 6.5'), say: (l) => `Your favoured race's cards come up ${1 + (KINSHIP_BOOST[l] ?? 0)}× as often.`, value: (l) => `${1 + (KINSHIP_BOOST[l] ?? 0)}×` },
  fellowship: { icon: glyph('M8 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM16 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 19.5c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5M11 19.5c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5'), say: (l) => `A second race's cards come up ${1 + (FELLOWSHIP_BOOST[l] ?? 0)}× as often.`, value: (l) => `${1 + (FELLOWSHIP_BOOST[l] ?? 0)}×` },
  scouts: { icon: glyph('M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM15.5 15.5l5 5'), say: (l) => `${10 * l}% more chance of emblems.`, value: (l) => `+${10 * l}%` },
  plunder: { icon: glyph('M4.5 9.5h15l-1.5 10h-12ZM8 9.5a4 4 0 0 1 8 0M10 13.5h4'), say: (l) => `${2 * l} materials for every battle won.`, value: (l) => `+${2 * l}` },
  study: { icon: glyph('M3 8.5 12 4.5l9 4-9 4ZM6.5 10.5v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.5M21 8.5v5'), say: (l) => `${10 * l}% more experience.`, value: (l) => `+${10 * l}%` },
  choice: { icon: glyph('M4 6.5h6v9H4ZM14 6.5h6v9h-6ZM9 18.5h6'), say: (l) => `${l} more card${l === 1 ? '' : 's'} to choose from in every reward.`, value: (l) => `+${l}` },
  tithe: { icon: glyph('M12 2.5c4 3.2 5 8.6 0 15.5-5-6.9-4-12.3 0-15.5ZM5 20.5h14M8 17.5l-2 3M16 17.5l2 3'), say: (l) => `${2 * l} petals from every Overlord beaten.`, value: (l) => `+${2 * l}` },
  heirloom: { icon: glyph('M12 3.5 14.5 8.5l5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8Z'), say: () => 'Start each run with a Stellar emblem.', value: (l) => `${l}` },
  stock: { icon: glyph('M4 9.5h16M5 9.5V20h14V9.5M3.5 9.5 6 4.5h12l2.5 5M9.5 13.5h5'), say: (l) => `${3 * l} more cards in every space station.`, value: (l) => `+${3 * l}` },
  legacy: { icon: glyph('M12 2.5c4 3.2 5 8.6 0 15.5-5-6.9-4-12.3 0-15.5ZM7 21h10'), say: (l) => `${l} petal${l === 1 ? '' : 's'} for every battle won.`, value: (l) => `+${l}` },
  aligned: { icon: glyph('M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16ZM3 12h18M12 3v18'), say: (l) => `Every planet gives ${l} more card, ${l} more energy and ${2 * l} more cooling.`, value: (l) => `+${l} card, +${l} energy, +${2 * l} cooling` },
  vault: { icon: glyph('M4 6.5h16v13H4ZM4 10.5h16M12 13.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z'), say: (l) => `${2 * l} more cards in every Overlord's hoard.`, value: (l) => `+${2 * l}` },
  salvage: { icon: glyph('M5.5 7.5h13l-1.2 12a1.5 1.5 0 0 1-1.5 1.4H8.2a1.5 1.5 0 0 1-1.5-1.4ZM3.5 7.5h17M9 7.5V4.5h6v3M10 11.5v6M14 11.5v6'), say: (l) => `${l} more card${l === 1 ? '' : 's'} to choose from when salvaging.`, value: (l) => `+${l}` },
};

/** A hero's portrait: their card's picture, cropped round. */
function portrait(cardId: string): string {
  return `<span class="cmp-portrait">${cardArtLite(cardDef(cardId))}</span>`;
}


/** One of the Lost Races: a faded figure, half gone into the dark. */
/** How long the flagship takes to fly in as a campaign starts (seconds). */
const ARRIVAL_FLIGHT = 3.2;
/** A burst cache: when its first reward comes out, and the gap between each (ms; the CSS's --i steps match). */
const LOOT_FIRST = 450;
const LOOT_STEP = 420;
/**
 * A loot cache: a sealed supply pod of pale panelled metal, chamfered, gold-trimmed, a hatch raised on its lid, a
 * glowing core lock on its face and a seam of light where lid meets body, status lights winking beside it. (Its lid
 * and body are separate, so the lid can lift as it opens.)
 */
const LOOT_CACHE = `<svg class="loot-cache-art" viewBox="0 0 120 110" aria-hidden="true">
  <defs>
    <linearGradient id="lcBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdfcf9"/><stop offset=".55" stop-color="#ecebe6"/><stop offset="1" stop-color="#d4d2ca"/></linearGradient>
    <linearGradient id="lcSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2e0d8"/><stop offset="1" stop-color="#c9c6bc"/></linearGradient>
    <linearGradient id="lcGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d58a"/><stop offset=".5" stop-color="#c99a3e"/><stop offset="1" stop-color="#f0cf7e"/></linearGradient>
    <radialGradient id="lcGlow"><stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="#ffd772" stop-opacity="0"/></radialGradient>
    <radialGradient id="lcCore"><stop offset="0" stop-color="#fffbe9"/><stop offset=".45" stop-color="#ffe39a"/><stop offset="1" stop-color="#d9a74a"/></radialGradient>
  </defs>
  <ellipse cx="60" cy="102" rx="46" ry="6" fill="#3b3a4a" opacity=".14"/>
  <circle class="loot-cache-glow" cx="60" cy="62" r="54" fill="url(#lcGlow)"/>
  <g class="loot-cache-body">
    <path d="M12 56h96v34l-8 8H20l-8-8z" fill="url(#lcBody)" stroke="#b7b2a5" stroke-width="1.2"/>
    <path d="M100 56h8v34l-8 8z" fill="url(#lcSide)" opacity=".7"/>
    <path d="M12 90l8 8h80l8-8" fill="none" stroke="url(#lcGold)" stroke-width="2.2"/>
    <path d="M34 60v34M86 60v34" stroke="#c9c5b9" stroke-width="1.2"/>
    <path d="M18 66h12M18 71h12M90 66h12M90 71h12" stroke="#c4c0b4" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M60 64l11 6.4v12.8L60 89.6l-11-6.4V70.4z" fill="#f6f4ee" stroke="url(#lcGold)" stroke-width="2"/>
    <circle class="loot-cache-core" cx="60" cy="77" r="5.5" fill="url(#lcCore)"/>
    <circle class="loot-cache-led" cx="22" cy="84" r="1.8" fill="#7fb6e6"/>
    <circle class="loot-cache-led" cx="28" cy="84" r="1.8" fill="#7fb6e6"/>
    <circle class="loot-cache-led" cx="92" cy="84" r="1.8" fill="#e8c46a"/>
  </g>
  <path class="loot-cache-seam" d="M14 56h92" stroke="#ffe7a3" stroke-width="2.5" stroke-linecap="round"/>
  <g class="loot-cache-lid">
    <path d="M12 56l6-14h84l6 14z" fill="url(#lcBody)" stroke="#b7b2a5" stroke-width="1.2"/>
    <path d="M32 42l5-9h46l5 9z" fill="url(#lcBody)" stroke="#b7b2a5" stroke-width="1.1"/>
    <path d="M40 36.5h40" stroke="url(#lcGold)" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 56h96" stroke="url(#lcGold)" stroke-width="2.4"/>
    <path d="M24 49h8M88 49h8" stroke="#c4c0b4" stroke-width="1.6" stroke-linecap="round"/>
  </g>
</svg>`;
/** The opening shot: the longest the camera rides alongside the flagship, and how long it takes to pull back. */
const CINE_RIDE_MAX = 10;
const CINE_REVEAL = 4.2;
/** Into a battle: the pause between the flagship landing on the star (the encounter sounding) and the battle. */
const ENCOUNTER_PAUSE = 1000;

/** Each challenge's colour on the map: its ring and its route. */
const CHALLENGE_COLOUR: Record<ChallengeKind, string> = { mine: '#d0479a', lord: '#d4a02a', frost: '#5aa8e0', rift: '#6b4fc8' };

const LOST_PORTRAIT = `<span class="cmp-portrait cmp-portrait-lost"><img class="cmp-face" src="${lostFace}" alt="" draggable="false"></span>`;

/** An army's face: its general, or (one of the Lost Races) a faded figure. */
function armyFace(a: Army): string {
  return a.lost ? LOST_PORTRAIT : portrait(a.general);
}

/** The Lost Races' colour on the map: a pale, washed-out violet. */
const LOST_COLOUR = '#9a94b0';

/** Oriel the Wanderer: a hooded figure carrying a lantern, under a scatter of failing stars (painted). */
export const ORACLE_PORTRAIT = `<span class="cmp-portrait cmp-portrait-oracle"><img class="cmp-face" src="${orielFace}" alt="" draggable="false"></span>`;

/** The armoury's quartermaster, Hesk: broad and tusked, goggles up, leaning on a crate under a hanging lamp (painted). */
const QUARTERMASTER_PORTRAIT = `<span class="cmp-portrait cmp-portrait-keeper"><img class="cmp-face" src="${heskFace}" alt="" draggable="false"></span>`;

/** The recycler, Mother Tallow: an old, long-eared woman in a patched hood and scarf, a ring of salvage glowing behind her (painted). */
const RECYCLER_PORTRAIT = `<span class="cmp-portrait cmp-portrait-keeper"><img class="cmp-face" src="${tallowFace}" alt="" draggable="false"></span>`;

/** A stable 0–1 value per id, to spread animation phases so stars never pulse in step. */
function seedOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000).toFixed(3);
}
const TRACK_TINT: Record<string, string> = { weapons: '#e2a494', defences: '#a3c3df', economy: '#e0cd94', resources: '#abd2b5' };

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

type ArmoryTab = 'buy' | 'recycle' | 'fuse' | 'ship';

type Sheet =
  /** An armoury on the map, the flagship visiting: buying its stock, recycling or fusing; the card picked (or, fusing, the two). */
  | { kind: 'armory'; nodeId: string; tab: ArmoryTab; pick?: string; fuse?: string[] }
  /** A research station on the map: its one upgrade. */
  | { kind: 'research'; nodeId: string }
  | { kind: 'log' }
  | { kind: 'attack'; armyId: string; toId: string }
  | { kind: 'help' }
  | { kind: 'settings' }
  /** A rift off the route: entered only once the player says so (there is no way back). */
  | { kind: 'rift'; armyId: string; toId: string };

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


export class CampaignView {
  state: CampaignState | null = null;
  private selected: string | null = null;
  /** The army picked to march: its routes light up, and tapping one sends it. */
  private army: string | null = null;
  /** The line reached in the story scene on screen. */
  private storyLine = 0;

  /** What happened in the last battle or turn, shown once the player is free to read it. */
  private sheet: Sheet | null = null;
  /** The cache of the last battle's rewards, burst open (its rewards coming out). */
  private lootOpen = false;
  /** On the way into a pending battle (so the map, drawn meanwhile, sends it only once). */
  private enteringBattle = false;
  /** New-campaign setup choices (the hero: an index into the race's heroes). */
  private setup = { rivals: 3, race: 0, hero: 0 };
  private shopOpen = false;
  /** The starting-deck panel (cards bought into the picked race's starting deck with petals) is open. */
  /** The hero panel open, and the node picked on it; the ship's hangar open. */
  private heroOpen = false;
  private capPick: string | null = null;
  private hangarOpen = false;
  private hangarPick: string | null = null;
  /** The move under way is a warp-drive jump (the Captain's ship warps; otherwise it flies). */
  private warpMove = false;
  /** The struggle whose rival is coming alongside, and since when (its screen waits for the ship). */
  private struggleSeen: string | null = null;
  private struggleAt = 0;
  /** The lasting upgrade picked in the shop, shown in the flower's heart. */
  /**
   * Skill points placed on the tree this visit [direction: a tap assigns a point at once; undo and clear, by the back
   * button, take points back (their XP refunded), so none is spent by accident]: each a level of a skill, in order.
   */
  private upPlaced: string[] = [];
  /** The reset tapped once: a second tap pays and resets. */
  private upResetArmed = false;
  /** Kinship's or Fellowship's first point, its race being picked. */
  private affPick: { skill: string; race: number | null } | null = null;
  /** The hero panel's reset tapped once. */
  private capResetArmed = false;
  /** The skill a point was just placed on (its new ring segment draws itself in). */
  private upJust: string | null = null;
  /**
   * On a phone the tree shows one branch at a time, its petal turned straight up and its skills named [direction:
   * left/right arrows turn the Stellari on to the next branch]: the branch shown, and the flower's turn (degrees,
   * running on round the circle so it always turns the way the arrow points).
   */
  /** The research station's upgrade tapped, waiting on "take". */
  private rsPick: string | null = null;
  /** The card lifted in a card reward (chosen with a confirm), and the reward it was lifted in. */
  private cardPick: { reward: unknown; id: string } | null = null;
  private upBranch = 0;
  private upTurn = 90;
  /** A phone (or a narrow window): the tree one branch at a time. */
  /** The skill tree, one branch at a time on the turning Stellari: on every screen now [direction: use the mobile skills menu on desktop too]. */
  private upMobile(): boolean {
    return true;
  }
  /** The routes to draw as lines of light, between the stars where they stand on screen (drawRays). */
  private rays: { a: string; b: string; gone?: boolean; colour?: string }[] = [];
  /** The systems seen as the map was last drawn (the ships flying over it are drawn after it). */
  private seenNow = new Set<string>();
  /** Whether the ships are drawn in the 3D map's scene (as 3D objects), not on the page. */
  private flyOver(): boolean {
    return canNebula();
  }
  /** The systems the player can travel to this move (their suns pulse, as sonar, on the 3D map). */
  private reach = new Set<string>();
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

  constructor(private host: CampaignHost) {
    // The skill tree's tips: shown at once on a hover (or press), level with the skill and to its right (to its left
    // where the screen ends), never over it; with the map's star chime and a ring lit round it.
    if (typeof document !== 'undefined') {
      document.addEventListener('input', (e) => {
        const box = e.target as HTMLInputElement | null;
        if (!box?.matches?.('.up-search input')) return;
        this.upSearch = box.value;
        this.applyUpSearch();
      });
      // (The Stellari turned on to the next branch straight on the page, not redrawn: it turns smoothly.)
      document.addEventListener(
        'click',
        (e) => {
          const btn = (e.target as Element | null)?.closest?.('[data-act="cmp-up-turn"]') as HTMLElement | null;
          if (!btn) return;
          e.stopPropagation();
          e.preventDefault();
          this.turnUpBranch(Number(btn.dataset.arg) < 0 ? -1 : 1);
        },
        true,
      );
      document.addEventListener('pointerover', (e) => {
        const node = (e.target as Element | null)?.closest?.('.up-node') as HTMLElement | null;
        const id = node?.dataset.arg ?? null;
        if (id === this.upHover) return;
        this.upHover = id;
        if (node && e.pointerType !== 'touch') sound.starHover(Array.from(node.parentElement?.querySelectorAll('.up-node') ?? []).indexOf(node) / 7.3);
        this.showUpTip();
      });
    }
  }

  /** On a phone: the Stellari turned on to the next branch (or back), the branch's petal brought straight up. */
  private turnUpBranch(step: 1 | -1) {
    this.upBranch = (this.upBranch + step + UP_BRANCHES.length) % UP_BRANCHES.length;
    const br = UP_BRANCHES[this.upBranch];
    const want = 270 - br.dir;
    // (Turning the way the arrow points: on to the right, the flower turns anticlockwise.)
    let t = this.upTurn - step;
    while (((t - want) % 360 + 360) % 360) t -= step;
    this.upTurn = t;
    sound.hover();
    const tree = document.querySelector('.up-tree.up-mobile');
    if (!tree) return;
    (tree.querySelector('.up-wheel') as HTMLElement | null)?.style.setProperty('--turn', `${t}deg`);
    tree.querySelectorAll<HTMLElement>('[data-g]').forEach((el) => el.classList.toggle('up-off', el.dataset.g !== br.g));
    const nav = tree.querySelector('.up-spin') as HTMLElement | null;
    nav?.style.setProperty('--bc', br.colour);
    const title = nav?.querySelector('span');
    if (title) title.textContent = br.title;
  }

  /** The skill under the pointer (its tip shown). */
  private upHover: string | null = null;
  /** The skill tree's search: skills whose name or words match are lit, the rest dimmed. */
  private upSearch = '';

  /** Light the skills matching the search and dim the rest (straight on the page: typing never redraws the tree). */
  private applyUpSearch() {
    const term = this.upSearch.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('.up-sky .up-node').forEach((n) => {
      const hit = !!term && `${n.dataset.upTitle ?? ''} ${n.dataset.upText ?? ''}`.toLowerCase().includes(term);
      n.classList.toggle('up-match', hit);
      n.classList.toggle('up-dim', !!term && !hit);
    });
    document.querySelector('.up-sky')?.classList.toggle('up-searching', !!term);
  }

  /** Lay the hovered skill's tip beside it (or take it away). */
  private showUpTip() {
    const sky = document.querySelector('.up-sky') as HTMLElement | null;
    sky?.querySelector('.up-tip')?.remove();
    const node = this.upHover && sky ? (sky.querySelector(`.up-node[data-arg="${this.upHover}"]`) as HTMLElement | null) : null;
    // (On a phone every skill is named on the tree: no tip.)
    if (!sky || !node || sky.closest('.up-mobile')) return;
    const tip = document.createElement('div');
    tip.className = 'up-tip';
    tip.innerHTML = `<b>${esc(node.dataset.upTitle ?? '')}</b><span>${esc(node.dataset.upText ?? '')}</span>${node.dataset.upNext ? `<small>${esc(node.dataset.upNext)}</small>` : ''}`;
    sky.appendChild(tip);
    // (Measured on screen, laid out in the page's own pixels: the page may be zoomed.)
    const box = sky.getBoundingClientRect();
    const k = box.width / (sky.offsetWidth || box.width) || 1;
    const discBox = (node.querySelector('.up-node-disc') ?? node).getBoundingClientRect();
    const disc = { left: (discBox.left - box.left) / k, right: (discBox.right - box.left) / k, top: (discBox.top - box.top) / k, height: discBox.height / k };
    const gap = 14;
    const w = tip.offsetWidth, h = tip.offsetHeight, width = sky.offsetWidth;
    // To its right, level with it; to its left where the screen ends; up (or down) only as far as the screen needs.
    let left = disc.right + gap;
    if (left + w > width - 4) left = disc.left - gap - w;
    let top = disc.top + disc.height / 2 - h / 2;
    const bottom = Math.min(sky.offsetHeight, (window.innerHeight - box.top) / k);
    top = Math.max(4, Math.min(top, bottom - h - 8));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  // ---- Lifecycle ------------------------------------------------------------

  /** Open the new-campaign screen. */
  openSetup() {
    this.state = null;
    this.sheet = null;
    this.ships.clear();
  }

  /** "universe 2 · turn 12", for the banner on entering the campaign. */
  turnLine(): string {
    return this.state ? `galaxy ${this.state.universe} · turn ${this.state.turn}` : '';
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
    return true;
  }

  /** The battle screen hands back a battle in progress (to save) or finished. */
  saveBattle(game: GameState) {
    if (!this.state?.battle) return;
    this.state.battle.game = game;
    saveCampaign(this.state);
  }

  /** What the player found in the wreckage of a battle just won (gear for their hero, modules for their ship). */
  findsFor(game: GameState): { name: string; text: string; rarity: string; kind: 'gear' | 'module'; mark: string; art?: string; note?: string; cursed?: boolean }[] {
    const s = this.state;
    if (!s?.battle || !game.winnerId) return [];
    const b = s.battle;
    const winner = game.winnerId === game.players[0].id ? b.attacker : b.defender;
    // (A relic cache broken open is the player's, won or lost.)
    const items = winner === s.playerId ? [...battleFinds(s, game).items] : [];
    items.push(...vaultFinds(s, game));
    // (Each marked by what it does: its first boon's kind.)
    const mark = (boons: string[] | undefined) => (boons?.[0] ?? 'boon_star').replace(/^boon_/, '').replace(/_\d+$/, '');
    return [
      ...items.map((i) => ({ name: i.name, text: relicText(i), rarity: i.rarity, kind: 'gear' as const, mark: i.cursed ? 'heat' : mark(i.boons), art: relicMark(i.name, i.slot), note: relicNote(i), cursed: !!i.cursed })),

    ];
  }

  /** The cards the player may salvage from a battle just won (on the battle screen), each with where it would go. */
  /** Materials a battle won pays the player (the win, and the system's yield and stores as it is taken); 0 otherwise. */
  spoilsFor(game: GameState): number {
    const s = this.state;
    if (!s?.battle || s.battle.challenge || s.battle.attacker !== s.playerId || game.winnerId !== game.players[0].id) return 0;
    const n = nodeById(s, s.battle.nodeId);
    return CAMPAIGN.winMaterials + n.yield.materials + (n.bonus?.materials ?? 0);
  }

  /** Who the salvage comes from: your own race's cards defecting, or freed prisoners with neutral cards. */
  salvageTitle(game: GameState): string {
    const s = this.state;
    return s && salvageKind(s, game) === 'defectors' ? 'defectors · one joins you' : 'freed prisoners · one joins you';
  }

  salvageFor(game: GameState): { id: string; toDeck: boolean }[] {
    const s = this.state;
    if (!s?.battle) return [];
    return salvageOptions(s, game).map((id) => ({ id, toDeck: salvageToDeck(s, id) }));
  }

  /** `salvage`: the card picked on the battle screen, null for none (unset, auto-resolved: it is offered on the map). */
  finishBattle(game: GameState, auto = false, salvage?: string | null) {
    this.apply({ type: 'finishBattle', game, auto, ...(salvage !== undefined ? { salvage } : {}) });
  }

  get inBattle() {
    return !!this.state?.battle;
  }

  private apply(action: CampaignAction): boolean {
    if (!this.state) return false;
    const universe = this.state.universe;
    // (Time Dense Space before the move: its rings and routes, to turn from.)
    const was = this.state.rift?.kind === 'time' ? { turns: { ...(this.state.ringSpins ?? {}) }, edges: new Set(this.state.nodes.flatMap((n) => n.links.filter((m) => n.id < m).map((m) => `${n.id}|${m}`))) } : null;
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
    if (was && this.state.rift?.kind === 'time') this.animateTurn(was);
    // Through the wormhole: a new strip, framed afresh.
    if (this.state && this.state.universe !== universe && !this.state.winner) {
      this.view = null;
      this.selected = null;
      this.army = null;
      this.host.banner(`galaxy ${this.state.universe}`, 'through the wormhole');
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
  private setOut(armyId: string, toId: string): boolean {
    this.sheet = null;
    this.army = null;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Into a battle, the ship flies all the way to the star: as it lands the encounter sounds, and the battle
    // opens a second later.
    const s0 = this.state!;
    const army0 = armyById(s0, armyId);
    const move0 = armyMoves(s0, army0).find((m) => m.toId === toId);
    const battleAhead = !!move0?.battle;
    this.advance = { armyId, toId, land: battleAhead };
    // (A warp, however far: as long as nebula-objects.ts gives it. The Captain's ship flies, unless it jumps with its
    // warp drive.)
    const flies = !!campaignPlayer(s0).human && !move0?.warp;
    this.warpMove = !!move0?.warp;
    const flight = flies ? FLY_SECONDS : WARP_SECONDS;
    if (!flies) sound.warp();
    this.host.render();
    setTimeout(() => {
      const waiting = this.state?.story.queue.length ?? 0;
      const seq = this.state?.log[this.state.log.length - 1]?.seq ?? 0;
      if (battleAhead) this.encountering = true;
      if (!this.state || this.state.battle || !this.apply({ type: 'move', armyId, toId })) {
        this.advance = null;
        this.encountering = false;
        return this.host.render();
      }
      // (Through a rift the galaxy is a new one (its systems' ids used afresh): nothing to select or open.)
      if (this.state.rift?.kind !== s0.rift?.kind || !this.state.nodes.some((n) => n.id === toId)) {
        this.advance = null;
        this.encountering = false;
        this.selected = null;
        return this.host.render();
      }
      this.selected = toId;
      // What was there, found as the ship arrives.
      const found = this.state.log.find((l) => l.seq > seq && / finds /.test(l.text));
      if (found) sound.buy();
      const battle = (this.state as CampaignState).battle;
      if (!battle) {
        this.advance = null;
        this.encountering = false;
        // A station: straight in, its screen open on arrival (after a Power Struggle, if one waits).
        if (this.state.struggle || this.state.beaten || this.state.dream) this.afterStruggle = toId;
        else this.enterStation(toId);
        return this.host.render();
      }
      // A dive-bombing synth as it lands; the battle board opens a second later.
      sound.encounter();
      setTimeout(() => {
        this.advance = null;
        this.encountering = false;
        const now = this.state;
        if (!now?.battle) return this.host.render();
        this.readWaiting(waiting);
        this.host.playBattle(now.battle.game);
      }, reduce ? 0 : ENCOUNTER_PAUSE + 60);
    }, reduce ? 0 : flight * 1000 + 80);
    return true;
  }

  /** The flagship has made its move and nothing is waiting on the player: the turn is spent. */
  private moveSpent(): boolean {
    const s = this.state;
    if (!s || s.phase !== 'player' || s.battle || s.struggle || s.beaten || s.dream || s.conquest || s.loot || s.cardRewards.length || s.boon || s.winner) return false;
    const a = flagship(s, s.playerId);
    // (Moved, or with nowhere to go at all: there is no waiting, so time moves on by itself.)
    return !!a && armyMoves(s, a).length === 0;
  }

  /** Into a station's screen (its space station, or its research): none, if the system has no station. */
  private enterStation(nodeId: string) {
    const node = this.state && nodeById(this.state, nodeId);
    if (node?.station?.kind === 'armory') {
      this.keeperVisit++;
      this.sheet = { kind: 'armory', nodeId, tab: 'buy' };
    } else if (node?.station?.kind === 'research') {
      this.rsPick = null;
      this.sheet = { kind: 'research', nodeId };
    }
  }

  /** Time moves on: the collapse comes on. */
  private passTime(wait = false) {
    if (!wait && !this.moveSpent()) return;
    if (!this.apply({ type: 'endTurn', stepwise: true })) return;
    this.selected = null;
    this.army = null;
    // (A station's screen, opened as the ship arrived, stays open.)
    if (this.sheet?.kind !== 'armory' && this.sheet?.kind !== 'research') this.sheet = null;
    this.host.render();
  }

  /** Petals grabbed at a wormhole go straight into the account's lasting progress (they outlive the run). */
  private bankPetals() {
    const s = this.state;
    // (Experience too: kept the moment it is earned, so a lost run still moves the player on.)
    const xp = (s?.xp ?? 0) - (s?.xpBanked ?? 0);
    // (Stars conquered too, to the run's race: what unlocks its later heroes.)
    const stars = (s?.starsTaken ?? 0) - (s?.starsBanked ?? 0);
    // (Ship parts found too: into the hangar for good.)
    const parts = (s?.partsFound ?? []).slice(s?.partsBanked ?? 0);
    if (!s || (s.petals <= s.petalsBanked && xp <= 0 && stars <= 0 && !parts.length)) return;
    const meta = stowParts(loadMeta(), parts);
    const race = campaignPlayer(s)?.race;
    const conquests = race !== undefined && stars > 0 ? { ...meta.conquests, [race]: raceConquests(meta, race) + stars } : meta.conquests;
    saveMeta({ ...meta, petals: meta.petals + (s.petals - s.petalsBanked), xp: (meta.xp ?? 0) + Math.max(0, xp), best: Math.max(meta.best, s.universe - 1), ...(conquests ? { conquests } : {}) });
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




  /** A key on the map: nothing to do (there is no waiting: every turn is a move). */
  onKey(key: string): boolean {
    // Escape: the settings, or (open) shut them [direction: escape brings up the settings, unless that clashes]. Not
    // over anything that waits on a choice (spoils, a dream, a station's confirm, the setup screens).
    const s = this.state;
    if (key !== 'Escape' || !s) return false;
    if (this.sheet?.kind === 'settings') {
      this.sheet = null;
      return true;
    }
    if (this.sheet || s.battle || s.loot || s.cardRewards.length || s.dream || s.struggle || s.beaten || s.conquest || s.prophet || s.boon || s.emblemChoice?.length || s.winner || s.story.queue.length) return false;
    this.sheet = { kind: 'settings' };
    return true;
  }



  // ---- Clicks -----------------------------------------------------------------

  /** Returns true if the click was a campaign action. */
  onClick(act: string, arg: string, el: HTMLElement): boolean {
    const s = this.state;
    const n = () => Number(arg);
    if (act !== 'cmp-up-reset') this.upResetArmed = false;
    if (act !== 'cmp-cap-reset') this.capResetArmed = false;
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
        this.upPlaced = [];
        this.upSearch = '';
        this.upJust = null;
        break;
      case 'cmp-up-pick': {
        // A point placed: learnt at once (undo or clear takes it back, while the tree is open).
        const meta = loadMeta();
        // (Kinship's or Fellowship's first point: its race picked first, in a popover.)
        if ((arg === AFFINITY_SKILL.primary || arg === AFFINITY_SKILL.secondary) && !levelOf(meta, arg) && !buyUpgradeProblem(meta, arg)) {
          this.affPick = { skill: arg, race: null };
          sound.hover();
          break;
        }
        const why = buyUpgradeProblem(meta, arg);
        if (why) {
          this.host.toast(why);
          sound.error();
          break;
        }
        // (A battery charging up, higher with each point already in it.)
        sound.charge(levelOf(meta, arg));
        saveMeta(buyUpgrade(meta, arg));
        this.upPlaced.push(arg);
        this.upJust = arg;
        // (The tree is drawn afresh: its tip goes back beside it.)
        requestAnimationFrame(() => this.showUpTip());
        break;
      }
      case 'cmp-up-reset': {
        // Every point taken back, to place again, for a few petals (tapped twice: once to arm it, once to pay).
        const meta = loadMeta();
        const why = resetSkillsProblem(meta);
        if (why) {
          this.upResetArmed = false;
          this.host.toast(why);
          sound.error();
          break;
        }
        if (!this.upResetArmed) {
          this.upResetArmed = true;
          sound.hover();
          break;
        }
        this.upResetArmed = false;
        saveMeta(resetSkills(meta));
        this.upPlaced = [];
        this.upJust = null;
        sound.upgrade();
        break;
      }
      case 'cmp-up-undo':
      case 'cmp-up-clear': {
        // Points placed this visit taken back, the last first, their XP refunded.
        let meta = loadMeta();
        const n = act === 'cmp-up-undo' ? 1 : this.upPlaced.length;
        for (let i = 0; i < n && this.upPlaced.length; i++) meta = refundUpgrade(meta, this.upPlaced.pop()!);
        this.upJust = null;
        saveMeta(meta);
        sound.hover();
        break;
      }
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
      case 'cmp-hero':
        this.heroOpen = !this.heroOpen;
        this.capPick = null;
        break;
      case 'cmp-hangar':
        this.hangarOpen = !this.hangarOpen;
        this.hangarPick = null;
        break;
      case 'cmp-part-pick':
        this.hangarPick = this.hangarPick === arg ? null : arg;
        sound.hover();
        break;
      case 'cmp-slot': {
        // A part in hand that fits: fitted there. Nothing in hand: the part fitted there picked up, to see or remove.
        const meta = loadMeta();
        const slot = arg as PartSlot;
        if (this.hangarPick && partSlots(this.hangarPick).includes(slot)) {
          saveMeta(fitPart(meta, slot, this.hangarPick));
          sound.upgrade();
        } else if (meta.fitted?.[slot]) {
          this.hangarPick = meta.fitted[slot]!;
          sound.hover();
        }
        break;
      }
      case 'cmp-slot-clear':
        saveMeta(fitPart(loadMeta(), arg as PartSlot, null));
        sound.hover();
        break;
      case 'cmp-cap-pick':
        this.capPick = this.capPick === arg ? null : arg;
        sound.hover();
        break;
      case 'cmp-cap-buy': {
        const meta = loadMeta();
        const [kind, id] = arg.split(':');
        const buy: CaptainBuy = kind === 'stat' ? { kind: 'stat', stat: id as CaptainStat } : kind === 'slot' ? { kind: 'slot' } : kind === 'ability' ? { kind: 'ability', id } : { kind: 'lead', id };
        const why = captainBuyProblem(meta, buy);
        if (why) {
          this.host.toast(why);
          sound.error();
          break;
        }
        saveMeta(buyCaptain(meta, buy));
        sound.upgrade();
        break;
      }
      case 'cmp-aff':
        if (this.affPick) this.affPick = { ...this.affPick, race: Number(arg) };
        sound.hover();
        break;
      case 'cmp-aff-stay':
        break;
      case 'cmp-aff-cancel':
        // (Only the backdrop or the button: a tap inside the popover lands on its own buttons.)
        this.affPick = null;
        break;
      case 'cmp-aff-confirm': {
        const pop = this.affPick;
        if (!pop || pop.race === null) break;
        let meta = loadMeta();
        const why = buyUpgradeProblem(meta, pop.skill);
        if (why) {
          this.host.toast(why);
          sound.error();
          break;
        }
        meta = setAffinity(buyUpgrade(meta, pop.skill), pop.skill === AFFINITY_SKILL.primary ? 'primary' : 'secondary', pop.race);
        saveMeta(meta);
        this.upPlaced.push(pop.skill);
        this.upJust = pop.skill;
        this.affPick = null;
        sound.charge(0);
        break;
      }
      case 'cmp-cap-reset': {
        // The Captain plain again, every skill point back (tapped twice: once to arm it, once to pay).
        const meta = loadMeta();
        const why = resetCaptainProblem(meta);
        if (why) {
          this.capResetArmed = false;
          this.host.toast(why);
          sound.error();
          break;
        }
        if (!this.capResetArmed) {
          this.capResetArmed = true;
          sound.hover();
          break;
        }
        this.capResetArmed = false;
        this.capPick = null;
        saveMeta(resetCaptain(meta));
        sound.upgrade();
        break;
      }
      case 'cmp-cap-equip':
        saveMeta(equipCaptainAbility(loadMeta(), arg));
        sound.hover();
        break;
      case 'cmp-cap-lead': {
        const meta = loadMeta();
        saveMeta(setCaptainLead(meta, captainMeta(meta).lead === arg ? undefined : arg));
        sound.hover();
        break;
      }
      case 'cmp-start': {
        const meta = loadMeta();
        // (Every run is the Captain's, as petals have made them.)
        const hero = captainCard(meta);
        saveMeta({ ...meta, runs: meta.runs + 1 });
        this.state = createCampaign({ seed: (Math.random() * 2 ** 31) | 0, captain: hero, run: runBonuses(meta) });
        this.arriving = true;
        this.introFlight = true;
        // (In 3D and with motion: the opening shot, alongside the flagship as its hero speaks; see showNebula.)
        this.cine = canNebula() && !reducedMotion() ? 'start' : null;
        this.selected = null;
        this.view = null;
        // The hero's arrival comes first: whatever else the opening brought on waits its turn behind it.
        const story = this.state.story;
        this.state = { ...this.state, story: { ...story, queue: [...story.queue.filter((sc) => sc.id === 'intro'), ...story.queue.filter((sc) => sc.id !== 'intro')] } };
        if (this.state.story.queue[0]?.id !== 'intro') this.skipSilentScenes();
        saveCampaign(this.state);
        sound.objective();
        this.army = null;
        this.storyLine = 0;
        // The map is up: announce the run (the setup page before it gets none).
        this.host.render();
        if (this.cine) {
          // The hero speaks as the flagship cruises in; the map is shown once they are done (or after a while).
          voices.arrive(hero, 900);
          window.clearTimeout(this.cineTimer);
          this.cineTimer = window.setTimeout(() => this.endRide(), CINE_RIDE_MAX * 1000);
        } else {
          this.host.banner('galaxy 1', 'reach the wormhole');
          // The hero speaks as the flagship comes to rest (their words on the guide, spoken if recorded).
          voices.arrive(hero, ARRIVAL_FLIGHT * 1000);
        }
        return true;
      }
      case 'cmp-boon':
        if (!this.apply({ type: 'takeBoon', pick: arg === 'health' ? 'health' : 'cool' })) return true;
        sound.upgrade();
        break;
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
      case 'cmp-deselect': {
        // A click inside a star's rings is a click on the star.
        const hit = this.pointerAt && this.pickAt(this.pointerAt[0], this.pointerAt[1]);
        if (hit) return this.onClick('cmp-select', hit, el);
      }
        if (!this.selected && !this.army) return true;
        this.selected = null;
        this.army = null;
        break;
      case 'cmp-army': {
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
          if (scene.id === 'intro') this.endRide();
        }
        sound.hover();
        break;
      }
      case 'cmp-story-skip': {
        const intro = s?.story.queue[0]?.id === 'intro';
        this.storyLine = 0;
        this.apply({ type: 'readStory' });
        if (intro) this.endRide();
        break;
      }
      case 'cmp-stabilise':
        if (this.apply({ type: 'stabilise', nodeId: arg })) sound.shield();
        break;
      case 'cmp-heal-army':
        if (this.apply({ type: 'healArmy', armyId: arg, all: el.dataset.all === '1' })) el.dataset.all === '1' ? sound.upgrade() : sound.repair();
        break;
      case 'cmp-research':
        // Confirm: the upgrade picked is taken, and it is back to the map (nothing to take: just back).
        if (el.dataset.project) {
          if (!this.apply({ type: 'research', nodeId: arg, projectId: el.dataset.project })) break;
          sound.upgrade();
        }
        this.rsPick = null;
        this.sheet = null;
        break;
      case 'cmp-visit':
        // A station the flagship stands in: its armoury, or its research.
        this.enterStation(arg);
        sound.hover();
        break;
      case 'cmp-rs-pick':
        this.rsPick = this.rsPick === arg ? null : arg;
        sound.hover();
        break;
      case 'cmp-ar-pick': {
        // A card on the armoury's shelf tapped: lifted (or, fusing, one of the two).
        if (this.sheet?.kind !== 'armory') break;
        const sh = this.sheet;
        if (sh.tab === 'fuse') {
          const reserve = flagship(s!, s!.playerId)?.deck ?? [];
          const picks = sh.fuse ?? [];
          const have = (id: string, list: string[]) => list.filter((x) => x === id).length;
          const at = picks.lastIndexOf(arg);
          const next = at >= 0 ? picks.filter((_, k) => k !== at) : picks.length < 2 && have(arg, picks) < have(arg, reserve) ? [...picks, arg] : [...picks.slice(0, 1), arg];
          this.sheet = { ...sh, fuse: next };
        } else this.sheet = { ...sh, pick: sh.pick === arg ? undefined : arg };
        sound.hover();
        break;
      }
      case 'cmp-armory-tab':
        if (this.sheet?.kind === 'armory' && (arg === 'buy' || arg === 'recycle' || arg === 'fuse' || arg === 'ship')) {
          this.sheet = { kind: 'armory', nodeId: this.sheet.nodeId, tab: arg };
          this.keeperVisit++;
        }
        break;
      case 'cmp-ar-slot': {
        // A part in hand, fitted in this slot (one swap per station); the run's fit kept as the hangar's too.
        if (this.sheet?.kind !== 'armory' || !this.sheet.pick || !s) break;
        const nodeId = this.sheet.nodeId;
        if (this.apply({ type: 'swapPart', nodeId, slot: arg as PartSlot, partId: this.sheet.pick })) {
          saveMeta({ ...loadMeta(), fitted: { ...(this.state?.run?.ship?.fitted ?? {}) } });
          sound.upgrade();
          this.sheet = { ...this.sheet, pick: undefined };
        }
        break;
      }
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
        if (this.apply({ type: 'recycle', defId: arg, nodeId: this.sheet.nodeId })) {
          sound.shuffle();
          if (this.sheet?.kind === 'armory') this.sheet = { kind: 'armory', nodeId: this.sheet.nodeId, tab: 'recycle' };
        }
        break;
      case 'cmp-select':
        // A star in the flagship's reach sends it there (no need to pick the ship first); a known foe gets a
        // look at the matchup first.
        if (s && s.phase === 'player' && !s.battle) {
          const army = (this.army ? s.armies.find((a) => a.id === this.army) : undefined) ?? flagship(s, s.playerId);
          const move = army ? armyMoves(s, army).find((m) => m.toId === arg) : undefined;
          if (army && move) {
            // A rift: asked first [direction: "enter rift? You may not come back"].
            if (nodeById(s, arg).challenge?.kind === 'rift') {
              this.sheet = { kind: 'rift', armyId: army.id, toId: arg };
              sound.hover();
              break;
            }
            // Into the unknown (who knows what a system holds until you get there): the ship just sets out.
            if (!this.known(arg) && !nodeById(s, arg).owner) return this.setOut(army.id, arg);
            this.warpMove = !!move.warp;
            if (move.battle) this.sheet = { kind: 'attack', armyId: army.id, toId: arg };
            else if (this.apply({ type: 'move', armyId: army.id, toId: arg })) {
              sound.play();
              // (Arrived: nothing to pick; a station opens by itself.)
              this.selected = null;
              this.army = null;
            }
            break;
          }
        }
        // (No popovers on the map at all [direction: gone entirely]. Where your ship stands at a station, a tap goes
        // back into it; anywhere else a tap only focuses the system, showing its planets.)
        if (s && (nodeById(s, arg).home || flagship(s, s.playerId)?.nodeId === arg)) {
          this.selected = null;
          if (nodeById(s, arg).station) this.enterStation(arg);
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
        const [x, y] = this.sheet.fuse;
        if (this.apply({ type: 'fuseDeck', nodeId: this.sheet.nodeId, a: x, b: y })) {
          sound.upgrade();
          this.sheet = { kind: 'armory', nodeId: this.sheet.nodeId, tab: 'fuse' };
        }
        break;
      }
      case 'cmp-close':
        this.sheet = null;
        break;
      case 'cmp-attack-pick':
        this.sheet = { kind: 'attack', armyId: el.dataset.army!, toId: arg };
        break;
      case 'cmp-travel':
        return this.setOut(el.dataset.army!, arg);
      case 'cmp-rift-go': {
        if (this.sheet?.kind !== 'rift') break;
        const { armyId, toId } = this.sheet;
        return this.setOut(armyId, toId);
      }
      case 'cmp-recruit':
      case 'cmp-slay':
        if (this.apply({ type: 'struggleChoice', recruit: act === 'cmp-recruit' })) act === 'cmp-recruit' ? sound.upgrade() : sound.buy();
        break;
      case 'cmp-struggle':
        if (this.apply({ type: 'struggle' })) sound.encounter();
        break;
      case 'cmp-prophet':
        if (this.apply({ type: 'prophetPick', index: arg === '' ? null : Number(arg) })) arg === '' ? sound.hover() : sound.upgrade();
        break;
      case 'cmp-emblem':
        if (this.apply({ type: 'chooseEmblem', index: Number(arg) })) sound.upgrade();
        break;
      case 'cmp-fight': {
        if (this.sheet?.kind !== 'attack') break;
        const { armyId, toId } = this.sheet;
        return this.setOut(armyId, toId);
      }
      case 'cmp-conquer':
        if (this.apply({ type: 'conquer', choice: 'settle' })) sound.upgrade();
        break;
      case 'cmp-card-pick':
        // A card reward: a tap lifts a card (again, lets it down); confirm takes it [direction: highlight, then confirm].
        this.cardPick = this.cardPick?.id === arg && this.cardPick.reward === s?.cardRewards[0] ? null : { reward: s?.cardRewards[0], id: arg };
        sound.hover();
        break;
      case 'cmp-card':
        if (this.apply({ type: 'chooseCard', defId: arg || null })) {
          this.cardPick = null;
          if (arg) sound.buy();
        }
        break;
      case 'cmp-loot-open': {
        if (this.lootOpen || !s?.loot) break;
        this.lootOpen = true;
        const l = s.loot;
        const n = [l.materials, l.xp, l.petals].filter(Boolean).length + l.relics.length + l.cards.length;
        sound.cacheOpen();
        // (Each reward chimes as it comes out.)
        for (let i = 0; i < n; i++) window.setTimeout(() => sound.lootChime(i), LOOT_FIRST + i * LOOT_STEP);
        // The experience gauge fills once it is out (it comes after the materials, if any).
        if (l.xp) {
          const from = this.commanderXp() - l.xp;
          window.setTimeout(() => this.fillXpGauge(from, l.xp), LOOT_FIRST + 350);
        }
        break;
      }
      case 'cmp-loot-ok':
        this.lootOpen = false;
        if (this.apply({ type: 'dismissLoot' })) sound.buy();
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
    // (What the map has picked, or waits to open, must still be there: a rift's new galaxy reuses no id it can trust.)
    const st = this.state;
    if (this.selected && !st.nodes.some((n) => n.id === this.selected)) this.selected = null;
    if (this.lastFocus && !st.nodes.some((n) => n.id === this.lastFocus)) this.lastFocus = null;
    if (this.army && !st.armies.some((a) => a.id === this.army)) this.army = null;
    if (this.afterStruggle && !st.nodes.some((n) => n.id === this.afterStruggle)) this.afterStruggle = null;
    if (this.advance && !st.nodes.some((n) => n.id === this.advance!.toId)) this.advance = null;
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
    this.fleetHeld = !!overlay;
    const scene = !overlay && s.story.queue[0] && this.shownLines(s.story.queue[0]).length ? s.story.queue[0] : null;
    const me = campaignPlayer(s);
    return `
      <main class="cmp ${canNebula() ? 'cmp-3d' : ''}${s.rift ? ` cmp-rift-${s.rift.kind}` : ''}${s.dream && !s.battle && !s.struggle && !s.loot && !s.cardRewards.length && !s.conquest ? ' cmp-dreaming' : ''}${this.cine === 'ride' || this.cine === 'start' || this.cine === 'reveal' ? ' cmp-cine' : this.cine === 'done' ? ' cmp-cine-done' : ''}">
        <canvas class="cmp-nebula" data-key="cmp-nebula" aria-hidden="true"></canvas>
        ${s.rift?.kind === 'dark' ? '<div class="cmp-darkness" data-key="cmp-darkness" aria-hidden="true"></div>' : ''}
        <header class="cmp-top">
          <div class="cmp-top-left">
            ${this.renderProfile()}
            ${scene ? this.renderStory(scene) : ''}
          </div>
          <div class="cmp-purse">
            ${(() => {
              // Your flagship's sun: it starts the next battle as the last one left it.
              const f = flagship(s, s.playerId);
              const heat = f?.damage ?? 0;
              return `<span class="cmp-sunstat ${heat > 0 ? 'hot' : heat < 0 ? 'cold' : ''}"><i class="cmp-sunstat-orb"></i><b>${heat}</b></span>`;
            })()}
            <span>${MATERIALS}<b>${me.materials}</b></span>
            <span>${PETAL}<b>${s.petals}</b></span>
          </div>
          <nav class="cmp-nav">
            <button class="icon-btn" data-act="cmp-menu" aria-label="Settings">${MENU_ICON}</button>
          </nav>
        </header>
        <section class="cmp-map">${this.renderMap()}</section>
        ${this.renderRelics()}
        <canvas class="cmp-nebula-front" data-key="cmp-nebula-front" aria-hidden="true"></canvas>
        ${this.renderPop()}
        ${overlay}
      </main>`;
  }

  /** What this galaxy is like (touching every battle in it): its mark, its name, and what it does on a hover or tap. */
  /** A battle's experience, as a gauge: the commander's level, the bar where it stood before, what was earned. */
  private xpGauge(from: number, gain: number): string {
    const { level, into, need } = levelFor(from);
    return `<div class="loot-xp"><span class="loot-xp-lv">level <b>${level}</b></span><span class="loot-xp-bar"><i style="width:${((into / need) * 100).toFixed(1)}%"></i></span><span class="loot-xp-gain">+${gain} xp</span><span class="loot-xp-up" aria-hidden="true">+1 skill point</span></div>`;
  }

  /**
   * The gauge filling: the bar runs from where it stood to where it ends up, around again for every level gained
   * (the level ticking up, a chime, "+1 skill point"), the sound of it filling rising as it goes.
   */
  private fillXpGauge(from: number, gain: number) {
    const el = document.querySelector<HTMLElement>('.loot-xp');
    const bar = el?.querySelector<HTMLElement>('.loot-xp-bar > i');
    const lv = el?.querySelector<HTMLElement>('.loot-xp-lv b');
    if (!el || !bar || !lv) return;
    const start = levelFor(from), end = levelFor(from + gain);
    const ups = end.level - start.level;
    const dur = Math.min(2600, 700 + gain * 40 + ups * 450);
    sound.xpFill(dur / 1000);
    const t0 = performance.now();
    let shown = start.level;
    const step = (t: number) => {
      if (!el.isConnected) return;
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - (1 - k) * (1 - k);
      const now = levelFor(from + gain * e);
      bar.style.width = `${((now.into / now.need) * 100).toFixed(1)}%`;
      if (now.level !== shown) {
        shown = now.level;
        lv.textContent = String(shown);
        el.classList.remove('levelled');
        void el.offsetWidth;
        el.classList.add('levelled');
        sound.levelUp();
      }
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** The commander's experience in all: what is banked, and what this run has earned and not yet banked. */
  private commanderXp(): number {
    const s = this.state;
    return (loadMeta().xp ?? 0) + Math.max(0, (s?.xp ?? 0) - (s?.xpBanked ?? 0));
  }

  /** The player on the map: their face, their name, their commander level and how far into it they are. */
  private renderProfile(): string {
    const { level, into, need } = levelFor(this.commanderXp());
    const name = profile().name || 'Commander';
    return `<div class="cmp-profile" aria-label="${esc(`${name}, level ${level}`)}">
      ${playerAvatar(account()?.avatar ?? (this.state ? campaignPlayer(this.state).hero : undefined), 'cmp-profile-face')}
      <span class="cmp-profile-who"><b>${esc(name.toLowerCase())}</b><small>level ${level}</small><span class="cmp-xpbar"><i style="width:${Math.round((into / need) * 100)}%"></i></span></span>
    </div>`;
  }

  /**
   * The galaxy's name, written on the land itself beside the start of the route, running along it (turned to read
   * the right way up): what the galaxy does to every battle in it, on a tap.
   */
  private renderGalaxy(): string {
    const s = this.state!;
    const kind = s.galaxy;
    if (!kind) return '';
    const g = GALAXIES[kind];
    // (Along the outer lane's second and third systems, out past it, on the side away from the other lanes.)
    const lane = (c: number, l: number) => s.nodes.find((n) => n.col === c && n.lane === l && !n.challenge);
    const L = CAMPAIGN.lanes;
    const a = lane(1, L - 1), b = lane(2, L - 1), inner = lane(1, L - 2);
    // (Gone with the land it was written on.)
    if (!a || !b || !inner || a.collapsed || b.collapsed) return '';
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // (Out from the lanes: the normal pointing away from the next lane in.)
    let nx = -dy, ny = dx;
    if (nx * (inner.x - a.x) + ny * (inner.y - a.y) > 0) (nx = -nx), (ny = -ny);
    const off = CAMPAIGN.laneGap * 0.55;
    const x = (a.x + b.x) / 2 + nx * off, y = (a.y + b.y) / 2 + ny * off;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    return `<button class="cmp-galaxy cmp-galaxy-land" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--a:${angle.toFixed(1)}deg;--h:${(((a.h ?? 0) + (b.h ?? 0)) / 2).toFixed(0)}px" aria-label="${esc(g.name)}"><svg viewBox="0 0 24 24" aria-hidden="true">${GALAXY_GLYPH[kind]}</svg><b>${esc(g.name.toLowerCase())}</b></button>`;
  }

  /**
   * The relics found on the way, down the right of the screen: each a token with its painted badge,
   * rimmed in gold (a blessing) or red (a curse), saying what it does on a hover or tap.
   */
  private renderRelics(): string {
    const relics = campaignPlayer(this.state!).relics ?? [];
    if (!relics.length) return '';
    const tokens = relics
      .map(
        (r) =>
          `<button class="cmp-relic ${r.cursed ? 'cursed' : 'blessed'} rarity-${r.rarity}" data-key="relic-${r.id}" aria-label="${esc(r.name)}">${relicMark(r.name, r.slot)}</button>`,
      )
      .join('');
    return `<aside class="cmp-relics" aria-label="Emblems">${tokens}</aside>`;
  }

  private renderSetup(): string {
    const meta = loadMeta();
    const captain = captainCard(meta);
    // [direction: every run begins with the Captain, a nameless human with very few abilities; petals make the
    // Captain, experience buys the skill tree, found parts fit out the ship]
    const tile = (act: string, title: string, sub: string, icon: string) =>
      `<button class="cs-tab" data-act="${act}"><span class="cs-tab-icon">${icon}</span><b>${title}</b><small>${sub}</small></button>`;
    return `
      <main class="cmp-setup setup-page cs-page cs-captain-page">
        <header class="setup-top">
          <button class="btn btn-small" data-act="cmp-exit">‹ back</button>
          <h2 class="menu-heading">a dying universe</h2>
          <div class="cs-purses">
            <button class="cs-petals" data-act="cmp-shop">${PETAL}<b>${meta.petals}</b><span>petals</span></button>
            <button class="cs-petals cs-xp" data-act="cmp-hero">${XP_MARK}<b>${pointsLeft(meta)}</b><span>skill points</span></button>
          </div>
        </header>
        <div class="cs-body cs-captain-body">
          <div class="cs-captain-card" data-act="inspect" data-card="${esc(captain)}">${cardHtml(captain)}</div>
          <section class="cs-captain-text">
            <h3>the captain</h3>
            <p>No name. No race. A battered hulk and a hold of salvage.</p>
            <div class="cs-tabs">
              ${tile('cmp-hero', 'hero', 'spend skill points', XP_MARK)}
              ${tile('cmp-hangar', 'ship', 'fit parts', SHIP_ICON)}
              ${tile('cmp-shop', 'skills', 'spend petals', PETAL)}
            </div>
          </section>
        </div>
        <footer class="setup-foot"><button class="btn-primary" data-act="cmp-start">begin run</button></footer>
        ${this.shopOpen ? this.renderShop(meta) : ''}
        ${this.heroOpen ? this.renderHeroPanel(meta) : ''}
        ${this.hangarOpen ? this.renderHangar(meta) : ''}
      </main>`;
  }

  /**
   * The hero panel [direction: a full page hero panel, with an upgrade tree where players spend petals: abilities for
   * the hero in battle, and its stats, attack, stability and cost, each a separate upgrade path]: the Captain's card as
   * it stands on the left, and on the right the tree: three stat paths, the ability slots, the abilities (learnt ones
   * carried into battle or left behind with a tap), and the ways to lead. Picking a node shows it below, with its price.
   */
  private renderHeroPanel(meta: MetaState): string {
    const c = captainMeta(meta);
    const card = captainCard(meta);
    const pick = this.capPick;
    const node = (key: string, label: string, state: 'owned' | 'open' | 'locked' | 'on', inner = '', named = true) =>
      `<button class="hp-node hp-${state} ${pick === key ? 'hp-picked' : ''}" data-act="cmp-cap-pick" data-arg="${key}" aria-label="${esc(label)}"><span class="hp-disc">${inner}</span>${named ? `<small>${esc(label)}</small>` : ''}</button>`;
    // (An ability's or a lead's disc shows what it does, in the card's own marks: one mark and its amount.)
    const marks = (id: string) => {
      const [k, n] = CAP_MARKS[id] ?? ['star', ''];
      return `<span class="hp-marks">${k === 'chosen' || k === 'renew' ? mechanicMark(k) : effectMark(k)}<b>${n}</b></span>`;
    };
    const statPath = (stat: CaptainStat, name: string, step: (n: number) => string) => {
      const prices = CAPTAIN_STAT_PRICES[stat];
      const nodes = prices.map((_, i) => node(`stat:${stat}:${i}`, step(i + 1), i < c[stat] ? 'owned' : i === c[stat] ? 'open' : 'locked', `<b>${step(i + 1)}</b>`, false)).join('<i class="hp-link"></i>');
      return `<div class="hp-path"><h4>${name}</h4><div class="hp-track">${nodes}</div></div>`;
    };
    const slots = CAPTAIN_SLOT_PRICES.map((_, i) => node(`slot:${i}`, `slot ${i + 2}`, i < c.slots ? 'owned' : i === c.slots ? 'open' : 'locked', `<b>${i + 2}</b>`, false)).join('<i class="hp-link"></i>');
    const abilities = CAPTAIN_ABILITIES.map((a) => {
      const learnt = c.abilities.includes(a.id);
      return node(`ability:${a.id}`, a.ability.name.toLowerCase(), learnt ? (c.equipped.includes(a.id) ? 'on' : 'owned') : 'open', marks(a.id));
    }).join('');
    const leads = CAPTAIN_LEADS.map((l) => node(`lead:${l.id}`, l.name.toLowerCase(), c.leads.includes(l.id) ? (c.lead === l.id ? 'on' : 'owned') : 'open', marks(l.id))).join('');
    return `
      <div class="up-shop hero-panel">
        <header class="up-head up-head-tree">
          <div class="up-left">
            <button class="up-back" data-act="cmp-hero" aria-label="Back">‹ back</button>
            ${captainPointsSpent(meta) ? `<button class="up-plan-undo up-reset ${this.capResetArmed ? 'armed' : ''}" data-act="cmp-cap-reset">${this.capResetArmed ? 'confirm reset' : 'reset'}<i>${PETAL}${SKILL_RESET_PETALS}</i></button>` : ''}
          </div>
          <div class="up-title-big"><h3>the captain</h3><span class="up-xp">${XP_MARK}<b>${pointsLeft(meta)}</b><small>skill point${pointsLeft(meta) === 1 ? '' : 's'} · level ${levelFor(meta.xp ?? 0).level}</small></span></div>
          <span></span>
        </header>
        <div class="hp-body">
          <div class="hp-card" data-act="inspect" data-card="${esc(card)}">${cardHtml(card)}</div>
          <div class="hp-tree">
            <section class="hp-stats">
              ${statPath('attack', 'attack', (n) => `+${n}`)}
              ${statPath('stability', 'stability', (n) => `+${n * CAPTAIN_STABILITY_STEP}`)}
              ${statPath('cheaper', 'cost', (n) => `−${n}`)}
              <div class="hp-path"><h4>ability slots</h4><div class="hp-track">${node('slot:base', 'slot 1', 'owned', '<b>1</b>', false)}<i class="hp-link"></i>${slots}</div></div>
            </section>
            <section class="hp-set"><h4>abilities <small>${c.equipped.length} of ${captainSlots(c.slots)} carried</small></h4><div class="hp-grid">${abilities}</div></section>
            <section class="hp-set"><h4>leads <small>one at a time</small></h4><div class="hp-grid">${leads}</div></section>
          </div>
        </div>
        ${this.renderCapDetail(meta)}
      </div>`;
  }

  /** The Captain's ship as the map draws it: the parts fitted for this run (and their rarities), and the Captain's level. */
  private captainSpec(general: string): CaptainShipSpec {
    const fitted = this.state?.run?.ship?.fitted ?? {};
    const rarity: Record<string, string> = {};
    for (const [slot, id] of Object.entries(fitted)) rarity[slot] = shipPart(id)?.rarity ?? 'dwarf';
    const b = captainBuild(general);
    const level = b ? b.attack + b.stability + b.cheaper + Math.max(0, b.abilities.length - 1) + (b.lead ? 2 : 0) : 0;
    return { parts: fitted, rarity, level };
  }

  /**
   * The ship tab [direction: the player's ship upgraded with parts found in the campaign, kept in the hangar for good,
   * freely fitted; a ship schematic, the parts slotting into and filling part of it]: the schematic above, every part
   * found below, each the shape of the slot it fills. Pick a part to light where it goes; tap a slot to fit it there
   * (or, with nothing in hand, to take out what is fitted).
   */
  private renderHangar(meta: MetaState): string {
    const fitted = meta.fitted ?? {};
    const have = meta.hangar ?? [];
    const pick = this.hangarPick;
    const fits = pick ? partSlots(pick) : [];
    const on = new Set(Object.values(fitted));
    const tiles = SHIP_PARTS.filter((p) => have.includes(p.id))
      .map((p) => `<button class="hg-part rarity-${p.rarity} ${pick === p.id ? 'on' : ''} ${on.has(p.id) ? 'fitted' : ''}" data-act="cmp-part-pick" data-arg="${p.id}" aria-label="${esc(p.name)}">${partShape(p.id)}<b>${esc(p.name.toLowerCase())}</b>${on.has(p.id) ? '<small>fitted</small>' : ''}</button>`)
      .join('');
    const p = shipPart(pick ?? undefined);
    const where = p ? SHIP_SLOTS.filter((sl) => sl.kind === p.kind) : [];
    const detail = p
      ? `<footer class="hp-detail"><div><b>${esc(p.name.toLowerCase())}</b><p>${esc(p.text)}</p></div><div class="hg-acts">${where
          .map((sl) => (fitted[sl.id] === p.id ? `<button class="btn hp-buy" data-act="cmp-slot-clear" data-arg="${sl.id}">remove</button>` : `<button class="btn-primary hp-buy" data-act="cmp-slot" data-arg="${sl.id}">${where.length > 1 ? sl.name.replace(' weapon', '') : 'fit'}</button>`))
          .join('')}</div></footer>`
      : `<footer class="hp-detail hp-hint">${have.length ? 'Pick a part, then its slot.' : 'Parts are found on runs: every boss leaves one.'}</footer>`;
    return `
      <div class="up-shop hangar-panel">
        <header class="up-head up-head-tree">
          <div class="up-left"><button class="up-back" data-act="cmp-hangar" aria-label="Back">‹ back</button></div>
          <div class="up-title-big"><h3>ship</h3><span class="up-xp"><b>${have.length}</b><small>of ${SHIP_PARTS.length} parts found</small></span></div>
          <span></span>
        </header>
        <div class="hg-body">
          <div class="hg-ship">${schematic(fitted, pick, fits)}</div>
          <div class="hg-parts">${tiles || '<p class="hg-none">No parts yet.</p>'}</div>
        </div>
        ${detail}
      </div>`;
  }

  /**
   * A space station's ship tab (the Captain's runs) [direction: one ship part swapped per space station, giving real
   * meaning to the hangar]: the ship's schematic as fitted for the run, and every part in the hangar beside it; pick a
   * part, then its slot.
   */
  private renderStationShip(sh: Extract<Sheet, { kind: 'armory' }>, n: CampaignNode, repair: string, tabs: string, materials: number): string {
    const s = this.state!;
    const fitted = s.run?.ship?.fitted ?? {};
    const have = runHangar(s);
    const used = n.station?.kind === 'armory' && !!n.station.used?.part;
    const pick = !used && sh.pick && have.includes(sh.pick) ? sh.pick : null;
    const fits = pick ? partSlots(pick) : [];
    const on = new Set(Object.values(fitted));
    const tiles = SHIP_PARTS.filter((p) => have.includes(p.id))
      .map((p) => `<button class="hg-part rarity-${p.rarity} ${pick === p.id ? 'on' : ''} ${on.has(p.id) ? 'fitted' : ''}" data-act="cmp-ar-pick" data-arg="${p.id}" ${used ? 'disabled' : ''} aria-label="${esc(p.name)}">${partShape(p.id)}<b>${esc(p.name.toLowerCase())}</b>${on.has(p.id) ? '<small>fitted</small>' : ''}</button>`)
      .join('');
    const p = shipPart(pick ?? undefined);
    const action = used
      ? '<p class="ar-hint">refitted here · one part per station</p>'
      : p
        ? `<p class="ar-hint">${esc(p.text)} · tap its slot</p>`
        : `<p class="ar-hint">${have.length ? 'swap one part · pick it, then its slot' : 'no parts in your hangar yet'}</p>`;
    return `
      <div class="ar">
        <button class="ar-back" data-act="cmp-close" aria-label="Back to the map">‹ map</button>
        <div class="ar-purse">${repair}<span title="Materials">${MATERIALS}<b>${materials}</b></span></div>
        <header class="ar-head">
          <small>space station</small>
          <h3>${esc(lower(n.name))}</h3>
          <nav class="ar-tabs">${tabs}</nav>
        </header>
        <div class="ar-ship">
          <div class="hg-ship">${schematic(fitted, pick, fits, 'cmp-ar-slot')}</div>
          <div class="hg-parts">${tiles || '<p class="hg-none">No parts yet.</p>'}</div>
        </div>
        <div class="ar-act">${action}</div>
      </div>`;
  }

  /** The picked node of the hero panel: what it gives, and buying it (or carrying it, or leading with it). */
  private renderCapDetail(meta: MetaState): string {
    const key = this.capPick;
    if (!key) return `<footer class="hp-detail hp-hint">Tap a node to see it.</footer>`;
    const c = captainMeta(meta);
    const [kind, id] = key.split(':');
    const buyBtn = (buy: CaptainBuy, label = 'learn') => {
      const price = captainPrice(meta, buy);
      if (price === null) return '';
      const why = captainBuyProblem(meta, buy);
      return `<button class="btn-primary hp-buy" data-act="cmp-cap-buy" data-arg="${esc(key)}" ${why ? 'disabled' : ''}>${label} · ${XP_MARK}${price}</button>`;
    };
    let title = '', text = '', act = '';
    if (kind === 'stat') {
      const stat = id as CaptainStat;
      const level = Number(key.split(':')[2]) + 1;
      const name = { attack: 'attack', stability: 'stability', cheaper: 'cost' }[stat];
      title = `${name} ${level}`;
      text = esc(stat === 'attack' ? `+${level} attack.` : stat === 'stability' ? `+${level * CAPTAIN_STABILITY_STEP} stability.` : `Costs ${level} less to play.`);
      act = c[stat] === level - 1 ? buyBtn({ kind: 'stat', stat }, 'upgrade') : c[stat] >= level ? '<span class="hp-have">learnt</span>' : '<span class="hp-have">the one before first</span>';
    } else if (kind === 'slot') {
      const n = id === 'base' ? 1 : Number(id) + 2;
      title = `ability slot ${n}`;
      text = esc(`Carry ${n} abilities into battle.`);
      act = id === 'base' ? '<span class="hp-have">learnt</span>' : c.slots === Number(id) ? buyBtn({ kind: 'slot' }, 'unlock') : c.slots > Number(id) ? '<span class="hp-have">learnt</span>' : '<span class="hp-have">the one before first</span>';
    } else if (kind === 'ability') {
      const a = captainAbility(id)!;
      title = a.ability.name.toLowerCase();
      const pay = [a.ability.cost ? `${a.ability.cost} energy` : '', a.ability.pay?.stability ? `−${a.ability.pay.stability} stability` : '', a.ability.pay?.selfHeat ? `{heat:${a.ability.pay.selfHeat}} to your sun` : ''].filter(Boolean).join(', ');
      text = `${cardTextHtml(`${pay ? `${pay}: ` : ''}${a.ability.text}`, undefined, true)} <small>once a day</small>`;
      act = !c.abilities.includes(id)
        ? buyBtn({ kind: 'ability', id })
        : !c.equipped.includes(id) && c.equipped.length >= captainSlots(c.slots)
          ? '<span class="hp-have">slots full</span>'
          : `<button class="btn hp-buy" data-act="cmp-cap-equip" data-arg="${esc(id)}">${c.equipped.includes(id) ? 'leave behind' : 'carry'}</button>`;
    } else {
      const l = captainLead(id)!;
      title = l.name.toLowerCase();
      text = cardTextHtml(l.text, undefined, true);
      act = !c.leads.includes(id) ? buyBtn({ kind: 'lead', id }) : `<button class="btn hp-buy" data-act="cmp-cap-lead" data-arg="${esc(id)}">${c.lead === id ? 'stop leading' : 'lead'}</button>`;
    }
    return `<footer class="hp-detail"><div><b>${esc(title)}</b><p>${text}</p></div>${act}</footer>`;
  }

  /**
   * The skill tree, round the Stellari, bought with experience: three branches growing out from the flower (a
   * stronger start to the left, a tougher flagship to the right, run perks below), each tier further out than the
   * one it needs, ending in a capstone. Lines join each skill to what it needs (lit once that is bought). Picking a
   * skill shows it in the flower's heart: what it gives now and next, what it needs, and the way to buy it.
   */
  private renderShop(meta: MetaState): string {
    // [direction: each branch its own colour; its petal deepens in it the more points are poured in]
    const branches = UP_BRANCHES;
    const mobile = this.upMobile();
    const shown = branches[this.upBranch % branches.length];
    const turn = this.upTurn;
    const colourOf = (g: MetaGroup) => branches.find((b) => b.g === g)?.colour ?? '#6f9fd8';
    // Where a skill lies, from the Stellari's heart (at the foot of the sky, half of it below), in units of the
    // sky's reach R (a true circle, set in CSS): out along its branch by tier, its tier's skills fanned across it.
    // Each branch leaves the tip of one of the flower's own petals (they point every 30°, the tips 0.345 R out).
    const TIP = 0.345;
    const reach = [0, 0.46, 0.7, 0.94];
    const pos = new Map<string, [number, number] | [number, number, number, number]>();
    const place = (deg: number, k: number): [number, number] => {
      const r = (deg * Math.PI) / 180;
      return [k * Math.cos(r), k * Math.sin(r)];
    };
    // A line from one point to another (in R): CSS works out its length and angle.
    // (On a phone a point also has a part in G, the gap between skills across a row: [x, y, gx, gy].)
    type Pt = [number, number] | [number, number, number, number];
    const line = (a: Pt, b: Pt, cls: string, colour = '', g = '') =>
      `<span class="up-line ${cls}" ${g ? `data-g="${g}"` : ''} style="--x1:${a[0].toFixed(4)};--y1:${a[1].toFixed(4)};--x2:${b[0].toFixed(4)};--y2:${b[1].toFixed(4)};--gx1:${(a[2] ?? 0).toFixed(4)};--gy1:${(a[3] ?? 0).toFixed(4)};--gx2:${(b[2] ?? 0).toFixed(4)};--gy2:${(b[3] ?? 0).toFixed(4)}${colour ? `;--bc:${colour}` : ''}"></span>`;
    for (const br of branches) {
      const skills = META_UPGRADES.filter((u) => u.group === br.g);
      for (const tier of [1, 2, 3]) {
        const row = skills.filter((u) => (u.tier ?? 1) === tier);
        // (A tier's skills fanned within their own 30° of sky, clear of the next branch's.)
        // (On a phone, one branch alone and named: fanned wider, room for the names.)
        const fan = row.length > 1 ? (mobile ? (row.length > 2 ? 52 : 34) : row.length > 2 ? 18 : 13) : 0;
        // (A branch along the foot of the sky fans upward only, clear of the screen's edge.)
        const lift = mobile ? 0 : br.dir === 180 ? fan / 2 : br.dir === 360 ? -fan / 2 : 0;
        row.forEach((u, i) => pos.set(u.id, place(br.dir + lift + (row.length > 1 ? -fan / 2 + (fan * i) / (row.length - 1) : 0), reach[tier])));
      }
    }
    // On a phone, the branch shown laid out in rows straight up from its petal (a tier a row, its skills spread across,
    // each named to its right), placed where they show once the flower has turned it upright.
    // On a phone, each branch laid out in rows straight up from its petal (a tier a row, its skills spread across,
    // each named to its right), placed where they show once the flower has turned it upright: up in R (the rows' scale),
    // across in G (the gap between skills), both set in CSS from the room the screen has.
    if (mobile)
      for (const br of branches) {
        const r = ((270 - br.dir) * Math.PI) / 180;
        const c = Math.cos(r), sn = Math.sin(r);
        for (const tier of [1, 2, 3])
          META_UPGRADES.filter((u) => u.group === br.g && (u.tier ?? 1) === tier).forEach((u, i, all) => {
            const sx = i - (all.length - 1) / 2;
            const sy = -(TIP + 0.2 + 0.375 * (tier - 1));
            pos.set(u.id, [sy * sn, sy * c, sx * c, -sx * sn]);
          });
      }
    const ring = (level: number, max: number, had = level, fresh = false) => {
      const C = 2 * Math.PI * 22;
      const g = max > 1 ? 7 : 0;
      const seg = C / max - g;
      // (The segment of a point just placed draws itself in.)
      return Array.from({ length: max }, (_, i) => `<circle cx="24" cy="24" r="22" style="--seg:${seg.toFixed(2)}" class="${i < had ? 'on' : i < level ? 'plan' : ''} ${fresh && i === level - 1 ? 'fresh' : ''}" stroke-dasharray="${seg.toFixed(2)} ${C.toFixed(2)}" transform="rotate(${(-90 + (i * 360) / max + (g / C) * 180).toFixed(1)} 24 24)"/>`).join('');
    };
    const skills = META_UPGRADES.filter((u) => u.group !== 'unlock');
    // Each branch grows out of one of the Stellari's own petals (the flower drawn as everywhere else, 12 petals, one
    // every 30°): the petal pointing its way fills blue from its base as the branch's levels are learnt, and a stem
    // runs on from its tip, straight out, to the branch's first skill.
    const fills: string[] = [];
    const stems: string[] = [];
    for (const br of branches) {
      const own = skills.filter((u) => u.group === br.g);
      const first = own.find((u) => (u.tier ?? 1) === 1);
      if (!first) continue;
      const got = own.reduce((n, u) => n + Math.min(levelOf(meta, u.id), u.max), 0);
      const all = own.reduce((n, u) => n + u.max, 0);
      const f = all ? got / all : 0;
      // The petal nearest the branch: the flower's petals point every 30° (rotation 0 is straight up, 270° on screen).
      const deg = Math.round(br.dir / 30) * 30;
      const rot = (deg - 270 + 360) % 360;
      // (The petal as it shows: the outer lobe of its ellipse, beyond its two neighbours, washed in its branch's
      // colour, deeper the more of the branch is learnt: a faint tint with the first point, full with the last.)
      const ell = (t: number, fill: string) => `<ellipse cx="500" cy="170" rx="95" ry="330" transform="rotate(${t} 500 170)" fill="${fill}"/>`;
      if (f > 0)
        fills.push(`<mask id="up-lobe-${br.g}" maskUnits="userSpaceOnUse" x="70" y="-260" width="860" height="860">
          <path d="M500 170 L405 170 A95 330 0 0 1 595 170 Z" transform="rotate(${rot} 500 170)" fill="#fff"/>${ell(rot - 30, '#000')}${ell(rot + 30, '#000')}
        </mask>
        <rect x="70" y="-260" width="860" height="860" mask="url(#up-lobe-${br.g})" fill="${br.colour}" fill-opacity="${(0.06 + 0.26 * f).toFixed(3)}"/>`);
      // (A stem to each of the branch's first skills: on a phone, each straight up from the flower beneath it, clear of
      // the names beside them.)
      const firsts = own.filter((x) => (x.tier ?? 1) === 1);
      for (const u of firsts) {
        const to = pos.get(u.id)!;
        const cls = `${levelOf(meta, u.id) ? 'lit' : ''} ${mobile && br !== shown ? 'up-off' : ''}`;
        if (mobile && to.length === 4 && firsts.length > 1) {
          // (Up from the petal's tip, across beneath the row, and up to the skill: an elbow, clear of the names.)
          const r = ((270 - br.dir) * Math.PI) / 180;
          const k = TIP + 0.07;
          const tip: Pt = [-TIP * Math.sin(r), -TIP * Math.cos(r), 0, 0];
          const mid: Pt = [-k * Math.sin(r), -k * Math.cos(r), 0, 0];
          const under: Pt = [-k * Math.sin(r), -k * Math.cos(r), to[2], to[3]];
          if (u === firsts[0]) stems.push(line(tip, mid, cls, br.colour, br.g));
          stems.push(line(mid, under, cls, br.colour, br.g), line(under, to, cls, br.colour, br.g));
        } else stems.push(line(place(deg, TIP), to, cls, br.colour, br.g));
      }
    }
    // The links: the heart to each first tier, each skill to what it needs.
    const links = skills
      .flatMap((u) => {
        const needs = u.requires?.length ? u.requires : null;
        // (A first tier hangs off the flower itself: no line into its heart, where the words are.)
        if (!needs) return [];
        return needs.map(([r, n]) => {
          // (Lit once the further skill of the two is taken, not merely opened.)
          void n;
          return line(pos.get(r)!, pos.get(u.id)!, `${levelOf(meta, u.id) > 0 ? 'lit' : ''} ${mobile && u.group !== shown.g ? 'up-off' : ''}`, colourOf(u.group), u.group);
        });
      })
      .join('');
    // The skills: each a disc, its ring its levels (learnt inked, placed but not confirmed blue). What it does shows on
    // a hover (or a press); a tap places a point on it.
    const nodes = skills
      .map((u) => {
        const [x, y, gx = 0, gy = 0] = pos.get(u.id)!;
        // (Points placed this visit, which undo can still take back, marked as such.)
        const had = Math.max(0, Math.min(levelOf(meta, u.id), u.max) - this.upPlaced.filter((x) => x === u.id).length);
        const level = Math.min(levelOf(meta, u.id), u.max);
        const maxed = level >= u.max;
        const open = upgradeOpen(meta, u.id);
        const why = maxed ? null : buyUpgradeProblem(meta, u.id);
        const look = UPGRADE_LOOK[u.id];
        // (Its tip: its name, what it gives now, and what the next point would make it, nothing more [direction: title,
        // current value, next value].)
        // (Not yet learnt: what its first point gives, with no "next" line.)
        const vals = look ? look.say(Math.max(level, 1)) : u.text;
        const price = maxed ? '' : `${pointCost(u)} petals`;
        const next = [look && level > 0 && !maxed ? `Next: ${look.value(level + 1)}` : '', price].filter(Boolean).join(' · ');
        const term = this.upSearch.trim().toLowerCase();
        const hit = !!term && `${u.name} ${vals}`.toLowerCase().includes(term);
        return `<button class="up-node ${term ? (hit ? 'up-match' : 'up-dim') : ''} tier-${u.tier ?? 1} ${had ? 'owned' : ''} ${level > had ? 'planned' : ''} ${maxed ? 'maxed' : ''} ${open ? '' : 'locked'} ${!why && !maxed && level === 0 ? 'afford' : ''} ${mobile && u.group !== shown.g ? 'up-off' : ''}" data-g="${u.group}" style="--x:${x.toFixed(4)};--y:${y.toFixed(4)};--gx:${gx.toFixed(4)};--gy:${gy.toFixed(4)};--bc:${colourOf(u.group)};--lv:${(level / u.max).toFixed(3)}" data-act="cmp-up-pick" data-arg="${esc(u.id)}" data-up-title="${esc(u.name.toLowerCase())}" data-up-text="${esc(vals)}" data-up-next="${esc(next)}" aria-label="${esc(u.name)}">
          <span class="up-node-disc"><svg class="up-node-ring" viewBox="0 0 48 48" aria-hidden="true">${ring(level, u.max, had, this.upJust === u.id)}</svg><i class="up-mote" aria-hidden="true"></i></span>
          ${level > had ? `<i class="up-node-plus">+${level - had}</i>` : ''}
          ${mobile ? `<b>${esc(u.name)}<small>${esc(vals)}</small></b>` : ''}
        </button>`;
      })
      .join('');
    return `
      <div class="up-shop up-tree ${mobile ? 'up-mobile' : ''}">
        <header class="up-head up-head-tree">
          <div class="up-left">
            <button class="up-back" data-act="cmp-shop" aria-label="Back">‹ back</button>
            ${this.upPlaced.length ? '<button class="up-plan-undo" data-act="cmp-up-undo">undo</button><button class="up-plan-undo" data-act="cmp-up-clear">clear</button>' : ''}
            ${treePetalsSpent(meta) ? `<button class="up-plan-undo up-reset ${this.upResetArmed ? 'armed' : ''}" data-act="cmp-up-reset" ${resetSkillsProblem(meta) ? `data-tip="${esc(resetSkillsProblem(meta)!)}"` : ''}>${this.upResetArmed ? 'confirm reset' : 'reset'}<i>${PETAL}${SKILL_RESET_PETALS}</i></button>` : ''}
          </div>
          <div class="up-title-big">
            <h3>skills</h3>
            <span class="up-xp">${PETAL}<b>${meta.petals}</b><small>petals</small></span>
          </div>
          <label class="up-search" aria-label="Search the skills">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM15.5 15.5l5 5"/></svg>
            <input type="search" placeholder="search" value="${esc(this.upSearch)}" spellcheck="false" autocomplete="off">
          </label>
        </header>
        <div class="up-sky ${this.upSearch.trim() ? 'up-searching' : ''}">
          <div class="up-wheel" style="--turn:${mobile ? turn : 0}deg">
            <span class="up-flower">${stellariaFlower()}</span>
            <span class="up-flower-fill"><svg viewBox="70 -260 860 860" aria-hidden="true">${fills.join('')}</svg></span>
            ${stems.join('')}
            ${links}
            ${nodes}
          </div>
          ${
            mobile
              ? `<nav class="up-spin" style="--bc:${shown.colour}">
                  <button data-act="cmp-up-turn" data-arg="-1" aria-label="Previous branch">‹</button>
                  <span>${esc(shown.title)}</span>
                  <button data-act="cmp-up-turn" data-arg="1" aria-label="Next branch">›</button>
                </nav>`
              : ''
          }
        </div>
        ${this.renderAffinity(meta)}
      </div>`;
  }

  /**
   * Kinship's or Fellowship's first point [direction: as players take each one's point, a popover of race icons and
   * titles; pick one before confirming; the same race can't be in both]: the four core races, the other skill's
   * race not to be had, and confirm (which buys the point and leans to the race picked).
   */
  private renderAffinity(meta: MetaState): string {
    const pop = this.affPick;
    if (!pop) return '';
    const which = pop.skill === AFFINITY_SKILL.primary ? 'primary' : 'secondary';
    const other = meta.affinity?.[which === 'primary' ? 'secondary' : 'primary'];
    const u = META_UPGRADES.find((x) => x.id === pop.skill)!;
    const races = CORE_RACES.map((r) => {
      const taken = other === r;
      return `<button class="aff-race ${pop.race === r ? 'on' : ''}" data-act="cmp-aff" data-arg="${r}" ${taken ? 'disabled' : ''} style="--rc:${FACTION_COLOUR[`f${r + 1}`] ?? '#8a93a6'}" aria-pressed="${pop.race === r}">
        <span class="aff-emblem">${factionAvatar(`f${r + 1}`, 'aff-emblem-img')}</span><b>${lower(RACE_NAMES[r])}</b>${taken ? `<small>${which === 'primary' ? 'fellowship' : 'kinship'}</small>` : ''}
      </button>`;
    }).join('');
    const why = buyUpgradeProblem(meta, pop.skill);
    return `<div class="aff-pop-wrap" data-act="cmp-aff-cancel">
      <div class="aff-pop" data-act="cmp-aff-stay" role="dialog" aria-label="${esc(u.name)}">
        <h4>${esc(u.name.toLowerCase())}</h4>
        <p>${which === 'primary' ? 'Which race do you favour?' : 'And which race besides?'}</p>
        <div class="aff-races">${races}</div>
        <div class="aff-acts">
          <button class="btn" data-act="cmp-aff-cancel">cancel</button>
          <button class="btn-primary" data-act="cmp-aff-confirm" ${pop.race === null || why ? 'disabled' : ''}>confirm · ${PETAL}${priceOf(u, 0)}</button>
        </div>
      </div>
    </div>`;
  }


  /**
   * A race's starting deck offers: the six cards (two of each rarity) that can be bought into it with petals, kept
   * for every run as that race. A bought card is owned for good: taken out, it goes back in for nothing.
   */
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
          // (A hidden challenge's route is hidden with it.)
          if (n.challenge?.hidden || m.challenge?.hidden) return '';
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
          // (A challenge's route leads off the strip in its own colour.)
          const ch = n.challenge ?? m.challenge;
          this.rays.push({ a: n.id, b: m.id, colour: ch ? CHALLENGE_COLOUR[ch.kind] : same ? this.colourOf(n.owner!) : undefined, gone: ch?.done ? true : undefined });
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
          n.collapsing ? `<i class="cmp-badge cmp-doom">⚠</i>` : '',
        ].join('');
        return `
          <div class="${cls}" data-key="sys-${n.id}" style="left:${n.x}px;top:${n.y}px;--fc:${colour};--h:${n.h ?? 0}px">
            <div class="cmp-turf"></div>
            ${targets.has(n.id) ? `<div class="cmp-ring cmp-ring-target" data-act="cmp-select" data-arg="${n.id}"></div>` : ''}
            ${marches.has(n.id) ? `<div class="cmp-ring cmp-ring-march" data-act="cmp-select" data-arg="${n.id}"></div>` : ''}
            ${n.hazard.length ? '<div class="cmp-ring cmp-ring-hazard"></div>' : ''}
            ${n.collapsing ? '<div class="cmp-ring cmp-ring-collapse"></div>' : ''}
            ${n.home ? '<div class="cmp-ring cmp-ring-home"></div>' : ''}
            ${this.selected === n.id || leaving?.id === n.id ? this.renderOrbits(n) : ''}
            <button class="cmp-bb" data-act="cmp-select" data-arg="${n.id}" aria-label="${esc(n.name)}">
              <span class="cmp-badges">${badges}</span>
              <span class="cmp-star" style="--seed:${seedOf(n.id)}">${n.heart ? `<i class="cmp-bloom3d">${stellariaFlower()}</i>` : ''}<i class="cmp-flare"></i><i class="cmp-corona"></i><i class="cmp-core"></i></span>
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
          ${this.renderGalaxy()}
          ${nodes}
          ${this.flyOver() ? '' : this.renderFleet(seen)}
        </div>
      </div>`;
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
  /** The flagship under way: to the halfway point (or, into a battle, all the way to the star). */
  private advance: { armyId: string; toId: string; land?: boolean } | null = null;
  /** The flagship has landed at a guarded star: the encounter sounds and the battle waits a second to open. */
  private encountering = false;
  /** The words of the chip last tapped in the popover (shown under its chips). */
  /** Where the popover was last placed (in the map's box), so a redraw doesn't jump it. */
  private popPos: { x: number; y: number } | null = null;
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
          const k = this.advance?.land ? 1 : 0.5;
          x = n.x + (adv.x - n.x) * k;
          y = n.y + (adv.y - n.y) * k;
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
                <span class="cmp-orb-planet" style="--pc:${TRACK_TINT[pl.tint]};--ps:${size}px"><em>${lower(pl.name)}</em></span>
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
  private stageEl: HTMLElement | null = null;
  private nebula: Nebula | null = null;
  /** How many systems had fallen at the last look, in which universe (a column more is an earthquake). */
  private fallen: { universe: number; n: number } | null = null;

  /** Set as a campaign starts: the flagship's first appearance on the map is a fly-in. */
  private arriving = false;
  /** This session's campaign began with a fly-in: the hero's first words wait for the ship to come to rest. */
  private introFlight = false;
  /**
   * The opening shot: 'start' (to begin as the map is first drawn), 'ride' (alongside the flagship, the map's marks
   * and panels hidden), 'reveal' (pulling back to show the map), 'done' (just over: the marks and panels fade in).
   */
  private cine: 'start' | 'ride' | 'reveal' | 'done' | null = null;
  private cineTimer = 0;

  /** The hero has had their say: the camera pulls back to show the map, and the run is announced as it settles. */
  private endRide() {
    window.clearTimeout(this.cineTimer);
    if (this.cine !== 'ride' && this.cine !== 'start') return;
    this.cine = 'reveal';
    this.nebula?.reveal(CINE_REVEAL);
    sound.whoosh(0.1);
    // (Its marks and panels come back as the camera leaves the whole strip to settle on the flagship.)
    const wait = () => {
      if (this.cine !== 'reveal') return;
      if (this.nebula?.riding) {
        this.cineTimer = window.setTimeout(wait, 150);
        return;
      }
      this.cine = 'done';
      this.host.render();
      this.host.banner('galaxy 1', 'reach the wormhole');
      this.cineTimer = window.setTimeout(() => {
        this.cine = null;
      }, 1200);
    };
    this.cineTimer = window.setTimeout(wait, 500);
    this.host.render();
  }

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
    if (this.afterStruggle) window.setTimeout(() => this.openAfterStruggle(), 0);
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
      stage.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      // A star under the pointer swells and flares, with a soft chime.
      // (Anywhere inside its rings, measured from the scene: see pickAt. Without WebGL, the star's own mark.)
      stage.addEventListener('pointermove', (e) => {
        this.pointerAt = [e.clientX, e.clientY];
        if (this.nebula) this.setHovered(this.pickAt(e.clientX, e.clientY), e.pointerType);
      });
      stage.addEventListener('pointerover', (e) => { if (!this.nebula) this.hoverStar(e.target as Element, e.pointerType); });
      stage.addEventListener('pointerout', (e) => {
        if (!this.nebula && !(e.relatedTarget as Element | null)?.closest?.('.cmp-star')) this.hoverStar(null, e.pointerType);
      });
      stage.addEventListener('pointerleave', (e) => { this.pointerAt = null; this.setHovered(null, e.pointerType); });
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
    // (A column falling, in the universe already in view: the ground shakes and gives way.)
    const fallen = s.nodes.filter((n) => n.collapsed).length;
    if (this.fallen && this.fallen.universe === s.universe && fallen > this.fallen.n) sound.earthquake();
    this.fallen = { universe: s.universe, n: fallen };
    const back = root.querySelector<HTMLCanvasElement>('canvas.cmp-nebula');
    this.nebula = back ? nebulaOn(back, root.querySelector<HTMLCanvasElement>('canvas.cmp-nebula-front')) : null;
    if (!this.nebula) return;
    this.nebula.onCamera = (cam) => this.layPlane(cam);
    this.nebula.onThrust = (on) => sound.thrust(on);
    const world = (x: number, y: number): [number, number] => [(x - MAP_WIDTH / 2) * MAP_K, (y - MAP_HEIGHT / 2) * MAP_K];
    const at = new Map(s.nodes.map((n) => [n.id, world(n.x, n.y)]));
    // (How high each system stands: the land rises and falls with the route.)
    const lift = new Map(s.nodes.map((n) => [n.id, (n.h ?? 0) * MAP_K]));
    const routes = this.rays.flatMap(({ a, b }) => {
      const p = at.get(a), q = at.get(b);
      return p && q ? [[p[0], p[1], q[0], q[1]] as [number, number, number, number]] : [];
    });
    let seed = s.universe * 7919;
    for (const ch of s.nodes[0]?.name ?? '') seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    // (The land knows each system's place along the route, in columns, so it breaks away in the route's order.)
    this.nebula.show(seed, { nodes: s.nodes.map((n) => [...at.get(n.id)!, n.col ?? 0, lift.get(n.id)!] as [number, number, number, number]), routes });
    // The map's things in 3D: every system's star (ringed in its holder's colour); nothing over them (what a system
    // holds is found by going there).
    const hex = (c: string): [number, number, number] => {
      const m = /^#?([0-9a-f]{6})$/i.exec(c);
      const v = m ? parseInt(m[1], 16) : 0x999999;
      return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    };
    // (In the Dark Galaxy only what the ship can see is drawn at all; its stars are black.)
    const seen = visibleNodes(s, s.playerId);
    const dark = s.rift?.kind === 'dark';
    const objects: MapObject[] = s.nodes.filter((n) => !n.challenge?.hidden && seen.has(n.id)).map((n) => {
      const [x, z] = at.get(n.id)!;
      return {
        x,
        z,
        y: lift.get(n.id),
        heart: !!n.heart,
        ring: n.challenge ? hex(CHALLENGE_COLOUR[n.challenge.kind]) : n.owner ? hex(this.colourOf(n.owner)) : undefined,
        dim: !!(n.dimmed || n.collapsing || n.challenge?.done),
        doom: !!n.collapsing,
        dead: !!(n.collapsed || n.ruined),
        reach: this.reach.has(n.id),
        ...(dark ? { black: true } : {}),
        seed: parseFloat(seedOf(n.id)) * 10 || 0,
        id: n.id,
        // (Its station, so it can be found: a space station circling it, a research station's test tube over it.)
        ...(n.station ? { prop: n.station.kind === 'armory' ? ('station' as const) : ('lab' as const) } : {}),
        // (A rival hero waiting there: their race's ship over the star.)
        ...(n.rival ? { rival: cardDef(n.rival).race ?? 0 } : {}),
      };
    });
    this.nebula.setObjects(objects);
    // The routes, as tubes of soft light in the scene (in the holder's colour where both ends are held).
    // (Time Dense Space mid-turn: the routes breaking drawn back into their moving star, the new ones reaching out
    // from it and flaring as they link; see spinStep.)
    const anim = this.linkAnim;
    const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const partial = (from: string, to: string, t: number, glow = 0) => {
      const p = at.get(from), q = at.get(to);
      if (!p || !q || t <= 0) return [];
      const ya = lift.get(from) ?? 0, yb = lift.get(to) ?? 0;
      return [{ a: p, b: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] as [number, number], ya, yb: ya + (yb - ya) * t, ...(glow ? { glow } : {}) }];
    };
    this.nebula.setRoutes([
      ...this.rays.flatMap(({ a, b, gone, colour }) => {
        const p = at.get(a), q = at.get(b);
        if (anim && (anim.breaking.some((e) => key(e.from, e.to) === key(a, b)) || anim.making.some((e) => key(e.from, e.to) === key(a, b)))) return [];
        return p && q ? [{ a: p, b: q, gone, colour: colour ? hex(colour) : undefined, ya: lift.get(a), yb: lift.get(b) }] : [];
      }),
      ...(anim?.phase === 'retract' ? anim.breaking.flatMap((e) => partial(e.from, e.to, 1 - anim.t)) : []),
      ...(anim?.phase === 'extend' ? anim.making.flatMap((e) => partial(e.from, e.to, anim.t)) : []),
      ...(anim?.phase === 'link' ? anim.making.flatMap((e) => partial(e.from, e.to, 1, Math.sin(Math.PI * Math.min(1, anim.t * 1.2)) + 0.0001)) : []),
      ...(anim ? [] : this.timeAhead(s).flatMap(({ from, to, x, y }) => {
        const p = at.get(from);
        return p ? [{ a: p, b: world(x, y), gone: true, ya: lift.get(from), yb: lift.get(to) }] : [];
      })),
    ]);
    this.nebula.setGalaxy(s.galaxy ?? null);
    this.nebula.setDark(s.rift?.kind === 'dark');
    // (A spiral arm's galaxy turns slowly round its heart.)
    this.nebula.setSpin(s.layout === 'spiral');
    // The ships, as 3D objects: each over the star it stands at (or, setting out to attack, halfway there).
    const mine = flagship(s, s.playerId);
    const arriving = this.arriving;
    this.arriving = false;
    const ships = s.armies
      .filter((a) => this.seenNow.has(a.nodeId))
      .map((a) => {
        const [x, z] = at.get(a.nodeId)!;
        const adv = this.advance?.armyId === a.id ? at.get(this.advance.toId) : undefined;
        const k = this.advance?.land ? 1 : 0.5;
        // A new campaign: the flagship flies in from off screen, behind the strip's near end.
        // (In the opening shot it cruises in from further off, slowly, until the hero has had their say.)
        const arrive = arriving && a.id === mine?.id ? (this.cine === 'start' ? { from: [x - 3.4, z + 2.5] as [number, number], dur: CINE_RIDE_MAX + 4, cruise: true } : { from: [x - 2.6, z + 1.9] as [number, number], dur: ARRIVAL_FLIGHT }) : undefined;
        const y0 = lift.get(a.nodeId) ?? 0, y1 = adv ? lift.get(this.advance!.toId) ?? 0 : y0;
        // (The Captain's ship: built from its fitted parts, and flying from star to star unless it warps.)
        const captain = a.id === mine?.id && campaignPlayer(s).human ? this.captainSpec(a.general) : undefined;
        return { id: a.id, x: adv ? x + (adv[0] - x) * k : x, z: adv ? z + (adv[1] - z) * k : z, y: y0 + (y1 - y0) * k, colour: hex(this.colourOf(a.owner)), race: a.lost ? -1 : factionById(s, a.owner).race, arrive, ...(captain ? { captain, fly: !this.warpMove } : {}) };
      });
    // A Power Struggle: the rival's ship comes alongside the flagship [direction: when a power struggle happens, that
    // race's ship should appear on the map], drifting over from where it waited, or (an ambush) flying in from the
    // dark; it stays until the Captain has decided the rival's fate.
    const rival = s.struggle ?? s.beaten;
    if (rival && mine && this.seenNow.has(rival.nodeId)) {
      const [x, z] = at.get(rival.nodeId)!;
      const race = cardDef(rival.hero).race ?? 0;
      const y = lift.get(rival.nodeId) ?? 0;
      const from: [number, number] = s.struggle?.ambush ? [x + 1.4, z - 0.9] : [x, z];
      ships.push({ id: `rival:${rival.hero}`, x: x + 0.2, z: z - 0.15, y, colour: hex(FACTION_COLOUR[`f${race + 1}`] ?? NEUTRAL), race, arrive: { from, dur: 1.4 } });
    }
    this.nebula.setShips(ships);
    if (this.cine === 'start') {
      if (mine) this.nebula.ride(mine.id);
      this.cine = 'ride';
    }
    // The camera keeps the flagship in view, on its own.
    const own = ships.find((sh) => sh.id === mine?.id);
    if (own) this.nebula.follow(own.x, own.z);
    // Instability: the land is gone up to half a column past the last collapsed system, and cracked up to half a
    // column past the last one collapsing (counted along the route, in columns).
    const edge = (f: (n: CampaignNode) => boolean) => {
      const cols = s.nodes.filter(f).map((n) => n.col ?? 0);
      return cols.length ? Math.max(...cols) + 0.5 : -50;
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
    // Facing the camera, in the plane's own axes (its x, its y across the strip, its z up out of it).
    const [r, u, f] = [cam.right, cam.up, cam.forward];
    const bb = [r[0], r[2], r[1], 0, -u[0], -u[2], -u[1], 0, -f[0], -f[2], -f[1], 0, 0, 0, 0, 1];
    plane.style.setProperty('--bb', `matrix3d(${bb.map((v) => +v.toFixed(5)).join(',')})`);
    // A star's pixels on screen per pixel of the plane, at the distance the camera looks to: keep them that size.
    // (Measured at a distance between the camera's and its resting one, so they grow a little as it closes in.)
    const look = Math.sqrt(Math.hypot(cam.eye[0] - cam.target[0], cam.eye[1] - cam.target[1], cam.eye[2] - cam.target[2]) * (this.nebula?.homeDist ?? 5));
    const perPx = ((H / 2) * cam.proj[5] * K) / look;
    plane.style.setProperty('--ui', Math.max(0.4, Math.min(8, 1 / perPx)).toFixed(4));
    plane.style.setProperty('--tilt', '0deg');
    this.drawRays(stage);
    this.placePop();
    this.placeDarkness(stage);
  }

  /**
   * Time Dense Space turns a notch as each of the player's turns ends (see turnTime): seen here as a short sequence
   * (animateTurn), the routes it breaks drawn back in, the rings turning, the new routes reaching out and linking.
   */
  private turning = 0;
  /**
   * Time Dense Space's next notch, shown [direction: the next notch is shown, so a move can be planned]: from each star
   * the flagship can reach, dashed, the routes inward it would have once the rings have turned (kept per state).
   */
  private ahead: { state: CampaignState; routes: { from: string; to: string; x: number; y: number }[] } | null = null;
  private timeAhead(s: CampaignState): { from: string; to: string; x: number; y: number }[] {
    if (s.rift?.kind !== 'time' || s.battle) return [];
    if (this.ahead?.state === s) return this.ahead.routes;
    const ship = flagship(s, s.playerId);
    const routes = ship ? armyMoves(s, ship).flatMap((m) => timePreview(s, m.toId).map((p) => ({ from: m.toId, to: p.id, x: p.x, y: p.y }))) : [];
    this.ahead = { state: s, routes };
    return routes;
  }
  /** Time Dense Space's routes mid-turn: those breaking (drawn back in), those making (reaching out, then linking). */
  private linkAnim: { phase: 'retract' | 'turn' | 'extend' | 'link'; t: number; breaking: { from: string; to: string }[]; making: { from: string; to: string }[] } | null = null;
  /** On the way into a dream (so the map, drawn meanwhile, begins it only once). */
  private dreamStarting = false;

  /** A station the flagship arrived at with a Power Struggle waiting: its screen opens once the struggle is done. */
  private afterStruggle: string | null = null;
  private openAfterStruggle() {
    const s = this.state;
    if (!this.afterStruggle || !s || s.struggle || s.beaten || s.dream || s.battle || s.loot || s.cardRewards.length || this.sheet) return;
    const id = this.afterStruggle;
    this.afterStruggle = null;
    if (flagship(s, s.playerId)?.nodeId !== id) return;
    this.enterStation(id);
    this.host.render();
  }

  /**
   * A turn of Time Dense Space, as seen [direction: slow; before turning, the routes it breaks away from retract (with
   * a sound); it turns; the new routes extend out (a noise as they extend, another as they link), lighting up once
   * fully connected]: from the rings and routes before (`from`) to the state's own.
   */
  private animateTurn(from: { turns: Record<number, number>; edges: Set<string> }) {
    const s = this.state;
    const root = this.stageEl?.closest<HTMLElement>('.cmp');
    if (!s || s.rift?.kind !== 'time' || !root) return;
    const to = { ...(s.ringSpins ?? {}) };
    const edges = new Set(s.nodes.flatMap((n) => n.links.filter((m) => n.id < m).map((m) => `${n.id}|${m}`)));
    const turned = new Set(Object.keys(to).map(Number).filter((r) => (to[r] ?? 0) !== (from.turns[r] ?? 0)));
    if (!turned.size) return;
    const moves = (id: string) => turned.has(s.nodes.find((n) => n.id === id)?.spinRing ?? -1);
    // (Each route drawn from its end that turns.)
    const ends = (e: string) => {
      const [a, b] = e.split('|');
      return moves(a) || !moves(b) ? { from: a, to: b } : { from: b, to: a };
    };
    const breaking = [...from.edges].filter((e) => !edges.has(e) && s.nodes.some((n) => n.id === e.split('|')[0]) && s.nodes.some((n) => n.id === e.split('|')[1])).map(ends);
    const making = [...edges].filter((e) => !from.edges.has(e)).map(ends);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const T = { retract: breaking.length ? 450 : 0, turn: 2000, extend: making.length ? 520 : 0, link: making.length ? 520 : 0 };
    const total = T.retract + T.turn + T.extend + T.link;
    const run = ++this.turning;
    this.linkAnim = { phase: 'retract', t: 0, breaking, making };
    if (breaking.length) sound.linkRetract();
    const t0 = performance.now();
    let heard = 'retract';
    const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const lay = (k: number) => {
      const mid: Record<number, number> = {};
      for (const r of new Set([...Object.keys(to), ...Object.keys(from.turns)].map(Number))) mid[r] = (from.turns[r] ?? 0) + ((to[r] ?? 0) - (from.turns[r] ?? 0)) * k;
      spinGalaxy(s, false, mid);
      const stage = this.stageEl;
      for (const n of s.nodes) {
        if (!turned.has(n.spinRing ?? -1)) continue;
        const el = stage?.querySelector<HTMLElement>(`[data-key="sys-${n.id}"]`);
        if (el) {
          el.style.left = `${n.x}px`;
          el.style.top = `${n.y}px`;
        }
      }
    };
    lay(0);
    const frame = () => {
      // (Another move, or another screen: the turn is simply where it ends.)
      if (run !== this.turning || this.state !== s) {
        if (this.state === s) spinGalaxy(s);
        if (run === this.turning) this.linkAnim = null;
        return;
      }
      const at = performance.now() - t0;
      const anim = this.linkAnim!;
      if (at < T.retract) {
        anim.phase = 'retract';
        anim.t = at / T.retract;
      } else if (at < T.retract + T.turn) {
        anim.phase = 'turn';
        if (heard !== 'turn') {
          heard = 'turn';
          sound.boomTick();
        }
        lay(ease((at - T.retract) / T.turn));
      } else if (at < T.retract + T.turn + T.extend) {
        if (heard === 'turn' || heard === 'retract') lay(1);
        anim.phase = 'extend';
        anim.t = (at - T.retract - T.turn) / T.extend;
        if (heard !== 'extend') {
          heard = 'extend';
          sound.linkExtend();
        }
      } else if (at < total) {
        anim.phase = 'link';
        anim.t = (at - T.retract - T.turn - T.extend) / T.link;
        if (heard !== 'link') {
          heard = 'link';
          sound.linkConfirm();
        }
      } else {
        spinGalaxy(s);
        this.linkAnim = null;
        return void this.host.render();
      }
      this.showNebula(root);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** The Dark Galaxy's dark: lit only a little round the flagship, wherever it now stands on screen. */
  private placeDarkness(stage: HTMLElement) {
    const s = this.state;
    const veil = stage.closest('.cmp')?.querySelector<HTMLElement>('.cmp-darkness');
    const ship = s && flagship(s, s.playerId);
    if (!veil || !s || !ship || !this.nebula) return;
    const n = nodeById(s, ship.nodeId);
    const q = this.nebula.toScreen((n.x - MAP_WIDTH / 2) * MAP_K, PLANE_Y + (n.h ?? 0) * MAP_K, (n.y - MAP_HEIGHT / 2) * MAP_K);
    if (!q) return;
    veil.style.setProperty('--sx', `${q.x.toFixed(0)}px`);
    veil.style.setProperty('--sy', `${q.y.toFixed(0)}px`);
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

  private hoveredStar: string | null = null;

  private pointerAt: [number, number] | null = null;

  /** The star whose rings take in this point on the screen, if any (the map's stars as the scene draws them). */
  private pickAt(cx: number, cy: number): string | null {
    const canvas = this.nebula?.back;
    if (!canvas || !this.state) return null;
    // (Not through a popover, a sheet or the map's own controls lying over the stage.)
    const top = document.elementFromPoint(cx, cy);
    if (top && !top.closest('.cmp-stage')) return null;
    // (A star's own billboard is that star's.)
    const own = top?.closest('.cmp-bb')?.closest<HTMLElement>('.cmp-n3')?.dataset.key;
    if (own?.startsWith('sys-')) return own.slice(4);
    if (top?.closest('.cmp-pop, .cmp-orbits, button, [data-act]:not(.cmp-stage):not(.cmp-ring)')) return null;
    const box = canvas.getBoundingClientRect();
    // (The scene measures in the canvas's layout pixels; the page may be zoomed (body zoom), so the pointer's screen
    // pixels are scaled back first, or the reach falls further from each star the further it is from the corner.)
    const z = box.width / (canvas.clientWidth || box.width) || 1;
    const id = this.nebula!.pickStar((cx - box.left) / z, (cy - box.top) / z);
    return id && this.state.nodes.some((n) => n.id === id && !n.challenge?.hidden) ? id : null;
  }

  private hoverStar(target: Element | null, pointer: string) {
    const key = target?.closest('.cmp-star')?.closest<HTMLElement>('.cmp-n3')?.dataset.key;
    this.setHovered(key?.startsWith('sys-') ? key.slice(4) : null, pointer);
  }

  private setHovered(id: string | null, pointer: string) {
    if (id === this.hoveredStar) return;
    this.hoveredStar = id;
    this.nebula?.hover(id);
    // (A finger's touch is a tap, not a hover: no chime for it.)
    if (id && pointer !== 'touch') sound.starHover(parseFloat(seedOf(id)) || 0);
  }

  private onWheel(e: WheelEvent) {
    // (No zooming: the wheel does nothing on the map, but the page doesn't scroll either.)
    e.preventDefault();
  }

  /** What is picked on the map (a system or an army), in a popover beside it. */
  private renderPop(): string {
    // [direction: map popovers gone entirely, for systems and ships alike]
    this.popPos = null;
    return '';
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
    const shipNode = ship && s ? s.nodes.find((n) => n.x === ship.x && n.y === ship.y) : undefined;
    const at = node ? { x: node.x, y: node.y, h: node.h ?? 0, lift: 24 } : ship ? { x: ship.x, y: ship.y, h: shipNode?.h ?? 0, lift: 6 } : null;
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
    const proj = (x: number, y: number, lift: number, h = 0) => {
      if (neb?.camera && back) {
        // In the nebula's space: the point on its plane (at its height), through the camera, onto the canvas, into the box.
        const q = neb.toScreen((x - MAP_WIDTH / 2) * MAP_K, PLANE_Y + h * MAP_K, (y - MAP_HEIGHT / 2) * MAP_K) ?? { x: -999, y: -999 };
        const cr = back.getBoundingClientRect();
        const cz = cr.width / (back.clientWidth || cr.width) || 1;
        return { x: (q.x * cz + cr.left - b.left) / zx, y: (q.y * cz + cr.top - b.top) / zy - lift };
      }
      const q = this.project(lw, lh, x, y, lift);
      // The stage's layout pixels, drawn on screen, then back into the box's layout pixels.
      return { x: ((q.x * st.width) / lw + st.left - b.left) / zx, y: ((q.y * st.height) / lh + st.top - b.top) / zy };
    };
    const p = proj(at.x, at.y, at.lift, at.h);
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


  // ---- Overlays -------------------------------------------------------------------

  private renderOverlay(): string {
    const s = this.state!;
    if (s.winner) {
      // The run is over (the flagship is lost): said plainly, the petals it banked, and the way out to the campaign's
      // menu (its upgrades, and a new run).
      return `<div class="overlay overlay-soft run-over">
        <h2>you are dead</h2>
        <p>The others will follow, soon enough…</p>
        <span class="run-over-petals">+ ${s.petals} ${PETAL}</span>
        <button class="btn-primary" data-act="cmp-new-run">exit</button>
      </div>`;
    }
    // A Frost Line held: its reward, chosen.
    if (s.boon && !s.battle) {
      return this.modal(
        `${lower(s.boon.source)} held`,
        settingsPanel(choiceRow('cmp-boon', '+5 max health', 'data-arg="health"', true, 'for good') + choiceRow('cmp-boon', 'cool your sun by 6', 'data-arg="cool"', true, 'now')),
        false,
      );
    }
    // A battle pending (a run picked up mid-battle): straight into it, no stop on the way.
    if (s.battle && !this.encountering) {
      if (!this.enteringBattle) {
        this.enteringBattle = true;
        window.setTimeout(() => {
          this.enteringBattle = false;
          const now = this.state;
          if (!now?.battle) return;
          this.readWaiting(now.story.queue.length);
          this.host.playBattle(now.battle.game);
        }, 0);
      }
      return '';
    }
    if (s.conquest) {
      const n = nodeById(s, s.conquest.nodeId);
      return this.modal(`${lower(n.name)} has fallen`, settingsPanel(choiceRow('cmp-conquer', `take it · ${MATERIALS}+${n.yield.materials}`, '', true)), false, '', 'cmp-modal-narrow');
    }
    // What the last battle brought: a sealed cache, once you are back on the map, before any card to choose. Tapped,
    // it bursts open and its rewards come out one at a time, each lit gold; then they are taken.
    if (s.loot) {
      const l = s.loot;
      // (Every reward the same size, on a gold glow: materials and petals their mark large with the number under it;
      // an emblem its badge, its name, what it does; a card itself.)
      const items = [
        l.materials ? `<div class="loot-tile loot-res" title="Materials"><span class="loot-glow">${MATERIALS}</span><b>+${l.materials}</b></div>` : '',
        l.petals ? `<div class="loot-tile loot-res" title="Stellari petals"><span class="loot-glow">${PETAL}</span><b>+${l.petals}</b></div>` : '',
        ...l.relics.map((r) => `<div class="loot-tile loot-emblem"><span class="loot-glow"><span class="cmp-relic ${r.cursed ? 'cursed' : ''}">${relicMark(r.name, r.slot)}</span></span><b>${esc(r.name.toLowerCase())}</b><small>${esc(relicText(r))}</small></div>`),
        ...l.cards.map((id) => `<div class="loot-tile loot-card"><span class="loot-glow">${cardHtml(id)}</span></div>`),
        ...(l.parts ?? []).map((id) => `<div class="loot-tile loot-part" title="Ship part"><span class="loot-glow">${partShape(id)}</span><b>${esc(shipPart(id)?.name.toLowerCase() ?? '')}</b></div>`),
      ].filter(Boolean);
      // (The experience first, top middle; the rewards after it, one at a time.)
      const first = l.xp ? 1 : 0;
      // (In one row, or past three in two: the first a little fuller; the tiles sized so both rows fit the screen.)
      const split = items.length > 3 ? Math.ceil(items.length / 2) : items.length;
      const rows = [items.slice(0, split), items.slice(split)].filter((r) => r.length);
      const cols = Math.max(...rows.map((r) => r.length));
      if (!this.lootOpen)
        return `<div class="overlay overlay-soft loot-overlay"><button class="loot-cache" data-act="cmp-loot-open" aria-label="Open the cache">${LOOT_CACHE}<span class="loot-cache-tap">${l.won ? 'victory · tap to open' : 'what was saved · tap to open'}</span></button></div>`;
      return `<div class="overlay overlay-soft loot-overlay loot-opened">
        <div class="loot-burst" aria-hidden="true"></div>
        ${l.xp ? `<div class="loot-item loot-top" style="--i:0">${this.xpGauge(this.commanderXp() - l.xp, l.xp)}</div>` : ''}
        <div class="loot-items" style="--cols:${cols};--rows:${rows.length}">${rows
          .map((row, r) => `<div class="loot-row" style="--n:${row.length}">${row
            .map((h, j) => {
              // (Each a little off true, like treasure spilled out: tilted alternately, the row bowed into a gentle arc.)
              const at = j - (row.length - 1) / 2;
              const i = r * rows[0].length + j;
              return `<div class="loot-item" style="--i:${i + first};--r:${((i % 2 ? 1 : -1) * (2 + (i % 3))).toFixed(0)}deg;--y:${(at * at * 7).toFixed(0)}px">${h}</div>`;
            })
            .join('')}</div>`)
          .join('')}</div>
        <button class="btn-primary loot-take" style="--i:${items.length + first}" data-act="cmp-loot-ok">take it</button>
      </div>`;
    }
    // A Power Struggle: a hero of your own race, come for your command while your sun runs overheated.
    // (A card found in the same system is chosen first: the struggle waits for it.)
    if (s.struggle && !s.battle && !s.cardRewards.length) {
      // (A moment first, for the rival's ship to come alongside on the map.)
      if (this.struggleSeen !== s.struggle.hero) {
        this.struggleSeen = s.struggle.hero;
        this.struggleAt = performance.now();
        window.setTimeout(() => this.host.render(), STRUGGLE_ARRIVE_MS + 50);
      }
      if (performance.now() - this.struggleAt < STRUGGLE_ARRIVE_MS && canNebula() && !reducedMotion()) return '';
      const hero = s.struggle.hero;
      const human = !!campaignPlayer(s).human;
      return `<div class="overlay overlay-soft struggle">
        <div class="struggle-face">${portrait(hero)}</div>
        <small class="struggle-kicker">power struggle</small>
        <h2>${lower(cardDef(hero).name)}</h2>
        <p class="struggle-line">“${esc(struggleLine(hero, human))}”</p>
        <button class="btn-primary" data-act="cmp-struggle">${human ? 'fight for your ship' : 'fight for your command'}</button>
      </div>`;
    }
    // A rival beaten (the Captain's runs): recruit them, or slay them for their hoard.
    if (s.beaten && !s.battle && !s.cardRewards.length) {
      const hero = s.beaten.hero;
      return `<div class="overlay overlay-soft struggle struggle-beaten">
        <div class="struggle-face">${portrait(hero)}</div>
        <small class="struggle-kicker">beaten</small>
        <h2>${lower(cardDef(hero).name)}</h2>
        <div class="struggle-choice">
          <button class="btn-primary" data-act="cmp-recruit">recruit<small>joins your deck</small></button>
          <button class="btn" data-act="cmp-slay">slay<small>${MATERIALS}${SLAY_LOOT.materials + SLAY_LOOT.perGalaxy * (s.universe - 1)} · ${PETAL}${SLAY_LOOT.petals} · ${SLAY_LOOT.cards} rare cards</small></button>
        </div>
      </div>`;
    }
    // A Dream of the Lost: the screen drifts, wavering, into dark, with a line; then the dream begins by itself.
    // (Only once the battle's spoils are seen to: its loot opened and its card chosen, a conquest decided.)
    const spoilsWaiting = (x: CampaignState) => !!x.loot || x.cardRewards.length > 0 || !!x.conquest;
    if (s.dream && !s.battle && !s.struggle && !s.beaten && !spoilsWaiting(s)) {
      if (!this.dreamStarting) {
        this.dreamStarting = true;
        window.setTimeout(() => {
          this.dreamStarting = false;
          if (this.state?.dream && !this.state.struggle && !spoilsWaiting(this.state) && this.apply({ type: 'dream' })) sound.encounter();
          this.host.render();
        }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 900 : 4200);
      }
      return `<div class="overlay dream-fade" aria-live="polite">
        <svg width="0" height="0" aria-hidden="true" style="position:absolute"><filter id="dream-wave"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.02" numOctaves="2" seed="3"><animate attributeName="baseFrequency" dur="6s" values="0.006 0.02;0.01 0.035;0.006 0.02" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="0"><animate attributeName="scale" dur="4s" values="0;60" fill="freeze"/></feDisplacementMap></filter></svg>
        <p class="dream-line">you drift into a sorrowful slumber</p>
      </div>`;
    }
    // A Dark Prophet's offer: three of your cards, each shown as its mark would make it; one taken, for good.
    if (s.prophet) {
      const cards = s.prophet.offers.map((o, i) => `<button class="cmp-pick" data-act="cmp-prophet" data-arg="${i}">${cardHtml(markedId(o.mark, o.card))}<small class="cmp-mark">${esc(NYX_MARKS[o.mark].name.toLowerCase())}</small></button>`).join('');
      return this.modal(
        'the dark prophet',
        `${renderedArt('dark_prophet') ? `<div class="prophet-face" style="background-image:url(${renderedArt('dark_prophet')})" aria-hidden="true"></div>` : ''}<div class="cmp-cards">${cards}</div>
         <div class="center-row"><button class="btn" data-act="cmp-prophet" data-arg="">turn away</button></div>`,
      );
    }
    // Aster's gift: one of the Seren's three emblems.
    if (s.emblemChoice?.length) {
      const tiles = s.emblemChoice.map((r, i) => `<button class="loot-tile loot-emblem cmp-emblem-pick" data-act="cmp-emblem" data-arg="${i}"><span class="loot-glow"><span class="cmp-relic">${relicMark(r.name, r.slot)}</span></span><b>${esc(r.name.toLowerCase())}</b><small>${esc(relicText(r))}</small></button>`).join('');
      return this.modal('aster’s gift · choose an emblem', `<div class="cmp-emblems">${tiles}</div>`);
    }
    const reward = s.cardRewards[0];
    if (reward) {
      const picked = this.cardPick?.reward === reward && reward.options.includes(this.cardPick.id) ? this.cardPick.id : null;
      const cards = reward.options.map((id) => `<button class="cmp-pick ${picked === id ? 'cmp-pick-on' : ''}" data-act="cmp-card-pick" data-arg="${id}" aria-pressed="${picked === id}">${cardHtml(id)}</button>`).join('');
      return this.modal(
        `★ ${lower(reward.source)} · choose a new card`,
        `<div class="cmp-cards">${cards}</div>
         <div class="center-row"><button class="btn" data-act="cmp-card" data-arg="">skip</button><button class="btn-primary" data-act="cmp-card" data-arg="${picked ?? ''}" ${picked ? '' : 'disabled'}>confirm</button></div>`,
      );
    }
    const sh = this.sheet;
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
          'settings',
          settingsPanel(
            `${this.host.settingsButtons()}
            ${setLink('cmp-sheet', 'how the loop works', 'data-arg="help"')}
            ${setLink('cmp-exit', 'main menu')}`,
            '<p class="set-note">Your run is saved; continue it from the main menu.</p>',
          ),
          true,
        );
      case 'help':
        return this.modal(
          'how the campaign works',
          `<div class="cmp-legend">
            <div>${MATERIALS}<span><b>Materials</b> pay for everything. Earned: every system you take, finds and battles. Spent: cards at space stations, fusing cards and repairs.</span></div>
          </div>
          <ul class="rules">
            <li><b>The loop:</b> each galaxy is a strip of systems, ${CAMPAIGN.lanes} lanes wide, that you cross from the near end to the wormhole past the far end. Beat the wormhole's guardian, a Lost Overlord, to go through, into a harder galaxy (the universe is dying, galaxy by galaxy: each one you reach is younger, and burns hotter). An Overlord fights with its body already in play (limbs, gear, retainers) and takes one great action a day, its best for the board as it stands; the next is always shown, and changes as the board does. The run goes on until your flagship is lost.</li>
            <li><b>The collapse:</b> regional stability lasts ${CAMPAIGN.stabilityTurns} moves in the first universe, ${CAMPAIGN.stabilityStep} fewer in each one after (never under ${CAMPAIGN.stabilityMin}). Then the strip gives way from the near end, a whole column with every move, each marked (⚠) a move before. Whatever stands there is lost, your flagship too.</li>
            <li><b>Every move is a turn.</b> Your flagship flies one route at a time, any way you like, back on itself too. Into a system you hold it simply moves; into a <b>find</b> (a derelict, a depot, an archive) it takes what is there with no fight; into any other, it fights. After each move the collapse comes on. Changing the deck or repairing costs no move. If your flagship has nowhere to go, time moves on by itself.</li>
            <li><b>Win</b> a system and it is yours: it pays its materials once, your flagship moves in, and it counts for petals. Nothing pays by the move. Some worlds hold extra materials, taken with the system.</li>
            <li><b>Stellari petals</b> are grabbed at every wormhole: a few for getting there, more for every share of the strip you conquered. They are banked at once and outlive the run. Spend them between runs on a stronger start, a tougher flagship, run perks, and new races. A race's later heroes are earned by conquering stars as it.</li>
            <li><b>Its deck</b> starts with ${CAMPAIGN.armySize} cards: your hero and your race's own, with a few neutral cards. It grows with every card you salvage or put in, and never drops below ${CAMPAIGN.armySize}.</li>
            <li><b>Battles</b> are the card game, by its rules. Your hero is in your deck, played like any card. Each universe's <b>galaxy</b> (a black hole, a pulsar, a meteor shower, a nebula or dark matter) bends every battle fought in it.</li>
            <li>${ARMORY_ICON} <b>Space stations</b> sell ${CAMPAIGN.armoryStock} cards each, every one only once. ${RESEARCH_ICON} <b>Research stations</b> offer ${CAMPAIGN.researchOptions} upgrades each: pick one, free. Both are better deep in the strip. Bring your flagship to one to use it.</li>
            <li>A system with no flagship in it fights as a <b>garrison</b>: more cards, thicker walls and a bigger sun the further along the strip, and the further along the run.</li>
            <li><b>Stars</b> differ. ${(['red', 'white', 'brown', 'neutron'] as const).map((k) => `<b>${STAR_TYPES[k].name}:</b> ${esc(STAR_TYPES[k].boon)} ${esc(STAR_TYPES[k].cost)}`).join(' ')}</li>
            <li>Your sun carries its heat on as <b>damage</b> (it starts battles hotter). Repair it with ${MATERIALS} materials at a space station.</li>
          </ul>`,
          true,
        );
      case 'rift': {
        const to = nodeById(s, sh.toId);
        const kind = to.challenge?.rift;
        return this.modal(
          'enter rift?',
          settingsPanel(choiceRow('cmp-rift-go', 'enter', '', true, `${kind ? `${esc(RIFTS[kind].name)} · ` : ''}You may not come back.`) + choiceRow('cmp-close', 'stay')),
          false,
          '',
          'cmp-modal-narrow',
        );
      }
      case 'attack': {
        const to = nodeById(s, sh.toId);
        return this.modal(
          `attack ${lower(to.name)}?`,
          `${this.matchup(sh.armyId, to)}${settingsPanel(choiceRow('cmp-fight', 'fight', '', true) + choiceRow('cmp-close', 'back'))}`,
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
      o ? `<small class="cmp-vs-sun">${Math.max(0, o.heat)}<i>/</i>${BALANCE.supernovaAt + (o.mods.maxHealthDelta ?? 0)}</small>` : '';
    const side = (army: Army | null, n: CampaignNode, o?: { heat: number; mods: { maxHealthDelta?: number } }) => {
      const name = army ? armyLeader(army) : n.owner ? `${factionById(s, n.owner).name} guard` : n.heart ? overlordById(s.overlord ?? 'colossus').name : `${n.name} sentinels`;
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
      if (m.waveCardHeat) tips.push(`<li class="${tone(false)}">Heat waves from the Stellari strike ${whose.toLowerCase()} cards for ${m.waveCardHeat} too.</li>`);
      if (m.extraDraw) tips.push(`<li class="${tone(m.extraDraw > 0)}">${who} draw ${Math.abs(m.extraDraw)} ${m.extraDraw > 0 ? 'more' : 'fewer'} every day.</li>`);
      if (m.openingHand) tips.push(`<li class="${tone(m.openingHand > 0)}">${who} start with ${Math.abs(m.openingHand)} ${m.openingHand > 0 ? 'more' : 'fewer'} card${Math.abs(m.openingHand) === 1 ? '' : 's'} in hand.</li>`);
    }
    const g = garrisonBonus(to);
    const held = g.tableau.length + (g.lightspeed ? 1 : 0);
    if (held) tips.push(`<li class="${defending ? 'good' : 'bad'}">${held} of ${defending ? 'your' : 'their'} cards start in play.</li>`);
    if (defender?.lost) tips.push(`<li class="good">Win to take their emblems: ${MATERIALS} ${CAMPAIGN.lostRelicMaterials} and a card.</li>`);
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
      <aside class="cmp-guide ${sp.kind === 'oracle' ? 'cmp-guide-oracle' : ''} ${scene.id === 'intro' && this.introFlight ? 'cmp-guide-arrive' : ''}" data-key="guide:${esc(scene.id)}:${i}" style="--sc:${who.colour}">
        <div class="cmp-guide-face">${who.face}</div>
        <div class="cmp-guide-body">
          <small class="cmp-guide-who">${esc(who.name.toLowerCase())}</small>
          <p class="cmp-guide-text">${esc(line.text)}</p>
        </div>
        <button class="cmp-guide-next" data-act="cmp-story-skip" aria-label="Dismiss">×</button>
      </aside>`;
  }



  /** An armoury's stock (empty if the node has none). */
  private stock(nodeId: string): string[] {
    const st = nodeById(this.state!, nodeId).station;
    return st?.kind === 'armory' ? st.cards : [];
  }

  /**
   * An armoury on the map [direction: a drastic redesign; it looked like any generic website, not the slick UI round
   * it]: the page's own paper, nothing boxed. Its name small at the top, and under it buy · recycle · fuse as words.
   * Its cards laid out across the middle, each its price beneath it, unboxed; a card tapped lifts and glows, and its
   * one action waits beneath the row (tapped again, it is looked over). The keeper and their line at the foot;
   * materials, and the dock's repair for your sun, top right.
   */
  private renderArmory(sh: Extract<Sheet, { kind: 'armory' }>): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const n = nodeById(s, sh.nodeId);
    const tab = sh.tab;
    const count = (list: string[], id: string) => list.filter((x) => x === id).length;
    const stock = this.stock(sh.nodeId);
    const ship = flagship(s, s.playerId);
    // (Recycling and fusing take from the flagship's deck [direction: there is no reserve now]; its leader's card stays.)
    const deck = ship?.deck ?? [];
    const list = tab === 'buy' ? stock : [...new Set(deck)].filter((id) => id !== ship?.general || deck.filter((x) => x === id).length > 1);
    const used = n.station?.kind === 'armory' ? n.station.used ?? {} : {};
    const picks = sh.fuse ?? [];
    const repair = ship && ship.damage > 0 ? `<span class="ar-repair"><small>sun ✸${ship.damage}</small>${this.repairButtons('cmp-heal-army', ship.id, ship.damage, CAMPAIGN.armyHealCost, '')}</span>` : '';
    const tabs = (me.human ? (['buy', 'recycle', 'fuse', 'ship'] as const) : (['buy', 'recycle', 'fuse'] as const)).map((t) => `<button class="${t === tab ? 'on' : ''}" data-act="cmp-armory-tab" data-arg="${t}">${t}</button>`).join('');
    // The cards, each with what it costs, fetches or how many are kept.
    const cards = list
      .map((id, i) => {
        const picked = tab === 'fuse' ? picks.includes(id) : sh.pick === id;
        const tag =
          tab === 'buy'
            ? `<span class="ar-tag ${me.materials >= armoryPrice(id) ? '' : 'short'}">${MATERIALS}<b>${armoryPrice(id)}</b></span>`
            : tab === 'recycle'
              ? `<span class="ar-tag">×${count(deck, id)} <i>·</i> +${MATERIALS}<b>${recycleValue(id)}</b></span>`
              : `<span class="ar-tag">×${count(deck, id)}</span>`;
        // (Tapped once it lifts; tapped again, it is looked over.)
        const act = picked && tab !== 'fuse' ? `data-act="inspect" data-card="${esc(id)}"` : `data-act="cmp-ar-pick" data-arg="${esc(id)}"`;
        return `<button class="ar-card ${picked ? 'picked' : ''}" ${act} style="--i:${i};--r:${(((i * 37) % 7) - 3) * 0.5}deg">${cardHtml(id)}${tag}</button>`;
      })
      .join('');
    if (tab === 'ship') return this.renderStationShip(sh, n, repair, tabs, me.materials);
    const empty = tab === 'buy' ? 'sold out' : 'nothing in your deck';
    // The one action, beneath the row (once each here: a buy, a recycle, a fusion).
    let action = '';
    if (used[tab]) action = `<p class="ar-hint">${tab === 'buy' ? 'bought here' : tab === 'recycle' ? 'recycled here' : 'fused here'} · one per station</p>`;
    else if (tab === 'fuse') {
      if (picks.length < 2) action = `<p class="ar-hint">choose two to fuse into one</p>`;
      else {
        const [a, b] = picks;
        const problem = fuseProblem(s, me, n, a, b);
        const cost = fusionCost(a, b);
        action = problem && !problem.startsWith('Not enough')
          ? `<p class="ar-hint warn">${esc(problem.toLowerCase())}</p>`
          : `<div class="ar-fused">${cardHtml(fusedId(a, b))}</div><button class="btn-primary ar-go" data-act="cmp-fuse" ${problem ? 'disabled' : ''}>fuse · ${MATERIALS}${cost}</button><p class="ar-hint">for good</p>`;
      }
    } else {
      const id = sh.pick && list.includes(sh.pick) ? sh.pick : null;
      if (!id) action = `<p class="ar-hint">${tab === 'buy' ? 'one card per station' : 'break a card down for materials'}</p>`;
      else if (tab === 'buy') {
        const why = buyProblem(s, me, n, stock.indexOf(id));
        action = `<button class="btn-primary ar-go" data-act="cmp-buy" data-arg="${esc(id)}" ${why ? `disabled title="${esc(why)}"` : ''}>buy · ${MATERIALS}${armoryPrice(id)}</button>`;
      } else {
        const why = recycleProblem(s, me, n, id);
        action = why
          ? `<p class="ar-hint warn">${esc(why.toLowerCase())}</p>`
          : `<button class="btn-primary ar-go" data-act="cmp-recycle" data-arg="${esc(id)}">recycle · +${MATERIALS}${recycleValue(id)}</button>`;
      }
    }
    const keeper = tab === 'buy' ? QUARTERMASTER : RECYCLER;
    const lines = tab === 'buy' ? QUARTERMASTER_LINES : RECYCLER_LINES;
    const line = lines[(s.turn * 3 + this.keeperVisit) % lines.length];
    return `
      <div class="ar">
        <button class="ar-back" data-act="cmp-close" aria-label="Back to the map">‹ map</button>
        <div class="ar-purse">${repair}<span title="Materials">${MATERIALS}<b>${me.materials}</b></span></div>
        <header class="ar-head">
          <small>space station</small>
          <h3>${esc(lower(n.name))}</h3>
          <nav class="ar-tabs">${tabs}</nav>
        </header>
        <div class="ar-shelf" style="--n:${list.length}">${cards || `<p class="ar-empty">${empty}</p>`}</div>
        <div class="ar-act">${action}</div>
        <footer class="ar-keeper">${tab === 'buy' ? QUARTERMASTER_PORTRAIT : RECYCLER_PORTRAIT}<div><b>${esc(keeper.name.toLowerCase())}</b><q>${esc(line)}</q></div></footer>
      </div>`;
  }

  /**
   * A research station on the map [direction: a drastic redesign, to match the slick UI round it]: on the page's own
   * paper, nothing boxed. Its name small at the top; its upgrades across the middle, each a glowing mark, its name
   * and what it does beneath; one tapped lifts and glows, and "take" waits beneath them. What you carry already, a
   * line at the foot.
   */
  private renderResearch(nodeId: string): string {
    const s = this.state!;
    const me = campaignPlayer(s);
    const n = nodeById(s, nodeId);
    if (n.station?.kind !== 'research') return '';
    const st = n.station;
    const taken = st.takenBy;
    const done = (me.research?.done ?? []).filter((id) => !RETIRED_RESEARCH.has(id)).map((id) => researchProject(id)).filter((x) => !!x);
    const pick = this.rsPick && st.options.includes(this.rsPick) && !taken ? this.rsPick : null;
    // (Upgrades retired from the game, left in an older save's station, are not offered.)
    const offers = st.options
      .filter((id) => !RETIRED_RESEARCH.has(id))
      .map((id, i) => {
        const p = researchProject(id);
        if (!p) return '';
        const why = taken ? null : researchProblem(s, me, n, id);
        const state = taken ? (st.project === id ? 'chosen' : 'gone') : why ? 'gone' : pick === id ? 'picked' : '';
        const attrs = taken || why ? `aria-disabled="true" ${why ? `title="${esc(why)}"` : ''}` : `data-act="cmp-rs-pick" data-arg="${esc(id)}"`;
        return `<button class="rs-offer ${state}" ${attrs} style="--i:${i}">
          <span class="rs-mark">${RESEARCH_MARK()[p.icon] ?? RESEARCH_ICON}</span>
          <b>${esc(p.name.toLowerCase())}</b>
          <span class="rs-text">${esc(p.text)}</span>
          <i class="rs-tier">${'<em></em>'.repeat(p.tier)}</i>
        </button>`;
      })
      .join('');
    // [direction: no way back to the map but a confirm beneath the options, which takes the one picked and returns]
    const open = !taken && st.options.some((id) => !RETIRED_RESEARCH.has(id) && !researchProblem(s, me, n, id));
    const action = `${taken ? `<p class="ar-hint">${taken === me.id ? 'taken' : `taken by ${esc(factionById(s, taken).name.toLowerCase())}`}</p>` : ''}
      <button class="btn-primary ar-go" data-act="cmp-research" data-arg="${n.id}" ${pick ? `data-project="${esc(pick)}"` : ''} ${open && !pick ? 'disabled' : ''}>confirm</button>`;
    return `
      <div class="ar rs">
        <header class="ar-head">
          <small>research station</small>
          <h3>${esc(lower(n.name))}</h3>
        </header>
        <div class="rs-offers">${offers}</div>
        <div class="ar-act">${action}</div>
        ${done.length ? `<footer class="rs-carried"><small>carried</small>${done.map((x) => `<span>${esc(x!.name.toLowerCase())}</span>`).join('')}</footer>` : ''}
      </div>`;
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
