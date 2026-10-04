/**
 * One deck against the four race starters: DECK='["id", ...]' (or NAME='Orbit Riders' for a starter)
 * npm run gauntlet -- [games per starter]. Seats alternate; reports the deck's win rate against each.
 */
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { deckProblems, PRESET_DECKS } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';

Object.assign(BALANCE, { maxLogEntries: 1e6 });
const named = PRESET_DECKS.find((d) => d.name === process.env.NAME);
const deck = process.env.DECK ? (JSON.parse(process.env.DECK) as string[]) : named?.cards ?? [];
if (deckProblems(deck).length) throw new Error(deckProblems(deck).join('; '));
const race = named?.race ?? 0;
const games = Number(process.argv[2] ?? 60);
const rows: string[] = [];
let total = 0;
for (const foe of PRESET_DECKS.slice(0, 4)) {
  let wins = 0;
  for (let g = 1; g <= games; g++) {
    const flip = g % 2 === 0;
    const seats = flip ? [1, 0] : [0, 1];
    let s = createGame({ seed: g * 7919, players: seats.map((k) => ({ name: k ? 'B' : 'A', isAI: true, species: k ? foe.race : race, deck: k ? foe.cards : deck })) });
    let n = 0;
    while (!isGameOver(s) && n++ < 5000) s = applyAction(s, chooseAIAction(s));
    if (s.players.find((p) => p.id === s.winnerId)?.name === 'A') wins++;
  }
  total += wins;
  rows.push(`${foe.name} ${Math.round((wins / games) * 100)}%`);
}
console.log(`${process.env.NAME ?? 'deck'}: ${((total / (games * 4)) * 100).toFixed(1)}% · ${rows.join(' · ')}`);
