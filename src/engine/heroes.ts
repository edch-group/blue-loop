/**
 * Campaign heroes: the generals who lead armies grow with them. Each hero gains experience by winning
 * battles, and with each level a point to spend on their own skill tree; and each can carry a weapon and
 * armour shaped to their race (the many-tentacled Vorthane wear a helm and a ring on every arm). Gear is
 * found when an army takes a system. Skills and gear alike are boons on the hero's own card (boons.ts):
 * abilities it carries while it is in play. What a whole faction's armies share is research (research.ts).
 */
import { boon } from './boons';
import { cardDef } from './cards';
import { plainText } from './keywords';
import type { BattleSkill } from './types';

/** Kinds of gear slot. Every hero has a weapon; the rest are their race's. */
export type SlotKind = 'weapon' | 'helm' | 'mantle' | 'sigil' | 'core' | 'facet' | 'ring' | 'carapace' | 'gland';

/** Each race's gear slots (ids, in order), after the weapon. */
export const RACE_SLOTS: { id: string; kind: SlotKind }[][] = [
  // Aureline: radiant figures in crowns and mantles of light.
  [{ id: 'weapon', kind: 'weapon' }, { id: 'helm', kind: 'helm' }, { id: 'mantle', kind: 'mantle' }, { id: 'sigil', kind: 'sigil' }],
  // Xel'Naru: minds of living crystal, a core and its facets.
  [{ id: 'weapon', kind: 'weapon' }, { id: 'core', kind: 'core' }, { id: 'facet1', kind: 'facet' }, { id: 'facet2', kind: 'facet' }],
  // Vorthane: a helm, and a ring on each of many tentacles.
  [{ id: 'weapon', kind: 'weapon' }, { id: 'helm', kind: 'helm' }, { id: 'ring1', kind: 'ring' }, { id: 'ring2', kind: 'ring' }, { id: 'ring3', kind: 'ring' }, { id: 'ring4', kind: 'ring' }],
  // Ixquor: a hive's carapace, and glands that seep spores.
  [{ id: 'weapon', kind: 'weapon' }, { id: 'carapace', kind: 'carapace' }, { id: 'gland1', kind: 'gland' }, { id: 'gland2', kind: 'gland' }],
];

export const SLOT_NAME: Record<SlotKind, string> = { weapon: 'Weapon', helm: 'Helm', mantle: 'Mantle', sigil: 'Sigil', core: 'Core', facet: 'Facet', ring: 'Ring', carapace: 'Carapace', gland: 'Gland' };

export type ItemRarity = 'dwarf' | 'stellar' | 'anomaly';

/** A piece of gear: the boons it gives its hero's card while it is in play. */
export interface Item {
  id: string;
  name: string;
  slot: SlotKind;
  rarity: ItemRarity;
  /** Boons on the hero's card (older saves: worked out from the slot and rarity). */
  boons?: string[];
  text: string;
}

/** Which icon a skill shows (the kind of thing it does). */
export type SkillIcon = 'heat' | 'shield' | 'ward' | 'cool' | 'draw' | 'energy' | 'plant' | 'start';

/** What a skill does: boons on the hero's card, or (Herald) the hero starting every battle in play. */
export type SkillEffect = { kind: 'boon'; boons: string[] } | { kind: 'start' };

export interface HeroSkill {
  id: string;
  name: string;
  text: string;
  /** The tree's three branches: 0 Might (the card's attack), 1 Ward (its defence), 2 Legacy (the race's way). */
  branch: 0 | 1 | 2;
  /** 1–6, from the hero up: each needs the one before it in its branch. Deeper tiers cost more (SKILL_COST). */
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  icon: SkillIcon;
  effect: SkillEffect;
}

/** A hero's progress (kept by their faction, even while they lead no army). */
export interface HeroState {
  xp: number;
  skills: string[];
  /** Equipped gear, by slot id. */
  gear: Record<string, Item>;
}

