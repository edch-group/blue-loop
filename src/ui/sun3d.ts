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

const PLANETS = ['dead', 'abundant', 'industrial'];

/** Each planet's surface, as colour over longitude × latitude (painted once, on first use). */
const PW = 256, PH = 128;
const planetMaps = new Map<string, Uint8ClampedArray>();
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function planetMap(pl: string): Uint8ClampedArray {
  const have = planetMaps.get(pl);
  if (have) return have;
  const out = new Uint8ClampedArray(PW * PH * 3);
  // A few craters for the dead world: centre direction and size.
  const craters: [V3, number][] = [];
  for (let k = 0; k < 26; k++) {
    const u = hash3(k, 7, 1) * 2 - 1, th = hash3(k, 3, 9) * Math.PI * 2, q = Math.sqrt(1 - u * u);
    craters.push([[q * Math.cos(th), u, q * Math.sin(th)], 0.08 + 0.22 * Math.pow(hash3(k, 5, 2), 2)]);
  }
  for (let j = 0; j < PH; j++) {
    const lat = (j / (PH - 1) - 0.5) * Math.PI;
    for (let i = 0; i < PW; i++) {
      const lon = (i / PW) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      let col: RGB;
      if (pl === 'dead') {
        // Dusty grey rock: mottled maria, fine grit, and craters with bright rims and dark floors.
        const maria = fbm3(x * 2.4 + 11, y * 2.4, z * 2.4, 4);
        const grit = fbm3(x * 18, y * 18, z * 18, 3);
        let v = 0.62 + (maria - 0.5) * 0.55 + (grit - 0.5) * 0.22;
        for (const [d, r] of craters) {
          const dd = Math.acos(Math.min(1, x * d[0] + y * d[1] + z * d[2])) / r;
          if (dd < 1.25) v += dd < 0.8 ? -0.24 * (1 - dd / 0.8) - 0.06 : 0.2 * (1 - Math.abs(dd - 1) / 0.25);
        }
        col = mix([92, 96, 106], [206, 210, 218], clamp01(v));
      } else if (pl === 'abundant') {
        // Oceans and green continents, ice at the poles, and wisps of cloud.
        const land = fbm3(x * 1.8 + 3, y * 1.8, z * 1.8 + 7, 5);
        const lush = fbm3(x * 5, y * 5 + 4, z * 5, 3);
        const ocean: RGB = mix([28, 92, 150], [52, 148, 196], clamp01((land - 0.3) * 4));
        const ground: RGB = mix([54, 150, 82], [150, 168, 92], clamp01((lush - 0.45) * 2.4));
        col = land > 0.52 ? mix(ground, [40, 120, 70], clamp01((land - 0.6) * 3)) : ocean;
        if (land > 0.5 && land < 0.52) col = mix(ocean, [196, 200, 150], 0.5);
        const ice = clamp01((Math.abs(y) - 0.8) * 8 + (fbm3(x * 6, y * 6, z * 6, 3) - 0.5) * 2);
        col = mix(col, [236, 244, 250], ice);
        const cloud = clamp01((fbm3(x * 3.2 + 20, y * 6.5, z * 3.2, 5) - 0.55) * 3.2);
        col = mix(col, [250, 252, 255], cloud * 0.85);
      } else {
        // An industrial world: rust-and-ochre bands, smoke swirls, and a lattice of glowing works.
        const warp = fbm3(x * 3, y * 3, z * 3 + 5, 4);
        const band = 0.5 + 0.5 * Math.sin(y * 14 + warp * 5);
        col = mix([150, 72, 30], [238, 168, 86], band);
        const smoke = clamp01((fbm3(x * 7, y * 7 + 2, z * 7, 4) - 0.5) * 2.5);
        col = mix(col, [96, 58, 40], smoke * 0.55);
        const grid = Math.max(Math.pow(Math.abs(Math.sin(lon * 18)), 60), Math.pow(Math.abs(Math.sin(lat * 18)), 60));
        const works = clamp01((fbm3(x * 9 + 1, y * 9, z * 9, 2) - 0.52) * 6);
        col = mix(col, [255, 226, 140], grid * works * 0.9);
      }
      const o = (j * PW + i) * 3;
      out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2];
    }
  }
  planetMaps.set(pl, out);
  return out;
}

