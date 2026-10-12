/**
 * Campaign mode: a dying universe, up to four of its eight races fighting over its last warm worlds, and a
 * march on the Heart, the star at its centre, where the Infinite Stellari is said to grow (see story.ts).
 *
 * Each faction flies one flagship, led by its hero (one of its race's Hero cards, picked as the campaign
 * begins), with a deck of up to ten cards. The flagship moves one route a turn; moving into a system it
 * doesn't hold is a battle, fought under the campaign's own rules (game.ts: GameSetup.campaign): its cards
 * stand in the ship's rooms, and the ship can be upgraded room by room. Armouries and research stations
 * lie about the map: a flagship standing in one can buy its cards (each once) or pick one of its upgrades
 * (free). Claiming the Heart wins; so does holding half the universe.
 *
 * Pure and deterministic like the battle engine: `applyCampaignAction`
 * clones the state, uses the seeded RNG stored in it, and throws GameError on
 * invalid actions. Battles are ordinary Blue Loop games (see game.ts) created
 * from campaign state and fed back in with `finishBattle` once they are over.
 */
import { chooseAIAction } from './ai';
import { ENIGMA_CARDS, isEnigma } from './cards-enigma';
import { CARDS, cardDef, cardIn, copyLimit, fusedId, fusionProblem, presetDeck, RACE_NAMES, rarityOf } from './cards';
import { CORE_RACES, inMode, type GameMode } from './modes';
import { BALANCE } from './balance';
import { applyAction, createDream, createGame, DRAW, GameError, isDraw, isGameOver } from './game';
import { DREAMS } from './dreams-data';
import { nextRandom, randomInt, shuffleInPlace } from './rng';
import type { BattleModifiers, GameState, PlayerSetup, ShipRooms } from './types';
import { LOST_LORDS, OVERLORDS, overlordById, overlordHealth } from './cards-bosses';
import type { RelicInPlay } from './relics';
import { HEROES, heroBonus, makeRelic, relicBonus, RACE_SLOTS, itemValue, type HeroState, type Item, type ItemRarity, type Relic, type SlotKind } from './heroes';
import { RESEARCH, RETIRED_RESEARCH, researchBonus, researchProject, supersededResearch, type ResearchState } from './research';
import { moduleValue, type ShipModule } from './modules';
import { isCaptain } from './captain';
import { RIFT_JUMPS, RIFT_KINDS, RIFTS, markedId, marksFor, NYX_MARKS, type NyxMark, type RiftKind } from './rifts';
const NYX_MARK_NAME = (Object.fromEntries(Object.entries(NYX_MARKS).map(([k, v]) => [k, v.name])) as Record<NyxMark, string>);
import { RELIC_POWERS, SEREN_POWERS } from './relics';
import { runBonuses, type RunBonuses } from './meta';
import {
  contactScene,
  firstConquestScene,
  GENERALS,
  heartSightedScene,
  introScene,
  captainIntroScene,
  collapseScene,
  instabilityScene,
  lostSightedScene,
  stellariaSightedScene,
  type StoryScene,
  wormholeSightedScene,
  wormholeCrossedScene,
  runOverScene,
  STRUGGLE_LINES,
} from './story';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

export const CAMPAIGN = {
  /**
   * A flagship's deck has no most: every card found goes in. Once it reaches this many (its hero among them)
   * this is its least: cards can be taken out down to it, not below.
   */
  armySize: 10,
  /** Cards offered to salvage from a beaten side (the player takes one). */
  salvageChoices: 3,
  /** Chance the winner of a battle finds a ship module in the wreckage (gear: HEROES.itemChance). */
  moduleChance: 0.35,
  /** Armouries and research stations on each universe's strip, and how many cards an armoury stocks (each sold once). */
  armories: 2,
  researchStations: 2,
  armoryStock: 6,
  /** Upgrades a research station offers (the flagship picks one, free). */
  researchOptions: 3,
  /** A hero's own attack and defence before training (they sit in the command room, so start sturdier). */
  heroAttack: 0,
  heroDefence: 2,
  /** The most skill points a hero can put into each of attack and defence. */
  trainMax: 5,
  /** Ship upgrades: materials for the next level (base + per level already built), and each part's most. */
  shipBase: 4,
  shipPerLevel: 4,
  shipMax: { defence: 3, attack: 2, command: 3, shields: 3, hull: 4 },
  /** The command room's defence to start with (on top of the slot's own: 3 in all), and the hull's max health a level. */
  commandRoom: 1,
  hullHealth: 1,
  /** Cards a station (a system with no flagship in it) fights with, by tier, and the Heart's Wardens. */
  /** (Older saves: the tiers' deck sizes, before every enemy deck began at 10.) */
  stationDeck: [10, 12, 14],
  heartDeck: 12,
  /** Every other enemy's deck starts at this many cards (as the player's does), 2 more a tier. */
  enemyDeck: 10,
  /** Cards a system can hold as its garrison. They start its defence already in play. */
  garrisonSlots: 3,
  startMaterials: 10,
  /** Materials to repair one point of damage on a system. */
  healCostPerPoint: 1,
  /** Fortifying a system: each level gives its defender extra max health. Materials: base + per level already built. */
  maxFortification: 3,
  fortifyBaseCost: 4,
  fortifyCostPerLevel: 4,
  fortifyHealth: 2,
  /** Absorb pays this many turns of the system's yield at once. */
  absorbTurns: 3,
  /** Materials for a fusion, before the two cards' prices. */
  fusionBase: 4,
  /** Damage cap on a system (added to its sun's starting heat in battles). */
  maxDamage: 4,
  /** Damage an attacker's home system takes when the attack is repelled. */
  repelledDamage: 2,
  /** Rewards for winning a battle. */
  winMaterials: 4,
  /** Neutral systems whose battlefield holds a relic cache (a Reliquary Obelisk), and how often one seals two relics. */
  vaultChance: 0.22,
  vaultTwoChance: 0.2,
  /** Rewards for completing a campaign mission (plus a card choice). */
  missionMaterials: 6,
  cardChoices: 3,
  activeMissions: 0,
  /** How often a relic found is cursed. */
  curseChance: 0.3,
  /** Control this share of all systems to win outright. */
  dominationShare: 0.5,
  /** When this turn ends, the faction controlling the most systems wins. */
  turnLimit: 160,
  /**
   * Each universe is a strip: `lanes` rows of systems, `columns` long, the lanes linked to their neighbours here and
   * there so they intertwine; the wormhole lies past the far end. Map units between columns and lanes.
   */
  lanes: 3,
  columns: 8,
  colGap: 420,
  laneGap: 330,
  /** The map's size (map units): the strip, and the wormhole past its far end. */
  mapSystems: 23,
  mapWidth: 170 * 2 + 8 * 420,
  /** (Tall enough for a spiral arm round the wormhole, and a strip that bends and widens.) */
  mapHeight: 3200,
  mapMargin: 170,
  /** Worlds with something extra to find (materials), taken with the system. */
  bonusPlanets: 3,
  /** (No raiders roam the strip any more; any in an older save are cleared out. These steered them.) */
  raiderChase: 3,
  raiderChaseChance: 0.7,
  /** Petals grabbed at a wormhole: a few for reaching it, more for every share of the strip conquered. */
  petalBase: 3,
  /** Petals for beating a wormhole's Lost Overlord, each galaxy (on top of the wormhole's own). */
  bossPetals: 4,
  /** The rare (Stellar) or Anomaly cards offered from a beaten Overlord's hoard: pick one. */
  bossCardChoices: 2,
  /** Experience earned, win or lose: for every battle won, system taken, challenge cleared, galaxy crossed, boss beaten. */
  xpBattle: 3,
  /** A battle lost or drawn still teaches something. */
  xpBattleLost: 1,
  xpConquer: 1,
  xpChallenge: 6,
  xpGalaxy: 10,
  xpBoss: 15,
  petalShare: 12,
  /** Systems are never closer than this; routes longer than this are dropped unless needed to connect. */
  minSystemGap: 160,
  maxRoute: 690,
  /** Of the routes beyond those that keep the map connected, the share that are open. */
  extraRoutes: 0.12,
  /** Routes from each home to the Heart (as near as the map allows). */
  homeRing: 30,
  homeRingSlack: 3,
  /** Safety cap on simulated (auto-resolved) battles. */
  battleActionCap: 6000,
  /** Damage (heat carried) an army takes when its attack is repelled, and the most it can carry. */
  armyRepelledDamage: 2,
  /** Materials to repair one point of an army's damage (in a system you hold). */
  armyHealCost: 1,
  /** Finite Stellari: blooms on this many systems, each giving this much a turn to whoever holds it, for this many turns. */
  stellariaBlooms: 10,
  stellariaMaterials: 5,
  stellariaTurns: 8,
  /** The dimming: every this many turns a star gutters, and its system yields 1 less of each. */
  dimEvery: 7,
  /**
   * Regional stability: after this many turns of lead-up the region gives way, and solar systems collapse,
   * from the rim inwards: one a turn, one more every `collapseRamp` turns after that. Each is marked a turn
   * before it goes. Whatever stands there is lost (an army falls back, if it can).
   */
  stabilityTurns: 4,
  collapseRamp: 12,
  /** Each new universe gives way sooner: this many turns fewer, down to the least. */
  stabilityStep: 1,
  stabilityMin: 2,
  /** The counter: stabilise a collapsing system you hold, for materials, holding it together this many turns more (once per system). */
  stabiliseCost: 8,
  stabiliseTurns: 4,
  /** Recycling a reserve card pays this share of its armory price, in materials (at least 1). */
  recycleShare: 0.5,
  /** The Lost Races: rogue armies at the start, the most there can be, and what beating one pays. */
  lostArmies: 6,
  lostMax: 10,
  lostRelicMaterials: 6,
  /** Chance a lost army wanders on a turn, and that it raids a held system next to it when it can. */
  lostWander: 0.6,
  lostRaid: 0.35,
  /** Star types: how often each turns up (the rest are ordinary yellow stars). */
  starOdds: { red: 0.2, white: 0.14, brown: 0.14, neutron: 0.1 },
  /** The Heart: its yield, and its Wardens' extra max health. */
  heartYield: 6,
  heartWardenHealth: 4,
  /** No other system lies closer than this to the Heart (map units). */
  heartClearance: 300,
  /**
   * The core: systems nearer the Heart are richer and better defended, to make up for the worlds the
   * dimming takes. By routes from the Heart (index 1 = next to it): extra materials each turn,
   * and extra max health for whoever defends there.
   */
  coreYield: [0, 2, 1, 1],
  /**
   * Every sun's max health in a battle, by how far the system fought over lies from the Heart (index 0: the
   * Heart; past the end, the rim's): 10 out at the rim where the campaign starts, rising to the card game's
   * 24 at the Heart. Both sides start from it; fortification, a brown dwarf, the galaxy, the Heart's Wardens
   * and a ship's hull add to it.
   */
  sunHealth: [24, 19, 15, 12, 10],
} as const;

/** Armory prices in materials, by rarity (race cards cost 1 more than neutral ones). */
export const ARMORY_PRICE = { dwarf: 3, stellar: 5, anomaly: 8, enigma: 20, race: 1 } as const;
/** How often each rarity turns up in the armory and mission rewards (relative weights). */
// (Enigmas are never in a pool: they are found apart, by enigmaChance.)
export const OFFER_WEIGHT = { dwarf: 4, stellar: 2, anomaly: 1, enigma: 0 } as const;

