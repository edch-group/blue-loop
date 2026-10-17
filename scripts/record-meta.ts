/**
 * The loop's lasting progress (meta.ts), as the TypeScript engine works it out, for the C# engine to work out the same
 * (engine-cs/Tests): every meta function called on seeded random MetaStates (old saves among them), and random walks of
 * buying, refunding, fitting and banking. Each case is a function's name, its arguments and what it returned (or the
 * error it threw). Written to engine-cs/traces/meta.json (not kept in git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { CARDS } from '../src/engine/cards';
import { SHIP_PARTS, SHIP_SLOTS, type PartSlot } from '../src/engine/parts';
import { GENERALS } from '../src/engine/story';
import { CAPTAIN_SINGULARITIES } from '../src/engine/singularities';
import { COMPANION_IDS } from '../src/engine/companions';
import { ascend, CAPTAIN_TREE, COMPANION_TREES, plainAscent, type Ascent, type AscentNode } from '../src/engine/ascent';
import * as M from '../src/engine/meta';
import type { MetaState, MetaUpgrade, MenuSection, CaptainBuy } from '../src/engine/meta';
import { nextRandom } from '../src/engine/rng';

const rng = { rngState: 7171 };
const rand = () => nextRandom(rng);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (most: number) => Math.floor(rand() * (most + 1));
const subset = <T>(xs: readonly T[], p: number): T[] => xs.filter(() => rand() < p);
const shuffled = <T>(xs: readonly T[]): T[] => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
const cases: { fn: string; args: unknown[]; out: unknown }[] = [];
// (Copied as they are now: an argument may be changed after.)
const snap = (x: unknown): unknown => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
const rec = (fn: string, args: unknown[], out: unknown) => cases.push({ fn, args: snap(args) as unknown[], out: snap(out) });
/** A call that may throw: what it returned, or the error. */
function attempt<T>(fn: string, args: unknown[], f: () => T): T | undefined {
  try {
    const out = f();
    rec(fn, args, out);
    return out;
  } catch (e) {
    rec(fn, args, { error: (e as Error).message });
    return undefined;
  }
}

const metaUpgradeData = ({ cost, ...u }: MetaUpgrade) => ({ ...u, costBase: cost(0), costStep: cost(1) - cost(0) });
const SECTIONS: MenuSection[] = ['captain', 'ship', 'stellari', ...COMPANION_IDS];
const RETIRED = ['doctrine', 'insight', 'calm', 'secondsun'];
const OLD_ABILITIES = ['patch', 'scout', 'volley', 'bulwark', 'vent', 'strafe', 'overdrive', 'rally', 'mend', 'nonsense'];
const OLD_LEADS = ['steady', 'iron', 'salvo', 'gunnery', 'nonsense'];
const HEROES = [...GENERALS.flat(), 'nobody'];
const SINGS = [...Object.keys(CAPTAIN_SINGULARITIES), 'nonsense'];
const ABILITIES = [...CAPTAIN_TREE.flatMap((n) => (n.give.ability ? [n.give.ability] : [])), 'patch', 'nonsense'];
const LEADS = [...CAPTAIN_TREE.flatMap((n) => (n.give.lead ? [n.give.lead] : [])), 'nonsense'];
const PART_IDS = SHIP_PARTS.map((p) => p.id);
const SLOT_IDS = SHIP_SLOTS.map((s) => s.id);
const UPGRADE_IDS = [...M.META_UPGRADES.map((u) => u.id), 'hull', 'race:9', 'nonsense'];

function walk(tree: AscentNode[], steps: number): Ascent {
  let a = plainAscent();
  for (let i = 0; i < steps; i++) a = ascend(tree, a, rand() < 0.25 ? 'gate' : pick(tree).id, 5);
  return a;
}

