import { describe, expect, it } from 'vitest';
import {
  applyCampaignAction,
  armiesOf,
  armyMoves,
  buyUpgrade,
  levelFor,
  pointsLeft,
  xpForLevel,
  buyUpgradeProblem,
  CAMPAIGN,
  campaignPlayer,
  createCampaign,
  emptyMeta,
  heroUnlocked,
  nodeById,
  raceUnlocked,
  regionalStability,
  runBonuses,
  universeStability,
  wormholePetals,
  STARTER_OFFERS,
  armyBonus,
  migrateMeta,
  refundUpgrade,
  TREE_PETALS,
  resetSkills,
  resetSkillsProblem,
  SKILL_RESET_PETALS,
  starterAddProblem,
  legalIn,
  cardDef,
  buyStarterCard,
  removeStarterCard,
  levelOf,
  rarityOf,
  GENERALS,
  META_UPGRADES,
  type CampaignState,
} from '../src/engine';

const run = (seed = 11, meta = emptyMeta()) => createCampaign({ seed, race: 1, run: runBonuses(meta) });
const flag = (s: CampaignState) => armiesOf(s, s.playerId)[0];
const col = (s: CampaignState, c: number) => s.nodes.filter((n) => n.col === c);
/** Read every story scene, so actions aren't held up by them. */
const read = (s: CampaignState) => {
  while (s.story.queue.length) s = applyCampaignAction(s, { type: 'readStory' });
  return s;
};
/** Hand back the current battle as a win for its attacker. */
const win = (s: CampaignState) => {
  const game = structuredClone(s.battle!.game);
  game.winnerId = game.players[0].id;
  return applyCampaignAction(s, { type: 'finishBattle', game });
};
/** End the turn, auto-resolving any battle the raiders start, until it is the player's again. */
const endTurn = (s: CampaignState) => {
  s = read(s);
  while (s.cardRewards.length) s = applyCampaignAction(s, { type: 'chooseCard', defId: null });
  s = applyCampaignAction(s, { type: 'endTurn' });
  for (let g = 0; g < 10 && s.battle && !s.winner; g++) s = applyCampaignAction(s, { type: 'finishBattle', game: s.battle.game, auto: true });
  return read(s);
};
/** Put the player's flagship in a system (as if it had flown there), owned by them. */
const standAt = (s: CampaignState, id: string) => {
  const n = nodeById(s, id);
  n.owner = s.playerId;
  flag(s).nodeId = id;
};

