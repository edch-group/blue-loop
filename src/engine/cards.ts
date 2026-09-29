import type { CardDef } from './types';

/** Starter cards: never appear in the market deck. */
export const STARTER_CARDS: CardDef[] = [
  {
    id: 'stardust',
    name: 'Stardust',
    kind: 'basic',
    cost: 0,
    text: '+1 money.',
    effects: [{ type: 'money', amount: 1 }],
    copies: 0,
  },
  {
    id: 'command_directive',
    name: 'Command Directive',
    kind: 'command',
    cost: 0,
    text: 'Upgrade one of your planets by 1 level.',
    effects: [{ type: 'command' }],
    copies: 0,
  },
];

/**
 * The market deck. Copy counts must add up to 200 (checked by tests).
 * Placeholder content: names, costs and counts are open for design review.
 */
export const MARKET_CARDS: CardDef[] = [
  // Economy (62)
  { id: 'stellar_credits', name: 'Stellar Credits', kind: 'economy', cost: 2, text: '+2 money.', effects: [{ type: 'money', amount: 2 }], copies: 14 },
  { id: 'trade_convoy', name: 'Trade Convoy', kind: 'economy', cost: 4, text: '+3 money.', effects: [{ type: 'money', amount: 3 }], copies: 10 },
  { id: 'dyson_tap', name: 'Dyson Tap', kind: 'economy', cost: 5, text: '+4 money. Heat your own sun by 1.', effects: [{ type: 'money', amount: 4 }, { type: 'heatSelf', amount: 1 }], copies: 6 },
  { id: 'asteroid_mining', name: 'Asteroid Mining', kind: 'economy', cost: 3, text: '+1 money. Draw 1 card.', effects: [{ type: 'money', amount: 1 }, { type: 'draw', amount: 1 }], copies: 12 },
  { id: 'deep_scanners', name: 'Deep-Space Scanners', kind: 'economy', cost: 2, text: 'Draw 2 cards.', effects: [{ type: 'draw', amount: 2 }], copies: 12 },

  // Attack (48)
  { id: 'coronal_lance', name: 'Coronal Lance', kind: 'attack', cost: 3, text: 'Heat an enemy sun by 2.', effects: [{ type: 'heatTarget', amount: 2 }], copies: 12 },
  { id: 'plasma_barrage', name: 'Plasma Barrage', kind: 'attack', cost: 5, text: 'Heat every enemy sun by 1.', effects: [{ type: 'heatAllOpponents', amount: 1 }], copies: 10, minPlayers: 3 },
  { id: 'gravity_sling', name: 'Gravity Sling', kind: 'attack', cost: 3, text: '+1 money. Heat an enemy sun by 1.', effects: [{ type: 'money', amount: 1 }, { type: 'heatTarget', amount: 1 }], copies: 10 },
  { id: 'starbreaker', name: 'Starbreaker', kind: 'attack', cost: 7, text: 'Heat an enemy sun by 4.', effects: [{ type: 'heatTarget', amount: 4 }], copies: 4 },
  { id: 'thermal_exchange', name: 'Thermal Exchange', kind: 'attack', cost: 4, text: 'Cool your sun by 1. Heat an enemy sun by 1.', effects: [{ type: 'cool', amount: 1 }, { type: 'heatTarget', amount: 1 }], copies: 10 },

  // Defence (50)
  { id: 'coolant_array', name: 'Coolant Array', kind: 'defence', cost: 2, text: 'Cool your sun by 1.', effects: [{ type: 'cool', amount: 1 }], copies: 12 },
  { id: 'cryo_vault', name: 'Cryo Vault', kind: 'defence', cost: 4, text: 'Cool your sun by 2.', effects: [{ type: 'cool', amount: 2 }], copies: 12 },
  { id: 'deflector_grid', name: 'Deflector Grid', kind: 'defence', cost: 3, text: '+2 shields until your next turn.', effects: [{ type: 'shield', amount: 2 }], copies: 12 },
  { id: 'heat_sink', name: 'Heat Sink', kind: 'defence', cost: 3, text: '+1 money. Cool your sun by 1.', effects: [{ type: 'money', amount: 1 }, { type: 'cool', amount: 1 }], copies: 12 },

  // Command (16)
  { id: 'fleet_command', name: 'Fleet Command', kind: 'command', cost: 6, text: 'Upgrade one of your planets by 1 level.', effects: [{ type: 'command' }], copies: 10 },
  { id: 'strategic_directive', name: 'Strategic Directive', kind: 'command', cost: 8, text: 'Upgrade one of your planets by 1 level. Draw 1 card.', effects: [{ type: 'command' }, { type: 'draw', amount: 1 }], copies: 6 },

  // Missions (12): personal objectives. Play one to put it in front of you;
  // complete it on a later action to earn a reward. The card is then removed.
  { id: 'mission_ignition', name: 'Mission: Ignition', kind: 'mission', cost: 2, text: 'Mission. Deal 3 or more heat to enemy suns in one turn. Reward: choose an objective reward.', effects: [{ type: 'mission', objective: 'm_ignition' }], copies: 2 },
  { id: 'mission_absolute_zero', name: 'Mission: Absolute Zero', kind: 'mission', cost: 2, text: 'Mission. Have your sun at -3 or colder. Reward: choose an objective reward.', effects: [{ type: 'mission', objective: 'm_absolute_zero' }], copies: 2 },
  { id: 'mission_supply_run', name: 'Mission: Supply Run', kind: 'mission', cost: 2, text: 'Mission. Buy 2 cards in one turn. Reward: choose an objective reward.', effects: [{ type: 'mission', objective: 'm_supply_run' }], copies: 2 },
  { id: 'mission_overclock', name: 'Mission: Overclock', kind: 'mission', cost: 3, text: 'Mission. Launch 3 Solar Flares in one turn. Reward: choose an objective reward.', effects: [{ type: 'mission', objective: 'm_overclock' }], copies: 2 },
  { id: 'mission_stockpile', name: 'Mission: Stockpile', kind: 'mission', cost: 2, text: 'Mission. Have 8 or more money at once. Reward: choose an objective reward.', effects: [{ type: 'mission', objective: 'm_stockpile' }], copies: 2 },
  { id: 'mission_fortify', name: 'Mission: Fortify', kind: 'mission', cost: 2, text: 'Mission. Have 3 or more shields at once. Reward: choose an objective reward.', effects: [{ type: 'mission', objective: 'm_fortify' }], copies: 2 },

  // Global (24)
  // Global (24): each sets a FIELD for 3 rounds (a new global replaces it) and has an instant effect.
  { id: 'solar_storm', name: 'Solar Storm', kind: 'global', cost: 5, text: 'Heat an enemy sun by 1. Field, 3 rounds: at the start of each enemy turn, their sun heats by 1.', effects: [{ type: 'heatTarget', amount: 1 }, { type: 'global', effect: 'solarStorm' }], copies: 4, minPlayers: 3 },
  { id: 'solar_maximum', name: 'Solar Maximum', kind: 'global', cost: 4, text: 'Heat an enemy sun by 1. Field, 3 rounds: every Solar Flare deals +1 heat.', effects: [{ type: 'heatTarget', amount: 1 }, { type: 'global', effect: 'solarMaximum' }], copies: 4 },
  { id: 'ice_age', name: 'Ice Age', kind: 'global', cost: 3, text: 'Cool your sun by 2. Field, 3 rounds: every sun cools by 1 at the start of its turn.', effects: [{ type: 'cool', amount: 2 }, { type: 'global', effect: 'iceAge' }], copies: 4 },
  { id: 'trade_boom', name: 'Trade Boom', kind: 'global', cost: 3, text: '+2 money. Field, 3 rounds: every player gains +1 money each turn; you gain +2.', effects: [{ type: 'money', amount: 2 }, { type: 'global', effect: 'tradeBoom' }], copies: 4 },
  { id: 'magnetic_storm', name: 'Magnetic Storm', kind: 'global', cost: 4, text: '+1 money. Field, 3 rounds: enemy Solar Flares cost +1; yours cost 1 less.', effects: [{ type: 'money', amount: 1 }, { type: 'global', effect: 'magneticStorm' }], copies: 4 },
  { id: 'nebula_drift', name: 'Nebula Drift', kind: 'global', cost: 3, text: 'Draw 1 card. Field, 3 rounds: display cards cost 1 less for everyone.', effects: [{ type: 'draw', amount: 1 }, { type: 'global', effect: 'nebulaDrift' }], copies: 4 },
];

const ALL = [...STARTER_CARDS, ...MARKET_CARDS];
const BY_ID = new Map(ALL.map((c) => [c.id, c]));

export function cardDef(defId: string): CardDef {
  const def = BY_ID.get(defId);
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return def;
}

export function allCardDefs(): readonly CardDef[] {
  return ALL;
}
