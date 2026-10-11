/**
 * Writes the dreams found (scripts/dreams-gen.ts, one per line in each file named) into the game: one of each tier,
 * race and goal (the first found).
 *
 *   npx vite-node scripts/dreams-merge.ts a.jsonl b.jsonl ...
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { DreamSpec } from '../src/engine/game';

const byId = new Map<string, DreamSpec>();
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const d = JSON.parse(line) as DreamSpec;
    if (!byId.has(d.id)) byId.set(d.id, d);
  }
}
const all = [...byId.values()].sort((a, b) => a.tier - b.tier || a.race - b.race || a.goal.localeCompare(b.goal));
writeFileSync(
  new URL('../src/engine/dreams-data.ts', import.meta.url),
  `/** Dreams of the Lost: positions generated and proven by scripts/dreams-gen.ts (don't edit by hand). */\nimport type { DreamSpec } from './game';\n\nexport const DREAMS: DreamSpec[] = [\n${all.map((d) => `  ${JSON.stringify(d)},`).join('\n')}\n];\n`,
);
console.log('dreams', all.length);
