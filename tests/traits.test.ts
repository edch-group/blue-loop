import { describe, expect, it } from 'vitest';
import { CARDS, hasDarkspeed, isBurst } from '../src/engine/cards';
import { raceTrait } from '../src/engine/races';

/** A keyword's number as printed on a card (1 where it is printed bare), or 0 where it isn't. */
const printed = (text: string, kw: string) => {
  const m = text.match(new RegExp(`\\{${kw}(?::(\\d+))?\\}`));
  return m ? Number(m[1] ?? 1) : 0;
};

describe('race traits are printed on the cards they reach', () => {
  it('every card that stands in play shows its Sting as it strikes back (its own and its race\'s)', () => {
    for (const c of CARDS) {
      if (c.kind === 'lightspeed' || c.kind === 'relic' || isBurst(c)) continue;
      const sting = (c.passive ?? []).reduce((n, x) => n + (x.type === 'retaliate' ? x.amount : 0), 0) + (raceTrait(c.race)?.sting ?? 0);
      expect([c.id, printed(c.text, 'sting')]).toEqual([c.id, sting]);
    }
  });

  it('Sturdy, Darkspeed and attunement read as they play', () => {
    for (const c of CARDS) {
      if (raceTrait(c.race)?.sturdy && !c.fusion && !isBurst(c) && c.kind !== 'lightspeed' && c.kind !== 'relic') expect([c.id, printed(c.text, 'sturdy')]).toEqual([c.id, c.defence ?? 0]);
      expect([c.id, /\{darkspeed\}/.test(c.text)]).toEqual([c.id, hasDarkspeed(c)]);
      const extra = raceTrait(c.race)?.attune ?? 0;
      if (c.attune && extra) expect([c.id, printed(c.text, 'attune')]).toEqual([c.id, c.attune + extra]);
    }
  });
});
