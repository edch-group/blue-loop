// The suns as the web draws them (sun3d.ts), per pixel on the GPU: the corona's flames, the flat things on the board
// round the sun (the rings, the planets' bases, the orbit's trail and notches, the lattice's foot), the sun and its
// planets ray-traced as half-spheres, and the shields' lattice cells. Shared by SunCorona, SunFlat, SunBalls and
// SunLattice. Colours are worked in the canvas's own numbers (sRGB, 0–255 where sun3d.ts uses bytes), as the web does.
// (Written so it also compiles as GLSL ES 3 for checking against the CPU drawing: every literal a float, casts as
// macros, no HLSL-only intrinsics.)
#ifndef SUN_CORE_INCLUDED
#define SUN_CORE_INCLUDED

#ifndef SUN_GLSL
#define SUN_U32(x) ((uint)(x))
#define SUN_I32(x) ((int)(x))
#define SUN_F32(x) ((float)(x))
#define SUN_SAMPLE(s, uv) tex2Dlod(s, float4(uv, 0.0, 0.0))
#endif

#define SUN_PI 3.14159265358979
#define SUN_DEG 0.0174532925199433

// ---- Noise (sun3d.ts hash3, noise3, fbm3) ----

float SunHash3(int x, int y, int z)
{
    uint h = (SUN_U32(x) * 374761393u) ^ (SUN_U32(y) * 668265263u) ^ (SUN_U32(z) * 2147483647u);
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = h ^ (h >> 16u);
    return SUN_F32(h) / 4294967296.0;
}

float SunNoise3(float3 p)
{
    float3 fl = floor(p);
    int xi = SUN_I32(fl.x);
    int yi = SUN_I32(fl.y);
    int zi = SUN_I32(fl.z);
    float3 f = p - fl;
    float3 w = f * f * (3.0 - 2.0 * f);
    float c000 = SunHash3(xi, yi, zi), c100 = SunHash3(xi + 1, yi, zi);
    float c010 = SunHash3(xi, yi + 1, zi), c110 = SunHash3(xi + 1, yi + 1, zi);
    float c001 = SunHash3(xi, yi, zi + 1), c101 = SunHash3(xi + 1, yi, zi + 1);
    float c011 = SunHash3(xi, yi + 1, zi + 1), c111 = SunHash3(xi + 1, yi + 1, zi + 1);
    return lerp(lerp(lerp(c000, c100, w.x), lerp(c010, c110, w.x), w.y),
        lerp(lerp(c001, c101, w.x), lerp(c011, c111, w.x), w.y), w.z);
}

float SunFbm4(float3 p)
{
    float sum = 0.0, amp = 0.5, f = 1.0, norm = 0.0;
    for (int i = 0; i < 4; i++)
    {
        sum += amp * SunNoise3(p * f);
        norm += amp;
        f *= 2.07;
        amp *= 0.52;
    }
    return sum / norm;
}

// ---- The surface (512 × 256, its brightness in 16 bits: red the high byte, green the low; point-sampled) ----

float SunSurface(sampler2D tex, int col, int row)
{
    float4 c = SUN_SAMPLE(tex, float2((SUN_F32(col) + 0.5) / 512.0, (SUN_F32(row) + 0.5) / 256.0));
    return (floor(c.r * 255.0 + 0.5) * 256.0 + floor(c.g * 255.0 + 0.5)) / 65535.0;
}

// ---- Compositing: source-over on straight colours (the canvas's own) ----

float4 SunOver(float4 d, float3 c, float a)
{
    if (a <= 0.0) return d;
    float oa = a + d.a * (1.0 - a);
    if (oa <= 0.0) return d;
    return float4((c * a + d.rgb * d.a * (1.0 - a)) / oa, oa);
}

// ---- The corona (sun3d.ts draw) ----

