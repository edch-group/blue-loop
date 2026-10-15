/**
 * Bakes the marks of a Hero's picks (app.ts heroPicks, .hero-pick-mark, through bake/bake.ts heroMark) for the Unity
 * game: each effect's symbol on the white disc in its gold ring, and the attack's in red, to Resources/Icons/hero/.
 * Usage: node scripts/bake-hero-marks.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { globSync } from 'node:fs';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const server = await createServer({ server: { port: 5195, strictPort: true, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
// (Three times its CSS size: sharp on any screen.)
const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 400, height: 400 } });
await page.goto('http://localhost:5195/bake/index.html');
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html, body, #stage { background: transparent !important; }' });
const dir = 'unity/Assets/Resources/Icons/hero';
mkdirSync(dir, { recursive: true });
const kinds = ['heat', 'cool', 'shield', 'draw', 'energy', 'sturdy', 'repair', 'stability', 'walls', 'guns', 'plant', 'star'];
for (const [kind, atk] of [...kinds.map((k) => [k, false]), ['guns', true]]) {
  await page.evaluate(([k, a]) => window.heroMark(k, a), [kind, atk]);
  const el = await page.$('#stage > div');
  writeFileSync(`${dir}/${atk ? 'attack' : kind}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
}
console.log(`${kinds.length + 1} marks`);
await browser.close();
await server.close();
