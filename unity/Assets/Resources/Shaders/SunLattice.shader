// The shields' lattice round a sun (sun3d.ts drawCells): its hexagons as the eye sees them on the board, each a quad
// round the cell carrying the cell's six corners (gauge px), filled faintly, then its outline stroked; drawn in order,
// each over the last. The far side's cells go under the sun, the near side's over it (two meshes).
Shader "BlueLoop/SunLattice"
{
    Properties
    {
        _Nova ("Brightness (a supernova's flare)", Float) = 1
        // (x: strength × shimmer, y: the outline's width, z: s (the canvas's pixels per gauge px))
        _Lat ("Lattice", Vector) = (1,0.6,1,0)
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
            float4 _Lat;
            // (uv0: this corner in gauge px, the cell's own alpha; uv1-3: the cell's six corners.)
            struct appdata { float4 vertex : POSITION; float4 uv0 : TEXCOORD0; float4 uv1 : TEXCOORD1; float4 uv2 : TEXCOORD2; float4 uv3 : TEXCOORD3; };
            struct v2f { float4 pos : SV_POSITION; float4 at : TEXCOORD0; float4 c01 : TEXCOORD1; float4 c23 : TEXCOORD2; float4 c45 : TEXCOORD3; };
            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.at = v.uv0;
                o.c01 = v.uv1;
                o.c23 = v.uv2;
                o.c45 = v.uv3;
                return o;
            }
            float _Nova;
            float4 frag (v2f i) : SV_Target
            {
                float4 c = SunCell(i.at.xy, i.c01.xy, i.c01.zw, i.c23.xy, i.c23.zw, i.c45.xy, i.c45.zw, i.at.z * _Lat.x, _Lat.y, _Lat.z);
                // (CSS filter: brightness(), on the colours as drawn, clipped.)
                c.rgb = min(1, c.rgb * _Nova);
                #ifndef UNITY_COLORSPACE_GAMMA
                c.rgb = GammaToLinearSpace(c.rgb);
                #endif
                return c;
            }
            ENDCG
        }
    }
}
