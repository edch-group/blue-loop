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
import { partSlots, shipFit, shipPart, type PartSlot, type ShipFit } from './parts';
import { CAPTAIN_START_SINGULARITY } from './singularities';
import { ACTIVE_CREW, COMPANION_IDS, companionCardId, companionFromAscent, companionLevel, type CompanionId } from './companions';
import { CAPTAIN_START_ABILITY, captainId } from './captain';
import { ascend, ascentGifts, ascentProblem, ascentSpent, CAPTAIN_TREE, COMPANION_TREES, plainAscent, type Ascent } from './ascent';
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

/**
 * What an upgrade is bought with: petals, now, for the skill tree and unlocks alike [direction: hero upgrades bought
 * with skill points, overall upgrades with petals]. (Skill points buy the Captain: see captainPointsSpent.)
 */
export const currencyOf = (_u: MetaUpgrade): 'points' | 'petals' => 'petals';

/** A skill's price in petals, every level of it, by its tier (the capstones dearest). */
export const TREE_PETALS = [0, 3, 5, 8];
export const pointCost = (u: MetaUpgrade) => TREE_PETALS[u.tier ?? 1] ?? 3;

/** An upgrade's next level's price, in petals. */
export const priceOf = (u: MetaUpgrade, level: number) => (u.group === 'unlock' ? u.cost(level) : pointCost(u));

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

/** Skill levels bought on the tree, each by its tier (what skill points once bought them with: kept for older saves). */
const treeTiers = (meta: MetaState) => META_UPGRADES.filter((u) => u.group !== 'unlock').reduce((t, u) => t + (u.tier ?? 1) * (meta.upgrades[u.id] ?? 0), 0);

/** Petals the skill tree's skills cost in all (what a reset gives back). */
export const treePetalsSpent = (meta: MetaState) =>
  META_UPGRADES.filter((u) => u.group !== 'unlock').reduce((t, u) => t + pointCost(u) * Math.min(meta.upgrades[u.id] ?? 0, u.max), 0);

/** Skill points spent: on the Captain (captain.ts prices). */
export const pointsSpent = (meta: MetaState) => captainPointsSpent(meta);

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
  /** Stars conquered in all, by the hero who led the run (what unlocks the race's next hero). */
  conquests?: Record<string, number>; // stars conquered, by race
  /** The most universes crossed in one run, and runs begun. */
  best: number;
  runs: number;
  /** What petals have made of the Captain (captain.ts): kept for every run. */
  captain?: CaptainMeta;
  /** The races Kinship and Fellowship lean the Captain's rewards to (indexes into RACE_NAMES, core races only). */
  affinity?: { primary?: number; secondary?: number };
  /** Ship parts found (parts.ts), kept for good; and which is fitted in each of the ship's slots. */
  hangar?: string[];
  fitted?: Partial<Record<PartSlot, string>>;
  /** The campaign menu's sections opened up so far (each once there was first something in it to spend). */
  opened?: Partial<Record<MenuSection, boolean>>;
  /** The Captain's companions found (companions.ts): each one's experience and what their tree has made of them. */
  companions?: Partial<Record<CompanionId, CompanionMeta>>;
  /** Beaten heroes spared in Power Struggles, every run (what brings the defector). */
  spared?: number;
  /** Stages of Kaelen's hunters beaten, in all runs (encounters.ts): three, and they never come for him again. */
  hunters?: number;
  /** A card kept from a lost run, to start the next one (once: it is used up as that run begins). */
  kept?: string;
  /** The companions chosen to fly on the next run (at most ACTIVE_CREW; unset: the first found). */
  crew?: CompanionId[];
}

/** A companion as kept: their experience (from what they did in battle) and their ascent (ascent.ts). */
export interface CompanionMeta extends Ascent {
  xp: number;
}
/** A companion as kept, read safely (an older build, from before tiers, starts afresh: its points come back). */
const companionAscent = (c: Partial<CompanionMeta>): Ascent => (Array.isArray(c.nodes) ? { nodes: c.nodes, gates: c.gates ?? 0 } : plainAscent());

/** The companions found so far, in order. */
export const companionsFound = (meta: MetaState): CompanionId[] => COMPANION_IDS.filter((id) => meta.companions?.[id]);

