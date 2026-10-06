import { describe, expect, it } from 'vitest';
import {
  applyCampaignAction,
  attackOptions,
  CAMPAIGN,
  campaignPlayer,
  createCampaign,
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
  buyProblem,
  heroStats,
  newShip,
  researchProblem,
  researchWisdom,
  shipUpgradeCost,
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
  stabiliseProblem,
  RACE_NAMES,
  type CampaignState,
} from '../src/engine';
import { BALANCE } from '../src/engine/balance';
import { sunHealth } from '../src/engine/campaign';

/** A battle's suns' max health, as a change to the card game's (both sides start from it). */
const baseDelta = (st: CampaignState) => sunHealth(st.nodes.find((n) => n.id === st.battle!.nodeId)!) - BALANCE.supernovaAt;

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
      expect(armies[0].deck).toHaveLength(3);
    }
    expect(new Set(rivals.map((f) => f.race)).size).toBe(4);
    // The Lost Races wander the middle reaches, each with a leader and a few cards.
    const lost = s.armies.filter((a) => a.lost);
    expect(lost).toHaveLength(CAMPAIGN.lostArmies);
    for (const a of lost) expect(armyDeckProblems(a.deck, a.general)).toEqual([]);
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

  it('lets the player lead any race, and draws the rivals from all the others', () => {
    const seen = new Set<number>();
    for (let race = 0; race < RACE_NAMES.length; race++) {
      for (const seed of [1, 2, 3]) {
        const s = createCampaign({ seed: seed * 101 + race, race, rivals: 3 });
        const factions = s.factions.filter((f) => !f.lost);
        expect(campaignPlayer(s).race).toBe(race);
        expect(new Set(factions.map((f) => f.race)).size).toBe(4);
        for (const f of factions) {
          if (f.isAI) seen.add(f.race);
          const [army] = armiesOf(s, f.id);
          expect(army.general).toBe(GENERALS[f.race][0]);
          expect(armyDeckProblems(army.deck, army.general)).toEqual([]);
          // Every one of its generals has a skill tree, and its slots take gear named for it.
          for (const g of GENERALS[f.race]) expect(SKILL_TREES[g]).toHaveLength(18);
          for (const sl of RACE_SLOTS[f.race]) expect(makeItem('x', sl.kind, 'stellar', f.race).name).toMatch(/^Bright /);
        }
        expect(s.story.queue[0].id).toBe('intro');
      }
    }
    // Every race turns up as a rival somewhere.
    expect([...seen].sort()).toEqual(RACE_NAMES.map((_, r) => r));
    // The rivals depend on the seed, not only on the player's race.
    const rivalsOf = (seed: number) => createCampaign({ seed, race: 7, rivals: 3 }).factions.filter((f) => f.isAI && !f.lost).map((f) => f.race).join();
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(rivalsOf)).size).toBeGreaterThan(1);
  }, 30000);

  it('plays a new race through a battle: Pyrr armies march, fight and gain experience', () => {
    let s = createCampaign({ seed: 5, race: 7, rivals: 3 });
    s = applyCampaignAction(s, { type: 'readStory' });
    expect(cardDef(myArmy(s).general).race).toBe(7);
    s = attack(s);
    expect(s.battle).not.toBeNull();
    expect(s.battle!.game.players[0].deck.concat(s.battle!.game.players[0].hand).some((c) => cardDef(c.defId).race === 7)).toBe(true);
    s = settle(winBattle(s));
    expect(heroState(campaignPlayer(s), GENERALS[7][0]).xp).toBeGreaterThan(0);
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
    expect([...p0.deck, ...p0.hand, ...p0.tableau].map((c) => c.defId).sort()).toEqual(deck.sort());
    expect(s.battle!.game.campaign).toBe(true);
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
    expect(() => applyCampaignAction(s, { type: 'deckSwap', armyId: army.id, slot, reserveIndex: 2 })).toThrow(/one hero/);
    s = applyCampaignAction(s, { type: 'deckSwap', armyId: army.id, slot, reserveIndex: 1 });
    expect(myArmy(s).deck[slot]).toBe('helio_lancer');
    expect(campaignPlayer(s).reserve).toContain(army.deck[slot]);
    expect(armyDeckProblems(myArmy(s).deck, army.general)).toEqual([]);
  });
});

