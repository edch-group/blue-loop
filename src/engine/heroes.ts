/**
 * Campaign heroes: the generals who lead armies grow with them. Each hero gains experience by winning
 * battles, and with each level a point to spend on their own skill tree; and each can carry a weapon and
 * armour shaped to their race (the many-tentacled Vorthane wear a helm and a ring on every arm). Gear is
 * found when an army takes a system.
 */
import type { BattleModifiers, BattleSkill, Effect } from './types';

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

/** A piece of gear: what it gives its hero's army in battle. */
export interface Item {
  id: string;
  name: string;
  slot: SlotKind;
  rarity: ItemRarity;
  /** Battle modifiers for its hero's side. */
  mods: BattleModifiers;
  /** Heat the rival's sun starts with (a weapon's bite). */
  foeHeat?: number;
  text: string;
}

/** What a skill does. */
export type SkillEffect =
  /** In every battle its hero fights: modifiers for their side (and `foe`: for their rival's), and heat their rival starts with. */
  | { kind: 'mod'; mods?: BattleModifiers; foeHeat?: number; foe?: BattleModifiers }
  /** Its army may move one more route a turn. */
  | { kind: 'march' }
  /** The hero starts every battle in play, in their side's Hero slot. */
  | { kind: 'start' }
  /** Neutral systems up to this tier surrender to its army without a fight. */
  | { kind: 'dread'; tier: number }
  /** Its army sees two links out from where it stands. */
  | { kind: 'sight' }
  /** Its army repairs this much damage at the start of each turn. */
  | { kind: 'mend'; amount: number }
  /** Its army finds gear more often when it takes a system. */
  | { kind: 'loot'; chance: number }
  /** A signature card: a copy joins the reserve when it is learned. */
  | { kind: 'card'; card: string }
  /** A skill to call on in battle (once, or each day for its cost). */
  | { kind: 'battle'; name: string; cost: number; once?: boolean; effects: Effect[] };

export interface HeroSkill {
  id: string;
  name: string;
  text: string;
  /** The tree's three branches: 0 Might (battle), 1 Command (the map), 2 Legacy (the race's way of war). */
  branch: 0 | 1 | 2;
  /** 1–6, from the hero up: each needs the one before it in its branch. Deeper tiers cost more (SKILL_COST). */
  tier: 1 | 2 | 3 | 4 | 5 | 6;
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
  /** Chance an army finds gear when it takes a system (a skill can add to it). */
  itemChance: 0.35,
} as const;

export const heroLevel = (xp: number) => XP_LEVELS.filter((x) => xp >= x).length;
export const nextLevelXp = (xp: number) => XP_LEVELS.find((x) => x > xp) ?? null;

const mod = (mods: BattleModifiers, foeHeat?: number): SkillEffect => ({ kind: 'mod', mods, ...(foeHeat ? { foeHeat } : {}) });
const battle = (name: string, cost: number, effects: Effect[], once = false): SkillEffect => ({ kind: 'battle', name, cost, effects, ...(once ? { once } : {}) });
const heat = (amount: number, pierce = false): Effect => ({ type: 'heat', amount, to: 'target', ...(pierce ? { pierce } : {}) });
const cool = (amount: number): Effect => ({ type: 'cool', amount });
const shield = (amount: number): Effect => ({ type: 'shield', amount });
const draw = (amount: number): Effect => ({ type: 'draw', amount });
const plays = (amount: number): Effect => ({ type: 'plays', amount });
const s = (id: string, branch: 0 | 1 | 2, tier: HeroSkill['tier'], name: string, text: string, effect: SkillEffect): HeroSkill => ({ id, name, text, branch, tier, effect });
const foe = (m: BattleModifiers, mods: BattleModifiers = {}): SkillEffect => ({ kind: 'mod', mods, foe: m });

