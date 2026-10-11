/**
 * The loop's lasting progress, kept for every run after.
 *
 * Experience (XP) is earned by everything a run does (every battle, won or lost, systems taken, challenges
 * cleared, galaxies crossed, bosses beaten), so every run moves the player on. It is never spent: it raises the
 * commander's level, and every level grants a skill point. Points buy the skill tree: seven branches,
 * one off each petal of the Stellari (a cooler sun, a sharper command, stronger defences, run perks, a stronger
 * start, spoils of war, lasting wisdom), each a tier of upgrades bought level by level, unlocking the next tier up,
 * to a capstone.
 *
 * Stellari petals are grabbed at wormholes and from beaten Overlords. They unlock races and heroes, and buy cards
 * into a race's starting deck for good.
 */

import { GENERALS } from './story';
import type { BattleModifiers } from './types';

export type MetaGroup = 'sun' | 'command' | 'flagship' | 'perk' | 'start' | 'spoils' | 'lore' | 'unlock';

export interface MetaUpgrade {
  id: string;
  group: MetaGroup;
  name: string;
  /** What the next level gives (or, at the most, what it gives now). */
  text: string;
  /** Levels it can be bought to. */
  max: number;
  /**
   * The price of the level after `level`: petals, for unlocks. (For the skill tree, what it once cost in XP, before
   * skills were bought with points: kept to bring older saves up to date. Its price now is in points, pointCost.)
   */
  cost(level: number): number;
  /** Its tier in its branch (1, 2, then the capstone, 3). */
  tier?: number;
  /** What must be bought first: other upgrades, each to a level. */
  requires?: [string, number][];
}

/** What an upgrade is bought with: skill points, or petals (unlocks). */
export const currencyOf = (u: MetaUpgrade): 'points' | 'petals' => (u.group === 'unlock' ? 'petals' : 'points');

/** A skill's price in points, every level of it: its tier (1, 2, or 3 for a capstone). */
export const pointCost = (u: MetaUpgrade) => u.tier ?? 1;

/** An upgrade's next level's price, in its own currency. */
export const priceOf = (u: MetaUpgrade, level: number) => (currencyOf(u) === 'points' ? pointCost(u) : u.cost(level));

/** The experience to rise from a level to the next: a little more each level. */
export const commanderXpToNext = (level: number) => 25 + level;

/** The commander's level for the experience earned in all: the level, the experience into it, and what it needs. */
export function levelFor(xp: number): { level: number; into: number; need: number } {
  let level = 1, left = Math.max(0, Math.floor(xp));
  while (left >= commanderXpToNext(level)) {
    left -= commanderXpToNext(level);
    level++;
  }
  return { level, into: left, need: commanderXpToNext(level) };
}

/** The experience it takes, in all, to reach a level. */
export const xpForLevel = (level: number) => Array.from({ length: Math.max(0, level - 1) }, (_, i) => commanderXpToNext(i + 1)).reduce((t, n) => t + n, 0);

/** Points spent on the skill tree. */
export const pointsSpent = (meta: MetaState) =>
  META_UPGRADES.filter((u) => currencyOf(u) === 'points').reduce((t, u) => t + pointCost(u) * (meta.upgrades[u.id] ?? 0), 0);

/** Skill points to spend: one for every level past the first, less those spent. */
export const pointsLeft = (meta: MetaState) => levelFor(meta.xp ?? 0).level - 1 - pointsSpent(meta);

/** What a player has banked and bought (kept on the account). */
export interface MetaState {
  petals: number;
  /** Experience earned in all, every run (never spent: it makes the commander's level). */
  xp: number;
  /** 2: skills are bought with points (before, XP was spent on them: see migrateMeta). */
  v?: number;
  upgrades: Record<string, number>;
  /** Cards bought (with petals) into each race's starting deck, by race. */
  deck: Record<string, string[]>;
  /** Starter cards bought for good, by race: one taken out of the deck goes back in for nothing. */
  owned?: Record<string, string[]>;
  /** The most universes crossed in one run, and runs begun. */
  best: number;
  runs: number;
}

