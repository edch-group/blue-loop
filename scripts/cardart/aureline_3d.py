"""The Aureline characters, rendered in full 3D (fig3d): each a moment, several of them in battle."""
import numpy as np
import env
from fig3d import World, aureline3d, xelnaru3d, ground3d, rock3d, halo2d, glow_at, flames2d, norm, rot
from kit import mix
from cards_aureline import scene


def aim(key, target, side='right', **kw):
    """Build a figure, then rebuild it with its weapon pointed from its hand at a target (in world space)."""
    o, info = aureline3d(key, **kw)
    d = norm(np.asarray(target, np.float32) - info['hands'][side])
    local = d @ info['R']
    return aureline3d(key, weapon=('lance', side, local), **kw)


@scene('helio_lancer', space=False)
def _(S):
    """A lancer drives her lance into a Xel'Naru warrior's core on a burning plain at dusk."""
    env.sky(S, '#120a18', '#5a2228', '#ff8a4a', horizon=62, sun=(122, 60, 8, '#ff9a50'), clouds=0.8, stars=0.2)
    env.ridges(S, 62, '#1a0e12', layers=3, lit='#ff8a4a', sun_x=122)
    for x in (24, 46, 140):
        S.plasma([(x, 62), (x - 3, 40), (x + 2, 12)], 3.5, '#2a1416', 0.5, core=None)
        S.glow(x, 62, 6, '#ff7a30', 0.6)
    w = World(cam=(0.0, 3.0, -15), target=(0.3, 3.6, 0), fov=0.44)
    xn, xi = xelnaru3d('lancer-foe', at=(3.6, 0, 0.8), yaw=1.1, lean=0.15)
    ln, li = aim('helio_lancer', xi['core'], at=(-3.0, 0, 0), yaw=-1.05, lean=-0.35, head_turn=(0.2, 0.1), wind=(0, 0, 1.0),
                 arms={'right': ((0.9, 3.7, -1.0), (0.35, 3.7, -2.1)), 'left': ((-0.9, 3.4, -0.7), (-0.15, 3.25, -1.2))},
                 garb='armour', iris='#2a6fd0', look=dict(helm='crest', cape='#7a0f1a'))
    w.add(ground3d(0, '#2a2020'), ln, xn, rock3d((7.5, 0.3, 4), 1.4, 2), rock3d((-8, 0.2, 6), 1.8, 3))
    w.light('dir', (0.6, 0.35, 1.0), '#ff9a50', 1.4)
    w.light('dir', (-0.5, 0.6, -0.6), '#6a7aa8', 0.35, shadows=False)
    w.light('dir', (-0.3, 0.3, -1.0), '#ffb070', 0.75)
    w.light('point', li['head'], '#ffe8c0', 6.0, shadows=False)
    w.light('point', xi['core'], '#ffb0c8', 9.0)
    w.light('point', li['blade'], '#fff0c0', 7.0)
    depth, hm = w.render(S, rays=(122, 60, 0.02))
    hc = li['head']
    halo2d(S, w, depth, hm, hc, 1.9 * li['s'], 0.4, -0.3, '#fff3c4', 0.45)
    halo2d(S, w, depth, hm, hc, 2.3 * li['s'], -0.3, 0.5, '#8fd0ff', 0.35)
    glow_at(S, w, xi['core'], depth, hm, 10, '#ffb0c8', 0.7)
    glow_at(S, w, li['blade_tip'], depth, hm, 6, '#fff3c4', 1.0)
    px, py, _ = w.project(li['blade_tip'])
    env.sparks(S, float(px), float(py), 40, 18, '#ffd0e0', up=False)
    S.motes(80, 40, 24, 70, '#ffb070', 0.7)