/** The first three tiers of each hero's Might and Command branches, their own (heroes of a race share some ground). */
const ROOTS: Record<string, HeroSkill[]> = {
  // ---- Aureline ----
  command_directive: [
    s('veyra_ward', 0, 1, 'Solar Ward', '+1 shield at the start of every day in battle.', mod({ shieldPerTurn: 1 })),
    s('veyra_bulwark', 0, 2, 'Bulwark of Dawn', 'Once a battle: raise 8 shields.', battle('Bulwark of Dawn', 0, [shield(8)], true)),
    s('veyra_resolve', 0, 3, "Keeper's Resolve", '+6 max health in battle.', mod({ maxHealthDelta: 6 })),
    s('veyra_march', 1, 1, 'Forced March', 'Her army can move two routes a turn.', { kind: 'march' }),
    s('veyra_sunwatch', 1, 2, 'Sunwatch', 'Her army sees two links out.', { kind: 'sight' }),
    s('veyra_first_light', 1, 3, 'First Light', 'Signature card: Aurelia, First Light joins your reserve.', { kind: 'card', card: 'aurelia_first_light' }),
  ],
  ignition_protocol: [
    s('aurex_kindling', 0, 1, 'Kindling', "Your rival's sun starts 2 hotter in battle.", mod({}, 2)),
    s('aurex_ignite', 0, 2, 'Ignite', 'Each day, for 1 energy: heat 3.', battle('Ignite', 1, [heat(3)])),
    s('aurex_supernal', 0, 3, 'Supernal Strike', 'Once a battle: heat 8, piercing shields.', battle('Supernal Strike', 0, [heat(8, true)], true)),
    s('aurex_blitz', 1, 1, 'Blitz', 'His army can move two routes a turn.', { kind: 'march' }),
    s('aurex_plunder', 1, 2, 'Plunder', 'His army finds gear far more often.', { kind: 'loot', chance: 0.3 }),
    s('aurex_dawnstar', 1, 3, 'Dawnstar', 'Signature card: Dawnstar Cannon joins your reserve.', { kind: 'card', card: 'dawnstar_cannon' }),
  ],
  empress_solenne: [
    s('solenne_radiance', 0, 1, 'Radiance', 'Draw 1 more card in your opening hand.', mod({ openingHand: 1 })),
    s('solenne_decree', 0, 2, 'Imperial Decree', 'Once a battle: play 2 more cards today, and draw 2.', battle('Imperial Decree', 0, [plays(2), draw(2)], true)),
    s('solenne_crown', 0, 3, 'Crown of Vitalia', '+8 max health in battle.', mod({ maxHealthDelta: 8 })),
    s('solenne_progress', 1, 1, 'Royal Progress', 'Her army can move two routes a turn.', { kind: 'march' }),
    s('solenne_tithe', 1, 2, 'Tithe of Light', 'Her army repairs 2 damage each turn.', { kind: 'mend', amount: 2 }),
    s('solenne_sunfall', 1, 3, 'Sunfall', 'Each day, for 2 energy: heat 4.', battle('Sunfall', 2, [heat(4)])),
  ],
  // ---- Xel'Naru ----
  war_council: [
    s('seris_lattice', 0, 1, 'Memory Lattice', 'Draw 1 more card in your opening hand.', mod({ openingHand: 1 })),
    s('seris_recollection', 0, 2, 'Recollection', 'Once a battle: draw 3.', battle('Recollection', 0, [draw(3)], true)),
    s('seris_shardshield', 0, 3, 'Shard Shield', 'Each day, for 1 energy: raise 4 shields.', battle('Shard Shield', 1, [shield(4)])),
    s('seris_path', 1, 1, 'Pathfinder', 'Her army can move two routes a turn.', { kind: 'march' }),
    s('seris_farsight', 1, 2, 'Far Sight', 'Her army sees two links out.', { kind: 'sight' }),
    s('seris_archive', 1, 3, 'Archive of Ages', 'Her army finds gear far more often.', { kind: 'loot', chance: 0.3 }),
  ],
  coolant_protocol: [
    s('vael_patience', 0, 1, 'Cold Patience', 'Your sun cools by 1 every day in battle.', mod({ coolPerTurn: 1 })),
    s('vael_calm', 0, 2, 'Absolute Calm', 'Once a battle: cool 8.', battle('Absolute Calm', 0, [cool(8)], true)),
    s('vael_frostmind', 0, 3, 'Frost Mind', 'Your sun starts 3 cooler in battle.', mod({ startingHeat: -3 })),
    s('vael_path', 1, 1, 'Glacial Advance', 'His army can move two routes a turn.', { kind: 'march' }),
    s('vael_mend', 1, 2, 'Reforging', 'His army repairs 2 damage each turn.', { kind: 'mend', amount: 2 }),
    s('vael_zero', 1, 3, 'Absolute Zero', 'Signature card: Absolute Zero joins your reserve.', { kind: 'card', card: 'absolute_zero' }),
  ],
  the_shardmind: [
    s('shard_voices', 0, 1, 'Many Voices', 'Draw 1 extra card every day in battle.', mod({ extraDraw: 1 })),
    s('shard_chorus', 0, 2, 'Chorus', 'Each day, for 2 energy: draw 2 and cool 2.', battle('Chorus', 2, [draw(2), cool(2)])),
    s('shard_apotheosis', 0, 3, 'Crystal Apotheosis', 'Once a battle: play 2 more cards today, and cool 5.', battle('Crystal Apotheosis', 0, [plays(2), cool(5)], true)),
    s('shard_sight', 1, 1, 'Lattice Sight', 'Its army sees two links out.', { kind: 'sight' }),
    s('shard_march', 1, 2, 'Refraction Step', 'Its army can move two routes a turn.', { kind: 'march' }),
    s('shard_queen', 1, 3, 'The Prism Queen', 'Signature card: Kyrvessa, Prism Queen joins your reserve.', { kind: 'card', card: 'kyrvessa_prism_queen' }),
  ],
  // ---- Vorthane ----
  tide_regent: [
    s('osshara_tide', 0, 1, 'Rising Tide', '+1 shield at the start of every day in battle.', mod({ shieldPerTurn: 1 })),
    s('osshara_breakwater', 0, 2, 'Breakwater', 'Once a battle: raise 10 shields.', battle('Breakwater', 0, [shield(10)], true)),
    s('osshara_current', 0, 3, 'Deep Current', '+6 max health in battle.', mod({ maxHealthDelta: 6 })),
    s('osshara_march', 1, 1, 'Riding the Swell', 'Her army can move two routes a turn.', { kind: 'march' }),
    s('osshara_mend', 1, 2, 'Brine Healing', 'Her army repairs 2 damage each turn.', { kind: 'mend', amount: 2 }),
    s('osshara_bell', 1, 3, 'The Deep Bell', 'Signature card: Ommarath, the Deep Bell joins your reserve.', { kind: 'card', card: 'ommarath_deep_bell' }),
  ],
  the_admiralty: [
    s('admiralty_broadside', 0, 1, 'Broadside', 'Each day, for 1 energy: heat 3.', battle('Broadside', 1, [heat(3)])),
    s('admiralty_discipline', 0, 2, 'Fleet Discipline', 'Draw 1 more card in your opening hand.', mod({ openingHand: 1 })),
    s('admiralty_salvo', 0, 3, 'Grand Salvo', 'Once a battle: heat 7.', battle('Grand Salvo', 0, [heat(7)], true)),
    s('admiralty_logistics', 1, 1, 'Fleet Logistics', 'Its army can move two routes a turn.', { kind: 'march' }),
    s('admiralty_charts', 1, 2, "Admiral's Charts", 'Its army sees two links out.', { kind: 'sight' }),
    s('admiralty_prize', 1, 3, 'Prize Crews', 'Its army finds gear far more often.', { kind: 'loot', chance: 0.3 }),
  ],
  leviathan_thoross: [
    s('thoross_hide', 0, 1, 'Thick Hide', '+6 max health in battle.', mod({ maxHealthDelta: 6 })),
    s('thoross_depths', 0, 2, 'Crushing Depths', 'Once a battle: heat 6 and cool 3.', battle('Crushing Depths', 0, [heat(6), cool(3)], true)),
    s('thoross_abyss', 0, 3, 'Abyssal', '+2 shields at the start of every day in battle.', mod({ shieldPerTurn: 2 })),
    s('thoross_march', 1, 1, 'Leviathan Wake', 'His army can move two routes a turn.', { kind: 'march' }),
    s('thoross_mend', 1, 2, 'Regrowth', 'His army repairs 3 damage each turn.', { kind: 'mend', amount: 3 }),
    s('thoross_titan', 1, 3, 'Abyssal Titan', 'Signature card: Abyssal Titan joins your reserve.', { kind: 'card', card: 'abyssal_titan' }),
  ],
  // ---- Ixquor ----
  logistics_command: [
    s('zyth_spores', 0, 1, 'Spore Cloud', "Your rival's sun starts 2 hotter in battle.", mod({}, 2)),
    s('zyth_swarm', 0, 2, 'Swarm', 'Each day, for 1 energy: draw 1 and play 1 more card today.', battle('Swarm', 1, [draw(1), plays(1)])),
    s('zyth_bloom', 0, 3, 'Bloom', 'Draw 1 extra card every day in battle.', mod({ extraDraw: 1 })),
    s('zyth_march', 1, 1, 'Spreading', 'Its army can move two routes a turn.', { kind: 'march' }),
    s('zyth_loot', 1, 2, 'Scavenge', 'Its army finds gear far more often.', { kind: 'loot', chance: 0.3 }),
    s('zyth_queen', 1, 3, 'The Brood Queen', 'Signature card: The Brood Queen joins your reserve.', { kind: 'card', card: 'the_brood_queen' }),
  ],
  chamber_protocol: [
    s('ulkha_brood', 0, 1, 'Brood', 'Draw 1 more card in your opening hand.', mod({ openingHand: 1 })),
    s('ulkha_regrowth', 0, 2, 'Regrowth', 'Once a battle: cool 6 and raise 4 shields.', battle('Regrowth', 0, [cool(6), shield(4)], true)),
    s('ulkha_heart', 0, 3, 'Hive Heart', '+6 max health in battle.', mod({ maxHealthDelta: 6 })),
    s('ulkha_mend', 1, 1, 'Nursery', 'Her army repairs 3 damage each turn.', { kind: 'mend', amount: 3 }),
    s('ulkha_march', 1, 2, 'Creeping Advance', 'Her army can move two routes a turn.', { kind: 'march' }),
    s('ulkha_sight', 1, 3, 'Spore Scouts', 'Her army sees two links out.', { kind: 'sight' }),
  ],
  the_worldroot: [
    s('root_deep', 0, 1, 'Deep Roots', 'Your sun cools by 1 every day in battle.', mod({ coolPerTurn: 1 })),
    s('root_overgrowth', 0, 2, 'Overgrowth', 'Each day, for 2 energy: raise 3 shields and draw 1.', battle('Overgrowth', 2, [shield(3), draw(1)])),
    s('root_worldbloom', 0, 3, 'Worldbloom', 'Once a battle: play 3 more cards today.', battle('Worldbloom', 0, [plays(3)], true)),
    s('root_march', 1, 1, 'Rootrunner', 'Its army can move two routes a turn.', { kind: 'march' }),
    s('root_mend', 1, 2, 'Sap', 'Its army repairs 3 damage each turn.', { kind: 'mend', amount: 3 }),
    s('root_mycelium', 1, 3, 'Great Mycelium', 'Signature card: Great Mycelium joins your reserve.', { kind: 'card', card: 'great_mycelium' }),
  ],
};

