import { BALANCE } from './balance';
import type { CardDef, Rarity } from './types';

/**
 * The card pool. Cards have no cost: the number of cards you may play each
 * turn is the only limit, so no single card should be a bomb. Power comes from
 * what a card does alongside the others already in your tableau.
 *
 * "Your rival" is the other player (Blue Loop is 1v1). "Start of turn"
 * effects trigger at the start of each of your turns while the card is in play.
 */
export const CARDS: CardDef[] = [
  // ---- Neutral ------------------------------------------------------------
  { id: 'coronal_lance', name: 'Coronal Lance', kind: 'attack', text: 'Heat your rival by 3.', onPlay: [{ type: 'heat', amount: 3, to: 'target' }] },
  { id: 'plasma_relay', name: 'Plasma Relay', kind: 'attack', text: 'Start of turn: heat your rival by 1.', onTurn: [{ type: 'heat', amount: 1, to: 'target' }] },
  { id: 'gravity_sling', name: 'Gravity Sling', kind: 'attack', text: 'Heat your rival by 1. Draw 1 card.', onPlay: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'draw', amount: 1 }] },
  { id: 'thermal_exchange', name: 'Thermal Exchange', kind: 'attack', text: 'Heat your rival by 2. Cool your sun by 1.', onPlay: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'cool', amount: 1 }] },
  {
    id: 'solar_battery',
    name: 'Solar Battery',
    kind: 'attack',
    text: 'Start of turn: if you control 3 or more attack cards, heat your rival by 2.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target', if: { minKind: 'attack', n: 3 } }],
  },
  { id: 'ion_cannon', name: 'Ion Cannon', kind: 'attack', text: "Destroy a card with 2 or less defence in your rival's tableau.", onPlay: [{ type: 'destroy', maxDefence: 2 }] },
  { id: 'coolant_array', name: 'Coolant Array', kind: 'defence', text: 'Start of turn: cool your sun by 1.', onTurn: [{ type: 'cool', amount: 1 }] },
  { id: 'cryo_vault', name: 'Cryo Vault', kind: 'defence', text: 'Cool your sun by 3.', onPlay: [{ type: 'cool', amount: 3 }] },
  { id: 'deflector_grid', name: 'Deflector Grid', kind: 'defence', text: 'Start of turn: gain 2 shields.', onTurn: [{ type: 'shield', amount: 2 }] },
  { id: 'heat_sink', name: 'Heat Sink', kind: 'defence', text: 'Cool your sun by 1. Draw 1 card.', onPlay: [{ type: 'cool', amount: 1 }, { type: 'draw', amount: 1 }] },
  { id: 'deep_scanners', name: 'Deep-Space Scanners', kind: 'growth', text: 'Draw 2 cards.', onPlay: [{ type: 'draw', amount: 2 }] },

  // ---- Global: one at a time on the whole table; a new one replaces it ----
  { id: 'solar_storm', name: 'Solar Storm', kind: 'global', text: 'Global. Every sun heats by 1 at the start of its turn.', passive: [{ type: 'field', field: 'solarStorm' }] },
  { id: 'ice_age', name: 'Ice Age', kind: 'global', text: 'Global. Every sun cools by 1 at the start of its turn.', passive: [{ type: 'field', field: 'iceAge' }] },
  { id: 'solar_maximum', name: 'Solar Maximum', kind: 'global', text: 'Global. Every heat effect deals 1 more heat.', passive: [{ type: 'field', field: 'solarMaximum' }] },

  // ---- Command: upgrades for your whole deck. They stay in your tableau like any other card ----
  { id: 'command_directive', name: 'Command Directive', kind: 'command', text: 'Upgrade Solar Flare, Thermosiphon or Cooling Chamber.', onPlay: [{ type: 'upgrade', action: 'choice' }] },
  {
    id: 'ignition_protocol',
    name: 'Ignition Protocol',
    kind: 'command',
    text: 'Upgrade Solar Flare: your attack cards deal 1 more heat. Start of turn: heat your rival by 1.',
    onPlay: [{ type: 'upgrade', action: 'solarFlare' }],
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'coolant_protocol',
    name: 'Coolant Protocol',
    kind: 'command',
    text: 'Upgrade Thermosiphon: your cooling effects cool 1 more. Start of turn: cool your sun by 1.',
    onPlay: [{ type: 'upgrade', action: 'thermosiphon' }],
    onTurn: [{ type: 'cool', amount: 1 }],
  },
  {
    id: 'chamber_protocol',
    name: 'Chamber Protocol',
    kind: 'command',
    text: `Upgrade Cooling Chamber: +${BALANCE.coolingChamberHealthPerUpgrade} max health. Start of turn: gain 1 shield.`,
    onPlay: [{ type: 'upgrade', action: 'coolingChamber' }],
    onTurn: [{ type: 'shield', amount: 1 }],
  },
  {
    id: 'the_admiralty',
    name: 'The Admiralty',
    kind: 'command',
    text: 'Upgrade Solar Flare, Thermosiphon or Cooling Chamber. Resonance: cards next to this one get +1 to their heat, cooling and shields.',
    onPlay: [{ type: 'upgrade', action: 'choice' }],
    passive: [{ type: 'adjacent', amounts: [1] }],
  },

  // ---- Keeping your Command cards in play ----
  {
    id: 'standing_orders',
    name: 'Standing Orders',
    kind: 'growth',
    text: 'Draw 1 card. Start of turn: if you control 2 or more Command cards, draw 1 card.',
    onPlay: [{ type: 'draw', amount: 1 }],
    onTurn: [{ type: 'draw', amount: 1, if: { minKind: 'command', n: 2 } }],
  },
  {
    id: 'chain_of_command',
    name: 'Chain of Command',
    kind: 'defence',
    text: 'Start of turn: cool your sun by 1 for each Command card you control (up to 2).',
    onTurn: [{ type: 'cool', amount: 0, plus: { of: 'kind', kind: 'command' }, max: 2 }],
  },

  // ---- Resonance: cards that power up their neighbours ----
  {
    id: 'resonance_lattice',
    name: 'Resonance Lattice',
    kind: 'growth',
    text: 'Resonance: cards next to this one get +1 to their heat, cooling and shields.',
    passive: [{ type: 'adjacent', amounts: [1] }],
  },
  {
    id: 'harmonic_singularity',
    name: 'Harmonic Singularity',
    kind: 'growth',
    text: 'Resonance: cards next to this one get +2 to their heat, cooling and shields; cards two places away get +1.',
    passive: [{ type: 'adjacent', amounts: [2, 1] }],
  },

  // ---- Defence: where your cards sit, and what guards them ----
  {
    id: 'bulwark_plating',
    name: 'Bulwark Plating',
    kind: 'defence',
    text: 'Cards next to this one get +1 defence. Start of turn: gain 1 shield.',
    onTurn: [{ type: 'shield', amount: 1 }],
    passive: [{ type: 'guard', amounts: [1] }],
  },
  {
    id: 'aegis_monolith',
    name: 'Aegis Monolith',
    kind: 'defence',
    text: 'Sturdy (+1 defence). Cards next to this one get +2 defence; cards two slots away get +1.',
    defence: 1,
    stability: 4,
    passive: [{ type: 'guard', amounts: [2, 1] }],
  },

  // ---- Stability: keeping your cards in play, and sweeping theirs away ----
  { id: 'chrono_anchor', name: 'Chrono Anchor', kind: 'growth', text: 'Cards next to this one lose no stability.', passive: [{ type: 'anchor' }] },
  {
    id: 'stasis_field',
    name: 'Stasis Field',
    kind: 'growth',
    text: 'Another card of yours regains 2 stability. Heat your own sun by 1.',
    onPlay: [{ type: 'restore', amount: 2 }, { type: 'selfHeat', amount: 1 }],
  },
  {
    id: 'entropy_pulse',
    name: 'Entropy Pulse',
    kind: 'attack',
    text: "A card in your rival's tableau loses 2 stability (at 0 it is swept back into their deck). Heat your rival by 1.",
    onPlay: [{ type: 'erode', amount: 2 }, { type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'decay_wave',
    name: 'Decay Wave',
    kind: 'attack',
    text: "Every card in your rival's tableau loses 1 stability. Heat your own sun by 2.",
    onPlay: [{ type: 'erode', amount: 1, all: true }, { type: 'selfHeat', amount: 2 }],
  },

  // ---- Recovery and recall: getting cards back to use again ----
  { id: 'salvage_drone', name: 'Salvage Drone', kind: 'growth', text: 'Return a card from your discard pile to your hand.', onPlay: [{ type: 'recover' }] },
  {
    id: 'phase_shift',
    name: 'Phase Shift',
    kind: 'growth',
    text: 'Return another card of yours from your tableau to your hand. You may play 1 extra card this turn.',
    onPlay: [{ type: 'recall' }, { type: 'plays', amount: 1 }],
  },

  // ---- Removal: aimed at your rival's tableau ----
  {
    id: 'tractor_beam',
    name: 'Tractor Beam',
    kind: 'attack',
    text: "Return a card with 3 or less defence in your rival's tableau to its owner's hand. Heat your rival by 1.",
    onPlay: [{ type: 'bounce', maxDefence: 3 }, { type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'command_breaker',
    name: 'Command Breaker',
    kind: 'attack',
    text: "Destroy a Command card with 3 or less defence in your rival's tableau. Heat your rival by 1.",
    onPlay: [{ type: 'destroy', kind: 'command', maxDefence: 3 }, { type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'event_horizon',
    name: 'Event Horizon',
    kind: 'attack',
    text: "Destroy a card in your rival's tableau, whatever its defence. The cards either side of it return to their owner's hand.",
    onPlay: [{ type: 'destroy', neighbours: true }],
  },

  // ---- Lightspeed: set face down (one at a time); springs during an enemy's turn ----
  {
    id: 'null_field',
    name: 'Null Field',
    kind: 'lightspeed',
    text: 'Lightspeed. When an enemy plays an attack card, cancel it.',
    lightspeed: { trigger: { on: 'enemyPlays', kind: 'attack' }, counter: true },
  },
  {
    id: 'signal_jammer',
    name: 'Signal Jammer',
    kind: 'lightspeed',
    text: 'Lightspeed. When an enemy plays a Command card, cancel it. Draw 1 card.',
    lightspeed: { trigger: { on: 'enemyPlays', kind: 'command' }, counter: true, effects: [{ type: 'draw', amount: 1 }] },
  },
  {
    id: 'frost_snare',
    name: 'Frost Snare',
    kind: 'lightspeed',
    text: 'Lightspeed. When an enemy plays a defence card, cancel it and heat that enemy by 1.',
    lightspeed: { trigger: { on: 'enemyPlays', kind: 'defence' }, counter: true, effects: [{ type: 'heat', amount: 1, to: 'target' }] },
  },
  {
    id: 'solar_mirror',
    name: 'Solar Mirror',
    kind: 'lightspeed',
    text: "Lightspeed. When an enemy's card is about to heat your sun, first gain 3 shields and heat that enemy by 1.",
    lightspeed: { trigger: { on: 'heated' }, effects: [{ type: 'shield', amount: 3 }, { type: 'heat', amount: 1, to: 'target' }] },
  },
  {
    id: 'decoy_array',
    name: 'Decoy Array',
    kind: 'lightspeed',
    text: 'Lightspeed. When an enemy is about to destroy or return one of your cards, cancel it. Draw 1 card.',
    lightspeed: { trigger: { on: 'targeted' }, counter: true, effects: [{ type: 'draw', amount: 1 }] },
  },
  {
    id: 'temporal_snare',
    name: 'Temporal Snare',
    kind: 'lightspeed',
    text: 'Lightspeed. When an enemy plays a card, cancel it. They may play no more cards this turn.',
    lightspeed: { trigger: { on: 'enemyPlays' }, counter: true, effects: [{ type: 'halt' }] },
  },

  // ---- Aureline: lancers. Many attack cards, each making the others hit harder ----
  {
    id: 'helio_lancer',
    name: 'Helio Lancer',
    kind: 'attack',
    race: 0,
    text: 'Start of turn: heat your rival by 2. If you have a Solar Flare upgrade, gain 1 shield.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'shield', amount: 1, if: { upgraded: 'solarFlare' } }],
  },
  { id: 'focusing_array', name: 'Focusing Array', kind: 'attack', race: 0, text: 'Your other attack cards deal 1 more heat at the start of your turn. Copies do not stack.', passive: [{ type: 'kindBonus', kind: 'attack', amount: 1, others: true, onTurnOnly: true }] },
  {
    id: 'coronal_chorus',
    name: 'Coronal Chorus',
    kind: 'attack',
    race: 0,
    text: 'Heat your rival by 1 for each attack card you control (up to 4).',
    onPlay: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'kind', kind: 'attack' }, max: 4 }],
  },
  { id: 'sunspear', name: 'Sunspear', kind: 'attack', race: 0, text: 'Heat your rival by 4. Heat your own sun by 2.', onPlay: [{ type: 'heat', amount: 4, to: 'target' }, { type: 'selfHeat', amount: 2 }] },
  {
    id: 'dawn_beacon',
    name: 'Dawn Beacon',
    kind: 'growth',
    race: 0,
    text: 'Draw 1 card. Start of turn: if you control 3 or more attack cards, draw 1 card.',
    onPlay: [{ type: 'draw', amount: 1 }],
    onTurn: [{ type: 'draw', amount: 1, if: { minKind: 'attack', n: 3 } }],
  },
  {
    id: 'halo_ward',
    name: 'Halo Ward',
    kind: 'defence',
    race: 0,
    text: 'Start of turn: gain 1 shield for every 2 attack cards you control.',
    onTurn: [{ type: 'shield', amount: 0, plus: { of: 'kind', kind: 'attack', per: 2 } }],
  },

  // ---- Xel'Naru: overload. Run your own sun hot, and profit from it ----
  {
    id: 'shard_reactor',
    name: 'Shard Reactor',
    kind: 'attack',
    race: 1,
    text: 'Start of turn: heat your rival by 2. Heat your own sun by 2.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'selfHeat', amount: 2 }],
  },
  {
    id: 'crystal_storm',
    name: 'Crystal Storm',
    kind: 'attack',
    race: 1,
    text: 'Heat your rival by 3, or by 4 while you are overheated (half your max health or hotter).',
    onPlay: [{ type: 'heat', amount: 3, to: 'target' }, { type: 'heat', amount: 1, to: 'target', if: { overheated: true } }],
  },
  {
    id: 'overload_core',
    name: 'Overload Core',
    kind: 'attack',
    race: 1,
    text: 'Start of turn: heat your rival by 1, or by 3 while you are overheated (half your max health or hotter).',
    onTurn: [
      { type: 'heat', amount: 1, to: 'target' },
      { type: 'heat', amount: 2, to: 'target', if: { overheated: true } },
    ],
  },
  { id: 'martyr_crystal', name: 'Martyr Crystal', kind: 'attack', race: 1, text: 'Heat your rival by 1. When this card leaves your tableau, heat your rival by 3.', onPlay: [{ type: 'heat', amount: 1, to: 'target' }], onLeave: [{ type: 'heat', amount: 3, to: 'target' }] },
  {
    id: 'prism_vent',
    name: 'Prism Vent',
    kind: 'defence',
    race: 1,
    text: 'Cool your sun by 3. Start of turn: cool your sun by 1.',
    onPlay: [{ type: 'cool', amount: 3 }],
    onTurn: [{ type: 'cool', amount: 1 }],
  },
  { id: 'fracture_lens', name: 'Fracture Lens', kind: 'growth', race: 1, text: 'Draw 2 cards. Heat your own sun by 1.', onPlay: [{ type: 'draw', amount: 2 }, { type: 'selfHeat', amount: 1 }] },

  // ---- Vorthane: tides. Build shields, keep them, and sting whoever hits them ----
  { id: 'bell_warden', name: 'Bell Warden', kind: 'defence', race: 2, text: 'Sturdy (+1 defence). Start of turn: gain 3 shields.', defence: 1, onTurn: [{ type: 'shield', amount: 3 }] },
  { id: 'stinging_veil', name: 'Stinging Veil', kind: 'defence', race: 2, text: 'When your shields absorb an enemy\'s heat, heat that enemy\'s sun by 2 (once per attacking card each turn).', passive: [{ type: 'retaliate', amount: 2 }] },
  {
    id: 'tidal_bloom',
    name: 'Tidal Bloom',
    kind: 'defence',
    race: 2,
    text: 'Start of turn: cool your sun by 1, or by 2 if you control 3 or more defence cards.',
    onTurn: [{ type: 'cool', amount: 1 }, { type: 'cool', amount: 1, if: { minKind: 'defence', n: 3 } }],
  },
  {
    id: 'abyssal_choir',
    name: 'Abyssal Choir',
    kind: 'attack',
    race: 2,
    text: 'Start of turn: heat your rival by 1, +1 for every 2 shields you have (up to 5).',
    onTurn: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'shields', per: 2 }, max: 5 }],
  },
  {
    id: 'deep_current',
    name: 'Deep Current',
    kind: 'defence',
    race: 2,
    text: `Gain 2 shields. Your shields no longer fade at the start of your turn (up to ${BALANCE.maxKeptShields}).`,
    onPlay: [{ type: 'shield', amount: 2 }],
    passive: [{ type: 'keepShields' }],
  },
  { id: 'lure_jelly', name: 'Lure Jelly', kind: 'growth', race: 2, text: 'Cool your sun by 2. Draw 1 card.', onPlay: [{ type: 'cool', amount: 2 }, { type: 'draw', amount: 1 }] },

  // ---- Ixquor: the hive. Grow, go wide, and play more each turn ----
  {
    id: 'mycelium_tower',
    name: 'Mycelium Tower',
    kind: 'growth',
    race: 3,
    stability: 4,
    text: 'Start of turn: this card grows (up to 4), then heats your rival by its growth.',
    onTurn: [{ type: 'grow', max: 4 }, { type: 'heat', amount: 0, to: 'target', plus: { of: 'growth' } }],
  },
  { id: 'hive_relay', name: 'Hive Relay', kind: 'growth', race: 3, text: 'You may play 1 extra card each turn.', passive: [{ type: 'extraPlay', amount: 1 }] },
  { id: 'sporecaster', name: 'Sporecaster', kind: 'growth', race: 3, text: 'Start of turn: draw 1 card.', onTurn: [{ type: 'draw', amount: 1 }] },
  {
    id: 'rot_bloom',
    name: 'Rot Bloom',
    kind: 'attack',
    race: 3,
    text: 'Heat your rival by 1, +1 for every 2 cards you control (up to 5).',
    onPlay: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'cards', per: 2 }, max: 5 }],
  },
  {
    id: 'canopy',
    name: 'Canopy',
    kind: 'defence',
    race: 3,
    text: 'Start of turn: cool your sun by 1 for every 2 cards you control.',
    onTurn: [{ type: 'cool', amount: 0, plus: { of: 'cards', per: 2 } }],
  },
  {
    id: 'spore_cloud',
    name: 'Spore Cloud',
    kind: 'attack',
    race: 3,
    text: 'Start of turn: if you control 4 or more cards, heat your rival by 1.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target', if: { minCards: 4 } }],
  },

  // ---- Race cards for resonance, recovery, stability, command synergies and lightspeed ----
  {
    id: 'shard_renewal',
    name: 'Shard Renewal',
    kind: 'growth',
    race: 1,
    text: 'Another card of yours regains 3 stability. Heat your own sun by 2.',
    onPlay: [{ type: 'restore', amount: 3 }, { type: 'selfHeat', amount: 2 }],
  },
  {
    id: 'undertow',
    name: 'Undertow',
    kind: 'attack',
    race: 2,
    text: "A card in your rival's tableau loses 2 stability (at 0 it is swept back into their deck). Gain 2 shields.",
    onPlay: [{ type: 'erode', amount: 2 }, { type: 'shield', amount: 2 }],
  },
  {
    id: 'hive_rooting',
    name: 'Hive Rooting',
    kind: 'growth',
    race: 3,
    text: 'Every other card of yours regains 1 stability. Draw 1 card.',
    onPlay: [{ type: 'restore', amount: 1, all: true }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'aureline_war_herald',
    name: 'Aureline War-Herald',
    kind: 'attack',
    race: 0,
    text: 'Start of turn: heat your rival by 1 for each Command card you control (up to 2).',
    onTurn: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'kind', kind: 'command' }, max: 2 }],
  },
  {
    id: 'sunforge',
    name: 'Sunforge',
    kind: 'attack',
    race: 0,
    text: 'Resonance: attack cards next to this one deal +1 heat. Start of turn: heat your rival by 1.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }],
    passive: [{ type: 'adjacent', amounts: [1], kind: 'attack' }],
  },
  {
    id: 'ember_shard',
    name: 'Ember Shard',
    kind: 'attack',
    race: 1,
    text: 'Heat your rival by 2. When you recover this card, heat your rival by 1.',
    onPlay: [{ type: 'heat', amount: 2, to: 'target' }],
    onRecover: [{ type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'xelnaru_reliquarist',
    name: "Xel'Naru Reliquarist",
    kind: 'growth',
    race: 1,
    text: 'Return an attack card from your discard pile to your hand. Draw 1 card.',
    onPlay: [{ type: 'recover', kind: 'attack' }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'prism_conduit',
    name: 'Prism Conduit',
    kind: 'defence',
    race: 1,
    text: 'Start of turn: cool your sun by 1 for each attack card next to this one.',
    onTurn: [{ type: 'cool', amount: 0, plus: { of: 'adjacent', kind: 'attack' } }],
  },
  {
    id: 'tide_pylon',
    name: 'Tide Pylon',
    kind: 'defence',
    race: 2,
    text: 'Start of turn: gain 1 shield, +1 for each defence card next to this one.',
    onTurn: [{ type: 'shield', amount: 1, plus: { of: 'adjacent', kind: 'defence' } }],
  },
  {
    id: 'riptide_ambush',
    name: 'Riptide Ambushers',
    kind: 'lightspeed',
    race: 2,
    text: "Lightspeed. When an enemy's card is about to heat your sun by 3 or more, cancel that heat and heat the enemy by 2.",
    lightspeed: { trigger: { on: 'heated', min: 3 }, counter: true, effects: [{ type: 'heat', amount: 2, to: 'target' }] },
  },
  {
    id: 'regrowth_pod',
    name: 'Regrowth Pod',
    kind: 'growth',
    race: 3,
    text: 'Return a growth card from your discard pile to your hand. Cool your sun by 1.',
    onPlay: [{ type: 'recover', kind: 'growth' }, { type: 'cool', amount: 1 }],
  },
  {
    id: 'spore_husk',
    name: 'Spore Husk',
    kind: 'growth',
    race: 3,
    text: 'Start of turn: cool your sun by 1. When you recover this card, draw 2 cards.',
    onTurn: [{ type: 'cool', amount: 1 }],
    onRecover: [{ type: 'draw', amount: 2 }],
  },

  // ---- New characters: a Stellar hero and an Anomaly for each race ----
  {
    id: 'aureline_sun_priest',
    name: 'Aureline Sun-Priest',
    kind: 'defence',
    race: 0,
    text: 'Start of turn: cool your sun by 1 for every 2 attack cards you control (up to 2).',
    onTurn: [{ type: 'cool', amount: 0, plus: { of: 'kind', kind: 'attack', per: 2 }, max: 2 }],
  },
  {
    id: 'aurelia_first_light',
    name: 'Aurelia, the First Light',
    kind: 'attack',
    race: 0,
    text: 'Start of turn: heat your rival by 1 for every 2 attack cards you control (up to 3).',
    onTurn: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'kind', kind: 'attack', per: 2 }, max: 3 }],
  },
  {
    id: 'xelnaru_champion',
    name: "Xel'Naru Champion",
    kind: 'attack',
    race: 1,
    text: 'Heat your rival by 1. Start of turn: while you are overheated, heat your rival by 2.',
    onPlay: [{ type: 'heat', amount: 1, to: 'target' }],
    onTurn: [{ type: 'heat', amount: 2, to: 'target', if: { overheated: true } }],
  },
  {
    id: 'kyrvessa_prism_queen',
    name: "Kyr'Vessa, Prism Queen",
    kind: 'attack',
    race: 1,
    text: 'When another of your cards leaves your tableau, heat your rival by 2.',
    passive: [{ type: 'allyLeaves', effects: [{ type: 'heat', amount: 2, to: 'target' }] }],
  },
  {
    id: 'hero_of_rathune',
    name: 'Hero of Rathune',
    kind: 'defence',
    race: 2,
    text: 'Sturdy (+1 defence). Gain 3 shields. Start of turn: gain 1 shield for every 2 defence cards you control (up to 2).',
    defence: 1,
    onPlay: [{ type: 'shield', amount: 3 }],
    onTurn: [{ type: 'shield', amount: 0, plus: { of: 'kind', kind: 'defence', per: 2 }, max: 2 }],
  },
  {
    id: 'ommarath_deep_bell',
    name: 'Ommarath, the Deep Bell',
    kind: 'defence',
    race: 2,
    text: 'Start of turn: gain 1 shield. When your shields absorb an enemy\'s heat, cool your sun by 1 (once per attacking card each turn).',
    onTurn: [{ type: 'shield', amount: 1 }],
    passive: [{ type: 'absorbCool', amount: 1 }],
  },
  {
    id: 'ixquor_brood_tender',
    name: 'Ixquor Brood-Tender',
    kind: 'growth',
    race: 3,
    text: 'Draw 1 card. Start of turn: your other growing cards grow by 1.',
    onPlay: [{ type: 'draw', amount: 1 }],
    onTurn: [{ type: 'growOthers' }],
  },
  {
    id: 'the_brood_queen',
    name: 'The Brood Queen',
    kind: 'growth',
    race: 3,
    text: 'You may play 1 extra card each turn. Start of turn: if you control 4 or more cards, heat your rival by 1.',
    passive: [{ type: 'extraPlay', amount: 1 }],
    onTurn: [{ type: 'heat', amount: 1, to: 'target', if: { minCards: 4 } }],
  },
];

