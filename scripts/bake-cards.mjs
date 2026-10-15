/**
 * Bakes the web game's card faces into pictures for the Unity game (Assets/Resources/CardFaces/<variant>/<id>.jpg),
 * through the bake page (bake/) in headless Chromium: the same styles, fonts and art the web game draws them with. Each
 * face's shape (its rounded corners, as the web draws them) goes beside it as its alpha (<variant>-alpha/<id>.png).
 *
 * Two kinds of variant:
 * - `table` and `face`: the old two, a card in play 200 px wide and a magnified one (.card-big) 300 px wide, for the
 *   large views (the inspector, the zoom) and as the fallback.
 * - Sized ones: a card as the web draws it at that width in that place (bake.ts faceIn): in play (`table-p<w>` on a
 *   phone, where the page is short and landscape and the web's phone rules hold, `table-d<w>` not), in the hand
 *   (`hand-<w>`), or on its own (`card-<w>`: the stage's). The web's card sizes its words and art with floors (max(),
 *   clamp()), so a card drawn 66 px wide is not the 200 px one shrunk: each size it is drawn at gets its own. Faces.cs
 *   keeps the same list.
 *
 * Usage: node scripts/bake-cards.mjs [--only=<variant>,…] [ids…]  (no ids: every card; no --only: every variant)
 */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/CardFaces';

// (The page each is drawn on: a phone's, short and landscape, or a desktop's.)
const PHONE = { width: 932, height: 430 };
const DESK = { width: 1366, height: 768 };
// (Baked at more than their CSS size, so they stay sharp: a phone's screen is 3 pixels to its CSS pixel; a desktop's
// page is zoomed (viewport.ts, up to 1.75) and often 2 to 1.)
const VARIANTS = [
  { dir: 'table', page: { width: 800, height: 1000 }, scale: 2, draw: ['face', 'table', 200] },
  { dir: 'face', page: { width: 800, height: 1000 }, scale: 2, draw: ['face', 'face', 300] },
  // In play (--tcw): a phone's board 50 to 86 px (its own rules: the phone's), a desktop's about 80 to 98.
  ...[56, 66, 78].map((w) => ({ dir: `table-p${w}`, page: PHONE, scale: 3, draw: ['faceIn', 'table', w] })),
  ...[84, 96].map((w) => ({ dir: `table-d${w}`, page: DESK, scale: 2, draw: ['faceIn', 'table', w] })),
  // In the hand (--hw): 66 to 103 px on a phone, about 110 to 141 on a desktop (the phone's rules change nothing here).
  ...[[66, 3], [79, 3], [100, 2.5], [124, 2]].map(([w, scale]) => ({ dir: `hand-${w}`, page: PHONE, scale, draw: ['faceIn', 'hand', w] })),
  // A card on its own (.stage .card, as the stage, the reply's cards, the shop's reveal and the deck builder draw one;
  // the phone's rules change nothing here either): the reply's cards (half the stage's, 86 to 125 px), and the stage's
  // (180 to 250 px, where no floor is reached: the one shrunk).
  ...[[88, 2.5], [125, 2], [250, 1.8]].map(([w, scale]) => ({ dir: `card-${w}`, page: PHONE, scale, draw: ['faceIn', 'stage', w] })),
];

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const variants = only ? VARIANTS.filter((v) => only.includes(v.dir)) : VARIANTS;

// (No watching: a bake reads each file once. A worktree's node_modules may be a link to the main checkout's: BAKE_CACHE
// keeps its own copy of the prepared modules, apart from the main checkout's dev server's.)
const port = +(process.env.BAKE_PORT ?? 5199);
const server = await createServer({
  server: { port, strictPort: true, watch: null, hmr: false, fs: { strict: false } },
  ...(process.env.BAKE_CACHE ? { cacheDir: process.env.BAKE_CACHE } : {}),
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

let n = 0;
for (const v of variants) {
  const page = await browser.newPage({ deviceScaleFactor: v.scale, viewport: v.page });
  await page.goto(`http://localhost:${port}/bake/index.html`);
  await page.waitForFunction(() => window.ready === true);
  // (Taken on nothing: what is outside a card's corners is left clear.)
  await page.addStyleTag({ content: 'html, body, #stage { background: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  const ids = args.filter((a) => !a.startsWith('--')).length ? args.filter((a) => !a.startsWith('--')) : await page.evaluate(() => window.allIds());
  mkdirSync(`${out}/${v.dir}`, { recursive: true });
  mkdirSync(`${out}/${v.dir}-alpha`, { recursive: true });
  for (const id of ids) {
    await page.evaluate(([fn, id, look, w]) => window[fn](id, look, w), [v.draw[0], id, v.draw[1], v.draw[2]]);
    // (Its picture and gems loaded before it is taken.)
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const card = await page.$('#stage .card');
    const shot = await card.screenshot({ type: 'png', omitBackground: true });
    writeFileSync(`${out}/${v.dir}/${id}.jpg`, await sharp(shot).flatten({ background: '#ffffff' }).jpeg({ quality: 86 }).toBuffer());
    const alpha = await sharp(shot).extractChannel(3).toBuffer();
    writeFileSync(`${out}/${v.dir}-alpha/${id}.png`, await sharp(alpha).joinChannel([alpha, alpha, alpha]).png({ compressionLevel: 9 }).toBuffer());
    if (++n % 100 === 0) console.log(n, v.dir);
  }
  await page.close();
}
console.log(`${n} faces`);
await browser.close();
await server.close();
