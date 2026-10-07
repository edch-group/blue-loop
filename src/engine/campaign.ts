/**
 * Campaign mode: a dying universe, up to four of its eight races fighting over its last warm worlds, and a
 * march on the Heart, the star at its centre, where the Infinite Stellari is said to grow (see story.ts).
 *
 * Each faction flies one flagship, led by its hero (one of its race's Hero cards, picked as the campaign
 * begins), with a deck of up to ten cards. The flagship moves one route a turn; moving into a system it
 * doesn't hold is a battle, fought under the campaign's own rules (game.ts: GameSetup.campaign): its cards
 * stand in the ship's rooms, and the ship can be upgraded room by room. Armouries and research stations
 * lie about the map: a flagship standing in one can buy its cards (each once) or take its one upgrade (for
 * Wisdom, which builds a point a turn). Claiming the Heart wins; so does holding half the universe.
 *
 * Pure and deterministic like the battle engine: `applyCampaignAction`
 * clones the state, uses the seeded RNG stored in it, and throws GameError on
 * invalid actions. Battles are ordinary Blue Loop games (see game.ts) created
 * from campaign state and fed back in with `finishBattle` once they are over.
 */
import { chooseAIAction } from './ai';
import { CARDS, cardDef, copyLimit, fusedId, fusionProblem, RACE_NAMES } from './cards';
import { BALANCE } from './balance';
import { applyAction, createGame, GameError, isGameOver } from './game';
import { nextRandom, randomInt, shuffleInPlace } from './rng';
import type { BattleModifiers, GameState, PlayerSetup, ShipRooms } from './types';
import { HEROES, heroBonus, heroLevel, learnProblem, heroSkill, makeItem, RACE_SLOTS, itemValue, skillPoints, SKILL_TREES, type HeroState, type Item, type ItemRarity, type SlotKind } from './heroes';
import { RESEARCH, researchBonus, researchProject, type ResearchState } from './research';
import { makeModule, MODULE_KINDS, moduleValue, type ShipModule } from './modules';
import { runBonuses, type RunBonuses } from './meta';
import {
  contactScene,
  firstConquestScene,
  GENERALS,
  heartSightedScene,
  introScene,
  collapseScene,
  instabilityScene,
  LOST_RACES,
  lostRaidScene,
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
  /** Wisdom gained each turn (spent on research stations' upgrades). */
  wisdomPerTurn: 1,
  /** Armouries and research stations on each universe's strip, and how many cards an armoury stocks (each sold once). */
  armories: 3,
  researchStations: 3,
  armoryStock: 6,
  /** Wisdom for a research station's upgrade, by the upgrade's tier (1–4). */
  researchWisdom: [3, 5, 8, 12],
  /** A hero's own attack and defence before training (they sit in the command room, so start sturdier). */
  heroAttack: 0,
  heroDefence: 2,
  /** The most skill points a hero can put into each of attack and defence. */
  trainMax: 5,
  /** Ship upgrades: credits for the next level (base + per level already built), and each part's most. */
  shipBase: 4,
  shipPerLevel: 4,
  shipMax: { defence: 3, attack: 2, command: 3, shields: 3, hull: 4 },
  /** The command room's defence to start with (on top of the slot's own: 3 in all), and the hull's max health a level. */
  commandRoom: 1,
  hullHealth: 1,
  /** Cards a station (a system with no flagship in it) fights with, by tier, and the Heart's Wardens. */
  stationDeck: [4, 6, 8],
  heartDeck: 10,
  /** Cards a system can hold as its garrison. They start its defence already in play. */
  garrisonSlots: 3,
  startCredits: 6,
  startMaterials: 6,
  /** Credits to repair one point of damage on a system. */
  healCostPerPoint: 1,
  /** Fortifying a system: each level gives its defender extra max health. Credits: base + per level already built. */
  maxFortification: 3,
  fortifyBaseCost: 4,
  fortifyCostPerLevel: 4,
  fortifyHealth: 2,
  /** Absorb pays this many turns of the system's yield at once. */
  absorbTurns: 3,
  /** Materials for a fusion, before the two cards' prices. */
  fusionBase: 4,
  /** Neutral sentinels' suns start this much hotter, by tier (the outer systems are the easiest to take). */
  sentinelHeat: [2, 1, 0],
  /** Damage cap on a system (added to its sun's starting heat in battles). */
  maxDamage: 4,
  /** Damage an attacker's home system takes when the attack is repelled. */
  repelledDamage: 2,
  /** Rewards for winning a battle. */
  winCredits: 3,
  winMaterials: 2,
  /** Rewards for completing a campaign mission (plus a card choice). */
  missionCredits: 4,
  missionMaterials: 3,
  cardChoices: 3,
  activeMissions: 3,
  /** Control this share of all systems to win outright. */
  dominationShare: 0.5,
  /** When this turn ends, the faction controlling the most systems wins. */
  turnLimit: 160,
  /**
   * Each universe is a strip: `lanes` rows of systems, `columns` long, the lanes linked to their neighbours here and
   * there so they intertwine; the wormhole lies past the far end. Map units between columns and lanes.
   */
  lanes: 4,
  columns: 13,
  colGap: 420,
  laneGap: 330,
  /** The map's size (map units): the strip, and the wormhole past its far end. */
  mapSystems: 53,
  mapWidth: 170 * 2 + 13 * 420,
  mapHeight: 170 * 2 + 3 * 330,
  mapMargin: 170,
  /** Worlds with something extra to find (credits or research), taken with the system. */
  bonusPlanets: 4,
  /** Roaming raiders: in the first universe, one more each universe after, at most. They hunt a flagship this near. */
  raiders: 2,
  raidersMax: 7,
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
  /** Anomalies scattered between systems; each changes battles fought from the systems within its reach. */
  anomalies: 3,
  /** Safety cap on simulated (auto-resolved) battles. */
  battleActionCap: 6000,
  /** Damage (heat carried) an army takes when its attack is repelled, and the most it can carry. */
  armyRepelledDamage: 2,
  /** Credits to repair one point of an army's damage (in a system you hold). */
  armyHealCost: 1,
  /** Finite Stellari: blooms on this many systems, each giving this much a turn to whoever holds it, for this many turns. */
  stellariaBlooms: 10,
  stellariaCredits: 3,
  stellariaMaterials: 3,
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
  /** Each home has one route out, to a system whose sentinels start this much hotter (a weakened first foe). */
  gateHeat: 4,
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
   * dimming takes. By routes from the Heart (index 1 = next to it): extra credits and materials each turn,
   * and extra max health for whoever defends there.
   */
  coreYield: [0, 2, 1, 1],
  /**
   * Every sun's max health in a battle, by how far the system fought over lies from the Heart (index 0: the
   * Heart; past the end, the rim's): 10 out at the rim where the campaign starts, rising to the card game's
   * 24 at the Heart. Both sides start from it; fortification, a brown dwarf, anomalies, the Heart's Wardens
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
  yield: { credits: number; materials: number };
  /** Neutral defenders' strength (0–2). */
  tier: number;
  /** Set on a faction's starting system. */
  home?: string;
  /** A scanner array: whoever holds it sees systems two links away, not just one (fog of war). */
  scanner?: boolean;
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
  /** The one system a home's route leads to: its defenders start weakened (much hotter), until it is taken. */
  gate?: boolean;
  /** What kind of star it is (an ordinary yellow star if unset): see STAR_TYPES. */
  star?: StarType;
  /** An armoury or a research station: a flagship standing here can use it. */
  station?: Station;
  /** Where it lies on the strip: its column (0 where the run starts) and lane. */
  col?: number;
  lane?: number;
  /** Something extra on one of its worlds, taken with the system. */
  bonus?: { credits?: number; wisdom?: number };
  /** Burnt out by a supernova: nothing to take, but open to pass through. */
  ruined?: boolean;
}

/**
 * A station on the map. An armoury sells each of its cards once (for materials); a research station has one
 * upgrade, taken once by whoever gets there first (for Wisdom). Within an anomaly's reach, both are better.
 */
export type Station = { kind: 'armory'; cards: string[] } | { kind: 'research'; project: string; takenBy?: string };

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
    boon: 'Never dims, and is the last of its ring to collapse.',
    cost: 'Its worlds yield 1 credit less.',
  },
  white: {
    name: 'White dwarf',
    text: 'The hot, dense core of a star that died long ago.',
    boon: '+2 materials a turn.',
    cost: 'Battles here are long: every sun starts 2 cooler.',
  },
  brown: {
    name: 'Brown dwarf',
    text: 'A failed star, barely warm. Easy to overlook; hard to dig out.',
    boon: 'Its defender has +3 max health.',
    cost: 'Its worlds yield 1 less of each.',
  },
  neutron: {
    name: 'Neutron star',
    text: 'A city-sized star spinning hundreds of times a second; its beam sweeps the dark.',
    boon: '+2 credits and +1 materials a turn, and whoever holds it sees two links out.',
    cost: 'Battles here are volatile: every sun heats by 1 each day.',
  },
};

export type AnomalyKind = 'blackHole' | 'nebula' | 'darkMatter' | 'pulsar';

export interface AnomalyDef {
  kind: AnomalyKind;
  name: string;
  /** What it does to battles fought from a system within its reach. */
  text: string;
  modifiers: BattleModifiers;
  /** Reach, in map units. */
  radius: number;
}

