import type { GameMode } from '../src/engine/modes';
import { applyRank, canMatch, gameReward, rankName, type Reward } from '../src/engine/progression';

/**
 * The ranked ladder: every ranked player's standing (rank points, by their
 * profile id), and the queue of players looking for a ranked match. Two
 * queued players are matched as soon as they are at most one tier apart; the
 * ladder then makes a room for them, and the room reports the result back.
 *
 * Like room.ts, this has no Cloudflare dependencies; worker.ts wraps it in a
 * Durable Object (one for the whole game).
 */

export interface LadderPlayer {
  name: string;
  rankPoints: number;
  played: number;
  won: number;
}

export interface Queued {
  id: string;
  name: string;
  rankPoints: number;
  since: number;
  /** The game mode they queued for (unset: Lost Races, from before modes): players only meet others queued for the same. */
  mode?: GameMode;
}

export interface LadderData {
  players: Record<string, LadderPlayer>;
  queue: Queued[];
}

export function emptyLadder(): LadderData {
  return { players: {}, queue: [] };
}

/** A player's standing (new players start at the bottom of the ladder). */
export function standing(ladder: LadderData, id: string, name = 'Player'): LadderPlayer {
  ladder.players[id] ??= { name, rankPoints: 0, played: 0, won: 0 };
  if (name) ladder.players[id].name = name;
  return ladder.players[id];
}

export interface Match {
  room: string;
  /** The two players, with their ranks, as they were matched. */
  players: { id: string; name: string; rankPoints: number }[];
}

/**
 * Queue a player for a ranked match. If someone already waiting is within a
 * tier of them (the longest-waiting first), they are matched at once: the two
 * leave the queue, and a room code is returned for both to join.
 */
export function enqueue(ladder: LadderData, id: string, name: string, now: number, roomCode: () => string, mode: GameMode = 'lost'): Match | null {
  const me = standing(ladder, id, name);
  ladder.queue = ladder.queue.filter((q) => q.id !== id);
  const rival = [...ladder.queue].sort((a, b) => a.since - b.since).find((q) => (q.mode ?? 'lost') === mode && canMatch(q.rankPoints, me.rankPoints));
  if (!rival) {
    ladder.queue.push({ id, name, rankPoints: me.rankPoints, since: now, mode });
    return null;
  }
  ladder.queue = ladder.queue.filter((q) => q.id !== rival.id);
  return { room: roomCode(), players: [{ id: rival.id, name: rival.name, rankPoints: rival.rankPoints }, { id, name, rankPoints: me.rankPoints }] };
}

export function leaveQueue(ladder: LadderData, id: string) {
  ladder.queue = ladder.queue.filter((q) => q.id !== id);
}

export interface RankedOutcome {
  id: string;
  won: boolean;
  reward: Reward;
  rankPoints: number;
  rankName: string;
}

/**
 * A ranked game is over: move both players on the ladder, and work out what
 * each earned (weighed by the rank gap, before the game moved them).
 */
export function recordResult(ladder: LadderData, winnerId: string, loserId: string, conceded: boolean): RankedOutcome[] {
  const w = standing(ladder, winnerId, '');
  const l = standing(ladder, loserId, '');
  const wr = gameReward('ranked', true, { me: w.rankPoints, rival: l.rankPoints });
  const lr = gameReward('ranked', false, { me: l.rankPoints, rival: w.rankPoints, conceded });
  w.rankPoints = applyRank(w.rankPoints, wr.rank ?? 0);
  l.rankPoints = applyRank(l.rankPoints, lr.rank ?? 0);
  w.played += 1;
  w.won += 1;
  l.played += 1;
  return [
    { id: winnerId, won: true, reward: wr, rankPoints: w.rankPoints, rankName: rankName(w.rankPoints) },
    { id: loserId, won: false, reward: lr, rankPoints: l.rankPoints, rankName: rankName(l.rankPoints) },
  ];
}
