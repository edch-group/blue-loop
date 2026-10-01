import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { CARDS, cardDef, copyLimit, deckProblems, PRESET_DECKS } from '../src/engine/cards';
import { activePlayer, applyAction, baseStability, currentPlanet, planetTurnsLeft, turnForecast, cardDefence, createGame, freeSlots, GameError, instabilityHeat, isGameOver, playsAllowed, supernovaThreshold } from '../src/engine/game';
import type { CardInstance, GameState, PlayerState } from '../src/engine/types';

const twoPlayer = (seed = 1) =>
  createGame({ seed, players: [{ name: 'Ada', isAI: false, species: 0 }, { name: 'Bo', isAI: false, species: 1 }] });

let uid = 1000;
/** Put specific cards in a player's hand (or tableau), for testing exact situations. */
function give(p: PlayerState, defIds: string[], where: 'hand' | 'tableau' = 'hand'): CardInstance[] {
  const cards: CardInstance[] = defIds.map((defId) => ({ uid: `t${uid++}`, defId }));
  if (where === 'tableau') {
    // Into the free slots, left to right, at full stability.
    for (const c of cards) {
      c.slot = freeSlots(p)[0];
      c.stability = baseStability(c.defId);
      p.tableau.push(c);
    }
  } else p.hand.push(...cards);
  return cards;
}

