/**
 * Campaign mode: a dying universe, four races fighting over its last warm worlds, and a march on the Heart,
 * the star at its centre, where the Infinite Stellari is said to grow (see story.ts).
 *
 * Each faction fields armies, each led by a general (one of its race's Hero cards) with a deck of its own.
 * Every army moves one route a turn; moving into a system it doesn't hold is a battle. Claiming the Heart
 * wins; so does holding half the universe.
 *
 * Pure and deterministic like the battle engine: `applyCampaignAction`
 * clones the state, uses the seeded RNG stored in it, and throws GameError on
 * invalid actions. Battles are ordinary Blue Loop games (see game.ts) created
 * from campaign state and fed back in with `finishBattle` once they are over.
 */
import { chooseAIAction } from './ai';
import { CARDS, cardDef, commandCardsFor, copyLimit, deckProblems, fusedId, fusionProblem, RACE_NAMES } from './cards';
import { BALANCE } from './balance';
import { applyAction, createGame, GameError, isGameOver } from './game';
import { nextRandom, randomInt, shuffleInPlace } from './rng';
import type { BattleModifiers, GameState, PlayerSetup } from './types';
import {
  armyLostScene,
  contactScene,
  defeatScene,
  dimmingScene,
  firstConquestScene,
  GENERALS,
  HEART_NAME,
  heartSightedScene,
  introScene,
  recruitScene,
  rivalFallsScene,
  collapseScene,
  instabilityScene,
  stellariaClaimedScene,
  stellariaSightedScene,
  stellariaWiltedScene,
  victoryDominationScene,
  victoryHeartScene,
  type StoryScene,
} from './story';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

export const CAMPAIGN = {
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
  fortifyHealth: 4,
  /** Absorb pays this many turns of the system's yield at once. */
  absorbTurns: 3,
  /** Armory offers refreshed each turn; buying costs the card's price + this, in materials. */
  armorySize: 3,
  armoryMarkup: 1,
  /** Materials for a fusion, before the two cards' prices. */
  fusionBase: 4,
  /** Neutral sentinels' suns start this much hotter, by tier (the outer systems are the easiest to take). */
  sentinelHeat: [5, 2, 0],
  /** Damage cap on a system (added to its sun's starting heat in battles). */
  maxDamage: 9,
  /** Damage an attacker's home system takes when the attack is repelled. */
  repelledDamage: 4,
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
  turnLimit: 60,
  /** The map: this many systems scattered in loose clusters over this area (map units). */
  mapSystems: 48,
  mapWidth: 3500,
  mapHeight: 2250,
  mapMargin: 170,
  /** Systems are never closer than this; routes longer than this are dropped unless needed to connect. */
  minSystemGap: 160,
  maxRoute: 690,
  /** Anomalies scattered between systems; each changes battles fought from the systems within its reach. */
  anomalies: 8,
  /** Safety cap on simulated (auto-resolved) battles. */
  battleActionCap: 6000,
  /** Recruiting a general and their army: credits, rising with each army already in the field (a bomb hero costs more). */
  recruitBase: 8,
  recruitPerArmy: 5,
  recruitBomb: 6,
  /** Damage (heat carried) an army takes when its attack is repelled, and the most it can carry. */
  armyRepelledDamage: 4,
  /** Credits to repair one point of an army's damage (in a system you hold). */
  armyHealCost: 1,
  /** Finite Stellari: blooms on this many systems, each giving this much a turn to whoever holds it, for this many turns. */
  stellariaBlooms: 4,
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
  /** The counter: stabilise a collapsing system you hold, for materials, holding it together this many turns more (once per system). */
  stabiliseCost: 8,
  stabiliseTurns: 4,
  /** Each home has one route out, to a system whose sentinels start this much hotter (a weakened first foe). */
  gateHeat: 10,
  /** Recycling a reserve card pays this share of its armory price, in materials (at least 1). */
  recycleShare: 0.5,
  /** The Heart: its yield, and its Wardens' extra max health. */
  heartYield: 6,
  heartWardenHealth: 12,
  /** No other system lies closer than this to the Heart (map units). */
  heartClearance: 300,
  /**
   * The core: systems nearer the Heart are richer and better defended, to make up for the worlds the
   * dimming takes. By routes from the Heart (index 1 = next to it): extra credits and materials each turn,
   * and extra max health for whoever defends there.
   */
  coreYield: [0, 2, 1, 1],
  coreHealth: [0, 6, 4, 2],
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
}

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
    text: 'Its gravity well drinks heat: +5 max health, but your opening hand is 1 card smaller.',
    modifiers: { maxHealthDelta: 5, openingHand: -1 },
    radius: 240,
  },
  nebula: {
    kind: 'nebula',
    name: 'Nebula',
    text: 'Hidden in the gas: +1 shield every day, but your sun starts 3 hotter.',
    modifiers: { shieldPerTurn: 1, startingHeat: 3 },
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
    text: 'Its steady beam steadies your sun: it cools by 1 every day, but you have 4 less max health.',
    modifiers: { coolPerTurn: 1, maxHealthDelta: -4 },
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
  /** Which of the four alien races this faction is (0–3). */
  race: number;
  credits: number;
  materials: number;
  /** Owned cards not in an army's deck or a garrison. */
  reserve: string[];
  missions: ActiveMission[];
  missionDeck: string[];
  stats: CampaignStats;
  eliminated: boolean;
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
  /** Has moved (or fought) this turn. */
  moved: boolean;
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
}

export interface CampaignState {
  version: 3;
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
  /** Cards the player can buy this turn with materials. */
  armory: string[];
  /** A battle the player is fighting (or can auto-resolve). */
  battle: BattleContext | null;
  /** The player won an attack and must decide the system's fate (the army that won it marches in if it is settled). */
  conquest: { nodeId: string; armyId?: string } | null;
  /** Card choices owed to the player (from missions). */
  cardRewards: { source: string; options: string[] }[];
  /** Whose part of the turn it is: the player's, then the AI factions' in turn. */
  phase: 'player' | 'ai';
  /** AI factions still to act this turn (their turns pause while the player defends). */
  aiQueue: string[];
  winner: string | null;
  log: CampaignLogEntry[];
}

export interface CampaignSetup {
  seed: number;
  playerName?: string;
  /** The player's race (0–3); the rivals are the other races. */
  race?: number;
  /** Rival AI factions, 1–3. */
  rivals?: number;
}

