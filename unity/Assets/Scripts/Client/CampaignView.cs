using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// A run of the campaign (campaign.ts): the map, its systems strung along their routes over the board's paper floor
/// reaching to the horizon, your ship among them; along the top, you (your level), your sun's heat, materials and
/// petals, and the settings. A tap on a system in reach sends the ship there; what it holds shows as it arrives (a
/// find, a station, a battle). Over it, whatever waits on you: the spoils of a battle, a card to choose, a scene.
/// </summary>
public partial class CampaignView : MonoBehaviour
{
    const string Key = "blue-loop:campaign:v6", MetaKey = "blue-loop:runs:v1";
    // (Map units to the scene's: the strip is a few thousand units long, laid out at 300 to one.)
    const float Scale = 1 / 300f;

    public Camera Cam;
    CampaignState state;
    Canvas hud;
    RectTransform top, overlay, sheetRoot;
    Transform world, mapRoot;
    readonly Dictionary<string, Transform> nodes = new Dictionary<string, Transform>();
    Transform ship;
    Vector3 focus, focusGoal;
    float distance = HomeDist, distanceGoal = HomeDist;
    bool flying;
    int storyLine;

    // ---- Saving and the lasting progress ----

    public static CampaignState Saved()
    {
        try
        {
            var s = Store.Read<CampaignState>(Key);
            return s != null && s.Version == 6 && s.Winner == null ? s : null;
        }
        catch { return null; }
    }

    public static bool HasSave => Saved() != null;

    static void Save(CampaignState s)
    {
        if (s != null && s.Winner == null) Store.Write(Key, s);
        else Store.Remove(Key);
    }

    public static MetaState LoadMeta()
    {
        try { return Meta.MigrateMeta(Store.Read<MetaState>(MetaKey) ?? new MetaState()); }
        catch { return Meta.MigrateMeta(new MetaState()); }
    }

    public static void SaveMeta(MetaState m) => Store.Write(MetaKey, m);

    // ---- Making it ----

    public static CampaignView Make(CampaignState s)
    {
        var go = new GameObject("Campaign");
        var v = go.AddComponent<CampaignView>();
        v.state = s;
        v.Build();
        return v;
    }

    /// <summary>A new run: the Captain's, as petals have made them (a card kept from the last comes in with it).</summary>
    public static CampaignState NewRun()
    {
        var meta = LoadMeta();
        var hero = Meta.CaptainCard(meta);
        meta.Kept = null;
        meta.Runs += 1;
        SaveMeta(meta);
        var s = Campaign.Create(new CampaignSetup { Seed = Random.Range(1, int.MaxValue), Captain = hero, Run = Meta.RunBonuses(LoadMeta()) });
        // (The hero's arrival comes first: whatever else the opening brought on waits behind it.)
        s.Story.Queue = s.Story.Queue.Where(q => q.Id == "intro").Concat(s.Story.Queue.Where(q => q.Id != "intro")).ToList();
        return s;
    }

    void Build()
    {
        Cam = new GameObject("Map camera").AddComponent<Camera>();
        Cam.transform.SetParent(transform, false);
        Cam.clearFlags = CameraClearFlags.SolidColor;
        Cam.backgroundColor = new Color(0.957f, 0.953f, 0.937f);
        Cam.fieldOfView = 36;
        Cam.nearClipPlane = 0.1f;
        Cam.farClipPlane = 200;
        world = new GameObject("World").transform;
        world.SetParent(transform, false);
        hud = Hud.Canvas(Cam);
        hud.transform.SetParent(transform, false);
        top = Hud.Rect(hud.transform, "Top");
        Hud.Fill(top);
        overlay = Hud.Rect(hud.transform, "Overlay");
        Hud.Fill(overlay);
        sheetRoot = Hud.Rect(hud.transform, "Sheet");
        Hud.Fill(sheetRoot);
        Sound.Scene("ambient");
        SkipSilentScenes();
        Map();
        var f = Campaign.Flagship(state, state.PlayerId);
        if (f != null) focus = focusGoal = Home(f.NodeId);
        Refresh();
    }

