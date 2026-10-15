// A sun and its planets as solids rising out of the board (sun3d.ts traceBalls), per pixel: each pixel a point of the
// board, the line of sight from the viewer's eye to it meeting a ball first (and showing that ball's surface there) or
// reaching the board; painted flat, they look solid from the eye (the trick of 3D pavement art). Over the flat things
// and the lattice's far side, under its near side. The quad is the dome's canvas, as SunFlat's.
Shader "BlueLoop/SunBalls"
{
    Properties
    {
        _Surface ("Sun surface (16-bit brightness)", 2D) = "black" {}
        _Map0 ("Planet 0 map", 2D) = "grey" {}
        _Map1 ("Planet 1 map", 2D) = "grey" {}
        _Map2 ("Planet 2 map", 2D) = "grey" {}
        // (vs, span, pad, s)
        _Geo ("Geometry", Vector) = (100,220,60,1)
        _Cam ("Eye (gauge px)", Vector) = (50,400,700,0)
        // (Farthest first: each slot's centre (gauge px) and radius; its kind: -1 none, 0 the sun, 1-3 a planet.)
        _Ball0 ("Ball 0", Vector) = (0,0,0,0)
        _Ball1 ("Ball 1", Vector) = (0,0,0,0)
        _Ball2 ("Ball 2", Vector) = (0,0,0,0)
        _Ball3 ("Ball 3", Vector) = (0,0,0,0)
        _Kinds ("Kinds", Vector) = (-1,-1,-1,-1)
        // (spin (radians), dead)
        _SunP ("Sun", Vector) = (0,0,0,0)
        _Deep ("Deep (0-255)", Vector) = (170,58,8,0)
        _Mid ("Mid (0-255)", Vector) = (246,140,34,0)
        _Bright ("Bright (0-255)", Vector) = (255,232,150,0)
        // (Each planet's light (xyz) and whether wet (w); its halfway vector (xyz) and turn (w, radians).)
        _Light0 ("Planet 0 light", Vector) = (0,0,1,0)
        _Half0 ("Planet 0 halfway", Vector) = (0,0,1,0)
        _Light1 ("Planet 1 light", Vector) = (0,0,1,0)
        _Half1 ("Planet 1 halfway", Vector) = (0,0,1,0)
        _Light2 ("Planet 2 light", Vector) = (0,0,1,0)
        _Half2 ("Planet 2 halfway", Vector) = (0,0,1,0)
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
            sampler2D _Surface, _Map0, _Map1, _Map2;
            float4 _Geo, _Cam, _Ball0, _Ball1, _Ball2, _Ball3, _Kinds, _SunP, _Deep, _Mid, _Bright;
            float4 _Light0, _Half0, _Light1, _Half1, _Light2, _Half2;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            float4 frag (v2f i) : SV_Target
            {
                float4 c = SunBallsPixel(i.uv, _Geo, _Cam, _Ball0, _Ball1, _Ball2, _Ball3, _Kinds, _SunP, _Deep, _Mid, _Bright,
                    _Light0, _Half0, _Light1, _Half1, _Light2, _Half2, _Surface, _Map0, _Map1, _Map2);
                #ifndef UNITY_COLORSPACE_GAMMA
                c.rgb = GammaToLinearSpace(c.rgb);
                #endif
                return c;
            }
            ENDCG
        }
    }
}
