/**
 * Every tunable number in the game lives here so designers can rebalance
 * without touching rules code. Run `npm run simulate` after changing values.
 */
export const BALANCE = {
  minPlayers: 2,
  /** Blue Loop is 1v1. */
  maxPlayers: 2,

  /** Sun temperature bounds. Reaching `supernovaAt` eliminates a player. */
  startingHeat: 0,
  minHeat: -10,
  supernovaAt: 24,

  /** Decks: between `deckSize` and `maxDeckSize` cards, at most `maxCopies` of each, and one Command card per `cardsPerCommand` cards. */
  deckSize: 30,
  maxDeckSize: 40,
  cardsPerCommand: 10,
  maxCopies: 2,
  /** Anomaly cards are unique: one copy per deck. */
  maxAnomalyCopies: 1,

  /** Cards in the opening hand, and drawn at each dawn after the first. */
  openingHand: 5,
  drawPerTurn: 1,
  /** The most cards a player may hold: after their dusk, any more are discarded (they pick which). */
  maxHand: 5,
  /** Seats after the first: extra cards in the opening hand, and extra plays on their first day. */
  laterSeatCards: 1,
  laterSeatPlays: 0,
  /** Seats after the first also start with a cooler sun. */
  laterSeatCool: 0,
  /** The catch-up only applies in games with at most this many players (in bigger games everyone but the leader gangs up anyway). */
  catchUpMaxPlayers: 2,
  /** An empty deck is refilled by shuffling your discard pile back in, which heats your sun by this much (unblockable). */
  reshuffleHeat: 2,
  /** With both deck and discard pile empty, each card you should draw heats your sun by this much instead (unblockable). */
  fatigueHeat: 2,

  /**
   * Energy: what you spend to play cards (each card has a cost, see costs.ts). You get as much as the
   * days you have taken, up to `maxPlays` (1, 2, 3, then 4 a day); the industrial planet and energy cards
   * add more on top, with no ceiling.
   */
  maxPlays: 5,
  /** Orbit: turns each planet faces its sun, and what the abundant and industrial planets give each day. */
  orbitTurns: 3,
  abundantDraw: 1,
  /** The industrial planet: +1 energy each day it faces your sun. */
  industrialPlays: 1,
  /** Tableau slots. A full tableau takes no new card until one leaves. */
  tableauSlots: 5,
  /** Each slot's defence, left to right: the middle is safest. Removal cards can only reach cards with low enough defence. */
  slotDefence: [1, 2, 3, 2, 1],
  /** The share of a player's shields that still stands against pierce heat (0: pierce ignores shields). */
  pierceShieldShare: 0.5,
  /** The Command slot's defence (it leads the tableau, out in front of the five). */
  commandSlotDefence: 2,
  /** Fusion cards one card in play can carry. */
  maxFused: 2,
  /** Worn defence each card (and empty slot) mends at its owner's dawn (Sturdy adds defence, not mending). */
  defenceMend: 1,
  /**
   * Stability: how many of your days a card stays in your tableau (its dawn effects trigger
   * that many times), before it fades into your discard pile. Cards with only a when-played effect fade faster.
   */
  stability: 3,
  /** A card whose dawn heat comes with no conditions (straight heat) fades sooner: it is the most reliable damage there is. */
  stabilityDawnHeat: 2,
  stabilityBurst: 1,
  stabilityCommand: 3,
  /** A card costing 1 energy or less never has more stability than this (its race's trait included). */
  cheapMaxStability: 2,
  /** A Relic's: it never fades, and nothing restores it (Brittle); removal reaches it whatever its defence. */
  stabilityRelic: 3,
  /** Stability can be restored up to this. */
  maxStability: 6,
  /** Kept shields (Deep Current) never exceed this. */
  maxKeptShields: 12,


  /**
   * Regional stability runs out: the late-game clock that guarantees games end.
   * From this round on, every sun heats at its dawn (unblockable).
   * It stacks: +1 in the first unstable round, +1 more every round after.
   */
  instabilityStartsRound: 10,
  instabilityRampEvery: 1,

  /** Log entries kept in game state (older ones are dropped). */
  maxLogEntries: 200,
} as const;
