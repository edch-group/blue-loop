import { describe, expect, it } from 'vitest';
import {
  applyCampaignAction,
  attackOptions,
  CAMPAIGN,
  campaignPlayer,
  createCampaign,
  garrisonBonus,
  GameError,
  nodeById,
  ownedNodes,
  type CampaignState,
} from '../src/engine';

const fresh = (seed = 7) => createCampaign({ seed, rivals: 3 });
const home = (s: CampaignState) => ownedNodes(s, s.playerId)[0];

/** Auto-resolve the current battle (and anything AI turns trigger) until the player is free to act. */
function settle(s: CampaignState, choice: 'settle' | 'absorb' | 'supernova' = 'settle'): CampaignState {
  for (let guard = 0; guard < 50; guard++) {
    if (s.winner) return s;
    if (s.battle) s = applyCampaignAction(s, { type: 'finishBattle', game: s.battle.game, auto: true });
    else if (s.conquest) s = applyCampaignAction(s, { type: 'conquer', choice });
    else if (s.cardRewards.length) s = applyCampaignAction(s, { type: 'chooseCard', defId: s.cardRewards[0].options[0] });
    else return s;
  }
  throw new Error('campaign stuck');
}

describe('campaign setup', () => {
  it('builds a connected 48-system map with four factions in the corners', () => {
    const s = fresh();
    expect(s.nodes).toHaveLength(CAMPAIGN.mapCols * CAMPAIGN.mapRows);
    expect(s.factions).toHaveLength(4);
    for (const f of s.factions) expect(ownedNodes(s, f.id)).toHaveLength(1);
    // Links are symmetric.
    for (const n of s.nodes) for (const l of n.links) expect(nodeById(s, l).links).toContain(n.id);
    expect(campaignPlayer(s).deck).toHaveLength(CAMPAIGN.deckSize);
    expect(campaignPlayer(s).missions).toHaveLength(CAMPAIGN.activeMissions);
  });

  it('is deterministic for a seed', () => {
    expect(fresh(3)).toEqual(fresh(3));
    expect(fresh(3)).not.toEqual(fresh(4));
  });

  it('only allows attacks on systems next to your own', () => {
    const s = fresh();
    const opts = attackOptions(s, s.playerId);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(nodeById(s, o.toId).links).toContain(home(s).id);
    const far = s.nodes.find((n) => !n.links.includes(home(s).id) && n.id !== home(s).id)!;
    expect(() => applyCampaignAction(s, { type: 'attack', fromId: home(s).id, toId: far.id })).toThrow(GameError);
  });
});

describe('battles and conquest', () => {
  it('starts a battle with the player attacking from their system, one attack per turn', () => {
    let s = fresh();
    const target = attackOptions(s, s.playerId)[0].toId;
    s = applyCampaignAction(s, { type: 'attack', fromId: home(s).id, toId: target });
    expect(s.battle?.nodeId).toBe(target);
    expect(s.battle?.game.players[0].isAI).toBe(false);
    expect(s.battle!.game.players[0].deck.length + s.battle!.game.players[0].hand.length).toBe(10);
    s = settle(s);
    const again = attackOptions(s, s.playerId)[0];
    if (again && !s.winner && s.turn === 1) {
      expect(() => applyCampaignAction(s, { type: 'attack', fromId: again.fromIds[0], toId: again.toId })).toThrow(GameError);
    }
  });

  it('settle takes the system; garrison cards pass to the victor', () => {
    let s = fresh();
    const target = nodeById(s, attackOptions(s, s.playerId)[0].toId);
    target.garrison.push({ uid: 'x', defId: 'coronal_lance', status: 'stationed' });
    s = applyCampaignAction(s, { type: 'attack', fromId: home(s).id, toId: target.id });
    // Force a win by handing back a finished game with the attacker victorious.
    const game = structuredClone(s.battle!.game);
    game.winnerId = game.players[0].id;
    s = applyCampaignAction(s, { type: 'finishBattle', game });
    expect(s.conquest?.nodeId).toBe(target.id);
    s = applyCampaignAction(s, { type: 'conquer', choice: 'settle' });
    expect(nodeById(s, target.id).owner).toBe(s.playerId);
    expect(campaignPlayer(s).reserve).toContain('coronal_lance');
  });

  it('absorb pays out and leaves the system neutral; supernova blocks rivals for a turn', () => {
    const win = (s: CampaignState, choice: 'absorb' | 'supernova') => {
      const target = attackOptions(s, s.playerId)[0].toId;
      s = applyCampaignAction(s, { type: 'attack', fromId: home(s).id, toId: target });
      const game = structuredClone(s.battle!.game);
      game.winnerId = game.players[0].id;
      s = applyCampaignAction(s, { type: 'finishBattle', game });
      return { s: applyCampaignAction(s, { type: 'conquer', choice }), target };
    };
    const a = win(fresh(), 'absorb');
    expect(nodeById(a.s, a.target).owner).toBeNull();
    expect(campaignPlayer(a.s).credits).toBeGreaterThan(CAMPAIGN.startCredits + CAMPAIGN.winCredits);

    const n = win(fresh(), 'supernova');
    const node = nodeById(n.s, n.target);
    expect(node.owner).toBeNull();
    expect(node.hazard).toHaveLength(3);
    expect(node.hazard).not.toContain(n.s.playerId);
  });
});

