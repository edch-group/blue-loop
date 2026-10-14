/**
 * Built cards (fused, marked, the Captain's builds, the crew's) as the TypeScript engine makes them, for the C# engine
 * to build the same (engine-cs/Tests). Written to engine-cs/traces/builds.json (not kept in git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { CARDS, cardDef, fusedId, fusionProblem } from '../src/engine/cards';
import { CAPTAIN_ABILITIES, CAPTAIN_LEADS, captainId } from '../src/engine/captain';
import { COMPANIONS, companionCardId } from '../src/engine/companions';
import { CAPTAIN_SINGULARITIES } from '../src/engine/singularities';
import { markedId, marksFor } from '../src/engine/rifts';
import { nextRandom } from '../src/engine/rng';

const rng = { rngState: 77 };
const rand = () => nextRandom(rng);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const n = (most: number) => Math.floor(rand() * (most + 1));
const ids = new Set<string>();
const pool = CARDS.map((c) => c.id);
const fused: string[] = [];
for (let i = 0; fused.length < 150 && i < 20000; i++) {
  const a = pick(pool), b = pick(pool);
  if (!fusionProblem(a, b)) fused.push(fusedId(a, b));
}
fused.forEach((id) => ids.add(id));
for (let i = 0; i < 150; i++) {
  const d = cardDef(rand() < 0.2 ? pick(fused) : pick(pool));
  const marks = marksFor(d);
  if (marks.length) ids.add(markedId(pick(marks), d.id));
}
for (let i = 0; i < 60; i++) {
  const abilities = [...new Set([pick(CAPTAIN_ABILITIES).id, ...(rand() < 0.6 ? [pick(CAPTAIN_ABILITIES).id] : []), ...(rand() < 0.3 ? [pick(CAPTAIN_ABILITIES).id] : [])])];
  ids.add(captainId({ attack: n(3), stability: n(4), cheaper: n(2), abilities, lead: rand() < 0.5 ? pick(CAPTAIN_LEADS).id : undefined, sing: rand() < 0.5 ? pick(Object.keys(CAPTAIN_SINGULARITIES)) : undefined, gates: n(3) }));
}
for (let i = 0; i < 60; i++) {
  const c = pick(COMPANIONS);
  const traits = [c.start, ...c.traits.filter(() => rand() < 0.4).map((t) => t.id)];
  ids.add(companionCardId(c.id, { attack: n(3), stability: n(3), cheaper: n(2), traits: [...new Set(traits)], gates: n(3) }));
}
ids.add('human_captain');
COMPANIONS.forEach((c) => ids.add(c.card));
const out = Object.fromEntries([...ids].map((id) => [id, cardDef(id)]));
mkdirSync('engine-cs/traces', { recursive: true });
writeFileSync('engine-cs/traces/builds.json', JSON.stringify(out));
console.log(`${ids.size} built cards`);
