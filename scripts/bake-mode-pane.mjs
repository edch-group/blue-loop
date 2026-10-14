/**
 * Bakes the game-mode pane's two pictures (glyphs.ts modeCards: quickplay's and online's left pane), each picked and
 * not, for the Unity game (Assets/Resources/Icons/pane-{core,lost}{,-off}.png): the whole card as the web draws it
 * on a 1600 x 1000 page (its painting, its shade and words, the picked one's white edge), at twice the size.
 */
import { writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Icons';
const server = await createServer({ server: { port: 5243, strictPort: true, fs: { strict: false } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1000 } });
await page.goto('http://localhost:5243/');
// (Signed in on this device, so the menu goes straight on to the hub.)
await page.evaluate(() => {
  localStorage.setItem('blue-loop:account', JSON.stringify({ id: 'x', email: 'a@b.c', password: true }));
  const k = 'blue-loop:profile:v1';
  const p = JSON.parse(localStorage.getItem(k) || '{}');
  p.name = 'Commander';
  p.signedIn = true;
  localStorage.setItem(k, JSON.stringify(p));
});
await page.reload();
await page.waitForTimeout(2500);
const go = async (sel) => {
  await page.click(sel, { force: true, timeout: 20000 });
  await page.waitForTimeout(1500);
};
await go('.menu-start');
await go('[data-arg=quickplay]');
const shoot = async (mode, off) => {
  // (The pointer away, so neither card is hovered; the pictures loaded.)
  await page.mouse.move(1500, 900);
  await page.evaluate(() => Promise.all([...document.querySelectorAll('.mode-card img')].map((i) => i.decode().catch(() => undefined))));
  await page.waitForTimeout(900);
  const el = await page.$(`.mode-card[data-arg=${mode}]`);
  writeFileSync(`${out}/pane-${mode}${off ? '-off' : ''}.png`, await el.screenshot({ type: 'png' }));
};
await shoot('core', false);
await shoot('lost', true);
await go('.mode-card[data-arg=lost]');
await shoot('lost', false);
await shoot('core', true);
// (Back to core, as a player would leave it.)
await go('.mode-card[data-arg=core]');
console.log('mode pane baked');
await browser.close();
await server.close();
