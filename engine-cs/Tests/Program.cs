using System;
using System.Linq;
using BlueLoop.Engine;

// The C# engine's checks against the TypeScript engine's recordings.
var failed = 0;
void Check(string name, bool ok, string detail = "")
{
    Console.WriteLine($"{(ok ? "ok  " : "FAIL")} {name}{(ok || detail == "" ? "" : ": " + detail)}");
    if (!ok) failed++;
}

// RNG: the same numbers as rng.ts for the same seed (values from the TypeScript engine).
{
    var s = new GameState { RngState = 12345 };
    var got = new[] { Rng.Next(s), Rng.Next(s), Rng.Next(s) };
    var want = new[] { 0.9797282677609473, 0.3067522644996643, 0.484205421525985 };
    Check("rng", Math.Abs(got[0] - want[0]) < 1e-15 && Math.Abs(got[1] - want[1]) < 1e-15 && Math.Abs(got[2] - want[2]) < 1e-15, string.Join(", ", got));
}

// Card data: every card loads into the C# types and writes back out the same (no field lost or misnamed).
{
    var root = Repo.Root;
    var cardsJson = System.IO.File.ReadAllText(System.IO.Path.Combine(root, "unity/Assets/Resources/Engine/cards.json"));
    var decksJson = System.IO.File.ReadAllText(System.IO.Path.Combine(root, "unity/Assets/Resources/Engine/decks.json"));
    CardData.Load(cardsJson, decksJson);
    var back = Json.Write(CardData.All);
    var diff = JsonDiff.First(Newtonsoft.Json.Linq.JToken.Parse(cardsJson), Newtonsoft.Json.Linq.JToken.Parse(back));
    Check($"cards round trip ({CardData.All.Count})", diff == null, diff);
    var decksBack = JsonDiff.First(Newtonsoft.Json.Linq.JToken.Parse(decksJson), Newtonsoft.Json.Linq.JToken.Parse(Json.Write(CardData.Decks)));
    Check($"decks round trip ({CardData.Decks.Count})", decksBack == null, decksBack);
    Cards.LoadRules(System.IO.File.ReadAllText(System.IO.Path.Combine(root, "unity/Assets/Resources/Engine/rules.json")));
    Builds.Load(System.IO.File.ReadAllText(System.IO.Path.Combine(root, "unity/Assets/Resources/Engine/builds.json")));
    Heroes.Load(System.IO.File.ReadAllText(System.IO.Path.Combine(root, "unity/Assets/Resources/Engine/heroes.json")));
    Ascent.Load(System.IO.File.ReadAllText(System.IO.Path.Combine(root, "unity/Assets/Resources/Engine/ascent.json")));
}

// Growth: heroes, boons, modules, ascent, relic rolls, the companions, the Captain and progression, each function called
// with the arguments the TypeScript engine was (npx vite-node scripts/record-growth.ts), returning the same.
{
    var path = System.IO.Path.Combine(Repo.Root, "engine-cs/traces/growth.json");
    if (!System.IO.File.Exists(path)) Console.WriteLine("skip growth (no engine-cs/traces/growth.json: npx vite-node scripts/record-growth.ts)");
    else
    {
        var (total, bad, shown) = Growth.Check(Newtonsoft.Json.Linq.JArray.Parse(System.IO.File.ReadAllText(path)));
        foreach (var line in shown) Console.WriteLine("  " + line);
        Check($"growth ({total} cases)", bad == 0, $"{bad} differ");
    }
    World.Load(System.IO.File.ReadAllText(System.IO.Path.Combine(Repo.Root, "unity/Assets/Resources/Engine/world.json")));
    Campaign.Load(System.IO.File.ReadAllText(System.IO.Path.Combine(Repo.Root, "unity/Assets/Resources/Engine/campaign.json")));
}

// Built cards: fused, marked, the Captain's builds and the crew's, each as the TypeScript engine builds it.
{
    var path = System.IO.Path.Combine(Repo.Root, "engine-cs/traces/builds.json");
    if (!System.IO.File.Exists(path)) Console.WriteLine("skip built cards (no engine-cs/traces/builds.json: npx tsx scripts/record-builds.ts)");
    else
    {
        var built = Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(path));
        int bad = 0;
        foreach (var kv in built)
        {
            string d;
            try { d = JsonDiff.First(kv.Value, Newtonsoft.Json.Linq.JToken.Parse(Json.Write(Cards.Def(kv.Key)))); }
            catch (Exception e) { d = e.Message; }
            if (d != null && bad++ < 8) Console.WriteLine($"  {kv.Key}: {d}");
        }
        Check($"built cards ({built.Count})", bad == 0, $"{bad} differ");
    }
}

