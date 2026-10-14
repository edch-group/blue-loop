// A route between two systems (nebula-objects.ts's route): a soft halo, a bright tube of light, a white core, humming.
// Drawn on a quad whose v runs across it (0 to 1).
Shader "BlueLoop/Route"
{
    Properties { _Color ("Tint", Color) = (1,1,1,1) _Lit ("Lit", Range(0,1)) = 0 _Alpha ("Alpha", Range(0,1)) = 1 }
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
            fixed4 _Color;
            float _Lit, _Alpha;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            fixed4 frag (v2f i) : SV_Target
            {
                float x = (i.uv.y - 0.5) * 2;
                float hum = 0.85 + 0.15 * sin(_Time.y * 2.0 + i.uv.x * 6.0);
                float halo = exp(-x * x * (6.0 - 3.0 * _Lit)) * (0.42 + 0.5 * _Lit) * hum;
                float tube = exp(-x * x * 45.0);
                float core = exp(-x * x * 300.0);
                float3 tint = _Color.rgb;
                float3 c = lerp(tint * 0.62, tint, tube);
                c = lerp(c, float3(1, 1, 1), min(1.0, core + 0.6 * _Lit * tube));
                float a = max(halo, tube * 0.95) * _Alpha;
                return fixed4(c * a, a);
            }
            ENDCG
        }
    }
}
