/**
 * Ship modules: items fitted into the flagship's rooms, one to a room. In battle, whichever card stands in a
 * room carries its module's boons (boons.ts), the way a hero's card carries their gear: so a Coolant Loop
 * cools your sun at each dawn while a card holds that room. Each module is one of a kind: fitted in one
 * room, it is in no other. They are found after battles won, better the deeper the system lies.
 */
import { boon } from './boons';
import type { ItemRarity } from './heroes';

export type ModuleKind = 'coolant' | 'emitter' | 'targeting' | 'autoloader' | 'plating' | 'drones' | 'projector' | 'decoy' | 'lances';

export interface ShipModule {
  id: string;
  name: string;
  kind: ModuleKind;
  rarity: ItemRarity;
  /** Boons on the card standing in its room. */
  boons: string[];
  text: string;
}

const STEP: Record<ItemRarity, number> = { dwarf: 1, stellar: 2, anomaly: 3 };
const QUALITY: Record<ItemRarity, string> = { dwarf: 'Worn', stellar: 'Bright', anomaly: 'Starforged' };

/** Each kind: its name, and what it puts on the card in its room by quality (1 worn, 2 bright, 3 starforged). */
export const MODULES: Record<ModuleKind, { name: string; boons: (n: number) => string[]; text: (n: number) => string }> = {
  coolant: { name: 'Coolant Loop', boons: (n) => [boon('cool', n)], text: (n) => `At each dawn, cools your sun by ${n}.` },
  emitter: { name: 'Shield Emitter', boons: (n) => [boon('shield', n)], text: (n) => `At each dawn, raises ${n} shield${n === 1 ? '' : 's'}.` },
  targeting: { name: 'Targeting Array', boons: (n) => [boon('pierce', n)], text: (n) => `At each dawn, ${n} heat to your rival's sun, through shields.` },
  autoloader: { name: 'Autoloader', boons: (n) => [boon('playheat', n + 1)], text: (n) => `As a card is played into this room: ${n + 1} heat.` },
  plating: { name: 'Ablative Plating', boons: (n) => [boon('sturdy', n)], text: (n) => `The card in this room has +${n} defence (Sturdy).` },
  drones: { name: 'Repair Drones', boons: (n) => [boon('repair', n)], text: (n) => `At each dawn, mends ${n} worn defence.` },
  projector: { name: 'Bulwark Projector', boons: (n) => [boon('bulwark', n)], text: (n) => `Its neighbours have +${n} defence (Bulwark).` },
  decoy: { name: 'Decoy Beacon', boons: (n) => [boon('guard'), ...(n > 1 ? [boon('sturdy', n - 1)] : [])], text: (n) => `The card in this room must be attacked first (Guard)${n > 1 ? `, with +${n - 1} defence` : ''}.` },
  lances: { name: 'Overcharged Lances', boons: (n) => [boon('heat', n)], text: (n) => `At each dawn, ${n} heat to your rival's sun.` },
};
export const MODULE_KINDS = Object.keys(MODULES) as ModuleKind[];

/** A module of a kind and quality. */
export function makeModule(id: string, kind: ModuleKind, rarity: ItemRarity): ShipModule {
  const m = MODULES[kind];
  const n = STEP[rarity];
  return { id, name: `${QUALITY[rarity]} ${m.name}`, kind, rarity, boons: m.boons(n), text: m.text(n) };
}

/** How strong a module is, for the AI's choosing. */
export const moduleValue = (m: ShipModule) => STEP[m.rarity] * 10;