/** A random save: `full`, every skill bought and every part of it set (for runBonuses). */
function randomMeta(full = false): MetaState {
  const v = full ? 4 : pick([undefined, 1, 2, 3, 4, 4, 4, 4, 4]);
  const upgrades: Record<string, number> = {};
  for (const u of M.META_UPGRADES) {
    if (full) upgrades[u.id] = rand() < 0.7 ? u.max : 1 + int(u.max - 1 + (rand() < 0.1 ? 2 : 0));
    else if (rand() < 0.5) upgrades[u.id] = int(u.max + (rand() < 0.1 ? 3 : 0));
  }
  if (!full) {
    for (const id of RETIRED) if (rand() < 0.1) upgrades[id] = int(3);
    if (rand() < 0.1) upgrades.hull = int(2);
    if (rand() < 0.1) upgrades[`hero:${pick(HEROES)}`] = 1;
    if (rand() < 0.2) upgrades.kinship = int(6);
  }
  const byRace = (p: number) => Object.fromEntries(M.STARTER_OFFERS.flatMap((offer, r) => (rand() < p ? [[String(r), subset(offer, 0.4)]] : [])));
  const m: MetaState = {
    petals: rand() < 0.1 ? 0 : int(90),
    xp: rand() < 0.1 ? 0 : int(5000) + (rand() < 0.1 ? 0.5 : 0),
    ...(v !== undefined ? { v } : {}),
    upgrades,
    deck: byRace(0.5),
    best: int(6),
    runs: int(40),
  };
  if (rand() < 0.5) m.owned = byRace(0.5);
  if (rand() < 0.5) m.conquests = Object.fromEntries(subset([0, 1, 2, 3, 4, 5, 6, 7], 0.5).map((r) => [String(r), int(70)]));
  if (v !== undefined && v < 3 && rand() < 0.6) {
    m.captain = {
      attack: int(3), stability: int(4), cheaper: int(2), slots: int(2), abilities: subset(OLD_ABILITIES, 0.3), leads: subset(OLD_LEADS, 0.3),
    } as unknown as MetaState['captain'];
  } else if (full || rand() < 0.8) {
    if (rand() < 0.1 && !full) m.captain = { equipped: ['nonsense'] } as unknown as MetaState['captain'];
    else
      m.captain = {
        ...walk(CAPTAIN_TREE, int(16)),
        equipped: subset(ABILITIES, 0.3),
        ...(rand() < 0.5 ? { lead: pick(LEADS) } : {}),
        ...(rand() < 0.5 ? { sing: pick(SINGS) } : {}),
      };
  }
  if (full || rand() < 0.6) m.affinity = { ...(rand() < 0.8 ? { primary: int(3) } : {}), ...(rand() < 0.6 ? { secondary: int(3) } : {}) };
  if (full || rand() < 0.6) m.hangar = subset(PART_IDS, 0.4);
  if (full || rand() < 0.6) m.fitted = Object.fromEntries(SLOT_IDS.flatMap((s) => (rand() < 0.6 ? [[s, rand() < 0.8 && m.hangar?.length ? pick(m.hangar) : pick(PART_IDS)]] : [])));
  if (rand() < 0.4) m.opened = Object.fromEntries(subset(SECTIONS, 0.3).map((s) => [s, true]));
  if (full || rand() < 0.7) {
    m.companions = {};
    for (const id of COMPANION_IDS)
      if (rand() < (full ? 0.8 : 0.5)) m.companions[id] = rand() < 0.1 && !full ? ({ xp: int(200) } as never) : { xp: int(400), ...walk(COMPANION_TREES[id], int(12)) };
  }
  if (rand() < 0.5) m.spared = int(5);
  if (rand() < 0.5) m.hunters = int(3);
  if (full || rand() < 0.3) m.kept = pick(CARDS).id;
  if (rand() < 0.5) m.crew = shuffled(subset([...COMPANION_IDS, ...COMPANION_IDS], 0.3)).slice(0, int(4));
  return m;
}

// The tables.
rec('metaUpgrades', [], M.META_UPGRADES.map(metaUpgradeData));
rec('starterOffers', [], M.STARTER_OFFERS);
rec('treePetals', [], M.TREE_PETALS);
rec('kinshipBoost', [], M.KINSHIP_BOOST);
rec('fellowshipBoost', [], M.FELLOWSHIP_BOOST);
rec('affinitySkill', [], M.AFFINITY_SKILL);
rec('startingRaces', [], M.STARTING_RACES);
rec('heroUnlockStars', [], M.HERO_UNLOCK_STARS);
rec('skillResetPetals', [], M.SKILL_RESET_PETALS);
rec('emptyMeta', [], M.emptyMeta());
rec('plainCaptain', [], M.plainCaptain());
rec('runBonuses', [null, null], M.runBonuses(null));
for (const id of UPGRADE_IDS) {
  const u = M.metaUpgrade(id);
  rec('metaUpgrade', [id], u ? metaUpgradeData(u) : undefined);
  if (!u) continue;
  rec('currencyOf', [id], M.currencyOf(u));
  rec('pointCost', [id], M.pointCost(u));
  for (let l = 0; l <= u.max + 2; l++) {
    rec('cost', [id, l], u.cost(l));
    rec('priceOf', [id, l], M.priceOf(u, l));
  }
}
for (let l = 0; l < 80; l++) {
  rec('captainXpToNext', [l], M.captainXpToNext(l));
  rec('xpForLevel', [l], M.xpForLevel(l));
}
for (const xp of [-5, 0, 0.5, 25, 26, 51, 52, 53, 1000, 1234.7, 99999]) rec('captainLevel', [xp], M.captainLevel(xp));
for (const r of [undefined, 'dwarf', 'stellar', 'anomaly', 'nonsense']) rec('starterCardPrice', [r], M.starterCardPrice(r));
for (const h of HEROES) rec('heroUnlockNeed', [h], M.heroUnlockNeed(h));

