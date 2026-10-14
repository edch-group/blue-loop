/** Bakes the shop's booster packs and the deck builder's marks for the Unity game (Assets/Resources/Icons). */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Icons';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5207, strictPort: true, fs: { strict: false } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:5207/bake/index.html');
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html,body,#stage{background:transparent!important}' });
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const shoot = async (file) => writeFileSync(`${out}/${file}.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
// The packs: one for each race, and the general one.
for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', 'general']) {
  await page.evaluate((kind) => window.pack(kind, 132), k);
  await settle();
  await page.waitForTimeout(150);
  await shoot(`pack-${k}`);
}
// The game modes' pictures, picked and not (their paintings loaded first).
for (const m of ['core', 'lost'])
  for (const off of [false, true]) {
    await page.evaluate(([mode, o]) => window.modePic(mode, 232, o), [m, off]);
    await page.evaluate(() => Promise.all([...document.querySelectorAll('#piece img')].map((i) => i.decode().catch(() => undefined))));
    await page.waitForTimeout(600);
    await settle();
    await shoot(`mode-${m}${off ? '-off' : ''}`);
  }
for (const name of await page.evaluate(() => window.dbIconNames())) {
  await page.evaluate((n) => window.dbIcon(n, 32), name);
  await settle();
  await shoot(`db-${name}`);
}
console.log('packs, modes and marks baked');
await browser.close();
await server.close();
