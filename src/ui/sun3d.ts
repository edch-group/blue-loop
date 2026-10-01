/**
 * The suns' coronas: ragged flames licking out across the board round the
 * base of each sun (the sun itself is a faceted dome, built in art.ts).
 *
 * A seamless noise texture (3D noise sampled on a sphere, so it has no seam)
 * is painted once and frays the flames; each frame, every sun canvas on the
 * page redraws its flickering ring of flames. Colours follow the sun's heat
 * (gold → red, or icy blue when cold), read from the canvas's data attributes.
 */

const TW = 512;
/** Directions round the rim the corona's flames are worked out for each frame. */
const FLAMES = 360;
const TH = 256;
let texture: Float32Array | null = null;

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function fbm3(x: number, y: number, z: number, octaves: number): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f);
    norm += amp;
    f *= 2.07;
    amp *= 0.52;
  }
  return sum / norm;
}

/** The surface, as brightness 0–1 over longitude × latitude (painted on first use). */
function surface(): Float32Array {
  if (texture) return texture;
  const t = new Float32Array(TW * TH);
  for (let j = 0; j < TH; j++) {
    const lat = (j / (TH - 1) - 0.5) * Math.PI;
    for (let i = 0; i < TW; i++) {
      const lon = (i / TW) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      // Large convection cells, folded so their edges run as darker lanes, with fine granulation over them.
      const cells = fbm3(x * 2.2 + 5, y * 2.2, z * 2.2, 4);
      const lanes = 1 - Math.abs(2 * fbm3(x * 4.5, y * 4.5 + 9, z * 4.5, 4) - 1);
      const grain = fbm3(x * 16, y * 16, z * 16 + 3, 3);
      t[j * TW + i] = Math.min(1, Math.max(0, 0.18 + cells * 0.55 + lanes * 0.35 - grain * 0.28));
    }
  }
  texture = t;
  return t;
}

type RGB = [number, number, number];

/** The sun's palette by heat: deep, mid and bright, from the canvas's data attributes. */
function palette(t: number, cold: number): RGB[] {
  const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  if (cold > 0) {
    return [mix([170, 58, 8], [24, 64, 150], cold), mix([246, 140, 34], [96, 160, 236], cold), mix([255, 232, 150], [222, 242, 255], cold)];
  }
  // Orange-gold when cool, through orange, to a deep angry red near supernova (like a photograph of the Sun).
  return [mix([170, 58, 8], [120, 16, 6], t), mix([246, 140, 34], [226, 64, 22], t), mix([255, 232, 150], [255, 186, 110], t)];
}

const sunsDrawn = new WeakMap<HTMLCanvasElement, ImageData>();
let running = false;
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The sun's base radius, as a share of the canvas (the dome in art.ts is 0.27 of the gauge; the canvas is 0.88 of it). */
const RADIUS = 0.27 / 0.88;

