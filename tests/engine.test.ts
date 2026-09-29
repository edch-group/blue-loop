import { describe, expect, it } from 'vitest';
import {
  applyAction,
  activePlayer,
  BALANCE,
  cardDef,
  chooseAIAction,
  createGame,
  GameError,
  isGameOver,
  MARKET_CARDS,
  marketCardsFor,
  SOLAR_SYSTEMS,
  supernovaThreshold,
  instabilityHeat,
  availableRewards,
  incomeFor,
  flareHeat,
  marketCost,
  handSizeFor,
  thermoCool,
  flareCost,
  type GameState,
} from '../src/engine';

const twoPlayer = (seed = 1, systems: [string?, string?] = []) =>
  createGame({
    seed,
    players: [
      { name: 'Ada', isAI: false, systemId: systems[0] },
      { name: 'Bo', isAI: false, systemId: systems[1] },
    ],
  });

function playAllMoney(s: GameState) {
  return applyAction(s, { type: 'playAllMoney' });
}

describe('content', () => {
  it('has a 200-card market deck and 8 solar systems', () => {
    expect(MARKET_CARDS.reduce((n, c) => n + c.copies, 0)).toBe(200);
    expect(SOLAR_SYSTEMS).toHaveLength(8);
  });
});

describe('player count', () => {
  it('leaves multi-target cards out of 1v1 games', () => {
    const duel = createGame({ seed: 1, players: [{ name: 'A', isAI: true }, { name: 'B', isAI: true }] });
    const cards = [...duel.marketDeck, ...duel.display].map((c) => c!.defId);
    expect(cards).not.toContain('plasma_barrage');
    expect(cards).toContain('solar_storm'); // hits every sun equally, so fine in 1v1
    const trio = createGame({ seed: 1, players: [1, 2, 3].map((i) => ({ name: `P${i}`, isAI: true })) });
    const trioCards = [...trio.marketDeck, ...trio.display].map((c) => c!.defId);
    expect(trioCards).toContain('plasma_barrage');
    expect(trioCards.length).toBe(200);
  });
});

describe('setup', () => {
  it('deals 9 basic + 1 command, a full display and distinct systems', () => {
    const s = twoPlayer();
    for (const p of s.players) {
      const all = [...p.deck, ...p.hand];
      expect(all.filter((c) => c.defId === 'stardust')).toHaveLength(9);
      expect(all.filter((c) => c.defId === 'command_directive')).toHaveLength(1);
    }
    expect(s.display.filter(Boolean)).toHaveLength(BALANCE.displaySize);
    const twoPlayerDeck = marketCardsFor(2).reduce((n, c) => n + c.copies, 0);
    expect(s.marketDeck).toHaveLength(twoPlayerDeck - BALANCE.displaySize);
    expect(s.players[0].systemId).not.toBe(s.players[1].systemId);
  });

  it('draws a hand only when your turn begins', () => {
    let s = twoPlayer(9, ['midas_belt', 'helios_reach']);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(0); // p2 has not started a turn yet
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[0].hand).toHaveLength(0); // discarded, nothing drawn yet
    expect(s.players[1].hand).toHaveLength(5);
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[0].hand).toHaveLength(5);
  });

  it('numbers log entries so new ones can be told apart', () => {
    const s = twoPlayer(9, ['midas_belt', 'helios_reach']);
    const after = applyAction(s, { type: 'playAllMoney' });
    const lastSeq = s.log[s.log.length - 1].seq;
    const fresh = after.log.filter((l) => l.seq > lastSeq);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((l) => l.text.includes('plays'))).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    expect(twoPlayer(42)).toEqual(twoPlayer(42));
    expect(twoPlayer(42)).not.toEqual(twoPlayer(43));
  });

  it('applies the Cryon Drift starting heat', () => {
    const s = twoPlayer(1, ['midas_belt', 'cryon_drift']);
    expect(s.players[1].heat).toBe(-10); // thaw only starts on its own turn
    expect(s.players[0].heat).toBe(0);
  });
});

