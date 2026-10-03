import { describe, expect, it } from 'vitest';
import { PROGRESSION, starterGrant } from '../src/engine';
import { breakDown, buyBooster, craft, freshEconomy, normaliseEconomy, payReward, rewardFor } from '../server/economy';
import { PROVIDERS, verifyIdToken } from '../server/auth';

describe('the server-side economy', () => {
  it('starts an account with the starter cards and the price of a booster', () => {
    const e = freshEconomy();
    expect(e.stardust).toBe(PROGRESSION.boosterPrice);
    expect(e.collection).toEqual(starterGrant());
  });

  it('opens a booster only if it can be paid for', () => {
    const e = freshEconomy();
    const cards = buyBooster(e, 'general', () => 0.5);
    expect(cards).toHaveLength(PROGRESSION.boosterSize);
    expect(e.stardust).toBe(0);
    expect(() => buyBooster(e, 'general')).toThrow(/costs/);
  });

  it('crafts with flux, and never breaks down a starter card', () => {
    const e = freshEconomy();
    const starter = Object.keys(starterGrant())[0];
    expect(() => breakDown(e, starter)).toThrow(/starter/);
    expect(() => craft(e, 'no_such_card')).toThrow(/No such card/);
    e.flux = 0;
    const id = 'coronal_lance';
    e.collection[id] = 0;
    expect(() => craft(e, id)).toThrow(/flux/);
    e.flux = 1000;
    craft(e, id);
    expect(e.collection[id]).toBe(1);
  });

  it('pays a reward with any level-up bonus, and counts the game', () => {
    const e = freshEconomy();
    const r = rewardFor('ai', true, false);
    const paid = payReward(e, { ...r, xp: 10_000 }, true);
    expect(paid.levelsGained).toBeGreaterThan(0);
    expect(e.stardust).toBe(PROGRESSION.boosterPrice + r.stardust + paid.bonus.stardust);
    expect(e.played).toBe(1);
    expect(e.won).toBe(1);
  });

  it('ignores cards it does not know when reading an economy back', () => {
    const e = normaliseEconomy({ stardust: 5, collection: { made_up: 3, coronal_lance: 2 } });
    expect(e.collection.made_up).toBeUndefined();
    expect(e.collection.coronal_lance).toBeGreaterThanOrEqual(2);
    expect(e.stardust).toBe(5);
  });
});

describe('Apple and Google ID tokens', () => {
  const b64url = (bytes: Uint8Array | string) =>
    btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function setup() {
    const keys = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
    const provider = { ...PROVIDERS.google, jwks: `https://example.test/jwks-${Math.random()}` };
    const fetcher = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
    const sign = async (claims: Record<string, unknown>) => {
      const head = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
      const body = b64url(JSON.stringify(claims));
      const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(`${head}.${body}`)));
      return `${head}.${body}.${b64url(sig)}`;
    };
    return { provider, fetcher, sign };
  }
  const good = { iss: 'https://accounts.google.com', aud: 'app-id', sub: 'u1', exp: Date.now() / 1000 + 600, email: 'a@b.co', email_verified: true, nonce: 'n1' };

  it('accepts a token signed by the provider, for this app, with our nonce', async () => {
    const { provider, fetcher, sign } = await setup();
    const claims = await verifyIdToken(await sign(good), provider, 'app-id', 'n1', fetcher);
    expect(claims.sub).toBe('u1');
  });

  it('rejects another app, another nonce, an expired token or a forged signature', async () => {
    const { provider, fetcher, sign } = await setup();
    await expect(verifyIdToken(await sign({ ...good, aud: 'other' }), provider, 'app-id', 'n1', fetcher)).rejects.toThrow();
    await expect(verifyIdToken(await sign(good), provider, 'app-id', 'n2', fetcher)).rejects.toThrow();
    await expect(verifyIdToken(await sign({ ...good, exp: Date.now() / 1000 - 5 }), provider, 'app-id', 'n1', fetcher)).rejects.toThrow(/expired/);
    const forged = (await sign(good)).split('.');
    forged[1] = b64url(JSON.stringify({ ...good, sub: 'someone-else' }));
    await expect(verifyIdToken(forged.join('.'), provider, 'app-id', 'n1', fetcher)).rejects.toThrow();
  });
});
