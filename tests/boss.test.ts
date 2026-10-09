import { describe, expect, it } from 'vitest';
import { applyCampaignAction, createCampaign, flagship } from '../src/engine/campaign';
import { OVERLORDS, overlordHealth } from '../src/engine/cards-bosses';
import { applyAction, bossIntent, bossOrder, COMMAND_SLOT, createGame, supernovaThreshold } from '../src/engine/game';
import type { GameState } from '../src/engine/types';

const lord = OVERLORDS[0];
const battle = (): GameState =>
  createGame({ seed: 5, campaign: true, players: [{ name: 'Ada', isAI: false }, { name: lord.name, isAI: true, deck: [], boss: true, tableau: [lord.hero, ...lord.parts] }] });

describe('Lost Overlords', () => {
  it('start with their body in play, draw nothing, and show their first action', () => {
    const s = battle();
    const boss = s.players[1];
    expect(boss.hand).toHaveLength(0);
    expect(boss.tableau.find((c) => c.slot === COMMAND_SLOT)?.defId).toBe(lord.hero);
    expect(boss.tableau).toHaveLength(1 + lord.parts.length);
    // Its parts act in turn, left to right, the Overlord itself last.
    const order = bossOrder(boss);
    expect(order[order.length - 1].defId).toBe(lord.hero);
    expect(bossIntent(boss)?.card.uid).toBe(order[0].uid);
  });

  it('take the shown action at their dawn, then show the next', () => {
    let s = battle();
    const first = bossIntent(s.players[1])!;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.log.some((l) => l.text.includes(first.name))).toBe(true);
    const order = bossOrder(s.players[1]);
    expect(bossIntent(s.players[1])?.card.uid).toBe(order[1].uid);
    expect(s.players[1].hand).toHaveLength(0);
  });

  it('stagger when the part whose turn it is has been destroyed', () => {
    let s = battle();
    const first = bossIntent(s.players[1])!;
    s.players[1].tableau = s.players[1].tableau.filter((c) => c.uid !== first.card.uid);
    s = applyAction(s, { type: 'endTurn' });
    expect(s.log.some((l) => /staggers/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.text.includes(first.name + '!'))).toBe(false);
  });

  it("guard the campaign's wormholes: an Overlord, its body in play and its sun beyond any system's", () => {
    let s = createCampaign({ seed: 9, race: 0 });
    const army = flagship(s, s.playerId)!;
    const heart = s.nodes.find((n) => n.heart)!;
    army.nodeId = heart.links[0];
    s = applyCampaignAction(s, { type: 'move', armyId: army.id, toId: heart.id });
    const boss = s.battle!.game.players[1];
    expect(boss.boss).toBeDefined();
    expect(OVERLORDS.some((o) => o.name === boss.name)).toBe(true);
    expect(boss.deck).toHaveLength(0);
    // (The galaxy may add to it or take a little off, as it does every sun.)
    expect(supernovaThreshold(boss)).toBeGreaterThanOrEqual(overlordHealth(1) - 2);
  });
});
