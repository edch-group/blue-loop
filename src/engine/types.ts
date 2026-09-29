export type Track = 'weapons' | 'defences' | 'economy' | 'resources';
export const TRACKS: readonly Track[] = ['weapons', 'defences', 'economy', 'resources'];

import type { RewardId } from './objectives';

export type CardKind = 'basic' | 'command' | 'economy' | 'attack' | 'defence' | 'global' | 'mission';

export type GlobalEffectId = 'solarStorm' | 'iceAge' | 'tradeBoom' | 'magneticStorm' | 'solarMaximum' | 'nebulaDrift';

export type Effect =
  | { type: 'money'; amount: number }
  | { type: 'draw'; amount: number }
  /** Heat one chosen opponent's sun. Needs a target. */
  | { type: 'heatTarget'; amount: number }
  | { type: 'heatAllOpponents'; amount: number }
  /** Heat your own sun (drawback on powerful cards). */
  | { type: 'heatSelf'; amount: number }
  | { type: 'cool'; amount: number }
  | { type: 'shield'; amount: number }
  /** Upgrade a planet or a core action by a level. Needs an upgrade choice. */
  | { type: 'command' }
  | { type: 'global'; effect: GlobalEffectId }
  /** Put this card in front of you as a personal mission (see MISSIONS). */
  | { type: 'mission'; objective: string };

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  cost: number;
  text: string;
  effects: Effect[];
  /** Copies in the 200-card market deck (0 for starter-only cards). */
  copies: number;
  /**
   * Leave this card out of games with fewer players. Cards that hit every
   * enemy are priced for several targets, so they are dropped from 1v1.
   */
  minPlayers?: number;
}

export interface CardInstance {
  uid: string;
  defId: string;
}

export interface Planet {
  id: string;
  name: string;
  track: Track;
  level: number;
}

/** The three upgradeable core actions. Solar Flare and Thermosiphon are used with money; Cooling Chamber is passive. */
export type CoreAction = 'solarFlare' | 'thermosiphon' | 'coolingChamber';
export const CORE_ACTIONS: readonly CoreAction[] = ['solarFlare', 'thermosiphon', 'coolingChamber'];

/** What a Command card upgrades: a core action, or a planet by its id. */
export type UpgradeId = CoreAction | string;

export interface SystemModifiers {
  /** Discount on the first Thermosiphon each turn. */
  firstThermoDiscount?: number;
  /** Solar Flare upgrades the system starts with. */
  startingFlareUpgrades?: number;
  /** Extra shields every turn. */
  shieldBonus?: number;
  /** Extra money every turn. */
  incomeBonus?: number;
  /** Sun starts at this temperature instead of the default. */
  startingHeat?: number;
  /** Extra cards in hand. */
  handSizeBonus?: number;
  /** Market cards cost this much less (minimum 1). */
  marketDiscount?: number;
  /** +1 money at turn start for every N heat your sun has above 0. */
  heatIncomeEvery?: number;

  // Drawbacks
  /** Added to every Solar Flare's cost. */
  flareCostDelta?: number;
  /** Added to the first Solar Flare each turn. */
  firstFlareCostDelta?: number;
  /** Added to Thermosiphon's cost. */
  thermoCostDelta?: number;
  /** Added to all your cooling (Thermosiphon and cooling cards), minimum 1. */
  coolingDelta?: number;
  /** Added to max health (supernova threshold). */
  maxHealthDelta?: number;
  /** Hand size can never exceed this (planets and rewards cannot raise it). */
  handSizeCap?: number;
  /** This system cannot use (or upgrade) Thermosiphon. */
  noThermosiphon?: boolean;
  /** Your sun heats by this much at the start of each of your turns. */
  thawPerTurn?: number;
}

export interface SolarSystemDef {
  id: string;
  name: string;
  flavor: string;
  abilityName: string;
  abilityText: string;
  /** Every system has a downside to balance its ability. */
  drawbackText: string;
  planets: { name: string; track: Track; level: number }[];
  modifiers: SystemModifiers;
}

