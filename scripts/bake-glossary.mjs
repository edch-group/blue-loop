/**
 * Bakes the glossary's sections for the Unity game (Assets/Resources/Glossary): each section's page as the web game
 * draws it (its words, its annotated pictures), whole from top to bottom, at twice its size. The Unity page draws the
 * frame and the section tabs itself and shows these in a scrolling pane.
 *
 * With the dev server running (npx vite --port 5179):  node scripts/bake-glossary.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const URL = process.env.URL ?? 'http://127.0.0.1:5179/';
const out = 'unity/Assets/Resources/Glossary';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// Each page as the web lays it out at a screen's size: phones on their sides first, then larger screens (the web
// reflows its pictures and words to the page's width; Unity shows the one laid out nearest its own panel's width).
const SCREENS = [[740, 360], [844, 390], [932, 430], [1024, 600], [1180, 720], [1440, 900]];
const index = [];
for (const [vw, vh] of SCREENS) {
  const p = await (await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw <= 1024 ? 3 : 2 })).newPage();
  p.on('pageerror', (e) => console.error('ERR', e.message));
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(URL);
  await p.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; } .tour { display: none !important; }' });
  await p.waitForTimeout(2500);
  const act = async (a, arg, w = 1200) => {
    await p.evaluate(([a, arg]) => {
      const x = document.createElement('button');
      x.dataset.act = a;
      if (arg != null) x.dataset.arg = arg;
      document.querySelector('[data-act]').parentElement.appendChild(x);
      x.click();
      x.remove();
    }, [a, arg]);
    await p.waitForTimeout(w);
  };
  await act('menu-page', 'hub');
  await act('menu-page', 'glossary', 1500);
  const tabs = await p.evaluate(() => [...document.querySelectorAll('.gl-tab')].map((t) => [t.dataset.arg, t.textContent.trim()]));
  for (const [id, name] of tabs) {
    await act('rules-tab', id, 1200);
    // (The page laid out whole: no scrolling, its own height, on white; laid out at the screen's width.)
    const width = await p.evaluate(() => document.querySelector('.gl-page').getBoundingClientRect().width);
    const height = await p.evaluate(() => document.querySelector('.gl-page').scrollHeight);
    await p.setViewportSize({ width: vw, height: Math.max(vh, height + 400) });
    await p.addStyleTag({ content: '.gl-page { height: auto !important; max-height: none !important; overflow: visible !important; background: #fff !important; border-radius: 0 !important; box-shadow: none !important; border: none !important; } .glossary, .setup-body, .gl-body { height: auto !important; max-height: none !important; overflow: visible !important; }' });
    await p.waitForTimeout(600);
    const el = await p.$('.gl-page');
    const file = vw === 1440 ? id : `${id}@${vw}`;
    writeFileSync(`${out}/${file}.jpg`, await el.screenshot({ type: 'jpeg', quality: 86 }));
    let entry = index.find((x) => x.id === id);
    if (!entry) index.push((entry = { id, name, variants: [] }));
    entry.variants.push({ file, width, height });
    if (vw === 1440) Object.assign(entry, { width, height });
    await p.setViewportSize({ width: vw, height: vh });
  }
  await p.close();
}
writeFileSync(`${out}/index.json`, JSON.stringify(index));
console.log(index.map((x) => `${x.id}: ${x.variants.map((v) => Math.round(v.width)).join(' ')}`).join('\n'));
await b.close();
