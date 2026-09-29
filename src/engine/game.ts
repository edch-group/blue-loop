import { BALANCE } from './balance';
import { cardDef, MARKET_CARDS } from './cards';
import { FIELD_ROUNDS, GLOBALS, OBJECTIVES, objectiveDef, REWARDS, rewardDef, type RewardId } from './objectives';
import { randomInt, shuffleInPlace } from './rng';
import { SOLAR_SYSTEMS, systemDef } from './systems';
import { CORE_ACTIONS } from './types';
import type {
  Action,
  CoreAction,
  CardInstance,
  Effect,
  GameSetup,
  GameState,
  PlayerState,
  Track,
  TurnStats,
  UpgradeId,
} from './types';

export class GameError extends Error {}

const emptyTurn = (): TurnStats => ({ heatDealt: 0, moneySpent: 0, flares: 0, thermosiphons: 0, cardsBought: 0, cardsPlayed: 0, cooled: 0 });

/** Rewards offered per objective claimed or mission completed. */
const REWARD_CHOICES = 3;

export function hasReward(p: PlayerState, id: RewardId): boolean {
  return p.rewards.includes(id);
}
const bonus = (p: PlayerState, id: RewardId) => (hasReward(p, id) ? 1 : 0);

function newCard(state: GameState, defId: string): CardInstance {
  state.uidCounter += 1;
  return { uid: `c${state.uidCounter}`, defId };
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
    rngState: setup.seed | 0,
    uidCounter: 0,
    turnNumber: 1,
    round: 1,
    activePlayerIndex: 0,
    players: [],
    marketDeck: [],
    display: [],
    marketDiscard: [],
    globals: [],
    objectives: [],
    objectiveDeck: [],
    claimed: [],
    pendingRewards: [],
    winnerId: null,
    log: [],
  };

  // Deal solar systems: honour fixed picks, draw the rest from what is left.
  const fixed = new Set(setup.players.map((p) => p.systemId).filter(Boolean));
  const pool = shuffleInPlace(state, SOLAR_SYSTEMS.map((s) => s.id).filter((id) => !fixed.has(id)));

  setup.players.forEach((ps, i) => {
    // Drafting: two offers each (8 systems covers 4 players); play starts once all have chosen.
    const offers = setup.draft && !ps.systemId ? [pool.pop()!, pool.pop()!] : undefined;
    const sys = systemDef(ps.systemId ?? offers?.[0] ?? pool.pop()!);
    const deck: CardInstance[] = [];
    if (ps.deck) for (const id of ps.deck) deck.push(newCard(state, cardDef(id).id));
    else {
      for (let k = 0; k < BALANCE.startingBasicCards; k++) deck.push(newCard(state, 'stardust'));
      for (let k = 0; k < BALANCE.startingCommandCards; k++) deck.push(newCard(state, 'command_directive'));
    }
    shuffleInPlace(state, deck);

    state.players.push({
      id: `p${i + 1}`,
      name: ps.name,
      isAI: ps.isAI,
      systemId: sys.id,
      planets: sys.planets.map((pl, j) => ({ id: `p${i + 1}-pl${j}`, ...pl })),
      upgrades: { solarFlare: sys.modifiers.startingFlareUpgrades ?? 0, thermosiphon: 0, coolingChamber: 0 },
      rewards: [],
      missions: [],
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
      systemOffers: offers,
      opening: ps.opening,
    });
    applyCampaignSetup(state.players[i], ps);
  });
  // AI players pick at once.
  for (const p of state.players) {
    if (p.isAI && p.systemOffers) {
      applySystem(p, p.systemOffers[randomInt(state, 2)]);
      p.systemOffers = undefined;
    }
  }

  for (const def of marketCardsFor(n)) {
    for (let k = 0; k < def.copies; k++) state.marketDeck.push(newCard(state, def.id));
  }
  shuffleInPlace(state, state.marketDeck);
  for (let s = 0; s < BALANCE.displaySize; s++) state.display.push(state.marketDeck.pop() ?? null);

  state.objectiveDeck = shuffleInPlace(state, OBJECTIVES.map((o) => o.id));
  state.objectives = state.objectiveDeck.splice(0, BALANCE.objectivesPerGame);

  state.phase = 'setup';
  finishSetupIfReady(state);
  return state;
}

