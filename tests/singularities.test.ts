import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { cardDef } from '../src/engine/cards';
import { captainDef, CAPTAIN } from '../src/engine/captain';
import { activePlayer, applyAction, baseHealth, COMMAND_SLOT, createGame, singularityProblem } from '../src/engine/game';
import { CHARGE_TEXT, SINGULARITIES, singularityOf } from '../src/engine/singularities';
import { buyCaptain, captainCard, emptyMeta, setCaptainSingularity, xpForLevel } from '../src/engine/meta';
import { captainId } from '../src/engine/captain';
import { GENERALS } from '../src/engine/story';
import type { CardInstance, GameState } from '../src/engine/types';
import { TEST_DECKS } from './fixture-decks';

const game = () => createGame({ seed: 3, players: [{ name: 'Ada', isAI: false, deck: TEST_DECKS[0].cards }, { name: 'Bo', isAI: false, deck: TEST_DECKS[1].cards }] });
/** A Hero leading the active player's tableau. */
function lead(s: GameState, defId: string) {
  const p = activePlayer(s);
  const hero: CardInstance = { uid: 'hero1', defId, slot: COMMAND_SLOT, health: baseHealth(defId) };
  p.tableau.push(hero);
  return hero;
}

describe('singularities', () => {
  it('every Hero has one of its own, charging from its own kind of thing, written on its card', () => {
    const heroes = [...GENERALS.flat(), 'bc_hero_sanguis'];
    for (const id of heroes) {
      const k = singularityOf(id);
      expect(k, id).toBeTruthy();
      expect(cardDef(id).text, id).toContain(`{sing:${k!.name}}`);
    }
    expect(captainDef(CAPTAIN)!.text).toContain('{sing:Back to the Wall}');
    // (No two alike in what charges them.)
    const kinds = Object.values(SINGULARITIES).map((k) => k.charge);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of Object.values(SINGULARITIES)) expect(CHARGE_TEXT[k.charge](k.need)).toBeTruthy();
  });

  it('charges while its Hero leads, is unleashed free once full, and empties', () => {
    let s = game();
    const hero = lead(s, 'coolant_protocol');
    const me = activePlayer(s);
    me.heat = 20;
    expect(singularityProblem(s, me)).toMatch(/Charging 0\/10/);
    // Vent (cool 2) five times over the days: 10 cooled, charged.
    for (let i = 0; i < 5; i++) {
      s = applyAction(s, { type: 'heroAbility', index: 0 });
      s = applyAction(applyAction(s, { type: 'endTurn' }), { type: 'endTurn' });
      activePlayer(s).heat = 20;
    }
    const h = activePlayer(s).tableau.find((c) => c.uid === hero.uid)!;
    expect(h.charge).toBe(10);
    expect(singularityProblem(s, activePlayer(s))).toBeNull();
    const energy = activePlayer(s).playsLeft;
    s = applyAction(s, { type: 'singularity' });
    const after = activePlayer(s);
    expect(after.heat).toBeLessThanOrEqual(20 - 6);
    expect(after.shields).toBeGreaterThanOrEqual(3);
    expect(after.playsLeft).toBe(energy);
    expect(after.tableau.find((c) => c.uid === hero.uid)!.charge).toBe(0);
    expect(() => applyAction(s, { type: 'singularity' })).toThrow(/Charging/);
  });

  it('the AI unleashes a charged singularity when it helps', () => {
    const s = game();
    const hero = lead(s, 'ignition_protocol');
    hero.charge = SINGULARITIES.ignition_protocol.need;
    s.players[0].isAI = true;
    expect(chooseAIAction(s)).toEqual({ type: 'singularity' });
  });

  it("the Captain's is chosen: Back to the Wall first, charged by any damage taken, blasting a card and those beside it", () => {
    let s = game();
    const hero = lead(s, CAPTAIN);
    expect(singularityOf(CAPTAIN)!.name).toBe('Back to the Wall');
    const me = activePlayer(s), rival = s.players[1];
    // Rival cards in a row; the middle one blasted.
    for (const [i, id] of ['coronal_lance', 'coronal_lance', 'coronal_lance'].entries()) rival.tableau.push({ uid: `r${i}`, defId: id, slot: i, health: 9 });
    // Damage taken, from anything (here its own sun's strain): charged.
    hero.charge = 9;
    me.shields = 0;
    s = applyAction(s, { type: 'heroAbility', index: 0 });
    expect(activePlayer(s).tableau.find((c) => c.uid === hero.uid)!.charge).toBeLessThanOrEqual(10);
    activePlayer(s).tableau.find((c) => c.uid === hero.uid)!.charge = 10;
    const hp = (st: GameState, uid: string) => st.players[1].tableau.find((c) => c.uid === uid)!;
    const before = ['r0', 'r1', 'r2'].map((u) => (hp(s, u).health ?? 0) + 0);
    s = applyAction(s, { type: 'singularity', aimUid: 'r1' });
    const lost = ['r0', 'r1', 'r2'].map((u, i) => before[i] - (hp(s, u).health ?? 0) + (hp(s, u).dented ?? 0));
    expect(lost[1]).toBe(3);
    expect(lost[0]).toBe(2);
    expect(lost[2]).toBe(2);
    // Another learnt and chosen: written into the Captain's card.
    let meta = { ...emptyMeta(), xp: xpForLevel(8) };
    meta = buyCaptain(meta, { kind: 'sing', id: 'stand' });
    expect(singularityOf(captainCard(meta))!.name).toBe('Last Stand');
    meta = setCaptainSingularity(meta, 'wall');
    expect(singularityOf(captainCard(meta))!.name).toBe('Back to the Wall');
    expect(singularityOf(captainId({ attack: 1, stability: 0, cheaper: 0, abilities: ['brace'], sing: 'scrap' }))!.name).toBe('Scrap Run');
  });
});
