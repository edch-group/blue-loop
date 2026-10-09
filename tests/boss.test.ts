import { describe, expect, it } from 'vitest';
import { applyCampaignAction, createCampaign, flagship } from '../src/engine/campaign';
import { OVERLORDS, overlordHealth } from '../src/engine/cards-bosses';
import { applyAction, bossIntent, bossOrder, COMMAND_SLOT, createGame } from '../src/engine/game';
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
    // It has no sun: its Overlord's stability is what must be beaten down.
    const leader = boss.tableau.find((c) => c.uid === boss.boss!.leader)!;
    expect(leader.health).toBe(overlordHealth(1));
  });

  it('have no sun: heat sent at it strikes the Overlord, and beating the Overlord down wins', () => {
    const s = battle();
    const boss = s.players[1];
    const leader = boss.tableau.find((c) => c.uid === boss.boss!.leader)!;
    const hp = leader.health!;
    // (Its Guards draw heat aimed as a card is played: with them gone, the heat goes at the Overlord.)
    boss.tableau = boss.tableau.filter((c) => c.defId !== 'colossus_plating');
    s.players[0].hand.push({ uid: 'cl', defId: 'coronal_lance' });
    s.players[0].playsLeft = 5;
    let t = applyAction(s, { type: 'playCard', cardUid: 'cl' });
    const l2 = t.players[1].tableau.find((c) => c.uid === leader.uid)!;
    expect(t.players[1].heat).toBe(0);
    expect((l2.dented ?? 0) + (hp - (l2.health ?? 0))).toBeGreaterThan(0);
    // Beaten down to nothing: the battle is won.
    l2.health = 1;
    t.players[0].hand.push({ uid: 'cl2', defId: 'coronal_lance' });
    t.players[0].playsLeft = 5;
    l2.dented = 99;
    t = applyAction(t, { type: 'playCard', cardUid: 'cl2' });
    expect(t.winnerId).toBe(t.players[0].id);
  });
});