// `q`: the pixel from the sun's centre, in its base radii (y down, as the canvas's). deep, mid, bright: the palette
// (0–255). flick: time × 0.0004; wispRow: (flick × 20) mod 256; wispCol: floor(flick × 30) mod 512.
float4 SunCoronaPixel(float2 q, float3 deep, float3 mid, float3 bright, float danger, float seed, float flick,
    float wispRow, float wispCol, sampler2D surface)
{
    float r = sqrt(q.x * q.x + q.y * q.y);
    // Under the dome: solid and white-hot, so no board shows through between its facets.
    if (r <= 1.0) return float4(bright / 255.0, 1.0);
    if (r > 1.75) return float4(0.0, 0.0, 0.0, 0.0);
    // (Which of the 360 flames' directions it lies in.)
    float turn = atan2(q.y, q.x) / (SUN_PI * 2.0) + 1.0;
    int f = SUN_I32(floor((turn - floor(turn)) * 360.0));
    if (f > 359) f = 359;
    float ang = SUN_F32(f) / 360.0 * SUN_PI * 2.0;
    float flameBase = SunFbm4(float3(cos(ang) * 2.6 + flick, sin(ang) * 2.6, flick * 0.6 + seed));
    // Ragged wisps: the surface texture, sampled along the flame, frays its edge.
    int row = SUN_I32(floor(r * 37.0 + wispRow)) % 256;
    int col = (f * 2 + SUN_I32(wispCol)) % 512;
    float wisp = SunSurface(surface, col, row);
    float flame = flameBase * (0.7 + 0.6 * wisp);
    float reach = 0.16 + flame * (danger > 0.5 ? 0.62 : 0.46);
    float o = (r - 1.0) / reach;
    if (o >= 1.0) return float4(0.0, 0.0, 0.0, 0.0);
    // White-hot at the base, then orange flames reddening and thinning towards their tips.
    float hot = max(0.0, 1.0 - o * 3.0);
    float glow = pow(1.0 - o, 1.6) * (0.65 + flame * 0.5);
    float3 c = float3(255.0 * hot + mid.x * (1.0 - hot),
        244.0 * hot + (mid.y * (1.0 - o) + deep.y * o) * (1.0 - hot),
        200.0 * hot + (mid.z * (1.0 - o) + deep.z * o) * (1.0 - hot));
    return float4(clamp(c, 0.0, 255.0) / 255.0, clamp(glow, 0.0, 1.0));
}

// ---- The flat things (a canvas's strokes, each smoothed over 1/s at its edges) ----

// A circle's arc from lo to hi (degrees, lo <= hi, y down), `width` wide; round caps if asked. How much of the pixel.
float SunArc(float2 p, float2 c, float r, float lo, float hi, float width, float roundCap, float s)
{
    float half_ = width / 2.0;
    float2 d = p - c;
    float dd = sqrt(d.x * d.x + d.y * d.y);
    float dist;
    if (hi - lo >= 359.99) dist = abs(dd - r);
    else
    {
        float ang = atan2(d.y, d.x) / SUN_DEG;
        // (The angle brought into the arc's own range.)
        float k = ang;
        if (k < lo) k += 360.0 * ceil((lo - k) / 360.0);
        if (k > lo + 360.0) k -= 360.0 * ceil((k - lo - 360.0) / 360.0);
        if (k <= hi) dist = abs(dd - r);
        else if (roundCap < 0.5) return 0.0;
        else
        {
            float2 e0 = c + float2(cos(lo * SUN_DEG), sin(lo * SUN_DEG)) * r;
            float2 e1 = c + float2(cos(hi * SUN_DEG), sin(hi * SUN_DEG)) * r;
            dist = min(length(p - e0), length(p - e1));
        }
    }
    return clamp((half_ - dist) * s + 0.5, 0.0, 1.0);
}

float4 SunStroke(float4 d, float2 p, float2 c, float r, float a0, float a1, float width, float4 col, float roundCap, float s)
{
    float cov = SunArc(p, c, r, min(a0, a1), max(a0, a1), width, roundCap, s);
    return SunOver(d, col.rgb, col.a * cov);
}

// A filled disc with a stroked edge (a notch).
float4 SunDisc(float4 d, float2 p, float2 c, float r, float4 fill, float4 stroke, float width, float s)
{
    float dd = length(p - c);
    d = SunOver(d, fill.rgb, fill.a * clamp((r - dd) * s + 0.5, 0.0, 1.0));
    return SunOver(d, stroke.rgb, stroke.a * clamp((width / 2.0 - abs(dd - r)) * s + 0.5, 0.0, 1.0));
}

