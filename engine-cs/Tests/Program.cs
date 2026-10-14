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

// (The checker itself: two states a move apart must not compare alike.)
{
    var path = System.IO.Path.Combine(Repo.Root, "engine-cs/traces/battles.json");
    if (System.IO.File.Exists(path))
    {
        var g = Newtonsoft.Json.Linq.JArray.Parse(System.IO.File.ReadAllText(path))[0];
        Check("checker sees a difference", JsonDiff.First(g["steps"][0]["state"], g["steps"][1]["state"]) != null);
    }
}

Console.WriteLine(failed == 0 ? "All passed." : $"{failed} failed.");
return failed == 0 ? 0 : 1;
