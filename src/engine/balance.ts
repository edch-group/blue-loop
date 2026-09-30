/**
 * Every tunable number in the game lives here so designers can rebalance
 * without touching rules code. Run `npm run simulate` after changing values.
 */
export const BALANCE = {
  minPlayers: 2,
  maxPlayers: 4,

  /** Sun temperature bounds. Reaching `supernovaAt` (raised by Cooling Chamber upgrades) eliminates a player. */
  startingHeat: 0,
  minHeat: -5,
  supernovaAt: 30,

  /** Decks: exactly this many cards, at most `maxCopies` of each, exactly `commandCards` Command cards. */
  deckSize: 20,
  maxCopies: 2,
  /** Anomaly cards are unique: one copy per deck. */
  maxAnomalyCopies: 1,
  commandCards: 2,

  /** Cards in the opening hand, and drawn at the start of each turn after the first. */
  openingHand: 5,
  drawPerTurn: 2,
  /** Seats after the first: extra cards in the opening hand, and extra plays on their first turn. */
  laterSeatCards: 1,
  laterSeatPlays: 1,
  /** Seats after the first also start with a cooler sun. */
  laterSeatCool: 2,
  /** The catch-up only applies in games with at most this many players (in bigger games everyone but the leader gangs up anyway). */
  catchUpMaxPlayers: 2,
  /** An empty deck is refilled by shuffling your discard pile back in, which heats your sun by this much (unblockable). */
  reshuffleHeat: 2,
  /** With both deck and discard pile empty, each card you should draw heats your sun by this much instead (unblockable). */
  fatigueHeat: 2,

  /** You may play as many cards as turns you have taken, up to this cap (before extra-play cards). */
  maxPlays: 4,
  /** Tableau slots. A card played into a full tableau replaces one of yours. */
  tableauSlots: 8,
  /** Kept shields (Deep Current) never exceed this. */
  maxKeptShields: 12,

  /** Command upgrades. Solar Flare: +1 heat on every heat effect. Thermosiphon: +1 on every cooling effect. */
  solarFlareMaxUpgrades: 3,
  thermosiphonMaxUpgrades: 3,
  /** Cooling Chamber: each upgrade raises max health. */
  coolingChamberMaxUpgrades: 3,
  coolingChamberHealthPerUpgrade: 6,

  /**
   * Stellar Instability: the late-game clock that guarantees games end.
   * From this round on, every sun heats at the start of its turn (unblockable).
   * It stacks: +1 in the first unstable round, +1 more every round after.
   */
  instabilityStartsRound: 10,
  instabilityRampEvery: 1,

  /** Log entries kept in game state (older ones are dropped). */
  maxLogEntries: 200,
} as const;
