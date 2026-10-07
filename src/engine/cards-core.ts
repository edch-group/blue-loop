import type { CardDef } from './types';
import { act, hero } from './heroes-battle';

/**
 * Core versions: how some of the four core races' cards play in Core (modes.ts), pared down to the
 * fundamentals and their race's own mechanic (Aureline Forge, Xel'Naru Overheat, Vorthane Shields, Ixquor
 * Growth). Each replaces the card's effects; its name, picture and kind stay. In Lost Races they play as written.
 */
const forge = (n = 1) => ({ type: 'adjacent' as const, amounts: [n], kind: 'attack' as const });
const none = { onPlay: undefined, onTurn: undefined, onDusk: undefined, onLeave: undefined, onRecover: undefined, passive: undefined, fusion: undefined, lightspeed: undefined, attune: undefined, spendAll: undefined };

const HEROES: CardDef[] = [
  // ---- Aureline: Forge ----
  hero(
    { id: 'command_directive', name: 'Solarch Veyra', race: 0, stability: 5, lead: '{dawn}: {cool:1}.', onTurn: [{ type: 'cool', amount: 1 }] },
    [act('rally', 'Rally', '{heat:2}.', [{ type: 'heat', amount: 2, to: 'target' }]), act('counsel', 'Counsel', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
  ),
  hero(
    { id: 'ignition_protocol', name: 'Sol-Marshal Aurex', race: 0, stability: 5, lead: '{dawn}: {heat:1}.', onTurn: [{ type: 'heat', amount: 1, to: 'target' }] },
    [act('strafe', 'Strafe', '{heat:3}.', [{ type: 'heat', amount: 3, to: 'target' }], { stability: 1 }), act('overdrive', 'Overdrive', '{energy:1}.', [{ type: 'plays', amount: 1 }])],
  ),
  hero(
    { id: 'empress_solenne', name: 'Empress Solenne', race: 0, stability: 7, lead: '{heat:4}.', onPlay: [{ type: 'heat', amount: 4, to: 'target' }] },
    [act('judgement', 'Judgement', '{heat:3}.', [{ type: 'heat', amount: 3, to: 'target' }], { energy: 1 }), act('dawnfall', 'Dawnfall', '{cool:3}.', [{ type: 'cool', amount: 3 }])],
  ),
  // ---- Xel'Naru: Overheat ----
  hero(
    { id: 'war_council', name: 'Archon Seris', race: 1, stability: 5, lead: '{dawn}: while {overheated}, {heat:2}.', onTurn: [{ type: 'heat', amount: 2, to: 'target', if: { overheated: true } }] },
    [act('kindle', 'Kindle', 'Draw 2.', [{ type: 'draw', amount: 2 }], { selfHeat: 2 }), act('shatter', 'Shatter', '{heat:3}.', [{ type: 'heat', amount: 3, to: 'target' }], { selfHeat: 2 })],
  ),
  hero(
    { id: 'the_shardmind', name: 'The Shardmind', race: 1, stability: 7, lead: "{cool:4}. Your Xel'Naru cards {heat:+1}.", onPlay: [{ type: 'cool', amount: 4 }], passive: [{ type: 'kindBonus', race: 1, amount: 1, others: true }] },
    [act('reckoning', 'Cold Reckoning', '{cool:3}.', [{ type: 'cool', amount: 3 }], { energy: 1 }), act('overload', 'Overload', 'Draw 2. {heat:2} to your sun.', [{ type: 'draw', amount: 2 }, { type: 'selfHeat', amount: 2 }])],
  ),
  // ---- Vorthane: Shields ----
  hero(
    { id: 'tide_regent', name: 'Tide-Regent Osshara', race: 2, stability: 5, lead: '{dawn}: {shield:2}.', onTurn: [{ type: 'shield', amount: 2 }] },
    [act('swell', 'Swell', '{shield:4}.', [{ type: 'shield', amount: 4 }]), act('current', 'Current', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
  ),
  hero(
    {
      id: 'the_admiralty', name: 'The Admiralty', race: 2, rarity: 'anomaly', stability: 6,
      lead: 'Your Vorthane cards {shield:+1}. {dawn}: {shield:2}.',
      onTurn: [{ type: 'shield', amount: 2 }],
      passive: [{ type: 'kindBonus', race: 2, stat: 'shield', amount: 1, others: true }],
    },
    [act('broadside', 'Broadside', '{heat:1} per 2 shields you have (up to 4).', [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'shields', per: 2 }, max: 4 }], { stability: 1 }), act('muster', 'Muster', '{energy:1}.', [{ type: 'plays', amount: 1 }])],
  ),
  hero(
    { id: 'leviathan_thoross', name: 'Leviathan Thoross', race: 2, stability: 7, lead: '{shield:6}. {hold}.', onPlay: [{ type: 'shield', amount: 6 }], passive: [{ type: 'keepShields' }] },
    [act('crush', 'Crush', '{heat:1} per 2 shields you have (up to 5).', [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'shields', per: 2 }, max: 5 }], { stability: 1 }), act('deepcall', 'Deep Call', '{shield:4}.', [{ type: 'shield', amount: 4 }])],
  ),
  // ---- Ixquor: Growth ----
  hero(
    { id: 'chamber_protocol', name: "Broodmother Ul'Kha", race: 3, stability: 5, lead: '{dawn}: your other growing cards grow by 1.', onTurn: [{ type: 'growOthers' }] },
    [act('feed', 'Feed', 'Your other growing cards grow by 1.', [{ type: 'growOthers' }]), act('forage', 'Forage', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
  ),
  hero(
    { id: 'logistics_command', name: 'Hive-Speaker Zyth', race: 3, stability: 5, lead: 'Your Ixquor cards {heat:+1}.', passive: [{ type: 'kindBonus', race: 3, amount: 1, others: true }] },
    [act('swarm', 'Swarm', '{energy:1}.', [{ type: 'plays', amount: 1 }]), act('forage', 'Forage', 'Draw 1.', [{ type: 'draw', amount: 1 }])],
  ),
  hero(
    { id: 'the_worldroot', name: 'The Worldroot', race: 3, stability: 7, lead: 'Draw 3. {dawn}: draw 1.', onPlay: [{ type: 'draw', amount: 3 }], onTurn: [{ type: 'draw', amount: 1 }] },
    [act('bloom', 'Bloom', 'Your other growing cards grow by 1.', [{ type: 'growOthers' }]), act('roots', 'Deep Roots', '{cool:3}.', [{ type: 'cool', amount: 3 }])],
  ),
];

/** What each core version changes (on top of the card as it is in Lost Races). */
export const CORE_VERSIONS: Record<string, Partial<CardDef>> = {
  ...Object.fromEntries(HEROES.map(({ id, name: _name, race: _race, rarity: _rarity, ...rest }) => [id, { ...none, ...rest }])),
  // Aureline: more Forge.
  halo_sentinel: { ...none, text: '{guard}. {sturdy:1}. {forge:1}.', passive: [{ type: 'taunt' }, forge()] },
  solar_aegis: { ...none, text: '{forge:1}. {cool:2}.', onPlay: [{ type: 'cool', amount: 2 }], passive: [forge()] },
  aureline_war_herald: { ...none, text: '{dawn}: {heat:1}. {heat:+1} per attack card next to this.', onTurn: [{ type: 'heat', amount: 1, to: 'target', plus: { of: 'adjacent', kind: 'attack' } }] },
  helio_bastion: { ...none, text: '{forge:1}. Draw 1.', onPlay: [{ type: 'draw', amount: 1 }], passive: [forge()] },
  dawn_rampart: { ...none, text: '{forge:1}. {dusk}: {cool:2}.', onDusk: [{ type: 'cool', amount: 2 }], passive: [forge()] },
  aureline_cantor: { ...none, text: '{dusk}: {cool:1}. {cool:+1} per attack card next to this.', onDusk: [{ type: 'cool', amount: 1, plus: { of: 'adjacent', kind: 'attack' } }] },
  // Xel'Naru: one thing fewer.
  overcharge: { ...none, text: '{energy:2}. {heat:1} to your sun.', onPlay: [{ type: 'plays', amount: 2 }, { type: 'selfHeat', amount: 1 }] },
  // Ixquor: more Growth, and growing cards that last long enough to grow (no cheap card lasts more than two days).
  chitin_spire: { ...none, cost: 2, stability: 4, text: '{dawn}: {grows:3}, then {cool} equal to its growth.', onTurn: [{ type: 'grow', max: 3 }, { type: 'cool', amount: 0, plus: { of: 'growth' } }] },
  thorn_graft: { ...none, cost: 2, stability: 4, text: '{dawn}: {grows:3}, then {heat} equal to its growth.', onTurn: [{ type: 'grow', max: 3 }, { type: 'heat', amount: 0, to: 'target', plus: { of: 'growth' } }] },
  spore_drone: { cost: 2, stability: 4 },
  spore_catalyst: { ...none, text: '{dawn}: {grows:4}. {catalyst}.', onTurn: [{ type: 'grow', max: 4 }], passive: [{ type: 'catalyst' }] },
};
