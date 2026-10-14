#!/usr/bin/env python3
"""Card pictures for the Unity game (Unity can't import .webp or SVG), as 320x200 JPEGs in
unity/Assets/Resources/CardArt/<id>.jpg: every painting (src/assets/cards/<id>.webp), and every card without one drawn
from its procedural scene (src/ui/cardart.ts) by headless Chromium. Run after card art changes."""
import glob, os, subprocess, tempfile
from PIL import Image

src = 'src/assets/cards'
out = 'unity/Assets/Resources/CardArt'
chrome = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome') or ['chromium'])[0]
os.makedirs(out, exist_ok=True)
n = 0
for path in sorted(glob.glob(f'{src}/*.webp')):
    cid = os.path.splitext(os.path.basename(path))[0]
    Image.open(path).convert('RGB').resize((320, 200), Image.LANCZOS).save(f'{out}/{cid}.jpg', quality=78, optimize=True)
    n += 1
print(n, 'paintings')

with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(['npx', 'vite-node', 'scripts/unity-art-scenes.ts', tmp], check=True)
    pages = sorted(glob.glob(f'{tmp}/*.html'))
    for page in pages:
        cid = os.path.splitext(os.path.basename(page))[0]
        shot = f'{tmp}/{cid}.png'
        # (A taller window than the picture: headless Chromium's page is shorter than its window.)
        subprocess.run([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=320,400',
                        f'--screenshot={shot}', f'file://{page}'], capture_output=True, timeout=30)
        Image.open(shot).convert('RGB').crop((0, 0, 320, 200)).save(f'{out}/{cid}.jpg', quality=82, optimize=True)
    print(len(pages), 'scenes')
