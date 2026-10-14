import type { CardDef, CardKind, Effect, Passive } from './types';
import { ascentGifts, COMPANION_TREES, GATE, TIERS, type Ascent } from './ascent';

/**
 * The Captain's companions [direction: more permanent characters, earnt over time and in different ways; each sits or
 * stands on the ship in the campaign menu with the Captain, is a playable card in the deck, and has a skill tree and
 * experience of its own, earnt from what it does in battle]. Three, with the Captain the fourth:
 *
 * - Kaelen, an Aureline lancer, the Captain's old friend, trapped in a crystal: the first battle of every galaxy is
 *   the crystal (break it in time to free him) until he is free. He learns from the damage he deals.
 * - Mara Venn, a human engineer: found at a space station once the ship has three parts fitted. She learns from the
 *   shields she raises and the heat she cools (and what she mends).
 * - Vey'Sharr, a Xel'Naru defector: word of the Captain's mercy reaches it once two beaten heroes have been spared
 *   in Power Struggles. It learns from the cards it burns away.
 *
 * A companion's card is built from its tree, as the Captain's is (captain.ts): what was learnt is written into the id
 * (`companion_lancer@attack.stability.cheaper.trait+trait`), so a saved battle reads the very card that fought.
 */

export type CompanionId = 'lancer' | 'engineer' | 'defector';
export const COMPANION_IDS: CompanionId[] = ['lancer', 'engineer', 'defector'];

/** What a companion learns from: damage it deals (to suns and cards), support (shields, cooling, mending), cards it burns away. */
export type ActKind = 'damage' | 'support' | 'kills';
export type Acts = Record<ActKind, number>;
export const noActs = (): Acts => ({ damage: 0, support: 0, kills: 0 });

/** Something a companion can learn: its words on the card and what they do. */
export interface CompanionTrait {
  id: string;
  name: string;
  price: number;
  text: string;
  def: Pick<CardDef, 'onPlay' | 'onTurn' | 'passive' | 'darkspeed' | 'defence'>;
}

export interface CompanionDef {
  id: CompanionId;
  /** Its card's plain id (and picture). */
  card: string;
  name: string;
  /** What they are, in a few words. */
  title: string;
  kind: CardKind;
  race?: number;
  base: { cost: number; health: number; attack: number };
  /** Its name at each tier (ascent.ts: the first its own; each Astral Gate a new one). */
  titles: string[];
  /** Its first trait, known from the start. */
  start: string;
  traits: CompanionTrait[];
  /** What it learns from, and how much each point of it is worth. */
  learns: Partial<Acts>;
  /** How it learns, in words. */
  learnsText: string;
  /** How it is found, in words. */
  unlockText: string;
  /** A line about them. */
  flavour: string;
}

const t = (id: string, name: string, price: number, text: string, def: CompanionTrait['def']): CompanionTrait => ({ id, name, price, text, def });
const heat = (amount: number): Effect => ({ type: 'heat', amount, to: 'target' });

