/**
 * The campaign map's nebula, and the 3D space the map itself lies in, drawn in the battle board's style so the
 * map, the nebula and the ground beneath read as one picture.
 *
 * The gas is real volumetric gas: each pixel's ray is marched through 3D noise (domain-warped fBm, gathered into
 * a few broad clumps laid out per universe by nebula-layout.ts), so it is soft, wispy and torn at its edges,
 * thicker in places and thinning to nothing, and it is truly 3D from any angle. It is shown as the board draws:
 * its own dotted paper, each dot swelling where the gas is thicker (a halftone, in the ink and strength of the
 * board's dots), over a wash that is the paper a shade deeper. It churns very slowly. A slab round the strip's
 * plane is kept clear, and the clumps lie away from the strip, so the map is clear from where the camera
 * starts. It all hangs over a floor reaching to
 * the horizon: the board's dotted grid and schematic rings. (The gas is marched at a reduced resolution, into
 * a texture laid smoothly over the floor, and only redrawn as the camera moves or a few times a second.)
 *
 * The strip of systems lies on a flat plane through the gas (PLANE_Y). The map's own elements (stars, routes,
 * rings, ships) stay HTML, laid on that plane by a CSS transform worked out from this camera (campaign.ts), so
 * they stand exactly in the nebula's space. The gas is drawn twice: once behind the map (all of it), and once
 * over it, lighter, but only the gas on the camera's side of the plane, so gas between the eye and a system
 * veils it. The player navigates: a drag orbits, the wheel or a pinch zooms toward the pointer, a right-drag or
 * a two-finger drag pans.
 */

import { CLUMPS, nebulaLayout, type Layout, type Strip } from './nebula-layout';

export type { Strip };

/** The board's paper (#f4f3ef), which everything fades into. */
const PAPER = [0.957, 0.953, 0.937];
/** Where the floor lies, below the gas. */
const FLOOR_Y = -1.2;
/** The height of the plane the strip of systems lies on. */
export const PLANE_Y = 0;
/** How wide the strip is in the nebula's space (its map units are scaled to this). */
export const STRIP_WIDTH = 4.4;
const FOV = (36 * Math.PI) / 180;


// ---------- shaders ----------

const COMMON = `
uniform mat4 uView; uniform mat4 uProj; uniform float uTime;
`;


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


/** A triangle covering the whole screen. */
const SCREEN_VERT = `
attribute vec2 aPos;
varying vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/**
 * The gas: each pixel's ray marched through the clumps, gathering a pale wash front to back. Thick gas is a cool
 * slate blue going lilac higher up; near the clumps' hearts it glows in the board's gold. Over the map
 * (uFront), only the gas on the camera's side of its plane, and fainter.
 */
const GAS_FRAG = `
precision highp float;
varying vec2 vNdc;
uniform vec3 uEye; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd; uniform float uTan; uniform float uAspect;
uniform float uTime; uniform float uFade; uniform float uFront;
uniform vec3 uOffset; uniform vec4 uClumps[${CLUMPS}]; uniform vec4 uStrip;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}

float fbm2(vec3 p) {
  return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + vec3(1.7, 9.2, 3.1));
}
float fbm3(vec3 p) {
  return fbm2(p) + 0.125 * noise(p * 4.12 + vec3(5.3, 1.1, 7.7));
}

// How thick the gas is at p, and how near a clump's heart (for the glow).
vec2 gas(vec3 p) {
  float env = 0.0, heart = 0.0;
  for (int i = 0; i < ${CLUMPS}; i++) {
    vec4 c = uClumps[i];
    vec3 d = (p - c.xyz) / c.w;
    d.y *= 1.3;
    float k = dot(d, d);
    env += exp(-k * 1.4);
    heart += exp(-k * 7.0);
  }
  // (Far from every clump there is nothing: no noise to work out.)
  if (env < 0.04) return vec2(0.0);
  vec3 q = p * 1.1 + uOffset + vec3(0.0, uTime * 0.012, uTime * 0.008);
  // Folded through slow noise, so it tears into wisps and filaments rather than sitting in blobs.
  float w = fbm2(q * 0.7);
  q += vec3(w * 2.6, w * 1.3, -w * 1.9);
  float n = fbm(q * 1.6);
  // Ridged: thin filaments where the noise folds over.
  float ridge = 1.0 - abs(2.0 * fbm3(q * 2.3 + 11.0) / 0.875 - 1.0);
  float g = (max(0.0, (n - 0.4) * 4.0) + pow(ridge, 6.0) * 1.4 * smoothstep(0.3, 0.5, n)) * min(env, 1.5);
  // The strip's slab is kept clear.
  float inside = smoothstep(uStrip.x - 0.1, uStrip.x + 0.1, p.x) * (1.0 - smoothstep(uStrip.y - 0.1, uStrip.y + 0.1, p.x))
               * smoothstep(uStrip.z - 0.1, uStrip.z + 0.1, p.z) * (1.0 - smoothstep(uStrip.w - 0.1, uStrip.w + 0.1, p.z));
  g *= mix(1.0, smoothstep(0.1, 0.38, abs(p.y)), inside);
  return vec2(g, heart);
}