/** Play a card by id from the active player's hand. */
function play(s: GameState, defId: string, extra: Record<string, string | number> = {}) {
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

  it('gives every race at least ten cards, with a Stellar hero and an Anomaly, and a legal starter deck', () => {
    for (let race = 0; race < 4; race++) {
      const own = CARDS.filter((c) => c.race === race);
      expect(own.length).toBeGreaterThanOrEqual(10);
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

  it('is 1v1: exactly two players', () => {
    expect(() => createGame({ seed: 1, players: [{ name: 'Solo', isAI: false }] })).toThrow(GameError);
    expect(() => createGame({ seed: 2, players: [0, 1, 2].map((i) => ({ name: `P${i}`, isAI: true })) })).toThrow(GameError);
    expect(twoPlayer().players).toHaveLength(2);
  });

  it('lets either player concede at any time, handing their rival the win', () => {
    const s = twoPlayer();
    const idle = s.players.find((p) => p.id !== activePlayer(s).id)!;
    const next = applyAction(s, { type: 'concede', playerId: idle.id });
    expect(next.winnerId).toBe(activePlayer(s).id);
    expect(next.concededBy).toBe(idle.id);
    expect(isGameOver(next)).toBe(true);
    expect(() => applyAction(next, { type: 'endTurn' })).toThrow(GameError);
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
    // Ada: 1,2,2,2,2,2 · Bo: the same, plus any head start on the first turn
    expect(plays.filter((_, i) => i % 2 === 0)).toEqual([1, 2, 2, 2, 2, 2]);
    expect(plays.filter((_, i) => i % 2 === 1)).toEqual([1 + BALANCE.laterSeatPlays, 2, 2, 2, 2, 2]);
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

  it('refuses a card when the tableau is full (no replacing), but still takes a Lightspeed card', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 2;
    give(me, Array(BALANCE.tableauSlots).fill('coolant_array'), 'tableau');
    give(me, ['cryo_vault', 'null_field']);
    expect(() => play(s, 'cryo_vault')).toThrow(/full/);
    s = play(s, 'null_field');
    expect(s.players[0].lightspeed?.defId).toBe('null_field');
  });

  it('fades cards after their stability runs out, back into the deck, triggering leave effects', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const [martyr] = give(me, ['martyr_crystal'], 'tableau'); // no start-of-turn or passive effect: it fades fast
    const [relay] = give(me, ['plasma_relay'], 'tableau');
    expect(martyr.stability).toBe(BALANCE.stabilityBurst);
    expect(relay.stability).toBe(BALANCE.stability);
    const bo = s.players[1].heat;
    s = endTurn(endTurn(s)); // Ada's turn 2: relay fires, both lose 1
    expect(s.players[0].tableau.map((c) => c.stability)).toEqual([1, 2]);
    s = endTurn(endTurn(s)); // Ada's turn 3: the Martyr fades and bursts
    expect(s.players[0].tableau.map((c) => c.defId)).toEqual(['plasma_relay']);
    expect(s.players[0].deck.some((c) => c.uid === martyr.uid)).toBe(true);
    expect(s.players[1].heat).toBeGreaterThanOrEqual(bo + 2 + 3);
    s = endTurn(endTurn(s)); // Ada's turn 4: the relay fires a third time, then fades
    expect(s.players[0].tableau).toHaveLength(0);
  });

  it('keeps anchored cards from fading, and lets stability be restored or eroded', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 2;
    const [relay, anchor, lance] = give(me, ['plasma_relay', 'chrono_anchor', 'coronal_lance'], 'tableau');
    s = endTurn(endTurn(s));
    const t = s.players[0].tableau;
    expect(t.find((c) => c.uid === relay.uid)!.stability).toBe(BALANCE.stability);
    expect(t.find((c) => c.uid === lance.uid)!.stability).toBe(BALANCE.stabilityBurst);
    give(activePlayer(s), ['stasis_field']);
    s = play(s, 'stasis_field', { allyUid: lance.uid, slot: 3 });
    expect(s.players[0].tableau.find((c) => c.uid === lance.uid)!.stability).toBe(BALANCE.stabilityBurst + 2);
    s = endTurn(s);
    give(activePlayer(s), ['entropy_pulse']);
    // The Anchor itself still fades: 3 → 2, and the pulse takes the last 2.
    s = play(s, 'entropy_pulse', { enemyUid: anchor.uid });
    expect(s.players[0].tableau.some((c) => c.uid === anchor.uid)).toBe(false);
    expect(s.players[0].deck.some((c) => c.uid === anchor.uid)).toBe(true);
  });

  it('lets Ion Cannon destroy a card of your choice in your target\'s tableau', () => {
    let s = twoPlayer();
    const [me, foe] = s.players;
    const [victim] = give(foe, ['bell_warden', 'coolant_array'], 'tableau');
    give(me, ['ion_cannon']);
    expect(() => play(s, 'ion_cannon')).toThrow(GameError);
    s = play(s, 'ion_cannon', { enemyUid: victim.uid });
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
  it('upgrade a core action and stay in the tableau', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['chamber_protocol']);
    const max = supernovaThreshold(s.players[0]);
    s = play(s, 'chamber_protocol');
    expect(s.players[0].tableau.map((c) => c.defId)).toEqual(['chamber_protocol']);
    expect(supernovaThreshold(s.players[0])).toBe(max + BALANCE.coolingChamberHealthPerUpgrade);
  });

  it('upgrade again when recalled and played again', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.turnsTaken = 3;
    me.playsLeft = 3;
    const [cmd] = give(me, ['command_directive'], 'tableau');
    me.upgrades.solarFlare = 1;
    give(me, ['phase_shift']);
    s = play(s, 'phase_shift', { allyUid: cmd.uid });
    expect(s.players[0].hand.some((c) => c.uid === cmd.uid)).toBe(true);
    expect(s.players[0].playsLeft).toBe(3); // Phase Shift gives back the play it used
    s = play(s, 'command_directive', { upgrade: 'solarFlare' });
    expect(s.players[0].upgrades.solarFlare).toBe(2);
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
    // Ada's Overload Core, overheated, hits twice at the start of Ada's turn.
    const ada = s.players[0];
    give(ada, ['overload_core'], 'tableau');
    ada.heat = 16;
    give(s.players[1], ['stinging_veil'], 'tableau');
    s = endTurn(s); // Bo's turn: Bo's shields are up when Ada's turn begins.
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
    give(me, Array(BALANCE.tableauSlots - 2).fill('coolant_array'), 'tableau');
    const before = s.players[1].heat;
    me.playsLeft = 2;
    give(me, ['phase_shift']);
    s = play(s, 'phase_shift', { allyUid: me.tableau[1].uid });
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
    s.players[0].discard = [];
    const before = s.players[0].heat;
    s = endTurn(s);
    expect(s.players[0].heat).toBe(before + BALANCE.drawPerTurn * BALANCE.fatigueHeat);
  });

  it('shuffles the discard pile back in when the deck runs out, for a little heat', () => {
    let s = endTurn(twoPlayer());
    s.players[0].deck = [];
    s.players[0].discard = [{ uid: 'x1', defId: 'coolant_array' }, { uid: 'x2', defId: 'cryo_vault' }, { uid: 'x3', defId: 'coronal_lance' }];
    const before = s.players[0].heat;
    const hand = s.players[0].hand.length;
    s = endTurn(s);
    expect(s.players[0].heat).toBe(before + BALANCE.reshuffleHeat);
    expect(s.players[0].hand.length).toBe(hand + BALANCE.drawPerTurn);
    expect(s.players[0].discard).toHaveLength(0);
    expect(s.players[0].deck).toHaveLength(3 - BALANCE.drawPerTurn);
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

  it('hands your rival the win if you blow up your own sun', () => {
    let s = twoPlayer(3);
    s.players[0].heat = supernovaThreshold(s.players[0]) - 1;
    give(activePlayer(s), ['sunspear']);
    s = play(s, 'sunspear');
    expect(s.players[0].eliminated).toBe(true);
    expect(s.winnerId).toBe('p2');
  });

  it('never mutates the state it is given', () => {
    const s = twoPlayer();
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: 'endTurn' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('AI', () => {
  it('finishes games, and is deterministic', { timeout: 60000 }, () => {
    for (const n of [2]) {
      for (let seed = 1; seed <= 16; seed++) {
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

  it('holds its cards when its tableau is full', () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    give(me, Array(BALANCE.tableauSlots).fill('coolant_array'), 'tableau');
    me.hand = [];
    give(me, ['coronal_lance']);
    expect(chooseAIAction(s).type).toBe('endTurn');
  });
});

describe('resonance', () => {
  it('boosts the cards next to it, and further away for the Anomaly', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['plasma_relay', 'harmonic_singularity', 'plasma_relay', 'plasma_relay'], 'tableau');
    const bo = s.players[1].heat;
    s = endTurn(endTurn(s));
    // Relays at distance 1, 1 and 2 from the Singularity: 1+2, 1+2 and 1+1.
    expect(s.players[1].heat).toBe(bo + 3 + 3 + 2);
  });

  it('lets you choose where a card goes', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['coolant_array', 'cryo_vault'], 'tableau');
    give(me, ['resonance_lattice']);
    expect(() => play(s, 'resonance_lattice', { slot: 1 } as never)).toThrow(/empty slot/);
    s = play(s, 'resonance_lattice', { slot: 3 } as never);
    expect(s.players[0].tableau.map((c) => [c.defId, c.slot])).toEqual([['coolant_array', 0], ['cryo_vault', 1], ['resonance_lattice', 3]]);
  });

  it('counts neighbours of a kind (Tide Pylon)', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['bell_warden', 'tide_pylon', 'coronal_lance'], 'tableau');
    s = endTurn(endTurn(s));
    // Bell Warden 3, Pylon 1 + 1 (one defence neighbour).
    expect(s.players[0].shields).toBe(5);
  });
});

describe('recovery and removal', () => {
  it('recovers a card from the discard pile and fires its recover effect', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const [ember] = give(me, ['ember_shard']);
    me.hand = me.hand.filter((c) => c.uid !== ember.uid);
    me.discard.push(ember);
    give(me, ['salvage_drone']);
    const bo = s.players[1].heat;
    expect(() => play(s, 'salvage_drone')).toThrow(/discard/);
    s = play(s, 'salvage_drone', { recoverUid: ember.uid });
    expect(s.players[0].hand.some((c) => c.uid === ember.uid)).toBe(true);
    expect(s.players[1].heat).toBe(bo + 1);
  });

  it('returns a rival card to its owner hand (Tractor Beam) and only destroys the right kind (Command Breaker)', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.turnsTaken = 2;
    me.playsLeft = 2;
    const [relay, cmd] = give(s.players[1], ['plasma_relay', 'command_directive'], 'tableau');
    give(me, ['tractor_beam', 'command_breaker']);
    expect(() => play(s, 'command_breaker', { enemyUid: relay.uid })).toThrow();
    s = play(s, 'tractor_beam', { enemyUid: relay.uid });
    expect(s.players[1].hand.some((c) => c.uid === relay.uid)).toBe(true);
    s = play(s, 'command_breaker', { enemyUid: cmd.uid });
    expect(s.players[1].tableau).toHaveLength(0);
    expect(s.players[1].discard.some((c) => c.uid === cmd.uid)).toBe(true);
  });

  it('Event Horizon destroys a card and flings its neighbours back to hand', () => {
    let s = twoPlayer();
    const [a, b, c] = give(s.players[1], ['coolant_array', 'plasma_relay', 'cryo_vault'], 'tableau');
    give(activePlayer(s), ['event_horizon']);
    s = play(s, 'event_horizon', { enemyUid: b.uid });
    expect(s.players[1].tableau).toHaveLength(0);
    expect(s.players[1].discard.map((x) => x.uid)).toContain(b.uid);
    expect(s.players[1].hand.map((x) => x.uid)).toEqual(expect.arrayContaining([a.uid, c.uid]));
  });
});

describe('lightspeed', () => {
  it('is set face down, one at a time, without taking a slot', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.turnsTaken = 2;
    me.playsLeft = 2;
    give(me, ['null_field', 'signal_jammer']);
    s = play(s, 'null_field');
    expect(s.players[0].lightspeed?.defId).toBe('null_field');
    expect(s.players[0].tableau).toHaveLength(0);
    expect(s.log.some((l) => l.text.includes('Null Field'))).toBe(false);
    expect(() => play(s, 'signal_jammer')).toThrow(/face down/);
  });

  it('cancels an enemy attack card during their turn (Null Field)', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['null_field']);
    s = play(s, 'null_field');
    s = endTurn(s);
    give(activePlayer(s), ['coronal_lance', 'cryo_vault']);
    const ada = s.players[0].heat;
    s = play(s, 'coronal_lance');
    expect(s.players[0].heat).toBe(ada);
    expect(s.players[0].lightspeed).toBeNull();
    expect(s.players[1].discard.some((c) => c.defId === 'coronal_lance')).toBe(true);
    expect(s.players[1].tableau).toHaveLength(0);
  });

  it('ignores cards of other kinds, and springs on heat (Riptide Ambushers)', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['riptide_ambush']);
    s = play(s, 'riptide_ambush');
    s = endTurn(s);
    const bo = activePlayer(s);
    bo.playsLeft = 2;
    give(bo, ['gravity_sling', 'sunspear']);
    const ada = s.players[0].heat;
    s = play(s, 'gravity_sling'); // only 1 heat: not enough to spring it
    expect(s.players[0].heat).toBe(ada + 1);
    const boHeat = s.players[1].heat;
    s = play(s, 'sunspear');
    expect(s.players[0].heat).toBe(ada + 1);
    expect(s.players[1].heat).toBe(boHeat + 2 + 2); // Sunspear's own recoil, plus the ambush
  });

  it('protects your cards from removal (Decoy Array)', () => {
    let s = twoPlayer();
    const [keep] = give(activePlayer(s), ['coolant_array'], 'tableau');
    give(activePlayer(s), ['decoy_array']);
    s = play(s, 'decoy_array');
    s = endTurn(s);
    give(activePlayer(s), ['ion_cannon']);
    s = play(s, 'ion_cannon', { enemyUid: keep.uid });
    expect(s.players[0].tableau.map((c) => c.uid)).toContain(keep.uid);
    expect(s.players[0].lightspeed).toBeNull();
  });

  it('stops the enemy playing more cards (Temporal Snare)', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['temporal_snare']);
    s = play(s, 'temporal_snare');
    s = endTurn(s);
    const bo = activePlayer(s);
    bo.playsLeft = 3;
    give(bo, ['coolant_array']);
    s = play(s, 'coolant_array');
    expect(s.players[1].playsLeft).toBe(0);
    expect(s.players[1].tableau).toHaveLength(0);
  });
});

