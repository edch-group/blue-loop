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
  it('a card is the same card in every mode, race traits and all', () => {
    for (const id of ['halo_sentinel', 'trench_warden', 'tide_regent', 'riptide', 'sunforge']) expect(cardIn(id, 'core')).toBe(cardIn(id, 'lost'));
    setRulesMode('core');
    expect(raceTrait(2)).toBeDefined();
    const inCore = cardDef('trench_warden').text;
    setRulesMode('lost');
    expect(cardDef('trench_warden').text).toBe(inCore);
  });
  it('a Core game plays under Core rules', () => {
    const decks = PRESET_DECKS.filter((d) => d.mode === 'core');
    setRulesMode('lost');
    let g = createGame({ seed: 3, mode: 'core', players: [{ name: 'A', isAI: false, deck: decks[0].cards }, { name: 'B', isAI: false, deck: decks[2].cards }] });
    expect(g.mode).toBe('core');
    setRulesMode('lost');
    g = applyAction(g, { type: 'endTurn' } as never);
    expect(g.mode).toBe('core');
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
