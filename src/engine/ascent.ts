import type { CompanionId } from './companions';

/**
 * The Captain's and the companions' ascent [direction: hero and companion upgrades grouped into tiers, only so many
 * taken in each; capping a tier and passing its Astral Gate takes the character up a tier, with general buffs and an
 * extra energy on its cost, so a very powerful character may cost 4, 5, 6; energy reduction among the last upgrades,
 * a choice against upgrades that add a lot of power; a slight name and look change at each gate].
 *
 * Four tiers, each upgrade a skill point, at most TIER_PICKS taken in a tier; the Astral Gate between two tiers (a
 * point, once the tier below has its picks) opens the next, giving GATE's buffs and costing an energy more.
 */
export const TIERS = 4;
export const TIER_PICKS = 3;
/** What passing an Astral Gate gives: attack, stability levels (each +2), and energy on the cost. */
export const GATE = { attack: 1, stability: 1, cost: 1 } as const;

/** What an upgrade gives: attack, stability levels (+2 each), energy off the cost, an ability slot, or something learnt. */
export interface Gift {
  attack?: number;
  stability?: number;
  cheaper?: number;
  slot?: number;
  /** The Captain: an ability, a way of leading, a singularity. */
  ability?: string;
  lead?: string;
  sing?: string;
  /** A companion: a trait (companions.ts). */
  trait?: string;
}

export interface AscentNode {
  id: string;
  tier: number;
  /** What it is called on the tree (an ability's, lead's or trait's own name when it gives one). */
  name: string;
  give: Gift;
}

/** What a character's tree has taken: its upgrades, and the gates passed. */
export interface Ascent {
  nodes: string[];
  gates: number;
}

const n = (id: string, tier: number, name: string, give: Gift): AscentNode => ({ id, tier, name, give });
const atk = (tier: number, k: number) => n(`atk${tier}`, tier, `+${k} attack`, { attack: k });
const stab = (tier: number, levels: number) => n(`stab${tier}`, tier, `+${levels * 2} stability`, { stability: levels });
const cheaper = (tier: number) => n(`cheap${tier}`, tier, 'costs 1 less', { cheaper: 1 });

/** The Captain's tree (abilities, leads and singularities named by their own names in the UI). */
export const CAPTAIN_TREE: AscentNode[] = [
  atk(1, 1), stab(1, 1), n('patch', 1, 'patch up', { ability: 'patch' }), n('scout', 1, 'scout', { ability: 'scout' }), n('volley', 1, 'volley', { ability: 'volley' }),
  atk(2, 1), stab(2, 1), n('slot2', 2, '2 ability slots', { slot: 1 }), n('bulwark', 2, 'bulwark', { ability: 'bulwark' }), n('vent', 2, 'vent', { ability: 'vent' }), n('steady', 2, 'steady hand', { lead: 'steady' }), n('iron', 2, 'iron will', { lead: 'iron' }),
  n('slot3', 3, '3 ability slots', { slot: 1 }), n('strafe', 3, 'strafe', { ability: 'strafe' }), n('overdrive', 3, 'overdrive', { ability: 'overdrive' }), n('salvo', 3, 'opening salvo', { lead: 'salvo' }), n('stand', 3, 'last stand', { sing: 'stand' }), n('scrap', 3, 'scrap run', { sing: 'scrap' }), cheaper(3),
  atk(4, 2), stab(4, 2), n('rally', 4, 'rally', { ability: 'rally' }), n('mend', 4, 'mend', { ability: 'mend' }), n('gunnery', 4, 'gunnery drill', { lead: 'gunnery' }), cheaper(4),
];

