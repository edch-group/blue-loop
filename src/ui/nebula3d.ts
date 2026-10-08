/**
 * The campaign map's nebula: a real 3D object behind the strip, drawn in the battle board's schematic style.
 *
 * Its shape (nebula-geometry.ts, worked out once per universe in a worker) is a cloud bank with a few pillars
 * rising out of it, built up like a laser-cut contour model: a dozen solid layers, each with its top filled,
 * its walls shaded by the way they face the light, and a single ink outline. It is opaque, so what is near
 * hides what is behind, and the far side fades a little into the paper.
 *
 * It is drawn with WebGL from a camera of its own that can turn: it drifts slowly, leans toward the pointer,
 * turns as the flagship advances along the strip, and a drag across the map turns it by hand.
 */

import { buildNebula, type Geometry } from './nebula-geometry';

/** The board's paper (#f4f3ef), which everything fades into. */
const PAPER = [0.957, 0.953, 0.937];

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
          resolve({ faces: e.data.faces, lines: e.data.lines });
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

// ---------- drawing ----------

const FACE_VERT = `
attribute vec3 aPos; attribute float aTone; attribute float aKind;
uniform mat4 uView; uniform mat4 uProj;
varying float vTone; varying float vKind; varying float vDist; varying vec3 vWorld;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  gl_Position = uProj * v;
  vTone = aTone;
  vKind = aKind;
  vDist = -v.z;
  vWorld = aPos;
}`;

/**
 * Everything is the battle board: flat faces (the model's layers and the floor) are its paper, with its dotted
 * grid and its schematic rings drawn into them; walls are its grey front edge, shaded by the light. Far off,
 * it all fades into the paper.
 */
