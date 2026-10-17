using System.Collections.Generic;
using BlueLoop.Models;
using UnityEngine;
using UMesh = UnityEngine.Mesh;

/// <summary>
/// A space station's dock in 3D (Unity only): the Captain's ship as fitted, docked in the middle of a bay (its pad, the
/// clamps holding it, the docking ring behind it, the bay's walls and window), seen from the front, a little above it
/// and to the right; the shop's kiosk and its robot keeper on the right, the recycling unit (a hopper over a crusher)
/// on the left. Gentle idle motion: the ship riding in its clamps, the ring's lights going round, the keeper looking
/// about, the crusher's rollers turning, the signs glowing. Its other shot: straight down on the ship (the camera
/// panning and tilting there), for fitting parts, its slots on the screen for their marks.
/// Drawn by a camera of its own on its own layer, under the campaign's page; everything built from the game's ship
/// shader in code (DockMesh), with no colliders: what is tapped is found by where it is on the screen.
/// </summary>
[ExecuteAlways]
public class StationDock : MonoBehaviour
{
    /// <summary>The dock's layer (the map's camera never draws it; nothing else uses it).</summary>
    public const int Layer = 26;
    public enum Shot { Dock, Bird }

    /// <summary>Which shot the camera is easing to.</summary>
    public Shot View;
    /// <summary>Drawn now (not while a page on the station's paper covers it).</summary>
    public bool Shown = true;
    /// <summary>Still wanted (the station still open); once not, it calls Gone and goes.</summary>
    public System.Func<bool> Wanted;
    public System.Action Gone;
    /// <summary>Each frame it stands: the page under it held as it needs (shown or not).</summary>
    public System.Action<bool> Hold;
    /// <summary>Each frame, once the camera is posed: what follows the scene on the page placed.</summary>
    public System.Action Placed;

    Camera cam;
    Camera ui;
    Transform root, shipPivot, hull, ringLights, shop, recycler, robot, robotHead, signShop, signRecycle, lights;
    readonly List<Transform> rollers = new List<Transform>();
    readonly List<Material> mats = new List<Material>();
    readonly List<UMesh> meshes = new List<UMesh>();
    Material shopSignMat, recycleSignMat, lightsMat, ringMat;
    UMesh hullMesh;
    string specKey;
    Dictionary<string, V3> slots;
    float t0, lastTick = -1;
    const float ShipSize = 4;
    static readonly Vector3 ShipAt = new Vector3(0, 0.55f, 0);
    static readonly Vector3 ShopAt = new Vector3(4.8f, 0, -1.7f), RecycleAt = new Vector3(-4.8f, 0, -1.6f);
    // (The camera as it is now, easing to its shot.)
    bool posed;
    Vector3 tgtNow;
    Quaternion rotNow;
    float distNow, offNow, lowNow;

    static readonly Color Holder = new Color(0.86f, 0.62f, 0.26f);

    public static StationDock Make(Transform parent, Camera ui)
    {
        var go = new GameObject("Station dock") { layer = Layer };
        go.transform.SetParent(parent, false);
        // (Far from the map's own world, though no camera but its own draws it.)
        go.transform.localPosition = new Vector3(0, -400, 0);
        var d = go.AddComponent<StationDock>();
        d.ui = ui;
        d.Build();
        return d;
    }

    float Now => Application.isPlaying ? Time.realtimeSinceStartup - t0 : 20;

    // ---- Building it ----

    void Build()
    {
        t0 = Time.realtimeSinceStartup;
        root = transform;
        cam = new GameObject("Dock camera") { layer = Layer }.AddComponent<Camera>();
        cam.transform.SetParent(root, false);
        cam.depth = (ui != null ? ui.depth : 0) - 1;
        cam.cullingMask = 1 << Layer;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = WebLook.Hex("#e8ebf0");
        cam.fieldOfView = 36;
        cam.nearClipPlane = 0.1f;
        cam.farClipPlane = 120;
        cam.allowHDR = false;
        BuildBay();
        BuildShop();
        BuildRecycler();
        shipPivot = Pivot("Ship", root, ShipAt, Quaternion.Euler(0, 90, 0));
        var h = new GameObject("Hull") { layer = Layer };
        h.transform.SetParent(shipPivot, false);
        // (The model in the web's own axes, its z flipped, as the menu's scene has it: its starboard on its right.)
        h.transform.localScale = new Vector3(ShipSize, ShipSize, -ShipSize);
        h.AddComponent<MeshFilter>();
        var r = h.AddComponent<MeshRenderer>();
        var m = Material(Holder);
        m.SetFloat("_Burn", 0.6f);
        r.sharedMaterial = m;
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        hull = h.transform;
    }

