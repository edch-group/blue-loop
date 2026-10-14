import { describe, expect, it } from 'vitest';
import { applyCampaignAction, armiesOf, createCampaign, crewInDeck, flagship, hasCompanion, nodeById, type CampaignNode, type CampaignState } from '../src/engine/campaign';
import { CAPTAIN } from '../src/engine/captain';
import { activeCrew, bankCompanions, companionCards, emptyMeta, runBonuses, setCrewAboard } from '../src/engine/meta';
import { ACTIVE_CREW, companionOf, noActs, xpFromActs } from '../src/engine/companions';

const ship = (s: CampaignState) => armiesOf(s, s.playerId)[0];

/** A Captain's run with a rift of a kind off its arrival, entered. */
function inRift(kind: 'dark' | 'time', meta = emptyMeta()): CampaignState {
  const s = createCampaign({ seed: 7, captain: CAPTAIN, run: runBonuses(meta) });
  s.story.queue = [];
  s.crystal = false;
  const home = nodeById(s, ship(s).nodeId);
  const rift: CampaignNode = { id: `n${s.nodes.length}`, name: 'Rift', x: home.x, y: home.y + 300, planets: [], owner: null, links: [home.id], fortification: 0, damage: 0, garrison: [], hazard: [], yield: { materials: 0 }, tier: 0, challenge: { kind: 'rift', hidden: false, from: home.id, rift: kind } };
  home.links.push(rift.id);
  s.nodes.push(rift);
  return applyCampaignAction(s, { type: 'move', armyId: ship(s).id, toId: rift.id });
}

/** Flown straight to the rift's event (as if every jump were open). */
function toEvent(s: CampaignState) {
  const n = s.nodes.find((x) => x.encounter)!;
  const a = flagship(s, s.playerId)!;
  const here = nodeById(s, a.nodeId);
  here.links.push(n.id);
  n.links.push(here.id);
  return applyCampaignAction(s, { type: 'move', armyId: a.id, toId: n.id });
}

describe('the Lost Races companions', () => {
  it('wait in their rifts only: Nyss hunted in the Dark Galaxy, Ilyra in a stopped hour in Time Dense Space', () => {
    expect(inRift('dark').nodes.filter((n) => n.encounter === 'exile')).toHaveLength(1);
    expect(inRift('time').nodes.filter((n) => n.encounter === 'stillness')).toHaveLength(1);
    // (Found once: never offered again.)
    const met = bankCompanions(emptyMeta(), ['seer'], {}, 0);
    expect(inRift('time', met).nodes.some((n) => n.encounter === 'stillness')).toBe(false);
    expect(createCampaign({ seed: 7, captain: CAPTAIN }).nodes.some((n) => n.encounter === 'exile' || n.encounter === 'stillness')).toBe(false);
  });

  it('Ilyra comes aboard at a word; Nyss once her pursuers are beaten', () => {
    let t = toEvent(inRift('time'));
    expect(t.encounter?.kind).toBe('stillness');
    t = applyCampaignAction(t, { type: 'encounter', choice: 'free' });
    expect(hasCompanion(t, 'seer')).toBe(true);
    expect(flagship(t, t.playerId)!.deck.some((c) => companionOf(c) === 'seer')).toBe(true);
    let d = toEvent(inRift('dark'));
    d = applyCampaignAction(d, { type: 'encounter', choice: 'fight' });
    expect(d.battle?.encounter?.kind).toBe('exile');
    const g = d.battle!.game;
    g.winnerId = g.players[0].id;
    g.players[1].eliminated = true;
    d = applyCampaignAction(d, { type: 'finishBattle', game: g });
    expect(hasCompanion(d, 'shade')).toBe(true);
  });

  it('learn their own ways: Nyss from heat on the rival sun, Ilyra from dawns in play', () => {
    expect(xpFromActs('shade', { ...noActs(), sun: 7, damage: 20 })).toBe(7);
    expect(xpFromActs('seer', { ...noActs(), dawns: 4, support: 20 })).toBe(12);
  });
});

describe('the active crew', () => {
  it('three fly at once: the first found, or those chosen; one more joins only with a place free', () => {
    let meta = bankCompanions(emptyMeta(), ['lancer', 'engineer', 'defector', 'shade'], {}, 0);
    expect(activeCrew(meta)).toHaveLength(ACTIVE_CREW);
    expect(companionCards(meta)).toHaveLength(ACTIVE_CREW);
    expect(setCrewAboard(meta, 'shade', true)).toBe(meta);
    meta = setCrewAboard(setCrewAboard(meta, 'engineer', false), 'shade', true);
    expect(activeCrew(meta)).toEqual(['lancer', 'defector', 'shade']);
    expect(companionCards(meta).map(companionOf)).toEqual(['lancer', 'defector', 'shade']);
  });

  it('a fourth joining mid-run: one stands down for the run, or the new one waits ashore', () => {
    const meta = bankCompanions(emptyMeta(), ['lancer', 'engineer', 'defector'], {}, 0);
    let t = toEvent(inRift('time', meta));
    expect(crewInDeck(t)).toEqual(['lancer', 'engineer', 'defector']);
    t = applyCampaignAction(t, { type: 'encounter', choice: 'free' });
    expect(t.joined?.[0]).toMatchObject({ id: 'seer', swap: true });
    expect(() => applyCampaignAction(t, { type: 'joinedSeen' })).toThrow(/Choose/);
    const swapped = applyCampaignAction(t, { type: 'crewSwap', out: 'engineer' });
    expect(crewInDeck(swapped)).toEqual(['lancer', 'defector', 'seer']);
    const ashore = applyCampaignAction(t, { type: 'crewSwap', out: null });
    expect(crewInDeck(ashore)).toEqual(['lancer', 'engineer', 'defector']);
    // (Either way, she is found for good.)
    expect(ashore.freed).toContain('seer');
  });
});
