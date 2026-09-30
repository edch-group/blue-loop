/**
 * Blue Loop is a tableau card game. Each player brings a 20-card deck (with
 * exactly 2 Command cards). Cards stay in front of you once played, so their
 * ongoing effects stack into synergies; you may play 1 card on your first
 * turn, 2 on your second, and so on up to a cap.
 */

/**
 * Card types. They matter for synergies ("your attack cards deal +1 heat").
 * Lightspeed cards are played face down and spring during an enemy's turn.
 */
export type CardKind = 'attack' | 'defence' | 'growth' | 'global' | 'command' | 'lightspeed';
export const CARD_KINDS: readonly CardKind[] = ['attack', 'defence', 'growth', 'global', 'command', 'lightspeed'];

/**
 * How rare a card is, shown by a gem at the top of the card: a White Dwarf
 * (the standard rarity), a Stellar sun, or an Anomaly (a black hole). A deck
 * may hold only one copy of each Anomaly.
 */
export type Rarity = 'dwarf' | 'stellar' | 'anomaly';
export const RARITIES: readonly Rarity[] = ['dwarf', 'stellar', 'anomaly'];

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
  | { of: 'growth' }
  /** Your cards right next to this one in your tableau (of a kind, if given). */
  | { of: 'adjacent'; kind?: CardKind };

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
  | { type: 'heat'; amount: number; to: 'target'; plus?: Count; max?: number }
  /** Heat your own sun (the price of a strong effect). Shields do not stop it. */
  | { type: 'selfHeat'; amount: number }
  | { type: 'cool'; amount: number; plus?: Count; max?: number }
  | { type: 'shield'; amount: number; plus?: Count; max?: number }
  | { type: 'draw'; amount: number }
  /** Add 1 to this card's growth counter, up to `max`. */
  | { type: 'grow'; max: number }
  /** Your other growing cards grow by 1 (up to their own limits). */
  | { type: 'growOthers' }
  /** Command cards: upgrade a core action ('choice': the player picks). */
  | { type: 'upgrade'; action: CoreAction | 'choice' }
  /**
   * Destroy a card of your choice in your target's tableau: of a kind, if given, and with at most
   * `maxDefence` defence, if given. `neighbours`: the cards either side of it go back to their owner's hand.
   */
  | { type: 'destroy'; kind?: CardKind; maxDefence?: number; neighbours?: boolean }
  /** Return a card of your choice (with at most `maxDefence` defence, if given) in your target's tableau to its owner's hand. */
  | { type: 'bounce'; maxDefence?: number }
  /** Reduce the stability of a card of your choice in your target's tableau (`all`: every card there). At 0 it is swept back into its owner's deck. */
  | { type: 'erode'; amount: number; all?: boolean }
  /** Restore stability to another card of yours (your choice; `all`: every other card of yours). */
  | { type: 'restore'; amount: number; all?: boolean }
  /** Return another card of yours from your tableau to your hand (to play it again). */
  | { type: 'recall' }
  /** Return a card of your choice (of a kind, if given) from your discard pile to your hand. */
  | { type: 'recover'; kind?: CardKind }
  /** You may play this many extra cards this turn. */
  | { type: 'plays'; amount: number }
  /** Lightspeed: the enemy who sprang this card may play no more cards this turn. */
  | { type: 'halt' }
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
  | { type: 'field'; field: FieldId }
  /** When another of your cards leaves your tableau, these effects resolve (as this card). */
  | { type: 'allyLeaves'; effects: Effect[] }
  /** When your shields absorb an enemy's heat, cool your sun (once per attacking card each turn). */
  | { type: 'absorbCool'; amount: number }
  /**
   * Resonance: your cards near this one in your tableau (of a kind, if given)
   * get a bonus on their heat, cooling and shields. `amounts[0]` for the cards
   * right next to it, `amounts[1]` for the cards two places away, and so on.
   */
  | { type: 'adjacent'; amounts: number[]; kind?: CardKind }
  /** Bulwark: your cards near this one get more defence (`amounts[0]` right next to it, `amounts[1]` two slots away). */
  | { type: 'guard'; amounts: number[] }
  /** Your cards next to this one lose no stability. */
  | { type: 'anchor' };

/**
 * What springs a face-down Lightspeed card, during an enemy's turn:
 * - `enemyPlays`: an enemy plays a card (of a kind, if given), before it resolves;
 * - `heated`: an enemy's card is about to heat your sun (by at least `min`);
 * - `targeted`: an enemy is about to destroy or return one of your cards.
 */
export type LightspeedTrigger = { on: 'enemyPlays'; kind?: CardKind } | { on: 'heated'; /** Only heat of at least this much. */ min?: number } | { on: 'targeted' };

export interface Lightspeed {
  trigger: LightspeedTrigger;
  /** Cancel what sprang it: the card played (it goes to its owner's discard pile), the heat, or the removal. */
  counter?: boolean;
  /** Resolved as the card springs (before the enemy's card, if it is not cancelled). "Your target" is the enemy who sprang it. */
  effects?: Effect[];
}

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  /** Which race's card this is (0 Aureline, 1 Xel'Naru, 2 Vorthane, 3 Ixquor); neutral if unset. */
  race?: number;
  /** White Dwarf (the default), Stellar or Anomaly. */
  rarity?: Rarity;
  /** A character card: a person (or people) of its race, who features in its picture. */
  character?: boolean;
  text: string;
  /** When played. */
  onPlay?: Effect[];
  /** At the start of each of your turns while this card is in your tableau. */
  onTurn?: Effect[];
  /** When this card leaves your tableau (replaced, destroyed or returned to hand). */
  onLeave?: Effect[];
  /** When this card is recovered from your discard pile to your hand. */
  onRecover?: Effect[];
  /** Lightspeed cards: what springs it and what it does. */
  lightspeed?: Lightspeed;
  /** Extra defence on top of its slot's (sturdy cards). */
  defence?: number;
  /** Turns it stays in your tableau before it is swept back into your deck (default: see BALANCE.stability). */
  stability?: number;
  /** While this card is in your tableau. */
  passive?: Passive[];
}

export interface CardInstance {
  uid: string;
  defId: string;
  /** Growth counter, for cards that grow. */
  growth?: number;
  /** In a tableau: which of its slots the card sits in (0 far left … 4 far right). */
  slot?: number;
  /** In a tableau: turns left before it is swept back into its owner's deck. */
  stability?: number;
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
  /**
   * Cards in play in front of this player, left to right (sorted by `slot`; slots may be empty).
   * Position matters: the middle slots give more defence, and resonance works on neighbours.
   */
  tableau: CardInstance[];
  discard: CardInstance[];
  /** A face-down Lightspeed card waiting to spring (only one at a time). Rivals see only its back. */
  lightspeed: CardInstance | null;
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
  /** Rules version, so saves from older rules are ignored. */
  version: 4;
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
  /** Campaign battles: a Lightspeed card already set face down (a garrison). */
  lightspeed?: string;
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
      /** Which empty slot of your tableau the card goes in (default: the most defended one free). */
      slot?: number;
      /** Command Directive: which core action to upgrade. */
      upgrade?: CoreAction;
      /** Destroy and bounce effects: the card in your target's tableau. */
      enemyUid?: string;
      /** Recall and restore effects: the card of yours they act on. */
      allyUid?: string;
      /** Recover effects: the card in your discard pile to take back. */
      recoverUid?: string;
    }
  | { type: 'setTarget'; targetId: string }
  | { type: 'endTurn' };
