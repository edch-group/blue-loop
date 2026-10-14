// The map's solid things (nebula-objects.ts's SOLID_FRAG), by kind: 0 a sun as the board draws it (paper, a globe's
// lines in fine ink turning with it, the contours of its churning surface, an ink line round it); 1 a black sphere;
// 2 an accretion disc (its normal's x how far out, its y the way round); 3 a beam (its normal's x how far along);
// 4 a plain paper sphere (an ember); 5 a Stellari petal, a wireframe of fine silver over the faintest pale fill; 6 the
// white Stellari's petal, fully open, no line round it.
// The web's own data rides in each vertex's normal (as its aNorm does); the light is the web's, its z flipped into
// this world's. Blended (premultiplied) or not, and depth-tested or not, as each kind is drawn: set on the material.
Shader "BlueLoop/MapSolid"
{
    Properties
    {
        _Color ("Colour", Color) = (0.975,0.97,0.955,1)
        _Kind ("Kind", Float) = 0
        _Alpha ("Alpha", Float) = 1
        _Seed ("Seed", Float) = 0
        [Enum(UnityEngine.Rendering.BlendMode)] _Src ("Blend from", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _Dst ("Blend to", Float) = 0
        [Enum(Off, 0, On, 1)] _ZWrite ("Depth write", Float) = 1
        [Enum(UnityEngine.Rendering.CompareFunction)] _ZTest ("Depth test", Float) = 4
    }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" "IgnoreProjector"="True" }
        Blend [_Src] [_Dst]
        ZWrite [_ZWrite]
        ZTest [_ZTest]
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            fixed4 _Color;
            float _Kind, _Alpha, _Seed;
            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; };
            struct v2f { float4 pos : SV_POSITION; float3 n : TEXCOORD0; float3 w : TEXCOORD1; float3 l : TEXCOORD2; };
            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.w = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.n = UnityObjectToWorldNormal(v.normal);
                o.l = v.normal;
                return o;
            }
            float h3(float3 p) { return frac(sin(dot(p, float3(127.1, 311.7, 74.7))) * 43758.5453); }
            float n3(float3 p)
            {
                float3 i = floor(p), f = frac(p);
                f = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(lerp(h3(i), h3(i + float3(1, 0, 0)), f.x), lerp(h3(i + float3(0, 1, 0)), h3(i + float3(1, 1, 0)), f.x), f.y),
                            lerp(lerp(h3(i + float3(0, 0, 1)), h3(i + float3(1, 0, 1)), f.x), lerp(h3(i + float3(0, 1, 1)), h3(i + float3(1, 1, 1)), f.x), f.y), f.z);
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float3 v = normalize(_WorldSpaceCameraPos - i.w);
                float3 nn = normalize(i.n);
                float ndv = abs(dot(nn, v));
                float3 ink = float3(0.40, 0.46, 0.60);
                float3 key = normalize(float3(0.5, 0.8, -0.35));
                float time = _Time.y;
                float3 vL = i.l;
                if (_Kind < 0.5)
                {
                    // Drawn as the board draws: paper, softly shaded, in fine ink. A globe's lines (turning with it), and
                    // the contours of its churning surface, welling and shifting, so it reads alive without leaving the paper.
                    float lit = max(0.0, dot(nn, key));
                    float3 c = lerp(_Color.rgb * 0.86, float3(1.0, 0.998, 0.99), saturate(0.3 * ndv + 0.7 * lit));
                    float lat = asin(clamp(vL.y, -1.0, 1.0)) / 3.14159 * 4.0;
                    float lon = (atan2(vL.z, vL.x) / 6.28318 + time * 0.02) * 8.0;
                    float gx = 1.0 - smoothstep(0.0, 0.8, (0.5 - abs(frac(lat) - 0.5)) / max(fwidth(lat), 1e-4));
                    float gy = 1.0 - smoothstep(0.0, 0.8, (0.5 - abs(frac(lon) - 0.5)) / max(fwidth(lon), 1e-4));
                    c = lerp(c, float3(0.42, 0.48, 0.62), max(gx, gy) * 0.14 * ndv);
                    float3 q = vL * 2.2 + _Seed;
                    float churn = n3(q + float3(time * 0.25, 0.0, time * 0.15)) * 0.65 + n3(q * 2.3 - float3(0.0, time * 0.35, 0.0)) * 0.35;
                    float band = churn * 3.0;
                    float iso = 1.0 - smoothstep(0.0, 0.8, (0.5 - abs(frac(band) - 0.5)) / max(fwidth(band), 1e-4));
                    c = lerp(c, float3(0.42, 0.48, 0.62), iso * 0.2 * smoothstep(0.1, 0.5, ndv));
                    c = lerp(c, float3(0.42, 0.48, 0.62), (1.0 - smoothstep(0.06, 0.16, ndv)) * 0.6);
                    return fixed4(c * _Alpha, _Alpha);
                }
                if (_Kind < 1.5)
                {
                    float3 c = lerp(float3(0.03, 0.03, 0.05), float3(0.32, 0.33, 0.38), pow(1.0 - ndv, 3.0));
                    return fixed4(c * _Alpha, _Alpha);
                }
                if (_Kind < 2.5)
                {
                    float o_ = vL.x;
                    float swirl = 0.5 + 0.5 * sin(vL.y * 9.0 - time * 1.6 + o_ * 14.0);
                    float fine = 0.5 + 0.5 * sin(vL.y * 31.0 - time * 2.4 + o_ * 40.0);
                    float3 c = lerp(float3(1.0, 0.97, 0.88), lerp(float3(0.93, 0.74, 0.42), float3(0.45, 0.5, 0.63), smoothstep(0.4, 1.0, o_)), smoothstep(0.0, 0.6, o_));
                    float a = (1.0 - smoothstep(0.5, 1.0, o_)) * (0.5 + 0.35 * swirl + 0.15 * fine) * _Alpha;
                    return fixed4(c * a, a);
                }
                if (_Kind < 3.5)
                {
                    float a = pow(saturate(1.0 - vL.x), 1.5) * 0.55 * _Alpha;
                    return fixed4(_Color.rgb * a, a);
                }
                if (_Kind > 5.5)
                {
                    // The white Stellari, fully open: white petals, no line round them, each softening toward its edge so
                    // it melts into the light (its form from a faint pearly shade down each petal's middle).
                    float3 c = lerp(float3(0.84, 0.85, 0.89), float3(1, 1, 1), smoothstep(0.0, 0.85, vL.x));
                    float a = (0.82 - 0.6 * smoothstep(0.5, 1.0, vL.x)) * _Alpha;
                    return fixed4(c * a, a);
                }
                if (_Kind > 4.5)
                {
                    // A Stellari petal, as the battle board draws its star: a fine silver line round each petal over
                    // the faintest pale fill.
                    float r = vL.x;
                    float w = max(fwidth(r), 1e-4);
                    float line_ = 1.0 - smoothstep(w * 0.6, w * 1.8, 1.0 - r);
                    float3 c = lerp(float3(0.86, 0.88, 0.93), float3(0.66, 0.7, 0.79), line_);
                    float a = (0.14 + 0.65 * line_) * _Alpha;
                    return fixed4(c * a, a);
                }
                {
                    float lit = max(0.0, dot(nn, key));
                    float3 c = lerp(_Color.rgb * 0.75, _Color.rgb, lit);
                    c = lerp(c, ink, (1.0 - smoothstep(0.12, 0.32, ndv)) * 0.55);
                    return fixed4(c * _Alpha, _Alpha);
                }
            }
            ENDCG
        }
    }
}
