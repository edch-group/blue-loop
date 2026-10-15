// The crew page's spotlight (base3d.ts spotlight, its veil): the page's white (_Color, premultiplied by how far it has
// come in) over the whole view, whatever the camera's framing: the quad's corners (-1 to 1) taken as the screen's own,
// as the web's veil is drawn. Drawn first by its camera, so the one figure lit comes over it.
Shader "BlueLoop/Veil"
{
    Properties
    {
        _Color ("The veil (premultiplied)", Color) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Transparent" "IgnoreProjector"="True" }
        ZWrite Off
        ZTest Always
        Cull Off
        Blend One OneMinusSrcAlpha
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _Color;
            struct v2f { float4 pos : SV_POSITION; };
            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = float4(v.vertex.xy, 0.5, 1);
                return o;
            }
            fixed4 frag (v2f i) : SV_Target { return _Color; }
            ENDCG
        }
    }
}
