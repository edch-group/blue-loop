/**
 * The little ships armies sail the campaign map in, one look per race, seen from above and pointing along
 * +x (they lie flat on the map and turn to face the way they last travelled). Light hulls trimmed in the
 * faction's colour (--ac), with an engine glow at the stern.
 */

/** The engine glow, at the stern (left). */
const FLAME = '<ellipse class="ship-flame" cx="3" cy="12" rx="5" ry="2.6"/>';

const SHIPS: string[] = [
  // Aureline: a sun-barque, a long golden leaf of a hull carrying a sun-disc.
  `<path class="ship-hull" d="M39 12C31 4.5 14 3.5 5 7l3 5-3 5c9 3.5 26 2.5 34-5z"/>
   <path class="ship-trim" d="M9 12h26"/>
   <circle class="ship-glow" cx="21" cy="12" r="4.4"/><circle class="ship-core" cx="21" cy="12" r="2"/>`,
  // Xel'Naru: a crystal shard, all facets.
  `<path class="ship-hull" d="M39 12 23 3.5 9 6.5 4 12l5 5.5 14 3z"/>
   <path class="ship-trim" d="M39 12 23 3.5 18 12l5 8.5M18 12H4M9 6.5l9 5.5-9 5.5"/>
   <path class="ship-core" d="M27 12l-3-2.4-3 2.4 3 2.4z"/>`,
  // Vorthane: a jellyfish bell leading a trail of tentacles.
  `<path class="ship-trim ship-tails" d="M17 7c-5 0-6 2-11 1M16 10.5c-5 0-6 1.5-12 1M16 13.5c-5 0-6-1.5-12-1M17 17c-5 0-6-2-11-1"/>
   <path class="ship-hull" d="M17 4.5c11-1 20 2.5 21 7.5-1 5-10 8.5-21 7.5-1.5-5-1.5-10 0-15z"/>
   <path class="ship-trim" d="M17 4.5c3 2.5 3 12.5 0 15M22 5c2 3 2 11 0 14"/>
   ${[7, 10, 14, 17].map((y) => `<circle class="ship-core" cx="${y === 7 || y === 17 ? 18.6 : 19.6}" cy="${y}" r="0.9"/>`).join('')}`,
  // Ixquor: a seed pod on spined legs, its cap glowing.
  `<path class="ship-trim" d="M14 7 8 3M20 6.5l-3-5M14 17l-6 4M20 17.5l-3 5"/>
   <ellipse class="ship-hull" cx="21" cy="12" rx="16" ry="7.2"/>
   <ellipse class="ship-glow" cx="29" cy="12" rx="6" ry="5"/>
   <path class="ship-trim" d="M13 8.5c2 2 2 5 0 7M19 7c2 3 2 7 0 10"/>`,
];

/** The Lost Races: a battered derelict, its hull holed and its plates sprung. */
const DERELICT = `<path class="ship-hull" d="M38 12 30 5 12 6 6 9l2 3-2 3 6 3 18 1z"/>
  <path class="ship-trim" d="M30 5l-3 7 3 7M12 6l4 6-4 6M20 9l2 2-2 2"/>
  <circle class="ship-core" cx="33" cy="12" r="1.4"/>`;

/** A ship for an army of this race (or a Lost Races derelict). */
export function shipSvg(race: number, lost: boolean): string {
  return `<svg class="cmp-ship-svg" viewBox="0 0 40 24" aria-hidden="true">${FLAME}${lost ? DERELICT : SHIPS[race] ?? SHIPS[0]}</svg>`;
}
