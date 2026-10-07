/**
 * Strictly-worse cards (see scripts/dominated.ts): every pair where one card beats another outright. It
 * costs no more, has every effect at least as strong (and one stronger, or costs less), no extra drawback,
 * and fits the same decks. `raceOverNeutral`: also a race card beating a neutral one (the neutral card is
 * then dead weight in that race's decks).
 */
import { allCardDefs, CARDS } from '../src/engine/cards';
import { inMode, underRules, type GameMode } from '../src/engine/modes';
import { baseStability, cardCost } from '../src/engine/game';
import { raceTrait } from '../src/engine/races';
import type { CardDef, Effect, Passive } from '../src/engine/types';

type Vec = Map<string, number>;
const bump = (v: Vec, k: string, n: number) => v.set(k, (v.get(k) ?? 0) + n);
const cond = (e: Effect) => (e.if ? JSON.stringify(e.if) : '');
function effects(v: Vec, when: string, list: Effect[] | undefined) {
  for (const e of list ?? []) {
    const { type, if: _if, ...rest } = e as Effect & Record<string, unknown>;
    const amount = typeof rest.amount === 'number' ? (rest.amount as number) : 1;
    const shape = JSON.stringify({ ...rest, amount: undefined, max: undefined });
    const key = `${when}|${type}|${shape}|${cond(e)}`;
    if (type === 'selfHeat') bump(v, `bad|${when}|selfHeat`, amount);
    else bump(v, key, Math.max(amount, 0.5) + ((rest.max as number) ?? 0) / 100);
  }
}
function passive(v: Vec, p: Passive) {
  const { type, ...rest } = p as Passive & Record<string, unknown>;
  const amounts = 'amounts' in p ? (p.amounts as number[]) : 'amount' in p ? [p.amount as number] : [1];
  const shape = JSON.stringify({ ...rest, amounts: undefined, amount: undefined });
  amounts.forEach((a, i) => bump(v, `passive|${type}|${shape}|${i}`, a));
}
function vec(c: CardDef): Vec {
  const v: Vec = new Map();
  effects(v, 'play', c.onPlay);
  effects(v, 'turn', c.onTurn);
  effects(v, 'dusk', c.onDusk);
  effects(v, 'leave', c.onLeave);
  effects(v, 'recover', c.onRecover);
  for (const p of c.passive ?? []) passive(v, p);
  if (c.choices) bump(v, `choices|${c.choices.map((x) => x.id).join(',')}`, 1);
  if (c.lightspeed) {
    bump(v, `ls|${JSON.stringify(c.lightspeed.trigger)}`, 1);
    if (c.lightspeed.counter) bump(v, 'ls|counter', 1);
    effects(v, 'spring', c.lightspeed.effects);
  }
  if (c.defence) bump(v, 'defence', c.defence);
  if (c.attack) bump(v, 'attack', c.attack);
  if (c.attune) bump(v, 'attune', c.attune);
  if (c.fusion) bump(v, 'fusion', 1);
  // (Consume is a cost: a card given up to play it.)
  if (c.consume) bump(v, 'bad|consume', 1);
  if (c.onTurn?.length || c.onDusk?.length || c.passive?.length || c.attune || c.attack) bump(v, 'stability', baseStability(c.id) - (c.kind === 'command' ? 0 : raceTrait(c.race)?.stability ?? 0)); // (a race's trait is the race's, not the card's)
  return v;
}
export function dominatedPairs(raceOverNeutral = false, anyRace = false, mode?: GameMode): string[] {
  return underRules(mode ?? 'lost', () => pairs(raceOverNeutral, anyRace, mode));
}

function pairs(raceOverNeutral: boolean, anyRace: boolean, mode?: GameMode): string[] {
// b can replace a in every deck a fits (neutral b), or in a's race's decks: a race card that beats a neutral
// one makes the neutral card dead weight in that race's decks.
const fits = (a: CardDef, b: CardDef) => anyRace || b.race === undefined || b.race === a.race || (raceOverNeutral && a.race === undefined);
// (In a mode: its own pool, as the cards play there.)
const cards = (mode ? allCardDefs().filter((c) => inMode(c, mode)) : CARDS).filter((c) => !c.fusedFrom && c.kind !== 'global' && !c.spendAll);
const vecs = new Map(cards.map((c) => [c.id, vec(c)]));
const found: string[] = [];
for (const a of cards) {
  for (const b of cards) {
    if (a === b || !fits(a, b) || cardCost(b.id) > cardCost(a.id) || (a.kind === 'lightspeed') !== (b.kind === 'lightspeed') || (a.kind === 'command') !== (b.kind === 'command') || (a.kind === 'relic') !== (b.kind === 'relic')) continue; // (A Relic lasts but is brittle: no match for anything else)
    const va = vecs.get(a.id)!, vb = vecs.get(b.id)!;
    let better = cardCost(b.id) < cardCost(a.id);
    let ok = true;
    for (const [k, n] of va) {
      // An unconditional effect is at least as good as the same effect with a condition, with whatever is
      // left of it once it has matched the other card's own unconditional amount.
      const plain = k.replace(/\|[^|]*$/, '|');
      const spare = k.endsWith('|') ? 0 : Math.max(0, (vb.get(plain) ?? 0) - (va.get(plain) ?? 0));
      const m = (vb.get(k) ?? 0) + spare;
      if (k.startsWith('bad|')) continue;
      if (m < n) { ok = false; break; }
      if (m > n) better = true;
    }
    if (!ok) continue;
    for (const [k, m] of vb) {
      if (k.startsWith('bad|')) { if (m > (va.get(k) ?? 0)) { ok = false; break; } if (m < (va.get(k) ?? 0)) better = true; continue; }
      if (!va.has(k)) better = true;
    }
    for (const [k, n] of va) if (k.startsWith('bad|') && (vb.get(k) ?? 0) < n) better = true;
    if (ok && better) found.push(`${a.name} (${cardCost(a.id)}) is beaten by ${b.name} (${cardCost(b.id)})${a.race === undefined && b.race !== undefined ? ' [race card over neutral]' : ''}`);
  }
}
return found;
}
