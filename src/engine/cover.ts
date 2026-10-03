import { cardDef } from './cards';
import { cardCost } from './game';
import { craftCost } from './progression';
import type { CardDef } from './types';

/** A deck's cover: its most expensive Command card (by energy, then rarity, then name), if it has one. */
export function coverCard(cards: string[]): CardDef | null {
  const heroes = [...new Set(cards)].map(cardDef).filter((c) => c.kind === 'command');
  heroes.sort((a, b) => cardCost(b.id) - cardCost(a.id) || craftCost(b.id) - craftCost(a.id) || a.name.localeCompare(b.name));
  return heroes[0] ?? null;
}
