/**
 * The campaign map's nebula, and the 3D space the map itself lies in, drawn in the battle board's schematic
 * style so the map, the nebula and the ground beneath read as one picture.
 *
 * Its shape (nebula-geometry.ts, worked out once per universe in a worker) is a soft cloud of gas: billows
 * heaped along a loose spine, a pillar or two, wisps streaming off and puffs drifting round it, and motes of
 * dust, with channels cleared through it where the strip's routes run. The gas is drawn as the board's paper,
 * softly shaded, with schematic contour lines and an ink outline; a faint shimmer in the board's gold and the
 * routes' blue plays over its edges. The body breathes, the wisps wander, the dust rises. It floats over a
 * floor reaching to the horizon: the board's dotted grid and schematic rings.
 *
 * The strip of systems lies on a flat plane through the gas (PLANE_Y). The map's own elements (stars, routes,
 * rings, ships) stay HTML, laid on that plane by a CSS transform worked out from this camera (campaign.ts), so
 * they stand exactly where the gas is drawn. The gas is drawn twice: once behind the map (everything), and
 * once over it, but only the gas on the camera's side of the plane, so a pillar between the eye and a system
 * hides it. The player navigates: a drag orbits, the wheel or a pinch zooms toward the pointer, a right-drag or
 * a two-finger drag pans.
 */

import { buildNebula, type Geometry, type Strip } from './nebula-geometry';
import { MapObjects, type MapObject } from './nebula-objects';

export type { Strip, MapObject };

/** The board's paper (#f4f3ef), which everything fades into. */
const PAPER = [0.957, 0.953, 0.937];
/** Where the floor lies, below the gas. */
const FLOOR_Y = -1.2;
/** The height of the plane the strip of systems lies on. */
export const PLANE_Y = 0;
/** How wide the strip is in the nebula's space (its map units are scaled to this). */
export const STRIP_WIDTH = 4.4;
const FOV = (36 * Math.PI) / 180;


const geometries = new Map<number, Promise<Geometry>>();

