// A model (nebula-objects.ts SHIP_FRAG): its look worked out from each part's material and colour. Plated metal:
// panels of slightly differing tone, seams cut in, wear and grime, a stripe in its holder's colour; glass and crystal,
// deep and bright at the edge; glowing parts white-hot at heart and flickering; living hide, mottled; dark gloss;
// molten; pearl; the Captain's ship's made hull as Meshy textured it, and its bells' burning throats. Lit by a key light
// with a sharp highlight and the paper's light caught at its edges.
Shader "BlueLoop/Ship"
{
    Properties { _Color ("Holder's colour", Color) = (0.36,0.56,0.86,1) _Alpha ("Alpha", Range(0,1)) = 1 _Burn ("Burn", Float) = 0 _Flip ("Z flip (a scene in the web's own axes)", Float) = 1 }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Color;
            float _Alpha, _Burn, _Flip;
            // (The Captain's ship's texture, as Meshy painted it: ModelMesh sets it for all.)
            sampler2D _CaptainTex;
            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; float4 color : COLOR; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; float3 n : TEXCOORD0; float3 w : TEXCOORD1; float3 l : TEXCOORD2; float3 ln : TEXCOORD3; float m : TEXCOORD4; float3 c : TEXCOORD5; };
            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.w = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.n = UnityObjectToWorldNormal(v.normal);
                o.l = v.vertex.xyz;
                o.ln = v.normal;
                o.m = v.uv.x;
                o.c = v.color.rgb;
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
            float seam(float c)
            {
                float d = abs(frac(c) - 0.5);
                float w = max(fwidth(c), 1e-4);
                return (1.0 - smoothstep(0.5 - w * 1.5, 0.5 - w * 0.3, d)) * (1.0 - smoothstep(0.12, 0.3, w));
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float3 n = normalize(i.n);
                float3 v = normalize(_WorldSpaceCameraPos - i.w);
                if (dot(n, v) < 0.0) n = -n;
                float3 l = normalize(float3(0.45, 0.85, 0.3 * _Flip));
                float3 h = normalize(l + v);
                float diff = max(dot(n, l), 0.0);
                float ndv = max(dot(n, v), 0.0);
                float fres = pow(1.0 - ndv, 4.0);
                float3 sky = float3(0.95, 0.95, 0.93);
                float m = i.m;
                float t = _Time.y;
                float3 c;
                if (m > 8.5)
                {
                    // The Captain's ship's bells' throats, closed and burning.
                    float flick = 0.9 + 0.1 * sin(t * 23.0 + i.l.x * 30.0) * sin(t * 13.0 + i.l.z * 20.0);
                    c = lerp(i.c, float3(1, 0.85, 0.5), 0.35 * ndv * ndv) * flick * (1.0 + _Burn * 0.15);
                    return fixed4(min(c, 1) * _Alpha, _Alpha);
                }
                if (m > 7.5)
                {
                    // The Captain's ship's made hull, as Meshy textured it (CaptainShip.cs): lit as worn metal, a highlight
                    // and light bouncing up from below; what it painted lit (its windows, the porthole, its lamps) glowing.
                    float4 p = tex2D(_CaptainTex, i.c.rg);
                    float3 base = p.rgb;
                    float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.3;
                    c = base * (0.5 + 0.75 * diff) + spec * (0.5 + 0.5 * base);
                    c += base * max(-n.y, 0.0) * 0.1;
                    c = lerp(c, sky, fres * 0.15);
                    float flick = 0.95 + 0.05 * sin(t * 7.0 + i.l.x * 40.0) * sin(t * 4.3 + i.l.z * 30.0);
                    c = lerp(c, base * 1.15 * flick * (1.0 + _Burn * 0.1), p.a);
                    return fixed4(min(c, 1) * _Alpha, _Alpha);
                }
                if (m > 1.5 && m < 2.5)
                {
                    float flick = 0.9 + 0.1 * sin(t * 23.0 + i.l.x * 30.0) * sin(t * 13.0 + i.l.z * 20.0);
                    c = lerp(i.c, float3(1, 1, 1), 0.12 + 0.5 * ndv * ndv * ndv) * flick * (1.0 + _Burn * 0.15);
                    return fixed4(min(c, 1) * _Alpha, _Alpha);
                }
                if (m > 6.5)
                {
                    c = i.c * (0.52 + 0.48 * diff) + float3(0.72, 0.84, 1.0) * fres * 0.55 + pow(max(dot(n, h), 0.0), 60.0) * 0.55;
                    return fixed4(min(c, 1) * _Alpha, _Alpha);
                }
                if (m > 5.5)
                {
                    float lava = n3(i.l * 18.0 + float3(t * 0.6, 0, 0)) * 0.6 + n3(i.l * 46.0 - float3(0, t, 0)) * 0.4;
                    c = lerp(i.c * 0.35, lerp(i.c, float3(1.0, 0.9, 0.55), 0.4), smoothstep(0.35, 0.75, lava));
                    c += pow(max(dot(n, h), 0.0), 30.0) * 0.25;
                    return fixed4(min(c, 1) * _Alpha, _Alpha);
                }
                if (m > 0.5 && m < 1.5)
                {
                    c = i.c * (0.35 + 0.45 * diff);
                    c = lerp(c, lerp(i.c, float3(1, 1, 1), 0.6), fres * 0.8);
                    c += pow(max(dot(n, h), 0.0), 70.0) * 0.8;
                    return fixed4(min(c, 1) * _Alpha, _Alpha);
                }
                float3 base = i.c;
                float rough;
                if (m > 2.5 && m < 3.5)
                {
                    float mott = n3(i.l * 38.0) * 0.6 + n3(i.l * 95.0) * 0.4;
                    base *= 0.82 + 0.3 * mott;
                    rough = 0.65;
                }
                else if (m > 3.5 && m < 4.5)
                {
                    base *= 0.9 + 0.2 * n3(i.l * 60.0);
                    rough = 0.2;
                }
                else
                {
                    if (m > 4.5) base = lerp(base, _Color.rgb, 0.65);
                    float3 an = abs(normalize(i.ln));
                    float3 q = i.l * float3(9.0, 16.0, 13.0);
                    float lines = an.x > an.y && an.x > an.z ? max(seam(q.y), seam(q.z)) : an.y > an.z ? max(seam(q.x), seam(q.z)) : max(seam(q.x), seam(q.y));
                    float panel = h3(floor(q + 0.5));
                    float grime = n3(i.l * 46.0) * 0.6 + n3(i.l * 110.0) * 0.4;
                    base *= (0.94 + 0.08 * panel) * (0.9 + 0.14 * grime) * (1.0 - lines * 0.16);
                    rough = 0.25 + 0.3 * grime;
                }
                float spec = pow(max(dot(n, h), 0.0), lerp(90.0, 14.0, rough)) * (1.0 - rough) * 1.1;
                c = base * (0.45 + 0.7 * diff) + spec;
                c += base * max(-n.y, 0.0) * 0.12;
                c = lerp(c, sky, fres * 0.3);
                return fixed4(min(c, 1) * _Alpha, _Alpha);
            }
            ENDCG
        }
    }
}
