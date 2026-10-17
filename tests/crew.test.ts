import { describe, expect, it } from 'vitest';
import { applyCampaignAction, armiesOf, CAMPAIGN, createCampaign, type CampaignState } from '../src/engine/campaign';
import { CAPTAIN } from '../src/engine/captain';
import { OVERLORDS } from '../src/engine/cards-bosses';
import { applyAction, BOSS_RECHARGE, bossIntent, createGame, maxHand, overlordSlow } from '../src/engine/game';
import { bankCompanions, buyUpgrade, buyUpgradeProblem, captainLevel, emptyMeta, META_UPGRADES, migrateMeta, pointsLeft, runBonuses, xpForLevel, type MetaState } from '../src/engine/meta';
import { shipPart } from '../src/engine/parts';
import type { BattleModifiers } from '../src/engine/types';

const crew = () => META_UPGRADES.filter((u) => u.group === 'crew');
const rich = (): MetaState => ({ ...emptyMeta(), petals: 9999 });
const learn = (meta: MetaState, ...ids: string[]) => ids.reduce(buyUpgrade, meta);

describe("the crew's branch of the skill tree", () => {
  it('is shaped as every other branch: a first tier, two second tiers needing it, a capstone needing both', () => {
    const [holds, ...rest] = crew();
    expect(crew().map((u) => [u.id, u.tier, u.max])).toEqual([
      ['holds', 1, 2],
      ['mess', 2, 2],
      ['spares', 2, 1],
      ['pride', 3, 1],
    ]);
    expect(holds.requires).toBeUndefined();
    expect(rest[0].requires).toEqual([['holds', 1]]);
    expect(rest[1].requires).toEqual([['holds', 1]]);
    expect(rest[2].requires).toEqual([['mess', 1], ['spares', 1]]);
    // (Its prices on the others' scale.)
    expect([holds.cost(0), holds.cost(1), rest[0].cost(0), rest[0].cost(1), rest[1].cost(0), rest[2].cost(0)]).toEqual([20, 35, 40, 70, 70, 180]);
    expect(buyUpgradeProblem(rich(), 'pride')).toMatch(/Needs Mess hall I/);
    expect(buyUpgradeProblem(learn(rich(), 'holds', 'mess', 'spares'), 'pride')).toBeNull();
  });

  it('is at nothing in an older save', () => {
    const old = migrateMeta({ ...emptyMeta(), v: 4, upgrades: { cryo: 2 } });
    expect(crew().every((u) => !old.upgrades[u.id])).toBe(true);
    const run = runBonuses(old);
    expect(run.mods?.handSize).toBeUndefined();
    expect(run.mods?.overlordSlow).toBeUndefined();
    expect(run.spares).toBe(0);
  });

  it('Deep holds: more cards held after dusk in every battle', () => {
    const run = runBonuses(learn(rich(), 'holds', 'holds'));
    expect(run.mods).toMatchObject({ handSize: 2 });
    const g = createGame({ seed: 4, campaign: true, players: [{ name: 'A', isAI: false, modifiers: run.mods }, { name: 'B', isAI: true }] });
    expect(maxHand(g.players[0])).toBe(maxHand(g.players[1]) + 2);
  });

  it('Mess hall: a quarter more experience a level, for the Captain and every companion, with Study', () => {
    expect(runBonuses(learn(rich(), 'holds', 'mess', 'mess')).xpBonus).toBeCloseTo(0.5);
    expect(runBonuses(learn(rich(), 'study', 'holds', 'mess')).xpBonus).toBeCloseTo(0.35);
  });

  it("Spare parts: the Captain's run starts with a new common part in the hangar (a race's run, nothing)", () => {
    const meta = { ...learn(rich(), 'holds', 'spares'), hangar: ['scrap_plating', 'ion_boosters'] };
    const s = createCampaign({ seed: 9, captain: CAPTAIN, run: runBonuses(meta) });
    expect(s.partsFound).toHaveLength(1);
    const part = shipPart(s.partsFound![0])!;
    expect(part.rarity).toBe('dwarf');
    expect(meta.hangar).not.toContain(part.id);
    expect(createCampaign({ seed: 9, race: 1, run: runBonuses(meta, 1) }).partsFound ?? []).toHaveLength(0);
    // (Every common part already had: nothing.)
    const full = { ...meta, hangar: ['scrap_plating', 'shield_emitter', 'pulse_cannon', 'ion_boosters'] };
    expect(createCampaign({ seed: 9, captain: CAPTAIN, run: runBonuses(full) }).partsFound ?? []).toHaveLength(0);
  });

  it("Flagship's pride: a Lost Overlord's own action starts recharging, and recharges a day slower", () => {
    const lord = OVERLORDS[0];
    const mods = runBonuses(learn(rich(), 'holds', 'mess', 'spares', 'pride')).mods as BattleModifiers;
    expect(mods.overlordSlow).toBe(1);
    const battle = (modifiers?: BattleModifiers) =>
      createGame({ seed: 5, campaign: true, players: [{ name: 'Ada', isAI: false, modifiers }, { name: lord.name, isAI: true, deck: [], boss: true, tableau: [lord.hero, ...lord.parts] }] });
    expect(battle().players[1].boss!.charge).toBeUndefined();
    let s = battle(mods);
    expect(overlordSlow(s, s.players[1])).toBe(1);
    expect(s.players[1].boss!.charge).toBe(1);
    expect(bossIntent(s.players[1])?.card.defId).not.toBe(lord.hero);
    // Its own action taken: it recharges a day longer than it would.
    const hero = s.players[1].tableau.find((c) => c.defId === lord.hero)!;
    s.players[1].boss!.charge = undefined;
    s.players[1].boss!.intent = hero.uid;
    s.players[0].heat = 0;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[1].boss!.charge).toBe(BOSS_RECHARGE + 1);
  });
});

