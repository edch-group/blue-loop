// Turns raw sound effects (sfx-raw/<name>.wav) into the game's files (src/assets/sfx/<name>.mp3): silence trimmed
// from both ends, any per-sound treatment below (e.g. slowed, tape-style, so the pitch drops with it), and one
// loudness for every effect. No reverb: the game adds its own hall when the sound plays.
// Usage: npm run sfx   (needs ffmpeg on the PATH)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';

const src = new URL('../sfx-raw/', import.meta.url).pathname;
const out = new URL('../src/assets/sfx/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

/** Per-sound treatment: `speed` below 1 slows it (and lowers its pitch, as tape would). */
const TREATMENT = {
  'heat-fire': { speed: 0.88 },
};

for (const file of readdirSync(src).filter((f) => /^[a-z0-9-]+\.(wav|mp3|ogg|flac)$/.test(f))) {
  const name = file.replace(/\.\w+$/, '');
  const { speed = 1 } = TREATMENT[name] ?? {};
  const filter = [
    'aresample=48000',
    `asetrate=${Math.round(48000 * speed)}`,
    'aresample=48000',
    'silenceremove=start_periods=1:start_threshold=-55dB',
    'areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse',
    'loudnorm=I=-18:TP=-3',
  ].join(',');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src + file, '-af', filter, '-ar', '48000', '-b:a', '160k', out + name + '.mp3']);
  console.log(`sfx: ${name}.mp3`);
}
