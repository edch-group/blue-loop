import type { GameState } from '../engine';

// Local autosave. In the Steam build this can move to Steam Cloud by pointing
// the Electron app's userData directory at a Steam Cloud-synced path.
const KEY = 'blue-loop:save:v4';

export function save(state: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable or full: autosave is best-effort.
  }
}

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    const state = raw ? (JSON.parse(raw) as GameState) : null;
    // Saves from before the card game was rebuilt cannot be resumed.
    return state && state.version === 2 ? state : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
