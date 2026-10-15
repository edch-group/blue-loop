"""
The Captain for Unity, baked from his model as Meshy made and textured it (unity/ModelSources/captain/meshy-<task>/model.glb,
fetched by scripts/meshy/fetch.py; the newest): unrigged, standing as he was made (rigged, he never looked right).

  unity/Assets/Resources/Models/Captain.bytes       his figure, cut down to a size the map can carry (his texture's seams
                                                    kept): in his own box units as his old figure's (CaptainModels.cs), 40
                                                    tall, his feet at 0, centred on x 20 and y 12, facing +y
  unity/Assets/Resources/Models/CaptainColour.jpg   his colour

    pip install numpy pillow trimesh pymeshlab scipy
    python3 scripts/bake-captain.py <its folder>           (or: "rebake captain" in scripts/meshy/request.txt)
"""
import glob
import importlib.util
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('ship', os.path.join(HERE, 'bake-captain-ship.py'))
ship = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ship)

SRC = os.path.join(ship.ROOT, 'unity', 'ModelSources', 'captain')
# How many triangles he keeps (the model has 124k; he is small on the map, and only on the menu is he seen close).
TRIANGLES = 20000
# His height in his box units, as his old figure's.
HEIGHT = 40


def main():
    import trimesh
    # (The model's folder, as scripts/meshy/run.sh downloads it; or the newest kept here.)
    folder = sys.argv[1] if len(sys.argv) > 1 else max(glob.glob(os.path.join(SRC, 'meshy-*')), key=os.path.getmtime)
    scene = trimesh.load(os.path.join(folder, 'model.glb'))
    g = list(scene.geometry.values())[0]
    v, f, uv = np.asarray(g.vertices, float), np.asarray(g.faces, np.int32), np.asarray(g.visual.uv, float)
    print(f'model ({os.path.basename(folder)}): {len(v)} corners, {len(f)} triangles')
    # glTF stands y up and faces +z; his box stands z up and faces +y (turned, not mirrored: x across reversed).
    b = np.stack([-v[:, 0], v[:, 2], v[:, 1]], 1)
    b *= HEIGHT / (b[:, 2].max() - b[:, 2].min())
    b -= [(b[:, 0].max() + b[:, 0].min()) / 2 - 20, (b[:, 1].max() + b[:, 1].min()) / 2 - 12, b[:, 2].min()]
    bv, bf, wuv = ship.cut_down(b, f, uv, TRIANGLES)
    print(f'cut down to {len(bv)} corners, {len(bf)} triangles')
    os.makedirs(ship.OUT, exist_ok=True)
    art = g.visual.material.baseColorTexture.convert('RGB')
    art.resize((ship.TEXTURE, ship.TEXTURE), Image.LANCZOS).save(os.path.join(ship.OUT, 'CaptainColour.jpg'), quality=92)
    ship.write(os.path.join(ship.OUT, 'Captain.bytes'), bv, bf, wuv, np.full(len(bf), 11), np.zeros((len(bf), 3)))
    print('written', os.path.relpath(ship.OUT, ship.ROOT))


if __name__ == '__main__':
    sys.exit(main())
