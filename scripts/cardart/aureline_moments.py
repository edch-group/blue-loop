"""The Aureline characters, each caught in a moment of their story: on a sun-barque's bridge, leaping from its
prow, enthroned, in the armoury, singing at dawn, guarding a Stellari bloom... Each scene has its own place,
light and framing (close-ups, crowds, figures small against great things), and every figure is its own."""
import numpy as np
from aureline import aureline, mini
from cards_aureline import scene, dusk
from kit import mix, quad, rounded_rect, X, Y
import env


# ---- Heroes ----
@scene('command_directive', light_at=(118, 30), light_r=50)
def _(S):
    """Solarch Veyra on the bridge of her sun-barque, the fleet beyond the great window, the battle-chart lit."""
    S.planet(150, 58, 14, '#e8c98f', '#4d6fae')
    env.barque(S, 120, 30, 34, facing=-1)
    env.barque(S, 142, 44, 16, facing=-1)
    env.barque(S, 98, 20, 11, facing=-1)
    win = [(68, 64), (68, 22)] + quad((68, 22), (112, -6), (156, 22)) + [(156, 64)]
    env.wall(S, [(0, 0), (160, 0), (160, 78), (0, 78)], holes=[win], c0='#e9e3d6', c1='#4a4640')
    env.god_rays(S, 112, 30, '#fff3c4', 0.25, n=6, reach=70)
    env.floor(S, 78, 104, '#2a2622', reflect=0.5)
    env.console(S, 94, 64, 48, 14)
    env.hologram(S, 118, 54, 11, '#9fe0ff')
    aureline(S, 42, 30, 1.25, item='shield', crown=True, halos=3, garb='armour', eye='#2a6fd0', cloak='#ffe7b0', sash='#2f5fb8', look=dict(yaw=0.45, pitch=0.05, free='palm'))


@scene('ignition_protocol', light_at=(130, 80), light_r=60, bright=0.7)
def _(S):
    """Sol-Marshal Aurex leaps from the prow of the charging barque toward the burning world below."""
    S.planet(140, 128, 52, '#e08a5a', '#5a1a14', atmos='#ff8a4a')
    for x, y, r in ((122, 84, 4), (146, 80, 3), (106, 92, 5)):
        env.explosion(S, x, y, r)
    for k in range(4):
        S.beam(150 - k * 9, 78 + k * 3, 112 - k * 12, 30 + k * 8, 0.6, '#ff8a4a', fade=False, a=0.6)
    env.barque(S, -6, 86, 130, facing=1)
    for k in range(9):
        y0 = 22 + k * 4
        S.beam(70, y0, 24 + k * 3, y0 + 6, 0.25, '#fff3c4', a=0.35)
    aureline(S, 84, 34, 1.2, item='lance', crown=True, halos=2, garb='armour', eye='#c0392b', cloak='#ffb070', sash='#c0392b', lean=-1.5,
             look=dict(pose='low', yaw=0.5, pitch=0.15, sway=-1.0, cloak_style='wings'))


@scene('empress_solenne', light_at=(80, 20), light_r=50, bright=1.0)
def _(S):
    """Empress Solenne enthroned beneath the sun window, her court kneeling in its light."""
    S.sun(80, 20, 15, '#ffd98a', rays=12)
    rose = [(80 + 21 * np.cos(a), 20 + 21 * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 48)]
    env.wall(S, [(0, 0), (160, 0), (160, 72), (0, 72)], holes=[rose], c0='#f0e8d8', c1='#5a4a36', panels=False)
    env.god_rays(S, 80, 20, '#fff3c4', 0.5, n=9, reach=110)
    for x, w in ((10, 9), (34, 7), (126, 7), (150, 9)):
        env.column(S, x, 6, 74, w)
    env.floor(S, 74, 80, '#3a2e22', reflect=0.4)
    env.steps(S, 98, 6, 40, 120, rise=3.4, c='#efe4cc', shrink=3.5)
    S.gold([(62, 78), (64, 36), (72, 42), (80, 30), (88, 42), (96, 36), (98, 78)], bevel=1.5)
    aureline(S, 80, 40, 1.15, item='banner', crown=True, halos=3, garb='vestment', eye='#ffb000', cloak='#ffcf80', sash='#c0392b', stature=0.72,
             look=dict(yaw=0.0, pitch=0.12, crown_style='sunburst', mantle=True, pose='rest'))
    for x, y, s in ((22, 82, 0.42), (44, 86, 0.48), (116, 86, 0.48), (138, 82, 0.42)):
        mini(S, x, y, s, cloak='#ffd98a', kneel=True)