/**
 * Experience needed for each level (level 1 at 0): 21 levels, each a little further than the last. Each level
 * after the first gives a skill point: 20 in all, fewer than the tree costs, so every hero is a choice.
 */
export const XP_LEVELS = Array.from({ length: 21 }, (_, i) => i * 9 + i * i);
/** Skill points a skill costs, by tier: the deep skills, and above all the capstones, cost more. */
export const SKILL_COST = [0, 1, 1, 1, 2, 2, 3] as const;
export const skillCost = (k: HeroSkill) => SKILL_COST[k.tier];
export const HEROES = {
  /** Experience from a battle won, attacking or defending; and from one lost. */
  winXp: 20,
  defendXp: 16,
  lossXp: 6,
  /** Chance an army finds gear when it takes a system (research can add to it). */
  itemChance: 0.35,
} as const;

export const heroLevel = (xp: number) => XP_LEVELS.filter((x) => xp >= x).length;
export const nextLevelXp = (xp: number) => XP_LEVELS.find((x) => x > xp) ?? null;

type B = string;
/** A tier of a branch: its name, its words, and its boons. */
type Tier = [string, string, B[]];
const ICON_OF: Record<string, SkillIcon> = { heat: 'heat', pierce: 'heat', playheat: 'heat', shield: 'shield', playshield: 'shield', tidewall: 'shield', guard: 'shield', sturdy: 'ward', bulwark: 'ward', stability: 'ward', repair: 'ward', cool: 'cool', playcool: 'cool', draw: 'draw', playdraw: 'draw', energy: 'energy', plant: 'plant' };
const iconOf = (boons: B[]): SkillIcon => ICON_OF[boons[0]?.split('_')[1] ?? ''] ?? 'ward';

