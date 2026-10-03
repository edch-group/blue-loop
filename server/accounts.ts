/**
 * Accounts: every player has one (there is no guest play). Sign up with an email and a password (or with
 * Apple or Google), agreeing to the Terms and the Privacy Policy; the account keeps the player's progress
 * in D1 so it follows them to any device.
 *
 * Two kinds of progress:
 * - **The save** (name and emblem, decks, campaign, settings): the device's own, synced as it changes.
 * - **The economy** (level, experience, stardust, flux, the collection, rank, record): the server's alone.
 *   It changes only through the server's actions here (boosters, crafting, breaking down, rewards), so
 *   editing a device's storage changes nothing that counts.
 *
 * Security:
 * - Passwords are hashed with PBKDF2-SHA-256 (100,000 rounds, a random salt each).
 * - A session is a random token. The browser holds it in an HTTP-only cookie (the native app, whose pages
 *   aren't on our origin, sends it as a Bearer header); the database keeps only its SHA-256.
 * - Sign-in, sign-up and reset attempts are rate-limited per email and per address.
 * - Apple and Google ID tokens are checked against the provider's public keys, our app id and a nonce.
 *
 * Routes (all JSON, under /api): see `handleAccounts`.
 */

import { COOKIE, hashPassword, normaliseEmail, passwordProblem, PROVIDERS, randomToken, sameHex, sessionToken, sha256, verifyIdToken } from './auth';
import { breakDown, buyBooster, craft, freshEconomy, isBoosterKind, normaliseEconomy, payReward, rewardFor, type Economy, type Payout } from './economy';
import type { GameKind, Reward } from '../src/engine';

export interface AccountsEnv {
  DB: D1Database;
  /** Password reset emails (Resend): an API key (a secret), and the address they come from. */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** Sign in with Google: the OAuth web client id. */
  GOOGLE_CLIENT_ID?: string;
  /** Sign in with Apple: the Services ID. */
  APPLE_SERVICE_ID?: string;
}

/** The versions of the Terms of Service and the Privacy Policy a new account agrees to (public/terms.html, privacy.html). */
export const TERMS_VERSION = '2026-10-03';
export const PRIVACY_VERSION = '2026-10-03';

const SESSION_DAYS = 90;
/** At most this many attempts per email, and per address, in a window. */
const ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
/** A saved progress document can be at most this big. */
const MAX_SAVE_BYTES = 512 * 1024;
/** Pages allowed to call the API from another origin (the native app's own). */
const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost']);
/** A game against the AI pays out only if it lasted at least this long, within a day of starting... */
const MIN_GAME_MS = 60_000;
const MAX_GAME_MS = 24 * 3600_000;
/** ...and at most this many pay out in a day. */
const MAX_REWARDED_PER_DAY = 40;
const RESET_MS = 3600_000;

export interface Account {
  id: string;
  email: string;
}

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/**
 *   GET  /api/config                                   → { google, apple, reset, terms, privacy }
 *   POST /api/signup   { email, password, save?, acceptTerms, acceptPrivacy } → session
 *   POST /api/login    { email, password }               → session
 *   POST /api/oauth    { provider, idToken, nonce, acceptTerms?, acceptPrivacy? } → session (428 if a new account must agree first)
 *   POST /api/logout                                     → { ok }
 *   GET  /api/me                                         → { account, save, updated, economy }
 *   PUT  /api/save     { save, base }                    → { updated }   (409 + the newer copy if `base` is stale)
 *   POST /api/delete   { password | confirm }            → { ok }
 *   POST /api/reset/request { email }                    → { ok }   (an email with a link, if the account exists)
 *   POST /api/reset/confirm { token, password }          → session
 *   POST /api/booster  { kind }                          → { cards, economy }
 *   POST /api/craft    { id }                            → { economy }
 *   POST /api/breakdown { id }                           → { economy }
 *   POST /api/game/start  { kind: 'ai' }                 → { gameId }
 *   POST /api/game/finish { gameId, won, conceded }      → { payout, economy }
 * A session response is { account, token, save, updated, economy }.
 */
