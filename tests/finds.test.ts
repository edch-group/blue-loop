import { describe, expect, it } from 'vitest';
import { applyCampaignAction, armiesOf, createCampaign, factionById } from '../src/engine/campaign';
import { CAPTAIN } from '../src/engine/captain';
import { emptyMeta, runBonuses } from '../src/engine/meta';

describe('finds', () => {
  it('shows a relic found in a system as spoils to open, as a battle\'s are', () => {
    const s = createCampaign({ seed: 3, captain: CAPTAIN, run: runBonuses(emptyMeta()) });
    s.crystal = false;
    s.story.queue = [];
    const a = armiesOf(s, s.playerId)[0];
    const here = s.nodes.find((n) => n.id === a.nodeId)!;
    const to = here.links.map((id) => s.nodes.find((n) => n.id === id)!).find((n) => !n.station && !n.owner && !n.challenge)!;
    for (const n of s.nodes) delete n.cache;
    to.garrison = [];
    to.cache = { kind: 'relic', amount: 1 };
    const t = applyCampaignAction(s, { type: 'move', armyId: a.id, toId: to.id });
    const relics = factionById(t, t.playerId).relics ?? [];
    expect(relics.length).toBe(1);
    expect(t.loot?.found).toBe(to.name);
    expect(t.loot?.relics).toEqual([relics[0]]);
    expect(applyCampaignAction(t, { type: 'dismissLoot' }).loot).toBeUndefined();
  });
});
