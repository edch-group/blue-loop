/**
 * The Captain's base [direction: the campaign's sections spread out like a base, all 3D: a hangar holding the ship,
 * the hero sitting, and a research panel where the general upgrades are taken]: a deck floating on the paper, three
 * stations on it. To the left, the hangar bay, its arch and gantry over the Captain's own ship (as fitted, the map's
 * model); in the middle, the Captain in a command chair on a dais; to the right, the research console, its screen lit
 * and a petal's hologram turning over its pedestal. Each station lights up under the pointer and opens its page.
 *
 * Modelled as the ships are (ship3d.ts's Mesh, box units: 40 to the world's 1; x across, y toward the eye, z up) and
 * drawn with the ships' own shader (nebula-objects.ts), so it is lit and textured as the map's ships are.
 */
import { SHIP_FRAG, SHIP_VERT } from './nebula-objects';
import { captainShip3d, Mesh, SHIP_STRIDE, type CaptainShipSpec, type RGB, type V3 } from './ship3d';
import { uiZoom } from './viewport';

export type BaseZone = 'hangar' | 'captain' | 'research';
export const BASE_ZONES: BaseZone[] = ['hangar', 'captain', 'research'];

/** Where each station stands on the deck (world x, z), and the point its label hangs from (world, above it). */
const SPOT: Record<BaseZone, { x: number; z: number; label: V3; r: number; cx?: number }> = {
  hangar: { x: -2.0, z: -0.15, label: [-1.95, 1.95, -0.3], r: 1.2 },
  captain: { x: 0, z: 0.2, label: [0, 1.6, 0.1], r: 0.75 },
  research: { x: 1.95, z: -0.05, label: [2.35, 1.55, -0.2], r: 1, cx: 0.4 },
};

/** The deck's own material: smooth and pale as the paper, softly lit (no plating's seams or grime at its size). */
const PAPER = 7;

// ---- Colours ----
const DECK: RGB = [0.95, 0.95, 0.96];
const DECK_EDGE: RGB = [0.8, 0.82, 0.86];
const STEEL: RGB = [0.93, 0.94, 0.96];
const STEEL_DARK: RGB = [0.6, 0.63, 0.7];
const WHITE: RGB = [0.95, 0.95, 0.96];
const LAMP: RGB = [1, 0.88, 0.62];
const CYAN: RGB = [0.55, 0.85, 1];
const SCREEN: RGB = [0.42, 0.7, 1];
const HAZARD: RGB = [0.95, 0.72, 0.3];
const COAT: RGB = [0.2, 0.23, 0.32];
const COAT_DARK: RGB = [0.14, 0.15, 0.2];
const BRAID: RGB = [0.86, 0.7, 0.38];
const SKIN: RGB = [0.82, 0.66, 0.55];
const HAIR: RGB = [0.18, 0.15, 0.14];
const BOOT: RGB = [0.12, 0.12, 0.14];
const SEAT: RGB = [0.3, 0.32, 0.38];
const PETAL_GLASS: RGB = [0.66, 0.84, 1];

/** Builds parts placed on the deck at world (x, z): the station's own box units round its centre (box 20, 12). */
function at(m: Mesh, x: number, z: number, build: () => void) {
  m.with((p) => [p[0] + x, p[1], p[2] + z], build);
}

/** Builds parts turned `a` (radians) about the world's x axis, round a point (world). */
function tiltX(m: Mesh, pivot: V3, a: number, build: () => void) {
  const c = Math.cos(a), s = Math.sin(a);
  m.with((p) => {
    const y = p[1] - pivot[1], z = p[2] - pivot[2];
    return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
  }, build);
}

/** Builds parts turned `a` (radians) about the world's up axis, round the origin. */
function turnY(m: Mesh, a: number, build: () => void) {
  const c = Math.cos(a), s = Math.sin(a);
  m.with((p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c], build);
}