export async function handleAccounts(request: Request, env: AccountsEnv): Promise<Response> {
  const url = new URL(request.url);
  const cors = corsHeaders(request.headers.get('Origin'), url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const routes: Record<string, (r: Request, e: AccountsEnv) => Promise<Response>> = {
      'GET /api/config': config,
      'POST /api/signup': signup,
      'POST /api/login': login,
      'POST /api/oauth': oauth,
      'POST /api/logout': logout,
      'GET /api/me': me,
      'PUT /api/save': putSave,
      'POST /api/delete': deleteAccount,
      'POST /api/reset/request': resetRequest,
      'POST /api/reset/confirm': resetConfirm,
      'POST /api/booster': booster,
      'POST /api/craft': craftCard,
      'POST /api/breakdown': breakCard,
      'POST /api/game/start': gameStart,
      'POST /api/game/finish': gameFinish,
    };
    const route = routes[`${request.method} ${url.pathname}`];
    if (!route) throw new HttpError(404, 'Not found.');
    const res = await route(request, env);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, 'Something went wrong. Try again.');
    if (!(e instanceof HttpError)) console.error(e);
    return Response.json({ error: err.message, ...err.extra }, { status: err.status, headers: cors });
  }
}

function corsHeaders(origin: string | null, url: URL): Record<string, string> {
  // Same-origin pages need nothing; the native app's pages get the Bearer header through.
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
  if (new TextEncoder().encode(text).length > MAX_SAVE_BYTES) throw new HttpError(413, 'That is too much to save.');
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

function cookie(value: string, maxAge: number, url: URL): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  // (Path=/ so the game's WebSockets, for rooms and the ranked ladder, carry it too.)
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Start a session: the token goes back in a cookie (and in the body, for the native app), with the account's progress. */
async function startSession(env: AccountsEnv, account: Account, request: Request): Promise<Response> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), account.id, now, now + SESSION_DAYS * 86400_000)
    .run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires < ?').bind(account.id, now).run();
  const { save, updated } = await loadSave(env, account.id);
  const res = Response.json({ account: await accountInfo(env, account), token, save, updated, economy: await loadEconomy(env.DB, account.id) });
  res.headers.append('Set-Cookie', cookie(token, SESSION_DAYS * 86400, new URL(request.url)));
  return res;
}

/** An account as the game sees it: its id and email, and whether it has a password (or signs in with Apple or Google only). */
async function accountInfo(env: AccountsEnv, a: Account): Promise<Account & { password: boolean }> {
  const row = await env.DB.prepare("SELECT pass_hash != '' AS has FROM users WHERE id = ?").bind(a.id).first<{ has: number }>();
  return { id: a.id, email: a.email, password: !!row?.has };
}

/** The signed-in account behind a request, or null. */
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

// ---------------------------------------------------------------------------
// The economy: read, and changed only here (each change checks it isn't racing another)
// ---------------------------------------------------------------------------

export async function loadEconomy(db: D1Database, userId: string): Promise<Economy> {
  const row = await db.prepare('SELECT data FROM economy WHERE user_id = ?').bind(userId).first<{ data: string }>();
  return normaliseEconomy(row ? JSON.parse(row.data) : null);
}

/** Change an account's economy: `change` edits it (or throws why not); retried if another change got in first. */
export async function changeEconomy<T>(db: D1Database, userId: string, change: (e: Economy) => T): Promise<{ economy: Economy; result: T }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.prepare('SELECT data, updated FROM economy WHERE user_id = ?').bind(userId).first<{ data: string; updated: number }>();
    const economy = normaliseEconomy(row ? JSON.parse(row.data) : null);
    let result: T;
    try {
      result = change(economy);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const now = Math.max(Date.now(), (row?.updated ?? 0) + 1);
    const data = JSON.stringify(economy);
    const res = row
      ? await db.prepare('UPDATE economy SET data = ?, updated = ? WHERE user_id = ? AND updated = ?').bind(data, now, userId, row.updated).run()
      : await db.prepare('INSERT OR IGNORE INTO economy (user_id, data, updated) VALUES (?, ?, ?)').bind(userId, data, now).run();
    if (res.meta.changes === 1) return { economy, result };
  }
  throw new HttpError(409, 'Busy. Try again.');
}