export const COMPANIONS: CompanionDef[] = [
  {
    id: 'lancer',
    card: 'companion_lancer',
    name: 'Kaelen',
    title: 'Aureline Lancer',
    kind: 'attack',
    race: 0,
    // (Low to start [direction: Kaelen 1 energy, as the plain Aureline Lancer, 3/1]: the tree makes him.)
    base: { cost: 1, health: 1, attack: 3 },
    titles: ['Kaelen', 'Kaelen, Dawnlancer', 'Kaelen, Sunspear', 'Kaelen, Lightbringer'],
    start: 'lunge',
    traits: [
      t('lunge', 'Lunge', 0, '{heat:1}.', { onPlay: [heat(1)] }),
      t('charge', 'Charge', 2, '{darkspeed}.', { darkspeed: true }),
      t('halo', 'Halo', 2, '{dawn}: {shield:1}.', { onTurn: [{ type: 'shield', amount: 1 }] }),
      t('sunlance', 'Sun-Lance', 3, '{dawn}: {heat:1}.', { onTurn: [heat(1)] }),
      t('plate', 'Gilded Plate', 2, '{sturdy:2}.', { defence: 2 }),
      t('zeal', 'Zeal', 4, 'Your attack cards {heat:+1}.', { passive: [{ type: 'kindBonus', kind: 'attack', amount: 1 }] }),
      t('radiant', 'Radiant Edge', 0, '{sting:1}.', { passive: [{ type: 'retaliate', amount: 1 }] }),
      t('second', 'Second Wind', 0, '{dawn}: he regains 1 stability.', { onTurn: [{ type: 'restore', amount: 1, self: true }] }),
      t('solar', 'Solar Charge', 0, '{heat:3}.', { onPlay: [heat(3)] }),
      t('dawnbreak', 'Dawnbreak', 0, '{dawn}: {heat:2}.', { onTurn: [heat(2)] }),
      t('aegis', 'Aegis of Dawn', 0, '{dawn}: {shield:2}.', { onTurn: [{ type: 'shield', amount: 2 }] }),
      t('volley', 'Lance Volley', 0, '2 heat to each rival card.', { onPlay: [{ type: 'strikeAll', amount: 2 }] }),
    ],
    learns: { damage: 1 },
    learnsText: 'Learns from the damage he deals.',
    unlockText: 'Break his crystal in the first battle of a galaxy.',
    flavour: "The Captain's oldest friend, caught in a crystal when the light failed.",
  },
  {
    id: 'engineer',
    card: 'companion_engineer',
    name: 'Mara Venn',
    title: 'Engineer',
    kind: 'defence',
    base: { cost: 1, health: 4, attack: 0 },
    titles: ['Mara Venn', 'Mara Venn, Shipwright', 'Mara Venn, Starwright', 'Mara Venn, Voidwright'],
    start: 'emitter',
    traits: [
      t('emitter', 'Emitter', 0, '{dawn}: {shield:1}.', { onTurn: [{ type: 'shield', amount: 1 }] }),
      t('coolant', 'Coolant Flush', 1, '{cool:2}.', { onPlay: [{ type: 'cool', amount: 2 }] }),
      t('weld', 'Field Weld', 2, '{dawn}: {renew:1}.', { onTurn: [{ type: 'restore', amount: 1, all: true }] }),
      t('barrier', 'Barrier', 2, '{shield:3}.', { onPlay: [{ type: 'shield', amount: 3 }] }),
      t('sink', 'Heat Sink', 3, '{dawn}: {cool:1}.', { onTurn: [{ type: 'cool', amount: 1 }] }),
      t('bulwark', 'Bulwark', 3, '{guard}. {sturdy:2}.', { defence: 2, passive: [{ type: 'taunt' }] }),
      t('kit', 'Patch Kit', 0, '{renew:2}.', { onPlay: [{ type: 'restore', amount: 2, all: true }] }),
      t('overclock', 'Overclock', 0, '{energy:1}.', { onPlay: [{ type: 'plays', amount: 1 }] }),
      t('reinforce', 'Reinforce', 0, '{dawn}: {shield:2}.', { onTurn: [{ type: 'shield', amount: 2 }] }),
      t('deep', 'Deep Coolant', 0, '{cool:4}.', { onPlay: [{ type: 'cool', amount: 4 }] }),
      t('fortress', 'Fortress', 0, '{sturdy:4}.', { defence: 4 }),
      t('master', 'Master Weld', 0, '{dawn}: {renew:2}.', { onTurn: [{ type: 'restore', amount: 2, all: true }] }),
      t('array', 'Shield Array', 0, '{dawn}: {shield:3}.', { onTurn: [{ type: 'shield', amount: 3 }] }),
    ],
    learns: { support: 1 },
    learnsText: 'Learns from the shields she raises and the heat she cools.',
    unlockText: 'Dock at a space station with three ship parts fitted.',
    flavour: 'She kept the ship flying when no one else would.',
  },
  {
    id: 'defector',
    card: 'companion_defector',
    name: "Vey'Sharr",
    title: "Xel'Naru Defector",
    kind: 'attack',
    race: 1,
    base: { cost: 2, health: 3, attack: 2 },
    titles: ["Vey'Sharr", "Vey'Sharr, Unbound", "Vey'Sharr, Shardlord", "Vey'Sharr, Prism Ascendant"],
    start: 'shardstep',
    traits: [
      t('shardstep', 'Shardstep', 0, '2 heat to the rival card with the most attack.', { onPlay: [{ type: 'strikeBest', amount: 2 }] }),
      t('edge', 'Shard Edge', 2, '{sting:2}.', { passive: [{ type: 'retaliate', amount: 2 }] }),
      t('hunt', 'Hunt', 3, '{dawn}: 1 heat to the rival card with the most attack.', { onTurn: [{ type: 'strikeBest', amount: 1 }] }),
      t('swift', 'Swift', 2, '{darkspeed}.', { darkspeed: true }),
      t('shatter', 'Shatterstorm', 4, '2 heat to each rival card.', { onPlay: [{ type: 'strikeAll', amount: 2 }] }),
      t('splinter', 'Splinter', 0, '{heat:2}.', { onPlay: [heat(2)] }),
      t('prism', 'Prism Guard', 0, '{sturdy:2}.', { defence: 2 }),
      t('cold', 'Cold Light', 0, '{dawn}: {cool:1}.', { onTurn: [{ type: 'cool', amount: 1 }] }),
      t('refract', 'Refraction', 0, '{sting:3}.', { passive: [{ type: 'retaliate', amount: 3 }] }),
      t('executioner', 'Executioner', 0, '{dawn}: 2 heat to the rival card with the most attack.', { onTurn: [{ type: 'strikeBest', amount: 2 }] }),
      t('crystal', 'Crystal Aegis', 0, '{dawn}: {shield:2}.', { onTurn: [{ type: 'shield', amount: 2 }] }),
      t('nova', 'Shard Nova', 0, '3 heat to each rival card.', { onPlay: [{ type: 'strikeAll', amount: 3 }] }),
    ],
    learns: { kills: 6, damage: 0.5 },
    learnsText: 'Learns from the cards it burns away.',
    unlockText: 'Spare two beaten heroes in Power Struggles.',
    flavour: 'It tore out the shard that bound it to its Hierarch, and came looking for the human who spares.',
  },
];

