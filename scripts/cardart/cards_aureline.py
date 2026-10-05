"""The Aureline cards: the same layouts as in src/ui/cardart.ts, painted with light."""
import numpy as np
from aureline import aureline, mini
import env
from kit import mix, quad, rounded_rect

SCENES = {}


def scene(cid, **opts):
    """Register a card's picture; opts go to the Scene (light_at: where the sky is brightest)."""
    def wrap(fn):
        SCENES[cid] = (fn, opts)
        return fn
    return wrap


def dusk(S, x=80, c='#ff8a4a'):
    """A sun sinking behind the horizon, the sky banded in its last light."""
    S.glow(x, 84, 64, c, 0.45)
    S.glow(x, 84, 30, '#ffd0a0', 0.5)
    S.sun(x, 86, 13, '#ffb070', rays=10)
    S.ground(86, '#120a1a')


def tower(S, pts, c0='#e6ecf5', c1='#4d6fae'):
    """A wall or tower of pale stone, shading down into the dark."""
    ys = [p[1] for p in pts]; y0, y1 = min(ys), max(ys)
    return S.solid(pts, lambda m: mix(c0, c1, np.clip((S_Y() - y0) / max(y1 - y0, 1), 0, 1)[..., None]), bevel=1.0, shine=0.5, edge='#ffffff')


def S_Y():
    from kit import Y
    return Y




@scene('sunspear', light_at=(30, 60), light_r=70)
def _(S):
    S.sun(30, 60, 12, rays=10)
    S.beam(38, 58, 156, 24, 4, fade=False)
    S.planet(150, 90, 10, '#ffb070', '#6a2a2a')
    S.glow(150, 26, 8, '#fff3c4', 0.6)


@scene('dawn_beacon', light_at=(80, 30))
def _(S):
    S.beam(80, 30, 10, 12, 1.4, '#fff3c4')
    S.beam(80, 30, 150, 12, 1.4, '#fff3c4')
    S.ground(74)
    tower(S, [(74, 34), (86, 34), (88, 78), (72, 78)], '#fff3c4', '#5a4a2a')
    S.sun(80, 30, 7, rays=12)


@scene('sunforge', light_at=(80, 48))
def _(S):
    S.ground(78)
    S.solid([(50, 80), (58, 56), (102, 56), (110, 80)], lambda m: mix('#b8a078', '#3a2a18', np.clip((S_Y() - 56) / 24, 0, 1)[..., None]), bevel=1.2, shine=0.5, edge='#ffe0a0')
    S.sun(80, 48, 10, '#ffb070', rays=12)
    S.motes(80, 40, 16, 30, '#ffe0a0')


@scene('sunward_lance', light_at=(140, 30))
def _(S):
    S.sun(140, 30, 12, '#ffe7a8', rays=8)
    S.orbit(140, 30, 60, 26, 14, '#ffffff', 1, 0.5)
    S.planet(96, 54, 8, '#ffd0a0', '#7a4a2a')
    S.beam(10, 90, 132, 34, 3, '#ffe7a8', fade=False)
    S.glow(132, 34, 14, '#ffffff', 0.7)


@scene('sunlit_return', light_at=(80, 34))
def _(S):
    S.sun(80, 34, 14, '#fff3b0', rays=6)
    S.card(80, 70, 0, '#ffd28a', 20)
    arc = [(80 - 42 * np.cos(a), 78 - 42 * np.sin(a) * 0.9) for a in np.linspace(0.18, 1.1, 20)]
    S.plasma(arc, 0.5, '#ffffff', 0.9, flicker=False)
    S.energy([(56, 40), (49, 42), (54, 47)], '#ffffff', 1.0, fill=1.2)
    S.motes(80, 52, 14, 30, '#fff3b0')


@scene('sunflash_aegis', light_at=(80, 52))
def _(S):
    S.glow(80, 52, 40, '#ffd27a', 0.4)
    S.bolt(10, 20, 58, 52, '#fff3c4', 6, 1.6)
    S.dome(84, 88, 50, '#ffe2a8')
    S.hexagon(84, 50, 20, '#ffc46a')


@scene('dawnblade', light_at=(120, 26))
def _(S):
    S.sun(120, 26, 12, '#fff3c4', rays=10)
    blade = [(48, 80), (112, 24), (116, 28), (54, 90)]
    S.solid(blade, mix('#fff6e0', '#ffd98a', 0.4), bevel=0.6, shine=2.0, power=60, edge='#ffffff', emit=0.6)
    S.tube([(36, 92), (49, 83)], 1.1, '#5a3a0e', '#ffe7a8')
    S.tube([(42, 78), (56, 92)], 0.9, '#5a3a0e', '#ffe7a8')
    S.glow(112, 26, 10, '#ffffff', 0.7)