function draw(canvas: HTMLCanvasElement, time: number) {
  const size = Math.round(Math.min(220, canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
  if (size < 8) return;
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.dataset.dead === '1') {
    ctx.clearRect(0, 0, size, size);
    return;
  }
  let img = sunsDrawn.get(canvas);
  if (!img || img.width !== size) {
    img = ctx.createImageData(size, size);
    sunsDrawn.set(canvas, img);
  }
  const tex = surface();
  const [deep, mid, bright] = palette(Number(canvas.dataset.t ?? 0), Number(canvas.dataset.cold ?? 0));
  const danger = canvas.dataset.danger === '1';
  const seed = Number(canvas.dataset.seed ?? 0);
  const px = img.data;
  const c = size / 2;
  const R = size * RADIUS;
  const flick = time * 0.0004;
  // The flames round the base, worked out once per frame (FLAMES directions), not per pixel.
  const flames = new Float32Array(FLAMES);
  for (let k = 0; k < FLAMES; k++) {
    const ang = (k / FLAMES) * Math.PI * 2;
    flames[k] = fbm3(Math.cos(ang) * 2.6 + flick, Math.sin(ang) * 2.6, flick * 0.6 + seed, 4);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x - c + 0.5) / R, dy = (y - c + 0.5) / R;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r <= 1) {
        // Under the dome: solid and white-hot, so no board shows through between its facets.
        px[i] = bright[0];
        px[i + 1] = bright[1];
        px[i + 2] = bright[2];
        px[i + 3] = 255;
        continue;
      }
      if (r > 1.75) {
        px[i + 3] = 0;
        continue;
      }
      const ang = Math.atan2(dy, dx);
      const f = Math.floor(((ang / (Math.PI * 2) + 1) % 1) * FLAMES);
      // Ragged wisps: the surface texture, sampled along the flame, frays its edge.
      const wisp = tex[(Math.floor(r * 37 + flick * 20) % TH) * TW + ((f * 2 + Math.floor(flick * 30)) % TW)];
      const flame = flames[f] * (0.7 + 0.6 * wisp);
      const reach = 0.16 + flame * (danger ? 0.62 : 0.46);
      const out = (r - 1) / reach;
      if (out >= 1) {
        px[i + 3] = 0;
        continue;
      }
      // White-hot at the base, then orange flames reddening and thinning towards their tips (strong enough to read on the white board).
      const hot = Math.max(0, 1 - out * 3);
      const glow = Math.pow(1 - out, 1.6) * (0.65 + flame * 0.5);
      px[i] = 255 * hot + mid[0] * (1 - hot);
      px[i + 1] = 244 * hot + (mid[1] * (1 - out) + deep[1] * out) * (1 - hot);
      px[i + 2] = 200 * hot + (mid[2] * (1 - out) + deep[2] * out) * (1 - hot);
      px[i + 3] = Math.min(255, glow * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------- The sun itself: a solid, seen from where the camera really is ---------- */

type V3 = [number, number, number];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: V3): V3 => mul3(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/** The dome's radius and the orbit's, as shares of the sun gauge's size (the orbit matches art.ts's ORBIT_R). */
const DOME_R = 0.27;
const ORBIT_R = 0.56;
/** How far the dome canvas reaches past the gauge on every side (it holds the sun's image as the board sees it). */
const DOME_PAD = 0.6;
const DOME_LATS = 12;
const DOME_SLICES = 36;

/** Where each sun gauge's top-left corner is, and the camera, in the gauge's own board coordinates (px; z up off the board). */
function offsetIn(el: HTMLElement, anc: HTMLElement): [number, number] {
  let x = 0, y = 0;
  let e: HTMLElement | null = el;
  while (e && e !== anc) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
  }
  return [x, y];
}

/**
 * Where the viewer's eye is, seen from a sun gauge lying on the tipped board:
 * the table's perspective point, carried back through the board's transform
 * into the gauge's own flat coordinates.
 */
type Eye = { cam: V3; right: V3; up: V3 };
function cameraFor(vit: HTMLElement): Eye {
  const vs = vit.offsetWidth;
  const tv = vit.closest<HTMLElement>('.table-view');
  const game = tv?.querySelector<HTMLElement>(':scope > .game');
  const fallback: Eye = { cam: [vs / 2, vs * 4, vs * 7], right: [1, 0, 0], up: norm3([0, -0.83, 0.56]) };
  if (!tv || !game) return fallback;
  const cs = getComputedStyle(tv);
  const d = parseFloat(cs.perspective);
  const [pox, poy] = cs.perspectiveOrigin.split(' ').map(parseFloat);
  const gs = getComputedStyle(game);
  if (!isFinite(d) || gs.transform === 'none') return fallback;
  const [ox, oy, oz = 0] = gs.transformOrigin.split(' ').map(parseFloat);
  const [gx, gy] = offsetIn(game, tv);
  const m = new DOMMatrix(gs.transform).inverse();
  const eye = m.transformPoint(new DOMPoint(pox - gx - ox, poy - gy - oy, d - oz));
  const [vx, vy] = offsetIn(vit, tv);
  // The gauge's holder is lifted half its height (translateY(-50%)), which offsets don't include.
  const holder = vit.closest<HTMLElement>('.vitals');
  const lift = holder ? holder.offsetHeight / 2 : 0;
  const cam: V3 = [eye.x + ox + gx - vx, eye.y + oy + gy - vy + lift, eye.z + oz];
  // The screen's own right and up, in the board's frame (so labels stand upright on screen).
  const dir = (x: number, y: number): V3 => {
    const p = m.transformPoint(new DOMPoint(x, y, 0, 0));
    return norm3([p.x, p.y, p.z]);
  };
  return cam[2] > vs ? { cam, right: dir(1, 0), up: dir(0, -1) } : fallback;
}

/** Where a point off the board appears on the board: along the line of sight from the eye, down to the board. */
function onBoard(cam: V3, p: V3): [number, number] {
  const k = cam[2] / (cam[2] - p[2]);
  return [cam[0] + (p[0] - cam[0]) * k, cam[1] + (p[1] - cam[1]) * k];
}

function sunPalette(t: number, cold: number, dead: boolean): RGB[] {
  if (dead) return [[92, 94, 102], [148, 151, 158], [204, 206, 212]];
  return palette(t, cold);
}

const mottles = new Map<number, Float32Array>();
function mottleFor(seed: number): Float32Array {
  let m = mottles.get(seed);
  if (m) return m;
  m = new Float32Array(DOME_LATS * DOME_SLICES);
  let r = (Math.floor(seed * 1000) * 7919 + 17) >>> 0;
  for (let k = 0; k < m.length; k++) m[k] = ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296 - 0.5) * 0.1;
  mottles.set(seed, m);
  return m;
}

