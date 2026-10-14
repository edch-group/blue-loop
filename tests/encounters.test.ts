import { describe, expect, it } from 'vitest';
import {
  applyCampaignAction,
  campaignPlayer,
  CAPTAIN,
  createCampaign,
  createGame,
  CURIO_GOOD,
  encounterPrice,
  ENCOUNTERS_PER_GALAXY,
  flagship,
  freeSlots,
  HUNTER_STAGES,
  nodeById,
  SHIP_PARTS,
  simulateBattle,
  tableauFull,
  type CampaignState,
  type EncounterKind,
} from '../src/engine';

const run = (seed = 7) => {
  const s = createCampaign({ seed, captain: CAPTAIN });
  for (const n of s.nodes) delete n.cache;
  // (Kaelen's crystal aside: these are about what waits at a system.)
  s.crystal = false;
  return s;
};

/** The flagship's neighbour, made a plain system with an encounter waiting. */
function beside(s: CampaignState, kind: EncounterKind) {
  const army = flagship(s, s.playerId)!;
  const here = nodeById(s, army.nodeId);
  const n = nodeById(s, here.links.find((id) => !nodeById(s, id).heart)!);
  Object.assign(n, { owner: null, station: undefined, challenge: undefined, rival: undefined, prophet: undefined, dream: undefined, cache: undefined, vault: undefined, encounter: kind });
  return n;
}

const arrive = (s: CampaignState, kind: EncounterKind) => {
  const n = beside(s, kind);
  return { n, s: applyCampaignAction(s, { type: 'move', armyId: flagship(s, s.playerId)!.id, toId: n.id }) };
};

