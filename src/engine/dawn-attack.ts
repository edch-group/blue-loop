/**
 * Dawn heat became attack: a card's plain dawn heat at the rival is now that much more attack (struck at a card
 * or the sun, by choice, each day; a Guard drawing it), and what scaled or depended on something stays a dawn
 * effect. These are the cards' texts with the plain dawn heat taken out (cards.ts applies them with the change).
 * (Fusion grafts keep their dawn heat: their host gains their dawn effects, not their attack.)
 */
export const DAWN_ATTACK_TEXT: Record<string, string> = {
  plasma_relay: '{sturdy:1}.',
  solar_battery: '{dawn}: with 3+ attack cards, {heat:1}.',
  helio_lancer: '',
  overload_core: '{dawn}: while {overheated}, {heat:2}.',
  abyssal_choir: '{dawn}: {heat:1} per 2 shields you have (up to 5).',
  spore_cloud: '{dawn}: with 4+ cards, {heat:2}.',
  aureline_war_herald: '{dawn}: {heat:1} per attack card next to this.',
  sunforge: '{forge:1}.',
  aurelia_first_light: '{dawn}: {heat:1} per 2 attack cards you control (up to 3).',
  the_brood_queen: '{plays:1}. {dawn}: with 4+ cards, {heat:2}.',
  perihelion_forge: '{dawn}: {heat:2} while facing the industrial planet.',
  ember_drone: 'When this leaves your tableau, {heat:1}.',
  siege_array: '{dawn}: {heat:1} per 3 attack cards (up to 2).',
  comet_hail: '{dawn}: {heat:1} while facing the industrial planet.',
  absolute_zero: '{cool:2}. {dawn}: {thermosiphon} {heat:1}.',
  aureline_skirmisher: '{heat:1}.',
  aureline_archon: '{dawn}: with a Hero, {heat:1}.',
  aureline_vanguard: '{sturdy:1}. {shield:1}.',
  riptide: '{dawn}: {heat:1} per 3 shields you have (up to 3).',
  hive_warrior: '{dawn}: with 4+ cards, {heat:1}.',
  creeping_vines: '{erode:2}.',
  dawnstar_cannon: '{sturdy:1}.',
  hymn_of_the_sun: '{heat:2}. {dawn}: {heat:1} per 2 attack cards you control (up to 4).',
  hive_colossus: '{dawn}: {heat:1} per 2 cards you control (up to 5).',
  dreadnought: '{sturdy:2}.',
  nyx_night_ambush: '{lightspeed} for 1 more energy: when an enemy attacks one of your cards (or aims heat at it), cancel that and {heat:2} to them.',
  nyx_shade_stalker: '{sting:1}.',
  nyx_dusk_raider: '{dawn}: with 3+ Nyxari cards, {heat:1}.',
  nyx_unmaker_blade: '{destroy:1}.',
  nyx_hollow_reaper: '{destroy:2}. {dawn}: {heat:1} per 2 Unmaker cards (up to 2).',
  kor_siege_ram: '{heat:1}. {sturdy:4}. {dawn}: {heat:1} per 4 defence on your cards (up to 2).',
  ser_stargazer: '{attune}.',
  pyr_flare_imp: '{dawn}: while {overheated}, {heat:1}.',
  pyr_cinder_brute: '{dawn}: {heat:1} to your sun.',
  pyr_ash_walker: '{dawn}: while {overheated}, {heat:2}.',
  pyr_solar_tyrant: '{dawn}: while {overheated}, {heat:2}. {heat:1} to your sun.',
  black_sun: '{sturdy:3}.',
};

/**
 * Attack added on top (or taken off): for cards whose dawn heat alone left them beaten outright by another card at
 * their cost, Deep Tide's shield attackers, and the Aureline stars a point down (Forge stacks on attack).
 */
export const DAWN_ATTACK_EXTRA: Record<string, number> = {
  sunforge: 1, overload_core: 1, kor_siege_ram: -1, aureline_skirmisher: 1, ser_stargazer: 1, pyr_ash_walker: 1, pyr_cinder_brute: 2, pyr_solar_tyrant: 2,
  riptide: 1, abyssal_choir: 1, aureline_archon: -1, aurelia_first_light: -1, aureline_war_herald: -1,
};