const PLANET_RGB: Record<string, RGB> = { dead: [150, 156, 168], abundant: [86, 192, 150], industrial: [224, 150, 72] };
const PLANETS = ['dead', 'abundant', 'industrial'];
/** Each dome canvas's planets, as drawn (angles in degrees), eased towards where the orbit puts them. */
const planetAngles = new WeakMap<HTMLCanvasElement, number[]>();

type Shape = { depth: number; draw: () => void };

/**
 * Draws a sun as a solid object: a faceted dome rising out of the board, and
 * its planets as faceted balls lit by it, each facet projected onto the
 * board along the viewer's line of sight. Lying on the board, the drawing
 * looks to the viewer exactly like the solid it was projected from (the trick
 * of 3D pavement art), so the sun is truly 3D in the board's own perspective
 * while costing no more than a flat drawing. Facets facing the viewer burn
 * deep orange, facets seen edge-on white-hot, as in a photograph of the Sun.
 */
function drawDome(canvas: HTMLCanvasElement, time: number) {
  const vit = canvas.closest<HTMLElement>('.vit');
  if (!vit) return;
  const vs = vit.offsetWidth;
  if (vs < 8) return;
  const span = vs * (1 + 2 * DOME_PAD);
  const px = Math.round(Math.min(640, span * Math.min(2, window.devicePixelRatio || 1)));
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const s = px / span;
  ctx.setTransform(s, 0, 0, s, DOME_PAD * vs * s, DOME_PAD * vs * s);
  ctx.clearRect(-DOME_PAD * vs, -DOME_PAD * vs, span, span);
  ctx.lineJoin = 'round';

  const eye = cameraFor(vit);
  const cam = eye.cam;
  const dead = canvas.dataset.dead === '1';
  const [deep, mid, bright] = sunPalette(Number(canvas.dataset.t ?? 0), Number(canvas.dataset.cold ?? 0), dead);
  const seed = Number(canvas.dataset.seed ?? 0);
  const mottle = mottleFor(seed);
  const c: V3 = [vs / 2, vs / 2, 0];
  const R = vs * DOME_R;
  const spin = time * 0.00004 + seed;
  const rad = Math.PI / 180;
  const vert = (lat: number, lon: number): V3 => [c[0] + R * Math.cos(lat) * Math.cos(lon), c[1] + R * Math.cos(lat) * Math.sin(lon), R * Math.sin(lat)];
  const poly = (pts: V3[], fill: string) => {
    ctx.beginPath();
    pts.forEach((p, k) => {
      const [x, y] = onBoard(cam, p);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    // The same colour round the edge closes the hairline seams between facets.
    ctx.strokeStyle = fill;
    ctx.lineWidth = 0.6 / s;
    ctx.stroke();
  };
  const rgb = (k: number[]) => `rgb(${Math.round(k[0])} ${Math.round(k[1])} ${Math.round(k[2])})`;

  const shapes: Shape[] = [];
  // The dome: its facets, each lit by how squarely it faces the eye.
  const dome: (() => void)[] = [];
  for (let i = 0; i < DOME_LATS; i++) {
    const a0 = ((i * 90) / DOME_LATS) * rad, a1 = (((i + 1) * 90) / DOME_LATS) * rad;
    for (let j = 0; j < DOME_SLICES; j++) {
      const l0 = (j / DOME_SLICES) * Math.PI * 2 + spin, l1 = ((j + 1) / DOME_SLICES) * Math.PI * 2 + spin;
      const am = (a0 + a1) / 2, lm = (l0 + l1) / 2;
      const n: V3 = [Math.cos(am) * Math.cos(lm), Math.cos(am) * Math.sin(lm), Math.sin(am)];
      const mu = dot3(n, norm3(sub3(cam, add3(c, mul3(n, R)))));
      if (mu <= 0) continue;
      let v = 0.28 + 0.66 * Math.pow(1 - mu, 1.5) + mottle[i * DOME_SLICES + j];
      v = Math.max(0, Math.min(1, v));
      const a = v < 0.5 ? v / 0.5 : (v - 0.5) / 0.5;
      const lo = v < 0.5 ? deep : mid, hi = v < 0.5 ? mid : bright;
      const w = dead ? 0 : Math.pow(1 - mu, 5) * 0.85;
      const col = [0, 1, 2].map((k) => lo[k] + (hi[k] - lo[k]) * a + (([255, 248, 222][k] - (lo[k] + (hi[k] - lo[k]) * a)) * w));
      const pts = [vert(a0, l0), vert(a0, l1), vert(a1, l1), vert(a1, l0)];
      dome.push(() => poly(pts, rgb(col)));
    }
  }
  const domeDepth = Math.hypot(...sub3(cam, add3(c, [0, 0, R * 0.5])));
  shapes.push({ depth: domeDepth, draw: () => dome.forEach((f) => f()) });

  // The planets: balls resting on the orbit, lit by the sun, easing round to where the orbit puts them.
  const orbit = canvas.dataset.orbit === '' || canvas.dataset.orbit === undefined ? NaN : Number(canvas.dataset.orbit);
  if (!dead && isFinite(orbit)) {
    const facing = PLANETS[Math.floor((((orbit % 9) + 9) % 9) / 3)];
    const target = PLANETS.map((_, i) => 90 + (i * 3 + 1 - orbit) * 40);
    const drawn = planetAngles.get(canvas) ?? target.slice();
    drawn.forEach((d, i) => {
      const delta = ((((target[i] - d) % 360) + 540) % 360) - 180;
      drawn[i] = Math.abs(delta) < 0.2 ? target[i] : d + delta * 0.18;
    });
    planetAngles.set(canvas, drawn);
    const glow: V3 = [c[0], c[1], R * 0.6];
    PLANETS.forEach((pl, i) => {
      const big = pl === facing;
      const pr = vs * (big ? 0.085 : 0.06);
      const ang = drawn[i] * rad;
      const ctr: V3 = [c[0] + Math.cos(ang) * ORBIT_R * vs, c[1] + Math.sin(ang) * ORBIT_R * vs, pr];
      const base = PLANET_RGB[pl];
      const light = norm3(sub3(glow, ctr));
      shapes.push({
        depth: Math.hypot(...sub3(cam, ctr)),
        draw: () => {
          // A soft contact shadow on the board, cast away from the sun.
          const away = norm3([ctr[0] - c[0], ctr[1] - c[1], 0]);
          ctx.beginPath();
          ctx.ellipse(ctr[0] + away[0] * pr * 0.45, ctr[1] + away[1] * pr * 0.45, pr * 1.05, pr * 1.05, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(40, 44, 60, 0.1)';
          ctx.fill();
          const LAT = 7, LON = 12;
          for (let a = 0; a < LAT; a++) {
            const b0 = (-90 + (a * 180) / LAT) * rad, b1 = (-90 + ((a + 1) * 180) / LAT) * rad;
            for (let o = 0; o < LON; o++) {
              const o0 = (o / LON) * Math.PI * 2 + spin * 3, o1 = ((o + 1) / LON) * Math.PI * 2 + spin * 3;
              const bm = (b0 + b1) / 2, om = (o0 + o1) / 2;
              const n: V3 = [Math.cos(bm) * Math.cos(om), Math.cos(bm) * Math.sin(om), Math.sin(bm)];
              const surf = add3(ctr, mul3(n, pr));
              if (dot3(n, sub3(cam, surf)) <= 0) continue;
              const lit = 0.62 + 0.5 * Math.max(0, dot3(n, light));
              const pv = (b: number, o2: number): V3 => add3(ctr, [pr * Math.cos(b) * Math.cos(o2), pr * Math.cos(b) * Math.sin(o2), pr * Math.sin(b)]);
              poly([pv(b0, o0), pv(b0, o1), pv(b1, o1), pv(b1, o0)], rgb(base.map((k) => Math.min(255, k * lit))));
            }
          }
        },
      });
    });
  }
  // Farthest first, so nearer things cover farther ones.
  shapes.sort((a, b) => b.depth - a.depth).forEach((sh) => sh.draw());

  // The labels standing up off the board, turned to face the eye.
  const stand = (el: HTMLElement | null, at: V3, ay: string) => {
    if (!el) return;
    const { right, up } = eye;
    const k = 20;
    const q0 = onBoard(cam, at), qx = onBoard(cam, add3(at, mul3(right, k))), qy = onBoard(cam, add3(at, mul3(up, -k)));
    el.style.transform = `matrix(${((qx[0] - q0[0]) / k).toFixed(4)},${((qx[1] - q0[1]) / k).toFixed(4)},${((qy[0] - q0[0]) / k).toFixed(4)},${((qy[1] - q0[1]) / k).toFixed(4)},${q0[0].toFixed(2)},${q0[1].toFixed(2)}) translate(-50%, ${ay})`;
  };
  stand(vit.querySelector<HTMLElement>('.vit-heat'), [c[0], c[1], R * 0.9], '-50%');
  stand(vit.querySelector<HTMLElement>('.vit-planet-tag'), [c[0], c[1] - vs * (ORBIT_R + 0.1), 0], '-100%');
  stand(vit.querySelector<HTMLElement>('.vit-shields'), [c[0], c[1] + vs * (ORBIT_R + 0.2), 0], '-100%');
}

let last = 0;
function frame(time: number) {
  const suns = document.querySelectorAll<HTMLCanvasElement>('canvas.sun3d');
  if (!suns.length) {
    running = false;
    return;
  }
  // About 20 frames a second is plenty for a slow turn and a lazy flicker.
  if (time - last > 50) {
    last = time;
    suns.forEach((cv) => draw(cv, reduce() ? 0 : time));
    document.querySelectorAll<HTMLCanvasElement>('canvas.vit-dome').forEach((cv) => drawDome(cv, reduce() ? 0 : time));
  }
  requestAnimationFrame(frame);
}

/** Start (or keep) drawing every sun canvas on the page; call after rendering. */
export function animateSuns() {
  const suns = document.querySelectorAll<HTMLCanvasElement>('canvas.sun3d');
  // Draw new canvases at once, so a re-render never shows an empty sun.
  suns.forEach((cv) => draw(cv, reduce() ? 0 : performance.now()));
  document.querySelectorAll<HTMLCanvasElement>('canvas.vit-dome').forEach((cv) => drawDome(cv, reduce() ? 0 : performance.now()));
  if (!running && suns.length) {
    running = true;
    requestAnimationFrame(frame);
  }
}
