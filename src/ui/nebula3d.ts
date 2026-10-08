/**
 * The campaign map's nebula: a real 3D object behind the strip, drawn as a schematic in the battle board's
 * style (fine ink lines and dots on the paper).
 *
 * A volume of gas is worked out once per universe (seeded): a dark cloud bank with pillars rising out of it
 * toward the light overhead, knotted at their heads, and thin torn veils above, all frayed by warped noise.
 * It is cut into horizontal slices and each slice's outline traced (marching squares), so the cloud reads
 * as a stack of contour lines, as a survey would draw it; dust hangs as dots, and a dotted floor grid lies
 * beneath. Where the light from above reaches a surface its lines turn gold, as the lit edges of a real
 * nebula glow.
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
          resolve({ lines: e.data.lines, dots: e.data.dots });
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

const VERT = `
attribute vec3 aPos; attribute float aLit; attribute float aWeight;
uniform mat4 uView; uniform mat4 uProj; uniform float uPx; uniform float uDot;
varying float vLit; varying float vAlpha;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  gl_Position = uProj * v;
  float dist = -v.z;
  // Farther lines fade into the paper, so the volume has depth.
  float fog = clamp((8.5 - dist) / 5.0, 0.0, 1.0);
  vLit = aLit;
  vAlpha = (aWeight < 0.0 ? -aWeight : aWeight) * fog;
  if (aWeight < -0.5) vAlpha = -aWeight * 0.9;   // far stars: no fog
  gl_PointSize = uDot * aLit * uPx * clamp(3.4 / dist, 0.6, 1.6);
}`;

const FRAG = `
precision mediump float;
varying float vLit; varying float vAlpha;
uniform float uDots; uniform float uFade;
void main() {
  vec3 ink = vec3(0.33, 0.39, 0.53);
  vec3 gold = vec3(0.86, 0.58, 0.24);
  float a = vAlpha;
  vec3 c = ink;
  if (uDots > 0.5) {
    vec2 p = gl_PointCoord - 0.5;
    a *= smoothstep(0.5, 0.2, length(p)) * 0.42;
  } else {
    // Lit surfaces glow gold, the rest is ink; chart crosses (lit 2) are gold.
    float g = vLit > 1.5 ? 1.0 : smoothstep(0.55, 0.95, vLit);
    c = mix(ink, gold, g);
    a *= mix(0.26, 0.6, g);
  }
  a *= uFade;
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
  private prog: WebGLProgram;
  private lineBuf: WebGLBuffer;
  private dotBuf: WebGLBuffer;
  private lineCount = 0;
  private dotCount = 0;
  private seed = -1;
  private raf = 0;
  private last = 0;
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
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    this.prog = p;
    this.lineBuf = gl.createBuffer()!;
    this.dotBuf = gl.createBuffer()!;
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
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
        gl.bufferData(gl.ARRAY_BUFFER, g.lines, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dotBuf);
        gl.bufferData(gl.ARRAY_BUFFER, g.dots, gl.STATIC_DRAW);
        this.lineCount = g.lines.length / 5;
        this.dotCount = g.dots.length / 5;
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
    this.hand.pitch = Math.max(-0.3, Math.min(0.55, this.hand.pitch + dy * 0.003));
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
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    if (!this.lineCount) return;
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uFade'), this.fade * this.fade * (3 - 2 * this.fade));
    const aspect = w / h;
    // Back the camera off on narrow screens so the whole cloud stays in view.
    const dist = 4.3 * Math.max(1, 1.6 / aspect);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uProj'), false, perspective((38 * Math.PI) / 180, aspect, 0.1, 40));
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uView'), false, orbit(this.yaw, pitch, dist, -0.15));
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uPx'), dpr);
    const pos = gl.getAttribLocation(this.prog, 'aPos'), lit = gl.getAttribLocation(this.prog, 'aLit'), wt = gl.getAttribLocation(this.prog, 'aWeight');
    const bind = (buf: WebGLBuffer) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(pos);
      gl.enableVertexAttribArray(lit);
      gl.enableVertexAttribArray(wt);
      gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(lit, 1, gl.FLOAT, false, 20, 12);
      gl.vertexAttribPointer(wt, 1, gl.FLOAT, false, 20, 16);
    };
    bind(this.dotBuf);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uDots'), 1);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uDot'), 1.6);
    gl.drawArrays(gl.POINTS, 0, this.dotCount);
    bind(this.lineBuf);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uDots'), 0);
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