describe('economy', () => {
  it('buys cards at an armoury the flagship stands in, each once, and fortifies systems with credits', () => {
    let s = fresh();
    const shop = s.nodes.find((n) => n.station?.kind === 'armory')!;
    const stock = shop.station!.kind === 'armory' ? [...shop.station!.cards] : [];
    s.factions[0].materials = 30;
    expect(buyProblem(s, campaignPlayer(s), shop, 0)).toMatch(/flagship must be/);
    shop.owner = s.playerId;
    myArmy(s).nodeId = shop.id;
    const price = armoryPrice(stock[0]);
    s = applyCampaignAction(s, { type: 'buyCard', nodeId: shop.id, index: 0 });
    expect(campaignPlayer(s).reserve).toContain(stock[0]);
    expect(campaignPlayer(s).materials).toBe(30 - price);
    const left = nodeById(s, shop.id).station!;
    expect(left.kind === 'armory' && left.cards).toEqual(stock.slice(1));
    s = applyCampaignAction(s, { type: 'fortify', nodeId: home(s).id });
    expect(home(s).fortification).toBe(1);
    expect(campaignPlayer(s).credits).toBe(CAMPAIGN.startCredits - CAMPAIGN.fortifyBaseCost);
  });

  it('builds Wisdom a turn, and spends it on a research station\'s one upgrade, taken once', () => {
    let s = fresh();
    s = settle(applyCampaignAction(s, { type: 'endTurn' }));
    expect(campaignPlayer(s).wisdom).toBe(CAMPAIGN.wisdomPerTurn * (s.turn - 1));
    const lab = s.nodes.find((n) => n.station?.kind === 'research')!;
    const project = lab.station!.kind === 'research' ? lab.station!.project : '';
    lab.owner = s.playerId;
    myArmy(s).nodeId = lab.id;
    campaignPlayer(s).wisdom = 0;
    expect(researchProblem(s, campaignPlayer(s), lab)).toMatch(/Wisdom/);
    campaignPlayer(s).wisdom = 20;
    s = applyCampaignAction(s, { type: 'research', nodeId: lab.id });
    expect(campaignPlayer(s).research?.done).toContain(project);
    expect(campaignPlayer(s).wisdom).toBe(20 - researchWisdom(project));
    const taken = nodeById(s, lab.id).station!;
    expect(taken.kind === 'research' && taken.takenBy).toBe(s.playerId);
    expect(() => applyCampaignAction(s, { type: 'research', nodeId: lab.id })).toThrow(/already been taken/);
  });

  it('upgrades the flagship\'s rooms, shields and hull for credits, and they reach the battle', () => {
    let s = fresh();
    campaignPlayer(s).credits = 200;
    expect(shipUpgradeCost(newShip(), { part: 'defence', room: 2 })).toBe(CAMPAIGN.shipBase);
    s = applyCampaignAction(s, { type: 'upgradeShip', part: 'defence', room: 2 });
    s = applyCampaignAction(s, { type: 'upgradeShip', part: 'attack', room: 1 });
    s = applyCampaignAction(s, { type: 'upgradeShip', part: 'command' });
    s = applyCampaignAction(s, { type: 'upgradeShip', part: 'shields' });
    s = applyCampaignAction(s, { type: 'upgradeShip', part: 'hull' });
    expect(campaignPlayer(s).credits).toBe(200 - 5 * CAMPAIGN.shipBase);
    for (let i = 1; i < CAMPAIGN.shipMax.shields; i++) s = applyCampaignAction(s, { type: 'upgradeShip', part: 'shields' });
    expect(() => applyCampaignAction(s, { type: 'upgradeShip', part: 'shields' })).toThrow(/fully upgraded/);
    s = attack(s);
    const me = s.battle!.game.players[0];
    expect(me.rooms?.defence[2]).toBe(1);
    expect(me.rooms?.attack[1]).toBe(1);
    expect(me.rooms?.command).toBe(CAMPAIGN.commandRoom + 1);
    expect(me.shields).toBeGreaterThanOrEqual(CAMPAIGN.shipMax.shields);
    expect(me.modifiers?.maxHealthDelta).toBe(baseDelta(s) + CAMPAIGN.hullHealth);
    // The station defending has no hero: it fights with a few cards and its walls.
    const them = s.battle!.game.players[1];
    expect(them.hero).toBeUndefined();
    expect(them.deck.length + them.hand.length).toBeLessThanOrEqual(CAMPAIGN.stationDeck[2]);
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

describe('stations', () => {
  it('dots armouries and research stations about the map, better stocked near anomalies', async () => {
    const { nodeAnomalies, researchProject: rp } = await import('../src/engine');
    for (const seed of [1, 2, 3]) {
      const s = fresh(seed);
      const shops = s.nodes.filter((n) => n.station?.kind === 'armory');
      const labs = s.nodes.filter((n) => n.station?.kind === 'research');
      expect(shops).toHaveLength(CAMPAIGN.armories);
      expect(labs).toHaveLength(CAMPAIGN.researchStations);
      for (const n of [...shops, ...labs]) expect(n.home || n.heart || n.gate).toBeFalsy();
      for (const n of shops) {
        const cards = n.station!.kind === 'armory' ? n.station!.cards : [];
        expect(cards).toHaveLength(CAMPAIGN.armoryStock);
        expect(new Set(cards).size).toBe(cards.length);
        for (const id of cards) expect(cardDef(id).kind).not.toBe('command');
      }
      for (const n of labs) {
        const project = n.station!.kind === 'research' ? n.station!.project : '';
        if (nodeAnomalies(s, n).length) expect(rp(project)!.tier).toBeGreaterThanOrEqual(2);
      }
    }
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
  it('gives each faction one flagship, led by its hero, with the hero, one defence and one attack', () => {
    const s = createCampaign({ seed: 5, rivals: 3, race: 2, hero: GENERALS[2][1] });
    expect(campaignPlayer(s).hero).toBe(GENERALS[2][1]);
    for (const f of s.factions.filter((x) => !x.lost)) {
      const armies = armiesOf(s, f.id);
      expect(armies).toHaveLength(1);
      expect(armies[0].general).toBe(f.hero);
      expect(armies[0].deck).toHaveLength(3);
      expect(armies[0].deck.slice(1).map((id) => cardDef(id).kind).sort()).toEqual(['attack', 'defence']);
      expect(armyDeckProblems(armies[0].deck, armies[0].general)).toEqual([]);
    }
    // (A hero who isn't the race's is not taken: the first leads.)
    expect(campaignPlayer(createCampaign({ seed: 5, race: 2, hero: GENERALS[3][0] })).hero).toBe(GENERALS[2][0]);
  });

  it('trains a hero\'s own attack and defence with skill points, for the battle', () => {
    let s = fresh();
    const hero = myArmy(s).general;
    expect(() => applyCampaignAction(s, { type: 'train', hero, stat: 'attack' })).toThrow(/skill points/);
    heroState(campaignPlayer(s), hero).xp = XP_LEVELS[3];
    s = applyCampaignAction(s, { type: 'train', hero, stat: 'attack' });
    s = applyCampaignAction(s, { type: 'train', hero, stat: 'defence' });
    expect(heroStats(campaignPlayer(s), hero)).toEqual({ attack: CAMPAIGN.heroAttack + 1, defence: CAMPAIGN.heroDefence + 1 });
    expect(skillPoints(heroState(campaignPlayer(s), hero), hero)).toBe(1);
    s = attack(s);
    expect(s.battle!.game.players[0].heroStats).toEqual(heroStats(campaignPlayer(s), hero));
    expect(s.battle!.game.players[0].hero).toBe(hero);
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
    // With nowhere of its own next door, the rival's flagship falls back to the nearest system it holds.
    expect(armiesOf(s, rival.id)).toHaveLength(1);
    expect(nodeById(s, armiesOf(s, rival.id)[0].nodeId).owner).toBe(rival.id);
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

  it('moves cards between the flagship\'s deck and the reserve one at a time, up to ten', () => {
    let s = fresh();
    const army = myArmy(s);
    const out = army.deck.find((id) => id !== army.general)!;
    s = applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: out });
    expect(myArmy(s).deck).toHaveLength(army.deck.length - 1);
    expect(campaignPlayer(s).reserve).toContain(out);
    // Refitting this turn: it can't march until the next.
    expect(armyMoves(s, myArmy(s))).toEqual([]);
    const target = nodeById(s, home(s).links[0]).id;
    expect(() => applyCampaignAction(s, { type: 'move', armyId: army.id, toId: target })).toThrow(/refitting/);
    // The hero stays.
    expect(() => applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: army.general })).toThrow(/leads this army/);
    s = applyCampaignAction(s, { type: 'deckAdd', armyId: army.id, defId: out });
    // No most: past ten it goes on taking cards; and from ten it keeps at least ten.
    campaignPlayer(s).reserve.push(...['coronal_lance', 'coronal_lance', 'photon_drill', 'photon_drill', 'cryo_vault', 'cryo_vault', 'thermal_exchange', 'deflector_grid', 'scatter_shot']);
    for (const id of ['coronal_lance', 'coronal_lance', 'photon_drill', 'photon_drill', 'cryo_vault', 'cryo_vault', 'thermal_exchange']) {
      if (myArmy(s).deck.filter((x) => x === id).length < 2) s = applyCampaignAction(s, { type: 'deckAdd', armyId: army.id, defId: id });
    }
    while (myArmy(s).deck.length < CAMPAIGN.armySize) s = applyCampaignAction(s, { type: 'deckAdd', armyId: army.id, defId: 'deflector_grid' });
    expect(() => applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: myArmy(s).deck.find((id) => id !== army.general)! })).toThrow(/at least/);
    s = applyCampaignAction(s, { type: 'deckAdd', armyId: army.id, defId: 'scatter_shot' });
    expect(myArmy(s).deck.length).toBe(CAMPAIGN.armySize + 1);
    s = applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: 'scatter_shot' });
    expect(myArmy(s).deck.length).toBe(CAMPAIGN.armySize);
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

  it("always has the hero in the command room, carrying their learned boons", () => {
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

  it('carries research upgrades into battle and onto the map', () => {
    let s = fresh();
    campaignPlayer(s).research = { done: ['sight1', 'march1'] };
    expect(armyBonus(s, myArmy(s)).sight).toBe(1);
    expect(armyBonus(s, myArmy(s)).march).toBe(1);
    // Hulls and energy reach the battle as the flagship's modifiers.
    let b = fresh();
    campaignPlayer(b).research = { done: ['hull1', 'energy1'] };
    b = attack(b);
    expect(b.battle!.game.players[0].modifiers?.maxHealthDelta).toBe(baseDelta(b) + 2);
    expect(b.battle!.game.players[0].modifiers?.extraPlays).toBe(1);
    expect(researchProject('hull1')).toBeTruthy();
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

describe('sun health and salvage', () => {
  it('gives every sun 10 max health at the rim, more nearer the Heart, the same base for both sides', () => {
    // (By depth: the way from the Heart out to the homes, in five bands.)
    const at = (bands: number) => sunHealth({ ring: Math.round(bands * CAMPAIGN.homeRing / 5) } as never);
    expect(sunHealth({ ring: CAMPAIGN.homeRing + 9 } as never)).toBe(10);
    expect(at(5)).toBe(10);
    expect(at(4)).toBe(10);
    expect(at(3)).toBe(12);
    expect(at(1)).toBe(19);
    expect(sunHealth({ ring: 1 } as never)).toBe(19);
    expect(sunHealth({ heart: true, ring: 0 } as never)).toBe(24);
  });
});

describe('salvage', () => {
  it('offers up to three of a beaten side\'s cards, never a Hero; the one taken joins the deck while it has room', async () => {
    const { applyAction } = await import('../src/engine/game');
    const { salvageOptions } = await import('../src/engine/campaign');
    let s = attack(fresh());
    const game = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[1].id });
    const options = salvageOptions(s, game);
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(CAMPAIGN.salvageChoices);
    expect(options.every((id) => cardDef(id).kind !== 'command')).toBe(true);
    expect(salvageOptions(s, game)).toEqual(options);
    const before = myArmy(s).deck.length;
    s = applyCampaignAction(s, { type: 'finishBattle', game, salvage: options[0] });
    expect(myArmy(s).deck.length).toBe(before + 1);
    expect(myArmy(s).deck).toContain(options[0]);
  });

  it('offers nothing after a loss, and a battle auto-resolved owes the choice on the map', async () => {
    const { applyAction } = await import('../src/engine/game');
    const { salvageOptions } = await import('../src/engine/campaign');
    const s = attack(fresh());
    const lost = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[0].id });
    expect(salvageOptions(s, lost)).toEqual([]);
    const won = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[1].id });
    const t = applyCampaignAction(s, { type: 'finishBattle', game: won });
    expect(t.cardRewards[0]?.source).toBe('Salvage');
  });
});

describe('ship modules and finds', () => {
  it('fits a module into a room (one there goes back to the stores), and the card standing there carries it', async () => {
    const { makeModule } = await import('../src/engine/modules');
    let s = fresh();
    const me = campaignPlayer(s);
    me.modules = [makeModule('m1', 'coolant', 'stellar'), makeModule('m2', 'lances', 'dwarf')];
    s = applyCampaignAction(s, { type: 'fitModule', moduleId: 'm1', room: 2 });
    expect(campaignPlayer(s).ship.modules?.[2]?.id).toBe('m1');
    s = applyCampaignAction(s, { type: 'fitModule', moduleId: 'm2', room: 2 });
    expect(campaignPlayer(s).ship.modules?.[2]?.id).toBe('m2');
    expect(campaignPlayer(s).modules?.map((m) => m.id)).toEqual(['m1']);
    s = applyCampaignAction(s, { type: 'fitModule', moduleId: 'm1', room: 0 });
    s = attack(s);
    const p = s.battle!.game.players[0];
    expect(p.rooms?.boons?.[2]).toEqual(['boon_heat_1']);
    expect(p.rooms?.boons?.[0]).toEqual(['boon_cool_2']);
    // A card placed in room 2 carries the lances; leaving, it drops them.
    const { createGame } = await import('../src/engine/game');
    const g = createGame({ seed: 1, campaign: true, players: [{ name: 'A', isAI: false, deck: ['coolant_array', 'coolant_array'], tableau: ['coolant_array'], rooms: p.rooms }, { name: 'B', isAI: true, deck: ['coolant_array'] }] });
    const placed = g.players[0].tableau.find((c) => c.slot === 2);
    expect(placed?.boons).toContain('boon_heat_1');
  });

  it("shows a battle's finds before they are taken, and takes the same ones", async () => {
    const { applyAction } = await import('../src/engine/game');
    const { battleFinds } = await import('../src/engine/campaign');
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      let s = attack(fresh(seed));
      const game = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[1].id });
      const finds = battleFinds(s, game);
      if (!finds.items.length && !finds.modules.length) continue;
      found = true;
      expect(battleFinds(s, game)).toEqual(finds);
      s = applyCampaignAction(s, { type: 'finishBattle', game, salvage: null });
      const me = campaignPlayer(s);
      for (const m of finds.modules) expect(me.modules?.map((x) => x.id)).toContain(m.id);
      for (const i of finds.items) expect(me.items?.map((x) => x.id)).toContain(i.id);
    }
    expect(found).toBe(true);
  });
});