export interface ActiveGlobal {
  id: GlobalEffectId;
  sourcePlayerId: string;
  /** Number of turn starts left before it expires. */
  turnsRemaining: number;
}

export interface TurnStats {
  heatDealt: number;
  moneySpent: number;
  flares: number;
  thermosiphons: number;
  cardsBought: number;
  cardsPlayed: number;
  /** Total cooling applied to your own sun this turn. */
  cooled: number;
}

/** An objective reward waiting for its player to choose. */
export interface PendingReward {
  playerId: string;
  /** What earned it: an objective or mission name, for display. */
  source: string;
  options: RewardId[];
}

export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  systemId: string;
  planets: Planet[];
  /** Upgrade slots filled on each core action. */
  upgrades: Record<CoreAction, number>;
  /** Objective rewards taken (each at most once). Permanent ones keep working. */
  rewards: RewardId[];
  /** Mission cards in play, waiting for their condition. */
  missions: CardInstance[];
  /** During setup: the two systems this player may choose between. */
  systemOffers?: string[];
  heat: number;
  shields: number;
  money: number;
  deck: CardInstance[];
  hand: CardInstance[];
  inPlay: CardInstance[];
  discard: CardInstance[];
  eliminated: boolean;
  claimedObjectives: string[];
  turn: TurnStats;
  /** Heat absorbed by shields since this player's last turn started. */
  blockedSinceTurnStart: number;
  /** Campaign head start, used up on this player's first turn. */
  opening?: OpeningBonus;
}

export interface LogEntry {
  /** Increasing id, so a UI can tell exactly which entries are new. */
  seq: number;
  turn: number;
  text: string;
}

export interface GameState {
  rngState: number;
  uidCounter: number;
  turnNumber: number;
  /** Increments each time play passes back around to the first seat. */
  round: number;
  /** 'setup' while players choose solar systems; missing means 'play' (older saves). */
  phase?: 'setup' | 'play';
  activePlayerIndex: number;
  players: PlayerState[];
  marketDeck: CardInstance[];
  /** Fixed-size display. `null` marks an empty slot once the market deck runs out. */
  display: (CardInstance | null)[];
  /** Market cards that drifted off the display unbought (out of the game). */
  marketDiscard: CardInstance[];
  globals: ActiveGlobal[];
  /** Face-up global objectives, claimable by the first player to meet them. */
  objectives: string[];
  /** Global objectives not yet revealed. */
  objectiveDeck: string[];
  /** Claimed global objectives, in order. */
  claimed: { id: string; playerId: string }[];
  /** Reward choices owed; the first must be resolved before anything else. */
  pendingRewards: PendingReward[];
  winnerId: string | null;
  log: LogEntry[];
}

export interface PlayerSetup {
  name: string;
  isAI: boolean;
  /** Optional fixed system; otherwise one is drawn at random. */
  systemId?: string;
  /** Campaign battles: the exact starting deck, as card ids (default: 9 Stardust + 1 Command Directive). */
  deck?: string[];
  /** Campaign battles: extra levels on the system's planets, by planet index. */
  planetBoosts?: number[];
  /** Campaign battles: added to the starting heat (damage carried over, or a garrison's attack/cooling). */
  heatDelta?: number;
  /** Campaign battles: a one-off head start on this player's first turn (from a garrison). */
  opening?: OpeningBonus;
}

export interface OpeningBonus {
  money?: number;
  shields?: number;
  /** Extra cards in the first hand. */
  draw?: number;
}

export interface GameSetup {
  seed: number;
  players: PlayerSetup[];
  /** Offer each player two solar systems to choose from (AI players choose at once). */
  draft?: boolean;
}

export type Action =
  | { type: 'playCard'; cardUid: string; targetId?: string; upgradeId?: UpgradeId }
  | { type: 'playAllMoney' }
  | { type: 'buyCard'; slot: number }
  | { type: 'solarFlare'; targetId: string }
  | { type: 'thermosiphon' }
  | { type: 'chooseReward'; reward: RewardId; upgradeId?: UpgradeId; slot?: number }
  | { type: 'chooseSystem'; systemId: string }
  | { type: 'endTurn' };
