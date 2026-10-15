// What lies flat on the board round a sun (sun3d.ts drawDome's flat things, art.ts's tracks), per pixel, in order: the
// orbit's ring, the shields' track and its arc, the heat's track and its arc, the planets' bases, the orbit's trail and
// notches, the shield dome's foot. The quad is the dome's canvas: the gauge and DOME_PAD of it past every side.
Shader "BlueLoop/SunFlat"
{
    Properties
    {
        _Nova ("Brightness (a supernova's flare)", Float) = 1
        // (vs, span, pad, s: the gauge's size, the canvas's span and pad (gauge px), its pixels per gauge px)
        _Geo ("Geometry", Vector) = (100,220,60,1)
        // (dim, has orbit, heat arc, shield arc (0: none))
        _Rings ("Rings", Vector) = (1,1,0,0)
        _Rim ("Heat arc colour (0-1)", Vector) = (1,0.8,0.3,1)
        // (planets shown, planet radius, notches shown, stage)
        _Planets ("Planets", Vector) = (0,7,0,0)
        _Base0 ("Planet 0 at", Vector) = (0,0,0,0)
        _Base1 ("Planet 1 at", Vector) = (0,0,0,0)
        _Base2 ("Planet 2 at", Vector) = (0,0,0,0)
        _Trail0 ("Planet 0 trail colour (0-1)", Vector) = (0,0,0,0)
        _Trail1 ("Planet 1 trail colour (0-1)", Vector) = (0,0,0,0)
        _Trail2 ("Planet 2 trail colour (0-1)", Vector) = (0,0,0,0)
        _Facing ("Facing planet's trail colour (0-1)", Vector) = (0,0,0,0)
        // (shown, radius (gauge px), alpha)
        _Lattice ("Lattice foot", Vector) = (0,0,0,0)
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
            #pragma target 3.5
            #include "UnityCG.cginc"
            #include "SunCore.cginc"
            float4 _Geo, _Rings, _Rim, _Planets, _Base0, _Base1, _Base2, _Trail0, _Trail1, _Trail2, _Facing, _Lattice;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }

            float _Nova;

            float4 frag (v2f i) : SV_Target
            {
                float4 d = SunFlatPixel(i.uv, _Geo, _Rings, _Rim, _Planets, _Base0, _Base1, _Base2, _Trail0, _Trail1, _Trail2, _Facing, _Lattice);
                // (CSS filter: brightness(), on the colours as drawn, clipped.)
                d.rgb = min(1, d.rgb * _Nova);
                #ifndef UNITY_COLORSPACE_GAMMA
                d.rgb = GammaToLinearSpace(d.rgb);
                #endif
                return d;
            }
            ENDCG
        }
    }
}
