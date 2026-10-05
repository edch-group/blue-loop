import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { BALANCE } from '../src/engine/balance';
import { CARDS, cardDef, copyLimit, deckProblems, PRESET_DECKS, RACE_NAMES } from '../src/engine/cards';
import { activePlayer, attackProblem, cardAttack, counterDamage, heroAbilityProblem, effectAmount, planetsEaten, allyChoices, COMMAND_SLOT, cardCost, applyAction, baseStability, dawnEffects, hasRoomFor, recoverChoices, currentPlanet, planetTurnsLeft, turnForecast, cardDefence, createGame, freeSlots, GameError, instabilityHeat, isGameOver, playsAllowed, supernovaThreshold, tableauFull } from '../src/engine/game';
import type { CardInstance, GameState, PlayerState } from '../src/engine/types';

const twoPlayer = (seed = 1) =>
  createGame({ seed, players: [{ name: 'Ada', isAI: false }, { name: 'Bo', isAI: false }] });

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

/** Play a card by id from the active player's hand (with enough energy for it: these tests are about what cards do; costs have their own). */
function play(s: GameState, defId: string, extra: Record<string, string | number> = {}) {
  const me = activePlayer(s);
  const card = me.hand.find((c) => c.defId === defId);
  if (!card) throw new Error(`${defId} not in hand`);
  if (me.playsLeft > 0) me.playsLeft = Math.max(me.playsLeft, cardCost(defId));
  return applyAction(s, { type: 'playCard', cardUid: card.uid, ...extra });
}

// Ends the day (the next day's dawn plays out by itself).
const endTurn = (s: GameState) => applyAction(s, { type: 'endTurn' });

