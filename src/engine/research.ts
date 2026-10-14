import type { BattleModifiers } from './types';

/**
 * Research: upgrades a faction's flagship carries for good (more energy a day, longer marches, stronger
 * hulls...). Where a hero's skills and gear are boons on their own card, research is for the whole ship.
 * Each research station on the map offers a few upgrades; the first flagship to use it picks one, free
 * (campaign.ts). (`cost` and `turns` are left from the old research tree.)
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
  /** A Lost Race's own: offered only in its rift's galaxy (rifts.ts), never anywhere else. */
  race?: number;
  /** An experiment (what research stations offer now): what it gives, and what it costs, in words. */
  boon?: string;
  bane?: string;
}

export const RESEARCH_BRANCHES = ['power', 'armour', 'command', 'navigation'] as const;

type P = Omit<ResearchProject, 'branch' | 'tier' | 'needs'>;
/** The tree: each branch in order, from the first project up. */
const BRANCHES: P[][] = [
  [
    { id: 'cool1', name: 'Cryo Reserves', text: 'Your sun starts every battle 1 cooler.', cost: 8, turns: 3, icon: 'cool', effect: { mods: { startingHeat: -1 } } },
    { id: 'energy1', name: 'Fusion Cells', text: '+1 energy every day of battle.', cost: 14, turns: 4, icon: 'energy', effect: { mods: { extraPlays: 1 } } },
    { id: 'energy2', name: 'Stellar Taps', text: '+2 energy every day of battle.', cost: 24, turns: 6, icon: 'energy', effect: { mods: { extraPlays: 2 } } },
  ],
  [
    { id: 'hull1', name: 'Dense Core', text: '+2 max health on your sun.', cost: 8, turns: 3, icon: 'hull', effect: { mods: { maxHealthDelta: 2 } } },
    { id: 'mend1', name: 'Field Cooling', text: 'Your sun cools 2 each jump.', cost: 8, turns: 3, icon: 'mend', effect: { mend: 2 } },
    { id: 'hull2', name: 'Stellar Plating', text: '+5 max health on your sun.', cost: 16, turns: 5, icon: 'hull', effect: { mods: { maxHealthDelta: 5 } } },
    { id: 'mend2', name: 'Nanite Swarms', text: 'Your sun cools 4 each jump.', cost: 16, turns: 5, icon: 'mend', effect: { mend: 4 } },
  ],
  [
    { id: 'loot1', name: 'Salvage Crews', text: 'More emblems after battles won.', cost: 6, turns: 2, icon: 'loot', effect: { loot: 0.25 } },
    { id: 'hand1', name: 'Battle Doctrine', text: '+1 card in your opening hand.', cost: 8, turns: 3, icon: 'draw', effect: { mods: { openingHand: 1 } } },
    { id: 'dread1', name: 'Terror Broadcasts', text: 'The weakest neutral systems surrender to your flagship without a battle.', cost: 12, turns: 4, icon: 'dread', effect: { dread: 1 } },
    { id: 'dread2', name: 'Shadow of Empire', text: 'Stronger neutral systems surrender too.', cost: 18, turns: 6, icon: 'dread', effect: { dread: 1 } },
  ],
  [
    { id: 'sight1', name: 'Deep Scanners', text: 'Your flagship sees one route further.', cost: 6, turns: 2, icon: 'sight', effect: { sight: 1 } },
    { id: 'march1', name: 'Jump Lanes', text: 'Your flagship may fly one route further each turn.', cost: 10, turns: 3, icon: 'march', effect: { march: 1 } },
    { id: 'march2', name: 'Fold Drives', text: 'And one route further again.', cost: 16, turns: 5, icon: 'march', effect: { march: 1 } },
  ],
];

/**
 * The Lost Races' own upgrades, offered only in their rift's galaxy [direction: exclusive Nyxari research upgrades]:
 * the Nyxari's, and the Seren's.
 */
const RACE_PROJECTS: ResearchProject[] = [
  { id: 'nyx_doctrine', race: 4, name: 'Night Doctrine', text: 'Your attackers can attack the day they come into play.', cost: 0, turns: 0, icon: 'energy', effect: { mods: { darkspeed: 1 } } },
  { id: 'nyx_veil', race: 4, name: 'Veil of Night', text: '+1 shield on your sun every day of battle.', cost: 0, turns: 0, icon: 'hull', effect: { mods: { shieldPerTurn: 1 } } },
  { id: 'nyx_eclipse', race: 4, name: 'Eclipse Core', text: 'Your sun starts every battle 3 cooler.', cost: 0, turns: 0, icon: 'cool', effect: { mods: { startingHeat: -3 } } },
  { id: 'ser_charts', race: 6, name: 'Star Charts', text: '+1 card every day of battle.', cost: 0, turns: 0, icon: 'draw', effect: { mods: { extraDraw: 1 } } },
  { id: 'ser_tides', race: 6, name: 'Tidecalling', text: 'The abundant planet draws 1 more and the industrial planet gives 1 more energy.', cost: 0, turns: 0, icon: 'energy', effect: { mods: { abundantDraw: 1, industrialPlays: 1 } } },
  { id: 'ser_stillness', race: 6, name: 'Stilled Hour', text: 'Your sun cools 1 every day of battle.', cost: 0, turns: 0, icon: 'cool', effect: { mods: { coolPerTurn: 1 } } },
].map((p) => ({ ...p, branch: 0 as const, tier: 1 as const }) as ResearchProject);