/** Campaign battles: planet upgrades bought on the map and heat carried in. */
function applyCampaignSetup(p: PlayerState, ps: GameSetup['players'][number]) {
  ps.planetBoosts?.forEach((boost, j) => {
    const pl = p.planets[j];
    if (pl) pl.level = Math.min(BALANCE.maxPlanetLevel, pl.level + boost);
  });
  if (ps.heatDelta) p.heat = Math.max(BALANCE.minHeat, Math.min(supernovaThreshold(p) - 1, p.heat + ps.heatDelta));
}

/** Give a player a solar system: its planets, starting upgrades and starting heat. */
function applySystem(p: PlayerState, systemId: string) {
  const sys = systemDef(systemId);
  p.systemId = sys.id;
  p.planets = sys.planets.map((pl, j) => ({ id: `${p.id}-pl${j}`, ...pl }));
  p.upgrades = { solarFlare: sys.modifiers.startingFlareUpgrades ?? 0, thermosiphon: 0, coolingChamber: 0 };
  p.heat = sys.modifiers.startingHeat ?? BALANCE.startingHeat;
}

/** Players still to choose a system (humans only; AI choose at creation). */
export function pendingSystemChoices(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.systemOffers?.length);
}

/** During setup the "active" seat is the next player to choose; once all have, play begins. */
function finishSetupIfReady(state: GameState) {
  const next = pendingSystemChoices(state)[0];
  if (next) {
    state.activePlayerIndex = state.players.indexOf(next);
    return;
  }
  state.phase = 'play';
  state.activePlayerIndex = 0;
  log(state, `A new game begins. ${state.players.map((p) => `${p.name} rules ${systemDef(p.systemId).name}`).join('; ')}.`);
  startTurn(state);
}

