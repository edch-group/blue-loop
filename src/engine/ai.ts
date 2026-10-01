import { BALANCE } from './balance';
import { cardDef } from './cards';
import {
  activePlayer,
  applyAction,
  canSetLightspeed,
  cardChoices,
  cardCost,
  conditionMet,
  effectAmount,
  enemyChoices,
  isOverheated,
  livingOpponents,
  needsSlot,
  planetAt,
  allyChoices,
  cardDefence,
  freeSlots,
  recoverChoices,
  supernovaThreshold,
  hasRoomFor,
  targetOf,
  dawnEffects,
  turnForecast,
} from './game';
import type { Action, CardInstance, GameState, PlayerState } from './types';

/** A tuning number, overridable from the environment when simulating (npm run simulate); fixed everywhere else. */
function tuning(name: string, fallback: number): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const v = env?.[name];
  return v === undefined ? fallback : Number(v);
}

/** Turns a card in play is expected to keep working, for valuing ongoing effects. */
const HORIZON = 2.5;
/** A rival this close to supernova is worth switching targets to finish. */
const FINISH_RATIO = tuning('FINISH', 0.75);
/** In a free-for-all, switch to the leader once it is this much cooler (as a share of max health) than your usual target. */
const LEADER_GAP = tuning('GAP', 0.25);

/** What one action is worth, roughly (the price of a card that takes two). */
const ACTION_VALUE = tuning('ACTION', 2.5);

/** How much of the heat a rival's next dawn will bring counts as heat already taken. */
const INCOMING_WEIGHT = tuning('INCOMING', 0.8);

/** What a face-down Lightspeed card is worth to its owner (a counter waiting to spring). */
const LIGHTSPEED_VALUE = tuning('LSV', 3);

/** Roughly what a card in play is worth to its owner each day from now on. */
function cardValue(state: GameState, p: PlayerState, card: CardInstance): number {
  const def = cardDef(card.defId);
  const foes = Math.max(1, livingOpponents(state, p).length);
  let perTurn = 0;
  for (const e of dawnEffects(card)) {
    if (!conditionMet(p, e.if) && !(e.if && 'minKind' in e.if)) continue;
    const scale = conditionMet(p, e.if) ? 1 : 0.4;
    switch (e.type) {
      case 'heat':
        perTurn += scale * Math.max(effectAmount(state, p, card, e, 'turn'), e.plus?.of === 'growth' ? 2 : 0);
        break;
      case 'cool':
        perTurn += scale * effectAmount(state, p, card, e, 'turn') * (p.heat > 0 ? 0.9 : 0.35);
        break;
      case 'shield':
        perTurn += scale * effectAmount(state, p, card, e, 'turn') * 0.45;
        break;
      case 'draw':
        perTurn += scale * e.amount * 0.7;
        break;
      case 'selfHeat':
        perTurn -= e.amount * (isOverheated(p) ? 1.1 : 0.7);
        break;
      case 'grow':
        perTurn += 0.3;
        break;
      case 'orbit': {
        // Moving an orbit each day: what one step does to the planets ahead, theirs or yours.
        const who = e.who === 'rival' ? targetOf(state, p) : p;
        if (who) perTurn += (e.who === 'rival' ? -0.6 : 1) * scale * (orbitOutlook(who, e.amount) - orbitOutlook(who)) * 0.5;
        break;
      }
    }
  }
  for (const ps of def.passive ?? []) {
    switch (ps.type) {
      case 'kindBonus': {
        const matching = p.tableau.filter((c) => c.uid !== card.uid && cardDef(c.defId).kind === ps.kind && (cardDef(c.defId).onTurn ?? []).some((e) => e.type === 'heat')).length;
        perTurn += ps.amount * (matching + 0.5);
        break;
      }
      case 'extraPlay':
        perTurn += 1.4 * ps.amount * (ps.planet ? 0.4 : 1);
        break;
      case 'keepShields':
        perTurn += 0.4 + p.shields * 0.1;
        break;
      case 'retaliate':
        perTurn += 0.6 * foes;
        break;
      case 'field':
        perTurn += 0.2;
        break;
      case 'adjacent':
        // Its value shows up in its neighbours' effects; a little extra for future neighbours.
        perTurn += 0.3 * ps.amounts[0];
        break;
      case 'guard':
        perTurn += 0.25 * ps.amounts[0];
        break;
      case 'anchor':
        perTurn += 0.5;
        break;
    }
  }
  if (def.onLeave?.length) perTurn += 0.35;
  // Worth as many turns as it has left (roughly), and a little more where removal cannot reach it.
  const turns = Math.min(card.stability ?? HORIZON, HORIZON + 1);
  return perTurn * turns * (0.85 + 0.05 * cardDefence(p, card));
}

/** What each planet is worth for one turn (an extra card drawn; an extra card played). */
const PLANET_VALUE = { dead: 0, abundant: tuning('ABUND', 0.9), industrial: tuning('INDUS', 1.3) } as const;
/** Own turns of orbit the AI looks ahead. */
const ORBIT_HORIZON = 4;

/** What a player's coming turns are worth from their orbit (from their next day, shifted by `shift`). */
function orbitOutlook(p: PlayerState, shift = 0): number {
  let v = 0;
  for (let k = 1; k <= ORBIT_HORIZON; k++) v += PLANET_VALUE[planetAt(p.orbit + shift + k)] * (1 - (k - 1) * 0.15);
  return v;
}

/** A card in play also blocks a slot until it fades: the cost of that, per turn it stays. */
const SLOT_COST = tuning('SLOT', 0.35);

function tableauValue(state: GameState, p: PlayerState): number {
  return p.tableau.reduce((sum, c) => sum + cardValue(state, p, c) - SLOT_COST * (c.stability ?? 0), 0);
}

