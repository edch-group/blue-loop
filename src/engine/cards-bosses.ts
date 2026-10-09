import type { CardDef } from './types';

/**
 * The Lost Overlords: what guards each wormhole. Not decks: each is a body of parts already in play (limbs, the
 * gear it wears, its retainers) round the Overlord itself in the Hero slot. It draws and plays nothing; each day
 * it takes one great action, its parts taking turns, and the part whose turn is next is shown. Destroy a part and
 * its action is lost (the Overlord staggers when that turn comes). Its sun is still how it is beaten.
 *
 * Their cards are like tokens: in play only, in no deck, shop or collection.
 */
export const BOSS_CARDS: CardDef[] = [
  // ---- The Hollow Colossus: a vast construct of a dead race, its furnace still burning ----
  {
    id: 'boss_colossus', overlordPart: 'overlord', name: 'Hollow Colossus', kind: 'command', stability: 14, attack: 0,
    text: '{dawn}: {heat:2}. Action: {heat:5}.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target' }],
    bossAction: { name: 'Furnace Breath', effects: [{ type: 'heat', amount: 5, to: 'target' }] },
  },
  {
    id: 'colossus_left_fist', overlordPart: 'body', name: 'Colossal Fist', kind: 'attack', health: 6, attack: 3,
    text: '6 heat to your card with the most attack.',
    bossAction: { name: 'Crushing Blow', effects: [{ type: 'strikeBest', amount: 6 }] },
  },
  {
    id: 'colossus_right_fist', overlordPart: 'body', name: 'Piston Arm', kind: 'attack', health: 6, attack: 3,
    text: '2 heat to each of your cards.',
    bossAction: { name: 'Hammerfall', effects: [{ type: 'strikeAll', amount: 2 }] },
  },
  {
    id: 'colossus_plating', overlordPart: 'gear', name: 'Bastion Plating', kind: 'defence', health: 8, defence: 2,
    text: '{guard}. {sturdy:2}. {dawn}: {shield:1}. Bolted over the furnace: while it holds, every attack must come at it.',
    passive: [{ type: 'taunt' }],
    onTurn: [{ type: 'shield', amount: 1 }],
  },
  {
    id: 'colossus_drones', overlordPart: 'retainer', name: 'Scrap Drones', kind: 'attack', health: 3, attack: 1,
    text: '{dawn}: {heat:1}. Its retainers: they swarm round the Colossus, picking at whatever comes near.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }],
  },

  // ---- The Mother of Maws: the brood-queen of a hive that ate its own stars ----
  {
    id: 'boss_maws', overlordPart: 'overlord', name: 'Mother of Maws', kind: 'command', stability: 16, attack: 0,
    text: '{dawn}: {heat:2}. Action: 2 Broodlings into her free slots.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target' }],
    bossAction: { name: 'Spawn', effects: [{ type: 'summon', defId: 'boss_broodling', amount: 2 }] },
  },
  {
    id: 'maws_left_claw', overlordPart: 'body', name: 'Rending Claw', kind: 'attack', health: 5, attack: 3,
    text: '7 heat to your card with the most attack.',
    bossAction: { name: 'Rend', effects: [{ type: 'strikeBest', amount: 7 }] },
  },
  {
    id: 'maws_right_claw', overlordPart: 'body', name: 'Raking Talon', kind: 'attack', health: 5, attack: 3,
    text: '3 heat to each of your cards.',
    bossAction: { name: 'Rake', effects: [{ type: 'strikeAll', amount: 3 }] },
  },
  {
    id: 'maws_maw', overlordPart: 'body', name: 'Gaping Maw', kind: 'attack', health: 7, attack: 2,
    text: 'Your card with the least stability left is destroyed.',
    bossAction: { name: 'Devour', effects: [{ type: 'devour' }] },
  },
  {
    id: 'maws_carapace', overlordPart: 'body', name: 'Chitin Carapace', kind: 'defence', health: 7, defence: 2,
    text: '{guard}. {sturdy:2}. {dawn}: {shield:3}. Her shell: while it holds, every attack must come at it.',
    passive: [{ type: 'taunt' }],
    onTurn: [{ type: 'shield', amount: 3 }],
  },
  {
    id: 'boss_broodling', overlordPart: 'retainer', name: 'Broodling', kind: 'attack', health: 2, attack: 2,
    text: '{dawn}: {heat:1}. One of the Mother\'s countless young.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }],
  },

  // ---- The Ashen Tyrant: the last king of a burned-out empire, still in his armour ----
  {
    id: 'boss_tyrant', overlordPart: 'overlord', name: 'Ashen Tyrant', kind: 'command', stability: 14, attack: 0,
    text: "{dawn}: {heat:2}. Action: {heat:6}.",
    onTurn: [{ type: 'heat', amount: 2, to: 'target' }],
    bossAction: { name: "Tyrant's Decree", effects: [{ type: 'heat', amount: 6, to: 'target' }] },
  },
  {
    id: 'tyrant_greatsword', overlordPart: 'gear', name: 'Ember Greatsword', kind: 'attack', health: 6, attack: 4,
    text: '4 heat to your card with the most attack, then 1 heat to each of your cards.',
    bossAction: { name: 'Cleave', effects: [{ type: 'strikeBest', amount: 4 }, { type: 'strikeAll', amount: 1 }] },
  },
  {
    id: 'tyrant_tower_shield', overlordPart: 'gear', name: 'Tower Shield', kind: 'defence', health: 8, defence: 2,
    text: '{guard}. {sturdy:2}. Action: {shield:6}.',
    passive: [{ type: 'taunt' }],
    bossAction: { name: 'Shield Wall', effects: [{ type: 'shield', amount: 6 }] },
  },
  {
    id: 'tyrant_crown', overlordPart: 'gear', name: 'Crown of Cinders', kind: 'defence', health: 5,
    text: "The Tyrant's heat deals +1.",
    passive: [{ type: 'kindBonus', amount: 1 }],
  },
  {
    id: 'tyrant_retainers', overlordPart: 'retainer', name: 'Ashen Retainers', kind: 'attack', health: 4, attack: 2,
    text: 'Restore 3 stability to each of his other cards.',
    bossAction: { name: 'Rally', effects: [{ type: 'restore', amount: 3, all: true }] },
  },
];
for (const c of BOSS_CARDS) Object.assign(c, { cost: 0, token: true });

