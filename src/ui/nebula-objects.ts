/**
 * The campaign map's things as 3D objects in the nebula's space (see nebula3d.ts): each system's star a shaded
 * sphere (a gold sun, a red or brown dwarf, a searing white dwarf, a neutron star with sweeping beams, the
 * wormhole's white glare), ringed in its holder's colour when it is held; and the anomalies: a black hole (a
 * black sphere in a turning gold accretion disc), a pulsar (a white core and two beams wheeling round), dark
 * matter (dark motes orbiting nothing) and a nebula (pale puffs turning slowly). Each drawn as the board would:
 * a fine ink line round its edge. Drawn over the map (so the routes run into them), hidden by any gas between
 * them and the eye.
 */

import type { Camera } from './nebula3d';

/** One thing to draw: where it stands on the map's plane (world x, z), what it is, and how it looks. */
export interface MapObject {
  x: number;
  z: number;
  kind: 'yellow' | 'red' | 'white' | 'brown' | 'neutron' | 'heart' | 'blackHole' | 'pulsar' | 'darkMatter' | 'nebula';
  /** The holder's colour (a ring round the star), if held. */
  ring?: [number, number, number];
  /** Dimmed (collapsing, out of reach): drawn faded and grey. */
  dim?: boolean;
  /** Gone (collapsed, ruined): a small grey ember. */
  dead?: boolean;
  /** A stable number to vary each one by (spin, phase). */
  seed: number;
  /** What floats over it: a space station (spent once sold out or taken), a garrison of so many, damage. */
  marks?: { armory?: boolean; research?: boolean; spent?: boolean; garrison?: number; damage?: number };
}

/** Every system's star alike, in the board's paper (its kind is told in its popover, not its look). */
const PAPER_STAR: [number, number, number] = [0.975, 0.97, 0.955];
const STAR: Record<string, { c: [number, number, number]; r: number }> = Object.fromEntries(
  ['yellow', 'red', 'white', 'brown', 'neutron', 'heart'].map((k) => [k, { c: PAPER_STAR, r: k === 'heart' ? 0.05 : 0.036 }]),
);
const INK: [number, number, number] = [0.45, 0.5, 0.63];
const RED_INK: [number, number, number] = [0.78, 0.36, 0.32];

const SOLID_VERT = `
attribute vec3 aPos; attribute vec3 aNorm;
uniform mat4 uView; uniform mat4 uProj; uniform mat4 uModel;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(uModel) * aNorm);
  vL = aNorm;
  gl_Position = uProj * uView * w;
}`;

/**
 * kind 0: a glowing sphere (bright where it faces the eye, deepening toward its edge, an ink line round it);
 * 1: a black sphere; 2: an accretion disc (vL.x how far out, vL.y round); 3: a beam (vL.x how far along).
 */
const SOLID_FRAG = `
precision highp float;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
uniform vec3 uEye; uniform vec3 uColor; uniform float uKind; uniform float uTime; uniform float uAlpha;
void main() {
  vec3 v = normalize(uEye - vW);
  float ndv = abs(dot(normalize(vN), v));
  vec3 ink = vec3(0.40, 0.46, 0.60);
  if (uKind < 0.5) {
    float lit = max(0.0, dot(normalize(vN), normalize(vec3(0.5, 0.8, 0.35))));
    vec3 c = mix(uColor * 0.72, mix(uColor, vec3(1.0), 0.5), clamp(0.35 * pow(ndv, 1.4) + 0.65 * lit, 0.0, 1.0));
    c = mix(c, ink, (1.0 - smoothstep(0.12, 0.32, ndv)) * 0.55);
    gl_FragColor = vec4(c * uAlpha, uAlpha);
  } else if (uKind < 1.5) {
    vec3 c = mix(vec3(0.05, 0.05, 0.07), vec3(0.32, 0.33, 0.38), pow(1.0 - ndv, 3.0));
    gl_FragColor = vec4(c * uAlpha, uAlpha);
  } else if (uKind < 2.5) {
    float out_ = vL.x;
    float swirl = 0.5 + 0.5 * sin(vL.y * 10.0 - uTime * 2.2 + out_ * 9.0);
    vec3 c = mix(vec3(0.99, 0.985, 0.97), vec3(0.45, 0.5, 0.63), out_);
    float a = (1.0 - smoothstep(0.55, 1.0, out_)) * (0.55 + 0.45 * swirl) * 0.9 * uAlpha;
    gl_FragColor = vec4(c * a, a);
  } else {
    float a = (1.0 - vL.x) * 0.5 * uAlpha;
    gl_FragColor = vec4(uColor * a, a);
  }
}`;

