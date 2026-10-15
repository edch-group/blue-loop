using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using BlueLoop.Models;
using Newtonsoft.Json.Linq;

/// <summary>
/// The procedural 3D models (unity/Assets/Scripts/Models) against the TypeScript's (npx vite-node scripts/record-models.ts):
/// each mesh's vertex count, each component's sum and sum of squares, and its sampled vertices, within 1e-4 (relative for
/// the sums); and where the things on them are.
/// </summary>
public static class ModelChecks
{
    /// <summary>How near is the same (MODEL_TOL to try another; 0 for exactly).</summary>
    static readonly double Tol = double.Parse(Environment.GetEnvironmentVariable("MODEL_TOL") ?? "1e-4", System.Globalization.CultureInfo.InvariantCulture);

    static bool Near(double got, double want) => Math.Abs(got - want) <= Tol * Math.Max(1, Math.Abs(want));

    /// <summary>The first way a mesh differs from its recorded summary, or null.</summary>
    static string Mesh(float[] a, JToken want)
    {
        int stride = (int)want["stride"], n = a.Length / stride;
        if (n != (int)want["n"]) return $"{n} vertices, wanted {want["n"]}";
        var sum = new double[stride];
        var sq = new double[stride];
        for (int i = 0; i < a.Length; i++)
        {
            sum[i % stride] += a[i];
            sq[i % stride] += (double)a[i] * a[i];
        }
        for (int c = 0; c < stride; c++)
        {
            if (!Near(sum[c], (double)want["sum"][c])) return $"component {c}'s sum {sum[c]}, wanted {want["sum"][c]}";
            if (!Near(sq[c], (double)want["sq"][c])) return $"component {c}'s sum of squares {sq[c]}, wanted {want["sq"][c]}";
        }
        foreach (var s in want["samples"])
        {
            var i = (int)s[0];
            for (int c = 0; c < stride; c++)
                if (!Near(a[i * stride + c], (double)s[c + 1]))
                    return $"vertex {i}: [{string.Join(", ", Enumerable.Range(0, stride).Select(k => a[i * stride + k]))}], wanted {s.ToString(Newtonsoft.Json.Formatting.None)}";
        }
        return null;
    }

    static string Points(IList<V3> got, JToken want, string what)
    {
        var w = (JArray)want;
        if (got.Count != w.Count) return $"{what}: {got.Count}, wanted {w.Count}";
        for (int i = 0; i < got.Count; i++)
            for (int c = 0; c < 3; c++)
                if (!Near(got[i][c], (double)w[i][c])) return $"{what} {i}: {got[i]}, wanted {w[i].ToString(Newtonsoft.Json.Formatting.None)}";
        return null;
    }

    static string Colour(Rgb got, JToken want, string what) =>
        Enumerable.Range(0, 3).All(c => Near(got[c], (double)want[c])) ? null : $"{what} ({got.R}, {got.G}, {got.B}), wanted {want.ToString(Newtonsoft.Json.Formatting.None)}";

    static string Suns(IList<CarriedSun> got, JToken want)
    {
        var w = (JArray)want;
        if (got.Count != w.Count) return $"suns: {got.Count}, wanted {w.Count}";
        for (int i = 0; i < got.Count; i++)
        {
            var d = Points(new[] { got[i].At }, new JArray(w[i]["at"]), "sun");
            if (d != null) return d;
            if (!Near(got[i].R, (double)w[i]["r"])) return $"sun {i}'s size {got[i].R}, wanted {w[i]["r"]}";
        }
        return null;
    }

    static string Num(double got, JToken want, string what) => Near(got, (double)want) ? null : $"{what} {got}, wanted {want}";

    static string First(params Func<string>[] checks)
    {
        foreach (var c in checks)
        {
            var d = c();
            if (d != null) return d;
        }
        return null;
    }

    /// <summary>Something built, timed (in milliseconds).</summary>
    static (T, double) Timed<T>(Func<T> build)
    {
        var sw = Stopwatch.StartNew();
        var r = build();
        return (r, sw.Elapsed.TotalMilliseconds);
    }

    static Strip StripOf(JToken j) => new Strip
    {
        Nodes = j["nodes"].Select(n => n.Select(x => (double)x).ToArray()).ToList(),
        Routes = j["routes"].Select(n => n.Select(x => (double)x).ToArray()).ToList(),
    };

