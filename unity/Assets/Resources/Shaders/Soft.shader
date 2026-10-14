// A soft rounded glow or shadow: a rounded box (a card, a slot) with its edge blurred out, in one colour.
Shader "BlueLoop/Soft"
{
    Properties
    {
        _Color ("Colour", Color) = (0,0,0,0.25)
        _Aspect ("Height / width of the box", Float) = 1.4
        _Radius ("Corner radius", Float) = 0.08
        _Size ("Box half-size inside the quad (0–0.5)", Float) = 0.4
        _Soft ("Softness", Float) = 0.08
        _Ring ("Ring only (0: filled)", Float) = 0
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Color;
            float _Aspect, _Radius, _Size, _Soft, _Ring;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            float box(float2 p, float2 b, float r) { float2 q = abs(p) - b + r; return length(max(q, 0)) + min(max(q.x, q.y), 0) - r; }
            fixed4 frag (v2f i) : SV_Target
            {
                float2 p = (i.uv - 0.5) * float2(1, _Aspect);
                float d = box(p, float2(_Size, _Size * _Aspect), _Radius);
                float a = _Ring > 0 ? exp(-abs(d) / _Soft) : 1 - smoothstep(-_Soft, _Soft, d);
                return fixed4(_Color.rgb, _Color.a * saturate(a));
            }
            ENDCG
        }
    }
}