describe("experience: the Captain's and each companion's own", () => {
  const army = (s: CampaignState) => armiesOf(s, s.playerId)[0];
  const firstFight = (s: CampaignState) => {
    for (const n of s.nodes) delete n.cache;
    const a = army(s);
    const here = s.nodes.find((n) => n.id === a.nodeId)!;
    return here.links.map((id) => s.nodes.find((n) => n.id === id)!).find((n) => !n.station && !n.owner && !n.challenge)!;
  };
  /** A Captain's run with Kaelen and Mara found and aboard, its first battle fought and over (won or lost), unplayed. */
  const fought = (won: boolean, meta = emptyMeta()) => {
    const found = bankCompanions(meta, ['lancer', 'engineer'], {}, 0);
    const s = createCampaign({ seed: 3, captain: CAPTAIN, run: runBonuses(found) });
    const t = applyCampaignAction(s, { type: 'move', armyId: army(s).id, toId: firstFight(s).id });
    const g = structuredClone(t.battle!.game);
    g.winnerId = g.players[won ? 0 : 1].id;
    return { before: t, after: applyCampaignAction(t, { type: 'finishBattle', game: g }) };
  };

  it('every companion aboard learns from every battle, played or not: more for a win than a loss', () => {
    const win = fought(true).after;
    expect(win.companionXp).toEqual({ lancer: CAMPAIGN.crewXpBattle, engineer: CAMPAIGN.crewXpBattle });
    expect(win.loot?.crewXp).toEqual({ lancer: CAMPAIGN.crewXpBattle, engineer: CAMPAIGN.crewXpBattle });
    expect(win.loot?.xp).toBeGreaterThan(0);
    const loss = fought(false).after;
    expect(loss.companionXp).toEqual({ lancer: CAMPAIGN.crewXpBattleLost, engineer: CAMPAIGN.crewXpBattleLost });
    expect(loss.loot?.crewXp).toEqual({ lancer: CAMPAIGN.crewXpBattleLost, engineer: CAMPAIGN.crewXpBattleLost });
    // (The Captain learns too, win or lose.)
    expect((loss.xp ?? 0) - (fought(false).before.xp ?? 0)).toBe(CAMPAIGN.xpBattleLost);
  });

  it('Study and Mess hall: a share more for every companion too', () => {
    const meta = learn(rich(), 'study', 'study', 'holds', 'mess', 'mess');
    const { after } = fought(true, meta);
    expect(after.companionXp?.engineer).toBe(Math.round(CAMPAIGN.crewXpBattle * 1.7));
  });

  it("the Captain's experience is the old commander's: an older save keeps every level and point", () => {
    const old = migrateMeta({ ...emptyMeta(), v: 4, xp: xpForLevel(7) + 3 });
    expect(captainLevel(old.xp).level).toBe(7);
    expect(pointsLeft(old)).toBe(6);
  });
});