/** The deck: a broad oval slab, plated, a lit rim round its edge; a pad under each station. */
function deck(m: Mesh) {
  m.with((p) => [p[0] * 3.45, p[1], p[2] * 1.45], () => {
    m.cyl([20, 12, -9], [20, 12, 0], 40, 40, DECK, PAPER, 96);
    m.cyl([20, 12, -14], [20, 12, -9], 36, 40, DECK_EDGE, PAPER, 96);
    m.ring(20, 12, 0, 39.2, 0.35, 0, CYAN, 2);
  });
  // (Pads: a ring of hazard paint round the hangar's, plain plates for the others.)
  at(m, SPOT.hangar.x, SPOT.hangar.z, () => {
    m.cyl([20, 12, 0], [20, 12, 1.2], 42, 42, WHITE, PAPER, 64);
    m.ring(20, 12, 1.25, 38.5, 0.8, 0, HAZARD, 0);
  });
  at(m, SPOT.research.x, SPOT.research.z, () => m.cyl([32, 10, 0], [32, 10, 1], 37, 37, WHITE, PAPER, 64));
}

/** The hangar bay: an arch behind the ship, a gantry over it with floodlights, clamps under it. */
function hangar(m: Mesh) {
  at(m, SPOT.hangar.x, SPOT.hangar.z, () => {
    // The arch: two piers and a lintel, braced, behind the pad.
    for (const x of [-26, 66]) {
      m.box(x - 4, x + 4, -24, -16, 1, 70, STEEL, 0, 0.6);
      m.box(x - 5.5, x + 5.5, -25.5, -14.5, 1, 6, STEEL_DARK, 0, 0.6);
      // (A strip of lights up each pier.)
      for (let z = 12; z < 64; z += 9) m.box(x + 4, x + 4.6, -21, -19, z, z + 4, LAMP, 2);
    }
    m.box(-30, 70, -24, -16, 66, 74, STEEL, 0, 0.8);
    m.box(-30, 70, -18, -14, 60, 66, STEEL_DARK, 0);
    // Cross-bracing on the back.
    m.cyl([-22, -21, 10], [62, -21, 62], 0.6, 0.6, STEEL_DARK, 0, 8);
    m.cyl([62, -21, 10], [-22, -21, 62], 0.6, 0.6, STEEL_DARK, 0, 8);
    // The gantry: a beam reaching forward over the ship from the lintel, floodlights hanging from it.
    m.box(14, 26, -16, 26, 66, 71, STEEL, 0, 0.5);
    for (const y of [-2, 18]) {
      m.cyl([20, y, 66], [20, y, 61], 1.6, 3.2, STEEL_DARK, 0, 12);
      m.ball(20, y, 60.5, 2.4, LAMP, 2, 12, 6);
    }
    // A crane hook down from the gantry's end.
    m.cyl([20, 22, 66], [20, 22, 44], 0.35, 0.35, STEEL_DARK, 0, 6);
    m.ring(20, 22, 42.5, 2, 0.5, Math.PI / 2, STEEL, 0);
    // Clamps the ship rests on.
    for (const [x, y] of [[4, 12], [34, 4], [34, 20]] as const) {
      m.cyl([x, y, 1], [x, y, 12], 2.4, 1.6, STEEL_DARK, 0, 10);
      m.box(x - 3, x + 3, y - 3, y + 3, 11, 13, STEEL, 0, 0.5);
    }
    // A fuel line snaking from the pier to the ship.
    m.tube([[62, -16, 2], [56, -4, 1.6], [44, 4, 1.6], [36, 10, 6]], 1.1, 1.1, STEEL_DARK, 4, 8);
    // A crate stack by the pad's edge.
    m.box(-22, -12, 24, 34, 1.2, 11, [0.72, 0.66, 0.54], 0, 0.5);
    m.box(-20, -13, 26, 33, 11, 18, [0.68, 0.62, 0.5], 0, 0.5);
  });
}