// Battles: each recorded game (npm run record-battles) set up and played move by move here, every state after a move
// matching the TypeScript engine's.
{
    var path = System.IO.Path.Combine(Repo.Root, "engine-cs/traces/battles.json");
    if (!System.IO.File.Exists(path)) Check("battles", false, "no recording: run npm run record-battles");
    else
    {
        var games = Newtonsoft.Json.Linq.JArray.Parse(System.IO.File.ReadAllText(path));
        int gi = 0;
        foreach (var g in games)
        {
            var setup = g["setup"].ToObject<GameSetup>(Newtonsoft.Json.JsonSerializer.Create(Json.Settings));
            string fail = null;
            int moves = 0;
            try
            {
                var state = Game.Create(setup);
                fail = JsonDiff.First(g["start"], Newtonsoft.Json.Linq.JToken.Parse(Json.Write(state)));
                if (fail != null) fail = "start " + fail;
                var steps = (Newtonsoft.Json.Linq.JArray)g["steps"];
                for (int i = 0; fail == null && i < steps.Count; i++)
                {
                    var action = steps[i]["action"].ToObject<BlueLoop.Engine.Action>(Newtonsoft.Json.JsonSerializer.Create(Json.Settings));
                    state = Game.Apply(state, action);
                    moves++;
                    var d = JsonDiff.First(steps[i]["state"], Newtonsoft.Json.Linq.JToken.Parse(Json.Write(state)));
                    if (d != null) fail = $"move {i} ({steps[i]["action"].ToString(Newtonsoft.Json.Formatting.None)}): {d}";
                }
            }
            catch (Exception e)
            {
                fail = $"after {moves} moves: {e.GetType().Name}: {e.Message}\n{e.StackTrace?.Split('\n').FirstOrDefault()}";
            }
            Check($"battle {gi} ({moves} moves)", fail == null, fail);
            gi++;
        }
    }
}

// The AI: at every recorded state where the AI moved, the C# AI chooses the same move.
{
    var path = System.IO.Path.Combine(Repo.Root, "engine-cs/traces/battles.json");
    if (System.IO.File.Exists(path))
    {
        var ser = Newtonsoft.Json.JsonSerializer.Create(Json.Settings);
        var games = Newtonsoft.Json.Linq.JArray.Parse(System.IO.File.ReadAllText(path));
        int gi = 0, total = 0;
        foreach (var g in games)
        {
            if (gi >= int.Parse(Environment.GetEnvironmentVariable("AI_GAMES") ?? "999")) break;
            string fail = null;
            var steps = (Newtonsoft.Json.Linq.JArray)g["steps"];
            var before = g["start"].ToObject<GameState>(ser);
            for (int i = 0; fail == null && i < steps.Count; i++)
            {
                var want = steps[i]["action"];
                try
                {
                    var got = AI.Choose(before);
                    var d = JsonDiff.First(want, Newtonsoft.Json.Linq.JToken.Parse(Json.Write(got)));
                    if (d != null) fail = $"move {i}: wanted {want.ToString(Newtonsoft.Json.Formatting.None)}, chose {Json.Write(got)}";
                }
                catch (Exception e) { fail = $"move {i}: {e.GetType().Name}: {e.Message} {e.StackTrace?.Split('\n').FirstOrDefault()}"; }
                total++;
                before = steps[i]["state"].ToObject<GameState>(ser);
            }
            Check($"AI game {gi}", fail == null, fail);
            gi++;
        }
    }
}

// (The checker itself: two states a move apart must not compare alike.)
{
    var path = System.IO.Path.Combine(Repo.Root, "engine-cs/traces/battles.json");
    if (System.IO.File.Exists(path))
    {
        var g = Newtonsoft.Json.Linq.JArray.Parse(System.IO.File.ReadAllText(path))[0];
        Check("checker sees a difference", JsonDiff.First(g["steps"][0]["state"], g["steps"][1]["state"]) != null);
    }
}

// The world around the battles: story, races, rifts, modes, encounters, research, ship parts, lessons and puzzles.
WorldChecks.Run(Check);

// Campaign runs: each built from its setup, then every action replayed, the state after each the same as the
// TypeScript engine's (npx vite-node scripts/record-runs.ts).
{
    var path = System.IO.Path.Combine(Repo.Root, "engine-cs/traces/runs.json");
    if (!System.IO.File.Exists(path)) Console.WriteLine("skip campaign runs (no engine-cs/traces/runs.json: npm run record-runs)");
    else
    {
        var runs = Newtonsoft.Json.Linq.JArray.Parse(System.IO.File.ReadAllText(path));
        var ser = Newtonsoft.Json.JsonSerializer.Create(Json.Settings);
        for (int r = 0; r < runs.Count; r++)
        {
            var run = runs[r];
            string diff = null;
            int at = -1;
            try
            {
                // (A run that jumped ahead starts from its recorded state; the rest are built from their setup.)
                var s = run["jump"] != null ? run["start"].ToObject<CampaignState>(ser) : Campaign.Create(run["setup"].ToObject<CampaignSetup>(ser));
                diff = JsonDiff.First(run["start"], Newtonsoft.Json.Linq.JToken.Parse(Json.Write(s)));
                var steps = (Newtonsoft.Json.Linq.JArray)run["steps"];
                for (int i = 0; diff == null && i < steps.Count; i++)
                {
                    at = i;
                    s = Campaign.Apply(s, Campaign.ActionFrom((Newtonsoft.Json.Linq.JObject)steps[i]["action"]));
                    diff = JsonDiff.First(steps[i]["state"], Newtonsoft.Json.Linq.JToken.Parse(Json.Write(s)));
                }
            }
            catch (Exception e) { diff = e.GetType().Name + ": " + e.Message + "\n" + e.StackTrace?.Split('\n').FirstOrDefault(); }
            var what = at < 0 ? "start" : $"step {at} ({run["steps"][at]["action"]["type"]})";
            Check($"campaign run {r} ({run["steps"].Count()} steps)", diff == null, diff == null ? "" : $"{what}: {diff}");
        }
    }
}

Console.WriteLine(failed == 0 ? "All passed." : $"{failed} failed.");
return failed == 0 ? 0 : 1;
