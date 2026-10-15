using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using BlueLoop.Models;
using UnityEngine;
using UMesh = UnityEngine.Mesh;

/// <summary>
/// The campaign menu's scene (campaign.ts showBase, base3d.ts): the map's own land, the camera flying low along it
/// toward the Stellari, the land breaking away a little behind; over it, the Captain's ship side on, drifting, the
/// Captain on its foredeck, the crew in their places. Two cameras, as the web's two canvases: the land's, and the
/// ship's (its own lens, its subject set off to the left). Both scenes are laid out in the web's own axes (z flipped).
/// </summary>
[ExecuteAlways]
public class CampaignBackdrop : MonoBehaviour
{
    const int LandLayer = 29, ShipLayer = 30;
    const float Loop = 150;
    static readonly Vector3 Flip = new Vector3(1, 1, -1);

    Camera ui, landCam, shipCam;
    CameraClearFlags uiClear;
    int uiMask;
    Transform land, ship;
    Material ground, abyss;
    Transform shipModel, captain;
    // The engines' flames (a fiery orange glow, a hot core in it) and, while the ship is worn, its smoke: soft discs facing
    // the camera, as the map's (CampaignView.Objects), on the ship's own camera.
    readonly List<(Transform t, Material m)> flames = new List<(Transform, Material)>(), cores = new List<(Transform, Material)>(), puffs = new List<(Transform, Material)>();
    static UMesh quad;
    // The Captain as Meshy made and rigged him (CaptainFigure): stood afresh each frame as he breathes and looks about.
    CaptainFigure figure;
    UMesh figureMesh;
    Vector3[] figurePos, figureNor;
    readonly List<(string id, CompanionPlace place, Transform t)> crew = new List<(string, CompanionPlace, Transform)>();
    CaptainShipBuild build;
    float t0;
    string zone;
    readonly Dictionary<string, Matrix4x4> crewM = new Dictionary<string, Matrix4x4>();

    /// <summary>
    /// Frame a section (its page open beside it), or (null) the whole ship. The Captain's: the camera close on the
    /// Captain, at the left, a little low; everything else covered, so all that shows is the Captain on the paper.
    /// </summary>
    public void Focus(string section)
    {
        zone = section;
        // (Opened afresh in the editor's pictures: settled at once.)
        if (!Application.isPlaying) calm = zone == "hangar" ? 1 : 0;
        // (A section opened from the menu: no longer opening afresh.)
        if (zone != null) introPending = false;
        // (Enlightenment, out on the land: the camera glides there, as it does for the ship tab.)
        if (!Application.isPlaying) toward = research = zone == "research" ? 1 : 0;
        // (The Captain or one of the crew, alone: everything else covered.)
        bool alone = zone != null && zone != "hangar" && zone != "research";
        if (landCam != null) landCam.enabled = !alone;
        shipCam.clearFlags = alone ? CameraClearFlags.SolidColor : CameraClearFlags.Depth;
        shipCam.backgroundColor = Look.Paper;
        shipModel.gameObject.SetActive(!alone);
        captain.gameObject.SetActive(!alone || zone == "captain");
        foreach (var c in crew) c.t.gameObject.SetActive(!alone || zone == c.id);
        Pose();
    }

    /// <summary>A fixed moment to draw (the editor's screenshots, which have no clock running).</summary>
    public float? At;

    public static CampaignBackdrop Make(Camera ui, Transform parent)
    {
        var go = new GameObject("Campaign backdrop");
        go.transform.SetParent(parent, false);
        var b = go.AddComponent<CampaignBackdrop>();
        b.Build(ui);
        return b;
    }

    /// <summary>
    /// A story scene's (campaign.ts scene, base3d.ts setVisitor): the run's ship as fitted and crewed, no land, in the
    /// upper part of the screen, the talk beneath it; whoever comes alongside overtaking from astern and holding there.
    /// </summary>
    public static CampaignBackdrop Story(Camera ui, Transform parent, CaptainShipSpec spec, List<string> crew)
    {
        var go = new GameObject("Story scene");
        go.transform.SetParent(parent, false);
        var b = go.AddComponent<CampaignBackdrop>();
        b.story = true;
        b.fixedSpec = spec;
        b.fixedCrew = crew;
        b.Build(ui);
        return b;
    }

    bool story;
    Camera paperCam;
    Transform visitor;
    Matrix4x4 visitorLocal;
    float visitorT0;

    // Each visitor's model (a race's ship, the lab's test tube), its colour, and how big it is drawn.
    static readonly Dictionary<string, (int race, Color colour, float size, bool upright)> Visitors = new Dictionary<string, (int, Color, float, bool)>
    {
        ["merchant"] = (2, new Color(0.32f, 0.72f, 0.68f), 3.2f, false),
        ["pirate"] = (-1, new Color(0.72f, 0.26f, 0.2f), 3.4f, false),
        ["hunter"] = (0, new Color(0.95f, 0.76f, 0.34f), 3.1f, false),
        ["lab"] = (-99, new Color(0.4f, 0.62f, 1f), 2.2f, true),
        ["nyxari"] = (4, new Color(0.55f, 0.3f, 0.85f), 3, false),
        ["seren"] = (6, new Color(0.6f, 0.78f, 1f), 3, false),
    };

