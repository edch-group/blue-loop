/**
 * The procedural 3D models (ship3d.ts, captain-model.ts, companion-models.ts, nebula-geometry.ts) as
 * the TypeScript builds them, for the C# port (unity/Assets/Scripts/Models) to build the same (engine-cs/Tests).
 * Each mesh kept small: its vertex count, each component's sum and sum of squares, its first and last 3 vertices and
 * every 997th. Written to engine-cs/traces/models.json (not kept in git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { propModel3d, shipModel3d, SHIP_STRIDE } from '../src/ui/ship3d';
import { captainModel, streamerModel } from '../src/ui/captain-model';
import { companionModel } from '../src/ui/companion-models';
import { buildNebula, GROUND_STRIDE, type Strip } from '../src/ui/nebula-geometry';
import { COMPANION_IDS } from '../src/engine/companions';

/** A mesh's summary (see above). */
function summary(a: Float32Array, stride: number) {
  const n = a.length / stride;
  const sum = new Array(stride).fill(0), sq = new Array(stride).fill(0);
  for (let i = 0; i < a.length; i++) {
    sum[i % stride] += a[i];
    sq[i % stride] += a[i] * a[i];
  }
  const at = new Set<number>();
  for (let i = 0; i < Math.min(3, n); i++) at.add(i);
  for (let i = Math.max(0, n - 3); i < n; i++) at.add(i);
  for (let i = 0; i < n; i += 997) at.add(i);
  const samples = [...at].sort((x, y) => x - y).map((i) => [i, ...a.slice(i * stride, (i + 1) * stride)]);
  return { n, stride, sum, sq, samples };
}

const out: Record<string, unknown> = {};
const ships: Record<string, unknown> = {};
for (let race = -1; race <= 8; race++) {
  const s = shipModel3d(race);
  ships[race] = { mesh: summary(s.mesh, SHIP_STRIDE), engines: s.engines, glow: s.glow, suns: s.suns };
}
out.ships = ships;
out.props = { station: summary(propModel3d('station'), SHIP_STRIDE), lab: summary(propModel3d('lab'), SHIP_STRIDE) };
out.captain = summary(captainModel(), SHIP_STRIDE);
out.streamer = summary(streamerModel(), SHIP_STRIDE);
out.companions = Object.fromEntries(COMPANION_IDS.map((id) => [id, summary(companionModel(id), SHIP_STRIDE)]));

// (The Captain's ship is no longer recorded: Unity's is a made model, checked for itself in engine-cs/Tests/ModelChecks.cs.)

// The campaign menu's land (campaign.ts MENU_LAND), a bare one, and a run's (its systems placed, their columns and lifts).
const line: [number, number][] = Array.from({ length: 13 }, (_, i) => [-6 + i, 0]);
const menu: Strip = { nodes: line, routes: line.slice(1).map((q, i) => [line[i][0], line[i][1], q[0], q[1]] as [number, number, number, number]) };
const run: Strip = {
  nodes: [
    [-2.2, 0.1, 0, 0],
    [-1.4, -0.4, 1, 0.05],
    [-1.3, 0.5, 1, -0.04],
    [-0.5, 0, 2, 0.1],
    [0.4, -0.5, 3, 0],
    [0.5, 0.45, 3, 0.12],
    [1.3, 0.05, 4, -0.06],
    [2.2, -0.2, 5, 0],
  ],
  routes: [[-2.2, 0.1, -1.4, -0.4], [-2.2, 0.1, -1.3, 0.5], [-1.4, -0.4, -0.5, 0], [-1.3, 0.5, -0.5, 0], [-0.5, 0, 0.4, -0.5], [-0.5, 0, 0.5, 0.45], [0.4, -0.5, 1.3, 0.05], [0.5, 0.45, 1.3, 0.05], [1.3, 0.05, 2.2, -0.2]],
};
const flat: Strip = { nodes: [[-2, 0], [0, 0.3], [2, -0.1]], routes: [] };
out.nebulas = [
  { seed: 77017, strip: menu },
  { seed: 1, strip: { nodes: [], routes: [] } },
  { seed: 912345, strip: run },
  { seed: 4242, strip: flat },
].map(({ seed, strip }) => {
  const g = buildNebula(seed, strip);
  return { seed, strip, ground: summary(g.ground, GROUND_STRIDE), stars: summary(g.stars, 6) };
});

mkdirSync('engine-cs/traces', { recursive: true });
writeFileSync('engine-cs/traces/models.json', JSON.stringify(out));
console.log(`models recorded: ${Object.keys(ships).length} ships, 2 props, the Captain, ${COMPANION_IDS.length} companions, ${(out.nebulas as unknown[]).length} nebulas`);
