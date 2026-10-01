import { BALANCE } from './balance';
import { cardDef, presetDeck } from './cards';
import { randomInt, shuffleInPlace } from './rng';
import { CORE_ACTIONS } from './types';
import type { Action, CardDef, CardInstance, CardKind, Condition, CoreAction, Count, Effect, FieldId, GameSetup, GameState, LightspeedTrigger, Passive, Planet, PlayerState, TurnStats } from './types';

export class GameError extends Error {}

const emptyTurn = (): TurnStats => ({ heatDealt: 0, cardsPlayed: 0, cooled: 0 });

export const MAX_UPGRADES: Record<CoreAction, number> = {
  solarFlare: BALANCE.solarFlareMaxUpgrades,
  thermosiphon: BALANCE.thermosiphonMaxUpgrades,
  coolingChamber: BALANCE.coolingChamberMaxUpgrades,
};

export const ACTION_NAME: Record<CoreAction, string> = {
  solarFlare: 'Solar Flare',
  thermosiphon: 'Thermosiphon',
  coolingChamber: 'Cooling Chamber',
};

/** What each core upgrade does for your deck. */
export const ACTION_TEXT: Record<CoreAction, string> = {
  solarFlare: 'Each upgrade: every heat effect from your attack cards deals 1 more heat.',
  thermosiphon: 'Each upgrade: every cooling effect from your cards cools 1 more.',
  coolingChamber: `Each upgrade: +${BALANCE.coolingChamberHealthPerUpgrade} max health.`,
};

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
    const upgrades = { solarFlare: 0, thermosiphon: 0, coolingChamber: 0 };
    for (const a of CORE_ACTIONS) upgrades[a] = Math.min(MAX_UPGRADES[a], ps.upgrades?.[a] ?? 0);
    const p: PlayerState = {
      id: `p${i + 1}`,
      name: ps.name,
      isAI: ps.isAI,
      species,
      deckName: ps.deckName ?? (ps.deck ? undefined : presetDeck(species).name),
      heat: BALANCE.startingHeat + (ps.heatDelta ?? 0) + (ps.modifiers?.startingHeat ?? 0) - (catchUp(i) ? BALANCE.laterSeatCool : 0),
      shields: ps.opening?.shields ?? 0,
      upgrades,
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
  return BALANCE.supernovaAt + p.upgrades.coolingChamber * BALANCE.coolingChamberHealthPerUpgrade + (p.modifiers?.maxHealthDelta ?? 0);
}

/** Half your max health or hotter. */
export function isOverheated(p: PlayerState): boolean {
  return p.heat * 2 >= supernovaThreshold(p);
}

/** Heat every sun takes at the start of its turn this round (0 before instability begins). */
export function instabilityHeat(state: GameState): number {
  if (state.round < BALANCE.instabilityStartsRound) return 0;
  return 1 + Math.floor((state.round - BALANCE.instabilityStartsRound) / BALANCE.instabilityRampEvery);
}

function passives(p: PlayerState): { card: CardInstance; passive: Passive }[] {
  return p.tableau.flatMap((card) => (cardDef(card.defId).passive ?? []).map((passive) => ({ card, passive })));
}

/** Cards this player may play on a turn (before any have been played). */
// ---- Orbit ------------------------------------------------------------------

const PLANETS: Planet[] = ['dead', 'abundant', 'industrial'];
/** A whole orbit: three planets, three turns each. */
export const ORBIT_LENGTH = PLANETS.length * BALANCE.orbitTurns;

/** The planet facing a sun at an orbit position. */
export function planetAt(orbit: number): Planet {
  return PLANETS[Math.floor((((orbit % ORBIT_LENGTH) + ORBIT_LENGTH) % ORBIT_LENGTH) / BALANCE.orbitTurns)];
}

/** The planet facing this player's sun this turn. */
export function currentPlanet(p: PlayerState): Planet {
  return planetAt(p.orbit);
}

/** This player's turns left with the current planet (this one included). */
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
  const extra = passives(p).reduce((sum, { passive }) => sum + (passive.type === 'extraPlay' && (!passive.planet || currentPlanet(p) === passive.planet) ? passive.amount : 0), 0);
  // Later seats get an extra play on their first turn to make up for moving second.
  const catchUp = p.turnsTaken === 1 && state.players.indexOf(p) > 0 && state.players.length <= BALANCE.catchUpMaxPlayers ? BALANCE.laterSeatPlays : 0;
  const industry = currentPlanet(p) === 'industrial' ? BALANCE.industrialPlays : 0;
  return Math.min(p.turnsTaken, BALANCE.maxPlays) + extra + catchUp + industry;
}

