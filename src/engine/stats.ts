import { cardDef, PRESET_DECKS } from './cards';
import type { Action, GameState, PlayerState } from './types';

/**
 * Anonymous game summaries, for balancing: the decks on each side, who went first and who won, how long it
 * took, and which cards were played when. Nothing about the players themselves (no names, no accounts): only
 * what was played. Made the same way by the game (games on a device) and the room server (games online).
 */
export interface StatsSeat {
  /** Played by a person (not the AI). */
  human: boolean;
  /** The starter deck it is, card for card (a deck of one's own is never named). */
  starter: string | null;
  /** Every card it started with (card ids, sorted). */
  cards: string[];
}

export interface GameStats {
  v: 1;
  mode: 'ai' | 'hotseat' | 'campaign' | 'online' | 'ranked';
  seats: StatsSeat[];
  /** The winning seat (null: no winner). */
  winner: number | null;
  /** How it ended. */
  end: 'supernova' | 'concede' | 'other';
  rounds: number;
  /** Cards played: [seat, round, card id]. */
  plays: [number, number, string][];
}

/** Every card a player has, wherever it is (sorted card ids): at the start of a game, its deck. */
export function deckCards(p: PlayerState): string[] {
  const all = [...p.deck, ...p.hand, ...p.discard, ...p.tableau.flatMap((c) => [c, ...(c.fused ?? [])]), ...(p.lightspeed ? [p.lightspeed] : [])];
  return all.map((c) => c.defId).sort();
}

/** The starter deck these cards are, if they are exactly one. */
export function starterOf(cards: string[]): string | null {
  const key = [...cards].sort().join(',');
  return PRESET_DECKS.find((d) => [...d.cards].sort().join(',') === key)?.name ?? null;
}

/** The start of a game's summary, from its opening state. */
export function beginStats(state: GameState, mode: GameStats['mode']): GameStats {
  return {
    v: 1,
    mode,
    seats: state.players.map((p) => {
      const cards = deckCards(p);
      return { human: !p.isAI, starter: starterOf(cards), cards };
    }),
    winner: null,
    end: 'other',
    rounds: state.round,
    plays: [],
  };
}

/** Note a move: a card played is written down, with its seat and the round. */
export function noteMove(stats: GameStats, prev: GameState, next: GameState, action: Action) {
  if (action.type !== 'playCard') return;
  const seat = prev.activePlayerIndex;
  const card = prev.players[seat]?.hand.find((c) => c.uid === action.cardUid);
  if (card && cardDef(card.defId)) stats.plays.push([seat, prev.round, card.defId]);
  void next;
}

/** The game is over: who won, and how. */
export function finishStats(stats: GameStats, final: GameState): GameStats {
  const winner = final.players.findIndex((p) => p.id === final.winnerId);
  stats.winner = winner >= 0 ? winner : null;
  stats.end = final.concededBy ? 'concede' : winner >= 0 ? 'supernova' : 'other';
  stats.rounds = final.round;
  return stats;
}
