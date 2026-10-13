import type { CardDef, CardKind, Effect, Passive } from './types';

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
  /** Stat levels' prices, in its own skill points. Stability: +2 a level. */
  stats: { attack: number[]; stability: number[]; cheaper: number[] };
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
    base: { cost: 3, health: 4, attack: 3 },
    stats: { attack: [1, 2, 3], stability: [1, 1, 2], cheaper: [2, 3] },
    start: 'lunge',
    traits: [
      t('lunge', 'Lunge', 0, '{heat:1}.', { onPlay: [heat(1)] }),
      t('charge', 'Charge', 2, '{darkspeed}.', { darkspeed: true }),
      t('halo', 'Halo', 2, '{dawn}: {shield:1}.', { onTurn: [{ type: 'shield', amount: 1 }] }),
      t('sunlance', 'Sun-Lance', 3, '{dawn}: {heat:1}.', { onTurn: [heat(1)] }),
      t('plate', 'Gilded Plate', 2, '{sturdy:2}.', { defence: 2 }),
      t('zeal', 'Zeal', 4, 'Your attack cards {heat:+1}.', { passive: [{ type: 'kindBonus', kind: 'attack', amount: 1 }] }),
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
    base: { cost: 2, health: 4, attack: 0 },
    stats: { attack: [2, 2], stability: [1, 1, 2], cheaper: [2] },
    start: 'emitter',
    traits: [
      t('emitter', 'Emitter', 0, '{dawn}: {shield:1}.', { onTurn: [{ type: 'shield', amount: 1 }] }),
      t('coolant', 'Coolant Flush', 1, '{cool:2}.', { onPlay: [{ type: 'cool', amount: 2 }] }),
      t('weld', 'Field Weld', 2, '{dawn}: {renew:1}.', { onTurn: [{ type: 'restore', amount: 1, all: true }] }),
      t('barrier', 'Barrier', 2, '{shield:3}.', { onPlay: [{ type: 'shield', amount: 3 }] }),
      t('sink', 'Heat Sink', 3, '{dawn}: {cool:1}.', { onTurn: [{ type: 'cool', amount: 1 }] }),
      t('bulwark', 'Bulwark', 3, '{guard}. {sturdy:2}.', { defence: 2, passive: [{ type: 'taunt' }] }),
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
    base: { cost: 3, health: 5, attack: 2 },
    stats: { attack: [1, 2, 3], stability: [1, 2], cheaper: [2, 3] },
    start: 'shardstep',
    traits: [
      t('shardstep', 'Shardstep', 0, '2 heat to the rival card with the most attack.', { onPlay: [{ type: 'strikeBest', amount: 2 }] }),
      t('edge', 'Shard Edge', 2, '{sting:2}.', { passive: [{ type: 'retaliate', amount: 2 }] }),
      t('hunt', 'Hunt', 3, '{dawn}: 1 heat to the rival card with the most attack.', { onTurn: [{ type: 'strikeBest', amount: 1 }] }),
      t('swift', 'Swift', 2, '{darkspeed}.', { darkspeed: true }),
      t('shatter', 'Shatterstorm', 4, '2 heat to each rival card.', { onPlay: [{ type: 'strikeAll', amount: 2 }] }),
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

/** What a companion's tree has made of its card. */
export interface CompanionBuild {
  attack: number;
  stability: number;
  cheaper: number;
  traits: string[];
}
export type CompanionStat = 'attack' | 'stability' | 'cheaper';

export const plainCompanion = (id: CompanionId): CompanionBuild => ({ attack: 0, stability: 0, cheaper: 0, traits: [companionDef(id).start] });

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
  const plain = !b.attack && !b.stability && !b.cheaper && traits.length === 1 && traits[0] === c.start;
  return plain ? c.card : `${c.card}${SEP}${b.attack}.${b.stability}.${b.cheaper}.${traits.join('+') || '-'}`;
}

/** The build a companion's card id was made from (null if it isn't one). */
export function companionBuild(defId: string): { id: CompanionId; build: CompanionBuild } | null {
  const id = companionOf(defId);
  if (!id) return null;
  const c = companionDef(id);
  if (!defId.includes(SEP)) return { id, build: plainCompanion(id) };
  const [a, s, ch, traits] = defId.slice(c.card.length + 1).split('.');
  const n = (x: string | undefined, most: number) => Math.max(0, Math.min(most, Math.floor(Number(x) || 0)));
  return {
    id,
    build: {
      attack: n(a, c.stats.attack.length),
      stability: n(s, c.stats.stability.length),
      cheaper: n(ch, c.stats.cheaper.length),
      traits: traits && traits !== '-' ? traits.split('+').filter((x) => c.traits.some((k) => k.id === x)) : [],
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
    name: c.name,
    kind: c.kind,
    ...(c.race !== undefined ? { race: c.race } : {}),
    rarity: 'stellar',
    character: true,
    cost: Math.max(0, c.base.cost - b.cheaper),
    health: c.base.health + 2 * b.stability,
    attack: c.base.attack + b.attack,
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

/** Skill points a build cost in all. */
export function companionSpent(id: CompanionId, b: CompanionBuild): number {
  const c = companionDef(id);
  let n = 0;
  for (const k of ['attack', 'stability', 'cheaper'] as const) n += c.stats[k].slice(0, b[k]).reduce((x, y) => x + y, 0);
  for (const tr of c.traits) if (b.traits.includes(tr.id)) n += tr.price;
  return n;
}