describe('story encounters', () => {
  it('wait unseen on the strip, a few a galaxy, on the Captain\'s runs only', () => {
    const s = run();
    const here = s.nodes.filter((n) => n.encounter);
    expect(here).toHaveLength(ENCOUNTERS_PER_GALAXY);
    for (const n of here) expect(n.home || n.heart || n.station || n.challenge).toBeFalsy();
    const other = createCampaign({ seed: 7, race: 0 });
    expect(other.nodes.some((n) => n.encounter)).toBe(false);
  });

  it('play as the flagship arrives, no battle: answered before anything else', () => {
    const { s, n } = arrive(run(), 'merchant');
    expect(s.battle).toBeFalsy();
    expect(s.encounter).toMatchObject({ nodeId: n.id, kind: 'merchant', price: encounterPrice('merchant', 1) });
    expect(nodeById(s, n.id).encounter).toBeUndefined();
    expect(() => applyCampaignAction(s, { type: 'endTurn' })).toThrow(/alongside/);
    const t = applyCampaignAction(s, { type: 'encounter', choice: 'leave' });
    expect(t.encounter?.outcome).toBe('declined');
    expect(applyCampaignAction(t, { type: 'encounter', choice: 'done' }).encounter).toBeUndefined();
  });

  it('the merchant\'s device works 2 times in 5: a curio part, or a slot wrecked until a space station', () => {
    let good = 0;
    const tries = 300;
    for (let seed = 1; seed <= tries; seed++) {
      const { s } = arrive(run(seed), 'merchant');
      campaignPlayer(s).materials = 99;
      const t = applyCampaignAction(s, { type: 'encounter', choice: 'buy' });
      expect(campaignPlayer(t).materials).toBe(99 - s.encounter!.price);
      if (t.encounter!.outcome === 'good') {
        good++;
        const p = SHIP_PARTS.find((x) => x.id === t.encounter!.part)!;
        expect(p.curio).toBe(true);
        expect(t.partsFound).toContain(p.id);
      } else {
        expect(t.encounter!.outcome).toBe('bad');
        expect(t.wreckedSlot).toBe(t.encounter!.slot);
        expect(t.wreckedSlot).toBeGreaterThanOrEqual(0);
        expect(t.wreckedSlot).toBeLessThan(5);
      }
    }
    expect(good / tries).toBeGreaterThan(CURIO_GOOD - 0.08);
    expect(good / tries).toBeLessThan(CURIO_GOOD + 0.08);
  });

  it('a wrecked slot is closed in battle (never the Hero\'s) until a space station mends it', () => {
    const s = run();
    s.wreckedSlot = 2;
    const n = beside(s, 'merchant');
    n.encounter = undefined;
    const t = applyCampaignAction(s, { type: 'move', armyId: flagship(s, s.playerId)!.id, toId: n.id });
    const me = t.battle!.game.players[0];
    expect(me.closedSlots).toEqual([2]);
    expect(freeSlots(me)).not.toContain(2);
    // (Four cards and the wreck: the tableau is full.)
    const g = createGame({ seed: 1, players: [{ name: 'a', isAI: false, deck: [], closedSlots: [0], tableau: ['p_dawn_lancer', 'p_dawn_lancer', 'p_dawn_lancer', 'p_dawn_lancer'] }, { name: 'b', isAI: true, deck: [] }] });
    expect(g.players[0].tableau.every((c) => c.slot !== 0)).toBe(true);
    expect(tableauFull(g.players[0])).toBe(true);
    // A space station mends it.
    const u = run();
    u.wreckedSlot = 1;
    const dock = beside(u, 'merchant');
    dock.encounter = undefined;
    dock.station = { kind: 'armory', cards: [] };
    expect(applyCampaignAction(u, { type: 'move', armyId: flagship(u, u.playerId)!.id, toId: dock.id }).wreckedSlot).toBeUndefined();
  });

  it('pirates: pay their toll, or fight; beaten, their hold is yours; beating you, they take it', () => {
    const { s } = arrive(run(), 'pirates');
    campaignPlayer(s).materials = 50;
    const paid = applyCampaignAction(s, { type: 'encounter', choice: 'pay' });
    expect(campaignPlayer(paid).materials).toBe(50 - s.encounter!.price);
    campaignPlayer(s).materials = 0;
    expect(() => applyCampaignAction(s, { type: 'encounter', choice: 'pay' })).toThrow(/Not enough/);
    const fight = applyCampaignAction(s, { type: 'encounter', choice: 'fight' });
    expect(fight.battle?.encounter?.kind).toBe('pirates');
    const done = applyCampaignAction(fight, { type: 'finishBattle', game: simulateBattle(fight.battle!.game) });
    expect(done.battle).toBeFalsy();
    expect(['won', 'lost']).toContain(done.encounter?.outcome);
  });

  it('Kaelen\'s hunters: three stages across runs, each beaten for good; paid off, they come again', () => {
    const s = run();
    (s.freed ??= []).push('lancer');
    const { s: t } = arrive(s, 'hunters');
    expect(t.encounter?.stage).toBe(0);
    campaignPlayer(t).materials = 99;
    expect(applyCampaignAction(t, { type: 'encounter', choice: 'pay' }).hunted ?? 0).toBe(0);
    // Won: a stage done.
    let fight = applyCampaignAction(t, { type: 'encounter', choice: 'fight' });
    fight.battle!.game.winnerId = fight.battle!.game.players[0].id;
    fight.battle!.game.players[1].eliminated = true;
    const won = applyCampaignAction(fight, { type: 'finishBattle', game: fight.battle!.game });
    expect(won.hunted).toBe(1);
    // The last stage can't be bought off.
    const last = run();
    last.run = { ...last.run!, hunters: HUNTER_STAGES - 1 };
    (last.freed ??= []).push('lancer');
    const { s: end } = arrive(last, 'hunters');
    expect(end.encounter?.stage).toBe(HUNTER_STAGES - 1);
    campaignPlayer(end).materials = 99;
    expect(() => applyCampaignAction(end, { type: 'encounter', choice: 'pay' })).toThrow(/not on offer/);
    fight = applyCampaignAction(end, { type: 'encounter', choice: 'fight' });
    expect(fight.battle?.game.players[1].name).toMatch(/Executioner/);
  });
});

describe('research experiments', () => {
  it('every one a big upside and a downside; a station offers three, none carried already', async () => {
    const { EXPERIMENTS, researchBonus } = await import('../src/engine');
    expect(EXPERIMENTS.length).toBeGreaterThanOrEqual(6);
    for (const x of EXPERIMENTS) {
      expect(x.boon && x.bane).toBeTruthy();
      // (Each stands on its own: holding two adds both.)
      const both = researchBonus({ done: [x.id, EXPERIMENTS.find((o) => o.id !== x.id)!.id] });
      expect(Object.keys(both.mods).length).toBeGreaterThan(Object.keys(x.effect.mods ?? {}).length - 1);
    }
    const s = run();
    const lab = s.nodes.find((n) => n.station?.kind === 'research')!;
    const options = lab.station!.kind === 'research' ? lab.station!.options : [];
    expect(options).toHaveLength(3);
    for (const id of options) expect(EXPERIMENTS.some((x) => x.id === id)).toBe(true);
  });
});
