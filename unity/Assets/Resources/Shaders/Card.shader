// A card on the table or in the hand: its baked face with rounded corners (antialiased), greyed when dimmed.
Shader "BlueLoop/Card"
{
    Properties
    {
        _MainTex ("Face", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _Radius ("Corner radius (card widths)", Float) = 0.08
        _Aspect ("Height / width", Float) = 1.4
        _Grey ("Greyed", Range(0,1)) = 0
        _GreyTo ("The grey it goes to, of the face's brightness", Float) = 0.92
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
            sampler2D _MainTex;
            fixed4 _Color;
            float _Radius, _Aspect, _Grey, _GreyTo;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            float box(float2 p, float2 b, float r) { float2 q = abs(p) - b + r; return length(max(q, 0)) + min(max(q.x, q.y), 0) - r; }
            fixed4 frag (v2f i) : SV_Target
            {
                float2 p = (i.uv - 0.5) * float2(1, _Aspect);
                float d = box(p, float2(0.5, _Aspect * 0.5), _Radius);
                float aa = fwidth(d);
                float a = 1 - smoothstep(-aa, aa, d);
                fixed4 c = tex2D(_MainTex, i.uv) * _Color;
                float g = dot(c.rgb, float3(0.3, 0.59, 0.11));
                c.rgb = lerp(c.rgb, g * _GreyTo, _Grey);
                c.a *= a;
                return c;
            }
            ENDCG
        }
    }
}