describe('defence', () => {
  it('comes from the slot (1, 2, 3, 2, 1), sturdiness and bulwarks', () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    const cards = give(me, ['coolant_array', 'bulwark_plating', 'bell_warden', 'coolant_array', 'coolant_array'], 'tableau');
    // The Plating (slot 1) guards both neighbours: slot 0 gets +1, and slot 2 (Bell Warden, sturdy +1) too.
    expect(cards.map((c) => cardDefence(me, c))).toEqual([1 + 1, 2, 3 + 1 + 1, 2, 1]);
  });

  it('limits what removal can reach (Ion Cannon: 2 or less)', () => {
    let s = twoPlayer();
    const foe = s.players[1];
    const [edge, inner, centre] = give(foe, ['coolant_array', 'coolant_array', 'plasma_relay'], 'tableau');
    centre.slot = 2;
    give(activePlayer(s), ['ion_cannon']);
    expect(() => play(s, 'ion_cannon', { enemyUid: centre.uid })).toThrow();
    s = play(s, 'ion_cannon', { enemyUid: inner.uid });
    expect(s.players[1].tableau.map((c) => c.uid)).toEqual([edge.uid, centre.uid]);
  });
});

describe('turn forecast', () => {
  it("adds up a player's start-of-turn effects, and matches what then happens", () => {
    let s = twoPlayer();
    const ada = activePlayer(s);
    give(ada, ['plasma_relay', 'mycelium_tower', 'bell_warden', 'coolant_array'], 'tableau');
    ada.tableau[1].growth = 1;
    ada.heat = 5;
    const f = turnForecast(s, ada);
    // Relay 1, Tower grows to 2 then heats 2; Warden 3 shields; Array cools 1.
    expect(f).toMatchObject({ heat: 3, targetId: 'p2', shields: 3, cool: 1, selfHeat: 0, draw: 0 });
    const bo = s.players[1].heat;
    s = endTurn(endTurn(s));
    expect(s.players[1].heat).toBe(bo + 3);
    expect(s.players[0].shields).toBe(3);
    expect(s.players[0].heat).toBe(4);
  });
});

