import type { GameMode } from './modes';
/**
 * Blue Loop is a tableau card game. Each player brings a 20-card deck (with
 * exactly 2 Command cards). Cards stay in front of you once played, so their
 * ongoing effects stack into synergies; you may play 1 card on your first
 * turn, 2 on your second, and so on up to a cap.
 */

/**
 * Card types. They matter for synergies ("your attack cards deal +1 heat").
 * Lightspeed cards are played face down and spring during an enemy's day.
 * Relics have no attack and never fade, but are Brittle: nothing restores them, and removal reaches them whatever their defence.
 */
export type CardKind = 'attack' | 'defence' | 'growth' | 'global' | 'command' | 'lightspeed' | 'relic';
export const CARD_KINDS: readonly CardKind[] = ['attack', 'defence', 'growth', 'relic', 'global', 'command', 'lightspeed'];
/** A kind as players read it: Command cards are Heroes (the id stays, so saved decks carry over). */
export const KIND_NAME: Record<CardKind, string> = { attack: 'attack', defence: 'defence', growth: 'support', global: 'global', command: 'hero', lightspeed: 'lightspeed', relic: 'relic' };

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
  /** Your cards in play that are not dimmed (that held back today), this one aside, divided by `per`. */
  | { of: 'rested'; per?: number }
  /** Your tableau cards of a race (or sub-race), divided by `per`. */
  | { of: 'race'; race?: number; sub?: string; per?: number }
  /** The defence on your cards in play (as it stands now: wear counts against it), divided by `per`. */
  | { of: 'defence'; per?: number }
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
  | { of: 'cold'; times?: number; rival?: boolean; per?: number };

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
  | { planet: Planet }
  /** Vigil: this card held back today (didn't attack or act, so isn't dimmed). For dusk effects. */
  | { vigil: true };

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
  /** Your other cards grow 1 (any but a Hero, up to BALANCE.maxGrowth). */
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
  /** Chosen: one of your other cards gains this much attack while it stays in play. */
  | { type: 'empower'; amount: number }
  /**
   * Offering (the Aureline): one of your armed cards that hasn't acted today gives up its attack for the rest of
   * the day (it reads 0, unless something gives it more), and a rival card of your choice loses that much
   * stability (`times` over), past its defence.
   */
  | { type: 'offer'; times?: number }
  /**
   * Rootbreak (the Ixquor): the growth on one of your cards splits a rival card's defence by as much (`times` over;
   * `shields`: their sun's shields instead). Worn defence stays worn, as from any blow.
   */
  | { type: 'rootbreak'; times?: number; shields?: boolean }
  /** Plant this many Saplings (tokens) in your empty slots, the least defended first. */
  | { type: 'plant'; amount: number }
  /** Return another card of yours from your tableau to your hand (to play it again). */
  | { type: 'recall' }
  /**
   * Shift: move a card into another slot of its tableau (swapping places with any card there): one of your own,
   * or (`enemy`) one of your rival's. A Hero can't be moved.
   */
  | { type: 'shift'; enemy?: boolean }
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
  /** Catalyst: whenever this card grows, your other cards grow 1 too. */
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
  /** Guard: rival attacks and aimed heat can only target your Guard cards while you have one. */
  | { type: 'taunt' }
  /** Your rivals' planets all count as the dead planet (no energy or cards from them) while this is in play. */
  | { type: 'eatPlanets' };

/**
 * What springs a face-down Lightspeed card, during an enemy's day:
 * - `enemyPlays`: an enemy plays a card (of a kind, if given), before it resolves;
 * - `heated`: an enemy's card is about to heat your sun (by at least `min`);
 * - `targeted`: an enemy is about to destroy or return one of your cards;
 * - `cardAttacked`: an enemy card is about to attack one of your cards.
 */
export type LightspeedTrigger = { on: 'enemyPlays'; kind?: CardKind } | { on: 'heated'; /** Only heat of at least this much. */ min?: number } | { on: 'targeted' } | { on: 'cardAttacked' };

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

