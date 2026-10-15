using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using TMPro;
using UnityEngine;

/// <summary>
/// The focused system's planets (campaign.ts renderOrbits, styles.css .cmp-orbit-ring, .cmp-orb-planet): each on its
/// orbit flat on the map's plane (10 above the system's own height), a fine ring, the planet going round it, upright to
/// the eye, its name small over it; fading in as the system is focused (0.8s), out as focus moves on (0.55s).
/// </summary>
public partial class CampaignView
{
    /// <summary>A system's planets as drawn: what is drawn, since when, and (focus moved on) since when it has been going.</summary>
    class OrbitSet
    {
        public string Id;
        public Transform Root;
        public float Shown, Leaving = -1;
        public readonly List<Material> Rings = new List<Material>();
        public readonly List<(Spr ball, TextMeshPro name, float r, float period, float delay, float size)> Planets = new List<(Spr, TextMeshPro, float, float, float, float)>();
    }

    OrbitSet orbitsNow;
    readonly List<OrbitSet> orbitsGoing = new List<OrbitSet>();

    /// <summary>The track tints (campaign.ts TRACK_TINT): weapons, defences, economy, resources.</summary>
    static readonly Dictionary<string, string> TrackTint = new Dictionary<string, string>
    {
        ["weapons"] = "#e2a494", ["defences"] = "#a3c3df", ["economy"] = "#e0cd94", ["resources"] = "#abd2b5",
    };

    /// <summary>The focused system's planets drawn (once it is focused), the last one's going (once focus moves on).</summary>
    void Orbits()
    {
        if (world == null) return;
        // (What was focused must still be there: a rift's new galaxy reuses no id it can trust.)
        if (selected != null && !state.Nodes.Any(n => n.Id == selected)) selected = null;
        if (orbitsNow != null && orbitsNow.Id == selected) return;
        if (orbitsNow != null)
        {
            orbitsNow.Leaving = Clock;
            orbitsGoing.Add(orbitsNow);
            orbitsNow = null;
        }
        if (selected != null) orbitsNow = MakeOrbits(Campaign.NodeById(state, selected));
    }

    OrbitSet MakeOrbits(CampaignNode n)
    {
        var set = new OrbitSet { Id = n.Id, Shown = Clock };
        set.Root = new GameObject("Orbits " + n.Id).transform;
        set.Root.SetParent(world, false);
        // (On the system's place, 10 above it: translateZ(10px) on the plane.)
        set.Root.localPosition = NodePos(n.Id) + new Vector3(0, 10 * Scale, 0);
        var planets = n.Planets ?? new List<MapPlanet>();
        for (int j = 0; j < planets.Count; j++)
        {
            var pl = planets[j];
            int level = 1 + Mathf.Min(2, n.Fortification);
            float r = 30 + j * 16, period = 16 + j * 9;
            // (Spread round their orbits, the same for the system every time: a negative delay.)
            float delay = -(float)JsMod(n.X * 7 + n.Y * 3 + j * 97, period);
            float size = 7 + level * 2.5f;
            // The orbit: a fine ring (1px, rgba(150, 158, 175, 0.45)) lying on the plane.
            var q = 2 * r + 8;
            var ringMat = Mats.Make("Soft", new Color(150 / 255f, 158 / 255f, 175 / 255f, 0.45f));
            ringMat.SetFloat("_Aspect", 1);
            ringMat.SetFloat("_Size", r / q);
            ringMat.SetFloat("_Radius", r / q);
            ringMat.SetFloat("_Soft", 0.5f / q);
            ringMat.SetFloat("_Ring", 1);
            Mats.Flat("Orbit", set.Root, ringMat, q * Scale, q * Scale);
            set.Rings.Add(ringMat);
            // The planet: a ball in its track's tint, lit from its upper left, glowing softly; upright to the eye.
            TrackTint.TryGetValue(pl.Tint ?? "", out var hex);
            var ball = Picture(set.Root, "Planet", PlanetArt(hex ?? "#c9cbd0", size), 3002);
            ball.Size((size / 2 + 6) * MapK);
            // Its name over it (12px spaced 0.1em, scaled to 0.45, 2 above it, in soft ink on a white halo).
            var name = Mats.FlatText("Planet name", ball.T, (pl.Name ?? "").ToUpperInvariant(), 12 * 0.45f * Scale * 10, Look.InkSoft, true, 400, 10, TextAlignmentOptions.Bottom);
            name.textWrappingMode = TextWrappingModes.NoWrap;
            name.rectTransform.pivot = new Vector2(0.5f, 0);
            name.rectTransform.sizeDelta = new Vector2(400 * Scale, 12 * 0.45f * Scale * 1.4f);
            name.fontMaterial.EnableKeyword("UNDERLAY_ON");
            name.fontMaterial.SetColor("_UnderlayColor", Color.white);
            name.fontMaterial.SetFloat("_UnderlaySoftness", 0.6f);
            name.fontMaterial.SetFloat("_UnderlayDilate", 0.3f);
            set.Planets.Add((ball, name, r, period, delay, size));
        }
        AnimateOrbit(set, Clock);
        return set;
    }

