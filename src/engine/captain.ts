import type { CardDef, Effect, HeroAbility } from './types';
import { act, hero } from './heroes-battle';

/**
 * The Captain: the nameless human every run begins with [direction: players start as a no-name human hero with
 * very few abilities; the standard heroes only come through Power Struggles; petals upgrade the hero: "how strong is
 * this card in battle and what abilities does it have"].
 *
 * The Captain's card is built from what petals have bought (meta.ts): its attack, its stability, its cost, the
 * abilities it carries into battle and how it leads. What was bought is written into the card's id
 * (`human_captain@attack.stability.cheaper.ability+ability.lead`), as a fused or marked card's is, so a saved battle or
 * a replay always reads the very card that fought. The plain Captain is `human_captain`.
 */

export const CAPTAIN = 'human_captain';
const SEP = '@';

/** What petals have made of the Captain. */
export interface CaptainBuild {
  /** Attack added (levels bought). */
  attack: number;
  /** Stability levels bought (each CAPTAIN_STABILITY_STEP more). */
  stability: number;
  /** Energy off its cost (levels bought). */
  cheaper: number;
  /** The abilities it carries into battle (at most its slots). */
  abilities: string[];
  /** How it leads (a lasting effect while in play), if one is chosen. */
  lead?: string;
}

/** The plain Captain: no attack, a little stability, two energy to play, and one small ability. */
export const CAPTAIN_BASE = { cost: 2, stability: 3, attack: 0 };
export const CAPTAIN_STABILITY_STEP = 2;
export const CAPTAIN_START_ABILITY = 'brace';

/** An ability the Captain can learn: its card text, effects and cost to use, and its price in petals. */
export interface CaptainAbility {
  id: string;
  price: number;
  ability: HeroAbility;
}

const ab = (id: string, price: number, name: string, text: string, effects: Effect[], cost: Parameters<typeof act>[4] = {}): CaptainAbility => ({ id, price, ability: act(id, name, text, effects, cost) });

/** Everything the Captain can learn, cheapest first. */
export const CAPTAIN_ABILITIES: CaptainAbility[] = [
  ab('brace', 0, 'Brace', '{shield:1}.', [{ type: 'shield', amount: 1 }]),
  ab('patch', 3, 'Patch Up', '{cool:1}.', [{ type: 'cool', amount: 1 }]),
  ab('scout', 4, 'Scout', 'Draw 1.', [{ type: 'draw', amount: 1 }], { stability: 1 }),
  ab('volley', 5, 'Volley', '{heat:2}.', [{ type: 'heat', amount: 2, to: 'target' }]),
  ab('bulwark', 6, 'Bulwark', '{shield:3}.', [{ type: 'shield', amount: 3 }]),
  ab('vent', 6, 'Vent', '{cool:2}.', [{ type: 'cool', amount: 2 }]),
  ab('strafe', 8, 'Strafe', '{heat:3}.', [{ type: 'heat', amount: 3, to: 'target' }], { selfHeat: 2 }),
  ab('overdrive', 8, 'Overdrive', '{energy:1}.', [{ type: 'plays', amount: 1 }], { stability: 1 }),
  ab('rally', 10, 'Rally', '{chosen}: +2 attack to a card.', [{ type: 'empower', amount: 2 }]),
  ab('mend', 10, 'Mend', '{renew:1}.', [{ type: 'restore', amount: 1, all: true }]),
];
export const captainAbility = (id: string) => CAPTAIN_ABILITIES.find((a) => a.id === id);

/** Ability slots: one to start, more bought (their prices). */
export const CAPTAIN_SLOT_PRICES = [6, 12];
export const captainSlots = (bought: number) => 1 + Math.min(bought, CAPTAIN_SLOT_PRICES.length);

