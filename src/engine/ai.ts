import { BALANCE } from './balance';
import { cardDef } from './cards';
import {
  activePlayer,
  cardNeedsPlanet,
  cardNeedsTarget,
  cryoCost,
  flareCost,
  flareHeat,
  livingOpponents,
  marketCost,
  upgradeablePlanets,
} from './game';
import type { Action, CardKind, GameState, PlayerState, Track } from './types';

/**
 * Heuristic AI: returns the next action for the active player.
 * Every non-endTurn action it picks spends money or a card, so repeatedly
 * calling it always reaches `endTurn`.
 */
export function chooseAIAction(state: GameState): Action {
  const me = activePlayer(state);
  const foes = livingOpponents(state, me);
  const target = pickTarget(foes);

  // 1. Play every card in hand, cheapest decisions first.
  for (const card of me.hand) {
    if (cardNeedsTarget(card.defId)) {
      if (!target) continue;
      return { type: 'playCard', cardUid: card.uid, targetId: target.id };
    }
    if (cardNeedsPlanet(card.defId)) {
      return { type: 'playCard', cardUid: card.uid, planetId: pickPlanet(me)?.id };
    }
    return { type: 'playCard', cardUid: card.uid };
  }

  if (!target) return { type: 'endTurn' };

  // 2. Go for the kill if the weakest enemy can be finished this turn.
  const cost = flareCost(state, me);
  const reachableFlares = Math.floor(me.money / cost);
  const killHeat = reachableFlares > 0 ? flareHeat(me) + (reachableFlares - 1) * BALANCE.solarFlareHeat - target.shields : 0;
  if (reachableFlares > 0 && target.heat + killHeat >= BALANCE.supernovaAt) {
    return { type: 'solarFlare', targetId: target.id };
  }

  // 3. Cool down when our own sun is in danger.
  const danger = BALANCE.supernovaAt - 4;
  if (me.heat >= danger && me.money >= cryoCost(me)) return { type: 'cryostasis' };

  // 4. Buy the best card we can afford.
  const buy = pickPurchase(state, me);
  if (buy !== null) return { type: 'buyCard', slot: buy };

  // 5. Spend leftovers: attack if we're cooler than the target, else cool.
  if (me.money >= cost && me.heat <= target.heat) return { type: 'solarFlare', targetId: target.id };
  if (me.money >= cryoCost(me) && me.heat > BALANCE.minHeat) return { type: 'cryostasis' };
  if (me.money >= cost) return { type: 'solarFlare', targetId: target.id };

  return { type: 'endTurn' };
}

/** Focus fire on the hottest enemy sun (least effective shields breaks ties). */
function pickTarget(foes: PlayerState[]): PlayerState | undefined {
  return [...foes].sort((a, b) => b.heat - a.heat || a.shields - b.shields)[0];
}

function pickPlanet(me: PlayerState) {
  const hot = me.heat >= 5;
  const priority: Track[] = hot ? ['defences', 'economy', 'weapons', 'resources'] : ['economy', 'weapons', 'resources', 'defences'];
  return [...upgradeablePlanets(me)].sort(
    (a, b) => priority.indexOf(a.track) - priority.indexOf(b.track) || a.level - b.level,
  )[0];
}

const KIND_BIAS: Record<CardKind, number> = { command: 3, attack: 2, economy: 1.5, defence: 1, global: 0.5, basic: 0 };

function pickPurchase(state: GameState, me: PlayerState): number | null {
  let best: number | null = null;
  let bestScore = 0;
  state.display.forEach((card, slot) => {
    if (!card) return;
    const cost = marketCost(me, card.defId);
    if (cost > me.money) return;
    const def = cardDef(card.defId);
    let score = def.cost + KIND_BIAS[def.kind];
    if (def.kind === 'defence' && me.heat >= 4) score += 3;
    if (def.kind === 'command' && upgradeablePlanets(me).length === 0) score = 0;
    if (score > bestScore) {
      bestScore = score;
      best = slot;
    }
  });
  return best;
}
