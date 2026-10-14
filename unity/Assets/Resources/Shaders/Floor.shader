// The campaign's floor (nebula3d.ts's ground): the board's paper reaching to the horizon, rolling gently, with its
// schematic grid drawn on it and fading into the haze far off.
Shader "BlueLoop/Floor"
{
    Properties
    {
        _Paper ("Paper", Color) = (0.965,0.965,0.955,1)
        _Line ("Grid", Color) = (0.62,0.65,0.74,0.55)
        _Haze ("Haze", Color) = (0.975,0.975,0.97,1)
        _Cell ("Grid cell", Float) = 0.55
        _Swell ("Swell height", Float) = 0.35
        _HazeFrom ("Haze from", Float) = 9
        _HazeTo ("Haze to", Float) = 30
    }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Paper, _Line, _Haze;
            float _Cell, _Swell, _HazeFrom, _HazeTo;
            struct v2f { float4 pos : SV_POSITION; float3 w : TEXCOORD0; float3 n : TEXCOORD1; };
            float swell(float2 p) { return (sin(p.x * 0.31 + 1.3) * cos(p.y * 0.27) + 0.6 * sin(p.x * 0.13 - p.y * 0.21 + 2.0) + 0.35 * sin(p.y * 0.55 + p.x * 0.07)) * _Swell; }
            v2f vert (appdata_base v)
            {
                v2f o;
                float3 w = mul(unity_ObjectToWorld, v.vertex).xyz;
                w.y += swell(w.xz);
                float e = 0.05;
                float3 tx = float3(e, swell(w.xz + float2(e, 0)) - swell(w.xz), 0);
                float3 tz = float3(0, swell(w.xz + float2(0, e)) - swell(w.xz), e);
                o.n = normalize(cross(tz, tx));
                o.w = w;
                o.pos = mul(UNITY_MATRIX_VP, float4(w, 1));
                return o;
            }
            // (A line where the cell's edge is: d, the distance from the cell's middle, reaching a half.)
            float grid(float c) { float d = abs(frac(c) - 0.5); float aa = max(fwidth(c), 1e-4); return smoothstep(0.5 - aa * 1.5, 0.5, d); }
            fixed4 frag (v2f i) : SV_Target
            {
                float2 q = i.w.xz / _Cell;
                float g = max(grid(q.x), grid(q.y));
                // (Lines fade where the cells are too small to draw cleanly.)
                g *= 1 - smoothstep(0.25, 0.5, max(fwidth(q.x), fwidth(q.y)));
                float shade = 0.94 + 0.06 * saturate(dot(i.n, normalize(float3(-0.4, 1, -0.3))));
                float3 c = lerp(_Paper.rgb * shade, _Line.rgb, g * _Line.a);
                float d = distance(i.w.xz, _WorldSpaceCameraPos.xz);
                c = lerp(c, _Haze.rgb, smoothstep(_HazeFrom, _HazeTo, d));
                return fixed4(c, 1);
            }
            ENDCG
        }
    }
}
