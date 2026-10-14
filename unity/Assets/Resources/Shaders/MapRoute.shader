// The routes (nebula-objects.ts's ROUTE_VERT/ROUTE_FRAG): each a ribbon between its ends, turned to face the camera all
// along (so from any angle it reads as a round tube), as wide as the tube's glow in world units (so it shrinks with
// distance and hides behind the land and the suns). Neon: a soft halo, a bright tube, a white-hot thread down its
// middle, humming; gone, a faint dashed trace.
// Each corner: its end A (the vertex), its end B (uv0), which side and how far along, the route's length in the web's
// units and how it is lit (uv1: 0 gone, 1 lit, up to 2 just linked), its colour.
Shader "BlueLoop/MapRoute"
{
    Properties { _Width ("Half width (world)", Float) = 0.1 _Alpha ("Alpha", Float) = 1 }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend One OneMinusSrcAlpha
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float _Width, _Alpha;
            struct appdata { float4 vertex : POSITION; float4 color : COLOR; float4 b : TEXCOORD0; float4 side : TEXCOORD1; };
            struct v2f { float4 pos : SV_POSITION; float3 c : TEXCOORD0; float3 s : TEXCOORD1; };
            v2f vert (appdata v)
            {
                v2f o;
                float4 va = mul(UNITY_MATRIX_MV, float4(v.vertex.xyz, 1));
                float4 vb = mul(UNITY_MATRIX_MV, float4(v.b.xyz, 1));
                float4 p = lerp(va, vb, v.side.y);
                float2 d = vb.xy / -vb.z - va.xy / -va.z;
                d = length(d) > 1e-6 ? normalize(d) : float2(1, 0);
                p.xy += float2(-d.y, d.x) * v.side.x * _Width;
                o.pos = mul(UNITY_MATRIX_P, p);
                o.c = v.color.rgb;
                o.s = float3(v.side.x, v.side.y * v.side.z, v.side.w);
                return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float x = abs(i.s.x), along = i.s.y, lit0 = i.s.z;
                float time = _Time.y;
                if (lit0 < 0.5)
                {
                    // Gone: a faint dashed trace.
                    float dash = step(0.5, frac(along * 18.0));
                    float ga = (1.0 - smoothstep(0.15, 0.3, x)) * dash * 0.3 * _Alpha;
                    return fixed4(float3(0.5, 0.52, 0.56) * ga, ga);
                }
                float hum = 0.9 + 0.1 * sin(time * 2.3 + along * 3.0) * sin(time * 0.7);
                // (Lit up, just linked: the halo wider and brighter, the tube whiter.)
                float lit = lit0 - 1.0;
                float halo = exp(-x * x * (6.0 - 3.0 * lit)) * (0.42 + 0.5 * lit) * hum;
                float tube = exp(-x * x * 45.0);
                float core = exp(-x * x * 300.0);
                // The halo is a soft shade (so white light shows on the paper); the tube is the light itself.
                float3 c = lerp(i.c * 0.62, i.c, tube);
                c = lerp(c, float3(1, 1, 1), min(1.0, core + 0.6 * lit * tube));
                float a = max(halo, tube * 0.95) * _Alpha;
                return fixed4(c * a, a);
            }
            ENDCG
        }
    }
}
