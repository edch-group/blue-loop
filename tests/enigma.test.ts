import { describe, expect, it } from 'vitest';
import { activePlayer, applyAction, baseHealth, cardAttack, createGame, enemyChoices, handCost, supernovaThreshold, COMMAND_SLOT } from '../src/engine/game';
import { CARDS, cardDef, copyLimit } from '../src/engine/cards';
import { ENIGMA_CARDS } from '../src/engine/cards-enigma';
import { enigmaChance, ENIGMA_FROM, dreamAnomalyChance, campaignCopies } from '../src/engine/campaign';
import { cardScene, hasOwnArt } from '../src/ui/cardart';
import type { CardInstance, GameState, PlayerState } from '../src/engine/types';

const twoPlayer = () => {
  const s = createGame({ seed: 3, players: [{ name: 'Ada', isAI: false }, { name: 'Bo', isAI: false }] });
  s.noReactions = true;
  return s;
};
let uid = 9000;
function put(p: PlayerState, defId: string, slot: number): CardInstance {
  const c: CardInstance = { uid: `e${uid++}`, defId, slot, health: baseHealth(defId) };
  p.tableau.push(c);
  p.tableau.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  return c;
}
function hand(s: GameState, defId: string): CardInstance {
  const me = activePlayer(s);
  const c: CardInstance = { uid: `e${uid++}`, defId };
  me.hand.push(c);
  me.playsLeft = Math.max(me.playsLeft, cardDef(defId).cost ?? 1);
  return c;
}

describe('Enigmas', () => {
  it('are a tier of their own, never in the pool, one of each to a deck, each with its own picture', () => {
    expect(ENIGMA_CARDS.length).toBeGreaterThanOrEqual(8);
    for (const c of ENIGMA_CARDS) {
      expect(c.rarity).toBe('enigma');
      expect(cardDef(c.id).name).toBe(c.name);
      expect(CARDS.some((x) => x.id === c.id)).toBe(false);
      expect(copyLimit(c.id)).toBe(1);
      expect(campaignCopies(c.id)).toBe(1);
      expect(hasOwnArt(c.id)).toBe(true);
    }
    expect(new Set(ENIGMA_CARDS.map((c) => cardScene(c).replaceAll(`a-${c.id}`, 'x'))).size).toBe(ENIGMA_CARDS.length);
  });

  it('are found only once an Anomaly is likelier than not, and rarely even then (a little less rarely from a hard event)', () => {
    expect(dreamAnomalyChance(ENIGMA_FROM)).toBeGreaterThanOrEqual(0.5);
    expect(dreamAnomalyChance(ENIGMA_FROM - 1)).toBeLessThan(0.5);
    for (let u = 1; u < ENIGMA_FROM; u++) expect(enigmaChance(u, true)).toBe(0);
    expect(enigmaChance(ENIGMA_FROM)).toBeCloseTo(0.01);
    expect(enigmaChance(ENIGMA_FROM, true)).toBeCloseTo(0.03);
    expect(enigmaChance(40)).toBeLessThanOrEqual(0.04);
  });

  it('The Second Dawn: your day ends, and you take another (but not a third)', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    put(me, 'enigma_second_dawn', 0);
    s = applyAction(s, { type: 'endTurn' });
    expect(activePlayer(s).name).toBe('Ada');
    s = applyAction(s, { type: 'endTurn' });
    expect(activePlayer(s).name).toBe('Bo');
  });

  it('The Stopped Clock: the rival\'s next day never comes', () => {
    let s = twoPlayer();
    const card = hand(s, 'enigma_stopped_clock');
    s = applyAction(s, { type: 'playCard', cardUid: card.uid });
    const bo = s.players[1].turnsTaken;
    s = applyAction(s, { type: 'endTurn' });
    expect(activePlayer(s).name).toBe('Ada');
    expect(s.players[1].turnsTaken).toBe(bo);
    s = applyAction(s, { type: 'endTurn' });
    expect(activePlayer(s).name).toBe('Bo');
  });

  it('Mirror of Ends: the suns trade heat', () => {
    let s = twoPlayer();
    s.players[0].heat = 14;
    s.players[1].heat = 2;
    const card = hand(s, 'enigma_mirror_of_ends');
    s = applyAction(s, { type: 'playCard', cardUid: card.uid });
    expect(s.players[0].heat).toBe(2);
    expect(s.players[1].heat).toBe(14);
  });

  it("The Unburning: your sun stops one short of supernova while it stands", () => {
    let s = twoPlayer();
    const bo = s.players[1];
    put(bo, 'enigma_unburning', 2);
    bo.heat = supernovaThreshold(bo) - 2;
    s.players[0].heat = 0;
    const card = hand(s, 'enigma_mirror_of_ends');
    s.players[0].heat = supernovaThreshold(s.players[0]) + 5;
    s = applyAction(s, { type: 'playCard', cardUid: card.uid });
    expect(s.players[1].eliminated).toBe(false);
    expect(s.players[1].heat).toBe(supernovaThreshold(s.players[1]) - 1);
    expect(s.winnerId).toBeNull();
  });

  it("Usurper's Crown: a rival card comes over, ready; a Hero stays", () => {
    let s = twoPlayer();
    const bo = s.players[1];
    const x = put(bo, 'cryo_vault', 2);
    put(bo, 'ignition_protocol', COMMAND_SLOT);
    const card = hand(s, 'enigma_usurpers_crown');
    expect(enemyChoices(s, activePlayer(s), 'enigma_usurpers_crown').map((c) => c.uid)).toEqual([x.uid]);
    s = applyAction(s, { type: 'playCard', cardUid: card.uid, enemyUid: x.uid });
    expect(s.players[1].tableau.some((c) => c.uid === x.uid)).toBe(false);
    const mine = s.players[0].tableau.find((c) => c.uid === x.uid)!;
    expect(mine).toBeDefined();
    expect(mine.dimmed).toBeFalsy();
  });

  it('Singularity Seed: its attack doubles each dawn', () => {
    let s = twoPlayer();
    const seed = put(s.players[0], 'enigma_singularity_seed', 1);
    const at = () => cardAttack(s, s.players[0], s.players[0].tableau.find((c) => c.uid === seed.uid)!);
    const a0 = at();
    s = applyAction(s, { type: 'endTurn' });
    s = applyAction(s, { type: 'endTurn' });
    expect(at()).toBe(a0 * 2);
    s = applyAction(s, { type: 'endTurn' });
    s = applyAction(s, { type: 'endTurn' });
    expect(at()).toBe(a0 * 4);
  });

  it('Zero-Point Core: your other cards cost nothing', () => {
    let s = twoPlayer();
    const me = activePlayer(s);
    put(me, 'enigma_zero_point', 0);
    const dear = hand(s, 'enigma_second_dawn');
    expect(handCost(dear, activePlayer(s))).toBe(0);
    activePlayer(s).playsLeft = 0;
    s = applyAction(s, { type: 'playCard', cardUid: dear.uid });
    expect(s.players[0].tableau.some((c) => c.uid === dear.uid)).toBe(true);
  });

  it("Null Edict: the rival's cards' dawns don't happen", () => {
    let s = twoPlayer();
    put(s.players[0], 'enigma_null_edict', 2);
    const bo = s.players[1];
    put(bo, 'frost_lattice', 1);
    s = applyAction(s, { type: 'endTurn' });
    expect(activePlayer(s).name).toBe('Bo');
    expect(activePlayer(s).shields).toBe(0);
  });
});