// A planet's base: a disc from r0 out to r1 in its colour, alpha by the gradient's stops (0 0.9, 0.45 0.7, 0.75 0.22, 1 0).
float4 SunBase(float4 d, float2 p, float2 c, float r0, float r1, float3 col, float s)
{
    float dd = length(p - c);
    if (dd > r1 + 1.0 / s) return d;
    float t = clamp((dd - r0) / (r1 - r0), 0.0, 1.0);
    float a = t <= 0.45 ? lerp(0.9, 0.7, t / 0.45) : t <= 0.75 ? lerp(0.7, 0.22, (t - 0.45) / 0.3) : lerp(0.22, 0.0, (t - 0.75) / 0.25);
    return SunOver(d, col, a * clamp((r1 - dd) * s + 0.5, 0.0, 1.0));
}

// ---- What lies flat round the sun, in order ----

float4 SunNotch(float4 d, float2 p, float2 c, float vs, float k, float stage, float3 facing, float s)
{
    float deg = 50.0 + 40.0 * k;
    float2 at = c + float2(cos(deg * SUN_DEG), sin(deg * SUN_DEG)) * 0.56 * vs;
    bool reached = stage >= k - 0.02;
    bool now = floor(stage + 0.5) == k || (stage > 2.0 && k == 2.0);
    float rr = vs * (now ? 0.026 : 0.018);
    float4 fill = reached ? float4(facing, 1.0) : float4(1.0, 1.0, 1.0, 1.0);
    float4 edge = reached ? float4(1.0, 1.0, 1.0, 1.0) : float4(150.0 / 255.0, 160.0 / 255.0, 185.0 / 255.0, 0.85);
    return SunDisc(d, p, at, rr, fill, edge, max(1.0, vs * 0.008), s);
}

// What lies flat round a sun, at a point of its dome canvas (`uv`, 0–1, v up): straight colour, 0–1.
float4 SunFlatPixel(float2 uv, float4 geo, float4 rings, float4 rim, float4 planets, float4 base0, float4 base1,
    float4 base2, float4 trail0, float4 trail1, float4 trail2, float4 facing, float4 lattice)
{
    float vs = geo.x, span = geo.y, pad = geo.z, s = geo.w;
    // (The pixel in the gauge's own px: x right, y down from its top-left.)
    float2 p = float2(uv.x * span - pad, (1.0 - uv.y) * span - pad);
    float2 c = float2(vs / 2.0, vs / 2.0);
    float dim = rings.x;
    float4 d = float4(0.0, 0.0, 0.0, 0.0);
    // The tracks (art.ts ringTracks): the orbit, the shields' and the heat's, each a full faint ring and its arc
    // from the left end round the near side.
    if (rings.y > 0.5) d = SunStroke(d, p, c, 0.56 * vs, 0.0, 360.0, vs * 0.009, float4(150.0 / 255.0, 160.0 / 255.0, 185.0 / 255.0, 0.5 * dim), 0.0, s);
    d = SunStroke(d, p, c, 0.47 * vs, 0.0, 360.0, vs * 0.032, float4(150.0 / 255.0, 164.0 / 255.0, 190.0 / 255.0, 0.22 * dim), 0.0, s);
    if (rings.w > 0.0)
    {
        // (Its glow: drop-shadow(0 0 3px rgba(110, 150, 220, 0.7)).)
        d = SunStroke(d, p, c, 0.47 * vs, 180.0, 180.0 - 360.0 * rings.w, vs * 0.032 + 6.0, float4(110.0 / 255.0, 150.0 / 255.0, 220.0 / 255.0, 0.25 * dim), 1.0, s);
        d = SunStroke(d, p, c, 0.47 * vs, 180.0, 180.0 - 360.0 * rings.w, vs * 0.032, float4(109.0 / 255.0, 140.0 / 255.0, 194.0 / 255.0, dim), 1.0, s);
    }
    d = SunStroke(d, p, c, 0.40 * vs, 0.0, 360.0, vs * 0.022, float4(1.0, 1.0, 1.0, 0.75 * dim), 0.0, s);
    if (rings.z > 0.0) d = SunStroke(d, p, c, 0.40 * vs, 180.0, 180.0 - 360.0 * rings.z, vs * 0.022, float4(rim.rgb, dim), 1.0, s);
    if (planets.x > 0.5)
    {
        // The planets' bases: a band of each one's colour hugging its outline, fading out.
        float pr = planets.y;
        d = SunBase(d, p, base0.xy, pr, pr * 1.35, trail0.rgb, s);
        d = SunBase(d, p, base1.xy, pr, pr * 1.35, trail1.rgb, s);
        d = SunBase(d, p, base2.xy, pr, pr * 1.35, trail2.rgb, s);
        // (Its days marked only while a planet faces the sun for more than one.)
        if (planets.z > 0.5)
        {
            float stage = planets.w;
            float to = 50.0 + 40.0 * stage, alpha = stage > 2.0 ? 3.0 - stage : 1.0;
            if (to > 50.01 && alpha > 0.0) d = SunStroke(d, p, c, 0.56 * vs, 50.0, to, max(2.5, vs * 0.028), float4(facing.rgb, alpha), 1.0, s);
            d = SunNotch(d, p, c, vs, 0.0, stage, facing.rgb, s);
            d = SunNotch(d, p, c, vs, 1.0, stage, facing.rgb, s);
            d = SunNotch(d, p, c, vs, 2.0, stage, facing.rgb, s);
        }
    }
    // Where the shield dome meets the board: a faint ring.
    if (lattice.x > 0.5) d = SunStroke(d, p, c, lattice.y, 0.0, 360.0, max(1.0, vs * 0.008), float4(118.0 / 255.0, 178.0 / 255.0, 240.0 / 255.0, lattice.z), 0.0, s);
    return d;
}

