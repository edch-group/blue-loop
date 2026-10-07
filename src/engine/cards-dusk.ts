import type { CardDef, Condition } from './types';

const VIGIL: Condition = { vigil: true };

/**
 * Dusk cards: their effects come at the end of your day, once you have acted (the opposite of dawn). Some
 * count the cards that held back today (not dimmed): a reason to keep an attacker home.
 */
export const DUSK_CARDS: CardDef[] = [
  // ---- Neutral ----
  {
    id: 'twilight_sentry', name: 'Twilight Sentry', kind: 'defence', cost: 2,
    text: '{guard}. {sturdy:1}. {dusk}: {shield:2}.',
    defence: 1, onDusk: [{ type: 'shield', amount: 2 }], passive: [{ type: 'taunt' }],
  },
  {
    id: 'evening_star', name: 'Evening Star', kind: 'growth', cost: 1,
    text: '{dusk}: draw 1.',
    onDusk: [{ type: 'draw', amount: 1 }],
  },
  {
    id: 'gloaming_battery', name: 'Gloaming Battery', kind: 'attack', cost: 2,
    text: '{dusk}: {heat:1} per 2 of your other cards not dimmed (up to 3).',
    onDusk: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'rested', per: 2 }, max: 3 }],
  },
  {
    id: 'vesper_bell', name: 'Vesper Bell', kind: 'defence', cost: 1,
    text: '{dusk}: {cool:1}. {cool:+1} per 2 of your other cards not dimmed (up to 3).',
    onDusk: [{ type: 'cool', amount: 1, plus: { of: 'rested', per: 2 }, max: 3 }],
  },
  // ---- One for each race ----
  {
    id: 'aureline_vesper_knight', name: 'Vesper Knight', kind: 'attack', race: 0, cost: 2, character: true,
    text: '{dusk}: {heat:1}. {heat:+2} with 3+ attack cards.',
    onDusk: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'heat', amount: 2, to: 'target', if: { minKind: 'attack', n: 3 } }],
  },
  {
    id: 'shard_twilight', name: 'Twilight Shard', kind: 'attack', race: 1, cost: 2,
    text: '{dusk}: {heat:1}, {pierce}.',
    onDusk: [{ type: 'heat', amount: 1, to: 'target', pierce: true }],
  },
  {
    id: 'ebb_tide', name: 'Ebb Tide', kind: 'defence', race: 2, cost: 2,
    text: '{dusk}: {shield:2}. {shield:+1} per 3 shields you have (up to 4).',
    onDusk: [{ type: 'shield', amount: 2, plus: { of: 'shields', per: 3 }, max: 4 }],
  },
  {
    id: 'night_bloom', name: 'Night Bloom', kind: 'growth', race: 3, cost: 2,
    text: '{dusk}: {plant:1}.',
    onDusk: [{ type: 'plant', amount: 1 }],
  },
  {
    id: 'nyx_nightfall', name: 'Nightfall', kind: 'attack', race: 4, sub: 'unmaker', cost: 2,
    text: '{dusk}: {heat:2}.',
    onDusk: [{ type: 'heat', amount: 2, to: 'target' }],
  },
  {
    id: 'kor_banked_forge', name: 'Banked Forge', kind: 'growth', race: 5, sub: 'forgeborn', cost: 2,
    text: '{dusk}: {repair:2}. {shield:1}.',
    onDusk: [{ type: 'repair', amount: 2 }, { type: 'shield', amount: 1 }],
  },
  {
    id: 'ser_evening_vigil', name: 'Evening Vigil', kind: 'defence', race: 6, sub: 'seer', cost: 2, character: true,
    text: '{dusk}: {cool:1}. While facing the abundant planet, draw 1.',
    onDusk: [{ type: 'cool', amount: 1 }, { type: 'draw', amount: 1, if: { planet: 'abundant' } }],
  },
  {
    id: 'pyr_banked_embers', name: 'Banked Embers', kind: 'defence', race: 7, sub: 'cinderborn', cost: 1,
    // Banked for the night, stoked again at dawn: the sun runs hot through the Pyrr's own day.
    text: '{dusk}: {cool:2}. {dawn}: {heat:1} to your sun.',
    onTurn: [{ type: 'selfHeat', amount: 1 }],
    onDusk: [{ type: 'cool', amount: 2 }],
  },
  // ---- Vigil: dusk effects for a card that held back today (didn't attack or act). Two for each core race ----
  {
    id: 'aureline_watchkeeper', name: 'Dusk Watchkeeper', kind: 'attack', race: 0, cost: 2, character: true,
    text: '{vigil}: {cool:3}.',
    onDusk: [{ type: 'cool', amount: 3, if: VIGIL }],
  },
  {
    id: 'aureline_sunset_lancer', name: 'Sunset Lancer', kind: 'attack', race: 0, cost: 3, character: true,
    text: '{vigil}: {heat:2}.',
    onDusk: [{ type: 'heat', amount: 2, to: 'target', if: VIGIL }],
  },
  {
    id: 'xelnaru_banked_star', name: 'Banked Star', kind: 'attack', race: 1, cost: 2,
    text: '{vigil}: {heat:2}. {dawn}: {heat:1} to your sun.',
    onTurn: [{ type: 'selfHeat', amount: 1 }], onDusk: [{ type: 'heat', amount: 2, to: 'target', if: VIGIL }],
  },
  {
    id: 'xelnaru_still_flame', name: 'Still Flame', kind: 'attack', race: 1, cost: 3,
    text: '{vigil}: draw 1 and {heat:1} to your sun.',
    onDusk: [{ type: 'draw', amount: 1, if: VIGIL }, { type: 'selfHeat', amount: 1, if: VIGIL }],
  },
  {
    id: 'vorthane_tide_watcher', name: 'Tide Watcher', kind: 'attack', race: 2, cost: 2, character: true,
    text: '{vigil}: {shield:3}.',
    onDusk: [{ type: 'shield', amount: 3, if: VIGIL }],
  },
  {
    id: 'vorthane_undertow', name: 'Deepwatch', kind: 'attack', race: 2, cost: 3,
    text: '{vigil}: {heat:1} per 2 shields you have (up to 4).',
    onDusk: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'shields', per: 2 }, max: 4, if: VIGIL }],
  },
  {
    id: 'ixquor_waiting_brood', name: 'Waiting Brood', kind: 'attack', race: 3, cost: 2,
    text: '{vigil}: {grows:3}, then {heat} equal to its growth.',
    onDusk: [{ type: 'grow', max: 3, if: VIGIL }, { type: 'heat', amount: 0, to: 'target', plus: { of: 'growth' }, if: VIGIL }],
  },
  {
    id: 'ixquor_brood_warden', name: 'Brood Warden', kind: 'attack', race: 3, cost: 3,
    text: '{vigil}: your other cards grow 1.',
    onDusk: [{ type: 'growOthers', if: VIGIL }],
  },
];
