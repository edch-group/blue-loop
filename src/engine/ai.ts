import { cardDef } from './cards';
import {
  activePlayer,
  heroSkillProblem,
  heroAbilityProblem,
  commandCard,
  applyAction,
  canSetLightspeed,
  canSetFaceDown,
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
  cardPassives,
  fusionHosts,
  freeSlots,
  recoverChoices,
  supernovaThreshold,
  hasRoomFor,
  targetOf,
  dawnEffects,
  turnForecast,
  aimable,
  allyEffectKind,
  inSlots,
  dawnAimable,
  aimChoices,
} from './game';
import type { Action, CardInstance, Effect, GameState, PlayerState } from './types';

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

/** What one energy is worth, roughly (beyond the first, which every card costs). */
const ACTION_VALUE = tuning('ACTION', 2.5);
/** A dawn's +1 energy is worth a full energy with this many cards (beyond one) in hand to spend it on, less with fewer. */
const ENERGY_HAND = tuning('EHAND', 4);

/** How much a card burned away is worth against heat on the sun, when aiming. */
const AIM_CARD = tuning('AIMCARD', 0.8);

/** How much of the heat a rival's next dawn will bring counts as heat already taken. */
const INCOMING_WEIGHT = tuning('INCOMING', 0.8);

/** What a face-down Lightspeed card is worth to its owner (a counter waiting to spring). */
const LIGHTSPEED_VALUE = tuning('LSV', 3);

/** How far below zero the AI counts on its sun getting, when valuing a Thermosiphon card. */
const COLD_HOPE = tuning('COLD', 1);

/** Whether a player has a Thermosiphon card in play (so a sun below zero is worth keeping cold). */
function runsCold(p: PlayerState): boolean {
  return p.tableau.some((c) => [...(cardDef(c.defId).onTurn ?? []), ...(cardDef(c.defId).onPlay ?? [])].some((e) => 'plus' in e && e.plus?.of === 'cold' && !e.plus.rival));
}

