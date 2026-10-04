/**
 * Blue Loop is a tableau card game. Each player brings a 20-card deck (with
 * exactly 2 Command cards). Cards stay in front of you once played, so their
 * ongoing effects stack into synergies; you may play 1 card on your first
 * turn, 2 on your second, and so on up to a cap.
 */

/**
 * Card types. They matter for synergies ("your attack cards deal +1 heat").
 * Lightspeed cards are played face down and spring during an enemy's day.
 */
export type CardKind = 'attack' | 'defence' | 'growth' | 'global' | 'command' | 'lightspeed';
export const CARD_KINDS: readonly CardKind[] = ['attack', 'defence', 'growth', 'global', 'command', 'lightspeed'];
/** A kind as players read it: Command cards are Heroes (the id stays, so saved decks carry over). */
export const KIND_NAME: Record<CardKind, string> = { attack: 'attack', defence: 'defence', growth: 'growth', global: 'global', command: 'hero', lightspeed: 'lightspeed' };

/**
 * How rare a card is, shown by a gem at the top of the card: a White Dwarf
 * (the standard rarity), a Stellar sun, or an Anomaly (a black hole). A deck
 * may hold only one copy of each Anomaly.
 */
export type Rarity = 'dwarf' | 'stellar' | 'anomaly';
export const RARITIES: readonly Rarity[] = ['dwarf', 'stellar', 'anomaly'];

/** Global cards change the table for everyone while they are in play. Only one can be in play at a time. */
export type FieldId = 'solarStorm' | 'iceAge' | 'solarMaximum';

/** A number that grows with your tableau, added on top of an effect's base amount. */
export type Count =
  /** Your tableau cards of a kind (this card included), divided by `per` (rounded down). */
  | { of: 'kind'; kind: CardKind; per?: number }
  /** Every card in your tableau, divided by `per`. */
  | { of: 'cards'; per?: number }
  /** Your tableau cards of a race (or sub-race), divided by `per`. */
  | { of: 'race'; race?: number; sub?: string; per?: number }
  /** Your current shields, divided by `per`. */
  | { of: 'shields'; per?: number }
  /** This card's growth counter. */
  | { of: 'growth' }
  /** Your cards right next to this one in your tableau (of a kind, if given). */
  | { of: 'adjacent'; kind?: CardKind }
  /** `amount` while this planet faces your sun, otherwise nothing. */
  | { of: 'planet'; planet: Planet; amount: number }
  /** The energy spent on this card as it was played (cards that spend all your energy), times `times`. */
  | { of: 'spent'; times?: number }
  /**
   * Thermosiphon: how far your sun is below zero (`rival`: your target's sun), times `times`. The
   * colder the sun, the stronger the card; at 0 or hotter, nothing.
   */
  | { of: 'cold'; times?: number; rival?: boolean };

/** Only resolve an effect when this holds. */
export type Condition =
  /** Your sun is at half its max health or hotter. */
  | { overheated: true }
  /** You control at least `n` cards of this kind (this one included). */
  | { minKind: CardKind; n: number }
  /** You control at least `n` cards. */
  | { minCards: number }
  /** You control at least `n` cards of this race (or sub-race), this one included. */
  | { minRace: number; sub?: string; n: number }
  /** The planet facing your sun today (see Orbit). */
  | { planet: Planet };

/**
 * Orbit: three planets circle each sun, each facing it for three of its
 * owner's turns in turn: a dead planet (nothing), an abundant one (draw an
 * extra card each day) and an industrial one (play an extra card each day).
 */
export type Planet = 'dead' | 'abundant' | 'industrial';

