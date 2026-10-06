import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { PRESET_DECKS } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';
import { beginStats, finishStats, noteMove } from '../src/engine/stats';
import { cleanStats } from '../server/stats';

describe('anonymous game summaries', () => {
  it('sum up a game: the starters, every card played, the winner; nothing about the players', () => {
    const [a, b] = [PRESET_DECKS[0], PRESET_DECKS[2]];
    let s = createGame({ seed: 7, players: [a, b].map((d, i) => ({ name: `Secret Name ${i}`, isAI: true, deck: d.cards })) });
    const stats = beginStats(s, 'ai');
    expect(stats.seats.map((x) => x.starter)).toEqual([a.name, b.name]);
    expect(stats.seats[0].cards).toHaveLength(a.cards.length);
    let plays = 0;
    for (let k = 0; k < 6000 && !isGameOver(s); k++) {
      const action = chooseAIAction(s);
      const next = applyAction(s, action);
      if (action.type === 'playCard') plays++;
      noteMove(stats, s, next, action);
      s = next;
    }
    finishStats(stats, s);
    expect(stats.plays).toHaveLength(plays);
    expect(stats.winner).toBe(s.players.findIndex((p) => p.id === s.winnerId));
    const text = JSON.stringify(stats);
    expect(text).not.toContain('Secret Name');
    // (Its trace names seats, never players: the ids in a game on a device are seats' own, "p1" and the like.)
    for (const p of s.players) expect(p.id).toMatch(/^p\d$/);
    // And it replays to the very same end.
    let r = stats.trace!.start;
    for (const m of stats.trace!.moves) r = applyAction(r, m);
    expect(r.winnerId).toBe(s.winnerId);
    expect(r.round).toBe(s.round);
  });

  it('keep only the expected fields on the server', () => {
    const clean = cleanStats({
      mode: 'ai',
      seats: [
        { human: true, starter: null, cards: ['coronal_lance', 'bad id!'], email: 'x@y.z' },
        { human: false, starter: 'Wildfire', cards: [] },
      ],
      winner: 0,
      end: 'supernova',
      rounds: 9,
      plays: [[0, 1, 'coronal_lance'], [9, 1, 'x'], 'junk'],
      player: 'someone',
    });
    expect(clean).toEqual({
      v: 1,
      mode: 'ai',
      seats: [
        { human: true, starter: null, cards: ['coronal_lance'] },
        { human: false, starter: 'Wildfire', cards: [] },
      ],
      winner: 0,
      end: 'supernova',
      rounds: 9,
      plays: [[0, 1, 'coronal_lance']],
    });
    expect(cleanStats({ mode: 'nope', seats: [] })).toBeNull();
  });
});