    // (The web's map, laid on its world: MAP_K world units a map pixel, centred; this world is the web's scaled up
    // by G, its z flipped.)
    const float StripWidth = 4.4f;
    static float MapK => StripWidth / Campaign.T.MapWidth;
    static float G => Scale / MapK;
    static readonly string[] GalaxyCodes = { null, "blackHole", "pulsar", "meteors", "nebula", "darkMatter" };
    Material groundMat;
    string groundKey;

    /// <summary>The web's world position of a map point (x, z), in its units.</summary>
    static Vector2 Web(double x, double y) => new Vector2((float)(x - Campaign.T.MapWidth / 2.0) * MapK, (float)(y - Campaign.T.MapHeight / 2.0) * MapK);

    /// <summary>
    /// The ground (nebula3d.ts): this universe's land, its hills rising and falling with the route, channels cleared
    /// along the routes. The first galaxy lies on the campaign menu's own land (a straight line west to east).
    /// </summary>
    void Ground()
    {
        bool menuLand = state.Universe == 1 && state.Rift == null;
        // (Built once a galaxy: after that only its collapse changes.)
        var key = $"{state.Universe}|{state.Rift?.Kind}|{(state.Nodes.Count > 0 ? state.Nodes[0].Name : "")}";
        var old = world.Find("Ground");
        if (old != null && key == groundKey) { Collapse(menuLand); return; }
        if (old != null) Mats.Kill(old.gameObject);
        groundKey = key;
        var strip = new BlueLoop.Models.Strip();
        double seed;
        if (menuLand)
        {
            seed = 77017;
            for (int i = 0; i < 13; i++) strip.Nodes.Add(new double[] { -6 + i, 0 });
            for (int i = 1; i < 13; i++) strip.Routes.Add(new double[] { -7 + i, 0, -6 + i, 0 });
        }
        else
        {
            int sd = unchecked(state.Universe * 7919);
            foreach (var ch in state.Nodes.Count > 0 ? state.Nodes[0].Name ?? "" : "") sd = unchecked((sd ^ ch) * 16777619);
            seed = sd;
            foreach (var n in state.Nodes)
            {
                var w = Web(n.X, n.Y);
                strip.Nodes.Add(new double[] { w.x, w.y, n.Col ?? 0, (n.H ?? 0) * MapK });
            }
            foreach (var n in state.Nodes)
                foreach (var to in n.Links)
                {
                    var m = state.Nodes.FirstOrDefault(x => x.Id == to);
                    if (m == null || string.CompareOrdinal(n.Id, to) >= 0) continue;
                    Vector2 a = Web(n.X, n.Y), b = Web(m.X, m.Y);
                    strip.Routes.Add(new double[] { a.x, a.y, b.x, b.y });
                }
        }
        var shape = BlueLoop.Models.NebulaGeometry.BuildNebula(seed, strip);
        var go = new GameObject("Ground");
        go.transform.SetParent(world, false);
        go.transform.localScale = new Vector3(G, G, -G);
        go.AddComponent<MeshFilter>().sharedMesh = GroundMesh(shape.Ground);
        groundMat = Mats.Make("Ground");
        groundMat.SetFloat("_G", G);
        go.AddComponent<MeshRenderer>().sharedMaterial = groundMat;
        Collapse(menuLand);
    }

