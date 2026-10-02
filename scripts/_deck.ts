import { PRESET_DECKS } from '../src/engine/cards';
const [i, ...swaps] = process.argv.slice(2);
const d = [...PRESET_DECKS[Number(i)].cards];
for (const sw of swaps) { const [a, b] = sw.split('>'); const k = d.indexOf(a); if (k < 0) throw new Error(a); d[k] = b; }
process.stdout.write(JSON.stringify(d));
