import type { CardDef, Effect, Passive } from './types';

/**
 * Boons: abilities a campaign hero's card carries while it is in play, from the gear they wear and the
 * skills they have learned. Each is a small hidden card definition (never in a deck, shop or collection):
 * its dawn effects, play effects, passives, Sturdy and stability join the hero card's own, the same way a
 * Fusion card's do. Ids name what they do ("boon_heat_2"), so a save needs nothing more than the id.
 */

type Spec = { text: string; onTurn?: Effect[]; onPlay?: Effect[]; passive?: Passive[]; defence?: number; stability?: number };

const SPECS: Record<string, (n: number) => Spec> = {
  heat: (n) => ({ text: `{dawn}: {heat:${n}}.`, onTurn: [{ type: 'heat', amount: n, to: 'target' }] }),
  pierce: (n) => ({ text: `{dawn}: {heat:${n}}, {pierce}.`, onTurn: [{ type: 'heat', amount: n, to: 'target', pierce: true }] }),
  shield: (n) => ({ text: `{dawn}: {shield:${n}}.`, onTurn: [{ type: 'shield', amount: n }] }),
  cool: (n) => ({ text: `{dawn}: {cool:${n}}.`, onTurn: [{ type: 'cool', amount: n }] }),
  repair: (n) => ({ text: `{dawn}: {repair:${n}}.`, onTurn: [{ type: 'repair', amount: n }] }),
  draw: (n) => ({ text: `{dawn}: Draw ${n}.`, onTurn: [{ type: 'draw', amount: n }] }),
  energy: (n) => ({ text: `{dawn}: {energy:${n}}.`, onTurn: [{ type: 'plays', amount: n }] }),
  sturdy: (n) => ({ text: `{sturdy:${n}}.`, defence: n }),
  stability: (n) => ({ text: `+${n} stability.`, stability: n }),
  bulwark: (n) => ({ text: `{bulwark:${n}}.`, passive: [{ type: 'guard', amounts: [n] }] }),
  tidewall: () => ({ text: '{tidewall}.', passive: [{ type: 'tidewall' }] }),
  guard: () => ({ text: '{guard}.', passive: [{ type: 'taunt' }] }),
  playheat: (n) => ({ text: `As it is played: {heat:${n}}.`, onPlay: [{ type: 'heat', amount: n, to: 'target' }] }),
  playshield: (n) => ({ text: `As it is played: {shield:${n}}.`, onPlay: [{ type: 'shield', amount: n }] }),
  playcool: (n) => ({ text: `As it is played: {cool:${n}}.`, onPlay: [{ type: 'cool', amount: n }] }),
  playdraw: (n) => ({ text: `As it is played: Draw ${n}.`, onPlay: [{ type: 'draw', amount: n }] }),
  plant: (n) => ({ text: `As it is played: {plant:${n}}.`, onPlay: [{ type: 'plant', amount: n }] }),
};


/** A boon's id: what it does and how much ("boon_heat_2"; "boon_tidewall" for those without a number). */
export const boon = (kind: keyof typeof SPECS, n = 0) => (n ? `boon_${kind}_${n}` : `boon_${kind}`);

/** Every boon there is (numbers 1–6), as hidden card definitions. */
export const BOONS: CardDef[] = Object.entries(SPECS).flatMap(([kind, spec]) =>
  (kind === 'tidewall' || kind === 'guard' ? [0] : [1, 2, 3, 4, 5, 6]).map((n) => {
    const s = spec(n);
    return { id: boon(kind as keyof typeof SPECS, n), name: 'Boon', kind: 'command', token: true, cost: 0, stability: s.stability ?? 0, ...s } as CardDef;
  }),
);
