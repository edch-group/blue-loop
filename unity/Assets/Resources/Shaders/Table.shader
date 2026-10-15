// The battle table (styles.css .table-view > .game): the pearl plate, corners of 34 px, as the web paints it, in the
// board's own pixels (_Size): its background (a white glow at 50% 45% fading to #f4f3ef and #ebeae5 at its edges,
// under a grid of faint dots 38 px apart) and its inset shadows (a soft 60 px shade in from the edge, a 12 px band and
// a 1.5 px white rim).
Shader "BlueLoop/Table"
{
    Properties
    {
        _Size ("Plate size (px)", Vector) = (932,482,0,0)
        _Corner ("Corner radius (px)", Float) = 34
    }
    SubShader
    {
        Tags { "Queue"="Transparent-10" "RenderType"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float4 _Size;
            float _Corner;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            // A rounded box's signed distance (px): its half size b, corners r.
            float box(float2 p, float2 b, float r) { float2 q = abs(p) - b + r; return length(max(q, 0)) + min(max(q.x, q.y), 0) - r; }
            // The share of a line `w` wide beyond distance d that is covered, its edge smoothed over a pixel `aa`.
            float cover(float d, float aa) { return saturate(0.5 + d / max(aa, 1e-4)); }
            // The normal distribution's tail (a shadow's blur), logistic-approximated.
            float tail(float z) { return 1 / (1 + exp(1.702 * z)); }
            fixed4 frag (v2f i) : SV_Target
            {
                float2 S = _Size.xy;
                // (Pixels from the plate's top-left: x right, y down; the quad's top is its far edge.)
                float2 px = float2(i.uv.x, 1 - i.uv.y) * S;
                float2 p = px - S * 0.5;
                float d = box(p, S * 0.5, _Corner);
                float aa = fwidth(d);
                float a = 1 - smoothstep(-aa * 0.5, aa * 0.5, d);

                // radial-gradient(ellipse 70% 60% at 50% 45%, #ffffff, #f4f3ef 60%, #ebeae5).
                float e = length((px - S * float2(0.5, 0.45)) / (S * float2(0.7, 0.6)));
                float3 c = e < 0.6 ? lerp(float3(1, 1, 1), float3(244, 243, 239) / 255, e / 0.6)
                                   : lerp(float3(244, 243, 239) / 255, float3(235, 234, 229) / 255, saturate((e - 0.6) / 0.4));
                // radial-gradient(circle, rgba(120,135,170,0.18) 0 1px, transparent 1.6px) 0 0 / 38px 38px.
                float2 q = fmod(px, 38) - 19;
                float r = length(q), fr = max(fwidth(r), 0.6);
                // (Solid to 1 px, gone at 1.6: a ramp about 1.3 px, never sharper than the screen's own pixel.)
                float dots = 0.18 * saturate((1.3 - r) / fr + 0.5);
                c = lerp(c, float3(120, 135, 170) / 255, dots);

                // The inset shadows, bottom up: 0 0 60px rgba(150,156,172,0.12); 0 0 0 12px rgba(150,156,172,0.08);
                // 0 0 0 1.5px rgba(255,255,255,0.95).
                float2 edge = S * 0.5 - abs(p);
                float soft = 1 - (1 - tail(edge.x / 30)) * (1 - tail(edge.y / 30));
                soft = max(soft, tail(-d / 30));
                c = lerp(c, float3(150, 156, 172) / 255, 0.12 * soft);
                float band = cover(box(p, S * 0.5 - 12, _Corner - 12), aa);
                c = lerp(c, float3(150, 156, 172) / 255, 0.08 * band);
                float rim = cover(box(p, S * 0.5 - 1.5, _Corner - 1.5), aa);
                c = lerp(c, float3(1, 1, 1), 0.95 * rim);
                return fixed4(c, a);
            }
            ENDCG
        }
    }
}
