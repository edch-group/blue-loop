import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { CARDS, cardDef, copyLimit, deckProblems, PRESET_DECKS } from '../src/engine/cards';
import { activePlayer, applyAction, createGame, GameError, instabilityHeat, isGameOver, playsAllowed, supernovaThreshold } from '../src/engine/game';
import type { CardInstance, GameState, PlayerState } from '../src/engine/types';

const twoPlayer = (seed = 1) =>
  createGame({ seed, players: [{ name: 'Ada', isAI: false, species: 0 }, { name: 'Bo', isAI: false, species: 1 }] });

let uid = 1000;
/** Put specific cards in a player's hand (or tableau), for testing exact situations. */
function give(p: PlayerState, defIds: string[], where: 'hand' | 'tableau' = 'hand'): CardInstance[] {
  const cards = defIds.map((defId) => ({ uid: `t${uid++}`, defId }));
  p[where].push(...cards);
  return cards;
}

/** Play a card by id from the active player's hand. */
function play(s: GameState, defId: string, extra: Record<string, string> = {}) {
  const card = activePlayer(s).hand.find((c) => c.defId === defId);
  if (!card) throw new Error(`${defId} not in hand`);
  return applyAction(s, { type: 'playCard', cardUid: card.uid, ...extra });
}

const endTurn = (s: GameState) => applyAction(s, { type: 'endTurn' });

describe('content', () => {
  it('has unique card ids, and every card has rules text', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) expect(c.text.length).toBeGreaterThan(5);
  });

  it('gives every race eight cards, with a Stellar hero and an Anomaly, and a legal starter deck', () => {
    for (let race = 0; race < 4; race++) {
      const own = CARDS.filter((c) => c.race === race);
      expect(own).toHaveLength(8);
      expect(own.filter((c) => c.rarity === 'anomaly' && c.character)).toHaveLength(1);
      expect(own.some((c) => c.character)).toBe(true);
    }
    for (const d of PRESET_DECKS) expect(deckProblems(d.cards)).toEqual([]);
  });

  it('rejects decks of the wrong size, too many copies, or the wrong number of Commands', () => {
    const good = PRESET_DECKS[0].cards;
    expect(deckProblems(good.slice(1))).not.toEqual([]);
    expect(deckProblems([...good.slice(0, 17), 'plasma_relay', 'plasma_relay', 'plasma_relay'].slice(0, 20))).not.toEqual([]);
    const noCommands = [...good.filter((id) => cardDef(id).kind !== 'command'), 'coolant_array', 'cryo_vault'];
    expect(deckProblems(noCommands).some((p) => p.includes('Command'))).toBe(true);
  });

  it('allows only one copy of an Anomaly', () => {
    // A legal deck of 18 plain cards and 2 Commands, with two of its cards swapped for an Anomaly.
    const deck = [...Array(9).fill(0).flatMap((_, i) => ['plasma_relay', 'coronal_lance', 'gravity_sling', 'thermal_exchange', 'coolant_array', 'cryo_vault', 'deflector_grid', 'heat_sink', 'deep_scanners'].slice(i, i + 1).flatMap((id) => [id, id])), 'command_directive', 'command_directive'];
    expect(deckProblems(deck)).toEqual([]);
    const one = [...deck.slice(0, 17), 'aurelia_first_light', ...deck.slice(18)];
    expect(deckProblems(one)).toEqual([]);
    const two = [...deck.slice(0, 16), 'aurelia_first_light', 'aurelia_first_light', ...deck.slice(18)];
    expect(deckProblems(two).some((p) => p.includes('Anomaly'))).toBe(true);
    expect(copyLimit('aurelia_first_light')).toBe(1);
    expect(copyLimit('plasma_relay')).toBe(BALANCE.maxCopies);
  });
});

