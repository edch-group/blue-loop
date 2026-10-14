using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using UnityEngine.Rendering;
using UMesh = UnityEngine.Mesh;

/// <summary>
/// The campaign map's things as 3D objects (nebula-objects.ts): each system's sun, all alike in the board's paper and
/// gold, alive (its surface churning, its size breathing, a soft glow round it), ringed in its holder's colour when it
/// is held; one in reach pulsing, rings going out from it like sonar; one collapsing red, one gone a small grey ember.
/// Round a space station's star the station circles; over a research station's its test tube hovers; over a rival
/// hero's, their race's ship. The routes, tubes of soft light. The ships, hovering over their stars, flying or warping
/// from star to star, their engines burning. The Stellari over the wormhole's sun. And, under the map, what lies under
/// this galaxy (a black hole at the bottom of its well, a pulsar whose beams sweep across the land); in the Dark
/// Galaxy, nothing at all but what the ship can see, its stars black.
/// Everything is laid out in the web's own units and axes, then carried into this world (scaled by G, z flipped):
/// the models are mirrored as they go, so they read as the web draws them.
/// </summary>
public partial class CampaignView
{
    // ---- Colours ----

    static readonly Color SunPaper = new Color(0.975f, 0.97f, 0.955f);
    static readonly Color MapInk = new Color(0.42f, 0.48f, 0.62f);
    static readonly Color HoleGold = new Color(0.86f, 0.66f, 0.31f);
    /// <summary>A system gone next turn: red.</summary>
    static readonly Color DoomRed = new Color(0.86f, 0.26f, 0.22f);
    static readonly Color SeaBlue = new Color(0.52f, 0.72f, 0.88f);
    static readonly string[] FactionHex = { "#6f9fd8", "#d48a7c", "#c9a95e", "#a08bcb", "#5d5398", "#c7783e", "#8fa6c4", "#d9503a" };
    const string LostHex = "#9a94b0", NeutralHex = "#c9cbd0";

    static Color Hex(string h) => ColorUtility.TryParseHtmlString(h, out var c) ? c : new Color(0.6f, 0.6f, 0.6f);

    /// <summary>A holder's colour (their race's; the Lost Races' own).</summary>
    Color ColourOf(string factionId)
    {
        if (factionId == "lost") return Hex(LostHex);
        int race = state.Factions.FirstOrDefault(f => f.Id == factionId)?.Race ?? 0;
        return Hex(FactionHex[Mathf.Clamp(race, 0, FactionHex.Length - 1)]);
    }

    /// <summary>Each challenge's colour on the map, its ring and its route (a mine's rust: never pink).</summary>
    static Color ChallengeColour(string kind) => Hex(kind == "mine" ? "#c8553a" : kind == "lord" ? "#d4a02a" : kind == "frost" ? "#5aa8e0" : "#6b4fc8");

    /// <summary>A stable number to vary each system by (campaign.ts seedOf, times ten).</summary>
    static float SeedOf(string id)
    {
        uint h = 0;
        foreach (var ch in id) h = unchecked(h * 31 + ch);
        return (h % 1000) / 1000f * 10;
    }

    /// <summary>The clock the map's things keep (the shaders' own, in play).</summary>
    static float Clock => Application.isPlaying ? Time.timeSinceLevelLoad : 30;

    /// <summary>A point of the web's world in this one.</summary>
    static Vector3 U(float x, float y, float z) => new Vector3(x * G, y * G, -z * G);
    static Vector3 U(Vector3 w) => U(w.x, w.y, w.z);
    static Vector3 Mirror(Vector3 v) => new Vector3(v.x, v.y, -v.z);

    /// <summary>
    /// A thing placed as the web places it: at `p`, its own x along `f`, its y along `up`, its z along `rt` (all in the
    /// web's axes), scaled by `sx`, `sy`, `sz`; mirrored into this world, as the web's whole world is.
    /// </summary>
    static void Place(Transform t, Vector3 p, Vector3 f, Vector3 up, Vector3 rt, float sx, float sy, float sz)
    {
        // (Axes that turn the hand round, as the web's lab has, laid along by its length the other way.)
        if (Vector3.Dot(Vector3.Cross(up, rt), f) < 0) sx = -sx;
        t.localPosition = U(p);
        t.localRotation = Quaternion.LookRotation(-Mirror(rt), Mirror(up));
        t.localScale = new Vector3(sx * G, sy * G, -sz * G);
    }

    /// <summary>The web's model() turning (about x, then about y), as this world turns it.</summary>
    static Quaternion Turned(float rx, float ry) => Quaternion.AngleAxis(-ry * Mathf.Rad2Deg, Vector3.up) * Quaternion.AngleAxis(-rx * Mathf.Rad2Deg, Vector3.right);

    // ---- The shapes they are made of (each as the web builds it: position, then its data in the normal) ----

    static UMesh sphereMesh, discMesh, beamMesh, petalMesh, spikeMesh, quadMesh;

    static UMesh Shape(string name, List<float> d)
    {
        int n = d.Count / 6;
        var pos = new Vector3[n];
        var nor = new Vector3[n];
        var tri = new int[n];
        for (int i = 0; i < n; i++)
        {
            pos[i] = new Vector3(d[i * 6], d[i * 6 + 1], d[i * 6 + 2]);
            nor[i] = new Vector3(d[i * 6 + 3], d[i * 6 + 4], d[i * 6 + 5]);
            tri[i] = i;
        }
        var m = new UMesh { name = name, vertices = pos, normals = nor, triangles = tri };
        m.RecalculateBounds();
        return m;
    }

    /// <summary>A unit sphere, as triangles (its normal its own point).</summary>
    static UMesh SphereShape()
    {
        if (sphereMesh != null) return sphereMesh;
        var o = new List<float>();
        const int S = 18, R = 12;
        void Corner(int ci, int cj)
        {
            float th = ci / (float)S * Mathf.PI * 2, ph = cj / (float)R * Mathf.PI;
            float x = Mathf.Sin(ph) * Mathf.Cos(th), y = Mathf.Cos(ph), z = Mathf.Sin(ph) * Mathf.Sin(th);
            o.AddRange(new[] { x, y, z, x, y, z });
        }
        for (int j = 0; j < R; j++)
            for (int i = 0; i < S; i++)
            {
                Corner(i, j); Corner(i + 1, j); Corner(i + 1, j + 1);
                Corner(i, j); Corner(i + 1, j + 1); Corner(i, j + 1);
            }
        return sphereMesh = Shape("map sphere", o);
    }

    /// <summary>A flat ring from radius 1 to 2.6 (its data: how far out, 0 to 1, and the angle).</summary>
    static UMesh DiscShape()
    {
        if (discMesh != null) return discMesh;
        var o = new List<float>();
        const int N = 64;
        void Corner(int ci, bool outer)
        {
            float a = ci / (float)N * Mathf.PI * 2, r = outer ? 2.6f : 1;
            o.AddRange(new[] { Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r, outer ? 1 : 0, a, 0 });
        }
        for (int i = 0; i < N; i++)
        {
            Corner(i, false); Corner(i, true); Corner(i + 1, true);
            Corner(i, false); Corner(i + 1, true); Corner(i + 1, false);
        }
        return discMesh = Shape("map disc", o);
    }

    /// <summary>A cone from the origin out along +y to length 1, radius 0.14 there (its data: how far along).</summary>
    static UMesh BeamShape()
    {
        if (beamMesh != null) return beamMesh;
        var o = new List<float>();
        const int N = 16;
        for (int i = 0; i < N; i++)
        {
            float a = i / (float)N * Mathf.PI * 2, b = (i + 1) / (float)N * Mathf.PI * 2;
            o.AddRange(new[] { 0f, 0, 0, 0, 0, 0, Mathf.Cos(a) * 0.14f, 1, Mathf.Sin(a) * 0.14f, 1, 0, 0, Mathf.Cos(b) * 0.14f, 1, Mathf.Sin(b) * 0.14f, 1, 0, 0 });
        }
        return beamMesh = Shape("map beam", o);
    }

    /// <summary>A flat shape as a fan from a middle point to its outline (its data: 0 at the middle, 1 on the outline).</summary>
    static UMesh Fan(string name, Vector2[] outline, Vector2 mid)
    {
        var o = new List<float>();
        for (int i = 0; i < outline.Length; i++)
        {
            Vector2 a = outline[i], b = outline[(i + 1) % outline.Length];
            o.AddRange(new[] { mid.x, mid.y, 0, 0, 0, 0, a.x, a.y, 0, 1, 0, 0, b.x, b.y, 0, 1, 0, 0 });
        }
        return Shape(name, o);
    }

