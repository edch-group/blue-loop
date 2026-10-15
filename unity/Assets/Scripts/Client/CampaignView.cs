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
    RectTransform top, overlay, sheetRoot, notes;
    Transform world, mapRoot;
    readonly Dictionary<string, Transform> nodes = new Dictionary<string, Transform>();
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

    /// <summary>The run's map; a new run (`fresh`) opens on its opening shot, the flagship cruising in.</summary>
    public static CampaignView Make(CampaignState s, bool fresh = false)
    {
        var go = new GameObject("Campaign");
        var v = go.AddComponent<CampaignView>();
        v.state = s;
        v.fresh = fresh;
        v.Build();
        return v;
    }

    bool fresh;

    /// <summary>A new run: the Captain's, as petals have made them (a card kept from the last comes in with it).</summary>
    public static CampaignState NewRun()
    {
        var meta = LoadMeta();
        var hero = Meta.CaptainCard(meta);
        // (The run's bonuses as the account stands, the card kept from the last run among them; then it is used up.)
        var run = Meta.RunBonuses(meta);
        meta.Kept = null;
        meta.Runs += 1;
        SaveMeta(meta);
        var s = Campaign.Create(new CampaignSetup { Seed = Random.Range(1, int.MaxValue), Captain = hero, Run = run });
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
        // (Never the campaign menu's own scenes, its land and its ship, which keep to their layers.)
        Cam.cullingMask = ~((1 << 29) | (1 << 30));
        world = new GameObject("World").transform;
        world.SetParent(transform, false);
        // (In the web's own units, at the size it lays its page out at: each layer the whole screen, laid out as the web
        // lays its page out at that size, clear of the safe area where the web keeps clear of it; again when it changes.)
        hud = Hud.CssCanvas(Cam);
        hud.transform.SetParent(transform, false);
        // (The overlay's layer, never put away, says when the screen changes.)
        top = RefLayer.Make(hud.transform, "Top").Rect;
        overlay = RefLayer.Make(hud.transform, "Overlay", Relayout).Rect;
        sheetRoot = RefLayer.Make(hud.transform, "Sheet").Rect;
        notes = RefLayer.Make(hud.transform, "Notes").Rect;
        Sound.Scene("ambient");
        // (A new run's hero has their say first: whatever else the opening brought on waits behind it.)
        if (!(fresh && state.Story.Queue.Count > 0 && state.Story.Queue[0].Id == "intro")) SkipSilentScenes();
        // A new run: the opening shot, alongside the flagship as it cruises in while its hero speaks.
        if (fresh && Application.isPlaying)
        {
            arriving = true;
            cine = "ride";
            rideEnds = Clock + CineRideMax;
            Sound.Play("objective");
        }
        Map();
        var f = Campaign.Flagship(state, state.PlayerId);
        if (f != null) focus = focusGoal = Home(f.NodeId);
        distance = distanceGoal = RestDist;
        pitchNow = RestPitch;
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
        if (old != null) KillAll(old.gameObject);
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
        var mesh = GroundMesh(shape.Ground);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        groundMat = Mats.Make("Ground");
        groundMat.SetFloat("_G", G);
        go.AddComponent<MeshRenderer>().sharedMaterial = groundMat;
        // The starry abyss beneath it, the stars and comets over it.
        Sky(go, mesh, shape);
        // (The Dark Galaxy: no land, no gas, no sky.)
        go.SetActive(state.Rift?.Kind != "dark");
        // (A new land: no falling to watch, it is simply so.)
        goneTarget = -50;
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
    /// On the menu's land, by how far east each column's systems stand (and what the menu already broke away stays
    /// gone, drawn soft as the menu drew it). A column falling in the galaxy already in view: the ground shakes, and
    /// the land breaks away toward it, a column at a time (Update), exposing the starry abyss beneath.
    /// </summary>
    void Collapse(bool menuLand)
    {
        int fallen = state.Nodes.Count(x => x.Collapsed == true);
        if (fallenUniverse == state.Universe && fallen > fallenSeen && Application.isPlaying) Sound.Play("earthquake");
        fallenUniverse = state.Universe;
        fallenSeen = fallen;
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
            float floor = menuGone ?? -50;
            gone = Mathf.Max(ColX(gone), floor);
            crack = Mathf.Max(ColX(crack), floor);
        }
        // (What the menu broke away goes as the menu drew it, soft; the shards still falling as it handed over among it.)
        float softBelow = menuLand && menuGone != null ? menuGone.Value + 0.8f : -1e9f;
        groundMat.SetFloat("_SoftBelow", softBelow);
        if (abyssMat != null) abyssMat.SetFloat("_SoftBelow", softBelow);
        // (A first look, or going back: no falling to watch, it is simply so.)
        if (gone < goneTarget || goneTarget < -9 || !Application.isPlaying) goneNow = gone;
        goneTarget = gone;
        crackNow = crack;
        SetGone();
        groundMat.SetFloat("_Galaxy", System.Array.IndexOf(GalaxyCodes, state.Galaxy) is int g && g > 0 ? g : 0);
    }

    /// <summary>How far the land is gone now (eased toward where it is going), where it is cracked; the menu's own broken land.</summary>
    float goneNow = -50, goneTarget = -50, crackNow = -50;
    float? menuGone;
    int fallenSeen = -1, fallenUniverse = -1;

    void SetGone()
    {
        if (groundMat == null) return;
        groundMat.SetFloat("_Gone", goneNow);
        groundMat.SetFloat("_Crack", crackNow);
        if (abyssMat != null) abyssMat.SetFloat("_Gone", goneNow);
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
        // A turning galaxy: looking between the ship and the galaxy's heart (where the wormhole is).
        if (Spinning) return new Vector3(f.x * 0.55f * G, 0, -f.y * 0.55f * G);
        float dist = HomeDist / G;
        float reach = StripWidth / 2 - dist * 0.35f;
        float x = Mathf.Clamp(f.x + dist * 0.28f, -reach, reach);
        return new Vector3(x * G, 0, -(0.1f + f.y * 0.35f) * G);
    }

    /// <summary>
    /// A galaxy turning slowly round its heart (a spiral arm's, nebula3d.ts setSpin): the camera circles it, round about
    /// once every six minutes, from a little further off and higher; how far it has turned.
    /// </summary>
    bool Spinning => state?.Layout == "spiral";
    float spin;
    float RestDist => Spinning ? HomeDist * 1.125f : HomeDist;
    float RestYaw => CamYaw + spin;
    float RestPitch => Spinning ? 0.66f : CamPitch;

    /// <summary>Turning with the camera, the systems' names and marks still read from it.</summary>
    void FaceLabels()
    {
        float yaw = yawNow;
        var rot = Quaternion.Euler(90, -yaw * Mathf.Rad2Deg, 0);
        var toward = new Vector3(Mathf.Sin(yaw), 0, -Mathf.Cos(yaw));
        foreach (var t in nodes.Values)
        {
            if (t == null) continue;
            var name = t.Find("Name");
            if (name != null)
            {
                name.localRotation = rot;
                name.localPosition = toward * 0.45f + Vector3.up * 0.03f;
            }
            var mark = t.Find("Mark");
            if (mark != null)
            {
                mark.localRotation = rot;
                mark.localPosition = -toward * 0.42f + Vector3.up * 0.03f;
            }
        }
    }

    Vector3 NodePos(string id)
    {
        var n = Campaign.NodeById(state, id);
        var w = Web(n.X, n.Y);
        return new Vector3(w.x * G, (float)(n.H ?? 0) * Scale, -w.y * G);
    }

    // ---- The map: its systems and routes ----

    /// <summary>
    /// The map as it stands (campaign.ts showNebula): the land, the routes, every system the ship can see (in the Dark
    /// Galaxy only what it can see at all), the ships over their stars, what lies under the galaxy, its name.
    /// </summary>
    void Map()
    {
        if (mapRoot != null) KillAll(mapRoot.gameObject);
        nodes.Clear();
        stars3d.Clear();
        mapRoot = new GameObject("Map").transform;
        mapRoot.SetParent(world, false);
        Ground();
        var seen = new HashSet<string>(Campaign.VisibleNodes(state, state.PlayerId));
        Routes(seen);
        foreach (var sys in state.Nodes)
            if (sys.Vanished != true && sys.Challenge?.Hidden != true && seen.Contains(sys.Id)) MakeSystem(sys);
        Under();
        Stellari();
        Darkness();
        SetShips(ShipsNow(seen));
        Galaxy();
        Rings();
        Animate();
    }

    /// <summary>
    /// A system: its sun as the scene draws it (Sun3d), a fingertip's reach to tap it by, its name when it is in reach
    /// or the ship is there, a mark beside a station or the wormhole.
    /// </summary>
    void MakeSystem(CampaignNode n)
    {
        var go = new GameObject(n.Id);
        go.transform.SetParent(mapRoot, false);
        go.transform.localPosition = NodePos(n.Id);
        nodes[n.Id] = go.transform;
        Sun3d(n, go.transform);
        // (Picked within its outer ring, as the travel rings pulse out to.)
        var col = go.AddComponent<SphereCollider>();
        col.radius = 0.45f;
        go.AddComponent<NodeTag>().Id = n.Id;
        var name = Mats.FlatText("Name", go.transform, "", 2.2f, Look.InkSoft, true, 500, 14);
        name.transform.localPosition = Toward * 0.45f + Vector3.up * 0.03f;
        name.transform.localRotation = Facing;
        name.gameObject.SetActive(false);
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

    /// <summary>
    /// The galaxy's name and what it does, laid on the floor by the strip's start; a rift's galaxy, its name and what it
    /// is like (in the Dark Galaxy, in a pale light).
    /// </summary>
    void Galaxy()
    {
        string title = null, words = null;
        if (state.Rift != null && Rifts.ByKind != null && Rifts.ByKind.TryGetValue(state.Rift.Kind, out var rift)) { title = rift.Name; words = rift.Text; }
        else if (state.Galaxy != null && Campaign.D.Galaxies != null && Campaign.D.Galaxies.TryGetValue(state.Galaxy, out var g)) { title = g.Name; words = g.Text; }
        if (title == null) return;
        // (Laid along the strip's near side, reading west to east, from its first system.)
        var ps = nodes.Values.Select(t => t.localPosition).ToList();
        if (ps.Count == 0) return;
        var ink = state.Rift?.Kind == "dark" ? new Color(0.91f, 0.9f, 0.96f) : Look.InkSoft;
        var at = new Vector3(ps.Min(p => p.x) - 0.6f, 0.03f, ps.Min(p => p.z) - 1.1f);
        var name = Mats.FlatText("Galaxy", mapRoot, title.ToUpperInvariant(), 3.2f, ink, true, 400, 30, TextAlignmentOptions.TopLeft);
        name.rectTransform.pivot = new Vector2(0, 1);
        name.rectTransform.sizeDelta = new Vector2(14, 1);
        name.transform.localPosition = at;
        var text = Mats.FlatText("Galaxy words", mapRoot, words, 1.5f, ink, false, 400, 0, TextAlignmentOptions.TopLeft);
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
        float now = Clock;
        // The land breaks away toward the collapse, a column at a time.
        if (goneNow != goneTarget)
        {
            goneNow = goneTarget > goneNow ? Mathf.Min(goneTarget, goneNow + Mathf.Min(0.1f, Time.deltaTime) * 1.3f) : goneTarget;
            SetGone();
        }
        // The opening shot: alongside the flagship until the hero has had their say (or a while), then pulled back.
        if (cine == "ride" && !launching && now >= rideEnds) EndRide();
        if (cine == "done" && now - cineDone > 1.2f) cine = null;
        HudFade(now);
        StepTurn();
        // A turning galaxy: round about once every six minutes, the camera easing after it.
        if (!Spinning) spin = 0;
        else if (Application.isPlaying && !Cining && !launching)
        {
            spin += Mathf.Min(0.1f, Time.deltaTime) * (Mathf.PI * 2 / 360);
            glideRate = Mathf.Min(glideRate, 2.5f);
        }
        bool still = !flying && !Cining && !launching && overlay.childCount == 0 && sheetRoot.childCount == 0;
        bool overUi = UnityEngine.EventSystems.EventSystem.current != null && UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();
        // The system under the pointer swells and flares.
        string under = null;
        if (still && !overUi && Input.mousePresent && Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var over, 200)) under = over.collider.GetComponent<NodeTag>()?.Id;
        hovered = under;
        Animate();
        Camera();
        if (!still || overUi) return;
        // A drag pans across the floor; a tap picks a system; the wheel zooms.
        if (Input.GetMouseButtonDown(0)) { dragFrom = Input.mousePosition; dragging = false; }
        // (Never in a turning galaxy: the camera circles it.)
        if (Input.GetMouseButton(0) && !Spinning && (Input.mousePosition - dragFrom).magnitude > 8)
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
        if (wheel != 0) distanceGoal = Mathf.Clamp(distanceGoal * (1 - wheel * 0.08f), RestDist * 0.4f, RestDist * 2);
    }

    Vector3? FloorPoint(Vector3 screen)
    {
        var ray = Cam.ScreenPointToRay(screen);
        var plane = new Plane(Vector3.up, Vector3.zero);
        return plane.Raycast(ray, out var d) ? ray.GetPoint(d) : (Vector3?)null;
    }

    /// <summary>
    /// The camera, looking down at the map from its south, easing toward where it should be (after the opening shot,
    /// slowly, from the whole strip down onto the flagship); through the opening shot and the pan from the menu, where
    /// they have it.
    /// </summary>
    void Camera()
    {
        if (CinePose(out var shot) || LaunchPose(out shot))
        {
            Aim(shot);
            return;
        }
        float k = Application.isPlaying ? 1 - Mathf.Exp(-Mathf.Min(0.1f, Time.deltaTime) * glideRate) : 1;
        focus = Vector3.Lerp(focus, focusGoal, k);
        distance = Mathf.Lerp(distance, distanceGoal, k);
        // (The web's pose: yaw -0.95, pitch 0.62 rad; its eye off toward the strip's near end, looking along it.)
        yawNow += Wrap(RestYaw - yawNow) * k;
        pitchNow += (RestPitch - pitchNow) * k;
        if (glideRate < 4 && !Spinning && (focus - focusGoal).magnitude < 1e-3f && Mathf.Abs(distance - distanceGoal) < 1e-3f && Mathf.Abs(Wrap(RestYaw - yawNow)) < 1e-4f) glideRate = 4;
        if (Spinning) FaceLabels();
        Aim(new Pose { X = focus.x / G, Y = focus.y / G, Z = -focus.z / G, Yaw = yawNow, Pitch = pitchNow, Dist = distance / G });
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
        warpMove = move.Warp == true;
        // (Only a jump sounds, its warp: a flight is silent, as the web's.)
        if (move.Warp == true) Sound.Play("warp");
        StartCoroutine(Fly(armyId, toId, move.Battle));
    }

    /// <summary>
    /// The ship on its way (nebula-objects.ts): the Captain's turning to face the system, then flying there, bobbing
    /// (or, with its warp drive, warping); the camera following. What the system holds shows as it lands.
    /// </summary>
    System.Collections.IEnumerator Fly(string armyId, string toId, bool battle)
    {
        flying = true;
        focusGoal = Home(toId);
        var n = Campaign.NodeById(state, toId);
        float dur = 0;
        if (tracks.TryGetValue(armyId, out var tr))
        {
            Bound(tr, Web(n.X, n.Y), (float)(n.H ?? 0) * MapK, !warpMove);
            dur = tr.Dur;
        }
        if (dur > 0) yield return new WaitForSeconds(dur);
        flying = false;
        if (battle) Sound.Play("thermo");
        int seq = state.Log.Count > 0 ? state.Log[state.Log.Count - 1].Seq : 0;
        if (!Apply(new CampaignAction { Type = "move", ArmyId = armyId, ToId = toId })) { Map(); Refresh(); yield break; }
        if (state.Log.Any(l => l.Seq > seq && l.Text.Contains(" finds "))) Sound.Play("buy");
        if (state.Battle == null) EnterStation(toId);
        // (The systems as they now stand: one used, one taken, the routes from here.)
        if (state.Battle == null) Map();
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
        // (A turn of Time Dense Space still playing out ends where it ends; its rings and routes before the move, to turn from.)
        EndTurnAnim();
        var was = TimeNow(state);
        int universe = state.Universe;
        string rift = state.Rift?.Kind;
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
        if (state.Universe == universe && state.Rift?.Kind == rift) BeginTurn(was);
        if (state.Universe != universe || state.Rift?.Kind != rift)
        {
            // (Into a new galaxy, or through a rift: the ships are simply there, not flown across from the last.)
            foreach (var t in tracks.Values) if (t.T != null) KillAll(t.T.gameObject);
            tracks.Clear();
        }
        if (state.Universe != universe && state.Winner == null)
        {
            Map();
            var f = Campaign.Flagship(state, state.PlayerId);
            if (f != null) focus = focusGoal = Home(f.NodeId);
            distanceGoal = RestDist;
            Banner($"galaxy {state.Universe}", "through the wormhole");
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
        // (The hero has had their say: the opening shot pulls back.)
        if (cine == "ride" && (state.Story.Queue.Count == 0 || state.Story.Queue[0].Id != "intro")) EndRide();
        Top();
        CineHud();
        Rings();
        Overlays();
        Camera();
    }

    /// <summary>
    /// Each system in reach pulsing, rings going out from it, a dashed ring turning round it; its name, and the name of
    /// the one your ship is at (none through the opening shot, the map's marks hidden till it is over).
    /// </summary>
    void Rings()
    {
        var army = Campaign.Flagship(state, state.PlayerId);
        var reach = army != null && state.Phase == "player" && state.Battle == null && state.Winner == null ? Campaign.ArmyMoves(state, army).Select(m => m.ToId).ToHashSet() : new HashSet<string>();
        foreach (var st in stars3d) st.Reach = reach.Contains(st.Id);
        bool marks = !Cining && !launching;
        foreach (var kv in nodes)
        {
            bool here = army?.NodeId == kv.Key, can = reach.Contains(kv.Key);
            var name = kv.Value.Find("Name")?.GetComponent<TextMeshPro>();
            if (name != null)
            {
                bool show = (can || here) && marks;
                name.gameObject.SetActive(show);
                if (show) name.text = Campaign.NodeById(state, kv.Key).Name.ToUpperInvariant();
            }
            kv.Value.Find("Mark")?.gameObject.SetActive(marks);
        }
        if (mapRoot != null)
            foreach (var label in new[] { "Galaxy", "Galaxy words" })
                mapRoot.Find(label)?.gameObject.SetActive(marks);
    }

    public void Settle()
    {
        focus = focusGoal;
        distance = distanceGoal;
        yawNow = RestYaw;
        pitchNow = RestPitch;
        Animate();
        Camera();
        PlaceDarkness();
        foreach (var t in GetComponentsInChildren<TMP_Text>(true)) t.ForceMeshUpdate(true);
    }

    /// <summary>Turning slowly (a station in its orbit).</summary>
    public class Spin : MonoBehaviour { void Update() => transform.Rotate(0, Time.deltaTime * 12, 0, Space.World); }

    // (Taps on the map are told by this.)
    public class NodeTag : MonoBehaviour { public string Id; }
}
