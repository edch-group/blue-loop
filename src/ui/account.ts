/**
 * Your account (see server/accounts.ts): everyone plays with one. Sign up with an email and a password
 * (agreeing to the Terms and the Privacy Policy), or with Apple or Google.
 *
 * - The save (name, decks, campaign, settings) lives on this device too, and is pushed to the
 *   account a moment after each change; signing in loads the account's copy.
 * - The economy (level, experience, currencies, collection, rank) is the server's: this device only keeps
 *   a copy to show, and every change to it (boosters, crafting, rewards) is asked of the server.
 */
import { reloadProfile, setEconomy, type EconomyFields } from './profile';

/** What an account's progress is made of: these keys of this device's storage. */
const SYNCED = ['blue-loop:profile:v1', 'blue-loop:decks:v1', 'blue-loop:campaign:v3', 'blue-loop:sound', 'blue-loop:music', 'blue-loop:recent-decks', 'blue-loop:ai-speed', 'blue-loop:auto-confirm', 'blue-loop:hide-starters', 'blue-loop:share-stats'];
/** The account signed in on this device, and the version of its progress this device last had. */
const ACCOUNT_KEY = 'blue-loop:account';
/** The native app's session token (a browser keeps its session in a cookie that pages can't read). */
const TOKEN_KEY = 'blue-loop:session';
const PUSH_DELAY_MS = 2500;

export interface AccountInfo {
  id: string;
  email: string;
  /** Signs in with a password (false: with Apple or Google only). */
  password?: boolean;
  /** The account's picture: a card (its id), dealt by the server when the account was made. */
  avatar?: string;
  /** The server's version of the progress this device has (for spotting a newer copy elsewhere). */
  updated: number;
}

type Save = Record<string, string>;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable.
  }
}

/** The native app (its pages aren't served from the game's own server). */
function isNative(): boolean {
  return location.protocol === 'capacitor:' || location.protocol === 'ionic:' || !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

/** The game's server: the page's own, unless the build names another (VITE_SERVER_URL). */
export function apiBase(): string {
  return ((import.meta.env.VITE_SERVER_URL as string | undefined) || location.origin).replace(/\/$/, '');
}

/** A WebSocket URL with the native app's session on it (a browser's cookie goes by itself). */
export function withSession(url: string): string {
  const token = isNative() ? read<string>(TOKEN_KEY) : null;
  return token ? `${url}${url.includes('?') ? '&' : '?'}session=${token}` : url;
}

export function account(): AccountInfo | null {
  return read<AccountInfo>(ACCOUNT_KEY);
}

class ApiError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown>) {
    super(message);
  }
}

async function api(path: string, method = 'GET', body?: unknown): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = isNative() ? read<string>(TOKEN_KEY) : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include' });
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection.", {});
  }
  // A reply that isn't the account server's (JSON) means this page's address doesn't have it: a host with the
  // game's files only (such as a Pages site), or a build pointing at the wrong server.
  if (!(res.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new ApiError(res.status, `Accounts aren't available at this address (${new URL(apiBase()).host}, error ${res.status}). Open the game from its Worker address instead.`, {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? `Something went wrong (error ${res.status}).`), data);
  return data;
}

/** This device's progress, as it goes to the server. */
function collect(): Save {
  const out: Save = {};
  for (const key of SYNCED) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) out[key] = v;
    } catch {
      // Storage unavailable.
    }
  }
  return out;
}

/** Whether two saves hold the same progress. */
function sameSave(a: unknown, b: Save): boolean {
  if (!a || typeof a !== 'object') return false;
  return SYNCED.every((k) => ((a as Save)[k] ?? null) === (b[k] ?? null));
}

/** Take a copy of the account's progress onto this device (in place of what was here). */
function apply(save: unknown) {
  if (!save || typeof save !== 'object') return;
  for (const key of SYNCED) {
    const v = (save as Save)[key];
    try {
      if (typeof v === 'string') localStorage.setItem(key, v);
      else localStorage.removeItem(key);
    } catch {
      // Storage unavailable.
    }
  }
}

/** A session began (signed up, signed in, or a new password set): keep it, and take up the account's progress. */
function began(d: Record<string, unknown>) {
  const a = d.account as AccountInfo;
  write(ACCOUNT_KEY, { id: a.id, email: a.email, password: a.password, avatar: a.avatar, updated: Number(d.updated) });
  if (isNative() && typeof d.token === 'string') write(TOKEN_KEY, d.token);
  if (d.save) apply(d.save);
  reloadProfile();
  setEconomy(d.economy as EconomyFields);
  if (!d.save) schedulePush(0);
}

