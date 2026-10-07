/**
 * Keywords: the game's recurring mechanics, written into card text as tokens
 * (`{sturdy:1}`, `{resonance:2/1}`, `{recover:attack}`, `{lightspeed}`) so a
 * card says each one in a word or two with its number, and the rules explain
 * it once. The UI draws a token as coloured text in title case ("Sturdy 1"); its
 * explanation appears in the zoomed card, on hover, and on the rules page.
 */

import { ATTUNEMENT } from './attunement';

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
/**
 * Bulwark and Resonance reach further than the cards beside them, less each slot away ("2/1": 2 beside it, 1
 * two slots away). The card shows only the most; the explanation, with the card's numbers, says the rest.
 */
function reach(value: string | undefined, what: string): string {
  const n = (value ?? '').split('/').filter(Boolean);
  if (n.length < 2) return `${what}.`;
  const away = ['the cards beside it', 'those two slots away', 'those three slots away'];
  return `${what}: ${n.map((x, i) => `+${x} for ${away[i] ?? `those ${i + 1} slots away`}`).join(', ')}.`;
}

export const KEYWORDS: Record<string, Keyword> = {
  dawn: { name: 'dawn', group: 'timing', explain: () => 'Start of your day.' },
  dusk: { name: 'dusk', group: 'timing', explain: () => 'End of your day.' },
  heat: { name: 'heat', group: 'heat', symbol: true, explain: () => "Heats your rival's sun (or, as a card is played, a card)." },
  pierce: { name: 'pierce', group: 'heat', explain: () => 'Ignores defence.' },
  cool: { name: 'cool', group: 'cool', symbol: true, explain: () => 'Cools your sun.' },
  shield: { name: 'shields', group: 'shields', symbol: true, explain: () => 'Blocks heat on your sun. Fades at dawn.' },
  guard: { name: 'guard', group: 'defence', explain: () => 'Must be targeted first.' },
  sturdy: { name: 'sturdy', group: 'defence', explain: () => 'Extra defence.' },
  repair: { name: 'repair', group: 'defence', explain: () => 'Mends worn defence.' },
  bulwark: { name: 'bulwark', group: 'defence', explain: (v) => reach(v, 'Extra defence for neighbours') },
  resonance: { name: 'resonance', group: 'resonance', explain: (v) => reach(v, "Boosts neighbours' heat, cooling and shields") },
  forge: { name: 'forge', group: 'resonance', explain: () => 'Boosts neighbouring attack cards.' },
  brittle: { name: 'brittle', group: 'stability', explain: () => 'Never fades, but nothing restores it, and removal reaches it whatever its defence.' },
  anchor: { name: 'anchor', group: 'stability', explain: () => 'Neighbours lose no stability.' },
  erode: { name: 'erode', group: 'stability', explain: () => 'A rival card loses this many days of stability: at 0 it fades.' },
  decay: { name: 'decay', group: 'stability', explain: () => 'Every rival card loses this many days of stability.' },
  restore: { name: 'restore', group: 'stability', explain: () => 'One of your cards gains stability.' },
  renew: { name: 'renew', group: 'stability', explain: () => 'Your other cards gain stability.' },
  recover: { name: 'recover', group: 'recovery', explain: () => 'Discard pile to hand.' },
  consume: { name: 'consume', group: 'removal', explain: () => 'To play it, give up another of your cards in play (not your Hero): it leaves play, and this can take its slot.' },
  chosen: { name: 'chosen', group: 'heat', explain: () => 'Pick one of your cards: it gains attack while it stays in play.' },
  recall: { name: 'recall', group: 'recovery', explain: () => 'One of your cards back to hand.' },
  shift: { name: 'shift', group: 'tempo', explain: () => 'Move one of your cards to another slot (swapping with any card there). Not a Hero.' },
  displace: { name: 'displace', group: 'removal', explain: () => "Move one of your rival's cards to another of their slots (swapping with any card there). Not a Hero." },
  destroy: { name: 'destroy', group: 'removal', explain: () => 'Destroys a rival card with this much defence or less.' },
  eject: { name: 'eject', group: 'removal', explain: () => 'Returns a rival card with this much defence or less to hand.' },
  sting: { name: 'sting', group: 'defence', explain: () => 'Hits back at attackers.' },
  attack: { name: 'attack', group: 'heat', explain: () => 'Once a day, hit a rival card or sun.' },
  dimmed: { name: 'dimmed', group: 'timing', explain: () => 'Has acted today.' },
  soothe: { name: 'soothe', group: 'shields', explain: () => 'Cools your sun when shields block.' },
  fusion: { name: 'fusion', group: 'tempo', explain: () => 'Play it, or fuse it onto one of your cards.' },
  plant: { name: 'plant', group: 'tempo', explain: () => 'Fills empty slots with Saplings.' },
  catalyst: { name: 'catalyst', group: 'tempo', explain: () => 'Your other growing cards grow with it.' },
  tidewall: { name: 'tidewall', group: 'shields', explain: () => 'Your shields also guard your cards against heat (not attacks or pierce).' },
  hold: { name: 'hold', group: 'shields', explain: () => "Your shields don't fade." },
  thermosiphon: { name: 'thermosiphon', group: 'cool', explain: () => 'Per 2 points your sun is below zero (it goes down to −10).' },
  overheated: { name: 'overheated', group: 'heat', explain: () => 'Your sun is at half health or hotter.' },
  grows: { name: 'grows', group: 'tempo', explain: () => 'Rises each dawn, up to a limit.' },
  plays: { name: 'industry', group: 'tempo', explain: () => 'Extra energy each day.' },
  spend: { name: 'spend all', group: 'tempo', explain: () => 'Spends all your energy.' },
  energy: { name: 'gain', group: 'tempo', explain: () => 'Extra energy today.' },
  // What an ability costs: shown as green energy dots, like a card's cost.
  darkspeed: { name: 'darkspeed', group: 'tempo', explain: () => 'Can attack or act the day it comes into play.' },
  cost: { name: 'energy', group: 'tempo', explain: () => 'Costs this much energy.' },
  // A Hero's abilities follow it: one a day.
  abilities: { name: 'each turn, one of:', group: 'timing', explain: () => 'Use one of these on your day.' },
  abundance: { name: 'abundance', group: 'tempo', explain: () => 'Extra cards each dawn.' },
  orbit: { name: 'orbit', group: 'orbit', explain: () => 'Moves the planets round.' },
  act: { name: 'act', group: 'timing', explain: () => 'A Hero ability.' },
  attune: {
    name: 'attunement',
    group: 'orbit',
    explain: (v) =>
      `Each dawn, gains your orbit's bonus${v && v !== '1' ? ` (×${v})` : ''}. Dead planet: ${ATTUNEMENT.slice(0, 3).map((a) => plainText(a.text)).join(' → ')}. Abundant: ${ATTUNEMENT.slice(3, 6).map((a) => plainText(a.text)).join(' → ')}. Industrial: ${ATTUNEMENT.slice(6).map((a) => plainText(a.text)).join(' → ')}.`,
  },
  lightspeed: { name: 'lightspeed', group: 'lightspeed', explain: () => 'Set face down; springs on its trigger.' },
  global: { name: 'global', group: 'global', explain: () => 'Affects both players.' },
};

