/**
 * The tutorial: a guided tour of a screen, the oracle talking it through step by step while the part he
 * talks about is lit (the rest of the screen dimmed) and outlined.
 *
 * Highlights follow what is really on screen, even on the tilted board: rather than an element's bounding
 * box, a shape is traced in the element's own plane (its corners, or a circle round its middle) by pinning
 * tiny markers there and reading where they land. So a slot on the tilted board is lit as the trapezoid it
 * appears as, and a sun's orbit as the ellipse it is.
 *
 * Whether it runs: on for a player's first campaign, and a setting in the campaign's menu after that
 * (turning it back on replays every tour).
 */
import { appSize, pageRect } from './viewport';

/** Something to light: an element's own outline (its corners), or a circle in its plane. */
export type Shape =
  /** An element's own outline, rounded corners and all, `pad` px out; `round`: the corner radius to use (px, or 'pill'). */
  | { sel: string; all?: boolean; pad?: number; round?: number | 'pill' }
  /** A circle in the element's plane: centre and radius as shares of its width and height (radius of its width). */
  | { sel: string; all?: boolean; circle: { r: number; cx?: number; cy?: number } };

export interface TourStep {
  title: string;
  text: string;
  /** What to light (none: the oracle speaks over the whole screen). Steps whose shapes aren't on screen are passed over. */
  shapes?: Shape[];
}

// ---- The setting --------------------------------------------------------------

const ON_KEY = 'blue-loop:tutorial';
const SEEN_KEY = 'blue-loop:tutorial-seen';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // only a convenience
  }
}