/**
 * The companions who fly with the Captain on the next run [direction: only 3 active companions at a time; the player
 * chooses which, and can swap any unlocked one in at the start of a new run]: those chosen (meta.crew), or, with
 * none chosen, the first found.
 */
export const activeCrew = (meta: MetaState): CompanionId[] => {
  const found = companionsFound(meta);
  return (meta.crew ? meta.crew.filter((id) => found.includes(id)) : found).slice(0, ACTIVE_CREW);
};

/** A companion sent aboard for the next run, or ashore (none sent aboard past ACTIVE_CREW). */
export function setCrewAboard(meta: MetaState, id: CompanionId, aboard: boolean): MetaState {
  const now = activeCrew(meta).filter((x) => x !== id);
  if (aboard && now.length >= ACTIVE_CREW) return meta;
  return { ...meta, crew: aboard ? [...now, id] : now };
}

/** A found companion's card for the next run (its id carries the build): the active crew's. */
export const companionCards = (meta: MetaState): string[] => activeCrew(meta).map((id) => companionCardId(id, companionFromAscent(id, companionAscent(meta.companions![id]!))));

/** Skill points a companion has spent (an upgrade or a gate, one each). */
export const companionSpent = (meta: MetaState, id: CompanionId): number => (meta.companions?.[id] ? ascentSpent(COMPANION_TREES[id], companionAscent(meta.companions[id]!)) : 0);
/** A companion's ascent, as kept. */
export const companionTree = (meta: MetaState, id: CompanionId): Ascent => companionAscent(meta.companions?.[id] ?? {});

/** A companion's skill points left: one for every level past the first, less those spent. */
export function companionPoints(meta: MetaState, id: CompanionId): number {
  const c = meta.companions?.[id];
  return c ? companionLevel(c.xp).level - 1 - companionSpent(meta, id) : 0;
}

/** Why a companion can't take it now (null if it can): an upgrade's id, or 'gate'. */
export const companionProblem = (meta: MetaState, id: CompanionId, what: string): string | null =>
  meta.companions?.[id] ? ascentProblem(COMPANION_TREES[id], companionTree(meta, id), what, companionPoints(meta, id)) : 'Not found yet.';

/** Take it (a new state; unchanged if it can't be had). */
export function buyCompanion(meta: MetaState, id: CompanionId, what: string): MetaState {
  const c = meta.companions?.[id];
  if (!c || companionProblem(meta, id, what)) return meta;
  return { ...meta, companions: { ...meta.companions, [id]: { xp: c.xp, ...ascend(COMPANION_TREES[id], companionTree(meta, id), what, companionPoints(meta, id)) } } };
}

/**
 * What a run brings back for the companions: those who joined (found for good, from a plain build), the experience
 * each earnt, and beaten heroes spared.
 */
export function bankCompanions(meta: MetaState, freed: CompanionId[], xp: Partial<Record<CompanionId, number>>, spared: number, hunters = 0): MetaState {
  if (hunters > 0) meta = { ...meta, hunters: (meta.hunters ?? 0) + hunters };
  if (!freed.length && !spared && !Object.values(xp).some((n) => (n ?? 0) > 0)) return meta;
  const companions = { ...(meta.companions ?? {}) };
  // (One who joins takes a place aboard for the next run too, while there is one free.)
  let crew = meta.crew;
  for (const id of freed) {
    if (!companions[id] && crew && crew.length < ACTIVE_CREW) crew = [...crew, id];
    companions[id] ??= { ...plainAscent(), xp: 0 };
  }
  if (crew !== meta.crew) meta = { ...meta, crew };
  for (const id of COMPANION_IDS) if (companions[id] && (xp[id] ?? 0) > 0) companions[id] = { ...companions[id]!, xp: companions[id]!.xp + xp[id]! };
  return { ...meta, companions, spared: (meta.spared ?? 0) + spared };
}

/** The campaign menu's sections: the Captain's skills, the ship's parts, the Stellari's skill tree. */
export type MenuSection = 'captain' | 'ship' | 'stellari' | CompanionId;

