"""
The scores as the browser build plays them (Sound.cs; the page's blueLoopMusic, WebGLTemplates/Fill): played by the
page itself with the loop's start and end set, so each comes round on the exact sample whatever the browser's decoder
puts before or after the sound (an AAC's or MP3's priming and padding, which Unity's own playback looped over: a pop
each time round), and only the score sounding is held decoded.

Each score as three files: its first pass from silence (<scene>-intro, `n` samples), its looping pass (<scene>) and
that backwards (<scene>-reverse), each loop with its first second again after its end: the page finds where the
decoder put the sound by the same samples there and at its start (the intro, made the same way, has its sound at the
same place), and loops [that, that + n), the loop coming in on the audio clock as the intro ends.

The looping passes were made a whole number of 1024-sample blocks long (loop-align.py, for Unity's AAC): they are put
back to the intro's length first, the same resampling the other way.

  python3 -I scripts/score-web.py unity/Assets/Resources/Sound unity/WebMusic
"""
import json
import subprocess
import sys

import numpy as np

RATE, MARGIN = 44100, 44100
src, dst = sys.argv[1], sys.argv[2]


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<f4').reshape(-1, 2).astype(np.float64)


def resample(x, n):
    """loop-align.py's resampling (the track as one lap of a circle, by its spectrum), to `n` samples."""
    m = len(x)
    if m == n:
        return x
    spec = np.fft.rfft(x, axis=0)
    out = np.zeros((n // 2 + 1, x.shape[1]), complex)
    k = min(len(spec), len(out))
    out[:k] = spec[:k]
    return np.fft.irfft(out, n, axis=0) * (n / m)


def write(name, x):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '192k', f'{dst}/{name}.mp3'],
                   input=np.clip(x, -1, 1).astype('<f4').tobytes(), check=True)


info = {}
for scene in ['ambient', 'battle', 'voyage', 'boss']:
    intro = load(f'{src}/music-{scene}-intro.ogg')
    n = len(intro)
    loop = resample(load(f'{src}/music-{scene}.ogg'), n)
    write(f'{scene}-intro', intro)
    write(scene, np.vstack([loop, loop[:MARGIN]]))
    info[scene] = n
    back = resample(load(f'{src}/music-{scene}-reverse.ogg'), n)
    write(f'{scene}-reverse', np.vstack([back, back[:MARGIN]]))
    print(f'{scene}: {n} samples')
with open(f'{dst}/music.json', 'w') as f:
    json.dump({'rate': RATE, 'margin': MARGIN, 'lengths': info}, f)
