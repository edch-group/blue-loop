"""
The Captain for Unity, baked from his model as Meshy rigged it (the rigged FBX and its texture, kept as a GitHub release:
scripts/meshy/run.sh; what Meshy says of it in unity/ModelSources/captain/meshy-<task>/), with Blender's own Python
module: his figure cut down, his skeleton, how each corner hangs from it, and each of his poses
(unity/ModelSources/captain/poses.json), solved here so the game only has to play them (CaptainFigure.cs).

  unity/Assets/Resources/Models/Captain.bytes       "BLCR": in his own box units as his old figure's (CaptainModels.cs), 40
                                                    tall, his feet at 0, centred on x 20 and y 12, facing +y; each corner's
                                                    place, normal, place in his texture, and the four bones it hangs from
                                                    (with how much of each); his bones as they stand at rest and in each
                                                    pose (where each is in his box, so the game needs no solving)
  unity/Assets/Resources/Models/CaptainColour.jpg   his colour

    pip install bpy pillow numpy       (Blender's module: Python 3.13)
    python3 scripts/bake-captain.py <its folder>           (or: "rebake captain" in scripts/meshy/request.txt)

A pose (poses.json) says where his hips go and where his limbs reach, in metres from where he stands at rest, along
[his left, ahead of him, up]; Blender's IK bends his knees and elbows to get there:
  "hips":  how far his hips move
  "reach": a chain's end (a shin or forearm: the foot's or hand's joint) put at a point, its knee or elbow bent
           toward "toward" (two bones bend: thigh and shin, or upper arm and forearm)
  "aim":   a bone pointed at a point (a foot along the floor, a hand, his head's gaze)
  "turn":  a bone turned in its own axes, degrees [x, y, z] (the spine's x leans him forward)
A point is [left, ahead, up] from his feet at rest, or {"from": a bone, "by": [left, ahead, up]}: from that bone's joint as
he stands once what comes before it is done (hips, turns, reaches, then each aim in turn).
"""
import glob
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'unity', 'ModelSources', 'captain')
OUT = os.path.join(ROOT, 'unity', 'Assets', 'Resources', 'Models')
# How many triangles he keeps (the model has 143k; he is seen close beside his skill tree, and small on the ship).
TRIANGLES = 26000
# His height in his box units, as his old figure's; his texture's size.
HEIGHT = 40
TEXTURE = 2048
# Positions' precision (box units: 1/Q), as the ship's.
Q = 512


def load(folder):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fbx = sorted(glob.glob(os.path.join(folder, '*.fbx')), key=os.path.getsize)[-1]
    bpy.ops.import_scene.fbx(filepath=fbx)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    body = next(o for o in bpy.data.objects if o.type == 'MESH')
    print(f'model ({os.path.basename(fbx)}): {len(body.data.vertices)} corners, {len(body.data.polygons)} faces, {len(arm.data.bones)} bones')
    # (At rest: whatever animation came with it, gone.)
    if arm.animation_data: arm.animation_data.action = None
    from mathutils import Matrix
    for pb in arm.pose.bones: pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()
    return bpy, arm, body


def cut_down(bpy, body):
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    m = body.modifiers.new('cut', 'DECIMATE')
    m.ratio = min(1.0, TRIANGLES / tris)
    # (First, before the skeleton bends it; its weights carried onto what is left.)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
    bpy.ops.object.modifier_apply(modifier=m.name)
    body.data.calc_loop_triangles()
    print(f'cut down to {len(body.data.loop_triangles)} triangles')


def to_box(arm, body):
    """
    Blender's world (metres, he faces -y, z up) to his box: facing +y, scaled to his height, feet at 0; and mirrored, as
    the ship's box is its model's (bake-captain-ship.py), since the scenes mirror it back (the models' axes swap y and z,
    and Unity's are left-handed, and the campaign's scene flips z): his left, +x in Blender, +x in his box.
    """
    w = np.array(body.matrix_world)
    v = np.array([tuple(x.co) for x in body.data.vertices]) @ w[:3, :3].T + w[:3, 3]
    k = HEIGHT / (v[:, 2].max() - v[:, 2].min())
    off = np.array([20 - k * (v[:, 0].max() + v[:, 0].min()) / 2, 12 + k * (v[:, 1].max() + v[:, 1].min()) / 2, -k * v[:, 2].min()])
    turn = np.diag([k, -k, k])
    box = np.eye(4)
    box[:3, :3] = turn
    box[:3, 3] = off
    return box, k


