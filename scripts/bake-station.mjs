/** Bakes the stations' pictures for the Unity game (Assets/Resources/Icons): the ship tab's schematic in pieces, the materials token, the flask. */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Icons';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5231, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:5231/bake/station.html');
await page.waitForFunction(() => window.ready === true);
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const shoot = async (name) => {
  await settle();
  writeFileSync(`${out}/${name}.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
};
await page.evaluate(() => window.hull(600));
await shoot('ship-hull');
for (const id of await page.evaluate(() => window.slots()))
  for (const mode of ['fill', 'line', 'dash']) {
    await page.evaluate(([i, m]) => window.slot(i, m, 600), [id, mode]);
    await shoot(`ship-${id}-${mode}`);
  }
await page.evaluate(() => window.token('MATERIALS', 64));
await shoot('materials');
await page.evaluate(() => window.token('RESEARCH_ICON', 64));
await shoot('research-flask');
console.log('station pictures baked');
await browser.close();
await server.close();
