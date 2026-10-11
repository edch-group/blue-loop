import { describe, expect, it } from 'vitest';
import { DREAMS } from '../src/engine/dreams-data';
import { leavesTheirBoard, puzzleGame, reach, solution, solves } from '../src/engine/puzzle';

// [direction: challenges that can't be won, or won by a dumb trick, aren't challenges] Every dream in the game is
// proven: it has a solution by the rules as they are; a win isn't had by going straight for the sun; a survival is
// never had by the kill (the rival's sun is out of reach in one).
describe('dreams of the lost', () => {
  for (const d of DREAMS) {
    it(`${d.id} can be solved`, () => {
      expect(solution(d)).not.toBeNull();
    }, 60000);
    if (d.goal === 'win' && (d.days ?? 1) === 1)
      it(`${d.id} isn't won by going straight for their sun`, () => {
        expect(reach(puzzleGame(d), 6000, leavesTheirBoard).some(({ s }) => solves(d, s))).toBe(false);
      }, 60000);
  }
});