/** What went wrong, and whether it was that a new account must agree to the Terms and the Privacy Policy first. */
export interface AuthResult {
  error: string | null;
  needsAgreement?: boolean;
}

async function session(path: string, payload: unknown): Promise<AuthResult> {
  try {
    began(await api(path, 'POST', payload));
    return { error: null };
  } catch (e) {
    const err = e as ApiError;
    return { error: err.message, needsAgreement: !!err.data?.needsAgreement };
  }
}

/** Create an account (this device's settings and decks come along). The page reloads after, to read it all. */
export function signUp(email: string, password: string, acceptTerms: boolean, acceptPrivacy: boolean): Promise<AuthResult> {
  return session('signup', { email, password, acceptTerms, acceptPrivacy, save: collect() });
}

/** Sign in: the account's progress replaces this device's. */
export function logIn(email: string, password: string): Promise<AuthResult> {
  return session('login', { email, password });
}

/** Sign in with Apple or Google (a new account needs `accept` true: the Terms and the Privacy Policy agreed to). */
export function logInWith(provider: 'apple' | 'google', idToken: string, nonce: string, accept = false): Promise<AuthResult> {
  return session('oauth', { provider, idToken, nonce, acceptTerms: accept, acceptPrivacy: accept, save: collect() });
}

/** Ask for a password-reset email. Returns why not, or null (sent, if the account exists). */
export async function requestReset(email: string): Promise<string | null> {
  try {
    await api('reset/request', 'POST', { email });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Set a new password from a reset link's token (and sign in). */
export function confirmReset(token: string, password: string): Promise<AuthResult> {
  return session('reset/confirm', { token, password });
}

/** What the server offers: Apple and Google sign-in (their app ids), password reset by email, and the documents' versions. */
export interface ServerConfig {
  google: string | null;
  apple: string | null;
  reset: boolean;
}
let configCache: Promise<ServerConfig> | null = null;
export function serverConfig(): Promise<ServerConfig> {
  configCache ??= api('config').then(
    (d) => ({ google: (d.google as string) || null, apple: (d.apple as string) || null, reset: !!d.reset }),
    () => {
      configCache = null;
      return { google: null, apple: null, reset: false };
    },
  );
  return configCache;
}

// ---------------------------------------------------------------------------
// The economy: asked of the server
// ---------------------------------------------------------------------------

/** Ask the server to change the economy; the copy here takes up its answer. Returns the answer, or throws why not. */
async function economyCall(path: string, payload: unknown): Promise<Record<string, unknown>> {
  const d = await api(path, 'POST', payload);
  if (d.economy) setEconomy(d.economy as EconomyFields);
  return d;
}

/** Buy and open a booster. Its cards, or why not. */
export async function buyBooster(kind: number | 'general'): Promise<{ cards: { id: string; isNew: boolean; flux: number }[] } | { error: string }> {
  try {
    const d = await economyCall('booster', { kind });
    return { cards: d.cards as { id: string; isNew: boolean; flux: number }[] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Craft a copy of a card, or break one down. Why not, or null once done. */
export async function craftCard(id: string): Promise<string | null> {
  try {
    await economyCall('craft', { id });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
export async function breakCard(id: string): Promise<string | null> {
  try {
    await economyCall('breakdown', { id });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** A game against the AI begins: the server notes it, so its reward can be paid once it ends. Its id (null: offline). */
export async function startAiGame(): Promise<string | null> {
  try {
    return String((await api('game/start', 'POST', { kind: 'ai' })).gameId);
  } catch {
    return null;
  }
}

const SHARE_STATS_KEY = 'blue-loop:share-stats';
declare const __GAME_VERSION__: string;

/** Whether anonymous game summaries are sent (on unless switched off in the settings). */
export function sharingStats(): boolean {
  try {
    return localStorage.getItem(SHARE_STATS_KEY) !== '0';
  } catch {
    return true;
  }
}
export function setSharingStats(on: boolean) {
  try {
    localStorage.setItem(SHARE_STATS_KEY, on ? '1' : '0');
  } catch {
    // Not available.
  }
}

/**
 * A finished game's anonymous summary (src/engine/stats.ts: the decks, the result, the cards played; nothing
 * about the players), sent for balancing unless switched off. Never in the way: a failure is just dropped.
 */
export function sendGameStats(stats: unknown) {
  if (!sharingStats() || !account()) return;
  const version = typeof __GAME_VERSION__ === 'string' ? __GAME_VERSION__ : 'dev';
  void api('stats', 'POST', { stats, version }).catch(() => undefined);
}

/** A game against the AI ended: the server pays its reward (null: none, e.g. too short, or today's limit reached). */
export async function finishAiGame(gameId: string, won: boolean, conceded: boolean): Promise<Payout | null> {
  try {
    return ((await economyCall('game/finish', { gameId, won, conceded })).payout as Payout | null) ?? null;
  } catch {
    return null;
  }
}

/** Take up the account's economy as the server has it now (after an online game, which the server paid). */
export async function refreshEconomy() {
  try {
    const d = await api('me');
    setEconomy(d.economy as EconomyFields);
  } catch {
    // Offline: the copy here stands.
  }
}

/** What a game paid (the reward, with any level-up bonus). */
export interface Payout {
  stardust: number;
  flux: number;
  xp: number;
  rank?: number;
  levelsGained: number;
  bonus: { stardust: number; flux: number };
}

/** Sign out: the account's progress leaves this device (it is on the server), and you're a new guest here. */
export async function logOut() {
  await flush();
  try {
    await api('logout', 'POST', {});
  } catch {
    // Signed out here regardless.
  }
  write(ACCOUNT_KEY, null);
  write(TOKEN_KEY, null);
  for (const key of SYNCED) write(key, null);
}

/** Delete the account and everything in it. Returns why not, or null once done. */
export async function deleteAccount(password: string): Promise<string | null> {
  try {
    await api('delete', 'POST', { password, confirm: password });
  } catch (e) {
    return (e as Error).message;
  }
  write(ACCOUNT_KEY, null);
  write(TOKEN_KEY, null);
  for (const key of SYNCED) write(key, null);
  return null;
}

let timer: number | null = null;
let pushing: Promise<void> | null = null;
/** Told when another device's newer progress has replaced this one's (the page should reload). */
let onReplaced: (() => void) | null = null;

export function onProgressReplaced(fn: () => void) {
  onReplaced = fn;
}

/** Progress changed on this device: send it to the account shortly (several changes go together). */
export function markDirty() {
  if (account()) schedulePush(PUSH_DELAY_MS);
}

function schedulePush(delay: number) {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void push();
  }, delay);
}

async function push(): Promise<void> {
  const a = account();
  if (!a) return;
  if (pushing) await pushing;
  pushing = (async () => {
    try {
      const d = await api('save', 'PUT', { save: collect(), base: a.updated });
      write(ACCOUNT_KEY, { ...a, updated: Number(d.updated) });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        // Another device saved first: its progress wins, and this device takes it up.
        apply(err.data.save);
        write(ACCOUNT_KEY, { ...a, updated: Number(err.data.updated) });
        onReplaced?.();
      } else if (err.status === 401) {
        // The session ended (signed out elsewhere, or expired): keep playing here as a guest copy.
        write(ACCOUNT_KEY, null);
      } else {
        // Offline: try again later.
        schedulePush(30_000);
      }
    } finally {
      pushing = null;
    }
  })();
  return pushing;
}

/** Send anything still waiting, now. */
export async function flush() {
  if (timer === null) return;
  window.clearTimeout(timer);
  timer = null;
  await push();
}

/**
 * On opening the game: check the session is still good, and take up a newer copy of the progress if
 * another device saved one. Resolves true if this device's progress was replaced (reload to read it).
 */
export async function checkIn(): Promise<boolean> {
  const a = account();
  if (!a) return false;
  try {
    const d = await api('me');
    const updated = Number(d.updated);
    // The economy and the picture are the server's: take them up every time.
    setEconomy(d.economy as EconomyFields);
    a.avatar = (d.account as AccountInfo | undefined)?.avatar ?? a.avatar;
    write(ACCOUNT_KEY, a);
    if (updated > a.updated && d.save) {
      write(ACCOUNT_KEY, { ...a, updated });
      // Only a copy that differs from this device's needs taking up (and a reload to read it).
      if (sameSave(d.save, collect())) return false;
      apply(d.save);
      return true;
    }
    if (updated < a.updated || !d.save) schedulePush(0);
    return false;
  } catch (e) {
    if ((e as ApiError).status === 401) write(ACCOUNT_KEY, null);
    return false;
  }
}

// Changes are pushed before the page goes away (as far as the browser allows).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}
