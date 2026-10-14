/**
 * Bakes the badges a card in play wears, one picture per value, for the Unity game
 * (Assets/Resources/Badges/<kind>-<n>.png): attack, stability (and its low look), defence and a Guard's defence.
 */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Badges';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 600 } });
await page.goto('http://localhost:5199/bake/index.html');
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html,body,#stage{background:transparent!important} .card::before,.card::after{display:none!important}' });
const shot = async (sel, name) => {
  const el = await page.$(sel);
  if (el) writeFileSync(`${out}/${name}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
};
let n = 0;
for (let v = 0; v <= 30; v++) {
  for (const [opts, suffix] of [[{}, ''], [{ low: true, dim: true }, '-low']]) {
    await page.evaluate(([v, o]) => window.badges(v, 200, o), [v, opts]);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (suffix) {
      await shot('.b-jewels .jewels-br .jewel', `stab-low-${v}`);
      await shot('.b-jewels .jewels-bl .jewel', `atk-dim-${v}`);
    } else {
      await shot('.b-jewels .jewels-bl .jewel', `atk-${v}`);
      await shot('.b-jewels .jewels-br .jewel', `stab-${v}`);
      await shot('.b-def .stat-def', `def-${v}`);
      await shot('.b-guard .stat-def', `guard-${v}`);
    }
    n++;
  }
}
// Where each sits on its card, in card widths from the card's top left (a table card: 1 wide, 1.4 tall).
await page.evaluate(() => window.badges(3, 200, {}));
const place = await page.evaluate(() => {
  const at = (cardSel, sel) => {
    const c = document.querySelector(cardSel).getBoundingClientRect();
    const r = document.querySelector(`${cardSel} ${sel}`).getBoundingClientRect();
    return { x: (r.left - c.left) / c.width, y: (r.top - c.top) / c.width, w: r.width / c.width, h: r.height / c.width };
  };
  return { atk: at('.b-jewels', '.jewels-bl .jewel'), stab: at('.b-jewels', '.jewels-br .jewel'), def: at('.b-def', '.stat-def'), guard: at('.b-guard', '.stat-def') };
});
writeFileSync(`${out}/places.json`, JSON.stringify(place, null, 1));
console.log(`${n} badge sets`, place);
await browser.close();
await server.close();
