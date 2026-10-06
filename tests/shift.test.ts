import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { activePlayer, applyAction, baseStability, cardCost, COMMAND_SLOT, createGame, enemyChoices, freeSlots, allyChoices } from '../src/engine/game';
import type { CardInstance, GameState, PlayerState } from '../src/engine/types';

const twoPlayer = () => createGame({ seed: 3, players: [{ name: 'Ada', isAI: false }, { name: 'Bo', isAI: false }] });
let uid = 5000;
function put(p: PlayerState, defId: string, slot: number): CardInstance {
  const c: CardInstance = { uid: `s${uid++}`, defId, slot, stability: baseStability(defId) };
  p.tableau.push(c);
  return c;
}
function hand(s: GameState, defId: string): CardInstance {
  const me = activePlayer(s);
  const c: CardInstance = { uid: `s${uid++}`, defId };
  me.hand.push(c);
  me.playsLeft = Math.max(me.playsLeft, cardCost(defId));
  return c;
}

describe('shift', () => {
  it('moves one of your cards into an empty slot, or swaps it with the card there', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    const a = put(me, 'cryo_vault', 0);
    const b = put(me, 'deflector_grid', 2);
    const card = hand(s, 'gravity_tether');
    s = applyAction(s, { type: 'playCard', cardUid: card.uid, allyUid: a.uid, shiftTo: 2 });
    const now = activePlayer(s).tableau;
    expect(now.find((c) => c.uid === a.uid)!.slot).toBe(2);
    expect(now.find((c) => c.uid === b.uid)!.slot).toBe(0);
    expect(activePlayer(s).shields).toBeGreaterThanOrEqual(2);
    // Into an empty slot.
    const card2 = hand(s, 'gravity_tether');
    s = applyAction(s, { type: 'playCard', cardUid: card2.uid, allyUid: a.uid, shiftTo: 4 });
    expect(activePlayer(s).tableau.find((c) => c.uid === a.uid)!.slot).toBe(4);
  });

  it("displaces a rival's card within their tableau; a Hero stays where it leads", () => {
    let s = twoPlayer();
    const rival = s.players[1];
    const x = put(rival, 'cryo_vault', 2);
    const hero = put(rival, 'ignition_protocol', COMMAND_SLOT);
    const card = hand(s, 'orbital_tug');
    const me = activePlayer(s);
    expect(enemyChoices(s, me, 'orbital_tug').map((c) => c.uid)).toEqual([x.uid]);
    expect(enemyChoices(s, me, 'orbital_tug').some((c) => c.uid === hero.uid)).toBe(false);
    s = applyAction(s, { type: 'playCard', cardUid: card.uid, enemyUid: x.uid, shiftTo: 0 });
    expect(s.players[1].tableau.find((c) => c.uid === x.uid)!.slot).toBe(0);
  });

  it('asks where the card goes: not left out, nor its own slot', () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    const a = put(me, 'cryo_vault', 1);
    const card = hand(s, 'gravity_tether');
    expect(allyChoices(me, 'gravity_tether').map((c) => c.uid)).toEqual([a.uid]);
    expect(() => applyAction(s, { type: 'playCard', cardUid: card.uid, allyUid: a.uid })).toThrow(/slot/);
    expect(() => applyAction(s, { type: 'playCard', cardUid: card.uid, allyUid: a.uid, shiftTo: 1 })).toThrow(/slot/);
  });

  it('is played by the AI with a slot to move to', () => {
    const s = twoPlayer();
    const me = activePlayer(s);
    me.hand = [];
    put(me, 'cryo_vault', 0);
    const card = hand(s, 'gravity_tether');
    const action = chooseAIAction(s);
    if (action.type === 'playCard' && action.cardUid === card.uid) expect(action.shiftTo).toBeTypeOf('number');
    expect(() => applyAction(s, action)).not.toThrow();
    expect(freeSlots(me).length).toBeGreaterThan(0);
  });
});
