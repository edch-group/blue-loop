import { describe, expect, it } from 'vitest';
import { CARDS, PRESET_DECKS, rarityOf } from '../src/engine/cards';
import {
  addXp,
  applyRank,
  boosterPool,
  breakable,
  breakdownValue,
  canMatch,
  craftCost,
  gameReward,
  openBooster,
  ownsDeck,
  PROGRESSION,
  rankName,
  rankOf,
  starterGrant,
  xpToNext,
} from '../src/engine/progression';

const seeded = (seed: number) => {
  let h = seed;
  return () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
};
const rp = (tier: number, stage: number) => (tier * 3 + stage) * PROGRESSION.stagePoints;

describe('ranks', () => {
  it('climbs three stages per tier, from Olivine I', () => {
    expect(rankName(0)).toBe('Olivine I');
    expect(rankName(250)).toBe('Olivine III');
    expect(rankName(300)).toBe('Cobalt I');
    expect(rankOf(99999)).toMatchObject({ tier: 5, stage: 2 });
    expect(applyRank(10, -40)).toBe(0);
  });

  it('only matches players at most one tier apart', () => {
    expect(canMatch(rp(1, 0), rp(0, 0))).toBe(true);
    expect(canMatch(rp(1, 2), rp(2, 2))).toBe(true);
    expect(canMatch(rp(0, 2), rp(2, 0))).toBe(false);
  });
});

describe('rewards', () => {
  it('pays far more online, and more again ranked', () => {
    const ai = gameReward('ai', true), online = gameReward('online', true), ranked = gameReward('ranked', true, { me: 300, rival: 300 });
    expect(online.stardust).toBeGreaterThan(ai.stardust * 2);
    expect(ranked.stardust).toBeGreaterThan(online.stardust);
    expect(gameReward('ai', false).stardust).toBeLessThan(ai.stardust);
  });

  it('weighs the rank gap: up is worth more, down less', () => {
    const me = rp(2, 1);
    const even = gameReward('ranked', true, { me, rival: me });
    const up = gameReward('ranked', true, { me, rival: rp(3, 0) });
    const down = gameReward('ranked', true, { me, rival: rp(1, 2) });
    expect(up.stardust).toBeGreaterThan(even.stardust);
    expect(down.stardust).toBeLessThan(even.stardust);
    expect(up.rank!).toBeGreaterThan(even.rank!);
    expect(down.rank!).toBeLessThan(even.rank!);
    // Losing: to a higher rank costs less and pays more; to a lower rank, the reverse.
    const lossUp = gameReward('ranked', false, { me, rival: rp(3, 0) });
    const lossEven = gameReward('ranked', false, { me, rival: me });
    const lossDown = gameReward('ranked', false, { me, rival: rp(1, 2) });
    expect(lossUp.stardust).toBeGreaterThan(lossEven.stardust);
    expect(lossDown.stardust).toBeLessThan(lossEven.stardust);
    expect(-lossUp.rank!).toBeLessThan(-lossEven.rank!);
    expect(-lossDown.rank!).toBeGreaterThan(-lossEven.rank!);
  });

  it('pays nothing for losing to a lower-ranked player at the bottom of the ladder', () => {
    expect(gameReward('ranked', false, { me: rp(0, 2), rival: 0 })).toMatchObject({ stardust: 0, flux: 0 });
  });
});

describe('levels', () => {
  it('levels up with experience, carrying the rest over', () => {
    expect(addXp(1, 0, xpToNext(1) + 5)).toEqual({ level: 2, xp: 5, levelsGained: 1 });
  });
});

describe('the collection', () => {
  it('starts with enough to play every starter deck', () => {
    const grant = starterGrant();
    for (const d of PRESET_DECKS) expect(ownsDeck(grant, d.cards)).toBe(true);
    expect(breakable(grant, PRESET_DECKS[0].cards[0])).toBe(0);
  });

  it('breaks a card down for half its crafting cost', () => {
    const anomaly = CARDS.find((c) => rarityOf(c.id) === 'anomaly')!;
    expect(breakdownValue(anomaly.id)).toBe(craftCost(anomaly.id) / 2);
  });

  it('opens boosters from their own race (or the general pool), turning surplus copies into flux', () => {
    for (const kind of [0, 1, 2, 3, 'general'] as const) {
      const pack = openBooster(kind, {}, seeded(3));
      expect(pack).toHaveLength(PROGRESSION.boosterSize);
      const pool = new Set(boosterPool(kind).map((c) => c.id));
      for (const c of pack) expect(pool.has(c.id)).toBe(true);
    }
    const full = Object.fromEntries(CARDS.map((c) => [c.id, 2]));
    expect(openBooster(0, full, seeded(5)).every((c) => (c.flux ?? 0) > 0)).toBe(true);
  });
});
