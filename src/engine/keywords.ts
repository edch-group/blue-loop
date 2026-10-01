/**
 * Keywords: the game's recurring mechanics, written into card text as tokens
 * (`{sturdy:1}`, `{resonance:2/1}`, `{recover:attack}`, `{lightspeed}`) so a
 * card says each one in a word or two with its number, and the rules explain
 * it once. The UI draws a token as coloured text ("sturdy 1"); its
 * explanation appears in the zoomed card, on hover, and on the rules page.
 */

export interface Keyword {
  /** As it reads on a card. */
  name: string;
  /** Colour family on the card. */
  group: 'defence' | 'resonance' | 'stability' | 'recovery' | 'removal' | 'shields' | 'lightspeed' | 'global' | 'orbit' | 'heat' | 'tempo' | 'timing';
  /** What it means, for a given value (or in general, without one). */
  explain: (value?: string) => string;
}

const n = (v: string | undefined, d = 'N') => v ?? d;

export const KEYWORDS: Record<string, Keyword> = {
  turn: { name: 'start of turn', group: 'timing', explain: () => 'Happens at the start of each of your turns while the card is in your tableau.' },
  sturdy: { name: 'sturdy', group: 'defence', explain: (v) => `This card has +${n(v)} defence, on top of its slot's. Removal can only reach cards with low enough defence.` },
  bulwark: {
    name: 'bulwark',
    group: 'defence',
    explain: (v) => {
      const [a, b] = n(v).split('/');
      return `Cards next to this one get +${a} defence${b ? `; cards two slots away get +${b}` : ''}.`;
    },
  },
  resonance: {
    name: 'resonance',
    group: 'resonance',
    explain: (v) => {
      const [a, b] = n(v).split('/');
      return `Your cards next to this one get +${a} to their heat, cooling and shields${b ? `; cards two places away get +${b}` : ''}. An empty slot between them breaks it.`;
    },
  },
  forge: { name: 'forge', group: 'resonance', explain: (v) => `Resonance for attack cards only: your attack cards next to this one deal +${n(v)} heat.` },
  anchor: { name: 'anchor', group: 'stability', explain: () => 'Your cards next to this one lose no stability (this card still does).' },
  erode: { name: 'erode', group: 'stability', explain: (v) => `A card of your choice in your rival's tableau loses ${n(v)} stability. At 0 it fades into their discard pile.` },
  decay: { name: 'decay', group: 'stability', explain: (v) => `Every card in your rival's tableau loses ${n(v)} stability. At 0 they fade into the discard pile.` },
  restore: { name: 'restore', group: 'stability', explain: (v) => `Another card of yours (your choice) regains ${n(v)} stability (up to 6).` },
  renew: { name: 'renew', group: 'stability', explain: (v) => `Every other card of yours regains ${n(v)} stability (up to 6).` },
  recover: {
    name: 'recover',
    group: 'recovery',
    explain: (v) => `Return ${v ? `a${/^[aeiou]/.test(v) ? 'n' : ''} ${v} card` : 'a card'} of your choice from your discard pile to your hand. With none there, draw a card instead.`,
  },
  recall: { name: 'recall', group: 'recovery', explain: () => 'Return another card of yours from your tableau to your hand, to play it again (its leave effects fire, and the slot is free).' },
  destroy: { name: 'destroy', group: 'removal', explain: (v) => (v && v !== 'any' ? `Destroy a card of your choice in your rival's tableau with ${v} or less defence.` : "Destroy a card of your choice in your rival's tableau, whatever its defence.") },
  eject: { name: 'eject', group: 'removal', explain: (v) => `Return a card of your choice in your rival's tableau with ${n(v)} or less defence to its owner's hand.` },
  sting: { name: 'sting', group: 'shields', explain: (v) => `When your shields absorb an enemy's heat, heat that enemy's sun by ${n(v)} (once per attacking card each turn).` },
  soothe: { name: 'soothe', group: 'shields', explain: (v) => `When your shields absorb an enemy's heat, cool your sun by ${n(v)} (once per attacking card each turn).` },
  hold: { name: 'hold', group: 'shields', explain: (v) => `Your shields no longer fade at the start of your turn (they keep, up to ${n(v, '12')}).` },
  overheated: { name: 'overheated', group: 'heat', explain: () => 'Your sun is at half its max health or hotter.' },
  grows: { name: 'grows', group: 'tempo', explain: (v) => `At the start of each of your turns this card grows by 1, up to ${n(v)}.` },
  plays: { name: 'plays', group: 'tempo', explain: (v) => `You may play ${n(v, '1')} extra card${v === '1' || !v ? '' : 's'} each turn while this is in play.` },
  orbit: { name: 'orbit', group: 'orbit', explain: (v) => `Moves the planets round a sun by ${n(v)} turn${v === '+1' || v === '-1' || v === '−1' ? '' : 's'} (each planet faces it for 3).` },
  lightspeed: { name: 'lightspeed', group: 'lightspeed', explain: () => "Played face down in your Lightspeed slot (one at a time). It springs during an enemy's turn when its trigger happens, then goes to your discard pile." },
  global: { name: 'global', group: 'global', explain: () => 'Changes the table for both players while it is in play. Only one global card can be in play: a new one replaces it.' },
};

const TOKEN = /\{([a-z]+)(?::([^}]+))?\}/g;

/** A keyword as it reads on a card: its name and value ("sturdy 1", "destroy ≤2", "recover attack"). */
export function keywordLabel(id: string, value?: string): string {
  const k = KEYWORDS[id];
  if (!k) return value ?? id;
  if (!value) return k.name;
  if (id === 'destroy' || id === 'eject') return value === 'any' ? `${k.name} any` : `${k.name} ≤${value}`;
  if (id === 'plays') return `${k.name} +${value}`;
  if (id === 'resonance' || id === 'bulwark' || id === 'forge' || id === 'sting' || id === 'soothe' || id === 'restore' || id === 'renew' || id === 'erode' || id === 'decay') return `${k.name} ${value.replace('/', ' · ')}`;
  return `${k.name} ${value}`;
}

/** Split card text into plain text and keywords, in order. */
export function textParts(text: string): ({ text: string } | { kw: string; value?: string })[] {
  const out: ({ text: string } | { kw: string; value?: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ kw: m[1], value: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Card text as plain words (for tooltips and the like): each keyword by its label. */
export function plainText(text: string): string {
  return textParts(text)
    .map((p) => ('text' in p ? p.text : keywordLabel(p.kw, p.value)))
    .join('')
    .replace(/^./, (c) => c.toUpperCase());
}

/** The keywords a card's text uses (each once), with their values. */
export function keywordsIn(text: string): { id: string; value?: string }[] {
  const seen = new Set<string>();
  const out: { id: string; value?: string }[] = [];
  for (const p of textParts(text)) {
    if ('kw' in p && !seen.has(`${p.kw}:${p.value}`)) {
      seen.add(`${p.kw}:${p.value}`);
      out.push({ id: p.kw, value: p.value });
    }
  }
  return out;
}
