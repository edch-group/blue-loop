import { deckProblems, PRESET_DECKS, type DeckList } from '../engine';

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
  } catch {
    // Storage unavailable: decks last for this session only.
  }
}

/** Every deck on offer: the presets first, then the player's own (legal ones only). */
export function allDecks(): SavedDeck[] {
  return [...PRESETS, ...customDecks().filter((d) => deckProblems(d.cards).length === 0)];
}

export function deckById(id: string | undefined): SavedDeck | undefined {
  return [...PRESETS, ...customDecks()].find((d) => d.id === id);
}

export function saveDeck(deck: SavedDeck) {
  const list = customDecks().filter((d) => d.id !== deck.id);
  store([...list, { ...deck, preset: undefined }]);
}

export function deleteDeck(id: string) {
  store(customDecks().filter((d) => d.id !== id));
}
