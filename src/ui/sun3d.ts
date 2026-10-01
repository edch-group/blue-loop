/**
 * The suns beside the tableaus, drawn as real, slowly turning stars.
 *
 * A seamless surface texture (granulation over larger convection cells, made
 * from 3D noise sampled on a sphere, so it has no seam) is painted once. Each
 * frame, every sun canvas on the page maps it onto a sphere turned a little
 * further: limb darkening at the edge, a hot rim, and a ragged corona of
 * flames licking round it. Colours follow the sun's heat (gold → red, or icy
 * blue when cold), read from the canvas's data attributes.
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

/**
 * Where each pixel of a sun canvas falls on the sphere (only the spin changes
 * from frame to frame, so this is worked out once per canvas size): its
 * texture row and longitude, its brightness towards the edge, and how white-hot
 * the rim is there. Pixels off the sphere get −1 for their row.
 */
type Sphere = { row: Int32Array; lon: Float32Array; limb: Float32Array; rim: Float32Array };
const spheres = new Map<number, Sphere>();
function sphere(size: number): Sphere {
  const have = spheres.get(size);
  if (have) return have;
  const n = size * size;
  const sp: Sphere = { row: new Int32Array(n), lon: new Float32Array(n), limb: new Float32Array(n), rim: new Float32Array(n) };
  const c = size / 2;
  const R = size * RADIUS;
  // The sphere's pole is tipped towards the viewer a little, so you see over its top.
  const tilt = 0.32;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      const dx = (x - c + 0.5) / R, dy = (y - c + 0.5) / R;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) {
        sp.row[k] = -1;
        continue;
      }
      const nz = Math.sqrt(1 - d2);
      const yy = dy * ct - nz * st;
      const zz = dy * st + nz * ct;
      const lat = Math.asin(Math.max(-1, Math.min(1, -yy)));
      sp.row[k] = Math.min(TH - 1, Math.floor((lat / Math.PI + 0.5) * TH)) * TW;
      sp.lon[k] = Math.atan2(dx, zz) / (Math.PI * 2);
      // The surface dims a little towards the edge, then the edge itself burns white-hot (as in a photograph).
      sp.limb[k] = 0.62 + 0.38 * Math.pow(nz, 0.5);
      sp.rim[k] = Math.min(1, Math.pow(1 - nz, 4) * 1.4);
    }
  }
  spheres.set(size, sp);
  return sp;
}

/** The sphere's radius, as a share of the canvas (the corona fills the rest). */
const RADIUS = 0.31;

function draw(canvas: HTMLCanvasElement, time: number) {
  const size = Math.round(Math.min(200, canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
  if (size < 8) return;
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let img = sunsDrawn.get(canvas);
  if (!img || img.width !== size) {
    img = ctx.createImageData(size, size);
    sunsDrawn.set(canvas, img);
  }
  const tex = surface();
  const sp = sphere(size);
  const [deep, mid, bright] = palette(Number(canvas.dataset.t ?? 0), Number(canvas.dataset.cold ?? 0));
  const danger = canvas.dataset.danger === '1';
  const seed = Number(canvas.dataset.seed ?? 0);
  const px = img.data;
  const c = size / 2;
  const R = size * RADIUS;
  const spin = time * 0.0000095 + seed / (Math.PI * 2);
  const flick = time * 0.0004;
  // The corona's flames round the rim, worked out once per frame (FLAMES directions), not per pixel.
  const flames = new Float32Array(FLAMES);
  for (let k = 0; k < FLAMES; k++) {
    const ang = (k / FLAMES) * Math.PI * 2;
    flames[k] = fbm3(Math.cos(ang) * 2.6 + flick, Math.sin(ang) * 2.6, flick * 0.6 + seed, 4);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      const i = k * 4;
      const row = sp.row[k];
      if (row >= 0) {
        // The surface, turned by the spin; dark, churning cells between bright plasma.
        const u = sp.lon[k] + spin;
        const raw = tex[row + (Math.floor((u - Math.floor(u)) * TW) % TW)];
        const s = Math.min(1, Math.max(0, (raw - 0.3) * 1.9));
        const v = Math.min(1, s * sp.limb[k]);
        const a = v < 0.5 ? v / 0.5 : (v - 0.5) / 0.5;
        const lo = v < 0.5 ? deep : mid, hi = v < 0.5 ? mid : bright;
        const w = sp.rim[k];
        px[i] = (lo[0] + (hi[0] - lo[0]) * a) * (1 - w) + 255 * w;
        px[i + 1] = (lo[1] + (hi[1] - lo[1]) * a) * (1 - w) + 246 * w;
        px[i + 2] = (lo[2] + (hi[2] - lo[2]) * a) * (1 - w) + 214 * w;
        px[i + 3] = 255;
      } else {
        // The corona: ragged flames licking round the edge, flickering.
        const dx = (x - c + 0.5) / R, dy = (y - c + 0.5) / R;
        const r = Math.sqrt(dx * dx + dy * dy);
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
        // White-hot at the edge, then orange flames reddening and thinning towards their tips (strong enough to read on the white board).
        const hot = Math.max(0, 1 - out * 3);
        const glow = Math.pow(1 - out, 1.6) * (0.65 + flame * 0.5);
        px[i] = 255 * hot + mid[0] * (1 - hot);
        px[i + 1] = 244 * hot + (mid[1] * (1 - out) + deep[1] * out) * (1 - hot);
        px[i + 2] = 200 * hot + (mid[2] * (1 - out) + deep[2] * out) * (1 - hot);
        px[i + 3] = Math.min(255, glow * 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
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
  }
  requestAnimationFrame(frame);
}

/** Start (or keep) drawing every sun canvas on the page; call after rendering. */
export function animateSuns() {
  const suns = document.querySelectorAll<HTMLCanvasElement>('canvas.sun3d');
  // Draw new canvases at once, so a re-render never shows an empty sun.
  suns.forEach((cv) => draw(cv, reduce() ? 0 : performance.now()));
  if (!running && suns.length) {
    running = true;
    requestAnimationFrame(frame);
  }
}
