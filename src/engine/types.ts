/**
 * Blue Loop is a tableau card game. Each player brings a 20-card deck (with
 * exactly 2 Command cards). Cards stay in front of you once played, so their
 * ongoing effects stack into synergies; you may play 1 card on your first
 * turn, 2 on your second, and so on up to a cap.
 */

/** Card types. They matter for synergies ("your attack cards deal +1 heat"). */
export type CardKind = 'attack' | 'defence' | 'growth' | 'global' | 'command';
export const CARD_KINDS: readonly CardKind[] = ['attack', 'defence', 'growth', 'global', 'command'];

/** The three core upgrades. Command cards raise them; they buff your whole deck. */
export type CoreAction = 'solarFlare' | 'thermosiphon' | 'coolingChamber';
export const CORE_ACTIONS: readonly CoreAction[] = ['solarFlare', 'thermosiphon', 'coolingChamber'];

/** Global cards change the table for everyone while they are in play. Only one can be in play at a time. */
export type FieldId = 'solarStorm' | 'iceAge' | 'solarMaximum';

/** A number that grows with your tableau, added on top of an effect's base amount. */
export type Count =
  /** Your tableau cards of a kind (this card included), divided by `per` (rounded down). */
  | { of: 'kind'; kind: CardKind; per?: number }
  /** Every card in your tableau, divided by `per`. */
  | { of: 'cards'; per?: number }
  /** Your upgrades on a core action. */
  | { of: 'upgrades'; action: CoreAction }
  /** Your current shields, divided by `per`. */
  | { of: 'shields'; per?: number }
  /** This card's growth counter. */
  | { of: 'growth' };

/** Only resolve an effect when this holds. */
export type Condition =
  /** Your sun is at half its max health or hotter. */
  | { overheated: true }
  /** You control at least `n` cards of this kind (this one included). */
  | { minKind: CardKind; n: number }
  /** You control at least `n` cards. */
  | { minCards: number }
  /** You have at least one upgrade on this core action. */
  | { upgraded: CoreAction };

export type Effect = (
  /** Heat your target's sun, or every enemy sun. */
  | { type: 'heat'; amount: number; to: 'target' | 'enemies'; plus?: Count; max?: number; /** Also heat every other enemy by this much (no bonuses). */ splash?: number }
  /** Heat your own sun (the price of a strong effect). Shields do not stop it. */
  | { type: 'selfHeat'; amount: number }
  | { type: 'cool'; amount: number; plus?: Count; max?: number }
  | { type: 'shield'; amount: number; plus?: Count; max?: number }
  | { type: 'draw'; amount: number }
  /** Add 1 to this card's growth counter, up to `max`. */
  | { type: 'grow'; max: number }
  /** Command cards: upgrade a core action ('choice': the player picks). */
  | { type: 'upgrade'; action: CoreAction | 'choice' }
  /** Destroy a card of your choice in your target's tableau. */
  | { type: 'destroy' }
) & { if?: Condition };

export type Passive =
  /** Heat effects from your cards of this kind deal +amount (optionally not this card's own; optionally only start-of-turn effects). */
  | { type: 'kindBonus'; kind: CardKind; amount: number; others?: boolean; onTurnOnly?: boolean }
  /** You may play extra cards each turn. */
  | { type: 'extraPlay'; amount: number }
  /** Your shields no longer fade at the start of your turn. */
  | { type: 'keepShields' }
  /** When your shields absorb an enemy's heat, heat that enemy's sun. */
  | { type: 'retaliate'; amount: number }
  /** Global cards: a table-wide effect. */
  | { type: 'field'; field: FieldId };

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  /** Which race's card this is (0 Aureline, 1 Xel'Naru, 2 Vorthane, 3 Ixquor); neutral if unset. */
  race?: number;
  text: string;
  /** When played. */
  onPlay?: Effect[];
  /** At the start of each of your turns while this card is in your tableau. */
  onTurn?: Effect[];
  /** When this card leaves your tableau (replaced or destroyed). */
  onLeave?: Effect[];
  /** While this card is in your tableau. */
  passive?: Passive[];
}

