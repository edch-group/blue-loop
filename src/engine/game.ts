import { BALANCE } from './balance';
import { cardDef, presetDeck } from './cards';
import { randomInt, shuffleInPlace } from './rng';
import type { Action, CardDef, CardInstance, CardKind, Condition, Count, Effect, FieldId, GameSetup, GameState, LightspeedTrigger, Passive, Planet, PlayerState, TurnPulse, TurnStats } from './types';

export class GameError extends Error {}

const emptyTurn = (): TurnStats => ({ heatDealt: 0, cardsPlayed: 0, cooled: 0 });

function newCard(state: GameState, defId: string): CardInstance {
  state.uidCounter += 1;
  return { uid: `c${state.uidCounter}`, defId: cardDef(defId).id };
}

function log(state: GameState, text: string) {
  const seq = (state.log[state.log.length - 1]?.seq ?? 0) + 1;
  state.log.push({ seq, turn: state.turnNumber, text });
  if (state.log.length > BALANCE.maxLogEntries) state.log.splice(0, state.log.length - BALANCE.maxLogEntries);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(setup: GameSetup): GameState {
  const n = setup.players.length;
  if (n < BALANCE.minPlayers || n > BALANCE.maxPlayers) {
    throw new GameError(`Blue Loop needs ${BALANCE.minPlayers}-${BALANCE.maxPlayers} players.`);
  }
  const state: GameState = {
    version: 5,
    rngState: setup.seed | 0,
    uidCounter: 0,
    turnNumber: 1,
    round: 1,
    activePlayerIndex: 0,
    players: [],
    winnerId: null,
    log: [],
  };

  const catchUp = (i: number) => i > 0 && n <= BALANCE.catchUpMaxPlayers;
  setup.players.forEach((ps, i) => {
    const species = ps.species ?? i % 4;
    const list = ps.deck ?? presetDeck(species).cards;
    const deck = shuffleInPlace(state, list.map((id) => newCard(state, id)));
    const p: PlayerState = {
      id: `p${i + 1}`,
      name: ps.name,
      isAI: ps.isAI,
      species,
      deckName: ps.deckName ?? (ps.deck ? undefined : presetDeck(species).name),
      heat: BALANCE.startingHeat + (ps.heatDelta ?? 0) + (ps.modifiers?.startingHeat ?? 0) - (catchUp(i) ? BALANCE.laterSeatCool : 0),
      shields: ps.opening?.shields ?? 0,
      deck,
      hand: [],
      tableau: [],
      discard: [],
      lightspeed: null,
      eliminated: false,
      targetId: null,
      turnsTaken: 0,
      playsLeft: 0,
      orbit: 0,
      turn: emptyTurn(),
      modifiers: ps.modifiers,
      conditions: ps.conditions,
    };
    p.heat = Math.max(BALANCE.minHeat, Math.min(p.heat, supernovaThreshold(p) - 1));
    // A garrison takes the safest slots first.
    const safest = slotsBySafety();
    for (const id of (ps.tableau ?? []).filter(persists).slice(0, BALANCE.tableauSlots)) place(p, newCard(state, id), safest.shift()!);
    if (ps.lightspeed && cardDef(ps.lightspeed).kind === 'lightspeed') p.lightspeed = newCard(state, ps.lightspeed);
    state.players.push(p);
    // Later seats start a little ahead to make up for moving second.
    drawCards(state, p, BALANCE.openingHand + (catchUp(i) ? BALANCE.laterSeatCards : 0) + (ps.modifiers?.openingHand ?? 0) + (ps.opening?.draw ?? 0));
  });
  for (const p of state.players) p.targetId = nextOpponent(state, p)?.id ?? null;

  log(state, `A new Blue Loop begins with ${state.players.map((p) => p.name).join(', ')}.`);
  startTurn(state);
  return state;
}

/**
 * Bring a saved game from older rules up to date: version 2 kept Command cards
 * out of the tableau; before version 4 tableaus had 8 unslotted places and no stability.
 */
export function migrateGame(state: GameState): GameState {
  for (const p of state.players) {
    p.lightspeed ??= null;
    p.orbit ??= 0;
    delete (p as { commands?: unknown }).commands;
    if (state.version < 4) {
      const cards = p.tableau;
      p.tableau = [];
      cards.forEach((c, i) => (i < BALANCE.tableauSlots ? place(p, c, i) : p.discard.push(c)));
    }
  }
  state.version = 5;
  return state;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function activePlayer(state: GameState): PlayerState {
  return state.players[state.activePlayerIndex];
}

export function livingOpponents(state: GameState, p: PlayerState): PlayerState[] {
  return state.players.filter((o) => o.id !== p.id && !o.eliminated);
}

/** The next living rival after this player, in seat order. */
function nextOpponent(state: GameState, p: PlayerState): PlayerState | undefined {
  const n = state.players.length;
  const start = state.players.indexOf(p);
  for (let k = 1; k < n; k++) {
    const o = state.players[(start + k) % n];
    if (!o.eliminated) return o;
  }
  return undefined;
}

/** The rival this player's attacks hit (falls back to the next living rival). */
export function targetOf(state: GameState, p: PlayerState): PlayerState | undefined {
  const t = state.players.find((o) => o.id === p.targetId);
  if (t && !t.eliminated && t.id !== p.id) return t;
  return nextOpponent(state, p);
}

/** Max health: reach it and your sun goes supernova. */
export function supernovaThreshold(p: PlayerState): number {
  return BALANCE.supernovaAt + (p.modifiers?.maxHealthDelta ?? 0);
}

/** Half your max health or hotter. */
export function isOverheated(p: PlayerState): boolean {
  return p.heat * 2 >= supernovaThreshold(p);
}

/** Heat every sun takes at its dawn this round (0 before instability begins). */
export function instabilityHeat(state: GameState): number {
  if (state.round < BALANCE.instabilityStartsRound) return 0;
  return 1 + Math.floor((state.round - BALANCE.instabilityStartsRound) / BALANCE.instabilityRampEvery);
}

function passives(p: PlayerState): { card: CardInstance; passive: Passive }[] {
  return p.tableau.flatMap((card) => (cardDef(card.defId).passive ?? []).map((passive) => ({ card, passive })));
}

/** Cards this player may play on a day (before any have been played). */
// ---- Orbit ------------------------------------------------------------------

const PLANETS: Planet[] = ['dead', 'abundant', 'industrial'];
/** A whole orbit: three planets, three turns each. */
export const ORBIT_LENGTH = PLANETS.length * BALANCE.orbitTurns;

/** The planet facing a sun at an orbit position. */
export function planetAt(orbit: number): Planet {
  return PLANETS[Math.floor((((orbit % ORBIT_LENGTH) + ORBIT_LENGTH) % ORBIT_LENGTH) / BALANCE.orbitTurns)];
}

/**
 * The planet facing this player's sun today, as it counts: given the game, the dead planet while a rival
 * has a planet-eater in play (Orion, Galaxy Eater).
 */
export function currentPlanet(p: PlayerState, state?: GameState): Planet {
  return state && planetsEaten(state, p) ? 'dead' : planetAt(p.orbit);
}

/** Whether a rival still in the game has a card in play that eats this player's planets. */
export function planetsEaten(state: GameState, p: PlayerState): boolean {
  return state.players.some((o) => o.id !== p.id && !o.eliminated && passives(o).some(({ passive }) => passive.type === 'eatPlanets'));
}

/** This player's days left with the current planet (this one included). */
export function planetTurnsLeft(p: PlayerState): number {
  return BALANCE.orbitTurns - (((p.orbit % ORBIT_LENGTH) + ORBIT_LENGTH) % ORBIT_LENGTH) % BALANCE.orbitTurns;
}

function moveOrbit(state: GameState, p: PlayerState, by: number) {
  const before = currentPlanet(p);
  p.orbit = (((p.orbit + by) % ORBIT_LENGTH) + ORBIT_LENGTH) % ORBIT_LENGTH;
  const now = currentPlanet(p);
  log(state, `${p.name}'s orbit ${by > 0 ? 'speeds on' : 'slips back'} ${Math.abs(by)}: the ${now} planet${now === before ? '' : ' swings round'} (${planetTurnsLeft(p)} turn${planetTurnsLeft(p) === 1 ? '' : 's'} left).`);
}

export function playsAllowed(state: GameState, p: PlayerState): number {
  const extra = passives(p).reduce((sum, { passive }) => sum + (passive.type === 'extraPlay' && (!passive.planet || currentPlanet(p, state) === passive.planet) ? passive.amount : 0), 0);
  // Later seats get an extra play on their first day to make up for moving second.
  const catchUp = p.turnsTaken === 1 && state.players.indexOf(p) > 0 && state.players.length <= BALANCE.catchUpMaxPlayers ? BALANCE.laterSeatPlays : 0;
  const industry = currentPlanet(p, state) === 'industrial' ? BALANCE.industrialPlays : 0;
  return Math.min(p.turnsTaken, BALANCE.maxPlays) + extra + catchUp + industry;
}

/** The Command slot: a player's one Command card leads their tableau from its own slot, outside the five. */
export const COMMAND_SLOT = -1;

/** A player's Command card in play, if any. */
export function commandCard(p: PlayerState): CardInstance | undefined {
  return p.tableau.find((c) => c.slot === COMMAND_SLOT);
}

/** Whether a card goes into one of the five tableau slots (not the Command slot, nor face down). */
export function inSlots(defId: string): boolean {
  return persists(defId) && cardDef(defId).kind !== 'command';
}

export function tableauFull(p: PlayerState): boolean {
  return p.tableau.filter((c) => c.slot !== COMMAND_SLOT).length >= BALANCE.tableauSlots;
}

/** The global card in play, if any, and whose tableau it is in. */
export function activeGlobal(state: GameState): { card: CardInstance; owner: PlayerState } | null {
  for (const owner of state.players) {
    if (owner.eliminated) continue;
    const card = owner.tableau.find((c) => cardDef(c.defId).kind === 'global');
    if (card) return { card, owner };
  }
  return null;
}

function fieldActive(state: GameState, field: FieldId): boolean {
  const g = activeGlobal(state);
  return !!g && (cardDef(g.card.defId).passive ?? []).some((ps) => ps.type === 'field' && ps.field === field);
}

type EnemyEffect = Extract<Effect, { type: 'destroy' | 'bounce' | 'erode' }>;

/** The effect a card aims at one card in a rival's tableau (destroy, return or erode), if any. */
function enemyEffect(defId: string): EnemyEffect | undefined {
  return (cardDef(defId).onPlay ?? []).find((e): e is EnemyEffect => e.type === 'destroy' || e.type === 'bounce' || (e.type === 'erode' && !e.all));
}

function canReach(owner: PlayerState, c: CardInstance, e: EnemyEffect): boolean {
  if (e.type === 'destroy' && e.kind && cardDef(c.defId).kind !== e.kind) return false;
  if (e.type !== 'erode' && e.maxDefence !== undefined && cardDefence(owner, c) > e.maxDefence) return false;
  return true;
}

/** Cards in your target's tableau this card could destroy, return or erode (empty if it needs no choice). */
export function enemyChoices(state: GameState, p: PlayerState, defId: string): CardInstance[] {
  const e = enemyEffect(defId);
  const t = targetOf(state, p);
  if (!e || !t) return [];
  return t.tableau.filter((c) => canReach(t, c, e));
}

/** Whether a card heats your rival as it is played (it is aimed then, at their sun or one of their cards). */
export function aimable(defId: string): boolean {
  return (cardDef(defId).onPlay ?? []).some((e) => e.type === 'heat' && e.to === 'target');
}

/** Whether a card in your tableau heats your rival at dawn (its heat is aimed afresh each dawn). */
export function dawnAimable(card: CardInstance): boolean {
  return dawnEffects(card).some((e) => e.type === 'heat' && e.to === 'target');
}

/** A player's Guard cards: while they have any, rival heat can only be aimed at them. */
export function guards(p: PlayerState): CardInstance[] {
  return p.tableau.filter((c) => (cardDef(c.defId).passive ?? []).some((x) => x.type === 'taunt'));
}

/**
 * Where your heat may be aimed: any card in your rival's tableau, or their sun. While they have Guard
 * cards, only those. `sun` says whether their sun is a choice.
 */
export function aimChoices(state: GameState, p: PlayerState): { cards: CardInstance[]; sun: boolean } {
  const t = targetOf(state, p);
  if (!t) return { cards: [], sun: true };
  const g = guards(t);
  if (g.length) return { cards: g, sun: false };
  return { cards: [...t.tableau], sun: true };
}

/** Whether a player's dawn waits for them to aim: they have a card with dawn heat, and it has more than one place to go. */
export function needsDawnAim(state: GameState, p: PlayerState): boolean {
  if (!p.tableau.some(dawnAimable)) return false;
  const { cards, sun } = aimChoices(state, p);
  return cards.length + (sun ? 1 : 0) > 1;
}

/** Where a card's dawn heat lands now: a rival card (its aim, or a Guard), or null for their sun. */
export function heatTarget(state: GameState, p: PlayerState, card: CardInstance): CardInstance | null {
  return aimedCard(state, p, card);
}

/** Where this card's heat lands now: the rival card it is aimed at (if still there and allowed), a Guard, or the sun (null). */
function aimedCard(state: GameState, p: PlayerState, card: CardInstance): CardInstance | null {
  const t = targetOf(state, p);
  if (!t) return null;
  const g = guards(t);
  const aimed = card.aim ? t.tableau.find((c) => c.uid === card.aim) : undefined;
  if (aimed && (!g.length || g.includes(aimed))) return aimed;
  // Guards take the heat meant for the sun or for the cards behind them: the most worn one first.
  if (g.length) return [...g].sort((a, b) => (a.stability ?? 0) - (b.stability ?? 0))[0];
  return null;
}

/** Heat on a card wears its stability away, 1 for 1; at 0 it burns away into its owner's discard pile. */
function heatCard(state: GameState, owner: PlayerState, victim: CardInstance, amount: number, source: PlayerState, pierce: boolean, cardUid: string, sting = false) {
  // Shields cover their owner's whole side, cards as well as the sun (pierce heat gets past them).
  const blocked = Math.min(pierce ? Math.floor(owner.shields * BALANCE.pierceShieldShare) : owner.shields, amount);
  owner.shields -= blocked;
  if (blocked > 0) {
    log(state, `${owner.name}'s shields absorb ${blocked} heat.`);
    // (A sting answered by shields doesn't sting back.)
    if (!sting) shieldsAnswer(state, owner, source, cardUid);
  }
  amount -= blocked;
  if (amount <= 0 || !owner.tableau.includes(victim)) return;
  // The card's defence (its slot's, and its own) takes the heat first (not pierce heat), and stays dented
  // that much for the rest of the day: more heat today finds less defence in its way.
  // A sting ignores it too: the attacking card left its defences to attack.
  const turned = pierce || sting ? 0 : Math.min(amount, cardDefence(owner, victim));
  if (turned > 0) {
    victim.dented = (victim.dented ?? 0) + turned;
    log(state, `${owner.name}'s ${cardDef(victim.defId).name} takes ${turned} heat on its defence (defence ${cardDefence(owner, victim)} left today).`);
  }
  amount -= turned;
  if (amount <= 0) return;
  const before = victim.stability ?? 0;
  victim.stability = Math.max(0, before - amount);
  log(state, `${source.name}'s heat strikes ${owner.name}'s ${cardDef(victim.defId).name} (stability ${victim.stability}).`);
  if (victim.stability <= 0) {
    log(state, `${owner.name}'s ${cardDef(victim.defId).name} burns away.`);
    leaveTableau(state, owner, victim);
  }
}

/** What a card's removal does to the chosen card. */
export function enemyEffectKind(defId: string): 'destroy' | 'bounce' | 'erode' | null {
  return enemyEffect(defId)?.type ?? null;
}

/** Your other cards this card could return to your hand or restore (empty if it needs no such choice). */
export function allyChoices(p: PlayerState, defId: string): CardInstance[] {
  if (!(cardDef(defId).onPlay ?? []).some((e) => e.type === 'recall' || (e.type === 'restore' && !e.all))) return [];
  // Command cards can't be brought back to your own hand (a rival can still send them back).
  return allyEffectKind(defId) === 'recall' ? p.tableau.filter(returnable) : [...p.tableau];
}

/** Whether a card may be recalled or recovered to its owner's hand: anything but a Command card. */
export function returnable(card: CardInstance): boolean {
  return cardDef(card.defId).kind !== 'command';
}

/** Whether a card recalls one of your cards, so it can take that card's place in a full tableau. */
export function recallsInto(p: PlayerState, defId: string): boolean {
  return allyEffectKind(defId) === 'recall' && p.tableau.some(returnable);
}

/** Whether a card can be played into this tableau now: a free slot, a recall to make one, or no slot needed. */
export function hasRoomFor(p: PlayerState, defId: string): boolean {
  return !inSlots(defId) || !tableauFull(p) || recallsInto(p, defId);
}

/** Whether a card's ally choice returns the card to hand (rather than restoring its stability). */
export function allyEffectKind(defId: string): 'recall' | 'restore' | null {
  const e = (cardDef(defId).onPlay ?? []).find((x) => x.type === 'recall' || (x.type === 'restore' && !x.all));
  return e?.type === 'recall' || e?.type === 'restore' ? e.type : null;
}

/** Cards in your discard pile this card could recover (empty if it has no recover). */
export function recoverChoices(p: PlayerState, defId: string): CardInstance[] {
  const e = (cardDef(defId).onPlay ?? []).find((x): x is Extract<Effect, { type: 'recover' }> => x.type === 'recover');
  if (!e) return [];
  return p.discard.filter((c) => returnable(c) && (!e.kind || cardDef(c.defId).kind === e.kind));
}

/** Whether a card cares about its neighbours (or makes its neighbours better). */
export function resonates(defId: string): boolean {
  const def = cardDef(defId);
  const adjacentCount = (list?: Effect[]) => (list ?? []).some((e) => 'plus' in e && e.plus?.of === 'adjacent');
  return (def.passive ?? []).some((ps) => ps.type === 'adjacent') || adjacentCount(def.onPlay) || adjacentCount(def.onTurn);
}

/** Whether resonance can boost a card: it has heat, cooling or shields of its own. */
export function boostable(defId: string): boolean {
  const def = cardDef(defId);
  return [...(def.onPlay ?? []), ...(def.onTurn ?? []), ...(def.choices ?? []).flatMap((c) => c.onTurn)].some((e) => e.type === 'heat' || e.type === 'cool' || e.type === 'shield');
}

/** Your empty tableau slots, left to right. */
export function freeSlots(p: PlayerState): number[] {
  const taken = new Set(p.tableau.map((c) => c.slot));
  return Array.from({ length: BALANCE.tableauSlots }, (_, i) => i).filter((i) => !taken.has(i));
}

/** Slots from safest (the middle) to least safe (the edges). */
function slotsBySafety(): number[] {
  return Array.from({ length: BALANCE.tableauSlots }, (_, i) => i).sort((a, b) => BALANCE.slotDefence[b] - BALANCE.slotDefence[a] || a - b);
}

/** Whether the player must choose a slot: whenever more than one is free (position always matters). */
export function needsSlot(p: PlayerState, defId: string): boolean {
  return inSlots(defId) && freeSlots(p).length > 1;
}

/** How long a card stays in play before it fades into its owner's discard pile. */
export function baseStability(defId: string): number {
  const def = cardDef(defId);
  if (def.stability !== undefined) return def.stability;
  // A card that only does something once (when played) stays just until your next dawn: its slot is part of its cost.
  // Command cards stay for their full term, whatever they do.
  if (def.kind === 'command') return BALANCE.stabilityCommand;
  if (!def.onTurn?.length && !def.passive?.length && !def.choices?.length) return BALANCE.stabilityBurst;
  return BALANCE.stability;
}

/** The energy a card costs to play (see costs.ts; 1 if not listed). */
export function cardCost(defId: string): number {
  return cardDef(defId).cost ?? 1;
}

/** Put a card into a tableau slot, with its full stability. */
function place(p: PlayerState, card: CardInstance, slot: number) {
  card.slot = slot;
  card.stability = baseStability(card.defId);
  p.tableau.push(card);
  p.tableau.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

/** Slots between two cards in the same tableau. */
function distance(a: CardInstance, b: CardInstance): number {
  // The Command slot stands apart: it has no neighbours.
  if (a.slot === COMMAND_SLOT || b.slot === COMMAND_SLOT) return a.uid === b.uid ? 0 : 99;
  return Math.abs((a.slot ?? 0) - (b.slot ?? 0));
}

/**
 * A card's defence: its slot's (1 at the edges, 2 inside, 3 in the middle),
 * plus its own sturdiness, plus bulwark cards near it. Removal cards can only
 * reach cards with low enough defence.
 */
export function cardDefence(p: PlayerState, card: CardInstance): number {
  const slotDef = card.slot === COMMAND_SLOT ? BALANCE.commandSlotDefence : (BALANCE.slotDefence[card.slot ?? 0] ?? 1);
  let d = slotDef + (cardDef(card.defId).defence ?? 0);
  for (const src of p.tableau) {
    const k = distance(src, card);
    if (k === 0) continue;
    for (const ps of cardDef(src.defId).passive ?? []) if (ps.type === 'guard' && k <= ps.amounts.length) d += ps.amounts[k - 1];
  }
  // Heat dents defence for the rest of the day it lands in (it is back to full as the next day starts).
  return Math.max(0, d - (card.dented ?? 0));
}

/** A card's defence before any dents this day. */
export function fullDefence(p: PlayerState, card: CardInstance): number {
  return cardDefence(p, { ...card, dented: 0 });
}

/** Whether a card is anchored (a neighbour stops it losing stability). */
function anchored(p: PlayerState, card: CardInstance): boolean {
  return p.tableau.some((src) => distance(src, card) === 1 && (cardDef(src.defId).passive ?? []).some((ps) => ps.type === 'anchor'));
}

/** Whether the player may set this Lightspeed card now (only one can be face down at a time). */
export function canSetLightspeed(p: PlayerState): boolean {
  return p.lightspeed === null;
}

/** A card of another kind that can also be set face down at lightspeed (a Lightspeed guard). */
export function dualLightspeed(defId: string): boolean {
  const def = cardDef(defId);
  return def.kind !== 'lightspeed' && !!def.lightspeed;
}

/** What a card costs: set face down at lightspeed, a Lightspeed guard costs 1 more. */
export function playCost(defId: string, faceDown = false): number {
  return cardCost(defId) + (faceDown && dualLightspeed(defId) ? 1 : 0);
}

/** Whether a Lightspeed guard could be set face down now (its slot free, the energy there). */
export function canSetFaceDown(p: PlayerState, defId: string): boolean {
  return dualLightspeed(defId) && canSetLightspeed(p) && playCost(defId, true) <= p.playsLeft;
}

/** The choices a card is played with (Command cards), or none. */
export function cardChoices(defId: string): string[] {
  return (cardDef(defId).choices ?? []).map((c) => c.id);
}

/** A card's dawn effects: its own, and the choice it was played with (a card placed without one takes the first). */
export function dawnEffects(card: CardInstance): Effect[] {
  const def = cardDef(card.defId);
  const chosen = def.choices?.find((c) => c.id === card.choice) ?? def.choices?.[0];
  return [...(def.onTurn ?? []), ...(chosen?.onTurn ?? [])];
}

/** Whether a card stays in the tableau when played (everything but Lightspeed cards, which are set face down). */
export function persists(defId: string): boolean {
  return cardDef(defId).kind !== 'lightspeed';
}

/**
 * Resonance: the bonus a card in the tableau gets from the resonating cards
 * near it (+amounts[0] right next to one, +amounts[1] two places away...).
 */
export function resonanceBonus(p: PlayerState, card: CardInstance): number {
  if (!p.tableau.some((c) => c.uid === card.uid)) return 0;
  const kind = cardDef(card.defId).kind;
  let bonus = 0;
  p.tableau.forEach((src) => {
    const d = distance(src, card);
    if (d === 0) return;
    for (const ps of cardDef(src.defId).passive ?? []) {
      if (ps.type === 'adjacent' && d <= ps.amounts.length && (!ps.kind || ps.kind === kind)) bonus += ps.amounts[d - 1];
    }
  });
  return bonus;
}

function neighbours(p: PlayerState, card: CardInstance): CardInstance[] {
  if (!p.tableau.some((c) => c.uid === card.uid)) return [];
  return p.tableau.filter((c) => distance(c, card) === 1);
}

function countOf(p: PlayerState, card: CardInstance, c: Count, state?: GameState): number {
  const per = 'per' in c && c.per ? c.per : 1;
  switch (c.of) {
    case 'kind':
      return Math.floor(p.tableau.filter((t) => cardDef(t.defId).kind === c.kind).length / per);
    case 'cards':
      return Math.floor(p.tableau.length / per);
    case 'shields':
      return Math.floor(p.shields / per);
    case 'growth':
      return card.growth ?? 0;
    case 'adjacent':
      return neighbours(p, card).filter((n) => !c.kind || cardDef(n.defId).kind === c.kind).length;
    case 'planet':
      return currentPlanet(p, state) === c.planet ? c.amount : 0;
    case 'spent':
      return (card.spent ?? 0) * (c.times ?? 1);
    case 'cold': {
      const sun = c.rival ? (state ? targetOf(state, p) : undefined) : p;
      return sun ? Math.max(0, -sun.heat) * (c.times ?? 1) : 0;
    }
  }
}

export function conditionMet(p: PlayerState, cond: Condition | undefined, state?: GameState): boolean {
  if (!cond) return true;
  if ('overheated' in cond) return isOverheated(p);
  if ('minKind' in cond) return p.tableau.filter((t) => cardDef(t.defId).kind === cond.minKind).length >= cond.n;
  if ('planet' in cond) return currentPlanet(p, state) === cond.planet;
  return p.tableau.length >= cond.minCards;
}

/**
 * How much an effect does right now, with every bonus: the card's scaling,
 * attack bonuses and Solar Maximum.
 * Bonuses only apply to an effect that does something on its own.
 */
export function effectAmount(state: GameState, p: PlayerState, card: CardInstance, e: Effect, when: Timing = 'play'): number {
  if (e.type !== 'heat' && e.type !== 'cool' && e.type !== 'shield' && e.type !== 'selfHeat' && e.type !== 'draw') return 0;
  let base = e.amount;
  if ((e.type === 'heat' || e.type === 'cool' || e.type === 'shield') && e.plus) base += countOf(p, card, e.plus, state);
  if ((e.type === 'heat' || e.type === 'cool' || e.type === 'shield') && e.max !== undefined) base = Math.min(base, e.max);
  if (base <= 0) return 0;
  if (e.type !== 'draw' && e.type !== 'selfHeat') base += resonanceBonus(p, card);
  if (e.type === 'heat') {
    const kind = cardDef(card.defId).kind;
    // Bonus cards count once per card name (copies do not stack).
    let bonus = 0;
    const counted = new Set<string>();
    for (const { card: src, passive } of passives(p)) {
      if (passive.type !== 'kindBonus' || passive.kind !== kind || (passive.others && src.uid === card.uid) || (passive.onTurnOnly && when !== 'turn') || counted.has(src.defId)) continue;
      counted.add(src.defId);
      bonus += passive.amount;
    }
    if (fieldActive(state, 'solarMaximum')) bonus += 1;
    return base + bonus;
  }
  return base;
}

/** What a player's dawn will do, from their tableau and the table (for everyone to see and plan around). */
export interface TurnForecast {
  /** Heat at their rival. */
  heat: number;
  /** Who that is. */
  targetId: string | null;
  shields: number;
  cool: number;
  /** Heat to their own sun from their cards' drawbacks, Solar Storm and the map (regional instability is apart, below). */
  selfHeat: number;
  /** Regional instability's heat on every sun as the next round begins (in round `unstableRound`). */
  unstable: number;
  unstableRound: number;
  /** The round their next day falls in. */
  round: number;
  /** Extra cards drawn (beyond the usual draw). */
  draw: number;
  /** Of those, and of the extra energy, what the planet facing their sun gives (the rest is the table's). */
  planetDraw: number;
  planetPlays: number;
  /** Extra cards they may play (an industrial planet). */
  plays: number;
  /** The planet that will face their sun. */
  planet: Planet;
}

/**
 * The net effect of a player's next dawn, before shields and
 * Lightspeed cards answer it: each card in their tableau, left to right
 * (growing cards grow first), plus the global card, regional instability and
 * the map's conditions.
 */
export function turnForecast(state: GameState, p: PlayerState, aims?: Record<string, string | null>): TurnForecast {
  const target = targetOf(state, p);
  // While this player's dawn waits on their aim, it is this dawn being forecast: the day has begun (the
  // planet has moved, the cards are drawn, the table has had its say), so only the tableau's dawn is left.
  const now = !!state.awaitingDawn && activePlayer(state) === p;
  // Their next day's planet (their first day starts at the dead planet).
  const orbit = !now && p.turnsTaken > 0 ? (p.orbit + 1) % ORBIT_LENGTH : p.orbit;
  const planet = planetsEaten(state, p) ? 'dead' : planetAt(orbit);
  // Their day comes this round if they sit after the active player, else next round.
  const round = now ? state.round : state.round + (state.players.indexOf(p) > state.activePlayerIndex ? 0 : 1);
  const f: TurnForecast = { heat: 0, targetId: target?.id ?? null, shields: 0, cool: 0, selfHeat: 0, unstable: 0, unstableRound: state.round + 1, round, draw: 0, plays: 0, planet, planetDraw: 0, planetPlays: 0 };
  if (p.eliminated) return f;
  if (!now && planet === 'abundant' && p.turnsTaken > 0) f.planetDraw = BALANCE.abundantDraw;
  if (planet === 'industrial') f.planetPlays = BALANCE.industrialPlays;
  f.draw += f.planetDraw;
  f.plays += f.planetPlays;
  // Run the effects on a copy, so growth and the like carry from one effect to the next (aimed as given).
  const me: PlayerState = { ...p, orbit, tableau: p.tableau.map((c) => ({ ...c, ...(aims && c.uid in aims ? { aim: aims[c.uid] ?? undefined } : {}) })) };
  for (const card of me.tableau) {
    for (const e of dawnEffects(card)) {
      if (!conditionMet(me, e.if, state)) continue;
      switch (e.type) {
        case 'grow':
          card.growth = Math.min(e.max, (card.growth ?? 0) + 1);
          break;
        case 'heat': {
          // Only the heat headed for the sun: a card aimed at a rival card (or held off by a Guard) is not.
          if (aimedCard(state, me, card)) break;
          const n = effectAmount(state, me, card, e, 'turn');
          f.heat += n;
          break;
        }
        case 'selfHeat':
          f.selfHeat += e.amount;
          break;
        case 'cool':
          f.cool += effectAmount(state, me, card, e, 'turn');
          break;
        case 'shield':
          f.shields += effectAmount(state, me, card, e, 'turn');
          break;
        case 'draw':
          f.draw += e.amount;
          break;
        case 'plays':
          f.plays += e.amount;
          break;
      }
    }
  }
  f.unstable = instabilityHeat({ ...state, round: f.unstableRound });
  if (now) return f;
  if (fieldActive(state, 'solarStorm')) f.selfHeat += 1;
  if (fieldActive(state, 'iceAge')) f.cool += 1;
  const m = p.modifiers;
  f.selfHeat += m?.heatPerTurn ?? 0;
  f.cool += m?.coolPerTurn ?? 0;
  f.shields += m?.shieldPerTurn ?? 0;
  f.draw += m?.extraDraw ?? 0;
  return f;
}

/** How a dawn's heat would leave each rival card it reaches: what defence and stability it has left. */
export interface DawnHeatPreview {
  cards: Record<string, { defence: number; stability: number; heat: number; gone: boolean }>;
  /** Heat that reaches the rival's sun (after shields), and the shields they have left. */
  sun: number;
  shields: number;
}

/**
 * What this player's dawn heat would do, aimed as given (card uid → rival card uid, or null for their sun;
 * cards not listed keep their own aim): shields first, then each card's defence (not for pierce heat),
 * then its stability, card by card in the order the dawn resolves them.
 */
export function previewDawnHeat(state: GameState, p: PlayerState, aims: Record<string, string | null> = {}): DawnHeatPreview {
  const t = targetOf(state, p);
  const out: DawnHeatPreview = { cards: {}, sun: 0, shields: t?.shields ?? 0 };
  if (!t) return out;
  for (const c of t.tableau) out.cards[c.uid] = { defence: cardDefence(t, c), stability: c.stability ?? 0, heat: 0, gone: false };
  const left = (c: CardInstance) => !out.cards[c.uid]?.gone;
  for (const card of p.tableau) {
    const aim = card.uid in aims ? aims[card.uid] : card.aim;
    for (const e of dawnEffects(card)) {
      if (e.type !== 'heat' || !conditionMet(p, e.if, state)) continue;
      let n = effectAmount(state, p, card, e, 'turn');
      if (n <= 0) continue;
      // Where it lands, as aimedCard decides it (burnt-away cards no longer draw it).
      const g = guards(t).filter(left);
      const aimed = aim ? t.tableau.find((c) => c.uid === aim && left(c)) : undefined;
      const victim = aimed && (!g.length || g.includes(aimed)) ? aimed : g.length ? [...g].sort((a, b) => out.cards[a.uid].stability - out.cards[b.uid].stability)[0] : undefined;
      const blocked = Math.min(e.pierce ? Math.floor(out.shields * BALANCE.pierceShieldShare) : out.shields, n);
      out.shields -= blocked;
      n -= blocked;
      if (!victim) {
        out.sun += n;
        continue;
      }
      const v = out.cards[victim.uid];
      const turned = e.pierce ? 0 : Math.min(n, v.defence);
      v.defence -= turned;
      n -= turned;
      v.stability = Math.max(0, v.stability - n);
      v.heat += n;
      if (v.stability <= 0) v.gone = true;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function drawCards(state: GameState, p: PlayerState, count: number) {
  for (let i = 0; i < count; i++) {
    if (p.deck.length === 0 && p.discard.length > 0) {
      reshuffle(state, p);
      if (p.eliminated) return;
    }
    const card = p.deck.pop();
    if (card) p.hand.push(card);
    else {
      log(state, `${p.name}'s deck is empty: the strain heats their sun by ${BALANCE.fatigueHeat}.`);
      applyHeat(state, p, BALANCE.fatigueHeat, null);
      if (p.eliminated) return;
    }
  }
}

/** An empty deck: the discard pile is shuffled back in to be used again, at the price of some heat. */
function reshuffle(state: GameState, p: PlayerState) {
  p.deck = shuffleInPlace(state, p.discard);
  p.discard = [];
  log(state, `${p.name} shuffles their discard pile back into their deck: the strain heats their sun by ${BALANCE.reshuffleHeat}.`);
  applyHeat(state, p, BALANCE.reshuffleHeat, null);
}

/**
 * A face-down Lightspeed card springs, if what just happened (during the
 * enemy's own turn) is what it waits for. It is revealed, resolves against
 * that enemy and goes to the discard pile. Returns true if it cancels what
 * sprang it.
 */
/**
 * An enemy's heat is about to strike one of this player's cards: a face-down Lightspeed guard springs into
 * a free slot of their tableau to take it. Returns the card that landed (none if nothing sprang).
 */
function springGuard(state: GameState, owner: PlayerState, enemy: PlayerState, cause?: string): CardInstance | null {
  const card = owner.lightspeed;
  if (!card || owner.eliminated || owner.id === enemy.id || activePlayer(state).id !== enemy.id) return null;
  const ls = cardDef(card.defId).lightspeed;
  if (!ls?.deploy || ls.trigger.on !== 'cardHeated') return null;
  const open = freeSlots(owner);
  const slot = slotsBySafety().find((i) => open.includes(i));
  if (slot === undefined) return null;
  owner.lightspeed = null;
  place(owner, card, slot);
  log(state, `⚡ Lightspeed! ${owner.name}'s ${cardDef(card.defId).name} lands in their tableau${cause ? ` in answer to ${enemy.name}'s ${cardDef(cause).name}` : ''}, and takes the heat.`);
  (state.sprung ??= []).push({ ownerId: owner.id, defId: card.defId, against: cause, enemyId: enemy.id, trigger: 'cardHeated' });
  resolveEffects(state, owner, card, ls.effects, 'spring', { against: enemy });
  return owner.tableau.includes(card) ? card : null;
}

function spring(state: GameState, owner: PlayerState, enemy: PlayerState, matches: (t: LightspeedTrigger) => boolean, cause?: string): boolean {
  const card = owner.lightspeed;
  if (!card || owner.eliminated || owner.id === enemy.id || activePlayer(state).id !== enemy.id) return false;
  const ls = cardDef(card.defId).lightspeed;
  if (!ls || !matches(ls.trigger)) return false;
  owner.lightspeed = null;
  owner.discard.push(card);
  const why = cause ? ` in answer to ${enemy.name}'s ${cardDef(cause).name}` : '';
  log(state, `⚡ Lightspeed! ${owner.name} springs ${cardDef(card.defId).name}${why}.`);
  // What sprang it, for the table to show beside it.
  (state.sprung ??= []).push({ ownerId: owner.id, defId: card.defId, against: cause, enemyId: enemy.id, trigger: ls.trigger.on });
  resolveEffects(state, owner, card, ls.effects, 'spring', { against: enemy });
  return !!ls.counter;
}

/** A player's card by uid, wherever it is. */
function cardIn(p: PlayerState, uid: string): CardInstance | undefined {
  return [...p.tableau, ...p.hand, ...p.discard, ...p.deck].find((c) => c.uid === uid);
}

/** Heat a sun. Enemy heat is absorbed by shields first. Returns the heat that got through. */
function applyHeat(state: GameState, target: PlayerState, amount: number, source: PlayerState | null, retaliation = false, cardUid?: string, pierce = false): number {
  if (target.eliminated || amount <= 0) return 0;
  const enemy = source !== null && source.id !== target.id;
  if (enemy && !retaliation && spring(state, target, source, (t) => t.on === 'heated' && amount >= (t.min ?? 1), cardUid ? cardIn(source, cardUid)?.defId : undefined)) {
    log(state, `The heat never reaches ${target.name}'s sun.`);
    return 0;
  }
  if (target.eliminated || state.winnerId) return 0;
  // Piercing heat goes straight past shields.
  const blocked = enemy ? Math.min(pierce ? Math.floor(target.shields * BALANCE.pierceShieldShare) : target.shields, amount) : 0;
  target.shields -= blocked;
  const applied = amount - blocked;
  target.heat = Math.max(BALANCE.minHeat, target.heat + applied);
  if (enemy) source.turn.heatDealt += amount;
  if (blocked > 0) log(state, `${target.name}'s shields absorb ${blocked} heat.`);
  if (applied > 0) log(state, `${target.name}'s sun heats to ${target.heat}.`);
  if (target.heat >= supernovaThreshold(target)) supernova(state, target);
  if (enemy && blocked > 0 && !retaliation && !target.eliminated) shieldsAnswer(state, target, source, cardUid);
  return applied;
}

/**
 * Shields that absorbed an enemy's heat (aimed at the sun or at a card) can sting back (Stinging Veil)
 * or cool their sun (Ommarath), at most once per attacking card each day.
 */
function shieldsAnswer(state: GameState, target: PlayerState, source: PlayerState, cardUid?: string) {
  const sum = (type: 'retaliate' | 'absorbCool') =>
    passives(target).reduce((n, { passive }) => n + (passive.type === type ? passive.amount : 0), 0);
  const sting = sum('retaliate');
  const soothe = sum('absorbCool');
  const key = cardUid ?? source.id;
  if (target.stung?.turn !== state.turnNumber) target.stung = { turn: state.turnNumber, ids: [] };
  if ((sting > 0 || soothe > 0) && !target.stung.ids.includes(key)) {
    target.stung.ids.push(key);
    if (soothe > 0) cool(state, target, soothe);
    if (sting > 0) {
      // The sting hits the card that attacked, past its defence; never a sun (with no such card on the table, nothing).
      const attacker = cardUid ? source.tableau.find((c) => c.uid === cardUid) : undefined;
      if (attacker) {
        log(state, `${target.name}'s veil stings ${source.name}'s ${cardDef(attacker.defId).name} for ${sting}.`);
        heatCard(state, source, attacker, sting, target, false, '', true);
      }
    }
  }
}

function cool(state: GameState, p: PlayerState, amount: number) {
  const before = p.heat;
  p.heat = Math.max(BALANCE.minHeat, p.heat - amount);
  p.turn.cooled += before - p.heat;
  if (p.heat !== before) log(state, `${p.name}'s sun cools to ${p.heat}.`);
}

function supernova(state: GameState, p: PlayerState) {
  if (p.eliminated) return;
  p.eliminated = true;
  log(state, `☀ ${p.name}'s sun goes SUPERNOVA!`);
  // Their tableau burns away with them (without triggering anything).
  p.discard.push(...p.tableau, ...(p.lightspeed ? [p.lightspeed] : []));
  p.tableau = [];
  p.lightspeed = null;
  const alive = state.players.filter((o) => !o.eliminated);
  if (alive.length === 1) {
    state.winnerId = alive[0].id;
    log(state, `${alive[0].name} wins the Blue Loop!`);
  }
}

/** When an effect resolves: as its card is played, at the start of its owner's turn, as it leaves play, as it is recovered, or as a Lightspeed card springs. */
export type Timing = 'play' | 'turn' | 'leave' | 'recover' | 'spring';

interface PlayContext {
  enemyUid?: string;
  allyUid?: string;
  recoverUid?: string;
  /** Lightspeed: the enemy who sprang the card (the effects' target). */
  against?: PlayerState;
}

/** A card in the discard pile a recover effect can take back: of its kind, if it names one, and never a Command card. */
const kindMatches = (c: CardInstance, kind?: CardKind) => returnable(c) && (!kind || cardDef(c.defId).kind === kind);

function resolveEffects(state: GameState, p: PlayerState, card: CardInstance, effects: Effect[] | undefined, when: Timing, ctx: PlayContext = {}) {
  for (const e of effects ?? []) {
    if (state.winnerId || p.eliminated) return;
    if (!conditionMet(p, e.if, state)) continue;
    switch (e.type) {
      case 'heat': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount <= 0) break;
        const main = ctx.against && !ctx.against.eliminated ? ctx.against : targetOf(state, p);
        if (!main) break;
        // A card's heat goes where it is aimed: a rival card, or their sun (a card that has left play aims
        // at the sun). Guards draw it all in. Only Lightspeed cards, springing on a rival's day, go straight to the sun.
        const aimed = !ctx.against && main === targetOf(state, p) ? aimedCard(state, p, card) : null;
        // A face-down Lightspeed guard can spring in front of the card the heat was aimed at.
        const victim = aimed ? springGuard(state, main, p, card.defId) ?? aimed : null;
        if (state.winnerId || p.eliminated) break;
        if (victim) {
          if (when === 'turn') notePulse(state, p, card, 'heat', main, amount, victim.uid);
          heatCard(state, main, victim, amount, p, !!e.pierce, card.uid);
          if (when === 'turn' && state.turnPulses) {
            const last = state.turnPulses[state.turnPulses.length - 1];
            last.suns = Object.fromEntries(state.players.map((x) => [x.id, { heat: x.heat, shields: x.shields, eliminated: x.eliminated }]));
          }
          break;
        }
        applyHeat(state, main, amount, p, false, card.uid, e.pierce);
        if (when === 'turn') notePulse(state, p, card, 'heat', main, amount);
        break;
      }
      case 'selfHeat':
        applyHeat(state, p, e.amount, null);
        if (when === 'turn') notePulse(state, p, card, 'selfHeat', p, e.amount);
        break;
      case 'cool': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount > 0) {
          cool(state, p, amount);
          if (when === 'turn') notePulse(state, p, card, 'cool', p, amount);
        }
        break;
      }
      case 'shield': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount > 0) {
          p.shields += amount;
          log(state, `${p.name} raises ${amount} shield${amount === 1 ? '' : 's'}.`);
          if (when === 'turn') notePulse(state, p, card, 'shield', p, amount);
        }
        break;
      }
      case 'draw': {
        const n = e.amount + (e.plus ? countOf(p, card, e.plus, state) : 0);
        drawCards(state, p, n);
        if (when === 'turn') notePulse(state, p, card, 'draw', p, n);
        break;
      }
      case 'orbit': {
        const who = e.who === 'rival' ? (ctx.against && !ctx.against.eliminated ? ctx.against : targetOf(state, p)) : p;
        if (who) moveOrbit(state, who, e.amount);
        break;
      }
      case 'growOthers':
        for (const other of p.tableau) {
          if (other.uid === card.uid) continue;
          const g = (cardDef(other.defId).onTurn ?? []).find((x) => x.type === 'grow');
          if (g?.type === 'grow') other.growth = Math.min(g.max, (other.growth ?? 0) + 1);
        }
        break;
      case 'grow':
        card.growth = Math.min(e.max, (card.growth ?? 0) + 1);
        break;
      case 'destroy':
      case 'bounce': {
        const t = ctx.against ?? targetOf(state, p);
        const victim = t?.tableau.find((c) => c.uid === ctx.enemyUid && canReach(t, c, e));
        if (!t || !victim) break;
        if (spring(state, t, p, (tr) => tr.on === 'targeted', card.defId)) {
          log(state, `${p.name}'s ${cardDef(card.defId).name} misses: ${cardDef(victim.defId).name} stays in play.`);
          break;
        }
        if (state.winnerId || t.eliminated) break;
        if (e.type === 'bounce') {
          log(state, `${p.name} returns ${t.name}'s ${cardDef(victim.defId).name} to their hand.`);
          leaveTableau(state, t, victim, 'hand');
          break;
        }
        const around = e.neighbours ? neighbours(t, victim) : [];
        log(state, `${p.name} destroys ${t.name}'s ${cardDef(victim.defId).name}.`);
        leaveTableau(state, t, victim);
        for (const n of around) {
          if (state.winnerId || t.eliminated || !t.tableau.includes(n)) continue;
          log(state, `${t.name}'s ${cardDef(n.defId).name} is flung back to their hand.`);
          leaveTableau(state, t, n, 'hand');
        }
        break;
      }
      case 'erode': {
        const t = ctx.against ?? targetOf(state, p);
        if (!t) break;
        const hit = e.all ? [...t.tableau] : t.tableau.filter((c) => c.uid === ctx.enemyUid);
        if (!hit.length) break;
        if (!e.all && spring(state, t, p, (tr) => tr.on === 'targeted', card.defId)) {
          log(state, `${p.name}'s ${cardDef(card.defId).name} misses.`);
          break;
        }
        for (const c of hit) {
          if (state.winnerId || t.eliminated || !t.tableau.includes(c)) continue;
          c.stability = (c.stability ?? 1) - e.amount;
          log(state, `${t.name}'s ${cardDef(c.defId).name} loses ${e.amount} stability.`);
          if (c.stability <= 0) sweep(state, t, c);
        }
        break;
      }
      case 'restore': {
        const mine = e.all ? p.tableau.filter((c) => c.uid !== card.uid) : p.tableau.filter((c) => c.uid === ctx.allyUid);
        for (const c of mine) {
          c.stability = Math.min(BALANCE.maxStability, (c.stability ?? 0) + e.amount);
          log(state, `${p.name}'s ${cardDef(c.defId).name} steadies (stability ${c.stability}).`);
        }
        break;
      }
      case 'recall': {
        const back = p.tableau.find((c) => c.uid === ctx.allyUid && c.uid !== card.uid && returnable(c));
        if (back) {
          log(state, `${p.name} returns ${cardDef(back.defId).name} to their hand.`);
          leaveTableau(state, p, back, 'hand');
        }
        break;
      }
      case 'recover': {
        // (A Command card's dawn takes back the card most recently discarded: there is no one to choose.)
        const latest = e.latest ? p.discard.map((c, k) => (returnable(c) && kindMatches(c, e.kind) ? k : -1)).filter((k) => k >= 0).pop() ?? -1 : -1;
        const i = e.latest ? latest : p.discard.findIndex((c) => c.uid === ctx.recoverUid && kindMatches(c, e.kind));
        if (i < 0) {
          // Nothing there to recover: the card draws instead, so it is never dead.
          if (e.orDraw && !p.discard.some((c) => kindMatches(c, e.kind))) {
            log(state, `${p.name} has nothing to recover, and draws instead.`);
            drawCards(state, p, e.orDraw);
          }
          break;
        }
        const [back] = p.discard.splice(i, 1);
        p.hand.push(back);
        log(state, `${p.name} recovers ${cardDef(back.defId).name} from their discard pile.`);
        resolveEffects(state, p, back, cardDef(back.defId).onRecover, 'recover');
        break;
      }
      case 'plays':
        if (activePlayer(state).id === p.id) {
          // At dawn the day's energy is not set yet: it is banked and added when it is.
          if (when === 'turn') p.turn.dawnEnergy = (p.turn.dawnEnergy ?? 0) + e.amount;
          else {
            p.playsLeft += e.amount;
            p.turn.energyTotal = (p.turn.energyTotal ?? p.playsLeft - e.amount) + e.amount;
          }
          log(state, `${p.name} gains ${e.amount} energy today.`);
        }
        break;
      case 'halt':
        if (ctx.against && ctx.against.playsLeft > 0) {
          ctx.against.playsLeft = 0;
          log(state, `${ctx.against.name} may play no more cards today.`);
        }
        break;
    }
  }
}

/** A card whose stability ran out fades into its owner's discard pile (shuffled into a new deck once the deck runs out). */
function sweep(state: GameState, owner: PlayerState, card: CardInstance) {
  log(state, `${owner.name}'s ${cardDef(card.defId).name} fades into their discard pile.`);
  leaveTableau(state, owner, card, 'discard');
}

/** A card leaves its tableau for the discard pile (or its owner's hand or deck), triggering its leave effects. */
function leaveTableau(state: GameState, owner: PlayerState, card: CardInstance, to: 'discard' | 'hand' | 'deck' = 'discard') {
  owner.tableau = owner.tableau.filter((c) => c.uid !== card.uid);
  card.growth = undefined;
  card.slot = undefined;
  delete card.dented;
  card.stability = undefined;
  card.choice = undefined;
  card.spent = undefined;
  card.aim = undefined;
  if (to === 'deck') owner.deck.splice(randomInt(state, owner.deck.length + 1), 0, card);
  else (to === 'hand' ? owner.hand : owner.discard).push(card);
  resolveEffects(state, owner, card, cardDef(card.defId).onLeave, 'leave');
  // Cards that answer another card leaving (Kyr'Vessa).
  for (const { card: watcher, passive } of passives(owner)) {
    if (passive.type === 'allyLeaves' && owner.tableau.includes(watcher)) resolveEffects(state, owner, watcher, passive.effects, 'leave');
  }
}

/** Note a dawn effect for the table to replay (only while a day is starting). */
function notePulse(state: GameState, source: PlayerState, card: CardInstance | null, kind: TurnPulse['kind'], to: PlayerState, amount: number, toCard?: string) {
  if (!state.turnPulses || (amount <= 0 && kind !== 'start')) return;
  const suns = Object.fromEntries(state.players.map((x) => [x.id, { heat: x.heat, shields: x.shields, eliminated: x.eliminated }]));
  state.turnPulses.push({ uid: card?.uid, source: source.id, to: to.id, kind, amount, suns, ...(toCard ? { toCard } : {}) });
}

/**
 * Regional instability: every living sun takes the same heat at once, past shields. If that would
 * finish every sun, the one least far past its limit holds on (a coin flip if they are level) and wins.
 */
function regionalInstability(state: GameState, roundStarter: PlayerState) {
  const n = instabilityHeat(state);
  if (n <= 0) return;
  const living = state.players.filter((x) => !x.eliminated);
  log(state, `Regional instability heats every sun by ${n}.`);
  for (const x of living) x.heat = Math.max(BALANCE.minHeat, x.heat + n);
  let over = living.filter((x) => x.heat >= supernovaThreshold(x));
  if (over.length === living.length) {
    const past = (x: PlayerState) => x.heat - supernovaThreshold(x);
    const least = Math.min(...over.map(past));
    const level = over.filter((x) => past(x) === least);
    const holds = level[randomInt(state, level.length)];
    holds.heat = supernovaThreshold(holds) - 1;
    log(state, `${holds.name}'s sun barely holds.`);
    over = over.filter((x) => x !== holds);
  }
  for (const x of over) supernova(state, x);
  // Every sun's pulse lands together, showing the suns as they now stand.
  living.forEach((x, i) => {
    notePulse(state, roundStarter, null, 'unstable', x, n);
    const last = state.turnPulses?.[state.turnPulses.length - 1];
    if (last && i > 0) last.together = true;
  });
}

function startTurn(state: GameState) {
  const p = activePlayer(state);
  state.turnPulses = [];
  p.turnsTaken += 1;
  p.turn = emptyTurn();
  delete state.awaitingDawn;
  // A new day: every card's defence is whole again.
  for (const o of state.players) for (const c of o.tableau) delete c.dented;
  log(state, `— Day ${state.turnNumber}: ${p.name}.`);

  // Shields fade, unless Deep Current holds them.
  const keep = passives(p).some(({ passive }) => passive.type === 'keepShields');
  p.shields = keep ? Math.min(p.shields, BALANCE.maxKeptShields) : 0;

  // The planets move on a day (your first day starts at the dead planet).
  if (p.turnsTaken > 1) {
    const before = currentPlanet(p);
    p.orbit = (p.orbit + 1) % ORBIT_LENGTH;
    if (currentPlanet(p) !== before) log(state, `The ${currentPlanet(p)} planet swings round to face ${p.name}'s sun.`);
  }
  const abundance = currentPlanet(p, state) === 'abundant' ? BALANCE.abundantDraw : 0;
  // Draw (your opening hand covers your first day).
  if (p.turnsTaken > 1) drawCards(state, p, BALANCE.drawPerTurn + (p.modifiers?.extraDraw ?? 0) + abundance);
  if (p.eliminated) return passOn(state);

  // Every sun as the turn's effects begin (shields faded), for the table's replay to start from.
  notePulse(state, p, null, 'start', p, 0);
  // The table: instability, the map's modifiers, then any global card.
  // Regional instability strikes as each round begins: every sun at once (so no seat takes it first).
  if (state.players.find((x) => !x.eliminated) === p) regionalInstability(state, p);
  if (state.winnerId) return;
  if (p.eliminated) return passOn(state);
  const m = p.modifiers;
  if (m?.heatPerTurn) {
    applyHeat(state, p, m.heatPerTurn, null);
    notePulse(state, p, null, 'unstable', p, m.heatPerTurn);
  }
  if (m?.coolPerTurn) {
    cool(state, p, m.coolPerTurn);
    notePulse(state, p, null, 'cool', p, m.coolPerTurn);
  }
  if (m?.shieldPerTurn) {
    p.shields += m.shieldPerTurn;
    notePulse(state, p, null, 'shield', p, m.shieldPerTurn);
  }
  if (fieldActive(state, 'solarStorm')) {
    log(state, `Solar Storm batters ${p.name}.`);
    applyHeat(state, p, 1, null);
    notePulse(state, p, activeGlobal(state)?.card ?? null, 'unstable', p, 1);
  }
  if (fieldActive(state, 'iceAge')) {
    cool(state, p, 1);
    notePulse(state, p, activeGlobal(state)?.card ?? null, 'cool', p, 1);
  }

  // Your dawn heat waits for you to aim it (a `dawn` action), when there is a choice to make.
  for (const c of p.tableau) c.aim = undefined;
  if (needsDawnAim(state, p)) {
    state.awaitingDawn = true;
    return;
  }
  dawn(state, p);
}

/** A player's dawn: their tableau's dawn effects, cards fading, and the day's energy. */
function dawn(state: GameState, p: PlayerState) {
  delete state.awaitingDawn;
  // Your tableau's dawn effects, left to right.
  for (const card of [...p.tableau]) {
    if (state.winnerId || p.eliminated) break;
    if (!p.tableau.includes(card)) continue;
    resolveEffects(state, p, card, dawnEffects(card), 'turn');
  }
  // Then every card loses 1 stability (unless anchored); at 0 it fades into your discard pile.
  const fading = p.tableau.filter((c) => !anchored(p, c));
  for (const card of fading) card.stability = (card.stability ?? 1) - 1;
  for (const card of fading) {
    if (state.winnerId || p.eliminated) break;
    if (p.tableau.includes(card) && (card.stability ?? 0) <= 0) sweep(state, p, card);
  }
  p.playsLeft = playsAllowed(state, p) + (p.turn.dawnEnergy ?? 0);
  p.turn.energyTotal = p.playsLeft;
  p.turn.energyBase = Math.min(p.playsLeft, Math.min(p.turnsTaken, BALANCE.maxPlays));
  // Aims last for the dawn they were made for.
  for (const c of p.tableau) c.aim = undefined;
  if (p.eliminated) passOn(state);
}

/** The active player's sun went supernova on their own turn: play moves on. */
function passOn(state: GameState) {
  if (!state.winnerId) advanceTurn(state);
}

function advanceTurn(state: GameState) {
  if (state.winnerId) return;
  do {
    state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
    if (state.activePlayerIndex === 0) state.round += 1;
  } while (activePlayer(state).eliminated);
  state.turnNumber += 1;
  startTurn(state);
}

/** The other living players, in seat order after this one. */
function othersInOrder(state: GameState, p: PlayerState): PlayerState[] {
  const n = state.players.length;
  const seat = state.players.indexOf(p);
  return Array.from({ length: n - 1 }, (_, k) => state.players[(seat + k + 1) % n]).filter((o) => !o.eliminated);
}

function playCard(state: GameState, p: PlayerState, action: Extract<Action, { type: 'playCard' }>) {
  const card = p.hand.find((c) => c.uid === action.cardUid);
  if (!card) throw new GameError('That card is not in your hand.');
  const def: CardDef = cardDef(card.defId);
  // A Lightspeed guard can be set face down instead, for 1 more energy.
  const lightspeed = def.kind === 'lightspeed' || (!!action.faceDown && dualLightspeed(def.id));
  const cost = playCost(def.id, lightspeed);
  if (p.playsLeft < cost) throw new GameError(p.playsLeft <= 0 ? 'You have no energy left today.' : `${def.name} costs ${cost} energy: you have ${p.playsLeft} left today.`);
  if (lightspeed && !canSetLightspeed(p)) throw new GameError('You already have a Lightspeed card face down.');
  const slotted = inSlots(def.id) && !lightspeed;

  const choices = cardChoices(def.id);
  if (choices.length && !choices.includes(action.choice ?? '')) throw new GameError('Choose one of its options.');
  const target = targetOf(state, p);
  const foes = enemyChoices(state, p, def.id);
  if (foes.length > 0 && !foes.some((c) => c.uid === action.enemyUid)) {
    throw new GameError(`Choose a card in ${target?.name ?? 'your rival'}'s tableau.`);
  }
  // A recall card can go into a full tableau: it takes the place of the card it recalls.
  // A recall card can take the place of the card it recalls: when the tableau is full, or whenever its
  // player puts it in that card's slot.
  const recalled = allyEffectKind(def.id) === 'recall' ? p.tableau.find((c) => c.uid === action.allyUid && returnable(c) && c.slot !== COMMAND_SLOT) : undefined;
  const swap = slotted && (tableauFull(p) ? recallsInto(p, def.id) : !!recalled && action.slot === recalled.slot);
  if (slotted && tableauFull(p) && !swap) throw new GameError('Your tableau is full: a card can only go in once one fades, or is recalled or removed.');
  const free = freeSlots(p);
  if (slotted && !swap && action.slot !== undefined && !free.includes(action.slot)) throw new GameError('Choose an empty slot.');
  const allies = allyChoices(p, def.id);
  if (allies.length > 0 && !allies.some((c) => c.uid === action.allyUid)) throw new GameError('Choose a card of yours.');
  const recovers = recoverChoices(p, def.id);
  if (recovers.length > 0 && !recovers.some((c) => c.uid === action.recoverUid)) throw new GameError('Choose a card in your discard pile to recover.');

  const aims = aimChoices(state, p);
  if (aimable(def.id) && target) {
    if (action.aimUid && !aims.cards.some((c) => c.uid === action.aimUid)) throw new GameError("Aim at a card in your rival's tableau, or at their sun.");
    if (!action.aimUid && !aims.sun && aims.cards.length) throw new GameError(`${target.name} has a Guard in play: aim at it.`);
  }

  p.hand = p.hand.filter((c) => c.uid !== card.uid);
  if (action.aimUid && aimable(def.id)) card.aim = action.aimUid;
  // An X card spends all the energy left; its effects count how much.
  const spend = def.spendAll ? p.playsLeft : cost;
  if (def.spendAll) card.spent = spend;
  p.playsLeft -= spend;
  p.turn.cardsPlayed += 1;
  log(state, lightspeed ? `${p.name} sets a card face down at lightspeed.` : `${p.name} plays ${def.name}.`);

  // Rivals' face-down Lightspeed cards may answer the card before it resolves.
  for (const o of othersInOrder(state, p)) {
    const cancelled = spring(state, o, p, (t) => t.on === 'enemyPlays' && (!t.kind || t.kind === (lightspeed ? 'lightspeed' : def.kind)), lightspeed ? undefined : def.id);
    if (state.winnerId || p.eliminated) {
      p.discard.push(card);
      return;
    }
    if (cancelled) {
      log(state, `${lightspeed ? 'The face-down card' : def.name} is cancelled.`);
      p.discard.push(card);
      return;
    }
  }

  if (lightspeed) {
    p.lightspeed = card;
    return;
  }
  // Only one global card on the table: a new one sweeps the old away.
  if (def.kind === 'global') {
    const old = activeGlobal(state);
    if (old) {
      log(state, `${def.name} replaces ${cardDef(old.card.defId).name}.`);
      leaveTableau(state, old.owner, old.card);
      if (state.winnerId || p.eliminated) return;
    }
  }
  // A Command card takes the Command slot: one at a time, so a new one replaces the old.
  if (def.kind === 'command') {
    const old = commandCard(p);
    if (old) {
      log(state, `${def.name} replaces ${cardDef(old.defId).name}.`);
      leaveTableau(state, p, old);
      if (state.winnerId || p.eliminated) {
        p.discard.push(card);
        return;
      }
    }
    action = { ...action, slot: COMMAND_SLOT };
  }
  // Into a full tableau, a recall card first returns the card it recalls, and takes its slot.
  if (swap) {
    const back = p.tableau.find((c) => c.uid === action.allyUid);
    if (back) {
      log(state, `${p.name} returns ${cardDef(back.defId).name} to their hand.`);
      const at = back.slot;
      leaveTableau(state, p, back, 'hand');
      if (state.winnerId || p.eliminated) {
        p.discard.push(card);
        return;
      }
      action = { ...action, slot: at };
    }
  }
  // The chosen slot, or else the safest one free.
  const open = freeSlots(p);
  const slot = def.kind === 'command' ? COMMAND_SLOT : action.slot !== undefined && open.includes(action.slot) ? action.slot : slotsBySafety().find((i) => open.includes(i));
  if (slot === undefined) {
    p.discard.push(card);
    return;
  }
  place(p, card, slot);
  if (choices.length) {
    card.choice = action.choice;
    log(state, `${p.name} chooses: ${choiceLabel(action.choice!)}.`);
  }
  resolveEffects(state, p, card, def.onPlay, 'play', action);
  // The aim was for this play: later heat (its dawn, or as it leaves) is aimed afresh.
  card.aim = undefined;
}

/** A choice as words, for the log ("heat 2", "draw 1"). */
export function choiceLabel(id: string): string {
  const m = /^([a-z]+)(\d+)$/.exec(id);
  return m ? `${m[1]} ${m[2]}` : id;
}

/** Apply an action and return the new state (the input is never mutated). */
export function applyAction(prev: GameState, action: Action): GameState {
  if (prev.winnerId) throw new GameError('The game is over.');
  const state = structuredClone(prev);
  // Only the state a day starts in carries that start's pulses (and only this move's state, what sprang).
  delete state.turnPulses;
  delete state.sprung;
  const p = activePlayer(state);
  if (action.type === 'dawn' && !state.awaitingDawn) throw new GameError('Your dawn has already broken.');
  if (state.awaitingDawn && action.type !== 'dawn' && action.type !== 'concede') throw new GameError('Aim your dawn heat first.');
  switch (action.type) {
    case 'concede': {
      const quitter = state.players.find((o) => o.id === action.playerId);
      if (!quitter || quitter.eliminated) throw new GameError('That player is not in the game.');
      quitter.eliminated = true;
      state.concededBy = quitter.id;
      log(state, `${quitter.name} concedes.`);
      const alive = state.players.filter((o) => !o.eliminated);
      if (alive.length === 1) {
        state.winnerId = alive[0].id;
        log(state, `${alive[0].name} wins the Blue Loop!`);
      } else if (quitter === p) advanceTurn(state);
      break;
    }
    case 'playCard':
      playCard(state, p, action);
      if (p.eliminated) passOn(state);
      break;
    case 'dawn': {
      const choices = aimChoices(state, p);
      for (const [uid, aim] of Object.entries(action.aims)) {
        const mine = p.tableau.find((c) => c.uid === uid);
        if (!mine || !dawnAimable(mine)) throw new GameError('Aim only your cards that heat at dawn.');
        if (aim === null) {
          if (!choices.sun) throw new GameError('Your rival has a Guard in play: aim at it.');
          mine.aim = undefined;
        } else {
          if (!choices.cards.some((c) => c.uid === aim)) throw new GameError("Aim at a card in your rival's tableau, or at their sun.");
          mine.aim = aim;
        }
      }
      // The dawn's replay starts from the suns as they are now.
      state.turnPulses = [];
      notePulse(state, p, null, 'start', p, 0);
      dawn(state, p);
      break;
    }
    case 'setTarget': {
      const t = state.players.find((o) => o.id === action.targetId);
      if (!t || t.eliminated || t.id === p.id) throw new GameError('Choose a living rival to target.');
      p.targetId = t.id;
      break;
    }
    case 'endTurn':
      advanceTurn(state);
      break;
  }
  return state;
}

export function isGameOver(state: GameState): boolean {
  return state.winnerId !== null;
}
