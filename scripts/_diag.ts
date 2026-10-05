import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { PRESET_DECKS, cardDef } from '../src/engine/cards';
import { applyAction, createGame, isGameOver, activePlayer } from '../src/engine/game';
Object.assign(BALANCE, { maxLogEntries: 1e6 });
const A = Number(process.argv[2] ?? 2), B = Number(process.argv[3] ?? 0), N = Number(process.argv[4] ?? 80);
const plays = new Map<string, [number, number]>(); let wins = 0;
const stats = { heatDealt: 0, heatTaken: 0, shields: 0, rounds: 0, energyLeft: 0, days: 0, handEnd: 0 };
for (let g = 0; g < N; g++) {
  const first = g % 2 === 0;
  const decks = first ? [A, B] : [B, A];
  let s = createGame({ seed: 1000 + g, players: decks.map((d, i) => ({ name: `P${i}`, isAI: true, deck: PRESET_DECKS[d].cards, deckName: PRESET_DECKS[d].name })) });
  const me = first ? 0 : 1;
  const played: string[] = [];
  let n = 0;
  while (!isGameOver(s) && n++ < 5000) {
    const a = chooseAIAction(s);
    const p = activePlayer(s);
    if (s.players.indexOf(p) === me) {
      if (a.type === 'playCard') played.push(p.hand.find((c) => c.uid === a.cardUid)!.defId);
      if (a.type === 'endTurn') { stats.energyLeft += p.playsLeft; stats.days++; stats.handEnd += p.hand.length; }
    }
    s = applyAction(s, a);
  }
  const won = s.winnerId === s.players[me].id;
  if (won) wins++;
  stats.rounds += s.round;
  for (const id of new Set(played)) { const e = plays.get(id) ?? [0, 0]; e[0]++; if (won) e[1]++; plays.set(id, e); }
}
console.log(`${PRESET_DECKS[A].name} vs ${PRESET_DECKS[B].name}: ${(100 * wins / N).toFixed(1)}%  rounds ${(stats.rounds / N).toFixed(1)}  energy left/day ${(stats.energyLeft / stats.days).toFixed(2)}  hand at dusk ${(stats.handEnd / stats.days).toFixed(1)}`);
for (const [id, [n, w]] of [...plays].sort((a, b) => b[1][0] - a[1][0])) console.log(`  ${cardDef(id).name.padEnd(26)} played in ${String(n).padStart(3)}  win ${(100 * w / n).toFixed(0)}%`);
