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

    void Build(Camera uiCam)
    {
        ui = uiCam;
        uiClear = ui.clearFlags;
        ui.clearFlags = CameraClearFlags.Depth;
        // (The page's camera draws the page alone, not the scene's layers again from where it stands.)
        uiMask = ui.cullingMask;
        ui.cullingMask &= ~((1 << LandLayer) | (1 << ShipLayer));
        t0 = Time.realtimeSinceStartup;
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
        // The ship, the Captain on it, the crew aboard.
        ship = new GameObject("Ship scene").transform;
        ship.SetParent(transform, false);
        ship.localScale = Flip;
        var meta = CampaignView.LoadMeta();
        var spec = Spec(meta);
        build = CaptainShip.CaptainShipModel(spec);
        shipModel = Model("Ship", ModelMesh.From(build.Mesh));
        captain = Model("Captain", ModelMesh.Of("captain", CaptainModels.CaptainModel));
        tail = Model("Tails", ModelMesh.Of("captain-tails", CaptainModels.StreamerModel));
        foreach (var id in Meta.ActiveCrew(meta))
            if (CompanionModels.Places.TryGetValue(id, out var pl))
                crew.Add((id, pl, Model(id, ModelMesh.Of("companion:" + id, () => CompanionModels.CompanionModel(id)))));
        shipCam = MakeCamera("Ship camera", ui.depth - 1, ShipLayer, 32);
        shipCam.clearFlags = CameraClearFlags.Depth;
        Pose();
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
    public Camera[] Cameras => new[] { landCam, shipCam };

    /// <summary>Drawn into a texture (the editor's screenshots): its cameras with the page's.</summary>
    public void Into(RenderTexture rt)
    {
        foreach (var c in Cameras) c.targetTexture = rt;
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
        ground.SetFloat("_Gone", fx - 1.1f);
        ground.SetFloat("_Crack", fx - 0.5f);
        {
            float yaw = -0.85f, pitch = 0.2f, dist = 3.4f;
            var target = new Vector3(fx, 0, 0.15f);
            var dir = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), Mathf.Sin(pitch), Mathf.Cos(yaw) * Mathf.Cos(pitch));
            Aim(landCam, target + dir * dist, target);
        }

        // The ship drifts on: rising and falling, rolling and pitching a little.
        const float SS = 4.2f;
        var shipM = T(new Vector3(0, 0.05f * Mathf.Sin(t * 0.7f), 0)) * RX(0.035f * Mathf.Sin(t * 0.5f)) * RZ(0.025f * Mathf.Sin(t * 0.6f + 1)) * S(SS);
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
            Place(tr, pl.On == "air" ? S(SS) * T(spot) * RX(0.06f * Mathf.Sin(t * 0.61f)) * RZ(0.07f * Mathf.Sin(t * 0.83f + 2.6f)) * local : shipM * T(spot) * local);
        }

        // The ship's camera: the whole ship, side on and a little from ahead and below, set off to the left.
        float aspect = Mathf.Max(0.3f, ui.aspect);
        float half = Mathf.Tan(16 * Mathf.Deg2Rad);
        {
            float dist = Mathf.Max(3.7f / (half * aspect), 2.4f / half);
            float yaw = -0.52f + 0.03f * Mathf.Sin(t * 0.17f), pitch = 0.1f;
            var target = new Vector3(-0.3f, 0.74f, 0);
            var dir = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), Mathf.Sin(pitch), Mathf.Cos(yaw) * Mathf.Cos(pitch));
            Aim(shipCam, target + dir * dist, target);
            shipCam.ResetProjectionMatrix();
            var p = shipCam.projectionMatrix;
            // (Set off centre by shearing the projection: the subject moves aside, its perspective unchanged.)
            p.m02 = 0.1f * 2;
            shipCam.projectionMatrix = p;
        }
    }
}
