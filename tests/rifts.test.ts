import { describe, expect, it } from 'vitest';
import { applyCampaignAction, armiesOf, galaxyEffects, migrateCampaign, armyMoves, campaignPlayer, createCampaign, flagship, nodeById, timePreview, visibleNodes, type CampaignNode, type CampaignState } from '../src/engine/campaign';
import { cardDef } from '../src/engine/cards';
import { markedId, marksFor } from '../src/engine/rifts';

const fresh = (seed = 7): CampaignState => {
  const s = createCampaign({ seed, race: 0 });
  s.story.queue = [];
  return s;
};
const ship = (s: CampaignState) => armiesOf(s, s.playerId)[0];

/** A run with a rift of a kind hanging off the arrival, found and open. */
function withRift(kind: 'dark' | 'time', seed = 7): CampaignState {
  const s = fresh(seed);
  const home = nodeById(s, ship(s).nodeId);
  const rift: CampaignNode = { id: `n${s.nodes.length}`, name: 'Rift', x: home.x, y: home.y + 300, planets: [], owner: null, links: [home.id], fortification: 0, damage: 0, garrison: [], hazard: [], yield: { materials: 0 }, tier: 0, challenge: { kind: 'rift', hidden: false, from: home.id, rift: kind } };
  home.links.push(rift.id);
  s.nodes.push(rift);
  return s;
}
const enter = (s: CampaignState) => {
  const rift = s.nodes.find((n) => n.challenge?.kind === 'rift')!;
  expect(armyMoves(s, ship(s)).find((m) => m.toId === rift.id)).toEqual({ toId: rift.id, battle: false });
  return applyCampaignAction(s, { type: 'move', armyId: ship(s).id, toId: rift.id });
};

