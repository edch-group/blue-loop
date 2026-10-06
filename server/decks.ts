/** Community decks: lists players choose to share, as the server takes them in (see accounts.ts for the routes). */
import { cardDef, deckProblems, isProfane, PRESET_DECKS } from '../src/engine';

/** A deck name: no control characters or runs of spaces, at most 24 characters. */
export function cleanDeckName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

/** A deck's note (what it does, how to play it): one paragraph, at most 160 characters. */
export function cleanDeckNote(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** The credit: the name the player goes by in the game (the same letters a name may have there). */
export function cleanAuthor(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[^\p{L}\p{N} '’.-]/gu, '')
    .trim()
    .slice(0, 18);
  return name && !isProfane(name) ? name : 'Commander';
}

/**
 * A deck put up to share, checked: a real, legal deck of the game's own cards (ownership aside: a shared list
 * is something to work towards). Null and why if not.
 */
export function cleanDeckPost(raw: unknown): { deck: { name: string; note: string; author: string; cards: string[] } } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = cleanDeckName(r.name);
  if (!name) return { error: 'Give the deck a name.' };
  if (!Array.isArray(r.cards) || r.cards.length > 60) return { error: 'Bad deck.' };
  const cards = r.cards.map(String);
  for (const id of cards) {
    try {
      if (cardDef(id).token || id.startsWith('fuse:')) return { error: 'Bad deck.' };
    } catch {
      return { error: 'That deck has cards this game doesn’t know.' };
    }
  }
  const problems = deckProblems(cards);
  if (problems.length) return { error: problems[0] };
  // A starter deck is everyone's already: only decks players made their own are shared.
  const key = [...cards].sort().join();
  if (PRESET_DECKS.some((d) => [...d.cards].sort().join() === key)) return { error: 'That’s a starter deck. Change it to make it your own, then share it.' };
  if (isProfane(name)) return { error: 'Keep it clean: give the deck another name.' };
  const note = cleanDeckNote(r.note);
  if (isProfane(note)) return { error: 'Keep it clean: change the note.' };
  return { deck: { name, note, author: cleanAuthor(r.author), cards: [...cards].sort() } };
}
