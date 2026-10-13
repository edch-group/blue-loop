/**
 * The Captain's ship, as the campaign's menu [direction: the whole menu the ship floating through space side on at a
 * slight angle, the Captain standing atop it (as in the art); a click on a section moves the camera to an angle where
 * that is done, all on the same ship, still flying; very detailed models of the Captain and the ship; lit as the rest
 * of the game (not cel shaded)].
 *
 * The ship drifts on through the dust of space, rising and rolling a little, its engines burning and (while it is
 * still a wreck) smoke trailing from its wounds. The Captain stands at its foredeck's rail facing ahead, a boot up on it, the coat and scarf
 * streaming back in the slipstream. Three places on it are the menu's sections: the Captain (the hero panel), the ship
 * (its fitting), and its sensor array (research: the skill tree). Each has a camera that frames it beside its page.
 *
 * Modelled as the map's ships are (ship3d.ts's Mesh; box units, 40 to the model's 1: x along, y across, z up) and
 * lit by the same shader (nebula-objects.ts), so it belongs to the same game.
 */
import { SHIP_FRAG, SHIP_VERT } from './nebula-objects';
import { captainShipModel, seq } from './captain-ship';
import { captainModel, streamerModel } from './captain-model';
import { COMPANION_PLACES, companionModel } from './companion-models';
import type { CompanionId } from '../engine/companions';
import { Mesh, SHIP_STRIDE, type CaptainShipSpec, type RGB, type V3 } from './ship3d';
import { uiZoom } from './viewport';

export type BaseZone = 'hangar' | 'captain' | 'research' | CompanionId;
export const BASE_ZONES: BaseZone[] = ['hangar', 'captain', 'research'];

