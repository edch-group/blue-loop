/**
 * The loop's lasting progress, in two currencies, both kept for every run after.
 *
 * Experience (XP) is earned by everything a run does (battles won, systems taken, challenges cleared, galaxies
 * crossed, bosses beaten), win or lose, so every run moves the player on. It buys the skill tree: three branches
 * (a stronger start, a tougher flagship, run perks), each a tier of upgrades bought level by level, unlocking the
 * next tier up, to a capstone.
 *
 * Stellari petals are grabbed at wormholes and from beaten Overlords. They unlock races and heroes, and buy cards
 * into a race's starting deck for good.
 */

import { GENERALS } from './story';

export type MetaGroup = 'start' | 'flagship' | 'unlock' | 'perk';

export interface MetaUpgrade {
  id: string;
  group: MetaGroup;
  name: string;
  /** What the next level gives (or, at the most, what it gives now). */
  text: string;
  /** Levels it can be bought to. */
  max: number;
  /** The price of the level after `level` (in XP for the skill tree, petals for unlocks). */
  cost(level: number): number;
  /** Its tier in its branch (1, 2, then the capstone, 3). */
  tier?: number;
  /** What must be bought first: other upgrades, each to a level. */
  requires?: [string, number][];
}

/** What an upgrade is bought with. */
export const currencyOf = (u: MetaUpgrade): 'xp' | 'petals' => (u.group === 'unlock' ? 'petals' : 'xp');

/** What a player has banked and bought (kept on the account). */
export interface MetaState {
  petals: number;
  /** Experience banked, to spend on the skill tree. */
  xp: number;
  upgrades: Record<string, number>;
  /** Cards bought (with petals) into each race's starting deck, by race. */
  deck: Record<string, string[]>;
  /** The most universes crossed in one run, and runs begun. */
  best: number;
  runs: number;
}

export const emptyMeta = (): MetaState => ({ petals: 0, xp: 0, upgrades: {}, deck: {}, best: 0, runs: 0 });

const flat = (n: number) => () => n;
const rising = (base: number, step: number) => (level: number) => base + step * level;

/** The four races there from the start; the rest (and every race's heroes past its first) are unlocked with petals. */
export const STARTING_RACES = [0, 1, 2, 3];

export const META_UPGRADES: MetaUpgrade[] = [
  // A stronger start.
  { id: 'materials', group: 'start', tier: 1, name: 'Stockpile', text: '+3 materials to start each run.', max: 3, cost: rising(20, 15) },
  { id: 'cards', group: 'start', tier: 2, requires: [['materials', 1]], name: 'Veterans', text: "One more of your race's cards in the starting deck.", max: 2, cost: rising(45, 35) },
  { id: 'pick', group: 'start', tier: 2, requires: [['materials', 2]], name: 'Requisition', text: 'Choose a card to add to the starting deck.', max: 2, cost: rising(50, 40) },
  { id: 'hoard', group: 'start', tier: 3, requires: [['cards', 1], ['pick', 1]], name: "Founders' Hoard", text: '+6 materials whenever the flagship enters a new galaxy.', max: 1, cost: flat(160) },
  // A tougher flagship.
  { id: 'hull', group: 'flagship', tier: 1, name: 'Reinforced hull', text: 'The flagship starts with one more hull level.', max: 3, cost: rising(20, 15) },
  { id: 'shields', group: 'flagship', tier: 2, requires: [['hull', 1]], name: 'Shield emitters', text: 'The flagship starts with one more shield level.', max: 2, cost: rising(45, 35) },
  { id: 'walls', group: 'flagship', tier: 2, requires: [['hull', 2]], name: 'Armoured rooms', text: "+1 to every room's defence to start with.", max: 2, cost: rising(50, 40) },
  { id: 'march', group: 'flagship', tier: 3, requires: [['shields', 1], ['walls', 1]], name: 'Fold drive', text: 'One more move a turn, every turn.', max: 1, cost: flat(180) },
  // Run perks.
  { id: 'grace', group: 'perk', tier: 1, name: 'Anchored space', text: 'Regional stability holds one turn longer in every galaxy.', max: 3, cost: rising(20, 15) },
  { id: 'armory', group: 'perk', tier: 2, requires: [['grace', 1]], name: 'Trade friends', text: 'Armoury cards cost 1 material less.', max: 2, cost: rising(40, 30) },
  { id: 'petals', group: 'perk', tier: 2, requires: [['grace', 1]], name: 'Petal pouch', text: '+20% petals at every wormhole.', max: 3, cost: rising(40, 20) },
  { id: 'salvage', group: 'perk', tier: 2, requires: [['grace', 2]], name: 'Scavengers', text: 'One more card to choose from when salvaging.', max: 1, cost: flat(60) },
  { id: 'favour', group: 'perk', tier: 3, requires: [['armory', 1], ['salvage', 1]], name: "Stellari's Favour", text: "After every battle the flagship wins, its sun cools by 3.", max: 1, cost: flat(170) },
  // Unlocks (petals): the other races, and each race's later heroes.
  ...[4, 5, 6, 7].map((race) => ({ id: `race:${race}`, group: 'unlock' as const, name: '', text: '', max: 1, cost: flat(10) })),
  ...GENERALS.flatMap((heroes) => heroes.slice(1).map((hero) => ({ id: `hero:${hero}`, group: 'unlock' as const, name: '', text: '', max: 1, cost: flat(6) }))),
];

