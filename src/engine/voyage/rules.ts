/**
 * The space adventure's ship-to-ship battles, on the card game's engine. Where its rules differ from the card
 * game's, they live here and plug in through game.ts's ShipRules hooks (installed when this module loads):
 * - no hand, no deck and no lightspeed slot: every card stands in a room of its ship from the start;
 * - energy is the ship's store, full at first and regaining so much a day; a card in a room is activated for its cost;
 * - shields last until spent and defences don't mend; a side with no card left aboard is beaten;
 * - a card knocked out of its room sits a day out, a beaten hero is wounded for a day, a destroyed card is gone.
 */
import { cardDef } from '../cards';
import { BALANCE } from '../balance';
import type { Action, CardInstance, GameState, PlayerState } from '../types';
import {
  COMMAND_SLOT,
  GameError,
  activePlayer,
  aimChoices,
  aimable,
  allyChoices,
  baseStability,
  cardChoices,
  cardCost,
  commandCard,
  enemyChoices,
  freeSlots,
  installShipRules,
  log,
  place,
  playsAllowed,
  resolveEffects,
  slotsBySafety,
  targetOf,
} from '../game';
import { CAMPAIGN } from './balance';

/** The energy activating a card costs (an X card: all you have, at least 1, at most CAMPAIGN.maxX). */
export function activateCost(p: PlayerState, card: CardInstance): number {
  const def = cardDef(card.defId);
  return def.spendAll ? Math.max(1, Math.min(CAMPAIGN.maxX, p.playsLeft)) : cardCost(def.id);
}

/** Why a card in a room can't be activated now (null if it can). */
export function activateProblem(state: GameState, p: PlayerState, cardUid: string): string | null {
  if (!state.campaign) return 'Cards are activated in ship battles only.';
  if (activePlayer(state).id !== p.id) return 'Only on your own day.';
  const card = p.tableau.find((c) => c.uid === cardUid);
  if (!card) return 'That card is not in your ship.';
  const def = cardDef(card.defId);
  if (!def.onPlay?.length || def.fusion) return `${def.name} has nothing to activate.`;
  if (card.activated) return `${def.name} has been activated today: again from your next day.`;
  const cost = activateCost(p, card);
  if (p.playsLeft < cost) return p.playsLeft <= 0 ? 'You have no energy left.' : `${def.name} needs ${cost} energy: you have ${p.playsLeft}.`;
  return null;
}

/** Activate a card in a room: its play effect again, for its cost, once a day. */
function activate(state: GameState, p: PlayerState, action: Extract<Action, { type: 'activate' }>) {
  const why = activateProblem(state, p, action.cardUid);
  if (why) throw new GameError(why);
  const card = p.tableau.find((c) => c.uid === action.cardUid)!;
  const def = cardDef(card.defId);
  const choices = cardChoices(def.id);
  if (choices.length && !choices.includes(action.choice ?? '')) throw new GameError('Choose one of its options.');
  const target = targetOf(state, p);
  const foes = enemyChoices(state, p, def.id);
  if (foes.length > 0 && !foes.some((c) => c.uid === action.enemyUid)) throw new GameError(`Choose a card in ${target?.name ?? 'your rival'}'s ship.`);
  const allies = allyChoices(p, def.id).filter((c) => c.uid !== card.uid);
  if (allies.length > 0 && !allies.some((c) => c.uid === action.allyUid)) throw new GameError('Choose a card of yours.');
  if (action.aimUid && aimable(def.id) && !aimChoices(state, p).cards.some((c) => c.uid === action.aimUid)) throw new GameError("Aim at a card in your rival's ship (a Guard, while they have one), or at their sun.");
  const spend = activateCost(p, card);
  if (def.spendAll) card.spent = spend;
  p.playsLeft -= spend;
  card.activated = true;
  p.turn.cardsPlayed += 1;
  log(state, `${p.name} activates ${def.name}.`);
  resolveEffects(state, p, card, def.onPlay, 'play', action);
}

/** A card's full stability in play (its base, and a hero's boons). */
function fullStability(c: CardInstance): number {
  const boons = c.boons ?? [];
  if (!boons.length) return baseStability(c.defId);
  return Math.min(BALANCE.maxStability, baseStability(c.defId) + boons.reduce((n, b) => n + (cardDef(b).stability ?? 0), 0));
}

/** Draw, aboard a ship (there is no deck): restore an ally's stability (the most worn, as far as its full stability). */
function stabiliseAlly(state: GameState, p: PlayerState, amount: number) {
  if (amount <= 0) return;
  const worn = (c: CardInstance) => fullStability(c) - (c.stability ?? 0);
  const ally = [...p.tableau].filter((c) => worn(c) > 0).sort((a, b) => worn(b) - worn(a))[0];
  if (!ally) return;
  const gain = Math.min(amount, worn(ally));
  ally.stability = (ally.stability ?? 0) + gain;
  log(state, `${p.name} stabilises ${cardDef(ally.defId).name} by ${gain} (stability ${ally.stability}).`);
}

