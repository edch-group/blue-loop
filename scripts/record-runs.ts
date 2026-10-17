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
  buildUniverse,
  buyProblem,
  encounterProblem,
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
import { emptyMeta, runBonuses, type MetaState } from '../src/engine/meta';
import { plainAscent } from '../src/engine/ascent';
import { nextRandom } from '../src/engine/rng';

const runs = Number(process.env.RUNS ?? 6);
const maxSteps = Number(process.env.STEPS ?? 400);

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
  if (s.battle) {
    if (rand() < 0.1) return { type: 'finishBattle', game: s.battle.game, auto: true };
    // (Mostly handed back as the player's win, as the campaign tests do, so runs go deep: rifts, Overlords, later galaxies.)
    const game = fight(s);
    if (rand() < 0.95 && game.winnerId !== game.players[0].id) game.winnerId = game.players[0].id;
    const salvage = salvageOptions(s, game);
    return { type: 'finishBattle', game, salvage: salvage.length && rand() < 0.7 ? pick(salvage) : null };
  }
  if (s.encounter) {
    if (s.encounter.outcome) return { type: 'encounter', choice: 'done' };
    return { type: 'encounter', choice: pick(encounterChoices(s.encounter.kind, s.encounter.price, s.encounter.stage).filter((c) => !encounterProblem(s, c.id))).id };
  }
  if (s.struggle) return { type: 'struggle' };
  if (s.dream) return { type: 'dream' };
  if (s.phase === 'ai') return { type: 'aiStep' };
  // The player's turn: shop or research now and then, otherwise fly on (mostly forward, as a player must to outrun
  // the collapse), ending the turn once there's nowhere to go.
  const f = s.factions.find((x) => x.id === s.playerId)!;
  const army = armiesOf(s, s.playerId)[0];
  if (!army) return { type: 'endTurn' };
  const node = nodeById(s, army.nodeId);
  const st = node.station;
  const extras: CampaignAction[] = [];
  if (st?.kind === 'armory') for (let i = 0; i < st.cards.length; i++) if (!buyProblem(s, f, node, i)) extras.push({ type: 'buyCard', nodeId: node.id, index: i });
  if (st?.kind === 'research') for (const p of st.options) if (!researchProblem(s, f, node, p)) extras.push({ type: 'research', nodeId: node.id, projectId: p });
  if (extras.length && rand() < 0.6) return pick(extras);
  const moves = armyMoves(s, army);
  if (!moves.length || rand() < 0.08) return { type: 'endTurn', stepwise: rand() < 0.3 };
  // (A secret found: tried, mostly.)
  const secret = moves.filter((m) => nodeById(s, m.toId).challenge);
  if (secret.length && rand() < 0.7) return { type: 'move', armyId: army.id, toId: pick(secret).toId };
  const col = (id: string) => nodeById(s, id).col ?? 0;
  const ahead = moves.filter((m) => col(m.toId) > (node.col ?? 0));
  return { type: 'move', armyId: army.id, toId: pick(ahead.length && rand() < 0.85 ? ahead : moves).toId };
}

/**
 * A save further on, for every third run: the crew's branch of the skill tree learnt (Deep holds, Mess hall, Spare
 * parts, Flagship's pride) with Study, a part fitted, and two companions found (aboard the Captain's runs).
 */
const crewMeta = (): MetaState => ({
  ...emptyMeta(),
  upgrades: { holds: 2, mess: 2, spares: 1, pride: 1, study: 3 },
  hangar: ['scrap_plating'],
  fitted: { armour: 'scrap_plating' },
  companions: { lancer: { ...plainAscent(), xp: 30 }, engineer: { ...plainAscent(), xp: 0 } },
});

const out: { setup: CampaignSetup; start: CampaignState; steps: { action: CampaignAction; state: CampaignState }[]; jump?: number }[] = [];
let total = 0;
for (let i = 0; i < runs; i++) {
  const meta = i % 3 === 2 ? crewMeta() : emptyMeta();
  const setup: CampaignSetup = i % 2 ? { seed: 500 + i * 131, captain: CAPTAIN, run: runBonuses(meta) } : { seed: 500 + i * 131, race: i % 8, run: runBonuses(meta) };
  const rng = { rngState: setup.seed * 3 + 1 };
  const rand = () => nextRandom(rng);
  let s = createCampaign(setup);
  // (Half the runs start further in, where secrets, rifts and the rest turn up: replayed from this start, not built.)
  const jump = i % 2 === 0 && i > 0 ? 2 + (i % 4) : 0;
  if (jump) {
    s = structuredClone(s);
    while (s.story.queue.length) s.story.queue.shift();
    s.cardRewards = [];
    buildUniverse(s, jump);
  }
  // (Some runs find a secret beside where they start, so each kind is played: both rifts, the mine, the Frost Line, a
  // Lost Lord.)
  const plant = [null, 'rift:dark', 'rift:time', 'mine', 'frost', 'lord'][i % 6];
  if (plant) {
    if (!jump) s = structuredClone(s);
    const home = s.nodes.find((n) => n.home === s.playerId)!;
    const [kind, rift] = plant.split(':') as ['rift' | 'mine' | 'frost' | 'lord', 'dark' | 'time' | undefined];
    const id = `n${s.nodes.length}`;
    s.nodes.push({ id, name: 'Planted', x: home.x, y: home.y - 200, planets: [], owner: null, links: [home.id], fortification: 0, damage: 0, garrison: [], hazard: [], yield: { materials: 0 }, tier: home.tier, col: home.col, lane: home.lane, challenge: { kind, hidden: false, from: home.id, ...(kind === 'lord' ? { lord: 'lord_orrim' } : {}), ...(rift ? { rift } : {}) } });
    home.links.push(id);
  }
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
  out.push({ setup, start, steps, ...(jump || plant ? { jump: jump || 1 } : {}) });
  total += JSON.stringify(steps).length;
  console.log(`run ${i}: ${setup.captain ? 'captain' : `race ${setup.race}`}, ${steps.length} steps, turn ${s.turn}, universe ${s.universe}, winner ${s.winner}`);
}
mkdirSync('engine-cs/traces', { recursive: true });
writeFileSync('engine-cs/traces/runs.json', JSON.stringify(out));
console.log(`${(total / 1e6).toFixed(1)} MB`);
