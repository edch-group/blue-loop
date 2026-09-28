import { BALANCE } from './balance';
import { cardDef, MARKET_CARDS } from './cards';
import { GLOBALS, OBJECTIVES, objectiveDef } from './objectives';
import { shuffleInPlace } from './rng';
import { SOLAR_SYSTEMS, systemDef } from './systems';
import type {
  Action,
  CardInstance,
  Effect,
  GameSetup,
  GameState,
  GlobalEffectId,
  PlayerState,
  Track,
  TurnStats,
} from './types';

export class GameError extends Error {}

const emptyTurn = (): TurnStats => ({ heatDealt: 0, moneySpent: 0, flares: 0, cryos: 0, cardsBought: 0 });

function newCard(state: GameState, defId: string): CardInstance {
  state.uidCounter += 1;
  return { uid: `c${state.uidCounter}`, defId };
}

function log(state: GameState, text: string) {
  state.log.push({ turn: state.turnNumber, text });
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
    rngState: setup.seed | 0,
    uidCounter: 0,
    turnNumber: 1,
    round: 1,
    activePlayerIndex: 0,
    players: [],
    marketDeck: [],
    display: [],
    globals: [],
    objectives: [],
    winnerId: null,
    log: [],
  };

  // Deal solar systems: honour fixed picks, draw the rest from what is left.
  const fixed = new Set(setup.players.map((p) => p.systemId).filter(Boolean));
  const pool = shuffleInPlace(state, SOLAR_SYSTEMS.map((s) => s.id).filter((id) => !fixed.has(id)));

  setup.players.forEach((ps, i) => {
    const sys = systemDef(ps.systemId ?? pool.pop()!);
    const deck: CardInstance[] = [];
    for (let k = 0; k < BALANCE.startingBasicCards; k++) deck.push(newCard(state, 'stardust'));
    for (let k = 0; k < BALANCE.startingCommandCards; k++) deck.push(newCard(state, 'command_directive'));
    shuffleInPlace(state, deck);

    state.players.push({
      id: `p${i + 1}`,
      name: ps.name,
      isAI: ps.isAI,
      systemId: sys.id,
      planets: sys.planets.map((pl, j) => ({ id: `p${i + 1}-pl${j}`, ...pl })),
      heat: sys.modifiers.startingHeat ?? BALANCE.startingHeat,
      shields: 0,
      money: 0,
      deck,
      hand: [],
      inPlay: [],
      discard: [],
      eliminated: false,
      claimedObjectives: [],
      turn: emptyTurn(),
      blockedSinceTurnStart: 0,
    });
  });

  for (const def of MARKET_CARDS) {
    for (let k = 0; k < def.copies; k++) state.marketDeck.push(newCard(state, def.id));
  }
  shuffleInPlace(state, state.marketDeck);
  for (let s = 0; s < BALANCE.displaySize; s++) state.display.push(state.marketDeck.pop() ?? null);

  state.objectives = shuffleInPlace(state, OBJECTIVES.map((o) => o.id)).slice(0, BALANCE.objectivesPerGame);

  for (const p of state.players) drawCards(state, p, handSizeFor(p));
  log(state, `A new game begins. ${state.players.map((p) => `${p.name} rules ${systemDef(p.systemId).name}`).join('; ')}.`);
  startTurn(state);
  return state;
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

export function trackLevel(p: PlayerState, track: Track): number {
  return p.planets.filter((pl) => pl.track === track).reduce((s, pl) => s + pl.level, 0);
}

export function handSizeFor(p: PlayerState): number {
  const mods = systemDef(p.systemId).modifiers;
  return BALANCE.handSize + (mods.handSizeBonus ?? 0) + Math.floor(trackLevel(p, 'resources') / BALANCE.resourceLevelsPerExtraCard);
}

export function incomeFor(p: PlayerState): number {
  const mods = systemDef(p.systemId).modifiers;
  let income = trackLevel(p, 'economy') * BALANCE.economyIncomePerLevel + (mods.incomeBonus ?? 0);
  if (mods.heatIncomeEvery && p.heat > 0) income += Math.floor(p.heat / mods.heatIncomeEvery);
  return income;
}

