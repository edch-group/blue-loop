/**
 * Records campaign runs from the TypeScript engine, every action and the state after it, for the C# engine to replay
 * and match exactly (engine-cs/Tests). A seeded bot plays them: it answers whatever the run is waiting on (story,
 * rewards, conquests, encounters...), fights every battle with the AI on both sides, and otherwise flies, shops,
 * researches or ends the turn at random. Written to engine-cs/traces/runs.json (not kept in git: made by
 * `npm run record-runs`, here and in CI).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chooseAIAction } from '../src/engine/ai';
import {
  applyCampaignAction,
  armiesOf,
  armyMoves,
  buyProblem,
  createCampaign,
  nodeById,
  researchProblem,
  salvageOptions,
  type CampaignAction,
  type CampaignSetup,
  type CampaignState,
} from '../src/engine/campaign';
import { CAPTAIN } from '../src/engine/captain';
import { encounterChoices } from '../src/engine/encounters';
import { applyAction, isGameOver } from '../src/engine/game';
import { emptyMeta, runBonuses } from '../src/engine/meta';
import { nextRandom } from '../src/engine/rng';

const runs = Number(process.env.RUNS ?? 6);
const maxSteps = Number(process.env.STEPS ?? 150);

/** Play a battle out with the AI on both sides (how the bot fights). */
function fight(s: CampaignState) {
  let g = structuredClone(s.battle!.game);
  for (let n = 0; n < 600 && !isGameOver(g); n++) g = applyAction(g, chooseAIAction(g));
  return g;
}

function choose(s: CampaignState, rand: () => number): CampaignAction {
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  if (s.story.queue.length) return { type: 'readStory' };
  const joined = s.joined?.[0];
  if (joined) return joined.swap ? { type: 'crewSwap', out: null } : { type: 'joinedSeen' };
  if (s.loot) return { type: 'dismissLoot' };
  if (s.boon) return { type: 'takeBoon', pick: pick(['health', 'cool'] as const) };
  if (s.prophet) return { type: 'prophetPick', index: rand() < 0.2 ? null : Math.floor(rand() * s.prophet.offers.length) };
  if (s.emblemChoice) return { type: 'chooseEmblem', index: Math.floor(rand() * s.emblemChoice.length) };
  if (s.cardRewards.length) return { type: 'chooseCard', defId: rand() < 0.2 ? null : pick(s.cardRewards[0].options) };
  if (s.conquest) return { type: 'conquer', choice: pick(['settle', 'settle', 'absorb', 'supernova'] as const) };
  if (s.beaten) return { type: 'struggleChoice', recruit: rand() < 0.5 };
  if (s.encounter) {
    if (s.encounter.outcome) return { type: 'encounter', choice: 'done' };
    return { type: 'encounter', choice: pick(encounterChoices(s.encounter.kind, s.encounter.price, s.encounter.stage)).id };
  }
  if (s.battle) {
    if (rand() < 0.25) return { type: 'finishBattle', game: s.battle.game, auto: true };
    const game = fight(s);
    const salvage = salvageOptions(s, game);
    return { type: 'finishBattle', game, salvage: salvage.length && rand() < 0.7 ? pick(salvage) : null };
  }
  if (s.struggle) return { type: 'struggle' };
  if (s.dream) return { type: 'dream' };
  if (s.phase === 'ai') return { type: 'aiStep' };
  // The player's turn: fly, shop, research, or end it.
  const f = s.factions.find((x) => x.id === s.playerId)!;
  const army = armiesOf(s, s.playerId)[0];
  const options: CampaignAction[] = [{ type: 'endTurn', stepwise: rand() < 0.3 }];
  if (army) {
    const node = nodeById(s, army.nodeId);
    for (const m of armyMoves(s, army)) options.push({ type: 'move', armyId: army.id, toId: m.toId }, { type: 'move', armyId: army.id, toId: m.toId });
    const st = node.station;
    if (st?.kind === 'armory') for (let i = 0; i < st.cards.length; i++) if (!buyProblem(s, f, node, i)) options.push({ type: 'buyCard', nodeId: node.id, index: i });
    if (st?.kind === 'research') for (const p of st.options) if (!researchProblem(s, f, node, p)) options.push({ type: 'research', nodeId: node.id, projectId: p });
  }
  return pick(options);
}

const out: { setup: CampaignSetup; start: CampaignState; steps: { action: CampaignAction; state: CampaignState }[] }[] = [];
let total = 0;
for (let i = 0; i < runs; i++) {
  const meta = emptyMeta();
  const setup: CampaignSetup = i % 2 ? { seed: 500 + i * 131, captain: CAPTAIN, run: runBonuses(meta) } : { seed: 500 + i * 131, race: i % 8, run: runBonuses(meta) };
  const rng = { rngState: setup.seed * 3 + 1 };
  const rand = () => nextRandom(rng);
  let s = createCampaign(setup);
  const start = structuredClone(s);
  const steps: { action: CampaignAction; state: CampaignState }[] = [];
  for (let n = 0; n < maxSteps && !s.winner; n++) {
    const action = choose(s, rand);
    try {
      s = applyCampaignAction(s, action);
    } catch (e) {
      if (process.env.WHY) console.log(action.type, (e as Error).message);
      continue; // (a move the rules refuse: the bot tries something else)
    }
    steps.push({ action: structuredClone(action), state: structuredClone(s) });
  }
  out.push({ setup, start, steps });
  total += JSON.stringify(steps).length;
  console.log(`run ${i}: ${setup.captain ? 'captain' : `race ${setup.race}`}, ${steps.length} steps, turn ${s.turn}, universe ${s.universe}, winner ${s.winner}`);
}
mkdirSync('engine-cs/traces', { recursive: true });
writeFileSync('engine-cs/traces/runs.json', JSON.stringify(out));
console.log(`${(total / 1e6).toFixed(1)} MB`);
