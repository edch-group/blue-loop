"""
Makes a looping track a whole number of 1024-sample blocks long, so the AAC the Unity web build encodes it as needs no
padding after its end. Otherwise each lap of the loop dips to silence for the padding's few samples: a click every time
the track comes round (the campaign map's score, 5,292,000 samples, was padded with 32).

The track is resampled to the next whole number of blocks as one lap of a circle (by its spectrum), so its end still
runs into its start without a seam; the lengthening, at most 1023 samples, is a few parts in a million: unheard.

  python3 -I scripts/loop-align.py <in> <out.ogg> <vorbis quality>
"""
import subprocess
import sys

import numpy as np

src, dst, quality = sys.argv[1], sys.argv[2], sys.argv[3]
probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels,sample_rate', '-of', 'csv=p=0', src], capture_output=True, text=True, check=True).stdout.strip().split(',')
rate, channels = int(probe[0]), int(probe[1])
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'f32le', '-'], capture_output=True, check=True).stdout
x = np.frombuffer(raw, '<f4').reshape(-1, channels).astype(np.float64)
n = len(x)
m = -(-n // 1024) * 1024
if m != n:
    spec = np.fft.rfft(x, axis=0)
    out = np.zeros((m // 2 + 1, channels), complex)
    k = min(len(spec), len(out))
    out[:k] = spec[:k]
    # (The Nyquist bin of the shorter, when it is even, split as the longer's real spectrum expects.)
    if n % 2 == 0 and k == n // 2 + 1:
        out[k - 1] *= 0.5
    x = np.fft.irfft(out, m, axis=0) * (m / n)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(rate), '-ac', str(channels), '-i', '-', '-c:a', 'libvorbis', '-q:a', quality, dst], input=x.astype('<f4').tobytes(), check=True)
print(f'{src}: {n} -> {m} samples')