/** A universe's nebula, worked out in a worker (or here, where workers are unavailable), once per seed. */
function geometry(seed: number, strip: Strip): Promise<Geometry> {
  let p = geometries.get(seed);
  if (!p) {
    p = new Promise<Geometry>((resolve) => {
      const here = () => setTimeout(() => resolve(buildNebula(seed, strip)), 0);
      try {
        const w = new Worker(new URL('./nebula.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<Geometry>) => {
          resolve({ mesh: e.data.mesh, motes: e.data.motes });
          w.terminate();
        };
        w.onerror = () => {
          w.terminate();
          here();
        };
        w.postMessage({ seed, strip });
      } catch {
        here();
      }
    });
    geometries.set(seed, p);
  }
  return p;
}

// ---------- shaders ----------

const COMMON = `
uniform mat4 uView; uniform mat4 uProj; uniform float uTime;
`;

const GAS_VERT = COMMON + `
attribute vec3 aPos; attribute vec3 aNormal; attribute float aFree;
varying vec3 vWorld; varying vec3 vNormal; varying float vDist;
void main() {
  vec3 p = aPos;
  // The body breathes; loose plumes wander (neighbouring points move alike, so a plume moves as one).
  float ph = dot(aPos, vec3(1.3, 0.7, 1.1));
  p += aNormal * 0.018 * sin(uTime * 0.6 + aPos.x * 2.0 + aPos.y * 3.0);
  p += aFree * vec3(sin(uTime * 0.31 + ph), 0.6 * sin(uTime * 0.23 + ph * 1.7) + 0.4, cos(uTime * 0.27 + ph * 1.3)) * 0.09;
  vec4 v = uView * vec4(p, 1.0);
  gl_Position = uProj * v;
  vWorld = p;
  vNormal = aNormal;
  vDist = -v.z;
}`;

const GAS_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 vWorld; varying vec3 vNormal; varying float vDist;
uniform vec3 uPaper; uniform vec3 uEye; uniform float uTime; uniform float uFade; uniform float uFront;
void main() {
  // Over the map, only the gas on the camera's side of its plane (y = 0): what stands between the eye and it.
  if (uFront > 0.5 && vWorld.y * uEye.y <= 0.0) discard;
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vWorld);
  float ndv = abs(dot(n, v));
  // Lit as the reference is, with three soft lights for an obvious 3D form: a key from above and to the right,
  // a fill from the left, and a rim from behind that brightens its edges. Monochrome, in the board's own greys:
  // the paper's white where lit, its cool slate in shadow.
  float key = max(0.0, dot(n, normalize(vec3(0.55, 0.75, 0.35))));
  float fill = max(0.0, dot(n, normalize(vec3(-0.7, 0.25, 0.4)))) * 0.35;
  float back = pow(1.0 - ndv, 3.0) * max(0.0, dot(n, normalize(vec3(-0.1, 0.4, -0.9))) + 0.35);
  float light = clamp(0.12 + 0.75 * key * key * (3.0 - 2.0 * key) + fill + back * 0.6, 0.0, 1.0);
  vec3 c = mix(vec3(0.62, 0.655, 0.72), vec3(0.992, 0.99, 0.982), light);
  // The faintest shimmer of the board's gold and the routes' blue, along its lit rim, drifting slowly.
  float rim = pow(1.0 - ndv, 2.5);
  float patch = smoothstep(0.45, 0.95, 0.5 + 0.5 * sin(vWorld.x * 1.1 + vWorld.z * 1.7 + vWorld.y * 0.8 + uTime * 0.18));
  vec3 tint = mix(vec3(0.87, 0.68, 0.40), vec3(0.58, 0.70, 0.92), 0.5 + 0.5 * sin(vWorld.y * 2.0 + vWorld.x * 0.9 + uTime * 0.3));
  c = mix(c, tint, rim * patch * 0.35);
  // An ink line where the gas turns away from the eye: its outline.
  float edge = 1.0 - smoothstep(0.06, 0.2, ndv);
  c = mix(c, vec3(0.40, 0.46, 0.60), edge * 0.55);
  c = mix(c, uPaper, smoothstep(4.5, 22.0, vDist));
  gl_FragColor = uFront > 0.5 ? vec4(c, 1.0) * uFade : vec4(mix(uPaper, c, uFade), 1.0);
}`;

const FLOOR_VERT = COMMON + `
attribute vec3 aPos;
varying vec3 vWorld; varying float vDist;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  gl_Position = uProj * v;
  vWorld = aPos;
  vDist = -v.z;
}`;

/** The board: its paper, dotted grid and schematic rings, with the gas's soft shadow under it. */
const FLOOR_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 vWorld; varying float vDist;
uniform vec3 uPaper; uniform float uFade;
void main() {
  vec2 p = vWorld.xz;
  vec3 c = vec3(0.985, 0.983, 0.975);
  float S = 0.17;
  vec2 g = abs(fract(p / S + 0.5) - 0.5) * S;
  float dd = length(g);
  float w = max(fwidth(dd), 1e-4);
  float dotv = 1.0 - smoothstep(0.011 - w, 0.011 + w, dd);
  float r = length(p);
  float RS = 0.42;
  float rd = abs(fract(r / RS + 0.5) - 0.5) * RS;
  float ring = (1.0 - smoothstep(0.0, max(fwidth(r), 1e-4) * 1.1, rd)) * step(0.55, r);
  float near = 1.0 - smoothstep(6.0, 14.0, vDist);
  c = mix(c, vec3(0.47, 0.53, 0.67), dotv * 0.42 * near);
  c = mix(c, vec3(0.55, 0.59, 0.69), ring * 0.38 * near);
  c *= 1.0 - 0.07 * uFade * exp(-dot(p * vec2(0.55, 1.0), p * vec2(0.55, 1.0)) * 1.2);
  c = mix(c, uPaper, smoothstep(4.5, 22.0, vDist));
  gl_FragColor = vec4(c, 1.0);
}`;

