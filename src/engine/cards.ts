import { BALANCE } from './balance';
import type { CardDef } from './types';

/**
 * The card pool. Cards have no cost: the number of cards you may play each
 * turn is the only limit, so no single card should be a bomb. Power comes from
 * what a card does alongside the others already in your tableau.
 *
 * "Your target" is the rival you have chosen to attack. "Start of turn"
 * effects trigger at the start of each of your turns while the card is in play.
 */
export const CARDS: CardDef[] = [
  // ---- Neutral ------------------------------------------------------------
  { id: 'coronal_lance', name: 'Coronal Lance', kind: 'attack', text: 'Heat your target by 3.', onPlay: [{ type: 'heat', amount: 3, to: 'target' }] },
  { id: 'plasma_relay', name: 'Plasma Relay', kind: 'attack', text: 'Start of turn: heat your target by 1.', onTurn: [{ type: 'heat', amount: 1, to: 'target' }] },
  { id: 'gravity_sling', name: 'Gravity Sling', kind: 'attack', text: 'Heat your target by 1. Draw 1 card.', onPlay: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'draw', amount: 1 }] },
  { id: 'thermal_exchange', name: 'Thermal Exchange', kind: 'attack', text: 'Heat your target by 2. Cool your sun by 1.', onPlay: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'cool', amount: 1 }] },
  {
    id: 'solar_battery',
    name: 'Solar Battery',
    kind: 'attack',
    text: 'Start of turn: if you control 3 or more attack cards, heat your target by 2.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target', if: { minKind: 'attack', n: 3 } }],
  },
  { id: 'ion_cannon', name: 'Ion Cannon', kind: 'attack', text: "Destroy a card in your target's tableau.", onPlay: [{ type: 'destroy' }] },
  { id: 'coolant_array', name: 'Coolant Array', kind: 'defence', text: 'Start of turn: cool your sun by 1.', onTurn: [{ type: 'cool', amount: 1 }] },
  { id: 'cryo_vault', name: 'Cryo Vault', kind: 'defence', text: 'Cool your sun by 3.', onPlay: [{ type: 'cool', amount: 3 }] },
  { id: 'deflector_grid', name: 'Deflector Grid', kind: 'defence', text: 'Start of turn: gain 2 shields.', onTurn: [{ type: 'shield', amount: 2 }] },
  { id: 'heat_sink', name: 'Heat Sink', kind: 'defence', text: 'Cool your sun by 1. Draw 1 card.', onPlay: [{ type: 'cool', amount: 1 }, { type: 'draw', amount: 1 }] },
  { id: 'deep_scanners', name: 'Deep-Space Scanners', kind: 'growth', text: 'Draw 2 cards.', onPlay: [{ type: 'draw', amount: 2 }] },

  // ---- Global: one at a time on the whole table; a new one replaces it ----
  { id: 'solar_storm', name: 'Solar Storm', kind: 'global', text: 'Global. Every sun heats by 1 at the start of its turn.', passive: [{ type: 'field', field: 'solarStorm' }] },
  { id: 'ice_age', name: 'Ice Age', kind: 'global', text: 'Global. Every sun cools by 1 at the start of its turn.', passive: [{ type: 'field', field: 'iceAge' }] },
  { id: 'solar_maximum', name: 'Solar Maximum', kind: 'global', text: 'Global. Every heat effect deals 1 more heat.', passive: [{ type: 'field', field: 'solarMaximum' }] },

  // ---- Command: upgrades for your whole deck; they do not take a slot ----
  {
    id: 'ignition_protocol',
    name: 'Ignition Protocol',
    kind: 'command',
    text: 'Upgrade Solar Flare: your attack cards deal 1 more heat. Heat your target by 1.',
    onPlay: [{ type: 'upgrade', action: 'solarFlare' }, { type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'coolant_protocol',
    name: 'Coolant Protocol',
    kind: 'command',
    text: 'Upgrade Thermosiphon: your cooling effects cool +1. Cool your sun by 1.',
    onPlay: [{ type: 'upgrade', action: 'thermosiphon' }, { type: 'cool', amount: 1 }],
  },
  {
    id: 'chamber_protocol',
    name: 'Chamber Protocol',
    kind: 'command',
    text: `Upgrade Cooling Chamber: +${BALANCE.coolingChamberHealthPerUpgrade} max health. Gain 2 shields.`,
    onPlay: [{ type: 'upgrade', action: 'coolingChamber' }, { type: 'shield', amount: 2 }],
  },
  { id: 'command_directive', name: 'Command Directive', kind: 'command', text: 'Upgrade Solar Flare, Thermosiphon or Cooling Chamber.', onPlay: [{ type: 'upgrade', action: 'choice' }] },

  // ---- Aureline: lancers. Many attack cards, each making the others hit harder ----
  {
    id: 'helio_lancer',
    name: 'Helio Lancer',
    kind: 'attack',
    race: 0,
    text: 'Start of turn: heat your target by 1. If you have a Solar Flare upgrade, gain 1 shield.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'shield', amount: 1, if: { upgraded: 'solarFlare' } }],
  },
  { id: 'focusing_array', name: 'Focusing Array', kind: 'attack', race: 0, text: 'Your other attack cards deal 1 more heat at the start of your turn. Copies do not stack.', passive: [{ type: 'kindBonus', kind: 'attack', amount: 1, others: true, onTurnOnly: true }] },
  {
    id: 'coronal_chorus',
    name: 'Coronal Chorus',
    kind: 'attack',
    race: 0,
    text: 'Heat your target by 1 for each attack card you control (up to 4).',
    onPlay: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'kind', kind: 'attack' }, max: 4 }],
  },
  { id: 'sunspear', name: 'Sunspear', kind: 'attack', race: 0, text: 'Heat your target by 4. Heat your own sun by 2.', onPlay: [{ type: 'heat', amount: 4, to: 'target' }, { type: 'selfHeat', amount: 2 }] },
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

  // ---- Xel'Naru: overload. Heat every enemy, run your own sun hot, and profit from it ----
  {
    id: 'shard_reactor',
    name: 'Shard Reactor',
    kind: 'attack',
    race: 1,
    text: 'Start of turn: heat your target by 2 and every other enemy sun by 1. Heat your own sun by 1.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target', splash: 1 }, { type: 'selfHeat', amount: 1 }],
  },
  { id: 'crystal_storm', name: 'Crystal Storm', kind: 'attack', race: 1, text: 'Heat your target by 3 and every other enemy sun by 1.', onPlay: [{ type: 'heat', amount: 3, to: 'target', splash: 1 }] },
  {
    id: 'overload_core',
    name: 'Overload Core',
    kind: 'attack',
    race: 1,
    text: 'Start of turn: heat your target by 2, or by 3 while you are overheated (half your max health or hotter).',
    onTurn: [
      { type: 'heat', amount: 2, to: 'target' },
      { type: 'heat', amount: 1, to: 'target', if: { overheated: true } },
    ],
  },
  { id: 'martyr_crystal', name: 'Martyr Crystal', kind: 'attack', race: 1, text: 'Heat every enemy sun by 1. When this card leaves your tableau, heat your target by 3 and every other enemy sun by 1.', onPlay: [{ type: 'heat', amount: 1, to: 'enemies' }], onLeave: [{ type: 'heat', amount: 3, to: 'target', splash: 1 }] },
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
  { id: 'bell_warden', name: 'Bell Warden', kind: 'defence', race: 2, text: 'Start of turn: gain 2 shields.', onTurn: [{ type: 'shield', amount: 2 }] },
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
    text: 'Start of turn: heat your target by 1, +1 for every 2 shields you have (up to 5).',
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
    text: 'Start of turn: this card grows (up to 4), then heats your target by its growth.',
    onTurn: [{ type: 'grow', max: 4 }, { type: 'heat', amount: 0, to: 'target', plus: { of: 'growth' } }],
  },
  { id: 'hive_relay', name: 'Hive Relay', kind: 'growth', race: 3, text: 'You may play 1 extra card each turn.', passive: [{ type: 'extraPlay', amount: 1 }] },
  { id: 'sporecaster', name: 'Sporecaster', kind: 'growth', race: 3, text: 'Start of turn: draw 1 card.', onTurn: [{ type: 'draw', amount: 1 }] },
  {
    id: 'rot_bloom',
    name: 'Rot Bloom',
    kind: 'attack',
    race: 3,
    text: 'Heat your target by 1, +1 for every 2 cards you control (up to 5).',
    onPlay: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'cards', per: 2 }, max: 5 }],
  },
  {
    id: 'canopy',
    name: 'Canopy',
    kind: 'defence',
    race: 3,
    text: 'Start of turn: cool your sun by 1 for every 3 cards you control.',
    onTurn: [{ type: 'cool', amount: 0, plus: { of: 'cards', per: 3 } }],
  },
  {
    id: 'spore_cloud',
    name: 'Spore Cloud',
    kind: 'attack',
    race: 3,
    text: 'Start of turn: if you control 5 or more cards, heat every enemy sun by 1.',
    onTurn: [{ type: 'heat', amount: 1, to: 'enemies', if: { minCards: 5 } }],
  },
];

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

