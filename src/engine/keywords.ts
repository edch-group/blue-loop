/**
 * Keywords: the game's recurring mechanics, written into card text as tokens
 * (`{sturdy:1}`, `{resonance:2/1}`, `{recover:attack}`, `{lightspeed}`) so a
 * card says each one in a word or two with its number, and the rules explain
 * it once. The UI draws a token as coloured text in title case ("Sturdy 1"); its
 * explanation appears in the zoomed card, on hover, and on the rules page.
 */

export interface Keyword {
  /** As it reads on a card. */
  name: string;
  /** Colour family on the card. */
  group: 'defence' | 'resonance' | 'stability' | 'recovery' | 'removal' | 'shields' | 'lightspeed' | 'global' | 'orbit' | 'heat' | 'cool' | 'tempo' | 'timing';
  /** Drawn as a symbol and its number on a card (heat, cool, shields), not as a word. */
  symbol?: boolean;
  /** What it means, for a given value (or in general, without one). */
  explain: (value?: string) => string;
}

const n = (v: string | undefined, d = 'N') => v ?? d;

export const KEYWORDS: Record<string, Keyword> = {
  dawn: { name: 'dawn', group: 'timing', explain: () => 'Happens at dawn (the start of each of your days) while the card is in your tableau.' },
  heat: {
    name: 'heat',
    group: 'heat',
    symbol: true,
    explain: (v) => (v?.startsWith('+') ? `${v.slice(1)} more heat, on top of the card's own.` : `Heats your rival's sun${v ? ` by ${v}` : ''}, unless the card names another ("to your sun"). Shields absorb heat from enemies; at max health a sun goes supernova.`),
  },
  pierce: { name: 'pierce', group: 'heat', explain: () => 'This card\'s heat ignores shields, whether it is aimed at a sun or a card: they can\'t absorb it (nor sting or soothe back). Aimed at a card, it ignores the card\'s defence too.' },
  cool: { name: 'cool', group: 'cool', symbol: true, explain: (v) => (v?.startsWith('+') ? `${v.slice(1)} more cooling, on top of the card's own.` : `Cool your sun${v ? ` by ${v}` : ''}, taking heat off it.`) },
  shield: { name: 'shields', group: 'shields', symbol: true, explain: (v) => (v?.startsWith('+') ? `${v.slice(1)} more shield${v === '+1' ? '' : 's'}, on top of the card's own.` : `Gain ${v ? `${v} shield${v === '1' ? '' : 's'}` : 'shields'}: each absorbs 1 heat from an enemy. Shields fade at your dawn.`) },
  guard: { name: 'guard', group: 'defence', explain: () => "While this is in play, your rival's cards can only aim their heat at your Guard cards, not at your sun or your other cards. Your shields still absorb heat aimed at them." },
  sturdy: { name: 'sturdy', group: 'defence', explain: (v) => `This card has +${n(v)} defence, on top of its slot's. Defence turns aside that much of any heat aimed at the card, and removal can only reach cards with low enough defence.` },
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
  sting: { name: 'sting', group: 'shields', explain: (v) => `When your shields absorb an enemy's heat, heat that enemy's sun by ${n(v)} (once per attacking card each day).` },
  soothe: { name: 'soothe', group: 'shields', explain: (v) => `When your shields absorb an enemy's heat, cool your sun by ${n(v)} (once per attacking card each day).` },
  hold: { name: 'hold', group: 'shields', explain: (v) => `Your shields no longer fade at your dawn (they keep, up to ${n(v, '12')}).` },
  overheated: { name: 'overheated', group: 'heat', explain: () => 'Your sun is at half its max health or hotter.' },
  grows: { name: 'grows', group: 'tempo', explain: (v) => `At each of your dawns this card grows by 1, up to ${n(v)}.` },
  plays: { name: 'energy', group: 'tempo', explain: (v) => `+${n(v, '1')} energy each day while this is in play.` },
  spend: { name: 'spend all', group: 'tempo', explain: () => 'Costs all the energy you have left (at least 1). The more you spend, the bigger it is.' },
  energy: { name: 'energy', group: 'tempo', explain: (v) => `+${n(v, '1')} energy to spend today.` },
  orbit: { name: 'orbit', group: 'orbit', explain: (v) => `Moves the planets round a sun by ${n(v)} turn${v === '+1' || v === '-1' || v === '−1' ? '' : 's'} (each planet faces it for 3).` },
  lightspeed: { name: 'lightspeed', group: 'lightspeed', explain: () => "Played face down in your Lightspeed slot (one at a time). It springs during an enemy's day when its trigger happens, then goes to your discard pile." },
  global: { name: 'global', group: 'global', explain: () => 'Changes the table for both players while it is in play. Only one global card can be in play: a new one replaces it.' },
};

