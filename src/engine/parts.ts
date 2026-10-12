/**
 * The Captain's ship parts [direction: a ship tab where the player's ship is upgraded with parts found in the
 * campaign; found at certain events, and every boss guarantees one; added to the hangar and kept forever; freely
 * fitted; the warp drive an upgrade that lets the ship jump to nearby systems even if they aren't connected].
 *
 * The ship has six slots, each taking its own kind of part: armour (more health on the sun), a shield module
 * (shields up as each battle begins), two weapons (port and starboard: more attack on that side's slots), boosters
 * (cooling on every jump; the best a second jump a turn) and a warp drive (jumps to unlinked systems near by).
 * A part is found once and kept for every run after, in the hangar (meta.ts); what is fitted goes with each run.
 */

export type PartKind = 'armour' | 'shield' | 'weapon' | 'booster' | 'warp';
export type PartSlot = 'armour' | 'shield' | 'port' | 'starboard' | 'booster' | 'warp';
export type PartRarity = 'dwarf' | 'stellar' | 'anomaly';

export interface ShipPartDef {
  id: string;
  name: string;
  kind: PartKind;
  rarity: PartRarity;
  /** What it does, in a few words. */
  text: string;
  /** Max health on the sun (armour). */
  health?: number;
  /** Defence on every slot of the tableau (armour). */
  walls?: number;
  /** Shields up as each battle begins, and each day (shield modules). */
  shields?: number;
  shieldPerTurn?: number;
  /** Attack on its side's two slots (weapons). */
  guns?: number;
  /** Heat on the foe's sun as each battle begins (weapons). */
  opening?: number;
  /** Cooling on each jump, and jumps more a turn (boosters). */
  cool?: number;
  march?: number;
  /** How far the warp drive reaches (in routes' lengths). */
  warp?: number;
}

/** The slots: which part kind each takes. */
export const SHIP_SLOTS: { id: PartSlot; kind: PartKind; name: string }[] = [
  { id: 'armour', kind: 'armour', name: 'armour' },
  { id: 'shield', kind: 'shield', name: 'shield module' },
  { id: 'port', kind: 'weapon', name: 'port weapon' },
  { id: 'starboard', kind: 'weapon', name: 'starboard weapon' },
  { id: 'booster', kind: 'booster', name: 'boosters' },
  { id: 'warp', kind: 'warp', name: 'warp drive' },
];
export const slotKind = (slot: PartSlot) => SHIP_SLOTS.find((s) => s.id === slot)!.kind;

/** Every part there is, by kind, plainest first. */
export const SHIP_PARTS: ShipPartDef[] = [
  { id: 'scrap_plating', name: 'Scrap Plating', kind: 'armour', rarity: 'dwarf', health: 2, text: '+2 max health on your sun.' },
  { id: 'ceramic_armour', name: 'Ceramic Armour', kind: 'armour', rarity: 'stellar', health: 4, text: '+4 max health on your sun.' },
  { id: 'aegis_hull', name: 'Aegis Hull', kind: 'armour', rarity: 'anomaly', health: 6, walls: 1, text: '+6 max health on your sun. +1 defence on every slot.' },
  { id: 'shield_emitter', name: 'Shield Emitter', kind: 'shield', rarity: 'dwarf', shields: 1, text: 'Start every battle with 1 shield.' },
  { id: 'aegis_projector', name: 'Aegis Projector', kind: 'shield', rarity: 'stellar', shields: 2, text: 'Start every battle with 2 shields.' },
  { id: 'halo_generator', name: 'Halo Generator', kind: 'shield', rarity: 'anomaly', shields: 2, shieldPerTurn: 1, text: 'Start every battle with 2 shields; 1 more every day.' },
  { id: 'pulse_cannon', name: 'Pulse Cannon', kind: 'weapon', rarity: 'dwarf', guns: 1, text: "+1 attack on that side's two slots." },
  { id: 'rail_battery', name: 'Rail Battery', kind: 'weapon', rarity: 'stellar', guns: 1, opening: 1, text: "+1 attack on that side's two slots. Heat 1 on the enemy sun as battle begins." },
  { id: 'nova_lance', name: 'Nova Lance', kind: 'weapon', rarity: 'anomaly', guns: 2, text: "+2 attack on that side's two slots." },
  { id: 'ion_boosters', name: 'Ion Boosters', kind: 'booster', rarity: 'dwarf', cool: 1, text: 'Your sun cools 1 on every jump.' },
  { id: 'fusion_thrusters', name: 'Fusion Thrusters', kind: 'booster', rarity: 'stellar', cool: 2, text: 'Your sun cools 2 on every jump.' },
  { id: 'afterburners', name: 'Afterburners', kind: 'booster', rarity: 'anomaly', cool: 1, march: 1, text: 'One more jump every turn. Your sun cools 1 on every jump.' },
  { id: 'warp_coil', name: 'Warp Coil', kind: 'warp', rarity: 'stellar', warp: 1.5, text: 'Jump to systems close by, linked or not.' },
  { id: 'fold_drive', name: 'Fold Drive', kind: 'warp', rarity: 'anomaly', warp: 2.3, text: 'Jump to systems further off, linked or not.' },
];
export const shipPart = (id: string | undefined) => SHIP_PARTS.find((p) => p.id === id);

