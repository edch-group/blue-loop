/**
 * Campaign mode: universe domination across a map of solar systems.
 *
 * Pure and deterministic like the battle engine: `applyCampaignAction`
 * clones the state, uses the seeded RNG stored in it, and throws GameError on
 * invalid actions. Battles are ordinary Blue Loop games (see game.ts) created
 * from campaign state and fed back in with `finishBattle` once they are over.
 */
import { chooseAIAction } from './ai';
import { CARDS, cardDef, deckProblems, RACE_NAMES } from './cards';
import { applyAction, createGame, GameError, isGameOver } from './game';
import { nextRandom, randomInt, shuffleInPlace } from './rng';
import type { BattleModifiers, CoreAction, GameState, PlayerSetup } from './types';

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
    text: 'Hidden in the gas: +1 shield every turn, but your sun starts 3 hotter.',
    modifiers: { shieldPerTurn: 1, startingHeat: 3 },
    radius: 280,
  },
  darkMatter: {
    kind: 'darkMatter',
    name: 'Dark Matter Cluster',
    text: 'Unseen mass to mine: draw 1 extra card every turn, but your sun heats by 1 every turn.',
    modifiers: { extraDraw: 1, heatPerTurn: 1 },
    radius: 240,
  },
  pulsar: {
    kind: 'pulsar',
    name: 'Pulsar',
    text: 'Its steady beam steadies your sun: it cools by 1 every turn, but you have 4 less max health.',
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
  /** The battle deck: always a legal deck (20 cards, at most 2 of each, exactly 2 Commands). */
  deck: string[];
  /** Owned cards not in the deck or a garrison. */
  reserve: string[];
  missions: ActiveMission[];
  missionDeck: string[];
  stats: CampaignStats;
  /** Has launched this turn's attack. */
  attacked: boolean;
  eliminated: boolean;
}

export interface BattleContext {
  attacker: string;
  /** Owning faction, or null for a neutral system's sentinels. */
  defender: string | null;
  fromId: string;
  nodeId: string;
  game: GameState;
}

export interface CampaignLogEntry {
  seq: number;
  turn: number;
  text: string;
}