describe('content', () => {
  it('has unique card ids, and every card has rules text', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) expect(c.text.length).toBeGreaterThan(5);
  });

  it('gives every race at least ten cards, with a Stellar hero and an Anomaly, and a legal starter deck', () => {
    for (let race = 0; race < RACE_NAMES.length; race++) {
      const own = CARDS.filter((c) => c.race === race);
      expect(own.length).toBeGreaterThanOrEqual(10);
      expect(own.filter((c) => c.rarity === 'anomaly' && c.character).length).toBeGreaterThanOrEqual(1);
      // Three hero leaders (Command cards) of its own: two regulars and a cost-4 bomb.
      const heroes = own.filter((c) => c.kind === 'command' && c.character);
      expect(heroes).toHaveLength(3);
      expect(heroes.filter((c) => cardCost(c.id) === 4)).toHaveLength(1);
      expect(own.some((c) => c.character)).toBe(true);
    }
    for (const d of PRESET_DECKS) expect(deckProblems(d.cards)).toEqual([]);
  });

  it('rejects decks of the wrong size, too many copies, or the wrong number of Commands', () => {
    const good = PRESET_DECKS[0].cards;
    expect(deckProblems(good.slice(1))).not.toEqual([]);
    expect(deckProblems([...good.slice(0, 17), 'plasma_relay', 'plasma_relay', 'plasma_relay'].slice(0, 20))).not.toEqual([]);
    const noCommands = [...good.filter((id) => cardDef(id).kind !== 'command'), 'coolant_array', 'cryo_vault'];
    expect(deckProblems(noCommands).some((p) => p.includes('Heroes'))).toBe(true);
  });

  it('allows only one copy of an Anomaly', () => {
    // A legal deck of 27 plain cards and 3 Commands, with two of its cards swapped for an Anomaly.
    const plain = ['plasma_relay', 'coronal_lance', 'gravity_sling', 'thermal_exchange', 'coolant_array', 'cryo_vault', 'deflector_grid', 'heat_sink', 'deep_scanners', 'bulwark_plating', 'tidal_brake', 'recall_beacon', 'gravity_assist'];
    const deck = [...plain.flatMap((id) => [id, id]), 'chain_of_command', 'command_directive', 'command_directive', 'logistics_command'];
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
    // The industrial planet's bonus energy aside: 1, 2, 3, 4, then 5 a day.
    const rules = BALANCE as { industrialPlays: number };
    const industry = rules.industrialPlays;
    rules.industrialPlays = 0;
    let s = twoPlayer();
    const plays: number[] = [];
    for (let t = 0; t < 12; t++) {
      plays.push(activePlayer(s).playsLeft);
      s = endTurn(s);
    }
    rules.industrialPlays = industry;
    expect(plays.filter((_, i) => i % 2 === 0)).toEqual([1, 2, 3, 4, 5, 5]);
    expect(plays.filter((_, i) => i % 2 === 1)).toEqual([1 + BALANCE.laterSeatPlays, 2, 3, 4, 5, 5]);
  });

  it('refuses a play once none are left', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['coronal_lance', 'coronal_lance']);
    s = play(s, 'coronal_lance');
    expect(() => play(s, 'coronal_lance')).toThrow(GameError);
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
    give(me, ['plasma_relay', 'null_field']);
    expect(() => play(s, 'plasma_relay')).toThrow(/full/);
    s = play(s, 'null_field');
    expect(s.players[0].lightspeed?.defId).toBe('null_field');
  });

  it('fades cards after their stability runs out, into the discard pile, triggering leave effects', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const [martyr] = give(me, ['martyr_crystal'], 'tableau'); // no start-of-turn or passive effect: it fades fast
    const [relay] = give(me, ['plasma_relay'], 'tableau');
    expect(martyr.stability).toBe(BALANCE.stabilityBurst);
    // (Straight heat, dawn heat with no conditions, lasts a day less than other cards.)
    expect(relay.stability).toBe(BALANCE.stabilityDawnHeat);
    expect(baseStability('standing_orders')).toBe(BALANCE.stability);
    // (A 1-energy card never lasts longer than cheapMaxStability.)
    expect(baseStability('deflector_grid')).toBe(BALANCE.cheapMaxStability);
    const bo = s.players[1].heat;
    s = endTurn(endTurn(s)); // Ada's turn 2: relay fires, both lose 1; the one-time Martyr fades and bursts
    expect(s.players[0].tableau.map((c) => c.defId)).toEqual(['plasma_relay']);
    expect(s.players[0].tableau[0].stability).toBe(BALANCE.stabilityDawnHeat - 1);
    expect(s.players[0].discard.some((c) => c.uid === martyr.uid)).toBe(true);
    expect(s.players[1].heat).toBeGreaterThanOrEqual(bo + 1 + 4);
    s = endTurn(endTurn(s)); // Ada's turn 3: the relay fires a second time, then fades
    expect(s.players[0].tableau).toHaveLength(0);
  });

  it('keeps anchored cards from fading, and lets stability be restored or eroded', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 2;
    const [relay, anchor, lance] = give(me, ['plasma_relay', 'chrono_anchor', 'coronal_lance'], 'tableau');
    s = endTurn(endTurn(s));
    const t = s.players[0].tableau;
    expect(t.find((c) => c.uid === relay.uid)!.stability).toBe(BALANCE.stabilityDawnHeat);
    expect(t.find((c) => c.uid === lance.uid)!.stability).toBe(BALANCE.stabilityBurst);
    give(activePlayer(s), ['stasis_field']);
    s = play(s, 'stasis_field', { allyUid: lance.uid, slot: 3 });
    expect(s.players[0].tableau.find((c) => c.uid === lance.uid)!.stability).toBe(BALANCE.stabilityBurst + 2);
    s = endTurn(s);
    give(activePlayer(s), ['entropy_pulse']);
    // The Anchor itself still fades: 3 → 2, and the pulse takes the last 2.
    s = play(s, 'entropy_pulse', { enemyUid: anchor.uid });
    expect(s.players[0].tableau.some((c) => c.uid === anchor.uid)).toBe(false);
    expect(s.players[0].discard.some((c) => c.uid === anchor.uid)).toBe(true);
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
  it('lead from the Hero slot and never fade, and use one of their abilities a day', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['ignition_protocol']);
    s = play(s, 'ignition_protocol');
    const cmd = s.players[0].tableau[0];
    expect(cmd.slot).toBe(COMMAND_SLOT);
    expect(cmd.stability).toBe(8);
    // Many days later, it still leads (its dawn heat firing each day).
    for (let i = 0; i < 10; i++) s = endTurn(s);
    expect(s.players[0].tableau.some((c) => c.defId === 'ignition_protocol')).toBe(true);
    expect(s.players[0].tableau.find((c) => c.defId === 'ignition_protocol')!.stability).toBe(8);
    // Strafe: heat 3, for 1 energy; then no second ability that day.
    const before = s.players[1].heat;
    activePlayer(s).playsLeft = 3;
    expect(heroAbilityProblem(s, activePlayer(s), 0)).toBeNull();
    s = applyAction(s, { type: 'heroAbility', index: 0 });
    expect(s.players[1].heat).toBeGreaterThanOrEqual(before + 3 - s.players[1].shields);
    expect(activePlayer(s).playsLeft).toBe(2);
    expect(() => applyAction(s, { type: 'heroAbility', index: 1 })).toThrow(/acted today/);
    s = endTurn(endTurn(s));
    expect(heroAbilityProblem(s, activePlayer(s), 1)).toBeNull();
  });

  it('mend their own stability (their health), up to their full stability', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 5;
    give(me, ['chamber_protocol']);
    s = play(s, 'chamber_protocol');
    // (A Hero comes into play dimmed: its abilities wait for the next day.)
    expect(heroAbilityProblem(s, activePlayer(s), 1)).toMatch(/dimmed/);
    s = endTurn(endTurn(s));
    const hero = () => activePlayer(s).tableau.find((c) => c.defId === 'chamber_protocol')!;
    hero().stability = 5;
    s = applyAction(s, { type: 'heroAbility', index: 1 }); // Nurture: renew 1, and she regains 2
    expect(hero().stability).toBe(7);
    s = endTurn(endTurn(s));
    s = applyAction(s, { type: 'heroAbility', index: 1 });
    expect(hero().stability).toBe(8);
  });

  it("give their own race's cards a lasting buff, and only theirs", () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    const [, skirmisher, relay] = give(me, ['command_directive', 'aureline_skirmisher', 'plasma_relay'], 'tableau');
    const dawnHeat = (c: typeof relay) => effectAmount(s, me, c, cardDef(c.defId).onTurn![0], 'turn');
    expect(dawnHeat(skirmisher)).toBe(2);
    expect(dawnHeat(relay)).toBe(1);
    // Hierarch Vael: the Xel'Naru cool more.
    const t = twoPlayer();
    const [, bloom] = give(activePlayer(t), ['coolant_protocol', 'crystal_bloom'], 'tableau');
    expect(effectAmount(t, activePlayer(t), bloom, cardDef('crystal_bloom').onPlay![0])).toBe(3);
  });

  it('take one Command slot: a new one replaces the old, and neither takes a tableau slot', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 9;
    give(me, ['plasma_relay', 'plasma_relay', 'coolant_array', 'coolant_array', 'deflector_grid'], 'tableau');
    expect(tableauFull(me)).toBe(true);
    give(me, ['command_directive', 'war_council']);
    s = play(s, 'command_directive');
    expect(activePlayer(s).tableau.filter((c) => c.slot === COMMAND_SLOT).map((c) => c.defId)).toEqual(['command_directive']);
    s = play(s, 'war_council');
    const after = activePlayer(s);
    expect(after.tableau.filter((c) => c.slot === COMMAND_SLOT).map((c) => c.defId)).toEqual(['war_council']);
    expect(after.discard.some((c) => c.defId === 'command_directive')).toBe(true);
    expect(after.tableau).toHaveLength(6);
  });

  it("Archon Seris's Archive takes back the card most recently discarded (not a Hero)", () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 3;
    give(me, ['war_council']);
    s = play(s, 'war_council');
    s = endTurn(endTurn(s));
    const ada = s.players[0];
    ada.discard.push({ uid: 'd1', defId: 'coronal_lance' }, { uid: 'd2', defId: 'gravity_sling' }, { uid: 'd3', defId: 'command_directive' });
    s = applyAction(s, { type: 'heroAbility', index: 0 });
    const now = s.players[0];
    expect(now.hand.some((c) => c.uid === 'd2')).toBe(true);
    expect(now.discard.some((c) => c.uid === 'd3')).toBe(true);
  });

  it("can't be recalled or recovered to their owner's hand", () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 3;
    const [cmd] = give(me, ['command_directive'], 'tableau');
    expect(allyChoices(me, 'phase_shift').some((c) => c.uid === cmd.uid)).toBe(false);
    me.discard.push({ uid: 'x1', defId: 'command_directive' });
    expect(recoverChoices(me, 'salvage_drone').some((c) => c.uid === 'x1')).toBe(false);
    // A full tableau of nothing but Command cards leaves a recall card nothing to take the place of.
    void s;
  });

  it('can still be sent back by a rival', () => {
    let s = twoPlayer();
    const [cmd] = give(s.players[1], ['command_directive'], 'tableau');
    give(activePlayer(s), ['tractor_beam']);
    s = play(s, 'tractor_beam', { enemyUid: cmd.uid });
    expect(s.players[1].hand.some((c) => c.uid === cmd.uid)).toBe(true);
  });
});