    /// <summary>A petal of the board's star: an ellipse through the middle (half-width 0.29, half-length 1).</summary>
    static UMesh PetalShape() => petalMesh != null ? petalMesh : petalMesh = Fan("map petal", Enumerable.Range(0, 48).Select(i => new Vector2(Mathf.Cos(i / 48f * Mathf.PI * 2) * 0.29f, Mathf.Sin(i / 48f * Mathf.PI * 2))).ToArray(), Vector2.zero);

    /// <summary>A spike of its inner ring: a slim diamond from the middle out (to 0.79, widest at 0.61).</summary>
    static UMesh SpikeShape() => spikeMesh != null ? spikeMesh : spikeMesh = Fan("map spike", new[] { new Vector2(0, 0), new Vector2(0.079f, 0.606f), new Vector2(0, 0.788f), new Vector2(-0.079f, 0.606f) }, new Vector2(0, 0.5f));

    /// <summary>A square of corners -1 to 1, for a sprite (its bounds a cube, so it is never culled as it turns to the eye).</summary>
    static UMesh QuadShape()
    {
        if (quadMesh != null) return quadMesh;
        quadMesh = new UMesh { name = "map sprite" };
        quadMesh.vertices = new[] { new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(1, 1, 0), new Vector3(-1, 1, 0) };
        quadMesh.normals = new[] { Vector3.back, Vector3.back, Vector3.back, Vector3.back };
        quadMesh.triangles = new[] { 0, 1, 2, 0, 2, 3 };
        quadMesh.bounds = new Bounds(Vector3.zero, Vector3.one * 2);
        return quadMesh;
    }

    // ---- Making them ----