export type Effect = (
  /** Heat your target's sun, or every enemy sun. */
  /** `pierce`: the heat ignores shields (so it can't be absorbed, stung or soothed). */
  | { type: 'heat'; amount: number; to: 'target'; plus?: Count; max?: number; pierce?: boolean }
  /** Heat your own sun (the price of a strong effect). Shields do not stop it. */
  | { type: 'selfHeat'; amount: number }
  | { type: 'cool'; amount: number; plus?: Count; max?: number }
  | { type: 'shield'; amount: number; plus?: Count; max?: number }
  | { type: 'draw'; amount: number; plus?: Count }
  /** Add 1 to this card's growth counter, up to `max`. */
  | { type: 'grow'; max: number }
  /** Your other growing cards grow by 1 (up to their own limits). */
  | { type: 'growOthers' }
  /**
   * Destroy a card of your choice in your target's tableau: of a kind, if given, and with at most
   * `maxDefence` defence, if given. `neighbours`: the cards either side of it go back to their owner's hand.
   */
  | { type: 'destroy'; kind?: CardKind; maxDefence?: number; neighbours?: boolean }
  /** Return a card of your choice (with at most `maxDefence` defence, if given) in your target's tableau to its owner's hand. */
  | { type: 'bounce'; maxDefence?: number }
  /** Reduce the stability of a card of your choice in your target's tableau (`all`: every card there). At 0 it fades into its owner's discard pile. */
  | { type: 'erode'; amount: number; all?: boolean }
  /** Restore stability to another card of yours (your choice; `all`: every other card of yours). */
  | { type: 'restore'; amount: number; all?: boolean; /** This card itself regains stability (a Hero mending). */ self?: boolean }
  /** Mend worn defence on your side: this many points, the most worn cards first, then empty slots. */
  | { type: 'repair'; amount: number }
  /** Plant this many Saplings (tokens) in your empty slots, the least defended first. */
  | { type: 'plant'; amount: number }
  /** Return another card of yours from your tableau to your hand (to play it again). */
  | { type: 'recall' }
  /** Return a card of your choice (of a kind, if given) from your discard pile to your hand. */
  | { type: 'recover'; kind?: CardKind; /** With nothing (of that kind) in your discard pile, draw this many cards instead. */ orDraw?: number; /** No choice: the card most recently discarded (a Command card's dawn). */ latest?: boolean }
  /** You may play this many extra cards today. */
  | { type: 'plays'; amount: number }
  /** Lightspeed: the enemy who sprang this card may play no more cards today. */
  | { type: 'halt' }
  /** Move an orbit on by `amount` turns (negative: back), yours or your rival's. Three turns is a whole planet. */
  | { type: 'orbit'; amount: number; who: 'self' | 'rival' }
) & { if?: Condition };

export type Passive =
  /** Heat effects from your cards of this kind deal +amount (optionally not this card's own; optionally only dawn effects). */
  | {
      type: 'kindBonus';
      /** Only cards of this kind (any kind, if unset). */
      kind?: CardKind;
      /** Only this race's cards: a hero's racial buff ("your Vorthane cards shield +1"). */
      race?: number;
      /** Only this sub-race's cards ("your Flarekin cards heat +1"). */
      sub?: string;
      /** What it adds to: heat (the default), cooling or shields. */
      stat?: 'heat' | 'cool' | 'shield';
      amount: number;
      others?: boolean;
      onTurnOnly?: boolean;
    }
  /** You may play extra cards each day. */
  | { type: 'extraPlay'; amount: number; /** Only while this planet faces your sun. */ planet?: Planet }
  /** Your shields no longer fade at your dawn. */
  | { type: 'keepShields' }
  /** Catalyst: whenever this card grows, your other growing cards grow too. */
  | { type: 'catalyst' }
  /** Tidewall: your shields guard your cards too (they otherwise guard only your sun). */
  | { type: 'tidewall' }
  /** When your shields absorb an enemy's heat, heat that enemy's sun. */
  | { type: 'retaliate'; amount: number }
  /** Global cards: a table-wide effect. */
  | { type: 'field'; field: FieldId }
  /** When another of your cards leaves your tableau, these effects resolve (as this card). */
  | { type: 'allyLeaves'; effects: Effect[] }
  /** When your shields absorb an enemy's heat, cool your sun (once per attacking card each day). */
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
  | { type: 'anchor' }
  /** Guard: rival cards' heat can only be aimed at your Guard cards while you have one. */
  | { type: 'taunt' }
  /** Your rivals' planets all count as the dead planet (no energy or cards from them) while this is in play. */
  | { type: 'eatPlanets' };

