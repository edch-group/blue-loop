/**
 * Campaign mode: universe domination across a map of solar systems.
 *
 * Pure and deterministic like the battle engine: `applyCampaignAction`
 * clones the state, uses the seeded RNG stored in it, and throws GameError on
 * invalid actions. Battles are ordinary Blue Loop games (see game.ts) created
 * from campaign state and fed back in with `finishBattle` once they are over.
 */
import { chooseAIAction } from './ai';
import { cardDef, MARKET_CARDS } from './cards';
import { applyAction, createGame, GameError, isGameOver } from './game';
import { nextRandom, randomInt, shuffleInPlace } from './rng';
import { mergeModifiers, SOLAR_SYSTEMS, systemDef } from './systems';
import type { GameState, OpeningBonus, PlayerSetup, SystemModifiers } from './types';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

export const CAMPAIGN = {
  /** Battle decks are always exactly this many cards. Empty slots hold Stardust. */
  deckSize: 10,
  /** Cards a system can hold as its garrison. */
  garrisonSlots: 3,
  startCredits: 6,
  startMaterials: 6,
  /** Credits to repair one point of damage on a system. */
  healCostPerPoint: 2,
  /** Credits for +1 level on a system's planet: base + per level already bought. */
  upgradeBaseCost: 4,
  upgradeCostPerLevel: 4,
  /** Absorb pays this many turns of the system's yield at once. */
  absorbTurns: 3,
  /** Armory offers refreshed each turn; buying costs the card's price + this, in materials. */
  armorySize: 3,
  armoryMarkup: 1,
  /** Garrison attack and cooling are capped so a battle is never decided before it starts. */
  maxBombard: 4,
  maxChill: 5,
  /** Damage cap on a system (added to its sun's starting heat in battles). */
  maxDamage: 6,
  /** Damage an attacker's home system takes when the attack is repelled. */
  repelledDamage: 3,
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
  mapWidth: 2200,
  mapHeight: 1400,
  mapMargin: 110,
  /** Systems are never closer than this; routes longer than this are dropped unless needed to connect. */
  minSystemGap: 95,
  maxRoute: 430,
  /** Anomalies scattered between systems; each changes battles fought from the systems within its reach. */
  anomalies: 8,
  /** Safety cap on simulated (auto-resolved) battles. */
  battleActionCap: 6000,
} as const;

/** Upgrading a card in your collection turns it into a stronger one. Costs the new card's price in materials. */
export const CARD_UPGRADES: Record<string, string> = {
  stardust: 'stellar_credits',
  stellar_credits: 'trade_convoy',
  trade_convoy: 'dyson_tap',
  coolant_array: 'cryo_vault',
  gravity_sling: 'coronal_lance',
  coronal_lance: 'starbreaker',
  command_directive: 'strategic_directive',
  deep_scanners: 'asteroid_mining',
};

export const FACTION_NAMES = ['Commander', "Xel'Naru", 'Vorthane', 'Ixquor'];

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
  systemId: string;
  owner: string | null;
  links: string[];
  /** Planet levels bought on the map, by planet index. */
  boosts: number[];
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
  modifiers: SystemModifiers;
  /** Reach, in map units. */
  radius: number;
}

/** Every anomaly is a trade-off: a boon and a cost for whoever fights from a system near it. */
export const ANOMALIES: Record<AnomalyKind, AnomalyDef> = {
  blackHole: {
    kind: 'blackHole',
    name: 'Black Hole',
    text: 'Its gravity well drinks heat: +3 max health, but your hand is 1 card smaller.',
    modifiers: { maxHealthDelta: 3, handSizeBonus: -1 },
    radius: 150,
  },
  nebula: {
    kind: 'nebula',
    name: 'Nebula',
    text: 'Hidden in the gas: +1 shield every turn, but display cards cost you 1 more.',
    modifiers: { shieldBonus: 1, marketDiscount: -1 },
    radius: 175,
  },
  darkMatter: {
    kind: 'darkMatter',
    name: 'Dark Matter Cluster',
    text: 'Unseen mass to mine: +1 money every turn, but Thermosiphon costs 1 more.',
    modifiers: { incomeBonus: 1, thermoCostDelta: 1 },
    radius: 150,
  },
  pulsar: {
    kind: 'pulsar',
    name: 'Pulsar',
    text: 'Its beam charges your weapons: your first Solar Flare each turn costs 1 less, but your sun heats by 1 each turn until it reaches 3.',
    modifiers: { firstFlareCostDelta: -1, thawPerTurn: 1, thawCeiling: 3 },
    radius: 150,
  },
};