/**
 * Whether a section of the campaign menu is open [direction: the menu's items greyed out until points or parts are
 * available for the first time]: once there is first something in it (a skill point, a part, a petal), and from then
 * on for good.
 */
export function sectionOpen(meta: MetaState, s: MenuSection): boolean {
  if (meta.opened?.[s]) return true;
  if (s === 'captain') return pointsLeft(meta) > 0 || captainPointsSpent(meta) > 0;
  if (s === 'ship') return (meta.hangar?.length ?? 0) > 0;
  // (A companion's: once they are found and have a skill point to spend.)
  if (s !== 'stellari') return !!meta.companions?.[s] && (companionPoints(meta, s) > 0 || companionSpent(meta, s) > 0);
  return meta.petals > 0 || treePetalsSpent(meta) > 0;
}

/** The sections open now, marked open for good. */
export function openSections(meta: MetaState): MetaState {
  const opened = { ...(meta.opened ?? {}) };
  let changed = false;
  for (const s of ['captain', 'ship', 'stellari', ...COMPANION_IDS] as MenuSection[])
    if (!opened[s] && sectionOpen(meta, s)) {
      opened[s] = true;
      changed = true;
    }
  return changed ? { ...meta, opened } : meta;
}

/** Fit a part from the hangar into a slot of its kind (taking it from any other slot it was in), or empty a slot. */
export function fitPart(meta: MetaState, slot: PartSlot, id: string | null): MetaState {
  const fitted = { ...(meta.fitted ?? {}) };
  if (id === null) {
    delete fitted[slot];
    return { ...meta, fitted };
  }
  if (!meta.hangar?.includes(id) || !partSlots(id).includes(slot)) return meta;
  for (const k of Object.keys(fitted) as PartSlot[]) if (fitted[k] === id) delete fitted[k];
  fitted[slot] = id;
  return { ...meta, fitted };
}

/** Parts found on a run, into the hangar for good (each once). */
export function stowParts(meta: MetaState, ids: readonly string[]): MetaState {
  const hangar = [...(meta.hangar ?? [])];
  for (const id of ids) if (shipPart(id) && !hangar.includes(id)) hangar.push(id);
  return { ...meta, hangar };
}

/** How far Kinship and Fellowship lean rewards, by level, added to a race's weight (1 to start: 5× at Kinship's most, 2× at Fellowship's). */
export const KINSHIP_BOOST = [0, 1, 2, 4];
export const FELLOWSHIP_BOOST = [0, 0.5, 1];
/** The skill that leans to each of the two races. */
export const AFFINITY_SKILL = { primary: 'kinship', secondary: 'fellowship' } as const;

/** Set the favoured race (Kinship) or the second one (Fellowship); the other is moved off it if they would match. */
export function setAffinity(meta: MetaState, which: 'primary' | 'secondary', race: number | undefined): MetaState {
  const a = { ...(meta.affinity ?? {}) };
  a[which] = race;
  const other = which === 'primary' ? 'secondary' : 'primary';
  if (race !== undefined && a[other] === race) a[other] = undefined;
  return { ...meta, affinity: a };
}

/**
 * The Captain, as skill points have made them [direction: hero upgrades grouped into tiers, an Astral Gate between
 * each]: their ascent (ascent.ts: the upgrades taken and the gates passed), the abilities carried into battle, the way
 * of leading chosen and the singularity.
 */
export interface CaptainMeta extends Ascent {
  equipped: string[];
  lead?: string;
  /** The singularity chosen (unset: the first, Back to the Wall). */
  sing?: string;
}

export const plainCaptain = (): CaptainMeta => ({ ...plainAscent(), equipped: [CAPTAIN_START_ABILITY] });
/** The Captain as kept (an older build, from before tiers, starts afresh: its points come back). */
export const captainMeta = (meta: MetaState): CaptainMeta => (meta.captain && Array.isArray(meta.captain.nodes) ? { ...plainCaptain(), ...meta.captain } : plainCaptain());

/** What the Captain's ascent gives: abilities learnt (the first always), slots, leads and singularities learnt, stats. */
export function captainGifts(meta: MetaState) {
  const c = captainMeta(meta);
  const g = ascentGifts(CAPTAIN_TREE, c);
  return { ...g, abilities: [CAPTAIN_START_ABILITY, ...g.abilities], slotCount: 1 + g.slots, gates: c.gates };
}

