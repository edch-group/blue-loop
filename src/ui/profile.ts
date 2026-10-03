import { PROGRESSION, starterGrant, type Collection } from '../engine';
import { account, markDirty } from './account';

/**
 * The player's profile on this device: the name and emblem they go by (theirs, synced to their account),
 * and a copy of their account's economy (level, experience, currencies, collection, rank), which only the
 * server changes (see src/ui/account.ts). Rules: src/engine/progression.ts.
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

/** The economy's fields, as the server sends them (it alone changes them: see src/ui/account.ts). */
export type EconomyFields = Pick<Profile, 'level' | 'xp' | 'stardust' | 'flux' | 'collection' | 'rankPoints' | 'played' | 'won'>;

/** Take up the account's economy, as the server has it. */
export function setEconomy(e: EconomyFields | null | undefined) {
  if (!e || typeof e !== 'object') return;
  const p = profile();
  Object.assign(p, {
    level: e.level,
    xp: e.xp,
    stardust: e.stardust,
    flux: e.flux,
    collection: { ...e.collection },
    rankPoints: e.rankPoints,
    played: e.played,
    won: e.won,
  });
  store();
}

/** Read the profile afresh from this device's storage (after the account's copy was put there). */
export function reloadProfile() {
  cached = null;
}

/** Set the name and emblem the player goes by. */
export function signIn(name: string, avatar: number) {
  const p = profile();
  p.name = name.replace(/[^\p{L}\p{N} '’.-]/gu, '').trim().slice(0, 18) || 'Commander';
  p.avatar = ((avatar % 4) + 4) % 4;
  p.signedIn = true;
  store();
}

/** Whether the player is signed in to an account and has named themselves. */
export function signedIn(): boolean {
  return !!account() && !!profile().name;
}
