/**
 * The loop's lasting progress, in two currencies, both kept for every run after.
 *
 * Experience (XP) is earned by everything a run does (battles won, systems taken, challenges cleared, galaxies
 * crossed, bosses beaten), win or lose, so every run moves the player on. It buys the skill tree: seven branches,
 * one off each petal of the Stellari (a cooler sun, a sharper command, a tougher flagship, run perks, a stronger
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
  // A cooler sun.
  { id: 'cryo', group: 'sun', tier: 1, name: 'Cryo core', text: "The flagship's sun starts every battle 1 cooler.", max: 3, cost: rising(20, 15) },
  { id: 'plating', group: 'sun', tier: 2, requires: [['cryo', 1]], name: 'Stellar plating', text: '+2 max health on the flagship\'s sun in battle.', max: 2, cost: rising(45, 35) },
  { id: 'mend', group: 'sun', tier: 2, requires: [['cryo', 2]], name: 'Field repair', text: 'The flagship repairs 1 heat at the start of every turn on the map.', max: 2, cost: rising(50, 40) },
  { id: 'mantle', group: 'sun', tier: 3, requires: [['plating', 1], ['mend', 1]], name: 'Halo mantle', text: "+1 shield on the flagship's sun every day of battle.", max: 1, cost: flat(180) },
  // Kinder planets [direction: skills that upgrade the planets, rather than straight draws or energy].
  { id: 'abundance', group: 'command', tier: 1, name: 'Fertile orbit', text: 'The abundant planet draws 1 more card each day it faces your sun.', max: 2, cost: rising(25, 25) },
  { id: 'foundry', group: 'command', tier: 2, requires: [['abundance', 1]], name: 'Deep foundries', text: 'The industrial planet gives 1 more energy each day it faces your sun.', max: 1, cost: flat(90) },
  { id: 'coldworld', group: 'command', tier: 2, requires: [['abundance', 2]], name: 'Cold world', text: 'The dead planet cools your sun by 2 each dawn it faces it.', max: 1, cost: flat(90) },
  { id: 'gardens', group: 'command', tier: 3, requires: [['foundry', 1], ['coldworld', 1]], name: 'Paradise', text: 'The dead planet becomes a paradise planet: each dawn it faces your sun, your cards regain 1 stability.', max: 1, cost: flat(200) },
  // Spoils of war.
  { id: 'scouts', group: 'spoils', tier: 1, name: 'Salvage crews', text: 'The flagship is likelier to find gear when it takes a system or wins a battle.', max: 3, cost: rising(20, 15) },
  { id: 'dread', group: 'spoils', tier: 2, requires: [['scouts', 1]], name: 'Terror broadcasts', text: 'The weakest neutral systems surrender to the flagship without a battle.', max: 1, cost: flat(70) },
  { id: 'plunder', group: 'spoils', tier: 2, requires: [['scouts', 2]], name: 'Plunder', text: '+2 materials for every battle won.', max: 2, cost: rising(45, 35) },
  { id: 'empire', group: 'spoils', tier: 3, requires: [['dread', 1], ['plunder', 1]], name: 'Shadow of empire', text: 'Stronger neutral systems surrender to the flagship too.', max: 1, cost: flat(180) },
  // Lasting wisdom.
  { id: 'study', group: 'lore', tier: 1, name: 'Study', text: '+10% experience from everything.', max: 3, cost: rising(25, 20) },
  { id: 'choice', group: 'lore', tier: 2, requires: [['study', 1]], name: 'Wide offers', text: 'One more card to choose from in every card reward.', max: 1, cost: flat(70) },
  { id: 'tithe', group: 'lore', tier: 2, requires: [['study', 2]], name: "Overlord's tithe", text: '+2 petals from every Overlord beaten.', max: 2, cost: rising(50, 40) },
  { id: 'vault', group: 'lore', tier: 3, requires: [['choice', 1], ['tithe', 1]], name: "Overlord's vault", text: "Every Overlord's hoard offers 2 more cards to choose from.", max: 1, cost: flat(170) },
  // Unlocks (petals): the other races, and each race's later heroes.
  ...[4, 5, 6, 7].map((race) => ({ id: `race:${race}`, group: 'unlock' as const, name: '', text: '', max: 1, cost: flat(10) })),
  ...GENERALS.flatMap((heroes) => heroes.slice(1).map((hero) => ({ id: `hero:${hero}`, group: 'unlock' as const, name: '', text: '', max: 1, cost: flat(6) }))),
];

/** Skills taken out of the tree, with what each level cost: a save that bought them has its XP back. */
const RETIRED: Record<string, number[]> = { doctrine: [25, 50], insight: [90], calm: [90], secondsun: [200] };

/** A save brought up to date: the XP spent on skills since taken out of the tree, refunded. */
export function migrateMeta(meta: MetaState): MetaState {
  const gone = Object.keys(meta.upgrades ?? {}).filter((id) => RETIRED[id]);
  if (!gone.length) return meta;
  const upgrades = { ...meta.upgrades };
  let back = 0;
  for (const id of gone) {
    back += RETIRED[id].slice(0, upgrades[id]).reduce((t, c) => t + c, 0);
    delete upgrades[id];
  }
  return { ...meta, upgrades, xp: (meta.xp ?? 0) + back };
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

/** Take back the last level of a skill (a point placed by mistake): its XP (or petals) refunded. */
export function refundUpgrade(meta: MetaState, id: string): MetaState {
  const level = levelOf(meta, id);
  const u = metaUpgrade(id);
  if (!u || level <= 0) return meta;
  const price = u.cost(level - 1);
  const back = currencyOf(u) === 'xp' ? { xp: (meta.xp ?? 0) + price } : { petals: meta.petals + price };
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
  /** The flagship's battles: its sun's start, health, shields and cooling, its hand and energy (a cooler sun, a sharper command). */
  mods?: BattleModifiers;
  /** Heat the flagship repairs each turn on the map (Field repair). */
  mend?: number;
  /** More chance of gear (Salvage crews), and the tiers of neutral system that surrender to it (Terror broadcasts, Shadow of empire). */
  loot?: number;
  dread?: number;
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

/** Why this card can't be bought into this race's starting deck now (null if it can). */
export function starterAddProblem(meta: MetaState, race: number, defId: string, rarity: string | undefined): string | null {
  if (!STARTER_OFFERS[race]?.includes(defId)) return "That card isn't offered to this race's starting deck.";
  if ((meta.deck?.[race] ?? []).includes(defId)) return 'Already in the starting deck.';
  if (meta.petals < starterCardPrice(rarity)) return `Needs ${starterCardPrice(rarity)} petals.`;
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
    mods: {
      ...(l('cryo') ? { startingHeat: -l('cryo') } : {}),
      ...(l('plating') ? { maxHealthDelta: 2 * l('plating') } : {}),
      ...(l('mantle') ? { shieldPerTurn: l('mantle') } : {}),
      ...(l('abundance') ? { abundantDraw: l('abundance') } : {}),
      ...(l('foundry') ? { industrialPlays: l('foundry') } : {}),
      ...(l('coldworld') ? { deadCool: 2 * l('coldworld') } : {}),
      ...(l('gardens') ? { paradise: l('gardens') } : {}),
    },
    mend: l('mend'),
    loot: 0.1 * l('scouts'),
    dread: l('dread') + l('empire'),
    plunder: 2 * l('plunder'),
    xpBonus: 0.1 * l('study'),
    choices: l('choice'),
    tithe: 2 * l('tithe'),
    vault: 2 * l('vault'),
  };
}
