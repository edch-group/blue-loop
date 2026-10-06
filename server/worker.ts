import { DurableObject } from 'cloudflare:workers';
import { emptyLadder, enqueue, leaveQueue, recordResult, standing, type LadderData, type LadderPlayer, type Queued } from './ladder';
import { rankName } from '../src/engine/progression';
import { isProfane } from '../src/engine/profanity';
import { emptyRoom, handle, playerIndex, views, type ClientMessage, type Payout, type RankedReport, type RoomData, type ServerMessage } from './room';

/** An unranked online game pays out only once it has gone at least this many rounds. */
const MIN_REWARD_ROUNDS = 3;
import { accountOf, cleanStats, creditGame, creditRanked, handleAccounts, keepStats, type AccountsEnv } from './accounts';

/**
 * The Blue Loop server: the game's static files (built by Vite into dist/)
 * and, at /room/<CODE>, a WebSocket into that room's Durable Object.
 */

interface Env extends AccountsEnv {
  ROOMS: DurableObjectNamespace<Room>;
  LADDER: DurableObjectNamespace<Ladder>;
  ASSETS: Fetcher;
  DB: D1Database;
}

/**
 * A WebSocket upgrade, passed on to its Durable Object with the signed-in account (if any) in a header
 * the client can't forge (any copy the client sent is dropped). Rooms and the ladder trust only this.
 */
async function withAccount(request: Request, env: Env): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.delete('X-Account-Id');
  const account = await accountOf(request, env);
  if (account) headers.set('X-Account-Id', account.id);
  return new Request(request, { headers });
}

/** The one ladder for the whole game. */
const ladderOf = (env: Env) => env.LADDER.get(env.LADDER.idFromName('ladder'));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleAccounts(request, env);
    const m = /^\/room\/([A-Z0-9]{4,8})$/.exec(url.pathname);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket.', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(await withAccount(request, env));
    }
    if (url.pathname === '/ladder') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket.', { status: 426 });
      return ladderOf(env).fetch(await withAccount(request, env));
    }
    return env.ASSETS.fetch(request);
  },
};

/** One game room. Connections hibernate between messages; the room's data lives in storage. */
export class Room extends DurableObject<Env> {
  private data: RoomData | null = null;

  private async load(): Promise<RoomData> {
    this.data ??= (await this.ctx.storage.get<RoomData>('room')) ?? emptyRoom();
    return this.data;
  }

