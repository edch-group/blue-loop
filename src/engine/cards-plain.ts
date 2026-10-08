import type { CardDef, CardKind } from './types';

/**
 * Plain cards: no abilities, just numbers (attack, Sturdy, stability), so most of a deck can be read at a glance.
 * With nothing to pay for in text, each stands better on its numbers than a card of its cost with an ability.
 * Race cards still carry their race's trait (Sting, Sturdy, Darkspeed) and its buffs, as any card of theirs does.
 *
 * Every profile spends the same budget, 2c+2 points of attack, Sturdy and stability at cost c: one point more than
 * a card of its cost with an ability (about 2c+1). Striker c+1 attack, c+1 stability; glass c+2 attack, c stability;
 * brute c attack, c+2 stability; guardian c−1 attack, Sturdy 2, c+1 stability; veteran c attack, Sturdy 1, c+1
 * stability; wall no attack, Sturdy 3 (a Guard by its walls), 2c−1 stability (at least 1).
 */
type Profile = 'striker' | 'glass' | 'brute' | 'guardian' | 'veteran' | 'wall';

function stats(p: Profile, c: number): { attack: number; sturdy: number; health: number } {
  switch (p) {
    case 'striker': return { attack: c + 1, sturdy: 0, health: c + 1 };
    case 'glass': return { attack: c + 2, sturdy: 0, health: Math.max(1, c) };
    case 'brute': return { attack: c, sturdy: 0, health: c + 2 };
    case 'guardian': return { attack: Math.max(0, c - 1), sturdy: 2, health: c + 1 };
    case 'veteran': return { attack: c, sturdy: 1, health: c + 1 };
    case 'wall': return { attack: 0, sturdy: 3, health: Math.max(1, 2 * c - 1) };
  }
}

/** The budget every plain card spends at its cost (attack, Sturdy and stability together), before its race's trait. */
export const plainBudget = (cost: number) => 2 * cost + 2;

/** Which profile each card takes, and its art's look (by its race's figure). */
export const PLAIN_PROFILE: Record<string, Profile> = {};

/**
 * Korrath's trait (Sturdy +2) adds to a card's own numbers, so their plain cards pay for it in full, out of the
 * same budget: a Korrath card never simply beats a neutral one. (Sting and Darkspeed are the race's, not
 * the card's numbers: no cost.)
 */
function traitTax(race: number | undefined, s: { attack: number; sturdy: number; health: number }, profile: Profile) {
  void profile;
  // (Korrath: their trait's Sturdy 2 is paid for in full, from stability (never below 1), then attack, then the card's own Sturdy.)
  if (race === 5) {
    let owe = 2;
    const h = Math.min(owe, s.health - 1);
    s.health -= h;
    owe -= h;
    const a = Math.min(owe, s.attack);
    s.attack -= a;
    owe -= a;
    s.sturdy -= Math.min(owe, s.sturdy);
  }
  return s;
}

function plain(id: string, name: string, race: number | undefined, cost: number, profile: Profile): CardDef {
  const s = traitTax(race, stats(profile, cost), profile);
  PLAIN_PROFILE[id] = profile;
  const kind: CardKind = s.attack > 0 ? 'attack' : 'defence';
  return {
    id, name, kind, cost, race,
    text: s.sturdy ? `{sturdy:${s.sturdy}}.` : '',
    attack: s.attack,
    health: s.health,
    ...(s.sturdy ? { defence: s.sturdy } : {}),
  };
}

/** Cards that were plain all along: given their profile's numbers (in cards.ts, once they are loaded). */
export const PLAIN_EXISTING: Record<string, Profile> = {
  helio_lancer: 'glass',
  plasma_relay: 'veteran',
  dawnstar_cannon: 'veteran',
  dreadnought: 'striker',
  // Cards whose ability was small, conditional or the same as another's: plain now, so there are fewer abilities to read.
  ember_drone: 'striker',
  comet_hail: 'glass',
  chain_of_command: 'guardian',
  aureline_skirmisher: 'striker',
  aureline_vanguard: 'guardian',
  aureline_vesper_knight: 'brute',
  shard_reactor: 'veteran',
  echo_shard: 'striker',
  searing_core: 'brute',
  tidal_bloom: 'guardian',
  hive_warrior: 'striker',
  brood_chamber: 'guardian',
  fruiting_body: 'veteran',
  nyx_shade_stalker: 'striker',
  nyx_dusk_raider: 'brute',
  kor_shieldwall: 'wall',
  kor_iron_sentinel: 'wall',
  ser_stargazer: 'glass',
  pyr_flare_imp: 'striker',
  pyr_cinder_brute: 'brute',
  pyr_ash_walker: 'glass',
  // The second round: cards whose only job was a little cooling or shielding.
  frost_lattice: 'brute',
  glacier_shell: 'wall',
  halo_ward: 'wall',
  prism_vent: 'guardian',
  prism_ward: 'wall',
  tide_lock: 'veteran',
  undertow_shrine: 'wall',
  canopy: 'guardian',
  ixquor_broodguard: 'wall',
  thorn_hedge: 'wall',
  husk_shell: 'veteran',
  kor_bastion_kin: 'brute',
  ser_orrery_keeper: 'guardian',
  pyr_heat_bloom: 'guardian',
};