/**
 * Rarity and characters, in one place. Cards not listed are White Dwarfs
 * (the standard rarity) and not characters. A character card shows a person,
 * or people, of its race in its picture; `name` renames the card for them.
 */
const CARD_META: Record<string, { rarity?: Rarity; character?: boolean; name?: string }> = {
  // Neutral
  solar_battery: { rarity: 'stellar' },
  ion_cannon: { rarity: 'stellar' },
  solar_storm: { rarity: 'stellar' },
  ice_age: { rarity: 'stellar' },
  solar_maximum: { rarity: 'stellar' },
  ignition_protocol: { rarity: 'stellar' },
  coolant_protocol: { rarity: 'stellar' },
  chamber_protocol: { rarity: 'stellar' },
  the_admiralty: { rarity: 'anomaly' },
  harmonic_singularity: { rarity: 'anomaly' },
  aegis_monolith: { rarity: 'anomaly' },
  chrono_anchor: { rarity: 'stellar' },
  decay_wave: { rarity: 'stellar' },
  event_horizon: { rarity: 'anomaly' },
  temporal_snare: { rarity: 'anomaly' },
  null_field: { rarity: 'stellar' },
  tractor_beam: { rarity: 'stellar' },
  // Aureline
  helio_lancer: { character: true, name: 'Aureline Lancer' },
  halo_ward: { character: true, name: 'Halo Warden' },
  coronal_chorus: { character: true, rarity: 'stellar', name: 'Chorus of Dawn' },
  focusing_array: { rarity: 'stellar' },
  aureline_sun_priest: { character: true, rarity: 'stellar' },
  aurelia_first_light: { character: true, rarity: 'anomaly' },
  aureline_war_herald: { character: true, rarity: 'stellar' },
  sunforge: { rarity: 'stellar' },
  // Xel'Naru
  martyr_crystal: { character: true, rarity: 'stellar', name: "Xel'Naru Martyr" },
  fracture_lens: { character: true, name: 'Fracture Seer' },
  overload_core: { rarity: 'stellar' },
  xelnaru_champion: { character: true, rarity: 'stellar' },
  kyrvessa_prism_queen: { character: true, rarity: 'anomaly' },
  xelnaru_reliquarist: { character: true, rarity: 'stellar' },
  // Vorthane
  bell_warden: { character: true, name: 'Vorthanian Bellwarden' },
  lure_jelly: { character: true, name: 'Vorthanian Commoners' },
  abyssal_choir: { character: true, rarity: 'stellar' },
  stinging_veil: { rarity: 'stellar' },
  deep_current: { rarity: 'stellar' },
  hero_of_rathune: { character: true, rarity: 'stellar' },
  ommarath_deep_bell: { character: true, rarity: 'anomaly' },
  riptide_ambush: { character: true, rarity: 'stellar' },
  // Ixquor
  sporecaster: { character: true, name: 'Ixquor Sporecaster' },
  hive_relay: { rarity: 'stellar' },
  spore_cloud: { rarity: 'stellar' },
  ixquor_brood_tender: { character: true, rarity: 'stellar' },
  the_brood_queen: { character: true, rarity: 'anomaly' },
};
for (const c of CARDS) Object.assign(c, CARD_META[c.id] ?? {});