/** A planet's surface colour in a direction (`n`, from its centre), turned by `spin`. */
function planetAt(map: Uint8ClampedArray, n: V3, spin: number): RGB {
  const u = (Math.atan2(n[1], n[0]) + spin) / (Math.PI * 2);
  const v = Math.asin(Math.min(1, n[2])) / Math.PI + 0.5;
  // Bilinear, so the texture stays smooth however big the planet is drawn.
  const fx = (u - Math.floor(u)) * PW, fy = Math.min(PH - 1.001, v * (PH - 1));
  const x0 = Math.floor(fx) % PW, x1 = (x0 + 1) % PW, y0 = Math.floor(fy), y1 = y0 + 1;
  const tx = fx - Math.floor(fx), ty = fy - y0;
  const at = (x: number, y: number, q: number) => map[(y * PW + x) * 3 + q];
  return [0, 1, 2].map((q) => (at(x0, y0, q) * (1 - tx) + at(x1, y0, q) * tx) * (1 - ty) + (at(x0, y1, q) * (1 - tx) + at(x1, y1, q) * tx) * ty) as RGB;
}
/** Each planet's trail along the orbit, and its notches: deeper than the planet, to read on the white board. */
const TRAIL_RGB: Record<string, RGB> = { dead: [112, 118, 132], abundant: [40, 158, 112], industrial: [214, 120, 36] };
/**
 * Each sun's orbit as drawn, by player: it follows the real orbit a notch at
 * a time (each step easing in and out), so a change at the start of a day,
 * or from a card, is seen as the planets swinging round. Kept by player, not
 * by canvas, since the board is redrawn as the game moves on.
 */
const orbitsShown = new Map<string, { at: number; seen: number }>();
/** How long one notch of the orbit takes to swing round, in ms. */
const ORBIT_STEP_MS = 1400;
let orbitsMoving = false;
const domeImages = new WeakMap<HTMLCanvasElement, ImageData>();
const ballLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
/** The three notches on the orbit's near side (degrees, in turn): where the facing planet spends each of its turns. The orbit runs clockwise. */
const NOTCHES = [50, 90, 130];

/** Moves a sun's shown orbit on towards its real one, and returns it (fractional while swinging). */
function shownOrbit(pid: string, orbit: number, now: number): number {
  const was = orbitsShown.get(pid);
  // A sun not seen for a while (a new game, say) starts where it is.
  if (!was || now - was.seen > 3000 || reduce()) {
    orbitsShown.set(pid, { at: orbit, seen: now });
    return orbit;
  }
  const dt = Math.max(0, now - was.seen);
  // The way round to the real orbit: forward, unless it moved back (cards can turn it back).
  let gap = (((orbit - was.at) % 9) + 9) % 9;
  if (gap > 4.5) gap -= 9;
  if (Math.abs(gap) < 1e-3) {
    orbitsShown.set(pid, { at: orbit, seen: now });
    return orbit;
  }
  // Several notches at once go a little faster each, so a big swing doesn't drag on.
  const speed = (dt / ORBIT_STEP_MS) * Math.max(1, Math.abs(gap) / 2.5);
  const at = Math.abs(gap) <= speed ? orbit : was.at + Math.sign(gap) * speed;
  orbitsShown.set(pid, { at, seen: now });
  if (at !== orbit) orbitsMoving = true;
  return at;
}

/** A notch-to-notch swing: within each step, ease in and out. */
function notchEase(o: number): number {
  const i = Math.floor(o), f = o - i;
  return i + f * f * (3 - 2 * f);
}

/** A half-sphere sitting in the board: its centre on the board, its colour at a point of its surface. */
type Ball = { ctr: V3; r: number; shade: (n: V3, mu: number) => RGB };

/**
 * Ray-traces the visible half-spheres (the sun and its planets) into the
 * canvas, pixel by pixel: each pixel is a point of the board, and the line of
 * sight from the eye to it either meets a ball first (and shows that ball's
 * surface there) or reaches the board. Lying on the board, the picture looks
 * to the viewer exactly like the solids themselves (the trick of 3D pavement
 * art), smooth and in the board's own perspective, while the board stays flat.
 */
