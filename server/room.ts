import { applyAction, cardDef, coverCard, createGame, deckProblems, GameError, presetDeck, RACE_NAMES, type Action, type CardInstance, type GameState } from '../src/engine';

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
  /** Confirmed in the lobby: the game starts once both seats are ready. */
  ready?: boolean;
  /** The player's profile id (ranked rooms admit only the two players matched). */
  profileId?: string;
}

export interface RoomData {
  seats: Seat[];
  /** Whether a game has been played here, so the next one alternates who goes first. */
  played?: boolean;
  /** Which seat plays first this game (it alternates on a rematch). Player i is seat (first + i) % 2. */
  first: number;
  game: GameState | null;
  /** The last move, for the clients to animate. */
  last: LastMove | null;
  /**
   * The seat that must confirm it has read the card just played against it
   * before the player who played it may act again (null: nobody is waited on).
   */
  waitingOn?: number | null;
  /** A ranked room: the profile ids of the two players the ladder matched, and whether the result has gone back to it. */
  ranked?: { ids: string[]; reported?: boolean };
  /** An unranked game's rewards have been paid (to each signed-in player), once per game. */
  rewarded?: boolean;
}

export interface LastMove {
  action: Action;
  actorId: string;
  /** The card that was played (unless it was set face down). */
  played?: string;
  faceDown?: boolean;
}

/** What a game paid an account: the reward with any level-up bonus (see server/economy.ts). */
export interface Payout {
  stardust: number;
  flux: number;
  xp: number;
  rank?: number;
  levelsGained: number;
  bonus: { stardust: number; flux: number };
}

/** What a client may send. */
export type ClientMessage =
  | { t: 'join'; name: string; deck: string[]; deckName: string; species: number; token?: string; profileId?: string }
  | { t: 'action'; action: Action }
  | { t: 'rematch' }
  /** In the lobby: change your name, deck or race (this un-readies you). */
  | { t: 'setup'; name: string; deck: string[]; deckName: string; species: number }
  /** In the lobby: confirm (or take back) that you are ready to start. */
  | { t: 'ready'; ready: boolean }
  /** In a game: you have read the card your rival just played (they may carry on). */
  | { t: 'ack' }
  | { t: 'ping' };

/** What the room sends. */
export type ServerMessage =
  | { t: 'joined'; seat: number; token: string }
  | { t: 'lobby'; seats: { name: string; deckName: string; species: number; ready: boolean; cover: string | null }[]; you: number; ranked: boolean }
  /** `waitFor`: 'you' when you must confirm your rival's card, 'rival' while they read yours. */
  | { t: 'state'; state: GameState; you: string; last: LastMove | null; names: string[]; waitFor: 'you' | 'rival' | null; ranked: boolean }
  /** A ranked game's result for you: what it earned, and where it left you on the ladder. */
  | { t: 'ranked'; won: boolean; reward: Payout; rankPoints: number; rankName: string }
  /** An unranked game's result for you: what the server paid into your account (null: nothing, e.g. not signed in). */
  | { t: 'reward'; won: boolean; reward: Payout | null }
  | { t: 'error'; message: string }
  | { t: 'pong' }
  /** Whether the other player is connected right now (sent by the worker as connections come and go). */
  | { t: 'presence'; rivalOnline: boolean };

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
/** A ranked game has just ended: who won and lost (by profile id), for the ladder. */
export interface RankedReport {
  winner: string;
  loser: string;
  conceded: boolean;
}

export function handle(
  room: RoomData,
  seat: number | null,
  msg: ClientMessage,
  random: () => number = Math.random,
): { seat: number | null; reply: ServerMessage[]; broadcast: boolean; report?: RankedReport } {
  const out = handleMessage(room, seat, msg, random);
  // A ranked game that just ended goes back to the ladder (once).
  const g = room.game;
  if (room.ranked && !room.ranked.reported && g?.winnerId) {
    const winnerSeat = [0, 1].find((s) => g.players[playerIndex(room, s)]?.id === g.winnerId);
    const winner = winnerSeat !== undefined ? room.seats[winnerSeat]?.profileId : undefined;
    const loser = winnerSeat !== undefined ? room.seats[1 - winnerSeat]?.profileId : undefined;
    if (winner && loser) {
      room.ranked.reported = true;
      return { ...out, report: { winner, loser, conceded: !!g.concededBy } };
    }
  }
  return out;
}

