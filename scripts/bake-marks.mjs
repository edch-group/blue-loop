/**
 * Bakes what the web game sets on a card beyond its face and badges (app.ts renderCard, through bake/bake.ts marks) for
 * the Unity game, each on its own as the web draws it on a card that wide there (Assets/Resources/Marks/<size>/<name>.png):
 * a card's own shields, its growth, its chill's snowflake, an Overlord part's coming heat, a Fusion card tucked behind it,
 * the boons and guns along its top; the frost of a frozen or chilled card, the ring round a card heat is aimed at and
 * the burn of the Overlord part acting next (its keyframes' box-shadow is !important, so ignored: it holds still); and a Bargain's
 * discount on a card in hand. Where each sits goes in Marks/places.json (in card widths from the card's top left).
 *
 * Sizes as the faces' (bake-cards.mjs): in play on a phone (t-p56, t-p66, t-p78) and a desktop (t-d84, t-d96), in the
 * hand (h-66, h-79, h-100, h-124: the discount only). The web's marks have floors (max()): a small card's are no large
 * one's shrunk. (The boons and guns, sized with the card alone, at t-d96 only: they scale.)
 *
 * Usage: node scripts/bake-marks.mjs
 */
import { mkdirSync, writeFileSync, globSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Marks';
const PHONE = { width: 932, height: 430 };
const DESK = { width: 1366, height: 768 };
const SIZES = [
  ...[56, 66, 78].map((w) => ({ dir: `t-p${w}`, page: PHONE, scale: 3, ctx: 'table', w })),
  ...[84, 96].map((w) => ({ dir: `t-d${w}`, page: DESK, scale: 2, ctx: 'table', w })),
  ...[[66, 3], [79, 3], [100, 2.5], [124, 2]].map(([w, scale]) => ({ dir: `h-${w}`, page: PHONE, scale, ctx: 'hand', w })),
];
const BOONS = ['heat', 'cool', 'shield', 'draw', 'energy', 'sturdy', 'repair', 'stability', 'walls', 'guns', 'plant', 'star'];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const port = +(process.env.BAKE_PORT ?? 5199);
const server = await createServer({
  server: { port, strictPort: true, watch: null, hmr: false, fs: { strict: false } },
  ...(process.env.BAKE_CACHE ? { cacheDir: process.env.BAKE_CACHE } : {}),
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const places = [];
let n = 0;
for (const s of SIZES) {
  const page = await browser.newPage({ deviceScaleFactor: s.scale, viewport: s.page });
  await page.goto(`http://localhost:${port}/bake/index.html`);
  await page.waitForFunction(() => window.ready === true);
  await page.addStyleTag({ content: 'html, body, #stage { background: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  const fused = await page.evaluate(() => window.fusionIds());
  // [name, kind, n, frame, padding (CSS px round the mark: its shadows and glows)]
  const jobs =
    s.ctx === 'hand'
      ? range(1, 6).map((v) => [`discount-${v}`, 'discount', v, undefined, 12])
      : [
          ...range(1, 12).map((v) => [`shields-${v}`, 'shields', v, undefined, 12]),
          ...range(1, 20).map((v) => [`growth-${v}`, 'growth', v, undefined, 6]),
          ...range(1, 6).map((v) => [`chill-${v}`, 'chill', v, undefined, 10]),
          ...range(1, 20).map((v) => [`aimheat-${v}`, 'aimheat', v, undefined, 14]),
          ...(s.dir === "t-d96" ? BOONS.flatMap((k) => range(0, 3).map((v) => [`boon-${k}-${v}`, `boon-${k}`, v, undefined, 8])) : []),
          ...(s.dir === "t-d96" ? range(1, 6).map((v) => [`guns-${v}`, "guns", v, undefined, 8]) : []),
          ...fused.flatMap((id) => [0, 1].map((i) => [`fused-${id}-${i}`, `fused-${id}`, i, undefined, 8])),
          ['frozen', 'card-frozen', 0, undefined, 0],
          ['chilled', 'card-chilled', 0, undefined, 0],
          ['targeted', 'card-targeted', 0, undefined, 26],
          ['intent', 'card-full card-intent', 0, undefined, 40],
        ];
  mkdirSync(`${out}/${s.dir}`, { recursive: true });
  for (const [name, kind, v, frame, pad] of jobs) {
    await page.evaluate(([ctx, w, k, v, f]) => window.marks(ctx, w, k, v, f ?? undefined), [s.ctx, s.w, kind, v, frame ?? null]);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const box = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
      return { card: r(document.querySelector('#stage .card')), m: r(document.getElementById('m')) };
    });
    const clip = { x: box.m.x - pad, y: box.m.y - pad, width: box.m.w + 2 * pad, height: box.m.h + 2 * pad };
    writeFileSync(`${out}/${s.dir}/${name}.png`, await page.screenshot({ type: 'png', omitBackground: true, clip }));
    const c = box.card;
    places.push({ k: `${s.dir}/${name}`, x: (clip.x - c.x) / c.w, y: (clip.y - c.y) / c.w, w: clip.width / c.w, h: clip.height / c.w });
    n++;
  }
  await page.close();
}
writeFileSync(`${out}/places.json`, JSON.stringify({ items: places }, null, 0));
console.log(`${n} marks`);
await browser.close();
await server.close();
