/** The loop's lasting progress (petals and upgrades), kept on this device and synced to the account. */
import { emptyMeta, migrateMeta, type MetaState } from '../engine';
import { markDirty } from './account';

const KEY = 'blue-loop:runs:v1';

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    // (Brought up to date: XP spent on skills since taken out of the tree comes back.)
    return raw ? migrateMeta({ ...emptyMeta(), ...(JSON.parse(raw) as Partial<MetaState>) }) : emptyMeta();
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(m: MetaState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
    markDirty();
  } catch {
    // Storage unavailable: kept for this session only.
  }
}
