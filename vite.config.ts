/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The offline cache: once built, the service worker is given every file the game is made of (and a version
 * from their contents), so a first visit caches it all and the game runs offline after.
 */
function precache(): Plugin {
  let out = 'dist';
  return {
    name: 'blue-loop-precache',
    apply: 'build',
    configResolved(c) {
      out = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(out, p).split('\\').join('/'));
        }
      };
      walk(out);
      const list = files.filter((f) => f !== 'sw.js' && f !== '_headers').sort();
      const hash = createHash('sha256');
      for (const f of list) hash.update(f).update(readFileSync(join(out, f)));
      const sw = join(out, 'sw.js');
      writeFileSync(
        sw,
        readFileSync(sw, 'utf8')
          .replace('self.__PRECACHE = [];', `self.__PRECACHE = ${JSON.stringify(['./', ...list.map((f) => `./${f}`)])};`)
          .replace("'blue-loop-dev'", `'blue-loop-${hash.digest('hex').slice(0, 12)}'`),
      );
    },
  };
}

// `base: './'` so the built files load from file:// inside Electron.
export default defineConfig({
  base: './',
  plugins: [precache()],
  build: { outDir: 'dist', emptyOutDir: true },
  // The game's version and build day, sent with each anonymous game summary (so a balance change can be told apart).
  define: { __GAME_VERSION__: JSON.stringify(`${process.env.npm_package_version ?? '0'}+${new Date().toISOString().slice(0, 10)}`) },
});
