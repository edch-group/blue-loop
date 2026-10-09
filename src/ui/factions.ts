/**
 * Faction portraits: small line-art emblems of the eight alien races (see
 * titans.ts) on a pearl disc ringed in the faction's colour. Used wherever a
 * faction owns or is named on the map.
 */
import badge1 from '../assets/races/f1.webp';
import badge2 from '../assets/races/f2.webp';
import badge3 from '../assets/races/f3.webp';
import badge4 from '../assets/races/f4.webp';
import badge5 from '../assets/races/f5.webp';
import badge6 from '../assets/races/f6.webp';
import badge7 from '../assets/races/f7.webp';
import badge8 from '../assets/races/f8.webp';

/** The eight races' painted badges (a porcelain medallion, the race's emblem in its colour): used in place of the line-art emblems below. */
const BADGES: Record<string, string> = { f1: badge1, f2: badge2, f3: badge3, f4: badge4, f5: badge5, f6: badge6, f7: badge7, f8: badge8 };

export const FACTION_COLOUR: Record<string, string> = { f1: '#6f9fd8', f2: '#d48a7c', f3: '#c9a95e', f4: '#a08bcb', f5: '#5d5398', f6: '#c7783e', f7: '#8fa6c4', f8: '#d9503a' };

const HEADS: Record<string, string> = {
  // Aureline (the player): one unblinking eye inside tilted plasma halos.
  f1: `<ellipse cx="16" cy="16" rx="11.5" ry="4" transform="rotate(-16 16 16)"/><ellipse cx="16" cy="16" rx="9" ry="3" transform="rotate(24 16 16)"/><circle cx="16" cy="16" r="4.6" class="fill"/><ellipse cx="16" cy="16" rx="1.2" ry="2.6"/>`,
  // Xel'Naru: a crown of crystal shards around a core of light.
  f2: `<path d="M16 6.5 17.4 12 16 13.4 14.6 12Z M9.6 9 13 13 12.6 15 10.8 14Z M22.4 9 19 13 19.4 15 21.2 14Z M6.8 15.6 11.8 16.2 12.4 17.8 10.4 18.6Z M25.2 15.6 20.2 16.2 19.6 17.8 21.6 18.6Z"/><circle cx="16" cy="18" r="3.4" class="fill"/><path d="M13 24.5 16 22.6 19 24.5"/>`,
  // Vorthane: a ribbed bell rimmed with eyes, tentacles trailing.
  f3: `<path d="M8 16.5C8 10.5 11.6 7 16 7s8 3.5 8 9.5c-2.6 1-5.3 1.4-8 1.4s-5.4-.4-8-1.4Z"/><path d="M16 7v10.6M12.2 8.4l1.4 9.2M19.8 8.4l-1.4 9.2"/><circle cx="10.4" cy="16.6" r="1" class="fill"/><circle cx="13.6" cy="17.4" r="1" class="fill"/><circle cx="16" cy="17.6" r="1" class="fill"/><circle cx="18.4" cy="17.4" r="1" class="fill"/><circle cx="21.6" cy="16.6" r="1" class="fill"/><path d="M10.5 18.5c-.8 2.6-2.4 4.2-4 5.4M13.5 19c-.3 2.8-.8 4.8-2 6.6M18.5 19c.3 2.8.8 4.8 2 6.6M21.5 18.5c.8 2.6 2.4 4.2 4 5.4"/>`,
  // Ixquor: a branching fungal hive with glowing nodes.
  f4: `<path d="M16 26V17M16 17l-4.6-5M16 17l4.6-5M11.4 12l-3-2.8M11.4 12l.4-4M20.6 12l3-2.8M20.6 12l-.4-4M16 17v-7M16 10l-2-3M16 10l2-3M16 26c-3.2-.4-5.6.4-7.4 1.6M16 26c3.2-.4 5.6.4 7.4 1.6"/><circle cx="8.4" cy="9.2" r="1.6" class="fill"/><circle cx="11.8" cy="8" r="1.4" class="fill"/><circle cx="14" cy="7" r="1.5" class="fill"/><circle cx="18" cy="7" r="1.5" class="fill"/><circle cx="20.2" cy="8" r="1.4" class="fill"/><circle cx="23.6" cy="9.2" r="1.6" class="fill"/>`,
  // Nyxari: a pointed hood, empty but for two slit eyes.
  f5: `<path d="M8.5 26.5C8.5 16 12 9 16 5 20 9 23.5 16 23.5 26.5"/><path d="M11.5 26.5c1.2-5.2 2.6-9.2 4.5-12 1.9 2.8 3.3 6.8 4.5 12"/><path class="fill" d="M11.4 18.6 15.4 16.6 15.4 19.4ZM20.6 18.6 16.6 16.6 16.6 19.4Z" style="fill:var(--fc)"/>`,
  // Korrath: a smith's helm with a T-slit visor over a beard of braids beaded with embers.
  f6: `<path d="M9.5 16.5V12c0-4.4 2.9-6.5 6.5-6.5s6.5 2.1 6.5 6.5v4.5c-2 1-4.2 1.4-6.5 1.4s-4.5-.4-6.5-1.4Z"/><path class="fill" d="M11.4 11.6h9.2v1.6h-3.8v3.6h-1.6v-3.6h-3.8Z"/><path d="M11.6 18.6l1.6 5.6M16 18.9v6.8M20.4 18.6l-1.6 5.6"/><circle class="fill" cx="13.4" cy="25.2" r="1.1"/><circle class="fill" cx="16" cy="26.9" r="1.1"/><circle class="fill" cx="18.6" cy="25.2" r="1.1"/>`,
  // Seren: a crescent moon cradling a star, inside a tilted orbit.
  f7: `<path class="fill" d="M14.5 6.2a10 10 0 1 0 9.8 14.6A8.2 8.2 0 0 1 14.5 6.2Z"/><ellipse cx="16" cy="16.5" rx="13" ry="4" transform="rotate(-18 16 16.5)"/><path d="M20.5 9.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z"/>`,
  // Pyrr: a living flame with a white-hot heart.
  f8: `<path d="M16 4c3.2 4.2 7.6 7.6 7.6 13.8a7.6 7.6 0 0 1-15.2 0c0-3.6 2-5.6 3.6-7.6.3 2.6 1.2 3.7 2.4 4.3C13.6 10.4 14.4 7.2 16 4Z"/><path class="fill" d="M16 15.4c2 2.2 3.6 3.8 3.6 6.1a3.6 3.6 0 0 1-7.2 0c0-2.3 1.6-3.9 3.6-6.1Z"/>`,
};

export function factionAvatar(id: string, cls = ''): string {
  const colour = FACTION_COLOUR[id] ?? '#9aa0ac';
  // (A race with a painted badge shows it; anything else, the line-art emblem on a pearl disc.)
  if (BADGES[id]) return `<img class="fav fav-badge ${cls}" src="${BADGES[id]}" alt="" style="--fc:${colour}" draggable="false" aria-hidden="true">`;
  return `<svg class="fav ${cls}" viewBox="0 0 32 32" style="--fc:${colour}" aria-hidden="true"><circle cx="16" cy="16" r="15" class="fav-disc"/><g class="fav-head">${HEADS[id] ?? ''}</g></svg>`;
}
