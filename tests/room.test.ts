import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { PRESET_DECKS, presetDeck, RACE_NAMES } from '../src/engine/cards';
import { activePlayer } from '../src/engine/game';
import { emptyRoom, handle, playerIndex, views, type ClientMessage, type RoomData, type ServerMessage } from '../server/room';

/** A seeded stand-in for Math.random, so rooms are reproducible. */
function seeded(seed: number) {
  let h = seed;
  return () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
}

const join = (name: string, deck: number, token?: string): ClientMessage => ({
  t: 'join',
  name,
  deck: PRESET_DECKS[deck].cards,
  deckName: PRESET_DECKS[deck].name,
  token,
});

function twoSeats(seed = 1): { room: RoomData; tokens: string[]; rand: () => number } {
  const room = emptyRoom();
  const rand = seeded(seed);
  const a = handle(room, null, join('Ada', 0), rand);
  const b = handle(room, null, join('Bo', 2), rand);
  const tokens = [a, b].map((r) => (r.reply[0] as Extract<ServerMessage, { t: 'joined' }>).token);
  readyUp(room, rand);
  return { room, tokens, rand };
}

function readyUp(room: RoomData, rand: () => number = Math.random) {
  handle(room, 0, { t: 'ready', ready: true }, rand);
  handle(room, 1, { t: 'ready', ready: true }, rand);
}

describe('online room', () => {
  it('waits in the lobby until both players have joined and confirmed', () => {
    const room = emptyRoom();
    const a = handle(room, null, join('Ada', 0), seeded(1));
    expect(a.seat).toBe(0);
    handle(room, 0, { t: 'ready', ready: true });
    expect(room.game).toBeNull(); // ready, but alone
    expect(views(room)[0]).toMatchObject({ t: 'lobby', you: 0, seats: [{ name: 'Ada', ready: true }] });
    handle(room, null, join('Bo', 2), seeded(2));
    expect(room.game).toBeNull(); // Bo has not confirmed yet
    handle(room, 1, { t: 'ready', ready: true }, seeded(3));
    expect(room.game).not.toBeNull();
    expect(room.game!.players.map((p) => p.name).sort()).toEqual(['Ada', 'Bo']);
  });

  it('lets a player change deck in the lobby, which takes back their ready', () => {
    const room = emptyRoom();
    handle(room, null, join('Ada', 0));
    handle(room, null, join('Bo', 2));
    handle(room, 1, { t: 'ready', ready: true });
    handle(room, 1, { t: 'setup', name: 'Bo', deck: PRESET_DECKS[3].cards, deckName: PRESET_DECKS[3].name });
    expect(room.seats[1]).toMatchObject({ deckName: PRESET_DECKS[3].name, ready: false });
    handle(room, 0, { t: 'ready', ready: true });
    expect(room.game).toBeNull();
    handle(room, 1, { t: 'ready', ready: true });
    expect(room.game!.players.find((p) => p.name === 'Bo')!.deckName).toBe(PRESET_DECKS[3].name);
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
    expect(handle(room, idleSeat, { t: 'action', action: { type: 'endTurn' } }).reply[0]).toMatchObject({ t: 'error', message: expect.stringMatching(/not your day/) });
    expect(handle(room, activeSeat, { t: 'action', action: { type: 'playCard', cardUid: 'nope' } }).reply[0]).toMatchObject({ t: 'error' });
    const ok = handle(room, activeSeat, { t: 'action', action: { type: 'endTurn' } });
    expect(ok.broadcast).toBe(true);
    expect(room.game!.activePlayerIndex).not.toBe(g.activePlayerIndex);
  });

  it('a reaction window: only the one answering may move, and only they see what they could answer with', () => {
    const { room, rand } = twoSeats();
    const g = room.game!;
    const active = g.activePlayerIndex;
    const other = 1 - active;
    g.reaction = { playerId: g.players[other].id, enemyId: g.players[active].id, events: [{ on: 'sunAttacked', attackerUid: 'x' }], pending: { kind: 'attack', attackerUid: 'x', targetUid: null }, slot: true, hand: [] };
    const seatOf = (i: number) => [0, 1].find((seat) => playerIndex(room, seat) === i)!;
    // The active player can't move while it is open.
    const blocked = handle(room, seatOf(active), { t: 'action', action: { type: 'endTurn' } }, rand);
    expect(blocked.reply[0]).toMatchObject({ t: 'error' });
    const vs = views(room) as Extract<ServerMessage, { t: 'state' }>[];
    expect(vs[seatOf(active)].state.reaction?.slot).toBe(false);
    expect(vs[seatOf(other)].state.reaction?.slot).toBe(true);
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
      // The rival reads each card played against them.
      if (room.waitingOn != null) handle(room, room.waitingOn, { t: 'ack' });
    }
    expect(room.game!.winnerId).not.toBeNull();
    expect(room.last).not.toBeNull();
    handle(room, 0, { t: 'rematch' });
    // Back to the lobby, then both confirm again.
    expect(room.game).toBeNull();
    expect(room.seats.every((s) => !s.ready)).toBe(true);
    readyUp(room);
    expect(room.game!.winnerId).toBeNull();
    expect(room.first).toBe(1 - firstBefore);
    expect(activePlayer(room.game!).name).toBe(room.seats[room.first].name);
  });

  it('lets either player concede, even off turn, and then offers no rematch', () => {
    const { room } = twoSeats();
    const g = room.game!;
    const idleSeat = [0, 1].find((s) => playerIndex(room, s) !== g.activePlayerIndex)!;
    // A seat can only concede for itself, whatever player it names.
    const other = g.players[playerIndex(room, 1 - idleSeat)].id;
    const r = handle(room, idleSeat, { t: 'action', action: { type: 'concede', playerId: other } });
    expect(r.broadcast).toBe(true);
    expect(room.game!.concededBy).toBe(g.players[playerIndex(room, idleSeat)].id);
    expect(room.game!.winnerId).toBe(other);
    expect(handle(room, 1 - idleSeat, { t: 'rematch' }).reply[0]).toMatchObject({ t: 'error', message: expect.stringMatching(/left/) });
  });

  it('falls back to a starter deck if a player sends an illegal one', () => {
    const room = emptyRoom();
    handle(room, null, { t: 'join', name: '<b>Eve</b>', deck: ['coronal_lance'], deckName: 'x' });
    expect(room.seats[0].deck).toEqual(PRESET_DECKS[0].cards);
    expect(room.seats[0].name).toBe('bEveb');
  });

  it('takes any legal deck, whichever races its cards are from', () => {
    for (let race = 4; race < RACE_NAMES.length; race++) {
      const room = emptyRoom();
      handle(room, null, { t: 'join', name: 'Nova', deck: presetDeck(race).cards, deckName: presetDeck(race).name });
      expect(room.seats[0]).toMatchObject({ deck: presetDeck(race).cards, deckName: presetDeck(race).name });
    }
  });
});