# ---- Characters ----
@scene('helio_lancer', light_at=(130, 30), bright=0.8)
def _(S):
    """Close on a lancer at the line, the battle a blur of fire behind: waiting for the dawn charge."""
    S.planet(150, 112, 50, '#e8c98f', '#4d6fae')
    for x, y, r in ((128, 40, 5), (100, 26, 3), (146, 58, 4)):
        env.explosion(S, x, y, r)
    S.beam(160, 20, 100, 60, 1.2, '#ff8a4a', fade=False, a=0.7)
    S.defocus(2.0)
    aureline(S, 56, 46, 3.0, item='lance', garb='armour', halos=2, eye='#2a6fd0', helm='plume',
             look=dict(yaw=0.42, pitch=-0.05, pose='rest', head=1.0, eye_shape='almond', pupil='slit', mark='tears', flares=0, armour='breastplate', pauldrons='round'))


@scene('coronal_chorus', space=False)
def _(S):
    """The Chorus of Dawn on the temple terrace, singing the sun up out of the world's edge."""
    env.sky(S, '#0e1a3a', '#4a5a9a', '#ffc070', horizon=66, sun=(80, 66, 10, '#ffb060'), clouds=0.7, stars=0.5)
    S.sun(80, 68, 10, '#ffc070', rays=10)
    env.ridges(S, 72, '#1a1830', layers=3, lit='#ffb060', sun_x=80)
    env.god_rays(S, 80, 66, '#ffe0a0', 0.45, n=8)
    env.floor(S, 76, 80, '#2a2420', reflect=0.55)
    for x, w in ((6, 12), (154, 12)):
        env.column(S, x, -4, 100, w)
    for x, y, s, raise_ in ((50, 52, 0.55, True), (80, 48, 0.6, False), (110, 52, 0.55, True), (32, 60, 0.7, False), (128, 60, 0.7, False)):
        aureline(S, x, y, s, item='none', halos=1, garb='vestment', sash='#e0a020', back=True, arms='raise' if raise_ else None,
                 look=dict(cloak_style='veil', mantle=True))
    for x in (50, 80, 110):
        S.rings(x, 40, 6, 3, 5, '#fff3c4', 0.25)


@scene('halo_ward', space=False)
def _(S):
    """A Halo Warden kneels over a Stellari bloom found on a dead world, holding her light over it."""
    env.sky(S, '#070a1e', '#1e2a5a', '#7a6a9a', horizon=70, clouds=0.4, stars=0.8)
    S.planet(126, 22, 9, '#c8d0e0', '#3a4058')
    env.ridges(S, 70, '#14162a', layers=3, lit='#9fb0e0', sun_x=126)
    for x, w, b in ((20, 8, True), (36, 6, False), (136, 7, True)):
        env.column(S, x, 30, 82, w, c0='#c8c0b0', c1='#3a3630', broken=b)
    env.ground_plane(S, 80, '#1a1824', lit='#9fb0e0')
    S.dome(98, 82, 24, '#bfe6ff')
    env.stellari(S, 98, 66, 9, tilt=0.5, stem=14)
    aureline(S, 60, 42, 1.0, item='shield', halos=3, eye='#3aa0a0', cloak='#bfe6ff', sash='#3a7ab8', stature=0.62,
             look=dict(yaw=0.55, pitch=0.3, shield_style='disc', pose='low', cloak_style='veil'))
    S.motes(98, 60, 18, 26, '#ffffff', 0.8)


@scene('aureline_war_herald', space=False)
def _(S):
    """The War-Herald raises the banner on the ridge; the host gathers on the plain below, barques overhead."""
    env.sky(S, '#122048', '#5a6aa0', '#ffd090', horizon=64, sun=(130, 58, 8, '#ffc070'), clouds=0.6, stars=0.3)
    for x, y, L in ((96, 14, 18), (124, 22, 12), (70, 24, 9)):
        env.barque(S, x, y, L, facing=-1)
    env.ridges(S, 66, '#1a2038', layers=2, lit='#ffc070', sun_x=130)
    env.ground_plane(S, 74, '#1e1a1a', lit='#ffc070')
    g = np.random.default_rng(7)
    for row in range(3):
        for k in range(10):
            x = 64 + k * 9.5 + row * 4 + g.uniform(-1.5, 1.5)
            mini(S, x, 76 + row * 6, 0.12 + row * 0.04, cloak='#ffc78a', lance=True)
    env.cliff(S, [(0, 100), (0, 62), (14, 56), (36, 58), (54, 66), (62, 100)], '#2a2420')
    aureline(S, 32, 26, 0.95, item='banner', halos=2, eye='#c0392b', cloak='#ffc78a', garb='armour', sash='#2f5fb8',
             look=dict(pose='high', yaw=0.5, flag='swallow', free='palm'))


