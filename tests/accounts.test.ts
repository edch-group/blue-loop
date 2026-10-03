import { describe, expect, it } from 'vitest';
import { hashPassword, normaliseEmail, passwordProblem, randomToken, sameHex, sessionToken, sha256 } from '../server/auth';

describe('accounts', () => {
  it('hashes a password the same way with the same salt, differently with another', async () => {
    const salt = randomToken(16);
    const a = await hashPassword('correct horse', salt);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashPassword('correct horse', salt)).toBe(a);
    expect(await hashPassword('correct horse', randomToken(16))).not.toBe(a);
    expect(await hashPassword('correct horsf', salt)).not.toBe(a);
  });

  it('compares hashes without giving anything away early', () => {
    expect(sameHex('abcd', 'abcd')).toBe(true);
    expect(sameHex('abcd', 'abce')).toBe(false);
    expect(sameHex('abcd', 'abc')).toBe(false);
  });

  it('accepts real email addresses, in any case, and nothing else', () => {
    expect(normaliseEmail('  Ed@Example.COM ')).toBe('ed@example.com');
    expect(normaliseEmail('not an email')).toBeNull();
    expect(normaliseEmail('a@b')).toBeNull();
    expect(normaliseEmail(undefined)).toBeNull();
  });

  it('asks for passwords of at least 8 characters', () => {
    expect(passwordProblem('short')).toMatch(/8 characters/);
    expect(passwordProblem('long enough')).toBeNull();
  });

  it('reads the session from a Bearer header, the cookie, or a WebSocket URL', async () => {
    const token = randomToken();
    expect(sessionToken(new Request('https://x/api/me', { headers: { Authorization: `Bearer ${token}` } }))).toBe(token);
    expect(sessionToken(new Request('https://x/api/me', { headers: { Cookie: `other=1; bl_session=${token}` } }))).toBe(token);
    expect(sessionToken(new Request(`https://x/ladder?session=${token}`))).toBe(token);
    expect(sessionToken(new Request('https://x/ladder?session=nothex'))).toBeNull();
    expect(sessionToken(new Request('https://x/api/me'))).toBeNull();
    // The database keeps only the token's hash.
    expect(await sha256(token)).not.toBe(token);
  });
});
