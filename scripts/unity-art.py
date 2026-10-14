#!/usr/bin/env python3
"""Card pictures for the Unity game (Unity can't import .webp): every src/assets/cards/<id>.webp as a 320x200 JPEG in
unity/Assets/Resources/CardArt/<id>.jpg. Run after card art changes."""
import glob, os
from PIL import Image

src = 'src/assets/cards'
out = 'unity/Assets/Resources/CardArt'
os.makedirs(out, exist_ok=True)
n = 0
for path in sorted(glob.glob(f'{src}/*.webp')):
    cid = os.path.splitext(os.path.basename(path))[0]
    Image.open(path).convert('RGB').resize((320, 200), Image.LANCZOS).save(f'{out}/{cid}.jpg', quality=78, optimize=True)
    n += 1
print(n, 'pictures')
