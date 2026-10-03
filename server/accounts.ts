/**
 * Accounts: sign up and sign in with an email and a password, and keep each
 * account's progress (profile, decks, campaign, settings) in D1 so it follows
 * the player to any device.
 *
 * - Passwords are hashed with PBKDF2-SHA-256 (100,000 rounds, a random salt each).
 * - A session is a random token. The browser holds it in an HTTP-only cookie (the
 *   native app, whose pages aren't on our origin, sends it as a Bearer header);
 *   the database keeps only its SHA-256, so a leaked database signs no one in.
 * - Sign-in attempts are rate-limited per email and per address.
 *
 * Routes (all JSON, under /api):
 *   POST /api/signup  { email, password, save? }  → { account, token, save, updated }
 *   POST /api/login   { email, password }         → { account, token, save, updated }
 *   POST /api/logout                               → { ok }
 *   GET  /api/me                                   → { account, save, updated }
 *   PUT  /api/save    { save, base }               → { updated }   (409 + the newer copy if `base` is stale)
 *   POST /api/delete  { password }                 → { ok }   (the account and everything in it)
 */

export interface AccountsEnv {
  DB: D1Database;
}

const COOKIE = 'bl_session';
const SESSION_DAYS = 90;
const PBKDF2_ROUNDS = 100_000;
/** At most this many sign-in attempts per email, and per address, in a window. */
const ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
/** A saved progress document can be at most this big. */
const MAX_SAVE_BYTES = 512 * 1024;
/** Pages allowed to call the API from another origin (the native app's own). */
const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost']);

export interface Account {
  id: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (tested in tests/accounts.test.ts)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ROUNDS }, key, 256);
  return toHex(bits);
}