/** How good this state is for `meId`: heat on every sun, ongoing value and cards. */
function evaluate(state: GameState, meId: string): number {
  const me = state.players.find((p) => p.id === meId)!;
  if (state.winnerId === meId) return 1e6;
  if (me.eliminated) return -1e6;
  let score = 0;
  for (const o of state.players) {
    if (o.id === meId) continue;
    if (o.eliminated) score += 16;
    else {
      const danger = Math.max(0, o.heat) / supernovaThreshold(o);
      score += 12 * danger + 5 * danger * danger - 0.45 * tableauValue(state, o) - 0.6 * orbitOutlook(o);
    }
  }
  // Count the heat already on its way: what each rival's tableau will do to this sun at their next dawn,
  // past its shields (so a tableau stacked with attack cards is seen coming, and answered in time).
  const incoming = state.players.reduce((sum, o) => {
    if (o.id === meId || o.eliminated || targetOf(state, o)?.id !== meId) return sum;
    return sum + turnForecast(state, o).heat;
  }, 0);
  const landing = Math.max(0, incoming - me.shields);
  const coming = (BALANCE.maxHeatPerDay ? Math.min(landing, BALANCE.maxHeatPerDay) : landing) * INCOMING_WEIGHT;
  const mine = Math.max(0, me.heat + coming) / supernovaThreshold(me);
  score -= 12 * mine + 10 * mine * mine;
  score += tableauValue(state, me) + orbitOutlook(me) + 0.8 * me.hand.length + 0.3 * me.shields + (me.lightspeed ? LIGHTSPEED_VALUE : 0);
  return score;
}

/** Every way to play one card now (placement, choice, removal, recall, restore and recovery choices included). */
function candidatePlays(state: GameState, me: PlayerState): Action[] {
  const plays: Action[] = [];
  const seen = new Set<string>();
  const opt = <T,>(list: T[]): (T | undefined)[] => (list.length ? list : [undefined]);
  for (const card of me.hand) {
    if (seen.has(card.defId)) continue;
    seen.add(card.defId);
    if (cardDef(card.defId).kind === 'lightspeed' && !canSetLightspeed(me)) continue;
    if (cardCost(card.defId) > me.playsLeft) continue;
    const choices = opt(cardChoices(card.defId));
    const foes = opt(enemyChoices(state, me, card.defId).map((c) => c.uid));
    if (!hasRoomFor(me, card.defId)) continue;
    const slots = needsSlot(me, card.defId) ? freeSlots(me) : [undefined];
    // Recovering: one of each card in the discard pile.
    const recovers = opt([...new Map(recoverChoices(me, card.defId).map((c) => [c.defId, c.uid])).values()]);
    const allies = opt(allyChoices(me, card.defId).map((c) => c.uid));
    for (const choice of choices)
      for (const enemyUid of foes)
        for (const slot of slots)
          for (const allyUid of allies)
            for (const recoverUid of recovers) plays.push({ type: 'playCard', cardUid: card.uid, choice, enemyUid, slot, allyUid, recoverUid });
  }
  return plays;
}

/**
 * The rival to focus: the next rival round the table (so the AI does not all
 * gang up on one sun), unless another rival is close enough to finish off.
 */
function bestTarget(state: GameState, me: PlayerState): PlayerState | undefined {
  const foes = livingOpponents(state, me);
  const n = state.players.length;
  const seat = state.players.indexOf(me);
  const left = [...foes].sort((a, b) => ((state.players.indexOf(a) - seat + n) % n) - ((state.players.indexOf(b) - seat + n) % n))[0];
  const ratio = (o: PlayerState) => o.heat / supernovaThreshold(o);
  const nearest = [...foes].sort((a, b) => ratio(b) - ratio(a))[0];
  if (nearest && ratio(nearest) >= FINISH_RATIO && ratio(nearest) > ratio(left)) return nearest;
  // In a free-for-all, rein in the leader: the coolest sun, if it is clearly ahead.
  if (foes.length > 1) {
    const leader = [...foes].sort((a, b) => ratio(a) - ratio(b))[0];
    if (ratio(left) - ratio(leader) >= LEADER_GAP) return leader;
  }
  return left;
}

/**
 * Heuristic AI: returns the next action for the active player. It focuses the
 * rival nearest to supernova, then plays whichever card leaves it best off,
 * until it has no plays (or nothing worth playing) left.
 */
export function chooseAIAction(state: GameState): Action {
  const me = activePlayer(state);
  const focus = bestTarget(state, me);
  if (focus && targetOf(state, me)?.id !== focus.id) return { type: 'setTarget', targetId: focus.id };
  if (me.playsLeft <= 0 || me.hand.length === 0) return { type: 'endTurn' };

  // The AI cannot see its rivals' face-down Lightspeed cards, so it plans as if there were none.
  let view = state;
  if (state.players.some((p) => p.id !== me.id && p.lightspeed)) {
    view = structuredClone(state);
    for (const p of view.players) if (p.id !== me.id) p.lightspeed = null;
  }
  const baseline = evaluate(view, me.id);
  let best: { action: Action; score: number } | null = null;
  for (const action of candidatePlays(view, me)) {
    let next: GameState;
    try {
      next = applyAction(view, action);
    } catch {
      continue;
    }
    // A card that takes two actions also gives up the card that could have been played with the second.
    const extra = action.type === 'playCard' ? cardCost(me.hand.find((c) => c.uid === action.cardUid)?.defId ?? '') - 1 : 0;
    const score = evaluate(next, me.id) - extra * ACTION_VALUE;
    if (!best || score > best.score) best = { action, score };
  }
  // Holding a card is only better than playing it when every play would hurt.
  if (!best || best.score < baseline - 1.5) return { type: 'endTurn' };
  return best.action;
}
