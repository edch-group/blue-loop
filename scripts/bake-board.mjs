/** Bakes the board's own pieces for the Unity game (Assets/Resources/Board): a card's back, and the Stellari's flower. */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Board';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 1000 } });
await page.goto('http://localhost:5199/bake/index.html');
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'body,#stage{background:transparent!important}' });
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await page.evaluate(() => window.piece('back', 200));
await settle();
writeFileSync(`${out}/back.jpg`, await (await page.$('#stage .card')).screenshot({ type: 'jpeg', quality: 88 }));
await page.evaluate(() => window.piece('flower', 400));
await settle();
writeFileSync(`${out}/flower.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
console.log('board pieces baked');
await browser.close();
await server.close();
