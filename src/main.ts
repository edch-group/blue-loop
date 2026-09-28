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
