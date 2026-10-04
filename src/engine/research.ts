import type { BattleModifiers } from './types';

/**
 * Research: what a faction learns once and every one of its armies shares (more energy a day, longer marches,
 * stronger hulls...). Where a hero's skills and gear are boons on their own card, research is for the whole
 * army. One project at a time: it is paid for in materials when it starts, and is done after so many turns.
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
  /** A project that must be done first. */
  needs?: string;
  icon: 'energy' | 'march' | 'sight' | 'mend' | 'hull' | 'draw' | 'loot' | 'cool' | 'dread';
  effect: ResearchEffect;
}

export const RESEARCH: ResearchProject[] = [
  { id: 'energy1', name: 'Fusion Cells', text: 'Your armies have +1 energy every day of battle.', cost: 14, turns: 4, icon: 'energy', effect: { mods: { extraPlays: 1 } } },
  { id: 'energy2', name: 'Stellar Taps', text: 'Another +1 energy every day of battle.', cost: 24, turns: 6, needs: 'energy1', icon: 'energy', effect: { mods: { extraPlays: 1 } } },
  { id: 'march1', name: 'Jump Lanes', text: 'Your armies may march one route further each turn.', cost: 8, turns: 3, icon: 'march', effect: { march: 1 } },
  { id: 'march2', name: 'Fold Drives', text: 'And one route further again.', cost: 16, turns: 5, needs: 'march1', icon: 'march', effect: { march: 1 } },
  { id: 'sight1', name: 'Deep Scanners', text: 'Your armies see one route further.', cost: 6, turns: 2, icon: 'sight', effect: { sight: 1 } },
  { id: 'mend1', name: 'Field Repair', text: 'Your armies repair 2 heat at the start of each turn.', cost: 6, turns: 2, icon: 'mend', effect: { mend: 2 } },
  { id: 'mend2', name: 'Nanite Swarms', text: 'They repair 2 more (4 in all).', cost: 12, turns: 4, needs: 'mend1', icon: 'mend', effect: { mend: 2 } },
  { id: 'hull1', name: 'Hardened Hulls', text: 'Your armies have +4 max health in battle.', cost: 8, turns: 3, icon: 'hull', effect: { mods: { maxHealthDelta: 4 } } },
  { id: 'hull2', name: 'Stellar Plating', text: 'And +6 more (+10 in all).', cost: 16, turns: 5, needs: 'hull1', icon: 'hull', effect: { mods: { maxHealthDelta: 6 } } },
  { id: 'hand1', name: 'Battle Doctrine', text: 'Your armies draw 1 more card in their opening hand.', cost: 8, turns: 3, icon: 'draw', effect: { mods: { openingHand: 1 } } },
  { id: 'cool1', name: 'Cryo Reserves', text: "Your armies' suns start each battle 2 cooler.", cost: 10, turns: 3, icon: 'cool', effect: { mods: { startingHeat: -2 } } },
  { id: 'loot1', name: 'Salvage Crews', text: 'Your armies are far likelier to find gear when they take a system.', cost: 6, turns: 2, icon: 'loot', effect: { loot: 0.25 } },
  { id: 'dread1', name: 'Terror Broadcasts', text: 'The weakest neutral systems surrender to your armies without a battle.', cost: 10, turns: 4, icon: 'dread', effect: { dread: 1 } },
  { id: 'dread2', name: 'Shadow of Empire', text: 'Stronger neutral systems surrender too.', cost: 18, turns: 6, needs: 'dread1', icon: 'dread', effect: { dread: 1 } },
];

const BY_ID = new Map(RESEARCH.map((r) => [r.id, r]));
export const researchProject = (id: string) => BY_ID.get(id);

/** A faction's research: what is done, and what is under way. */
export interface ResearchState {
  done: string[];
  current?: { id: string; left: number };
}

/** Why a faction can't start a project (null if it can). */
export function researchProblem(r: ResearchState | undefined, materials: number, id: string): string | null {
  const p = researchProject(id);
  if (!p) return 'No such project.';
  if (r?.done.includes(id)) return 'Already researched.';
  if (r?.current) return `Already researching ${researchProject(r.current.id)?.name ?? 'something'}.`;
  if (p.needs && !r?.done.includes(p.needs)) return `Research ${researchProject(p.needs)!.name} first.`;
  if (materials < p.cost) return `Not enough materials (need ${p.cost}, have ${materials}).`;
  return null;
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
