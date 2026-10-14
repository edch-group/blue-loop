import { describe, expect, it } from 'vitest';
import { campaignPlayer, captainCard, cardDef, createCampaign, emptyMeta, flagship, keepableCards, runBonuses } from '../src/engine';

/** A run for the Captain, as an account with `kept` set would start one. */
const run = (kept?: string) => {
  const meta = { ...emptyMeta(), ...(kept ? { kept } : {}) };
  return createCampaign({ seed: 7, captain: captainCard(meta), run: runBonuses(meta) });
};

describe('a card kept from a lost run', () => {
  it('may be any card of the run but Heroes', () => {
    const s = run();
    const keepable = keepableCards(s);
    expect(keepable.length).toBeGreaterThan(0);
    expect(keepable.every((id) => cardDef(id).kind !== 'command')).toBe(true);
    expect(new Set(keepable).size).toBe(keepable.length);
  });

  it('starts the next run in the deck', () => {
    const plain = run();
    const id = keepableCards(plain).find((x) => flagship(plain, campaignPlayer(plain).id)!.deck.filter((d) => d === x).length === 1)!;
    const s = run(id);
    const deck = flagship(s, campaignPlayer(s).id)!.deck;
    expect(deck.filter((d) => d === id).length).toBe(2);
    expect(s.keptIn).toBe(id);
  });

  it('cannot be kept again after that run', () => {
    // A card the run would not otherwise have: kept in, it is the only copy, so it is not offered again.
    const plain = run();
    const has = new Set(flagship(plain, campaignPlayer(plain).id)!.deck);
    const id = ['helio_lancer', 'kelp_wall', 'shard_lancer'].find((x) => !has.has(x))!;
    const s = run(id);
    expect(flagship(s, campaignPlayer(s).id)!.deck).toContain(id);
    expect(keepableCards(s)).not.toContain(id);
    // (A second copy found during the run may still be kept.)
    flagship(s, campaignPlayer(s).id)!.deck.push(id);
    expect(keepableCards(s)).toContain(id);
  });
});
