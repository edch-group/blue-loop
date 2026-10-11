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

/** Whether a line solves it: a win reached this day, or (survive) the rival's day lived through after it. */
export function solves(spec: Pick<DreamSpec, 'goal'>, s: GameState): boolean {
  // (A win may come as the day ends: a dusk's heat.)
  if (spec.goal === 'win') return won(s) || (!isGameOver(s) && won(step(s, { type: 'endTurn' }) ?? s));
  if (isGameOver(s)) return won(s);
  return won(rivalDay(s));
}

/** A position as a game (the same seed always, so a search and a test see the same game). */
export const puzzleGame = (spec: DreamSpec) => createDream(spec, { seed: 7, name: 'Dreamer', foeName: 'Dream' });

/** The shortest solution (its moves), or null if none is in reach. */
export function solution(spec: DreamSpec): Action[] | null {
  let best: Action[] | null = null;
  for (const { s, line } of reach(puzzleGame(spec))) if ((best === null || line.length < best.length) && solves(spec, s)) best = line;
  return best;
}
