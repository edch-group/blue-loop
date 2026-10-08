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

import { buildNebula, GROUND_STRIDE, type Geometry, type Strip } from './nebula-geometry';
import { MapObjects, type MapObject } from './nebula-objects';

export type { Strip, MapObject };

/** The board's paper (#f4f3ef), which everything fades into. */
const PAPER = [0.957, 0.953, 0.937];
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
          resolve(e.data);
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

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.1 + 3.3); }
`;

/**
 * The ground. Shards past the collapse (uGone, a world x) break away: each turns about its middle and falls,
 * the further past the sooner, until it is gone; shards in the next column to go (up to uCrack) shiver.
 */
const GROUND_VERT = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aBary; attribute vec3 aEdge; attribute vec4 aShard;
uniform mat4 uView; uniform mat4 uProj; uniform float uGone; uniform float uCrack; uniform float uTime;
varying vec3 vWorld; varying vec3 vNorm; varying vec3 vBary; varying vec3 vEdge; varying float vFall; varying float vCrack; varying float vDist;
mat3 rot(vec3 axis, float a) {
  float c = cos(a), s = sin(a), t = 1.0 - c;
  vec3 u = normalize(axis);
  return mat3(t * u.x * u.x + c, t * u.x * u.y + s * u.z, t * u.x * u.z - s * u.y,
              t * u.x * u.y - s * u.z, t * u.y * u.y + c, t * u.y * u.z + s * u.x,
              t * u.x * u.z + s * u.y, t * u.y * u.z - s * u.x, t * u.z * u.z + c);
}
void main() {
  vec3 p = aPos, n = aNorm;
  vec3 mid = aShard.xyz;
  float fall = (uGone - mid.x) / 0.8 + aShard.w * 0.45;
  if (fall > 0.0) {
    float t = min(fall, 2.2);
    mat3 r = rot(vec3(aShard.w - 0.5, 0.3, 0.5 - fract(aShard.w * 7.0)), t * (0.8 + aShard.w * 1.6));
    p = mid + r * (p - mid);
    n = r * n;
    p.y -= 3.2 * t * t;
    p.xz += (mid.xz - vec2(uGone, 0.0)) * 0.08 * t;
  } else if (mid.x < uCrack) {
    // About to go: it shivers.
    p.y += sin(uTime * 23.0 + aShard.w * 40.0) * 0.006;
  }
  vec4 v = uView * vec4(p, 1.0);
  gl_Position = uProj * v;
  vWorld = p;
  vNorm = n;
  vBary = aBary;
  vEdge = aEdge;
  vFall = fall;
  vCrack = (mid.x < uCrack || fall > 0.0) ? 1.0 : 0.0;
  vDist = -v.z;
}`;

/**
 * Paper, softly lit, a fine ink mesh drawn into it, faint splashes of colour here and there; at its edges and far
 * off it fades into the paper. Cracks along the shards' borders glow with the colours beneath once instability
 * nears. Over the map (uFront), only the ground on the camera's side of its plane.
 */