export type ConquestChoice = 'settle' | 'absorb' | 'supernova';

export type CampaignAction =
  /** Move an army one route: into a system you hold, or into battle for one you don't. */
  | { type: 'move'; armyId: string; toId: string }
  /** Raise a new army in a system you hold, led by one of your race's generals. */
  | { type: 'recruit'; general: string; nodeId: string }
  /** Hold a collapsing system together a few turns more. */
  | { type: 'stabilise'; nodeId: string }
  /** Move a reserve card into an army's deck, or a deck card back to the reserve (a deck must be legal to attack). */
  | { type: 'deckAdd'; armyId: string; defId: string }
  | { type: 'deckRemove'; armyId: string; defId: string }
  /** Break a reserve card down for materials. */
  | { type: 'recycle'; defId: string }
  | { type: 'healArmy'; armyId: string }
  /** The oldest story scene has been read. */
  | { type: 'readStory' }
  /** Hand back the battle once it is over (or ask for it to be auto-resolved from here). */
  | { type: 'finishBattle'; game: GameState; auto?: boolean }
  | { type: 'conquer'; choice: ConquestChoice }
  | { type: 'chooseCard'; defId: string | null }
  | { type: 'heal'; nodeId: string }
  | { type: 'fortify'; nodeId: string }
  | { type: 'buyCard'; slot: number }
  /** Fuse two reserve cards into one that does both (for materials; it cannot be undone). */
  | { type: 'fuse'; a: number; b: number }
  /** Swap a reserve card into an army's deck slot (the slot's card goes to reserve). The deck must stay legal. */
  | { type: 'deckSwap'; armyId: string; slot: number; reserveIndex: number }
  /** Station a reserve card in a system's garrison. */
  | { type: 'station'; nodeId: string; index: number }
  | { type: 'recall'; nodeId: string; uid: string }
  | { type: 'endTurn' };

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
  { id: 'c_colonist', name: 'Colonist', text: 'Settle 2 systems.', target: 2, counting: true, value: stat('settled') },
  { id: 'c_harvest', name: 'Harvest', text: 'Absorb a system.', target: 1, counting: true, value: stat('absorbed') },
  { id: 'c_scorched', name: 'Scorched Stars', text: 'Supernova a system.', target: 1, counting: true, value: stat('novas') },
  { id: 'c_bulwark', name: 'Bulwark', text: 'Win a defence.', target: 1, counting: true, value: stat('defences') },
  { id: 'c_usurper', name: 'Usurper', text: 'Take a system from a rival faction.', target: 1, counting: true, value: stat('rivalsTaken') },
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
  for (const n of s.nodes) if (n.owner === factionId) look(n, !!n.scanner);
  // An army sees the routes out of wherever it stands.
  for (const a of s.armies) if (a.owner === factionId) look(byId.get(a.nodeId)!, false);
  if (s.battle) seen.add(s.battle.nodeId);
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

/** Credits to recruit a general (null if they already lead an army, or aren't of this faction's race). */
export function recruitCost(s: CampaignState, f: Faction, general: string): number | null {
  if (!GENERALS[f.race]?.includes(general) || s.armies.some((a) => a.owner === f.id && a.general === general)) return null;
  const bomb = cardDef(general).rarity === 'anomaly' && GENERALS[f.race].indexOf(general) === 2;
  return CAMPAIGN.recruitBase + CAMPAIGN.recruitPerArmy * armiesOf(s, f.id).length + (bomb ? CAMPAIGN.recruitBomb : 0);
}

/** Where an army can go this turn: each linked system, and whether going there is a battle. */
export function armyMoves(s: CampaignState, army: Army): { toId: string; battle: boolean }[] {
  if (army.moved) return [];
  const here = nodeById(s, army.nodeId);
  const out: { toId: string; battle: boolean }[] = [];
  for (const id of here.links) {
    const n = nodeById(s, id);
    if (n.collapsed) continue;
    const there = armyAt(s, id);
    if (n.owner === army.owner) {
      if (!there) out.push({ toId: id, battle: false });
      continue;
    }
    if (hazardBlocks(n, army.owner)) continue;
    out.push({ toId: id, battle: true });
  }
  return out;
}

/** Turns of regional stability left before systems start to collapse (0: they are collapsing). */
export function regionalStability(s: CampaignState): number {
  return Math.max(0, CAMPAIGN.stabilityTurns - s.turn);
}

/** Systems that collapse each turn, once stability has run out. */
export function collapsesPerTurn(s: CampaignState): number {
  return 1 + Math.floor(Math.max(0, s.turn - CAMPAIGN.stabilityTurns) / CAMPAIGN.collapseRamp);
}

/** Why a faction can't stabilise a system (null if it can). */
export function stabiliseProblem(f: Faction, n: CampaignNode): string | null {
  if (n.owner !== f.id) return 'You do not control that system.';
  if (!n.collapsing) return `${n.name} is not collapsing.`;
  if (n.stableUntil !== undefined) return `${n.name} has been stabilised once already: it cannot be again.`;
  if (f.materials < CAMPAIGN.stabiliseCost) return `Not enough materials (need ${CAMPAIGN.stabiliseCost}, have ${f.materials}).`;
  return null;
}

/** Why a card can't go into an army's deck from the reserve (null if it can). The deck may be short, not over. */
export function deckAddProblem(f: Faction, army: Army, defId: string): string | null {
  if (!f.reserve.includes(defId)) return `${cardDef(defId).name} is not in your reserve.`;
  const copies = army.deck.filter((id) => id === defId).length;
  if (army.deck.length >= BALANCE.maxDeckSize) return `A deck holds at most ${BALANCE.maxDeckSize} cards.`;
  if (copies >= copyLimit(defId)) return copyLimit(defId) === 1 ? `${cardDef(defId).name} is an Anomaly: one copy per deck.` : `At most ${BALANCE.maxCopies} copies of a card.`;
  if (cardDef(defId).kind === 'command' && army.deck.filter((id) => cardDef(id).kind === 'command').length >= commandCardsFor(BALANCE.maxDeckSize))
    return `A deck holds at most ${commandCardsFor(BALANCE.maxDeckSize)} Heroes.`;
  return null;
}

/** Why a card can't come out of an army's deck (null if it can). */
export function deckRemoveProblem(army: Army, defId: string): string | null {
  if (!army.deck.includes(defId)) return `${cardDef(defId).name} is not in that deck.`;
  if (defId === army.general && army.deck.filter((x) => x === defId).length === 1) return `${cardDef(defId).name} leads this army: their card stays in its deck.`;
  return null;
}

