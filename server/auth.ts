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
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16))) as BufferSource;
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
// Sign in with Apple / Google: their ID tokens (signed JWTs), checked against the provider's public keys
// ---------------------------------------------------------------------------

export interface IdTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  email?: string;
  email_verified?: boolean | string;
  nonce?: string;
}

export interface Provider {
  jwks: string;
  issuers: string[];
}

export const PROVIDERS: Record<'google' | 'apple', Provider> = {
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['accounts.google.com', 'https://accounts.google.com'] },
  apple: { jwks: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'] },
};

function b64urlBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function b64urlJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as T;
}

type Jwk = JsonWebKey & { kid?: string };
const jwksCache = new Map<string, { keys: Jwk[]; at: number }>();

async function keysOf(url: string, fetcher: typeof fetch): Promise<Jwk[]> {
  const hit = jwksCache.get(url);
  if (hit && Date.now() - hit.at < 3600_000) return hit.keys;
  const res = await fetcher(url);
  if (!res.ok) throw new Error('Could not reach the sign-in provider.');
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache.set(url, { keys, at: Date.now() });
  return keys;
}

/**
 * Check an ID token: signed (RS256) by one of the provider's keys, issued by it, for our app (`audience`),
 * not expired, and carrying the nonce we gave the sign-in. Returns its claims, or throws.
 */
export async function verifyIdToken(token: string, provider: Provider, audience: string, nonce: string | null, fetcher: typeof fetch = fetch, now = Date.now()): Promise<IdTokenClaims> {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Bad sign-in token.');
  const header = b64urlJson<{ alg: string; kid?: string }>(parts[0]);
  if (header.alg !== 'RS256') throw new Error('Bad sign-in token.');
  const jwk = (await keysOf(provider.jwks, fetcher)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Bad sign-in token.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]) as BufferSource, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('Bad sign-in token.');
  const claims = b64urlJson<IdTokenClaims>(parts[1]);
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!provider.issuers.includes(claims.iss) || !auds.includes(audience)) throw new Error('Bad sign-in token.');
  if (!(claims.exp * 1000 > now)) throw new Error('That sign-in has expired. Try again.');
  if (nonce !== null && claims.nonce !== nonce) throw new Error('Bad sign-in token.');
  if (!claims.sub) throw new Error('Bad sign-in token.');
  return claims;
}