describe('money actions', () => {
  it('Solar Flare costs 2 and heats an enemy sun by 1', () => {
    // Aegis Cluster has no weapon bonuses or flare drawback, so a flare is base.
    let s = twoPlayer(3, ['aegis_cluster', 'midas_belt']);
    s = { ...s, players: s.players.map((p) => ({ ...p, shields: 0 })) };
    const moneyBefore = activePlayer(s).money;
    s = playAllMoney(s);
    const gained = activePlayer(s).money - moneyBefore;
    expect(gained).toBeGreaterThanOrEqual(4);
    const before = activePlayer(s).money;
    s = applyAction(s, { type: 'solarFlare', targetId: 'p2' });
    expect(activePlayer(s).money).toBe(before - 2);
    expect(s.players[1].heat).toBe(1);
  });

  it('Thermosiphon cools but never below -10', () => {
    let s = twoPlayer(3, ['midas_belt', 'aegis_cluster']);
    s.players[0].heat = -9;
    s.players[0].money = 10;
    s = applyAction(s, { type: 'thermosiphon' });
    expect(s.players[0].heat).toBe(-10);
    expect(() => applyAction(s, { type: 'thermosiphon' })).toThrow(GameError);
  });

  it('rejects actions without enough money and leaves state untouched', () => {
    const s = twoPlayer(3, ['midas_belt', 'aegis_cluster']);
    s.players[0].money = 1;
    const snapshot = structuredClone(s);
    expect(() => applyAction(s, { type: 'solarFlare', targetId: 'p2' })).toThrow(GameError);
    expect(s).toEqual(snapshot);
  });

  it('shields absorb heat before the sun', () => {
    const s = twoPlayer(3, ['aegis_cluster', 'midas_belt']);
    s.players[0].money = 4;
    s.players[1].shields = 1;
    const after = applyAction(applyAction(s, { type: 'solarFlare', targetId: 'p2' }), { type: 'solarFlare', targetId: 'p2' });
    expect(after.players[1].shields).toBe(0);
    expect(after.players[1].heat).toBe(1);
  });
});

describe('stellar instability', () => {
  it('heats every sun at turn start from the configured round', () => {
    let s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    s.round = BALANCE.instabilityStartsRound;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[1].heat).toBe(1);
  });

  it('stacks: one more heat every round after it starts', () => {
    const s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    s.round = BALANCE.instabilityStartsRound;
    expect(instabilityHeat(s)).toBe(1);
    s.round += 1;
    expect(instabilityHeat(s)).toBe(2);
    s.round += 2;
    expect(instabilityHeat(s)).toBe(4);
  });
});

describe('supernova', () => {
  it('eliminates a sun reaching 10 and ends a 2-player game', () => {
    const s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    s.players[1].heat = 9;
    s.players[1].shields = 0;
    s.players[0].money = 3; // Midas: Solar Flare costs 1 more
    const after = applyAction(s, { type: 'solarFlare', targetId: 'p2' });
    expect(after.players[1].eliminated).toBe(true);
    expect(after.winnerId).toBe('p1');
    expect(isGameOver(after)).toBe(true);
    expect(() => applyAction(after, { type: 'endTurn' })).toThrow(GameError);
  });
});

describe('command cards', () => {
  it('upgrade a chosen planet', () => {
    const s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    const p = s.players[0];
    const card = { uid: 'test-cmd', defId: 'command_directive' };
    p.hand.push(card);
    const planet = p.planets[0];
    const after = applyAction(s, { type: 'playCard', cardUid: card.uid, upgradeId: planet.id });
    expect(after.players[0].planets[0].level).toBe(planet.level + 1);
  });

  it('require a planet choice', () => {
    const s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    s.players[0].hand.push({ uid: 'test-cmd', defId: 'command_directive' });
    expect(() => applyAction(s, { type: 'playCard', cardUid: 'test-cmd' })).toThrow(GameError);
  });

  it('economy upgrades raise turn-start income', () => {
    let s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    s.players[0].hand.push({ uid: 'test-cmd', defId: 'command_directive' });
    s = applyAction(s, { type: 'playCard', cardUid: 'test-cmd', upgradeId: s.players[0].planets[0].id });
    s = applyAction(s, { type: 'endTurn' });
    s = applyAction(s, { type: 'endTurn' });
    // Midas: +1 system bonus, +2 from Aurum now at level 2.
    expect(activePlayer(s).id).toBe('p1');
    expect(activePlayer(s).money).toBe(3);
  });
});