export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  x: number;
  y: number;
}

/** Anomalies whose reach covers a system. */
export function nodeAnomalies(s: CampaignState, n: CampaignNode): Anomaly[] {
  return (s.anomalies ?? []).filter((a) => Math.hypot(n.x - a.x, n.y - a.y) <= ANOMALIES[a.kind].radius);
}

/** The combined battle modifiers (and their descriptions) for fighting from a system. */
export function anomalyEffects(s: CampaignState, n: CampaignNode) {
  const found = nodeAnomalies(s, n);
  if (!found.length) return null;
  let modifiers: SystemModifiers = {};
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
  credits: number;
  materials: number;
  /** The battle deck: always CAMPAIGN.deckSize card ids. */
  deck: string[];
  /** Owned cards not in the deck or a garrison. Stardust is unlimited and never kept here. */
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
  version: 1;
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
  /** The player's home system type. */
  homeSystemId?: string;
  /** Rival AI factions, 1–3. */
  rivals?: number;
}

export type ConquestChoice = 'settle' | 'absorb' | 'supernova';
export type CardSource = 'deck' | 'reserve';

export type CampaignAction =
  | { type: 'attack'; fromId: string; toId: string }
  /** Hand back the battle once it is over (or ask for it to be auto-resolved from here). */
  | { type: 'finishBattle'; game: GameState; auto?: boolean }
  | { type: 'conquer'; choice: ConquestChoice }
  | { type: 'chooseCard'; defId: string | null }
  | { type: 'heal'; nodeId: string }
  | { type: 'upgradePlanet'; nodeId: string; planet: number }
  | { type: 'buyCard'; slot: number }
  | { type: 'upgradeCard'; from: CardSource; index: number }
  /** Put a reserve card into a deck slot (the slot's card goes to reserve), or clear the slot to Stardust (reserveIndex null). */
  | { type: 'deckSwap'; slot: number; reserveIndex: number | null }
  | { type: 'station'; nodeId: string; from: CardSource; index: number }
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
  { id: 'c_blitz', name: 'Blitz', text: 'Win a battle within 5 rounds.', target: 1, counting: true, value: stat('swiftWins') },
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

export function upgradeCost(node: CampaignNode, planet: number): number {
  return CAMPAIGN.upgradeBaseCost + (node.boosts[planet] ?? 0) * CAMPAIGN.upgradeCostPerLevel;
}

export function canUpgradePlanet(node: CampaignNode, planet: number): boolean {
  const base = systemDef(node.systemId).planets[planet];
  return !!base && base.level + (node.boosts[planet] ?? 0) < 3;
}

export const armoryPrice = (defId: string) => cardDef(defId).cost + CAMPAIGN.armoryMarkup;
export const cardUpgradePrice = (defId: string) => (CARD_UPGRADES[defId] ? cardDef(CARD_UPGRADES[defId]).cost : null);

/** Only these kinds can garrison a system (Stardust is unlimited, so it cannot). */
export function canGarrison(defId: string): boolean {
  const def = cardDef(defId);
  return defId !== 'stardust' && ['economy', 'attack', 'defence', 'command'].includes(def.kind);
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
  opening: Required<OpeningBonus>;
  /** Heat added to the attacker's sun at the start. */
  bombard: number;
  /** Cooling applied to the defender's sun at the start. */
  chill: number;
  /** Extra planet levels (from Command cards). */
  planetLevels: number;
}