// ---- The balls: half-spheres in the board, ray-traced from the eye (sun3d.ts traceGeometry, traceBalls) ----

// The line of sight from the eye `cam` to the board point `p` (gauge px), against a ball (centre on the board, radius
// ball.w). How much of the pixel it covers (0: none), and the surface there.
float SunTrace(float3 cam, float2 p, float4 ball, float s, out float3 n, out float mu, out float lon, out float v)
{
    n = float3(0.0, 0.0, 1.0);
    mu = 0.0;
    lon = 0.0;
    v = 0.0;
    float3 ctr = ball.xyz;
    float r = ball.w;
    float ox = cam.x - ctr.x, oy = cam.y - ctr.y, oz = cam.z - ctr.z;
    float oo = ox * ox + oy * oy + oz * oz;
    float dx = p.x - cam.x, dy = p.y - cam.y, dz = -cam.z;
    float a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz;
    // How close the line passes to the ball's centre, and how big a pixel is out there (for smooth edges).
    float closest = sqrt(max(0.0, oo - b * b / a));
    float reach = sqrt(oo / a) / s;
    float cov = clamp((r - closest) / reach + 0.5, 0.0, 1.0);
    if (cov <= 0.0) return 0.0;
    float disc = b * b - a * (oo - r * r);
    float t = disc > 0.0 ? (-b - sqrt(disc)) / a : -b / a;
    float px = cam.x + dx * t, py = cam.y + dy * t, pz = cam.z + dz * t;
    // Where the ball meets the board on the near side, smooth its edge too.
    float qx = p.x - ctr.x, qy = p.y - ctr.y;
    float edge = 1.0;
    if (pz < r * 0.25 && qx * ox + qy * oy > 0.0) edge = clamp((r - sqrt(qx * qx + qy * qy)) * s + 0.5, 0.0, 1.0);
    float both = min(cov, edge);
    if (both <= 0.0) return 0.0;
    if (pz < 0.0) pz = 0.0;
    float3 nn = float3(px - ctr.x, py - ctr.y, pz - ctr.z);
    float nl = length(nn);
    if (nl == 0.0) nl = 1.0;
    nn /= nl;
    if (nn.z < 0.0) nn.z = 0.0;
    float3 vv = float3(cam.x - px, cam.y - py, cam.z - pz);
    float vl = length(vv);
    if (vl == 0.0) vl = 1.0;
    vv /= vl;
    n = nn;
    mu = max(0.0, dot(nn, vv));
    lon = atan2(nn.y, nn.x);
    v = asin(min(1.0, nn.z)) / SUN_PI + 0.5;
    return both;
}

