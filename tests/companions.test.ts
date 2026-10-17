import { describe, expect, it } from 'vitest';
import { emptyMeta, openSections, sectionOpen, stowParts } from '../src/engine/meta';

describe('campaign menu sections', () => {
  it('stay shut until there is first something in them, then stay open for good', () => {
    let meta = { ...emptyMeta(), xp: 0, petals: 0 };
    expect(['captain', 'ship', 'stellari'].map((s) => sectionOpen(meta, s as 'captain'))).toEqual([false, false, false]);
    meta = openSections(stowParts({ ...meta, petals: 3 }, ['scrap_plating']));
    expect(sectionOpen(meta, 'ship')).toBe(true);
    expect(sectionOpen(meta, 'stellari')).toBe(true);
    // (Spent down to nothing again: still open.)
    expect(sectionOpen({ ...meta, petals: 0, hangar: [] }, 'stellari')).toBe(true);
    expect(sectionOpen({ ...meta, petals: 0, hangar: [] }, 'ship')).toBe(true);
  });
});

import { applyCampaignAction, armiesOf, createCampaign, hasCompanion, CRYSTAL_DAYS, type CampaignState } from '../src/engine/campaign';
import { CAPTAIN } from '../src/engine/captain';
import { cardDef } from '../src/engine/cards';
import { bankCompanions, buyCompanion, companionCards, companionPoints, runBonuses } from '../src/engine/meta';
import { companionBuild, companionCardId, companionLevel, plainCompanion, xpFromActs } from '../src/engine/companions';
import { activePlayer, applyAction, attackProblem, createGame } from '../src/engine/game';

const army = (s: CampaignState) => armiesOf(s, s.playerId)[0];
/** The first battle the flagship can fly into. */
const firstFight = (s: CampaignState) => {
  for (const n of s.nodes) delete n.cache;
  const a = army(s);
  const here = s.nodes.find((n) => n.id === a.nodeId)!;
  return here.links.map((id) => s.nodes.find((n) => n.id === id)!).find((n) => !n.station && !n.owner && !n.challenge)!;
};

