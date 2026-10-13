import { describe, expect, it } from 'vitest';
import { emptyMeta, openSections, sectionOpen, stowParts } from '../src/engine/meta';

describe('campaign menu sections', () => {
  it('stay shut until there is first something in them, then stay open for good', () => {
    let meta = { ...emptyMeta(), xp: 0, petals: 0 };
    expect(['captain', 'ship', 'stellari'].map((s) => sectionOpen(meta, s as 'captain'))).toEqual([false, false, false]);
    meta = openSections(stowParts({ ...meta, petals: 3 }, ['scrap_plating']));
    expect(sectionOpen(meta, 'ship')).toBe(true);
    expect(sectionOpen(meta, 'stellari')).toBe(true);
    // (Spent down to nothing again: still open.)
    expect(sectionOpen({ ...meta, petals: 0, hangar: [] }, 'stellari')).toBe(true);
    expect(sectionOpen({ ...meta, petals: 0, hangar: [] }, 'ship')).toBe(true);
  });
});
