/**
 * Where everything stands on the web board, for the Unity table to match: the glossary's board set out (both suns,
 * Heroes, cards, a trap, a hand), laid flat (no tilt), and each part's box as a fraction of the table.
 *
 * With the dev server running (npx vite --port 5179):  node scripts/measure-board.mjs > board-layout.json
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const URL = process.env.URL ?? 'http://127.0.0.1:5179/';
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
p.on('pageerror', (e) => console.error('ERR', e.message));
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.goto(URL);
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
if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
await p.addStyleTag({ content: '.table-view { --board-tilt: 0deg !important; } .table-view > .game { transform: none !important; }' });
await p.waitForTimeout(500);
if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
const out = await p.evaluate(() => {
  const game = document.querySelector('.table-view > .game').getBoundingClientRect();
  const rows = [];
  for (const e of document.querySelectorAll('.table-view *')) {
    const r = e.getBoundingClientRect();
    if (r.width < 4 || !e.className || typeof e.className !== 'string') continue;
    rows.push({ cls: e.className.slice(0, 80), tag: e.tagName, text: (e.childElementCount ? '' : e.textContent).trim().slice(0, 30), x: +((r.left + r.width / 2 - game.left) / game.width).toFixed(4), y: +((r.top + r.height / 2 - game.top) / game.width).toFixed(4), w: +(r.width / game.width).toFixed(4), h: +(r.height / game.width).toFixed(4) });
  }
  return { game: { top: game.top, left: game.left, w: game.width, h: game.height, aspect: game.height / game.width }, view: { w: innerWidth, h: innerHeight }, rows };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