/** The Captain in a command chair on a round dais, a console's arm at either side. */
function captain(m: Mesh) {
  at(m, SPOT.captain.x, SPOT.captain.z, () => {
    // The dais, stepped.
    m.cyl([20, 12, 0], [20, 12, 2.4], 30, 30, WHITE, PAPER, 64);
    m.cyl([20, 12, 2.4], [20, 12, 4.6], 23, 23, WHITE, PAPER, 64);
    m.ring(20, 12, 4.7, 22.6, 0.45, 0, CYAN, 2);
    // The chair: a pillar, the seat, a tall back with a headrest, wide arms with lit panels.
    m.cyl([20, 8, 4.6], [20, 8, 15], 3.2, 2.4, STEEL_DARK, 0, 14);
    m.box(9, 31, -2, 17, 15, 19.5, SEAT, 0, 1);
    m.box(10, 30, -6, 0, 18, 52, SEAT, 0, 1.2);
    m.box(13, 27, -7, -4, 48, 56, SEAT, 0, 1);
    m.box(9.5, 30.5, -7.5, -5.5, 17, 53, STEEL, 0, 0.4);
    for (const x of [5, 31]) {
      m.box(x, x + 4, -2, 16, 22, 25, STEEL, 0, 0.6);
      m.box(x + 0.4, x + 3.6, 6, 14, 25, 25.6, CYAN, 2);
      m.box(x + 0.5, x + 3.5, 0, 3, 15, 22, STEEL_DARK, 0);
    }
    // The Captain, seated: legs forward and down, coat over a square-shouldered frame, hands on the arms.
    for (const s of [-1, 1]) {
      const x = 20 + s * 4.6;
      m.tube([[x, 0, 22], [x + s * 0.4, 13, 22.5]], 3.5, 3.1, COAT_DARK, 0, 12);
      m.ball(x + s * 0.4, 13, 22.4, 3.1, COAT_DARK, 0, 12, 7);
      m.tube([[x + s * 0.4, 13.5, 21], [x + s * 0.6, 15, 8]], 2.9, 2.4, COAT_DARK, 0, 12);
      m.box(x + s * 0.6 - 2.6, x + s * 0.6 + 2.6, 11.5, 20.5, 4.6, 8.5, BOOT, 4, 0.6);
      m.tube([[x + s * 0.6, 15, 12], [x + s * 0.6, 15.2, 7.5]], 2.9, 2.9, BOOT, 4, 12);
    }
    // The coat: hips and torso, its skirt falling over the seat's front.
    m.orb(20, 2, 18.5, 8.8, 6.5, 5, COAT, 0, false, 20, 10);
    m.orb(20, 0, 23, 8, 5.2, 11.5, COAT, 0, false, 20, 12);
    m.box(12.5, 27.5, 7, 13, 17, 21, COAT, 0, 1.5);
    // Its lapels and a line of braid.
    m.box(19.6, 20.4, 5, 5.6, 26, 43, BRAID, 0);
    for (const s of [-1, 1]) m.box(20 + s * 1.2 - 1.2, 20 + s * 1.2 + 1.2, 4.6, 5.4, 37, 43, COAT_DARK, 0);
    // Shoulders, with epaulettes.
    for (const s of [-1, 1]) {
      m.ball(20 + s * 8, 0, 41, 3.6, COAT, 0, 14, 8);
      m.box(20 + s * 8 - 2.8, 20 + s * 8 + 2.8, -2.4, 2.4, 43.6, 44.8, BRAID, 0, 0.4);
    }
    // Arms: down to the elbows, the forearms along the chair's arms, the hands at their ends.
    for (const s of [-1, 1]) {
      const sx = 20 + s * 9.2;
      m.tube([[sx, 0, 40], [sx + s * 1.6, 2, 30], [sx + s * 2.2, 3, 27.5]], 2.6, 2.2, COAT, 0, 12);
      m.tube([[sx + s * 2.2, 3, 27.5], [sx + s * 2.6, 13, 27]], 2.2, 1.9, COAT, 0, 12);
      m.ball(sx + s * 2.6, 14.6, 27, 1.8, SKIN, 3, 10, 6);
    }
    // Collar, neck and head (looking out over the deck), cropped hair.
    m.cyl([20, 0, 42], [20, 0.4, 45.5], 4.2, 3.4, COAT, 0, 16);
    m.cyl([20, 0.6, 44], [20, 0.8, 47.5], 1.9, 1.9, SKIN, 3, 12);
    m.orb(20, 1.2, 46.5, 3.5, 4, 4.6, SKIN, 3, false, 18, 10);
    m.orb(20, 0.5, 51.3, 3.85, 4.45, 4.8, HAIR, 3, true, 18, 6);
    m.orb(20, -0.6, 47.5, 3.5, 3.2, 4.4, HAIR, 3, false, 16, 8);
    // A data slate on the floor-stand at the Captain's side.
    m.cyl([38, 16, 4.6], [38, 16, 24], 0.7, 0.7, STEEL_DARK, 0, 8);
    tiltX(m, [0.45, 24 / 40, 0.1], -0.6, () => m.box(34, 42, 12, 20, 24, 25, SCREEN, 2));
  });
}

