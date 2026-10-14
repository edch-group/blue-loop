/** Bakes the menu's icons and its title block for the Unity game (Assets/Resources/Icons). */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Icons';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:5199/bake/index.html');
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html,body,#stage{background:transparent!important}' });
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const names = await page.evaluate(() => window.iconNames());
for (const name of names) {
  for (const small of [false, true]) {
    await page.evaluate(([n, s]) => window.icon(n, 96, s), [name, small]);
    await settle();
    const el = await page.$('#piece');
    if (el) writeFileSync(`${out}/${name}${small ? '-small' : ''}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
  }
}
await page.evaluate(() => window.icon('title', 0));
await settle();
writeFileSync(`${out}/title.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
console.log(`${names.length} icons and the title`);
await browser.close();
await server.close();
