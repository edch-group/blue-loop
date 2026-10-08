import type { GameMode } from '../engine';
import { withSession, type Payout } from './account';
import type { Action, GameState } from '../engine';

/**
 * The client side of an online 1v1 room (see server/room.ts): a WebSocket to
 * /room/<CODE> on the game's server, which runs the game and sends this
 * player their view of it. The connection rejoins by itself if it drops (a
 * phone locking, a train tunnel), using the seat token kept for the room.
 */

export interface LastMove {
  action: Action;
  actorId: string;
  played?: string;
  faceDown?: boolean;
}

export interface LobbySeat {
  name: string;
  deckName: string;
  ready: boolean;
  /** Their deck's cover card (see coverCard). */
  cover?: string | null;
}

export interface OnlineEvents {
  lobby(seats: LobbySeat[], you: number, ranked: boolean): void;
  /** `waitFor`: 'you' when you must confirm the card your rival just played, 'rival' while they read yours. `ranked`: a ranked match. */
  state(state: GameState, you: string, last: LastMove | null, waitFor: 'you' | 'rival' | null, ranked: boolean): void;
  /** A ranked game's result for you, from the ladder. */
  ranked?(result: RankedResult): void;
  /** An unranked game's result for you: what the server paid into your account (null: nothing). */
  reward?(won: boolean, reward: Payout | null): void;
  error(message: string): void;
  /** Whether the rival is connected right now. */
  presence(rivalOnline: boolean): void;
  /** Which card of their hand the rival has under their pointer (by place in the hand; null: none). */
  rivalHover?(index: number | null): void;
  /** Connected, reconnecting, or given up. */
  status(status: 'connecting' | 'open' | 'lost'): void;
}

export interface JoinInfo {
  name: string;
  deck: string[];
  deckName: string;
  /** Your picture (a card id). */
  avatar?: string;
  /** Your profile id (ranked rooms admit only the two players matched). */
  profileId?: string;
  /** The mode your deck is built for. */
  mode?: GameMode;
}

export interface RankedResult {
  won: boolean;
  /** What the server paid into your account. */
  reward: Payout;
  rankPoints: number;
  rankName: string;
}

/** Room codes: five letters and digits, without the ones easily confused (0/O, 1/I). */
export function newRoomCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

export function cleanCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** Where the rooms are: the same server as the page, unless the build names another (VITE_SERVER_URL). */
function serverUrl(code: string): string {
  return withSession(`${serverBase()}/room/${code}`);
}

function serverBase(): string {
  const base = (import.meta.env.VITE_SERVER_URL as string | undefined) || location.origin;
  return base.replace(/^http/, 'ws').replace(/\/$/, '');
}

/** An invite link to a room. */
export function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = `?room=${code}`;
  u.hash = '';
  return u.toString();
}

const tokenKey = (code: string) => `blue-loop:online:${code}`;

/** Whether this browser already holds a seat in a room (so it can rejoin without asking). */
export function hasSeat(code: string): boolean {
  try {
    return !!localStorage.getItem(tokenKey(code));
  } catch {
    return false;
  }
}