const FACE_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying float vTone; varying float vKind; varying float vDist; varying vec3 vWorld;
uniform vec3 uPaper; uniform float uFade;
float aa(float d, float w) { return 1.0 - smoothstep(0.0, w, d); }
void main() {
  vec3 c;
  if (vKind < 0.5) {
    c = mix(vec3(0.925, 0.925, 0.915), vec3(0.995, 0.994, 0.99), vTone);
    vec2 p = vWorld.xz;
    // The dotted grid.
    float S = 0.17;
    vec2 g = abs(fract(p / S + 0.5) - 0.5) * S;
    float dd = length(g);
    float w = max(fwidth(dd), 1e-4);
    float dotv = 1.0 - smoothstep(0.011 - w, 0.011 + w, dd);
    // Its schematic rings round the middle, as round the board's star.
    float r = length(p);
    float RS = 0.42;
    float rd = abs(fract(r / RS + 0.5) - 0.5) * RS;
    float ring = aa(rd, max(fwidth(r), 1e-4) * 1.1) * step(0.55, r);
    // Small detail fades out with distance before it can shimmer.
    float near = 1.0 - smoothstep(6.0, 14.0, vDist);
    c = mix(c, vec3(0.47, 0.53, 0.67), dotv * 0.42 * near);
    c = mix(c, vec3(0.55, 0.59, 0.69), ring * 0.38 * near);
  } else {
    // The board's front edge: #dcdbd5 where lit, a cool grey in shadow.
    c = mix(vec3(0.74, 0.76, 0.81), vec3(0.90, 0.895, 0.875), vTone);
  }
  float fog = smoothstep(4.5, 22.0, vDist);
  c = mix(c, uPaper, fog);
  gl_FragColor = vec4(c * uFade + uPaper * (1.0 - uFade), 1.0);
}`;

const LINE_VERT = `
attribute vec3 aPos;
uniform mat4 uView; uniform mat4 uProj;
varying float vFog;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  gl_Position = uProj * v;
  vFog = smoothstep(4.5, 16.0, -v.z);
}`;

const LINE_FRAG = `
precision mediump float;
varying float vFog;
uniform float uFade;
void main() {
  // Drawn in, as the board's schematic lines are.
  float a = 0.55 * (1.0 - vFog) * uFade;
  gl_FragColor = vec4(vec3(0.40, 0.46, 0.60) * a, a);
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

/** The camera on a sphere round the volume: turned by yaw, raised by pitch (radians), looking at its middle. */
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
  private faceProg: WebGLProgram;
  private lineProg: WebGLProgram;
  private faceBuf: WebGLBuffer;
  private lineBuf: WebGLBuffer;
  private faceCount = 0;
  private lineCount = 0;
  private seed = -1;
  private raf = 0;
  private last = 0;
  private reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Where the camera is, and where it is easing toward. */
  private yaw = 0;
  private pitch = 0.5;
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
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, depth: true });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    gl.getExtension('OES_standard_derivatives');
    const program = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
      gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      return p;
    };
    this.faceProg = program(FACE_VERT, FACE_FRAG);
    this.lineProg = program(LINE_VERT, LINE_FRAG);
    this.faceBuf = gl.createBuffer()!;
    this.lineBuf = gl.createBuffer()!;
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
        gl.bindBuffer(gl.ARRAY_BUFFER, this.faceBuf);
        gl.bufferData(gl.ARRAY_BUFFER, g.faces, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
        gl.bufferData(gl.ARRAY_BUFFER, g.lines, gl.STATIC_DRAW);
        this.faceCount = g.faces.length / 5;
        this.lineCount = g.lines.length / 3;
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
    this.hand.pitch = Math.max(-0.3, Math.min(0.5, this.hand.pitch + dy * 0.003));
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
    // Ease toward the pointer's lean and the flagship's progress; drift slowly unless motion is reduced.
    const k = 1 - Math.exp(-dt * 3);
    const moving = !this.reduce;
    if (moving) {
      this.lean.x += (this.lean.tx - this.lean.x) * k;
      this.lean.y += (this.lean.ty - this.lean.y) * k;
      this.progressShown += (this.progress - this.progressShown) * (1 - Math.exp(-dt * 1.2));
      this.drift += dt * 0.025;
      this.fade = Math.min(1, this.fade + dt / 1.2);
    } else {
      this.fade = 1;
      this.lean.x = this.lean.y = 0;
      this.progressShown = this.progress;
    }
    this.yaw = -0.35 + this.progressShown * 0.7 + Math.sin(this.drift) * 0.12 + this.lean.x * 0.07 + this.hand.yaw;
    const pitch = this.pitch + this.lean.y * -0.04 + this.hand.pitch;
    const still = Math.abs(this.lean.tx - this.lean.x) < 1e-3 && Math.abs(this.lean.ty - this.lean.y) < 1e-3 && Math.abs(this.progress - this.progressShown) < 1e-3;
    if (!document.hidden) this.draw(pitch);
    // Keep running while anything moves (the drift always does, unless motion is reduced).
    if (moving || !still) this.raf = requestAnimationFrame((t2) => this.frame(t2));
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
    // The paper itself (the floor fades into it at the horizon), so the whole picture is one.
    gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.faceCount) return;
    const aspect = w / h;
    // Back the camera off on narrow screens so the whole model stays in view.
    const dist = 4.6 * Math.max(1, 1.6 / aspect);
    const proj = perspective((36 * Math.PI) / 180, aspect, 0.1, 40);
    const view = orbit(this.yaw, pitch, dist, -0.2);
    const fade = this.fade * this.fade * (3 - 2 * this.fade);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const use = (p: WebGLProgram, buf: WebGLBuffer, stride: number) => {
      gl.useProgram(p);
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uProj'), false, proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uView'), false, view);
      gl.uniform1f(gl.getUniformLocation(p, 'uFade'), fade);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const pos = gl.getAttribLocation(p, 'aPos');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, stride, 0);
      return p;
    };
    // The solid model first, pushed back a hair so the outlines on its edges win.
    const fp = use(this.faceProg, this.faceBuf, 20);
    const tone = gl.getAttribLocation(fp, 'aTone'), kind = gl.getAttribLocation(fp, 'aKind');
    gl.enableVertexAttribArray(tone);
    gl.vertexAttribPointer(tone, 1, gl.FLOAT, false, 20, 12);
    gl.enableVertexAttribArray(kind);
    gl.vertexAttribPointer(kind, 1, gl.FLOAT, false, 20, 16);
    gl.uniform3f(gl.getUniformLocation(fp, 'uPaper'), PAPER[0], PAPER[1], PAPER[2]);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 2);
    gl.drawArrays(gl.TRIANGLES, 0, this.faceCount);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disableVertexAttribArray(tone);
    gl.disableVertexAttribArray(kind);
    use(this.lineProg, this.lineBuf, 12);
    gl.drawArrays(gl.LINES, 0, this.lineCount);
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
