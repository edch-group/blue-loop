/**
 * The space adventure's numbers (the campaign: Blue Loop's ship-to-ship game), kept apart from the card
 * game's (../balance.ts), so tuning one never shifts the other. The map and economy first, then the
 * battles fought on it (voyage/rules.ts).
 */

export const CAMPAIGN = {
  /** A flagship's deck: its hero and up to this many cards in all (the hero and one card per room). */
  armySize: 6,
  /**
   * A ship's energy: its store to start with (the most energy it holds; the cards aboard may cost no more,
   * added up, than this), and what it regains each day. Both are ship upgrades.
   */
  startCapacity: 5,
  startRegen: 1,
  /** Stations' energy store, by tier, and the Heart's; they regain 1 a day (the Heart 2). */
  stationEnergy: [3, 4, 6],
  heartEnergy: 9,
  /** Wisdom gained each turn (spent on research stations' upgrades). */
  wisdomPerTurn: 1,
  /** Armouries and research stations on the map, and how many cards an armoury stocks (each sold once). */
  armories: 7,
  researchStations: 10,
  armoryStock: 6,
  /** Wisdom for a research station's upgrade, by the upgrade's tier (1–4). */
  researchWisdom: [3, 5, 8, 12],
  /** A hero's own attack and defence before training (they sit in the command room, so start sturdier). */
  heroAttack: 0,
  heroDefence: 2,
  /** The most skill points a hero can put into each of attack and defence. */
  trainMax: 5,
  /** Ship upgrades: credits for the next level (base + per level already built), and each part's most. */
  shipBase: 4,
  shipPerLevel: 4,
  shipMax: { defence: 3, attack: 2, command: 3, shields: 3, hull: 4, capacity: 10, regen: 2 },
  /** Credits for capacity and regeneration levels: dearer than the rest (base, per level). */
  energyUpgrade: { capacity: [5, 3], regen: [10, 10] } as Record<string, [number, number]>,
  /** The command room's defence to start with (on top of the slot's own: 3 in all), and the hull's max health a level. */
  commandRoom: 1,
  hullHealth: 3,
  /** Cards a station (a system with no flagship in it) fights with, by tier, and the Heart's Wardens (its rooms hold 5). */
  stationDeck: [2, 3, 4],
  heartDeck: 5,
  /** Cards a system can hold as its garrison. They start its defence already in play. */
  garrisonSlots: 3,
  startCredits: 6,
  startMaterials: 6,
  /** Credits to repair one point of damage on a system. */
  healCostPerPoint: 1,
  /** Fortifying a system: each level gives its defender extra max health. Credits: base + per level already built. */
  maxFortification: 3,
  fortifyBaseCost: 4,
  fortifyCostPerLevel: 4,
  fortifyHealth: 4,
  /** Absorb pays this many turns of the system's yield at once. */
  absorbTurns: 3,
  /** Materials for a fusion, before the two cards' prices. */
  fusionBase: 4,
  /** Neutral sentinels' suns start this much hotter, by tier (the outer systems are the easiest to take). */
  sentinelHeat: [5, 2, 0],
  /** Damage cap on a system (added to its sun's starting heat in battles). */
  maxDamage: 9,
  /** Damage an attacker's home system takes when the attack is repelled. */
  repelledDamage: 4,
  /** Rewards for winning a battle. */
  winCredits: 3,
  winMaterials: 2,
  /** Rewards for completing a campaign mission (plus a card choice). */
  missionCredits: 4,
  missionMaterials: 3,
  cardChoices: 3,
  activeMissions: 3,
  /** Control this share of all systems to win outright. */
  dominationShare: 0.5,
  /** When this turn ends, the faction controlling the most systems wins. */
  turnLimit: 60,
  /** The map: this many systems scattered in loose clusters over this area (map units). */
  mapSystems: 48,
  mapWidth: 3500,
  mapHeight: 2250,
  mapMargin: 170,
  /** Systems are never closer than this; routes longer than this are dropped unless needed to connect. */
  minSystemGap: 160,
  maxRoute: 690,
  /** Anomalies scattered between systems; each changes battles fought from the systems within its reach. */
  anomalies: 8,
  /** Safety cap on simulated (auto-resolved) battles. */
  battleActionCap: 6000,
  /** Damage (heat carried) an army takes when its attack is repelled, and the most it can carry. */
  armyRepelledDamage: 4,
  /** Credits to repair one point of an army's damage (in a system you hold). */
  armyHealCost: 1,
  /** Finite Stellari: blooms on this many systems, each giving this much a turn to whoever holds it, for this many turns. */
  stellariaBlooms: 4,
  stellariaCredits: 3,
  stellariaMaterials: 3,
  stellariaTurns: 8,
  /** The dimming: every this many turns a star gutters, and its system yields 1 less of each. */
  dimEvery: 7,
  /**
   * Regional stability: after this many turns of lead-up the region gives way, and solar systems collapse,
   * from the rim inwards: one a turn, one more every `collapseRamp` turns after that. Each is marked a turn
   * before it goes. Whatever stands there is lost (an army falls back, if it can).
   */
  stabilityTurns: 8,
  collapseRamp: 12,
  /** The counter: stabilise a collapsing system you hold, for materials, holding it together this many turns more (once per system). */
  stabiliseCost: 8,
  stabiliseTurns: 4,
  /** Each home has one route out, to a system whose sentinels start this much hotter (a weakened first foe). */
  gateHeat: 10,
  /** Recycling a reserve card pays this share of its armory price, in materials (at least 1). */
  recycleShare: 0.5,
  /** The Lost Races: rogue armies at the start, the most there can be, and what beating one pays. */
  lostArmies: 3,
  lostMax: 5,
  lostRelicMaterials: 6,
  /** Chance a lost army wanders on a turn, and that it raids a held system next to it when it can. */
  lostWander: 0.6,
  lostRaid: 0.35,
  /** Star types: how often each turns up (the rest are ordinary yellow stars). */
  starOdds: { red: 0.2, white: 0.14, brown: 0.14, neutron: 0.1 },
  /** The Heart: its yield, and its Wardens' extra max health. */
  heartYield: 6,
  heartWardenHealth: 12,
  /** No other system lies closer than this to the Heart (map units). */
  heartClearance: 300,
  /**
   * The core: systems nearer the Heart are richer and better defended, to make up for the worlds the
   * dimming takes. By routes from the Heart (index 1 = next to it): extra credits and materials each turn,
   * and extra max health for whoever defends there.
   */
  coreYield: [0, 2, 1, 1],
  coreHealth: [0, 6, 4, 2],
  /**
   * Ship battles (voyage/rules.ts). A ship's rooms' own defence, left to right (the middle one safest), and its
   * command room's; and the most energy an X card (one that spends all you have) can spend at once: a ship's
   * energy carries over, and a full store would make an X card a battle in itself.
   */
  roomDefence: [1, 2, 3, 2, 1],
  commandDefence: 2,
  maxX: 4,
} as const;

/** Armory prices in materials, by rarity (race cards cost 1 more than neutral ones). */
export const ARMORY_PRICE = { dwarf: 3, stellar: 5, anomaly: 8, race: 1 } as const;
/** How often each rarity turns up in the armory and mission rewards (relative weights). */
export const OFFER_WEIGHT = { dwarf: 4, stellar: 2, anomaly: 1 } as const;

