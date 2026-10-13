import type { CardDef, Effect } from './types';

/**
 * Singularities: every Hero's ultimate [direction: ultimates for the heroes, in and out of the campaign, every hero's
 * different and charging in a different way (playing cards, attacking, defending, cards destroyed, deck recycling,
 * planet orbits, drawing cards...); a niche ultimate keeps the lesser heroes worth leading in the decks it suits].
 *
 * While a Hero leads (in your Hero slot) its singularity charges from one thing, its own, that happens in the battle;
 * once full, it can be unleashed on your day, free (no energy, and not its daily ability), and empties. A Hero that
 * leaves play loses its charge.
 */

/** What a singularity charges from (each Hero's own). */
export type ChargeKind =
  | 'plays' // cards you play
  | 'playsAttack' // attack cards you play
  | 'playsDefence' // defence cards you play
  | 'playsGrowth' // growth cards you play
  | 'attacks' // attacks your cards make
  | 'heat' // heat you deal to rival suns
  | 'burn' // heat on your own sun
  | 'sunHit' // rival heat that reaches your sun
  | 'struck' // damage you take, from anything: heat reaching your sun, and heat your cards take
  | 'cooled' // heat you cool
  | 'shields' // shields you raise
  | 'absorbed' // heat your shields absorb
  | 'wounds' // stability your cards lose
  | 'turned' // blows your cards' defence turns aside
  | 'lost' // your cards burned away
  | 'kills' // rival cards you burn away
  | 'departures' // your cards leaving play, any way
  | 'sacrifices' // cards you give up (sacrificed or consumed)
  | 'recycles' // your discard pile shuffled back into your deck
  | 'orbit' // steps your orbit moves (by the days, or by cards)
  | 'draws' // cards you draw
  | 'energy' // energy you spend
  | 'dawns' // your days
  | 'hotDawns' // your days begun overheated
  | 'abilities' // your Hero's abilities used
  | 'traps' // your traps sprung
  | 'mends'; // stability mended and defence repaired on your cards

/** How each kind reads: "charges from …". */
export const CHARGE_TEXT: Record<ChargeKind, (n: number) => string> = {
  plays: (n) => `play ${n} cards`,
  playsAttack: (n) => `play ${n} attack cards`,
  playsDefence: (n) => `play ${n} defence cards`,
  playsGrowth: (n) => `play ${n} growth cards`,
  attacks: (n) => `attack ${n} times`,
  heat: (n) => `deal ${n} heat to rival suns`,
  burn: (n) => `take ${n} heat on your own sun`,
  sunHit: (n) => `take ${n} rival heat to your sun`,
  struck: (n) => `take ${n} damage`,
  cooled: (n) => `cool ${n}`,
  shields: (n) => `raise ${n} shields`,
  absorbed: (n) => `absorb ${n} heat with shields`,
  wounds: (n) => `your cards lose ${n} stability`,
  turned: (n) => `your defence turns ${n} heat`,
  lost: (n) => `lose ${n} cards`,
  kills: (n) => `destroy ${n} rival cards`,
  departures: (n) => `${n} of your cards leave play`,
  sacrifices: (n) => `give up ${n} cards`,
  recycles: (n) => (n === 1 ? 'reshuffle your deck' : `reshuffle your deck ${n} times`),
  orbit: (n) => `your orbit moves ${n}`,
  draws: (n) => `draw ${n} cards`,
  energy: (n) => `spend ${n} energy`,
  dawns: (n) => `last ${n} days`,
  hotDawns: (n) => `begin ${n} days overheated`,
  abilities: (n) => `use abilities ${n} times`,
  traps: (n) => `spring ${n} traps`,
  mends: (n) => `mend or repair ${n}`,
};

export interface Singularity {
  name: string;
  charge: ChargeKind;
  /** How much charge fills it. */
  need: number;
  /** What it does, in the card's marks. */
  text: string;
  effects: Effect[];
}

const s = (name: string, charge: ChargeKind, need: number, text: string, effects: Effect[]): Singularity => ({ name, charge, need, text, effects });
const heat = (amount: number, pierce = false): Effect => ({ type: 'heat', amount, to: 'target', ...(pierce ? { pierce } : {}) });