/** What each race brings to the deep tiers of Might and Command, and its whole Legacy branch. */
const RACE_TIERS: { might: [string, string, SkillEffect][]; command: [string, string, SkillEffect][]; dread: string; legacy: [string, string, SkillEffect][] }[] = [
  // Aureline: the light, carried home.
  {
    might: [
      ['Solar Doctrine', "Your rival's sun starts 3 hotter in battle.", mod({}, 3)],
      ['Second Sunrise', '+1 energy every day in battle.', mod({ extraPlays: 1 })],
    ],
    command: [
      ["Pilgrim's Road", 'This army can move one more route a turn.', { kind: 'march' }],
      ['Field Sanctum', 'This army repairs 3 damage each turn.', { kind: 'mend', amount: 3 }],
    ],
    dread: 'Sovereign Light',
    legacy: [
      ['Gilded Plate', '+4 max health in battle.', mod({ maxHealthDelta: 4 })],
      ['Sun Choir', 'Each day, for 1 energy: cool 2 and raise 2 shields.', battle('Sun Choir', 1, [cool(2), shield(2)])],
      ['Dawnbreak', 'Your sun starts 2 cooler in battle.', mod({ startingHeat: -2 })],
      ['Aureate Legion', '+8 max health in battle.', mod({ maxHealthDelta: 8 })],
      ['Hymn Eternal', 'Your sun cools by 1, and you raise 1 shield, every day in battle.', mod({ coolPerTurn: 1, shieldPerTurn: 1 })],
    ],
  },
  // Xel'Naru: minds of crystal, remembering everything.
  {
    might: [
      ['Lattice Mind', 'Draw 1 extra card every day in battle.', mod({ extraDraw: 1 })],
      ['Overclock', '+1 energy every day in battle.', mod({ extraPlays: 1 })],
    ],
    command: [
      ['Phase Step', 'This army can move one more route a turn.', { kind: 'march' }],
      ['Self-Repair', 'This army repairs 3 damage each turn.', { kind: 'mend', amount: 3 }],
    ],
    dread: 'Inevitability',
    legacy: [
      ['Facet Polish', 'Your sun starts 2 cooler in battle.', mod({ startingHeat: -2 })],
      ['Mind Spike', 'Each day, for 1 energy: heat 2 and draw 1.', battle('Mind Spike', 1, [heat(2), draw(1)])],
      ['Echo', 'Draw 1 more card in your opening hand.', mod({ openingHand: 1 })],
      ['Prism Array', '+2 shields at the start of every day in battle.', mod({ shieldPerTurn: 2 })],
      ['Recursive Thought', 'Once a battle: play 3 more cards today.', battle('Recursive Thought', 0, [plays(3)], true)],
    ],
  },
  // Vorthane: the weight of the deep.
  {
    might: [
      ['Pressure Hull', '+2 shields at the start of every day in battle.', mod({ shieldPerTurn: 2 })],
      ["Tidecaller's Rhythm", '+1 energy every day in battle.', mod({ extraPlays: 1 })],
    ],
    command: [
      ['Deep Currents', 'This army can move one more route a turn.', { kind: 'march' }],
      ['Brine Cradle', 'This army repairs 3 damage each turn.', { kind: 'mend', amount: 3 }],
    ],
    dread: 'The Drowning Dread',
    legacy: [
      ['Brine Skin', '+4 max health in battle.', mod({ maxHealthDelta: 4 })],
      ['Undertow', 'Each day, for 1 energy: heat 2 and raise 2 shields.', battle('Undertow', 1, [heat(2), shield(2)])],
      ['Cold Deeps', 'Your sun cools by 1 every day in battle.', mod({ coolPerTurn: 1 })],
      ["Kraken's Grip", "Your rival's sun has 6 less max health.", foe({ maxHealthDelta: -6 })],
      ['Abyssal Fortitude', '+10 max health in battle.', mod({ maxHealthDelta: 10 })],
    ],
  },
  // Ixquor: the hive that does not stop.
  {
    might: [
      ['Spore Haze', "Your rival's sun heats by 1 every day in battle.", foe({ heatPerTurn: 1 })],
      ['Hive Surge', '+1 energy every day in battle.', mod({ extraPlays: 1 })],
    ],
    command: [
      ['Swarm Tunnels', 'This army can move one more route a turn.', { kind: 'march' }],
      ['Regrowth Vats', 'This army repairs 3 damage each turn.', { kind: 'mend', amount: 3 }],
    ],
    dread: 'Consume',
    legacy: [
      ['Chitin', '+4 max health in battle.', mod({ maxHealthDelta: 4 })],
      ['Feeding Frenzy', 'Each day, for 1 energy: heat 2 and draw 1.', battle('Feeding Frenzy', 1, [heat(2), draw(1)])],
      ['Broodlings', 'Draw 1 more card in your opening hand.', mod({ openingHand: 1 })],
      ['Acid Blood', "Your rival's sun starts 4 hotter in battle.", mod({}, 4)],
      ['Endless Swarm', 'Draw 1 extra card every day in battle.', mod({ extraDraw: 1 })],
    ],
  },
];