/** Every anomaly is a trade-off: a boon and a cost for whoever fights from a system near it. */
export const ANOMALIES: Record<AnomalyKind, AnomalyDef> = {
  blackHole: {
    kind: 'blackHole',
    name: 'Black Hole',
    text: 'Its gravity well drinks heat: +2 max health, but your opening hand is 1 card smaller.',
    modifiers: { maxHealthDelta: 2, openingHand: -1 },
    radius: 240,
  },
  nebula: {
    kind: 'nebula',
    name: 'Nebula',
    text: 'Hidden in the gas: +1 shield every day, but your sun starts 1 hotter.',
    modifiers: { shieldPerTurn: 1, startingHeat: 1 },
    radius: 280,
  },
  darkMatter: {
    kind: 'darkMatter',
    name: 'Dark Matter Cluster',
    text: 'Unseen mass to mine: draw 1 extra card every day, but your sun heats by 1 every day.',
    modifiers: { extraDraw: 1, heatPerTurn: 1 },
    radius: 240,
  },
  pulsar: {
    kind: 'pulsar',
    name: 'Pulsar',
    text: 'Its steady beam steadies your sun: it cools by 1 every day, but you have 2 less max health.',
    modifiers: { coolPerTurn: 1, maxHealthDelta: -2 },
    radius: 240,
  },
};

export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  x: number;
  y: number;
}

