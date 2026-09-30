import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/engine/cards';
import { cardScene, hasOwnArt } from '../src/ui/cardart';

describe('card art', () => {
  it('gives every card its own picture', () => {
    expect(CARDS.filter((c) => !hasOwnArt(c.id)).map((c) => c.id)).toEqual([]);
    // No two cards draw the same scene (ids aside).
    const scenes = CARDS.map((c) => cardScene(c).replaceAll(`a-${c.id}`, 'x'));
    expect(new Set(scenes).size).toBe(CARDS.length);
  });
});
