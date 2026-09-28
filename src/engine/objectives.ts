import type { GlobalEffectId, PlayerState } from './types';
import { cardDef } from './cards';

export interface ObjectiveDef {
  id: string;
  name: string;
  text: string;
  /** Checked at the end of the player's turn. */
  isMet(player: PlayerState): boolean;
}

function allCards(p: PlayerState) {
  return [...p.deck, ...p.hand, ...p.inPlay, ...p.discard];
}

/**
 * Pool of objectives. A few are drawn each game. Every player can claim each
 * one once, and claiming one adds a Command Directive to their discard pile.
 */
export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'deep_freeze', name: 'Deep Freeze', text: 'End your turn with your sun at -5 or colder.', isMet: (p) => p.heat <= -5 },
  { id: 'firestorm', name: 'Firestorm', text: 'Deal 4 or more heat to enemy suns in one turn.', isMet: (p) => p.turn.heatDealt >= 4 },
  { id: 'collector', name: 'Collector', text: 'Own 5 or more cards bought from the display.', isMet: (p) => allCards(p).filter((c) => cardDef(c.defId).copies > 0).length >= 5 },
  { id: 'big_spender', name: 'Big Spender', text: 'Spend 10 or more money in one turn.', isMet: (p) => p.turn.moneySpent >= 10 },
  { id: 'brinkmanship', name: 'Brinkmanship', text: 'End your turn with your sun at 7 or hotter.', isMet: (p) => p.heat >= 7 },
  { id: 'industrialist', name: 'Industrialist', text: 'Reach 4 total planet levels.', isMet: (p) => p.planets.reduce((s, pl) => s + pl.level, 0) >= 4 },
  { id: 'shieldwall', name: 'Shieldwall', text: 'Block 3 or more heat with shields in one round.', isMet: (p) => p.blockedSinceTurnStart >= 3 },
];

const BY_ID = new Map(OBJECTIVES.map((o) => [o.id, o]));

export function objectiveDef(id: string): ObjectiveDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown objective: ${id}`);
  return def;
}

export interface GlobalDef {
  id: GlobalEffectId;
  name: string;
  text: string;
  /** Whether it also applies to the player who played it. */
  affectsCaster: boolean;
}

export const GLOBALS: Record<GlobalEffectId, GlobalDef> = {
  solarStorm: { id: 'solarStorm', name: 'Solar Storm', text: 'Enemy suns heat by 1 at the start of their turn.', affectsCaster: false },
  iceAge: { id: 'iceAge', name: 'Ice Age', text: 'Every sun cools by 1 at the start of its turn.', affectsCaster: true },
  tradeBoom: { id: 'tradeBoom', name: 'Trade Boom', text: 'Every player gains +1 money at the start of their turn.', affectsCaster: true },
  magneticStorm: { id: 'magneticStorm', name: 'Magnetic Storm', text: 'Enemy Solar Flares cost +1 money.', affectsCaster: false },
};