/** The Captain's card for the next run (its id carries the build: captain.ts). */
export function captainCard(meta: MetaState): string {
  const c = captainMeta(meta);
  const g = captainGifts(meta);
  const abilities = c.equipped.filter((a) => g.abilities.includes(a)).slice(0, g.slotCount);
  const lead = c.lead && g.leads.includes(c.lead) ? c.lead : undefined;
  const sing = c.sing && g.sings.includes(c.sing) ? c.sing : undefined;
  return captainId({ attack: g.attack, stability: g.stability, cheaper: g.cheaper, abilities, gates: c.gates, ...(lead ? { lead } : {}), ...(sing ? { sing } : {}) });
}

/** Something the Captain's tree can take: an upgrade (its id), or the next Astral Gate. */
export type CaptainBuy = { kind: 'node'; id: string } | { kind: 'gate' };
const what = (buy: CaptainBuy) => (buy.kind === 'gate' ? 'gate' : buy.id);

/** Why it can't be taken now (null if it can). */
export function captainBuyProblem(meta: MetaState, buy: CaptainBuy): string | null {
  return ascentProblem(CAPTAIN_TREE, captainMeta(meta), what(buy), pointsLeft(meta));
}

/** Skill points spent on the Captain, in all. */
export function captainPointsSpent(meta: MetaState): number {
  return meta.captain && Array.isArray(meta.captain.nodes) ? ascentSpent(CAPTAIN_TREE, captainMeta(meta)) : 0;
}

/** Take it (a new state; throws if it can't be had). A new ability is carried at once if a slot is free; a new lead, or singularity, is taken up. */
export function buyCaptain(meta: MetaState, buy: CaptainBuy): MetaState {
  const why = captainBuyProblem(meta, buy);
  if (why) throw new Error(why);
  const c = captainMeta(meta);
  const next: CaptainMeta = { ...c, ...ascend(CAPTAIN_TREE, c, what(buy), pointsLeft(meta)), equipped: [...c.equipped] };
  const node = buy.kind === 'node' ? CAPTAIN_TREE.find((x) => x.id === buy.id) : undefined;
  const after = { ...meta, captain: next };
  if (node?.give.ability && next.equipped.length < captainGifts(after).slotCount) next.equipped.push(node.give.ability);
  if (node?.give.lead) next.lead = node.give.lead;
  if (node?.give.sing) next.sing = node.give.sing;
  return after;
}

/** Carry a learnt ability into battle, or leave it behind (carried only while a slot is free). */
export function equipCaptainAbility(meta: MetaState, id: string): MetaState {
  const c = captainMeta(meta);
  const g = captainGifts(meta);
  if (!g.abilities.includes(id)) return meta;
  const on = c.equipped.includes(id);
  if (!on && c.equipped.filter((a) => g.abilities.includes(a)).length >= g.slotCount) return meta;
  return { ...meta, captain: { ...c, equipped: on ? c.equipped.filter((x) => x !== id) : [...c.equipped, id] } };
}

/** Lead in a learnt way (or in none). */
export function setCaptainLead(meta: MetaState, id: string | undefined): MetaState {
  const c = captainMeta(meta);
  if (id !== undefined && !captainGifts(meta).leads.includes(id)) return meta;
  return { ...meta, captain: { ...c, lead: id } };
}

/** Choose a learnt singularity (the first is always known). */
export function setCaptainSingularity(meta: MetaState, id: string): MetaState {
  const c = captainMeta(meta);
  if (id !== CAPTAIN_START_SINGULARITY && !captainGifts(meta).sings.includes(id)) return meta;
  return { ...meta, captain: { ...c, sing: id === CAPTAIN_START_SINGULARITY ? undefined : id } };
}

export const emptyMeta = (): MetaState => ({ petals: 0, xp: 0, upgrades: {}, deck: {}, best: 0, runs: 0, v: 4 });

const flat = (n: number) => () => n;
const rising = (base: number, step: number) => (level: number) => base + step * level;

