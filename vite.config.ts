import { defineConfig } from 'vite';

// `base: './'` so the built files load from file:// inside Electron.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
