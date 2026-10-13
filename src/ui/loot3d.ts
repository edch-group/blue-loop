/**
 * Rewards as things [direction: ship parts and petals 3D objects, as the rest of the rewards are]: a Stellari petal and
 * each kind of ship part, modelled and lit as the menu's ship is (its materials and shader), turning slowly in their
 * loot tiles. One small WebGL canvas, kept, draws each in turn and copies it into its tile's own canvas.
 */
import type { PartKind } from '../engine/parts';
import { SHIP_FRAG, SHIP_VERT } from './nebula-objects';
import { lookAt, mul, perspective, program, rotX, rotY, scale, type M4 } from './base3d';
import { Mesh, SHIP_STRIDE, type RGB, type V3 } from './ship3d';

// (Materials: 0 plated metal, 1 glass or crystal, 2 glowing, 3 living, 4 dark gloss, 7 pearl: nebula-objects.ts.)
const METAL = 0, GLASS = 1, GLOW = 2, SOFT = 3, GLOSS = 4, PEARL_MAT = 7;

/** A part's colours by its rarity: its plating, its trim, its light. */
const RARITY: Record<string, { plate: RGB; trim: RGB; light: RGB }> = {
  dwarf: { plate: [0.62, 0.66, 0.72], trim: [0.38, 0.46, 0.58], light: [0.55, 0.78, 1] },
  stellar: { plate: [0.7, 0.66, 0.58], trim: [0.86, 0.64, 0.28], light: [1, 0.82, 0.45] },
  anomaly: { plate: [0.6, 0.56, 0.7], trim: [0.5, 0.36, 0.78], light: [0.8, 0.62, 1] },
};
const DARK: RGB = [0.18, 0.19, 0.22];

/** A Stellari petal: long and curved, pearl white, a blue vein down it, faintly lit within. Box units, centred on (20, 12, 0). */
function petal(m: Mesh) {
  const rows = 18, cols = 10, L = 30, W = 8.5;
  const at = (r: number, c: number): V3 => {
    const t = r / rows, u = c / cols - 0.5;
    const w = W * Math.sin(Math.PI * Math.pow(t, 0.85)) * (1 - 0.15 * t);
    // (Cupped across, and bowed along: a petal's curve.)
    return [20 + u * 2 * w, 12 + 3.2 * (u * 2) * (u * 2) - 2.4 * Math.sin(Math.PI * t), -L / 2 + L * t];
  };
  const pearl: RGB = [1, 1, 1], edge: RGB = [0.86, 0.9, 1];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const col = c === 0 || c === cols - 1 ? edge : pearl;
      const a = at(r, c), b = at(r, c + 1), d = at(r + 1, c), e = at(r + 1, c + 1);
      const P = (p: V3): V3 => [(p[0] - 20) / 40, p[2] / 40, (p[1] - 12) / 40];
      m.tri(P(a), P(b), P(e), col, SOFT);
      m.tri(P(a), P(e), P(d), col, SOFT);
    }
  // The vein, glowing faintly.
  const vein: V3[] = Array.from({ length: 9 }, (_, i) => {
    const p = at(1 + i * 2, cols / 2);
    return [p[0], p[1] - 0.25, p[2]];
  });
  m.tube(vein, 0.35, 0.15, [0.62, 0.78, 1], GLOW, 8);
}