    static Transform Thing(string name, Transform parent, UMesh mesh, Material m)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = m;
        r.shadowCastingMode = ShadowCastingMode.Off;
        r.receiveShadows = false;
        return go.transform;
    }

    /// <summary>A solid (MapSolid's kinds): drawn opaque, or blended over what lies beneath.</summary>
    static Material SolidMat(int kind, Color c, float alpha, float seed, bool blended, bool depthTest = true, int queue = 0)
    {
        var m = Mats.Make("MapSolid", c);
        m.SetFloat("_Kind", kind);
        m.SetFloat("_Alpha", alpha);
        m.SetFloat("_Seed", seed);
        m.SetFloat("_Src", (float)BlendMode.One);
        m.SetFloat("_Dst", blended ? (float)BlendMode.OneMinusSrcAlpha : (float)BlendMode.Zero);
        m.SetFloat("_ZWrite", blended ? 0 : 1);
        m.SetFloat("_ZTest", depthTest ? (float)CompareFunction.LessEqual : (float)CompareFunction.Always);
        m.renderQueue = queue != 0 ? queue : blended ? 3000 : 2000;
        return m;
    }

    /// <summary>A disc facing the camera: a glow (0), a fine ring (1), a dashed ring turning (3), rings pulsing out (4).</summary>
    class Spr
    {
        public Transform T;
        public Material M;
        public void Size(float web) => T.localScale = Vector3.one * Mathf.Max(1e-5f, web * G);
        public void Alpha(float a) => M.SetFloat("_Alpha", a);
        public void Show(bool on) { if (T.gameObject.activeSelf != on) T.gameObject.SetActive(on); }
    }

    static Spr Disc(Transform parent, string name, int kind, Color c, float alpha, float seed = 0, int queue = 3001, bool depthTest = true)
    {
        var m = Mats.Make("MapSprite", c);
        m.SetFloat("_Kind", kind);
        m.SetFloat("_Alpha", alpha);
        m.SetFloat("_Seed", seed);
        if (!depthTest) m.SetFloat("_ZTest", (float)CompareFunction.Always);
        m.renderQueue = queue;
        return new Spr { T = Thing(name, parent, QuadShape(), m), M = m };
    }

    /// <summary>Everything under the map taken away, with the materials made for it.</summary>
    static void KillAll(GameObject go)
    {
        if (go == null) return;
        var made = new HashSet<Material>();
        foreach (var r in go.GetComponentsInChildren<Renderer>(true))
            if (r.sharedMaterial != null) made.Add(r.sharedMaterial);
        foreach (var m in made) Mats.Kill(m);
        Mats.Kill(go);
    }

    // ---- The systems ----

    /// <summary>A system as drawn: what it is, and its parts.</summary>
    class StarThing
    {
        public string Id;
        public Vector3 At;
        public bool Heart, Dim, Doom, Dead, Reach, Black;
        public Color? Ring;
        public float Seed;
        public Transform Star;
        public Spr Glow, Pulse, Dash, Fine, Flare, Turn;
        public Transform Prop;
        public Spr PropGlow;
        public string PropKind;
    }

    readonly List<StarThing> stars3d = new List<StarThing>();
    /// <summary>The system under the pointer (it swells and flares), and how far each has swelled (0 to 1).</summary>
    string hovered;
    readonly Dictionary<string, float> hoverAmt = new Dictionary<string, float>();

    /// <summary>A system's sun and the light round it (nebula-objects.ts draw), on its place on the map.</summary>
    void Sun3d(CampaignNode n, Transform root)
    {
        var s = state;
        var w = Web(n.X, n.Y);
        var user = StationUser(n, s.PlayerId);
        var st = new StarThing
        {
            Id = n.Id,
            At = new Vector3(w.x, (float)(n.H ?? 0) * MapK, w.y),
            Heart = n.Heart == true,
            // (A station used, its research taken or its dock traded at, shows as the player's.)
            Ring = n.Challenge != null ? ChallengeColour(n.Challenge.Kind) : n.Owner != null ? ColourOf(n.Owner) : user != null ? ColourOf(user) : (Color?)null,
            Dim = n.Dimmed == true || n.Collapsing == true || n.Challenge?.Done != null,
            Doom = n.Collapsing == true,
            Dead = n.Collapsed == true || n.Ruined == true,
            // (In the Dark Galaxy its stars are black.)
            Black = s.Rift?.Kind == "dark",
            Seed = SeedOf(n.Id),
        };
        if (st.Dead) st.Star = Thing("Star", root, SphereShape(), SolidMat(4, new Color(0.62f, 0.62f, 0.64f), 1, 0, false));
        else
        {
            // A held sun takes its holder's colour, softened toward the paper.
            var b = st.Black ? new Color(0.05f, 0.04f, 0.08f) : SunPaper;
            var held = st.Ring is Color rc ? new Color(b.r * 0.45f + rc.r * 0.55f, b.g * 0.45f + rc.g * 0.55f, b.b * 0.45f + rc.b * 0.55f) : b;
            int kind = st.Black ? 1 : st.Dim && !st.Doom ? 4 : 0;
            var colour = st.Doom ? DoomRed : st.Dim ? new Color(0.8f, 0.81f, 0.84f) : held;
            st.Star = Thing("Star", root, SphereShape(), SolidMat(kind, colour, 1, st.Seed, false));
            var mark = st.Ring ?? MapInk;
            // A bright flare and a turning ring of light round a hovered star.
            st.Flare = Disc(root, "Flare", 0, Color.white, 0);
            st.Turn = Disc(root, "Turning", 4, mark, 0, st.Seed);
            if (st.Doom)
            {
                st.Glow = Disc(root, "Glow", 0, DoomRed, 0.45f);
                st.Fine = Disc(root, "Ring", 1, DoomRed, 1);
            }
            else if (st.Dim) st.Glow = Disc(root, "Glow", 0, Color.white, 0.2f);
            else
            {
                // A soft paper glow; where the player can travel, a fine dashed ring turning slowly and rings pulsing out
                // (in ink, or the holder's colour once held). (Black: a faint violet light.)
                st.Glow = Disc(root, "Glow", 0, st.Black ? new Color(0.55f, 0.42f, 0.95f) : Color.white, st.Black ? 0.35f : 0.7f);
                st.Pulse = Disc(root, "Reach", 4, mark, 0.6f, st.Seed);
                st.Dash = Disc(root, "Reach dashes", 3, mark, 0.35f, st.Seed);
            }
            if (st.Ring is Color ring && !st.Doom) st.Fine = Disc(root, "Ring", 1, ring, 1);
            // Its station, so it can be found (a space station circling it, a research station's test tube over it); a
            // rival hero waiting there, their race's ship over it.
            string kindOf = n.Station?.Kind == "armory" ? "station" : n.Station != null ? "lab" : n.Rival != null ? "rival" : null;
            if (kindOf != null)
            {
                var mesh = kindOf == "rival"
                    ? ModelMesh.Of("race:" + RaceOf(n.Rival), () => BlueLoop.Models.Ship3d.ShipModel3d(RaceOf(n.Rival)).Mesh)
                    : ModelMesh.Of("prop:" + kindOf, () => BlueLoop.Models.Ship3d.PropModel3d(kindOf == "station" ? BlueLoop.Models.PropKind.Station : BlueLoop.Models.PropKind.Lab));
                var go = ModelMesh.Make(kindOf, mesh, root, Color.white);
                var m = go.GetComponent<MeshRenderer>().sharedMaterial;
                m.SetFloat("_Flip", -1);
                m.SetFloat("_Alpha", st.Dim ? 0.55f : 1);
                st.Prop = go.transform;
                st.PropKind = kindOf;
                st.PropGlow = kindOf == "rival" ? Disc(root, "Prop glow", 0, new Color(1, 0.62f, 0.25f), 0.5f)
                    : kindOf == "lab" ? Disc(root, "Prop glow", 0, new Color(0.55f, 0.78f, 1), 0.5f)
                    : Disc(root, "Prop glow", 0, new Color(0.6f, 0.85f, 1), 0.35f);
            }
        }
        stars3d.Add(st);
    }

    static int RaceOf(string heroId)
    {
        try { return Cards.Def(heroId)?.Race ?? 0; }
        catch { return 0; }
    }

    /// <summary>Who has used a station (campaign.ts stationUser): its research's taker, or you, once you traded there.</summary>
    static string StationUser(CampaignNode n, string playerId)
    {
        var st = n.Station;
        if (st == null) return null;
        if (st.Kind == "research") return st.TakenBy;
        var u = st.Used;
        return u != null && (u.Buy == true || u.Recycle == true || u.Fuse == true || u.Part == true) ? playerId : null;
    }

    /// <summary>The suns this frame: breathing, turning, swelling where the pointer is; their props on their courses.</summary>
    void AnimateSuns(float time, float dt)
    {
        foreach (var id in hoverAmt.Keys.ToList())
        {
            float to = id == hovered ? 1 : 0, v = hoverAmt[id];
            float next = Application.isPlaying ? v + (to - v) * (1 - Mathf.Exp(-dt * (to > 0 ? 14 : 8))) : to;
            if (to == 0 && next < 0.005f) hoverAmt.Remove(id);
            else hoverAmt[id] = next;
        }
        if (hovered != null && !hoverAmt.ContainsKey(hovered)) hoverAmt[hovered] = 0;
        foreach (var st in stars3d)
        {
            if (st.Star == null) continue;
            float h = hoverAmt.TryGetValue(st.Id, out var hv) ? hv : 0;
            float k = 1 + 0.4f * h + 0.12f * Mathf.Sin(Mathf.PI * h);
            float r = (st.Heart ? 0.072f : 0.036f) * k;
            if (st.Dead)
            {
                st.Star.localScale = Vector3.one * r * 0.55f * G;
                continue;
            }
            // A slow pulse in its size, as if it breathes; turning slowly.
            float pulse = 1 + 0.035f * Mathf.Sin(time * 1.4f + st.Seed * 3);
            st.Star.localScale = Vector3.one * r * pulse * G;
            st.Star.localRotation = Turned(0.3f, time * 0.15f + st.Seed);
            st.Flare.Show(h > 0.01f);
            st.Turn.Show(h > 0.01f);
            if (h > 0.01f)
            {
                st.Flare.Size(r * 6);
                st.Flare.Alpha(0.55f * h);
                st.Turn.Size(r * (3.2f + 0.6f * h));
                st.Turn.Alpha(0.9f * h);
                st.Turn.M.SetFloat("_Seed", st.Seed + time * 0.4f);
            }
            if (st.Doom) st.Glow.Size(r * 3.2f);
            else if (st.Dim) st.Glow.Size(r * 2.4f);
            else
            {
                st.Glow.Size(r * 4 * (1 + 0.1f * Mathf.Sin(time * 1.1f + st.Seed)));
                st.Pulse.Show(st.Reach);
                st.Dash.Show(st.Reach);
                st.Pulse.Size(r * 4.4f);
                st.Dash.Size(r * 3.9f);
            }
            if (st.Fine != null) st.Fine.Size(r * 2.4f);
            if (st.Prop != null) PoseProp(st, time);
        }
    }

    /// <summary>
    /// A station circling its star, a little above it, its ring tipped toward its course and turning on its own; a lab's
    /// test tube hovering upright over its star, turning slowly, bobbing; a rival's ship over the star, swinging slowly
    /// to and fro. (Placed relative to the star: the system's own place is where the star stands.)
    /// </summary>
    void PoseProp(StarThing st, float time)
    {
        float seed = st.Seed;
        Vector3 p, f, up, rt, glow;
        float S;
        if (st.PropKind == "rival")
        {
            S = 0.075f;
            p = new Vector3(0, 0.085f + 0.01f * Mathf.Sin(time * 1.1f + seed), 0);
            float yaw = Mathf.PI * 0.75f + 0.5f * Mathf.Sin(time * 0.35f + seed);
            f = new Vector3(Mathf.Cos(yaw), 0, Mathf.Sin(yaw));
            up = Vector3.up;
            rt = new Vector3(-f.z, 0, f.x);
            glow = p - new Vector3(0, 0.02f, 0);
            st.PropGlow.Size(0.13f);
        }
        else if (st.PropKind == "lab")
        {
            S = 0.12f;
            p = new Vector3(0, 0.125f + 0.012f * Mathf.Sin(time * 1.3f + seed), 0);
            float turn = time * 0.5f + seed;
            f = Vector3.up;
            up = new Vector3(Mathf.Cos(turn), 0, Mathf.Sin(turn));
            rt = new Vector3(-Mathf.Sin(turn), 0, Mathf.Cos(turn));
            glow = p + new Vector3(0, S * 0.35f, 0);
            st.PropGlow.Size(0.12f);
        }
        else
        {
            S = 0.12f;
            float a = time * 0.5f + seed * 2.3f;
            p = new Vector3(Mathf.Cos(a) * 0.11f, 0.03f, Mathf.Sin(a) * 0.11f);
            float yaw = time * 0.8f + seed, tilt = 0.35f;
            float cy = Mathf.Cos(yaw), sy = Mathf.Sin(yaw), ct = Mathf.Cos(tilt), sn = Mathf.Sin(tilt);
            // Its own axes: forward turned by yaw, up tipped by tilt about forward.
            f = new Vector3(cy, 0, sy);
            var r0 = new Vector3(-sy, 0, cy);
            up = new Vector3(r0.x * -sn, ct, r0.z * -sn);
            rt = new Vector3(r0.x * ct, sn, r0.z * ct);
            glow = p;
            st.PropGlow.Size(0.11f);
        }
        Place(st.Prop, p, f, up, rt, S, S, S);
        st.PropGlow.T.localPosition = U(glow);
    }

    // ---- The routes ----

    /// <summary>A route between two systems (the web's world x, y, z at each end): its colour, gone (a faint dashed trace), lit (and flaring, just linked).</summary>
    struct RouteLine { public Vector3 A, B; public Color Colour; public bool Gone; public float Glow; }

    Transform routesT;

    /// <summary>
    /// The routes, as tubes of soft light in the scene (campaign.ts rays): each once; none into the fog or to a hidden
    /// challenge; a route to a fallen system a faint trace; a challenge's in its own colour (a trace once it is done);
    /// between two systems held by the same holder, in the holder's colour. In Time Dense Space, from each star in
    /// reach, dashed, the routes it would have once the rings have turned; mid-turn, the routes breaking drawn back into
    /// their moving star, the new ones reaching out from it and flaring as they link (TurnRoutes).
    /// </summary>
    void Routes(HashSet<string> seen)
    {
        if (routesT != null) KillAll(routesT.gameObject);
        routesT = null;
        var s = state;
        var lines = new List<RouteLine>();
        Vector3 At(CampaignNode q) { var w = Web(q.X, q.Y); return new Vector3(w.x, (float)(q.H ?? 0) * MapK, w.y); }
        foreach (var a in s.Nodes)
            foreach (var bid in a.Links)
            {
                if (string.CompareOrdinal(a.Id, bid) >= 0) continue;
                var b = s.Nodes.FirstOrDefault(q => q.Id == bid);
                if (b == null || a.Vanished == true || b.Vanished == true) continue;
                if (a.Challenge?.Hidden == true || b.Challenge?.Hidden == true) continue;
                if (!seen.Contains(a.Id) || !seen.Contains(b.Id)) continue;
                if (Turning(a.Id, b.Id)) continue;
                if (a.Collapsed == true || b.Collapsed == true) { lines.Add(new RouteLine { A = At(a), B = At(b), Colour = Color.white, Gone = true }); continue; }
                var ch = a.Challenge ?? b.Challenge;
                bool same = a.Owner != null && a.Owner == b.Owner;
                lines.Add(new RouteLine { A = At(a), B = At(b), Colour = ch != null ? ChallengeColour(ch.Kind) : same ? ColourOf(a.Owner) : Color.white, Gone = ch?.Done != null });
            }
        var mine = Campaign.Flagship(s, s.PlayerId);
        if (turnAnim != null) TurnRoutes(lines, seen, At);
        else if (s.Rift?.Kind == "time" && s.Battle == null && mine != null)
            foreach (var m in Campaign.ArmyMoves(s, mine))
            {
                var from = s.Nodes.FirstOrDefault(q => q.Id == m.ToId);
                if (from == null) continue;
                foreach (var p in Campaign.TimePreview(s, m.ToId))
                {
                    var to = s.Nodes.FirstOrDefault(q => q.Id == p.Id);
                    var w = Web(p.X, p.Y);
                    lines.Add(new RouteLine { A = At(from), B = new Vector3(w.x, (float)(to?.H ?? 0) * MapK, w.y), Colour = Color.white, Gone = true });
                }
            }
        if (lines.Count == 0) return;
        // Each a ribbon of four corners: its ends, which side and how far along, its length (web units), how it is lit.
        var pos = new List<Vector3>();
        var ends = new List<Vector4>();
        var side = new List<Vector4>();
        var cols = new List<Color>();
        var tris = new List<int>();
        foreach (var l in lines)
        {
            int at = pos.Count;
            Vector3 a = U(l.A), b = U(l.B);
            float len = Vector3.Distance(l.A, l.B);
            foreach (var (sx, sy) in new[] { (-1f, 0f), (1f, 0f), (1f, 1f), (-1f, 1f) })
            {
                pos.Add(a);
                ends.Add(new Vector4(b.x, b.y, b.z, 0));
                side.Add(new Vector4(sx, sy, len, l.Gone ? 0 : 1 + l.Glow));
                cols.Add(l.Colour);
            }
            tris.AddRange(new[] { at, at + 1, at + 2, at, at + 2, at + 3 });
        }
        var mesh = new UMesh { name = "routes", indexFormat = IndexFormat.UInt32 };
        mesh.SetVertices(pos);
        mesh.SetUVs(0, ends);
        mesh.SetUVs(1, side);
        mesh.SetColors(cols);
        mesh.SetTriangles(tris, 0);
        mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 200);
        var mat = Mats.Make("MapRoute");
        mat.SetFloat("_Width", 0.04f * G);
        mat.renderQueue = 3000;
        var go = Thing("Routes", mapRoot, mesh, mat);
        go.gameObject.AddComponent<MeshOwner>();
        routesT = go;
    }

    /// <summary>A mesh made for one object, taken away with it.</summary>
    public class MeshOwner : MonoBehaviour
    {
        void OnDestroy()
        {
            var f = GetComponent<MeshFilter>();
            if (f != null && f.sharedMesh != null) Mats.Kill(f.sharedMesh);
        }
    }

    // ---- What lies under the galaxy ----

    /// <summary>Where the black hole sits, at the bottom of its well (and the pulsar, just over the land).</summary>
    const float BlackHoleY = -1.02f, BlackHoleZ = -0.7f, PulsarY = -0.2f;
    Transform holeDisc, holeDisc2, pulsarSun, beamA, beamB;
    Spr pulsarGlow;

    /// <summary>
    /// What lies under the galaxy (drawGalaxy): a black hole at the bottom of its well, its accretion disc turning (two
    /// discs a little apart in tilt, turning at their own speeds, read as a thick, churning ring of matter); or a pulsar
    /// over the land, its two beams lying almost flat, sweeping round once every nine seconds (the land lights where they
    /// fall: Ground.shader).
    /// </summary>
    void Under()
    {
        holeDisc = holeDisc2 = pulsarSun = beamA = beamB = null;
        pulsarGlow = null;
        if (state.Rift?.Kind == "dark") return;
        if (state.Galaxy == "blackHole")
        {
            var hole = Thing("Black hole", mapRoot, SphereShape(), SolidMat(1, Color.black, 1, 0, false));
            hole.localPosition = U(0, BlackHoleY, BlackHoleZ);
            hole.localScale = Vector3.one * 0.16f * G;
            holeDisc = Thing("Accretion disc", mapRoot, DiscShape(), SolidMat(2, Color.white, 1, 0, true));
            holeDisc.localPosition = U(0, BlackHoleY, BlackHoleZ);
            holeDisc.localScale = Vector3.one * 0.2f * G;
            holeDisc2 = Thing("Accretion disc", mapRoot, DiscShape(), SolidMat(2, Color.white, 0.55f, 0, true));
            holeDisc2.localPosition = U(0, BlackHoleY + 0.01f, BlackHoleZ);
            holeDisc2.localScale = Vector3.one * 0.26f * G;
            var glow = Disc(mapRoot, "Black hole glow", 0, HoleGold, 0.35f, 0, 3000);
            glow.T.localPosition = U(0, BlackHoleY, BlackHoleZ);
            glow.Size(0.9f);
        }
        else if (state.Galaxy == "pulsar")
        {
            pulsarSun = Thing("Pulsar", mapRoot, SphereShape(), SolidMat(0, SunPaper, 1, 3, false));
            pulsarSun.localPosition = U(0, PulsarY, 0);
            pulsarSun.localScale = Vector3.one * 0.045f * G;
            beamA = Thing("Beam", mapRoot, BeamShape(), SolidMat(3, SeaBlue, 1, 0, true));
            beamB = Thing("Beam", mapRoot, BeamShape(), SolidMat(3, SeaBlue, 1, 0, true));
            foreach (var b in new[] { beamA, beamB })
            {
                b.localPosition = U(0, PulsarY, 0);
                // (Thin: the beam's width scaled down from its length.)
                b.localScale = new Vector3(0.35f, 7, 0.35f) * G;
            }
            // (Its glow over the land, not cut off where the ground rises into it: a soft light, not a solid.)
            pulsarGlow = Disc(mapRoot, "Pulsar glow", 0, SeaBlue, 0.9f, 0, 3000, false);
            pulsarGlow.T.localPosition = U(0, PulsarY, 0);
        }
    }

    void AnimateUnder(float time)
    {
        if (holeDisc != null) holeDisc.localRotation = Turned(0.12f, time * 0.25f);
        if (holeDisc2 != null) holeDisc2.localRotation = Turned(0.2f, -time * 0.18f + 1);
        if (pulsarSun != null) pulsarSun.localRotation = Turned(0, time);
        if (beamA != null)
        {
            // The pulsar's sweep: round once every 9 seconds (as the land's lighting has it).
            float beam = time * (Mathf.PI * 2 / 9);
            beamA.localRotation = Turned(Mathf.PI / 2 + 0.02f, beam);
            beamB.localRotation = Turned(Mathf.PI / 2 + 0.02f + Mathf.PI, beam);
        }
        if (pulsarGlow != null) pulsarGlow.Size(0.6f * (1 + 0.2f * Mathf.Sin(time * 9)));
    }

    // ---- The Stellari over the wormhole's sun ----

    readonly List<Transform> petals = new List<Transform>();
    Spr stellariGlow;
    StarThing heartStar;

    /// <summary>
    /// The Stellari (drawStellari), drawn as the battle board draws its star (a wireframe of fine silver lines over pale
    /// petals) but standing in the scene, over the land, never into it: floating just over the heart star, facing up,
    /// half closed like a tulip, two whorls of six petals cupped round its heart (the outer leaning further out), its
    /// spikes rising inside like stamens, the whole of it turning slowly and bobbing as if it breathed.
    /// </summary>
    void Stellari()
    {
        petals.Clear();
        stellariGlow = null;
        heartStar = stars3d.FirstOrDefault(st => st.Heart && !st.Dead);
        if (heartStar == null) return;
        var root = new GameObject("Stellari").transform;
        root.SetParent(mapRoot, false);
        // (One look for every part: fine lines, drawn over everything, furthest first.)
        var m = SolidMat(5, Color.white, 1, 0, true, false, 3010);
        for (int i = 0; i < 12; i++) petals.Add(Thing("Petal", root, PetalShape(), m));
        for (int i = 0; i < 18; i++) petals.Add(Thing("Spike", root, SpikeShape(), m));
        stellariGlow = Disc(root, "Glow", 0, Color.white, 0.3f, 0, 3011, false);
    }

    void AnimateStellari(float time)
    {
        if (heartStar == null || petals.Count < 30) return;
        const float L = 0.38f;
        float bob = 0.012f * Mathf.Sin(time * 0.9f);
        var bas = heartStar.At + new Vector3(0, 0.1f + bob, 0);
        float turn = time * 4 * Mathf.PI / 180;
        float b = 1 + 0.03f * Mathf.Sin(time * 0.9f);
        // A part standing from the base at azimuth `az`, leaning out by `lean` (radians from upright).
        void Part(Transform t, float az, float lean, float sx, float sy, float lift)
        {
            var o = new Vector3(Mathf.Cos(az), 0, Mathf.Sin(az));
            var up = new Vector3(o.x * Mathf.Sin(lean), Mathf.Cos(lean), o.z * Mathf.Sin(lean));
            var across = new Vector3(-Mathf.Sin(az), 0, Mathf.Cos(az));
            var through = Vector3.Cross(up, across);
            // (Its shape the same either side: laid across by the way that keeps its axes turning as a solid's do.)
            Place(t, bas + up * lift, -across, up, through, sx, sy, sx);
        }
        // (The petal's ellipse spans -1 to 1 along its length: lifted by its half-length, its tip sits on the base.)
        for (int i = 0; i < 12; i++)
        {
            bool outer = i % 2 == 0;
            float half = L / 2 * b * (outer ? 1 : 0.92f);
            Part(petals[i], turn + i * Mathf.PI / 6, outer ? 0.42f : 0.24f, L * (outer ? 0.72f : 0.6f) * b, half, half);
        }
        for (int i = 0; i < 18; i++)
            Part(petals[12 + i], -turn * 0.6f + (i * 20 + 10) * Mathf.PI / 180, 0.12f + 0.08f * (i % 3), L * 0.55f * b, L * 0.75f * b, 0);
        stellariGlow.T.localPosition = U(bas + new Vector3(0, L * 0.45f, 0));
        stellariGlow.Size(L * 1.1f);
    }

    // ---- The Dark Galaxy's dark ----

    Transform darkness;
    Material darkMat;

    /// <summary>The Dark Galaxy: no land, no gas, no sky; the dark lit only a little round the flagship.</summary>
    void Darkness()
    {
        bool dark = state.Rift?.Kind == "dark";
        if (!dark)
        {
            if (darkness != null) KillAll(darkness.gameObject);
            darkness = null;
            return;
        }
        if (darkness != null) return;
        var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
        Mats.Kill(q.GetComponent<Collider>());
        q.name = "Darkness";
        darkness = q.transform;
        darkness.SetParent(Cam.transform, false);
        darkMat = Mats.Make("Darkness");
        q.GetComponent<MeshRenderer>().sharedMaterial = darkMat;
    }

    void PlaceDarkness()
    {
        if (darkness == null) return;
        // (Held over the whole view, just past the near plane.)
        float d = Cam.nearClipPlane * 2;
        float h = 2 * d * Mathf.Tan(Cam.fieldOfView * 0.5f * Mathf.Deg2Rad) * 1.1f;
        darkness.localPosition = new Vector3(0, 0, d);
        darkness.localRotation = Quaternion.identity;
        darkness.localScale = new Vector3(h * Mathf.Max(0.1f, Cam.aspect) * 1.1f, h, 1);
        var f = Campaign.Flagship(state, state.PlayerId);
        var n = f != null ? state.Nodes.FirstOrDefault(x => x.Id == f.NodeId) : null;
        if (n != null)
        {
            var p = Cam.WorldToScreenPoint(world.TransformPoint(NodePos(n.Id)));
            darkMat.SetVector("_Centre", new Vector4(p.x, p.y, 0, 0));
        }
        darkMat.SetFloat("_Radius", 240f * Cam.pixelHeight / Hud.H);
    }

    // ---- The land's sky: the starry abyss under what has fallen, the stars and comets over it ----

    Material abyssMat;

    /// <summary>The abyss under the land, and the stars and comets over it, on the ground (in the web's units).</summary>
    void Sky(GameObject ground, UMesh groundMesh, BlueLoop.Models.NebulaShape shape)
    {
        abyssMat = AddAbyss(ground, groundMesh);
        // The stars over the land: fine ink points, a few in colour, twinkling.
        var st = shape.Stars;
        int n = st.Length / 6;
        var pos = new List<Vector3>(n * 4);
        var corner = new List<Vector2>(n * 4);
        var data = new List<Vector3>(n * 4);
        var tris = new List<int>(n * 6);
        var corners = new[] { new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1) };
        for (int i = 0; i < n; i++)
        {
            int at = pos.Count;
            foreach (var c in corners)
            {
                pos.Add(new Vector3(st[i * 6], st[i * 6 + 1], st[i * 6 + 2]));
                corner.Add(c);
                data.Add(new Vector3(st[i * 6 + 3], st[i * 6 + 4], st[i * 6 + 5]));
            }
            tris.AddRange(new[] { at, at + 1, at + 2, at, at + 2, at + 3 });
        }
        var sm = new UMesh { name = "stars", indexFormat = IndexFormat.UInt32 };
        sm.SetVertices(pos);
        sm.SetUVs(0, corner);
        sm.SetUVs(1, data);
        sm.SetTriangles(tris, 0);
        sm.RecalculateBounds();
        var smat = Mats.Make("Twinkle");
        smat.SetFloat("_G", G);
        Thing("Stars", ground.transform, sm, smat).gameObject.AddComponent<MeshOwner>();
        // Comets whistling by: a few, each a head and a tail of points, crossing at their own pace; after them, the
        // meteors of a shower (steeper, quicker, more often, falling into the hills).
        const int Comets = 4, Meteors = 30, Points = 28;
        var cpos = new List<Vector3>();
        var cdir = new List<Vector3>();
        var ccorner = new List<Vector2>();
        var cwhen = new List<Vector2>();
        var ck = new List<Vector2>();
        var ctris = new List<int>();
        for (int c = 0; c < Comets + Meteors; c++)
        {
            float R(int slot) => (float)(System.Math.Abs(System.Math.Sin(c * 12.9898 + slot * 78.233) * 43758.5453) % 1);
            float side = R(1) < 0.5f ? -1 : 1;
            bool meteor = c >= Comets;
            var start = meteor ? new Vector3(side * (3 + R(9) * 5), 4 + R(2) * 2, -7 + R(3) * 6) : new Vector3(side * 9, 1.4f + R(2) * 2.5f, -6 + R(3) * 4);
            var dir = (meteor ? new Vector3(-side * (0.4f + R(4) * 0.3f), -0.75f - R(5) * 0.2f, 0.15f + R(6) * 0.3f) : new Vector3(-side * (0.85f + R(4) * 0.1f), -0.12f - R(5) * 0.15f, 0.25f + R(6) * 0.3f)).normalized;
            float period = meteor ? 2.5f + R(7) * 4 : 14 + R(7) * 18, offset = R(8) * period;
            for (int k = 0; k < Points; k++)
            {
                int at = cpos.Count;
                foreach (var cc in corners)
                {
                    cpos.Add(start);
                    cdir.Add(dir);
                    ccorner.Add(cc);
                    cwhen.Add(new Vector2(period, offset));
                    ck.Add(new Vector2(k, c));
                }
                ctris.AddRange(new[] { at, at + 1, at + 2, at, at + 2, at + 3 });
            }
        }
        var cm = new UMesh { name = "comets", indexFormat = IndexFormat.UInt32 };
        cm.SetVertices(cpos);
        cm.SetNormals(cdir);
        cm.SetUVs(0, ccorner);
        cm.SetUVs(1, cwhen);
        cm.SetUVs(2, ck);
        cm.SetTriangles(ctris, 0);
        // (They fly far from where they start: never culled.)
        cm.bounds = new Bounds(Vector3.zero, Vector3.one * 80);
        var cmat = Mats.Make("Comet");
        cmat.SetFloat("_G", G);
        cmat.SetFloat("_Meteors", state.Galaxy == "meteors" ? 1 : 0);
        Thing("Comets", ground.transform, cm, cmat).gameObject.AddComponent<MeshOwner>();
    }

    /// <summary>
    /// The starry abyss under a land's fallen shards (nebula3d.ts MASK and ABYSS), on the land's own mesh: its material
    /// (set its _Gone, _Soft and _SoftBelow as the land's). The campaign menu's land can take it too.
    /// </summary>
    public static Material AddAbyss(GameObject ground, UMesh groundMesh)
    {
        var m = Mats.Make("Abyss");
        var t = Thing("Abyss", ground.transform, groundMesh, m);
        t.gameObject.layer = ground.layer;
        return m;
    }

    // ---- The ships ----

    /// <summary>A warp from star to star: how long it takes, and where its charge ends and its jump does (fractions of it).</summary>
    const float WarpSeconds = 1.1f, WarpCharge = 0.42f, WarpJump = 0.58f;
    /// <summary>A flight from star to star (the Captain's ship, without its warp drive): it turns to face where it is going, then flies there.</summary>
    const float FlyTurn = 0.4f, FlySeconds = FlyTurn + 1.3f;
    /// <summary>The ships' length (web units: the models are 1 long).</summary>
    const float ShipSize = 0.2f;

    /// <summary>A ship on the map: where it is bound (web x, z, over a star, and that star's height), its holder's colour, its model.</summary>
    class MapShip
    {
        public string Id;
        public float X, Z, Y;
        public Color Colour;
        public int Race;
        /// <summary>Flying in from here, taking this long (seconds): a ship arriving from off screen.</summary>
        public Vector2? From;
        public float Dur;
        /// <summary>Cruising: it flies slowly in, never quite arriving, until it is let go; first surging this far, this long.</summary>
        public bool Cruise;
        public float SurgeDist, SurgeDur;
        public BlueLoop.Models.CaptainShipSpec Captain;
        /// <summary>Bound somewhere new by flying there (the Captain's jumps without the warp drive), not warping.</summary>
        public bool Fly;
    }

    /// <summary>A ship as it flies: where it set out from and is bound, since when, and which way it faces.</summary>
    class ShipTrack
    {
        public string Id, ModelKey;
        public Transform T;
        public Material M;
        public Vector2 From, To;
        public float T0, Dur, Heading, FromY, ToY;
        public bool Warp;
        public float? Cruise;
        public float SurgeDist, SurgeDur;
        /// <summary>Turning first: its heading before, and how long the turn takes.</summary>
        public float? TurnFrom;
        public float TurnFor;
        public List<Vector3> Engines = new List<Vector3>(), Smoke = new List<Vector3>();
        /// <summary>The suns it carries (the Aureline's captive sun): where, in its own axes, how big; each its corona and its disc.</summary>
        public List<Vector3> SunAt = new List<Vector3>();
        public List<float> SunR = new List<float>();
        public readonly List<Spr> Flames = new List<Spr>(), Puffs = new List<Spr>(), Streak = new List<Spr>(), Coronas = new List<Spr>(), SunDiscs = new List<Spr>();
        public Spr Tear, Flash;
        public bool Hidden;
    }

    Transform shipsRoot;
    readonly Dictionary<string, ShipTrack> tracks = new Dictionary<string, ShipTrack>();
    /// <summary>A new run: the flagship flies in (cruising, through the opening shot), once.</summary>
    bool arriving;
    /// <summary>Set out from the menu: where the flagship sets out from over the land, and how far it surges as the camera pans.</summary>
    Vector2? launchFrom;
    float launchSurge;
    bool warpMove;

    /// <summary>The ships, as 3D objects (campaign.ts showNebula): each over the star it stands at; a rival come alongside.</summary>
    List<MapShip> ShipsNow(HashSet<string> seen)
    {
        var s = state;
        var mine = Campaign.Flagship(s, s.PlayerId);
        var list = new List<MapShip>();
        bool human = Campaign.Player(s).Human == true;
        foreach (var a in s.Armies)
        {
            if (!seen.Contains(a.NodeId)) continue;
            var n = s.Nodes.FirstOrDefault(q => q.Id == a.NodeId);
            if (n == null) continue;
            var w = Web(n.X, n.Y);
            var sh = new MapShip { Id = a.Id, X = w.x, Z = w.y, Y = (float)(n.H ?? 0) * MapK, Colour = ColourOf(a.Owner), Race = a.Lost != null ? -1 : s.Factions.FirstOrDefault(f => f.Id == a.Owner)?.Race ?? 0 };
            bool flag = mine != null && a.Id == mine.Id;
            // A new campaign: the flagship cruises in from off screen, behind the strip's near end, slowly, until the
            // hero has had their say (or, set out from the menu, from where the menu's ship was over the land).
            if (arriving && flag)
            {
                sh.From = launchFrom ?? new Vector2(w.x - 3.4f, w.y + 2.5f);
                sh.Dur = CineRideMax + 4;
                sh.Cruise = true;
                if (launchFrom != null)
                {
                    sh.SurgeDist = launchSurge;
                    sh.SurgeDur = LaunchPan;
                }
            }
            // (The Captain's ship: built from its fitted parts, and flying from star to star unless it warps.)
            if (flag && human)
            {
                sh.Captain = ShipSpec();
                sh.Fly = !warpMove;
            }
            list.Add(sh);
        }
        arriving = false;
        // A Power Struggle: the rival's ship comes alongside the flagship, drifting over from where it waited, or (an
        // ambush) flying in from the dark; it stays until the Captain has decided the rival's fate.
        string rivalNode = s.Struggle?.NodeId ?? s.Beaten?.NodeId, rivalHero = s.Struggle?.Hero ?? s.Beaten?.Hero;
        if (rivalNode != null && rivalHero != null && mine != null && seen.Contains(rivalNode))
        {
            var n = s.Nodes.FirstOrDefault(q => q.Id == rivalNode);
            if (n != null)
            {
                var w = Web(n.X, n.Y);
                int race = RaceOf(rivalHero);
                list.Add(new MapShip
                {
                    Id = "rival:" + rivalHero, X = w.x + 0.2f, Z = w.y - 0.15f, Y = (float)(n.H ?? 0) * MapK,
                    Colour = Hex(race >= 0 && race < FactionHex.Length ? FactionHex[race] : NeutralHex), Race = race,
                    From = s.Struggle?.Ambush == true ? new Vector2(w.x + 1.4f, w.y - 0.9f) : new Vector2(w.x, w.y), Dur = 1.4f,
                });
            }
        }
        return list;
    }

    /// <summary>
    /// The ships, and where each is bound (MapObjects.setShips): one bound somewhere new flies there from where it is now
    /// (the Captain's turning to face its way first, then flying; any other in a lightspeed warp, the same short time
    /// however far); one first seen is simply there (or arrives, as it is told).
    /// </summary>
    void SetShips(List<MapShip> list)
    {
        float now = Clock;
        if (shipsRoot == null)
        {
            shipsRoot = new GameObject("Ships").transform;
            shipsRoot.SetParent(world, false);
        }
        var live = new HashSet<string>(list.Select(x => x.Id));
        foreach (var id in tracks.Keys.ToList())
            if (!live.Contains(id))
            {
                if (tracks[id].T != null) KillAll(tracks[id].T.gameObject);
                tracks.Remove(id);
            }
        foreach (var sh in list)
        {
            var key = sh.Captain != null ? "captain" : "race:" + sh.Race;
            if (!tracks.TryGetValue(sh.Id, out var was))
            {
                var from = Application.isPlaying && sh.From != null ? sh.From.Value : new Vector2(sh.X, sh.Z);
                bool arrive = Application.isPlaying && sh.From != null;
                var tr = new ShipTrack
                {
                    Id = sh.Id, From = from, To = new Vector2(sh.X, sh.Z), T0 = now, Dur = arrive ? sh.Dur : 0,
                    Heading = arrive ? Mathf.Atan2(sh.Z - from.y, sh.X - from.x) : 0, FromY = sh.Y, ToY = sh.Y,
                };
                // (Cruising: it flies slowly in, never quite arriving, until it is let go: see Release.)
                if (arrive && sh.Cruise)
                {
                    tr.Cruise = Mathf.Max(0.01f, Vector2.Distance(new Vector2(sh.X, sh.Z), from) * 0.85f - sh.SurgeDist) / sh.Dur;
                    tr.SurgeDist = sh.SurgeDist;
                    tr.SurgeDur = sh.SurgeDur;
                }
                tracks[sh.Id] = tr;
                Model(tr, sh, key);
                continue;
            }
            if (was.ModelKey != key || was.ModelKey == "captain") Model(was, sh, key);
            was.M.color = sh.Colour;
            Bound(was, new Vector2(sh.X, sh.Z), sh.Y, sh.Fly);
        }
    }

    /// <summary>
    /// A ship bound somewhere new (web x, z; the star's height there): from where it is now, flying (turning to face its
    /// way first) or in a lightspeed warp [direction: not flying gently toward the stars], the same short time however
    /// far. Bound where it already is, nothing.
    /// </summary>
    void Bound(ShipTrack was, Vector2 to, float y, bool fly)
    {
        float now = Clock;
        if (Vector2.Distance(was.To, to) < 1e-4f) return;
        var at = ShipAt(was, now);
        was.FromY = GroundY(was, now);
        was.ToY = y;
        float d = Vector2.Distance(to, at);
        was.From = at;
        was.To = to;
        was.T0 = now;
        was.TurnFrom = null;
        was.TurnFor = 0;
        bool playing = Application.isPlaying;
        if (fly)
        {
            was.Dur = playing ? FlySeconds : 0;
            was.Warp = false;
            if (playing && d > 1e-4f)
            {
                was.TurnFrom = was.Heading;
                was.TurnFor = FlyTurn;
            }
        }
        else
        {
            was.Dur = playing ? WarpSeconds : 0;
            was.Warp = true;
        }
        if (d > 1e-4f) was.Heading = Mathf.Atan2(to.y - at.y, to.x - at.x);
    }

    /// <summary>A ship's model (the Captain's as fitted, or its race's), its engines' glow, a battered engine's smoke.</summary>
    void Model(ShipTrack tr, MapShip sh, string key)
    {
        BlueLoop.Models.ShipModel model = sh.Captain != null ? BlueLoop.Models.CaptainShip.CaptainShipMap(sh.Captain) : BlueLoop.Models.Ship3d.ShipModel3d(sh.Race);
        var mesh = sh.Captain != null ? ModelMesh.CaptainShipMesh(sh.Captain) : ModelMesh.Of("race:" + sh.Race, () => model.Mesh);
        if (tr.T != null && tr.ModelKey == key && tr.T.GetComponent<MeshFilter>().sharedMesh == mesh) return;
        if (tr.T != null) KillAll(tr.T.gameObject);
        tr.ModelKey = key;
        var go = ModelMesh.Make(tr.Id, mesh, shipsRoot, sh.Colour);
        tr.T = go.transform;
        tr.M = go.GetComponent<MeshRenderer>().sharedMaterial;
        tr.M.SetFloat("_Flip", -1);
        tr.Engines = model.Engines.Select(e => new Vector3((float)e.X, (float)e.Y, (float)e.Z)).ToList();
        tr.Smoke = (model.Smoke ?? new List<BlueLoop.Models.V3>()).Select(e => new Vector3((float)e.X, (float)e.Y, (float)e.Z)).ToList();
        var suns = model.Suns ?? new List<BlueLoop.Models.CarriedSun>();
        tr.SunAt = suns.Select(c => new Vector3((float)c.At.X, (float)c.At.Y, (float)c.At.Z)).ToList();
        tr.SunR = suns.Select(c => (float)c.R).ToList();
        tr.Flames.Clear();
        tr.Puffs.Clear();
        tr.Streak.Clear();
        tr.Coronas.Clear();
        tr.SunDiscs.Clear();
        // (Its glow and trails hang off the ship's own object, so they go with it; placed in the map's space.)
        var fx = new GameObject("Light").transform;
        fx.SetParent(tr.T, false);
        var glow = model.Glow;
        var flame = new Color(0.55f + (float)glow.R * 0.45f, 0.55f + (float)glow.G * 0.45f, 0.55f + (float)glow.B * 0.45f);
        foreach (var spot in tr.Engines) tr.Flames.Add(Disc(fx, "Engine", 0, flame, 0.9f));
        foreach (var vent in tr.Smoke)
            for (int i = 0; i < 6; i++) tr.Puffs.Add(Disc(fx, "Smoke", 0, new Color(0.42f, 0.43f, 0.47f), 0));
        var tint = new Color(0.75f + sh.Colour.r * 0.25f, 0.85f + sh.Colour.g * 0.15f, 1);
        for (int i = 0; i <= 18; i++) tr.Streak.Add(Disc(fx, "Streak", 0, tint, 0));
        // A captive sun: the stellar gem's pictures, its corona and its disc over it.
        for (int i = 0; i < tr.SunAt.Count; i++)
        {
            tr.Coronas.Add(Picture(fx, "Sun corona", SunCorona, 3001));
            tr.SunDiscs.Add(Picture(fx, "Sun disc", SunDisc, 3002));
        }
        tr.Tear = Disc(fx, "Tear", 0, tint, 0);
        tr.Flash = Disc(fx, "Flash", 0, tint, 0);
        Show(tr, !tr.Hidden);
    }

    static Texture2D sunDisc, sunCorona;
    static Texture2D SunDisc => sunDisc != null ? sunDisc : (sunDisc = Clamped(Resources.Load<Texture2D>("Sun/sun-disc")));
    static Texture2D SunCorona => sunCorona != null ? sunCorona : (sunCorona = Clamped(Resources.Load<Texture2D>("Sun/sun-corona")));
    static Texture2D Clamped(Texture2D t)
    {
        if (t != null) t.wrapMode = TextureWrapMode.Clamp;
        return t;
    }

    /// <summary>A picture facing the camera (MapSprite's kind 5), turned by its seed.</summary>
    static Spr Picture(Transform parent, string name, Texture2D tex, int queue)
    {
        var d = Disc(parent, name, 5, Color.white, 1, 0, queue);
        d.M.SetTexture("_MainTex", tex);
        return d;
    }

    static void Show(ShipTrack tr, bool on)
    {
        foreach (var r in tr.T.GetComponentsInChildren<Renderer>(true)) r.enabled = on;
    }

    /// <summary>How far through its course a ship is (0 to 1): after its turn, if it turned first.</summary>
    static float TravelK(ShipTrack sh, float now)
    {
        float turn = sh.TurnFor;
        return sh.Dur > turn ? Mathf.Clamp01((now - sh.T0 - turn) / (sh.Dur - turn)) : 1;
    }

    /// <summary>Which way a ship faces: turning, eased round from where it faced to its course.</summary>
    static float HeadingAt(ShipTrack sh, float now)
    {
        if (sh.TurnFrom == null || sh.TurnFor <= 0) return sh.Heading;
        float k = Mathf.Clamp01((now - sh.T0) / sh.TurnFor);
        float e = k * k * (3 - 2 * k);
        float from = sh.TurnFrom.Value;
        float d = Mathf.Atan2(Mathf.Sin(sh.Heading - from), Mathf.Cos(sh.Heading - from));
        return from + d * e;
    }

    /// <summary>The height of the route under a ship, eased from the star it left to the one it is bound for.</summary>
    static float GroundY(ShipTrack sh, float now)
    {
        if (sh.Cruise != null) return sh.ToY;
        float t = TravelK(sh, now);
        return sh.FromY + (sh.ToY - sh.FromY) * t * t * (3 - 2 * t);
    }

    /// <summary>How high a ship flies: hovering over its route, bobbing as it does at rest.</summary>
    static float Lift(ShipTrack sh, float now, float time) => GroundY(sh, now) + 0.13f + Mathf.Sin(time * 1.3f) * 0.006f + (sh.Cruise != null ? 0.05f : 0);

    /// <summary>
    /// A warp, at a moment: how far it has come (a little past, settling, as it arrives), how long the ship is drawn
    /// (stretched along its course in the jump), how hard its engines burn, and which part of it this is: charging
    /// (holding at its star, creeping back, burning ever brighter), the jump (an instant's streak), the arrival.
    /// </summary>
    static (float along, float stretch, float burn, int phase) WarpAt(float k)
    {
        if (k < WarpCharge)
        {
            float t = k / WarpCharge;
            return (-0.035f * Mathf.Sin(Mathf.PI / 2 * t), 1 - 0.12f * t, 1 + 2.5f * t * t, 0);
        }
        if (k < WarpJump)
        {
            float t = (k - WarpCharge) / (WarpJump - WarpCharge);
            return (-0.035f + 1.035f * t * t, 1 + 7 * Mathf.Sin(Mathf.PI * Mathf.Min(1, t * 1.15f)), 3.5f, 1);
        }
        float u = (k - WarpJump) / (1 - WarpJump);
        return (1 + 0.06f * Mathf.Exp(-5 * u) * Mathf.Sin(Mathf.PI * 2.2f * u), 1 + 0.5f * Mathf.Sin(Mathf.PI * Mathf.Min(1, u * 3)) * (1 - u), 1 + 2 * (1 - u), 2);
    }

    /// <summary>Where a ship is at a moment (web x, z).</summary>
    static Vector2 ShipAt(ShipTrack sh, float now)
    {
        if (sh.Cruise != null)
        {
            float len = Vector2.Distance(sh.To, sh.From);
            if (len < 1e-6f) len = 1;
            float k = sh.SurgeDur > 0 ? Mathf.Clamp01((now - sh.T0) / sh.SurgeDur) : 0;
            float d = Mathf.Min(len * 0.85f, sh.Cruise.Value * Mathf.Max(0, now - sh.T0) + (sh.SurgeDur > 0 ? sh.SurgeDist * k * k * (3 - 2 * k) : 0));
            return sh.From + (sh.To - sh.From) * (d / len);
        }
        float t = TravelK(sh, now);
        float e = sh.Warp && t < 1 ? WarpAt(t).along : t * t * (3 - 2 * t);
        return sh.From + (sh.To - sh.From) * e;
    }

    /// <summary>Where a ship is now (web x, y, z) and which way it faces.</summary>
    bool ShipPose(string id, out Vector3 at, out float heading)
    {
        at = Vector3.zero;
        heading = 0;
        if (id == null || !tracks.TryGetValue(id, out var sh)) return false;
        float now = Clock;
        var p = ShipAt(sh, now);
        at = new Vector3(p.x, Lift(sh, now, now), p.y);
        heading = HeadingAt(sh, now);
        return true;
    }

    /// <summary>A cruising ship's flight begun again from now (made ready ahead of time, it sets off when it is seen).</summary>
    void Restart(string id)
    {
        if (id != null && tracks.TryGetValue(id, out var sh) && sh.Cruise != null) sh.T0 = Clock;
    }

    /// <summary>A cruising ship let go: it flies the rest of the way in, taking `dur` seconds.</summary>
    void Release(string id, float dur)
    {
        if (id == null || !tracks.TryGetValue(id, out var sh) || sh.Cruise == null) return;
        float now = Clock;
        sh.From = ShipAt(sh, now);
        sh.Cruise = null;
        sh.SurgeDist = sh.SurgeDur = 0;
        sh.TurnFrom = null;
        sh.TurnFor = 0;
        sh.T0 = now;
        sh.Dur = dur;
    }

    /// <summary>Whether any ship is under way (cruising in, or flying a route).</summary>
    bool ShipsUnderway()
    {
        float now = Clock;
        foreach (var sh in tracks.Values) if (sh.Cruise != null || (sh.Dur > 0 && now - sh.T0 < sh.Dur)) return true;
        return false;
    }

    /// <summary>
    /// The ships this frame: hovering over their stars, bobbing and rolling a little (cruising, rolling gently, steady on
    /// its course); warping, stretched along their course and thinner as they stretch, shuddering as they charge, a
    /// streak of light from where they leapt and a flash where they land; their engines burning, longer under way; a
    /// battered engine's smoke, grey puffs rising and drifting astern, swelling as they fade.
    /// </summary>
    void AnimateShips(float time)
    {
        float now = Clock;
        foreach (var sh in tracks.Values)
        {
            if (sh.T == null) continue;
            var xz = ShipAt(sh, now);
            bool cruising = sh.Cruise != null;
            bool moving = cruising || (sh.Dur > 0 && now - sh.T0 < sh.Dur);
            float k = moving && !cruising ? (sh.Warp ? (now - sh.T0) / sh.Dur : TravelK(sh, now)) : 1;
            float y = Lift(sh, now, time);
            bool warping = sh.Warp && moving && !cruising;
            var warp = warping ? WarpAt(k) : (along: 1f, stretch: 1f, burn: 0f, phase: -1);
            float bank = warping ? 0 : cruising ? Mathf.Sin(time * 0.7f) * 0.07f : Mathf.Sin(time * 0.9f) * 0.04f;
            float heading = HeadingAt(sh, now);
            var f = new Vector3(Mathf.Cos(heading), 0, Mathf.Sin(heading));
            var rr = new Vector3(-f.z, 0, f.x);
            var u0 = Vector3.Cross(rr, f);
            float cb = Mathf.Cos(bank), sb = Mathf.Sin(bank);
            var up = u0 * cb + rr * sb;
            var rt = rr * cb - u0 * sb;
            float stretch = warping ? warp.stretch : 1;
            float shake = warping && warp.phase == 0 ? 0.003f * Mathf.Sin(time * 90) * (k / WarpCharge) : 0;
            var p = new Vector3(xz.x + rr.x * shake, y, xz.y + rr.z * shake);
            float L = ShipSize * stretch, W = ShipSize / Mathf.Sqrt(stretch);
            Place(sh.T, p, f, up, rt, L, W, W);
            float burn = warping ? warp.burn : moving ? 1 : 0;
            sh.M.SetFloat("_Burn", burn);
            if (sh.Hidden) continue;
            // The engines' glow, over the hull, longer under way.
            for (int i = 0; i < sh.Flames.Count && i < sh.Engines.Count; i++)
            {
                sh.Flames[i].T.position = sh.T.TransformPoint(sh.Engines[i]);
                SetWorldSize(sh.Flames[i], 0.022f * (1 + burn * 0.8f) * (0.9f + 0.1f * Mathf.Sin(time * 23 + i)));
            }
            int pi = 0;
            foreach (var e in sh.Smoke)
            {
                var wp = sh.T.TransformPoint(e);
                var back = -Mirror(f);
                for (int i = 0; i < 6 && pi < sh.Puffs.Count; i++, pi++)
                {
                    float age = (time * 0.45f + i / 6f) % 1;
                    var puff = sh.Puffs[pi];
                    puff.T.position = wp + (back * age * 0.05f + Vector3.up * age * 0.07f) * G;
                    SetWorldSize(puff, 0.012f + age * 0.03f);
                    puff.Alpha(0.32f * (1 - age) * Mathf.Min(1, age * 6));
                }
            }
            // A captive sun radiates heat round itself (its corona several times its size): the disc fills 0.58 of the
            // pictures' width, sized so it just covers the sun in its cradle, and drawn at its near face, so the sphere
            // doesn't hide it while the cradle in front still does.
            for (int i = 0; i < sh.SunAt.Count && i < sh.Coronas.Count; i++)
            {
                var sunAt = sh.T.TransformPoint(sh.SunAt[i]);
                float sunSize = sh.SunR[i] * L * 2;
                var toEye = Cam.transform.position - sunAt;
                if (toEye.sqrMagnitude > 1e-12f) sunAt += toEye.normalized * (sh.SunR[i] * L * 1.05f * G);
                // As the stellar gem: the corona breathing (a little larger and brighter, then back, every 5.5 seconds)...
                float breath = 0.5f - 0.5f * Mathf.Cos((time + i * 1.7f) * 2 * Mathf.PI / 5.5f);
                sh.Coronas[i].T.position = sunAt;
                SetWorldSize(sh.Coronas[i], sunSize * (1 + 0.07f * breath));
                sh.Coronas[i].Alpha(0.85f + 0.15f * breath);
                // ...and the disc turning slowly inside it (once every 48 seconds).
                sh.SunDiscs[i].T.position = sunAt;
                SetWorldSize(sh.SunDiscs[i], sunSize);
                sh.SunDiscs[i].M.SetFloat("_Seed", -(time + i * 7) * 2 * Mathf.PI / 48);
            }
            // Warps: a streak of light from where the ship leapt to where it is (fading after it lands), a brief tear of
            // light at the star it left as it goes, and a flash where it arrives.
            bool streak = warping && k >= WarpCharge;
            float fadeOut = k < WarpJump ? 1 : Mathf.Max(0, 1 - (k - WarpJump) / ((1 - WarpJump) * 0.7f));
            float y0 = sh.FromY + 0.13f;
            for (int i = 0; i < sh.Streak.Count; i++)
            {
                var s1 = sh.Streak[i];
                s1.Show(streak);
                if (!streak) continue;
                float t = i / (float)(sh.Streak.Count - 1);
                s1.T.position = world.TransformPoint(U(sh.From.x + (xz.x - sh.From.x) * t, y0 + (y - y0) * t, sh.From.y + (xz.y - sh.From.y) * t));
                SetWorldSize(s1, 0.035f + 0.035f * t);
                s1.Alpha(0.55f * fadeOut * (0.35f + 0.65f * t));
            }
            bool tear = streak && k < WarpJump + 0.08f;
            sh.Tear.Show(tear);
            if (tear)
            {
                sh.Tear.T.position = world.TransformPoint(U(sh.From.x, y0, sh.From.y));
                SetWorldSize(sh.Tear, 0.16f);
                sh.Tear.Alpha(0.6f * Mathf.Max(0, 1 - Mathf.Abs((k - (WarpCharge + WarpJump) / 2) / (WarpJump - WarpCharge + 0.08f))));
            }
            bool flash = warping && warp.phase == 2;
            sh.Flash.Show(flash);
            if (flash)
            {
                float t = (k - WarpJump) / (1 - WarpJump);
                sh.Flash.T.position = world.TransformPoint(U(sh.To.x, sh.ToY + 0.13f, sh.To.y));
                SetWorldSize(sh.Flash, 0.12f + 0.35f * t);
                sh.Flash.Alpha(0.9f * (1 - t) * (1 - t));
            }
        }
    }

    /// <summary>A disc hanging off a ship, sized in the web's units whatever the ship's own scale (it is as wide as its x is long).</summary>
    static void SetWorldSize(Spr d, float web)
    {
        var parent = d.T.parent;
        float k = parent != null ? Mathf.Abs(parent.lossyScale.x) : 1;
        d.T.localScale = Vector3.one * web * G / Mathf.Max(1e-6f, k);
    }

    /// <summary>The map's things this frame (and, in the editor's pictures, as they stand).</summary>
    void Animate()
    {
        float time = Clock;
        float dt = Application.isPlaying ? Mathf.Min(0.1f, Time.deltaTime) : 0;
        AnimateSuns(time, dt);
        AnimateUnder(time);
        AnimateStellari(time);
        AnimateShips(time);
        PlaceDarkness();
    }
}