/** Each hero's Might capstone: the upgrade that changes how their battles go. */
const CAPSTONES: Record<string, [string, string, SkillEffect]> = {
  command_directive: ['Eternal Dawn', '+1 energy and +3 shields every day in battle.', mod({ extraPlays: 1, shieldPerTurn: 3 })],
  ignition_protocol: ['Nova Doctrine', "Your rival's sun heats by 2 every day in battle.", foe({ heatPerTurn: 2 })],
  empress_solenne: ['Empire of Light', '+2 energy every day in battle.', mod({ extraPlays: 2 })],
  war_council: ['Total Recall', 'Draw 2 extra cards every day, and 2 more in your opening hand.', mod({ extraDraw: 2, openingHand: 2 })],
  coolant_protocol: ['Heat Death', "Your sun cools by 2 every day; your rival's heats by 1.", foe({ heatPerTurn: 1 }, { coolPerTurn: 2 })],
  the_shardmind: ['Singularity', 'Once a battle: play 5 more cards today, and draw 5.', battle('Singularity', 0, [plays(5), draw(5)], true)],
  tide_regent: ['Endless Tide', '+5 shields every day, and +10 max health, in battle.', mod({ shieldPerTurn: 5, maxHealthDelta: 10 })],
  the_admiralty: ['Armada', 'Each day, for 1 energy: heat 6, piercing shields.', battle('Armada', 1, [heat(6, true)])],
  leviathan_thoross: ['Leviathan Ascendant', "+20 max health in battle, and your rival's sun starts 4 hotter.", mod({ maxHealthDelta: 20 }, 4)],
  logistics_command: ['Plague Bloom', "Your rival's sun heats by 2 every day in battle.", foe({ heatPerTurn: 2 })],
  chamber_protocol: ['Brood Mother', '+1 energy and 1 extra card every day in battle.', mod({ extraPlays: 1, extraDraw: 1 })],
  the_worldroot: ['World Tree', 'Your sun cools by 3, and +1 energy, every day in battle.', mod({ coolPerTurn: 3, extraPlays: 1 })],
};

