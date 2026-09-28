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
  SOLAR_SYSTEMS,
  supernovaThreshold,
  availableRewards,
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

describe('setup', () => {
  it('deals 9 basic + 1 command, a full display and distinct systems', () => {
    const s = twoPlayer();
    for (const p of s.players) {
      const all = [...p.deck, ...p.hand];
      expect(all.filter((c) => c.defId === 'stardust')).toHaveLength(9);
      expect(all.filter((c) => c.defId === 'command_directive')).toHaveLength(1);
    }
    expect(s.display.filter(Boolean)).toHaveLength(BALANCE.displaySize);
    expect(s.marketDeck).toHaveLength(200 - BALANCE.displaySize);
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

  it('is deterministic for a given seed', () => {
    expect(twoPlayer(42)).toEqual(twoPlayer(42));
    expect(twoPlayer(42)).not.toEqual(twoPlayer(43));
  });

  it('applies the Cryon Drift starting heat', () => {
    const s = twoPlayer(1, ['cryon_drift', 'midas_belt']);
    expect(s.players[0].heat).toBe(-3);
    expect(s.players[1].heat).toBe(0);
  });
});

describe('money actions', () => {
  it('Solar Flare costs 2 and heats an enemy sun by 1', () => {
    // Midas Belt has no weapon bonuses, so a flare deals base heat.
    let s = twoPlayer(3, ['midas_belt', 'aegis_cluster']);
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
    const s = twoPlayer(3, ['midas_belt', 'aegis_cluster']);
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
});

describe('supernova', () => {
  it('eliminates a sun reaching 10 and ends a 2-player game', () => {
    const s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    s.players[1].heat = 9;
    s.players[1].shields = 0;
    s.players[0].money = 2;
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
    for (let i = 0; i < 3; i++) {
      const uid = withCommand(s);
      s = applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'solarFlare' });
    }
    expect(s.players[0].upgrades.solarFlare).toBe(3);
    const uid = withCommand(s);
    expect(() => applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'solarFlare' })).toThrow(GameError);
    s.players[0].money = 2;
    s.players[1].shields = 0;
    s = applyAction(s, { type: 'solarFlare', targetId: 'p2' });
    expect(s.players[1].heat).toBe(4);
  });

  it('Thermosiphon takes 1 upgrade, cooling 2', () => {
    let s = twoPlayer(3, ['midas_belt', 'aegis_cluster']);
    const uid = withCommand(s);
    s = applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'thermosiphon' });
    const again = withCommand(s);
    expect(() => applyAction(s, { type: 'playCard', cardUid: again, upgradeId: 'thermosiphon' })).toThrow(GameError);
    s.players[0].money = 2;
    s = applyAction(s, { type: 'thermosiphon' });
    expect(s.players[0].heat).toBe(-2);
  });

  it('Cooling Chamber raises max health by 5 per upgrade, up to 25', () => {
    let s = twoPlayer(3, ['midas_belt', 'helios_reach']);
    for (let i = 0; i < 3; i++) {
      const uid = withCommand(s);
      s = applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'coolingChamber' });
    }
    expect(supernovaThreshold(s.players[0])).toBe(25);
    const uid = withCommand(s);
    expect(() => applyAction(s, { type: 'playCard', cardUid: uid, upgradeId: 'coolingChamber' })).toThrow(GameError);
    // A sun at 12 survives with max health 25, but an unupgraded one would not.
    s = applyAction(s, { type: 'endTurn' });
    s.players[1].money = 2;
    s.players[0].heat = 11;
    s.players[0].shields = 0;
    s = applyAction(s, { type: 'solarFlare', targetId: 'p1' });
    expect(s.players[0].eliminated).toBe(false);
    expect(s.players[0].heat).toBe(12);
  });

  it('Vulcan Forge starts with one Solar Flare upgrade', () => {
    const s = twoPlayer(3, ['vulcan_forge', 'midas_belt']);
    expect(s.players[0].upgrades).toEqual({ solarFlare: 1, thermosiphon: 0, coolingChamber: 0 });
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

describe('global effects', () => {
  it('Solar Storm heats each enemy once over the next round', () => {
    const s = twoPlayer(5, ['midas_belt', 'helios_reach']);
    s.players[0].hand.push({ uid: 'storm', defId: 'solar_storm' });
    let after = applyAction(s, { type: 'playCard', cardUid: 'storm' });
    after = applyAction(after, { type: 'endTurn' }); // Bo's turn: storm hits
    expect(after.players[1].heat).toBe(1);
    after = applyAction(after, { type: 'endTurn' }); // Ada's turn: expires
    expect(after.players[0].heat).toBe(0);
    expect(after.globals).toHaveLength(0);
    after = applyAction(after, { type: 'endTurn' });
    expect(after.players[1].heat).toBe(1);
  });

  it('Magnetic Storm raises enemy flare cost during their turn', () => {
    const s = twoPlayer(5, ['midas_belt', 'helios_reach']);
    s.players[0].hand.push({ uid: 'mag', defId: 'magnetic_storm' });
    let after = applyAction(s, { type: 'playCard', cardUid: 'mag' });
    after = applyAction(after, { type: 'endTurn' });
    after.players[1].money = 3;
    after = applyAction(after, { type: 'solarFlare', targetId: 'p1' });
    expect(after.players[1].money).toBe(0);
  });
});

describe('objectives', () => {
  it('go to the first player to meet them, who then chooses a reward', () => {
    const s = twoPlayer(5, ['midas_belt', 'helios_reach']);
    s.objectives = ['deep_freeze'];
    s.objectiveDeck = ['firestorm'];
    s.players[0].heat = -4;
    s.players[0].money = 2;
    let after = applyAction(s, { type: 'thermosiphon' }); // Helios is p2; Midas cools 1 → -5
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
    expect(thermoCool(s.players[0])).toBe(2);
    expect(flareCost(s, s.players[0])).toBe(1);
    s.pendingRewards = [{ playerId: 'p1', source: 'test', options: ['wide_sensors'] }];
    s = applyAction(s, { type: 'chooseReward', reward: 'wide_sensors' });
    expect(availableRewards(s, s.players[0])).not.toContain('wide_sensors');
  });

  it('Command Upgrade reward upgrades immediately', () => {
    let s = twoPlayer(5, ['midas_belt', 'helios_reach']);
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
  });
});