/** The market cards used for a given player count (multi-target cards need 3+). */
export function marketCardsFor(playerCount: number) {
  return MARKET_CARDS.filter((d) => (d.minPlayers ?? 0) <= playerCount);
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

export function trackLevel(p: PlayerState, track: Track): number {
  return p.planets.filter((pl) => pl.track === track).reduce((s, pl) => s + pl.level, 0);
}

const mods = (p: PlayerState) => systemDef(p.systemId).modifiers;

export function handSizeFor(p: PlayerState): number {
  const mods = systemDef(p.systemId).modifiers;
  const size = BALANCE.handSize + (mods.handSizeBonus ?? 0) + trackLevel(p, 'resources') * BALANCE.resourceCardsPerLevel + bonus(p, 'wide_sensors');
  return Math.min(size, mods.handSizeCap ?? Infinity);
}

export function incomeFor(p: PlayerState): number {
  const mods = systemDef(p.systemId).modifiers;
  let income = trackLevel(p, 'economy') * BALANCE.economyIncomePerLevel + (mods.incomeBonus ?? 0) + bonus(p, 'stellar_mint');
  if (mods.heatIncomeEvery && p.heat > 0) income += Math.floor(p.heat / mods.heatIncomeEvery);
  return income;
}

export function shieldsFor(p: PlayerState): number {
  const mods = systemDef(p.systemId).modifiers;
  return trackLevel(p, 'defences') * BALANCE.shieldsPerDefenceLevel + (mods.shieldBonus ?? 0) + bonus(p, 'aegis_lattice');
}

/** The active field (global effect), if any, and who set it. */
export function activeField(state: GameState) {
  return state.globals.find((g) => g.turnsRemaining > 0) ?? null;
}

export function flareCost(state: GameState, p: PlayerState): number {
  const first = p.turn.flares === 0;
  const focus = first ? bonus(p, 'flare_focus') : 0;
  const field = activeField(state);
  const magnetic = field?.id === 'magneticStorm' ? 1 : 0;
  const drawback = (mods(p).flareCostDelta ?? 0) + (first ? mods(p).firstFlareCostDelta ?? 0 : 0);
  return Math.max(1, BALANCE.solarFlareCost + magnetic + drawback - focus);
}

export function flareHeat(p: PlayerState, state?: GameState): number {
  const maximum = state && activeField(state)?.id === 'solarMaximum' ? 1 : 0;
  return BALANCE.solarFlareHeat + p.upgrades.solarFlare + maximum;
}

export function thermoCost(p: PlayerState): number {
  const discount = p.turn.thermosiphons === 0 ? systemDef(p.systemId).modifiers.firstThermoDiscount ?? 0 : 0;
  return Math.max(0, BALANCE.thermosiphonCost - discount + (mods(p).thermoCostDelta ?? 0));
}

export function thermoCool(p: PlayerState): number {
  return Math.max(1, BALANCE.thermosiphonCool + p.upgrades.thermosiphon + bonus(p, 'deep_coolant') + (mods(p).coolingDelta ?? 0));
}

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

/** Max health: the heat at which this player's sun goes supernova. */
export function supernovaThreshold(p: PlayerState): number {
  return BALANCE.supernovaAt + p.upgrades.coolingChamber * BALANCE.coolingChamberHealthPerUpgrade + (mods(p).maxHealthDelta ?? 0);
}

/** Enemy shields your heat ignores, from weapon planets. */
export function shieldPierce(p: PlayerState): number {
  return trackLevel(p, 'weapons') * BALANCE.piercePerWeaponLevel;
}

export function marketCost(p: PlayerState, defId: string, state?: GameState): number {
  const nebula = state && activeField(state)?.id === 'nebulaDrift' ? 1 : 0;
  const discount = (systemDef(p.systemId).modifiers.marketDiscount ?? 0) + nebula;
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

export function cardNeedsUpgrade(defId: string): boolean {
  return cardDef(defId).effects.some((e) => e.type === 'command');
}

export function upgradeablePlanets(p: PlayerState) {
  return p.planets.filter((pl) => pl.level < BALANCE.maxPlanetLevel);
}

/** Everything a Command card could upgrade right now. */
export function upgradeOptions(p: PlayerState): UpgradeId[] {
  const actions = CORE_ACTIONS.filter((a) => p.upgrades[a] < MAX_UPGRADES[a] && !(a === 'thermosiphon' && mods(p).noThermosiphon));
  return [...actions, ...upgradeablePlanets(p).map((pl) => pl.id)];
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
  const enemy = source !== null && source.id !== target.id;
  const usableShields = enemy ? Math.max(0, target.shields - shieldPierce(source)) : 0;
  const blocked = Math.min(usableShields, amount);
  target.shields -= blocked;
  target.blockedSinceTurnStart += blocked;
  const applied = amount - blocked;
  target.heat = Math.max(BALANCE.minHeat, target.heat + applied);
  if (enemy) source.turn.heatDealt += amount;
  if (blocked > 0) log(state, `${target.name}'s shields absorb ${blocked} heat.`);
  if (applied > 0) log(state, `${target.name}'s sun heats to ${target.heat}.`);
  if (target.heat >= supernovaThreshold(target)) supernova(state, target);
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

  // 0. Draw a fresh hand. Hands are drawn when your turn begins, not when the
  // previous one ends, so nothing arrives while opponents are playing.
  const opening = p.opening;
  p.opening = undefined;
  drawCards(state, p, handSizeFor(p) + (opening?.draw ?? 0));

  // 1. Gain resources (plus a campaign garrison's one-off head start).
  p.money = incomeFor(p) + (opening?.money ?? 0);
  p.shields = shieldsFor(p) + (opening?.shields ?? 0);
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
      case 'solarMaximum':
      case 'nebulaDrift':
        break; // Passive: read by flareCost / flareHeat / marketCost.
    }
  }
  for (const g of state.globals) g.turnsRemaining -= 1;

  // 2b. System drawbacks that tick each turn (e.g. Cryon Drift thawing).
  const thaw = mods(p).thawPerTurn ?? 0;
  if (thaw > 0 && !p.eliminated) {
    log(state, `${p.name}'s frozen sun thaws by ${thaw}.`);
    applyHeat(state, p, thaw, null);
  }

  // 3. Stellar Instability (late-game clock).
  const instability = instabilityHeat(state);
  if (instability > 0 && !p.eliminated) {
    log(state, `Stellar Instability: ${p.name}'s sun heats by ${instability}.`);
    applyHeat(state, p, instability, null);
  }

  if (p.eliminated && !state.winnerId) advanceTurn(state);
  else if (!state.winnerId) checkObjectives(state, p);
}