void main() {
  vec3 dir = normalize(uFwd + uRight * vNdc.x * uTan * uAspect + uUp * vNdc.y * uTan);
  // The box the gas lives in.
  vec3 lo = vec3(-4.0, -1.15, -3.0), hi = vec3(4.0, 1.8, 1.4);
  vec3 inv = 1.0 / dir;
  vec3 t0 = (lo - uEye) * inv, t1 = (hi - uEye) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), max(tmin.z, 0.0)), tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tf <= tn) { gl_FragColor = vec4(0.0); return; }
  const int STEPS = 48;
  float dt = (tf - tn) / float(STEPS);
  float t = tn + dt * hash(vec3(gl_FragCoord.xy, 0.0));
  float a = 0.0, glow = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = uEye + dir * t;
    t += dt;
    if (uFront > 0.5 && p.y * uEye.y <= 0.0) continue;
    vec2 g = gas(p);
    if (g.x <= 0.0) continue;
    float sa = 1.0 - exp(-g.x * dt * 6.0);
    glow += (1.0 - a) * sa * clamp(g.y, 0.0, 1.0);
    a += (1.0 - a) * sa;
    if (a > 0.82) break;
  }
  // (Not a colour: how much gas there is (r, a) and how much of it glows (g). The styling is laid on as it is
  // shown, in the board's own palette.)
  float k = uFade * (uFront > 0.5 ? 0.5 : 1.0);
  gl_FragColor = vec4(a * k, glow * k, 0.0, a * k);
}`;

/**
 * The gas drawn as the board draws: its own dotted paper, with each dot swelling where the gas is thicker (a
 * halftone, as a printed chart shades), in the very ink and strength of the board's dots, over a wash that is
 * the paper itself a shade deeper. Nothing but the board's paper and its dots.
 */
const SHOW_FRAG = `
precision highp float;
varying vec2 vNdc;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uCell; uniform vec3 uPaper;
void main() {
  // Smoothed a little (the marching leaves a fine grain).
  vec2 uv = vNdc * 0.5 + 0.5;
  vec4 g = texture2D(uTex, uv) * 0.25;
  g += (texture2D(uTex, uv + vec2(uTexel.x, 0.0)) + texture2D(uTex, uv - vec2(uTexel.x, 0.0)) + texture2D(uTex, uv + vec2(0.0, uTexel.y)) + texture2D(uTex, uv - vec2(0.0, uTexel.y))) * 0.125;
  g += (texture2D(uTex, uv + uTexel) + texture2D(uTex, uv - uTexel) + texture2D(uTex, uv + vec2(uTexel.x, -uTexel.y)) + texture2D(uTex, uv - vec2(uTexel.x, -uTexel.y))) * 0.0625;
  float a = g.a;
  if (a < 0.004) { gl_FragColor = vec4(0.0); return; }
  // The paper, a shade deeper where the gas lies.
  vec3 wash = uPaper * 0.93;
  float w = clamp(a * 0.6, 0.0, 0.5);
  // The board's dot (its ink, at its strength), swelling with the gas.
  vec2 cell = mod(gl_FragCoord.xy, uCell) - uCell * 0.5;
  float r = uCell * (0.08 + 0.3 * sqrt(clamp(a * 1.2, 0.0, 1.0)));
  float d = (1.0 - smoothstep(r - 0.7, r + 0.7, length(cell))) * 0.34 * smoothstep(0.0, 0.15, a);
  vec3 ink = vec3(0.47, 0.53, 0.67);
  vec3 c = ink * d + wash * w * (1.0 - d);
  gl_FragColor = vec4(c, d + w * (1.0 - d));
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
  private floorProg?: WebGLProgram;
  private gasProg: WebGLProgram;
  private showProg: WebGLProgram;
  private floorBuf?: WebGLBuffer;
  private screenBuf: WebGLBuffer;
  private fbo: WebGLFramebuffer;
  private tex: WebGLTexture;
  private texSize = [0, 0];
  private layout: Layout | null = null;
  /** The gas needs marching again (the camera moved, or time has passed). */
  stale = true;

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
    this.gasProg = program(SCREEN_VERT, GAS_FRAG);
    this.showProg = program(SCREEN_VERT, SHOW_FRAG);
    this.screenBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.tex = gl.createTexture()!;
    this.fbo = gl.createFramebuffer()!;
    if (!front) {
      this.floorProg = program(FLOOR_VERT, FLOOR_FRAG);
      this.floorBuf = gl.createBuffer()!;
      const F = 40;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-F, FLOOR_Y, -F, F, FLOOR_Y, -F, F, FLOOR_Y, F, -F, FLOOR_Y, -F, F, FLOOR_Y, F, -F, FLOOR_Y, F]), gl.STATIC_DRAW);
    }
  }

  setLayout(l: Layout) {
    this.layout = l;
    this.stale = true;
  }

  /** The texture the gas is marched into: a little over half the canvas's CSS size (soft gas loses nothing). */
  private target(w: number, h: number) {
    const gl = this.gl;
    const tw = Math.max(2, Math.round(w * 0.7)), th = Math.max(2, Math.round(h * 0.7));
    if (this.texSize[0] === tw && this.texSize[1] === th) return;
    this.texSize = [tw, th];
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.stale = true;
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
    const screen = (p: WebGLProgram) => {
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf);
      const loc = gl.getAttribLocation(p, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      return () => gl.disableVertexAttribArray(loc);
    };
    // March the gas into its texture, when it has gone stale.
    const L = this.layout;
    this.target(c.clientWidth, c.clientHeight);
    if (L && this.stale) {
      this.stale = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.texSize[0], this.texSize[1]);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const p = this.gasProg;
      const done = screen(p);
      const u = (n: string) => gl.getUniformLocation(p, n);
      gl.uniform3fv(u('uEye'), cam.eye);
      gl.uniform3fv(u('uRight'), cam.right);
      gl.uniform3fv(u('uUp'), cam.up);
      gl.uniform3fv(u('uFwd'), cam.forward);
      gl.uniform1f(u('uTan'), Math.tan(FOV / 2));
      gl.uniform1f(u('uAspect'), cam.width / cam.height);
      gl.uniform1f(u('uTime'), time);
      gl.uniform1f(u('uFade'), fade);
      gl.uniform1f(u('uFront'), this.front ? 1 : 0);
      gl.uniform3fv(u('uOffset'), L.offset);
      gl.uniform4fv(u('uClumps'), L.clumps);
      gl.uniform4fv(u('uStrip'), L.strip);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      done();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, w, h);
    if (this.front) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.floorProg && this.floorBuf) {
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.floorProg);
      const fp = this.floorProg;
      gl.uniformMatrix4fv(gl.getUniformLocation(fp, 'uProj'), false, cam.proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(fp, 'uView'), false, cam.view);
      gl.uniform1f(gl.getUniformLocation(fp, 'uFade'), fade);
      gl.uniform3f(gl.getUniformLocation(fp, 'uPaper'), PAPER[0], PAPER[1], PAPER[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuf);
      const loc = gl.getAttribLocation(fp, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(loc);
      gl.disable(gl.DEPTH_TEST);
    }
    if (!L) return;
    // The gas over it, see-through.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const done = screen(this.showProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(gl.getUniformLocation(this.showProg, 'uTex'), 0);
    gl.uniform2f(gl.getUniformLocation(this.showProg, 'uTexel'), 1.5 / this.texSize[0], 1.5 / this.texSize[1]);
    // (The dots' spacing, in device pixels, and the paper they are printed on.)
    gl.uniform1f(gl.getUniformLocation(this.showProg, 'uCell'), 7 * dpr);
    gl.uniform3f(gl.getUniformLocation(this.showProg, 'uPaper'), PAPER[0], PAPER[1], PAPER[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    done();
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
  /** How far the nebula has faded in since it was first shown. */
  /** When the gas was last marched (it churns slowly, so a few times a second is enough). */
  private marched = 0;
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
    this.wake();
  }

  /** Which universe's nebula to show (laid out once per seed, kept clear of the strip). */
  show(seed: number, strip: Strip) {
    if (seed !== this.seed) {
      this.seed = seed;
      const layout = nebulaLayout(seed, strip);
      for (const l of this.layers) l.setLayout(layout);
      // Fade in (at once if motion is reduced).
      this.fade = this.reduce ? 1 : 0;
    }
    if (!this.homed && this.back.clientWidth) {
      this.homed = true;
      this.pose = this.home();
      this.moved = true;
    }
    this.wake();
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
      // The gas is marched afresh when the camera moves, while it fades in, and a few times a second as it churns.
      if (this.moved || this.glide || this.fade < 1 || (live && t - this.marched > 220)) {
        this.marched = t;
        for (const l of this.layers) l.stale = true;
      }
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