/** Which of the ship's slots a part may go in. */
export const partSlots = (id: string): PartSlot[] => {
  const p = shipPart(id);
  return p ? SHIP_SLOTS.filter((s) => s.kind === p.kind).map((s) => s.id) : [];
};

/** What the ship's fitted parts add up to, for a run. */
export interface ShipFit {
  health: number;
  walls: number;
  shields: number;
  shieldPerTurn: number;
  /** Attack on each of the tableau's five slots (port the first two, starboard the last two). */
  guns: number[];
  opening: number;
  cool: number;
  march: number;
  /** The warp drive's reach (0: none). */
  warp: number;
  /** Fitted parts' ids, by slot (for the ship's model). */
  fitted: Partial<Record<PartSlot, string>>;
}

export function shipFit(fitted: Partial<Record<PartSlot, string>> | undefined): ShipFit {
  const out: ShipFit = { health: 0, walls: 0, shields: 0, shieldPerTurn: 0, guns: [0, 0, 0, 0, 0], opening: 0, cool: 0, march: 0, warp: 0, fitted: {} };
  for (const slot of SHIP_SLOTS) {
    const p = shipPart(fitted?.[slot.id]);
    if (!p || p.kind !== slot.kind) continue;
    out.fitted[slot.id] = p.id;
    out.health += p.health ?? 0;
    out.walls += p.walls ?? 0;
    out.shields += p.shields ?? 0;
    out.shieldPerTurn += p.shieldPerTurn ?? 0;
    out.opening += p.opening ?? 0;
    out.cool += p.cool ?? 0;
    out.march += p.march ?? 0;
    out.warp = Math.max(out.warp, p.warp ?? 0);
    if (p.guns) for (const i of slot.id === 'port' ? [0, 1] : [3, 4]) out.guns[i] += p.guns;
  }
  return out;
}

/** The rarity of a part found: better the deeper the run (a boss's, a step better again). */
export function partRarity(universe: number, roll: number, boss = false): PartRarity {
  const lift = universe - 1 + (boss ? 1 : 0);
  const anomaly = Math.min(0.5, 0.08 + 0.12 * lift);
  const stellar = Math.min(0.9, 0.35 + 0.15 * lift);
  return roll < anomaly ? 'anomaly' : roll < anomaly + stellar ? 'stellar' : 'dwarf';
}

/**
 * A part not yet in the hangar, of a rarity (or the nearest there is), or null if every part is had. `pick` chooses
 * among them (a number from 0 to 1).
 */
export function newPart(have: readonly string[], rarity: PartRarity, pick: number): string | null {
  const order: PartRarity[] = rarity === 'anomaly' ? ['anomaly', 'stellar', 'dwarf'] : rarity === 'stellar' ? ['stellar', 'anomaly', 'dwarf'] : ['dwarf', 'stellar', 'anomaly'];
  for (const r of order) {
    const pool = SHIP_PARTS.filter((p) => p.rarity === r && !have.includes(p.id));
    if (pool.length) return pool[Math.floor(pick * pool.length) % pool.length].id;
  }
  return null;
}
