/**
 * The campaign map's nebula: a real 3D object behind the strip, drawn in the battle board's schematic style,
 * so the map, the nebula and the ground beneath read as one picture.
 *
 * Its shape (nebula-geometry.ts, worked out once per universe in a worker) is a soft cloud of gas: a loose
 * body of billows with a pillar or two rising out of it, plumes of displaced gas drifting free around it, and
 * motes of dust. The gas is drawn as the board's paper, softly shaded, with schematic contour lines round it
 * and an ink line where it turns away; a faint shimmer in the board's gold and the routes' blue plays over its
 * edges, hinting at what it is. The plumes drift, the body breathes and the dust rises. It floats over a floor
 * that reaches the horizon: the board's dotted grid and schematic rings, fading into the paper far off.
 *
 * It is drawn with WebGL from a camera of its own that can turn: it drifts slowly, leans toward the pointer,
 * turns as the flagship advances along the strip, and a drag across the map turns it by hand. With motion
 * reduced it holds still but for drags.
 */

import { buildNebula, type Geometry } from './nebula-geometry';

/** The board's paper (#f4f3ef), which everything fades into. */
const PAPER = [0.957, 0.953, 0.937];
/** Where the floor lies, below the gas. */
const FLOOR_Y = -1.2;

const geometries = new Map<number, Promise<Geometry>>();

