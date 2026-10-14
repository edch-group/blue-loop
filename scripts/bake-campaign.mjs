/**
 * Bakes the campaign screens' marks for the Unity game (Assets/Resources/Icons), cut from the web game itself as its
 * pages draw them: the campaign menu's section discs (each its emblem on its white disc, open and greyed out), and the
 * skill trees' circuit board, and the map's purse (the sun's orb, cool, warm and hot; materials; petals).
 * `node scripts/bake-campaign.mjs [menu] [circuit] [map]`.
 */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Icons';
const parts = process.argv.slice(2).length ? process.argv.slice(2) : ['menu', 'circuit', 'map'];
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5241, strictPort: true, fs: { strict: false } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// (At the page's 1600 x 1000, drawn twice as fine.)
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1000 } });
await page.goto('http://localhost:5241/');
// (Signed in, so the title page leads to the hub; no campaign under way.)
await page.evaluate(() => {
  localStorage.setItem('blue-loop:account', JSON.stringify({ id: 'bake', email: 'bake@local', password: true }));
  const k = 'blue-loop:profile:v1';
  localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), name: 'Commander', signedIn: true }));
  localStorage.removeItem('blue-loop:campaign:v6');
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

/**
 * Fully clear pixels given the colour of the nearest drawn one (spread out from the art's edge), so they never fringe
 * dark when filtered (Python's PIL).
 */
const clean = (file) =>
  execFileSync('python3', ['-c', `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
px = im.load()
w, h = im.size
edge = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0]
seen = set(edge)
while edge:
  nxt = []
  for x, y in edge:
    r, g, b, _ = px[x, y]
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
      q = (x + dx, y + dy)
      if 0 <= q[0] < w and 0 <= q[1] < h and q not in seen and px[q][3] == 0:
        px[q] = (r, g, b, 0)
        seen.add(q)
        nxt.append(q)
  edge = nxt
im.save(sys.argv[1])`, file]);

/** An element cut out on nothing, a margin round it (its shadow), saved; its drawn size returned. */
const cut = async (selector, file, margin = 0) => {
  const box = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
  const shot = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: box.x - margin, y: box.y - margin, width: box.w + margin * 2, height: box.h + margin * 2 } });
  writeFileSync(`${out}/${file}.png`, shot);
  clean(`${out}/${file}.png`);
  return box;
};

if (parts.includes('menu')) {
  // Only the discs left on nothing: the page, its world and ship, the words and the arc taken away.
  const style = await page.addStyleTag({
    content: `html, body, main, .backdrop { background: transparent !important; }
      .backdrop, canvas, .cs-sunrise, .cs-arc, .setup-top, .setup-foot { display: none !important; }
      .cs-base, .cs-nodes { opacity: 1 !important; transition: none !important; }
      .cs-node-text { visibility: hidden !important; }
      .cs-node, .cs-node * { transition: none !important; animation: none !important; }`,
  });
  let size = 0;
  for (const zone of ['captain', 'hangar', 'research']) {
    const name = zone === 'hangar' ? 'ship' : zone === 'research' ? 'stellari' : zone;
    for (const shut of [false, true]) {
      await page.evaluate(([z, s]) => document.querySelector(`.cs-node[data-zone="${z}"]`).classList.toggle('cs-node-shut', s), [zone, shut]);
      await page.waitForTimeout(100);
      // (Each disc 42 across in the page's own pixels, its shadow round it: cut twice as wide, centred on it.)
      const box = await page.evaluate((z) => document.querySelector(`.cs-node[data-zone="${z}"] .up-node-disc`).getBoundingClientRect().width, zone);
      await cut(`.cs-node[data-zone="${zone}"] .up-node-disc`, `menu-node-${name}${shut ? '-shut' : ''}`, box / 2);
      size = box * 2;
    }
  }
  await style.evaluate((s) => s.remove());
  console.log(`campaign menu discs baked (${size.toFixed(1)} px across at 1600 x 1000)`);
}

if (parts.includes('circuit')) {
  // The skill trees' board: the cards' faint circuit traces (glyphs.ts --circuit-dwarf), a tile 340 across (CSS).
  const url = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--circuit-dwarf').trim().replace(/^url\(["']?|["']?\)$/g, ''));
  const tile = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1200, height: 1200 } });
  await tile.setContent(`<html><body style="margin:0;background:transparent"><img id="t" src="${url}" style="display:block;width:${Math.round(340 * 1.45)}px"></body></html>`);
  await tile.evaluate(() => document.getElementById('t').decode());
  writeFileSync(`${out}/circuit-dwarf.png`, await (await tile.$('#t')).screenshot({ type: 'png', omitBackground: true }));
  clean(`${out}/circuit-dwarf.png`);
  await tile.close();
  console.log('circuit tile baked');
}

if (parts.includes('map')) {
  // A run begun: the map, once its opening shot is over and its header is in.
  await page.mouse.click(800, 936);
  await page.waitForSelector('.cmp-purse .cur-materials', { timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.addStyleTag({
    content: `html, body, main, .backdrop, .cmp, .cmp-top { background: transparent !important; }
      .backdrop, canvas, .cmp-stage, .cmp-guide { display: none !important; }
      .cmp-top, .cmp-top * { opacity: 1 !important; transition: none !important; animation: none !important; }`,
  });
  await page.waitForTimeout(300);
  for (const [cls, name] of [['', 'warm'], ['hot', 'hot'], ['cold', 'cold']]) {
    await page.evaluate((c) => (document.querySelector('.cmp-sunstat').className = `cmp-sunstat ${c}`), cls);
    await page.waitForTimeout(100);
    await cut('.cmp-sunstat-orb', `purse-sun-${name}`);
  }
  await cut('.cmp-purse .cur-materials', 'purse-materials');
  const b = await cut('.cmp-purse .cur-petal', 'purse-petal');
  console.log(`map purse baked (petal ${b.w.toFixed(1)} x ${b.h.toFixed(1)})`);
}
await browser.close();
await server.close();
