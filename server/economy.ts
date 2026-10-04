import {
  addXp,
  BOOSTERS,
  breakable,
  breakdownValue,
  cardDef,
  CARDS,
  copyLimit,
  craftCost,
  gameReward,
  openBooster,
  PROGRESSION,
  starterGrant,
  type BoosterCard,
  type BoosterKind,
  type Collection,
  type GameKind,
  type Reward,
} from '../src/engine';

/**
 * An account's economy: level, experience, both currencies, the card collection, rank and record. The
 * server keeps it, and only the actions here change it (no Cloudflare dependencies: tested directly in
 * tests/economy.test.ts).
 */
export interface Economy {
  level: number;
  xp: number;
  stardust: number;
  flux: number;
  collection: Collection;
  /** Ranked standing (null: never played ranked). */
  rankPoints: number | null;
  played: number;
  won: number;
}

/** What a game paid, as the player sees it: the reward, plus any level-up bonus folded in. */
export interface Payout extends Reward {
  levelsGained: number;
  bonus: { stardust: number; flux: number };
}

/** A new account's economy: every card, and enough stardust for a first booster. */
export function freshEconomy(): Economy {
  return { level: 1, xp: 0, stardust: PROGRESSION.boosterPrice, flux: 0, collection: starterGrant(), rankPoints: null, played: 0, won: 0 };
}

/** An economy read back from storage, made whole (every card is unlocked: the collection is topped up to the full set). */
export function normaliseEconomy(raw: unknown): Economy {
  const e = { ...freshEconomy(), ...(raw && typeof raw === 'object' ? (raw as Partial<Economy>) : {}) };
  const known = new Set(CARDS.map((c) => c.id));
  const collection: Collection = {};
  for (const [id, n] of Object.entries(e.collection ?? {})) if (known.has(id) && n > 0) collection[id] = Math.floor(n);
  for (const [id, n] of Object.entries(starterGrant())) collection[id] = Math.max(collection[id] ?? 0, n);
  return { ...e, collection };
}

/** Pay out a game's reward (and any level-up bonus). */
export function payReward(e: Economy, r: Reward, won: boolean): Payout {
  const lv = addXp(e.level, e.xp, r.xp);
  const bonus = { stardust: PROGRESSION.levelReward.stardust * lv.levelsGained, flux: PROGRESSION.levelReward.flux * lv.levelsGained };
  e.level = lv.level;
  e.xp = lv.xp;
  e.stardust += r.stardust + bonus.stardust;
  e.flux += r.flux + bonus.flux;
  e.played += 1;
  if (won) e.won += 1;
  return { ...r, levelsGained: lv.levelsGained, bonus };
}

/** A game's reward, by kind and result (ranked rewards come from the ladder, which knows both ranks). */
export function rewardFor(kind: GameKind, won: boolean, conceded: boolean): Reward {
  return gameReward(kind, won, { conceded });
}

export function isBoosterKind(k: unknown): k is BoosterKind {
  return (BOOSTERS as readonly unknown[]).includes(k);
}

/** Buy and open a booster: its cards join the collection (surplus copies come as flux). Throws why not. */
export function buyBooster(e: Economy, kind: BoosterKind, random: () => number = Math.random): BoosterCard[] {
  if (e.stardust < PROGRESSION.boosterPrice) throw new Error(`A booster costs ✦${PROGRESSION.boosterPrice} stardust.`);
  e.stardust -= PROGRESSION.boosterPrice;
  const cards = openBooster(kind, e.collection, random);
  for (const c of cards) {
    if (c.flux) e.flux += c.flux;
    else e.collection[c.id] = (e.collection[c.id] ?? 0) + 1;
  }
  return cards;
}

function knownCard(id: unknown): string {
  const s = String(id ?? '');
  if (!CARDS.some((c) => c.id === s)) throw new Error('No such card.');
  return s;
}

/** Craft a copy of a card with flux. Throws why not. */
export function craft(e: Economy, rawId: unknown) {
  const id = knownCard(rawId);
  const cost = craftCost(id);
  if ((e.collection[id] ?? 0) >= copyLimit(id)) throw new Error(`You already have as many ${cardDef(id).name} as a deck can hold.`);
  if (e.flux < cost) throw new Error(`Crafting ${cardDef(id).name} takes ⟁${cost} flux.`);
  e.flux -= cost;
  e.collection[id] = (e.collection[id] ?? 0) + 1;
}

/** Break a copy of a card down for flux (starter cards can't be). Throws why not. */
export function breakDown(e: Economy, rawId: unknown) {
  const id = knownCard(rawId);
  if (breakable(e.collection, id) <= 0) throw new Error(`${cardDef(id).name} is one of your starter cards: it can't be broken down.`);
  e.collection[id] -= 1;
  e.flux += breakdownValue(id);
}
