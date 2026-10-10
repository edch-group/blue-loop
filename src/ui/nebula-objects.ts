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
import { shipModel3d, SHIP_STRIDE } from './ship3d';
import sunCoronaUrl from './gems/sun-corona.png';
import sunDiscUrl from './gems/sun-disc.png';

/** A system gone next turn: red. */
const DOOM: [number, number, number] = [0.86, 0.26, 0.22];

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
  /** Collapsing (gone next turn): drawn red. */
  doom?: boolean;
  /** Gone (collapsed, ruined): a small grey ember. */
  dead?: boolean;
  /** One the player can travel to: it pulses, rings going out from it like sonar. */
  reach?: boolean;
  /** A stable number to vary each one by (spin, phase). */
  seed: number;
  /** Which system it is (for the pointer hovering it). */
  id?: string;
}

/** A route between two systems (world x, z at each end): held (in its holder's colour), or gone (a faint dashed trace). */
export interface MapRoute {
  a: [number, number];
  b: [number, number];
  colour?: [number, number, number];
  gone?: boolean;
}

/** A ship on the map: where it is bound (world x, z, over a star), and its holder's colour. */
export interface MapShip {
  id: string;
  x: number;
  z: number;
  colour: [number, number, number];
  /** Its race (its model), or -1 for a Lost Races derelict. */
  race: number;
  /** Flying in from here (world x, z), taking this long (seconds): a ship arriving from off screen. */
  arrive?: { from: [number, number]; dur: number };
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
  } else if (uKind > 4.5) {
    // A Stellari petal, as the battle board draws its star: a wireframe, a fine silver line round each petal
    // over the faintest pale fill (vL.x: 0 at the petal's middle, 1 at its edge).
    float r = vL.x;
    float w = max(fwidth(r), 1e-4);
    float line = 1.0 - smoothstep(w * 0.6, w * 1.8, 1.0 - r);
    vec3 c = mix(vec3(0.86, 0.88, 0.93), vec3(0.66, 0.7, 0.79), line);
    float a = (0.14 + 0.65 * line) * uAlpha;
    gl_FragColor = vec4(c * a, a);
  } else {
    float lit = max(0.0, dot(normalize(vN), normalize(vec3(0.5, 0.8, 0.35))));
    vec3 c = mix(uColor * 0.75, uColor, lit);
    c = mix(c, ink, (1.0 - smoothstep(0.12, 0.32, ndv)) * 0.55);
    gl_FragColor = vec4(c * uAlpha, uAlpha);
  }
}`;

/**
 * A camera-facing disc: a soft glow (kind 0), a fine ring (1), a dashed schematic ring turning (3), or rings
 * pulsing out (4); or a picture (5: the stellar gem's sun, its corona and disc).
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
uniform sampler2D uTex;
void main() {
  float r = length(vUV);
  float a;
  if (uKind < 0.5) a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r)) * 0.55;
  else if (uKind < 1.5) {
    float w = max(fwidth(r), 1e-4);
    a = (1.0 - smoothstep(0.0, w * 1.6, abs(r - 0.82))) * 0.95;
  } else if (uKind > 4.5) {
    // A picture (premultiplied), turned by uSeed radians: the stellar gem's sun, as the cards show it.
    float c = cos(uSeed), sn = sin(uSeed);
    vec2 uv = vec2(c * vUV.x - sn * vUV.y, sn * vUV.x + c * vUV.y) * 0.5 + 0.5;
    gl_FragColor = texture2D(uTex, vec2(uv.x, 1.0 - uv.y)) * uAlpha;
    return;
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

/**
 * A route as a tube of soft white light in the scene: a ribbon between its ends, turned to face the camera all along
 * (so from any angle it reads as a round tube), as wide as the tube's glow in world units (so it shrinks with
 * distance and hides behind the land and the suns).
 */
const ROUTE_VERT = `
attribute vec3 aA; attribute vec3 aB; attribute vec2 aSide; attribute vec4 aColor;
uniform mat4 uView; uniform mat4 uProj; uniform float uWidth;
varying float vSide; varying float vAlong; varying vec4 vColor;
void main() {
  vec4 va = uView * vec4(aA, 1.0), vb = uView * vec4(aB, 1.0);
  vec4 v = mix(va, vb, aSide.y);
  vec2 d = vb.xy / -vb.z - va.xy / -va.z;
  d = length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  v.xy += vec2(-d.y, d.x) * aSide.x * uWidth;
  gl_Position = uProj * v;
  vSide = aSide.x;
  vAlong = aSide.y * length(aB - aA);
  vColor = aColor;
}`;

const ROUTE_FRAG = `
precision highp float;
varying float vSide; varying float vAlong; varying vec4 vColor;
uniform float uTime; uniform float uAlpha;
void main() {
  float x = abs(vSide);
  if (vColor.a < 0.5) {
    // Gone: a faint dashed trace.
    float dash = step(0.5, fract(vAlong * 18.0));
    float a = (1.0 - smoothstep(0.15, 0.3, x)) * dash * 0.3 * uAlpha;
    gl_FragColor = vec4(vec3(0.5, 0.52, 0.56) * a, a);
    return;
  }
  // Neon: a soft halo falling away either side, a bright tube, a white-hot thread down its middle, humming.
  float hum = 0.9 + 0.1 * sin(uTime * 2.3 + vAlong * 3.0) * sin(uTime * 0.7);
  float halo = exp(-x * x * 6.0) * 0.42 * hum;
  float tube = exp(-x * x * 45.0);
  float core = exp(-x * x * 300.0);
  vec3 tint = vColor.rgb;
  // The halo is a soft shade (so white light shows on the paper); the tube is the light itself.
  vec3 c = mix(tint * 0.62, tint, tube);
  c = mix(c, vec3(1.0), core);
  float a = max(halo, tube * 0.95) * uAlpha;
  gl_FragColor = vec4(c * a, a);
}`;

/** The ship: a mesh in the scene (ship3d.ts), its look worked out here. */
const SHIP_VERT = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aCol; attribute float aMat;
uniform mat4 uView; uniform mat4 uProj; uniform mat4 uModel;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vLN; varying float vMat; varying vec3 vCol;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(uModel) * aNorm);
  vL = aPos;
  vLN = aNorm;
  vMat = aMat;
  vCol = aCol;
  gl_Position = uProj * uView * w;
}`;