function endTurn(state: GameState) {
  const p = activePlayer(state);
  p.discard.push(...p.inPlay, ...p.hand);
  p.inPlay = [];
  p.hand = [];
  p.money = 0;
  advanceTurn(state);
}

function advanceTurn(state: GameState) {
  if (state.winnerId) return;
  do {
    state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
    if (state.activePlayerIndex === 0) {
      state.round += 1;
      driftDisplay(state);
    }
  } while (activePlayer(state).eliminated);
  state.turnNumber += 1;
  startTurn(state);
}

/**
 * Global objectives go to the first player to meet them; missions belong to
 * whoever played them. Both are checked after every action on your turn.
 */
/**
 * After every full round the display drifts: the leftmost card is discarded,
 * the rest slide one place left, and the empty right-hand slot is refilled.
 */
function driftDisplay(state: GameState) {
  const [gone, ...rest] = state.display;
  if (gone) {
    (state.marketDiscard ??= []).push(gone);
    log(state, `The display drifts: ${cardDef(gone.defId).name} is discarded.`);
  }
  state.display = [...rest, state.marketDeck.pop() ?? null];
}

function checkObjectives(state: GameState, p: PlayerState) {
  if (p.eliminated || state.winnerId) return;
  for (const id of [...state.objectives]) {
    const obj = objectiveDef(id);
    if (!obj.isMet(p)) continue;
    state.objectives = state.objectives.filter((o) => o !== id);
    const next = state.objectiveDeck.shift();
    if (next) state.objectives.push(next);
    state.claimed.push({ id, playerId: p.id });
    p.claimedObjectives.push(id);
    log(state, `★ ${p.name} claims the objective "${obj.name}".`);
    queueReward(state, p, obj.name);
  }
  for (const card of [...p.missions]) {
    const mission = missionOf(card.defId);
    const obj = objectiveDef(mission);
    if (!obj.isMet(p)) continue;
    p.missions = p.missions.filter((m) => m.uid !== card.uid); // completed missions leave the game
    log(state, `★ ${p.name} completes the mission "${obj.name}".`);
    queueReward(state, p, obj.name);
  }
}

export function missionOf(defId: string): string {
  const e = cardDef(defId).effects.find((ef) => ef.type === 'mission');
  if (!e || e.type !== 'mission') throw new Error(`${defId} is not a mission card`);
  return e.objective;
}

/** Rewards this player could still be offered right now. */
export function availableRewards(state: GameState, p: PlayerState): RewardId[] {
  return REWARDS.map((r) => r.id).filter((id) => {
    if (hasReward(p, id)) return false;
    if (id === 'command') return upgradeOptions(p).length > 0;
    if (id === 'requisition') return state.display.some(Boolean);
    return true;
  });
}

function queueReward(state: GameState, p: PlayerState, source: string) {
  const options = shuffleInPlace(state, availableRewards(state, p)).slice(0, REWARD_CHOICES);
  if (options.length === 0) {
    log(state, `${p.name} has already taken every reward.`);
    return;
  }
  state.pendingRewards.push({ playerId: p.id, source, options });
}

function applyUpgrade(state: GameState, p: PlayerState, upgradeId: UpgradeId) {
  if ((CORE_ACTIONS as readonly string[]).includes(upgradeId)) {
    const a = upgradeId as CoreAction;
    p.upgrades[a] += 1;
    const extra = a === 'coolingChamber' ? ` Max health is now ${supernovaThreshold(p)}.` : '';
    log(state, `${p.name} upgrades ${ACTION_NAME[a]} (${p.upgrades[a]}/${MAX_UPGRADES[a]}).${extra}`);
    return;
  }
  const planet = p.planets.find((pl) => pl.id === upgradeId)!;
  planet.level += 1;
  log(state, `${p.name} upgrades ${planet.name} (${planet.track}) to level ${planet.level}.`);
}

