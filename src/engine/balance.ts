/**
 * Every tunable number in the game lives here so designers can rebalance
 * without touching rules code. Run `npm run simulate` after changing values.
 */
export const BALANCE = {
  minPlayers: 2,
  /** Blue Loop is 1v1. */
  maxPlayers: 2,

  /** Sun temperature bounds. Reaching `supernovaAt` (raised by Cooling Chamber upgrades) eliminates a player. */
  startingHeat: 0,
  minHeat: -5,
  supernovaAt: 24,

  /** Decks: exactly this many cards, at most `maxCopies` of each, exactly `commandCards` Command cards. */
  deckSize: 20,
  maxCopies: 2,
  /** Anomaly cards are unique: one copy per deck. */
  maxAnomalyCopies: 1,
  commandCards: 2,

  /** Cards in the opening hand, and drawn at each dawn after the first. */
  openingHand: 5,
  drawPerTurn: 1,
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

  /** You may play as many cards as turns you have taken, up to this cap (before extra-play cards). */
  maxPlays: 2,
  /** Orbit: turns each planet faces its sun, and what the abundant and industrial planets give each day. */
  orbitTurns: 3,
  abundantDraw: 1,
  industrialPlays: 1,
  /** Tableau slots. A full tableau takes no new card until one leaves. */
  tableauSlots: 5,
  /** Each slot's defence, left to right: the middle is safest. Removal cards can only reach cards with low enough defence. */
  slotDefence: [1, 2, 3, 2, 1],
  /**
   * Stability: how many of your days a card stays in your tableau (its dawn effects trigger
   * that many times), before it fades into your discard pile. Cards with only a when-played effect fade faster.
   */
  stability: 3,
  stabilityBurst: 1,
  stabilityCommand: 3,
  /** Stability can be restored up to this. */
  maxStability: 6,
  /** Kept shields (Deep Current) never exceed this. */
  maxKeptShields: 12,

  /** Command upgrades. Solar Flare: +1 heat on every heat effect. Thermosiphon: +1 on every cooling effect. */
  solarFlareMaxUpgrades: 3,
  thermosiphonMaxUpgrades: 3,
  /** Cooling Chamber: each upgrade raises max health. */
  coolingChamberMaxUpgrades: 3,
  coolingChamberHealthPerUpgrade: 6,

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
