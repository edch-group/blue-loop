import { CARDS, copyLimit, PRESET_DECKS, rarityOf } from './cards';
import type { CardDef, Rarity } from './types';

/**
 * Progression outside a single game: a player's level, two currencies, their
 * card collection, and (online) their rank. Pure rules only; the client keeps
 * the profile (src/ui/profile.ts) and the ranked server keeps ranks.
 *
 * - **Stardust** (✦) buys booster packs (and cosmetics).
 * - **Flux** (⟁) crafts cards you don't own; breaking a card down returns half
 *   its crafting cost.
 * - **Experience** raises your level; every level brings a little of both.
 * - **Rank**: six tiers named after rare matter found in space, three stages
 *   each. Ranked games only match players at most one tier apart.
 */

export const PROGRESSION = {
  /** Rewards for a game, by kind and result. */
  rewards: {
    ai: { win: { stardust: 20, flux: 5, xp: 40 }, loss: { stardust: 8, flux: 2, xp: 20 } },
    online: { win: { stardust: 60, flux: 15, xp: 100 }, loss: { stardust: 25, flux: 6, xp: 50 } },
    ranked: { win: { stardust: 120, flux: 30, xp: 160 }, loss: { stardust: 50, flux: 12, xp: 80 } },
  },
  /** Ranked: how much each stage of difference changes a win's or a loss's currency and experience. */
  winPerStage: 0.2,
  lossPerStage: 0.3,
  /** Ranked: rank points for a win and a loss against an equal, and how much each stage of difference changes them. */
  rankWin: 25,
  rankLoss: 20,
  rankPerStage: 0.15,
  /** Rank points to climb a stage. */
  stagePoints: 100,
  /** Experience for the next level: base + step × (level − 1). */
  levelBase: 100,
  levelStep: 25,
  levelReward: { stardust: 50, flux: 10 },
  /** A booster pack's price in stardust, and how many cards it holds. */
  boosterPrice: 100,
  boosterSize: 5,
  /** Flux to craft a card, by rarity. Breaking one down returns `breakdownShare` of it. */
  craft: { dwarf: 40, stellar: 100, anomaly: 400 } as Record<Rarity, number>,
  breakdownShare: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Ranks
// ---------------------------------------------------------------------------

/** The rank tiers, lowest first: rare matter found in space. */
export const RANK_TIERS = ['Olivine', 'Cobalt', 'Iridium', 'Lonsdaleite', 'Neutronium', 'Strange Matter'] as const;
export const STAGES_PER_TIER = 3;
const TOP_STAGE = RANK_TIERS.length * STAGES_PER_TIER - 1;

/** A rank as rank points: every stage is `stagePoints` points, from 0 (Olivine I) up. */
export interface Rank {
  tier: number;
  /** 0–2: stage I, II or III of the tier. */
  stage: number;
  /** Points towards the next stage (0–99). */
  points: number;
}

export function rankOf(rankPoints: number): Rank {
  const rp = Math.max(0, Math.round(rankPoints));
  const index = Math.min(TOP_STAGE, Math.floor(rp / PROGRESSION.stagePoints));
  return { tier: Math.floor(index / STAGES_PER_TIER), stage: index % STAGES_PER_TIER, points: index === TOP_STAGE ? rp - TOP_STAGE * PROGRESSION.stagePoints : rp % PROGRESSION.stagePoints };
}

/** The stage index (0 = Olivine I … 17 = Strange Matter III). */
export function stageIndex(rankPoints: number): number {
  const r = rankOf(rankPoints);
  return r.tier * STAGES_PER_TIER + r.stage;
}

export function rankName(rankPoints: number): string {
  const r = rankOf(rankPoints);
  return `${RANK_TIERS[r.tier]} ${['I', 'II', 'III'][r.stage]}`;
}

/** Whether two players may meet in a ranked game: at most one tier apart. */
export function canMatch(a: number, b: number): boolean {
  return Math.abs(rankOf(a).tier - rankOf(b).tier) <= 1;
}

/** The bottom of the ladder: the lowest stage, with no points. */
export function atFloor(rankPoints: number): boolean {
  return stageIndex(rankPoints) === 0;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export type GameKind = 'ai' | 'online' | 'ranked';

export interface Reward {
  stardust: number;
  flux: number;
  xp: number;
  /** Ranked: rank points gained (negative: lost). */
  rank?: number;
}

/**
 * What a game earns a player. Ranked games weigh the rank gap: beating a
 * higher-ranked player is worth more (and climbs further), beating a lower one
 * less; losing to a higher-ranked player costs less, losing to a lower one more
 * (and losing to a player at the very bottom of the ladder earns nothing).
 * Conceding earns half the experience, and no currency.
 */
export function gameReward(kind: GameKind, won: boolean, opts: { me?: number; rival?: number; conceded?: boolean } = {}): Reward {
  const base = PROGRESSION.rewards[kind][won ? 'win' : 'loss'];
  if (opts.conceded) return { stardust: 0, flux: 0, xp: Math.round(base.xp / 2), ...(kind === 'ranked' ? { rank: -rankLoss(opts.me ?? 0, opts.rival ?? 0) } : {}) };
  if (kind !== 'ranked') return { ...base };
  const me = opts.me ?? 0, rival = opts.rival ?? 0;
  // Stages the rival sits above you (negative: below).
  const gap = stageIndex(rival) - stageIndex(me);
  let mult: number;
  if (won) mult = Math.max(0.4, 1 + PROGRESSION.winPerStage * gap);
  else if (gap < 0 && atFloor(rival)) mult = 0;
  else mult = Math.max(0, Math.min(1.6, 1 + PROGRESSION.lossPerStage * gap));
  const scale = (n: number) => Math.round(n * mult);
  return { stardust: scale(base.stardust), flux: scale(base.flux), xp: scale(base.xp), rank: won ? rankWin(me, rival) : -rankLoss(me, rival) };
}

function rankWin(me: number, rival: number): number {
  const gap = stageIndex(rival) - stageIndex(me);
  return Math.round(Math.min(45, Math.max(8, PROGRESSION.rankWin * (1 + PROGRESSION.rankPerStage * gap))));
}

function rankLoss(me: number, rival: number): number {
  const gap = stageIndex(rival) - stageIndex(me);
  return Math.round(Math.min(40, Math.max(6, PROGRESSION.rankLoss * (1 - PROGRESSION.rankPerStage * gap))));
}

/** Rank points after a ranked game (never below the bottom of the ladder). */
export function applyRank(rankPoints: number, change: number): number {
  return Math.max(0, rankPoints + change);
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** Experience needed to go from `level` to the next. */
export function xpToNext(level: number): number {
  return PROGRESSION.levelBase + PROGRESSION.levelStep * (level - 1);
}

/** Add experience: the new level and leftover experience, and how many levels were gained. */
export function addXp(level: number, xp: number, gain: number): { level: number; xp: number; levelsGained: number } {
  let l = level, x = xp + gain, gained = 0;
  while (x >= xpToNext(l)) {
    x -= xpToNext(l);
    l += 1;
    gained += 1;
  }
  return { level: l, xp: x, levelsGained: gained };
}

// ---------------------------------------------------------------------------
// The collection
// ---------------------------------------------------------------------------

/** Card id → copies owned. */
export type Collection = Record<string, number>;

/** The copies every player starts with: enough of each card to play every race's starter deck. */
export function starterGrant(): Collection {
  const grant: Collection = {};
  for (const d of PRESET_DECKS) {
    const counts: Collection = {};
    for (const id of d.cards) counts[id] = (counts[id] ?? 0) + 1;
    for (const [id, n] of Object.entries(counts)) grant[id] = Math.max(grant[id] ?? 0, n);
  }
  return grant;
}

export function craftCost(id: string): number {
  return PROGRESSION.craft[rarityOf(id)];
}

export function breakdownValue(id: string): number {
  return Math.round(craftCost(id) * PROGRESSION.breakdownShare);
}

/** Copies of a card that can be broken down: those beyond the starter grant (starter cards are kept). */
export function breakable(collection: Collection, id: string): number {
  return Math.max(0, (collection[id] ?? 0) - (starterGrant()[id] ?? 0));
}

/** Whether another copy of a card would still be any use in a deck. */
export function wantsCopy(collection: Collection, id: string): boolean {
  return (collection[id] ?? 0) < copyLimit(id);
}

/** Whether a deck can be built from a collection (every copy owned). */
export function ownsDeck(collection: Collection, cards: string[]): boolean {
  const need: Collection = {};
  for (const id of cards) need[id] = (need[id] ?? 0) + 1;
  return Object.entries(need).every(([id, n]) => (collection[id] ?? 0) >= n);
}

// ---------------------------------------------------------------------------
// Booster packs
// ---------------------------------------------------------------------------

/** One booster per race (its cards), and a general booster (every card of no race). */
export type BoosterKind = 0 | 1 | 2 | 3 | 'general';
export const BOOSTERS: BoosterKind[] = [0, 1, 2, 3, 'general'];

/** The cards a booster can hold. */
export function boosterPool(kind: BoosterKind): CardDef[] {
  return CARDS.filter((c) => (kind === 'general' ? c.race === undefined : c.race === kind));
}

export interface BoosterCard {
  id: string;
  /** The first copy you own. */
  isNew?: boolean;
  /** Already owned as many as a deck can use: it comes as flux instead. */
  flux?: number;
}

/**
 * Open a booster: five cards from its pool. Most are White Dwarfs; the fourth
 * may be Stellar, and the fifth is Stellar or (sometimes) an Anomaly. A card you
 * already own as many of as a deck can use turns into flux (its breakdown value).
 */
export function openBooster(kind: BoosterKind, collection: Collection, random: () => number): BoosterCard[] {
  const pool = boosterPool(kind);
  const of = (r: Rarity) => pool.filter((c) => rarityOf(c.id) === r);
  const pick = (r: Rarity): CardDef => {
    const list = of(r).length ? of(r) : of('dwarf').length ? of('dwarf') : pool;
    return list[Math.floor(random() * list.length)];
  };
  const rarities: Rarity[] = [];
  for (let i = 0; i < PROGRESSION.boosterSize; i++) {
    if (i < PROGRESSION.boosterSize - 2) rarities.push('dwarf');
    else if (i === PROGRESSION.boosterSize - 2) rarities.push(random() < 0.3 ? 'stellar' : 'dwarf');
    else rarities.push(random() < 0.18 ? 'anomaly' : 'stellar');
  }
  const owned = { ...collection };
  return rarities.map((r) => {
    const c = pick(r);
    if (!wantsCopy(owned, c.id)) return { id: c.id, flux: breakdownValue(c.id) };
    const isNew = !owned[c.id];
    owned[c.id] = (owned[c.id] ?? 0) + 1;
    return isNew ? { id: c.id, isNew } : { id: c.id };
  });
}