export const emptyMeta = (): MetaState => ({ petals: 0, xp: 0, upgrades: {}, deck: {}, best: 0, runs: 0, v: 2 });

const flat = (n: number) => () => n;
const rising = (base: number, step: number) => (level: number) => base + step * level;

/** The four races there from the start; the rest (and every race's heroes past its first) are unlocked with petals. */
export const STARTING_RACES = [0, 1, 2, 3];

export const META_UPGRADES: MetaUpgrade[] = [
  // A stronger start: what every run begins with.
  { id: 'materials', group: 'start', tier: 1, name: 'Stockpile', text: '+3 materials to start each run.', max: 3, cost: rising(20, 15) },
  { id: 'cards', group: 'start', tier: 2, requires: [['materials', 1]], name: 'Veterans', text: "One more of your race's cards in the starting deck.", max: 2, cost: rising(45, 35) },
  { id: 'pick', group: 'start', tier: 2, requires: [['materials', 2]], name: 'Requisition', text: 'Choose a card to add to the starting deck.', max: 2, cost: rising(50, 40) },
  { id: 'heirloom', group: 'start', tier: 3, requires: [['cards', 1], ['pick', 1]], name: 'Heirloom', text: 'Start each run with a random Stellar emblem.', max: 1, cost: flat(160) },
  // Stronger defences: your shields and walls in battle.
  { id: 'walls', group: 'flagship', tier: 1, name: 'Armoured slots', text: '+1 defence on every slot of your tableau.', max: 2, cost: rising(20, 15) },
  { id: 'shields', group: 'flagship', tier: 2, requires: [['walls', 1]], name: 'Shield emitters', text: 'Your sun starts every battle with +1 shield.', max: 2, cost: rising(45, 35) },
  { id: 'bastion', group: 'flagship', tier: 2, requires: [['walls', 2]], name: 'Bastion', text: 'Your Guards have +2 defence in battle.', max: 1, cost: flat(90) },
  { id: 'mantle', group: 'flagship', tier: 3, requires: [['shields', 1], ['bastion', 1]], name: 'Halo mantle', text: '+1 shield on your sun every day of battle.', max: 1, cost: flat(180) },
  // The long road: time and trade on the map.
  { id: 'grace', group: 'perk', tier: 1, name: 'Anchored space', text: 'Regional stability holds one turn longer in every galaxy.', max: 3, cost: rising(20, 15) },
  { id: 'armory', group: 'perk', tier: 2, requires: [['grace', 1]], name: 'Trade friends', text: 'Space station cards cost 1 material less.', max: 2, cost: rising(40, 30) },
  { id: 'hoard', group: 'perk', tier: 2, requires: [['grace', 2]], name: "Founders' Hoard", text: '+6 materials whenever you enter a new galaxy.', max: 1, cost: flat(60) },
  { id: 'stock', group: 'perk', tier: 3, requires: [['armory', 1], ['hoard', 1]], name: 'Quartermaster', text: 'Every space station stocks 3 more cards.', max: 1, cost: flat(170) },
  // A cooler sun: its heat and health.
  { id: 'cryo', group: 'sun', tier: 1, name: 'Cryo core', text: 'Your sun starts every battle 1 cooler.', max: 3, cost: rising(20, 15) },
  { id: 'plating', group: 'sun', tier: 2, requires: [['cryo', 1]], name: 'Stellar plating', text: '+2 max health on your sun in battle.', max: 2, cost: rising(45, 35) },
  { id: 'mend', group: 'sun', tier: 2, requires: [['cryo', 2]], name: 'Field cooling', text: 'Your sun cools by 1 with each jump.', max: 2, cost: rising(50, 40) },
  { id: 'favour', group: 'sun', tier: 3, requires: [['plating', 1], ['mend', 1]], name: "Stellari's Favour", text: 'Your sun cools by 3 after every battle won.', max: 1, cost: flat(180) },
  // Kinder planets [direction: skills that upgrade the planets, rather than straight draws or energy].
  { id: 'abundance', group: 'command', tier: 1, name: 'Fertile orbit', text: 'The abundant planet draws 1 more card each day it faces your sun.', max: 2, cost: rising(25, 25) },
  { id: 'foundry', group: 'command', tier: 2, requires: [['abundance', 1]], name: 'Deep foundries', text: 'The industrial planet gives 1 more energy each day it faces your sun.', max: 1, cost: flat(90) },
  { id: 'coldworld', group: 'command', tier: 2, requires: [['abundance', 2]], name: 'Cold world', text: 'The dead planet cools your sun by 2 each dawn it faces it.', max: 1, cost: flat(90) },
  { id: 'aligned', group: 'command', tier: 3, requires: [['foundry', 1], ['coldworld', 1]], name: 'Aligned worlds', text: 'Every planet gives more again: +1 card, +1 energy, 2 more cooling.', max: 1, cost: flat(200) },
  // Spoils of war: what a battle won leaves you.
  { id: 'scouts', group: 'spoils', tier: 1, name: 'Salvage crews', text: 'More chance of finding an emblem after a battle won.', max: 3, cost: rising(20, 15) },
  { id: 'salvage', group: 'spoils', tier: 2, requires: [['scouts', 1]], name: 'Scavengers', text: 'One more card to choose from when salvaging.', max: 1, cost: flat(60) },
  { id: 'choice', group: 'spoils', tier: 2, requires: [['scouts', 1]], name: 'Wide offers', text: 'One more card to choose from in every card reward.', max: 1, cost: flat(70) },
  { id: 'plunder', group: 'spoils', tier: 2, requires: [['scouts', 2]], name: 'Plunder', text: '+2 materials for every battle won.', max: 2, cost: rising(45, 35) },
  { id: 'vault', group: 'spoils', tier: 3, requires: [['salvage', 1], ['plunder', 1]], name: "Overlord's vault", text: "Every Overlord's hoard offers 2 more cards to choose from.", max: 1, cost: flat(170) },
  // Lasting wisdom: what carries over to every run after.
  { id: 'study', group: 'lore', tier: 1, name: 'Study', text: '+10% experience from everything.', max: 3, cost: rising(25, 20) },
  { id: 'petals', group: 'lore', tier: 2, requires: [['study', 1]], name: 'Petal pouch', text: '+20% petals at every wormhole.', max: 3, cost: rising(40, 20) },
  { id: 'tithe', group: 'lore', tier: 2, requires: [['study', 2]], name: "Overlord's tithe", text: '+2 petals from every Overlord beaten.', max: 2, cost: rising(50, 40) },
  { id: 'legacy', group: 'lore', tier: 3, requires: [['petals', 1], ['tithe', 1]], name: 'Legacy', text: '+1 petal for every battle won.', max: 1, cost: flat(170) },
  // Unlocks (petals): the other races, and each race's later heroes.
  ...[4, 5, 6, 7].map((race) => ({ id: `race:${race}`, group: 'unlock' as const, name: '', text: '', max: 1, cost: flat(10) })),
  ...GENERALS.flatMap((heroes) => heroes.slice(1).map((hero) => ({ id: `hero:${hero}`, group: 'unlock' as const, name: '', text: '', max: 1, cost: flat(6) }))),
];

