import { describe, expect, it } from 'vitest';
import {
  applyCampaignAction,
  attackOptions,
  CAMPAIGN,
  campaignPlayer,
  createCampaign,
  deckProblems,
  garrisonBonus,
  GameError,
  armoryPrice,
  cardDef,
  fusedId,
  fusionCost,
  fusionProblem,
  nodeById,
  visibleNodes,
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
    expect(s.nodes).toHaveLength(CAMPAIGN.mapSystems);
    // Every system is reachable from every other.
    const seen = new Set([s.nodes[0].id]);
    const queue = [s.nodes[0].id];
    while (queue.length) for (const l of nodeById(s, queue.shift()!).links) if (!seen.has(l)) { seen.add(l); queue.push(l); }
    expect(seen.size).toBe(s.nodes.length);
    expect(s.factions).toHaveLength(4);
    for (const f of s.factions) expect(ownedNodes(s, f.id)).toHaveLength(1);
    // Links are symmetric.
    for (const n of s.nodes) for (const l of n.links) expect(nodeById(s, l).links).toContain(n.id);
    for (const f of s.factions) expect(deckProblems(f.deck)).toEqual([]);
    expect(new Set(s.factions.map((f) => f.race)).size).toBe(4);
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
    expect(s.battle!.game.players[0].deck.length + s.battle!.game.players[0].hand.length).toBe(30);
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
    s.factions[0].reserve.push('bell_warden');
    const h = home(s).id;
    s = applyCampaignAction(s, { type: 'station', nodeId: h, index: 0 });
    const g = nodeById(s, h).garrison[0];
    expect(g.status).toBe('arriving');
    expect(garrisonBonus(nodeById(s, h)).tableau).toEqual([]);
    expect(() => applyCampaignAction(s, { type: 'recall', nodeId: h, uid: g.uid })).toThrow(GameError);
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    if (nodeById(s, h).owner !== s.playerId) return; // lost the home system to an AI attack: nothing more to check
    expect(nodeById(s, h).garrison[0].status).toBe('stationed');
    expect(garrisonBonus(nodeById(s, h)).tableau).toEqual(['bell_warden']);
    s = applyCampaignAction(s, { type: 'recall', nodeId: h, uid: g.uid });
    expect(nodeById(s, h).garrison[0].status).toBe('leaving');
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    if (nodeById(s, h).owner !== s.playerId) return;
    expect(nodeById(s, h).garrison).toHaveLength(0);
    expect(campaignPlayer(s).reserve).toContain('bell_warden');
  });

  it('puts stationed cards, Command cards included, in the defender\'s tableau', () => {
    let s = fresh();
    const n = home(s);
    n.garrison = [
      { uid: 'a', defId: 'plasma_relay', status: 'stationed' },
      { uid: 'b', defId: 'chamber_protocol', status: 'stationed' },
      { uid: 'c', defId: 'deflector_grid', status: 'leaving' },
    ];
    const b = garrisonBonus(n);
    expect(b.tableau).toEqual(['plasma_relay', 'chamber_protocol']); // leaving cards no longer defend
    // Attack a garrisoned system: its defender starts with the garrison in play.
    const target = nodeById(s, attackOptions(s, s.playerId)[0].toId);
    target.garrison = n.garrison;
    n.garrison = [];
    s = applyCampaignAction(s, { type: 'attack', fromId: n.id, toId: target.id });
    const defender = s.battle!.game.players[1];
    expect(defender.tableau.map((c) => c.defId).sort()).toEqual(['chamber_protocol', 'plasma_relay']);
  });

  it('only garrisons reserve cards, and keeps the deck legal when swapping', () => {
    let s = fresh();
    const f = campaignPlayer(s);
    f.reserve.push('ice_age', 'helio_lancer', 'command_directive');
    expect(() => applyCampaignAction(s, { type: 'station', nodeId: home(s).id, index: 0 })).toThrow(/garrison/);
    // Swapping a Command card out for a normal card would leave the deck one Command short.
    const cmd = f.deck.indexOf('command_directive');
    expect(() => applyCampaignAction(s, { type: 'deckSwap', slot: cmd, reserveIndex: 1 })).toThrow(/Heroes/);
    s = applyCampaignAction(s, { type: 'deckSwap', slot: 0, reserveIndex: 1 });
    expect(campaignPlayer(s).deck[0]).toBe('helio_lancer');
    expect(campaignPlayer(s).reserve).toContain(f.deck[0]);
    expect(deckProblems(campaignPlayer(s).deck)).toEqual([]);
  });
});