/**
 * Rules that card text names in plain words rather than as a keyword token:
 * the zoomed card explains them too, whenever its text mentions one.
 */
export const TEXT_RULES: { name: string; group: Keyword['group']; pattern: RegExp; explain: string }[] = [
  { name: 'Hero', group: 'tempo', pattern: /\bHero(es)?\b|Dawn, one of/, explain: 'Goes in your Hero slot. One at a time.' },
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
  return id === 'abilities' ? 'Each turn, one of:' : titleCase(rawLabel(id, value));
}

function rawLabel(id: string, value?: string): string {
  const k = KEYWORDS[id];
  if (!k) return value ?? id;
  if (!value) return k.name;
  if (id === 'destroy' || id === 'eject') return `${k.name} ${value}`;
  if (id === 'plays' || id === 'abundance') return `${k.name} +${value}`;
  if (id === 'attune') return value === '1' ? k.name : `${k.name} ×${value}`;
  if (id === 'act') return '';
  if (id === 'abilities') return 'each turn, one of:';
  if (id === 'energy') return `gain ${value} energy`;
  if (id === 'cost') return `(${value} energy)`;
  if (id === 'resonance' || id === 'bulwark' || id === 'forge' || id === 'sting' || id === 'soothe' || id === 'restore' || id === 'renew' || id === 'erode' || id === 'decay') {
    // A split value ("2/1", resonance and bulwark): only the most (beside it); its explanation has the rest.
    return `${k.name} ${value.split('/')[0]}`;
  }
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
  // (A Command card's choice happens at every dawn: energy each day is Industry, cards each dawn Abundance.)
  if (m[1] === 'energy') return `{plays:${m[2]}}`;
  if (m[1] === 'draw') return `{abundance:${m[2]}}`;
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
