import { CARDS } from '../engine/cards';
import type { CardDef, LogEntry, PlayerState } from '../engine/types';
import { cardArt, KIND_COLOUR, symbolIcon } from './glyphs';

/**
 * The game log, made easy to scan: each line gets the art of the card it is about (or an icon for
 * what happened), the card and player names picked out, and a chip with an arrow to the outcome
 * ("→ 14" heat, "→ hand", "✕" destroyed). A new day starts a header row.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let byName: { defs: Map<string, CardDef> } | null = null;
function cardNames() {
  byName ??= { defs: new Map(CARDS.map((d) => [esc(d.name), d])) };
  return byName;
}

type Chip = { cls: string; html: string };

const sym = (id: string) => symbolIcon(id);
const ARROW = '<i class="log-arrow">→</i>';

/** What happened, as an icon for the row (when no card is named) and a chip for its outcome. */
function outcome(text: string): { icon: string; tone: string; chip: Chip | null } {
  let m: RegExpMatchArray | null;
  if (/SUPERNOVA/.test(text)) return { icon: '✸', tone: 'nova', chip: { cls: 'nova', html: 'supernova' } };
  if (/wins the Blue Loop/.test(text)) return { icon: '★', tone: 'win', chip: { cls: 'win', html: 'victory' } };
  if (/barely holds/.test(text)) return { icon: '☀', tone: 'heat', chip: null };
  if ((m = text.match(/instability heats every sun by (\d+)/))) return { icon: '≋', tone: 'heat', chip: { cls: 'heat', html: `${sym('heat')}+${m[1]} ${ARROW} every sun` } };
  if ((m = text.match(/heats their sun by (\d+)/))) return { icon: '↻', tone: 'heat', chip: { cls: 'heat', html: `${sym('heat')}+${m[1]}` } };
  if ((m = text.match(/sun heats to (-?\d+)/))) return { icon: sym('heat'), tone: 'heat', chip: { cls: 'heat', html: `${sym('heat')} ${ARROW} ${m[1]}` } };
  if ((m = text.match(/sun cools to (-?\d+)/))) return { icon: sym('cool'), tone: 'cool', chip: { cls: 'cool', html: `${sym('cool')} ${ARROW} ${m[1]}` } };
  if ((m = text.match(/shields absorb (\d+)/))) return { icon: sym('shield'), tone: 'shield', chip: { cls: 'shield', html: `${sym('shield')}−${m[1]}` } };
  if ((m = text.match(/raises (\d+) shield/))) return { icon: sym('shield'), tone: 'shield', chip: { cls: 'shield', html: `${sym('shield')}+${m[1]}` } };
  if ((m = text.match(/stings .+ for (\d+)/))) return { icon: '⚔', tone: 'heat', chip: { cls: 'heat', html: `${sym('heat')}+${m[1]}` } };
  if ((m = text.match(/heat strikes .* \(stability (\d+)\)/))) return { icon: sym('heat'), tone: 'heat', chip: { cls: 'remove', html: `◷ ${ARROW} ${m[1]}` } };
  if (/burns away/.test(text)) return { icon: '✕', tone: 'remove', chip: { cls: 'remove', html: '✕ burned' } };
  if (/destroys/.test(text)) return { icon: '✕', tone: 'remove', chip: { cls: 'remove', html: `✕ destroyed` } };
  if (/flung back|returns .+ to their hand/.test(text)) return { icon: '↩', tone: 'remove', chip: { cls: 'move', html: `${ARROW} hand` } };
  if (/recovers/.test(text)) return { icon: '↩', tone: 'move', chip: { cls: 'move', html: `${ARROW} hand` } };
  if (/fades into/.test(text)) return { icon: '◌', tone: 'fade', chip: { cls: 'fade', html: `${ARROW} discard` } };
  if ((m = text.match(/loses (\d+) stability/))) return { icon: '◷', tone: 'remove', chip: { cls: 'remove', html: `◷−${m[1]}` } };
  if (/steadies/.test(text)) return { icon: '◷', tone: 'move', chip: { cls: 'move', html: '◷ steadied' } };
  if (/sets a card face down/.test(text)) return { icon: '⚡', tone: 'ls', chip: { cls: 'ls', html: `${ARROW} face down` } };
  if (/Lightspeed!/.test(text)) return { icon: '⚡', tone: 'ls', chip: { cls: 'ls', html: 'sprung' } };
  if (/ plays /.test(text)) return { icon: '▶', tone: 'play', chip: { cls: 'play', html: `${ARROW} tableau` } };
  if (/replaces/.test(text)) return { icon: '⇄', tone: 'play', chip: { cls: 'play', html: '⇄ swapped' } };
  if (/chooses:/.test(text)) return { icon: '◆', tone: 'play', chip: null };
  if (/is cancelled|misses|never reaches/.test(text)) return { icon: '⦸', tone: 'fade', chip: { cls: 'fade', html: 'no effect' } };
  if ((m = text.match(/gains (\d+) energy/))) return { icon: '⚡', tone: 'play', chip: { cls: 'play', html: `+${m[1]} energy` } };
  if (/may play no more/.test(text)) return { icon: '⦸', tone: 'remove', chip: { cls: 'remove', html: 'no more plays' } };
  if (/draws/.test(text)) return { icon: '⇡', tone: 'move', chip: { cls: 'move', html: `${ARROW} hand` } };
  if (/planet|orbit/.test(text)) return { icon: '◍', tone: 'orbit', chip: null };
  if (/concedes/.test(text)) return { icon: '⚑', tone: 'nova', chip: null };
  return { icon: '·', tone: 'plain', chip: null };
}

