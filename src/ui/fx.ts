/**
 * Animation helpers. The UI re-renders from state each change, so movement
 * is animated FLIP-style: snapshot element positions before a render, then
 * animate each element from its old place to its new one.
 */

export interface Snapshot {
  cards: Map<string, { rect: DOMRect; html: string }>;
  anchors: Map<string, DOMRect>;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Record where every card ([data-uid]) and anchor ([data-anchor]) sits. */
export function snapshot(root: HTMLElement): Snapshot {
  const cards = new Map<string, { rect: DOMRect; html: string }>();
  root.querySelectorAll<HTMLElement>('[data-uid]').forEach((el) => {
    cards.set(el.dataset.uid!, { rect: el.getBoundingClientRect(), html: el.outerHTML });
  });
  const anchors = new Map<string, DOMRect>();
  root.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => anchors.set(el.dataset.anchor!, el.getBoundingClientRect()));
  return { cards, anchors };
}

export function anchorRect(root: HTMLElement, name: string): DOMRect | null {
  return root.querySelector<HTMLElement>(`[data-anchor="${name}"]`)?.getBoundingClientRect() ?? null;
}

/** Animate `el` from `from` to where it is now. */
export function flyFrom(el: HTMLElement, from: DOMRect, opts: { delay?: number; duration?: number; fade?: boolean; rotate?: number } = {}) {
  if (reducedMotion()) return;
  const to = el.getBoundingClientRect();
  if (!to.width || !from.width) return;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s = Math.min(from.width / to.width, from.height / to.height);
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(${opts.rotate ?? 0}deg)`, opacity: opts.fade ? 0 : 1 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: opts.duration ?? 420, delay: opts.delay ?? 0, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
  );
}

/** A copy of a removed element flies from where it was to a target rect, then vanishes. */
export function ghost(html: string, from: DOMRect, to: DOMRect | null, opts: { delay?: number; duration?: number } = {}) {
  if (reducedMotion()) return;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const el = holder.firstElementChild as HTMLElement | null;
  if (!el) return;
  el.removeAttribute('data-act');
  el.removeAttribute('data-uid');
  el.removeAttribute('data-card');
  Object.assign(el.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '40',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  const target = to ?? new DOMRect(from.left, from.top - 40, from.width, from.height);
  const dx = target.left + target.width / 2 - (from.left + from.width / 2);
  const dy = target.top + target.height / 2 - (from.top + from.height / 2);
  const s = Math.max(0.15, Math.min(target.width / from.width, target.height / from.height));
  const anim = el.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: to ? 0.2 : 0 },
    ],
    { duration: opts.duration ?? 460, delay: opts.delay ?? 0, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' },
  );
  anim.onfinish = () => el.remove();
}

/** A glowing bolt travelling from one element to another. */
export function projectile(from: DOMRect, to: DOMRect, colour: string, opts: { delay?: number; duration?: number; size?: number } = {}): number {
  const duration = opts.duration ?? 620;
  const delay = opts.delay ?? 0;
  if (reducedMotion()) return delay;
  const size = opts.size ?? 26;
  const el = document.createElement('div');
  el.className = 'bolt';
  el.style.setProperty('--c', colour);
  Object.assign(el.style, { width: `${size}px`, height: `${size}px` });
  document.body.appendChild(el);
  const x0 = from.left + from.width / 2 - size / 2, y0 = from.top + from.height / 2 - size / 2;
  const x1 = to.left + to.width / 2 - size / 2, y1 = to.top + to.height / 2 - size / 2;
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 80;
  const anim = el.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(0.4)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) scale(1.2)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.8)`, opacity: 1 },
    ],
    { duration, delay, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' },
  );
  anim.onfinish = () => el.remove();
  return delay + duration;
}

/** Briefly apply a CSS animation class to an element (restarting it if already running). */
export function pulse(el: Element | null, cls: string, delay = 0) {
  if (!el) return;
  window.setTimeout(() => {
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
    window.setTimeout(() => el.classList.remove(cls), 1400);
  }, delay);
}
