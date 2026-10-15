/**
 * Bakes what the web's inspector says beside a card (app.ts explainCard, through bake/bake.ts explain) for the Unity
 * game: each card's rows (its race, traits, a boss's action, its keywords and rules: words and colours as the page
 * draws them) to Resources/Engine/explain.json, and each mark in them, in its colour, to Resources/Icons/kw/.
 * Usage: node scripts/bake-explain.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { globSync } from 'node:fs';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const server = await createServer({ server: { port: 5196, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 800, height: 1000 } });
await page.goto('http://localhost:5196/bake/index.html');
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html, body, #stage { background: transparent !important; }' });
await page.evaluate(() => document.fonts.ready);
const ids = await page.evaluate(() => window.allIds());
const icons = [];
const cards = {};
for (const id of ids) {
  const rows = await page.evaluate((id) => window.explain(id), id);
  cards[id] = rows.map((r) => {
    let icon = -1;
    if (r.icon) {
      const key = r.icon + '|' + r.colour;
      icon = icons.findIndex((x) => x.key === key);
      if (icon < 0) icon = icons.push({ key, svg: r.icon, colour: r.colour }) - 1;
    }
    return { race: r.race, head: r.head, colour: r.colour, icon, body: r.body };
  });
}
const dir = 'unity/Assets/Resources/Icons/kw';
mkdirSync(dir, { recursive: true });
for (let i = 0; i < icons.length; i++) {
  await page.evaluate(([svg, colour]) => window.mark(svg, colour, 24), [icons[i].svg, icons[i].colour]);
  const el = await page.$('#mark');
  writeFileSync(`${dir}/k${i}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
}
writeFileSync('unity/Assets/Resources/Engine/explain.json', JSON.stringify(cards));
console.log(`${Object.keys(cards).length} cards, ${icons.length} marks`);
await browser.close();
await server.close();
