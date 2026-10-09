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
export function flyFrom(el: HTMLElement, from: DOMRect, opts: { delay?: number; duration?: number; fade?: boolean; rotate?: number; arc?: number } = {}) {
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
  if (opts.arc) {
    // Along a curve: a quadratic path bowed upwards by `arc` px, sampled with an ease-out (one smooth sweep, no wobble).
    const frames: Keyframe[] = [];
    const n = 16;
    const cx = dx / 2, cy = dy / 2 - opts.arc;
    for (let i = 0; i <= n; i++) {
      const t = 1 - Math.pow(1 - i / n, 3);
      const u = 1 - t;
      const x = u * u * dx + 2 * u * t * cx;
      const y = u * u * dy + 2 * u * t * cy;
      const k = s + (1 - s) * t;
      frames.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${k.toFixed(4)}) ${end}`, opacity: opts.fade ? Math.min(1, t * 2.5) : 1 });
    }
    el.animate(frames, { id: 'fly', duration: opts.duration ?? 420, delay: opts.delay ?? 0, easing: 'linear', fill: 'backwards' });
    return;
  }
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(${opts.rotate ?? 0}deg) ${end}`, opacity: opts.fade ? 0 : 1 },
      { transform: end || 'none', opacity: 1 },
    ],
    { id: 'fly', duration: opts.duration ?? 420, delay: opts.delay ?? 0, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
  );
}

/** A copy of a removed element flies from where it was to a target rect, then vanishes. */
export function ghost(html: string, from: DOMRect, to: DOMRect | null, opts: { delay?: number; duration?: number; size?: { w: number; h: number }; easing?: string; endOpacity?: number } = {}) {
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
  // One scale both ways, so the copy keeps the card's shape (a card on the tilted table looks shorter
  // on screen than it is: squeezing the flat copy into that box would stretch it). Centred on the card.
  const sx = from.width / w;
  const sy = sx;
  const top = from.top + (from.height - h * sy) / 2;
  Object.assign(el.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${top}px`,
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
  const dy = target.top + target.height / 2 - top - (h * sy * s) / 2;
  const anim = el.animate(
    [
      { transform: `scale(${sx}, ${sy})`, opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx * s}, ${sy * s})`, opacity: opts.endOpacity ?? (to ? 0.2 : 0) },
    ],
    { duration: opts.duration ?? 460, delay: opts.delay ?? 0, easing: opts.easing ?? 'cubic-bezier(.5,0,.3,1)', fill: 'both' },
  );
  anim.onfinish = () => el.remove();
}

