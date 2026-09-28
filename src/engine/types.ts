export type Track = 'weapons' | 'defences' | 'economy' | 'resources';
export const TRACKS: readonly Track[] = ['weapons', 'defences', 'economy', 'resources'];

export type CardKind = 'basic' | 'command' | 'economy' | 'attack' | 'defence' | 'global';

export type GlobalEffectId = 'solarStorm' | 'iceAge' | 'tradeBoom' | 'magneticStorm';

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
  /** Upgrade one of your planets by a level. Needs a planet. */
  | { type: 'command' }
  | { type: 'global'; effect: GlobalEffectId };

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  cost: number;
  text: string;
  effects: Effect[];
  /** Copies in the 200-card market deck (0 for starter-only cards). */
  copies: number;
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

export interface SystemModifiers {
  /** Discount on the first Cryostasis each turn. */
  firstCryoDiscount?: number;
  /** Extra heat on the first Solar Flare each turn. */
  firstFlareBonusHeat?: number;
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
}

export interface SolarSystemDef {
  id: string;
  name: string;
  flavor: string;
  abilityName: string;
  abilityText: string;
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
  cryos: number;
  cardsBought: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  systemId: string;
  planets: Planet[];
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
}

export interface LogEntry {
  turn: number;
  text: string;
}

export interface GameState {
  rngState: number;
  uidCounter: number;
  turnNumber: number;
  /** Increments each time play passes back around to the first seat. */
  round: number;
  activePlayerIndex: number;
  players: PlayerState[];
  marketDeck: CardInstance[];
  /** Fixed-size display. `null` marks an empty slot once the market deck runs out. */
  display: (CardInstance | null)[];
  globals: ActiveGlobal[];
  objectives: string[];
  winnerId: string | null;
  log: LogEntry[];
}

export interface PlayerSetup {
  name: string;
  isAI: boolean;
  /** Optional fixed system; otherwise one is drawn at random. */
  systemId?: string;
}

export interface GameSetup {
  seed: number;
  players: PlayerSetup[];
}

export type Action =
  | { type: 'playCard'; cardUid: string; targetId?: string; planetId?: string }
  | { type: 'playAllMoney' }
  | { type: 'buyCard'; slot: number }
  | { type: 'solarFlare'; targetId: string }
  | { type: 'cryostasis' }
  | { type: 'endTurn' };
