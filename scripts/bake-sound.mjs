/**
 * Bakes the web game's sound for the Unity game (Assets/Resources/Sound): every effect the game makes (each a method
 * of src/ui/sound.ts's board, synthesised with Web Audio), rendered offline in Chromium, and one seamless pass of each
 * score, encoded as Ogg Vorbis.
 */
import { mkdirSync, writeFileSync, readFileSync, globSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const exe = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0] ?? process.env.CHROME;
const out = 'unity/Assets/Resources/Sound';
const tmp = 'node_modules/.cache/bake-sound';
mkdirSync(out, { recursive: true });
mkdirSync(`${tmp}/Voice`, { recursive: true });

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
  // (A point on a skill: a step up A minor pentatonic per point already in it, the seventh and on the same as the last.)
  ...[0, 1, 2, 3, 4, 5, 6].map((n) => [`charge-${n}`, 'charge', [n], 3]),
  // (A star under the pointer (sound.ts starHover): a tone of the chord sounding, from E5 (MIDI 76) up two octaves,
  // star-<note>; and its shimmer, the chord's next tone up (or the octave), star-up-<note>, played 40 ms after. The game
  // picks the notes from the chord the score is on, as the web does.)
  ...Array.from({ length: 25 }, (_, i) => [`star-${76 + i}`, 'starTone', [76 + i], 2]),
  ...Array.from({ length: 37 }, (_, i) => [`star-up-${76 + i}`, 'starUp', [76 + i], 2]),
  ...[0, 1, 2, 3, 4, 5].map((n) => [`loot-${n}`, 'lootChime', [n], 3]),
  // (The experience gauge's fill runs min(2.6, 0.7 + ...) seconds (campaign.ts fillXpGauge): baked at each tenth of a
  // second it may run, xp-fill-7 to xp-fill-26, the game playing the nearest.)
  ...Array.from({ length: 20 }, (_, i) => [`xp-fill-${i + 7}`, 'xpFill', [(i + 7) / 10], (i + 7) / 10 + 1.5]),
];
// Each score: one whole pass of its form, in seconds (as src/ui/sound.ts's REVERSE_LOOP).
const scores = [['ambient', 120], ['battle', 3 * 4 * 4 * 8 * (60 / 80 / 2)], ['voyage', 4 * 4 * 4 * 6 * 0.42], ['boss', 32 * 8 * (60 / 88 / 2)]];

const server = await createServer({ server: { port: 5199, strictPort: true, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page:', e.message));
await page.goto('http://localhost:5199/bake/index.html');
await page.waitForFunction(() => window.ready === true);
// (`loops`: a track the game loops, made a whole number of 1024-sample blocks long (scripts/loop-align.py), so the web
// build's AAC pads nothing after its end, which clicked each time round.)
const encode = (name, b64, quality, loops = false) => {
  const wavPath = `${tmp}/${name}.wav`;
  writeFileSync(wavPath, Buffer.from(b64, 'base64'));
  if (loops) execFileSync('python3', ['-I', 'scripts/loop-align.py', wavPath, `${out}/${name}.ogg`, String(quality)]);
  else execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', String(quality), `${out}/${name}.ogg`]);
  rmSync(wavPath);
};
// (VOICES_ONLY=1: just the heroes' lines, leaving the effects and scores as they are; SCORES_ONLY=1: just the scores;
// EFFECTS=<prefix>: just the effects whose names begin so; NO_EFFECTS=1: all but the effects.)
const only = !!process.env.VOICES_ONLY;
const scoresOnly = !!process.env.SCORES_ONLY;
const some = process.env.EFFECTS;
for (const [name, method, args, seconds] of only || scoresOnly || process.env.NO_EFFECTS ? [] : effects.filter(([n]) => !some || n.startsWith(some))) {
  try {
    encode(name, await page.evaluate(([m, a, s]) => window.bakeEffect(m, a, s), [method, args, seconds]), 5);
  } catch (e) {
    console.error(`${name}: ${e.message}`);
  }
}
if (some) {
  console.log(`effects beginning ${some}`);
  await browser.close();
  await server.close();
  process.exit(0);
}
// The boosters' thrust while a ship is under way (sound.ts thrust), as a loop: twenty seconds once settled, a whole
// number of every cycle in it (the noise's two seconds, the wander's 0.35 Hz, the flutter's 6.5, the hum's 43.65 and
// 44.2), so it loops without a seam. The game swells it in and lets it die away as the web's does.
if (!only && !scoresOnly) encode('thrust', await page.evaluate(() => window.bakeLoop('thrust', [true], 6, 20)), 5, true);
// Each score twice: its first pass from silence (the intro, played once) and its pass folded to loop seamlessly after it;
// and that pass backwards (Time Dense Space, sound.ts setReverse: the loop rendered and played back to front). With
// each, the chords it sounds when (Sound/chords.json), for the star chime. (SCORES_ENCODE=a,b: only those scenes'
// forward passes encoded afresh, the rest's chords taken from a render the same as theirs: only the ambient score is
// random.)
const encodeScenes = process.env.SCORES_ENCODE?.split(',');
const chords = {};
for (const [scene, loop] of only ? [] : scores) {
  const fresh = !encodeScenes || encodeScenes.includes(scene);
  const intro = await page.evaluate(([s, l]) => window.bakeScore(s, l, false), [scene, loop]);
  chords[`music-${scene}-intro`] = { loop, at: await page.evaluate(() => window.bakeChords) };
  if (fresh) encode(`music-${scene}-intro`, intro, 4);
  const pass = await page.evaluate(([s, l]) => window.bakeScore(s, l), [scene, loop]);
  chords[`music-${scene}`] = { loop, at: await page.evaluate(() => window.bakeChords) };
  if (fresh) encode(`music-${scene}`, pass, 4, true);
  const wavPath = `${tmp}/reverse.wav`, backPath = `${tmp}/reverse-back.wav`;
  writeFileSync(wavPath, Buffer.from(pass, 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-af', 'areverse', backPath]);
  execFileSync('python3', ['-I', 'scripts/loop-align.py', backPath, `${out}/music-${scene}-reverse.ogg`, '4']);
  rmSync(wavPath);
  rmSync(backPath);
}
if (!only) writeFileSync(`${out}/chords.json`, JSON.stringify(chords));
// (And the scores as the browser build's page plays them, unity/WebMusic: scripts/score-web.py.)
if (!only) execFileSync('python3', ['-I', 'scripts/score-web.py', out, 'unity/WebMusic']);
if (scoresOnly) {
  console.log(`${scores.length} scores`);
  await browser.close();
  await server.close();
  process.exit(0);
}
// The heroes' lines (voice.ts), and those recorded (src/assets/voice/<card id>-<line>.mp3).
writeFileSync('unity/Assets/Resources/Engine/voices.json', JSON.stringify(await page.evaluate(() => window.heroLines())));
// (Each played as the board plays a recording (sound.ts clip): in the hall, through the master, so the game plays it as it is.)
mkdirSync(`${out}/Voice`, { recursive: true });
for (const f of globSync('src/assets/voice/*.mp3')) {
  const url = `data:audio/mpeg;base64,${readFileSync(f).toString('base64')}`;
  encode(`Voice/${f.replace(/^.*\/|\.mp3$/g, '')}`, await page.evaluate((u) => window.bakeVoice(u), url), 5);
}
console.log(`${effects.length} effects, ${scores.length} scores and the heroes' lines`);
await browser.close();
await server.close();
