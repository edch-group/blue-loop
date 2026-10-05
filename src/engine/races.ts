/**
 * The races. Each has a bonus and a nerf that every one of its cards carries, wherever it is played (a
 * mixed deck's Aureline card still charges unarmoured), so the same kind of card reads differently by race.
 * The four newer races also split into sub-races, which their own buff cards and Heroes name.
 */

export const RACE_NAMES = ['Aureline', "Xel'Naru", 'Vorthane', 'Ixquor', 'Nyxari', 'Korrath', 'Seren', 'Pyrr'] as const;

export interface RaceTrait {
  /** The bonus and the nerf, as a player reads them. */
  bonus: string;
  nerf: string;
  /** Attack on its cards that have attack (never below 1). */
  attack?: number;
  /** Attack on its cards that have attack, while their owner's sun is overheated. */
  attackHot?: number;
  /** Stability on its cards that last (never below 1). */
  stability?: number;
  /** Defence on its cards in play (never below 0). */
  defence?: number;
  /** Sting on its cards in play. */
  sting?: number;
  /** Darkspeed: its cards come into play ready to act (not dimmed). */
  ambush?: boolean;
  /** When one of its cards leaves its owner's tableau, this much heat at their rival (at their sun, or a Guard). */
  shatter?: number;
  /** Its attuned cards attune this many more times. */
  attune?: number;
  /** Each attack by one of its cards heats its owner's sun this much. */
  attackSelfHeat?: number;
}

export const RACE_TRAITS: RaceTrait[] = [
  { bonus: 'Sun-lances: their attack cards have +1 attack.', nerf: 'Unarmoured: −1 defence.', attack: 1, defence: -1 },
  { bonus: 'Shatter: when one leaves your tableau, {heat:1} at your rival.', nerf: 'Brittle: −1 stability.', shatter: 1, stability: -1 },
  { bonus: 'Barbed: {sting:1}.', nerf: 'Slow tides: −1 attack (never below 1).', sting: 1, attack: -1 },
  { bonus: 'Regrowth: +1 stability.', nerf: 'Soft-bodied: −1 defence.', stability: 1, defence: -1 },
  { bonus: 'Darkspeed: their attackers and Heroes can attack or act the day they come into play.', nerf: 'Fleeting: −2 stability.', ambush: true, stability: -2 },
  { bonus: 'Forged: +2 defence.', nerf: 'Ponderous: −1 attack (never below 1).', defence: 2, attack: -1 },
  { bonus: 'Star-charted: they attune once more.', nerf: 'Frail: −1 stability.', attune: 1, stability: -1 },
  { bonus: 'Flare-born: +1 attack, and +2 while your sun is {overheated}.', nerf: 'Self-immolating: each of their attacks heats your own sun 1.', attack: 1, attackHot: 1, attackSelfHeat: 1 },
];

/** A race's trait (none for neutral cards). */
export function raceTrait(race: number | undefined): RaceTrait | undefined {
  return race === undefined ? undefined : RACE_TRAITS[race];
}

/** The sub-races of the newer races: an id (on cards, as `sub`), its race, its name and what it does. */
export const SUBRACES: Record<string, { race: number; name: string; theme: string }> = {
  veilwalker: { race: 4, name: 'Veilwalker', theme: 'Lightspeed traps that spring from the dark' },
  unmaker: { race: 4, name: 'Unmaker', theme: 'Removal: unmaking what the rival builds' },
  forgeborn: { race: 5, name: 'Forgeborn', theme: 'Fusion grafts, hammered onto each other' },
  bastionkin: { race: 5, name: 'Bastion-kin', theme: 'Guards and sturdy walls' },
  tidecaster: { race: 6, name: 'Tidecaster', theme: 'Moving the planets: orbit control' },
  seer: { race: 6, name: 'Seer', theme: 'Reading the stars: draw, recover and attunement' },
  flarekin: { race: 7, name: 'Flarekin', theme: 'Spending everything in one burst' },
  cinderborn: { race: 7, name: 'Cinderborn', theme: 'Running their own sun hot, and thriving on it' },
};

/** The sub-race's name, or its race's (or "neutral"). */
export function raceLabel(race: number | undefined, sub?: string): string {
  if (sub && SUBRACES[sub]) return SUBRACES[sub].name;
  return race === undefined ? 'neutral' : RACE_NAMES[race];
}
