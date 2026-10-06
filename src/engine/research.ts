import type { BattleModifiers } from './types';

/**
 * Research: upgrades a faction's flagship carries for good (more energy a day, longer marches, stronger
 * hulls...). Where a hero's skills and gear are boons on their own card, research is for the whole ship.
 * Each research station on the map has one upgrade, taken for Wisdom by the first flagship to use it
 * (campaign.ts). (`cost` and `turns` are left from the old research tree; a station's price is by tier.)
 */

/** What a finished project gives every army of its faction. */
export interface ResearchEffect {
  mods?: BattleModifiers;
  march?: number;
  mend?: number;
  loot?: number;
  sight?: number;
  dread?: number;
}

export interface ResearchProject {
  id: string;
  name: string;
  text: string;
  /** Materials, paid when it starts. */
  cost: number;
  /** Turns it takes. */
  turns: number;
  /** The tree's four branches: 0 Power, 1 Armour, 2 Command, 3 Navigation. */
  branch: 0 | 1 | 2 | 3;
  /** Its place up the branch (1 first): each needs the one before it. */
  tier: 1 | 2 | 3 | 4;
  /** The project that must be done first (the one before it in its branch). */
  needs?: string;
  icon: 'energy' | 'march' | 'sight' | 'mend' | 'hull' | 'draw' | 'loot' | 'cool' | 'dread';
  effect: ResearchEffect;
}

export const RESEARCH_BRANCHES = ['power', 'armour', 'command', 'navigation'] as const;

type P = Omit<ResearchProject, 'branch' | 'tier' | 'needs'>;
/** The tree: each branch in order, from the first project up. */
const BRANCHES: P[][] = [
  [
    { id: 'cool1', name: 'Cryo Reserves', text: "Your flagship's sun starts each battle 2 cooler.", cost: 8, turns: 3, icon: 'cool', effect: { mods: { startingHeat: -2 } } },
    { id: 'energy1', name: 'Fusion Cells', text: 'Your flagship has +1 energy every day of battle.', cost: 14, turns: 4, icon: 'energy', effect: { mods: { extraPlays: 1 } } },
    { id: 'energy2', name: 'Stellar Taps', text: 'Another +1 energy every day of battle.', cost: 24, turns: 6, icon: 'energy', effect: { mods: { extraPlays: 1 } } },
  ],
  [
    { id: 'hull1', name: 'Hardened Hulls', text: 'Your flagship has +4 max health in battle.', cost: 8, turns: 3, icon: 'hull', effect: { mods: { maxHealthDelta: 4 } } },
    { id: 'mend1', name: 'Field Repair', text: 'Your flagship repairs 2 heat at the start of each turn.', cost: 8, turns: 3, icon: 'mend', effect: { mend: 2 } },
    { id: 'hull2', name: 'Stellar Plating', text: 'Another +6 max health (+10 in all).', cost: 16, turns: 5, icon: 'hull', effect: { mods: { maxHealthDelta: 6 } } },
    { id: 'mend2', name: 'Nanite Swarms', text: 'Your flagship repairs 2 more heat a turn (4 in all).', cost: 16, turns: 5, icon: 'mend', effect: { mend: 2 } },
  ],
  [
    { id: 'loot1', name: 'Salvage Crews', text: 'Your flagship is far likelier to find gear when they take a system.', cost: 6, turns: 2, icon: 'loot', effect: { loot: 0.25 } },
    { id: 'hand1', name: 'Battle Doctrine', text: 'Your flagship draws 1 more card in their opening hand.', cost: 8, turns: 3, icon: 'draw', effect: { mods: { openingHand: 1 } } },
    { id: 'dread1', name: 'Terror Broadcasts', text: 'The weakest neutral systems surrender to your flagship without a battle.', cost: 12, turns: 4, icon: 'dread', effect: { dread: 1 } },
    { id: 'dread2', name: 'Shadow of Empire', text: 'Stronger neutral systems surrender too.', cost: 18, turns: 6, icon: 'dread', effect: { dread: 1 } },
  ],
  [
    { id: 'sight1', name: 'Deep Scanners', text: 'Your flagship sees one route further.', cost: 6, turns: 2, icon: 'sight', effect: { sight: 1 } },
    { id: 'march1', name: 'Jump Lanes', text: 'Your flagship may fly one route further each turn.', cost: 10, turns: 3, icon: 'march', effect: { march: 1 } },
    { id: 'march2', name: 'Fold Drives', text: 'And one route further again.', cost: 16, turns: 5, icon: 'march', effect: { march: 1 } },
  ],
];

export const RESEARCH: ResearchProject[] = BRANCHES.flatMap((list, b) =>
  list.map((p, i) => ({ ...p, branch: b as ResearchProject['branch'], tier: (i + 1) as ResearchProject['tier'], ...(i ? { needs: list[i - 1].id } : {}) })),
);

const BY_ID = new Map(RESEARCH.map((r) => [r.id, r]));
export const researchProject = (id: string) => BY_ID.get(id);

/** A faction's research: what is done, and what is under way. */
export interface ResearchState {
  done: string[];
  current?: { id: string; left: number };
}

/** Everything a faction's research gives each of its armies. */
export function researchBonus(r: ResearchState | undefined) {
  const out = { mods: {} as BattleModifiers, march: 0, mend: 0, loot: 0, sight: 0, dread: 0 };
  for (const id of r?.done ?? []) {
    const e = researchProject(id)?.effect;
    if (!e) continue;
    for (const [k, v] of Object.entries(e.mods ?? {}) as [keyof BattleModifiers, number][]) out.mods[k] = (out.mods[k] ?? 0) + v;
    out.march += e.march ?? 0;
    out.mend += e.mend ?? 0;
    out.loot += e.loot ?? 0;
    out.sight += e.sight ?? 0;
    out.dread += e.dread ?? 0;
  }
  return out;
}
