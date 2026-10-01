import { BALANCE, MAX_UPGRADES, planetAt, type CoreAction, type Planet } from '../engine';
import { upgradeScene } from './cardart';

/**
 * Procedural art: placeholders until commissioned artwork arrives. Swap any
 * of these functions for <img> tags without touching game logic.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Sun tint by temperature, deliberately muted so it sits inside the white
 * theme: pale ice (cold) → pearl (0) → soft ember (near supernova).
 */
export function heatTint(heat: number, threshold: number, alpha = 1): string {
  if (heat <= 0) {
    const t = Math.min(1, heat / BALANCE.minHeat);
    return `hsl(205 ${lerp(10, 38, t)}% ${lerp(97, 86, t)}% / ${alpha})`;
  }
  const t = Math.min(1, heat / threshold);
  return `hsl(${lerp(35, 10, t)} ${lerp(15, 55, t)}% ${lerp(96, 80, t)}% / ${alpha})`;
}

/** A player's sun: a pearl orb with a thin ring showing how close it is to supernova. */
export function sunOrb(opts: { heat: number; threshold: number; size: number; dead?: boolean; label?: string }): string {
  const { heat, threshold, size, dead } = opts;
  const pct = Math.max(0, Math.min(1, (heat - BALANCE.minHeat) / (threshold - BALANCE.minHeat))) * 100;
  const danger = heat > 0 && heat >= threshold - 3;
  return `
    <div class="orb ${dead ? 'orb-dead' : ''} ${danger ? 'orb-danger' : ''}" style="--size:${size}px;--tint:${heatTint(heat, threshold)};--glow:${heatTint(heat, threshold, 0.9)};--pct:${pct}%">
      <div class="orb-ring"></div>
      <div class="orb-core"></div>
      <div class="orb-label">${dead ? '✸' : (opts.label ?? heat)}</div>
    </div>`;
}

/**
 * A player's vitals, large on the board: their sun (its heat, out of max
 * health, in the middle, with a heat arc round it) and their shields as a
 * ring wrapped round the sun, with the shield count on the ring. The sun burns
 * whiter-gold, then orange, then red as it nears supernova; it frosts blue below 0.
 */
/** The three planets of an orbit: what each looks like and does. */
const PLANET_LOOK: Record<Planet, { name: string; text: string }> = {
  dead: { name: 'dead', text: 'The dead planet: nothing today.' },
  abundant: { name: 'abundant', text: 'The abundant planet: draw an extra card each day.' },
  industrial: { name: 'industrial', text: 'The industrial planet: play an extra card each day.' },
};

/**
 * The rings round a sun lie flat on the board, as true circles (the board's
 * own perspective tips them into ellipses): the orbit, where its planets
 * travel, and inside it the shield and heat tracks. Units are percent of the
 * sun gauge's size, centred on its middle.
 */
const ORBIT_R = 56;
const SHIELD_R = 47;
const HEAT_R = 40;

/** A circle as a path starting at its left end and running round the near (lower) side first. */
function ringPath(r: number): string {
  return `M${50 - r} 50 A${r} ${r} 0 1 0 ${50 + r} 50 A${r} ${r} 0 1 0 ${50 - r} 50`;
}

function ringPoint(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
}

/** The tracks (orbit, shields, heat), flat on the board (the orbit's notches and trail are drawn with the planets, in sun3d.ts). */
function ringTracks(heatArc: number, shieldArc: number, orbit: number | undefined): string {
  const track = (r: number, cls: string, fill?: number) =>
    `<path class="${cls}-track" d="${ringPath(r)}" pathLength="100"/>` + (fill ? `<path class="${cls}-arc" d="${ringPath(r)}" pathLength="100" stroke-dasharray="${(fill * 100).toFixed(1)} 100"/>` : '');
  return `
    <svg class="vit-tracks" viewBox="0 0 100 100" aria-hidden="true">
      ${orbit !== undefined ? `<path class="vit-orbit-track" d="${ringPath(ORBIT_R)}"/>` : ''}
      ${track(SHIELD_R, 'vit-shield', shieldArc)}
      ${track(HEAT_R, 'vit-heat', heatArc)}
    </svg>`;
}

/**
 * A sun's orbit: its three planets on the orbit ring. The planet facing the
 * sun today is at the front; the others wait their day behind and to
 * the sides (one step of the orbit is 40°, clockwise).
 */