// ---- Matrices (column-major, as WebGL takes them) ----
type M4 = Float32Array;
function perspective(fov: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
function lookAt(eye: V3, target: V3): M4 {
  const f = norm3(sub3(target, eye));
  const r = norm3(cross3(f, [0, 1, 0]));
  const u = cross3(r, f);
  return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot3(r, eye), -dot3(u, eye), dot3(f, eye), 1]);
}
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const translate = (x: number, y: number, z: number): M4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const scale = (s: number): M4 => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
function rotX(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
function rotY(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
function rotZ(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
const IDENTITY = translate(0, 0, 0);
const apply = (m: M4, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
/** A point of the box (x along, y across, z up) in the model's own axes. */
const B = (x: number, y: number, z: number): V3 => [(x - 20) / 40, z / 40, (y - 12) / 40];

/** Where the Captain stands on the foredeck (box units), and the deck's height there. */
const STAND = { x: 32, y: 12 };

// ---- Planets in the sky ----
/** The planets going past: how far off (behind the ship), how high, how wide their pass, how long it takes, how big. */
const PLANETS = [
  { far: 40, up: 10, span: 30, period: 240, phase: 0.15, r: 2.2, tilt: 0.3, ring: false },
  { far: 56, up: 17, span: 40, period: 340, phase: 0.62, r: 3.4, tilt: -0.25, ring: true },
];
/** A planet: banded, soft (its cloud belts in a cool blue-grey and a warm sand, a pale cap), 1 across. */
function planetModel(): Float32Array {
  const m = new Mesh();
  const bands: RGB[] = [[0.78, 0.82, 0.88], [0.82, 0.8, 0.76], [0.74, 0.79, 0.86], [0.84, 0.81, 0.77], [0.77, 0.81, 0.87], [0.9, 0.91, 0.94]];
  const rings = 24, segs = 40;
  for (let i = 0; i < rings; i++) {
    const a0 = -Math.PI / 2 + (i / rings) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / rings) * Math.PI;
    const col = bands[Math.floor(((i + 0.5) / rings) * bands.length) % bands.length];
    for (let j = 0; j < segs; j++) {
      const b0 = (j / segs) * Math.PI * 2, b1 = ((j + 1) / segs) * Math.PI * 2;
      const pt = (a: number, b: number): V3 => B(20 + 20 * Math.cos(a) * Math.cos(b), 12 + 20 * Math.cos(a) * Math.sin(b), 20 * Math.sin(a));
      m.tri(pt(a0, b0), pt(a1, b1), pt(a0, b1), col, 3, [0, 0, 0]);
      m.tri(pt(a0, b0), pt(a1, b0), pt(a1, b1), col, 3, [0, 0, 0]);
    }
  }
  return new Float32Array(m.out);
}
/** A planet's ring: a thin pale band round it. */
function ringModel(): Float32Array {
  const m = new Mesh();
  m.ring(20, 12, 0, 34, 2.2, 0, [0.88, 0.84, 0.76], 1);
  m.ring(20, 12, 0, 29, 1.2, 0, [0.76, 0.74, 0.7], 1);
  return new Float32Array(m.out);
}

// ---- Particles: dust going by, smoke, the engines' glow, the blade's light ----
const SPRITE_VERT = `
attribute vec3 aPos; attribute vec2 aCorner; attribute vec4 aColor; attribute float aSize;
uniform mat4 uView; uniform mat4 uProj;
varying vec2 vUv; varying vec4 vColor;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  v.xy += aCorner * aSize;
  gl_Position = uProj * v;
  vUv = aCorner;
  vColor = aColor;
}`;
const SPRITE_FRAG = `
precision mediump float;
varying vec2 vUv; varying vec4 vColor;
void main() {
  float r = length(vUv);
  float a = (1.0 - smoothstep(0.0, 1.0, r)) * vColor.a;
  gl_FragColor = vec4(vColor.rgb * a, a);
}`;

/** One of the camera's framings: what it looks at, from which way, how far off, and where on screen that sits. */
interface Pose {
  target: V3;
  yaw: number;
  pitch: number;
  dist: number;
  /** How far the subject is set off centre (screen widths, - to the left), so the page beside it has room. */
  off: number;
}

/** A ship and its Captain on a canvas: hover a section, ask which is at a point, focus a section's camera. */
export class Base3d {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private spriteProg: WebGLProgram;
  private shipBuf: WebGLBuffer | null = null;
  private shipCount = 0;
  private capBuf: WebGLBuffer;
  private capCount: number;
  private tailBuf: WebGLBuffer;
  private tailCount: number;
  private spriteBuf: WebGLBuffer;
  private planetBuf: WebGLBuffer;
  private planetCount: number;
  private ringBuf: WebGLBuffer;
  private ringCount: number;
  private smoke: V3[] = [];
  private engines: V3[] = [];
  private deck = 8;
  private rail = { y: 15, z: 9.7 };
  private dish = 8.3;
  /** The companions aboard (companions.ts), each its figure's buffer and where it is now. */
  private crew: { id: CompanionId; buf: WebGLBuffer; count: number; m: M4 }[] = [];
  private raf = 0;
  private last = 0;
  private start = performance.now();
  private focused: BaseZone | null = null;
  private view: M4 = IDENTITY;
  private proj: M4 = IDENTITY;
  private eye: V3 = [0, 1, 6];
  private pose: Pose | null = null;
  private lastT = 0;
  private shipKey = '';
  private shipM: M4 = IDENTITY;
  private capM: M4 = IDENTITY;
  /**
   * Setting out [direction: one shot from the menu into the campaign's opening, no fading ship, no cutting camera]:
   * the camera the menu hands over on (as a view matrix and field of view: the campaign's first frame, seen in this
   * scene's own units), how far the hand-over has come (0 to 1, the land's pan's own), and where it set out from.
   */
  private handOver: { view: () => M4; fov: number; k: () => number; from?: { eye: V3; target: V3; fov: number; off: number } } | null = null;
  private dust: { p: V3; s: number; a: number }[] = [];
  /** Told after each frame (to lay the labels by their places). */
  onFrame: (() => void) | null = null;
  paused = false;

  private constructor(readonly canvas: HTMLCanvasElement, gl: WebGLRenderingContext, ship: CaptainShipSpec) {
    this.gl = gl;
    gl.getExtension('OES_standard_derivatives');
    this.prog = program(gl, SHIP_VERT, SHIP_FRAG.replace(/float flick = [^;]*;/, 'float flick = 1.0;'));
    this.spriteProg = program(gl, SPRITE_VERT, SPRITE_FRAG);
    const cap = captainModel(), tail = streamerModel();
    this.capBuf = this.buffer(cap);
    this.capCount = cap.length / SHIP_STRIDE;
    this.tailBuf = this.buffer(tail);
    this.tailCount = tail.length / SHIP_STRIDE;
    this.spriteBuf = gl.createBuffer()!;
    const planet = planetModel(), ring = ringModel();
    this.planetBuf = this.buffer(planet);
    this.planetCount = planet.length / SHIP_STRIDE;
    this.ringBuf = this.buffer(ring);
    this.ringCount = ring.length / SHIP_STRIDE;
    const r = seq(11);
    for (let i = 0; i < 90; i++) this.dust.push({ p: [(r() - 0.5) * 16, (r() - 0.5) * 7, (r() - 0.5) * 9 - 1], s: 0.008 + r() * 0.02, a: 0.15 + r() * 0.3 });
    this.setShip(ship);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  static mount(canvas: HTMLCanvasElement, ship: CaptainShipSpec): Base3d | null {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, depth: true });
    if (!gl) return null;
    return new Base3d(canvas, gl, ship);
  }

  private buffer(data: Float32Array) {
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  /** The ship as fitted and levelled (rebuilt only when that changes). */
  setShip(spec: CaptainShipSpec) {
    const key = JSON.stringify(spec);
    if (key === this.shipKey) return;
    this.shipKey = key;
    const s = captainShipModel(spec);
    if (this.shipBuf) this.gl.deleteBuffer(this.shipBuf);
    this.shipBuf = this.buffer(s.mesh);
    this.shipCount = s.mesh.length / SHIP_STRIDE;
    this.smoke = s.smoke;
    this.engines = s.engines;
    this.deck = s.deck;
    this.rail = s.rail;
    this.dish = s.dish;
  }

  /**
   * The ship flying in [direction: on first opening the campaign menu, the ship flying in from the left before
   * settling into its place]: from far off to the left, easing out as it comes to rest, its nose dipping as it slows.
   */
  private entry: { t0: number | null; dur: number } | null = null;
  /** Held off to the left (`go` false) until the scene is shown, then flown in (`arrive(dur, true)`). */
  arrive(dur: number, go = true) {
    this.entry = { t0: go ? this.time() : null, dur };
  }
  /** Whether the ship is still flying in (the scene drawn every frame meanwhile). */
  get entering(): boolean {
    return !!this.entry;
  }

  /** The companions aboard (each drawn where it stands; built once). */
  setCrew(ids: CompanionId[]) {
    if (ids.join() === this.crew.map((c) => c.id).join()) return;
    for (const c of this.crew) this.gl.deleteBuffer(c.buf);
    this.crew = ids.map((id) => {
      const data = companionModel(id);
      return { id, buf: this.buffer(data), count: data.length / SHIP_STRIDE, m: IDENTITY };
    });
  }

  /** (A section under the pointer: its label lights, on the page; the scene itself is left as it is.) */
  hover(_zone: BaseZone | null) {}

  /** Frame a section (its page open beside it), or (null) the whole ship. */
  focus(zone: BaseZone | null) {
    this.focused = zone;
  }

  private time() {
    return (performance.now() - this.start) / 1000;
  }

  /** The ship's size on the canvas: 4.2 long. Where each section is, on the ship (its own units, before placing). */
  static readonly SHIP_SCALE = 4.2;
  private spot(zone: BaseZone): V3 {
    if (zone === 'captain') return apply(this.capM, B(20, 12, 30));
    if (zone === 'lancer' || zone === 'engineer' || zone === 'defector') {
      const c = this.crew.find((x) => x.id === zone);
      return c ? apply(c.m, B(20, 12, zone === 'engineer' ? 20 : 28)) : apply(this.capM, B(20, 12, 30));
    }
    if (zone === 'research') return apply(this.shipM, B(5.5, 12, 12));
    return apply(this.shipM, B(17, 12, 5));
  }
  private reach(zone: BaseZone) {
    return zone === 'research' ? 0.38 : zone === 'hangar' ? 1.9 : 0.32;
  }

  /** The section at a point on the canvas (CSS pixels from its corner, as laid out), if any (the smallest wins). */
  zoneAt(x: number, y: number): BaseZone | null {
    let best: BaseZone | null = null, bestK = 1;
    for (const z of ['captain', ...this.crew.map((c) => c.id), 'research', 'hangar'] as BaseZone[]) {
      const c = this.toScreen(this.spot(z)), e = this.toScreen(sub3(this.spot(z), [0, this.reach(z), 0]));
      if (!c || !e) continue;
      const r = Math.abs(e.y - c.y);
      const k = Math.hypot(x - c.x, y - c.y) / (z === 'hangar' ? r * 1.0 : r);
      const flat = z === 'hangar' ? Math.hypot((x - c.x) / (r * 2.6), (y - c.y) / (r * 0.75)) : k;
      if (flat < bestK) {
        bestK = flat;
        best = z;
        if (z !== 'hangar') break;
      }
    }
    return best;
  }

  /** The run begins: the camera eases to `view` (a rigid view of this scene) and `fov`, as `k` goes from 0 to 1. */
  handTo(view: () => M4, fov: number, k: () => number) {
    this.handOver = { view, fov, k };
  }

  /**
   * Where a point by the ship (box units: x along, y across, z up) is on the canvas (CSS pixels, as laid out): where
   * the ship lies at rest, not as it bobs and rolls.
   */
  shipScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    // (Seen from the camera's own framing of the whole ship, still: not as it sways or moves to a section.)
    const lw = this.canvas.clientWidth, lh = this.canvas.clientHeight;
    if (!lw || !lh) return null;
    const fov = (32 * Math.PI) / 180, aspect = lw / lh;
    const focused = this.focused;
    this.focused = null;
    const g = this.goal(aspect, Math.tan(fov / 2));
    this.focused = focused;
    const dir: V3 = [Math.sin(g.yaw) * Math.cos(g.pitch), Math.sin(g.pitch), Math.cos(g.yaw) * Math.cos(g.pitch)];
    const eye: V3 = [g.target[0] + dir[0] * g.dist, g.target[1] + dir[1] * g.dist, g.target[2] + dir[2] * g.dist];
    const proj = perspective(fov, aspect, 0.05, 140);
    proj[8] = -g.off * 2;
    return this.toScreen(apply(scale(Base3d.SHIP_SCALE), B(x, y, z)), lookAt(eye, g.target), proj);
  }

  /** Where a section is on the canvas (CSS pixels, as laid out): the point its node's stem runs to. */
  anchorAt(zone: BaseZone): { x: number; y: number } | null {
    return this.toScreen(this.spot(zone));
  }

  /** Where a section's label goes on the canvas (CSS pixels, as laid out). */
  labelAt(zone: BaseZone): { x: number; y: number } | null {
    const p = this.spot(zone);
    const lift = zone === 'captain' ? 0.62 : zone === 'research' ? 0.5 : -0.95;
    return this.toScreen([p[0], p[1] + lift, p[2]]);
  }

  private toScreen(p: V3, v: M4 = this.view, P: M4 = this.proj): { x: number; y: number } | null {
    const ex = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12];
    const ey = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13];
    const ez = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14];
    if (ez >= -0.01) return null;
    const w = -ez;
    return { x: (((P[0] * ex + P[8] * ez) / w + 1) / 2) * this.canvas.clientWidth, y: ((1 - (P[5] * ey) / w) / 2) * this.canvas.clientHeight };
  }

  private loop(now: number) {
    if (!this.canvas.isConnected) return this.destroy();
    this.raf = requestAnimationFrame(this.loop);
    // (Handing over to the campaign, every frame: its camera moves with the land's, which is drawn every frame too.)
    if ((now - this.last < 32 && !this.handOver && !this.entry) || this.paused) return;
    this.last = now;
    this.draw();
    this.onFrame?.();
  }

  /** The camera's framing for a section (or the whole ship), for this canvas's shape. */
  private goal(aspect: number, half: number): Pose {
    const z = this.focused;
    const narrow = Math.min(1, aspect / 1.6);
    // (The Captain in the middle of the screen, low, his skill tree starting above his head and wrapping round him.)
    if (z === 'captain') return { target: sub3(this.spot('captain'), [0, -0.14, 0]), yaw: 1.0, pitch: 0.02, dist: 2.0 / narrow, off: 0 };
    // (A companion as the Captain is: in the middle, low, their tree above and round them.)
    if (z && z !== 'hangar' && z !== 'research') return { target: sub3(this.spot(z), [0, -0.14, 0]), yaw: 1.0, pitch: 0.02, dist: 2.0 / narrow, off: 0 };
    if (z === 'hangar') return { target: this.spot('hangar'), yaw: -0.45, pitch: 0.48, dist: 9 / narrow, off: -0.3 };
    // (Enlightenment is the Stellari, out on the land: the camera turns from the ship, which slides away to the left.)
    if (z === 'research') return { target: [7, 1.4, -2], yaw: -0.52, pitch: 0.1, dist: 6, off: 0 };
    // The whole ship, side on and a little from ahead and below (as the art has it), all of it in view.
    const dist = Math.max(3.7 / (half * aspect), 2.4 / half);
    // (A little to the left, the menu's options arcing round its bow on the right.)
    return { target: [-0.3, 0.74, 0], yaw: -0.52, pitch: 0.1, dist, off: -0.1 };
  }

  private draw() {
    const gl = this.gl, c = this.canvas;
    const lw = c.clientWidth, lh = c.clientHeight;
    if (!lw || !lh) return;
    // (Over the land's own scene: within about a 1440p screen's pixels in all.)
    let dpr = Math.min(1.5, window.devicePixelRatio || 1) * uiZoom();
    if (lw * lh * dpr * dpr > 3e6) dpr = Math.sqrt(3e6 / (lw * lh));
    const w = Math.round(lw * dpr), h = Math.round(lh * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const t = this.time();
    // The ship drifts on: rising and falling, rolling and pitching a little.
    const S = Base3d.SHIP_SCALE;
    // (Handing over to the campaign, it settles still, as the campaign's first frame has it.)
    const ho = this.handOver ? Math.max(0, Math.min(1, this.handOver.k())) : 0;
    const sway = 1 - ho;
    // (Flying in [direction: drifting in slowly whilst bobbing]: off to the left, drifting gently to its place, rising
    // and falling as it comes, the bob settling into its idle one.)
    let ex = 0, ey = 0, tip = 0;
    if (this.entry) {
      const k = this.entry.t0 === null ? 0 : Math.min(1, (t - this.entry.t0) / this.entry.dur);
      // (Starting just in view, so it shows near at once, bobbing from the first frame [direction: bobbing in right
      // from the start, slower still, visible near-instantly].)
      const left = 1 - Math.sin((Math.PI / 2) * k);
      const ride = 1 - Math.max(0, Math.min(1, (k - 0.6) / 0.4)) ** 2;
      ex = -4 * left;
      ey = 0.4 * left + 0.12 * Math.sin(t * 1.5) * ride;
      tip = -0.03 * left + 0.025 * Math.cos(t * 1.5) * ride;
      if (k >= 1) this.entry = null;
    }
    this.shipM = mul(translate(ex, ey + 0.05 * Math.sin(t * 0.7) * sway, 0), mul(rotZ(tip), mul(rotX(0.035 * Math.sin(t * 0.5) * sway), mul(rotZ(0.025 * Math.sin(t * 0.6 + 1) * sway), scale(S)))));
    // The Captain on the foredeck, facing ahead and a little toward us.
    const at = B(STAND.x, STAND.y, this.deck);
    this.capM = mul(this.shipM, mul(translate(at[0], at[1], at[2]), mul(rotY(1.3), mul(scale(0.7 / S), translate(-B(20, 12, 0)[0], 0, -B(20, 12, 0)[2])))));
    // The tails and scarf streaming: swung from the waist, a gust now and then.
    const gust = 0.08 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 5.1 + 1);
    const pivot = B(20, 11, 23);
    const tailM = mul(this.capM, mul(translate(pivot[0], pivot[1], pivot[2]), mul(rotZ(-gust), mul(rotX(gust * 0.5), translate(-pivot[0], -pivot[1], -pivot[2])))));

    // The camera eases toward its framing.
    const aspect = lw / lh;
    const fov = (32 * Math.PI) / 180;
    const half = Math.tan(fov / 2);
    const g = this.goal(aspect, half);
    if (!this.pose) this.pose = { ...g, target: [...g.target] as V3 };
    const dt = Math.min(0.2, t - this.lastT);
    this.lastT = t;
    const p = this.pose, e = 1 - Math.exp(-dt * 2.6);
    for (let i = 0; i < 3; i++) p.target[i] += (g.target[i] - p.target[i]) * e;
    p.yaw += (g.yaw - p.yaw) * e;
    p.pitch += (g.pitch - p.pitch) * e;
    p.dist += (g.dist - p.dist) * e;
    p.off += (g.off - p.off) * e;
    const yaw = p.yaw + 0.03 * Math.sin(t * 0.17);
    const dir: V3 = [Math.sin(yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.cos(yaw) * Math.cos(p.pitch)];
    this.eye = [p.target[0] + dir[0] * p.dist, p.target[1] + dir[1] * p.dist, p.target[2] + dir[2] * p.dist];
    let target: V3 = p.target, fovNow = fov, off = p.off;
    const hand = this.handOver;
    if (hand) {
      // From where it was to the campaign's first frame: the eye and what it looks at eased along, the lens and the
      // framing with them; at the end, exactly the view handed over.
      if (!hand.from) hand.from = { eye: [...this.eye] as V3, target: [...p.target] as V3, fov, off: p.off };
      const v = hand.view();
      const r: V3 = [v[0], v[4], v[8]], u: V3 = [v[1], v[5], v[9]], f: V3 = [-v[2], -v[6], -v[10]];
      const eye1: V3 = [0, 1, 2].map((i) => -v[12] * r[i] - v[13] * u[i] + v[14] * f[i]) as V3;
      const d = Math.hypot(eye1[0], eye1[1], eye1[2]) || 1;
      const target1: V3 = [eye1[0] + f[0] * d, eye1[1] + f[1] * d, eye1[2] + f[2] * d];
      const lerp = (a: V3, b: V3): V3 => [a[0] + (b[0] - a[0]) * ho, a[1] + (b[1] - a[1]) * ho, a[2] + (b[2] - a[2]) * ho];
      this.eye = lerp(hand.from.eye, eye1);
      target = lerp(hand.from.target, target1);
      fovNow = hand.from.fov + (hand.fov - hand.from.fov) * ho;
      off = hand.from.off * (1 - ho);
    }
    this.view = lookAt(this.eye, target);
    this.proj = perspective(fovNow, aspect, 0.05, 140);
    // (Set off centre by shearing the projection: the subject moves aside, its perspective unchanged.)
    this.proj[8] = -off * 2;

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    const pr = this.prog;
    gl.useProgram(pr);
    const u = (n: string) => gl.getUniformLocation(pr, n);
    gl.uniformMatrix4fv(u('uView'), false, this.view);
    gl.uniformMatrix4fv(u('uProj'), false, this.proj);
    gl.uniform3fv(u('uEye'), this.eye);
    gl.uniform3f(u('uColor'), 0.86, 0.62, 0.26);
    gl.uniform1f(u('uTime'), t);
    gl.uniform1f(u('uAlpha'), 1);
    gl.uniform1f(u('uBurn'), 0.6);
    const attrs: [string, number, number][] = [['aPos', 3, 0], ['aNorm', 3, 3], ['aCol', 3, 6], ['aMat', 1, 9]];
    const locs = attrs.map(([n]) => gl.getAttribLocation(pr, n));
    const drawMesh = (buf: WebGLBuffer | null, count: number, model: M4) => {
      if (!buf) return;
      gl.uniformMatrix4fv(u('uModel'), false, model);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      attrs.forEach(([, size, off], i) => {
        if (locs[i] < 0) return;
        gl.enableVertexAttribArray(locs[i]);
        gl.vertexAttribPointer(locs[i], size, gl.FLOAT, false, SHIP_STRIDE * 4, off * 4);
      });
      gl.drawArrays(gl.TRIANGLES, 0, count);
    };
    drawMesh(this.shipBuf, this.shipCount, this.shipM);
    drawMesh(this.capBuf, this.capCount, this.capM);
    drawMesh(this.tailBuf, this.tailCount, tailM);
    // The companions, each in their place: Kaelen on the near rail, Mara over the sensor dish, Vey'Sharr flying alongside
    // (rising and falling, drifting and rolling on its own, not with the ship).
    for (const c of this.crew) {
      const pl = COMPANION_PLACES[c.id];
      const k = pl.size / S, a = pl.anchor;
      const at: V3 =
        pl.on === 'rail'
          ? B(pl.x, this.rail.y, this.rail.z)
          : pl.on === 'dish'
            ? B(pl.x, pl.y, this.dish)
            : B(pl.x + 0.5 * Math.sin(t * 0.37), pl.y + 0.3 * Math.sin(t * 0.29 + 2), pl.z + 0.9 * Math.sin(t * 0.83 + 1.7));
      const o = B(a[0], a[1], a[2]);
      const local = mul(rotY(pl.turn), mul(scale(k), translate(-o[0], -o[1], -o[2])));
      c.m =
        pl.on === 'air'
          ? mul(translate(ex, ey, 0), mul(scale(S), mul(translate(at[0], at[1], at[2]), mul(rotX(0.06 * Math.sin(t * 0.61)), mul(rotZ(0.07 * Math.sin(t * 0.83 + 2.6)), local)))))
          : mul(this.shipM, mul(translate(at[0], at[1], at[2]), local));
      drawMesh(c.buf, c.count, c.m);
    }
    // Planets far off in the sky, going slowly past as the ship flies on [direction: planets going past slowly in the
    // background]: along a line far behind the ship, right to left, each in its turn.
    {
      const yaw = -0.52, fwd: V3 = [-Math.sin(yaw), 0, -Math.cos(yaw)], right: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
      for (const pl of PLANETS) {
        const k = (((t / pl.period + pl.phase) % 1) + 1) % 1;
        const across = (0.5 - k) * 2 * pl.span;
        const at: V3 = [fwd[0] * pl.far + right[0] * across, pl.up, fwd[2] * pl.far + right[2] * across];
        // (Handing over to the campaign, they dwindle away: its sky has none.)
        const pr = pl.r * (1 - ho);
        if (pr < 0.01) continue;
        drawMesh(this.planetBuf, this.planetCount, mul(translate(at[0], at[1], at[2]), mul(rotY(t * 0.02 + pl.phase * 6), mul(rotZ(pl.tilt), scale(pr)))));
        if (pl.ring) drawMesh(this.ringBuf, this.ringCount, mul(translate(at[0], at[1], at[2]), mul(rotZ(pl.tilt + 0.35), mul(rotX(0.25), scale(pr)))));
      }
    }
    locs.forEach((l) => l >= 0 && gl.disableVertexAttribArray(l));

    this.drawSprites(t);
  }

  /** The dust going by, the smoke from the ship's wounds, its engines' glow, and the light round the blade. */
  private drawSprites(t: number) {
    const gl = this.gl;
    const out: number[] = [];
    const quad = (p: V3, size: number, c: [number, number, number, number]) => {
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) out.push(p[0], p[1], p[2], cx, cy, c[0], c[1], c[2], c[3], size);
    };
    // Dust: drifting past astern (the ship flies on ahead), wrapping round.
    for (const d of this.dust) {
      const x = ((((d.p[0] - t * 0.9 * (0.6 + d.s * 30)) % 16) + 24) % 16) - 8;
      quad([x, d.p[1] + 0.5, d.p[2]], d.s, [0.42, 0.47, 0.6, d.a * (1 - (this.handOver ? Math.max(0, Math.min(1, this.handOver.k())) : 0))]);
    }
    // Engines: a soft glow behind each bell.
    for (const e of this.engines) quad(apply(this.shipM, [e[0] - 0.01, e[1], e[2]]), 0.17 + 0.01 * Math.sin(t * 9), [1, 0.78, 0.48, 0.55]);
    // Smoke: puffs leaving each wound, drifting astern and up, swelling and fading.
    for (const s of this.smoke) {
      const from = apply(this.shipM, s);
      for (let i = 0; i < 10; i++) {
        const age = (t * 0.45 + i / 10) % 1;
        quad([from[0] - age * 1.6, from[1] + age * 0.5, from[2] + Math.sin(i * 3.1) * age * 0.15], 0.06 + age * 0.22, [0.35, 0.34, 0.36, 0.42 * (1 - age) * Math.min(1, age * 8)]);
      }
    }
    const data = new Float32Array(out);
    const sp = this.spriteProg;
    gl.useProgram(sp);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uProj'), false, this.proj);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const a = (n: string) => gl.getAttribLocation(sp, n);
    const layout: [string, number, number][] = [['aPos', 3, 0], ['aCorner', 2, 3], ['aColor', 4, 5], ['aSize', 1, 9]];
    for (const [n, size, off] of layout) {
      const l = a(n);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, 40, off * 4);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 10);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    for (const [n] of layout) gl.disableVertexAttribArray(a(n));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return p;
}

// (The matrix helpers and shader set-up, for the other small scenes drawn with the ship's materials: loot3d.ts.)
export { lookAt, mul, perspective, program, rotX, rotY, rotZ, scale, translate, type M4 };
