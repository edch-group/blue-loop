import { BALANCE } from './balance';
import { cardDef, presetDeck } from './cards';
import { shuffleInPlace } from './rng';
import { CORE_ACTIONS } from './types';
import type { Action, CardDef, CardInstance, Condition, CoreAction, Count, Effect, FieldId, GameSetup, GameState, Passive, PlayerState, TurnStats } from './types';

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
    version: 2,
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
      commands: [],
      eliminated: false,
      targetId: null,
      turnsTaken: 0,
      playsLeft: 0,
      turn: emptyTurn(),
      modifiers: ps.modifiers,
      conditions: ps.conditions,
    };
    p.heat = Math.max(BALANCE.minHeat, Math.min(p.heat, supernovaThreshold(p) - 1));
    for (const id of (ps.tableau ?? []).slice(0, BALANCE.tableauSlots)) if (persists(id)) p.tableau.push(newCard(state, id));
    state.players.push(p);
    // Later seats start a little ahead to make up for moving second.
    drawCards(state, p, BALANCE.openingHand + (catchUp(i) ? BALANCE.laterSeatCards : 0) + (ps.modifiers?.openingHand ?? 0) + (ps.opening?.draw ?? 0));
  });
  for (const p of state.players) p.targetId = nextOpponent(state, p)?.id ?? null;

  log(state, `A new Blue Loop begins with ${state.players.map((p) => p.name).join(', ')}.`);
  startTurn(state);
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
export function playsAllowed(state: GameState, p: PlayerState): number {
  const extra = passives(p).reduce((sum, { passive }) => sum + (passive.type === 'extraPlay' ? passive.amount : 0), 0);
  // Later seats get an extra play on their first turn to make up for moving second.
  const catchUp = p.turnsTaken === 1 && state.players.indexOf(p) > 0 && state.players.length <= BALANCE.catchUpMaxPlayers ? BALANCE.laterSeatPlays : 0;
  return Math.min(p.turnsTaken, BALANCE.maxPlays) + extra + catchUp;
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

export function cardNeedsDestroyTarget(defId: string): boolean {
  return (cardDef(defId).onPlay ?? []).some((e) => e.type === 'destroy');
}

export function cardNeedsUpgradeChoice(defId: string): boolean {
  return (cardDef(defId).onPlay ?? []).some((e) => e.type === 'upgrade' && e.action === 'choice');
}

/** Core actions that can still be upgraded. */
export function upgradeOptions(p: PlayerState): CoreAction[] {
  return CORE_ACTIONS.filter((a) => p.upgrades[a] < MAX_UPGRADES[a]);
}

/** Whether a card persists in the tableau when played (everything but Command cards). */
export function persists(defId: string): boolean {
  return cardDef(defId).kind !== 'command';
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
  }
}

export function conditionMet(p: PlayerState, cond: Condition | undefined): boolean {
  if (!cond) return true;
  if ('overheated' in cond) return isOverheated(p);
  if ('minKind' in cond) return p.tableau.filter((t) => cardDef(t.defId).kind === cond.minKind).length >= cond.n;
  if ('upgraded' in cond) return p.upgrades[cond.upgraded] > 0;
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

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function drawCards(state: GameState, p: PlayerState, count: number) {
  for (let i = 0; i < count; i++) {
    const card = p.deck.pop();
    if (card) p.hand.push(card);
    else {
      log(state, `${p.name}'s deck is empty: the strain heats their sun by ${BALANCE.fatigueHeat}.`);
      applyHeat(state, p, BALANCE.fatigueHeat, null);
      if (p.eliminated) return;
    }
  }
}

/** Heat a sun. Enemy heat is absorbed by shields first. Returns the heat that got through. */
function applyHeat(state: GameState, target: PlayerState, amount: number, source: PlayerState | null, retaliation = false, cardUid?: string): number {
  if (target.eliminated || amount <= 0) return 0;
  const enemy = source !== null && source.id !== target.id;
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
  p.discard.push(...p.tableau);
  p.tableau = [];
  const alive = state.players.filter((o) => !o.eliminated);
  if (alive.length === 1) {
    state.winnerId = alive[0].id;
    log(state, `${alive[0].name} wins the Blue Loop!`);
  }
}

/** When an effect resolves: as its card is played, at the start of its owner's turn, or as it leaves play. */
export type Timing = 'play' | 'turn' | 'leave';

interface PlayContext {
  upgrade?: CoreAction;
  destroyUid?: string;
}

function resolveEffects(state: GameState, p: PlayerState, card: CardInstance, effects: Effect[] | undefined, when: Timing, ctx: PlayContext = {}) {
  for (const e of effects ?? []) {
    if (state.winnerId || p.eliminated) return;
    if (!conditionMet(p, e.if)) continue;
    switch (e.type) {
      case 'heat': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount <= 0) break;
        const main = targetOf(state, p);
        const targets = e.to === 'enemies' ? livingOpponents(state, p) : main ? [main] : [];
        const others = e.splash ? livingOpponents(state, p).filter((o) => o.id !== main?.id) : [];
        for (const t of targets) applyHeat(state, t, amount, p, false, card.uid);
        for (const t of others) applyHeat(state, t, e.splash!, p, false, card.uid);
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
      case 'destroy': {
        const t = targetOf(state, p);
        const victim = t?.tableau.find((c) => c.uid === ctx.destroyUid);
        if (t && victim) {
          log(state, `${p.name} destroys ${t.name}'s ${cardDef(victim.defId).name}.`);
          leaveTableau(state, t, victim);
        }
        break;
      }
    }
  }
}