    /// <summary>Who comes alongside (null: no one, the ship's own framing).</summary>
    public void SetVisitor(string kind)
    {
        if (visitor != null && visitor.name == kind) return;
        if (visitor != null) Mats.Kill(visitor.gameObject);
        visitor = null;
        if (kind == null || !Visitors.TryGetValue(kind, out var v)) return;
        var data = v.race == -99 ? Ship3d.PropModel3d(PropKind.Lab) : Ship3d.ShipModel3d(v.race).Mesh;
        // (Centred on its own middle, and scaled to its size along its length.)
        var lo = Vector3.one * float.MaxValue;
        var hi = Vector3.one * float.MinValue;
        for (int i = 0; i < data.Length; i += 10)
        {
            var p = new Vector3(data[i], data[i + 1], data[i + 2]);
            lo = Vector3.Min(lo, p);
            hi = Vector3.Max(hi, p);
        }
        float k = v.size / Mathf.Max(1e-6f, hi.x - lo.x);
        visitorLocal = (v.upright ? RZ(Mathf.PI / 2) : Matrix4x4.identity) * S(k) * T(-(lo + hi) / 2);
        var go = ModelMesh.Make(kind, ModelMesh.Of("visitor:" + kind, () => data), ship, v.colour);
        go.layer = ShipLayer;
        go.GetComponent<MeshRenderer>().sharedMaterial.SetFloat("_Flip", -1);
        visitor = go.transform;
        visitorT0 = Now;
        Pose();
    }
    CaptainShipSpec fixedSpec;
    List<string> fixedCrew;

    void Build(Camera uiCam)
    {
        ui = uiCam;
        uiClear = ui.clearFlags;
        ui.clearFlags = CameraClearFlags.Depth;
        // (The page's camera draws the page alone, not the scene's layers again from where it stands.)
        uiMask = ui.cullingMask;
        ui.cullingMask &= ~((1 << LandLayer) | (1 << ShipLayer));
        t0 = Time.realtimeSinceStartup;
        introPending = !story;
        if (!story) BuildLand();
        else
        {
            // (Under a story scene, the paper, all over: the ship's camera draws only the upper part.)
            var paper = MakeCamera("Paper", ui.depth - 2, LandLayer, 36);
            paper.cullingMask = 0;
            paper.clearFlags = CameraClearFlags.SolidColor;
            paper.backgroundColor = Look.Paper;
            paperCam = paper;
        }
        // The ship, the Captain on it, the crew aboard.
        ship = new GameObject("Ship scene").transform;
        ship.SetParent(transform, false);
        ship.localScale = Flip;
        BuildShip();
    }

    void BuildLand()
    {
        // The land: the menu's own (one seed, a straight line west to east), drawn soft.
        land = new GameObject("Land").transform;
        land.SetParent(transform, false);
        land.localScale = Flip;
        var strip = new Strip();
        for (int i = 0; i < 13; i++) strip.Nodes.Add(new double[] { -6 + i, 0 });
        for (int i = 1; i < 13; i++) strip.Routes.Add(new double[] { -7 + i, 0, -6 + i, 0 });
        var shape = NebulaGeometry.BuildNebula(77017, strip);
        var g = new GameObject("Ground");
        g.layer = LandLayer;
        g.transform.SetParent(land, false);
        var groundMesh = CampaignView.GroundMesh(shape.Ground);
        g.AddComponent<MeshFilter>().sharedMesh = groundMesh;
        ground = Mats.Make("Ground");
        ground.SetFloat("_Soft", 1);
        g.AddComponent<MeshRenderer>().sharedMaterial = ground;
        // (Where the land has broken away, the starry abyss beneath it, as on the campaign's map.)
        abyss = CampaignView.AddAbyss(g, groundMesh);
        abyss.SetFloat("_Soft", 1);
        landCam = MakeCamera("Land camera", ui.depth - 2, LandLayer, 36);
        landCam.clearFlags = CameraClearFlags.SolidColor;
        landCam.backgroundColor = Look.Paper;
        // The sunrise on the horizon behind the Stellari: its glow and the bright line along the horizon through it.
        sunGlow = SunPart("Sunrise", 0);
        sunLine = SunPart("Sunrise line", 1);
    }

    // ---- The sunrise (campaign.ts showBase, styles.css .cs-sunrise) ----