export function logRows(log: LogEntry[], players: PlayerState[], viewerId: string, lastTurn: number | undefined): string {
  const { defs } = cardNames();
  const names = players.map((p) => ({ name: p.name, mine: p.id === viewerId }));
  const quote = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [...defs.keys(), ...names.map((n) => esc(n.name))].sort((a, b) => b.length - a.length).map(quote);
  const who = new RegExp(`(?<![\\w])(${all.join('|')})(?![\\w])`, 'g');
  return log
    .map((l) => {
      // A new day: a header row dividing the log.
      const day = l.text.match(/^— Day (\d+): (.+)\.$/);
      if (day) {
        const mine = names.find((n) => n.name === day[2])?.mine;
        return `<div data-seq="${l.seq}" class="log-day ${mine ? 'log-day-mine' : ''}"><span>day ${day[1]}</span><b>${esc(day[2].toLowerCase())}</b></div>`;
      }
      const text = l.text.replace(/^[☀⚡]\s*/, '');
      // Card and player names, picked out in one pass (whole words only: "Ed" is not inside "Directive").
      const cards: CardDef[] = [];
      const html = esc(text).replace(who, (n) => {
        const d = defs.get(n);
        if (d) {
          cards.push(d);
          return `<b class="log-card" style="--kc:${KIND_COLOUR[d.kind]}">${n}</b>`;
        }
        const mine = names.find((x) => esc(x.name) === n)?.mine;
        return `<b class="log-who ${mine ? 'log-you' : 'log-rival'}">${n}</b>`;
      });
      const o = outcome(text);
      // The row's picture: the card it is about (the last named: the one acted on), else what happened.
      const card = cards[cards.length - 1];
      const thumb = card ? `<span class="log-thumb" style="--kc:${KIND_COLOUR[card.kind]}">${cardArt(card)}</span>` : `<span class="lg-icon log-tone-${o.tone}">${o.icon}</span>`;
      const chip = o.chip ? `<span class="log-chip log-chip-${o.chip.cls}">${o.chip.html}</span>` : '';
      return `<div data-seq="${l.seq}" class="log-row log-tone-${o.tone} ${l.turn === lastTurn ? 'log-now' : ''}">${thumb}<span class="log-text">${html}</span>${chip}</div>`;
    })
    .join('');
}