    /// <summary>
    /// The Captain's ship: in Unity a made model (Resources/Models/CaptainShip.bytes), no longer the web's captain-ship.ts,
    /// so checked for itself: it builds whole however fitted, its engines and smoke where they should be, the Captain and
    /// the crew standing on it, its slots marked.
    /// </summary>
    public static void CaptainShips(Action<string, bool, string> check)
    {
        CaptainShip.HullSource = () => System.IO.File.ReadAllBytes(System.IO.Path.Combine(Repo.Root, "unity/Assets/Resources/Models/CaptainShip.bytes"));
        CaptainFigure.Source = () => System.IO.File.ReadAllBytes(System.IO.Path.Combine(Repo.Root, "unity/Assets/Resources/Models/Captain.bytes"));
        var all = new Dictionary<string, string> { ["armour"] = "aegis_hull", ["shield"] = "halo_generator", ["port"] = "nova_lance", ["starboard"] = "nova_lance", ["booster"] = "afterburners", ["warp"] = "fold_drive" };
        var specs = new[]
        {
            new CaptainShipSpec { Level = 0 },
            new CaptainShipSpec { Level = 3, Parts = new Dictionary<string, string> { ["armour"] = "scrap_plating" }, Rarity = new Dictionary<string, string> { ["armour"] = "dwarf" }, Crew = new List<string> { "lancer" } },
            new CaptainShipSpec { Level = 7, Parts = new Dictionary<string, string> { ["booster"] = "ion_boosters" }, Crew = new List<string> { "engineer", "shade", "seer" } },
            new CaptainShipSpec { Level = 15, Parts = all, Rarity = all.ToDictionary(kv => kv.Key, kv => "anomaly"), Crew = new List<string> { "lancer", "engineer", "defector", "shade", "seer" } },
            new CaptainShipSpec { Level = 22, Parts = new Dictionary<string, string> { ["warp"] = "fold_drive" }, Rarity = new Dictionary<string, string> { ["warp"] = "unknown" }, Crew = new List<string> { "nobody" } },
        };
        foreach (var spec in specs)
        {
            var (s, ms) = Timed(() => CaptainShip.CaptainShipModel(spec));
            var (map, ms2) = Timed(() => CaptainShip.CaptainShipMap(spec));
            string bad = null;
            if (s.Mesh.Length == 0 || s.Mesh.Length % 30 != 0) bad = $"{s.Mesh.Length} floats";
            for (int i = 0; i < map.Mesh.Length && bad == null; i++)
                if (float.IsNaN(map.Mesh[i]) || float.IsInfinity(map.Mesh[i])) bad = $"float {i} is {map.Mesh[i]}";
            var engines = 3 + (spec.Parts.ContainsKey("booster") ? 2 : 0);
            if (s.Engines.Count != engines) bad ??= $"{s.Engines.Count} engines, wanted {engines}";
            // (Every engine astern, at the back of the hull.)
            if (s.Engines.Any(e => e.X > -0.5)) bad ??= "an engine not astern";
            if (s.Smoke.Count != (spec.Level < 4 ? 2 : 0)) bad ??= $"{s.Smoke.Count} smoke vents at level {spec.Level}";
            // (The Captain on the foredeck's floor, between its rails, its rails above it.)
            var floor = CaptainShip.ZC + (CaptainShip.TopAt(30, 14) - CaptainShip.ZC) * s.Swell;
            if (Math.Abs(s.Captain.Z - floor) > 0.3) bad ??= $"the Captain at {s.Captain.Z}, the deck at {floor}";
            if (s.RailZ < s.Deck + 0.5) bad ??= $"the rail ({s.RailZ}) not above the deck ({s.Deck})";
            // (The crew who stand on the hull standing on it, not in it or over it.)
            foreach (var id in spec.Crew ?? new List<string>())
                if (CompanionModels.Places.TryGetValue(id, out var pl) && pl.On == "dish")
                {
                    var at = s.CrewAt(pl);
                    if (at.Z < CaptainShip.ZC + 2) bad ??= $"{id} at {at}, inside the hull";
                }
            var spots = CaptainShip.SlotSpots(spec.Level);
            if (spots.Count != CaptainShip.Slots.Length || CaptainShip.Slots.Any(k => !spots.ContainsKey(k))) bad ??= $"{spots.Count} slots";
            check($"model Captain's ship (level {spec.Level}, {s.Mesh.Length / 10} vertices, {ms:0.0} ms; on the map {map.Mesh.Length / 10}, {ms2:0.0} ms)", bad == null, bad);
        }
    }