export function shieldsFor(p: PlayerState): number {
  const mods = systemDef(p.systemId).modifiers;
  return Math.floor(trackLevel(p, 'defences') / BALANCE.defenceLevelsPerShield) + (mods.shieldBonus ?? 0);
}

function globalAffects(state: GameState, id: GlobalEffectId, p: PlayerState): boolean {
  return state.globals.some((g) => g.id === id && (GLOBALS[id].affectsCaster || g.sourcePlayerId !== p.id));
}

export function flareCost(state: GameState, p: PlayerState): number {
  return BALANCE.solarFlareCost + (globalAffects(state, 'magneticStorm', p) ? 1 : 0);
}

export function flareHeat(p: PlayerState): number {
  if (p.turn.flares > 0) return BALANCE.solarFlareHeat;
  const mods = systemDef(p.systemId).modifiers;
  return BALANCE.solarFlareHeat + (mods.firstFlareBonusHeat ?? 0) + Math.floor(trackLevel(p, 'weapons') / BALANCE.weaponLevelsPerBonusHeat);
}

export function cryoCost(p: PlayerState): number {
  const discount = p.turn.cryos === 0 ? systemDef(p.systemId).modifiers.firstCryoDiscount ?? 0 : 0;
  return Math.max(0, BALANCE.cryostasisCost - discount);
}

export function marketCost(p: PlayerState, defId: string): number {
  const discount = systemDef(p.systemId).modifiers.marketDiscount ?? 0;
  return Math.max(1, cardDef(defId).cost - discount);
}

/** Heat every sun takes at the start of its turn this round (0 before instability begins). */
export function instabilityHeat(state: GameState): number {
  if (state.round < BALANCE.instabilityStartsRound) return 0;
  return 1 + Math.floor((state.round - BALANCE.instabilityStartsRound) / BALANCE.instabilityRampEvery);
}

export function activePlayer(state: GameState): PlayerState {
  return state.players[state.activePlayerIndex];
}

export function livingOpponents(state: GameState, p: PlayerState): PlayerState[] {
  return state.players.filter((o) => o.id !== p.id && !o.eliminated);
}

export function cardNeedsTarget(defId: string): boolean {
  return cardDef(defId).effects.some((e) => e.type === 'heatTarget');
}

export function cardNeedsPlanet(defId: string): boolean {
  return cardDef(defId).effects.some((e) => e.type === 'command');
}

export function upgradeablePlanets(p: PlayerState) {
  return p.planets.filter((pl) => pl.level < BALANCE.maxPlanetLevel);
}

// ---------------------------------------------------------------------------
// Core mechanics
// ---------------------------------------------------------------------------

function drawCards(state: GameState, p: PlayerState, count: number) {
  for (let i = 0; i < count; i++) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) return;
      p.deck = shuffleInPlace(state, p.discard);
      p.discard = [];
    }
    p.hand.push(p.deck.pop()!);
  }
}

/** Heat a sun, shields first. Returns heat actually applied to the sun. */
function applyHeat(state: GameState, target: PlayerState, amount: number, source: PlayerState | null): number {
  if (target.eliminated || amount <= 0) return 0;
  const blocked = source && source.id !== target.id ? Math.min(target.shields, amount) : 0;
  target.shields -= blocked;
  target.blockedSinceTurnStart += blocked;
  const applied = amount - blocked;
  target.heat = Math.max(BALANCE.minHeat, target.heat + applied);
  if (source && source.id !== target.id) source.turn.heatDealt += amount;
  if (blocked > 0) log(state, `${target.name}'s shields absorb ${blocked} heat.`);
  if (applied > 0) log(state, `${target.name}'s sun heats to ${target.heat}.`);
  if (target.heat >= BALANCE.supernovaAt) supernova(state, target);
  return applied;
}

function cool(state: GameState, p: PlayerState, amount: number) {
  const before = p.heat;
  p.heat = Math.max(BALANCE.minHeat, p.heat - amount);
  if (p.heat !== before) log(state, `${p.name}'s sun cools to ${p.heat}.`);
}