describe('setup', () => {
  it('deals opening hands, sets targets and starts the first turn', () => {
    const s = twoPlayer();
    const [a, b] = s.players;
    expect(a.deck.length + a.hand.length).toBe(BALANCE.deckSize);
    expect(a.hand).toHaveLength(BALANCE.openingHand);
    expect(b.hand).toHaveLength(BALANCE.openingHand + BALANCE.laterSeatCards);
    expect(a.targetId).toBe(b.id);
    expect(b.targetId).toBe(a.id);
    expect(activePlayer(s).id).toBe(a.id);
    expect(a.playsLeft).toBe(1);
    expect(b.heat).toBe(BALANCE.startingHeat - BALANCE.laterSeatCool);
  });

  it('accepts 2 to 4 players and nothing else', () => {
    expect(() => createGame({ seed: 1, players: [{ name: 'Solo', isAI: false }] })).toThrow(GameError);
    const four = createGame({ seed: 2, players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, isAI: true })) });
    expect(four.players.map((p) => p.species)).toEqual([0, 1, 2, 3]);
    // No catch-up in bigger games.
    expect(four.players[1].heat).toBe(BALANCE.startingHeat);
  });
});

describe('plays per turn', () => {
  it('grows by one each turn up to the cap, with a head start for the second seat', () => {
    let s = twoPlayer();
    const plays: number[] = [];
    for (let t = 0; t < 12; t++) {
      plays.push(activePlayer(s).playsLeft);
      s = endTurn(s);
    }
    // Ada: 1,2,3,4,4,4 · Bo: 2 (1 + head start),2,3,4,4,4
    expect(plays.filter((_, i) => i % 2 === 0)).toEqual([1, 2, 3, 4, 4, 4]);
    expect(plays.filter((_, i) => i % 2 === 1)).toEqual([1 + BALANCE.laterSeatPlays, 2, 3, 4, 4, 4]);
  });

  it('refuses a play once none are left', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['coolant_array', 'coolant_array']);
    s = play(s, 'coolant_array');
    expect(() => play(s, 'coolant_array')).toThrow(GameError);
  });

  it('lets Hive Relay add a play', () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    me.turnsTaken = 2;
    give(me, ['hive_relay'], 'tableau');
    expect(playsAllowed(s, me)).toBe(3);
  });
});

describe('the tableau', () => {
  it('keeps played cards in front of you and fires their start-of-turn effects', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['plasma_relay']);
    s = play(s, 'plasma_relay');
    expect(s.players[0].tableau.map((c) => c.defId)).toEqual(['plasma_relay']);
    const before = s.players[1].heat;
    s = endTurn(endTurn(s)); // Bo's turn, then Ada's again: the relay fires.
    expect(s.players[1].heat).toBe(before + 1);
  });

  it('makes you replace a card when the tableau is full, triggering its leave effect', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['martyr_crystal'], 'tableau');
    give(me, Array(BALANCE.tableauSlots - 1).fill('coolant_array'), 'tableau');
    give(me, ['cryo_vault']);
    expect(() => play(s, 'cryo_vault')).toThrow(/full/);
    const martyr = me.tableau[0];
    const before = s.players[1].heat;
    s = play(s, 'cryo_vault', { replaceUid: martyr.uid });
    expect(s.players[0].tableau).toHaveLength(BALANCE.tableauSlots);
    expect(s.players[0].discard.map((c) => c.uid)).toContain(martyr.uid);
    expect(s.players[1].heat).toBe(before + 3);
  });

  it('lets Ion Cannon destroy a card of your choice in your target\'s tableau', () => {
    let s = twoPlayer();
    const [me, foe] = s.players;
    const [victim] = give(foe, ['bell_warden', 'coolant_array'], 'tableau');
    give(me, ['ion_cannon']);
    expect(() => play(s, 'ion_cannon')).toThrow(GameError);
    s = play(s, 'ion_cannon', { destroyUid: victim.uid });
    expect(s.players[1].tableau.map((c) => c.defId)).toEqual(['coolant_array']);
    expect(s.players[1].discard.map((c) => c.uid)).toContain(victim.uid);
  });

  it('allows only one global card on the table', () => {
    let s = twoPlayer();
    give(s.players[1], ['ice_age'], 'tableau');
    give(activePlayer(s), ['solar_storm']);
    s = play(s, 'solar_storm');
    expect(s.players[1].tableau).toHaveLength(0);
    expect(s.players[0].tableau.map((c) => c.defId)).toEqual(['solar_storm']);
  });
});

