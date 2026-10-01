/**
 * Two decks, head to head: DECK_A='["id", ...]' DECK_B='[...]' npm run duel -- [games] [raceA] [raceB].
 * Seats alternate; reports each deck's win rate and the average game length.
 */
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { cardDef, deckProblems } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';

for (const [id, patch] of Object.entries(JSON.parse(process.env.PATCH ?? '{}') as Record<string, object>)) Object.assign(cardDef(id), patch);
Object.assign(BALANCE, { maxLogEntries: 1e6 }, JSON.parse(process.env.BAL ?? '{}'));
const A = JSON.parse(process.env.DECK_A ?? '[]') as string[];
const B = JSON.parse(process.env.DECK_B ?? '[]') as string[];
for (const d of [A, B]) if (deckProblems(d).length) throw new Error(deckProblems(d).join('; '));
const games = Number(process.argv[2] ?? 200);
const races = [Number(process.argv[3] ?? 0), Number(process.argv[4] ?? 2)];
let aWins = 0, rounds = 0;
for (let g = 1; g <= games; g++) {
  const flip = g % 2 === 0;
  const seats = flip ? [1, 0] : [0, 1];
  let s = createGame({ seed: g, players: seats.map((k) => ({ name: k ? 'B' : 'A', isAI: true, species: races[k], deck: k ? B : A })) });
  let n = 0;
  while (!isGameOver(s) && n++ < 5000) s = applyAction(s, chooseAIAction(s));
  rounds += s.round;
  if (s.players.find((p) => p.id === s.winnerId)?.name === 'A') aWins++;
}
console.log(`A ${((aWins / games) * 100).toFixed(1)}% · B ${(((games - aWins) / games) * 100).toFixed(1)}% · ${(rounds / games).toFixed(1)} rounds`);
