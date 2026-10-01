/**
 * Card text that doesn't fit its card shrinks until it does, wherever a card
 * is shown (in a hand, on the table, in menus, zoomed). Each card's text box
 * keeps its own size; only its font size changes, never below `MIN_SCALE` of
 * the size the stylesheet gives it.
 */

const MIN_SCALE = 0.5;
const SELECTOR = '.card .card-text, .card-big .card-text';

/** Fit every card text under `root`. */
export function fitCardText(root: ParentNode = document) {
  const boxes = [...root.querySelectorAll<HTMLElement>(SELECTOR)];
  // Back to the stylesheet's size first (a card may have grown since), then measure them all at once.
  for (const el of boxes) el.style.fontSize = '';
  const todo = boxes
    .map((el) => ({ el, base: parseFloat(getComputedStyle(el).fontSize) }))
    .filter(({ el, base }) => base > 0 && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1);
  for (const { el, base } of todo) {
    // Find the largest size that fits (a few halvings are plenty).
    let lo = MIN_SCALE, hi = 1;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${(base * mid).toFixed(2)}px`;
      if (el.scrollHeight > el.clientHeight + 1) hi = mid;
      else lo = mid;
    }
    el.style.fontSize = `${(base * lo).toFixed(2)}px`;
  }
}

let queued = false;

/** Fit card text on the next frame (after layout settles); repeated calls in one frame run once. */
export function fitSoon(root: ParentNode = document) {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    fitCardText(root);
  });
}

// Webfonts change text metrics once they load: fit again then.
if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => fitSoon()).catch(() => {});