/** Every Hero's singularity, by its card. */
export const SINGULARITIES: Record<string, Singularity> = {
  // Aureline: the light, gathered and let go.
  command_directive: s('Solar Decree', 'plays', 8, 'Draw 2. {energy:2}.', [{ type: 'draw', amount: 2 }, { type: 'plays', amount: 2 }]),
  ignition_protocol: s('Sunstrike', 'attacks', 6, '{heat:6}, {pierce}.', [heat(6, true)]),
  empress_solenne: s('Corona', 'heat', 16, '4 heat to each rival card. {cool:3}.', [{ type: 'strikeAll', amount: 4 }, { type: 'cool', amount: 3 }]),
  // Xel'Naru: overload, cold and shattering.
  war_council: s('Shatterpoint', 'burn', 8, '{heat:5}, {pierce}. {cool:4}.', [heat(5, true), { type: 'cool', amount: 4 }]),
  coolant_protocol: s('Absolute Zero', 'cooled', 10, '{cool:6}. {shield:3}.', [{ type: 'cool', amount: 6 }, { type: 'shield', amount: 3 }]),
  the_shardmind: s('Reassembly', 'lost', 3, '{recover}. Draw 2.', [{ type: 'recover', orDraw: 1 }, { type: 'draw', amount: 2 }]),
  // Vorthane: the tide's weight.
  tide_regent: s('Riptide', 'shields', 12, '{heat:1} per 2 shields you have (up to 6).', [{ type: 'heat', amount: 0, to: 'target', plus: { of: 'shields', per: 2 }, max: 6 }]),
  the_admiralty: s('Grand Broadside', 'absorbed', 12, '3 heat to each rival card. {shield:3}.', [{ type: 'strikeAll', amount: 3 }, { type: 'shield', amount: 3 }]),
  leviathan_thoross: s('Maelstrom', 'wounds', 10, '{eject:9}. {shield:4}.', [{ type: 'bounce', maxDefence: 9 }, { type: 'shield', amount: 4 }]),
  // Ixquor: the swarm.
  logistics_command: s('Swarm Tide', 'energy', 14, '{plant:3}. {energy:1}.', [{ type: 'plant', amount: 3 }, { type: 'plays', amount: 1 }]),
  chamber_protocol: s('Brood Surge', 'playsGrowth', 4, 'Your other cards grow 2. {renew:2}.', [{ type: 'growOthers' }, { type: 'growOthers' }, { type: 'restore', amount: 2, all: true }]),
  the_worldroot: s('Overgrowth', 'draws', 14, '{plant:2}. Your other cards grow 1. Draw 2.', [{ type: 'plant', amount: 2 }, { type: 'growOthers' }, { type: 'draw', amount: 2 }]),
  // Nyxari: the dark.
  nyx_hero_vesh: s('Veil of Night', 'traps', 2, '{shield:5}. Draw 2.', [{ type: 'shield', amount: 5 }, { type: 'draw', amount: 2 }]),
  nyx_hero_kael: s('Unmaking', 'kills', 3, '8 heat to the rival card with the most attack.', [{ type: 'strikeBest', amount: 8 }]),
  nyx_hero_nyxara: s('Total Eclipse', 'sacrifices', 2, '3 heat to each rival card. {heat:4}, {pierce}.', [{ type: 'strikeAll', amount: 3 }, heat(4, true)]),
  // Bloodcult.
  bc_hero_sanguis: s('Blood Moon', 'departures', 5, '{renew:3}. {heat:4}.', [{ type: 'restore', amount: 3, all: true }, heat(4)]),
  // Korrath: the forge.
  kor_hero_durga: s('Masterwork', 'mends', 8, '{repair:6}. {renew:2}.', [{ type: 'repair', amount: 6 }, { type: 'restore', amount: 2, all: true }]),
  kor_hero_brannoc: s('Unbroken', 'turned', 8, 'Your strongest card becomes a Guard, +3 defence. {shield:4}.', [{ type: 'fortify', amount: 3, who: 'best' }, { type: 'shield', amount: 4 }]),
  kor_hero_anvil_king: s("Anvil's Fall", 'playsDefence', 4, '{heat:7}, {pierce}. {repair:3}.', [heat(7, true), { type: 'repair', amount: 3 }]),
  // Seren: the stars' turning.
  ser_hero_ilyath: s('Conjunction', 'orbit', 4, 'Your orbit +2. Draw 2.', [{ type: 'orbit', amount: 2, who: 'self' }, { type: 'draw', amount: 2 }]),
  ser_hero_maren: s('Spring Tide', 'dawns', 5, "Their orbit −2. {heat:4}.", [{ type: 'orbit', amount: -2, who: 'rival' }, heat(4)]),
  ser_hero_aster: s('Starfall Cascade', 'abilities', 4, '{heat:6}, {pierce}. Your orbit +1.', [heat(6, true), { type: 'orbit', amount: 1, who: 'self' }]),
  // Pyrr: the flare.
  pyr_hero_ignis: s('Wildfire', 'playsAttack', 5, '2 heat to each rival card. {energy:1}.', [{ type: 'strikeAll', amount: 2 }, { type: 'plays', amount: 1 }]),
  pyr_hero_ashka: s('Phoenix Heart', 'hotDawns', 3, '{cool:5}. She regains 3 stability. {heat:3}.', [{ type: 'cool', amount: 5 }, { type: 'restore', amount: 3, self: true }, heat(3)]),
  pyr_hero_pyrrhus: s('Rekindle', 'recycles', 1, '{cool:6}. Draw 3.', [{ type: 'cool', amount: 6 }, { type: 'draw', amount: 3 }]),
};

