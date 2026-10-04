import type { CardDef } from './types';

/**
 * Attuned cards: at each of their owner's dawns they also gain the bonus of where their Orbit stands
 * (attunement.ts): shields and cooling at the dead planet, cooling and cards at the abundant one, heat at
 * the industrial one. Their text names only their own effects; `{attune}` stands for the rest.
 */
export const ATTUNE_CARDS: CardDef[] = [
  { id: 'orrery', name: 'Orrery', kind: 'growth', text: '{sturdy:1}. {attune}.', attune: 1, defence: 1 },
  { id: 'ecliptic_lance', name: 'Ecliptic Lance', kind: 'attack', rarity: 'stellar', text: '{heat:2}. {attune}.', attune: 1, onPlay: [{ type: 'heat', amount: 2, to: 'target' }] },
  { id: 'solstice_choir', name: 'Solstice Choir', kind: 'attack', race: 0, text: 'Your {orbit:+1}. {attune}.', attune: 1, onPlay: [{ type: 'orbit', amount: 1, who: 'self' }] },
  { id: 'precession_engine', name: 'Precession Engine', kind: 'attack', race: 1, rarity: 'stellar', text: '{sturdy:2}. {attune:2}.', attune: 2, defence: 2 },
  { id: 'moon_warden', name: 'Moon Warden', kind: 'defence', race: 2, text: '{guard}. {sturdy:1}. {attune}.', attune: 1, defence: 1, passive: [{ type: 'taunt' }] },
  { id: 'seasonal_bloom', name: 'Seasonal Bloom', kind: 'growth', race: 3, text: '{plant:1}. {attune}.', attune: 1, onPlay: [{ type: 'plant', amount: 1 }] },
  {
    id: 'grand_orrery',
    name: 'Grand Orrery',
    kind: 'growth',
    rarity: 'anomaly',
    text: 'Your {orbit:+3}. {attune:2}.',
    attune: 2,
    onPlay: [{ type: 'orbit', amount: 3, who: 'self' }],
  },
];

export const ATTUNE_COSTS: Record<string, number> = { ecliptic_lance: 2, solstice_choir: 2, precession_engine: 3, moon_warden: 2, grand_orrery: 3 };
