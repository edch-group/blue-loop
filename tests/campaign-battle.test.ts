import { describe, expect, it } from 'vitest';
import { activePlayer, applyAction, attackProblem, baseStability, cardAttack, cardCost, cardDefence, COMMAND_SLOT, createGame } from '../src/engine/game';
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

  it('keeps cards’ stability day to day', () => {
    let s = battle();
    s = playFirst(s, 'coolant_array');
    const wall = s.players[0].tableau.find((c) => c.defId === 'coolant_array')!;
    const before = wall.stability;
    s = endTurn(endTurn(s));
    expect(s.players[0].tableau.find((c) => c.uid === wall.uid)?.stability).toBe(before);
  });

  it('never shuffles spent cards back: an empty deck simply gives no more', () => {
    const s = battle();
    const me = s.players[0];
    me.discard.push(...me.hand.splice(0), ...me.deck.splice(0));
    me.hand.push({ uid: 'h1', defId: 'coolant_array' });
    const t = endTurn(endTurn(s));
    expect(t.players[0].deck.length).toBe(0);
    expect(t.players[0].hand.length).toBe(1);
    expect(t.players[0].heat).toBe(s.players[0].heat);
  });

  it('takes destroyed cards out of the battle, and wounds the hero for a turn', () => {
    let s = battle({ them: { tableau: [HERO], hero: HERO, rooms: rooms({ attack: [9, 9, 9, 9, 9] }), heroStats: { attack: 20, defence: 2 } } });
    s = endTurn(s); // the station's day: its hero strikes ours
    const them = activePlayer(s);
    const myHero = s.players[0].tableau.find((c) => c.slot === COMMAND_SLOT)!;
    s = applyAction(s, { type: 'attack', attackerUid: them.tableau[0].uid, targetUid: myHero.uid });
    const me = s.players[0];
    expect(me.tableau.some((c) => c.defId === HERO)).toBe(false);
    expect(me.wounded?.card.defId).toBe(HERO);
    expect(me.discard.some((c) => c.defId === HERO)).toBe(false);
    s = endTurn(s); // our day: the hero sits it out
    expect(s.players[0].wounded).toBeTruthy();
    s = endTurn(endTurn(s)); // the next: back in the command room
    expect(s.players[0].wounded).toBeUndefined();
    expect(s.players[0].tableau.find((c) => c.slot === COMMAND_SLOT)?.defId).toBe(HERO);
  });

  it('beats a side with nothing left, but not one whose hero is only wounded', () => {
    let s = battle({ me: { heroStats: { attack: 30, defence: 2 } } });
    const station = s.players[1];
    station.hand = [];
    station.deck = [];
    station.tableau = [{ uid: 'last', defId: 'coolant_array', slot: 2, stability: 1 }];
    const hero = s.players[0].tableau[0];
    s = applyAction(s, { type: 'attack', attackerUid: hero.uid, targetUid: 'last' });
    expect(s.players[1].fallen?.some((c) => c.uid === 'last')).toBe(true);
    expect(s.winnerId).toBe(s.players[0].id);

    let t = battle();
    const me = t.players[0];
    me.hand = [];
    me.deck = [];
    const heroCard = me.tableau.splice(0)[0];
    me.wounded = { card: heroCard, left: 1 };
    t = endTurn(t);
    expect(t.winnerId).toBeNull();
  });

  it('turns draw effects into stabilising the most worn ally', () => {
    let s = battle({ me: { deck: ['deep_scanners', 'coolant_array'] } });
    const me = s.players[0];
    const worn = { uid: 'worn', defId: 'coolant_array', slot: 0, stability: 1 };
    me.tableau.push(worn);
    const handBefore = me.hand.length;
    s = playFirst(s, 'deep_scanners');
    const after = s.players[0];
    expect(after.tableau.find((c) => c.uid === 'worn')?.stability).toBe(Math.min(baseStability('coolant_array'), 3));
    expect(after.hand.length).toBe(handBefore - 1);
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