/** Each companion's tree (traits named by their own names in the UI). */
export const COMPANION_TREES: Record<CompanionId, AscentNode[]> = {
  lancer: [
    atk(1, 1), stab(1, 1), n('charge', 1, 'charge', { trait: 'charge' }), n('halo', 1, 'halo', { trait: 'halo' }), n('plate', 1, 'gilded plate', { trait: 'plate' }),
    atk(2, 1), stab(2, 1), n('sunlance', 2, 'sun-lance', { trait: 'sunlance' }), n('edge', 2, 'radiant edge', { trait: 'radiant' }), n('second', 2, 'second wind', { trait: 'second' }),
    atk(3, 2), stab(3, 2), n('zeal', 3, 'zeal', { trait: 'zeal' }), n('solar', 3, 'solar charge', { trait: 'solar' }), cheaper(3),
    atk(4, 2), n('dawnbreak', 4, 'dawnbreak', { trait: 'dawnbreak' }), n('aegis', 4, 'aegis of dawn', { trait: 'aegis' }), n('volley', 4, 'lance volley', { trait: 'volley' }), cheaper(4),
  ],
  engineer: [
    atk(1, 1), stab(1, 1), n('coolant', 1, 'coolant flush', { trait: 'coolant' }), n('weld', 1, 'field weld', { trait: 'weld' }), n('kit', 1, 'patch kit', { trait: 'kit' }),
    atk(2, 1), stab(2, 1), n('barrier', 2, 'barrier', { trait: 'barrier' }), n('sink', 2, 'heat sink', { trait: 'sink' }), n('bulwark', 2, 'bulwark', { trait: 'bulwark' }),
    stab(3, 2), n('overclock', 3, 'overclock', { trait: 'overclock' }), n('reinforce', 3, 'reinforce', { trait: 'reinforce' }), n('deep', 3, 'deep coolant', { trait: 'deep' }), cheaper(3),
    atk(4, 2), n('fortress', 4, 'fortress', { trait: 'fortress' }), n('master', 4, 'master weld', { trait: 'master' }), n('array', 4, 'shield array', { trait: 'array' }), cheaper(4),
  ],
  defector: [
    atk(1, 1), stab(1, 1), n('edge', 1, 'shard edge', { trait: 'edge' }), n('swift', 1, 'swift', { trait: 'swift' }), n('splinter', 1, 'splinter', { trait: 'splinter' }),
    atk(2, 1), stab(2, 1), n('hunt', 2, 'hunt', { trait: 'hunt' }), n('prism', 2, 'prism guard', { trait: 'prism' }), n('cold', 2, 'cold light', { trait: 'cold' }),
    atk(3, 2), stab(3, 2), n('shatter', 3, 'shatterstorm', { trait: 'shatter' }), n('refract', 3, 'refraction', { trait: 'refract' }), cheaper(3),
    atk(4, 2), n('executioner', 4, 'executioner', { trait: 'executioner' }), n('crystal', 4, 'crystal aegis', { trait: 'crystal' }), n('nova', 4, 'shard nova', { trait: 'nova' }), cheaper(4),
  ],
};

/** The names a character takes at each tier (the first its own). */
export const CAPTAIN_TITLES = ['The Captain', 'The Star-Captain', 'The Astral Captain', 'The Sunforged Captain'];

export const plainAscent = (): Ascent => ({ nodes: [], gates: 0 });

/** The upgrades of a tree taken in a tier. */
export const tierPicks = (tree: AscentNode[], a: Ascent, tier: number) => tree.filter((x) => x.tier === tier && a.nodes.includes(x.id)).length;

/** Skill points an ascent took in all: one an upgrade, one a gate. */
export const ascentSpent = (tree: AscentNode[], a: Ascent) => a.nodes.filter((id) => tree.some((x) => x.id === id)).length + a.gates;

/** Why it can't be taken now (null if it can): a node's id, or 'gate'. */
export function ascentProblem(tree: AscentNode[], a: Ascent, what: string, points: number): string | null {
  if (what === 'gate') {
    if (a.gates >= TIERS - 1) return 'At the highest tier.';
    if (tierPicks(tree, a, a.gates + 1) < TIER_PICKS) return `Take ${TIER_PICKS} in this tier first.`;
  } else {
    const node = tree.find((x) => x.id === what);
    if (!node) return 'Unknown.';
    if (a.nodes.includes(what)) return 'Learnt.';
    if (node.tier > a.gates + 1) return 'Pass the Astral Gate below first.';
    if (tierPicks(tree, a, node.tier) >= TIER_PICKS) return `${TIER_PICKS} taken in this tier.`;
  }
  if (points < 1) return 'Needs a skill point.';
  return null;
}

/** Take it (a new ascent; unchanged if it can't be had). */
export function ascend(tree: AscentNode[], a: Ascent, what: string, points: number): Ascent {
  if (ascentProblem(tree, a, what, points)) return a;
  return what === 'gate' ? { ...a, gates: a.gates + 1 } : { ...a, nodes: [...a.nodes, what] };
}

/** What an ascent gives in all (its upgrades', and its gates'). */
export function ascentGifts(tree: AscentNode[], a: Ascent) {
  const got = tree.filter((x) => a.nodes.includes(x.id));
  const sum = (k: 'attack' | 'stability' | 'cheaper' | 'slot') => got.reduce((t, x) => t + (x.give[k] ?? 0), 0);
  return {
    attack: sum('attack'),
    stability: sum('stability'),
    cheaper: sum('cheaper'),
    slots: sum('slot'),
    abilities: got.flatMap((x) => (x.give.ability ? [x.give.ability] : [])),
    leads: got.flatMap((x) => (x.give.lead ? [x.give.lead] : [])),
    sings: got.flatMap((x) => (x.give.sing ? [x.give.sing] : [])),
    traits: got.flatMap((x) => (x.give.trait ? [x.give.trait] : [])),
  };
}