    public static Mesh GroundMesh(float[] g)
    {
        const int S = BlueLoop.Models.NebulaGeometry.GroundStride;
        int count = g.Length / S;
        var pos = new Vector3[count];
        var norm = new Vector3[count];
        var bary = new List<Vector3>(count);
        var edge = new List<Vector3>(count);
        var shard = new List<Vector4>(count);
        var prog = new List<Vector2>(count);
        var tris = new int[count];
        for (int i = 0; i < count; i++)
        {
            int o = i * S;
            pos[i] = new Vector3(g[o], g[o + 1], g[o + 2]);
            norm[i] = new Vector3(g[o + 3], g[o + 4], g[o + 5]);
            bary.Add(new Vector3(g[o + 6], g[o + 7], g[o + 8]));
            edge.Add(new Vector3(g[o + 9], g[o + 10], g[o + 11]));
            shard.Add(new Vector4(g[o + 12], g[o + 13], g[o + 14], g[o + 15]));
            prog.Add(new Vector2(g[o + 16], 0));
            tris[i] = i;
        }
        var m = new Mesh { indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
        m.vertices = pos;
        m.normals = norm;
        m.SetUVs(0, bary);
        m.SetUVs(1, edge);
        m.SetUVs(2, shard);
        m.SetUVs(3, prog);
        m.triangles = tris;
        // (Falling shards drop well below the land: never culled as they go.)
        m.RecalculateBounds();
        var b = m.bounds;
        b.Expand(new Vector3(0, 30, 0));
        m.bounds = b;
        return m;
    }

    /// <summary>
    /// Instability (setCollapse): the land gone up to where the collapsed columns end, cracked up to the collapsing.
    /// On the menu's land, by how far east each column's systems stand.
    /// </summary>
    void Collapse(bool menuLand)
    {
        if (groundMat == null) return;
        float Edge(System.Func<CampaignNode, bool> f)
        {
            var cols = state.Nodes.Where(f).Select(n => n.Col ?? 0).ToList();
            return cols.Count > 0 ? cols.Max() + 0.5f : -50;
        }
        float gone = Edge(n => n.Collapsed == true);
        float crack = Mathf.Max(gone, Edge(n => n.Collapsing == true));
        if (menuLand)
        {
            float colX = Campaign.T.ColGap * MapK;
            float? Xs(int k)
            {
                var ns = state.Nodes.Where(n => (n.Col ?? 0) == k && n.Challenge == null).ToList();
                return ns.Count > 0 ? ns.Average(n => Web(n.X, n.Y).x) : (float?)null;
            }
            float ColX(float c)
            {
                if (c < -9) return c;
                int k = Mathf.FloorToInt(c);
                float f = c - k;
                float a = Xs(k) ?? (Xs(0) ?? 0) + k * colX, b = Xs(k + 1) ?? a + colX;
                return a + (b - a) * f;
            }
            gone = Mathf.Max(ColX(gone), -50);
            crack = Mathf.Max(ColX(crack), -50);
        }
        groundMat.SetFloat("_Gone", gone);
        groundMat.SetFloat("_Crack", crack);
        groundMat.SetFloat("_Galaxy", System.Array.IndexOf(GalaxyCodes, state.Galaxy) is int g && g > 0 ? g : 0);
    }

    // The camera's heading (yaw -0.95 rad, its eye toward the strip's near end), and text laid flat to read from it.
    const float CamYaw = -0.95f, CamPitch = 0.62f;
    static float ViewYaw => -CamYaw * Mathf.Rad2Deg;
    static Quaternion Facing => Quaternion.Euler(90, ViewYaw, 0);
    /// <summary>Along the ground toward the camera.</summary>
    static Vector3 Toward => new Vector3(Mathf.Sin(CamYaw), 0, -Mathf.Cos(CamYaw));

    /// <summary>How far off the camera rests (nebula3d.ts's home: the strip's width fitted to the view, a little in).</summary>
    static float HomeDist => Mathf.Max(2.4f, (StripWidth / 2 + 0.3f) / Mathf.Tan(18 * Mathf.Deg2Rad) * 0.6f) * 0.8f * G;

    /// <summary>What the camera looks at following the ship at a system: a little ahead of it, so it sits low and to the left.</summary>
    Vector3 Home(string id)
    {
        var n = Campaign.NodeById(state, id);
        var f = Web(n.X, n.Y);
        float dist = HomeDist / G;
        float reach = StripWidth / 2 - dist * 0.35f;
        float x = Mathf.Clamp(f.x + dist * 0.28f, -reach, reach);
        return new Vector3(x * G, 0, -(0.1f + f.y * 0.35f) * G);
    }

    Vector3 NodePos(string id)
    {
        var n = Campaign.NodeById(state, id);
        var w = Web(n.X, n.Y);
        return new Vector3(w.x * G, (float)(n.H ?? 0) * Scale, -w.y * G);
    }

    // ---- The map: its systems and routes ----

    void Map()
    {
        if (mapRoot != null) Mats.Kill(mapRoot.gameObject);
        nodes.Clear();
        mapRoot = new GameObject("Map").transform;
        mapRoot.SetParent(world, false);
        Ground();
        // The routes: each once.
        foreach (var n in state.Nodes.Where(n => n.Vanished != true))
            foreach (var to in n.Links)
                if (string.CompareOrdinal(n.Id, to) < 0 && state.Nodes.Any(x => x.Id == to && x.Vanished != true)) Route(NodePos(n.Id), NodePos(to), $"{n.Id}|{to}");
        foreach (var n in state.Nodes.Where(n => n.Vanished != true)) MakeSystem(n);
        ship = MakeShip();
        ship.SetParent(mapRoot, false);
        var f = Campaign.Flagship(state, state.PlayerId);
        if (f != null) ship.localPosition = ShipSpot(f.NodeId);
        Galaxy();
    }

    void Route(Vector3 a, Vector3 b, string name)
    {
        var go = new GameObject("Route " + name);
        go.transform.SetParent(mapRoot, false);
        var mf = go.AddComponent<MeshFilter>();
        var mr = go.AddComponent<MeshRenderer>();
        var d = b - a;
        var side = Vector3.Cross(d.normalized, Vector3.up) * 0.16f;
        var m = new Mesh();
        m.vertices = new[] { a - side, a + side, b + side, b - side };
        m.uv = new[] { new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0) };
        m.triangles = new[] { 0, 1, 2, 0, 2, 3 };
        m.RecalculateBounds();
        mf.sharedMesh = m;
        mr.sharedMaterial = Mats.Make("Route", Color.white);
    }

