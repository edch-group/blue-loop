import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { PRESET_DECKS } from '../src/engine/cards';
import { activePlayer } from '../src/engine/game';
import { emptyRoom, handle, playerIndex, views, type ClientMessage, type RoomData, type ServerMessage } from '../server/room';

/** A seeded stand-in for Math.random, so rooms are reproducible. */
function seeded(seed: number) {
  let h = seed;
  return () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
}

const join = (name: string, race: number, token?: string): ClientMessage => ({
  t: 'join',
  name,
  deck: PRESET_DECKS[race].cards,
  deckName: PRESET_DECKS[race].name,
  species: race,
  token,
});

function twoSeats(seed = 1): { room: RoomData; tokens: string[]; rand: () => number } {
  const room = emptyRoom();
  const rand = seeded(seed);
  const a = handle(room, null, join('Ada', 0), rand);
  const b = handle(room, null, join('Bo', 2), rand);
  const tokens = [a, b].map((r) => (r.reply[0] as Extract<ServerMessage, { t: 'joined' }>).token);
  return { room, tokens, rand };
}

describe('online room', () => {
  it('waits in the lobby for a second player, then starts', () => {
    const room = emptyRoom();
    const a = handle(room, null, join('Ada', 0), seeded(1));
    expect(a.seat).toBe(0);
    expect(room.game).toBeNull();
    expect(views(room)[0]).toMatchObject({ t: 'lobby', you: 0, seats: [{ name: 'Ada' }] });
    handle(room, null, join('Bo', 2), seeded(2));
    expect(room.game).not.toBeNull();
    expect(room.game!.players.map((p) => p.name).sort()).toEqual(['Ada', 'Bo']);
  });

  it('is 1v1: a third player is turned away', () => {
    const { room } = twoSeats();
    const c = handle(room, null, join('Cy', 1));
    expect(c.reply[0]).toMatchObject({ t: 'error', message: expect.stringMatching(/full/) });
    expect(room.seats).toHaveLength(2);
  });

  it('lets a player rejoin their seat with their token', () => {
    const { room, tokens } = twoSeats();
    const back = handle(room, null, join('whoever', 3, tokens[1]));
    expect(back.seat).toBe(1);
    expect(room.seats).toHaveLength(2);
  });

  it('only accepts moves from the player whose turn it is, and checks them with the engine', () => {
    const { room } = twoSeats();
    const g = room.game!;
    const activeSeat = [0, 1].find((s) => playerIndex(room, s) === g.activePlayerIndex)!;
    const idleSeat = 1 - activeSeat;
    expect(handle(room, idleSeat, { t: 'action', action: { type: 'endTurn' } }).reply[0]).toMatchObject({ t: 'error', message: expect.stringMatching(/not your turn/) });
    expect(handle(room, activeSeat, { t: 'action', action: { type: 'playCard', cardUid: 'nope' } }).reply[0]).toMatchObject({ t: 'error' });
    const ok = handle(room, activeSeat, { t: 'action', action: { type: 'endTurn' } });
    expect(ok.broadcast).toBe(true);
    expect(room.game!.activePlayerIndex).not.toBe(g.activePlayerIndex);
  });

  it("hides the rival's hand, deck and face-down card, and the random seed", () => {
    const { room } = twoSeats();
    const g = room.game!;
    g.players[1].lightspeed = { uid: 'c999', defId: 'null_field' };
    const [v0, v1] = views(room) as Extract<ServerMessage, { t: 'state' }>[];
    const me0 = playerIndex(room, 0);
    const view = me0 === 0 ? v0 : v1; // the view of player 0
    const mine = view.state.players[0];
    const theirs = view.state.players[1];
    expect(view.state.rngState).toBe(0);
    // Own hand intact; own deck contents intact but not in draw order.
    expect(mine.hand.map((c) => c.defId)).toEqual(g.players[0].hand.map((c) => c.defId));
    expect(mine.deck.map((c) => c.defId).sort()).toEqual(g.players[0].deck.map((c) => c.defId).sort());
    // The rival's cards are placeholders with throwaway uids.
    expect(theirs.hand).toHaveLength(g.players[1].hand.length);
    expect(new Set(theirs.hand.map((c) => c.defId)).size).toBe(1);
    expect(theirs.hand.some((c) => g.players[1].hand.some((h) => h.uid === c.uid))).toBe(false);
    expect(theirs.lightspeed?.defId).not.toBe('null_field');
    expect(theirs.deck.some((c) => g.players[1].deck.some((d) => d.uid === c.uid))).toBe(false);
  });

  it('plays a whole game through the room, then a rematch where the other player starts', () => {
    const { room } = twoSeats(7);
    const firstBefore = room.first;
    let guard = 0;
    while (!room.game!.winnerId && guard++ < 3000) {
      const g = room.game!;
      const seat = [0, 1].find((s) => playerIndex(room, s) === g.activePlayerIndex)!;
      const r = handle(room, seat, { t: 'action', action: chooseAIAction(g) });
      expect(r.reply.filter((m) => m.t === 'error')).toEqual([]);
    }
    expect(room.game!.winnerId).not.toBeNull();
    expect(room.last).not.toBeNull();
    handle(room, 0, { t: 'rematch' });
    expect(room.game!.winnerId).toBeNull();
    expect(room.first).toBe(1 - firstBefore);
    expect(activePlayer(room.game!).name).toBe(room.seats[room.first].name);
  });

  it('falls back to a starter deck if a player sends an illegal one', () => {
    const room = emptyRoom();
    handle(room, null, { t: 'join', name: '<b>Eve</b>', deck: ['coronal_lance'], deckName: 'x', species: 1 });
    expect(room.seats[0].deck).toEqual(PRESET_DECKS[1].cards);
    expect(room.seats[0].name).toBe('bEveb');
  });
});
