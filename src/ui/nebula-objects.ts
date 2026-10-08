/**
 * The campaign map's things as 3D objects in the nebula's space (see nebula3d.ts): each system's sun, all alike in
 * the board's paper and gold, alive (its surface churning, its corona breathing and flaring, a schematic ring
 * turning round it), ringed in its holder's colour when it is held. Nothing floats over a system: what it holds is
 * found by going there.
 *
 * And, on the layer behind the map, what lies under this galaxy (its GalaxyKind): a supermassive black hole at the
 * bottom of a well in the land, or a pulsar whose beams sweep across it.
 */

import type { Camera } from './nebula3d';

/** One thing to draw: where it stands on the map's plane (world x, z), what it is, and how it looks. */
export interface MapObject {
  x: number;
  z: number;
  /** The wormhole's sun is a little bigger. */
  heart?: boolean;
  /** The holder's colour (a ring round the star), if held. */
  ring?: [number, number, number];
  /** Dimmed (collapsing, out of reach): drawn faded and grey. */
  dim?: boolean;
  /** Gone (collapsed, ruined): a small grey ember. */
  dead?: boolean;
  /** A stable number to vary each one by (spin, phase). */
  seed: number;
}

/** What lies under the galaxy (drawn on the layer behind the map). */
export type GalaxyLook = 'blackHole' | 'pulsar' | 'meteors' | 'nebula' | 'darkMatter';

/** Where the black hole sits, at the bottom of its well (and the pulsar, just over the land). */
export const BLACK_HOLE_Y = -1.02, BLACK_HOLE_Z = -0.7;
export const PULSAR_Y = -0.2;

/** The board's paper, and its ink. */
const SUN: [number, number, number] = [0.975, 0.97, 0.955];
const INK: [number, number, number] = [0.42, 0.48, 0.62];
const GOLD: [number, number, number] = [0.86, 0.66, 0.31];

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
 * kind 0: a sun, drawn as the board draws (paper, a globe's lines in fine ink, the contours of its churning surface,
 * an ink line round it); 1: a black sphere; 2: an accretion disc (vL.x how far out, vL.y round); 3: a beam (vL.x how far
 * along); 4: a plain paper sphere (an ember).
 */