    /// <summary>The bay: its deck, the pad and its clamps, the docking ring behind the ship, the walls, the window on space.</summary>
    void BuildBay()
    {
        var m = new DockMesh();
        Color deck = new Color(0.86f, 0.87f, 0.9f), wall = new Color(0.91f, 0.915f, 0.93f), steel = new Color(0.74f, 0.76f, 0.8f), dark = new Color(0.2f, 0.22f, 0.26f);
        Color cool = new Color(0.72f, 0.86f, 1f), amber = new Color(1f, 0.78f, 0.42f);
        // The deck, its front edge lit.
        m.Box(new Vector3(0, -0.2f, 1.5f), new Vector3(19, 0.4f, 13), deck, 0);
        m.Box(new Vector3(0, -0.06f, -4.98f), new Vector3(19, 0.1f, 0.08f), cool, 2);
        // Guide lines from the pad to the deck's edge, either side of the ship.
        foreach (float x in new[] { -1.9f, 1.9f }) m.Box(new Vector3(x, 0.004f, -3.6f), new Vector3(0.07f, 0.02f, 2.6f), amber, 0);
        // The pad, a ring of light round it.
        m.Cyl(new Vector3(0, 0.03f, 0), 3.0f, 3.0f, 0.06f, 48, new Color(0.8f, 0.82f, 0.86f), 0);
        m.Torus(new Vector3(0, 0.07f, 0), 3.05f, 0.035f, 64, 6, cool, 2, Quaternion.Euler(90, 0, 0));
        // The clamps holding the ship, either side of it, a small amber lamp on each.
        foreach (float sx in new[] { -1f, 1f })
            foreach (float z in new[] { -1.0f, 1.1f })
            {
                m.Box(new Vector3(sx * 1.55f, 0.36f, z), new Vector3(0.24f, 0.72f, 0.34f), steel, 0);
                m.Box(new Vector3(sx * 1.3f, 0.7f, z), new Vector3(0.62f, 0.14f, 0.28f), steel, 0);
                m.Box(new Vector3(sx * 1.55f, 0.76f, z), new Vector3(0.1f, 0.06f, 0.1f), amber, 2);
            }
        // The docking ring behind the ship, on its feet.
        m.Torus(new Vector3(0, 1.4f, 3.5f), 3.6f, 0.24f, 64, 10, new Color(0.9f, 0.91f, 0.93f), 0);
        m.Torus(new Vector3(0, 1.4f, 3.5f), 3.3f, 0.06f, 64, 6, steel, 0);
        foreach (float sx in new[] { -1f, 1f }) m.Box(new Vector3(sx * 3.3f, 0.3f, 3.5f), new Vector3(0.95f, 0.6f, 0.95f), steel, 0);
        // The gantries either side, a walkway across behind the ring.
        foreach (float sx in new[] { -1f, 1f })
        {
            m.Box(new Vector3(sx * 6.4f, 2.7f, 4.4f), new Vector3(0.5f, 5.4f, 0.5f), wall, 0);
            m.Box(new Vector3(sx * 6.4f, 5.45f, 4.4f), new Vector3(0.62f, 0.1f, 0.62f), cool, 2);
        }
        m.Box(new Vector3(0, 4.3f, 5.2f), new Vector3(13.2f, 0.14f, 1.1f), steel, 0);
        m.Box(new Vector3(0, 4.62f, 4.68f), new Vector3(13.2f, 0.05f, 0.05f), cool, 2);
        // The bay's back wall, its long window on space, the lamps along its top; its side walls.
        m.Box(new Vector3(0, 3.6f, 8.1f), new Vector3(22, 8.4f, 0.4f), wall, 0);
        m.Box(new Vector3(0, 3.7f, 7.86f), new Vector3(13, 2.8f, 0.08f), new Color(0.3f, 0.4f, 0.58f), 1);
        for (int i = 0; i <= 6; i++) m.Box(new Vector3(-6.5f + i * 13f / 6, 3.7f, 7.8f), new Vector3(0.16f, 2.9f, 0.12f), steel, 0);
        m.Box(new Vector3(0, 5.15f, 7.8f), new Vector3(13.2f, 0.16f, 0.14f), steel, 0);
        m.Box(new Vector3(0, 2.25f, 7.8f), new Vector3(13.2f, 0.16f, 0.14f), steel, 0);
        for (int i = 0; i < 9; i++) m.Box(new Vector3(-8 + i * 2, 6.9f, 7.85f), new Vector3(0.9f, 0.08f, 0.08f), new Color(0.95f, 0.97f, 1f), 2);
        foreach (float sx in new[] { -1f, 1f })
        {
            m.Box(new Vector3(sx * 9.6f, 3.2f, 1.6f), new Vector3(0.4f, 6.8f, 13), wall, 0);
            m.Box(new Vector3(sx * 9.38f, 0.5f, 1.6f), new Vector3(0.06f, 0.08f, 12.6f), cool, 2);
        }
        // A few crates and drums about the bay.
        m.Box(new Vector3(7.6f, 0.35f, 4.6f), new Vector3(0.9f, 0.7f, 0.9f), new Color(0.82f, 0.84f, 0.88f), 0);
        m.Box(new Vector3(7.7f, 0.95f, 4.5f), new Vector3(0.6f, 0.5f, 0.6f), new Color(0.45f, 0.6f, 0.86f), 0);
        m.Cyl(new Vector3(-7.4f, 0.45f, 4.9f), 0.35f, 0.35f, 0.9f, 16, steel, 0);
        m.Cyl(new Vector3(-6.7f, 0.45f, 5.2f), 0.35f, 0.35f, 0.9f, 16, new Color(0.35f, 0.66f, 0.64f), 0);
        m.Box(new Vector3(-7.6f, 0.05f, -3.8f), new Vector3(1.2f, 0.1f, 0.8f), dark, 4);
        Piece("Bay", root, Vector3.zero, Quaternion.identity, m, Holder);

        // The ring's lights, going slowly round.
        ringLights = Pivot("Ring lights", root, new Vector3(0, 1.4f, 3.5f), Quaternion.identity);
        var l = new DockMesh();
        for (int i = 0; i < 16; i++)
        {
            float a = i * Mathf.PI * 2 / 16;
            l.Box(new Vector3(Mathf.Cos(a) * 3.62f, Mathf.Sin(a) * 3.62f, -0.26f), new Vector3(0.16f, 0.16f, 0.06f), cool, 2, Quaternion.Euler(0, 0, a * Mathf.Rad2Deg));
        }
        ringMat = Piece("Lamps", ringLights, Vector3.zero, Quaternion.identity, l, Holder).GetComponent<MeshRenderer>().sharedMaterial;
    }

