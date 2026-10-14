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

    static CaptainShipSpec Spec(JToken j)
    {
        var spec = new CaptainShipSpec { Level = (double)j["level"] };
        foreach (var p in ((JObject)j["parts"]).Properties()) spec.Parts[p.Name] = (string)p.Value;
        foreach (var p in ((JObject)j["rarity"]).Properties()) spec.Rarity[p.Name] = (string)p.Value;
        if (j["crew"] != null) spec.Crew = j["crew"].Select(c => (string)c).ToList();
        return spec;
    }

    static Strip StripOf(JToken j) => new Strip
    {
        Nodes = j["nodes"].Select(n => n.Select(x => (double)x).ToArray()).ToList(),
        Routes = j["routes"].Select(n => n.Select(x => (double)x).ToArray()).ToList(),
    };

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
        int si = 0;
        foreach (var c in t["captainShips"])
        {
            var spec = Spec(c["spec"]);
            var (s, ms) = Timed(() => CaptainShip.CaptainShipModel(spec));
            var w = c["model"];
            var d = First(
                () => Mesh(s.Mesh, w["mesh"]),
                () => Points(s.Smoke, w["smoke"], "smoke"),
                () => Points(s.Engines, w["engines"], "engine"),
                () => Num(s.Deck, w["deck"], "deck"),
                () => Num(s.Bridge, w["bridge"], "bridge"),
                () => Num(s.RailY, w["rail"]["y"], "rail y"),
                () => Num(s.RailZ, w["rail"]["z"], "rail z"),
                () => Num(s.Dish, w["dish"], "dish"));
            check($"model Captain's ship {si} (level {spec.Level}, {s.Mesh.Length / 10} vertices, {ms:0.0} ms)", d == null, d);
            var (map, ms2) = Timed(() => CaptainShip.CaptainShipMap(spec));
            var wm = c["map"];
            d = First(
                () => Mesh(map.Mesh, wm["mesh"]),
                () => Points(map.Engines, wm["engines"], "engine"),
                () => Colour(map.Glow, wm["glow"], "glow"),
                () => Suns(map.Suns, wm["suns"]),
                () => Points(map.Smoke, wm["smoke"], "smoke"));
            check($"model Captain's ship {si} on the map ({map.Mesh.Length / 10} vertices, {ms2:0.0} ms)", d == null, d);
            si++;
        }
        {
            string bad = null;
            foreach (var c in t["slotSpots"])
            {
                var spots = CaptainShip.SlotSpots((double)c["level"]);
                var want = (JObject)c["spots"];
                if (want.Properties().Count() != spots.Count) bad ??= $"level {c["level"]}: {spots.Count} slots";
                foreach (var p in want.Properties())
                    bad ??= spots.TryGetValue(p.Name, out var v) ? Points(new[] { v }, new JArray(p.Value), $"level {c["level"]} {p.Name}") : $"no {p.Name}";
            }
            check($"model slot spots ({t["slotSpots"].Count()} levels)", bad == null, bad);
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
