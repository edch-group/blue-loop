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
    expect(s.nodes).toHaveLength(1 + CAMPAIGN.lanes * (CAMPAIGN.columns - 1) + 1);
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
    let meta = { ...emptyMeta(), petals: 200 };
    for (const id of ['materials', 'hull', 'cards', 'pick', 'grace']) meta = buyUpgrade(meta, id);
    const s = run(11, meta);
    const plain = run(11);
    expect(flag(plain).deck).toHaveLength(CAMPAIGN.armySize);
    expect(flag(s).deck).toHaveLength(CAMPAIGN.armySize + 1);
    expect(campaignPlayer(s).materials).toBe(campaignPlayer(plain).materials + 3);
    expect(campaignPlayer(s).ship.hull).toBe(1);
    expect(s.cardRewards[0].source).toBe('Requisition');
    expect(universeStability(s)).toBe(universeStability(plain) + 1);
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
    let s = strips[counts.indexOf(Math.max(...counts))];
    const finds = s.nodes.filter((n) => n.cache);
    const n = finds.find((x) => x.cache!.kind !== 'cards')!;
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
    expect(s.petals).toBe(petals);
    expect(nodeById(s, flag(s).nodeId).col).toBe(0);
    expect(s.nodes.find((n) => n.heart)!.tier).toBeGreaterThan(tier);
    expect(regionalStability(s)).toBe(CAMPAIGN.stabilityTurns - CAMPAIGN.stabilityStep);
    // Banked once.
    s = applyCampaignAction(s, { type: 'petalsBanked' });
    expect(s.petalsBanked).toBe(s.petals);
  });
});

describe('petals between runs', () => {
  it('buys upgrades level by level, and unlocks races and heroes', () => {
    let meta = { ...emptyMeta(), petals: 12 };
    expect(raceUnlocked(meta, 0)).toBe(true);
    expect(raceUnlocked(meta, 5)).toBe(false);
    expect(heroUnlocked(meta, GENERALS[0][0])).toBe(true);
    expect(heroUnlocked(meta, GENERALS[0][1])).toBe(false);
    meta = buyUpgrade(meta, 'race:5');
    expect(raceUnlocked(meta, 5)).toBe(true);
    expect(meta.petals).toBe(2);
    expect(buyUpgradeProblem(meta, 'march')).toMatch(/petals/);
    expect(buyUpgradeProblem({ ...meta, petals: 99, upgrades: { march: 1 } }, 'march')).toMatch(/most/);
  });
});