describe('the strip', () => {
  it('lays out lanes of systems the length of the strip, with the wormhole past the far end', () => {
    const s = run();
    // The arrival alone at the near end, the lanes between, the wormhole past the far end.
    expect(s.nodes.filter((n) => !n.challenge)).toHaveLength(1 + CAMPAIGN.lanes * (CAMPAIGN.columns - 1) + 1);
    const start = nodeById(s, flag(s).nodeId);
    expect(start.links).toHaveLength(CAMPAIGN.lanes);
    expect(start.col).toBe(0);
    const hole = s.nodes.find((n) => n.heart)!;
    expect(hole.col).toBe(CAMPAIGN.columns);
    // Routes only join neighbouring columns (or lanes within one), and every lane runs the whole way.
    for (const n of s.nodes) for (const l of n.links) expect(Math.abs((nodeById(s, l).col ?? 0) - (n.col ?? 0))).toBeLessThanOrEqual(1);
    for (const n of col(s, CAMPAIGN.columns - 1)) expect(n.links).toContain(hole.id);
    // Connected end to end.
    const seen = new Set([s.nodes[0].id]);
    const queue = [s.nodes[0].id];
    while (queue.length) for (const l of nodeById(s, queue.shift()!).links) if (!seen.has(l)) seen.add(l), queue.push(l);
    expect(seen.size).toBe(s.nodes.length);
    // The flagship arrives at the near end, in a system of its own; the strip is tougher further along.
    expect(nodeById(s, flag(s).nodeId).col).toBe(0);
    expect(nodeById(s, flag(s).nodeId).owner).toBe(s.playerId);
    expect(Math.max(...col(s, CAMPAIGN.columns - 1).map((n) => n.tier))).toBeGreaterThan(Math.max(...col(s, 1).map((n) => n.tier)));
    // Stations, worlds with extras, and no raiders.
    expect(s.nodes.filter((n) => n.station?.kind === 'armory')).toHaveLength(CAMPAIGN.armories);
    expect(s.nodes.filter((n) => n.station?.kind === 'research')).toHaveLength(CAMPAIGN.researchStations);
    expect(s.nodes.filter((n) => n.bonus)).toHaveLength(CAMPAIGN.bonusPlanets);
    expect(s.armies.filter((a) => a.lost)).toHaveLength(0);
  });

  it('starts the flagship with ten cards, and the bought upgrades on top', () => {
    let meta = { ...emptyMeta(), xp: 999, petals: 999 };
    // (Requisition needs Stockpile II: Stockpile is bought twice.)
    for (const id of ['materials', 'materials', 'cards', 'pick', 'grace', 'heirloom']) meta = buyUpgrade(meta, id);
    // A card bought into the race's starting deck with petals.
    meta = buyStarterCard(meta, 1, 'shard_tempest', 'dwarf');
    const s = createCampaign({ seed: 11, race: 1, run: runBonuses(meta, 1) });
    const plain = run(11);
    expect(flag(plain).deck).toHaveLength(CAMPAIGN.armySize);
    expect(flag(s).deck).toHaveLength(CAMPAIGN.armySize + 2);
    expect(flag(s).deck.filter((id) => id === 'shard_tempest').length).toBeGreaterThan(flag(plain).deck.filter((id) => id === 'shard_tempest').length);
    expect(campaignPlayer(s).materials).toBe(campaignPlayer(plain).materials + 6);
    // An Heirloom: a Stellar emblem from the start.
    expect(campaignPlayer(s).relics).toHaveLength(1);
    expect(campaignPlayer(s).relics![0].rarity).toBe('stellar');
    expect(campaignPlayer(plain).relics ?? []).toHaveLength(0);
    expect(s.cardRewards[0].source).toBe('Requisition');
    expect(universeStability(s)).toBe(universeStability(plain) + 1);
  });
});

describe('the skill tree', () => {
  it("brings the branches' skills to the flagship: its battles, finds and rewards", () => {
    let meta = { ...emptyMeta(), xp: 9999, petals: 9999 };
    for (const id of ['cryo', 'cryo', 'plating', 'abundance', 'scouts', 'scouts', 'plunder', 'choice', 'study', 'study', 'petals', 'tithe', 'legacy', 'grace', 'grace', 'armory', 'hoard', 'stock']) meta = buyUpgrade(meta, id);
    const run = runBonuses(meta, 1);
    expect(run.mods).toMatchObject({ startingHeat: -2, maxHealthDelta: 2, abundantDraw: 1 });
    const s = createCampaign({ seed: 11, race: 1, run });
    const plain = createCampaign({ seed: 11, race: 1, run: runBonuses(emptyMeta(), 1) });
    const b = armyBonus(s, flag(s));
    const p = armyBonus(plain, flag(plain));
    expect(b.mods.startingHeat ?? 0).toBe((p.mods.startingHeat ?? 0) - 2);
    expect(b.mods.abundantDraw ?? 0).toBe((p.mods.abundantDraw ?? 0) + 1);
    expect(b.loot).toBeCloseTo(p.loot + 0.2);
    expect(run).toMatchObject({ plunder: 2, choices: 1, legacy: 1, stock: 3 });
    expect(run.xpBonus).toBeCloseTo(0.2);
  });
});

describe('the reworked skill tree', () => {
  it('has no skill that needs an emblem, nor one for systems surrendering', () => {
    for (const u of META_UPGRADES) expect(`${u.name} ${u.text}`.toLowerCase()).not.toMatch(/paradise|surrender|flagship|hull/);
  });

  it('Aligned worlds: every planet gives more again', () => {
    let meta = { ...emptyMeta(), xp: 9999, petals: 9999 };
    for (const id of ['abundance', 'abundance', 'foundry', 'coldworld', 'aligned']) meta = buyUpgrade(meta, id);
    expect(runBonuses(meta).mods).toMatchObject({ abundantDraw: 3, industrialPlays: 2, deadCool: 4 });
  });

  it('Quartermaster: every armoury stocks 3 more cards', () => {
    let meta = { ...emptyMeta(), xp: 9999, petals: 9999 };
    for (const id of ['grace', 'grace', 'armory', 'hoard', 'stock']) meta = buyUpgrade(meta, id);
    const s = createCampaign({ seed: 11, race: 1, run: runBonuses(meta, 1) });
    const shop = (x: typeof s) => x.nodes.flatMap((n) => (n.station?.kind === 'armory' ? [n.station.cards.length] : []))[0];
    expect(shop(s)).toBe(shop(run(11)) + 3);
  });
});