/** A glowing bolt travelling from one element to another. */
export function projectile(from: Where, to: Where, colour: string, opts: { delay?: number; duration?: number; size?: number } = {}): number {
  const duration = opts.duration ?? 620;
  const delay = opts.delay ?? 0;
  if (reducedMotion()) return delay;
  const size = opts.size ?? 26;
  // The ends are measured as it fires (the card firing may still be flying into its slot).
  window.setTimeout(() => {
    const a = place(from), b = place(to);
    if (!a || !b) return;
    const el = document.createElement('div');
    el.className = 'bolt';
    el.style.setProperty('--c', colour);
    Object.assign(el.style, { width: `${size}px`, height: `${size}px` });
    document.body.appendChild(el);
    const x0 = a.left + a.width / 2 - size / 2, y0 = a.top + a.height / 2 - size / 2;
    const x1 = b.left + b.width / 2 - size / 2, y1 = b.top + b.height / 2 - size / 2;
    const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 80;
    const anim = el.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${mx}px, ${my}px) scale(1.2)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.8)`, opacity: 1 },
      ],
      { duration, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' },
    );
    anim.onfinish = () => el.remove();
  }, delay);
  return delay + duration;
}

/** A place on the page: a rectangle, or a way to measure one when it is needed. */
export type Where = DOMRect | (() => DOMRect | null);
const place = (w: Where): DOMRect | null => (typeof w === 'function' ? w() : w);

/**
 * A straight beam of light shot from one element to another: it races out
 * from the source, holds for a moment with a bright head on the target, and
 * fades. Returns when it reaches the target.
 */
export function beam(from: DOMRect, to: DOMRect, colour: string, opts: { delay?: number; duration?: number; width?: number } = {}): number {
  const duration = opts.duration ?? 420;
  const delay = opts.delay ?? 0;
  if (reducedMotion()) return delay;
  // (The cooling beam is blue; anything else drawn this way is white.)
  const kind = colour === 'cool' ? 'cool' : 'plain';
  window.setTimeout(() => {
    const b = new Beam(kind, 0.12);
    b.mount();
    const t0 = performance.now();
    const grow = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      b.draw(from, to, 1 - (1 - k) ** 3);
      if (k < 1) requestAnimationFrame(grow);
      else b.fadeOut(duration * 0.6, 220);
    };
    requestAnimationFrame(grow);
  }, delay);
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

/**
 * Beams, after the arcs in digital card games: light, not a drawn line. Each is a filled shape laid
 * along a curve, hairline where it leaves its card and widening towards its target, in layers: a soft
 * halo, a translucent body in the beam's colour that brightens along its length, a white-hot core
 * that brightens towards the head, and a chevron at the head. It starts and ends just outside each
 * card's edge, so it never lies over the text of the card it leaves (or lands on). Red for an attack,
 * blue for cooling, white for anything else.
 */
type BeamKind = 'attack' | 'cool' | 'plain';
let beamIds = 0;
/**
 * The layers of a beam, outside in: each a ribbon (and arrowhead) a little narrower and brighter than the
 * last, softly blurred, so together they shade like a glowing tube, with no hard edge anywhere.
 */
const BEAM_LAYERS = [
  { cls: 'bl-glow', scale: 2.2, head: 1.35 },
  { cls: 'bl-rim', scale: 1.15, head: 1.08 },
  { cls: 'bl-body', scale: 0.92, head: 0.92 },
  { cls: 'bl-mid', scale: 0.62, head: 0.7 },
  { cls: 'bl-inner', scale: 0.36, head: 0.48 },
  { cls: 'bl-core', scale: 0.16, head: 0.26 },
];

class Beam {
  readonly svg: SVGSVGElement;
  private id = ++beamIds;
  constructor(kind: BeamKind, private bowShare = 0.36) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', `beam-arc beam-${kind}`);
    const n = this.id;
    const layer = (l: (typeof BEAM_LAYERS)[number]) => `<g class="${l.cls}"><path class="bl-tail"/><path class="bl-head"/></g>`;
    this.svg.innerHTML = `<defs>
        <filter id="bs${n}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.55"/></filter>
        <filter id="bg${n}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
        <linearGradient id="bf${n}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.28" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>
        <mask id="bm${n}" maskUnits="userSpaceOnUse" x="-10000" y="-10000" width="30000" height="30000"><rect x="-10000" y="-10000" width="30000" height="30000" fill="url(#bf${n})"/></mask>
      </defs>
      <g mask="url(#bm${n})">
        <g filter="url(#bg${n})">${layer(BEAM_LAYERS[0])}</g>
        <g filter="url(#bs${n})">${BEAM_LAYERS.slice(1).map(layer).join('')}<path class="bl-shine"/></g>
      </g>`;
  }
  mount() {
    document.body.appendChild(this.svg);
  }
  remove() {
    this.svg.remove();
  }
  fadeOut(delay: number, duration: number) {
    const out = this.svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration, delay, fill: 'both' });
    out.onfinish = () => this.remove();
  }
  /** Lay the beam from one rectangle to another, drawn out to `progress` (0–1) of its length. */
  draw(from: DOMRect, to: DOMRect, progress = 1) {
    const ax = from.left + from.width / 2, ay = from.top + from.height / 2;
    const bx = to.left + to.width / 2, by = to.top + to.height / 2;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(200, len * this.bowShare);
    // Bow upwards-ish (to the left of the direction of travel), and a little higher, as an arc thrown.
    const cx = (ax + bx) / 2 - (dy / len) * bow, cy = (ay + by) / 2 + (dx / len) * bow - bow * 0.35;
    const [x0, y0] = edge(from, ax, ay, cx, cy, 5);
    const [x1, y1] = edge(to, bx, by, cx, cy, 4);
    const at = (t: number): [number, number] => {
      const u = 1 - t;
      return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
    };
    const end = Math.max(0.02, progress);
    const [hx, hy] = at(end);
    // The fade-in from the source runs from the start to the head as it stands.
    const fade = this.svg.querySelector('linearGradient')!;
    fade.setAttribute('x1', x0.toFixed(1));
    fade.setAttribute('y1', y0.toFixed(1));
    fade.setAttribute('x2', hx.toFixed(1));
    fade.setAttribute('y2', hy.toFixed(1));
    const W = Math.max(5, Math.min(8, len / 45));
    const [hx0, hy0] = at(Math.max(0, end - 0.02));
    const ang = Math.atan2(hy - hy0, hx - hx0);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const pt = (fwd: number, side: number) => `${(hx + cos * fwd - sin * side).toFixed(1)} ${(hy + sin * fwd + cos * side).toFixed(1)}`;
    // The head's length. Each layer of the line runs on into the middle of the head, where the head's own
    // layer (wider there) covers its end, so line and head run together with no seam.
    const HL = W * 2.6;
    const tailEnd = end;
    /** A ribbon along the arc, `scale` of the beam's width, pushed `shift` widths to one side (`fade`: narrowing to nothing at its end). */
    const ribbon = (scale: number, shift = 0, fade = false) => {
      const n = 30;
      const left: string[] = [], right: string[] = [];
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * tailEnd;
        const [px, py] = at(t);
        const [qx, qy] = at(Math.min(1, t + 0.01));
        const tl = Math.hypot(qx - px, qy - py) || 1;
        const nx = -(qy - py) / tl, ny = (qx - px) / tl;
        // Fine at the start, swelling towards the head (eased, so most of the width comes late).
        const full = (0.15 + 0.85 * (i / n) ** 1.3) * W * (fade ? Math.min(1, (n - i) / 6) : 1);
        const w = full * scale * 0.5, o = full * shift;
        left.push(`${(px + nx * (o + w)).toFixed(1)} ${(py + ny * (o + w)).toFixed(1)}`);
        right.unshift(`${(px + nx * (o - w)).toFixed(1)} ${(py + ny * (o - w)).toFixed(1)}`);
      }
      return `M${left.join(' L')} L${right.join(' L')} Z`;
    };
    /**
     * The arrowhead, `k` of its full size: a diamond, its widest points well forward and its back drawn out
     * along the line (softly rounded, so the layers bevel it).
     */
    const head = (k: number) => {
      const l = HL * k, w = W * 1.15 * k;
      const tip = pt(l * 0.55, 0), back = pt(-l * 0.45, 0);
      const left = pt(-l * 0.02, w), right = pt(-l * 0.02, -w);
      return `M${tip} Q${pt(l * 0.2, w * 0.62)} ${left} Q${pt(-l * 0.2, w * 0.55)} ${back} Q${pt(-l * 0.2, -w * 0.55)} ${right} Q${pt(l * 0.2, -w * 0.62)} ${tip} Z`;
    };
    for (const l of BEAM_LAYERS) {
      const g = this.svg.querySelector(`.${l.cls}`)!;
      g.querySelector('.bl-tail')!.setAttribute('d', ribbon(l.scale));
      g.querySelector('.bl-head')!.setAttribute('d', head(l.head));
    }
    // A highlight along the upper side of the tube, where the light catches it.
    this.svg.querySelector('.bl-shine')!.setAttribute('d', ribbon(0.12, 0.2, true));
  }
}

/** Where a ray from a rectangle's centre (x, y) towards (tx, ty) leaves the rectangle, `gap` beyond it. */
function edge(r: DOMRect, x: number, y: number, tx: number, ty: number, gap: number): [number, number] {
  const dx = tx - x, dy = ty - y;
  const len = Math.hypot(dx, dy);
  if (!len) return [x, y];
  const ux = dx / len, uy = dy / len;
  const t = Math.min(ux ? r.width / 2 / Math.abs(ux) : Infinity, uy ? r.height / 2 / Math.abs(uy) : Infinity);
  const k = Math.min(t + gap, len * 0.9);
  return [x + ux * k, y + uy * k];
}

function drawTether(from: DOMRect, to: DOMRect, draw: number, hold: number) {
  const b = new Beam('plain');
  b.mount();
  const t0 = performance.now();
  const grow = (now: number) => {
    const k = Math.min(1, (now - t0) / draw);
    b.draw(from, to, 1 - (1 - k) ** 3);
    if (k < 1) requestAnimationFrame(grow);
    else b.fadeOut(hold, 260);
  };
  requestAnimationFrame(grow);
}

/**
 * A held aim: the arc from a card waiting to the card (or sun) it is aimed at, drawn out once and kept
 * (following both as the board moves) until the returned function takes it away.
 */
export function aim(source: () => DOMRect | null, target: () => DOMRect | null, opts: { delay?: number; alive?: () => boolean; kind?: BeamKind } = {}): () => void {
  const b = new Beam(opts.kind ?? 'attack');
  let frame = 0;
  let gone = false;
  let t0 = 0;
  const place = (now: number) => {
    if (opts.alive && !opts.alive()) return stop();
    const from = source(), to = target();
    // (The target itself is marked on the board: a ring round the card's or the sun's edge.)
    b.svg.style.visibility = from && to ? '' : 'hidden';
    const k = reducedMotion() ? 1 : Math.min(1, (now - t0) / 420);
    if (from && to) b.draw(from, to, 1 - (1 - k) ** 3);
    frame = requestAnimationFrame(place);
  };
  const start = window.setTimeout(() => {
    if (gone) return;
    b.mount();
    t0 = performance.now();
    frame = requestAnimationFrame(place);
  }, opts.delay ?? 0);
  const stop = () => {
    gone = true;
    window.clearTimeout(start);
    cancelAnimationFrame(frame);
    b.remove();
  };
  return stop;
}

/**
 * An aim being dragged: the attack beam from a card to the pointer (or finger), its head at the pointer and
 * following it, until stopped. `to` moves its head (a point in the page's own coordinates, like the source's
 * rectangle: see viewport.ts toPage); `stop` takes it away.
 */
export function pointerAim(source: () => DOMRect | null, kind: BeamKind = 'attack'): { to: (x: number, y: number) => void; stop: () => void } {
  const b = new Beam(kind, 0.22);
  b.mount();
  let at: [number, number] | null = null;
  let frame = 0;
  const place = () => {
    const from = source();
    b.svg.style.visibility = from && at ? '' : 'hidden';
    // (The head's tip on the pointer: the beam ends a hair short of a point there.)
    if (from && at) b.draw(from, new DOMRect(at[0] - 1, at[1] - 1, 2, 2), 1);
    frame = requestAnimationFrame(place);
  };
  frame = requestAnimationFrame(place);
  return {
    to: (x, y) => (at = [x, y]),
    stop: () => {
      cancelAnimationFrame(frame);
      b.remove();
    },
  };
}

/**
 * A sun going supernova: a white-hot flash swelling from it, shockwave rings racing out across the
 * board, and sparks flung in every direction, all fading as they go.
 */
export function supernovaBurst(at: DOMRect) {
  if (reducedMotion()) return;
  const x = at.left + at.width / 2, y = at.top + at.height / 2;
  const r = Math.max(30, at.width / 2);
  const layer = document.createElement('div');
  layer.className = 'nova-burst';
  Object.assign(layer.style, { left: `${x}px`, top: `${y}px` });
  document.body.appendChild(layer);
  const add = (cls: string) => {
    const el = document.createElement('i');
    el.className = cls;
    layer.appendChild(el);
    return el;
  };
  // The flash: white at the heart, orange at its edge, swelling past the sun and fading.
  const core = add('nova-core');
  Object.assign(core.style, { width: `${r * 2}px`, height: `${r * 2}px`, margin: `${-r}px 0 0 ${-r}px` });
  core.animate(
    [
      { transform: 'scale(0.6)', opacity: 1 },
      { transform: 'scale(2.6)', opacity: 1, offset: 0.25 },
      { transform: 'scale(4.2)', opacity: 0 },
    ],
    { duration: 1300, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
  );
  // Shockwaves: three rings, each a little later and wider.
  [0, 140, 320].forEach((delay, i) => {
    const ring = add('nova-ring');
    Object.assign(ring.style, { width: `${r * 2}px`, height: `${r * 2}px`, margin: `${-r}px 0 0 ${-r}px` });
    ring.animate(
      [
        { transform: 'scale(0.8)', opacity: 0.95, borderWidth: `${6 - i}px` },
        { transform: `scale(${7 + i * 3})`, opacity: 0, borderWidth: '1px' },
      ],
      { duration: 1100 + i * 250, delay, easing: 'cubic-bezier(.15,.6,.3,1)', fill: 'both' },
    );
  });
  // Sparks flung outwards.
  const n = 28;
  for (let i = 0; i < n; i++) {
    const spark = add('nova-spark');
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const dist = r * (2.2 + Math.random() * 3.5);
    const size = 3 + Math.random() * 5;
    Object.assign(spark.style, { width: `${size}px`, height: `${size}px`, margin: `${-size / 2}px 0 0 ${-size / 2}px` });
    spark.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 700, delay: 60 + Math.random() * 120, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' },
    );
  }
  window.setTimeout(() => layer.remove(), 2400);
}

/**
 * A heat wave going out from the Stellari in a ring, across the board (an ellipse, as the board lies tilted):
 * from `center` to radii `rx`, `ry` (page pixels) over `duration`, steadily, so it reaches a point at a set time
 * (waveReach). A hot band, glowing, fading as it goes.
 */
export function heatWave(center: DOMRect, rx: number, ry: number, opts: { delay?: number; duration?: number } = {}) {
  if (reducedMotion()) return;
  const duration = opts.duration ?? 900;
  window.setTimeout(() => {
    const el = document.createElement('div');
    el.className = 'heat-wave';
    const cx = center.left + center.width / 2, cy = center.top + center.height / 2;
    Object.assign(el.style, { left: `${cx - rx}px`, top: `${cy - ry}px`, width: `${2 * rx}px`, height: `${2 * ry}px` });
    document.body.appendChild(el);
    const anim = el.animate(
      [
        { transform: 'scale(0.04)', opacity: 0 },
        { transform: 'scale(0.12)', opacity: 1, offset: 0.08 },
        { transform: 'scale(0.75)', opacity: 0.9, offset: 0.75 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      { duration, easing: 'linear', fill: 'both' },
    );
    anim.onfinish = () => el.remove();
  }, opts.delay ?? 0);
}

/** How far out (0 at the centre, 1 at the wave's edge) a point lies on a heat wave's ellipse. */
export function waveReach(center: DOMRect, rx: number, ry: number, at: DOMRect): number {
  const dx = at.left + at.width / 2 - (center.left + center.width / 2), dy = at.top + at.height / 2 - (center.top + center.height / 2);
  return Math.hypot(dx / rx, dy / ry);
}
