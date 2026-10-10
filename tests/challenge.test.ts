import { describe, expect, it } from 'vitest';
import { applyCampaignAction, createCampaign, flagship, nodeById, simulateBattle, visibleNodes, type CampaignState } from '../src/engine/campaign';
import { LOST_LORDS } from '../src/engine/cards-bosses';

/** A run with its flagship standing next to a challenge of this kind, revealed. */
function nextTo(kind: 'mine' | 'lord' | 'frost'): CampaignState | null {
  for (let seed = 1; seed < 60; seed++) {
    const s = createCampaign({ seed, race: 0 });
    const ch = s.nodes.find((n) => n.challenge?.kind === kind);
    if (!ch) continue;
    const from = nodeById(s, ch.challenge!.from);
    from.owner = s.playerId;
    ch.challenge!.hidden = false;
    const army = flagship(s, s.playerId)!;
    army.nodeId = from.id;
    return s;
  }
  return null;
}

describe('challenges', () => {
  it('lie hidden off the strip until the system they hang off is taken', () => {
    const s = createCampaign({ seed: 3, race: 0 });
    const hidden = s.nodes.filter((n) => n.challenge);
    expect(hidden.length).toBeGreaterThan(0);
    for (const n of hidden) {
      expect(n.challenge!.hidden).toBe(true);
      expect(visibleNodes(s, s.playerId).has(n.id)).toBe(false);
      expect(n.links).toEqual([n.challenge!.from]);
    }
  });

  it('a lost challenge ends nothing: the flagship is thrown clear and the challenge sealed', () => {
    let s = nextTo('mine')!;
    const army = flagship(s, s.playerId)!;
    const ch = s.nodes.find((n) => n.challenge?.kind === 'mine')!;
    const at = army.nodeId;
    army.damage = 2;
    s = applyCampaignAction(s, { type: 'move', armyId: army.id, toId: ch.id });
    expect(s.battle?.challenge?.kind).toBe('mine');
    // (The challenger concedes: a loss.)
    const g = s.battle!.game;
    const lost = { ...g, winnerId: g.players[1].id, players: g.players.map((p, i) => (i === 0 ? { ...p, eliminated: true } : p)) };
    s = applyCampaignAction(s, { type: 'finishBattle', game: lost });
    expect(s.winner).toBeFalsy();
    expect(nodeById(s, ch.id).challenge!.done).toBe('lost');
    expect(flagship(s, s.playerId)!.nodeId).toBe(at);
    expect(flagship(s, s.playerId)!.damage).toBe(2);
  });

  it('the Antimatter Mine pays for the crystals broken; it ends when its days run out', () => {
    let s = nextTo('mine')!;
    const army = flagship(s, s.playerId)!;
    const ch = s.nodes.find((n) => n.challenge?.kind === 'mine')!;
    s = applyCampaignAction(s, { type: 'move', armyId: army.id, toId: ch.id });
    const g = simulateBattle(s.battle!.game);
    const before = s.factions.find((f) => f.id === s.playerId)!.materials;
    s = applyCampaignAction(s, { type: 'finishBattle', game: g });
    if (g.winnerId === g.players[0].id) {
      expect(s.factions.find((f) => f.id === s.playerId)!.materials).toBe(before + 3 * (g.challenge?.broken ?? 0));
      expect(nodeById(s, ch.id).challenge!.done).toBe('won');
    }
  });

  it('a Lost Lord beaten joins the deck; a Frost Line held gives a choice', () => {
    let s = nextTo('lord');
    if (s) {
      const army = flagship(s, s.playerId)!;
      const ch = s.nodes.find((n) => n.challenge?.kind === 'lord')!;
      s = applyCampaignAction(s, { type: 'move', armyId: army.id, toId: ch.id });
      const g = s.battle!.game;
      const won = { ...g, winnerId: g.players[0].id, players: g.players.map((p, i) => (i === 1 ? { ...p, eliminated: true } : p)) };
      s = applyCampaignAction(s, { type: 'finishBattle', game: won });
      expect(LOST_LORDS.some((id) => flagship(s!, s!.playerId)!.deck.includes(id))).toBe(true);
      // (And the map shows it as the battle's loot.)
      expect(s.loot?.won).toBe(true);
      expect(s.loot?.cards.some((id) => LOST_LORDS.includes(id))).toBe(true);
    }
    let f = nextTo('frost')!;
    const army = flagship(f, f.playerId)!;
    const ch = f.nodes.find((n) => n.challenge?.kind === 'frost')!;
    f = applyCampaignAction(f, { type: 'move', armyId: army.id, toId: ch.id });
    const g = f.battle!.game;
    const won = { ...g, winnerId: g.players[0].id, players: g.players.map((p, i) => (i === 1 ? { ...p, eliminated: true } : p)) };
    f = applyCampaignAction(f, { type: 'finishBattle', game: won });
    expect(f.boon).toBeDefined();
    expect(f.frostLevel).toBe(1);
    f = applyCampaignAction(f, { type: 'takeBoon', pick: 'health' });
    expect(f.factions.find((x) => x.id === f.playerId)!.sunBonus).toBe(5);
  });
});