function handleMessage(room: RoomData, seat: number | null, msg: ClientMessage, random: () => number): { seat: number | null; reply: ServerMessage[]; broadcast: boolean } {
  switch (msg.t) {
    case 'ping':
      return { seat, reply: [{ t: 'pong' }], broadcast: false };
    case 'join': {
      // Rejoining: the token names the seat.
      const back = msg.token ? room.seats.findIndex((s) => s.token === msg.token) : -1;
      if (back >= 0) return { seat: back, reply: [{ t: 'joined', seat: back, token: room.seats[back].token }], broadcast: true };
      if (room.seats.length >= 2) return { seat, reply: [{ t: 'error', message: 'This room is full.' }], broadcast: false };
      // A ranked room is only for the two players the ladder matched.
      if (room.ranked && (!msg.profileId || !room.ranked.ids.includes(msg.profileId) || room.seats.some((s) => s.profileId === msg.profileId))) {
        return { seat, reply: [{ t: 'error', message: 'This ranked match is for two other players.' }], broadcast: false };
      }
      const token = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)]).join('');
      room.seats.push({ token, ...seatSetup(msg, room.seats.length), ready: false, profileId: typeof msg.profileId === 'string' ? msg.profileId.slice(0, 40) : undefined });
      const mine = room.seats.length - 1;
      return { seat: mine, reply: [{ t: 'joined', seat: mine, token }], broadcast: true };
    }
    case 'setup': {
      if (seat === null || room.game) return { seat, reply: [], broadcast: false };
      Object.assign(room.seats[seat], seatSetup(msg, seat), { ready: false });
      return { seat, reply: [], broadcast: true };
    }
    case 'ready': {
      if (seat === null || room.game) return { seat, reply: [], broadcast: false };
      room.seats[seat].ready = !!msg.ready;
      // Both seats taken and both confirmed: play.
      if (room.seats.length === 2 && room.seats.every((s) => s.ready)) start(room, random);
      return { seat, reply: [], broadcast: true };
    }
    case 'action': {
      const g = room.game;
      if (seat === null || !g) return { seat, reply: [{ t: 'error', message: 'The game has not started.' }], broadcast: false };
      const me = g.players[playerIndex(room, seat)];
      // Conceding is allowed on either player's turn, and only ever for yourself.
      if (msg.action.type === 'concede') {
        if (g.winnerId) return { seat, reply: [], broadcast: false };
        room.waitingOn = null;
        room.game = applyAction(g, { type: 'concede', playerId: me.id });
        room.last = { action: { type: 'concede', playerId: me.id }, actorId: me.id };
        return { seat, reply: [], broadcast: true };
      }
      if (g.players[g.activePlayerIndex].id !== me.id) return { seat, reply: [{ t: 'error', message: "It's not your day." }], broadcast: false };
      if (room.waitingOn === 1 - seat) return { seat, reply: [{ t: 'error', message: `${room.seats[1 - seat]?.name ?? 'Your rival'} is still reading your card.` }], broadcast: false };
      try {
        const next = applyAction(g, msg.action);
        room.last = describe(g, next, msg.action, me.id);
        room.game = next;
        // A card that landed (in play, or set face down) waits for the rival to read it before its player goes on.
        if (msg.action.type === 'playCard' && !next.winnerId) {
          const cardUid = msg.action.cardUid;
          const actor = next.players.find((p) => p.id === me.id)!;
          room.waitingOn = actor.tableau.some((c) => c.uid === cardUid) || actor.lightspeed?.uid === cardUid ? 1 - seat : null;
        } else room.waitingOn = null;
        return { seat, reply: [], broadcast: true };
      } catch (err) {
        if (err instanceof GameError) return { seat, reply: [{ t: 'error', message: err.message }], broadcast: false };
        throw err;
      }
    }
    case 'ack': {
      if (seat === null || room.waitingOn !== seat) return { seat, reply: [], broadcast: false };
      room.waitingOn = null;
      return { seat, reply: [], broadcast: true };
    }
    case 'rematch': {
      if (seat === null || !room.game?.winnerId) return { seat, reply: [], broadcast: false };
      // Whoever conceded has left the room: there is no one to play again.
      if (room.game.concededBy) return { seat, reply: [{ t: 'error', message: 'Your rival has left the room.' }], broadcast: false };
      if (room.ranked) return { seat, reply: [{ t: 'error', message: 'A ranked match is one game: find another match to play again.' }], broadcast: false };
      // Back to the lobby, where both can change deck or race and confirm again.
      room.game = null;
      room.last = null;
      room.waitingOn = null;
      for (const s of room.seats) s.ready = false;
      return { seat, reply: [], broadcast: true };
    }
  }
  return { seat, reply: [{ t: 'error', message: 'Unknown message.' }], broadcast: false };
}

/** Which player in the game a seat is. */
export function playerIndex(room: RoomData, seat: number): number {
  return (seat - room.first + 2) % 2;
}

/** A seat's name, deck and race from a join or setup message (an illegal deck falls back to that race's starter). */
function seatSetup(msg: { name: string; deck: string[]; deckName: string; species: number }, index: number): Omit<Seat, 'token'> {
  const deck = Array.isArray(msg.deck) ? msg.deck.map(String) : [];
  const species = Number.isInteger(msg.species) && msg.species >= 0 && msg.species < RACE_NAMES.length ? msg.species : 0;
  const legal = deck.length > 0 && deckProblems(deck).length === 0;
  return {
    name: clean(msg.name, 18) || `Player ${index + 1}`,
    deck: legal ? deck : presetDeck(species).cards,
    deckName: legal ? clean(msg.deckName, 24) || 'Custom deck' : presetDeck(species).name,
    species,
  };
}

function start(room: RoomData, random: () => number) {
  // A coin toss for the first game; after that, whoever went second goes first.
  room.first = room.played ? 1 - room.first : random() < 0.5 ? 0 : 1;
  room.played = true;
  room.rewarded = false;
  for (const s of room.seats) s.ready = false;
  const order = [room.seats[room.first], room.seats[1 - room.first]];
  room.game = createGame({
    seed: Math.floor(random() * 2 ** 31),
    players: order.map((s) => ({ name: s.name, isAI: false, deck: s.deck, deckName: s.deckName, species: s.species })),
  });
  room.last = null;
  room.waitingOn = null;
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
    const seats = room.seats.map((s) => ({ name: s.name, deckName: s.deckName, species: s.species, ready: !!s.ready, cover: coverCard(s.deck)?.id ?? null }));
    return room.seats.map((_, i) => ({ t: 'lobby', seats, you: i, ranked: !!room.ranked }));
  }
  return room.seats.map((_, seat) => {
    const i = playerIndex(room, seat);
    const waitFor = room.waitingOn == null || g.winnerId ? null : room.waitingOn === seat ? 'you' : 'rival';
    return { t: 'state', state: viewFor(g, i), you: g.players[i].id, last: room.last, names: room.seats.map((s) => s.name), waitFor, ranked: !!room.ranked };
  });
}
