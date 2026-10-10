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
  | 'overcharge';

export interface RelicPowerDef {
  /** Always at work, answering what happens, or kept for once a battle (a button on the battle's right). */
  kind: 'passive' | 'trigger' | 'once';
  /** Its number, by rarity: white dwarf, stellar, anomaly. */
  amounts: [number, number, number];
  text: (n: number) => string;
  /** A once-a-battle power's effects, as its holder calls on it. */
  effects?: (n: number) => Effect[];
}

const s = (n: number) => (n === 1 ? '' : 's');

export const RELIC_POWERS: Record<RelicPower, RelicPowerDef> = {
  aegis: { kind: 'passive', amounts: [2, 3, 4], text: (n) => `Dawn: ${n} shields on your sun.` },
  walls: { kind: 'passive', amounts: [1, 2, 3], text: (n) => `+${n} defence on every slot of your tableau.` },
  edge: { kind: 'passive', amounts: [1, 2, 3], text: (n) => `+${n} attack for each of your armed cards.` },
  frost: { kind: 'passive', amounts: [1, 2, 3], text: (n) => `Dawn: cool ${n}.` },
  vigour: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `Every card you put into play has +${n} stability.` },
  herald: { kind: 'passive', amounts: [1, 1, 1], text: () => 'Your Hero starts every battle in play.' },
  firstLight: { kind: 'passive', amounts: [2, 3, 4], text: (n) => `Draw ${n} more card${s(n)} for your first day.` },
  flurry: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `The third time you attack in a day: ${n} heat to the rival card it would burn away, else their sun.` },
  splash: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Your attacks on a card deal ${n} heat to the cards either side of it too.` },
  recycle: { kind: 'trigger', amounts: [4, 5, 6], text: (n) => `Each time your discard pile is shuffled back into your deck: ${n} heat to the rival card it would burn away, else their sun.` },
  recall: { kind: 'trigger', amounts: [1, 1, 1], text: () => 'Dawn: Recall 1 (one of your cards back to your hand, or let it be).' },
  shift: { kind: 'trigger', amounts: [1, 1, 1], text: () => 'Dawn: Shift 1 (move one of your cards to another slot, or let it be).' },
  mend: { kind: 'trigger', amounts: [2, 3, 4], text: (n) => `Dawn: repair ${n} (worn defence mended).` },
  gift: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `Dawn: a random ${n === 1 ? 'white dwarf card' : n === 2 ? 'white dwarf or stellar card' : 'card'} of your race into your hand.` },
  bounty: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `Each rival card you burn away: cool ${n}.` },
  nova: { kind: 'once', amounts: [2, 2, 3], text: (n) => `Once a battle: ${n} heat to every rival card.`, effects: (n) => [{ type: 'strikeAll', amount: n }] },
  renew: { kind: 'once', amounts: [2, 3, 4], text: (n) => `Once a battle: your cards regain ${n} stability.`, effects: (n) => [{ type: 'restore', amount: n, all: true }] },
  coolant: { kind: 'once', amounts: [4, 5, 6], text: (n) => `Once a battle: cool ${n}.`, effects: (n) => [{ type: 'cool', amount: n }] },
  // (Not a flat blow, which there'd be no reason to hold back: the more of your cards held back from attacking today,
  // the harder it falls. Fired early it's small; saved for a day your board stays home, it can end the battle.)
  starfall: { kind: 'once', amounts: [1, 2, 3], text: (n) => `Once a battle: ${n} heat to the rival's sun, and 2 more for each of your cards that hasn't attacked today.`, effects: (n) => [{ type: 'heat', amount: n, to: 'target', plus: { of: 'rested', per: 0.5 } }] },
  overcharge: { kind: 'once', amounts: [2, 2, 3], text: (n) => `Once a battle: +${n} energy today.`, effects: (n) => [{ type: 'plays', amount: n }] },
};

/** The powers a relic of each kind can carry (its slot's flavour: a weapon strikes, a core cools...). */
export const SLOT_POWERS: Record<SlotKind, RelicPower[]> = {
  weapon: ['edge', 'splash', 'flurry', 'starfall'],
  helm: ['walls', 'vigour', 'herald'],
  mantle: ['aegis', 'renew', 'walls'],
  sigil: ['herald', 'firstLight', 'overcharge'],
  core: ['frost', 'coolant', 'bounty'],
  facet: ['splash', 'nova', 'bounty'],
  ring: ['mend', 'vigour', 'aegis'],
  carapace: ['walls', 'vigour', 'renew'],
  gland: ['gift', 'recycle', 'renew'],
  mask: ['flurry', 'recall', 'bounty'],
  plate: ['walls', 'aegis', 'mend'],
  star: ['shift', 'firstLight', 'gift'],
  ember: ['nova', 'recycle', 'starfall'],
};

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
