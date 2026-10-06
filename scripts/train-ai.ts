/**
 * Trains the AI on players' own games: TRACES=file.json npm run train-ai.
 *
 * Games on a device (against the AI, or pass and play) are kept whole (src/engine/stats.ts: the state they began
 * in and every move since, sent compressed with the anonymous game summary). They replay exactly, so at every
 * choice a player made, the AI can be asked what it would have done: every move it weighed, with its score.
 * How often its first choice is the player's, and how high it ranks the player's move, is how much it plays
 * like them. The trainer then nudges the AI's weights (src/engine/ai.ts, aiWeights) one at a time to make it
 * agree more, and last of all plays the trained AI against the current one, so a change that only copies a
 * player's habits without winning more is seen for what it is.
 *
 * TRACES: a JSON array of game summaries (each with `trace` or `trace64`), as the server keeps them in
 * game_stats.data. SELF=n: games for the trained-against-current check (default 200; 0 skips it).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { aiScores, aiWeights, chooseAIAction, keepAIScores, setAIWeights } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { PRESET_DECKS } from '../src/engine/cards';
import { activePlayer, applyAction, createGame, isGameOver } from '../src/engine/game';
import type { Action, GameState } from '../src/engine/types';

Object.assign(BALANCE, { maxLogEntries: 1e6 });
type Trace = { start: GameState; moves: Action[] };
const raw = JSON.parse(readFileSync(process.env.TRACES ?? 'traces.json', 'utf8')) as { trace?: Trace; trace64?: string }[];
const traces: Trace[] = raw.flatMap((g) => (g.trace ? [g.trace] : g.trace64 ? [JSON.parse(gunzipSync(Buffer.from(g.trace64, 'base64')).toString('utf8')) as Trace] : []));

/** A move as a player means it: which card, at what (not the slot it went in, which seldom matters). */
function key(a: Action): string {
  switch (a.type) {
    case 'playCard': return `play ${a.cardUid} ${a.enemyUid ?? ''} ${a.allyUid ?? ''} ${a.recoverUid ?? ''} ${a.hostUid ?? ''} ${a.choice ?? ''} ${a.faceDown ? 'down' : ''}`;
    case 'attack': return `attack ${a.attackerUid} ${a.targetUid ?? 'sun'}`;
    case 'heroAbility': return `ability ${a.index} ${a.aimUid ?? ''}`;
    case 'endTurn': return 'end';
    default: return a.type;
  }
}

// Every choice the players made that the AI weighs too: the state, and the player's move.
const choices: { state: GameState; move: string }[] = [];
let replayed = 0;
for (const t of traces) {
  let s = t.start;
  const humans = new Set(t.start.players.filter((p) => !p.isAI).map((p) => p.id));
  try {
    for (const m of t.moves) {
      if (isGameOver(s)) break;
      if (humans.has(activePlayer(s).id) && ['playCard', 'attack', 'heroAbility', 'endTurn'].includes(m.type)) choices.push({ state: s, move: key(m) });
      s = applyAction(s, m);
    }
    replayed++;
  } catch (e) {
    console.log('a game no longer replays (the rules changed since):', (e as Error).message);
  }
}
console.log(`${traces.length} games, ${replayed} replayed, ${choices.length} choices by players`);

/** How much the AI, with its current weights, plays like the players: share of first choices that match, and mean rank of the player's move (0 best, 1 worst). */
function agreement() {
  let top = 0, rank = 0, n = 0;
  for (const c of choices) {
    keepAIScores(true);
    let pick: Action;
    try {
      pick = chooseAIAction(c.state);
    } catch {
      continue;
    }
    const scores = aiScores ?? [];
    keepAIScores(false);
    if (scores.length < 2) continue; // (no real choice weighed)
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const at = sorted.findIndex((x) => key(x.action) === c.move);
    if (at < 0) continue; // (a move it doesn't consider)
    n++;
    if (key(pick) === c.move) top++;
    rank += at / (sorted.length - 1);
  }
  return { top: n ? top / n : 0, rank: n ? rank / n : 1, n };
}
const fitness = (a: ReturnType<typeof agreement>) => a.top - 0.5 * a.rank;

const start = aiWeights();
let best = { ...start };
let bestA = agreement();
console.log(`before: first choice matches ${(bestA.top * 100).toFixed(1)}%, the player's move ranks ${(bestA.rank * 100).toFixed(1)}% down (${bestA.n} choices)`);
for (let pass = 0; pass < 2; pass++) {
  for (const name of Object.keys(start)) {
    for (const f of [0.5, 0.75, 1.25, 1.5, 2]) {
      const trial = { ...best, [name]: best[name] * f };
      setAIWeights(trial);
      const a = agreement();
      if (fitness(a) > fitness(bestA) + 0.002) {
        best = trial;
        bestA = a;
        console.log(`  ${name} ×${f} → ${best[name].toFixed(3)}: matches ${(a.top * 100).toFixed(1)}%, ranks ${(a.rank * 100).toFixed(1)}%`);
      }
    }
    setAIWeights(best);
  }
}
console.log('\ntrained weights:', JSON.stringify(Object.fromEntries(Object.entries(best).map(([k, v]) => [k, Number(v.toFixed(3))]))));
console.log(`after: first choice matches ${(bestA.top * 100).toFixed(1)}%, ranks ${(bestA.rank * 100).toFixed(1)}%`);

// Does the trained AI win more than the current one? (Each seat's weights are set before its move.)
const games = Number(process.env.SELF ?? 200);
if (games > 0) {
  let wins = 0;
  for (let g = 1; g <= games; g++) {
    const da = PRESET_DECKS[g % PRESET_DECKS.length].cards, db = PRESET_DECKS[(g * 7 + 3) % PRESET_DECKS.length].cards;
    const trainedFirst = g % 2 === 0;
    let s = createGame({ seed: g, players: [{ name: trainedFirst ? 'T' : 'C', isAI: true, deck: da }, { name: trainedFirst ? 'C' : 'T', isAI: true, deck: db }] });
    for (let n = 0; !isGameOver(s) && n < 5000; n++) {
      setAIWeights(activePlayer(s).name === 'T' ? best : start);
      s = applyAction(s, chooseAIAction(s));
    }
    // (The trained AI takes the first seat and deck every other game.)
    if (s.players.find((p) => p.id === s.winnerId)?.name === 'T') wins++;
  }
  console.log(`trained against current: ${((wins / games) * 100).toFixed(1)}% of ${games} games`);
}