export const companionDef = (id: CompanionId): CompanionDef => COMPANIONS.find((c) => c.id === id)!;

/** How many beaten heroes must be spared for the defector to come. */
export const DEFECTOR_SPARED = 2;
/** Ship parts fitted for the engineer to be found at a station. */
export const ENGINEER_PARTS = 3;

/** What a companion's tree has made of its card: attack, stability levels (+2 each), energy off, traits, gates passed. */
export interface CompanionBuild {
  attack: number;
  stability: number;
  cheaper: number;
  traits: string[];
  gates: number;
}

export const plainCompanion = (id: CompanionId): CompanionBuild => ({ attack: 0, stability: 0, cheaper: 0, traits: [companionDef(id).start], gates: 0 });

/** The build an ascent makes (ascent.ts): its upgrades' gifts, its traits after its first, its gates. */
export function companionFromAscent(id: CompanionId, a: Ascent): CompanionBuild {
  const g = ascentGifts(COMPANION_TREES[id], a);
  return { attack: g.attack, stability: g.stability, cheaper: g.cheaper, traits: [companionDef(id).start, ...g.traits], gates: Math.min(TIERS - 1, a.gates) };
}

const SEP = '@';

/** The companion a card is (any build of it), or null. */
export function companionOf(defId: string): CompanionId | null {
  const base = defId.split(SEP)[0];
  return COMPANIONS.find((c) => c.card === base)?.id ?? null;
}

