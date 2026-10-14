// The battle table (styles.css .board-plane): a pearl plate with rounded corners, a faint grid of dots, rings round
// its middle and thin lines out from it, lighter toward the far edge.
Shader "BlueLoop/Table"
{
    Properties
    {
        _Aspect ("Height / width", Float) = 0.55
        _Radius ("Corner radius (widths)", Float) = 0.035
        _Top ("Far colour", Color) = (0.975,0.975,0.968,1)
        _Bottom ("Near colour", Color) = (0.94,0.94,0.932,1)
        _Mark ("Pattern colour", Color) = (0.47,0.49,0.53,1)
        _Centre ("Rings' centre (uv)", Vector) = (0.5,0.5,0,0)
    }
    SubShader
    {
        Tags { "Queue"="Transparent-10" "RenderType"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float _Aspect, _Radius;
            fixed4 _Top, _Bottom, _Mark;
            float4 _Centre;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            float box(float2 p, float2 b, float r) { float2 q = abs(p) - b + r; return length(max(q, 0)) + min(max(q.x, q.y), 0) - r; }
            fixed4 frag (v2f i) : SV_Target
            {
                float2 p = (i.uv - 0.5) * float2(1, _Aspect);
                float d = box(p, float2(0.5, _Aspect * 0.5), _Radius);
                float aa = fwidth(d);
                float a = 1 - smoothstep(-aa, aa, d);
                fixed3 c = lerp(_Bottom.rgb, _Top.rgb, i.uv.y);
                // A soft rim, lighter just inside the edge.
                c += 0.03 * exp(d / 0.004);
                // Dots on a grid.
                float2 g = p / 0.0125;
                float2 f = abs(frac(g) - 0.5);
                float dot = 1 - smoothstep(0.06, 0.11, length(f));
                // Rings round the middle, and lines out from it.
                float2 q = (i.uv - _Centre.xy) * float2(1, _Aspect);
                float r = length(q);
                float rings = 1 - smoothstep(0.0, fwidth(r) * 1.2, abs(frac(r / 0.055) - 0.5) * 0.055);
                rings *= smoothstep(0.03, 0.08, r) * (1 - smoothstep(0.25, 0.5, r));
                float ang = atan2(q.y, q.x) / 6.2831853 * 48;
                float rays = 1 - smoothstep(0, fwidth(ang) * 1.2, abs(frac(ang) - 0.5));
                rays *= smoothstep(0.1, 0.16, r) * (1 - smoothstep(0.22, 0.4, r));
                c = lerp(c, _Mark.rgb, dot * 0.09 + rings * 0.08 + rays * 0.05);
                return fixed4(c, a);
            }
            ENDCG
        }
    }
}