function traceBalls(img: ImageData, s: number, pad: number, cam: V3, balls: Ball[]) {
  const W = img.width;
  const px = img.data;
  // Farthest first, so nearer balls paint over farther ones.
  const order = balls.slice().sort((a, b) => Math.hypot(...sub3(cam, b.ctr)) - Math.hypot(...sub3(cam, a.ctr)));
  for (const ball of order) {
    const { ctr, r } = ball;
    // The ball's outline on the board, from points round its surface.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let la = 0; la <= 90; la += 15) {
      for (let lo = 0; lo < 360; lo += 15) {
        const a = (la * Math.PI) / 180, o = (lo * Math.PI) / 180;
        const [qx, qy] = onBoard(cam, [ctr[0] + r * Math.cos(a) * Math.cos(o), ctr[1] + r * Math.cos(a) * Math.sin(o), r * Math.sin(a)]);
        x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy);
      }
    }
    const pa = Math.max(0, Math.floor((x0 + pad) * s) - 2), pb = Math.min(W - 1, Math.ceil((x1 + pad) * s) + 2);
    const qa = Math.max(0, Math.floor((y0 + pad) * s) - 2), qb = Math.min(W - 1, Math.ceil((y1 + pad) * s) + 2);
    const o: V3 = sub3(cam, ctr);
    const oo = dot3(o, o);
    for (let y = qa; y <= qb; y++) {
      for (let x = pa; x <= pb; x++) {
        // The line of sight from the eye to this point of the board.
        const D: V3 = [(x + 0.5) / s - pad - cam[0], (y + 0.5) / s - pad - cam[1], -cam[2]];
        const a = dot3(D, D), b = dot3(o, D);
        // How close the line passes to the ball's centre, and how big a pixel is out there (for smooth edges).
        const near = Math.sqrt(Math.max(0, oo - (b * b) / a));
        const reach = Math.sqrt(oo / a) / s;
        const cover = Math.min(1, Math.max(0, (r - near) / reach + 0.5));
        if (cover <= 0) continue;
        const disc = b * b - a * (oo - r * r);
        const t = disc > 0 ? (-b - Math.sqrt(disc)) / a : -b / a;
        const P: V3 = add3(cam, mul3(D, t));
        // Where the ball meets the board on the near side, smooth its edge too: by how far this point of
        // the board lies inside the ball's base (a ball cut off by the board would otherwise be jagged there).
        const qx = (x + 0.5) / s - pad - ctr[0], qy = (y + 0.5) / s - pad - ctr[1];
        let edge = 1;
        if (P[2] < r * 0.25 && qx * o[0] + qy * o[1] > 0) edge = Math.min(1, Math.max(0, (r - Math.hypot(qx, qy)) * s + 0.5));
        const coverAll = Math.min(cover, edge);
        if (coverAll <= 0) continue;
        if (P[2] < 0) P[2] = 0;
        const n = norm3(sub3(P, ctr));
        if (n[2] < 0) n[2] = 0;
        const mu = Math.max(0, dot3(n, norm3(sub3(cam, P))));
        const col = ball.shade(n, mu);
        const i = (y * W + x) * 4;
        const da = px[i + 3] / 255;
        if (da === 0 || coverAll >= 1) {
          px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2];
          px[i + 3] = coverAll * 255;
        } else {
          px[i] = px[i] + (col[0] - px[i]) * coverAll;
          px[i + 1] = px[i + 1] + (col[1] - px[i + 1]) * coverAll;
          px[i + 2] = px[i + 2] + (col[2] - px[i + 2]) * coverAll;
          px[i + 3] = Math.min(255, px[i + 3] + (255 - px[i + 3]) * coverAll);
        }
      }
    }
  }
}

/**
 * Draws a sun and its planets as solids: the top halves of spheres rising out
 * of the board, the sun's surface mottled with granulation, deep orange where
 * it faces the viewer and white-hot at its outline (as in a photograph of the
 * Sun), the planets lit from the sun's side.
 */
