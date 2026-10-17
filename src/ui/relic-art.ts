/** Relics' painted badges (and each kind's mark in ink), for the map and the battle board. */
import type { Effect } from '../engine';
import { effectMark, mechanicMark } from './glyphs';

const glyph = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

/** Each relic's painted badge, by its base name (the name without its quality word): "Bright Sunlance" is sunlance. */
const RELIC_ART: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/relics/*.webp', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.webp'.length),
    url,
  ]),
);
export function relicMark(name: string, slot: string): string {
  const slug = name.slice(name.indexOf(' ') + 1).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const url = RELIC_ART[slug];
  return url ? `<img src="${url}" alt="" draggable="false">` : (RELIC_GLYPH[slot] ?? RELIC_GLYPH.weapon);
}

const RELIC_GLYPH: Record<string, string> = {
  weapon: glyph('M5 19 17 7l2-3-3 2L4 18M8 16l-3 3M14 6l4 4'),
  helm: glyph('M5 16V12a7 7 0 0 1 14 0v4M5 16h14M9 9l3-4 3 4'),
  mantle: glyph('M8 4h8l3 16H5zM12 4v16'),
  sigil: glyph('M12 3l2.6 5.6L20 9.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.4-.9z'),
  core: glyph('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'),
  facet: glyph('M12 3 20 9l-3 11H7L4 9zM4 9h16M12 3l-3 6 3 11 3-11z'),
  ring: glyph('M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM9 6l3-3 3 3'),
  carapace: glyph('M5 13a7 7 0 0 1 14 0v3H5zM12 6v10M5 13h14'),
  gland: glyph('M12 4c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z'),
  mask: glyph('M5 6h14v6a7 7 0 0 1-14 0zM8.5 10.5h2M13.5 10.5h2'),
  plate: glyph('M6 4h12v9a6 6 0 0 1-12 0zM6 9h12'),
  star: glyph('M12 3v18M3 12h18M6 6l12 12M18 6 6 18'),
  ember: glyph('M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-4 3-5 0 2 1 3 2 3 0-3-1-5 0-8z'),
};

/**
 * What a relic's power does, as the game marks it elsewhere (the chips over a card in play): its effect's mark and its
 * number, in that effect's colour, for the face of its button in battle. `key` names its baked face (Unity's
 * Icons/relic-face/<key>.png). None for a power with no one clear effect (several, or one the game has no mark for):
 * its button then shows the relic's own badge.
 */
export type RelicFace = { kind: string; n: string; key: string };
export function relicFace(k: { effects: Effect[]; choices?: { kind: string; times: number; amount?: number } }): RelicFace | null {
  const face = (kind: string, n = ''): RelicFace => ({ kind, n, key: n ? `${kind}-${n.replace('+', 'plus')}` : kind });
  if (k.effects.length > 1 || (k.effects.length && k.choices)) return null;
  const e = k.effects[0];
  if (!e) {
    // (A choice its holder makes: recall so many cards to hand; shift a card.)
    const c = k.choices;
    if (c?.kind === 'recall') return face('recall', String(c.times));
    if (c?.kind === 'shift') return face('shift');
    return null;
  }
  const n = 'amount' in e && e.amount ? String(e.amount) : '';
  switch (e.type) {
    // (Heat to the rival's cards or its sun; a blow that grows with the day's held-back cards marked "+".)
    case 'strikeAll': case 'heat': return face('heat', n + (n && 'plus' in e && e.plus ? '+' : ''));
    case 'cool': return face('cool', n);
    case 'shield': return face('shield', n);
    case 'draw': return face('draw', n);
    case 'plays': return face('plays', n);
    case 'repair': return face('repair', n);
    case 'restore': return face(e.all ? 'renew' : 'restore', n);
    case 'fortify': return face('guard', n);
    case 'devour': case 'destroy': return face('destroy');
    case 'recover': return face('recover');
    default: return null;
  }
}

/** The faces drawn with an effect's mark (as the yield chips); the rest with a mechanic's, in its keyword's colour. */
const FACE_EFFECT = new Set(['heat', 'cool', 'shield', 'draw', 'plays', 'repair']);
/** Each mechanic face's keyword group (KEYWORDS[id].group), for its colour. */
const FACE_GROUP: Record<string, string> = { renew: 'stability', restore: 'stability', guard: 'defence', destroy: 'removal', recover: 'recovery', recall: 'recovery', shift: 'tempo' };

/** A relic power's face (.relic-face): its mark and its number, in its effect's colour. */
export function relicFaceHtml(f: RelicFace): string {
  const effect = FACE_EFFECT.has(f.kind);
  const mark = effect ? effectMark(f.kind) : mechanicMark(f.kind);
  const tone = effect ? `yield-${f.kind}` : `kw-${FACE_GROUP[f.kind] ?? 'global'}`;
  return `<span class="relic-face ${tone}${f.n ? '' : ' relic-face-bare'}">${mark}${f.n ? `<b>${f.n}</b>` : ''}</span>`;
}
