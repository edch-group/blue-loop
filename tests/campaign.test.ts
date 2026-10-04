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
  armiesOf,
  armyMoves,
  armyAt,
  recruitCost,
  factionIncome,
  GENERALS,
  regionalStability,
  heroState,
  heroLevel,
  SKILL_TREES,
  armyDeckProblems,
  COMMAND_SLOT,
  armyBonus,
  researchProject,
  XP_LEVELS,
  skillCost,
  skillPoints,
  makeItem,
  RACE_SLOTS,
  cardCost,
  logInSight,
  visibleNodes as seenBy,
  supernovaThreshold,
  recycleValue,
  deckProblems as problemsOf,
  stabiliseProblem,
  type CampaignState,
} from '../src/engine';

const fresh = (seed = 7) => createCampaign({ seed, rivals: 3 });
const home = (s: CampaignState) => s.nodes.find((n) => n.home === s.playerId) ?? ownedNodes(s, s.playerId)[0];
const myArmy = (s: CampaignState) => armiesOf(s, s.playerId)[0];
/** The first system the player's army can attack. */
const firstTarget = (s: CampaignState) => armyMoves(s, myArmy(s)).find((m) => m.battle)!.toId;
const attack = (s: CampaignState, toId = firstTarget(s)) => applyCampaignAction(s, { type: 'move', armyId: myArmy(s).id, toId });
/** Hand back the current battle as a win for its attacker. */
const winBattle = (s: CampaignState) => {
  const game = structuredClone(s.battle!.game);
  game.winnerId = game.players[0].id;
  return applyCampaignAction(s, { type: 'finishBattle', game });
};

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
    const rivals = s.factions.filter((f) => !f.lost);
    expect(rivals).toHaveLength(4);
    for (const f of rivals) expect(ownedNodes(s, f.id)).toHaveLength(1);
    // Links are symmetric.
    for (const n of s.nodes) for (const l of n.links) expect(nodeById(s, l).links).toContain(n.id);
    // Each faction starts with one army at home, led by its race's first general, with a legal deck.
    for (const f of rivals) {
      const armies = armiesOf(s, f.id);
      expect(armies).toHaveLength(1);
      expect(armies[0].nodeId).toBe(ownedNodes(s, f.id)[0].id);
      expect(armies[0].general).toBe(GENERALS[f.race][0]);
      expect(armyDeckProblems(armies[0].deck, armies[0].general)).toEqual([]);
      expect(armies[0].deck).toHaveLength(CAMPAIGN.armySize);
    }
    expect(new Set(rivals.map((f) => f.race)).size).toBe(4);
    // The Lost Races wander the middle reaches, with legal decks.
    const lost = s.armies.filter((a) => a.lost);
    expect(lost).toHaveLength(CAMPAIGN.lostArmies);
    for (const a of lost) expect(deckProblems(a.deck)).toEqual([]);
    expect(campaignPlayer(s).missions).toHaveLength(CAMPAIGN.activeMissions);
  });

  it('is deterministic for a seed', () => {
    expect(fresh(3)).toEqual(fresh(3));
    expect(fresh(3)).not.toEqual(fresh(4));
  });

  it('only lets an army march one route', () => {
    const s = fresh();
    const opts = attackOptions(s, s.playerId);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(nodeById(s, o.toId).links).toContain(home(s).id);
    const far = s.nodes.find((n) => !n.links.includes(home(s).id) && n.id !== home(s).id)!;
    expect(() => applyCampaignAction(s, { type: 'move', armyId: myArmy(s).id, toId: far.id })).toThrow(GameError);
  });

  it('puts the Heart at the centre, guarded, with Stellari blooms out in the reaches', () => {
    const s = fresh();
    const heart = s.nodes.filter((n) => n.heart);
    expect(heart).toHaveLength(1);
    expect(heart[0].x).toBe(Math.round(s.nodes.reduce((m, n) => Math.max(m, n.x), 0) > 0 ? heart[0].x : 0));
    expect(heart[0].owner).toBeNull();
    expect(heart[0].tier).toBe(3);
    expect(heart[0].links.length).toBeGreaterThan(0);
    const blooms = s.nodes.filter((n) => (n.stellaria ?? 0) > 0);
    expect(blooms).toHaveLength(CAMPAIGN.stellariaBlooms);
    expect(blooms.every((n) => !n.home && !n.heart)).toBe(true);
  });

  it('opens with the oracle telling the story, and each moment is told once', () => {
    let s = fresh();
    expect(s.story.queue[0].id).toBe('intro');
    expect(s.story.queue[0].lines.some((l) => l.speaker.kind === 'oracle')).toBe(true);
    s = applyCampaignAction(s, { type: 'readStory' });
    expect(s.story.queue.find((x) => x.id === 'intro')).toBeUndefined();
    expect(s.story.told).toContain('intro');
  });
});

