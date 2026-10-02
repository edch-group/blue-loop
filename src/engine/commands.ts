import type { CardDef, Effect } from './types';

/** A Command card's dawn options, by id ("energy1", "draw1", "heat2", …): what each adds to its dawn. */
function commandOption(id: string): Effect[] {
  const m = /^([a-z]+)(\d+)$/.exec(id);
  if (!m) throw new Error(`Unknown Command option ${id}`);
  const n = Number(m[2]);
  switch (m[1]) {
    case 'energy': return [{ type: 'plays', amount: n }];
    case 'draw': return [{ type: 'draw', amount: n }];
    case 'heat': return [{ type: 'heat', amount: n, to: 'target' }];
    case 'cool': return [{ type: 'cool', amount: n }];
    case 'shield': return [{ type: 'shield', amount: n }];
    case 'renew': return [{ type: 'restore', amount: n, all: true }];
    case 'recover': return [{ type: 'recover', latest: true }];
    case 'orbit': return [{ type: 'orbit', amount: n, who: 'self' }];
  }
  throw new Error(`Unknown Command option ${id}`);
}

/**
 * A Command card's choice of dawn effect, made as it is played: +1 energy, draw 1, or the card's own
 * third option. The ids are how the choice is written into card text ({options:energy1|draw1|shield2}).
 */
export function commandChoices(...ids: string[]): NonNullable<CardDef['choices']> {
  return ids.map((id) => ({ id, onTurn: commandOption(id) }));
}
