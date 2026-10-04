// Turns raw voice takes (voice-raw/<card id>-<line>.mp3, e.g. empress_solenne-0.mp3 for that hero's first line in
// src/ui/voice.ts) into the game's files (src/assets/voice/), all with the same treatment: silence trimmed from
// both ends, a second voice a fifth below (formants kept, so it reads as another, deeper voice) a touch behind and
// to one side, and one loudness for every line. No reverb: the game adds its own hall when the line plays.
// Usage: npm run voice   (needs ffmpeg built with rubberband on the PATH)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';

const src = new URL('../voice-raw/', import.meta.url).pathname;
const out = new URL('../src/assets/voice/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const filter = [
  // One mono voice, trimmed, with a breath of room at the end.
  '[0:a]aresample=44100,pan=mono|c0=c0,' +
    'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,' +
    'apad=pad_dur=0.25,asplit[a][b]',
  // The second voice: a fifth down, formants kept, 18 ms behind, quieter, leaning right.
  '[b]rubberband=pitch=0.6674:formant=preserved:pitchq=quality,lowpass=f=5000,adelay=18,volume=0.6,pan=stereo|c0=0.8*c0|c1=c0[low]',
  '[a]pan=stereo|c0=c0|c1=0.85*c0[top]',
  '[top][low]amix=inputs=2:normalize=0,loudnorm=I=-18:TP=-1.5[o]',
].join(';');

const takes = readdirSync(src).filter((f) => /^[a-z0-9_]+-\d+\.(mp3|wav)$/.test(f));
for (const take of takes) {
  const name = take.replace(/\.\w+$/, '.mp3');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src + take, '-filter_complex', filter, '-map', '[o]', '-b:a', '128k', out + name]);
  console.log(`voice: ${name}`);
}
if (!takes.length) console.log('voice: no takes in voice-raw/ (name them <card id>-<line>.mp3)');