/** Materials for recycling a card: half its armory price (at least 1). */
export function recycleValue(defId: string): number {
  return Math.max(1, Math.floor(armoryPrice(defId) * CAMPAIGN.recycleShare));
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
  return deckProblems(next)[0] ?? null;
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
export function factionIncome(s: CampaignState, factionId: string) {
  return ownedNodes(s, factionId).reduce(
    (acc, n) => {
      const bloom = (n.stellaria ?? 0) > 0;
      return {
        credits: acc.credits + n.yield.credits + (bloom ? CAMPAIGN.stellariaCredits : 0),
        materials: acc.materials + n.yield.materials + (bloom ? CAMPAIGN.stellariaMaterials : 0),
      };
    },
    { credits: 0, materials: 0 },
  );
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** The map's size in map units (system positions lie inside it). */
export const MAP_WIDTH = CAMPAIGN.mapWidth;
export const MAP_HEIGHT = CAMPAIGN.mapHeight;

/** Rough normal sample (sum of uniforms). */
function gauss(s: CampaignState): number {
  return (nextRandom(s) + nextRandom(s) + nextRandom(s) + nextRandom(s) - 2) / 0.58;
}

/**
 * Scatter systems in loose clusters with voids between them, so neighbours sit
 * at irregular distances and angles: some huddle close, some lie far out.
 */
function scatterSystems(s: CampaignState): { x: number; y: number }[] {
  const m = CAMPAIGN.mapMargin;
  const inside = (x: number, y: number) => x >= m && x <= MAP_WIDTH - m && y >= m && y <= MAP_HEIGHT - m;
  const clusters = Array.from({ length: 9 }, () => ({
    x: m + nextRandom(s) * (MAP_WIDTH - 2 * m),
    y: m + nextRandom(s) * (MAP_HEIGHT - 2 * m),
    spread: 140 + nextRandom(s) * 220,
  }));
  // Keep the four corners populated so every faction has room to start.
  clusters.push({ x: m + 100, y: MAP_HEIGHT - m - 100, spread: 175 }, { x: MAP_WIDTH - m - 100, y: m + 100, spread: 175 });
  clusters.push({ x: m + 100, y: m + 100, spread: 175 }, { x: MAP_WIDTH - m - 100, y: MAP_HEIGHT - m - 100, spread: 175 });
  // The Heart first, at the very centre, with clear space round it.
  const centre = { x: Math.round(MAP_WIDTH / 2), y: Math.round(MAP_HEIGHT / 2) };
  const pts: { x: number; y: number }[] = [centre];
  for (let tries = 0; pts.length < CAMPAIGN.mapSystems && tries < 20000; tries++) {
    let x: number;
    let y: number;
    if (nextRandom(s) < 0.72) {
      const c = clusters[randomInt(s, clusters.length)];
      x = c.x + gauss(s) * c.spread;
      y = c.y + gauss(s) * c.spread;
    } else {
      x = m + nextRandom(s) * (MAP_WIDTH - 2 * m);
      y = m + nextRandom(s) * (MAP_HEIGHT - 2 * m);
    }
    // The gap varies too, so some pairs sit close and others keep their distance.
    const gap = CAMPAIGN.minSystemGap * (0.85 + nextRandom(s) * 0.6);
    if (Math.hypot(x - centre.x, y - centre.y) < CAMPAIGN.heartClearance) continue;
    if (inside(x, y) && pts.every((p) => Math.hypot(p.x - x, p.y - y) >= gap)) pts.push({ x: Math.round(x), y: Math.round(y) });
  }
  return pts;
}

/**
 * Routes: a Gabriel graph (two systems link if no third lies inside the circle
 * on their route as diameter), which is planar so routes never cross. Overlong
 * routes are dropped unless they are needed to keep the map connected.
 */
function routeSystems(pts: { x: number; y: number }[]): [number, number][] {
  const d2 = (a: number, b: number) => (pts[a].x - pts[b].x) ** 2 + (pts[a].y - pts[b].y) ** 2;
  const gabriel: [number, number, number][] = [];
  for (let a = 0; a < pts.length; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const mx = (pts[a].x + pts[b].x) / 2;
      const my = (pts[a].y + pts[b].y) / 2;
      const r2 = d2(a, b) / 4;
      if (pts.every((p, k) => k === a || k === b || (p.x - mx) ** 2 + (p.y - my) ** 2 > r2)) gabriel.push([a, b, Math.sqrt(d2(a, b))]);
    }
  }
  // Minimum spanning tree (Kruskal) keeps everything reachable.
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const tree = new Set<string>();
  for (const [a, b] of [...gabriel].sort((x, y) => x[2] - y[2])) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      tree.add(`${a}-${b}`);
    }
  }
  return gabriel.filter(([a, b, len]) => len <= CAMPAIGN.maxRoute || tree.has(`${a}-${b}`)).map(([a, b]) => [a, b]);
}
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
const STARTER_NEUTRALS = ['plasma_relay', 'coronal_lance', 'thermal_exchange', 'gravity_sling', 'coolant_array', 'cryo_vault', 'heat_sink', 'deflector_grid', 'bulwark_plating', 'resonance_lattice', 'tidal_brake', 'solar_mirror'];

/**
 * An army's starting deck (30 cards): mostly neutral cards, a first taste of the race's own, and three
 * Hero cards led by its general (twice, unless one copy is all a deck may hold), with the race's other
 * generals making up the rest.
 */
export function armyDeck(race: number, general: string): string[] {
  const r = ((race % 4) + 4) % 4;
  const own = CARDS.filter((c) => c.race === r && c.kind !== 'command').slice(0, 3).map((c) => c.id);
  const others = GENERALS[r].filter((g) => g !== general);
  const heroes = copyLimit(general) > 1 ? [general, general, others[0]] : [general, ...others.slice(0, 2)];
  return [...STARTER_NEUTRALS.flatMap((id) => [id, id]), ...own, ...heroes];
}

/** A race's plain deck: its first general's (neutral sentinels, and systems defending without an army, use it). */
export function starterDeck(race: number): string[] {
  return armyDeck(race, GENERALS[((race % 4) + 4) % 4][0]);
}