/** Whether the tutorial runs: on unless turned off (so a first campaign always has it). */
export function tutorialOn(): boolean {
  return read(ON_KEY) !== 'off';
}
/** Turn the tutorial on (every tour plays again) or off. */
export function setTutorial(on: boolean) {
  write(ON_KEY, on ? 'on' : 'off');
  if (on) write(SEEN_KEY, null);
}
function seen(): string[] {
  try {
    return JSON.parse(read(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
/** Whether a tour is still to be shown. */
export function tourDue(id: string): boolean {
  return tutorialOn() && !seen().includes(id) && !active;
}
function markSeen(id: string) {
  write(SEEN_KEY, JSON.stringify([...new Set([...seen(), id])]));
}

// ---- Tracing shapes -------------------------------------------------------------

type Pt = [number, number];

/** Where points in an element's own plane land on the page: pins a marker at each, reads it, and takes them away. */
function project(el: HTMLElement, at: { x: string; y: string }[]): Pt[] {
  const style = getComputedStyle(el);
  const wasStatic = style.position === 'static';
  if (wasStatic) el.style.position = 'relative';
  const marks = at.map(({ x, y }) => {
    const m = document.createElement('tour-mark');
    m.style.cssText = `display:block;position:absolute;left:${x};top:${y};width:0;height:0;margin:0;padding:0;border:0;pointer-events:none;transform:none;`;
    el.appendChild(m);
    return m;
  });
  const pts = marks.map((m) => {
    const r = pageRect(m);
    return [r.left, r.top] as Pt;
  });
  for (const m of marks) m.remove();
  if (wasStatic) el.style.position = '';
  return pts;
}

/** A shape's outlines on the page (one per element it covers), as closed polygons. */
/** Outlines traced round a circle (drawn as a smooth curve; the rest keep their straight sides). */
const CURVED = new WeakSet<Pt[]>();

function trace(shape: Shape): Pt[][] {
  const els = [...document.querySelectorAll<HTMLElement>(shape.sel)].filter((el) => el.getClientRects().length > 0);
  const used = shape.all ? els : els.slice(0, 1);
  return used.map((el) => {
    if ('circle' in shape) {
      const { r, cx = 0.5, cy = 0.5 } = shape.circle;
      // (The radius is a share of the width; in a non-square box, the same length down as across.)
      const w = el.offsetWidth || 1;
      const h = el.offsetHeight || 1;
      const n = 40;
      const ring = project(
        el,
        Array.from({ length: n }, (_, k) => {
          const a = (k / n) * Math.PI * 2;
          return { x: `${(cx + Math.cos(a) * r) * 100}%`, y: `${((cy * h + Math.sin(a) * r * w) / h) * 100}%` };
        }),
      );
      CURVED.add(ring);
      return ring;
    }
    // Its own outline: its border-radius (each corner), grown by the padding, traced round in its own plane.
    const p = shape.pad ?? 6;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cs = getComputedStyle(el);
    const own = (v: string) => {
      const n = parseFloat(v) || 0;
      return v.trim().endsWith('%') ? (n / 100) * Math.min(w, h) : n;
    };
    const max = Math.min(w, h) / 2;
    const radius = (v: string) => {
      const r = shape.round === 'pill' ? max : typeof shape.round === 'number' ? shape.round : Math.min(max, own(v));
      // (A square element still gets softened corners: the padding's own curve.)
      return Math.min(max + p, r + p);
    };
    const [tl, tr, br, bl] = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(radius);
    const pts: { x: string; y: string }[] = [];
    const n = 9;
    // Each corner: a quarter circle about its centre, clockwise from the top left.
    const corner = (cx: number, cy: number, r: number, from: number) => {
      for (let k = 0; k <= n; k++) {
        const a = ((from + (k / n) * 90) * Math.PI) / 180;
        pts.push({ x: `${(cx + Math.cos(a) * r).toFixed(2)}px`, y: `${(cy + Math.sin(a) * r).toFixed(2)}px` });
      }
    };
    corner(-p + tl, -p + tl, tl, 180);
    corner(w + p - tr, -p + tr, tr, 270);
    corner(w + p - br, h + p - br, br, 0);
    corner(-p + bl, h + p - bl, bl, 90);
    return project(el, pts);
  });
}

/** A polygon as a path: a smooth closed curve for many points (a circle), straight sides with rounded joins for few. */
function pathOf(pts: Pt[], smooth = CURVED.has(pts)): string {
  if (smooth) {
    // Catmull-Rom through the points, closed.
    const at = (i: number) => pts[(i + pts.length) % pts.length];
    let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
    for (let i = 0; i < pts.length; i++) {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }
  return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
}

// ---- The tour --------------------------------------------------------------------

let active: { close: (finished: boolean) => void } | null = null;

/** Whether a tour is showing (the game holds still meanwhile). */
export function tourShowing(): boolean {
  return !!active;
}

/**
 * Show a tour (once: it is remembered as seen when it ends, finished or skipped). `who` is the speaker's
 * portrait (markup) and name. Returns false if it isn't due.
 */
export function startTour(id: string, steps: TourStep[], who: { face: string; name: string }, onEnd?: () => void): boolean {
  if (!tourDue(id)) return false;
  let i = 0;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `
    <svg class="tour-veil" aria-hidden="true"><defs><mask id="tour-mask"><rect class="tour-all" fill="#fff"/><g class="tour-holes"></g></mask>
      <filter id="tour-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter></defs>
      <rect class="tour-dim" mask="url(#tour-mask)"/><g class="tour-lines"></g></svg>
    <aside class="tour-bubble" role="dialog" aria-live="polite" aria-label="${who.name}">
      <div class="tour-face">${who.face}</div>
      <p class="tour-text"></p>
      <div class="tour-foot">
        <button class="tour-back" aria-label="Back">‹</button>
        <span class="tour-dots" aria-hidden="true"></span>
        <button class="tour-next" aria-label="Next">›</button>
      </div>
      <button class="tour-skip" aria-label="Skip the tutorial" title="Skip the tutorial">×</button>
    </aside>`;
  document.body.appendChild(root);
  const svg = root.querySelector<SVGSVGElement>('.tour-veil')!;
  const bubble = root.querySelector<HTMLElement>('.tour-bubble')!;

  /** The step's outlines as they stand now (empty: nothing of it on screen). */
  const outlines = (step: TourStep) => (step.shapes ?? []).flatMap(trace).filter((p) => p.length >= 3);
  // Steps about something that isn't there (no planets, say) are passed over.
  const shown = () => steps.filter((s) => !s.shapes?.length || outlines(s).length);

  const draw = () => {
    const list = shown();
    if (!list.length) return close(true);
    i = Math.min(i, list.length - 1);
    const step = list[i];
    const { w, h } = appSize();
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    for (const r of svg.querySelectorAll('.tour-all, .tour-dim')) {
      r.setAttribute('width', String(w));
      r.setAttribute('height', String(h));
    }
    const polys = outlines(step);
    const d = polys.map((poly) => pathOf(poly)).join('');
    svg.querySelector('.tour-holes')!.innerHTML = d ? `<path d="${d}" fill="#000" stroke="#000" stroke-width="10" stroke-linejoin="round"/>` : '';
    svg.querySelector('.tour-lines')!.innerHTML = d
      ? `<path class="tour-glow" d="${d}" filter="url(#tour-glow)"/><path class="tour-line" d="${d}"/>`
      : '';
    root.classList.toggle('tour-open', !d);

    root.querySelector('.tour-text')!.textContent = step.text;
    root.querySelector('.tour-dots')!.innerHTML = list.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'past' : ''}"></i>`).join('');
    root.querySelector<HTMLButtonElement>('.tour-back')!.disabled = i === 0;
    root.querySelector('.tour-next')!.textContent = i === list.length - 1 ? '✓' : '›';
    place(polys.flat(), w, h);
  };

  /** The bubble beside what is lit: below it if there's room, else above, else to a side, kept on screen. */
  const place = (pts: Pt[], w: number, h: number) => {
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const gap = 18;
    let x = (w - bw) / 2;
    let y = h - bh - 24;
    if (pts.length) {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const [l, r, t, b] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const mid = (l + r) / 2;
      if (b + gap + bh <= h - 8) [x, y] = [mid - bw / 2, b + gap];
      else if (t - gap - bh >= 8) [x, y] = [mid - bw / 2, t - gap - bh];
      else if (r + gap + bw <= w - 8) [x, y] = [r + gap, (t + b) / 2 - bh / 2];
      else if (l - gap - bw >= 8) [x, y] = [l - gap - bw, (t + b) / 2 - bh / 2];
      else [x, y] = [(w - bw) / 2, Math.max(8, h - bh - 24)];
    }
    bubble.style.left = `${Math.round(Math.max(8, Math.min(w - bw - 8, x)))}px`;
    bubble.style.top = `${Math.round(Math.max(8, Math.min(h - bh - 8, y)))}px`;
  };

  const go = (by: number) => {
    const n = shown().length;
    if (i + by >= n) return close(true);
    i = Math.max(0, i + by);
    draw();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'Escape') close(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  // Things on the board move (cards land, planets turn, the page resizes): the outlines follow.
  const timer = window.setInterval(draw, 250);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', draw);

  function close(finished: boolean) {
    if (!active) return;
    active = null;
    window.clearInterval(timer);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', draw);
    markSeen(id);
    root.classList.add('tour-out');
    window.setTimeout(() => root.remove(), 250);
    onEnd?.();
    void finished;
  }

  root.querySelector('.tour-next')!.addEventListener('click', () => go(1));
  root.querySelector('.tour-back')!.addEventListener('click', () => go(-1));
  // Skipping turns the tutorial off for good (it can be turned back on in the campaign's settings).
  root.querySelector('.tour-skip')!.addEventListener('click', () => {
    setTutorial(false);
    close(false);
  });
  active = { close };
  draw();
  // (Once the bubble has its size, place it again.)
  requestAnimationFrame(draw);
  return true;
}

/** Close any tour showing (leaving the screen it is about). */
export function closeTour() {
  active?.close(false);
}