/** Roughly what a card in play is worth to its owner each day from now on. */
function cardValue(state: GameState, p: PlayerState, card: CardInstance): number {
  const def = cardDef(card.defId);
  const foes = Math.max(1, livingOpponents(state, p).length);
  let perTurn = 0;
  for (const e of dawnEffects(card, p, state)) {
    if (!conditionMet(p, e.if, state) && !(e.if && 'minKind' in e.if)) continue;
    const scale = conditionMet(p, e.if, state) ? 1 : 0.4;
    switch (e.type) {
      case 'heat':
        perTurn += scale * Math.max(effectAmount(state, p, card, e, 'turn'), e.plus?.of === 'growth' ? 2 : e.plus?.of === 'cold' ? COLD_HOPE * (e.plus.times ?? 1) : 0);
        break;
      case 'cool':
        // Below zero, cooling still pays when Thermosiphon cards feed on the cold.
        perTurn += scale * effectAmount(state, p, card, e, 'turn') * (p.heat > 0 || runsCold(p) ? 0.9 : 0.35);
        break;
      case 'shield':
        perTurn += scale * Math.max(effectAmount(state, p, card, e, 'turn'), e.plus?.of === 'cold' ? COLD_HOPE * (e.plus.times ?? 1) : 0) * 0.45;
        break;
      case 'draw':
        perTurn += scale * e.amount * 0.7;
        break;
      case 'repair': {
        const worn = p.tableau.reduce((t, c) => t + (c.dented ?? 0), 0);
        perTurn += scale * Math.min(e.amount, Math.max(0.5, worn)) * 0.35;
        break;
      }
      case 'plays':
        // Energy is worth what it lets you play: about a card's worth, with cards in hand to spend it on.
        perTurn += scale * e.amount * ACTION_VALUE * Math.min(1, Math.max(0.2, (p.hand.length - 1) / ENERGY_HAND));
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
  for (const ps of cardPassives(card)) {
    switch (ps.type) {
      case 'kindBonus': {
        // The cards it buffs (by kind, race and what they do), in play now, and some to come.
        const stat = ps.stat ?? 'heat';
        const fits = (id: string) => (!ps.kind || cardDef(id).kind === ps.kind) && (ps.race === undefined || cardDef(id).race === ps.race);
        const matching = p.tableau.filter((c) => c.uid !== card.uid && fits(c.defId) && (cardDef(c.defId).onTurn ?? []).some((e) => e.type === stat)).length;
        const coming = p.hand.filter((c) => fits(c.defId)).length;
        perTurn += ps.amount * (matching + 0.5 + 0.25 * coming) * (stat === 'heat' ? 1 : stat === 'cool' ? 0.7 : 0.45);
        break;
      }
      case 'extraPlay':
        perTurn += 1.4 * ps.amount * (ps.planet ? 0.4 : 1);
        break;
      case 'keepShields':
        perTurn += 0.4 + p.shields * 0.1;
        break;
      case 'tidewall':
        perTurn += 0.3 + Math.min(p.shields, 4) * 0.1 * Math.max(0, p.tableau.length - 1);
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
      case 'eatPlanets':
        // What the rivals' planets would have given them: about a card or an energy a day each.
        perTurn += 1.1 * foes;
        break;
    }
  }
  if (def.onLeave?.length) perTurn += 0.35;
  // A Hero's abilities: the best of them, once a day, less its energy.
  if (def.abilities?.length) perTurn += 0.8 * Math.max(...def.abilities.map((k) => abilityValue(p, k.effects) - (k.cost ?? 0) * ACTION_VALUE * 0.6));
  // Worth as many turns as it has left (roughly), and a little more where removal cannot reach it. A Hero
  // never fades: it is worth the whole horizon.
  const turns = def.kind === 'command' ? HORIZON + 1 : Math.min(card.stability ?? HORIZON, HORIZON + 1);
  return perTurn * turns * (0.85 + 0.05 * cardDefence(p, card));
}

/** Roughly what a Hero ability's effects are worth, used once. */
function abilityValue(p: PlayerState, effects: Effect[]): number {
  let v = 0;
  for (const e of effects) {
    switch (e.type) {
      case 'heat':
        v += e.amount + (e.plus?.of === 'shields' ? Math.min(e.max ?? 9, Math.floor(p.shields / (e.plus.per ?? 1))) : 0) + (e.pierce ? 0.5 : 0);
        break;
      case 'cool':
        v += e.amount * (p.heat > 0 || runsCold(p) ? 0.9 : 0.35);
        break;
      case 'shield':
        v += e.amount * 0.45;
        break;
      case 'draw':
        v += e.amount * 0.7;
        break;
      case 'plays':
        v += e.amount * ACTION_VALUE * Math.min(1, Math.max(0.2, (p.hand.length - 1) / ENERGY_HAND));
        break;
      case 'selfHeat':
        v -= e.amount * (isOverheated(p) ? 1.1 : 0.7);
        break;
      case 'restore':
        v += e.self ? 0.35 * e.amount : e.all ? 0.3 * e.amount * Math.max(1, p.tableau.length - 1) : 0.4 * e.amount;
        break;
      case 'plant':
        v += 0.5 * e.amount;
        break;
      case 'recover':
        v += p.discard.length ? 0.9 : 0.5;
        break;
      case 'orbit':
        v += (orbitOutlook(p, e.amount) - orbitOutlook(p)) * 0.5;
        break;
    }
  }
  return v;
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
  // (A Hero leads from its own slot: it blocks none of the five.)
  return p.tableau.reduce((sum, c) => sum + cardValue(state, p, c) - (cardDef(c.defId).kind === 'command' ? 0 : SLOT_COST * (c.stability ?? 0)), 0);
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
  const coming = landing * INCOMING_WEIGHT;
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
    // A Lightspeed guard can also be set face down (for 1 more energy).
    if (canSetFaceDown(me, card.defId)) plays.push({ type: 'playCard', cardUid: card.uid, faceDown: true });
    if (cardDef(card.defId).kind === 'lightspeed' && !canSetLightspeed(me)) continue;
    if (cardCost(card.defId) > me.playsLeft) continue;
    const choices = opt(cardChoices(card.defId));
    const foes = opt(enemyChoices(state, me, card.defId).map((c) => c.uid));
    if (!hasRoomFor(me, card.defId)) continue;
    const slots = needsSlot(me, card.defId) ? freeSlots(me) : [undefined];
    // A Fusion card: onto each card it could join.
    const hosts: (string | undefined)[] = [undefined, ...(cardDef(card.defId).fusion ? fusionHosts(me).map((c) => c.uid) : [])];
    // Recovering: one of each card in the discard pile.
    const recovers = opt([...new Map(recoverChoices(me, card.defId).map((c) => [c.defId, c.uid])).values()]);
    const allies = opt(allyChoices(me, card.defId).map((c) => c.uid));
    // Heat can go to the rival's sun (unset) or any card it may aim at.
    const aim = aimable(card.defId) ? aimChoices(state, me) : { sun: true, cards: [] };
    const aims: (string | undefined)[] = [...(aim.sun ? [undefined] : []), ...aim.cards.map((c) => c.uid)];
    if (!aims.length) aims.push(undefined);
    // A recall card may also take the slot of the card it recalls.
    const recalls = allyEffectKind(card.defId) === 'recall' && inSlots(card.defId);
    for (const choice of choices)
      for (const enemyUid of foes)
        for (const allyUid of allies) {
          const back = recalls ? me.tableau.find((c) => c.uid === allyUid) : undefined;
          const here: (number | undefined)[] = back && back.slot !== undefined && !(slots as (number | undefined)[]).includes(back.slot) ? [...slots, back.slot] : slots;
          for (const slot of here) for (const recoverUid of recovers) for (const aimUid of aims) for (const hostUid of hosts) if (!hostUid || slot === here[0]) plays.push({ type: 'playCard', cardUid: card.uid, choice, enemyUid, slot, allyUid, recoverUid, aimUid, ...(hostUid ? { hostUid } : {}) });
        }
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

/** Where each of your cards' dawn heat does most: a card it can burn away (and that is worth it), or the sun. */
function dawnAims(state: GameState, me: PlayerState): Record<string, string | null> {
  const aims: Record<string, string | null> = {};
  const rival = targetOf(state, me);
  if (!rival) return aims;
  const danger = Math.max(0, rival.heat) / supernovaThreshold(rival);
  const { cards, sun } = aimChoices(state, me);
  // Heat already aimed at each card this dawn (a card burned away by one attacker needs no more), and
  // the defence still standing on it (the first hit dents it for the rest of the day).
  const planned = new Map<string, number>();
  const guardLeft = new Map(cards.map((c) => [c.uid, cardDefence(rival, c)]));
  // What burning a card away sets off against you: its own leave heat, and its owner's cards that answer a card leaving.
  const payback = (c: CardInstance) =>
    (cardDef(c.defId).onLeave ?? []).reduce((n, e) => n + (e.type === 'heat' ? e.amount : 0), 0) +
    rival.tableau.reduce((n, o) => n + (o.uid === c.uid ? 0 : cardPassives(o).reduce((m, x) => m + (x.type === 'allyLeaves' ? x.effects.reduce((k, e) => k + (e.type === 'heat' ? e.amount : 0), 0) : 0), 0)), 0);
  for (const card of me.tableau) {
    if (!dawnAimable(card, me, state)) continue;
    const heat = dawnEffects(card, me, state).reduce((n, e) => n + (e.type === 'heat' && e.to === 'target' && conditionMet(me, e.if, state) ? effectAmount(state, me, card, e, 'turn') : 0), 0);
    if (heat <= 0) continue;
    // The sun counts for more the nearer it is to supernova; a card for what it is worth to its owner, if this burns it away.
    let best: { uid: string | null; score: number } = { uid: null, score: sun ? heat * (1 + 3 * danger) : -Infinity };
    const pierce = dawnEffects(card, me, state).some((e) => e.type === 'heat' && e.to === 'target' && e.pierce);
    for (const c of cards) {
      const left = (c.stability ?? 0) - (planned.get(c.uid) ?? 0);
      if (left <= 0) continue;
      // A card's defence takes that much heat first (not pierce heat).
      const wears = pierce ? heat : heat - (guardLeft.get(c.uid) ?? 0);
      if (wears <= 0) continue;
      const kills = wears >= left;
      const share = kills ? 1 : (wears / Math.max(1, left)) * 0.5;
      const score = cardValue(state, rival, c) * share * AIM_CARD - (kills ? payback(c) * 1.2 : 0);
      if (score > best.score) best = { uid: c.uid, score };
    }
    if (best.uid === null && !sun) continue;
    aims[card.uid] = best.uid;
    if (best.uid) {
      const hit = cards.find((c) => c.uid === best.uid)!;
      const stand = pierce ? 0 : guardLeft.get(hit.uid) ?? 0;
      planned.set(best.uid, (planned.get(best.uid) ?? 0) + Math.max(0, heat - stand));
      guardLeft.set(hit.uid, stand - Math.min(stand, heat));
    }
  }
  return aims;
}

/**
 * Heuristic AI: returns the next action for the active player. It focuses the
 * rival nearest to supernova, then plays whichever card leaves it best off,
 * until it has no plays (or nothing worth playing) left.
 */
/** A hero's battle skill worth using now: defensive ones when running hot, others when they pay. */
function aiSkill(state: GameState, me: PlayerState): number | null {
  const rival = targetOf(state, me);
  const mine = Math.max(0, me.heat) / supernovaThreshold(me);
  const theirs = rival ? Math.max(0, rival.heat) / supernovaThreshold(rival) : 0;
  for (const [i, k] of (me.skills ?? []).entries()) {
    if (heroSkillProblem(state, me, i)) continue;
    const guards = k.effects.some((e) => e.type === 'cool' || e.type === 'shield');
    const strikes = k.effects.some((e) => e.type === 'heat' || e.type === 'draw' || e.type === 'plays');
    if (guards && mine >= 0.55) return i;
    if (strikes && (!k.once || theirs >= 0.5 || state.round >= 6)) return i;
  }
  return null;
}

export function chooseAIAction(state: GameState): Action {
  const me = activePlayer(state);
  if (state.awaitingDawn) return { type: 'dawn', aims: dawnAims(state, me) };
  const focus = bestTarget(state, me);
  if (focus && targetOf(state, me)?.id !== focus.id) return { type: 'setTarget', targetId: focus.id };
  const skill = aiSkill(state, me);
  if (skill !== null) return { type: 'heroSkill', index: skill };
  // Its Hero's abilities (one a day): weighed like any card it could play.
  const hero = commandCard(me);
  const abilities: Action[] = hero ? (cardDef(hero.defId).abilities ?? []).flatMap((_, index) => (heroAbilityProblem(state, me, index) === null ? [{ type: 'heroAbility' as const, index }] : [])) : [];
  if (!abilities.length && !me.hand.some((c) => cardCost(c.defId) <= me.playsLeft)) return { type: 'endTurn' };

  // The AI cannot see its rivals' face-down Lightspeed cards, so it plans as if there were none.
  let view = state;
  if (state.players.some((p) => p.id !== me.id && p.lightspeed)) {
    view = structuredClone(state);
    for (const p of view.players) if (p.id !== me.id) p.lightspeed = null;
  }
  const baseline = evaluate(view, me.id);
  let best: { action: Action; score: number } | null = null;
  for (const action of [...abilities, ...candidatePlays(view, me)]) {
    let next: GameState;
    try {
      next = applyAction(view, action);
    } catch {
      continue;
    }
    // Energy spent on a card is energy not spent on another: a costlier card has to be worth it.
    const played = action.type === 'playCard' ? me.hand.find((c) => c.uid === action.cardUid) : undefined;
    // (An ability is a free extra action, but for its energy.)
    const abilityCost = action.type === 'heroAbility' && hero ? cardDef(hero.defId).abilities![action.index].cost ?? 0 : 0;
    const extra = played ? (cardDef(played.defId).spendAll ? me.playsLeft : cardCost(played.defId)) - 1 : abilityCost;
    // Energy a card gives back today (ramp) is worth what it lets you play: the cards left in hand that it pays for.
    const after = next.players.find((p) => p.id === me.id)!;
    const spent = played ? (cardDef(played.defId).spendAll ? me.playsLeft : cardCost(played.defId)) : abilityCost;
    const gained = after.playsLeft - (me.playsLeft - spent);
    const ramp = gained > 0 ? gained * ACTION_VALUE * Math.min(1, after.hand.filter((c) => cardCost(c.defId) <= after.playsLeft && cardCost(c.defId) > 0).length / gained) : 0;
    const score = evaluate(next, me.id) - extra * ACTION_VALUE + ramp;
    if (!best || score > best.score) best = { action, score };
  }
  // Holding a card is only better than playing it when every play would hurt.
  if (!best || best.score < baseline - 1.5) return { type: 'endTurn' };
  return best.action;
}
