/**
 * The races. Some carry a trait: an existing keyword written onto each of their cards, wherever it is played
 * (Vorthane and Pyrr Sting, Nyxari Darkspeed, Korrath Sturdy, Seren an extra Attune). Never a hidden change to a
 * card's numbers, and no nerfs: Aureline, Xel'Naru and Ixquor have none, as their own mechanics (Forge, Overheat,
 * Growth) are their identity. The four newer races also split into sub-races, which their own cards and Heroes name.
 */


export const RACE_NAMES = ['Aureline', "Xel'Naru", 'Vorthane', 'Ixquor', 'Nyxari', 'Korrath', 'Seren', 'Pyrr'] as const;

/** Which of its cards a trait's keyword goes on: those that stay in play, those with Darkspeed, those that attune. */
export type TraitReach = 'stays' | 'darkspeed' | 'attune';

export interface RaceTrait {
  /** The keyword it gives, as a player reads it ("Name: what it does."). */
  bonus: string;
  bonusOn: TraitReach;
  /** Sturdy on its cards that stay in play (not Fusion cards, whose Sturdy goes to their host), written into their own Sturdy. */
  sturdy?: number;
  /** Sting on its cards that stay in play, written into their own Sting. */
  sting?: number;
  /** Darkspeed: its attackers and Heroes come into play ready to act (not dimmed). */
  ambush?: boolean;
  /** Its attuned cards attune this many more times. */
  attune?: number;
}

/** By race: a trait, or none (undefined). */
export const RACE_TRAITS: (RaceTrait | undefined)[] = [
  undefined,
  undefined,
  { bonus: 'Sting: +1 Sting on their cards that stay in play.', bonusOn: 'stays', sting: 1 },
  undefined,
  { bonus: 'Darkspeed: their attackers and Heroes can attack or act the day they come into play.', bonusOn: 'darkspeed', ambush: true },
  { bonus: 'Sturdy: +2 Sturdy on their cards that stay in play.', bonusOn: 'stays', sturdy: 2 },
  { bonus: 'Star-charted: they attune once more.', bonusOn: 'attune', attune: 1 },
  { bonus: 'Sting: +1 Sting on their cards that stay in play.', bonusOn: 'stays', sting: 1 },
];

/** A race's trait (none for neutral cards). */
export function raceTrait(race: number | undefined): RaceTrait | undefined {
  return race === undefined ? undefined : RACE_TRAITS[race];
}

/** The sub-races of the newer races: an id (on cards, as `sub`), its race, its name and what it does. */
export const SUBRACES: Record<string, { race: number; name: string; theme: string }> = {
  veilwalker: { race: 4, name: 'Veilwalker', theme: 'Lightspeed traps that spring from the dark' },
  unmaker: { race: 4, name: 'Unmaker', theme: 'Removal: unmaking what the rival builds' },
  bloodcult: { race: 4, name: 'Blood Cult', theme: 'Consuming their own: cards given up to fuel others, and cards that pay off as they leave play' },
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