function chooseReward(state: GameState, action: Extract<Action, { type: 'chooseReward' }>) {
  const pending = state.pendingRewards[0];
  if (!pending) throw new GameError('There is no reward to choose.');
  if (!pending.options.includes(action.reward)) throw new GameError('That reward is not on offer.');
  const p = state.players.find((pl) => pl.id === pending.playerId)!;
  const def = rewardDef(action.reward);
  if (def.needs === 'upgrade' && (action.upgradeId === undefined || !upgradeOptions(p).includes(action.upgradeId))) {
    throw new GameError('Choose an action or planet that can still be upgraded.');
  }
  if (def.needs === 'slot' && (action.slot === undefined || !state.display[action.slot])) {
    throw new GameError('Choose a card from the display.');
  }
  state.pendingRewards.shift();
  p.rewards.push(action.reward);
  log(state, `${p.name} takes the reward ${def.name}.`);
  switch (action.reward) {
    case 'command':
      applyUpgrade(state, p, action.upgradeId!);
      break;
    case 'requisition': {
      const card = state.display[action.slot!]!;
      p.discard.push(card);
      state.display[action.slot!] = state.marketDeck.pop() ?? null;
      log(state, `${p.name} requisitions ${cardDef(card.defId).name}.`);
      break;
    }
    case 'purge': {
      let removed = 0;
      for (const pile of [p.discard, p.deck]) {
        for (let i = pile.length - 1; i >= 0 && removed < 2; i--) {
          if (pile[i].defId === 'stardust') {
            pile.splice(i, 1);
            removed++;
          }
        }
      }
      log(state, `${p.name} purges ${removed} Stardust.`);
      break;
    }
    case 'vent':
      cool(state, p, 4);
      break;
    default:
      break; // Permanent rewards work through the derived values above.
  }
}

function resolveEffect(state: GameState, p: PlayerState, e: Effect, targetId?: string, upgradeId?: UpgradeId) {
  switch (e.type) {
    case 'money':
      p.money += e.amount;
      break;
    case 'draw':
      drawCards(state, p, e.amount);
      break;
    case 'heatTarget':
      applyHeat(state, requireTarget(state, p, targetId), e.amount + bonus(p, 'plasma_focus'), p);
      break;
    case 'heatAllOpponents':
      for (const o of livingOpponents(state, p)) applyHeat(state, o, e.amount + bonus(p, 'plasma_focus'), p);
      break;
    case 'heatSelf':
      applyHeat(state, p, e.amount, null);
      break;
    case 'cool':
      cool(state, p, Math.max(1, e.amount + bonus(p, 'deep_coolant') + (mods(p).coolingDelta ?? 0)));
      break;
    case 'mission':
      break; // Handled in playCard: the card moves to the player's missions.
    case 'shield':
      p.shields += e.amount;
      break;
    case 'command': {
      if (upgradeOptions(p).length === 0) {
        log(state, `${p.name} has nothing left to upgrade.`);
        break;
      }
      applyUpgrade(state, p, upgradeId!);
      break;
    }
    case 'global': {
      // Sets the field: replaces any current one and lasts FIELD_ROUNDS full
      // rounds, i.e. that many turn starts for every living player.
      const living = state.players.filter((o) => !o.eliminated).length;
      const replaced = activeField(state);
      state.globals = [{ id: e.effect, sourcePlayerId: p.id, turnsRemaining: living * FIELD_ROUNDS }];
      log(
        state,
        `${p.name} brings ${GLOBALS[e.effect].name}${replaced && replaced.id !== e.effect ? `, ending ${GLOBALS[replaced.id].name}` : ''}: ${GLOBALS[e.effect].text}`,
      );
      break;
    }
  }
}