    /// <summary>
    /// The Captain (Resources/Models/Captain.bytes, as Meshy rigged him): every pose stands him whole, upright and his
    /// height, his feet on the floor; standing him again each frame (breathing, looking about) is quick, and moves him
    /// only a little. (CAPTAIN_OBJ=folder writes each pose there as an OBJ, to look at.)
    /// </summary>
    public static void Captain(Action<string, bool, string> check)
    {
        CaptainFigure.Source = () => System.IO.File.ReadAllBytes(System.IO.Path.Combine(Repo.Root, "unity/Assets/Resources/Models/Captain.bytes"));
        foreach (var pose in CaptainFigure.Poses.ToList())
        {
            var f = new CaptainFigure(pose);
            string bad = null;
            float lo = float.MaxValue, hi = float.MinValue;
            for (int i = 0; i < f.Count; i++)
            {
                for (int c = 0; c < 3; c++)
                    if (float.IsNaN(f.Pos[i * 3 + c]) || float.IsNaN(f.Nor[i * 3 + c])) bad ??= $"corner {i} not a number";
                lo = Math.Min(lo, f.Pos[i * 3 + 1]);
                hi = Math.Max(hi, f.Pos[i * 3 + 1]);
            }
            if (Math.Abs(lo) > 1e-4) bad ??= $"his feet at {lo}, not on the floor";
            bool up = pose == "stand" || pose == "shield";
            if (hi < (up ? 0.85 : 0.4) || hi > (up ? 1.05 : 0.9)) bad ??= $"{hi} tall";
            var still = (float[])f.Pos.Clone();
            var (_, ms) = Timed(() => { for (int k = 1; k <= 10; k++) f.Pose(k * 0.37); return 0; });
            float most = 0;
            for (int i = 0; i < still.Length; i++) most = Math.Max(most, Math.Abs(still[i] - f.Pos[i]));
            if (most > 0.03 || most < 0.001) bad ??= $"moving {most} as he stands";
            var dir = Environment.GetEnvironmentVariable("CAPTAIN_OBJ");
            if (dir != null)
            {
                f.Pose(0);
                var o = new System.Text.StringBuilder();
                for (int i = 0; i < f.Count; i++) o.Append($"v {f.Pos[i * 3]} {f.Pos[i * 3 + 1]} {f.Pos[i * 3 + 2]}\nvt {f.Uv[i * 2]} {f.Uv[i * 2 + 1]}\nvn {f.Nor[i * 3]} {f.Nor[i * 3 + 1]} {f.Nor[i * 3 + 2]}\n");
                for (int i = 0; i < f.Tris.Length; i += 3) o.Append($"f {f.Tris[i] + 1}/{f.Tris[i] + 1}/{f.Tris[i] + 1} {f.Tris[i + 1] + 1}/{f.Tris[i + 1] + 1}/{f.Tris[i + 1] + 1} {f.Tris[i + 2] + 1}/{f.Tris[i + 2] + 1}/{f.Tris[i + 2] + 1}\n");
                System.IO.File.WriteAllText(System.IO.Path.Combine(dir, pose + ".obj"), o.ToString());
            }
            check($"model the Captain ({pose}: {f.Count} corners, {f.Tris.Length / 3} triangles, {hi:0.00} tall, standing him {ms / 10:0.0} ms)", bad == null, bad);
        }
        {
            // His routine: as it begins, standing as he stands held (his poses blended back to the same); all the way
            // through, whole, his feet on the floor, never jumping from one moment to the next.
            string bad = null;
            var held = new CaptainFigure("stand");
            var going = new CaptainFigure();
            held.Pose(0.5);
            going.Pose(0.5);
            float off = 0;
            for (int i = 0; i < held.Pos.Length; i++) off = Math.Max(off, Math.Abs(held.Pos[i] - going.Pos[i]));
            if (off > 2e-3) bad = $"his routine's standing {off} off his standing";
            var last = (float[])going.Pos.Clone();
            float jump = 0;
            int steps = (int)(CaptainFigure.RoutineLength * 30);
            for (int k = 1; k <= steps && bad == null; k++)
            {
                going.Pose(0.5 + k / 30.0);
                float lo = float.MaxValue;
                for (int i = 0; i < going.Count; i++)
                {
                    if (float.IsNaN(going.Pos[i * 3 + 1])) { bad = $"not a number at {k / 30.0:0.0} s"; break; }
                    lo = Math.Min(lo, going.Pos[i * 3 + 1]);
                    jump = Math.Max(jump, Math.Abs(going.Pos[i * 3 + 1] - last[i * 3 + 1]));
                }
                if (Math.Abs(lo) > 0.05) bad ??= $"his lowest at {lo} at {k / 30.0:0.0} s";
                Array.Copy(going.Pos, last, last.Length);
            }
            if (jump > 0.06) bad ??= $"a corner jumping {jump} in a frame";
            // (CAPTAIN_OBJ: his routine, 8 frames a second, every corner's place, to watch.)
            var dir = Environment.GetEnvironmentVariable("CAPTAIN_OBJ");
            if (dir != null)
                using (var o = new System.IO.BinaryWriter(System.IO.File.Create(System.IO.Path.Combine(dir, "routine.bin"))))
                {
                    int frames = (int)(CaptainFigure.RoutineLength * 8);
                    o.Write(frames);
                    o.Write(going.Count);
                    for (int k = 0; k < frames; k++)
                    {
                        going.Pose(k / 8.0);
                        foreach (var x in going.Pos) o.Write(x);
                    }
                }
            check($"model the Captain's routine ({CaptainFigure.RoutineLength:0.0} s, most a corner moves in a frame {jump:0.000})", bad == null, bad);
        }
    }