@scene('the_sun_throne', light_at=(80, 35), light_r=70, bright=1.0)
def _(S):
    S.glow(80, 40, 70, '#fff3c4', 0.3)
    S.sun(80, 30, 16, '#ffd98a', rays=14)
    S.gold([(50, 90), (56, 52), (72, 60), (80, 46), (88, 60), (104, 52), (110, 90)], bevel=1.6)
    S.cloth([(64, 90), (66, 66), (94, 66), (96, 90)], '#c0392b', '#5a1010', folds=3, bevel=1.0)


@scene('gilded_lens', light_at=(80, 50))
def _(S):
    S.beam(8, 50, 56, 50, 2, '#ffd98a')
    S.beam(104, 50, 156, 40, 3, '#fff3c4', fade=False)
    S.shield_disc(80, 50, 21, '#ffe7b0')
    ring = [(80 + 24 * np.cos(a), 50 + 24 * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 80)]
    S.tube(ring, 2.0, '#5a3a0e', '#ffe7a8', shine=1.4)


@scene('radiant_hymn', light_at=(80, 22))
def _(S):
    S.sun(80, 22, 7, '#fff3c4', rays=10)
    for i, x in enumerate((40, 80, 120)):
        S.rings(x, 64, 6, 3, 6, '#ffd98a', 0.7)
        S.glow(x, 64, 8, '#ffffff' if i == 1 else '#ffd98a', 0.6)


@scene('solar_aegis', light_at=(80, 30))
def _(S):
    S.sun(80, 30, 9, '#ffd98a', rays=10)
    shield = [(80, 40), (108, 50), (102, 80), (80, 92), (58, 80), (52, 50)]
    S.solid(shield, lambda m: mix('#fff3c4', '#4d6fae', np.clip((S_Y() - 40) / 52, 0, 1)[..., None]), bevel=2.0, shine=1.2, power=40, edge='#ffffff')
    S.tube(shield + [shield[0]], 0.8, '#5a3a0e', '#ffe7a8', shine=1.4)
    S.sun(80, 62, 3, '#ffd98a', rays=8)


@scene('lance_volley', light_at=(40, 40))
def _(S):
    for i, y in enumerate((14, 30, 46)):
        S.beam(6, y + 20, 150, y + 4, 1.8, '#fff3c4' if i == 1 else '#ffd98a')
    S.planet(140, 80, 16, '#e8c98f', '#4d6fae')


@scene('glory_charge', light_at=(150, 34))
def _(S):
    S.ground(88, '#132446')
    S.beam(10, 70, 150, 34, 4, '#fff3c4', fade=False)
    S.sun(150, 34, 8, '#ffffff', rays=8)
    S.motes(60, 70, 20, 40, '#ffd98a', 1.2)


@scene('banner_of_dawn', light_at=(88, 32))
def _(S):
    S.ground(90, '#132446')
    S.tube([(60, 90), (60, 14)], 1.0, '#6a7088', '#dfe6f0', shine=1.2)
    flag = [(60, 16)] + [(60 + t * 56, 16 - 6 * np.sin(t * np.pi) + 2 * t) for t in np.linspace(0, 1, 20)][1:] + [(116, 48)] + [(116 - t * 56, 48 + 6 * np.sin(t * np.pi) - 2 * t) for t in np.linspace(0, 1, 20)][1:]
    S.cloth(flag, '#ffd98a', '#e06030', folds=3, bevel=0.8, grad=(0, 0, 1, 0))
    S.sun(88, 32, 5, '#ffffff', rays=6)


@scene('prism_of_dawn', light_at=(80, 52))
def _(S):
    S.beam(8, 30, 70, 50, 2, '#ffe2a0', fade=False)
    S.beam(90, 52, 156, 30, 2, '#ff9a6a')
    S.beam(90, 56, 156, 76, 2, '#8fd0ff')
    S.beam(90, 54, 156, 53, 2, '#c8ffa0')
    S.crystal(80, 52, 50, 26, 0, '#fff3c4')


@scene('sunfire_volley', light_at=(30, 30))
def _(S):
    S.waves(84, '#8fd0ff', 2, 2, 0.6)
    for y in (44, 58, 72):
        S.beam(36, 34, 154, y, 1.8, '#ffb070')
    S.sun(30, 30, 12, '#ffd98a', rays=10)