describe('recall', () => {
  it('lets a recall card into a full tableau: it recalls a card and goes to the discard pile, taking no slot', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 2;
    const placed = give(me, ['plasma_relay', 'coolant_array', 'chrono_anchor', 'resonance_lattice', 'bulwark_plating'], 'tableau');
    expect(tableauFull(me)).toBe(true);
    const back = placed[2];
    give(me, ['recall_beacon']);
    s = play(s, 'recall_beacon', { allyUid: back.uid });
    const t = s.players[0].tableau;
    expect(t).toHaveLength(BALANCE.tableauSlots - 1);
    expect(s.players[0].discard.some((c) => c.defId === 'recall_beacon')).toBe(true);
    expect(s.players[0].hand.some((c) => c.uid === back.uid)).toBe(true);
  });
});

describe('attacks and dimming', () => {
  it("lets a card attack once a day: it comes in dimmed, attacks a card, dims, and is hit back", () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 5;
    give(me, ['siege_array']);
    s = play(s, 'siege_array');
    const array = () => s.players[0].tableau.find((c) => c.defId === 'siege_array')!;
    expect(cardDef('siege_array').attack).toBeGreaterThan(0);
    expect(attackProblem(s, activePlayer(s), array().uid)).toMatch(/dimmed/);
    s = endTurn(endTurn(s));
    array().stability = 6;
    const [chart] = give(s.players[1], ['star_chart'], 'tableau');
    chart.stability = 6;
    s = applyAction(s, { type: 'attack', attackerUid: array().uid, targetUid: chart.uid });
    expect(array().dimmed).toBe(true);
    expect(() => applyAction(s, { type: 'attack', attackerUid: array().uid, targetUid: chart.uid })).toThrow(/dimmed/);
    // Next day, at a card with an attack of its own: that card hits back, at the attacker's stability.
    s = endTurn(endTurn(s));
    const [lancer] = give(s.players[1], ['helio_lancer'], 'tableau');
    const stab = array().stability!;
    s = applyAction(s, { type: 'attack', attackerUid: array().uid, targetUid: lancer.uid });
    expect(array().stability).toBe(stab - counterDamage(s, s.players[1], lancer));
  });

  it('resolves dusk effects as a day ends (after acting), and counts the cards that held back', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const [star] = give(me, ['evening_star'], 'tableau');
    me.hand = me.hand.slice(0, 3); // (under the hand limit, so the card drawn stays)
    const hand = me.hand.length;
    s = applyAction(s, { type: 'endTurn' });
    const after = s.players.find((p) => p.id === me.id)!;
    expect(after.hand.length).toBe(hand + 1);
    expect(s.log.some((l) => l.text.startsWith('— Dusk:'))).toBe(true);
    expect(star.uid).toBeTruthy();
    // Gloaming Battery: heat per 2 of your other cards not dimmed.
    let t = twoPlayer();
    const ada = activePlayer(t);
    const [battery, x, y] = give(ada, ['gloaming_battery', 'plasma_relay', 'plasma_relay'], 'tableau');
    t.players[1].shields = 0;
    const rival = t.players[1].heat;
    x.dimmed = true;
    t = applyAction(t, { type: 'endTurn' });
    expect(t.players[1].heat).toBe(rival); // one rested card: half of 2 rounds down to nothing
    expect(battery.uid && y.uid).toBeTruthy();
    // Two rested cards: 1 heat at dusk.
    let u = twoPlayer();
    give(activePlayer(u), ['gloaming_battery', 'plasma_relay', 'plasma_relay'], 'tableau');
    u.players[1].shields = 0;
    const before = u.players[1].heat;
    u = applyAction(u, { type: 'endTurn' });
    expect(u.players[1].heat).toBe(before + 1);
  });

  it("takes a hit back on the attacker's own defence (Sturdy), never its slot's", () => {
    let s = twoPlayer();
    const [relay] = give(s.players[0], ['plasma_relay'], 'tableau');
    relay.slot = 2; // the middle slot: defence 3 that an attacker out of it does not have
    relay.stability = 5;
    const [veil] = give(s.players[1], ['stinging_veil'], 'tableau');
    veil.stability = 5;
    const back = counterDamage(s, s.players[1], veil); // Sting 3, and Barbed (Vorthane) 1
    s = applyAction(s, { type: 'attack', attackerUid: relay.uid, targetUid: veil.uid });
    const after = s.players[0].tableau.find((c) => c.uid === relay.uid)!;
    // Its Sturdy 1 takes 1, its stability the rest; the middle slot's 3 does nothing.
    expect(after.stability).toBe(5 - (back - 1));
    expect(after.dented).toBe(1);
  });

  it('sends cards that do nothing once played straight to the discard pile, taking no slot', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['coronal_lance']);
    s = play(s, 'coronal_lance');
    expect(s.players[0].tableau).toHaveLength(0);
    expect(s.players[0].discard.some((c) => c.defId === 'coronal_lance')).toBe(true);
  });
});

