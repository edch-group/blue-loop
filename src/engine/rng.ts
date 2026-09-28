/**
 * Seeded RNG (mulberry32). Its state is stored in GameState, so a game can be
 * replayed exactly from its seed and action list, which saves, replays and
 * online lockstep multiplayer all need.
 */
export function nextRandom(state: { rngState: number }): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: { rngState: number }, maxExclusive: number): number {
  return Math.floor(nextRandom(state) * maxExclusive);
}

export function shuffleInPlace<T>(state: { rngState: number }, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
