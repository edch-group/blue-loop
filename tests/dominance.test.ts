import { describe, expect, it } from 'vitest';
import { dominatedPairs } from '../scripts/dominance';
import { CARDS, isBurst } from '../src/engine/cards';

describe('card costs', () => {
  it('has no card that another beats outright at the same cost or less (race cards over neutral ones included)', () => {
    expect(dominatedPairs(true)).toEqual([]);
    // (Nor across races: no race's card is outright worse than another race's.)
    expect(dominatedPairs(true, true)).toEqual([]);
    // (And in Core, its cards as they play there.)
    expect(dominatedPairs(true, false, 'core')).toEqual([]);
  });

  it('gives no one-time card a keyword that only works while standing in play', () => {
    const dead = CARDS.filter((c) => isBurst(c) && !c.fusion && ((c.defence ?? 0) > 0 || /\{(sturdy|sting|guard|anchor)/.test(c.text)));
    expect(dead.map((c) => c.id)).toEqual([]);
  });
});