/** Compare two hex strings in constant time (no early exit on the first difference). */
export function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function normaliseEmail(raw: unknown): string | null {
  const email = String(raw ?? '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Why a password won't do, or null if it will. */
export function passwordProblem(raw: unknown): string | null {
  const p = String(raw ?? '');
  if (p.length < 8) return 'Use at least 8 characters for your password.';
  if (p.length > 200) return 'That password is too long.';
  return null;
}

/**
 * The session token a request carries: the Bearer header (native app), the cookie (browser), or (for
 * the native app's WebSockets, which can't set headers) `?session=` on the URL.
 */
export function sessionToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  const q = new URL(request.url).searchParams.get('session');
  if (q && /^[a-f0-9]{64}$/.test(q)) return q;
  const cookie = request.headers.get('Cookie') ?? '';
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`).exec(cookie);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function handleAccounts(request: Request, env: AccountsEnv): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const route = `${request.method} ${url.pathname}`;
    let res: Response;
    switch (route) {
      case 'POST /api/signup':
        res = await signup(request, env);
        break;
      case 'POST /api/login':
        res = await login(request, env);
        break;
      case 'POST /api/logout':
        res = await logout(request, env);
        break;
      case 'GET /api/me':
        res = await me(request, env);
        break;
      case 'PUT /api/save':
        res = await putSave(request, env);
        break;
      case 'POST /api/delete':
        res = await deleteAccount(request, env);
        break;
      default:
        throw new HttpError(404, 'Not found.');
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, 'Something went wrong. Try again.');
    if (!(e instanceof HttpError)) console.error(e);
    return Response.json({ error: err.message, ...err.extra }, { status: err.status, headers: cors });
  }
}

function corsHeaders(origin: string | null, url: URL): Record<string, string> {
  // Same-origin pages need nothing; the native app's pages get credentials and the Bearer header.
  if (!origin || origin === url.origin || !NATIVE_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const len = Number(request.headers.get('Content-Length') ?? 0);
  if (len > MAX_SAVE_BYTES + 4096) throw new HttpError(413, 'That is too much to save.');
  try {
    const b = await request.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'Bad request.');
  }
}

/** A save document, checked: an object, and not too big. Null if none was sent. */
function saveOf(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Bad save.');
  const text = JSON.stringify(raw);
  if (enc.encode(text).length > MAX_SAVE_BYTES) throw new HttpError(413, 'That is too much to save.');
  return text;
}

/** Count an attempt against a key; throws once there have been too many in the window. */
async function limit(env: AccountsEnv, key: string) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT count, window_start FROM attempts WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (row && now - row.window_start < ATTEMPT_WINDOW_MS) {
    if (row.count >= ATTEMPTS) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');
    await env.DB.prepare('UPDATE attempts SET count = count + 1 WHERE key = ?').bind(key).run();
  } else {
    await env.DB.prepare('INSERT OR REPLACE INTO attempts (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
  }
}

function clientAddress(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** Start a session: the token goes back in a cookie (and in the body, for the native app). */
async function startSession(env: AccountsEnv, account: Account, request: Request, payload: Record<string, unknown>): Promise<Response> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), account.id, now, now + SESSION_DAYS * 86400_000)
    .run();
  // Tidy away this account's expired sessions while we're here.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires < ?').bind(account.id, now).run();
  const res = Response.json({ account, token, ...payload });
  res.headers.append('Set-Cookie', cookie(token, SESSION_DAYS * 86400, new URL(request.url)));
  return res;
}

function cookie(value: string, maxAge: number, url: URL): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  // (Path=/ so the game's WebSockets, for rooms and the ranked ladder, carry it too.)
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** The signed-in account behind a request, or null (a guest). */
export async function accountOf(request: Request, env: AccountsEnv): Promise<Account | null> {
  try {
    const { id, email } = await requireAccount(request, env);
    return { id, email };
  } catch {
    return null;
  }
}

/** The signed-in account, or a 401. */
async function requireAccount(request: Request, env: AccountsEnv): Promise<Account & { tokenHash: string }> {
  const token = sessionToken(request);
  if (!token) throw new HttpError(401, 'Not signed in.');
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT u.id, u.email, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .bind(tokenHash)
    .first<{ id: string; email: string; expires: number }>();
  if (!row || row.expires < Date.now()) throw new HttpError(401, 'Not signed in.');
  return { id: row.id, email: row.email, tokenHash };
}

async function loadSave(env: AccountsEnv, userId: string): Promise<{ save: unknown; updated: number }> {
  const row = await env.DB.prepare('SELECT data, updated FROM saves WHERE user_id = ?').bind(userId).first<{ data: string; updated: number }>();
  return row ? { save: JSON.parse(row.data), updated: row.updated } : { save: null, updated: 0 };
}

async function signup(request: Request, env: AccountsEnv): Promise<Response> {
  const b = await body(request);
  const email = normaliseEmail(b.email);
  if (!email) throw new HttpError(400, 'Enter a valid email address.');
  const problem = passwordProblem(b.password);
  if (problem) throw new HttpError(400, problem);
  await limit(env, `signup:${clientAddress(request)}`);
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (exists) throw new HttpError(409, 'There is already an account with that email. Sign in instead.');
  const id = randomToken(12);
  const salt = randomToken(16);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO users (id, email, pass_hash, salt, created) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, await hashPassword(String(b.password), salt), salt, now)
    .run();
  // The progress made on this device so far becomes the account's.
  const save = saveOf(b.save);
  if (save) await env.DB.prepare('INSERT INTO saves (user_id, data, updated) VALUES (?, ?, ?)').bind(id, save, now).run();
  return startSession(env, { id, email }, request, { save: save ? JSON.parse(save) : null, updated: save ? now : 0 });
}

async function login(request: Request, env: AccountsEnv): Promise<Response> {
  const b = await body(request);
  const email = normaliseEmail(b.email);
  if (!email) throw new HttpError(400, 'Enter a valid email address.');
  await limit(env, `login:${email}`);
  await limit(env, `login-ip:${clientAddress(request)}`);
  const row = await env.DB.prepare('SELECT id, pass_hash, salt FROM users WHERE email = ?').bind(email).first<{ id: string; pass_hash: string; salt: string }>();
  // The same work and the same answer whether or not the email has an account.
  const hash = await hashPassword(String(b.password ?? ''), row?.salt ?? '00'.repeat(16));
  if (!row || !sameHex(hash, row.pass_hash)) throw new HttpError(401, 'That email and password don\'t match.');
  const { save, updated } = await loadSave(env, row.id);
  return startSession(env, { id: row.id, email }, request, { save, updated });
}

async function logout(request: Request, env: AccountsEnv): Promise<Response> {
  const token = sessionToken(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', cookie('', 0, new URL(request.url)));
  return res;
}

async function me(request: Request, env: AccountsEnv): Promise<Response> {
  const a = await requireAccount(request, env);
  const { save, updated } = await loadSave(env, a.id);
  return Response.json({ account: { id: a.id, email: a.email }, save, updated });
}

async function putSave(request: Request, env: AccountsEnv): Promise<Response> {
  const a = await requireAccount(request, env);
  const b = await body(request);
  const save = saveOf(b.save);
  if (!save) throw new HttpError(400, 'Nothing to save.');
  const base = Number(b.base ?? 0);
  const current = await loadSave(env, a.id);
  // Another device saved since this one last loaded: send the newer copy back rather than overwrite it.
  if (current.updated > base) throw new HttpError(409, 'Your progress changed on another device.', { save: current.save, updated: current.updated });
  const now = Math.max(Date.now(), current.updated + 1);
  await env.DB.prepare('INSERT INTO saves (user_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated = excluded.updated')
    .bind(a.id, save, now)
    .run();
  return Response.json({ updated: now });
}

async function deleteAccount(request: Request, env: AccountsEnv): Promise<Response> {
  const a = await requireAccount(request, env);
  const b = await body(request);
  await limit(env, `login:${a.email}`);
  const row = await env.DB.prepare('SELECT pass_hash, salt FROM users WHERE id = ?').bind(a.id).first<{ pass_hash: string; salt: string }>();
  if (!row || !sameHex(await hashPassword(String(b.password ?? ''), row.salt), row.pass_hash)) throw new HttpError(401, 'That password isn\'t right.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(a.id),
    env.DB.prepare('DELETE FROM saves WHERE user_id = ?').bind(a.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(a.id),
  ]);
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', cookie('', 0, new URL(request.url)));
  return res;
}
