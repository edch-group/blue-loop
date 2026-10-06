import { describe, expect, it } from 'vitest';
import { cardDef, PRESET_DECKS } from '../src/engine/cards';
import { decodeDeck, encodeDeck } from '../src/engine/deckcode';

describe('deck codes', () => {
  it('carry a deck there and back: its name and every card', () => {
    for (const d of PRESET_DECKS) {
      const code = encodeDeck(d);
      expect(code).toMatch(/^BL1-[A-Za-z0-9_-]+$/);
      const back = decodeDeck(`  ${code}\n`)!;
      expect(back.name).toBe(d.name);
      expect([...back.cards].sort()).toEqual([...d.cards].sort());
      expect(back.unknown).toEqual([]);
    }
  });

  it('keep names with any letters, and leave out cards this game does not know', () => {
    const back = decodeDeck(encodeDeck({ name: 'Öl & Feuer ☀', cards: ['coronal_lance', 'coronal_lance', 'no_such_card'] }))!;
    expect(back.name).toBe('Öl & Feuer ☀');
    expect(back.cards).toEqual(['coronal_lance', 'coronal_lance']);
    expect(back.unknown).toEqual(['no_such_card']);
  });

  it('turn away anything that is not a deck code', () => {
    expect(decodeDeck('hello')).toBeNull();
    expect(decodeDeck('BL1-!!!')).toBeNull();
    expect(decodeDeck('BL1-' + btoa('{"n":"x"}'))).toBeNull();
  });
});

import { cleanAuthor, cleanDeckPost } from '../server/decks';

describe('community decks, as the server takes them in', () => {
  // A starter with one card changed: a deck of the player's own.
  const own = (() => {
    const cards = [...PRESET_DECKS[0].cards];
    const i = cards.findIndex((id) => cardDef(id).kind !== 'command');
    cards[i] = ['thermal_exchange', 'entropy_pulse'].find((id) => !cards.includes(id))!;
    return cards;
  })();

  it('take a legal deck, sorted, with a clean name, note and credit', () => {
    const got = cleanDeckPost({ name: '  My\u0007  deck  ', note: 'line one\nline two', author: 'Bo <script>', cards: own, extra: 'dropped' });
    expect('deck' in got && got.deck).toEqual({ name: 'My deck', note: 'line one line two', author: 'Bo script', cards: [...own].sort() });
  });

  it('turn away starter decks as they come, and profanity in names and notes', () => {
    expect(cleanDeckPost({ name: 'Mine', cards: PRESET_DECKS[0].cards })).toHaveProperty('error');
    expect(cleanDeckPost({ name: 'sh1t deck', cards: own })).toHaveProperty('error');
    expect(cleanDeckPost({ name: 'Fine', note: 'what the f u c k', cards: own })).toHaveProperty('error');
    expect(cleanAuthor('Fuckface')).toBe('Commander');
  });

  it('turn away illegal decks, unknown cards and nameless ones', () => {
    expect(cleanDeckPost({ name: 'x', cards: ['coronal_lance'] })).toHaveProperty('error');
    expect(cleanDeckPost({ name: 'x', cards: [...PRESET_DECKS[0].cards.slice(1), 'no_such_card'] })).toHaveProperty('error');
    expect(cleanDeckPost({ name: '   ', cards: PRESET_DECKS[0].cards })).toHaveProperty('error');
    expect(cleanAuthor('')).toBe('Commander');
  });
});
