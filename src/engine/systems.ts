import type { SolarSystemDef } from './types';

/**
 * The pool of 8 solar systems. Each player draws one at random.
 * Placeholder content: open for design review.
 */
export const SOLAR_SYSTEMS: SolarSystemDef[] = [
  {
    id: 'helios_reach',
    name: 'Helios Reach',
    flavor: 'A balanced cradle system, adaptable in every way.',
    abilityName: 'Adaptive Coolant',
    abilityText: 'Your first Thermosiphon each turn costs 1 less.',
    planets: [
      { name: 'Aurel', track: 'weapons', level: 0 },
      { name: 'Bastion', track: 'defences', level: 0 },
      { name: 'Coin', track: 'economy', level: 0 },
      { name: 'Delve', track: 'resources', level: 0 },
    ],
    modifiers: { firstThermoDiscount: 1 },
  },
  {
    id: 'vulcan_forge',
    name: 'Vulcan Forge',
    flavor: 'Molten worlds that exist only to build weapons.',
    abilityName: 'Forgefire',
    abilityText: 'Your Solar Flare starts with 1 upgrade.',
    planets: [
      { name: 'Anvil', track: 'weapons', level: 0 },
      { name: 'Crucible', track: 'weapons', level: 0 },
      { name: 'Slagmarket', track: 'economy', level: 0 },
    ],
    modifiers: { startingFlareUpgrades: 1 },
  },
  {
    id: 'aegis_cluster',
    name: 'Aegis Cluster',
    flavor: 'Fortress moons surround a watchful star.',
    abilityName: 'Bulwark',
    abilityText: 'Gain 1 extra shield every turn.',
    planets: [
      { name: 'Rampart', track: 'defences', level: 0 },
      { name: 'Hearth', track: 'resources', level: 0 },
    ],
    modifiers: { shieldBonus: 1 },
  },
  {
    id: 'midas_belt',
    name: 'Midas Belt',
    flavor: 'Asteroid fields thick with rare metals.',
    abilityName: 'Gilded Orbit',
    abilityText: 'Gain 1 extra money every turn.',
    planets: [
      { name: 'Aurum', track: 'economy', level: 1 },
      { name: 'Argent', track: 'economy', level: 0 },
      { name: 'Quarry', track: 'resources', level: 0 },
    ],
    modifiers: { incomeBonus: 1 },
  },
  {
    id: 'cryon_drift',
    name: 'Cryon Drift',
    flavor: 'A dim, ice-bound star far from the galactic core.',
    abilityName: 'Frozen Heart',
    abilityText: 'Your sun starts at -3.',
    planets: [
      { name: 'Rime', track: 'defences', level: 0 },
      { name: 'Glacier', track: 'resources', level: 0 },
      { name: 'Floe', track: 'economy', level: 0 },
    ],
    modifiers: { startingHeat: -3 },
  },
  {
    id: 'tempest_binary',
    name: 'Tempest Binary',
    flavor: 'Twin stars whose chaos breeds swift strategists.',
    abilityName: 'Twin Minds',
    abilityText: 'Draw 1 extra card every turn.',
    planets: [
      { name: 'Castor', track: 'weapons', level: 0 },
      { name: 'Pollux', track: 'resources', level: 0 },
    ],
    modifiers: { handSizeBonus: 1 },
  },
  {
    id: 'obsidian_veil',
    name: 'Obsidian Veil',
    flavor: 'Smugglers hide within a nebula of black glass.',
    abilityName: 'Black Market',
    abilityText: 'Cards in the display cost you 2 less (minimum 1).',
    planets: [
      { name: 'Shroud', track: 'economy', level: 0 },
      { name: 'Glint', track: 'weapons', level: 0 },
      { name: 'Hollow', track: 'defences', level: 0 },
    ],
    modifiers: { marketDiscount: 2 },
  },
  {
    id: 'nova_crown',
    name: 'Nova Crown',
    flavor: 'A furious giant star, harvested at great risk.',
    abilityName: 'Radiant Core',
    abilityText: 'At the start of your turn, gain 1 money for every 3 heat your sun has above 0.',
    planets: [
      { name: 'Corona', track: 'economy', level: 1 },
      { name: 'Pyre', track: 'weapons', level: 0 },
      { name: 'Halo', track: 'defences', level: 0 },
    ],
    modifiers: { heatIncomeEvery: 3 },
  },
];

const BY_ID = new Map(SOLAR_SYSTEMS.map((s) => [s.id, s]));

export function systemDef(id: string): SolarSystemDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown solar system: ${id}`);
  return def;
}