  async fetch(request: Request): Promise<Response> {
    // The ladder made this room for two matched players: it is ranked, and only for them.
    if (request.method === 'POST' && new URL(request.url).pathname === '/setup') {
      const { ids } = (await request.json()) as { ids: string[] };
      const room = await this.load();
      if (!room.seats.length && !room.game) {
        room.ranked = { ids: ids.map(String).slice(0, 2) };
        await this.ctx.storage.put('room', room);
      }
      return new Response('ok');
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ seat: null, account: request.headers.get('X-Account-Id') });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const room = await this.load();
    const { seat, account } = (ws.deserializeAttachment() ?? { seat: null, account: null }) as { seat: number | null; account: string | null };
    // Who a player is comes from their session, never from what they say: a ranked seat needs an account.
    if (msg.t === 'join') msg = { ...msg, profileId: account ?? undefined };
    const out = handle(room, seat, msg);
    if (out.seat !== seat) ws.serializeAttachment({ seat: out.seat, account });
    for (const r of out.reply) send(ws, r);
    if (out.broadcast) {
      await this.ctx.storage.put('room', room);
      const byseat = views(room);
      for (const other of this.ctx.getWebSockets()) {
        const s = seatOf(other);
        if (s !== null && byseat[s]) send(other, byseat[s]);
      }
    }
    if (msg.t === 'join') this.presence();
    // A finished game's anonymous summary, kept once (for balancing: no player or account in it).
    if (room.game?.winnerId && room.stats && !room.statsKept) {
      room.statsKept = true;
      await this.ctx.storage.put('room', room);
      const clean = cleanStats(room.stats);
      if (clean) await keepStats(this.env.DB, clean, 'server').catch((e) => console.error(e));
    }
    if (out.report) await this.reportRanked(room, out.report);
    else await this.payUnranked(room);
    // Rooms tidy themselves away: an hour after a game ends, or after a day without play.
    await this.ctx.storage.setAlarm(Date.now() + (room.game?.winnerId ? 3600 : 24 * 3600) * 1000);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      // Already closed.
    }
    await this.release(ws);
    this.presence(ws);
  }

  /**
   * An unranked game ended: the server pays each signed-in player's reward into their account (once per
   * game, and only for a game that went at least a few rounds, so a pair can't farm quick concessions).
   */
  private async payUnranked(room: RoomData) {
    const g = room.game;
    if (room.ranked || room.rewarded || !g?.winnerId) return;
    room.rewarded = true;
    await this.ctx.storage.put('room', room);
    const counts = g.round >= MIN_REWARD_ROUNDS;
    for (const ws of this.ctx.getWebSockets()) {
      const s = seatOf(ws);
      if (s === null) continue;
      const me = g.players[playerIndex(room, s)];
      const account = room.seats[s]?.profileId;
      if (!me) continue;
      const won = g.winnerId === me.id;
      let reward = null;
      if (account && counts) {
        try {
          reward = await creditGame(this.env.DB, account, 'online', won, g.concededBy === me.id);
        } catch (e) {
          console.error(e);
        }
      }
      send(ws, { t: 'reward', won, reward });
    }
  }

  /** A ranked game ended: the ladder moves both players and says what each earned; each hears their own result. */
  private async reportRanked(room: RoomData, report: RankedReport) {
    let outcomes: { id: string; won: boolean; reward: Payout; rankPoints: number; rankName: string }[] = [];
    try {
      const res = await ladderOf(this.env).fetch('https://ladder/result', { method: 'POST', body: JSON.stringify(report) });
      outcomes = await res.json();
    } catch {
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      const s = seatOf(ws);
      const o = s !== null ? outcomes.find((x) => x.id === room.seats[s]?.profileId) : undefined;
      if (o) send(ws, { t: 'ranked', won: o.won, reward: o.reward, rankPoints: o.rankPoints, rankName: o.rankName });
    }
  }

  /** A player who leaves (or loses their connection) no longer holds up their rival, who was waiting for them to read a card. */
  private async release(ws: WebSocket) {
    const room = await this.load();
    const seat = seatOf(ws);
    if (seat === null || room.waitingOn !== seat) return;
    room.waitingOn = null;
    await this.ctx.storage.put('room', room);
    const byseat = views(room);
    for (const other of this.ctx.getWebSockets()) {
      const s = seatOf(other);
      if (other !== ws && s !== null && byseat[s]) send(other, byseat[s]);
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.release(ws);
    this.presence(ws);
  }

  /** Tell each connected player whether their rival is connected too (`gone` is a connection that just closed). */
  private presence(gone?: WebSocket) {
    const open = this.ctx.getWebSockets().filter((w) => w !== gone && w.readyState === WebSocket.OPEN);
    const seats = new Set(open.map(seatOf).filter((s) => s !== null));
    for (const w of open) {
      const s = seatOf(w);
      if (s !== null) send(w, { t: 'presence', rivalOnline: seats.has(1 - s) });
    }
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
    this.data = null;
  }
}

function seatOf(ws: WebSocket): number | null {
  return (ws.deserializeAttachment() as { seat: number | null } | null)?.seat ?? null;
}

function send(ws: WebSocket, msg: ServerMessage) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // The connection is gone; it will rejoin.
  }
}

/** What a client may send the ladder. */
type LadderMessage = { t: 'queue'; id: string; name: string } | { t: 'leave' } | { t: 'standing'; id: string } | { t: 'ping' };

/** A room code for a ranked match (longer than a friend's, so it never clashes with one). */
function rankedCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

/**
 * The ranked ladder (one for the whole game): players queue over a WebSocket,
 * are matched within a tier of each other and sent to a room made for them;
 * rooms post results back here. Each player's standing is stored under their
 * profile id.
 */
export class Ladder extends DurableObject<Env> {
  private queue: Queued[] | null = null;

  private async ladder(ids: string[]): Promise<LadderData> {
    this.queue ??= (await this.ctx.storage.get<Queued[]>('queue')) ?? [];
    const data = emptyLadder();
    data.queue = this.queue;
    for (const id of ids) {
      const p = await this.ctx.storage.get<LadderPlayer>(`p:${id}`);
      if (p) data.players[id] = p;
    }
    return data;
  }