const MOTE_VERT = COMMON + `
attribute vec3 aPos; attribute float aPhase; attribute float aSize;
uniform float uPx; uniform vec3 uEye; uniform float uFront;
varying float vAlpha;
void main() {
  // Each mote rises slowly and wanders, fading in at the bottom of its climb and out at the top.
  float t = fract(uTime * 0.025 + aPhase);
  vec3 p = aPos + vec3(sin(uTime * 0.3 + aPhase * 6.28) * 0.05, t * 0.5 - 0.25, cos(uTime * 0.27 + aPhase * 9.0) * 0.05);
  vec4 v = uView * vec4(p, 1.0);
  gl_Position = uProj * v;
  vAlpha = sin(t * 3.14159) * (1.0 - smoothstep(4.5, 12.0, -v.z));
  if (uFront > 0.5 && p.y * uEye.y <= 0.0) vAlpha = 0.0;
  gl_PointSize = aSize * uPx * clamp(4.6 / -v.z, 0.6, 1.6);
}`;

const MOTE_FRAG = `
precision mediump float;
varying float vAlpha;
uniform float uFade;
void main() {
  float a = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5)) * vAlpha * 0.55 * uFade;
  gl_FragColor = vec4(vec3(0.47, 0.53, 0.67) * a, a);
}`;

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

/** Where the camera is: what it looks at, from which way, how far off. */
interface Pose { x: number; y: number; z: number; yaw: number; pitch: number; dist: number }

/** The camera as drawn this frame: its matrices, where it is, its axes, and the canvas's size in CSS pixels. */
export interface Camera {
  view: Float32Array;
  proj: Float32Array;
  eye: number[];
  right: number[];
  up: number[];
  forward: number[];
  /** What it looks at. */
  target: number[];
  width: number;
  height: number;
}

