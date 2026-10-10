import { describe, expect, it } from 'vitest';
import {
  applyCampaignAction,
  armiesOf,
  armyMoves,
  buyUpgrade,
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
  starterAddProblem,
  legalIn,
  cardDef,
  buyStarterCard,
  levelOf,
  rarityOf,
  GENERALS,
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
    expect(start.y).toBe(s.nodes.find((n) => n.heart)!.y);
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
    let meta = { ...emptyMeta(), xp: 999, petals: 20 };
    // (Requisition needs Stockpile II: Stockpile is bought twice.)
    for (const id of ['materials', 'materials', 'hull', 'cards', 'pick', 'grace']) meta = buyUpgrade(meta, id);
    // A card bought into the race's starting deck with petals.
    meta = buyStarterCard(meta, 1, 'shard_tempest', 'dwarf');
    const s = createCampaign({ seed: 11, race: 1, run: runBonuses(meta, 1) });
    const plain = run(11);
    expect(flag(plain).deck).toHaveLength(CAMPAIGN.armySize);
    expect(flag(s).deck).toHaveLength(CAMPAIGN.armySize + 2);
    expect(flag(s).deck.filter((id) => id === 'shard_tempest').length).toBeGreaterThan(flag(plain).deck.filter((id) => id === 'shard_tempest').length);
    expect(campaignPlayer(s).materials).toBe(campaignPlayer(plain).materials + 6);
    expect(campaignPlayer(s).ship.hull).toBe(1);
    expect(s.cardRewards[0].source).toBe('Requisition');
    expect(universeStability(s)).toBe(universeStability(plain) + 1);
  });
});

describe('the skill tree', () => {
  it("brings the new branches' skills to the flagship: its battles, repair, finds, surrenders and rewards", () => {
    let meta = { ...emptyMeta(), xp: 9999 };
    for (const id of ['cryo', 'cryo', 'plating', 'abundance', 'scouts', 'scouts', 'dread', 'plunder', 'study', 'choice']) meta = buyUpgrade(meta, id);
    const run = runBonuses(meta, 1);
    expect(run.mods).toMatchObject({ startingHeat: -2, maxHealthDelta: 2, abundantDraw: 1 });
    const s = createCampaign({ seed: 11, race: 1, run });
    const plain = createCampaign({ seed: 11, race: 1, run: runBonuses(emptyMeta(), 1) });
    const b = armyBonus(s, flag(s));
    const p = armyBonus(plain, flag(plain));
    expect(b.mods.startingHeat ?? 0).toBe((p.mods.startingHeat ?? 0) - 2);
    expect(b.mods.abundantDraw ?? 0).toBe((p.mods.abundantDraw ?? 0) + 1);
    expect(b.loot).toBeCloseTo(p.loot + 0.2);
    expect(b.dread).toBe(p.dread + 1);
    expect(run).toMatchObject({ plunder: 2, choices: 1 });
    expect(run.xpBonus).toBeCloseTo(0.1);
  });
});

describe('a point taken back', () => {
  it('refunds its XP', () => {
    let meta = { ...emptyMeta(), xp: 100 };
    meta = buyUpgrade(buyUpgrade(meta, 'cryo'), 'cryo');
    const after = refundUpgrade(meta, 'cryo');
    expect(after.upgrades.cryo).toBe(1);
    expect(after.xp).toBe(meta.xp + 35);
    expect(refundUpgrade(after, 'cryo')).toMatchObject({ xp: 100, upgrades: {} });
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
  it('buys the skill tree with XP, a tier at a time, and unlocks races and heroes with petals', () => {
    let meta = { ...emptyMeta(), petals: 12 };
    expect(raceUnlocked(meta, 0)).toBe(true);
    expect(raceUnlocked(meta, 5)).toBe(false);
    expect(heroUnlocked(meta, GENERALS[0][0])).toBe(true);
    expect(heroUnlocked(meta, GENERALS[0][1])).toBe(false);
    meta = buyUpgrade(meta, 'race:5');
    expect(raceUnlocked(meta, 5)).toBe(true);
    expect(meta.petals).toBe(2);
    // The skill tree costs XP, and each tier needs the one below it.
    expect(buyUpgradeProblem(meta, 'materials')).toMatch(/XP/);
    expect(buyUpgradeProblem({ ...meta, xp: 999 }, 'march')).toMatch(/first/);
    let rich = { ...meta, xp: 999 };
    for (const id of ['hull', 'hull', 'shields', 'walls', 'march']) rich = buyUpgrade(rich, id);
    expect(levelOf(rich, 'march')).toBe(1);
    expect(rich.petals).toBe(2);
    expect(buyUpgradeProblem(rich, 'march')).toMatch(/most/);
  });
});
