/** Relics' painted badges (and each kind's mark in ink), for the map and the battle board. */
const glyph = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

/** Each relic's painted badge, by its base name (the name without its quality or curse word): "Bright Sunlance" is sunlance. */
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
