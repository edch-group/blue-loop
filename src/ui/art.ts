import { BALANCE, planetAt, planetsOf, type OrbitPlanet, type Planet } from '../engine';

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
 * ring wrapped round the sun (the count is a badge in the board's middle: shieldBadge in app.ts). The sun burns
 * whiter-gold, then orange, then red as it nears supernova; it frosts blue below 0.
 */
/** The three planets of an orbit: what each looks like and does. */
const PLANET_LOOK: Record<Planet, { name: string; text: string }> = {
  dead: { name: 'dead', text: 'The dead planet: nothing today.' },
  abundant: { name: 'abundant', text: 'The abundant planet: draw an extra card each day.' },
  industrial: { name: 'industrial', text: 'The industrial planet: play an extra card each day.' },
  armed: { name: 'armed', text: `An armed world: your cards have +${BALANCE.armedAttack} attack each day.` },
  shielded: { name: 'shielded', text: `A shielded world: +${BALANCE.shieldedShields} shield at each dawn.` },
};
/** What a sun's own planet does, aboard a ship (the space adventure: no deck to draw from, energy in store). */
const SHIP_PLANET_TEXT: Partial<Record<Planet, string>> = {
  dead: 'nothing',
  abundant: `stabilise ${BALANCE.abundantDraw} at each dawn`,
  industrial: `+${BALANCE.industrialPlays} energy at each dawn`,
};
/** A planet as its tag and tip say: a sun's own by its name, the card game's by its kind. */
function planetInfo(orbit: number, own?: OrbitPlanet[]): { name: string; text: string; kind: Planet } {
  const kind = planetAt(orbit, { planets: own });
  if (!own?.length) return { ...PLANET_LOOK[kind], kind };
  const pl = own[Math.floor((((orbit % (own.length * 3)) + own.length * 3) % (own.length * 3)) / 3)];
  const does = SHIP_PLANET_TEXT[kind] ?? PLANET_LOOK[kind].text.split(': ')[1].replace(/\.$/, '');
  return { name: pl.name.toLowerCase(), text: `${pl.name}, ${PLANET_LOOK[kind].name}: ${does}.`, kind };
}

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
function orbitPlanets(orbit: number, own?: OrbitPlanet[]): string {
  const order = planetsOf({ planets: own });
  const step = 360 / (order.length * 3);
  const facing = Math.floor((((orbit % (order.length * 3)) + order.length * 3) % (order.length * 3)) / 3);
  return order
    .map((pl, i) => {
      const deg = 90 - (i * 3 + 1 - orbit) * step;
      const [x, y] = ringPoint(ORBIT_R, deg);
      const tip = planetInfo(i * 3, own).text;
      return `<i class="vit-planet vp-${pl} ${i === facing ? 'vp-facing' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" title="${tip}"></i>`;
    })
    .join('');
}

/** The tag naming the planet facing the sun, and its days left there. */
function planetTag(orbit: number, eaten = false, own?: OrbitPlanet[]): string {
  const facing = planetInfo(orbit, own);
  const left = BALANCE.orbitTurns - (((orbit % BALANCE.orbitTurns) + BALANCE.orbitTurns) % BALANCE.orbitTurns);
  // A rival's galaxy eater has its planets: whichever faces the sun counts as dead.
  if (eaten) return `<div class="vit-planet-tag vt-dead vt-eaten" title="A rival's Orion, Galaxy Eater has eaten this sun's planets: they count as dead, giving no energy or cards.">eaten · ${left}</div>`;
  return `<div class="vit-planet-tag vt-${facing.kind}" title="${facing.text} ${left} more day${left === 1 ? '' : 's'} before the next planet comes round.">${facing.name} · ${left}</div>`;
}

/**
 * Shields as a half-sphere of hexagons in front of a sun (campaign battles), its curve facing the enemy: a
 * lattice of hex cells laid over the half of a globe that faces right (the rival's is mirrored), seen from the
 * side, so the cells crowd and thin as they curve away, those on the far side faint. Brighter the more shields
 * are up; hidden with none.
 */
let latticeSvg = '';
function shieldLattice(): string {
  if (latticeSvg) return latticeSvg;
  const R = 50;
  const tilt = (22 * Math.PI) / 180;
  const deg = Math.PI / 180;
  // A point on the globe (longitude, latitude), tilted towards the viewer, seen from the front: x, y and depth.
  const project = (lon: number, lat: number) => {
    const x = Math.cos(lat) * Math.sin(lon);
    const y0 = Math.sin(lat);
    const z0 = Math.cos(lat) * Math.cos(lon);
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
    const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    return { x: x * R, y: -y * R, z };
  };
  const cells: string[] = [];
  const size = 9 * deg;
  const dx = size * 1.5;
  const dy = size * Math.sqrt(3);
  for (let col = -Math.ceil(Math.PI / dx); col <= Math.ceil(Math.PI / dx); col++) {
    for (let row = -9; row <= 9; row++) {
      const lon = col * dx;
      const lat = row * dy + (col % 2 ? dy / 2 : 0);
      if (Math.abs(lat) > 82 * deg) continue;
      const c = project(lon, lat);
      // (Only the half facing the enemy: the cap of the globe towards +x.)
      if (c.x < R * 0.05) continue;
      // (Cells are wider in longitude towards the poles, so they keep their shape on the globe.)
      const pts = Array.from({ length: 6 }, (_, k) => {
        const a = (k * Math.PI) / 3;
        const p = project(lon + (Math.cos(a) * size * 0.92) / Math.max(0.25, Math.cos(lat)), lat + Math.sin(a) * size * 0.92);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }).join(' ');
      cells.push(`<polygon points="${pts}" style="opacity:${(0.18 + Math.max(0, (c.z + 1) / 2) * 0.82).toFixed(2)}"/>`);
    }
  }
  latticeSvg = `<svg class="vit-lattice" viewBox="-52 -52 104 104" aria-hidden="true"><defs><radialGradient id="lat-glow"><stop offset="0.72" stop-color="#bfe4ff" stop-opacity="0"/><stop offset="0.97" stop-color="#bfe4ff" stop-opacity="0.45"/><stop offset="1" stop-color="#bfe4ff" stop-opacity="0"/></radialGradient></defs><path d="M0 -51A51 51 0 0 1 0 51Z" fill="url(#lat-glow)"/><g class="vit-lattice-cells">${cells.join('')}</g></svg>`;
  return latticeSvg;
}

export function vitals(opts: { heat: number; threshold: number; shields: number; dead?: boolean; id?: string; orbit?: number; eaten?: boolean; lattice?: boolean; planets?: OrbitPlanet[] }): string {
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
      <canvas class="vit-dome" data-t="${t.toFixed(3)}" data-cold="${cold.toFixed(3)}" data-dead="${dead ? 1 : 0}" data-seed="${((seed / 997) * 6.28).toFixed(3)}" data-orbit="${orbit ?? ''}" ${opts.planets?.length ? `data-planets="${opts.planets.map((x) => x.kind).join(',')}"` : ''} data-pid="${opts.id ?? ''}" aria-hidden="true"></canvas>
      ${orbit !== undefined ? orbitPlanets(orbit, opts.planets) : ''}
      ${opts.lattice ? `<div class="vit-shell" style="--sh:${Math.min(1, shields / 4).toFixed(2)}">${shieldLattice()}</div>` : ''}
      <div class="vit-heat" title="Heat ${heat} of ${threshold}: at ${threshold} the sun goes supernova">${dead ? '' : `<b ${idAttr('heat')}>${heat}</b><small>/${threshold}</small>`}</div>
      <div class="vit-under">${orbit !== undefined ? planetTag(orbit, opts.eaten, opts.planets) : ''}</div>
    </div>`;
}

/**
 * The Infinite Stellari: the landing page's white flower, on its own (the same petals, framed tight round
 * them), for the campaign's Heart and story.
 */
export function stellariaFlower(): string {
  const petals = Array.from({ length: 12 }, (_, i) => `<ellipse cx="500" cy="170" rx="95" ry="330" transform="rotate(${i * 30} 500 170)" />`).join('');
  const inner = Array.from({ length: 18 }, (_, i) => `<path d="M500 170 L526 -30 L500 -90 L474 -30 Z" transform="rotate(${i * 20 + 10} 500 170)" />`).join('');
  return `<svg class="stellaria-flower" viewBox="70 -260 860 860" aria-hidden="true"><g class="petal-outer">${petals}</g><g class="petal-inner">${inner}</g></svg>`;
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

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n: number): string {
  if (n >= 40) return String(n);
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}