export interface CampaignState {
  version: 2;
  rngState: number;
  uidCounter: number;
  logSeq: number;
  turn: number;
  playerId: string;
  factions: Faction[];
  nodes: CampaignNode[];
  /** Black holes, nebulae and the like, lying between systems (missing in older saves). */
  anomalies?: Anomaly[];
  /** Cards the player can buy this turn with materials. */
  armory: string[];
  /** A battle the player is fighting (or can auto-resolve). */
  battle: BattleContext | null;
  /** The player won an attack and must decide the system's fate. */
  conquest: { nodeId: string } | null;
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
  | { type: 'attack'; fromId: string; toId: string }
  /** Hand back the battle once it is over (or ask for it to be auto-resolved from here). */
  | { type: 'finishBattle'; game: GameState; auto?: boolean }
  | { type: 'conquer'; choice: ConquestChoice }
  | { type: 'chooseCard'; defId: string | null }
  | { type: 'heal'; nodeId: string }
  | { type: 'fortify'; nodeId: string }
  | { type: 'buyCard'; slot: number }
  /** Swap a reserve card into a deck slot (the slot's card goes to reserve). The deck must stay legal. */
  | { type: 'deckSwap'; slot: number; reserveIndex: number }
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

/** Credits for the next fortification level on a system (null at the maximum). */
export function fortifyCost(node: CampaignNode): number | null {
  if (node.fortification >= CAMPAIGN.maxFortification) return null;
  return CAMPAIGN.fortifyBaseCost + node.fortification * CAMPAIGN.fortifyCostPerLevel;
}

export function armoryPrice(defId: string): number {
  const def = cardDef(defId);
  return ARMORY_PRICE[def.rarity ?? 'dwarf'] + (def.race === undefined ? 0 : ARMORY_PRICE.race);
}

/** Any card except a global can garrison a system. */
export function canGarrison(defId: string): boolean {
  return cardDef(defId).kind !== 'global';
}

/** Whether swapping a reserve card into a deck slot keeps the deck legal (and why not). */
export function deckSwapProblem(f: Faction, slot: number, reserveIndex: number): string | null {
  const id = f.reserve[reserveIndex];
  if (!id || f.deck[slot] === undefined) return 'No such card.';
  const next = [...f.deck];
  next[slot] = id;
  return deckProblems(next)[0] ?? null;
}

/** Is `factionId` barred from attacking this system (a recent Supernova)? */
export const hazardBlocks = (n: CampaignNode, factionId: string) => n.hazard.includes(factionId);

/** Systems a faction may attack this turn, each with the owned systems it can launch from. */
export function attackOptions(s: CampaignState, factionId: string): { toId: string; fromIds: string[] }[] {
  const out: { toId: string; fromIds: string[] }[] = [];
  for (const n of s.nodes) {
    if (n.owner === factionId || hazardBlocks(n, factionId)) continue;
    const fromIds = n.links.filter((id) => nodeById(s, id).owner === factionId);
    if (fromIds.length) out.push({ toId: n.id, fromIds });
  }
  return out;
}

export interface GarrisonBonus {
  /** Cards that start the defence already in the defender's tableau. */
  tableau: string[];
  /** Upgrades the defender starts with (from stationed Command cards). */
  upgrades: Partial<Record<CoreAction, number>>;
  /** A stationed Lightspeed card, set face down from the start (only the first). */
  lightspeed?: string;
}

/**
 * What a system's stationed cards do when it is attacked: they start the
 * battle already in the defender's tableau. A stationed Command card gives
 * its upgrade instead (Command Directive: Cooling Chamber), and a stationed
 * Lightspeed card starts set face down (only one can be).
 */
export function garrisonBonus(n: CampaignNode): GarrisonBonus {
  const b: GarrisonBonus = { tableau: [], upgrades: {} };
  for (const g of n.garrison) {
    if (g.status !== 'stationed') continue;
    const def = cardDef(g.defId);
    if (def.kind === 'lightspeed') {
      b.lightspeed ??= g.defId;
      continue;
    }
    if (def.kind !== 'command') {
      b.tableau.push(g.defId);
      continue;
    }
    const up = (def.onPlay ?? []).find((e) => e.type === 'upgrade');
    const action: CoreAction = up?.type === 'upgrade' && up.action !== 'choice' ? up.action : 'coolingChamber';
    b.upgrades[action] = (b.upgrades[action] ?? 0) + 1;
  }
  return b;
}

/** Income each turn from the systems a faction controls. */
export function factionIncome(s: CampaignState, factionId: string) {
  return ownedNodes(s, factionId).reduce(
    (acc, n) => ({ credits: acc.credits + n.yield.credits, materials: acc.materials + n.yield.materials }),
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
  const pts: { x: number; y: number }[] = [];
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
const STARTER_NEUTRALS = ['plasma_relay', 'coronal_lance', 'gravity_sling', 'thermal_exchange', 'coolant_array', 'cryo_vault', 'deflector_grid', 'heat_sink'];

/** A campaign starting deck: mostly neutral cards, a first taste of the race's own, and two Command Directives. */
export function starterDeck(race: number): string[] {
  const own = CARDS.filter((c) => c.race === race).slice(0, 2).map((c) => c.id);
  return [...STARTER_NEUTRALS.flatMap((id) => [id, id]), ...own, 'command_directive', 'command_directive'];
}

export function createCampaign(setup: CampaignSetup): CampaignState {
  const rivals = Math.max(1, Math.min(3, setup.rivals ?? 3));
  const s: CampaignState = {
    version: 2,
    rngState: setup.seed | 0,
    uidCounter: 0,
    logSeq: 0,
    turn: 1,
    playerId: 'f1',
    factions: [],
    nodes: [],
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

  // Factions start in the corners: the system nearest each one.
  const cornerPts = [
    { x: 0, y: MAP_HEIGHT },
    { x: MAP_WIDTH, y: 0 },
    { x: 0, y: 0 },
    { x: MAP_WIDTH, y: MAP_HEIGHT },
  ];
  const corners = cornerPts.map((c) => [...s.nodes].sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]);
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
      deck: starterDeck(race),
      reserve: [],
      missions: [],
      missionDeck: shuffleInPlace(s, CAMPAIGN_MISSIONS.map((m) => m.id)),
      stats: emptyStats(),
      attacked: false,
      eliminated: false,
    };
    s.factions.push(f);
    for (let k = 0; k < CAMPAIGN.activeMissions; k++) drawMission(s, f);
  }

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

  // Neutral systems grow stronger away from the starting corners.
  const homes = s.nodes.filter((n) => n.home);
  for (const n of s.nodes) {
    if (n.home) continue;
    const d = Math.min(...homes.map((h) => hops(s, h.id, n.id)));
    n.tier = d <= 1 ? 0 : d <= 3 ? 1 : 2;
  }

  refreshArmory(s, s.factions[0]);
  clog(s, `The campaign begins. ${s.factions.map((f) => `${f.name} holds ${nodeById(s, s.nodes.find((n) => n.home === f.id)!.id).name}`).join('; ')}.`);
  return s;
}

function hops(s: CampaignState, from: string, to: string): number {
  const seen = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) return seen.get(id)!;
    for (const next of nodeById(s, id).links) {
      if (!seen.has(next)) {
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
 * fine-tuned Command cards (a deck starts with two standard Command Directives); Anomalies are rarest.
 */
function offerPool(f: Faction): string[] {
  return CARDS.filter((c) => c.id !== 'command_directive' && (c.race === undefined || c.race === f.race)).flatMap((c) =>
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

/** Everything that shapes a battle fought for (or from) a system. */
function battleSetup(s: CampaignState, attacker: Faction, from: CampaignNode, target: CampaignNode): PlayerSetup[] {
  const owner = target.owner ? factionById(s, target.owner) : null;
  const g = garrisonBonus(target);
  const fromFx = anomalyEffects(s, from);
  const targetFx = anomalyEffects(s, target);
  const fortified: BattleModifiers = target.fortification ? { maxHealthDelta: target.fortification * CAMPAIGN.fortifyHealth } : {};
  const defenceConditions = [
    ...(targetFx?.conditions ?? []),
    ...(target.fortification ? [{ name: 'Fortified', text: `+${target.fortification * CAMPAIGN.fortifyHealth} max health (fortification level ${target.fortification}).` }] : []),
    ...(g.tableau.length || Object.keys(g.upgrades).length || g.lightspeed ? [{ name: 'Garrison', text: `${g.tableau.length} stationed card${g.tableau.length === 1 ? '' : 's'} start in play.` }] : []),
  ];
  return [
    {
      name: attacker.name,
      species: attacker.race,
      isAI: attacker.isAI,
      deck: attacker.deck,
      heatDelta: from.damage,
      modifiers: fromFx?.modifiers,
      conditions: fromFx?.conditions,
    },
    {
      name: owner ? owner.name : `${target.name} Sentinels`,
      species: owner ? owner.race : target.tier % 4,
      isAI: owner ? owner.isAI : true,
      deck: owner ? owner.deck : neutralDeck(s, target.tier),
      heatDelta: target.damage + (owner ? 0 : CAMPAIGN.sentinelHeat[target.tier] ?? 0),
      tableau: g.tableau,
      lightspeed: g.lightspeed,
      upgrades: g.upgrades,
      modifiers: mergeModifiers(targetFx?.modifiers ?? {}, fortified),
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

function startBattle(s: CampaignState, attacker: Faction, fromId: string, toId: string) {
  const from = nodeById(s, fromId);
  const target = nodeById(s, toId);
  if (from.owner !== attacker.id) throw new GameError('You can only attack from a system you control.');
  if (!from.links.includes(toId)) throw new GameError('Those systems are not connected.');
  if (target.owner === attacker.id) throw new GameError('You already control that system.');
  if (hazardBlocks(target, attacker.id)) throw new GameError(`${target.name} is still reeling from a supernova.`);
  if (attacker.attacked) throw new GameError('You have already attacked this turn.');
  attacker.attacked = true;
  const players = battleSetup(s, attacker, from, target);
  const game = createGame({ seed: Math.floor(nextRandom(s) * 2 ** 31), players });
  const defenderName = players[1].name;
  clog(s, `${attacker.name} attacks ${target.name} (${defenderName}) from ${from.name}.`);
  s.battle = { attacker: attacker.id, defender: target.owner, fromId, nodeId: toId, game };
  // Battles between AI factions (or neutrals) are resolved at once; a human fights their own.
  const playerInvolved = !attacker.isAI || (target.owner !== null && !factionById(s, target.owner).isAI);
  if (!playerInvolved) resolveBattle(s, simulateBattle(game));
}

function resolveBattle(s: CampaignState, game: GameState) {
  const b = s.battle;
  if (!b) throw new GameError('There is no battle to finish.');
  if (!isGameOver(game)) throw new GameError('That battle is not over yet.');
  s.battle = null;
  const attacker = factionById(s, b.attacker);
  const defender = b.defender ? factionById(s, b.defender) : null;
  const from = nodeById(s, b.fromId);
  const target = nodeById(s, b.nodeId);
  const attackerWon = game.winnerId === game.players[0].id;
  const winnerSeat = attackerWon ? game.players[0] : game.players[1];
  const winner = attackerWon ? attacker : defender;

  // The winner's sun carries its heat home as damage; a repelled fleet damages its home system.
  const carried = Math.max(0, Math.min(CAMPAIGN.maxDamage, winnerSeat.heat));
  if (attackerWon) from.damage = Math.max(from.damage, carried);
  else {
    target.damage = Math.max(0, carried);
    from.damage = Math.min(CAMPAIGN.maxDamage, from.damage + CAMPAIGN.repelledDamage);
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
    if (!attacker.isAI) s.conquest = { nodeId: target.id };
    else conquer(s, attacker, target, aiConquestChoice(s, target));
  } else {
    clog(s, `${target.name} holds: ${attacker.name}'s attack is repelled.`);
  }
  checkMissions(s);
}

function conquer(s: CampaignState, f: Faction, n: CampaignNode, choice: ConquestChoice) {
  const prevOwner = n.owner ? factionById(s, n.owner) : null;
  // Everything held in the garrison, arriving and leaving too, goes to the victor.
  const spoils = n.garrison.map((g) => g.defId);
  f.reserve.push(...spoils);
  n.garrison = [];
  if (spoils.length) clog(s, `${f.name} seizes ${spoils.map((id) => cardDef(id).name).join(', ')} from ${n.name}.`);
  if (prevOwner) f.stats.rivalsTaken += 1;
  n.home = undefined;

  if (choice === 'settle') {
    n.owner = f.id;
    n.damage = 0;
    f.stats.settled += 1;
    clog(s, `${f.name} settles ${n.name}.`);
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

  if (prevOwner && ownedNodes(s, prevOwner.id).length === 0) {
    prevOwner.eliminated = true;
    s.aiQueue = s.aiQueue.filter((id) => id !== prevOwner.id);
    for (const node of s.nodes) node.hazard = node.hazard.filter((id) => id !== prevOwner.id);
    clog(s, `${prevOwner.name} has lost every system and is eliminated.`);
  }
  checkVictory(s);
}

function checkVictory(s: CampaignState) {
  if (s.winner) return;
  const living = s.factions.filter((f) => !f.eliminated);
  const player = campaignPlayer(s);
  if (player.eliminated) {
    s.winner = [...living].sort((a, b) => ownedNodes(s, b.id).length - ownedNodes(s, a.id).length)[0]?.id ?? 'none';
    clog(s, `${player.name} has fallen. ${factionById(s, s.winner).name} dominates the universe.`);
    return;
  }
  for (const f of living) {
    const share = ownedNodes(s, f.id).length / s.nodes.length;
    if (living.length === 1 || share >= CAMPAIGN.dominationShare) {
      s.winner = f.id;
      clog(s, `${f.name} dominates the universe!`);
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
    f.attacked = false;
    const inc = factionIncome(s, f.id);
    f.credits += inc.credits;
    f.materials += inc.materials;
  }
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

/** AI deck building: swap reserve race cards in for neutral cards, keeping the deck legal. */
function improveDeck(f: Faction) {
  for (let r = 0; r < f.reserve.length; r++) {
    const id = f.reserve[r];
    const def = cardDef(id);
    if (def.race === undefined || def.kind === 'command') continue;
    const slot = f.deck.findIndex((d, i) => cardDef(d).race === undefined && cardDef(d).kind !== 'command' && deckSwapProblem(f, i, r) === null);
    if (slot < 0) continue;
    const out = f.deck[slot];
    f.deck[slot] = id;
    f.reserve[r] = out;
  }
}

function aiTurn(s: CampaignState, f: Faction) {
  const mine = ownedNodes(s, f.id);
  // 1. Repair damaged systems.
  for (const n of [...mine].sort((a, b) => b.damage - a.damage)) {
    while (n.damage > 0 && f.credits >= CAMPAIGN.healCostPerPoint) {
      f.credits -= CAMPAIGN.healCostPerPoint;
      n.damage -= 1;
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
  // 3. Improve the deck: swap race cards in for neutral ones.
  improveDeck(f);
  // 4. Fortify the home system with spare credits.
  const home = mine.find((n) => n.home === f.id) ?? mine[0];
  const cost = home ? fortifyCost(home) : null;
  if (home && cost !== null && f.credits >= cost + 6) {
    f.credits -= cost;
    home.fortification += 1;
  }
  // 5. Garrison a border system with a spare card.
  const border = mine.filter((n) => n.links.some((id) => nodeById(s, id).owner !== f.id) && n.garrison.length < CAMPAIGN.garrisonSlots);
  const spare = f.reserve.findIndex(canGarrison);
  if (border.length && spare >= 0) {
    const n = border[randomInt(s, border.length)];
    n.garrison.push({ uid: uid(s), defId: f.reserve.splice(spare, 1)[0], status: 'arriving' });
  }
  // 6. Attack the weakest reachable system, most turns.
  const options = attackOptions(s, f.id);
  if (!options.length || nextRandom(s) < 0.2) return;
  const strength = (n: CampaignNode) => (n.owner ? 3 : n.tier) + n.garrison.length - n.damage * 0.3 + (n.owner === s.playerId ? 0.5 : 0);
  const pick = options
    .map((o) => ({ ...o, node: nodeById(s, o.toId) }))
    .sort((a, b) => strength(a.node) - strength(b.node) || nextRandom(s) - 0.5)[0];
  const fromId = [...pick.fromIds].sort((a, b) => nodeById(s, a).damage - nodeById(s, b).damage)[0];
  startBattle(s, f, fromId, pick.toId);
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
  if (prev.winner) throw new GameError('The campaign is over.');
  const s = structuredClone(prev);
  const f = campaignPlayer(s);

  if (s.battle && action.type !== 'finishBattle') throw new GameError('Finish the battle first.');
  if (s.phase === 'ai' && action.type !== 'finishBattle' && action.type !== 'chooseCard') throw new GameError('Wait for the other factions to finish their turns.');
  if (s.conquest && action.type !== 'conquer') throw new GameError('Decide the fate of the conquered system first.');
  if (s.cardRewards.length && !['chooseCard', 'finishBattle', 'conquer'].includes(action.type)) throw new GameError('Choose your new card first.');

  switch (action.type) {
    case 'attack':
      startBattle(s, f, action.fromId, action.toId);
      break;
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
      s.conquest = null;
      conquer(s, f, n, action.choice);
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
    case 'deckSwap': {
      const problem = deckSwapProblem(f, action.slot, action.reserveIndex);
      if (problem) throw new GameError(problem);
      const out = f.deck[action.slot];
      f.deck[action.slot] = f.reserve[action.reserveIndex];
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
  return s;
}

/** The side of the current battle the player is on (0 = attacker), or null. */
export function playerSeat(s: CampaignState): 0 | 1 | null {
  if (!s.battle) return null;
  if (s.battle.attacker === s.playerId) return 0;
  if (s.battle.defender === s.playerId) return 1;
  return null;
}