/** Skills taken out of the tree, with what each level cost: a save that bought them has its XP back. */
const RETIRED: Record<string, number[]> = { doctrine: [25, 50], insight: [90], calm: [90], secondsun: [200] };

/** A save brought up to date: the XP spent on skills since taken out of the tree, refunded. */
export function migrateMeta(meta: MetaState): MetaState {
  const gone = Object.keys(meta.upgrades ?? {}).filter((id) => RETIRED[id]);
  if (gone.length) {
    const upgrades = { ...meta.upgrades };
    let back = 0;
    for (const id of gone) {
      back += RETIRED[id].slice(0, upgrades[id]).reduce((t, c) => t + c, 0);
      delete upgrades[id];
    }
    meta = { ...meta, upgrades, xp: (meta.xp ?? 0) + back };
  }
  // Skills bought with XP, from before levels and points: the XP spent on them counts again (it is all experience
  // earned), and the commander stands at least high enough to have the points for every skill already bought.
  if ((meta.v ?? 1) < 2) {
    let spent = 0;
    for (const u of META_UPGRADES) if (currencyOf(u) === 'points') for (let l = 0; l < (meta.upgrades[u.id] ?? 0); l++) spent += u.cost(l);
    const xp = Math.max((meta.xp ?? 0) + spent, xpForLevel(pointsSpent(meta) + 1));
    meta = { ...meta, xp, v: 2 };
  }
  return meta;
}

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
  const price = priceOf(u, level);
  if (currencyOf(u) === 'points' ? pointsLeft(meta) < price : meta.petals < price) return `Needs ${price} ${currencyOf(u) === 'points' ? (price === 1 ? 'point' : 'points') : 'petals'}.`;
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
  // (Points are not taken: what is left is worked out from the skills bought.)
  const paid = currencyOf(u) === 'points' ? {} : { petals: meta.petals - u.cost(level) };
  return { ...meta, ...paid, upgrades: { ...meta.upgrades, [id]: level + 1 } };
}

