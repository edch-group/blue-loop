import { CARDS } from './cards';

/**
 * Deck codes: a deck as a line of text a player can copy and send, and another can paste into their deck
 * builder. "BL1-" then the deck (its name, and each card with how many copies) as URL-safe base64 of JSON.
 * Card ids, not positions in a list, so a code keeps working as cards are added to the game.
 */
const PREFIX = 'BL1-';
/** Cards a deck may be built from (not tokens, boons or fused cards). */
const PLAYABLE = new Set(CARDS.map((c) => c.id));

export function encodeDeck(deck: { name: string; cards: string[] }): string {
  const counts = new Map<string, number>();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const json = JSON.stringify({ n: deck.name.slice(0, 24), c: [...counts].map(([id, k]) => (k === 1 ? id : `${id}*${k}`)) });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A deck code read back: its name and cards, and any card ids this game doesn't know (left out). Null if it
 * isn't a deck code at all. Whether the deck is legal, or owned, is for the caller to say.
 */
export function decodeDeck(code: string): { name: string; cards: string[]; unknown: string[] } | null {
  const text = code.trim().replace(/\s+/g, '');
  if (!text.startsWith(PREFIX)) return null;
  try {
    const b64 = text.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    const raw = JSON.parse(json) as { n?: unknown; c?: unknown };
    if (!Array.isArray(raw.c)) return null;
    const cards: string[] = [];
    const unknown: string[] = [];
    for (const entry of raw.c.slice(0, 200)) {
      if (typeof entry !== 'string') continue;
      const [id, times] = entry.split('*');
      const n = Math.max(1, Math.min(4, Number(times ?? 1) || 1));
      if (!PLAYABLE.has(id)) {
        unknown.push(id.slice(0, 40));
        continue;
      }
      for (let k = 0; k < n; k++) cards.push(id);
    }
    const name = typeof raw.n === 'string' ? raw.n.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) : '';
    return { name: name || 'Imported deck', cards, unknown };
  } catch {
    return null;
  }
}
