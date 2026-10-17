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
    public const string Key = "blue-loop:campaign:v6", MetaKey = "blue-loop:runs:v1";
    // (Map units to the scene's: the strip is a few thousand units long, laid out at 300 to one.)
    const float Scale = 1 / 300f;

    public Camera Cam;
    CampaignState state;
    Canvas hud;
    RectTransform top, overlay, sheetRoot, notes, tips;
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
        // (Nor a station dock's scene: StationDock draws it with its own camera.)
        Cam.cullingMask = ~((1 << 29) | (1 << 30) | (1 << StationDock.Layer));
        world = new GameObject("World").transform;
        world.SetParent(transform, false);
        // (In the web's own units, at the size it lays its page out at: each layer the whole screen, laid out as the web
        // lays its page out at that size, clear of the safe area where the web keeps clear of it; again when it changes.)
        // (Sorted after the map's own see-through things, its rings and glows queued past the UI's, as the web's page
        // lies over its canvas: a veil and its modal over every ring.)
        hud = Hud.CssCanvas(Cam, 1);
        hud.transform.SetParent(transform, false);
        // (The overlay's layer, never put away, says when the screen changes.)
        top = RefLayer.Make(hud.transform, "Top").Rect;
        overlay = RefLayer.Make(hud.transform, "Overlay", Relayout).Rect;
        sheetRoot = RefLayer.Make(hud.transform, "Sheet").Rect;
        notes = RefLayer.Make(hud.transform, "Notes").Rect;
        // (The tooltip's own layer, over all the rest: the web's .kw-tip, fixed at z-index 90.)
        tips = RefLayer.Make(hud.transform, "Tips").Rect;
        Sound.Scene(Score, TimeRift);
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
        // (A run carried on: announced.)
        if (!fresh && Application.isPlaying) Announce();
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
        // (Breaking away, as it collapses, in the cells of the ink mesh drawn into it: as solid blocks.)
        var mesh = GroundMesh(shape.Ground);
        NewBlocks(go.transform, shape.Ground, seed);
        CellGround(mesh, landCells);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        groundMat = Mats.Make("Ground");
        groundMat.SetFloat("_G", G);
        groundMat.SetFloat("_Cells", 1);
        go.AddComponent<MeshRenderer>().sharedMaterial = groundMat;
        // The starry abyss beneath it, the stars and comets over it.
        Sky(go, mesh, shape);
        abyssMat.SetFloat("_Cells", 1);
        // (The Dark Galaxy: no land, no gas, no sky.)
        go.SetActive(state.Rift?.Kind != "dark");
        // (A new land: no falling to watch, it is simply so.)
        goneTarget = -50;
        Collapse(menuLand);
        // (A new land comes in out of the paper; carried straight on from the menu's, at once: see Launching.)
        landFade = Application.isPlaying ? 0 : 1;
        LandFade();
    }

    // How far the land has come in out of the paper (nebula3d.ts's fade: over 1.2 s, eased in and out, the gas and the
    // stars with it): from nothing whenever a new land is shown, or the map is shown afresh.
    float landFade;

    void LandFade()
    {
        float f = landFade * landFade * (3 - 2 * landFade);
        if (groundMat != null) groundMat.SetFloat("_Fade", f);
        if (blocksMat != null) blocksMat.SetFloat("_Fade", f);
        if (starsMat != null) starsMat.SetFloat("_Fade", f);
        if (cometsMat != null) cometsMat.SetFloat("_Fade", f);
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
    /// the land breaks away toward it, a column at a time (Update), in solid blocks along its ink mesh's cells that fall
    /// into the starry abyss beneath (CampaignView.Blocks).
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
        softBelowNow = softBelow;
        // (A first look, or going back: no falling to watch, it is simply so.)
        bool snapped = gone < goneTarget || goneTarget < -9 || !Application.isPlaying;
        if (snapped) goneNow = gone;
        goneTarget = gone;
        crackNow = crack;
        SetGone();
        float galaxy = System.Array.IndexOf(GalaxyCodes, state.Galaxy) is int g && g > 0 ? g : 0;
        groundMat.SetFloat("_Galaxy", galaxy);
        if (blocksMat != null)
        {
            blocksMat.SetFloat("_Galaxy", galaxy);
            blocksMat.SetFloat("_Crack", crackNow);
        }
        // The cells the collapse has newly passed break away as blocks.
        BreakAway(snapped);
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

    // The camera's heading (yaw -0.95 rad, its eye toward the strip's near end).
    const float CamYaw = -0.95f, CamPitch = 0.62f;

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
        // (No name and no words beside it, as the web's: its badges are hidden on the 3D map, a station is its model.)
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
    /// The galaxy's name and what it does to every battle in it (campaign.ts renderGalaxy, .cmp-galaxy-land): out past
    /// the systems on the side that is up the screen as the camera rests, standing on the land like a sign running along
    /// the way, read from the camera's side; its glyph and name large and widely spaced, the words under them. A rift's
    /// galaxy: its name and what it is like (in the Dark Galaxy, pale on the dark). Measured in the web's map pixels.
    /// </summary>
    void Galaxy()
    {
        string title = null, words = null;
        if (state.Rift != null && Rifts.ByKind != null && Rifts.ByKind.TryGetValue(state.Rift.Kind, out var rift)) { title = rift.Name; words = rift.Text; }
        else if (state.Galaxy != null && Campaign.D.Galaxies != null && Campaign.D.Galaxies.TryGetValue(state.Galaxy, out var g)) { title = g.Name; words = g.Text; }
        if (title == null) return;
        var all = state.Nodes.Where(n => n.Challenge?.Hidden != true).ToList();
        if (all.Count == 0) return;
        // Up the screen, on the land, as the camera rests (its yaw): the side the words go.
        float upX = Mathf.Sin(-CamYaw), upY = -Mathf.Cos(-CamYaw);
        // Along the way: a strip runs along x (its first column to its third); any other shape, across the screen.
        bool strip = state.Layout == "strip";
        Vector2? ColAt(int c)
        {
            var cs = all.Where(n => n.Col == c).ToList();
            return cs.Count > 0 ? new Vector2((float)cs.Average(n => n.X), (float)cs.Average(n => n.Y)) : (Vector2?)null;
        }
        var c1 = strip ? ColAt(1) : null;
        var c3 = strip ? ColAt(3) : null;
        float dl = c1 != null && c3 != null ? Vector2.Distance(c1.Value, c3.Value) : 0;
        var d = c1 != null && c3 != null && dl > 0 ? (c3.Value - c1.Value) / dl : strip ? new Vector2(1, 0) : new Vector2(Mathf.Cos(CamYaw), -Mathf.Sin(CamYaw));
        var nrm = new Vector2(-d.y, d.x);
        if (nrm.x * upX + nrm.y * upY < 0) nrm = -nrm;
        float Along(CampaignNode n) => (float)n.X * d.x + (float)n.Y * d.y;
        float Out(CampaignNode n) => (float)n.X * nrm.x + (float)n.Y * nrm.y;
        // (Its size in map units: the name's big letters, and the words under it, wrapped.)
        const float HalfW = 620;
        // Where along: a strip's, over its first few columns (in view as a run begins); any other, its middle.
        var early = strip ? all.Where(n => (n.Col ?? 0) >= 1 && (n.Col ?? 0) <= 3).ToList() : all;
        var pick = early.Count > 0 ? early : all;
        float mid = pick.Average(Along);
        // Out past every system it lies beside (and their rings), so it never covers one.
        var beside = all.Where(n => Mathf.Abs(Along(n) - mid) < HalfW + 260).ToList();
        if (strip && beside.Count > 0 && beside.All(n => n.Collapsed == true)) return;
        var near = beside.Count > 0 ? beside : all;
        float edge = near.Max(Out);
        // The sign runs along the way, read from the camera's side: its words along `right`, its face toward the camera.
        var right = d;
        if (-right.y * -upX + right.x * -upY < 0) right = -right;
        var back = new Vector2(right.y, -right.x);
        // Laid over the scene, it covers whatever falls under it on screen: out past every system, then on out until the
        // sight line from the camera's resting eye to each system (its foot and the top of whatever stands on it) misses it.
        const float SignH = 380, PadOut = 130, Tall = 170;
        Vector3? eye = null;
        var f = Campaign.Flagship(state, state.PlayerId);
        if (f != null)
        {
            var hm = Home(f.NodeId);
            float dist = RestDist / G, pitch = RestPitch, yaw = RestYaw;
            float ex = hm.x / G + Mathf.Sin(yaw) * Mathf.Cos(pitch) * dist, ey = Mathf.Sin(pitch) * dist, ez = -hm.z / G + Mathf.Cos(yaw) * Mathf.Cos(pitch) * dist;
            eye = new Vector3(ex / MapK + Campaign.T.MapWidth / 2f, ez / MapK + Campaign.T.MapHeight / 2f, ey / MapK);
        }
        float Dot(float vx, float vy, Vector2 w) => vx * w.x + vy * w.y;
        bool Hides(float cx, float cy) => all.Any(n =>
        {
            float nx = (float)n.X, ny = (float)n.Y, nh = (float)(n.H ?? 0);
            if (eye == null) return Mathf.Abs(Dot(nx - cx, ny - cy, right)) < HalfW + PadOut && Dot(nx - cx, ny - cy, back) > -PadOut && Dot(nx - cx, ny - cy, back) < 900;
            var e = eye.Value;
            float be = Dot(e.x - cx, e.y - cy, back), bp = Dot(nx - cx, ny - cy, back);
            if (Mathf.Abs(bp - be) < 1) return false;
            // (Where the sight line through it meets the sign's plane, and how high: foot and top.)
            float t = -be / (bp - be);
            if (t <= 0) return false;
            float a = Dot(e.x - cx, e.y - cy, right) + t * Dot(nx - e.x, ny - e.y, right);
            if (Mathf.Abs(a) > HalfW + PadOut) return false;
            float foot = e.z + t * (nh - e.z), top = e.z + t * (nh + Tall - e.z);
            return Mathf.Max(foot, top) > -PadOut && Mathf.Min(foot, top) < SignH + PadOut;
        });
        float o = edge + 260;
        for (int i = 0; i < 40 && Hides(d.x * mid + nrm.x * o, d.y * mid + nrm.y * o); i++) o += 80;
        float x = d.x * mid + nrm.x * o, y = d.y * mid + nrm.y * o;
        var outmost = near.Aggregate((best, n) => Out(n) > Out(best) ? n : best);
        // The sign: the middle of its foot there (at the height of the system furthest out beside it), standing up, its
        // face away from `back`. (A map pixel is Scale of a unit here; TMP's world text is a tenth of a unit a point.)
        var sign = new GameObject("Galaxy").transform;
        sign.SetParent(mapRoot, false);
        sign.localPosition = new Vector3((x - Campaign.T.MapWidth / 2f) * Scale, (float)(outmost.H ?? 0) * Scale, -(y - Campaign.T.MapHeight / 2f) * Scale);
        sign.localRotation = Quaternion.LookRotation(new Vector3(back.x, 0, -back.y), Vector3.up);
        bool dark = state.Rift?.Kind == "dark";
        // (rgba(70, 78, 104, 0.62), the words 0.58; in the Dark Galaxy rgba(214, 220, 238, 0.6).)
        var ink = dark ? new Color(214 / 255f, 220 / 255f, 238 / 255f, 0.6f) : new Color(70 / 255f, 78 / 255f, 104 / 255f, 0.62f);
        var inkWords = dark ? ink : new Color(70 / 255f, 78 / 255f, 104 / 255f, 0.58f);
        const float Px = Scale;
        // The words (44px, line-height 1.3, letter-spacing 0.03em, at most 1180 across), from the foot up, centred.
        var text = Mats.FlatText("Galaxy words", sign, words, 44 * Px * 10, inkWords, false, 400, 3, TextAlignmentOptions.Bottom);
        text.transform.localRotation = Quaternion.identity;
        text.textWrappingMode = TextWrappingModes.Normal;
        text.lineSpacing = (1.3f - 1.26f) * 100 / 1.26f;
        float tw = Mathf.Min(1180 * Px, text.GetPreferredValues(words).x + 0.01f);
        float th = text.GetPreferredValues(words, tw, 0).y;
        text.rectTransform.pivot = new Vector2(0.5f, 0);
        text.rectTransform.sizeDelta = new Vector2(tw, th);
        text.transform.localPosition = Vector3.zero;
        // Over them, 18 between: the glyph (76 across, 22 before the name; a rift has none) and the name (70px,
        // letter-spacing 0.32em, which CSS trails after the last letter too), the two centred.
        var name = Mats.FlatText("Galaxy name", sign, title.ToUpperInvariant(), 70 * Px * 10, ink, true, 400, 32, TextAlignmentOptions.Left);
        name.transform.localRotation = Quaternion.identity;
        float nw = name.GetPreferredValues(name.text).x + 0.32f * 70 * Px, rowH = 70 * 1.26f * Px;
        var glyphTex = state.Rift != null ? null : Resources.Load<Texture2D>($"Icons/galaxy-{state.Galaxy}");
        float gw = glyphTex != null ? (76 + 22) * Px : 0, rowW = gw + nw, rowY = th + 18 * Px;
        name.rectTransform.pivot = new Vector2(0, 0);
        name.rectTransform.sizeDelta = new Vector2(nw + 0.01f, rowH);
        name.transform.localPosition = new Vector3(-rowW / 2 + gw, rowY, 0);
        if (glyphTex != null)
        {
            // (A quad in the sign's plane in the project's own Card shader: a SpriteRenderer's default shader isn't in
            // the web build, and drew as magenta.)
            var gl = Mats.Quad();
            gl.name = "Galaxy glyph";
            Mats.Kill(gl.GetComponent<Collider>());
            gl.transform.SetParent(sign, false);
            var gm = Mats.Make("Card", ink);
            gm.mainTexture = glyphTex;
            gm.SetFloat("_Radius", 0);
            gm.SetFloat("_Aspect", 1);
            gl.GetComponent<MeshRenderer>().sharedMaterial = gm;
            gl.transform.localScale = new Vector3(76 * Px, 76 * Px * glyphTex.height / glyphTex.width, 1);
            gl.transform.localPosition = new Vector3(-rowW / 2 + 38 * Px, rowY + rowH / 2, 0);
        }
    }

    // ---- The view: following the ship, the player's drags and zooms ----

    Vector3 dragFrom;
    bool dragging;

    // The land's own clock (nebula3d.ts's time): from nothing each time the map is shown, as the web's page is drawn
    // afresh, and only while it is.
    float landClock;
    void OnEnable()
    {
        landClock = 0;
        landFade = Application.isPlaying ? 0 : 1;
        LandFade();
    }

    // (The map gone: its boosters with it, nebula3d.ts destroy.)
    void OnDisable() => Sound.Thrust(false);

    void Update()
    {
        float now = Clock;
        landClock += Mathf.Min(0.1f, Time.deltaTime);
        if (groundMat != null) groundMat.SetFloat("_T", landClock);
        if (landFade < 1)
        {
            landFade = Application.isPlaying ? Mathf.Min(1, landFade + Mathf.Min(0.1f, Time.deltaTime) / 1.2f) : 1;
            LandFade();
        }
        // The land breaks away toward the collapse, a column at a time.
        if (goneNow != goneTarget)
        {
            goneNow = goneTarget > goneNow ? Mathf.Min(goneTarget, goneNow + Mathf.Min(0.1f, Time.deltaTime) * SweepRate) : goneTarget;
            SetGone();
        }
        // (Its blocks breaking away and falling as it goes, and on after it stops.)
        BlocksTick(Mathf.Min(0.1f, Time.deltaTime));
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
        if (Input.GetKeyDown(KeyCode.Escape)) OnEscape();
        TipsTick();
        bool still = !flying && !Cining && !launching && overlay.childCount == 0 && sheetRoot.childCount == 0;
        bool overUi = UnityEngine.EventSystems.EventSystem.current != null && UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();
        // The system under the pointer swells and flares.
        string under = null;
        if (still && !overUi && Input.mousePresent && Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var over, 200)) under = over.collider.GetComponent<NodeTag>()?.Id;
        // (A star come under the pointer chimes, each its own note: campaign.ts setHovered. A finger's touch is a tap, not a hover.)
        // (Nor for a system of yours: taken, or its station used.)
        if (under != null && under != hovered && Input.touchCount == 0 && !Yours(under)) Sound.StarHover(Sound.SeedOf(under));
        hovered = under;
        // The boosters, heard while a ship is under way on the map (nebula3d.ts onThrust).
        Sound.Thrust(Application.isPlaying && ShipsMoving());
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
        Aim(new Pose { X = focus.x / G, Y = focus.y / G, Z = -focus.z / G, Yaw = yawNow, Pitch = pitchNow, Dist = distance / G });
    }

    void Tap()
    {
        // (A ship's hull first, as the web's lies over its star: another army's focuses the system it stands in.)
        if (Physics.Raycast(Cam.ScreenPointToRay(Input.mousePosition), out var hit, 200))
        {
            var ship = hit.collider.GetComponent<ShipTag>();
            if (ship != null) { TapArmy(ship.Id); return; }
            var tag = hit.collider.GetComponent<NodeTag>();
            if (tag != null) { Select(tag.Id); return; }
        }
        // (Nothing under it: whatever was focused, let go (campaign.ts cmp-deselect).)
        if (selected == null) return;
        selected = null;
        Refresh();
    }

    /// <summary>
    /// A ship tapped (campaign.ts cmp-army): your own, nothing to show (it is always the one that moves); anyone else's,
    /// the system it stands in, focused.
    /// </summary>
    void TapArmy(string armyId)
    {
        var army = state.Armies.FirstOrDefault(a => a.Id == armyId);
        if (army == null) return;
        selected = army.Owner == state.PlayerId ? null : army.NodeId;
        Sound.Play("hover");
        Refresh();
    }

    /// <summary>The system focused (campaign.ts selected): its planets orbiting it.</summary>
    string selected;

    /// <summary>Whether what a system holds is known (campaign.ts known): the wormhole and its guardian, or a ship seen standing there.</summary>
    bool Known(string nodeId) => Campaign.NodeById(state, nodeId).Heart == true || Campaign.ArmyAt(state, nodeId) != null;

    /// <summary>
    /// A system tapped (campaign.ts cmp-select): one in your ship's reach sends it there (a rift asked first; into the
    /// unknown it just sets out; a known foe gets a look at the matchup first; a known system with no fight, straight
    /// in); where your ship stands, back into its station; any other, focused, its planets showing.
    /// </summary>
    void Select(string id)
    {
        if (state.Phase == "player" && state.Battle == null && state.Winner == null)
        {
            var army = Campaign.Flagship(state, state.PlayerId);
            var move = army != null ? Campaign.ArmyMoves(state, army).FirstOrDefault(m => m.ToId == id) : null;
            if (move != null)
            {
                var to = Campaign.NodeById(state, id);
                if (to.Challenge?.Kind == "rift")
                {
                    // (The rift named before the warning: "<rift> · You may not come back.")
                    string rift = to.Challenge.Rift != null && Rifts.ByKind != null && Rifts.ByKind.TryGetValue(to.Challenge.Rift, out var rd) ? $"{rd.Name} · " : "";
                    Ask("enter rift?", $"{rift}You may not come back.", ("enter", () => SetOut(army.Id, id)));
                    Sound.Play("hover");
                    return;
                }
                // (Into the unknown (who knows what a system holds until you get there): the ship just sets out.)
                if (!Known(id) && to.Owner == null) { SetOut(army.Id, id); return; }
                warpMove = move.Warp == true;
                if (move.Battle) Attack(army.Id, id);
                else if (Apply(new CampaignAction { Type = "move", ArmyId = army.Id, ToId = id }))
                {
                    Sound.Play("play");
                    // (Arrived: nothing to pick.)
                    selected = null;
                    Map();
                    Refresh();
                }
                return;
            }
        }
        var n = Campaign.NodeById(state, id);
        // (No popovers on the map: at home or where your ship stands, a tap goes back into its station; anywhere else a
        // tap only focuses the system, showing its planets.)
        if (n.Home != null || Campaign.Flagship(state, state.PlayerId)?.NodeId == id)
        {
            selected = null;
            if (n.Station != null) EnterStation(id);
            Refresh();
            return;
        }
        selected = id;
        Sound.Play("hover");
        Refresh();
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
        int seq = state.Log.Count > 0 ? state.Log[state.Log.Count - 1].Seq : 0;
        string rift0 = state.Rift?.Kind;
        if (!Apply(new CampaignAction { Type = "move", ArmyId = armyId, ToId = toId })) { Map(); Refresh(); yield break; }
        // (Through a rift the galaxy is a new one (its systems' ids used afresh): nothing to focus or open.)
        bool through = state.Rift?.Kind != rift0 || !state.Nodes.Any(x => x.Id == toId);
        selected = through ? null : toId;
        if (!through && state.Log.Any(l => l.Seq > seq && l.Text.Contains(" finds "))) Sound.Play("buy");
        // A station: straight in, its screen open on arrival (after a Power Struggle, a beaten rival or a dream, if one
        // waits: campaign.ts afterStruggle).
        if (!through && state.Battle == null)
        {
            if (state.Struggle != null || state.Beaten != null || state.Dream != null) afterStruggle = toId;
            else EnterStation(toId);
        }
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

    /// <summary>
    /// Escape on the map (campaign.ts onKey): the settings, or (open) shut them. Not over anything that waits on a choice
    /// (another sheet or a station, spoils, a dream, a struggle, a scene's word).
    /// </summary>
    void OnEscape()
    {
        var s = state;
        if (s == null) return;
        if (sheetNow == (System.Action)Settings)
        {
            CloseSheet();
            return;
        }
        if (sheetRoot.childCount > 0 || stationId != null || s.Battle != null || s.Loot != null || s.CardRewards.Count > 0 || s.Dream != null || s.Struggle != null || s.Beaten != null
            || s.Conquest != null || s.Prophet != null || s.Boon != null || (s.EmblemChoice?.Count ?? 0) > 0 || s.Winner != null || s.Story.Queue.Count > 0) return;
        Settings();
    }

    /// <summary>A station the flagship arrived at with a Power Struggle (a beaten rival, a dream) waiting: its screen opens once that is done.</summary>
    string afterStruggle;

    /// <summary>The station waiting (campaign.ts openAfterStruggle), opened once nothing else waits on you, the flagship still there.</summary>
    void OpenAfterStruggle()
    {
        var s = state;
        if (afterStruggle == null || s == null) return;
        if (!s.Nodes.Any(x => x.Id == afterStruggle)) { afterStruggle = null; return; }
        if (s.Struggle != null || s.Beaten != null || s.Dream != null || s.Battle != null || s.Loot != null || s.CardRewards.Count > 0 || sheetRoot.childCount > 0 || stationId != null) return;
        var id = afterStruggle;
        afterStruggle = null;
        if (Campaign.Flagship(s, s.PlayerId)?.NodeId != id) return;
        EnterStation(id);
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
            selected = null;
            Map();
            var f = Campaign.Flagship(state, state.PlayerId);
            if (f != null) focus = focusGoal = Home(f.NodeId);
            distanceGoal = RestDist;
            Banner($"galaxy {state.Universe}", "through the wormhole");
        }
        if (action.Type != "endTurn" && action.Type != "aiStep" && MoveSpent()) Invoke(nameof(PassTime), 0.42f);
        return true;
    }

    /// <summary>A system of yours: taken, or its station used (as the map rings it).</summary>
    bool Yours(string id)
    {
        var n = Campaign.NodeById(state, id);
        return n != null && (n.Owner == state.PlayerId || StationUser(n, state.PlayerId) == state.PlayerId);
    }

    /// <summary>The ship has made its move and nothing waits on you: the turn is spent.</summary>
    bool MoveSpent()
    {
        var s = state;
        // (Someone alongside waits on an answer first: time moves on once they have it.)
        if (s == null || s.Phase != "player" || s.Battle != null || s.Encounter != null || s.Struggle != null || s.Beaten != null || s.Dream != null || s.Conquest != null || s.Loot != null || s.CardRewards.Count > 0 || s.Boon != null || s.Winner != null) return false;
        var a = Campaign.Flagship(s, s.PlayerId);
        return a != null && Campaign.ArmyMoves(s, a).Count == 0;
    }

    void PassTime()
    {
        if (!MoveSpent()) return;
        if (!Apply(new CampaignAction { Type = "endTurn" })) return;
        selected = null;
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
    /// <summary>
    /// The map's score (app.ts render): the ambient one; in Time Dense Space, the home menu's voyage instead, played
    /// backwards (TimeRift: its battles' scores too).
    /// </summary>
    string Score => TimeRift ? "voyage" : "ambient";

    /// <summary>In Time Dense Space: the map's score and its battles' run backwards (app.ts render, sound.ts setReverse).</summary>
    public bool TimeRift => state?.Rift?.Kind == "time";

    public void FinishBattle(GameState game, bool auto = false)
    {
        battleOpening = false;
        Sound.Scene(Score, TimeRift);
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
        Orbits();
        Camera();
        if (afterStruggle != null) OpenAfterStruggle();
    }

    /// <summary>
    /// Each system in reach pulsing, rings going out from it, a dashed ring turning round it; no names (the map's marks
    /// hidden through the opening shot, till it is over).
    /// </summary>
    void Rings()
    {
        var army = Campaign.Flagship(state, state.PlayerId);
        var reach = army != null && state.Phase == "player" && state.Battle == null && state.Winner == null ? Campaign.ArmyMoves(state, army).Select(m => m.ToId).ToHashSet() : new HashSet<string>();
        foreach (var st in stars3d) st.Reach = reach.Contains(st.Id);
        bool marks = !Cining && !launching;
        if (mapRoot != null) mapRoot.Find("Galaxy")?.gameObject.SetActive(marks);
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

    // (And taps on a ship's hull by this: the army it is.)
    public class ShipTag : MonoBehaviour { public string Id; }
}
