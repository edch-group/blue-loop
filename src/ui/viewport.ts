/**
 * The page is always landscape. On a portrait screen (a phone held upright,
 * with rotation locked or not) the whole page is turned a quarter-turn
 * clockwise and laid out as landscape, so the game simply plays sideways.
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
 */
let rotated = false;
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
    rotated = portraitQuery.matches;
    screenW = w;
    size = rotated ? { w: h, h: w } : { w, h };
    root.classList.toggle('rotated', rotated);
    root.style.setProperty('--screen-w', `${w}px`);
    root.style.setProperty('--app-w', `${size.w}px`);
    root.style.setProperty('--app-h', `${size.h}px`);
    root.style.setProperty('--vw', `${size.w / 100}px`);
    root.style.setProperty('--vh', `${size.h / 100}px`);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => window.setTimeout(update, 250));
  window.visualViewport?.addEventListener('resize', update);
  portraitQuery.addEventListener?.('change', update);
  lockLandscape();
}

/** Where a browser allows it (Android, installed or full screen), lock the screen itself to landscape. */
function lockLandscape() {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  const tryLock = () => orientation?.lock?.('landscape').catch(() => undefined);
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
  if (!rotated) return r;
  // Turned clockwise: page x runs down the screen, page y runs right to left.
  return new DOMRect(r.top, screenW - r.right, r.height, r.width);
}

/** A screen-space movement (a finger's drag) in the page's own coordinates. */
export function toPageDelta(dx: number, dy: number): { x: number; y: number } {
  return rotated ? { x: dy, y: -dx } : { x: dx, y: dy };
}

/** An element's rectangle in the page's own coordinates. */
export function pageRect(el: Element): DOMRect {
  return toPage(el.getBoundingClientRect());
}
