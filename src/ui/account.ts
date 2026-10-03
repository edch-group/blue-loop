/**
 * Your account (see server/accounts.ts): sign up or sign in with an email and a
 * password, and your progress (profile, decks, campaign and settings) is kept
 * on the server, so it follows you to any device. Without one you play as a
 * guest, and progress stays on this device.
 *
 * This device keeps a copy of everything (the game reads it as before); a
 * change is pushed to the account a moment later. Signing in loads the
 * account's copy; signing up takes this device's progress into the new account.
 */

/** What an account's progress is made of: these keys of this device's storage. */
const SYNCED = ['blue-loop:profile:v1', 'blue-loop:decks:v1', 'blue-loop:campaign:v2', 'blue-loop:sound', 'blue-loop:music', 'blue-loop:ai-speed', 'blue-loop:auto-confirm'];
/** The account signed in on this device, and the version of its progress this device last had. */
const ACCOUNT_KEY = 'blue-loop:account';
/** The native app's session token (a browser keeps its session in a cookie that pages can't read). */
const TOKEN_KEY = 'blue-loop:session';
const PUSH_DELAY_MS = 2500;

export interface AccountInfo {
  id: string;
  email: string;
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
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? 'Something went wrong.'), data);
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

function remember(a: { id: string; email: string }, updated: number, token?: unknown) {
  write(ACCOUNT_KEY, { id: a.id, email: a.email, updated });
  if (isNative() && typeof token === 'string') write(TOKEN_KEY, token);
}

/**
 * Create an account: this device's progress becomes the account's. Returns why not, or null once done.
 * (The page reloads after a sign-in or sign-out, so everything reads the new progress.)
 */
export async function signUp(email: string, password: string): Promise<string | null> {
  try {
    const d = await api('signup', 'POST', { email, password, save: collect() });
    remember(d.account as AccountInfo, Number(d.updated), d.token);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Sign in: the account's progress replaces this device's (a new account with none takes this device's). */
export async function logIn(email: string, password: string): Promise<string | null> {
  try {
    const d = await api('login', 'POST', { email, password });
    remember(d.account as AccountInfo, Number(d.updated), d.token);
    if (d.save) apply(d.save);
    else schedulePush(0);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
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
    await api('delete', 'POST', { password });
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
    if (updated > a.updated && d.save) {
      apply(d.save);
      write(ACCOUNT_KEY, { ...a, updated });
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