function requireTarget(state: GameState, p: PlayerState, targetId?: string): PlayerState {
  const t = state.players.find((o) => o.id === targetId);
  if (!t || t.id === p.id || t.eliminated) throw new GameError('Choose a living enemy sun to target.');
  return t;
}

function playCard(state: GameState, p: PlayerState, cardUid: string, targetId?: string, upgradeId?: UpgradeId) {
  const idx = p.hand.findIndex((c) => c.uid === cardUid);
  if (idx < 0) throw new GameError('That card is not in your hand.');
  const card = p.hand[idx];
  const def = cardDef(card.defId);
  // Validate choices before changing anything, so a bad action leaves no trace.
  if (cardNeedsTarget(def.id)) requireTarget(state, p, targetId);
  if (cardNeedsUpgrade(def.id)) {
    const options = upgradeOptions(p);
    if (options.length > 0 && (upgradeId === undefined || !options.includes(upgradeId))) {
      throw new GameError('Choose an action or planet that can still be upgraded.');
    }
  }
  p.hand.splice(idx, 1);
  p.turn.cardsPlayed += 1;
  log(state, `${p.name} plays ${def.name}.`);
  if (def.kind === 'mission') {
    p.missions.push(card);
    return;
  }
  p.inPlay.push(card);
  for (const e of def.effects) {
    if (state.winnerId || p.eliminated) break;
    resolveEffect(state, p, e, targetId, upgradeId);
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
  if (prev.phase === 'setup') return chooseSystem(prev, action);
  if (action.type === 'chooseSystem') throw new GameError('Solar systems have already been chosen.');
  if (prev.pendingRewards.length && action.type !== 'chooseReward') {
    throw new GameError('Choose your objective reward first.');
  }
  const state = structuredClone(prev);
  const p = activePlayer(state);

  switch (action.type) {
    case 'chooseReward':
      chooseReward(state, action);
      break;
    case 'playCard':
      playCard(state, p, action.cardUid, action.targetId, action.upgradeId);
      break;
    case 'playAllMoney': {
      const pure = p.hand.filter((c) => cardDef(c.defId).effects.every((e) => e.type === 'money'));
      for (const c of pure) playCard(state, p, c.uid);
      break;
    }
    case 'buyCard': {
      const card = state.display[action.slot];
      if (!card) throw new GameError('That display slot is empty.');
      const cost = marketCost(p, card.defId, state);
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
      const heat = flareHeat(p, state);
      p.turn.flares += 1;
      log(state, `${p.name} launches a Solar Flare at ${target.name} (${heat} heat).`);
      applyHeat(state, target, heat, p);
      break;
    }
    case 'thermosiphon': {
      if (mods(p).noThermosiphon) throw new GameError(`${systemDef(p.systemId).name} cannot use Thermosiphon.`);
      if (p.heat <= BALANCE.minHeat) throw new GameError(`Your sun cannot be cooled below ${BALANCE.minHeat}.`);
      spend(p, thermoCost(p));
      p.turn.thermosiphons += 1;
      log(state, `${p.name} runs the Thermosiphon.`);
      cool(state, p, thermoCool(p));
      break;
    }
    case 'endTurn':
      endTurn(state);
      return state;
  }

  // A player who supernovas on their own turn (e.g. Dyson Tap) ends it at once.
  if (p.eliminated && !state.winnerId) {
    state.pendingRewards = [];
    endTurn(state);
    return state;
  }
  checkObjectives(state, p);
  return state;
}

function chooseSystem(prev: GameState, action: Action): GameState {
  if (action.type !== 'chooseSystem') throw new GameError('Choose your solar system first.');
  const state = structuredClone(prev);
  const p = activePlayer(state);
  if (!p.systemOffers?.includes(action.systemId)) throw new GameError('That solar system is not on offer.');
  applySystem(p, action.systemId);
  p.systemOffers = undefined;
  log(state, `${p.name} chooses ${systemDef(action.systemId).name}.`);
  finishSetupIfReady(state);
  return state;
}

export function isGameOver(state: GameState): boolean {
  return state.winnerId !== null;
}