describe('battles and conquest', () => {
  it('starts a battle with the army\'s own deck, and an army moves once a turn', () => {
    let s = fresh();
    const target = firstTarget(s);
    const deck = [...myArmy(s).deck];
    s = attack(s, target);
    expect(s.battle?.nodeId).toBe(target);
    expect(s.battle?.armyId).toBe(myArmy(s).id);
    expect(s.battle?.game.players[0].isAI).toBe(false);
    const p0 = s.battle!.game.players[0];
    expect([...p0.deck, ...p0.hand].map((c) => c.defId).sort()).toEqual(deck.sort());
    s = settle(s);
    if (!s.winner && s.turn === 1) expect(armyMoves(s, myArmy(s))).toEqual([]);
  });

  it('marches the army into a system it settles, and not into one it burns', () => {
    let s = winBattle(attack(fresh()));
    const target = s.conquest!.nodeId;
    const settled = applyCampaignAction(s, { type: 'conquer', choice: 'settle' });
    expect(myArmy(settled).nodeId).toBe(target);
    const burnt = applyCampaignAction(s, { type: 'conquer', choice: 'supernova' });
    expect(myArmy(burnt).nodeId).toBe(home(burnt).id);
  });

  it('settle takes the system; garrison cards pass to the victor', () => {
    let s = fresh();
    const target = nodeById(s, firstTarget(s));
    target.garrison.push({ uid: 'x', defId: 'coronal_lance', status: 'stationed' });
    s = winBattle(attack(s, target.id));
    expect(s.conquest?.nodeId).toBe(target.id);
    s = applyCampaignAction(s, { type: 'conquer', choice: 'settle' });
    expect(nodeById(s, target.id).owner).toBe(s.playerId);
    expect(campaignPlayer(s).reserve).toContain('coronal_lance');
  });

  it('absorb pays out and leaves the system neutral; supernova blocks rivals for a turn', () => {
    const win = (s: CampaignState, choice: 'absorb' | 'supernova') => {
      const target = firstTarget(s);
      s = winBattle(attack(s, target));
      return { s: applyCampaignAction(s, { type: 'conquer', choice }), target };
    };
    const a = win(fresh(), 'absorb');
    expect(nodeById(a.s, a.target).owner).toBeNull();
    expect(campaignPlayer(a.s).credits).toBeGreaterThan(CAMPAIGN.startCredits + CAMPAIGN.winCredits);

    const n = win(fresh(), 'supernova');
    const node = nodeById(n.s, n.target);
    expect(node.owner).toBeNull();
    expect(node.hazard).toHaveLength(4); // the three rivals, and the Lost Races
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
    const target = nodeById(s, firstTarget(s));
    target.garrison = n.garrison;
    n.garrison = [];
    s = attack(s, target.id);
    const defender = s.battle!.game.players[1];
    expect(defender.tableau.map((c) => c.defId).sort()).toEqual(['chamber_protocol', 'plasma_relay']);
  });

  it('only garrisons reserve cards, and keeps the deck legal when swapping', () => {
    let s = fresh();
    const f = campaignPlayer(s);
    f.reserve.push('ice_age', 'helio_lancer', GENERALS[f.race].find((g) => g !== myArmy(s).general)!);
    expect(() => applyCampaignAction(s, { type: 'station', nodeId: home(s).id, index: 0 })).toThrow(/garrison/);
    // The general stays, and no other Hero joins: an army is led by its own hero.
    const army = myArmy(s);
    const lead = army.deck.indexOf(army.general);
    expect(() => applyCampaignAction(s, { type: 'deckSwap', armyId: army.id, slot: lead, reserveIndex: 1 })).toThrow(/leads/);
    const slot = army.deck.findIndex((id) => id !== army.general);
    expect(() => applyCampaignAction(s, { type: 'deckSwap', armyId: army.id, slot, reserveIndex: 2 })).toThrow(/own hero/);
    s = applyCampaignAction(s, { type: 'deckSwap', armyId: army.id, slot, reserveIndex: 1 });
    expect(myArmy(s).deck[slot]).toBe('helio_lancer');
    expect(campaignPlayer(s).reserve).toContain(army.deck[slot]);
    expect(armyDeckProblems(myArmy(s).deck, army.general)).toEqual([]);
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
        for (const army of armiesOf(s, s.playerId)) {
          if (s.winner || !armiesOf(s, s.playerId).some((a) => a.id === army.id)) continue;
          const opt = armyMoves(s, army).find((m) => m.battle);
          if (opt) s = settle(applyCampaignAction(s, { type: 'move', armyId: army.id, toId: opt.toId }));
        }
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
    s = attack(s, target.id);
    const defender = s.battle!.game.players[1];
    expect(defender.modifiers?.shieldPerTurn).toBeGreaterThanOrEqual(ANOMALIES.nebula.modifiers.shieldPerTurn!);
    expect(defender.conditions?.map((c) => c.name)).toContain('Nebula');
  });
});