/**
 * Plated metal: panels of slightly differing tone, the seams between them cut in (on the two axes that run along
 * each face), wear and grime, a stripe in its holder's colour down the spine, lit by a key light with a sharp
 * highlight and the paper's light caught at its edges. The canopy is dark glass, glossy; the engines burn.
 */
const SHIP_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec3 vLN; varying float vMat; varying vec3 vCol;
uniform vec3 uEye; uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uBurn;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float seam(float c) {
  float d = abs(fract(c) - 0.5);
  float w = max(fwidth(c), 1e-4);
  // (Fading out where the panels are too small on screen to draw their seams: no shimmer of dots.)
  return (1.0 - smoothstep(0.5 - w * 1.5, 0.5 - w * 0.3, d)) * (1.0 - smoothstep(0.12, 0.3, w));
}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - vW);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(vec3(0.45, 0.85, 0.3));
  vec3 h = normalize(l + v);
  float diff = max(dot(n, l), 0.0);
  float ndv = max(dot(n, v), 0.0);
  float fres = pow(1.0 - ndv, 4.0);
  vec3 sky = vec3(0.95, 0.95, 0.93);
  float m = vMat;
  vec3 c;
  if (m > 1.5 && m < 2.5) {
    // Glowing: white-hot at its heart (where it faces the eye), its own colour round its edge, flickering.
    float flick = 0.9 + 0.1 * sin(uTime * 23.0 + vL.x * 30.0) * sin(uTime * 13.0 + vL.z * 20.0);
    c = mix(vCol, vec3(1.0), 0.12 + 0.5 * ndv * ndv * ndv) * flick * (1.0 + uBurn * 0.15);
    gl_FragColor = vec4(min(c, vec3(1.0)) * uAlpha, uAlpha);
    return;
  }
  if (m > 5.5) {
    // Molten: an ember hull, its glow welling through darker crust, moving.
    float lava = n3(vL * 18.0 + vec3(uTime * 0.6, 0.0, 0.0)) * 0.6 + n3(vL * 46.0 - vec3(0.0, uTime, 0.0)) * 0.4;
    c = mix(vCol * 0.35, mix(vCol, vec3(1.0, 0.9, 0.55), 0.4), smoothstep(0.35, 0.75, lava));
    c += vec3(1.0) * pow(max(dot(n, h), 0.0), 30.0) * 0.25;
    gl_FragColor = vec4(min(c, vec3(1.0)) * uAlpha, uAlpha);
    return;
  }
  if (m > 0.5 && m < 1.5) {
    // Glass or crystal: its colour deep in it, bright where it turns from the eye, a sharp light on it.
    c = vCol * (0.35 + 0.45 * diff);
    c = mix(c, mix(vCol, vec3(1.0), 0.6), fres * 0.8);
    c += vec3(1.0) * pow(max(dot(n, h), 0.0), 70.0) * 0.8;
    gl_FragColor = vec4(min(c, vec3(1.0)) * uAlpha, uAlpha);
    return;
  }
  vec3 base = vCol;
  float rough;
  if (m > 2.5 && m < 3.5) {
    // Living: mottled, soft, a little sheen.
    float mott = n3(vL * 38.0) * 0.6 + n3(vL * 95.0) * 0.4;
    base *= 0.82 + 0.3 * mott;
    rough = 0.65;
  } else if (m > 3.5 && m < 4.5) {
    // Dark gloss: void-metal (or rust, rougher), smooth, a long highlight.
    base *= 0.9 + 0.2 * n3(vL * 60.0);
    rough = 0.2;
  } else {
    // Plated metal (or, 5, metal in its holder's colour): panels of slightly differing tone, seams, wear.
    if (m > 4.5) base = mix(base, uColor, 0.65);
    vec3 an = abs(normalize(vLN));
    vec3 q = vL * vec3(9.0, 16.0, 13.0);
    float lines = an.x > an.y && an.x > an.z ? max(seam(q.y), seam(q.z)) : an.y > an.z ? max(seam(q.x), seam(q.z)) : max(seam(q.x), seam(q.y));
    float panel = h3(floor(q + 0.5));
    float grime = n3(vL * 46.0) * 0.6 + n3(vL * 110.0) * 0.4;
    base *= (0.94 + 0.08 * panel) * (0.9 + 0.14 * grime) * (1.0 - lines * 0.16);
    rough = 0.25 + 0.3 * grime;
  }
  float spec = pow(max(dot(n, h), 0.0), mix(90.0, 14.0, rough)) * (1.0 - rough) * 1.1;
  c = base * (0.45 + 0.7 * diff) + vec3(spec);
  // Light from below, off the paper, and the paper caught at its edge.
  c += base * max(-n.y, 0.0) * 0.12;
  c = mix(c, sky, fres * 0.3);
  gl_FragColor = vec4(min(c, vec3(1.0)) * uAlpha, uAlpha);
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