    /// <summary>The shop, on the right: a kiosk and its counter, shelves of crates behind, its keeper a little robot, its sign lit over it.</summary>
    void BuildShop()
    {
        shop = Pivot("Shop", root, ShopAt, Quaternion.Euler(0, 20, 0));
        Color white = new Color(0.95f, 0.95f, 0.96f), steel = new Color(0.74f, 0.76f, 0.8f), dark = new Color(0.2f, 0.22f, 0.26f);
        var m = new DockMesh();
        m.Box(new Vector3(0, 0.06f, 0), new Vector3(2.9f, 0.12f, 2.1f), new Color(0.8f, 0.82f, 0.86f), 0);
        // The counter: white, a gold band, a dark top, a screen on it.
        m.Box(new Vector3(0, 0.57f, -0.45f), new Vector3(2.2f, 0.9f, 0.6f), white, 0);
        m.Box(new Vector3(0, 0.66f, -0.76f), new Vector3(2.22f, 0.14f, 0.03f), white, 5);
        m.Box(new Vector3(0, 1.05f, -0.45f), new Vector3(2.36f, 0.08f, 0.74f), dark, 4);
        m.Box(new Vector3(0.62f, 1.18f, -0.42f), new Vector3(0.06f, 0.2f, 0.06f), steel, 0);
        m.Box(new Vector3(0.62f, 1.42f, -0.44f), new Vector3(0.62f, 0.4f, 0.05f), new Color(0.42f, 0.66f, 0.95f), 1, Quaternion.Euler(-12, 0, 0));
        // Shelves behind, stocked.
        m.Box(new Vector3(0, 1.15f, 0.78f), new Vector3(2.5f, 2.3f, 0.32f), new Color(0.88f, 0.89f, 0.91f), 0);
        Color[] stock = { new Color(0.92f, 0.7f, 0.32f), new Color(0.45f, 0.62f, 0.9f), new Color(0.36f, 0.72f, 0.68f), white, new Color(0.6f, 0.5f, 0.82f) };
        for (int row = 0; row < 3; row++)
        {
            float y = 0.32f + row * 0.72f;
            m.Box(new Vector3(0, y - 0.06f, 0.6f), new Vector3(2.4f, 0.05f, 0.34f), steel, 0);
            for (int i = 0; i < 5; i++)
            {
                if ((row * 5 + i) % 4 == 3) continue;
                float w = 0.26f + 0.06f * ((row + i) % 3);
                m.Box(new Vector3(-0.96f + i * 0.48f, y + w / 2 - 0.035f, 0.6f), new Vector3(w, w, 0.26f), stock[(row * 2 + i) % stock.Length], 0);
            }
        }
        // The sign's posts.
        foreach (float sx in new[] { -1f, 1f }) m.Box(new Vector3(sx * 1.2f, 1.55f, 0.1f), new Vector3(0.1f, 3.1f, 0.1f), steel, 0);
        Piece("Kiosk", shop, Vector3.zero, Quaternion.identity, m, Holder);
        // The sign, lit warm.
        var s = new DockMesh();
        s.Box(new Vector3(0, 2.95f, 0.1f), new Vector3(2.5f, 0.56f, 0.12f), new Color(0.3f, 0.32f, 0.36f), 4);
        s.Box(new Vector3(0, 2.95f, 0.02f), new Vector3(2.3f, 0.4f, 0.04f), new Color(1f, 0.88f, 0.6f), 2);
        signShop = Piece("Shop sign", shop, Vector3.zero, Quaternion.identity, s, Holder);
        shopSignMat = signShop.GetComponent<MeshRenderer>().sharedMaterial;

        // The keeper: a little robot behind the counter, its head turning as it looks about.
        robot = Pivot("Keeper", shop, new Vector3(-0.35f, 0, 0.15f), Quaternion.identity);
        var b = new DockMesh();
        b.Cyl(new Vector3(0, 0.8f, 0), 0.34f, 0.28f, 0.8f, 20, white, 0);
        b.Torus(new Vector3(0, 1.08f, 0), 0.29f, 0.03f, 20, 6, new Color(0.86f, 0.62f, 0.26f), 0, Quaternion.Euler(90, 0, 0));
        b.Cyl(new Vector3(0, 1.27f, 0), 0.1f, 0.12f, 0.16f, 12, steel, 0);
        foreach (float sx in new[] { -1f, 1f })
        {
            b.Sphere(new Vector3(sx * 0.36f, 1.1f, 0), 0.1f, 10, steel, 0);
            b.Box(new Vector3(sx * 0.4f, 0.88f, -0.08f), new Vector3(0.09f, 0.42f, 0.09f), white, 0, Quaternion.Euler(-25, 0, sx * 8));
        }
        Piece("Body", robot, Vector3.zero, Quaternion.identity, b, Holder);
        robotHead = Pivot("Head", robot, new Vector3(0, 1.48f, 0), Quaternion.identity);
        var hd = new DockMesh();
        hd.Sphere(new Vector3(0, 0.08f, 0), 0.25f, 16, white, 0);
        hd.Box(new Vector3(0, 0.1f, -0.19f), new Vector3(0.34f, 0.12f, 0.1f), new Color(0.12f, 0.14f, 0.18f), 4);
        foreach (float sx in new[] { -1f, 1f }) hd.Box(new Vector3(sx * 0.075f, 0.1f, -0.245f), new Vector3(0.06f, 0.045f, 0.02f), new Color(0.55f, 0.92f, 1f), 2);
        hd.Cyl(new Vector3(0.1f, 0.4f, 0), 0.012f, 0.012f, 0.22f, 6, steel, 0);
        hd.Sphere(new Vector3(0.1f, 0.53f, 0), 0.045f, 8, new Color(1f, 0.8f, 0.4f), 2);
        Piece("Head", robotHead, Vector3.zero, Quaternion.identity, hd, Holder);
    }

