import { describe, expect, it } from 'vitest';
import { activePlayer, applyAction, attackProblem, cardAttack, cardCost, cardDefence, COMMAND_SLOT, createGame } from '../src/engine/game';
import type { GameState, PlayerSetup, ShipRooms } from '../src/engine/types';

const HERO = 'command_directive'; // (no attack of its own)
const rooms = (over: Partial<ShipRooms> = {}): ShipRooms => ({ defence: [0, 0, 0, 0, 0], attack: [0, 0, 0, 0, 0], command: 1, ...over });

/** A campaign battle: a flagship (hero, rooms, a small deck) against a hero-less station. */
function battle(opts: { me?: Partial<PlayerSetup>; them?: Partial<PlayerSetup> } = {}): GameState {
  return createGame({
    seed: 3,
    campaign: true,
    players: [
      { name: 'Flagship', isAI: false, deck: ['focusing_array', 'coolant_array'], tableau: [HERO], hero: HERO, rooms: rooms(), heroStats: { attack: 1, defence: 2 }, ...opts.me },
      { name: 'Station', isAI: false, deck: ['coolant_array', 'cryo_vault'], ...opts.them },
    ],
  });
}

const endTurn = (s: GameState) => applyAction(s, { type: 'endTurn' });

function playFirst(s: GameState, defId: string, extra: Record<string, unknown> = {}) {
  const me = activePlayer(s);
  const card = me.hand.find((c) => c.defId === defId);
  if (!card) throw new Error(`${defId} not in hand`);
  if (me.playsLeft > 0) me.playsLeft = Math.max(me.playsLeft, cardCost(defId));
  return applyAction(s, { type: 'playCard', cardUid: card.uid, ...extra } as never);
}

describe('campaign battles', () => {
  it('puts the hero in the command room, with the room and their training on their defence', () => {
    const s = battle();
    const me = s.players[0];
    const hero = me.tableau.find((c) => c.slot === COMMAND_SLOT)!;
    expect(hero.defId).toBe(HERO);
    expect(cardDefence(me, hero)).toBe(cardDefence({ ...me, rooms: undefined, heroStats: undefined }, hero) + 1 + 2);
  });

  it('lets a trained hero fight, and a room’s guns add to the card in it', () => {
    const s = battle();
    const me = s.players[0];
    const hero = me.tableau[0];
    expect(cardAttack(s, me, hero)).toBe(1);
    expect(attackProblem(s, me, hero.uid)).toBeNull();
    me.rooms!.attack[2] = 2;
    const gun = { uid: 'g1', defId: 'focusing_array', slot: 2, stability: 3 };
    me.tableau.push(gun);
    expect(cardAttack(s, me, gun)).toBe(cardAttack(s, { ...me, rooms: rooms() }, gun) + 2);
    // (A card that doesn't attack gains nothing from a gun room.)
    const wall = { uid: 'w1', defId: 'coolant_array', slot: 2, stability: 3 };
    expect(cardAttack(s, me, wall)).toBe(0);
  });

  it('plays by the card game’s rules: cards fade day by day', () => {
    let s = battle();
    s = playFirst(s, 'coolant_array');
    const wall = s.players[0].tableau.find((c) => c.defId === 'coolant_array')!;
    const before = wall.stability!;
    s = endTurn(endTurn(s));
    const now = s.players[0].tableau.find((c) => c.uid === wall.uid);
    expect(now ? now.stability : 0).toBeLessThan(before);
  });

  it('sends destroyed cards, the hero too, to the discard pile, and shuffles it back when the deck runs out', () => {
    let s = battle({ them: { tableau: [HERO], hero: HERO, rooms: rooms({ attack: [9, 9, 9, 9, 9] }), heroStats: { attack: 20, defence: 2 } } });
    s = endTurn(s); // the station's day: its hero strikes ours
    const them = activePlayer(s);
    const myHero = s.players[0].tableau.find((c) => c.slot === COMMAND_SLOT)!;
    s = applyAction(s, { type: 'attack', attackerUid: them.tableau[0].uid, targetUid: myHero.uid });
    const me = s.players[0];
    expect(me.tableau.some((c) => c.defId === HERO)).toBe(false);
    expect(me.discard.some((c) => c.defId === HERO)).toBe(true);
    expect(me.wounded).toBeUndefined();
    // An empty deck: the discard pile goes back in.
    me.deck = [];
    s = endTurn(s);
    expect(s.players[0].deck.length + s.players[0].hand.length).toBeGreaterThan(0);
  });

  it('draws cards with draw effects', () => {
    let s = battle({ me: { deck: ['deep_scanners', 'coolant_array', 'focusing_array', 'coolant_array', 'cryo_vault', 'cryo_vault', 'heat_sink', 'heat_sink', 'photon_drill', 'photon_drill'] } });
    s.players[0].hand = s.players[0].hand.filter((c) => c.defId === 'deep_scanners').concat(s.players[0].hand.some((c) => c.defId === 'deep_scanners') ? [] : [s.players[0].deck.splice(s.players[0].deck.findIndex((c) => c.defId === 'deep_scanners'), 1)[0]]);
    const deckBefore = s.players[0].deck.length;
    s = playFirst(s, 'deep_scanners');
    expect(s.players[0].deck.length).toBeLessThan(deckBefore);
  });

  it('a small deck with nothing left to draw or shuffle back gives no more, without burning its sun', () => {
    const s = battle();
    const me = s.players[0];
    me.hand = [];
    me.deck = [];
    me.discard = [];
    const t = endTurn(endTurn(s));
    expect(t.players[0].heat).toBe(s.players[0].heat);
    expect(t.winnerId).toBeNull();
  });
});