/** The research console: a desk with its screen tilted up, lit, and a pedestal with a ring of light. */
function research(m: Mesh) {
  at(m, SPOT.research.x, SPOT.research.z, () => {
    // The desk, its top sloping toward its user.
    m.box(2, 38, -6, 8, 1, 22, WHITE, PAPER, 0.8);
    m.box(1, 39, -7, 9, 1, 3, STEEL, 0, 0.5);
    tiltX(m, [0, 22 / 40, (8 - 12) / 40], 0.35, () => {
      m.box(2, 38, -2, 10, 22, 24, STEEL, 0, 0.6);
      for (let i = 0; i < 6; i++) m.box(5 + i * 5.2, 8.6 + i * 5.2, 2, 7, 24, 24.6, i % 2 ? CYAN : SCREEN, 2);
    });
    // The screen above it, tipped back, lit, framed.
    tiltX(m, [0, 24 / 40, (-5 - 12) / 40], -0.22, () => {
      m.box(4, 36, -7, -4, 24, 48, STEEL_DARK, 0, 0.4);
      m.box(5.5, 34.5, -4.2, -3.6, 25.5, 46.5, SCREEN, 2);
    });
    // Its stool.
    m.cyl([20, 22, 1], [20, 22, 14], 1, 1, STEEL_DARK, 0, 8);
    m.cyl([20, 22, 14], [20, 22, 16], 6, 6, SEAT, 0, 20);
    // The holo pedestal beside it, a ring of light on top.
    m.cyl([56, 4, 1], [56, 4, 10], 9, 7, WHITE, PAPER, 28);
    m.ring(56, 4, 10.2, 6.6, 0.5, 0, CYAN, 2);
    m.ball(56, 4, 10.8, 2.2, CYAN, 2, 12, 6);
    // Cables from the desk to the pedestal.
    m.tube([[38, 0, 2], [44, 2, 1.4], [48, 4, 1.4]], 0.8, 0.8, STEEL_DARK, 4, 6);
  });
}

