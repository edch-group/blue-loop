/**
 * Bakes the web game's card faces into pictures for the Unity game (Assets/Resources/CardFaces/<variant>/<id>.jpg),
 * through the bake page (bake/) in headless Chromium: the same styles, fonts and art the web game draws them with. Each
 * face's shape (its rounded corners, as the web draws them) goes beside it as its alpha (<variant>-alpha/<id>.png).
 * Usage: node scripts/bake-cards.mjs [ids…]  (no ids: every card)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { globSync } from 'node:fs';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/CardFaces';
// (Baked at twice their CSS size, so they stay sharp on a large screen.)
const WIDTH = { table: 200, face: 300 };
const SCALE = 2;

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: SCALE, viewport: { width: 800, height: 1000 } });
await page.goto('http://localhost:5199/bake/index.html');
await page.waitForFunction(() => window.ready === true);
// (Taken on nothing: what is outside a card's corners is left clear.)
await page.addStyleTag({ content: 'html, body, #stage { background: transparent !important; }' });
await page.evaluate(() => document.fonts.ready);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : await page.evaluate(() => window.allIds());

let n = 0;
for (const variant of ['table', 'face']) {
  mkdirSync(`${out}/${variant}`, { recursive: true });
  mkdirSync(`${out}/${variant}-alpha`, { recursive: true });
  for (const id of ids) {
    await page.evaluate(([id, v, w]) => window.face(id, v, w), [id, variant, WIDTH[variant]]);
    // (Its picture and gems loaded before it is taken.)
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const card = await page.$('#stage .card');
    const shot = await card.screenshot({ type: 'png', omitBackground: true });
    writeFileSync(`${out}/${variant}/${id}.jpg`, await sharp(shot).flatten({ background: '#ffffff' }).jpeg({ quality: 86 }).toBuffer());
    const alpha = await sharp(shot).extractChannel(3).toBuffer();
    writeFileSync(`${out}/${variant}-alpha/${id}.png`, await sharp(alpha).joinChannel([alpha, alpha, alpha]).png({ compressionLevel: 9 }).toBuffer());
    if (++n % 100 === 0) console.log(n);
  }
}
console.log(`${n} faces`);
await browser.close();
await server.close();
