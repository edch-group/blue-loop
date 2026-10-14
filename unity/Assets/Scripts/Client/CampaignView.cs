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
    float distance = 11, distanceGoal = 11;
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
        Cam.backgroundColor = new Color(0.975f, 0.975f, 0.97f);
        Cam.fieldOfView = 34;
        Cam.nearClipPlane = 0.1f;
        Cam.farClipPlane = 200;
        world = new GameObject("World").transform;
        world.SetParent(transform, false);
        Floor();
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
        if (f != null) focus = focusGoal = NodePos(f.NodeId);
        Refresh();
    }

    /// <summary>The paper floor, rolling gently, its grid drawn on it, reaching to the horizon.</summary>
    void Floor()
    {
        var go = new GameObject("Floor");
        go.transform.SetParent(world, false);
        var mf = go.AddComponent<MeshFilter>();
        var mr = go.AddComponent<MeshRenderer>();
        const int n = 160;
        const float size = 90;
        var verts = new Vector3[(n + 1) * (n + 1)];
        var tris = new int[n * n * 6];
        for (int z = 0; z <= n; z++)
            for (int x = 0; x <= n; x++)
                verts[z * (n + 1) + x] = new Vector3((x / (float)n - 0.5f) * size, -0.6f, (z / (float)n - 0.5f) * size);
        int t = 0;
        for (int z = 0; z < n; z++)
            for (int x = 0; x < n; x++)
            {
                int i = z * (n + 1) + x;
                tris[t++] = i; tris[t++] = i + n + 1; tris[t++] = i + 1;
                tris[t++] = i + 1; tris[t++] = i + n + 1; tris[t++] = i + n + 2;
            }
        var m = new Mesh { indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
        m.vertices = verts;
        m.triangles = tris;
        m.RecalculateNormals();
        m.bounds = new Bounds(Vector3.zero, new Vector3(size, 10, size));
        mf.sharedMesh = m;
        mr.sharedMaterial = Mats.Make("Floor");
    }

    Vector3 NodePos(string id)
    {
        var n = Campaign.NodeById(state, id);
        return new Vector3((float)n.X * Scale, (float)(n.H ?? 0) * 0.6f, -(float)n.Y * Scale);
    }

    // ---- The map: its systems and routes ----

    void Map()
    {
        if (mapRoot != null) Mats.Kill(mapRoot.gameObject);
        nodes.Clear();
        mapRoot = new GameObject("Map").transform;
        mapRoot.SetParent(world, false);
        // (Centred on the strip, so the floor's haze is drawn round it.)
        var c = new Vector3(state.Nodes.Average(n => (float)n.X) * Scale, 0, -state.Nodes.Average(n => (float)n.Y) * Scale);
        world.Find("Floor").localPosition = new Vector3(c.x, 0, c.z);
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
        name.transform.localPosition = new Vector3(0, -0.1f, -0.45f);
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
            t.transform.localPosition = new Vector3(0, -0.1f, 0.42f);
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
        var first = state.Nodes.OrderBy(n => n.X).First();
        // (Before the strip's start, angled up along it, clear of its routes.)
        var at = NodePos(first.Id) + new Vector3(-5.2f, -0.55f, 0.9f);
        var name = Mats.FlatText("Galaxy", mapRoot, g.Name.ToUpperInvariant(), 4.6f, Look.InkSoft, true, 400, 30, TextAlignmentOptions.Left);
        name.rectTransform.sizeDelta = new Vector2(10, 1.2f);
        name.transform.localPosition = at;
        name.transform.localRotation = Quaternion.Euler(90, -28, 0);
        var text = Mats.FlatText("Galaxy words", mapRoot, g.Text, 2.0f, Look.InkSoft, false, 400, 0, TextAlignmentOptions.TopLeft);
        text.fontStyle = FontStyles.Italic;
        text.textWrappingMode = TextWrappingModes.Normal;
        text.rectTransform.sizeDelta = new Vector2(5f, 2f);
        text.transform.localPosition = at + Quaternion.Euler(0, -28, 0) * new Vector3(-2.2f, 0, -1.3f);
        text.transform.localRotation = Quaternion.Euler(90, -28, 0);
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
        if (wheel != 0) distanceGoal = Mathf.Clamp(distanceGoal * (1 - wheel * 0.08f), 5, 22);
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
        var dir = Quaternion.Euler(52, -8, 0) * Vector3.forward;
        Cam.transform.position = focus - dir * distance;
        Cam.transform.rotation = Quaternion.LookRotation(dir, Vector3.up);
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
        else { focusGoal = NodePos(id); Sound.Play("hover"); Refresh(); }
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
        focusGoal = NodePos(toId);
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
            if (f != null) focus = focusGoal = NodePos(f.NodeId);
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
        if (f != null) focus = focusGoal = NodePos(f.NodeId);
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
