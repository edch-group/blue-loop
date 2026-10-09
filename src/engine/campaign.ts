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
import { CARDS, cardDef, cardIn, copyLimit, fusedId, fusionProblem, presetDeck, RACE_NAMES } from './cards';
import { CORE_RACES, inMode, type GameMode } from './modes';
import { BALANCE } from './balance';
import { applyAction, createGame, DRAW, GameError, isDraw, isGameOver } from './game';
import { nextRandom, randomInt, shuffleInPlace } from './rng';
import type { BattleModifiers, GameState, PlayerSetup, ShipRooms } from './types';
import { OVERLORDS, overlordById, overlordHealth } from './cards-bosses';
import { HEROES, heroBonus, makeRelic, relicBonus, RACE_SLOTS, itemValue, type HeroState, type Item, type ItemRarity, type Relic, type SlotKind } from './heroes';
import { RESEARCH, researchBonus, researchProject, type ResearchState } from './research';
import { moduleValue, type ShipModule } from './modules';
import { runBonuses, type RunBonuses } from './meta';
import {
  contactScene,
  firstConquestScene,
  GENERALS,
  heartSightedScene,
  introScene,
  collapseScene,
  instabilityScene,
  lostSightedScene,
  stellariaSightedScene,
  type StoryScene,
  wormholeSightedScene,
  wormholeCrossedScene,
  runOverScene,
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
  mapHeight: 170 * 2 + 2 * 330,
  mapMargin: 170,
  /** Worlds with something extra to find (materials), taken with the system. */
  bonusPlanets: 3,
  /** (No raiders roam the strip any more; any in an older save are cleared out. These steered them.) */
  raiderChase: 3,
  raiderChaseChance: 0.7,
  /** Petals grabbed at a wormhole: a few for reaching it, more for every share of the strip conquered. */
  petalBase: 3,
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
  stabilityTurns: 8,
  collapseRamp: 12,
  /** Each new universe gives way sooner: this many turns fewer, down to the least. */
  stabilityStep: 2,
  stabilityMin: 3,
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
export const ARMORY_PRICE = { dwarf: 3, stellar: 5, anomaly: 8, race: 1 } as const;
/** How often each rarity turns up in the armory and mission rewards (relative weights). */
export const OFFER_WEIGHT = { dwarf: 4, stellar: 2, anomaly: 1 } as const;

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

export interface CampaignNode {
  id: string;
  name: string;
  /** Map position, within MAP_WIDTH × MAP_HEIGHT. */
  x: number;
  y: number;
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
  /** Burnt out by a supernova: nothing to take, but open to pass through. */
  ruined?: boolean;
}

/**
 * A station on the map. An armoury sells each of its cards once (for materials); a research station offers a few
 * upgrades, one of which the first flagship to get there takes, free (`project`, once taken). Deep in the strip,
 * both are better.
 */
export type Station = { kind: 'armory'; cards: string[] } | { kind: 'research'; options: string[]; project?: string; takenBy?: string };

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
    boon: 'Often left unguarded: about half hold a find, most often materials, sometimes cards or a relic.',
    cost: 'Its worlds are poor: 1 material less when taken.',
  },
  white: {
    name: 'White dwarf',
    text: 'The hot, dense core of a star that died long ago.',
    boon: 'The archives of the dead: about 2 in 5 hold a find, most often cards, sometimes a relic.',
    cost: 'Battles here are long: every sun starts 2 cooler.',
  },
  brown: {
    name: 'Brown dwarf',
    text: 'A failed star, barely warm. Easy to overlook; hard to dig out.',
    boon: 'Easy to overlook: more often than not a find, cards or a relic.',
    cost: 'When it is guarded, its defender has +3 max health.',
  },
  neutron: {
    name: 'Neutron star',
    text: 'A city-sized star spinning hundreds of times a second; its beam sweeps the dark.',
    boon: 'Rarely unguarded, but what it hides is rare: most often a relic, or cards.',
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
  modifiers: BattleModifiers;
}

