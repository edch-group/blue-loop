/**
 * Rifts: wormholes off the route (secret nodes), each leading into a short, extremely hard galaxy ruled by one of the
 * Lost Races [direction: wormholes as a secret node, each holding one of the four Lost Races; "enter wormhole? You may
 * not come back"]. Gone through, there is no way back: the rift's galaxy is crossed to its ruler, and beaten, its own
 * wormhole leads on into the next galaxy of the run.
 *
 * The Dark Galaxy (the Nyxari): black stars in complete darkness, one star ahead seen at a time, the stars behind
 * vanishing; Nyxari foes, rewards, research and stations; a Dark Prophet who marks a card with a Nyxari keyword for
 * good; Nyxara, the Unlit, at its end.
 *
 * Time Dense Space (the Seren): a circular galaxy turning anticlockwise, its rings at their own speeds, so the stars in
 * reach change every second; sound runs backwards; Seren foes and rewards; Aster, the Last Constellation, at its
 * heart, who grants one of three Seren emblems.
 */
import type { CardDef } from './types';

export type RiftKind = 'dark' | 'time';

export const RIFTS: Record<RiftKind, { race: number; name: string; ruler: string; text: string }> = {
  dark: { race: 4, name: 'The Dark Galaxy', ruler: 'nyx_hero_nyxara', text: 'Overrun by the Nyxari. Only the next star can be seen, and the stars behind vanish into the dark.' },
  time: { race: 6, name: 'Time Dense Space', ruler: 'ser_hero_aster', text: 'Ruled by the Seren. The galaxy turns, and the stars in reach change every second.' },
};

/** The rifts there are so far (the other two Lost Races' are still to come). */
export const RIFT_KINDS: RiftKind[] = ['dark', 'time'];

/** How many jumps a rift's galaxy is, from where it is entered to its ruler. */
export const RIFT_JUMPS = 5;

// ---------------------------------------------------------------------------
// The Dark Prophet's marks: a Nyxari keyword set on a card for good. A marked card's id names its mark and its card
// ("nyx:veil:coronal_lance"), so, like a fused card, it needs no storage of its own.
// ---------------------------------------------------------------------------

export type NyxMark = 'darkspeed' | 'unmake' | 'veil' | 'nightfall' | 'sting';

const MARK = 'nyx:';

export const NYX_MARKS: Record<NyxMark, { name: string; text: string }> = {
  darkspeed: { name: 'Darkspeed', text: '{darkspeed}' },
  unmake: { name: 'Unmaking', text: '{destroy:1}' },
  veil: { name: 'Veil', text: '{shield:2}' },
  nightfall: { name: 'Nightfall', text: '{dawn}: {heat:1}' },
  sting: { name: 'Sting', text: '{sting:1}' },
};

export const markedId = (mark: NyxMark, id: string) => `${MARK}${mark}:${id}`;
export const isMarked = (id: string) => id.startsWith(MARK);

/** A marked card's mark and the card it marks (null if it isn't one). */
export function markOf(id: string): { mark: NyxMark; base: string } | null {
  if (!isMarked(id)) return null;
  const rest = id.slice(MARK.length);
  const i = rest.indexOf(':');
  const mark = rest.slice(0, i) as NyxMark;
  return NYX_MARKS[mark] ? { mark, base: rest.slice(i + 1) } : null;
}

/** Whether a card stays in play once played (not one that does its work and is gone). */
const stays = (d: CardDef) => d.kind !== 'trap' && d.kind !== 'relic' && d.kind !== 'global' && !!(d.onTurn?.length || d.passive?.length || (d.attack ?? 0) > 0 || (d.defence ?? 0) > 0 || d.kind === 'command' || d.health);

/** The marks a card can take (none it has already; Darkspeed only on a card that attacks). */
export function marksFor(d: CardDef): NyxMark[] {
  if (isMarked(d.id) || d.kind === 'trap' || d.kind === 'relic' || d.kind === 'global') return [];
  const out: NyxMark[] = [];
  if ((d.attack ?? 0) > 0 && !d.darkspeed && !/\{darkspeed\}/.test(d.text)) out.push('darkspeed');
  if (!(d.onPlay ?? []).some((e) => e.type === 'destroy')) out.push('unmake');
  out.push('veil');
  if (stays(d)) out.push('nightfall');
  if (stays(d) && !/\{sting/.test(d.text)) out.push('sting');
  return out;
}

/** A marked card: its own, with the mark's keyword set first in its text and its work added. */
export function markedDef(id: string, base: (id: string) => CardDef | undefined): CardDef | undefined {
  const m = markOf(id);
  const d = m && base(m.base);
  if (!m || !d) return undefined;
  const def: CardDef = { ...d, id, text: `${NYX_MARKS[m.mark].text}. ${d.text}`.trim() };
  if (m.mark === 'darkspeed') def.darkspeed = true;
  if (m.mark === 'unmake') def.onPlay = [...(d.onPlay ?? []), { type: 'destroy', maxDefence: 1 }];
  if (m.mark === 'veil') def.onPlay = [...(d.onPlay ?? []), { type: 'shield', amount: 2 }];
  if (m.mark === 'nightfall') def.onTurn = [...(d.onTurn ?? []), { type: 'heat', amount: 1, to: 'target' }];
  if (m.mark === 'sting') def.passive = [...(d.passive ?? []), { type: 'retaliate', amount: 1 }];
  return def;
}
