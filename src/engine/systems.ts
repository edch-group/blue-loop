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
    drawbackText: 'Your max health is 1 lower.',
    planets: [
      { name: 'Aurel', track: 'weapons', level: 0 },
      { name: 'Bastion', track: 'defences', level: 0 },
      { name: 'Coin', track: 'economy', level: 0 },
      { name: 'Delve', track: 'resources', level: 0 },
    ],
    modifiers: { firstThermoDiscount: 1, maxHealthDelta: -1 },
  },
  {
    id: 'vulcan_forge',
    name: 'Vulcan Forge',
    flavor: 'Molten worlds that exist only to build weapons.',
    abilityName: 'Forgefire',
    abilityText: 'Your Solar Flare starts with 1 upgrade.',
    drawbackText: 'Your max health is 2 lower.',
    planets: [
      { name: 'Anvil', track: 'weapons', level: 0 },
      { name: 'Crucible', track: 'weapons', level: 0 },
      { name: 'Slagmarket', track: 'economy', level: 0 },
    ],
    modifiers: { startingFlareUpgrades: 1, maxHealthDelta: -2 },
  },
  {
    id: 'aegis_cluster',
    name: 'Aegis Cluster',
    flavor: 'Fortress moons surround a watchful star.',
    abilityName: 'Bulwark',
    abilityText: 'Gain 1 extra shield every turn.',
    drawbackText: 'Thermosiphon costs 1 more.',
    planets: [
      { name: 'Rampart', track: 'defences', level: 0 },
      { name: 'Hearth', track: 'resources', level: 0 },
    ],
    modifiers: { shieldBonus: 1, thermoCostDelta: 1 },
  },
  {
    id: 'midas_belt',
    name: 'Midas Belt',
    flavor: 'Asteroid fields thick with rare metals.',
    abilityName: 'Gilded Orbit',
    abilityText: 'Gain 1 extra money every turn.',
    drawbackText: 'Solar Flare costs 1 more.',
    planets: [
      { name: 'Aurum', track: 'economy', level: 1 },
      { name: 'Argent', track: 'economy', level: 0 },
      { name: 'Quarry', track: 'resources', level: 0 },
    ],
    modifiers: { incomeBonus: 1, flareCostDelta: 1 },
  },
  {
    id: 'cryon_drift',
    name: 'Cryon Drift',
    flavor: 'A dim, ice-bound star far from the galactic core.',
    abilityName: 'Frozen Heart',
    abilityText: 'Your sun starts at -10, as cold as a sun can be.',
    drawbackText: 'Thaw: your sun heats by 2 at the start of each of your turns.',
    planets: [
      { name: 'Rime', track: 'defences', level: 0 },
      { name: 'Glacier', track: 'resources', level: 0 },
      { name: 'Floe', track: 'economy', level: 0 },
    ],
    modifiers: { startingHeat: -10, thawPerTurn: 2 },
  },
  {
    id: 'tempest_binary',
    name: 'Tempest Binary',
    flavor: 'Twin stars whose chaos breeds swift strategists.',
    abilityName: 'Twin Minds',
    abilityText: 'Draw 1 extra card every turn.',
    drawbackText: 'Your max health is 2 lower.',
    planets: [
      { name: 'Castor', track: 'weapons', level: 0 },
      { name: 'Pollux', track: 'resources', level: 0 },
    ],
    modifiers: { handSizeBonus: 1, maxHealthDelta: -2 },
  },
  {
    id: 'obsidian_veil',
    name: 'Obsidian Veil',
    flavor: 'Smugglers hide within a nebula of black glass.',
    abilityName: 'Black Market',
    abilityText: 'Cards in the display cost you 1 less (minimum 1).',
    drawbackText: 'Your hand size is fixed at 5: planets and rewards cannot raise it.',
    planets: [
      { name: 'Shroud', track: 'economy', level: 0 },
      { name: 'Glint', track: 'weapons', level: 0 },
      { name: 'Hollow', track: 'defences', level: 0 },
    ],
    modifiers: { marketDiscount: 1, handSizeCap: 5 },
  },
  {
    id: 'nova_crown',
    name: 'Nova Crown',
    flavor: 'A furious giant star, harvested at great risk.',
    abilityName: 'Radiant Core',
    abilityText: 'At the start of your turn, gain 1 money for every 3 heat your sun has above 0.',
    drawbackText: 'Your max health is 2 lower.',
    planets: [
      { name: 'Corona', track: 'economy', level: 1 },
      { name: 'Pyre', track: 'weapons', level: 0 },
      { name: 'Halo', track: 'defences', level: 0 },
    ],
    modifiers: { heatIncomeEvery: 3, maxHealthDelta: -2 },
  },
];

const BY_ID = new Map(SOLAR_SYSTEMS.map((s) => [s.id, s]));

export function systemDef(id: string): SolarSystemDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown solar system: ${id}`);
  return def;
}
