using System.Collections.Generic;
using CaptainShipSpec = BlueLoop.Models.CaptainShipSpec;
using UnityEngine;

/// <summary>
/// The game's 3D models (BlueLoop.Models, ported from the web's ship3d.ts and its kin) as Unity meshes: each vertex's
/// position, normal and colour as they are, its material in uv.x, drawn by the ship shader (Resources/Shaders/Ship).
/// The models are laid out +x forward, +y up, +z to starboard, 1 long.
/// </summary>
public static class ModelMesh
{
    static readonly Dictionary<string, Mesh> made = new Dictionary<string, Mesh>();

    /// <summary>A model's vertex array (stride 10) as a mesh, made once under its name.</summary>
    public static Mesh Of(string name, System.Func<float[]> build)
    {
        if (made.TryGetValue(name, out var m) && m != null) return m;
        m = From(build());
        m.name = name;
        made[name] = m;
        return m;
    }

    public static Mesh From(float[] v)
    {
        int n = v.Length / 10;
        var pos = new Vector3[n];
        var nor = new Vector3[n];
        var col = new Color[n];
        var uv = new Vector2[n];
        var tri = new int[n];
        for (int i = 0; i < n; i++)
        {
            int k = i * 10;
            pos[i] = new Vector3(v[k], v[k + 1], v[k + 2]);
            nor[i] = new Vector3(v[k + 3], v[k + 4], v[k + 5]);
            col[i] = new Color(v[k + 6], v[k + 7], v[k + 8], 1);
            uv[i] = new Vector2(v[k + 9], 0);
            // (Wound as the web draws them; the shader draws both faces.)
            tri[i] = i;
        }
        var m = new Mesh { indexFormat = n > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
        m.vertices = pos;
        m.normals = nor;
        m.colors = col;
        m.uv = uv;
        m.triangles = tri;
        m.RecalculateBounds();
        return m;
    }

    /// <summary>A model in the scene: its mesh, drawn by the ship shader in its holder's colour.</summary>
    public static GameObject Make(string name, Mesh mesh, Transform parent, Color? holder = null)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = Mats.Make("Ship", holder ?? new Color(0.36f, 0.56f, 0.86f));
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        return go;
    }

    /// <summary>The Captain's ship as the map shows it: fitted with the parts, built up to the level, the crew aboard.</summary>
    public static Mesh CaptainShipMesh(CaptainShipSpec spec)
    {
        var key = "captain-ship:" + spec.Level + ":" + string.Join(",", spec.Parts ?? new Dictionary<string, string>()) + ":" + string.Join(",", spec.Rarity ?? new Dictionary<string, string>()) + ":" + string.Join(",", spec.Crew ?? new List<string>());
        return Of(key, () => BlueLoop.Models.CaptainShip.CaptainShipMap(spec).Mesh);
    }
}