export interface CardInstance {
  uid: string;
  defId: string;
  /** Growth counter, for cards that grow. */
  growth?: number;
}

/** Battle modifiers from the campaign map (anomalies, garrisons). */
export interface BattleModifiers {
  /** Added to the sun's starting heat. */
  startingHeat?: number;
  /** Added to max health. */
  maxHealthDelta?: number;
  /** Shields gained at the start of every turn. */
  shieldPerTurn?: number;
  /** Your sun heats by this much at the start of every turn. */
  heatPerTurn?: number;
  /** Your sun cools by this much at the start of every turn. */
  coolPerTurn?: number;
  /** Extra cards drawn every turn. */
  extraDraw?: number;
  /** Extra cards in the opening hand. */
  openingHand?: number;
}

export interface TurnStats {
  heatDealt: number;
  cardsPlayed: number;
  /** Total cooling applied to your own sun this turn. */
  cooled: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  /** Which of the four alien races this player is (0–3). */
  species: number;
  /** The deck's name, for display. */
  deckName?: string;
  heat: number;
  shields: number;
  /** Command upgrades on each core action. */
  upgrades: Record<CoreAction, number>;
  deck: CardInstance[];
  hand: CardInstance[];
  /** Cards in play in front of this player, in the order they arrived. */
  tableau: CardInstance[];
  discard: CardInstance[];
  /** Command cards played (their upgrades are permanent). */
  commands: CardInstance[];
  eliminated: boolean;
  /** The rival this player's attacks hit. */
  targetId: string | null;
  /** Turns this player has started; sets how many cards they may play. */
  turnsTaken: number;
  /** Cards this player may still play this turn. */
  playsLeft: number;
  turn: TurnStats;
  /** Rivals this player's Stinging Veil has already stung this turn (the turn number, and who). */
  stung?: { turn: number; ids: string[] };
  modifiers?: BattleModifiers;
  /** What the modifiers are, for display ("Nebula: +1 shield each turn"). */
  conditions?: { name: string; text: string }[];
}

export interface LogEntry {
  /** Increasing id, so a UI can tell exactly which entries are new. */
  seq: number;
  turn: number;
  text: string;
}

export interface GameState {
  /** Rules version, so old saves from the deck-building version are ignored. */
  version: 2;
  rngState: number;
  uidCounter: number;
  turnNumber: number;
  /** Increments each time play passes back around to the first seat. */
  round: number;
  activePlayerIndex: number;
  players: PlayerState[];
  winnerId: string | null;
  log: LogEntry[];
}

export interface PlayerSetup {
  name: string;
  isAI: boolean;
  /** The deck, as card ids (default: the race's starter deck). */
  deck?: string[];
  deckName?: string;
  /** Which of the four alien races this player is (0–3). Defaults to the seat order. */
  species?: number;
  /** Campaign battles: heat carried in (damage taken earlier, or a garrison's bombardment). */
  heatDelta?: number;
  /** Campaign battles: upgrades the player starts with (from garrisoned Command cards). */
  upgrades?: Partial<Record<CoreAction, number>>;
  /** Campaign battles: a one-off head start (from a garrison). */
  opening?: { shields?: number; draw?: number };
  /** Campaign battles: cards already in the tableau when the battle starts (a garrison). */
  tableau?: string[];
  modifiers?: BattleModifiers;
  conditions?: { name: string; text: string }[];
}

export interface GameSetup {
  seed: number;
  players: PlayerSetup[];
}

export type Action =
  | {
      type: 'playCard';
      cardUid: string;
      /** Tableau full: the card of yours this one replaces. */
      replaceUid?: string;
      /** Command Directive: which core action to upgrade. */
      upgrade?: CoreAction;
      /** Destroy effects: the card in your target's tableau to destroy. */
      destroyUid?: string;
    }
  | { type: 'setTarget'; targetId: string }
  | { type: 'endTurn' };