describe('a skill taken back', () => {
  it('gives its petals back', () => {
    let meta = { ...emptyMeta(), xp: 100, petals: 20 };
    meta = buyUpgrade(buyUpgrade(meta, 'cryo'), 'cryo');
    expect(meta.petals).toBe(20 - 2 * TREE_PETALS[1]);
    const after = refundUpgrade(meta, 'cryo');
    expect(after.upgrades.cryo).toBe(1);
    expect(after.petals).toBe(20 - TREE_PETALS[1]);
    expect(refundUpgrade(after, 'cryo')).toMatchObject({ xp: 100, petals: 20, upgrades: {} });
  });
});

describe('the skill tree reset', () => {
  it("gives back every skill's petals, less 5, keeping unlocks and experience", () => {
    let meta = { ...emptyMeta(), xp: 999, petals: 30 };
    meta = buyUpgrade(buyUpgrade(buyUpgrade(meta, 'cryo'), 'cryo'), 'race:4');
    const reset = resetSkills(meta);
    expect(SKILL_RESET_PETALS).toBe(5);
    expect(reset.petals).toBe(meta.petals + 2 * TREE_PETALS[1] - 5);
    expect(reset.upgrades).toEqual({ 'race:4': 1 });
    expect(reset.xp).toBe(999);
  });
  it('needs a skill to reset, and 5 petals in all', () => {
    expect(resetSkillsProblem({ ...emptyMeta(), petals: 20 })).toBeTruthy();
    expect(resetSkillsProblem(buyUpgrade({ ...emptyMeta(), petals: 3 }, 'cryo'))).toBeTruthy();
    expect(resetSkillsProblem(buyUpgrade({ ...emptyMeta(), petals: 5 }, 'cryo'))).toBeNull();
  });
});

describe('commander levels', () => {
  it('a point for every level, each level needing a little more experience', () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, need: 26 });
    expect(levelFor(26).level).toBe(2);
    expect(levelFor(xpForLevel(10)).level).toBe(10);
    expect(xpForLevel(3) - xpForLevel(2)).toBeGreaterThan(xpForLevel(2) - xpForLevel(1));
    expect(pointsLeft({ ...emptyMeta(), xp: xpForLevel(5) })).toBe(4);
  });
  it('brings an older save over: the XP it spent counts again, and it keeps every skill it bought', () => {
    const old = { ...emptyMeta(), v: 1, xp: 10, upgrades: { cryo: 2, plating: 1 } };
    const now = migrateMeta(old);
    expect(now.v).toBe(3);
    // (Cryo 20 + 35, Stellar plating 45: spent, and earned all the same.)
    expect(now.xp).toBeGreaterThanOrEqual(10 + 20 + 35 + 45);
    expect(pointsLeft(now)).toBeGreaterThanOrEqual(0);
    expect(now.upgrades).toEqual(old.upgrades);
  });
  it('earns experience from a battle lost, too', () => {
    expect(CAMPAIGN.xpBattleLost).toBeGreaterThan(0);
  });
});

describe('skills taken out of the tree', () => {
  it('give back the XP spent on them', () => {
    const meta = migrateMeta({ ...emptyMeta(), xp: 10, upgrades: { doctrine: 2, secondsun: 1, cryo: 1 } });
    expect(meta.xp).toBe(10 + 25 + 50 + 200);
    expect(meta.upgrades).toEqual({ cryo: 1 });
  });
});

