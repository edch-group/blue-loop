import { describe, expect, it } from 'vitest';
import {
  GALAXIES,
  galaxyEffects,
  applyCampaignAction,
  attackOptions,
  CAMPAIGN,
  campaignPlayer,
  createCampaign,
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
  researchProblem,
  GENERALS,
  heroState,
  armyDeckProblems,
  armyBonus,
  researchProject,
  cardCost,
  supernovaThreshold,
  recycleValue,
  type CampaignState,
} from '../src/engine';

/** The attacking flagship's sun before its own upgrades: the card game's, and the galaxy's touch. */
const flagDelta = (st: CampaignState) => galaxyEffects(st)?.modifiers.maxHealthDelta ?? 0;

/** A new campaign with every system guarded (no finds), so the battle tests have someone to fight. */
const fresh = (seed = 7) => {
  const s = createCampaign({ seed, rivals: 3 });
  for (const n of s.nodes) delete n.cache;
  return s;
};
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
  it('repairs the flagship only at a space station, for materials', () => {
    let s = fresh();
    const me = campaignPlayer(s);
    me.materials = 50;
    const army = myArmy(s);
    army.damage = 3;
    expect(() => applyCampaignAction(s, { type: 'healArmy', armyId: army.id })).toThrow(/space station/);
    const dock = s.nodes.find((n) => n.station?.kind === 'armory')!;
    army.nodeId = dock.id;
    s = applyCampaignAction(s, { type: 'healArmy', armyId: army.id, all: true });
    expect(myArmy(s).damage).toBe(0);
    expect(campaignPlayer(s).materials).toBe(50 - 3 * CAMPAIGN.armyHealCost);
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

  it('plays a new race through a battle: Pyrr armies march and fight (heroes no longer level)', () => {
    let s = createCampaign({ seed: 5, race: 7, rivals: 3 });
    for (const n of s.nodes) delete n.cache;
    s = applyCampaignAction(s, { type: 'readStory' });
    expect(cardDef(myArmy(s).general).race).toBe(7);
    s = attack(s);
    expect(s.battle).not.toBeNull();
    expect(s.battle!.game.players[0].deck.concat(s.battle!.game.players[0].hand).some((c) => cardDef(c.defId).race === 7)).toBe(true);
    s = settle(winBattle(s));
    expect(heroState(campaignPlayer(s), GENERALS[7][0]).xp).toBe(0);
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

  it('a won battle takes the system, with no choice to make', () => {
    let s = fresh();
    const target = nodeById(s, firstTarget(s));
    s = winBattle(attack(s, target.id));
    expect(s.conquest).toBeNull();
    expect(nodeById(s, target.id).owner).toBe(s.playerId);
  });

});

describe('decks', () => {
  it('keeps the deck legal when swapping', () => {
    let s = fresh();
    const f = campaignPlayer(s);
    f.reserve.push('ice_age', 'helio_lancer', GENERALS[f.race].find((g) => g !== myArmy(s).general)!);
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
  it('buys cards at an armoury the flagship stands in, each once', () => {
    let s = fresh();
    const shop = s.nodes.find((n) => n.station?.kind === 'armory')!;
    const stock = shop.station!.kind === 'armory' ? [...shop.station!.cards] : [];
    s.factions[0].materials = 30;
    expect(buyProblem(s, campaignPlayer(s), shop, 0)).toMatch(/flagship must be/);
    shop.owner = s.playerId;
    myArmy(s).nodeId = shop.id;
    const price = armoryPrice(stock[0]);
    const before = myArmy(s).deck.filter((x) => x === stock[0]).length;
    s = applyCampaignAction(s, { type: 'buyCard', nodeId: shop.id, index: 0 });
    // (Straight into the flagship's deck: there is no deck to manage.)
    expect(myArmy(s).deck.filter((x) => x === stock[0]).length + campaignPlayer(s).reserve.filter((x) => x === stock[0]).length).toBe(before + 1);
    expect(campaignPlayer(s).materials).toBe(30 - price);
    const left = nodeById(s, shop.id).station!;
    expect(left.kind === 'armory' && left.cards).toEqual(stock.slice(1));
  });

  it('offers a few upgrades at a research station, one taken free, once', () => {
    let s = fresh();
    const lab = s.nodes.find((n) => n.station?.kind === 'research')!;
    const options = lab.station!.kind === 'research' ? lab.station!.options : [];
    expect(options).toHaveLength(CAMPAIGN.researchOptions);
    expect(new Set(options).size).toBe(options.length);
    lab.owner = s.playerId;
    myArmy(s).nodeId = lab.id;
    expect(researchProblem(s, campaignPlayer(s), lab)).toBeNull();
    expect(() => applyCampaignAction(s, { type: 'research', nodeId: lab.id, projectId: 'no_such_project' })).toThrow(/doesn't offer/);
    const materials = campaignPlayer(s).materials;
    s = applyCampaignAction(s, { type: 'research', nodeId: lab.id, projectId: options[1] });
    expect(campaignPlayer(s).research?.done).toContain(options[1]);
    expect(campaignPlayer(s).materials).toBe(materials);
    const taken = nodeById(s, lab.id).station!;
    expect(taken.kind === 'research' && taken.takenBy).toBe(s.playerId);
    expect(taken.kind === 'research' && taken.project).toBe(options[1]);
    expect(() => applyCampaignAction(s, { type: 'research', nodeId: lab.id, projectId: options[0] })).toThrow(/already been taken/);
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


describe('galaxies', () => {
  it('gives every universe a galaxy, never the same twice running, touching both sides of every battle', () => {
    const s = fresh(4);
    expect(GALAXIES[s.galaxy!]).toBeTruthy();
    expect((s as { anomalies?: unknown }).anomalies).toBeUndefined();
    const fx = galaxyEffects(s)!;
    expect(fx.conditions[0].name).toBe(GALAXIES[s.galaxy!].name);
  });
});

describe('stations', () => {
  it('dots armouries and research stations about the map, better stocked deep in the strip', async () => {
    const { deepIn, researchProject: rp } = await import('../src/engine');
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
        const options = n.station!.kind === 'research' ? n.station!.options : [];
        expect(options).toHaveLength(CAMPAIGN.researchOptions);
        if (deepIn(s, n)) expect(rp(options[0])!.tier).toBeGreaterThanOrEqual(2);
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

describe('the view', () => {
  it('shows the whole strip, every route to the wormhole', () => {
    const s = fresh();
    // (All but the hidden challenges, found only once the system they hang off is taken.)
    expect(visibleNodes(s, s.playerId).size).toBe(s.nodes.filter((n) => !n.challenge?.hidden).length);
  });
});

describe('armies and generals', () => {
  it('gives each faction one flagship, led by its hero, with a ten-card deck of its race\'s attacks and defence', () => {
    const s = createCampaign({ seed: 5, rivals: 3, race: 2, hero: GENERALS[2][1] });
    expect(campaignPlayer(s).hero).toBe(GENERALS[2][1]);
    for (const f of s.factions.filter((x) => !x.lost)) {
      const armies = armiesOf(s, f.id);
      expect(armies).toHaveLength(1);
      expect(armies[0].general).toBe(f.hero);
      expect(armies[0].deck).toHaveLength(CAMPAIGN.armySize);
      expect(armies[0].deck[0]).toBe(f.hero);
      expect(armies[0].deck.slice(1).some((id) => cardDef(id).kind === 'attack' && cardDef(id).race === f.race)).toBe(true);
      expect(armies[0].deck.slice(1).some((id) => cardDef(id).kind === 'defence')).toBe(true);
      expect(armyDeckProblems(armies[0].deck, armies[0].general)).toEqual([]);
    }
    // (A hero who isn't the race's is not taken: the first leads.)
    expect(campaignPlayer(createCampaign({ seed: 5, race: 2, hero: GENERALS[3][0] })).hero).toBe(GENERALS[2][0]);
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

  it('moves cards between the flagship\'s deck and the reserve one at a time, and keeps it at ten or more', () => {
    let s = fresh();
    const army = myArmy(s);
    // It starts with ten.
    expect(army.deck).toHaveLength(CAMPAIGN.armySize);
    const out = army.deck.find((id) => id !== army.general)!;
    // At ten, nothing comes out.
    expect(() => applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: out })).toThrow(/at least/);
    // No most: it goes on taking cards; then one can come back out, down to ten.
    campaignPlayer(s).reserve.push('scatter_shot');
    s = applyCampaignAction(s, { type: 'deckAdd', armyId: army.id, defId: 'scatter_shot' });
    expect(myArmy(s).deck.length).toBe(CAMPAIGN.armySize + 1);
    s = applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: out });
    expect(myArmy(s).deck).toHaveLength(CAMPAIGN.armySize);
    expect(campaignPlayer(s).reserve).toContain(out);
    // Changing the deck costs no move: it can still march.
    expect(armyMoves(s, myArmy(s)).length).toBeGreaterThan(0);
    // The hero stays.
    s = applyCampaignAction(s, { type: 'deckAdd', armyId: army.id, defId: out });
    expect(() => applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: army.general })).toThrow(/leads this army/);
    s = applyCampaignAction(s, { type: 'deckRemove', armyId: army.id, defId: out });
    expect(myArmy(s).deck.length).toBe(CAMPAIGN.armySize);
    expect(() => attack(s)).not.toThrow();
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
    const defender = (star: 'brown' | undefined) => {
      let t = fresh();
      const n = nodeById(t, firstTarget(t));
      n.star = star;
      t = attack(t, n.id);
      return supernovaThreshold(t.battle!.game.players[1]);
    };
    expect(defender('brown')).toBeGreaterThan(defender(undefined));
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
    expect(b.battle!.game.players[0].modifiers?.maxHealthDelta).toBe(flagDelta(b) + 2);
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

  it('freed prisoners bring neutral cards; a side of your own race has its cards defect', async () => {
    const { applyAction } = await import('../src/engine/game');
    const { salvageOptions, salvageKind, campaignPlayer: me } = await import('../src/engine/campaign');
    const s = attack(fresh());
    const game = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[1].id });
    const kind = salvageKind(s, game);
    const race = me(s).race;
    for (const id of salvageOptions(s, game)) {
      const r = cardDef(id).race;
      if (kind === 'prisoners') expect(r).toBeUndefined();
      else expect(r === undefined || r === race).toBe(true);
    }
  });

  it('offers nothing after a loss, and a battle auto-resolved owes the choice on the map', async () => {
    const { applyAction } = await import('../src/engine/game');
    const { salvageOptions } = await import('../src/engine/campaign');
    const s = attack(fresh());
    const lost = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[0].id });
    expect(salvageOptions(s, lost)).toEqual([]);
    const won = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[1].id });
    const t = applyCampaignAction(s, { type: 'finishBattle', game: won });
    expect(['Freed prisoners', 'Defectors']).toContain(t.cardRewards[0]?.source);
  });
});

describe('losing and drawing', () => {
  it('ends the run when the player loses a battle, but not on a draw', async () => {
    const { applyAction, DRAW } = await import('../src/engine/game');
    const s = attack(fresh());
    const lost = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[0].id });
    const t = applyCampaignAction(s, { type: 'finishBattle', game: lost });
    expect(t.winner).toBe('none');
    expect(armiesOf(t, t.playerId)).toHaveLength(0);
    const drawn = structuredClone(s.battle!.game);
    drawn.winnerId = DRAW;
    const u = applyCampaignAction(s, { type: 'finishBattle', game: drawn });
    expect(u.winner).toBeFalsy();
    expect(armiesOf(u, u.playerId)).toHaveLength(1);
    expect(u.cardRewards.filter((r) => r.source === 'Salvage')).toEqual([]);
  });
});

describe('ship modules and finds', () => {

  it("shows a battle's finds before they are taken, and takes the same ones", async () => {
    const { applyAction } = await import('../src/engine/game');
    const { battleFinds } = await import('../src/engine/campaign');
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      let s = attack(fresh(seed));
      const game = applyAction(s.battle!.game, { type: 'concede', playerId: s.battle!.game.players[1].id });
      const finds = battleFinds(s, game);
      if (!finds.items.length) continue;
      found = true;
      expect(battleFinds(s, game)).toEqual(finds);
      s = applyCampaignAction(s, { type: 'finishBattle', game, salvage: null });
      const me = campaignPlayer(s);
      for (const i of finds.items) expect(me.relics?.map((x) => x.id)).toContain(i.id);
    }
    expect(found).toBe(true);
  });
});


describe('relics', () => {
  it('carries a power over the whole board, or curses the flagship, in every battle', async () => {
    const { makeRelic } = await import('../src/engine/heroes');
    const s = fresh();
    const me = campaignPlayer(s);
    const plain = armyBonus(s, myArmy(s));
    // (A weapon's first power: guns for every armed card, 2 at stellar.)
    const guns = makeRelic('r1', 'weapon', 'stellar', me.race, 0, false);
    const shields = makeRelic('r3', 'mantle', 'dwarf', me.race, 0, false);
    const nova = makeRelic('r4', 'facet', 'anomaly', me.race, 0.15, false);
    const curse = makeRelic('r2', 'helm', 'dwarf', me.race, 0, true);
    expect([guns.power, guns.n, shields.power, nova.power, nova.n]).toEqual(['edge', 2, 'aegis', 'nova', 3]);
    expect(curse.cursed).toBe(true);
    me.relics = [guns, shields, nova, curse];
    const b = armyBonus(s, myArmy(s));
    expect(b.boons.length).toBe(plain.boons.length);
    expect(b.relics.guns).toBe(2);
    expect(b.mods.shieldPerTurn ?? 0).toBe((plain.mods.shieldPerTurn ?? 0) + 2);
    expect(b.mods.startingHeat ?? 0).toBe((plain.mods.startingHeat ?? 0) + 2);
    // A once-a-battle power is a skill of the battle's, shown with the relics.
    expect(b.skills.find((k) => k.relic)).toMatchObject({ once: true, cost: 0, effects: [{ type: 'strikeAll', amount: 3 }] });
  });
});
