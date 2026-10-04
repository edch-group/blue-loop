import { BALANCE } from './balance';
import type { Effect, Planet } from './types';

/**
 * Attunement: an attuned card gains, at each of its owner's dawns, the bonus of where their orbit stands.
 * A sun's orbit runs through nine positions, three facing each planet, one a day (orbit cards move it on or
 * back). Each planet has its own kind of bonus, and the bonus grows as the planet comes fully round to face
 * the sun: the dead planet shelters (shields, then cooling), the abundant one gives (cooling, then cards),
 * the industrial one burns (heat). So an attuned deck wants its Orbit on the right planet at the right
 * time, and its rival wants to knock it off (Gravity Wells, Tidal Brakes).
 */
export const ATTUNEMENT: { planet: Planet; text: string; effects: Effect[] }[] = [
  { planet: 'dead', text: '{shield:1}', effects: [{ type: 'shield', amount: 1 }] },
  { planet: 'dead', text: '{shield:1}, {cool:1}', effects: [{ type: 'shield', amount: 1 }, { type: 'cool', amount: 1 }] },
  { planet: 'dead', text: '{shield:2}, {cool:1}', effects: [{ type: 'shield', amount: 2 }, { type: 'cool', amount: 1 }] },
  { planet: 'abundant', text: '{cool:1}', effects: [{ type: 'cool', amount: 1 }] },
  { planet: 'abundant', text: 'Draw 1', effects: [{ type: 'draw', amount: 1 }] },
  { planet: 'abundant', text: 'Draw 1, {cool:1}', effects: [{ type: 'draw', amount: 1 }, { type: 'cool', amount: 1 }] },
  { planet: 'industrial', text: '{heat:1}', effects: [{ type: 'heat', amount: 1, to: 'target' }] },
  { planet: 'industrial', text: '{heat:1}', effects: [{ type: 'heat', amount: 1, to: 'target' }] },
  { planet: 'industrial', text: '{heat:2}, {shield:1}', effects: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'shield', amount: 1 }] },
];

/** The attunement position for an orbit (0–8); with its planets eaten (Orion), the dead planet's. */
export function attunePosition(orbit: number, eaten = false): number {
  const n = ATTUNEMENT.length;
  const pos = ((orbit % n) + n) % n;
  return eaten ? pos % BALANCE.orbitTurns : pos;
}

/** What an attuned card gains at an orbit position, `times` over (Attunement 2 doubles every number). */
export function attunedEffects(pos: number, times = 1): Effect[] {
  return ATTUNEMENT[pos].effects.map((e) => ('amount' in e && times !== 1 ? ({ ...e, amount: (e as { amount: number }).amount * times } as Effect) : e));
}
