/**
 * Bakes the badges a card in play wears, one picture per value, for the Unity game
 * (Assets/Resources/Badges/<kind>-<n>.png): attack, stability (and its low look), defence and a Guard's defence.
 * And the defence shields as a small card wears them (<kind>-s-<n>: on a card under about 77 px the shield is at its
 * floor, 20 px (a Guard's 23) and its number at its 8 px floor, larger for the shield than on a big card's).
 * Usage: node scripts/bake-badges.mjs [--small | --extra]  (--small: only the small card's shields; --extra: only the
 * worn and previewed looks, below)
 */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Badges';
mkdirSync(out, { recursive: true });
const small = process.argv.includes('--small');
const port = +(process.env.BAKE_PORT ?? 5199);
const server = await createServer({
  server: { port, strictPort: true, watch: null, hmr: false, fs: { strict: false } },
  ...(process.env.BAKE_CACHE ? { cacheDir: process.env.BAKE_CACHE } : {}),
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 600 } });
await page.goto(`http://localhost:${port}/bake/index.html`);
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html,body,#stage{background:transparent!important} .card::before,.card::after{display:none!important}' });
const shot = async (sel, name) => {
  const el = await page.$(sel);
  if (el) writeFileSync(`${out}/${name}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
};
// --extra: the looks a card in play's badges take beyond these: a worn shield (<def|guard>-dent-<n>), and the numbers
// heat aimed at it would leave, shown hovered (<def|guard>[-dent]-pv-<n>, stab[-low]-pv-<n>); the shields at a small
// card's size too (-s-).
if (process.argv.includes('--extra')) {
  const tinyX = await browser.newPage({ deviceScaleFactor: 6, viewport: { width: 400, height: 300 } });
  await tinyX.goto(`http://localhost:${port}/bake/index.html`);
  await tinyX.waitForFunction(() => window.ready === true);
  await tinyX.addStyleTag({ content: 'html,body,#stage{background:transparent!important} .card::before,.card::after{display:none!important}' });
  for (let v = 0; v <= 30; v++) {
    for (const [opts, suffix] of [[{ dent: true }, '-dent'], [{ pv: true }, '-pv'], [{ dent: true, pv: true }, '-dent-pv'], [{ pv: true, low: true }, '-low-pv']]) {
      for (const [pg, width, s] of [[page, 200, ''], [tinyX, 56, '-s']]) {
        await pg.evaluate(([v, w, o]) => window.badges(v, w, o), [v, width, opts]);
        await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const take = async (sel, name) => {
          const el = await pg.$(sel);
          if (el) writeFileSync(`${out}/${name}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
        };
        if (suffix === '-low-pv' || (suffix === '-pv' && !s)) { if (!s) await take('.b-jewels .jewels-br .jewel', `stab${suffix}-${v}`); }
        if (suffix !== '-low-pv') {
          await take('.b-def .stat-def', `def${suffix}${s}-${v}`);
          await take('.b-guard .stat-def', `guard${suffix}${s}-${v}`);
        }
      }
    }
  }
  await browser.close();
  await server.close();
  process.exit(0);
}
let n = 0;
for (let v = 0; v <= 30 && !small; v++) {
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
// The small card's shields (on a card 56 px wide: both floors reached), taken at 6 pixels to the CSS pixel, as sharp as
// the others (a 54 px shield at 2).
const tiny = await browser.newPage({ deviceScaleFactor: 6, viewport: { width: 400, height: 300 } });
await tiny.goto(`http://localhost:${port}/bake/index.html`);
await tiny.waitForFunction(() => window.ready === true);
await tiny.addStyleTag({ content: 'html,body,#stage{background:transparent!important} .card::before,.card::after{display:none!important}' });
for (let v = 0; v <= 30; v++) {
  await tiny.evaluate((v) => window.badges(v, 56, {}), v);
  await tiny.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (const [sel, kind] of [['.b-def .stat-def', 'def'], ['.b-guard .stat-def', 'guard']]) {
    const el = await tiny.$(sel);
    if (el) writeFileSync(`${out}/${kind}-s-${v}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
  }
}
if (small) {
  await browser.close();
  await server.close();
  process.exit(0);
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
