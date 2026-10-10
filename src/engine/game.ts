import { attunedEffects, attunePosition } from './attunement';
import { BALANCE } from './balance';
import { CARDS, cardDef, cardIn as cardInMode, hasDarkspeed, isBurst, PRESET_DECKS } from './cards';
import { isBossCard } from './cards-bosses';
import { inMode, setRulesMode } from './modes';
import { relicN, relicOf, type RelicPower } from './relics';
import { raceTrait } from './races';
import { randomInt, shuffleInPlace } from './rng';
import type { Action, CardDef, CardInstance, CardKind, Condition, Count, Effect, FieldId, GameSetup, GameState, LightspeedTrigger, Passive, ReactEvent, Reaction, Planet, PlayerState, TurnPulse, TurnStats } from './types';

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
    version: 7,
    rngState: setup.seed | 0,
    uidCounter: 0,
    turnNumber: 1,
    round: 1,
    activePlayerIndex: 0,
    players: [],
    winnerId: null,
    log: [],
    ...(setup.campaign ? { campaign: true } : {}),
    ...(setup.challenge ? { challenge: { ...setup.challenge } } : {}),
    ...(setup.mode === 'core' ? { mode: 'core' as const } : {}),
  };
  setRulesMode(state.mode);

  const catchUp = (i: number) => i > 0 && n <= BALANCE.catchUpMaxPlayers;
  setup.players.forEach((ps, i) => {
    // (No deck given: a starter, by seat.)
    const fallback = PRESET_DECKS.filter((d) => !d.mixed && (d.mode ?? 'lost') === (setup.mode ?? 'lost'))[i % 4];
    const list = ps.deck ?? fallback.cards;
    const deck = shuffleInPlace(state, list.map((id) => newCard(state, id)));
    const p: PlayerState = {
      id: `p${i + 1}`,
      name: ps.name,
      isAI: ps.isAI,
      deckName: ps.deckName ?? (ps.deck ? undefined : fallback.name),
      ...(ps.avatar ? { avatar: ps.avatar } : {}),
      heat: BALANCE.startingHeat + (ps.heatDelta ?? 0) + (ps.modifiers?.startingHeat ?? 0) - (catchUp(i) ? BALANCE.laterSeatCool : 0),
      shields: ps.opening?.shields ?? 0,
      deck,
      deckSize: deck.length + (ps.tableau?.length ?? 0),
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
      ...(ps.heroBoons?.boons.length ? { heroBoons: ps.heroBoons } : {}),
      ...(ps.relics?.length ? { relics: ps.relics.map((r) => ({ ...r })) } : {}),
      ...(ps.skills?.length ? { skills: ps.skills.map((k) => ({ ...k })) } : {}),
      ...(ps.hero ? { hero: ps.hero } : {}),
      ...(ps.heroStats ? { heroStats: { ...ps.heroStats } } : {}),
      ...(ps.rooms ? { rooms: { defence: [...ps.rooms.defence], attack: [...ps.rooms.attack], command: ps.rooms.command, ...(ps.rooms.boons ? { boons: ps.rooms.boons.map((b) => [...b]) } : {}) } } : {}),
    };
    p.heat = Math.max(BALANCE.minHeat, Math.min(p.heat, supernovaThreshold(p) - 1));
    // A garrison takes the safest slots first; a Hero already in play (a campaign hero's Herald) leads from the
    // Hero slot, taken out of the deck if a copy is there.
    const safest = slotsBySafety();
    for (const id of (ps.tableau ?? []).filter(persists)) {
      const k = p.deck.findIndex((c) => c.defId === id);
      const card = k >= 0 && cardDef(id).kind === 'command' ? p.deck.splice(k, 1)[0] : newCard(state, id);
      if (cardDef(id).kind === 'command') {
        if (!commandCard(p)) place(p, card, COMMAND_SLOT);
      } else if (safest.length) place(p, card, safest.shift()!);
    }
    if (ps.lightspeed && cardDef(ps.lightspeed).kind === 'lightspeed') p.lightspeed = newCard(state, ps.lightspeed);
    // A Lost Overlord: its body in play, and the first of its parts' actions to come.
    if (ps.boss) {
      // It has no sun: its leader (the Overlord in its Hero slot) is what must be beaten.
      const leader = ps.bossLeader ? p.tableau.find((c) => c.defId === ps.bossLeader) : commandCard(p);
      if (leader && ps.bossHealth) leader.health = leader.maxHealth = ps.bossHealth;
      p.boss = { intent: bossOrder(p)[0]?.uid, ...(leader ? { leader: leader.uid } : {}) };
    }
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
 * out of the tableau; before version 4 tableaus had 8 unslotted places and no stability; before 6, no health; before 7,
 * cards faded with the days.
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
    // Version 6 split health from stability: a card saved before it starts with its full health (a Hero, its
    // stability as its health, and no days to count).
    if (state.version < 6)
      for (const c of p.tableau) {
        c.health ??= cardDef(c.defId).kind === 'command' ? c.stability ?? baseHealth(c.defId) : baseHealth(c.defId);
        if (cardDef(c.defId).kind === 'command') delete c.stability;
      }
    // Version 7: cards no longer fade (their days are gone; their health is their stability now).
    if (state.version < 7) for (const c of p.tableau) delete c.stability;
  }
  state.version = 7;
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
  return p.tableau.flatMap((card) => cardPassives(card).map((passive) => ({ card, passive })));
}

/** What a card carries on top of its own text: its Fusion cards and a campaign hero's boons. */
/** What a Fusion card lends the card it is fused onto: its Fusion bonus, and nothing else of it. */
const FUSED = new Map<string, CardDef>();
export function fusedDef(defId: string): CardDef {
  let d = FUSED.get(defId);
  if (!d) {
    const def = cardDef(defId);
    const f = def.fuse ?? { text: '' };
    d = { id: def.id, name: def.name, kind: def.kind, race: def.race, text: f.text, onPlay: f.onPlay, onTurn: f.onTurn, onDusk: f.onDusk, passive: f.passive, defence: f.defence };
    FUSED.set(defId, d);
  }
  return d;
}

function extras(card: CardInstance): CardDef[] {
  return [...(card.fused ?? []).map((f) => fusedDef(f.defId)), ...(card.boons ?? []).map((b) => cardDef(b))];
}

/** A card's passives: its own, and those of what it carries (Fusion cards, boons). */
export function cardPassives(card: CardInstance): Passive[] {
  return [...(cardDef(card.defId).passive ?? []), ...extras(card).flatMap((d) => d.passive ?? [])];
}

/** A card's Sturdy: its own, and what it carries. */
export function cardSturdy(card: CardInstance): number {
  return (cardDef(card.defId).defence ?? 0) + extras(card).reduce((t, d) => t + (d.defence ?? 0), 0);
}

/** Cards of yours a Fusion card can fuse onto: any in play with room for another (not Lightspeed cards). */
export function fusionHosts(p: PlayerState): CardInstance[] {
  // (Not a Relic: nothing fused onto it would steady it, so it would only break the pair.)
  return p.tableau.filter((c) => (c.fused?.length ?? 0) < BALANCE.maxFused && cardDef(c.defId).kind !== 'relic');
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
  const industry = currentPlanet(p, state) === 'industrial' ? BALANCE.industrialPlays + (p.modifiers?.industrialPlays ?? 0) : 0;
  return Math.min(p.turnsTaken, BALANCE.maxPlays) + extra + catchUp + industry + (p.modifiers?.extraPlays ?? 0);
}

/** The Command slot: a player's one Command card leads their tableau from its own slot, outside the five. */
export const COMMAND_SLOT = -1;

/** A player's Command card in play, if any. */
export function commandCard(p: PlayerState): CardInstance | undefined {
  return p.tableau.find((c) => c.slot === COMMAND_SLOT);
}