/** The four races there from the start; the rest (and every race's heroes past its first) are unlocked with petals. */
export const STARTING_RACES = [0, 1, 2, 3];

export const META_UPGRADES: MetaUpgrade[] = [
  // A stronger start: what every run begins with.
  { id: 'materials', group: 'start', tier: 1, name: 'Stockpile', text: '+3 materials to start each run.', max: 3, cost: rising(20, 15) },
  { id: 'cards', group: 'start', tier: 2, requires: [['materials', 1]], name: 'Veterans', text: 'One more plain card in the starting deck.', max: 2, cost: rising(45, 35) },
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
  { id: 'mend', group: 'sun', tier: 2, requires: [['cryo', 2]], name: 'Field cooling', text: 'Your sun cools 1 each jump.', max: 2, cost: rising(50, 40) },
  { id: 'favour', group: 'sun', tier: 3, requires: [['plating', 1], ['mend', 1]], name: "Stellari's Favour", text: 'Your sun cools 3 after each battle won.', max: 1, cost: flat(180) },
  // Kinder planets [direction: skills that upgrade the planets, rather than straight draws or energy].
  { id: 'abundance', group: 'command', tier: 1, name: 'Fertile orbit', text: 'The abundant planet draws 1 more card each day it faces your sun.', max: 2, cost: rising(25, 25) },
  { id: 'foundry', group: 'command', tier: 2, requires: [['abundance', 1]], name: 'Deep foundries', text: 'The industrial planet gives 1 more energy each day it faces your sun.', max: 1, cost: flat(90) },
  { id: 'coldworld', group: 'command', tier: 2, requires: [['abundance', 2]], name: 'Cold world', text: 'The dead planet cools your sun by 2 each dawn it faces it.', max: 1, cost: flat(90) },
  { id: 'aligned', group: 'command', tier: 3, requires: [['foundry', 1], ['coldworld', 1]], name: 'Aligned worlds', text: 'Every planet gives more again: +1 card, +1 energy, 2 more cooling.', max: 1, cost: flat(200) },
  // Spoils of war: what a battle won leaves you.
  // (Kinship leans rewards a long way to one race; Fellowship a little to another: each race picked as its first point is taken.)
  { id: 'kinship', group: 'spoils', tier: 1, name: 'Kinship', text: "Your favoured race's cards come up more often among rewards.", max: 3, cost: rising(20, 15) },
  { id: 'scouts', group: 'spoils', tier: 1, name: 'Salvage crews', text: 'More chance of finding an emblem after a battle won.', max: 3, cost: rising(20, 15) },
  { id: 'fellowship', group: 'spoils', tier: 1, name: 'Fellowship', text: "A second race's cards come up a little more often among rewards.", max: 2, cost: rising(20, 15) },
  { id: 'salvage', group: 'spoils', tier: 2, requires: [['scouts', 1]], name: 'Scavengers', text: 'One more card to choose from when salvaging.', max: 1, cost: flat(60) },
  { id: 'choice', group: 'spoils', tier: 2, requires: [['scouts', 1]], name: 'Wide offers', text: 'One more card to choose from in every card reward.', max: 1, cost: flat(70) },
  { id: 'plunder', group: 'spoils', tier: 2, requires: [['scouts', 2]], name: 'Plunder', text: '+2 materials for every battle won.', max: 2, cost: rising(45, 35) },
  // [direction: bias rewards towards certain races; the most, a big increase to one race's chance and a smaller one to another's]
  { id: 'vault', group: 'spoils', tier: 3, requires: [['salvage', 1], ['plunder', 1]], name: "Overlord's vault", text: "Every Overlord's hoard offers 2 more cards to choose from.", max: 1, cost: flat(170) },
  // Lasting wisdom: what carries over to every run after.
  { id: 'study', group: 'lore', tier: 1, name: 'Study', text: '+10% experience from everything.', max: 3, cost: rising(25, 20) },
  { id: 'petals', group: 'lore', tier: 2, requires: [['study', 1]], name: 'Petal pouch', text: '+20% petals at every wormhole.', max: 3, cost: rising(40, 20) },
  { id: 'tithe', group: 'lore', tier: 2, requires: [['study', 2]], name: "Overlord's tithe", text: '+2 petals from every Overlord beaten.', max: 2, cost: rising(50, 40) },
  { id: 'legacy', group: 'lore', tier: 3, requires: [['petals', 1], ['tithe', 1]], name: 'Legacy', text: '+1 petal for every battle won.', max: 1, cost: flat(170) },
  // Unlocks (petals): the other races, and each race's later heroes.
  ...[4, 5, 6, 7].map((race) => ({ id: `race:${race}`, group: 'unlock' as const, name: '', text: '', max: 1, cost: flat(10) })),
  // (Heroes are no longer bought: each is unlocked by the stars conquered with the one before it, heroUnlocked.)
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
    for (const u of META_UPGRADES) if (u.group !== 'unlock') for (let l = 0; l < (meta.upgrades[u.id] ?? 0); l++) spent += u.cost(l);
    const xp = Math.max((meta.xp ?? 0) + spent, xpForLevel(treeTiers(meta) + 1));
    meta = { ...meta, xp, v: 2 };
  }
  // Skill points to the Captain, petals to the skill tree [direction: hero upgrades bought with skill points, overall
  // upgrades with petals]: skills already learnt are kept; the petals once spent on the Captain come back, and the
  // Captain is plain again, to be rebuilt with points.
  if ((meta.v ?? 1) < 3) {
    const c = meta.captain;
    let back = 0;
    if (c) {
      // (A build from those days, read as it was kept.)
      const old = c as unknown as Partial<Record<'attack' | 'stability' | 'cheaper' | 'slots', number>> & { abilities?: string[]; leads?: string[] };
      const OLD = { attack: [5, 9, 14], stability: [3, 6, 10, 15], cheaper: [8, 16], slots: [6, 12] } as const;
      const OLD_ABILITY: Record<string, number> = { patch: 3, scout: 4, volley: 5, bulwark: 6, vent: 6, strafe: 8, overdrive: 8, rally: 10, mend: 10 };
      const OLD_LEAD: Record<string, number> = { steady: 12, iron: 12, salvo: 14, gunnery: 16 };
      for (const k of ['attack', 'stability', 'cheaper', 'slots'] as const) back += OLD[k].slice(0, old[k] ?? 0).reduce((t, n) => t + n, 0);
      for (const a of old.abilities ?? []) back += OLD_ABILITY[a] ?? 0;
      for (const l of old.leads ?? []) back += OLD_LEAD[l] ?? 0;
    }
    meta = { ...meta, petals: meta.petals + back, v: 3, ...(c ? { captain: plainCaptain() } : {}) };
  }
  // Kinship split in two: its levels past the third (the second race's) are Fellowship's now.
  if ((meta.v ?? 1) < 4) {
    const k = meta.upgrades.kinship ?? 0;
    const upgrades = { ...meta.upgrades };
    if (k > 3) Object.assign(upgrades, { kinship: 3, fellowship: Math.min(2, k - 3) });
    meta = { ...meta, upgrades, v: 4 };
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
  if (meta.petals < price) return `Needs ${price} petals.`;
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
  return { ...meta, petals: meta.petals - priceOf(u, level), upgrades: { ...meta.upgrades, [id]: level + 1 } };
}