export function createCampaign(setup: CampaignSetup): CampaignState {
  const rivals = Math.max(1, Math.min(3, setup.rivals ?? 3));
  const s: CampaignState = {
    version: 3,
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
    armory: [],
    battle: null,
    conquest: null,
    cardRewards: [],
    phase: 'player',
    aiQueue: [],
    winner: null,
    log: [],
  };

  // Systems in loose clusters, linked by routes that never cross.
  const used = new Set<string>();
  const pts = scatterSystems(s);
  const tints: MapPlanet['tint'][] = ['weapons', 'defences', 'economy', 'resources'];
  pts.forEach((pt, i) => {
    const name = nodeName(s, used);
    const planets = Array.from({ length: 2 + randomInt(s, 3) }, (_, j) => ({ name: `${name} ${['I', 'II', 'III', 'IV'][j]}`, tint: tints[randomInt(s, tints.length)] }));
    s.nodes.push({
      id: `n${i}`,
      name,
      x: pt.x,
      y: pt.y,
      planets,
      owner: null,
      links: [],
      fortification: 0,
      damage: 0,
      garrison: [],
      hazard: [],
      yield: { credits: 1 + randomInt(s, 2), materials: 1 + randomInt(s, 2) },
      tier: 0,
    });
  });
  for (const [a, b] of routeSystems(pts)) {
    s.nodes[a].links.push(s.nodes[b].id);
    s.nodes[b].links.push(s.nodes[a].id);
  }
  // The Heart: the first system placed, at the centre.
  const heart = s.nodes[0];
  heart.name = HEART_NAME;
  heart.heart = true;
  heart.tier = 3;
  heart.yield = { credits: CAMPAIGN.heartYield, materials: CAMPAIGN.heartYield };
  heart.planets = [];

  // Factions start in the corners: the system nearest each one.
  const cornerPts = [
    { x: 0, y: MAP_HEIGHT },
    { x: MAP_WIDTH, y: 0 },
    { x: 0, y: 0 },
    { x: MAP_WIDTH, y: MAP_HEIGHT },
  ];
  const corners = cornerPts.map((c) => s.nodes.filter((n) => !n.heart).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]);
  const playerRace = ((setup.race ?? 0) % 4 + 4) % 4;
  const races = [playerRace, ...[0, 1, 2, 3].filter((r) => r !== playerRace)];
  for (let i = 0; i <= rivals; i++) {
    const id = `f${i + 1}`;
    const home = corners[i];
    const isAI = i > 0;
    const race = races[i];
    home.owner = id;
    home.home = id;
    home.yield = { credits: 3, materials: 3 };
    const f: Faction = {
      id,
      name: isAI ? RACE_NAMES[race] : setup.playerName || 'Commander',
      isAI,
      race,
      credits: CAMPAIGN.startCredits,
      materials: CAMPAIGN.startMaterials,
      reserve: [],
      missions: [],
      missionDeck: shuffleInPlace(s, CAMPAIGN_MISSIONS.map((m) => m.id)),
      stats: emptyStats(),
      eliminated: false,
    };
    s.factions.push(f);
    // Every faction starts with one army, led by its race's first general, at home, ready to march.
    raiseArmy(s, f, GENERALS[race][0], home.id).moved = false;
    for (let k = 0; k < CAMPAIGN.activeMissions; k++) drawMission(s, f);
  }

  // Each home has exactly one route out, towards the Heart, to a weakened neutral system.
  for (const home of s.nodes.filter((n) => n.home)) openGate(s, home, heart);

  // Anomalies settle in the voids between systems: away from the starting
  // systems and each other, but close enough to reach at least one system.
  const kinds: AnomalyKind[] = ['blackHole', 'nebula', 'darkMatter', 'pulsar'];
  const homesNow = s.nodes.filter((n) => n.home);
  const candidates: { x: number; y: number; clear: number }[] = [];
  for (let k = 0; k < 600; k++) {
    const x = CAMPAIGN.mapMargin + nextRandom(s) * (MAP_WIDTH - 2 * CAMPAIGN.mapMargin);
    const y = CAMPAIGN.mapMargin + nextRandom(s) * (MAP_HEIGHT - 2 * CAMPAIGN.mapMargin);
    const nearest = Math.min(...s.nodes.map((n) => Math.hypot(n.x - x, n.y - y)));
    candidates.push({ x: Math.round(x), y: Math.round(y), clear: nearest });
  }
  candidates.sort((a, b) => b.clear - a.clear);
  for (const c of candidates) {
    if (s.anomalies!.length >= CAMPAIGN.anomalies) break;
    const kind = kinds[s.anomalies!.length % kinds.length];
    const reach = ANOMALIES[kind].radius;
    if (c.clear < 90 || c.clear > reach * 0.85) continue; // in a gap, yet touching a system
    if (homesNow.some((h) => Math.hypot(h.x - c.x, h.y - c.y) <= reach + 40)) continue;
    if (s.anomalies!.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < 530)) continue;
    s.anomalies!.push({ id: `a${s.anomalies!.length}`, kind, x: c.x, y: c.y });
  }

  // Neutral systems grow stronger away from the starting corners, and towards the Heart. The core is
  // richer too: it makes up for the worlds the dimming takes from the rim.
  const homes = s.nodes.filter((n) => n.home);
  for (const n of s.nodes) {
    n.ring = hops(s, heart.id, n.id);
    if (n.home || n.heart) continue;
    const d = Math.min(...homes.map((h) => hops(s, h.id, n.id)));
    n.tier = d <= 1 ? 0 : d <= 3 ? 1 : 2;
    if (n.ring <= 2) n.tier = 2;
    else if (n.ring <= 3) n.tier = Math.max(n.tier, 1);
    // A home's one route always leads to the weakest foe.
    if (n.gate) n.tier = 0;
    const bonus = CAMPAIGN.coreYield[n.ring] ?? 0;
    n.yield = { credits: n.yield.credits + bonus, materials: n.yield.materials + bonus };
  }
  // Finite Stellari bloom out in the middle reaches, never at home or the Heart.
  const reaches = shuffleInPlace(s, s.nodes.filter((n) => !n.home && !n.heart && n.tier >= 1));
  for (const n of reaches.slice(0, CAMPAIGN.stellariaBlooms)) n.stellaria = CAMPAIGN.stellariaTurns;

  refreshArmory(s, s.factions[0]);
  // Scanner arrays on about one system in six (never a home, nor the Heart).
  for (const n of s.nodes) n.scanner = !n.home && !n.heart && randomInt(s, 6) === 0;
  clog(s, `The campaign begins. ${s.factions.map((f) => `${f.name} holds ${nodeById(s, s.nodes.find((n) => n.home === f.id)!.id).name}`).join('; ')}.`);
  const me = campaignPlayer(s);
  tell(s, introScene(me.race, me.id));
  noticeStory(s);
  return s;
}