/** Display names for the rarities. */
export const RARITY_NAME: Record<Rarity, string> = { dwarf: 'White Dwarf', stellar: 'Stellar', anomaly: 'Anomaly' };

export function rarityOf(defId: string): Rarity {
  return cardDef(defId).rarity ?? 'dwarf';
}

/** Copies of a card a deck may hold: one for an Anomaly, otherwise the usual limit. */
export function copyLimit(defId: string): number {
  return rarityOf(defId) === 'anomaly' ? BALANCE.maxAnomalyCopies : BALANCE.maxCopies;
}

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardDef(defId: string): CardDef {
  const def = BY_ID.get(defId);
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return def;
}

export function allCardDefs(): CardDef[] {
  return CARDS;
}

export const RACE_NAMES = ['Aureline', "Xel'Naru", 'Vorthane', 'Ixquor'] as const;

export interface DeckList {
  name: string;
  /** The race whose emblem the deck carries. */
  race: number;
  cards: string[];
}

const twoOf = (...ids: string[]) => ids.flatMap((id) => [id, id]);

/** A ready-made deck for each race: its cards (with its Stellar hero and its Anomaly), neutral support and two Command cards. */
export const PRESET_DECKS: DeckList[] = [
  {
    // Attack cards that power each other up, Sunforges and a Resonance Lattice boosting their
    // neighbours, Command cards kept in play for the War-Herald, a Stasis Field to hold the best
    // card in place, an Ion Cannon, and a Null Field set face down against the counter-attack.
    name: 'Solar Lancers',
    race: 0,
    cards: [
      ...twoOf('helio_lancer', 'coronal_chorus', 'sunforge', 'command_directive'),
      'focusing_array', 'aureline_war_herald', 'aureline_sun_priest', 'aurelia_first_light', 'halo_ward',
      'resonance_lattice', 'standing_orders', 'stasis_field', 'null_field', 'ion_cannon', 'coolant_array', 'cryo_vault',
    ],
  },
  {
    // Cards that pay off as they leave play (Martyr, Kyr'Vessa), recalled with Phase Shift to do it
    // again; Ember Shards recovered by the Reliquarist; a Prism Conduit cooled by the attack cards
    // beside it; a Tractor Beam; and a Solar Mirror set face down for the return fire.
    name: 'Shard Overload',
    race: 1,
    cards: [
      ...twoOf('shard_reactor', 'martyr_crystal', 'ember_shard', 'prism_vent', 'overload_core', 'command_directive'),
      'kyrvessa_prism_queen', 'xelnaru_champion', 'xelnaru_reliquarist', 'prism_conduit', 'phase_shift', 'tractor_beam',
      'solar_mirror', 'crystal_storm',
    ],
  },
  {
    // Shields and defence: Tide Pylons and a Bulwark around the Wardens, the Aegis Monolith guarding
    // the middle, Undertow to sweep rival cards back into their decks, and Riptide Ambushers set
    // face down against a big hit.
    name: 'Abyssal Tide',
    race: 2,
    cards: [
      ...twoOf('bell_warden', 'abyssal_choir', 'tide_pylon', 'riptide_ambush', 'undertow', 'plasma_relay', 'command_directive'),
      'stinging_veil', 'hero_of_rathune', 'ommarath_deep_bell', 'bulwark_plating', 'aegis_monolith', 'coronal_lance',
    ],
  },
  {
    // Go wide and keep it: Hive Rooting and a Stasis Field to hold the hive in play, a Resonance
    // Lattice in the middle of it, husks and pods recovered from the discard pile, and an Entropy
    // Pulse to wear down a rival's best card.
    name: 'Hive Bloom',
    race: 3,
    cards: [
      ...twoOf('rot_bloom', 'spore_husk', 'command_directive'),
      'mycelium_tower', 'hive_rooting', 'stasis_field', 'resonance_lattice', 'hive_relay', 'sporecaster', 'canopy', 'spore_cloud',
      'ixquor_brood_tender', 'the_brood_queen', 'regrowth_pod', 'entropy_pulse', 'coronal_lance', 'gravity_sling',
    ],
  },
];

export function presetDeck(race: number): DeckList {
  return PRESET_DECKS[((race % 4) + 4) % 4];
}

/** Why a deck list is not legal (empty if it is). */
export function deckProblems(cards: string[]): string[] {
  const problems: string[] = [];
  if (cards.length !== BALANCE.deckSize) problems.push(`A deck needs exactly ${BALANCE.deckSize} cards (this has ${cards.length}).`);
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if (!BY_ID.has(id)) problems.push(`Unknown card: ${id}.`);
    else if (n > copyLimit(id)) problems.push(copyLimit(id) === 1 ? `${cardDef(id).name} is an Anomaly: only one copy per deck.` : `At most ${BALANCE.maxCopies} copies of ${cardDef(id).name}.`);
  }
  const commands = cards.filter((id) => BY_ID.get(id)?.kind === 'command').length;
  if (commands !== BALANCE.commandCards) problems.push(`A deck needs exactly ${BALANCE.commandCards} Command cards (this has ${commands}).`);
  return problems;
}
