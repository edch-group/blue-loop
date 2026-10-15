// The campaign menu's sunrise on the horizon behind the Stellari (styles.css .cs-sunrise): a white glow (kind 0,
// ::before: white to 14% of its radius, 0.85 by 28%, 0.45 by 52%, gone at its edge) and a fine bright line along the
// horizon through it (kind 1, ::after: white, 0.6 by 45%, gone at its edge), each a radial gradient to the closest side
// of its box. Drawn on a quad of corners -1 to 1 stood up to face the eye about the object's middle, as wide and tall
// as the object is scaled across and up (world units). Drawn first, before the land (Background, no depth): the land
// covers it, so it shows only in the sky above the horizon, as the web's lies behind its land's canvas.
Shader "BlueLoop/Sunrise"
{
    Properties
    {
        _Kind ("Kind", Float) = 0
        _Alpha ("Alpha", Float) = 1
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        ZTest Always
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            float _Kind, _Alpha;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v)
            {
                v2f o;
                float3 mid = mul(unity_ObjectToWorld, float4(0, 0, 0, 1)).xyz;
                float sx = length(float3(unity_ObjectToWorld[0][0], unity_ObjectToWorld[1][0], unity_ObjectToWorld[2][0]));
                float sy = length(float3(unity_ObjectToWorld[0][1], unity_ObjectToWorld[1][1], unity_ObjectToWorld[2][1]));
                float4 view = mul(UNITY_MATRIX_V, float4(mid, 1));
                view.xy += v.vertex.xy * float2(sx, sy);
                o.pos = mul(UNITY_MATRIX_P, view);
                o.uv = v.vertex.xy;
                return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float r = length(i.uv);
                float a;
                if (_Kind < 0.5)
                {
                    if (r < 0.14) a = 1.0;
                    else if (r < 0.28) a = lerp(1.0, 0.85, (r - 0.14) / 0.14);
                    else if (r < 0.52) a = lerp(0.85, 0.45, (r - 0.28) / 0.24);
                    else a = lerp(0.45, 0.0, saturate((r - 0.52) / 0.48));
                }
                else
                {
                    if (r < 0.45) a = lerp(1.0, 0.6, r / 0.45);
                    else a = lerp(0.6, 0.0, saturate((r - 0.45) / 0.55));
                }
                return fixed4(1, 1, 1, a * _Alpha);
            }
            ENDCG
        }
    }
}