/** The petal hologram: six glass petals round a lit heart (the Stellari's), turning over the pedestal. */
function hologram(): Float32Array {
  const m = new Mesh();
  for (let k = 0; k < 6; k++)
    turnY(m, (k / 6) * Math.PI * 2, () =>
      m.with(
        (p) => {
          // (Tipped up from flat, so the flower opens like a cup.)
          const a = 0.8, c = Math.cos(a), s = Math.sin(a);
          return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
        },
        () => m.orb(20 + 7, 12, -0.7, 7, 2.8, 0.7, PETAL_GLASS, 2, false, 16, 8),
      ),
    );
  m.ball(20, 12, 1, 2.2, CYAN, 2, 14, 8);
  return new Float32Array(m.out);
}

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
/** Placed at (x, y, z), turned `yaw` about the up axis, scaled `s`. */
function place(x: number, y: number, z: number, yaw: number, s: number): M4 {
  const c = Math.cos(yaw), n = Math.sin(yaw);
  return new Float32Array([c * s, 0, -n * s, 0, 0, s, 0, 0, n * s, 0, c * s, 0, x, y, z, 1]);
}
const IDENTITY = place(0, 0, 0, 0, 1);

/** The shadow pools under each station: a soft dark disc on the deck (world x, z, radius x, radius z). */
const SHADOWS: [number, number, number, number][] = [
  [SPOT.hangar.x + 0.1, SPOT.hangar.z + 0.05, 1.1, 0.55],
  [SPOT.captain.x, SPOT.captain.z, 0.62, 0.4],
  [SPOT.research.x + 0.4, SPOT.research.z, 0.95, 0.42],
];
const SHADOW_VERT = `
attribute vec2 aPos; attribute vec2 aUv;
uniform mat4 uView; uniform mat4 uProj;
varying vec2 vUv;
void main() { vUv = aUv; gl_Position = uProj * uView * vec4(aPos.x, 0.034, aPos.y, 1.0); }`;
const SHADOW_FRAG = `
precision mediump float;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float a = (1.0 - smoothstep(0.15, 1.0, r)) * 0.16;
  gl_FragColor = vec4(vec3(0.22, 0.24, 0.32) * a, a);
}`;

function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  return p;
}

/** The ships' look, with one thing more: a station under the pointer is lit up, its edges catching the light. */
const BASE_FRAG = SHIP_FRAG.replace('uniform float uBurn;', 'uniform float uBurn; uniform float uHi;')
  .replace(
    'float m = vMat;',
    `float m = vMat;
  if (m > 6.5) {
    vec3 pc = vCol * (0.8 + 0.24 * diff) + vec3(1.0) * pow(max(dot(n, h), 0.0), 40.0) * 0.06;
    pc = mix(pc, sky, fres * 0.25);
    pc = mix(pc, vec3(1.0), uHi * (0.06 + 0.4 * fres));
    gl_FragColor = vec4(min(pc, vec3(1.0)) * uAlpha, uAlpha);
    return;
  }`,
  )
  .replace(
  /gl_FragColor = vec4\(min\(c, vec3\(1\.0\)\) \* uAlpha, uAlpha\);\s*\}\s*$/,
  'c = mix(c, vec3(1.0), uHi * (0.08 + 0.5 * fres));\n  gl_FragColor = vec4(min(c, vec3(1.0)) * uAlpha, uAlpha);\n}',
);

interface Part {
  buf: WebGLBuffer;
  count: number;
  zone: BaseZone | null;
  model: () => M4;
}

/** A base drawn on a canvas: hover a station to light it, ask which station is at a point, where each label goes. */
export class Base3d {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private shadowProg: WebGLProgram;
  private shadowBuf: WebGLBuffer;
  private parts: Part[] = [];
  private raf = 0;
  private last = 0;
  private start = performance.now();
  private hovered: BaseZone | null = null;
  private glow: Record<BaseZone, number> = { hangar: 0, captain: 0, research: 0 };
  private view: M4 = IDENTITY;
  private proj: M4 = IDENTITY;
  private eye: V3 = [0, 2, 6];
  private shipKey = '';
  /** Told after each frame (to lay the labels by their stations). */
  onFrame: (() => void) | null = null;
  /** Covered (a page open over it): not drawn. */
  paused = false;

