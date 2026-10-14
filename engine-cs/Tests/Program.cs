using System;
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
}

Console.WriteLine(failed == 0 ? "All passed." : $"{failed} failed.");
return failed == 0 ? 0 : 1;