/**
 * What a system's stationed cards do when it is attacked: each card's power
 * becomes a head start. Money adds opening money, draw adds cards to the first
 * hand, shields add opening shields, attack heats the attacker's sun, cooling
 * cools the defender's sun, and Command cards upgrade planets.
 */
export function garrisonBonus(n: CampaignNode): GarrisonBonus {
  const b: GarrisonBonus = { opening: { money: 0, shields: 0, draw: 0 }, bombard: 0, chill: 0, planetLevels: 0 };
  for (const g of n.garrison) {
    if (g.status !== 'stationed') continue;
    for (const e of cardDef(g.defId).effects) {
      if (e.type === 'money') b.opening.money += e.amount;
      else if (e.type === 'draw') b.opening.draw += e.amount;
      else if (e.type === 'shield') b.opening.shields += e.amount;
      else if (e.type === 'heatTarget' || e.type === 'heatAllOpponents') b.bombard += e.amount;
      else if (e.type === 'cool') b.chill += e.amount;
      else if (e.type === 'command') b.planetLevels += 1;
    }
  }
  b.bombard = Math.min(b.bombard, CAMPAIGN.maxBombard);
  b.chill = Math.min(b.chill, CAMPAIGN.maxChill);
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
    spread: 90 + nextRandom(s) * 140,
  }));
  // Keep the four corners populated so every faction has room to start.
  clusters.push({ x: m + 60, y: MAP_HEIGHT - m - 60, spread: 110 }, { x: MAP_WIDTH - m - 60, y: m + 60, spread: 110 });
  clusters.push({ x: m + 60, y: m + 60, spread: 110 }, { x: MAP_WIDTH - m - 60, y: MAP_HEIGHT - m - 60, spread: 110 });
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

export function starterDeck(): string[] {
  return [...Array(CAMPAIGN.deckSize - 1).fill('stardust'), 'command_directive'];
}

