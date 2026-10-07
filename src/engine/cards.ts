import { BALANCE } from './balance';
import type { CardDef, Rarity } from './types';
import { EXPANSION, EXPANSION_META } from './cards-expansion';
import { ATTUNE_CARDS, ATTUNE_COSTS } from './cards-attune';
import { RACE_CARDS } from './cards-races';
import { DUSK_CARDS } from './cards-dusk';
import { BIG_CARDS } from './cards-big';
import { RELIC_CARDS } from './cards-relics';
import { HERO_CARDS, heroCost } from './heroes-battle';
import { ruleAttack } from './attack';
import { FUSION_CARDS, FUSION_COSTS, TOKENS } from './cards-fusion';
import { BOONS } from './boons';
import { raceTrait } from './races';
import { CARD_COSTS } from './costs';
import { commandChoices } from './commands';
import { CORE_VERSIONS } from './cards-core';
import { DAWN_ATTACK_CORE_TEXT, DAWN_ATTACK_EXTRA, DAWN_ATTACK_CORE_EXTRA, DAWN_ATTACK_TEXT } from './dawn-attack';
import { rulesMode, modeProblem, type GameMode } from './modes';

/**
 * The card pool. Cards have no cost: the number of cards you may play each
 * turn is the only limit, so no single card should be a bomb. Power comes from
 * what a card does alongside the others already in your tableau.
 *
 * "Your rival" is the other player (Blue Loop is 1v1). "Dawn"
 * effects trigger at each of your dawns while the card is in play.
 */