/** Take back the last level of a skill (a point placed by mistake): its points (or petals) back. */
export function refundUpgrade(meta: MetaState, id: string): MetaState {
  const level = levelOf(meta, id);
  const u = metaUpgrade(id);
  if (!u || level <= 0) return meta;
  const upgrades = { ...meta.upgrades, [id]: level - 1 };
  if (!upgrades[id]) delete upgrades[id];
  return { ...meta, petals: meta.petals + priceOf(u, level - 1), upgrades };
}

/** The petals it costs to take back every skill point placed, to place them all again. */
export const SKILL_RESET_PETALS = 5;

/** Why the skill tree can't be reset now (null if it can). */
export function resetSkillsProblem(meta: MetaState): string | null {
  if (!treePetalsSpent(meta)) return 'No skills to reset.';
  if (meta.petals + treePetalsSpent(meta) < SKILL_RESET_PETALS) return `Needs ${SKILL_RESET_PETALS} petals.`;
  return null;
}

/** Every skill on the tree taken back, its petals returned to spend again, less SKILL_RESET_PETALS (unlocks kept). */
export function resetSkills(meta: MetaState): MetaState {
  const why = resetSkillsProblem(meta);
  if (why) throw new Error(why);
  const upgrades = Object.fromEntries(Object.entries(meta.upgrades).filter(([id]) => metaUpgrade(id)?.group === 'unlock'));
  return { ...meta, petals: meta.petals + treePetalsSpent(meta) - SKILL_RESET_PETALS, upgrades };
}