/** Each race's Might, Ward and Legacy branches, tiers 1–5 (the capstones are each hero's own). */
const RACE_TREES: { might: Tier[]; ward: Tier[]; legacy: Tier[] }[] = [
  // Aureline: the light, carried home.
  {
    might: [['Sunstrike', 'Dawn: heat 1.', [boon('heat', 1)]], ['Radiant Entry', 'As it is played: heat 2. +1 stability.', [boon('playheat', 2), boon('stability', 1)]], ['Searing Light', 'Dawn: heat 1 more.', [boon('heat', 1)]], ['Lance of Dawn', 'Dawn: heat 1, piercing.', [boon('pierce', 1)]], ['Blaze', 'As it is played: heat 3.', [boon('playheat', 3)]]],
    ward: [['Gilded Plate', 'Sturdy 1.', [boon('sturdy', 1)]], ['Solar Ward', 'Dawn: 1 shield.', [boon('shield', 1)]], ['Steadfast', '+2 stability.', [boon('stability', 2)]], ['Bulwark of Dawn', 'Bulwark 1: the cards beside it +1 defence.', [boon('bulwark', 1)]], ['Mending Light', 'Sturdy 1, and dawn: repair 1.', [boon('repair', 1), boon('sturdy', 1)]]],
    legacy: [["Herald's Shield", 'As it is played: 2 shields.', [boon('playshield', 2)]], ['Dawn Breeze', 'Dawn: cool 1.', [boon('cool', 1)]], ['Halo', 'Dawn: 1 shield.', [boon('shield', 1)]], ['Insight', 'Dawn: draw 1.', [boon('draw', 1)]], ['Second Sunrise', 'Dawn: +1 energy.', [boon('energy', 1)]]],
  },
  // Xel'Naru: minds of crystal, remembering everything.
  {
    might: [['Shard Spit', 'Dawn: heat 1.', [boon('heat', 1)]], ['Crystal Burst', 'As it is played: heat 2. +1 stability.', [boon('playheat', 2), boon('stability', 1)]], ['Refraction', 'Dawn: heat 1 more.', [boon('heat', 1)]], ['Splinter', 'Dawn: heat 1, piercing.', [boon('pierce', 1)]], ['Overload', 'As it is played: heat 3.', [boon('playheat', 3)]]],
    ward: [['Facet Armour', 'Sturdy 1.', [boon('sturdy', 1)]], ['Prism Screen', 'Dawn: 1 shield.', [boon('shield', 1)]], ['Lattice', '+2 stability.', [boon('stability', 2)]], ['Resonant Wall', 'Bulwark 1: the cards beside it +1 defence.', [boon('bulwark', 1)]], ['Regrowth', 'Sturdy 1, and dawn: repair 1.', [boon('repair', 1), boon('sturdy', 1)]]],
    legacy: [['Recollection', 'As it is played: draw 1.', [boon('playdraw', 1)]], ['Cold Logic', 'Dawn: cool 1.', [boon('cool', 1)]], ['Memory Spike', 'Dawn: heat 1.', [boon('heat', 1)]], ['Archive', 'Dawn: draw 1.', [boon('draw', 1)]], ['Overclock', 'Dawn: +1 energy.', [boon('energy', 1)]]],
  },
  // Vorthane: the weight of the deep.
  {
    might: [['Brine Lash', 'Dawn: heat 1.', [boon('heat', 1)]], ['Breaching', 'As it is played: heat 2. +1 stability.', [boon('playheat', 2), boon('stability', 1)]], ['Undertow', 'Dawn: heat 1 more.', [boon('heat', 1)]], ['Pressure Spike', 'Dawn: heat 1, piercing.', [boon('pierce', 1)]], ['Tidal Surge', 'As it is played: heat 3.', [boon('playheat', 3)]]],
    ward: [['Brine Skin', 'Sturdy 1.', [boon('sturdy', 1)]], ['Bell Song', 'Dawn: 1 shield.', [boon('shield', 1)]], ['Coral Heart', '+2 stability.', [boon('stability', 2)]], ['Reef Wall', 'Bulwark 1: the cards beside it +1 defence.', [boon('bulwark', 1)]], ['Brine Healing', 'Sturdy 1, and dawn: repair 1.', [boon('repair', 1), boon('sturdy', 1)]]],
    legacy: [['Swell', 'As it is played: 3 shields.', [boon('playshield', 3)]], ['Current', 'Dawn: 1 shield.', [boon('shield', 1)]], ['Tidewall', 'Tidewall: your shields guard your cards too.', [boon('tidewall')]], ['Reef Tending', 'Dawn: repair 1.', [boon('repair', 1)]], ["Tidecaller's Rhythm", 'Dawn: +1 energy.', [boon('energy', 1)]]],
  },
  // Ixquor: the hive that does not stop.
  {
    might: [['Barb', 'Dawn: heat 1.', [boon('heat', 1)]], ['Spore Burst', 'As it is played: heat 2. +1 stability.', [boon('playheat', 2), boon('stability', 1)]], ['Venom', 'Dawn: heat 1 more.', [boon('heat', 1)]], ['Acid', 'Dawn: heat 1, piercing.', [boon('pierce', 1)]], ['Swarm Strike', 'As it is played: heat 3.', [boon('playheat', 3)]]],
    ward: [['Chitin', 'Sturdy 1.', [boon('sturdy', 1)]], ['Spore Veil', 'Dawn: 1 shield.', [boon('shield', 1)]], ['Rooted', '+2 stability.', [boon('stability', 2)]], ['Hive Wall', 'Bulwark 1: the cards beside it +1 defence.', [boon('bulwark', 1)]], ['Sap Mending', 'Sturdy 1, and dawn: repair 1.', [boon('repair', 1), boon('sturdy', 1)]]],
    legacy: [['Seedling', 'As it is played: plant a Sapling.', [boon('plant', 1)]], ['Damp Earth', 'Dawn: cool 1.', [boon('cool', 1)]], ['Sprouting', 'As it is played: plant another Sapling.', [boon('plant', 1)]], ['Brood Sense', 'Dawn: draw 1.', [boon('draw', 1)]], ['Hive Surge', 'Dawn: +1 energy.', [boon('energy', 1)]]],
  },
];