export const CARDS: CardDef[] = [
  // ---- Neutral ------------------------------------------------------------
  { id: 'coronal_lance', name: 'Coronal Lance', kind: 'attack', text: '{heat:3}.', onPlay: [{ type: 'heat', amount: 3, to: 'target' }] },
  { id: 'plasma_relay', name: 'Plasma Relay', kind: 'attack', text: '{sturdy:1}. {dawn}: {heat:1}.', defence: 1, onTurn: [{ type: 'heat', amount: 1, to: 'target' }] },
  { id: 'gravity_sling', name: 'Gravity Sling', kind: 'attack', text: '{heat:1}. Draw 1.', onPlay: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'draw', amount: 1 }] },
  { id: 'thermal_exchange', name: 'Thermal Exchange', kind: 'attack', text: '{heat:2}. {cool:1}.', onPlay: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'cool', amount: 1 }] },
  {
    id: 'solar_battery',
    name: 'Solar Battery',
    kind: 'attack',
    text: '{dawn}: {heat:1}. {heat:+1} with 3+ attack cards.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'heat', amount: 1, to: 'target', if: { minKind: 'attack', n: 3 } }],
  },
  { id: 'ion_cannon', name: 'Ion Cannon', kind: 'attack', text: "{destroy:2}.", onPlay: [{ type: 'destroy', maxDefence: 2 }] },
  { id: 'coolant_array', name: 'Coolant Array', kind: 'defence', text: '{dusk}: {cool:1}.', onDusk: [{ type: 'cool', amount: 1 }] },
  { id: 'cryo_vault', name: 'Cryo Vault', kind: 'defence', text: '{cool:3}.', onPlay: [{ type: 'cool', amount: 3 }] },
  { id: 'deflector_grid', name: 'Deflector Grid', kind: 'defence', text: '{sturdy:1}. {dawn}: {shield:2}.', defence: 1, onTurn: [{ type: 'shield', amount: 2 }] },
  { id: 'heat_sink', name: 'Heat Sink', kind: 'defence', text: '{cool:2}. Draw 1.', onPlay: [{ type: 'cool', amount: 2 }, { type: 'draw', amount: 1 }] },
  { id: 'deep_scanners', name: 'Deep-Space Scanners', kind: 'growth', text: 'Draw 2.', onPlay: [{ type: 'draw', amount: 2 }] },

  // ---- Global: one at a time on the whole table; a new one replaces it ----
  { id: 'solar_storm', name: 'Solar Storm', kind: 'global', text: '{global}. Every sun takes {heat:1} at its dawn.', passive: [{ type: 'field', field: 'solarStorm' }] },
  { id: 'ice_age', name: 'Ice Age', kind: 'global', text: '{global}. Every sun gets {cool:1} at its dawn.', passive: [{ type: 'field', field: 'iceAge' }] },
  { id: 'solar_maximum', name: 'Solar Maximum', kind: 'global', text: '{global}. Every {heat} effect deals 1 more.', passive: [{ type: 'field', field: 'solarMaximum' }] },

  // ---- Command: the heroes who lead each race. One at a time, in the Command slot ahead of the tableau
  // (a new one replaces the old). Played with a choice of dawn effect (+1 energy, draw 1, or the hero's
  // own), they stay their full term, and can't be recovered or recalled to your own hand (a rival can
  // still send them back) ----
  // Aureline
  { id: 'command_directive', name: 'Solarch Veyra', kind: 'command', race: 0, text: '{dawn}, one of: {options:energy1|draw1|shield2}', choices: commandChoices('energy1', 'draw1', 'shield2') },
  { id: 'ignition_protocol', name: 'Sol-Marshal Aurex', kind: 'command', race: 0, text: '{dawn}, one of: {options:energy1|draw1|heat2}', choices: commandChoices('energy1', 'draw1', 'heat2') },
  // Xel'Naru (Archon Seris is in the second set)
  { id: 'coolant_protocol', name: 'Hierarch Vael', kind: 'command', race: 1, text: '{dawn}, one of: {options:energy1|draw1|cool2}', choices: commandChoices('energy1', 'draw1', 'cool2') },
  // Vorthane: the Tide-Regent, and the Admiralty, the deep fleet's council of elders, twice as much of each.
  { id: 'tide_regent', name: 'Tide-Regent Osshara', kind: 'command', race: 2, text: '{dawn}, one of: {options:energy1|draw1|shield3}', choices: commandChoices('energy1', 'draw1', 'shield3') },
  { id: 'the_admiralty', name: 'The Admiralty', kind: 'command', race: 2, text: '{dawn}, one of: {options:energy2|draw2|shield4}', choices: commandChoices('energy2', 'draw2', 'shield4') },
  // Ixquor (Hive-Speaker Zyth is in the second set)
  { id: 'chamber_protocol', name: "Broodmother Ul'Kha", kind: 'command', race: 3, text: '{dawn}, one of: {options:energy1|draw1|renew1}', choices: commandChoices('energy1', 'draw1', 'renew1') },

  // ---- Keeping your Command cards in play ----
  {
    id: 'standing_orders',
    name: 'Standing Orders',
    kind: 'growth',
    text: 'Draw 1. {dawn}: with a Hero, draw 1.',
    onPlay: [{ type: 'draw', amount: 1 }],
    onTurn: [{ type: 'draw', amount: 1, if: { minKind: 'command', n: 1 } }],
  },
  {
    id: 'chain_of_command',
    name: 'Chain of Command',
    kind: 'defence',
    text: '{dusk}: {cool:1}. {cool:+1} with a Hero.',
    onDusk: [{ type: 'cool', amount: 1 }, { type: 'cool', amount: 1, if: { minKind: 'command', n: 1 } }],
  },

  // ---- Resonance: cards that power up their neighbours ----
  {
    id: 'resonance_lattice',
    name: 'Resonance Lattice',
    kind: 'growth',
    text: "{resonance:1}.",
    passive: [{ type: 'adjacent', amounts: [1] }],
  },
  {
    id: 'harmonic_singularity',
    name: 'Harmonic Singularity',
    kind: 'growth',
    text: "{resonance:3/2}.",
    passive: [{ type: 'adjacent', amounts: [3, 2] }],
  },

  // ---- Defence: where your cards sit, and what guards them ----
  {
    id: 'bulwark_plating',
    name: 'Bulwark Plating',
    kind: 'defence',
    text: '{bulwark:1}. {dawn}: {shield:1}, {repair:1}.',
    onTurn: [{ type: 'shield', amount: 1 }, { type: 'repair', amount: 1 }],
    passive: [{ type: 'guard', amounts: [1] }],
  },
  {
    id: 'aegis_monolith',
    name: 'Aegis Monolith',
    kind: 'defence',
    text: "{guard}. {sturdy:2}. {bulwark:2/2}. {dawn}: {repair:2}.",
    defence: 2,
    stability: 4,
    onTurn: [{ type: 'repair', amount: 2 }],
    passive: [{ type: 'taunt' }, { type: 'guard', amounts: [2, 2] }],
  },

  // ---- Stability: keeping your cards in play, and sweeping theirs away ----
  { id: 'chrono_anchor', name: 'Chrono Anchor', kind: 'growth', text: "{anchor}.", passive: [{ type: 'anchor' }] },
  {
    id: 'stasis_field',
    name: 'Stasis Field',
    kind: 'growth',
    text: '{restore:2}. {cool:1}.',
    onPlay: [{ type: 'restore', amount: 2 }, { type: 'cool', amount: 1 }],
  },
  {
    id: 'entropy_pulse',
    name: 'Entropy Pulse',
    kind: 'attack',
    text: '{erode:2}. {heat:1}.',
    onPlay: [{ type: 'erode', amount: 2 }, { type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'decay_wave',
    name: 'Decay Wave',
    kind: 'attack',
    text: '{decay:1}. {heat:2}.',
    onPlay: [{ type: 'erode', amount: 1, all: true }, { type: 'heat', amount: 2, to: 'target' }],
  },

  // ---- Recovery and recall: getting cards back to use again ----
  { id: 'salvage_drone', name: 'Salvage Drone', kind: 'growth', text: '{recover}. {cool:1}.', onPlay: [{ type: 'recover', orDraw: 1 }, { type: 'cool', amount: 1 }] },
  {
    id: 'phase_shift',
    name: 'Phase Shift',
    kind: 'growth',
    text: '{recall}. {energy:1}.',
    onPlay: [{ type: 'recall' }, { type: 'plays', amount: 1 }],
  },

  // ---- Shift: moving cards between slots (yours, or with Displace your rival's) ----
  { id: 'gravity_tether', name: 'Gravity Tether', kind: 'defence', text: '{shift}. {shield:2}.', onPlay: [{ type: 'shift' }, { type: 'shield', amount: 2 }] },
  { id: 'orbital_tug', name: 'Orbital Tug', kind: 'attack', text: '{displace}. {heat:3}.', onPlay: [{ type: 'shift', enemy: true }, { type: 'heat', amount: 3, to: 'target' }] },

  // ---- Removal: aimed at your rival's tableau ----
  {
    id: 'tractor_beam',
    name: 'Tractor Beam',
    kind: 'attack',
    text: '{eject:3}. {heat:1}.',
    onPlay: [{ type: 'bounce', maxDefence: 3 }, { type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'command_breaker',
    name: 'Command Breaker',
    kind: 'attack',
    text: '{heat:2}. {destroy:3}: Heroes only.',
    onPlay: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'destroy', kind: 'command', maxDefence: 3 }],
  },
  {
    id: 'event_horizon',
    name: 'Event Horizon',
    kind: 'attack',
    text: "{destroy:any}. Its neighbours return to their owner's hand. {heat:2}.",
    onPlay: [{ type: 'destroy', neighbours: true }, { type: 'heat', amount: 2, to: 'target' }],
  },

  // ---- Lightspeed: set face down (one at a time); springs during an enemy's day ----
  {
    id: 'null_field',
    name: 'Null Field',
    kind: 'lightspeed',
    text: "{lightspeed}. When an enemy plays an attack card, cancel it.",
    lightspeed: { trigger: { on: 'enemyPlays', kind: 'attack' }, counter: true },
  },
  {
    id: 'signal_jammer',
    name: 'Signal Jammer',
    kind: 'lightspeed',
    text: '{lightspeed}. When an enemy plays a support card, cancel it. Draw 1.',
    lightspeed: { trigger: { on: 'enemyPlays', kind: 'growth' }, counter: true, effects: [{ type: 'draw', amount: 1 }] },
  },
  {
    id: 'frost_snare',
    name: 'Frost Snare',
    kind: 'lightspeed',
    text: '{lightspeed}. When an enemy plays a defence card, cancel it and {heat:1} to them.',
    lightspeed: { trigger: { on: 'enemyPlays', kind: 'defence' }, counter: true, effects: [{ type: 'heat', amount: 1, to: 'target' }] },
  },
  {
    id: 'solar_mirror',
    name: 'Solar Mirror',
    kind: 'lightspeed',
    text: "{lightspeed}. When an enemy's card is about to heat your sun, first {shield:3} and {heat:1} to them.",
    lightspeed: { trigger: { on: 'heated' }, effects: [{ type: 'shield', amount: 3 }, { type: 'heat', amount: 1, to: 'target' }] },
  },
  {
    id: 'decoy_array',
    name: 'Decoy Array',
    kind: 'lightspeed',
    text: '{lightspeed}. When an enemy is about to destroy or return one of your cards, cancel it. Draw 1.',
    lightspeed: { trigger: { on: 'targeted' }, counter: true, effects: [{ type: 'draw', amount: 1 }] },
  },
  {
    id: 'temporal_snare',
    name: 'Temporal Snare',
    kind: 'lightspeed',
    text: "{lightspeed}. When an enemy plays a card, cancel it. They may play no more cards today. Draw 1.",
    lightspeed: { trigger: { on: 'enemyPlays' }, counter: true, effects: [{ type: 'halt' }, { type: 'draw', amount: 1 }] },
  },

  // ---- Aureline: lancers. Many attack cards, each making the others hit harder ----
  {
    id: 'helio_lancer',
    name: 'Helio Lancer',
    kind: 'attack',
    race: 0,
    text: '{dawn}: {heat:2}.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target' }],
  },
  { id: 'focusing_array', name: 'Focusing Array', kind: 'attack', race: 0, text: '{forge:2}.', passive: [{ type: 'adjacent', amounts: [2], kind: 'attack' }] },
  {
    id: 'coronal_chorus',
    name: 'Coronal Chorus',
    kind: 'attack',
    race: 0,
    text: '{heat:1} per attack card you control (up to 5).',
    onPlay: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'kind', kind: 'attack' }, max: 5 }],
  },
  { id: 'sunspear', name: 'Sunspear', kind: 'attack', race: 0, text: '{heat:6}, {pierce}. {heat:1} to your sun.', onPlay: [{ type: 'heat', amount: 6, to: 'target', pierce: true }, { type: 'selfHeat', amount: 1 }] },
  {
    id: 'dawn_beacon',
    name: 'Dawn Beacon',
    kind: 'growth',
    race: 0,
    text: 'Draw 1. {dawn}: with 2+ attack cards, draw 1.',
    onPlay: [{ type: 'draw', amount: 1 }],
    onTurn: [{ type: 'draw', amount: 1, if: { minKind: 'attack', n: 2 } }],
  },
  {
    id: 'halo_ward',
    name: 'Halo Ward',
    kind: 'defence',
    race: 0,
    text: '{dawn}: {shield:1}. {shield:+1} per 2 attack cards.',
    onTurn: [{ type: 'shield', amount: 1, plus: { of: 'kind', kind: 'attack', per: 2 } }],
  },

  // ---- Xel'Naru: overload. Run your own sun hot, and profit from it ----
  {
    id: 'shard_reactor',
    name: 'Shard Reactor',
    kind: 'attack',
    race: 1,
    text: '{sturdy:2}. {dawn}: {heat:1}, {pierce}.',
    defence: 2,
    onTurn: [{ type: 'heat', amount: 1, to: 'target', pierce: true }],
  },
  {
    id: 'crystal_storm',
    name: 'Crystal Storm',
    kind: 'attack',
    race: 1,
    text: '{heat:3}. {heat:+1} while {overheated}.',
    onPlay: [{ type: 'heat', amount: 3, to: 'target' }, { type: 'heat', amount: 1, to: 'target', if: { overheated: true } }],
  },
  {
    id: 'overload_core',
    name: 'Overload Core',
    kind: 'attack',
    race: 1,
    text: '{dawn}: {heat:1}. {heat:+2} while {overheated}.',
    onTurn: [
      { type: 'heat', amount: 1, to: 'target' },
      { type: 'heat', amount: 2, to: 'target', if: { overheated: true } },
    ],
  },
  { id: 'martyr_crystal', name: 'Martyr Crystal', kind: 'attack', race: 1, text: '{heat:1}. When this leaves your tableau, {heat:4}, {pierce}.', onPlay: [{ type: 'heat', amount: 1, to: 'target' }], onLeave: [{ type: 'heat', amount: 4, to: 'target', pierce: true }] },
  {
    id: 'prism_vent',
    name: 'Prism Vent',
    kind: 'defence',
    race: 1,
    text: '{cool:3}. {dusk}: {cool:1}.',
    onPlay: [{ type: 'cool', amount: 3 }],
    onDusk: [{ type: 'cool', amount: 1 }],
  },
  { id: 'fracture_lens', name: 'Fracture Lens', kind: 'growth', race: 1, text: 'Draw 3. {heat:2} to your sun.', onPlay: [{ type: 'draw', amount: 3 }, { type: 'selfHeat', amount: 2 }] },

  // ---- Vorthane: tides. Build shields, keep them, and sting whoever hits them ----
  { id: 'bell_warden', name: 'Bell Warden', kind: 'defence', race: 2, text: '{guard}. {sturdy:1}. {tidewall}. {dawn}: {shield:3}.', defence: 1, onTurn: [{ type: 'shield', amount: 3 }], passive: [{ type: 'taunt' }, { type: 'tidewall' }] },
  { id: 'stinging_veil', name: 'Stinging Veil', kind: 'defence', race: 2, text: "{guard}. {sting:3}.", passive: [{ type: 'taunt' }, { type: 'retaliate', amount: 3 }] },
  {
    id: 'tidal_bloom',
    name: 'Tidal Bloom',
    kind: 'defence',
    race: 2,
    text: '{dusk}: {cool:1}. {cool:+1} with 3+ defence cards.',
    onDusk: [{ type: 'cool', amount: 1 }, { type: 'cool', amount: 1, if: { minKind: 'defence', n: 3 } }],
  },
  {
    id: 'abyssal_choir',
    name: 'Abyssal Choir',
    kind: 'attack',
    race: 2,
    text: '{dawn}: {heat:2}. {heat:+1} per 2 shields you have (up to 5).',
    onTurn: [{ type: 'heat', amount: 2, to: 'target', plus: { of: 'shields', per: 2 }, max: 5 }],
  },
  {
    id: 'deep_current',
    name: 'Deep Current',
    kind: 'defence',
    race: 2,
    text: `{shield:2}. {hold:${BALANCE.maxKeptShields}}.`,
    onPlay: [{ type: 'shield', amount: 2 }],
    passive: [{ type: 'keepShields' }],
  },
  { id: 'lure_jelly', name: 'Lure Jelly', kind: 'growth', race: 2, text: '{cool:2}. Draw 1.', onPlay: [{ type: 'cool', amount: 2 }, { type: 'draw', amount: 1 }] },

  // ---- Ixquor: the hive. Grow, go wide, and play more each day ----
  {
    id: 'mycelium_tower',
    name: 'Mycelium Tower',
    kind: 'growth',
    race: 3,
    stability: 4,
    text: '{dawn}: {grows:4}, then {heat} equal to its growth.',
    onTurn: [{ type: 'grow', max: 4 }, { type: 'heat', amount: 0, to: 'target', plus: { of: 'growth' } }],
  },
  { id: 'hive_relay', name: 'Hive Relay', kind: 'growth', race: 3, text: "{plays:1}.", passive: [{ type: 'extraPlay', amount: 1 }] },
  { id: 'sporecaster', name: 'Sporecaster', kind: 'growth', race: 3, text: '{abundance:1}.', onTurn: [{ type: 'draw', amount: 1 }] },
  {
    id: 'rot_bloom',
    name: 'Rot Bloom',
    kind: 'attack',
    race: 3,
    text: '{heat:2}. {heat:+1} per 2 cards you control (up to 5).',
    onPlay: [{ type: 'heat', amount: 2, to: 'target', plus: { of: 'cards', per: 2 }, max: 5 }],
  },
  {
    id: 'canopy',
    name: 'Canopy',
    kind: 'defence',
    race: 3,
    text: '{dusk}: {cool:1}. {cool:+1} per 3 cards you control.',
    onDusk: [{ type: 'cool', amount: 1, plus: { of: 'cards', per: 3 } }],
  },
  {
    id: 'spore_cloud',
    name: 'Spore Cloud',
    kind: 'attack',
    race: 3,
    text: '{dawn}: {heat:1}. {heat:+2} with 4+ cards.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'heat', amount: 2, to: 'target', if: { minCards: 4 } }],
  },

  // ---- Race cards for resonance, recovery, stability, command synergies and lightspeed ----
  {
    id: 'shard_renewal',
    name: 'Shard Renewal',
    kind: 'growth',
    race: 1,
    text: '{restore:3}. {heat:2} to your sun.',
    onPlay: [{ type: 'restore', amount: 3 }, { type: 'selfHeat', amount: 2 }],
  },
  {
    id: 'undertow',
    name: 'Undertow',
    kind: 'attack',
    race: 2,
    text: '{erode:2}. {shield:2}.',
    onPlay: [{ type: 'erode', amount: 2 }, { type: 'shield', amount: 2 }],
  },
  {
    id: 'hive_rooting',
    name: 'Hive Rooting',
    kind: 'growth',
    race: 3,
    text: '{renew:1}. Draw 1.',
    onPlay: [{ type: 'restore', amount: 1, all: true }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'aureline_war_herald',
    name: 'Aureline War-Herald',
    kind: 'attack',
    race: 0,
    text: '{dawn}: {heat:1}. With a Hero, {heat:+1} and {shield:1}.',
    onTurn: [
      { type: 'heat', amount: 1, to: 'target' },
      { type: 'heat', amount: 1, to: 'target', if: { minKind: 'command', n: 1 } },
      { type: 'shield', amount: 1, if: { minKind: 'command', n: 1 } },
    ],
  },
  {
    id: 'sunforge',
    name: 'Sunforge',
    kind: 'attack',
    race: 0,
    text: '{forge:1}. {dawn}: {heat:1}.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }],
    passive: [{ type: 'adjacent', amounts: [1], kind: 'attack' }],
  },
  {
    id: 'ember_shard',
    name: 'Ember Shard',
    kind: 'attack',
    race: 1,
    text: '{heat:2}. When you {recover} this, {heat:1}.',
    onPlay: [{ type: 'heat', amount: 2, to: 'target' }],
    onRecover: [{ type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'xelnaru_reliquarist',
    name: "Xel'Naru Reliquarist",
    kind: 'growth',
    race: 1,
    text: '{recover:attack}. Draw 1.',
    onPlay: [{ type: 'recover', kind: 'attack', orDraw: 1 }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'prism_conduit',
    name: 'Prism Conduit',
    kind: 'defence',
    race: 1,
    text: '{dusk}: {cool:1}. {cool:+1} per attack card next to this.',
    onDusk: [{ type: 'cool', amount: 1, plus: { of: 'adjacent', kind: 'attack' } }],
  },
  {
    id: 'tide_pylon',
    name: 'Tide Pylon',
    kind: 'defence',
    race: 2,
    text: '{dawn}: {shield:2}, {repair:1}. {shield:+1} per defence card next to this.',
    onTurn: [{ type: 'shield', amount: 2, plus: { of: 'adjacent', kind: 'defence' } }, { type: 'repair', amount: 1 }],
  },
  {
    id: 'riptide_ambush',
    name: 'Riptide Ambushers',
    kind: 'lightspeed',
    race: 2,
    text: "{lightspeed}. When an enemy's card would heat your sun by 3 or more, cancel that and {heat:2} to them.",
    lightspeed: { trigger: { on: 'heated', min: 3 }, counter: true, effects: [{ type: 'heat', amount: 2, to: 'target' }] },
  },
  {
    id: 'regrowth_pod',
    name: 'Regrowth Pod',
    kind: 'growth',
    race: 3,
    text: '{recover:support}. {cool:1}.',
    onPlay: [{ type: 'recover', kind: 'growth', orDraw: 1 }, { type: 'cool', amount: 1 }],
  },
  {
    id: 'spore_husk',
    name: 'Spore Husk',
    kind: 'growth',
    race: 3,
    text: '{dusk}: {cool:1}. When you {recover} this, draw 2.',
    onDusk: [{ type: 'cool', amount: 1 }],
    onRecover: [{ type: 'draw', amount: 2 }],
  },

  // ---- New characters: a Stellar hero and an Anomaly for each race ----
  {
    id: 'aureline_sun_priest',
    name: 'Aureline Sun-Priest',
    kind: 'defence',
    race: 0,
    text: '{dusk}: {cool:1}. {cool:+1} with 2+ attack cards.',
    onDusk: [{ type: 'cool', amount: 1, plus: { of: 'kind', kind: 'attack', per: 2 }, max: 2 }],
  },
  {
    id: 'aurelia_first_light',
    name: 'Aurelia, the First Light',
    kind: 'attack',
    race: 0,
    text: '{dawn}: {heat:1}. {heat:+1} per attack card you control (up to 5).',
    onTurn: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'kind', kind: 'attack' }, max: 5 }],
  },
  {
    id: 'xelnaru_champion',
    name: "Xel'Naru Champion",
    kind: 'attack',
    race: 1,
    text: '{heat:1}. {dawn}: while {overheated}, {heat:2}.',
    onPlay: [{ type: 'heat', amount: 1, to: 'target' }],
    onTurn: [{ type: 'heat', amount: 2, to: 'target', if: { overheated: true } }],
  },
  {
    id: 'kyrvessa_prism_queen',
    name: "Kyr'Vessa, Prism Queen",
    kind: 'attack',
    race: 1,
    text: '{heat:2}. When another of your cards leaves your tableau, {heat:3}.',
    onPlay: [{ type: 'heat', amount: 2, to: 'target' }],
    passive: [{ type: 'allyLeaves', effects: [{ type: 'heat', amount: 3, to: 'target' }] }],
  },
  {
    id: 'hero_of_rathune',
    name: 'Hero of Rathune',
    kind: 'defence',
    race: 2,
    text: '{guard}. {sturdy:1}. {shield:3}. {dawn}: {repair:1}, {shield:1} per 2 defence cards (up to 2).',
    defence: 1,
    onPlay: [{ type: 'shield', amount: 3 }],
    onTurn: [{ type: 'repair', amount: 1 }, { type: 'shield', amount: 0, plus: { of: 'kind', kind: 'defence', per: 2 }, max: 2 }], passive: [{ type: 'taunt' }] },
  {
    id: 'ommarath_deep_bell',
    name: 'Ommarath, the Deep Bell',
    kind: 'defence',
    race: 2,
    text: '{dawn}: {shield:3}. {soothe:1}.',
    onTurn: [{ type: 'shield', amount: 3 }],
    passive: [{ type: 'absorbCool', amount: 1 }],
  },
  {
    id: 'ixquor_brood_tender',
    name: 'Ixquor Brood-Tender',
    kind: 'growth',
    race: 3,
    text: 'Draw 1. {dawn}: your other growing cards grow by 1.',
    onPlay: [{ type: 'draw', amount: 1 }],
    onTurn: [{ type: 'growOthers' }],
  },
  {
    id: 'the_brood_queen',
    name: 'The Brood Queen',
    kind: 'growth',
    race: 3,
    text: '{plays:1}. {dawn}: {heat:2}. {heat:+2} with 4+ cards.',
    passive: [{ type: 'extraPlay', amount: 1 }],
    onTurn: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'heat', amount: 2, to: 'target', if: { minCards: 4 } }],
  },
  // ---- Orbit: cards that move the planets round a sun (dead → abundant → industrial, three turns each) ----
  { id: 'gravity_assist', name: 'Gravity Assist', kind: 'attack', text: '{heat:2}. Your {orbit:+1}.', onPlay: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'orbit', amount: 1, who: 'self' }] },
  { id: 'orbital_slingshot', name: 'Orbital Slingshot', kind: 'growth', text: 'Your {orbit:+3}: the next planet swings round. Draw 1.', onPlay: [{ type: 'orbit', amount: 3, who: 'self' }, { type: 'draw', amount: 1 }] },
  { id: 'tidal_brake', name: 'Tidal Brake', kind: 'defence', text: "{shield:2}. Your rival's {orbit:−2}.", onPlay: [{ type: 'shield', amount: 2 }, { type: 'orbit', amount: -2, who: 'rival' }] },
  {
    id: 'dead_world_mine',
    name: 'Dead World Mine',
    kind: 'growth',
    text: '{dawn}: while facing the dead planet, draw 1. {dusk}: {cool:1}.',
    onTurn: [{ type: 'draw', amount: 1, if: { planet: 'dead' } }], onDusk: [{ type: 'cool', amount: 1 }],
  },
  {
    id: 'perihelion_forge',
    name: 'Perihelion Forge',
    kind: 'attack',
    text: '{dawn}: {heat:1}. {heat:+2} while facing the industrial planet.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'planet', planet: 'industrial', amount: 2 } }],
  },
  {
    id: 'sunward_lance',
    name: 'Sunward Lance',
    kind: 'attack',
    race: 0,
    text: '{heat:1}. {heat:+2} while facing the industrial planet. Your {orbit:+1}.',
    onPlay: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'planet', planet: 'industrial', amount: 2 } }, { type: 'orbit', amount: 1, who: 'self' }],
  },
  {
    id: 'comet_shard',
    name: 'Comet Shard',
    kind: 'attack',
    race: 1,
    text: "{heat:3}. Your rival's {orbit:−1}. {heat:1} to your sun.",
    onPlay: [{ type: 'heat', amount: 3, to: 'target' }, { type: 'orbit', amount: -1, who: 'rival' }, { type: 'selfHeat', amount: 1 }],
  },
  {
    id: 'tide_lock',
    name: 'Tide Lock',
    kind: 'defence',
    race: 2,
    text: '{dawn}: {shield:1}. {shield:+2} while facing the abundant planet.',
    onTurn: [{ type: 'shield', amount: 1, plus: { of: 'planet', planet: 'abundant', amount: 2 } }],
  },
  {
    id: 'orbit_root',
    name: 'Orbit Root',
    kind: 'growth',
    race: 3,
    text: '{dawn}: {shield:1}. While facing the dead planet, your {orbit:+2}.',
    onTurn: [{ type: 'shield', amount: 1 }, { type: 'orbit', amount: 2, who: 'self', if: { planet: 'dead' } }],
  },

  // ---- More recovery and recall: every race can get its cards back ----
  {
    id: 'recall_beacon',
    name: 'Recall Beacon',
    kind: 'growth',
    text: '{recall}. Draw 1.',
    onPlay: [{ type: 'recall' }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'sunlit_return',
    name: 'Sunlit Return',
    kind: 'defence',
    race: 0,
    text: '{cool:1}. {recover:attack}.',
    onPlay: [{ type: 'cool', amount: 1 }, { type: 'recover', kind: 'attack', orDraw: 1 }],
  },
  {
    id: 'shard_recall',
    name: 'Shard Recall',
    kind: 'growth',
    race: 1,
    text: '{recall}. {heat:1}.',
    onPlay: [{ type: 'recall' }, { type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'returning_tide',
    name: 'Returning Tide',
    kind: 'defence',
    race: 2,
    text: '{shield:2}. {recover:defence}.',
    onPlay: [{ type: 'shield', amount: 2 }, { type: 'recover', kind: 'defence', orDraw: 1 }],
  },
  {
    id: 'compost_cycle',
    name: 'Compost Cycle',
    kind: 'growth',
    race: 3,
    text: "{recover}. {renew:1}.",
    onPlay: [{ type: 'recover', orDraw: 1 }, { type: 'restore', amount: 1, all: true }],
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
  perihelion_forge: { rarity: 'stellar' },
  orbit_root: { rarity: 'stellar' },
  solar_storm: { rarity: 'stellar' },
  ice_age: { rarity: 'stellar' },
  solar_maximum: { rarity: 'stellar' },
  // The heroes who lead each race (Command cards).
  command_directive: { character: true },
  ignition_protocol: { character: true, rarity: 'stellar' },
  coolant_protocol: { character: true, rarity: 'stellar' },
  tide_regent: { character: true },
  the_admiralty: { character: true, rarity: 'anomaly' },
  chamber_protocol: { character: true, rarity: 'stellar' },
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
// The second set joins the pool (for building decks; the starters use only the first).
CARDS.push(...EXPANSION, ...FUSION_CARDS, ...ATTUNE_CARDS, ...RACE_CARDS, ...DUSK_CARDS, ...BIG_CARDS, ...RELIC_CARDS);
// The Heroes as they now fight (heroes-battle.ts): lasting, with abilities to choose from each day, in
// place of the old choice of dawn effect.
for (const c of CARDS) {
  const h = HERO_CARDS[c.id];
  if (!h) continue;
  delete c.choices;
  delete c.onPlay;
  delete c.onTurn;
  delete c.passive;
  Object.assign(c, h);
}
for (const c of CARDS) Object.assign(c, CARD_META[c.id] ?? EXPANSION_META[c.id] ?? {}, { cost: CARD_COSTS[c.id] ?? FUSION_COSTS[c.id] ?? ATTUNE_COSTS[c.id] ?? c.cost ?? 1 });
// Heroes cost one more than they are listed at (heroes-battle.ts): an entrance and an ability every day for good.
for (const c of CARDS) if (c.kind === 'command') c.cost = heroCost(c.cost ?? 2);
// Attack ratings (attack.ts): by rule, unless a card gives its own.
for (const c of CARDS) if (c.attack === undefined) c.attack = ruleAttack(c, c.cost ?? 1, !isBurst(c));
// A race's Sturdy (the Korrath) is the cards' own: added to their Sturdy, and written into their text.
// Its Sting (the Vorthane) is written into theirs too (it still strikes back as the race's, in counterDamage).
const raiseKeyword = (text: string, kw: string, n: number) =>
  new RegExp(`\\{${kw}:\\d+\\}`).test(text) ? text.replace(new RegExp(`\\{${kw}:(\\d+)\\}`), (_, k: string) => `{${kw}:${Number(k) + n}}`) : `{${kw}:${n}}. ${text}`;
// Erode and Decay take a card's days, not its health (heat does that now): one more day than they were listed with.
const ERODE_EXTRA = 1;
for (const c of CARDS) {
  const lists = [c.onPlay, c.onTurn, c.onDusk, c.onLeave, c.lightspeed?.effects, ...(c.abilities ?? []).map((k) => k.effects)];
  let hit = false;
  for (const e of lists.flat()) if (e?.type === 'erode') (e.amount += ERODE_EXTRA), (hit = true);
  if (hit) c.text = c.text.replace(/\{(erode|decay):(\d+)\}/g, (_, k: string, n: string) => `{${k}:${Number(n) + ERODE_EXTRA}}`);
}
// (The text before a race's keywords are written in: the card's text in Core, which has no race traits.)
const TRAITLESS_TEXT = new Map(CARDS.map((c) => [c.id, c.text]));
for (const c of CARDS) {
  const t = raceTrait(c.race);
  if (!t || c.fusion || c.kind === 'lightspeed' || c.kind === 'relic' || isBurst(c)) continue;
  if (t.sturdy) {
    c.defence = (c.defence ?? 0) + t.sturdy;
    c.text = raiseKeyword(c.text, 'sturdy', t.sturdy);
  }
  if (t.sting) c.text = raiseKeyword(c.text, 'sting', t.sting);
}

/**
 * A card that does nothing once it has been played (no dawn effects, passives, attack or anything for when it
 * leaves): it resolves and goes straight to the discard pile, taking no slot.
 */
/** Whether a card has Darkspeed (its race's trait: the Nyxari): it can act the day it comes into play. Cards that never stand in play don't. */
/** Darkspeed (the Nyxari): only cards that can act have it, those that attack and Heroes (abilities). */
export function hasDarkspeed(def: CardDef): boolean {
  return !!raceTrait(def.race)?.ambush && def.kind !== 'lightspeed' && !isBurst(def) && ((def.attack ?? 0) > 0 || def.kind === 'command');
}

export function isBurst(def: CardDef): boolean {
  if (def.kind === 'command' || def.kind === 'lightspeed' || def.kind === 'relic' || def.stability !== undefined) return false;
  return !def.onTurn?.length && !def.onDusk?.length && !def.passive?.length && !def.choices?.length && !def.attune && !def.onLeave?.length && !(def.attack ?? 0);
}

/** Display names for the rarities. */
export const RARITY_NAME: Record<Rarity, string> = { dwarf: 'White Dwarf', stellar: 'Stellar', anomaly: 'Anomaly' };

export function rarityOf(defId: string): Rarity {
  return cardDef(defId).rarity ?? 'dwarf';
}

/** Copies of a card a deck may hold: one for an Anomaly, otherwise the usual limit. */
export function copyLimit(defId: string): number {
  return rarityOf(defId) === 'anomaly' ? BALANCE.maxAnomalyCopies : BALANCE.maxCopies;
}

for (const t of TOKENS) Object.assign(t, { cost: 0 });
// (Tokens are cards in play, but not in the pool: no deck, shop or collection has them.)
const BY_ID = new Map([...CARDS, ...TOKENS, ...BOONS].map((c) => [c.id, c]));

/** Each core race's card as it plays in Core: without its race's keywords, and in its core version if it has one. */
const CORE_BY_ID = new Map(
  CARDS.filter((c) => c.race !== undefined && c.race < 4).map((c) => {
    const v = CORE_VERSIONS[c.id];
    const core: CardDef = { ...c, text: TRAITLESS_TEXT.get(c.id) ?? c.text, ...v };
    if (v && c.fusion) core.attack = ruleAttack(core, core.cost ?? 1, !isBurst(core));
    return [c.id, core];
  }),
);

/**
 * Dawn heat as attack: each card's plain dawn heat at the rival (no condition) becomes that much more
 * attack, to strike a card or the sun by choice each day (Guards intercepting it), rather than heating the sun
 * by itself. What scales (per card, per shield...) stays a dawn effect, as do conditional bonuses.
 */
export function dawnHeatAsAttack() {
  const cores = new Set(CORE_BY_ID.values());
  for (const c of [...CARDS, ...CORE_BY_ID.values()]) {
    if (!c.onTurn?.length || c.kind === 'command' || c.fusion) continue;
    let gained = 0;
    c.onTurn = c.onTurn.flatMap((e) => {
      if (e.type !== 'heat' || e.to !== 'target' || e.if || e.pierce || e.amount <= 0) return [e];
      gained += e.amount;
      return e.plus ? [{ ...e, amount: 0 }] : [];
    });
    if (!gained) continue;
    c.attack = (c.attack ?? 0) + gained + (DAWN_ATTACK_EXTRA[c.id] ?? 0) + (cores.has(c) ? DAWN_ATTACK_CORE_EXTRA[c.id] ?? 0 : 0);
    // (Its attack is as steady as its dawn heat was, a day a day: it keeps the shorter term straight heat had.)
    c.stability ??= BALANCE.stabilityDawnHeat;
    const text = (cores.has(c) ? DAWN_ATTACK_CORE_TEXT[c.id] : undefined) ?? DAWN_ATTACK_TEXT[c.id];
    if (text !== undefined) c.text = text;
  }
}
dawnHeatAsAttack();

/** A card as it plays in a mode (whatever the rules in force). */
export function cardIn(defId: string, mode: GameMode): CardDef {
  return (mode === 'core' && CORE_BY_ID.get(defId)) || lostDef(defId);
}

/** A card as it plays under the rules in force. */
export function cardDef(defId: string): CardDef {
  return cardIn(defId, rulesMode());
}

function lostDef(defId: string): CardDef {
  const def = BY_ID.get(defId) ?? fusedDef(defId);
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return def;
}

// ---------------------------------------------------------------------------
// Fusion (campaign armory): two cards merged into one that does both. A fused
// card's id names its parts ("fuse:a+b"), so it needs no storage of its own.
// ---------------------------------------------------------------------------

const FUSE = 'fuse:';
const RARITY_RANK: Record<Rarity, number> = { dwarf: 0, stellar: 1, anomaly: 2 };

export function fusedId(a: string, b: string): string {
  return `${FUSE}${a}+${b}`;
}

export function isFused(defId: string): boolean {
  return defId.startsWith(FUSE);
}

/** The choices a card asks for as it is played (a fused card can only ask for each once). */
function choiceKinds(def: CardDef): Set<string> {
  const kinds = new Set<string>();
  for (const e of def.onPlay ?? []) {
    if (e.type === 'destroy' || e.type === 'bounce' || (e.type === 'erode' && !e.all) || (e.type === 'shift' && e.enemy)) kinds.add('enemy');
    if (e.type === 'recall' || e.type === 'empower' || (e.type === 'restore' && !e.all && !e.self) || (e.type === 'shift' && !e.enemy)) kinds.add('ally');
    if (e.type === 'recover') kinds.add('recover');
  }
  return kinds;
}

/** Why a card cannot be fused at all (null if it can). */
export function unfusable(id: string): string | null {
  const d = BY_ID.get(id);
  if (!d) return 'A fused card cannot be fused again.';
  if (d.kind === 'command') return 'Heroes cannot be fused (a deck needs exactly two).';
  if (d.kind === 'global') return 'Global cards cannot be fused.';
  if (d.kind === 'lightspeed') return 'Lightspeed cards cannot be fused.';
  if (d.kind === 'relic') return 'Relics cannot be fused.';
  return null;
}

/** Why two cards cannot be fused (null if they can). */
export function fusionProblem(a: string, b: string): string | null {
  const whole = unfusable(a) ?? unfusable(b);
  if (whole) return whole;
  const [da, db] = [BY_ID.get(a)!, BY_ID.get(b)!];
  const ka = choiceKinds(da);
  if ([...choiceKinds(db)].some((k) => ka.has(k))) return 'Both cards ask for the same kind of choice when played.';
  if (da.spendAll || db.spendAll) return 'Cards that spend all your energy cannot be fused.';
  // A fused card costs both its parts: it must be one a day's energy can pay for.
  if ((da.cost ?? 1) + (db.cost ?? 1) > BALANCE.maxPlays) return `Together they would cost ${(da.cost ?? 1) + (db.cost ?? 1)} energy: more than a day ever gives (${BALANCE.maxPlays}).`;
  return null;
}

/** A fused card's name: the first word of one and the last of the other ("Plasma" + "Cryo Vault" → "Plasma Vault"). */
function fusedName(a: CardDef, b: CardDef): string {
  const first = a.name.split(' ')[0];
  const last = b.name.split(' ').slice(-1)[0];
  const name = `${first} ${last}`;
  return name === a.name || name === b.name || first === last ? `Fused ${a.name}` : name;
}

/** A sentence that is one plain amount ("Draw 1.", "{heat:2}.", "{dawn}: {shield:1}."): its timing and keyword, and the amount. */
const SUMMABLE = /^((?:\{(?:dawn|dusk)\}: )?)(?:\{(heat|cool|shield|sturdy|repair|renew|plant|grows):(\d+)\}|Draw (\d+))\.$/;
const sentences = (text: string) => text.trim().split(/(?<=\.)\s+/).filter(Boolean);

/**
 * Text added to a card's (a fused card's other half, or a Fusion card on it), with like abilities summed: "Draw 1"
 * and "Draw 1" read "Draw 2", a dawn's {heat:1} and another's {heat:2} read {heat:3}. `text` is the card's with the
 * sums folded in; `rest`, what was added that had nothing to fold into.
 */
export function mergeCardText(text: string, added: string): { text: string; rest: string } {
  const own = sentences(text);
  const rest: string[] = [];
  for (const line of sentences(added)) {
    const m = SUMMABLE.exec(line);
    const at = m ? own.findIndex((o) => { const n = SUMMABLE.exec(o); return !!n && n[1] === m[1] && (n[2] ?? 'draw') === (m[2] ?? 'draw'); }) : -1;
    if (!m || at < 0) {
      rest.push(line);
      continue;
    }
    const n = SUMMABLE.exec(own[at])!;
    const sum = Number(n[3] ?? n[4]) + Number(m[3] ?? m[4]);
    own[at] = m[2] ? `${n[1]}{${m[2]}:${sum}}.` : `${n[1]}Draw ${sum}.`;
  }
  return { text: own.join(' '), rest: rest.join(' ') };
}

const FUSED = new Map<string, CardDef>();

function fusedDef(id: string): CardDef | undefined {
  if (!isFused(id)) return undefined;
  const cached = FUSED.get(id);
  if (cached) return cached;
  const [a, b] = id.slice(FUSE.length).split('+');
  const [da, db] = [BY_ID.get(a), BY_ID.get(b)];
  if (!da || !db) return undefined;
  const both = <T>(x?: T[], y?: T[]) => (x || y ? [...(x ?? []), ...(y ?? [])] : undefined);
  const def: CardDef = {
    id,
    name: fusedName(da, db),
    kind: da.kind,
    // Both effects for the price of both cards (in one card, and one slot).
    cost: (da.cost ?? 1) + (db.cost ?? 1),
    race: da.race === db.race ? da.race : undefined,
    rarity: RARITY_RANK[db.rarity ?? 'dwarf'] > RARITY_RANK[da.rarity ?? 'dwarf'] ? db.rarity : da.rarity,
    text: (({ text, rest }) => (rest ? `${text} ${rest}` : text))(mergeCardText(da.text, db.text)),
    onPlay: both(da.onPlay, db.onPlay),
    onTurn: both(da.onTurn, db.onTurn),
    onLeave: both(da.onLeave, db.onLeave),
    onRecover: both(da.onRecover, db.onRecover),
    passive: both(da.passive, db.passive),
    defence: da.defence || db.defence ? Math.max(da.defence ?? 0, db.defence ?? 0) : undefined,
    stability: da.stability !== undefined || db.stability !== undefined ? Math.max(da.stability ?? 0, db.stability ?? 0) : undefined,
    fusedFrom: [a, b],
  };
  FUSED.set(id, def);
  return def;
}

export function allCardDefs(mode: GameMode = rulesMode()): CardDef[] {
  return mode === 'core' ? CARDS.map((c) => CORE_BY_ID.get(c.id) ?? c) : CARDS;
}

export { RACE_NAMES } from './races';

export interface DeckList {
  name: string;
  cards: string[];
  /** A starter built round a mechanic, from several races (shown as "mixed"). */
  mixed?: boolean;
  /** The card whose picture is on its box (else its biggest Hero's). */
  cover?: string;
  /** The mode it is built for (unset: Lost Races). */
  mode?: GameMode;
}

const twoOf = (...ids: string[]) => ids.flatMap((id) => [id, id]);

/** A ready-made deck for each race: its cards (with its Stellar hero and its Anomaly), neutral support and two Command cards. */
// A starter deck (30 cards, three of them Command cards) keeps a bit under half its cards at 0–1 energy, so
// most days can play a 2 and a 1 early and fill 4 energy later, with a few 3s and 4s as its bombs; a deck
// that ramps (Hive Bloom) can run a higher curve.
export const PRESET_DECKS: DeckList[] = [
  {
    // Attack cards that power each other up: a Sunforge and a Focusing Array boosting them all, Lancer
    // Squadrons and Sunlance Charges growing with the attack and Command cards around them, a Halo
    // Sentinel guarding the line, a Sunlit Return and a Recall Beacon to bring the best attack cards back,
    // an Ion Cannon, Rally Banners to recall a card and play it again, and a Prism of Dawn set face down
    // against the counter-attack. At the top: Aurelia, the Archon and the Sun Throne.
    name: 'Solar Lancers',
    cards: [
      ...twoOf('command_directive', 'helio_lancer', 'rally_banner'),
      'sunlance_charge', 'lancer_squadron', 'aureline_cantor', 'solar_aegis', 'ignition_protocol', 'coronal_chorus',
      'hymn_of_the_sun', 'sunforge', 'focusing_array', 'aureline_war_herald', 'aureline_sun_priest', 'halo_ward',
      'halo_sentinel', 'sunlit_return', 'prism_of_dawn', 'ion_cannon', 'aureline_sunguard', 'dawnstar_cannon',
      'recall_beacon', 'glory_charge', 'aureline_archon', 'dawn_rampart', 'aurelia_first_light', 'the_sun_throne',
    ],
  },
  {
    // Cards that pay off as they leave play (Martyrs, Echo Shards, Prism Wards, Kyr'Vessa), recalled with
    // Phase Shift and Shard Echo to do it again (and with Shard Recall); Ember Shards recovered by the
    // Reliquarist; a Prism Conduit cooled by the attack cards beside it; a Coolant Protocol, a Prism Vent,
    // and a Prism Sanctum to run hot safely, with Precession Engines (attuned twice over), a Crystal Storm
    // and a Searing Core to press.
    name: 'Shard Overload',
    cards: [
      ...twoOf('precession_engine', 'martyr_crystal', 'prism_ward', 'war_council', 'ember_shard', 'echo_shard'),
      'coolant_protocol', 'overload_core', 'kyrvessa_prism_queen', 'xelnaru_champion', 'xelnaru_reliquarist', 'prism_conduit',
      'phase_shift', 'shard_recall', 'shard_echo', 'prism_colossus', 'tactical_withdrawal', 'star_breaker',
      'crystal_storm', 'xelnaru_warden', 'shard_tempest', 'searing_core', 'prism_sanctum', 'crystal_reliquary',
    ],
  },
  {
    // Shields and defence: Tide Pylons around the Wardens, a Trench-Warden, the Aegis Monolith and a
    // Leviathan Shell guarding the line, Returning Tide to bring a fallen defence card back, Undertows to
    // wear rival cards away, Brine Lashes, Riptides and Jelly Swarms hitting harder behind shields, and a
    // Riptide Ambusher and an Ink Cloud set face down against a big hit.
    name: 'Abyssal Tide',
    cards: [
      ...twoOf('bell_warden', 'tide_pylon', 'abyssal_choir', 'undertow', 'tide_regent', 'riptide', 'brine_lash', 'tidal_graft'),
      'tidal_wave', 'jelly_swarm', 'abyssal_titan', 'siphon_tendril', 'the_admiralty', 'riptide_ambush',
      'trench_warden', 'stinging_veil', 'hero_of_rathune', 'ommarath_deep_bell', 'returning_tide', 'aegis_monolith',
      'tidebreaker', 'leviathan_shell',
    ],
  },
  {
    // Go wide, ramp and keep it coming back: Sporelings, Overgrowth, Hive Relays and the Brood Queen for
    // the energy to play more (and bigger: a Chitin Fortress, a Solar Bastion), Hive Rooting and a Compost
    // Cycle to hold the hive in play, and Spore Husks recovered from the discard pile (by the Compost Cycle
    // and a Regrowth Pod) to draw more, and Seasonal Blooms planting Saplings and taking their orbit's bonus.
    name: 'Hive Bloom',
    cards: [
      ...twoOf('creeping_vines', 'spore_husk', 'logistics_command', 'rot_bloom', 'hive_relay', 'spore_cloud', 'seed_burst'),
      'seasonal_bloom', 'seasonal_bloom', 'hive_warrior', 'chamber_protocol', 'hive_rooting', 'compost_cycle', 'sporelings',
      'overgrowth', 'chitin_fortress', 'ixquor_brood_tender', 'the_brood_queen', 'sporestorm',
      'hive_tyrant', 'spore_drone', 'spore_catalyst', 'solar_bastion',
    ],
  },
  // Mixed decks, each built round one of the game's mechanics rather than one race (the emblem is the race
  // it leans on most). The first four (one per race) are the races' own, and the campaign's.
  {
    // Attunement: Orreries, Ecliptic Lances, Moon Wardens and Precession Engines take their bonus from where
    // the Orbit stands (shields at the dead planet, cards at the abundant one, heat at the industrial one),
    // so the deck steers its Orbit (Slingshots, Gravity Assists, the Solstice Choir, the Grand Orrery) onto
    // the industrial planet and knocks its rival's off theirs (Gravity Wells, Tidal Brakes).
    name: 'Orbit Riders',
    mixed: true,
    cover: 'grand_orrery',
    cards: [
      ...twoOf('logistics_command', 'orrery', 'ecliptic_lance', 'solstice_choir', 'moon_warden', 'precession_engine', 'orbital_slingshot'),
      ...twoOf('gravity_assist', 'tidal_brake', 'sunward_lance', 'cryo_vault'),
      'tide_regent', 'grand_orrery', 'gravity_well', 'coronal_lance', 'heat_sink', 'photon_drill', 'perihelion_forge', 'deep_scanners',
    ],
  },
  {
    // Lightspeed: a trap face down (Prisms of Dawn and Counter Pulses against attack cards), Guards that
    // spring out of the Lightspeed slot to take a hit (Blink Bulwarks), a Xel'Naru Warden and a Twilight
    // Sentry standing guard, and Aureline attack cards forged and boosted behind them, with an attuned
    // Ecliptic Lance. (The Sunflash Aegis pair and the Riptide Sentinel made way when 1-energy cards lost
    // their third day and the Sentinel went up to 3 energy: 40% to 47% against the other starters.)
    name: 'Ambush',
    mixed: true,
    cover: 'prism_of_dawn',
    cards: [
      ...twoOf('command_directive', 'prism_of_dawn', 'counter_pulse', 'blink_bulwark', 'helio_lancer', 'shard_reactor'),
      ...twoOf('coronal_lance', 'cryo_vault', 'photon_drill'),
      'xelnaru_warden', 'twilight_sentry', 'plasma_relay', 'ecliptic_lance', 'war_council', 'gravity_sling', 'dawnstar_cannon', 'aureline_archon', 'sunforge', 'focusing_array', 'deep_scanners', 'deflector_grid',
    ],
  },
  {
    // Removal: tear the rival's tableau down faster than they build it. Ion Cannons, Void Bolts and
    // Shatter Points destroy, Tractor Beams and Tidebreakers eject, Entropy Pulses and Fault Lines erode,
    // the Maelstrom wears everything; the Star Breaker and the Event Horizon finish the job.
    name: 'Demolition',
    mixed: true,
    cover: 'event_horizon',
    cards: [
      ...twoOf('war_council', 'ion_cannon', 'void_bolt', 'entropy_pulse', 'scatter_shot', 'tidebreaker', 'cryo_vault', 'shard_reactor'),
      'command_breaker', 'tractor_beam', 'shatter_point', 'fault_line', 'maelstrom', 'star_breaker',
      'event_horizon', 'the_shardmind', 'heat_sink', 'deflector_grid', 'deep_scanners', 'xelnaru_warden', 'photon_drill', 'coronal_lance',
    ],
  },
  {
    // Thermosiphon: run your own sun far below zero (Cryo Vaults, Cold Fronts, the Ice Age) and every
    // Thermosiphon card gets stronger the colder it is: Cryo Lances and Absolute Zero for heat, Frostbound
    // Sentinels, Rime Bastions and the Glacier Hull for shields.
    name: 'Absolute Zero',
    mixed: true,
    cover: 'absolute_zero',
    cards: [
      ...twoOf('coolant_protocol', 'cryo_lance', 'frostbound_sentinel', 'rime_bastion', 'cryo_vault', 'cold_front', 'glacier_shell', 'coolant_array', 'shard_reactor'),
      'absolute_zero', 'glacier_hull', 'ice_age', 'deep_freeze', 'prism_vent', 'the_shardmind',
      'heat_sink', 'photon_drill', 'helio_lancer', 'dawnstar_cannon', 'gravity_sling', 'deep_scanners',
    ],
  },
  {
    // Fusion: a few sturdy hosts (Plasma Relays, Vanguards, Dawnstar Cannons, Trench Wardens), and grafts to
    // stack on them, each adding its dawn effect to the host's: no free slots needed, so the hand never
    // jams. Reinforced Plating and Barnacle Shells keep the loaded hosts standing.
    name: 'Graftworks',
    mixed: true,
    cover: 'sunforged_lens',
    cards: [
      ...twoOf('tide_regent', 'plasma_relay', 'aureline_vanguard', 'thermal_graft', 'sunforged_lens', 'shield_lattice', 'reinforced_plating', 'shard_splice'),
      ...twoOf('barnacle_shell', 'coolant_shunt'),
      'the_admiralty', 'dawnstar_cannon', 'trench_warden', 'bastion_node',
      'data_splice', 'siphon_tendril', 'deep_scanners', 'coronal_lance', 'photon_drill', 'helio_lancer',
    ],
  },
  {
    // Spend All: cheap cards and energy (Relay Stations, Overcharges, Glory Charges, Phase Shifts) build a
    // big day, then a Solar Torrent, a Meltdown or a Radiant Barrage spends it all at once; Deep Freeze and
    // the Abyssal Rampart do the same for defence, the Overflow Archive and Hive Surge for cards.
    name: 'Overcharge',
    mixed: true,
    cover: 'solar_torrent',
    cards: [
      ...twoOf('ignition_protocol', 'solar_torrent', 'meltdown', 'radiant_barrage', 'relay_station', 'overcharge', 'glory_charge', 'deep_freeze', 'gravity_sling'),
      'the_admiralty', 'overflow_archive', 'abyssal_rampart', 'hive_surge', 'overgrowth', 'phase_shift',
      'coronal_lance', 'cryo_vault', 'heat_sink', 'deep_scanners', 'fracture_lens', 'sporelings',
    ],
  },
  // ---- The newer races (after the mixed starters, so saved deck picks keep their place) ----
  {
    // Nyxari: cheap attackers that strike the day they land (Darkspeed), wearing the rival's cards down
    // into the Unmakers' reach; a few Veilwalker traps and Guards, and a Null Shroud for the rival's Hero.
    // (No shield cards: Darkspeed does nothing for them. Umbral Snares, Mirror Veils, the Veil Lantern and
    // the Aegis Idol made way for Nightfalls, a third Shade Stalker, a second Phantom Strike and the Ember
    // Idol: 35% to 46% against the other starters.)
    name: 'Night Court',
    cards: [
      ...twoOf('nyx_nightfall', 'nyx_night_ambush', 'nyx_veil_sentry', 'nyx_gloom_warden', 'nyx_shade_stalker', 'nyx_dusk_raider', 'nyx_unmaker_blade', 'nyx_void_rend', 'nyx_phantom_strike', 'coronal_lance'),
      // (Attack in place of draw: cheap as the deck is, it drew far more than it could ever play.)
      'nyx_shade_stalker', 'photon_drill', 'plasma_relay', 'nyx_unravel',
      'nyx_hollow_reaper', 'nyx_shadow_court', 'nyx_null_shroud',
      'nyx_hero_vesh', 'nyx_hero_kael', 'nyx_hero_nyxara',
    ],
  },
  {
    // Korrath: Forgeborn grafts hammered onto a few heavy cards, Bastion-kin Guards in front of them, and
    // repair to keep the plating whole.
    name: 'Forge Clans',
    cards: [
      ...twoOf('kor_rivet_graft', 'kor_slag_graft', 'kor_anvil_graft', 'kor_forge_hammer', 'kor_shieldwall', 'kor_bastion_kin', 'kor_iron_sentinel', 'kor_siege_ram', 'kor_molten_pour', 'siege_array', 'plasma_relay'),
      'kor_master_smith', 'kor_rampart_lord', 'kor_foundry', 'kor_ore_hauler', 'coronal_lance',
      'kor_hero_durga', 'kor_hero_brannoc', 'kor_hero_anvil_king',
    ],
  },
  {
    // Seren: attuned cards (twice over, Star-charted) riding an orbit that Tidecasters push round, and
    // Seers drawing and recovering.
    name: 'Starwatch',
    cards: [
      ...twoOf('ser_astral_lance', 'ser_tide_turner', 'ser_planet_shepherd', 'ser_eclipse_caster', 'ser_twin_moons', 'ser_star_chart', 'ser_orrery_keeper', 'ser_stargazer', 'ser_star_needle', 'ser_moonwell', 'ecliptic_lance'),
      'ser_oracle', 'ser_lantern_of_ages', 'ser_constellation', 'ser_almanac', 'solstice_choir',
      'ser_hero_ilyath', 'ser_hero_maren', 'ser_hero_aster',
    ],
  },
  {
    // Pyrr: Cinderborn running their own sun hot (and hitting harder for it), Flarekin spending a big day
    // all at once, Heat Blooms and Vent Coolers to stay just short of supernova.
    name: 'Wildfire',
    cards: [
      ...twoOf('pyr_flare_imp', 'pyr_cinder_brute', 'pyr_ash_walker', 'pyr_heat_bloom', 'pyr_ember_guard', 'pyr_flare_burst', 'pyr_pyre_shield', 'pyr_flarekin_dancer', 'pyr_stoker', 'pyr_vent_cooler', 'pyr_banked_embers'),
      'pyr_magma_heart', 'pyr_supernova_charge', 'pyr_flare_temple', 'pyr_solar_tyrant', 'coolant_array',
      'pyr_hero_ignis', 'pyr_hero_ashka', 'pyr_hero_pyrrhus',
    ],
  },  // ---- Core (modes.ts): one deck per core race, built round its one mechanic ----
  {
    // Forge: attack cards lined up beside the Sunforges, Focusing Array and Halo Sentinels that boost them.
    name: 'Sunforge',
    mode: 'core',
    cards: [
      ...twoOf('command_directive', 'sunforge', 'helio_bastion', 'gilded_lens', 'halo_sentinel', 'solar_aegis', 'aureline_war_herald', 'helio_lancer', 'lancer_squadron', 'aureline_cantor', 'aureline_watchkeeper', 'aureline_sun_priest'),
      'empress_solenne', 'focusing_array', 'dawnstar_cannon', 'aureline_sunset_lancer', 'aurelia_first_light', 'ion_cannon',
    ],
  },
  {
    // Overheat: running their own sun hot for cards that hit harder while it is, and cooling just in time.
    name: 'Red Shift',
    mode: 'core',
    cards: [
      ...twoOf('war_council', 'crystal_storm', 'overload_core', 'shard_storm', 'xelnaru_champion', 'crystal_bloom', 'prism_vent', 'xelnaru_warden', 'fracture_lens', 'overcharge', 'xelnaru_oracle', 'coronal_lance', 'xelnaru_banked_star'),
      'the_shardmind', 'xelnaru_still_flame', 'prism_sanctum', 'shatter_point',
    ],
  },
  {
    // Shields: walls of them, and attack cards that hit harder the more there are.
    name: 'Deep Tide',
    mode: 'core',
    cards: [
      ...twoOf('tide_regent', 'vorthane_tide_watcher', 'tidal_wave', 'pressure_wave', 'riptide', 'kelp_wall', 'trench_warden', 'vorthane_tidecaller', 'ebb_tide', 'deep_hymn', 'abyssal_choir', 'tidebreaker'),
      'the_admiralty', 'deep_current', 'pressure_dome', 'ommarath_deep_bell', 'vorthane_elder', 'vorthane_undertow',
    ],
  },
  {
    // Growth: cards that grow each dawn and pay out what they've grown, and the Broodmother growing them all.
    name: 'Living Hive',
    mode: 'core',
    cards: [
      ...twoOf('chamber_protocol', 'mycelium_tower', 'spore_drone', 'chitin_spire', 'thorn_graft', 'ixquor_brood_tender', 'mycelial_net', 'hive_warrior', 'rot_bloom', 'ixquor_waiting_brood', 'bloom_burst', 'spore_cloud'),
      'the_worldroot', 'spore_catalyst', 'hive_relay', 'ixquor_brood_warden', 'void_bolt', 'the_brood_queen',
    ],
  },
  // (Lost Races, added after the Core starters so every saved starter keeps its place.)
  {
    // Blood Cult: Thralls, Vessels and Chalices put down to be consumed, by Crimson Rites, Offerings and
    // Bloodfeasts, each one leaving play firing its own payoff and the Hemomancers' and Sanguine Priests'.
    name: 'Blood Rite',
    cards: [
      ...twoOf('bc_hero_sanguis', 'bc_blood_thrall', 'bc_willing_vessel', 'bc_martyrs_chalice', 'bc_crimson_rite', 'bc_blood_offering', 'bc_sanguine_priest', 'bc_hemomancer', 'bc_bloodfeast', 'bc_exsanguinate', 'nyx_shade_stalker', 'nyx_phantom_strike', 'coronal_lance', 'plasma_relay'),
      'nyx_hero_nyxara', 'cryo_vault',
    ],
  },
];

/**
 * The big cards (cards-big.ts) in the starters: one copy of a cheap card each makes way for one, so the
 * days with five energy (and more, with bonus energy) have something to spend it on.
 */
const BIG_SWAPS: Record<string, [string, string][]> = {
  'Solar Lancers': [['rally_banner', 'zenith_array']],
  'Shard Overload': [['echo_shard', 'coronal_storm'], ['prism_ward', 'great_collapse']],
  'Abyssal Tide': [['brine_lash', 'bulwark_prime']],
  'Hive Bloom': [['seasonal_bloom', 'furnace_engine'], ['seed_burst', 'black_sun']],
  'Night Court': [['nyx_void_rend', 'coronal_storm'], ['nyx_shade_stalker', 'great_collapse']],
  'Forge Clans': [['plasma_relay', 'bulwark_prime'], ['kor_molten_pour', 'black_sun']],
  Starwatch: [['ser_star_needle', 'furnace_engine'], ['ser_star_chart', 'dyson_sphere']],
  Wildfire: [['pyr_banked_embers', 'coronal_storm'], ['pyr_vent_cooler', 'supernova_lance']],
};
/** The Relics (cards-relics.ts) in the starters: one each (two in Wildfire), each to its deck's plan. */
const RELIC_SWAPS: Record<string, [string, string][]> = {
  'Solar Lancers': [['helio_lancer', 'ember_idol']],
  'Shard Overload': [['ember_shard', 'astral_orrery']],
  'Abyssal Tide': [['undertow', 'tide_pearl']],
  'Hive Bloom': [['hive_relay', 'chrono_stone']],
  'Night Court': [['coronal_lance', 'ember_idol']],
  'Forge Clans': [['kor_shieldwall', 'warden_totem']],
  Starwatch: [['ser_twin_moons', 'frost_reliquary']],
  Wildfire: [['pyr_flare_imp', 'ember_idol'], ['pyr_ash_walker', 'crown_first_sun']],
};
for (const d of PRESET_DECKS) {
  for (const [out, inn] of [...(BIG_SWAPS[d.name] ?? []), ...(RELIC_SWAPS[d.name] ?? [])]) {
    const at = d.cards.lastIndexOf(out);
    if (at >= 0) d.cards[at] = inn;
  }
}

/**
 * The race most of these cards belong to (its costliest Hero's on a tie; undefined for all-neutral cards). A deck
 * has no race of its own: this only says what its cards are, for its box's colour and emblem.
 */
export function mainRace(cards: string[]): number | undefined {
  const counts = new Map<number, number>();
  for (const id of cards) {
    const r = BY_ID.get(id)?.race;
    if (r !== undefined) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  if (!counts.size) return undefined;
  const best = Math.max(...counts.values());
  const tied = [...counts].filter(([, n]) => n === best).map(([r]) => r);
  // (On a tie, its costliest Hero's race.)
  const heroes = cards.map((id) => BY_ID.get(id)).filter((c): c is CardDef => c?.kind === 'command' && c.race !== undefined && tied.includes(c.race));
  heroes.sort((x, y) => (y.cost ?? 1) - (x.cost ?? 1));
  return heroes[0]?.race ?? tied[0];
}

/** The starter deck built from one race's cards (the first starter for anything else): for the campaign's factions. */
export function presetDeck(race: number, mode: GameMode = 'lost'): DeckList {
  return PRESET_DECKS.find((d) => !d.mixed && (d.mode ?? 'lost') === mode && mainRace(d.cards) === race) ?? PRESET_DECKS.find((d) => !d.mixed && mainRace(d.cards) === race) ?? PRESET_DECKS[0];
}

/** How many Command cards a deck of this size runs: one per `cardsPerCommand` cards (3 in 30, 4 in 40). */
export function commandCardsFor(size: number): number {
  return Math.max(1, Math.floor(Math.max(size, BALANCE.deckSize) / BALANCE.cardsPerCommand));
}

/** Why a deck list is not legal (empty if it is). */
export function deckProblems(cards: string[], mode: GameMode = 'lost'): string[] {
  const problems: string[] = [];
  for (const id of new Set(cards)) {
    const def = BY_ID.get(id);
    const why = def ? modeProblem(cardIn(id, mode), mode) : null;
    if (why) problems.push(`${def!.name}: ${why}`);
  }
  if (cards.length < BALANCE.deckSize || cards.length > BALANCE.maxDeckSize) problems.push(`A deck needs ${BALANCE.deckSize}–${BALANCE.maxDeckSize} cards (this has ${cards.length}).`);
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if ((!BY_ID.has(id) || BY_ID.get(id)!.token) && !fusedDef(id)) problems.push(`Unknown card: ${id}.`);
    else if (n > copyLimit(id)) problems.push(copyLimit(id) === 1 ? `${cardDef(id).name} is an Anomaly: only one copy per deck.` : `At most ${BALANCE.maxCopies} copies of ${cardDef(id).name}.`);
  }
  const commands = cards.filter((id) => (BY_ID.get(id) ?? fusedDef(id))?.kind === 'command').length;
  const need = commandCardsFor(cards.length);
  if (commands !== need) problems.push(`A deck of ${cards.length} needs exactly ${need} Heroes: one per ${BALANCE.cardsPerCommand} cards (this has ${commands}).`);
  return problems;
}
