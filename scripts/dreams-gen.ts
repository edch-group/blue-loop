/**
 * Dreams of the Lost: generates the dream puzzles (src/engine/dreams-data.ts). Each is a random position, kept only
 * if a full search proves it can be solved, ending the day at once fails, and few random lines of play solve it;
 * the harder the tier, the longer the shortest solution and the fewer the lucky lines. Its sun's heat is set from the
 * search so that only the best line is enough (win: the rival's sun one best line from supernova; survive: yours one
 * heat short of it after the rival's day, if you play best).
 *
 *   TIERS=1,2 RACES=0-7 OUT=dreams.jsonl npx vite-node scripts/dreams-gen.ts, then scripts/dreams-merge.ts
 */
import { appendFileSync } from 'node:fs';
import { CARDS } from '../src/engine/cards';
import { activePlayer, applyAction, cardCost, createDream, isGameOver, type DreamSide, type DreamSpec } from '../src/engine/game';
import { chooseAIAction, movesNow } from '../src/engine/ai';
import type { Action, CardDef, GameState } from '../src/engine/types';

const OK_EFFECTS = new Set(['heat', 'cool', 'shield', 'destroy', 'selfHeat', 'repair', 'plays', 'erode', 'strikeAll', 'strikeBest']);
const OK_PASSIVES = new Set(['taunt', 'retaliate', 'guard']);
const simple = (d: CardDef) =>
  ['attack', 'defence', 'growth'].includes(d.kind) &&
  !d.fusion && !d.consume && !d.spendAll && !d.lightspeed && !d.choices && !d.trap && !d.attune && !d.onLeave?.length && !d.onDusk?.length &&
  !d.id.startsWith('boss') && !d.overlordPart && !d.character &&
  [...(d.onPlay ?? []), ...(d.onTurn ?? [])].every((e) => OK_EFFECTS.has(e.type) && !e.if && !('plus' in e && e.plus)) &&
  (d.passive ?? []).every((p) => OK_PASSIVES.has(p.type)) &&
  cardCost(d.id) <= 3;
const POOL = CARDS.filter(simple);
/** A race's own cards (with neutral ones only where it has too few of its own). */
const byRace = (race: number, want: (d: CardDef) => boolean = () => true) => {
  const own = POOL.filter((c) => c.race === race && want(c));
  return own.length >= 4 ? own : POOL.filter((c) => (c.race === race || c.race === undefined) && want(c));
};
const handCard = (d: CardDef) => (d.onPlay?.length ?? 0) > 0 || (d.attack ?? 0) > 0;
const boardCard = (d: CardDef) => (d.attack ?? 0) > 0 || (d.passive ?? []).some((p) => p.type === 'taunt') || (d.defence ?? 0) > 0;

let seed = 1;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];

const key = (s: GameState) =>
  JSON.stringify(s.players.map((p) => [p.heat, p.shields, p.playsLeft, p.tableau.map((c) => [c.defId, c.slot, c.health, c.dimmed ? 1 : 0, c.spentAttack ? 1 : 0, c.dented ?? 0, c.shields ?? 0]).sort(), p.hand.map((c) => c.defId).sort()]));

function step(s: GameState, a: Action): GameState | null {
  try {
    const n = applyAction(s, a);
    if (n.reaction || n.players[0].dawnChoices?.length) return null;
    return n;
  } catch {
    return null;
  }
}

/** The rival's whole day, played by the AI, back round to the dreamer (or to an end). */
function rivalDay(s: GameState): GameState {
  let g = step(s, { type: 'endTurn' });
  if (!g) return s;
  for (let i = 0; i < 80 && !isGameOver(g) && activePlayer(g) !== g.players[0]; i++) {
    const n = step(g, chooseAIAction(g));
    if (!n) break;
    g = n;
  }
  return g;
}

/** Every position reachable this day (to a cap), with the fewest moves to reach it. */
function reach(start: GameState, cap = 6000): { s: GameState; depth: number }[] {
  const seen = new Map<string, number>();
  const out: { s: GameState; depth: number }[] = [];
  const queue = [{ s: start, depth: 0 }];
  seen.set(key(start), 0);
  while (queue.length && out.length < cap) {
    const cur = queue.shift()!;
    out.push(cur);
    if (isGameOver(cur.s)) continue;
    for (const a of movesNow(cur.s)) {
      const n = step(cur.s, a);
      if (!n) continue;
      const k = key(n);
      if (seen.has(k)) continue;
      seen.set(k, cur.depth + 1);
      queue.push({ s: n, depth: cur.depth + 1 });
    }
  }
  return out;
}

const won = (s: GameState) => s.winnerId === s.players[0].id;

/** Whether a line solves it: a win reached this day, or (survive) the rival's day lived through after it. */
function solves(spec: DreamSpec, s: GameState): boolean {
  if (spec.goal === 'win') return won(s);
  if (isGameOver(s)) return won(s);
  return won(rivalDay(s));
}

