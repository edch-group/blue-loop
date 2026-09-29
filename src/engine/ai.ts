import { cardDef } from './cards';
import {
  activePlayer,
  applyAction,
  cardNeedsDestroyTarget,
  cardNeedsUpgradeChoice,
  conditionMet,
  effectAmount,
  isOverheated,
  livingOpponents,
  persists,
  supernovaThreshold,
  tableauFull,
  targetOf,
  upgradeOptions,
} from './game';
import type { Action, CardInstance, GameState, PlayerState } from './types';

/** Turns a card in play is expected to keep working, for valuing ongoing effects. */
const HORIZON = 2.5;
/** A rival this close to supernova is worth switching targets to finish. */
const FINISH_RATIO = Number(globalThis.process?.env?.FINISH ?? 0.75);
/** In a free-for-all, switch to the leader once it is this much cooler (as a share of max health) than your usual target. */
const LEADER_GAP = Number(globalThis.process?.env?.GAP ?? 0.25);

/** Roughly what a card in play is worth to its owner each turn from now on. */
function cardValue(state: GameState, p: PlayerState, card: CardInstance): number {
  const def = cardDef(card.defId);
  const foes = Math.max(1, livingOpponents(state, p).length);
  let perTurn = 0;
  for (const e of def.onTurn ?? []) {
    if (!conditionMet(p, e.if) && !(e.if && 'minKind' in e.if)) continue;
    const scale = conditionMet(p, e.if) ? 1 : 0.4;
    switch (e.type) {
      case 'heat':
        perTurn += scale * (Math.max(effectAmount(state, p, card, e, 'turn'), e.plus?.of === 'growth' ? 2 : 0) * (e.to === 'enemies' ? foes * 0.85 : 1) + (e.splash ?? 0) * (foes - 1) * 0.85);
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
        perTurn += 1.4 * ps.amount;
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
    }
  }
  if (def.onLeave?.length) perTurn += 0.35;
  return perTurn * HORIZON;
}

function tableauValue(state: GameState, p: PlayerState): number {
  return p.tableau.reduce((sum, c) => sum + cardValue(state, p, c), 0);
}

/** How good this state is for `meId`: heat on every sun, ongoing value, cards and upgrades. */
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
      score += 12 * danger + 5 * danger * danger - 0.45 * tableauValue(state, o);
    }
  }
  const mine = Math.max(0, me.heat) / supernovaThreshold(me);
  score -= 12 * mine + 10 * mine * mine;
  score += tableauValue(state, me) + 0.8 * me.hand.length + 0.3 * me.shields;
  // Upgrades already pay off through effectAmount; a little extra for future cards.
  score += 0.6 * (me.upgrades.solarFlare + me.upgrades.thermosiphon);
  return score;
}

/** Every way to play one card now (replacement, upgrade and destroy choices included). */
function candidatePlays(state: GameState, me: PlayerState): Action[] {
  const plays: Action[] = [];
  const seen = new Set<string>();
  const target = targetOf(state, me);
  // Replacing: only the weakest few of our own cards are worth considering.
  const replaceable = [...me.tableau].sort((a, b) => cardValue(state, me, a) - cardValue(state, me, b)).slice(0, 2);
  for (const card of me.hand) {
    if (seen.has(card.defId)) continue;
    seen.add(card.defId);
    const upgrades: (Action & { type: 'playCard' })['upgrade'][] = cardNeedsUpgradeChoice(card.defId) && upgradeOptions(me).length ? upgradeOptions(me) : [undefined];
    const destroys: (string | undefined)[] = cardNeedsDestroyTarget(card.defId) && target?.tableau.length ? target.tableau.map((c) => c.uid) : [undefined];
    const replaces: (string | undefined)[] = persists(card.defId) && tableauFull(me) ? replaceable.map((c) => c.uid) : [undefined];
    for (const upgrade of upgrades) for (const destroyUid of destroys) for (const replaceUid of replaces) plays.push({ type: 'playCard', cardUid: card.uid, upgrade, destroyUid, replaceUid });
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

  const baseline = evaluate(state, me.id);
  let best: { action: Action; score: number } | null = null;
  for (const action of candidatePlays(state, me)) {
    let next: GameState;
    try {
      next = applyAction(state, action);
    } catch {
      continue;
    }
    const score = evaluate(next, me.id);
    if (!best || score > best.score) best = { action, score };
  }
  // Holding a card is only better than playing it when every play would hurt.
  if (!best || best.score < baseline - 1.5) return { type: 'endTurn' };
  return best.action;
}