describe('starter offers', () => {
  it('offers each race two white dwarf, two stellar and two anomaly cards, legal in its mode, each bought once', () => {
    STARTER_OFFERS.forEach((ids, r) => {
      expect(ids.map((id) => cardDef(id).rarity ?? 'dwarf')).toEqual(['dwarf', 'dwarf', 'stellar', 'stellar', 'anomaly', 'anomaly']);
      for (const id of ids) expect(legalIn(r < 4 ? 'core' : 'lost', id)).toBe(true);
    });
    let meta = { ...emptyMeta(), petals: 50 };
    expect(starterAddProblem(meta, 0, 'shard_tempest', 'dwarf')).toMatch(/offered/);
    meta = buyStarterCard(meta, 0, 'dawnblade', 'dwarf');
    expect(starterAddProblem(meta, 0, 'dawnblade', 'dwarf')).toMatch(/Already/);
    // Bought once, for good: taken out and put back in, it costs nothing the second time.
    const after = meta.petals;
    meta = removeStarterCard(meta, 0, 0);
    expect(meta.deck[0]).toEqual([]);
    meta = buyStarterCard(meta, 0, 'dawnblade', 'dwarf');
    expect(meta.petals).toBe(after);
    expect(meta.deck[0]).toEqual(['dawnblade']);
  });
});

describe('the collapse', () => {
  it('gives way a column a turn from the near end, once stability runs out, marking each a turn ahead', () => {
    let s = run();
    expect(regionalStability(s)).toBe(CAMPAIGN.stabilityTurns);
    // Keep the flagship (and the raiders) well clear, out at the far end.
    standAt(s, col(s, CAMPAIGN.columns - 1)[0].id);
    s.armies = s.armies.filter((a) => !a.lost);
    for (let t = 0; t < CAMPAIGN.stabilityTurns; t++) s = endTurn(s);
    expect(regionalStability(s)).toBe(0);
    expect(col(s, 0).every((n) => n.collapsing)).toBe(true);
    s = endTurn(s);
    expect(col(s, 0).every((n) => n.collapsed)).toBe(true);
    expect(col(s, 1).every((n) => n.collapsing)).toBe(true);
    // Collapsed systems can't be entered.
    for (const m of armyMoves(s, flag(s))) expect(nodeById(s, m.toId).collapsed).toBeFalsy();
  });

  it('ends the run when the flagship is caught in it', () => {
    let s = run();
    s.armies = s.armies.filter((a) => !a.lost);
    for (let t = 0; t < CAMPAIGN.stabilityTurns + 1 && !s.winner; t++) s = endTurn(s);
    expect(s.winner).toBe('none');
    expect(armiesOf(s, s.playerId)).toHaveLength(0);
    expect(() => applyCampaignAction(s, { type: 'endTurn' })).toThrow(/over/);
  });

  it('comes sooner in every new universe', () => {
    const s = run();
    const first = universeStability(s);
    s.universe = 2;
    expect(universeStability(s)).toBe(first - CAMPAIGN.stabilityStep);
    s.universe = 9;
    expect(universeStability(s)).toBe(CAMPAIGN.stabilityMin);
  });
});

describe('finds', () => {
  it('scatters systems with nothing to fight, taken (and counted) just by flying in', () => {
    // (Several on a strip, on average: one strip by chance may hold few.)
    const strips = [11, 12, 13, 14, 15].map((seed) => read(run(seed)));
    const counts = strips.map((x) => x.nodes.filter((n) => n.cache).length);
    expect(counts.reduce((a, b) => a + b, 0) / counts.length).toBeGreaterThan(3);
    let s = strips.find((x) => x.nodes.some((n) => n.cache?.kind === 'materials'))!;
    const n = s.nodes.find((x) => x.cache?.kind === 'materials')!;
    const there = nodeById(s, n.links[0]);
    standAt(s, there.id);
    expect(armyMoves(s, flag(s)).find((m) => m.toId === n.id)?.battle).toBe(false);
    const before = campaignPlayer(s);
    const had = { materials: before.materials };
    const { amount } = n.cache!;
    s = applyCampaignAction(s, { type: 'move', armyId: flag(s).id, toId: n.id });
    expect(s.battle).toBeNull();
    expect(nodeById(s, n.id).owner).toBe(s.playerId);
    expect(nodeById(s, n.id).cache).toBeUndefined();
    expect(s.conquered).toBe(1);
    const now = campaignPlayer(s);
    const got = now.materials - had.materials;
    expect(got).toBe(amount);
  });
});