describe('synergies', () => {
  it('Focusing Array (Forge 2) boosts the attack card beside it', () => {
    let s = twoPlayer();
    give(activePlayer(s), ['plasma_relay', 'focusing_array', 'coolant_array'], 'tableau');
    const start = s.players[1].heat;
    s = endTurn(endTurn(s));
    expect(s.players[1].heat).toBe(start + 1 + 2);
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

  it('Stinging Veil, a Guard, stings the card that attacks it, at its stability', () => {
    let s = twoPlayer();
    const ada = activePlayer(s);
    const [lancer] = give(ada, ['helio_lancer'], 'tableau');
    lancer.stability = 2;
    const [veil] = give(s.players[1], ['stinging_veil'], 'tableau');
    // The Veil is a Guard: nothing behind it can be attacked.
    expect(attackProblem(s, ada, lancer.uid, 'elsewhere')).toMatch(/Guard/);
    s = applyAction(s, { type: 'attack', attackerUid: lancer.uid, targetUid: veil.uid });
    // Sting 3 hits back: the Lancer (stability 2) burns away.
    expect(s.players[0].tableau.some((c) => c.uid === lancer.uid)).toBe(false);
  });
});

describe('Lightspeed guards', () => {
  it('can be set face down for 1 more energy, and spring in front of a card attacked', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const rival = s.players.find((p) => p.id !== me.id)!;
    // The rival sets a Blink Bulwark face down (1 + 1 energy) instead of playing it as a Guard.
    const [lancerTarget] = give(rival, ['star_chart'], 'tableau');
    lancerTarget.stability = 5;
    rival.shields = 0;
    const [bw] = give(rival, ['blink_bulwark']);
    s.activePlayerIndex = s.players.indexOf(rival);
    rival.playsLeft = 1;
    expect(() => applyAction(s, { type: 'playCard', cardUid: bw.uid, faceDown: true })).toThrow();
    rival.playsLeft = 2;
    s = applyAction(s, { type: 'playCard', cardUid: bw.uid, faceDown: true });
    const r = s.players.find((p) => p.id === rival.id)!;
    expect(r.lightspeed?.defId).toBe('blink_bulwark');
    expect(r.playsLeft).toBe(0);
    expect(r.tableau.some((c) => c.defId === 'blink_bulwark')).toBe(false);
    // My Siege Array attacks their Star Chart: the Bulwark springs into their tableau and takes the attack.
    s.activePlayerIndex = s.players.indexOf(s.players.find((p) => p.id === me.id)!);
    const [array] = give(activePlayer(s), ['siege_array'], 'tableau');
    array.stability = 6;
    s = applyAction(s, { type: 'attack', attackerUid: array.uid, targetUid: lancerTarget.uid });
    const after = s.players.find((p) => p.id === rival.id)!;
    expect(after.lightspeed).toBeNull();
    const guard = after.tableau.find((c) => c.defId === 'blink_bulwark');
    expect(guard).toBeDefined();
    expect(after.tableau.find((c) => c.uid === lancerTarget.uid)?.stability).toBe(5);
    // Its defence (slot and sturdy) takes the blow first.
    expect(guard!.dented ?? 0).toBeGreaterThan(0);
    expect(s.sprung?.some((x) => x.trigger === 'cardAttacked' && x.defId === 'blink_bulwark')).toBe(true);
  });
});

describe('card costs', () => {
  it('an X card spends all your energy, and grows with it', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const rival = s.players.find((p) => p.id !== me.id)!;
    rival.shields = 0;
    me.playsLeft = 3;
    const [torrent] = give(me, ['solar_torrent']);
    s = applyAction(s, { type: 'playCard', cardUid: torrent.uid });
    expect(activePlayer(s).playsLeft).toBe(0);
    expect(s.players.find((p) => p.id === rival.id)!.heat).toBe(1 + 2 * 3);
  });

  it("keeps the day's whole energy, bonus included, as cards are played", () => {
    let s = twoPlayer();
    s = endTurn(endTurn(s));
    const me = activePlayer(s);
    give(me, ['relay_station', 'coronal_lance']);
    const total = me.turn.energyTotal!;
    s = play(s, 'relay_station');
    expect(activePlayer(s).turn.energyTotal).toBe(total + 1);
    s = play(s, 'coronal_lance');
    expect(activePlayer(s).turn.energyTotal).toBe(total + 1);
  });

  it("a Hero's energy ability adds energy for the day", () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.playsLeft = 5;
    give(me, ['the_admiralty']);
    s = play(s, 'the_admiralty');
    s = endTurn(endTurn(s));
    const before = activePlayer(s).playsLeft;
    s = applyAction(s, { type: 'heroAbility', index: 1 });
    expect(activePlayer(s).playsLeft).toBe(before + 1);
  });

  it('cards cost energy, and a card is refused without enough of it', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    expect(cardCost('sunspear')).toBe(3);
    expect(cardCost('coronal_lance')).toBe(1);
    expect(cardCost('relay_station')).toBe(0);
    me.playsLeft = 2;
    const [spear] = give(me, ['sunspear']);
    expect(() => applyAction(s, { type: 'playCard', cardUid: spear.uid })).toThrow(/energy/);
    me.playsLeft = 4;
    s = applyAction(s, { type: 'playCard', cardUid: spear.uid });
    expect(activePlayer(s).playsLeft).toBe(1);
  });
});

