import { DurableObject } from 'cloudflare:workers';
import { emptyRoom, handle, views, type ClientMessage, type RoomData, type ServerMessage } from './room';

/**
 * The Blue Loop server: the game's static files (built by Vite into dist/)
 * and, at /room/<CODE>, a WebSocket into that room's Durable Object.
 */

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/room\/([A-Z0-9]{4,8})$/.exec(url.pathname);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket.', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(request);
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

  async fetch(): Promise<Response> {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ seat: null });
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
    const { seat } = (ws.deserializeAttachment() ?? { seat: null }) as { seat: number | null };
    const out = handle(room, seat, msg);
    if (out.seat !== seat) ws.serializeAttachment({ seat: out.seat });
    for (const r of out.reply) send(ws, r);
    if (out.broadcast) {
      await this.ctx.storage.put('room', room);
      const byseat = views(room);
      for (const other of this.ctx.getWebSockets()) {
        const s = (other.deserializeAttachment() as { seat: number | null } | null)?.seat;
        if (s !== null && s !== undefined && byseat[s]) send(other, byseat[s]);
      }
    }
    // A finished room tidies itself away after a day without play.
    await this.ctx.storage.setAlarm(Date.now() + 24 * 3600 * 1000);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
    this.data = null;
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // The connection is gone; it will rejoin.
  }
}