/** A ship part of a kind, in its rarity's colours. */
function part(m: Mesh, kind: PartKind, rarity: string) {
  const c = RARITY[rarity] ?? RARITY.dwarf;
  if (kind === 'armour') {
    // A hull plate, facing out: thick, its edges bevelled, a raised boss and a band of trim across, rivets round it.
    m.rbox(20, 12, 0, 11, 1.6, 8.5, c.plate, METAL, 5, 5);
    m.rbox(20, 13.3, 0, 7.5, 0.6, 5, c.plate, METAL, 4, 4);
    m.rbox(20, 13.5, 0, 11.1, 0.7, 0.9, c.trim, METAL, 4, 4);
    for (const x of [-9.4, -3.1, 3.1, 9.4]) for (const z of [6.9, -6.9]) m.ball(20 + x, 13.4, z, 0.6, DARK, METAL, 8, 5);
  } else if (kind === 'shield') {
    // An emitter: a squat drum, a glowing lens dome, vanes round it, a mounting ring.
    m.cyl([20, 12, -8], [20, 12, -2], 7, 6.4, c.plate, METAL, 24);
    m.ring(20, 12, -2, 6.6, 0.5, 0, c.trim, METAL);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      m.rbox(20 + Math.cos(a) * 7.4, 12 + Math.sin(a) * 7.4, -5, 1, 1, 3, c.trim, METAL, 3, 3);
    }
    m.orb(20, 12, -2, 5.4, 5.4, 6, c.light, GLASS, true, 24, 10);
    m.ball(20, 12, 1.5, 2, [1, 1, 1], GLOW, 12, 8);
  } else if (kind === 'weapon') {
    // A turret: a round base, a housing, twin barrels with muzzles, its sights lit.
    m.cyl([20, 12, -9], [20, 12, -6], 7, 7, DARK, METAL, 24);
    m.rbox(20, 12, -2.5, 6, 5, 3.6, c.plate, METAL, 3, 3);
    for (const sd of [-1.8, 1.8]) {
      m.cyl([20, 12 + sd, -1.5], [20 + 14, 12 + sd, 1.5], 0.9, 0.8, c.plate, METAL, 12);
      m.cyl([20 + 13, 12 + sd, 1.3], [20 + 15.5, 12 + sd, 1.8], 1.2, 1.2, c.trim, METAL, 12);
    }
    m.ball(16, 12, 1, 1, c.light, GLOW, 10, 6);
  } else if (kind === 'booster') {
    // A nacelle: a long rounded pod, its nozzle bell, burning.
    m.rbox(20, 12, 2, 4.6, 4.6, 10, c.plate, METAL, 2.2, 2.6);
    m.ring(20, 12, 6, 4.8, 0.5, 0, c.trim, METAL);
    m.cyl([20, 12, -8], [20, 12, -12], 3.6, 5.2, DARK, GLOSS, 20);
    m.ball(20, 12, -11, 3.4, c.light, GLOW, 14, 8);
  } else {
    // A warp coil: a ring round a glowing core, struts in.
    m.ring(20, 12, 0, 9, 1.6, Math.PI / 2, c.plate, METAL);
    m.ring(20, 12, 0, 9, 0.6, Math.PI / 2, c.trim, METAL);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      m.cyl([20 + Math.cos(a) * 3, 12, Math.sin(a) * 3], [20 + Math.cos(a) * 8, 12, Math.sin(a) * 8], 0.5, 0.5, DARK, METAL, 8);
    }
    m.ball(20, 12, 0, 3, c.light, GLOW, 16, 10);
  }
}

/**
 * The loot cache [direction: futuristic loot, not a treasure chest; more alien, smooth edges, a 3D object]: a smooth
 * pearl-white pod, its upper shell lifted a finger's width off the lower, a ring of cold light in the gap between;
 * three dark ribs curving over it from below, lights set along them; a glowing nub at its crown and a light under it.
 */
function cache(m: Mesh) {
  const PEARL: RGB = [0.93, 0.94, 0.97], RIB: RGB = [0.3, 0.34, 0.42], LIGHT: RGB = [0.7, 0.9, 1];
  // The lower body, the core's light in the seam, and the upper shell over it.
  m.orb(20, 12, -9, 12, 12, 9, PEARL, PEARL_MAT, false, 48, 24);
  m.ring(20, 12, 0.4, 12.1, 0.45, 0, LIGHT, GLOW);
  m.orb(20, 12, 0.9, 12.3, 12.3, 7.4, PEARL, PEARL_MAT, true, 48, 14);
  // Ribs: from under it, up its side and over the shell toward the crown, each set with lights.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const pts: V3[] = Array.from({ length: 12 }, (_, k) => {
      const t = k / 11, ph = -1.2 + t * 2.35;
      const r = 12.6 * Math.cos(ph), z = (ph < 0 ? 9.6 : 8.2) * Math.sin(ph) + 0.4;
      return [20 + Math.cos(a) * r, 12 + Math.sin(a) * r, z];
    });
    m.tube(pts, 0.9, 0.45, RIB, PEARL_MAT, 12);
    for (const k of [3, 6]) m.ball(pts[k][0], pts[k][1], pts[k][2], 0.55, LIGHT, GLOW, 8, 5);
  }
  // A nub of light at its crown, and a light under it.
  m.orb(20, 12, 8, 2.4, 2.4, 1.2, RIB, PEARL_MAT, true, 20, 6);
  m.ball(20, 12, 9.4, 1.3, LIGHT, GLOW, 12, 8);
  m.ball(20, 12, -9.2, 1.6, LIGHT, GLOW, 12, 8);
}

/** What a tile shows: a petal, the loot cache, or a part (its kind and rarity). */
export type Loot3dKind = { petal: true } | { cache: true } | { part: PartKind; rarity: string };

class Renderer {
  private canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext | null;
  private prog: WebGLProgram | null = null;
  private meshes = new Map<string, { buf: WebGLBuffer; count: number }>();
  private tiles = new Set<{ el: HTMLCanvasElement; key: string; build: (m: Mesh) => void; phase: number }>();
  private raf = 0;
  private start = performance.now();

