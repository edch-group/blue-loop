/**
 * Animation helpers. The UI re-renders from state each change, so movement
 * is animated FLIP-style: snapshot element positions before a render, then
 * animate each element from its old place to its new one.
 *
 * All rectangles are in the page's own coordinates (see viewport.ts), which
 * differ from the screen's when a portrait screen shows the page sideways.
 */
import { pageRect } from './viewport';

export interface Snapshot {
  /** Where each card is on screen, its markup, and its own (untransformed) layout size. */
  cards: Map<string, { rect: DOMRect; html: string; w: number; h: number }>;
  anchors: Map<string, DOMRect>;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Record where every card ([data-uid]) and anchor ([data-anchor]) sits. */
export function snapshot(root: HTMLElement): Snapshot {
  const cards = new Map<string, { rect: DOMRect; html: string; w: number; h: number }>();
  root.querySelectorAll<HTMLElement>('[data-uid]').forEach((el) => {
    cards.set(el.dataset.uid!, { rect: pageRect(el), html: el.outerHTML, w: el.offsetWidth, h: el.offsetHeight });
  });
  const anchors = new Map<string, DOMRect>();
  root.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => anchors.set(el.dataset.anchor!, pageRect(el)));
  return { cards, anchors };
}

export function anchorRect(root: HTMLElement, name: string): DOMRect | null {
  const el = root.querySelector<HTMLElement>(`[data-anchor="${name}"]`);
  return el ? pageRect(el) : null;
}

/** Animate `el` from `from` to where it is now. */
export function flyFrom(el: HTMLElement, from: DOMRect, opts: { delay?: number; duration?: number; fade?: boolean; rotate?: number } = {}) {
  if (reducedMotion()) return;
  // One flight at a time: a newer flight replaces any still running (so a card never animates twice).
  for (const a of el.getAnimations()) if ((a as Animation & { id: string }).id === 'fly') a.cancel();
  const to = pageRect(el);
  if (!to.width || !from.width) return;
  // Rects are in screen space, but the transform applies in the element's own space, which may be
  // scaled and tilted (the battle table is in perspective). Convert the screen offset into it.
  const kx = el.offsetWidth ? to.width / el.offsetWidth : 1;
  const ky = el.offsetHeight ? to.height / el.offsetHeight : 1;
  const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) / (kx || 1);
  const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / (ky || 1);
  const s = Math.min(from.width / to.width, from.height / to.height);
  // Land on the element's own transform (e.g. its angle in the fanned hand).
  const rest = getComputedStyle(el).transform;
  const end = rest === 'none' ? '' : rest;
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(${opts.rotate ?? 0}deg) ${end}`, opacity: opts.fade ? 0 : 1 },
      { transform: end || 'none', opacity: 1 },
    ],
    { id: 'fly', duration: opts.duration ?? 420, delay: opts.delay ?? 0, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
  );
}

/** A copy of a removed element flies from where it was to a target rect, then vanishes. */
export function ghost(html: string, from: DOMRect, to: DOMRect | null, opts: { delay?: number; duration?: number; size?: { w: number; h: number } } = {}) {
  if (reducedMotion()) return;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const el = holder.firstElementChild as HTMLElement | null;
  if (!el) return;
  el.removeAttribute('data-act');
  el.removeAttribute('data-uid');
  el.removeAttribute('data-card');
  // Lay the copy out at the card's own size (so its text keeps its proportions), then scale it onto the screen rect.
  const w = opts.size?.w || from.width;
  const h = opts.size?.h || from.height;
  const sx = from.width / w;
  const sy = from.height / h;
  Object.assign(el.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${w}px`,
    height: `${h}px`,
    margin: '0',
    zIndex: '40',
    pointerEvents: 'none',
    transformOrigin: '0 0',
  });
  el.style.setProperty('--cw', `${w}px`);
  el.style.setProperty('--tcw', `${w}px`);
  document.body.appendChild(el);
  const target = to ?? new DOMRect(from.left, from.top - 40, from.width, from.height);
  const s = Math.max(0.15, Math.min(target.width / from.width, target.height / from.height));
  const dx = target.left + target.width / 2 - from.left - (w * sx * s) / 2;
  const dy = target.top + target.height / 2 - from.top - (h * sy * s) / 2;
  const anim = el.animate(
    [
      { transform: `scale(${sx}, ${sy})`, opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx * s}, ${sy * s})`, opacity: to ? 0.2 : 0 },
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

/**
 * Removal: a glowing white arc from the card doing the removing to its target,
 * drawn out, held briefly over the target (which glows), then faded. Returns
 * when the arc has reached the target, so the removal can play out after it.
 */
export function tether(source: DOMRect | (() => DOMRect | null), to: DOMRect, opts: { delay?: number } = {}): number {
  const delay = opts.delay ?? 0;
  const draw = 420;
  const hold = 520;
  if (reducedMotion()) return delay;
  // The source may still be moving (a card flying into place): measure it when the arc starts.
  window.setTimeout(() => {
    const from = typeof source === 'function' ? source() : source;
    if (from) drawTether(from, to, draw, hold);
  }, delay);
  return delay + draw + hold * 0.7;
}

function drawTether(from: DOMRect, to: DOMRect, draw: number, hold: number) {
  const delay = 0;
  const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
  const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;
  // Bow the arc sideways from the straight line, by a third of its length.
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(160, len * 0.32);
  const cx = (x0 + x1) / 2 - (dy / len) * bow, cy = (y0 + y1) / 2 + (dx / len) * bow - bow * 0.3;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'tether');
  const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  svg.innerHTML = `<path class="tether-glow" d="${d}"/><path class="tether-line" d="${d}"/><circle class="tether-tip" cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="0"/>`;
  document.body.appendChild(svg);
  for (const path of svg.querySelectorAll('path')) {
    const L = path.getTotalLength();
    path.style.strokeDasharray = `${L}`;
    path.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: draw, delay, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'both' });
  }
  svg.querySelector('circle')!.animate([{ r: 0, opacity: 0 }, { r: Math.max(to.width, to.height) * 0.62, opacity: 0.9, offset: 0.4 }, { r: Math.max(to.width, to.height) * 0.7, opacity: 0 }], {
    duration: hold + 200,
    delay: delay + draw - 60,
    easing: 'ease-out',
    fill: 'both',
  });
  const out = svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: delay + draw + hold, fill: 'both' });
  out.onfinish = () => svg.remove();
  // A glow on the target itself while the arc holds it.
  const halo = document.createElement('div');
  halo.className = 'tether-halo';
  Object.assign(halo.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
  document.body.appendChild(halo);
  halo.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: hold + 300, delay: delay + draw - 80, fill: 'both' }).onfinish = () => halo.remove();
}