// The sun's surface (0–255): its granulation turning with it (`spin` in radians), white-hot at its outline.
float3 SunShade(float mu, float lon, float v, float spin, float3 deep, float3 mid, float3 bright, float dead, sampler2D surface)
{
    float u = (lon + spin) / (SUN_PI * 2.0);
    int row = min(255, SUN_I32(floor(v * 256.0)));
    int col = SUN_I32(floor((u - floor(u)) * 512.0)) % 512;
    float raw = SunSurface(surface, col, row);
    float g = clamp((raw - 0.3) * 1.6, 0.0, 1.0);
    float k = min(1.0, g * (0.6 + 0.4 * sqrt(mu)));
    float a = k < 0.5 ? k / 0.5 : (k - 0.5) / 0.5;
    float3 lo = k < 0.5 ? deep : mid;
    float3 hi = k < 0.5 ? mid : bright;
    float w = dead > 0.5 ? 0.0 : min(1.0, pow(max(0.0, 1.0 - mu), 4.0) * 1.3);
    float3 bse = lo + (hi - lo) * a;
    return bse + (float3(255.0, 248.0, 222.0) - bse) * w;
}

// A planet's surface (0–255) from its map (256 × 128, bilinear, wrapping round), turned by `turn` (radians), lit from
// the sun: a soft terminator, darker towards the outline, a glint of sunlight; a living world's air glowing at its rim.
float3 SunPlanetShade(sampler2D map, float3 n, float mu, float lon, float v, float turn, float3 light, float3 halfway, float wet)
{
    float u = (lon + turn) / (SUN_PI * 2.0);
    float fx = (u - floor(u)) * 256.0, fy = min(128.0 - 1.001, v * (128.0 - 1.0));
    float3 tx = SUN_SAMPLE(map, float2((fx + 0.5) / 256.0, (fy + 0.5) / 128.0)).rgb * 255.0;
    float sun = max(0.0, dot(n, light));
    float lite = 0.5 + 0.62 * pow(sun, 0.8) - 0.16 * (1.0 - mu);
    float spec = wet > 0.5 ? pow(max(0.0, dot(n, halfway)), 40.0) * 90.0 : pow(max(0.0, dot(n, halfway)), 18.0) * 36.0;
    float3 col = min(float3(255.0, 255.0, 255.0), tx * lite + spec);
    if (wet > 0.5) col += (float3(170.0, 220.0, 255.0) - col) * (pow(max(0.0, 1.0 - mu), 3.0) * 0.6);
    return col;
}

// A ball's colour laid on the balls' own layer (0–255, its alpha the cover): nearer balls come later and paint over.
float4 SunLay(float4 d, float3 col, float cov)
{
    if (cov <= 0.0) return d;
    if (d.a == 0.0 || cov >= 1.0) return float4(col, cov);
    return float4(d.rgb + (col - d.rgb) * cov, min(1.0, d.a + (1.0 - d.a) * cov));
}

// One ball (`kind`: below 0 none, 0 the sun, 1–3 a planet, its map and light) laid on the balls' layer.
float4 SunBallSlot(float4 d, float2 p, float3 cam, float s, float4 ball, float kind, float4 sunp, float3 deep, float3 mid,
    float3 bright, float4 light0, float4 halfway0, float4 light1, float4 halfway1, float4 light2, float4 halfway2,
    sampler2D surface, sampler2D map0, sampler2D map1, sampler2D map2)
{
    if (kind < -0.5) return d;
    float3 n;
    float mu, lon, v;
    float cov = SunTrace(cam, p, ball, s, n, mu, lon, v);
    if (cov <= 0.0) return d;
    float3 col;
    if (kind < 0.5) col = SunShade(mu, lon, v, sunp.x, deep, mid, bright, sunp.y, surface);
    else if (kind < 1.5) col = SunPlanetShade(map0, n, mu, lon, v, halfway0.w, light0.xyz, halfway0.xyz, light0.w);
    else if (kind < 2.5) col = SunPlanetShade(map1, n, mu, lon, v, halfway1.w, light1.xyz, halfway1.xyz, light1.w);
    else col = SunPlanetShade(map2, n, mu, lon, v, halfway2.w, light2.xyz, halfway2.xyz, light2.w);
    return SunLay(d, col, cov);
}