/** An online game's reward, paid by the room that ran it. */
export async function creditGame(db: D1Database, userId: string, kind: GameKind, won: boolean, conceded: boolean): Promise<Payout> {
  return (await changeEconomy(db, userId, (e) => payReward(e, rewardFor(kind, won, conceded), won))).result;
}

/** A ranked game's reward and new rank, from the ladder (which knows both players' ranks). */
export async function creditRanked(db: D1Database, userId: string, reward: Reward, won: boolean, rankPoints: number): Promise<Payout> {
  return (
    await changeEconomy(db, userId, (e) => {
      e.rankPoints = rankPoints;
      return payReward(e, reward, won);
    })
  ).result;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function config(_request: Request, env: AccountsEnv): Promise<Response> {
  return Response.json({
    google: env.GOOGLE_CLIENT_ID || null,
    apple: env.APPLE_SERVICE_ID || null,
    reset: !!(env.RESEND_API_KEY && env.MAIL_FROM),
    terms: TERMS_VERSION,
    privacy: PRIVACY_VERSION,
  });
}

/** A new account must agree to both documents. */
function requireAgreement(b: Record<string, unknown>) {
  if (b.acceptTerms !== true || b.acceptPrivacy !== true) throw new HttpError(428, 'Agree to the Terms of Service and the Privacy Policy to create an account.', { needsAgreement: true });
}

/** Make an account (a new economy comes with it). */
async function createUser(env: AccountsEnv, email: string, passHash: string, salt: string): Promise<Account> {
  const id = randomToken(12);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, email, pass_hash, salt, created, terms_version, privacy_version, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, email, passHash, salt, now, TERMS_VERSION, PRIVACY_VERSION, now),
    env.DB.prepare('INSERT INTO economy (user_id, data, updated) VALUES (?, ?, ?)').bind(id, JSON.stringify(freshEconomy()), now),
  ]);
  return { id, email };
}

async function signup(request: Request, env: AccountsEnv): Promise<Response> {
  const b = await body(request);
  const email = normaliseEmail(b.email);
  if (!email) throw new HttpError(400, 'Enter a valid email address.');
  const problem = passwordProblem(b.password);
  if (problem) throw new HttpError(400, problem);
  requireAgreement(b);
  await limit(env, `signup:${clientAddress(request)}`);
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (exists) throw new HttpError(409, 'There is already an account with that email. Sign in instead.');
  const salt = randomToken(16);
  const account = await createUser(env, email, await hashPassword(String(b.password), salt), salt);
  // The device's own settings and decks come along (its economy doesn't: that starts fresh, on the server).
  const save = saveOf(b.save);
  if (save) await env.DB.prepare('INSERT INTO saves (user_id, data, updated) VALUES (?, ?, ?)').bind(account.id, save, Date.now()).run();
  return startSession(env, account, request);
}

async function login(request: Request, env: AccountsEnv): Promise<Response> {
  const b = await body(request);
  const email = normaliseEmail(b.email);
  if (!email) throw new HttpError(400, 'Enter a valid email address.');
  await limit(env, `login:${email}`);
  await limit(env, `login-ip:${clientAddress(request)}`);
  const row = await env.DB.prepare('SELECT id, pass_hash, salt FROM users WHERE email = ?').bind(email).first<{ id: string; pass_hash: string; salt: string }>();
  // The same work and the same answer whether or not the email has an account (or a password).
  const hash = await hashPassword(String(b.password ?? ''), row?.salt || '00'.repeat(16));
  if (!row || !row.pass_hash || !sameHex(hash, row.pass_hash)) throw new HttpError(401, "That email and password don't match.");
  return startSession(env, { id: row.id, email }, request);
}