function supernova(state: GameState, p: PlayerState) {
  if (p.eliminated) return;
  p.eliminated = true;
  log(state, `☀ ${p.name}'s sun goes SUPERNOVA! ${systemDef(p.systemId).name} is lost.`);
  const alive = state.players.filter((o) => !o.eliminated);
  if (alive.length === 1) {
    state.winnerId = alive[0].id;
    log(state, `${alive[0].name} wins the Blue Loop!`);
  }
}

function spend(p: PlayerState, amount: number) {
  if (p.money < amount) throw new GameError(`Not enough money (need ${amount}, have ${p.money}).`);
  p.money -= amount;
  p.turn.moneySpent += amount;
}

function startTurn(state: GameState) {
  const p = activePlayer(state);
  p.turn = emptyTurn();
  p.blockedSinceTurnStart = 0;

  // 1. Gain resources.
  p.money = incomeFor(p);
  p.shields = shieldsFor(p);
  log(state, `— Turn ${state.turnNumber}: ${p.name} (+${p.money} money, ${p.shields} shields).`);

  // 2. Resolve global effects. An effect stays listed (and passive ones like
  // Magnetic Storm stay active) through its last turn, and expires here.
  state.globals = state.globals.filter((g) => g.turnsRemaining > 0);
  for (const g of state.globals) {
    if (!GLOBALS[g.id].affectsCaster && g.sourcePlayerId === p.id) continue;
    switch (g.id) {
      case 'solarStorm':
        log(state, `Solar Storm batters ${p.name}.`);
        applyHeat(state, p, 1, null);
        break;
      case 'iceAge':
        cool(state, p, 1);
        break;
      case 'tradeBoom':
        p.money += 1;
        break;
      case 'magneticStorm':
        break; // Passive: raises flare cost.
    }
  }
  for (const g of state.globals) g.turnsRemaining -= 1;

  // 3. Stellar Instability (late-game clock).
  const instability = instabilityHeat(state);
  if (instability > 0 && !p.eliminated) {
    log(state, `Stellar Instability: ${p.name}'s sun heats by ${instability}.`);
    applyHeat(state, p, instability, null);
  }

  if (p.eliminated && !state.winnerId) advanceTurn(state);
}

