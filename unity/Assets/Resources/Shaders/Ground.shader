// The campaign's ground (nebula3d.ts's GROUND_VERT/GROUND_FRAG): paper, softly lit, a fine ink mesh drawn into it,
// faint splashes of sea blue on the hills, bent by whatever lies under the galaxy; at its edges and far off it fades
// into the paper. Shards past the collapse (_Gone, in the route's columns; each shard knows its own) turn about their
// middles and fall; those next to go (up to _Crack) are marked faintly red, their borders glowing. Land drawn soft (the
// campaign menu's, _Soft; or the first map's west of _SoftBelow, where the menu broke it) drifts down slowly as it
// fades. The map's own land (_Cells) breaks instead along its ink mesh, a cell at a time: each cell past its key simply
// is gone here, falling away as a solid block (Blocks.shader), its cracks along the cells' borders. Two passes, as the web draws it: the land standing, then what falls, blended over what lies beneath (the
// abyss: Abyss.shader), see-through as it fades. A new land comes in out of the paper (_Fade, nebula3d.ts's uFade:
// over 1.2 s, eased; the campaign menu's also fades out and back as its flight comes round to its start).
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
        _Fade ("Come in from the paper", Float) = 1
        _Cells ("Breaking away in cells, as blocks (the map's land)", Float) = 0
    }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        Cull Off
        CGINCLUDE
            #include "GroundCore.cginc"
            float _Gone, _Crack, _Soft, _SoftBelow, _Cells;
            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float3 bary : TEXCOORD0;
                float3 edge : TEXCOORD1;
                float4 shard : TEXCOORD2;
                // x: how far along the route its shard lies; on the map's land (_Cells), y its cell's key (it breaks away
                // once _Gone passes it), z how far along the route its cell lies, w how far its cell's nearest shard does.
                float4 prog : TEXCOORD3;
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
                float cells = _Cells > 0.5 ? 1.0 : 0.0;
                // (On the map's land, a cell with any of it drawn soft is drawn soft altogether.)
                float soft = (_Soft > 0.5 || prog < _SoftBelow || (cells > 0.5 && v.prog.w < _SoftBelow)) ? 1.0 : 0.0;
                float fall = (_Gone - prog) / 1.6 + v.shard.w * 0.45;
                // The map's land breaks away a cell at a time, as a block (Blocks.shader): here it simply stands or is gone.
                float block = (cells > 0.5 && soft < 0.5) ? 1.0 : 0.0;
                if (block > 0.5) fall = _Gone > v.prog.y ? 9.0 : -1.0;
                else if (fall > 0.0)
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
                // (A cell gone as a block: nothing of it left here.)
                if (fall > 8.0) o.pos = float4(2, 2, 2, 1);
                o.world = p;
                o.norm = n;
                o.bary = v.bary;
                o.edge = v.edge;
                float crack = block > 0.5 ? (v.prog.z < _Crack ? 1.0 : 0.0) : ((prog < _Crack || fall > 0.0) ? 1.0 : 0.0);
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
                float3 c = LandColour(w, w.xz, i.norm, rest, dist);
                // Cracks along the shards' borders (on the map's land, its cells'), glowing with the colours beneath.
                if (cracked > 0.5 && i.soft < 0.5)
                {
                    float3 b = i.bary + (1.0 - i.edge) * 9.0;
                    float d = min(b.x, min(b.y, b.z));
                    float wd = fwidth(d) * 1.8;
                    float crack = 1.0 - smoothstep(0.0, wd, d);
                    if (fall <= 0.0) c *= float3(1.0, 0.9, 0.88);
                    c = lerp(c, CrackGlow(w.x), crack * 0.9);
                    if (fall > 0.0) c *= 1.0 - min(fall, 1.5) * 0.35;
                }
                // Fading at the land's edges and far off into the paper.
                if (fall <= 0.0) c = lerp(c, _Paper.rgb, LandAway(w.xz, dist));
                // (Coming in, out of the paper: mix(uPaper, c, uFade).)
                c = lerp(_Paper.rgb, c, _Fade);
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