/**
 * What springs a face-down Lightspeed card, during an enemy's day:
 * - `enemyPlays`: an enemy plays a card (of a kind, if given), before it resolves;
 * - `heated`: an enemy's card is about to heat your sun (by at least `min`);
 * - `targeted`: an enemy is about to destroy or return one of your cards;
 * - `cardHeated`: an enemy's heat is about to strike one of your cards.
 */
export type LightspeedTrigger = { on: 'enemyPlays'; kind?: CardKind } | { on: 'heated'; /** Only heat of at least this much. */ min?: number } | { on: 'targeted' } | { on: 'cardHeated' };

export interface Lightspeed {
  trigger: LightspeedTrigger;
  /** Cancel what sprang it: the card played (it goes to its owner's discard pile), the heat, or the removal. */
  counter?: boolean;
  /** Resolved as the card springs (before the enemy's card, if it is not cancelled). "Your target" is the enemy who sprang it. */
  effects?: Effect[];
  /**
   * A Lightspeed guard (a card of another kind that can also be set face down, for 1 more energy): as it
   * springs it lands in a free slot of your tableau, and the heat that sprang it strikes it instead.
   */
  deploy?: boolean;
}

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  /** Which race's card this is (0 Aureline, 1 Xel'Naru, 2 Vorthane, 3 Ixquor, 4 Nyxari, 5 Korrath, 6 Seren, 7 Pyrr; see races.ts); neutral if unset. */
  race?: number;
  /** Its sub-race (races.ts SUBRACES), for the newer races. */
  sub?: string;
  /** White Dwarf (the default), Stellar or Anomaly. */
  rarity?: Rarity;
  /** A character card: a person (or people) of its race, who features in its picture. */
  character?: boolean;
  text: string;
  /** When played. */
  onPlay?: Effect[];
  /** At each of your dawns while this card is in your tableau. */
  onTurn?: Effect[];
  /** Attunement: at each of your dawns it also gains its orbit position's bonus (attunement.ts), this many times over. */
  attune?: number;
  /** A Hero's abilities: while it leads from your Hero slot, once on each of your days, you may use one. */
  abilities?: HeroAbility[];
  /**
   * Attack: while it is in play and not dimmed, on its owner's day it may attack the rival's sun or one of
   * their cards for this much (as heat), and is then dimmed. A card it attacks that has an attack of its own
   * (or Sting) hits back, at its stability. Set from a rule at load (attack.ts) unless given.
   */
  attack?: number;
  /**
   * A choice made when the card is played (Command cards): one of these is added to its dawn effects
   * for as long as it stays in your tableau. The ids are written into its text as `{options:id|id|…}`.
   */
  choices?: { id: string; onTurn: Effect[] }[];
  /** When this card leaves your tableau (replaced, destroyed or returned to hand). */
  onLeave?: Effect[];
  /** When this card is recovered from your discard pile to your hand. */
  onRecover?: Effect[];
  /** Lightspeed cards: what springs it and what it does. */
  lightspeed?: Lightspeed;
  /** The energy it costs to play (see costs.ts). */
  cost?: number;
  /** Spends all your energy as it is played (at least 1): its effects count how much (an X cost). */
  spendAll?: boolean;
  /**
   * Fusion: played onto one of your cards in play rather than into a slot. That card gains this one's dawn
   * effects, passives, Sturdy and stability; this one goes with it when it leaves.
   */
  fusion?: boolean;
  /** A token (a Sapling): made in play by other cards, never in a deck; when it leaves play it is simply gone. */
  token?: boolean;
  /** Extra defence on top of its slot's (sturdy cards). */
  defence?: number;
  /** Turns it stays in your tableau before it fades into your discard pile (default: see BALANCE.stability). */
  stability?: number;
  /** While this card is in your tableau. */
  passive?: Passive[];
  /** A fused card (campaign armory): the two cards it was made from. */
  fusedFrom?: [string, string];
}

