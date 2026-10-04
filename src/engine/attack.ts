import type { CardDef } from './types';

/**
 * Attack ratings. A card in play with an attack above 0 may attack once on each of its owner's days (then it
 * is dimmed): the rival's sun, or one of their cards. Cards keep their dawn effects too, so a card's attack
 * is set against its dawn heat: the more heat it already deals every dawn, the less it attacks for.
 *
 * The rule, for attack cards that stay in play: its energy cost less its plain dawn heat, at least 1 and at
 * most 3 (a Helio Lancer, dawn heat 2 for 2 energy, attacks for 1; a Focusing Array, no dawn heat, for 2).
 * Defence and growth cards have no attack (Sting is how they fight back). Some cards are set by hand.
 */
export const ATTACK_OVERRIDES: Record<string, number> = {
  // Heroes who fight in person (their stability is their health: attacking a card that hits back costs it).
  ignition_protocol: 2,
  empress_solenne: 3,
  leviathan_thoross: 2,
};

/** Plain dawn heat: heat at the rival every dawn, with no condition and no scaling. */
function plainDawnHeat(def: CardDef): number {
  return (def.onTurn ?? []).reduce((n, e) => n + (e.type === 'heat' && e.to === 'target' && !e.if && !e.plus ? e.amount : 0), 0);
}

/** A card's attack by the rule (given its cost), unless it is set by hand. */
export function ruleAttack(def: CardDef, cost: number, staysInPlay: boolean): number {
  if (def.id in ATTACK_OVERRIDES) return ATTACK_OVERRIDES[def.id];
  if (def.kind !== 'attack' || !staysInPlay || def.token) return 0;
  return Math.max(1, Math.min(3, cost - plainDawnHeat(def)));
}
