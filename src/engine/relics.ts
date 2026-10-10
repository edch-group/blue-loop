/**
 * Relic powers: what a relic found in the campaign does in every battle its faction's flagship fights. Not
 * blessings on the hero's card (gear used to be): they reach across the whole board. Some are always at work
 * (shields at dawn, thicker walls, a Hero who starts in play), some answer what happens (a third attack in a day,
 * a discard pile shuffled back, a rival card burned away), and some are kept for the right moment, once a battle.
 *
 * Each power's strength grows with the relic's rarity (white dwarf, stellar, anomaly).
 */
import type { SlotKind } from './heroes';
import type { Effect } from './types';

export type RelicPower =
  | 'aegis'
  | 'walls'
  | 'edge'
  | 'frost'
  | 'vigour'
  | 'herald'
  | 'firstLight'
  | 'flurry'
  | 'splash'
  | 'recycle'
  | 'recall'
  | 'shift'
  | 'mend'
  | 'gift'
  | 'bounty'
  | 'nova'
  | 'renew'
  | 'coolant'
  | 'starfall'
  | 'overcharge'
  | 'recallTwo'
  | 'duskShift'
  | 'reclaim'
  | 'thorns'
  | 'leech'
  | 'harvest'
  | 'anchor'
  | 'sear'
  | 'devour'
  | 'fortress'
  | 'phoenix'
  | 'paradise';

export interface RelicPowerDef {
  /** Always at work, answering what happens, or kept for the right moment: once a battle, or once a day (a button on the battle's right). */
  kind: 'passive' | 'trigger' | 'once' | 'daily';
  /** Its number, by rarity: white dwarf, stellar, anomaly. */
  amounts: [number, number, number];
  text: (n: number) => string;
  /** A once-a-battle (or once-a-day) power's effects, as its holder calls on it. */
  effects?: (n: number) => Effect[];
  /** Its choices for its holder to make, one after another (Recall 2: two cards back to hand). */
  choices?: (n: number) => { kind: 'recall' | 'shift'; times: number };
}


