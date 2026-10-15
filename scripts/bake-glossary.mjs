/**
 * Bakes the glossary for the Unity game, which sets it out itself as the web does (GlossaryView.cs): its sections'
 * words as data (glossary.ts glossarySections, read back from the page through bake/bake.ts glossary) to
 * Resources/Glossary/glossary.json; its annotated pictures (src/assets/glossary, pictures on the web too) beside it;
 * and each keyword's mark in its words, in white for the game to tint, to Resources/Icons/glossary/.
 *
 * Usage: node scripts/bake-glossary.mjs (after changing the glossary, the rules it quotes, or its pictures).
 */
import { copyFileSync, globSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 800, height: 1000 } });
page.on('pageerror', (e) => console.error('ERR', e.message));
await page.goto('http://localhost:5197/bake/index.html');
await page.waitForFunction(() => window.ready === true);
await page.addStyleTag({ content: 'html, body, #stage { background: transparent !important; }' });
await page.evaluate(() => document.fonts.ready);
const { sections, figures, icons } = await page.evaluate(() => window.glossary());

const out = 'unity/Assets/Resources/Glossary';
mkdirSync(out, { recursive: true });
// (Anything there before, the pages once baked whole as pictures among it, gone.)
for (const f of readdirSync(out)) rmSync(`${out}/${f}`);
writeFileSync(`${out}/glossary.json`, JSON.stringify({ sections, figures }));
for (const name of Object.keys(figures)) copyFileSync(`src/assets/glossary/${name}.jpg`, `${out}/${name}.jpg`);

const dir = 'unity/Assets/Resources/Icons/glossary';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (const [name, svg] of Object.entries(icons)) {
  await page.evaluate(([svg]) => window.mark(svg, '#ffffff', 24), [svg]);
  const el = await page.$('#mark');
  writeFileSync(`${dir}/${name}.png`, await el.screenshot({ type: 'png', omitBackground: true }));
}
console.log(`${sections.length} sections (${sections.map((s) => s.id).join(', ')}), ${Object.keys(figures).length} pictures, ${Object.keys(icons).length} marks (${Object.keys(icons).join(', ')})`);
await browser.close();
await server.close();