/** One canvas the scene is drawn on (its own WebGL context): behind the map, or over it. */
class Layer {
  gl: WebGLRenderingContext;
  private gasProg: WebGLProgram;
  private floorProg?: WebGLProgram;
  private moteProg: WebGLProgram;
  private gasBuf: WebGLBuffer;
  private floorBuf?: WebGLBuffer;
  private moteBuf: WebGLBuffer;
  private gasCount = 0;
  private moteCount = 0;
  /** The map's own things in 3D (stars, black holes and the rest): on the layer over the map. */
  objects: MapObjects | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly front: boolean) {
    const gl = canvas.getContext('webgl', front ? { antialias: true, alpha: true, premultipliedAlpha: true, depth: true } : { antialias: true, alpha: false, depth: true });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    gl.getExtension('OES_standard_derivatives');
    const program = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
      gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('nebula shader');
      return p;
    };
    this.gasProg = program(GAS_VERT, GAS_FRAG);
    this.moteProg = program(MOTE_VERT, MOTE_FRAG);
    this.gasBuf = gl.createBuffer()!;
    this.moteBuf = gl.createBuffer()!;
    if (!front) {
      this.floorProg = program(FLOOR_VERT, FLOOR_FRAG);
      this.floorBuf = gl.createBuffer()!;
      const F = 40;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-F, FLOOR_Y, -F, F, FLOOR_Y, -F, F, FLOOR_Y, F, -F, FLOOR_Y, -F, F, FLOOR_Y, F, -F, FLOOR_Y, F]), gl.STATIC_DRAW);
    }
  }

  upload(g: Geometry) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gasBuf);
    gl.bufferData(gl.ARRAY_BUFFER, g.mesh, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.moteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, g.motes, gl.STATIC_DRAW);
    this.gasCount = g.mesh.length / 7;
    this.moteCount = g.motes.length / 5;
  }

  draw(cam: Camera, time: number, fade: number) {
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    gl.viewport(0, 0, w, h);
    if (this.front) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    const use = (p: WebGLProgram, buf: WebGLBuffer, attrs: [string, number][]) => {
      gl.useProgram(p);
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uProj'), false, cam.proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uView'), false, cam.view);
      gl.uniform1f(gl.getUniformLocation(p, 'uTime'), time);
      gl.uniform1f(gl.getUniformLocation(p, 'uFade'), fade);
      gl.uniform3f(gl.getUniformLocation(p, 'uPaper'), PAPER[0], PAPER[1], PAPER[2]);
      gl.uniform3f(gl.getUniformLocation(p, 'uEye'), cam.eye[0], cam.eye[1], cam.eye[2]);
      gl.uniform1f(gl.getUniformLocation(p, 'uFront'), this.front ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const stride = attrs.reduce((s, [, n]) => s + n, 0) * 4;
      let off = 0;
      const used: number[] = [];
      for (const [name, n] of attrs) {
        const loc = gl.getAttribLocation(p, name);
        if (loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off);
          used.push(loc);
        }
        off += n * 4;
      }
      return () => used.forEach((l) => gl.disableVertexAttribArray(l));
    };
    let done: () => void;
    if (this.floorProg && this.floorBuf) {
      done = use(this.floorProg, this.floorBuf, [['aPos', 3]]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      done();
    }
    if (this.gasCount) {
      done = use(this.gasProg, this.gasBuf, [['aPos', 3], ['aNormal', 3], ['aFree', 1]]);
      gl.drawArrays(gl.TRIANGLES, 0, this.gasCount);
      done();
    }
    // The map's things, behind whatever gas lies between them and the eye.
    this.objects?.draw(cam, time, 1);
    if (!this.gasCount) return;
    // The dust: blended over, never hiding anything (over the map, only the motes on the camera's side).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    done = use(this.moteProg, this.moteBuf, [['aPos', 3], ['aPhase', 1], ['aSize', 1]]);
    gl.uniform1f(gl.getUniformLocation(this.moteProg, 'uPx'), dpr);
    gl.drawArrays(gl.POINTS, 0, this.moteCount);
    done();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  lose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export class Nebula {
  private layers: Layer[];
  private seed = -1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Where the camera is, and where it is easing to after a reset. */
  private pose: Pose = { x: 0, y: PLANE_Y, z: 0, yaw: 0, pitch: 0.85, dist: 5 };
  private glide: Pose | null = null;
  private moved = true;
  private homed = false;
  /** How far the nebula has faded in since its shape arrived. */
  private fade = 0;
  /** Told whenever the camera moves, with the camera as drawn (the map lays itself on the plane from it). */
  onCamera: ((cam: Camera) => void) | null = null;
  camera: Camera | null = null;

  constructor(readonly back: HTMLCanvasElement, readonly front: HTMLCanvasElement | null) {
    this.layers = [new Layer(back, false)];
    if (front) {
      try {
        this.layers.push(new Layer(front, true));
      } catch {
        // (Without the layer over the map, the gas simply never hides a system.)
      }
    }
    const top = this.layers[this.layers.length - 1];
    try {
      top.objects = new MapObjects(top.gl);
    } catch {
      top.objects = null;
    }
    this.wake();
  }

  /** Which universe's nebula to show (built once per seed, with channels cleared for the strip). */
  show(seed: number, strip: Strip) {
    if (seed !== this.seed) {
      this.seed = seed;
      void geometry(seed, strip).then((g) => {
        if (this.seed !== seed) return;
        for (const l of this.layers) l.upload(g);
        // Fade in (at once if motion is reduced).
        this.fade = this.reduce ? 1 : 0;
        this.wake();
      });
    }
    if (!this.homed && this.back.clientWidth) {
      this.homed = true;
      this.pose = this.home();
      this.moved = true;
    }
    this.wake();
  }

  /** The map's things to draw in 3D (stars, black holes and the rest), as they stand now. */
  setObjects(list: MapObject[]) {
    const top = this.layers[this.layers.length - 1];
    top.objects?.set(list);
    this.wake();
  }

  /** Whether the map's things are drawn in 3D here (so the page's own drawings of them can be put away). */
  get drawsObjects(): boolean {
    return !!this.layers[this.layers.length - 1].objects;
  }

  /** The camera's resting place: looking down on the whole strip at a slant, far enough off to see all of it. */
  private home(): Pose {
    const c = this.back;
    const aspect = (c.clientWidth || 16) / (c.clientHeight || 10);
    const half = STRIP_WIDTH / 2 + 0.3;
    const dist = Math.max(3, (half / (Math.tan(FOV / 2) * aspect)) * 1.1);
    return { x: 0, y: PLANE_Y, z: 0.1, yaw: 0, pitch: 0.85, dist };
  }

  /** How far off the camera rests (marks on the map grow a little as it closes in from there). */
  get homeDist(): number {
    return this.home().dist;
  }

  /** Whether the camera has been moved from its resting place (so a way back is worth offering). */
  get away(): boolean {
    const h = this.home(), p = this.pose;
    return Math.abs(p.yaw - h.yaw) > 0.05 || Math.abs(p.pitch - h.pitch) > 0.05 || Math.abs(p.dist / h.dist - 1) > 0.05 || Math.hypot(p.x - h.x, p.z - h.z) > 0.1;
  }

  /** Back to the resting place, gliding (the long way round never: the turn back is the short one). */
  reset() {
    const h = this.home();
    const turn = Math.PI * 2;
    h.yaw = this.pose.yaw + ((((h.yaw - this.pose.yaw) % turn) + turn * 1.5) % turn) - turn / 2;
    this.glide = h;
    this.wake();
  }

  /** Orbit by a drag (screen pixels): sideways turns round, up and down tilts. */
  orbit(dx: number, dy: number) {
    this.glide = null;
    this.pose.yaw -= dx * 0.005;
    this.pose.pitch = Math.max(0.12, Math.min(1.45, this.pose.pitch + dy * 0.004));
    this.changed();
  }

  /** Slide the camera over the plane by a drag (screen pixels), so the map follows the finger. */
  pan(dx: number, dy: number) {
    this.glide = null;
    const p = this.pose, cam = this.camera;
    if (!cam) return;
    const perPx = (2 * p.dist * Math.tan(FOV / 2)) / (cam.height || 1);
    const rl = Math.hypot(cam.right[0], cam.right[2]) || 1, fl = Math.hypot(cam.forward[0], cam.forward[2]) || 1;
    const k = perPx / Math.max(0.35, Math.sin(p.pitch));
    p.x += -(cam.right[0] / rl) * dx * perPx + (cam.forward[0] / fl) * dy * k;
    p.z += -(cam.right[2] / rl) * dx * perPx + (cam.forward[2] / fl) * dy * k;
    this.clamp();
    this.changed();
  }

  /** Zoom by a factor (below 1 closer), toward a point on the canvas (CSS pixels), as a map zooms toward the pointer. */
  zoom(factor: number, sx: number, sy: number) {
    this.glide = null;
    const p = this.pose;
    const next = Math.max(1.1, Math.min(this.home().dist * 1.6, p.dist * factor));
    const f = next / p.dist;
    const hit = this.onPlane(sx, sy);
    if (hit) {
      p.x += (hit[0] - p.x) * (1 - f);
      p.z += (hit[1] - p.z) * (1 - f);
    }
    p.dist = next;
    this.clamp();
    this.changed();
  }

  /** Where a point on the canvas (CSS pixels) falls on the map's plane (world x, z), if it does. */
  onPlane(sx: number, sy: number): [number, number] | null {
    const cam = this.camera;
    if (!cam) return null;
    const nx = (sx / cam.width) * 2 - 1, ny = 1 - (sy / cam.height) * 2;
    const t = Math.tan(FOV / 2), aspect = cam.width / cam.height;
    const d = [0, 1, 2].map((i) => cam.forward[i] + cam.right[i] * nx * t * aspect + cam.up[i] * ny * t);
    if (Math.abs(d[1]) < 1e-4) return null;
    const k = (PLANE_Y - cam.eye[1]) / d[1];
    if (k <= 0) return null;
    return [cam.eye[0] + d[0] * k, cam.eye[2] + d[2] * k];
  }

  /** Where a point in the nebula's space shows on the canvas (CSS pixels), and how far off it is. */
  toScreen(x: number, y: number, z: number): { x: number; y: number; depth: number } | null {
    const cam = this.camera;
    if (!cam) return null;
    const v = cam.view, P = cam.proj;
    const ex = v[0] * x + v[4] * y + v[8] * z + v[12], ey = v[1] * x + v[5] * y + v[9] * z + v[13], ez = v[2] * x + v[6] * y + v[10] * z + v[14];
    if (ez >= -0.01) return null;
    const w = -ez;
    return { x: ((P[0] * ex) / w + 1) / 2 * cam.width, y: ((1 - (P[5] * ey) / w) / 2) * cam.height, depth: w };
  }

  private clamp() {
    const p = this.pose;
    p.x = Math.max(-STRIP_WIDTH / 2 - 0.4, Math.min(STRIP_WIDTH / 2 + 0.4, p.x));
    p.z = Math.max(-0.8, Math.min(0.8, p.z));
  }

  private changed() {
    this.moved = true;
    this.wake();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const l of this.layers) l.lose();
  }

  private wake() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(t: number) {
    this.raf = 0;
    if (!this.back.isConnected) return this.destroy();
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;
    const live = !this.reduce;
    if (live) {
      this.time += dt;
      this.fade = Math.min(1, this.fade + dt / 1.2);
    } else this.fade = 1;
    if (!this.homed && this.back.clientWidth) {
      this.homed = true;
      this.pose = this.home();
      this.moved = true;
    }
    // A glide home eases there.
    if (this.glide) {
      const g = this.glide, p = this.pose, k = live ? 1 - Math.exp(-dt * 5) : 1;
      for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'dist'] as const) p[key] += (g[key] - p[key]) * k;
      if (Math.abs(g.dist - p.dist) < 1e-3 && Math.abs(g.yaw - p.yaw) < 1e-4 && Math.abs(g.pitch - p.pitch) < 1e-4 && Math.hypot(g.x - p.x, g.z - p.z) < 1e-3) this.glide = null;
      this.moved = true;
    }
    const cam = this.makeCamera();
    if (cam) {
      // A new size is a new camera too (the map is laid on the plane from it).
      if (!this.camera || this.camera.width !== cam.width || this.camera.height !== cam.height) this.moved = true;
      this.camera = cam;
      const fade = this.fade * this.fade * (3 - 2 * this.fade);
      if (!document.hidden) for (const l of this.layers) l.draw(cam, this.time, fade);
      if (this.moved) {
        this.moved = false;
        this.onCamera?.(cam);
      }
    }
    // Keep running while the gas lives (it always does, unless motion is reduced) or the camera glides.
    if (live || this.glide || this.fade < 1 || !cam) this.raf = requestAnimationFrame((t2) => this.frame(t2));
    else this.last = 0;
  }

  private makeCamera(): Camera | null {
    const c = this.back;
    const width = c.clientWidth, height = c.clientHeight;
    if (!width || !height) return null;
    const p = this.pose;
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch), cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const eye = [p.x + sy * cp * p.dist, p.y + sp * p.dist, p.z + cy * cp * p.dist];
    const forward = [-sy * cp, -sp, -cy * cp];
    const right = [cy, 0, -sy];
    const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const view = new Float32Array([right[0], up[0], -forward[0], 0, right[1], up[1], -forward[1], 0, right[2], up[2], -forward[2], 0, -dot(right, eye), -dot(up, eye), dot(forward, eye), 1]);
    return { view, proj: perspective(FOV, width / height, 0.05, 40), eye, right, up, forward, target: [p.x, p.y, p.z], width, height };
  }
}

const nebulae = new WeakMap<HTMLCanvasElement, Nebula | null>();
let webgl: boolean | null = null;

/** Whether this browser can draw the nebula (WebGL): if not, the map lies flat on the page as it used to. */
export function canNebula(): boolean {
  if (webgl === null) {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl');
      webgl = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** The nebula on its canvases (made the first time; null where WebGL is unavailable, and the map simply goes without). */
export function nebulaOn(back: HTMLCanvasElement, front: HTMLCanvasElement | null): Nebula | null {
  if (!nebulae.has(back)) {
    let n: Nebula | null = null;
    try {
      n = new Nebula(back, front);
    } catch {
      n = null;
    }
    nebulae.set(back, n);
  }
  return nebulae.get(back) ?? null;
}
