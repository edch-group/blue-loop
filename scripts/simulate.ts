/**
 * Balance simulator: plays many AI-vs-AI games with the race starter decks and
 * reports win rates per deck, per seat, and per card (for the cards a winner
 * played), plus average game length. Usage: npm run simulate -- [games]
 */
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { cardDef, PRESET_DECKS } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';

/** A seeded random line-up of distinct starter decks (different seat orders every game). */
function pickDecks(seed: number) {
  let r = seed * 2654435761 >>> 0;
  const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const order = [...PRESET_DECKS].sort(() => rand() - 0.5);
  return order.slice(0, 2);
}

// Try a deck change without editing the presets: DECKS='{"1": ["card_id", ...]}' npm run simulate
for (const [i, cards] of Object.entries(JSON.parse(process.env.DECKS ?? '{}') as Record<string, string[]>)) PRESET_DECKS[Number(i)].cards = cards;

// ...or a card change: PATCH='{"card_id": {"onTurn": [...]}}'
for (const [id, patch] of Object.entries(JSON.parse(process.env.PATCH ?? '{}') as Record<string, object>)) Object.assign(cardDef(id), patch);

// ...or a rules number: BAL='{"maxPlays": 3}'
Object.assign(BALANCE, { maxLogEntries: 1e6 }, JSON.parse(process.env.BAL ?? '{}'));

const games = Number(process.argv[2] ?? 1000);

const deckWins = new Map<string, number>();
const deckGames = new Map<string, number>();
const seatWins = [0, 0];
const matchups = new Map<string, [number, number]>();
let totalRounds = 0;
let longest = 0;
let fatigueGames = 0;
/** How often each of the newer mechanics comes up, from the game logs. */
const MECHANICS: [string, RegExp][] = [
  ['lightspeed set', /sets a card face down/],
  ['lightspeed sprung', /Lightspeed! /],
  ['removal (destroy)', / destroys /],
  ['returned to hand', /returns .* to (their|your) hand|flung back/],
  ['stability eroded', /loses \d+ stability/],
  ['stability restored', /steadies/],
  ['faded to deck', /fades back into/],
  ['recovered', /recovers /],
  ['resonance/bulwark played', /plays (Resonance Lattice|Harmonic Singularity|Sunforge|The Admiralty|Tide Pylon|Prism Conduit|Bulwark Plating|Aegis Monolith|Chrono Anchor)/],
  ['command played', /plays (Command Directive|Ignition Protocol|Coolant Protocol|Chamber Protocol|The Admiralty)/],
];
const mechCount = new Map<string, number>();

for (let seed = 1; seed <= games; seed++) {
  const decks = pickDecks(seed);
  let s = createGame({ seed, players: decks.map((d, i) => ({ name: `AI ${i + 1}`, isAI: true, species: d.race, deck: d.cards })) });
  let steps = 0;
  while (!isGameOver(s) && steps++ < 5000) s = applyAction(s, chooseAIAction(s));
  totalRounds += s.round;
  longest = Math.max(longest, s.round);
  if (s.log.some((l) => l.text.includes('deck is empty'))) fatigueGames++;
  for (const [name, re] of MECHANICS) mechCount.set(name, (mechCount.get(name) ?? 0) + s.log.filter((l) => re.test(l.text)).length);
  const winnerIndex = s.players.findIndex((p) => p.id === s.winnerId);
  if (winnerIndex >= 0) seatWins[winnerIndex]++;
  decks.forEach((d, i) => {
    deckGames.set(d.name, (deckGames.get(d.name) ?? 0) + 1);
    if (i === winnerIndex) deckWins.set(d.name, (deckWins.get(d.name) ?? 0) + 1);
  });
  if (decks[0].name !== decks[1].name && winnerIndex >= 0) {
    const key = [decks[0].name, decks[1].name].sort().join(' vs ');
    const rec = matchups.get(key) ?? [0, 0];
    rec[decks[winnerIndex].name === key.split(' vs ')[0] ? 0 : 1]++;
    matchups.set(key, rec);
  }
}

const pct = (a: number, b: number) => `${((a / Math.max(1, b)) * 100).toFixed(1).padStart(5)}%`;
console.log(`${games} games. Average length: ${(totalRounds / games).toFixed(1)} rounds (longest ${longest}).`);
console.log(`Games where someone ran out of cards: ${pct(fatigueGames, games)}. Fair win rate: 50%\n`);
for (const d of PRESET_DECKS) console.log(`${d.name.padEnd(16)} ${pct(deckWins.get(d.name) ?? 0, deckGames.get(d.name) ?? 0)}  (${deckGames.get(d.name) ?? 0} seats)`);
console.log(`\nBy seat: ${seatWins.map((w, i) => `seat ${i + 1} ${pct(w, games)}`).join(' · ')}`);
if (matchups.size) {
  console.log('\nMatchups:');
  for (const [key, [a, b]] of matchups) console.log(`  ${key.padEnd(36)} ${pct(a, a + b)} / ${pct(b, a + b)}`);
}
console.log('\nMechanics per game:');
for (const [name] of MECHANICS) console.log(`  ${name.padEnd(28)} ${((mechCount.get(name) ?? 0) / games).toFixed(2)}`);