describe('the companions', () => {
  it('Kaelen: the first battle of a galaxy is his crystal, timed; broken, he joins the deck, and the crystal is gone', () => {
    const s = createCampaign({ seed: 3, captain: CAPTAIN, run: runBonuses(emptyMeta()) });
    expect(s.crystal).toBe(true);
    const to = firstFight(s);
    const a = army(s);
    let t = applyCampaignAction(s, { type: 'move', armyId: a.id, toId: to.id });
    const g = t.battle!.game;
    expect(g.challenge).toMatchObject({ kind: 'crystal', days: CRYSTAL_DAYS });
    expect(g.players[1].tableau[0].defId).toBe('crystal_prison');
    // (The flagship stays where it was.)
    expect(army(t).nodeId).toBe(a.nodeId);
    const won = structuredClone(g);
    won.winnerId = won.players[0].id;
    t = applyCampaignAction(t, { type: 'finishBattle', game: won });
    expect(hasCompanion(t, 'lancer')).toBe(true);
    expect(army(t).deck).toContain('companion_lancer');
    expect(t.crystal).toBe(false);
  });

  it('Kaelen: the crystal holds when time runs out, and waits in the next galaxy', () => {
    const s = createCampaign({ seed: 3, captain: CAPTAIN, run: runBonuses(emptyMeta()) });
    const t = applyCampaignAction(s, { type: 'move', armyId: army(s).id, toId: firstFight(s).id });
    let g = t.battle!.game;
    // (The challenger passes each day: the days run out.)
    for (let i = 0; i < 40 && !g.winnerId; i++) g = applyAction(g, { type: 'endTurn' } as never);
    expect(g.winnerId).toBe(g.players[1].id);
    const after = applyCampaignAction(t, { type: 'finishBattle', game: g });
    expect(hasCompanion(after, 'lancer')).toBe(false);
  });

  it('a found companion comes aboard as their tree has made them; no crystal once Kaelen is free', () => {
    let meta = bankCompanions(emptyMeta(), ['lancer'], {}, 0);
    meta = bankCompanions(meta, [], { lancer: 200 }, 0);
    expect(companionPoints(meta, 'lancer')).toBe(companionLevel(200).level - 1);
    meta = buyCompanion(meta, 'lancer', 'atk1');
    meta = buyCompanion(meta, 'lancer', 'charge');
    const [card] = companionCards(meta);
    expect(cardDef(card).attack).toBe(4);
    expect(cardDef(card).darkspeed).toBe(true);
    expect(companionBuild(card)!.build).toMatchObject({ attack: 1, traits: ['lunge', 'charge'] });
    const s = createCampaign({ seed: 3, captain: CAPTAIN, run: runBonuses(meta) });
    expect(army(s).deck).toContain(card);
    expect(s.crystal).toBe(false);
    expect(companionCardId('lancer', plainCompanion('lancer'))).toBe('companion_lancer');
  });

  it('learns from what it does in battle: damage dealt by its card is noted on the battle', () => {
    let g = createGame({ seed: 1, campaign: true, players: [{ name: 'A', isAI: false, deck: ['companion_lancer'], tableau: ['companion_lancer'] }, { name: 'B', isAI: true, deck: [] }] });
    const me = g.players[0];
    const lancer = me.tableau[0];
    lancer.dimmed = false;
    lancer.fresh = false;
    g = applyAction(g, { type: 'attack', attackerUid: lancer.uid, targetUid: null } as never);
    expect(g.acts?.lancer?.damage).toBeGreaterThan(0);
    expect(xpFromActs('lancer', g.acts!.lancer!)).toBe(g.acts!.lancer!.damage);
  });

  it('a Darkspeed character that dies after attacking comes back ready again (its dimming does not go with it)', () => {
    const K = 'companion_lancer@1.0.0.lunge+charge';
    let g = createGame({ seed: 1, campaign: true, players: [{ name: 'A', isAI: false, deck: Array(10).fill('companion_lancer') }, { name: 'B', isAI: false, deck: Array(10).fill('companion_lancer') }] });
    if (activePlayer(g).id !== g.players[0].id) g = applyAction(g, { type: 'endTurn' });
    g.players[0].hand.push({ uid: 'k1', defId: K });
    g.players[0].playsLeft = 9;
    g = applyAction(g, { type: 'playCard', cardUid: 'k1' } as never);
    expect(attackProblem(g, g.players[0], 'k1')).toBeNull();
    g = applyAction(g, { type: 'attack', attackerUid: 'k1', targetUid: null });
    g = applyAction(g, { type: 'endTurn' });
    // (Struck down on the rival's day, still dimmed from his attack.)
    g.players[1].hand.push({ uid: 'b1', defId: 'companion_lancer@3.0.0.lunge+charge' });
    g.players[1].playsLeft = 9;
    g = applyAction(g, { type: 'playCard', cardUid: 'b1' } as never);
    g = applyAction(g, { type: 'attack', attackerUid: 'b1', targetUid: 'k1' });
    expect(g.players[0].wreck!.find((c) => c.uid === 'k1')!.dimmed).toBeUndefined();
    g = applyAction(g, { type: 'endTurn' });
    // (Back from the wreckage, as the reserves and a reshuffle bring him: the same card.)
    const back = g.players[0];
    for (const pile of [back.wreck ?? [], back.discard, back.deck]) {
      const i = pile.findIndex((c) => c.uid === 'k1');
      if (i >= 0) back.hand.push(pile.splice(i, 1)[0]);
    }
    back.playsLeft = 9;
    g = applyAction(g, { type: 'playCard', cardUid: 'k1' } as never);
    expect(attackProblem(g, g.players[0], 'k1')).toBeNull();
  });

  it('the defector comes once two beaten heroes have been spared', () => {
    const s = createCampaign({ seed: 3, captain: CAPTAIN, run: { ...runBonuses(emptyMeta()), spared: 1 } });
    s.beaten = { nodeId: army(s).nodeId, hero: 'command_directive' };
    const t = applyCampaignAction(s, { type: 'struggleChoice', recruit: true });
    expect(hasCompanion(t, 'defector')).toBe(true);
    expect(army(t).deck).toContain('companion_defector');
  });
});