/** The heroes of each race, in order (to find a hero's race without the card pool). */
const RACE_OF: Record<string, number> = {
  command_directive: 0, ignition_protocol: 0, empress_solenne: 0,
  war_council: 1, coolant_protocol: 1, the_shardmind: 1,
  tide_regent: 2, the_admiralty: 2, leviathan_thoross: 2,
  logistics_command: 3, chamber_protocol: 3, the_worldroot: 3,
};

/** A hero's whole tree: three branches of six, from the hero up to a capstone. */
function buildTree(hero: string): HeroSkill[] {
  const r = RACE_TIERS[RACE_OF[hero] ?? 0];
  const [cn, ct, ce] = CAPSTONES[hero];
  return [
    ...ROOTS[hero],
    s('might4', 0, 4, ...r.might[0]),
    s('might5', 0, 5, ...r.might[1]),
    s('might6', 0, 6, cn, ct, ce),
    s('command4', 1, 4, ...r.command[0]),
    s('command5', 1, 5, ...r.command[1]),
    s('command6', 1, 6, r.dread, 'Neutral systems up to tier 3 surrender to this army without a fight.', { kind: 'dread', tier: 3 }),
    ...r.legacy.map(([n, t, e], i) => s(`legacy${i + 1}`, 2, (i + 1) as HeroSkill['tier'], n, t, e)),
    s('legacy6', 2, 6, 'Herald', 'This hero starts every battle in play, already leading from your Hero slot.', { kind: 'start' }),
  ];
}

