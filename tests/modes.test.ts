import { describe, expect, it } from 'vitest';
import { PRESET_DECKS, deckProblems, cardDef, cardIn, createGame, applyAction, setRulesMode, modeProblem, raceTrait } from '../src/engine';

describe('game modes', () => {
  it('the core starters are legal in Core, and every other starter in Lost Races', () => {
    for (const d of PRESET_DECKS) expect(deckProblems(d.cards, d.mode ?? 'lost'), d.name).toEqual([]);
    expect(PRESET_DECKS.filter((d) => d.mode === 'core')).toHaveLength(4);
  });
  it('Lost Races cards are refused in a Core deck', () => {
    const lost = PRESET_DECKS.find((d) => d.name === 'Shard Overload')!;
    expect(deckProblems(lost.cards, 'core').length).toBeGreaterThan(0);
    expect(modeProblem(cardIn('martyr_crystal', 'core'), 'core')).toMatch(/Lost Races/);
  });
  it('core versions and race traits follow the rules in force', () => {
    expect(cardIn('halo_sentinel', 'core').text).toContain('{forge:1}');
    expect(cardIn('halo_sentinel', 'lost').text).toContain('{shield:1}');
    expect(cardIn('trench_warden', 'lost').text).toContain('{sting');
    expect(cardIn('trench_warden', 'core').text).not.toContain('{sting');
    setRulesMode('core');
    expect(raceTrait(2)).toBeUndefined();
    expect(cardDef('tide_regent').text).not.toContain('regains');
    setRulesMode('lost');
    expect(raceTrait(2)).toBeDefined();
  });
  it('a Core game plays under Core rules', () => {
    const decks = PRESET_DECKS.filter((d) => d.mode === 'core');
    setRulesMode('lost');
    let g = createGame({ seed: 3, mode: 'core', players: [{ name: 'A', isAI: false, deck: decks[0].cards }, { name: 'B', isAI: false, deck: decks[2].cards }] });
    expect(g.mode).toBe('core');
    setRulesMode('lost');
    g = applyAction(g, { type: 'endTurn' } as never);
    expect(raceTrait(0)).toBeUndefined();
    setRulesMode('lost');
  });
});

import { createCampaign, flagship, legalIn } from '../src/engine/campaign';
describe('campaign modes', () => {
  it('a core race runs in Core, with a Core deck; a Lost Race in Lost Races', () => {
    const core = createCampaign({ seed: 5, race: 2 });
    expect(core.mode).toBe('core');
    const deck = flagship(core, core.playerId)!.deck;
    expect(deck.every((id) => legalIn('core', id))).toBe(true);
    expect(createCampaign({ seed: 5, race: 5 }).mode).toBeUndefined();
  });
});
