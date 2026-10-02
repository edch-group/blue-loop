/**
 * Card text that doesn't fit its card shrinks until it does, wherever a card
 * is shown (in a hand, on the table, in menus, zoomed). Each card's text box
 * keeps its own size; only its font size changes, never below `MIN_SCALE` of
 * the size the stylesheet gives it.
 */

const MIN_SCALE = 0.5;
const SELECTOR = '.card .card-text, .card-big .card-text';

/** Sizes already worked out: the same card text in a box of the same size fits the same way. */
const known = new Map<string, number>();

/**
 * Fit every card text under `root`. All the boxes are measured together, a few times over (each pass
 * writes every size, then reads every box), so a page of hundreds of cards costs a handful of layouts,
 * not a few per card.
 */
export function fitCardText(root: ParentNode = document) {
  // (The deck builder's long card list fits its cards as they scroll into view: see fitWhenSeen.)
  const boxes = [...root.querySelectorAll<HTMLElement>(SELECTOR)].filter((el) => root instanceof HTMLElement && root.closest('.db-pool') ? true : !el.closest('.db-pool'));
  // Back to the stylesheet's size first (a card may have grown since), then measure them all at once.
  for (const el of boxes) el.style.fontSize = '';
  const measured = boxes.map((el) => ({ el, base: parseFloat(getComputedStyle(el).fontSize), w: el.clientWidth, h: el.clientHeight, sh: el.scrollHeight }));
  const todo: { el: HTMLElement; base: number; key: string; lo: number; hi: number }[] = [];
  for (const m of measured) {
    if (!(m.base > 0) || m.h <= 0 || m.sh <= m.h + 1) continue;
    const key = `${m.el.closest<HTMLElement>('[data-card]')?.dataset.card ?? ''}|${m.el.innerHTML.length}|${m.w}x${m.h}|${m.base}`;
    const hit = known.get(key);
    if (hit !== undefined) m.el.style.fontSize = `${(m.base * hit).toFixed(2)}px`;
    else todo.push({ el: m.el, base: m.base, key, lo: MIN_SCALE, hi: 1 });
  }
  // Find the largest size that fits (a few halvings are plenty), every box in step.
  for (let i = 0; i < 6 && todo.length; i++) {
    for (const t of todo) t.el.style.fontSize = `${(t.base * ((t.lo + t.hi) / 2)).toFixed(2)}px`;
    for (const t of todo) {
      const mid = (t.lo + t.hi) / 2;
      if (t.el.scrollHeight > t.el.clientHeight + 1) t.hi = mid;
      else t.lo = mid;
    }
  }
  for (const t of todo) {
    t.el.style.fontSize = `${(t.base * t.lo).toFixed(2)}px`;
    known.set(t.key, t.lo);
  }
}

/** Fit the card text in a long list only as each card scrolls into view (measuring them all at once is slow). */
let seen: IntersectionObserver | null = null;
export function fitWhenSeen(cards: Iterable<HTMLElement>) {
  seen ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen!.unobserve(e.target);
      fitCardText(e.target as HTMLElement);
    }
  }, { rootMargin: '200px' });
  seen.disconnect();
  for (const c of cards) seen.observe(c);
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