export interface FuseBonus {
  text: string;
  onPlay?: Effect[];
  onTurn?: Effect[];
  onDusk?: Effect[];
  passive?: Passive[];
  defence?: number;
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
  /** At each of your dusks (the end of your day, after you have acted) while this card is in your tableau. */
  onDusk?: Effect[];
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
   * Consume: to play it, one of your other cards in play (not your Hero) is given up, your choice. It leaves
   * play as any card does (its own leaving effects, and your cards that answer one leaving, all fire), and the
   * card played may take its slot.
   */
  consume?: boolean;
  /**
   * Fusion: played into a slot as a card of its own, or onto one of your cards in play, which then gains its
   * Fusion bonus (`fuse`) and nothing else; this one goes with it when it leaves.
   */
  fusion?: boolean;
  /** A Fusion card's bonus to the card it is fused onto: its words, and what they do (resolved as for any card). */
  fuse?: FuseBonus;
  /** A token (a Sapling): made in play by other cards, never in a deck; when it leaves play it is simply gone. */
  token?: boolean;
  /** Extra defence on top of its slot's (sturdy cards). */
  defence?: number;
  /** A Hero's stability (what it can take). Other cards' stability comes from their cost (see baseHealth), or `health`. */
  stability?: number;
  /** Heat past its defence it can take in play before it burns away (default: from its cost, see baseHealth). */
  health?: number;
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
  /** (Saves from before version 7 only: the days a card had left before it faded. Cards no longer fade.) */
  stability?: number;
  /**
   * In a tableau: its stability (players see that word), what attacks, stings, aimed heat past its defence and
   * Erode can still take before it burns away.
   */
  health?: number;
  /** In a tableau: its full stability, when gear or Fusion raised it past the printed value. */
  maxHealth?: number;
  /**
   * In a tableau: defence worn away by heat. It lasts: a card recovers 1 at each of its owner's dawns
   * or by Repair; and the wear on its slot's own defence stays in the slot when it leaves.
   */
  dented?: number;
  /** In a tableau: a campaign hero's boons (from gear and skills), carried while it is in play. */
  /** Dimmed: it has taken its action (attacked, or a Hero used an ability) and can't act again until its owner's next dawn. Cards come into play dimmed. */
  dimmed?: boolean;
  /** Attack added by a Chosen effect, while it stays in play. */
  attackBonus?: number;
  /** Attack given up today (Offering): taken off its attack until its owner's next dawn. */
  spentAttack?: number;
  /** Came into play today (dimmed, not Darkspeed): its dusk effects rest until tomorrow. */
  fresh?: boolean;
  boons?: string[];
  /** In a tableau: Fusion cards fused onto it (their effects, passives, Sturdy and stability are its own now). */
  fused?: CardInstance[];
  /** In a tableau: the choice it was played with (Command cards), which it keeps until it leaves. */
  choice?: string;
  /** The energy spent on it as it was played (cards that spend all your energy). */
  spent?: number;
}

/** Battle modifiers from the campaign map (the galaxy, garrisons). */
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
  /** The deck's name, for display. */
  deckName?: string;
  /** The player's picture: a card (its id), whose artwork stands for them. */
  avatar?: string;
  heat: number;
  shields: number;
  /** Shuffling the discard pile back in costs no heat (a campaign army's small deck). */
  /** Cards it began the battle with. */
  deckSize?: number;
  freeReshuffle?: boolean;
  /** Campaign: the hero whose card carries boons in play, and those boons. */
  heroBoons?: { hero: string; boons: string[] };
  /** Campaign battles: this side's hero, their training, and their ship's rooms. */
  hero?: string;
  heroStats?: { attack: number; defence: number };
  rooms?: ShipRooms;
  /** Campaign battles: the hero, beaten, recovering: back in the command room once `left` of their dawns have passed. */
  wounded?: { card: CardInstance; left: number };
  /** Campaign battles: cards destroyed, out of the battle for good. */
  fallen?: CardInstance[];
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
  version: 7;
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
  /** Set while a day passes on: the dusk's pulses carry into the next day's replay (dusk, then dawn). */
  keepPulses?: boolean;
  /** Lightspeed cards that sprang during this move, and the enemy card that sprang each (if a card did). */
  sprung?: { ownerId: string; defId: string; enemyId: string; against?: string; trigger: LightspeedTrigger['on'] }[];
  /** Campaign battle rules (see GameSetup.campaign). */
  campaign?: boolean;
  /** Core or Lost Races (unset: Lost Races). */
  mode?: GameMode;
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
/**
 * What an action costs, beyond nothing: energy, the Hero's own stability, one of your other cards (the weakest,
 * sacrificed to your discard pile), or heat on your own sun. Most abilities are free.
 */