describe('commands', () => {
  it('upgrade a core action without taking a tableau slot', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['chamber_protocol']);
    const max = supernovaThreshold(s.players[0]);
    s = play(s, 'chamber_protocol');
    expect(s.players[0].tableau).toHaveLength(0);
    expect(s.players[0].commands.map((c) => c.defId)).toEqual(['chamber_protocol']);
    expect(supernovaThreshold(s.players[0])).toBe(max + BALANCE.coolingChamberHealthPerUpgrade);
  });

  it('let Command Directive choose, and require a choice', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['command_directive']);
    expect(() => play(s, 'command_directive')).toThrow(/upgrade/);
    s = play(s, 'command_directive', { upgrade: 'thermosiphon' });
    expect(s.players[0].upgrades.thermosiphon).toBe(1);
  });

  it('Solar Flare upgrades add heat to attack cards only; Thermosiphon adds cooling', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.upgrades.solarFlare = 1;
    me.upgrades.thermosiphon = 1;
    me.heat = 5;
    me.turnsTaken = 3;
    me.playsLeft = 3;
    give(me, ['coronal_lance', 'cryo_vault']);
    const before = s.players[1].heat;
    s = play(s, 'coronal_lance');
    expect(s.players[1].heat).toBe(before + 3 + 1);
    s = play(s, 'cryo_vault');
    expect(s.players[0].heat).toBe(5 - 3 - 1);
  });
});

describe('synergies', () => {
  it('Focusing Array boosts other attack cards at the start of your turn; copies do not stack', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['focusing_array', 'focusing_array', 'plasma_relay'], 'tableau');
    const start = s.players[1].heat;
    s = endTurn(endTurn(s));
    expect(s.players[1].heat).toBe(start + 1 + 1);
  });

  it('Mycelium Tower grows each turn and hits harder', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['mycelium_tower'], 'tableau');
    const start = s.players[1].heat;
    s = endTurn(endTurn(s));
    expect(s.players[1].heat).toBe(start + 1);
    s = endTurn(endTurn(s));
    expect(s.players[1].heat).toBe(start + 1 + 2);
  });

  it('shields absorb enemy heat and fade at the start of your turn, unless Deep Current holds them', () => {
    let s = twoPlayer();
    s.players[1].shields = 2;
    give(activePlayer(s), ['coronal_lance']);
    const before = s.players[1].heat;
    s = play(s, 'coronal_lance');
    expect(s.players[1].shields).toBe(0);
    expect(s.players[1].heat).toBe(before + 1);
    s.players[1].shields = 3;
    s = endTurn(s);
    expect(s.players[1].shields).toBe(0);
    s = endTurn(s);
    give(s.players[1], ['deep_current'], 'tableau');
    s.players[1].shields = 3;
    s = endTurn(s);
    expect(s.players[1].shields).toBe(3);
  });

  it('Stinging Veil stings each attacking card once per turn', () => {
    let s = twoPlayer();
    // Ada's Overload Core, overheated, hits twice at the start of her turn.
    const ada = s.players[0];
    give(ada, ['overload_core'], 'tableau');
    ada.heat = 16;
    give(s.players[1], ['stinging_veil'], 'tableau');
    s = endTurn(s); // Bo's turn: his shields are up when Ada's turn begins.
    s.players[1].shields = 10;
    s = endTurn(s);
    expect(s.players[1].shields).toBe(10 - 2 - 1);
    expect(s.players[0].heat).toBe(16 + 2);
    // Two different cards each get stung.
    const me = activePlayer(s);
    me.playsLeft = 2;
    give(me, ['coronal_lance', 'coronal_lance']);
    s = play(s, 'coronal_lance');
    s = play(s, 'coronal_lance');
    expect(s.players[0].heat).toBe(16 + 2 + 2 + 2);
  });
});