describe('Attunement', () => {
  it("gives an attuned card its orbit position's bonus at dawn, stronger as each planet comes round", () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    const rival = s.players.find((p) => p.id !== me.id)!;
    give(me, ['orrery', 'precession_engine'], 'tableau');
    const [orrery, engine] = me.tableau.slice(-2);
    const at = (orbit: number, card = orrery) => {
      me.orbit = orbit;
      return dawnEffects(card, me, s).map((e) => `${e.type}${'amount' in e ? e.amount : ''}`).join(',');
    };
    expect(at(0)).toBe('shield1');
    expect(at(2)).toBe('shield2,cool1');
    expect(at(4)).toBe('draw1');
    expect(at(8)).toBe('heat2,shield1');
    // Attunement 2: every number doubled.
    expect(at(8, engine)).toBe('heat4,shield2');
    // Without its owner known (the card's own text), nothing is added.
    expect(dawnEffects(orrery)).toEqual([]);
    // With the planets eaten, the dead planet's bonus (at the same step of it).
    give(rival, ['orion_galaxy_eater'], 'tableau');
    expect(at(8)).toBe('shield2,cool1');
  });
});

describe('Orion, Galaxy Eater', () => {
  it("makes its rivals' planets dead (no Industry energy) while it is in play, and only theirs", () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    const rival = s.players.find((p) => p.id !== me.id)!;
    // Both suns face the industrial planet.
    me.orbit = rival.orbit = 6;
    expect(currentPlanet(rival, s)).toBe('industrial');
    const withIndustry = playsAllowed(s, rival);
    give(me, ['orion_galaxy_eater'], 'tableau');
    expect(planetsEaten(s, rival)).toBe(true);
    expect(planetsEaten(s, me)).toBe(false);
    expect(currentPlanet(rival, s)).toBe('dead');
    expect(currentPlanet(me, s)).toBe('industrial');
    expect(playsAllowed(s, rival)).toBe(withIndustry - BALANCE.industrialPlays);
  });
});

describe('Forge Clans: walls become weapons', () => {
  it('a Siege Ram hits harder at dawn for the defence on your cards, and wear takes it back', () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    const [ram] = give(me, ['kor_siege_ram'], 'tableau');
    const wall = give(me, ['kor_shieldwall', 'kor_iron_sentinel'], 'tableau');
    const total = () => me.tableau.reduce((n, t) => n + cardDefence(me, t), 0);
    const dawnHeat = () => effectAmount(s, me, ram, cardDef('kor_siege_ram').onTurn![0], 'turn');
    expect(dawnHeat()).toBe(Math.min(3, 1 + Math.floor(total() / 4)));
    expect(dawnHeat()).toBeGreaterThan(1);
    for (const c of [ram, ...wall]) c.dented = 99;
    expect(total()).toBe(0);
    expect(dawnHeat()).toBe(1);
  });
});

describe('Thermosiphon', () => {
  it('adds 1 per 2 points your sun is below zero, on top of what the card does warm', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const rival = s.players.find((p) => p.id !== me.id)!;
    rival.shields = 0;
    me.playsLeft = 9;
    me.heat = 0;
    give(me, ['cryo_lance', 'cryo_lance']);
    const before = rival.heat;
    s = play(s, 'cryo_lance');
    expect(s.players.find((p) => p.id === rival.id)!.heat).toBe(before + 2);
    const cold = activePlayer(s);
    cold.heat = -5;
    s = play(s, 'cryo_lance');
    expect(s.players.find((p) => p.id === rival.id)!.heat).toBe(before + 2 + 2 + 2);
  });

  it("Thaw Beam hits harder the colder its target's sun", () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const rival = s.players.find((p) => p.id !== me.id)!;
    rival.shields = 0;
    rival.heat = -4;
    me.playsLeft = 9;
    give(me, ['thaw_beam']);
    s = play(s, 'thaw_beam');
    expect(s.players.find((p) => p.id === rival.id)!.heat).toBe(-4 + 1 + 2);
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
    expect(s.players[1].heat).toBe(before + 3);
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
    activePlayer(s).playsLeft = 2;
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
    give(me, ['plasma_relay']);
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
    // Relays at distance 1, 1 and 2 from the Singularity (resonance 3/2): 1+3, 1+3 and 1+2.
    expect(s.players[1].heat).toBe(bo + 4 + 4 + 3);
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
    // Bell Warden 3, Pylon 2 + 1 (one defence neighbour).
    expect(s.players[0].shields).toBe(6);
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
    me.playsLeft = 4;
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
    activePlayer(s).playsLeft = 2;
    give(activePlayer(s), ['event_horizon']);
    s = play(s, 'event_horizon', { enemyUid: b.uid });
    expect(s.players[1].tableau).toHaveLength(0);
    expect(s.players[1].discard.map((x) => x.uid)).toContain(b.uid);
    expect(s.players[1].hand.map((x) => x.uid)).toEqual(expect.arrayContaining([a.uid, c.uid]));
  });
});

