import type { CardDef } from './types';

/**
 * Fusion cards: played onto one of your cards in play instead of into a slot, they lend it their dawn
 * effects, Sturdy, passives and stability. A deck that draws more cards than it has slots for (Abyssal Tide
 * above all) has somewhere to put them; and a strong card can be built up, at the risk of losing all of it
 * at once when it leaves.
 */
export const FUSION_CARDS: CardDef[] = [
  // ---- Neutral ----
  { id: 'thermal_graft', name: 'Thermal Graft', kind: 'attack', fusion: true, stability: 2, text: '{fusion}. {dawn}: {heat:1}.', onTurn: [{ type: 'heat', amount: 1, to: 'target' }] },
  { id: 'shield_lattice', name: 'Shield Lattice', kind: 'defence', fusion: true, stability: 2, text: '{fusion}. {dawn}: {shield:1}.', onTurn: [{ type: 'shield', amount: 1 }] },
  { id: 'reinforced_plating', name: 'Reinforced Plating', kind: 'defence', fusion: true, stability: 3, defence: 2, text: '{fusion}. {sturdy:2}.' },
  { id: 'coolant_shunt', name: 'Coolant Shunt', kind: 'defence', fusion: true, stability: 2, text: '{fusion}. {dawn}: {cool:1}.', onTurn: [{ type: 'cool', amount: 1 }] },
  { id: 'data_splice', name: 'Data Splice', kind: 'growth', fusion: true, stability: 2, text: '{fusion}. Draw 1.', onPlay: [{ type: 'draw', amount: 1 }] },
  // ---- Aureline ----
  { id: 'sunforged_lens', name: 'Sunforged Lens', kind: 'attack', race: 0, fusion: true, stability: 2, text: '{fusion}. {dawn}: {heat:2}.', onTurn: [{ type: 'heat', amount: 2, to: 'target' }] },
  // ---- Xel'Naru ----
  { id: 'shard_splice', name: 'Shard Splice', kind: 'attack', race: 1, fusion: true, stability: 2, text: '{fusion}. {dawn}: {heat:1}, {cool:1}.', onTurn: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'cool', amount: 1 }] },
  // ---- Vorthane ----
  { id: 'tidal_graft', name: 'Tidal Graft', kind: 'defence', race: 2, fusion: true, stability: 2, text: '{fusion}. {dawn}: {shield:2}.', onTurn: [{ type: 'shield', amount: 2 }] },
  { id: 'barnacle_shell', name: 'Barnacle Shell', kind: 'defence', race: 2, fusion: true, stability: 3, defence: 1, text: '{fusion}. {sturdy:1}. {dawn}: {repair:1}.', onTurn: [{ type: 'repair', amount: 1 }] },
  {
    id: 'siphon_tendril',
    name: 'Siphon Tendril',
    kind: 'attack',
    race: 2,
    fusion: true,
    stability: 2,
    text: '{fusion}. {dawn}: {heat:1} per 2 shields you have (up to 3).',
    onTurn: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'shields', per: 2 }, max: 3 }],
  },
  // ---- Ixquor ----
  { id: 'spore_graft', name: 'Spore Graft', kind: 'growth', race: 3, fusion: true, stability: 2, text: '{fusion}. {dawn}: Draw 1.', onTurn: [{ type: 'draw', amount: 1 }] },
];

/** What the Fusion cards cost (energy). */
export const FUSION_COSTS: Record<string, number> = { sunforged_lens: 2, siphon_tendril: 2 };
