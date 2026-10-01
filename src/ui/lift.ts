/**
 * Hover lift for cards. A card lifts a little under the mouse; done with
 * :hover, the bottom edge of a lifted card rises out from under the pointer,
 * the card drops back, is hovered again, and jitters. Instead the card under
 * the mouse gets `.lifted`, and keeps it while the pointer is anywhere over
 * the card or the strip below it that it rose out of.
 */
let lifted: HTMLElement | null = null;
let at: { x: number; y: number } | null = null;

function set(el: HTMLElement | null) {
  if (lifted === el) return;
  lifted?.classList.remove('lifted');
  lifted = el;
  el?.classList.add('lifted');
}

function update(x: number, y: number, target: Element | null) {
  const card = target?.closest<HTMLElement>('.card:not(.card-still)') ?? null;
  if (card) return set(card);
  // Over the strip the lifted card rose out of: it stays up.
  if (lifted?.isConnected) {
    const r = lifted.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom + r.height * 0.12 + 4) return;
  }
  set(null);
}

/** Start tracking the mouse (touch has no hover). */
export function trackLift() {
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    at = { x: e.clientX, y: e.clientY };
    update(e.clientX, e.clientY, e.target as Element);
  }, { passive: true });
  document.addEventListener('pointerleave', () => set(null));
}

/** After the page is redrawn: lift whatever card is now under the resting mouse. */
export function refreshLift() {
  if (!at) return;
  if (lifted && !lifted.isConnected) lifted = null;
  update(at.x, at.y, document.elementFromPoint(at.x, at.y));
}
