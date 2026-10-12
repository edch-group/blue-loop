import { describe, expect, it } from 'vitest';
import {
  applyCampaignAction,
  armiesOf,
  armyMoves,
  buyCaptain,
  CAPTAIN,
  CAPTAIN_DECK,
  captainBuild,
  captainCard,
  captainId,
  captainBuyProblem,
  cardDef,
  CORE_RACES,
  createCampaign,
  emptyMeta,
  equipCaptainAbility,
  GENERALS,
  isCaptain,
  simulateBattle,
  RIVAL_NODES,
  SLAY_LOOT,
  raceWeight,
  runBonuses,
  setAffinity,
  buyUpgrade,
  type CampaignState,
} from '../src/engine';

const run = (seed = 7, captain = CAPTAIN) => {
  const s = createCampaign({ seed, captain });
  for (const n of s.nodes) delete n.cache;
  return s;
};
const myArmy = (s: CampaignState) => armiesOf(s, s.playerId)[0];

describe('the Captain', () => {
  it('starts every run: a human, in Core, with the Captain and nine neutral cards', () => {
    const s = run();
    const me = s.factions.find((f) => f.id === s.playerId)!;
    expect(me.human).toBe(true);
    expect(s.mode).toBe('core');
    const army = myArmy(s);
    expect(army.general).toBe(CAPTAIN);
    expect(army.deck).toEqual([CAPTAIN, ...CAPTAIN_DECK]);
    expect(army.deck.slice(1).every((id) => cardDef(id).race === undefined)).toBe(true);
  });

  it('is plain to begin with: two energy, three stability, no attack, one small ability', () => {
    const d = cardDef(CAPTAIN);
    expect(d.kind).toBe('command');
    expect([d.cost, d.stability, d.attack]).toEqual([2, 3, 0]);
    expect(d.abilities?.map((a) => a.id)).toEqual(['brace']);
  });

  it('carries what petals bought in its card id, read back the same', () => {
    const b = { attack: 2, stability: 3, cheaper: 1, abilities: ['volley', 'bulwark'], lead: 'steady' };
    const id = captainId(b);
    expect(isCaptain(id)).toBe(true);
    expect(captainBuild(id)).toEqual(b);
    const d = cardDef(id);
    expect([d.cost, d.stability, d.attack]).toEqual([1, 9, 2]);
    expect(d.abilities?.map((a) => a.id)).toEqual(['volley', 'bulwark']);
    expect(d.onTurn).toEqual([{ type: 'cool', amount: 1 }]);
  });

  it('is bought up with petals: stats in order, abilities carried while a slot is free', () => {
    let meta = { ...emptyMeta(), petals: 100 };
    meta = buyCaptain(meta, { kind: 'stat', stat: 'attack' });
    expect(meta.petals).toBe(95);
    meta = buyCaptain(meta, { kind: 'ability', id: 'volley' });
    // (One slot, Brace in it: Volley is learnt but left behind until there's room.)
    expect(meta.captain!.equipped).toEqual(['brace']);
    meta = equipCaptainAbility(equipCaptainAbility(meta, 'brace'), 'volley');
    expect(meta.captain!.equipped).toEqual(['volley']);
    expect(cardDef(captainCard(meta)).abilities?.map((a) => a.id)).toEqual(['volley']);
    expect(captainBuyProblem({ ...meta, petals: 0 }, { kind: 'stat', stat: 'stability' })).toMatch(/petals/);
  });

  it("is offered any core race's cards and neutral ones, never a hero", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = run(seed);
      let t = applyCampaignAction(s, { type: 'move', armyId: myArmy(s).id, toId: armyMoves(s, myArmy(s)).find((m) => m.battle)!.toId });
      const game = structuredClone(t.battle!.game);
      game.winnerId = game.players[0].id;
      t = applyCampaignAction(t, { type: 'finishBattle', game });
      for (const r of t.cardRewards) for (const id of r.options) {
        const d = cardDef(id);
        expect(d.kind).not.toBe('command');
        expect(d.race === undefined || CORE_RACES.includes(d.race)).toBe(true);
      }
    }
  });

  it('fights a battle through to its end, the AI playing it', () => {
    const s = run(3);
    const t = applyCampaignAction(s, { type: 'move', armyId: myArmy(s).id, toId: armyMoves(s, myArmy(s)).find((m) => m.battle)!.toId });
    const done = simulateBattle(t.battle!.game);
    expect(done.winnerId).toBeTruthy();
  });

  it('may take any hero won in a Power Struggle aboard', () => {
    const s = run();
    const army = myArmy(s);
    army.deck.push(GENERALS[2][1]);
    expect(army.deck.filter((id) => cardDef(id).kind === 'command')).toHaveLength(2);
  });
});

