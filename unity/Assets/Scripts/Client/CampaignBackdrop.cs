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
    Material ground;
    Transform shipModel, captain, tail;
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
        // (The Captain or one of the crew, alone: everything else covered.)
        bool alone = zone != null && zone != "hangar";
        if (landCam != null) landCam.enabled = !alone;
        shipCam.clearFlags = alone ? CameraClearFlags.SolidColor : CameraClearFlags.Depth;
        shipCam.backgroundColor = Look.Paper;
        shipModel.gameObject.SetActive(!alone);
        captain.gameObject.SetActive(!alone || zone == "captain");
        tail.gameObject.SetActive(!alone || zone == "captain");
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
        g.AddComponent<MeshFilter>().sharedMesh = CampaignView.GroundMesh(shape.Ground);
        ground = Mats.Make("Ground");
        ground.SetFloat("_Soft", 1);
        g.AddComponent<MeshRenderer>().sharedMaterial = ground;
        landCam = MakeCamera("Land camera", ui.depth - 2, LandLayer, 36);
        landCam.clearFlags = CameraClearFlags.SolidColor;
        landCam.backgroundColor = Look.Paper;
    }

    void BuildShip()
    {
        var meta = CampaignView.LoadMeta();
        shipModel = Model("Ship", null);
        Refit();
        captain = Model("Captain", ModelMesh.Of("captain", CaptainModels.CaptainModel));
        tail = Model("Tails", ModelMesh.Of("captain-tails", CaptainModels.StreamerModel));
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

    void OnDestroy()
    {
        if (ui == null) return;
        ui.clearFlags = uiClear;
        ui.cullingMask = uiMask;
    }

    void LateUpdate()
    {
        if (ui != null) Pose();
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
        // The land: the flight along it, west to east and round again; the land breaking away behind.
        float k = (t % Loop) / Loop;
        float fx = -4.6f + 3 * k;
        if (landCam != null)
        {
            ground.SetFloat("_Gone", fx - 1.1f);
            ground.SetFloat("_Crack", fx - 0.5f);
            // (The ship tab open: the land's camera swings up over the ship as the ship's own does.)
            float h = calm * calm * (3 - 2 * calm);
            float yaw = -0.85f + 0.52f * h, pitch = 0.2f + 1.05f * h, dist = 3.4f - 0.6f * h;
            var target = new Vector3(fx, 0, 0.15f);
            var dir = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), Mathf.Sin(pitch), Mathf.Cos(yaw) * Mathf.Cos(pitch));
            Aim(landCam, target + dir * dist, target);
        }

        // The ship drifts on: rising and falling, rolling and pitching a little.
        const float SS = 4.2f;
        // (In the hangar, looked down on as parts are fitted, it rides almost still: its slots held under the finger.)
        float dt = Application.isPlaying ? Mathf.Min(0.2f, Time.deltaTime) : 1;
        calm += ((zone == "hangar" ? 1 : 0) - calm) * Mathf.Min(1, dt * 2.6f);
        float sway = 1 - 0.8f * calm;
        var shipM = T(new Vector3(0, 0.05f * Mathf.Sin(t * 0.7f) * sway, 0)) * RX(0.035f * Mathf.Sin(t * 0.5f) * sway) * RZ(0.025f * Mathf.Sin(t * 0.6f + 1) * sway) * S(SS);
        shipNow = shipM;
        Place(shipModel, shipM);
        // The Captain on the foredeck, facing ahead and a little toward us; the tails and scarf streaming.
        var at = B(32, 12, build.Deck);
        var foot = B(20, 12, 0);
        var capM = shipM * T(at) * RY(1.3f) * S(0.7f / SS) * T(new Vector3(-foot.x, 0, -foot.z));
        Place(captain, capM);
        float gust = 0.08f * Mathf.Sin(t * 2.3f) + 0.04f * Mathf.Sin(t * 5.1f + 1);
        var pivot = B(20, 11, 23);
        Place(tail, capM * T(pivot) * RZ(-gust) * RX(gust * 0.5f) * T(-pivot));
        // The companions, each in their place: on the near rail, over the sensor dish, or flying alongside.
        foreach (var (id, pl, tr) in crew)
        {
            float kk = (float)pl.Size / SS;
            var spot = pl.On == "rail" ? B(pl.X, build.RailY, build.RailZ)
                : pl.On == "dish" ? B(pl.X, pl.Y, build.Dish)
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
            var at = new Vector3(-14 + (4.9f + 14) * come, 1.35f + 0.07f * Mathf.Sin(t * 0.8f + 1), -3.2f);
            Place(visitor, T(at) * RX(0.04f * Mathf.Sin(t * 0.6f)) * RZ(0.03f * Mathf.Sin(t * 0.7f + 2) - 0.06f * (1 - vk)) * visitorLocal);
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
