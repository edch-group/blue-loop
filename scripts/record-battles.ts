/**
 * Records AI-vs-AI battles from the TypeScript engine, every move and the state after it, for the C# engine to replay
 * and match exactly (engine-cs/Tests). Written to engine-cs/traces/battles.json (not kept in git: made by
 * `npm run record-battles`, here and in CI).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chooseAIAction } from '../src/engine/ai';
import { PRESET_DECKS } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';
import type { Action, GameSetup, GameState } from '../src/engine/types';

const games = Number(process.env.GAMES ?? 12);
const out: { setup: GameSetup; start: GameState; steps: { action: Action; state: GameState }[] }[] = [];
for (let i = 0; i < games; i++) {
  const a = PRESET_DECKS[i % PRESET_DECKS.length], b = PRESET_DECKS[(i * 5 + 3) % PRESET_DECKS.length];
  const setup: GameSetup = { seed: 1000 + i * 7919, mode: a.mode, players: [{ name: 'Ada', isAI: true, deck: a.cards }, { name: 'Bo', isAI: true, deck: b.cards }] };
  let g = createGame(setup);
  const start = g;
  const steps: { action: Action; state: GameState }[] = [];
  for (let n = 0; n < 600 && !isGameOver(g); n++) {
    const action = chooseAIAction(g);
    g = applyAction(g, action);
    steps.push({ action, state: g });
  }
  out.push({ setup, start, steps });
  console.log(`game ${i}: ${a.name} v ${b.name}, ${steps.length} moves, winner ${g.winnerId}`);
}
mkdirSync('engine-cs/traces', { recursive: true });
writeFileSync('engine-cs/traces/battles.json', JSON.stringify(out));
