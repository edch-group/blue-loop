import type { CardDef } from './types';

/**
 * Removal for the races that had little: surges that clear the board in each race's own way.
 * - The Aureline make an **Offering**: one of their undimmed armed cards gives up its attack for the day, and that much
 *   burns a rival card's stability away, past its defence. Best at dawn, before the card has struck.
 * - The Ixquor **Rootbreak**: the growth on one of their cards splits a rival card's defence (or their sun's
 *   shields) by as much, roots growing out between the cracks; their attacks do the rest.
 */
export const REMOVAL_CARDS: CardDef[] = [
  // ---- Aureline: Offering ----
  { id: 'aureline_solar_tithe', name: 'Solar Tithe', kind: 'attack', race: 0, cost: 1, text: 'The attack of an undimmed allied card is set to 0 for 1 day. Remove stability from another card equal to the removed attack.', onPlay: [{ type: 'offer' }] },
  { id: 'aureline_dawns_judgement', name: "Dawn's Judgement", kind: 'attack', race: 0, cost: 2, text: '{offering}. Draw 1.', onPlay: [{ type: 'offer' }, { type: 'draw', amount: 1 }] },
  { id: 'aureline_sunbreak_rite', name: 'Sunbreak Rite', kind: 'attack', race: 0, cost: 3, text: '{offering}, twice over: the rival card loses twice the attack given.', onPlay: [{ type: 'offer', times: 2 }] },
  // ---- Ixquor: Rootbreak ----
  { id: 'ixquor_through_the_cracks', name: 'Through the Cracks', kind: 'growth', race: 3, cost: 1, text: "{rootbreak}: a rival card's defence.", onPlay: [{ type: 'rootbreak' }] },
  { id: 'ixquor_rootfall', name: 'Rootfall', kind: 'growth', race: 3, cost: 2, text: "{rootbreak}, twice over: a rival card's defence splits by twice the growth.", onPlay: [{ type: 'rootbreak', times: 2 }] },
  { id: 'ixquor_canopy_breach', name: 'Canopy Breach', kind: 'growth', race: 3, cost: 1, text: "{rootbreak}: their sun's shields. Draw 1.", onPlay: [{ type: 'rootbreak', shields: true }, { type: 'draw', amount: 1 }] },
];
