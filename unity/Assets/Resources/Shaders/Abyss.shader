// The starry abyss beneath the land (nebula3d.ts's MASK and ABYSS): drawn on the ground's own mesh, only on its fallen
// shards, each where it lay (a little below; soft, as on the campaign menu, right where it lay); everything else is
// put out of sight. Each pixel's ray looks down from the eye into the sky beneath, in full colour: stars at several
// depths (so it has depth as the camera turns) over drifting clouds of colour on the deep blue-black of space, back
// into the paper toward the horizon. Drawn before the ground (which covers it wherever land still stands), writing no
// depth. In the web's own units (the object's space).
Shader "BlueLoop/Abyss"
{
    Properties
    {
        _Paper ("Paper", Color) = (0.957,0.953,0.937,1)
        _Gone ("Gone", Float) = -50
        _Soft ("Soft (the campaign menu's land)", Float) = 0
        _SoftBelow ("Soft below (the first map, where the menu broke it)", Float) = -1000000000
    }
    SubShader
    {
        Tags { "Queue"="Geometry-10" "RenderType"="Opaque" "IgnoreProjector"="True" }
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            fixed4 _Paper;
            float _Gone, _Soft, _SoftBelow;
            struct appdata { float4 vertex : POSITION; float4 shard : TEXCOORD2; float2 prog : TEXCOORD3; };
            struct v2f { float4 pos : SV_POSITION; float3 p : TEXCOORD0; };
            v2f vert (appdata v)
            {
                v2f o;
                float prog = v.prog.x;
                float fall = (_Gone - prog) / 1.6 + v.shard.w * 0.45;
                float3 p = v.vertex.xyz;
                p.y -= (_Soft > 0.5 || prog < _SoftBelow) ? 0.0 : 0.12;
                o.pos = fall > 0.0 ? UnityObjectToClipPos(float4(p, 1)) : float4(2, 2, 2, 1);
                o.p = p;
                return o;
            }
            float hash(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
            float vnoise(float2 p)
            {
                float2 i = floor(p), f = frac(p);
                f = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(hash(i), hash(i + float2(1, 0)), f.x), lerp(hash(i + float2(0, 1)), hash(i + float2(1, 1)), f.x), f.y);
            }
            float fbm(float2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.1 + 3.3); }
            float stars(float2 p, float density)
            {
                float2 i = floor(p), f = frac(p);
                float h = hash(i);
                if (h > density) return 0.0;
                float2 c = float2(hash(i + 3.1), hash(i + 7.7)) * 0.8 + 0.1;
                float d = length(f - c);
                return smoothstep(0.09, 0.0, d) * (0.6 + 0.4 * sin(_Time.y * (1.0 + h * 4.0) + h * 30.0));
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float3 eye = mul(unity_WorldToObject, float4(_WorldSpaceCameraPos, 1)).xyz;
                float3 dir = normalize(i.p - eye);
                float dn = max(0.08, -dir.y);
                float time = _Time.y;
                float3 col = float3(0.02, 0.02, 0.07);
                float3 base = eye + dir * ((eye.y + 5.0) / dn);
                col = lerp(col, float3(0.06, 0.03, 0.13), fbm(base.xz * 0.12));
                // Clouds of colour, deep down.
                for (int k = 0; k < 2; k++)
                {
                    float depth = 6.0 + k * 8.0;
                    float2 q = (eye + dir * ((eye.y + depth) / dn)).xz * (0.12 - k * 0.03) + k * 9.0 + time * 0.01;
                    float n = fbm(q);
                    // (Violet and sea blue: never pink.)
                    float3 neb = k == 0 ? float3(0.42, 0.24, 0.8) : float3(0.12, 0.55, 0.85);
                    col += neb * smoothstep(0.45, 0.85, n) * 0.6;
                }
                // Stars at three depths.
                for (int j = 0; j < 3; j++)
                {
                    float depth = 3.0 + j * 5.0;
                    float2 q = (eye + dir * ((eye.y + depth) / dn)).xz * (3.5 - j * 0.9);
                    float st = stars(q + j * 17.0, 0.14);
                    float3 sc = lerp(float3(1.0, 0.95, 0.85), float3(0.7, 0.85, 1.0), hash(floor(q)));
                    col += sc * st;
                }
                // Toward the horizon, back into the paper.
                col = lerp(_Paper.rgb, col, smoothstep(0.02, 0.2, -dir.y));
                return fixed4(col, 1);
            }
            ENDCG
        }
    }
}
