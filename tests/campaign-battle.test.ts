import { describe, expect, it } from 'vitest';
import { chooseAIAction } from '../src/engine/ai';
import { campaignCardId, cardDef } from '../src/engine/cards';
import { activateProblem, activePlayer, applyAction, attackProblem, cardAttack, cardDefence, COMMAND_SLOT, createGame, isGameOver } from '../src/engine/game';
import type { GameState, PlayerSetup, ShipRooms } from '../src/engine/types';

const HERO = 'command_directive'; // (no attack of its own)
const C = campaignCardId;
const rooms = (over: Partial<ShipRooms> = {}): ShipRooms => ({ defence: [0, 0, 0, 0, 0], attack: [0, 0, 0, 0, 0], command: 1, ...over });

/** A campaign battle: a flagship (hero, rooms, energy, a few cards) against a hero-less station. */
function battle(opts: { me?: Partial<PlayerSetup>; them?: Partial<PlayerSetup> } = {}): GameState {
  return createGame({
    seed: 3,
    campaign: true,
    players: [
      { name: 'Flagship', isAI: false, deck: [C(HERO), C('focusing_array'), C('coolant_array')], tableau: [C(HERO)], hero: C(HERO), rooms: rooms(), heroStats: { attack: 1, defence: 2 }, energy: { cap: 5, regen: 1 }, ...opts.me },
      { name: 'Station', isAI: false, deck: [C('coolant_array'), C('cryo_vault')], energy: { cap: 4, regen: 1 }, ...opts.them },
    ],
  });
}
const endTurn = (s: GameState) => applyAction(s, { type: 'endTurn' });

describe('campaign card versions', () => {
  it('turns Lightspeed cards into room cards, and Draw, Recall and Recover into stabilising', () => {
    const snare = cardDef(C('frost_snare'));
    expect(snare.kind).toBe('defence');
    expect(snare.lightspeed).toBeUndefined();
    expect(snare.onPlay).toEqual([{ type: 'heat', amount: 1, to: 'target' }]);
    expect(cardDef(C('archive_vault')).text).toBe('Stabilise 2.');
    expect(cardDef(C('gravity_sling')).text).toMatch(/Stabilise 1/);
    expect(cardDef(C('blink_bulwark')).text).not.toMatch(/lightspeed/);
    expect(cardDef(C('coronal_lance')).campaignOf).toBe('coronal_lance');
  });
});

describe('campaign battles', () => {
  it('starts every card in a room, the hero in the command room, with a full energy store and no hand', () => {
    const s = battle();
    const me = s.players[0];
    expect(me.hand).toHaveLength(0);
    expect(me.deck).toHaveLength(0);
    expect(me.tableau.find((c) => c.slot === COMMAND_SLOT)?.defId).toBe(C(HERO));
    expect(me.tableau.map((c) => c.defId).sort()).toEqual([C(HERO), C('focusing_array'), C('coolant_array')].sort());
    expect(me.playsLeft).toBe(5);
    expect(s.players[1].tableau).toHaveLength(2);
    expect(cardDefence(me, me.tableau.find((c) => c.slot === COMMAND_SLOT)!)).toBe(cardDefence({ ...me, rooms: undefined, heroStats: undefined }, me.tableau[0]) + 1 + 2);
  });

  it('activates a card in its room for its cost, once a day; energy carries over and regains its rate', () => {
    let s = battle({ me: { deck: [C(HERO), C('heat_sink')] } });
    const sink = s.players[0].tableau.find((c) => c.defId === C('heat_sink'))!;
    const cost = cardDef(C('heat_sink')).cost ?? 1;
    s = applyAction(s, { type: 'activate', cardUid: sink.uid });
    expect(s.players[0].playsLeft).toBe(5 - cost);
    expect(s.players[0].shields).toBeGreaterThan(0);
    expect(activateProblem(s, s.players[0], sink.uid)).toMatch(/today/);
    s = endTurn(endTurn(s));
    expect(s.players[0].playsLeft).toBe(Math.min(5, 5 - cost + 1));
    // (Shields don't fade.)
    expect(s.players[0].shields).toBeGreaterThan(0);
  });

  it('lets a trained hero fight, and a room’s guns add to the card in it', () => {
    const s = battle();
    const me = s.players[0];
    const hero = me.tableau.find((c) => c.slot === COMMAND_SLOT)!;
    expect(cardAttack(s, me, hero)).toBe(1);
    expect(attackProblem(s, me, hero.uid)).toBeNull();
    const gun = me.tableau.find((c) => c.defId === C('focusing_array'))!;
    const before = cardAttack(s, me, gun);
    me.rooms!.attack[gun.slot!] = 2;
    expect(cardAttack(s, me, gun)).toBe(before + 2);
  });

  it('takes destroyed cards out of the battle, wounds the hero for a turn, and benches a card sent back', () => {
    let s = battle({ them: { deck: [C(HERO)], tableau: [C(HERO)], hero: C(HERO), rooms: rooms({ attack: [9, 9, 9, 9, 9] }), heroStats: { attack: 20, defence: 2 } } });
    s = endTurn(s);
    const them = activePlayer(s);
    const myHero = s.players[0].tableau.find((c) => c.slot === COMMAND_SLOT)!;
    s = applyAction(s, { type: 'attack', attackerUid: them.tableau[0].uid, targetUid: myHero.uid });
    expect(s.players[0].wounded?.card.defId).toBe(C(HERO));
    s = endTurn(s);
    s = endTurn(endTurn(s));
    expect(s.players[0].tableau.find((c) => c.slot === COMMAND_SLOT)?.defId).toBe(C(HERO));
  });

  it('is lost when every card on the ship is gone (a wounded hero still counts)', () => {
    let s = battle({ me: { heroStats: { attack: 30, defence: 2 } } });
    s.players[1].tableau = [{ uid: 'last', defId: C('coolant_array'), slot: 2, stability: 1 }];
    const hero = s.players[0].tableau.find((c) => c.slot === COMMAND_SLOT)!;
    s = applyAction(s, { type: 'attack', attackerUid: hero.uid, targetUid: 'last' });
    expect(s.winnerId).toBe(s.players[0].id);
  });

  it('plays itself out with the AI on both sides', () => {
    for (const seed of [1, 2, 3, 4]) {
      let s = createGame({
        seed,
        campaign: true,
        players: [
          { name: 'A', isAI: true, deck: [C(HERO), C('focusing_array'), C('coronal_lance'), C('deflector_grid'), C('heat_sink')], tableau: [C(HERO)], hero: C(HERO), rooms: rooms(), heroStats: { attack: 1, defence: 2 }, energy: { cap: 5, regen: 1 } },
          { name: 'B', isAI: true, deck: [C('coronal_lance'), C('cryo_vault'), C('photon_drill')], energy: { cap: 4, regen: 1 } },
        ],
      });
      for (let i = 0; i < 3000 && !isGameOver(s); i++) s = applyAction(s, chooseAIAction(s));
      expect(isGameOver(s)).toBe(true);
    }
  });
});
