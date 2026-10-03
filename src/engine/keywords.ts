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


/**
 * Each keyword's explanation says what the mechanic does, never its numbers: the card shows those, and
 * one card's "Heat 1" and "Heat +1" are explained once, as Heat.
 */
export const KEYWORDS: Record<string, Keyword> = {
  dawn: { name: 'dawn', group: 'timing', explain: () => 'Happens at the start of each of your days.' },
  heat: { name: 'heat', group: 'heat', symbol: true, explain: () => "Raises a sun's heat: at its max health it goes supernova. Aimed at a card, it wears down its defence, then its stability." },
  pierce: { name: 'pierce', group: 'heat', explain: () => 'Heat that gets past half of shields and ignores defence.' },
  cool: { name: 'cool', group: 'cool', symbol: true, explain: () => 'Takes heat off your sun.' },
  shield: { name: 'shields', group: 'shields', symbol: true, explain: () => 'Each blocks 1 enemy heat. They fade at your dawn.' },
  guard: { name: 'guard', group: 'defence', explain: () => 'Rival heat must be aimed at your Guards.' },
  sturdy: { name: 'sturdy', group: 'defence', explain: () => 'Extra defence for this card.' },
  bulwark: { name: 'bulwark', group: 'defence', explain: () => 'Extra defence for the cards next to it (and, for some, two away).' },
  resonance: { name: 'resonance', group: 'resonance', explain: () => 'Boosts the heat, cooling and shields of the cards next to it.' },
  forge: { name: 'forge', group: 'resonance', explain: () => 'Boosts the heat of attack cards next to it.' },
  anchor: { name: 'anchor', group: 'stability', explain: () => 'Cards next to it lose no stability.' },
  erode: { name: 'erode', group: 'stability', explain: () => 'A rival card loses stability.' },
  decay: { name: 'decay', group: 'stability', explain: () => 'Every rival card loses stability.' },
  restore: { name: 'restore', group: 'stability', explain: () => 'Another card of yours gains stability.' },
  renew: { name: 'renew', group: 'stability', explain: () => 'Your other cards gain stability.' },
  recover: { name: 'recover', group: 'recovery', explain: () => 'Take a card from your discard pile into your hand (with none there, draw instead).' },
  recall: { name: 'recall', group: 'recovery', explain: () => 'Return another of your cards to your hand.' },
  destroy: { name: 'destroy', group: 'removal', explain: () => 'Destroys a rival card, if its defence is no higher than the number.' },
  eject: { name: 'eject', group: 'removal', explain: () => "Sends a rival card back to its owner's hand, if its defence is no higher than the number." },
  sting: { name: 'sting', group: 'shields', explain: () => "When your shields block a card's heat, that card takes heat back. Once per card a day." },
  soothe: { name: 'soothe', group: 'shields', explain: () => 'When your shields block heat, your sun cools. Once per card a day.' },
  hold: { name: 'hold', group: 'shields', explain: () => "Your shields don't fade at your dawn." },
  overheated: { name: 'overheated', group: 'heat', explain: () => 'Your sun is at half its max health or more.' },
  grows: { name: 'grows', group: 'tempo', explain: () => 'Its numbers rise at each of your dawns, up to a limit.' },
  plays: { name: 'industry', group: 'tempo', explain: () => 'Extra energy every day, while it is in play.' },
  spend: { name: 'spend all', group: 'tempo', explain: () => 'Spends all your energy. Stronger the more you spend.' },
  energy: { name: 'energy', group: 'tempo', explain: () => 'Extra energy today.' },
  abundance: { name: 'abundance', group: 'tempo', explain: () => 'Extra cards at each of your dawns, while it is in play.' },
  orbit: { name: 'orbit', group: 'orbit', explain: () => "Moves a sun's planets round." },
  lightspeed: { name: 'lightspeed', group: 'lightspeed', explain: () => "Set face down. Springs on your rival's day when its trigger happens." },
  global: { name: 'global', group: 'global', explain: () => 'Affects both players. Only one at a time.' },
};

/**
 * Rules that card text names in plain words rather than as a keyword token:
 * the zoomed card explains them too, whenever its text mentions one.
 */
export const TEXT_RULES: { name: string; group: Keyword['group']; pattern: RegExp; explain: string }[] = [
  { name: 'One Of', group: 'tempo', pattern: /one of:/, explain: 'Pick one when played. It happens every dawn.' },
  { name: 'Command Card', group: 'tempo', pattern: /\bCommand card|^Dawn, one of/, explain: 'Goes in your Command slot. One at a time.' },
  { name: 'Leaves Your Tableau', group: 'stability', pattern: /leaves? your tableau/, explain: 'Fades, is destroyed, or is returned to hand.' },
  { name: 'Facing A Planet', group: 'orbit', pattern: /facing the (dead|abundant|industrial) planet/, explain: 'The planet now facing your sun.' },
  { name: 'Cancel', group: 'lightspeed', pattern: /\bcancel/i, explain: 'It has no effect.' },
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
  if (m[1] === 'energy') return `Gain ${m[2]} energy`;
  if (m[1] === 'draw') return `Draw ${m[2]}`;
  if (m[1] === 'recover') return '{recover} your last discarded card';
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

/** The keywords a card's text uses, each once (whatever its numbers), in order. */
export function keywordsIn(text: string): { id: string; value?: string }[] {
  const seen = new Set<string>();
  const out: { id: string; value?: string }[] = [];
  for (const p of textParts(text)) {
    if ('kw' in p && p.kw !== 'options' && !seen.has(p.kw)) {
      seen.add(p.kw);
      out.push({ id: p.kw, value: p.value });
    }
  }
  return out;
}
