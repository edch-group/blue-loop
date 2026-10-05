import { defineConfig } from 'vite';

// `base: './'` so the built files load from file:// inside Electron.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  // The game's version and build day, sent with each anonymous game summary (so a balance change can be told apart).
  define: { __GAME_VERSION__: JSON.stringify(`${process.env.npm_package_version ?? '0'}+${new Date().toISOString().slice(0, 10)}`) },
});