@scene('aureline_sun_priest', space=False)
def _(S):
    """The Sun-Priest at the top of the altar stair, arms raised to the sun; the faithful kneel below."""
    env.sky(S, '#1a1430', '#6a4a6a', '#ffb070', horizon=60, clouds=0.3, stars=0.3)
    S.sun(80, 28, 20, '#ffd98a', rays=14)
    env.god_rays(S, 80, 28, '#fff0c0', 0.55, n=12, reach=120)
    for x, w in ((24, 10), (136, 10)):
        env.column(S, x, 8, 66, w)
    env.steps(S, 100, 9, 20, 140, rise=3.6, c='#efe2c4', shrink=4.2)
    aureline(S, 80, 50, 0.62, item='none', halos=1, garb='vestment', sash='#c0392b', cloak='#ffe7b0', back=True, arms='raise',
             look=dict(mantle=True))
    for x, y, s in ((30, 90, 0.4), (52, 94, 0.45), (108, 94, 0.45), (130, 90, 0.4), (70, 96, 0.38), (90, 96, 0.38)):
        mini(S, x, y, s, cloak='#ffd98a', kneel=True)


@scene('aurelia_first_light', light_at=(90, 62), light_r=40, bright=0.7, dust=1.4)
def _(S):
    """Aurelia, the first keeper, holding the Infinite Stellari in the first light there ever was."""
    S.glow(88, 64, 50, '#fff6e0', 0.2)
    aureline(S, 70, 30, 1.2, item='none', halos=2, crown=True, eye='#e0a020', cloak='#fff1c8', garb='vestment', sash='#e0a020', arms='offer', hold=(90, 68),
             look=dict(yaw=0.35, pitch=0.4, crown_style='circlet', mantle=False, stole='single'))
    env.stellari(S, 90, 64, 20, tilt=0.55, glow=1.1)
    S.motes(86, 56, 30, 50, '#fffaf0', 1.0)


@scene('aureline_skirmisher', light_at=(130, 30), dust=1.2)
def _(S):
    """A skirmisher in mid-leap across a drifting asteroid field, lance levelled."""
    env.explosion(S, 140, 26, 6)
    for x, y, r, sd in ((128, 70, 12, 1), (26, 24, 7, 2), (150, 92, 9, 3), (104, 16, 4, 4), (60, 12, 3, 5)):
        env.asteroid(S, x, y, r, seed=sd)
    env.asteroid(S, 20, 104, 30, seed=6)
    for k in range(7):
        S.beam(62, 30 + k * 4, 30, 36 + k * 5, 0.2, '#fff3c4', a=0.3)
    aureline(S, 76, 30, 0.9, item='lance', lean=1.5, halos=1, garb='robe', cloak='#ffe0a0',
             look=dict(pose='level', yaw=0.55, sway=-1.0, cloak_style='tatters'))


@scene('lancer_squadron', light_at=(80, 20), bright=0.7)
def _(S):
    """A squadron of lancers in arrowhead, diving on the enemy's world in a blaze of trails."""
    S.planet(80, 160, 80, '#e8c98f', '#3a4a7e', atmos='#ffd09a', light=(0, -1, 0.3))
    S.motes(80, 30, 40, 70, '#ffe0a0', 0.8)
    for x, y, s in ((36, 22, 0.42), (124, 22, 0.42), (56, 32, 0.6), (104, 32, 0.6), (80, 44, 0.85)):
        aureline(S, x, y, s, item='lance', garb='armour', halos=1, look=dict(pose='low', cloak_style='flame'))


@scene('aureline_archon', light_at=(110, 30), bright=0.6)
def _(S):
    """The Archon on the deck of his barque, drawing fire from the ship's captive sun down his staff."""
    env.floor(S, 78, 110, '#3a3a40', reflect=0.35, tiles=True)
    for x in (82, 138):
        S.solid([(x - 4, 80), (x - 2.5, 6), (x + 2.5, 6), (x + 4, 80)], lambda m: mix('#f4efe2', '#4a4e5a', np.clip((Y - 6) / 74, 0, 1)[..., None]), bevel=1.2, shine=1.2, edge='#ffe7a8')
        S.tube([(x, 6), (x, 80)], 0.4, '#7a5214', '#ffe08a', shine=1.0)
    S.sun(110, 34, 14, '#ffd98a', rays=10)
    S.plasma([(98, 40), (84, 30), (70, 24), (60, 16)], 1.2, '#ffb060', 1.0, core='#fff6dc')
    S.plasma([(100, 30), (86, 22), (62, 14)], 0.6, '#ffd98a', 0.7, core='#ffffff')
    aureline(S, 46, 34, 1.15, item='staff', halos=3, crown=True, eye='#c0392b', cloak='#ffcf8a', garb='armour', sash='#8a2be2',
             look=dict(pose='high', staff_top='ring', yaw=0.5, pitch=-0.15))
    env.sparks(S, 62, 16, 20, 12, '#ffe0a0')


