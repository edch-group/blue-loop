/**
 * Bakes the web game's sound for the Unity game (Assets/Resources/Sound): every effect the game makes (each a method
 * of src/ui/sound.ts's board, synthesised with Web Audio), rendered offline in Chromium, and one seamless pass of each
 * score, encoded as Ogg Vorbis.
 */
import { mkdirSync, writeFileSync, globSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Sound';
const tmp = 'node_modules/.cache/bake-sound';
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

// Each effect: its name here, the board's method, its arguments, and how long to let it ring.
const effects = [
  ['hover', 'hover', [], 1], ['click', 'click', [], 1], ['error', 'error', [], 2], ['blocked', 'blocked', [], 2],
  ['draw', 'draw', [], 2.5], ['shuffle', 'shuffle', [], 2.5], ['play', 'play', [], 3.5], ['hand-lift', 'handLift', [], 2],
  ['rustle', 'rustle', [], 2], ['hero', 'hero', [], 5], ['shield', 'shield', [], 4], ['launch', 'launch', [], 4],
  ['impact-hot', 'impact', [true], 4], ['impact-cold', 'impact', [false], 4], ['thermo', 'thermo', [], 3],
  ['block', 'block', [], 3], ['swing', 'swing', [], 2.5], ['crack', 'crack', [], 3], ['turn', 'turn', [], 4],
  ['end-turn', 'endTurn', [], 4], ['supernova', 'supernova', [], 9], ['ignite', 'ignite', [], 4], ['heat-wave', 'heatWave', [], 5],
  ['flare', 'flare', [], 5], ['whoosh', 'whoosh', [0, true], 3], ['whoosh-keep', 'whoosh', [0, false], 3],
  ['buy', 'buy', [], 3], ['warp', 'warp', [], 5], ['repair', 'repair', [], 3], ['upgrade', 'upgrade', [], 4],
  ['objective', 'objective', [], 4], ['cache-open', 'cacheOpen', [], 4], ['level-up', 'levelUp', [], 5],
  ['earthquake', 'earthquake', [], 6], ['link-confirm', 'linkConfirm', [], 3], ['link-extend', 'linkExtend', [], 2],
  ['link-retract', 'linkRetract', [], 2], ['boom-tick', 'boomTick', [], 2],
  ...[1, 2, 3, 4, 5].flatMap((n) => [[`hurt-${n}`, 'hurt', [n], 4], [`strike-${n}`, 'strike', [n], 4], [`clash-${n}`, 'clash', [n], 4]]),
  ...[0, 1, 2, 3].map((n) => [`charge-${n}`, 'charge', [n], 3]),
  ...[0, 1, 2, 3, 4, 5].map((n) => [`loot-${n}`, 'lootChime', [n], 3]),
];
// Each score: one whole pass of its form, in seconds (as src/ui/sound.ts's REVERSE_LOOP).
const scores = [['ambient', 120], ['battle', 3 * 4 * 4 * 8 * (60 / 80 / 2)], ['voyage', 4 * 4 * 4 * 6 * 0.42], ['boss', 32 * 8 * (60 / 88 / 2)]];

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page:', e.message));
await page.goto('http://localhost:5199/bake/index.html');
await page.waitForFunction(() => window.ready === true);
const encode = (name, b64, quality) => {
  const wavPath = `${tmp}/${name}.wav`;
  writeFileSync(wavPath, Buffer.from(b64, 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', String(quality), `${out}/${name}.ogg`]);
  rmSync(wavPath);
};
// (VOICES_ONLY=1: just the heroes' lines, leaving the effects and scores as they are.)
const only = !!process.env.VOICES_ONLY;
for (const [name, method, args, seconds] of only ? [] : effects) {
  try {
    encode(name, await page.evaluate(([m, a, s]) => window.bakeEffect(m, a, s), [method, args, seconds]), 5);
  } catch (e) {
    console.error(`${name}: ${e.message}`);
  }
}
for (const [scene, loop] of only ? [] : scores) encode(`music-${scene}`, await page.evaluate(([s, l]) => window.bakeScore(s, l), [scene, loop]), 4);
// The heroes' lines (voice.ts), and those recorded (src/assets/voice/<card id>-<line>.mp3).
writeFileSync('unity/Assets/Resources/Engine/voices.json', JSON.stringify(await page.evaluate(() => window.heroLines())));
mkdirSync(`${out}/Voice`, { recursive: true });
for (const f of globSync('src/assets/voice/*.mp3')) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-c:a', 'libvorbis', '-q:a', '5', `${out}/Voice/${f.replace(/^.*\/|\.mp3$/g, '')}.ogg`]);
}
console.log(`${effects.length} effects, ${scores.length} scores and the heroes' lines`);
await browser.close();
await server.close();
