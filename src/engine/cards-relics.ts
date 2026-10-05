import type { CardDef } from './types';

/**
 * Relics: no attack, and they never fade, so their bonuses last the whole game; but every one is Brittle:
 * nothing restores it, and removal reaches it whatever its defence. They stand like other cards (their
 * slot's defence, 3 stability), so attacks wear them down over a few days; removal ends one at once.
 */
export const RELIC_CARDS: CardDef[] = [
  {
    id: 'ember_idol', name: 'Ember Idol', kind: 'relic', cost: 3,
    text: '{brittle}. Your attack cards {heat:+1}.',
    passive: [{ type: 'kindBonus', kind: 'attack', amount: 1 }],
  },
  {
    id: 'frost_reliquary', name: 'Frost Reliquary', kind: 'relic', cost: 2,
    text: '{brittle}. Your cards {cool:+1}.',
    passive: [{ type: 'kindBonus', stat: 'cool', amount: 1 }],
  },
  {
    id: 'aegis_idol', name: 'Aegis Idol', kind: 'relic', cost: 2,
    text: '{brittle}. Your cards {shield:+1}.',
    passive: [{ type: 'kindBonus', stat: 'shield', amount: 1 }],
  },
  {
    id: 'chrono_stone', name: 'Chrono Stone', kind: 'relic', cost: 2,
    text: '{brittle}. {anchor}.',
    passive: [{ type: 'anchor' }],
  },
  {
    id: 'warden_totem', name: 'Warden Totem', kind: 'relic', cost: 2,
    text: '{brittle}. {bulwark:2/1}.',
    passive: [{ type: 'guard', amounts: [2, 1] }],
  },
  {
    id: 'tide_pearl', name: 'Tide Pearl', kind: 'relic', cost: 2,
    text: '{brittle}. {tidewall}.',
    passive: [{ type: 'tidewall' }],
  },
  {
    id: 'astral_orrery', name: 'Astral Orrery', kind: 'relic', cost: 4, rarity: 'stellar',
    text: '{brittle}. {plays:1}.',
    passive: [{ type: 'extraPlay', amount: 1 }],
  },
  {
    id: 'crown_first_sun', name: 'Crown of the First Sun', kind: 'relic', cost: 4, rarity: 'anomaly',
    text: '{brittle}. Your cards {heat:+1}, {cool:+1} and {shield:+1}.',
    passive: [{ type: 'kindBonus', amount: 1 }, { type: 'kindBonus', stat: 'cool', amount: 1 }, { type: 'kindBonus', stat: 'shield', amount: 1 }],
  },
];