/**
 * Cut a home's routes down to one: the neighbour nearest the Heart, which becomes its gate. Any system
 * left cut off by that is linked back to the nearest system still joined up (other than the home).
 */
function openGate(s: CampaignState, home: CampaignNode, heart: CampaignNode) {
  const near = (n: CampaignNode) => Math.hypot(n.x - heart.x, n.y - heart.y);
  const neighbours = home.links.map((id) => nodeById(s, id)).filter((n) => !n.home);
  const gate = neighbours.sort((a, b) => near(a) - near(b))[0];
  if (!gate) return;
  for (const id of home.links) if (id !== gate.id) nodeById(s, id).links = nodeById(s, id).links.filter((x) => x !== home.id);
  home.links = [gate.id];
  gate.gate = true;
  gate.owner = null;
  // Rejoin anything the cut left stranded.
  for (;;) {
    const joined = new Set([heart.id]);
    const queue = [heart.id];
    while (queue.length) for (const l of nodeById(s, queue.shift()!).links) if (!joined.has(l)) joined.add(l), queue.push(l);
    const lost = s.nodes.find((n) => !joined.has(n.id));
    if (!lost) return;
    const to = s.nodes.filter((n) => joined.has(n.id) && !n.home).sort((a, b) => Math.hypot(a.x - lost.x, a.y - lost.y) - Math.hypot(b.x - lost.x, b.y - lost.y))[0];
    lost.links.push(to.id);
    to.links.push(lost.id);
  }
}

