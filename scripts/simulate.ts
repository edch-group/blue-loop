/**
 * Balance simulator: plays many AI-vs-AI games and reports win rates per solar
 * system and average game length. Usage: npm run simulate -- [games] [players]
 */
import { applyAction, chooseAIAction, createGame, isGameOver, SOLAR_SYSTEMS } from '../src/engine';

const games = Number(process.argv[2] ?? 2000);
const playerCount = Number(process.argv[3] ?? 2);

const wins = new Map<string, number>();
const plays = new Map<string, number>();
let totalTurns = 0;

for (let seed = 1; seed <= games; seed++) {
  let s = createGame({ seed, players: Array.from({ length: playerCount }, (_, i) => ({ name: `AI ${i + 1}`, isAI: true })) });
  while (!isGameOver(s)) s = applyAction(s, chooseAIAction(s));
  totalTurns += s.turnNumber;
  for (const p of s.players) plays.set(p.systemId, (plays.get(p.systemId) ?? 0) + 1);
  const winner = s.players.find((p) => p.id === s.winnerId)!;
  wins.set(winner.systemId, (wins.get(winner.systemId) ?? 0) + 1);
}

const fair = 100 / playerCount;
console.log(`${games} games, ${playerCount} players. Average length: ${(totalTurns / games).toFixed(1)} turns.`);
console.log(`Fair win rate: ${fair.toFixed(1)}%\n`);
for (const sys of SOLAR_SYSTEMS) {
  const played = plays.get(sys.id) ?? 0;
  const rate = played ? ((wins.get(sys.id) ?? 0) / played) * 100 : 0;
  console.log(`${sys.name.padEnd(16)} ${rate.toFixed(1).padStart(5)}%  (${played} games)`);
}