/**
 * The Captain's, one of a few [direction: the campaign hero's singularity variable, a couple of options; the first
 * "Back to the Wall", 3 damage to one card and 2 to the cards next to it, charging from taking damage, from cards or
 * other sources]: learnt and chosen on the Captain's tree (meta.ts), the choice written into its card's id.
 */
export const CAPTAIN_SINGULARITIES: Record<string, Singularity & { price: number }> = {
  wall: { ...s('Back to the Wall', 'struck', 10, '3 heat to a rival card and 2 to each card beside it.', [{ type: 'blast', amount: 3, side: 2 }]), price: 0 },
  stand: { ...s('Last Stand', 'sunHit', 12, '{cool:5}. {shield:5}. Draw 1.', [{ type: 'cool', amount: 5 }, { type: 'shield', amount: 5 }, { type: 'draw', amount: 1 }]), price: 3 },
  scrap: { ...s('Scrap Run', 'lost', 3, 'Draw 2. {energy:2}.', [{ type: 'draw', amount: 2 }, { type: 'plays', amount: 2 }]), price: 3 },
};
export const CAPTAIN_START_SINGULARITY = 'wall';
const CAPTAIN = 'human_captain';

/** The Captain's singularity's id from its card's id (its seventh part: `human_captain@a.s.c.abilities.lead.sing`). */
export function captainSingularityId(defId: string): string {
  const at = defId.indexOf('@');
  const id = at < 0 ? undefined : defId.slice(at + 1).split('.')[5];
  return id && CAPTAIN_SINGULARITIES[id] ? id : CAPTAIN_START_SINGULARITY;
}

/** A Hero card's singularity (the Captain's, the one its build has chosen), or undefined. */
export function singularityOf(defId: string): Singularity | undefined {
  if (defId === CAPTAIN || defId.startsWith(CAPTAIN + '@')) return CAPTAIN_SINGULARITIES[captainSingularityId(defId)];
  return SINGULARITIES[defId];
}

/** Its line on the card: "{sing:Name}charges from … : what it does". */
export const singularityLine = (k: Singularity) => `{sing:${k.name}}${CHARGE_TEXT[k.charge](k.need)}: ${k.text}`;

/** A Hero card given its singularity's line, after its abilities. */
export function withSingularity(def: CardDef): CardDef {
  const k = singularityOf(def.id);
  if (!k || def.text.includes('{sing:')) return def;
  def.text = `${def.text} ${singularityLine(k)}`;
  return def;
}