/**
 * A flat shape as a fan from a middle point to its outline (in the xy plane), for the Stellari's petals: position,
 * then (how far out: 0 at the middle, 1 on the outline, 0, 0), so its outline can be drawn as a fine line.
 */
function fan(outline: [number, number][], mid: [number, number]): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    out.push(mid[0], mid[1], 0, 0, 0, 0, a[0], a[1], 0, 1, 0, 0, b[0], b[1], 0, 1, 0, 0);
  }
  return new Float32Array(out);
}
/** A petal of the board's star: an ellipse through the middle (half-width 0.29, half-length 1). */
const petalShape = () => fan(Array.from({ length: 48 }, (_, i) => [Math.cos((i / 48) * Math.PI * 2) * 0.29, Math.sin((i / 48) * Math.PI * 2)] as [number, number]), [0, 0]);
/** A spike of its inner ring: a slim diamond from the middle out (as the board's: to 0.79, widest at 0.61). */
const spikeShape = () => fan([[0, 0], [0.079, 0.606], [0, 0.788], [-0.079, 0.606]], [0, 0.5]);

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

/**
 * Column-major 4x4 for a shape facing a direction: its local +z along `f` (unit), rolled about it by `roll`, scaled
 * along each local axis, at (x, y, z).
 */
function facing(x: number, y: number, z: number, f: number[], roll: number, sx: number, sy: number, sz: number): Float32Array {
  // Right and up across the facing (world up as the guide).
  let r = [f[2], 0, -f[0]];
  const rl = Math.hypot(r[0], r[2]) || 1;
  r = [r[0] / rl, 0, r[2] / rl];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  const c = Math.cos(roll), s = Math.sin(roll);
  const X = [0, 1, 2].map((i) => c * r[i] + s * u[i]), Y = [0, 1, 2].map((i) => -s * r[i] + c * u[i]);
  return new Float32Array([X[0] * sx, X[1] * sx, X[2] * sx, 0, Y[0] * sy, Y[1] * sy, Y[2] * sy, 0, f[0] * sz, f[1] * sz, f[2] * sz, 0, x, y, z, 1]);
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
  private petalBuf: WebGLBuffer;
  private spikeBuf: WebGLBuffer;
  private quadBuf: WebGLBuffer;
  private counts: { sphere: number; disc: number; beam: number; petal: number; spike: number };
  private list: MapObject[] = [];
  private shipProg: WebGLProgram;
  /** Each race's model, uploaded the first time a ship of it is drawn. */
  private shipBufs = new Map<number, { buf: WebGLBuffer; count: number; engines: number[][]; glow: number[]; suns: { at: number[]; r: number }[] }>();
  /** Each ship as it flies: where it set out from and is bound, since when, and which way it faces. */
  private ships = new Map<string, { from: [number, number]; to: [number, number]; t0: number; dur: number; heading: number; colour: [number, number, number]; race: number }>();
  private routeProg: WebGLProgram;
  private routeBuf: WebGLBuffer;
  private routeCount = 0;

  constructor(private gl: WebGLRenderingContext) {
    this.solid = program(gl, SOLID_VERT, SOLID_FRAG);
    this.sprite = program(gl, SPRITE_VERT, SPRITE_FRAG);
    this.routeProg = program(gl, ROUTE_VERT, ROUTE_FRAG);
    this.shipProg = program(gl, SHIP_VERT, SHIP_FRAG);
    this.routeBuf = gl.createBuffer()!;
    const buf = (data: Float32Array) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    };
    const sp = sphere(), di = disc(), be = beam(), pe = petalShape(), sk = spikeShape();
    this.petalBuf = buf(pe);
    this.spikeBuf = buf(sk);
    this.sphereBuf = buf(sp);
    this.discBuf = buf(di);
    this.beamBuf = buf(be);
    this.quadBuf = buf(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    this.sunDisc = this.texture(sunDiscUrl);
    this.sunCorona = this.texture(sunCoronaUrl);
    this.counts = { sphere: sp.length / 6, disc: di.length / 6, beam: be.length / 6, petal: pe.length / 6, spike: sk.length / 6 };
  }

  set(list: MapObject[]) {
    this.list = list;
  }

  /** The system under the pointer (it swells and flares), and how far each has swelled (0 to 1). */
  /** The stellar gem's sun, as pictures: its disc and its corona (null until loaded). */
  private sunDisc: { tex: WebGLTexture; ready: boolean };
  private sunCorona: { tex: WebGLTexture; ready: boolean };

  private texture(url: string) {
    const gl = this.gl;
    const out = { tex: gl.createTexture()!, ready: false };
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, out.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      out.ready = true;
    };
    img.src = url;
    return out;
  }

  private hovered: string | null = null;
  private hoverAmt = new Map<string, number>();
  private hoverClock = 0;

  /** Whether anything is still swelling or settling (the scene keeps drawing until it is still). */
  get hoverMoving(): boolean {
    for (const [id, v] of this.hoverAmt) if (Math.abs((id === this.hovered ? 1 : 0) - v) > 0.01) return true;
    return false;
  }

  hover(id: string | null) {
    this.hovered = id;
    if (id && !this.hoverAmt.has(id)) this.hoverAmt.set(id, 0);
  }

  /** Ease each system toward swelled (hovered) or at rest. */
  private stepHover() {
    const now = performance.now() / 1000;
    const dt = this.hoverClock ? Math.min(0.1, now - this.hoverClock) : 0;
    this.hoverClock = now;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [id, v] of this.hoverAmt) {
      const to = id === this.hovered ? 1 : 0;
      const next = reduce ? to : v + (to - v) * (1 - Math.exp(-dt * (to ? 14 : 8)));
      if (!to && next < 0.005) this.hoverAmt.delete(id);
      else this.hoverAmt.set(id, next);
    }
  }

  /**
   * The ships, and where each is bound: one bound somewhere new flies there from where it is now (straight, easing
   * in and out, turning to face its way); one first seen is simply there.
   */
  setShips(list: MapShip[]) {
    const now = performance.now() / 1000;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const live = new Set(list.map((sh) => sh.id));
    for (const id of [...this.ships.keys()]) if (!live.has(id)) this.ships.delete(id);
    for (const sh of list) {
      const was = this.ships.get(sh.id);
      if (!was) {
        const a = reduce ? undefined : sh.arrive;
        const from: [number, number] = a ? a.from : [sh.x, sh.z];
        const heading = a ? Math.atan2(sh.z - from[1], sh.x - from[0]) : 0;
        this.ships.set(sh.id, { from, to: [sh.x, sh.z], t0: now, dur: a?.dur ?? 0, heading, colour: sh.colour, race: sh.race });
        continue;
      }
      was.colour = sh.colour;
      was.race = sh.race;
      if (Math.hypot(was.to[0] - sh.x, was.to[1] - sh.z) < 1e-4) continue;
      const at = this.shipAt(was, now);
      const d = Math.hypot(sh.x - at[0], sh.z - at[1]);
      was.from = at;
      was.to = [sh.x, sh.z];
      was.t0 = now;
      was.dur = reduce ? 0 : Math.max(0.7, Math.min(1.8, d * 2.4));
      if (d > 1e-4) was.heading = Math.atan2(sh.z - at[1], sh.x - at[0]);
    }
  }

  /** A race's model on the GPU (built and uploaded the first time). */
  private shipModel(race: number) {
    let m = this.shipBufs.get(race);
    if (!m) {
      const gl = this.gl;
      const model = shipModel3d(race);
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, model.mesh, gl.STATIC_DRAW);
      m = { buf, count: model.mesh.length / SHIP_STRIDE, engines: model.engines, glow: model.glow, suns: model.suns };
      this.shipBufs.set(race, m);
    }
    return m;
  }

  /** Where a ship is at a moment (world x, z). */
  private shipAt(sh: { from: [number, number]; to: [number, number]; t0: number; dur: number }, now: number): [number, number] {
    const t = sh.dur > 0 ? Math.min(1, (now - sh.t0) / sh.dur) : 1;
    const e = t * t * (3 - 2 * t);
    return [sh.from[0] + (sh.to[0] - sh.from[0]) * e, sh.from[1] + (sh.to[1] - sh.from[1]) * e];
  }

  /** The ships: hovering over their stars, bobbing a little, flying from star to star, their engines burning. */
  private drawShips(cam: Camera, time: number, fade: number) {
    const gl = this.gl;
    if (!this.ships.size) return;
    const now = performance.now() / 1000;
    const S = 0.2;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.useProgram(this.shipProg);
    const u = (n: string) => gl.getUniformLocation(this.shipProg, n);
    gl.uniformMatrix4fv(u('uView'), false, cam.view);
    gl.uniformMatrix4fv(u('uProj'), false, cam.proj);
    gl.uniform3f(u('uEye'), cam.eye[0], cam.eye[1], cam.eye[2]);
    gl.uniform1f(u('uTime'), time);
    gl.uniform1f(u('uAlpha'), fade);
    const attrs: [string, number][] = [['aPos', 3], ['aNorm', 3], ['aCol', 3], ['aMat', 1]];
    const locs = attrs.map(([name]) => gl.getAttribLocation(this.shipProg, name));
    const bindModel = (buf: WebGLBuffer) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      let off = 0;
      attrs.forEach(([, n], k) => {
        if (locs[k] >= 0) {
          gl.enableVertexAttribArray(locs[k]);
          gl.vertexAttribPointer(locs[k], n, gl.FLOAT, false, SHIP_STRIDE * 4, off);
        }
        off += n * 4;
      });
    };
    const placed: { m: Float32Array; burn: number; engines: number[][]; glow: number[]; suns: { at: number[]; r: number }[] }[] = [];
    for (const sh of this.ships.values()) {
      const [x, z] = this.shipAt(sh, now);
      const moving = sh.dur > 0 && now - sh.t0 < sh.dur;
      const k = moving ? (now - sh.t0) / sh.dur : 1;
      // Hovering over its star, bobbing; under way it rises a little and banks into its course.
      const y = 0.13 + Math.sin(time * 1.3) * 0.006 + (moving ? Math.sin(Math.PI * k) * 0.05 : 0);
      const bank = moving ? Math.sin(Math.PI * k) * 0.25 : Math.sin(time * 0.9) * 0.04;
      const pitch = moving ? Math.cos(Math.PI * k) * 0.12 : 0;
      const fx = Math.cos(sh.heading), fz = Math.sin(sh.heading);
      // Forward (pitched), up (banked), and starboard, scaled.
      const F = [fx * Math.cos(pitch), Math.sin(pitch), fz * Math.cos(pitch)];
      const Rr = [-fz, 0, fx];
      const U0 = [Rr[1] * F[2] - Rr[2] * F[1], Rr[2] * F[0] - Rr[0] * F[2], Rr[0] * F[1] - Rr[1] * F[0]];
      const cb = Math.cos(bank), sb = Math.sin(bank);
      const U = [0, 1, 2].map((i) => U0[i] * cb + Rr[i] * sb);
      const R = [0, 1, 2].map((i) => Rr[i] * cb - U0[i] * sb);
      const m = new Float32Array([F[0] * S, F[1] * S, F[2] * S, 0, U[0] * S, U[1] * S, U[2] * S, 0, R[0] * S, R[1] * S, R[2] * S, 0, x, y, z, 1]);
      const model = this.shipModel(sh.race);
      bindModel(model.buf);
      gl.uniformMatrix4fv(u('uModel'), false, m);
      gl.uniform3f(u('uColor'), sh.colour[0], sh.colour[1], sh.colour[2]);
      gl.uniform1f(u('uBurn'), moving ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, model.count);
      placed.push({ m, burn: moving ? 1 : 0, engines: model.engines, glow: model.glow, suns: model.suns });
    }
    for (const l of locs) if (l >= 0) gl.disableVertexAttribArray(l);
    // The engines' glow, over the hull, longer under way.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const sprite = this.sprites(cam, time, fade);
    for (const p of placed) {
      for (const [i, e] of p.engines.entries()) {
        const wx = p.m[0] * e[0] + p.m[4] * e[1] + p.m[8] * e[2] + p.m[12];
        const wy = p.m[1] * e[0] + p.m[5] * e[1] + p.m[9] * e[2] + p.m[13];
        const wz = p.m[2] * e[0] + p.m[6] * e[1] + p.m[10] * e[2] + p.m[14];
        const size = 0.022 * (1 + p.burn * 0.8) * (0.9 + 0.1 * Math.sin(time * 23 + i));
        sprite.draw(wx, wy, wz, size, 0, [0.55 + p.glow[0] * 0.45, 0.55 + p.glow[1] * 0.45, 0.55 + p.glow[2] * 0.45], 0.9);
      }
      // A captive sun radiates heat round itself (its corona several times its size).
      for (const [i, sun] of p.suns.entries()) {
        const e = sun.at;
        const wx = p.m[0] * e[0] + p.m[4] * e[1] + p.m[8] * e[2] + p.m[12];
        const wy = p.m[1] * e[0] + p.m[5] * e[1] + p.m[9] * e[2] + p.m[13];
        const wz = p.m[2] * e[0] + p.m[6] * e[1] + p.m[10] * e[2] + p.m[14];
        const scale = Math.hypot(p.m[0], p.m[1], p.m[2]);
        // (The disc fills 0.58 of the pictures' width: sized so it just covers the sun in its cradle, and drawn at
        // its near face, so the sphere doesn't hide it while the cradle in front still does.)
        const size = sun.r * scale * 2;
        const to = [cam.eye[0] - wx, cam.eye[1] - wy, cam.eye[2] - wz];
        const tl = Math.hypot(to[0], to[1], to[2]) || 1;
        const lift = (sun.r * scale * 1.05) / tl;
        const [sx, sy, sz] = [wx + to[0] * lift, wy + to[1] * lift, wz + to[2] * lift];
        // As the stellar gem: the corona breathing (a little larger and brighter, then back, every 5.5 seconds)...
        const breath = 0.5 - 0.5 * Math.cos(((time + i * 1.7) * 2 * Math.PI) / 5.5);
        if (this.sunCorona.ready) {
          gl.bindTexture(gl.TEXTURE_2D, this.sunCorona.tex);
          sprite.draw(sx, sy, sz, size * (1 + 0.07 * breath), 5, [1, 1, 1], 0.85 + 0.15 * breath, 0);
        }
        // ...and the disc turning slowly inside it (once every 48 seconds).
        if (this.sunDisc.ready) {
          gl.bindTexture(gl.TEXTURE_2D, this.sunDisc.tex);
          sprite.draw(sx, sy, sz, size, 5, [1, 1, 1], 1, -((time + i * 7) * 2 * Math.PI) / 48);
        }
      }
    }
    sprite.done();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /** The routes, as they stand: each a ribbon of six corners (start, end, which side, how far along, colour). */
  setRoutes(routes: MapRoute[]) {
    const gl = this.gl;
    const out: number[] = [];
    for (const r of routes) {
      const A = [r.a[0], 0, r.a[1]], B = [r.b[0], 0, r.b[1]];
      const c = r.colour ?? [1, 1, 1];
      const corner = (side: number, t: number) => out.push(...A, ...B, side, t, c[0], c[1], c[2], r.gone ? 0 : 1);
      corner(-1, 0); corner(1, 0); corner(1, 1);
      corner(-1, 0); corner(1, 1); corner(-1, 1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
    this.routeCount = out.length / 12;
  }

  /** The routes: soft tubes of light, behind the suns and the land where those stand in front. */
  private drawRoutes(cam: Camera, time: number, fade: number) {
    const gl = this.gl;
    if (!this.routeCount) return;
    gl.useProgram(this.routeProg);
    const u = (n: string) => gl.getUniformLocation(this.routeProg, n);
    gl.uniformMatrix4fv(u('uView'), false, cam.view);
    gl.uniformMatrix4fv(u('uProj'), false, cam.proj);
    gl.uniform1f(u('uTime'), time);
    gl.uniform1f(u('uAlpha'), fade);
    gl.uniform1f(u('uWidth'), 0.04);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeBuf);
    const locs: number[] = [];
    let off = 0;
    for (const [name, n] of [['aA', 3], ['aB', 3], ['aSide', 2], ['aColor', 4]] as const) {
      const l = gl.getAttribLocation(this.routeProg, name);
      if (l >= 0) {
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, n, gl.FLOAT, false, 48, off);
        locs.push(l);
      }
      off += n * 4;
    }
    gl.drawArrays(gl.TRIANGLES, 0, this.routeCount);
    for (const l of locs) gl.disableVertexAttribArray(l);
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
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(s('uTex'), 0);
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
    if (!this.list.length && !this.routeCount && !this.ships.size) return;
    const y = 0;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    this.stepHover();
    // Hovered, a star swells with a little overshoot, and flares.
    const swell = (o: MapObject) => {
      const h = o.id ? this.hoverAmt.get(o.id) ?? 0 : 0;
      return { h, k: 1 + 0.4 * h + 0.12 * Math.sin(Math.PI * h) };
    };
    const solid = this.solids(cam, time, fade);
    for (const o of this.list) {
      const r = (o.heart ? 0.072 : 0.036) * swell(o).k;
      if (o.dead) solid.draw(this.sphereBuf, this.counts.sphere, model(o.x, y, o.z, 0, o.seed, r * 0.55), 4, [0.62, 0.62, 0.64], 1);
      else {
        // A held sun takes its holder's colour, softened toward the paper.
        const held: [number, number, number] = o.ring ? [0, 1, 2].map((i) => SUN[i] * 0.45 + o.ring![i] * 0.55) as [number, number, number] : SUN;
        // A slow pulse in its size, as if it breathes.
        const pulse = 1 + 0.035 * Math.sin(time * 1.4 + o.seed * 3);
        solid.draw(this.sphereBuf, this.counts.sphere, model(o.x, y, o.z, 0.3, time * 0.15 + o.seed, r * pulse), o.dim && !o.doom ? 4 : 0, o.doom ? DOOM : o.dim ? [0.8, 0.81, 0.84] : held, 1, o.seed);
      }
    }
    solid.done();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.drawRoutes(cam, time, fade);
    this.drawShips(cam, time, fade);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const sprite = this.sprites(cam, time, fade);
    for (const o of this.list) {
      if (o.dead) continue;
      const { h, k } = swell(o);
      const r = (o.heart ? 0.072 : 0.036) * k;
      // A bright flare and a turning ring of light round a hovered star.
      if (h > 0.01) {
        sprite.draw(o.x, y, o.z, r * 6, 0, [1, 1, 1], 0.55 * h);
        sprite.draw(o.x, y, o.z, r * (3.2 + 0.6 * h), 4, o.ring ?? INK, 0.9 * h, o.seed + time * 0.4);
      }
      if (o.doom) {
        sprite.draw(o.x, y, o.z, r * 3.2, 0, DOOM, 0.45);
        sprite.draw(o.x, y, o.z, r * 2.4, 1, DOOM, 1);
      } else if (o.dim) {
        sprite.draw(o.x, y, o.z, r * 2.4, 0, [1, 1, 1], 0.2);
      } else {
        const breathe = 1 + 0.1 * Math.sin(time * 1.1 + o.seed);
        // A soft paper glow; where the player can travel, a fine dashed ring turning slowly and rings pulsing out
        // (in ink, or the holder's colour once held).
        sprite.draw(o.x, y, o.z, r * 4 * breathe, 0, [1, 1, 1], 0.7);
        const mark = o.ring ?? INK;
        if (o.reach) sprite.draw(o.x, y, o.z, r * 4.4, 4, mark, 0.6, o.seed);
        if (o.reach) sprite.draw(o.x, y, o.z, r * 3.9, 3, mark, 0.35, o.seed);
      }
      if (o.ring && !o.doom) sprite.draw(o.x, y, o.z, r * 2.4, 1, o.ring, 1);
    }
    sprite.done();
    this.drawStellari(cam, time, fade);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /**
   * The Stellari, drawn as the battle board draws its star (a wireframe of fine silver lines over pale petals) but
   * standing in the scene: just past the wormhole's sun (clear of it), turned to face the camera, its outer ring
   * of petals turning one way and its inner spikes the other, more slowly, the spikes a little in front.
   */
  private drawStellari(cam: Camera, time: number, fade: number) {
    const gl = this.gl;
    const heart = this.list.find((o) => o.heart);
    if (!heart || heart.dead) return;
    const R = 0.26;
    // (Just past the sun, its petals clear of it: the sun is 0.072 across, the flower R.)
    const x = heart.x + R * 0.75 + 0.1, z = heart.z, y = R + 0.12;
    // Facing the camera full on (as the home screen's flower faces the viewer).
    const d = [cam.eye[0] - x, cam.eye[1] - y, cam.eye[2] - z];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const f = d.map((v) => v / dl);
    const turn = (time * 4 * Math.PI) / 180;
    const solid = this.solids(cam, time, fade);
    // (Over the land, never into it: the hills past the strip rise behind it.)
    gl.disable(gl.DEPTH_TEST);
    // (A little breath, as if it were alive.)
    const b = 1 + 0.03 * Math.sin(time * 0.9);
    // The outer petals a little behind, the inner spikes a little in front: depth as the camera moves.
    const back = [x - f[0] * 0.03, y - f[1] * 0.03, z - f[2] * 0.03];
    const front = [x + f[0] * 0.03, y + f[1] * 0.03, z + f[2] * 0.03];
    for (let i = 0; i < 12; i++) {
      solid.draw(this.petalBuf, this.counts.petal, facing(back[0], back[1], back[2], f, turn + (i * Math.PI) / 6, R * b, R * b, R), 5, [1, 1, 1], 1);
    }
    for (let i = 0; i < 18; i++) {
      const a = -turn * 0.6 + ((i * 20 + 10) * Math.PI) / 180;
      solid.draw(this.spikeBuf, this.counts.spike, facing(front[0], front[1], front[2], f, a, R * b, R * b, R), 5, [1, 1, 1], 1);
    }
    solid.done();
    const sprite = this.sprites(cam, time, fade);
    sprite.draw(x, y, z, R * 1.2, 0, [1, 1, 1], 0.35);
    sprite.done();
    gl.enable(gl.DEPTH_TEST);
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