describe('economy', () => {
  it('buys cards with materials and fortifies systems with credits', () => {
    let s = fresh();
    const id = s.armory[0];
    const price = armoryPrice(id);
    s.factions[0].materials = 10;
    s = applyCampaignAction(s, { type: 'buyCard', slot: 0 });
    expect(campaignPlayer(s).reserve).toContain(id);
    expect(campaignPlayer(s).materials).toBe(10 - price);
    s = applyCampaignAction(s, { type: 'fortify', nodeId: home(s).id });
    expect(home(s).fortification).toBe(1);
    expect(campaignPlayer(s).credits).toBe(CAMPAIGN.startCredits - CAMPAIGN.fortifyBaseCost);
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
  }, 240000);
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
    // A battle fought for a system inside a nebula gives its defender the nebula's shields.
    let s = fresh(2);
    const target = s.nodes.find((n) => nodeAnomalies(s, n).some((a) => a.kind === 'nebula'))!;
    const home = ownedNodes(s, s.playerId)[0];
    target.links.push(home.id);
    home.links.push(target.id);
    s = applyCampaignAction(s, { type: 'attack', fromId: home.id, toId: target.id });
    const defender = s.battle!.game.players[1];
    expect(defender.modifiers?.shieldPerTurn).toBeGreaterThanOrEqual(ANOMALIES.nebula.modifiers.shieldPerTurn!);
    expect(defender.conditions?.map((c) => c.name)).toContain('Nebula');
  });
});

describe('the armory', () => {
  it('restocks when the player conquers a system', () => {
    let s = fresh();
    const target = attackOptions(s, s.playerId)[0].toId;
    s = applyCampaignAction(s, { type: 'attack', fromId: home(s).id, toId: target });
    const before = [...s.armory];
    const game = structuredClone(s.battle!.game);
    game.winnerId = game.players[0].id;
    s = applyCampaignAction(s, { type: 'finishBattle', game });
    s = applyCampaignAction(s, { type: 'conquer', choice: 'settle' });
    expect(s.armory).toHaveLength(CAMPAIGN.armorySize);
    expect(s.armory).not.toEqual(before); // a fresh draw (the same three again is vanishingly unlikely)
  });

  it('fuses two reserve cards into one that does both, for materials, for good', () => {
    const s = fresh();
    const me = campaignPlayer(s);
    me.reserve = ['coronal_lance', 'cryo_vault', 'command_directive'];
    me.materials = 50;
    const next = applyCampaignAction(s, { type: 'fuse', a: 0, b: 1 });
    const p = campaignPlayer(next);
    const id = fusedId('coronal_lance', 'cryo_vault');
    expect(p.reserve).toEqual(['command_directive', id]);
    expect(p.materials).toBe(50 - fusionCost('coronal_lance', 'cryo_vault'));
    const def = cardDef(id);
    expect(def.name).toBe('Coronal Vault');
    expect(def.text).toBe(`${cardDef('coronal_lance').text} ${cardDef('cryo_vault').text}`);
    expect(def.onPlay?.length).toBe((cardDef('coronal_lance').onPlay?.length ?? 0) + (cardDef('cryo_vault').onPlay?.length ?? 0));
    // No undoing, no fusing again, no Command cards, and no two cards asking for the same choice.
    expect(() => applyCampaignAction(next, { type: 'fuse', a: 0, b: 1 })).toThrow(GameError);
    expect(fusionProblem(id, 'coronal_lance')).toMatch(/again/);
    expect(fusionProblem('ion_cannon', 'tractor_beam')).toMatch(/same kind of choice/);
  });

  it('plays a fused card in battle like any other', () => {
    let s = fresh();
    const me = campaignPlayer(s);
    me.deck[0] = fusedId('coronal_lance', 'cryo_vault');
    const target = attackOptions(s, s.playerId)[0].toId;
    s = applyCampaignAction(s, { type: 'attack', fromId: home(s).id, toId: target });
    s = settle(s);
    expect(s.battle).toBeNull();
  });
});

describe('fog of war', () => {
  it('shows only your systems and those linked to them, two links out from a scanner', () => {
    const s = fresh();
    const h = home(s);
    for (const n of s.nodes) n.scanner = false;
    const seen = visibleNodes(s, s.playerId);
    expect([...seen].sort()).toEqual([h.id, ...h.links].sort());
    h.scanner = true;
    const wide = visibleNodes(s, s.playerId);
    const twoOut = h.links.flatMap((id) => nodeById(s, id).links);
    for (const id of twoOut) expect(wide.has(id)).toBe(true);
    expect(wide.size).toBeLessThan(s.nodes.length);
  });

  it('places scanners on some systems, never a home', () => {
    const s = fresh();
    const scanners = s.nodes.filter((n) => n.scanner);
    expect(scanners.length).toBeGreaterThan(0);
    expect(scanners.every((n) => !n.home)).toBe(true);
  });
});