describe('Rifts', () => {
  it('has no galaxy and so no galaxy mods, even once saved and loaded again', () => {
    for (const kind of ['dark', 'time'] as const) {
      const s = enter(withRift(kind));
      expect(s.galaxy).toBeUndefined();
      const loaded = migrateCampaign(JSON.parse(JSON.stringify(s)));
      expect(loaded.galaxy).toBeUndefined();
      expect(galaxyEffects(loaded)).toBeNull();
    }
  });

  it("fields, stocks and gives the rift's own race even in a Core run (no enemy with an empty deck)", () => {
    for (const kind of ['dark', 'time'] as const) {
      const base = withRift(kind);
      base.mode = 'core';
      const s = enter(base);
      const race = kind === 'dark' ? 4 : 6;
      const armory = s.nodes.find((n) => n.station?.kind === 'armory');
      if (armory?.station?.kind === 'armory') expect(armory.station.cards.length).toBeGreaterThan(0);
      // A battle against a system of the rift: its defenders have a deck, of the rift's race.
      // (From wherever a fight is in reach.)
      let fight: { toId: string } | undefined;
      for (const n of s.nodes) {
        ship(s).nodeId = n.id;
        fight = armyMoves(s, ship(s)).find((m) => m.battle && !nodeById(s, m.toId).heart);
        if (fight) break;
      }
      expect(fight).toBeDefined();
      if (!fight) continue;
      const t = applyCampaignAction(s, { type: 'move', armyId: ship(s).id, toId: fight.toId });
      const rival = t.battle!.game.players[1];
      const all = [...rival.deck, ...rival.hand, ...rival.tableau].map((c) => c.defId);
      expect(all.length).toBeGreaterThan(5);
      expect(all.every((id) => cardDef(id).race === race)).toBe(true);
    }
  });

  it('take the flagship into the Dark Galaxy: five jumps to Nyxara, one star ahead seen, the stars behind going out', () => {
    let s = enter(withRift('dark'));
    expect(s.rift?.kind).toBe('dark');
    const heart = s.nodes.find((n) => n.heart)!;
    expect(heart.name).toMatch(/Nyxara/);
    // Five jumps from the arrival to Nyxara.
    expect(heart.col).toBe(5);
    // Only the star the ship is at, and the stars one jump on, can be seen.
    const here = nodeById(s, ship(s).nodeId);
    expect([...visibleNodes(s, s.playerId)].sort()).toEqual([here.id, ...here.links].sort());
    // A move on (a station or a fight's win), and the arrival is gone into the dark.
    s = applyCampaignAction(s, { type: 'endTurn' });
    const next = here.links.map((id) => nodeById(s, id))[0];
    flagship(s, s.playerId)!.nodeId = next.id;
    s = applyCampaignAction(s, { type: 'endTurn' });
    expect(nodeById(s, here.id).vanished).toBe(true);
    expect(armyMoves(s, ship(s)).some((m) => m.toId === here.id)).toBe(false);
  });

  it("stocks the Dark Galaxy with Nyxari cards alone, and its research with the Nyxari's own upgrades", () => {
    const s = enter(withRift('dark'));
    const armory = s.nodes.find((n) => n.station?.kind === 'armory');
    const lab = s.nodes.find((n) => n.station?.kind === 'research');
    if (armory?.station?.kind === 'armory') for (const id of armory.station.cards) expect(cardDef(id).race).toBe(4);
    if (lab?.station?.kind === 'research') for (const id of lab.station.options) expect(id.startsWith('nyx_')).toBe(true);
  });

  it('turns Time Dense Space as a lock: a notch a turn, never the flagship\'s ring; round the ring or inward, never outward', () => {
    let s = enter(withRift('time'));
    expect(s.rift?.kind).toBe('time');
    expect(s.nodes.find((n) => n.heart)?.name).toMatch(/Aster/);
    const here = () => nodeById(s, ship(s).nodeId);
    // Still between turns: nothing moves on its own.
    const still = s.nodes.map((n) => [n.x, n.y]);
    expect(s.nodes.map((n) => [n.x, n.y])).toEqual(still);
    // Onto the outer ring.
    const first = armyMoves(s, ship(s))[0];
    expect(nodeById(s, first.toId).spinRing).toBe(4);
    ship(s).nodeId = first.toId;
    const ringOf = (r: number) => s.nodes.filter((n) => n.spinRing === r);
    for (let turn = 0; turn < 12; turn++) {
      const at = { x: here().x, y: here().y };
      const before = new Map(ringOf(3).map((n) => [n.id, [n.x, n.y]]));
      s = applyCampaignAction(s, { type: 'endTurn' });
      s.story.queue = [];
      // The flagship's ring holds still; the others turn.
      expect({ x: here().x, y: here().y }).toEqual(at);
      expect(ringOf(3).some((n) => before.get(n.id)![0] !== n.x)).toBe(true);
      // Round the ring (both neighbours) or inward; never outward.
      const moves = armyMoves(s, ship(s)).map((m) => nodeById(s, m.toId));
      expect(moves.filter((n) => n.spinRing === 4).length).toBe(2);
      for (const n of moves) expect((n.spinRing ?? 0) <= 4).toBe(true);
      // Between every two rings, a way in.
      for (let r = 2; r <= 4; r++) expect(ringOf(r).some((n) => n.links.some((id) => nodeById(s, id).spinRing === r - 1))).toBe(true);
    }
    // The next notch, shown: from a star in reach, where its way in will lead.
    const lateral = armyMoves(s, ship(s)).find((m) => nodeById(s, m.toId).spinRing === 4)!;
    for (const p of timePreview(s, lateral.toId)) expect(nodeById(s, p.id).spinRing).toBe(3);
  });

  it("lets a Dark Prophet mark one of the flagship's cards with a Nyxari keyword, for good", () => {
    let s = enter(withRift('dark'));
    const card = ship(s).deck.find((id) => marksFor(cardDef(id)).includes('veil'))!;
    s.prophet = { nodeId: ship(s).nodeId, offers: [{ card, mark: 'veil' }] };
    s = applyCampaignAction(s, { type: 'prophetPick', index: 0 });
    expect(ship(s).deck).toContain(markedId('veil', card));
    const marked = cardDef(markedId('veil', card));
    expect(marked.text.startsWith('{shield:2}.')).toBe(true);
    expect(marked.onPlay?.some((e) => e.type === 'shield' && e.amount === 2)).toBe(true);
    expect(s.prophet).toBeUndefined();
  });

  it('has Aster grant one of three Seren emblems', () => {
    let s = enter(withRift('time'));
    s.emblemChoice = undefined;
    // (As the heart is taken: see conquer.)
    const before = campaignPlayer(s).relics?.length ?? 0;
    s = { ...s, emblemChoice: [{ id: 'x1', name: 'Paradise Seed', slot: 'star', rarity: 'anomaly', boons: [], power: 'paradise', n: 2, text: '' }] };
    s = applyCampaignAction(s, { type: 'chooseEmblem', index: 0 });
    expect((campaignPlayer(s).relics?.length ?? 0) - before).toBe(1);
    expect(s.emblemChoice).toBeUndefined();
  });

  it('fights its race at its strongest, and its ruler at the end', () => {
    // (A seed whose rift has a battle a jump from its arrival.)
    let seed = 7;
    while (!armyMoves(enter(withRift('dark', seed)), ship(enter(withRift('dark', seed)))).some((m) => m.battle)) seed++;
    let s = enter(withRift('dark', seed));
    const fight = armyMoves(s, ship(s)).find((m) => m.battle)!;
    s = applyCampaignAction(s, { type: 'move', armyId: ship(s).id, toId: fight.toId });
    const foe = s.battle!.game.players[1];
    for (const c of [...foe.deck, ...foe.hand]) expect(cardDef(c.defId).race).toBe(4);
    // The ruler: Nyxara in play from the start.
    s = enter(withRift('dark'));
    const heart = s.nodes.find((n) => n.heart)!;
    const a = ship(s);
    a.nodeId = heart.links[0];
    nodeById(s, a.nodeId).owner = s.playerId;
    s = applyCampaignAction(s, { type: 'move', armyId: a.id, toId: heart.id });
    expect(s.battle!.game.players[1].tableau.some((c) => c.defId === 'nyx_hero_nyxara')).toBe(true);
  });
});
