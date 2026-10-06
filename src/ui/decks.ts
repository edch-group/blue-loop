import { deckProblems, ownsDeck, PRESET_DECKS, type DeckList } from '../engine';
import { profile } from './profile';
import { markDirty } from './account';

/** A deck the player can pick: one of the four race presets, or one they built. */
export interface SavedDeck extends DeckList {
  id: string;
  preset?: boolean;
}

const KEY = 'blue-loop:decks:v1';

export const PRESETS: SavedDeck[] = PRESET_DECKS.map((d, i) => ({ ...d, id: `preset-${i}`, preset: true }));

export function customDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedDeck[]) : [];
    return Array.isArray(list) ? list.filter((d) => d && Array.isArray(d.cards)) : [];
  } catch {
    return [];
  }
}

function store(decks: SavedDeck[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(decks));
    markDirty();
  } catch {
    // Storage unavailable: decks last for this session only.
  }
}

/** Every deck on offer: the presets first, then the player's own (legal ones, built from cards they own). */
export function allDecks(): SavedDeck[] {
  const have = profile().collection;
  return [...PRESETS, ...customDecks().filter((d) => deckProblems(d.cards).length === 0 && ownsDeck(have, d.cards))];
}

export function deckById(id: string | undefined): SavedDeck | undefined {
  return [...PRESETS, ...customDecks()].find((d) => d.id === id);
}

export function saveDeck(deck: SavedDeck) {
  const list = customDecks().filter((d) => d.id !== deck.id);
  store([...list, { ...deck, preset: undefined }]);
}

/** Whether the player hides the starter decks from their decks page (kept with their account). */
const HIDE_KEY = 'blue-loop:hide-starters';
export function startersHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}
export function setStartersHidden(on: boolean) {
  try {
    localStorage.setItem(HIDE_KEY, on ? '1' : '0');
    markDirty();
  } catch {
    // Storage unavailable: for this session only.
  }
}

export function deleteDeck(id: string) {
  store(customDecks().filter((d) => d.id !== id));
}

/** The copies a deck needs that the player doesn't own yet (a deck saved from a shared list is something to work towards). */
export function missingCopies(cards: string[]): { id: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const have = profile().collection;
  return [...counts].flatMap(([id, n]) => {
    const short = n - (have[id] ?? 0);
    return short > 0 ? [{ id, n: short }] : [];
  });
}

/** A deck of the player's own with these same cards, if they have one. */
export function deckWithCards(cards: string[]): SavedDeck | undefined {
  const key = [...cards].sort().join();
  return customDecks().find((d) => [...d.cards].sort().join() === key);
}