    /// <summary>The recycling unit, on the left: a hopper over a crusher (its rollers turning), a chute to a bin, its lamps, its sign.</summary>
    void BuildRecycler()
    {
        var teal = new Color(0.32f, 0.72f, 0.68f);
        recycler = Pivot("Recycler", root, RecycleAt, Quaternion.Euler(0, -20, 0));
        Color body = new Color(0.8f, 0.82f, 0.85f), steel = new Color(0.66f, 0.69f, 0.74f), dark = new Color(0.18f, 0.19f, 0.22f);
        var m = new DockMesh();
        m.Box(new Vector3(0, 0.06f, 0), new Vector3(2.7f, 0.12f, 2.3f), new Color(0.8f, 0.82f, 0.86f), 0);
        // The crusher's housing, a teal band round it.
        m.Box(new Vector3(0, 0.82f, 0.15f), new Vector3(1.9f, 1.4f, 1.5f), body, 0);
        m.Box(new Vector3(0, 1.3f, -0.61f), new Vector3(1.92f, 0.16f, 0.03f), body, 5);
        m.Box(new Vector3(0, 1.56f, 0.15f), new Vector3(2.0f, 0.1f, 1.6f), steel, 0);
        // The hopper over it, square, open at the top, dark inside.
        m.Cyl(new Vector3(0, 2.0f, 0.15f), 0.62f, 1.0f, 0.8f, 4, steel, 0, Quaternion.Euler(0, 45, 0), false);
        m.Box(new Vector3(0, 1.98f, 0.15f), new Vector3(0.86f, 0.04f, 0.86f), dark, 4);
        // The chute out of its front, the bin under it.
        m.Box(new Vector3(0, 0.62f, -0.78f), new Vector3(0.8f, 0.14f, 0.5f), steel, 0, Quaternion.Euler(24, 0, 0));
        m.Box(new Vector3(0, 0.3f, -1.18f), new Vector3(0.95f, 0.48f, 0.62f), new Color(0.48f, 0.62f, 0.62f), 0);
        m.Box(new Vector3(0, 0.55f, -1.18f), new Vector3(0.8f, 0.03f, 0.48f), dark, 4);
        // Its panel at the side, a pipe up behind it to the wall.
        m.Box(new Vector3(0.72f, 1.0f, -0.62f), new Vector3(0.4f, 0.34f, 0.05f), dark, 4);
        m.Cyl(new Vector3(-0.55f, 2.3f, 0.75f), 0.11f, 0.11f, 1.5f, 12, steel, 0);
        m.Cyl(new Vector3(-0.55f, 3.08f, 0.75f), 0.15f, 0.15f, 0.08f, 12, body, 0);
        // The sign's posts.
        foreach (float sx in new[] { -1f, 1f }) m.Box(new Vector3(sx * 1.15f, 1.6f, 0.95f), new Vector3(0.1f, 3.2f, 0.1f), steel, 0);
        Piece("Unit", recycler, Vector3.zero, Quaternion.identity, m, teal);
        // The crusher's two rollers, turning in toward each other.
        foreach (float sx in new[] { -1f, 1f })
        {
            var p = Pivot("Roller", recycler, new Vector3(sx * 0.2f, 1.86f, 0.15f), Quaternion.identity);
            var r = new DockMesh();
            r.Cyl(Vector3.zero, 0.16f, 0.16f, 0.82f, 12, new Color(0.34f, 0.36f, 0.4f), 4, Quaternion.Euler(0, 0, 90));
            for (int i = 0; i < 6; i++)
            {
                float a = i * 60;
                r.Box(Quaternion.Euler(a, 0, 0) * new Vector3(0, 0.17f, 0), new Vector3(0.8f, 0.05f, 0.05f), new Color(0.5f, 0.52f, 0.56f), 0, Quaternion.Euler(a, 0, 0));
            }
            Piece("Roller", p, Vector3.zero, Quaternion.identity, r, teal);
            rollers.Add(p);
        }
        // Its lamps (green, amber, blue), blinking.
        var lm = new DockMesh();
        Color[] lc = { new Color(0.45f, 0.95f, 0.6f), new Color(1f, 0.76f, 0.36f), new Color(0.5f, 0.8f, 1f) };
        for (int i = 0; i < 3; i++) lm.Sphere(new Vector3(0.6f + i * 0.12f, 1.06f, -0.66f), 0.035f, 8, lc[i], 2);
        lights = Piece("Lamps", recycler, Vector3.zero, Quaternion.identity, lm, teal);
        lightsMat = lights.GetComponent<MeshRenderer>().sharedMaterial;
        // The sign, lit a cool green-white.
        var s = new DockMesh();
        s.Box(new Vector3(0, 3.05f, 0.95f), new Vector3(2.4f, 0.56f, 0.12f), new Color(0.3f, 0.32f, 0.36f), 4);
        s.Box(new Vector3(0, 3.05f, 0.87f), new Vector3(2.2f, 0.4f, 0.04f), new Color(0.74f, 1f, 0.88f), 2);
        signRecycle = Piece("Recycle sign", recycler, Vector3.zero, Quaternion.identity, s, teal);
        recycleSignMat = signRecycle.GetComponent<MeshRenderer>().sharedMaterial;
    }

