/**
 * Why the AI ends its day with cards in hand: npm run ai-holds -- [games]. Sorts every day it ends holding 4+ cards
 * by reason (no energy, too costly, no room, or it chose to hold), lists the cards it held most and a sample of holds.
 */
import type { Action } from '../src/engine/types';
import { aiLastDecision, chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { cardDef, PRESET_DECKS } from '../src/engine/cards';
import { activePlayer, applyAction, cardCost, createGame, freeSlots, hasRoomFor, isGameOver } from '../src/engine/game';
Object.assign(BALANCE, { maxLogEntries: 1e6 });
const games = Number(process.argv[2] ?? 200);
const reasons: Record<string, number> = {};
const held: Record<string, number> = {};
const handAtEnd: number[] = [];
let ends = 0;
const declined: string[] = [];
for (let g = 1; g <= games; g++) {
  const a = PRESET_DECKS[g % PRESET_DECKS.length], b = PRESET_DECKS[(g * 7 + 3) % PRESET_DECKS.length];
  let s = createGame({ seed: g, players: [a, b].map((d, i) => ({ name: d.name + i, isAI: true, deck: d.cards })) });
  for (let n = 0; n < 5000 && !isGameOver(s); n++) {
    const me = activePlayer(s);
    aiLastDecision.best = null; aiLastDecision.bestAction = null; aiLastDecision.baseline = NaN;
    const act = chooseAIAction(s);
    if (act.type === 'endTurn') {
      ends++;
      handAtEnd.push(me.hand.length);
      if (me.hand.length >= 4) {
        const afford = me.hand.filter((c) => cardCost(c.defId) <= me.playsLeft);
        let why: string;
        if (me.playsLeft <= 0) why = 'no energy left';
        else if (!afford.length) why = `cards cost more than the energy left (${me.playsLeft})`;
        else if (!afford.some((c) => hasRoomFor(me, c.defId))) why = `no room (free slots ${freeSlots(me).length})`;
        else if (Number.isNaN(aiLastDecision.baseline)) why = 'ended before weighing plays';
        else if (aiLastDecision.best === null) why = 'no legal play found';
        else {
          why = 'chose to hold (every play scored worse)';
          if (declined.length < 25) {
            const ba = aiLastDecision.bestAction as Action | null;
            const bc = ba && ba.type === 'playCard' ? cardDef(me.hand.find((c) => c.uid === ba.cardUid)!.defId).name : ba?.type;
            declined.push(`R${s.round} ${me.name} e${me.playsLeft} slots${freeSlots(me).length} hand[${afford.map((c) => cardDef(c.defId).name + '(' + cardCost(c.defId) + ')').join(', ')}] best=${bc} by ${(aiLastDecision.best! - aiLastDecision.baseline).toFixed(2)}`);
          }
          for (const c of afford) held[cardDef(c.defId).name] = (held[cardDef(c.defId).name] ?? 0) + 1;
        }
        reasons[why] = (reasons[why] ?? 0) + 1;
      }
    }
    s = applyAction(s, act);
  }
}
console.log(`${ends} day ends; hand at end avg ${(handAtEnd.reduce((x, y) => x + y, 0) / handAtEnd.length).toFixed(1)}; with 4+ in hand: ${handAtEnd.filter((h) => h >= 4).length} (5+: ${handAtEnd.filter((h) => h >= 5).length})`);
for (const [k, v] of Object.entries(reasons).sort((x, y) => y[1] - x[1])) console.log(`  ${v}  ${k}`);
console.log('Most held (affordable, not played):', Object.entries(held).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log(declined.join('\n'));