/** Take back the last level of a skill (a point placed by mistake): its points (or petals) back. */
export function refundUpgrade(meta: MetaState, id: string): MetaState {
  const level = levelOf(meta, id);
  const u = metaUpgrade(id);
  if (!u || level <= 0) return meta;
  const back = currencyOf(u) === 'points' ? {} : { petals: meta.petals + u.cost(level - 1) };
  const upgrades = { ...meta.upgrades, [id]: level - 1 };
  if (!upgrades[id]) delete upgrades[id];
  return { ...meta, ...back, upgrades };
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
  /** The flagship's battles: its sun's start, health, shields and cooling, its hand and energy (a cooler sun, a sharper command). */
  mods?: BattleModifiers;
  /** Heat the flagship repairs each turn on the map (Field repair). */
  mend?: number;
  /** More chance of an emblem after a battle won (Salvage crews). */
  loot?: number;
  /** A Stellar emblem to start the run with (Heirloom); cards more in every armoury (Quartermaster); petals for every battle won (Legacy). */
  heirloom?: number;
  stock?: number;
  legacy?: number;
  /** More materials for every battle won (Plunder). */
  plunder?: number;
  /** A share more experience (Study), cards more in every card reward (Wide offers), petals more from every Overlord (Overlord's tithe), and cards more in its hoard (Overlord's vault). */
  xpBonus?: number;
  choices?: number;
  tithe?: number;
  vault?: number;
}

/**
 * Each race's six cards that can be bought into its starting deck with petals: two white dwarf, two stellar and two
 * anomaly, each chosen for how that race plays (and legal in the mode its runs are played in: Core for the four core
 * races, whose only anomalies there are few).
 */
export const STARTER_OFFERS: string[][] = [
  // Aureline: armed cards making each other hit harder.
  ['dawnblade', 'banner_of_dawn', 'lancer_squadron', 'coronal_chorus', 'the_sun_throne', 'event_horizon'],
  // Xel'Naru: run the sun hot for bigger bursts.
  ['shard_tempest', 'crystal_bloom', 'xelnaru_oracle', 'refraction_veil', 'event_horizon', 'black_sun'],
  // Vorthane: shields kept, and stinging.
  ['brine_lash', 'deep_hymn', 'riptide_sentinel', 'abyssal_snap', 'black_sun', 'event_horizon'],
  // Ixquor: grow, and go wide.
  ['sporestorm', 'mycelial_net', 'spore_burst', 'hive_colossus', 'event_horizon', 'black_sun'],
  // Nyxari: traps from the dark, and unmaking.
  ['nyx_unmaker_blade', 'nyx_veil_sentry', 'nyx_hollow_reaper', 'nyx_null_shroud', 'temporal_snare', 'event_horizon'],
  // Korrath: walls, and the forge behind them.
  ['kor_foundry', 'kor_molten_pour', 'kor_master_smith', 'kor_rampart_lord', 'aegis_monolith', 'black_sun'],
  // Seren: the planets turned, and attunement.
  ['ser_eclipse_caster', 'ser_twin_moons', 'ser_oracle', 'ser_constellation', 'grand_orrery', 'circular_refraction'],
  // Pyrr: everything spent in one burst, the sun run hot.
  ['pyr_flare_burst', 'pyr_stoker', 'pyr_supernova_charge', 'pyr_solar_tyrant', 'supernova_lance', 'crown_first_sun'],
];