/** Every galaxy is a trade-off, the same for both sides of every battle in it. */
export const GALAXIES: Record<GalaxyKind, GalaxyDef> = {
  blackHole: {
    kind: 'blackHole',
    name: 'Supermassive Black Hole',
    text: 'A supermassive black hole lies beneath this galaxy, its well drinking heat: every sun has +2 max health, but every opening hand is 1 card smaller.',
    modifiers: { maxHealthDelta: 2, openingHand: -1 },
  },
  pulsar: {
    kind: 'pulsar',
    name: 'Pulsar',
    text: 'A pulsar\'s beam sweeps this galaxy, steadying every sun: each cools by 1 every day, but has 2 less max health.',
    modifiers: { coolPerTurn: 1, maxHealthDelta: -2 },
  },
  meteors: {
    kind: 'meteors',
    name: 'Meteor Shower',
    text: 'Meteors rain through this galaxy: every sun starts 2 hotter, and every heat wave from the Stellari strikes every card for 1 too; but every opening hand is 1 card bigger.',
    modifiers: { startingHeat: 2, openingHand: 1, waveCardHeat: 1 },
  },
  nebula: {
    kind: 'nebula',
    name: 'Nebula',
    text: 'This galaxy lies deep in a nebula, hidden in its gas: every side gains 1 shield every day, but every sun starts 1 hotter.',
    modifiers: { shieldPerTurn: 1, startingHeat: 1 },
  },
  darkMatter: {
    kind: 'darkMatter',
    name: 'Dark Matter',
    text: 'Unseen mass threads this galaxy: every side draws 1 extra card every day, but a heat wave from the Stellari heats every sun by 1 every day, and strikes every card for 1.',
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
  return { modifiers: g.modifiers, conditions: [{ name: g.name, text: g.text }] };
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
  id: string;
  name: string;
  isAI: boolean;
  /** Which of the alien races this faction is (an index into RACE_NAMES, 0–7). */
  race: number;
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
  // Relics: their blessings on the hero's card, their curses' tolls on the army's own side.
  if (f && !a.lost && f.relics?.length) {
    const rel = relicBonus(f.relics);
    bonus.boons = [...bonus.boons, ...rel.boons];
    bonus.mods = mergeModifiers(bonus.mods, rel.mods);
  }
  // (The Fold drive, bought between runs: one more move a turn.)
  if (a.owner === s.playerId && s.run?.march) bonus.march = (bonus.march ?? 0) + s.run.march;
  return bonus;
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
  /** A battle the player is fighting (or can auto-resolve). */
  battle: BattleContext | null;
  /** The player won an attack and must decide the system's fate (the army that won it marches in if it is settled). */
  conquest: { nodeId: string; armyId?: string } | null;
  /**
   * Card choices owed to the player (from missions, relics, and salvage from a battle auto-resolved). A salvaged
   * card goes into that army's deck while it has room (`toDeck`), else the reserve.
   */
  cardRewards: { source: string; options: string[]; toDeck?: string }[];
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
  /** Break a reserve card down for materials. */
  | { type: 'recycle'; defId: string }
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
  | { type: 'petalsBanked' };

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
  return new Set(s.nodes.map((n) => n.id));
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
  return null;
}

/** Why a faction can't buy an armoury's card (null if it can). */
export function buyProblem(s: CampaignState, f: Faction, n: CampaignNode, index: number): string | null {
  const why = stationProblem(s, f, n);
  if (why) return why;
  if (n.station?.kind !== 'armory') return `${n.name} has no space station.`;
  const id = n.station.cards[index];
  if (!id) return 'That card has been sold.';
  if (f.materials < buyPrice(s, f, id)) return `Not enough materials (need ${buyPrice(s, f, id)}, have ${f.materials}).`;
  return null;
}

/** Where an army can go this turn: each linked system, and whether going there is a battle. */
export function armyMoves(s: CampaignState, army: Army): { toId: string; battle: boolean; surrender?: boolean }[] {
  if (army.moved || army.refit || (army.steps ?? 0) >= 1 + armyBonus(s, army).march) return [];
  const here = nodeById(s, army.nodeId);
  const out: { toId: string; battle: boolean; surrender?: boolean }[] = [];
  for (const id of here.links) {
    const n = nodeById(s, id);
    if (n.collapsed) continue;
    const there = armyAt(s, id);
    // (A system it holds, or a burnt-out ruin, is passed through freely.)
    if (n.owner === army.owner || ((n.ruined || n.cache) && !n.owner && !there)) {
      if (!there) out.push({ toId: id, battle: false });
      continue;
    }
    if (hazardBlocks(n, army.owner)) continue;
    out.push(surrenders(s, army, n) ? { toId: id, battle: false, surrender: true } : { toId: id, battle: true });
  }
  return out;
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
  if (copies >= copyLimit(defId)) return copyLimit(defId) === 1 ? `${cardDef(defId).name} is an Anomaly: one copy per deck.` : `At most ${BALANCE.maxCopies} copies of a card.`;
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

/** Bring a saved campaign up to the current rules (saves from before version 4 aren't kept: see the UI). */
export function migrateCampaign(s: CampaignState): CampaignState {
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
  /** A stationed Lightspeed card, set face down from the start (only the first). */
  lightspeed?: string;
}

/**
 * What a system's stationed cards do when it is attacked: they start the
 * battle already in the defender's tableau (a stationed Command card with its
 * first choice), and a stationed Lightspeed card starts set face down (only
 * one can be).
 */
export function garrisonBonus(n: CampaignNode): GarrisonBonus {
  const b: GarrisonBonus = { tableau: [] };
  for (const g of n.garrison) {
    if (g.status !== 'stationed') continue;
    const def = cardDef(g.defId);
    if (def.kind === 'lightspeed') {
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
  const own = [...mine.filter((c) => c.kind === 'attack').slice(0, 2), ...mine.filter((c) => c.kind === 'defence').slice(0, 1)].map((c) => c.id);
  const deck = [general, ...own.flatMap((id) => [id, id])];
  for (const id of ['coronal_lance', 'deflector_grid', 'heat_sink', ...GUARD_NEUTRALS, ...CORE_FILL]) {
    if (deck.length >= CAMPAIGN.armySize) break;
    if (!legalIn(mode, id)) continue;
    if (deck.filter((x) => x === id).length < 2) deck.push(id);
  }
  return deck.slice(0, CAMPAIGN.armySize);
}

/**
 * Why a flagship's deck is not ready to fight (empty if it is): its hero (the one Hero in it), at most 2 of any
 * card (1 of an Anomaly).
 */
export function armyDeckProblems(deck: string[], general: string): string[] {
  const out: string[] = [];
  if (!deck.includes(general)) out.push(`${cardDef(general).name} leads this flagship: their card must be in its deck.`);
  const heroes = deck.filter((id) => cardDef(id).kind === 'command' && id !== general);
  if (heroes.length) out.push(`A flagship has one hero: ${cardDef(heroes[0]).name} can't come aboard.`);
  const counts = new Map<string, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) if (n > copyLimit(id)) out.push(copyLimit(id) === 1 ? `${cardDef(id).name} is an Anomaly: one copy per deck.` : `At most ${BALANCE.maxCopies} copies of ${cardDef(id).name}.`);
  return out;
}

/** Whether a card can be in a deck in this mode (in Core, as its core version). */
export const legalIn = (mode: GameMode | undefined, id: string) => mode !== 'core' || inMode(cardIn(id, 'core'), 'core');

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
  const own = [...mine.filter((c) => c.kind === 'attack'), ...mine.filter((c) => c.kind !== 'attack')].slice(0, 3).map((c) => c.id);
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
  const race = (((setup.race ?? 0) % RACE_NAMES.length) + RACE_NAMES.length) % RACE_NAMES.length;
  // A core race's run is played in Core; a Lost Race's (unlocked with petals) in Lost Races.
  if (CORE_RACES.includes(race)) s.mode = 'core';
  const hero = setup.hero && GENERALS[race].includes(setup.hero) ? setup.hero : GENERALS[race][0];
  const ship = newShip();
  ship.hull = Math.min(CAMPAIGN.shipMax.hull, run.hull);
  ship.shields = Math.min(CAMPAIGN.shipMax.shields, run.shields);
  if (run.walls) ship.rooms.defence = ship.rooms.defence.map((d) => d + run.walls);
  const me: Faction = {
    id: 'f1',
    name: setup.playerName || 'Commander',
    isAI: false,
    race,
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
  // The raiders: the last of peoples the collapse has already taken, roaming the strip (and hunting).
  s.factions.push({ id: 'lost', name: 'Raiders', isAI: true, race: 0, materials: 0, ship: newShip(), reserve: [], missions: [], missionDeck: [], stats: emptyStats(), eliminated: false, lost: true });
  buildUniverse(s, 1);
  const army = flagship(s, me.id)!;
  // Veterans: more of the race's own cards in the starting deck; Requisition: cards picked to start with.
  const own = CARDS.filter((c) => c.race === race && c.kind !== 'command' && c.rarity !== 'anomaly' && !c.fusion && !c.spendAll && legalIn(s.mode, c.id) && !army.deck.includes(c.id));
  army.deck.push(...own.slice(0, run.cards).map((c) => c.id));
  // (Each Requisition: a pick of cards, the one chosen going straight into the deck.)
  for (let k = 0; k < run.picks; k++) s.cardRewards.push({ source: 'Requisition', options: randomCardChoices(s, me), toDeck: army.id });
  army.refit = false;
  tell(s, introScene(me.race, me.id, army.general));
  noticeStory(s);
  return s;
}

/** Turns of regional stability a universe starts with: fewer in each new universe (and more with the Anchored space perk). */
export function universeStability(s: CampaignState): number {
  return Math.max(CAMPAIGN.stabilityMin, CAMPAIGN.stabilityTurns - CAMPAIGN.stabilityStep * (s.universe - 1)) + (s.run?.grace ?? 0);
}

/**
 * A new universe: its galaxy, its strip of systems, the wormhole past its far end, its stations, all
 * tougher the further along the run is. The player's flagship arrives at a system of its own at the near end.
 */
function buildUniverse(s: CampaignState, universe: number) {
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
  const midY = CAMPAIGN.mapMargin + ((L - 1) * CAMPAIGN.laneGap) / 2;
  // The flagship's arrival: one system alone at the near end, in the middle, with a route into every lane.
  const home = blank('n0', nodeName(s, used), CAMPAIGN.mapMargin, midY, 0, 0, (L - 1) / 2);
  s.nodes.push(home);
  // The lanes, from the second column to the last before the wormhole.
  const grid: CampaignNode[][] = [];
  for (let c = 1; c < C; c++) {
    grid[c] = [];
    for (let l = 0; l < L; l++) {
      const tier = (c <= 2 ? 0 : c <= 5 ? 1 : 2) + lift;
      const n = blank(`n${s.nodes.length}`, nodeName(s, used), CAMPAIGN.mapMargin + c * CAMPAIGN.colGap + jitter(55), CAMPAIGN.mapMargin + l * CAMPAIGN.laneGap + jitter(45), tier, c, l);
      grid[c][l] = n;
      s.nodes.push(n);
    }
  }
  const at = (c: number, l: number) => grid[c][l];
  // The wormhole, past the far end, in the middle of the lanes: a Stellari bloom and its guardian.
  const hole: CampaignNode = {
    id: `n${s.nodes.length}`,
    name: 'Stellari Wormhole',
    x: CAMPAIGN.mapMargin + C * CAMPAIGN.colGap,
    y: midY,
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
  clog(s, universe === 1 ? `The run begins. ${me.name} holds ${home.name}, at the near end of the strip.` : `${me.name} comes through into universe ${universe}, at ${home.name}.`);
  tell(s, wormholeSightedScene(universe));
}

/** A new army, led by `general`, standing in `nodeId`. */
function raiseArmy(s: CampaignState, f: Faction, general: string, nodeId: string): Army {
  // A new army can be refitted on the turn it is raised, but marches from the next.
  const army: Army = { id: `army${++s.uidCounter}`, owner: f.id, general, nodeId, deck: armyDeck(f.race, general, s.mode), damage: 0, moved: false };
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
function offerPool(f: Faction, mode?: GameMode): string[] {
  // (Generals are recruited, not bought: no Hero cards of the race's own.)
  return CARDS.filter((c) => !(c.kind === 'command' && GENERALS[f.race]?.includes(c.id)) && (c.race === undefined || c.race === f.race) && legalIn(mode, c.id)).flatMap((c) =>
    Array(OFFER_WEIGHT[c.rarity ?? 'dwarf'] * (c.race === f.race ? 2 : 1)).fill(c.id) as string[],
  );
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
  const of = (r: ItemRarity) => shuffleInPlace(s, STOCK.filter((c) => (c.rarity ?? 'dwarf') === r && legalIn(s.mode, c.id)).map((c) => c.id));
  const dwarfs = of('dwarf');
  const stellar = of('stellar');
  const anomaly = of('anomaly');
  const rares: string[] = [];
  const plain = nextRandom(s) < (near ? 0.1 : 0.25);
  if (!plain) {
    const chances = near ? [0.95, 0.45] : [0.6, 0.1];
    for (const c of chances) if (nextRandom(s) < c) rares.push((nextRandom(s) < (near ? 0.45 : 0.2) ? anomaly : stellar).shift()!);
  }
  return shuffleInPlace(s, [...rares, ...dwarfs.slice(0, CAMPAIGN.armoryStock - rares.length)]);
}

/**
 * A research station's upgrades to pick from: early ones, or (deep in the strip) deeper ones, none already taken or
 * offered elsewhere while they last (topped up from the rest when they run short).
 */
function pickResearch(s: CampaignState, n: CampaignNode, taken: Set<string>): string[] {
  const near = deepIn(s, n);
  const free = RESEARCH.filter((r) => !taken.has(r.id));
  const fits = shuffleInPlace(s, free.filter((r) => (near ? r.tier >= 2 : r.tier <= 2)));
  const rest = shuffleInPlace(s, free.filter((r) => !fits.includes(r)));
  return [...fits, ...rest].slice(0, CAMPAIGN.researchOptions).map((r) => r.id);
}

/** Whether a system lies in the last third of its strip (its stations better stocked). */
export function deepIn(s: CampaignState, n: CampaignNode): boolean {
  return n.tier - 2 * (s.universe - 1) >= 2;
}

function randomCardChoices(s: CampaignState, f: Faction): string[] {
  const pool = [...new Set(shuffleInPlace(s, offerPool(f, s.mode)))];
  return pool.slice(0, CAMPAIGN.cardChoices);
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
  const d = Math.min(3, Math.max(0, n.heart ? 2 + Math.floor(n.tier / 3) : Math.floor(n.tier / 2)));
  return { defence: [d, d, d, d, d], attack: [0, 0, 0, 0, 0], command: 0 };
}

/** What a flagship brings to its side of a battle: its hero in the command room, its rooms, shields and hull. */
function flagshipSetup(s: CampaignState, army: Army): Pick<PlayerSetup, 'hero' | 'heroStats' | 'rooms' | 'opening' | 'tableau'> & { hull: BattleModifiers } {
  const f = s.factions.find((x) => x.id === army.owner);
  // The hero is in the deck, drawn and played like any card: only one who has learned Herald starts in play.
  if (army.lost || !f) return { hero: army.general, tableau: [], heroStats: { attack: CAMPAIGN.heroAttack + 1, defence: CAMPAIGN.heroDefence }, hull: {} };
  const ship = f.ship ?? newShip();
  return {
    hero: army.general,
    tableau: armyBonus(s, army).start ? [army.general] : [],
    heroStats: heroStats(f, army.general),
    rooms: ship.modules?.some(Boolean) ? { ...ship.rooms, boons: [0, 1, 2, 3, 4].map((r) => ship.modules?.[r]?.boons ?? []) } : ship.rooms,
    ...(ship.shields ? { opening: { shields: ship.shields } } : {}),
    hull: ship.hull ? { maxHealthDelta: ship.hull * CAMPAIGN.hullHealth } : {},
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
  SENTINEL_EXTRAS.slice(0, Math.max(0, tier) * 4).forEach((id, i) => (deck[i] = id));
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
  // (10 at the near end of the first universe, 3 more a tier, up to 20; the wormhole's guardian's the most.)
  return Math.min(BALANCE.supernovaAt, 10 + 3 * Math.max(0, n.tier) + (n.heart ? 2 : 0));
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
    ...(target.heart && !owner ? [{ name: 'Lost Overlord', text: `The wormhole's guardian: its sun has ${overlordHealth(s.universe)} max health. It takes one great action a day, its parts in turn: destroy a part to stop its action.` }] : []),
    ...(target.fortification ? [{ name: 'Fortified', text: `+${target.fortification * CAMPAIGN.fortifyHealth} max health (fortification level ${target.fortification}).` }] : []),
    ...(g.tableau.length || g.lightspeed ? [{ name: 'Garrison', text: `${g.tableau.length} stationed card${g.tableau.length === 1 ? '' : 's'} start in play.` }] : []),
  ];
  // Heroes: the attacking army's general, and a defending army's, bring their skills and gear.
  const atk = armyBonus(s, army);
  const def = guard ? armyBonus(s, guard) : null;
  // The defender: an army standing there (its own deck), else the system's own guard (its race's plain
  // deck), else neutral sentinels, or at the Heart its Wardens.
  // The wormhole's guardian: a Lost Overlord, its body in play (see cards-bosses.ts).
  const lord = target.heart && !owner && !guard ? overlordById(s.overlord ?? OVERLORDS[0].id) : null;
  const defenderName = guard ? (guard.lost ? armyLeader(guard) : `${armyLeader(guard)}'s flagship`) : owner ? `${target.name} Station` : lord ? lord.name : `${target.name} Sentinels`;
  const defenderDeck = guard ? guard.deck : stationDeck(s, target, owner?.race);
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
      ...atkShip,
      conditions: [...(fx?.conditions ?? []), ...(target.star === 'white' || target.star === 'neutron' ? starCond : []), ...(def?.foeConditions ?? [])],
    },
    {
      name: owner ? `${defenderName} (${owner.name})` : defenderName,
      isAI: owner ? owner.isAI : true,
      deck: lord ? [] : defenderDeck,
      ...(lord ? { boss: true } : {}),
      // (A system's damage is its own: an army standing there brings its own.)
      heatDelta: (guard ? guard.damage : target.damage) + atk.foeHeat,
      ...(defShip ? { hero: defShip.hero, heroStats: defShip.heroStats, ...(defShip.rooms ? { rooms: defShip.rooms } : {}), ...(defShip.opening ? { opening: defShip.opening } : {}) } : lord ? {} : { rooms: stationRooms(target) }),
      tableau: lord ? [lord.hero, ...lord.parts] : [...(defShip?.tableau ?? []), ...g.tableau],
      lightspeed: g.lightspeed,
      // (A Lost Overlord's sun is its own: well beyond any system's, and more in every universe.)
      modifiers: lord
        ? [{ maxHealthDelta: overlordHealth(s.universe) - BALANCE.supernovaAt }, starBoth, atk.foeMods].reduce(mergeModifiers, fx?.modifiers ?? {})
        : capDefence([fortified, wardens, guard ? {} : core, starBoth, starDef, def?.mods ?? {}, atk.foeMods, defShip?.hull ?? {}].reduce(mergeModifiers, fx?.modifiers ?? {}), fx?.modifiers, !!guard),
      ...(def?.skills.length ? { skills: def.skills } : {}),
      ...(guard && def?.boons.length ? { heroBoons: { hero: guard.general, boons: def.boons } } : {}),
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
  if (target.collapsed) throw new GameError(`${target.name} has collapsed. There is nothing left there.`);
  if (target.owner === f.id || ((target.ruined || target.cache) && !target.owner && !armyAt(s, toId))) {
    if (armyAt(s, toId)) throw new GameError(`An army already stands in ${target.name}.`);
    army.nodeId = toId;
    if (target.cache && !army.lost) takeCache(s, f, target, army);
    army.steps = (army.steps ?? 0) + 1;
    // (A hero who marches fast may go on, but not after a battle.)
    if (army.steps >= 1 + armyBonus(s, army).march) army.moved = true;
    clog(s, `${armyLeader(army)}'s army marches to ${target.name}.`, [here.id, toId], f.id);
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
export function salvageOptions(s: CampaignState, game: GameState): string[] {
  const b = s.battle;
  if (!b || !isGameOver(game) || !game.winnerId) return [];
  const human = (id: string | null) => !!id && id === s.playerId;
  const seat = human(b.attacker) ? 0 : human(b.defender) ? 1 : -1;
  if (seat < 0 || game.players[seat].id !== game.winnerId) return [];
  const foe = game.players[1 - seat];
  const cards = [...foe.deck, ...foe.hand, ...foe.tableau, ...foe.discard, ...(foe.fallen ?? []), ...(foe.lightspeed ? [foe.lightspeed] : [])];
  const ids = [...new Set(cards.flatMap((c) => [c.defId, ...(c.fused ?? []).map((f) => f.defId)]))]
    .filter((id) => {
      const def = cardDef(id);
      return !def.token && def.kind !== 'command';
    })
    .sort();
  // (A fixed shuffle, from the battle's own seed and place.)
  const next = spoilsRng(game, b.nodeId);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, CAMPAIGN.salvageChoices + (s.run?.salvage ?? 0));
}

/** A battle's own random numbers for its spoils: the same every time they're asked for (shown, then taken). */
function spoilsRng(game: GameState, salt: string): () => number {
  let h = game.rngState ^ 0x9e3779b9;
  for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) ^ 0x6a09e667) >>> 0) / 2 ** 32;
}

/** How fine a find is, by where it was found (r: a roll, 0–1): better the deeper the system lies. */
function findRarity(n: CampaignNode, r: number): ItemRarity {
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
  if (!b || !isGameOver(game) || !game.winnerId || isDraw(game)) return none;
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
    const slot = slots[Math.floor(next() * slots.length)].kind, rarity = findRarity(n, next()), roll = next();
    items.push(makeRelic(`item${++uid}`, slot, rarity, f.race, roll, next() < CAMPAIGN.curseChance));
  }
  // (No modules any more: the flagship is not fitted out.)
  void modules;
  return { items, modules };
}

/** Take a battle's finds: into the winner's stores (the AI wears and fits them at once). */
function takeFinds(s: CampaignState, game: GameState) {
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
function takeSalvage(s: CampaignState, f: Faction, army: Army | undefined, id: string) {
  f.reserve.push(id);
  if (army && army.owner === f.id && deckAddProblem(f, army, id) === null) {
    f.reserve.splice(f.reserve.lastIndexOf(id), 1);
    army.deck.push(id);
    clog(s, `${f.name} salvages ${cardDef(id).name}: it joins ${armyLeader(army)}'s deck.`, army.nodeId, f.id);
  } else clog(s, `${f.name} salvages ${cardDef(id).name}: it waits in the reserve.`, undefined, f.id);
}

function resolveBattle(s: CampaignState, game: GameState, salvage?: string | null) {
  const b = s.battle;
  if (!b) throw new GameError('There is no battle to finish.');
  if (!isGameOver(game)) throw new GameError('That battle is not over yet.');
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

  // The winner's sun carries its heat on as damage; a repelled army takes a beating.
  const carried = Math.max(0, Math.min(CAMPAIGN.maxDamage, winnerSeat.heat));
  if (draw) {
    // (Nothing carried on.)
  } else if (attackerWon) {
    if (army) army.damage = Math.max(army.damage, carried);
  } else {
    if (guard) guard.damage = carried;
    else target.damage = carried;
    if (army) army.damage = Math.min(CAMPAIGN.maxDamage, army.damage + CAMPAIGN.armyRepelledDamage);
  }

  // Salvage from the beaten side: the player's pick (on the battle screen), or, auto-resolved, a choice owed.
  if (salvageable.length) {
    const f = factionById(s, s.playerId);
    const mine = attackerWon ? army : guard;
    if (salvage) takeSalvage(s, f, mine, salvage);
    else if (salvage === undefined) s.cardRewards.push({ source: 'Salvage', options: salvageable, ...(mine ? { toDeck: mine.id } : {}) });
  }

  if (winner) {
    winner.materials += CAMPAIGN.winMaterials;
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
      clog(s, `${attacker.name} takes the relics of the ${guard.lost}: +${CAMPAIGN.lostRelicMaterials} materials.`, target.id, attacker.id);
      if (!attacker.isAI) s.cardRewards.push({ source: `Relics of the ${guard.lost}`, options: randomCardChoices(s, attacker) });
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
  if (n.heart) {
    if (army && s.armies.includes(army)) army.nodeId = n.id;
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
  clog(s, `${f.name} conquers ${n.name}: +${materials} materials${extra}.`, n.id, f.id);
  // The victors march in.
  if (army && s.armies.includes(army) && !armyAt(s, n.id)) army.nodeId = n.id;
}

/** A system with nothing to fight, flown into: what it holds is taken, and the system with it. */
function takeCache(s: CampaignState, f: Faction, n: CampaignNode, army: Army) {
  const c = n.cache!;
  n.cache = undefined;
  n.owner = f.id;
  n.yield = { materials: 0 };
  s.conquered += 1;
  if (c.kind === 'relic') return findItem(s, f, army, n);
  if (c.kind === 'materials') f.materials += c.amount;
  else if (!f.isAI) s.cardRewards.push({ source: `A derelict at ${n.name}`, options: randomCardChoices(s, f) });
  const what = c.kind === 'cards' ? 'a derelict, with cards to choose from' : `${c.amount} ${c.kind}`;
  clog(s, `${f.name} finds ${what} at ${n.name}.`, n.id, f.id);
}

/** A relic found by an army in a system it took: better the deeper the system lies, and now and then cursed. */
function findItem(s: CampaignState, f: Faction, army: Army, n: CampaignNode) {
  const rarity = findRarity(n, nextRandom(s));
  const slots = RACE_SLOTS[f.race];
  const kind: SlotKind = slots[randomInt(s, slots.length)].kind;
  const relic = makeRelic(`item${++s.uidCounter}`, kind, rarity, f.race, nextRandom(s), nextRandom(s) < CAMPAIGN.curseChance);
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
  clog(s, `The run is over, in universe ${s.universe}, with ${s.petals} petal${s.petals === 1 ? '' : 's'} grabbed.`);
  tell(s, runOverScene(s.universe));
}

/** Petals grabbed at a wormhole: a few for reaching it, more for every share of the strip conquered, more each universe. */
export function wormholePetals(s: CampaignState): number {
  const systems = s.nodes.filter((n) => !n.heart && !n.home).length;
  const share = Math.min(1, s.conquered / Math.max(1, systems));
  return Math.max(1, Math.round((CAMPAIGN.petalBase + CAMPAIGN.petalShare * share) * (1 + 0.5 * (s.universe - 1)) * (1 + (s.run?.petalBonus ?? 0))));
}

/** Through the wormhole: petals grabbed, and on into the next universe (the flagship and everything aboard come too). */
function crossWormhole(s: CampaignState, f: Faction) {
  const petals = wormholePetals(s);
  s.petals += petals;
  clog(s, `${f.name} takes the wormhole, grabbing ${petals} Stellari petal${petals === 1 ? '' : 's'} on the way through.`);
  tell(s, wormholeCrossedScene(s.universe, petals));
  buildUniverse(s, s.universe + 1);
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

function newTurn(s: CampaignState) {
  s.turn += 1;
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
  if (f.materials < amount) throw new GameError(`Not enough materials (need ${amount}, have ${f.materials}).`);
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
    return s;
  }
  const f = campaignPlayer(s);

  if (s.battle && action.type !== 'finishBattle') throw new GameError('Finish the battle first.');
  if (s.phase === 'ai' && action.type !== 'finishBattle' && action.type !== 'chooseCard' && action.type !== 'aiStep') throw new GameError('Wait for the other factions to finish their turns.');
  if (s.conquest && action.type !== 'conquer') throw new GameError('Decide the fate of the conquered system first.');
  if (s.cardRewards.length && !['chooseCard', 'finishBattle', 'conquer', 'aiStep'].includes(action.type)) throw new GameError('Choose your new card first.');

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
      resolveBattle(s, action.auto ? simulateBattle(action.game) : action.game, action.salvage);
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
      if (action.defId && reward.toDeck !== undefined) takeSalvage(s, f, s.armies.find((a) => a.id === reward.toDeck), action.defId);
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
      // (No one else moves: the next turn begins at once.)
      endFactionTurn(s, f);
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