export function metaUpgrade(id: string): MetaUpgrade | undefined {
  return META_UPGRADES.find((u) => u.id === id);
}

export const levelOf = (meta: MetaState, id: string) => meta.upgrades[id] ?? 0;

/** Why an upgrade can't be bought now (null if it can). */
export function buyUpgradeProblem(meta: MetaState, id: string): string | null {
  const u = metaUpgrade(id);
  if (!u) return 'No such upgrade.';
  const level = levelOf(meta, id);
  if (level >= u.max) return 'Already at its most.';
  const missing = (u.requires ?? []).find(([r, n]) => levelOf(meta, r) < n);
  if (missing) return `Needs ${metaUpgrade(missing[0])?.name ?? missing[0]} ${'I'.repeat(missing[1])} first.`;
  const price = u.cost(level);
  if (currencyOf(u) === 'xp' ? (meta.xp ?? 0) < price : meta.petals < price) return `Needs ${price} ${currencyOf(u) === 'xp' ? 'XP' : 'petals'}.`;
  return null;
}

/** Whether an upgrade's prerequisites are all bought (it can be bought, given the price). */
export const upgradeOpen = (meta: MetaState, id: string) => (metaUpgrade(id)?.requires ?? []).every(([r, n]) => levelOf(meta, r) >= n);

/** Buy the next level of an upgrade (a new state; throws if it can't be bought). */
export function buyUpgrade(meta: MetaState, id: string): MetaState {
  const why = buyUpgradeProblem(meta, id);
  if (why) throw new Error(why);
  const level = levelOf(meta, id);
  const u = metaUpgrade(id)!;
  const price = u.cost(level);
  const paid = currencyOf(u) === 'xp' ? { xp: (meta.xp ?? 0) - price } : { petals: meta.petals - price };
  return { ...meta, ...paid, upgrades: { ...meta.upgrades, [id]: level + 1 } };
}

export function raceUnlocked(meta: MetaState, race: number): boolean {
  return STARTING_RACES.includes(race) || levelOf(meta, `race:${race}`) > 0;
}

/** A race's first hero is free; its others are unlocked with petals. */
export function heroUnlocked(meta: MetaState, hero: string): boolean {
  return GENERALS.some((h) => h[0] === hero) || levelOf(meta, `hero:${hero}`) > 0;
}

/** What a run begins with, and the rules it is played under, from the upgrades bought. */
export interface RunBonuses {
  materials: number;
  /** Extra race cards in the starting deck, and card picks to add to it. */
  cards: number;
  picks: number;
  hull: number;
  shields: number;
  walls: number;
  march: number;
  /** Extra turns of regional stability in every universe. */
  grace: number;
  armoryDiscount: number;
  /** Share more petals at each wormhole (0.2 a level). */
  petalBonus: number;
  salvage: number;
  /** Materials whenever the flagship enters a new galaxy (Founders' Hoard). */
  hoard: number;
  /** How much the flagship's sun cools after every battle it wins (Stellari's Favour). */
  favour: number;
  /** Cards bought into the starting deck (for the run's race). */
  deck: string[];
}

/** Starter cards: how many can be bought into one race's starting deck, and what each costs in petals. */
export const STARTER_ADDS_MAX = 6;
export const starterCardPrice = (rarity: string | undefined) => (rarity === 'anomaly' ? 14 : rarity === 'stellar' ? 8 : 4);

/** Why this card can't be bought into this race's starting deck now (null if it can). */
export function starterAddProblem(meta: MetaState, race: number, defId: string, rarity: string | undefined): string | null {
  const have = meta.deck?.[race] ?? [];
  if (have.length >= STARTER_ADDS_MAX) return `At most ${STARTER_ADDS_MAX} cards bought into a starting deck.`;
  if (meta.petals < starterCardPrice(rarity)) return `Needs ${starterCardPrice(rarity)} petals.`;
  void defId;
  return null;
}

/** Buy a card into a race's starting deck for good (a new state; throws if it can't be bought). */
export function buyStarterCard(meta: MetaState, race: number, defId: string, rarity: string | undefined): MetaState {
  const why = starterAddProblem(meta, race, defId, rarity);
  if (why) throw new Error(why);
  return { ...meta, petals: meta.petals - starterCardPrice(rarity), deck: { ...meta.deck, [race]: [...(meta.deck?.[race] ?? []), defId] } };
}

/** Take a bought card back out of a race's starting deck (its petals are not returned). */
export function removeStarterCard(meta: MetaState, race: number, index: number): MetaState {
  const have = [...(meta.deck?.[race] ?? [])];
  have.splice(index, 1);
  return { ...meta, deck: { ...meta.deck, [race]: have } };
}

export function runBonuses(meta: MetaState | null | undefined, race?: number): RunBonuses {
  // (A level bought before a skill's most was lowered counts only up to its most now.)
  const l = (id: string) => (meta ? Math.min(levelOf(meta, id), metaUpgrade(id)?.max ?? 0) : 0);
  return {
    materials: 3 * l('materials'),
    cards: l('cards'),
    picks: l('pick'),
    hull: l('hull'),
    shields: l('shields'),
    walls: l('walls'),
    march: l('march'),
    grace: l('grace'),
    armoryDiscount: l('armory'),
    petalBonus: 0.2 * l('petals'),
    salvage: l('salvage'),
    hoard: 6 * l('hoard'),
    favour: 3 * l('favour'),
    deck: meta && race !== undefined ? [...(meta.deck?.[race] ?? [])] : [],
  };
}
