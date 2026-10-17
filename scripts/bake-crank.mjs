/**
 * Bakes a repair's crank (fx.ts crank, .crank, through bake/bake.ts crankPart) for the Unity game (BattleView.Crank.cs):
 * its white disc with its ring and shadow (disc.png: the disc 100 px with 12 px round it), and the spanner alone
 * (spanner.png: its svg's box, 60 px), which turns over the disc, to Resources/Icons/crank/.
 * Usage: node scripts/bake-crank.mjs
 */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const port = +(process.env.BAKE_PORT ?? 5196);
const server = await createServer({
  server: { port, strictPort: true, watch: null, hmr: false, fs: { strict: false } },
  ...(process.env.BAKE_CACHE ? { cacheDir: process.env.BAKE_CACHE } : {}),
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
// (Three times its CSS size: sharp on any screen, at the 72 px it is drawn at most.)
const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 400, height: 400 } });
await page.goto(`http://localhost:${port}/bake/index.html`);
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html, body, #stage { background: transparent !important; }' });
const dir = 'unity/Assets/Resources/Icons/crank';
mkdirSync(dir, { recursive: true });
await page.evaluate(() => window.crankPart('disc'));
writeFileSync(`${dir}/disc.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
await page.evaluate(() => window.crankPart('spanner'));
writeFileSync(`${dir}/spanner.png`, await (await page.$('#piece .crank svg')).screenshot({ type: 'png', omitBackground: true }));
console.log('crank: disc, spanner');
await browser.close();
await server.close();
