/**
 * Faction portraits: small line-art emblems of the four alien races (see
 * titans.ts) on a pearl disc ringed in the faction's colour. Used wherever a
 * faction owns or is named on the map.
 */
export const FACTION_COLOUR: Record<string, string> = { f1: '#6f9fd8', f2: '#d48a7c', f3: '#c9a95e', f4: '#a08bcb' };

const HEADS: Record<string, string> = {
  // Aureline (the player): one unblinking eye inside tilted plasma halos.
  f1: `<ellipse cx="16" cy="16" rx="11.5" ry="4" transform="rotate(-16 16 16)"/><ellipse cx="16" cy="16" rx="9" ry="3" transform="rotate(24 16 16)"/><circle cx="16" cy="16" r="4.6" class="fill"/><ellipse cx="16" cy="16" rx="1.2" ry="2.6"/>`,
  // Xel'Naru: a crown of crystal shards around a core of light.
  f2: `<path d="M16 6.5 17.4 12 16 13.4 14.6 12Z M9.6 9 13 13 12.6 15 10.8 14Z M22.4 9 19 13 19.4 15 21.2 14Z M6.8 15.6 11.8 16.2 12.4 17.8 10.4 18.6Z M25.2 15.6 20.2 16.2 19.6 17.8 21.6 18.6Z"/><circle cx="16" cy="18" r="3.4" class="fill"/><path d="M13 24.5 16 22.6 19 24.5"/>`,
  // Vorthane: a ribbed bell rimmed with eyes, tentacles trailing.
  f3: `<path d="M8 16.5C8 10.5 11.6 7 16 7s8 3.5 8 9.5c-2.6 1-5.3 1.4-8 1.4s-5.4-.4-8-1.4Z"/><path d="M16 7v10.6M12.2 8.4l1.4 9.2M19.8 8.4l-1.4 9.2"/><circle cx="10.4" cy="16.6" r="1" class="fill"/><circle cx="13.6" cy="17.4" r="1" class="fill"/><circle cx="16" cy="17.6" r="1" class="fill"/><circle cx="18.4" cy="17.4" r="1" class="fill"/><circle cx="21.6" cy="16.6" r="1" class="fill"/><path d="M10.5 18.5c-.8 2.6-2.4 4.2-4 5.4M13.5 19c-.3 2.8-.8 4.8-2 6.6M18.5 19c.3 2.8.8 4.8 2 6.6M21.5 18.5c.8 2.6 2.4 4.2 4 5.4"/>`,
  // Ixquor: a branching fungal hive with glowing nodes.
  f4: `<path d="M16 26V17M16 17l-4.6-5M16 17l4.6-5M11.4 12l-3-2.8M11.4 12l.4-4M20.6 12l3-2.8M20.6 12l-.4-4M16 17v-7M16 10l-2-3M16 10l2-3M16 26c-3.2-.4-5.6.4-7.4 1.6M16 26c3.2-.4 5.6.4 7.4 1.6"/><circle cx="8.4" cy="9.2" r="1.6" class="fill"/><circle cx="11.8" cy="8" r="1.4" class="fill"/><circle cx="14" cy="7" r="1.5" class="fill"/><circle cx="18" cy="7" r="1.5" class="fill"/><circle cx="20.2" cy="8" r="1.4" class="fill"/><circle cx="23.6" cy="9.2" r="1.6" class="fill"/>`,
};

export function factionAvatar(id: string, cls = ''): string {
  const colour = FACTION_COLOUR[id] ?? '#9aa0ac';
  return `<svg class="fav ${cls}" viewBox="0 0 32 32" style="--fc:${colour}" aria-hidden="true"><circle cx="16" cy="16" r="15" class="fav-disc"/><g class="fav-head">${HEADS[id] ?? ''}</g></svg>`;
}
