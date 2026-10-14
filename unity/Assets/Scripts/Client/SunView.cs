using System.Collections.Generic;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;

/// <summary>
/// A side's sun on the table: a burning sphere (hotter-looking the nearer it is to supernova), its heat over its most
/// in large figures across it, a meter of its heat arcing round it, its three planets in orbit with the one it faces
/// lit, and its shields.
/// </summary>
public class SunView : MonoBehaviour
{
    public string PlayerId;
    Renderer star;
    MeshFilter meter, track;
    TextMeshPro heat, most, planet, shieldN;
    MeshRenderer shield;
    readonly List<Transform> planets = new List<Transform>();
    Transform orbit;
    float orbitTurn, orbitGoal;

    static readonly string[] PlanetNames = { "dead", "abundant", "industrial" };
    static readonly Color[] PlanetColours = { new Color(0.42f, 0.43f, 0.47f), new Color(0.27f, 0.62f, 0.5f), new Color(0.78f, 0.47f, 0.24f) };

    public static SunView Make(Transform parent, Vector3 at, string playerId)
    {
        var go = new GameObject("Sun");
        go.transform.SetParent(parent, false);
        go.transform.localPosition = at;
        var v = go.AddComponent<SunView>();
        v.PlayerId = playerId;
        v.Build();
        return v;
    }

    void Build()
    {
        var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        sphere.name = "Star";
        sphere.transform.SetParent(transform, false);
        sphere.transform.localScale = Vector3.one * 1.55f;
        star = sphere.GetComponent<Renderer>();
        star.sharedMaterial = Mats.Make("Sun");
        star.sharedMaterial.SetFloat("_Seed", PlayerId.GetHashCode() % 100);
        // (The sphere's collider is what a tap on the sun hits.)
        gameObject.AddComponent<SunTag>().PlayerId = PlayerId;

        // Its corona, a soft glow on the table under it.
        var glow = Mats.Flat("Corona", transform, Mats.Make("Soft", new Color(1f, 0.6f, 0.25f, 0.35f)), 3.2f, 3.2f, -0.88f);
        glow.sharedMaterial.SetFloat("_Aspect", 1);
        glow.sharedMaterial.SetFloat("_Size", 0.12f);
        glow.sharedMaterial.SetFloat("_Radius", 0.12f);
        glow.sharedMaterial.SetFloat("_Soft", 0.12f);
        glow.sharedMaterial.renderQueue = 2960;

        // The heat meter: a faint full ring, and the heat so far over it.
        track = Arc("Track", 1.15f, 0.035f, new Color(0.62f, 0.64f, 0.7f, 0.45f));
        meter = Arc("Meter", 1.15f, 0.07f, new Color(0.9f, 0.42f, 0.18f, 0.95f));

        // The planets' orbit, and the planets on it.
        orbit = new GameObject("Orbit").transform;
        orbit.SetParent(transform, false);
        orbit.localPosition = new Vector3(0, -0.86f, 0);
        var ring = Mats.Flat("Ring", orbit, Mats.Make("Soft", new Color(0.55f, 0.58f, 0.66f, 0.5f)), 3.1f, 3.1f);
        ring.sharedMaterial.SetFloat("_Aspect", 1);
        ring.sharedMaterial.SetFloat("_Size", 0.43f);
        ring.sharedMaterial.SetFloat("_Radius", 0.43f);
        ring.sharedMaterial.SetFloat("_Soft", 0.004f);
        ring.sharedMaterial.SetFloat("_Ring", 1);
        ring.sharedMaterial.renderQueue = 2965;
        for (int i = 0; i < 3; i++)
        {
            var p = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Mats.Kill(p.GetComponent<Collider>());
            p.name = PlanetNames[i];
            p.transform.SetParent(orbit, false);
            float a = i * Mathf.PI * 2 / 3;
            p.transform.localPosition = new Vector3(Mathf.Cos(a) * 1.33f, 0.2f, Mathf.Sin(a) * 1.33f);
            p.transform.localScale = Vector3.one * 0.32f;
            var m = Mats.Make("Planet", PlanetColours[i]);
            p.GetComponent<Renderer>().sharedMaterial = m;
            planets.Add(p.transform);
        }

        // Its figures, standing up over the sun to face the viewer.
        heat = Text("Heat", 9f, Color.white, 700);
        heat.transform.localPosition = new Vector3(0, 0.95f, 0.1f);
        most = Text("Most", 4.2f, new Color(1, 1, 1, 0.9f), 500);
        most.transform.localPosition = new Vector3(0, 0.95f, -0.35f);
        planet = Mats.FlatText("Planet", transform, "", 2.4f, Look.Ink, true, 500, 14);
        planet.transform.localPosition = new Vector3(0.6f, -0.85f, -1.95f);
        shield = Mats.Flat("Shields", transform, Mats.Make("Card"), 0.42f, 0.47f, -0.8f);
        shield.sharedMaterial.SetFloat("_Radius", 0);
        shield.sharedMaterial.SetFloat("_Aspect", 0.47f / 0.42f);
        shield.sharedMaterial.renderQueue = 3020;
        shield.transform.localPosition = new Vector3(1.45f, -0.8f, -1.2f);
    }

