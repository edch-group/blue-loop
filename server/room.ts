import { applyAction, cardDef, createGame, deckProblems, GameError, presetDeck, type Action, type CardInstance, type GameState } from '../src/engine';

/**
 * An online 1v1 room: the whole game, run on the server with the same engine
 * the client uses. Players send actions; the room checks them with
 * applyAction and sends each player their own view of the result, with
 * everything they should not see hidden (the rival's hand and face-down
 * Lightspeed card, both decks' order, the random seed).
 *
 * This file has no Cloudflare dependencies, so it can be tested directly;
 * worker.ts wraps it in a Durable Object with WebSockets and storage.
 */

export interface Seat {
  /** Secret the seat's browser keeps, so it can rejoin after a dropped connection. */
  token: string;
  name: string;
  deck: string[];
  deckName: string;
  species: number;
}

export interface RoomData {
  seats: Seat[];
  /** Which seat plays first this game (it alternates on a rematch). Player i is seat (first + i) % 2. */
  first: number;
  game: GameState | null;
  /** The last move, for the clients to animate. */
  last: LastMove | null;
}

export interface LastMove {
  action: Action;
  actorId: string;
  /** The card that was played (unless it was set face down). */
  played?: string;
  faceDown?: boolean;
}

/** What a client may send. */
export type ClientMessage =
  | { t: 'join'; name: string; deck: string[]; deckName: string; species: number; token?: string }
  | { t: 'action'; action: Action }
  | { t: 'rematch' }
  | { t: 'ping' };

/** What the room sends. */
export type ServerMessage =
  | { t: 'joined'; seat: number; token: string }
  | { t: 'lobby'; seats: { name: string; deckName: string; species: number }[]; you: number }
  | { t: 'state'; state: GameState; you: string; last: LastMove | null; names: string[] }
  | { t: 'error'; message: string }
  | { t: 'pong' };

/** A placeholder for a card someone may not see (it is a real card id, so the client can draw it safely). */
const HIDDEN = 'coronal_lance';

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[^\p{L}\p{N} '’.-]/gu, '').trim().slice(0, max);

export function emptyRoom(): RoomData {
  return { seats: [], first: 0, game: null, last: null };
}

/**
 * Handle one message from a connection. `seat` is the seat that connection
 * holds (or null before it has joined). Returns what to send: to this
 * connection only (`reply`), and whether everyone's view changed (`broadcast`).
 */
export function handle(
  room: RoomData,
  seat: number | null,
  msg: ClientMessage,
  random: () => number = Math.random,
): { seat: number | null; reply: ServerMessage[]; broadcast: boolean } {
  switch (msg.t) {
    case 'ping':
      return { seat, reply: [{ t: 'pong' }], broadcast: false };
    case 'join': {
      // Rejoining: the token names the seat.
      const back = msg.token ? room.seats.findIndex((s) => s.token === msg.token) : -1;
      if (back >= 0) return { seat: back, reply: [{ t: 'joined', seat: back, token: room.seats[back].token }], broadcast: true };
      if (room.seats.length >= 2) return { seat, reply: [{ t: 'error', message: 'This room is full.' }], broadcast: false };
      const deck = Array.isArray(msg.deck) ? msg.deck.map(String) : [];
      const species = Number.isInteger(msg.species) && msg.species >= 0 && msg.species < 4 ? msg.species : 0;
      const legal = deck.length > 0 && deckProblems(deck).length === 0;
      const token = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)]).join('');
      room.seats.push({
        token,
        name: clean(msg.name, 18) || `Player ${room.seats.length + 1}`,
        deck: legal ? deck : presetDeck(species).cards,
        deckName: legal ? clean(msg.deckName, 24) || 'Custom deck' : presetDeck(species).name,
        species,
      });
      const mine = room.seats.length - 1;
      if (room.seats.length === 2 && !room.game) start(room, random);
      return { seat: mine, reply: [{ t: 'joined', seat: mine, token }], broadcast: true };
    }
    case 'action': {
      const g = room.game;
      if (seat === null || !g) return { seat, reply: [{ t: 'error', message: 'The game has not started.' }], broadcast: false };
      const me = g.players[playerIndex(room, seat)];
      if (g.players[g.activePlayerIndex].id !== me.id) return { seat, reply: [{ t: 'error', message: "It's not your turn." }], broadcast: false };
      try {
        const next = applyAction(g, msg.action);
        room.last = describe(g, next, msg.action, me.id);
        room.game = next;
        return { seat, reply: [], broadcast: true };
      } catch (err) {
        if (err instanceof GameError) return { seat, reply: [{ t: 'error', message: err.message }], broadcast: false };
        throw err;
      }
    }
    case 'rematch': {
      if (seat === null || !room.game?.winnerId) return { seat, reply: [], broadcast: false };
      start(room, random);
      return { seat, reply: [], broadcast: true };
    }
  }
  return { seat, reply: [{ t: 'error', message: 'Unknown message.' }], broadcast: false };
}

/** Which player in the game a seat is. */
export function playerIndex(room: RoomData, seat: number): number {
  return (seat - room.first + 2) % 2;
}

function start(room: RoomData, random: () => number) {
  // A coin toss for the first game; after that, whoever went second goes first.
  room.first = room.game ? 1 - room.first : random() < 0.5 ? 0 : 1;
  const order = [room.seats[room.first], room.seats[1 - room.first]];
  room.game = createGame({
    seed: Math.floor(random() * 2 ** 31),
    players: order.map((s) => ({ name: s.name, isAI: false, deck: s.deck, deckName: s.deckName, species: s.species })),
  });
  room.last = null;
}

function describe(prev: GameState, next: GameState, action: Action, actorId: string): LastMove {
  const last: LastMove = { action, actorId };
  if (action.type === 'playCard') {
    const card = prev.players.find((p) => p.id === actorId)!.hand.find((c) => c.uid === action.cardUid);
    if (card && cardDef(card.defId).kind === 'lightspeed') {
      // Set face down (unless it was cancelled on the way, in which case it is in the discard pile for all to see).
      const actor = next.players.find((p) => p.id === actorId)!;
      if (actor.lightspeed?.uid === card.uid) last.faceDown = true;
      else last.played = card.defId;
    } else if (card) last.played = card.defId;
  }
  return last;
}

/**
 * The game as player `me` (their index in the game) may see it. Hidden cards
 * get a placeholder id and a throwaway uid, since uids follow deck-list order
 * and would otherwise give away which card is which.
 */
export function viewFor(game: GameState, me: number): GameState {
  const v = structuredClone(game);
  v.rngState = 0;
  let n = 0;
  const hide = (): CardInstance => ({ uid: `hidden-${n++}`, defId: HIDDEN });
  v.players.forEach((p, i) => {
    // Deck order is hidden from everyone; its contents only from the rival.
    if (i === me) p.deck = [...p.deck].sort((a, b) => a.defId.localeCompare(b.defId));
    else {
      p.deck = p.deck.map(() => hide());
      p.hand = p.hand.map(() => hide());
      if (p.lightspeed) p.lightspeed = hide();
    }
  });
  return v;
}

/** Everything to send each seat after a change. */
export function views(room: RoomData): ServerMessage[] {
  const g = room.game;
  if (!g) {
    const seats = room.seats.map((s) => ({ name: s.name, deckName: s.deckName, species: s.species }));
    return room.seats.map((_, i) => ({ t: 'lobby', seats, you: i }));
  }
  return room.seats.map((_, seat) => {
    const i = playerIndex(room, seat);
    return { t: 'state', state: viewFor(g, i), you: g.players[i].id, last: room.last, names: room.seats.map((s) => s.name) };
  });
}
