// A small lit sphere (a planet): its colour lit from the upper left, a soft rim of light at its edge.
Shader "BlueLoop/Planet"
{
    Properties { _Color ("Colour", Color) = (0.5,0.5,0.5,1) }
    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Color;
            struct v2f { float4 pos : SV_POSITION; float3 n : TEXCOORD0; float3 v : TEXCOORD1; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.n = UnityObjectToWorldNormal(v.normal); o.v = normalize(WorldSpaceViewDir(v.vertex)); return o; }
            fixed4 frag (v2f i) : SV_Target
            {
                float3 n = normalize(i.n);
                float lit = saturate(dot(n, normalize(float3(-0.5, 0.8, -0.3)))) * 0.75 + 0.3;
                float rim = pow(1 - saturate(dot(n, normalize(i.v))), 3) * 0.35;
                return fixed4(_Color.rgb * lit + rim, 1);
            }
            ENDCG
        }
    }
}