/**
 * Rules that card text names in plain words rather than as a keyword token:
 * the zoomed card explains them too, whenever its text mentions one.
 */
export const TEXT_RULES: { name: string; group: Keyword['group']; pattern: RegExp; explain: string }[] = [
  { name: 'One Of', group: 'tempo', pattern: /one of:/, explain: 'Pick one as you play the card: it does that at each of your dawns for as long as it stays.' },
  { name: 'Command Card', group: 'tempo', pattern: /\bCommand card|^Dawn, one of/, explain: 'Every deck has exactly 2. They stay 3 days, and can never be recovered or recalled to your hand (a rival can still send them back).' },
  { name: 'Leaves Your Tableau', group: 'stability', pattern: /leaves? your tableau/, explain: 'When the card fades, is destroyed, or returns to a hand. It goes to the discard pile (or the hand).' },
  { name: 'Facing A Planet', group: 'orbit', pattern: /facing the (dead|abundant|industrial) planet/, explain: 'The planet facing your sun right now. Each faces it for 3 of your days: dead, then abundant, then industrial.' },
  { name: 'Cancel', group: 'lightspeed', pattern: /\bcancel/i, explain: 'The card or heat has no effect. A cancelled card goes to its owner’s discard pile.' },
  { name: 'Max Health', group: 'heat', pattern: /max health/, explain: 'The heat at which your sun goes supernova.' },
];

const TOKEN = /\{([a-z]+)(?::([^}]+))?\}/g;

/** Every word capitalised ("recover attack" → "Recover Attack"). */
const titleCase = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());

/** A keyword as it reads on a card, in title case: its name and value ("Sturdy 1", "Destroy 2", "Recover Attack"). */
export function keywordLabel(id: string, value?: string): string {
  return titleCase(rawLabel(id, value));
}

function rawLabel(id: string, value?: string): string {
  const k = KEYWORDS[id];
  if (!k) return value ?? id;
  if (!value) return k.name;
  if (id === 'destroy' || id === 'eject') return `${k.name} ${value}`;
  if (id === 'plays' || id === 'energy') return `${k.name} +${value}`;
  if (id === 'resonance' || id === 'bulwark' || id === 'forge' || id === 'sting' || id === 'soothe' || id === 'restore' || id === 'renew' || id === 'erode' || id === 'decay') return `${k.name} ${value.replace('/', ' · ')}`;
  return `${k.name} ${value}`;
}

/**
 * A card's choices, written `{options:a|b|c}` (heat2, cool3, energy1): listed on
 * the card one per line, and the one picked highlighted when the card is shown
 * being played.
 */
/** An option as a short phrase of card text: "heat2" → "{heat:2}", "energy1" → "{energy:1}". */
export function optionText(id: string): string {
  const m = /^([a-z]+)(\d+)$/.exec(id);
  if (!m) return id;
  if (m[1] === 'draw') return `Draw ${m[2]}`;
  if (m[1] === 'recover') return 'Recover your last discarded card';
  if (m[1] === 'orbit') return `Your {orbit:+${m[2]}}`;
  return KEYWORDS[m[1]] ? `{${m[1]}:${m[2]}}` : `${m[1]} ${m[2]}`;
}

export function optionList(value = ''): string[] {
  return value.split('|').filter(Boolean);
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
    .map((p) => ('text' in p ? p.text : p.kw === 'options' ? optionList(p.value).map((o) => plainText(optionText(o))).join(', ').replace(/, ([^,]*)$/, ' or $1') : keywordLabel(p.kw, p.value)))
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