describe('relic finds', () => {
  it('a system can hold a relic, worn as soon as the flagship flies in', () => {
    const strips = [11, 12, 13, 14, 15, 16, 17, 18].map((seed) => read(run(seed)));
    let s = strips.find((x) => x.nodes.some((n) => n.cache?.kind === 'relic'))!;
    expect(s).toBeTruthy();
    const n = s.nodes.find((x) => x.cache?.kind === 'relic')!;
    standAt(s, n.links[0]);
    const had = campaignPlayer(s).relics?.length ?? 0;
    s = applyCampaignAction(s, { type: 'move', armyId: flag(s).id, toId: n.id });
    expect(s.battle).toBeNull();
    expect(campaignPlayer(s).relics?.length).toBe(had + 1);
  });
});

describe('conquest', () => {
  it('pays once for a system conquered, and counts it, with no choice to make', () => {
    let s = read(run());
    // (No finds in the way: every neighbour a battle.)
    for (const n of s.nodes) delete n.cache;
    const me = () => campaignPlayer(s);
    const target = armyMoves(s, flag(s)).find((m) => m.battle)!.toId;
    const pay = { ...nodeById(s, target).yield };
    const before = me().materials;
    s = applyCampaignAction(s, { type: 'move', armyId: flag(s).id, toId: target });
    s = win(s);
    expect(s.conquest).toBeNull();
    expect(me().materials - before).toBeGreaterThanOrEqual(pay.materials + CAMPAIGN.winMaterials);
    expect(nodeById(s, target).owner).toBe(s.playerId);
    expect(s.conquered).toBe(1);
    expect(flag(s).nodeId).toBe(target);
    // No income by the turn.
    const c = me().materials;
    s = endTurn(s);
    expect(me().materials).toBe(c);
  });
});

describe('the wormhole', () => {
  it('takes the flagship into a harder universe once its guardian is beaten, with petals for the strip conquered', () => {
    let s = read(run());
    s.armies = s.armies.filter((a) => !a.lost);
    const hole = s.nodes.find((n) => n.heart)!;
    standAt(s, col(s, CAMPAIGN.columns - 1)[0].id);
    s.conquered = 10;
    const petals = wormholePetals(s);
    expect(petals).toBeGreaterThan(CAMPAIGN.petalBase);
    const tier = hole.tier;
    s = applyCampaignAction(s, { type: 'move', armyId: flag(s).id, toId: hole.id });
    expect(s.battle?.nodeId).toBe(hole.id);
    s = read(win(s));
    expect(s.universe).toBe(2);
    // The wormhole's petals, and the Overlord's bounty: petals, and a pick of two rare-or-better cards.
    expect(s.petals).toBe(petals + CAMPAIGN.bossPetals);
    // And experience: the battle, the boss, the galaxy crossed.
    expect(s.xp).toBeGreaterThanOrEqual(CAMPAIGN.xpBattle + CAMPAIGN.xpBoss + CAMPAIGN.xpGalaxy);
    const hoard = s.cardRewards.find((r) => /hoard/.test(r.source))!;
    expect(hoard.options).toHaveLength(CAMPAIGN.bossCardChoices);
    expect(hoard.options.every((id) => rarityOf(id) !== 'dwarf')).toBe(true);
    while (s.cardRewards.length && !/hoard/.test(s.cardRewards[0].source)) s = applyCampaignAction(s, { type: 'chooseCard', defId: null });
    const before = flag(s).deck.length;
    s = applyCampaignAction(s, { type: 'chooseCard', defId: hoard.options[0] });
    expect(flag(s).deck).toHaveLength(before + 1);
    expect(nodeById(s, flag(s).nodeId).col).toBe(0);
    expect(s.nodes.find((n) => n.heart)!.tier).toBeGreaterThan(tier);
    expect(regionalStability(s)).toBe(CAMPAIGN.stabilityTurns - CAMPAIGN.stabilityStep);
    // Banked once.
    s = applyCampaignAction(s, { type: 'petalsBanked' });
    expect(s.petalsBanked).toBe(s.petals);
  });
});