describe('core action upgrades', () => {
  const withCommand = (s: GameState) => {
    s.players[0].hand.push({ uid: `cmd${s.players[0].hand.length}`, defId: 'command_directive' });
    return `cmd${s.players[0].hand.length - 1}`;
  };

  it('Solar Flare takes 3 upgrades, +1 heat each, max 4 heat', () => {
    let s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    s.objectives = []; // keep objective claims out of upgrade tests
    for (let i = 0; i < 3; i++) {
      const uid = withCommand(s);
      s = applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'solarFlare' });
    }
    expect(s.players[0].upgrades.solarFlare).toBe(3);
    const uid = withCommand(s);
    expect(() => applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'solarFlare' })).toThrow(GameError);
    // Each upgrade also costs 1 more: 2 + 3 upgrades + Midas's drawback 1 = 6.
    s.players[0].money = 6;
    s.players[1].shields = 0;
    s = applyAction(s, { type: 'solarFlare', targetId: 'p2' });
    expect(s.players[1].heat).toBe(4);
    expect(s.players[0].money).toBe(0);
  });

  it('Thermosiphon takes 1 upgrade, cooling 2', () => {
    let s = twoPlayer(3, ['obsidian_veil', 'aegis_cluster']); // no cooling drawback
    s.objectives = [];
    const uid = withCommand(s);
    s = applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'thermosiphon' });
    const again = withCommand(s);
    expect(() => applyAction(s, { type: 'playCard', cardUid: again, upgradeId: 'thermosiphon' })).toThrow(GameError);
    s.players[0].money = 2;
    s = applyAction(s, { type: 'thermosiphon' });
    expect(s.players[0].heat).toBe(-2);
  });

  it('Cooling Chamber raises max health by 5 per upgrade, up to 25', () => {
    let s = twoPlayer(3, ['aegis_cluster', 'helios_reach']); // Aegis has no max-health drawback
    s.objectives = []; // keep objective claims out of upgrade tests
    for (let i = 0; i < 3; i++) {
      const uid = withCommand(s);
      s = applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'coolingChamber' });
    }
    expect(supernovaThreshold(s.players[0])).toBe(25);
    const uid = withCommand(s);
    expect(() => applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'coolingChamber' })).toThrow(GameError);
    // A sun at 12 survives with max health 25, but an unupgraded one would not.
    s = applyAction(s, { type: 'endTurn' });
    s.players[1].money = 3; // Helios: first flare each turn costs 1 more
    s.players[0].heat = 11;
    s.players[0].shields = 0;
    s = applyAction(s, { type: 'solarFlare', targetId: 'p1' });
    expect(s.players[0].eliminated).toBe(false);
    expect(s.players[0].heat).toBe(12);
  });

  it('Vulcan Forge starts with two Solar Flare upgrades', () => {
    const s = twoPlayer(3, ['vulcan_forge', 'midas_belt']);
    expect(s.players[0].upgrades).toEqual({ solarFlare: 2, thermosiphon: 0, coolingChamber: 0 });
  });
});

describe('market', () => {
  it('buying moves the card to discard and refills the slot', () => {
    const s = twoPlayer(5, ['midas_belt', 'helios_reach']);
    s.players[0].money = 20;
    const bought = s.display[0]!;
    const after = applyAction(s, { type: 'buyCard', slot: 0 });
    expect(after.players[0].discard.map((c) => c.uid)).toContain(bought.uid);
    expect(after.display[0]).not.toBeNull();
    expect(after.display[0]!.uid).not.toBe(bought.uid);
    expect(after.players[0].money).toBe(20 - cardDef(bought.defId).cost);
  });
});

describe('system draft', () => {
  it('offers each human two systems; AI choose at once; play starts when all have chosen', () => {
    let s = createGame({ seed: 4, draft: true, players: [{ name: 'A', isAI: false }, { name: 'B', isAI: true }] });
    expect(s.phase).toBe('setup');
    expect(s.players[0].systemOffers).toHaveLength(2);
    expect(s.players[1].systemOffers).toBeUndefined();
    expect(s.players[0].hand).toHaveLength(0);
    expect(() => applyAction(s, { type: 'endTurn' })).toThrow(GameError);
    const pick = s.players[0].systemOffers![1];
    s = applyAction(s, { type: 'chooseSystem', systemId: pick });
    expect(s.phase).toBe('play');
    expect(s.players[0].systemId).toBe(pick);
    expect(s.players[0].hand.length).toBe(handSizeFor(s.players[0]));
    expect(new Set(s.players.map((p) => p.systemId)).size).toBe(2);
  });

  it('applies system drawbacks', () => {
    const s = twoPlayer(3, ['nova_crown', 'tempest_binary']);
    expect(supernovaThreshold(s.players[0])).toBe(8);
    expect(supernovaThreshold(s.players[1])).toBe(6);
  });

  it('Cryon Drift thaws by 1 at the start of its turns, until it reaches 4', () => {
    let s = twoPlayer(3, ['aegis_cluster', 'cryon_drift']);
    s.objectives = [];
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[1].heat).toBe(-9);
    s.players[1].heat = 4;
    s = applyAction(applyAction(s, { type: 'endTurn' }), { type: 'endTurn' });
    expect(s.players[1].heat).toBe(4);
  });

  it('Obsidian Veil fixes hand size at 5', () => {
    const s = twoPlayer(3, ['obsidian_veil', 'aegis_cluster']);
    s.players[0].rewards = ['wide_sensors'];
    expect(handSizeFor(s.players[0])).toBe(5);
  });
});