export class OnlineClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private retries = 0;
  private ping: number | null = null;

  constructor(
    public readonly code: string,
    private join: JoinInfo,
    private on: OnlineEvents,
  ) {
    this.open();
  }

  private open() {
    this.on.status('connecting');
    const ws = new WebSocket(serverUrl(this.code));
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.on.status('open');
      let token: string | undefined;
      try {
        token = localStorage.getItem(tokenKey(this.code)) ?? undefined;
      } catch {
        // No storage: a dropped connection starts a new seat.
      }
      this.send({ t: 'join', ...this.join, token });
      if (this.ping !== null) window.clearInterval(this.ping);
      this.ping = window.setInterval(() => this.send({ t: 'ping' }), 25000);
    };
    ws.onmessage = (e) => {
      let msg: { t: string; [k: string]: unknown };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      switch (msg.t) {
        case 'joined':
          try {
            localStorage.setItem(tokenKey(this.code), String(msg.token));
          } catch {
            // ignore
          }
          break;
        case 'lobby':
          this.on.lobby(msg.seats as LobbySeat[], msg.you as number, !!msg.ranked);
          break;
        case 'state':
          this.on.state(msg.state as GameState, msg.you as string, (msg.last as LastMove | null) ?? null, (msg.waitFor as 'you' | 'rival' | null) ?? null, !!msg.ranked);
          break;
        case 'ranked':
          this.on.ranked?.(msg as unknown as RankedResult);
          break;
        case 'reward':
          this.on.reward?.(!!msg.won, (msg.reward as Payout | null) ?? null);
          break;
        case 'error':
          this.on.error(String(msg.message));
          break;
        case 'presence':
          this.on.presence(!!msg.rivalOnline);
          break;
        case 'rivalHover':
          this.on.rivalHover?.(typeof msg.i === 'number' ? msg.i : null);
          break;
      }
    };
    ws.onclose = () => {
      if (this.ping !== null) window.clearInterval(this.ping);
      this.ping = null;
      if (this.closed) return;
      // Try again, backing off, for about a minute; then say so (the player can retry).
      if (this.retries++ > 8) return this.on.status('lost');
      this.on.status('connecting');
      window.setTimeout(() => !this.closed && this.open(), Math.min(8000, 500 * 2 ** this.retries));
    };
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  act(action: Action) {
    this.send({ t: 'action', action });
  }

  /** The card of your hand under your pointer (by place; null: none), for your rival to see lift. */
  hover(index: number | null) {
    this.send({ t: 'hover', i: index });
  }

  /** You have read the card your rival just played: they may carry on. */
  ack() {
    this.send({ t: 'ack' });
  }

  rematch() {
    this.send({ t: 'rematch' });
  }

  /** In the lobby: a new name, deck or race (kept for rejoining too). */
  setup(join: JoinInfo) {
    this.join = join;
    this.send({ t: 'setup', ...join });
  }

  ready(ready: boolean) {
    this.send({ t: 'ready', ready });
  }

  /** Reconnect now (after the connection was given up). */
  retry() {
    this.retries = 0;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.open();
  }

  close() {
    this.closed = true;
    if (this.ping !== null) window.clearInterval(this.ping);
    this.ws?.close();
  }
}

export interface LadderEvents {
  /** In the queue: your rank as the ladder has it. */
  queued(rankPoints: number, rankName: string): void;
  /** Matched: the room made for you and your rival. */
  match(room: string, rival: { name: string; rankName: string }, rankPoints: number): void;
  /** The connection to the ladder failed. */
  lost(): void;
  /** Ranked play needs an account: sign in first. */
  signin(): void;
}

/**
 * The ranked ladder (see server/ladder.ts): a WebSocket to /ladder that
 * queues you for a ranked match and tells you which room to join once a rival
 * within a tier of you is found.
 */
export class LadderClient {
  private ws: WebSocket;
  private closed = false;

  constructor(id: string, name: string, private on: LadderEvents, mode: GameMode = 'core') {
    this.ws = new WebSocket(withSession(`${serverBase()}/ladder`));
    this.ws.onopen = () => this.ws.send(JSON.stringify({ t: 'queue', id, name, mode }));
    this.ws.onmessage = (e) => {
      let msg: { t: string; [k: string]: unknown };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.t === 'signin') this.on.signin();
      if (msg.t === 'queued') this.on.queued(Number(msg.rankPoints), String(msg.rankName));
      if (msg.t === 'match') this.on.match(String(msg.room), msg.rival as { name: string; rankName: string }, Number(msg.rankPoints));
    };
    this.ws.onclose = () => {
      if (!this.closed) this.on.lost();
    };
  }

  close() {
    this.closed = true;
    try {
      this.ws.send(JSON.stringify({ t: 'leave' }));
    } catch {
      // Not open.
    }
    this.ws.close();
  }
}
