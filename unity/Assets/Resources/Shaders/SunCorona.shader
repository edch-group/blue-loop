// A sun's corona (sun3d.ts draw), per pixel: ragged flames licking out across the board round the sun's base, white-hot
// at the base, reddening and thinning towards their tips; solid and white-hot under the dome. The quad is the corona's
// canvas (0.88 of the gauge), the sun's base 0.27 of the gauge across its middle.
Shader "BlueLoop/SunCorona"
{
    Properties
    {
        _Surface ("Surface (16-bit brightness)", 2D) = "black" {}
        _Deep ("Deep (0-255)", Vector) = (170,58,8,0)
        _Mid ("Mid (0-255)", Vector) = (246,140,34,0)
        _Bright ("Bright (0-255)", Vector) = (255,232,150,0)
        // (x: danger, y: seed, z: flick (time × 0.0004), w: unused)
        _Flame ("Danger, seed, flick", Vector) = (0,0,0,0)
        // (x: (flick × 20) mod 256, y: floor(flick × 30) mod 512)
        _Wisp ("Wisp offsets", Vector) = (0,0,0,0)
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
            sampler2D _Surface;
            float4 _Deep, _Mid, _Bright, _Flame, _Wisp;
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
            v2f vert (appdata_base v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.uv = v.texcoord.xy; return o; }
            float4 frag (v2f i) : SV_Target
            {
                // (From the canvas's middle in the sun's base radii, y down: the base is 0.27 / 0.88 of the canvas.)
                float2 q = float2(i.uv.x - 0.5, 0.5 - i.uv.y) / (0.27 / 0.88);
                float4 c = SunCoronaPixel(q, _Deep.xyz, _Mid.xyz, _Bright.xyz, _Flame.x, _Flame.y, _Flame.z, _Wisp.x, _Wisp.y, _Surface);
                #ifndef UNITY_COLORSPACE_GAMMA
                c.rgb = GammaToLinearSpace(c.rgb);
                #endif
                return c;
            }
            ENDCG
        }
    }
}
