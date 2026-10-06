import { describe, expect, it } from 'vitest';
import { cardDef, fusedId, mergeCardText } from '../src/engine/cards';

describe('fused text', () => {
  it('sums like abilities: same keyword, same timing', () => {
    expect(mergeCardText('{cool:2}. Draw 1.', 'Draw 1.')).toEqual({ text: '{cool:2}. Draw 2.', rest: '' });
    expect(mergeCardText('{dawn}: {heat:1}. {dusk}: {cool:1}.', '{dawn}: {heat:2}. {sturdy:1}.')).toEqual({ text: '{dawn}: {heat:3}. {dusk}: {cool:1}.', rest: '{sturdy:1}.' });
  });
  it('keeps apart what differs: another timing, or a line with more to it', () => {
    expect(mergeCardText('{dawn}: {heat:1}.', '{heat:1}.')).toEqual({ text: '{dawn}: {heat:1}.', rest: '{heat:1}.' });
    expect(mergeCardText('{heat:2}, {pierce}.', '{heat:1}.')).toEqual({ text: '{heat:2}, {pierce}.', rest: '{heat:1}.' });
  });
  it("a campaign fused card's text reads summed", () => {
    expect(cardDef(fusedId('heat_sink', 'deep_scanners')).text).toBe('{cool:2}. Draw 3.');
  });
});
