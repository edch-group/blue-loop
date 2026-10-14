/**
 * Relic powers: what a relic found in the campaign does in every battle its faction's flagship fights. Not
 * blessings on the hero's card (gear used to be): they reach across the whole board. Some are always at work
 * (shields at dawn, thicker walls, a Hero who starts in play), some answer what happens (a third attack in a day,
 * a discard pile shuffled back, a rival card burned away), and some are kept for the right moment, once a battle.
 *
 * Each power's strength grows with the relic's rarity (white dwarf, stellar, anomaly).
 */
import type { SlotKind } from './heroes';
import type { AbilityChoice, Effect } from './types';

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
  | 'paradise'
  | 'grasp'
  | 'ram'
  | 'might'
  | 'steady'
  | 'multishot'
  | 'ward'
  | 'freeze'
  | 'displace'
  | 'bargain'
  | 'echo'
  | 'orbitShift'
  | 'starsworn';

export interface RelicPowerDef {
  /** Always at work, answering what happens, or kept for the right moment: once a battle, or once a day (a button on the battle's right). */
  /** (`ability`: one more ability for the Hero leading its holder's tableau, used as its own are, one a day.) */
  kind: 'passive' | 'trigger' | 'once' | 'daily' | 'ability';
  /** Its number, by rarity: white dwarf, stellar, anomaly. */
  amounts: [number, number, number];
  text: (n: number) => string;
  /** A once-a-battle (or once-a-day) power's effects, as its holder calls on it. */
  effects?: (n: number) => Effect[];
  /** Its choices for its holder to make, one after another (Recall 2: two cards back to hand). */
  choices?: (n: number) => { kind: 'recall' | 'shift'; times: number };
  /** A Hero ability's name, and the choice it leaves its holder to make. */
  ability?: (n: number) => { name: string; text: string; choice: { kind: AbilityChoice; times: number; amount?: number } };
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
  recycle: { kind: 'trigger', amounts: [4, 5, 6], text: (n) => `Every time your reserves are shuffled back into your deck, deal ${n} heat to any target.` },
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
  reclaim: { kind: 'trigger', amounts: [1, 1, 1], text: (n) => `Cards in your reserves can be played for +${n} energy.` },
  thorns: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `Your cards hit back for +${n}.` },
  leech: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Attacking the rival's sun cools yours by ${n}.` },
  harvest: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Play 3 cards in one turn: draw ${n}.` },
  anchor: { kind: 'trigger', amounts: [1, 2, 3], text: (n) => `Your Guards have +${n} defence.` },
  sear: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Dawn: deal ${n} heat to the rival card with the most attack.` },
  devour: { kind: 'once', amounts: [1, 1, 1], text: () => 'Once per battle: destroy the rival card with the least stability.', effects: () => [{ type: 'devour' }] },
  fortress: { kind: 'once', amounts: [2, 3, 4], text: (n) => `Once per battle: your best-defended card gains +${n} defence and Guard.`, effects: (n) => [{ type: 'fortify', amount: n, who: 'best' }] },
  paradise: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `Your dead planet becomes a paradise planet, providing renew ${n} each turn it faces you.` },
  grasp: { kind: 'trigger', amounts: [1, 1, 2], text: (n) => `+${n} hand size.` },
  // (Walls that hit back: a card's defence, while it stands, adds to its attack, up to the emblem's number. Only a card
  // that attacks at all: a wall with none still doesn't.)
  ram: { kind: 'trigger', amounts: [2, 3, 4], text: (n) => `Your attackers add their defence to their attack (up to +${n}).` },
  // Hero abilities: the Hero leading its holder's tableau may use one of these as one of its own (one a day).
  // (Not free [direction: no downside, no thought in whether to use it before attacking]: the card burns its own
  // stability for the attack, so it is worth it only on a card that will strike with it before it would fall.)
  might: { kind: 'ability', amounts: [1, 1, 2], text: (n) => `Hero ability: a card gains +${n} attack and loses ${n} stability.`, ability: (n) => ({ name: 'Overdrive', text: `+${n} attack to a card; it loses ${n} stability.`, choice: { kind: 'empower', times: 1, amount: n } }) },
  steady: { kind: 'ability', amounts: [2, 3, 4], text: (n) => `Hero ability: a card gains ${n} stability.`, ability: (n) => ({ name: 'Steady', text: `${n} stability to a card.`, choice: { kind: 'renew', times: 1, amount: n } }) },
  multishot: { kind: 'ability', amounts: [3, 3, 3], text: (n) => `Hero ability: Multishot, ${n} heat split among up to ${n} targets.`, ability: (n) => ({ name: 'Multishot', text: `${n} heat, split among up to ${n} targets.`, choice: { kind: 'aim', times: n, amount: 1 } }) },
  ward: { kind: 'ability', amounts: [2, 2, 3], text: (n) => `Hero ability: a card gains ${n} shields.`, ability: (n) => ({ name: 'Ward', text: `${n} shields to a card.`, choice: { kind: 'ward', times: 1, amount: n } }) },
  freeze: { kind: 'ability', amounts: [1, 1, 1], text: () => "Hero ability: a rival card can't attack next turn.", ability: () => ({ name: 'Freeze', text: "A rival card can't attack next turn.", choice: { kind: 'freeze', times: 1 } }) },
  displace: { kind: 'ability', amounts: [1, 1, 1], text: () => 'Hero ability: shift a rival card.', ability: () => ({ name: 'Displace', text: 'Shift a rival card.', choice: { kind: 'displace', times: 1 } }) },
  bargain: { kind: 'ability', amounts: [2, 2, 3], text: (n) => `Hero ability: a card in your hand costs ${n} less.`, ability: (n) => ({ name: 'Bargain', text: `A card in hand costs ${n} less.`, choice: { kind: 'discount', times: 1, amount: n } }) },
  // (A card played may come into play as a random Hero of any race, in its slot, and turn back as it leaves.)
  echo: { kind: 'trigger', amounts: [10, 10, 10], text: (n) => `Cards you play have a ${n}% chance to become a random Hero while in play.` },
  // The Seren's emblems, granted by Aster alone (never rolled) [direction: Aster grants 1 of 3 Seren emblems: the
  // paradise planet, orbit +3, your Hero gains attunement 3].
  orbitShift: { kind: 'trigger', amounts: [1, 1, 1], text: (n) => `Your orbit +${n} as each battle begins.` },
  starsworn: { kind: 'trigger', amounts: [3, 3, 3], text: (n) => `Your Hero gains Attunement ${n}.` },
  phoenix: { kind: 'once', amounts: [1, 1, 1], text: () => 'Once per battle: return your last discarded card to your hand.', effects: () => [{ type: 'recover', latest: true }] },
};

