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
  species: number;
  ready: boolean;
}

export interface OnlineEvents {
  lobby(seats: LobbySeat[], you: number): void;
  /** `waitFor`: 'you' when you must confirm the card your rival just played, 'rival' while they read yours. */
  state(state: GameState, you: string, last: LastMove | null, waitFor: 'you' | 'rival' | null): void;
  error(message: string): void;
  /** Whether the rival is connected right now. */
  presence(rivalOnline: boolean): void;
  /** Connected, reconnecting, or given up. */
  status(status: 'connecting' | 'open' | 'lost'): void;
}

export interface JoinInfo {
  name: string;
  deck: string[];
  deckName: string;
  species: number;
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
  const base = (import.meta.env.VITE_SERVER_URL as string | undefined) || location.origin;
  return `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/room/${code}`;
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
          this.on.lobby(msg.seats as LobbySeat[], msg.you as number);
          break;
        case 'state':
          this.on.state(msg.state as GameState, msg.you as string, (msg.last as LastMove | null) ?? null, (msg.waitFor as 'you' | 'rival' | null) ?? null);
          break;
        case 'error':
          this.on.error(String(msg.message));
          break;
        case 'presence':
          this.on.presence(!!msg.rivalOnline);
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