    Transform Pivot(string name, Transform parent, Vector3 at, Quaternion rot)
    {
        var go = new GameObject(name) { layer = Layer };
        go.transform.SetParent(parent, false);
        go.transform.localPosition = at;
        go.transform.localRotation = rot;
        return go.transform;
    }

    Material Material(Color holder)
    {
        var m = Mats.Make("Ship", holder);
        // (Lit as the menu's scene lights its ship: the key light's z flipped, every piece alike.)
        m.SetFloat("_Flip", -1);
        mats.Add(m);
        return m;
    }

    /// <summary>A piece of the scene: its mesh (built at a quarter size, drawn four times as large, so the shader's panels are the ship's size), its own material.</summary>
    Transform Piece(string name, Transform parent, Vector3 at, Quaternion rot, DockMesh m, Color holder)
    {
        var go = new GameObject(name) { layer = Layer };
        go.transform.SetParent(parent, false);
        go.transform.localPosition = at;
        go.transform.localRotation = rot;
        go.transform.localScale = Vector3.one * DockMesh.K;
        var mesh = m.Mesh(name);
        meshes.Add(mesh);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = Material(holder);
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        r.receiveShadows = false;
        return go.transform;
    }

    // ---- The ship ----

    /// <summary>The ship as fitted now (built again only when its fit or level has changed).</summary>
    public void Refit(CaptainShipSpec spec)
    {
        var key = spec.Level + ":" + string.Join(",", spec.Parts ?? new Dictionary<string, string>()) + ":" + string.Join(",", spec.Rarity ?? new Dictionary<string, string>());
        if (key == specKey && hullMesh != null) return;
        specKey = key;
        var build = CaptainShip.CaptainShipModel(spec);
        slots = CaptainShip.SlotSpots(spec.Level);
        var mf = hull.GetComponent<MeshFilter>();
        if (hullMesh != null) Mats.Kill(hullMesh);
        hullMesh = ModelMesh.From(build.Mesh);
        hullMesh.name = "Docked ship";
        mf.sharedMesh = hullMesh;
        // (Centred on the pad along and across, its keel on the pivot.)
        var b = hullMesh.bounds;
        hull.localPosition = new Vector3(-b.center.x * ShipSize, -b.min.y * ShipSize, b.center.z * ShipSize);
    }

