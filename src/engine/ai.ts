import { cardDef } from './cards';
import {
  activePlayer,
  heroSkillProblem,
  heroAbilityProblem,
  cardAttack,
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
  duskEffects,
  turnForecast,
  allyEffectKind,
  inSlots,
  aimChoices,
  aimable,
  abilityAimable,
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


/** How much of the heat a rival's next dawn will bring counts as heat already taken. */
const INCOMING_WEIGHT = tuning('INCOMING', 0.8);
/** How much a rival's board counts against it (what taking a card from it is worth, against heat on its sun). */
let RIVAL_BOARD = tuning('RIVAL_BOARD', 0.45);
/** For simulations that pit two AI settings against each other. */
export function setRivalBoardWeight(v: number) {
  RIVAL_BOARD = v;
}
let COMBOS = true;
/** For simulations: the AI with or without its attack-then-remove look-ahead. */
export function setAICombos(on: boolean) {
  COMBOS = on;
}

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
  // (Dusk effects count as dawn effects do: once a day.)
  for (const e of [...dawnEffects(card, p, state), ...duskEffects(card)]) {
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
        perTurn -= selfHeatCost(p, e.amount);
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
        // (Against heat aimed at your cards only: attacks and pierce get through.)
        perTurn += 0.2 + Math.min(p.shields, 4) * 0.06 * Math.max(0, p.tableau.length - 1);
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
  // An attack: about that much heat a day, at the sun or a card.
  if ((def.attack ?? 0) > 0) perTurn += 0.8 * cardAttack(state, p, card);
  // A Hero's abilities: the best of them, once a day, less its energy.
  if (def.abilities?.length) perTurn += 0.8 * Math.max(...def.abilities.map((k) => abilityValue(p, k.effects) - (k.cost ?? 0) * ACTION_VALUE * 0.6));
  // Worth as many turns as it has left (roughly), and a little more where removal cannot reach it. A Hero
  // never fades: it is worth the whole horizon.
  const turns = def.kind === 'command' || def.kind === 'relic' ? HORIZON + 1 : Math.min(card.stability ?? HORIZON, HORIZON + 1);
  return perTurn * turns * (0.85 + 0.05 * cardDefence(p, card));
}

/** Roughly what a Hero ability's effects are worth, used once. */
/** What heating your own sun costs: a little while it is cool, a lot close to supernova, everything past it. */
function selfHeatCost(p: PlayerState, amount: number): number {
  const room = supernovaThreshold(p) - p.heat;
  if (amount >= room) return 100;
  const base = amount * (isOverheated(p) ? 1.1 : 0.7);
  return room - amount <= 3 ? base * 3 : base;
}

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
        v -= selfHeatCost(p, e.amount);
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
      score += 12 * danger + 5 * danger * danger - RIVAL_BOARD * tableauValue(state, o) - 0.6 * orbitOutlook(o);
    }
  }
  // Count the heat already on its way: what each rival's tableau will do to this sun at their next dawn,
  // past its shields (so a tableau stacked with attack cards is seen coming, and answered in time).
  const incoming = state.players.reduce((sum, o) => {
    if (o.id === meId || o.eliminated || targetOf(state, o)?.id !== meId) return sum;
    // (And their cards' attacks, all ready again at their dawn: most of it is likely to come at this sun.)
    const attacks = o.tableau.reduce((n, c) => n + cardAttack(state, o, c), 0);
    return sum + turnForecast(state, o).heat + 0.7 * attacks;
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
  const focus = bestTarget(state, me);
  if (focus && targetOf(state, me)?.id !== focus.id) return { type: 'setTarget', targetId: focus.id };
  const skill = aiSkill(state, me);
  if (skill !== null) return { type: 'heroSkill', index: skill };
  // Its Hero's abilities (one a day): weighed like any card it could play.
  const hero = commandCard(me);
  // (One that heats: at the sun, or at each card it may be aimed at.)
  const aimAt = aimChoices(state, me).cards.map((c) => c.uid);
  const abilities: Action[] = hero
    ? (cardDef(hero.defId).abilities ?? []).flatMap((_, index) =>
        heroAbilityProblem(state, me, index) !== null ? [] : [{ type: 'heroAbility' as const, index }, ...(abilityAimable(hero.defId, index) ? aimAt.map((aimUid) => ({ type: 'heroAbility' as const, index, aimUid })) : [])],
      )
    : [];
  // Its cards' attacks (each ready card, at the sun or each card it may hit).
  const attacks: Action[] = [];
  const targets = aimChoices(state, me);
  for (const c of me.tableau) {
    if (c.dimmed || (cardDef(c.defId).attack ?? 0) <= 0) continue;
    if (targets.sun) attacks.push({ type: 'attack', attackerUid: c.uid, targetUid: null });
    for (const t of targets.cards) attacks.push({ type: 'attack', attackerUid: c.uid, targetUid: t.uid });
  }
  if (!abilities.length && !attacks.length && !me.hand.some((c) => cardCost(c.defId) <= me.playsLeft)) return { type: 'endTurn' };

  // The AI cannot see its rivals' face-down Lightspeed cards, so it plans as if there were none.
  let view = state;
  if (state.players.some((p) => p.id !== me.id && p.lightspeed)) {
    view = structuredClone(state);
    for (const p of view.players) if (p.id !== me.id) p.lightspeed = null;
  }
  const baseline = evaluate(view, me.id);
  let best: { action: Action; score: number } | null = null;
  for (const action of [...attacks, ...abilities, ...candidatePlays(view, me)]) {
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
  // Set-ups a move at a time can't see: wear a card's defence down with an attack or two, then remove it
  // (the attacks alone gain little; the card they bring into reach is the point).
  const combo = COMBOS ? removalCombo(view, me, attacks) : null;
  if (combo && best) {
    // (Weighed against as many moves the plain way: the best move now, then the best removal after it.)
    let plain = best.score;
    try {
      const s1 = applyAction(view, best.action);
      const p1 = s1.players.find((x) => x.id === me.id)!;
      if (activePlayer(s1).id === me.id)
        for (const play of candidatePlays(s1, p1)) {
          if (play.type !== 'playCard' || !play.enemyUid) continue;
          const card = p1.hand.find((c) => c.uid === play.cardUid);
          if (!card) continue;
          plain = Math.max(plain, evaluate(applyAction(s1, play), me.id) - (cardCost(card.defId) - 1) * ACTION_VALUE);
        }
    } catch {
      // (The plain way stands as it is.)
    }
    if (combo.score > plain + 0.5) return combo.action;
  }
  // Holding a card is only better than playing it when every play would hurt.
  if (!best || best.score < baseline - 1.5) return { type: 'endTurn' };
  return best.action;
}

/**
 * The best "attack, (attack,) then remove" this turn: for each rival card the attacks may strike, one or two
 * attacks on it, then a removal card from hand that reaches it now. Scored as the whole sequence would leave
 * things; the first attack is the move (the removal follows, found by the usual search once in reach).
 */
function removalCombo(view: GameState, me: PlayerState, attacks: Action[]): { action: Action; score: number } | null {
  if (!me.hand.some((c) => enemyChoices(view, me, c.defId).length || (cardDef(c.defId).onPlay ?? []).some((e) => e.type === 'destroy' || e.type === 'bounce'))) return null;
  const onCards = attacks.filter((a): a is Extract<Action, { type: 'attack' }> => a.type === 'attack' && !!a.targetUid);
  if (!onCards.length) return null;
  const tryApply = (s: GameState, a: Action) => {
    try {
      return applyAction(s, a);
    } catch {
      return null;
    }
  };
  // The best removal play on this card from this state, scored (null if none reaches it).
  const finish = (s: GameState, uid: string): number | null => {
    const p = s.players.find((x) => x.id === me.id)!;
    if (activePlayer(s).id !== me.id) return null;
    let top: number | null = null;
    for (const play of candidatePlays(s, p)) {
      if (play.type !== 'playCard' || play.enemyUid !== uid) continue;
      const card = p.hand.find((c) => c.uid === play.cardUid);
      const after = tryApply(s, play);
      if (!card || !after) continue;
      const sc = evaluate(after, me.id) - (cardCost(card.defId) - 1) * ACTION_VALUE;
      if (top === null || sc > top) top = sc;
    }
    return top;
  };
  let best: { action: Action; score: number } | null = null;
  for (const a1 of onCards) {
    const s1 = tryApply(view, a1);
    if (!s1) continue;
    const uid = a1.targetUid!;
    let sc = finish(s1, uid);
    if (sc === null) {
      // Two attacks on it, then the removal.
      const p1 = s1.players.find((x) => x.id === me.id)!;
      for (const a2 of onCards) {
        if (a2.attackerUid === a1.attackerUid || a2.targetUid !== uid || p1.tableau.find((c) => c.uid === a2.attackerUid)?.dimmed) continue;
        const s2 = tryApply(s1, a2);
        if (!s2) continue;
        const sc2 = finish(s2, uid);
        if (sc2 !== null && (sc === null || sc2 > sc)) sc = sc2;
      }
    }
    if (sc !== null && (!best || sc > best.score)) best = { action: a1, score: sc };
  }
  return best;
}