describe('progress between runs', () => {
  it('buys the skill tree with points, a tier at a time, and unlocks races and heroes with petals', () => {
    let meta = { ...emptyMeta(), petals: 12 };
    expect(raceUnlocked(meta, 0)).toBe(true);
    expect(raceUnlocked(meta, 5)).toBe(false);
    expect(heroUnlocked(meta, GENERALS[0][0])).toBe(true);
    expect(heroUnlocked(meta, GENERALS[0][1])).toBe(false);
    meta = buyUpgrade(meta, 'race:5');
    expect(raceUnlocked(meta, 5)).toBe(true);
    expect(meta.petals).toBe(2);
    // The skill tree costs petals (by tier), and each tier needs the one below it.
    expect(buyUpgradeProblem(meta, 'materials')).toMatch(/petals/);
    expect(buyUpgradeProblem({ ...meta, petals: 999 }, 'bastion')).toMatch(/first/);
    let rich = { ...meta, petals: 999 };
    for (const id of ['walls', 'walls', 'shields', 'bastion']) rich = buyUpgrade(rich, id);
    expect(levelOf(rich, 'bastion')).toBe(1);
    expect(rich.petals).toBe(999 - 2 * TREE_PETALS[1] - 2 * TREE_PETALS[2]);
    expect(buyUpgradeProblem(rich, 'bastion')).toMatch(/most/);
    // Bastion: the Guards stand thicker in every battle.
    expect(runBonuses(rich).mods?.guardDefence).toBe(2);
  });
});

describe('map variety', () => {
  it('lays every map out clear: systems never on top of one another, all on the map, secrets off any lane', async () => {
    const { buildUniverse, CAMPAIGN: C } = await import('../src/engine/campaign');
    const lanes = new Set<number>();
    for (const layout of ['strip', 'spiral'] as const)
      for (let seed = 1; seed <= 25; seed++) {
        const s = createCampaign({ seed, race: 0 });
        buildUniverse(s, 2, layout);
        expect(s.layout).toBe(layout);
        for (const n of s.nodes) {
          expect(n.x).toBeGreaterThanOrEqual(0);
          expect(n.y).toBeGreaterThanOrEqual(0);
          expect(n.x).toBeLessThanOrEqual(C.mapWidth);
          expect(n.y).toBeLessThanOrEqual(C.mapHeight);
          for (const m of s.nodes) if (m !== n) expect(Math.hypot(m.x - n.x, m.y - n.y)).toBeGreaterThan(150);
        }
        for (const n of s.nodes.filter((x) => x.challenge)) lanes.add(nodeById(s, n.challenge!.from).lane!);
      }
    // (Secret systems hang off the middle lane too, not only the outer ones.)
    expect(lanes.has(1)).toBe(true);
  });
  it('rewards lean rarer through every wormhole', async () => {
    const { offerWeight } = await import('../src/engine/campaign');
    const share = (u: number) => offerWeight('anomaly', u) / offerWeight('dwarf', u);
    expect(share(3)).toBeGreaterThan(share(1));
    expect(offerWeight('stellar', 4) / offerWeight('dwarf', 4)).toBeGreaterThan(offerWeight('stellar', 1) / offerWeight('dwarf', 1));
  });
});

describe('emblems', () => {
  it('are never found twice: no power, nor curse, the flagship already holds', async () => {
    const { makeRelic } = await import('../src/engine/heroes');
    const held: ReturnType<typeof makeRelic>[] = [];
    for (let i = 0; i < 24; i++) held.push(makeRelic(`r${i}`, 'weapon', 'stellar', 0, (i * 0.37) % 1, false, held));
    const powers = held.map((r) => r.power);
    expect(new Set(powers).size).toBe(powers.length);
    const curses: ReturnType<typeof makeRelic>[] = [];
    for (let i = 0; i < 3; i++) curses.push(makeRelic(`c${i}`, 'helm', 'dwarf', 0, 0.1, true, curses));
    expect(new Set(curses.map((r) => r.text)).size).toBe(3);
  });
});

describe('stations', () => {
  it('are pit stops: flown into without a battle, never taken', () => {
    for (const kind of ['armory', 'research'] as const) {
      let s = run(11);
      const st = s.nodes.find((n) => n.station?.kind === kind)!;
      const from = s.nodes.find((n) => n.links.includes(st.id) && !n.station && !n.challenge && !n.heart)!;
      standAt(s, from.id);
      const army = flag(s);
      army.moved = false;
      army.steps = 0;
      expect(armyMoves(s, army).find((m) => m.toId === st.id)?.battle).toBe(false);
      s = applyCampaignAction(s, { type: 'move', armyId: army.id, toId: st.id });
      expect(s.battle).toBeFalsy();
      expect(flag(s).nodeId).toBe(st.id);
      expect(nodeById(s, st.id).owner ?? null).toBeNull();
    }
  });
});
