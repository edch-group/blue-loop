// NAME=deck TRAIT='{"4":{"ambush":false}}' PATCH='{"id":{...}}' DECK='[...]' npx tsx scripts/_bal.ts [games per foe]
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { PRESET_DECKS, cardDef } from '../src/engine/cards';
import { RACE_TRAITS } from '../src/engine/races';
import { applyAction, createGame, isGameOver } from '../src/engine/game';
Object.assign(BALANCE, { maxLogEntries: 1e6 });
for (const [r, t] of Object.entries(JSON.parse(process.env.TRAIT ?? '{}'))) Object.assign(RACE_TRAITS[Number(r)], t);
for (const [id, p] of Object.entries(JSON.parse(process.env.PATCH ?? '{}'))) Object.assign(cardDef(id), p);
const me = PRESET_DECKS.find((d) => d.name === process.env.NAME)!;
const cards = process.env.DECK ? JSON.parse(process.env.DECK) : me.cards;
const n = Number(process.argv[2] ?? 10);
let wins = 0, games = 0;
for (const foe of PRESET_DECKS) {
  if (foe === me) continue;
  for (let g = 1; g <= n; g++) {
    const ps = [{ name: 'P', isAI: true, species: me.race, deck: cards }, { name: 'F', isAI: true, species: foe.race, deck: foe.cards }];
    let s = createGame({ seed: g * 7919 + 13, players: g % 2 ? ps : ps.reverse() });
    let k = 0;
    while (!isGameOver(s) && k++ < 5000) s = applyAction(s, chooseAIAction(s));
    games++; if (s.players.find((p) => p.id === s.winnerId)?.name === 'P') wins++;
  }
}
console.log(`${process.env.LABEL ?? me.name}: ${((100 * wins) / games).toFixed(1)}%`);
