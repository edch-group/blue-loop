/**
 * Bakes the Stellari skill tree's looks for the Unity game alone (the part of bake-icons.mjs that is the tree's): each
 * skill's mark (Assets/Resources/Icons/up-<id>.png, white, tinted in the game) and every skill's words and the branches
 * (Assets/Resources/Engine/upgrades-look.json). Quicker than baking every icon when only the tree has changed.
 */
import { writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Icons';
const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:5198/bake/index.html');
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html,body,#stage{background:transparent!important}' });
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const ids = await page.evaluate(() => window.upIds());
for (const id of ids) {
  await page.evaluate((n) => window.upIcon(n, 48), id);
  await settle();
  writeFileSync(`${out}/up-${id}.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
}
writeFileSync('unity/Assets/Resources/Engine/upgrades-look.json', JSON.stringify(await page.evaluate(() => window.upLooks()), null, 1));
console.log(`${ids.length} skills`);
await browser.close();
await server.close();