async function oauth(request: Request, env: AccountsEnv): Promise<Response> {
  const b = await body(request);
  const provider = b.provider === 'google' || b.provider === 'apple' ? b.provider : null;
  const audience = provider === 'google' ? env.GOOGLE_CLIENT_ID : provider === 'apple' ? env.APPLE_SERVICE_ID : undefined;
  if (!provider || !audience) throw new HttpError(400, "That sign-in isn't available.");
  await limit(env, `oauth-ip:${clientAddress(request)}`);
  let claims;
  try {
    claims = await verifyIdToken(String(b.idToken ?? ''), PROVIDERS[provider], audience, typeof b.nonce === 'string' ? b.nonce : '');
  } catch (e) {
    throw new HttpError(401, (e as Error).message);
  }
  const known = await env.DB.prepare('SELECT u.id, u.email FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?')
    .bind(provider, claims.sub)
    .first<{ id: string; email: string }>();
  if (known) return startSession(env, known, request);
  const email = normaliseEmail(claims.email);
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  if (!email || !verified) throw new HttpError(400, `Your ${provider === 'apple' ? 'Apple' : 'Google'} account didn't share a verified email.`);
  // An account with that (verified) email already: this sign-in joins it.
  let account = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first<Account>();
  if (!account) {
    requireAgreement(b);
    account = await createUser(env, email, '', '');
  }
  await env.DB.prepare('INSERT OR IGNORE INTO identities (provider, subject, user_id, created) VALUES (?, ?, ?, ?)').bind(provider, claims.sub, account.id, Date.now()).run();
  return startSession(env, account, request);
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
  return Response.json({ account: await accountInfo(env, a), save, updated, economy: await loadEconomy(env.DB, a.id) });
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
  if (!row) throw new HttpError(401, 'Not signed in.');
  // With a password, it confirms; an account made with Apple or Google confirms by typing DELETE.
  const confirmed = row.pass_hash ? sameHex(await hashPassword(String(b.password ?? ''), row.salt), row.pass_hash) : String(b.confirm ?? '').trim().toUpperCase() === 'DELETE';
  if (!confirmed) throw new HttpError(401, row.pass_hash ? "That password isn't right." : 'Type DELETE to confirm.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(a.id),
    env.DB.prepare('DELETE FROM saves WHERE user_id = ?').bind(a.id),
    env.DB.prepare('DELETE FROM economy WHERE user_id = ?').bind(a.id),
    env.DB.prepare('DELETE FROM games WHERE user_id = ?').bind(a.id),
    env.DB.prepare('DELETE FROM resets WHERE user_id = ?').bind(a.id),
    env.DB.prepare('DELETE FROM identities WHERE user_id = ?').bind(a.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(a.id),
  ]);
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', cookie('', 0, new URL(request.url)));
  return res;
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

async function resetRequest(request: Request, env: AccountsEnv): Promise<Response> {
  const b = await body(request);
  const email = normaliseEmail(b.email);
  if (!email) throw new HttpError(400, 'Enter a valid email address.');
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new HttpError(503, "Password reset isn't available yet.");
  await limit(env, `reset:${email}`);
  await limit(env, `reset-ip:${clientAddress(request)}`);
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  // The same answer whether or not there's an account, so this can't be used to find out who has one.
  if (user) {
    const token = randomToken();
    await env.DB.prepare('INSERT INTO resets (token_hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), user.id, Date.now() + RESET_MS).run();
    const link = `${new URL(request.url).origin}/?reset=${token}`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [email],
        subject: 'Reset your Blue Loop password',
        text: `Someone (hopefully you) asked to reset the password for your Blue Loop account.\n\nChoose a new password here (the link works for an hour):\n${link}\n\nIf it wasn't you, ignore this email: your password stays as it is.`,
        html: `<p>Someone (hopefully you) asked to reset the password for your Blue Loop account.</p><p><a href="${link}">Choose a new password</a> (the link works for an hour).</p><p>If it wasn't you, ignore this email: your password stays as it is.</p>`,
      }),
    });
    if (!res.ok) {
      console.error('Resend', res.status, await res.text());
      throw new HttpError(502, "Couldn't send the email. Try again in a while.");
    }
  }
  return Response.json({ ok: true });
}

