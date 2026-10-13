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
  pointsLeft,
  xpForLevel,
  migrateMeta,
  resetCaptain,
  swapPartProblem,
  raceWeight,
  runBonuses,
  setAffinity,
  buyUpgrade,
  shipFit,
  fitPart,
  stowParts,
  armyBonus,
  warpReach,
  SHIP_PARTS,
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

  it('is bought up with skill points: stats in order, abilities carried while a slot is free', () => {
    let meta = { ...emptyMeta(), xp: xpForLevel(11) };
    expect(pointsLeft(meta)).toBe(10);
    meta = buyCaptain(meta, { kind: 'stat', stat: 'attack' });
    expect(pointsLeft(meta)).toBe(9);
    meta = buyCaptain(meta, { kind: 'ability', id: 'volley' });
    // (One slot, Brace in it: Volley is learnt but left behind until there's room.)
    expect(meta.captain!.equipped).toEqual(['brace']);
    meta = equipCaptainAbility(equipCaptainAbility(meta, 'brace'), 'volley');
    expect(meta.captain!.equipped).toEqual(['volley']);
    expect(cardDef(captainCard(meta)).abilities?.map((a) => a.id)).toEqual(['volley']);
    expect(captainBuyProblem({ ...meta, xp: 0 }, { kind: 'stat', stat: 'stability' })).toMatch(/point/);
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

describe('Kinship and Fellowship', () => {
  it("lean the Captain's rewards: a big lean to the favoured race, a smaller one to the second", () => {
    let meta = { ...emptyMeta(), petals: 999 };
    for (const id of ['kinship', 'kinship', 'kinship', 'fellowship', 'fellowship']) meta = buyUpgrade(meta, id);
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

describe('the ship and its parts', () => {
  it('adds up what is fitted: armour, shields, a weapon on its own side, boosters, the warp drive', () => {
    const fit = shipFit({ armour: 'ceramic_armour', shield: 'halo_generator', port: 'nova_lance', starboard: 'pulse_cannon', booster: 'afterburners', warp: 'fold_drive' });
    expect(fit).toMatchObject({ health: 4, shields: 2, shieldPerTurn: 1, guns: [2, 2, 0, 1, 1], cool: 1, march: 1, warp: 2.3 });
  });

  it('fits only a part in the hangar, only in a slot of its kind, and only in one slot at once', () => {
    let meta = stowParts({ ...emptyMeta() }, ['pulse_cannon', 'pulse_cannon', 'scrap_plating']);
    expect(meta.hangar).toEqual(['pulse_cannon', 'scrap_plating']);
    expect(fitPart(meta, 'armour', 'pulse_cannon').fitted).toBeUndefined();
    expect(fitPart(meta, 'armour', 'aegis_hull').fitted).toBeUndefined();
    meta = fitPart(meta, 'port', 'pulse_cannon');
    meta = fitPart(meta, 'starboard', 'pulse_cannon');
    expect(meta.fitted).toEqual({ starboard: 'pulse_cannon' });
    expect(fitPart(meta, 'starboard', null).fitted).toEqual({});
  });

  it("goes with the Captain's battles: more health, guns on a side, shields up", () => {
    let meta = stowParts(emptyMeta(), ['ceramic_armour', 'nova_lance', 'aegis_projector']);
    meta = fitPart(fitPart(fitPart(meta, 'armour', 'ceramic_armour'), 'port', 'nova_lance'), 'shield', 'aegis_projector');
    const s = createCampaign({ seed: 4, captain: CAPTAIN, run: runBonuses(meta) });
    const b = armyBonus(s, myArmy(s));
    expect(b.mods.maxHealthDelta).toBe(4);
    expect(b.slotGuns).toEqual([2, 2, 0, 0, 0]);
    expect(b.openShields).toBe(2);
  });

  it('with a warp drive, jumps to systems near by that no route links', () => {
    const plain = createCampaign({ seed: 9, captain: CAPTAIN });
    expect(warpReach(plain, myArmy(plain))).toEqual([]);
    const meta = fitPart(stowParts(emptyMeta(), ['fold_drive']), 'warp', 'fold_drive');
    const s = createCampaign({ seed: 9, captain: CAPTAIN, run: runBonuses(meta) });
    // (From the middle of the strip, where some systems near by have no route to it.)
    myArmy(s).nodeId = s.nodes.find((n) => n.col === 3 && n.lane === 1)!.id;
    const reach = warpReach(s, myArmy(s));
    expect(reach.length).toBeGreaterThan(0);
    const here = s.nodes.find((n) => n.id === myArmy(s).nodeId)!;
    for (const id of reach) expect(here.links).not.toContain(id);
    expect(armyMoves(s, myArmy(s)).some((m) => m.warp)).toBe(true);
  });

  it('every boss leaves a part, one not already in the hangar', () => {
    const have = SHIP_PARTS.slice(0, 5).map((p) => p.id);
    const s = createCampaign({ seed: 6, captain: CAPTAIN, run: runBonuses(stowParts(emptyMeta(), have)) });
    for (const n of s.nodes) delete n.cache;
    s.crystal = false;
    const heart = s.nodes.find((n) => n.heart)!;
    const army = myArmy(s);
    army.nodeId = heart.links[0];
    let t = applyCampaignAction(s, { type: 'move', armyId: army.id, toId: heart.id });
    const game = structuredClone(t.battle!.game);
    game.winnerId = game.players[0].id;
    t = applyCampaignAction(t, { type: 'finishBattle', game });
    expect(t.partsFound).toHaveLength(1);
    expect(have).not.toContain(t.partsFound![0]);
  });
});

describe('skill points for the Captain, petals for the skill tree', () => {
  it('brings an older save over: petals spent on the Captain back, the Captain plain, skills kept', () => {
    const old = { ...emptyMeta(), v: 2, petals: 1, upgrades: { cryo: 2 }, captain: { attack: 1, stability: 0, cheaper: 0, slots: 1, abilities: ['brace', 'volley'], equipped: ['brace', 'volley'], leads: [] } };
    const now = migrateMeta(old);
    expect(now.petals).toBe(1 + 5 + 6 + 5);
    expect(now.captain).toMatchObject({ attack: 0, slots: 0, abilities: ['brace'] });
    expect(now.upgrades).toEqual({ cryo: 2 });
    expect(now.v).toBe(4);
  });

  it("resets the Captain for 5 petals, every skill point back", () => {
    let meta = { ...emptyMeta(), xp: xpForLevel(6), petals: 7 };
    meta = buyCaptain(buyCaptain(meta, { kind: 'stat', stat: 'attack' }), { kind: 'ability', id: 'volley' });
    expect(pointsLeft(meta)).toBe(3);
    const reset = resetCaptain(meta);
    expect(pointsLeft(reset)).toBe(5);
    expect(reset.petals).toBe(2);
  });
});

describe('a part swapped at a space station', () => {
  it('fits a part from the hangar, once per station, and the run fights with it', () => {
    const meta = fitPart(stowParts(emptyMeta(), ['scrap_plating', 'ceramic_armour']), 'armour', 'scrap_plating');
    const s = createCampaign({ seed: 5, captain: CAPTAIN, run: runBonuses(meta) });
    const station = s.nodes.find((n) => n.station?.kind === 'armory')!;
    const army = myArmy(s);
    army.nodeId = station.id;
    const me = s.factions.find((f) => f.id === s.playerId)!;
    expect(swapPartProblem(s, me, station, 'armour', 'aegis_hull')).toMatch(/hangar/);
    expect(swapPartProblem(s, me, station, 'port', 'ceramic_armour')).toMatch(/fit/);
    let t = applyCampaignAction(s, { type: 'swapPart', nodeId: station.id, slot: 'armour', partId: 'ceramic_armour' });
    expect(t.run!.ship!.fitted.armour).toBe('ceramic_armour');
    expect(armyBonus(t, myArmy(t)).mods.maxHealthDelta).toBe(4);
    const st = t.nodes.find((n) => n.id === station.id)!;
    expect(swapPartProblem(t, t.factions.find((f) => f.id === t.playerId)!, st, 'armour', 'scrap_plating')).toMatch(/One part swap/);
  });
});

describe('Kinship split in two', () => {
  it("brings an older save over: Kinship's levels past the third become Fellowship's", () => {
    const now = migrateMeta({ ...emptyMeta(), v: 3, upgrades: { kinship: 5 } });
    expect(now.upgrades).toMatchObject({ kinship: 3, fellowship: 2 });
  });
});

