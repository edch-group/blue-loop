import { describe, expect, it } from 'vitest';
import { activePlayer, applyAction, baseHealth, createGame, freeSlots, hasRoomFor } from '../src/engine';
import type { CardInstance, PlayerState } from '../src/engine/types';

let n = 0;
const give = (p: PlayerState, ids: string[], where: 'hand' | 'tableau' = 'hand'): CardInstance[] =>
  ids.map((defId) => {
    const c: CardInstance = { uid: `bc${n++}`, defId };
    if (where === 'tableau') {
      c.slot = freeSlots(p)[0];
      c.health = baseHealth(defId);
      p.tableau.push(c);
    } else p.hand.push(c);
    return c;
  });

describe('the Blood Cult', () => {
  it('consumes a card of your choice to play a Consume card, firing what answers it leaving', () => {
    const s = createGame({ seed: 4, players: [{ name: 'A', isAI: false }, { name: 'B', isAI: false }] });
    const me = activePlayer(s);
    me.tableau = [];
    me.playsLeft = 9;
    const rival = s.players[1];
    rival.shields = 0;
    rival.tableau = [];
    const [thrall, chalice] = give(me, ['bc_blood_thrall', 'bc_martyrs_chalice'], 'tableau');
    give(me, ['bc_hemomancer'], 'tableau');
    const [rite] = give(me, ['bc_crimson_rite']);
    const heat = rival.heat;
    // Not the Hero, nor a card not in play.
    expect(() => applyAction(s, { type: 'playCard', cardUid: rite.uid, sacrificeUid: 'nope' })).toThrow(/own cards/);
    const t = applyAction(s, { type: 'playCard', cardUid: rite.uid, sacrificeUid: thrall.uid });
    const a = t.players[0];
    expect(a.tableau.some((c) => c.uid === thrall.uid)).toBe(false);
    expect(a.tableau.some((c) => c.uid === chalice.uid)).toBe(true);
    expect(a.discard.some((c) => c.uid === thrall.uid)).toBe(true);
    // The Rite's 5, the Thrall's 3 as it leaves, the Hemomancer's 2 as another of hers leaves.
    expect(t.players[1].heat).toBe(heat + 5 + 3 + 2);
  });

  it("can't be played with nothing to consume, and takes a consumed card's slot in a full tableau", () => {
    const s = createGame({ seed: 5, players: [{ name: 'A', isAI: false }, { name: 'B', isAI: false }] });
    const me = activePlayer(s);
    me.tableau = [];
    me.playsLeft = 9;
    expect(hasRoomFor(me, 'bc_blood_offering')).toBe(false);
    const full = give(me, ['plasma_relay', 'plasma_relay', 'cryo_vault', 'bc_willing_vessel', 'plasma_relay'], 'tableau');
    expect(freeSlots(me)).toHaveLength(0);
    expect(hasRoomFor(me, 'bc_hemomancer')).toBe(true); // (it replaces one of yours)
    const [offering] = give(me, ['bc_blood_offering']);
    const hand = me.hand.length;
    const t = applyAction(s, { type: 'playCard', cardUid: offering.uid, sacrificeUid: full[3].uid });
    // Draw 2 for the Offering, and 2 more for the Vessel leaving; the Offering itself left the hand.
    expect(t.players[0].hand.length).toBe(hand - 1 + 4);
  });

});