    /// <summary>A point of the ship's box (x along, y across, z up) in the model's own axes (CampaignBackdrop.B).</summary>
    static Vector3 B(double x, double y, double z) => new Vector3((float)(x - 20) / 40, (float)z / 40, (float)(y - 12) / 40);

    Vector3 ShipCentre => hullMesh != null ? hull.TransformPoint(hullMesh.bounds.center) : shipPivot.position + Vector3.up;

    /// <summary>Where a part's slot is on the screen now (pixels from the bottom left), as the ship rides; null if not in view.</summary>
    public Vector3? SlotScreen(string slot)
    {
        if (slots == null || cam == null || !slots.TryGetValue(slot, out var v)) return null;
        var p = cam.WorldToScreenPoint(hull.TransformPoint(B(v.X, v.Y, v.Z)));
        return p.z > 0 ? p : (Vector3?)null;
    }

    /// <summary>
    /// What is where on the screen now (pixels from the bottom left): the shop ("shop"), the recycling unit ("recycle")
    /// or the ship ("ship"), as the box round it; null if not in front of the camera.
    /// </summary>
    public Rect? ScreenBox(string what)
    {
        if (cam == null) return null;
        Transform t;
        Bounds b;
        switch (what)
        {
            case "shop": t = shop; b = new Bounds(new Vector3(0, 1.6f, 0), new Vector3(2.7f, 3.3f, 1.9f)); break;
            case "recycle": t = recycler; b = new Bounds(new Vector3(0, 1.65f, 0), new Vector3(2.5f, 3.3f, 2.2f)); break;
            case "ship":
                if (hullMesh == null) return null;
                t = hull;
                b = hullMesh.bounds;
                break;
            default: return null;
        }
        float x0 = float.MaxValue, y0 = float.MaxValue, x1 = float.MinValue, y1 = float.MinValue;
        for (int i = 0; i < 8; i++)
        {
            var c = b.center + Vector3.Scale(b.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
            var p = cam.WorldToScreenPoint(t.TransformPoint(c));
            if (p.z <= 0) return null;
            x0 = Mathf.Min(x0, p.x);
            y0 = Mathf.Min(y0, p.y);
            x1 = Mathf.Max(x1, p.x);
            y1 = Mathf.Max(y1, p.y);
        }
        return Rect.MinMaxRect(x0, y0, x1, y1);
    }

    // ---- Each frame ----

    void LateUpdate()
    {
        if (!Application.isPlaying) return;
        Tick();
    }

    /// <summary>Stood for this frame: gone if no longer wanted; else the scene moved, the camera posed, the page's marks placed.</summary>
    public void Tick()
    {
        if (Wanted != null && !Wanted())
        {
            var gone = Gone;
            Gone = null;
            Wanted = null;
            Placed = null;
            gone?.Invoke();
            Mats.Kill(gameObject);
            return;
        }
        if (cam.enabled != Shown) cam.enabled = Shown;
        Hold?.Invoke(Shown);
        float t = Now;
        float dt = Application.isPlaying && lastTick >= 0 ? Mathf.Clamp(t - lastTick, 0, 0.1f) : 0;
        lastTick = t;
        Animate(t);
        Pose(dt);
        Placed?.Invoke();
    }

    // (How far the camera is toward the ship's birdseye shot: the ship rides stiller there, its slots under the finger.)
    float bird;

    void Animate(float t)
    {
        // The ship riding in its clamps, rising and falling, rolling a little.
        float sway = 1 - 0.85f * bird;
        shipPivot.localPosition = ShipAt + new Vector3(0, 0.05f * Mathf.Sin(t * 0.8f) * sway, 0);
        shipPivot.localRotation = Quaternion.Euler(0, 90, 0) * Quaternion.Euler(0.6f * Mathf.Sin(t * 0.6f + 1) * sway, 0, 0.5f * Mathf.Sin(t * 0.5f) * sway);
        // The ring's lights going round; the keeper looking about, bobbing; the rollers turning; the signs glowing.
        ringLights.localRotation = Quaternion.Euler(0, 0, t * 8);
        robot.localPosition = new Vector3(-0.35f, 0.025f * Mathf.Sin(t * 1.6f), 0.15f);
        robotHead.localRotation = Quaternion.Euler(4 * Mathf.Sin(t * 0.9f), 28 * Mathf.Sin(t * 0.45f) + 8 * Mathf.Sin(t * 1.3f), 0);
        for (int i = 0; i < rollers.Count; i++) rollers[i].localRotation = Quaternion.Euler((i == 0 ? 1 : -1) * t * 140, 0, 0);
        lightsMat.SetFloat("_Alpha", 0.65f + 0.35f * Mathf.Sign(Mathf.Sin(t * 3.1f)));
    }

    /// <summary>
    /// The camera, easing to its shot (by 1 - e^(-2.6 dt) a frame, as the menu's scene eases): the dock from the front, a
    /// little above and to the right, back far enough for both vendors; or straight down on the ship, set off to the
    /// left of the screen (its parts listed on the right), back far enough for all of it.
    /// </summary>
    void Pose(float dt)
    {
        float aspect = Mathf.Max(0.5f, cam.aspect), tan = Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
        Vector3 goalT;
        Quaternion goalR;
        float goalD, goalO, goalL;
        if (View == Shot.Bird)
        {
            goalT = ShipCentre;
            // (Its tilt straight on down from the dock's shot: the ship's nose toward the foot of the screen.)
            goalR = Quaternion.LookRotation(Vector3.down, Vector3.forward);
            // (All of it (4 long, 3 or so across) in the screen's lower 80% (the station's name and tabs over the
            // rest), and in the left 55% across; set that much lower and to the left.)
            goalD = Mathf.Max(ShipSize * 1.15f / (0.8f * 2 * tan), 3.4f / (0.55f * 2 * tan * aspect)) + 1.5f;
            goalO = -0.22f;
            goalL = 0.2f;
        }
        else
        {
            goalT = root.TransformPoint(new Vector3(0.3f, 1.35f, -0.9f));
            var toEye = new Vector3(0.36f, 0.34f, -0.87f).normalized;
            goalR = Quaternion.LookRotation(-toEye, Vector3.up);
            // (Both vendors, 6.4 either side, in view however narrow the screen.)
            goalD = Mathf.Max(10.5f, 6.6f / (tan * aspect) + 1.5f);
            goalO = 0;
            // (A little lower, clear of the station's name and tabs.)
            goalL = 0.08f;
        }
        if (!posed || dt <= 0 && !Application.isPlaying)
        {
            tgtNow = goalT;
            rotNow = goalR;
            distNow = goalD;
            offNow = goalO;
            lowNow = goalL;
            posed = true;
        }
        else
        {
            float e = 1 - Mathf.Exp(-dt * 2.6f);
            tgtNow = Vector3.Lerp(tgtNow, goalT, e);
            rotNow = Quaternion.Slerp(rotNow, goalR, e);
            distNow = Mathf.Lerp(distNow, goalD, e);
            offNow = Mathf.Lerp(offNow, goalO, e);
            lowNow = Mathf.Lerp(lowNow, goalL, e);
        }
        bird = Mathf.Clamp01(Mathf.InverseLerp(0, 0.22f, -offNow));
        cam.transform.SetPositionAndRotation(tgtNow - rotNow * Vector3.forward * distNow, rotNow);
        cam.ResetProjectionMatrix();
        var p = cam.projectionMatrix;
        // (Set off centre by shearing the projection: the subject moves aside, its perspective unchanged.)
        p.m02 = -offNow * 2;
        // (And lowered, by a tenth of the screen's height at the birdseye: NDC y less `lowNow`.)
        p.m12 = lowNow;
        cam.projectionMatrix = p;
    }

    void OnDestroy()
    {
        foreach (var m in mats) Mats.Kill(m);
        foreach (var m in meshes) Mats.Kill(m);
        Mats.Kill(hullMesh);
        mats.Clear();
        meshes.Clear();
    }
}

/// <summary>
/// Simple shapes (boxes, cylinders and cones, rings, spheres) built into one mesh as the game's models are (ModelMesh:
/// each corner's position, normal, colour, and its material for the ship shader in uv.x: 0 plated metal, 1 glass, 2
/// glowing, 4 dark gloss, 5 plated in its holder's colour). Given in the scene's units, kept at a quarter of that (K):
/// the piece is drawn K times as large, so the shader's panel seams are the ship's size.
/// </summary>
public class DockMesh
{
    public const float K = 4;
    readonly List<Vector3> pos = new List<Vector3>(), nor = new List<Vector3>();
    readonly List<Color> col = new List<Color>();
    readonly List<Vector2> mat = new List<Vector2>();

