import { BALANCE } from './balance';
import type { Effect, Planet } from './types';

/**
 * Attunement: an attuned card gains, at each of its owner's dawns, the bonus of where their orbit stands.
 * A sun's orbit runs through its positions, BALANCE.orbitTurns facing each planet, one a day (orbit cards move it on
 * or back). Each planet has one bonus of its own [direction: a single bonus per planet, for simplicity]: the dead
 * planet shelters (a shield), the abundant one gives (a card), the industrial one burns (heat). So an attuned deck
 * wants its Orbit on the right planet, and its rival wants to knock it off (Gravity Wells, Tidal Brakes).
 */
const PLANET_BONUS: Record<Planet, { text: string; effects: Effect[] }> = {
  dead: { text: '{shield:1}', effects: [{ type: 'shield', amount: 1 }] },
  abundant: { text: 'Draw 1', effects: [{ type: 'draw', amount: 1 }] },
  industrial: { text: '{heat:1}', effects: [{ type: 'heat', amount: 1, to: 'target' }] },
};
/** Each orbit position's bonus: the planet facing the sun's own, the same all the while it faces it. */
export const ATTUNEMENT: { planet: Planet; text: string; effects: Effect[] }[] = (['dead', 'abundant', 'industrial'] as Planet[])
  .flatMap((planet) => Array.from({ length: BALANCE.orbitTurns }, () => planet))
  .map((planet) => ({ planet, ...PLANET_BONUS[planet] }));
/** A planet's attunement bonus, as card text. */
export const planetBonusText = (planet: Planet) => PLANET_BONUS[planet].text;

/** The attunement position for an orbit; with its planets eaten (Orion), the dead planet's. */
export function attunePosition(orbit: number, eaten = false): number {
  const n = ATTUNEMENT.length;
  const pos = ((orbit % n) + n) % n;
  return eaten ? pos % BALANCE.orbitTurns : pos;
}

/** What an attuned card gains at an orbit position, `times` over (Attunement 2 doubles every number). */
export function attunedEffects(pos: number, times = 1): Effect[] {
  return ATTUNEMENT[pos].effects.map((e) => ('amount' in e && times !== 1 ? ({ ...e, amount: (e as { amount: number }).amount * times } as Effect) : e));
}