/** What a starter card costs in petals, by its rarity. */
export const starterCardPrice = (rarity: string | undefined) => (rarity === 'anomaly' ? 14 : rarity === 'stellar' ? 8 : 4);

/** Whether a starter card has been bought for a race (once bought, it is theirs for good: in the deck or out). */
export function starterOwned(meta: MetaState, race: number, defId: string): boolean {
  return (meta.owned?.[race] ?? []).includes(defId) || (meta.deck?.[race] ?? []).includes(defId);
}

/** What putting a starter card into the deck costs now: its price once, nothing after. */
export const starterAddPrice = (meta: MetaState, race: number, defId: string, rarity: string | undefined) => (starterOwned(meta, race, defId) ? 0 : starterCardPrice(rarity));

/** Why this card can't be put into this race's starting deck now (null if it can). */
export function starterAddProblem(meta: MetaState, race: number, defId: string, rarity: string | undefined): string | null {
  if (!STARTER_OFFERS[race]?.includes(defId)) return "That card isn't offered to this race's starting deck.";
  if ((meta.deck?.[race] ?? []).includes(defId)) return 'Already in the starting deck.';
  const price = starterAddPrice(meta, race, defId, rarity);
  if (meta.petals < price) return `Needs ${price} petals.`;
  return null;
}

/** Put a card into a race's starting deck: bought for good the first time, free after (a new state; throws if it can't). */
export function buyStarterCard(meta: MetaState, race: number, defId: string, rarity: string | undefined): MetaState {
  const why = starterAddProblem(meta, race, defId, rarity);
  if (why) throw new Error(why);
  const owned = meta.owned?.[race] ?? [];
  return {
    ...meta,
    petals: meta.petals - starterAddPrice(meta, race, defId, rarity),
    deck: { ...meta.deck, [race]: [...(meta.deck?.[race] ?? []), defId] },
    owned: { ...meta.owned, [race]: owned.includes(defId) ? owned : [...owned, defId] },
  };
}

/** Take a bought card back out of a race's starting deck (still owned: it goes back in for nothing). */
export function removeStarterCard(meta: MetaState, race: number, index: number): MetaState {
  const have = [...(meta.deck?.[race] ?? [])];
  const owned = meta.owned?.[race] ?? [];
  const [out] = have.splice(index, 1);
  if (out && !owned.includes(out)) meta = { ...meta, owned: { ...meta.owned, [race]: [...owned, out] } };
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
    grace: l('grace'),
    armoryDiscount: l('armory'),
    petalBonus: 0.2 * l('petals'),
    salvage: l('salvage'),
    hoard: 6 * l('hoard'),
    favour: 3 * l('favour'),
    deck: meta && race !== undefined ? [...(meta.deck?.[race] ?? [])] : [],
    mods: {
      ...(l('cryo') ? { startingHeat: -l('cryo') } : {}),
      ...(l('plating') ? { maxHealthDelta: 2 * l('plating') } : {}),
      ...(l('mantle') ? { shieldPerTurn: l('mantle') } : {}),
      ...(l('abundance') + l('aligned') ? { abundantDraw: l('abundance') + l('aligned') } : {}),
      ...(l('foundry') + l('aligned') ? { industrialPlays: l('foundry') + l('aligned') } : {}),
      ...(l('coldworld') + l('aligned') ? { deadCool: 2 * (l('coldworld') + l('aligned')) } : {}),

      ...(l('bastion') ? { guardDefence: 2 * l('bastion') } : {}),
    },
    mend: l('mend'),
    loot: 0.1 * l('scouts'),
    heirloom: l('heirloom'),
    stock: 3 * l('stock'),
    legacy: l('legacy'),
    plunder: 2 * l('plunder'),
    xpBonus: 0.1 * l('study'),
    choices: l('choice'),
    tithe: 2 * l('tithe'),
    vault: 2 * l('vault'),
  };
}