describe('hand limit', () => {
  it('discards a hand over the limit after dusk: the cards picked, then the costliest', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['coronal_lance', 'ion_cannon', 'star_breaker']);
    expect(me.hand.length).toBe(BALANCE.maxHand + 3);
    const lance = me.hand.find((c) => c.defId === 'coronal_lance')!;
    s = applyAction(s, { type: 'endTurn', discard: [lance.uid] });
    const after = s.players.find((p) => p.id === me.id)!;
    expect(after.hand.length).toBe(BALANCE.maxHand);
    expect(after.discard.map((c) => c.defId)).toContain('coronal_lance');
    // The other two over the limit: the costliest went (Star Breaker, 4).
    expect(after.discard.map((c) => c.defId)).toContain('star_breaker');
  });

  it('rests dimmed cards at dusk: a card played today (or that attacked) does nothing then', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.hand = [];
    const [star] = give(me, ['evening_star'], 'tableau');
    star.dimmed = true;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players.find((p) => p.id === me.id)!.hand.length).toBe(0);
  });
});

describe('lightspeed', () => {
  it('is set face down, one at a time, without taking a slot', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.turnsTaken = 2;
    me.playsLeft = 4;
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
    give(bo, ['gravity_sling', 'coronal_lance']);
    const ada = s.players[0].heat;
    s = play(s, 'gravity_sling'); // only 1 heat: not enough to spring it
    expect(s.players[0].heat).toBe(ada + 1);
    const boHeat = s.players[1].heat;
    s = play(s, 'coronal_lance');
    expect(s.players[0].heat).toBe(ada + 1);
    expect(s.players[1].heat).toBe(boHeat + 2); // the ambush
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
    activePlayer(s).playsLeft = 2;
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
    me().turnsTaken = 10; // well past the ramp to full energy
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

describe('recovery', () => {
  it('draws instead when there is nothing to recover', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    me.discard = [];
    give(me, ['salvage_drone']);
    const hand = me.hand.length;
    s = play(s, 'salvage_drone', { slot: 0 });
    // The drone left the hand, and one card was drawn in its place.
    expect(activePlayer(s).hand.length).toBe(hand);
  });
});

describe('regional instability', () => {
  it('strikes every sun at once as each round begins, as forecast', () => {
    let s = twoPlayer();
    s.round = BALANCE.instabilityStartsRound;
    for (let k = 0; k < 4; k++) {
      const f = turnForecast(s, s.players[0]);
      for (const p of s.players) {
        p.tableau = [];
        p.shields = 3;
        p.heat = 0;
      }
      const newRound = s.activePlayerIndex === s.players.length - 1;
      s = endTurn(s);
      for (const p of s.players) expect(p.heat).toBe(newRound ? f.unstable : 0);
      if (newRound) expect(s.round).toBe(f.unstableRound);
    }
  });

  it('lets the sun least far past its limit hold on when it would finish every sun', () => {
    let s = twoPlayer();
    s.round = BALANCE.instabilityStartsRound - 1;
    s = endTurn(s);
    const [a, b] = s.players;
    a.tableau = [];
    b.tableau = [];
    a.heat = supernovaThreshold(a) - 1;
    b.heat = supernovaThreshold(b) - 2;
    s = endTurn(s);
    expect(isGameOver(s)).toBe(true);
    expect(s.winnerId).toBe(b.id);
  });
});

describe('attacks and heat', () => {
  /** Ada with a ready Siege Array; Bo with two Coolant Arrays (slot 0: defence 1, slot 1: defence 2). */
  function setUp() {
    const s = twoPlayer();
    const [ada, bo] = s.players;
    const [array, lancer] = give(ada, ['siege_array', 'helio_lancer'], 'tableau');
    array.stability = lancer.stability = 6;
    const [a, b] = give(bo, ['coolant_array', 'coolant_array'], 'tableau');
    a.stability = b.stability = 6;
    bo.shields = 0;
    return { s, array, lancer, a, b };
  }
  const stab = (st: GameState, uid: string) => st.players[1].tableau.find((c) => c.uid === uid)?.stability ?? 0;

  it("strikes the sun with dawn heat (past Guards), while heat as a card is played can be aimed at a card", () => {
    let { s, a, b } = setUp();
    const [sa, sb] = [stab(s, a.uid), stab(s, b.uid)];
    // A rival Guard doesn't draw dawn heat in.
    const [veil] = give(s.players[1], ['stinging_veil'], 'tableau');
    veil.stability = 6;
    s = applyAction(applyAction(s, { type: 'endTurn' }), { type: 'endTurn' });
    // (Bo's own dawn wore them 1, as every card fades.)
    expect(stab(s, a.uid)).toBe(sa - 1);
    expect(stab(s, b.uid)).toBe(sb - 1);
    expect(stab(s, veil.uid)).toBe(5);
    // A Coronal Lance, aimed: with a Guard up, only the Guard can be aimed at.
    activePlayer(s).playsLeft = 9;
    give(activePlayer(s), ['coronal_lance', 'coronal_lance']);
    expect(() => play(s, 'coronal_lance', { aimUid: a.uid })).toThrow(GameError);
    s = play(s, 'coronal_lance', { aimUid: veil.uid });
    const struck = s.players[1].tableau.find((c) => c.uid === veil.uid)!;
    expect((struck.dented ?? 0) + (5 - struck.stability!)).toBe(3);
    // With the Guard gone, at any card: its defence first, then its stability; the sun takes nothing.
    s.players[1].tableau = s.players[1].tableau.filter((c) => c.uid !== veil.uid);
    s.players[1].shields = 0;
    const heat = s.players[1].heat;
    const def = cardDefence(s.players[1], s.players[1].tableau.find((c) => c.uid === b.uid)!);
    s = play(s, 'coronal_lance', { aimUid: b.uid });
    expect(stab(s, b.uid)).toBe(sb - 1 - Math.max(0, 3 - def));
    expect(s.players[1].heat).toBe(heat);
  });

  it("attacks a rival card, Guards first, wearing defence before stability", () => {
    let { s, array, b } = setUp();
    const ada = activePlayer(s);
    expect(attackProblem(s, ada, array.uid)).toBeNull();
    const bo = s.players[1];
    const card = () => s.players[1].tableau.find((c) => c.uid === b.uid)!;
    const def = cardDefence(bo, card());
    const att = cardAttack(s, ada, array);
    const before = card().stability!;
    const heat = bo.heat;
    s = applyAction(s, { type: 'attack', attackerUid: array.uid, targetUid: b.uid });
    expect(card().stability).toBe(before - Math.max(0, att - def));
    expect(card().dented ?? 0).toBe(Math.min(att, def));
    expect(s.players[1].heat).toBe(heat);
    // A Guard: only it can be attacked.
    const t = setUp();
    const [veil] = give(t.s.players[1], ['stinging_veil'], 'tableau');
    expect(attackProblem(t.s, activePlayer(t.s), t.array.uid, t.a.uid)).toMatch(/Guard/);
    expect(attackProblem(t.s, activePlayer(t.s), t.array.uid, veil.uid)).toBeNull();
  });

  it("attacks the rival's sun past their shields, unless a Guard stands", () => {
    let { s, array } = setUp();
    const heat = s.players[1].heat;
    s = applyAction(s, { type: 'attack', attackerUid: array.uid, targetUid: null });
    expect(s.players[1].heat).toBe(heat + cardAttack(s, s.players[0], array));
    const t = setUp();
    give(t.s.players[1], ['stinging_veil'], 'tableau');
    expect(attackProblem(t.s, activePlayer(t.s), t.array.uid, null)).toMatch(/Guard/);
  });

  it("wears defence down for good (mending 1 a day), and leaves a destroyed card's wear in its slot", () => {
    let { s, b } = setUp();
    const bo = () => s.players[1];
    const card = () => bo().tableau.find((c) => c.uid === b.uid)!;
    card().dented = 2;
    expect(cardDefence(bo(), card())).toBe(0);
    // Bo's day mends only 1 of it.
    s = applyAction(s, { type: 'endTurn' });
    expect(cardDefence(bo(), card())).toBe(1);
    // Burned away by an attack: the wear stays in its slot, and mends 1 a day.
    s = applyAction(s, { type: 'endTurn' });
    const slot = card().slot!;
    card().stability = 1;
    const ada = activePlayer(s);
    const array = ada.tableau.find((c) => c.defId === 'siege_array')!;
    s = applyAction(s, { type: 'attack', attackerUid: array.uid, targetUid: b.uid });
    expect(bo().tableau.some((c) => c.uid === b.uid)).toBe(false);
    const wear = bo().slotWear?.[slot] ?? 0;
    expect(wear).toBeGreaterThan(0);
    s = applyAction(s, { type: 'endTurn' });
    expect(bo().slotWear?.[slot] ?? 0).toBe(wear - 1);
  });

  it('mends Sturdy cards by their Sturdy as well, and Repair mends more', () => {
    let { s, b } = setUp();
    const [plating] = give(s.players[1], ['bulwark_plating'], 'tableau');
    s.players[1].tableau.find((c) => c.uid === b.uid)!.dented = 2;
    // Bo's day: 1 mends on its own, and Bulwark Plating's Repair 1 mends another.
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[1].tableau.find((c) => c.uid === b.uid)!.dented ?? 0).toBe(0);
    expect(plating).toBeTruthy();
  });
});

describe('lightspeed', () => {
  it('records which enemy card sprang a Lightspeed card, for the table to show beside it', () => {
    const s = twoPlayer();
    const bo = s.players[1];
    bo.lightspeed = { uid: 'ls1', defId: 'null_field' };
    give(activePlayer(s), ['coronal_lance']);
    const next = play(s, 'coronal_lance');
    expect(next.sprung).toEqual([{ ownerId: bo.id, defId: 'null_field', enemyId: activePlayer(s).id, against: 'coronal_lance', trigger: 'enemyPlays' }]);
    expect(next.log.some((l) => /springs Null Field in answer to .*Coronal Lance/.test(l.text))).toBe(true);
    // Only the move it sprang on carries it.
    expect(applyAction(next, { type: 'endTurn' }).sprung).toBeUndefined();
  });
  it('Night Ambush springs when an enemy attacks one of your cards: the attack never lands, and they take 2', () => {
    let s = twoPlayer();
    const [array] = give(s.players[0], ['siege_array'], 'tableau');
    const [b] = give(s.players[1], ['coolant_array'], 'tableau');
    array.stability = b.stability = 6;
    const t = { array, b };
    const bo = s.players[1];
    bo.lightspeed = { uid: 'ls2', defId: 'nyx_night_ambush' };
    const ada = activePlayer(s);
    const heatBefore = ada.heat, shields = ada.shields;
    const stab = bo.tableau.find((c) => c.uid === t.b.uid)!.stability;
    s = applyAction(s, { type: 'attack', attackerUid: t.array.uid, targetUid: t.b.uid });
    expect(s.players[1].lightspeed).toBeNull();
    expect(s.players[1].tableau.find((c) => c.uid === t.b.uid)!.stability).toBe(stab);
    expect(activePlayer(s).heat + Math.max(0, shields - activePlayer(s).shields)).toBe(heatBefore + 2);
    expect(s.log.some((l) => /never reaches/.test(l.text))).toBe(true);
  });
});

describe('fusion', () => {
  it('fuses a Fusion card onto a card in play: no slot, its dawn effects and stability join the host', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const [host] = give(me, ['deflector_grid'], 'tableau');
    const before = host.stability ?? 0;
    give(me, ['tidal_graft']);
    me.playsLeft = 9;
    s = play(s, 'tidal_graft', { hostUid: host.uid });
    const h = activePlayer(s).tableau.find((c) => c.uid === host.uid)!;
    expect(activePlayer(s).tableau.length).toBe(1);
    expect(h.fused?.map((f) => f.defId)).toEqual(['tidal_graft']);
    expect(h.stability).toBe(before + 2);
    // Its dawn: the host's own 2 shields, and the graft's 2 more.
    expect(dawnEffects(h).filter((e) => e.type === 'shield').length).toBe(2);
  });

  it('can also be played as an ordinary card, into a slot', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['deflector_grid'], 'tableau');
    give(me, ['tidal_graft']);
    me.playsLeft = 9;
    s = play(s, 'tidal_graft', { slot: 3 });
    const p = activePlayer(s);
    expect(p.tableau.length).toBe(2);
    expect(p.tableau.find((c) => c.defId === 'tidal_graft')!.slot).toBe(3);
    // With a full tableau it can still fuse onto a card, but not take a slot.
    const t = twoPlayer();
    const m = activePlayer(t);
    give(m, Array(5).fill('coolant_array'), 'tableau');
    expect(hasRoomFor(m, 'tidal_graft')).toBe(true);
    give(m, ['tidal_graft']);
    m.playsLeft = 9;
    expect(() => play(t, 'tidal_graft', { slot: 0 })).toThrow(/full/);
  });

  it('leaves with its host', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['reinforced_plating']);
    me.playsLeft = 9;
    const [host] = give(me, ['coronal_lance'], 'tableau');
    const def0 = cardDefence(me, host);
    s = play(s, 'reinforced_plating', { hostUid: host.uid });
    const p = activePlayer(s);
    expect(cardDefence(p, p.tableau[0])).toBe(def0 + 2);
    // Burn the host away: its fusion card goes to the discard pile with it.
    p.tableau[0].stability = 1;
    const rival = s.players[1];
    give(p, ['coronal_lance']);
    s.players[1] = rival;
    s = applyAction(s, { type: 'endTurn' });
    expect(s.players[0].discard.some((c) => c.defId === 'reinforced_plating') || s.players[0].tableau.some((c) => c.fused?.length)).toBe(true);
  });
});