describe('orbit', () => {
  /** End turns until it is player `id`'s turn again. */
  const nextTurnOf = (s: GameState, id: string) => {
    do s = applyAction(s, { type: 'endTurn' });
    while (activePlayer(s).id !== id);
    return s;
  };

  it('brings each planet round for three turns: dead, abundant (+1 draw), industrial (+1 play)', () => {
    let s = twoPlayer();
    const id = activePlayer(s).id;
    const seen: string[] = [];
    for (let t = 0; t < 10; t++) {
      const me = activePlayer(s);
      seen.push(currentPlanet(me));
      if (t === 0) expect(planetTurnsLeft(me)).toBe(3);
      s = nextTurnOf(s, id);
    }
    expect(seen).toEqual(['dead', 'dead', 'dead', 'abundant', 'abundant', 'abundant', 'industrial', 'industrial', 'industrial', 'dead']);
  });

  it('draws an extra card at the abundant planet and plays an extra one at the industrial planet', () => {
    let s = twoPlayer();
    const id = activePlayer(s).id;
    const me = () => s.players.find((p) => p.id === id)!;
    me().orbit = 2; // the dead planet's last turn: next turn the abundant planet comes round
    me().hand = [];
    s = nextTurnOf(s, id);
    expect(currentPlanet(me())).toBe('abundant');
    expect(me().hand.length).toBe(BALANCE.drawPerTurn + BALANCE.abundantDraw);
    me().orbit = 5;
    s = nextTurnOf(s, id);
    expect(currentPlanet(me())).toBe('industrial');
    expect(me().playsLeft).toBe(BALANCE.maxPlays + BALANCE.industrialPlays);
  });

  it('lets cards move your orbit or your rival\'s, and wraps round', () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    const rival = s.players.find((p) => p.id !== me.id)!;
    give(me, ['orbital_slingshot', 'tidal_brake']);
    const a = applyAction(s, { type: 'playCard', cardUid: me.hand.at(-2)!.uid });
    expect(currentPlanet(activePlayer(a))).toBe('abundant'); // +3 from the dead planet's first turn
    const b = applyAction(s, { type: 'playCard', cardUid: me.hand.at(-1)!.uid });
    expect(b.players.find((p) => p.id === rival.id)!.orbit).toBe(7); // −2 from 0 wraps to the industrial planet
  });

  it('counts the planet in conditions and forecasts', () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['perihelion_forge'], 'tableau');
    me.turnsTaken = 2;
    me.orbit = 5; // next turn: industrial
    const f = turnForecast(s, me);
    expect(f.planet).toBe('industrial');
    expect(f.plays).toBe(BALANCE.industrialPlays);
    expect(f.heat).toBeGreaterThanOrEqual(3);
  });
});
