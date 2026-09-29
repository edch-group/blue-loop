import { BALANCE } from './balance';
import { cardDef } from './cards';
import { systemDef } from './systems';
import {
  activePlayer,
  cardNeedsTarget,
  cardNeedsUpgrade,
  flareCost,
  flareHeat,
  livingOpponents,
  marketCost,
  supernovaThreshold,
  shieldPierce,
  thermoCost,
  upgradeOptions,
} from './game';
import type { RewardId } from './objectives';
import type { Action, CardKind, GameState, PlayerState, Track, UpgradeId } from './types';

/**
 * Heuristic AI: returns the next action for the active player.
 * Every non-endTurn action it picks spends money or a card, so repeatedly
 * calling it always reaches `endTurn`.
 */
export function chooseAIAction(state: GameState): Action {
  if (state.pendingRewards.length) return pickReward(state);

  const me = activePlayer(state);
  const foes = livingOpponents(state, me);
  const target = pickTarget(foes);

  // 1. Play every card in hand: plain money cards all at once, then the rest.
  if (me.hand.some((c) => cardDef(c.defId).effects.every((e) => e.type === 'money'))) {
    return { type: 'playAllMoney' };
  }
  for (const card of me.hand) {
    if (cardNeedsTarget(card.defId)) {
      if (!target) continue;
      return { type: 'playCard', cardUid: card.uid, targetId: target.id };
    }
    if (cardNeedsUpgrade(card.defId)) {
      return { type: 'playCard', cardUid: card.uid, upgradeId: pickUpgrade(me) };
    }
    return { type: 'playCard', cardUid: card.uid };
  }

  if (!target) return { type: 'endTurn' };

  // 2. Go for the kill if the weakest enemy can be finished this turn.
  const cost = flareCost(state, me);
  const reachableFlares = Math.floor(me.money / cost);
  const shields = Math.max(0, target.shields - shieldPierce(me));
  const killHeat = reachableFlares * flareHeat(me, state) - shields;
  if (reachableFlares > 0 && target.heat + killHeat >= supernovaThreshold(target)) {
    return { type: 'solarFlare', targetId: target.id };
  }

  // 3. Cool down when our own sun is in danger.
  const danger = supernovaThreshold(me) - 4;
  const canThermo = !systemDef(me.systemId).modifiers.noThermosiphon;
  if (canThermo && me.heat >= danger && me.money >= thermoCost(me)) return { type: 'thermosiphon' };

  // 4. Buy the best card we can afford.
  const buy = pickPurchase(state, me);
  if (buy !== null) return { type: 'buyCard', slot: buy };

  // 5. Spend leftovers: attack if we're cooler than the target, else cool.
  if (me.money >= cost && me.heat <= target.heat) return { type: 'solarFlare', targetId: target.id };
  if (canThermo && me.money >= thermoCost(me) && me.heat > BALANCE.minHeat) return { type: 'thermosiphon' };
  if (me.money >= cost) return { type: 'solarFlare', targetId: target.id };

  return { type: 'endTurn' };
}

/** Focus fire on the hottest enemy sun (least effective shields breaks ties). */
function pickTarget(foes: PlayerState[]): PlayerState | undefined {
  return [...foes].sort((a, b) => b.heat - a.heat || a.shields - b.shields)[0];
}

/** Solar Flare upgrades first (or Thermosiphon when running hot), then planets. */
function pickUpgrade(me: PlayerState): UpgradeId | undefined {
  const options = upgradeOptions(me);
  const hot = me.heat >= supernovaThreshold(me) / 2;
  const actionOrder: UpgradeId[] = hot
    ? ['coolingChamber', 'thermosiphon', 'solarFlare']
    : ['solarFlare', 'coolingChamber', 'thermosiphon'];
  const action = actionOrder.find((a) => options.includes(a));
  if (action) return action;
  const priority: Track[] = hot ? ['defences', 'economy', 'weapons', 'resources'] : ['economy', 'weapons', 'resources', 'defences'];
  return me.planets
    .filter((pl) => options.includes(pl.id))
    .sort((a, b) => priority.indexOf(a.track) - priority.indexOf(b.track) || a.level - b.level)[0]?.id;
}

/** Survive first when running hot; otherwise build the engine. */
function pickReward(state: GameState): Action {
  const pending = state.pendingRewards[0];
  const me = state.players.find((p) => p.id === pending.playerId)!;
  const hot = me.heat >= supernovaThreshold(me) * 0.6;
  const order: RewardId[] = hot
    ? ['vent', 'deep_coolant', 'aegis_lattice', 'command', 'stellar_mint', 'wide_sensors', 'plasma_focus', 'flare_focus', 'requisition', 'purge']
    : ['command', 'stellar_mint', 'wide_sensors', 'plasma_focus', 'flare_focus', 'requisition', 'purge', 'aegis_lattice', 'deep_coolant', 'vent'];
  const reward = order.find((r) => pending.options.includes(r)) ?? pending.options[0];
  if (reward === 'command') return { type: 'chooseReward', reward, upgradeId: pickUpgrade(me) };
  if (reward === 'requisition') {
    let best = -1;
    state.display.forEach((c, i) => {
      if (c && (best < 0 || cardDef(c.defId).cost > cardDef(state.display[best]!.defId).cost)) best = i;
    });
    return { type: 'chooseReward', reward, slot: best };
  }
  return { type: 'chooseReward', reward };
}

const KIND_BIAS: Record<CardKind, number> = { command: 3, attack: 2, economy: 1.5, global: 0, defence: 1, mission: 1, basic: 0 };

/** Globals help everyone equally, so only buy one when the change favours us. */
function globalValue(state: GameState, me: PlayerState, defId: string): number {
  const foes = livingOpponents(state, me);
  if (!foes.length) return 0;
  const myRoom = supernovaThreshold(me) - me.heat;
  const theirRoom = Math.min(...foes.map((f) => supernovaThreshold(f) - f.heat));
  switch (defId) {
    case 'solar_storm':
    case 'solar_maximum':
      return myRoom > theirRoom + 3 ? 6 : 0; // we can take the heat better than they can
    case 'ice_age':
      return myRoom < theirRoom - 2 ? 6 : 0; // we need the cooling more
    case 'magnetic_storm':
      return myRoom < theirRoom ? 4 : 0; // slow everyone's attacks while we are behind
    default:
      return 2;
  }
}

function pickPurchase(state: GameState, me: PlayerState): number | null {
  let best: number | null = null;
  let bestScore = 0;
  state.display.forEach((card, slot) => {
    if (!card) return;
    const cost = marketCost(me, card.defId, state);
    if (cost > me.money) return;
    const def = cardDef(card.defId);
    let score = def.cost + KIND_BIAS[def.kind];
    if (def.kind === 'defence' && me.heat >= 4) score += 3;
    if (def.kind === 'global') score = globalValue(state, me, def.id);
    if (def.kind === 'command' && upgradeOptions(me).length === 0) score = 0;
    if (score > bestScore) {
      bestScore = score;
      best = slot;
    }
  });
  return best;
}
