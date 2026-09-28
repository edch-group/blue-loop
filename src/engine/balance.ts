/**
 * Every tunable number in the game lives here so designers can rebalance
 * without touching rules code. Run `npm run simulate` after changing values.
 */
export const BALANCE = {
  minPlayers: 2,
  maxPlayers: 4,

  /** Sun temperature bounds. Reaching `supernovaAt` eliminates a player. */
  startingHeat: 0,
  minHeat: -10,
  supernovaAt: 10,

  /** Starting deck: 9 basic cards + 1 command card. */
  startingBasicCards: 9,
  startingCommandCards: 1,
  handSize: 5,

  /** Market display. */
  displaySize: 8,

  /** Money actions available every turn, unlimited uses. */
  solarFlareCost: 2,
  solarFlareHeat: 1,
  cryostasisCost: 2,
  cryostasisCool: 1,

  /** Planet upgrades. */
  maxPlanetLevel: 3,
  /** +1 money at turn start per economy level. */
  economyIncomePerLevel: 1,
  /** +1 hand size for every N resource levels. */
  resourceLevelsPerExtraCard: 2,
  /** Shields refreshed at turn start: 1 for every N defence levels. */
  defenceLevelsPerShield: 2,
  /** First flare each turn gains +1 heat for every N weapon levels. */
  weaponLevelsPerBonusHeat: 2,

  /**
   * Stellar Instability: the late-game clock that guarantees games end.
   * From this round on, every sun heats at the start of its turn (unblockable),
   * by 1 plus 1 more every `instabilityRampEvery` rounds.
   */
  instabilityStartsRound: 8,
  instabilityRampEvery: 4,

  /** Log entries kept in game state (older ones are dropped). */
  maxLogEntries: 200,

  /** Number of public objectives drawn each game. */
  objectivesPerGame: 3,
} as const;
