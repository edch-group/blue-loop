import type { CardDef } from './types';

/**
 * Lightspeed cards: any kind of card (an entity, a technology, a relic) that can be played in any phase of your
 * day, and on your rival's day in reply to a card they play or an attack, paid with banked energy. Lightspeed
 * takes a point of the card's power: each is a little weaker than a card of its cost without it.
 */
export const LIGHTSPEED_CARDS: CardDef[] = [
  // ---- Neutral ----
  // (A wall dropped in front of an attack: Guard draws it. A plain wall of its cost is Sturdy 3, 3 stability.)
  { id: 'flash_interceptor', name: 'Flash Interceptor', kind: 'defence', cost: 2, lightspeed: true, text: '{lightspeed}. {guard}. {sturdy:2}.', defence: 2, health: 2, attack: 0, passive: [{ type: 'taunt' }] },
  // (Cryo Vault cools 3 for 1.)
  { id: 'reflex_coolant', name: 'Reflex Coolant', kind: 'defence', cost: 1, lightspeed: true, text: '{lightspeed}. {cool:2}.', onPlay: [{ type: 'cool', amount: 2 }] },
  // (Nova Shell heats 2 and shields 1 for 1.)
  { id: 'snap_shield', name: 'Snap Shield', kind: 'defence', cost: 1, lightspeed: true, text: '{lightspeed}. {shield:2}.', onPlay: [{ type: 'shield', amount: 2 }] },
  // (Coronal Lance heats 3 for 1. In reply to an attack, its heat goes at the attacker.)
  { id: 'point_defence', name: 'Point Defence', kind: 'attack', cost: 1, lightspeed: true, text: '{lightspeed}. {heat:2}.', onPlay: [{ type: 'heat', amount: 2, to: 'target' }] },
  // (A plain striker of its cost is 3 attack, 3 stability.)
  { id: 'interceptor_wing', name: 'Interceptor Wing', kind: 'attack', cost: 2, rarity: 'stellar', lightspeed: true, text: '{lightspeed}.', attack: 2, health: 2 },
  // (Deep-Space Scanners draw 2 for 1.)
  { id: 'quickdraw_relay', name: 'Quickdraw Relay', kind: 'growth', cost: 1, lightspeed: true, text: '{lightspeed}. Draw 1.', onPlay: [{ type: 'draw', amount: 1 }] },
  // (A relic of its cost gives every card +1 shield.)
  { id: 'warding_idol', name: 'Warding Idol', kind: 'relic', cost: 2, rarity: 'stellar', lightspeed: true, text: '{lightspeed}. {brittle}. {dawn}: {shield:1}.', onTurn: [{ type: 'shield', amount: 1 }] },

  // ---- Aureline ----
  { id: 'dawnflash_guard', name: 'Dawnflash Guard', kind: 'defence', race: 0, cost: 2, lightspeed: true, text: '{lightspeed}. {guard}. {sturdy:1}. {dawn}: {shield:1}.', defence: 1, health: 2, attack: 0, onTurn: [{ type: 'shield', amount: 1 }], passive: [{ type: 'taunt' }] },
  // ---- Xel'Naru ----
  // (Thermal Exchange heats 2 and cools 1 for 1.)
  { id: 'shard_flare', name: 'Shard Flare', kind: 'attack', race: 1, cost: 1, lightspeed: true, text: '{lightspeed}. {heat:1}. {cool:1}.', onPlay: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'cool', amount: 1 }] },
  // ---- Vorthane ----
  { id: 'brine_veil', name: 'Brine Veil', kind: 'defence', race: 2, cost: 2, lightspeed: true, text: '{lightspeed}. {shield:3}.', onPlay: [{ type: 'shield', amount: 3 }] },
  // ---- Ixquor ----
  // (Seasonal Bloom plants 1 and attunes, for 1.)
  { id: 'sudden_spore', name: 'Sudden Spore', kind: 'growth', race: 3, cost: 1, lightspeed: true, text: '{lightspeed}. {plant:1}.', onPlay: [{ type: 'plant', amount: 1 }] },
  // ---- Korrath ----
  // (Temper repairs 3 and shields 1 for 1.)
  { id: 'rapid_rivets', name: 'Rapid Rivets', kind: 'defence', race: 5, cost: 1, lightspeed: true, text: '{lightspeed}. {repair:2}.', onPlay: [{ type: 'repair', amount: 2 }] },
];
