/**
 * The starters of a mode, round robin: MODE=core|lost npx tsx scripts/mode-gauntlet.ts [games per pairing].
 * Prints each deck's win rate and the average game length.
 */
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { PRESET_DECKS } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';
Object.assign(BALANCE, { maxLogEntries: 1e6 }, JSON.parse(process.env.BAL ?? '{}'));
const MODE = (process.env.MODE ?? 'core') as 'core' | 'lost';
const decks = MODE === 'core' ? PRESET_DECKS.filter((d) => d.mode === 'core') : PRESET_DECKS.slice(0, 4);
const games = Number(process.argv[2] ?? 60);
const wins = new Map<string, number>(), played = new Map<string, number>();
let rounds = 0, total = 0;
for (const a of decks) for (const b of decks) {
  if (a === b) continue;
  for (let g = 1; g <= games; g++) {
    let s = createGame({ seed: g * 97 + total, mode: MODE, players: [{ name: a.name, isAI: true, deck: a.cards }, { name: b.name, isAI: true, deck: b.cards }] });
    let n = 0;
    while (!isGameOver(s) && n++ < 5000) s = applyAction(s, chooseAIAction(s));
    total++; rounds += s.round;
    const w = s.players.find((p) => p.id === s.winnerId)?.name;
    for (const d of [a.name, b.name]) played.set(d, (played.get(d) ?? 0) + 1);
    if (w) wins.set(w, (wins.get(w) ?? 0) + 1);
  }
}
for (const d of decks) console.log(d.name.padEnd(12), ((100 * (wins.get(d.name) ?? 0)) / played.get(d.name)!).toFixed(1) + '%');
console.log('rounds', (rounds / total).toFixed(1));
