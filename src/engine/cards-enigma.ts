import type { CardDef } from './types';

/**
 * Enigmas [direction: a god tier above Anomaly, campaign only, ABSOLUTELY BROKEN: not always dear to play, but each
 * bends the game with a mechanic nothing else has]. They are never in the pool (no deck builder, shop, starter or
 * rival has them): a campaign run finds one, rarely, deep in the galaxies (campaign.ts enigmaChance). Neutral, so
 * every race can carry them. A deck may hold one of each.
 */
export const ENIGMA_CARDS: CardDef[] = [
  {
    id: 'enigma_second_dawn',
    name: 'The Second Dawn',
    kind: 'growth',
    rarity: 'enigma',
    cost: 4,
    attack: 0,
    health: 7,
    text: 'When your day ends, you take another (once a round).',
    passive: [{ type: 'secondDawn' }],
  },
  {
    id: 'enigma_mirror_of_ends',
    name: 'Mirror of Ends',
    kind: 'growth',
    rarity: 'enigma',
    cost: 2,
    attack: 0,
    text: "Swap your sun's heat with your rival's.",
    onPlay: [{ type: 'swapSuns' }],
  },
  {
    id: 'enigma_unburning',
    name: 'The Unburning',
    kind: 'defence',
    rarity: 'enigma',
    cost: 3,
    attack: 0,
    health: 8,
    defence: 2,
    text: "{sturdy:2}. Your sun can't go supernova while this stands.",
    passive: [{ type: 'unburning' }],
  },
  {
    id: 'enigma_singularity_seed',
    name: 'Singularity Seed',
    kind: 'attack',
    rarity: 'enigma',
    cost: 1,
    attack: 1,
    health: 4,
    text: '{dawn}: its attack doubles.',
    onTurn: [{ type: 'doubleAttack' }],
  },
  {
    id: 'enigma_usurpers_crown',
    name: "Usurper's Crown",
    kind: 'growth',
    rarity: 'enigma',
    cost: 3,
    attack: 0,
    text: 'Take a rival card: it serves you, ready to act.',
    onPlay: [{ type: 'steal' }],
  },
  {
    id: 'enigma_stopped_clock',
    name: 'The Stopped Clock',
    kind: 'growth',
    rarity: 'enigma',
    cost: 3,
    attack: 0,
    text: "Your rival's next day never comes.",
    onPlay: [{ type: 'skipDay' }],
  },
  {
    id: 'enigma_zero_point',
    name: 'Zero-Point Core',
    kind: 'growth',
    rarity: 'enigma',
    cost: 4,
    attack: 0,
    health: 6,
    text: 'Your other cards cost 0.',
    passive: [{ type: 'freeCards' }],
  },
  {
    id: 'enigma_null_edict',
    name: 'Null Edict',
    kind: 'defence',
    rarity: 'enigma',
    cost: 2,
    attack: 0,
    health: 6,
    text: "Rival cards' {dawn} and {dusk} effects never happen.",
    passive: [{ type: 'silence' }],
  },
];

export const ENIGMA_IDS = new Set(ENIGMA_CARDS.map((c) => c.id));
export const isEnigma = (defId: string) => ENIGMA_IDS.has(defId);