async function resetConfirm(request: Request, env: AccountsEnv): Promise<Response> {
  const b = await body(request);
  const token = String(b.token ?? '');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400, 'That reset link is broken. Ask for a new one.');
  const problem = passwordProblem(b.password);
  if (problem) throw new HttpError(400, problem);
  await limit(env, `reset-ip:${clientAddress(request)}`);
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT r.user_id, r.expires, u.email FROM resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?').bind(tokenHash).first<{ user_id: string; expires: number; email: string }>();
  if (!row || row.expires < Date.now()) throw new HttpError(400, 'That reset link has expired. Ask for a new one.');
  const salt = randomToken(16);
  // The new password, and every old session and reset link ends.
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(await hashPassword(String(b.password), salt), salt, row.user_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
    env.DB.prepare('DELETE FROM resets WHERE user_id = ?').bind(row.user_id),
  ]);
  return startSession(env, { id: row.user_id, email: row.email }, request);
}

// ---------------------------------------------------------------------------
// The economy's actions
// ---------------------------------------------------------------------------

async function booster(request: Request, env: AccountsEnv): Promise<Response> {
  const a = await requireAccount(request, env);
  const b = await body(request);
  const kind = typeof b.kind === 'number' ? b.kind : b.kind === 'general' ? 'general' : Number(b.kind);
  if (!isBoosterKind(kind)) throw new HttpError(400, 'No such booster.');
  const { economy, result } = await changeEconomy(env.DB, a.id, (e) => buyBooster(e, kind));
  return Response.json({ cards: result, economy });
}

async function craftCard(request: Request, env: AccountsEnv): Promise<Response> {
  const a = await requireAccount(request, env);
  const b = await body(request);
  const { economy } = await changeEconomy(env.DB, a.id, (e) => craft(e, b.id));
  return Response.json({ economy });
}

async function breakCard(request: Request, env: AccountsEnv): Promise<Response> {
  const a = await requireAccount(request, env);
  const b = await body(request);
  const { economy } = await changeEconomy(env.DB, a.id, (e) => breakDown(e, b.id));
  return Response.json({ economy });
}

/** A game against the AI begins: its reward can be claimed once it ends. */
async function gameStart(request: Request, env: AccountsEnv): Promise<Response> {
  const a = await requireAccount(request, env);
  const gameId = randomToken(12);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO games (id, user_id, kind, started) VALUES (?, ?, ?, ?)').bind(gameId, a.id, 'ai', now).run();
  // Old unfinished games are tidied away.
  await env.DB.prepare('DELETE FROM games WHERE user_id = ? AND started < ?').bind(a.id, now - 7 * 86400_000).run();
  return Response.json({ gameId });
}

/** A game against the AI ended: pay out its reward, once, if it ran for a believable time and today's limit allows. */
async function gameFinish(request: Request, env: AccountsEnv): Promise<Response> {
  const a = await requireAccount(request, env);
  const b = await body(request);
  const now = Date.now();
  const game = await env.DB.prepare('SELECT started, finished FROM games WHERE id = ? AND user_id = ?').bind(String(b.gameId ?? ''), a.id).first<{ started: number; finished: number | null }>();
  if (!game || game.finished) throw new HttpError(400, 'No reward for that game.');
  // Claim it first (only one claim can win), then decide whether it pays.
  const claim = await env.DB.prepare('UPDATE games SET finished = ? WHERE id = ? AND finished IS NULL').bind(now, String(b.gameId)).run();
  if (claim.meta.changes !== 1) throw new HttpError(400, 'No reward for that game.');
  const length = now - game.started;
  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE user_id = ? AND finished IS NOT NULL AND finished > ?').bind(a.id, now - 86400_000).first<{ n: number }>();
  if (length < MIN_GAME_MS || length > MAX_GAME_MS || (today?.n ?? 0) > MAX_REWARDED_PER_DAY) {
    return Response.json({ payout: null, economy: await loadEconomy(env.DB, a.id) });
  }
  const won = b.won === true;
  const { economy, result } = await changeEconomy(env.DB, a.id, (e) => payReward(e, rewardFor('ai', won, b.conceded === true), won));
  return Response.json({ payout: result, economy });
}
