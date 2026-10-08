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
attribute vec3 aPos; attribute float aTone;
uniform mat4 uView; uniform mat4 uProj;
varying float vTone; varying float vFog;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  gl_Position = uProj * v;
  vTone = aTone;
  // The far side fades a little into the paper, so the model has depth.
  vFog = clamp((-v.z - 3.4) / 4.0, 0.0, 0.55);
}`;

const FACE_FRAG = `
precision mediump float;
varying float vTone; varying float vFog;
uniform vec3 uPaper; uniform float uFade;
void main() {
  // The board's own greys: shaded walls slate, lit faces near the paper's white.
  vec3 shade = vec3(0.70, 0.73, 0.80);
  vec3 lit = vec3(0.985, 0.984, 0.975);
  vec3 c = mix(mix(shade, lit, vTone), uPaper, vFog);
  gl_FragColor = vec4(c * uFade, uFade);
}`;

const LINE_VERT = `
attribute vec3 aPos;
uniform mat4 uView; uniform mat4 uProj;
varying float vFog;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  gl_Position = uProj * v;
  vFog = clamp((-v.z - 3.4) / 4.0, 0.0, 0.7);
}`;

const LINE_FRAG = `
precision mediump float;
varying float vFog;
uniform float uFade;
void main() {
  float a = 0.6 * (1.0 - vFog) * uFade;
  gl_FragColor = vec4(vec3(0.33, 0.39, 0.53) * a, a);
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
        this.faceCount = g.faces.length / 4;
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
    gl.clearColor(0, 0, 0, 0);
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
    const fp = use(this.faceProg, this.faceBuf, 16);
    const tone = gl.getAttribLocation(fp, 'aTone');
    gl.enableVertexAttribArray(tone);
    gl.vertexAttribPointer(tone, 1, gl.FLOAT, false, 16, 12);
    gl.uniform3f(gl.getUniformLocation(fp, 'uPaper'), 0.957, 0.953, 0.937);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 2);
    gl.drawArrays(gl.TRIANGLES, 0, this.faceCount);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disableVertexAttribArray(tone);
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
