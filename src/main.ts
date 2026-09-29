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

new App(document.getElementById('app')!).start();

// Installed as a web app (e.g. "Add to Home Screen" on iPhone): cache the game so it
// runs offline. Skipped in development and in the Electron build (file://).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
