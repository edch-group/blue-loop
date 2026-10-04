import { describe, expect, it } from 'vitest';
import { dominatedPairs } from '../scripts/dominance';

describe('card costs', () => {
  it('has no card that another beats outright at the same cost or less (race cards over neutral ones included)', () => {
    expect(dominatedPairs(true)).toEqual([]);
  });
});
