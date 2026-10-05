import { CARDS } from '../src/engine';

/**
 * Account pictures: each account is dealt a card when it is made, and its artwork, cropped to a circle,
 * is the player's picture (see src/ui/glyphs.ts, playerAvatar). The account keeps the card's id
 * (users.avatar, migrations/0003_avatars.sql).
 */

/** The cards a picture may be: any in the pool (not a token), each with artwork of its own. */
export const AVATARS: readonly string[] = CARDS.filter((c) => !c.token).map((c) => c.id);
const AVATAR_SET = new Set(AVATARS);

/** A card for a new account's picture, at random. */
export function randomAvatar(random: () => number = Math.random): string {
  return AVATARS[Math.floor(random() * AVATARS.length)];
}

/** Whether a stored picture is still a card that can be one (null, or a card since removed, is not). */
export function isAvatar(id: unknown): id is string {
  return typeof id === 'string' && AVATAR_SET.has(id);
}
