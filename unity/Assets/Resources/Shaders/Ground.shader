// The campaign's ground (nebula3d.ts's GROUND_VERT/GROUND_FRAG): paper, softly lit, a fine ink mesh drawn into it,
// faint splashes of sea blue on the hills, bent by whatever lies under the galaxy; at its edges and far off it fades
// into the paper. Shards past the collapse (_Gone, in the route's columns; each shard knows its own) turn about their
// middles and fall; those next to go (up to _Crack) are marked faintly red, their borders glowing. Land drawn soft (the
// campaign menu's, _Soft; or the first map's west of _SoftBelow, where the menu broke it) drifts down slowly as it
// fades. Two passes, as the web draws it: the land standing, then what falls, blended over what lies beneath (the
// abyss: Abyss.shader), see-through as it fades.
// Drawn in the web's own units (the object's space; the object scaled up to the map's, z flipped).
Shader "BlueLoop/Ground"
{
    Properties
    {
        _Paper ("Paper", Color) = (0.957,0.953,0.937,1)
        _Gone ("Gone", Float) = -50
        _Crack ("Crack", Float) = -50
        _Galaxy ("Galaxy", Float) = 0
        _T ("The map's own clock (seconds since it was opened)", Float) = 0
        _G ("World per unit", Float) = 1
        _Soft ("Soft (the campaign menu's land)", Float) = 0
        _SoftBelow ("Soft below (the first map, where the menu broke it)", Float) = -1000000000
    }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        Cull Off
        CGINCLUDE
            #include "UnityCG.cginc"
            fixed4 _Paper;
            float _Gone, _Crack, _Galaxy, _G, _Soft, _SoftBelow, _T;
            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float3 bary : TEXCOORD0;
                float3 edge : TEXCOORD1;
                float4 shard : TEXCOORD2;
                float2 prog : TEXCOORD3;
            };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 world : TEXCOORD0;
                float3 norm : TEXCOORD1;
                float3 bary : TEXCOORD2;
                float3 edge : TEXCOORD3;
                float4 more : TEXCOORD4; // fall, crack, dist, rest
                float soft : TEXCOORD5;
            };

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

            v2f vert (appdata v)
            {
                v2f o;
                float3 p = v.vertex.xyz, n = v.normal;
                float3 mid = v.shard.xyz;
                float rest = p.y;
                float wd = well(p.xz);
                if (wd > 0.001)
                {
                    p.y -= wd;
                    mid.y -= well(mid.xz);
                    float2 slope = (p.xz - HOLE) * (2.0 / 0.75) * wd;
                    n = normalize(n - float3(slope.x, 0.0, slope.y));
                }
                float prog = v.prog.x;
                float soft = _Soft > 0.5 || prog < _SoftBelow ? 1.0 : 0.0;
                float fall = (_Gone - prog) / 1.6 + v.shard.w * 0.45;
                if (fall > 0.0)
                {
                    float t = min(fall, 2.2);
                    // (Soft, as on the campaign menu, whose camera rides low: drifting down slowly, tumbling gently, as
                    // it fades, so it is seen to go rather than dropping straight out of the view.)
                    float3x3 r = rot(float3(v.shard.w - 0.5, 0.3, 0.5 - frac(v.shard.w * 7.0)), t * (0.8 + v.shard.w * 1.6) * (1.0 - 0.6 * soft));
                    p = mid + mul(p - mid, r);
                    n = mul(n, r);
                    p.y -= lerp(3.2, 0.35, soft) * t * t;
                    p.xz += mid.xz * 0.04 * t;
                }
                o.pos = UnityObjectToClipPos(float4(p, 1));
                o.world = p;
                o.norm = n;
                o.bary = v.bary;
                o.edge = v.edge;
                float crack = (prog < _Crack || fall > 0.0) ? 1.0 : 0.0;
                o.more = float4(fall, crack, -UnityObjectToViewPos(p).z / _G, rest);
                o.soft = soft;
                return o;
            }

            // (falling 0: the land standing, drawn first; 1: what falls, over it.)
            fixed4 shade (v2f i, float falling)
            {
                float fall = i.more.x, cracked = i.more.y, dist = i.more.z, rest = i.more.w;
                if (fall > 2.0) discard;
                if ((fall > 0.0) != (falling > 0.5)) discard;
                // (Land drawn soft: what falls fades out as it goes, and nothing is marked red before it does.)
                float keep = i.soft > 0.5 ? 1.0 - smoothstep(0.0, 1.1, fall) : 1.0;
                if (keep < 0.01) discard;
                float3 w = i.world;
                float3 eye = mul(unity_WorldToObject, float4(_WorldSpaceCameraPos, 1)).xyz;
                float3 n = normalize(i.norm);
                if (dot(n, eye - w) < 0.0) n = -n;
                float key = max(0.0, dot(n, normalize(float3(0.5, 0.8, 0.35))));
                float fill = max(0.0, dot(n, normalize(float3(-0.6, 0.4, 0.5)))) * 0.25;
                float3 c = lerp(float3(0.70, 0.73, 0.79), float3(0.99, 0.988, 0.98), saturate(0.2 + 0.8 * key + fill));
                // Splashes of sea blue, here and there on the hills round the strip (never in the trough it lies over).
                float2 q = w.xz * 0.35;
                float hills = smoothstep(-0.2, 0.08, rest);
                float splash = smoothstep(0.5, 0.7, fbm(q + 13.0)) * hills;
                c = lerp(c, c * float3(0.52, 0.72, 0.88) * 1.06, splash * 0.85);
                // (The web's uTime: from nothing each time the map is opened, as its well's turning is measured from it.)
                float time = _T;
                float2 mp = w.xz;
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
                    float2 d = w.xz;
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
                        float2 at = float2(hash(float2(cell, k)) * 11.0 - 5.5, hash(float2(k, cell + 3.0)) * 8.0 - 5.0);
                        float dd = length(w.xz - at);
                        float ring = 1.0 - smoothstep(0.0, 0.02 + fwidth(dd), abs(dd - f * 0.9));
                        float ring2 = 1.0 - smoothstep(0.0, 0.015 + fwidth(dd), abs(dd - f * 0.55));
                        c = lerp(c, float3(0.45, 0.51, 0.64), max(ring, ring2 * 0.6) * (1.0 - f) * 0.8 * hills);
                        c = lerp(c, float3(0.52, 0.72, 0.88), exp(-dd * dd * 60.0) * (1.0 - f) * hills);
                    }
                }
                else if (_Galaxy > 3.5 && _Galaxy < 4.5)
                {
                    // A nebula: sea-blue mist lying in the hollows of the hills, drifting.
                    float mist = smoothstep(0.42, 0.75, fbm(w.xz * 0.5 + float2(time * 0.03, time * 0.012)));
                    float low = 1.0 - smoothstep(-0.1, 0.35, rest);
                    c = lerp(c, lerp(c, float3(0.62, 0.78, 0.92), 0.8), mist * low * hills * 0.9);
                }
                else if (_Galaxy > 4.5)
                {
                    // Dark matter: unseen masses drifting under the land, bending its mesh round them, a shadow on it.
                    for (int k = 0; k < 3; k++)
                    {
                        float2 at = float2(sin(time * 0.05 + k * 2.1) * 4.5, cos(time * 0.04 + k * 1.7) * 2.0 - 1.5);
                        float2 dd = mp - at;
                        float pull = exp(-dot(dd, dd) / 1.4);
                        mp -= dd * pull * 0.35;
                        c *= 1.0 - pull * 0.12;
                    }
                }
                // The mesh, in fine ink.
                float2 g = mp / 0.22;
                float2 gw = fwidth(g);
                float2 gl = abs(frac(g - 0.5) - 0.5) / max(gw, float2(1e-4, 1e-4));
                float mesh = 1.0 - min(min(gl.x, gl.y), 1.0);
                float nearby = 1.0 - smoothstep(5.0, 11.0, dist);
                c = lerp(c, float3(0.45, 0.51, 0.64), mesh * 0.32 * nearby);
                // Cracks along the shards' borders, glowing with the colours beneath.
                if (cracked > 0.5 && i.soft < 0.5)
                {
                    float3 b = i.bary + (1.0 - i.edge) * 9.0;
                    float d = min(b.x, min(b.y, b.z));
                    float wd = fwidth(d) * 1.8;
                    float crack = 1.0 - smoothstep(0.0, wd, d);
                    float3 glow = lerp(float3(0.5, 0.36, 0.88), float3(0.3, 0.75, 0.95), 0.5 + 0.5 * sin(w.x * 3.0 + time * 2.0));
                    if (fall <= 0.0) c *= float3(1.0, 0.9, 0.88);
                    c = lerp(c, glow, crack * 0.9);
                    if (fall > 0.0) c *= 1.0 - min(fall, 1.5) * 0.35;
                }
                // Fading at the land's edges and far off into the paper.
                float edge = min(min(w.x + 7.0, 7.0 - w.x), min(w.z + 5.5, 4.0 - w.z));
                float away = max(1.0 - smoothstep(0.0, 1.8, edge), smoothstep(7.0, 20.0, dist));
                if (fall <= 0.0) c = lerp(c, _Paper.rgb, away);
                return fixed4(c * keep, keep);
            }
            fixed4 frag (v2f i) : SV_Target { return shade(i, 0.0); }
            fixed4 fragFall (v2f i) : SV_Target { return shade(i, 1.0); }
        ENDCG
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.5
            ENDCG
        }
        Pass
        {
            Blend One OneMinusSrcAlpha
            ZWrite Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment fragFall
            #pragma target 3.5
            ENDCG
        }
    }
}
