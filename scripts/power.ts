/**
 * A rough power budget: every card's worth in points (about one point per heat dealt), so cards of the same
 * cost can be compared and the outliers found. Usage: npm run power -- [cost] (all costs if unset).
 * Weights are judgement, tuned so plain cards of a cost land together; what matters is the spread within a cost.
 */
import { CARDS } from '../src/engine/cards';
import { baseStability, cardCost } from '../src/engine/game';
import { raceTrait } from '../src/engine/races';
import type { CardDef, Effect, Passive } from '../src/engine/types';

const W: Record<string, number> = {
  heat: 1, cool: 1, shield: 0.75, draw: 1, energy: 1, plays: 1, recover: 2, recall: 2, restore: 0.5,
  repair: 0.5, erode: 0.5, plant: 1, orbit: 0.5, selfHeat: -1, grow: 0.5, empower: 1.2,
};
/** What a scaling bonus ("+1 per 2 attack cards", "+2 with 4+ cards") is usually worth on top: about half its reach. */
function plus(e: { amount: number; plus?: { of: string; per?: number; amount?: number }; max?: number }): number {
  if (!e.plus) return 0;
  if (e.max) return Math.max(0, (e.max - e.amount) * 0.5);
  if (e.plus.of === 'planet') return (e.plus.amount ?? 1) / 3;
  if (e.plus.of === 'spent') return e.amount * 1.2;
  return 1;
}
/** One effect, once. */
function once(e: Effect): number {
  const a = 'amount' in e ? (e.amount as number) : 1;
  let v: number;
  switch (e.type) {
    case 'heat': v = (a + plus(e as never)) * (e.pierce ? 1.5 : 1); break;
    case 'cool': case 'shield': case 'draw': v = (a + plus(e as never)) * W[e.type]; break;
    // (Heat on your own sun costs the overheating races less: they want to run hot.)
    case 'selfHeat': v = a * (HOT_RACE ? -0.6 : -1); break;
    case 'destroy': v = 1.2 + 0.5 * (e.maxDefence ?? 4) + (e.neighbours ? 1.5 : 0); break;
    case 'bounce': v = 1 + 0.4 * (e.maxDefence ?? 4); break;
    case 'erode': v = a * W.erode * (e.all ? 2 : 1); break;
    case 'restore': v = a * W.restore * (e.all ? 2.5 : 1); break;
    case 'recover': case 'recall': v = W[e.type]; break;
    case 'halt': v = 2; break;
    default: v = a * (W[e.type] ?? 0.8);
  }
  // A condition: about half the time.
  return e.if ? v * 0.55 : v;
}
let HOT_RACE = false;
const sum = (l: Effect[] | undefined) => (l ?? []).reduce((t, e) => t + once(e), 0);
function passive(p: Passive, life: number): number {
  switch (p.type) {
    case 'kindBonus': return p.amount * life * 0.8;
    case 'retaliate': return p.amount * 0.6 * life * 0.5;
    case 'taunt': return 0.8;
    case 'extraPlay': return p.amount * 1.4 * life * 0.6;
    case 'adjacent': return p.amounts.reduce((a, b) => a + b, 0) * life * 0.35;
    case 'guard': return p.amounts.reduce((a, b) => a + b, 0) * 0.5;
    default: return 0.8;
  }
}
export function power(c: CardDef): number {
  HOT_RACE = c.race === 1 || c.race === 7;
  const stab = baseStability(c.id) - (raceTrait(c.race)?.stability ?? 0);
  // Days it works from play: dawn effects from the next dawn on, about stability − 1 of them (most leave earlier).
  // (Each dawn or dusk it lives through is worth about 0.75 of a one-off: it can be removed first.)
  const life = Math.max(1, Math.min(4, stab - 1) * 0.75);
  if (c.spendAll) return NaN;
  let v = sum(c.onPlay) + sum(c.onTurn) * life + sum(c.onDusk) * life + sum(c.onLeave) * 0.7 + sum(c.onRecover) * 0.5;
  for (const p of c.passive ?? []) v += passive(p, life);
  if (c.defence) v += c.defence * 0.45;
  if (c.attack) v += c.attack * 1.1 * life;
  if (c.lightspeed) {
    const ls = 0.8 + sum(c.lightspeed.effects) + (c.lightspeed.counter ? 1.5 : 0);
    // (A card that is either played or set face down for more energy: worth the better of the two, at its cost.)
    v = c.kind === 'lightspeed' ? v + ls : Math.max(v, ls * 0.7);
  }
  if (c.choices) v += 1.5;
  if (c.attune) v += c.attune * 0.8;
  return Math.round(v * 10) / 10;
}

if (process.env.POWER_MAIN !== "0") {
  const want = process.argv[2] !== undefined ? Number(process.argv[2]) : null;
  const cards = CARDS.filter((c) => c.kind !== 'command' && c.kind !== 'global' && !c.fusedFrom && !c.token && (want === null || cardCost(c.id) === want));
  const byCost = new Map<number, CardDef[]>();
  for (const c of cards) byCost.set(cardCost(c.id), [...(byCost.get(cardCost(c.id)) ?? []), c]);
  for (const [cost, list] of [...byCost].sort((a, b) => a[0] - b[0])) {
    const vals = list.map(power).filter((x) => !isNaN(x)).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    console.log(`\n== cost ${cost}: ${list.length} cards, median ${med}`);
    for (const c of [...list].sort((a, b) => power(b) - power(a))) {
      const p = power(c);
      const flag = isNaN(p) ? 'X' : p > 3.4 * Math.max(1, cost) ? '▲' : p < 2.5 * Math.max(1, cost) ? '▼' : ' ';
      console.log(`${flag} ${p.toFixed(1).padStart(5)}  ${c.id.padEnd(26)} ${c.text}`);
    }
  }
}
