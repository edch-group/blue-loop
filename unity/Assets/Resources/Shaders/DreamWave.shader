// A Dream of the Lost's wavering (campaign.ts's #dream-wave filter on the map, styles.css .cmp-dreaming): the screen
// as drawn so far (the map beneath the HUD) taken, and drawn again displaced by turbulence (feTurbulence fractalNoise,
// two octaves, at _Freq per CSS pixel; feDisplacementMap by _Scale CSS pixels, its channels both the noise's alpha, so
// each point moves along the diagonal by _Scale times the noise less a half), then blurred (.dream-fade's
// backdrop-filter: blur(_Blur CSS pixels)). A full-screen image on the HUD's canvas, its first: everything the HUD
// draws comes over it unmoved. _Px: screen pixels to a CSS pixel.
Shader "BlueLoop/DreamWave"
{
    Properties
    {
        [PerRendererData] _MainTex ("Sprite", 2D) = "white" {}
        _Scale ("Displacement (CSS px)", Float) = 0
        _Blur ("Blur (CSS px)", Float) = 0
        _Freq ("Base frequency across, down (per CSS px)", Vector) = (0.006, 0.02, 0, 0)
        _Px ("Screen pixels a CSS pixel", Float) = 1
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "IgnoreProjector"="True" "RenderType"="Transparent" "PreviewType"="Plane" }
        Cull Off
        Lighting Off
        ZWrite Off
        ZTest [unity_GUIZTestMode]
        GrabPass { "_DreamGrab" }
        Pass
        {
            Blend One Zero
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            sampler2D _DreamGrab;
            float _Scale, _Blur, _Px;
            float4 _Freq;
            struct appdata_t { float4 vertex : POSITION; float2 texcoord : TEXCOORD0; };
            struct v2f { float4 vertex : SV_POSITION; float4 grab : TEXCOORD0; };

            v2f vert (appdata_t v)
            {
                v2f o;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.grab = ComputeGrabScreenPos(o.vertex);
                return o;
            }

            // Perlin's gradient noise, as feTurbulence makes it: unit gradients at the lattice's corners, its s-curve.
            float hash(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
            float2 grad(float2 i) { float a = hash(i) * 6.2831853; return float2(cos(a), sin(a)); }
            float perlin(float2 p)
            {
                float2 i = floor(p), f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                float a = dot(grad(i), f);
                float b = dot(grad(i + float2(1, 0)), f - float2(1, 0));
                float c = dot(grad(i + float2(0, 1)), f - float2(0, 1));
                float d = dot(grad(i + float2(1, 1)), f - float2(1, 1));
                return lerp(lerp(a, b, u.x), lerp(c, d, u.x), u.y);
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float2 uv = i.grab.xy / i.grab.w;
                // (Where this is on the page, in CSS pixels from its top left.)
                float2 css = float2(uv.x, 1.0 - uv.y) * _ScreenParams.xy / _Px;
                // fractalNoise, two octaves: their sum, mapped from -1..1 to 0..1.
                float n = perlin(css * _Freq.xy) + 0.5 * perlin(css * _Freq.xy * 2.0);
                float alpha = saturate((n + 1.0) * 0.5);
                // P'(x, y) = P(x + scale (A - 0.5), y + scale (A - 0.5)), y down the page.
                float d = _Scale * (alpha - 0.5) * _Px;
                float2 at = uv + float2(d, -d) / _ScreenParams.xy;
                // The blur: a Gaussian of the blur's radius (its standard deviation), sampled on a spiral to twice it.
                float sigma = _Blur * _Px;
                if (sigma < 0.25) return fixed4(tex2D(_DreamGrab, saturate(at)).rgb, 1);
                float3 sum = tex2D(_DreamGrab, saturate(at)).rgb;
                float total = 1.0;
                for (int k = 1; k <= 16; k++)
                {
                    float r = sqrt(k / 16.0) * 2.0 * sigma;
                    float a = k * 2.3999632;
                    float w = exp(-r * r / (2.0 * sigma * sigma));
                    float2 o = float2(cos(a), sin(a)) * r / _ScreenParams.xy;
                    sum += tex2D(_DreamGrab, saturate(at + o)).rgb * w;
                    total += w;
                }
                return fixed4(sum / total, 1);
            }
            ENDCG
        }
    }
}