/** The powers a relic of each kind can carry (its slot's flavour: a weapon strikes, a core cools...). */
export const SLOT_POWERS: Record<SlotKind, RelicPower[]> = {
  weapon: ['edge', 'splash', 'flurry', 'starfall', 'leech', 'ram', 'might', 'multishot'],
  helm: ['walls', 'vigour', 'herald', 'anchor', 'ward'],
  mantle: ['aegis', 'renew', 'walls', 'fortress', 'ward'],
  sigil: ['herald', 'firstLight', 'overcharge', 'harvest', 'grasp', 'might', 'bargain', 'echo'],
  core: ['frost', 'coolant', 'bounty', 'phoenix', 'freeze'],
  facet: ['splash', 'nova', 'bounty', 'sear', 'multishot'],
  ring: ['mend', 'vigour', 'aegis', 'thorns', 'steady'],
  carapace: ['walls', 'vigour', 'renew', 'thorns', 'ram', 'steady'],
  gland: ['gift', 'recycle', 'renew', 'reclaim', 'steady', 'bargain'],
  mask: ['flurry', 'recall', 'bounty', 'devour', 'freeze', 'displace'],
  plate: ['walls', 'aegis', 'mend', 'anchor', 'ward'],
  star: ['shift', 'firstLight', 'gift', 'duskShift', 'grasp', 'displace', 'echo'],
  ember: ['nova', 'recycle', 'starfall', 'sear', 'multishot'],
};

/** Every power (a relic's roll falls on its kind's own half the time, else on any power at all). */
/** The Seren's emblems: Aster's to grant, never found any other way. */
export const SEREN_POWERS: RelicPower[] = ['paradise', 'orbitShift', 'starsworn'];
export const ALL_POWERS = (Object.keys(RELIC_POWERS) as RelicPower[]).filter((p) => !SEREN_POWERS.includes(p));

/**
 * The power a relic of a kind carries, by its roll (0–1): never one already held (`held`), while any other is left
 * (its kind's own if it can, else any).
 */
export function rollPower(slot: SlotKind, roll: number, held: ReadonlySet<RelicPower> = new Set()): RelicPower {
  const own = SLOT_POWERS[slot].filter((p) => !held.has(p));
  const all = ALL_POWERS.filter((p) => !held.has(p));
  const pick = (list: RelicPower[], r: number) => list[Math.floor(r * list.length) % list.length];
  if (!all.length) return pick(SLOT_POWERS[slot], roll);
  if (!own.length) return pick(all, roll);
  return roll < 0.5 ? pick(own, roll / 0.5) : pick(all, (roll - 0.5) / 0.5);
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