describe('garrisons', () => {
  it('cards take a turn to arrive and a turn to return, and cannot be redirected mid-move', () => {
    let s = fresh();
    s.factions[0].reserve.push('stellar_credits');
    const h = home(s).id;
    s = applyCampaignAction(s, { type: 'station', nodeId: h, from: 'reserve', index: 0 });
    const g = nodeById(s, h).garrison[0];
    expect(g.status).toBe('arriving');
    expect(garrisonBonus(nodeById(s, h)).opening.money).toBe(0);
    expect(() => applyCampaignAction(s, { type: 'recall', nodeId: h, uid: g.uid })).toThrow(GameError);
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    if (nodeById(s, h).owner !== s.playerId) return; // lost the home system to an AI attack: nothing more to check
    expect(nodeById(s, h).garrison[0].status).toBe('stationed');
    expect(garrisonBonus(nodeById(s, h)).opening.money).toBe(2);
    s = applyCampaignAction(s, { type: 'recall', nodeId: h, uid: g.uid });
    expect(nodeById(s, h).garrison[0].status).toBe('leaving');
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    if (nodeById(s, h).owner !== s.playerId) return;
    expect(nodeById(s, h).garrison).toHaveLength(0);
    expect(campaignPlayer(s).reserve).toContain('stellar_credits');
  });

  it('turns each stationed card into a head start for the defender', () => {
    const s = fresh();
    const n = home(s);
    n.garrison = [
      { uid: 'a', defId: 'coronal_lance', status: 'stationed' },
      { uid: 'b', defId: 'cryo_vault', status: 'stationed' },
      { uid: 'c', defId: 'deflector_grid', status: 'leaving' },
    ];
    const b = garrisonBonus(n);
    expect(b.bombard).toBe(2);
    expect(b.chill).toBe(2);
    expect(b.opening.shields).toBe(0); // leaving cards no longer defend
  });

  it('Stardust cannot garrison; the deck always holds 10 cards', () => {
    let s = fresh();
    expect(() => applyCampaignAction(s, { type: 'station', nodeId: home(s).id, from: 'deck', index: 0 })).toThrow(GameError);
    const slot = campaignPlayer(s).deck.indexOf('command_directive');
    s = applyCampaignAction(s, { type: 'station', nodeId: home(s).id, from: 'deck', index: slot });
    expect(campaignPlayer(s).deck).toHaveLength(10);
    expect(campaignPlayer(s).deck[slot]).toBe('stardust');
  });
});

describe('economy', () => {
  it('upgrades cards with materials and planets with credits', () => {
    let s = fresh();
    s = applyCampaignAction(s, { type: 'upgradeCard', from: 'deck', index: 0 });
    expect(campaignPlayer(s).deck[0]).toBe('stellar_credits');
    expect(campaignPlayer(s).materials).toBe(CAMPAIGN.startMaterials - 2);
    const h = home(s);
    const planet = h.boosts.findIndex((_, j) => j >= 0);
    s = applyCampaignAction(s, { type: 'upgradePlanet', nodeId: h.id, planet });
    expect(home(s).boosts[planet]).toBe(1);
    expect(campaignPlayer(s).credits).toBe(CAMPAIGN.startCredits - CAMPAIGN.upgradeBaseCost);
  });
});

describe('a full campaign', () => {
  it('always reaches an end with an aggressive auto-playing commander', () => {
    for (const seed of [1, 2, 3]) {
      let s = createCampaign({ seed, rivals: 3 });
      for (let turn = 0; turn < 200 && !s.winner; turn++) {
        const opt = attackOptions(s, s.playerId)[0];
        if (opt) s = settle(applyCampaignAction(s, { type: 'attack', fromId: opt.fromIds[0], toId: opt.toId }));
        if (!s.winner) s = settle(applyCampaignAction(s, { type: 'endTurn' }));
      }
      expect(s.winner).not.toBeNull();
    }
  }, 60000);
});

describe('anomalies', () => {
  it('are scattered between systems and change battles fought from the systems they reach', async () => {
    const { ANOMALIES, nodeAnomalies } = await import('../src/engine');
    for (const seed of [1, 2, 3, 4]) {
      const s = fresh(seed);
      expect(s.anomalies!.length).toBe(CAMPAIGN.anomalies);
      expect(new Set(s.anomalies!.map((a) => a.kind)).size).toBe(4);
      // Every anomaly reaches at least one system; no home system starts inside one.
      for (const a of s.anomalies!) expect(s.nodes.some((n) => nodeAnomalies(s, n).includes(a))).toBe(true);
      for (const n of s.nodes.filter((x) => x.home)) expect(nodeAnomalies(s, n)).toHaveLength(0);
    }
    // A battle fought from inside a nebula gets its shield bonus.
    let s = fresh(2);
    const target = s.nodes.find((n) => nodeAnomalies(s, n).some((a) => a.kind === 'nebula'))!;
    const home = ownedNodes(s, s.playerId)[0];
    target.links.push(home.id);
    home.links.push(target.id);
    s = applyCampaignAction(s, { type: 'attack', fromId: home.id, toId: target.id });
    const defender = s.battle!.game.players[1];
    expect(defender.extraModifiers?.shieldBonus).toBeGreaterThanOrEqual(ANOMALIES.nebula.modifiers.shieldBonus!);
    expect(defender.conditions?.map((c) => c.name)).toContain('Nebula');
  });
});
