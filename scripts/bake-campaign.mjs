/**
 * Bakes the campaign screens' marks for the Unity game (Assets/Resources/Icons), cut from the web game itself: the
 * campaign menu's section discs (each its emblem on its white disc, open and greyed out), as the page draws them.
 */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Icons';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5241, strictPort: true, fs: { strict: false } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// (At the page's 1600 x 1000, drawn twice as fine.)
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1000 } });
await page.goto('http://localhost:5241/');
// (Signed in, so the title page leads to the hub.)
await page.evaluate(() => {
  localStorage.setItem('blue-loop:account', JSON.stringify({ id: 'bake', email: 'bake@local', password: true }));
  const k = 'blue-loop:profile:v1';
  localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), name: 'Commander', signedIn: true }));
});
await page.reload();
// (The title page, then the hub: its first tile the campaign.)
for (let i = 0; i < 20 && !(await page.$('[data-act=campaign-new]')); i++) {
  await page.mouse.click(800, 642);
  await page.waitForTimeout(3000);
}
await page.click('[data-act=campaign-new]');
await page.waitForSelector('.cs-node[data-zone]');
await page.waitForTimeout(1500);
// Only the discs left on nothing: the page, its world and ship, the words and the arc taken away.
await page.addStyleTag({
  content: `html, body, main, .backdrop { background: transparent !important; }
    .backdrop, canvas, .cs-sunrise, .cs-arc, .setup-top, .setup-foot { display: none !important; }
    .cs-base, .cs-nodes { opacity: 1 !important; transition: none !important; }
    .cs-node-text { visibility: hidden !important; }
    .cs-node, .cs-node * { transition: none !important; animation: none !important; }`,
});
/** Fully clear pixels given the disc's own colour, so they never fringe dark when filtered (Python's PIL). */
const clean = (file, rgb) =>
  execFileSync('python3', ['-c', `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
c = tuple(int(v) for v in sys.argv[2].split(','))
px = im.load()
for y in range(im.height):
  for x in range(im.width):
    if px[x, y][3] == 0: px[x, y] = c + (0,)
im.save(sys.argv[1])`, file, rgb.join(',')]);
// (Each disc 42 across in the page's own pixels, its shadow round it: cut 84 across, centred on it.)
const shoot = async (zone, file) => {
  const box = await page.evaluate((z) => {
    const r = document.querySelector(`.cs-node[data-zone="${z}"] .up-node-disc`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  }, zone);
  const half = box.w; // (twice the disc's radius: its shadow too)
  const shot = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: box.x - half, y: box.y - half, width: half * 2, height: half * 2 } });
  writeFileSync(`${out}/${file}.png`, shot);
  clean(`${out}/${file}.png`, [226, 229, 235]);
  return half * 2;
};
let size = 0;
for (const zone of ['captain', 'hangar', 'research']) {
  const name = zone === 'hangar' ? 'ship' : zone === 'research' ? 'stellari' : zone;
  for (const shut of [false, true]) {
    await page.evaluate(([z, s]) => document.querySelector(`.cs-node[data-zone="${z}"]`).classList.toggle('cs-node-shut', s), [zone, shut]);
    await page.waitForTimeout(100);
    size = await shoot(zone, `menu-node-${name}${shut ? '-shut' : ''}`);
  }
}
console.log(`campaign menu discs baked (${size.toFixed(1)} px across at 1600 x 1000)`);
await browser.close();
await server.close();