/** A new army, led by `general`, standing in `nodeId`. */
function raiseArmy(s: CampaignState, f: Faction, general: string, nodeId: string): Army {
  const army: Army = { id: `army${++s.uidCounter}`, owner: f.id, general, nodeId, deck: armyDeck(f.race, general), damage: 0, moved: true };
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
    const rivalId = n.owner && n.owner !== me.id ? n.owner : armyAt(s, id)?.owner !== me.id ? armyAt(s, id)?.owner : undefined;
    if (rivalId && !s.story.told.includes(`contact:${rivalId}`)) {
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

function clog(s: CampaignState, text: string) {
  s.logSeq += 1;
  s.log.push({ seq: s.logSeq, turn: s.turn, text });
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

function refreshArmory(s: CampaignState, f: Faction) {
  const pool = offerPool(f);
  s.armory = Array.from({ length: CAMPAIGN.armorySize }, () => pool[randomInt(s, pool.length)]);
}

function randomCardChoices(s: CampaignState, f: Faction): string[] {
  const pool = [...new Set(shuffleInPlace(s, offerPool(f)))];
  return pool.slice(0, CAMPAIGN.cardChoices);
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

/** Neutral sentinels' decks, by tier: the plain starter at first, then with a pair of each race's cards mixed in. */
function neutralDeck(s: CampaignState, tier: number): string[] {
  const deck = starterDeck(randomInt(s, 4));
  const extras = [[], ['solar_battery', 'solar_battery', 'deep_scanners', 'deep_scanners'], ['solar_battery', 'solar_battery', 'deep_scanners', 'deep_scanners', 'ion_cannon', 'ion_cannon', 'solar_maximum', 'ice_age']][tier] ?? [];
  extras.forEach((id, i) => (deck[i] = id));
  return deck;
}

/** The Heart Wardens' deck: the strongest sentinels, with the heaviest neutral cards mixed in. */
function wardenDeck(s: CampaignState): string[] {
  const deck = neutralDeck(s, 2);
  ['star_breaker', 'star_breaker', 'dreadnought', 'dreadnought', 'stellar_aegis', 'stellar_aegis'].forEach((id, i) => (deck[8 + i] = id));
  return deck;
}

/** Everything that shapes a battle for a system: the army attacking it, and whoever holds it. */
function battleSetup(s: CampaignState, army: Army, target: CampaignNode): PlayerSetup[] {
  const attacker = factionById(s, army.owner);
  const from = nodeById(s, army.nodeId);
  const owner = target.owner ? factionById(s, target.owner) : null;
  const guard = armyAt(s, target.id);
  const g = garrisonBonus(target);
  const fromFx = anomalyEffects(s, from);
  const targetFx = anomalyEffects(s, target);
  const fortified: BattleModifiers = target.fortification ? { maxHealthDelta: target.fortification * CAMPAIGN.fortifyHealth } : {};
  const wardens: BattleModifiers = target.heart && !owner ? { maxHealthDelta: CAMPAIGN.heartWardenHealth } : {};
  const coreHealth = target.heart ? 0 : CAMPAIGN.coreHealth[target.ring ?? 99] ?? 0;
  const core: BattleModifiers = coreHealth ? { maxHealthDelta: coreHealth } : {};
  const defenceConditions = [
    ...(targetFx?.conditions ?? []),
    ...(target.heart && !owner ? [{ name: 'Heart Wardens', text: `The oldest guardians: +${CAMPAIGN.heartWardenHealth} max health.` }] : []),
    ...(coreHealth ? [{ name: 'The core', text: `Close to the Heart, its defences are old and deep: +${coreHealth} max health.` }] : []),
    ...(target.gate && !owner ? [{ name: 'Weakened', text: `Cut off and failing: the sentinels' sun starts ${CAMPAIGN.gateHeat} hotter.` }] : []),
    ...(target.fortification ? [{ name: 'Fortified', text: `+${target.fortification * CAMPAIGN.fortifyHealth} max health (fortification level ${target.fortification}).` }] : []),
    ...(g.tableau.length || g.lightspeed ? [{ name: 'Garrison', text: `${g.tableau.length} stationed card${g.tableau.length === 1 ? '' : 's'} start in play.` }] : []),
  ];
  // The defender: an army standing there (its own deck), else the system's own guard (its race's plain
  // deck), else neutral sentinels, or at the Heart its Wardens.
  const defenderName = guard ? `${cardDef(guard.general).name}'s army` : owner ? `${target.name} Guard` : target.heart ? 'The Heart Wardens' : `${target.name} Sentinels`;
  const defenderDeck = guard ? guard.deck : owner ? starterDeck(owner.race) : target.heart ? wardenDeck(s) : neutralDeck(s, target.tier);
  return [
    {
      name: `${cardDef(army.general).name} (${attacker.name})`,
      species: attacker.race,
      isAI: attacker.isAI,
      deck: army.deck,
      deckName: `${cardDef(army.general).name}'s army`,
      heatDelta: army.damage,
      modifiers: fromFx?.modifiers,
      conditions: fromFx?.conditions,
    },
    {
      name: owner ? `${defenderName} (${owner.name})` : defenderName,
      species: owner ? owner.race : target.tier % 4,
      isAI: owner ? owner.isAI : true,
      deck: defenderDeck,
      heatDelta: (guard ? guard.damage : target.damage) + (owner || target.heart ? 0 : CAMPAIGN.sentinelHeat[target.tier] ?? 0) + (target.gate && !owner ? CAMPAIGN.gateHeat : 0),
      tableau: g.tableau,
      lightspeed: g.lightspeed,
      modifiers: mergeModifiers(mergeModifiers(mergeModifiers(targetFx?.modifiers ?? {}, fortified), wardens), core),
      conditions: defenceConditions.length ? defenceConditions : undefined,
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
  if (army.moved) throw new GameError(`${cardDef(army.general).name}'s army has already moved this turn.`);
  const here = nodeById(s, army.nodeId);
  const target = nodeById(s, toId);
  if (!here.links.includes(toId)) throw new GameError('There is no route between those systems.');
  if (target.collapsed) throw new GameError(`${target.name} has collapsed. There is nothing left there.`);
  if (target.owner === f.id) {
    if (armyAt(s, toId)) throw new GameError(`An army already stands in ${target.name}.`);
    army.nodeId = toId;
    army.moved = true;
    return;
  }
  if (hazardBlocks(target, f.id)) throw new GameError(`${target.name} is still reeling from a supernova.`);
  const problem = deckProblems(army.deck)[0];
  if (problem) throw new GameError(`${cardDef(army.general).name}'s deck isn't ready to fight: ${problem}`);
  army.moved = true;
  const players = battleSetup(s, army, target);
  const game = createGame({ seed: Math.floor(nextRandom(s) * 2 ** 31), players });
  const guard = armyAt(s, toId);
  clog(s, `${cardDef(army.general).name} leads ${f.name}'s army from ${here.name} against ${target.name} (${players[1].name}).`);
  s.battle = { attacker: f.id, defender: target.owner, fromId: here.id, nodeId: toId, armyId: army.id, defenderArmyId: guard?.id ?? null, game };
  // Battles between AI factions (or neutrals) are resolved at once; a human fights their own.
  const playerInvolved = !f.isAI || (target.owner !== null && !factionById(s, target.owner).isAI);
  if (!playerInvolved) resolveBattle(s, simulateBattle(game));
}

/** A beaten army falls back to a free system its faction holds next door, battered; with nowhere to go, it is lost. */
function rout(s: CampaignState, army: Army) {
  const owner = factionById(s, army.owner);
  const here = nodeById(s, army.nodeId);
  const refuge = here.links.map((id) => nodeById(s, id)).find((n) => n.owner === army.owner && !n.collapsed && !armyAt(s, n.id));
  if (refuge) {
    army.nodeId = refuge.id;
    army.damage = CAMPAIGN.maxDamage;
    clog(s, `${cardDef(army.general).name}'s army falls back to ${refuge.name}.`);
    return;
  }
  s.armies = s.armies.filter((a) => a !== army);
  // Its cards go back to the faction (all but the standard issue its next general will bring).
  owner.reserve.push(...army.deck.filter((id) => !armyDeck(owner.race, army.general).includes(id)));
  clog(s, `${cardDef(army.general).name}'s army is broken. ${cardDef(army.general).name} can be recruited again.`);
  if (owner.id === s.playerId) tell(s, armyLostScene());
}

function resolveBattle(s: CampaignState, game: GameState) {
  const b = s.battle;
  if (!b) throw new GameError('There is no battle to finish.');
  if (!isGameOver(game)) throw new GameError('That battle is not over yet.');
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

  if (winner) {
    winner.credits += CAMPAIGN.winCredits;
    winner.materials += CAMPAIGN.winMaterials;
    winner.stats.battlesWon += 1;
    if (game.round <= 6) winner.stats.swiftWins += 1;
    if (winnerSeat.heat <= 0) winner.stats.coldWins += 1;
    if (!attackerWon) winner.stats.defences += 1;
  }

  if (attackerWon) {
    clog(s, `${attacker.name} wins the battle for ${target.name}.`);
    // A defending army is routed; the victors march in, if the system is settled.
    if (guard) rout(s, guard);
    if (!attacker.isAI) {
      if (target.heart) conquer(s, attacker, target, 'settle', army);
      else {
        s.conquest = { nodeId: target.id, armyId: army?.id };
        // The first world won: the guide explains the choice before it is made.
        if (attacker.stats.settled + attacker.stats.absorbed + attacker.stats.novas === 0) tell(s, firstConquestScene());
      }
    } else conquer(s, attacker, target, target.heart ? 'settle' : aiConquestChoice(s, target), army);
  } else {
    clog(s, `${target.name} holds: ${attacker.name}'s attack is repelled.`);
  }
  checkMissions(s);
}

function conquer(s: CampaignState, f: Faction, n: CampaignNode, choice: ConquestChoice, army?: Army) {
  const prevOwner = n.owner ? factionById(s, n.owner) : null;
  // Everything held in the garrison, arriving and leaving too, goes to the victor.
  const spoils = n.garrison.map((g) => g.defId);
  f.reserve.push(...spoils);
  n.garrison = [];
  if (spoils.length) clog(s, `${f.name} seizes ${spoils.map((id) => cardDef(id).name).join(', ')} from ${n.name}.`);
  if (prevOwner) f.stats.rivalsTaken += 1;
  n.home = undefined;
  n.gate = undefined;
  // A conquest brings new stock to the player's armory.
  if (f.id === s.playerId) refreshArmory(s, f);

  if (choice === 'settle') {
    n.owner = f.id;
    n.damage = 0;
    f.stats.settled += 1;
    clog(s, `${f.name} settles ${n.name}.`);
    if (army && s.armies.includes(army) && !armyAt(s, n.id)) army.nodeId = n.id;
    if (f.id === s.playerId && (n.stellaria ?? 0) > 0) tell(s, stellariaClaimedScene());
  } else if (choice === 'absorb') {
    const credits = n.yield.credits * CAMPAIGN.absorbTurns;
    const materials = n.yield.materials * CAMPAIGN.absorbTurns;
    f.credits += credits;
    f.materials += materials;
    n.owner = null;
    n.fortification = 0;
    n.yield = { credits: Math.max(0, n.yield.credits - 1), materials: Math.max(0, n.yield.materials - 1) };
    n.tier = 0;
    f.stats.absorbed += 1;
    clog(s, `${f.name} absorbs ${n.name}: +${credits} credits, +${materials} materials. The system is left depleted.`);
  } else {
    n.owner = null;
    n.fortification = 0;
    n.damage = 0;
    n.tier = 0;
    n.hazard = s.factions.filter((o) => !o.eliminated && o.id !== f.id).map((o) => o.id);
    f.stats.novas += 1;
    clog(s, `${f.name} drives ${n.name}'s sun to supernova. No rival can advance into it for a turn.`);
  }

  if (prevOwner) checkEliminated(s, prevOwner);
  // Whoever claims the Heart claims the Infinite Stellari, and the campaign.
  if (n.heart && n.owner === f.id && !s.winner) {
    s.winner = f.id;
    clog(s, `${f.name} claims ${HEART_NAME}, and the Infinite Stellari with it.`);
    const general = (army && s.armies.includes(army) ? army.general : armiesOf(s, f.id)[0]?.general) ?? GENERALS[f.race][0];
    tell(s, f.id === s.playerId ? victoryHeartScene(general, f.id, f.race) : defeatScene(f.race, true));
    return;
  }
  checkVictory(s);
}

/** A faction with no systems left is out: with no worlds to supply them, its armies scatter. */
function checkEliminated(s: CampaignState, f: Faction) {
  if (f.eliminated || ownedNodes(s, f.id).length > 0) return;
  f.eliminated = true;
  s.aiQueue = s.aiQueue.filter((id) => id !== f.id);
  for (const node of s.nodes) node.hazard = node.hazard.filter((id) => id !== f.id);
  s.armies = s.armies.filter((a) => a.owner !== f.id);
  clog(s, `${f.name} has lost every system and is eliminated.`);
  if (f.id !== s.playerId) tell(s, rivalFallsScene(f.race, f.id));
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
  clog(s, `${n.name} collapses into the dark.`);
  if (army) rout(s, army);
  if (owner) checkEliminated(s, owner);
}

/** The next systems to collapse: the farthest from the Heart (ties at random), passing over any held stable. */
function markCollapses(s: CampaignState) {
  const n = collapsesPerTurn(s);
  for (let i = 0; i < n; i++) {
    const open = s.nodes.filter((x) => !x.heart && !x.collapsed && !x.collapsing && !((x.stableUntil ?? 0) > s.turn));
    if (!open.length) return;
    const far = Math.max(...open.map((x) => x.ring ?? 0));
    const rim = open.filter((x) => (x.ring ?? 0) === far);
    const pick = rim[randomInt(s, rim.length)];
    pick.collapsing = true;
    clog(s, `${pick.name} is collapsing: it will be gone next turn.`);
  }
  tell(s, collapseScene());
}

function checkVictory(s: CampaignState) {
  if (s.winner) return;
  const living = s.factions.filter((f) => !f.eliminated);
  const player = campaignPlayer(s);
  if (player.eliminated) {
    const top = [...living].sort((a, b) => ownedNodes(s, b.id).length - ownedNodes(s, a.id).length)[0];
    s.winner = top?.id ?? 'none';
    clog(s, `${player.name} has fallen. ${top?.name ?? 'No one'} dominates the universe.`);
    tell(s, defeatScene(top?.race ?? 0, false));
    return;
  }
  // (Half of what is left: the collapse shrinks the universe.)
  const standing = s.nodes.filter((n) => !n.collapsed).length;
  for (const f of living) {
    const share = ownedNodes(s, f.id).length / Math.max(1, standing);
    if (living.length === 1 || share >= CAMPAIGN.dominationShare) {
      s.winner = f.id;
      clog(s, `${f.name} dominates the universe!`);
      tell(s, f.id === s.playerId ? victoryDominationScene() : defeatScene(f.race, false));
      return;
    }
  }
}

function checkMissions(s: CampaignState) {
  for (const f of s.factions) {
    if (f.eliminated) continue;
    for (const m of [...f.missions]) {
      if (missionProgress(s, f, m) < campaignMissionDef(m.id).target) continue;
      f.missions = f.missions.filter((x) => x !== m);
      f.credits += CAMPAIGN.missionCredits;
      f.materials += CAMPAIGN.missionMaterials;
      const def = campaignMissionDef(m.id);
      clog(s, `${f.name} completes the mission ${def.name}: +${CAMPAIGN.missionCredits} credits, +${CAMPAIGN.missionMaterials} materials and a new card.`);
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
  if (s.turn >= CAMPAIGN.turnLimit) {
    const living = s.factions.filter((f) => !f.eliminated);
    const best = [...living].sort((a, b) => ownedNodes(s, b.id).length - ownedNodes(s, a.id).length || (a.id === s.playerId ? -1 : 1))[0];
    s.winner = best.id;
    clog(s, `The campaign's ${CAMPAIGN.turnLimit} turns are over. ${best.name} controls the most systems and dominates the universe.`);
    tell(s, best.id === s.playerId ? victoryDominationScene() : defeatScene(best.race, false));
    return;
  }
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
  for (const f of s.factions) {
    if (f.eliminated) continue;
    const inc = factionIncome(s, f.id);
    f.credits += inc.credits;
    f.materials += inc.materials;
  }
  for (const a of s.armies) a.moved = false;
  // Stellari blooms held this turn give their last, and wilt in time.
  for (const n of s.nodes) {
    if (!n.owner || !((n.stellaria ?? 0) > 0)) continue;
    n.stellaria! -= 1;
    if (n.stellaria === 0) {
      clog(s, `The Stellari bloom on ${n.name} wilts.`);
      if (n.owner === s.playerId) tell(s, stellariaWiltedScene());
    }
  }
  // The dimming: now and then a star gutters, and its worlds yield less.
  if (s.turn % CAMPAIGN.dimEvery === 0) {
    const lit = s.nodes.filter((n) => !n.heart && n.yield.credits + n.yield.materials > 0);
    if (lit.length) {
      const n = lit[randomInt(s, lit.length)];
      n.yield = { credits: Math.max(0, n.yield.credits - 1), materials: Math.max(0, n.yield.materials - 1) };
      n.dimmed = true;
      clog(s, `The star of ${n.name} gutters. Its worlds yield less now.`);
      if (visibleNodes(s, s.playerId).has(n.id)) tell(s, dimmingScene(n.name));
    }
  }
  // Regional stability: what was marked gives way, and once stability has run out, more is marked.
  for (const n of s.nodes) if (n.collapsing && !((n.stableUntil ?? 0) > s.turn)) collapse(s, n);
  for (const n of s.nodes) if (n.collapsing && (n.stableUntil ?? 0) > s.turn) n.collapsing = false;
  if (!s.winner) checkVictory(s);
  if (s.winner) return;
  if (s.turn >= CAMPAIGN.stabilityTurns) markCollapses(s);
  else if (regionalStability(s) <= 2) tell(s, instabilityScene());
  refreshArmory(s, campaignPlayer(s));
  checkMissions(s);
  const p = campaignPlayer(s);
  clog(s, `— Turn ${s.turn}. ${p.name} collects ${factionIncome(s, p.id).credits} credits and ${factionIncome(s, p.id).materials} materials.`);
}

function endFactionTurn(s: CampaignState, f: Faction) {
  for (const n of s.nodes) n.hazard = n.hazard.filter((id) => id !== f.id);
}

/** Runs AI turns until they are done, or one attacks the player (who then defends). */
function runAI(s: CampaignState) {
  while (s.aiQueue.length && !s.battle && !s.winner) {
    const f = factionById(s, s.aiQueue.shift()!);
    if (f.eliminated) continue;
    aiTurn(s, f);
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

/** AI deck building: swap reserve race cards in for neutral cards in an army's deck, keeping it legal. */
function improveDeck(f: Faction, army: Army) {
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
  clog(s, `${f.name} stabilises ${n.name}. It holds for ${CAMPAIGN.stabiliseTurns} more turns.`);
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
  for (const army of armiesOf(s, f.id)) {
    while (army.damage > 0 && nodeById(s, army.nodeId).owner === f.id && f.credits >= CAMPAIGN.armyHealCost + 4) {
      f.credits -= CAMPAIGN.armyHealCost;
      army.damage -= 1;
    }
  }
  // 2. Buy a race card from its own armory now and then.
  if (f.materials >= ARMORY_PRICE.stellar + 3 && nextRandom(s) < 0.5) {
    const pool = offerPool(f);
    const id = pool[randomInt(s, pool.length)];
    if (f.materials >= armoryPrice(id)) {
      f.materials -= armoryPrice(id);
      f.reserve.push(id);
    }
  }
  // 3. Recruit another general when it can afford one, at home (or any free system it holds).
  const next = GENERALS[f.race].find((g) => recruitCost(s, f, g) !== null);
  const cost = next ? recruitCost(s, f, next)! : null;
  const muster = mine.find((n) => n.home === f.id && !armyAt(s, n.id)) ?? mine.find((n) => !armyAt(s, n.id));
  if (next && cost !== null && muster && f.credits >= cost + 3) {
    f.credits -= cost;
    raiseArmy(s, f, next, muster.id);
    clog(s, `${f.name} raises an army under ${cardDef(next).name}.`);
  }
  // 3b. Hold a collapsing home or bloom together, if it can.
  for (const n of mine) if ((n.home === f.id || (n.stellaria ?? 0) > 0) && stabiliseProblem(f, n) === null) stabilise(s, f, n);
  // 4. Improve its armies' decks: swap race cards in for neutral ones.
  for (const army of armiesOf(s, f.id)) improveDeck(f, army);
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
    const strength = (n: CampaignNode) =>
      (n.heart ? 6 : n.owner ? 3 : n.tier) + n.garrison.length + (armyAt(s, n.id) ? 2 - armyAt(s, n.id)!.damage * 0.2 : 0) - n.damage * 0.3 + (n.owner === s.playerId ? 0.5 : 0) - ((n.stellaria ?? 0) > 0 ? 1 : 0);
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
  if (prev.winner && action.type !== 'readStory') throw new GameError('The campaign is over.');
  const s = structuredClone(prev);
  if (action.type === 'readStory') {
    s.story.queue.shift();
    return s;
  }
  const f = campaignPlayer(s);

  if (s.battle && action.type !== 'finishBattle') throw new GameError('Finish the battle first.');
  if (s.phase === 'ai' && action.type !== 'finishBattle' && action.type !== 'chooseCard') throw new GameError('Wait for the other factions to finish their turns.');
  if (s.conquest && action.type !== 'conquer') throw new GameError('Decide the fate of the conquered system first.');
  if (s.cardRewards.length && !['chooseCard', 'finishBattle', 'conquer'].includes(action.type)) throw new GameError('Choose your new card first.');

  switch (action.type) {
    case 'move': {
      const army = armyById(s, action.armyId);
      if (army.owner !== f.id) throw new GameError('That army is not yours.');
      moveArmy(s, army, action.toId);
      break;
    }
    case 'recruit': {
      const n = requireOwned(s, f, action.nodeId);
      if (armyAt(s, n.id)) throw new GameError(`An army already stands in ${n.name}.`);
      const cost = recruitCost(s, f, action.general);
      if (cost === null) throw new GameError(`${cardDef(action.general).name} cannot lead a new army for you.`);
      spendCredits(f, cost);
      raiseArmy(s, f, action.general, n.id);
      clog(s, `${f.name} raises an army in ${n.name} under ${cardDef(action.general).name}. It can march next turn.`);
      tell(s, recruitScene(action.general, f.id));
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
      spendCredits(f, CAMPAIGN.armyHealCost);
      army.damage -= 1;
      break;
    }
    case 'finishBattle': {
      if (!s.battle) throw new GameError('There is no battle to finish.');
      resolveBattle(s, action.auto ? simulateBattle(action.game) : action.game);
      // A defence interrupts the AI factions' turns; carry on with them afterwards.
      if (s.phase === 'ai') runAI(s);
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
      if (action.defId) {
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
    case 'buyCard': {
      const id = s.armory[action.slot];
      if (!id) throw new GameError('That armory slot is empty.');
      spendMaterials(f, armoryPrice(id));
      s.armory.splice(action.slot, 1);
      f.reserve.push(id);
      clog(s, `${f.name} acquires ${cardDef(id).name}.`);
      break;
    }
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
      runAI(s);
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