describe("Power Struggles on the Captain's runs", () => {
  /** Fight the struggle at the flagship's system and win it. */
  const winStruggle = (s: CampaignState, hero: string) => {
    s.struggle = { nodeId: myArmy(s).nodeId, hero };
    let t = applyCampaignAction(s, { type: 'struggle' });
    const game = structuredClone(t.battle!.game);
    game.winnerId = game.players[0].id;
    t = applyCampaignAction(t, { type: 'finishBattle', game });
    return t;
  };

  it('sets rival heroes of the core races on each galaxy map', () => {
    const s = run(11);
    const rivals = s.nodes.filter((n) => n.rival).map((n) => n.rival!);
    expect(rivals).toHaveLength(RIVAL_NODES);
    expect(new Set(rivals).size).toBe(RIVAL_NODES);
    for (const h of rivals) expect(CORE_RACES.some((r) => GENERALS[r].includes(h))).toBe(true);
  });

  it('won, asks the Captain: recruited, the hero joins the deck', () => {
    const hero = GENERALS[1][1];
    let t = winStruggle(run(5), hero);
    expect(t.beaten?.hero).toBe(hero);
    t = applyCampaignAction(t, { type: 'struggleChoice', recruit: true });
    expect(t.beaten).toBeUndefined();
    expect(myArmy(t).deck).toContain(hero);
  });

  it('won, slain: the hero is gone for good, their hoard taken', () => {
    const hero = GENERALS[2][2];
    let t = winStruggle(run(5), hero);
    const me = t.factions.find((f) => f.id === t.playerId)!;
    const [materials, petals, rewards] = [me.materials, t.petals, t.cardRewards.length];
    t = applyCampaignAction(t, { type: 'struggleChoice', recruit: false });
    const after = t.factions.find((f) => f.id === t.playerId)!;
    expect(after.materials).toBe(materials + SLAY_LOOT.materials);
    expect(t.petals).toBe(petals + SLAY_LOOT.petals);
    expect(t.cardRewards.length).toBe(rewards + 1);
    expect(t.cardRewards.at(-1)!.options.every((id) => cardDef(id).race === 2 && cardDef(id).rarity !== undefined)).toBe(true);
    expect(t.slain).toContain(hero);
    expect(myArmy(t).deck).not.toContain(hero);
  });
});

describe('Kinship', () => {
  it("lean the Captain's rewards: a big lean to the favoured race, a smaller one to the second", () => {
    let meta = { ...emptyMeta(), xp: 9999 };
    for (let i = 0; i < 5; i++) meta = buyUpgrade(meta, 'kinship');
    meta = setAffinity(setAffinity(meta, 'primary', 2), 'secondary', 0);
    const s = createCampaign({ seed: 3, captain: CAPTAIN, run: runBonuses(meta) });
    const me = s.factions.find((f) => f.id === s.playerId)!;
    expect(me.affinity).toMatchObject({ primary: 2, secondary: 0 });
    expect(raceWeight(me, 2)).toBe(5);
    expect(raceWeight(me, 0)).toBe(2);
    expect(raceWeight(me, 1)).toBe(1);
    expect(raceWeight(me, undefined)).toBe(1);
  });

  it('never favours one race twice', () => {
    const meta = setAffinity(setAffinity(emptyMeta(), 'primary', 1), 'secondary', 1);
    expect(meta.affinity).toEqual({ primary: undefined, secondary: 1 });
  });
});