/** Whether a card goes into one of the five tableau slots (not the Command slot, nor face down). */
export function inSlots(defId: string): boolean {
  return persists(defId) && cardDef(defId).kind !== 'command' && !isBurst(cardDef(defId));
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

type EnemyEffect = Extract<Effect, { type: 'destroy' | 'bounce' | 'erode' | 'shift' | 'offer' | 'rootbreak' }>;

/** The effect a card aims at one card in a rival's tableau (destroy, return or erode), if any. */
export function enemyEffect(defId: string): EnemyEffect | undefined {
  return (cardDef(defId).onPlay ?? []).find((e): e is EnemyEffect => e.type === 'destroy' || e.type === 'bounce' || (e.type === 'erode' && !e.all) || (e.type === 'shift' && !!e.enemy) || e.type === 'offer' || (e.type === 'rootbreak' && !e.shields));
}

function canReach(owner: PlayerState, c: CardInstance, e: EnemyEffect): boolean {
  // (A Lost Overlord can't be removed or moved: it must be beaten down.)
  if (owner.boss?.leader === c.uid && e.type !== 'offer' && e.type !== 'rootbreak') return false;
  // (A Hero leads from its own slot: it can't be shifted.)
  if (e.type === 'shift') return c.slot !== COMMAND_SLOT;
  // (Rootbreak splits defence: a card with none left to split is no target.)
  if (e.type === 'rootbreak') return cardDefence(owner, c) > 0;
  if (e.type === 'offer') return true;
  if (e.type === 'destroy' && e.kind && cardDef(c.defId).kind !== e.kind) return false;
  // (Brittle: removal reaches a Relic whatever its defence.)
  if (e.type !== 'erode' && e.maxDefence !== undefined && cardDefence(owner, c) > e.maxDefence && cardDef(c.defId).kind !== 'relic') return false;
  return true;
}

/** Cards in your target's tableau this card could destroy, return or erode (empty if it needs no choice). */
export function enemyChoices(state: GameState, p: PlayerState, defId: string): CardInstance[] {
  const e = enemyEffect(defId);
  const t = targetOf(state, p);
  if (!e || !t) return [];
  return t.tableau.filter((c) => canReach(t, c, e));
}

/**
 * Whether a card is a Guard: by its own Guard (the keyword), or fortified by a Lightspeed answer (until its
 * owner's next dawn). Neither its defence nor its slot makes one.
 */
export function isGuard(_p: PlayerState, c: CardInstance): boolean {
  return cardPassives(c).some((x) => x.type === 'taunt') || (c.fortified ?? 0) > 0;
}

/** A player's Guard cards: while they have any, rival attacks can only strike them (heat aimed by a card played or a Hero's ability goes where it likes). */
export function guards(p: PlayerState): CardInstance[] {
  return p.tableau.filter((c) => isGuard(p, c));
}

/**
 * Where an attack, or heat a card deals as it is played (or a Hero's ability), may be aimed: any card in your
 * rival's tableau, or their sun; while they have Guard cards, an attack only those. (Dawn heat is never aimed:
 * it always strikes the sun.)
 */
export function aimChoices(state: GameState, p: PlayerState, attack = false): { cards: CardInstance[]; sun: boolean } {
  const t = targetOf(state, p);
  if (!t) return { cards: [], sun: true };
  // (A Guard soaks up attacks only [direction: not heat aimed by surges or abilities].)
  const g = attack ? guards(t) : [];
  // (A Lost Overlord has no sun to aim at: only its body.)
  return g.length ? { cards: g, sun: false } : { cards: [...t.tableau], sun: !t.boss };
}

/** Whether a card heats your rival as it is played (it may be aimed then, at their sun or one of their cards). */
export function aimable(defId: string): boolean {
  return (cardDef(defId).onPlay ?? []).some((e) => e.type === 'heat' && e.to === 'target');
}

/** Whether a Hero's ability heats your rival (it may be aimed, as a card played is). */
export function abilityAimable(defId: string, index: number): boolean {
  return (cardDef(defId).abilities?.[index]?.effects ?? []).some((e) => e.type === 'heat' && e.to === 'target');
}

/** Where aimed heat lands: the rival card aimed at (if still there), else the sun (null). Guards don't draw it in. */
function aimedCard(state: GameState, p: PlayerState, aim: string | undefined): CardInstance | null {
  const t = targetOf(state, p);
  if (!t) return null;
  return (aim ? t.tableau.find((c) => c.uid === aim) : undefined) ?? null;
}

/** Whether a player's shields guard their cards too, against heat aimed at them (a Tidewall card in play). */
export function tidewall(p: PlayerState): boolean {
  return p.tableau.some((c) => cardPassives(c).some((x) => x.type === 'tidewall'));
}

/** A blow on a card (an attack, or a sting) wears its health away past its defence, 1 for 1; at 0 it burns away into its owner's discard pile. */
function strikeCard(state: GameState, owner: PlayerState, victim: CardInstance, amount: number, source: PlayerState, pierce: boolean, cardUid: string, sting = false, heat = false) {
  // Shields guard only the sun, unless a Tidewall card spreads them over its owner's cards too: and then only
  // against heat aimed at them. An attack, a sting or pierce heat breaches it.
  // What struck it, for the log: the card, if it is one on the table (or in hand) of the side striking.
  const by = cardUid ? cardIn(source, cardUid) : undefined;
  const fromText = by ? ` from ${source.name}'s ${cardDef(by.defId).name}` : sting ? ` (a sting)` : '';
  if (tidewall(owner) && heat && !pierce) {
    const blocked = Math.min(owner.shields, amount);
    owner.shields -= blocked;
    if (blocked > 0) {
      log(state, `${owner.name}'s Tidewall shields absorb ${blocked}${fromText}.`);
      // (A sting answered by shields doesn't sting back.)
      if (!sting) shieldsAnswer(state, owner, source, cardUid);
    }
    amount -= blocked;
  }
  if (amount <= 0 || !owner.tableau.includes(victim)) return;
  // The card's defence (its slot's, and its own) takes the blow first (not a pierce one), and stays worn:
  // later blows find less defence in their way, until it is mended.
  // A sting ignores it too: the attacking card left its defences to attack.
  const turned = pierce || sting ? 0 : Math.min(amount, cardDefence(owner, victim));
  if (turned > 0) {
    victim.dented = (victim.dented ?? 0) + turned;
    log(state, `${owner.name}'s ${cardDef(victim.defId).name} takes ${turned} on its defence${fromText} (defence ${cardDefence(owner, victim)} left).`);
  }
  amount -= turned;
  if (amount <= 0) return;
  victim.health = Math.max(0, (victim.health ?? 0) - amount);
  log(state, `${owner.name}'s ${cardDef(victim.defId).name} takes ${amount}${turned > 0 ? '' : fromText} (health ${victim.health}).`);
  if (victim.health <= 0) {
    log(state, `${owner.name}'s ${cardDef(victim.defId).name} burns away.`);
    leaveTableau(state, owner, victim);
    // A Bounty relic: each rival card burned away cools its holder's sun.
    const bounty = source !== owner ? relicN(source.relics, 'bounty') : 0;
    if (bounty && !source.eliminated) {
      cool(state, source, bounty, relicOf(source.relics, 'bounty')!.name);
      notePulse(state, source, null, 'cool', source, bounty);
    }
  }
}

/** A relic's blow at any target: a choice its holder makes (a rival card, or their sun), waiting first thing in their day. */
function relicAim(state: GameState, p: PlayerState, amount: number, power: RelicPower) {
  const relic = relicOf(p.relics, power);
  if (!relic || amount <= 0 || state.winnerId || p.eliminated || !targetOf(state, p)) return;
  log(state, `${p.name}'s ${relic.name}: ${amount} heat to any target.`);
  (p.dawnChoices ??= []).push({ uid: `relic:${relic.name}`, kind: 'aim', relic: relic.name, amount });
}

/** The dawn Sear of a relic: heat to the rival card with the most attack (a Guard draws attacks only). */
function relicSear(state: GameState, p: PlayerState) {
  const n = relicN(p.relics, 'sear');
  const rival = targetOf(state, p);
  if (!n || !rival) return;
  const victim = [...rival.tableau].filter((c) => !(rival.boss && c.uid === rival.boss.leader)).sort((a, b) => cardAttack(state, rival, b) - cardAttack(state, rival, a))[0];
  if (!victim || cardAttack(state, rival, victim) <= 0) return;
  log(state, `${p.name}'s ${relicOf(p.relics, 'sear')!.name} sears ${rival.name}'s ${cardDef(victim.defId).name} for ${n}.`);
  notePulse(state, p, null, 'heat', rival, n, victim.uid);
  strikeCard(state, rival, victim, n, p, false, '', false, true);
}

/** A Gift relic's card: a random one of its holder's race (as rare as the relic allows), legal in the battle's mode. */
function giftCard(state: GameState, p: PlayerState, n: number): string | undefined {
  const race = p.hero ? cardDef(p.hero).race : undefined;
  const rarities = n >= 3 ? ['dwarf', 'stellar', 'anomaly'] : n === 2 ? ['dwarf', 'stellar'] : ['dwarf'];
  const pool = CARDS.filter(
    (c) => c.race === race && race !== undefined && rarities.includes(c.rarity ?? 'dwarf') && c.kind !== 'command' && c.kind !== 'global' && !c.fusion && !isBossCard(c.id) && !c.id.startsWith('boon_') && (state.mode !== 'core' || inMode(cardInMode(c.id, 'core'), 'core')),
  );
  return pool.length ? pool[randomInt(state, pool.length)].id : undefined;
}

/** What a card's removal does to the chosen card. */
export function enemyEffectKind(defId: string): 'destroy' | 'bounce' | 'erode' | 'shift' | 'offer' | 'rootbreak' | null {
  return enemyEffect(defId)?.type ?? null;
}

/** Your other cards this card could return to your hand or restore (empty if it needs no such choice). */
export function allyChoices(p: PlayerState, defId: string): CardInstance[] {
  if (allyEffectKind(defId) === 'shift') return p.tableau.filter((c) => c.slot !== COMMAND_SLOT);
  // Offering: an undimmed armed card of yours (that hasn't given its attack already). Rootbreak: a card that has grown.
  if (allyEffectKind(defId) === 'offer') return p.tableau.filter((c) => armed(p, c) && !c.dimmed && !c.spentAttack);
  if (allyEffectKind(defId) === 'rootbreak') return p.tableau.filter((c) => (c.growth ?? 0) > 0);
  if (!(cardDef(defId).onPlay ?? []).some((e) => e.type === 'recall' || e.type === 'empower' || (e.type === 'restore' && !e.all && !e.self))) return [];
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

/**
 * Why a card can't be played into this tableau now (null if it can). A full tableau never stops it: the new card
 * replaces one of yours. Only a card that needs one of yours to work on can be held back.
 */
export function roomProblem(p: PlayerState, defId: string): string | null {
  const name = cardDef(defId).name;
  // (Offering and Rootbreak need a card of yours to draw on.)
  if (needsAlly(defId) && !allyChoices(p, defId).length) {
    return allyEffectKind(defId) === 'offer'
      ? `${name} needs an undimmed allied card with attack.`
      : `${name}'s Rootbreak needs a card of yours that has grown.`;
  }
  // A Consume card needs a card of yours to give up (and then has its slot).
  if (cardDef(defId).consume && !consumable(p).length) return `${name} needs another card of yours in play to consume.`;
  return null;
}

/** Whether a card can be played into this tableau now (see roomProblem). */
export function hasRoomFor(p: PlayerState, defId: string): boolean {
  return roomProblem(p, defId) === null;
}

/** Whether playing this card into a slot means replacing one of your cards: your tableau is full (cards no longer fade). */
export function replaces(p: PlayerState, defId: string): boolean {
  const def = cardDef(defId);
  return inSlots(defId) && tableauFull(p) && !def.consume && !recallsInto(p, defId) && consumable(p).length > 0;
}

/** The cards of yours a Consume card can give up: any in play but your Hero. */
export function consumable(p: PlayerState): CardInstance[] {
  return p.tableau.filter((c) => c.slot !== COMMAND_SLOT);
}

/** Whether a card's ally choice returns the card to hand (rather than restoring its stability). */
export function allyEffectKind(defId: string): 'recall' | 'restore' | 'empower' | 'shift' | 'offer' | 'rootbreak' | null {
  const e = (cardDef(defId).onPlay ?? []).find((x) => x.type === 'recall' || x.type === 'empower' || (x.type === 'restore' && !x.all && !x.self) || (x.type === 'shift' && !x.enemy) || x.type === 'offer' || x.type === 'rootbreak');
  return e?.type === 'recall' || e?.type === 'restore' || e?.type === 'empower' || e?.type === 'shift' || e?.type === 'offer' || e?.type === 'rootbreak' ? e.type : null;
}

/** Whether a card can only be played with a card of yours to draw on (Offering's attack, Rootbreak's growth). */
function needsAlly(defId: string): boolean {
  const k = allyEffectKind(defId);
  return k === 'offer' || k === 'rootbreak';
}

/** Whether a card shifts a card as it is played (one of its owner's, or of their rival's), and whose. */
export function shiftEffect(defId: string): 'mine' | 'rival' | null {
  const e = (cardDef(defId).onPlay ?? []).find((x): x is Extract<Effect, { type: 'shift' }> => x.type === 'shift');
  return e ? (e.enemy ? 'rival' : 'mine') : null;
}

/** The slots a shifted card may move into: any of its tableau's five but its own (a card there swaps places). */
export function shiftSlots(card: CardInstance): number[] {
  return Array.from({ length: BALANCE.tableauSlots }, (_, i) => i).filter((i) => i !== card.slot);
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

/**
 * A card's stability: what it can take before it burns away (attacks, stings, aimed heat past its defence, Erode
 * and Decay wear it down; Restore and Renew mend it). Cards no longer fade with the days: they stand until beaten
 * down or removed. 1 + its cost (+1 for a defence card), from 2 to 8, then its race's trait; a Hero's is the
 * stability it is listed with. (In the engine it is `health`; players only ever see the word stability.)
 */
export function baseHealth(defId: string): number {
  const def = cardDef(defId);
  if (def.health !== undefined) return def.health;
  if (def.kind === 'command') return Math.max(1, def.stability ?? BALANCE.heroStability);
  const base = Math.max(BALANCE.minHealth, Math.min(BALANCE.maxHealth, 1 + (def.cost ?? 1) + (def.kind === 'defence' ? 1 : 0)));
  // (A Fusion card stands a little less well alone: fusing is its strength.)
  return Math.max(1, base - (def.fusion ? 1 : 0));
}

/** The energy a card costs to play (see costs.ts; 1 if not listed). */
export function cardCost(defId: string): number {
  return cardDef(defId).cost ?? 1;
}

/** Put a card into a tableau slot, with its full stability. */
function place(p: PlayerState, card: CardInstance, slot: number) {
  card.slot = slot;
  card.health = baseHealth(card.defId);
  // (A Chosen card's extra attack goes with it when it leaves: it comes back in as printed.)
  delete card.attackBonus;
  // A campaign hero's card carries their boons (gear and skills) while it is in play.
  if (p.heroBoons && card.defId === p.heroBoons.hero) {
    card.boons = [...p.heroBoons.boons];
    // (A hero's +stability gear adds to its stability.)
    card.health = Math.min(BALANCE.maxHealth + 4, card.health + card.boons.reduce((t, b) => t + (cardDef(b).stability ?? 0), 0));
    card.maxHealth = card.health;
  }
  // A Vigour relic: every card put into play stands a little steadier.
  const vigour = relicN(p.relics, 'vigour');
  if (vigour && cardDef(card.defId).kind !== 'relic') {
    card.health = (card.health ?? 0) + vigour;
    card.maxHealth = (card.maxHealth ?? baseHealth(card.defId)) + vigour;
  }
  // A campaign ship's room with a module in it: the card standing there carries the module's boons.
  const roomBoons = slot !== COMMAND_SLOT ? p.rooms?.boons?.[slot] : undefined;
  if (roomBoons?.length) card.boons = [...(card.boons ?? []), ...roomBoons];
  // The slot's worn defence is still worn: the new card stands in it.
  const wear = p.slotWear?.[slot] ?? 0;
  if (wear > 0) card.dented = wear;
  if (p.slotWear) delete p.slotWear[slot];
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
  let d = slotDefence(card.slot) + cardSturdy(card) + roomDefence(p, card) + (card.fortified ?? 0);
  // (An Anchor relic: Guards stand thicker.)
  if (p.relics && isGuard(p, card)) d += relicN(p.relics, 'anchor');
  for (const src of p.tableau) {
    const k = distance(src, card);
    if (k === 0) continue;
    for (const ps of cardPassives(src)) if (ps.type === 'guard' && k <= ps.amounts.length) d += ps.amounts[k - 1];
  }
  // Heat wears defence away, and the wear lasts (see mendDefences).
  return Math.max(0, Math.max(0, d) - (card.dented ?? 0));
}

/** Campaign battles: what the ship's room adds to the card standing in it (and a hero's own training). */
function roomDefence(p: PlayerState, card: CardInstance): number {
  let d = 0;
  if (p.rooms) d += card.slot === COMMAND_SLOT ? p.rooms.command : (p.rooms.defence[card.slot ?? -1] ?? 0);
  if (p.heroStats && card.defId === p.hero) d += p.heroStats.defence;
  return d;
}

/** A slot's own defence: 1 at the edges, 2 inside, 3 in the middle (the Command slot's is its own). */
export function slotDefence(slot: number | undefined): number {
  return slot === COMMAND_SLOT ? BALANCE.commandSlotDefence : (BALANCE.slotDefence[slot ?? 0] ?? 1);
}

/** A card's defence when whole (no wear). */
export function fullDefence(p: PlayerState, card: CardInstance): number {
  return cardDefence(p, { ...card, dented: 0 });
}

/** Whether a card is anchored (a neighbour with Anchor mends it 1 at each dawn). */
function anchored(p: PlayerState, card: CardInstance): boolean {
  return p.tableau.some((src) => distance(src, card) === 1 && cardPassives(src).some((ps) => ps.type === 'anchor'));
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
export function dawnEffects(card: CardInstance, p?: PlayerState, state?: GameState): Effect[] {
  const def = cardDef(card.defId);
  const chosen = def.choices?.find((c) => c.id === card.choice) ?? def.choices?.[0];
  const own = [...(def.onTurn ?? []), ...(chosen?.onTurn ?? []), ...extras(card).flatMap((d) => d.onTurn ?? [])];
  // Attunement: with its owner known, the bonus of where their orbit stands.
  let attune = (def.attune ?? 0) + extras(card).reduce((n, d) => n + (d.attune ?? 0), 0);
  // Star-charted (the Seren): attuned cards attune once more.
  if (attune) attune += raceTrait(def.race)?.attune ?? 0;
  if (!attune || !p) return own;
  return [...own, ...attunedEffects(attunePosition(p.orbit, !!state && planetsEaten(state, p)), attune)];
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
  let bonus = 0;
  p.tableau.forEach((src) => {
    const d = distance(src, card);
    if (d === 0) return;
    for (const ps of cardPassives(src)) {
      if (ps.type === 'adjacent' && d <= ps.amounts.length && (!ps.kind || hasRole(p, card, ps.kind))) bonus += ps.amounts[d - 1];
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
      return Math.floor(p.tableau.filter((t) => hasRole(p, t, c.kind)).length / per);
    case 'cards':
      return Math.floor(p.tableau.length / per);
    case 'rested':
      return Math.floor(p.tableau.filter((t) => t.uid !== card.uid && !t.dimmed && !cardDef(t.defId).token).length / per);
    case 'race':
      return Math.floor(p.tableau.filter((t) => ofRace(cardDef(t.defId), c.race, c.sub)).length / per);
    case 'shields':
      return Math.floor(p.shields / per);
    case 'defence':
      return Math.floor(p.tableau.reduce((n, t) => n + cardDefence(p, t), 0) / per);
    case 'growth':
      return card.growth ?? 0;
    case 'adjacent':
      return neighbours(p, card).filter((n) => !c.kind || hasRole(p, n, c.kind)).length;
    case 'planet':
      return currentPlanet(p, state) === c.planet ? c.amount : 0;
    case 'spent':
      return (card.spent ?? 0) * (c.times ?? 1);
    case 'cold': {
      const sun = c.rival ? (state ? targetOf(state, p) : undefined) : p;
      return sun ? Math.floor(Math.max(0, -sun.heat) / per) * (c.times ?? 1) : 0;
    }
  }
}

export function conditionMet(p: PlayerState, cond: Condition | undefined, state?: GameState, card?: CardInstance): boolean {
  if (!cond) return true;
  if ('vigil' in cond) return !card?.dimmed;
  if ('overheated' in cond) return isOverheated(p);
  if ('minKind' in cond) return p.tableau.filter((t) => hasRole(p, t, cond.minKind)).length >= cond.n;
  if ('planet' in cond) return currentPlanet(p, state) === cond.planet;
  if ('minRace' in cond) return p.tableau.filter((t) => ofRace(cardDef(t.defId), cond.minRace, cond.sub)).length >= cond.n;
  return p.tableau.length >= cond.minCards;
}

/** Whether a card is of this race (and sub-race, if given). */
function ofRace(def: CardDef, race: number | undefined, sub?: string): boolean {
  return (race === undefined || def.race === race) && (!sub || def.sub === sub);
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
  if (e.type === 'heat' || e.type === 'cool' || e.type === 'shield') {
    const def = cardDef(card.defId);
    // Bonus cards (by kind, or a Hero's racial buff) count once per card name (copies do not stack).
    let bonus = 0;
    const counted = new Set<string>();
    for (const { card: src, passive } of passives(p)) {
      if (passive.type !== 'kindBonus' || (passive.stat ?? 'heat') !== e.type) continue;
      if ((passive.kind && !(p.tableau.includes(card) ? hasRole(p, card, passive.kind) : defHasRole(def, passive.kind))) || (passive.race !== undefined && passive.race !== def.race) || (passive.sub && passive.sub !== def.sub)) continue;
      if ((passive.others && src.uid === card.uid) || (passive.onTurnOnly && when !== 'turn') || counted.has(src.defId)) continue;
      counted.add(src.defId);
      bonus += passive.amount;
    }
    if (e.type === 'heat' && fieldActive(state, 'solarMaximum')) bonus += 1;
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
export function turnForecast(state: GameState, p: PlayerState): TurnForecast {
  const target = targetOf(state, p);
  // Their next day's planet (their first day starts at the dead planet).
  const orbit = p.turnsTaken > 0 ? (p.orbit + 1) % ORBIT_LENGTH : p.orbit;
  const planet = planetsEaten(state, p) ? 'dead' : planetAt(orbit);
  // Their day comes this round if they sit after the active player, else next round.
  const round = state.round + (state.players.indexOf(p) > state.activePlayerIndex ? 0 : 1);
  const f: TurnForecast = { heat: 0, targetId: target?.id ?? null, shields: 0, cool: 0, selfHeat: 0, unstable: 0, unstableRound: state.round + 1, round, draw: 0, plays: 0, planet, planetDraw: 0, planetPlays: 0 };
  if (p.eliminated) return f;
  if (planet === 'abundant' && p.turnsTaken > 0) f.planetDraw = BALANCE.abundantDraw + (p.modifiers?.abundantDraw ?? 0);
  if (planet === 'industrial') f.planetPlays = BALANCE.industrialPlays + (p.modifiers?.industrialPlays ?? 0);
  f.draw += f.planetDraw;
  f.plays += f.planetPlays;
  // Run the effects on a copy, so growth and the like carry from one effect to the next (its dawn, then its dusk).
  const me: PlayerState = { ...p, orbit, tableau: p.tableau.map((c) => ({ ...c })) };
  for (const card of me.tableau) {
    for (const e of [...dawnEffects(card, me, state), ...duskEffects(card)]) {
      if (!conditionMet(me, e.if, state, card)) continue;
      switch (e.type) {
        case 'grow':
          card.growth = Math.max(card.growth ?? 0, Math.min(e.max, (card.growth ?? 0) + 1));
          break;
        case 'heat':
          f.heat += effectAmount(state, me, card, e, 'turn');
          break;
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
  // (A Lost Overlord draws nothing: it fights with the body it has.)
  if (p.boss) return;
  for (let i = 0; i < count; i++) {
    // (A campaign deck can be small: with nothing left to draw or shuffle back, it gives no
    // more, without the strain. Its sun would burn out before the battle began.)
    if (state.campaign && p.deck.length === 0 && p.discard.length === 0) return;
    if (p.deck.length === 0 && p.discard.length > 0) {
      reshuffle(state, p);
      if (p.eliminated) return;
    }
    const card = p.deck.pop();
    if (card) p.hand.push(card);
    else {
      log(state, `${p.name}'s deck is empty: the strain heats their sun by ${BALANCE.fatigueHeat}.`);
      applyHeat(state, p, BALANCE.fatigueHeat, null, false, undefined, false, 'the strain of an empty deck');
      if (p.eliminated) return;
    }
  }
}

/** An empty deck: the discard pile is shuffled back in to be used again (it costs nothing). */
function reshuffle(state: GameState, p: PlayerState) {
  p.deck = shuffleInPlace(state, p.discard);
  p.discard = [];
  log(state, `${p.name} shuffles their discard pile back into their deck.`);
  // A Recycle relic answers it with a blow.
  const recycle = relicN(p.relics, 'recycle');
  if (recycle) relicAim(state, p, recycle, 'recycle');
}

/** A player's card by uid, wherever it is. */
function cardIn(p: PlayerState, uid: string): CardInstance | undefined {
  return [...p.tableau, ...p.hand, ...p.discard, ...p.deck, ...(p.lightspeed ? [p.lightspeed] : [])].find((c) => c.uid === uid);
}

/**
 * Heat a sun. Enemy heat is absorbed by shields first. Returns the heat that got through. `why` names what the heat
 * came from, for the log (unset: the card `cardUid` of `source`'s, if it is one).
 */
function applyHeat(state: GameState, target: PlayerState, amount: number, source: PlayerState | null, retaliation = false, cardUid?: string, pierce = false, why?: string): number {
  if (target.eliminated || amount <= 0) return 0;
  const enemy = source !== null && source.id !== target.id;
  // A Lost Overlord has no sun: heat sent at it strikes the Overlord itself (its shields first, then its
  // defence and stability). Its own heat goes nowhere.
  if (target.boss) {
    if (!enemy) return 0;
    const blocked = pierce ? 0 : Math.min(target.shields, amount);
    target.shields -= blocked;
    if (blocked > 0) log(state, `${target.name}'s shields absorb ${blocked}.`);
    const leader = target.tableau.find((c) => c.uid === target.boss!.leader);
    if (leader && source && amount > blocked) strikeCard(state, target, leader, amount - blocked, source, false, cardUid ?? '', false, true);
    return 0;
  }
  // Shields soak rival heat first (pierce goes mostly past them).
  const blocked = enemy ? Math.min(pierce ? Math.floor(target.shields * BALANCE.pierceShieldShare) : target.shields, amount) : 0;
  target.shields -= blocked;
  const applied = amount - blocked;
  target.heat = Math.max(BALANCE.minHeat, target.heat + applied);
  if (enemy) source.turn.heatDealt += amount;
  const byCard = cardUid && source ? cardIn(source, cardUid) : undefined;
  const from = why ?? (byCard && source ? `${source.name}'s ${cardDef(byCard.defId).name}` : undefined);
  // Two lines, led by what did it: the shields it broke (or wore down), then the sun it heated.
  const From = from ? from[0].toUpperCase() + from.slice(1) : '';
  if (blocked > 0) log(state, from ? `${From} ${target.shields ? 'hits' : 'breaks'} ${target.name}'s shields (−${blocked}).` : `${target.name}'s shields absorb ${blocked} heat.`);
  if (applied > 0) log(state, from ? `${From} heats ${target.name}'s sun to ${target.heat} (+${applied}).` : `${target.name}'s sun heats to ${target.heat} (+${applied}).`);
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
  const sting = 0; // (Sting is now a card's own: it hits back when that card is attacked; see counterDamage.)
  const soothe = sum('absorbCool');
  const key = cardUid ?? source.id;
  if (target.stung?.turn !== state.turnNumber) target.stung = { turn: state.turnNumber, ids: [] };
  if ((sting > 0 || soothe > 0) && !target.stung.ids.includes(key)) {
    target.stung.ids.push(key);
    if (soothe > 0) cool(state, target, soothe, `${target.name}'s Soothe`);
    if (sting > 0) {
      // The sting hits the card that attacked, past its defence; never a sun (with no such card on the table, nothing).
      const attacker = cardUid ? source.tableau.find((c) => c.uid === cardUid) : undefined;
      if (attacker) {
        log(state, `${target.name}'s veil stings ${source.name}'s ${cardDef(attacker.defId).name} for ${sting}.`);
        strikeCard(state, source, attacker, sting, target, false, '', true);
      }
    }
  }
}

/** Cool a sun. `why` names what cooled it, for the log. */
function cool(state: GameState, p: PlayerState, amount: number, why?: string) {
  const before = p.heat;
  p.heat = Math.max(BALANCE.minHeat, p.heat - amount);
  p.turn.cooled += before - p.heat;
  if (p.heat !== before) log(state, why ? `${why[0].toUpperCase() + why.slice(1)} cools ${p.name}'s sun to ${p.heat} (−${before - p.heat}).` : `${p.name}'s sun cools to ${p.heat} (−${before - p.heat}).`);
}

/** A game's winnerId when it ends with no one left: every sun gone supernova together. */
export const DRAW = '~draw';

/** Whether a finished game was a draw. */
export function isDraw(state: GameState): boolean {
  return state.winnerId === DRAW;
}

function supernova(state: GameState, p: PlayerState, decide = true) {
  if (p.eliminated) return;
  p.eliminated = true;
  log(state, `☀ ${p.name}'s sun goes SUPERNOVA!`);
  // Their tableau burns away with them (without triggering anything).
  p.discard.push(...p.tableau, ...(p.lightspeed ? [p.lightspeed] : []));
  p.tableau = [];
  p.lightspeed = null;
  const alive = state.players.filter((o) => !o.eliminated);
  if (decide && alive.length === 1) {
    state.winnerId = alive[0].id;
    log(state, `${alive[0].name} wins the Blue Loop!`);
  }
}

/** When an effect resolves: as its card is played, at the start of its owner's turn, as it leaves play, as it is recovered, or as a Lightspeed card springs. */
export type Timing = 'play' | 'turn' | 'leave' | 'recover' | 'spring';

interface PlayContext {
  enemyUid?: string;
  /** Heat as it is played (or a Hero's ability): the rival card aimed at (unset: their sun, or a Guard). */
  aimUid?: string;
  allyUid?: string;
  recoverUid?: string;
  /** Shift: the slot the chosen card moves into. */
  shiftTo?: number;
  /** Lightspeed: the enemy who sprang the card (the effects' target). */
  against?: PlayerState;
  /** Lightspeed: what it answers, and the window it was played in. */
  event?: ReactEvent;
  reaction?: Reaction;
}

/** A card in the discard pile a recover effect can take back: of its kind, if it names one, and never a Command card. */
const kindMatches = (c: CardInstance, kind?: CardKind) => returnable(c) && (!kind || defHasRole(cardDef(c.defId), kind));

function resolveEffects(state: GameState, p: PlayerState, card: CardInstance, effects: Effect[] | undefined, when: Timing, ctx: PlayContext = {}) {
  for (const e of effects ?? []) {
    if (state.winnerId || p.eliminated) return;
    if (!conditionMet(p, e.if, state, card)) continue;
    switch (e.type) {
      case 'heat': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount <= 0) break;
        const main = ctx.against && !ctx.against.eliminated ? ctx.against : targetOf(state, p);
        if (!main) break;
        // Heat as a card is played (or a Hero's ability) goes where it was aimed: a rival card, or their sun
        // (Guards draw it in). Dawn heat, and heat from anything else, strikes the sun.
        const aimed = when === 'play' && !ctx.against && main === targetOf(state, p) ? aimedCard(state, p, ctx.aimUid) : null;
        const victim = aimed;
        if (state.winnerId || p.eliminated) break;
        if (victim) {
          strikeCard(state, main, victim, amount, p, !!e.pierce, card.uid, false, true);
          break;
        }
        applyHeat(state, main, amount, p, false, card.uid, e.pierce, `${p.name}'s ${cardDef(card.defId).name}`);
        if (when === 'turn') notePulse(state, p, card, 'heat', main, amount);
        break;
      }
      case 'selfHeat':
        applyHeat(state, p, e.amount, null, false, undefined, false, `${p.name}'s ${cardDef(card.defId).name}`);
        if (when === 'turn') notePulse(state, p, card, 'selfHeat', p, e.amount);
        break;
      case 'cool': {
        const amount = effectAmount(state, p, card, e, when);
        if (amount > 0) {
          cool(state, p, amount, `${p.name}'s ${cardDef(card.defId).name}`);
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
        // (Every other card of yours, whether it grows by itself or not: growth is attack now.)
        for (const other of p.tableau) if (other.uid !== card.uid) grow(p, other);
        break;
      case 'grow':
        grow(p, card, e.max);
        break;
      case 'plant':
        plant(state, p, e.amount);
        break;
      case 'destroy':
      case 'bounce': {
        const t = ctx.against ?? targetOf(state, p);
        const victim = t?.tableau.find((c) => c.uid === ctx.enemyUid && canReach(t, c, e));
        if (!t || !victim) break;
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
        for (const c of hit) {
          if (state.winnerId || t.eliminated || !t.tableau.includes(c)) continue;
          // (Past defence: Erode wears at a card's stability itself. A Hero stands up to it.)
          if (cardDef(c.defId).kind === 'command') continue;
          c.health = Math.max(0, (c.health ?? 0) - e.amount);
          log(state, `${t.name}'s ${cardDef(c.defId).name} loses ${e.amount} stability.`);
          if (c.health <= 0) sweep(state, t, c);
        }
        break;
      }
      case 'restore': {
        const mine = e.self ? p.tableau.filter((c) => c.uid === card.uid) : e.all ? p.tableau.filter((c) => c.uid !== card.uid) : p.tableau.filter((c) => c.uid === ctx.allyUid);
        for (const c of mine) {
          // (Up to its full stability. A Relic stays brittle: nothing steadies it.)
          if (cardDef(c.defId).kind === 'relic') continue;
          mend(state, p, c, e.amount);
        }
        break;
      }
      case 'repair':
        repair(state, p, e.amount);
        break;
      case 'offer': {
        const giver = p.tableau.find((c) => c.uid === ctx.allyUid && c.uid !== card.uid);
        const t = ctx.against ?? targetOf(state, p);
        const victim = t?.tableau.find((c) => c.uid === ctx.enemyUid);
        if (!giver || !t || !victim) break;
        const given = cardAttack(state, p, giver);
        if (given <= 0) break;
        giver.spentAttack = (giver.spentAttack ?? 0) + given;
        const n = given * (e.times ?? 1);
        log(state, `${p.name}'s ${cardDef(giver.defId).name} offers its attack: ${t.name}'s ${cardDef(victim.defId).name} loses ${n} stability.`);
        if (state.winnerId || t.eliminated || !t.tableau.includes(victim)) break;
        victim.health = Math.max(0, (victim.health ?? 0) - n);
        if (victim.health <= 0) sweep(state, t, victim);
        break;
      }
      case 'rootbreak': {
        const root = p.tableau.find((c) => c.uid === ctx.allyUid);
        const t = ctx.against ?? targetOf(state, p);
        const n = (root?.growth ?? 0) * (e.times ?? 1);
        if (!t || n <= 0) break;
        if (e.shields) {
          const broken = Math.min(n, t.shields);
          t.shields -= broken;
          log(state, `${p.name}'s roots split ${t.name}'s shields: ${broken} broken.`);
          break;
        }
        const victim = t.tableau.find((c) => c.uid === ctx.enemyUid);
        if (!victim) break;
        const broken = Math.min(n, cardDefence(t, victim));
        victim.dented = (victim.dented ?? 0) + broken;
        log(state, `${p.name}'s roots split ${t.name}'s ${cardDef(victim.defId).name}: ${broken} defence broken.`);
        break;
      }
      case 'empower': {
        const chosen = p.tableau.find((c) => c.uid === ctx.allyUid && c.uid !== card.uid);
        if (!chosen) break;
        chosen.attackBonus = (chosen.attackBonus ?? 0) + e.amount;
        log(state, `${p.name}'s ${cardDef(chosen.defId).name} is chosen: +${e.amount} attack.`);
        break;
      }
      case 'shift': {
        // (Against a rival: the target, or the enemy who sprang it.)
        const owner = e.enemy ? (ctx.against ?? targetOf(state, p)) : p;
        const moved = owner?.tableau.find((c) => c.uid === (e.enemy ? ctx.enemyUid : ctx.allyUid) && c.slot !== COMMAND_SLOT);
        const to = ctx.shiftTo;
        if (!owner || !moved || to === undefined || to === moved.slot || to < 0 || to >= BALANCE.tableauSlots) break;
        const other = owner.tableau.find((c) => c.slot === to);
        if (other) other.slot = moved.slot;
        moved.slot = to;
        log(state, other ? `${owner.name}'s ${cardDef(moved.defId).name} and ${cardDef(other.defId).name} swap places.` : `${owner.name}'s ${cardDef(moved.defId).name} shifts to slot ${to + 1}.`);
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
      case 'hitBack': {
        const enemy = ctx.against;
        const attacker = enemy?.tableau.find((c) => c.uid === ctx.event?.attackerUid);
        if (!enemy || !attacker) break;
        log(state, `${p.name}'s ${cardDef(card.defId).name} strikes ${enemy.name}'s ${cardDef(attacker.defId).name} for ${e.amount}.`);
        strikeCard(state, enemy, attacker, e.amount, p, false, card.uid, false, true);
        break;
      }
      case 'returnIt': {
        const enemy = ctx.against, r = ctx.reaction;
        if (!enemy || !r) break;
        if (r.pending.kind === 'play') {
          // (The card being played goes back to its owner's hand, its energy spent.)
          r.cancelled = r.returned = true;
          break;
        }
        const pend = r.pending;
        const attacker = enemy.tableau.find((c) => c.uid === pend.attackerUid);
        if (attacker && attacker.slot !== COMMAND_SLOT) {
          log(state, `${p.name}'s ${cardDef(card.defId).name} sends ${enemy.name}'s ${cardDef(attacker.defId).name} back to their hand.`);
          leaveTableau(state, enemy, attacker, 'hand');
        }
        break;
      }
      case 'fortify': {
        const mine = e.who === 'it' ? p.tableau.find((c) => c.uid === ctx.event?.mineUid) : [...p.tableau].sort((a, b) => cardDefence(p, b) - cardDefence(p, a))[0];
        if (!mine) break;
        mine.fortified = (mine.fortified ?? 0) + e.amount;
        const guard = isGuard(p, mine);
        log(state, `${p.name}'s ${cardDef(mine.defId).name} gains ${e.amount} defence and stands Guard until their next dawn.`);
        // (A Guard now, as fortified: the attack, or heat aimed at another card, comes to it.)
        if (guard && ctx.reaction) ctx.reaction.redirect = mine.uid;
        break;
      }
      case 'shiftMine': {
        const mine = p.tableau.find((c) => c.uid === ctx.event?.mineUid && c.slot !== COMMAND_SLOT);
        const to = freeSlots(p).filter((i) => i !== COMMAND_SLOT).sort((a, b) => slotDefence(b) - slotDefence(a))[0];
        if (!mine || to === undefined || slotDefence(to) <= slotDefence(mine.slot)) break;
        mine.slot = to;
        log(state, `${p.name}'s ${cardDef(mine.defId).name} shifts to slot ${to + 1}, out of harm's way.`);
        break;
      }
      case 'strikeBest':
      case 'strikeAll': {
        const t = ctx.against ?? targetOf(state, p);
        if (!t) break;
        const pool = e.type === 'strikeBest' && e.guarded && guards(t).length ? guards(t) : t.tableau;
        const hit = e.type === 'strikeAll' ? [...t.tableau] : [...pool].sort((a, b) => cardAttack(state, t, b) - cardAttack(state, t, a) || (b.health ?? 0) - (a.health ?? 0)).slice(0, 1);
        // (The Frost Line's cold, with no card to strike: their sun.)
        if (e.type === 'strikeBest' && e.guarded && !hit.length) {
          applyHeat(state, t, e.amount, p, false, card.uid, false, `${p.name}'s ${cardDef(card.defId).name}`);
          notePulse(state, p, card, 'heat', t, e.amount);
          break;
        }
        for (const c of hit) {
          if (state.winnerId || t.eliminated || !t.tableau.includes(c)) continue;
          strikeCard(state, t, c, e.amount, p, false, card.uid, false, true);
          notePulse(state, p, card, 'heat', t, e.amount, c.uid);
          // (A sweep's blows land together.)
          const last = state.turnPulses?.[state.turnPulses.length - 1];
          if (last && e.type === 'strikeAll' && c !== hit[0]) last.together = true;
        }
        break;
      }
      case 'devour': {
        const t = ctx.against ?? targetOf(state, p);
        // (Never a Lost Overlord's own body: what must be beaten down is beaten down.)
        const victim = t ? [...t.tableau].filter((c) => c.uid !== t.boss?.leader).sort((a, b) => (a.health ?? 0) - (b.health ?? 0))[0] : undefined;
        if (!t || !victim) break;
        log(state, `${p.name}'s ${cardDef(card.defId).name} devours ${t.name}'s ${cardDef(victim.defId).name}.`);
        notePulse(state, p, card, 'heat', t, 1, victim.uid);
        leaveTableau(state, t, victim);
        break;
      }
      case 'summon': {
        const open = slotsBySafety().filter((i) => freeSlots(p).includes(i) && i !== COMMAND_SLOT).slice(0, e.amount);
        for (const slot of open) place(p, newCard(state, e.defId), slot);
        if (open.length) log(state, `${p.name} calls ${open.length} ${cardDef(e.defId).name}${open.length === 1 ? '' : 's'} into play.`);
        break;
      }
      case 'halt':
        if (ctx.against && ctx.against.playsLeft > 0) {
          ctx.against.playsLeft = 0;
          log(state, `${ctx.against.name} may play no more cards today.`);
        }
        break;
    }
  }
}

/** Mend a card's stability, up to its full stability (its printed value, or more if gear or fusion raised it). */
function mend(state: GameState, p: PlayerState, c: CardInstance, amount: number) {
  const full = Math.max(baseHealth(c.defId), c.maxHealth ?? 0);
  const was = c.health ?? 0;
  c.health = Math.min(full, was + amount);
  if (c.health > was) log(state, `${p.name}'s ${cardDef(c.defId).name} steadies (stability ${c.health}).`);
}

/** A card whose stability ran out fades into its owner's discard pile (shuffled into a new deck once the deck runs out). */
function sweep(state: GameState, owner: PlayerState, card: CardInstance) {
  log(state, `${owner.name}'s ${cardDef(card.defId).name} fades into their discard pile.`);
  leaveTableau(state, owner, card, 'discard');
}

/** A card leaves its tableau for the discard pile (or its owner's hand or deck), triggering its leave effects. */
function leaveTableau(state: GameState, owner: PlayerState, card: CardInstance, to: 'discard' | 'hand' | 'deck' = 'discard') {
  owner.tableau = owner.tableau.filter((c) => c.uid !== card.uid);
  if (owner.boss && state.challenge?.kind === 'mine' && card.defId === 'antimatter_crystal') state.challenge.broken += 1;
  // A relic cache broken open.
  if (card.defId.startsWith('reliquary_obelisk') && !state.vaultOpened) {
    state.vaultOpened = true;
    log(state, `The Reliquary Obelisk breaks open: its relics are free.`);
  }
  // A Lost Overlord beaten down: the battle is won.
  if (owner.boss?.leader === card.uid && !owner.eliminated) {
    log(state, `☠ ${owner.name} falls!`);
    owner.eliminated = true;
    const alive = state.players.filter((o) => !o.eliminated);
    if (alive.length === 1) {
      state.winnerId = alive[0].id;
      log(state, `${alive[0].name} wins the Blue Loop!`);
    }
  }
  // Wear on the slot's own defence stays in the slot (the card's own plating goes with it).
  const wear = Math.min(card.dented ?? 0, slotDefence(card.slot));
  if (wear > 0 && card.slot !== undefined) (owner.slotWear ??= {})[card.slot] = wear;
  card.growth = undefined;
  card.slot = undefined;
  delete card.boons;
  delete card.dented;
  delete card.stability;
  delete card.maxHealth;
  card.health = undefined;
  card.choice = undefined;
  card.spent = undefined;
  // (A token is simply gone.)
  if (cardDef(card.defId).token) {
    /* nothing to keep */
  } else if (to === 'deck') owner.deck.splice(randomInt(state, owner.deck.length + 1), 0, card);
  else if (to === 'hand') owner.hand.push(card);
  else owner.discard.push(card);
  resolveEffects(state, owner, card, cardDef(card.defId).onLeave, 'leave');
  // Its Fusion cards go with it (and their leave effects fire too).
  const fused = card.fused ?? [];
  delete card.fused;
  for (const f of fused) {
    owner.discard.push(f);
    if (!state.winnerId && !owner.eliminated) resolveEffects(state, owner, card, cardDef(f.defId).onLeave, 'leave');
  }
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
 * Regional instability: every living sun takes the same heat at once, past shields. If that finishes
 * every sun, they all go together: a draw.
 */
function regionalInstability(state: GameState, roundStarter: PlayerState) {
  const n = instabilityHeat(state);
  if (n <= 0) return;
  const living = state.players.filter((x) => !x.eliminated);
  log(state, `Regional instability heats every sun by ${n}.`);
  for (const x of living) x.heat = Math.max(BALANCE.minHeat, x.heat + n);
  const over = living.filter((x) => x.heat >= supernovaThreshold(x));
  if (over.length && over.length === living.length) {
    // (All at once: none of them is left standing to win.)
    for (const x of over) supernova(state, x, false);
    state.winnerId = DRAW;
    log(state, 'Every sun goes supernova together: a draw.');
  } else for (const x of over) supernova(state, x);
  // Every sun's pulse lands together, showing the suns as they now stand.
  living.forEach((x, i) => {
    notePulse(state, roundStarter, null, 'unstable', x, n);
    const last = state.turnPulses?.[state.turnPulses.length - 1];
    if (last && i > 0) last.together = true;
  });
  // On some battlefields the wave burns through the cards too.
  for (const x of living) waveHitsCards(state, x, roundStarter);
}

/**
 * A heat wave from the Stellari reaching a side whose battlefield lets it burn their cards (waveCardHeat): every
 * card of theirs but a Hero takes that much, as heat aimed at it. Its blows land with the wave (together).
 */
function waveHitsCards(state: GameState, x: PlayerState, source: PlayerState) {
  const n = x.modifiers?.waveCardHeat ?? 0;
  if (n <= 0 || state.winnerId || x.eliminated) return;
  const hit = x.tableau.filter((c) => cardDef(c.defId).kind !== 'command');
  if (!hit.length) return;
  log(state, `The heat wave sears ${x.name}'s cards.`);
  for (const c of hit) {
    if (state.winnerId || x.eliminated || !x.tableau.includes(c)) continue;
    strikeCard(state, x, c, n, x, false, '', false, true);
    notePulse(state, source, null, 'unstable', x, n, c.uid);
    const last = state.turnPulses?.[state.turnPulses.length - 1];
    if (last) last.together = true;
  }
}

/**
 * A card grows by 1, up to the highest limit its growing effects give (its own and its Fusion cards'; a
 * lower limit never shrinks it). A Catalyst that grows makes your other growing cards grow too.
 */
/**
 * A card grows 1. Its own Grow effects stop at their limit (`max`); growth from elsewhere (another card making
 * your others grow, a Catalyst) reaches any card of yours but a Hero, up to `BALANCE.maxGrowth`.
 */
function grow(p: PlayerState, card: CardInstance, max?: number, spread = true) {
  if (cardDef(card.defId).kind === 'command') return;
  const limit = max ?? BALANCE.maxGrowth;
  if ((card.growth ?? 0) >= limit) return;
  card.growth = (card.growth ?? 0) + 1;
  if (BALANCE.growthHealth) card.health = (card.health ?? 0) + BALANCE.growthHealth;
  if (spread && cardPassives(card).some((x) => x.type === 'catalyst')) for (const other of p.tableau) if (other.uid !== card.uid) grow(p, other, undefined, false);
}

/** Plant Saplings in your empty slots, the least defended first. */
function plant(state: GameState, p: PlayerState, n: number) {
  let planted = 0;
  for (let i = 0; i < n; i++) {
    const open = freeSlots(p);
    if (!open.length) break;
    const slot = [...open].sort((a, b) => slotDefence(a) - slotDefence(b) || a - b)[0];
    place(p, newCard(state, 'sapling'), slot);
    planted++;
  }
  if (planted) log(state, `${p.name} plants ${planted} Sapling${planted === 1 ? '' : 's'}.`);
}

/** At its owner's dawn, worn defence mends by `defenceMend` (now 0: defence is a wall worn down over the game, mended only by Repair). */
function mendDefences(state: GameState, p: PlayerState) {
  if (BALANCE.defenceMend <= 0) return;
  for (const c of p.tableau) {
    if (!c.dented) continue;
    const by = Math.min(c.dented, BALANCE.defenceMend);
    c.dented -= by;
    if (!c.dented) delete c.dented;
    log(state, `${p.name}'s ${cardDef(c.defId).name} mends ${by} defence (defence ${cardDefence(p, c)}).`);
  }
  for (const k of Object.keys(p.slotWear ?? {})) {
    const slot = Number(k);
    const left = p.slotWear![slot] - BALANCE.defenceMend;
    if (left > 0) p.slotWear![slot] = left;
    else delete p.slotWear![slot];
  }
}

/** Repair: mend this much worn defence on your side, the most worn cards first, then empty slots. */
function repair(state: GameState, p: PlayerState, amount: number) {
  let left = amount;
  while (left > 0) {
    const worst = [...p.tableau].filter((c) => (c.dented ?? 0) > 0).sort((a, b) => (b.dented ?? 0) - (a.dented ?? 0))[0];
    if (!worst) break;
    worst.dented! -= 1;
    if (!worst.dented) delete worst.dented;
    left -= 1;
  }
  for (const k of Object.keys(p.slotWear ?? {})) {
    if (left <= 0) break;
    const slot = Number(k);
    const by = Math.min(left, p.slotWear![slot]);
    p.slotWear![slot] -= by;
    left -= by;
    if (!p.slotWear![slot]) delete p.slotWear![slot];
  }
  if (left < amount) log(state, `${p.name} repairs ${amount - left} defence.`);
}

function startTurn(state: GameState) {
  const p = activePlayer(state);
  // (After a dusk, its pulses stay: the replay plays the dusk, then this dawn.)
  if (!state.keepPulses) state.turnPulses = [];
  delete state.keepPulses;
  p.turnsTaken += 1;
  // Banked energy is gone at their own dawn (it was for answering the enemy's day), and so is defence a
  // Lightspeed card lent their cards.
  delete p.banked;
  // Dawn breaks: every card of theirs is ready to act again.
  for (const c of p.tableau) {
    delete c.fortified;
    delete c.dimmed;
    delete c.fresh;
    delete c.spentAttack;
  }
  p.turn = emptyTurn();
  log(state, `— Day ${state.turnNumber}: ${p.name}.`);
  // Worn defence mends slowly: 1 a day on each card and empty slot (Sturdy adds defence, not mending: a fused stack of Sturdy cards would wall up for good).
  mendDefences(state, p);

  // Shields fade, unless Deep Current holds them.
  const keep = passives(p).some(({ passive }) => passive.type === 'keepShields');
  // (A campaign ship's shields are up as the battle begins: they last its first day.)
  if (!(state.campaign && p.turnsTaken === 1)) p.shields = keep ? Math.min(p.shields, BALANCE.maxKeptShields) : 0;

  // The planets move on a day (your first day starts at the dead planet).
  if (p.turnsTaken > 1) {
    const before = currentPlanet(p);
    p.orbit = (p.orbit + 1) % ORBIT_LENGTH;
    if (currentPlanet(p) !== before) log(state, `The ${currentPlanet(p)} planet swings round to face ${p.name}'s sun.`);
  }
  const abundance = currentPlanet(p, state) === 'abundant' ? BALANCE.abundantDraw + (p.modifiers?.abundantDraw ?? 0) : 0;
  // Draw (your opening hand covers your first day).
  if (p.turnsTaken > 1) drawCards(state, p, BALANCE.drawPerTurn + (p.modifiers?.extraDraw ?? 0) + abundance);
  if (state.winnerId) return;
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
    applyHeat(state, p, m.heatPerTurn, null, false, undefined, false, 'this battlefield');
    notePulse(state, p, null, 'unstable', p, m.heatPerTurn);
    waveHitsCards(state, p, p);
  }
  if (m?.coolPerTurn) {
    cool(state, p, m.coolPerTurn, 'this battlefield');
    notePulse(state, p, null, 'cool', p, m.coolPerTurn);
  }
  if (m?.shieldPerTurn) {
    p.shields += m.shieldPerTurn;
    notePulse(state, p, null, 'shield', p, m.shieldPerTurn);
  }
  if (fieldActive(state, 'solarStorm')) {
    log(state, `Solar Storm batters ${p.name}.`);
    applyHeat(state, p, 1, null, false, undefined, false, 'Solar Storm');
    notePulse(state, p, activeGlobal(state)?.card ?? null, 'unstable', p, 1);
  }
  if (fieldActive(state, 'iceAge')) {
    cool(state, p, 1, 'Ice Age');
    notePulse(state, p, activeGlobal(state)?.card ?? null, 'cool', p, 1);
  }
  dawn(state, p);
  // A challenge's clock and its waves (a secret system's own rules: see GameState.challenge).
  if (p.boss && state.challenge && !state.winnerId) challengeDay(state, p);
  // A Lost Overlord takes its one great action.
  if (p.boss && !state.winnerId && !p.eliminated) bossAct(state, p);
}

/** A player's dawn: their tableau's dawn effects, cards fading, and the day's energy. */
function dawn(state: GameState, p: PlayerState) {
  // Your tableau's dawn effects, left to right. A Recall or Shift of your own waits on you: you choose which card,
  // first thing in your day (or let it be). (A relic's blow at any target, from the day's draw, still waits.)
  p.dawnChoices = p.dawnChoices?.filter((c) => c.kind === 'aim');
  if (!p.dawnChoices?.length) delete p.dawnChoices;
  for (const card of [...p.tableau]) {
    if (state.winnerId || p.eliminated) break;
    if (!p.tableau.includes(card)) continue;
    const effects = dawnEffects(card, p, state);
    const waits = (e: Effect) => (e.type === 'shift' && !e.enemy) || e.type === 'recall';
    resolveEffects(state, p, card, effects.filter((e) => !waits(e)), 'turn');
    // (Only where there is a card it could take: another of yours to return, or any of yours, not your Hero, to move.)
    for (const e of effects.filter(waits)) {
      const kind = e.type === 'recall' ? 'recall' : 'shift';
      const could = kind === 'recall' ? p.tableau.some((c) => c.uid !== card.uid && returnable(c)) : p.tableau.some((c) => c.slot !== COMMAND_SLOT);
      if (could) (p.dawnChoices ??= []).push({ uid: card.uid, kind });
    }
  }
  // Relics' dawns: a paradise planet's renewal, a sear, a repair, a card given, and a Recall or Shift that waits on its
  // holder as a card's does.
  // (The dead planet, as the skill tree may have it: cooling, or a paradise.)
  const deadFacing = currentPlanet(p, state) === 'dead' && !planetsEaten(state, p);
  const paradise = relicN(p.relics, 'paradise') + (p.modifiers?.paradise ?? 0);
  if (paradise && deadFacing) {
    log(state, `The paradise planet faces ${p.name}'s sun: renew ${paradise}.`);
    for (const c of p.tableau) if (cardDef(c.defId).kind !== 'relic') mend(state, p, c, paradise);
  }
  const deadCool = p.modifiers?.deadCool ?? 0;
  if (deadCool && deadFacing) {
    cool(state, p, deadCool, 'the cold dead planet');
    notePulse(state, p, null, 'cool', p, deadCool);
  }
  relicSear(state, p);
  if (state.winnerId || p.eliminated) return;
  const mendBy = relicN(p.relics, 'mend');
  if (mendBy) {
    log(state, `${p.name}'s ${relicOf(p.relics, 'mend')!.name}: dawn repair ${mendBy}.`);
    repair(state, p, mendBy);
  }
  const gift = relicN(p.relics, 'gift');
  const given = gift ? giftCard(state, p, gift) : undefined;
  if (given) {
    p.hand.push(newCard(state, given));
    log(state, `${p.name}'s ${relicOf(p.relics, 'gift')!.name} gives them ${cardDef(given).name}.`);
  }
  for (const kind of ['recall', 'shift'] as const) {
    const relic = relicOf(p.relics, kind);
    const could = kind === 'recall' ? p.tableau.some(returnable) : p.tableau.some((c) => c.slot !== COMMAND_SLOT);
    if (relic && could) (p.dawnChoices ??= []).push({ uid: `relic:${relic.name}`, kind, relic: relic.name });
  }
  // (Cards no longer fade with the days: they stand until beaten down or removed.) Anchor mends its neighbours.
  for (const card of p.tableau) if (anchored(p, card) && cardDef(card.defId).kind !== 'relic') mend(state, p, card, 1);
  p.playsLeft = playsAllowed(state, p) + (p.turn.dawnEnergy ?? 0);
  p.turn.energyTotal = p.playsLeft;
  p.turn.energyBase = Math.min(p.playsLeft, Math.min(p.turnsTaken, BALANCE.maxPlays));
  if (p.eliminated) passOn(state);
}

/** A player's dusk: their tableau's dusk effects, left to right, as their day ends. */
function dusk(state: GameState, p: PlayerState) {
  // (Only cards whose dusk will do something: a Vigil card that attacked today sits it out.)
  const cards = p.tableau.filter((c) => !c.fresh && duskEffects(c).some((e) => conditionMet(p, e.if, state, c)));
  if (!cards.length) return;
  log(state, `— Dusk: ${p.name}.`);
  notePulse(state, p, null, 'start', p, 0);
  for (const card of cards) {
    if (state.winnerId || p.eliminated) break;
    // (A card played today rests: its dusk first works the dusk after it lands. Attacking or acting doesn't stop it.)
    if (!p.tableau.includes(card) || card.fresh) continue;
    resolveEffects(state, p, card, duskEffects(card), 'turn');
  }
}

/**
 * After dusk, a hand over the limit is discarded down to it: the cards the player picked, then (if still over)
 * the costliest of the rest (a Hero kept while none leads their tableau).
 */
function trimHand(state: GameState, p: PlayerState, picked: string[] = []) {
  const over = p.hand.length - BALANCE.maxHand;
  if (over <= 0) return;
  const chosen = [...new Set(picked)].map((uid) => p.hand.find((c) => c.uid === uid)).filter((c): c is CardInstance => !!c).slice(0, over);
  const keepHero = !commandCard(p);
  const rest = p.hand
    .filter((c) => !chosen.includes(c))
    .sort((a, b) => Number(keepHero && cardDef(a.defId).kind === 'command') - Number(keepHero && cardDef(b.defId).kind === 'command') || cardCost(b.defId) - cardCost(a.defId));
  const out = [...chosen, ...rest.slice(0, over - chosen.length)];
  p.hand = p.hand.filter((c) => !out.includes(c));
  p.discard.push(...out);
  log(state, `${p.name} holds more than ${BALANCE.maxHand} cards and discards ${out.map((c) => cardDef(c.defId).name).join(', ')}.`);
}

/** A card's dusk effects (its own and its Fusion cards'). */
export function duskEffects(card: CardInstance): Effect[] {
  return [...(cardDef(card.defId).onDusk ?? []), ...extras(card).flatMap((d) => d.onDusk ?? [])];
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

/**
 * A challenge's day, at the dawn of the side that holds it: the challenger's days run down (all spent, the
 * challenge is over and they have come through it); then what it calls up fills its free slots.
 */
function challengeDay(state: GameState, p: PlayerState) {
  const c = state.challenge!;
  if (c.days !== undefined) {
    c.days -= 1;
    if (c.days <= 0) {
      const them = state.players.find((x) => x !== p && !x.eliminated);
      log(state, c.kind === 'mine' ? `The mine seals itself: ${c.broken} crystal${c.broken === 1 ? '' : 's'} broken.` : `${them?.name ?? 'The challenger'} holds the line: the storm is spent.`);
      p.eliminated = true;
      state.winnerId = them?.id ?? null;
      return;
    }
  }
  if (!c.spawn?.length) return;
  const open = slotsBySafety().filter((i) => freeSlots(p).includes(i) && i !== COMMAND_SLOT).slice(0, c.per ?? 99);
  open.forEach((slot, i) => place(p, newCard(state, c.spawn![i % c.spawn!.length]), slot));
  if (open.length) log(state, c.kind === 'mine' ? `${open.length} more crystal${open.length === 1 ? '' : 's'} grow${open.length === 1 ? 's' : ''} in the mine.` : `A wave: ${open.length} more come out of the cold.`);
}

/** A Lost Overlord's parts that act, in the order they take their turns: left to right, the Overlord itself last. */
export function bossOrder(p: PlayerState): CardInstance[] {
  return p.tableau.filter((c) => cardDef(c.defId).bossAction).sort((a, b) => (a.slot === COMMAND_SLOT ? 99 : a.slot ?? 0) - (b.slot === COMMAND_SLOT ? 99 : b.slot ?? 0));
}

/** A Lost Overlord's next action: its part, and what it is (none if the part is gone: it will stagger). */
export function bossIntent(p: PlayerState): { card: CardInstance; name: string } | null {
  const card = p.boss?.intent ? p.tableau.find((c) => c.uid === p.boss!.intent) : undefined;
  const a = card ? cardDef(card.defId).bossAction : undefined;
  return card && a ? { card, name: a.name } : null;
}

/**
 * A Lost Overlord's day: the part whose turn it is takes its action (if it is still there: if not, the Overlord
 * staggers, and the day is lost to it); then the next part's turn is shown.
 */
function bossAct(state: GameState, p: PlayerState) {
  const intent = bossIntent(p);
  const order = bossOrder(p);
  if (intent) {
    const a = cardDef(intent.card.defId).bossAction!;
    log(state, `⚔ ${p.name}: ${a.name}!`);
    resolveEffects(state, p, intent.card, a.effects, 'turn');
  } else log(state, `${p.name} reaches for a part it no longer has, and staggers.`);
  if (state.winnerId || p.eliminated || !p.boss) return;
  // The next to act: the part after this one, in turn (its place in the order as it was, if it has gone).
  const now = bossOrder(p);
  if (!now.length) {
    p.boss.intent = undefined;
    return;
  }
  const was = order.findIndex((c) => c.uid === p.boss!.intent);
  const after = was >= 0 ? order.slice(was + 1).concat(order.slice(0, was + 1)) : order;
  p.boss.intent = (after.find((c) => now.includes(c)) ?? now[0]).uid;
}

/** A player by id. */
function playerById(state: GameState, id: string): PlayerState {
  return state.players.find((x) => x.id === id)!;
}

/** Whether a Lightspeed trigger answers what an enemy is doing. */
export function triggerMatches(t: LightspeedTrigger, ev: ReactEvent): boolean {
  if (t.on !== ev.on) return false;
  if (t.on !== 'enemyPlays' || !t.kind) return true;
  return ev.faceDown ? t.kind === 'lightspeed' : !!ev.defId && defHasRole(cardDef(ev.defId), t.kind);
}

/** The energy a Lightspeed card costs played from hand in answer (as set face down: a Lightspeed guard's +1). */
export function reactCost(defId: string): number {
  return playCost(defId, true);
}

/**
 * What a player could answer these events with: their face-down card, if it answers one (a guard needs a free
 * slot to land in), and the Lightspeed cards in their hand that do and that their banked energy pays for (one
 * from hand per enemy day). Events about another player's card are not theirs to answer.
 */
export function reactOptions(state: GameState, o: PlayerState, events: ReactEvent[]): { slot: boolean; hand: string[] } {
  const none = { slot: false, hand: [] as string[] };
  if (o.eliminated) return none;
  const mine = events.filter((ev) => !ev.mineUid || o.tableau.some((c) => c.uid === ev.mineUid));
  if (!mine.length) return none;
  const answers = (defId: string) => {
    const ls = cardDef(defId).lightspeed;
    if (!ls || !mine.some((ev) => triggerMatches(ls.trigger, ev))) return false;
    return !ls.deploy || freeSlots(o).some((i) => i !== COMMAND_SLOT);
  };
  const slot = !!o.lightspeed && answers(o.lightspeed.defId);
  const hand = o.reactedDay === state.turnNumber ? [] : o.hand.filter((c) => !!cardDef(c.defId).lightspeed && answers(c.defId) && reactCost(c.defId) <= (o.banked ?? 0)).map((c) => c.uid);
  return { slot, hand };
}

/** Whether any rival of the mover could answer these events. */
function wouldAnswer(state: GameState, mover: PlayerState, events: ReactEvent[]): boolean {
  return othersInOrder(state, mover).some((o) => {
    const k = reactOptions(state, o, events);
    return k.slot || k.hand.length > 0;
  });
}

/** Open a reaction window for the first rival who could answer: the move waits on them. True if one opened. */
function openReaction(state: GameState, mover: PlayerState, events: ReactEvent[], pending: Reaction['pending']): boolean {
  for (const o of othersInOrder(state, mover)) {
    const k = reactOptions(state, o, events);
    if (!k.slot && !k.hand.length) continue;
    state.reaction = { playerId: o.id, enemyId: mover.id, events, pending, slot: k.slot, hand: k.hand };
    return true;
  }
  return false;
}

/**
 * The reacting player answers: springs their face-down card, plays one from hand (paid from banked energy), or
 * lets the move go on. An answer resolves at once, before the move; then the move goes on (or not, if it was
 * cancelled), unless they could still answer it another way (one face down and one from hand, at most).
 */
/** Set while answerShown plays an answer: the move it answered waits (as it is seen, before it goes on). */
let holdResume = false;

/**
 * A Lightspeed answer as it lands, before the move it answered goes on: what the board looks like while the answer
 * is read (its guard landed, its shields up), ahead of the attack that may still come.
 */
export function answerShown(prev: GameState, action: Extract<Action, { type: 'react' }>): GameState {
  holdResume = true;
  try {
    return applyAction(prev, action);
  } finally {
    holdResume = false;
  }
}

function react(state: GameState, action: Extract<Action, { type: 'react' }>) {
  const r = state.reaction;
  if (!r) throw new GameError('There is nothing to answer.');
  const o = playerById(state, r.playerId);
  const enemy = playerById(state, r.enemyId);
  let card: CardInstance | undefined;
  let fromHand = false;
  if (action.slot) {
    if (!r.slot || !o.lightspeed) throw new GameError('Your face-down card does not answer this.');
    card = o.lightspeed;
    o.lightspeed = null;
  } else if (action.cardUid) {
    if (!r.hand.includes(action.cardUid)) throw new GameError('That card does not answer this.');
    card = o.hand.find((c) => c.uid === action.cardUid)!;
    const cost = reactCost(card.defId);
    if ((o.banked ?? 0) < cost) throw new GameError(`It costs ${cost} banked energy.`);
    o.banked = (o.banked ?? 0) - cost;
    o.hand = o.hand.filter((c) => c !== card);
    o.reactedDay = state.turnNumber;
    fromHand = true;
  }
  if (!card) {
    delete state.reaction;
    resume(state, r);
    return;
  }
  const def = cardDef(card.defId);
  const ls = def.lightspeed!;
  const ev = r.events.find((x) => triggerMatches(ls.trigger, x)) ?? r.events[0];
  const cause = ev.defId ?? (ev.attackerUid ? enemy.tableau.find((c) => c.uid === ev.attackerUid)?.defId : undefined);
  log(state, `⚡ Lightspeed! ${o.name} ${fromHand ? 'plays' : 'springs'} ${def.name}${cause ? ` in answer to ${enemy.name}'s ${cardDef(cause).name}` : ''}.`);
  (state.sprung ??= []).push({ ownerId: o.id, defId: card.defId, against: cause, enemyId: enemy.id, trigger: ls.trigger.on });
  if (ls.deploy) {
    // A Lightspeed guard lands in the safest free slot, and the attack comes to it.
    const slot = slotsBySafety().find((i) => freeSlots(o).includes(i) && i !== COMMAND_SLOT)!;
    place(o, card, slot);
    r.redirect = card.uid;
    log(state, `${o.name}'s ${def.name} lands in their tableau, and takes the attack.`);
  } else o.discard.push(card);
  resolveEffects(state, o, card, ls.effects, 'spring', { against: enemy, event: ev, reaction: r });
  if (ls.counter) r.cancelled = true;
  if (state.winnerId || enemy.eliminated) {
    delete state.reaction;
    if (enemy.eliminated && activePlayer(state) === enemy) passOn(state);
    return;
  }
  if (r.cancelled) {
    delete state.reaction;
    cancelPending(state, enemy, r);
    return;
  }
  // (Another answer still open to them: the face-down card, or one from hand.)
  const more = reactOptions(state, o, r.events);
  if (more.slot || more.hand.length) {
    r.slot = more.slot;
    r.hand = more.hand;
    return;
  }
  delete state.reaction;
  if (!holdResume) resume(state, r);
}

/** An answer cancelled the move: a card played goes to its owner's discard pile (or back to hand), its energy spent; an attack is called off. */
function cancelPending(state: GameState, enemy: PlayerState, r: Reaction) {
  if (r.pending.kind === 'play') {
    const { action } = r.pending;
    const card = enemy.hand.find((c) => c.uid === action.cardUid);
    if (!card) return;
    const def = cardDef(card.defId);
    enemy.playsLeft = Math.max(0, enemy.playsLeft - playCost(def.id, def.kind === 'lightspeed' || !!action.faceDown));
    enemy.turn.cardsPlayed += 1;
    if (r.returned) {
      log(state, `${enemy.name}'s ${def.name} goes back to their hand.`);
      return;
    }
    enemy.hand = enemy.hand.filter((c) => c !== card);
    enemy.discard.push(card);
    log(state, `${action.faceDown || def.kind === 'lightspeed' ? 'The face-down card' : def.name} is cancelled.`);
    return;
  }
  const attacker = enemy.tableau.find((c) => c.uid === (r.pending as { attackerUid: string }).attackerUid);
  if (attacker) attacker.dimmed = true;
  log(state, `${enemy.name}'s attack is called off.`);
}

/**
 * The move goes on after the answers. What it aimed at may have moved, gone or been outguarded since: an attack
 * (or heat aimed at a card) goes to a guard that landed or rose to Guard; a play with nothing left to aim at
 * fizzles (its energy spent); an attacker sent away never attacks.
 */
function resume(state: GameState, r: Reaction) {
  const enemy = playerById(state, r.enemyId);
  const o = playerById(state, r.playerId);
  const guardTo = () => {
    const pick = r.redirect && o.tableau.some((c) => c.uid === r.redirect && isGuard(o, c)) ? r.redirect : [...guards(o)].sort((a, b) => cardDefence(o, b) - cardDefence(o, a))[0]?.uid;
    return pick;
  };
  if (r.pending.kind === 'attack') {
    const attacker = enemy.tableau.find((c) => c.uid === (r.pending as { attackerUid: string }).attackerUid);
    if (!attacker) {
      log(state, `${enemy.name}'s attack never comes.`);
      return;
    }
    let target = r.pending.targetUid;
    if (r.redirect && o.tableau.some((c) => c.uid === r.redirect)) target = r.redirect;
    if (attackProblem(state, enemy, attacker.uid, target)) target = guardTo() ?? null;
    if (target !== null && !o.tableau.some((c) => c.uid === target)) target = null;
    if (attackProblem(state, enemy, attacker.uid, target)) {
      log(state, `${enemy.name}'s ${cardDef(attacker.defId).name} finds nothing to strike.`);
      attacker.dimmed = true;
      return;
    }
    attack(state, enemy, attacker, target);
    if (enemy.eliminated) passOn(state);
    return;
  }
  const action = { ...r.pending.action };
  // Heat aimed at a card goes where a Lightspeed answer redirected it; its card gone, to the sun.
  if (action.aimUid) {
    const aimable = aimChoices(state, enemy).cards;
    if (r.redirect && aimable.some((c) => c.uid === r.redirect)) action.aimUid = r.redirect;
    else if (!aimable.some((c) => c.uid === action.aimUid)) delete action.aimUid;
  }
  const trial = structuredClone(state);
  try {
    playCard(trial, playerById(trial, enemy.id), action, true);
    Object.assign(state, trial);
  } catch (err) {
    if (!(err instanceof GameError)) throw err;
    // (What it aimed at is gone: the card fizzles, its energy spent.)
    const card = enemy.hand.find((c) => c.uid === action.cardUid);
    if (card) {
      const def = cardDef(card.defId);
      enemy.hand = enemy.hand.filter((c) => c !== card);
      enemy.discard.push(card);
      enemy.playsLeft = Math.max(0, enemy.playsLeft - playCost(def.id, def.kind === 'lightspeed' || !!action.faceDown));
      log(state, `${enemy.name}'s ${def.name} fizzles: what it aimed at is out of reach.`);
    }
  }
  if (enemy.eliminated) passOn(state);
}

function playCard(state: GameState, p: PlayerState, action: Extract<Action, { type: 'playCard' }>, answered = false) {
  const card = p.hand.find((c) => c.uid === action.cardUid);
  if (!card) throw new GameError('That card is not in your hand.');
  const def: CardDef = cardDef(card.defId);
  // A Lightspeed guard can be set face down instead, for 1 more energy.
  const lightspeed = def.kind === 'lightspeed' || (!!action.faceDown && dualLightspeed(def.id));
  // A rival holding a Lightspeed card that answers this play may answer it first: the play is checked (tried on
  // a copy), then waits on them (see Reaction).
  if (!answered && !state.noReactions) {
    const events: ReactEvent[] = [lightspeed ? { on: 'enemyPlays', faceDown: true } : { on: 'enemyPlays', defId: def.id }];
    const aimed = lightspeed ? undefined : action.enemyUid ?? action.aimUid;
    if (aimed) events.push({ on: 'targeted', defId: def.id, mineUid: aimed });
    if (wouldAnswer(state, p, events)) {
      const trial = structuredClone(state);
      playCard(trial, activePlayer(trial), action, true);
      if (openReaction(state, p, events, { kind: 'play', action })) return;
    }
  }
  const cost = playCost(def.id, lightspeed);
  if (p.playsLeft < cost) throw new GameError(p.playsLeft <= 0 ? 'You have no energy left today.' : `${def.name} costs ${cost} energy: you have ${p.playsLeft} left today.`);
  if (lightspeed && !canSetLightspeed(p)) throw new GameError('You already have a Lightspeed card face down.');
  // Consume: one of your other cards in play is given up first (your choice; unchosen, the weakest), and leaves
  // play as any card does. (A failed play throws, and the whole move is undone.)
  if (def.consume && !lightspeed) {
    const chosen = action.sacrificeUid ? consumable(p).find((c) => c.uid === action.sacrificeUid) : undefined;
    if (action.sacrificeUid && !chosen) throw new GameError('Consume one of your own cards in play (not your Hero).');
    const victim = chosen ?? sacrificeOf(p);
    if (!victim) throw new GameError(`${def.name} needs another of your cards in play to consume.`);
    log(state, `${p.name}'s ${def.name} consumes ${cardDef(victim.defId).name}.`);
    leaveTableau(state, p, victim);
    if (state.winnerId || p.eliminated) return;
  }
  // A Fusion card is played like any other card, into a slot, or (given a host) fused onto a card in play.
  const fusing = !!def.fusion && !lightspeed && action.hostUid !== undefined;
  // Into a full tableau, a card replaces one of yours (your choice; unchosen, the weakest), which leaves play
  // as any card does; the new card takes its slot.
  if (!lightspeed && !fusing && replaces(p, def.id)) {
    const chosen = action.sacrificeUid ? consumable(p).find((c) => c.uid === action.sacrificeUid) : undefined;
    if (action.sacrificeUid && !chosen) throw new GameError('Replace one of your own cards in play (not your Hero).');
    const old = chosen ?? sacrificeOf(p)!;
    log(state, `${p.name}'s ${def.name} replaces ${cardDef(old.defId).name}.`);
    if (action.slot === undefined || action.slot === old.slot) action = { ...action, slot: old.slot };
    leaveTableau(state, p, old);
    if (state.winnerId || p.eliminated) return;
  }
  const slotted = inSlots(def.id) && !lightspeed && !fusing;

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
  const free = freeSlots(p);
  if (slotted && !swap && action.slot !== undefined && !free.includes(action.slot)) throw new GameError('Choose an empty slot.');
  const allies = allyChoices(p, def.id);
  if (needsAlly(def.id) && !allies.length) throw new GameError(allyEffectKind(def.id) === 'offer' ? 'It needs an undimmed allied card with attack.' : 'It needs a card of yours that has grown.');
  if (allies.length > 0 && !allies.some((c) => c.uid === action.allyUid)) throw new GameError('Choose a card of yours.');
  const host = fusing ? fusionHosts(p).find((c) => c.uid === action.hostUid) : undefined;
  if (fusing && !host) throw new GameError('Choose a card of yours in play to fuse it onto.');
  const recovers = recoverChoices(p, def.id);
  if (recovers.length > 0 && !recovers.some((c) => c.uid === action.recoverUid)) throw new GameError('Choose a card in your discard pile to recover.');

  // Shift: the card chosen moves into another slot of its tableau.
  const shifts = shiftEffect(def.id);
  const shifted = shifts === 'rival' ? target?.tableau.find((c) => c.uid === action.enemyUid) : shifts === 'mine' ? p.tableau.find((c) => c.uid === action.allyUid) : undefined;
  if (shifted && (action.shiftTo === undefined || !shiftSlots(shifted).includes(action.shiftTo))) throw new GameError('Choose a slot to move it into.');

  if (action.aimUid && aimable(def.id) && !aimChoices(state, p).cards.some((c) => c.uid === action.aimUid)) throw new GameError("Aim at a card in your rival's tableau, or at their sun.");

  p.hand = p.hand.filter((c) => c.uid !== card.uid);
  // An X card spends all the energy left; its effects count how much.
  const spend = def.spendAll ? p.playsLeft : cost;
  if (def.spendAll) card.spent = spend;
  p.playsLeft -= spend;
  p.turn.cardsPlayed += 1;
  log(state, lightspeed ? `${p.name} sets a card face down at lightspeed.` : `${p.name} plays ${def.name}.`);
  // A Harvest relic: the third card played in a day draws.
  const harvest = relicN(p.relics, 'harvest');
  if (harvest && p.turn.cardsPlayed === 3) {
    log(state, `${p.name}'s ${relicOf(p.relics, 'harvest')!.name}: draw ${harvest}.`);
    drawCards(state, p, harvest);
    if (state.winnerId || p.eliminated) return;
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
  // A Fusion card fuses onto its host, which gains its Fusion bonus (and only that): any of it for now resolves.
  if (host) {
    (host.fused ??= []).push(card);
    log(state, `${p.name} fuses ${def.name} onto ${cardDef(host.defId).name}.`);
    resolveEffects(state, p, host, fusedDef(def.id).onPlay, 'play', action);
    return;
  }
  // A card that does nothing once played resolves and goes straight to the discard pile.
  if (isBurst(def)) {
    resolveEffects(state, p, card, def.onPlay, 'play', action);
    if (!p.discard.includes(card)) p.discard.push(card);
    return;
  }
  // The chosen slot, or else the safest one free.
  const open = freeSlots(p);
  const slot = def.kind === 'command' ? COMMAND_SLOT : action.slot !== undefined && open.includes(action.slot) ? action.slot : slotsBySafety().find((i) => open.includes(i));
  if (slot === undefined) {
    p.discard.push(card);
    return;
  }
  place(p, card, slot);
  // A card comes into play dimmed: it can first act (attack, or a Hero's ability) on its owner's next day.
  // (Darkspeed, the Nyxari: their cards that can act, attackers and Heroes, come in ready to.)
  if (!hasDarkspeed(cardDef(card.defId))) card.dimmed = card.fresh = true;
  if (choices.length) {
    card.choice = action.choice;
    log(state, `${p.name} chooses: ${choiceLabel(action.choice!)}.`);
  }
  resolveEffects(state, p, card, def.onPlay, 'play', action);
  // A campaign hero's boons that act as the card is played.
  for (const b of card.boons ?? []) if (!state.winnerId && !p.eliminated && cardDef(b).onPlay) resolveEffects(state, p, card, cardDef(b).onPlay, 'play');
}

/** A choice as words, for the log ("heat 2", "draw 1"). */
export function choiceLabel(id: string): string {
  const m = /^([a-z]+)(\d+)$/.exec(id);
  return m ? `${m[1]} ${m[2]}` : id;
}

/** Apply an action and return the new state (the input is never mutated). */
export function applyAction(prev: GameState, action: Action): GameState {
  if (prev.winnerId) throw new GameError('The game is over.');
  setRulesMode(prev.mode);
  const state = structuredClone(prev);
  // Only the state a day starts in carries that start's pulses (and only this move's state, what sprang).
  delete state.turnPulses;
  delete state.sprung;
  delete state.struck;
  const p = activePlayer(state);
  if (state.reaction && action.type !== 'react' && action.type !== 'concede') throw new GameError(`Waiting on ${playerById(state, state.reaction.playerId).name}'s answer.`);
  if (p.dawnChoices?.length && action.type !== 'dawnChoice' && action.type !== 'concede') throw new GameError(`Your dawn ${p.dawnChoices[0].kind} comes first: choose a card, or let it be.`);
  switch (action.type) {
    case 'react':
      react(state, action);
      break;
    case 'dawnChoice': {
      const next = p.dawnChoices?.shift();
      if (!next) throw new GameError('There is no dawn choice to make.');
      if (!p.dawnChoices?.length) delete p.dawnChoices;
      // (Its card may have left play since: the choice still stands.)
      const source = p.tableau.find((c) => c.uid === next.uid) ?? { uid: next.uid, defId: 'circular_refraction' };
      const name = next.relic ?? cardDef(source.defId).name;
      // A relic's heat at any target: the rival card chosen, else their sun.
      if (next.kind === 'aim') {
        const rival = targetOf(state, p);
        const victim = rival?.tableau.find((c) => c.uid === action.enemyUid);
        if (!rival) break;
        if (action.enemyUid && !victim) throw new GameError("Aim at a card in your rival's tableau, or at their sun.");
        const n = next.amount ?? 0;
        if (victim) {
          log(state, `${p.name}'s ${name} strikes ${rival.name}'s ${cardDef(victim.defId).name} for ${n}.`);
          notePulse(state, p, null, 'heat', rival, n, victim.uid);
          strikeCard(state, rival, victim, n, p, false, '', false, true);
        } else {
          notePulse(state, p, null, 'heat', rival, n);
          applyHeat(state, rival, n, p, false, undefined, false, `${p.name}'s ${name}`);
        }
        if (p.eliminated) passOn(state);
        break;
      }
      if (action.allyUid === undefined) {
        log(state, `${p.name} lets ${name}'s ${next.relic && next.kind === 'recall' ? '' : 'dawn '}${next.kind} pass.`);
        break;
      }
      if (next.kind === 'recall') {
        const back = p.tableau.find((c) => c.uid === action.allyUid && c.uid !== source.uid && returnable(c));
        if (!back) throw new GameError('Return one of your other cards in play (not your Hero) to your hand.');
        resolveEffects(state, p, source, [{ type: 'recall' }], 'turn', { allyUid: back.uid });
        break;
      }
      const moved = p.tableau.find((c) => c.uid === action.allyUid && c.slot !== COMMAND_SLOT);
      const to = action.shiftTo;
      if (!moved || to === undefined || to === moved.slot || to < 0 || to >= BALANCE.tableauSlots) throw new GameError('Move one of your cards (not your Hero) to another of your slots.');
      log(state, `${p.name}'s ${name}: dawn shift.`);
      resolveEffects(state, p, source, [{ type: 'shift' }], 'turn', { allyUid: moved.uid, shiftTo: to });
      break;
    }
    case 'concede': {
      const quitter = state.players.find((o) => o.id === action.playerId);
      if (!quitter || quitter.eliminated) throw new GameError('That player is not in the game.');
      quitter.eliminated = true;
      state.concededBy = quitter.id;
      delete state.reaction;
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
      // A Dusk Shift relic: a card moved first, as the day ends (or none).
      if (action.duskShift) {
        const relic = relicOf(p.relics, 'duskShift');
        const moved = p.tableau.find((c) => c.uid === action.duskShift!.uid && c.slot !== COMMAND_SLOT);
        const to = action.duskShift.to;
        if (!relic) throw new GameError('Only a Dusk Shift relic moves a card as the day ends.');
        if (!moved || to === moved.slot || to < 0 || to >= BALANCE.tableauSlots) throw new GameError('Move one of your cards (not your Hero) to another of your slots.');
        log(state, `${p.name}'s ${relic.name}: dusk shift.`);
        resolveEffects(state, p, { uid: `relic:${relic.name}`, defId: 'circular_refraction' }, [{ type: 'shift' }], 'turn', { allyUid: moved.uid, shiftTo: to });
      }
      // Dusk: the day's last effects, replayed with the next dawn's.
      state.turnPulses = [];
      dusk(state, p);
      if (p.eliminated) {
        passOn(state);
        break;
      }
      trimHand(state, p, action.discard);
      // Energy left unspent is banked through the enemy's day, to answer them with a Lightspeed card from hand.
      p.banked = Math.max(0, p.playsLeft);
      state.keepPulses = true;
      advanceTurn(state);
      break;
    case 'attack': {
      const why = attackProblem(state, p, action.attackerUid, action.targetUid);
      if (why) throw new GameError(why);
      // A rival may answer the attack first, with a Lightspeed card (see Reaction).
      const events: ReactEvent[] = [action.targetUid ? { on: 'cardAttacked', attackerUid: action.attackerUid, mineUid: action.targetUid } : { on: 'sunAttacked', attackerUid: action.attackerUid }];
      if (!state.noReactions && openReaction(state, p, events, { kind: 'attack', attackerUid: action.attackerUid, targetUid: action.targetUid })) break;
      attack(state, p, p.tableau.find((c) => c.uid === action.attackerUid)!, action.targetUid);
      if (p.eliminated) passOn(state);
      break;
    }
    case 'heroAbility': {
      const why = heroAbilityProblem(state, p, action.index);
      if (why) throw new GameError(why);
      const hero = commandCard(p)!;
      const k = cardDef(hero.defId).abilities![action.index];
      p.playsLeft -= k.cost ?? 0;
      // The other costs: the Hero's own stability, a card sacrificed, heat on your own sun.
      if (k.pay?.stability) hero.health = (hero.health ?? 0) - k.pay.stability;
      // (The card given up is the player's choice; unchosen, the weakest.)
      const chosen = action.sacrificeUid ? p.tableau.find((c) => c.uid === action.sacrificeUid && c.slot !== COMMAND_SLOT) : undefined;
      if (action.sacrificeUid && !chosen) throw new GameError('Sacrifice one of your own cards in play (not your Hero).');
      const victim = k.pay?.sacrifice ? chosen ?? sacrificeOf(p) : undefined;
      if (victim) {
        log(state, `${p.name} sacrifices ${cardDef(victim.defId).name}.`);
        leaveTableau(state, p, victim);
      }
      if (k.pay?.selfHeat) resolveEffects(state, p, hero, [{ type: 'selfHeat', amount: k.pay.selfHeat }], 'play');
      p.abilityTurn = state.turnNumber;
      hero.dimmed = true;
      if (action.aimUid && !aimChoices(state, p).cards.some((c) => c.uid === action.aimUid)) throw new GameError("Aim at a card in your rival's tableau, or at their sun.");
      log(state, `${p.name}'s ${cardDef(hero.defId).name}: ${k.name}.`);
      resolveEffects(state, p, hero, k.effects, 'play', { aimUid: action.aimUid });
      if (p.eliminated) passOn(state);
      break;
    }
    case 'heroSkill': {
      const why = heroSkillProblem(state, p, action.index);
      if (why) throw new GameError(why);
      const k = p.skills![action.index];
      p.playsLeft -= k.cost;
      if (k.once) k.spent = true;
      else k.usedTurn = state.turnNumber;
      log(state, k.relic ? `${p.name} calls on the ${k.relic}.` : `${p.name} calls on ${cardDef(k.hero).name}: ${k.name}.`);
      resolveEffects(state, p, { uid: `skill-${k.id}`, defId: k.hero }, k.effects, 'play');
      // (A relic's Recall 2: its choices, one after another, before anything else.)
      for (let i = 0; i < (k.choices?.times ?? 0); i++) if (p.tableau.some(returnable)) (p.dawnChoices ??= []).push({ uid: `relic:${k.relic ?? k.name}`, kind: k.choices!.kind, relic: k.relic ?? k.name });
      if (p.eliminated) passOn(state);
      break;
    }
    case 'reclaim': {
      // A Reclaim relic: a card from the discard pile back to hand, for energy (then played as any card is).
      const n = relicN(p.relics, 'reclaim');
      const i = p.discard.findIndex((c) => c.uid === action.cardUid);
      if (!n) throw new GameError('Only a Reclaim relic takes cards back from your discard pile.');
      if (i < 0) throw new GameError('That card is not in your discard pile.');
      if (p.playsLeft < n) throw new GameError(`Taking a card back costs ${n} energy.`);
      const [card] = p.discard.splice(i, 1);
      p.playsLeft -= n;
      p.hand.push(card);
      log(state, `${p.name}'s ${relicOf(p.relics, 'reclaim')!.name} takes ${cardDef(card.defId).name} back from the discard pile.`);
      break;
    }
  }
  return state;
}

/** A card's printed attack: its rating with its race's trait folded in (Sun-lances, Slow tides...; never below 1). */
export function baseAttack(def: CardDef): number {
  const a = def.attack ?? 0;
  return a > 0 ? a : 0;
}

/** A card's attack as it stands: its rating, with whatever boosts heat (Forge, a Hero's racial buff...). */
export function cardAttack(state: GameState, p: PlayerState, card: CardInstance): number {
  const def = cardDef(card.defId);
  let base = baseAttack(def);
  // Campaign battles: a hero's training lets them fight (even one who doesn't), and a room's guns add to a card that does.
  const hero = !!p.heroStats && card.defId === p.hero;
  if (hero) base += p.heroStats!.attack;
  // (Chosen: even a card with no attack of its own can fight.)
  base += card.attackBonus ?? 0;
  // Growing cards gain attack as they grow.
  if (BALANCE.growthAttack && card.growth && (base > 0 || BALANCE.growthAttackAll)) base += card.growth * BALANCE.growthAttack;
  if (base <= 0) return 0;
  if (p.rooms && card.slot !== COMMAND_SLOT) base += p.rooms.attack[card.slot ?? -1] ?? 0;
  // (Offered today: what it gave up is gone until its owner's dawn.)
  return Math.max(0, effectAmount(state, p, card, { type: 'heat', amount: base, to: 'target' }, 'play') - (card.spentAttack ?? 0));
}

/**
 * Whether a card in play has attack of its own (its own, from growth, gear or training: not what neighbours lend
 * it). Cards are all of a kind now; "a card with attack" is one that has any.
 */
export function armed(p: PlayerState, card: CardInstance): boolean {
  let base = baseAttack(cardDef(card.defId)) + (card.attackBonus ?? 0);
  if (p.heroStats && card.defId === p.hero) base += p.heroStats.attack;
  if (BALANCE.growthAttack && card.growth && (base > 0 || BALANCE.growthAttackAll)) base += card.growth * BALANCE.growthAttack;
  return base > 0;
}

/**
 * What the old card kinds now mean, of a card in play: an "attack card" is one with attack, a "defence card"
 * one with Sturdy, a "support card" one with neither. Heroes, Relics, globals and Lightspeed cards are still their own.
 */
export function hasRole(p: PlayerState, card: CardInstance, kind: CardKind): boolean {
  const k = cardDef(card.defId).kind;
  if (kind === 'attack') return k !== 'command' && armed(p, card);
  if (kind === 'defence') return k !== 'command' && cardSturdy(card) > 0;
  if (kind === 'growth') return k !== 'command' && k !== 'relic' && !armed(p, card) && cardSturdy(card) <= 0;
  return k === kind;
}

/** The same, of a card as printed (one being played, or in a pile): a "support card" played is one that resolves and goes. */
export function defHasRole(def: CardDef, kind: CardKind): boolean {
  const own = def.kind !== 'command' && def.kind !== 'lightspeed' && def.kind !== 'relic' && def.kind !== 'global';
  // (Played: a card with attack, or one that heats the rival as it is played.)
  if (kind === 'attack') return own && ((def.attack ?? 0) > 0 || (def.onPlay ?? []).some((e) => e.type === 'heat' && e.to === 'target'));
  if (kind === 'defence') return own && (def.defence ?? 0) > 0;
  if (kind === 'growth') return own && isBurst(def);
  return def.kind === kind;
}

/** A card's Sting: its own (its text, fused cards) and its race's (Vorthane cards Sting 1). */
export function cardSting(card: CardInstance): number {
  return cardPassives(card).reduce((n, x) => n + (x.type === 'retaliate' ? x.amount : 0), 0) + (raceTrait(cardDef(card.defId).race)?.sting ?? 0);
}

/** What a card hits back with when it is attacked: its own attack, and its Sting. */
export function counterDamage(state: GameState, owner: PlayerState, card: CardInstance): number {
  // (A Thorns relic: every card hits back harder.)
  return cardAttack(state, owner, card) + cardSting(card) + relicN(owner.relics, 'thorns');
}

/** Why a card can't attack this target now (null if it can). `targetUid` null: the rival's sun; unset: whether it can attack at all. */
export function attackProblem(state: GameState, p: PlayerState, attackerUid: string, targetUid?: string | null): string | null {
  const card = p.tableau.find((c) => c.uid === attackerUid);
  if (!card) return 'That card is not in play.';
  if (activePlayer(state).id !== p.id) return 'Only on your own day.';
  if (cardAttack(state, p, card) <= 0) return `${cardDef(card.defId).name} has no attack.`;
  if (card.dimmed) return `${cardDef(card.defId).name} is dimmed: it acts again from your next day.`;
  const { cards, sun } = aimChoices(state, p, true);
  if (targetUid === undefined) return null;
  if (targetUid === null) return sun ? null : targetOf(state, p)?.boss && !guards(targetOf(state, p)!).length ? 'It has no sun: strike its body (its Overlord is what must fall).' : 'Your rival has a Guard in play: attack it.';
  return cards.some((c) => c.uid === targetUid) ? null : sun ? "Attack a card in your rival's tableau, or their sun." : 'Your rival has a Guard in play: attack it.';
}

/**
 * A card attacks: its attack lands as heat on the rival's sun (past shields), or strikes a rival card (its
 * defence, then its health), and that card hits back with its own attack and Sting, at the attacker's
 * health. Then it is dimmed.
 */
/** An attack, and then (the third of the day) a Flurry relic's blow. */
function attack(state: GameState, p: PlayerState, card: CardInstance, targetUid: string | null) {
  p.turn.attacks = (p.turn.attacks ?? 0) + 1;
  state.struck = { attackerUid: card.uid, targetUid };
  strike(state, p, card, targetUid);
  const flurry = relicN(p.relics, 'flurry');
  if (flurry && p.turn.attacks === 3 && !state.winnerId && !p.eliminated) relicAim(state, p, flurry, 'flurry');
}

function strike(state: GameState, p: PlayerState, card: CardInstance, targetUid: string | null) {
  const rival = targetOf(state, p);
  if (!rival) return;
  const amount = cardAttack(state, p, card);
  const name = cardDef(card.defId).name;
  card.dimmed = true;
  if (targetUid === null) {
    // (No pulse: the card itself is seen striking the sun.)
    log(state, `${p.name}'s ${name} attacks ${rival.name}'s sun for ${amount}.`);
    applyHeat(state, rival, amount, p, false, card.uid, false, `${p.name}'s ${name}'s attack`);
    // A Leech relic: a blow at the rival's sun cools your own.
    const leech = relicN(p.relics, 'leech');
    if (leech && !p.eliminated && !state.winnerId) {
      cool(state, p, leech, relicOf(p.relics, 'leech')!.name);
      notePulse(state, p, null, 'cool', p, leech);
    }
    return;
  }
  const victim = rival.tableau.find((c) => c.uid === targetUid);
  if (!victim || state.winnerId || p.eliminated) return;
  const back = counterDamage(state, rival, victim);
  log(state, `${p.name}'s ${name} attacks ${rival.name}'s ${cardDef(victim.defId).name} for ${amount}.`);
  // (A Splash relic's spray: the cards either side of the one attacked, as it stood.)
  const beside = relicN(p.relics, 'splash') && victim.slot !== COMMAND_SLOT ? rival.tableau.filter((c) => c.slot !== COMMAND_SLOT && Math.abs((c.slot ?? -9) - (victim.slot ?? -9)) === 1) : [];
  strikeCard(state, rival, victim, amount, p, false, card.uid);
  for (const c of beside) {
    if (state.winnerId || !rival.tableau.includes(c)) continue;
    const n = relicN(p.relics, 'splash');
    log(state, `${p.name}'s ${relicOf(p.relics, 'splash')!.name} splashes ${cardDef(c.defId).name} for ${n}.`);
    notePulse(state, p, null, 'heat', rival, n, c.uid);
    strikeCard(state, rival, c, n, p, false, '', false, true);
  }
  if (back > 0 && p.tableau.includes(card)) {
    // An attacker out of its slot has no slot defence: only its own (Sturdy, and its race's) takes the blow first.
    const own = Math.max(0, cardSturdy(card));
    const absorbed = Math.min(back, own, cardDefence(p, card));
    if (absorbed > 0) card.dented = (card.dented ?? 0) + absorbed;
    card.health = Math.max(0, (card.health ?? 0) - (back - absorbed));
    // (Where the blow comes from, in words: its attack and its Sting, each named.)
    const atk = cardAttack(state, rival, victim), sting = back - atk;
    const from = [atk > 0 ? `its attack ${atk}` : '', sting > 0 ? `Sting ${sting}` : ''].filter(Boolean).join(' and ');
    log(state, `${cardDef(victim.defId).name} hits back for ${from}: ${name} takes ${back}${absorbed ? ` (${absorbed} on its own defence)` : ''} (health ${card.health}).`);
    if (card.health <= 0) {
      log(state, `${p.name}'s ${name} burns away.`);
      leaveTableau(state, p, card);
    }
  }
}

/** Why the ability of the Hero leading a player's tableau can't be used now (null if it can). */
export function heroAbilityProblem(state: GameState, p: PlayerState, index: number): string | null {
  const hero = commandCard(p);
  const k = hero ? cardDef(hero.defId).abilities?.[index] : undefined;
  if (!hero || !k) return 'No Hero leads your tableau.';
  if (activePlayer(state).id !== p.id) return 'Only on your own day.';
  if (hero.dimmed) return p.abilityTurn === state.turnNumber ? `${cardDef(hero.defId).name} is dimmed: it has been used today.` : `${cardDef(hero.defId).name} is dimmed: it acts from your next day.`;
  if ((k.cost ?? 0) > p.playsLeft) return `${k.name} needs ${k.cost} energy.`;
  if (k.pay?.stability && (hero.health ?? 0) <= k.pay.stability) return `${cardDef(hero.defId).name} hasn't the stability to spare.`;
  if (k.pay?.sacrifice && !sacrificeOf(p)) return `${k.name} needs another of your cards in play to sacrifice.`;
  if (k.pay?.selfHeat && p.heat + k.pay.selfHeat >= supernovaThreshold(p)) return `${k.name} would drive your own sun to supernova.`;
  return null;
}

/** The card a sacrifice takes: your weakest other card in play (the least stability left; the first of those). */
export function sacrificeOf(p: PlayerState): CardInstance | undefined {
  const others = p.tableau.filter((c) => c.slot !== COMMAND_SLOT);
  return others.reduce<CardInstance | undefined>((low, c) => (!low || (c.health ?? 99) < (low.health ?? 99) ? c : low), undefined);
}

/** Why a hero's battle skill can't be used now (null if it can). */
export function heroSkillProblem(state: GameState, p: PlayerState, index: number): string | null {
  const k = p.skills?.[index];
  if (!k) return 'No such skill.';
  if (activePlayer(state).id !== p.id) return 'Only on your own day.';
  if (k.spent) return `${k.name} has been used this battle.`;
  if (!k.once && k.usedTurn === state.turnNumber) return `${k.name} has been used today.`;
  if (k.cost > p.playsLeft) return `${k.name} needs ${k.cost} energy.`;
  return null;
}

export function isGameOver(state: GameState): boolean {
  return state.winnerId !== null;
}