/** How the Captain can lead (one at a time): a lasting effect while it is in play. */
export interface CaptainLead {
  id: string;
  name: string;
  price: number;
  text: string;
  def: Pick<CardDef, 'onTurn' | 'onPlay' | 'passive'>;
}
export const CAPTAIN_LEADS: CaptainLead[] = [
  { id: 'steady', name: 'Steady Hand', price: 12, text: '{dawn}: {cool:1}.', def: { onTurn: [{ type: 'cool', amount: 1 }] } },
  { id: 'iron', name: 'Iron Will', price: 12, text: '{dawn}: {shield:1}.', def: { onTurn: [{ type: 'shield', amount: 1 }] } },
  { id: 'salvo', name: 'Opening Salvo', price: 14, text: '{heat:3}.', def: { onPlay: [{ type: 'heat', amount: 3, to: 'target' }] } },
  { id: 'gunnery', name: 'Gunnery Drill', price: 16, text: 'Your attack cards {heat:+1}.', def: { passive: [{ type: 'kindBonus', kind: 'attack', amount: 1 }] } },
];
export const captainLead = (id: string | undefined) => CAPTAIN_LEADS.find((l) => l.id === id);

/** Stat upgrades: the price of each level, in petals (their count is the most). */
export const CAPTAIN_STAT_PRICES = {
  attack: [5, 9, 14],
  stability: [3, 6, 10, 15],
  cheaper: [8, 16],
} as const;
export type CaptainStat = keyof typeof CAPTAIN_STAT_PRICES;

export const plainBuild = (): CaptainBuild => ({ attack: 0, stability: 0, cheaper: 0, abilities: [CAPTAIN_START_ABILITY] });

/** The Captain's card id for a build (the plain id for the plain Captain). */
export function captainId(b: CaptainBuild): string {
  const abilities = b.abilities.filter((a) => captainAbility(a)).slice(0, captainSlots(CAPTAIN_SLOT_PRICES.length));
  const plain = !b.attack && !b.stability && !b.cheaper && !b.lead && abilities.length === 1 && abilities[0] === CAPTAIN_START_ABILITY;
  if (plain) return CAPTAIN;
  return `${CAPTAIN}${SEP}${b.attack}.${b.stability}.${b.cheaper}.${abilities.join('+') || '-'}.${b.lead ?? '-'}`;
}

/** Whether a card is the Captain (any build of it). */
export const isCaptain = (id: string) => id === CAPTAIN || id.startsWith(CAPTAIN + SEP);

/** The build a Captain's card id was made from (null if it isn't one). */
export function captainBuild(id: string): CaptainBuild | null {
  if (id === CAPTAIN) return plainBuild();
  if (!id.startsWith(CAPTAIN + SEP)) return null;
  const [a, s, c, abilities, lead] = id.slice(CAPTAIN.length + 1).split('.');
  const n = (x: string | undefined, most: number) => Math.max(0, Math.min(most, Math.floor(Number(x) || 0)));
  return {
    attack: n(a, CAPTAIN_STAT_PRICES.attack.length),
    stability: n(s, CAPTAIN_STAT_PRICES.stability.length),
    cheaper: n(c, CAPTAIN_STAT_PRICES.cheaper.length),
    abilities: abilities && abilities !== '-' ? abilities.split('+').filter((x) => captainAbility(x)) : [],
    ...(captainLead(lead) ? { lead } : {}),
  };
}

const DEFS = new Map<string, CardDef>();

/** The Captain's card for an id (built once, then kept), or undefined if the id isn't the Captain's. */
export function captainDef(id: string): CardDef | undefined {
  const cached = DEFS.get(id);
  if (cached) return cached;
  const b = captainBuild(id);
  if (!b) return undefined;
  const lead = captainLead(b.lead);
  const def = hero(
    {
      id,
      name: 'The Captain',
      stability: CAPTAIN_BASE.stability + b.stability * CAPTAIN_STABILITY_STEP,
      cost: Math.max(0, CAPTAIN_BASE.cost - b.cheaper),
      attack: CAPTAIN_BASE.attack + b.attack,
      ...(lead ? { lead: lead.text, ...lead.def } : {}),
      artOf: CAPTAIN,
    },
    b.abilities.map((x) => captainAbility(x)!.ability),
  );
  DEFS.set(id, def);
  return def;
}
