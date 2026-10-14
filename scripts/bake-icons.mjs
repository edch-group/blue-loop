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
for (const name of await page.evaluate(() => window.hudIconNames())) {
  await page.evaluate((n) => window.hudIcon(n, 96), name);
  await settle();
  writeFileSync(`${out}/hud-${name}.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
}
// The races' emblems, f1 to f8 (a challenge's tile, a deck's race).
for (let i = 1; i <= 8; i++) {
  await page.evaluate((id) => window.faction(id, 96), `f${i}`);
  await settle();
  writeFileSync(`${out}/faction-f${i}.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
}
// The Stellari's skill tree: each skill's mark (white, tinted in the game), the flower, and the skills' words.
for (const id of await page.evaluate(() => window.upIds())) {
  await page.evaluate((n) => window.upIcon(n, 48), id);
  await settle();
  writeFileSync(`${out}/up-${id}.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
}
// The ship's parts as the hangar shows them (each kind in each rarity), turned a moment in.
for (const kind of ['armour', 'shield', 'weapon', 'booster', 'warp'])
  for (const rarity of ['dwarf', 'stellar', 'anomaly']) {
    await page.evaluate((w) => window.loot(w, 96), `${kind}:${rarity}`);
    await page.waitForTimeout(700);
    writeFileSync(`${out}/part-${kind}-${rarity}.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
  }
await page.evaluate(() => window.currency('petal', 64));
await settle();
writeFileSync(`${out}/petal.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
await page.evaluate(() => window.upFlower(1100));
await settle();
writeFileSync(`${out}/up-flower.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
writeFileSync('unity/Assets/Resources/Engine/upgrades-look.json', JSON.stringify(await page.evaluate(() => window.upLooks()), null, 1));
await page.evaluate(() => window.icon('title', 0));
await settle();
writeFileSync(`${out}/title.png`, await (await page.$('#piece')).screenshot({ type: 'png', omitBackground: true }));
console.log(`${names.length} icons and the title`);
await browser.close();
await server.close();