    void Tri(Vector3 a, Vector3 b, Vector3 c, Vector3 na, Vector3 nb, Vector3 nc, Color colour, float m)
    {
        pos.Add(a / K);
        pos.Add(b / K);
        pos.Add(c / K);
        nor.Add(na.normalized);
        nor.Add(nb.normalized);
        nor.Add(nc.normalized);
        for (int i = 0; i < 3; i++)
        {
            col.Add(colour);
            mat.Add(new Vector2(m, 0));
        }
    }

    void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n, Color colour, float m)
    {
        Tri(a, b, c, n, n, n, colour, m);
        Tri(a, c, d, n, n, n, colour, m);
    }

    /// <summary>A box about its middle, turned by `rot`.</summary>
    public void Box(Vector3 c, Vector3 size, Color colour, float m, Quaternion? rot = null)
    {
        var r = rot ?? Quaternion.identity;
        var h = size / 2;
        Vector3 P(float x, float y, float z) => c + r * new Vector3(x * h.x, y * h.y, z * h.z);
        // (Each face: its normal, and two axes across it.)
        var faces = new[] { (Vector3.right, Vector3.up, Vector3.forward), (Vector3.left, Vector3.forward, Vector3.up), (Vector3.up, Vector3.forward, Vector3.right), (Vector3.down, Vector3.right, Vector3.forward), (Vector3.forward, Vector3.right, Vector3.up), (Vector3.back, Vector3.up, Vector3.right) };
        foreach (var (n, u, v) in faces)
        {
            Vector3 Corner(float su, float sv) { var q = n + u * su + v * sv; return P(q.x, q.y, q.z); }
            Quad(Corner(-1, -1), Corner(1, -1), Corner(1, 1), Corner(-1, 1), r * n, colour, m);
        }
    }

