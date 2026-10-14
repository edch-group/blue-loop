/**
 * The procedural pictures (src/ui/cardart.ts) of every card without a painting, as HTML pages for Chromium to
 * screenshot into the Unity game's card art: see scripts/unity-art.py. Run with vite-node (it reads the paintings
 * through Vite's asset imports): npx vite-node scripts/unity-art-scenes.ts <dir>
 */
import { writeFileSync } from 'node:fs';
import { cardDef, registeredCardDefs } from '../src/engine/cards';
import { cardScene, renderedArt } from '../src/ui/cardart';

const dir = process.argv[2];
const ids = new Set(registeredCardDefs().map((d) => d.id));
for (const id of ['human_captain', 'companion_lancer', 'companion_engineer', 'companion_defector', 'companion_shade', 'companion_seer']) ids.add(id);
let n = 0;
for (const id of ids) {
  const d = cardDef(id);
  if (renderedArt(d.artOf ?? id)) continue;
  const svg = cardScene(d).replace('<svg class="art"', '<svg width="320" height="200"');
  writeFileSync(`${dir}/${id}.html`, `<html><body style="margin:0;background:#000">${svg}</body></html>`);
  n++;
}
console.log(n, 'scenes');