export const RELIC_POWERS: Record<RelicPower, RelicPowerDef> = {
  aegis: { kind: 'passive', amounts: [2, 3, 4], text: (n) => `Dawn: gain ${n} shields.` },
  walls: { kind: 'passive', amounts: [1, 2, 3], text: (n) => `+${n} defence (all slots).` },
  edge: { kind: 'passive', amounts: [1, 2, 3], text: (n) => `+${n} attack.` },
  frost: { kind: 'passive', amounts: [1, 2, 3], text: (n) => `+${n} cooling.` },
  vigour: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `+${n} stability.` },
  herald: { kind: 'passive', amounts: [1, 1, 1], text: () => 'Hero starts on your board.' },
  firstLight: { kind: 'passive', amounts: [2, 3, 4], text: (n) => `Draw ${n} additional cards on day 1.` },
  flurry: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `When you attack with 3 cards in one turn, deal ${n} heat to any target.` },
  splash: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Splash damage: attacks deal ${n} heat either side of the target.` },
  recycle: { kind: 'trigger', amounts: [4, 5, 6], text: (n) => `Every time you recycle your discard pile, deal ${n} heat to any target.` },
  recall: { kind: 'daily', amounts: [1, 1, 1], text: () => 'Once per day: Recall 1.', effects: () => [], choices: () => ({ kind: 'recall', times: 1 }) },
  shift: { kind: 'daily', amounts: [1, 1, 1], text: () => 'Once per day: Shift 1.', effects: () => [], choices: () => ({ kind: 'shift', times: 1 }) },
  mend: { kind: 'trigger', amounts: [2, 3, 4], text: (n) => `Dawn: Repair ${n}.` },
  gift: { kind: 'trigger', amounts: [1, 2, 3], text: () => 'Dawn: add a random card to your hand.' },
  bounty: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `Each rival card you destroy: cool ${n}.` },
  nova: { kind: 'once', amounts: [2, 2, 3], text: (n) => `Once per battle: deal ${n} heat to each card in your opponent's tableau.`, effects: (n) => [{ type: 'strikeAll', amount: n }] },
  renew: { kind: 'once', amounts: [2, 3, 4], text: (n) => `Once per battle: renew ${n}.`, effects: (n) => [{ type: 'restore', amount: n, all: true }] },
  coolant: { kind: 'once', amounts: [4, 5, 6], text: (n) => `Once per battle: cool ${n}.`, effects: (n) => [{ type: 'cool', amount: n }] },
  // (Not a flat blow, which there'd be no reason to hold back: the more of your cards held back from attacking today,
  // the harder it falls. Fired early it's small; saved for a day your board stays home, it can end the battle.)
  starfall: { kind: 'once', amounts: [1, 2, 3], text: (n) => `Once per battle: deal ${n} heat to the rival's sun, +2 for each of your cards that hasn't attacked this turn.`, effects: (n) => [{ type: 'heat', amount: n, to: 'target', plus: { of: 'rested', per: 0.5 } }] },
  overcharge: { kind: 'once', amounts: [2, 2, 3], text: (n) => `Once per battle: +${n} energy.`, effects: (n) => [{ type: 'plays', amount: n }] },
  recallTwo: { kind: 'once', amounts: [2, 2, 2], text: (n) => `Once per battle: recall ${n}.`, effects: () => [], choices: (n) => ({ kind: 'recall', times: n }) },
  duskShift: { kind: 'daily', amounts: [1, 1, 1], text: () => 'Once per day: Shift 1.', effects: () => [], choices: () => ({ kind: 'shift', times: 1 }) },
  reclaim: { kind: 'trigger', amounts: [1, 1, 1], text: (n) => `Cards in your discard pile can be played for +${n} energy.` },
  thorns: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `Your cards hit back for +${n}.` },
  leech: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Attacking the rival's sun cools yours by ${n}.` },
  harvest: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Play 3 cards in one turn: draw ${n}.` },
  anchor: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `Your Guards have +${n} defence.` },
  sear: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Dawn: deal ${n} heat to the rival card with the most attack.` },
  devour: { kind: 'once', amounts: [1, 1, 1], text: () => 'Once per battle: destroy the rival card with the least stability.', effects: () => [{ type: 'devour' }] },
  fortress: { kind: 'once', amounts: [2, 3, 4], text: (n) => `Once per battle: your best-defended card gains +${n} defence and Guard.`, effects: (n) => [{ type: 'fortify', amount: n, who: 'best' }] },
  paradise: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Your dead planet becomes a paradise planet, providing renew ${n} each turn it faces you.` },
  phoenix: { kind: 'once', amounts: [1, 1, 1], text: () => 'Once per battle: return your last discarded card to your hand.', effects: () => [{ type: 'recover', latest: true }] },
};

/** The powers a relic of each kind can carry (its slot's flavour: a weapon strikes, a core cools...). */
export const SLOT_POWERS: Record<SlotKind, RelicPower[]> = {
  weapon: ['edge', 'splash', 'flurry', 'starfall', 'leech'],
  helm: ['walls', 'vigour', 'herald', 'anchor'],
  mantle: ['aegis', 'renew', 'walls', 'fortress'],
  sigil: ['herald', 'firstLight', 'overcharge', 'harvest'],
  core: ['frost', 'coolant', 'bounty', 'phoenix'],
  facet: ['splash', 'nova', 'bounty', 'sear'],
  ring: ['mend', 'vigour', 'aegis', 'thorns'],
  carapace: ['walls', 'vigour', 'renew', 'thorns'],
  gland: ['gift', 'recycle', 'renew', 'reclaim', 'paradise'],
  mask: ['flurry', 'recall', 'bounty', 'devour'],
  plate: ['walls', 'aegis', 'mend', 'anchor'],
  star: ['shift', 'firstLight', 'gift', 'duskShift', 'paradise'],
  ember: ['nova', 'recycle', 'starfall', 'sear'],
};

/** Every power (a relic's roll falls on its kind's own half the time, else on any power at all). */
export const ALL_POWERS = Object.keys(RELIC_POWERS) as RelicPower[];

/** The power a relic of a kind carries, by its roll (0–1). */
export function rollPower(slot: SlotKind, roll: number): RelicPower {
  const own = SLOT_POWERS[slot];
  return roll < 0.5 ? own[Math.floor((roll / 0.5) * own.length) % own.length] : ALL_POWERS[Math.floor(((roll - 0.5) / 0.5) * ALL_POWERS.length) % ALL_POWERS.length];
}

/** A relic's power as a side carries it into battle: which, how strong, and the relic's name (for the log). */
export interface RelicInPlay {
  power: RelicPower;
  n: number;
  name: string;
}

/** How much of a power a side has (summed over its relics: two relics of the same power add up). */
export const relicN = (relics: RelicInPlay[] | undefined, power: RelicPower) => (relics ?? []).reduce((t, r) => t + (r.power === power ? r.n : 0), 0);

/** The first relic of a power a side carries (for its name in the log). */
export const relicOf = (relics: RelicInPlay[] | undefined, power: RelicPower) => (relics ?? []).find((r) => r.power === power);