function randomRate(spec: DreamSpec, tries = 160): number {
  let ok = 0;
  for (let t = 0; t < tries; t++) {
    let s = createDream(spec, { seed: 7, name: 'Dreamer', foeName: 'Dream' });
    for (let i = 0; i < 12 && !isGameOver(s); i++) {
      const moves = movesNow(s);
      if (!moves.length || rand() < 0.15) break;
      const n = step(s, pick(moves));
      if (n) s = n;
    }
    if (solves(spec, s)) ok++;
  }
  return ok / tries;
}

/** The shortest solution's length (null: none within reach). */
function shortest(spec: DreamSpec): number | null {
  const all = reach(createDream(spec, { seed: 7, name: 'Dreamer', foeName: 'Dream' }));
  let best: number | null = null;
  for (const { s, depth } of all) if ((best === null || depth < best) && solves(spec, s)) best = depth;
  return best;
}

const TIERS = [
  { hand: 2, energy: 2, mine: [1, 2], foe: [1, 2], len: 2, rate: 0.5 },
  { hand: 3, energy: 3, mine: [1, 2], foe: [2, 3], len: 3, rate: 0.3 },
  { hand: 4, energy: 4, mine: [2, 3], foe: [2, 3], len: 4, rate: 0.2 },
  { hand: 5, energy: 5, mine: [2, 3], foe: [3, 4], len: 5, rate: 0.12 },
];

function side(cards: CardDef[], n: number): DreamSide['cards'] {
  const slots = [0, 1, 2, 3, 4].sort(() => rand() - 0.5);
  return Array.from({ length: n }, (_, i) => ({ id: pick(cards).id, slot: slots[i] }));
}

function attempt(tier: number, race: number, goal: 'win' | 'survive'): DreamSpec | null {
  const T = TIERS[tier - 1];
  const foeRace = pick([0, 1, 2, 3, 4, 5, 6, 7].filter((r) => r !== race));
  const foes = byRace(foeRace);
  const n = (r: number[]) => r[0] + Math.floor(rand() * (r[1] - r[0] + 1));
  const spec: DreamSpec = {
    id: '',
    tier,
    goal,
    race,
    energy: T.energy,
    hand: Array.from({ length: T.hand }, () => pick(byRace(race, handCard)).id),
    me: { heat: 0, max: 20, cards: side(byRace(race, boardCard), n(T.mine)) },
    foe: { heat: 0, max: 20, cards: side(goal === 'survive' ? foes.filter((d) => (d.attack ?? 0) > 0 || boardCard(d)) : foes.filter(boardCard), n(T.foe)) },
  };
  // (With no danger in the dark: room to measure.)
  spec.me.max = spec.foe.max = 99;
  const start = createDream(spec, { seed: 7, name: 'Dreamer', foeName: 'Dream' });
  const all = reach(start);
  if (goal === 'win') {
    const gain = Math.max(...all.map(({ s }) => s.players[1].heat)) - start.players[1].heat;
    if (gain < 3 || gain > 20) return null;
    spec.foe = { ...spec.foe, max: 20, heat: 20 - gain };
    spec.me = { ...spec.me, max: 20, heat: 4 + Math.floor(rand() * 6) };
  } else {
    const after = (s: GameState) => rivalDay(s).players[0].heat - start.players[0].heat;
    const naive = after(start);
    const best = Math.min(...all.slice(0, 1500).map(({ s }) => after(s)));
    if (naive - best < 2 || best < 0) return null;
    spec.me = { ...spec.me, max: 20, heat: Math.max(0, 19 - best) };
    if (spec.me.heat + naive < 20) return null;
    spec.foe = { ...spec.foe, max: 20, heat: 8 + Math.floor(rand() * 6) };
  }
  const len = shortest(spec);
  if (len === null || len < T.len) return null;
  if (solves(spec, createDream(spec, { seed: 7, name: 'Dreamer', foeName: 'Dream' }))) return null;
  const rate = randomRate(spec);
  if (rate > T.rate) return null;
  return spec;
}

// Which tiers and races to make (TIERS="1,2" RACES="0-3"), and the file each puzzle is added to as it is found (OUT, one
// per line; scripts/dreams-merge.ts writes them into the game).
const tiers = (process.env.TIERS ?? '1,2,3,4').split(',').map(Number);
const [r0, r1] = (process.env.RACES ?? '0-7').split('-').map(Number);
const OUT = process.env.OUT ?? 'dreams.jsonl';
seed = Number(process.env.SEED ?? 1);
for (const tier of tiers) {
  for (let race = r0; race <= r1; race++) {
    for (const goal of ['win', 'survive'] as const) {
      let got: DreamSpec | null = null;
      for (let i = 0; i < 400 && !got; i++) got = attempt(tier, race, goal);
      if (got) {
        got.id = `t${tier}-r${race}-${goal}`;
        appendFileSync(OUT, JSON.stringify(got) + '\n');
      }
      console.log(tier, race, goal, got ? 'ok' : 'none');
    }
  }
}
