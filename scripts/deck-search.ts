/**
 * How good can a deck get? Builds random legal decks (MIX=1: from every race; otherwise one race plus
 * neutral cards), plays each against every race's starter deck, and lists the best, with their race mix.
 * Usage: MIX=1 npm run deck-search -- [decks] [games per deck]
 */
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { CARDS, cardDef, commandCardsFor, copyLimit, deckProblems, presetDeck, RACE_NAMES } from '../src/engine/cards';
import { applyAction, createGame, isGameOver } from '../src/engine/game';

Object.assign(BALANCE, { maxLogEntries: 1e6 });
const mix = process.env.MIX === '1';
const decks = Number(process.argv[2] ?? 30);
const per = Number(process.argv[3] ?? 16);
let r = Number(process.env.SEED ?? 99);
const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

function randomDeck(race: number): string[] {
  const pool = CARDS.filter((c) => !c.fusedFrom && c.kind !== 'global' && (mix || c.race === undefined || c.race === race));
  const commands = pool.filter((c) => c.kind === 'command');
  const rest = pool.filter((c) => c.kind !== 'command');
  const deck: string[] = [];
  while (deck.length < commandCardsFor(BALANCE.deckSize)) {
    const c = pick(commands);
    if (deck.filter((id) => id === c.id).length < copyLimit(c.id)) deck.push(c.id);
  }
  while (deck.length < BALANCE.deckSize) {
    const c = pick(rest);
    if (deck.filter((id) => id === c.id).length < copyLimit(c.id)) deck.push(c.id);
  }
  return deck;
}

const STARTERS = RACE_NAMES.map((_, k) => presetDeck(k));
const results: { deck: string[]; win: number; race: number }[] = [];
for (let d = 0; d < decks; d++) {
  const race = Math.floor(rand() * RACE_NAMES.length);
  const deck = randomDeck(race);
  if (deckProblems(deck).length) continue;
  let wins = 0;
  for (let g = 0; g < per; g++) {
    const opp = STARTERS[g % STARTERS.length];
    const first = Math.floor(g / STARTERS.length) % 2 === 0;
    const players = [{ name: 'X', isAI: true, species: race, deck }, { name: 'S', isAI: true, species: opp.race, deck: opp.cards }];
    let s = createGame({ seed: d * 1000 + g, players: first ? players : players.reverse() });
    let n = 0;
    while (!isGameOver(s) && n++ < 5000) s = applyAction(s, chooseAIAction(s));
    if (s.players.find((p) => p.id === s.winnerId)?.name === 'X') wins++;
  }
  results.push({ deck, win: wins / per, race });
}
results.sort((a, b) => b.win - a.win);
const avg = results.reduce((t, x) => t + x.win, 0) / results.length;
console.log(`${mix ? 'mixed-race' : 'single-race'}: ${results.length} decks, average ${(avg * 100).toFixed(0)}% against the starters`);
for (const x of results.slice(0, 3)) {
  const races = [...RACE_NAMES.map((_, k) => k), -1].map((k) => x.deck.filter((id) => (cardDef(id).race ?? -1) === k).length);
  const kinds = ['attack', 'defence', 'growth', 'lightspeed', 'command'].map((k) => `${k} ${x.deck.filter((id) => cardDef(id).kind === k).length}`).join(', ');
  console.log(`  ${(x.win * 100).toFixed(0)}%  races ${[...RACE_NAMES.map((n) => n[0]), 'neutral'].join('/')} ${races.join('/')}  · ${kinds}`);
}