  private constructor(readonly canvas: HTMLCanvasElement, gl: WebGLRenderingContext, ship: CaptainShipSpec) {
    this.gl = gl;
    gl.getExtension('OES_standard_derivatives');
    this.prog = program(gl, SHIP_VERT, '#extension GL_OES_standard_derivatives : enable\n' + BASE_FRAG.replace('#extension GL_OES_standard_derivatives : enable', ''));
    this.shadowProg = program(gl, SHADOW_VERT, SHADOW_FRAG);
    const quads: number[] = [];
    for (const [x, z, rx, rz] of SHADOWS) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      for (const [u, v] of c) quads.push(x + u * rx, z + v * rz, u, v);
    }
    this.shadowBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quads), gl.STATIC_DRAW);
    const mesh = (build: (m: Mesh) => void) => {
      const m = new Mesh();
      build(m);
      return new Float32Array(m.out);
    };
    this.add(mesh(deck), null, () => IDENTITY);
    this.add(mesh(hangar), 'hangar', () => IDENTITY);
    this.add(mesh(captain), 'captain', () => IDENTITY);
    this.add(mesh(research), 'research', () => IDENTITY);
    // The hologram turns slowly, bobbing, over its pedestal.
    const holo = SPOT.research;
    this.add(hologram(), 'research', () => {
      const t = this.time();
      return place(holo.x + 0.9, 0.72 + 0.03 * Math.sin(t * 1.3), holo.z - 0.2, t * 0.5, 0.95);
    });
    this.setShip(ship);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** A base on this canvas, or null where WebGL isn't to be had. */
  static mount(canvas: HTMLCanvasElement, ship: CaptainShipSpec): Base3d | null {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, depth: true });
    if (!gl) return null;
    return new Base3d(canvas, gl, ship);
  }

  private add(data: Float32Array, zone: BaseZone | null, model: () => M4) {
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.parts.push({ buf, count: data.length / SHIP_STRIDE, zone, model });
  }

  /** The Captain's ship in the bay, as fitted (rebuilt only when it changes). */
  setShip(spec: CaptainShipSpec) {
    const key = JSON.stringify(spec);
    if (key === this.shipKey) return;
    this.shipKey = key;
    this.parts = this.parts.filter((p) => p.model !== this.shipModel);
    const model = captainShip3d(spec);
    this.add(model.mesh, 'hangar', this.shipModel);
  }

  private shipModel = (): M4 => {
    const t = this.time();
    // (Resting on its clamps, lifting and settling a hair as if its engines idled.)
    return place(SPOT.hangar.x + 0.5, 0.38 + 0.008 * Math.sin(t * 1.7), SPOT.hangar.z + 0.05, -0.42, 1.95);
  };

  private time() {
    return (performance.now() - this.start) / 1000;
  }

  hover(zone: BaseZone | null) {
    this.hovered = zone;
  }

  /** The station at a point on the canvas (CSS pixels from its corner, as laid out), if any. */
  zoneAt(x: number, y: number): BaseZone | null {
    let best: BaseZone | null = null, bestK = 1;
    for (const z of BASE_ZONES) {
      const s = SPOT[z];
      const sx = s.x + (s.cx ?? 0);
      const c = this.toScreen([sx, s.r * 0.55, s.z]);
      const e = this.toScreen([sx + s.r, s.r * 0.55, s.z]);
      if (!c || !e) continue;
      const rx = Math.abs(e.x - c.x);
      const k = Math.hypot((x - c.x) / rx, (y - c.y) / (rx * 0.9));
      if (k < bestK) {
        bestK = k;
        best = z;
      }
    }
    return best;
  }

  /** Where a station's label goes on the canvas (CSS pixels, as laid out). */
  labelAt(zone: BaseZone): { x: number; y: number } | null {
    return this.toScreen(SPOT[zone].label);
  }

  private toScreen(p: V3): { x: number; y: number } | null {
    const v = this.view, P = this.proj;
    const ex = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12];
    const ey = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13];
    const ez = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14];
    if (ez >= -0.01) return null;
    const w = -ez;
    return { x: (((P[0] * ex) / w + 1) / 2) * this.canvas.clientWidth, y: ((1 - (P[5] * ey) / w) / 2) * this.canvas.clientHeight };
  }

  private loop(now: number) {
    if (!this.canvas.isConnected) return this.destroy();
    this.raf = requestAnimationFrame(this.loop);
    // (At most 30 frames a second: it is a calm scene.)
    if (now - this.last < 32 || this.paused) return;
    this.last = now;
    this.draw();
    this.onFrame?.();
  }

  private draw() {
    const gl = this.gl, c = this.canvas;
    const lw = c.clientWidth, lh = c.clientHeight;
    if (!lw || !lh) return;
    let dpr = Math.min(2, window.devicePixelRatio || 1) * uiZoom();
    if (lw * lh * dpr * dpr > 4.6e6) dpr = Math.sqrt(4.6e6 / (lw * lh));
    const w = Math.round(lw * dpr), h = Math.round(lh * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const t = this.time();
    // The camera: before the deck, a little above it, drawn back far enough that all three stations fit; swaying.
    const aspect = lw / lh;
    const fov = (30 * Math.PI) / 180;
    const half = Math.tan(fov / 2);
    const dist = Math.max(3.75 / (half * aspect), 1.45 / half);
    const yaw = 0.035 * Math.sin(t * 0.21);
    const dir: V3 = norm3([Math.sin(yaw), 0.42, Math.cos(yaw)]);
    const target: V3 = [0, 0.62, 0];
    this.eye = [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist];
    this.view = lookAt(this.eye, target);
    this.proj = perspective(fov, aspect, 0.1, 60);

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // (Each station's light eases in and out.)
    for (const z of BASE_ZONES) this.glow[z] += ((this.hovered === z ? 1 : 0) - this.glow[z]) * 0.25;

    const p = this.prog;
    gl.useProgram(p);
    const u = (n: string) => gl.getUniformLocation(p, n);
    gl.uniformMatrix4fv(u('uView'), false, this.view);
    gl.uniformMatrix4fv(u('uProj'), false, this.proj);
    gl.uniform3fv(u('uEye'), this.eye);
    gl.uniform3f(u('uColor'), 0.55, 0.62, 0.78);
    gl.uniform1f(u('uTime'), t);
    gl.uniform1f(u('uAlpha'), 1);
    gl.uniform1f(u('uBurn'), 0);
    const attrs: [string, number, number][] = [['aPos', 3, 0], ['aNorm', 3, 3], ['aCol', 3, 6], ['aMat', 1, 9]];
    const locs = attrs.map(([n]) => gl.getAttribLocation(p, n));
    for (const part of this.parts) {
      gl.uniformMatrix4fv(u('uModel'), false, part.model());
      gl.uniform1f(u('uHi'), part.zone ? this.glow[part.zone] : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buf);
      attrs.forEach(([, size, off], i) => {
        if (locs[i] < 0) return;
        gl.enableVertexAttribArray(locs[i]);
        gl.vertexAttribPointer(locs[i], size, gl.FLOAT, false, SHIP_STRIDE * 4, off * 4);
      });
      gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
    locs.forEach((l) => l >= 0 && gl.disableVertexAttribArray(l));

    // The shadows, laid over the deck (blended, not written to depth).
    const sp = this.shadowProg;
    gl.useProgram(sp);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uProj'), false, this.proj);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuf);
    const pa = gl.getAttribLocation(sp, 'aPos'), ua = gl.getAttribLocation(sp, 'aUv');
    gl.enableVertexAttribArray(pa);
    gl.enableVertexAttribArray(ua);
    gl.vertexAttribPointer(pa, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(ua, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLES, 0, SHADOWS.length * 6);
    gl.disableVertexAttribArray(pa);
    gl.disableVertexAttribArray(ua);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