/** A planet orbiting a map system (cosmetic; the tint names its colour). */
export interface MapPlanet {
  name: string;
  tint: 'weapons' | 'defences' | 'economy' | 'resources';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GarrisonStatus = 'arriving' | 'stationed' | 'leaving';
export interface GarrisonCard {
  uid: string;
  defId: string;
  /** Cards take a turn to arrive and a turn to leave; only stationed cards defend. */
  status: GarrisonStatus;
}

/** A challenge system's kind (see CHALLENGES). */
export type ChallengeKind = 'mine' | 'lord' | 'frost' | 'rift';

/**
 * The Frost Line, harder each time it is held: what stands there at first (with a Rime Golem in front), then the
 * waves (what comes, how many a day, and the days to hold).
 */
const FROST_LINES: { start: string[]; waves: { days: number; spawn: string[]; per: number } }[] = [
  { start: ['frost_wraith', 'frost_shade'], waves: { days: 6, spawn: ['frost_wraith', 'frost_shade'], per: 1 } },
  { start: ['frost_wraith', 'frost_wraith', 'frost_shade'], waves: { days: 6, spawn: ['frost_wraith', 'frost_shade'], per: 1 } },
  { start: ['frost_wraith', 'frost_wraith', 'blizzard_herald'], waves: { days: 7, spawn: ['frost_wraith', 'frost_shade'], per: 2 } },
  { start: ['frost_wraith', 'frost_wraith', 'blizzard_herald'], waves: { days: 8, spawn: ['frost_wraith', 'frost_wraith', 'blizzard_herald'], per: 2 } },
];

/** The challenges: secret systems off the strip, each with rules and a reward of its own. */
export const CHALLENGES: Record<ChallengeKind, { name: string; text: string; reward: string }> = {
  mine: { name: 'Antimatter Mine', text: 'Crystals of antimatter, growing in the dark: break as many as you can in 6 days. They heat your sun while they stand.', reward: '3 materials for every crystal broken' },
  lord: { name: 'Lost Lord', text: 'The last lord of a Lost Race, with their retinue: beat the lord down. Like an Overlord, they play no cards, and take one great action a day.', reward: 'the Lost Lord joins your deck' },
  frost: { name: 'The Frost Line', text: 'Wave after wave out of the cold: survive 6 days (a day more for each Frost Line held before). Each is harder than the last.', reward: '+5 max health on your sun for good, or 6 cooling now' },
  rift: { name: 'Rift', text: 'Enter rift? You may not come back.', reward: 'a Lost Race\'s galaxy, and its ruler' },
};

export type MapLayout = 'strip' | 'spiral' | 'ring';
export type MapTerrain = 'flat' | 'rolling' | 'climb';

export interface CampaignNode {
  id: string;
  name: string;
  /** Map position, within MAP_WIDTH × MAP_HEIGHT. */
  x: number;
  y: number;
  /** Its height over the map's plane, in map units (the land rises and falls with the route). */
  h?: number;
  planets: MapPlanet[];
  owner: string | null;
  links: string[];
  /** Fortification levels built (0–3): extra max health for its defender. */
  fortification: number;
  /** Damage carried between battles; heats this system's sun at the start of each battle here. */
  damage: number;
  garrison: GarrisonCard[];
  /** Factions still barred from attacking it after a Supernova (each is cleared when that faction's turn ends). */
  hazard: string[];
  yield: { materials: number };
  /** Neutral defenders' strength (0–2). */
  tier: number;
  /** Set on a faction's starting system. */
  home?: string;
  /** The Heart, at the centre of the universe: whoever claims it wins. */
  heart?: boolean;
  /**
   * A challenge: a secret system off the strip, hidden until the system it hangs off (`from`) is taken. Its own
   * rules and rewards (CHALLENGES); tried once: `done` once fought (won, or lost: then it is dimmed).
   */
  challenge?: { kind: ChallengeKind; hidden: boolean; from: string; done?: 'won' | 'lost'; lord?: string; rift?: RiftKind };
  /** Gone into the dark behind the flagship (a Dark Galaxy's stars): nothing there, no way back. */
  vanished?: boolean;
  /** A Dark Prophet waits here (a Dark Galaxy): flown into, they mark one of your cards with a Nyxari keyword. */
  prophet?: boolean;
  /** A Dream of the Lost waits here, unseen: the flagship drifts into it once it stands here. */
  dream?: boolean;
  /** A rival hero waits here (the Captain's runs): flown into, they come for the Captain's ship (a Power Struggle). */
  rival?: string;
  /** Time Dense Space: the ring it turns on (1 innermost; the arrival the outermost) and its place round it. */
  spinRing?: number;
  spinSlot?: number;
  /** Time Dense Space, as saved when its stars turned on their own: read once into the rings' notches, then dropped. */
  spinStep?: number;
  /** Routes from here to the Heart (0 at the Heart): the core is richer and better defended. */
  ring?: number;
  /** A Finite Stellari bloom: the turns of plenty it has left (0: wilted). */
  stellaria?: number;
  /** Its star has guttered (the dimming): it yields less. */
  dimmed?: boolean;
  /** Regional stability has failed here: it collapses as the next turn begins. */
  collapsing?: boolean;
  /** Gone: nothing can stand in it, or pass through it. */
  collapsed?: boolean;
  /** Stabilised (once only): it holds until this turn. */
  stableUntil?: number;
  /** (Older saves: the one system a home's route led to, whose defenders started weakened. No longer used.) */
  gate?: boolean;
  /** What kind of star it is (an ordinary yellow star if unset): see STAR_TYPES. */
  star?: StarType;
  /** An armoury or a research station: a flagship standing here can use it. */
  station?: Station;
  /** Where it lies on the strip: its column (0 where the run starts) and lane. */
  col?: number;
  lane?: number;
  /** Something extra on one of its worlds, taken with the system. */
  bonus?: { materials?: number };
  /** Nothing to fight here, only something to find (taken by flying in): materials, or a card to choose. */
  cache?: Cache;
  /** A relic cache on its battlefield (how many relics it seals): a Reliquary Obelisk to break before the battle ends. */
  vault?: number;
  /** Burnt out by a supernova: nothing to take, but open to pass through. */
  ruined?: boolean;
}

/**
 * A station on the map. An armoury sells each of its cards once (for materials); a research station offers a few
 * upgrades, one of which the first flagship to get there takes, free (`project`, once taken). Deep in the strip,
 * both are better.
 */
export type Station =
  /** A space station: its stock, and what has been done there [direction: one buy, one recycle and one fusion per station]. */
  | { kind: 'armory'; cards: string[]; used?: { buy?: boolean; recycle?: boolean; fuse?: boolean } }
  | { kind: 'research'; options: string[]; project?: string; takenBy?: string };

/** A flagship: its rooms (the five card slots and the command room), its shields and its hull. */
export interface Ship {
  rooms: ShipRooms;
  /** The module fitted in each of the five rooms (null: none). */
  modules?: (ShipModule | null)[];
  /** Shields up as each battle begins. */
  shields: number;
  /** Hull levels: each is more max health. */
  hull: number;
}

export type ShipPart = { part: 'defence' | 'attack'; room: number } | { part: 'command' | 'shields' | 'hull' };

export const newShip = (): Ship => ({ rooms: { defence: [0, 0, 0, 0, 0], attack: [0, 0, 0, 0, 0], command: CAMPAIGN.commandRoom }, shields: 0, hull: 0 });

export type StarType = 'red' | 'white' | 'brown' | 'neutron';

/** The kinds of star, each with its gift and its cost. */
export const STAR_TYPES: Record<StarType, { name: string; text: string; boon: string; cost: string }> = {
  red: {
    name: 'Red dwarf',
    text: 'Small, cool and patient: it will outlive everything else.',
    boon: 'Often left unguarded: about half hold a find, most often materials, sometimes cards or an emblem.',
    cost: 'Its worlds are poor: 1 material less when taken.',
  },
  white: {
    name: 'White dwarf',
    text: 'The hot, dense core of a star that died long ago.',
    boon: 'The archives of the dead: about 2 in 5 hold a find, most often cards, sometimes an emblem.',
    cost: 'Battles here are long: every sun starts 2 cooler.',
  },
  brown: {
    name: 'Brown dwarf',
    text: 'A failed star, barely warm. Easy to overlook; hard to dig out.',
    boon: 'Easy to overlook: more often than not a find, cards or an emblem.',
    cost: 'When it is guarded, its defender has +3 max health.',
  },
  neutron: {
    name: 'Neutron star',
    text: 'A city-sized star spinning hundreds of times a second; its beam sweeps the dark.',
    boon: 'Rarely unguarded, but what it hides is rare: most often an emblem, or cards.',
    cost: 'Battles here are volatile: every sun heats by 1 each day.',
  },
};

/**
 * What a system may hold, by its star: the chance it is a find (no defenders) rather than guarded, and what kind
 * of find, weighted. Players see the star, never what it holds, until they get there.
 */
export const STAR_FINDS: Record<StarType | 'yellow', { find: number; kinds: Partial<Record<Cache['kind'], number>> }> = {
  yellow: { find: 0.3, kinds: { materials: 3, cards: 3, relic: 2 } },
  red: { find: 0.5, kinds: { materials: 5, cards: 2, relic: 2 } },
  white: { find: 0.4, kinds: { cards: 4, materials: 2, relic: 2 } },
  brown: { find: 0.55, kinds: { cards: 4, materials: 2, relic: 3 } },
  neutron: { find: 0.25, kinds: { relic: 4, cards: 3, materials: 1 } },
};

/** What a system's star says about what it may hold. */
export function starOdds(n: CampaignNode): string {
  if (n.star) return STAR_TYPES[n.star].boon;
  return 'An ordinary star: usually guarded, now and then a little of anything.';
}

/**
 * What a galaxy (one universe of the run, from wormhole to wormhole) is like: something vast lying under the whole
 * strip, touching every sun in every battle fought there, on both sides.
 */
export type GalaxyKind = 'blackHole' | 'pulsar' | 'meteors' | 'nebula' | 'darkMatter';

export interface GalaxyDef {
  kind: GalaxyKind;
  name: string;
  /** What it does to every battle fought in the galaxy. */
  text: string;
  /** The same, in a few words, for the battle board. */
  short: string;
  modifiers: BattleModifiers;
}

/** Every galaxy is a trade-off, the same for both sides of every battle in it. */
export const GALAXIES: Record<GalaxyKind, GalaxyDef> = {
  blackHole: {
    kind: 'blackHole',
    name: 'Supermassive Black Hole',
    text: 'A supermassive black hole lies beneath this galaxy, its well drinking heat: every sun has +2 max health, but every opening hand is 1 card smaller.',
    short: '+2 max health · opening hand 1 smaller',
    modifiers: { maxHealthDelta: 2, openingHand: -1 },
  },
  pulsar: {
    kind: 'pulsar',
    name: 'Pulsar',
    text: 'A pulsar\'s beam sweeps this galaxy, steadying every sun: each cools by 1 every day, but has 2 less max health.',
    short: 'suns cool 1 each day · 2 less max health',
    modifiers: { coolPerTurn: 1, maxHealthDelta: -2 },
  },
  meteors: {
    kind: 'meteors',
    name: 'Meteor Shower',
    text: 'Meteors rain through this galaxy: every sun starts 2 hotter, and every heat wave from the Stellari strikes every card for 1 too; but every opening hand is 1 card bigger.',
    short: 'suns start 2 hotter · heat waves strike cards for 1 · opening hand 1 bigger',
    modifiers: { startingHeat: 2, openingHand: 1, waveCardHeat: 1 },
  },
  nebula: {
    kind: 'nebula',
    name: 'Nebula',
    text: 'This galaxy lies deep in a nebula, hidden in its gas: every side gains 1 shield every day, but every sun starts 1 hotter.',
    short: '+1 shield each day · suns start 1 hotter',
    modifiers: { shieldPerTurn: 1, startingHeat: 1 },
  },
  darkMatter: {
    kind: 'darkMatter',
    name: 'Dark Matter',
    text: 'Unseen mass threads this galaxy: every side draws 1 extra card every day, but a heat wave from the Stellari heats every sun by 1 every day, and strikes every card for 1.',
    short: 'draw 1 extra each day · daily heat wave: suns +1, cards 1',
    modifiers: { extraDraw: 1, heatPerTurn: 1, waveCardHeat: 1 },
  },
};
export const GALAXY_KINDS = Object.keys(GALAXIES) as GalaxyKind[];

/** Add two sets of battle modifiers together. */
export function mergeModifiers(a: BattleModifiers, b: BattleModifiers): BattleModifiers {
  const out: BattleModifiers = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof BattleModifiers, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** The galaxy's modifiers (and their description), for every battle fought in it, on both sides. */
export function galaxyEffects(s: CampaignState) {
  const g = s.galaxy ? GALAXIES[s.galaxy] : null;
  if (!g) return null;
  return { modifiers: g.modifiers, conditions: [{ name: g.name, text: g.text, short: g.short, galaxy: true }] };
}

export interface CampaignStats {
  settled: number;
  absorbed: number;
  novas: number;
  defences: number;
  rivalsTaken: number;
  battlesWon: number;
  swiftWins: number;
  coldWins: number;
}

export interface ActiveMission {
  id: string;
  /** The stat's value when the mission was drawn (for counting missions). */
  base: number;
}

export interface Faction {
  /** Max health the flagship's sun has gained for good (the Frost Line). */
  sunBonus?: number;
  id: string;
  name: string;
  isAI: boolean;
  /** Which of the alien races this faction is (an index into RACE_NAMES, 0–7). (The Captain's: a placeholder, see human.) */
  race: number;
  /**
   * Led by the Captain, a human [direction: players start as a no-name human hero]: no race of its own, so its rewards
   * are any core race's cards (and neutral ones), and any hero beaten in a Power Struggle may come aboard.
   */
  human?: boolean;
  /** The Captain's Affinities (the skill tree): the races its rewards lean to, and how far. */
  affinity?: { primary?: number; primaryBoost: number; secondary?: number; secondaryBoost: number };
  materials: number;
  /** The flagship's upgrades. */
  ship: Ship;
  /** The hero it picked to lead its flagship. */
  hero?: string;
  /** Owned cards not in an army's deck or a garrison. */
  reserve: string[];
  missions: ActiveMission[];
  missionDeck: string[];
  stats: CampaignStats;
  eliminated: boolean;
  /** The Lost Races: rogue armies with no worlds of their own (never eliminated, never winning). */
  lost?: boolean;
  /** Its heroes' progress (experience, skills, gear), by Hero card id. */
  heroes?: Record<string, HeroState>;
  /** Gear found, not yet worn. */
  items?: Item[];
  /** Relics found on the way, worn at once: blessings on the hero's card, or curses on the flagship. */
  relics?: Relic[];
  /** Ship modules in its stores (not fitted). */
  modules?: ShipModule[];
  /** The upgrades its flagship has taken from research stations. */
  research?: ResearchState;
}

/** An army: a general (a Hero card) and their deck, standing in a system. One army to a system. */
export interface Army {
  id: string;
  owner: string;
  /** The Hero card leading it. A faction's generals are its race's heroes (GENERALS). */
  general: string;
  nodeId: string;
  /** Its battle deck: always legal (30–40 cards, at most 2 of each, one Hero per 10), led by its general. */
  deck: string[];
  /** Heat carried from its last battles: its sun starts this much hotter. */
  damage: number;
  /** Has moved (or fought) this turn: it can't refit until the next. */
  moved: boolean;
  /** Has refitted (its deck changed, or repaired) this turn: it can't move until the next. */
  refit?: boolean;
  /** Routes marched this turn (a hero's skill can allow more than one). */
  steps?: number;
  /** One of the Lost Races: the name of the people it is the last of. */
  lost?: string;
}

/** A hero's progress, kept by their faction (made the first time it is asked for). */
export function heroState(f: Faction, hero: string): HeroState {
  f.heroes ??= {};
  return (f.heroes[hero] ??= { xp: 0, skills: [], gear: {} });
}

/**
 * What an army brings to battle and the map: its hero's boons (skills and gear, on the hero's own card) and
 * whether the hero starts in play, and its faction's research (nothing for the Lost Races).
 */
export function armyBonus(s: CampaignState, a: Army) {
  const f = s.factions.find((x) => x.id === a.owner);
  const hero = heroBonus(a.general, a.lost || !f ? undefined : f.heroes?.[a.general]);
  const r = researchBonus(a.lost || !f ? undefined : f.research);
  const bonus = { ...hero, ...r, foeMods: {} as BattleModifiers, foeHeat: 0, foeConditions: [] as { name: string; text: string }[] };
  // Relics: their powers over the whole board (the passive ones as modifiers, walls and guns, the Hero in play; the
  // once-a-battle ones as skills; the rest for the engine), their curses' tolls on the army's own side.
  const relics = { walls: 0, guns: 0, powers: [] as RelicInPlay[] };
  if (f && !a.lost && f.relics?.length) {
    const rel = relicBonus(f.relics, a.general);
    bonus.boons = [...bonus.boons, ...rel.boons];
    bonus.mods = mergeModifiers(bonus.mods, rel.mods);
    bonus.skills = [...bonus.skills, ...rel.skills];
    if (rel.start) bonus.start = true;
    Object.assign(relics, { walls: rel.walls, guns: rel.guns, powers: rel.powers });
  }
  // The skill tree, bought between runs, for the player's own armies: the flagship's battles
  // (a cooler sun, a sharper command), its repair on the map, its finds and the systems that surrender to it.
  if (a.owner === s.playerId && s.run) {
    const run = s.run;
    if (run.mods) bonus.mods = mergeModifiers(bonus.mods, run.mods);
    bonus.mend += run.mend ?? 0;
    bonus.loot += run.loot ?? 0;
  }
  return { ...bonus, relics };
}

/** Who leads an army, as it is named: its general, or (a lost army) the last of its people. */
export function armyLeader(a: Army): string {
  return a.lost ? `The last of the ${a.lost}` : cardDef(a.general).name;
}

export interface BattleContext {
  attacker: string;
  /** Owning faction, or null for a neutral system's sentinels (or the Heart's Wardens). */
  defender: string | null;
  fromId: string;
  nodeId: string;
  /** The attacking army, and the defending one (null: the system defends itself). */
  armyId: string;
  defenderArmyId: string | null;
  game: GameState;
  /** A challenge being fought, and the flagship's sun before it (a loss leaves it as it was: it is only ejected). */
  challenge?: { kind: ChallengeKind; damage: number };
  /** A Power Struggle: the hero of the player's own race come for their command, and the flagship's sun before it. */
  struggle?: { hero: string; damage: number };
  /** A Dream of the Lost (its puzzle's id), and the flagship's sun before it (a dream leaves it as it was). */
  dream?: { id: string; damage: number };
}

export interface CampaignLogEntry {
  seq: number;
  turn: number;
  text: string;
  /** The systems it happened at (for fog of war: only what is in sight is seen). Unset: news everyone hears. */
  at?: string[];
  /** The faction that acted, if one did. */
  who?: string;
}

/** What a battle brought the player (see CampaignState.loot). */
export interface Loot {
  won: boolean;
  materials: number;
  xp: number;
  petals: number;
  relics: Relic[];
  cards: string[];
}

export interface CampaignState {
  version: 6;
  /** Core (a core race's run: core races, their cards and Core's rules) or Lost Races (unset: Lost Races). */
  mode?: GameMode;
  /** Which universe of the run this is (1 the first), the turn it began, and the next column to give way. */
  universe: number;
  universeStart: number;
  collapseCol: number;
  /** Systems conquered (or burnt) in this universe: what the petals at its wormhole are counted from. */
  conquered: number;
  /** Petals grabbed this run, and how many of them have been banked to the account's lasting progress. */
  petals: number;
  petalsBanked: number;
  /** Stars conquered this run (each system taken, finds too), and how many have been banked to the run's hero's tally. */
  starsTaken?: number;
  starsBanked?: number;
  /** Experience earned this run, and how much of it has been banked (it is kept even if the run is lost). */
  xp?: number;
  xpBanked?: number;
  /** The upgrades bought between runs that this run is played with. */
  run: RunBonuses;
  rngState: number;
  uidCounter: number;
  logSeq: number;
  turn: number;
  playerId: string;
  factions: Faction[];
  nodes: CampaignNode[];
  armies: Army[];
  /** Story scenes waiting to be read (oldest first), and every moment already told. */
  story: { queue: StoryScene[]; told: string[] };
  /** What this universe's galaxy is like (touching every battle in it); missing in older saves until migrated. */
  galaxy?: GalaxyKind;
  /** The Lost Overlord guarding this universe's wormhole (OVERLORDS); missing in older saves until migrated. */
  overlord?: string;
  /**
   * How this universe's systems lie: a long strip, bending and widening as it goes, the wormhole past its far end;
   * or a spiral arm wound in toward the wormhole at the galaxy's heart, the galaxy turning slowly round it.
   */
  layout?: MapLayout;
  /** How the land lies under the route: flat, rolling hills, or climbing toward the wormhole. */
  terrain?: MapTerrain;
  /** In a Lost Race's galaxy, through a rift (rifts.ts): which. Unset in the run's ordinary galaxies. */
  rift?: { kind: RiftKind };
  /** Time Dense Space: how many steps it has taken (a step a second, on the player's screen; one ring turns a step). */
  spin?: number;
  /** Time Dense Space: how many notches each ring has turned (by ring, 1 the innermost). */
  ringSpins?: Record<number, number>;
  /** A Dark Prophet's offer waiting on the player: three of their cards, each with the mark it would take. */
  prophet?: { nodeId: string; offers: { card: string; mark: NyxMark }[] };
  /** Aster's gift waiting on the player: three Seren emblems, one to take. */
  emblemChoice?: Relic[];
  /** A Power Struggle waiting to be fought: where, and which of the player's race's heroes has come for their command. */
  struggle?: { nodeId: string; hero: string };
  /** A rival hero beaten in a Power Struggle (the Captain's runs), waiting on the Captain: recruit them, or slay them. */
  beaten?: { nodeId: string; hero: string };
  /** Heroes slain in this run (the Captain's): they come for no one again. */
  slain?: string[];
  /** A Dream of the Lost waiting to be dreamt: where, and which (its puzzle's id). */
  dream?: { nodeId: string; id: string };
  /** A battle the player is fighting (or can auto-resolve). */
  battle: BattleContext | null;
  /** The player won an attack and must decide the system's fate (the army that won it marches in if it is settled). */
  conquest: { nodeId: string; armyId?: string } | null;
  /**
   * Card choices owed to the player (from missions, relics, and salvage from a battle auto-resolved). A salvaged
   * card goes into that army's deck while it has room (`toDeck`), else the reserve.
   */
  cardRewards: { source: string; options: string[]; toDeck?: string; /** How the log tells it ("salvages"). */ take?: string }[];
  /** Frost Lines held so far this run (each is harder than the last). */
  frostLevel?: number;
  /** Lost Lords beaten this run (each joins only once). */
  lordsWon?: string[];
  /** A Frost Line's reward waiting to be chosen: more max health for good, or cooling now. */
  boon?: { source: string };
  /**
   * What the player's last battle brought them, shown on the map as they come back to it (then let go): won or not,
   * and everything gained (materials, experience, petals, relics, cards put in their deck or reserve).
   */
  loot?: Loot;
  /** Whose part of the turn it is: the player's, then the AI factions' in turn. */
  phase: 'player' | 'ai';
  /** AI factions still to act this turn (their turns pause while the player defends). */
  aiQueue: string[];
  /** The other factions are moving one at a time (the screen shows each), rather than all at once. */
  aiStepwise?: boolean;
  winner: string | null;
  log: CampaignLogEntry[];
}

export interface CampaignSetup {
  seed: number;
  playerName?: string;
  /** The player's race (an index into RACE_NAMES, 0–7); the rivals are drawn at random from the other races. */
  race?: number;
  /** Rival AI factions, 1–3. */
  rivals?: number;
  /** The hero the player leads (one of their race's, GENERALS): the first if unset. */
  hero?: string;
  /** What the run starts with and is played under (bought with petals between runs). */
  run?: RunBonuses;
  /** The Captain's card (captain.ts: what petals have made of them). Set: the run is the Captain's, a human's. */
  captain?: string;
}

export interface Cache {
  kind: 'materials' | 'cards' | 'relic';
  amount: number;
}

export type ConquestChoice = 'settle' | 'absorb' | 'supernova';

export type CampaignAction =
  /** Move an army one route: into a system you hold, or into battle for one you don't. */
  | { type: 'move'; armyId: string; toId: string }
  /** Hold a collapsing system together a few turns more. */
  | { type: 'stabilise'; nodeId: string }
  /** Move a reserve card into an army's deck, or a deck card back to the reserve (a deck must be legal to attack). */
  | { type: 'deckAdd'; armyId: string; defId: string }
  | { type: 'deckRemove'; armyId: string; defId: string }
  /** Break a card down for materials: one of the flagship's deck at a space station (`nodeId`), or (older saves) a reserve card. */
  | { type: 'recycle'; defId: string; nodeId?: string }
  /** Fuse two cards of the flagship's deck into one that does both, at a space station (for materials; for good). */
  | { type: 'fuseDeck'; nodeId: string; a: string; b: string }
  /** Take one of a research station's upgrades (your flagship must stand there), free. */
  | { type: 'research'; nodeId: string; projectId: string }
  /** A hero spends a skill point. */
  /** A hero puts a skill point into their own attack or defence. */
  /** Upgrade a part of the flagship, for materials. */
  /** Fit a module from the stores into a room (one already there goes back to the stores), or take one out. */
  /** A hero puts on gear (from the faction's finds), in a slot it fits; or takes it off. */
  | { type: 'healArmy'; armyId: string; all?: boolean }
  /** The oldest story scene has been read. */
  | { type: 'readStory' }
  /** Hand back the battle once it is over (or ask for it to be auto-resolved from here). */
  /** `salvage`: the card the player salvaged from the beaten side (salvageOptions), or null to take none. */
  | { type: 'finishBattle'; game: GameState; auto?: boolean; salvage?: string | null }
  /** The player has seen what their last battle brought them. */
  | { type: 'dismissLoot' }
  /** A Frost Line's reward: 5 more max health on the flagship's sun for good, or 6 cooling now. */
  | { type: 'takeBoon'; pick: 'health' | 'cool' }
  | { type: 'conquer'; choice: ConquestChoice }
  | { type: 'chooseCard'; defId: string | null }
  /** Buy a card from an armoury your flagship stands in (each card is sold once). */
  | { type: 'buyCard'; nodeId: string; index: number }
  /** Fuse two reserve cards into one that does both (for materials; it cannot be undone). */
  | { type: 'fuse'; a: number; b: number }
  /** Swap a reserve card into an army's deck slot (the slot's card goes to reserve). The deck must stay legal. */
  | { type: 'deckSwap'; armyId: string; slot: number; reserveIndex: number }
  /** End the player's turn. `stepwise`: the other factions then move one at a time, each on an `aiStep`. */
  | { type: 'endTurn'; stepwise?: boolean }
  /** Let the next faction (in a stepwise end of turn) take its turn. */
  | { type: 'aiStep' }
  /** The petals grabbed so far have been added to the account's lasting progress. */
  | { type: 'petalsBanked' }
  /** A Dark Prophet's offer: the card to mark (its index among the offers), or null to refuse. */
  | { type: 'prophetPick'; index: number | null }
  /** Aster's gift: the Seren emblem taken (its index). */
  | { type: 'chooseEmblem'; index: number }
  /** Face the Power Struggle waiting (the battle begins). */
  | { type: 'struggle' }
  | { type: 'struggleChoice'; recruit: boolean }
  /** Drift into the Dream of the Lost waiting (its puzzle begins). */
  | { type: 'dream' };

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export interface CampaignMissionDef {
  id: string;
  name: string;
  text: string;
  target: number;
  /** Counting missions measure progress from when they were drawn. */
  counting: boolean;
  value(f: Faction, state: CampaignState): number;
}

const stat = (key: keyof CampaignStats) => (f: Faction) => f.stats[key];

export const CAMPAIGN_MISSIONS: CampaignMissionDef[] = [
  { id: 'c_colonist', name: 'Conqueror', text: 'Conquer 3 systems.', target: 3, counting: true, value: stat('settled') },
  { id: 'c_harvest', name: 'Veteran', text: 'Win 5 battles.', target: 5, counting: true, value: stat('battlesWon') },
  { id: 'c_bulwark', name: 'Bulwark', text: 'Win a defence.', target: 1, counting: true, value: stat('defences') },
  { id: 'c_warlord', name: 'Warlord', text: 'Win 3 battles.', target: 3, counting: true, value: stat('battlesWon') },
  { id: 'c_blitz', name: 'Blitz', text: 'Win a battle within 6 rounds.', target: 1, counting: true, value: stat('swiftWins') },
  { id: 'c_cold', name: 'Cold Victory', text: 'Win a battle with your sun at 0 or colder.', target: 1, counting: true, value: stat('coldWins') },
  { id: 'c_expanse', name: 'Expanse', text: 'Control 5 systems.', target: 5, counting: false, value: (f, s) => ownedNodes(s, f.id).length },
];

const MISSION_BY_ID = new Map(CAMPAIGN_MISSIONS.map((m) => [m.id, m]));
export function campaignMissionDef(id: string): CampaignMissionDef {
  const def = MISSION_BY_ID.get(id);
  if (!def) throw new Error(`Unknown campaign mission: ${id}`);
  return def;
}

export function missionProgress(state: CampaignState, f: Faction, m: ActiveMission): number {
  const def = campaignMissionDef(m.id);
  return Math.min(def.target, def.value(f, state) - (def.counting ? m.base : 0));
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const nodeById = (s: CampaignState, id: string) => {
  const n = s.nodes.find((x) => x.id === id);
  if (!n) throw new GameError('Unknown system.');
  return n;
};
export const factionById = (s: CampaignState, id: string) => {
  const f = s.factions.find((x) => x.id === id);
  if (!f) throw new GameError('Unknown faction.');
  return f;
};
export const campaignPlayer = (s: CampaignState) => factionById(s, s.playerId);
export const ownedNodes = (s: CampaignState, factionId: string) => s.nodes.filter((n) => n.owner === factionId);

/** What a faction can see: the whole strip, every route to the wormhole (there is no fog). */
export function visibleNodes(s: CampaignState, _factionId: string): Set<string> {
  // The Dark Galaxy: only the star the flagship stands at, and the stars one jump ahead [direction: complete darkness,
  // one star ahead at a time].
  if (s.rift?.kind === 'dark') {
    const ship = flagship(s, s.playerId);
    const here = ship ? nodeById(s, ship.nodeId) : null;
    return new Set(here ? [here.id, ...here.links.filter((id) => !nodeById(s, id).vanished)] : []);
  }
  // (A challenge stays unseen until the system it hangs off is taken.)
  return new Set(s.nodes.filter((n) => !n.challenge?.hidden).map((n) => n.id));
}

export const armyById = (s: CampaignState, id: string) => {
  const a = s.armies.find((x) => x.id === id);
  if (!a) throw new GameError('Unknown army.');
  return a;
};
export const armiesOf = (s: CampaignState, factionId: string) => s.armies.filter((a) => a.owner === factionId);
export const armyAt = (s: CampaignState, nodeId: string) => s.armies.find((a) => a.nodeId === nodeId) ?? null;

/** A faction's flagship (null once it is gone: a faction with no worlds left). */
export const flagship = (s: CampaignState, factionId: string): Army | null => s.armies.find((a) => a.owner === factionId) ?? null;

/** The level a part of a ship is at (rooms and the command room from 0: what has been built on them). */
export function shipLevel(ship: Ship, p: ShipPart): number {
  if (p.part === 'defence') return ship.rooms.defence[p.room] ?? 0;
  if (p.part === 'attack') return ship.rooms.attack[p.room] ?? 0;
  if (p.part === 'command') return ship.rooms.command - CAMPAIGN.commandRoom;
  return p.part === 'shields' ? ship.shields : ship.hull;
}

/** Materials for a ship part's next level (null at its most, or no such room). */
export function shipUpgradeCost(ship: Ship, p: ShipPart): number | null {
  if ((p.part === 'defence' || p.part === 'attack') && !(p.room >= 0 && p.room < BALANCE.tableauSlots)) return null;
  const level = shipLevel(ship, p);
  if (level >= CAMPAIGN.shipMax[p.part]) return null;
  return CAMPAIGN.shipBase + level * CAMPAIGN.shipPerLevel;
}

/** A hero's attack and defence in the command room (heroes no longer train: the baseline). */
export function heroStats(_f: Faction | undefined, _hero: string): { attack: number; defence: number } {
  return { attack: CAMPAIGN.heroAttack, defence: CAMPAIGN.heroDefence };
}

/** Why a faction can't use a station here (null if it can): its flagship has to stand in it. */
export function stationProblem(s: CampaignState, f: Faction, n: CampaignNode): string | null {
  if (!n.station) return `${n.name} has no station.`;
  if (flagship(s, f.id)?.nodeId !== n.id) return `Your flagship must be at ${n.name} to use its ${n.station.kind === 'armory' ? 'space station' : 'research station'}.`;
  return null;
}

/** Why a faction can't take this research station's upgrade (or, with no project named, any of them; null if it can). */
export function researchProblem(s: CampaignState, f: Faction, n: CampaignNode, projectId?: string): string | null {
  const why = stationProblem(s, f, n);
  if (why) return why;
  if (n.station?.kind !== 'research') return `${n.name} has no research station.`;
  if (n.station.takenBy) return `${n.name}'s research has already been taken.`;
  const open = n.station.options.filter((id) => !f.research?.done.includes(id));
  if (projectId === undefined) return open.length ? null : 'You have all of its upgrades already.';
  if (!n.station.options.includes(projectId)) return `${n.name}'s research station doesn't offer that.`;
  if (f.research?.done.includes(projectId)) return 'You have that upgrade already.';
  if (supersededResearch([...(f.research?.done ?? []), projectId], projectId)) return 'You have a better one already.';
  return null;
}

/** Why a faction can't buy an armoury's card (null if it can). */
export function buyProblem(s: CampaignState, f: Faction, n: CampaignNode, index: number): string | null {
  const why = stationProblem(s, f, n);
  if (why) return why;
  if (n.station?.kind !== 'armory') return `${n.name} has no space station.`;
  const id = n.station.cards[index];
  if (!id) return 'That card has been sold.';
  if (n.station.used?.buy) return 'One purchase per station';
  if (f.materials < buyPrice(s, f, id)) return 'Not enough materials';
  return null;
}

/**
 * Why a card of the flagship's deck can't be recycled at this space station (null if it can) [direction: no reserve
 * now; recycle and fuse straight from the deck, as long as it stays at its 10 card least; one of each per station].
 */
export function recycleProblem(s: CampaignState, f: Faction, n: CampaignNode, defId: string): string | null {
  const why = stationProblem(s, f, n);
  if (why) return why;
  if (n.station?.kind !== 'armory') return `${n.name} has no space station.`;
  if (n.station.used?.recycle) return 'One recycle per station';
  const army = flagship(s, f.id);
  if (!army) return 'You have no flagship.';
  return deckRemoveProblem(army, defId);
}

/** Why two cards of the flagship's deck can't be fused at this space station (null if they can). */
export function fuseProblem(s: CampaignState, f: Faction, n: CampaignNode, a: string, b: string): string | null {
  const why = stationProblem(s, f, n);
  if (why) return why;
  if (n.station?.kind !== 'armory') return `${n.name} has no space station.`;
  if (n.station.used?.fuse) return 'One fusion per station';
  const army = flagship(s, f.id);
  if (!army) return 'You have no flagship.';
  const have = (id: string) => army.deck.filter((x) => x === id).length;
  if (a === b ? have(a) < 2 : !have(a) || !have(b)) return 'Choose two cards of your deck.';
  if ([a, b].includes(army.general) && have(army.general) <= (a === b ? 2 : 1)) return `${cardDef(army.general).name} leads this flagship: their card stays.`;
  if (army.deck.length - 1 < CAMPAIGN.armySize) return `${CAMPAIGN.armySize} cards minimum`;
  const problem = fusionProblem(a, b);
  if (problem) return problem;
  if (f.materials < fusionCost(a, b)) return 'Not enough materials';
  return null;
}

/** Where an army can go this turn: each linked system, and whether going there is a battle. */
export function armyMoves(s: CampaignState, army: Army): { toId: string; battle: boolean; surrender?: boolean }[] {
  if (army.moved || army.refit || (army.steps ?? 0) >= 1 + armyBonus(s, army).march) return [];
  const here = nodeById(s, army.nodeId);
  const out: { toId: string; battle: boolean; surrender?: boolean }[] = [];
  for (const id of here.links) {
    const n = nodeById(s, id);
    if (n.collapsed || n.vanished) continue;
    // (Time Dense Space: inward, or round the ring, never outward.)
    if (s.rift?.kind === 'time' && (n.spinRing ?? 0) > (here.spinRing ?? 99) && !n.heart) continue;
    // (Never a move that would end the player's run.)
    if (doomProblem(s, army, id)) continue;
    // A challenge: the player's alone, once found, and tried once.
    if (n.challenge) {
      if (army.owner === s.playerId && !n.challenge.hidden && !n.challenge.done) out.push({ toId: id, battle: n.challenge.kind !== 'rift' });
      continue;
    }
    const there = armyAt(s, id);
    // (A system it holds, a burnt-out ruin, or a station (a pit stop, never fought over), is passed through freely.)
    if (n.owner === army.owner || n.station || ((n.ruined || n.cache || n.prophet) && !n.owner && !there)) {
      if (!there) out.push({ toId: id, battle: false });
      continue;
    }
    if (hazardBlocks(n, army.owner)) continue;
    out.push(surrenders(s, army, n) ? { toId: id, battle: false, surrender: true } : { toId: id, battle: true });
  }
  return out;
}

/**
 * Why a move would end the player's run (null if it wouldn't) [direction: players can't move their ship to a node
 * that would end their run]: its last step of the turn into a system that collapses as the turn ends, or into one
 * the coming turn's collapse will cut off, every way out of it collapsing too. (A challenge is fought from where
 * the flagship stands; the wormhole is always worth the try.)
 */
export function doomProblem(s: CampaignState, army: Army, toId: string): string | null {
  if (army.owner !== s.playerId || army.lost) return null;
  const here = nodeById(s, army.nodeId);
  const to = nodeById(s, toId);
  const dest = to.challenge ? here : to;
  if (dest.heart) return null;
  // (With a step to spare this turn, it can go on out of the collapse's way.)
  if ((army.steps ?? 0) + 1 < 1 + armyBonus(s, army).march) return null;
  if (dest.collapsing) return `${dest.name} collapses as the turn ends: your flagship would go down with it.`;
  // The coming turn: what is marked now goes, and (stability spent) the next column is marked.
  const marks = universeStability(s) - (s.turn + 1 - s.universeStart) <= 0;
  const goes = (n: CampaignNode) => n.collapsed || n.collapsing || (marks && n.col === s.collapseCol);
  if (!goes(dest)) return null;
  const out = dest.links.map((id) => nodeById(s, id)).some((n) => n.heart || (!goes(n) && !n.challenge));
  return out ? null : `${dest.name} would be cut off: every way out of it collapses before your flagship could leave.`;
}

/** Whether a neutral system gives itself up to this army without a fight (a hero's Dread). */
export function surrenders(s: CampaignState, army: Army, n: CampaignNode): boolean {
  return !n.owner && !n.heart && !armyAt(s, n.id) && n.tier < armyBonus(s, army).dread;
}

/** Turns of regional stability left before systems start to collapse (0: they are collapsing). */
export function regionalStability(s: CampaignState): number {
  return Math.max(0, universeStability(s) - (s.turn - s.universeStart));
}

/** Systems that collapse each turn, once stability has run out. */
export function collapsesPerTurn(_s: CampaignState): number {
  // (A whole column of the strip goes each turn.)
  return 1;
}

/** Why a faction can't stabilise a system (null if it can). */
export function stabiliseProblem(_f: Faction, _n: CampaignNode): string | null {
  return 'Nothing holds back the collapse: keep moving.';
}

/** Why a card can't go into an army's deck from the reserve (null if it can). There is no most. */
export function deckAddProblem(f: Faction, army: Army, defId: string): string | null {
  if (!f.reserve.includes(defId)) return `${cardDef(defId).name} is not in your reserve.`;
  const copies = army.deck.filter((id) => id === defId).length;
  if (copies >= campaignCopies(defId)) return `At most ${campaignCopies(defId)} copies of a card.`;
  if (cardDef(defId).kind === 'command' && defId !== army.general) return `An army is led by its own hero: ${cardDef(defId).name} can lead an army of their own.`;
  return null;
}

/** Why a card can't come out of an army's deck (null if it can). */
export function deckRemoveProblem(army: Army, defId: string): string | null {
  if (!army.deck.includes(defId)) return `${cardDef(defId).name} is not in that deck.`;
  if (defId === army.general && army.deck.filter((x) => x === defId).length === 1) return `${cardDef(defId).name} leads this army: their card stays in its deck.`;
  // (Once a deck has reached its least, it keeps at least that many.)
  if (army.deck.length === CAMPAIGN.armySize) return `A flagship's deck keeps at least ${CAMPAIGN.armySize} cards once it has that many.`;
  return null;
}

/** Materials for recycling a card: half its armory price (at least 1). */
export function recycleValue(defId: string): number {
  return Math.max(1, Math.floor(armoryPrice(defId) * CAMPAIGN.recycleShare));
}

/** Where the player stands, to tell what a battle brought them (see lootSince). */
function lootMark(s: CampaignState) {
  const f = factionById(s, s.playerId);
  const cards = [...s.armies.filter((a) => a.owner === f.id).flatMap((a) => a.deck), ...f.reserve];
  return { materials: f.materials, xp: s.xp ?? 0, petals: s.petals, relics: new Set((f.relics ?? []).map((r) => r.id)), cards };
}

/** What the player gained since the mark: materials, experience, petals, relics, and cards put in a deck or the reserve. */
function lootSince(s: CampaignState, before: ReturnType<typeof lootMark>, won: boolean): Loot {
  const now = lootMark(s);
  const f = factionById(s, s.playerId);
  const had = new Map<string, number>();
  for (const id of before.cards) had.set(id, (had.get(id) ?? 0) + 1);
  const cards: string[] = [];
  for (const id of now.cards) {
    const n = had.get(id) ?? 0;
    if (n > 0) had.set(id, n - 1);
    else cards.push(id);
  }
  return {
    won,
    materials: Math.max(0, now.materials - before.materials),
    xp: Math.max(0, now.xp - before.xp),
    petals: Math.max(0, now.petals - before.petals),
    relics: (f.relics ?? []).filter((r) => !before.relics.has(r.id)),
    cards,
  };
}

/** Bring a saved campaign up to the current rules (saves from before version 4 aren't kept: see the UI). */
export function migrateCampaign(s: CampaignState): CampaignState {
  // A map from before maps grew taller (and could bend, or wind round their wormhole): a straight strip, moved
  // down to the middle of the taller map.
  if (!s.layout) {
    const shift = (CAMPAIGN.mapHeight - (170 * 2 + 2 * 330)) / 2;
    for (const n of s.nodes) n.y += shift;
    s.layout = 'strip';
    s.terrain = 'flat';
  }
  // No scanners any more (there is no fog).
  for (const n of s.nodes) delete (n as { scanner?: boolean }).scanner;
  // No raiders any more: any left in an older save are gone.
  s.armies = s.armies.filter((a) => !a.lost);
  // No one else takes turns, and no missions: a turn left half-passed simply begins.
  for (const f of s.factions) f.missions = [];
  // Heroes no longer level, learn, train or wear gear: what an older save gave them is let go (relics stay).
  for (const f of s.factions) {
    for (const h of Object.values(f.heroes ?? {})) {
      h.xp = 0;
      h.skills = [];
      h.gear = {};
      delete h.train;
    }
    f.items = [];
    f.modules = [];
    if (f.ship) delete f.ship.modules;
  }
  if (s.phase === 'ai') {
    s.aiQueue = [];
    s.aiStepwise = undefined;
    s.phase = 'player';
  }
  // No anomalies on the map any more: a galaxy of its own instead.
  delete (s as { anomalies?: unknown }).anomalies;
  // No credits any more: what a faction had is materials now, and so is what its systems pay.
  for (const f of s.factions) {
    const old = f as Faction & { credits?: number };
    if (old.credits) f.materials += old.credits;
    delete old.credits;
  }
  for (const n of s.nodes) {
    const y = n.yield as { credits?: number; materials: number };
    if (y.credits) y.materials += y.credits;
    delete y.credits;
    const b = n.bonus as { credits?: number; materials?: number } | undefined;
    if (b?.credits) b.materials = (b.materials ?? 0) + b.credits;
    if (b) delete b.credits;
    if ((n.cache?.kind as string) === 'credits') n.cache!.kind = 'materials';
  }
  // Research stations offer a choice now (older saves had one upgrade each, for Wisdom, which is gone).
  for (const n of s.nodes) {
    const st = n.station as (Station & { options?: string[] }) | undefined;
    if (st?.kind === 'research' && !st.options) st.options = st.project ? [st.project] : [];
  }
  if (!s.galaxy) s.galaxy = GALAXY_KINDS[(s.universe * 7 + s.nodes.length) % GALAXY_KINDS.length];
  // Enemy flagships carry a card that repairs (their race's, where it has one): an older save's decks, made
  // before, have a neutral card or two swapped for it.
  for (const a of s.armies) {
    if (a.owner === s.playerId || a.deck.some((id) => repairs(cardDef(id)))) continue;
    const race = s.factions.find((f) => f.id === a.owner)?.race;
    const fix = CARDS.find((c) => c.race === race && c.kind === 'defence' && c.rarity !== 'anomaly' && !c.fusion && repairs(c) && legalIn(s.mode, c.id));
    if (!fix) continue;
    let swapped = 0;
    for (let i = a.deck.length - 1; i >= 0 && swapped < 2; i--) {
      const d = cardDef(a.deck[i]);
      if (d.race !== undefined || d.kind === 'command' || a.deck[i] === a.general) continue;
      a.deck[i] = fix.id;
      swapped++;
    }
  }
  return s;
}

/** Materials for the next fortification level on a system (null at the maximum). */
export function fortifyCost(node: CampaignNode): number | null {
  if (node.fortification >= CAMPAIGN.maxFortification) return null;
  return CAMPAIGN.fortifyBaseCost + node.fortification * CAMPAIGN.fortifyCostPerLevel;
}

/** Materials to fuse two cards: a base cost plus both cards' armory prices by rarity. */
export function fusionCost(a: string, b: string): number {
  const r = (id: string) => ARMORY_PRICE[cardDef(id).rarity ?? 'dwarf'];
  return CAMPAIGN.fusionBase + r(a) + r(b);
}

export function armoryPrice(defId: string): number {
  const def = cardDef(defId);
  return ARMORY_PRICE[def.rarity ?? 'dwarf'] + (def.race === undefined ? 0 : ARMORY_PRICE.race);
}

/** What a card costs a faction at an armoury: the player's, less any Trade friends discount (at least 1). */
export function buyPrice(s: CampaignState, f: Faction, defId: string): number {
  return Math.max(1, armoryPrice(defId) - (f.id === s.playerId ? s.run?.armoryDiscount ?? 0 : 0));
}

/** Any card except a global can garrison a system. */
export function canGarrison(defId: string): boolean {
  return cardDef(defId).kind !== 'global';
}

/** Whether swapping a reserve card into an army's deck slot keeps the deck legal (and why not). */
export function deckSwapProblem(f: Faction, army: Army, slot: number, reserveIndex: number): string | null {
  const id = f.reserve[reserveIndex];
  if (!id || army.deck[slot] === undefined) return 'No such card.';
  if (army.deck[slot] === army.general && army.deck.filter((x) => x === army.general).length === 1) return `${cardDef(army.general).name} leads this army: their card stays in its deck.`;
  const next = [...army.deck];
  next[slot] = id;
  return armyDeckProblems(next, army.general)[0] ?? null;
}

/** Is `factionId` barred from attacking this system (a recent Supernova)? */
export const hazardBlocks = (n: CampaignNode, factionId: string) => n.hazard.includes(factionId);

/** Systems a faction's armies may attack this turn, each with the armies that can reach it. */
export function attackOptions(s: CampaignState, factionId: string): { toId: string; armyIds: string[] }[] {
  const out = new Map<string, string[]>();
  for (const a of armiesOf(s, factionId)) for (const m of armyMoves(s, a)) if (m.battle) out.set(m.toId, [...(out.get(m.toId) ?? []), a.id]);
  return [...out].map(([toId, armyIds]) => ({ toId, armyIds }));
}

export interface GarrisonBonus {
  /** Cards that start the defence already in the defender's tableau. */
  tableau: string[];
  /** A stationed trap, set face down from the start (only the first). */
  lightspeed?: string;
}

/**
 * What a system's stationed cards do when it is attacked: they start the
 * battle already in the defender's tableau (a stationed Command card with its
 * first choice), and a stationed trap starts set face down (only
 * one can be).
 */
export function garrisonBonus(n: CampaignNode): GarrisonBonus {
  const b: GarrisonBonus = { tableau: [] };
  for (const g of n.garrison) {
    if (g.status !== 'stationed') continue;
    const def = cardDef(g.defId);
    if (def.kind === 'trap') {
      b.lightspeed ??= g.defId;
      continue;
    }
    b.tableau.push(g.defId);
  }
  return b;
}

/** Income each turn from the systems a faction controls (Stellari blooms included, while they last). */
export function factionIncome(_s: CampaignState, _factionId: string) {
  // (No income by the turn: materials come from systems taken, and the worlds with something extra.)
  return { materials: 0 };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** The map's size in map units (system positions lie inside it). */
export const MAP_WIDTH = CAMPAIGN.mapWidth;
export const MAP_HEIGHT = CAMPAIGN.mapHeight;

const SYLLABLES = ['ka', 'ren', 'thu', 'vo', 'lis', 'ar', 'mek', 'ssa', 'dor', 'ix', 'ul', 'phe', 'nar', 'zo', 'qua', 'tir', 'bel', 'osh', 'ven', 'cy'];

function nodeName(s: CampaignState, used: Set<string>): string {
  for (;;) {
    const parts = 2 + randomInt(s, 2);
    let name = '';
    for (let i = 0; i < parts; i++) name += SYLLABLES[randomInt(s, SYLLABLES.length)];
    name = name[0].toUpperCase() + name.slice(1);
    if (!used.has(name) && name.length <= 9) {
      used.add(name);
      return name;
    }
  }
}

const emptyStats = (): CampaignStats => ({ settled: 0, absorbed: 0, novas: 0, defences: 0, rivalsTaken: 0, battlesWon: 0, swiftWins: 0, coldWins: 0 });

/** Whether a card repairs (as it is played, at dawn or at dusk). */
const repairs = (c: { onPlay?: { type: string }[]; onTurn?: { type: string }[]; onDusk?: { type: string }[] }) =>
  [...(c.onPlay ?? []), ...(c.onTurn ?? []), ...(c.onDusk ?? [])].some((e) => e.type === 'repair');

/** Neutral cards every campaign deck starts with (twice each), before its race's cards. */
// Weighted to attack (seven attack pairs to three defence): a campaign is won by taking systems, and a
// deck heavy with defence could not finish even a weakened foe before regional stability ran out.
/**
 * A flagship's starting deck, ten cards (the size a deck then never drops below): its hero, the race's own first
 * two attacks and first defence (two of each), and plain neutral cards to fill it. The rest is found on the way,
 * at armouries and as rewards.
 */
export function armyDeck(race: number, general: string, mode: GameMode = 'lost'): string[] {
  const r = ((race % RACE_NAMES.length) + RACE_NAMES.length) % RACE_NAMES.length;
  const plain = (c: (typeof CARDS)[number]) => c.kind !== 'command' && c.rarity !== 'anomaly' && !c.fusion && !c.spendAll && legalIn(mode, c.id);
  const mine = CARDS.filter((c) => c.race === r && plain(c));
  // (Its defence pair: one that repairs, where the race has one, so repair turns up in the enemy's decks too.)
  const defences = mine.filter((c) => c.kind === 'defence');
  const own = [...mine.filter((c) => c.kind === 'attack').slice(0, 2), ...[...defences.filter(repairs), ...defences].slice(0, 1)].map((c) => c.id);
  const deck = [general, ...own.flatMap((id) => [id, id])];
  for (const id of ['coronal_lance', 'deflector_grid', 'heat_sink', ...GUARD_NEUTRALS, ...CORE_FILL]) {
    if (deck.length >= CAMPAIGN.armySize) break;
    if (!legalIn(mode, id)) continue;
    if (deck.filter((x) => x === id).length < 2) deck.push(id);
  }
  // The later a hero comes in their race's order, the stronger the deck they bring [direction: the starting deck
  // better the higher the hero; not only do you get Solenne, but the really powerful cards in her deck too]: the second
  // brings a pair of the race's rare (Stellar) cards, the third a pair of Stellar cards and a pair of Anomalies, in
  // place of neutral cards. The hero's own sub-race's first, then the heaviest.
  const tier = Math.max(0, GENERALS[r]?.indexOf(general) ?? 0);
  if (tier > 0) {
    const sub = cardDef(general).sub;
    const best = (rarity: string) =>
      CARDS.filter((c) => c.race === r && c.kind !== 'command' && (c.rarity ?? 'dwarf') === rarity && !c.fusion && !c.spendAll && legalIn(mode, c.id) && !deck.includes(c.id))
        .sort((a, b) => Number(b.sub === sub && !!sub) - Number(a.sub === sub && !!sub) || (b.cost ?? 1) - (a.cost ?? 1))
        .map((c) => c.id);
    // (A race with no Anomaly of its own to give: a second Stellar pair.)
    const stellar = best('stellar'), anomaly = best('anomaly');
    const gifts = [stellar[0], ...(tier >= 2 ? [anomaly[0] ?? stellar[1]] : [])].filter(Boolean).flatMap((id) => [id, id]);
    const out = deck.slice(0, CAMPAIGN.armySize);
    for (const id of gifts) {
      const k = out.map((x, i) => [x, i] as const).reverse().find(([x]) => x !== general && cardDef(x).race !== r)?.[1];
      if (k === undefined) break;
      out[k] = id;
    }
    return out;
  }
  return deck.slice(0, CAMPAIGN.armySize);
}

/** The Captain's starting deck: the Captain and nine plain neutral cards [direction: all cards in the deck neutral to start]. */
export const CAPTAIN_DECK = ['coronal_lance', 'coronal_lance', 'thermal_exchange', 'thermal_exchange', 'plasma_relay', 'cryo_vault', 'heat_sink', 'p_barrier_drone', 'deep_scanners'];
export function captainDeck(captain: string): string[] {
  return [captain, ...CAPTAIN_DECK];
}

/**
 * Why a flagship's deck is not ready to fight (empty if it is): its hero (the one Hero in it), at most 2 of any
 * card (1 of an Anomaly).
 */
/**
 * How many copies of a card a flagship's deck may carry: as many of an Anomaly as of any other card [direction:
 * campaign decks can have more than one of each Anomaly].
 */
/** Copies of a card a campaign deck may hold: two of anything (Anomalies too), one of each Enigma. */
export const campaignCopies = (id: string) => (isEnigma(id) ? 1 : BALANCE.maxCopies);

export function armyDeckProblems(deck: string[], general: string): string[] {
  const out: string[] = [];
  if (!deck.includes(general)) out.push(`${cardDef(general).name} leads this flagship: their card must be in its deck.`);
  // (Heroes of the leader's own race may come aboard too: won in a Power Struggle, they serve under the leader.)
  const race = cardDef(general).race;
  // (The Captain's: any hero won in a Power Struggle.)
  const aboard = (id: string) => (isCaptain(general) ? GENERALS.some((g) => g.includes(id)) : race !== undefined && GENERALS[race]?.includes(id));
  const heroes = deck.filter((id) => cardDef(id).kind === 'command' && id !== general && !aboard(id));
  if (heroes.length) out.push(`A flagship has one hero: ${cardDef(heroes[0]).name} can't come aboard.`);
  const counts = new Map<string, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) if (n > campaignCopies(id)) out.push(`At most ${campaignCopies(id)} copies of ${cardDef(id).name}.`);
  return out;
}

/** Whether a card can be in a deck in this mode (in Core, as its core version). */
export const legalIn = (mode: GameMode | undefined, id: string) => mode !== 'core' || inMode(cardIn(id, 'core'), 'core');

/**
 * Within a rift's galaxy: its race's own cards, whatever the run's mode [direction: an enemy there with no deck and no
 * hand; a Core run's rift had nothing of the Lost Race's it could field, stock or give]. The rift is that race's
 * galaxy: its defenders field their cards, its stations sell them, its rewards are them.
 */
const riftLegal = (s: CampaignState, id: string) => (riftRace(s) !== undefined && cardDef(id).race === riftRace(s)) || legalIn(s.mode, id);

/** Plain neutral cards legal in Core, to stand in for those that aren't in a Core run's decks. */
const CORE_FILL = ['coronal_lance', 'thermal_exchange', 'cryo_vault', 'gravity_sling', 'heat_sink', 'plasma_relay', 'deep_scanners', 'solar_battery', 'coolant_array', 'dreadnought'];

/** A deck for a Core run: any card Core has no place for swapped for a plain neutral one. */
function fitMode(s: CampaignState, deck: string[]): string[] {
  if (s.mode !== 'core') return deck;
  let k = 0;
  return deck.map((id) => (legalIn('core', id) ? id : CORE_FILL[k++ % CORE_FILL.length]));
}

const GUARD_NEUTRALS = ['coronal_lance', 'thermal_exchange', 'photon_drill', 'scatter_shot', 'plasma_relay', 'gravity_sling', 'nova_shell', 'cryo_vault', 'heat_sink', 'deflector_grid', 'deep_scanners', 'solar_mirror'];

/**
 * A race's plain 30-card deck, for those who defend without an army (neutral sentinels, and a system's own
 * guard): neutral pairs, a taste of the race's own, and its first general's Heroes. (Armies fight with 10.)
 */
export function starterDeck(race: number, mode: GameMode = 'lost'): string[] {
  const r = ((race % RACE_NAMES.length) + RACE_NAMES.length) % RACE_NAMES.length;
  // (In Core, the race's Core starter.)
  if (mode === 'core') return [...presetDeck(r, 'core').cards];
  const mine = CARDS.filter((c) => c.race === r && c.kind !== 'command' && c.rarity !== 'anomaly' && !c.fusion);
  // (Two of its attacks and a card that repairs, where the race has one.)
  const rest = mine.filter((c) => c.kind !== 'attack');
  const own = [...mine.filter((c) => c.kind === 'attack').slice(0, 2), ...[...rest.filter(repairs), ...rest].slice(0, 1)].map((c) => c.id);
  const [g0, g1] = GENERALS[r];
  const heroes = copyLimit(g0) > 1 ? [g0, g0, g1] : [g0, g1, GENERALS[r][2]];
  return [...GUARD_NEUTRALS.flatMap((id) => [id, id]), ...own, ...heroes];
}

export function createCampaign(setup: CampaignSetup): CampaignState {
  const run = setup.run ?? runBonuses(null);
  const s: CampaignState = {
    version: 6,
    universe: 0,
    universeStart: 1,
    collapseCol: 0,
    conquered: 0,
    petals: 0,
    petalsBanked: 0,
    xp: 0,
    xpBanked: 0,
    run,
    rngState: setup.seed | 0,
    uidCounter: 0,
    logSeq: 0,
    turn: 1,
    playerId: 'f1',
    factions: [],
    nodes: [],
    armies: [],
    story: { queue: [], told: [] },
    battle: null,
    conquest: null,
    cardRewards: [],
    phase: 'player',
    aiQueue: [],
    winner: null,
    log: [],
  };
  // (The Captain's run: no race of its own; a placeholder race for what is drawn by race, its rewards any core race's.)
  const human = !!setup.captain && isCaptain(setup.captain);
  const race = human ? 0 : (((setup.race ?? 0) % RACE_NAMES.length) + RACE_NAMES.length) % RACE_NAMES.length;
  // A core race's run is played in Core; a Lost Race's (unlocked with petals) in Lost Races. The Captain's, in Core.
  if (human || CORE_RACES.includes(race)) s.mode = 'core';
  const hero = human ? setup.captain! : setup.hero && GENERALS[race].includes(setup.hero) ? setup.hero : GENERALS[race][0];
  const ship = newShip();
  ship.hull = Math.min(CAMPAIGN.shipMax.hull, run.hull);
  ship.shields = Math.min(CAMPAIGN.shipMax.shields, run.shields);
  if (run.walls) ship.rooms.defence = ship.rooms.defence.map((d) => d + run.walls);
  const me: Faction = {
    id: 'f1',
    name: setup.playerName || 'Commander',
    isAI: false,
    race,
    ...(human ? { human: true } : {}),
    ...(human && run.affinity ? { affinity: run.affinity } : {}),
    materials: CAMPAIGN.startMaterials + run.materials,
    ship,
    hero,
    research: { done: [] },
    reserve: [],
    missions: [],
    missionDeck: shuffleInPlace(s, CAMPAIGN_MISSIONS.map((m) => m.id)),
    stats: emptyStats(),
    eliminated: false,
  };
  s.factions.push(me);
  // An Heirloom, from the skill tree: a Stellar emblem of the race's own to start with.
  if (run.heirloom) {
    const slots = RACE_SLOTS[race];
    me.relics = [makeRelic(`item${++s.uidCounter}`, slots[Math.floor(nextRandom(s) * slots.length)].kind, 'stellar', race, nextRandom(s), false)];
  }
  // The raiders: the last of peoples the collapse has already taken, roaming the strip (and hunting).
  s.factions.push({ id: 'lost', name: 'Raiders', isAI: true, race: 0, materials: 0, ship: newShip(), reserve: [], missions: [], missionDeck: [], stats: emptyStats(), eliminated: false, lost: true });
  buildUniverse(s, 1);
  const army = flagship(s, me.id)!;
  // Veterans: more of the race's own cards in the starting deck (the Captain's: more neutral ones); Requisition: cards picked to start with.
  const own = CARDS.filter((c) => (human ? c.race === undefined && !c.rarity : c.race === race) && c.kind !== 'command' && c.rarity !== 'anomaly' && !c.fusion && !c.spendAll && legalIn(s.mode, c.id) && !army.deck.includes(c.id));
  army.deck.push(...own.slice(0, run.cards).map((c) => c.id));
  // Cards bought into this race's starting deck with petals (as many copies as a deck may hold). (Not the Captain's: petals make the Captain.)
  if (!human) for (const id of run.deck ?? []) if (CARDS.some((c) => c.id === id) && army.deck.filter((x) => x === id).length < campaignCopies(id)) army.deck.push(id);
  // (Each Requisition: a pick of cards, the one chosen going straight into the deck.)
  for (let k = 0; k < run.picks; k++) s.cardRewards.push({ source: 'Requisition', options: randomCardChoices(s, me), toDeck: army.id });
  army.refit = false;
  tell(s, human ? captainIntroScene(me.id, army.general) : introScene(me.race, me.id, army.general));
  noticeStory(s);
  return s;
}

/** Turns of regional stability a universe starts with: fewer in each new universe (and more with the Anchored space perk). */
export function universeStability(s: CampaignState): number {
  // (A rift's galaxy never gives way: it is short, and hard enough.)
  if (s.rift) return 999;
  return Math.max(CAMPAIGN.stabilityMin, CAMPAIGN.stabilityTurns - CAMPAIGN.stabilityStep * (s.universe - 1)) + (s.run?.grace ?? 0);
}

/**
 * Where a system of a universe's map lies (column `c`, lane `l`, nudged by `dx`, `dy`) and how high: on a strip,
 * its middle line bending in a long slow curve and its lanes spreading apart and closing up again as it goes (so
 * there is room between them here and there); on a spiral arm, wound in round the wormhole at the galaxy's heart,
 * the wormhole at its middle. The land rolls in long hills, or climbs toward the wormhole.
 */
function mapPlacer(s: CampaignState, layout: MapLayout, terrain: MapTerrain): (c: number, l: number, dx?: number, dy?: number) => { x: number; y: number; h: number } {
  const L = CAMPAIGN.lanes, C = CAMPAIGN.columns, gap = CAMPAIGN.laneGap, mid = (L - 1) / 2;
  const W = CAMPAIGN.mapWidth, H = CAMPAIGN.mapHeight;
  const r = () => nextRandom(s);
  const bend = { a: 120 + r() * 260, f: 0.35 + r() * 0.4, p: r() * Math.PI * 2 };
  const spread = { a: 0.25 + r() * 0.3, f: 0.6 + r() * 0.7, p: r() * Math.PI * 2 };
  const hills = { a: 120 + r() * 120, f: 0.7 + r() * 0.5, p: r() * Math.PI * 2 };
  const height = (c: number) => (terrain === 'rolling' ? hills.a * Math.sin(c * hills.f + hills.p) : terrain === 'climb' ? (c / C) * 300 - 120 : 0);
  if (layout === 'spiral') {
    // Outer edge to heart: the radius shrinks column by column, each step about a column's width along the arm.
    const R0 = 1150, R1 = 520;
    const radius = (c: number) => R0 - ((R0 - R1) * Math.min(c, C - 1)) / (C - 1);
    const angle: number[] = [Math.PI];
    for (let c = 1; c <= C; c++) angle[c] = angle[c - 1] + CAMPAIGN.colGap / radius(c - 1);
    return (c, l, dx = 0, dy = 0) => {
      if (c >= C) return { x: W / 2, y: H / 2, h: height(C) };
      const rad = radius(c) + (l - mid) * gap * 0.75 + dy * 0.6;
      const a = angle[c] + dx / radius(c);
      return { x: W / 2 + Math.cos(a) * rad, y: H / 2 + Math.sin(a) * rad, h: height(c) };
    };
  }
  return (c, l, dx = 0, dy = 0) => {
    const centre = H / 2 + bend.a * Math.sin(c * bend.f + bend.p);
    const wide = Math.max(0.85, Math.min(1.6, 1.15 + spread.a * Math.sin(c * spread.f + spread.p)));
    return { x: CAMPAIGN.mapMargin + c * CAMPAIGN.colGap + dx, y: centre + (l - mid) * gap * wide + dy, h: height(c) };
  };
}

/**
 * A new universe: its galaxy, its strip of systems, the wormhole past its far end, its stations, all
 * tougher the further along the run is. The player's flagship arrives at a system of its own at the near end.
 */
export function buildUniverse(s: CampaignState, universe: number, layout?: MapLayout) {
  const me = campaignPlayer(s);
  const L = CAMPAIGN.lanes;
  const C = CAMPAIGN.columns;
  s.universe = universe;
  s.universeStart = s.turn;
  s.collapseCol = 0;
  s.conquered = 0;
  s.nodes = [];
  s.armies = s.armies.filter((a) => a.owner === me.id);
  // How hard a system is: by its third of the strip, and two steps more in every universe after the first.
  const lift = 2 * (universe - 1);
  const used = new Set<string>();
  const tints: MapPlanet['tint'][] = ['weapons', 'defences', 'economy', 'resources'];
  const jitter = (n: number) => Math.round((nextRandom(s) - 0.5) * 2 * n);
  const blank = (id: string, name: string, x: number, y: number, tier: number, c: number, l: number): CampaignNode => ({
    id,
    name,
    x,
    y,
    planets: Array.from({ length: 2 + randomInt(s, 3) }, (_, j) => ({ name: `${name} ${['I', 'II', 'III', 'IV'][j]}`, tint: tints[randomInt(s, tints.length)] })),
    owner: null,
    links: [],
    fortification: 0,
    damage: 0,
    garrison: [],
    hazard: [],
    // What taking it pays (once): more the harder it is.
    yield: { materials: 3 + randomInt(s, 3) + tier + Math.floor(tier / 2) },
    tier,
    col: c,
    lane: l,
  });
  // The lie of the map: the first universe is always a strip; after it, a strip or a spiral, never twice running.
  s.layout = layout ?? (universe === 1 ? 'strip' : nextRandom(s) < (s.layout === 'spiral' ? 0.25 : 0.55) ? 'spiral' : 'strip');
  const terrains: MapTerrain[] = ['flat', 'rolling', 'climb'];
  s.terrain = terrains[randomInt(s, terrains.length)];
  const place = mapPlacer(s, s.layout, s.terrain);
  // The flagship's arrival: one system alone at the near end, in the middle, with a route into every lane.
  const at0 = place(0, (L - 1) / 2);
  const home = blank('n0', nodeName(s, used), at0.x, at0.y, 0, 0, (L - 1) / 2);
  home.h = at0.h;
  s.nodes.push(home);
  // The lanes, from the second column to the last before the wormhole.
  const grid: CampaignNode[][] = [];
  for (let c = 1; c < C; c++) {
    grid[c] = [];
    for (let l = 0; l < L; l++) {
      const tier = (c <= 2 ? 0 : c <= 5 ? 1 : 2) + lift;
      const p = place(c, l, jitter(55), jitter(45));
      const n = blank(`n${s.nodes.length}`, nodeName(s, used), p.x, p.y, tier, c, l);
      n.h = p.h;
      grid[c][l] = n;
      s.nodes.push(n);
    }
  }
  const atHole = place(C, (L - 1) / 2);
  const at = (c: number, l: number) => grid[c][l];
  // The wormhole, past the far end, in the middle of the lanes: a Stellari bloom and its guardian.
  const hole: CampaignNode = {
    id: `n${s.nodes.length}`,
    name: 'Stellari Wormhole',
    x: atHole.x,
    y: atHole.y,
    h: atHole.h,
    planets: [],
    owner: null,
    links: [],
    fortification: 0,
    damage: 0,
    garrison: [],
    hazard: [],
    yield: { materials: 0 },
    tier: 3 + lift,
    col: C,
    lane: (L - 1) / 2,
    heart: true,
    stellaria: 1,
  };
  s.nodes.push(hole);
  const link = (a: CampaignNode, b: CampaignNode) => {
    if (a.links.includes(b.id)) return;
    a.links.push(b.id);
    b.links.push(a.id);
  };
  for (let l = 0; l < L; l++) link(home, at(1, l));
  // Lanes run the length of the strip; here and there two neighbouring lanes cross over (one way at a time, so
  // routes never cross), and now and then a rung joins them within a column.
  for (let c = 1; c < C; c++) {
    for (let l = 0; l < L; l++) {
      if (c + 1 < C) link(at(c, l), at(c + 1, l));
      else link(at(c, l), hole);
    }
    if (c + 1 >= C) continue;
    for (let l = 0; l + 1 < L; l++) {
      const r = nextRandom(s);
      if (r < 0.22) link(at(c, l), at(c + 1, l + 1));
      else if (r < 0.44) link(at(c, l + 1), at(c + 1, l));
      if (c > 1 && nextRandom(s) < 0.15) link(at(c, l), at(c, l + 1));
    }
  }
  home.owner = me.id;
  home.home = me.id;
  const army = flagship(s, me.id);
  if (army) {
    army.nodeId = home.id;
    army.moved = army.refit = false;
    army.steps = 0;
  } else raiseArmy(s, me, me.hero ?? GENERALS[me.race][0], home.id);
  // Stars of every kind among the ordinary yellow ones (never the arrival, nor the wormhole).
  const odds = CAMPAIGN.starOdds;
  const open = (n: CampaignNode) => !n.home && !n.heart;
  for (const n of s.nodes.filter(open)) {
    const r = nextRandom(s);
    const kind: StarType | undefined = r < odds.red ? 'red' : r < odds.red + odds.white ? 'white' : r < odds.red + odds.white + odds.brown ? 'brown' : r < odds.red + odds.white + odds.brown + odds.neutron ? 'neutron' : undefined;
    if (!kind) continue;
    n.star = kind;
    if (kind === 'red') n.yield.materials = Math.max(0, n.yield.materials - 1);
    if (kind === 'white') n.yield.materials += 2;
    if (kind === 'neutron') n.yield.materials += 3;
  }
  // The galaxy: never the same twice running.
  const kinds = GALAXY_KINDS.filter((k) => k !== s.galaxy);
  s.galaxy = kinds[randomInt(s, kinds.length)];
  // The wormhole's Lost Overlord: never the same twice running.
  const lords = OVERLORDS.filter((o) => o.id !== s.overlord);
  s.overlord = lords[randomInt(s, lords.length)].id;
  // Armouries and research stations along the strip; those deep in it are better stocked.
  const sites = shuffleInPlace(s, s.nodes.filter((n) => open(n) && (n.col ?? 0) >= 2 && (n.col ?? 0) <= C - 2));
  for (const n of sites.slice(0, CAMPAIGN.armories)) n.station = { kind: 'armory', cards: armoryStock(s, n) };
  const projects = new Set<string>(me.research?.done ?? []);
  for (const n of sites.slice(CAMPAIGN.armories, CAMPAIGN.armories + CAMPAIGN.researchStations)) {
    const options = pickResearch(s, n, projects);
    for (const id of options) projects.add(id);
    n.station = { kind: 'research', options };
  }
  // Worlds with something extra: materials, taken with the system.
  for (const [i, n] of sites.slice(CAMPAIGN.armories + CAMPAIGN.researchStations, CAMPAIGN.armories + CAMPAIGN.researchStations + CAMPAIGN.bonusPlanets).entries()) {
    n.bonus = { materials: 4 + n.tier + (i % 2) * 2 };
  }
  // Systems with nothing to fight, only something to find: a derelict, a depot, an archive.
  // Each by the odds of its star (STAR_FINDS).
  for (const n of s.nodes.filter((x) => open(x) && !x.station && !x.bonus && (x.col ?? 0) >= 1)) {
    const odds = STAR_FINDS[n.star ?? 'yellow'];
    if (nextRandom(s) >= odds.find) continue;
    const weights = Object.entries(odds.kinds) as [Cache['kind'], number][];
    let roll = nextRandom(s) * weights.reduce((sum, [, w]) => sum + w, 0);
    const kind = weights.find(([, w]) => (roll -= w) < 0)?.[0] ?? weights[0][0];
    n.cache = { kind, amount: kind === 'cards' ? 3 : 4 + 2 * n.tier };
  }
  placeChallenges(s);
  placeRivals(s);
  // Dreams of the Lost, unseen, in a few systems of any kind.
  for (const n of shuffleInPlace(s, s.nodes.filter((x) => !x.home && !x.heart && !x.challenge)).slice(0, DREAM_NODES)) n.dream = true;
  // Relic caches: now and then a neutral system's battlefield holds a sealed Reliquary Obelisk (one relic, now and
  // then two).
  for (const n of s.nodes.filter((x) => open(x) && !x.station && !x.cache && !x.challenge && (x.col ?? 0) >= 1)) {
    if (nextRandom(s) < CAMPAIGN.vaultChance) n.vault = nextRandom(s) < CAMPAIGN.vaultTwoChance ? 2 : 1;
  }
  clog(s, universe === 1 ? `The run begins. ${me.name} holds ${home.name}, at the near end of the strip.` : `${me.name} comes through into galaxy ${universe}, at ${home.name}.`);
  tell(s, wormholeSightedScene(universe));
}

// ---------------------------------------------------------------------------
// Rifts: a tear off the route into a Lost Race's galaxy (rifts.ts) [direction: called a rift, not a wormhole: the
// board's wormholes are the way on at each galaxy's end]
// ---------------------------------------------------------------------------

/** The Lost Race whose galaxy the run is in (undefined in an ordinary galaxy). */
export const riftRace = (s: CampaignState): number | undefined => (s.rift ? RIFTS[s.rift.kind].race : undefined);

/** Time Dense Space's rings, innermost first: how many stars each holds, and how far out it lies. */
const TIME_RINGS = [
  { n: 4, r: 420 },
  { n: 5, r: 720 },
  { n: 6, r: 1000 },
  { n: 7, r: 1270 },
];
/** The arrival's ring, outermost (one star). */
const TIME_ARRIVAL = { n: 1, r: 1500 };

/**
 * Where a star of Time Dense Space stands, its ring `turn` notches round: half a star's width a notch, the rings
 * turning alternately one way and the other, as gears do.
 */
function spunAt(ring: number, slot: number, turn: number): { x: number; y: number; a: number } {
  const R = ring > TIME_RINGS.length ? TIME_ARRIVAL : TIME_RINGS[ring - 1];
  const dir = ring % 2 ? -1 : 1;
  const a = (2 * Math.PI * slot) / R.n + ring * 0.9 + dir * turn * (Math.PI / R.n);
  return { x: CAMPAIGN.mapWidth / 2 + Math.cos(a) * R.r, y: CAMPAIGN.mapHeight / 2 + Math.sin(a) * R.r, a };
}

const centreAngle = (n: CampaignNode) => Math.atan2(n.y - CAMPAIGN.mapHeight / 2, n.x - CAMPAIGN.mapWidth / 2);
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * Time Dense Space turns as a combination lock [direction: the per-second spinning was too confusing, the galaxy's
 * shape made no sense with it (inward only, most of it out of reach); it turns only as the player moves, a notch a
 * jump; they can go round their ring as well as inward, never outward; routes inward open where stars line up; the
 * next notch is shown]: as the player's turn ends, every ring turns a notch but the one the flagship stands on.
 */
export function turnTime(s: CampaignState) {
  if (s.rift?.kind !== 'time') return;
  const ship = flagship(s, s.playerId);
  const on = ship ? s.nodes.find((n) => n.id === ship.nodeId)?.spinRing : undefined;
  const turns = { ...(s.ringSpins ?? {}) };
  for (let r = 1; r <= TIME_RINGS.length; r++) if (r !== on) turns[r] = (turns[r] ?? 0) + 1;
  s.ringSpins = turns;
  spinGalaxy(s);
}

/**
 * Lay Time Dense Space's stars where their rings stand (`turns`: each ring's notches, fractions mid-turn; by default
 * the state's own), and (unless `relink` is false) its routes: round each ring, star to star; inward, where a star
 * lines up with one of the next ring in (at least one route between each pair of rings, the best lined up, so the
 * way in is never shut); the arrival to the outer ring's nearest star; the innermost ring all to Aster.
 */
export function spinGalaxy(s: CampaignState, relink = true, turns?: Record<number, number>) {
  if (s.rift?.kind !== 'time') return;
  const ringed = s.nodes.filter((n) => n.spinRing !== undefined);
  // (A run saved while the stars turned on their own: each ring where its stars, on the whole, had got to.)
  if (ringed.some((n) => n.spinStep !== undefined)) {
    const was: Record<number, number> = {};
    for (let r = 1; r <= TIME_RINGS.length; r++) {
      const on = ringed.filter((n) => n.spinRing === r);
      was[r] = Math.round(on.reduce((t, n) => t + (n.spinStep ?? 0), 0) / Math.max(1, on.length));
    }
    for (const n of ringed) delete n.spinStep;
    s.ringSpins = was;
  }
  const at = turns ?? s.ringSpins ?? {};
  for (const n of ringed) {
    const p = spunAt(n.spinRing!, n.spinSlot ?? 0, n.spinRing! > TIME_RINGS.length ? 0 : at[n.spinRing!] ?? 0);
    n.x = p.x;
    n.y = p.y;
  }
  if (!relink) return;
  const heart = s.nodes.find((n) => n.heart);
  for (const n of s.nodes) n.links = [];
  const link = (a: CampaignNode, b: CampaignNode) => {
    if (!a.links.includes(b.id)) a.links.push(b.id);
    if (!b.links.includes(a.id)) b.links.push(a.id);
  };
  const ring = (r: number) => ringed.filter((n) => n.spinRing === r).sort((a, b) => (a.spinSlot ?? 0) - (b.spinSlot ?? 0));
  // Round each ring: each star to the next.
  for (let r = 1; r <= TIME_RINGS.length; r++) {
    const stars = ring(r);
    if (stars.length > 1) stars.forEach((n, i) => link(n, stars[(i + 1) % stars.length]));
  }
  // The innermost ring, all to Aster.
  if (heart) for (const n of ring(1)) link(n, heart);
  // The arrival, to the outer ring's star nearest it.
  for (const n of ring(TIME_RINGS.length + 1)) {
    const outer = ring(TIME_RINGS.length);
    const near = outer.reduce<CampaignNode | null>((best, m) => (!best || angleGap(centreAngle(n), centreAngle(m)) < angleGap(centreAngle(n), centreAngle(best)) ? m : best), null);
    if (near) link(n, near);
  }
  // Inward, where stars line up (within a quarter of a star's spacing on the inner ring); never none.
  for (let r = 2; r <= TIME_RINGS.length; r++) {
    const outer = ring(r), inner = ring(r - 1);
    const within = Math.PI / TIME_RINGS[r - 2].n / 2;
    let best: [CampaignNode, CampaignNode, number] | null = null;
    let any = false;
    for (const o of outer)
      for (const i of inner) {
        const g = angleGap(centreAngle(o), centreAngle(i));
        if (g <= within) {
          link(o, i);
          any = true;
        }
        if (!best || g < best[2]) best = [o, i, g];
      }
    if (!any && best) link(best[0], best[1]);
  }
}

/**
 * The next notch, seen ahead: if the flagship went to `toId`, the stars of the next ring in that it would then
 * reach, and where they will stand (for the map to show, dashed, before the move is made).
 */
export function timePreview(s: CampaignState, toId: string): { id: string; x: number; y: number }[] {
  if (s.rift?.kind !== 'time') return [];
  const ahead = structuredClone(s);
  const ship = flagship(ahead, ahead.playerId);
  const to = ahead.nodes.find((n) => n.id === toId);
  if (!ship || !to || to.spinRing === undefined) return [];
  ship.nodeId = toId;
  turnTime(ahead);
  const there = ahead.nodes.find((n) => n.id === toId)!;
  return there.links.map((id) => ahead.nodes.find((n) => n.id === id)!).filter((n) => (n.spinRing ?? 0) < (there.spinRing ?? 0) && !n.heart).map((n) => ({ id: n.id, x: n.x, y: n.y }));
}

/** A blank system for a rift's galaxy. */
function riftNode(s: CampaignState, used: Set<string>, x: number, y: number, tier: number, col: number, lane: number): CampaignNode {
  const name = nodeName(s, used);
  const tints: MapPlanet['tint'][] = ['weapons', 'defences', 'economy', 'resources'];
  return {
    id: `n${s.nodes.length}`,
    name,
    x,
    y,
    planets: Array.from({ length: 2 + randomInt(s, 2) }, (_, j) => ({ name: `${name} ${['I', 'II', 'III'][j]}`, tint: tints[randomInt(s, tints.length)] })),
    owner: null,
    links: [],
    fortification: 0,
    damage: 0,
    garrison: [],
    hazard: [],
    yield: { materials: 5 + randomInt(s, 4) + tier },
    tier,
    col,
    lane,
  };
}

/**
 * Through a rift, into a Lost Race's galaxy [direction: shorter than a normal galaxy, about 5 jumps; extremely
 * challenging]: its ruler at the end, its stations stocked with the race's own, every fight against the race at
 * its strongest. The Dark Galaxy is a short strip, two lanes wide, in the dark; Time Dense Space a disc of turning
 * rings round its heart.
 */
function buildRift(s: CampaignState, kind: RiftKind) {
  const me = campaignPlayer(s);
  s.rift = { kind };
  s.universeStart = s.turn;
  s.collapseCol = 0;
  s.conquered = 0;
  s.nodes = [];
  s.armies = s.armies.filter((a) => a.owner === me.id);
  s.galaxy = undefined;
  s.terrain = 'flat';
  s.spin = 0;
  s.ringSpins = {};
  const used = new Set<string>();
  // (Past anything the run's own galaxy holds at its far end.)
  const tier = 2 * (s.universe - 1) + 3;
  const W = CAMPAIGN.mapWidth, H = CAMPAIGN.mapHeight;
  let home: CampaignNode;
  const heart: CampaignNode = { ...riftNode(s, used, W / 2, H / 2, tier + 1, RIFT_JUMPS, 0), name: cardDef(RIFTS[kind].ruler).name, planets: [], yield: { materials: 0 }, heart: true };
  if (kind === 'dark') {
    s.layout = 'strip';
    // A short strip in the dark: the arrival, four columns of two, and Nyxara past the end.
    const L = 2, C = RIFT_JUMPS;
    const place = (c: number, l: number) => ({ x: CAMPAIGN.mapMargin + 600 + c * CAMPAIGN.colGap, y: H / 2 + (l - (L - 1) / 2) * CAMPAIGN.laneGap * 1.2 + Math.round((nextRandom(s) - 0.5) * 80) });
    const p0 = place(0, (L - 1) / 2);
    home = riftNode(s, used, p0.x, p0.y, tier, 0, 0);
    s.nodes.push(home);
    const grid: CampaignNode[][] = [];
    for (let c = 1; c < C; c++) {
      grid[c] = [];
      for (let l = 0; l < L; l++) {
        const p = place(c, l);
        const n = riftNode(s, used, p.x, p.y, tier, c, l);
        grid[c][l] = n;
        s.nodes.push(n);
      }
    }
    const ph = place(C, (L - 1) / 2);
    Object.assign(heart, { id: `n${s.nodes.length}`, x: ph.x, y: ph.y, col: C });
    s.nodes.push(heart);
    const link = (a: CampaignNode, b: CampaignNode) => {
      a.links.push(b.id);
      b.links.push(a.id);
    };
    for (let l = 0; l < L; l++) link(home, grid[1][l]);
    for (let c = 1; c < C; c++) {
      for (let l = 0; l < L; l++) link(grid[c][l], c + 1 < C ? grid[c + 1][l] : heart);
      if (c + 1 < C) link(grid[c][nextRandom(s) < 0.5 ? 0 : 1], grid[c + 1][nextRandom(s) < 0.5 ? 0 : 1]);
    }
    for (const n of s.nodes) n.links = [...new Set(n.links)];
    // A Dark Prophet, now and then, somewhere along the way [direction: a chance to run into a Dark Prophet].
    if (nextRandom(s) < 0.6) grid[1 + randomInt(s, C - 2)][randomInt(s, L)].prophet = true;
  } else {
    s.layout = 'ring';
    // Rings round Aster, the arrival on the outermost: inward a ring a jump.
    heart.x = W / 2;
    heart.y = H / 2;
    heart.col = RIFT_JUMPS;
    s.nodes.push(heart);
    const p0 = spunAt(TIME_RINGS.length + 1, 0, 0);
    home = { ...riftNode(s, used, p0.x, p0.y, tier, 0, 0), spinRing: TIME_RINGS.length + 1, spinSlot: 0 };
    s.nodes.push(home);
    TIME_RINGS.forEach((R, i) => {
      const ring = i + 1;
      for (let j = 0; j < R.n; j++) {
        const p = spunAt(ring, j, 0);
        s.nodes.push({ ...riftNode(s, used, p.x, p.y, tier, RIFT_JUMPS - ring, j), spinRing: ring, spinSlot: j });
      }
    });
  }
  home.owner = me.id;
  home.home = me.id;
  home.yield = { materials: 0 };
  const army = flagship(s, me.id);
  if (army) {
    army.nodeId = home.id;
    army.moved = army.refit = false;
    army.steps = 0;
  } else raiseArmy(s, me, me.hero ?? GENERALS[me.race][0], home.id);
  // A space station and a research station of the race's own, along the way.
  const open = (n: CampaignNode) => !n.home && !n.heart && !n.prophet;
  const mid = shuffleInPlace(s, s.nodes.filter((n) => open(n) && (n.col ?? 0) >= 1 && (n.col ?? 0) <= RIFT_JUMPS - 2));
  if (mid[0]) mid[0].station = { kind: 'armory', cards: armoryStock(s, mid[0]) };
  if (mid[1]) mid[1].station = { kind: 'research', options: pickResearch(s, mid[1], new Set(me.research?.done ?? [])) };
  spinGalaxy(s);
  clog(s, `${me.name} comes through the rift into ${RIFTS[kind].name}. ${RIFTS[kind].text}`);
}

/** Into a rift: there is no way back. */
function enterRift(s: CampaignState, army: Army, target: CampaignNode) {
  const kind = target.challenge!.rift ?? 'dark';
  target.challenge!.done = 'won';
  army.moved = true;
  clog(s, `${armyLeader(army)} enters the rift at ${target.name}.`, target.id, army.owner);
  buildRift(s, kind);
}

/**
 * The Dark Galaxy: the stars behind the flagship go out [direction: stars players leave vanish into the darkness
 * behind them, so they cannot double back].
 */
function darkenBehind(s: CampaignState) {
  if (s.rift?.kind !== 'dark') return;
  const ship = flagship(s, s.playerId);
  if (!ship) return;
  const col = nodeById(s, ship.nodeId).col ?? 0;
  for (const n of s.nodes) if ((n.col ?? 0) < col && n.id !== ship.nodeId) n.vanished = true;
}

/** A Dark Prophet's offer: three of the flagship's cards, each with a Nyxari mark it can take, chosen at random. */
function prophetOffers(s: CampaignState, army: Army): { card: string; mark: NyxMark }[] {
  const cards = shuffleInPlace(s, [...new Set(army.deck)]).filter((id) => marksFor(cardDef(id)).length);
  return cards.slice(0, 3).map((card) => {
    const marks = marksFor(cardDef(card));
    return { card, mark: marks[randomInt(s, marks.length)] };
  });
}

/** Aster's gift: the three Seren emblems, one to take. */
function serenEmblems(s: CampaignState): Relic[] {
  const names: Record<string, string> = { paradise: 'Paradise Seed', orbitShift: "Tidecaller's Astrolabe", starsworn: 'Starsworn Circlet' };
  return SEREN_POWERS.map((power) => {
    const n = RELIC_POWERS[power].amounts[2];
    return { id: `item${++s.uidCounter}`, name: names[power] ?? power, slot: 'star' as SlotKind, rarity: 'anomaly' as ItemRarity, boons: [], power, n, text: RELIC_POWERS[power].text(n) };
  });
}

/** The cards a rift's sentinels fight with: the race's own, the heavier the deeper. */
function riftDeck(s: CampaignState, n: CampaignNode): string[] {
  const race = riftRace(s)!;
  const pool = shuffleInPlace(s, CARDS.filter((c) => c.race === race && c.kind !== 'command' && c.rarity !== 'enigma' && riftLegal(s, c.id)).map((c) => c.id));
  const size = n.heart ? 20 : Math.min(20, CAMPAIGN.enemyDeck + 6);
  const deck: string[] = [];
  for (let i = 0; deck.length < size && i < pool.length * 2; i++) {
    const id = pool[i % pool.length];
    if (deck.filter((x) => x === id).length < copyLimit(id)) deck.push(id);
  }
  return deck;
}

// ---------------------------------------------------------------------------
// Power Struggles: while the flagship's sun runs overheated, a hero of its own race may come for its command
// [direction: each jump while overheated has a chance; one of the other two heroes of the player's race attacks,
// already in play, telling them they are not fit to lead; won, that hero joins the deck]
// ---------------------------------------------------------------------------

/** The chance, each jump the flagship makes with its sun overheated, of a Power Struggle. */
export const STRUGGLE_CHANCE = 0.3;

/** The flagship's sun's max health in battle (the card game's, with its upgrades). */
export function flagshipMaxHealth(s: CampaignState, army: Army): number {
  return BALANCE.supernovaAt + (armyBonus(s, army).mods.maxHealthDelta ?? 0) + (flagshipSetup(s, army).hull.maxHealthDelta ?? 0);
}

/** Whether the flagship's sun runs overheated (at half its max health or hotter), as it carries its heat between battles. */
export function flagshipOverheated(s: CampaignState, army: Army): boolean {
  return army.damage * 2 >= flagshipMaxHealth(s, army);
}

/** A hero of the player's race who could come for the command: not the one leading, nor one already aboard. */
export function struggleRival(s: CampaignState, army: Army): string | null {
  const f = factionById(s, army.owner);
  // (The Captain's rivals: any core race's heroes, not aboard, not slain, not already waiting on the map.)
  const waiting = new Set(s.nodes.map((n) => n.rival).filter(Boolean));
  const pool = f.human ? CORE_RACES.flatMap((r) => GENERALS[r]) : (GENERALS[f.race] ?? []);
  const free = pool.filter((h) => h !== army.general && !army.deck.includes(h) && !f.reserve.includes(h) && !s.slain?.includes(h) && !waiting.has(h) && s.beaten?.hero !== h);
  return free.length ? free[randomInt(s, free.length)] : null;
}

/** Rival heroes waiting on each galaxy's map (the Captain's runs), and the chance of one ambushing a jump. */
export const RIVAL_NODES = 2;
export const AMBUSH_CHANCE = 0.05;

/** A rival hero waiting where the flagship has come: their Power Struggle begins. */
function rivalHere(s: CampaignState, army: Army) {
  if (army.owner !== s.playerId || army.lost || s.struggle || s.beaten) return;
  const n = nodeById(s, army.nodeId);
  if (!n.rival) return;
  s.struggle = { nodeId: n.id, hero: n.rival };
  n.rival = undefined;
}

/** Rival heroes set on a galaxy's map for the Captain (none in a Lost Race's galaxy: its own ruler waits there). */
function placeRivals(s: CampaignState) {
  const me = campaignPlayer(s);
  const army = flagship(s, me.id);
  if (!me.human || !army || s.rift) return;
  const open = s.nodes.filter((n) => !n.home && !n.heart && !n.challenge && !n.station && !n.prophet && (n.col ?? 0) >= 2);
  for (const n of shuffleInPlace(s, open).slice(0, RIVAL_NODES)) {
    const hero = struggleRival(s, army);
    if (hero) n.rival = hero;
  }
}

/** The hero's words, coming for the command. */
export const struggleLine = (hero: string, human = false) =>
  human ? (CAPTAIN_TAUNTS[GENERALS.findIndex((g) => g.includes(hero))] ?? 'That ship is wasted on a human. I am taking it.') : (STRUGGLE_LINES[hero] ?? 'Your star is failing, and so are you. You are not fit to lead.');
/** What a rival hero says, coming for the Captain's ship, by race. */
const CAPTAIN_TAUNTS = [
  'A human, flying a ship like that, this close to the Heart? The light deserves better. I am taking her.',
  'Your ship runs hot and stupid, human. In my hands she will burn true. Stand aside, or burn with her.',
  'The tide has carried you far enough, little human. Your ship is mine now.',
  'Such a fine hull, and only one of you to fill it. We will take it, and grow.',
];

/** A Power Struggle faced: the rival hero's side, its hero in play from the start, fought where the flagship stands. */
function startStruggle(s: CampaignState) {
  const p = s.struggle!;
  s.struggle = undefined;
  const f = campaignPlayer(s);
  const army = flagship(s, f.id);
  if (!army) return;
  const n = nodeById(s, p.nodeId);
  const [me] = battleSetup(s, army, { ...n, owner: null, station: undefined, vault: undefined, garrison: [], fortification: 0, damage: 0, star: undefined });
  const rival: PlayerSetup = {
    name: cardDef(p.hero).name,
    isAI: true,
    deck: stationDeck(s, { ...n, heart: false, tier: Math.max(n.tier, 1) }, f.race).filter((id) => !(GENERALS[f.race] ?? []).includes(id)),
    hero: p.hero,
    heroStats: { attack: CAMPAIGN.heroAttack, defence: CAMPAIGN.heroDefence },
    tableau: [p.hero],
    rooms: stationRooms({ ...n, tier: Math.max(n.tier, 2) }),
    // (A rival worth the name: a sun at least as big as the strip's middle's.)
    modifiers: sunBase({ ...n, tier: Math.max(n.tier, 2) }),
  };
  const game = createGame({ seed: Math.floor(nextRandom(s) * 2 ** 31), players: [me, rival], campaign: true, mode: s.mode });
  clog(s, `${cardDef(p.hero).name} comes for ${f.name}'s command.`, n.id, f.id);
  s.battle = { attacker: f.id, defender: null, fromId: n.id, nodeId: n.id, armyId: army.id, defenderArmyId: null, game, struggle: { hero: p.hero, damage: army.damage } };
}

/** A Power Struggle over. Won: the rival hero joins the deck. Lost: the run is over. */
function resolveStruggle(s: CampaignState, game: GameState) {
  const b = s.battle!;
  s.battle = null;
  const f = factionById(s, b.attacker);
  const army = s.armies.find((a) => a.id === b.armyId);
  const hero = b.struggle!.hero;
  const won = !isDraw(game) && game.winnerId === game.players[0].id;
  gainXp(s, won ? CAMPAIGN.xpChallenge : CAMPAIGN.xpBattleLost);
  // Lost: the command is lost, and the run with it [direction: losing a Power Struggle ends your run].
  if (!won) {
    clog(s, `${cardDef(hero).name} takes the command. ${f.name}'s run is over.`, b.nodeId, f.id);
    playerFalls(s);
    return;
  }
  if (army) army.damage = Math.max(BALANCE.minHeat, game.players[0].heat);
  // The Captain decides their fate [direction: after winning one the player can choose to recruit the hero, or slay
  // them for a significant amount of loot].
  if (f.human) {
    s.beaten = { nodeId: b.nodeId, hero };
    clog(s, `${cardDef(hero).name} is beaten, and kneels before the Captain.`, b.nodeId, f.id);
    return;
  }
  if (army) army.deck.push(hero);
  else f.reserve.push(hero);
  clog(s, `${cardDef(hero).name} is beaten, and bends the knee: they join ${f.name}'s flagship.`, b.nodeId, f.id);
}

/** What slaying a beaten hero pays: materials, petals and a pick of their race's rare cards (an emblem now and then). */
export const SLAY_LOOT = { materials: 10, perGalaxy: 4, petals: 2, cards: 3 };

/** The Captain decides a beaten hero's fate: recruited, they join the deck; slain, their spoils are the Captain's. */
function decideBeaten(s: CampaignState, recruit: boolean) {
  const p = s.beaten!;
  s.beaten = undefined;
  const f = campaignPlayer(s);
  const army = flagship(s, f.id);
  const name = cardDef(p.hero).name;
  if (recruit) {
    if (army) army.deck.push(p.hero);
    else f.reserve.push(p.hero);
    clog(s, `${name} joins the Captain's ship.`, p.nodeId, f.id);
    return;
  }
  (s.slain ??= []).push(p.hero);
  const materials = SLAY_LOOT.materials + SLAY_LOOT.perGalaxy * (s.universe - 1);
  f.materials += materials;
  s.petals += SLAY_LOOT.petals;
  const race = cardDef(p.hero).race;
  const rares = shuffleInPlace(s, CARDS.filter((c) => c.race === race && c.kind !== 'command' && (c.rarity === 'stellar' || c.rarity === 'anomaly') && !c.fusion && legalIn(s.mode, c.id)).map((c) => c.id)).slice(0, SLAY_LOOT.cards);
  if (rares.length) s.cardRewards.push({ source: `${name}'s hoard`, options: rares, ...(army ? { toDeck: army.id } : {}) });
  clog(s, `${name} is slain. The Captain takes their hoard: ${materials} materials and ${SLAY_LOOT.petals} petals.`, p.nodeId, f.id);
}

// ---------------------------------------------------------------------------
// Dreams of the Lost: a few systems hold a dream, unseen; the flagship drifts into it once it stands there. A dream is
// a puzzle (dreams-data.ts, made by scripts/dreams-gen.ts): a set position, as another race than the player's, to win
// before the day ends or to live through the rival's next. Harder with every wormhole; solved, it pays petals and a
// pick of rare cards (anomalies too, more often deeper into the run).
// ---------------------------------------------------------------------------

/** Dreams hidden in each galaxy. */
export const DREAM_NODES = 2;

/** A dream's difficulty: a step with each wormhole passed, up to the hardest. */
export const dreamTier = (s: CampaignState) => Math.min(4, s.universe);

/** The chance a dream's card reward is an Anomaly: none in the first two galaxies, then 10% more, compounding, each. */
export const dreamAnomalyChance = (universe: number) => (universe <= 2 ? 0 : 1 - Math.pow(0.9, universe - 2));

/**
 * Enigmas [direction: findable only once the chance of an Anomaly is very high, and even then very small; a little
 * better from the harder events: high dreams, Overlords, rifts]. None until the galaxy where an Anomaly is more
 * likely than not (dreamAnomalyChance past a half: the ninth); there, 1% a reward, half a point more each galaxy
 * after, to 4% at most; three times that from a hard event.
 */
export const ENIGMA_FROM = (() => {
  let u = 1;
  while (dreamAnomalyChance(u) < 0.5) u++;
  return u;
})();
export function enigmaChance(universe: number, hard = false): number {
  if (universe < ENIGMA_FROM) return 0;
  const base = Math.min(0.04, 0.01 + 0.005 * (universe - ENIGMA_FROM));
  return hard ? base * 3 : base;
}

/** A reward's cards, one perhaps swapped for an Enigma the player doesn't hold yet (by enigmaChance). */
function withEnigma(s: CampaignState, options: string[], hard: boolean): string[] {
  const chance = enigmaChance(s.universe, hard);
  if (!chance || !options.length || nextRandom(s) >= chance) return options;
  const f = campaignPlayer(s);
  const held = new Set([...f.reserve, ...s.armies.filter((a) => a.owner === f.id).flatMap((a) => a.deck)]);
  const free = ENIGMA_CARDS.map((c) => c.id).filter((id) => !held.has(id));
  if (!free.length) return options;
  const id = free[randomInt(s, free.length)];
  clog(s, `Something impossible glimmers among the spoils: ${cardDef(id).name}.`, undefined, f.id);
  return [...options.slice(0, options.length - 1), id];
}

/** A dream for the player: of this galaxy's tier (or the nearest below it), never as the player's own race. */
function pickDream(s: CampaignState): string | null {
  const race = campaignPlayer(s).race;
  for (let t = dreamTier(s); t >= 1; t--) {
    const fits = DREAMS.filter((d) => d.tier === t && d.race !== race);
    if (fits.length) return fits[randomInt(s, fits.length)].id;
  }
  return null;
}

/** The flagship stands somewhere: a dream there, unseen, takes it. */
function dreamHere(s: CampaignState, army: Army) {
  if (army.owner !== s.playerId || army.lost || s.dream) return;
  const n = nodeById(s, army.nodeId);
  if (!n.dream) return;
  n.dream = false;
  const id = pickDream(s);
  if (id) s.dream = { nodeId: n.id, id };
}

function startDream(s: CampaignState) {
  const p = s.dream!;
  s.dream = undefined;
  const f = campaignPlayer(s);
  const army = flagship(s, f.id);
  const spec = DREAMS.find((d) => d.id === p.id);
  if (!army || !spec) return;
  const game = createDream(spec, { seed: Math.floor(nextRandom(s) * 2 ** 31), name: `${f.name} (dreaming)`, foeName: 'The Dream', mode: s.mode });
  clog(s, `${f.name} drifts into a sorrowful slumber.`, p.nodeId, f.id);
  s.battle = { attacker: f.id, defender: null, fromId: p.nodeId, nodeId: p.nodeId, armyId: army.id, defenderArmyId: null, game, dream: { id: spec.id, damage: army.damage } };
}

/** The cards a solved dream offers: rare or better, an Anomaly by the galaxy's chance (an Enigma, rarely: likelier from a deep dream). */
function dreamCards(s: CampaignState, tier = 1): string[] {
  const f = campaignPlayer(s);
  const of = (r: string) => shuffleInPlace(s, CARDS.filter((c) => (c.rarity ?? 'dwarf') === r && c.kind !== 'command' && c.kind !== 'global' && !c.fusion && rewardRace(f, c.race) && legalIn(s.mode, c.id)).map((c) => c.id));
  const stellar = of('stellar'), anomaly = of('anomaly');
  const out: string[] = [];
  while (out.length < CAMPAIGN.cardChoices + (s.run?.choices ?? 0)) {
    const pool = nextRandom(s) < dreamAnomalyChance(s.universe) && anomaly.length ? anomaly : stellar;
    const id = pool.shift();
    if (!id) break;
    out.push(id);
  }
  return withEnigma(s, out, tier >= 3);
}

/** A dream over: solved, petals and cards; not, nothing lost (the sun as it was). */
function resolveDream(s: CampaignState, game: GameState) {
  const b = s.battle!;
  s.battle = null;
  const f = factionById(s, b.attacker);
  const army = s.armies.find((a) => a.id === b.armyId);
  if (army) army.damage = b.dream!.damage;
  const won = !isDraw(game) && game.winnerId === game.players[0].id;
  if (!won) {
    clog(s, `${f.name} wakes, the dream unsolved.`, b.nodeId, f.id);
    return;
  }
  const tier = DREAMS.find((d) => d.id === b.dream!.id)?.tier ?? 1;
  const petals = 2 + 2 * tier;
  s.petals += petals;
  gainXp(s, CAMPAIGN.xpChallenge);
  clog(s, `${f.name} wakes from the dream with ${petals} Stellari petals.`, b.nodeId, f.id);
  const options = dreamCards(s, tier);
  if (options.length) s.cardRewards.push({ source: 'The Dreams of the Lost', options, ...(army ? { toDeck: army.id } : {}), take: 'dreams up' });
}

/** A new army, led by `general`, standing in `nodeId`. */
function raiseArmy(s: CampaignState, f: Faction, general: string, nodeId: string): Army {
  // A new army can be refitted on the turn it is raised, but marches from the next.
  const army: Army = { id: `army${++s.uidCounter}`, owner: f.id, general, nodeId, deck: f.human ? captainDeck(general) : armyDeck(f.race, general, s.mode), damage: 0, moved: false };
  s.armies.push(army);
  return army;
}

/** Queue a story scene for the player (each moment is told once). */
function tell(s: CampaignState, scene: StoryScene) {
  if (s.story.told.includes(scene.id)) return;
  s.story.told.push(scene.id);
  s.story.queue.push(scene);
}

/** Moments the player has just come upon: rivals met, a bloom or the Heart in sight. */
function noticeStory(s: CampaignState) {
  const me = campaignPlayer(s);
  if (me.eliminated) return;
  const seen = visibleNodes(s, me.id);
  const myGeneral = armiesOf(s, me.id)[0]?.general ?? GENERALS[me.race][0];
  for (const id of seen) {
    const n = nodeById(s, id);
    if ((n.stellaria ?? 0) > 0) tell(s, stellariaSightedScene());
    if (n.heart) tell(s, heartSightedScene());
    const lostHere = armyAt(s, id)?.lost;
    if (lostHere) tell(s, lostSightedScene(lostHere));
    const rivalId = n.owner && n.owner !== me.id ? n.owner : armyAt(s, id)?.owner !== me.id ? armyAt(s, id)?.owner : undefined;
    if (rivalId && rivalId !== 'lost' && !s.story.told.includes(`contact:${rivalId}`)) {
      const rival = factionById(s, rivalId);
      const rivalGeneral = armiesOf(s, rival.id)[0]?.general ?? GENERALS[rival.race][0];
      tell(s, contactScene(rival.race, rivalGeneral, rival.id, myGeneral, me.id));
    }
  }
}

function hops(s: CampaignState, from: string, to: string): number {
  const seen = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) return seen.get(id)!;
    for (const next of nodeById(s, id).links) {
      if (!seen.has(next) && !nodeById(s, next).collapsed) {
        seen.set(next, seen.get(id)! + 1);
        queue.push(next);
      }
    }
  }
  return Infinity;
}

function clog(s: CampaignState, text: string, at?: string | string[], who?: string) {
  s.logSeq += 1;
  s.log.push({ seq: s.logSeq, turn: s.turn, text, ...(at ? { at: Array.isArray(at) ? at : [at] } : {}), ...(who ? { who } : {}) });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

/**
 * Cards a faction can be offered: its own race's cards (twice as often), neutral cards, globals and the
 * fine-tuned Command cards (a deck starts with two of its race's first leader); Anomalies are rarest.
 */
/** A rift's galaxy: rewards are its race's cards alone [direction: all rewards exclusively Nyxari (Seren) cards]. */
function riftPool(s: CampaignState): string[] | null {
  const race = riftRace(s);
  if (race === undefined) return null;
  return CARDS.filter((c) => c.race === race && c.kind !== 'command' && riftLegal(s, c.id)).flatMap((c) => Array(offerWeight(c.rarity ?? 'dwarf', s.universe + 2)).fill(c.id) as string[]);
}

/** Whether a card is one a faction's rewards may hold: its own race's or a neutral one (the Captain's: any core race's). */
export function rewardRace(f: Faction, race: number | undefined): boolean {
  if (race === undefined) return true;
  return f.human ? CORE_RACES.includes(race) : race === f.race;
}

/**
 * How much more often a race's cards come up among a faction's rewards: its own race twice as often; the Captain's,
 * as its Affinities lean them (the skill tree: a big lean to one race, a smaller one to another).
 */
export function raceWeight(f: Faction, race: number | undefined): number {
  if (race === undefined) return 1;
  if (!f.human) return race === f.race ? 2 : 1;
  const a = f.affinity;
  return 1 + (a && race === a.primary ? a.primaryBoost : 0) + (a && race === a.secondary ? a.secondaryBoost : 0);
}

function offerPool(f: Faction, mode?: GameMode, universe = 1): string[] {
  // (Generals are recruited, not bought: no Hero cards of the race's own; the Captain's heroes come only from Power Struggles.)
  const hero = (c: (typeof CARDS)[number]) => c.kind === 'command' && (f.human || GENERALS[f.race]?.includes(c.id));
  return CARDS.filter((c) => !hero(c) && rewardRace(f, c.race) && legalIn(mode, c.id)).flatMap((c) => {
    const n = offerWeight(c.rarity ?? 'dwarf', universe) * raceWeight(f, c.race);
    return Array(Math.max(1, Math.round(n))).fill(c.id) as string[];
  });
}

/**
 * How often a card of a rarity turns up among rewards, in a universe: through every wormhole the rarer cards come
 * a little more often (no promises: only the odds move).
 */
export function offerWeight(rarity: keyof typeof OFFER_WEIGHT, universe: number): number {
  const on = Math.max(0, universe - 1);
  return OFFER_WEIGHT[rarity] * 2 + (rarity === 'stellar' ? on : rarity === 'anomaly' ? Math.round(on * 0.6) : 0);
}

/** Cards an armoury can stock: any card but Heroes, globals and those made in play. */
const STOCK = CARDS.filter((c) => c.kind !== 'command' && c.kind !== 'global' && !c.fusion);

/**
 * An armoury's stock: CAMPAIGN.armoryStock different cards, each sold once. Mostly dwarf cards, with a fair
 * chance of a rare (Stellar) or Anomaly card among them; now and then nothing but dwarfs. Deep in the strip
 * the odds are better, and there may be two.
 */
function armoryStock(s: CampaignState, n: CampaignNode): string[] {
  const near = deepIn(s, n);
  // (A rift's galaxy: its race's cards alone.)
  const race = riftRace(s);
  const of = (r: ItemRarity) => shuffleInPlace(s, STOCK.filter((c) => (c.rarity ?? 'dwarf') === r && riftLegal(s, c.id) && (race === undefined || c.race === race)).map((c) => c.id));
  const dwarfs = of('dwarf');
  const stellar = of('stellar');
  const anomaly = of('anomaly');
  const rares: string[] = [];
  const plain = nextRandom(s) < (near ? 0.1 : 0.25);
  if (!plain) {
    const chances = near ? [0.95, 0.45] : [0.6, 0.1];
    for (const c of chances) if (nextRandom(s) < c) rares.push((nextRandom(s) < (near ? 0.45 : 0.2) ? anomaly : stellar).shift()!);
  }
  // (A Quartermaster, from the skill tree: more on every shelf.)
  // (A rift's race may have no rare of a kind left to give: what there is.)
  const got = rares.filter(Boolean);
  return shuffleInPlace(s, [...got, ...dwarfs.slice(0, CAMPAIGN.armoryStock + (s.run?.stock ?? 0) - got.length)]);
}

/**
 * A research station's upgrades to pick from: early ones, or (deep in the strip) deeper ones, none already taken or
 * offered elsewhere while they last (topped up from the rest when they run short).
 */
function pickResearch(s: CampaignState, n: CampaignNode, taken: Set<string>): string[] {
  const near = deepIn(s, n);
  // (A rift's galaxy offers its race's own upgrades; nowhere else does.)
  const race = riftRace(s);
  const free = RESEARCH.filter((r) => !taken.has(r.id) && !RETIRED_RESEARCH.has(r.id) && r.race === race);
  const fits = shuffleInPlace(s, free.filter((r) => (near ? r.tier >= 2 : r.tier <= 2)));
  const rest = shuffleInPlace(s, free.filter((r) => !fits.includes(r)));
  return [...fits, ...rest].slice(0, CAMPAIGN.researchOptions).map((r) => r.id);
}

/** Whether a system lies in the last third of its strip (its stations better stocked). */
export function deepIn(s: CampaignState, n: CampaignNode): boolean {
  return n.tier - 2 * (s.universe - 1) >= 2;
}

function randomCardChoices(s: CampaignState, f: Faction): string[] {
  const pool = [...new Set(shuffleInPlace(s, riftPool(s) ?? offerPool(f, s.mode, s.universe)))];
  // (Wide offers, bought between runs: more to choose from.)
  const options = pool.slice(0, CAMPAIGN.cardChoices + (f.id === s.playerId ? s.run?.choices ?? 0 : 0));
  // (The player's, now and then an Enigma: a rift's spoils are a hard event's.)
  return f.id === s.playerId ? withEnigma(s, options, !!s.rift) : options;
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

/**
 * A station's deck (a system with no flagship in it: neutral sentinels, a held system's guard): a few cards,
 * more the stronger it is (CAMPAIGN.stationDeck), drawn from the sentinels' deck of its tier; a held
 * system's guard has its owner's race's cards among them. No hero: it is beaten when its cards run out.
 */
function stationDeck(s: CampaignState, n: CampaignNode, race?: number): string[] {
  // (A rift's galaxy: its own race, at its strongest.)
  if (s.rift && race === undefined) return riftDeck(s, n);
  if (n.heart) {
    const w = wardenDeck(s).filter((id) => cardDef(id).kind !== 'command');
    // (The wormhole's guardian: bigger in every universe.)
    const size = Math.min(20, CAMPAIGN.heartDeck + 2 * (s.universe - 1));
    return [...w.slice(8, 14), ...shuffleInPlace(s, [...w.slice(0, 8), ...w.slice(14)]).slice(0, size - 6)];
  }
  const tier = Math.max(0, n.tier);
  const pool = (race === undefined ? neutralDeck(s, tier) : fitMode(s, starterDeck(race, s.mode))).filter((id) => cardDef(id).kind !== 'command');
  // (Like the player's, it starts at 10 cards; 2 more a tier, up to a full 20.)
  const size = Math.min(20, CAMPAIGN.enemyDeck + 2 * tier);
  const deck: string[] = [];
  for (const id of shuffleInPlace(s, pool)) {
    if (deck.length >= size) break;
    if (deck.filter((x) => x === id).length < copyLimit(id)) deck.push(id);
  }
  return deck;
}

/** A station's rooms: walls as thick as its tier. */
function stationRooms(n: CampaignNode): ShipRooms {
  const d = Math.min(3, Math.max(0, n.heart ? 2 + Math.floor(n.tier / 3) : Math.floor((n.tier + 1) / 2)));
  // (Guns too, from the second tier on.)
  const a = Math.min(2, Math.max(0, Math.floor(n.tier / 2)));
  return { defence: [d, d, d, d, d], attack: [a, a, a, a, a], command: 0 };
}

/** What a flagship brings to its side of a battle: its hero in the command room, its rooms, shields and hull. */
function flagshipSetup(s: CampaignState, army: Army): Pick<PlayerSetup, 'hero' | 'heroStats' | 'rooms' | 'opening' | 'tableau'> & { hull: BattleModifiers } {
  const f = s.factions.find((x) => x.id === army.owner);
  // The hero is in the deck, drawn and played like any card: only one who has learned Herald starts in play.
  if (army.lost || !f) return { hero: army.general, tableau: [], heroStats: { attack: CAMPAIGN.heroAttack + 1, defence: CAMPAIGN.heroDefence }, hull: {} };
  const ship = f.ship ?? newShip();
  const bonus = armyBonus(s, army);
  // (Relics: walls on every slot, guns for every armed card.)
  const { walls, guns } = bonus.relics;
  const rooms = { ...ship.rooms, defence: ship.rooms.defence.map((d) => d + walls), attack: ship.rooms.attack.map((d) => d + guns) };
  return {
    hero: army.general,
    tableau: bonus.start ? [army.general] : [],
    heroStats: heroStats(f, army.general),
    rooms: ship.modules?.some(Boolean) ? { ...rooms, boons: [0, 1, 2, 3, 4].map((r) => ship.modules?.[r]?.boons ?? []) } : rooms,
    ...(ship.shields ? { opening: { shields: ship.shields } } : {}),
    hull: ship.hull || f.sunBonus ? { maxHealthDelta: (ship.hull ?? 0) * CAMPAIGN.hullHealth + (f.sunBonus ?? 0) } : {},
  };
}

/**
 * Neutral sentinels' decks, by tier: the plain starter at first, then with stronger and stronger cards mixed in
 * (four more a tier, the heaviest last), so that far enough into a run every garrison is fearsome.
 */
const SENTINEL_EXTRAS = ['solar_battery', 'solar_battery', 'frost_bulwark', 'frost_bulwark', 'ion_cannon', 'ion_cannon', 'solar_maximum', 'ice_age', 'stellar_aegis', 'stellar_aegis', 'dreadnought', 'dreadnought', 'star_breaker', 'star_breaker', 'meltdown', 'meltdown'];
function neutralDeck(s: CampaignState, tier: number): string[] {
  const deck = starterDeck(s.mode === 'core' ? CORE_RACES[randomInt(s, CORE_RACES.length)] : randomInt(s, RACE_NAMES.length), s.mode);
  // (None of these is in a starting deck already: a deck holds at most two of a card.)
  SENTINEL_EXTRAS.slice(0, 2 + Math.max(0, tier) * 5).forEach((id, i) => (deck[i] = id));
  return fitMode(s, deck);
}

/** The Heart Wardens' deck: the strongest sentinels, with the heaviest neutral cards mixed in. */
function wardenDeck(s: CampaignState): string[] {
  const deck = neutralDeck(s, Math.max(2, s.universe * 2));
  ['star_breaker', 'star_breaker', 'dreadnought', 'dreadnought', 'stellar_aegis', 'stellar_aegis'].forEach((id, i) => (deck[8 + i] = id));
  return fitMode(s, deck);
}

/**
 * How deep in the map a system lies, in bands of the old, small map's routes: 0 at the Heart, 5 out where the
 * homes are (each band is a sixth of the way home). Sun health, tiers, rich worlds and finds go by it.
 */
export function depth(n: CampaignNode): number {
  if (n.heart) return 0;
  // (On the strip: the harder a system, the deeper it counts, for finds and the like.)
  return Math.max(1, 5 - n.tier);
}

/**
 * A system's defenders' sun's max health: lower at the near end, rising with the strip and the run, never above
 * the card game's (20). A flagship's sun always starts at the card game's (its own upgrades on top).
 */
export function sunHealth(n: CampaignNode): number {
  // (14 at the near end of the first universe, 3 more a tier, up to 20; the wormhole's guardian's the most.)
  return Math.min(BALANCE.supernovaAt, 14 + 3 * Math.max(0, n.tier) + (n.heart ? 2 : 0));
}
function sunBase(n: CampaignNode): BattleModifiers {
  return { maxHealthDelta: sunHealth(n) - BALANCE.supernovaAt };
}
/**
 * A defending side's modifiers, with its max health held to at most the card game's (20; the galaxy aside,
 * which touches both sides alike): a system's extras (fortification, wardens, a brown dwarf) can't lift it past.
 */
function capDefence(mods: BattleModifiers, galaxy: BattleModifiers | undefined, flagshipDefends = false): BattleModifiers {
  // (A flagship defending keeps its own upgrades.)
  if (flagshipDefends) return mods;
  const most = galaxy?.maxHealthDelta ?? 0;
  return (mods.maxHealthDelta ?? 0) > most ? { ...mods, maxHealthDelta: most } : mods;
}

/**
 * Each side of a battle as it would start: its sun's head start (positive: hotter) and its modifiers, with
 * the names of what made them (the galaxy, the star, heroes...). The same sums as battleSetup, for showing.
 */
export function battleOdds(s: CampaignState, army: Army, target: CampaignNode) {
  const owner = target.owner ? factionById(s, target.owner) : null;
  const guard = defenderOf(s, target, army);
  const fx = galaxyEffects(s);
  const atk = armyBonus(s, army);
  const def = guard && guard.id !== army.id ? armyBonus(s, guard) : null;
  const starBoth: BattleModifiers = target.star === 'white' ? { startingHeat: -2 } : target.star === 'neutron' ? { heatPerTurn: 1 } : {};
  const base = sunBase(target);
  // (The defenders' sun is the system's; an army defending it brings its flagship's, at the card game's.)
  const defBase = guard && guard.id !== army.id ? {} : base;
  const defMods = capDefence([
    defBase,
    target.fortification ? { maxHealthDelta: target.fortification * CAMPAIGN.fortifyHealth } : {},
    target.heart && !owner ? { maxHealthDelta: CAMPAIGN.heartWardenHealth } : {},
    starBoth,
    target.star === 'brown' ? { maxHealthDelta: 3 } : {},
    def?.mods ?? {},
    atk.foeMods,
  ].reduce(mergeModifiers, fx?.modifiers ?? {}), fx?.modifiers, !!guard && guard.id !== army.id);
  // (The attacking flagship's sun is always the card game's: only its own upgrades change it.)
  const atkMods = [starBoth, atk.mods, def?.foeMods ?? {}].reduce(mergeModifiers, fx?.modifiers ?? {});
  const defHeat = (guard && guard.id !== army.id ? guard.damage : target.damage) + atk.foeHeat + (defMods.startingHeat ?? 0);
  const atkHeat = army.damage + (def?.foeHeat ?? 0) + (atkMods.startingHeat ?? 0);
  const names = (fx: ReturnType<typeof galaxyEffects>) => (fx?.conditions ?? []).map((c) => c.name);
  return {
    attacker: { heat: atkHeat, mods: atkMods, sources: [...names(fx), ...(target.star === 'white' || target.star === 'neutron' ? [STAR_TYPES[target.star].name] : [])] },
    defender: {
      heat: defHeat,
      mods: defMods,
      sources: [...names(fx), ...(target.star && target.star !== 'red' ? [STAR_TYPES[target.star].name] : []), ...(target.fortification ? ['Fortified'] : []), ...(target.heart && !owner ? ['Lost Overlord'] : [])],
    },
  };
}

/**
 * Who defends a system: an army standing in it, else a hero of the system's owner one route away (the
 * least battered, coming to its aid). None for an unheld, unguarded system.
 */
export function defenderOf(s: CampaignState, target: CampaignNode, attacker?: Army): Army | null {
  const here = armyAt(s, target.id);
  if (here) return here.id === attacker?.id ? null : here;
  if (!target.owner) return null;
  const near = s.armies.filter((a) => a.owner === target.owner && !a.lost && a !== attacker && target.links.includes(a.nodeId));
  return near.sort((a, b) => a.damage - b.damage || a.id.localeCompare(b.id))[0] ?? null;
}

/** Everything that shapes a battle for a system: the army attacking it, and whoever holds it. */
function battleSetup(s: CampaignState, army: Army, target: CampaignNode): PlayerSetup[] {
  const attacker = factionById(s, army.owner);
  const owner = target.owner ? factionById(s, target.owner) : null;
  const guard = defenderOf(s, target, army);
  const g = garrisonBonus(target);
  const fx = galaxyEffects(s);
  const fortified: BattleModifiers = target.fortification ? { maxHealthDelta: target.fortification * CAMPAIGN.fortifyHealth } : {};
  const wardens: BattleModifiers = target.heart && !owner ? { maxHealthDelta: CAMPAIGN.heartWardenHealth } : {};
  // Both suns' max health, from how near the Heart the battle is.
  const core = sunBase(target);
  // The star the battle is fought round: its nature touches both sides (a brown dwarf shelters its defender).
  const starBoth: BattleModifiers = target.star === 'white' ? { startingHeat: -2 } : target.star === 'neutron' ? { heatPerTurn: 1 } : {};
  const starDef: BattleModifiers = target.star === 'brown' ? { maxHealthDelta: 3 } : {};
  const starCond = target.star && target.star !== 'red' ? [{ name: STAR_TYPES[target.star].name, text: target.star === 'brown' ? STAR_TYPES.brown.boon : STAR_TYPES[target.star].cost }] : [];
  const defenceConditions = [
    ...starCond,
    ...(fx?.conditions ?? []),
    ...(target.heart && !owner ? [{ name: 'Lost Overlord', text: `The wormhole's guardian: destroy the Overlord itself (${overlordHealth(s.universe)} stability) to win. Each day one of its parts takes its best action for the board, shown ahead: destroy that part, and it must choose another.` }] : []),
    ...(target.fortification ? [{ name: 'Fortified', text: `+${target.fortification * CAMPAIGN.fortifyHealth} max health (fortification level ${target.fortification}).` }] : []),
    ...(g.tableau.length || g.lightspeed ? [{ name: 'Garrison', text: `${g.tableau.length} stationed card${g.tableau.length === 1 ? '' : 's'} start in play.` }] : []),
  ];
  // Heroes: the attacking army's general, and a defending army's, bring their skills and gear.
  const atk = armyBonus(s, army);
  const def = guard ? armyBonus(s, guard) : null;
  // The defender: an army standing there (its own deck), else the system's own guard (its race's plain
  // deck), else neutral sentinels, or at the Heart its Wardens.
  // The wormhole's guardian: a Lost Overlord, its body in play (see cards-bosses.ts).
  const ruler = target.heart && !owner && !guard && s.rift ? RIFTS[s.rift.kind].ruler : null;
  const lord = target.heart && !owner && !guard && !ruler ? overlordById(s.overlord ?? OVERLORDS[0].id) : null;
  const defenderName = guard ? (guard.lost ? armyLeader(guard) : `${armyLeader(guard)}'s flagship`) : owner ? `${target.name} Station` : lord ? lord.name : ruler ? cardDef(ruler).name : `${target.name} Sentinels`;
  // (The Captain's systems are kept by neutral sentinels: there is no race of theirs to guard them.)
  const defenderDeck = guard ? guard.deck : stationDeck(s, target, owner?.human ? undefined : owner?.race);
  const { hull: atkHull, ...atkShip } = flagshipSetup(s, army);
  const defShip = guard ? flagshipSetup(s, guard) : null;
  return [
    {
      name: army.lost ? armyLeader(army) : `${armyLeader(army)} (${attacker.name})`,
      isAI: attacker.isAI,
      deck: army.deck,
      deckName: `${armyLeader(army)}'s flagship`,
      heatDelta: army.damage + (def?.foeHeat ?? 0),
      // (A flagship's sun is the card game's, 20: only its own upgrades change it.)
      modifiers: [starBoth, atk.mods, def?.foeMods ?? {}, atkHull].reduce(mergeModifiers, fx?.modifiers ?? {}),
      ...(atk.skills.length ? { skills: atk.skills } : {}),
      ...(atk.boons.length ? { heroBoons: { hero: army.general, boons: atk.boons } } : {}),
      ...(atk.relics.powers.length ? { relics: atk.relics.powers } : {}),
      ...atkShip,
      conditions: [...(fx?.conditions ?? []), ...(target.star === 'white' || target.star === 'neutron' ? starCond : []), ...(def?.foeConditions ?? [])],
    },
    {
      name: owner ? `${defenderName} (${owner.name})` : defenderName,
      isAI: owner ? owner.isAI : true,
      deck: lord ? [] : defenderDeck,
      ...(lord ? { boss: true, bossHealth: overlordHealth(s.universe) } : {}),
      // (A system's damage is its own: an army standing there brings its own.)
      heatDelta: (guard ? guard.damage : target.damage) + atk.foeHeat,
      ...(defShip ? { hero: defShip.hero, heroStats: defShip.heroStats, ...(defShip.rooms ? { rooms: defShip.rooms } : {}), ...(defShip.opening ? { opening: defShip.opening } : {}) } : lord ? {} : ruler ? { hero: ruler, heroStats: { attack: CAMPAIGN.heroAttack + 3, defence: CAMPAIGN.heroDefence + 3 }, rooms: { defence: [3, 3, 3, 3, 3], attack: [2, 2, 2, 2, 2], command: 3 } } : { rooms: stationRooms(target) }),
      // (A relic cache on a neutral system's field, for the player to break: after the garrison, in the slots left.)
      tableau: lord ? [lord.hero, ...lord.parts] : ruler ? [ruler] : [...(defShip?.tableau ?? []), ...g.tableau, ...(target.vault && !owner && !guard && army.owner === s.playerId ? [target.vault > 1 ? 'reliquary_obelisk_2' : 'reliquary_obelisk'] : [])],
      lightspeed: g.lightspeed,
      // (A Lost Overlord's sun is its own: well beyond any system's, and more in every universe.)
      modifiers: lord
        ? [{ maxHealthDelta: overlordHealth(s.universe) - BALANCE.supernovaAt }, starBoth, atk.foeMods].reduce(mergeModifiers, fx?.modifiers ?? {})
        : ruler
          ? // (A Lost Race's ruler: a sun past any system's, a shield every day, and a fuller hand.)
            [{ maxHealthDelta: 10 + 3 * (s.universe - 1), shieldPerTurn: 1, extraDraw: 1 }, atk.foeMods].reduce(mergeModifiers, {})
        : capDefence([fortified, wardens, guard ? {} : core, starBoth, starDef, def?.mods ?? {}, atk.foeMods, defShip?.hull ?? {}].reduce(mergeModifiers, fx?.modifiers ?? {}), fx?.modifiers, !!guard),
      ...(def?.skills.length ? { skills: def.skills } : {}),
      ...(guard && def?.boons.length ? { heroBoons: { hero: guard.general, boons: def.boons } } : {}),
      ...(guard && def?.relics.powers.length ? { relics: def.relics.powers } : {}),
      conditions: [...defenceConditions, ...atk.foeConditions].length ? [...defenceConditions, ...atk.foeConditions] : undefined,
    },
  ];
}

/** Plays a battle out with the AI on every seat. */
export function simulateBattle(game: GameState): GameState {
  let g = structuredClone(game);
  for (const p of g.players) p.isAI = true;
  let steps = 0;
  while (!isGameOver(g) && steps++ < CAMPAIGN.battleActionCap) g = applyAction(g, chooseAIAction(g));
  if (!isGameOver(g)) g.winnerId = DRAW; // neither breaks: the defender holds
  return g;
}

/** An army marches one route: into a system its faction holds, or into battle for one it doesn't. */
function moveArmy(s: CampaignState, army: Army, toId: string) {
  const f = factionById(s, army.owner);
  if (army.moved || (army.steps ?? 0) >= 1 + armyBonus(s, army).march) throw new GameError(`${armyLeader(army)}'s army has already moved this turn.`);
  if (army.refit) throw new GameError(`${armyLeader(army)}'s army is refitting this turn: it can march next turn.`);
  const here = nodeById(s, army.nodeId);
  const target = nodeById(s, toId);
  if (!here.links.includes(toId)) throw new GameError('There is no route between those systems.');
  if (target.vanished) throw new GameError(`${target.name} is gone into the dark.`);
  if (s.rift?.kind === 'time' && (target.spinRing ?? 0) > (here.spinRing ?? 99) && !target.heart) throw new GameError('Never outward here');
  if (target.collapsed) throw new GameError(`${target.name} has collapsed. There is nothing left there.`);
  const doom = doomProblem(s, army, toId);
  if (doom) throw new GameError(doom);
  if (target.challenge) {
    if (target.challenge.hidden || target.challenge.done || f.id !== s.playerId) throw new GameError('There is nothing there to try.');
    if (target.challenge.kind === 'rift') enterRift(s, army, target);
    else startChallenge(s, army, target);
    return;
  }
  // A space station or research station is a pit stop [direction: neither should ever have a battle]: flown into
  // freely (while no other ship is docked there), never fought over, never taken.
  if (target.owner === f.id || target.station || ((target.ruined || target.cache || target.prophet) && !target.owner && !armyAt(s, toId))) {
    if (armyAt(s, toId)) throw new GameError(`${target.station ? 'A ship is already docked at' : 'An army already stands in'} ${target.name}.`);
    army.nodeId = toId;
    if (target.cache && !army.lost) takeCache(s, f, target, army);
    // A Dark Prophet: three of the flagship's cards, offered a Nyxari mark (one to take, for good).
    if (target.prophet && f.id === s.playerId) {
      target.prophet = false;
      target.owner = f.id;
      const offers = prophetOffers(s, army);
      if (offers.length) s.prophet = { nodeId: target.id, offers };
      clog(s, `A Dark Prophet waits at ${target.name}.`, target.id, f.id);
    }
    army.steps = (army.steps ?? 0) + 1;
    // (A hero who marches fast may go on, but not after a battle.)
    if (army.steps >= 1 + armyBonus(s, army).march) army.moved = true;
    clog(s, `${armyLeader(army)}'s army marches to ${target.name}.`, [here.id, toId], f.id);
    // A rival waiting here comes for the ship. (The Captain's runs: now and then one ambushes a jump. Others': overheated,
    // a hero of the player's own race may come for the command.) A station's use waits on it.
    rivalHere(s, army);
    const ambush = f.human ? nextRandom(s) < AMBUSH_CHANCE : flagshipOverheated(s, army) && nextRandom(s) < STRUGGLE_CHANCE;
    if (f.id === s.playerId && !army.lost && !s.prophet && !s.struggle && !s.beaten && ambush) {
      const hero = struggleRival(s, army);
      if (hero) s.struggle = { nodeId: toId, hero };
    }
    dreamHere(s, army);
    return;
  }
  if (hazardBlocks(target, f.id)) throw new GameError(`${target.name} is still reeling from a supernova.`);
  // A hero's Dread: a weak neutral system surrenders, as if beaten, with no battle.
  if (surrenders(s, army, target)) {
    army.moved = true;
    clog(s, `${target.name}'s sentinels surrender to ${armyLeader(army)} without a fight.`, [here.id, target.id], f.id);
    // (Taken without a fight, it may still hold gear.)
    if (!army.lost && nextRandom(s) < HEROES.itemChance + armyBonus(s, army).loot) findItem(s, f, army, target);
    conquer(s, f, target, army);
    return;
  }
  const problem = army.lost ? null : armyDeckProblems(army.deck, army.general)[0];
  if (problem) throw new GameError(`${armyLeader(army)}'s deck isn't ready to fight: ${problem}`);
  army.moved = true;
  const players = battleSetup(s, army, target);
  const game = createGame({ seed: Math.floor(nextRandom(s) * 2 ** 31), players, campaign: true, mode: s.mode });
  const guard = defenderOf(s, target, army);
  if (guard && guard.nodeId !== toId) clog(s, `${armyLeader(guard)} comes from ${nodeById(s, guard.nodeId).name} to defend ${target.name}.`, [guard.nodeId, toId], guard.owner);
  clog(s, army.lost ? `${armyLeader(army)} strike from ${here.name} at ${target.name} (${players[1].name}).` : `${armyLeader(army)} leads ${f.name}'s army from ${here.name} against ${target.name} (${players[1].name}).`, [here.id, target.id], f.id);
  // (A flagship standing in a system no one holds, a ruin, defends it for its own side.)
  const defenderId = target.owner ?? (guard && !guard.lost ? guard.owner : null);
  s.battle = { attacker: f.id, defender: defenderId, fromId: here.id, nodeId: toId, armyId: army.id, defenderArmyId: guard?.id ?? null, game };
  // Battles between AI factions (or neutrals) are resolved at once; a human fights their own.
  const playerInvolved = !f.isAI || (defenderId !== null && !factionById(s, defenderId).isAI);
  if (!playerInvolved) resolveBattle(s, simulateBattle(game));
}

/**
 * A beaten flagship falls back, battered: to a free system its faction holds next door, else the nearest it
 * holds at all. A lost army with nowhere to go next door is gone; a faction's flagship only once it holds nothing.
 */
function rout(s: CampaignState, army: Army) {
  const here = nodeById(s, army.nodeId);
  const free = (n: CampaignNode) => n.owner === army.owner && !n.collapsed && !armyAt(s, n.id);
  // (A flagship with nowhere of its own to go limps to any free system next door, on along the strip if it can,
  // out of the collapse's way: only with nowhere at all is it lost.)
  const open = (n: CampaignNode) => !n.collapsed && !n.collapsing && !n.heart && !armyAt(s, n.id);
  const refuge =
    here.links.map((id) => nodeById(s, id)).find(free) ??
    (army.lost ? undefined : s.nodes.filter(free).sort((a, b) => hops(s, here.id, a.id) - hops(s, here.id, b.id))[0]) ??
    (army.lost ? undefined : here.links.map((id) => nodeById(s, id)).filter(open).sort((a, b) => (b.col ?? 0) - (a.col ?? 0))[0]);
  if (refuge) {
    army.nodeId = refuge.id;
    army.damage = CAMPAIGN.maxDamage;
    clog(s, `${armyLeader(army)}'s army falls back to ${refuge.name}.`, [here.id, refuge.id], army.owner);
    return;
  }
  s.armies = s.armies.filter((a) => a !== army);
  if (army.lost) {
    clog(s, `${armyLeader(army)} are gone. Another people the dark has taken.`, here.id, army.owner);
    return;
  }
  clog(s, `${cardDef(army.general).name}'s flagship has nowhere left to go.`, here.id, army.owner);
  checkEliminated(s, factionById(s, army.owner));
}

/**
 * Salvage: the cards the player may take one of from the side they beat, once the battle is over (none if they
 * lost, or weren't in it). Up to CAMPAIGN.salvageChoices different cards from the beaten side's deck (wherever
 * they ended up), never a Hero; the same ones every time it is asked, for that battle.
 */
/**
 * Who a beaten side's cards come from: its own race (most of its cards'), or none for neutral sentinels.
 * Beaten, your own race's cards may **defect** to you; any other side's prisoners, **freed**, bring neutral cards.
 */
export function salvageKind(s: CampaignState, game: GameState): 'defectors' | 'prisoners' | null {
  const b = s.battle;
  // (A challenge pays its own reward: nothing to salvage.)
  if (!b || b.challenge || !isGameOver(game) || !game.winnerId) return null;
  const seat = b.attacker === s.playerId ? 0 : b.defender === s.playerId ? 1 : -1;
  if (seat < 0 || game.players[seat].id !== game.winnerId) return null;
  const foe = game.players[1 - seat];
  const counts = new Map<number, number>();
  for (const c of [...foe.deck, ...foe.hand, ...foe.tableau, ...foe.discard, ...(foe.fallen ?? [])]) {
    const r = cardDef(c.defId).race;
    if (r !== undefined) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const race = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  // (The Captain has no race to defect to: freed prisoners, any core race's.)
  const me = factionById(s, s.playerId);
  return !me.human && race !== undefined && race === me.race ? 'defectors' : 'prisoners';
}

/**
 * Salvage: the cards the player may take one of from the side they beat, once the battle is over (none if they
 * lost, or weren't in it). Cards of a race other than your own play by rules your deck doesn't (a lone grow card
 * among cards that never grow), so: a side of your own race has cards of yours **defect** (its cards of your
 * race, and its neutral ones); any other side's **freed prisoners** bring neutral cards (its own neutral ones
 * first, then others). Up to CAMPAIGN.salvageChoices, different.
 */
export function salvageOptions(s: CampaignState, game: GameState): string[] {
  const kind = salvageKind(s, game);
  if (!kind) return [];
  const b = s.battle!;
  const seat = b.attacker === s.playerId ? 0 : 1;
  const foe = game.players[1 - seat];
  const myRace = factionById(s, s.playerId).race;
  const cards = [...foe.deck, ...foe.hand, ...foe.tableau, ...foe.discard, ...(foe.fallen ?? []), ...(foe.lightspeed ? [foe.lightspeed] : [])];
  const usable = (id: string) => {
    const def = cardDef(id);
    return !def.token && def.kind !== 'command' && !def.overlordPart && legalIn(s.mode, id);
  };
  // (Only cards the flagship's deck could still take: none it already holds as many of as a deck may.)
  const flag = flagship(s, s.playerId);
  const room = (id: string) => !flag || flag.deck.filter((x) => x === id).length < campaignCopies(id);
  const me = factionById(s, s.playerId);
  // (The Captain's prisoners: any core race's cards, or neutral ones.)
  const fits = (id: string) => room(id) && (me.human ? rewardRace(me, cardDef(id).race) : kind === 'defectors' ? cardDef(id).race === myRace || cardDef(id).race === undefined : cardDef(id).race === undefined);
  const ids = [...new Set(cards.flatMap((c) => [c.defId, ...(c.fused ?? []).map((f) => f.defId)]))].filter((id) => usable(id) && fits(id)).sort();
  // (A fixed shuffle, from the battle's own seed and place.)
  const next = spoilsRng(game, b.nodeId);
  const shuffle = (list: string[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const want = CAMPAIGN.salvageChoices + (s.run?.salvage ?? 0);
  const out = shuffle(ids).slice(0, want);
  // Freed prisoners with too few neutral cards of the side's own: others, from the neutral cards at large.
  if (out.length < want) {
    const more = shuffle(CARDS.filter((c) => c.race === undefined && !c.fusion && c.kind !== 'global' && usable(c.id) && room(c.id) && !out.includes(c.id)).map((c) => c.id).sort());
    out.push(...more.slice(0, want - out.length));
  }
  return out;
}

/** A battle's own random numbers for its spoils: the same every time they're asked for (shown, then taken). */
function spoilsRng(game: GameState, salt: string): () => number {
  let h = game.rngState ^ 0x9e3779b9;
  for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) ^ 0x6a09e667) >>> 0) / 2 ** 32;
}

/** How fine a find is, by where it was found (r: a roll, 0–1): better the deeper the system lies. */
function findRarity(n: CampaignNode, r: number, universe = 1): ItemRarity {
  // (Through every wormhole the roll leans a little toward the finer finds.)
  r *= Math.max(0.55, 1 - 0.07 * Math.max(0, universe - 1));
  return n.heart || depth(n) <= 2 ? (r < 0.4 ? 'anomaly' : 'stellar') : n.tier >= 1 ? (r < 0.15 ? 'anomaly' : r < 0.6 ? 'stellar' : 'dwarf') : r < 0.25 ? 'stellar' : 'dwarf';
}

/**
 * What the winner of a battle finds in the wreckage: perhaps gear for its hero, perhaps a module for its
 * ship. Worked out from the finished battle, so the battle screen can show it before it is taken (the same
 * finds, the same ids). None for neutral defenders or the Lost Races.
 */
export function battleFinds(s: CampaignState, game: GameState): { items: Relic[]; modules: ShipModule[] } {
  const none = { items: [], modules: [] };
  const b = s.battle;
  if (!b || b.challenge || !isGameOver(game) || !game.winnerId || isDraw(game)) return none;
  const attackerWon = game.winnerId === game.players[0].id;
  const fid = attackerWon ? b.attacker : b.defender;
  const f = fid ? s.factions.find((x) => x.id === fid) : undefined;
  if (!f || f.lost) return none;
  const army = s.armies.find((a) => a.id === (attackerWon ? b.armyId : b.defenderArmyId));
  const n = nodeById(s, b.nodeId);
  const next = spoilsRng(game, `${b.nodeId}:finds`);
  let uid = s.uidCounter;
  const items: Relic[] = [];
  const modules: ShipModule[] = [];
  if (next() < HEROES.itemChance + (army ? armyBonus(s, army).loot : 0)) {
    const slots = RACE_SLOTS[f.race];
    const slot = slots[Math.floor(next() * slots.length)].kind, rarity = findRarity(n, next(), s.universe), roll = next();
    items.push(makeRelic(`item${++uid}`, slot, rarity, f.race, roll, next() < CAMPAIGN.curseChance, f.relics ?? []));
  }
  // (No modules any more: the flagship is not fitted out.)
  void modules;
  return { items, modules };
}

/**
 * A relic cache broken open on the battlefield (its Reliquary Obelisk destroyed before the battle ended): the relics
 * it sealed, the player's whoever won, never cursed. Worked out from the finished battle, as battleFinds is.
 */
export function vaultFinds(s: CampaignState, game: GameState): Relic[] {
  const b = s.battle;
  if (!b || b.challenge || !isGameOver(game) || !game.vaultOpened || b.attacker !== s.playerId) return [];
  const n = nodeById(s, b.nodeId);
  const f = factionById(s, b.attacker);
  const next = spoilsRng(game, `${b.nodeId}:vault`);
  // (Ids after any the wreckage gives.)
  let uid = s.uidCounter + 10;
  // (Never one already held, nor two alike out of the same cache.)
  const held = [...(f.relics ?? []), ...battleFinds(s, game).items];
  return Array.from({ length: n.vault ?? 0 }, () => {
    const slots = RACE_SLOTS[f.race];
    const slot = slots[Math.floor(next() * slots.length)].kind;
    const relic = makeRelic(`item${++uid}`, slot, findRarity(n, next(), s.universe), f.race, next(), false, held);
    held.push(relic);
    return relic;
  });
}

/** Take a battle's finds: into the winner's stores (the AI wears and fits them at once); and a relic cache broken open. */
function takeFinds(s: CampaignState, game: GameState) {
  const vault = vaultFinds(s, game);
  if (vault.length) {
    const b = s.battle!;
    const me = campaignPlayer(s);
    (me.relics ??= []).push(...vault);
    s.uidCounter += 10 + vault.length;
    nodeById(s, b.nodeId).vault = undefined;
    clog(s, `${me.name} breaks open the emblem cache: ${vault.map((r) => r.name).join(' and ')}.`, b.nodeId, me.id);
  }
  const { items, modules } = battleFinds(s, game);
  if (!items.length && !modules.length) return;
  const b = s.battle!;
  const f = factionById(s, game.winnerId === game.players[0].id ? b.attacker : b.defender!);
  s.uidCounter += items.length + modules.length;
  (f.relics ??= []).push(...items);
  for (const r of items) clog(s, `${f.name} finds ${r.name}${r.cursed ? ': it is cursed' : ''}.`, b.nodeId, f.id);
  clog(s, `${f.name} finds ${[...items, ...modules].map((x) => x.name).join(' and ')} in the wreckage.`, b.nodeId, f.id);
  if (f.isAI) {
    aiEquip(f);
    aiFitModules(f);
  }
}

/** Whether a card salvaged from this battle would go straight into the player's army's deck (else the reserve). */
export function salvageToDeck(s: CampaignState, id: string): boolean {
  const b = s.battle;
  if (!b) return false;
  const army = s.armies.find((a) => a.id === (b.attacker === s.playerId ? b.armyId : b.defender === s.playerId ? b.defenderArmyId : null));
  const f = factionById(s, s.playerId);
  return !!army && deckAddProblem({ ...f, reserve: [id] }, army, id) === null;
}

/** A card gained: straight into the flagship's deck (there is no deck to manage), else, if it may not take another copy, kept aside. */
function gainCard(s: CampaignState, f: Faction, id: string) {
  const army = flagship(s, f.id);
  if (army && deckAddProblem({ ...f, reserve: [id] }, army, id) === null) army.deck.push(id);
  else f.reserve.push(id);
}

/** Salvage a card: straight into the army's deck (else the reserve, if the deck may not take another copy). */
function takeSalvage(s: CampaignState, f: Faction, army: Army | undefined, id: string, verb = 'salvages') {
  f.reserve.push(id);
  if (army && army.owner === f.id && deckAddProblem(f, army, id) === null) {
    f.reserve.splice(f.reserve.lastIndexOf(id), 1);
    army.deck.push(id);
    clog(s, `${f.name} ${verb} ${cardDef(id).name}: it joins ${armyLeader(army)}'s deck.`, army.nodeId, f.id);
  } else clog(s, `${f.name} ${verb} ${cardDef(id).name}: it waits in the reserve.`, undefined, f.id);
}

/**
 * A beaten Lost Overlord's bounty: Stellari petals (more each galaxy), and its hoard, a pick of rare (Stellar) or
 * Anomaly cards for the flagship's deck (none it already holds as many of as it may).
 */
function overlordBounty(s: CampaignState, f: Faction, army?: Army) {
  const lord = s.rift ? { name: cardDef(RIFTS[s.rift.kind].ruler).name } : overlordById(s.overlord ?? OVERLORDS[0].id);
  const petals = Math.max(1, Math.round(CAMPAIGN.bossPetals * s.universe * (1 + (s.run?.petalBonus ?? 0)))) + (s.run?.tithe ?? 0);
  s.petals += petals;
  gainXp(s, CAMPAIGN.xpBoss);
  clog(s, `${lord.name} falls: ${f.name} gathers ${petals} Stellari petal${petals === 1 ? '' : 's'} from its remains.`, undefined, f.id);
  const fits = (id: string) => rarityOf(id) !== 'dwarf' && cardDef(id).kind !== 'command' && (!army || deckAddProblem({ ...f, reserve: [id] }, army, id) === null);
  const hoard = [...new Set(shuffleInPlace(s, riftPool(s) ?? offerPool(f, s.mode, s.universe)))].filter(fits).slice(0, CAMPAIGN.bossCardChoices + (s.run?.vault ?? 0));
  // (An Overlord's hoard is a hard event's: an Enigma a little likelier.)
  const options = f.id === s.playerId ? withEnigma(s, hoard, true) : hoard;
  if (options.length) s.cardRewards.push({ source: `${lord.name}'s hoard`, options, ...(army ? { toDeck: army.id } : {}), take: 'claims' });
}

function resolveBattle(s: CampaignState, game: GameState, salvage?: string | null) {
  const b = s.battle;
  if (!b) throw new GameError('There is no battle to finish.');
  if (!isGameOver(game)) throw new GameError('That battle is not over yet.');
  if (b.challenge) return resolveChallenge(s, game);
  if (b.struggle) return resolveStruggle(s, game);
  if (b.dream) return resolveDream(s, game);
  const salvageable = salvageOptions(s, game);
  if (salvage && !salvageable.includes(salvage)) throw new GameError('That card is not there to salvage.');
  takeFinds(s, game);
  s.battle = null;
  const attacker = factionById(s, b.attacker);
  const defender = b.defender ? factionById(s, b.defender) : null;
  const target = nodeById(s, b.nodeId);
  const army = s.armies.find((a) => a.id === b.armyId);
  const guard = b.defenderArmyId ? s.armies.find((a) => a.id === b.defenderArmyId) : undefined;
  const attackerWon = game.winnerId === game.players[0].id;
  // (A draw: every sun gone together. No one wins, no one falls: the attack is held off, no worse for it.)
  const draw = isDraw(game);
  const winnerSeat = attackerWon ? game.players[0] : game.players[1];
  const winner = draw ? null : attackerWon ? attacker : defender;

  // The winner's sun goes on as it ended: a flagship starts its next battle at the heat it finished this one on
  // (cooled below 0, it starts cooler; burned near its end, it starts there). A system keeps a little of it.
  const carried = Math.max(0, Math.min(CAMPAIGN.maxDamage, winnerSeat.heat));
  const flagHeat = Math.max(BALANCE.minHeat, winnerSeat.heat);
  if (draw) {
    // (Nothing carried on.)
  } else if (attackerWon) {
    if (army) army.damage = flagHeat;
  } else {
    if (guard) guard.damage = flagHeat;
    else target.damage = carried;
    if (army) army.damage = Math.min(CAMPAIGN.maxDamage, army.damage + CAMPAIGN.armyRepelledDamage);
  }

  // Salvage from the beaten side: the player's pick (on the battle screen), or, auto-resolved, a choice owed.
  if (salvageable.length) {
    const f = factionById(s, s.playerId);
    const mine = attackerWon ? army : guard;
    if (salvage) takeSalvage(s, f, mine, salvage);
    else if (salvage === undefined) s.cardRewards.push({ source: salvageKind(s, game) === 'defectors' ? 'Defectors' : 'Freed prisoners', options: salvageable, ...(mine ? { toDeck: mine.id } : {}) });
  }

  if (winner?.id === s.playerId) gainXp(s, CAMPAIGN.xpBattle);
  else if (b.attacker === s.playerId || b.defender === s.playerId) gainXp(s, CAMPAIGN.xpBattleLost);
  // Stellari's Favour: the flagship's sun cools after every battle it wins.
  if (attackerWon && army && army.owner === s.playerId && s.run?.favour) army.damage = Math.max(BALANCE.minHeat, army.damage - s.run.favour);
  if (winner) {
    winner.materials += CAMPAIGN.winMaterials + (winner.id === s.playerId ? s.run?.plunder ?? 0 : 0);
    // (A Legacy, from the skill tree: a petal banked for every battle won.)
    if (winner.id === s.playerId && s.run?.legacy) s.petals += s.run.legacy;
    winner.stats.battlesWon += 1;
    if (game.round <= 6) winner.stats.swiftWins += 1;
    if (winnerSeat.heat <= 0) winner.stats.coldWins += 1;
    if (!attackerWon) winner.stats.defences += 1;
  }

  if (attackerWon) {
    clog(s, `${attacker.name} wins the battle for ${target.name}.`, target.id, attacker.id);
    // Beating one of the Lost Races wins its relics.
    if (guard?.lost) {
      attacker.materials += CAMPAIGN.lostRelicMaterials;
      clog(s, `${attacker.name} takes the emblems of the ${guard.lost}: +${CAMPAIGN.lostRelicMaterials} materials.`, target.id, attacker.id);
      if (!attacker.isAI) s.cardRewards.push({ source: `Emblems of the ${guard.lost}`, options: randomCardChoices(s, attacker) });
    }
    // A defending army is routed; the victors march in, if the system is settled.
    // (A hero who came to its aid from next door goes home battered.)
    if (guard?.nodeId === target.id) rout(s, guard);
    else if (guard) guard.damage = CAMPAIGN.maxDamage;
    conquer(s, attacker, target, army);
  } else if (draw) {
    clog(s, `The battle for ${target.name} ends in a draw: ${attacker.name}'s attack is held off.`, target.id, attacker.id);
  } else {
    clog(s, `${target.name} holds: ${attacker.name}'s attack is repelled.`, target.id, attacker.id);
  }
  // Any battle the player loses ends the run (a draw is no loss).
  const playerSide = b.attacker === s.playerId ? 'attacker' : b.defender === s.playerId ? 'defender' : null;
  if (!draw && playerSide && (playerSide === 'attacker') !== attackerWon) playerFalls(s);
}

/** Experience for the player, for something done this run (it is banked at once: a lost run keeps it). */
function gainXp(s: CampaignState, amount: number) {
  // (Study, bought between runs: a share more.)
  s.xp = (s.xp ?? 0) + Math.round(amount * (1 + (s.run?.xpBonus ?? 0)));
}

/** The player's flagship is beaten in battle: it is lost, and the run with it. */
function playerFalls(s: CampaignState) {
  const f = factionById(s, s.playerId);
  const army = flagship(s, f.id);
  if (army) {
    s.armies = s.armies.filter((a) => a !== army);
    clog(s, `${cardDef(army.general).name}'s flagship is destroyed.`, army.nodeId, f.id);
  }
  f.eliminated = true;
  checkVictory(s);
}

/**
 * A system taken: it is held, pays once (its materials, and any extra), and
 * counts towards the petals at the wormhole. The wormhole's guardian beaten, the flagship goes through, into the
 * next universe.
 */
function conquer(s: CampaignState, f: Faction, n: CampaignNode, army?: Army) {
  // Everything held in the garrison goes to the victor.
  const spoils = n.garrison.map((g) => g.defId);
  f.reserve.push(...spoils);
  n.garrison = [];
  if (spoils.length) clog(s, `${f.name} seizes ${spoils.map((id) => cardDef(id).name).join(', ')} from ${n.name}.`, n.id, f.id);
  if (f.id === s.playerId && !n.heart) gainXp(s, CAMPAIGN.xpConquer);
  if (n.heart) {
    if (army && s.armies.includes(army)) army.nodeId = n.id;
    if (f.id === s.playerId) overlordBounty(s, f, army);
    // Aster, beaten, grants one of the Seren's emblems.
    if (f.id === s.playerId && s.rift?.kind === 'time') s.emblemChoice = serenEmblems(s);
    crossWormhole(s, f);
    return;
  }
  if (f.id === s.playerId && f.stats.settled + f.stats.absorbed + f.stats.novas === 0) tell(s, firstConquestScene());
  n.home = undefined;
  n.gate = undefined;
  const { materials } = n.yield;
  f.materials += materials;
  if (n.bonus?.materials) f.materials += n.bonus.materials;
  const extra = n.bonus?.materials ? ` and ${n.bonus.materials} more from its stores` : '';
  n.bonus = undefined;
  n.yield = { materials: 0 };
  n.damage = 0;
  n.fortification = 0;
  n.owner = f.id;
  f.stats.settled += 1;
  s.conquered += 1;
  if (f.id === s.playerId) s.starsTaken = (s.starsTaken ?? 0) + 1;
  clog(s, `${f.name} conquers ${n.name}: +${materials} materials${extra}.`, n.id, f.id);
  revealChallenges(s, f, n);
  // The victors march in.
  if (army && s.armies.includes(army) && !armyAt(s, n.id)) army.nodeId = n.id;
  if (army && s.armies.includes(army)) rivalHere(s, army);
  if (army && s.armies.includes(army)) dreamHere(s, army);
}

/** Taking a system shows any challenge hanging off it (the player's only: the AI never looks). */
function revealChallenges(s: CampaignState, f: Faction, n: CampaignNode) {
  if (f.id !== s.playerId) return;
  for (const c of s.nodes) {
    if (!c.challenge?.hidden || c.challenge.from !== n.id) continue;
    c.challenge.hidden = false;
    clog(s, `${f.name} finds a hidden route from ${n.name}: ${CHALLENGES[c.challenge.kind].name}.`, [n.id, c.id], f.id);
  }
}

/**
 * Secret systems off the route, a few each galaxy: each hangs off an ordinary system (in the middle stretch of the
 * route, on any lane), set out to one side of its lane where there is open space, clear of every other system and
 * route (past the outer lanes, or in a gap where the lanes spread apart), linked to it alone, hidden until that
 * system is taken. Never two alike; the Lost Lord only while there are Lost Lords left to beat.
 */
function placeChallenges(s: CampaignState) {
  const C = CAMPAIGN.columns, gap = CAMPAIGN.laneGap;
  // (A rift into a Lost Race's galaxy among them, often [direction: rifts as a potential secret node].)
  const kinds = shuffleInPlace<ChallengeKind>(s, ['mine', 'frost', 'rift', ...(LOST_LORDS.some((id) => !s.lordsWon?.includes(id)) ? ['lord' as const] : [])]).slice(0, 2);
  const hosts = shuffleInPlace(s, s.nodes.filter((n) => !n.heart && !n.home && !n.station && (n.col ?? 0) >= 2 && (n.col ?? 0) <= C - 2));
  const segDist = (px: number, py: number, a: CampaignNode, b: CampaignNode) => {
    const vx = b.x - a.x, vy = b.y - a.y, len = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len));
    return Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
  };
  // Where a secret could hang off a system: out to either side of its lane (across the way its lane runs there).
  const spot = (from: CampaignNode): { x: number; y: number } | null => {
    const lane = s.nodes.filter((n) => n.lane === from.lane && !n.challenge && Math.abs((n.col ?? 0) - (from.col ?? 0)) === 1);
    const [a, b] = lane.length === 2 ? lane : [from, lane[0] ?? from];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const sides = shuffleInPlace(s, [1, -1]);
    for (const side of sides) {
      const x = from.x - ty * side * gap * 0.62, y = from.y + tx * side * gap * 0.62;
      if (x < 60 || y < 60 || x > CAMPAIGN.mapWidth - 60 || y > CAMPAIGN.mapHeight - 60) continue;
      if (s.nodes.some((n) => n !== from && Math.hypot(n.x - x, n.y - y) < gap * 0.55)) continue;
      const clear = s.nodes.every((n) => n.links.every((id) => {
        const m = s.nodes.find((k) => k.id === id)!;
        return n === from || m === from || segDist(x, y, n, m) > 95;
      }));
      if (clear) return { x, y };
    }
    return null;
  };
  let hi = 0;
  for (const kind of kinds) {
    let from: CampaignNode | undefined, at: { x: number; y: number } | null = null;
    while (hi < hosts.length && !at) {
      from = hosts[hi++];
      at = spot(from);
    }
    if (!from || !at) return;
    const lord = kind === 'lord' ? shuffleInPlace(s, LOST_LORDS.filter((id) => !s.lordsWon?.includes(id)))[0] : undefined;
    const node: CampaignNode = {
      id: `n${s.nodes.length}`,
      name: CHALLENGES[kind].name,
      x: at.x,
      y: at.y,
      h: from.h,
      planets: [],
      owner: null,
      links: [from.id],
      fortification: 0,
      damage: 0,
      garrison: [],
      hazard: [],
      yield: { materials: 0 },
      tier: from.tier,
      col: from.col,
      lane: from.lane,
      challenge: { kind, hidden: true, from: from.id, ...(lord ? { lord } : {}), ...(kind === 'rift' ? { rift: RIFT_KINDS[randomInt(s, RIFT_KINDS.length)] } : {}) },
    };
    from.links.push(node.id);
    s.nodes.push(node);
  }
}

/**
 * A challenge entered: the flagship fights the challenge's own side (a body in play, playing nothing): the
 * mine's crystals, the Frost Line's waves (harder each time), a Lost Lord and their retinue.
 */
function startChallenge(s: CampaignState, army: Army, target: CampaignNode) {
  const f = factionById(s, army.owner);
  const kind = target.challenge!.kind;
  army.moved = true;
  const [me] = battleSetup(s, army, target);
  const level = s.frostLevel ?? 0;
  const lord = target.challenge!.lord ?? LOST_LORDS[0];
  const side: PlayerSetup =
    kind === 'mine'
      ? { name: 'The Antimatter Mine', isAI: true, deck: [], boss: true, tableau: Array(5).fill('antimatter_crystal') }
      : kind === 'frost'
        ? { name: `The Frost Line${level ? ` (${level + 1})` : ''}`, isAI: true, deck: [], boss: true, tableau: ['rime_golem', ...FROST_LINES[Math.min(level, FROST_LINES.length - 1)].start] }
        : { name: cardDef(lord).name, isAI: true, deck: [], boss: true, bossLeader: lord, bossHealth: 18 + 3 * (s.universe - 1), tableau: [lord, 'lost_retinue', 'lost_retinue'] };
  const challenge: GameState['challenge'] =
    kind === 'mine'
      ? { kind, days: 6, spawn: ['antimatter_crystal'], per: 2, broken: 0 }
      : kind === 'frost'
        ? { kind, broken: 0, ...FROST_LINES[Math.min(level, FROST_LINES.length - 1)].waves }
        : { kind: kind as 'lord', broken: 0 };
  const game = createGame({ seed: Math.floor(nextRandom(s) * 2 ** 31), players: [me, side], campaign: true, mode: s.mode, challenge });
  clog(s, `${armyLeader(army)} takes on ${CHALLENGES[kind].name}.`, [army.nodeId, target.id], f.id);
  s.battle = { attacker: f.id, defender: null, fromId: army.nodeId, nodeId: target.id, armyId: army.id, defenderArmyId: null, game, challenge: { kind, damage: army.damage } };
}

/**
 * A challenge over. Won: its reward, and the flagship's sun goes on as it ended. Lost: the run goes on, the
 * flagship ejected (its sun as it was before), and the challenge dimmed, never to be tried again. Either way the
 * flagship stays where it set out from.
 */
function resolveChallenge(s: CampaignState, game: GameState) {
  const b = s.battle!;
  s.battle = null;
  const f = factionById(s, b.attacker);
  const army = s.armies.find((a) => a.id === b.armyId);
  const n = nodeById(s, b.nodeId);
  const c = n.challenge!;
  const won = !isDraw(game) && game.winnerId === game.players[0].id;
  c.done = won ? 'won' : 'lost';
  if (f.id === s.playerId) gainXp(s, won ? CAMPAIGN.xpChallenge : CAMPAIGN.xpBattleLost);
  if (!won) {
    n.dimmed = true;
    if (army) army.damage = b.challenge!.damage;
    clog(s, `${f.name}'s flagship is thrown clear of ${n.name}, battered but whole. It will not let them in again.`, n.id, f.id);
    return;
  }
  if (army) army.damage = Math.max(BALANCE.minHeat, game.players[0].heat);
  if (c.kind === 'mine') {
    const broken = game.challenge?.broken ?? 0;
    f.materials += broken * 3;
    clog(s, `${f.name} breaks ${broken} antimatter crystal${broken === 1 ? '' : 's'} in ${n.name}: +${broken * 3} materials.`, n.id, f.id);
  } else if (c.kind === 'lord') {
    const lord = c.lord ?? LOST_LORDS[0];
    (s.lordsWon ??= []).push(lord);
    if (army) army.deck.push(lord);
    else f.reserve.push(lord);
    clog(s, `${cardDef(lord).name} is beaten, and joins ${f.name}'s flagship.`, n.id, f.id);
  } else {
    s.frostLevel = (s.frostLevel ?? 0) + 1;
    s.boon = { source: n.name };
    clog(s, `${f.name} holds ${n.name}.`, n.id, f.id);
  }
}

/** A system with nothing to fight, flown into: what it holds is taken, and the system with it. */
function takeCache(s: CampaignState, f: Faction, n: CampaignNode, army: Army) {
  const c = n.cache!;
  n.cache = undefined;
  n.owner = f.id;
  n.yield = { materials: 0 };
  s.conquered += 1;
  if (f.id === s.playerId) s.starsTaken = (s.starsTaken ?? 0) + 1;
  revealChallenges(s, f, n);
  if (c.kind === 'relic') return findItem(s, f, army, n);
  if (c.kind === 'materials') f.materials += c.amount;
  else if (!f.isAI) s.cardRewards.push({ source: `A derelict at ${n.name}`, options: randomCardChoices(s, f) });
  const what = c.kind === 'cards' ? 'a derelict, with cards to choose from' : `${c.amount} ${c.kind}`;
  clog(s, `${f.name} finds ${what} at ${n.name}.`, n.id, f.id);
}

/** A relic found by an army in a system it took: better the deeper the system lies, and now and then cursed. */
function findItem(s: CampaignState, f: Faction, army: Army, n: CampaignNode) {
  const rarity = findRarity(n, nextRandom(s), s.universe);
  const slots = RACE_SLOTS[f.race];
  const kind: SlotKind = slots[randomInt(s, slots.length)].kind;
  const relic = makeRelic(`item${++s.uidCounter}`, kind, rarity, f.race, nextRandom(s), nextRandom(s) < CAMPAIGN.curseChance, f.relics ?? []);
  (f.relics ??= []).push(relic);
  clog(s, `${cardDef(army.general).name}'s army finds ${relic.name} in ${n.name}${relic.cursed ? ': it is cursed' : ''}.`, n.id, f.id);
}

/** Fit a module into a room: one already there goes back to the stores. */
function fitModule(f: Faction, m: ShipModule, room: number) {
  const mods = (f.ship.modules ??= [null, null, null, null, null]);
  const old = mods[room];
  mods[room] = m;
  f.modules = (f.modules ?? []).filter((x) => x !== m);
  if (old) f.modules.push(old);
}

/** The AI fits its best modules, the safest rooms first (an empty or weaker one). */
function aiFitModules(f: Faction) {
  for (const m of [...(f.modules ?? [])].sort((a, b) => moduleValue(b) - moduleValue(a))) {
    const room = [2, 1, 3, 0, 4].find((r) => !f.ship.modules?.[r] || moduleValue(f.ship.modules[r]!) < moduleValue(m));
    if (room !== undefined) fitModule(f, m, room);
  }
}

/** The AI wears its best gear: each find goes to the hero it suits best (an empty or weaker slot). */
function aiEquip(f: Faction) {
  for (const item of [...(f.items ?? [])]) {
    for (const hero of [f.hero ?? GENERALS[f.race][0]]) {
      const h = heroState(f, hero);
      const slot = RACE_SLOTS[f.race].find((x) => x.kind === item.slot && (!h.gear[x.id] || itemValue(h.gear[x.id]) < itemValue(item)));
      if (!slot) continue;
      const old = h.gear[slot.id];
      h.gear[slot.id] = item;
      f.items = f.items!.filter((x) => x !== item);
      if (old) f.items.push(old);
      break;
    }
  }
}

/** Take one of a research station's upgrades, free (the checks are researchProblem's). */
function takeResearch(s: CampaignState, f: Faction, n: CampaignNode, projectId: string) {
  const why = researchProblem(s, f, n, projectId);
  if (why) throw new GameError(why);
  const st = n.station as Extract<Station, { kind: 'research' }>;
  st.takenBy = f.id;
  st.project = projectId;
  // (Its upgrade taken, the system is the taker's [direction: shown as conquered after the visit].)
  n.owner = f.id;
  (f.research ??= { done: [] }).done.push(projectId);
  clog(s, `${f.name} takes ${researchProject(projectId)!.name} from ${n.name}'s research station.`, n.id, f.id);
}

/** Buy an armoury's card (the checks are buyProblem's): it goes to the reserve, and is gone from the armoury. */
function buyCard(s: CampaignState, f: Faction, n: CampaignNode, index: number) {
  const why = buyProblem(s, f, n, index);
  if (why) throw new GameError(why);
  const st = n.station as Extract<Station, { kind: 'armory' }>;
  const id = st.cards[index];
  f.materials -= buyPrice(s, f, id);
  st.cards.splice(index, 1);
  (st.used ??= {}).buy = true;
  clog(s, `${f.name} buys ${cardDef(id).name} at ${n.name}'s space station.`, n.id, f.id);
  gainCard(s, f, id);
}

/** A faction with no systems left is out: with no worlds to supply them, its armies scatter. */
function checkEliminated(s: CampaignState, f: Faction) {
  // (A run ends when its flagship is lost: systems come and go with every universe.)
  if (f.eliminated || f.lost || armiesOf(s, f.id).length > 0) return;
  f.eliminated = true;
  s.aiQueue = s.aiQueue.filter((id) => id !== f.id);
  clog(s, `${f.name}'s flagship is lost.`);
  checkVictory(s);
}

/** A system gives way: whatever stood there is lost, and an army there falls back if it can. */
function collapse(s: CampaignState, n: CampaignNode) {
  const owner = n.owner ? factionById(s, n.owner) : null;
  const army = armyAt(s, n.id);
  n.collapsing = false;
  n.collapsed = true;
  n.owner = null;
  n.garrison = [];
  n.fortification = 0;
  n.damage = 0;
  n.hazard = [];
  n.yield = { materials: 0 };
  n.stellaria = n.stellaria === undefined ? undefined : 0;
  n.home = undefined;
  clog(s, `${n.name} collapses into the dark.`, n.id);
  // (Whatever stands there goes with it.)
  if (army) {
    s.armies = s.armies.filter((a) => a !== army);
    clog(s, `${armyLeader(army)}${army.lost ? '' : "'s flagship"} goes down with ${n.name}.`, n.id, army.owner);
    checkEliminated(s, factionById(s, army.owner));
  }
  void owner;
}

/** The next column of the strip to give way, from the near end: marked a turn before it goes (the wormhole last). */
function markCollapses(s: CampaignState) {
  const col = s.collapseCol;
  const marked = s.nodes.filter((x) => x.col === col && !x.collapsed);
  s.collapseCol += 1;
  if (!marked.length) return;
  for (const n of marked) n.collapsing = true;
  clog(s, `Column ${col + 1} of the strip is collapsing: it will be gone next turn.`, marked.map((n) => n.id));
  tell(s, collapseScene());
}

/** The run is over once the player's flagship is lost (there is no winning: only how far it got). */
function checkVictory(s: CampaignState) {
  if (s.winner) return;
  const player = campaignPlayer(s);
  if (!player.eliminated && armiesOf(s, player.id).length === 0) player.eliminated = true;
  if (!player.eliminated) return;
  s.winner = 'none';
  clog(s, `The run is over, in galaxy ${s.universe}, with ${s.petals} petal${s.petals === 1 ? '' : 's'} grabbed.`);
  tell(s, runOverScene(s.universe));
}

/** Petals grabbed at a wormhole: a few for reaching it, more for every share of the strip conquered, more each universe. */
export function wormholePetals(s: CampaignState): number {
  const systems = s.nodes.filter((n) => !n.heart && !n.home && !n.challenge).length;
  const share = Math.min(1, s.conquered / Math.max(1, systems));
  return Math.max(1, Math.round((CAMPAIGN.petalBase + CAMPAIGN.petalShare * share) * (1 + 0.5 * (s.universe - 1)) * (1 + (s.run?.petalBonus ?? 0))));
}

/** Through the wormhole: petals grabbed, and on into the next universe (the flagship and everything aboard come too). */
function crossWormhole(s: CampaignState, f: Faction) {
  const petals = wormholePetals(s);
  s.petals += petals;
  if (f.id === s.playerId) {
    gainXp(s, CAMPAIGN.xpGalaxy);
    // Founders' Hoard: materials for every new galaxy.
    if (s.run?.hoard) {
      f.materials += s.run.hoard;
      clog(s, `The Founders' Hoard opens: +${s.run.hoard} materials.`, undefined, f.id);
    }
  }
  clog(s, `${f.name} takes the wormhole, grabbing ${petals} Stellari petal${petals === 1 ? '' : 's'} on the way through.`);
  tell(s, wormholeCrossedScene(s.universe, petals));
  // (Out of a rift's galaxy, on into the run's next.)
  s.rift = undefined;
  s.spin = undefined;
  s.ringSpins = undefined;
  buildUniverse(s, s.universe + 1);
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

function newTurn(s: CampaignState) {
  s.turn += 1;
  darkenBehind(s);
  s.phase = 'player';
  for (const a of s.armies) {
    a.moved = a.refit = false;
    a.steps = 0;
    // A hero who mends repairs their army as the turn begins.
    const mend = armyBonus(s, a).mend;
    if (mend && a.damage) a.damage = Math.max(0, a.damage - mend);
  }
  // Regional stability: what was marked gives way, and once stability has run out, the next column is marked.
  for (const n of s.nodes) if (n.collapsing) collapse(s, n);
  if (!s.winner) checkVictory(s);
  if (s.winner) return;
  if (regionalStability(s) <= 0) markCollapses(s);
  else if (regionalStability(s) <= 2) tell(s, instabilityScene());
  const p = campaignPlayer(s);
  const left = regionalStability(s);
  clog(s, `— Turn ${s.turn}. ${left > 0 ? `Regional stability: ${left} turn${left === 1 ? '' : 's'}.` : `The strip is collapsing: ${p.name} has ${CAMPAIGN.columns + 1 - s.collapseCol} column${CAMPAIGN.columns + 1 - s.collapseCol === 1 ? '' : 's'} left.`}`);
}

function endFactionTurn(s: CampaignState, f: Faction) {
  for (const n of s.nodes) n.hazard = n.hazard.filter((id) => id !== f.id);
}

// ---------------------------------------------------------------------------
// AI factions
// ---------------------------------------------------------------------------

function stabilise(s: CampaignState, f: Faction, n: CampaignNode) {
  f.materials -= CAMPAIGN.stabiliseCost;
  n.stableUntil = s.turn + CAMPAIGN.stabiliseTurns + 1;
  clog(s, `${f.name} stabilises ${n.name}. It holds for ${CAMPAIGN.stabiliseTurns} more turns.`, n.id, f.id);
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------


function spendMaterials(f: Faction, amount: number) {
  if (f.materials < amount) throw new GameError('Not enough materials');
  f.materials -= amount;
}

export function applyCampaignAction(prev: CampaignState, action: CampaignAction): CampaignState {
  // (The last scene, the ending, can still be read once it is over.)
  if (prev.winner && action.type !== 'readStory' && action.type !== 'petalsBanked') throw new GameError('The run is over.');
  const s = structuredClone(prev);
  if (action.type === 'readStory') {
    s.story.queue.shift();
    return s;
  }
  if (action.type === 'petalsBanked') {
    s.petalsBanked = s.petals;
    s.xpBanked = s.xp ?? 0;
    s.starsBanked = s.starsTaken ?? 0;
    return s;
  }
  const f = campaignPlayer(s);

  if (s.battle && action.type !== 'finishBattle') throw new GameError('Finish the battle first.');
  if (s.phase === 'ai' && action.type !== 'finishBattle' && action.type !== 'chooseCard' && action.type !== 'aiStep') throw new GameError('Wait for the other factions to finish their turns.');
  if (s.conquest && action.type !== 'conquer') throw new GameError('Decide the fate of the conquered system first.');
  if (s.cardRewards.length && !['chooseCard', 'finishBattle', 'conquer', 'aiStep', 'dismissLoot'].includes(action.type)) throw new GameError('Choose your card first');

  switch (action.type) {
    case 'move': {
      const army = armyById(s, action.armyId);
      if (army.owner !== f.id) throw new GameError('That army is not yours.');
      moveArmy(s, army, action.toId);
      break;
    }
    case 'deckAdd': {
      const army = armyById(s, action.armyId);
      if (army.owner !== f.id) throw new GameError('That army is not yours.');
      const problem = deckAddProblem(f, army, action.defId);
      if (problem) throw new GameError(problem);
      f.reserve.splice(f.reserve.indexOf(action.defId), 1);
      army.deck.push(action.defId);
      break;
    }
    case 'deckRemove': {
      const army = armyById(s, action.armyId);
      if (army.owner !== f.id) throw new GameError('That army is not yours.');
      const problem = deckRemoveProblem(army, action.defId);
      if (problem) throw new GameError(problem);
      army.deck.splice(army.deck.lastIndexOf(action.defId), 1);
      f.reserve.push(action.defId);
      break;
    }
    case 'recycle': {
      // At a space station: a card of the flagship's deck.
      if (action.nodeId) {
        const n = nodeById(s, action.nodeId);
        const why = recycleProblem(s, f, n, action.defId);
        if (why) throw new GameError(why);
        const army = flagship(s, f.id)!;
        army.deck.splice(army.deck.lastIndexOf(action.defId), 1);
        ((n.station as Extract<Station, { kind: 'armory' }>).used ??= {}).recycle = true;
        const value = recycleValue(action.defId);
        f.materials += value;
        clog(s, `${f.name} recycles ${cardDef(action.defId).name} for ${value} materials.`, n.id, f.id);
        break;
      }
      const i = f.reserve.indexOf(action.defId);
      if (i < 0) throw new GameError(`${cardDef(action.defId).name} is not in your reserve.`);
      f.reserve.splice(i, 1);
      const value = recycleValue(action.defId);
      f.materials += value;
      clog(s, `${f.name} recycles ${cardDef(action.defId).name} for ${value} materials.`);
      break;
    }
    case 'research':
      takeResearch(s, f, nodeById(s, action.nodeId), action.projectId);
      break;
    case 'stabilise': {
      const n = nodeById(s, action.nodeId);
      const problem = stabiliseProblem(f, n);
      if (problem) throw new GameError(problem);
      stabilise(s, f, n);
      break;
    }
    case 'healArmy': {
      const army = armyById(s, action.armyId);
      if (army.owner !== f.id) throw new GameError('That army is not yours.');
      if (nodeById(s, army.nodeId).station?.kind !== 'armory') throw new GameError('Your flagship can only be repaired at a space station.');
      if (army.damage <= 0) throw new GameError(`${cardDef(army.general).name}'s army is not damaged.`);
      spendMaterials(f, CAMPAIGN.armyHealCost);
      army.damage -= 1;
      while (action.all && army.damage > 0 && f.materials >= CAMPAIGN.armyHealCost) {
        f.materials -= CAMPAIGN.armyHealCost;
        army.damage -= 1;
      }
      break;
    }
    case 'finishBattle': {
      if (!s.battle) throw new GameError('There is no battle to finish.');
      const before = lootMark(s);
      const game = action.auto ? simulateBattle(action.game) : action.game;
      const mine = game.players.find((p) => !p.isAI);
      resolveBattle(s, game, action.salvage);
      const loot = lootSince(s, before, !!mine && game.winnerId === mine.id);
      // (Shown on the map only if it brought something.)
      if (loot.materials || loot.xp || loot.petals || loot.relics.length || loot.cards.length) s.loot = loot;
      else delete s.loot;
      break;
    }
    case 'dismissLoot':
      delete s.loot;
      break;
    case 'takeBoon': {
      if (!s.boon) throw new GameError('There is nothing to choose.');
      const army = flagship(s, s.playerId);
      if (action.pick === 'health') {
        f.sunBonus = (f.sunBonus ?? 0) + 5;
        clog(s, `${f.name}'s sun is tempered by the cold: +5 max health, for good.`);
      } else if (army) {
        army.damage = Math.max(BALANCE.minHeat, army.damage - 6);
        clog(s, `${f.name}'s sun drinks in the cold: cooled by 6.`);
      }
      s.boon = undefined;
      break;
    }
    case 'prophetPick': {
      if (!s.prophet) throw new GameError('There is no prophet waiting.');
      const offer = action.index === null ? null : s.prophet.offers[action.index];
      const army = flagship(s, s.playerId);
      if (action.index !== null && !offer) throw new GameError('That is not one of the offers.');
      if (offer && army) {
        const i = army.deck.indexOf(offer.card);
        if (i >= 0) {
          army.deck[i] = markedId(offer.mark, offer.card);
          clog(s, `The Dark Prophet marks ${cardDef(offer.card).name}: ${NYX_MARK_NAME[offer.mark]}, for good.`, s.prophet.nodeId, f.id);
        }
      } else clog(s, 'The Dark Prophet is turned away.', s.prophet.nodeId, f.id);
      s.prophet = undefined;
      break;
    }
    case 'struggle':
      if (!s.struggle) throw new GameError('No one has come for your command.');
      startStruggle(s);
      break;
    case 'struggleChoice': {
      if (!s.beaten) throw new GameError('There is no one to decide on.');
      const before = lootMark(s);
      decideBeaten(s, action.recruit);
      const loot = lootSince(s, before, true);
      if (!action.recruit && (loot.materials || loot.petals)) s.loot = loot;
      break;
    }
    case 'dream':
      if (!s.dream) throw new GameError('There is no dream.');
      if (s.struggle) throw new GameError('Your command is contested first.');
      startDream(s);
      break;
    case 'chooseEmblem': {
      const pick = s.emblemChoice?.[action.index];
      if (!pick) throw new GameError('There is no emblem to choose.');
      (f.relics ??= []).push(pick);
      clog(s, `${f.name} takes ${pick.name}.`, undefined, f.id);
      s.emblemChoice = undefined;
      break;
    }
    case 'conquer': {
      if (!s.conquest) throw new GameError('There is nothing to decide.');
      const n = nodeById(s, s.conquest.nodeId);
      const army = s.armies.find((a) => a.id === s.conquest!.armyId);
      s.conquest = null;
      conquer(s, f, n, army);
      break;
    }
    case 'chooseCard': {
      const reward = s.cardRewards[0];
      if (!reward) throw new GameError('No card to choose.');
      if (action.defId !== null && !reward.options.includes(action.defId)) throw new GameError('That card is not on offer.');
      s.cardRewards.shift();
      if (action.defId && reward.toDeck !== undefined) takeSalvage(s, f, s.armies.find((a) => a.id === reward.toDeck), action.defId, reward.take);
      else if (action.defId) {
        clog(s, `${f.name} takes ${cardDef(action.defId).name}.`);
        gainCard(s, f, action.defId);
      }
      break;
    }
    case 'buyCard':
      buyCard(s, f, nodeById(s, action.nodeId), action.index);
      break;
    case 'fuse': {
      const [a, b] = [f.reserve[action.a], f.reserve[action.b]];
      if (!a || !b || action.a === action.b) throw new GameError('Choose two different cards from your reserve.');
      const problem = fusionProblem(a, b);
      if (problem) throw new GameError(problem);
      spendMaterials(f, fusionCost(a, b));
      for (const i of [action.a, action.b].sort((x, y) => y - x)) f.reserve.splice(i, 1);
      const id = fusedId(a, b);
      f.reserve.push(id);
      clog(s, `${f.name} fuses ${cardDef(a).name} and ${cardDef(b).name} into ${cardDef(id).name}.`);
      break;
    }
    case 'fuseDeck': {
      const n = nodeById(s, action.nodeId);
      const why = fuseProblem(s, f, n, action.a, action.b);
      if (why) throw new GameError(why);
      const army = flagship(s, f.id)!;
      spendMaterials(f, fusionCost(action.a, action.b));
      for (const id of [action.a, action.b]) army.deck.splice(army.deck.lastIndexOf(id), 1);
      const id = fusedId(action.a, action.b);
      army.deck.push(id);
      ((n.station as Extract<Station, { kind: 'armory' }>).used ??= {}).fuse = true;
      clog(s, `${f.name} fuses ${cardDef(action.a).name} and ${cardDef(action.b).name} into ${cardDef(id).name}.`, n.id, f.id);
      break;
    }
    case 'deckSwap': {
      const army = armyById(s, action.armyId);
      if (army.owner !== f.id) throw new GameError('That army is not yours.');
      const problem = deckSwapProblem(f, army, action.slot, action.reserveIndex);
      if (problem) throw new GameError(problem);
      const out = army.deck[action.slot];
      army.deck[action.slot] = f.reserve[action.reserveIndex];
      f.reserve[action.reserveIndex] = out;
      break;
    }
    case 'endTurn':
      // (No one else moves: the next turn begins at once.) Time Dense Space turns a notch.
      endFactionTurn(s, f);
      turnTime(s);
      s.aiQueue = [];
      s.aiStepwise = undefined;
      newTurn(s);
      break;
    case 'aiStep':
      throw new GameError('It is your turn.');
  }
  noticeStory(s);
  return s;
}

/** The side of the current battle the player is on (0 = attacker), or null. */
export function playerSeat(s: CampaignState): 0 | 1 | null {
  if (!s.battle) return null;
  if (s.battle.attacker === s.playerId) return 0;
  if (s.battle.defender === s.playerId) return 1;
  return null;
}
