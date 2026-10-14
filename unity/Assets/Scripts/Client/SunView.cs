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

    bool mine;

    public static SunView Make(Transform parent, Vector3 at, string playerId, bool mine = true)
    {
        var go = new GameObject("Sun");
        go.transform.SetParent(parent, false);
        go.transform.localPosition = at;
        var v = go.AddComponent<SunView>();
        v.PlayerId = playerId;
        v.mine = mine;
        v.Build();
        return v;
    }

    void Build()
    {
        var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        sphere.name = "Star";
        sphere.transform.SetParent(transform, false);
        sphere.transform.localScale = Vector3.one * Size;
        star = sphere.GetComponent<Renderer>();
        star.sharedMaterial = Mats.Make("Sun");
        star.sharedMaterial.SetFloat("_Seed", PlayerId.GetHashCode() % 100);
        // (The sphere's collider is what a tap on the sun hits.)
        gameObject.AddComponent<SunTag>().PlayerId = PlayerId;

        // Its corona, a soft glow on the table under it.
        var glow = Mats.Flat("Corona", transform, Mats.Make("Soft", new Color(1f, 0.6f, 0.25f, 0.3f)), 2.2f, 2.2f, Floor);
        glow.sharedMaterial.SetFloat("_Aspect", 1);
        glow.sharedMaterial.SetFloat("_Size", 0.12f);
        glow.sharedMaterial.SetFloat("_Radius", 0.12f);
        glow.sharedMaterial.SetFloat("_Soft", 0.12f);
        glow.sharedMaterial.renderQueue = 2960;

        // Its rings (art.ts ringTracks, on a gauge 1.667 wide): the heat meter, a white track and the heat so far over
        // it in the sun's own colour; outside it the shields', faint, and blue as far as its shields go.
        track = Arc("Track", 0.667f, 0.037f, new Color(1, 1, 1, 0.75f));
        meter = Arc("Meter", 0.667f, 0.037f, new Color(0.9f, 0.42f, 0.18f, 1));
        shieldTrack = Arc("Shield track", 0.783f, 0.053f, new Color(150 / 255f, 164 / 255f, 190 / 255f, 0.22f));
        shieldArc = Arc("Shield meter", 0.783f, 0.053f, new Color(109 / 255f, 140 / 255f, 194 / 255f, 1));

        // The planets' orbit, and the planets on it.
        orbit = new GameObject("Orbit").transform;
        orbit.SetParent(transform, false);
        orbit.localPosition = new Vector3(0, Floor, 0);
        var ring = Mats.Flat("Ring", orbit, Mats.Make("Soft", new Color(150 / 255f, 160 / 255f, 185 / 255f, 0.5f)), 2.17f, 2.17f);
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
            p.transform.localPosition = new Vector3(Mathf.Cos(a) * 0.94f, 0.12f, Mathf.Sin(a) * 0.94f);
            p.transform.localScale = Vector3.one * 0.23f;
            var m = Mats.Make("Planet", PlanetColours[i]);
            p.GetComponent<Renderer>().sharedMaterial = m;
            planets.Add(p.transform);
        }

        // Its figures, standing up over the sun to face the viewer (styles.css .vit-heat: 29 px, its most 13 px, in
        // dark umber haloed white; white haloed blue when cold).
        heat = Text("Heat", Board.Px(29), 700, 0);
        most = Text("Most", Board.Px(13.05f), 700, 6);
        // Under it, toward the table's middle (styles.css .vit-under): the planet it faces, in a white pill 58 × 23 px
        // with a soft edge, and its shields beside, a hexagon 44 px across, faint at none.
        float z = (mine ? Board.MyRowZ + 1.65f : Board.RowZ - 1.383f) - transform.localPosition.z;
        float tx = -5.303f - transform.localPosition.x, sx = -4.674f - transform.localPosition.x, y = Floor;
        float w = 0.667f, h = 0.267f;
        var shadow = Board.Shape("Planet pill shadow", transform, new Color(60 / 255f, 80 / 255f, 120 / 255f, 0.18f), w, h, h / 2, 2998, y, Board.Px(4) / 10, Board.Px(8) / 10);
        shadow.transform.localPosition = new Vector3(tx, y, z - Board.Px(2) / 10);
        var tag = Board.Shape("Planet pill", transform, Color.white, w, h, h / 2, 3000, y);
        tag.transform.localPosition = new Vector3(tx, y, z);
        var edge = Board.Shape("Planet pill edge", transform, new Color(150 / 255f, 164 / 255f, 190 / 255f, 0.5f), w - 0.016f, h - 0.016f, h / 2, 3001, y, 0.007f, 0.01f, true);
        edge.transform.localPosition = new Vector3(tx, y + 0.0005f, z);
        planet = Mats.FlatText("Planet", transform, "", Board.Px(10.88f), Look.InkSoft, true, 700, 12);
        planet.transform.localPosition = new Vector3(tx, y + 0.001f, z);
        float hex = 0.5f * 1.25f;
        shield = Board.Picture("Shields", transform, Resources.Load<Texture2D>("Icons/bt-hex"), Color.white, hex, hex, 3020, y);
        shield.transform.localPosition = new Vector3(sx, y + 0.001f, z);
        shieldBg = Board.Shape("Shields number", transform, Color.white, 0.16f, 0.15f, 0.04f, 3021, y, 0.012f, 0.03f);
        shieldBg.transform.localPosition = new Vector3(sx, y + 0.0015f, z);
        shieldN = Mats.FlatText("Shields count", transform, "0", Board.Px(12.18f), new Color(179 / 255f, 188 / 255f, 203 / 255f), true, 700, 0);
        shieldN.transform.localPosition = new Vector3(sx, y + 0.002f, z);
    }

    MeshRenderer shieldBg;
    MeshFilter shieldTrack, shieldArc;

    /// <summary>The sun's size, and how far below it the table lies (it rises out of the table as a dome, as the web's).</summary>
    const float Size = 0.92f;
    static float Floor => 0.02f - Board.MySun.y;

    /// <summary>A CSS hsl() colour (hue in degrees, saturation and lightness in per cent).</summary>
    static Color Hsl(float h, float s, float l)
    {
        s /= 100;
        l /= 100;
        float a = s * Mathf.Min(l, 1 - l);
        float F(int n)
        {
            float k = (n + h / 30) % 12;
            return l - a * Mathf.Max(-1, Mathf.Min(k - 3, Mathf.Min(9 - k, 1)));
        }
        return new Color(F(0), F(8), F(4));
    }

    TextMeshPro Text(string name, float size, int weight, float spacing)
    {
        var t = Mats.FlatText(name, transform, "", size, new Color(59 / 255f, 26 / 255f, 8 / 255f), true, weight, spacing);
        t.outlineWidth = 0.22f;
        t.outlineColor = new Color32(255, 250, 235, 235);
        return t;
    }

    MeshFilter Arc(string name, float radius, float width, Color c)
    {
        var go = new GameObject(name);
        go.transform.SetParent(transform, false);
        go.transform.localPosition = new Vector3(0, Floor, 0);
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
        // (art.ts vitals: the meter's colour runs pale gold to amber to deep red toward supernova; icy blue when cold.)
        float t = Mathf.Clamp01(p.Heat / (float)max), chill = p.Heat < 0 ? Mathf.Min(1, p.Heat / (float)Balance.MinHeat) : 0;
        var rim = chill > 0 ? Hsl(205, Mathf.Lerp(40, 70, chill), Mathf.Lerp(80, 62, chill)) : Hsl(Mathf.Lerp(46, 4, t), Mathf.Lerp(90, 88, t), Mathf.Lerp(60, 42, t));
        var md = meter.GetComponent<ArcData>();
        float fill = chill > 0 ? chill : t;
        meter.gameObject.SetActive(fill > 0);
        meter.mesh = ArcMesh(md.Radius, md.Width, Mathf.Max(0.01f, fill));
        meter.GetComponent<MeshRenderer>().sharedMaterial.color = rim;
        var sd = shieldTrack.GetComponent<ArcData>();
        shieldTrack.mesh = ArcMesh(sd.Radius, sd.Width, 0.999f);
        shieldArc.gameObject.SetActive(p.Shields > 0);
        shieldArc.mesh = ArcMesh(sd.Radius, sd.Width, Mathf.Max(0.01f, Mathf.Min(1, p.Shields / (float)Balance.MaxKeptShields)));
        var now = Game.CurrentPlanet(p, s);
        planet.text = now.ToUpperInvariant();
        int at = System.Array.IndexOf(PlanetNames, now);
        // (The planet it faces turns to the front.)
        orbitGoal = at < 0 ? orbitGoal : -90 - at * 120;
        for (int i = 0; i < planets.Count; i++) planets[i].localScale = Vector3.one * (i == at ? 0.27f : 0.21f);
        // (Shields up: the hexagon in shield blue, solid; none: pale grey, faint.)
        bool up = p.Shields > 0;
        float o = up ? 1 : 0.35f;
        shield.sharedMaterial.mainTexture = Resources.Load<Texture2D>(up ? "Icons/bt-hex-up" : "Icons/bt-hex");
        shield.sharedMaterial.color = new Color(1, 1, 1, o);
        shieldBg.sharedMaterial.color = up ? new Color(224 / 255f, 234 / 255f, 246 / 255f, o) : new Color(1, 1, 1, o);
        shieldN.text = p.Shields.ToString();
        shieldN.color = up ? new Color(61 / 255f, 127 / 255f, 196 / 255f, o) : new Color(179 / 255f, 188 / 255f, 203 / 255f, o);
        // (Its heat in umber haloed white; below zero, white haloed deep blue.)
        bool cold = p.Heat < 0;
        heat.color = most.color = cold ? Color.white : new Color(59 / 255f, 26 / 255f, 8 / 255f);
        most.alpha = 0.8f;
        heat.outlineColor = most.outlineColor = cold ? new Color32(10, 28, 72, 235) : new Color32(255, 250, 235, 235);
        _ = share;
    }

    /// <summary>Its figures turned to the viewer, over the sun's face.</summary>
    public void Face(Camera cam)
    {
        // (As the web's: over the sun's place on the table, its heat 0.32 card widths tall a little above the
        // middle, its most under it, both drawn nearer the eye along the line of sight, so they stand in front of the
        // sun yet look where the web's are.)
        var eye = cam.transform.position;
        var f = cam.transform.forward;
        var u = cam.transform.up;
        var at = transform.position - transform.up * transform.localPosition.y;
        const float k = 0.75f;
        var near = eye + (at - eye) * k;
        heat.transform.rotation = most.transform.rotation = cam.transform.rotation;
        heat.transform.position = near + u * 0.107f * k;
        most.transform.position = near - u * 0.124f * k;
        heat.fontSize = 3.16f * k;
        most.fontSize = 1.45f * k;
        _ = f;
    }

    float pulseAge = -1, pulseDelay;
    bool pulseHot;

    /// <summary>A hit landing: the sun swells and flares (hot), or shrinks a little and pales (cooled), and settles.</summary>
    public void Pulse(bool hot, float after = 0)
    {
        pulseAge = 0;
        pulseDelay = after;
        pulseHot = hot;
    }

    void Update()
    {
        if (pulseAge >= 0)
        {
            pulseAge += Time.deltaTime;
            float t = Mathf.Clamp01((pulseAge - pulseDelay) / 0.5f);
            float bump = t > 0 ? Mathf.Sin(Mathf.PI * t) * (1 - t * 0.3f) : 0;
            star.transform.localScale = Vector3.one * Size * (1 + (pulseHot ? 0.16f : -0.08f) * bump);
            if (pulseAge - pulseDelay > 0.5f) { pulseAge = -1; star.transform.localScale = Vector3.one * Size; }
        }
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