function endTurn(state: GameState) {
  const p = activePlayer(state);
  checkObjectives(state, p);
  p.discard.push(...p.inPlay, ...p.hand);
  p.inPlay = [];
  p.hand = [];
  p.money = 0;
  if (!p.eliminated) drawCards(state, p, handSizeFor(p));
  advanceTurn(state);
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

function checkObjectives(state: GameState, p: PlayerState) {
  if (p.eliminated) return;
  for (const id of state.objectives) {
    if (p.claimedObjectives.includes(id)) continue;
    const obj = objectiveDef(id);
    if (obj.isMet(p)) {
      p.claimedObjectives.push(id);
      p.discard.push(newCard(state, 'command_directive'));
      log(state, `★ ${p.name} completes "${obj.name}" and gains a Command Directive.`);
    }
  }
}

function resolveEffect(state: GameState, p: PlayerState, e: Effect, targetId?: string, planetId?: string) {
  switch (e.type) {
    case 'money':
      p.money += e.amount;
      break;
    case 'draw':
      drawCards(state, p, e.amount);
      break;
    case 'heatTarget':
      applyHeat(state, requireTarget(state, p, targetId), e.amount, p);
      break;
    case 'heatAllOpponents':
      for (const o of livingOpponents(state, p)) applyHeat(state, o, e.amount, p);
      break;
    case 'heatSelf':
      applyHeat(state, p, e.amount, null);
      break;
    case 'cool':
      cool(state, p, e.amount);
      break;
    case 'shield':
      p.shields += e.amount;
      break;
    case 'command': {
      if (upgradeablePlanets(p).length === 0) {
        log(state, `${p.name}'s planets are fully upgraded.`);
        break;
      }
      const planet = p.planets.find((pl) => pl.id === planetId);
      if (!planet) throw new GameError('Choose one of your planets to upgrade.');
      if (planet.level >= BALANCE.maxPlanetLevel) throw new GameError(`${planet.name} is already at max level.`);
      planet.level += 1;
      log(state, `${p.name} upgrades ${planet.name} (${planet.track}) to level ${planet.level}.`);
      break;
    }
    case 'global': {
      // Lasts one full round: one turn start for every other living player
      // (plus the caster's own next turn if the effect affects them).
      const others = livingOpponents(state, p).length;
      const turns = GLOBALS[e.effect].affectsCaster ? others + 1 : others;
      state.globals = state.globals.filter((g) => g.id !== e.effect);
      state.globals.push({ id: e.effect, sourcePlayerId: p.id, turnsRemaining: turns });
      log(state, `${p.name} unleashes ${GLOBALS[e.effect].name}: ${GLOBALS[e.effect].text}`);
      break;
    }
  }
}

function requireTarget(state: GameState, p: PlayerState, targetId?: string): PlayerState {
  const t = state.players.find((o) => o.id === targetId);
  if (!t || t.id === p.id || t.eliminated) throw new GameError('Choose a living enemy sun to target.');
  return t;
}

function playCard(state: GameState, p: PlayerState, cardUid: string, targetId?: string, planetId?: string) {
  const idx = p.hand.findIndex((c) => c.uid === cardUid);
  if (idx < 0) throw new GameError('That card is not in your hand.');
  const card = p.hand[idx];
  const def = cardDef(card.defId);
  // Validate choices before changing anything, so a bad action leaves no trace.
  if (cardNeedsTarget(def.id)) requireTarget(state, p, targetId);
  if (cardNeedsPlanet(def.id) && upgradeablePlanets(p).length > 0) {
    const planet = p.planets.find((pl) => pl.id === planetId);
    if (!planet || planet.level >= BALANCE.maxPlanetLevel) throw new GameError('Choose one of your planets that can be upgraded.');
  }
  p.hand.splice(idx, 1);
  p.inPlay.push(card);
  log(state, `${p.name} plays ${def.name}.`);
  for (const e of def.effects) {
    if (state.winnerId || p.eliminated) break;
    resolveEffect(state, p, e, targetId, planetId);
  }
}

// ---------------------------------------------------------------------------
// Public reducer
// ---------------------------------------------------------------------------

/**
 * Apply an action for the active player and return the new state.
 * Input state is never mutated; invalid actions throw GameError.
 */
export function applyAction(prev: GameState, action: Action): GameState {
  if (isGameOver(prev)) throw new GameError('The game is over.');
  const state = structuredClone(prev);
  const p = activePlayer(state);

  switch (action.type) {
    case 'playCard':
      playCard(state, p, action.cardUid, action.targetId, action.planetId);
      break;
    case 'playAllMoney': {
      const pure = p.hand.filter((c) => cardDef(c.defId).effects.every((e) => e.type === 'money'));
      for (const c of pure) playCard(state, p, c.uid);
      break;
    }
    case 'buyCard': {
      const card = state.display[action.slot];
      if (!card) throw new GameError('That display slot is empty.');
      const cost = marketCost(p, card.defId);
      spend(p, cost);
      p.discard.push(card);
      p.turn.cardsBought += 1;
      state.display[action.slot] = state.marketDeck.pop() ?? null;
      log(state, `${p.name} buys ${cardDef(card.defId).name} for ${cost}.`);
      break;
    }
    case 'solarFlare': {
      const target = requireTarget(state, p, action.targetId);
      spend(p, flareCost(state, p));
      const heat = flareHeat(p);
      p.turn.flares += 1;
      log(state, `${p.name} launches a Solar Flare at ${target.name} (${heat} heat).`);
      applyHeat(state, target, heat, p);
      break;
    }
    case 'cryostasis': {
      if (p.heat <= BALANCE.minHeat) throw new GameError(`Your sun cannot be cooled below ${BALANCE.minHeat}.`);
      spend(p, cryoCost(p));
      p.turn.cryos += 1;
      log(state, `${p.name} triggers Cryostasis.`);
      cool(state, p, BALANCE.cryostasisCool);
      break;
    }
    case 'endTurn':
      endTurn(state);
      return state;
  }

  // A player who supernovas on their own turn (e.g. Dyson Tap) ends it at once.
  if (p.eliminated && !state.winnerId) endTurn(state);
  return state;
}

export function isGameOver(state: GameState): boolean {
  return state.winnerId !== null;
}
