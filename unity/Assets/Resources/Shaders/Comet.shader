// Comets whistling by (nebula3d.ts's COMET_VERT/COMET_FRAG): each a head and a tail of points along its path,
// crossing the sky now and then and gone again until its next pass; after the first few, a meteor shower's (drawn only
// where one falls: _Meteors). A gold head, its tail cooling to ink, so it reads on the paper. Each point a little
// square stood up to face the screen. In the web's units (the object's space): the vertex its start, the normal its
// way, uv0 its corner, uv1 its period and offset, uv2 how far back along its tail it is and which comet it is.
Shader "BlueLoop/Comet"
{
    Properties { _G ("World per unit", Float) = 1 _Meteors ("A meteor shower", Float) = 0 _Fade ("Fade", Float) = 1 }
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
            float _G, _Meteors, _Fade;
            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; float2 corner : TEXCOORD0; float2 when : TEXCOORD1; float2 kc : TEXCOORD2; };
            struct v2f { float4 pos : SV_POSITION; float2 d : TEXCOORD0; float2 ak : TEXCOORD1; };
            v2f vert (appdata v)
            {
                v2f o;
                float period = v.when.x, t = fmod(_Time.y + v.when.y, period), k = v.kc.x;
                float cross_ = min(5.0, period * 0.45);
                float3 p = v.vertex.xyz + v.normal * (t * 3.2 - k * 0.035);
                float4 clip = UnityObjectToClipPos(float4(p, 1));
                float vz = max(1e-3, -UnityObjectToViewPos(p).z / _G);
                float px = (_ScreenParams.y / 1000.0) * lerp(6.0, 1.2, k / 28.0) * clamp(5.0 / vz, 0.6, 1.8);
                clip.xy += v.corner * px / _ScreenParams.xy * clip.w;
                // (Only the few comets, but in a meteor shower: the rest put out of sight.)
                o.pos = v.kc.y > 3.5 && _Meteors < 0.5 ? float4(2, 2, 2, 1) : clip;
                o.d = v.corner * 0.5;
                o.ak = float2(t < cross_ ? sin(t / cross_ * 3.14159) * (1.0 - k / 28.0) : 0.0, k);
                return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float a = smoothstep(0.5, 0.1, length(i.d)) * i.ak.x * _Fade;
                // A gold head, its tail cooling to ink.
                float3 c = lerp(float3(0.93, 0.66, 0.28), float3(0.45, 0.51, 0.64), saturate(i.ak.y / 10.0));
                return fixed4(c * a, a);
            }
            ENDCG
        }
    }
}