export function createCampaign(setup: CampaignSetup): CampaignState {
  const rivals = Math.max(1, Math.min(3, setup.rivals ?? 3));
  const s: CampaignState = {
    version: 1,
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
  pts.forEach((pt, i) => {
    const sys = SOLAR_SYSTEMS[randomInt(s, SOLAR_SYSTEMS.length)];
    s.nodes.push({
      id: `n${i}`,
      name: nodeName(s, used),
      x: pt.x,
      y: pt.y,
      systemId: sys.id,
      owner: null,
      links: [],
      boosts: sys.planets.map(() => 0),
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
  for (let i = 0; i <= rivals; i++) {
    const id = `f${i + 1}`;
    const home = corners[i];
    const isAI = i > 0;
    if (!isAI && setup.homeSystemId) home.systemId = systemDef(setup.homeSystemId).id;
    home.boosts = systemDef(home.systemId).planets.map(() => 0);
    home.owner = id;
    home.home = id;
    home.yield = { credits: 3, materials: 3 };
    const f: Faction = {
      id,
      name: isAI ? FACTION_NAMES[i] : setup.playerName || FACTION_NAMES[0],
      isAI,
      credits: CAMPAIGN.startCredits,
      materials: CAMPAIGN.startMaterials,
      deck: starterDeck(),
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
    if (c.clear < 55 || c.clear > reach * 0.85) continue; // in a gap, yet touching a system
    if (homesNow.some((h) => Math.hypot(h.x - c.x, h.y - c.y) <= reach + 40)) continue;
    if (s.anomalies!.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < 330)) continue;
    s.anomalies!.push({ id: `a${s.anomalies!.length}`, kind, x: c.x, y: c.y });
  }

  // Neutral systems grow stronger away from the starting corners.
  const homes = s.nodes.filter((n) => n.home);
  for (const n of s.nodes) {
    if (n.home) continue;
    const d = Math.min(...homes.map((h) => hops(s, h.id, n.id)));
    n.tier = d <= 1 ? 0 : d <= 3 ? 1 : 2;
  }

  refreshArmory(s);
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

function refreshArmory(s: CampaignState) {
  const pool = MARKET_CARDS.filter((d) => d.minPlayers === undefined).flatMap((d) => Array(d.copies).fill(d.id) as string[]);
  s.armory = Array.from({ length: CAMPAIGN.armorySize }, () => pool[randomInt(s, pool.length)]);
}

function randomCardChoices(s: CampaignState): string[] {
  const pool = shuffleInPlace(s, MARKET_CARDS.filter((d) => d.minPlayers === undefined || d.minPlayers <= 2).map((d) => d.id));
  return pool.slice(0, CAMPAIGN.cardChoices);
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

/** Faction f1–f4 are the four alien races, in order. */
const speciesOf = (factionId: string) => Math.max(0, Number(factionId.slice(1)) - 1) % 4;

/** Neutral sentinels' decks, by tier. */
function neutralDeck(tier: number): string[] {
  const deck = starterDeck();
  const extras = [
    [],
    ['stellar_credits', 'coolant_array'],
    ['stellar_credits', 'coronal_lance', 'cryo_vault', 'deflector_grid'],
  ][tier] ?? [];
  extras.forEach((id, i) => (deck[i] = id));
  return deck;
}

function battleSetup(s: CampaignState, attacker: Faction, from: CampaignNode, target: CampaignNode): PlayerSetup[] {
  const owner = target.owner ? factionById(s, target.owner) : null;
  const g = garrisonBonus(target);
  const boosts = [...target.boosts];
  // Command cards in the garrison raise the lowest planets.
  const base = systemDef(target.systemId).planets;
  for (let k = 0; k < g.planetLevels; k++) {
    let best = -1;
    base.forEach((pl, j) => {
      const lvl = pl.level + (boosts[j] ?? 0);
      if (lvl < 3 && (best < 0 || lvl < base[best].level + (boosts[best] ?? 0))) best = j;
    });
    if (best >= 0) boosts[best] = (boosts[best] ?? 0) + 1;
  }
  const fromFx = anomalyEffects(s, from);
  const targetFx = anomalyEffects(s, target);
  return [
    {
      name: attacker.name,
      species: speciesOf(attacker.id),
      isAI: attacker.isAI,
      systemId: from.systemId,
      deck: attacker.deck,
      planetBoosts: from.boosts,
      heatDelta: from.damage + g.bombard,
      extraModifiers: fromFx?.modifiers,
      conditions: fromFx?.conditions,
    },
    {
      extraModifiers: targetFx?.modifiers,
      conditions: targetFx?.conditions,
      name: owner ? owner.name : `${target.name} Sentinels`,
      species: owner ? speciesOf(owner.id) : undefined,
      isAI: owner ? owner.isAI : true,
      systemId: target.systemId,
      deck: owner ? owner.deck : neutralDeck(target.tier),
      planetBoosts: boosts,
      heatDelta: target.damage - g.chill,
      opening: g.opening,
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
    if (game.round <= 5) winner.stats.swiftWins += 1;
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
    n.boosts = n.boosts.map(() => 0);
    n.yield = { credits: Math.max(0, n.yield.credits - 1), materials: Math.max(0, n.yield.materials - 1) };
    n.tier = 0;
    f.stats.absorbed += 1;
    clog(s, `${f.name} absorbs ${n.name}: +${credits} credits, +${materials} materials. The system is left depleted.`);
  } else {
    n.owner = null;
    n.boosts = n.boosts.map(() => 0);
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
      const options = randomCardChoices(s);
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
  refreshArmory(s);
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

function aiTurn(s: CampaignState, f: Faction) {
  const mine = ownedNodes(s, f.id);
  // 1. Repair damaged systems.
  for (const n of [...mine].sort((a, b) => b.damage - a.damage)) {
    while (n.damage > 0 && f.credits >= CAMPAIGN.healCostPerPoint) {
      f.credits -= CAMPAIGN.healCostPerPoint;
      n.damage -= 1;
    }
  }
  // 2. Improve the deck: put reserve cards in, then upgrade Stardust.
  for (let i = 0; i < f.reserve.length; i++) {
    const slot = f.deck.indexOf('stardust');
    if (slot < 0) break;
    f.deck[slot] = f.reserve.splice(i--, 1)[0];
  }
  for (let slot = 0; slot < f.deck.length; slot++) {
    const price = cardUpgradePrice(f.deck[slot]);
    if (price !== null && f.materials >= price + 2 && nextRandom(s) < 0.6) {
      f.materials -= price;
      f.deck[slot] = CARD_UPGRADES[f.deck[slot]];
    }
  }
  // 3. Upgrade planets with spare credits.
  for (const n of mine) {
    const planet = n.boosts.findIndex((_, j) => canUpgradePlanet(n, j));
    if (planet >= 0 && f.credits >= upgradeCost(n, planet) + 6) {
      f.credits -= upgradeCost(n, planet);
      n.boosts[planet] += 1;
    }
  }
  // 4. Garrison a border system with a spare card.
  const border = mine.filter((n) => n.links.some((id) => nodeById(s, id).owner !== f.id) && n.garrison.length < CAMPAIGN.garrisonSlots);
  const spare = f.reserve.findIndex(canGarrison);
  if (border.length && spare >= 0) {
    const n = border[randomInt(s, border.length)];
    n.garrison.push({ uid: uid(s), defId: f.reserve.splice(spare, 1)[0], status: 'arriving' });
  }
  // 5. Attack the weakest reachable system, most turns.
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

function takeCard(f: Faction, from: CardSource, index: number): string {
  if (from === 'deck') {
    const id = f.deck[index];
    if (!id) throw new GameError('No card in that deck slot.');
    if (id === 'stardust') throw new GameError('Stardust cannot be moved; it is always available.');
    f.deck[index] = 'stardust';
    return id;
  }
  const id = f.reserve[index];
  if (!id) throw new GameError('No such card in reserve.');
  f.reserve.splice(index, 1);
  return id;
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
    case 'upgradePlanet': {
      const n = requireOwned(s, f, action.nodeId);
      if (!canUpgradePlanet(n, action.planet)) throw new GameError('That planet is already at its highest level.');
      spendCredits(f, upgradeCost(n, action.planet));
      n.boosts[action.planet] += 1;
      clog(s, `${f.name} upgrades ${systemDef(n.systemId).planets[action.planet].name} at ${n.name}.`);
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
    case 'upgradeCard': {
      const list = action.from === 'deck' ? f.deck : f.reserve;
      const id = list[action.index];
      if (!id) throw new GameError('No such card.');
      const next = CARD_UPGRADES[id];
      if (!next) throw new GameError(`${cardDef(id).name} cannot be upgraded.`);
      spendMaterials(f, cardDef(next).cost);
      list[action.index] = next;
      clog(s, `${f.name} upgrades ${cardDef(id).name} into ${cardDef(next).name}.`);
      break;
    }
    case 'deckSwap': {
      if (action.slot < 0 || action.slot >= CAMPAIGN.deckSize) throw new GameError('No such deck slot.');
      const out = f.deck[action.slot];
      if (action.reserveIndex === null) {
        if (out === 'stardust') throw new GameError('That slot already holds Stardust.');
        f.deck[action.slot] = 'stardust';
      } else {
        const id = f.reserve[action.reserveIndex];
        if (!id) throw new GameError('No such card in reserve.');
        f.reserve.splice(action.reserveIndex, 1);
        f.deck[action.slot] = id;
      }
      if (out !== 'stardust') f.reserve.push(out);
      break;
    }
    case 'station': {
      const n = requireOwned(s, f, action.nodeId);
      if (n.garrison.length >= CAMPAIGN.garrisonSlots) throw new GameError(`${n.name}'s garrison is full.`);
      const list = action.from === 'deck' ? f.deck : f.reserve;
      const id = list[action.index];
      if (!id) throw new GameError('No such card.');
      if (!canGarrison(id)) throw new GameError(`${cardDef(id).name} cannot garrison a system.`);
      takeCard(f, action.from, action.index);
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