function orbitPlanets(orbit: number): string {
  const order: Planet[] = ['dead', 'abundant', 'industrial'];
  const facing = planetAt(orbit);
  const planets = order
    .map((pl, i) => {
      const deg = 90 - (i * 3 + 1 - orbit) * 40;
      const [x, y] = ringPoint(ORBIT_R, deg);
      return `<i class="vit-planet vp-${pl} ${pl === facing ? 'vp-facing' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" title="${PLANET_LOOK[pl].text}"></i>`;
    })
    .join('');
  return planets;
}

/** The tag naming the planet facing the sun, and its days left there. */
function planetTag(orbit: number): string {
  const facing = planetAt(orbit);
  const left = BALANCE.orbitTurns - (((orbit % BALANCE.orbitTurns) + BALANCE.orbitTurns) % BALANCE.orbitTurns);
  return `<div class="vit-planet-tag vt-${facing}" title="${PLANET_LOOK[facing].text} ${left} more day${left === 1 ? '' : 's'} before the next planet comes round.">${PLANET_LOOK[facing].name} · ${left}</div>`;
}

export function vitals(opts: { heat: number; threshold: number; shields: number; dead?: boolean; id?: string; orbit?: number }): string {
  const { heat, threshold, shields, dead } = opts;
  const t = Math.max(0, Math.min(1, heat / threshold));
  const cold = heat < 0 ? Math.min(1, heat / BALANCE.minHeat) : 0;
  // Track colours follow the sun: pale gold at 0 → amber → deep red at supernova; icy blue when cold.
  const hue = cold ? 205 : lerp(46, 4, t);
  const sat = cold ? lerp(40, 70, cold) : lerp(90, 88, t);
  const core = `hsl(${hue} ${sat}% ${cold ? lerp(90, 80, cold) : lerp(78, 58, t)}%)`;
  const rim = `hsl(${hue} ${sat}% ${cold ? lerp(80, 62, cold) : lerp(60, 42, t)}%)`;
  const heatArc = cold ? cold : t;
  const shieldArc = Math.min(1, shields / BALANCE.maxKeptShields);
  const danger = heat > 0 && heat >= threshold - 4;
  const idAttr = (k: string) => (opts.id ? `data-${k}-of="${opts.id}"` : '');
  const orbit = dead ? undefined : opts.orbit;
  let seed = 0;
  for (const ch of opts.id ?? '') seed = (seed * 31 + ch.charCodeAt(0)) % 997;
  return `
    <div class="vit ${dead ? 'vit-dead' : ''} ${danger ? 'vit-danger' : ''} ${shields > 0 ? 'vit-shielded' : ''} ${cold ? 'vit-cold' : ''}" style="--core:${core};--rim:${rim}">
      <canvas class="vit-sun sun3d" data-t="${t.toFixed(3)}" data-cold="${cold.toFixed(3)}" data-danger="${danger ? 1 : 0}" data-dead="${dead ? 1 : 0}" data-seed="${(seed / 997) * 6.28}" aria-hidden="true"></canvas>
      ${ringTracks(heatArc, shieldArc, orbit)}
      <canvas class="vit-dome" data-t="${t.toFixed(3)}" data-cold="${cold.toFixed(3)}" data-dead="${dead ? 1 : 0}" data-seed="${((seed / 997) * 6.28).toFixed(3)}" data-orbit="${orbit ?? ''}" data-pid="${opts.id ?? ''}" aria-hidden="true"></canvas>
      ${orbit !== undefined ? orbitPlanets(orbit) : ''}
      <div class="vit-heat" title="Heat ${heat} of ${threshold}: at ${threshold} the sun goes supernova">${dead ? '✸' : `<b ${idAttr('heat')}>${heat}</b><small>/${threshold}</small>`}</div>
      <div class="vit-under">${orbit !== undefined ? planetTag(orbit) : ''}<div class="vit-shields" title="Shields: they absorb enemy heat, and fade at your dawn"><i>⛨</i><b ${idAttr('shields')}>${shields}</b></div></div>
    </div>`;
}