const GROUND_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 vWorld; varying vec3 vNorm; varying vec3 vBary; varying vec3 vEdge; varying float vFall; varying float vCrack; varying float vDist;
uniform vec3 uPaper; uniform vec3 uEye; uniform float uFront; uniform float uFade; uniform float uTime;
${NOISE}
void main() {
  if (vFall > 2.0) discard;
  if (uFront > 0.5 && vWorld.y * uEye.y <= 0.0) discard;
  vec3 n = normalize(vNorm);
  if (dot(n, uEye - vWorld) < 0.0) n = -n;
  float key = max(0.0, dot(n, normalize(vec3(0.5, 0.8, 0.35))));
  float fill = max(0.0, dot(n, normalize(vec3(-0.6, 0.4, 0.5)))) * 0.25;
  vec3 c = mix(vec3(0.70, 0.73, 0.79), vec3(0.99, 0.988, 0.98), clamp(0.2 + 0.8 * key + fill, 0.0, 1.0));
  // Splashes of colour, faint and few: gold, rose, sea blue.
  vec2 q = vWorld.xz * 0.35;
  float splash = smoothstep(0.52, 0.72, fbm(q + 13.0));
  float hue = fbm(q * 0.7 + 40.0);
  vec3 tint = hue < 0.42 ? vec3(0.93, 0.74, 0.42) : hue < 0.55 ? vec3(0.90, 0.62, 0.70) : vec3(0.52, 0.72, 0.88);
  c = mix(c, c * tint * 1.06, splash * 0.8);
  // The mesh, in fine ink.
  vec2 g = vWorld.xz / 0.22;
  vec2 gw = fwidth(g);
  vec2 gl = abs(fract(g - 0.5) - 0.5) / max(gw, vec2(1e-4));
  float mesh = 1.0 - min(min(gl.x, gl.y), 1.0);
  float near = 1.0 - smoothstep(5.0, 11.0, vDist);
  c = mix(c, vec3(0.45, 0.51, 0.64), mesh * 0.32 * near);
  // Cracks along the shards' borders, glowing with the colours beneath.
  if (vCrack > 0.5) {
    vec3 b = vBary + (1.0 - vEdge) * 9.0;
    float d = min(b.x, min(b.y, b.z));
    float w = fwidth(d) * 1.8;
    float crack = 1.0 - smoothstep(0.0, w, d);
    vec3 glow = mix(vec3(0.85, 0.35, 0.75), vec3(0.3, 0.75, 0.95), 0.5 + 0.5 * sin(vWorld.x * 3.0 + uTime * 2.0));
    c = mix(c, glow, crack * 0.9);
    if (vFall > 0.0) c *= 1.0 - min(vFall, 1.5) * 0.35;
  }
  // Fading at the land's edges and far off into the paper.
  float edge = min(min(vWorld.x + 7.0, 7.0 - vWorld.x), min(vWorld.z + 5.5, 4.0 - vWorld.z));
  float away = max(1.0 - smoothstep(0.0, 1.8, edge), smoothstep(7.0, 20.0, vDist));
  if (vFall <= 0.0) c = mix(c, uPaper, away);
  gl_FragColor = uFront > 0.5 ? vec4(c, 1.0) * uFade : vec4(mix(uPaper, c, uFade), 1.0);
}`;

/** Where the land has fallen: a flat mask just under its surface, marking where the abyss shows through. */
const MASK_VERT = `
attribute vec2 aPos;
uniform mat4 uView; uniform mat4 uProj; uniform float uGone;
void main() {
  gl_Position = uProj * uView * vec4(mix(-40.0, uGone + 0.6, aPos.x), -0.45, mix(-40.0, 12.0, aPos.y), 1.0);
}`;
const MASK_FRAG = `
precision mediump float;
void main() { gl_FragColor = vec4(0.0); }`;

/** The abyss: a full-screen pass, each pixel's ray looking down into the starry sky beneath. */
const ABYSS_VERT = `
attribute vec2 aPos;
varying vec2 vNdc;
void main() {
  vNdc = aPos * 4.0 - 1.0;
  gl_Position = vec4(vNdc, 0.0, 1.0);
}`;

/**
 * The starry sky beneath, in full colour: stars at several depths (so it has depth as the camera turns) over
 * drifting clouds of colour on the deep blue-black of space.
 */
const ABYSS_FRAG = `
precision highp float;
varying vec2 vNdc;
uniform vec3 uEye; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd; uniform float uTan; uniform float uAspect;
uniform float uTime; uniform vec3 uPaper;
${NOISE}
float stars(vec2 p, float density) {
  vec2 i = floor(p), f = fract(p);
  float h = hash(i);
  if (h > density) return 0.0;
  vec2 c = vec2(hash(i + 3.1), hash(i + 7.7)) * 0.8 + 0.1;
  float d = length(f - c);
  return smoothstep(0.09, 0.0, d) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 4.0) + h * 30.0));
}
void main() {
  vec3 dir = normalize(uFwd + uRight * vNdc.x * uTan * uAspect + uUp * vNdc.y * uTan);
  float dn = max(0.08, -dir.y);
  vec3 col = vec3(0.02, 0.02, 0.07);
  vec3 base = uEye + dir * ((uEye.y + 5.0) / dn);
  col = mix(col, vec3(0.06, 0.03, 0.13), fbm(base.xz * 0.12));
  // Clouds of colour, deep down.
  for (int k = 0; k < 2; k++) {
    float depth = 6.0 + float(k) * 8.0;
    vec2 p = (uEye + dir * ((uEye.y + depth) / dn)).xz * (0.12 - float(k) * 0.03) + float(k) * 9.0 + uTime * 0.01;
    float n = fbm(p);
    vec3 neb = k == 0 ? vec3(0.75, 0.22, 0.62) : vec3(0.12, 0.55, 0.85);
    col += neb * smoothstep(0.45, 0.85, n) * 0.6;
  }
  // Stars at three depths.
  for (int k = 0; k < 3; k++) {
    float depth = 3.0 + float(k) * 5.0;
    vec2 p = (uEye + dir * ((uEye.y + depth) / dn)).xz * (3.5 - float(k) * 0.9);
    float st = stars(p + float(k) * 17.0, 0.14);
    vec3 sc = mix(vec3(1.0, 0.95, 0.85), vec3(0.7, 0.85, 1.0), hash(floor(p)));
    col += sc * st;
  }
  // Toward the horizon, back into the paper.
  col = mix(uPaper, col, smoothstep(0.02, 0.2, -dir.y));
  gl_FragColor = vec4(col, 1.0);
}`;

/** The stars over the land: fine ink points, a few in colour, twinkling. */
const STAR_VERT = `
attribute vec3 aPos; attribute float aSize; attribute float aHue; attribute float aPhase;
uniform mat4 uView; uniform mat4 uProj; uniform float uTime; uniform float uPx;
varying float vHue; varying float vA;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  gl_Position = uProj * v;
  float tw = 0.65 + 0.35 * sin(uTime * (0.8 + aPhase * 2.0) + aPhase * 40.0);
  vA = tw * (1.0 - smoothstep(9.0, 20.0, -v.z));
  vHue = aHue;
  gl_PointSize = aSize * uPx * clamp(5.0 / -v.z, 0.6, 1.8) * (aHue > 0.5 ? 1.4 : 1.0);
}`;

const STAR_FRAG = `
precision mediump float;
varying float vHue; varying float vA;
uniform float uFade;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  // A soft point, with a faint cross of light through the coloured ones.
  float a = smoothstep(0.5, 0.15, r);
  if (vHue > 0.5) a = max(a, (smoothstep(0.06, 0.0, abs(d.x)) + smoothstep(0.06, 0.0, abs(d.y))) * smoothstep(0.5, 0.0, r) * 0.6);
  vec3 c = vHue < 0.5 ? vec3(0.42, 0.48, 0.62) : vHue < 1.5 ? vec3(0.92, 0.68, 0.30) : vHue < 2.5 ? vec3(0.88, 0.48, 0.62) : vec3(0.35, 0.65, 0.90);
  a *= vA * uFade * (vHue < 0.5 ? 0.55 : 0.9);
  gl_FragColor = vec4(c * a, a);
}`;

/**
 * Comets whistling by: each a head and a tail of points along its path, crossing the sky now and then and
 * gone again until its next pass.
 */
const COMET_VERT = `
attribute vec3 aStart; attribute vec3 aDir; attribute vec2 aTime; attribute float aK;
uniform mat4 uView; uniform mat4 uProj; uniform float uTime; uniform float uPx;
varying float vA; varying float vK;
void main() {
  float period = aTime.x, t = mod(uTime + aTime.y, period);
  float cross = 5.0;
  vec3 p = aStart + aDir * (t * 3.2 - aK * 0.07);
  vec4 v = uView * vec4(p, 1.0);
  gl_Position = uProj * v;
  vA = t < cross ? sin(t / cross * 3.14159) * (1.0 - aK / 28.0) : 0.0;
  vK = aK;
  gl_PointSize = uPx * mix(4.5, 1.0, aK / 28.0) * clamp(5.0 / -v.z, 0.6, 1.8);
}`;

const COMET_FRAG = `
precision mediump float;
varying float vA; varying float vK;
uniform float uFade;
void main() {
  float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vA * uFade;
  vec3 c = mix(vec3(1.0, 0.92, 0.7), vec3(0.45, 0.65, 0.95), clamp(vK / 14.0, 0.0, 1.0));
  gl_FragColor = vec4(c * a, a);
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
  private groundProg: WebGLProgram;
  private abyssProg?: WebGLProgram;
  private maskProg?: WebGLProgram;
  private starProg?: WebGLProgram;
  private cometProg?: WebGLProgram;
  private groundBuf: WebGLBuffer;
  private abyssBuf?: WebGLBuffer;
  private screenBuf?: WebGLBuffer;
  private starBuf?: WebGLBuffer;
  private cometBuf?: WebGLBuffer;
  private groundCount = 0;
  private starCount = 0;
  private cometCount = 0;
  /** The map's own things in 3D (stars, black holes and the rest): on the layer over the map. */
  objects: MapObjects | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly front: boolean) {
    const gl = canvas.getContext('webgl', front ? { antialias: true, alpha: true, premultipliedAlpha: true, depth: true } : { antialias: true, alpha: false, depth: true, stencil: true });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    gl.getExtension('OES_standard_derivatives');
    const program = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
      gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('nebula shader: ' + gl.getProgramInfoLog(p));
      return p;
    };
    this.groundProg = program(GROUND_VERT, GROUND_FRAG);
    this.groundBuf = gl.createBuffer()!;
    if (!front) {
      this.abyssProg = program(ABYSS_VERT, ABYSS_FRAG);
      this.maskProg = program(MASK_VERT, MASK_FRAG);
      this.starProg = program(STAR_VERT, STAR_FRAG);
      this.cometProg = program(COMET_VERT, COMET_FRAG);
      this.abyssBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.abyssBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
      this.screenBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1]), gl.STATIC_DRAW);
      this.starBuf = gl.createBuffer()!;
      // The comets: a few, each a head and a tail of points, crossing at their own pace.
      const comets: number[] = [];
      for (let c = 0; c < 4; c++) {
        const r = (k: number) => Math.abs(Math.sin(c * 12.9898 + k * 78.233) * 43758.5453) % 1;
        const side = r(1) < 0.5 ? -1 : 1;
        const start = [side * 9, 1.4 + r(2) * 2.5, -6 + r(3) * 4];
        const dir = [-side * (0.85 + r(4) * 0.1), -0.12 - r(5) * 0.15, 0.25 + r(6) * 0.3];
        const l = Math.hypot(dir[0], dir[1], dir[2]);
        const period = 14 + r(7) * 18, offset = r(8) * period;
        for (let k = 0; k < 28; k++) comets.push(...start, dir[0] / l, dir[1] / l, dir[2] / l, period, offset, k);
      }
      this.cometBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cometBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(comets), gl.STATIC_DRAW);
      this.cometCount = comets.length / 9;
    }
  }

  upload(g: Geometry) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuf);
    gl.bufferData(gl.ARRAY_BUFFER, g.ground, gl.STATIC_DRAW);
    this.groundCount = g.ground.length / GROUND_STRIDE;
    if (this.starBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf);
      gl.bufferData(gl.ARRAY_BUFFER, g.stars, gl.STATIC_DRAW);
      this.starCount = g.stars.length / 6;
    }
  }

  draw(cam: Camera, time: number, fade: number, gone: number, crack: number) {
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
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    const use = (p: WebGLProgram, buf: WebGLBuffer, attrs: [string, number][]) => {
      gl.useProgram(p);
      const u = (n: string) => gl.getUniformLocation(p, n);
      gl.uniform3fv(u('uRight'), cam.right);
      gl.uniform3fv(u('uUp'), cam.up);
      gl.uniform3fv(u('uFwd'), cam.forward);
      gl.uniform1f(u('uTan'), Math.tan(FOV / 2));
      gl.uniform1f(u('uAspect'), cam.width / cam.height);
      gl.uniformMatrix4fv(u('uProj'), false, cam.proj);
      gl.uniformMatrix4fv(u('uView'), false, cam.view);
      gl.uniform1f(u('uTime'), time);
      gl.uniform1f(u('uFade'), fade);
      gl.uniform1f(u('uGone'), gone);
      gl.uniform1f(u('uCrack'), crack);
      gl.uniform1f(u('uPx'), dpr);
      gl.uniform3f(u('uPaper'), PAPER[0], PAPER[1], PAPER[2]);
      gl.uniform3f(u('uEye'), cam.eye[0], cam.eye[1], cam.eye[2]);
      gl.uniform1f(u('uFront'), this.front ? 1 : 0);
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
    // The starry abyss, only under what has fallen.
    if (this.abyssProg && this.maskProg && this.abyssBuf && gone > -9) {
      // Mark where the land has fallen (seen through), then fill it with the sky beneath.
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.colorMask(false, false, false, false);
      gl.depthMask(false);
      done = use(this.maskProg, this.abyssBuf, [['aPos', 2]]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      done();
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.disable(gl.DEPTH_TEST);
      done = use(this.abyssProg, this.screenBuf!, [['aPos', 2]]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      done();
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.STENCIL_TEST);
    }
    if (this.groundCount) {
      done = use(this.groundProg, this.groundBuf, [['aPos', 3], ['aNorm', 3], ['aBary', 3], ['aEdge', 3], ['aShard', 4]]);
      gl.drawArrays(gl.TRIANGLES, 0, this.groundCount);
      done();
    }
    // The stars and comets over it, see-through (hidden behind the mountains).
    if (!this.front) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      if (this.starProg && this.starBuf && this.starCount) {
        done = use(this.starProg, this.starBuf, [['aPos', 3], ['aSize', 1], ['aHue', 1], ['aPhase', 1]]);
        gl.drawArrays(gl.POINTS, 0, this.starCount);
        done();
      }
      if (this.cometProg && this.cometBuf) {
        done = use(this.cometProg, this.cometBuf, [['aStart', 3], ['aDir', 3], ['aTime', 2], ['aK', 1]]);
        gl.drawArrays(gl.POINTS, 0, this.cometCount);
        done();
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    // The map's things, behind whatever ground lies between them and the eye.
    this.objects?.draw(cam, time, 1);
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
  /** The collapse: the land is gone up to this world x (eased toward the target as it breaks away), and cracked up
   * to that one. */
  private gone = -50;
  private goneTarget = -50;
  private crack = -50;
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
    // (In development, reachable from the console, to try out the collapse.)
    if (import.meta.env.DEV) (window as unknown as { nebula?: Nebula }).nebula = this;
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

  /**
   * Instability: the land is gone up to world x `gone` (it cracks and falls away to there, exposing the starry
   * abyss beneath), and cracked up to `crack` (the next to go). Below about -9, nothing.
   */
  setCollapse(gone: number, crack: number) {
    if (this.goneTarget === gone && this.crack === crack) return;
    // (A first look, or a new universe: no falling to watch, it is simply so.)
    if (gone < this.goneTarget || this.goneTarget < -9) this.gone = gone;
    this.goneTarget = gone;
    this.crack = crack;
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
    return { x: 0, y: PLANE_Y, z: -0.35, yaw: 0, pitch: 0.6, dist };
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
    // The land breaks away toward the collapse, a column at a time (at once with motion reduced, or going back).
    if (this.gone !== this.goneTarget) {
      this.gone = live && this.goneTarget > this.gone ? Math.min(this.goneTarget, this.gone + dt * 0.7) : this.goneTarget;
    }
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
      if (!document.hidden) for (const l of this.layers) l.draw(cam, this.time, fade, this.gone, this.crack);
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
