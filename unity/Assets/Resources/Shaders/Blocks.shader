// The map's land breaking away (CampaignView.Blocks): each cell of its ink mesh a solid block, its top the land as it
// lay over that cell (hills and all), its sides of rock straight down to a flat bottom. A block breaks away once the
// collapse sweeping along the route (_Sweep, in columns, going on at _Rate a second) passes its key: its top showing
// where the land (Ground.shader) is now gone, it parts a little from its neighbours, then tumbles and falls, faster and
// faster, shrinking and darkening into the abyss, gone after _Life seconds. A block standing (a neighbour gone beside
// it, or its turn yet to come) shows only its sides, under the land: the cliff the hole is cut into. Drawn in the web's
// own units (the ground's object space; scaled up to the map's, z flipped).
Shader "BlueLoop/Blocks"
{
    Properties
    {
        _Paper ("Paper", Color) = (0.957,0.953,0.937,1)
        _Galaxy ("Galaxy", Float) = 0
        _T ("The map's own clock (seconds since it was opened)", Float) = 0
        _G ("World per unit", Float) = 1
        _Fade ("Come in from the paper", Float) = 1
        _Crack ("Crack", Float) = -50
        _Sweep ("How far the collapse has swept (columns)", Float) = -50
        _Rate ("How fast it sweeps (columns a second)", Float) = 1.3
        _Life ("How long a block takes to fall out of sight (seconds)", Float) = 2.4
        _Gap ("How far a block shrinks from its neighbours as it parts", Float) = 0.07
        _Drop ("How fast it falls (half its acceleration, web units)", Float) = 2.0
    }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.5
            #include "GroundCore.cginc"
            float _Crack, _Sweep, _Rate, _Life, _Gap, _Drop;
            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float4 mid : TEXCOORD0;  // the block's middle (it turns about it), a random number of its own
                float4 face : TEXCOORD1; // its key, which face (0 its top, 1 a side, 2 its bottom), across a side, down it
                float2 more : TEXCOORD2; // breaking away (1) or standing (0); how far along the route its cell lies
            };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 world : TEXCOORD0;
                float3 norm : TEXCOORD1;
                float4 rest : TEXCOORD2; // where it lay (x, z), its height there, its distance from the eye
                float4 face : TEXCOORD3; // which face, across, down, how long since it broke away (seconds)
                float crack : TEXCOORD4;
            };

            v2f vert (appdata v)
            {
                v2f o;
                float3 p = v.vertex.xyz, n = v.normal;
                float3 mid = v.mid.xyz;
                float r = v.mid.w;
                float face = v.face.y;
                float2 xz = p.xz;
                float restY = p.y;
                float wd = well(p.xz);
                if (wd > 0.001)
                {
                    p.y -= wd;
                    if (face < 0.5)
                    {
                        float2 slope = (p.xz - HOLE) * (2.0 / 0.75) * wd;
                        n = normalize(n - float3(slope.x, 0.0, slope.y));
                    }
                }
                mid.y -= well(mid.xz);
                float dist = -UnityObjectToViewPos(p).z / _G;
                float age = v.more.x > 0.5 ? (_Sweep - v.face.x) / max(_Rate, 1e-3) : -1.0;
                // (Standing, the land drawn over it: only its sides. Fallen out of sight: nothing.)
                float hidden = ((age <= 0.0 && abs(face - 1.0) > 0.5) || age > _Life) ? 1.0 : 0.0;
                if (age > 0.0)
                {
                    // Parting from its neighbours (a hairline gap opening all round), then shrinking away as it goes.
                    float s = (1.0 - _Gap * smoothstep(0.0, 0.35, age)) * (1.0 - smoothstep(_Life * 0.45, _Life, age));
                    // Tumbling, mostly end over end, each its own way and pace.
                    float a = r * 6.2831853;
                    float spin = (0.35 + 1.1 * frac(r * 3.7)) * age * smoothstep(0.0, 0.6, age);
                    float3x3 R = rot(float3(cos(a), 0.25, sin(a)), spin);
                    p = mid + mul((p - mid) * s, R);
                    n = mul(n, R);
                    // Falling, faster and faster; drifting a little apart.
                    p.y -= 0.05 * age + _Drop * age * age;
                    p.xz += (mid.xz * 0.03 + (float2(frac(r * 31.0), frac(r * 17.0)) - 0.5) * 0.08) * age;
                }
                o.pos = hidden > 0.5 ? float4(2, 2, 2, 1) : UnityObjectToClipPos(float4(p, 1));
                o.world = p;
                o.norm = n;
                o.rest = float4(xz, restY, dist);
                o.face = float4(face, v.face.z, v.face.w, age);
                o.crack = v.more.y < _Crack ? 1.0 : 0.0;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float face = i.face.x, across = i.face.y, down = i.face.z, age = i.face.w;
                float2 xz = i.rest.xy;
                float rest = i.rest.z, dist = i.rest.w;
                float3 c;
                if (face < 0.5)
                {
                    // Its top: the land as it lay, its cell's borders inked (glowing a moment yet, if it was cracked).
                    c = LandColour(i.world, xz, i.norm, rest, dist);
                    float rim = GridLine(xz);
                    c = lerp(c, INK, rim * 0.55);
                    if (i.crack > 0.5) c = lerp(c, CrackGlow(xz.x), rim * 0.9 * (1.0 - smoothstep(0.0, 1.0, age)));
                }
                else
                {
                    // Its sides and bottom: rock, a little darker than the land, darker still further down, lit as
                    // they face; their edges inked.
                    float3 eye = mul(unity_WorldToObject, float4(_WorldSpaceCameraPos, 1)).xyz;
                    float3 n = normalize(i.norm);
                    if (dot(n, eye - i.world) < 0.0) n = -n;
                    float key = max(0.0, dot(n, normalize(float3(0.5, 0.8, 0.35))));
                    float fill = max(0.0, dot(n, normalize(float3(-0.6, 0.4, 0.5)))) * 0.25;
                    c = lerp(float3(0.50, 0.54, 0.63), float3(0.82, 0.84, 0.88), saturate(0.3 + 0.7 * key + fill));
                    c *= 1.0 - 0.22 * down;
                    // (Faint strata along it.)
                    c *= 1.0 - 0.06 * smoothstep(0.3, 0.7, vnoise(float2((xz.x + xz.y) * 14.0, down * 5.0)));
                    if (face > 1.5) c *= 0.8;
                    else
                    {
                        float2 e = float2(across, down);
                        float2 ew = max(fwidth(e), float2(1e-4, 1e-4));
                        float2 el = min(e, 1.0 - e) / ew;
                        float edge = 1.0 - min(min(el.x, el.y), 1.0);
                        c = lerp(c, INK * 0.8, edge * 0.6);
                    }
                }
                // Fading at the land's edges and far off into the paper, as the land does.
                float away = LandAway(xz, dist);
                c = lerp(c, _Paper.rgb, away);
                // Falling into the abyss: darkening toward its deep blue-black.
                float into = smoothstep(0.15, _Life * 0.9, age) * (1.0 - away);
                c = lerp(c, float3(0.04, 0.04, 0.1), into * 0.75);
                c = lerp(_Paper.rgb, c, _Fade);
                return fixed4(c, 1);
            }
            ENDCG
        }
    }
}