    /// <summary>Where the sunrise stands (the web's units): on the horizon ahead, at the Stellari, a little over the land.</summary>
    public static readonly Vector3 SunriseAt = new Vector3(6.2f, 0.3f, -1.2f);
    /// <summary>Where the Stellari stands on the land's far end (the web's x, z), to the right on the horizon.</summary>
    static readonly Vector2 Stellari = new Vector2(6.2f, -1.2f);
    (Transform t, Material m) sunGlow, sunLine;

    (Transform, Material) SunPart(string name, float kind)
    {
        var m = Mats.Make("Sunrise");
        m.SetFloat("_Kind", kind);
        m.renderQueue = 1000;
        var go = new GameObject(name) { layer = LandLayer };
        go.transform.SetParent(transform, false);
        go.AddComponent<MeshFilter>().sharedMesh = Quad;
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = m;
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        return (go.transform, m);
    }

    /// <summary>
    /// The sunrise as `cam` sees it now, at `at` (a point in this world), `alpha` shown, on `layer` (the land's; the
    /// run's own camera's while setting out): its glow min(70vmin, 520) CSS pixels across, its line min(150vmin, 1400)
    /// by 10, both centred on the point wherever it stands on the screen.
    /// </summary>
    public void Sunrise(Camera cam, Vector3 at, float alpha, int layer)
    {
        if (sunGlow.t == null || cam == null) return;
        var size = Css.Size;
        float vmin = Mathf.Min(size.x, size.y) / 100, px = Css.PixelRatio * Css.Zoom;
        // (World units a screen pixel, at the point's depth.)
        float depth = Vector3.Dot(at - cam.transform.position, cam.transform.forward);
        float unit = 2 * Mathf.Max(0.01f, depth) * Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad) / Mathf.Max(1, cam.pixelHeight);
        foreach (var (part, w, h) in new[] { (sunGlow, Mathf.Min(70 * vmin, 520), Mathf.Min(70 * vmin, 520)), (sunLine, Mathf.Min(150 * vmin, 1400), 10f) })
        {
            part.t.gameObject.layer = layer;
            bool on = alpha > 0.001f && depth > 0;
            if (part.t.gameObject.activeSelf != on) part.t.gameObject.SetActive(on);
            part.t.position = at;
            part.t.rotation = cam.transform.rotation;
            part.t.localScale = new Vector3(w / 2 * px * unit, h / 2 * px * unit, 1);
            part.m.SetFloat("_Alpha", alpha);
        }
    }

    // ---- Opening afresh (campaign.ts showBase's menuIntro, base3d.ts arrive) ----

    // (Made for the menu, and not yet shown: it comes in as the menu opens afresh.)
    bool introPending;
    // (Frames drawn of the land so far while hidden; -1: not waiting.)
    int introFrames = -1;
    float? shownAt, entryAt;
    bool entryHeld;
    /// <summary>How long the ship takes to fly in (seconds).</summary>
    const float Entry = 9;
    /// <summary>The menu's fade in (.cs-base's transition, MENU_FADE_MS: 0.9 s, ease-out).</summary>
    const float FadeIn = 0.9f;

    /// <summary>
    /// The menu opened afresh: the scene hidden while its land is made and drawn (three frames of it), the ship held off
    /// to the left from its first frame; then faded in as the ship flies in from the left over nine seconds.
    /// </summary>
    public bool BeginIntro()
    {
        if (!introPending || !Application.isPlaying) return false;
        introPending = false;
        introFrames = 0;
        entryHeld = true;
        shownAt = entryAt = null;
        return true;
    }

    /// <summary>The scene's own clock (seconds).</summary>
    public float Clock => Now;

    /// <summary>How far the scene is faded in (0 hidden while its land is made; then the 0.9 s ease-out; 1 shown).</summary>
    public float Shown => introFrames >= 0 ? 0 : shownAt == null ? 1 : CampaignMenuPage.EaseOut(Mathf.Clamp01((Now - shownAt.Value) / FadeIn));

    /// <summary>
    /// When the menu's options come in, on the scene's clock: a second after the fade in is done (MENU_FADE_MS + 1000),
    /// the ship still drifting in behind them; never while it is hidden; null: not held at all.
    /// </summary>
    public float? OptionsAt => introFrames >= 0 ? float.MaxValue : shownAt != null ? shownAt.Value + FadeIn + 1 : (float?)null;

    void BuildShip()
    {
        var meta = CampaignView.LoadMeta();
        shipModel = Model("Ship", null);
        Refit();
        captain = Model("Captain", FigureMesh());
        foreach (var id in fixedCrew ?? Meta.ActiveCrew(meta))
            if (CompanionModels.Places.TryGetValue(id, out var pl))
                crew.Add((id, pl, Model(id, ModelMesh.Of("companion:" + id, () => CompanionModels.CompanionModel(id)))));
        shipCam = MakeCamera("Ship camera", ui.depth - 1, ShipLayer, 32);
        shipCam.clearFlags = CameraClearFlags.Depth;
        if (story)
        {
            shipCam.clearFlags = CameraClearFlags.SolidColor;
            shipCam.backgroundColor = Look.Paper;
            shipCam.rect = new Rect(0, 0.36f, 1, 0.64f);
        }
        Pose();
    }

    // (How far the land's camera has glided down to the Stellari, and the ship's turned from the ship toward it; when
    // the scene was last posed.)
    float toward, research, lastPose;

    double level;
    Dictionary<string, V3> slots;
    Matrix4x4 shipNow = Matrix4x4.identity;
    float calm;

    /// <summary>The ship as fitted and levelled now (rebuilt: a part fitted is built onto it at once).</summary>
    public void Refit()
    {
        var spec = fixedSpec ?? Spec(CampaignView.LoadMeta());
        level = spec.Level;
        build = CaptainShip.CaptainShipModel(spec);
        slots = CaptainShip.SlotSpots(level);
        var mf = shipModel.GetComponent<MeshFilter>();
        if (mf.sharedMesh != null && mf.sharedMesh.name == "") Mats.Kill(mf.sharedMesh);
        mf.sharedMesh = ModelMesh.From(build.Mesh);
        // (Its engines and smoke as fitted and worn now.)
        foreach (var g in flames.Concat(cores).Concat(puffs)) { Mats.Kill(g.m); Mats.Kill(g.t.gameObject); }
        flames.Clear();
        cores.Clear();
        puffs.Clear();
        foreach (var _ in build.Engines)
        {
            flames.Add(Glow("Flame", new Color(1f, 0.5f, 0.15f)));
            cores.Add(Glow("Flame core", new Color(1f, 0.85f, 0.55f)));
        }
        foreach (var _ in build.Smoke)
            for (int i = 0; i < 6; i++) puffs.Add(Glow("Smoke", new Color(0.42f, 0.43f, 0.47f)));
    }

    /// <summary>A soft disc facing the camera (MapSprite's glow), on the ship's layer.</summary>
    (Transform, Material) Glow(string name, Color c)
    {
        var m = Mats.Make("MapSprite", c);
        m.SetFloat("_Kind", 0);
        m.SetFloat("_Alpha", 0);
        m.renderQueue = 3001;
        var go = new GameObject(name) { layer = ShipLayer };
        go.transform.SetParent(ship, false);
        go.AddComponent<MeshFilter>().sharedMesh = Quad;
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = m;
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        return (go.transform, m);
    }

    /// <summary>A quad of corners -1 to 1, stood up to face the eye by its shader.</summary>
    static UMesh Quad
    {
        get
        {
            if (quad != null) return quad;
            quad = new UMesh { name = "glow" };
            quad.vertices = new[] { new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(1, 1, 0), new Vector3(-1, 1, 0) };
            quad.triangles = new[] { 0, 1, 2, 0, 2, 3 };
            quad.bounds = new Bounds(Vector3.zero, Vector3.one * 2);
            return quad;
        }
    }

    /// <summary>Where a part's slot is on the screen now (pixels), as the ship moves.</summary>
    public Vector3? SlotScreen(string slot)
    {
        if (slots == null || !slots.TryGetValue(slot, out var v)) return null;
        var local = shipNow.MultiplyPoint(B(v.X, v.Y, v.Z));
        var p = shipCam.WorldToScreenPoint(ship.TransformPoint(local));
        return p.z > 0 ? p : (Vector3?)null;
    }

    public Camera ShipCamera => shipCam;

    /// <summary>
    /// A point of the ship's box (x along, y across, z up) on the screen as the ship's camera frames the whole ship at
    /// rest on it (base3d.ts shipScreen: never as it sways, nor as the camera moves to a section), as fractions of the
    /// screen from its top left; null if behind the camera.
    /// </summary>
    Matrix4x4 capNow = Matrix4x4.identity;

    /// <summary>Where a section is on the ship (base3d.ts spot): the Captain's chest, one of the crew's, the research bay, the hull.</summary>
    Vector3 Spot(string zone)
    {
        if (zone == "captain") return capNow.MultiplyPoint(B(20, 12, 30));
        if (zone == "research") return shipNow.MultiplyPoint(B(5.5, 12, 12));
        if (zone != "hangar") return crewM.TryGetValue(zone, out var m) ? m.MultiplyPoint(B(20, 12, zone == "engineer" ? 20 : zone == "shade" || zone == "seer" ? 22 : 28)) : capNow.MultiplyPoint(B(20, 12, 30));
        return shipNow.MultiplyPoint(B(17, 12, 5));
    }

    /// <summary>
    /// The section under a point of the screen (base3d.ts zoneAt; pixels, from its bottom left), if any: within its reach
    /// round its spot as the ship's camera sees it (the hull's a wide, flat ellipse), the smallest winning.
    /// </summary>
    public string ZoneAt(Vector2 p)
    {
        if (ship == null || shipCam == null || !shipModel.gameObject.activeInHierarchy) return null;
        string best = null;
        float bestK = 1;
        var zones = new List<string> { "captain" };
        zones.AddRange(crew.Select(c => c.id));
        zones.Add("research");
        zones.Add("hangar");
        foreach (var z in zones)
        {
            float reach = z == "research" ? 0.38f : z == "hangar" ? 1.9f : 0.32f;
            var spot = Spot(z);
            var c = shipCam.WorldToScreenPoint(ship.TransformPoint(spot));
            var e = shipCam.WorldToScreenPoint(ship.TransformPoint(spot - new Vector3(0, reach, 0)));
            if (c.z <= 0 || e.z <= 0) continue;
            float r = Mathf.Abs(e.y - c.y);
            if (r < 1e-3f) continue;
            float k = Vector2.Distance(p, c) / r;
            float flat = z == "hangar" ? Mathf.Sqrt(Mathf.Pow((p.x - c.x) / (r * 2.6f), 2) + Mathf.Pow((p.y - c.y) / (r * 0.75f), 2)) : k;
            if (flat < bestK)
            {
                bestK = flat;
                best = z;
                if (z != "hangar") break;
            }
        }
        return best;
    }

    public Vector2? ShipViewport(float x, float y, float z)
    {
        float aspect = Mathf.Max(0.3f, ui != null ? ui.aspect : 1.6f), half = Mathf.Tan(16 * Mathf.Deg2Rad);
        // (goal()'s whole ship: back far enough for all of it, a little to the left.)
        float dist = Mathf.Max(3.7f / (half * aspect), 2.4f / half);
        const float yaw = -0.52f, pitch = 0.1f, off = -0.1f;
        var target = new Vector3(-0.3f, 0.74f, 0);
        var eye = target + new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), Mathf.Sin(pitch), Mathf.Cos(yaw) * Mathf.Cos(pitch)) * dist;
        // (In the web's own axes: lookAt's right, up and forward; the projection sheared by off.)
        var f = (target - eye).normalized;
        var r = Vector3.Cross(f, Vector3.up).normalized;
        var u = Vector3.Cross(r, f);
        var d = B(x, y, z) * 4.2f - eye;
        float vz = Vector3.Dot(d, f);
        if (vz <= 1e-4f) return null;
        float nx = Vector3.Dot(d, r) / (vz * half * aspect) + 2 * off, ny = Vector3.Dot(d, u) / (vz * half);
        return new Vector2((nx + 1) / 2, (1 - ny) / 2);
    }

    static CaptainShipSpec Spec(MetaState meta)
    {
        var fitted = meta.Fitted ?? new Dictionary<string, string>();
        var rarity = fitted.Where(kv => kv.Value != null).ToDictionary(kv => kv.Key, kv => Parts.ShipPart(kv.Value)?.Rarity ?? "dwarf");
        var b = Captain.CaptainBuild(Meta.CaptainCard(meta));
        int level = b != null ? b.Attack + b.Stability + b.Cheaper + Mathf.Max(0, b.Abilities.Count - 1) + (b.Lead != null ? 2 : 0) : 0;
        return new CaptainShipSpec { Parts = fitted.Where(kv => kv.Value != null).ToDictionary(kv => kv.Key, kv => kv.Value), Rarity = rarity, Level = level };
    }

    Transform Model(string name, UMesh mesh)
    {
        var go = ModelMesh.Make(name, mesh, ship, new Color(0.86f, 0.62f, 0.26f));
        go.layer = ShipLayer;
        var m = go.GetComponent<MeshRenderer>().sharedMaterial;
        m.SetFloat("_Flip", -1);
        m.SetFloat("_Burn", 0.6f);
        return go.transform;
    }

    Camera MakeCamera(string name, float depth, int layer, float fov)
    {
        var c = new GameObject(name).AddComponent<Camera>();
        c.transform.SetParent(transform, false);
        c.depth = depth;
        c.cullingMask = 1 << layer;
        c.fieldOfView = fov;
        c.nearClipPlane = 0.05f;
        c.farClipPlane = 140;
        c.allowHDR = false;
        return c;
    }

    /// <summary>Its cameras, drawn before the page's own (the land, then the ship).</summary>
    public Camera[] Cameras => landCam != null ? new[] { landCam, shipCam } : new[] { paperCam, shipCam };

    /// <summary>Drawn into a texture (the editor's screenshots): its cameras with the page's.</summary>
    public void Into(RenderTexture rt)
    {
        foreach (var c in Cameras) c.targetTexture = rt;
        if (story) shipCam.rect = new Rect(0, 0.36f, 1, 0.64f);
        Pose();
    }

    /// <summary>The Captain's mesh: his corners as he stands, his place in his texture, material 11 (the ship shader paints him).</summary>
    UMesh FigureMesh()
    {
        figure = new CaptainFigure();
        int n = figure.Count;
        figurePos = new Vector3[n];
        figureNor = new Vector3[n];
        var col = new Color[n];
        var uv = new Vector2[n];
        for (int i = 0; i < n; i++)
        {
            col[i] = new Color(figure.Uv[i * 2], figure.Uv[i * 2 + 1], 0, 1);
            uv[i] = new Vector2(11, 0);
        }
        figureMesh = new UMesh { name = "captain", indexFormat = n > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
        figureMesh.MarkDynamic();
        Stand(Now);
        figureMesh.colors = col;
        figureMesh.uv = uv;
        figureMesh.triangles = figure.Tris;
        return figureMesh;
    }

    /// <summary>The Captain as he stands at this moment: breathing, his weight shifting, looking about.</summary>
    void Stand(float t)
    {
        figure.Pose(t);
        var p = figure.Pos;
        var q = figure.Nor;
        for (int i = 0; i < figurePos.Length; i++)
        {
            figurePos[i] = new Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
            figureNor[i] = new Vector3(q[i * 3], q[i * 3 + 1], q[i * 3 + 2]);
        }
        figureMesh.vertices = figurePos;
        figureMesh.normals = figureNor;
    }

    void OnDestroy()
    {
        Mats.Kill(figureMesh);
        Mats.Kill(sunGlow.m);
        Mats.Kill(sunLine.m);
        if (ui == null) return;
        ui.clearFlags = uiClear;
        ui.cullingMask = uiMask;
    }

    void LateUpdate()
    {
        if (ui == null) return;
        // (Opening afresh: shown once its land has been drawn three times, the ship setting off as it fades in.)
        if (introFrames >= 0 && ++introFrames > 3)
        {
            introFrames = -1;
            shownAt = entryAt = Now;
        }
        Pose();
    }

    float Now => At ?? (Application.isPlaying ? Time.realtimeSinceStartup - t0 : 30);

    // ---- The web's matrices (base3d.ts), in its own axes ----

    /// <summary>A point of the ship's box (x along, y across, z up) in the model's own axes.</summary>
    static Vector3 B(double x, double y, double z) => new Vector3((float)(x - 20) / 40, (float)z / 40, (float)(y - 12) / 40);
    static Matrix4x4 T(Vector3 v) => Matrix4x4.Translate(v);
    static Matrix4x4 S(float s) => Matrix4x4.Scale(Vector3.one * s);
    static Matrix4x4 RX(float a) => Matrix4x4.Rotate(Quaternion.AngleAxis(a * Mathf.Rad2Deg, Vector3.right));
    static Matrix4x4 RY(float a) => Matrix4x4.Rotate(Quaternion.AngleAxis(a * Mathf.Rad2Deg, Vector3.up));
    static Matrix4x4 RZ(float a) => Matrix4x4.Rotate(Quaternion.AngleAxis(a * Mathf.Rad2Deg, Vector3.forward));

    static void Place(Transform t, Matrix4x4 m)
    {
        t.localPosition = m.GetColumn(3);
        t.localRotation = m.rotation;
        t.localScale = m.lossyScale;
    }

    /// <summary>A camera at the web's eye looking at its target (its axes flipped into this world's).</summary>
    static void Aim(Camera c, Vector3 eye, Vector3 target)
    {
        var e = Vector3.Scale(eye, Flip);
        c.transform.position = e;
        c.transform.rotation = Quaternion.LookRotation(Vector3.Scale(target, Flip) - e, Vector3.up);
    }

    void Pose()
    {
        float t = Now;
        // (Eased by the time since the last pose, as the web's frames are: never more than a tenth of a second.)
        float step = Application.isPlaying ? Mathf.Clamp(t - lastPose, 0, 0.1f) : 0;
        lastPose = t;
        // The land: the flight along it, west to east and round again; the land breaking away behind.
        float k = (t % Loop) / Loop;
        float fx = -4.6f + 3 * k;
        if (landCam != null)
        {
            ground.SetFloat("_Gone", fx - 1.1f);
            ground.SetFloat("_Crack", fx - 0.5f);
            abyss.SetFloat("_Gone", fx - 1.1f);
            // (Faded out and back as the flight comes round to its start: the land whole again; the sunrise with it.)
            float whole = Mathf.Min(1, Mathf.Min(k, 1 - k) * Loop / 1.5f);
            ground.SetFloat("_Fade", whole);
            abyss.SetFloat("_Fade", whole);
            // Enlightenment open: the camera glides down toward the horizon, where the skill tree's Stellari comes in.
            toward += ((zone == "research" ? 1 : 0) - toward) * (1 - Mathf.Exp(-step * 2.4f));
            float e = toward * toward * (3 - 2 * toward);
            // (The ship tab open: the land's camera swings up over the ship as the ship's own does.)
            float h = calm * calm * (3 - 2 * calm);
            float yaw = -0.85f + 0.52f * h, pitch = 0.2f + 1.05f * h, dist = 3.4f - 0.6f * h;
            var target = new Vector3(fx, 0, 0.15f);
            target += (new Vector3(Stellari.x, 0.42f, Stellari.y) - target) * e;
            yaw += (-0.85f - yaw) * e;
            pitch += (0.08f - pitch) * e;
            dist += (1.5f - dist) * e;
            var dir = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), Mathf.Sin(pitch), Mathf.Cos(yaw) * Mathf.Cos(pitch));
            Aim(landCam, target + dir * dist, target);
            // The sunrise: on the horizon ahead, wherever it stands on the screen now.
            Sunrise(landCam, land.TransformPoint(SunriseAt), whole, LandLayer);
        }

        // The ship drifts on: rising and falling, rolling and pitching a little.
        const float SS = 4.2f;
        // (In the hangar, looked down on as parts are fitted, it rides almost still: its slots held under the finger.)
        float dt = Application.isPlaying ? Mathf.Min(0.2f, Time.deltaTime) : 1;
        calm += ((zone == "hangar" ? 1 : 0) - calm) * Mathf.Min(1, dt * 2.6f);
        float sway = 1 - 0.8f * calm;
        // (Flying in: off to the left, drifting gently to its place, bobbing as it idles from the first; held there
        // until the scene is shown.)
        float ex = 0, ey = 0, tip = 0;
        if (entryHeld)
        {
            float ek = entryAt == null ? 0 : Mathf.Clamp01((t - entryAt.Value) / Entry);
            float left = 1 - Mathf.Sin(Mathf.PI / 2 * ek);
            ex = -4 * left;
            ey = 0.4f * left;
            tip = -0.03f * left;
            if (ek >= 1) entryHeld = false;
        }
        var shipM = T(new Vector3(ex, ey + 0.05f * Mathf.Sin(t * 0.7f) * sway, 0)) * RZ(tip) * RX(0.035f * Mathf.Sin(t * 0.5f) * sway) * RZ(0.025f * Mathf.Sin(t * 0.6f + 1) * sway) * S(SS);
        shipNow = shipM;
        Place(shipModel, shipM);
        // The engines burning at their bells' mouths, flickering; the worn ship's smoke rising from its wounds, drifting aft.
        bool shown = shipModel.gameObject.activeSelf;
        for (int i = 0; i < flames.Count && i < build.Engines.Count; i++)
        {
            var e = build.Engines[i];
            var mouth = shipModel.TransformPoint(new Vector3((float)e.X, (float)e.Y, (float)e.Z));
            float flick = 0.9f + 0.1f * Mathf.Sin(t * 23 + i * 1.7f) * Mathf.Sin(t * 13 + i);
            foreach (var (g, size, a) in new[] { (flames[i], 0.55f, 0.95f), (cores[i], 0.26f, 1f) })
            {
                if (g.t.gameObject.activeSelf != shown) g.t.gameObject.SetActive(shown);
                g.t.position = mouth;
                g.t.localScale = Vector3.one * size * flick;
                g.m.SetFloat("_Alpha", a);
            }
        }
        var aft = shipModel.TransformDirection(Vector3.left).normalized;
        int pi = 0;
        foreach (var v in build.Smoke)
        {
            var wp = shipModel.TransformPoint(new Vector3((float)v.X, (float)v.Y, (float)v.Z));
            for (int i = 0; i < 6 && pi < puffs.Count; i++, pi++)
            {
                var (g, m) = puffs[pi];
                if (g.gameObject.activeSelf != shown) g.gameObject.SetActive(shown);
                float age = (t * 0.45f + i / 6f) % 1;
                g.position = wp + aft * age * 0.5f + Vector3.up * age * 0.7f;
                g.localScale = Vector3.one * (0.1f + age * 0.3f);
                m.SetFloat("_Alpha", 0.5f * (1 - age) * Mathf.Min(1, age * 6));
            }
        }
        // The Captain on the foredeck, facing ahead and a little toward us; the tails and scarf streaming.
        var at = B(build.Captain.X, build.Captain.Y, build.Captain.Z);
        var foot = B(20, 12, 0);
        // (Four fifths the size his old figure stood.)
        var capM = shipM * T(at) * RY(1.3f) * S(0.8f * 0.7f / SS) * T(new Vector3(-foot.x, 0, -foot.z));
        capNow = capM;
        Place(captain, capM);
        if (captain.gameObject.activeSelf) Stand(t);
        // The companions, each in their place: on the near rail, over the sensor dish, or flying alongside.
        foreach (var (id, pl, tr) in crew)
        {
            float kk = (float)pl.Size / SS;
            var on = pl.On != "air" ? build.CrewAt(pl) : default;
            var spot = pl.On != "air" ? B(on.X, on.Y, on.Z)
                : B(pl.X + 0.5 * Mathf.Sin(t * 0.37f), pl.Y + 0.3 * Mathf.Sin(t * 0.29f + 2), pl.Z + 0.9 * Mathf.Sin(t * 0.83f + 1.7f));
            var o = B(pl.Anchor.X, pl.Anchor.Y, pl.Anchor.Z);
            var local = RY((float)pl.Turn) * S(kk) * T(-o);
            crewM[id] = pl.On == "air" ? S(SS) * T(spot) * RX(0.06f * Mathf.Sin(t * 0.61f)) * RZ(0.07f * Mathf.Sin(t * 0.83f + 2.6f)) * local : shipM * T(spot) * local;
            Place(tr, pl.On == "air" ? S(SS) * T(spot) * RX(0.06f * Mathf.Sin(t * 0.61f)) * RZ(0.07f * Mathf.Sin(t * 0.83f + 2.6f)) * local : shipM * T(spot) * local);
        }

        // Whoever is alongside: overtaking from astern and slowing to hold beside the ship, bobbing and rolling.
        if (visitor != null)
        {
            float vk = Mathf.Min(1, (t - visitorT0) / 3.2f);
            float come = 1 - Mathf.Pow(1 - vk, 3);
            var va = new Vector3(-14 + (4.9f + 14) * come, 1.35f + 0.07f * Mathf.Sin(t * 0.8f + 1), -3.2f);
            Place(visitor, T(va) * RX(0.04f * Mathf.Sin(t * 0.6f)) * RZ(0.03f * Mathf.Sin(t * 0.7f + 2) - 0.06f * (1 - vk)) * visitorLocal);
            visitor.GetComponent<MeshRenderer>().sharedMaterial.SetFloat("_Burn", 0.4f + 0.6f * (1 - vk));
        }

        // The ship's camera: the whole ship, side on and a little from ahead and below, set off to the left; or the
        // Captain, close, in the middle of the left of the screen, low.
        float aspect = Mathf.Max(0.3f, story ? shipCam.aspect : ui.aspect);
        float half = Mathf.Tan(16 * Mathf.Deg2Rad);
        {
            float narrow = Mathf.Min(1, aspect / 1.6f);
            // (One of the crew: their chest, on the figure as it stands, crouches or flies.)
            bool mate = zone != null && crewM.ContainsKey(zone);
            bool cap = zone == "captain" || mate, hangar = zone == "hangar", alongside = visitor != null;
            // (The ship from above: its nose to the right, on the left of the screen beside the hangar's page.)
            // (A story scene: drawn back to take in the ship and whoever is alongside.)
            float dist = alongside ? Mathf.Max(7 / (half * aspect), 3.6f / half) : cap ? 2.3f / narrow : hangar ? 9.2f / narrow : Mathf.Max(3.7f / (half * aspect), 2.4f / half);
            float yaw = (alongside ? -0.36f : cap ? 1.0f : hangar ? 0 : -0.52f) + 0.03f * Mathf.Sin(t * 0.17f), pitch = alongside ? 0.14f : cap ? 0.04f : hangar ? 1.25f : 0.1f;
            float off = alongside || story ? 0 : cap ? -0.29f : hangar ? -0.15f * narrow : -0.1f;
            var target = alongside ? new Vector3(2.1f, 1.25f, -1.5f) : mate ? crewM[zone].MultiplyPoint(B(20, 12, zone == "engineer" ? 20 : zone == "shade" || zone == "seer" ? 22 : 28)) + new Vector3(0, 0.1f, 0)
                : cap ? (Vector3)(capM.MultiplyPoint(B(20, 12, 30))) + new Vector3(0, 0.1f, 0) : hangar ? B(20, 12, 5) * SS : new Vector3(-0.3f, 0.74f, 0);
            // (Enlightenment is the Stellari, out on the land: the camera turns from the ship, which slides away to the
            // left; eased there and back at the camera's own pace, as base3d.ts eases toward its framing.)
            research += ((zone == "research" ? 1 : 0) - research) * (1 - Mathf.Exp(-step * 2.6f));
            if (research > 1e-4f)
            {
                target += (new Vector3(7, 1.4f, -2) - target) * research;
                yaw += (-0.52f + 0.03f * Mathf.Sin(t * 0.17f) - yaw) * research;
                pitch += (0.1f - pitch) * research;
                dist += (6 - dist) * research;
                off += (0 - off) * research;
            }
            var dir = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), Mathf.Sin(pitch), Mathf.Cos(yaw) * Mathf.Cos(pitch));
            Aim(shipCam, target + dir * dist, target);
            shipCam.ResetProjectionMatrix();
            var p = shipCam.projectionMatrix;
            // (Set off centre by shearing the projection: the subject moves aside, its perspective unchanged.)
            p.m02 = -off * 2;
            shipCam.projectionMatrix = p;
        }
    }
}