/** A card leaves its tableau for the discard pile, triggering its leave effects. */
function leaveTableau(state: GameState, owner: PlayerState, card: CardInstance) {
  owner.tableau = owner.tableau.filter((c) => c.uid !== card.uid);
  card.growth = undefined;
  owner.discard.push(card);
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

  // Draw (your opening hand covers your first turn).
  if (p.turnsTaken > 1) drawCards(state, p, BALANCE.drawPerTurn + (p.modifiers?.extraDraw ?? 0));
  if (p.eliminated) return passOn(state);

  // The table: instability, the map's modifiers, then any global card.
  const unstable = instabilityHeat(state);
  if (unstable > 0) {
    log(state, `Stellar instability heats ${p.name}'s sun by ${unstable}.`);
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

  // Your tableau's start-of-turn effects, oldest card first.
  for (const card of [...p.tableau]) {
    if (state.winnerId || p.eliminated) break;
    if (!p.tableau.includes(card)) continue;
    resolveEffects(state, p, card, cardDef(card.defId).onTurn, 'turn');
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

function playCard(state: GameState, p: PlayerState, action: Extract<Action, { type: 'playCard' }>) {
  const card = p.hand.find((c) => c.uid === action.cardUid);
  if (!card) throw new GameError('That card is not in your hand.');
  if (p.playsLeft <= 0) throw new GameError('You have no plays left this turn.');
  const def: CardDef = cardDef(card.defId);

  if (cardNeedsUpgradeChoice(def.id) && upgradeOptions(p).length > 0) {
    if (!action.upgrade || !upgradeOptions(p).includes(action.upgrade)) throw new GameError('Choose an upgrade.');
  }
  const target = targetOf(state, p);
  if (cardNeedsDestroyTarget(def.id) && target && target.tableau.length > 0) {
    if (!target.tableau.some((c) => c.uid === action.destroyUid)) throw new GameError(`Choose a card in ${target.name}'s tableau to destroy.`);
  }
  const replacing = persists(def.id) && tableauFull(p);
  const replaced = replacing ? p.tableau.find((c) => c.uid === action.replaceUid) : undefined;
  if (replacing && !replaced) throw new GameError('Your tableau is full: choose a card to replace.');

  p.hand = p.hand.filter((c) => c.uid !== card.uid);
  p.playsLeft -= 1;
  p.turn.cardsPlayed += 1;
  log(state, `${p.name} plays ${def.name}.`);

  if (!persists(def.id)) {
    p.commands.push(card);
    resolveEffects(state, p, card, def.onPlay, 'play', action);
    return;
  }
  if (replaced) {
    log(state, `${cardDef(replaced.defId).name} makes way.`);
    leaveTableau(state, p, replaced);
    if (state.winnerId || p.eliminated) return;
  }
  // Only one global card on the table: a new one sweeps the old away.
  if (def.kind === 'global') {
    const old = activeGlobal(state);
    if (old) {
      log(state, `${def.name} replaces ${cardDef(old.card.defId).name}.`);
      leaveTableau(state, old.owner, old.card);
    }
  }
  p.tableau.push(card);
  resolveEffects(state, p, card, def.onPlay, 'play', action);
}

/** Apply an action and return the new state (the input is never mutated). */
export function applyAction(prev: GameState, action: Action): GameState {
  if (prev.winnerId) throw new GameError('The game is over.');
  const state = structuredClone(prev);
  const p = activePlayer(state);
  switch (action.type) {
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