/** Soft petal mandala behind the play area (the "blue loop" motif). */
export function petalBackdrop(): string {
  const petals = Array.from({ length: 12 }, (_, i) => `<ellipse cx="500" cy="170" rx="95" ry="330" transform="rotate(${i * 30} 500 170)" />`).join('');
  const inner = Array.from({ length: 18 }, (_, i) => {
    const r = i * 20 + 10;
    return `<path d="M500 170 L526 -30 L500 -90 L474 -30 Z" transform="rotate(${r} 500 170)" />`;
  }).join('');
  return `
    <svg class="petals" viewBox="0 -300 1000 900" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <radialGradient id="glow" cx="50%" cy="0%" r="70%">
          <stop offset="0%" stop-color="#fff" stop-opacity="1" />
          <stop offset="40%" stop-color="#fbfaf6" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#fbfaf6" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="heat-core">
          <stop offset="0%" class="heat-stop" stop-opacity="0.75" />
          <stop offset="45%" class="heat-stop" stop-opacity="0.3" />
          <stop offset="100%" class="heat-stop" stop-opacity="0" />
        </radialGradient>
      </defs>
      <g class="petal-outer">${petals}</g>
      <g class="petal-inner">${inner}</g>
      <circle cx="500" cy="170" r="520" fill="url(#glow)" />
      <circle class="heat-core" cx="500" cy="170" r="300" fill="url(#heat-core)" />
    </svg>`;
}

const ACTION_META: Record<CoreAction, { label: string; art: string }> = {
  solarFlare: { label: 'solar flare', art: 'art-flare' },
  thermosiphon: { label: 'thermosiphon', art: 'art-thermo' },
  coolingChamber: { label: 'cooling chamber', art: 'art-chamber' },
};

/** What an upgrade's number means, for each core action. */
const UPGRADE_POWER: Record<CoreAction, { icon: string; title: string }> = {
  solarFlare: { icon: '▲', title: 'Extra heat on every attack card effect' },
  thermosiphon: { icon: '▼', title: 'Extra cooling on every cooling effect' },
  coolingChamber: { icon: '♥', title: 'Max health (supernova threshold)' },
};

/**
 * A core upgrade tile. Upgrade slots are frosted shapes that light up when
 * filled: Solar Flare has three small squares, Thermosiphon one large
 * square, Cooling Chamber three vertical bars.
 */
export function actionTile(opts: {
  action: CoreAction;
  upgrades: number;
  /** The upgrade's effect: bonus heat, bonus cooling, or max health. */
  power: string;
  enabled: boolean;
  compact?: boolean;
  actAttr?: string;
}): string {
  const { action, upgrades, power, enabled } = opts;
  const meta = ACTION_META[action];
  const max = MAX_UPGRADES[action];
  const slots = Array.from({ length: max }, (_, i) => `<i class="slot slot-${i} ${i < upgrades ? 'filled' : ''}"></i>`).join('');
  const attr = opts.actAttr ?? (enabled ? `data-act="${action}"` : 'disabled');
  const p = UPGRADE_POWER[action];
  return `
    <button class="tile tile-${action} ${opts.compact ? 'tile-compact' : ''}" ${attr}>
      <div class="tile-art ${meta.art}">${upgradeScene(action)}</div>
      <div class="slots slots-${action}">${slots}</div>
      <div class="tile-chips"><span class="chip-glass" title="${p.title}">${p.icon}${power}</span></div>
      <div class="pill">${meta.label}</div>
    </button>`;
}

/**
 * Compact upgrade chip for the dock rail: a small art thumbnail, what the
 * upgrades add, and its upgrade pips. Tapping it explains the upgrade.
 */
export function actionChip(opts: { action: CoreAction; upgrades: number; power: string; /** A rival's chip: tapping it shows that player. */ playerId?: string }): string {
  const { action, upgrades, power } = opts;
  const meta = ACTION_META[action];
  const max = MAX_UPGRADES[action];
  const pips = Array.from({ length: max }, (_, i) => `<i class="${i < upgrades ? 'on' : ''}"></i>`).join('');
  const p = UPGRADE_POWER[action];
  return `
    <button class="action-chip chip-${action} ${upgrades ? 'chip-upgraded' : ''}" ${opts.playerId ? `data-act="view-player" data-arg="${opts.playerId}"` : `data-act="view-upgrade" data-arg="${action}"`} title="${meta.label}: ${p.title.toLowerCase()}">
      <span class="chip-art ${meta.art}">${upgradeScene(action)}</span>
      <span class="chip-body">
        <span class="chip-power">${p.icon}${power}</span>
        <span class="chip-label">${meta.label}</span>
      </span>
      <span class="chip-pips" aria-label="${upgrades} of ${max} upgrades">${pips}</span>
    </button>`;
}

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n: number): string {
  if (n >= 40) return String(n);
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}