// The sun and its planets at a point of the dome canvas (`uv`, 0–1, v up), farthest ball first: straight colour, 0–1.
// geo: vs, span, pad, s. cam: the eye (gauge px, z up). ball0–3: each slot's centre and radius, kinds its kind.
// sunp: the sun's spin (radians), dead. light, halfway: each planet's light and halfway vectors, wet (light.w) and turn
// (halfway.w).
float4 SunBallsPixel(float2 uv, float4 geo, float4 cam, float4 ball0, float4 ball1, float4 ball2, float4 ball3, float4 kinds,
    float4 sunp, float4 deep, float4 mid, float4 bright, float4 light0, float4 halfway0, float4 light1, float4 halfway1,
    float4 light2, float4 halfway2, sampler2D surface, sampler2D map0, sampler2D map1, sampler2D map2)
{
    float2 p = float2(uv.x * geo.y - geo.z, (1.0 - uv.y) * geo.y - geo.z);
    float s = geo.w;
    float4 d = float4(0.0, 0.0, 0.0, 0.0);
    d = SunBallSlot(d, p, cam.xyz, s, ball0, kinds.x, sunp, deep.xyz, mid.xyz, bright.xyz, light0, halfway0, light1, halfway1, light2, halfway2, surface, map0, map1, map2);
    d = SunBallSlot(d, p, cam.xyz, s, ball1, kinds.y, sunp, deep.xyz, mid.xyz, bright.xyz, light0, halfway0, light1, halfway1, light2, halfway2, surface, map0, map1, map2);
    d = SunBallSlot(d, p, cam.xyz, s, ball2, kinds.z, sunp, deep.xyz, mid.xyz, bright.xyz, light0, halfway0, light1, halfway1, light2, halfway2, surface, map0, map1, map2);
    d = SunBallSlot(d, p, cam.xyz, s, ball3, kinds.w, sunp, deep.xyz, mid.xyz, bright.xyz, light0, halfway0, light1, halfway1, light2, halfway2, surface, map0, map1, map2);
    return float4(clamp(d.rgb / 255.0, 0.0, 1.0), d.a);
}

// ---- The shields' lattice: one hexagon (its six corners on the board, gauge px), filled, then its outline stroked ----

float4 SunCell(float2 p, float2 c0, float2 c1, float2 c2, float2 c3, float2 c4, float2 c5, float a, float width, float s)
{
    float2 pts[6];
    pts[0] = c0; pts[1] = c1; pts[2] = c2; pts[3] = c3; pts[4] = c4; pts[5] = c5;
    bool inside = false;
    float dist = 1e9;
    for (int k = 0; k < 6; k++)
    {
        float2 pa = pts[k == 0 ? 5 : k - 1];
        float2 pb = pts[k];
        if ((pb.y > p.y) != (pa.y > p.y) && p.x < (pa.x - pb.x) * (p.y - pb.y) / (pa.y - pb.y) + pb.x) inside = !inside;
        float2 ab = pa - pb;
        float t = clamp(dot(p - pb, ab) / max(1e-6, dot(ab, ab)), 0.0, 1.0);
        dist = min(dist, length(p - (pb + ab * t)));
    }
    float f = inside ? clamp(dist * s + 0.5, 0.0, 1.0) : clamp(0.5 - dist * s, 0.0, 1.0);
    float e = clamp((width / 2.0 - dist) * s + 0.5, 0.0, 1.0);
    float4 d = float4(0.0, 0.0, 0.0, 0.0);
    d = SunOver(d, float3(150.0, 200.0, 255.0) / 255.0, a * 0.16 * f);
    d = SunOver(d, float3(118.0, 178.0, 240.0) / 255.0, a * e);
    return d;
}

#endif