/** Every meta function, once, on a save. */
function everything(m: MetaState) {
  rec('captainLevel', [m.xp], M.captainLevel(m.xp));
  rec('treePetalsSpent', [m], M.treePetalsSpent(m));
  rec('pointsSpent', [m], M.pointsSpent(m));
  rec('pointsLeft', [m], M.pointsLeft(m));
  rec('companionsFound', [m], M.companionsFound(m));
  rec('activeCrew', [m], M.activeCrew(m));
  rec('companionCards', [m], M.companionCards(m));
  for (const id of shuffled(COMPANION_IDS).slice(0, 2)) {
    rec('companionSpent', [m, id], M.companionSpent(m, id));
    rec('companionTree', [m, id], M.companionTree(m, id));
    rec('companionPoints', [m, id], M.companionPoints(m, id));
    const what = rand() < 0.3 ? 'gate' : rand() < 0.05 ? 'nonsense' : pick(COMPANION_TREES[id]).id;
    rec('companionProblem', [m, id, what], M.companionProblem(m, id, what));
    rec('buyCompanion', [m, id, what], M.buyCompanion(m, id, what));
  }
  const crewId = pick(COMPANION_IDS), aboard = rand() < 0.5;
  rec('setCrewAboard', [m, crewId, aboard], M.setCrewAboard(m, crewId, aboard));
  const freed = subset(COMPANION_IDS, 0.2), xp = Object.fromEntries(subset(COMPANION_IDS, 0.4).map((id) => [id, rand() < 0.2 ? 0 : int(60)])), spared = rand() < 0.5 ? 0 : int(2);
  const hunters = rand() < 0.6 ? 0 : int(2);
  rec('bankCompanions', [m, freed, xp, spared, hunters], M.bankCompanions(m, freed, xp, spared, hunters));
  for (const s of shuffled(SECTIONS).slice(0, 3)) rec('sectionOpen', [m, s], M.sectionOpen(m, s));
  rec('openSections', [m], M.openSections(m));
  const slot = pick(SLOT_IDS) as PartSlot, part = rand() < 0.2 ? null : rand() < 0.7 && m.hangar?.length ? pick(m.hangar) : pick(PART_IDS);
  rec('fitPart', [m, slot, part], M.fitPart(m, slot, part));
  const found = [...subset(PART_IDS, 0.2), ...(rand() < 0.2 ? ['nonsense'] : [])];
  rec('stowParts', [m, found], M.stowParts(m, found));
  const which = rand() < 0.5 ? 'primary' : 'secondary', race = rand() < 0.2 ? undefined : int(3);
  rec('setAffinity', [m, which, race], M.setAffinity(m, which, race));
  rec('captainMeta', [m], M.captainMeta(m));
  rec('captainGifts', [m], M.captainGifts(m));
  rec('captainCard', [m], M.captainCard(m));
  rec('captainPointsSpent', [m], M.captainPointsSpent(m));
  for (let i = 0; i < 3; i++) {
    const buy: CaptainBuy = rand() < 0.3 ? { kind: 'gate' } : { kind: 'node', id: rand() < 0.05 ? 'nonsense' : pick(CAPTAIN_TREE).id };
    rec('captainBuyProblem', [m, buy], M.captainBuyProblem(m, buy));
    attempt('buyCaptain', [m, buy], () => M.buyCaptain(m, buy));
  }
  const ability = pick(ABILITIES);
  rec('equipCaptainAbility', [m, ability], M.equipCaptainAbility(m, ability));
  const lead = rand() < 0.2 ? undefined : pick(LEADS);
  rec('setCaptainLead', [m, lead], M.setCaptainLead(m, lead));
  const sing = pick(SINGS);
  rec('setCaptainSingularity', [m, sing], M.setCaptainSingularity(m, sing));
  rec('migrateMeta', [m], M.migrateMeta(m));
  for (const id of shuffled(UPGRADE_IDS).slice(0, 6)) {
    rec('levelOf', [m, id], M.levelOf(m, id));
    rec('buyUpgradeProblem', [m, id], M.buyUpgradeProblem(m, id));
    rec('upgradeOpen', [m, id], M.upgradeOpen(m, id));
  }
  const up = pick(UPGRADE_IDS);
  attempt('buyUpgrade', [m, up], () => M.buyUpgrade(m, up));
  rec('refundUpgrade', [m, up], M.refundUpgrade(m, up));
  rec('resetSkillsProblem', [m], M.resetSkillsProblem(m));
  attempt('resetSkills', [m], () => M.resetSkills(m));
  rec('resetCaptainProblem', [m], M.resetCaptainProblem(m));
  attempt('resetCaptain', [m], () => M.resetCaptain(m));
  for (const r of shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3)) {
    rec('raceUnlocked', [m, r], M.raceUnlocked(m, r));
    rec('raceConquests', [m, r], M.raceConquests(m, r));
  }
  for (const h of shuffled(HEROES).slice(0, 4)) rec('heroUnlocked', [m, h], M.heroUnlocked(m, h));
  const sr = int(8), card = rand() < 0.1 ? 'nonsense' : pick(M.STARTER_OFFERS[sr] ?? ['nonsense']), rarity = pick([undefined, 'dwarf', 'stellar', 'anomaly']);
  rec('starterOwned', [m, sr, card], M.starterOwned(m, sr, card));
  rec('starterAddPrice', [m, sr, card, rarity], M.starterAddPrice(m, sr, card, rarity));
  rec('starterAddProblem', [m, sr, card, rarity], M.starterAddProblem(m, sr, card, rarity));
  attempt('buyStarterCard', [m, sr, card, rarity], () => M.buyStarterCard(m, sr, card, rarity));
  const index = int(4) - 1;
  rec('removeStarterCard', [m, sr, index], M.removeStarterCard(m, sr, index));
  const runRace = rand() < 0.2 ? undefined : int(7);
  rec('runBonuses', [m, runRace], M.runBonuses(m, runRace));
}