def figure(body, box):
    """Each corner (a vertex split where its texture or normal parts), its bones and weights, and the triangles."""
    me = body.data
    me.calc_loop_triangles()
    w = box @ np.array(body.matrix_world)
    names = [g.name for g in body.vertex_groups]
    corners, index, tris = [], {}, []
    for t in me.loop_triangles:
        tri = []
        for li, vi in zip(t.loops, t.vertices):
            uv = tuple(me.uv_layers.active.data[li].uv)
            n = tuple(me.corner_normals[li].vector) if hasattr(me, 'corner_normals') else tuple(me.loops[li].normal)
            key = (vi, round(uv[0], 5), round(uv[1], 5), round(n[0], 2), round(n[1], 2), round(n[2], 2))
            if key not in index:
                index[key] = len(corners)
                corners.append((vi, uv, n))
            tri.append(index[key])
        tris.append(tri)
    pos = np.array([tuple(me.vertices[vi].co) for vi, _, _ in corners]) @ w[:3, :3].T + w[:3, 3]
    nor = np.array([n for _, _, n in corners]) @ np.linalg.inv(w[:3, :3])
    nor /= np.linalg.norm(nor, axis=1, keepdims=True) + 1e-9
    uv = np.array([uv for _, uv, _ in corners])
    hang = []
    for vi, _, _ in corners:
        gs = sorted(((g.weight, names[g.group]) for g in me.vertices[vi].groups if g.weight > 0), reverse=True)[:4]
        hang.append(gs)
    print(f'{len(corners)} corners, {len(tris)} triangles')
    return pos, nor, uv, np.array(tris, np.int64), hang


def bones_now(arm, box):
    """Each bone's place in his box: its head, and its axes (scaled with him), as a 4x4."""
    w = box @ np.array(arm.matrix_world)
    out = {}
    for pb in arm.pose.bones:
        m = w @ np.array(pb.matrix)
        # (Its axes kept unit length: the box's scale only moves it.)
        m[:3, :3] /= np.linalg.norm(m[:3, :3], axis=0, keepdims=True)
        out[pb.name] = m
    return out


