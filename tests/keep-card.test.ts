import { describe, expect, it } from 'vitest';
import { campaignPlayer, captainCard, cardDef, createCampaign, emptyMeta, flagship, keepableCards, runBonuses } from '../src/engine';

/** A run for the Captain, as an account with `kept` set would start one. */
const run = (kept?: string) => {
  const meta = { ...emptyMeta(), ...(kept ? { kept } : {}) };
  return createCampaign({ seed: 7, captain: captainCard(meta), run: runBonuses(meta) });
};

describe('a card kept from a lost run', () => {
  it('may be any card the run added, but not its starting deck nor Heroes', () => {
    const s = run();
    const f = flagship(s, campaignPlayer(s).id)!;
    // (A fresh run has added nothing: nothing to keep.)
    expect(keepableCards(s)).toEqual([]);
    // (Cards it picks up, in the deck or the reserve, may be kept; a second copy of a starting card too.)
    f.deck.push('helio_lancer', f.deck[1]);
    campaignPlayer(s).reserve.push('kelp_wall');
    const keepable = keepableCards(s);
    expect(keepable).toEqual(expect.arrayContaining(['helio_lancer', 'kelp_wall', f.deck[1]]));
    expect(keepable.every((id) => cardDef(id).kind !== 'command')).toBe(true);
    expect(new Set(keepable).size).toBe(keepable.length);
  });

  it('starts the next run in the deck', () => {
    const plain = run();
    const has = new Set(flagship(plain, campaignPlayer(plain).id)!.deck);
    const id = ['helio_lancer', 'kelp_wall', 'shard_lancer'].find((x) => !has.has(x))!;
    const s = run(id);
    const deck = flagship(s, campaignPlayer(s).id)!.deck;
    expect(deck.filter((d) => d === id).length).toBe(1);
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
