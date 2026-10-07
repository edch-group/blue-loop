/**
 * The loop's lasting progress: Stellari petals, grabbed at each wormhole, and what they buy for every run after.
 *
 * A run is one flagship's journey, universe after universe, until it is lost. Petals are banked the moment a
 * wormhole is crossed (they survive the run), and spent between runs on upgrades in four groups: a stronger
 * start, a tougher flagship, unlocks (more races and heroes to begin with), and perks that change a run's rules.
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
  /** Petals for the level after `level`. */
  cost(level: number): number;
}

/** What a player has banked and bought (kept on the account). */
export interface MetaState {
  petals: number;
  upgrades: Record<string, number>;
  /** The most universes crossed in one run, and runs begun. */
  best: number;
  runs: number;
}

export const emptyMeta = (): MetaState => ({ petals: 0, upgrades: {}, best: 0, runs: 0 });

const flat = (n: number) => () => n;
const rising = (base: number, step: number) => (level: number) => base + step * level;

/** The four races there from the start; the rest (and every race's heroes past its first) are unlocked with petals. */
export const STARTING_RACES = [0, 1, 2, 3];

export const META_UPGRADES: MetaUpgrade[] = [
  // A stronger start.
  { id: 'credits', group: 'start', name: 'War chest', text: '+3 credits to start each run.', max: 5, cost: rising(3, 2) },
  { id: 'materials', group: 'start', name: 'Stockpile', text: '+3 materials to start each run.', max: 5, cost: rising(3, 2) },
  { id: 'wisdom', group: 'start', name: 'Old charts', text: '+2 research to start each run.', max: 3, cost: rising(4, 3) },
  { id: 'cards', group: 'start', name: 'Veterans', text: 'One more of your race\'s cards in the starting deck.', max: 3, cost: rising(5, 4) },
  { id: 'pick', group: 'start', name: 'Requisition', text: 'Choose a card to add to the starting deck.', max: 2, cost: rising(6, 6) },
  // A tougher flagship.
  { id: 'hull', group: 'flagship', name: 'Reinforced hull', text: 'The flagship starts with one more hull level.', max: 3, cost: rising(5, 4) },
  { id: 'shields', group: 'flagship', name: 'Shield emitters', text: 'The flagship starts with one more shield level.', max: 2, cost: rising(6, 5) },
  { id: 'walls', group: 'flagship', name: 'Armoured rooms', text: '+1 to every room\'s defence to start with.', max: 2, cost: rising(8, 8) },
  { id: 'march', group: 'flagship', name: 'Fold drive', text: 'One more move a turn, every turn.', max: 1, cost: flat(20) },
  // Run perks.
  { id: 'grace', group: 'perk', name: 'Anchored space', text: 'Regional stability holds one turn longer in every universe.', max: 3, cost: rising(6, 5) },
  { id: 'armory', group: 'perk', name: 'Trade friends', text: 'Armoury cards cost 1 material less.', max: 2, cost: rising(6, 6) },
  { id: 'petals', group: 'perk', name: 'Petal pouch', text: '+20% petals at every wormhole.', max: 3, cost: rising(8, 6) },
  { id: 'salvage', group: 'perk', name: 'Scavengers', text: 'One more card to choose from when salvaging.', max: 1, cost: flat(10) },
  // Unlocks: the other races, and each race's later heroes.
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
  if (meta.petals < u.cost(level)) return `Needs ${u.cost(level)} petals.`;
  return null;
}

/** Buy the next level of an upgrade (a new state; throws if it can't be bought). */
export function buyUpgrade(meta: MetaState, id: string): MetaState {
  const why = buyUpgradeProblem(meta, id);
  if (why) throw new Error(why);
  const level = levelOf(meta, id);
  return { ...meta, petals: meta.petals - metaUpgrade(id)!.cost(level), upgrades: { ...meta.upgrades, [id]: level + 1 } };
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
  credits: number;
  materials: number;
  wisdom: number;
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
}

export function runBonuses(meta: MetaState | null | undefined): RunBonuses {
  const l = (id: string) => (meta ? levelOf(meta, id) : 0);
  return {
    credits: 3 * l('credits'),
    materials: 3 * l('materials'),
    wisdom: 2 * l('wisdom'),
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
  };
}