def pose(bpy, arm, spec, name):
    """Put him in a pose (poses.json): his hips moved, limbs reached, bones aimed and turned; Blender solves the rest."""
    from mathutils import Matrix, Vector
    sc = bpy.context.scene
    for pb in arm.pose.bones:
        for c in list(pb.constraints): pb.constraints.remove(c)
        pb.matrix_basis = Matrix()
    for o in [o for o in bpy.data.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o)
    bpy.context.view_layer.update()
    W = arm.matrix_world
    # (Where he stands at rest, in metres: [his left, ahead, up] to Blender's: he faces -y, his left +x.)
    def head(b): return W @ arm.pose.bones[b].head
    # (Or from a joint as he stands so far: {"from": a bone, "by": [left, ahead, up]}.)
    def at(p):
        if isinstance(p, dict): return head(p['from']) + Vector((p['by'][0], -p['by'][1], p['by'][2]))
        return Vector((p[0], -p[1], p[2]))
    def empty(n, p):
        e = bpy.data.objects.new(n, None)
        e.location = p
        sc.collection.objects.link(e)
        return e
    if 'hips' in spec:
        hips = arm.pose.bones['Hips']
        hips.matrix = W.inverted() @ Matrix.Translation(at(spec['hips'])) @ W @ hips.bone.matrix_local
        bpy.context.view_layer.update()
    for bone, r in spec.get('turn', {}).items():
        pb = arm.pose.bones[bone]
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = [math.radians(a) for a in r]
    bpy.context.view_layer.update()
    # (Limbs reached for, then aimed: each against him as he stands once his hips and turns are set.)
    for bone, r in spec.get('reach', {}).items():
        c = arm.pose.bones[bone].constraints.new('IK')
        c.target = empty(bone + ' reach', at(r['to']))
        c.pole_target = empty(bone + ' toward', at(r['toward']))
        c.pole_angle = math.radians(-90)
        c.chain_count = 2
    bpy.context.view_layer.update()
    for bone, p in spec.get('aim', {}).items():
        c = arm.pose.bones[bone].constraints.new('DAMPED_TRACK')
        c.target = empty(bone + ' aim', at(p))
        bpy.context.view_layer.update()
    print(f'pose {name}: ' + ', '.join(f"{b} {tuple(round(x, 2) for x in head(b))}" for b in ('Hips', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand')))


def write(path, pos, nor, uv, tris, hang, bones, parents, rest, poses):
    index = {b: i for i, b in enumerate(bones)}
    with open(path, 'wb') as f:
        f.write(b'BLCR')
        f.write(struct.pack('<iiiiif', 1, len(pos), len(tris), len(bones), len(poses), Q))
        for i in range(len(pos)):
            f.write(struct.pack('<3h', *np.clip(np.round(pos[i] * Q), -32767, 32767).astype(int)))
            f.write(struct.pack('<3b', *np.clip(np.round(nor[i] * 127), -127, 127).astype(int)))
            f.write(struct.pack('<2H', *np.clip(np.round(np.array([uv[i][0], 1 - uv[i][1]]) * 65535), 0, 65535).astype(int)))
            gs = hang[i] + [(0.0, None)] * (4 - len(hang[i]))
            total = sum(w for w, _ in gs) or 1
            ws = [int(round(255 * w / total)) for w, _ in gs]
            ws[0] += 255 - sum(ws)
            f.write(struct.pack('<4B', *[index.get(b, 0) if b else 0 for _, b in gs]))
            f.write(struct.pack('<4B', *ws))
        fmt = '<3I' if len(pos) > 65535 else '<3H'
        for t in tris: f.write(struct.pack(fmt, *t))
        # (A bone: its name, its parent's index (-1 for none), and where it is at rest: a 4x4, each row in turn.)
        for b in bones:
            nb = b.encode()
            f.write(struct.pack('<B', len(nb)) + nb)
            f.write(struct.pack('<h', parents[b]))
            f.write(struct.pack('<16f', *rest[b].reshape(-1)))
        for name, now in poses.items():
            nn = name.encode()
            f.write(struct.pack('<B', len(nn)) + nn)
            for b in bones: f.write(struct.pack('<16f', *now[b].reshape(-1)))


def main():
    # (The model's folder, as scripts/meshy/run.sh downloads it.)
    folder = sys.argv[1]
    bpy, arm, body = load(folder)
    box, k = to_box(arm, body)
    rest = bones_now(arm, box)
    cut_down(bpy, body)
    pos, nor, uv, tris, hang = figure(body, box)
    bones = [b.name for b in arm.data.bones]
    parents = {b.name: bones.index(b.parent.name) if b.parent else -1 for b in arm.data.bones}
    with open(os.path.join(SRC, 'poses.json')) as f: specs = json.load(f)
    poses = {}
    for name, spec in specs.items():
        if name.startswith('_'): continue
        pose(bpy, arm, spec, name)
        poses[name] = bones_now(arm, box)
    os.makedirs(OUT, exist_ok=True)
    write(os.path.join(OUT, 'Captain.bytes'), pos, nor, uv, tris, hang, bones, parents, rest, poses)
    art = max((p for p in glob.glob(os.path.join(folder, '*.png')) if 'metal' not in p and 'rough' not in p and 'normal' not in p), key=os.path.getsize)
    Image.open(art).convert('RGB').resize((TEXTURE, TEXTURE), Image.LANCZOS).save(os.path.join(OUT, 'CaptainColour.jpg'), quality=92)
    print(f'written {os.path.relpath(OUT, ROOT)}: {len(pos)} corners, {len(tris)} triangles, {len(bones)} bones, poses {", ".join(poses)}')


if __name__ == '__main__':
    sys.exit(main())