    public static void Run(Action<string, bool, string> check, JObject t)
    {
        foreach (var p in ((JObject)t["ships"]).Properties())
        {
            var race = int.Parse(p.Name);
            var (s, ms) = Timed(() => Ship3d.ShipModel3d(race));
            var d = First(() => Mesh(s.Mesh, p.Value["mesh"]), () => Points(s.Engines, p.Value["engines"], "engine"), () => Colour(s.Glow, p.Value["glow"], "glow"), () => Suns(s.Suns, p.Value["suns"]));
            check($"model ship {race} ({s.Mesh.Length / 10} vertices, {ms:0.0} ms)", d == null, d);
        }
        foreach (var (name, kind) in new[] { ("station", PropKind.Station), ("lab", PropKind.Lab) })
        {
            var (m, ms) = Timed(() => Ship3d.PropModel3d(kind));
            var d = Mesh(m, t["props"][name]);
            check($"model prop {name} ({m.Length / 10} vertices, {ms:0.0} ms)", d == null, d);
        }
        {
            var (m, ms) = Timed(CaptainModels.CaptainModel);
            var d = Mesh(m, t["captain"]);
            check($"model Captain ({m.Length / 10} vertices, {ms:0.0} ms)", d == null, d);
            (m, ms) = Timed(CaptainModels.StreamerModel);
            d = Mesh(m, t["streamer"]);
            check($"model Captain's streamers ({m.Length / 10} vertices, {ms:0.0} ms)", d == null, d);
        }
        foreach (var p in ((JObject)t["companions"]).Properties())
        {
            var (m, ms) = Timed(() => CompanionModels.CompanionModel(p.Name));
            var d = Mesh(m, p.Value);
            check($"model companion {p.Name} ({m.Length / 10} vertices, {ms:0.0} ms)", d == null, d);
        }
        foreach (var c in t["nebulas"])
        {
            var strip = StripOf(c["strip"]);
            var (g, ms) = Timed(() => NebulaGeometry.BuildNebula((double)c["seed"], strip));
            var d = First(() => Mesh(g.Ground, c["ground"]), () => Mesh(g.Stars, c["stars"]));
            check($"model nebula {c["seed"]} ({g.Ground.Length / NebulaGeometry.GroundStride} corners, {g.Stars.Length / 6} stars, {ms:0} ms)", d == null, d);
        }
    }
}