/** A plain card's numbers, by its profile, race and cost (the trait's cost taken off). */
export function plainStats(profile: Profile, race: number | undefined, cost: number) {
  return traitTax(race, stats(profile, cost), profile);
}

export const PLAIN_CARDS: CardDef[] = [
  // ---- Aureline: lancers and paladins ----
  plain('p_sunlance_cadet', 'Sunlance Cadet', 0, 1, 'striker'),
  plain('p_gilded_vanguard', 'Gilded Vanguard', 0, 2, 'veteran'),
  plain('p_dawn_lancer', 'Dawn Lancer', 0, 3, 'striker'),
  plain('p_solar_paladin', 'Solar Paladin', 0, 4, 'veteran'),
  plain('p_radiant_champion', 'Radiant Champion', 0, 5, 'striker'),
  // ---- Xel'Naru: hard-hitting and brittle ----
  plain('p_shard_mote', 'Shard Mote', 1, 1, 'glass'),
  plain('p_prism_blade', 'Prism Blade', 1, 2, 'glass'),
  plain('p_crystal_reaver', 'Crystal Reaver', 1, 3, 'striker'),
  plain('p_lattice_spear', 'Lattice Spear', 1, 4, 'glass'),
  plain('p_fracture_titan', 'Fracture Titan', 1, 5, 'glass'),
  // ---- Vorthane: guardians of the reef ----
  plain('p_bell_sentry', 'Bell Sentry', 2, 1, 'wall'),
  plain('p_reef_hulk', 'Reef Hulk', 2, 2, 'brute'),
  plain('p_coral_bulwark', 'Coral Bulwark', 2, 3, 'veteran'),
  plain('p_deep_wall', 'Deep Wall', 2, 4, 'wall'),
  plain('p_abyssal_guardian', 'Abyssal Guardian', 2, 5, 'brute'),
  // ---- Ixquor: hard to kill ----
  plain('p_brood_drone', 'Brood Drone', 3, 1, 'brute'),
  plain('p_chitin_hulk', 'Chitin Hulk', 3, 2, 'brute'),
  plain('p_hive_lancer', 'Hive Lancer', 3, 3, 'striker'),
  plain('p_carapace_beast', 'Carapace Beast', 3, 4, 'brute'),
  plain('p_hive_behemoth', 'Hive Behemoth', 3, 5, 'brute'),
  // ---- Nyxari: quick blades from the dark ----
  plain('p_shade_wisp', 'Shade Wisp', 4, 1, 'glass'),
  plain('p_night_blade', 'Night Blade', 4, 2, 'striker'),
  plain('p_void_lancer', 'Void Lancer', 4, 3, 'glass'),
  plain('p_umbral_knight', 'Umbral Knight', 4, 4, 'striker'),
  plain('p_eclipse_reaver', 'Eclipse Reaver', 4, 5, 'glass'),
  // ---- Korrath: iron and more iron ----
  plain('p_anvil_guard', 'Anvil Guard', 5, 1, 'veteran'),
  plain('p_iron_bulwark', 'Iron Bulwark', 5, 2, 'guardian'),
  plain('p_forge_knight', 'Forge Knight', 5, 3, 'striker'),
  plain('p_steel_bastion', 'Steel Bastion', 5, 4, 'guardian'),
  plain('p_iron_colossus', 'Iron Colossus', 5, 5, 'veteran'),
  // ---- Seren: steady star-riders ----
  plain('p_star_acolyte', 'Star Acolyte', 6, 1, 'veteran'),
  plain('p_comet_rider', 'Comet Rider', 6, 2, 'striker'),
  plain('p_orbit_keeper', 'Orbit Keeper', 6, 3, 'veteran'),
  plain('p_nova_lancer', 'Nova Lancer', 6, 4, 'striker'),
  plain('p_astral_sentinel', 'Astral Sentinel', 6, 5, 'veteran'),
  // ---- Pyrr: all fire ----
  plain('p_ember_wisp', 'Ember Wisp', 7, 1, 'glass'),
  plain('p_flame_brawler', 'Flame Brawler', 7, 2, 'striker'),
  plain('p_blaze_reaver', 'Blaze Reaver', 7, 3, 'glass'),
  plain('p_inferno_knight', 'Inferno Knight', 7, 4, 'striker'),
  plain('p_sun_ravager', 'Sun Ravager', 7, 5, 'striker'),
  // ---- Neutral: walls and haulers ----
  plain('p_barrier_drone', 'Barrier Drone', undefined, 1, 'wall'),
  plain('p_blockade_hulk', 'Blockade Hulk', undefined, 2, 'wall'),
  plain('p_freight_hauler', 'Freight Hauler', undefined, 3, 'brute'),
  plain('p_escort_frigate', 'Escort Frigate', undefined, 4, 'guardian'),
  plain('p_star_fortress', 'Star Fortress', undefined, 5, 'wall'),
];
