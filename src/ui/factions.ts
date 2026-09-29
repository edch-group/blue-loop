/**
 * Faction portraits: small line-art heads on a pearl disc ringed in the
 * faction's colour. Used wherever a faction owns or is named on the map.
 */
export const FACTION_COLOUR: Record<string, string> = { f1: '#6f9fd8', f2: '#d48a7c', f3: '#c9a95e', f4: '#a08bcb' };

const HEADS: Record<string, string> = {
  // Commander (the player): a visored flight helmet.
  f1: `<path d="M16 6c-5.2 0-8.6 3.8-8.6 9.2V20c0 1.7 1.1 3 2.7 3.5L12 24h8l1.9-.5c1.6-.5 2.7-1.8 2.7-3.5v-4.8C24.6 9.8 21.2 6 16 6Z"/><path d="M10.2 14.6c1.8-1.2 3.7-1.7 5.8-1.7s4 .5 5.8 1.7l-.7 3.6c-1.6.7-3.3 1-5.1 1s-3.5-.3-5.1-1Z" class="fill"/><path d="M16 6v3.4M12 24l-.6 2.6M20 24l.6 2.6"/>`,
  // Xel'Naru: a tall, smooth head with large almond eyes.
  f2: `<path d="M16 4.5c-4.6 0-7.4 4.1-7.4 9.7 0 5.5 3.2 10.5 7.4 12.8 4.2-2.3 7.4-7.3 7.4-12.8 0-5.6-2.8-9.7-7.4-9.7Z"/><path d="M10.6 14.8c1.6-.3 3.3.5 4 2.2-1.7.6-3.3 0-4-2.2ZM21.4 14.8c-1.6-.3-3.3.5-4 2.2 1.7.6 3.3 0 4-2.2Z" class="fill"/><path d="M15.2 22.4h1.6"/>`,
  // Vorthane: a broad, crested head with three eyes.
  f3: `<path d="M7.5 13.5 5.6 7.8l5 3.1L16 5.6l5.4 5.3 5-3.1-1.9 5.7c.9 1.2 1.4 2.7 1.4 4.3 0 4.5-4.3 8.2-9.9 8.2s-9.9-3.7-9.9-8.2c0-1.6.5-3.1 1.4-4.3Z"/><circle cx="12" cy="17" r="1.5" class="fill"/><circle cx="20" cy="17" r="1.5" class="fill"/><circle cx="16" cy="13.4" r="1.2" class="fill"/><path d="M13.4 21.6c1.7.8 3.5.8 5.2 0"/>`,
  // Ixquor: an insectoid head with antennae and mandibles.
  f4: `<path d="M12.4 9.2C11.6 6.4 9.8 4.8 7.6 4.4M19.6 9.2c.8-2.8 2.6-4.4 4.8-4.8"/><path d="M16 8.6c-4.4 0-7.2 3.1-7.2 7.2 0 3.3 1.9 5.9 4.3 7.1h5.8c2.4-1.2 4.3-3.8 4.3-7.1 0-4.1-2.8-7.2-7.2-7.2Z"/><ellipse cx="12.4" cy="14.8" rx="2.2" ry="2.8" class="fill"/><ellipse cx="19.6" cy="14.8" rx="2.2" ry="2.8" class="fill"/><path d="M13.1 22.9 12 26.8l2.6-1.6M18.9 22.9l1.1 3.9-2.6-1.6"/>`,
};

export function factionAvatar(id: string, cls = ''): string {
  const colour = FACTION_COLOUR[id] ?? '#9aa0ac';
  return `<svg class="fav ${cls}" viewBox="0 0 32 32" style="--fc:${colour}" aria-hidden="true"><circle cx="16" cy="16" r="15" class="fav-disc"/><g class="fav-head">${HEADS[id] ?? ''}</g></svg>`;
}