export function tableauFull(p: PlayerState): boolean {
  return p.tableau.length >= BALANCE.tableauSlots;
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

/** What a card's removal does to the chosen card. */
export function enemyEffectKind(defId: string): 'destroy' | 'bounce' | 'erode' | null {
  return enemyEffect(defId)?.type ?? null;
}

/** Your other cards this card could return to your hand or restore (empty if it needs no such choice). */
export function allyChoices(p: PlayerState, defId: string): CardInstance[] {
  if (!(cardDef(defId).onPlay ?? []).some((e) => e.type === 'recall' || (e.type === 'restore' && !e.all))) return [];
  return [...p.tableau];
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
  return p.discard.filter((c) => !e.kind || cardDef(c.defId).kind === e.kind);
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
  return [...(def.onPlay ?? []), ...(def.onTurn ?? [])].some((e) => e.type === 'heat' || e.type === 'cool' || e.type === 'shield');
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
  return persists(defId) && freeSlots(p).length > 1;
}

/** How long a card stays in play before it is swept back into its owner's deck. */
export function baseStability(defId: string): number {
  const def = cardDef(defId);
  if (def.stability !== undefined) return def.stability;
  if (def.kind === 'command') return BALANCE.stabilityCommand;
  return def.onTurn?.length || def.passive?.length ? BALANCE.stability : BALANCE.stabilityBurst;
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
  return Math.abs((a.slot ?? 0) - (b.slot ?? 0));
}

/**
 * A card's defence: its slot's (1 at the edges, 2 inside, 3 in the middle),
 * plus its own sturdiness, plus bulwark cards near it. Removal cards can only
 * reach cards with low enough defence.
 */
export function cardDefence(p: PlayerState, card: CardInstance): number {
  let d = (BALANCE.slotDefence[card.slot ?? 0] ?? 1) + (cardDef(card.defId).defence ?? 0);
  for (const src of p.tableau) {
    const k = distance(src, card);
    if (k === 0) continue;
    for (const ps of cardDef(src.defId).passive ?? []) if (ps.type === 'guard' && k <= ps.amounts.length) d += ps.amounts[k - 1];
  }
  return d;
}

/** Whether a card is anchored (a neighbour stops it losing stability). */
function anchored(p: PlayerState, card: CardInstance): boolean {
  return p.tableau.some((src) => distance(src, card) === 1 && (cardDef(src.defId).passive ?? []).some((ps) => ps.type === 'anchor'));
}

/** Whether the player may set this Lightspeed card now (only one can be face down at a time). */
export function canSetLightspeed(p: PlayerState): boolean {
  return p.lightspeed === null;
}

export function cardNeedsUpgradeChoice(defId: string): boolean {
  return (cardDef(defId).onPlay ?? []).some((e) => e.type === 'upgrade' && e.action === 'choice');
}

/** Core actions that can still be upgraded. */
export function upgradeOptions(p: PlayerState): CoreAction[] {
  return CORE_ACTIONS.filter((a) => p.upgrades[a] < MAX_UPGRADES[a]);
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

function countOf(p: PlayerState, card: CardInstance, c: Count): number {
  const per = 'per' in c && c.per ? c.per : 1;
  switch (c.of) {
    case 'kind':
      return Math.floor(p.tableau.filter((t) => cardDef(t.defId).kind === c.kind).length / per);
    case 'cards':
      return Math.floor(p.tableau.length / per);
    case 'upgrades':
      return p.upgrades[c.action];
    case 'shields':
      return Math.floor(p.shields / per);
    case 'growth':
      return card.growth ?? 0;
    case 'adjacent':
      return neighbours(p, card).filter((n) => !c.kind || cardDef(n.defId).kind === c.kind).length;
    case 'planet':
      return currentPlanet(p) === c.planet ? c.amount : 0;
  }
}

export function conditionMet(p: PlayerState, cond: Condition | undefined): boolean {
  if (!cond) return true;
  if ('overheated' in cond) return isOverheated(p);
  if ('minKind' in cond) return p.tableau.filter((t) => cardDef(t.defId).kind === cond.minKind).length >= cond.n;
  if ('upgraded' in cond) return p.upgrades[cond.upgraded] > 0;
  if ('planet' in cond) return currentPlanet(p) === cond.planet;
  return p.tableau.length >= cond.minCards;
}

/**
 * How much an effect does right now, with every bonus: the card's scaling,
 * Solar Flare or Thermosiphon upgrades, attack bonuses and Solar Maximum.
 * Bonuses only apply to an effect that does something on its own.
 */
export function effectAmount(state: GameState, p: PlayerState, card: CardInstance, e: Effect, when: Timing = 'play'): number {
  if (e.type !== 'heat' && e.type !== 'cool' && e.type !== 'shield' && e.type !== 'selfHeat' && e.type !== 'draw') return 0;
  let base = e.amount;
  if ((e.type === 'heat' || e.type === 'cool' || e.type === 'shield') && e.plus) base += countOf(p, card, e.plus);
  if ((e.type === 'heat' || e.type === 'cool' || e.type === 'shield') && e.max !== undefined) base = Math.min(base, e.max);
  if (base <= 0) return 0;
  if (e.type !== 'draw' && e.type !== 'selfHeat') base += resonanceBonus(p, card);
  if (e.type === 'heat') {
    const kind = cardDef(card.defId).kind;
    // Solar Flare upgrades power attacks; bonus cards count once per card name (copies do not stack).
    let bonus = kind === 'attack' ? p.upgrades.solarFlare : 0;
    const counted = new Set<string>();
    for (const { card: src, passive } of passives(p)) {
      if (passive.type !== 'kindBonus' || passive.kind !== kind || (passive.others && src.uid === card.uid) || (passive.onTurnOnly && when !== 'turn') || counted.has(src.defId)) continue;
      counted.add(src.defId);
      bonus += passive.amount;
    }
    if (fieldActive(state, 'solarMaximum')) bonus += 1;
    return base + bonus;
  }
  if (e.type === 'cool') return base + p.upgrades.thermosiphon;
  return base;
}

/** What a player's start of turn will do, from their tableau and the table (for everyone to see and plan around). */
export interface TurnForecast {
  /** Heat at their rival. */
  heat: number;
  /** Who that is. */
  targetId: string | null;
  shields: number;
  cool: number;
  /** Heat to their own sun: drawbacks, instability, Solar Storm, the map. */
  selfHeat: number;
  /** Extra cards drawn (beyond the usual draw). */
  draw: number;
  /** Extra cards they may play (an industrial planet). */
  plays: number;
  /** The planet that will face their sun. */
  planet: Planet;
}

/**
 * The net effect of a player's next start of turn, before shields and
 * Lightspeed cards answer it: each card in their tableau, left to right
 * (growing cards grow first), plus the global card, regional instability and
 * the map's conditions.
 */
export function turnForecast(state: GameState, p: PlayerState): TurnForecast {
  const target = targetOf(state, p);
  // Their next turn's planet (their first turn starts at the dead planet).
  const orbit = p.turnsTaken > 0 ? (p.orbit + 1) % ORBIT_LENGTH : p.orbit;
  const planet = planetAt(orbit);
  const f: TurnForecast = { heat: 0, targetId: target?.id ?? null, shields: 0, cool: 0, selfHeat: 0, draw: 0, plays: 0, planet };
  if (p.eliminated) return f;
  if (planet === 'abundant' && p.turnsTaken > 0) f.draw += BALANCE.abundantDraw;
  if (planet === 'industrial') f.plays += BALANCE.industrialPlays;
  // Run the effects on a copy, so growth and the like carry from one effect to the next.
  const me: PlayerState = { ...p, orbit, tableau: p.tableau.map((c) => ({ ...c })) };
  for (const card of me.tableau) {
    for (const e of cardDef(card.defId).onTurn ?? []) {
      if (!conditionMet(me, e.if)) continue;
      switch (e.type) {
        case 'grow':
          card.growth = Math.min(e.max, (card.growth ?? 0) + 1);
          break;
        case 'heat': {
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
      }
    }
  }
  // Their turn comes this round if they sit after the active player, else next round.
  const later = state.players.indexOf(p) > state.activePlayerIndex;
  f.selfHeat += instabilityHeat({ ...state, round: state.round + (later ? 0 : 1) });
  if (fieldActive(state, 'solarStorm')) f.selfHeat += 1;
  if (fieldActive(state, 'iceAge')) f.cool += 1;
  const m = p.modifiers;
  f.selfHeat += m?.heatPerTurn ?? 0;
  f.cool += m?.coolPerTurn ?? 0;
  f.shields += m?.shieldPerTurn ?? 0;
  f.draw += m?.extraDraw ?? 0;
  return f;
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
function spring(state: GameState, owner: PlayerState, enemy: PlayerState, matches: (t: LightspeedTrigger) => boolean): boolean {
  const card = owner.lightspeed;
  if (!card || owner.eliminated || owner.id === enemy.id || activePlayer(state).id !== enemy.id) return false;
  const ls = cardDef(card.defId).lightspeed;
  if (!ls || !matches(ls.trigger)) return false;
  owner.lightspeed = null;
  owner.discard.push(card);
  log(state, `⚡ Lightspeed! ${owner.name} springs ${cardDef(card.defId).name}.`);
  resolveEffects(state, owner, card, ls.effects, 'spring', { against: enemy });
  return !!ls.counter;
}

/** Heat a sun. Enemy heat is absorbed by shields first. Returns the heat that got through. */
function applyHeat(state: GameState, target: PlayerState, amount: number, source: PlayerState | null, retaliation = false, cardUid?: string): number {
  if (target.eliminated || amount <= 0) return 0;
  const enemy = source !== null && source.id !== target.id;
  if (enemy && !retaliation && spring(state, target, source, (t) => t.on === 'heated' && amount >= (t.min ?? 1))) {
    log(state, `The heat never reaches ${target.name}'s sun.`);
    return 0;
  }
  if (target.eliminated || state.winnerId) return 0;
  const blocked = enemy ? Math.min(target.shields, amount) : 0;
  target.shields -= blocked;
  const applied = amount - blocked;
  target.heat = Math.max(BALANCE.minHeat, target.heat + applied);
  if (enemy) source.turn.heatDealt += amount;
  if (blocked > 0) log(state, `${target.name}'s shields absorb ${blocked} heat.`);
  if (applied > 0) log(state, `${target.name}'s sun heats to ${target.heat}.`);
  if (target.heat >= supernovaThreshold(target)) supernova(state, target);
  // Shields that absorbed an enemy's heat can sting back (Stinging Veil) or cool their sun
  // (Ommarath), at most once per attacking card each turn.
  if (enemy && blocked > 0 && !retaliation && !target.eliminated) {
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
        log(state, `${target.name}'s veil stings ${source.name} for ${sting}.`);
        applyHeat(state, source, sting, target, true);
      }
    }
  }
  return applied;
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
  upgrade?: CoreAction;
  enemyUid?: string;
  allyUid?: string;
  recoverUid?: string;
  /** Lightspeed: the enemy who sprang the card (the effects' target). */
  against?: PlayerState;
}

const kindMatches = (c: CardInstance, kind?: CardKind) => !kind || cardDef(c.defId).kind === kind;

function resolveEffects(state: GameState, p: PlayerState, card: CardInstance, effects: Effect[] | undefined, when: Timing, ctx: PlayContext = {}) {
  for (const e of effects ?? []) {
    if (state.winnerId || p.eliminated) return;
    if (!conditionMet(p, e.if)) continue;
    switch (e.type) {
      case 'heat': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount <= 0) break;
        const main = ctx.against && !ctx.against.eliminated ? ctx.against : targetOf(state, p);
        if (main) applyHeat(state, main, amount, p, false, card.uid);
        break;
      }
      case 'selfHeat':
        applyHeat(state, p, e.amount, null);
        break;
      case 'cool': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount > 0) cool(state, p, amount);
        break;
      }
      case 'shield': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount > 0) {
          p.shields += amount;
          log(state, `${p.name} raises ${amount} shield${amount === 1 ? '' : 's'}.`);
        }
        break;
      }
      case 'draw':
        drawCards(state, p, e.amount);
        break;
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
      case 'upgrade': {
        const action = e.action === 'choice' ? ctx.upgrade : e.action;
        if (!action || p.upgrades[action] >= MAX_UPGRADES[action]) {
          log(state, `${p.name}'s ${e.action === 'choice' ? 'upgrades' : ACTION_NAME[e.action]} are already at their limit.`);
          break;
        }
        p.upgrades[action] += 1;
        log(state, `${p.name} upgrades ${ACTION_NAME[action]} to level ${p.upgrades[action]}.`);
        break;
      }
      case 'destroy':
      case 'bounce': {
        const t = ctx.against ?? targetOf(state, p);
        const victim = t?.tableau.find((c) => c.uid === ctx.enemyUid && canReach(t, c, e));
        if (!t || !victim) break;
        if (spring(state, t, p, (tr) => tr.on === 'targeted')) {
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
        if (!e.all && spring(state, t, p, (tr) => tr.on === 'targeted')) {
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
        const back = p.tableau.find((c) => c.uid === ctx.allyUid && c.uid !== card.uid);
        if (back) {
          log(state, `${p.name} returns ${cardDef(back.defId).name} to their hand.`);
          leaveTableau(state, p, back, 'hand');
        }
        break;
      }
      case 'recover': {
        const i = p.discard.findIndex((c) => c.uid === ctx.recoverUid && kindMatches(c, e.kind));
        if (i < 0) break;
        const [back] = p.discard.splice(i, 1);
        p.hand.push(back);
        log(state, `${p.name} recovers ${cardDef(back.defId).name} from their discard pile.`);
        resolveEffects(state, p, back, cardDef(back.defId).onRecover, 'recover');
        break;
      }
      case 'plays':
        if (activePlayer(state).id === p.id) {
          p.playsLeft += e.amount;
          log(state, `${p.name} may play ${e.amount} more card${e.amount === 1 ? '' : 's'} this turn.`);
        }
        break;
      case 'halt':
        if (ctx.against && ctx.against.playsLeft > 0) {
          ctx.against.playsLeft = 0;
          log(state, `${ctx.against.name} may play no more cards this turn.`);
        }
        break;
    }
  }
}