/** Each hero's two capstones (Might and Ward): the upgrades that change how their battles go. */
const CAPSTONES: Record<string, [Tier, Tier]> = {
  command_directive: [['Solar Judgement', 'Dawn: heat 3.', [boon('heat', 3)]], ['Eternal Dawn', 'Dawn: 4 shields. Tidewall: your shields guard your cards too.', [boon('shield', 4), boon('tidewall')]]],
  ignition_protocol: [['Nova Lance', 'Dawn: heat 3, piercing.', [boon('pierce', 3)]], ['Blazing Aegis', 'Sturdy 3, and dawn: 2 shields.', [boon('sturdy', 3), boon('shield', 2)]]],
  empress_solenne: [['Sunfall', 'Dawn: heat 2 and +1 energy.', [boon('heat', 2), boon('energy', 1)]], ['Crown of Vitalia', '+4 stability, and dawn: cool 2.', [boon('stability', 4), boon('cool', 2)]]],
  war_council: [['Shatter Volley', 'Dawn: heat 2. As it is played: heat 4.', [boon('heat', 2), boon('playheat', 4)]], ['Archive Mind', 'Sturdy 2, and dawn: draw 1.', [boon('draw', 1), boon('sturdy', 2)]]],
  coolant_protocol: [['Heat Death', 'Dawn: heat 2, piercing, and cool 1.', [boon('pierce', 2), boon('cool', 1)]], ['Absolute Zero', 'Dawn: cool 3 and 2 shields.', [boon('cool', 3), boon('shield', 2)]]],
  the_shardmind: [['Singularity', 'Dawn: +2 energy.', [boon('energy', 2)]], ['Prism Lattice', 'Bulwark 2 and Sturdy 2.', [boon('bulwark', 2), boon('sturdy', 2)]]],
  tide_regent: [['Riptide', 'Dawn: heat 2 and 2 shields.', [boon('heat', 2), boon('shield', 2)]], ['Endless Tide', 'Dawn: 5 shields. Tidewall.', [boon('shield', 5), boon('tidewall')]]],
  the_admiralty: [['Armada', 'Dawn: heat 3, piercing. As it is played: heat 2.', [boon('pierce', 3), boon('playheat', 2)]], ['Fleet Bulwark', 'A Guard, with Bulwark 2.', [boon('guard'), boon('bulwark', 2)]]],
  leviathan_thoross: [['Crushing Depths', 'Dawn: heat 4.', [boon('heat', 4)]], ['Leviathan Hide', 'Sturdy 4 and +4 stability.', [boon('sturdy', 4), boon('stability', 4)]]],
  logistics_command: [['Plague Bloom', 'Dawn: heat 2. As it is played: plant 2 Saplings.', [boon('heat', 2), boon('plant', 2)]], ['Hive Shell', 'Sturdy 2, and dawn: repair 2.', [boon('sturdy', 2), boon('repair', 2)]]],
  chamber_protocol: [['Brood Frenzy', 'Dawn: +1 energy and draw 1.', [boon('energy', 1), boon('draw', 1)]], ['Brood Mother', '+3 stability. As it is played: plant 3 Saplings.', [boon('plant', 3), boon('stability', 3)]]],
  the_worldroot: [['Worldbloom', 'Dawn: heat 3 and cool 1.', [boon('heat', 3), boon('cool', 1)]], ['World Tree', 'Sturdy 2, and dawn: cool 3.', [boon('cool', 3), boon('sturdy', 2)]]],
};