describe('display drift', () => {
  it('discards the leftmost card each round, slides the rest left and refills', () => {
    let s = twoPlayer(5, ['midas_belt', 'helios_reach']);
    const [a, b, c] = s.display.map((x) => x!.uid);
    const next = s.marketDeck[s.marketDeck.length - 1].uid;
    s = applyAction(s, { type: 'endTurn' }); // p2's turn: same round, no drift
    expect(s.display.map((x) => x!.uid)).toEqual([a, b, c]);
    s = applyAction(s, { type: 'endTurn' }); // back to p1: round 2 begins
    expect(s.round).toBe(2);
    expect(s.display.map((x) => x!.uid)).toEqual([b, c, next]);
    expect(s.marketDiscard.map((x) => x.uid)).toEqual([a]);
  });
});

describe('global cards', () => {
  const setup = () => {
    const s = twoPlayer(5, ['obsidian_veil', 'aegis_cluster']);
    s.objectives = [];
    return s;
  };
  const play = (s: GameState, defId: string) => {
    s.players[0].hand.push({ uid: defId, defId });
    return applyAction(s, { type: 'playCard', cardUid: defId });
  };

  it('Solar Storm heats every sun (including the player who played it) for 3 rounds', () => {
    let s = play(setup(), 'solar_storm');
    expect(s.players[0].heat).toBe(0); // no instant effect
    for (let round = 1; round <= 3; round++) {
      s = applyAction(s, { type: 'endTurn' });
      expect(s.players[1].heat).toBe(round);
      s = applyAction(s, { type: 'endTurn' });
      expect(s.players[0].heat).toBe(round);
    }
    expect(s.globals.filter((g) => g.turnsRemaining > 0)).toHaveLength(0);
  });

  it('Magnetic Storm raises every Solar Flare cost equally', () => {
    const s = play(setup(), 'magnetic_storm');
    expect(flareCost(s, s.players[0])).toBe(3);
    expect(flareCost(s, s.players[1])).toBe(3);
  });

  it('only one is active: a new global replaces it', () => {
    let s = play(setup(), 'magnetic_storm');
    s = play(s, 'ice_age');
    expect(s.globals.map((g) => g.id)).toEqual(['iceAge']);
    expect(flareCost(s, s.players[0])).toBe(2);
  });

  it('Trade Boom pays every player the same', () => {
    let s = play(setup(), 'trade_boom');
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[1].money).toBe(incomeFor(s.players[1]) + 1);
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[0].money).toBe(incomeFor(s.players[0]) + 1);
  });

  it('Solar Maximum and Nebula Drift change flare heat and display prices for all', () => {
    let s = play(setup(), 'solar_maximum');
    expect(flareHeat(s.players[0], s)).toBe(2);
    expect(flareHeat(s.players[1], s)).toBe(2);
    s = play(s, 'nebula_drift');
    expect(flareHeat(s.players[1], s)).toBe(1);
    expect(marketCost(s.players[1], 'fleet_command', s)).toBe(cardDef('fleet_command').cost - 1);
  });
});

