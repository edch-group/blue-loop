/**
 * Card-pool simulator: AI-vs-AI games between random legal decks built from the whole pool (each a
 * race's cards plus neutral ones), reporting each card's win rate when it is in a deck, so cards far
 * above or below the rest stand out. Usage: npm run simulate:pool -- [games]
 */
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { CARDS, cardDef, commandCardsFor, copyLimit } from '../src/engine/cards';
import { EXPANSION } from '../src/engine/cards-expansion';
import { deckProblems } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';

Object.assign(BALANCE, { maxLogEntries: 1e6 });
const games = Number(process.argv[2] ?? 400);
let r = 12345;
const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

function randomDeck(race: number): string[] {
  const pool = CARDS.filter((c) => !c.fusedFrom && (c.race === undefined || c.race === race));
  const commands = pool.filter((c) => c.kind === 'command');
  const rest = pool.filter((c) => c.kind !== 'command' && c.kind !== 'global');
  const deck: string[] = [];
  while (deck.length < commandCardsFor(BALANCE.deckSize)) {
    const c = pick(commands);
    if (deck.filter((id) => id === c.id).length < copyLimit(c.id)) deck.push(c.id);
  }
  // Lean on the race's own cards, as a real deck would.
  const own = rest.filter((c) => c.race === race);
  while (deck.length < BALANCE.deckSize) {
    const c = rand() < 0.6 ? pick(own) : pick(rest);
    if (deck.filter((id) => id === c.id).length < copyLimit(c.id)) deck.push(c.id);
  }
  return deck;
}

const inDeck = new Map<string, [number, number]>();
const seat = [0, 0];
let rounds = 0;
let errors = 0;
for (let g = 1; g <= games; g++) {
  const races = [Math.floor(rand() * 4), Math.floor(rand() * 4)];
  const decks = races.map(randomDeck);
  for (const d of decks) if (deckProblems(d).length) throw new Error(deckProblems(d)[0]);
  let s = createGame({ seed: g, players: decks.map((deck, i) => ({ name: `AI ${i + 1}`, isAI: true, species: races[i], deck })) });
  let steps = 0;
  try {
    while (!isGameOver(s) && steps++ < 5000) s = applyAction(s, chooseAIAction(s));
  } catch (e) {
    errors++;
    console.log('ERROR', (e as Error).message, decks);
    continue;
  }
  rounds += s.round;
  const w = s.players.findIndex((p) => p.id === s.winnerId);
  if (w >= 0) seat[w]++;
  decks.forEach((d, i) => {
    for (const id of new Set(d)) {
      const rec = inDeck.get(id) ?? [0, 0];
      rec[1]++;
      if (i === w) rec[0]++;
      inDeck.set(id, rec);
    }
  });
}
const fresh = new Set(EXPANSION.map((c) => c.id));
console.log(`${games} games, ${errors} errors, ${(rounds / games).toFixed(1)} rounds, seats ${seat.join('/')}`);
const rows = [...inDeck].filter(([, [, n]]) => n >= 15).map(([id, [w, n]]) => [id, w / n, n] as const).sort((a, b) => b[1] - a[1]);
const show = (xs: typeof rows) => xs.map(([id, p, n]) => `${(p * 100).toFixed(0).padStart(3)}% ${String(n).padStart(4)}  ${fresh.has(id) ? '*' : ' '} ${cardDef(id).name}`).join('\n');
console.log('--- highest\n' + show(rows.slice(0, 18)));
console.log('--- lowest\n' + show(rows.slice(-18)));