/** A companion's card id for a build (the plain id for the plain build). */
export function companionCardId(id: CompanionId, b: CompanionBuild): string {
  const c = companionDef(id);
  const traits = c.traits.filter((x) => b.traits.includes(x.id)).map((x) => x.id);
  const plain = !b.attack && !b.stability && !b.cheaper && !b.gates && traits.length === 1 && traits[0] === c.start;
  return plain ? c.card : `${c.card}${SEP}${b.attack}.${b.stability}.${b.cheaper}.${traits.join('+') || '-'}${b.gates ? `.${b.gates}` : ''}`;
}

/** The build a companion's card id was made from (null if it isn't one). */
export function companionBuild(defId: string): { id: CompanionId; build: CompanionBuild } | null {
  const id = companionOf(defId);
  if (!id) return null;
  const c = companionDef(id);
  if (!defId.includes(SEP)) return { id, build: plainCompanion(id) };
  const [a, s, ch, traits, gates] = defId.slice(c.card.length + 1).split('.');
  const n = (x: string | undefined, most: number) => Math.max(0, Math.min(most, Math.floor(Number(x) || 0)));
  return {
    id,
    build: {
      attack: n(a, 12),
      stability: n(s, 12),
      cheaper: n(ch, 4),
      traits: traits && traits !== '-' ? traits.split('+').filter((x) => c.traits.some((k) => k.id === x)) : [],
      gates: n(gates, TIERS - 1),
    },
  };
}

const DEFS = new Map<string, CardDef>();

/** A companion's card for an id (built once, then kept), or undefined if the id isn't a companion's. */
export function companionCard(defId: string): CardDef | undefined {
  const cached = DEFS.get(defId);
  if (cached) return cached;
  const got = companionBuild(defId);
  if (!got) return undefined;
  const c = companionDef(got.id), b = got.build;
  const traits = c.traits.filter((x) => b.traits.includes(x.id));
  const all = <K extends 'onPlay' | 'onTurn'>(k: K): Effect[] => traits.flatMap((x) => x.def[k] ?? []);
  const passive: Passive[] = traits.flatMap((x) => x.def.passive ?? []);
  const defence = traits.reduce((n, x) => n + (x.def.defence ?? 0), 0);
  const def: CardDef = {
    id: defId,
    name: c.titles[b.gates] ?? c.name,
    kind: c.kind,
    ...(c.race !== undefined ? { race: c.race } : {}),
    rarity: 'stellar',
    character: true,
    // (Each Astral Gate passed: stronger, and an energy dearer.)
    cost: Math.max(0, c.base.cost + b.gates * GATE.cost - b.cheaper),
    health: c.base.health + 2 * (b.stability + b.gates * GATE.stability),
    attack: c.base.attack + b.attack + b.gates * GATE.attack,
    ...(b.gates ? { ascended: b.gates } : {}),
    text: traits.map((x) => x.text).join(' '),
    ...(all('onPlay').length ? { onPlay: all('onPlay') } : {}),
    ...(all('onTurn').length ? { onTurn: all('onTurn') } : {}),
    ...(passive.length ? { passive } : {}),
    ...(defence ? { defence } : {}),
    ...(traits.some((x) => x.def.darkspeed) ? { darkspeed: true } : {}),
    ...(defId !== c.card ? { artOf: c.card } : {}),
  };
  DEFS.set(defId, def);
  return def;
}

/** The experience a companion takes from a battle's acts. */
export const xpFromActs = (id: CompanionId, a: Acts): number => {
  const w = companionDef(id).learns;
  return Math.floor((w.damage ?? 0) * a.damage + (w.support ?? 0) * a.support + (w.kills ?? 0) * a.kills);
};

/** The experience to rise from a level to the next. */
export const companionXpToNext = (level: number) => 10 + 6 * level;

/** A companion's level for the experience it has, the experience into it and what the next needs. */
export function companionLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1, left = Math.max(0, Math.floor(xp));
  while (left >= companionXpToNext(level)) {
    left -= companionXpToNext(level);
    level++;
  }
  return { level, into: left, need: companionXpToNext(level) };
}