@scene('helio_bastion', light_at=(80, 24))
def _(S):
    S.ground(86, '#132446')
    tower(S, [(50, 86), (56, 30), (104, 30), (110, 86)])
    for x in (62, 74, 86, 98):
        S.solid(rounded_rect(x - 2.5, 40, 5, 9, 2.5), '#1a2a48', bevel=0.4, shine=0.2)
        S.glow(x, 44, 3, '#ffd98a', 0.6)
    S.waves(70, '#8fd0ff', 2, 2, 0.5)
    S.sun(80, 24, 8, '#ffd98a', rays=8)


@scene('sunlance_charge', light_at=(48, 50))
def _(S):
    S.rings(140, 50, 6, 3, 8, '#ffd98a', 0.6)
    S.beam(48, 50, 156, 50, 4, '#fff3c4', fade=False)
    S.panel(20, 40, 30, 22, 6)
    S.glow(48, 50, 14, '#ffffff', 0.7)


@scene('rally_banner', light_at=(90, 30))
def _(S):
    S.ground(90, '#132446')
    S.tube([(70, 92), (70, 16)], 1.2, '#7a5214', '#fff3c4', shine=1.4)
    flag = quad((71, 18), (96, 14), (116, 22)) + quad((116, 22), (104, 32), (116, 42)) + quad((116, 42), (96, 36), (71, 40))
    S.cloth(flag, '#ffd98a', '#c0392b', folds=3, bevel=0.8, grad=(0, 0, 1, 0))
    S.sun(92, 29, 3.5, '#fff3c4', rays=6)
    S.glow(70, 16, 8, '#ffffff', 0.7)


@scene('dawn_rampart', light_at=(80, 26))
def _(S):
    S.sun(80, 26, 8, '#ffd98a', rays=10)
    for x in (44, 62, 80, 98, 116):
        tower(S, rounded_rect(x - 7, 48, 14, 40, 2), '#fff3c4', '#4d6fae')
    S.dome(80, 88, 56, '#ffd98a')


@scene('radiant_barrage', light_at=(60, 40))
def _(S):
    S.ground(90, '#132446')
    for x in (20, 44, 68):
        S.beam(x, 90, x + 90, 16, 2, '#fff3c4')
    S.dome(40, 90, 30, '#ffd98a')


@scene('dawnstar_cannon', light_at=(132, 48))
def _(S):
    S.ground(86, '#132446')
    S.panel(36, 52, 56, 24, 5)
    S.panel(78, 44, 50, 12, 4)
    S.beam(128, 50, 158, 30, 3, '#fff3c4')
    S.sun(132, 48, 6, '#ffd98a', rays=8)


@scene('hymn_of_the_sun', light_at=(80, 40), light_r=70, bright=1.0)
def _(S):
    for i, x in enumerate((24, 56, 104, 136)):
        S.beam(x, 92, 80, 42, 1.4 + (i % 2) * 0.6, '#fff3c4')
    S.sun(80, 40, 22, '#ffd98a', rays=16)
    S.motes(80, 60, 20, 70, '#fff3c4', 1.2)


@scene('sunforged_lens', light_at=(46, 46))
def _(S):
    S.sun(46, 46, 12, '#ffd98a', rays=12)
    S.beam(58, 48, 98, 56, 2.2, '#ffe7a8', fade=False)
    S.rings(104, 56, 6, 3, 5, '#ffe7a8', 0.8)


@scene('solstice_choir', light_at=(80, 44))
def _(S):
    S.orbit(80, 44, 52, 16, 0, '#fff3b0', 1.2, 0.8)
    S.sun(80, 44, 16, '#ffd98a', rays=12)
    S.planet(132, 44, 6, '#c8ffd0', '#23584a')
    S.planet(28, 44, 6, '#ffb070', '#5a2a1a')
    for x in (56, 72, 88, 104):
        S.dome(x, 92, 7, '#fff3b0')
    S.motes(80, 70, 14, 30, '#ffffff')


@scene('focusing_array', light_at=(80, 52))
def _(S):
    S.rings(80, 52, 10, 4, 9, '#fff3c4', 0.8)
    for d in (-40, 40):
        S.beam(80 + d * 1.9, 52 + d * 0.3, 80 + d * 0.2, 52, 1.6)
    S.sun(80, 52, 6, rays=8)


