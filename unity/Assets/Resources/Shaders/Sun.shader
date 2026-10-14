// A star (sun3d.ts, simplified): boiling plasma from layered noise, darker at the limb, a corona round it. Heat moves
// it from a cool amber toward white-hot.
Shader "BlueLoop/Sun"
{
    Properties
    {
        _Hot ("Heat (0 cold – 1 supernova)", Range(0,1)) = 0.3
        _Seed ("Seed", Float) = 0
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
            float _Hot, _Seed;
            struct v2f { float4 pos : SV_POSITION; float3 n : TEXCOORD0; float3 p : TEXCOORD1; float3 v : TEXCOORD2; };
            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.n = UnityObjectToWorldNormal(v.normal);
                o.p = v.vertex.xyz;
                o.v = normalize(WorldSpaceViewDir(v.vertex));
                return o;
            }
            float hash(float3 p) { p = frac(p * 0.3183099 + 0.1); p *= 17.0; return frac(p.x * p.y * p.z * (p.x + p.y + p.z)); }
            float noise(float3 x)
            {
                float3 i = floor(x); float3 f = frac(x); f = f * f * (3 - 2 * f);
                return lerp(lerp(lerp(hash(i), hash(i + float3(1,0,0)), f.x), lerp(hash(i + float3(0,1,0)), hash(i + float3(1,1,0)), f.x), f.y),
                            lerp(lerp(hash(i + float3(0,0,1)), hash(i + float3(1,0,1)), f.x), lerp(hash(i + float3(0,1,1)), hash(i + float3(1,1,1)), f.x), f.y), f.z);
            }
            float fbm(float3 p) { float s = 0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
            fixed4 frag (v2f i) : SV_Target
            {
                float t = _Time.y * 0.15;
                float3 p = i.p * 3.2 + _Seed;
                float n = fbm(p + float3(t, -t * 0.6, t * 0.4) + fbm(p * 1.7 - t) * 1.4);
                float cells = fbm(p * 6 + t * 2);
                float mu = saturate(dot(normalize(i.n), normalize(i.v)));
                float3 deep = lerp(float3(0.62, 0.16, 0.04), float3(0.85, 0.42, 0.20), _Hot);
                float3 mid = lerp(float3(0.96, 0.48, 0.12), float3(1.0, 0.78, 0.55), _Hot);
                float3 hot = lerp(float3(1.0, 0.86, 0.45), float3(1.0, 0.97, 0.92), _Hot);
                float3 c = lerp(deep, mid, smoothstep(0.25, 0.6, n));
                c = lerp(c, hot, smoothstep(0.55, 0.85, n + cells * 0.25));
                // Limb darkening, and a bright rim where the corona begins.
                c *= 0.55 + 0.45 * pow(mu, 0.45);
                c += pow(1 - mu, 3) * mid * 0.6;
                return fixed4(c, 1);
            }
            ENDCG
        }
    }
}