@scene('aureline_cantor', space=False)
def _(S):
    """A Cantor sings in the hall of windows; the notes hang in the air and set into a shield."""
    env.sky(S, '#0e1a3a', '#3a5a9a', '#bfe0ff', horizon=70, clouds=0.5, stars=0.5)
    holes = [[(x - 7, 64), (x - 7, 20)] + quad((x - 7, 20), (x, 8), (x + 7, 20)) + [(x + 7, 64)] for x in (22, 58, 94, 130)]
    env.wall(S, [(0, 0), (160, 0), (160, 76), (0, 76)], holes=holes, c0='#e6e2da', c1='#4a4e5a')
    for x in (22, 58, 94, 130):
        env.god_rays(S, x, 16, '#dfeeff', 0.12, n=4, reach=60)
    env.floor(S, 76, 80, '#22262e', reflect=0.5)
    for k in range(3):
        S.rings(70, 34, 8 + k * 9, 1, 0, '#bfe0ff', 0.5 - k * 0.12)
    for x, y, r in ((106, 30, 6), (118, 40, 6), (106, 50, 6), (130, 30, 6), (130, 50, 6), (118, 20, 6), (118, 60, 6)):
        S.hexagon(x, y, r, '#9fd0ff')
    aureline(S, 52, 32, 1.05, item='orb', halos=2, eye='#2a9fd0', cloak='#dff2ff', garb='vestment', sash='#ffd98a',
             look=dict(yaw=0.55, orb_high=True, mark='dots'))


@scene('halo_sentinel', space=False)
def _(S):
    """A Halo Sentinel holds the city gate through the night, braziers burning either side."""
    env.sky(S, '#04081a', '#101a3a', '#2a3a6a', horizon=80, clouds=0.3, stars=1.0)
    env.city(S, 74, 50, 112, scale=0.8, haze_c='#ffd98a')
    for x in (34, 126):
        S.solid([(x - 16, 100), (x - 13, 8), (x + 13, 8), (x + 16, 100)], lambda m: mix('#d8d0c0', '#2a2830', np.clip((Y - 8) / 92, 0, 1)[..., None]), bevel=2.0, shine=0.8, edge='#ffe7a8')
    outer = quad((46, 32), (80, -12), (114, 32)); inner = quad((114, 32), (80, 2), (46, 32))
    S.solid(outer + inner, lambda m: mix('#e8e0cc', '#4a4640', np.clip((Y + 6) / 40, 0, 1)[..., None]), bevel=1.5, shine=0.8, edge='#ffe7a8')
    S.gold([(76, 2), (80, -4), (84, 2), (80, 8)], bevel=0.8)
    for x in (52, 108):
        S.tube([(x, 96), (x, 70)], 0.8, '#3a2a18', '#c8a060', shine=0.6)
        S.sun(x, 66, 3.5, '#ffb050', rays=6)
        env.sparks(S, x, 64, 10, 8, '#ffb050')
    env.ground_plane(S, 92, '#1a1820', lit='#ffb050', rocks=False)
    aureline(S, 80, 40, 1.3, item='shield', halos=2, eye='#2a6fd0', cloak='#c8dcff', garb='armour', sash='#ffd98a', helm='plume',
             look=dict(yaw=-0.1, pitch=0.1, shield_style='kite', pose='low'))


