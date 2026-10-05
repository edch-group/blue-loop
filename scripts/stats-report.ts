/**
 * The anonymous game summaries players send (see src/engine/stats.ts and server/accounts.ts), summed up for
 * balancing: how each deck does against each other, which cards are played and how often their side wins,
 * who goes first and wins, how long games last, and what kinds of decks people build.
 *
 *   ADMIN_TOKEN=… npx tsx scripts/stats-report.ts [https://your-game.example] [--mode=ai|online|ranked|…] [--since=YYYY-MM-DD]
 *
 * (ADMIN_TOKEN is the secret set on the Worker in Cloudflare. Summaries are fetched in pages and cached in
 * .stats-cache.json, so a second run only fetches what's new.)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cardDef, RACE_NAMES, type GameStats } from '../src/engine';

type Row = GameStats & { id: number; day: number; version: string };

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? process.env.GAME_URL ?? '').replace(/\/$/, '');
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const token = process.env.ADMIN_TOKEN;
if (!base || !token) {
  console.error('Usage: ADMIN_TOKEN=… npx tsx scripts/stats-report.ts https://your-game.example [--mode=ai] [--since=2026-10-01]');
  process.exit(1);
}

const CACHE = '.stats-cache.json';
const rows: Row[] = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : [];
for (;;) {
  const after = rows.length ? rows[rows.length - 1].id : 0;
  const res = await fetch(`${base}/api/admin/stats?after=${after}&limit=500`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`The server said ${res.status}`);
  const page = ((await res.json()) as { stats: Row[] }).stats;
  rows.push(...page);
  if (page.length < 500) break;
}
writeFileSync(CACHE, JSON.stringify(rows));

const since = opt('since') ? Date.parse(opt('since')!) : 0;
const games = rows.filter((r) => (!opt('mode') || r.mode === opt('mode')) && r.day >= since);
console.log(`${games.length} games${opt('mode') ? ` (${opt('mode')})` : ''} of ${rows.length}\n`);
if (!games.length) process.exit(0);

// A deck as players know it: the starter it is, or else its races (the cards' own), by share of its cards.
const label = (s: GameStats['seats'][number]) => {
  if (s.starter) return s.starter;
  const by = new Map<string, number>();
  for (const id of s.cards) {
    const race = cardDef(id)?.race;
    const k = race === undefined ? 'neutral' : RACE_NAMES[race];
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  const main = [...by].filter(([k]) => k !== 'neutral').sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  return `custom ${main.join('/') || 'neutral'}`;
};
const pct = (w: number, n: number) => (n ? `${((100 * w) / n).toFixed(0)}%`.padStart(4) : '   –');

// Decks, overall and against each other.
const deck = new Map<string, { n: number; w: number; humanN: number; humanW: number }>();
const vs = new Map<string, { n: number; w: number }>();
for (const g of games) {
  g.seats.forEach((s, i) => {
    const k = label(s);
    const d = deck.get(k) ?? { n: 0, w: 0, humanN: 0, humanW: 0 };
    d.n++;
    if (g.winner === i) d.w++;
    if (s.human) {
      d.humanN++;
      if (g.winner === i) d.humanW++;
    }
    deck.set(k, d);
    g.seats.forEach((o, j) => {
      if (j === i) return;
      const key = `${k} vs ${label(o)}`;
      const v = vs.get(key) ?? { n: 0, w: 0 };
      v.n++;
      if (g.winner === i) v.w++;
      vs.set(key, v);
    });
  });
}
console.log('Decks: games, win rate (and played by a person)');
for (const [k, d] of [...deck].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(28)} ${String(d.n).padStart(5)} ${pct(d.w, d.n)}   person ${String(d.humanN).padStart(4)} ${pct(d.humanW, d.humanN)}`);
console.log('\nMatch-ups (5+ games)');
for (const [k, v] of [...vs].filter(([, v]) => v.n >= 5).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(50)} ${String(v.n).padStart(5)} ${pct(v.w, v.n)}`);

// Cards: in how many decks, how often played, and how often the side that played them won.
const card = new Map<string, { decks: number; decksWon: number; played: number; playedGames: number; playedWon: number }>();
for (const g of games) {
  g.seats.forEach((s, i) => {
    const won = g.winner === i;
    for (const id of new Set(s.cards)) {
      const c = card.get(id) ?? { decks: 0, decksWon: 0, played: 0, playedGames: 0, playedWon: 0 };
      c.decks++;
      if (won) c.decksWon++;
      card.set(id, c);
    }
    const playedHere = new Set<string>();
    for (const [seat, , id] of g.plays) if (seat === i) {
      const c = card.get(id) ?? { decks: 0, decksWon: 0, played: 0, playedGames: 0, playedWon: 0 };
      c.played++;
      if (!playedHere.has(id)) {
        playedHere.add(id);
        c.playedGames++;
        if (won) c.playedWon++;
      }
      card.set(id, c);
    }
  });
}
const name = (id: string) => cardDef(id)?.name ?? id;
const cards = [...card].filter(([, c]) => c.playedGames >= 5);
console.log('\nCards most played: decks it is in, plays, win rate when played');
for (const [id, c] of [...card].sort((a, b) => b[1].played - a[1].played).slice(0, 30)) console.log(`  ${name(id).padEnd(28)} ${String(c.decks).padStart(5)} ${String(c.played).padStart(6)} ${pct(c.playedWon, c.playedGames)}`);
console.log('\nHighest win rate when played (5+ games)');
for (const [id, c] of cards.sort((a, b) => b[1].playedWon / b[1].playedGames - a[1].playedWon / a[1].playedGames).slice(0, 15)) console.log(`  ${name(id).padEnd(28)} ${String(c.playedGames).padStart(5)} ${pct(c.playedWon, c.playedGames)}`);
console.log('\nLowest win rate when played (5+ games)');
for (const [id, c] of cards.sort((a, b) => a[1].playedWon / a[1].playedGames - b[1].playedWon / b[1].playedGames).slice(0, 15)) console.log(`  ${name(id).padEnd(28)} ${String(c.playedGames).padStart(5)} ${pct(c.playedWon, c.playedGames)}`);
const unplayed = [...card].filter(([, c]) => c.decks >= 5 && c.played / c.decks < 0.25);
if (unplayed.length) console.log(`\nIn decks but rarely played: ${unplayed.map(([id]) => name(id)).join(', ')}`);

// The game itself.
const first = games.filter((g) => g.winner === 0).length;
const ends = new Map<string, number>();
for (const g of games) ends.set(g.end, (ends.get(g.end) ?? 0) + 1);
console.log(`\nFirst player wins ${pct(first, games.length)}; average ${(games.reduce((t, g) => t + g.rounds, 0) / games.length).toFixed(1)} rounds; ends: ${[...ends].map(([k, v]) => `${k} ${v}`).join(', ')}`);
const custom = games.flatMap((g) => g.seats.filter((s) => s.human && !s.starter));
console.log(`Decks people built themselves: ${custom.length} of ${games.flatMap((g) => g.seats.filter((s) => s.human)).length} played by a person`);
