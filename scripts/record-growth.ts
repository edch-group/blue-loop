/**
 * How characters and players grow, as the TypeScript engine works it out (heroes, boons, modules, ascent, relic rolls,
 * the companions, the Captain, progression), for the C# engine to work out the same (engine-cs/Tests). Each case is a
 * function's name, its arguments and what it returned. Written to engine-cs/traces/growth.json (not kept in git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { BOONS } from '../src/engine/boons';
import { CARDS, PRESET_DECKS } from '../src/engine/cards';
import { makeModule, MODULE_KINDS, moduleValue, type ModuleKind } from '../src/engine/modules';
import { ascend, ascentGifts, ascentProblem, ascentSpent, CAPTAIN_TREE, COMPANION_TREES, plainAscent, tierPicks, type Ascent, type AscentNode } from '../src/engine/ascent';
import {
  boonsText, heroBonus, heroLevel, itemBoons, itemText, itemValue, learnProblem, makeItem, makeRelic, nextLevelXp, RACE_SLOTS, relicBonus, relicText,
  SKILL_TREES, skillPoints, slotsFor, type HeroState, type Item, type ItemRarity, type Relic, type SlotKind,
} from '../src/engine/heroes';
import { ALL_POWERS, rollPower, SLOT_POWERS, type RelicPower } from '../src/engine/relics';
import { COMPANION_IDS, COMPANIONS, companionBuild, companionCardId, companionFromAscent, companionLevel, companionOf, xpFromActs, type CompanionId } from '../src/engine/companions';
import { CAPTAIN_ABILITIES, CAPTAIN_LEADS, captainBuild, captainId, captainSlots } from '../src/engine/captain';
import { CAPTAIN_SINGULARITIES } from '../src/engine/singularities';
import {
  addXp, applyRank, BOOSTERS, boosterPool, breakable, breakdownValue, canMatch, craftCost, gameReward, openBooster, ownsDeck, rankName, rankOf, stageIndex,
  starterGrant, wantsCopy, type Collection, type GameKind,
} from '../src/engine/progression';
import { nextRandom } from '../src/engine/rng';

const rng = { rngState: 4242 };
const rand = () => nextRandom(rng);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (most: number) => Math.floor(rand() * (most + 1));
const cases: { fn: string; args: unknown[]; out: unknown }[] = [];
// (Copied as they are now: an argument may be changed after.)
const snap = (x: unknown): unknown => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
const rec = (fn: string, args: unknown[], out: unknown) => cases.push({ fn, args: snap(args) as unknown[], out: snap(out) });
const RARITIES: ItemRarity[] = ['dwarf', 'stellar', 'anomaly'];
const SLOTS = Object.keys(SLOT_POWERS) as SlotKind[];

// Boons.
rec('boons', [], BOONS);

// Modules.
rec('moduleKinds', [], MODULE_KINDS);
for (const kind of MODULE_KINDS)
  for (const r of RARITIES) {
    const m = makeModule(`m-${kind}-${r}`, kind as ModuleKind, r);
    rec('makeModule', [m.id, kind, r], m);
    rec('moduleValue', [m], moduleValue(m));
  }

// Ascent: random walks up each tree.
const trees: [string, AscentNode[]][] = [['captain', CAPTAIN_TREE], ...COMPANION_IDS.map((id) => [id, COMPANION_TREES[id]] as [string, AscentNode[]])];
for (let i = 0; i < 40; i++) {
  const [key, tree] = pick(trees);
  let a: Ascent = plainAscent();
  for (let step = 0; step < 25; step++) {
    const what = rand() < 0.2 ? 'gate' : rand() < 0.05 ? 'nonsense' : pick(tree).id;
    const points = rand() < 0.1 ? 0 : int(5);
    rec('ascentProblem', [key, a, what, points], ascentProblem(tree, a, what, points));
    const next = ascend(tree, a, what, points);
    rec('ascend', [key, a, what, points], next);
    a = next;
  }
  rec('ascentGifts', [key, a], ascentGifts(tree, a));
  rec('ascentSpent', [key, a], ascentSpent(tree, a));
  for (let t = 1; t <= 4; t++) rec('tierPicks', [key, a, t], tierPicks(tree, a, t));
  if (key !== 'captain') rec('companionFromAscent', [key, a], companionFromAscent(key as CompanionId, a));
}

// Relic rolls.
rec('allPowers', [], ALL_POWERS);
for (let i = 0; i < 300; i++) {
  const slot = pick(SLOTS);
  const held = ALL_POWERS.filter(() => rand() < (i < 20 ? 0.97 : 0.3));
  const roll = rand();
  rec('rollPower', [slot, roll, held], rollPower(slot, roll, new Set<RelicPower>(held)));
}

// Heroes.
for (const xp of [0, 1, 9, 10, 23, 24, 100, 199, 200, 419, 420, 1000]) {
  rec('heroLevel', [xp], heroLevel(xp));
  rec('nextLevelXp', [xp], nextLevelXp(xp));
}
const heroes = Object.keys(SKILL_TREES);
const items: Item[] = [];
for (const slot of SLOTS)
  for (const r of RARITIES)
    for (let race = 0; race < 9; race++) {
      const it = makeItem(`i-${slot}-${r}-${race}`, slot, r, race);
      rec('makeItem', [it.id, slot, r, race], it);
      items.push(it);
    }
for (let race = 0; race < 8; race++) for (const slot of SLOTS) rec('slotsFor', [race, slot], slotsFor(race, slot));
const older = (it: Item): Item => ({ id: it.id, name: it.name, slot: it.slot, rarity: it.rarity, text: it.text });
for (let i = 0; i < 40; i++) {
  const it = rand() < 0.5 ? pick(items) : older(pick(items));
  rec('itemBoons', [it], itemBoons(it));
  rec('itemText', [it], itemText(it));
  rec('itemValue', [it], itemValue(it));
}
for (let i = 0; i < 20; i++) {
  const bs = pick(items).boons!.concat(pick(items).boons!);
  rec('boonsText', [bs], boonsText(bs));
}
for (let i = 0; i < 80; i++) {
  const hero = pick(heroes);
  const tree = SKILL_TREES[hero];
  const h: HeroState = { xp: int(450), skills: [], gear: {}, ...(rand() < 0.3 ? { train: { attack: int(3), defence: int(3) } } : {}) };
  for (let k = 0; k < 30; k++) {
    const id = rand() < 0.05 ? 'might9' : pick(tree).id;
    const problem = learnProblem(hero, h, id);
    rec('learnProblem', [hero, h, id], problem);
    if (!problem) h.skills = [...h.skills, id];
  }
  if (rand() < 0.2) h.skills = [...h.skills, 'oldskill0', 'ward7'];
  for (const s of RACE_SLOTS[int(7)]) if (rand() < 0.5) h.gear[s.id] = rand() < 0.8 ? pick(items) : older(pick(items));
  rec('skillPoints', [h, hero], skillPoints(h, hero));
  rec('skillPoints', [h, null], skillPoints(h));
  rec('heroBonus', [hero, h], heroBonus(hero, h));
}
rec('heroBonus', ['the_admiralty', null], heroBonus('the_admiralty', undefined));
for (let i = 0; i < 40; i++) {
  const held: Relic[] = [];
  for (let k = int(8); k > 0; k--) {
    const slot = pick(SLOTS), r = pick(RARITIES), race = int(7), roll = rand();
    const relic = rand() < 0.1 ? (older(pick(items)) as Relic) : makeRelic(`r${i}-${k}`, slot, r, race, roll, held);
    if (relic.power) rec('makeRelic', [relic.id, slot, r, race, roll, held.slice()], relic);
    rec('relicText', [relic], relicText(relic));
    held.push(relic);
  }
  const hero = rand() < 0.5 ? pick(heroes) : '';
  rec('relicBonus', [held, hero], relicBonus(held, hero));
}
rec('relicBonus', [null, ''], relicBonus(undefined));

// The companions.
for (let i = 0; i < 80; i++) {
  const c = pick(COMPANIONS);
  const traits = [...(rand() < 0.8 ? [c.start] : []), ...c.traits.filter(() => rand() < 0.3).map((t) => t.id), ...(rand() < 0.1 ? ['nonsense'] : [])];
  const b = { attack: rand() < 0.3 ? 0 : int(3), stability: rand() < 0.3 ? 0 : int(3), cheaper: rand() < 0.5 ? 0 : int(2), traits, gates: rand() < 0.4 ? 0 : int(3) };
  const id = companionCardId(c.id, b);
  rec('companionCardId', [c.id, b], id);
  rec('companionBuild', [id], companionBuild(id));
  rec('companionOf', [id], companionOf(id));
}
for (const id of ['companion_lancer@x.y', 'human_captain', 'nonsense', 'companion_seer@1.2.3.-.9']) {
  rec('companionBuild', [id], companionBuild(id));
  rec('companionOf', [id], companionOf(id));
}
for (let i = 0; i < 40; i++) {
  const id = pick(COMPANION_IDS);
  const acts = { damage: int(30), support: int(30), kills: int(5), sun: int(20), dawns: int(10) };
  rec('xpFromActs', [id, acts], xpFromActs(id, acts));
}
for (const xp of [0, 3.7, 15, 16, 37, 38, 100, 500, -4]) rec('companionLevel', [xp], companionLevel(xp));

// The Captain.
for (let i = 0; i < 80; i++) {
  const abilities = [...new Set([pick(CAPTAIN_ABILITIES).id, ...(rand() < 0.6 ? [pick(CAPTAIN_ABILITIES).id] : []), ...(rand() < 0.3 ? [pick(CAPTAIN_ABILITIES).id, 'nonsense'] : []), ...(rand() < 0.2 ? [pick(CAPTAIN_ABILITIES).id, pick(CAPTAIN_ABILITIES).id] : [])])];
  const b = {
    attack: rand() < 0.4 ? 0 : int(3), stability: rand() < 0.4 ? 0 : int(4), cheaper: rand() < 0.5 ? 0 : int(2), abilities: rand() < 0.15 ? ['brace'] : abilities,
    ...(rand() < 0.4 ? { lead: pick(CAPTAIN_LEADS).id } : {}),
    ...(rand() < 0.4 ? { sing: pick([...Object.keys(CAPTAIN_SINGULARITIES), 'nonsense']) } : {}),
    ...(rand() < 0.5 ? { gates: int(5) } : {}),
  };
  const id = captainId(b);
  rec('captainId', [b], id);
  rec('captainBuild', [id], captainBuild(id));
}
for (const id of ['human_captain', 'human_captain@x', 'companion_lancer', 'human_captain@1.2.3.-.-.-.2']) rec('captainBuild', [id], captainBuild(id));
for (let n = 0; n < 4; n++) rec('captainSlots', [n], captainSlots(n));

// Progression.
for (const rp of [-5, 0, 49.5, 99, 100, 250, 333, 1699, 1700, 1799, 1800, 2500]) {
  rec('rankOf', [rp], rankOf(rp));
  rec('rankName', [rp], rankName(rp));
  rec('stageIndex', [rp], stageIndex(rp));
}
for (let i = 0; i < 120; i++) {
  const kind = pick(['ai', 'online', 'ranked', 'ranked', 'ranked'] as GameKind[]);
  const won = rand() < 0.5;
  const opts = { ...(rand() < 0.9 ? { me: int(1900) } : {}), ...(rand() < 0.9 ? { rival: rand() < 0.15 ? int(99) : int(1900) } : {}), ...(rand() < 0.15 ? { conceded: true } : {}) };
  rec('gameReward', [kind, won, opts], gameReward(kind, won, opts));
  rec('canMatch', [opts.me ?? 0, opts.rival ?? 0], canMatch(opts.me ?? 0, opts.rival ?? 0));
  const change = int(60) - 40;
  rec('applyRank', [opts.me ?? 0, change], applyRank(opts.me ?? 0, change));
}
for (let i = 0; i < 30; i++) {
  const level = 1 + int(20), xp = int(300), gain = int(2000);
  rec('addXp', [level, xp, gain], addXp(level, xp, gain));
}
rec('starterGrant', [], starterGrant());
const pool = CARDS.map((c) => c.id);
const collection: Collection = {};
for (let i = 0; i < 200; i++) collection[pick(pool)] = int(4);
for (let i = 0; i < 60; i++) {
  const id = pick(pool);
  rec('craftCost', [id], craftCost(id));
  rec('breakdownValue', [id], breakdownValue(id));
  rec('breakable', [collection, id], breakable(collection, id));
  rec('wantsCopy', [collection, id], wantsCopy(collection, id));
}
for (let i = 0; i < 20; i++) {
  const deck = rand() < 0.5 ? pick(PRESET_DECKS).cards : Array.from({ length: 6 }, () => pick(pool));
  const coll = rand() < 0.3 ? starterGrant() : collection;
  rec('ownsDeck', [coll, deck], ownsDeck(coll, deck));
}
for (const kind of BOOSTERS) {
  rec('boosterPool', [kind], boosterPool(kind).map((c) => c.id));
  for (let i = 0; i < 6; i++) {
    const seed = 900 + i * 31 + (kind === 'general' ? 99 : kind);
    const coll = i % 2 ? collection : {};
    const s = { rngState: seed };
    rec('openBooster', [kind, coll, seed], openBooster(kind, coll, () => nextRandom(s)));
  }
}

mkdirSync('engine-cs/traces', { recursive: true });
writeFileSync('engine-cs/traces/growth.json', JSON.stringify(cases));
console.log(`${cases.length} cases`);