    /// <summary>A system: a pearl star, a ring where it stands in reach (and round where your ship is), its name when focused.</summary>
    void MakeSystem(CampaignNode n)
    {
        var go = new GameObject(n.Id);
        go.transform.SetParent(mapRoot, false);
        go.transform.localPosition = NodePos(n.Id);
        nodes[n.Id] = go.transform;
        var star = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Mats.Kill(star.GetComponent<Collider>());
        star.name = "Star";
        star.transform.SetParent(go.transform, false);
        float r = n.Heart == true ? 0.42f : 0.3f;
        star.transform.localScale = Vector3.one * r;
        star.GetComponent<Renderer>().sharedMaterial = Mats.Make("Planet", n.Heart == true ? new Color(0.86f, 0.9f, 1f) : new Color(0.93f, 0.93f, 0.95f));
        var col = go.AddComponent<SphereCollider>();
        col.radius = 0.45f;
        go.AddComponent<NodeTag>().Id = n.Id;
        // (Its rings: reach, and where you are; set by Refresh.)
        var ring = Mats.Flat("Ring", go.transform, Mats.Make("Soft", new Color(0.5f, 0.55f, 0.65f, 0)), 0.9f, 0.9f, -0.12f);
        ring.sharedMaterial.SetFloat("_Aspect", 1);
        ring.sharedMaterial.SetFloat("_Size", 0.4f);
        ring.sharedMaterial.SetFloat("_Radius", 0.4f);
        ring.sharedMaterial.SetFloat("_Soft", 0.006f);
        ring.sharedMaterial.SetFloat("_Ring", 1);
        ring.sharedMaterial.renderQueue = 3050;
        var name = Mats.FlatText("Name", go.transform, "", 2.2f, Look.InkSoft, true, 500, 14);
        name.transform.localPosition = Toward * 0.45f + Vector3.up * 0.03f;
        name.transform.localRotation = Facing;
        name.gameObject.SetActive(false);
        // A station or a lab: its model hanging beside the star (nebula-objects.ts props).
        if (n.Station?.Kind == "armory" || n.Station?.Kind == "research")
        {
            var kind = n.Station.Kind == "armory" ? BlueLoop.Models.PropKind.Station : BlueLoop.Models.PropKind.Lab;
            var prop = ModelMesh.Make(n.Station.Kind, ModelMesh.Of("prop:" + kind, () => BlueLoop.Models.Ship3d.PropModel3d(kind)), go.transform);
            prop.transform.localPosition = new Vector3(0.45f, 0.35f, 0.35f);
            prop.transform.localScale = Vector3.one * 0.5f;
            prop.AddComponent<Spin>();
        }
        // A station or a story waiting there: a mark beside it.
        string mark = n.Station?.Kind == "armory" ? "STATION" : n.Station?.Kind == "research" ? "LAB" : n.Heart == true ? "WORMHOLE" : null;
        if (mark != null)
        {
            var t = Mats.FlatText("Mark", go.transform, mark, 1.6f, Look.InkFaint, true, 500, 18);
            t.transform.localPosition = -Toward * 0.42f + Vector3.up * 0.03f;
            t.transform.localRotation = Facing;
        }
    }