describe('reading a rival card', () => {
  it('holds a player who played a card until their rival has read it', () => {
    const { room } = twoSeats(7);
    const g = room.game!;
    const activeSeat = [0, 1].find((s) => g.players[playerIndex(room, s)].id === activePlayer(g).id)!;
    const me = activePlayer(g);
    // A plain 1-energy card (the opening hand may hold only dearer ones, or ones that need a choice).
    const card = { uid: 'test-relay', defId: 'plasma_relay' };
    me.hand.push(card);
    handle(room, activeSeat, { t: 'action', action: { type: 'playCard', cardUid: card.uid, slot: 2 } });
    expect(room.waitingOn).toBe(1 - activeSeat);
    expect(views(room)[activeSeat]).toMatchObject({ waitFor: 'rival' });
    expect(views(room)[1 - activeSeat]).toMatchObject({ waitFor: 'you' });
    // Until then the player can't go on.
    const blocked = handle(room, activeSeat, { t: 'action', action: { type: 'endTurn' } });
    expect(blocked.reply[0]).toMatchObject({ t: 'error' });
    // Only the rival can confirm.
    handle(room, activeSeat, { t: 'ack' });
    expect(room.waitingOn).toBe(1 - activeSeat);
    handle(room, 1 - activeSeat, { t: 'ack' });
    expect(room.waitingOn).toBeNull();
    expect(handle(room, activeSeat, { t: 'action', action: { type: 'endTurn' } }).broadcast).toBe(true);
  });
});