/** A camera-facing disc: a soft glow (kind 0) or a fine ring (kind 1). */
const SPRITE_VERT = `
attribute vec2 aCorner;
uniform mat4 uView; uniform mat4 uProj; uniform vec3 uCenter; uniform float uSize;
varying vec2 vUV;
void main() {
  vec4 v = uView * vec4(uCenter, 1.0);
  v.xy += aCorner * uSize;
  vUV = aCorner;
  gl_Position = uProj * v;
}`;

const SPRITE_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vUV;
uniform vec3 uColor; uniform float uKind; uniform float uAlpha;
void main() {
  float r = length(vUV);
  float a;
  if (uKind < 0.5) a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r)) * 0.55;
  else {
    float w = max(fwidth(r), 1e-4);
    a = (1.0 - smoothstep(0.0, w * 1.6, abs(r - 0.82))) * 0.95;
  }
  a *= uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`;

function program(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('map objects shader');
  return p;
}

/** A unit sphere, as triangles: position and normal (the same) per vertex. */
function sphere(): Float32Array {
  const out: number[] = [];
  const S = 18, R = 12;
  const at = (i: number, j: number) => {
    const t = (i / S) * Math.PI * 2, p = (j / R) * Math.PI;
    const x = Math.sin(p) * Math.cos(t), y = Math.cos(p), z = Math.sin(p) * Math.sin(t);
    return [x, y, z, x, y, z];
  };
  for (let j = 0; j < R; j++)
    for (let i = 0; i < S; i++) out.push(...at(i, j), ...at(i + 1, j), ...at(i + 1, j + 1), ...at(i, j), ...at(i + 1, j + 1), ...at(i, j + 1));
  return new Float32Array(out);
}

/** A flat ring from radius 1 to 2.6, as triangles: position, then (how far out 0 to 1, angle, 0). */
function disc(): Float32Array {
  const out: number[] = [];
  const N = 64, r0 = 1, r1 = 2.6;
  const at = (i: number, outer: boolean) => {
    const a = (i / N) * Math.PI * 2, r = outer ? r1 : r0;
    return [Math.cos(a) * r, 0, Math.sin(a) * r, outer ? 1 : 0, a, 0];
  };
  for (let i = 0; i < N; i++) out.push(...at(i, false), ...at(i, true), ...at(i + 1, true), ...at(i, false), ...at(i + 1, true), ...at(i + 1, false));
  return new Float32Array(out);
}

/** A cone from the origin out along +y to length 1 (radius 0.14 there): position, then (how far along, 0, 0). */
function beam(): Float32Array {
  const out: number[] = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    out.push(0, 0, 0, 0, 0, 0, Math.cos(a) * 0.14, 1, Math.sin(a) * 0.14, 1, 0, 0, Math.cos(b) * 0.14, 1, Math.sin(b) * 0.14, 1, 0, 0);
  }
  return new Float32Array(out);
}

/** A flat-faced solid from its triangles (corner lists), with each face's own normal: position and normal per vertex. */
function faceted(tris: number[][][]): Float32Array {
  const out: number[] = [];
  for (const [a, b, c] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = n.map((x) => x / l);
    // (Facing out from the middle.)
    if (n[0] * (a[0] + b[0] + c[0]) + n[1] * (a[1] + b[1] + c[1]) + n[2] * (a[2] + b[2] + c[2]) < 0) n = n.map((x) => -x);
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
  }
  return new Float32Array(out);
}
const cube = () => {
  const q = (a: number[], b: number[], c: number[], d: number[]) => [[a, b, c], [a, c, d]];
  const P = (x: number, y: number, z: number) => [x, y, z];
  return faceted([
    ...q(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)), ...q(P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1)),
    ...q(P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)), ...q(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)),
    ...q(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)), ...q(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)),
  ]);
};
const octahedron = () => {
  const v = [[1, 0, 0], [-1, 0, 0], [0, 1.4, 0], [0, -1.4, 0], [0, 0, 1], [0, 0, -1]];
  const t: number[][][] = [];
  for (const y of [2, 3]) for (const [a, b] of [[0, 4], [4, 1], [1, 5], [5, 0]]) t.push([v[a], v[b], v[y]]);
  return faceted(t);
};
const tetra = () => {
  const v = [[0, 1.3, 0], [1, -0.6, 0.6], [-1, -0.6, 0.6], [0, -0.6, -1.1]];
  return faceted([[v[0], v[1], v[2]], [v[0], v[2], v[3]], [v[0], v[3], v[1]], [v[1], v[3], v[2]]]);
};

/** Column-major 4x4: translate, rotate about x then y, scale. */
function model(x: number, y: number, z: number, rx: number, ry: number, s: number): Float32Array {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  // R = Ry * Rx
  return new Float32Array([
    cy * s, 0, -sy * s, 0,
    sy * sx * s, cx * s, cy * sx * s, 0,
    sy * cx * s, -sx * s, cy * cx * s, 0,
    x, y, z, 1,
  ]);
}

export class MapObjects {
  private solid: WebGLProgram;
  private sprite: WebGLProgram;
  private sphereBuf: WebGLBuffer;
  private discBuf: WebGLBuffer;
  private beamBuf: WebGLBuffer;
  private quadBuf: WebGLBuffer;
  private cubeBuf: WebGLBuffer;
  private octaBuf: WebGLBuffer;
  private tetraBuf: WebGLBuffer;
  private counts: { sphere: number; disc: number; beam: number; cube: number; octa: number; tetra: number };
  private list: MapObject[] = [];

  constructor(private gl: WebGLRenderingContext) {
    this.solid = program(gl, SOLID_VERT, SOLID_FRAG);
    this.sprite = program(gl, SPRITE_VERT, SPRITE_FRAG);
    const buf = (data: Float32Array) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    };
    const sp = sphere(), di = disc(), be = beam(), cu = cube(), oc = octahedron(), te = tetra();
    this.sphereBuf = buf(sp);
    this.discBuf = buf(di);
    this.beamBuf = buf(be);
    this.cubeBuf = buf(cu);
    this.octaBuf = buf(oc);
    this.tetraBuf = buf(te);
    this.quadBuf = buf(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    this.counts = { sphere: sp.length / 6, disc: di.length / 6, beam: be.length / 6, cube: cu.length / 6, octa: oc.length / 6, tetra: te.length / 6 };
  }

  set(list: MapObject[]) {
    this.list = list;
  }

  /** Draw them all: solid spheres first (with depth), then everything see-through over them. */
  draw(cam: Camera, time: number, fade: number) {
    const gl = this.gl;
    if (!this.list.length) return;
    const y = 0;
    // ---- solids ----
    gl.useProgram(this.solid);
    const u = (n: string) => gl.getUniformLocation(this.solid, n);
    gl.uniformMatrix4fv(u('uView'), false, cam.view);
    gl.uniformMatrix4fv(u('uProj'), false, cam.proj);
    gl.uniform3f(u('uEye'), cam.eye[0], cam.eye[1], cam.eye[2]);
    gl.uniform1f(u('uTime'), time);
    const pos = gl.getAttribLocation(this.solid, 'aPos'), nrm = gl.getAttribLocation(this.solid, 'aNorm');
    const bind = (b: WebGLBuffer) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(pos);
      gl.enableVertexAttribArray(nrm);
      gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(nrm, 3, gl.FLOAT, false, 24, 12);
    };
    const draw = (b: WebGLBuffer, n: number, m: Float32Array, kind: number, c: [number, number, number], a: number) => {
      bind(b);
      gl.uniformMatrix4fv(u('uModel'), false, m);
      gl.uniform1f(u('uKind'), kind);
      gl.uniform3f(u('uColor'), c[0], c[1], c[2]);
      gl.uniform1f(u('uAlpha'), a * fade);
      gl.drawArrays(gl.TRIANGLES, 0, n);
    };
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const o of this.list) {
      const star = STAR[o.kind];
      if (star) {
        const r = o.dead ? star.r * 0.55 : star.r;
        const c: [number, number, number] = o.dead ? [0.62, 0.62, 0.64] : o.dim ? [0.8, 0.81, 0.84] : star.c;
        draw(this.sphereBuf, this.counts.sphere, model(o.x, y, o.z, 0, time * 0.2 + o.seed, r), 0, c, 1);
      } else if (o.kind === 'blackHole') {
        draw(this.sphereBuf, this.counts.sphere, model(o.x, y, o.z, 0, 0, 0.045), 1, [0, 0, 0], 1);
      } else if (o.kind === 'pulsar') {
        draw(this.sphereBuf, this.counts.sphere, model(o.x, y, o.z, 0, 0, 0.022), 0, PAPER_STAR, 1);
      } else if (o.kind === 'darkMatter') {
        for (let i = 0; i < 6; i++) {
          const a = time * 0.3 + o.seed + (i / 6) * Math.PI * 2, rr = 0.07 + 0.03 * Math.sin(i * 2.1);
          draw(this.sphereBuf, this.counts.sphere, model(o.x + Math.cos(a) * rr, y + Math.sin(a * 1.3 + i) * 0.03, o.z + Math.sin(a) * rr, 0, 0, 0.014 + (i % 3) * 0.004), 0, INK, 1);
        }
      } else if (o.kind === 'nebula') {
        for (let i = 0; i < 5; i++) {
          const a = time * 0.12 + o.seed + (i / 5) * Math.PI * 2, rr = 0.04 + (i % 2) * 0.03;
          draw(this.sphereBuf, this.counts.sphere, model(o.x + Math.cos(a) * rr, y + 0.01 * i, o.z + Math.sin(a) * rr, 0, 0, 0.03 - i * 0.003), 0, PAPER_STAR, 1);
        }
      }
    }
    // ---- what floats over each system: small paper solids, bobbing and turning slowly ----
    for (const o of this.list) {
      const m = o.marks;
      if (!m || o.dead) continue;
      let h = 0.1;
      const bob = Math.sin(time * 1.3 + o.seed * 7) * 0.008, spin = time * 0.6 + o.seed;
      const a = m.spent ? 0.55 : 1;
      if (m.armory) {
        draw(this.cubeBuf, this.counts.cube, model(o.x, y + h + 0.02 + bob, o.z, 0.35, spin, 0.03), 0, PAPER_STAR, a);
        h += 0.1;
      }
      if (m.research) {
        draw(this.octaBuf, this.counts.octa, model(o.x, y + h + 0.03 + bob, o.z, 0, spin, 0.03), 0, PAPER_STAR, a);
        h += 0.11;
      }
      for (let i = 0; i < Math.min(4, m.garrison ?? 0); i++) {
        draw(this.sphereBuf, this.counts.sphere, new Float32Array([0.04, 0, 0, 0, 0, 0.009, 0, 0, 0, 0, 0.04, 0, o.x, y + h + i * 0.024 + bob, o.z, 1]), 0, PAPER_STAR, 1);
      }
      if (m.garrison) h += Math.min(4, m.garrison) * 0.024 + 0.04;
      if (m.damage) draw(this.tetraBuf, this.counts.tetra, model(o.x, y + h + 0.02 + bob, o.z, 0.3, -spin, 0.028), 0, RED_INK, 1);
    }
    // ---- see-through: accretion discs, beams, glows, rings ----
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const o of this.list) {
      if (o.kind === 'blackHole') {
        draw(this.discBuf, this.counts.disc, model(o.x, y, o.z, 0.38, time * 0.4 + o.seed, 0.045), 2, [1, 1, 1], 1);
      } else if (o.kind === 'pulsar' || (o.kind === 'neutron' && !o.dead)) {
        // Two beams from the poles of a tilted axis, wheeling round.
        const spin = time * 1.6 + o.seed, len = o.kind === 'pulsar' ? 0.32 : 0.2;
        for (const flip of [0, Math.PI]) draw(this.beamBuf, this.counts.beam, model(o.x, y, o.z, 0.5 + flip, spin, len), 3, INK, 0.7);
      }
    }
    gl.disableVertexAttribArray(pos);
    gl.disableVertexAttribArray(nrm);
    // Glows and holders' rings, facing the camera.
    gl.useProgram(this.sprite);
    const s = (n: string) => gl.getUniformLocation(this.sprite, n);
    gl.uniformMatrix4fv(s('uView'), false, cam.view);
    gl.uniformMatrix4fv(s('uProj'), false, cam.proj);
    const corner = gl.getAttribLocation(this.sprite, 'aCorner');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    const sprite = (x: number, z: number, size: number, kind: number, c: [number, number, number], a: number) => {
      gl.uniform3f(s('uCenter'), x, y, z);
      gl.uniform1f(s('uSize'), size);
      gl.uniform1f(s('uKind'), kind);
      gl.uniform3f(s('uColor'), c[0], c[1], c[2]);
      gl.uniform1f(s('uAlpha'), a * fade);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    for (const o of this.list) {
      const star = STAR[o.kind];
      if (star && !o.dead) {
        const breathe = 1 + 0.06 * Math.sin(time * 1.1 + o.seed);
        sprite(o.x, o.z, star.r * 2.6 * breathe, 0, [1, 1, 1], o.dim ? 0.2 : 0.5);
        if (o.ring) sprite(o.x, o.z, star.r * 2.1, 1, o.ring, 1);
      } else if (o.kind === 'blackHole') sprite(o.x, o.z, 0.14, 0, [0.45, 0.5, 0.63], 0.25);
      else if (o.kind === 'pulsar') sprite(o.x, o.z, 0.08, 0, [1, 1, 1], 0.6);
    }
    gl.disableVertexAttribArray(corner);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
