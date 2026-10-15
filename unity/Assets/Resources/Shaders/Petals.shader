// The Stellari's petals on the board (styles.css .backdrop-board .petals): the ring baked twice, its petals' own colour
// (backdrop.ts --petal-fill / --petal-stroke) white (_MainTex) and black (_Dark). What the board shows is linear in
// that colour, so the two are mixed by it, channel by channel (_Color): the web's wash of icy blue or red exactly.
Shader "BlueLoop/Petals"
{
    Properties
    {
        _MainTex ("Petals white", 2D) = "white" {}
        _Dark ("Petals black", 2D) = "black" {}
        _Color ("Petal colour", Color) = (1,1,1,1)
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
            sampler2D _MainTex, _Dark;
            fixed4 _Color;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            fixed4 frag (v2f i) : SV_Target
            {
                fixed4 w = tex2D(_MainTex, i.uv), k = tex2D(_Dark, i.uv);
                return fixed4(lerp(k.rgb, w.rgb, _Color.rgb), w.a);
            }
            ENDCG
        }
    }
}
