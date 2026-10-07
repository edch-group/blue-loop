/**
 * A points budget: every card's worth in "heat" points (one point per heat dealt, or the like), so cards can be
 * compared across costs and the outliers found. Usage: npm run power -- [cost] (all costs if unset); TOP=n lists
 * only the n furthest from their cost's budget.
 *
 * What a card is worth: its one-off effects, plus each dawn effect once for every point of stability (a dawn
 * card fires each dawn, then loses 1), each dusk effect and its attack one time fewer (they rest the day it
 * lands), each later use a little less (it may be removed first). Stability is the card's own, without its race's
 * trait: a race's traits are paid for at the race's level. The budget for a cost is fitted to all the cards'.
 */
import { CARDS } from '../src/engine/cards';
import { cardCost } from '../src/engine/game';
import type { CardDef, Effect, Passive } from '../src/engine/types';

const W: Record<string, number> = {
  heat: 1, cool: 1, shield: 0.75, draw: 1, energy: 1, plays: 1, recover: 2, recall: 2, restore: 0.5,
  repair: 0.5, erode: 0.5, plant: 1, orbit: 0.5, selfHeat: -1, grow: 0.5, empower: 1.5,
};
/** A later trigger is worth this much of the one before (the card may be gone). */
const KEEP = 0.85;
const uses = (n: number) => Array.from({ length: Math.max(0, n) }, (_, k) => KEEP ** k).reduce((a, b) => a + b, 0);

let HOT_RACE = false;
/** What a scaling bonus ("+1 per 2 attack cards", "+2 with 4+ cards") usually adds: about half its reach. */
function plus(e: { amount: number; plus?: { of: string; per?: number; amount?: number }; max?: number }): number {
  if (!e.plus) return 0;
  if (e.max) return Math.max(0, (e.max - e.amount) * 0.5);
  if (e.plus.of === 'planet') return (e.plus.amount ?? 1) / 3;
  if (e.plus.of === 'spent') return e.amount * 1.2;
  return 1;
}
function once(e: Effect): number {
  const a = 'amount' in e ? (e.amount as number) : 1;
  let v: number;
  switch (e.type) {
    case 'heat': v = (a + plus(e as never)) * (e.pierce ? 1.5 : 1); break;
    case 'cool': case 'shield': case 'draw': v = (a + plus(e as never)) * W[e.type]; break;
    // (Heat on your own sun costs the overheating races less: they want to run hot.)
    case 'selfHeat': v = a * (HOT_RACE ? -0.6 : -1); break;
    case 'destroy': v = 1.5 + 0.5 * (e.maxDefence ?? 4) + (e.neighbours ? 1.5 : 0); break;
    case 'bounce': v = 1 + 0.4 * (e.maxDefence ?? 4); break;
    // (Moving a card: a better slot or neighbours for one of yours; a rival's out of its resonance, or into reach.)
    case 'shift': v = e.enemy ? 1.5 : 1; break;
    case 'erode': v = a * W.erode * (e.all ? 2 : 1); break;
    case 'restore': v = a * W.restore * (e.all ? 2.5 : 1); break;
    case 'recover': case 'recall': v = W[e.type]; break;
    case 'grow': v = (e.max ?? 3) * 0.5; break;
    case 'halt': v = 2; break;
    default: v = a * (W[e.type] ?? 0.8);
  }
  // A condition: about half the time.
  return e.if ? v * 0.55 : v;
}
const sum = (l: Effect[] | undefined) => (l ?? []).reduce((t, e) => t + once(e), 0);
function passive(p: Passive, days: number): number {
  switch (p.type) {
    case 'kindBonus': return p.amount * 1.5 * days; // (about one and a half of your cards benefit each day)
    case 'retaliate': return p.amount * 0.6 * days * 0.6;
    case 'taunt': return 1;
    case 'extraPlay': return p.amount * days;
    case 'adjacent': return p.amounts.reduce((a, b) => a + b, 0) * days * 0.6;
    case 'guard': return p.amounts.reduce((a, b) => a + b, 0) * 0.5 * days * 0.5;
    case 'keepShields': return 1.5 * days;
    default: return 0.8 * days;
  }
}
/** Days a card is counted on to work: cards no longer fade, so about a game's worth for any that stays (one for a card that does nothing after it is played). */
function stab(c: CardDef): number {
  if (!c.onTurn?.length && !c.onDusk?.length && !c.passive?.length && !c.choices?.length && !c.attune) return 1;
  return 4;
}
export function power(c: CardDef): number {
  if (c.spendAll) return NaN;
  HOT_RACE = c.race === 1 || c.race === 7;
  const s = Math.min(stab(c), cardCost(c.id) <= 1 ? 2 : 99);
  const dawns = uses(s);
  const later = uses(s - 1);
  let v = sum(c.onPlay) + sum(c.onTurn) * dawns + sum(c.onDusk) * later + sum(c.onLeave) * 0.7 + sum(c.onRecover) * 0.5;
  for (const p of c.passive ?? []) v += passive(p, dawns);
  if (c.defence) v += c.defence * 0.5;
  if (c.attack) v += c.attack * 0.9 * later;
  if (c.lightspeed) {
    const ls = 0.8 + sum(c.lightspeed.effects) + (c.lightspeed.counter ? 1.5 : 0);
    // (A card that is either played or set face down for more energy: worth the better of the two, at its cost.)
    v = c.kind === 'lightspeed' ? v + ls : Math.max(v, ls * 0.7);
  }
  if (c.choices) v += 1.5;
  if (c.attune) v += c.attune * dawns * 0.5;
  return Math.round(v * 10) / 10;
}
/** What a card of this cost should be worth. */
export const budgetFor = (cost: number) => (cost <= 0 ? 1.5 : 2.5 * cost + 0.5);
/** The cost a card's worth calls for. */
export const costFor = (p: number) => Math.max(0, Math.round((p - 0.5) / 2.5));
export const pool = () => CARDS.filter((c) => c.kind !== 'command' && c.kind !== 'global' && c.kind !== 'relic' && !c.fusedFrom && !c.token && !c.fusion);

if (process.env.POWER_MAIN !== '0') {
  const want = process.argv[2] !== undefined ? Number(process.argv[2]) : null;
  const all = pool().filter((c) => !isNaN(power(c)));
  // The budget: about 2.5 points an energy (fitted to the cards' medians: 1 → 3, 2 → 5.5, 3 → 8, 4 → 10.5).
  const budget = new Map<number, number>();
  for (const c of all) budget.set(cardCost(c.id), budgetFor(cardCost(c.id)));
  const rows = all
    .filter((c) => want === null || cardCost(c.id) === want)
    .map((c) => ({ c, p: power(c), b: budget.get(cardCost(c.id))! }))
    .map((r) => ({ ...r, off: r.p / r.b }))
    .sort((a, b) => Math.abs(Math.log(b.off)) - Math.abs(Math.log(a.off)));
  console.log('budget by cost:', [...budget].sort((a, b) => a[0] - b[0]).map(([c, b]) => `${c}: ${b}`).join(' · '));
  for (const r of rows.slice(0, Number(process.env.TOP ?? rows.length))) {
    const flag = r.off > 1.35 ? '▲' : r.off < 0.7 ? '▼' : ' ';
    console.log(`${flag} c${cardCost(r.c.id)}→${costFor(r.p)} ${(r.off * 100).toFixed(0).padStart(4)}%  ${r.p.toFixed(1).padStart(5)}  r${String(r.c.race ?? '-').padEnd(2)} ${r.c.kind.padEnd(10)} ${r.c.id.padEnd(26)} ${r.c.text}`);
  }
}