  private async save(data: LadderData) {
    this.queue = data.queue;
    await this.ctx.storage.put('queue', data.queue);
    for (const [id, p] of Object.entries(data.players)) await this.ctx.storage.put(`p:${id}`, p);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST' && new URL(request.url).pathname === '/result') {
      const r = (await request.json()) as RankedReport;
      const data = await this.ladder([r.winner, r.loser]);
      const outcomes = recordResult(data, r.winner, r.loser, r.conceded);
      await this.save(data);
      // Each account is paid (and its rank kept) by the server; the players hear what they were paid.
      const paid = [];
      for (const o of outcomes) {
        try {
          paid.push({ ...o, reward: await creditRanked(this.env.DB, o.id, o.reward, o.won, o.rankPoints) });
        } catch (e) {
          console.error(e);
          paid.push({ ...o, reward: { ...o.reward, levelsGained: 0, bonus: { stardust: 0, flux: 0 } } });
        }
      }
      return Response.json(paid);
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ id: null, account: request.headers.get('X-Account-Id') });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let msg: LadderMessage;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const clean = (v: unknown, n: number) => String(v ?? '').replace(/[^\p{L}\p{N} '’.-]/gu, '').trim().slice(0, n);
    if (msg.t === 'ping') return void ws.send(JSON.stringify({ t: 'pong' }));
    // Ranked play is for accounts: a player's standing is kept under their account, which only the server knows.
    const account = (ws.deserializeAttachment() as { account: string | null } | null)?.account ?? null;
    if ((msg.t === 'standing' || msg.t === 'queue') && !account) return void ws.send(JSON.stringify({ t: 'signin' }));
    if (msg.t === 'standing') {
      const id = account!;
      const data = await this.ladder([id]);
      const p = data.players[id];
      return void ws.send(JSON.stringify({ t: 'standing', rankPoints: p?.rankPoints ?? 0, rankName: rankName(p?.rankPoints ?? 0) }));
    }
    if (msg.t === 'leave') {
      const id = (ws.deserializeAttachment() as { id: string | null })?.id;
      if (!id) return;
      const data = await this.ladder([]);
      leaveQueue(data, id);
      await this.save(data);
      return;
    }
    if (msg.t === 'queue') {
      const id = account!;
      const given = clean(msg.name, 18);
      const name = given && !isProfane(given) ? given : 'Player';
      ws.serializeAttachment({ id, account });
      // Only players still connected can be matched.
      const live = new Set(this.ctx.getWebSockets().map((w) => (w.deserializeAttachment() as { id: string | null })?.id).filter(Boolean));
      const data = await this.ladder([id, ...(this.queue ?? (await this.ctx.storage.get<Queued[]>('queue')) ?? []).map((q) => q.id)]);
      data.queue = data.queue.filter((q) => live.has(q.id));
      const match = enqueue(data, id, name, Date.now(), rankedCode);
      await this.save(data);
      if (!match) {
        const me = standing(data, id, name);
        return void ws.send(JSON.stringify({ t: 'queued', rankPoints: me.rankPoints, rankName: rankName(me.rankPoints) }));
      }
      // Make the room for the two of them, then send both there.
      await this.env.ROOMS.get(this.env.ROOMS.idFromName(match.room)).fetch('https://room/setup', { method: 'POST', body: JSON.stringify({ ids: match.players.map((p) => p.id) }) });
      for (const w of this.ctx.getWebSockets()) {
        const wid = (w.deserializeAttachment() as { id: string | null })?.id;
        const me = match.players.find((p) => p.id === wid);
        const rival = match.players.find((p) => p.id !== wid);
        if (me && rival) {
          try {
            w.send(JSON.stringify({ t: 'match', room: match.room, rival: { name: rival.name, rankName: rankName(rival.rankPoints) }, rankPoints: me.rankPoints }));
          } catch {
            // Gone: they will find the room empty of them, and their rival can leave.
          }
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      // Already closed.
    }
    const id = (ws.deserializeAttachment() as { id: string | null })?.id;
    if (!id) return;
    const data = await this.ladder([]);
    leaveQueue(data, id);
    await this.save(data);
  }
}
