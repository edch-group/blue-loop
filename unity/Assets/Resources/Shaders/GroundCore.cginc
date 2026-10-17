// The campaign's land, as Ground.shader and Blocks.shader both draw it (nebula3d.ts's GROUND_FRAG): paper, softly lit,
// faint splashes of sea blue on the hills, bent by whatever lies under the galaxy, a fine ink mesh drawn into it (its
// lines on the cells the land breaks into as it collapses: from the land's corner, every 0.22). In the web's own
// units (the object's space; the object scaled up to the map's, z flipped).
#ifndef GROUND_CORE_INCLUDED
#define GROUND_CORE_INCLUDED
#include "UnityCG.cginc"

fixed4 _Paper;
float _Galaxy, _G, _T, _Fade;

// The ink mesh: its lines every CELL from the land's corner (NebulaGeometry's X0, Z0; CampaignView.BlockCell).
static const float2 GRID0 = float2(-7.0, -5.5);
static const float CELL = 0.22;
static const float3 INK = float3(0.45, 0.51, 0.64);

float hash(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float vnoise(float2 p)
{
    float2 i = floor(p), f = frac(p);
    f = f * f * (3.0 - 2.0 * f);
    return lerp(lerp(hash(i), hash(i + float2(1, 0)), f.x), lerp(hash(i + float2(0, 1)), hash(i + float2(1, 1)), f.x), f.y);
}
float fbm(float2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.1 + 3.3); }

// A supermassive black hole's well (galaxy 1): the land sinks toward it, under the middle of the strip.
static const float2 HOLE = float2(0.0, -0.7);
float well(float2 p) { p -= HOLE; return _Galaxy > 0.5 && _Galaxy < 1.5 ? 0.8 * exp(-dot(p, p) / 0.75) : 0.0; }
// (GLSL's mat3 takes columns; laid out the same here as rows, it is applied as mul(v, m).)
float3x3 rot(float3 axis, float a)
{
    float c = cos(a), s = sin(a), t = 1.0 - c;
    float3 u = normalize(axis);
    return float3x3(t * u.x * u.x + c, t * u.x * u.y + s * u.z, t * u.x * u.z - s * u.y,
                    t * u.x * u.y - s * u.z, t * u.y * u.y + c, t * u.y * u.z + s * u.x,
                    t * u.x * u.z + s * u.y, t * u.y * u.z - s * u.x, t * u.z * u.z + c);
}

// How near a point (x, z) lies to the ink mesh's lines: 1 on a line, 0 a pixel or two off it.
float GridLine(float2 mp)
{
    float2 g = (mp - GRID0) / CELL;
    float2 gw = fwidth(g);
    float2 gl = abs(frac(g - 0.5) - 0.5) / max(gw, float2(1e-4, 1e-4));
    return 1.0 - min(min(gl.x, gl.y), 1.0);
}

