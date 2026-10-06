import { addCardSource, cardDef, CARDS } from '../cards';
import type { CardDef, Effect } from '../types';
import { CAMPAIGN } from './balance';
import { VOYAGE_POOL } from './pool';

/**
 * The space adventure's versions of cards. A campaign battle is ship to ship: every card stands in a room from the start (there is
// no hand, no deck and no Lightspeed slot), and a card is activated from its room, for its cost, to fire its
// play effect again. Some cards' ideas don't carry over, so each card has a campaign version, "cmp:" and its
// id, made from it here:
// - Drawing a card stabilises an ally instead (the engine does that in a campaign battle); the text says so.
// - Recall (back to your hand) and Recover (from your discard pile) become stabilising: 2 and 1.
// - A Lightspeed card is no longer set face down: it is a room card whose activation fires what it did when
//   it sprang (a counter with nothing else to it shields instead). A guard's or ambusher's Lightspeed clause
//   simply goes.
*/

const CMP = 'cmp:';
export const campaignCardId = (id: string) => (id.startsWith(CMP) ? id : `${CMP}${id}`);
export const isCampaignCard = (id: string) => id.startsWith(CMP);
/** The card a campaign version is made from (any other card: itself). */
export const baseCardId = (id: string) => (id.startsWith(CMP) ? id.slice(CMP.length) : id);

/** "Draw 2" as it reads in a campaign battle: "Stabilise 2" (the most worn ally). */
export function campaignWords(text: string): string {
  return text.replace(/\b([Dd])raws? (\d+|X)(?: more)?(?: cards?)?/g, (_, d: string, n: string) => `${d === 'D' ? 'S' : 's'}tabilise ${n}`);
}

/** An effect as it works in a campaign battle (Recall and Recover stabilise instead). */
function campaignEffect(e: Effect): Effect {
  if (e.type === 'recall') return { type: 'draw', amount: 2 };
  if (e.type === 'recover') return { type: 'draw', amount: Math.max(1, e.orDraw ?? 1) };
  // (Halting a rival's plays means nothing on your own day, when it would be used: it shields instead.)
  if (e.type === 'halt') return { type: 'shield', amount: 2 };
  return e;
}
/** A card's effects in a campaign battle: each made over, and stabilising added up into one. */
function campaignEffects(list?: Effect[]): Effect[] | undefined {
  if (!list) return list;
  const out: Effect[] = [];
  for (const e of list.map(campaignEffect)) {
    const prev = out.find((x) => x.type === 'draw' && e.type === 'draw' && !x.plus && !e.plus) as Extract<Effect, { type: 'draw' }> | undefined;
    if (prev && e.type === 'draw') prev.amount += e.amount;
    else out.push(e.type === 'draw' ? { ...e } : e);
  }
  return out;
}

function campaignText(def: CardDef): string {
  let t = def.text;
  if (def.kind === 'lightspeed') {
    // "{lightspeed}. When an enemy plays an attack card, cancel it and {heat:1} to them." → "{heat:1} to them."
    const after = t.replace(/^\{lightspeed\}\.\s*/, '').replace(/^When [^,]*,\s*/, '');
    t = after
      .replace(/^(first|cancel (it|that))( and)?[.,]?\s*/i, '')
      .replace(/^(first|cancel (it|that))( and)?[.,]?\s*/i, '')
      .replace(/\{heat:(\d+)\} to your sun\.?/, '')
      .trim();
    if (!/\{/.test(t) && !/Draw/.test(t)) t = '{shield:3}.';
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  t = t.replace(/\s*\{lightspeed\} for 1 more energy:.*$/, '');
  t = t.replace(/\s*When you \{recover\} this,[^.]*\./g, '');
  t = t.replace(/\s*They may play no more cards today\./, ' {shield:2}.');
  t = t.replace(/\{recall\}/g, 'Stabilise 2').replace(/\{recover(?::[a-z]+)?\}( your last discarded card)?/g, 'Stabilise 1');
  t = campaignWords(t);
  // ("Stabilise 1. Stabilise 1." reads as one.)
  t = t.replace(/Stabilise (\d+)\.\s*Stabilise (\d+)/g, (_, a: string, b: string) => `Stabilise ${Number(a) + Number(b)}`);
  return t.trim();
}

const CAMPAIGN_DEFS = new Map<string, CardDef>();
function campaignDef(id: string): CardDef | undefined {
  if (!isCampaignCard(id)) return undefined;
  const cached = CAMPAIGN_DEFS.get(id);
  if (cached) return cached;
  let base: CardDef;
  try {
    base = cardDef(id.slice(CMP.length));
  } catch {
    return undefined;
  }
  const def: CardDef = {
    ...base,
    id,
    campaignOf: base.id,
    text: campaignText(base),
    onPlay: campaignEffects(base.onPlay),
    onTurn: campaignEffects(base.onTurn),
    onDusk: campaignEffects(base.onDusk),
    abilities: base.abilities?.map((a) => ({ ...a, effects: campaignEffects(a.effects) ?? [] })),
    lightspeed: undefined,
    onRecover: undefined,
  };
  if (base.kind === 'lightspeed') {
    const sprung = (base.lightspeed?.effects ?? []).filter((e) => e.type !== 'selfHeat').map(campaignEffect);
    def.kind = 'defence';
    def.onPlay = sprung.length ? sprung : [{ type: 'shield', amount: 3 }];
  }
  // A card that gives energy as it is activated costs more than it gives (else it would pay for itself).
  const gives = (def.onPlay ?? []).reduce((n, e) => n + (e.type === 'plays' ? e.amount : 0), 0);
  if (gives > 0) def.cost = Math.max(def.cost ?? 1, gives + 1);
  // An X card spends at most so much: a ship's energy carries over (see rules.ts).
  if (def.spendAll) def.text = def.text.replace('{spend}.', `{spend} (at most ${CAMPAIGN.maxX}).`);
  Object.assign(def, OVERRIDES[base.id] ?? {});
  CAMPAIGN_DEFS.set(id, def);
  return def;
}

/**
 * Hand-written campaign versions, where the made-over card doesn't read or play right aboard a ship: what is
 * given here replaces the generated card's own (its text, effects, cost...).
 */
const OVERRIDES: Record<string, Partial<CardDef>> = {
  // (Neighbours sent back to hand are knocked out of their rooms for a day: rules.ts.)
  event_horizon: { text: '{destroy:any}. Its neighbours are knocked out of their rooms for a day. {heat:2}.' },
};

addCardSource(campaignDef);

/** Cards the adventure offers (space stations, rewards): its own list, so a new card game card isn't in it until added. */
export const VOYAGE_CARDS = new Set(VOYAGE_POOL);
export const voyageCards = () => CARDS.filter((c) => VOYAGE_CARDS.has(c.id));