    /// <summary>JavaScript's remainder (its sign the dividend's).</summary>
    static double JsMod(double a, double b) => a - b * System.Math.Truncate(a / b);

    /// <summary>The planets this frame: going round (cmp-orbit: once a period, from their delay), fading in or out.</summary>
    void AnimateOrbits(float time)
    {
        if (orbitsNow != null) AnimateOrbit(orbitsNow, time);
        for (int i = orbitsGoing.Count - 1; i >= 0; i--)
        {
            var set = orbitsGoing[i];
            if (!Application.isPlaying || time - set.Leaving >= 0.55f)
            {
                KillOrbits(set);
                orbitsGoing.RemoveAt(i);
            }
            else AnimateOrbit(set, time);
        }
    }

    void AnimateOrbit(OrbitSet set, float time)
    {
        if (set.Root == null) return;
        // (cmp-fade: in from nothing over 0.8s, eased out; cmp-fade-out: to nothing over 0.55s, eased in.)
        float a;
        if (set.Leaving >= 0)
        {
            float k = Mathf.Clamp01((time - set.Leaving) / 0.55f);
            a = 1 - k * k * k;
        }
        else
        {
            float k = Application.isPlaying ? Mathf.Clamp01((time - set.Shown) / 0.8f) : 1;
            a = 1 - (1 - k) * (1 - k) * (1 - k);
        }
        foreach (var m in set.Rings) m.color = new Color(150 / 255f, 158 / 255f, 175 / 255f, 0.45f * a);
        var face = Cam != null ? Cam.transform.rotation : Quaternion.identity;
        foreach (var (ball, name, r, period, delay, size) in set.Planets)
        {
            if (ball.T == null) continue;
            // (rotate(360deg) a period, clockwise on the page: from +x toward +y of the map, which is -z here.)
            float turn = (time - set.Shown - delay) / period * Mathf.PI * 2;
            ball.T.localPosition = new Vector3(Mathf.Cos(turn) * r * Scale, 0, -Mathf.Sin(turn) * r * Scale);
            ball.Alpha(a);
            // (Its name on the ball's top, 2 above it, facing the eye as the ball does.)
            name.transform.rotation = face;
            name.transform.position = ball.T.position + face * Vector3.up * ((size / 2 + 2) * Scale);
            name.alpha = a;
        }
    }

    void KillOrbits(OrbitSet set)
    {
        if (set.Root == null) return;
        foreach (var p in set.Planets) if (p.name != null) Mats.Kill(p.name.fontMaterial);
        KillAll(set.Root.gameObject);
    }

    static readonly Dictionary<string, Texture2D> planetArt = new Dictionary<string, Texture2D>();

    /// <summary>
    /// A planet's picture (.cmp-orb-planet): a ball `size` across, radial-gradient(circle at 35% 30%, #fff to 12%, its
    /// tint at 55%, its tint mixed 70% with #556 at the edge), glowing 6 round it (0 0 6px, its tint at 70%).
    /// </summary>
    static Texture2D PlanetArt(string hex, float size)
    {
        string key = hex + "|" + size;
        if (planetArt.TryGetValue(key, out var have) && have != null) return have;
        const int N = 64;
        var tex = new Texture2D(N, N, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var pc = Hex(hex);
        var edge = Color.Lerp(Hex("#555566"), pc, 0.7f);
        float half = size / 2 + 6, ball = size / 2, far = Mathf.Sqrt(0.65f * 0.65f + 0.7f * 0.7f) * size;
        for (int y = 0; y < N; y++)
            for (int x = 0; x < N; x++)
            {
                // (In page pixels from the ball's middle, y down.)
                float px = ((x + 0.5f) / N * 2 - 1) * half, py = -((y + 0.5f) / N * 2 - 1) * half;
                float d = Mathf.Sqrt(px * px + py * py);
                // The glow: a 6px blur of the ball's disc (a gaussian of 3), its tint at 70%.
                float glow = 0.7f * (1 - Smooth((d - ball) / 3f));
                Color c = new Color(pc.r, pc.g, pc.b, glow);
                if (d <= ball + 0.5f)
                {
                    float gx = px + ball - 0.35f * size, gy = py + ball - 0.3f * size, g = Mathf.Sqrt(gx * gx + gy * gy) / far;
                    var b = g < 0.12f ? Color.white : g < 0.55f ? Color.Lerp(Color.white, pc, (g - 0.12f) / 0.43f) : Color.Lerp(pc, edge, (g - 0.55f) / 0.45f);
                    float cover = Mathf.Clamp01(ball + 0.5f - d);
                    // (The ball over its glow.)
                    float aOut = cover + glow * (1 - cover);
                    c = aOut > 0 ? new Color((b.r * cover + pc.r * glow * (1 - cover)) / aOut, (b.g * cover + pc.g * glow * (1 - cover)) / aOut, (b.b * cover + pc.b * glow * (1 - cover)) / aOut, aOut) : c;
                }
                tex.SetPixel(x, y, c);
            }
        tex.Apply();
        planetArt[key] = tex;
        return tex;
    }

    /// <summary>The share of a gaussian's area past a point (in its sigmas): about 0.5 at the disc's edge.</summary>
    static float Smooth(float s) => 1 / (1 + Mathf.Exp(-1.7f * s));
}
