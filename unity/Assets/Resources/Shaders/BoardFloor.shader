// The board's floor (styles.css .board-floor): an ellipse reaching well past the play area (inset -38% -48%), drawn in
// its own pixels (_Size): bottom up, a white glow in its middle, rings 59 px apart round it and a grid of dots 34 px
// apart; faded out toward its rim (from 55% of the way out) and cleared round the middle, where the Stellari lies
// (nothing within 86 px, all from 92). It reaches past the plate onto the page, as the web's.
Shader "BlueLoop/BoardFloor"
{
    Properties
    {
        _Size ("Floor size (px)", Vector) = (1772,680,0,0)
    }
    SubShader
    {
        Tags { "Queue"="Transparent-10" "RenderType"="Transparent" }
        Blend One OneMinusSrcAlpha
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float4 _Size;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            // A layer (premultiplied) laid over what is under it.
            float4 over(float4 top, float4 under) { return top + under * (1 - top.a); }
            fixed4 frag (v2f i) : SV_Target
            {
                float2 S = _Size.xy;
                float2 px = float2(i.uv.x, 1 - i.uv.y) * S;
                float2 p = px - S * 0.5;
                // (How far out, as a share of the ellipse: 1 at its rim.)
                float e = length(p / (S * 0.5));

                // radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.55), rgba(236,240,248,0.25) 45%, transparent 70%):
                // its ellipse the farthest corner's, √2 times the box's.
                float g = e / 1.41421356;
                float4 a0 = float4(1, 1, 1, 1) * 0.55, a1 = float4(236 / 255.0, 240 / 255.0, 248 / 255.0, 1) * 0.25;
                float4 col = g < 0.45 ? lerp(a0, a1, g / 0.45) : lerp(a1, float4(0, 0, 0, 0), saturate((g - 0.45) / 0.25));

                // repeating-radial-gradient(circle, transparent 0 58px, rgba(140,150,175,0.16) 58px 59px): a 1 px ring
                // every 59 px.
                float r = length(p);
                float fr = max(fwidth(r), 1e-3);
                float m = fmod(r, 59);
                // (Thinner than a screen pixel far off: as faint as it is thin.)
                float ring = saturate(min(min(m - 58, 59 - m) / fr + 0.5, 1 / fr));
                col = over(float4(140, 150, 175, 255) / 255 * 0.16 * ring, col);

                // radial-gradient(circle, rgba(120,135,170,0.32) 0 1px, transparent 1.5px) 0 0 / 34px 34px.
                float2 q = fmod(px, 34) - 17;
                float dr = length(q), fd = max(fwidth(dr), 0.5);
                float dots = 0.32 * saturate((1.25 - dr) / fd + 0.5);
                col = over(float4(120, 135, 170, 255) / 255 * dots, col);

                // The masks: radial-gradient(ellipse 50% 50%, #000 55%, transparent 100%) and, intersected,
                // radial-gradient(circle, transparent 0 86px, #000 92px).
                float mask = saturate((1 - e) / 0.45) * saturate((r - 86) / 6);
                return col * mask;
            }
            ENDCG
        }
    }
}
