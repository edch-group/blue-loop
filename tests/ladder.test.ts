import { describe, expect, it } from 'vitest';
import { PRESET_DECKS } from '../src/engine/cards';
import { activePlayer } from '../src/engine/game';
import { PROGRESSION } from '../src/engine/progression';
import { emptyLadder, enqueue, recordResult, standing } from '../server/ladder';
import { emptyRoom, handle, playerIndex, type ClientMessage } from '../server/room';

const tier = (t: number) => t * 3 * PROGRESSION.stagePoints;

describe('the ranked ladder', () => {
  it('matches queued players at most one tier apart, longest-waiting first', () => {
    const l = emptyLadder();
    standing(l, 'low', 'Low').rankPoints = tier(0);
    standing(l, 'high', 'High').rankPoints = tier(3);
    standing(l, 'mid', 'Mid').rankPoints = tier(1);
    expect(enqueue(l, 'low', 'Low', 1, () => 'ROOM1')).toBeNull();
    // Three tiers apart: no match.
    expect(enqueue(l, 'high', 'High', 2, () => 'ROOM2')).toBeNull();
    const m = enqueue(l, 'mid', 'Mid', 3, () => 'ROOM3');
    expect(m?.room).toBe('ROOM3');
    expect(m?.players.map((p) => p.id).sort()).toEqual(['low', 'mid']);
    expect(l.queue.map((q) => q.id)).toEqual(['high']);
  });

  it('moves both players after a game, by more for an upset', () => {
    const l = emptyLadder();
    standing(l, 'a', 'A').rankPoints = tier(1);
    standing(l, 'b', 'B').rankPoints = tier(2);
    const [win, loss] = recordResult(l, 'a', 'b', false);
    expect(win.rankPoints).toBeGreaterThan(tier(1) + PROGRESSION.rankWin);
    expect(loss.rankPoints).toBeLessThan(tier(2));
    expect(win.reward.stardust).toBeGreaterThan(PROGRESSION.rewards.ranked.win.stardust);
  });
});

describe('a ranked room', () => {
  const join = (name: string, profileId: string): ClientMessage => ({ t: 'join', name, deck: PRESET_DECKS[0].cards, deckName: 'x', profileId });

  it('admits only the two matched players, reports the result once, and offers no rematch', () => {
    const room = emptyRoom();
    room.ranked = { ids: ['p1', 'p2'] };
    expect(handle(room, null, join('Stranger', 'zz')).reply[0]).toMatchObject({ t: 'error' });
    handle(room, null, join('One', 'p1'));
    handle(room, null, join('Two', 'p2'));
    handle(room, 0, { t: 'ready', ready: true });
    handle(room, 1, { t: 'ready', ready: true });
    const g = room.game!;
    const idle = [0, 1].find((s) => g.players[playerIndex(room, s)].id !== activePlayer(g).id)!;
    const out = handle(room, idle, { t: 'action', action: { type: 'concede', playerId: '' } });
    expect(out.report).toEqual({ winner: room.seats[1 - idle].profileId, loser: room.seats[idle].profileId, conceded: true });
    expect(handle(room, idle, { t: 'ping' }).report).toBeUndefined();
    expect(handle(room, 1 - idle, { t: 'rematch' }).reply[0]).toMatchObject({ t: 'error' });
  });
});
