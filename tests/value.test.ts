import { describe, expect, it } from 'vitest';
import { abilityBudget, CARDS, statPoints } from '../src/engine/cards';
import { PLAIN_PROFILE, plainBudget } from '../src/engine/cards-plain';

describe('stat budget', () => {
  it('keeps every unit within its cost: plain cards at 2c+2, cards with abilities at 2c+1 (attack, Sturdy and stability together)', () => {
    const over = CARDS.flatMap((c) => {
      const pts = statPoints(c);
      if (pts === null) return [];
      const cap = PLAIN_PROFILE[c.id] || c.fusion ? plainBudget(c.cost ?? 1) : abilityBudget(c.cost ?? 1);
      return pts > cap ? [`${c.name} (${c.cost}): ${pts} > ${cap}`] : [];
    });
    expect(over).toEqual([]);
  });
});