/** The heroes of each race (to find a hero's race without the card pool). */
const RACE_OF: Record<string, number> = {
  command_directive: 0, ignition_protocol: 0, empress_solenne: 0,
  war_council: 1, coolant_protocol: 1, the_shardmind: 1,
  tide_regent: 2, the_admiralty: 2, leviathan_thoross: 2,
  logistics_command: 3, chamber_protocol: 3, the_worldroot: 3,
};

const s = (id: string, branch: 0 | 1 | 2, tier: HeroSkill['tier'], [name, text, boons]: Tier): HeroSkill => ({ id, name, text, branch, tier, icon: iconOf(boons), effect: { kind: 'boon', boons } });

/** A hero's whole tree: three branches of six, from the hero up to a capstone. */
function buildTree(hero: string): HeroSkill[] {
  const r = RACE_TREES[RACE_OF[hero] ?? 0];
  const [might6, ward6] = CAPSTONES[hero];
  return [
    ...r.might.map((t, i) => s(`might${i + 1}`, 0, (i + 1) as HeroSkill['tier'], t)),
    s('might6', 0, 6, might6),
    ...r.ward.map((t, i) => s(`ward${i + 1}`, 1, (i + 1) as HeroSkill['tier'], t)),
    s('ward6', 1, 6, ward6),
    ...r.legacy.map((t, i) => s(`legacy${i + 1}`, 2, (i + 1) as HeroSkill['tier'], t)),
    { id: 'legacy6', name: 'Herald', text: 'The hero starts every battle in play, already leading from your Hero slot.', branch: 2, tier: 6, icon: 'start', effect: { kind: 'start' } },
  ];
}

/** Each hero's own tree. */
export const SKILL_TREES: Record<string, HeroSkill[]> = Object.fromEntries(Object.keys(RACE_OF).map((h) => [h, buildTree(h)]));

export function heroSkill(hero: string, id: string): HeroSkill | undefined {
  return SKILL_TREES[hero]?.find((k) => k.id === id);
}

/** Why a hero can't learn a skill (null if they can). */
export function learnProblem(hero: string, h: HeroState, id: string): string | null {
  const k = heroSkill(hero, id);
  if (!k) return 'No such skill.';
  if (h.skills.includes(id)) return 'Already learned.';
  if (k.tier > 1 && !SKILL_TREES[hero].some((x) => x.branch === k.branch && x.tier === k.tier - 1 && h.skills.includes(x.id))) return 'Learn the skill before it in this branch first.';
  const cost = skillCost(k);
  if (skillPoints(h, hero) < cost) return skillPoints(h, hero) < 1 ? 'No skill points: win battles to gain levels.' : `Needs ${cost} skill points.`;
  return null;
}

/** Skill points not yet spent: one per level after the first, less what the skills learned cost. */
export const skillPoints = (h: HeroState, hero?: string) =>
  heroLevel(h.xp) - 1 - h.skills.reduce((t, id) => t + (hero ? (heroSkill(hero, id) ? skillCost(heroSkill(hero, id)!) : 0) : spentCost(id)), 0);

/** What a learned skill cost, from its id alone (ids are the same in every hero's tree: "might4"). */
function spentCost(id: string): number {
  const m = /(\d)$/.exec(id);
  return m ? SKILL_COST[Number(m[1]) as 1] ?? 0 : 0;
}

/** Everything a hero brings to battle: the boons on their card (skills and gear), and whether they start in play. */
export function heroBonus(hero: string, h: HeroState | undefined): { boons: string[]; start: boolean; skills: BattleSkill[] } {
  const boons: string[] = [];
  let start = false;
  for (const id of h?.skills ?? []) {
    const k = heroSkill(hero, id);
    if (!k) continue;
    if (k.effect.kind === 'boon') boons.push(...k.effect.boons);
    else start = true;
  }
  for (const item of Object.values(h?.gear ?? {})) boons.push(...itemBoons(item));
  return { boons, start, skills: [] };
}