export interface CardInstance {
  uid: string;
  defId: string;
  /** Growth counter, for cards that grow. */
  growth?: number;
  /** In a tableau: which of its slots the card sits in (0 far left … 4 far right). */
  slot?: number;
  /** In a tableau: days left before it fades into its owner's discard pile. */
  stability?: number;
  /**
   * In a tableau: defence worn away by heat. It lasts: a card recovers 1 at each of its owner's dawns
   * (plus its Sturdy), or by Repair; and the wear on its slot's own defence stays in the slot when it leaves.
   */
  dented?: number;
  /** In a tableau: a campaign hero's boons (from gear and skills), carried while it is in play. */
  /** Dimmed: it has taken its action (attacked, or a Hero used an ability) and can't act again until its owner's next dawn. Cards come into play dimmed. */
  dimmed?: boolean;
  boons?: string[];
  /** In a tableau: Fusion cards fused onto it (their effects, passives, Sturdy and stability are its own now). */
  fused?: CardInstance[];
  /** In a tableau: the choice it was played with (Command cards), which it keeps until it leaves. */
  choice?: string;
  /** The energy spent on it as it was played (cards that spend all your energy). */
  spent?: number;
  /** Where its heat goes (as it is played, and at the dawn it was aimed for): a card in your rival's tableau (its uid), or your rival's sun (unset). */
  aim?: string;
}

/** Battle modifiers from the campaign map (anomalies, garrisons). */
export interface BattleModifiers {
  /** Added to the sun's starting heat. */
  startingHeat?: number;
  /** Added to max health. */
  maxHealthDelta?: number;
  /** Shields gained at the start of every day. */
  shieldPerTurn?: number;
  /** Your sun heats by this much at the start of every day. */
  heatPerTurn?: number;
  /** Your sun cools by this much at the start of every day. */
  coolPerTurn?: number;
  /** Extra cards drawn every day. */
  extraDraw?: number;
  /** Extra cards in the opening hand. */
  openingHand?: number;
  /** Extra energy every day. */
  extraPlays?: number;
}

export interface TurnStats {
  heatDealt: number;
  /** The day's energy in all (bonuses and energy gained today included), and the part that is the day's usual amount. */
  energyTotal?: number;
  energyBase?: number;
  /** Energy gained from dawn effects, added to the day's energy once it is set. */
  dawnEnergy?: number;
  cardsPlayed: number;
  /** Total cooling applied to your own sun today. */
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
  /** Shuffling the discard pile back in costs no heat (a campaign army's small deck). */
  freeReshuffle?: boolean;
  /** Campaign: the hero whose card carries boons in play, and those boons. */
  heroBoons?: { hero: string; boons: string[] };
  /** Wear on the defence of empty slots, left by the cards that stood there (slot → points). */
  slotWear?: Record<number, number>;
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
  /** Cards this player may still play today. */
  playsLeft: number;
  /** Where this player's planets are: 0–8, three turns per planet (0–2 dead, 3–5 abundant, 6–8 industrial), moving on one each day. */
  orbit: number;
  turn: TurnStats;
  /** Rivals this player's Stinging Veil has already stung today (the turn number, and who). */
  stung?: { turn: number; ids: string[] };
  modifiers?: BattleModifiers;
  /** What the modifiers are, for display ("Nebula: +1 shield each day"). */
  conditions?: { name: string; text: string }[];
  /** A campaign hero's battle skills: spent (once), or the turn last used (daily). */
  skills?: (BattleSkill & { spent?: boolean; usedTurn?: number })[];
  /** The turn (turnNumber) this player last used their Hero's ability: one a day. */
  abilityTurn?: number;
}

export interface LogEntry {
  /** Increasing id, so a UI can tell exactly which entries are new. */
  seq: number;
  turn: number;
  text: string;
}

export interface GameState {
  /** Rules version, so saves from older rules are ignored. */
  version: 5;
  rngState: number;
  uidCounter: number;
  turnNumber: number;
  /** Increments each time play passes back around to the first seat. */
  round: number;
  activePlayerIndex: number;
  players: PlayerState[];
  winnerId: string | null;
  /** The player who conceded, if the game ended that way. */
  concededBy?: string;
  log: LogEntry[];
  /** What the latest dawn did, effect by effect, so the table can replay it (only on the state a day starts in). */
  turnPulses?: TurnPulse[];
  /** Lightspeed cards that sprang during this move, and the enemy card that sprang each (if a card did). */
  sprung?: { ownerId: string; defId: string; enemyId: string; against?: string; trigger: LightspeedTrigger['on'] }[];
  /** The active player's dawn waits for them to aim their cards' dawn heat (a `dawn` action). */
  awaitingDawn?: boolean;
}