/** A ready-made deck for each race: its six cards twice, neutral support and two Command cards. */
export const PRESET_DECKS: DeckList[] = [
  {
    name: 'Solar Lancers',
    race: 0,
    cards: [...twoOf('helio_lancer', 'focusing_array', 'coronal_chorus', 'sunspear', 'dawn_beacon', 'halo_ward', 'plasma_relay', 'coronal_lance', 'coolant_array'), 'ignition_protocol', 'ignition_protocol'],
  },
  {
    name: 'Shard Overload',
    race: 1,
    cards: [...twoOf('shard_reactor', 'crystal_storm', 'overload_core', 'martyr_crystal', 'prism_vent', 'fracture_lens', 'cryo_vault', 'coolant_array', 'ion_cannon'), 'chamber_protocol', 'coolant_protocol'],
  },
  {
    name: 'Abyssal Tide',
    race: 2,
    cards: [...twoOf('bell_warden', 'stinging_veil', 'tidal_bloom', 'abyssal_choir', 'deep_current', 'lure_jelly', 'deflector_grid', 'plasma_relay'), 'coronal_lance', 'ion_cannon', 'coolant_protocol', 'chamber_protocol'],
  },
  {
    name: 'Hive Bloom',
    race: 3,
    cards: [...twoOf('mycelium_tower', 'hive_relay', 'sporecaster', 'rot_bloom', 'canopy', 'spore_cloud', 'deep_scanners', 'plasma_relay', 'ion_cannon'), 'command_directive', 'command_directive'],
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
    else if (n > BALANCE.maxCopies) problems.push(`At most ${BALANCE.maxCopies} copies of ${cardDef(id).name}.`);
  }
  const commands = cards.filter((id) => BY_ID.get(id)?.kind === 'command').length;
  if (commands !== BALANCE.commandCards) problems.push(`A deck needs exactly ${BALANCE.commandCards} Command cards (this has ${commands}).`);
  return problems;
}