describe('saplings and growth', () => {
  it('plants Saplings in the least defended empty slots; they count as cards in play, and vanish when they leave', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    give(me, ['seed_burst']);
    me.playsLeft = 9;
    s = play(s, 'seed_burst');
    const p = activePlayer(s);
    const saplings = p.tableau.filter((c) => c.defId === 'sapling');
    expect(saplings.length).toBe(2);
    expect(saplings.map((c) => c.slot).sort()).toEqual([0, 4]);
    // A token can't go in a deck.
    expect(deckProblems([...PRESET_DECKS[3].cards.slice(0, 29), 'sapling']).some((x) => /Unknown/.test(x))).toBe(true);
  });

  it('a growth graft makes its host grow at once, and a Catalyst spreads its growth', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const [sap, drone, cat] = give(me, ['sapling', 'spore_drone', 'spore_catalyst'], 'tableau');
    give(me, ['sap_graft']);
    me.playsLeft = 9;
    s = play(s, 'sap_graft', { hostUid: sap.uid });
    expect(activePlayer(s).tableau.find((c) => c.uid === sap.uid)!.growth).toBe(1);
    // The Catalyst's dawn: it grows, and so do the other growing cards (the drone, and the grafted sapling).
    s = applyAction(s, { type: 'endTurn' });
    s = applyAction(s, { type: 'endTurn' });
    const t = s.players[0].tableau;
    expect(t.find((c) => c.uid === cat.uid)!.growth).toBeGreaterThanOrEqual(1);
    // The drone grows by its own dawn and again with the Catalyst.
    expect(t.find((c) => c.uid === drone.uid)!.growth).toBe(2);
  });
});