describe('a campaign hero, never played', () => {
  it('does what it would as played, its boons too, as the battle begins (at its side’s first dawn)', async () => {
    const { heroBoon } = await import('../src/engine/boons');
    expect(heroBoon('boon_playheat_3')).toBe('boon_openheat_3');
    expect(heroBoon('boon_plant_2')).toBe('boon_openplant_2');
    expect(heroBoon('boon_heat_2')).toBe('boon_heat_2');
    // Empress Solenne: heat 4, piercing, as she would be played; and a boon of 3 more heat.
    const s = battle({ me: { tableau: ['empress_solenne'], hero: 'empress_solenne', heroBoons: { hero: 'empress_solenne', boons: ['boon_openheat_3'] } } });
    const them = s.players[1];
    expect(s.log.some((l) => l.text.includes('opens the battle'))).toBe(true);
    expect(them.heat).toBeGreaterThanOrEqual(7);
    // Only once: not on later days.
    const later = endTurn(endTurn(s));
    expect(later.log.filter((l) => l.text.includes('opens the battle')).length).toBe(1);
  });
});

describe('a small deck run dry', () => {
  it('waits a day for each card it is under 10 before its discard pile shuffles back', () => {
    // Flagship: hero + 2 cards (a deck of 3): 7 days' wait.
    let s = battle();
    expect(s.players[0].deckSize).toBe(3);
    const me = s.players[0];
    me.discard.push(...me.hand.splice(0));
    me.deck = [];
    s = endTurn(endTurn(s)); // its next day: the deck is dry, the wait begins
    expect(s.players[0].reshuffleIn).toBe(7);
    expect(s.players[0].hand.length).toBe(0);
    for (let k = 0; k < 6; k++) s = endTurn(endTurn(s));
    expect(s.players[0].reshuffleIn).toBe(1);
    expect(s.players[0].hand.length).toBe(0);
    s = endTurn(endTurn(s));
    expect(s.players[0].reshuffleIn).toBeUndefined();
    expect(s.players[0].hand.length + s.players[0].deck.length).toBeGreaterThan(0);
  });
});