/** One dawn effect, as it happened: what fired it, where it went, and every sun just after. */
export interface TurnPulse {
  /** The card that fired it (none for the table: regional instability, a global card, the map). */
  uid?: string;
  /** Whose day it is. */
  source: string;
  /** The player it reached. */
  to: string;
  /** 'start': no effect, just every sun as the turn's effects begin. */
  kind: 'start' | 'heat' | 'selfHeat' | 'cool' | 'shield' | 'draw' | 'unstable';
  amount: number;
  suns: Record<string, { heat: number; shields: number; eliminated: boolean }>;
  /** The rival card the heat struck, if it was aimed at one (not at their sun). */
  toCard?: string;
  /** Lands at the same moment as the pulse before it (regional instability hits every sun at once). */
  together?: boolean;
}

/**
 * A hero's skill in battle (campaign): used on your own day. `once`: a single use in the battle;
 * otherwise once a day. `cost`: energy, paid like a card's.
 */
/** One of a Hero's abilities: used on your day, at most one a day, for its energy cost (0 if unset). */
export interface HeroAbility {
  id: string;
  name: string;
  text: string;
  effects: Effect[];
  cost?: number;
}

export interface BattleSkill {
  id: string;
  name: string;
  text: string;
  /** The hero (a Hero card id) whose skill it is. */
  hero: string;
  effects: Effect[];
  cost: number;
  once?: boolean;
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
  /** Campaign armies (small decks): shuffling the discard pile back in costs no heat. */
  freeReshuffle?: boolean;
  /** Campaign: the army's hero, and the boons (gear and skills) their card carries while in play. */
  heroBoons?: { hero: string; boons: string[] };
  /** Campaign battles: a one-off head start (from a garrison). */
  opening?: { shields?: number; draw?: number };
  /** Campaign battles: cards already in the tableau when the battle starts (a garrison). */
  tableau?: string[];
  /** Campaign battles: a Lightspeed card already set face down (a garrison). */
  lightspeed?: string;
  modifiers?: BattleModifiers;
  conditions?: { name: string; text: string }[];
  /** Campaign battles: the leading hero's skills that can be used in battle. */
  skills?: BattleSkill[];
}

export interface GameSetup {
  seed: number;
  players: PlayerSetup[];
}

export type Action =
  | {
      type: 'playCard';
      cardUid: string;
      /** A Fusion card: the card of yours in play it fuses onto. */
      hostUid?: string;
      /** Which empty slot of your tableau the card goes in (default: the most defended one free). */
      slot?: number;
      /** A card that can also be set at lightspeed (a Lightspeed guard): set it face down instead, for 1 more energy. */
      faceDown?: boolean;
      /** A card with choices (Command cards): the one picked. */
      choice?: string;
      /** Destroy and bounce effects: the card in your target's tableau. */
      enemyUid?: string;
      /** Recall and restore effects: the card of yours they act on. */
      allyUid?: string;
      /** Recover effects: the card in your discard pile to take back. */
      recoverUid?: string;
      /** A card that heats as it is played: the rival card its heat goes to (unset: their sun). */
      aimUid?: string;
    }
  /** Your dawn: where each of your cards' dawn heat goes (card uid → rival card uid, or null for their sun; unset: the sun, or a Guard). */
  | { type: 'dawn'; aims: Record<string, string | null> }
  | { type: 'setTarget'; targetId: string }
  | { type: 'endTurn' }
  /** Use one of your hero's battle skills (campaign), on your own day. */
  | { type: 'heroSkill'; index: number }
  /** Use one of the abilities of the Hero leading from your Hero slot (one a day). */
  | { type: 'heroAbility'; index: number }
  /** One of your cards attacks: the rival's sun (target null) or one of their cards. */
  | { type: 'attack'; attackerUid: string; targetUid: string | null }
  /** A player gives up (at any time, not only on their day): their rival wins. */
  | { type: 'concede'; playerId: string };
