/** Anonymous game summaries (src/engine/stats.ts), as the server takes them in. */

/** A summary checked and trimmed to its expected shape (null if it isn't one). Nothing else in it is kept. */
export function cleanStats(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const modes = ['ai', 'hotseat', 'campaign', 'online', 'ranked'];
  const id = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v) ? v : null);
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  if (!Array.isArray(r.seats) || r.seats.length < 2 || r.seats.length > 4 || !modes.includes(String(r.mode))) return null;
  const seats = r.seats.map((x) => {
    const s = (x ?? {}) as Record<string, unknown>;
    const cards = Array.isArray(s.cards) ? s.cards.slice(0, 60).map(id).filter((c): c is string => !!c) : [];
    return { human: !!s.human, starter: typeof s.starter === 'string' ? s.starter.slice(0, 40) : null, cards };
  });
  const plays = Array.isArray(r.plays)
    ? r.plays.slice(0, 600).flatMap((p) => (Array.isArray(p) && num(p[0], 3) !== null && num(p[1], 200) !== null && id(p[2]) ? [[p[0], p[1], p[2]]] : []))
    : [];
  const end = ['supernova', 'concede', 'other'].includes(String(r.end)) ? String(r.end) : 'other';
  return { v: 1, mode: String(r.mode), seats, winner: num(r.winner, 3), end, rounds: num(r.rounds, 200) ?? 0, plays };
}
