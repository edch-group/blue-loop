/**
 * Full-screen height. Installed on an iPhone home screen (with the translucent
 * status bar), WebKit reports a viewport shorter than the screen, so anything sized
 * by vh/dvh or `inset: 0` stops short and leaves a bar at the bottom. When the app
 * spans the whole screen width we know it owns the whole screen, so take the height
 * from the screen itself. Everything sizes from --app-h / --vh.
 */
export function trackViewport() {
  const root = document.documentElement;
  const update = () => {
    let h = window.innerHeight;
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    if (standalone) {
      const landscape = window.innerWidth > window.innerHeight;
      const sw = Math.max(screen.width, screen.height);
      const sh = Math.min(screen.width, screen.height);
      const [fullW, fullH] = landscape ? [sw, sh] : [sh, sw];
      // Only when the app is full width (not iPad split view) is the screen height ours.
      if (Math.abs(window.innerWidth - fullW) <= 2) h = Math.max(h, fullH);
    }
    root.style.setProperty('--app-h', `${h}px`);
    root.style.setProperty('--vh', `${h / 100}px`);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => window.setTimeout(update, 250));
  window.visualViewport?.addEventListener('resize', update);
}
