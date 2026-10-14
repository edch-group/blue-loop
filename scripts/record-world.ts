/**
 * The world around the battles as the TypeScript engine has it: the story's scenes, races, rifts' marks, modes, encounters,
 * research, ship parts, lessons, and puzzles solved by search, each call and what it gave, for the C# engine to call the
 * same and match (engine-cs/Tests). Written to engine-cs/traces/world.json (not kept in git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cardDef, fusedId, fusionProblem, registeredCardDefs, CARDS } from '../src/engine/cards';
import { nextRandom } from '../src/engine/rng';
import * as story from '../src/engine/story';
import { raceLabel, raceTrait, SUBRACES } from '../src/engine/races';
import { markedId, markOf, marksFor, NYX_MARKS, type NyxMark } from '../src/engine/rifts';
import { cardMechanics, cardThings, mechanicName, modeOf, modeProblem, type Mechanic } from '../src/engine/modes';
import { closingLines, encounterChoices, encounterPrice, openingLines, visitorLook, visitorName, type EncounterKind, type EncounterOutcome } from '../src/engine/encounters';
import { isExperiment, RESEARCH, researchBonus, supersededResearch } from '../src/engine/research';
import { newCurio, newPart, partRarity, partSlots, shipFit, SHIP_PARTS, SHIP_SLOTS, slotKind, type PartRarity } from '../src/engine/parts';
import { LESSONS, lessonOpen } from '../src/engine/lessons';
import { DREAMS } from '../src/engine/dreams-data';
import { keepsWinnable, leavesTheirBoard, mostHeatWithin, puzzleGame, reach, rivalDay, solution, solves } from '../src/engine/puzzle';
import { movesNow } from '../src/engine/ai';
import type { DreamSpec } from '../src/engine/game';

const rng = { rngState: 4242 };
const rand = () => nextRandom(rng);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const some = <T>(xs: readonly T[], p: number): T[] => xs.filter(() => rand() < p);
const cases: { f: string; args: unknown[]; out: unknown }[] = [];
const rec = (f: string, args: unknown[], out: unknown) => cases.push({ f, args, out: out === undefined ? null : out });
const quick = process.env.QUICK === '1';

// ---- Story ----
const factions = ['f0', 'Aureline Dominion', 'rival-2'];
const heroes = story.GENERALS.flat();
for (let race = 0; race < 8; race++) {
  const fac = pick(factions);
  rec('introScene', [race, fac, null], story.introScene(race, fac));
  for (const h of story.GENERALS[race]) rec('introScene', [race, 'mine', h], story.introScene(race, 'mine', h));
  rec('rivalFallsScene', [race, 'r' + race], story.rivalFallsScene(race, 'r' + race));
  rec('victoryHeartScene', [heroes[race], 'mine', race], story.victoryHeartScene(heroes[race], 'mine', race));
  rec('defeatScene', [race, race % 2 === 0], story.defeatScene(race, race % 2 === 0));
  for (let i = 0; i < 4; i++) {
    const args = [race, rand() < 0.1 ? 'nobody' : pick(heroes), 'rf' + i, rand() < 0.1 ? 'nobody' : pick(heroes), 'mf'] as const;
    rec('contactScene', [...args], story.contactScene(...args));
  }
}
for (const h of [...heroes, 'human_captain', 'nobody']) rec('recruitScene', [h, 'fac'], story.recruitScene(h, 'fac'));
rec('captainIntroScene', ['fac', 'human_captain'], story.captainIntroScene('fac', 'human_captain'));
for (const [f, fn] of [
  ['firstConquestScene', story.firstConquestScene], ['stellariaSightedScene', story.stellariaSightedScene], ['stellariaClaimedScene', story.stellariaClaimedScene],
  ['stellariaWiltedScene', story.stellariaWiltedScene], ['instabilityScene', story.instabilityScene], ['collapseScene', story.collapseScene],
  ['heartSightedScene', story.heartSightedScene], ['armyLostScene', story.armyLostScene], ['victoryDominationScene', story.victoryDominationScene],
] as const) rec(f, [], fn());
rec('dimmingScene', ['Vega'], story.dimmingScene('Vega'));
for (const name of story.LOST_RACES) {
  rec('lostSightedScene', [name], story.lostSightedScene(name));
  rec('lostRaidScene', [name, 'Altair'], story.lostRaidScene(name, 'Altair'));
}
for (const u of [1, 2, 3, 7]) {
  rec('wormholeSightedScene', [u], story.wormholeSightedScene(u));
  rec('runOverScene', [u], story.runOverScene(u));
  for (const petals of [0, 1, 2, 12]) rec('wormholeCrossedScene', [u, petals], story.wormholeCrossedScene(u, petals));
}

// ---- Races ----
for (const r of [null, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8]) {
  rec('raceTrait', [r], raceTrait(r ?? undefined) ?? null);
  for (const sub of [null, '', 'nosuch', ...Object.keys(SUBRACES)]) rec('raceLabel', [r === -1 || r === 8 ? 0 : r, sub], raceLabel(r === -1 || r === 8 ? 0 : (r ?? undefined), sub ?? undefined));
}

// ---- Cards for the classifiers: every card, and some fused and marked ----
const pool = CARDS.map((c) => c.id);
const ids = registeredCardDefs().map((c) => c.id);
const fused: string[] = [];
for (let i = 0; fused.length < 60 && i < 5000; i++) {
  const a = pick(pool), b = pick(pool);
  if (!fusionProblem(a, b)) fused.push(fusedId(a, b));
}
const marked: string[] = [];
for (let i = 0; i < 80; i++) {
  const d = cardDef(rand() < 0.3 ? pick(fused) : pick(pool));
  const m = marksFor(d);
  if (m.length) marked.push(markedId(pick(m), d.id));
}
const classify = [...ids, ...fused, ...marked, 'human_captain', 'companion_lancer'];
for (const id of classify) {
  const d = cardDef(id);
  rec('marksFor', [id], marksFor(d));
  rec('cardMechanics', [id], [...cardMechanics(d)]);
  rec('cardThings', [id], cardThings(d));
  rec('modeProblem', [id, 'core'], modeProblem(d, 'core'));
  rec('modeProblem', [id, 'lost'], modeProblem(d, 'lost'));
}
for (const id of [...marked, 'nyx:veil', 'nyx:nosuch:card', 'nyx:', 'plain', 'fuse:a+b', 'nyx:sting:fuse:a+b']) {
  const m = markOf(id);
  rec('markOf', [id], m ? { mark: m.mark, base: m.base } : null);
}
for (const m of Object.keys(NYX_MARKS) as NyxMark[]) rec('markedId', [m, 'coronal_lance'], markedId(m, 'coronal_lance'));
const mechanics: Mechanic[] = ['forge', 'overheat', 'shields', 'growth', 'resonance', 'bulwark', 'pierce', 'removal', 'erode', 'restore', 'repair', 'recall', 'recover', 'shift', 'plant', 'orbit', 'attune', 'lightspeed', 'trap', 'fusion', 'spendAll', 'global', 'leave', 'consume', 'sting', 'anchor', 'thermosiphon', 'darkspeed', 'empower', 'halt', 'relic'];
for (const m of mechanics) rec('mechanicName', [m], mechanicName(m));
rec('modeOf', [null], modeOf({}));
rec('modeOf', ['core'], modeOf({ mode: 'core' }));

// ---- Encounters ----
const kinds: EncounterKind[] = ['merchant', 'pirates', 'hunters', 'exile', 'stillness'];
const outcomes: EncounterOutcome[] = ['good', 'bad', 'declined', 'paid', 'won', 'lost', 'fled', 'joined'];
const crews = [[], ['engineer'], ['lancer', 'engineer'], ['lancer']];
for (const kind of kinds) {
  rec('visitorLook', [kind], visitorLook(kind));
  for (const stage of [0, 1, 2, 3, 5]) {
    rec('visitorName', [kind, stage], visitorName(kind, stage));
    for (const u of [1, 2, 4]) {
      const price = encounterPrice(kind, u, stage);
      rec('encounterPrice', [kind, u, stage], price);
      rec('encounterChoices', [kind, price, stage], encounterChoices(kind, price, stage));
      for (const crew of crews) rec('openingLines', [kind, price, stage, crew], openingLines(kind, price, stage, crew as never));
    }
    for (const o of outcomes) for (const crew of crews) rec('closingLines', [kind, o, stage, crew], closingLines(kind, o, stage, crew as never));
  }
}

// ---- Research ----
const rids = [...RESEARCH.map((r) => r.id), 'nosuch'];
for (let i = 0; i < 300; i++) {
  const done = some(rids, rand() * 0.5);
  const st = rand() < 0.1 ? undefined : { done, ...(rand() < 0.3 ? { current: { id: pick(rids), left: 2 } } : {}) };
  rec('researchBonus', [st ?? null], researchBonus(st));
  const id = pick(rids);
  rec('supersededResearch', [done, id], supersededResearch(done, id));
}
for (const id of rids) rec('isExperiment', [id], isExperiment(id));

// ---- Ship parts ----
const partIds = [...SHIP_PARTS.map((p) => p.id), 'nosuch'];
for (const s of SHIP_SLOTS) rec('slotKind', [s.id], slotKind(s.id));
for (const id of partIds) rec('partSlots', [id], partSlots(id));
for (let i = 0; i < 200; i++) {
  const fit: Record<string, string> = {};
  for (const s of SHIP_SLOTS) if (rand() < 0.7) fit[s.id] = pick(partIds);
  const f = i === 0 ? undefined : fit;
  rec('shipFit', [f ?? null], shipFit(f));
  const have = some(partIds, rand());
  const p = rand(), u = 1 + Math.floor(rand() * 6), boss = rand() < 0.3;
  rec('partRarity', [u, p, boss], partRarity(u, p, boss));
  rec('newCurio', [have, p], newCurio(have, p));
  const r = pick(['dwarf', 'stellar', 'anomaly'] as PartRarity[]);
  rec('newPart', [have, r, p], newPart(have, r, p));
}
rec('newPart', [partIds, 'dwarf', 0.5], newPart(partIds, 'dwarf', 0.5));

// ---- Lessons ----
const lids = [...LESSONS.map((l) => l.id), 'nosuch'];
for (let i = 0; i < 200; i++) {
  const done = some(lids, rand());
  const id = pick(lids);
  rec('lessonOpen', [id, done], lessonOpen(id, done));
}

// ---- Puzzles: solved by search, through the battle rules and the AI ----
const t0 = Date.now();
// (Every lesson, and every other dream: each search is thousands of moves through the battle rules.)
const specs: DreamSpec[] = [...LESSONS.map((l) => l.spec), ...DREAMS.filter((_, i) => i % (quick ? 8 : 2) === 0)];
for (const spec of specs) {
  rec('solution', [spec], solution(spec));
  const g = puzzleGame(spec);
  rec('rivalDay', [spec], rivalDay(g));
  const all = reach(g, 400);
  rec('reach', [spec, 400], all.map((r) => ({ depth: r.depth, line: r.line, heat: r.s.players[1].heat })));
  rec('reachLeaving', [spec, 400], reach(g, 400, leavesTheirBoard).map((r) => r.line));
  rec('solves', [spec, 400], all.map((r) => solves(spec, r.s)));
}
for (const l of LESSONS) {
  const g = puzzleGame(l.spec);
  for (const a of [...movesNow(g), { type: 'endTurn' as const }]) rec('keepsWinnable', [l.spec, a], keepsWinnable(l.spec, g, a));
}
for (const spec of DREAMS.filter((d) => (d.days ?? 1) > 1).slice(0, quick ? 1 : 3)) rec('mostHeatWithin', [spec, spec.days], mostHeatWithin(puzzleGame(spec), spec.days!));
console.log(`puzzles: ${Date.now() - t0} ms`);

mkdirSync('engine-cs/traces', { recursive: true });
writeFileSync('engine-cs/traces/world.json', JSON.stringify(cases));
console.log(`${cases.length} calls`);
