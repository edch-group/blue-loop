/**
 * From the game mode menu on, the page is always landscape. On a portrait
 * screen (a phone held upright) it first asks the player to turn the device
 * sideways. With rotation locked they can choose to play sideways anyway: the
 * whole page is then turned a quarter-turn clockwise and laid out as landscape
 * (remembered on this device). The landing and sign-in pages are not forced:
 * they lay out upright too (see forceLandscape).
 * Browsers cannot lock orientation on iPhone, so this is the only way to
 * guarantee it; where a real lock is allowed (Android, full screen) we ask for
 * one too.
 *
 * Also: installed on an iPhone home screen (with the translucent status bar),
 * WebKit reports a viewport shorter than the screen. When the app spans the
 * whole screen width we know it owns the whole screen, so the height comes
 * from the screen itself.
 *
 * Everything sizes from --app-w / --app-h and --vw / --vh (the page's own
 * width and height, as it is laid out), never the raw screen.
 *
 * On a big screen (a desktop or laptop browser) the whole page is scaled up
 * (CSS zoom on the body), so cards and text are as readable as on a tablet:
 * it is laid out at a smaller size and drawn larger. Rectangles and pointer
 * movements are converted back to the page's own units below.
 */
import { ScreenOrientation } from '@capacitor/screen-orientation';

/** Fired on window whenever the page's size or turn changes (after it has settled). */
export const VIEWPORT_EVENT = 'bl-viewport';

let rotated = false;
/** Whether the current page must be landscape (the landing and sign-in pages need not be). */
let forced = true;
let remeasure = () => undefined as void;
/** The player chose to play with the page turned sideways rather than turn the device. */
const SIDEWAYS_KEY = 'blue-loop:sideways';
let sideways = (() => {
  try {
    return localStorage.getItem(SIDEWAYS_KEY) === '1';
  } catch {
    return false;
  }
})();
/** How much the page is scaled up on a big screen (1 on phones and tablets). */
let zoom = 1;
/** The page is designed to read well at about this size; bigger screens scale it up, to at most MAX_ZOOM. */
const DESIGN = { w: 1100, h: 660 };
const MAX_ZOOM = 1.75;
let screenW = window.innerWidth;
let size = { w: window.innerWidth, h: window.innerHeight };

const portraitQuery = window.matchMedia('(orientation: portrait)');

export function trackViewport() {
  const root = document.documentElement;
  const update = () => {
    const w = window.innerWidth;
    let h = window.innerHeight;
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    if (standalone) {
      const landscape = w > h;
      const sw = Math.max(screen.width, screen.height);
      const sh = Math.min(screen.width, screen.height);
      const [fullW, fullH] = landscape ? [sw, sh] : [sh, sw];
      // Only when the app is full width (not iPad split view) is the screen height ours.
      if (Math.abs(w - fullW) <= 2) h = Math.max(h, fullH);
    }
    // The same test as the CSS media queries use, so the two always agree.
    const upright = forced && portraitQuery.matches;
    rotated = upright && sideways;
    root.classList.toggle('rotate-ask', upright && !sideways);
    screenW = w;
    zoom = rotated ? 1 : Math.max(1, Math.min(MAX_ZOOM, w / DESIGN.w, h / DESIGN.h));
    // Round, so text and borders land on whole pixels at common sizes.
    zoom = Math.floor(zoom * 20) / 20;
    size = rotated ? { w: h, h: w } : { w: w / zoom, h: h / zoom };
    const key = `${rotated}:${w}:${size.w}:${size.h}:${zoom}`;
    if (key === lastKey) return;
    lastKey = key;
    root.classList.toggle('rotated', rotated);
    root.style.setProperty('--ui-zoom', String(zoom));
    root.style.setProperty('--screen-w', `${w}px`);
    root.style.setProperty('--app-w', `${size.w}px`);
    root.style.setProperty('--app-h', `${size.h}px`);
    root.style.setProperty('--vw', `${size.w / 100}px`);
    root.style.setProperty('--vh', `${size.h / 100}px`);
    window.dispatchEvent(new Event(VIEWPORT_EVENT));
  };
  // iOS reports the new size a little while after a rotation begins (and sometimes reports a stale
  // size first), so keep measuring until it settles rather than trusting the first event.
  let timers: number[] = [];
  const settle = () => {
    update();
    timers.forEach((t) => window.clearTimeout(t));
    timers = [60, 180, 400, 800].map((ms) => window.setTimeout(update, ms));
  };
  let lastKey = '';
  remeasure = update;
  mountRotateHint(() => {
    sideways = true;
    try {
      localStorage.setItem(SIDEWAYS_KEY, '1');
    } catch {
      /* remembered for this visit only */
    }
    update();
  });
  update();
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  window.visualViewport?.addEventListener('resize', settle);
  portraitQuery.addEventListener?.('change', settle);
  if (forced) lockLandscape();
}

/** "Turn your device sideways", shown over the page while it waits for landscape. */
function mountRotateHint(playSideways: () => void) {
  const hint = document.createElement('div');
  hint.className = 'rotate-hint';
  hint.innerHTML = `<div class="rotate-hint-body">
      <div class="rotate-phone" aria-hidden="true"></div>
      <h1 class="title">blue loop</h1>
      <p>turn your device sideways to play</p>
      <button class="link-btn" type="button">rotation locked? play sideways anyway</button>
    </div>`;
  hint.querySelector('button')!.addEventListener('click', playSideways);
  document.body.appendChild(hint);
}

/**
 * Force landscape (turning the page on a portrait screen, and locking the
 * screen where allowed) or let the page lie whichever way the screen does.
 */
export function forceLandscape(on: boolean) {
  if (on === forced) return;
  forced = on;
  if (on) lockLandscape();
  else ScreenOrientation.unlock().catch(() => undefined);
  remeasure();
}

/**
 * Lock the screen itself to landscape wherever that is allowed: the native
 * app (which is landscape-only anyway), and Android browsers in full screen.
 * iPhone browsers refuse, which is why the page turns itself instead.
 */
function lockLandscape() {
  const tryLock = () => ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => undefined);
  tryLock();
  // Some browsers only allow a lock after a tap.
  window.addEventListener('pointerup', tryLock, { once: true });
}

/** The page's own size, as laid out (landscape). */
export function appSize(): { w: number; h: number } {
  return size;
}

/** A screen-space rectangle (getBoundingClientRect) in the page's own coordinates. */
export function toPage(r: DOMRect): DOMRect {
  if (zoom !== 1) return new DOMRect(r.x / zoom, r.y / zoom, r.width / zoom, r.height / zoom);
  if (!rotated) return r;
  // Turned clockwise: page x runs down the screen, page y runs right to left.
  return new DOMRect(r.top, screenW - r.right, r.height, r.width);
}

/** A screen-space movement (a finger's drag) in the page's own coordinates. */
export function toPageDelta(dx: number, dy: number): { x: number; y: number } {
  return rotated ? { x: dy, y: -dx } : { x: dx / zoom, y: dy / zoom };
}

/** An element's rectangle in the page's own coordinates. */
export function pageRect(el: Element): DOMRect {
  return toPage(el.getBoundingClientRect());
}