/** Add two sets of battle modifiers together. */
export function mergeModifiers(a: BattleModifiers, b: BattleModifiers): BattleModifiers {
  const out: BattleModifiers = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof BattleModifiers, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Anomalies whose reach covers a system. */
export function nodeAnomalies(s: CampaignState, n: CampaignNode): Anomaly[] {
  return (s.anomalies ?? []).filter((a) => Math.hypot(n.x - a.x, n.y - a.y) <= ANOMALIES[a.kind].radius);
}

/** The combined battle modifiers (and their descriptions) for fighting from a system. */
export function anomalyEffects(s: CampaignState, n: CampaignNode) {
  const found = nodeAnomalies(s, n);
  if (!found.length) return null;
  let modifiers: BattleModifiers = {};
  for (const a of found) modifiers = mergeModifiers(modifiers, ANOMALIES[a.kind].modifiers);
  return { modifiers, conditions: found.map((a) => ({ name: ANOMALIES[a.kind].name, text: ANOMALIES[a.kind].text })) };
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
  credits: number;
  materials: number;
  /** Builds a point a turn; research stations' upgrades are paid for with it. */
  wisdom: number;
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
  /** Black holes, nebulae and the like, lying between systems (missing in older saves). */
  anomalies?: Anomaly[];
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
  /** Take a research station's upgrade (your flagship must stand there), for Wisdom. */
  | { type: 'research'; nodeId: string }
  /** A hero spends a skill point. */
  | { type: 'learnSkill'; hero: string; skill: string }
  /** A hero puts a skill point into their own attack or defence. */
  | { type: 'train'; hero: string; stat: 'attack' | 'defence' }
  /** Upgrade a part of the flagship, for credits. */
  | ({ type: 'upgradeShip' } & ShipPart)
  /** Fit a module from the stores into a room (one already there goes back to the stores), or take one out. */
  | { type: 'fitModule'; moduleId: string; room: number }
  | { type: 'unfitModule'; room: number }
  /** A hero puts on gear (from the faction's finds), in a slot it fits; or takes it off. */
  | { type: 'equip'; hero: string; itemId: string; slot: string }
  | { type: 'unequip'; hero: string; slot: string }
  | { type: 'healArmy'; armyId: string; all?: boolean }
  /** The oldest story scene has been read. */
  | { type: 'readStory' }
  /** Hand back the battle once it is over (or ask for it to be auto-resolved from here). */
  /** `salvage`: the card the player salvaged from the beaten side (salvageOptions), or null to take none. */
  | { type: 'finishBattle'; game: GameState; auto?: boolean; salvage?: string | null }
  | { type: 'conquer'; choice: ConquestChoice }
  | { type: 'chooseCard'; defId: string | null }
  | { type: 'heal'; nodeId: string; all?: boolean }
  | { type: 'fortify'; nodeId: string }
  /** Buy a card from an armoury your flagship stands in (each card is sold once). */
  | { type: 'buyCard'; nodeId: string; index: number }
  /** Fuse two reserve cards into one that does both (for materials; it cannot be undone). */
  | { type: 'fuse'; a: number; b: number }
  /** Swap a reserve card into an army's deck slot (the slot's card goes to reserve). The deck must stay legal. */
  | { type: 'deckSwap'; armyId: string; slot: number; reserveIndex: number }
  /** Station a reserve card in a system's garrison. */
  | { type: 'station'; nodeId: string; index: number }
  | { type: 'recall'; nodeId: string; uid: string }
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
  { id: 'c_scorched', name: 'Scorched Stars', text: 'Supernova a system.', target: 1, counting: true, value: stat('novas') },
  { id: 'c_bulwark', name: 'Bulwark', text: 'Win a defence.', target: 1, counting: true, value: stat('defences') },
  { id: 'c_warlord', name: 'Warlord', text: 'Win 3 battles.', target: 3, counting: true, value: stat('battlesWon') },
  { id: 'c_blitz', name: 'Blitz', text: 'Win a battle within 6 rounds.', target: 1, counting: true, value: stat('swiftWins') },
  { id: 'c_cold', name: 'Cold Victory', text: 'Win a battle with your sun at 0 or colder.', target: 1, counting: true, value: stat('coldWins') },
  {
    id: 'c_fortress',
    name: 'Fortress',
    text: 'Have 3 cards stationed in one system.',
    target: 3,
    counting: false,
    value: (f, s) => Math.max(0, ...s.nodes.filter((n) => n.owner === f.id).map((n) => n.garrison.filter((g) => g.status === 'stationed').length)),
  },
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

/**
 * Fog of war: the systems a faction can see. Its own, those linked to them,
 * and, from a system with a scanner, those two links away. A system being
 * fought over is always in view.
 */
/** Whether a faction could know of a log entry: its own doing, news everyone hears, or something in its sight. */
export function logInSight(s: CampaignState, e: CampaignLogEntry, factionId: string, seen = visibleNodes(s, factionId)): boolean {
  if (e.who === factionId) return true;
  if (e.at) return e.at.some((id) => seen.has(id));
  return !e.who;
}

export function visibleNodes(s: CampaignState, factionId: string): Set<string> {
  const seen = new Set<string>();
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const look = (n: CampaignNode, scanner: boolean) => {
    seen.add(n.id);
    for (const a of n.links) {
      seen.add(a);
      if (scanner) for (const b of byId.get(a)!.links) seen.add(b);
    }
  };
  for (const n of s.nodes) if (n.owner === factionId) look(n, !!n.scanner || n.star === 'neutron');
  // An army sees the routes out of wherever it stands.
  for (const a of s.armies) if (a.owner === factionId) look(byId.get(a.nodeId)!, armyBonus(s, a).sight > 0);
  // On the strip, the way ahead can be seen: every lane, a few columns on from the flagship and the systems held
  // (more from a scanner), and one back.
  const reach: [number, number][] = [];
  for (const n of s.nodes) if (n.owner === factionId && n.col !== undefined) reach.push([n.col, n.scanner ? 5 : 3]);
  for (const a of s.armies) if (a.owner === factionId) {
    const c = byId.get(a.nodeId)?.col;
    if (c !== undefined) reach.push([c, armyBonus(s, a).sight > 0 ? 5 : 3]);
  }
  for (const n of s.nodes) if (n.col !== undefined && reach.some(([c, r]) => n.col! >= c - 1 && n.col! <= c + r)) seen.add(n.id);
  if (s.battle) seen.add(s.battle.nodeId);
  // The Heart's light reaches everywhere: the supermassive star at the centre is always in view.
  for (const n of s.nodes) if (n.heart) seen.add(n.id);
  // The collapse is felt everywhere: a system about to go is always in view.
  for (const n of s.nodes) if (n.collapsing) seen.add(n.id);
  return seen;
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

/** Credits for a ship part's next level (null at its most, or no such room). */
export function shipUpgradeCost(ship: Ship, p: ShipPart): number | null {
  if ((p.part === 'defence' || p.part === 'attack') && !(p.room >= 0 && p.room < BALANCE.tableauSlots)) return null;
  const level = shipLevel(ship, p);
  if (level >= CAMPAIGN.shipMax[p.part]) return null;
  return CAMPAIGN.shipBase + level * CAMPAIGN.shipPerLevel;
}

/** A hero's attack and defence in the command room: the baseline, and what they have trained. */
export function heroStats(f: Faction | undefined, hero: string): { attack: number; defence: number } {
  const t = f?.heroes?.[hero]?.train;
  return { attack: CAMPAIGN.heroAttack + (t?.attack ?? 0), defence: CAMPAIGN.heroDefence + (t?.defence ?? 0) };
}

/** Why a hero can't train a stat (null if they can). */
export function trainProblem(f: Faction, hero: string, stat: 'attack' | 'defence'): string | null {
  if (f.hero && hero !== f.hero) return 'That is not your hero.';
  const h = heroState(f, hero);
  if ((h.train?.[stat] ?? 0) >= CAMPAIGN.trainMax) return `${cardDef(hero).name}'s ${stat} is fully trained.`;
  if (skillPoints(h, hero) < 1) return 'No skill points: win battles to gain levels.';
  return null;
}

/** Wisdom a research station's upgrade costs. */
export function researchWisdom(projectId: string): number {
  return CAMPAIGN.researchWisdom[(researchProject(projectId)?.tier ?? 1) - 1];
}

/** Why a faction can't use a station here (null if it can): its flagship has to stand in it. */
export function stationProblem(s: CampaignState, f: Faction, n: CampaignNode): string | null {
  if (!n.station) return `${n.name} has no station.`;
  if (flagship(s, f.id)?.nodeId !== n.id) return `Your flagship must be at ${n.name} to use its ${n.station.kind === 'armory' ? 'space station' : 'research station'}.`;
  return null;
}

/** Why a faction can't take a research station's upgrade (null if it can). */
export function researchProblem(s: CampaignState, f: Faction, n: CampaignNode): string | null {
  const why = stationProblem(s, f, n);
  if (why) return why;
  if (n.station?.kind !== 'research') return `${n.name} has no research station.`;
  if (n.station.takenBy) return `${n.name}'s research has already been taken.`;
  if (f.research?.done.includes(n.station.project)) return 'You have that upgrade already.';
  const cost = researchWisdom(n.station.project);
  if (f.wisdom < cost) return `Not enough Wisdom (need ${cost}, have ${f.wisdom}).`;
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
    if (n.owner === army.owner || (n.ruined && !n.owner && !there)) {
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
  ensureScanners(s);
  return s;
}

/** Older saves have no scanners: place them as a new campaign would (about one system in six, never a home). */
export function ensureScanners(s: CampaignState) {
  if (s.nodes.some((n) => n.scanner !== undefined)) return;
  for (const n of s.nodes) n.scanner = !n.home && scannerRoll(n.id);
}

function scannerRoll(id: string): boolean {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 6 === 0;
}

/** Credits for the next fortification level on a system (null at the maximum). */
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
  // (No income by the turn: credits and materials come from systems taken, and the worlds with something extra.)
  return { credits: 0, materials: 0 };
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
export function armyDeck(race: number, general: string): string[] {
  const r = ((race % RACE_NAMES.length) + RACE_NAMES.length) % RACE_NAMES.length;
  const plain = (c: (typeof CARDS)[number]) => c.kind !== 'command' && c.rarity !== 'anomaly' && !c.fusion && !c.spendAll;
  const mine = CARDS.filter((c) => c.race === r && plain(c));
  const own = [...mine.filter((c) => c.kind === 'attack').slice(0, 2), ...mine.filter((c) => c.kind === 'defence').slice(0, 1)].map((c) => c.id);
  const deck = [general, ...own.flatMap((id) => [id, id])];
  for (const id of ['coronal_lance', 'deflector_grid', 'heat_sink', ...GUARD_NEUTRALS]) {
    if (deck.length >= CAMPAIGN.armySize) break;
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

const GUARD_NEUTRALS = ['coronal_lance', 'thermal_exchange', 'photon_drill', 'scatter_shot', 'plasma_relay', 'gravity_sling', 'nova_shell', 'cryo_vault', 'heat_sink', 'deflector_grid', 'deep_scanners', 'solar_mirror'];

/**
 * A race's plain 30-card deck, for those who defend without an army (neutral sentinels, and a system's own
 * guard): neutral pairs, a taste of the race's own, and its first general's Heroes. (Armies fight with 10.)
 */
export function starterDeck(race: number): string[] {
  const r = ((race % RACE_NAMES.length) + RACE_NAMES.length) % RACE_NAMES.length;
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
    anomalies: [],
    battle: null,
    conquest: null,
    cardRewards: [],
    phase: 'player',
    aiQueue: [],
    winner: null,
    log: [],
  };
  const race = (((setup.race ?? 0) % RACE_NAMES.length) + RACE_NAMES.length) % RACE_NAMES.length;
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
    credits: CAMPAIGN.startCredits + run.credits,
    materials: CAMPAIGN.startMaterials + run.materials,
    wisdom: run.wisdom,
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
  s.factions.push({ id: 'lost', name: 'Raiders', isAI: true, race: 0, credits: 0, materials: 0, wisdom: 0, ship: newShip(), reserve: [], missions: [], missionDeck: [], stats: emptyStats(), eliminated: false, lost: true });
  for (let k = 0; k < CAMPAIGN.activeMissions; k++) drawMission(s, me);
  buildUniverse(s, 1);
  const army = flagship(s, me.id)!;
  // Veterans: more of the race's own cards in the starting deck; Requisition: cards picked to start with.
  const own = CARDS.filter((c) => c.race === race && c.kind !== 'command' && c.rarity !== 'anomaly' && !c.fusion && !c.spendAll && !army.deck.includes(c.id));
  army.deck.push(...own.slice(0, run.cards).map((c) => c.id));
  // (Each Requisition: a pick of cards, the one chosen going straight into the deck.)
  for (let k = 0; k < run.picks; k++) s.cardRewards.push({ source: 'Requisition', options: randomCardChoices(s, me), toDeck: army.id });
  army.refit = false;
  tell(s, introScene(me.race, me.id));
  noticeStory(s);
  return s;
}

/** Turns of regional stability a universe starts with: fewer in each new universe (and more with the Anchored space perk). */
export function universeStability(s: CampaignState): number {
  return Math.max(CAMPAIGN.stabilityMin, CAMPAIGN.stabilityTurns - CAMPAIGN.stabilityStep * (s.universe - 1)) + (s.run?.grace ?? 0);
}

/**
 * A new universe: its strip of systems, the wormhole past its far end, its stations, anomalies and raiders, all
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
  s.anomalies = [];
  s.armies = s.armies.filter((a) => a.owner === me.id);
  // How hard a system is: by its third of the strip, and two steps more in every universe after the first.
  const lift = 2 * (universe - 1);
  const used = new Set<string>();
  const tints: MapPlanet['tint'][] = ['weapons', 'defences', 'economy', 'resources'];
  const jitter = (n: number) => Math.round((nextRandom(s) - 0.5) * 2 * n);
  const at = (c: number, l: number) => s.nodes[c * L + l];
  for (let c = 0; c < C; c++) {
    for (let l = 0; l < L; l++) {
      const name = nodeName(s, used);
      const tier = (c <= 3 ? 0 : c <= 8 ? 1 : 2) + lift;
      s.nodes.push({
        id: `n${c * L + l}`,
        name,
        x: CAMPAIGN.mapMargin + c * CAMPAIGN.colGap + (c ? jitter(55) : 0),
        y: CAMPAIGN.mapMargin + l * CAMPAIGN.laneGap + jitter(45),
        planets: Array.from({ length: 2 + randomInt(s, 3) }, (_, j) => ({ name: `${name} ${['I', 'II', 'III', 'IV'][j]}`, tint: tints[randomInt(s, tints.length)] })),
        owner: null,
        links: [],
        fortification: 0,
        damage: 0,
        garrison: [],
        hazard: [],
        // What taking it pays (once): more the harder it is.
        yield: { credits: 2 + randomInt(s, 2) + tier, materials: 1 + randomInt(s, 2) + Math.floor(tier / 2) },
        tier,
        col: c,
        lane: l,
      });
    }
  }
  // The wormhole, past the far end, in the middle of the lanes: a Stellari bloom and its guardian.
  const hole: CampaignNode = {
    id: `n${C * L}`,
    name: 'Stellari Wormhole',
    x: CAMPAIGN.mapMargin + C * CAMPAIGN.colGap,
    y: CAMPAIGN.mapMargin + ((L - 1) * CAMPAIGN.laneGap) / 2,
    planets: [],
    owner: null,
    links: [],
    fortification: 0,
    damage: 0,
    garrison: [],
    hazard: [],
    yield: { credits: 0, materials: 0 },
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
  // Lanes run the length of the strip; here and there two neighbouring lanes cross over (one way at a time, so
  // routes never cross), and now and then a rung joins them within a column.
  for (let c = 0; c < C; c++) {
    for (let l = 0; l < L; l++) {
      if (c + 1 < C) link(at(c, l), at(c + 1, l));
      else link(at(c, l), hole);
    }
    if (c + 1 >= C) continue;
    for (let l = 0; l + 1 < L; l++) {
      const r = nextRandom(s);
      if (r < 0.2) link(at(c, l), at(c + 1, l + 1));
      else if (r < 0.4) link(at(c, l + 1), at(c + 1, l));
      if (c > 0 && nextRandom(s) < 0.15) link(at(c, l), at(c, l + 1));
    }
  }
  // The flagship's arrival: a system of its own at the near end.
  const home = at(0, randomInt(s, L));
  home.owner = me.id;
  home.home = me.id;
  home.tier = 0;
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
    if (kind === 'red') n.yield.credits = Math.max(0, n.yield.credits - 1);
    if (kind === 'white') n.yield.materials += 2;
    if (kind === 'neutron') n.yield = { credits: n.yield.credits + 2, materials: n.yield.materials + 1 };
  }
  // Anomalies, in the gaps between columns (each touching the systems round it).
  const kinds: AnomalyKind[] = ['blackHole', 'nebula', 'darkMatter', 'pulsar'];
  const gaps = shuffleInPlace(s, Array.from({ length: C - 3 }, (_, i) => i + 2));
  for (const c of gaps.slice(0, CAMPAIGN.anomalies)) {
    const l = randomInt(s, L - 1);
    s.anomalies!.push({ id: `a${s.anomalies!.length}`, kind: kinds[randomInt(s, kinds.length)], x: Math.round(CAMPAIGN.mapMargin + (c + 0.5) * CAMPAIGN.colGap), y: Math.round(CAMPAIGN.mapMargin + (l + 0.5) * CAMPAIGN.laneGap) });
  }
  // Armouries and research stations along the strip; those within an anomaly's reach are better stocked.
  const sites = shuffleInPlace(s, s.nodes.filter((n) => open(n) && (n.col ?? 0) >= 2 && (n.col ?? 0) <= C - 2));
  for (const n of sites.slice(0, CAMPAIGN.armories)) n.station = { kind: 'armory', cards: armoryStock(s, n) };
  const projects = new Set<string>(me.research?.done ?? []);
  for (const n of sites.slice(CAMPAIGN.armories, CAMPAIGN.armories + CAMPAIGN.researchStations)) {
    const project = pickResearch(s, n, projects);
    projects.add(project);
    n.station = { kind: 'research', project };
  }
  // Worlds with something extra: credits or research, taken with the system.
  for (const [i, n] of sites.slice(CAMPAIGN.armories + CAMPAIGN.researchStations, CAMPAIGN.armories + CAMPAIGN.researchStations + CAMPAIGN.bonusPlanets).entries()) {
    n.bonus = i % 2 ? { wisdom: 3 + Math.floor(n.tier / 2) } : { credits: 4 + n.tier };
  }
  for (const n of s.nodes) n.scanner = open(n) && randomInt(s, 6) === 0;
  // The raiders: a few to start with, more in each universe, out past the first third.
  const haunts = shuffleInPlace(s, s.nodes.filter((n) => open(n) && (n.col ?? 0) >= 4));
  for (const n of haunts.slice(0, Math.min(CAMPAIGN.raidersMax, CAMPAIGN.raiders + universe - 1))) raiseLost(s, n);
  clog(s, universe === 1 ? `The run begins. ${me.name} holds ${home.name}, at the near end of the strip.` : `${me.name} comes through into universe ${universe}, at ${home.name}.`);
  tell(s, wormholeSightedScene(universe));
}

/** A new army, led by `general`, standing in `nodeId`. */
function raiseArmy(s: CampaignState, f: Faction, general: string, nodeId: string): Army {
  // A new army can be refitted on the turn it is raised, but marches from the next.
  const army: Army = { id: `army${++s.uidCounter}`, owner: f.id, general, nodeId, deck: armyDeck(f.race, general), damage: 0, moved: false, refit: true };
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

const uid = (s: CampaignState) => `g${++s.uidCounter}`;

function drawMission(s: CampaignState, f: Faction) {
  const id = f.missionDeck.shift();
  if (!id) return;
  const def = campaignMissionDef(id);
  f.missions.push({ id, base: def.counting ? def.value(f, s) : 0 });
}

/**
 * Cards a faction can be offered: its own race's cards (twice as often), neutral cards, globals and the
 * fine-tuned Command cards (a deck starts with two of its race's first leader); Anomalies are rarest.
 */
function offerPool(f: Faction): string[] {
  // (Generals are recruited, not bought: no Hero cards of the race's own.)
  return CARDS.filter((c) => !(c.kind === 'command' && GENERALS[f.race]?.includes(c.id)) && (c.race === undefined || c.race === f.race)).flatMap((c) =>
    Array(OFFER_WEIGHT[c.rarity ?? 'dwarf'] * (c.race === f.race ? 2 : 1)).fill(c.id) as string[],
  );
}

/** Cards an armoury can stock: any card but Heroes, globals and those made in play. */
const STOCK = CARDS.filter((c) => c.kind !== 'command' && c.kind !== 'global' && !c.fusion);

/**
 * An armoury's stock: CAMPAIGN.armoryStock different cards, each sold once. Mostly dwarf cards, with a fair
 * chance of a rare (Stellar) or Anomaly card among them; now and then nothing but dwarfs. Within an
 * anomaly's reach the odds are better, and there may be two.
 */
function armoryStock(s: CampaignState, n: CampaignNode): string[] {
  const near = nodeAnomalies(s, n).length > 0;
  const of = (r: ItemRarity) => shuffleInPlace(s, STOCK.filter((c) => (c.rarity ?? 'dwarf') === r).map((c) => c.id));
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

/** A research station's one upgrade: an early one, or (within an anomaly's reach) a deep one; each different while they last. */
function pickResearch(s: CampaignState, n: CampaignNode, taken: Set<string>): string {
  const near = nodeAnomalies(s, n).length > 0;
  const free = RESEARCH.filter((r) => !taken.has(r.id));
  const fits = free.filter((r) => (near ? r.tier >= 2 : r.tier <= 2));
  // (Once the deeper projects have all been placed, one near an anomaly repeats one of them: it is never shallow.)
  const pool = fits.length ? fits : near ? RESEARCH.filter((r) => r.tier >= 2) : free.length ? free : RESEARCH;
  return pool[randomInt(s, pool.length)].id;
}

function randomCardChoices(s: CampaignState, f: Faction): string[] {
  const pool = [...new Set(shuffleInPlace(s, offerPool(f)))];
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
  const pool = (race === undefined ? neutralDeck(s, tier) : starterDeck(race)).filter((id) => cardDef(id).kind !== 'command');
  // (Bigger the harder it is: 4 cards at first, 2 more a tier, up to a full 20.)
  const size = Math.min(20, 4 + 2 * tier);
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
  const deck = starterDeck(randomInt(s, RACE_NAMES.length));
  // (None of these is in a starting deck already: a deck holds at most two of a card.)
  SENTINEL_EXTRAS.slice(0, Math.max(0, tier) * 4).forEach((id, i) => (deck[i] = id));
  return deck;
}

/** The Heart Wardens' deck: the strongest sentinels, with the heaviest neutral cards mixed in. */
function wardenDeck(s: CampaignState): string[] {
  const deck = neutralDeck(s, Math.max(2, s.universe * 2));
  ['star_breaker', 'star_breaker', 'dreadnought', 'dreadnought', 'stellar_aegis', 'stellar_aegis'].forEach((id, i) => (deck[8 + i] = id));
  return deck;
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

/** A battle's suns' max health, from how near the Heart its system lies (as a change to the card game's). */
export function sunHealth(n: CampaignNode): number {
  // (10 at the near end of the first universe, 3 more a tier, up to 30; the wormhole's guardian's the most.)
  return Math.min(30, 10 + 3 * Math.max(0, n.tier) + (n.heart ? 2 : 0));
}
function sunBase(n: CampaignNode): BattleModifiers {
  return { maxHealthDelta: sunHealth(n) - BALANCE.supernovaAt };
}

/**
 * Each side of a battle as it would start: its sun's head start (positive: hotter) and its modifiers, with
 * the names of what made them (anomalies, the star, heroes...). The same sums as battleSetup, for showing.
 */
export function battleOdds(s: CampaignState, army: Army, target: CampaignNode) {
  const owner = target.owner ? factionById(s, target.owner) : null;
  const guard = defenderOf(s, target, army);
  const from = nodeById(s, army.nodeId);
  const fromFx = anomalyEffects(s, from);
  const targetFx = anomalyEffects(s, target);
  const atk = armyBonus(s, army);
  const def = guard && guard.id !== army.id ? armyBonus(s, guard) : null;
  const starBoth: BattleModifiers = target.star === 'white' ? { startingHeat: -2 } : target.star === 'neutron' ? { heatPerTurn: 1 } : {};
  const base = sunBase(target);
  const defMods = [
    base,
    target.fortification ? { maxHealthDelta: target.fortification * CAMPAIGN.fortifyHealth } : {},
    target.heart && !owner ? { maxHealthDelta: CAMPAIGN.heartWardenHealth } : {},
    starBoth,
    target.star === 'brown' ? { maxHealthDelta: 3 } : {},
    def?.mods ?? {},
    atk.foeMods,
  ].reduce(mergeModifiers, targetFx?.modifiers ?? {});
  const atkMods = [base, starBoth, atk.mods, def?.foeMods ?? {}].reduce(mergeModifiers, fromFx?.modifiers ?? {});
  const defHeat = (guard && guard.id !== army.id ? guard.damage : target.damage + (owner || target.heart ? 0 : CAMPAIGN.sentinelHeat[target.tier] ?? 0) + (target.gate && !owner ? CAMPAIGN.gateHeat : 0)) + atk.foeHeat + (defMods.startingHeat ?? 0);
  const atkHeat = army.damage + (def?.foeHeat ?? 0) + (atkMods.startingHeat ?? 0);
  const names = (fx: ReturnType<typeof anomalyEffects>) => (fx?.conditions ?? []).map((c) => c.name);
  return {
    attacker: { heat: atkHeat, mods: atkMods, sources: [...names(fromFx), ...(target.star === 'white' || target.star === 'neutron' ? [STAR_TYPES[target.star].name] : [])] },
    defender: {
      heat: defHeat,
      mods: defMods,
      sources: [...names(targetFx), ...(target.star && target.star !== 'red' ? [STAR_TYPES[target.star].name] : []), ...(target.fortification ? ['Fortified'] : []), ...(target.heart && !owner ? ['Heart Wardens'] : [])],
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
  const from = nodeById(s, army.nodeId);
  const owner = target.owner ? factionById(s, target.owner) : null;
  const guard = defenderOf(s, target, army);
  const g = garrisonBonus(target);
  const fromFx = anomalyEffects(s, from);
  const targetFx = anomalyEffects(s, target);
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
    ...(targetFx?.conditions ?? []),
    ...(target.heart && !owner ? [{ name: 'Heart Wardens', text: `The oldest guardians: +${CAMPAIGN.heartWardenHealth} max health.` }] : []),
    ...(target.gate && !owner && !guard ? [{ name: 'Weakened', text: `Cut off and failing: the sentinels' sun starts ${CAMPAIGN.gateHeat} hotter.` }] : []),
    ...(target.fortification ? [{ name: 'Fortified', text: `+${target.fortification * CAMPAIGN.fortifyHealth} max health (fortification level ${target.fortification}).` }] : []),
    ...(g.tableau.length || g.lightspeed ? [{ name: 'Garrison', text: `${g.tableau.length} stationed card${g.tableau.length === 1 ? '' : 's'} start in play.` }] : []),
  ];
  // Heroes: the attacking army's general, and a defending army's, bring their skills and gear.
  const atk = armyBonus(s, army);
  const def = guard ? armyBonus(s, guard) : null;
  // The defender: an army standing there (its own deck), else the system's own guard (its race's plain
  // deck), else neutral sentinels, or at the Heart its Wardens.
  const defenderName = guard ? (guard.lost ? armyLeader(guard) : `${armyLeader(guard)}'s flagship`) : owner ? `${target.name} Station` : target.heart ? 'The Heart Wardens' : `${target.name} Sentinels`;
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
      modifiers: [core, starBoth, atk.mods, def?.foeMods ?? {}, atkHull].reduce(mergeModifiers, fromFx?.modifiers ?? {}),
      ...(atk.skills.length ? { skills: atk.skills } : {}),
      ...(atk.boons.length ? { heroBoons: { hero: army.general, boons: atk.boons } } : {}),
      ...atkShip,
      conditions: [...(fromFx?.conditions ?? []), ...(target.star === 'white' || target.star === 'neutron' ? starCond : []), ...(def?.foeConditions ?? [])],
    },
    {
      name: owner ? `${defenderName} (${owner.name})` : defenderName,
      isAI: owner ? owner.isAI : true,
      deck: defenderDeck,
      // (The sentinels' heat, and a gate's weakness, are theirs: an army standing there brings its own.)
      heatDelta: (guard ? guard.damage : target.damage + (owner || target.heart ? 0 : CAMPAIGN.sentinelHeat[target.tier] ?? 0) + (target.gate && !owner ? CAMPAIGN.gateHeat : 0)) + atk.foeHeat,
      ...(defShip ? { hero: defShip.hero, heroStats: defShip.heroStats, ...(defShip.rooms ? { rooms: defShip.rooms } : {}), ...(defShip.opening ? { opening: defShip.opening } : {}) } : { rooms: stationRooms(target) }),
      tableau: [...(defShip?.tableau ?? []), ...g.tableau],
      lightspeed: g.lightspeed,
      modifiers: [fortified, wardens, core, starBoth, starDef, def?.mods ?? {}, atk.foeMods, defShip?.hull ?? {}].reduce(mergeModifiers, targetFx?.modifiers ?? {}),
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
  if (!isGameOver(g)) g.winnerId = g.players[1].id; // the defender holds
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
  if (target.owner === f.id || (target.ruined && !target.owner && !armyAt(s, toId))) {
    if (armyAt(s, toId)) throw new GameError(`An army already stands in ${target.name}.`);
    army.nodeId = toId;
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
    const h = !army.lost ? heroState(f, army.general) : null;
    if (h) h.xp += HEROES.lossXp;
    // (Taken without a fight, it may still hold gear.)
    if (!army.lost && nextRandom(s) < HEROES.itemChance + armyBonus(s, army).loot) findItem(s, f, army, target);
    if (!f.isAI) s.conquest = { nodeId: target.id, armyId: army.id };
    else conquer(s, f, target, aiConquestChoice(s, target), army);
    checkMissions(s);
    return;
  }
  const problem = army.lost ? null : armyDeckProblems(army.deck, army.general)[0];
  if (problem) throw new GameError(`${armyLeader(army)}'s deck isn't ready to fight: ${problem}`);
  army.moved = true;
  const players = battleSetup(s, army, target);
  const game = createGame({ seed: Math.floor(nextRandom(s) * 2 ** 31), players, campaign: true });
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
export function battleFinds(s: CampaignState, game: GameState): { items: Item[]; modules: ShipModule[] } {
  const none = { items: [], modules: [] };
  const b = s.battle;
  if (!b || !isGameOver(game) || !game.winnerId) return none;
  const attackerWon = game.winnerId === game.players[0].id;
  const fid = attackerWon ? b.attacker : b.defender;
  const f = fid ? s.factions.find((x) => x.id === fid) : undefined;
  if (!f || f.lost) return none;
  const army = s.armies.find((a) => a.id === (attackerWon ? b.armyId : b.defenderArmyId));
  const n = nodeById(s, b.nodeId);
  const next = spoilsRng(game, `${b.nodeId}:finds`);
  let uid = s.uidCounter;
  const items: Item[] = [];
  const modules: ShipModule[] = [];
  if (next() < HEROES.itemChance + (army ? armyBonus(s, army).loot : 0)) {
    const slots = RACE_SLOTS[f.race];
    items.push(makeItem(`item${++uid}`, slots[Math.floor(next() * slots.length)].kind, findRarity(n, next()), f.race, next()));
  }
  if (next() < CAMPAIGN.moduleChance) modules.push(makeModule(`mod${++uid}`, MODULE_KINDS[Math.floor(next() * MODULE_KINDS.length)], findRarity(n, next())));
  return { items, modules };
}

/** Take a battle's finds: into the winner's stores (the AI wears and fits them at once). */
function takeFinds(s: CampaignState, game: GameState) {
  const { items, modules } = battleFinds(s, game);
  if (!items.length && !modules.length) return;
  const b = s.battle!;
  const f = factionById(s, game.winnerId === game.players[0].id ? b.attacker : b.defender!);
  s.uidCounter += items.length + modules.length;
  (f.items ??= []).push(...items);
  (f.modules ??= []).push(...modules);
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
  const winnerSeat = attackerWon ? game.players[0] : game.players[1];
  const winner = attackerWon ? attacker : defender;

  // The winner's sun carries its heat on as damage; a repelled army takes a beating.
  const carried = Math.max(0, Math.min(CAMPAIGN.maxDamage, winnerSeat.heat));
  if (attackerWon) {
    if (army) army.damage = Math.max(army.damage, carried);
  } else {
    if (guard) guard.damage = carried;
    else target.damage = carried;
    if (army) army.damage = Math.min(CAMPAIGN.maxDamage, army.damage + CAMPAIGN.armyRepelledDamage);
  }

  // Heroes learn from every battle: most from a win.
  const xp = (a: Army | undefined, amount: number) => {
    if (!a || a.lost) return;
    const f = s.factions.find((x) => x.id === a.owner);
    if (!f) return;
    const h = heroState(f, a.general);
    const before = heroLevel(h.xp);
    h.xp += amount;
    if (heroLevel(h.xp) > before) clog(s, `${cardDef(a.general).name} reaches level ${heroLevel(h.xp)}.`, a.nodeId, f.id);
  };
  if (attackerWon) {
    xp(army, HEROES.winXp);
    xp(guard, HEROES.lossXp);
  } else {
    xp(army, HEROES.lossXp);
    xp(guard, HEROES.defendXp);
  }

  // Salvage from the beaten side: the player's pick (on the battle screen), or, auto-resolved, a choice owed.
  if (salvageable.length) {
    const f = factionById(s, s.playerId);
    const mine = attackerWon ? army : guard;
    if (salvage) takeSalvage(s, f, mine, salvage);
    else if (salvage === undefined) s.cardRewards.push({ source: 'Salvage', options: salvageable, ...(mine ? { toDeck: mine.id } : {}) });
  }

  if (winner) {
    winner.credits += CAMPAIGN.winCredits;
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
    // The Lost Races take what they can and keep nothing: a raided system is stripped and left neutral.
    if (attacker.lost) {
      raid(s, target, army);
      checkMissions(s);
      return;
    }
    if (!attacker.isAI) {
      if (target.heart) conquer(s, attacker, target, 'settle', army);
      else s.conquest = { nodeId: target.id, armyId: army?.id };
    } else conquer(s, attacker, target, target.heart ? 'settle' : aiConquestChoice(s, target), army);
  } else {
    clog(s, `${target.name} holds: ${attacker.name}'s attack is repelled.`, target.id, attacker.id);
  }
  checkMissions(s);
}

/**
 * A system taken. Conquered ('settle', or 'absorb' from older saves), it is held: it pays once (its credits and
 * materials), and counts towards the petals at the wormhole. Driven to supernova instead, it pays double, but is
 * left a burnt-out ruin that counts for nothing. Either way its extras (credits or research) are taken. The
 * wormhole's guardian beaten, the flagship goes through, into the next universe.
 */
function conquer(s: CampaignState, f: Faction, n: CampaignNode, choice: ConquestChoice, army?: Army) {
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
  const nova = choice === 'supernova';
  const credits = n.yield.credits * (nova ? 2 : 1);
  const materials = n.yield.materials * (nova ? 2 : 1);
  f.credits += credits;
  f.materials += materials;
  if (n.bonus?.credits) f.credits += n.bonus.credits;
  if (n.bonus?.wisdom) f.wisdom = (f.wisdom ?? 0) + n.bonus.wisdom;
  const extra = n.bonus?.credits ? ` and ${n.bonus.credits} more from its treasury` : n.bonus?.wisdom ? ` and ${n.bonus.wisdom} research from its archives` : '';
  n.bonus = undefined;
  n.yield = { credits: 0, materials: 0 };
  n.damage = 0;
  n.fortification = 0;
  if (nova) {
    n.owner = null;
    n.ruined = true;
    n.tier = 0;
    f.stats.novas += 1;
    clog(s, `${f.name} drives ${n.name}'s sun to supernova: +${credits} credits, +${materials} materials${extra}. Nothing is left but the way through.`, n.id, f.id);
  } else {
    n.owner = f.id;
    f.stats.settled += 1;
    s.conquered += 1;
    clog(s, `${f.name} conquers ${n.name}: +${credits} credits, +${materials} materials${extra}.`, n.id, f.id);
  }
  // The victors march in (a ruin is passed through like any other).
  if (army && s.armies.includes(army) && !armyAt(s, n.id)) army.nodeId = n.id;
}

/** Gear found by an army in a system it took: better the deeper the system lies. */
function findItem(s: CampaignState, f: Faction, army: Army, n: CampaignNode) {
  const rarity = findRarity(n, nextRandom(s));
  const slots = RACE_SLOTS[f.race];
  const kind: SlotKind = slots[randomInt(s, slots.length)].kind;
  const item = makeItem(`item${++s.uidCounter}`, kind, rarity, f.race, nextRandom(s));
  (f.items ??= []).push(item);
  clog(s, `${cardDef(army.general).name}'s army finds ${item.name} in ${n.name}.`, n.id, f.id);
  if (f.isAI) aiEquip(f);
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

/** The AI spends its hero's skill points: training first (defence, then attack, by turns), then down the first branch. */
function aiLearn(f: Faction) {
  for (const hero of [f.hero ?? GENERALS[f.race][0]]) {
    const h = heroState(f, hero);
    for (let i = 0; i < 2; i++) {
      const stat = (h.train?.defence ?? 0) <= (h.train?.attack ?? 0) ? 'defence' : 'attack';
      if (trainProblem(f, hero, stat) === null) train(h, stat);
    }
    for (const k of [...(SKILL_TREES[hero] ?? [])].sort((a, b) => a.branch - b.branch || a.tier - b.tier)) {
      if (learnProblem(hero, h, k.id) === null) learn(h, k.id);
    }
  }
}

function learn(h: HeroState, id: string) {
  h.skills.push(id);
}

function train(h: HeroState, stat: 'attack' | 'defence') {
  h.train ??= { attack: 0, defence: 0 };
  h.train[stat] += 1;
}

/** Take a research station's upgrade (the checks are researchProblem's). */
function takeResearch(s: CampaignState, f: Faction, n: CampaignNode) {
  const why = researchProblem(s, f, n);
  if (why) throw new GameError(why);
  const st = n.station as Extract<Station, { kind: 'research' }>;
  f.wisdom -= researchWisdom(st.project);
  st.takenBy = f.id;
  (f.research ??= { done: [] }).done.push(st.project);
  clog(s, `${f.name} takes ${researchProject(st.project)!.name} from ${n.name}'s research station.`, n.id, f.id);
}

/** Buy an armoury's card (the checks are buyProblem's): it goes to the reserve, and is gone from the armoury. */
function buyCard(s: CampaignState, f: Faction, n: CampaignNode, index: number) {
  const why = buyProblem(s, f, n, index);
  if (why) throw new GameError(why);
  const st = n.station as Extract<Station, { kind: 'armory' }>;
  const id = st.cards[index];
  f.materials -= buyPrice(s, f, id);
  st.cards.splice(index, 1);
  f.reserve.push(id);
  clog(s, `${f.name} buys ${cardDef(id).name} at ${n.name}'s space station.`, n.id, f.id);
}

/** Upgrade a part of a faction's flagship (for credits). */
function upgradeShip(f: Faction, part: ShipPart) {
  f.ship ??= newShip();
  const cost = shipUpgradeCost(f.ship, part);
  if (cost === null) throw new GameError('That part of the ship is fully upgraded.');
  spendCredits(f, cost);
  const r = f.ship.rooms;
  if (part.part === 'defence') r.defence[part.room] += 1;
  else if (part.part === 'attack') r.attack[part.room] += 1;
  else if (part.part === 'command') r.command += 1;
  else if (part.part === 'shields') f.ship.shields += 1;
  else f.ship.hull += 1;
}

/** The AI at a station: it takes the research if it can, and buys the best card it can afford with room in its deck. */
function aiStation(s: CampaignState, f: Faction) {
  const army = flagship(s, f.id);
  if (!army) return;
  const n = nodeById(s, army.nodeId);
  if (n.station?.kind === 'research' && researchProblem(s, f, n) === null) takeResearch(s, f, n);
  if (n.station?.kind === 'armory') {
    const rank = (id: string) => ARMORY_PRICE[cardDef(id).rarity ?? 'dwarf'] + (cardDef(id).race === f.race ? 2 : 0);
    for (let k = 0; k < 2; k++) {
      const st = n.station as Extract<Station, { kind: 'armory' }>;
      const best = st.cards.map((id, i) => ({ id, i })).filter(({ i }) => buyProblem(s, f, n, i) === null).sort((a, b) => rank(b.id) - rank(a.id))[0];
      if (!best) break;
      buyCard(s, f, n, best.i);
    }
  }
}

/** The AI upgrades its ship with spare credits: the rooms its cards stand in most, then shields and hull. */
function aiShip(f: Faction) {
  const order: ShipPart[] = [{ part: 'command' }, { part: 'defence', room: 2 }, { part: 'attack', room: 2 }, { part: 'hull' }, { part: 'defence', room: 1 }, { part: 'defence', room: 3 }, { part: 'shields' }, { part: 'attack', room: 1 }, { part: 'attack', room: 3 }, { part: 'defence', room: 0 }, { part: 'defence', room: 4 }];
  f.ship ??= newShip();
  for (const part of order) {
    const cost = shipUpgradeCost(f.ship, part);
    if (cost === null) continue;
    if (f.credits >= cost + 4) upgradeShip(f, part);
    return;
  }
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
  n.yield = { credits: 0, materials: 0 };
  n.stellaria = n.stellaria === undefined ? undefined : 0;
  n.scanner = false;
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

function checkMissions(s: CampaignState) {
  for (const f of s.factions) {
    if (f.eliminated || f.lost) continue;
    for (const m of [...f.missions]) {
      if (missionProgress(s, f, m) < campaignMissionDef(m.id).target) continue;
      f.missions = f.missions.filter((x) => x !== m);
      f.credits += CAMPAIGN.missionCredits;
      f.materials += CAMPAIGN.missionMaterials;
      const def = campaignMissionDef(m.id);
      clog(s, `${f.name} completes the mission ${def.name}: +${CAMPAIGN.missionCredits} credits, +${CAMPAIGN.missionMaterials} materials and a new card.`, undefined, f.id);
      const options = randomCardChoices(s, f);
      if (f.isAI) f.reserve.push(options[randomInt(s, options.length)]);
      else s.cardRewards.push({ source: def.name, options });
      drawMission(s, f);
    }
  }
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

function newTurn(s: CampaignState) {
  s.turn += 1;
  s.phase = 'player';
  // Garrison movements take a turn: arrivals take up station, departures return.
  for (const n of s.nodes) {
    const owner = n.owner ? factionById(s, n.owner) : null;
    for (const g of n.garrison) if (g.status === 'arriving') g.status = 'stationed';
    const leaving = n.garrison.filter((g) => g.status === 'leaving');
    if (owner) owner.reserve.push(...leaving.map((g) => g.defId));
    n.garrison = n.garrison.filter((g) => g.status !== 'leaving');
  }
  // Research goes on every turn (credits and materials come only from what is taken).
  for (const f of s.factions) if (!f.eliminated && !f.lost) f.wisdom = (f.wisdom ?? 0) + CAMPAIGN.wisdomPerTurn;
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
  checkMissions(s);
  const p = campaignPlayer(s);
  const left = regionalStability(s);
  clog(s, `— Turn ${s.turn}. ${left > 0 ? `Regional stability: ${left} turn${left === 1 ? '' : 's'}.` : `The strip is collapsing: ${p.name} has ${CAMPAIGN.columns + 1 - s.collapseCol} column${CAMPAIGN.columns + 1 - s.collapseCol === 1 ? '' : 's'} left.`}`);
}

function endFactionTurn(s: CampaignState, f: Faction) {
  for (const n of s.nodes) n.hazard = n.hazard.filter((id) => id !== f.id);
}

/** Runs AI turns until they are done, or one attacks the player (who then defends). */
/** One faction's turn (the next in the queue); once none are left, a new turn begins. */
function aiStep(s: CampaignState) {
  if (s.battle || s.winner) return;
  const id = s.aiQueue.shift();
  if (id) {
    const f = factionById(s, id);
    if (!f.eliminated) {
      if (f.lost) lostTurn(s, f);
      else aiTurn(s, f);
      endFactionTurn(s, f);
    }
  }
  if (!s.aiQueue.length && !s.battle && !s.winner) {
    s.aiStepwise = undefined;
    newTurn(s);
  }
}

function runAI(s: CampaignState) {
  while (s.aiQueue.length && !s.battle && !s.winner) {
    const f = factionById(s, s.aiQueue.shift()!);
    if (f.eliminated) continue;
    if (f.lost) lostTurn(s, f);
    else aiTurn(s, f);
    endFactionTurn(s, f);
  }
  if (!s.aiQueue.length && !s.battle && !s.winner) newTurn(s);
}

// ---------------------------------------------------------------------------
// AI factions
// ---------------------------------------------------------------------------

function aiConquestChoice(s: CampaignState, n: CampaignNode): ConquestChoice {
  // Settle by default; absorb a poor system far from home; scorch one that borders the player.
  const bordersPlayer = n.links.some((id) => nodeById(s, id).owner === s.playerId);
  const r = nextRandom(s);
  if (bordersPlayer && r < 0.15) return 'supernova';
  if (n.yield.credits + n.yield.materials <= 2 && r < 0.4) return 'absorb';
  return 'settle';
}

/** AI deck building: fill the flagship's deck from the reserve, then swap race cards in for neutral ones, keeping it legal. */
function improveDeck(f: Faction, army: Army) {
  for (let r = f.reserve.length - 1; r >= 0 && army.deck.length < CAMPAIGN.armySize; r--) {
    if (deckAddProblem(f, army, f.reserve[r]) === null) army.deck.push(f.reserve.splice(r, 1)[0]);
  }
  for (let r = 0; r < f.reserve.length; r++) {
    const id = f.reserve[r];
    const def = cardDef(id);
    if (def.race === undefined || def.kind === 'command') continue;
    const slot = army.deck.findIndex((d, i) => cardDef(d).race === undefined && cardDef(d).kind !== 'command' && deckSwapProblem(f, army, i, r) === null);
    if (slot < 0) continue;
    const out = army.deck[slot];
    army.deck[slot] = id;
    f.reserve[r] = out;
  }
}

function stabilise(s: CampaignState, f: Faction, n: CampaignNode) {
  f.materials -= CAMPAIGN.stabiliseCost;
  n.stableUntil = s.turn + CAMPAIGN.stabiliseTurns + 1;
  clog(s, `${f.name} stabilises ${n.name}. It holds for ${CAMPAIGN.stabiliseTurns} more turns.`, n.id, f.id);
}

/** One of the Lost Races takes to the dark from a system (it stands there, unowned). */
function raiseLost(s: CampaignState, n: CampaignNode): Army | null {
  const lost = s.factions.find((f) => f.lost);
  if (!lost) return null;
  const taken = new Set(s.armies.map((a) => a.lost));
  const names = LOST_RACES.filter((x) => !taken.has(x));
  const name = names.length ? names[randomInt(s, names.length)] : LOST_RACES[randomInt(s, LOST_RACES.length)];
  const tier = Math.max(1, n.tier);
  const full = neutralDeck(s, tier);
  const general = full.find((id) => cardDef(id).kind === 'command') ?? GENERALS[0][0];
  // (The last of a people: their leader, and a few cards, more the deeper they wander.)
  const deck = [general, ...stationDeck(s, { ...n, tier, heart: false })];
  const army: Army = { id: `army${++s.uidCounter}`, owner: lost.id, general, nodeId: n.id, deck, damage: 0, moved: true, lost: name };
  s.armies.push(army);
  return army;
}

/** A system raided by the Lost Races: stripped (garrison, defences) and left neutral; they move in. */
function raid(s: CampaignState, n: CampaignNode, army?: Army) {
  const prev = n.owner ? factionById(s, n.owner) : null;
  n.owner = null;
  n.home = undefined;
  n.garrison = [];
  n.fortification = 0;
  n.damage = 0;
  n.yield = { credits: Math.max(0, n.yield.credits - 1), materials: Math.max(0, n.yield.materials - 1) };
  if (army && s.armies.includes(army) && !armyAt(s, n.id)) army.nodeId = n.id;
  clog(s, `${army ? armyLeader(army) : 'The Lost Races'} raid ${n.name}, strip it, and leave it to the dark.`, n.id, army?.owner);
  if (prev?.id === s.playerId && army?.lost) tell(s, lostRaidScene(army.lost, n.name));
  if (prev) checkEliminated(s, prev);
  checkVictory(s);
}

/** The first step on the shortest way from one system to another (around anything collapsing), or null. */
function stepToward(s: CampaignState, from: string, to: string): string | null {
  const prev = new Map<string, string>([[from, from]]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q];
    if (id === to) break;
    for (const next of nodeById(s, id).links) {
      const n = nodeById(s, next);
      if (prev.has(next) || n.collapsed || (n.collapsing && next !== to)) continue;
      prev.set(next, id);
      queue.push(next);
    }
  }
  if (!prev.has(to)) return null;
  let at = to;
  while (prev.get(at) !== from) at = prev.get(at)!;
  return at;
}

/**
 * The raiders: they flee the collapse, hunt a flagship that comes near (moving in on it, and attacking it once
 * they reach it), raid a held system beside them now and then, and otherwise drift through unheld space.
 */
function lostTurn(s: CampaignState, f: Faction) {
  const prey = flagship(s, s.playerId);
  for (const army of armiesOf(s, f.id)) {
    if (s.battle || s.winner || !s.armies.includes(army) || army.moved) continue;
    const here = nodeById(s, army.nodeId);
    const near = here.links.map((id) => nodeById(s, id)).filter((n) => !n.collapsed && !n.collapsing && !n.heart);
    const free = near.filter((n) => !armyAt(s, n.id) && !n.owner);
    const drift = (to: CampaignNode) => {
      army.nodeId = to.id;
      army.moved = true;
      clog(s, `${armyLeader(army)} move on to ${to.name}.`, [here.id, to.id], f.id);
    };
    // Out of the collapse's way first: on, away from the near end.
    if (here.collapsing || (here.col ?? 0) <= s.collapseCol) {
      const ahead = free.filter((n) => (n.col ?? 0) > (here.col ?? 0));
      if (ahead.length) drift(ahead[randomInt(s, ahead.length)]);
      continue;
    }
    // The hunt: a flagship within reach is closed on, and attacked once it is next door.
    if (prey && army.damage <= 5 && hops(s, here.id, prey.nodeId) <= CAMPAIGN.raiderChase && nextRandom(s) < CAMPAIGN.raiderChaseChance) {
      const step = stepToward(s, here.id, prey.nodeId);
      const n = step ? nodeById(s, step) : null;
      if (n && step === prey.nodeId) {
        moveArmy(s, army, step);
        continue;
      }
      if (n && !armyAt(s, n.id) && !n.heart) {
        if (n.owner && !hazardBlocks(n, f.id)) moveArmy(s, army, n.id);
        else if (!n.owner) drift(n);
        continue;
      }
    }
    const held = near.filter((n) => n.owner && !armyAt(s, n.id) && !hazardBlocks(n, f.id));
    if (held.length && nextRandom(s) < CAMPAIGN.lostRaid && army.damage <= 5) {
      moveArmy(s, army, held[randomInt(s, held.length)].id);
      continue;
    }
    if (free.length && nextRandom(s) < CAMPAIGN.lostWander) drift(free[randomInt(s, free.length)]);
    // Resting, it mends.
    if (!army.moved) army.damage = Math.max(0, army.damage - 2);
  }
}

/** Hops from a system to the Heart. */
function hopsToHeart(s: CampaignState, id: string): number {
  const heart = s.nodes.find((n) => n.heart);
  return heart ? hops(s, id, heart.id) : 0;
}

function aiTurn(s: CampaignState, f: Faction) {
  const mine = ownedNodes(s, f.id);
  // 1. Repair damaged systems, then armies standing in its own systems.
  for (const n of [...mine].sort((a, b) => b.damage - a.damage)) {
    while (n.damage > 0 && f.credits >= CAMPAIGN.healCostPerPoint) {
      f.credits -= CAMPAIGN.healCostPerPoint;
      n.damage -= 1;
    }
  }
  // An army refits (repairs, deck changes) or marches, not both: the battered rest and mend, and now and
  // then one stands down to take on new cards.
  armiesOf(s, f.id).forEach((army, i) => {
    if (army.moved) return;
    const battered = army.damage > 5 && nodeById(s, army.nodeId).owner === f.id;
    if (battered || (s.turn % 5 === 0 && i === 0)) army.refit = true;
    while (army.refit && army.damage > 0 && nodeById(s, army.nodeId).owner === f.id && f.credits >= CAMPAIGN.armyHealCost + 4) {
      f.credits -= CAMPAIGN.armyHealCost;
      army.damage -= 1;
    }
  });
  // 2. At a station, it buys cards and takes research; with spare credits, it upgrades its ship.
  aiStation(s, f);
  aiShip(f);
  // 3. Its hero trains and learns, and wears what they have found.
  aiLearn(f);
  aiEquip(f);
  // 3b. Hold a collapsing home or bloom together, if it can.
  for (const n of mine) if ((n.home === f.id || (n.stellaria ?? 0) > 0) && stabiliseProblem(f, n) === null) stabilise(s, f, n);
  // 4. Improve its flagship's deck: new cards in, race cards for neutral ones (a short deck fills whenever it can).
  for (const army of armiesOf(s, f.id)) if (army.refit || army.deck.length < CAMPAIGN.armySize) improveDeck(f, army);
  // 5. Fortify the home system with spare credits.
  const home = mine.find((n) => n.home === f.id) ?? mine[0];
  const fcost = home ? fortifyCost(home) : null;
  if (home && fcost !== null && f.credits >= fcost + 10) {
    f.credits -= fcost;
    home.fortification += 1;
  }
  // 6. Garrison a border system with a spare card.
  const border = mine.filter((n) => n.links.some((id) => nodeById(s, id).owner !== f.id) && n.garrison.length < CAMPAIGN.garrisonSlots);
  const spare = f.reserve.findIndex(canGarrison);
  if (border.length && spare >= 0) {
    const n = border[randomInt(s, border.length)];
    n.garrison.push({ uid: uid(s), defId: f.reserve.splice(spare, 1)[0], status: 'arriving' });
  }
  // 7. Each army marches: on the weakest system in reach (most turns), else on towards the Heart. A fight
  // with the player pauses the AI's turn until it is fought.
  for (const army of armiesOf(s, f.id)) {
    if (s.battle || s.winner || !s.armies.includes(army) || army.moved) continue;
    const moves = armyMoves(s, army);
    if (!moves.length) continue;
    // (A station still to use draws it: an armoury with stock, research not yet taken.)
    const lure = (n: CampaignNode) => (n.station?.kind === 'armory' ? (n.station.cards.length ? 1 : 0) : n.station?.kind === 'research' && !n.station.takenBy ? 1 : 0);
    const strength = (n: CampaignNode) =>
      (n.heart ? 6 : n.owner ? 3 : n.tier) + n.garrison.length + (armyAt(s, n.id) ? 2 - armyAt(s, n.id)!.damage * 0.2 : 0) - n.damage * 0.3 + (n.owner === s.playerId ? 0.5 : 0) - ((n.stellaria ?? 0) > 0 ? 1 : 0) - lure(n);
    // Never into a system about to collapse; and out of one, before it does.
    const battles = moves.filter((m) => m.battle && !nodeById(s, m.toId).collapsing).map((m) => ({ ...m, node: nodeById(s, m.toId) }));
    if (nodeById(s, army.nodeId).collapsing) {
      const away = moves.filter((m) => !nodeById(s, m.toId).collapsing).sort((a, b) => Number(a.battle) - Number(b.battle) || hopsToHeart(s, a.toId) - hopsToHeart(s, b.toId))[0];
      if (away) {
        moveArmy(s, army, away.toId);
        continue;
      }
    }
    // A battered army rests (and is repaired) rather than attack.
    const ready = army.damage <= 5;
    const pick = battles.sort((a, b) => strength(a.node) - strength(b.node) || nextRandom(s) - 0.5)[0];
    // The Heart only once the army is strong and the campaign has run a while.
    const heartTooSoon = pick?.node.heart && (s.turn < 12 || army.damage > 2);
    if (pick && ready && !heartTooSoon && nextRandom(s) < 0.8) {
      moveArmy(s, army, pick.toId);
      continue;
    }
    // No fight: step through its own systems towards the Heart.
    const here = hopsToHeart(s, army.nodeId);
    const step = moves.filter((m) => !m.battle && !nodeById(s, m.toId).collapsing).find((m) => hopsToHeart(s, m.toId) < here);
    if (step && ready) moveArmy(s, army, step.toId);
  }
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

/** An army that has marched this turn can't refit (its deck, its repairs) until the next. */
function refitCheck(army: Army) {
  if (army.moved || (army.steps ?? 0) > 0) throw new GameError(`${armyLeader(army)}'s army has marched this turn: it can refit next turn.`);
}

function requireOwned(s: CampaignState, f: Faction, nodeId: string): CampaignNode {
  const n = nodeById(s, nodeId);
  if (n.owner !== f.id) throw new GameError('You do not control that system.');
  return n;
}

function spendCredits(f: Faction, amount: number) {
  if (f.credits < amount) throw new GameError(`Not enough credits (need ${amount}, have ${f.credits}).`);
  f.credits -= amount;
}
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
      refitCheck(army);
      const problem = deckAddProblem(f, army, action.defId);
      if (problem) throw new GameError(problem);
      f.reserve.splice(f.reserve.indexOf(action.defId), 1);
      army.deck.push(action.defId);
      army.refit = true;
      break;
    }
    case 'deckRemove': {
      const army = armyById(s, action.armyId);
      if (army.owner !== f.id) throw new GameError('That army is not yours.');
      refitCheck(army);
      const problem = deckRemoveProblem(army, action.defId);
      if (problem) throw new GameError(problem);
      army.deck.splice(army.deck.lastIndexOf(action.defId), 1);
      f.reserve.push(action.defId);
      army.refit = true;
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
    case 'learnSkill': {
      if (!GENERALS[f.race].includes(action.hero)) throw new GameError('That is not one of your heroes.');
      const h = heroState(f, action.hero);
      const why = learnProblem(action.hero, h, action.skill);
      if (why) throw new GameError(why);
      learn(h, action.skill);
      clog(s, `${cardDef(action.hero).name} learns ${heroSkill(action.hero, action.skill)!.name}.`, undefined, f.id);
      break;
    }
    case 'research':
      takeResearch(s, f, nodeById(s, action.nodeId));
      break;
    case 'train': {
      const why = trainProblem(f, action.hero, action.stat);
      if (why) throw new GameError(why);
      train(heroState(f, action.hero), action.stat);
      clog(s, `${cardDef(action.hero).name} trains: +1 ${action.stat}.`, undefined, f.id);
      break;
    }
    case 'fitModule': {
      const m = (f.modules ?? []).find((x) => x.id === action.moduleId);
      if (!m) throw new GameError('That module is not in your stores.');
      if (!Number.isInteger(action.room) || action.room < 0 || action.room > 4) throw new GameError('No such room.');
      fitModule(f, m, action.room);
      break;
    }
    case 'unfitModule': {
      const old = f.ship.modules?.[action.room];
      if (!old) throw new GameError('There is no module in that room.');
      f.ship.modules![action.room] = null;
      (f.modules ??= []).push(old);
      break;
    }
    case 'upgradeShip': {
      const { type: _t, ...part } = action;
      upgradeShip(f, part as ShipPart);
      break;
    }
    case 'equip': {
      if (!GENERALS[f.race].includes(action.hero)) throw new GameError('That is not one of your heroes.');
      const item = (f.items ?? []).find((x) => x.id === action.itemId);
      if (!item) throw new GameError('That gear is not in your stores.');
      const slot = RACE_SLOTS[f.race].find((x) => x.id === action.slot);
      if (!slot || slot.kind !== item.slot) throw new GameError(`${item.name} does not fit there.`);
      const h = heroState(f, action.hero);
      const old = h.gear[slot.id];
      h.gear[slot.id] = item;
      f.items = f.items!.filter((x) => x !== item);
      if (old) f.items.push(old);
      break;
    }
    case 'unequip': {
      const h = heroState(f, action.hero);
      const old = h.gear[action.slot];
      if (!old) throw new GameError('Nothing is worn there.');
      delete h.gear[action.slot];
      (f.items ??= []).push(old);
      break;
    }
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
      if (nodeById(s, army.nodeId).owner !== f.id) throw new GameError('An army can only be repaired in a system you hold.');
      if (army.damage <= 0) throw new GameError(`${cardDef(army.general).name}'s army is not damaged.`);
      refitCheck(army);
      spendCredits(f, CAMPAIGN.armyHealCost);
      army.damage -= 1;
      while (action.all && army.damage > 0 && f.credits >= CAMPAIGN.armyHealCost) {
        f.credits -= CAMPAIGN.armyHealCost;
        army.damage -= 1;
      }
      army.refit = true;
      break;
    }
    case 'finishBattle': {
      if (!s.battle) throw new GameError('There is no battle to finish.');
      resolveBattle(s, action.auto ? simulateBattle(action.game) : action.game, action.salvage);
      // A defence interrupts the AI factions' turns; carry on with them afterwards.
      if (s.phase === 'ai' && !s.aiStepwise) runAI(s);
      break;
    }
    case 'conquer': {
      if (!s.conquest) throw new GameError('There is nothing to decide.');
      const n = nodeById(s, s.conquest.nodeId);
      const army = s.armies.find((a) => a.id === s.conquest!.armyId);
      s.conquest = null;
      conquer(s, f, n, action.choice, army);
      checkMissions(s);
      break;
    }
    case 'chooseCard': {
      const reward = s.cardRewards[0];
      if (!reward) throw new GameError('No card to choose.');
      if (action.defId !== null && !reward.options.includes(action.defId)) throw new GameError('That card is not on offer.');
      s.cardRewards.shift();
      if (action.defId && reward.toDeck !== undefined) takeSalvage(s, f, s.armies.find((a) => a.id === reward.toDeck), action.defId);
      else if (action.defId) {
        f.reserve.push(action.defId);
        clog(s, `${f.name} adds ${cardDef(action.defId).name} to the collection.`);
      }
      break;
    }
    case 'heal': {
      const n = requireOwned(s, f, action.nodeId);
      if (n.damage <= 0) throw new GameError(`${n.name} is not damaged.`);
      spendCredits(f, CAMPAIGN.healCostPerPoint);
      n.damage -= 1;
      while (action.all && n.damage > 0 && f.credits >= CAMPAIGN.healCostPerPoint) {
        f.credits -= CAMPAIGN.healCostPerPoint;
        n.damage -= 1;
      }
      break;
    }
    case 'fortify': {
      const n = requireOwned(s, f, action.nodeId);
      const cost = fortifyCost(n);
      if (cost === null) throw new GameError(`${n.name} is fully fortified.`);
      spendCredits(f, cost);
      n.fortification += 1;
      clog(s, `${f.name} fortifies ${n.name} to level ${n.fortification}.`);
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
    case 'station': {
      const n = requireOwned(s, f, action.nodeId);
      if (n.garrison.length >= CAMPAIGN.garrisonSlots) throw new GameError(`${n.name}'s garrison is full.`);
      const id = f.reserve[action.index];
      if (!id) throw new GameError('No such card in reserve.');
      if (!canGarrison(id)) throw new GameError(`${cardDef(id).name} cannot garrison a system.`);
      f.reserve.splice(action.index, 1);
      n.garrison.push({ uid: uid(s), defId: id, status: 'arriving' });
      clog(s, `${f.name} sends ${cardDef(id).name} to ${n.name}. It arrives next turn.`);
      break;
    }
    case 'recall': {
      const n = requireOwned(s, f, action.nodeId);
      const g = n.garrison.find((x) => x.uid === action.uid);
      if (!g) throw new GameError('That card is not in the garrison.');
      if (g.status !== 'stationed') throw new GameError('Cards on the move cannot be redirected this turn.');
      g.status = 'leaving';
      clog(s, `${f.name} recalls ${cardDef(g.defId).name} from ${n.name}. It returns next turn.`);
      break;
    }
    case 'endTurn':
      endFactionTurn(s, f);
      s.phase = 'ai';
      s.aiQueue = s.factions.filter((o) => o.isAI && !o.eliminated).map((o) => o.id);
      if (action.stepwise) s.aiStepwise = true;
      else runAI(s);
      break;
    case 'aiStep':
      if (s.phase !== 'ai') throw new GameError('It is your turn.');
      if (s.battle) throw new GameError('Finish the battle first.');
      aiStep(s);
      break;
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