/** A universe's nebula, worked out in a worker (or here, where workers are unavailable), once per seed. */
function geometry(seed: number): Promise<Geometry> {
  let p = geometries.get(seed);
  if (!p) {
    p = new Promise<Geometry>((resolve) => {
      const here = () => setTimeout(() => resolve(buildNebula(seed)), 0);
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
        w.postMessage(seed);
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
uniform vec3 uPaper; uniform vec3 uEye; uniform float uTime; uniform float uFade;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vWorld);
  float ndv = abs(dot(n, v));
  // Paper, softly shaded by a light from above: the board's white, falling to its cool grey in shadow.
  float lam = max(0.0, dot(n, normalize(vec3(0.45, 0.85, 0.3))));
  vec3 c = mix(vec3(0.80, 0.82, 0.86), vec3(0.995, 0.994, 0.988), 0.25 + 0.75 * lam);
  // Schematic contour lines round the gas, as on a survey.
  float S = 0.12;
  float cd = abs(fract(vWorld.y / S + 0.5) - 0.5) * S;
  float line = 1.0 - smoothstep(0.0, fwidth(vWorld.y) * 1.2, cd);
  c = mix(c, vec3(0.55, 0.60, 0.71), line * 0.45);
  // A shimmer over its edges, here and there, in the board's gold and the routes' blue.
  float rim = pow(1.0 - ndv, 2.2);
  float band = smoothstep(0.55, 1.0, sin(dot(vWorld, vec3(3.1, 5.3, 2.2)) - uTime * 1.1 + 2.0 * sin(vWorld.x * 1.9 + uTime * 0.4)));
  float patch = smoothstep(0.35, 0.85, 0.5 + 0.5 * sin(vWorld.x * 1.4 + vWorld.z * 2.1 + vWorld.y * 0.9 + uTime * 0.21));
  vec3 tint = mix(vec3(0.87, 0.66, 0.36), vec3(0.55, 0.69, 0.93), 0.5 + 0.5 * sin(vWorld.y * 4.0 + vWorld.x * 1.3 + uTime * 0.5));
  c = mix(c, tint, clamp(rim * (0.3 + 0.7 * band) * patch * 0.85 + band * patch * 0.08, 0.0, 0.7));
  // An ink line where the gas turns away from the eye: its outline.
  float edge = 1.0 - smoothstep(0.12, 0.3, ndv);
  c = mix(c, vec3(0.40, 0.46, 0.60), edge * 0.6);
  c = mix(c, uPaper, smoothstep(4.5, 22.0, vDist));
  gl_FragColor = vec4(mix(uPaper, c, uFade), 1.0);
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
uniform float uPx;
varying float vAlpha;
void main() {
  // Each mote rises slowly and wanders, fading in at the bottom of its climb and out at the top.
  float t = fract(uTime * 0.025 + aPhase);
  vec3 p = aPos + vec3(sin(uTime * 0.3 + aPhase * 6.28) * 0.05, t * 0.5 - 0.25, cos(uTime * 0.27 + aPhase * 9.0) * 0.05);
  vec4 v = uView * vec4(p, 1.0);
  gl_Position = uProj * v;
  vAlpha = sin(t * 3.14159) * (1.0 - smoothstep(4.5, 12.0, -v.z));
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
function orbit(yaw: number, pitch: number, dist: number, ty: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const eye = [sy * cp * dist, ty + sp * dist, cy * cp * dist];
  const f = [-eye[0], ty - eye[1], -eye[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  f[0] /= fl; f[1] /= fl; f[2] /= fl;
  // right = forward x up, then up = right x forward.
  const r = [-f[2], 0, f[0]];
  const rl = Math.hypot(r[0], r[2]);
  r[0] /= rl; r[2] /= rl;
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1]);
}

export class Nebula {
  private gl: WebGLRenderingContext;
  private gasProg: WebGLProgram;
  private floorProg: WebGLProgram;
  private moteProg: WebGLProgram;
  private gasBuf: WebGLBuffer;
  private floorBuf: WebGLBuffer;
  private moteBuf: WebGLBuffer;
  private gasCount = 0;
  private moteCount = 0;
  private seed = -1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Where the camera is, and where it is easing toward. */
  private yaw = 0;
  private pitch = 0.42;
  private drift = 0;
  private hand = { yaw: 0, pitch: 0 };
  private lean = { x: 0, y: 0, tx: 0, ty: 0 };
  private progress = 0;
  private progressShown = 0;
  /** How far the nebula has faded in since its shape arrived. */
  private fade = 0;
  private onMove = (e: PointerEvent) => {
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    this.lean.tx = (e.clientX / w - 0.5) * 2;
    this.lean.ty = (e.clientY / h - 0.5) * 2;
    this.wake();
  };

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true });
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
    this.floorProg = program(FLOOR_VERT, FLOOR_FRAG);
    this.moteProg = program(MOTE_VERT, MOTE_FRAG);
    this.gasBuf = gl.createBuffer()!;
    this.moteBuf = gl.createBuffer()!;
    this.floorBuf = gl.createBuffer()!;
    const F = 40;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.floorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-F, FLOOR_Y, -F, F, FLOOR_Y, -F, F, FLOOR_Y, F, -F, FLOOR_Y, -F, F, FLOOR_Y, F, -F, FLOOR_Y, F]), gl.STATIC_DRAW);
    window.addEventListener('pointermove', this.onMove, { passive: true });
    this.wake();
  }

  /** Which universe's nebula to show (built once per seed), and how far along the strip the flagship is (0 to 1). */
  show(seed: number, progress: number) {
    this.progress = progress;
    if (seed !== this.seed) {
      this.seed = seed;
      void geometry(seed).then((g) => {
        if (this.seed !== seed || this.gl.isContextLost()) return;
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.gasBuf);
        gl.bufferData(gl.ARRAY_BUFFER, g.mesh, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.moteBuf);
        gl.bufferData(gl.ARRAY_BUFFER, g.motes, gl.STATIC_DRAW);
        this.gasCount = g.mesh.length / 7;
        this.moteCount = g.motes.length / 5;
        // Fade in (at once if motion is reduced).
        this.fade = this.reduce ? 1 : 0;
        this.wake();
      });
    }
    this.wake();
  }

  /** Turn the nebula by hand (a drag across the map, in screen pixels). */
  turn(dx: number, dy: number) {
    this.hand.yaw += dx * 0.004;
    this.hand.pitch = Math.max(-0.25, Math.min(0.5, this.hand.pitch + dy * 0.003));
    this.wake();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onMove);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private wake() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(t: number) {
    this.raf = 0;
    if (!this.canvas.isConnected) return this.destroy();
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;
    // Ease toward the pointer's lean and the flagship's progress; drift and live unless motion is reduced.
    const k = 1 - Math.exp(-dt * 3);
    const moving = !this.reduce;
    if (moving) {
      this.lean.x += (this.lean.tx - this.lean.x) * k;
      this.lean.y += (this.lean.ty - this.lean.y) * k;
      this.progressShown += (this.progress - this.progressShown) * (1 - Math.exp(-dt * 1.2));
      this.drift += dt * 0.025;
      this.time += dt;
      this.fade = Math.min(1, this.fade + dt / 1.2);
    } else {
      this.fade = 1;
      this.lean.x = this.lean.y = 0;
      this.progressShown = this.progress;
    }
    this.yaw = -0.35 + this.progressShown * 0.7 + Math.sin(this.drift) * 0.12 + this.lean.x * 0.07 + this.hand.yaw;
    const pitch = this.pitch + this.lean.y * -0.04 + this.hand.pitch;
    if (!document.hidden) this.draw(pitch);
    if (moving) this.raf = requestAnimationFrame((t2) => this.frame(t2));
    else this.last = 0;
  }

  private draw(pitch: number) {
    const gl = this.gl, c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = w / h;
    // Back the camera off on narrow screens so the whole cloud stays in view.
    const dist = 4.9 * Math.max(1, 1.6 / aspect);
    const ty = -0.1;
    const proj = perspective((36 * Math.PI) / 180, aspect, 0.1, 40);
    const view = orbit(this.yaw, pitch, dist, ty);
    const eye = [Math.sin(this.yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, Math.cos(this.yaw) * Math.cos(pitch) * dist];
    const fade = this.fade * this.fade * (3 - 2 * this.fade);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    const use = (p: WebGLProgram, buf: WebGLBuffer, attrs: [string, number][]) => {
      gl.useProgram(p);
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uProj'), false, proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uView'), false, view);
      gl.uniform1f(gl.getUniformLocation(p, 'uTime'), this.time);
      gl.uniform1f(gl.getUniformLocation(p, 'uFade'), fade);
      gl.uniform3f(gl.getUniformLocation(p, 'uPaper'), PAPER[0], PAPER[1], PAPER[2]);
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
    let done = use(this.floorProg, this.floorBuf, [['aPos', 3]]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    done();
    if (!this.gasCount) return;
    done = use(this.gasProg, this.gasBuf, [['aPos', 3], ['aNormal', 3], ['aFree', 1]]);
    gl.uniform3f(gl.getUniformLocation(this.gasProg, 'uEye'), eye[0], eye[1], eye[2]);
    gl.drawArrays(gl.TRIANGLES, 0, this.gasCount);
    done();
    // The dust: blended over, never hiding anything.
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
}

const nebulae = new WeakMap<HTMLCanvasElement, Nebula | null>();

/** The nebula on a canvas (made the first time; null where WebGL is unavailable, and the map simply goes without). */
export function nebulaOn(canvas: HTMLCanvasElement): Nebula | null {
  if (!nebulae.has(canvas)) {
    let n: Nebula | null = null;
    try {
      n = new Nebula(canvas);
    } catch {
      n = null;
    }
    nebulae.set(canvas, n);
  }
  return nebulae.get(canvas) ?? null;
}