function drawDome(canvas: HTMLCanvasElement, time: number) {
  const vit = canvas.closest<HTMLElement>('.vit');
  if (!vit) return;
  const vs = vit.offsetWidth;
  if (vs < 8) return;
  const span = vs * (1 + 2 * DOME_PAD);
  // A little finer than the screen's own pixels, so edges stay smooth however the board scales it.
  const size = Math.round(Math.min(760, span * Math.min(2, window.devicePixelRatio || 1) * 1.5));
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let img = domeImages.get(canvas);
  if (!img || img.width !== size) {
    img = ctx.createImageData(size, size);
    domeImages.set(canvas, img);
  }
  img.data.fill(0);
  const s = size / span;
  const pad = DOME_PAD * vs;

  const eye = cameraFor(vit);
  const cam = eye.cam;
  const dead = canvas.dataset.dead === '1';
  const [deep, mid, bright] = sunPalette(Number(canvas.dataset.t ?? 0), Number(canvas.dataset.cold ?? 0), dead);
  const seed = Number(canvas.dataset.seed ?? 0);
  const tex = surface();
  const c: V3 = [vs / 2, vs / 2, 0];
  const R = vs * DOME_R;
  const spin = time * 0.00004 + seed;
  const balls: Ball[] = [
    {
      ctr: c,
      r: R,
      shade: (n, mu) => {
        // The granulation, turning with the sun.
        const lon = Math.atan2(n[1], n[0]) + spin;
        const u = lon / (Math.PI * 2);
        const v = Math.asin(Math.min(1, n[2])) / Math.PI + 0.5;
        const raw = tex[Math.min(TH - 1, Math.floor(v * TH)) * TW + (Math.floor((u - Math.floor(u)) * TW) % TW)];
        const g = Math.min(1, Math.max(0, (raw - 0.3) * 1.6));
        const k = Math.min(1, g * (0.6 + 0.4 * Math.sqrt(mu)));
        const a = k < 0.5 ? k / 0.5 : (k - 0.5) / 0.5;
        const lo = k < 0.5 ? deep : mid, hi = k < 0.5 ? mid : bright;
        const w = dead ? 0 : Math.min(1, Math.pow(1 - mu, 4) * 1.3);
        return [0, 1, 2].map((q) => {
          const base = lo[q] + (hi[q] - lo[q]) * a;
          return base + ([255, 248, 222][q] - base) * w;
        }) as RGB;
      },
    },
  ];

  // The planets: half-spheres in the board on the orbit, easing round to where the orbit puts them.
  const real = canvas.dataset.orbit === '' || canvas.dataset.orbit === undefined ? NaN : Number(canvas.dataset.orbit);
  // Flat on the board under the balls: the trail the facing planet leaves along its notches, and the notches.
  const flat: (() => void)[] = [];
  if (!dead && isFinite(real)) {
    const o = notchEase(shownOrbit(canvas.dataset.pid ?? '', real, performance.now()));
    const wrap = ((o % 9) + 9) % 9;
    const fi = Math.min(2, Math.floor(wrap / 3));
    const facing = PLANETS[fi];
    const stage = wrap - fi * 3;
    const ringAt = (deg: number): [number, number] => [c[0] + Math.cos((deg * Math.PI) / 180) * ORBIT_R * vs, c[1] + Math.sin((deg * Math.PI) / 180) * ORBIT_R * vs];
    const colour = (pl: string, a: number) => `rgba(${TRAIL_RGB[pl].join(', ')}, ${a})`;
    flat.push(() => {
      const arc = (pl: string, to: number, alpha: number) => {
        if (to <= NOTCHES[0] + 0.01 || alpha <= 0) return;
        ctx.beginPath();
        ctx.arc(c[0], c[1], ORBIT_R * vs, (NOTCHES[0] * Math.PI) / 180, (to * Math.PI) / 180);
        ctx.strokeStyle = colour(pl, alpha);
        ctx.lineWidth = Math.max(2.5, vs * 0.028);
        ctx.lineCap = 'round';
        ctx.stroke();
      };
      // As the planet swings on past its last notch, its trail fades, ready for the next planet to lay its own.
      arc(facing, NOTCHES[0] + 40 * stage, stage > 2 ? 3 - stage : 1);
      NOTCHES.forEach((deg, k) => {
        const [x, y] = ringAt(deg);
        const reached = stage >= k - 0.02;
        const now = Math.round(stage) === k || (stage > 2 && k === 2);
        ctx.beginPath();
        ctx.arc(x, y, vs * (now ? 0.026 : 0.018), 0, Math.PI * 2);
        ctx.fillStyle = reached ? colour(facing, 1) : '#fff';
        ctx.fill();
        ctx.strokeStyle = reached ? '#fff' : 'rgba(150, 160, 185, 0.85)';
        ctx.lineWidth = Math.max(1, vs * 0.008);
        ctx.stroke();
      });
    });
    const glow: V3 = [c[0], c[1], R * 0.5];
    PLANETS.forEach((pl, i) => {
      const pr = vs * 0.07;
      const ang = ((90 - (i * 3 + 1 - o) * 40) * Math.PI) / 180;
      const ctr: V3 = [c[0] + Math.cos(ang) * ORBIT_R * vs, c[1] + Math.sin(ang) * ORBIT_R * vs, 0];
      const map = planetMap(pl);
      const turn = time * 0.00012 + seed + i * 2.1;
      const light = norm3(sub3(glow, add3(ctr, [0, 0, pr * 0.5])));
      const half = norm3(add3(light, [0, 0, 1]));
      // A clear border round its base on the board (as the sun has), so it sits in the board rather than on it:
      // a band of its own colour hugging the outline, fading out just beyond. Under the orbit's trail and notches.
      flat.unshift(() => {
        const [r0, g0, b0] = TRAIL_RGB[pl];
        const out = pr * 1.7;
        const g = ctx.createRadialGradient(ctr[0], ctr[1], pr, ctr[0], ctr[1], out);
        g.addColorStop(0, `rgba(${r0}, ${g0}, ${b0}, 0.9)`);
        g.addColorStop(0.45, `rgba(${r0}, ${g0}, ${b0}, 0.7)`);
        g.addColorStop(0.75, `rgba(${r0}, ${g0}, ${b0}, 0.22)`);
        g.addColorStop(1, `rgba(${r0}, ${g0}, ${b0}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ctr[0], ctr[1], out, 0, Math.PI * 2);
        ctx.fill();
      });
      balls.push({
        ctr,
        r: pr,
        shade: (n, mu) => {
          const tex = planetAt(map, n, turn);
          // Lit from the sun: a soft terminator, darker towards the outline, and a glint of sunlight.
          const sun = Math.max(0, dot3(n, light));
          const lit = 0.5 + 0.62 * Math.pow(sun, 0.8) - 0.16 * (1 - mu);
          const spec = Math.pow(Math.max(0, dot3(n, half)), pl === 'abundant' ? 40 : 18) * (pl === 'abundant' ? 90 : 36);
          let col = tex.map((q) => Math.min(255, q * lit + spec)) as RGB;
          // The living world's air glows at its rim.
          if (pl === 'abundant') col = mix(col, [170, 220, 255], Math.pow(1 - mu, 3) * 0.6);
          return col;
        },
      });
    });
  }
  traceBalls(img, s, pad, cam, balls);
  // The balls go on their own layer, laid over the flat things on the board.
  let layer = ballLayers.get(canvas);
  if (!layer) {
    layer = document.createElement('canvas');
    ballLayers.set(canvas, layer);
  }
  if (layer.width !== size) {
    layer.width = size;
    layer.height = size;
  }
  layer.getContext('2d')?.putImageData(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.setTransform(s, 0, 0, s, pad * s, pad * s);
  flat.forEach((f) => f());
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);

  // The labels standing up off the board, turned to face the eye.
  const stand = (el: HTMLElement | null, at: V3, ay: string) => {
    if (!el) return;
    const { right, up } = eye;
    const k = 20;
    const q0 = onBoard(cam, at), qx = onBoard(cam, add3(at, mul3(right, k))), qy = onBoard(cam, add3(at, mul3(up, -k)));
    el.style.transform = `matrix(${((qx[0] - q0[0]) / k).toFixed(4)},${((qx[1] - q0[1]) / k).toFixed(4)},${((qy[0] - q0[0]) / k).toFixed(4)},${((qy[1] - q0[1]) / k).toFixed(4)},${q0[0].toFixed(2)},${q0[1].toFixed(2)}) translate(-50%, ${ay})`;
  };
  // The heat count in the middle of the sun as you see it: the centre of its outline on screen.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let la = 0; la <= 90; la += 10) {
    for (let lo = 0; lo < 360; lo += 10) {
      const a = (la * Math.PI) / 180, b = (lo * Math.PI) / 180;
      const [qx, qy] = onBoard(cam, [c[0] + R * Math.cos(a) * Math.cos(b), c[1] + R * Math.cos(a) * Math.sin(b), R * Math.sin(a)]);
      x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy);
    }
  }
  stand(vit.querySelector<HTMLElement>('.vit-heat'), [(x0 + x1) / 2, (y0 + y1) / 2, 0], '-50%');
}

let last = 0;
function frame(time: number) {
  const suns = document.querySelectorAll<HTMLCanvasElement>('canvas.sun3d');
  if (!suns.length) {
    running = false;
    return;
  }
  // About 20 frames a second is plenty for a slow turn and a lazy flicker; a swinging orbit gets every frame.
  if (time - last > 50 || orbitsMoving) {
    const flicker = time - last > 50;
    if (flicker) {
      last = time;
      suns.forEach((cv) => draw(cv, reduce() ? 0 : time));
    }
    orbitsMoving = false;
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
