/**
 * The account system's pure helpers (no Cloudflare dependencies, so they are tested directly in
 * tests/accounts.test.ts): password hashing, tokens, and checking what a player typed.
 */

export const COOKIE = 'bl_session';
const PBKDF2_ROUNDS = 100_000;

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
