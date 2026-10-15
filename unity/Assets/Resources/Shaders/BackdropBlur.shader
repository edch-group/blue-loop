// What is behind a part of the page, blurred (CSS backdrop-filter: blur(_Blur)): the screen as drawn so far taken
// (a GrabPass, as DreamWave's), and each pixel the Gaussian of it whose standard deviation is the blur's radius (CSS's
// blur(r): r is the deviation), the edges' pixels standing in for what lies past the screen, as a browser's backdrop
// filter has it. Averaged in the page's own (sRGB) values, as a browser blurs. Drawn where the image is, through its
// sprite's alpha (a rounded box's corners) and its colour's (a fading overlay, the blur fading with it: CSS's opacity
// over the backdrop filter). _Px: screen pixels to a CSS pixel. One pass: the Gaussian sampled on rings at 0.8, 1.6
// and 2.4 deviations (6, 12 and 18 points, each the same share of the disc), with the centre (WebGL2-safe: fixed
// loops, no gradients taken in them).
Shader "BlueLoop/BackdropBlur"
{
    Properties
    {
        [PerRendererData] _MainTex ("Sprite", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _Blur ("Blur (CSS px)", Float) = 6
        _Px ("Screen pixels a CSS pixel", Float) = 1
        _StencilComp ("Stencil Comparison", Float) = 8
        _Stencil ("Stencil ID", Float) = 0
        _StencilOp ("Stencil Operation", Float) = 0
        _StencilWriteMask ("Stencil Write Mask", Float) = 255
        _StencilReadMask ("Stencil Read Mask", Float) = 255
        _ColorMask ("Color Mask", Float) = 15
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "IgnoreProjector"="True" "RenderType"="Transparent" "PreviewType"="Plane" }
        Stencil
        {
            Ref [_Stencil]
            Comp [_StencilComp]
            Pass [_StencilOp]
            ReadMask [_StencilReadMask]
            WriteMask [_StencilWriteMask]
        }
        Cull Off
        Lighting Off
        ZWrite Off
        ZTest [unity_GUIZTestMode]
        // (Unnamed: taken again for each image, so one overlay over another blurs what the first left.)
        GrabPass { }
        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
            ColorMask [_ColorMask]
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            #include "UnityUI.cginc"
            #pragma multi_compile_local _ UNITY_UI_CLIP_RECT
            struct appdata_t { float4 vertex : POSITION; float4 color : COLOR; float2 texcoord : TEXCOORD0; };
            struct v2f { float4 vertex : SV_POSITION; fixed4 color : COLOR; float2 texcoord : TEXCOORD0; float4 grab : TEXCOORD1; float4 worldPosition : TEXCOORD2; };
            sampler2D _MainTex;
            sampler2D _GrabTexture;
            float4 _GrabTexture_TexelSize;
            fixed4 _Color;
            fixed4 _TextureSampleAdd;
            float4 _ClipRect;
            float _Blur, _Px;

            v2f vert (appdata_t v)
            {
                v2f o;
                o.worldPosition = v.vertex;
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.grab = ComputeGrabScreenPos(o.vertex);
                o.texcoord = v.texcoord;
                o.color = v.color * _Color;
                return o;
            }

            // (A pixel of the screen taken, in the page's own values; past the edge, the edge's. No mip to choose.)
            float3 Taken(float2 uv)
            {
                float3 c = tex2Dlod(_GrabTexture, float4(saturate(uv), 0, 0)).rgb;
                #ifndef UNITY_COLORSPACE_GAMMA
                c = LinearToGammaSpace(c);
                #endif
                return c;
            }

            // (A ring of `n` points `r` deviations out, a turn's share apart from `turn`: their sum.)
            float3 Ring(float2 uv, float r, int n, float turn, float sigma)
            {
                float gap = 6.2831853 / n;
                float3 s = float3(0, 0, 0);
                for (int k = 0; k < n; k++)
                {
                    float ang = turn + k * gap;
                    s += Taken(uv + float2(cos(ang), sin(ang)) * (r * sigma) * _GrabTexture_TexelSize.xy);
                }
                return s;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float a = ((tex2D(_MainTex, i.texcoord) + _TextureSampleAdd) * i.color).a;
                #ifdef UNITY_UI_CLIP_RECT
                a *= UnityGet2DClipping(i.worldPosition.xy, _ClipRect);
                #endif
                float2 uv = i.grab.xy / i.grab.w;
                float sigma = _Blur * _Px;
                float3 sum = Taken(uv);
                if (sigma >= 0.3)
                {
                    // (The Gaussian's weight at each ring; the centre's point stands for a disc of 0.4 deviations, three
                    // quarters of a ring point's share. The middle ring turned half a step, so no points line up.)
                    float w1 = exp(-0.5 * 0.64), w2 = exp(-0.5 * 2.56), w3 = exp(-0.5 * 5.76);
                    sum = 0.75 * sum
                        + w1 * Ring(uv, 0.8, 6, 0.0, sigma)
                        + w2 * Ring(uv, 1.6, 12, 3.14159265 / 12.0, sigma)
                        + w3 * Ring(uv, 2.4, 18, 0.0, sigma);
                    sum /= 0.75 + 6.0 * w1 + 12.0 * w2 + 18.0 * w3;
                }
                #ifndef UNITY_COLORSPACE_GAMMA
                sum = GammaToLinearSpace(sum);
                #endif
                return fixed4(sum, a);
            }
            ENDCG
        }
    }
}