/** A side with nothing left aboard (no card in a room, and no hero, even a wounded one) is beaten, as if its sun had gone. */
function outOfCards(state: GameState, p: PlayerState) {
  if (p.eliminated || state.winnerId) return;
  if (p.hand.length || p.deck.length || p.tableau.length || p.lightspeed || p.wounded || p.benched?.length) return;
  p.eliminated = true;
  log(state, `${p.name} has nothing left to fight with.`);
  const alive = state.players.filter((o) => !o.eliminated);
  if (alive.length === 1) {
    state.winnerId = alive[0].id;
    log(state, `${alive[0].name} wins the battle!`);
  }
}

/** Cards knocked out of their rooms sit a day out, then go back (to another room if theirs is taken). */
function benchedReturn(state: GameState, p: PlayerState) {
  for (const b of [...(p.benched ?? [])]) {
    if (b.left > 0) {
      b.left -= 1;
      continue;
    }
    p.benched = p.benched!.filter((x) => x !== b);
    const room = p.tableau.some((c) => c.slot === b.slot) ? freeSlots(p)[0] : b.slot;
    if (room === undefined) {
      (p.fallen ??= []).push(b.card);
      continue;
    }
    place(p, b.card, room);
    log(state, `${p.name}'s ${cardDef(b.card.defId).name} is back in its room.`);
  }
  if (p.benched && !p.benched.length) delete p.benched;
}

/** A wounded hero sits a day out, then takes the command room again (whoever stood in it steps aside). */
function woundedReturn(state: GameState, p: PlayerState) {
  if (!p.wounded) return;
  if (p.wounded.left > 0) {
    p.wounded.left -= 1;
    return;
  }
  const { card } = p.wounded;
  delete p.wounded;
  const sitting = p.tableau.find((c) => c.slot === COMMAND_SLOT);
  if (sitting) {
    p.tableau.splice(p.tableau.indexOf(sitting), 1);
    delete sitting.slot;
    p.hand.push(sitting);
  }
  delete card.dimmed;
  delete card.dented;
  place(p, card, COMMAND_SLOT);
  log(state, `${p.name}'s ${cardDef(card.defId).name} is back in the command room.`);
}

installShipRules({
  setup(_state, p) {
    // Every card stands in a room from the start (the hero in the command room), the safest rooms first;
    // a card that doesn't fit is left out.
    const free = new Set(freeSlots(p));
    const safest = slotsBySafety().filter((s) => free.has(s));
    for (const card of p.deck) {
      if (cardDef(card.defId).kind === 'command') {
        if (!commandCard(p)) place(p, card, COMMAND_SLOT);
      } else if (safest.length) place(p, card, safest.shift()!);
    }
    p.deck = [];
    p.energy ??= { cap: CAMPAIGN.startCapacity, regen: CAMPAIGN.startRegen };
  },

  dayBegins(state, p) {
    benchedReturn(state, p);
    woundedReturn(state, p);
  },

  dawnEnergy(state, p) {
    // The store carries over: full at first, then regaining so much a day (and what extra energy its cards
    // give), never past its capacity.
    const energy = p.energy ?? { cap: CAMPAIGN.startCapacity, regen: CAMPAIGN.startRegen };
    if (p.turnsTaken === 1) return energy.cap;
    const extra = Math.max(0, playsAllowed(state, p) - Math.min(p.turnsTaken, BALANCE.maxPlays));
    return Math.min(energy.cap, p.playsLeft + energy.regen + extra + (p.turn.dawnEnergy ?? 0));
  },

  draw(state, p, _card, amount) {
    stabiliseAlly(state, p, amount);
  },

  leaving(state, owner, card, to, room) {
    const name = cardDef(card.defId).name;
    if (owner.hero === card.defId) {
      // A beaten hero, or one sent from the field, is wounded: back in the command room in a day.
      owner.wounded = { card, left: 1 };
      log(state, `${owner.name}'s ${name} is wounded: back in the command room after their next day.`);
      return true;
    }
    if ((to === 'hand' || to === 'deck') && room !== undefined && room !== COMMAND_SLOT) {
      // There is no hand to go back to: a card sent from its room is knocked out for a day.
      (owner.benched ??= []).push({ card, slot: room, left: 1 });
      log(state, `${owner.name}'s ${name} is knocked out of its room: back after their next day.`);
      return true;
    }
    return false;
  },

  // A destroyed card is out of the battle for good.
  graveyard: (owner) => (owner.fallen ??= []),

  afterLeave: outOfCards,

  defence(p, card) {
    let d = 0;
    if (p.rooms) d += card.slot === COMMAND_SLOT ? p.rooms.command : (p.rooms.defence[card.slot ?? -1] ?? 0);
    if (p.heroStats && card.defId === p.hero) d += p.heroStats.defence;
    return d;
  },

  attack(p, card, base) {
    // A hero's training lets them fight (even one who doesn't), and a room's guns add to a card that does.
    if (p.heroStats && card.defId === p.hero) base += p.heroStats.attack;
    if (base <= 0) return 0;
    if (p.rooms && card.slot !== COMMAND_SLOT) base += p.rooms.attack[card.slot ?? -1] ?? 0;
    return base;
  },

  activate,
});
