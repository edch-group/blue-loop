// The stars over the land (nebula3d.ts's STAR_VERT/STAR_FRAG): fine ink points, a few in colour with a faint cross of
// light through them, twinkling, fading far off. Each a little square stood up to face the screen, as many pixels
// across as the web's point (its CSS pixels taken against a screen a thousand high). In the web's units (the object's
// space): uv0 its corner, uv1 its size, hue (0 ink; 1 gold, 2 violet, 3 sea blue) and phase.
Shader "BlueLoop/Twinkle"
{
    Properties { _G ("World per unit", Float) = 1 _Fade ("Fade", Float) = 1 }
    SubShader
    {
        Tags { "Queue"="Transparent-10" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend One OneMinusSrcAlpha
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float _G, _Fade;
            struct appdata { float4 vertex : POSITION; float2 corner : TEXCOORD0; float3 star : TEXCOORD1; };
            struct v2f { float4 pos : SV_POSITION; float2 d : TEXCOORD0; float2 ha : TEXCOORD1; };
            v2f vert (appdata v)
            {
                v2f o;
                float size = v.star.x, hue = v.star.y, phase = v.star.z;
                float4 clip = UnityObjectToClipPos(v.vertex);
                float vz = max(1e-3, -UnityObjectToViewPos(v.vertex.xyz).z / _G);
                float tw = 0.65 + 0.35 * sin(_Time.y * (0.8 + phase * 2.0) + phase * 40.0);
                float px = size * (_ScreenParams.y / 1000.0) * clamp(5.0 / vz, 0.6, 1.8) * (hue > 0.5 ? 1.4 : 1.0);
                clip.xy += v.corner * px / _ScreenParams.xy * clip.w;
                o.pos = clip;
                o.d = v.corner * 0.5;
                o.ha = float2(hue, tw * (1.0 - smoothstep(9.0, 20.0, vz)));
                return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float hue = i.ha.x;
                float2 d = i.d;
                float r = length(d);
                // A soft point, with a faint cross of light through the coloured ones.
                float a = smoothstep(0.5, 0.15, r);
                if (hue > 0.5) a = max(a, (smoothstep(0.06, 0.0, abs(d.x)) + smoothstep(0.06, 0.0, abs(d.y))) * smoothstep(0.5, 0.0, r) * 0.6);
                // (Gold, violet or sea blue among the ink: never pink.)
                float3 c = hue < 0.5 ? float3(0.42, 0.48, 0.62) : hue < 1.5 ? float3(0.92, 0.68, 0.30) : hue < 2.5 ? float3(0.6, 0.5, 0.88) : float3(0.35, 0.65, 0.90);
                a *= i.ha.y * _Fade * (hue < 0.5 ? 0.55 : 0.9);
                return fixed4(c * a, a);
            }
            ENDCG
        }
    }
}