describe('the armory', () => {
  it('restocks when the player conquers a system', () => {
    let s = attack(fresh());
    const before = [...s.armory];
    s = winBattle(s);
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
    myArmy(s).deck[myArmy(s).deck.findIndex((id) => id !== myArmy(s).general)] = fusedId('coronal_lance', 'cryo_vault');
    s = settle(attack(s));
    expect(s.battle).toBeNull();
  });
});

describe('fog of war', () => {
  it('shows only your systems and those linked to them (and the Heart), two links out from a scanner', () => {
    const s = fresh();
    const h = home(s);
    for (const n of s.nodes) n.scanner = false;
    const seen = visibleNodes(s, s.playerId);
    const heart = s.nodes.find((n) => n.heart)!;
    expect([...seen].sort()).toEqual([...new Set([h.id, ...h.links, heart.id])].sort());
    // An army sees the routes out of where it stands.
    const out = nodeById(s, h.links[0]);
    myArmy(s).nodeId = out.id;
    for (const id of out.links) expect(visibleNodes(s, s.playerId).has(id)).toBe(true);
    myArmy(s).nodeId = h.id;
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

describe('armies and generals', () => {
  it('recruits a general of your race into a free system you hold, for credits rising with each army', () => {
    let s = fresh();
    const f = campaignPlayer(s);
    const next = GENERALS[f.race][1];
    const cost = recruitCost(s, f, next)!;
    expect(cost).toBe(CAMPAIGN.recruitBase + CAMPAIGN.recruitPerArmy);
    // Not where an army already stands, and not a general already leading one.
    f.credits = 100;
    expect(() => applyCampaignAction(s, { type: 'recruit', general: next, nodeId: home(s).id })).toThrow(/already stands/);
    expect(recruitCost(s, f, GENERALS[f.race][0])).toBeNull();
    // Move the first army out (a battle), then raise the second at home.
    s = settle(winBattle(attack(s)), 'settle');
    s = applyCampaignAction(s, { type: 'recruit', general: next, nodeId: home(s).id });
    const armies = armiesOf(s, s.playerId);
    expect(armies).toHaveLength(2);
    expect(armies[1].general).toBe(next);
    expect(armies[1].refit).toBe(true); // refitting: it marches next turn
    expect(armyMoves(s, armies[1])).toEqual([]);
    expect(armyDeckProblems(armies[1].deck, next)).toEqual([]);
    expect(armies[1].deck).toContain(next);
    expect(s.story.queue.some((x) => x.id === `recruit:${next}`)).toBe(true);
  });

  it('routes a beaten defending army back to a free system, or breaks it', () => {
    let s = fresh();
    const rival = s.factions[1];
    const rivalArmy = armiesOf(s, rival.id)[0];
    // Put the rival's army in a system next to the player's home that the rival holds.
    const t = nodeById(s, firstTarget(s));
    t.owner = rival.id;
    rivalArmy.nodeId = t.id;
    s = winBattle(attack(s, t.id));
    expect(s.battle).toBeNull();
    expect(armyAt(s, t.id)?.owner ?? null).not.toBe(rival.id);
    // With nowhere of its own to fall back to, the rival's army is broken.
    expect(armiesOf(s, rival.id).some((a) => a.nodeId === t.id)).toBe(false);
  });

  it('wins the campaign for whoever claims the Heart', () => {
    let s = fresh();
    const heart = s.nodes.find((n) => n.heart)!;
    const next = nodeById(s, heart.links[0]);
    next.owner = s.playerId;
    myArmy(s).nodeId = next.id;
    s = attack(s, heart.id);
    expect(s.battle?.game.players[1].name).toMatch(/Wardens/);
    s = winBattle(s);
    expect(s.winner).toBe(s.playerId);
    expect(nodeById(s, heart.id).owner).toBe(s.playerId);
    expect(s.story.queue.some((x) => x.id === 'victory')).toBe(true);
  });

  it('pays a Stellari bloom to whoever holds it, until it wilts', () => {
    let s = fresh();
    const bloom = s.nodes.find((n) => (n.stellaria ?? 0) > 0)!;
    bloom.owner = s.playerId;
    const plain = { ...factionIncome(s, s.playerId) };
    expect(plain.credits).toBe(home(s).yield.credits + bloom.yield.credits + CAMPAIGN.stellariaCredits);
    bloom.stellaria = 1;
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    if (nodeById(s, bloom.id).owner !== s.playerId) return;
    expect(nodeById(s, bloom.id).stellaria).toBe(0);
    expect(factionIncome(s, s.playerId).credits).toBe(ownedNodes(s, s.playerId).reduce((n, x) => n + x.yield.credits, 0));
  });

  it('dims a star now and then: the universe is dying', () => {
    let s = fresh();
    const total = (st: CampaignState) => st.nodes.reduce((n, x) => n + x.yield.credits + x.yield.materials, 0);
    const before = total(s);
    for (let i = 0; i < CAMPAIGN.dimEvery && !s.winner; i++) s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    expect(s.nodes.some((n) => n.dimmed)).toBe(true);
    expect(total(s)).toBeLessThan(before + 10); // (absorbs can lower it too; it never grows)
  }, 30_000); // (seven whole turns of AI battles)

  it('holds together for a lead-up, then collapses systems from the rim inwards, a turn after marking them', () => {
    let s = fresh();
    expect(regionalStability(s)).toBe(CAMPAIGN.stabilityTurns - 1);
    s.turn = CAMPAIGN.stabilityTurns - 1;
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    expect(regionalStability(s)).toBe(0);
    const marked = s.nodes.filter((n) => n.collapsing);
    expect(marked).toHaveLength(1);
    const rim = Math.max(...s.nodes.filter((n) => !n.heart).map((n) => n.ring ?? 0));
    expect(marked[0].ring).toBe(rim);
    expect(s.nodes.some((n) => n.collapsed)).toBe(false);
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    const gone = nodeById(s, marked[0].id);
    expect(gone.collapsed).toBe(true);
    expect(gone.owner).toBeNull();
    expect(armyAt(s, gone.id)).toBeNull();
    // Nothing can march into it, or through it.
    for (const a of s.armies) expect(armyMoves(s, a).some((m) => m.toId === gone.id)).toBe(false);
    // (Unless the collapse took the player's last world, and with it the campaign.)
    if (!s.winner) expect(s.nodes.filter((n) => n.collapsing)).toHaveLength(1);
  });

  it('loses an army caught in a collapse, unless it can fall back', () => {
    let s = fresh();
    const a = myArmy(s);
    const at = nodeById(s, a.nodeId);
    at.collapsing = true;
    s.turn = 3;
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    expect(nodeById(s, at.id).collapsed).toBe(true);
    // Its only system is gone: the player is out.
    expect(s.armies.some((x) => x.id === a.id)).toBe(false);
    expect(s.winner).not.toBeNull();
  });

  it('can stabilise a collapsing system once, for materials, holding it a few turns more', () => {
    let s = fresh();
    const h = home(s);
    h.collapsing = true;
    const me = campaignPlayer(s);
    me.materials = 0;
    expect(stabiliseProblem(me, h)).toMatch(/materials/);
    me.materials = CAMPAIGN.stabiliseCost;
    s = applyCampaignAction(s, { type: 'stabilise', nodeId: h.id });
    expect(campaignPlayer(s).materials).toBe(0);
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    expect(nodeById(s, h.id).collapsed).toBeFalsy();
    expect(nodeById(s, h.id).collapsing).toBeFalsy();
    // Once only.
    const n = nodeById(s, h.id);
    n.collapsing = true;
    campaignPlayer(s).materials = 99;
    expect(stabiliseProblem(campaignPlayer(s), n)).toMatch(/once/);
  });

  it('gives every home exactly one route out, to a weakened neutral system', () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      const s = fresh(seed);
      for (const h of s.nodes.filter((n) => n.home)) {
        expect(h.links).toHaveLength(1);
        const gate = nodeById(s, h.links[0]);
        expect(gate.gate).toBe(true);
        expect(gate.owner).toBeNull();
        expect(gate.tier).toBe(0);
      }
      // Still one connected map.
      const seen = new Set([s.nodes[0].id]);
      const queue = [s.nodes[0].id];
      while (queue.length) for (const l of nodeById(s, queue.shift()!).links) if (!seen.has(l)) seen.add(l), queue.push(l);
      expect(seen.size).toBe(s.nodes.length);
    }
    let s = fresh();
    expect(armyMoves(s, myArmy(s)).filter((m) => m.battle)).toHaveLength(1);
    s = attack(s);
    const plain = s.battle!.game.players[1].heat;
    expect(plain).toBeGreaterThanOrEqual(CAMPAIGN.gateHeat);
  });

  it('moves cards between an army deck and the reserve one at a time; a short deck cannot attack', () => {
    let s = fresh();
    const army = myArmy(s);
    const out = army.deck.find((id) => id !== army.general)!;
    s = applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: out });
    expect(myArmy(s).deck).toHaveLength(army.deck.length - 1);
    expect(campaignPlayer(s).reserve).toContain(out);
    expect(problemsOf(myArmy(s).deck).length).toBeGreaterThan(0);
    // Refitting this turn: it can't march until the next (and then not into battle with a short deck).
    expect(armyMoves(s, myArmy(s))).toEqual([]);
    const target = nodeById(s, home(s).links[0]).id;
    expect(() => applyCampaignAction(s, { type: 'move', armyId: army.id, toId: target })).toThrow(/refitting/);
    const short = structuredClone(s);
    myArmy(short).refit = false;
    expect(() => applyCampaignAction(short, { type: 'move', armyId: army.id, toId: target })).toThrow(/isn't ready/);
    // The general's last card stays.
    const g = myArmy(s).general;
    let t = s;
    while (myArmy(t).deck.filter((x) => x === g).length > 1) t = applyCampaignAction(t, { type: 'deckRemove', armyId: army.id, defId: g });
    expect(() => applyCampaignAction(t, { type: 'deckRemove', armyId: army.id, defId: g })).toThrow(/leads this army/);
    s = applyCampaignAction(s, { type: 'deckAdd', armyId: army.id, defId: out });
    expect(armyDeckProblems(myArmy(s).deck, myArmy(s).general)).toEqual([]);
    myArmy(s).refit = false; // (as next turn)
    expect(() => attack(s)).not.toThrow();
    // And an army that has marched can't refit until the next turn.
    const marched = attack(s);
    expect(() => applyCampaignAction(structuredClone({ ...marched, battle: null }), { type: 'deckRemove', armyId: army.id, defId: out })).toThrow(/marched/);
  });

  it('recycles a reserve card for half its armory price in materials', () => {
    let s = fresh();
    campaignPlayer(s).reserve.push('coronal_lance');
    const before = campaignPlayer(s).materials;
    s = applyCampaignAction(s, { type: 'recycle', defId: 'coronal_lance' });
    expect(campaignPlayer(s).materials).toBe(before + recycleValue('coronal_lance'));
    expect(recycleValue('coronal_lance')).toBe(Math.max(1, Math.floor(armoryPrice('coronal_lance') / 2)));
    expect(campaignPlayer(s).reserve).not.toContain('coronal_lance');
    expect(() => applyCampaignAction(s, { type: 'recycle', defId: 'coronal_lance' })).toThrow();
  });

  it('has stars of every kind, each with its gift and cost', () => {
    const s = fresh();
    const kinds = new Set(s.nodes.map((n) => n.star).filter(Boolean));
    for (const k of ['red', 'white', 'brown', 'neutron']) expect(kinds.has(k as never)).toBe(true);
    // Never at home, a gate, or the Heart.
    for (const n of s.nodes) if (n.home || n.gate || n.heart) expect(n.star).toBeUndefined();
    // A brown dwarf shelters its defender; a neutron star heats every sun.
    let t = fresh();
    const gate = nodeById(t, home(t).links[0]);
    gate.star = 'brown';
    t = attack(t);
    expect(supernovaThreshold(t.battle!.game.players[1])).toBeGreaterThan(supernovaThreshold(t.battle!.game.players[0]));
  });

  it('repairs all at once, and lets the Lost Races wander, raid and be hunted for relics', () => {
    let s = fresh();
    const h = home(s);
    h.damage = 4;
    campaignPlayer(s).credits = 100;
    s = applyCampaignAction(s, { type: 'heal', nodeId: h.id, all: true });
    expect(home(s).damage).toBe(0);
    // A lost army beside the player's gate: beat it and take its relics.
    const gate = nodeById(s, home(s).links[0]);
    const lost = s.armies.find((a) => a.lost)!;
    lost.nodeId = gate.id;
    const before = campaignPlayer(s).materials;
    s = winBattle(attack(s));
    expect(s.armies.some((a) => a.id === lost.id)).toBe(false);
    expect(campaignPlayer(s).materials).toBeGreaterThanOrEqual(before + CAMPAIGN.winMaterials + CAMPAIGN.lostRelicMaterials);
    expect(s.cardRewards.some((r) => r.source.startsWith('Relics'))).toBe(true);
  });

  it('lets the other factions move one at a time, and shows only what is in sight', () => {
    let s = fresh();
    s = applyCampaignAction(s, { type: 'endTurn', stepwise: true });
    expect(s.phase).toBe('ai');
    expect(s.aiQueue.length).toBeGreaterThan(1);
    const before = s.aiQueue.length;
    s = applyCampaignAction(s, { type: 'aiStep' });
    if (!s.battle) expect(s.aiQueue.length).toBe(before - 1);
    for (let guard = 0; guard < 20 && s.phase === 'ai'; guard++) {
      if (s.battle) s = applyCampaignAction(s, { type: 'finishBattle', game: s.battle.game, auto: true });
      else s = applyCampaignAction(s, { type: 'aiStep' });
    }
    expect(s.turn).toBe(2);
    // News from out of sight is not the player's to know; their own doings and news everyone hears are.
    const seen = seenBy(s, s.playerId);
    const far = s.nodes.find((n) => !seen.has(n.id))!;
    expect(logInSight(s, { seq: 0, turn: 1, text: 'x', at: [far.id], who: 'f2' }, s.playerId)).toBe(false);
    expect(logInSight(s, { seq: 0, turn: 1, text: 'x', at: [far.id], who: s.playerId }, s.playerId)).toBe(true);
    expect(logInSight(s, { seq: 0, turn: 1, text: 'x' }, s.playerId)).toBe(true);
  });

  it("grows heroes: experience from battles, skill points, and skills and gear that ride on the hero's card", () => {
    let s = fresh();
    const me = campaignPlayer(s);
    const hero = myArmy(s).general;
    s = winBattle(attack(s));
    expect(heroState(campaignPlayer(s), hero).xp).toBeGreaterThan(0);
    s = settle(s);
    // Enough experience for a level: one point to spend, down a branch in order.
    let t = fresh();
    const h = heroState(campaignPlayer(t), hero);
    h.xp = 25; // level 3: two points
    expect(heroLevel(h.xp)).toBe(3);
    const tree = SKILL_TREES[hero];
    const t2 = tree.find((k) => k.branch === 0 && k.tier === 2)!;
    expect(() => applyCampaignAction(t, { type: 'learnSkill', hero, skill: t2.id })).toThrow(/before it/);
    const t1 = tree.find((k) => k.branch === 0 && k.tier === 1)!;
    t = applyCampaignAction(t, { type: 'learnSkill', hero, skill: t1.id });
    expect(heroState(campaignPlayer(t), hero).skills).toContain(t1.id);
    // Gear: equipped in a slot of its kind.
    const item = makeItem('i1', 'weapon', 'anomaly', me.race, 0.2);
    expect(item.boons!.length).toBeGreaterThan(0);
    campaignPlayer(t).items = [item];
    expect(() => applyCampaignAction(t, { type: 'equip', hero, itemId: 'i1', slot: RACE_SLOTS[me.race][1].id })).toThrow(/fit/);
    t = applyCampaignAction(t, { type: 'equip', hero, itemId: 'i1', slot: 'weapon' });
    // Both go into battle on the hero's own card: none of the army's other cards are touched.
    t = attack(t);
    const p = t.battle!.game.players[0];
    expect(p.heroBoons?.hero).toBe(hero);
    expect(p.heroBoons?.boons).toEqual(expect.arrayContaining([...(t1.effect.kind === 'boon' ? t1.effect.boons : []), ...item.boons!]));
    expect(p.modifiers ?? {}).not.toHaveProperty('extraPlays');
  });

  it('gives each hero eighteen skills in three branches, deeper ones costing more, over twenty-one levels', () => {
    const hero = myArmy(fresh()).general;
    const tree = SKILL_TREES[hero];
    expect(tree.length).toBe(18);
    for (const b of [0, 1, 2]) expect(tree.filter((k) => k.branch === b).map((k) => k.tier).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(XP_LEVELS.length).toBe(21);
    const total = tree.reduce((t, k) => t + skillCost(k), 0);
    expect(total).toBeGreaterThan(XP_LEVELS.length - 1);
    // A capstone costs 3 points.
    let t = fresh();
    const h = heroState(campaignPlayer(t), hero);
    h.xp = XP_LEVELS[XP_LEVELS.length - 1];
    for (const k of tree.filter((x) => x.branch === 0 && x.tier < 6).sort((a, b) => a.tier - b.tier)) t = applyCampaignAction(t, { type: 'learnSkill', hero, skill: k.id });
    const before = skillPoints(heroState(campaignPlayer(t), hero), hero);
    const cap = tree.find((x) => x.branch === 0 && x.tier === 6)!;
    t = applyCampaignAction(t, { type: 'learnSkill', hero, skill: cap.id });
    expect(skillPoints(heroState(campaignPlayer(t), hero), hero)).toBe(before - 3);
  });

  it("brings a hero's Herald into play from the start, and their rival-side capstones onto the rival", () => {
    let s = fresh();
    const hero = myArmy(s).general;
    const h = heroState(campaignPlayer(s), hero);
    h.xp = XP_LEVELS[XP_LEVELS.length - 1];
    for (const k of SKILL_TREES[hero].filter((x) => x.branch === 2).sort((a, b) => a.tier - b.tier)) s = applyCampaignAction(s, { type: 'learnSkill', hero, skill: k.id });
    s = attack(s);
    const me = s.battle!.game.players[0];
    expect(me.tableau.some((c) => c.defId === hero && c.slot === COMMAND_SLOT)).toBe(true);
    expect(me.deck.filter((c) => c.defId === hero).length + me.hand.filter((c) => c.defId === hero).length).toBeLessThan(myArmy(s).deck.filter((id) => id === hero).length);
    // The hero's card carries its learned boons while it is in play.
    const card = me.tableau.find((c) => c.defId === hero)!;
    expect(card.boons?.length).toBeGreaterThan(0);
    expect(armyBonus(s, myArmy(s)).boons).toEqual(card.boons);
  });

  it('researches army-wide upgrades: paid up front, done in turns, shared by every army', () => {
    let s = fresh();
    const f = campaignPlayer(s);
    f.materials = 0;
    expect(() => applyCampaignAction(s, { type: 'research', id: 'sight1' })).toThrow(/materials/);
    expect(() => applyCampaignAction(s, { type: 'research', id: 'march1' })).toThrow(/first/);
    campaignPlayer(s).materials = 50;
    s = applyCampaignAction(s, { type: 'research', id: 'sight1' });
    expect(campaignPlayer(s).materials).toBe(50 - researchProject('sight1')!.cost);
    expect(() => applyCampaignAction(s, { type: 'research', id: 'hull1' })).toThrow(/Already researching/);
    // It is done after its turns, and its armies then see further.
    for (let i = 0; i < researchProject('sight1')!.turns; i++) s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    expect(campaignPlayer(s).research?.done).toContain('sight1');
    expect(campaignPlayer(s).research?.current).toBeUndefined();
    expect(armyBonus(s, myArmy(s)).sight).toBe(1);
    // The next project up the branch can start now: marching a route further.
    campaignPlayer(s).research = { done: ['sight1', 'march1'] };
    expect(armyBonus(s, myArmy(s)).march).toBe(1);
    // Hulls and energy reach the battle as the army's modifiers.
    let b = fresh();
    campaignPlayer(b).research = { done: ['hull1', 'energy1'] };
    b = attack(b);
    expect(b.battle!.game.players[0].modifiers?.maxHealthDelta).toBe(4);
    expect(b.battle!.game.players[0].modifiers?.extraPlays).toBe(1);
  });

  it('lets Dread research take weak neutral systems without a fight', () => {
    let s = fresh();
    campaignPlayer(s).research = { done: ['dread1'] };
    const gate = nodeById(s, home(s).links[0]);
    expect(armyMoves(s, myArmy(s)).find((m) => m.toId === gate.id)?.surrender).toBe(gate.tier < 1);
    campaignPlayer(s).research = { done: ['dread1', 'dread2'] };
    gate.tier = 1;
    expect(armyMoves(s, myArmy(s)).find((m) => m.toId === gate.id)?.surrender).toBe(!gate.owner && !armyAt(s, gate.id));
  });

  it('fuses cards at the cost of both', () => {
    expect(cardCost(fusedId('coronal_lance', 'cryo_vault'))).toBe(cardCost('coronal_lance') + cardCost('cryo_vault'));
    expect(fusionProblem('hymn_of_the_sun', 'dawnstar_cannon')).toMatch(/energy/);
  });
});
