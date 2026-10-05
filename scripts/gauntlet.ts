/**
 * One deck against every race's starter: DECK='["id", ...]' (or NAME='Orbit Riders' for a starter)
 * npm run gauntlet -- [games per starter]. PATCH and BAL work as in the simulator. Seats alternate; reports the deck's win rate against each.
 */
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { cardDef, deckProblems, PRESET_DECKS, presetDeck, RACE_NAMES } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';

// Try card or rules changes too: PATCH='{"card_id": {...}}' BAL='{"minHeat": -3}'.
for (const [id, patch] of Object.entries(JSON.parse(process.env.PATCH ?? '{}') as Record<string, object>)) Object.assign(cardDef(id), patch);
Object.assign(BALANCE, { maxLogEntries: 1e6 }, JSON.parse(process.env.BAL ?? '{}'));
const named = PRESET_DECKS.find((d) => d.name === process.env.NAME);
const deck = process.env.DECK ? (JSON.parse(process.env.DECK) as string[]) : named?.cards ?? [];
if (deckProblems(deck).length) throw new Error(deckProblems(deck).join('; '));
const games = Number(process.argv[2] ?? 60);
const rows: string[] = [];
let total = 0;
// FIELD=1: against every other starter, not just the race decks (each race's own starter).
const foes = process.env.FIELD ? PRESET_DECKS.filter((d) => d.name !== process.env.NAME) : RACE_NAMES.map((_, k) => presetDeck(k));
for (const foe of foes) {
  let wins = 0;
  for (let g = 1; g <= games; g++) {
    const flip = g % 2 === 0;
    const seats = flip ? [1, 0] : [0, 1];
    let s = createGame({ seed: g * 7919, players: seats.map((k) => ({ name: k ? 'B' : 'A', isAI: true, deck: k ? foe.cards : deck })) });
    let n = 0;
    while (!isGameOver(s) && n++ < 5000) s = applyAction(s, chooseAIAction(s));
    if (s.players.find((p) => p.id === s.winnerId)?.name === 'A') wins++;
  }
  total += wins;
  rows.push(`${foe.name} ${Math.round((wins / games) * 100)}%`);
}
console.log(`${process.env.NAME ?? 'deck'}: ${((total / (games * foes.length)) * 100).toFixed(1)}% · ${rows.join(' · ')}`);