const SOLID_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
uniform vec3 uEye; uniform vec3 uColor; uniform float uKind; uniform float uTime; uniform float uAlpha; uniform float uSeed;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 v = normalize(uEye - vW);
  float ndv = abs(dot(normalize(vN), v));
  vec3 ink = vec3(0.40, 0.46, 0.60);
  if (uKind < 0.5) {
    // Drawn as the board draws: paper, softly shaded, in fine ink. A globe's lines (turning with it), and the
    // contours of its churning surface, welling and shifting, so it reads alive without leaving the paper.
    float lit = max(0.0, dot(normalize(vN), normalize(vec3(0.5, 0.8, 0.35))));
    vec3 c = mix(uColor * 0.86, vec3(1.0, 0.998, 0.99), clamp(0.3 * ndv + 0.7 * lit, 0.0, 1.0));
    float lat = asin(clamp(vL.y, -1.0, 1.0)) / 3.14159 * 4.0;
    float lon = (atan(vL.z, vL.x) / 6.28318 + uTime * 0.02) * 8.0;
    float gx = 1.0 - smoothstep(0.0, 0.8, (0.5 - abs(fract(lat) - 0.5)) / max(fwidth(lat), 1e-4));
    float gy = 1.0 - smoothstep(0.0, 0.8, (0.5 - abs(fract(lon) - 0.5)) / max(fwidth(lon), 1e-4));
    c = mix(c, vec3(0.42, 0.48, 0.62), max(gx, gy) * 0.14 * ndv);
    vec3 q = vL * 2.2 + uSeed;
    float churn = n3(q + vec3(uTime * 0.25, 0.0, uTime * 0.15)) * 0.65 + n3(q * 2.3 - vec3(0.0, uTime * 0.35, 0.0)) * 0.35;
    float band = churn * 3.0;
    float iso = 1.0 - smoothstep(0.0, 0.8, (0.5 - abs(fract(band) - 0.5)) / max(fwidth(band), 1e-4));
    c = mix(c, vec3(0.42, 0.48, 0.62), iso * 0.2 * smoothstep(0.1, 0.5, ndv));
    c = mix(c, vec3(0.42, 0.48, 0.62), (1.0 - smoothstep(0.06, 0.16, ndv)) * 0.6);
    gl_FragColor = vec4(c * uAlpha, uAlpha);
  } else if (uKind < 1.5) {
    vec3 c = mix(vec3(0.03, 0.03, 0.05), vec3(0.32, 0.33, 0.38), pow(1.0 - ndv, 3.0));
    gl_FragColor = vec4(c * uAlpha, uAlpha);
  } else if (uKind < 2.5) {
    float out_ = vL.x;
    float swirl = 0.5 + 0.5 * sin(vL.y * 9.0 - uTime * 1.6 + out_ * 14.0);
    float fine = 0.5 + 0.5 * sin(vL.y * 31.0 - uTime * 2.4 + out_ * 40.0);
    vec3 c = mix(vec3(1.0, 0.97, 0.88), mix(vec3(0.93, 0.74, 0.42), vec3(0.45, 0.5, 0.63), smoothstep(0.4, 1.0, out_)), smoothstep(0.0, 0.6, out_));
    float a = (1.0 - smoothstep(0.5, 1.0, out_)) * (0.5 + 0.35 * swirl + 0.15 * fine) * uAlpha;
    gl_FragColor = vec4(c * a, a);
  } else if (uKind < 3.5) {
    float a = pow(1.0 - vL.x, 1.5) * 0.55 * uAlpha;
    gl_FragColor = vec4(uColor * a, a);
  } else {
    float lit = max(0.0, dot(normalize(vN), normalize(vec3(0.5, 0.8, 0.35))));
    vec3 c = mix(uColor * 0.75, uColor, lit);
    c = mix(c, ink, (1.0 - smoothstep(0.12, 0.32, ndv)) * 0.55);
    gl_FragColor = vec4(c * uAlpha, uAlpha);
  }
}`;

/**
 * A camera-facing disc: a soft glow (kind 0), a fine ring (1), a dashed schematic ring turning (3), or rings
 * pulsing out (4).
 */
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
uniform vec3 uColor; uniform float uKind; uniform float uAlpha; uniform float uTime; uniform float uSeed;
void main() {
  float r = length(vUV);
  float a;
  if (uKind < 0.5) a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r)) * 0.55;
  else if (uKind < 1.5) {
    float w = max(fwidth(r), 1e-4);
    a = (1.0 - smoothstep(0.0, w * 1.6, abs(r - 0.82))) * 0.95;
  } else if (uKind > 3.5) {
    // Rings of ink going out from it, one after another, fading as they spread: it pulses.
    float w = max(fwidth(r), 1e-4);
    a = 0.0;
    for (int i = 0; i < 2; i++) {
      float t = fract(uTime * 0.35 + uSeed * 0.13 + float(i) * 0.5);
      float rr = mix(0.32, 0.98, t);
      a += (1.0 - smoothstep(0.0, w, abs(r - rr))) * (1.0 - t) * 0.8;
    }
  } else {
    float w = max(fwidth(r), 1e-4);
    float ang = atan(vUV.y, vUV.x);
    float dash = step(0.45, fract(ang * 6.0 / 3.14159 + uTime * 0.15 + uSeed));
    a = (1.0 - smoothstep(0.0, w * 1.4, abs(r - 0.9))) * dash * 0.7;
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
  private counts: { sphere: number; disc: number; beam: number };
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
    const sp = sphere(), di = disc(), be = beam();
    this.sphereBuf = buf(sp);
    this.discBuf = buf(di);
    this.beamBuf = buf(be);
    this.quadBuf = buf(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    this.counts = { sphere: sp.length / 6, disc: di.length / 6, beam: be.length / 6 };
  }

  set(list: MapObject[]) {
    this.list = list;
  }

  /** The solids' program, ready to draw with: a function drawing one buffer with a model, a kind, a colour. */
  private solids(cam: Camera, time: number, fade: number) {
    const gl = this.gl;
    gl.useProgram(this.solid);
    const u = (n: string) => gl.getUniformLocation(this.solid, n);
    gl.uniformMatrix4fv(u('uView'), false, cam.view);
    gl.uniformMatrix4fv(u('uProj'), false, cam.proj);
    gl.uniform3f(u('uEye'), cam.eye[0], cam.eye[1], cam.eye[2]);
    gl.uniform1f(u('uTime'), time);
    const pos = gl.getAttribLocation(this.solid, 'aPos'), nrm = gl.getAttribLocation(this.solid, 'aNorm');
    gl.enableVertexAttribArray(pos);
    gl.enableVertexAttribArray(nrm);
    const draw = (b: WebGLBuffer, n: number, m: Float32Array, kind: number, c: [number, number, number], a: number, seed = 0) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(nrm, 3, gl.FLOAT, false, 24, 12);
      gl.uniformMatrix4fv(u('uModel'), false, m);
      gl.uniform1f(u('uKind'), kind);
      gl.uniform3f(u('uColor'), c[0], c[1], c[2]);
      gl.uniform1f(u('uAlpha'), a * fade);
      gl.uniform1f(u('uSeed'), seed);
      gl.drawArrays(gl.TRIANGLES, 0, n);
    };
    const done = () => {
      gl.disableVertexAttribArray(pos);
      gl.disableVertexAttribArray(nrm);
    };
    return { draw, done };
  }

  /** The sprites' program, ready to draw with: a function drawing one camera-facing disc. */
  private sprites(cam: Camera, time: number, fade: number) {
    const gl = this.gl;
    gl.useProgram(this.sprite);
    const s = (n: string) => gl.getUniformLocation(this.sprite, n);
    gl.uniformMatrix4fv(s('uView'), false, cam.view);
    gl.uniformMatrix4fv(s('uProj'), false, cam.proj);
    gl.uniform1f(s('uTime'), time);
    const corner = gl.getAttribLocation(this.sprite, 'aCorner');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    const draw = (x: number, y: number, z: number, size: number, kind: number, c: [number, number, number], a: number, seed = 0) => {
      gl.uniform3f(s('uCenter'), x, y, z);
      gl.uniform1f(s('uSize'), size);
      gl.uniform1f(s('uKind'), kind);
      gl.uniform3f(s('uColor'), c[0], c[1], c[2]);
      gl.uniform1f(s('uAlpha'), a * fade);
      gl.uniform1f(s('uSeed'), seed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    return { draw, done: () => gl.disableVertexAttribArray(corner) };
  }

  /** Draw the suns: their bodies first (with depth), then their glow, flares and rings over them. */
  draw(cam: Camera, time: number, fade: number) {
    const gl = this.gl;
    if (!this.list.length) return;
    const y = 0;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    const solid = this.solids(cam, time, fade);
    for (const o of this.list) {
      const r = o.heart ? 0.05 : 0.036;
      if (o.dead) solid.draw(this.sphereBuf, this.counts.sphere, model(o.x, y, o.z, 0, o.seed, r * 0.55), 4, [0.62, 0.62, 0.64], 1);
      else {
        // A slow pulse in its size, as if it breathes.
        const pulse = 1 + 0.035 * Math.sin(time * 1.4 + o.seed * 3);
        solid.draw(this.sphereBuf, this.counts.sphere, model(o.x, y, o.z, 0.3, time * 0.15 + o.seed, r * pulse), o.dim ? 4 : 0, o.dim ? [0.8, 0.81, 0.84] : SUN, 1, o.seed);
      }
    }
    solid.done();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const sprite = this.sprites(cam, time, fade);
    for (const o of this.list) {
      if (o.dead) continue;
      const r = o.heart ? 0.05 : 0.036;
      if (o.dim) {
        sprite.draw(o.x, y, o.z, r * 2.4, 0, [1, 1, 1], 0.2);
      } else {
        const breathe = 1 + 0.1 * Math.sin(time * 1.1 + o.seed);
        // A wide warm glow, the flaring corona round the disc, and a fine dashed ring turning slowly.
        // A soft paper glow, a faint ring pulsing out, and a fine dashed ring turning slowly.
        sprite.draw(o.x, y, o.z, r * 4 * breathe, 0, [1, 1, 1], 0.7);
        sprite.draw(o.x, y, o.z, r * 4.4, 4, INK, 0.35, o.seed);
        sprite.draw(o.x, y, o.z, r * 3.9, 3, INK, 0.35, o.seed);
      }
      if (o.ring) sprite.draw(o.x, y, o.z, r * 2.4, 1, o.ring, 1);
    }
    sprite.done();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /**
   * What lies under the galaxy, on the layer behind the map: a black hole at the bottom of its well, its
   * accretion disc turning; or a pulsar over the land, its beams sweeping round (the land lights where they
   * fall: nebula3d.ts). `beam` is the pulsar's sweep (radians).
   */
  drawGalaxy(cam: Camera, time: number, fade: number, look: GalaxyLook | null, beam: number) {
    const gl = this.gl;
    if (look !== 'blackHole' && look !== 'pulsar') return;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    const solid = this.solids(cam, time, fade);
    if (look === 'blackHole') {
      solid.draw(this.sphereBuf, this.counts.sphere, model(0, BLACK_HOLE_Y, BLACK_HOLE_Z, 0, 0, 0.16), 1, [0, 0, 0], 1);
    } else {
      solid.draw(this.sphereBuf, this.counts.sphere, model(0, PULSAR_Y, 0, 0, time, 0.045), 0, SUN, 1, 3);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    if (look === 'blackHole') {
      // Two discs a little apart in tilt, turning at their own speeds, read as a thick, churning ring of matter.
      solid.draw(this.discBuf, this.counts.disc, model(0, BLACK_HOLE_Y, BLACK_HOLE_Z, 0.12, time * 0.25, 0.2), 2, [1, 1, 1], 1);
      solid.draw(this.discBuf, this.counts.disc, model(0, BLACK_HOLE_Y + 0.01, BLACK_HOLE_Z, 0.2, -time * 0.18 + 1, 0.26), 2, [1, 1, 1], 0.55);
    } else {
      // Two beams from the poles, lying almost flat, sweeping round over the land.
      for (const flip of [0, Math.PI]) {
        const m = model(0, PULSAR_Y, 0, Math.PI / 2 + 0.02 + flip, beam, 7);
        // (Thin: the beam's width scaled down from its length.)
        for (const k of [0, 1, 2, 8, 9, 10]) m[k] *= 0.05;
        solid.draw(this.beamBuf, this.counts.beam, m, 3, [0.52, 0.72, 0.88], 1);
      }
    }
    solid.done();
    const sprite = this.sprites(cam, time, fade);
    if (look === 'blackHole') sprite.draw(0, BLACK_HOLE_Y, BLACK_HOLE_Z, 0.9, 0, GOLD, 0.35);
    else {
      sprite.draw(0, PULSAR_Y, 0, 0.6 * (1 + 0.2 * Math.sin(time * 9)), 0, [0.52, 0.72, 0.88], 0.9);
    }
    sprite.done();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
