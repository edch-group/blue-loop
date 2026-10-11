import { describe, expect, it } from 'vitest';
import { abilityBudget, BUDGET_EXTRA, CARDS, RARITY_POINTS, statPoints } from '../src/engine/cards';
import { PLAIN_PROFILE, plainBudget } from '../src/engine/cards-plain';

describe('stat budget', () => {
  it('keeps every unit within its cost: plain cards at 2c+2, cards with abilities at 2c+1 (attack, Sturdy and stability together)', () => {
    const over = CARDS.flatMap((c) => {
      const pts = statPoints(c);
      if (pts === null) return [];
      // (A bomb or two are let past it on purpose: BUDGET_EXTRA.)
      // (Rarity is worth points too, to a Stellar or Anomaly unit with abilities.)
      const cap = (PLAIN_PROFILE[c.id] || c.fusion ? plainBudget(c.cost ?? 1) : abilityBudget(c.cost ?? 1) + (c.token ? 0 : RARITY_POINTS[c.rarity ?? 'dwarf'] ?? 0)) + (BUDGET_EXTRA[c.id] ?? 0);
      return pts > cap ? [`${c.name} (${c.cost}): ${pts} > ${cap}`] : [];
    });
    expect(over).toEqual([]);
  });
});