/** Why the Captain can't be reset now (null if they can). */
export function resetCaptainProblem(meta: MetaState): string | null {
  if (!captainPointsSpent(meta)) return 'Nothing to reset.';
  if (meta.petals < SKILL_RESET_PETALS) return `Needs ${SKILL_RESET_PETALS} petals.`;
  return null;
}

/** The Captain made plain again, every skill point back to spend, for SKILL_RESET_PETALS. */
export function resetCaptain(meta: MetaState): MetaState {
  const why = resetCaptainProblem(meta);
  if (why) throw new Error(why);
  return { ...meta, petals: meta.petals - SKILL_RESET_PETALS, captain: plainCaptain() };
}

export function raceUnlocked(meta: MetaState, race: number): boolean {
  return STARTING_RACES.includes(race) || levelOf(meta, `race:${race}`) > 0;
}

/**
 * The stars a race must have conquered (in all, over every run as it, whoever led) to unlock each of its heroes
 * [direction: a race-wide unlock, in order (Veyra, Aurex, Solenne for the Aureline): 20 unlocks the second, 50 the
 * third; one very good run, or a few middling ones]. The first is open from the start.
 */
export const HERO_UNLOCK_STARS = [0, 20, 50];

/** The stars the race must have conquered to unlock this hero (null: its first, open from the start). */
export function heroUnlockNeed(hero: string): { race: number; stars: number } | null {
  const race = GENERALS.findIndex((h) => h.includes(hero));
  const i = race >= 0 ? GENERALS[race].indexOf(hero) : 0;
  return i > 0 ? { race, stars: HERO_UNLOCK_STARS[i] ?? 50 } : null;
}

/** Stars conquered as a race, over every run. */
export const raceConquests = (meta: MetaState, race: number) => meta.conquests?.[String(race)] ?? 0;

/** A race's first hero is open from the start; the others once the race has conquered enough stars. */
export function heroUnlocked(meta: MetaState, hero: string): boolean {
  const need = heroUnlockNeed(hero);
  // (One bought with petals, in an older save, stays open.)
  return !need || raceConquests(meta, need.race) >= need.stars || levelOf(meta, `hero:${hero}`) > 0;
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
  /** The Captain's ship as fitted (parts.ts), and the parts already in the hangar (so a find is a new one). */
  ship?: ShipFit;
  hangar?: string[];
  /** The Captain's companions' cards (companions.ts), as their trees have made them; beaten heroes spared so far. */
  companions?: string[];
  /** A card kept from the last run, in the starting deck this run (a card like any other: it cannot be kept again). */
  kept?: string;
  spared?: number;
  /** Stages of Kaelen's hunters beaten in runs before (encounters.ts). */
  hunters?: number;
  /** The races the Captain's rewards lean to (Kinship, Fellowship), and how far. */
  affinity?: { primary?: number; primaryBoost: number; secondary?: number; secondaryBoost: number };
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
    ...(meta?.hangar?.length ? { ship: shipFit(meta.fitted), hangar: [...meta.hangar] } : {}),
    // (The Captain's companions found so far, their cards as their trees have made them; and beaten heroes spared.)
    companions: meta ? companionCards(meta) : [],
    spared: meta?.spared ?? 0,
    hunters: meta?.hunters ?? 0,
    ...(meta?.kept ? { kept: meta.kept } : {}),
    ...(l('kinship') || l('fellowship')
      ? { affinity: { primary: meta?.affinity?.primary, primaryBoost: KINSHIP_BOOST[l('kinship')] ?? 0, secondary: meta?.affinity?.secondary, secondaryBoost: FELLOWSHIP_BOOST[l('fellowship')] ?? 0 } }
      : {}),
  };
}