    /// <summary>The Captain's ship as the map draws it (campaign.ts captainSpec): the parts fitted for this run (and their rarities), the Captain's level, the crew aboard.</summary>
    BlueLoop.Models.CaptainShipSpec ShipSpec()
    {
        var fitted = state.Run?.Ship?.Fitted ?? new Dictionary<string, string>();
        var rarity = fitted.ToDictionary(kv => kv.Key, kv => Parts.ShipPart(kv.Value)?.Rarity ?? "dwarf");
        var general = Campaign.Flagship(state, state.PlayerId)?.General;
        var b = general != null ? Captain.CaptainBuild(general) : null;
        int level = b != null ? b.Attack + b.Stability + b.Cheaper + Mathf.Max(0, b.Abilities.Count - 1) + (b.Lead != null ? 2 : 0) : 0;
        return new BlueLoop.Models.CaptainShipSpec { Parts = new Dictionary<string, string>(fitted), Rarity = rarity, Level = level, Crew = Campaign.CrewInDeck(state) };
    }

    /// <summary>Your ship: the Captain's own model (captain-ship.ts), the Captain on its deck, its engines burning.</summary>
    Transform MakeShip()
    {
        var root = new GameObject("Ship").transform;
        var model = ModelMesh.Make("Captain's ship", ModelMesh.CaptainShipMesh(ShipSpec()), root);
        model.transform.localScale = Vector3.one * 0.9f;
        return root;
    }

    /// <summary>Where your ship rests at a system: beside it, a little off the star.</summary>
    Vector3 ShipSpot(string nodeId) => NodePos(nodeId) + new Vector3(-0.35f, 0.32f, 0.25f);