/**
 * Experiments: what research stations offer now [direction: research centres more experimental, what you get from
 * them a big, game changing upside with a massive downside, a decision on whether it is right for the player's
 * deck]. Each is both at once, for the rest of the run; a station offers three.
 */
type X = { id: string; name: string; icon: ResearchProject['icon']; boon: string; bane: string; effect: ResearchEffect };
const EXPERIMENT_LIST: X[] = [
  { id: 'x_reactor', name: 'Overclocked Reactor', icon: 'energy', boon: '+2 energy every day.', bane: 'Your sun heats 2 every day.', effect: { mods: { extraPlays: 2, heatPerTurn: 2 } } },
  { id: 'x_archive', name: 'Deep Archive', icon: 'draw', boon: '+2 cards every day.', bane: '−6 max health on your sun.', effect: { mods: { extraDraw: 2, maxHealthDelta: -6 } } },
  { id: 'x_cryo', name: 'Cryostasis Field', icon: 'cool', boon: 'Your sun cools 3 every day.', bane: 'No card drawn at dawn.', effect: { mods: { coolPerTurn: 3, extraDraw: -1 } } },
  { id: 'x_blitz', name: 'Blitz Doctrine', icon: 'march', boon: 'Your attackers can attack the day they come into play.', bane: 'Your sun starts every battle 6 hotter.', effect: { mods: { darkspeed: 1, startingHeat: 6 } } },
  { id: 'x_aegis', name: 'Aegis Lattice', icon: 'hull', boon: '+3 shields every day.', bane: '2 cards fewer in your opening hand.', effect: { mods: { shieldPerTurn: 3, openingHand: -2 } } },
  { id: 'x_bastion', name: 'Bastion Protocol', icon: 'mend', boon: 'Your Guards have +4 defence.', bane: 'Your sun heats 1 every day.', effect: { mods: { guardDefence: 4, heatPerTurn: 1 } } },
];
export const EXPERIMENTS: ResearchProject[] = EXPERIMENT_LIST.map((x) => ({ ...x, text: `${x.boon} ${x.bane}`, cost: 0, turns: 0, branch: 0, tier: 1 }));
export const isExperiment = (id: string) => EXPERIMENTS.some((x) => x.id === id);

export const RESEARCH: ResearchProject[] = [
  ...BRANCHES.flatMap((list, b) =>
    list.map((p, i) => ({ ...p, branch: b as ResearchProject['branch'], tier: (i + 1) as ResearchProject['tier'], ...(i ? { needs: list[i - 1].id } : {}) })),
  ),
  ...RACE_PROJECTS,
  ...EXPERIMENTS,
];

const BY_ID = new Map(RESEARCH.map((r) => [r.id, r]));
export const researchProject = (id: string) => BY_ID.get(id);

/** A faction's research: what is done, and what is under way. */
export interface ResearchState {
  done: string[];
  current?: { id: string; left: number };
}

/** Whether a faction's upgrade is outdone by a higher one of the same kind it also holds. */
export function supersededResearch(done: string[], id: string): boolean {
  const p = researchProject(id);
  // (Retired upgrades, kept by older saves, add up as they always did.)
  // (Experiments stand on their own: each adds its all, boon and bane.)
  return !!p && !RETIRED_RESEARCH.has(id) && p.race === undefined && !p.boon && done.some((o) => o !== id && researchProject(o)?.race === undefined && !researchProject(o)?.boon && researchProject(o)?.icon === p.icon && researchProject(o)!.tier > p.tier);
}

/** Everything a faction's research gives each of its armies. */
export function researchBonus(r: ResearchState | undefined) {
  const out = { mods: {} as BattleModifiers, march: 0, mend: 0, loot: 0, sight: 0, dread: 0 };
  // (Each upgrade states its total: of two of a kind, the higher stands in place of the lower, not on top of it.)
  for (const id of r?.done ?? []) {
    if (supersededResearch(r!.done, id)) continue;
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

/**
 * Projects no station offers any more: what they did is gone from the game (systems surrendering, extra moves on
 * the map, seeing further). A save that carries one keeps it, harmlessly.
 */
export const RETIRED_RESEARCH = new Set(['dread1', 'dread2', 'march1', 'march2', 'sight1']);
