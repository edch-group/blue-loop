// The Dark Galaxy's dark (campaign.ts placeDarkness, .cmp-darkness): no land, no gas, no sky; the paper all but black,
// lit only a little round the flagship wherever it now stands on screen (_Centre, in pixels; _Radius, in pixels).
// Drawn first, behind everything, on a quad held over the whole view.
Shader "BlueLoop/Darkness"
{
    Properties
    {
        _Paper ("Paper", Color) = (0.957,0.953,0.937,1)
        _Centre ("Where the flagship is (pixels)", Vector) = (0,0,0,0)
        _Radius ("How far the light reaches (pixels)", Float) = 240
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Opaque" "IgnoreProjector"="True" }
        ZWrite Off
        ZTest Always
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Paper;
            float4 _Centre;
            float _Radius;
            struct v2f { float4 pos : SV_POSITION; float4 screen : TEXCOORD0; };
            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.screen = ComputeScreenPos(o.pos);
                return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float2 px = i.screen.xy / i.screen.w * _ScreenParams.xy;
                // (A circle of light, from a dim violet-grey over the paper at its middle to the dark at 72% of its reach.)
                float t = saturate(length(px - _Centre.xy) / (_Radius * 0.72));
                float3 mid = lerp(_Paper.rgb, float3(10.0, 8.0, 18.0) / 255.0, 0.72);
                float3 dark = float3(6.0, 5.0, 10.0) / 255.0;
                return fixed4(lerp(mid, dark, t), 1);
            }
            ENDCG
        }
    }
}