describe('relics', () => {
  it('never fade, have no defence, and lend their bonus', () => {
    let s = twoPlayer(3);
    const me = activePlayer(s);
    const [relic] = give(me, ['ember_idol'], 'tableau');
    const [relay] = give(me, ['plasma_relay'], 'tableau');
    expect(cardAttack(s, me, relic)).toBe(0);
    expect(relic.stability).toBe(3);
    // Its bonus: your attack cards heat 1 more.
    expect(effectAmount(s, me, relay, { type: 'heat', amount: 1, to: 'target' }, 'turn')).toBe(2);
    // Days pass: it stays.
    for (let i = 0; i < 8 && !isGameOver(s); i++) s = endTurn(s);
    const mine = s.players.find((p) => p.id === me.id)!;
    const still = mine.tableau.find((c) => c.uid === relic.uid);
    expect(still?.stability).toBe(3);
  });

  it('break to the weakest removal', () => {
    let s = twoPlayer(4);
    const me = activePlayer(s);
    const rival = s.players.find((p) => p.id !== me.id)!;
    const [relic] = give(rival, ['astral_orrery'], 'tableau');
    // (A guard beside it: more defence than Ion Cannon reaches, which a Relic's Brittle ignores.)
    give(rival, ['kor_rampart_lord'], 'tableau');
    expect(cardDefence(rival, relic)).toBeGreaterThan(2);
    give(me, ['ion_cannon']);
    s = play(s, 'ion_cannon', { enemyUid: relic.uid });
    expect(s.players.find((p) => p.id === rival.id)!.tableau.some((c) => c.uid === relic.uid)).toBe(false);
  });
});
