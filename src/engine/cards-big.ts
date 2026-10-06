import type { CardDef } from './types';

/**
 * Big cards, for the days with five energy and more: 5-cost cards that turn a game, and 6-cost Anomalies
 * (one of each to a deck) that end one, but need a day's bonus energy (an industrial planet, an energy card)
 * to play at all. Each has its answer: shields, Mirror Veil and the like soak or cancel heat, removal takes the
 * ones that stay.
 */
export const BIG_CARDS: CardDef[] = [
  // ---- 5 energy ----
  {
    id: 'coronal_storm', name: 'Coronal Storm', kind: 'attack', cost: 5, rarity: 'stellar',
    text: '{heat:6}. {decay:1}.',
    onPlay: [{ type: 'heat', amount: 6, to: 'target' }, { type: 'erode', amount: 1, all: true }],
  },
  {
    id: 'furnace_engine', name: 'Furnace Engine', kind: 'attack', cost: 5, rarity: 'stellar',
    text: '{sturdy:2}. {dawn}: {heat:3}, {pierce}.',
    defence: 2, onTurn: [{ type: 'heat', amount: 3, to: 'target', pierce: true }],
  },
  {
    id: 'bulwark_prime', name: 'Bulwark Prime', kind: 'defence', cost: 4, rarity: 'stellar',
    text: '{guard}. {sturdy:3}. {shield:4}. {dawn}: {shield:3}.',
    defence: 3, onPlay: [{ type: 'shield', amount: 4 }], onTurn: [{ type: 'shield', amount: 3 }], passive: [{ type: 'taunt' }],
  },
  {
    id: 'zenith_array', name: 'Zenith Array', kind: 'growth', cost: 5, rarity: 'stellar',
    text: 'Your attack cards deal +2 {heat}.',
    passive: [{ type: 'kindBonus', kind: 'attack', amount: 2 }],
  },
  // ---- 6 energy: one past the day's most, so only with bonus energy ----
  {
    id: 'supernova_lance', name: 'Supernova Lance', kind: 'attack', cost: 6, rarity: 'anomaly',
    text: '{heat:12}, {pierce}.',
    onPlay: [{ type: 'heat', amount: 12, to: 'target', pierce: true }],
  },
  {
    id: 'great_collapse', name: 'Great Collapse', kind: 'attack', cost: 6, rarity: 'anomaly',
    text: '{decay:3}. {heat:4}.',
    onPlay: [{ type: 'erode', amount: 3, all: true }, { type: 'heat', amount: 4, to: 'target' }],
  },
  {
    id: 'dyson_sphere', name: 'Dyson Sphere', kind: 'defence', cost: 6, rarity: 'anomaly',
    text: '{shield:10}. {cool:5}. {hold}. {dawn}: {shield:2}.',
    onPlay: [{ type: 'shield', amount: 10 }, { type: 'cool', amount: 5 }], onTurn: [{ type: 'shield', amount: 2 }], passive: [{ type: 'keepShields' }],
  },
  {
    id: 'black_sun', name: 'Black Sun', kind: 'attack', cost: 6, rarity: 'anomaly',
    text: '{sturdy:3}. {dawn}: {heat:5}.',
    defence: 3, onTurn: [{ type: 'heat', amount: 5, to: 'target' }],
  },
];