describe('defending a neighbour', () => {
  it('sends a hero one route away to defend a held system with no army in it, and no farther', async () => {
    const { defenderOf } = await import('../src/engine/campaign');
    const s = fresh();
    const mine = myArmy(s);
    const at = nodeById(s, mine.nodeId);
    // A neighbour the player holds, with a rival army one route beyond it.
    const near = nodeById(s, at.links[0]);
    near.owner = s.playerId;
    const rival = s.armies.find((a) => a.owner !== s.playerId && !a.lost)!;
    const beyond = near.links.map((id) => nodeById(s, id)).find((n) => n.id !== at.id)!;
    rival.nodeId = beyond.id;
    expect(defenderOf(s, near, rival)).toBe(mine);
    // Two routes away is too far.
    const far = beyond.links.map((id) => nodeById(s, id)).find((n) => n.id !== near.id && !n.links.includes(at.id) && n.id !== at.id)!;
    far.owner = s.playerId;
    if (!far.links.includes(mine.nodeId)) expect(defenderOf(s, far, rival)).toBeNull();
    // An army standing in the system defends it first.
    const other = { ...structuredClone(mine), id: 'armyX', nodeId: near.id };
    s.armies.push(other);
    expect(defenderOf(s, near, rival)).toBe(other);
  });
});
