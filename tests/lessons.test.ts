import { describe, expect, it } from 'vitest';
import { LESSONS, lessonOpen, CORE_LESSONS } from '../src/engine/lessons';
import { puzzleGame, solution, solves } from '../src/engine/puzzle';
import { inMode } from '../src/engine/modes';
import { cardDef } from '../src/engine/cards';

describe('the tutorial', () => {
  it('every lesson is solvable, and (but for the one that teaches waiting) not by ending the day at once', () => {
    for (const l of LESSONS) {
      expect(solution(l.spec), l.id).not.toBeNull();
      expect(solves(l.spec, puzzleGame(l.spec)), l.id).toBe(!!l.waiting);
    }
  }, 120000);

  it('the core lessons use only Core cards', () => {
    for (const l of LESSONS.filter((x) => x.track === 'core')) {
      const ids = [...l.spec.hand, ...l.spec.me.cards.map((c) => c.id), ...l.spec.foe.cards.map((c) => c.id)];
      for (const id of ids) expect(inMode(cardDef(id), 'core'), `${l.id}: ${id}`).toBe(true);
    }
  });

  it('opens a lesson once those before it are done, and the advanced ones once the whole core is', () => {
    expect(lessonOpen('sun', [])).toBe(true);
    expect(lessonOpen('energy', [])).toBe(false);
    expect(lessonOpen('energy', ['sun'])).toBe(true);
    expect(lessonOpen('darkspeed', CORE_LESSONS.slice(1))).toBe(false);
    expect(lessonOpen('darkspeed', CORE_LESSONS)).toBe(true);
    // (Every lesson can be reached.)
    const done: string[] = [];
    for (let round = 0; round < LESSONS.length; round++) for (const l of LESSONS) if (!done.includes(l.id) && lessonOpen(l.id, done)) done.push(l.id);
    expect(done.length).toBe(LESSONS.length);
  });
});