    /// <summary>A cylinder (or cone's frustum) about its middle along its y, `h` tall, its radii at its foot and top; capped or open.</summary>
    public void Cyl(Vector3 c, float rFoot, float rTop, float h, int seg, Color colour, float m, Quaternion? rot = null, bool caps = true)
    {
        var r = rot ?? Quaternion.identity;
        float slope = (rFoot - rTop) / Mathf.Max(1e-4f, h);
        for (int i = 0; i < seg; i++)
        {
            float a0 = i * Mathf.PI * 2 / seg, a1 = (i + 1) * Mathf.PI * 2 / seg;
            Vector3 d0 = new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)), d1 = new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1));
            Vector3 f0 = c + r * (d0 * rFoot - Vector3.up * h / 2), f1 = c + r * (d1 * rFoot - Vector3.up * h / 2);
            Vector3 t0 = c + r * (d0 * rTop + Vector3.up * h / 2), t1 = c + r * (d1 * rTop + Vector3.up * h / 2);
            // (Smooth round a round one; flat faces on a few-sided one.)
            Vector3 n0, n1;
            if (seg <= 6)
            {
                var mid = (d0 + d1).normalized;
                n0 = n1 = r * (mid + Vector3.up * slope);
            }
            else
            {
                n0 = r * (d0 + Vector3.up * slope);
                n1 = r * (d1 + Vector3.up * slope);
            }
            Tri(f0, f1, t1, n0, n1, n1, colour, m);
            Tri(f0, t1, t0, n0, n1, n0, colour, m);
            if (!caps) continue;
            Vector3 up = r * Vector3.up, cb = c - up * h / 2, ct = c + up * h / 2;
            Tri(cb, f1, f0, -up, -up, -up, colour, m);
            Tri(ct, t0, t1, up, up, up, colour, m);
        }
    }

    /// <summary>A ring round its middle, about its z (turned by `rot`): `big` its radius, `small` its tube's.</summary>
    public void Torus(Vector3 c, float big, float small, int su, int sv, Color colour, float m, Quaternion? rot = null)
    {
        var r = rot ?? Quaternion.identity;
        Vector3 P(int i, int j, out Vector3 n)
        {
            float u = i * Mathf.PI * 2 / su, v = j * Mathf.PI * 2 / sv;
            var out1 = new Vector3(Mathf.Cos(u), Mathf.Sin(u), 0);
            n = r * (out1 * Mathf.Cos(v) + Vector3.forward * Mathf.Sin(v));
            return c + r * (out1 * (big + small * Mathf.Cos(v)) + Vector3.forward * small * Mathf.Sin(v));
        }
        for (int i = 0; i < su; i++)
            for (int j = 0; j < sv; j++)
            {
                var a = P(i, j, out var na);
                var b = P(i + 1, j, out var nb);
                var cc = P(i + 1, j + 1, out var nc);
                var d = P(i, j + 1, out var nd);
                Tri(a, b, cc, na, nb, nc, colour, m);
                Tri(a, cc, d, na, nc, nd, colour, m);
            }
    }

    /// <summary>A sphere about its middle.</summary>
    public void Sphere(Vector3 c, float rad, int seg, Color colour, float m)
    {
        int rings = Mathf.Max(3, seg / 2);
        Vector3 D(int i, int j)
        {
            float lat = Mathf.PI * (j / (float)rings - 0.5f), lon = i * Mathf.PI * 2 / seg;
            return new Vector3(Mathf.Cos(lat) * Mathf.Cos(lon), Mathf.Sin(lat), Mathf.Cos(lat) * Mathf.Sin(lon));
        }
        for (int i = 0; i < seg; i++)
            for (int j = 0; j < rings; j++)
            {
                Vector3 a = D(i, j), b = D(i + 1, j), cc = D(i + 1, j + 1), d = D(i, j + 1);
                Tri(c + a * rad, c + b * rad, c + cc * rad, a, b, cc, colour, m);
                Tri(c + a * rad, c + cc * rad, c + d * rad, a, cc, d, colour, m);
            }
    }

    public UMesh Mesh(string name)
    {
        int n = pos.Count;
        var tri = new int[n];
        for (int i = 0; i < n; i++) tri[i] = i;
        var mesh = new UMesh { name = name, indexFormat = n > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
        mesh.SetVertices(pos);
        mesh.SetNormals(nor);
        mesh.SetColors(col);
        mesh.SetUVs(0, mat);
        mesh.triangles = tri;
        mesh.RecalculateBounds();
        return mesh;
    }
}
