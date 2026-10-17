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
const server = await createServer({ server: { port: 5195, strictPort: true, watch: null, fs: { strict: false } }, logLevel: 'error' });
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
// A Hero's boons beside it (heroRail, .boon-mark), the same symbols, to Icons/boon/.
mkdirSync('unity/Assets/Resources/Icons/boon', { recursive: true });
for (const kind of kinds) {
  await page.evaluate((k) => window.boonMark(k), kind);
  const el = await page.$('#stage > div');
  writeFileSync(`unity/Assets/Resources/Icons/boon/${kind}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
}
// What a relic's power does over its badge (relicActionMark, .relic-action) to Icons/relic-action/: none for a power
// with no plain mark.
mkdirSync('unity/Assets/Resources/Icons/relic-action', { recursive: true });
for (const kind of kinds.filter((k) => k !== 'star')) {
  await page.evaluate((k) => window.relicAction(k), kind);
  const el = await page.$('#stage > div.cmp-relic');
  writeFileSync(`unity/Assets/Resources/Icons/relic-action/${kind}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
}
// A relic power's button in battle as what it does (relicFace, .cmp-relic.relic-fx: its disc, mark and number) to
// Icons/relic-face/<key>.png, every face a once-a-battle or once-a-day power can have; four times its 40 px.
const facePage = await browser.newPage({ deviceScaleFactor: 4, viewport: { width: 200, height: 200 } });
await facePage.goto('http://localhost:5195/bake/index.html');
await facePage.waitForFunction(() => window.ready === true);
await facePage.addStyleTag({ content: 'html, body, #stage { background: transparent !important; }' });
mkdirSync('unity/Assets/Resources/Icons/relic-face', { recursive: true });
const faces = await facePage.evaluate(() => window.relicFaceKeys());
for (const key of faces) {
  await facePage.evaluate((k) => window.relicFaceOf(k), key);
  await facePage.evaluate(async () => { await document.fonts.ready; });
  const el = await facePage.$('#face');
  writeFileSync(`unity/Assets/Resources/Icons/relic-face/${key}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
}
console.log(`${kinds.length + 1} marks, ${kinds.length} boons, ${kinds.length - 1} relic actions, ${faces.length} relic faces: ${faces.join(' ')}`);
await browser.close();
await server.close();