  constructor() {
    this.canvas.width = this.canvas.height = 256;
    this.gl = this.canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    // (The materials' seams need screen-space derivatives.)
    this.gl?.getExtension('OES_standard_derivatives');
    if (this.gl) this.prog = program(this.gl, SHIP_VERT, SHIP_FRAG.replace(/float flick = [^;]*;/, 'float flick = 1.0;'));
  }

  get ok() {
    return !!this.gl;
  }

  add(el: HTMLCanvasElement, what: Loot3dKind) {
    const key = 'petal' in what ? 'petal' : 'cache' in what ? 'cache' : `${what.part}:${what.rarity}`;
    const build = 'petal' in what ? petal : 'cache' in what ? cache : (m: Mesh) => part(m, what.part, what.rarity);
    this.tiles.add({ el, key, build, phase: this.tiles.size * 1.7 });
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  private mesh(key: string, build: (m: Mesh) => void) {
    let got = this.meshes.get(key);
    if (!got) {
      const m = new Mesh();
      build(m);
      const data = new Float32Array(m.out);
      const gl = this.gl!;
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      got = { buf, count: data.length / SHIP_STRIDE };
      this.meshes.set(key, got);
    }
    return got;
  }

  private frame() {
    this.raf = 0;
    for (const t of [...this.tiles]) if (!t.el.isConnected) this.tiles.delete(t);
    if (!this.tiles.size || !this.gl || !this.prog) return;
    const gl = this.gl, pr = this.prog;
    const time = (performance.now() - this.start) / 1000;
    const S = this.canvas.width;
    gl.viewport(0, 0, S, S);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(pr);
    const u = (n: string) => gl.getUniformLocation(pr, n);
    const eye: V3 = [0, 0.18, 2.2];
    gl.uniformMatrix4fv(u('uView'), false, lookAt(eye, [0, 0, 0]));
    gl.uniformMatrix4fv(u('uProj'), false, perspective((30 * Math.PI) / 180, 1, 0.05, 20));
    gl.uniform3fv(u('uEye'), eye);
    gl.uniform3f(u('uColor'), 0.86, 0.62, 0.26);
    gl.uniform1f(u('uTime'), time);
    gl.uniform1f(u('uAlpha'), 1);
    gl.uniform1f(u('uBurn'), 0.6);
    const attrs: [string, number, number][] = [['aPos', 3, 0], ['aNorm', 3, 3], ['aCol', 3, 6], ['aMat', 1, 9]];
    const locs = attrs.map(([n]) => gl.getAttribLocation(pr, n));
    for (const t of this.tiles) {
      const { buf, count } = this.mesh(t.key, t.build);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // Turning slowly, tipped toward the eye, rocking a little. (A petal, thin, only swings to and fro: never seen edge on.)
      const petal = t.key === 'petal', pod = t.key === 'cache';
      const turn = petal ? 0.7 * Math.sin(time * 0.8 + t.phase) : time * (pod ? 0.35 : 0.7) + t.phase;
      const model: M4 = mul(rotX((petal ? 0.15 : pod ? 0.42 : 0.35) + 0.08 * Math.sin(time * 0.9 + t.phase)), mul(rotY(turn), scale(petal ? 1.55 : pod ? 1.75 : 1.5)));
      gl.uniformMatrix4fv(u('uModel'), false, model);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      attrs.forEach(([, size, off], i) => {
        if (locs[i] < 0) return;
        gl.enableVertexAttribArray(locs[i]);
        gl.vertexAttribPointer(locs[i], size, gl.FLOAT, false, SHIP_STRIDE * 4, off * 4);
      });
      gl.drawArrays(gl.TRIANGLES, 0, count);
      const ctx = t.el.getContext('2d');
      if (!ctx) continue;
      if (t.el.width !== S) t.el.width = t.el.height = S;
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(this.canvas, 0, 0);
    }
    locs.forEach((l) => l >= 0 && gl.disableVertexAttribArray(l));
    this.raf = requestAnimationFrame(() => this.frame());
  }
}

let renderer: Renderer | null = null;

/** Every `canvas[data-loot3d]` under `root` turned into its thing, turning (left as it is, without WebGL). */
export function mountLoot3d(root: ParentNode) {
  const els = root.querySelectorAll<HTMLCanvasElement>('canvas[data-loot3d]:not([data-loot3d-on])');
  if (!els.length) return false;
  renderer ??= new Renderer();
  if (!renderer.ok) return false;
  for (const el of els) {
    el.dataset.loot3dOn = '1';
    const [kind, rarity] = el.dataset.loot3d!.split(':');
    renderer.add(el, kind === 'petal' ? { petal: true } : kind === 'cache' ? { cache: true } : { part: kind as PartKind, rarity: rarity ?? 'dwarf' });
  }
  return true;
}