describe('the new heroes', () => {
  it("Kyr'Vessa strikes when another of your cards leaves play", () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['kyrvessa_prism_queen'], 'tableau');
    give(me, Array(BALANCE.tableauSlots - 1).fill('coolant_array'), 'tableau');
    give(me, ['cryo_vault']);
    const before = s.players[1].heat;
    s = play(s, 'cryo_vault', { replaceUid: me.tableau[1].uid });
    expect(s.players[1].heat).toBe(before + 2);
  });

  it('Ommarath cools your sun when your shields absorb a hit', () => {
    let s = twoPlayer();
    const foe = s.players[1];
    give(foe, ['ommarath_deep_bell'], 'tableau');
    foe.shields = 5;
    foe.heat = 4;
    give(activePlayer(s), ['coronal_lance']);
    s = play(s, 'coronal_lance');
    expect(s.players[1].shields).toBe(2);
    expect(s.players[1].heat).toBe(3);
  });

  it('the Brood-Tender makes your other growing cards grow', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['mycelium_tower', 'ixquor_brood_tender'], 'tableau');
    s = endTurn(endTurn(s));
    expect(s.players[0].tableau[0].growth).toBe(2);
  });
});

describe('the end', () => {
  it('heats a sun drawing from an empty deck', () => {
    let s = endTurn(twoPlayer()); // Bo's first turn: the opening hand covers it.
    s.players[0].deck = [];
    const before = s.players[0].heat;
    s = endTurn(s);
    expect(s.players[0].heat).toBe(before + BALANCE.drawPerTurn * BALANCE.fatigueHeat);
  });

  it('ramps up stellar instability late in the game', () => {
    const s = twoPlayer();
    s.round = BALANCE.instabilityStartsRound - 1;
    expect(instabilityHeat(s)).toBe(0);
    s.round = BALANCE.instabilityStartsRound + 2;
    expect(instabilityHeat(s)).toBe(3);
  });

  it('ends the game when a sun goes supernova', () => {
    let s = twoPlayer();
    s.players[1].heat = supernovaThreshold(s.players[1]) - 2;
    give(activePlayer(s), ['coronal_lance']);
    s = play(s, 'coronal_lance');
    expect(isGameOver(s)).toBe(true);
    expect(s.winnerId).toBe('p1');
    expect(() => endTurn(s)).toThrow(GameError);
  });

  it('passes the turn on if you blow up your own sun', () => {
    let s = createGame({ seed: 3, players: [0, 1, 2].map((i) => ({ name: `P${i}`, isAI: false })) });
    s.players[0].heat = supernovaThreshold(s.players[0]) - 1;
    give(activePlayer(s), ['sunspear']);
    s = play(s, 'sunspear');
    expect(s.players[0].eliminated).toBe(true);
    expect(activePlayer(s).id).toBe('p2');
  });

  it('never mutates the state it is given', () => {
    const s = twoPlayer();
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: 'endTurn' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('AI', () => {
  it('finishes games for 2, 3 and 4 players, and is deterministic', { timeout: 60000 }, () => {
    for (const n of [2, 3, 4]) {
      for (let seed = 1; seed <= 6; seed++) {
        const run = () => {
          let s = createGame({ seed, players: Array.from({ length: n }, (_, i) => ({ name: `AI ${i}`, isAI: true })) });
          let steps = 0;
          while (!isGameOver(s) && steps++ < 3000) s = applyAction(s, chooseAIAction(s));
          return s;
        };
        const a = run();
        expect(isGameOver(a)).toBe(true);
        expect(a.round).toBeLessThan(25);
        expect(run().winnerId).toBe(a.winnerId);
      }
    }
  });

  it('picks a target and a card to replace when its tableau is full', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, Array(BALANCE.tableauSlots).fill('coolant_array'), 'tableau');
    me.hand = [];
    give(me, ['coronal_lance']);
    const action = chooseAIAction(s);
    expect(action.type).toBe('playCard');
    if (action.type === 'playCard') expect(action.replaceUid).toBeDefined();
    s = applyAction(s, action);
    expect(s.players[0].tableau.some((c) => c.defId === 'coronal_lance')).toBe(true);
  });
});
