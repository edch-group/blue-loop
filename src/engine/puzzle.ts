/**
 * Set positions as puzzles (dreams, lessons, challenges): a full search of what the player can do in their day, and
 * whether a line of play solves the puzzle (a win before the day ends, or the rival's next day lived through).
 */
import { activePlayer, applyAction, createDream, isGameOver, type DreamSpec } from './game';
import { chooseAIAction, movesNow } from './ai';
import type { Action, GameState } from './types';

/** A position's identity for the search (what a later move can tell apart). */
const key = (s: GameState) =>
  JSON.stringify(s.players.map((p) => [p.heat, p.shields, p.playsLeft, p.tableau.map((c) => [c.defId, c.slot, c.health, c.dimmed ? 1 : 0, c.spentAttack ? 1 : 0, c.dented ?? 0, c.shields ?? 0, c.attackBonus ?? 0, c.growth ?? 0]).sort(), p.hand.map((c) => c.defId).sort(), p.lightspeed?.defId ?? '']));

/** A move made, or null if it can't be (or it opens a choice the search doesn't follow). */
export function step(s: GameState, a: Action): GameState | null {
  try {
    const n = applyAction(s, a);
    if (n.reaction || n.players[0].dawnChoices?.length) return null;
    return n;
  } catch {
    return null;
  }
}

/** The rival's whole day, played by the AI, back round to the player (or to an end). */
export function rivalDay(s: GameState): GameState {
  let g = step(s, { type: 'endTurn' });
  if (!g) return s;
  for (let i = 0; i < 80 && !isGameOver(g) && activePlayer(g) !== g.players[0]; i++) {
    const n = step(g, chooseAIAction(g));
    if (!n) break;
    g = n;
  }
  return g;
}

/** Every position reachable this day (to a cap), with the fewest moves to reach it, and the moves. */
export function reach(start: GameState, cap = 6000): { s: GameState; depth: number; line: Action[] }[] {
  const seen = new Set<string>([key(start)]);
  const out: { s: GameState; depth: number; line: Action[] }[] = [];
  const queue = [{ s: start, depth: 0, line: [] as Action[] }];
  while (queue.length && out.length < cap) {
    const cur = queue.shift()!;
    out.push(cur);
    if (isGameOver(cur.s)) continue;
    for (const a of movesNow(cur.s)) {
      const n = step(cur.s, a);
      if (!n) continue;
      const k = key(n);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ s: n, depth: cur.depth + 1, line: [...cur.line, a] });
    }
  }
  return out;
}

const won = (s: GameState) => s.winnerId === s.players[0].id;

/** The dreamer's next day: the rival's day played out, back to the dreamer (null: it never came, or the game ended). */
export function nextDay(s: GameState): GameState | null {
  const g = rivalDay(s);
  return isGameOver(g) || activePlayer(g) !== g.players[0] ? null : g;
}

/** Whether a line solves it: a win reached this day, or (survive) the rival's day lived through after it. */
export function solves(spec: Pick<DreamSpec, 'goal'>, s: GameState): boolean {
  // (A win may come as the day ends: a dusk's heat.)
  if (spec.goal === 'win') return won(s) || (!isGameOver(s) && won(step(s, { type: 'endTurn' }) ?? s));
  if (isGameOver(s)) return won(s);
  return won(rivalDay(s));
}

/** A position as a game (the same seed always, so a search and a test see the same game). */
export const puzzleGame = (spec: DreamSpec) => createDream(spec, { seed: 7, name: 'Dreamer', foeName: 'Dream' });

/** The shortest solution (its moves; a multi-day one with each day's end between), or null if none is in reach. */
export function solution(spec: DreamSpec): Action[] | null {
  if ((spec.days ?? 1) > 1) return winWithin(puzzleGame(spec), spec.days!);
  let best: Action[] | null = null;
  for (const { s, line } of reach(puzzleGame(spec))) if ((best === null || line.length < best.length) && solves(spec, s)) best = line;
  return best;
}

/**
 * A win within `days` of the player's days from here (the rival's days played by its AI between): the moves, each
 * day's closed by its end, or null. Positions met at the start of a day are searched once.
 */
export function winWithin(start: GameState, days: number, cap = 3000, seen = new Map<string, number>()): Action[] | null {
  const all = reach(start, cap);
  // (A win this day, the shortest first; a dusk's heat counts.)
  let best: Action[] | null = null;
  for (const { s, line } of all) if ((best === null || line.length < best.length) && solves({ goal: 'win' }, s)) best = line;
  if (best || days <= 1) return best;
  for (const { s, line } of all) {
    if (isGameOver(s)) continue;
    const next = nextDay(s);
    if (!next) continue;
    const k = key(next);
    // (A position already searched with as many days left, or more, adds nothing.)
    if ((seen.get(k) ?? 0) >= days - 1) continue;
    seen.set(k, days - 1);
    const rest = winWithin(next, days - 1, cap, seen);
    if (rest) return [...line, { type: 'endTurn' }, ...rest];
  }
  return null;
}

/** The most heat the player can put on the rival's sun within `days` of their days (for setting a multi-day puzzle's sun). */
export function mostHeatWithin(start: GameState, days: number, cap = 3000, seen = new Map<string, number>()): number {
  const all = reach(start, cap);
  let most = Math.max(...all.map(({ s }) => s.players[1].heat));
  if (days <= 1) return most;
  for (const { s } of all) {
    if (isGameOver(s)) continue;
    const next = nextDay(s);
    if (!next) continue;
    const k = key(next);
    if ((seen.get(k) ?? 0) >= days - 1) continue;
    seen.set(k, days - 1);
    most = Math.max(most, mostHeatWithin(next, days - 1, cap, seen));
  }
  return most;
}