    TextMeshPro Text(string name, float size, Color c, int weight)
    {
        var t = Mats.FlatText(name, transform, "", size, c, true, weight, 0);
        t.outlineWidth = 0.18f;
        t.outlineColor = new Color32(120, 40, 10, 140);
        return t;
    }

    MeshFilter Arc(string name, float radius, float width, Color c)
    {
        var go = new GameObject(name);
        go.transform.SetParent(transform, false);
        go.transform.localPosition = new Vector3(0, -0.85f, 0);
        var f = go.AddComponent<MeshFilter>();
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = Mats.Make("Soft", c);
        r.sharedMaterial.SetFloat("_Size", 0.5f);
        r.sharedMaterial.SetFloat("_Soft", 0.0001f);
        r.sharedMaterial.renderQueue = 2970;
        go.AddComponent<ArcData>().Set(radius, width);
        return f;
    }

    /// <summary>An arc round the sun from its top, clockwise, over `share` of the circle.</summary>
    static Mesh ArcMesh(float radius, float width, float share)
    {
        int n = Mathf.Max(2, Mathf.CeilToInt(96 * share));
        var verts = new List<Vector3>();
        var uvs = new List<Vector2>();
        var tris = new List<int>();
        for (int i = 0; i <= n; i++)
        {
            float a = Mathf.PI / 2 - share * Mathf.PI * 2 * i / n;
            var dir = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
            verts.Add(dir * (radius - width / 2));
            verts.Add(dir * (radius + width / 2));
            uvs.Add(new Vector2(0.5f, 0.5f));
            uvs.Add(new Vector2(0.5f, 0.5f));
            if (i > 0)
            {
                int k = i * 2;
                tris.AddRange(new[] { k - 2, k - 1, k, k - 1, k + 1, k });
            }
        }
        var m = new Mesh();
        m.SetVertices(verts);
        m.SetUVs(0, uvs);
        m.SetTriangles(tris, 0);
        return m;
    }

    public void Show(GameState s, PlayerState p)
    {
        int max = Game.SupernovaThreshold(p);
        float share = Mathf.Clamp01((p.Heat - Balance.MinHeat) / (float)(max - Balance.MinHeat));
        star.sharedMaterial.SetFloat("_Hot", Mathf.Clamp01(p.Heat / (float)max));
        heat.text = p.Heat.ToString();
        most.text = $"/{max}";
        var ad = track.GetComponent<ArcData>();
        track.mesh = ArcMesh(ad.Radius, ad.Width, 0.999f);
        var md = meter.GetComponent<ArcData>();
        meter.mesh = ArcMesh(md.Radius, md.Width, Mathf.Max(0.01f, Mathf.Clamp01(p.Heat / (float)max)));
        meter.GetComponent<MeshRenderer>().sharedMaterial.color = p.Heat < 0 ? new Color(0.3f, 0.55f, 0.9f, 0.95f) : new Color(0.9f, 0.42f, 0.18f, 0.95f);
        var now = Game.CurrentPlanet(p, s);
        planet.text = $"{now.ToUpperInvariant()} · {Game.PlanetTurnsLeft(p)}";
        int at = System.Array.IndexOf(PlanetNames, now);
        // (The planet it faces turns to the front.)
        orbitGoal = at < 0 ? orbitGoal : -90 - at * 120;
        for (int i = 0; i < planets.Count; i++) planets[i].localScale = Vector3.one * (i == at ? 0.42f : 0.3f);
        shield.gameObject.SetActive(p.Shields > 0);
        if (p.Shields > 0) shield.sharedMaterial.mainTexture = Faces.Badge("def", p.Shields);
        _ = share;
    }

    void Update()
    {
        orbitTurn = Mathf.LerpAngle(orbitTurn, orbitGoal, 1 - Mathf.Exp(-Time.deltaTime * 4));
        orbit.localRotation = Quaternion.Euler(0, orbitTurn, 0);
    }

    public void Settle()
    {
        orbitTurn = orbitGoal;
        orbit.localRotation = Quaternion.Euler(0, orbitTurn, 0);
    }
}

public class ArcData : MonoBehaviour
{
    public float Radius, Width;
    public void Set(float r, float w)
    {
        Radius = r;
        Width = w;
    }
}

/// <summary>Whose sun this is (what a tap on it aims at).</summary>
public class SunTag : MonoBehaviour
{
    public string PlayerId;
}