/** A Lost Overlord: its name, what it is, and the body it fights with (its Overlord leads from the Hero slot). */
export interface Overlord {
  id: string;
  name: string;
  /** A line on what it is. */
  blurb: string;
  hero: string;
  parts: string[];
}

export const OVERLORDS: Overlord[] = [
  {
    id: 'colossus',
    name: 'The Hollow Colossus',
    blurb: 'A vast construct of a race long dead, its furnace still burning. Its fists crush; its plating turns every blow.',
    hero: 'boss_colossus',
    parts: ['colossus_plating', 'colossus_left_fist', 'colossus_right_fist', 'colossus_drones'],
  },
  {
    id: 'maws',
    name: 'The Mother of Maws',
    blurb: 'The brood-queen of a hive that ate its own stars. Her claws rend, her maw devours, and her young never stop coming.',
    hero: 'boss_maws',
    parts: ['maws_carapace', 'maws_left_claw', 'maws_maw', 'maws_right_claw'],
  },
  {
    id: 'tyrant',
    name: 'The Ashen Tyrant',
    blurb: 'The last king of a burned-out empire, still in his armour. His greatsword cleaves; his shield and retainers keep him standing.',
    hero: 'boss_tyrant',
    parts: ['tyrant_tower_shield', 'tyrant_greatsword', 'tyrant_crown', 'tyrant_retainers'],
  },
];

/** A Lost Overlord's sun's max health: well beyond any other's, and more in every universe. */
export const overlordHealth = (universe: number) => 30 + 5 * (universe - 1);

export const overlordById = (id: string): Overlord => OVERLORDS.find((o) => o.id === id) ?? OVERLORDS[0];

/** Whether a card is a Lost Overlord's (drawn full-art: one action, its picture filling the card). */
const BOSS_IDS = new Set(BOSS_CARDS.map((c) => c.id));
export const isBossCard = (id: string) => BOSS_IDS.has(id);