describe('objectives', () => {
  it('go to the first player to meet them, who then chooses a reward', () => {
    const s = twoPlayer(5, ['aegis_cluster', 'helios_reach']);
    s.objectives = ['deep_freeze'];
    s.objectiveDeck = ['firestorm'];
    s.players[0].heat = -4;
    s.players[0].money = 3; // Aegis: Thermosiphon costs 1 more
    let after = applyAction(s, { type: 'thermosiphon' }); // cools 1 → -5
    expect(after.claimed).toEqual([{ id: 'deep_freeze', playerId: 'p1' }]);
    expect(after.objectives).toEqual(['firestorm']); // replaced from the pool
    expect(after.pendingRewards).toHaveLength(1);
    expect(after.pendingRewards[0].options.length).toBe(3);
    // Nothing else can happen until the reward is chosen.
    expect(() => applyAction(after, { type: 'endTurn' })).toThrow(GameError);
    after.pendingRewards[0].options = ['stellar_mint', 'vent', 'purge'];
    after = applyAction(after, { type: 'chooseReward', reward: 'stellar_mint' });
    expect(after.players[0].rewards).toEqual(['stellar_mint']);
    expect(after.pendingRewards).toHaveLength(0);
  });

  it('cannot be claimed again once taken', () => {
    const s = twoPlayer(5, ['midas_belt', 'helios_reach']);
    s.objectives = ['deep_freeze'];
    s.objectiveDeck = [];
    s.players[0].heat = -6;
    let after = applyAction(s, { type: 'playAllMoney' });
    expect(after.claimed.map((c) => c.playerId)).toEqual(['p1']);
    after = applyAction(after, { type: 'chooseReward', reward: after.pendingRewards[0].options[0], upgradeId: 'solarFlare', slot: 0 });
    after = applyAction(after, { type: 'endTurn' });
    after.players[1].heat = -6;
    after = applyAction(after, { type: 'playAllMoney' });
    expect(after.claimed).toHaveLength(1);
  });

  it('permanent rewards change derived values; each reward only once', () => {
    let s = twoPlayer(5, ['midas_belt', 'helios_reach']);
    const hand = handSizeFor(s.players[0]);
    s.players[0].rewards = ['wide_sensors', 'deep_coolant', 'flare_focus'];
    expect(handSizeFor(s.players[0])).toBe(hand + 1);
    expect(thermoCool(s.players[0])).toBe(2); // 1 + Deep Coolant 1
    expect(flareCost(s, s.players[0])).toBe(2); // 2 + Midas 1 − Flare Focus 1
    s.pendingRewards = [{ playerId: 'p1', source: 'test', options: ['wide_sensors'] }];
    s = applyAction(s, { type: 'chooseReward', reward: 'wide_sensors' });
    expect(availableRewards(s, s.players[0])).not.toContain('wide_sensors');
  });

  it('Command Upgrade reward upgrades immediately', () => {
    let s = twoPlayer(5, ['aegis_cluster', 'helios_reach']);
    s.pendingRewards = [{ playerId: 'p1', source: 'test', options: ['command'] }];
    expect(() => applyAction(s, { type: 'chooseReward', reward: 'command' })).toThrow(GameError);
    s = applyAction(s, { type: 'chooseReward', reward: 'command', upgradeId: 'coolingChamber' });
    expect(supernovaThreshold(s.players[0])).toBe(15);
  });
});

describe('missions', () => {
  it('go in front of you when played and pay out once when met', () => {
    let s = twoPlayer(5, ['midas_belt', 'helios_reach']);
    s.objectives = [];
    s.players[0].hand.push({ uid: 'mis', defId: 'mission_stockpile' });
    s.players[0].money = 0;
    s = applyAction(s, { type: 'playCard', cardUid: 'mis' });
    expect(s.players[0].missions.map((m) => m.uid)).toEqual(['mis']);
    expect(s.pendingRewards).toHaveLength(0);
    s.players[0].money = 8;
    s = applyAction(s, { type: 'playAllMoney' });
    expect(s.players[0].missions).toHaveLength(0);
    expect(s.pendingRewards).toHaveLength(1);
    const all = [...s.players[0].deck, ...s.players[0].hand, ...s.players[0].inPlay, ...s.players[0].discard];
    expect(all.some((c) => c.uid === 'mis')).toBe(false); // removed from the game
  });
});

describe('AI', () => {
  it('plays full 4-player games to completion across many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = createGame({
        seed,
        players: [1, 2, 3, 4].map((i) => ({ name: `AI ${i}`, isAI: true })),
      });
      let steps = 0;
      while (!isGameOver(s)) {
        s = applyAction(s, chooseAIAction(s));
        if (++steps > 20000) throw new Error(`Seed ${seed} did not finish`);
      }
      expect(s.players.filter((p) => !p.eliminated)).toHaveLength(1);
    }
  }, 30000); // 40 full games: allow for a busy machine
});
