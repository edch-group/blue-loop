import {
  addXp,
  breakable,
  breakdownValue,
  cardDef,
  craftCost,
  openBooster,
  PROGRESSION,
  starterGrant,
  type BoosterCard,
  type BoosterKind,
  type Collection,
  type Reward,
} from '../engine';
import { markDirty } from './account';

/**
 * The player's profile on this device: level, experience, both currencies and
 * the card collection (see src/engine/progression.ts for the rules). Ranked
 * standing lives on the server; `rankPoints` is the last one it told us.
 */
export interface Profile {
  /** Identifies this player to the ranked server. */
  id: string;
  /** The name and emblem (a race, 0–3) they signed in with (empty: not signed in yet). */
  name: string;
  avatar: number;
  /** Signed in on this device right now (signing out returns to the title screen). */
  signedIn?: boolean;
  level: number;
  xp: number;
  stardust: number;
  flux: number;
  collection: Collection;
  /** Ranked standing, as last reported by the server (null: never played ranked). */
  rankPoints: number | null;
  /** Games played and won, for the record. */
  played: number;
  won: number;
}

const KEY = 'blue-loop:profile:v1';
let cached: Profile | null = null;

function fresh(): Profile {
  const id = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  // Every player starts with the starter decks' cards, and enough stardust for a first booster.
  return { id, name: '', avatar: 0, level: 1, xp: 0, stardust: PROGRESSION.boosterPrice, flux: 0, collection: starterGrant(), rankPoints: null, played: 0, won: 0 };
}

export function profile(): Profile {
  if (cached) return cached;
  let p: Profile | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    p = raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    p = null;
  }
  if (!p || typeof p.id !== 'string' || typeof p.collection !== 'object') p = fresh();
  p.name ??= '';
  p.avatar ??= 0;
  // Cards added to the starter decks since are granted too.
  for (const [id, n] of Object.entries(starterGrant())) p.collection[id] = Math.max(p.collection[id] ?? 0, n);
  cached = p;
  store();
  return p;
}

function store() {
  try {
    if (cached) localStorage.setItem(KEY, JSON.stringify(cached));
    markDirty();
  } catch {
    // Storage unavailable: progress lasts for this session only.
  }
}

export function owned(id: string): number {
  return profile().collection[id] ?? 0;
}

export interface RewardResult extends Reward {
  levelsGained: number;
  /** The level-up bonus included in the totals above. */
  bonus: { stardust: number; flux: number };
}

/** Pay out a game's reward (and any level-up bonus). */
export function grantReward(r: Reward, won: boolean): RewardResult {
  const p = profile();
  const lv = addXp(p.level, p.xp, r.xp);
  const bonus = { stardust: PROGRESSION.levelReward.stardust * lv.levelsGained, flux: PROGRESSION.levelReward.flux * lv.levelsGained };
  p.level = lv.level;
  p.xp = lv.xp;
  p.stardust += r.stardust + bonus.stardust;
  p.flux += r.flux + bonus.flux;
  p.played += 1;
  if (won) p.won += 1;
  store();
  return { ...r, levelsGained: lv.levelsGained, bonus };
}

/** Sign in on this device: the name and emblem the player goes by. */
export function signIn(name: string, avatar: number) {
  const p = profile();
  p.name = name.replace(/[^\p{L}\p{N} '’.-]/gu, '').trim().slice(0, 18) || 'Commander';
  p.avatar = ((avatar % 4) + 4) % 4;
  p.signedIn = true;
  store();
}

export function signOut() {
  profile().signedIn = false;
  store();
}

/** Whether the player has signed in (and not out since). */
export function signedIn(): boolean {
  const p = profile();
  return !!p.name && p.signedIn !== false;
}

export function setRankPoints(rp: number) {
  profile().rankPoints = rp;
  store();
}

/** Buy and open a booster: its cards join the collection (surplus copies come as flux). Null if you can't afford it. */
export function buyBooster(kind: BoosterKind): BoosterCard[] | null {
  const p = profile();
  if (p.stardust < PROGRESSION.boosterPrice) return null;
  p.stardust -= PROGRESSION.boosterPrice;
  const cards = openBooster(kind, p.collection, Math.random);
  for (const c of cards) {
    if (c.flux) p.flux += c.flux;
    else p.collection[c.id] = (p.collection[c.id] ?? 0) + 1;
  }
  store();
  return cards;
}

/** Craft a copy of a card with flux. Returns why not, or null once done. */
export function craft(id: string): string | null {
  const p = profile();
  const cost = craftCost(id);
  if (p.flux < cost) return `Crafting ${cardDef(id).name} takes ⟁${cost} flux.`;
  p.flux -= cost;
  p.collection[id] = (p.collection[id] ?? 0) + 1;
  store();
  return null;
}

/** Break a copy of a card down for flux (starter cards can't be). Returns why not, or null once done. */
export function breakDown(id: string): string | null {
  const p = profile();
  if (breakable(p.collection, id) <= 0) return `${cardDef(id).name} is one of your starter cards: it can't be broken down.`;
  p.collection[id] -= 1;
  p.flux += breakdownValue(id);
  store();
  return null;
}
