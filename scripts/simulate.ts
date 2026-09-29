/**
 * Balance simulator: plays many AI-vs-AI games with the race starter decks and
 * reports win rates per deck, per seat, and per card (for the cards a winner
 * played), plus average game length. Usage: npm run simulate -- [games] [players]
 */
import { chooseAIAction } from '../src/engine/ai';
import { PRESET_DECKS } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';

/** A seeded random line-up of distinct starter decks (different seat orders every game). */
function pickDecks(seed: number, count: number) {
  let r = seed * 2654435761 >>> 0;
  const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const order = [...PRESET_DECKS].sort(() => rand() - 0.5);
  return order.slice(0, count);
}

const games = Number(process.argv[2] ?? 1000);
const playerCount = Number(process.argv[3] ?? 2);

const deckWins = new Map<string, number>();
const deckGames = new Map<string, number>();
const seatWins = Array(playerCount).fill(0);
const matchups = new Map<string, [number, number]>();
let totalRounds = 0;
let longest = 0;
let fatigueGames = 0;

for (let seed = 1; seed <= games; seed++) {
  const decks = pickDecks(seed, playerCount);
  let s = createGame({ seed, players: decks.map((d, i) => ({ name: `AI ${i + 1}`, isAI: true, species: d.race })) });
  let steps = 0;
  while (!isGameOver(s) && steps++ < 5000) s = applyAction(s, chooseAIAction(s));
  totalRounds += s.round;
  longest = Math.max(longest, s.round);
  if (s.log.some((l) => l.text.includes('deck is empty'))) fatigueGames++;
  const winnerIndex = s.players.findIndex((p) => p.id === s.winnerId);
  if (winnerIndex >= 0) seatWins[winnerIndex]++;
  decks.forEach((d, i) => {
    deckGames.set(d.name, (deckGames.get(d.name) ?? 0) + 1);
    if (i === winnerIndex) deckWins.set(d.name, (deckWins.get(d.name) ?? 0) + 1);
  });
  if (playerCount === 2 && decks[0].name !== decks[1].name && winnerIndex >= 0) {
    const key = [decks[0].name, decks[1].name].sort().join(' vs ');
    const rec = matchups.get(key) ?? [0, 0];
    rec[decks[winnerIndex].name === key.split(' vs ')[0] ? 0 : 1]++;
    matchups.set(key, rec);
  }
}

const pct = (a: number, b: number) => `${((a / Math.max(1, b)) * 100).toFixed(1).padStart(5)}%`;
console.log(`${games} games, ${playerCount} players. Average length: ${(totalRounds / games).toFixed(1)} rounds (longest ${longest}).`);
console.log(`Games where someone ran out of cards: ${pct(fatigueGames, games)}. Fair win rate: ${(100 / playerCount).toFixed(1)}%\n`);
for (const d of PRESET_DECKS) console.log(`${d.name.padEnd(16)} ${pct(deckWins.get(d.name) ?? 0, deckGames.get(d.name) ?? 0)}  (${deckGames.get(d.name) ?? 0} seats)`);
console.log(`\nBy seat: ${seatWins.map((w, i) => `seat ${i + 1} ${pct(w, games)}`).join(' · ')}`);
if (matchups.size) {
  console.log('\nMatchups:');
  for (const [key, [a, b]] of matchups) console.log(`  ${key.padEnd(36)} ${pct(a, a + b)} / ${pct(b, a + b)}`);
}