    /// <summary>The galaxy's name and what it does, laid on the floor by the strip's start.</summary>
    void Galaxy()
    {
        if (state.Galaxy == null || Campaign.D.Galaxies == null || !Campaign.D.Galaxies.TryGetValue(state.Galaxy, out var g)) return;
        // (Laid along the strip's near side, reading west to east, from its first system.)
        var ps = state.Nodes.Where(n => n.Vanished != true).Select(n => NodePos(n.Id)).ToList();
        var at = new Vector3(ps.Min(p => p.x) - 0.6f, 0.03f, ps.Min(p => p.z) - 1.1f);
        var name = Mats.FlatText("Galaxy", mapRoot, g.Name.ToUpperInvariant(), 3.2f, Look.InkSoft, true, 400, 30, TextAlignmentOptions.TopLeft);
        name.rectTransform.pivot = new Vector2(0, 1);
        name.rectTransform.sizeDelta = new Vector2(14, 1);
        name.transform.localPosition = at;
        var text = Mats.FlatText("Galaxy words", mapRoot, g.Text, 1.5f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        text.fontStyle = FontStyles.Italic;
        text.textWrappingMode = TextWrappingModes.Normal;
        text.rectTransform.pivot = new Vector2(0, 1);
        text.rectTransform.sizeDelta = new Vector2(9, 2f);
        text.transform.localPosition = at + new Vector3(0, 0, -0.75f);
    }

    // ---- The view: following the ship, the player's drags and zooms ----

    Vector3 dragFrom;
    bool dragging;

    void Update()
    {
        Camera();
        if (flying) return;
        if (overlay.childCount > 0 || sheetRoot.childCount > 0) return;
        if (UnityEngine.EventSystems.EventSystem.current != null && UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject()) return;
        // A drag pans across the floor; a tap picks a system; the wheel zooms.
        if (Input.GetMouseButtonDown(0)) { dragFrom = Input.mousePosition; dragging = false; }
        if (Input.GetMouseButton(0) && (Input.mousePosition - dragFrom).magnitude > 8)
        {
            dragging = true;
            var a = FloorPoint(dragFrom);
            var b = FloorPoint(Input.mousePosition);
            if (a != null && b != null) focusGoal += a.Value - b.Value;
            focus = focusGoal;
            dragFrom = Input.mousePosition;
        }
        if (Input.GetMouseButtonUp(0) && !dragging) Tap();
        float wheel = Input.mouseScrollDelta.y;
        if (wheel != 0) distanceGoal = Mathf.Clamp(distanceGoal * (1 - wheel * 0.08f), HomeDist * 0.4f, HomeDist * 2);
    }

    Vector3? FloorPoint(Vector3 screen)
    {
        var ray = Cam.ScreenPointToRay(screen);
        var plane = new Plane(Vector3.up, Vector3.zero);
        return plane.Raycast(ray, out var d) ? ray.GetPoint(d) : (Vector3?)null;
    }

    /// <summary>The camera, looking down at the map from its south, easing toward where it should be.</summary>
    void Camera()
    {
        float k = Application.isPlaying ? 1 - Mathf.Exp(-Time.deltaTime * 4) : 1;
        focus = Vector3.Lerp(focus, focusGoal, k);
        distance = Mathf.Lerp(distance, distanceGoal, k);
        // (The web's pose: yaw -0.95, pitch 0.62 rad; its eye off toward the strip's near end, looking along it.)
        float yaw = CamYaw, pitch = CamPitch;
        var back = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), Mathf.Sin(pitch), -Mathf.Cos(yaw) * Mathf.Cos(pitch));
        Cam.transform.position = focus + back * distance;
        Cam.transform.rotation = Quaternion.LookRotation(-back, Vector3.up);
    }

    void Tap()
    {
        if (!Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 200)) return;
        var tag = hit.collider.GetComponent<NodeTag>();
        if (tag != null) Select(tag.Id);
    }

    /// <summary>A system tapped: one in your ship's reach sends it there; your own (a station) goes back in; any other, focused.</summary>
    void Select(string id)
    {
        if (state.Phase == "player" && state.Battle == null && state.Winner == null)
        {
            var army = Campaign.Flagship(state, state.PlayerId);
            var move = army != null ? Campaign.ArmyMoves(state, army).FirstOrDefault(m => m.ToId == id) : null;
            if (move != null)
            {
                if (Campaign.NodeById(state, id).Challenge?.Kind == "rift")
                {
                    Ask("enter rift?", "You may not come back.", ("enter", () => SetOut(army.Id, id)));
                    return;
                }
                SetOut(army.Id, id);
                return;
            }
        }
        var n = Campaign.NodeById(state, id);
        if (Campaign.Flagship(state, state.PlayerId)?.NodeId == id && n.Station != null) EnterStation(id);
        else { Sound.Play("hover"); Refresh(); }
    }

    /// <summary>Your ship sets out down a route: it flies there, and what the system holds shows as it lands.</summary>
    void SetOut(string armyId, string toId)
    {
        CloseSheet();
        var army0 = Campaign.ArmyById(state, armyId);
        var move = Campaign.ArmyMoves(state, army0).FirstOrDefault(m => m.ToId == toId);
        if (move == null) return;
        if (move.Warp == true) Sound.Play("warp");
        else Sound.Play("launch");
        StartCoroutine(Fly(armyId, toId, move.Battle));
    }

    System.Collections.IEnumerator Fly(string armyId, string toId, bool battle)
    {
        flying = true;
        var from = ship.localPosition;
        var to = ShipSpot(toId);
        focusGoal = Home(toId);
        // (The ship turns to face its way, and flies on a gentle arc.)
        var dir = to - from;
        dir.y = 0;
        // (The model's bow is +x: turned so it points down the route.)
        if (dir.sqrMagnitude > 1e-4) ship.localRotation = Quaternion.FromToRotation(Vector3.right, dir.normalized);
        float t = 0, dur = Mathf.Clamp(dir.magnitude * 0.45f, 0.9f, 2.4f);
        while (t < 1)
        {
            t += Time.deltaTime / dur;
            float e = t * t * (3 - 2 * t);
            ship.localPosition = Vector3.Lerp(from, to, e) + Vector3.up * Mathf.Sin(Mathf.PI * Mathf.Clamp01(t)) * 0.25f;
            yield return null;
        }
        flying = false;
        if (battle) Sound.Play("thermo");
        int seq = state.Log.Count > 0 ? state.Log[state.Log.Count - 1].Seq : 0;
        if (!Apply(new CampaignAction { Type = "move", ArmyId = armyId, ToId = toId })) { Map(); Refresh(); yield break; }
        if (state.Log.Any(l => l.Seq > seq && l.Text.Contains(" finds "))) Sound.Play("buy");
        if (state.Battle == null) EnterStation(toId);
        Refresh();
        if (state.Battle != null)
        {
            yield return new WaitForSeconds(0.9f);
            Refresh();
        }
    }

    void EnterStation(string nodeId)
    {
        var n = state.Nodes.FirstOrDefault(x => x.Id == nodeId);
        if (n?.Station?.Kind == "armory") Armory(nodeId);
        else if (n?.Station?.Kind == "research") Lab(nodeId);
    }

    // ---- Moves ----

    /// <summary>A move made on the run (the engine's): saved; what it says can't be done, said; time moves on once the ship has moved.</summary>
    bool Apply(CampaignAction action)
    {
        int universe = state.Universe;
        try
        {
            state = Campaign.Apply(state, action);
        }
        catch (GameError e)
        {
            Toast(e.Message);
            Sound.Play("error");
            return false;
        }
        SkipSilentScenes();
        BankPetals();
        Save(state);
        if (state.Universe != universe && state.Winner == null)
        {
            Map();
            var f = Campaign.Flagship(state, state.PlayerId);
            if (f != null) focus = focusGoal = Home(f.NodeId);
            Toast($"Galaxy {state.Universe}: through the wormhole.");
        }
        if (action.Type != "endTurn" && action.Type != "aiStep" && MoveSpent()) Invoke(nameof(PassTime), 0.42f);
        return true;
    }

    /// <summary>The ship has made its move and nothing waits on you: the turn is spent.</summary>
    bool MoveSpent()
    {
        var s = state;
        if (s == null || s.Phase != "player" || s.Battle != null || s.Struggle != null || s.Beaten != null || s.Dream != null || s.Conquest != null || s.Loot != null || s.CardRewards.Count > 0 || s.Boon != null || s.Winner != null) return false;
        var a = Campaign.Flagship(s, s.PlayerId);
        return a != null && Campaign.ArmyMoves(s, a).Count == 0;
    }

    void PassTime()
    {
        if (!MoveSpent()) return;
        if (!Apply(new CampaignAction { Type = "endTurn" })) return;
        Map();
        Refresh();
    }

    /// <summary>Scenes with nothing to say read at once; only the newest word waits.</summary>
    void SkipSilentScenes()
    {
        while (state.Story.Queue.Count > 0 && Shown(state.Story.Queue[0]).Count == 0) { state = Campaign.Apply(state, new CampaignAction { Type = "readStory" }); storyLine = 0; }
        while (state.Story.Queue.Count > 1) { state = Campaign.Apply(state, new CampaignAction { Type = "readStory" }); storyLine = 0; }
    }

    static List<StoryLine> Shown(StoryScene scene) => scene.Lines.Where(l => l.Speaker?.Kind != "oracle").ToList();

    /// <summary>What the run has earned for good (petals, experience, stars, parts, companions), banked as it comes.</summary>
    void BankPetals()
    {
        var s = state;
        int xp = (s.Xp ?? 0) - (s.XpBanked ?? 0);
        int stars = (s.StarsTaken ?? 0) - (s.StarsBanked ?? 0);
        var parts = (s.PartsFound ?? new List<string>()).Skip(s.PartsBanked ?? 0).ToList();
        var freed = (s.Freed ?? new List<string>()).Skip(s.FreedBanked ?? 0).ToList();
        int spared = (s.Spared ?? 0) - (s.SparedBanked ?? 0);
        bool learnt = (s.CompanionXp ?? new Dictionary<string, int>()).Values.Any(v => v > 0);
        int hunted = (s.Hunted ?? 0) - (s.HuntedBanked ?? 0);
        if (s.Petals <= s.PetalsBanked && xp <= 0 && stars <= 0 && parts.Count == 0 && freed.Count == 0 && spared <= 0 && !learnt && hunted <= 0) return;
        var meta = Meta.BankCompanions(Meta.StowParts(LoadMeta(), parts), freed, (s.CompanionXp ?? new Dictionary<string, int>()).ToDictionary(kv => kv.Key, kv => (double)kv.Value), Mathf.Max(0, spared), Mathf.Max(0, hunted));
        var race = Campaign.Player(s).Race.ToString();
        if (stars > 0)
        {
            meta.Conquests ??= new Dictionary<string, int>();
            meta.Conquests[race] = (meta.Conquests.TryGetValue(race, out var had) ? had : 0) + stars;
        }
        meta.Petals += s.Petals - s.PetalsBanked;
        meta.Xp += Mathf.Max(0, xp);
        meta.Best = Mathf.Max(meta.Best, s.Universe - 1);
        SaveMeta(meta);
        state = Campaign.Apply(s, new CampaignAction { Type = "petalsBanked" });
    }

    // ---- Battles ----

    bool battleOpening;

    /// <summary>A battle waiting: into it (its board, under the run's rules).</summary>
    void OpenBattle()
    {
        if (battleOpening || state.Battle == null) return;
        battleOpening = true;
        App.Instance.CampaignBattle(state.Battle.Game, this);
    }

    /// <summary>Back from a battle: its result handed to the run (a retreat, a loss, a win, its salvage owed as a choice).</summary>
    public void FinishBattle(GameState game, bool auto = false)
    {
        battleOpening = false;
        Apply(new CampaignAction { Type = "finishBattle", Game = game, Auto = auto });
        Map();
        var f = Campaign.Flagship(state, state.PlayerId);
        if (f != null) focus = focusGoal = Home(f.NodeId);
        Refresh();
    }

    public CampaignState State => state;

    // ---- What shows ----

    void Refresh()
    {
        if (state == null) return;
        Top();
        Rings();
        Overlays();
        Camera();
    }

    /// <summary>Each system's ring: in reach (dashed blue), where your ship is (blue), else none; a focused one's name.</summary>
    void Rings()
    {
        var army = Campaign.Flagship(state, state.PlayerId);
        var reach = army != null && state.Phase == "player" && state.Battle == null ? Campaign.ArmyMoves(state, army).Select(m => m.ToId).ToHashSet() : new HashSet<string>();
        foreach (var kv in nodes)
        {
            var ring = kv.Value.Find("Ring")?.GetComponent<MeshRenderer>();
            if (ring == null) continue;
            bool here = army?.NodeId == kv.Key, can = reach.Contains(kv.Key);
            ring.sharedMaterial.color = here ? new Color(0.37f, 0.56f, 0.86f, 0.9f) : can ? new Color(0.45f, 0.5f, 0.6f, 0.55f) : new Color(0, 0, 0, 0);
            var name = kv.Value.Find("Name")?.GetComponent<TextMeshPro>();
            if (name != null)
            {
                bool show = can || here;
                name.gameObject.SetActive(show);
                if (show) name.text = Campaign.NodeById(state, kv.Key).Name.ToUpperInvariant();
            }
        }
    }

    public void Settle()
    {
        focus = focusGoal;
        distance = distanceGoal;
        Camera();
        foreach (var t in GetComponentsInChildren<TMP_Text>(true)) t.ForceMeshUpdate(true);
    }

    /// <summary>Turning slowly (a station in its orbit).</summary>
    public class Spin : MonoBehaviour { void Update() => transform.Rotate(0, Time.deltaTime * 12, 0, Space.World); }

    // (Taps on the map are told by this.)
    public class NodeTag : MonoBehaviour { public string Id; }
}
