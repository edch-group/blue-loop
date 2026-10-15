/**
 * Bakes each global card's glyph as the battle HUD's field chip draws it (app.ts renderHud .field: glyphs.ts
 * cardGlyph(id, 'global'), 30 x 20 CSS px, with 4 px round it for its strokes) at 3x, to Resources/Icons/glyph/<id>.png.
 * Usage (the dev server on port 5179): node scripts/bake-field-glyphs.mjs unity/Assets/Resources/Icons/glyph
 */
import { chromium } from 'playwright-core';
import { globSync, mkdirSync } from 'node:fs';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 200, height: 100 }, deviceScaleFactor: 3 });
await p.goto('http://localhost:5179/');
await p.waitForTimeout(1500);
const ids = await p.evaluate(async () => {
  const C = await import('/src/engine/cards.ts');
  const G = await import('/src/ui/glyphs.ts');
  const ids = C.CARDS.filter((c) => c.kind === 'global').map((c) => c.id);
  document.body.innerHTML = '';
  document.body.style.background = 'transparent';
  const style = document.createElement('style');
  style.textContent = `.glyph{width:30px;height:20px;overflow:visible;color:var(--g)} .glyph *{fill:none;stroke:var(--g);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round} .glyph .fill{fill:color-mix(in srgb, var(--g) 22%, transparent)} .glyph .dot{fill:var(--g);stroke:none} #h{position:fixed;left:20px;top:20px;width:30px;height:20px;display:block}`;
  document.head.appendChild(style);
  window.__G = G;
  return ids;
});
for (const id of ids) {
  await p.evaluate((id) => { document.body.innerHTML = `<div id="h">${window.__G.cardGlyph(id, 'global')}</div>`; }, id);
  // (Its strokes run a little outside the box: 4 px kept round it.)
  await p.screenshot({ path: `${out}/${id}.png`, omitBackground: true, clip: { x: 16, y: 16, width: 38, height: 28 } });
}
console.log(ids.length, ids.join(' '));
await b.close();
