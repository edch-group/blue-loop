/**
 * Every tunable number in the game lives here so designers can rebalance
 * without touching rules code. Run `npm run simulate` after changing values.
 */
export const BALANCE = {
  minPlayers: 2,
  maxPlayers: 4,

  /** Sun temperature bounds. Reaching `supernovaAt` (raised by Cooling Chamber upgrades) eliminates a player. */
  startingHeat: 0,
  minHeat: -10,
  supernovaAt: 10,

  /** Starting deck: 9 basic cards + 1 command card. */
  startingBasicCards: 9,
  startingCommandCards: 1,
  handSize: 5,

  /** Market display. */
  displaySize: 3,

  /**
   * The two core actions, usable every turn as often as money allows.
   * Each upgrade makes the action 1 more effective.
   */
  solarFlareCost: 2,
  solarFlareHeat: 1,
  solarFlareMaxUpgrades: 3, // max 4 heat per flare
  thermosiphonCost: 2,
  thermosiphonCool: 1,
  thermosiphonMaxUpgrades: 1, // max 2 cooling per use
  /** Cooling Chamber: passive. Each upgrade raises your supernova threshold (max health). */
  coolingChamberMaxUpgrades: 3,
  coolingChamberHealthPerUpgrade: 5, // 10 → 15 → 20 → 25

  /** Planet upgrades. */
  maxPlanetLevel: 3,
  /** +1 money at turn start per economy level. */
  economyIncomePerLevel: 1,
  /** Every planet level counts: each one adds its track's bonus once. */
  /** +1 hand size per resource level. */
  resourceCardsPerLevel: 1,
  /** +1 shield (refreshed each turn) per defence level. */
  shieldsPerDefenceLevel: 1,
  /** Your heat ignores 1 enemy shield per weapon level. */
  piercePerWeaponLevel: 1,

  /**
   * Stellar Instability: the late-game clock that guarantees games end.
   * From this round on, every sun heats at the start of its turn (unblockable).
   * It stacks: +1 in the first unstable round, +1 more every round after.
   */
  instabilityStartsRound: 8,
  instabilityRampEvery: 1,

  /** Log entries kept in game state (older ones are dropped). */
  maxLogEntries: 200,

  /** Number of public objectives drawn each game. */
  objectivesPerGame: 3,
} as const;
