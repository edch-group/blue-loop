/**
 * The glossary's pictures [direction: screenshots of the board, cards and the UI, with arrows]: a board set out to show
 * everything at once, photographed whole and in parts, with where each part labelled in the glossary stands in each
 * picture (src/ui/glossary-figures.json), so its arrows land on the very thing.
 *
 * With the dev server running (npx vite --port 5179):  node scripts/glossary-shots.mjs
 * Chromium: PLAYWRIGHT_CHROMIUM (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome); Playwright itself:
 * PLAYWRIGHT_MODULE (default the `playwright` package).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
// (Playwright from the project, or wherever PLAYWRIGHT_MODULE points.)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

const URL = process.env.URL ?? 'http://127.0.0.1:5179/';
const OUT = 'src/assets/glossary';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.goto(URL);
// (Every entrance and fade finished: the pictures show the board at rest.)
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

// A board with a bit of everything: both suns, Heroes, armed cards, a Guard, a trap set, shields, a hand.
await act('menu-page', 'tutorial');
await act('lesson-start', 'breach', 4000);
await p.keyboard.press('Escape');
await p.evaluate(() => {
  const app = window.__app;
  const s = app.state;
  app.puzzle = null;
  delete s.challenge;
  let n = 0;
  const card = (defId, slot, health) => ({ uid: `gl${n++}`, defId, slot, health });
  const [me, foe] = s.players;
  me.name = 'You';
  foe.name = 'Your rival';
  me.heat = 7;
  me.shields = 2;
  me.turnsTaken = 3;
  s.round = 3;
  s.turnNumber = 5;
  me.playsLeft = 3;
  me.tableau = [card('ignition_protocol', -1, 5), card('helio_lancer', 1, 2), card('halo_ward', 2, 1), card('aureline_vanguard', 3, 3)];
  me.lightspeed = { uid: 'gl-trap', defId: 'ink_cloud' };
  me.hand = [card('coronal_lance'), card('cryo_vault'), card('sunforge')].map((c) => ({ uid: c.uid, defId: c.defId }));
  me.deck = Array.from({ length: 18 }, (_, i) => ({ uid: `gld${i}`, defId: 'helio_lancer' }));
  me.discard = [{ uid: 'gldis', defId: 'coronal_lance' }];
  foe.heat = 12;
  foe.tableau = [card('war_council', -1, 5), card('p_prism_blade', 1, 2), card('p_bell_sentry', 2, 1), card('shard_reactor', 3, 3)];
  foe.hand = [{ uid: 'glh1', defId: 'helio_lancer' }, { uid: 'glh2', defId: 'helio_lancer' }];
  foe.deck = Array.from({ length: 16 }, (_, i) => ({ uid: `glf${i}`, defId: 'helio_lancer' }));
  app.sheet = null;
  app.render();
});
await p.waitForTimeout(2500);

const figures = {};
/** A picture of `clip` (a selector, or the whole page), and where each of `marks` stands in it (in %). */
async function shoot(name, clipSel, marks, pad = 12) {
  const box = await p.evaluate(
    ([clipSel, marks, pad]) => {
      const r = clipSel ? document.querySelector(clipSel).getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const clip = { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad), width: Math.min(innerWidth, r.width + 2 * pad), height: Math.min(innerHeight, r.height + 2 * pad) };
      const out = [];
      for (const [key, sel, at = 'c'] of marks) {
        const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
        if (!el) continue;
        const e = el.getBoundingClientRect();
        const x = at.includes('l') ? e.left + 4 : at.includes('r') ? e.right - 4 : e.left + e.width / 2;
        const y = at.includes('t') ? e.top + 4 : at.includes('b') ? e.bottom - 4 : e.top + e.height / 2;
        out.push({ key, x: +(((x - clip.x) / clip.width) * 100).toFixed(2), y: +(((y - clip.y) / clip.height) * 100).toFixed(2) });
      }
      return { clip, marks: out };
    },
    [clipSel, marks, pad],
  );
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 84, clip: box.clip, timeout: 120000 });
  figures[name] = { w: Math.round(box.clip.width), h: Math.round(box.clip.height), marks: box.marks };
  console.log(name, box.marks.map((m) => m.key).join(' '));
}

await shoot('board', null, [
  ['rivalSun', '.tableau-rival .vit-sun'],
  ['mySun', '.tableau-mine .vit-sun'],
  ['rivalRow', '.tableau-rival .tableau-row'],
  ['myRow', '.tableau-mine .tableau-row'],
  ['hero', '.tableau-mine [data-card="ignition_protocol"]'],
  ['trap', '.tableau-mine .ls-card'],
  ['hand', '.hand'],
  ['energy', '.plays'],
  ['endDay', '.end-turn'],
  ['phases', '.phase-track'],
  ['piles', '.tableau-mine .tableau-piles'],
], 0);

await shoot('sun', '.tableau-mine .vitals', [
  ['heat', '.tableau-mine .vit-heat'],
  ['shields', '.board-shields-mine'],
  ['planets', '.tableau-mine .vit-planet.vp-abundant'],
  ['planetTag', '.tableau-mine .vit-planet-tag'],
], 60);

await shoot('row', '.tableau-mine .tableau-row', [
  ['slotDef', '.tableau-mine .slot-empty .slot-def'],
  ['guard', '.tableau-mine [data-card="halo_ward"]'],
  ['armed', '.tableau-mine [data-card="helio_lancer"]'],
  ['wall', '.tableau-mine [data-card="aureline_vanguard"]'],
], 10);

// A card, large, as the inspector shows one in play.
await p.evaluate(() => {
  const app = window.__app;
  const c = app.state.players[0].tableau.find((x) => x.defId === 'aureline_vanguard');
  app.sheet = { kind: 'card', defId: c.defId, table: c.uid };
  app.render();
});
await p.waitForTimeout(1500);
await shoot('card', '.inspector .card-big', [
  ['cost', '.inspector .card-big .cost-dots'],
  ['art', '.inspector .card-big .art-wrap', 'c'],
  ['type', '.inspector .card-big .card-type'],
  ['name', '.inspector .card-big .card-name'],
  ['text', '.inspector .card-big .card-text', 'lt'],
  ['rarity', '.inspector .card-big .gem'],
  ['attack', '.inspector .card-big .jewel-atk'],
  ['stability', '.inspector .card-big .jewel-stab'],
  ['defence', '.inspector .card-big .def-n'],
], 24);

writeFileSync('src/ui/glossary-figures.json', JSON.stringify(figures, null, 1) + '\n');
await b.close();