@scene('aureline_quartermaster', light_at=(130, 60))
def _(S):
    """The Quartermaster in the armoury, testing a lance's edge by forge-light among the racks."""
    env.wall(S, [(0, 0), (160, 0), (160, 76), (0, 76)], c0='#cfc6b4', c1='#3a3430')
    for x in range(86, 156, 7):
        S.tube([(x, 70), (x, 22)], 0.45, '#6a6458', '#fbf8f0', shine=0.8)
        S.energy([(x - 1.2, 22), (x, 14), (x + 1.2, 22)], '#ffe7a8', 0.8, fill=0.8, rim=1.2, bevel=0.3)
    S.tube([(84, 24), (158, 24)], 1.0, '#3a2a18', '#a07a4a', shine=0.4)
    S.tube([(84, 66), (158, 66)], 1.0, '#3a2a18', '#a07a4a', shine=0.4)
    env.floor(S, 76, 80, '#2a2420', reflect=0.25)
    S.glow(146, 70, 30, '#ff8a3a', 0.55)
    S.solid(rounded_rect(124, 66, 34, 16, 2), lambda m: mix('#5a4a3a', '#1a1410', np.clip((Y - 66) / 16, 0, 1)[..., None]), bevel=1.0, shine=0.4)
    S.glow(141, 66, 8, '#ffb050', 0.9)
    env.sparks(S, 141, 64, 24, 12, '#ffc060')
    S.solid(rounded_rect(4, 80, 30, 14, 1.5), '#6a5440', bevel=0.8, shine=0.3)
    S.solid(rounded_rect(10, 70, 20, 11, 1.5), '#7a6048', bevel=0.8, shine=0.3)
    aureline(S, 60, 36, 1.1, item='lance', halos=1, cloak='#e9c98f', garb='robe', sash='#2f5fb8',
             look=dict(pose='level', yaw=0.35, pitch=0.25, free='chest', girdle=True))


@scene('aureline_vanguard', space=False)
def _(S):
    """The Vanguard braces behind her shield as the enemy's fire breaks over it."""
    env.sky(S, '#1a0c14', '#6a2a2a', '#ff9a5a', horizon=70, clouds=0.7, stars=0.2)
    env.ridges(S, 70, '#2a1414', layers=2, lit='#ff8a4a', sun_x=150)
    env.ground_plane(S, 80, '#2a1c1a', lit='#ff8a4a')
    for x, y in ((140, 76), (24, 84), (118, 86)):
        env.explosion(S, x, y, 3.5)
    for k, y0 in enumerate((20, 34, 44, 56)):
        S.beam(162, y0, 100, 34 + k * 3, 1.0, '#ff7a3a', fade=False, a=0.9)
    env.sparks(S, 98, 40, 30, 16, '#ffd090', up=False)
    aureline(S, 62, 36, 1.2, item='shield', lean=1.2, halos=1, eye='#c0392b', cloak='#ffcf8a', garb='armour', stature=0.85, helm='visor',
             look=dict(shield_style='kite', pose='high', yaw=0.6, pitch=0.1, sway=-0.8))
    S.glow(100, 38, 14, '#ffd090', 0.6)


@scene('aureline_sunguard', space=False)
def _(S):
    """A Sunguard on the city wall at first light, the great dome of light over the city behind her."""
    env.sky(S, '#0e1a40', '#5a6aa8', '#ffd8a0', horizon=72, sun=(128, 70, 8, '#ffc070'), clouds=0.5, stars=0.3)
    env.city(S, 78, 70, 160, scale=1.0, haze_c='#ffd8a0')
    S.dome(116, 80, 46, '#ffd890')
    wall_pts = [(0, 100), (0, 74), (60, 74), (60, 100)]
    S.solid(wall_pts, lambda m: mix('#e8e0cc', '#3a3430', np.clip((Y - 74) / 26, 0, 1)[..., None]), bevel=1.2, shine=0.6, edge='#ffe7a8')
    for x in range(2, 60, 10):
        S.solid([(x, 74), (x, 69), (x + 6, 69), (x + 6, 74)], '#e8e0cc', bevel=0.6, shine=0.6, edge='#ffe7a8')
    aureline(S, 34, 30, 1.0, item='shield', halos=3, garb='armour', eye='#2a6fd0', cloak='#ffe7b0', facing=-1,
             look=dict(yaw=0.3, shield_style='disc', pose='high'))


@scene('aureline_vesper_knight', space=False)
def _(S):
    """The Vesper Knight rests on the cliff after the battle, watching the sun go down on the field."""
    env.sky(S, '#1a1030', '#6a3a6a', '#ff9a5a', horizon=78, sun=(124, 78, 12, '#ff9a50'), clouds=0.8, stars=0.4)
    S.sun(124, 80, 12, '#ffb070', rays=10)
    env.ridges(S, 82, '#1a1020', layers=3, lit='#ff9a50', sun_x=124)
    for x in (100, 140, 150):
        S.plasma([(x, 82), (x - 4, 60), (x - 2, 40)], 2.2, '#3a2a30', 0.35, core=None)
    env.cliff(S, [(0, 100), (0, 70), (20, 64), (52, 66), (80, 76), (94, 100)], '#1e1418', lit='#ff9a50')
    aureline(S, 52, 42, 1.05, item='lance', cloak='#c06a8a', halos=2, stature=0.62,
             look=dict(pose='rest', yaw=0.55, pitch=0.12, cloak_style='flame', sway=-0.6))