/// The land's colour at a point: lit by its normal n (turned to face the eye from `at`, where it is now), its
/// patterns where it lay (xz; rest its height there), its ink mesh faded off with the distance (dist, in the web's units).
float3 LandColour(float3 at, float2 xz, float3 n, float rest, float dist)
{
    float3 eye = mul(unity_WorldToObject, float4(_WorldSpaceCameraPos, 1)).xyz;
    n = normalize(n);
    if (dot(n, eye - at) < 0.0) n = -n;
    float key = max(0.0, dot(n, normalize(float3(0.5, 0.8, 0.35))));
    float fill = max(0.0, dot(n, normalize(float3(-0.6, 0.4, 0.5)))) * 0.25;
    float3 c = lerp(float3(0.70, 0.73, 0.79), float3(0.99, 0.988, 0.98), saturate(0.2 + 0.8 * key + fill));
    // Splashes of sea blue, here and there on the hills round the strip (never in the trough it lies over).
    float2 q = xz * 0.35;
    float hills = smoothstep(-0.2, 0.08, rest);
    float splash = smoothstep(0.5, 0.7, fbm(q + 13.0)) * hills;
    c = lerp(c, c * float3(0.52, 0.72, 0.88) * 1.06, splash * 0.85);
    // (The web's uTime: from nothing each time the map is opened, as its well's turning is measured from it.)
    float time = _T;
    float2 mp = xz;
    if (_Galaxy > 0.5 && _Galaxy < 1.5)
    {
        // Into the well, the mesh is wound round the hole, turning slowly.
        mp -= float2(0.0, -0.7);
        float r = length(mp);
        float twist = 0.9 / (r + 0.35) + time * 0.08 * exp(-r * 0.6);
        mp = mul(mp, float2x2(cos(twist), sin(twist), -sin(twist), cos(twist))) + float2(0.0, -0.7);
        c *= lerp(1.0, 0.82, exp(-r * r / 0.4));
    }
    else if (_Galaxy > 1.5 && _Galaxy < 2.5)
    {
        // The pulsar's beams, sweeping round: the land lights where they fall.
        float beam = time * (6.2831853 / 9.0);
        float2 d = xz;
        float along = abs(dot(normalize(d + 1e-4), float2(sin(beam), cos(beam))));
        float lit = smoothstep(0.985, 0.9995, along) * smoothstep(0.2, 1.2, length(d));
        float halo = smoothstep(0.93, 0.999, along) * smoothstep(0.2, 1.2, length(d));
        c = lerp(c, float3(0.62, 0.8, 0.95), halo * 0.35);
        c = lerp(c, float3(1, 1, 1), lit * 0.8);
    }
    else if (_Galaxy > 2.5 && _Galaxy < 3.5)
    {
        // Meteors striking the hills: rings spreading from where each lands, and a scorch fading.
        for (int k = 0; k < 6; k++)
        {
            float t = time / 2.6 + k / 6.0;
            float cell = floor(t), f = frac(t);
            float2 hit = float2(hash(float2(cell, k)) * 11.0 - 5.5, hash(float2(k, cell + 3.0)) * 8.0 - 5.0);
            float dd = length(xz - hit);
            float ring = 1.0 - smoothstep(0.0, 0.02 + fwidth(dd), abs(dd - f * 0.9));
            float ring2 = 1.0 - smoothstep(0.0, 0.015 + fwidth(dd), abs(dd - f * 0.55));
            c = lerp(c, INK, max(ring, ring2 * 0.6) * (1.0 - f) * 0.8 * hills);
            c = lerp(c, float3(0.52, 0.72, 0.88), exp(-dd * dd * 60.0) * (1.0 - f) * hills);
        }
    }
    else if (_Galaxy > 3.5 && _Galaxy < 4.5)
    {
        // A nebula: sea-blue mist lying in the hollows of the hills, drifting.
        float mist = smoothstep(0.42, 0.75, fbm(xz * 0.5 + float2(time * 0.03, time * 0.012)));
        float low = 1.0 - smoothstep(-0.1, 0.35, rest);
        c = lerp(c, lerp(c, float3(0.62, 0.78, 0.92), 0.8), mist * low * hills * 0.9);
    }
    else if (_Galaxy > 4.5)
    {
        // Dark matter: unseen masses drifting under the land, bending its mesh round them, a shadow on it.
        for (int k = 0; k < 3; k++)
        {
            float2 mass = float2(sin(time * 0.05 + k * 2.1) * 4.5, cos(time * 0.04 + k * 1.7) * 2.0 - 1.5);
            float2 dd = mp - mass;
            float pull = exp(-dot(dd, dd) / 1.4);
            mp -= dd * pull * 0.35;
            c *= 1.0 - pull * 0.12;
        }
    }
    // The mesh, in fine ink.
    float nearby = 1.0 - smoothstep(5.0, 11.0, dist);
    c = lerp(c, INK, GridLine(mp) * 0.32 * nearby);
    return c;
}

// How far into the paper the land fades at a point: at its edges (where it lay: xz), and far off.
float LandAway(float2 xz, float dist)
{
    float edge = min(min(xz.x + 7.0, 7.0 - xz.x), min(xz.y + 5.5, 4.0 - xz.y));
    return max(1.0 - smoothstep(0.0, 1.8, edge), smoothstep(7.0, 20.0, dist));
}

// The cracks' glow, the colours beneath the land showing through them (x: where along the land).
float3 CrackGlow(float x) { return lerp(float3(0.5, 0.36, 0.88), float3(0.3, 0.75, 0.95), 0.5 + 0.5 * sin(x * 3.0 + _T * 2.0)); }
#endif