// Every function on random saves, old and new.
for (let i = 0; i < 200; i++) everything(randomMeta());
// A run's bonuses with every skill levelled, and the ship, the companions, a kept card and the races leant to set.
for (let i = 0; i < 100; i++) {
  const m = randomMeta(true);
  for (const r of [undefined, 0, 3, 5, 7]) rec('runBonuses', [m, r], M.runBonuses(m, r));
  everything(m);
}

// Random walks: one save, bought into and changed step by step.
for (let i = 0; i < 40; i++) {
  let m = M.migrateMeta(randomMeta());
  for (let step = 0; step < 40; step++) {
    if (rand() < 0.15) m = { ...m, petals: m.petals + int(30), xp: m.xp + int(200) };
    const r = rand();
    let next: MetaState | undefined;
    if (r < 0.3) {
      const id = pick(UPGRADE_IDS);
      next = attempt('buyUpgrade', [m, id], () => M.buyUpgrade(m, id));
    } else if (r < 0.4) {
      const id = pick(UPGRADE_IDS);
      next = M.refundUpgrade(m, id);
      rec('refundUpgrade', [m, id], next);
    } else if (r < 0.55) {
      const buy: CaptainBuy = rand() < 0.3 ? { kind: 'gate' } : { kind: 'node', id: pick(CAPTAIN_TREE).id };
      next = attempt('buyCaptain', [m, buy], () => M.buyCaptain(m, buy));
    } else if (r < 0.65) {
      const id = pick(COMPANION_IDS), what = rand() < 0.3 ? 'gate' : pick(COMPANION_TREES[id]).id;
      next = M.buyCompanion(m, id, what);
      rec('buyCompanion', [m, id, what], next);
    } else if (r < 0.75) {
      const freed = subset(COMPANION_IDS, 0.3), xp = Object.fromEntries(subset(COMPANION_IDS, 0.5).map((id) => [id, int(80)]));
      const spared = int(1), hunters = int(1);
      next = M.bankCompanions(m, freed, xp, spared, hunters);
      rec('bankCompanions', [m, freed, xp, spared, hunters], next);
    } else if (r < 0.85) {
      const sr = int(7), card = pick(M.STARTER_OFFERS[sr]), rarity = pick(['dwarf', 'stellar', 'anomaly']);
      next = attempt('buyStarterCard', [m, sr, card, rarity], () => M.buyStarterCard(m, sr, card, rarity));
    } else if (r < 0.9) {
      const sr = int(7), index = int(3);
      next = M.removeStarterCard(m, sr, index);
      rec('removeStarterCard', [m, sr, index], next);
    } else if (r < 0.95) {
      next = M.openSections(m);
      rec('openSections', [m], next);
    } else {
      const ability = pick(ABILITIES);
      next = M.equipCaptainAbility(m, ability);
      rec('equipCaptainAbility', [m, ability], next);
    }
    if (next) m = next;
  }
  everything(m);
}

mkdirSync('engine-cs/traces', { recursive: true });
writeFileSync('engine-cs/traces/meta.json', JSON.stringify(cases));
console.log(`${cases.length} meta cases → engine-cs/traces/meta.json`);
