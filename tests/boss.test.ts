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
    expect(order.some((c) => c.uid === bossIntent(boss)?.card.uid)).toBe(true);
  });

  it('take the shown action at their dawn, then show their next', () => {
    let s = battle();
    const first = bossIntent(s.players[1])!;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.log.some((l) => l.text.includes(first.name))).toBe(true);
    expect(bossIntent(s.players[1])).not.toBeNull();
    expect(s.players[1].hand).toHaveLength(0);
  });

  it('choose their best action for the board as it stands', async () => {
    const { baseHealth, chooseBossIntent, supernovaThreshold } = await import('../src/engine/game');
    const s = battle();
    const boss = s.players[1], me = s.players[0];
    const on = (ids: string[]) => {
      me.tableau = me.tableau.filter((c) => c.slot === COMMAND_SLOT);
      ids.forEach((defId, i) => me.tableau.push({ uid: `x${i}`, defId, slot: i, health: baseHealth(defId) }));
      chooseBossIntent(s, boss);
      return bossIntent(boss)!.card.defId;
    };
    // No cards: its biggest blow, at the sun (Furnace Breath's 8, over Crushing Blow's 6 falling on the sun).
    me.heat = 0;
    expect(on([])).toBe('boss_colossus');
    // A board full of small cards: the sweep.
    expect(on(['helio_lancer', 'helio_lancer', 'helio_lancer', 'helio_lancer', 'helio_lancer'])).toBe('colossus_right_fist');
    // The sun one blow from going supernova: the sun, whatever is on the board.
    me.heat = supernovaThreshold(me) - 5;
    me.shields = 0;
    expect(on(['helio_lancer', 'helio_lancer', 'helio_lancer', 'helio_lancer', 'helio_lancer'])).toBe('boss_colossus');
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

describe('Lost Overlord blows with no card to strike', () => {
  it('fall on the sun instead (the player chooses: a card to take it, or the sun)', async () => {
    const { bossAim } = await import('../src/engine/game');
    let s = battle();
    const boss = s.players[1];
    const fist = boss.tableau.find((c) => c.defId === 'colossus_left_fist')!;
    boss.boss!.intent = fist.uid;
    const me = s.players[0];
    me.tableau = me.tableau.filter((c) => c.slot === COMMAND_SLOT && false);
    expect(bossAim(s, boss)).toEqual({ sun: 6, cards: [] });
    const heat = me.heat;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[0].heat - heat).toBeGreaterThanOrEqual(6);
  });
});

describe("A Lost Overlord's minions", () => {
  it('act every day, beside the one action its body takes', async () => {
    const { bossMinions, bossOrder: order } = await import('../src/engine/game');
    const tyrant = OVERLORDS.find((o) => o.parts.includes('tyrant_retainers'))!;
    let s = createGame({ seed: 5, campaign: true, players: [{ name: 'Ada', isAI: false }, { name: tyrant.name, isAI: true, deck: [], boss: true, tableau: [tyrant.hero, ...tyrant.parts] }] });
    const boss = s.players[1];
    expect(bossMinions(boss).map((c) => c.defId)).toEqual(['tyrant_retainers']);
    expect(order(boss).some((c) => c.defId === 'tyrant_retainers')).toBe(false);
    s = applyAction(s, { type: 'endTurn' });
    s = applyAction(s, { type: 'endTurn' });
    const acted = s.log.filter((l) => l.text.startsWith('⚔')).map((l) => l.text);
    expect(acted.filter((t) => t.includes('Retainers') || t.includes('retainers')).length).toBeGreaterThanOrEqual(1);
  });
});

describe("A Lost Overlord's own action", () => {
  it('recharges once used: ready again on its third day after', async () => {
    const { BOSS_RECHARGE } = await import('../src/engine/game');
    let s = battle();
    const hero = s.players[1].tableau.find((c) => c.defId === lord.hero)!;
    s.players[1].boss!.intent = hero.uid;
    const charges: (number | undefined)[] = [];
    const acted: string[] = [];
    for (let day = 0; day < 3 && !s.winnerId; day++) {
      const seq = s.log[s.log.length - 1]?.seq ?? 0;
      s.players[0].heat = 0; // (the sun kept from going supernova, for the test)
      s = applyAction(s, { type: 'endTurn' }); // the Overlord's day
      for (const l of s.log) if (l.seq > seq && l.text.startsWith(`⚔ ${lord.name}:`)) acted.push(l.text);
      const b = s.players[1];
      charges.push(b.boss!.charge);
      // While it recharges, what it shows next is never its own action.
      if (b.boss!.charge) expect(bossIntent(b)?.card.defId).not.toBe(lord.hero);
      if (!s.winnerId) s = applyAction(s, { type: 'endTurn' }); // the player's
    }
    expect(acted[0]).toContain('Furnace Breath');
    expect(acted.slice(1).every((t) => !t.includes('Furnace Breath'))).toBe(true);
    expect(charges).toEqual([BOSS_RECHARGE, 1, undefined]);
  });

  it('with nothing else to act, it gathers itself while it recharges', () => {
    let s = createGame({ seed: 5, campaign: true, players: [{ name: 'Ada', isAI: false }, { name: lord.name, isAI: true, deck: [], boss: true, tableau: [lord.hero] }] });
    s.players[1].boss!.charge = 1;
    s.players[1].boss!.intent = undefined;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.log.some((l) => /still charging/.test(l.text))).toBe(true);
    expect(s.players[1].boss!.charge).toBeUndefined();
    expect(bossIntent(s.players[1])?.card.defId).toBe(lord.hero);
  });
});

describe("A Guard draws a Lost Overlord's blows", () => {
  it('at the sun and at one card; a sweep still hits every card', async () => {
    const { bossAim } = await import('../src/engine/game');
    const s = battle();
    const boss = s.players[1], me = s.players[0];
    me.tableau = me.tableau.filter((c) => c.slot === COMMAND_SLOT);
    me.tableau.push({ uid: 'g', defId: 'bell_warden', slot: 0, health: 6 }, { uid: 'a', defId: 'helio_lancer', slot: 1, health: 3 });
    const part = (id: string) => boss.tableau.find((c) => c.defId === id)!.uid;
    boss.boss!.intent = part('boss_colossus');
    expect(bossAim(s, boss)).toEqual({ sun: 0, cards: [{ uid: 'g', heat: 8 }] });
    boss.boss!.intent = part('colossus_left_fist');
    expect(bossAim(s, boss).cards.map((c) => c.uid)).toEqual(['g']);
    boss.boss!.intent = part('colossus_right_fist');
    expect(bossAim(s, boss).cards.map((c) => c.uid).sort()).toEqual(['a', 'g']);
    // Furnace Breath lands on the Guard: the sun spared its 8.
    boss.boss!.intent = part('boss_colossus');
    const heat = me.heat;
    const t = applyAction(s, { type: 'endTurn' });
    expect(t.log.some((l) => l.text.includes('Furnace Breath'))).toBe(true);
    expect(t.players[0].heat - heat).toBeLessThan(8);
  });
});
