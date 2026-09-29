// Fonts are bundled (no CDN) so the game works offline in desktop and mobile builds.
// Orbitron: titles, labels and numbers. Exo 2: card text and body copy.
import '@fontsource/orbitron/latin-400.css';
import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/exo-2/latin-300.css';
import '@fontsource/exo-2/latin-400.css';
import '@fontsource/exo-2/latin-600.css';
import './styles.css';
import { App } from './ui/app';
import { trackViewport } from './ui/viewport';

trackViewport();

// Wait for the fonts before the first paint: rendering in a fallback face and then
// swapping made the whole layout jump into place on phones. Give up after a moment
// so a slow or failed font load never blocks the game.
const fontsReady = Promise.all(
  ['400 1em Orbitron', '700 1em Orbitron', '400 1em "Exo 2"', '600 1em "Exo 2"'].map((f) => document.fonts.load(f).catch(() => undefined)),
);
const timeout = new Promise((resolve) => window.setTimeout(resolve, 1500));
void Promise.race([fontsReady, timeout]).then(() => {
  new App(document.getElementById('app')!).start();
  requestAnimationFrame(() => document.documentElement.classList.add('ready'));
});

// Installed as a web app (e.g. "Add to Home Screen" on iPhone): cache the game so it
// runs offline. Skipped in development and in the Electron build (file://).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