/** Each hero's own tree. */
export const SKILL_TREES: Record<string, HeroSkill[]> = Object.fromEntries(Object.keys(ROOTS).map((h) => [h, buildTree(h)]));

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
  heroLevel(h.xp) - 1 - h.skills.reduce((t, id) => t + (hero ? (heroSkill(hero, id) ? skillCost(heroSkill(hero, id)!) : 1) : spentCost(id)), 0);

/** What a learned skill cost, from its id alone (for callers without the hero to hand). */
function spentCost(id: string): number {
  for (const tree of Object.values(SKILL_TREES)) {
    const k = tree.find((x) => x.id === id);
    if (k) return skillCost(k);
  }
  return 1;
}

/** Everything a hero brings: battle modifiers, heat for the rival, battle skills, and on the map. */
export function heroBonus(hero: string, h: HeroState | undefined) {
  const mods: BattleModifiers = {};
  const foeMods: BattleModifiers = {};
  /** What the rival's side is told about it (skills that touch their sun). */
  const foeConditions: { name: string; text: string }[] = [];
  let start = false;
  let dread = 0;
  let foeHeat = 0;
  let march = 0;
  let mend = 0;
  let loot = 0;
  let sight = false;
  const skills: BattleSkill[] = [];
  const add = (m?: BattleModifiers, into: BattleModifiers = mods) => {
    for (const [k, v] of Object.entries(m ?? {})) (into as Record<string, number>)[k] = ((into as Record<string, number>)[k] ?? 0) + (v as number);
  };
  for (const id of h?.skills ?? []) {
    const k = heroSkill(hero, id);
    if (!k) continue;
    const e = k.effect;
    if (e.kind === 'mod') {
      add(e.mods);
      foeHeat += e.foeHeat ?? 0;
      if (e.foe) {
        add(e.foe, foeMods);
        foeConditions.push({ name: k.name, text: k.text });
      }
    } else if (e.kind === 'march') march += 1;
    else if (e.kind === 'start') start = true;
    else if (e.kind === 'dread') dread = Math.max(dread, e.tier);
    else if (e.kind === 'sight') sight = true;
    else if (e.kind === 'mend') mend += e.amount;
    else if (e.kind === 'loot') loot += e.chance;
    else if (e.kind === 'battle') skills.push({ id: k.id, name: e.name, text: k.text, hero, effects: e.effects, cost: e.cost, ...(e.once ? { once: true } : {}) });
  }
  for (const item of Object.values(h?.gear ?? {})) {
    add(item.mods);
    foeHeat += item.foeHeat ?? 0;
  }
  return { mods, foeMods, foeConditions, foeHeat, march, mend, loot, sight, skills, start, dread };
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

/** A piece of gear for a slot, of a rarity: what it gives grows with its rarity. */
export function makeItem(id: string, slot: SlotKind, rarity: ItemRarity, race: number, roll: number): Item {
  const n = STEP[rarity];
  const name = `${QUALITY[rarity]} ${GEAR_NAMES[slot][race] ?? GEAR_NAMES[slot][0]}`;
  const base = { id, name, slot, rarity };
  switch (slot) {
    case 'weapon':
      return { ...base, mods: {}, foeHeat: n, text: `Your rival's sun starts ${n} hotter.` };
    case 'helm':
    case 'core':
    case 'carapace':
      return { ...base, mods: { maxHealthDelta: 2 * n }, text: `+${2 * n} max health.` };
    case 'mantle':
    case 'facet':
    case 'gland':
      return roll < 0.5 || n === 1
        ? { ...base, mods: { startingHeat: -(n + 1) }, text: `Your sun starts ${n + 1} cooler.` }
        : { ...base, mods: { shieldPerTurn: n - 1 }, text: `+${n - 1} shield${n - 1 === 1 ? '' : 's'} every day.` };
    case 'sigil':
      return n === 3 ? { ...base, mods: { extraDraw: 1 }, text: 'Draw 1 extra card every day.' } : { ...base, mods: { openingHand: 1, maxHealthDelta: n - 1 }, text: `1 more card in your opening hand${n > 1 ? `, +${n - 1} max health` : ''}.` };
    case 'ring':
      // Many rings, each a little.
      return { ...base, mods: { maxHealthDelta: n }, text: `+${n} max health.` };
  }
}

/** A gear slot of a race's that an item fits (null if none). */
export const slotsFor = (race: number, kind: SlotKind) => RACE_SLOTS[race].filter((x) => x.kind === kind);

/** A short line for what an item does in battle. */
export const itemText = (i: Item) => i.text;

/** How strong an item is, for the AI's choosing. */
export const itemValue = (i: Item) => STEP[i.rarity] * 10 + (i.foeHeat ?? 0);
