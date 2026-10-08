import { act, hero } from './heroes-battle';
import type { CardDef } from './types';

/**
 * The four newer races, each split into sub-races (races.ts). Every card carries its race's bonus and
 * nerf (races.ts RACE_TRAITS); buff cards and Heroes name a race or a sub-race, so a card can read very
 * differently by the company it keeps.
 *
 * - Nyxari (4), void-stalkers: Veilwalkers set Lightspeed traps, Unmakers take the rival's board apart, and the
 *   Blood Cult consume their own (cards that pay off as they leave play).
 * - Korrath (5), forge-smiths: Forgeborn hammer grafts onto each other, Bastion-kin hold the line.
 * - Seren (6), star-readers: Tidecasters move the planets, Seers read them (draw, recover, attunement).
 * - Pyrr (7), flare-born: Flarekin spend everything in one burst, Cinderborn run their own sun hot.
 */
export const RACE_CARDS: CardDef[] = [
  // ---------------- Nyxari ----------------
  // Veilwalkers
  {
    // Veilwalker traps: each works in your tableau too, or set face down (1 more energy) to spring.
    id: 'nyx_umbral_snare', name: 'Umbral Snare', kind: 'defence', race: 4, sub: 'veilwalker', cost: 1,
    text: '{sting:1}. {dawn}: {shield:1}. {lightspeed} for 1 more energy: when an enemy plays an attack card, first {shield:2} and {heat:2} to them.',
    onTurn: [{ type: 'shield', amount: 1 }], passive: [{ type: 'retaliate', amount: 1 }],
    lightspeed: { trigger: { on: 'enemyPlays', kind: 'attack' }, effects: [{ type: 'shield', amount: 2 }, { type: 'heat', amount: 2, to: 'target' }] },
  },
  {
    id: 'nyx_mirror_veil', name: 'Mirror Veil', kind: 'defence', race: 4, sub: 'veilwalker', cost: 1,
    text: "{dawn}: {shield:2}. {lightspeed} for 1 more energy: when an enemy's card would heat your sun by 2 or more, cancel that.",
    onTurn: [{ type: 'shield', amount: 2 }],
    lightspeed: { trigger: { on: 'heated', min: 2 }, counter: true },
  },
  {
    id: 'nyx_night_ambush', name: 'Night Ambush', kind: 'attack', race: 4, sub: 'veilwalker', cost: 1, character: true,
    text: '{dawn}: {heat:1}. {lightspeed} for 1 more energy: when an enemy attacks one of your cards (or aims heat at it), cancel that and {heat:2} to them.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }],
    lightspeed: { trigger: { on: 'cardAttacked' }, counter: true, effects: [{ type: 'heat', amount: 2, to: 'target' }] },
  },
  {
    id: 'nyx_null_shroud', name: 'Null Shroud', kind: 'lightspeed', race: 4, sub: 'veilwalker', cost: 1, rarity: 'stellar',
    text: '{lightspeed}. When an enemy plays a Hero, cancel it. Draw 1.',
    lightspeed: { trigger: { on: 'enemyPlays', kind: 'command' }, counter: true, effects: [{ type: 'draw', amount: 1 }] },
  },
  {
    id: 'nyx_veil_sentry', name: 'Veil Sentry', kind: 'defence', race: 4, sub: 'veilwalker', cost: 2,
    text: '{guard}. {sting:2}. {dawn}: {shield:1}. {lightspeed} for 1 more energy: springs into your tableau to take an attack or heat aimed at your cards.',
    onTurn: [{ type: 'shield', amount: 1 }], passive: [{ type: 'taunt' }, { type: 'retaliate', amount: 2 }], lightspeed: { trigger: { on: 'cardAttacked' }, deploy: true },
  },
  {
    id: 'nyx_gloom_warden', name: 'Gloom Warden', kind: 'defence', race: 4, sub: 'veilwalker', cost: 2, character: true,
    text: '{guard}. {sting:3}.',
    passive: [{ type: 'taunt' }, { type: 'retaliate', amount: 3 }],
  },
  {
    id: 'nyx_veil_lantern', name: 'Veil Lantern', kind: 'growth', race: 4, sub: 'veilwalker', cost: 1,
    text: 'Your Veilwalker cards {shield:+1}. {dawn}: {shield:1}.',
    onTurn: [{ type: 'shield', amount: 1 }], passive: [{ type: 'kindBonus', sub: 'veilwalker', stat: 'shield', amount: 1 }],
  },
  // Unmakers
  {
    id: 'nyx_shade_stalker', name: 'Shade Stalker', kind: 'attack', race: 4, sub: 'unmaker', cost: 1, character: true,
    text: '{dawn}: {heat:1}. {sting:1}.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }], passive: [{ type: 'retaliate', amount: 1 }],
  },
  {
    id: 'nyx_dusk_raider', name: 'Dusk Raider', kind: 'attack', race: 4, sub: 'unmaker', cost: 2,
    text: '{dawn}: {heat:1}. {heat:+1} with 3+ Nyxari cards.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'heat', amount: 1, to: 'target', if: { minRace: 4, n: 3 } }],
  },
  {
    id: 'nyx_unmaker_blade', name: 'Unmaker Blade', kind: 'attack', race: 4, sub: 'unmaker', cost: 2,
    text: '{destroy:1}. {dawn}: {heat:1}.',
    onPlay: [{ type: 'destroy', maxDefence: 1 }], onTurn: [{ type: 'heat', amount: 1, to: 'target' }],
  },
  {
    id: 'nyx_void_rend', name: 'Void Rend', kind: 'attack', race: 4, sub: 'unmaker', cost: 1,
    text: '{erode:2}. Draw 1.',
    onPlay: [{ type: 'erode', amount: 2 }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'nyx_umbral_drift', name: 'Umbral Drift', kind: 'growth', race: 4, sub: 'veilwalker', cost: 1,
    text: '{displace}. Draw 1.',
    onPlay: [{ type: 'shift', enemy: true }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'nyx_unravel', name: 'Unravel', kind: 'attack', race: 4, sub: 'unmaker', cost: 2,
    text: '{eject:2}. {heat:2}.',
    onPlay: [{ type: 'bounce', maxDefence: 2 }, { type: 'heat', amount: 2, to: 'target' }],
  },
  {
    id: 'nyx_phantom_strike', name: 'Phantom Strike', kind: 'attack', race: 4, cost: 1,
    text: '{heat:2}. {heat:+2} with 3+ Nyxari cards.',
    onPlay: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'heat', amount: 2, to: 'target', if: { minRace: 4, n: 3 } }],
  },
  {
    id: 'nyx_hollow_reaper', name: 'Hollow Reaper', kind: 'attack', race: 4, sub: 'unmaker', cost: 3, rarity: 'stellar', character: true,
    text: '{destroy:2}. {dawn}: {heat:1}. {heat:+1} per 2 Unmaker cards (up to 2).',
    onPlay: [{ type: 'destroy', maxDefence: 2 }], onTurn: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'race', race: 4, sub: 'unmaker', per: 2 }, max: 2 }],
  },
  {
    id: 'nyx_shadow_court', name: 'Shadow Court', kind: 'growth', race: 4, cost: 1, rarity: 'stellar',
    text: 'Your Unmaker cards {heat:+1}. Draw 1.',
    onPlay: [{ type: 'draw', amount: 1 }], passive: [{ type: 'kindBonus', sub: 'unmaker', amount: 1 }],
  },
  {
    id: 'nyx_eclipse_rite', name: 'Eclipse Rite', kind: 'growth', race: 4, cost: 1,
    text: 'Draw 3. {heat:2} to your sun.',
    onPlay: [{ type: 'draw', amount: 3 }, { type: 'selfHeat', amount: 2 }],
  },
  // Heroes
  hero(
    { id: 'nyx_hero_vesh', name: 'Shade-Queen Vesh', race: 4, sub: 'veilwalker', character: true, cost: 2, stability: 5, lead: 'Your Veilwalker cards {shield:+1}. {dawn}: {shield:1}.', onTurn: [{ type: 'shield', amount: 1 }], passive: [{ type: 'kindBonus', sub: 'veilwalker', stat: 'shield', amount: 1, others: true }] },
    [act('veil', 'Veil', '{shield:3}.', [{ type: 'shield', amount: 3 }]), act('whisper', 'Whisper', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
  ),
  hero(
    { id: 'nyx_hero_kael', name: 'Unmaker Kael', race: 4, sub: 'unmaker', character: true, rarity: 'stellar', cost: 3, stability: 5, lead: 'Your Unmaker cards {heat:+1}.', passive: [{ type: 'kindBonus', sub: 'unmaker', amount: 1, others: true }] },
    [act('rend', 'Rend', '{heat:2}, {pierce}.', [{ type: 'heat', amount: 2, to: 'target', pierce: true }], { stability: 1 }), act('fade', 'Fade', '{shield:2}. He regains 1 stability.', [{ type: 'shield', amount: 2 }, { type: 'restore', amount: 1, self: true }])],
  ),
  hero(
    { id: 'nyx_hero_nyxara', name: 'Nyxara, the Unlit', race: 4, character: true, rarity: 'anomaly', cost: 4, stability: 7, lead: '{destroy:3}. Your Nyxari cards {heat:+1}.', onPlay: [{ type: 'destroy', maxDefence: 3 }], passive: [{ type: 'kindBonus', race: 4, amount: 1, others: true }] },
    [act('eclipse', 'Eclipse', '{heat:3}, {pierce}.', [{ type: 'heat', amount: 3, to: 'target', pierce: true }], { sacrifice: true }), act('vanish', 'Vanish', 'Draw 2.', [{ type: 'draw', amount: 2 }])],
  ),

  // Blood Cult: Consume cards give up one of your own cards to play; the rest pay off as they leave play, or
  // whenever another of yours does.
  {
    id: 'bc_blood_offering', name: 'Blood Offering', kind: 'growth', race: 4, sub: 'bloodcult', cost: 0, consume: true,
    text: '{consume}. Draw 2.',
    onPlay: [{ type: 'draw', amount: 2 }],
  },
  {
    id: 'bc_crimson_rite', name: 'Crimson Rite', kind: 'attack', race: 4, sub: 'bloodcult', cost: 1, consume: true,
    text: '{consume}. {heat:5}.',
    onPlay: [{ type: 'heat', amount: 5, to: 'target' }],
  },
  {
    id: 'bc_bloodfeast', name: 'Bloodfeast', kind: 'growth', race: 4, sub: 'bloodcult', cost: 1, consume: true,
    text: '{consume}. {energy:2}.',
    onPlay: [{ type: 'plays', amount: 2 }],
  },
  {
    id: 'bc_exsanguinate', name: 'Exsanguinate', kind: 'attack', race: 4, sub: 'bloodcult', cost: 2, consume: true, rarity: 'stellar',
    text: '{consume}. {destroy:3}.',
    onPlay: [{ type: 'destroy', maxDefence: 3 }],
  },
  {
    id: 'bc_blood_thrall', name: 'Blood Thrall', kind: 'attack', race: 4, sub: 'bloodcult', cost: 1, character: true,
    text: 'When this leaves your tableau, {heat:3}.',
    onLeave: [{ type: 'heat', amount: 3, to: 'target' }],
  },
  {
    id: 'bc_willing_vessel', name: 'Willing Vessel', kind: 'growth', race: 4, sub: 'bloodcult', cost: 1, character: true,
    text: '{dusk}: {cool:1}. When this leaves your tableau, draw 2.',
    onDusk: [{ type: 'cool', amount: 1 }], onLeave: [{ type: 'draw', amount: 2 }],
  },
  {
    id: 'bc_martyrs_chalice', name: "Martyr's Chalice", kind: 'defence', race: 4, sub: 'bloodcult', cost: 1,
    text: 'When this leaves your tableau, {shield:4}.',
    onLeave: [{ type: 'shield', amount: 4 }],
  },
  {
    id: 'bc_sanguine_priest', name: 'Sanguine Priest', kind: 'defence', race: 4, sub: 'bloodcult', cost: 2, character: true,
    text: '{guard}. When another of your cards leaves your tableau, {cool:1}.',
    passive: [{ type: 'taunt' }, { type: 'allyLeaves', effects: [{ type: 'cool', amount: 1 }] }],
  },
  {
    id: 'bc_hemomancer', name: 'Hemomancer', kind: 'attack', race: 4, sub: 'bloodcult', cost: 2, character: true, rarity: 'stellar',
    text: 'When another of your cards leaves your tableau, {heat:2}.',
    passive: [{ type: 'allyLeaves', effects: [{ type: 'heat', amount: 2, to: 'target' }] }],
  },
  hero(
    {
      id: 'bc_hero_sanguis', name: 'Sanguis, the Blood Saint', race: 4, sub: 'bloodcult', character: true, rarity: 'stellar', cost: 3, stability: 6,
      lead: 'When another of your cards leaves your tableau, she regains 1 stability.',
      passive: [{ type: 'allyLeaves', effects: [{ type: 'restore', amount: 1, self: true }] }],
    },
    [act('communion', 'Communion', 'Draw 2.', [{ type: 'draw', amount: 2 }], { sacrifice: true }), act('bloodletting', 'Bloodletting', '{heat:3}.', [{ type: 'heat', amount: 3, to: 'target' }], { stability: 1 })],
  ),

  // ---------------- Korrath ----------------
  // Forgeborn
  {
    id: 'kor_rivet_graft', name: 'Rivet Graft', kind: 'defence', race: 5, sub: 'forgeborn', cost: 1, fusion: true,
    text: '{fusion}. {sturdy:3}.',
    defence: 3,
  },
  {
    id: 'kor_slag_graft', name: 'Slag Graft', kind: 'attack', race: 5, sub: 'forgeborn', cost: 2, fusion: true,
    text: '{fusion}. {dawn}: {heat:1}. {heat:+1} per 4 defence on your cards (up to 3).',
    onTurn: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'defence', per: 4 }, max: 3 }],
  },
  {
    id: 'kor_anvil_graft', name: 'Anvil Graft', kind: 'defence', race: 5, sub: 'forgeborn', cost: 2, fusion: true,
    text: '{fusion}. {dawn}: {shield:1}. {dusk}: {cool:1}.',
    onTurn: [{ type: 'shield', amount: 1 }], onDusk: [{ type: 'cool', amount: 1 }],
  },
  {
    id: 'kor_forge_hammer', name: 'Forge Hammer', kind: 'attack', race: 5, sub: 'forgeborn', cost: 2,
    text: '{forge:1}. {sturdy:1}.',
    defence: 1, passive: [{ type: 'adjacent', amounts: [1], kind: 'attack' }],
  },
  {
    id: 'kor_master_smith', name: 'Korrath Master-Smith', kind: 'growth', race: 5, sub: 'forgeborn', cost: 2, rarity: 'stellar', character: true,
    text: 'Your Forgeborn cards {heat:+1}. {dawn}: {repair:1}.',
    onTurn: [{ type: 'repair', amount: 1 }], passive: [{ type: 'kindBonus', sub: 'forgeborn', amount: 1, others: true }],
  },
  {
    id: 'kor_ore_hauler', name: 'Ore Hauler', kind: 'growth', race: 5, sub: 'forgeborn', cost: 2,
    text: '{plays:1}. {sturdy:2}. {dawn}: {heat:2} to your sun.',
    defence: 2, onTurn: [{ type: 'selfHeat', amount: 2 }], passive: [{ type: 'extraPlay', amount: 1 }],
  },
  // Bastion-kin
  {
    id: 'kor_rotation', name: 'Wall Rotation', kind: 'defence', race: 5, sub: 'bastionkin', cost: 1,
    text: '{shift}. {repair:3}.',
    onPlay: [{ type: 'shift' }, { type: 'repair', amount: 3 }],
  },
  {
    id: 'kor_shieldwall', name: 'Shieldwall', kind: 'defence', race: 5, sub: 'bastionkin', cost: 1,
    text: '{guard}. {sturdy:2}.',
    defence: 2, passive: [{ type: 'taunt' }],
  },
  {
    id: 'kor_bastion_kin', name: 'Bastion-kin Shieldbearer', kind: 'defence', race: 5, sub: 'bastionkin', cost: 2, character: true,
    text: '{guard}. {bulwark:1}. {dawn}: {shield:1}.',
    onTurn: [{ type: 'shield', amount: 1 }], passive: [{ type: 'taunt' }, { type: 'guard', amounts: [1] }],
  },
  {
    id: 'kor_iron_sentinel', name: 'Iron Sentinel', kind: 'defence', race: 5, sub: 'bastionkin', cost: 2,
    text: '{guard}. {sting:2}. {sturdy:1}.',
    defence: 1, passive: [{ type: 'taunt' }, { type: 'retaliate', amount: 2 }],
  },
  {
    id: 'kor_rampart_lord', name: 'Rampart Lord', kind: 'defence', race: 5, sub: 'bastionkin', cost: 3, rarity: 'stellar', character: true,
    text: '{guard}. {sturdy:2}. {bulwark:2/1}. Your Bastion-kin cards {shield:+1}. {dawn}: {shield:1}.',
    defence: 2, onTurn: [{ type: 'shield', amount: 1 }], passive: [{ type: 'taunt' }, { type: 'guard', amounts: [2, 1] }, { type: 'kindBonus', sub: 'bastionkin', stat: 'shield', amount: 1 }],
  },
  {
    id: 'kor_siege_ram', name: 'Siege Ram', kind: 'attack', race: 5, cost: 3,
    text: '{heat:1}. {sturdy:2}. {dawn}: {heat:1}. {heat:+1} per 4 defence on your cards (up to 2).',
    defence: 2, onPlay: [{ type: 'heat', amount: 1, to: 'target' }], onTurn: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'defence', per: 4 }, max: 2 }],
  },
  {
    id: 'kor_foundry', name: 'Deep Foundry', kind: 'growth', race: 5, cost: 2,
    text: '{dawn}: {repair:2}. {dusk}: {cool:1}.',
    onTurn: [{ type: 'repair', amount: 2 }], onDusk: [{ type: 'cool', amount: 1 }],
  },
  {
    id: 'kor_molten_pour', name: 'Molten Pour', kind: 'attack', race: 5, cost: 1,
    text: '{heat:1}. {heat:+1} per 4 defence on your cards (up to 3). {repair:1}.',
    onPlay: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'defence', per: 4 }, max: 3 }, { type: 'repair', amount: 1 }],
  },
  {
    id: 'kor_temper', name: 'Temper', kind: 'defence', race: 5, cost: 1,
    text: '{repair:3}. {shield:1}.',
    onPlay: [{ type: 'repair', amount: 3 }, { type: 'shield', amount: 1 }],
  },
  // Heroes
  hero(
    { id: 'kor_hero_durga', name: 'Forgemother Durga', race: 5, sub: 'forgeborn', character: true, cost: 2, stability: 5, lead: '{dawn}: {repair:1}.', onTurn: [{ type: 'repair', amount: 1 }] },
    [act('temper', 'Temper', '{shield:2}. She regains 1 stability.', [{ type: 'shield', amount: 2 }, { type: 'restore', amount: 1, self: true }]), act('quench', 'Quench', '{cool:2}.', [{ type: 'cool', amount: 2 }])],
  ),
  hero(
    { id: 'kor_hero_brannoc', name: 'Warden Brannoc', race: 5, sub: 'bastionkin', character: true, rarity: 'stellar', cost: 3, stability: 6, lead: 'Your Bastion-kin cards {shield:+1}.', passive: [{ type: 'kindBonus', sub: 'bastionkin', stat: 'shield', amount: 1, others: true }] },
    [act('holdline', 'Hold the Line', '{shield:3}.', [{ type: 'shield', amount: 3 }]), act('counterblow', 'Counter-blow', '{heat:1} per 2 shields you have (up to 3).', [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'shields', per: 2 }, max: 3 }], { stability: 1 })],
  ),
  hero(
    { id: 'kor_hero_anvil_king', name: 'The Anvil-King', race: 5, character: true, rarity: 'anomaly', cost: 4, stability: 8, lead: '{repair:4}. Your Korrath cards {heat:+1}.', onPlay: [{ type: 'repair', amount: 4 }], passive: [{ type: 'kindBonus', race: 5, amount: 1, others: true }] },
    [act('hammerfall', 'Hammerfall', '{heat:4}.', [{ type: 'heat', amount: 4, to: 'target' }], { sacrifice: true }), act('reforge', 'Reforge', '{renew:1}. He regains 2 stability.', [{ type: 'restore', amount: 1, all: true }, { type: 'restore', amount: 2, self: true }])],
  ),

  // ---------------- Seren ----------------
  // Tidecasters
  {
    id: 'ser_astral_lance', name: 'Astral Lance', kind: 'attack', race: 6, sub: 'tidecaster', cost: 2,
    text: 'Your {orbit:+1}. {attune}.',
    onPlay: [{ type: 'orbit', amount: 1, who: 'self' }], attune: 1,
  },
  {
    id: 'ser_tide_turner', name: 'Tide-Turner', kind: 'growth', race: 6, sub: 'tidecaster', cost: 1, character: true,
    text: 'Your {orbit:+2}. {cool:2}.',
    onPlay: [{ type: 'orbit', amount: 2, who: 'self' }, { type: 'cool', amount: 2 }],
  },
  {
    id: 'ser_planet_shepherd', name: 'Planet Shepherd', kind: 'growth', race: 6, sub: 'tidecaster', cost: 2,
    text: '{dawn}: your {orbit:+1}. {shield:1}.',
    onTurn: [{ type: 'orbit', amount: 1, who: 'self' }, { type: 'shield', amount: 1 }],
  },
  {
    id: 'ser_eclipse_caster', name: 'Eclipse Caster', kind: 'growth', race: 6, sub: 'tidecaster', cost: 1,
    text: "Your rival's {orbit:−2}. Draw 1.",
    onPlay: [{ type: 'orbit', amount: -2, who: 'rival' }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'ser_twin_moons', name: 'Twin Moons', kind: 'defence', race: 6, sub: 'tidecaster', cost: 2,
    text: '{guard}. {dawn}: {shield:1}. {attune}.',
    onTurn: [{ type: 'shield', amount: 1 }], passive: [{ type: 'taunt' }], attune: 1,
  },
  // Seers
  {
    id: 'ser_realignment', name: 'Realignment', kind: 'growth', race: 6, sub: 'seer', cost: 2,
    text: '{shift}. {cool:3}. Draw 1.',
    onPlay: [{ type: 'shift' }, { type: 'cool', amount: 3 }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'ser_star_chart', name: 'Sky Chart', kind: 'growth', race: 6, sub: 'seer', cost: 1,
    text: 'Draw 1. {attune}.',
    onPlay: [{ type: 'draw', amount: 1 }], attune: 1,
  },
  {
    id: 'ser_orrery_keeper', name: 'Orrery Keeper', kind: 'defence', race: 6, sub: 'seer', cost: 2, character: true,
    text: '{dusk}: {cool:1}. {attune}.',
    onDusk: [{ type: 'cool', amount: 1 }], attune: 1,
  },
  {
    id: 'ser_stargazer', name: 'Stargazer', kind: 'attack', race: 6, sub: 'seer', cost: 2,
    text: '{dawn}: {heat:1}. {attune}.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }], attune: 1,
  },
  {
    id: 'ser_oracle', name: 'Seren Oracle', kind: 'growth', race: 6, sub: 'seer', cost: 2, rarity: 'stellar', character: true,
    text: '{dawn}: with 3+ Seren cards, draw 1. {attune}.',
    onTurn: [{ type: 'draw', amount: 1, if: { minRace: 6, n: 3 } }], attune: 1,
  },
  {
    id: 'ser_lantern_of_ages', name: 'Lantern of Ages', kind: 'growth', race: 6, sub: 'seer', cost: 1,
    text: '{recover}. {cool:1}.',
    onPlay: [{ type: 'recover', orDraw: 1 }, { type: 'cool', amount: 1 }],
  },
  {
    id: 'ser_moonwell', name: 'Moonwell', kind: 'defence', race: 6, cost: 2,
    text: '{dawn}: {shield:1}. {shield:+2} while facing the abundant planet.',
    onTurn: [{ type: 'shield', amount: 1, plus: { of: 'planet', planet: 'abundant', amount: 2 } }],
  },
  {
    id: 'ser_constellation', name: 'Living Constellation', kind: 'growth', race: 6, cost: 2, rarity: 'stellar',
    text: 'Your Seer cards {cool:+1}. Your Tidecaster cards {heat:+1}.',
    passive: [{ type: 'kindBonus', sub: 'seer', stat: 'cool', amount: 1 }, { type: 'kindBonus', sub: 'tidecaster', amount: 1 }],
  },
  {
    id: 'ser_star_needle', name: 'Star Needle', kind: 'attack', race: 6, cost: 1,
    text: '{heat:1}, {pierce}. Draw 1.',
    onPlay: [{ type: 'heat', amount: 1, to: 'target', pierce: true }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'ser_almanac', name: 'Celestial Almanac', kind: 'growth', race: 6, cost: 1,
    text: '{dawn}: while facing the abundant planet, draw 1. {dusk}: {cool:1}.',
    onTurn: [{ type: 'draw', amount: 1, if: { planet: 'abundant' } }], onDusk: [{ type: 'cool', amount: 1 }],
  },
  // Heroes
  hero(
    { id: 'ser_hero_ilyath', name: 'Star-Reader Ilyath', race: 6, sub: 'seer', character: true, cost: 2, stability: 5, lead: 'Your Seren cards {cool:+1}.', passive: [{ type: 'kindBonus', race: 6, stat: 'cool', amount: 1 }] },
    [act('foresee', 'Foresee', 'Draw 1.', [{ type: 'draw', amount: 1 }]), act('chart', 'Chart', 'Your {orbit:+1}.', [{ type: 'orbit', amount: 1, who: 'self' }])],
  ),
  hero(
    { id: 'ser_hero_maren', name: 'Tidecaster Maren', race: 6, sub: 'tidecaster', character: true, rarity: 'stellar', cost: 3, stability: 5, lead: '{attune}.', attune: 1 },
    [act('pull', 'Pull', "{heat:2}. Your rival's {orbit:−1}.", [{ type: 'heat', amount: 2, to: 'target' }, { type: 'orbit', amount: -1, who: 'rival' }], { energy: 1 }), act('drift', 'Drift', 'Your {orbit:+1}. {shield:2}.', [{ type: 'orbit', amount: 1, who: 'self' }, { type: 'shield', amount: 2 }])],
  ),
  hero(
    { id: 'ser_hero_aster', name: 'Aster, the Last Constellation', race: 6, character: true, rarity: 'anomaly', cost: 4, stability: 7, lead: 'Draw 2. Your {orbit:+3}. {attune:2}.', onPlay: [{ type: 'draw', amount: 2 }, { type: 'orbit', amount: 3, who: 'self' }], attune: 2 },
    [act('starfall', 'Starfall', '{heat:3}, {pierce}.', [{ type: 'heat', amount: 3, to: 'target', pierce: true }], { sacrifice: true }), act('alignment', 'Alignment', 'Your {orbit:+1}. Draw 1.', [{ type: 'orbit', amount: 1, who: 'self' }, { type: 'draw', amount: 1 }])],
  ),

  // ---------------- Pyrr ----------------
  // Cinderborn
  {
    id: 'pyr_flare_imp', name: 'Flare Imp', kind: 'attack', race: 7, sub: 'cinderborn', cost: 1,
    text: '{dawn}: {heat:1}. {heat:+1} while {overheated}.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'heat', amount: 1, to: 'target', if: { overheated: true } }],
  },
  {
    id: 'pyr_cinder_brute', name: 'Cinder Brute', kind: 'attack', race: 7, sub: 'cinderborn', cost: 2, character: true,
    text: '{dawn}: {heat:3}. {heat:1} to your sun.',
    onTurn: [{ type: 'heat', amount: 3, to: 'target' }, { type: 'selfHeat', amount: 1 }],
  },
  {
    id: 'pyr_ash_walker', name: 'Ash-Walker', kind: 'attack', race: 7, sub: 'cinderborn', cost: 2, character: true,
    text: '{dawn}: {heat:1}. {heat:+2} while {overheated}.',
    onTurn: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'heat', amount: 2, to: 'target', if: { overheated: true } }],
  },
  {
    id: 'pyr_heat_bloom', name: 'Heat Bloom', kind: 'defence', race: 7, sub: 'cinderborn', cost: 2,
    text: '{dusk}: {cool:1}. While {overheated}, {cool:+2}. {dawn}: while {overheated}, {shield:1}.',
    onTurn: [{ type: 'shield', amount: 1, if: { overheated: true } }], onDusk: [{ type: 'cool', amount: 1 }, { type: 'cool', amount: 2, if: { overheated: true } }],
  },
  {
    id: 'pyr_ember_guard', name: 'Ember Guard', kind: 'defence', race: 7, sub: 'cinderborn', cost: 2,
    text: '{guard}. {sting:2}. {dusk}: {cool:2}.',
    onDusk: [{ type: 'cool', amount: 2 }], passive: [{ type: 'taunt' }, { type: 'retaliate', amount: 2 }],
  },
  {
    id: 'pyr_magma_heart', name: 'Magma Heart', kind: 'growth', race: 7, sub: 'cinderborn', cost: 2, rarity: 'stellar',
    text: 'Your Cinderborn cards {heat:+1}. {dawn}: {heat:1} to your sun.',
    onTurn: [{ type: 'selfHeat', amount: 1 }], passive: [{ type: 'kindBonus', sub: 'cinderborn', amount: 1 }],
  },
  // Flarekin
  {
    id: 'pyr_flare_burst', name: 'Flare Burst', kind: 'attack', race: 7, sub: 'flarekin', cost: 1, spendAll: true,
    text: '{spend}. {heat:2}. {heat:+1} per energy spent. Draw 1.',
    onPlay: [{ type: 'heat', amount: 2, to: 'target', plus: { of: 'spent' } }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'pyr_supernova_charge', name: 'Supernova Charge', kind: 'attack', race: 7, sub: 'flarekin', cost: 1, spendAll: true, rarity: 'stellar',
    text: '{spend}. {heat:2} per energy spent. {heat:2} to your sun.',
    onPlay: [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'spent', times: 2 } }, { type: 'selfHeat', amount: 2 }],
  },
  {
    id: 'pyr_pyre_shield', name: 'Pyre Shield', kind: 'defence', race: 7, sub: 'flarekin', cost: 1, spendAll: true,
    text: '{spend}. {shield:2} and {cool:2} per energy spent.',
    onPlay: [{ type: 'shield', amount: 0, plus: { of: 'spent', times: 2 } }, { type: 'cool', amount: 0, plus: { of: 'spent', times: 2 } }],
  },
  {
    id: 'pyr_flarekin_dancer', name: 'Flarekin Dancer', kind: 'attack', race: 7, sub: 'flarekin', cost: 1, character: true,
    text: '{energy:1}. {heat:2}. {heat:1} to your sun.',
    onPlay: [{ type: 'plays', amount: 1 }, { type: 'heat', amount: 2, to: 'target' }, { type: 'selfHeat', amount: 1 }],
  },
  {
    id: 'pyr_stoker', name: 'Stoker', kind: 'growth', race: 7, sub: 'flarekin', cost: 1,
    text: '{dawn}: while {overheated}, {energy:1}.',
    onTurn: [{ type: 'plays', amount: 1, if: { overheated: true } }],
  },
  {
    id: 'pyr_flare_temple', name: 'Flare Temple', kind: 'growth', race: 7, cost: 2, rarity: 'stellar',
    text: 'Your Pyrr attack cards {heat:+1}. {dawn}: {heat:1} to your sun.',
    onTurn: [{ type: 'selfHeat', amount: 1 }], passive: [{ type: 'kindBonus', kind: 'attack', race: 7, amount: 1 }],
  },
  {
    id: 'pyr_vent_cooler', name: 'Vent Cooler', kind: 'defence', race: 7, cost: 1,
    text: '{cool:2}. Draw 1.',
    onPlay: [{ type: 'cool', amount: 2 }, { type: 'draw', amount: 1 }],
  },
  {
    id: 'pyr_solar_tyrant', name: 'Solar Tyrant', kind: 'attack', race: 7, cost: 3, rarity: 'stellar',
    text: '{dawn}: {heat:2}. {heat:+2} while {overheated}. {heat:1} to your sun.',
    onTurn: [{ type: 'heat', amount: 2, to: 'target' }, { type: 'heat', amount: 2, to: 'target', if: { overheated: true } }, { type: 'selfHeat', amount: 1 }],
  },
  // Heroes
  hero(
    { id: 'pyr_hero_ignis', name: 'Flame-Herald Ignis', race: 7, sub: 'flarekin', character: true, cost: 2, stability: 5, lead: 'Your Flarekin cards {heat:+1}.', passive: [{ type: 'kindBonus', sub: 'flarekin', amount: 1 }] },
    [act('ignite', 'Ignite', '{energy:1}. {heat:1} to your sun.', [{ type: 'plays', amount: 1 }, { type: 'selfHeat', amount: 1 }]), act('spark', 'Spark', '{heat:2}.', [{ type: 'heat', amount: 2, to: 'target' }], { selfHeat: 1 })],
  ),
  hero(
    { id: 'pyr_hero_ashka', name: 'Cinder-Queen Ashka', race: 7, sub: 'cinderborn', character: true, rarity: 'stellar', cost: 3, stability: 5, lead: '{dawn}: {heat:1}. {heat:+2} while {overheated}.', onTurn: [{ type: 'heat', amount: 1, to: 'target' }, { type: 'heat', amount: 2, to: 'target', if: { overheated: true } }] },
    [act('bathe', 'Bathe in Fire', '{heat:2} to your sun. She regains 2 stability.', [{ type: 'selfHeat', amount: 2 }, { type: 'restore', amount: 2, self: true }]), act('flare', 'Flare', '{heat:3}.', [{ type: 'heat', amount: 3, to: 'target' }], { selfHeat: 2 })],
  ),
  hero(
    { id: 'pyr_hero_pyrrhus', name: 'Pyrrhus, the Undying Flare', race: 7, character: true, rarity: 'anomaly', cost: 4, stability: 7, lead: '{heat:5}. {heat:2} to your sun. Your Pyrr cards {heat:+1}.', onPlay: [{ type: 'heat', amount: 5, to: 'target' }, { type: 'selfHeat', amount: 2 }], passive: [{ type: 'kindBonus', race: 7, amount: 1, others: true }] },
    [act('inferno', 'Inferno', '{heat:4}, {pierce}. {heat:2} to your sun.', [{ type: 'heat', amount: 4, to: 'target', pierce: true }, { type: 'selfHeat', amount: 2 }], { stability: 1 }), act('rebirth', 'Rebirth', 'He regains 3 stability. {heat:1} to your sun.', [{ type: 'restore', amount: 3, self: true }, { type: 'selfHeat', amount: 1 }])],
  ),
];
