// A disc facing the camera (nebula-objects.ts's SPRITE_FRAG): a soft glow (kind 0), a fine ring (1), a dashed ring
// turning (3), or rings of ink going out from it one after another (4: it pulses). Drawn on a quad of corners -1 to 1,
// stood up to face the eye about the object's middle, as wide either way as the object is scaled (world units).
Shader "BlueLoop/MapSprite"
{
    Properties
    {
        _Color ("Colour", Color) = (1,1,1,1)
        _Kind ("Kind", Float) = 0
        _Alpha ("Alpha", Float) = 1
        _Seed ("Seed", Float) = 0
        [Enum(UnityEngine.Rendering.CompareFunction)] _ZTest ("Depth test", Float) = 4
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend One OneMinusSrcAlpha
        ZWrite Off
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
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v)
            {
                v2f o;
                float3 mid = mul(unity_ObjectToWorld, float4(0, 0, 0, 1)).xyz;
                float size = length(float3(unity_ObjectToWorld[0][0], unity_ObjectToWorld[1][0], unity_ObjectToWorld[2][0]));
                float4 view = mul(UNITY_MATRIX_V, float4(mid, 1));
                view.xy += v.vertex.xy * size;
                o.pos = mul(UNITY_MATRIX_P, view);
                o.uv = v.vertex.xy;
                return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float r = length(i.uv);
                float w = max(fwidth(r), 1e-4);
                float a;
                if (_Kind < 0.5) a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r)) * 0.55;
                else if (_Kind < 1.5) a = (1.0 - smoothstep(0.0, w * 1.6, abs(r - 0.82))) * 0.95;
                else if (_Kind > 3.5)
                {
                    a = 0.0;
                    for (int k = 0; k < 2; k++)
                    {
                        float t = frac(_Time.y * 0.35 + _Seed * 0.13 + k * 0.5);
                        float rr = lerp(0.32, 0.98, t);
                        a += (1.0 - smoothstep(0.0, w, abs(r - rr))) * (1.0 - t) * 0.8;
                    }
                }
                else
                {
                    float ang = atan2(i.uv.y, i.uv.x);
                    float dash = step(0.45, frac(ang * 6.0 / 3.14159 + _Time.y * 0.15 + _Seed));
                    a = (1.0 - smoothstep(0.0, w * 1.4, abs(r - 0.9))) * dash * 0.7;
                }
                a *= _Alpha;
                return fixed4(_Color.rgb * a, a);
            }
            ENDCG
        }
    }
}