/** A card whose stability ran out is swept back into its owner's deck, at a random place. */
function sweep(state: GameState, owner: PlayerState, card: CardInstance) {
  log(state, `${owner.name}'s ${cardDef(card.defId).name} fades back into their deck.`);
  leaveTableau(state, owner, card, 'deck');
}

/** A card leaves its tableau for the discard pile (or its owner's hand or deck), triggering its leave effects. */
function leaveTableau(state: GameState, owner: PlayerState, card: CardInstance, to: 'discard' | 'hand' | 'deck' = 'discard') {
  owner.tableau = owner.tableau.filter((c) => c.uid !== card.uid);
  card.growth = undefined;
  card.slot = undefined;
  card.stability = undefined;
  if (to === 'deck') owner.deck.splice(randomInt(state, owner.deck.length + 1), 0, card);
  else (to === 'hand' ? owner.hand : owner.discard).push(card);
  resolveEffects(state, owner, card, cardDef(card.defId).onLeave, 'leave');
  // Cards that answer another card leaving (Kyr'Vessa).
  for (const { card: watcher, passive } of passives(owner)) {
    if (passive.type === 'allyLeaves' && owner.tableau.includes(watcher)) resolveEffects(state, owner, watcher, passive.effects, 'leave');
  }
}

function startTurn(state: GameState) {
  const p = activePlayer(state);
  p.turnsTaken += 1;
  p.turn = emptyTurn();
  log(state, `— Turn ${state.turnNumber}: ${p.name}.`);

  // Shields fade, unless Deep Current holds them.
  const keep = passives(p).some(({ passive }) => passive.type === 'keepShields');
  p.shields = keep ? Math.min(p.shields, BALANCE.maxKeptShields) : 0;

  // The planets move on a turn (your first turn starts at the dead planet).
  if (p.turnsTaken > 1) {
    const before = currentPlanet(p);
    p.orbit = (p.orbit + 1) % ORBIT_LENGTH;
    if (currentPlanet(p) !== before) log(state, `The ${currentPlanet(p)} planet swings round to face ${p.name}'s sun.`);
  }
  const abundance = currentPlanet(p) === 'abundant' ? BALANCE.abundantDraw : 0;
  // Draw (your opening hand covers your first turn).
  if (p.turnsTaken > 1) drawCards(state, p, BALANCE.drawPerTurn + (p.modifiers?.extraDraw ?? 0) + abundance);
  if (p.eliminated) return passOn(state);

  // The table: instability, the map's modifiers, then any global card.
  const unstable = instabilityHeat(state);
  if (unstable > 0) {
    log(state, `Regional instability heats ${p.name}'s sun by ${unstable}.`);
    applyHeat(state, p, unstable, null);
  }
  const m = p.modifiers;
  if (m?.heatPerTurn) applyHeat(state, p, m.heatPerTurn, null);
  if (m?.coolPerTurn) cool(state, p, m.coolPerTurn);
  if (m?.shieldPerTurn) p.shields += m.shieldPerTurn;
  if (fieldActive(state, 'solarStorm')) {
    log(state, `Solar Storm batters ${p.name}.`);
    applyHeat(state, p, 1, null);
  }
  if (fieldActive(state, 'iceAge')) cool(state, p, 1);

  // Your tableau's start-of-turn effects, left to right.
  for (const card of [...p.tableau]) {
    if (state.winnerId || p.eliminated) break;
    if (!p.tableau.includes(card)) continue;
    resolveEffects(state, p, card, cardDef(card.defId).onTurn, 'turn');
  }
  // Then every card loses 1 stability (unless anchored); at 0 it is swept back into your deck.
  const fading = p.tableau.filter((c) => !anchored(p, c));
  for (const card of fading) card.stability = (card.stability ?? 1) - 1;
  for (const card of fading) {
    if (state.winnerId || p.eliminated) break;
    if (p.tableau.includes(card) && (card.stability ?? 0) <= 0) sweep(state, p, card);
  }
  p.playsLeft = playsAllowed(state, p);
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
  if (p.playsLeft <= 0) throw new GameError('You have no plays left this turn.');
  const def: CardDef = cardDef(card.defId);
  const lightspeed = def.kind === 'lightspeed';
  if (lightspeed && !canSetLightspeed(p)) throw new GameError('You already have a Lightspeed card face down.');

  if (cardNeedsUpgradeChoice(def.id) && upgradeOptions(p).length > 0) {
    if (!action.upgrade || !upgradeOptions(p).includes(action.upgrade)) throw new GameError('Choose an upgrade.');
  }
  const target = targetOf(state, p);
  const foes = enemyChoices(state, p, def.id);
  if (foes.length > 0 && !foes.some((c) => c.uid === action.enemyUid)) {
    throw new GameError(`Choose a card in ${target?.name ?? 'your rival'}'s tableau.`);
  }
  if (persists(def.id) && tableauFull(p)) throw new GameError('Your tableau is full: a card can only go in once one fades, or is recalled or removed.');
  const free = freeSlots(p);
  if (persists(def.id) && action.slot !== undefined && !free.includes(action.slot)) throw new GameError('Choose an empty slot.');
  const allies = allyChoices(p, def.id);
  if (allies.length > 0 && !allies.some((c) => c.uid === action.allyUid)) throw new GameError('Choose a card of yours.');
  const recovers = recoverChoices(p, def.id);
  if (recovers.length > 0 && !recovers.some((c) => c.uid === action.recoverUid)) throw new GameError('Choose a card in your discard pile to recover.');

  p.hand = p.hand.filter((c) => c.uid !== card.uid);
  p.playsLeft -= 1;
  p.turn.cardsPlayed += 1;
  log(state, lightspeed ? `${p.name} sets a card face down at lightspeed.` : `${p.name} plays ${def.name}.`);

  // Rivals' face-down Lightspeed cards may answer the card before it resolves.
  for (const o of othersInOrder(state, p)) {
    const cancelled = spring(state, o, p, (t) => t.on === 'enemyPlays' && (!t.kind || t.kind === def.kind));
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
  // The chosen slot, or else the safest one free.
  const open = freeSlots(p);
  const slot = action.slot !== undefined && open.includes(action.slot) ? action.slot : slotsBySafety().find((i) => open.includes(i));
  if (slot === undefined) {
    p.discard.push(card);
    return;
  }
  place(p, card, slot);
  resolveEffects(state, p, card, def.onPlay, 'play', action);
}

/** Apply an action and return the new state (the input is never mutated). */
export function applyAction(prev: GameState, action: Action): GameState {
  if (prev.winnerId) throw new GameError('The game is over.');
  const state = structuredClone(prev);
  const p = activePlayer(state);
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