/** A list of boons, in words ("Dawn: heat 2. Sturdy 1."). */
export function boonsText(boons: string[]): string {
  return boons.map((b) => plainText(cardDef(b).text)).join(' ');
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------

/** What each kind of gear is called, by race (a Vorthane helm is not an Aureline one). */
const GEAR_NAMES: Record<SlotKind, string[]> = {
  weapon: ['Sunlance', 'Shard Blade', 'Tide Trident', 'Barbed Stinger'],
  helm: ['Halo Crown', 'Prism Circlet', 'Pressure Helm', 'Chitin Crest'],
  mantle: ['Mantle of Dawn', 'Mantle of Dawn', 'Mantle of Dawn', 'Mantle of Dawn'],
  sigil: ['Sigil of the Keepers', 'Sigil of the Keepers', 'Sigil of the Keepers', 'Sigil of the Keepers'],
  core: ['Memory Core', 'Memory Core', 'Memory Core', 'Memory Core'],
  facet: ['Lens Facet', 'Lens Facet', 'Lens Facet', 'Lens Facet'],
  ring: ['Tidebound Ring', 'Tidebound Ring', 'Tidebound Ring', 'Tidebound Ring'],
  carapace: ['Hive Carapace', 'Hive Carapace', 'Hive Carapace', 'Hive Carapace'],
  gland: ['Spore Gland', 'Spore Gland', 'Spore Gland', 'Spore Gland'],
};
const QUALITY: Record<ItemRarity, string> = { dwarf: 'Worn', stellar: 'Bright', anomaly: 'Starforged' };
const STEP: Record<ItemRarity, number> = { dwarf: 1, stellar: 2, anomaly: 3 };

/** What a piece of gear puts on its hero's card, by slot and quality (1 worn, 2 bright, 3 starforged). */
function gearBoons(slot: SlotKind, n: number): string[] {
  switch (slot) {
    case 'weapon':
      return [n === 3 ? boon('pierce', 2) : boon('heat', n)];
    case 'helm':
    case 'carapace':
      return [boon('sturdy', n)];
    case 'mantle':
      return [boon('shield', n)];
    case 'core':
      return [boon('cool', n)];
    case 'sigil':
      return [n === 1 ? boon('playdraw', 1) : n === 2 ? boon('draw', 1) : boon('energy', 1)];
    case 'facet':
      return [n === 1 ? boon('stability', 1) : n === 2 ? boon('heat', 1) : boon('pierce', 1)];
    case 'ring':
      // Many rings, each a little.
      return [n === 1 ? boon('stability', 1) : n === 2 ? boon('shield', 1) : boon('repair', 1)];
    case 'gland':
      return [n === 1 ? boon('cool', 1) : boon('plant', n - 1)];
  }
}

/** The boons a piece of gear gives (an older save's item: worked out from its slot and quality). */
export function itemBoons(i: Item): string[] {
  return i.boons ?? gearBoons(i.slot, STEP[i.rarity]);
}

/** A piece of gear for a slot, of a rarity: what it puts on its hero's card grows with its rarity. */
export function makeItem(id: string, slot: SlotKind, rarity: ItemRarity, race: number, _roll = 0): Item {
  const boons = gearBoons(slot, STEP[rarity]);
  return { id, name: `${QUALITY[rarity]} ${GEAR_NAMES[slot][race] ?? GEAR_NAMES[slot][0]}`, slot, rarity, boons, text: `Hero card: ${boonsText(boons)}` };
}

/** A gear slot of a race's that an item fits (null if none). */
export const slotsFor = (race: number, kind: SlotKind) => RACE_SLOTS[race].filter((x) => x.kind === kind);

/** A short line for what an item does in battle. */
export const itemText = (i: Item) => (i.boons ? i.text : `Hero card: ${boonsText(itemBoons(i))}`);

/** How strong an item is, for the AI's choosing. */
export const itemValue = (i: Item) => STEP[i.rarity] * 10;