export interface ActionCost {
  energy?: number;
  stability?: number;
  sacrifice?: boolean;
  selfHeat?: number;
}

/** One of a Hero's abilities: used on your day, at most one a day, for its cost (free if unset). */
export interface HeroAbility {
  id: string;
  name: string;
  text: string;
  effects: Effect[];
  /** Energy (kept as `cost` for the energy dots on the card). */
  cost?: number;
  /** Costs other than energy. */
  pay?: Omit<ActionCost, 'energy'>;
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
  /** The deck, as card ids (default: a starter, by seat). */
  deck?: string[];
  deckName?: string;
  /** The player's picture: a card (its id). */
  avatar?: string;
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
  /** Campaign battles: this side's hero (always in their command room; wounded, not lost, when it falls). */
  hero?: string;
  /** Campaign battles: the ship's rooms, upgraded (extra defence and attack by tableau slot, and the command room's). */
  rooms?: ShipRooms;
  /** Campaign battles: the hero's own training (extra attack and defence on their card). */
  heroStats?: { attack: number; defence: number };
}

/** A campaign ship's rooms in battle: extra defence and attack for the card in each tableau slot, and the command room's extra defence. */
export interface ShipRooms {
  defence: number[];
  attack: number[];
  command: number;
  /** Each room's module (campaign): boons carried by whichever card stands in it. */
  boons?: string[][];
}

export interface GameSetup {
  seed: number;
  players: PlayerSetup[];
  /**
   * A campaign battle: the card game's rules, but a small deck (ten cards at most) with nothing left to draw or
   * shuffle back gives no more without the strain, and a ship's opening shields hold through its first day.
   */
  campaign?: boolean;
  /** Core or Lost Races (modes.ts; default Lost Races): which rules the game is played under. */
  mode?: GameMode;
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
      /** Shift effects: the slot the card chosen (yours, or your rival's) moves into. */
      shiftTo?: number;
      /** Recover effects: the card in your discard pile to take back. */
      recoverUid?: string;
      /** A card that heats as it is played: the rival card its heat goes to (unset: their sun, or a Guard). */
      aimUid?: string;
      /** A Consume card: the card of yours in play it consumes (unset: your weakest). */
      sacrificeUid?: string;
    }
  | { type: 'setTarget'; targetId: string }
  /** Ends the day. After dusk a hand over the limit is discarded down to it: `discard` names the cards (any still over are picked for them). */
  | { type: 'endTurn'; discard?: string[] }
  /** Use one of your hero's battle skills (campaign), on your own day. */
  | { type: 'heroSkill'; index: number }
  /** Use one of the abilities of the Hero leading from your Hero slot (one a day). */
  | { type: 'heroAbility'; index: number; /** An ability that heats: the rival card it goes to (unset: their sun, or a Guard). */ aimUid?: string; /** One that costs a sacrifice: the card of yours given up (unset: your weakest). */ sacrificeUid?: string }
  /** One of your cards attacks: one of your rival's cards, or their sun (target null). */
  | { type: 'attack'; attackerUid: string; targetUid: string | null }
  /** A player gives up (at any time, not only on their day): their rival wins. */
  | { type: 'concede'; playerId: string };
