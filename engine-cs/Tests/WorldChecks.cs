using System;
using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

/// <summary>
/// The world around the battles (story, races, rifts, modes, encounters, research, ship parts, lessons, puzzles): each
/// call the TypeScript engine recorded (scripts/record-world.ts) made here, its result matching.
/// </summary>
public static class WorldChecks
{
    static readonly JsonSerializer Ser = JsonSerializer.Create(Json.Settings);

    public static void Run(Action<string, bool, string> check)
    {
        // The data loads into the C# types and writes back out the same.
        var worldJson = System.IO.File.ReadAllText(System.IO.Path.Combine(Repo.Root, "unity/Assets/Resources/Engine/world.json"));
        var back = JsonDiff.First(JToken.Parse(worldJson), JToken.Parse(Json.Write(Json.Read<World.Data>(worldJson))));
        check("world data round trip", back == null, back);

        var path = System.IO.Path.Combine(Repo.Root, "engine-cs/traces/world.json");
        if (!System.IO.File.Exists(path))
        {
            Console.WriteLine("skip world calls (no engine-cs/traces/world.json: npx vite-node scripts/record-world.ts)");
            return;
        }
        var cases = JArray.Parse(System.IO.File.ReadAllText(path));
        var bad = new Dictionary<string, int>();
        var total = new Dictionary<string, int>();
        var watch = System.Diagnostics.Stopwatch.StartNew();
        foreach (var c in cases)
        {
            var f = (string)c["f"];
            var args = (JArray)c["args"];
            var want = c["out"];
            string d;
            try
            {
                var got = Call(f, args);
                var gotJson = got == null ? JValue.CreateNull() : JToken.Parse(Json.Write(got));
                d = JsonDiff.First(want, gotJson);
                // (An empty solution is not no solution.)
                if (d == null && f == "solution" && (want.Type == JTokenType.Null) != (got == null)) d = $"wanted {want}, got {gotJson}";
            }
            catch (Exception e) { d = $"{e.GetType().Name}: {e.Message} {e.StackTrace?.Split('\n').FirstOrDefault()}"; }
            total[f] = total.TryGetValue(f, out var t) ? t + 1 : 1;
            if (d != null)
            {
                bad[f] = bad.TryGetValue(f, out var b) ? b + 1 : 1;
                if (bad[f] <= 3) Console.WriteLine($"  {f}({Short(args)}): {d}");
            }
        }
        foreach (var f in total.Keys) check($"world: {f} ({total[f]})", !bad.ContainsKey(f), bad.ContainsKey(f) ? $"{bad[f]} differ" : "");
        Console.WriteLine($"  (world calls: {watch.ElapsedMilliseconds} ms)");
    }

    static string Short(JArray args)
    {
        var s = args.ToString(Formatting.None);
        return s.Length > 120 ? s.Substring(0, 120) + "…" : s;
    }

    static T As<T>(JToken t) => t == null || t.Type == JTokenType.Null ? default : t.ToObject<T>(Ser);
    static int? I(JToken t) => t == null || t.Type == JTokenType.Null ? (int?)null : (int)t;
    static List<string> Strs(JToken t) => As<List<string>>(t) ?? new List<string>();

    static object Call(string f, JArray a)
    {
        switch (f)
        {
            // ---- Story ----
            case "introScene": return Story.IntroScene((int)a[0], (string)a[1], (string)a[2]);
            case "captainIntroScene": return Story.CaptainIntroScene((string)a[0], (string)a[1]);
            case "recruitScene": return Story.RecruitScene((string)a[0], (string)a[1]);
            case "contactScene": return Story.ContactScene((int)a[0], (string)a[1], (string)a[2], (string)a[3], (string)a[4]);
            case "rivalFallsScene": return Story.RivalFallsScene((int)a[0], (string)a[1]);
            case "victoryHeartScene": return Story.VictoryHeartScene((string)a[0], (string)a[1], (int)a[2]);
            case "defeatScene": return Story.DefeatScene((int)a[0], (bool)a[1]);
            case "firstConquestScene": return Story.FirstConquestScene();
            case "stellariaSightedScene": return Story.StellariaSightedScene();
            case "stellariaClaimedScene": return Story.StellariaClaimedScene();
            case "stellariaWiltedScene": return Story.StellariaWiltedScene();
            case "instabilityScene": return Story.InstabilityScene();
            case "collapseScene": return Story.CollapseScene();
            case "heartSightedScene": return Story.HeartSightedScene();
            case "armyLostScene": return Story.ArmyLostScene();
            case "victoryDominationScene": return Story.VictoryDominationScene();
            case "dimmingScene": return Story.DimmingScene((string)a[0]);
            case "lostSightedScene": return Story.LostSightedScene((string)a[0]);
            case "lostRaidScene": return Story.LostRaidScene((string)a[0], (string)a[1]);
            case "wormholeSightedScene": return Story.WormholeSightedScene((int)a[0]);
            case "wormholeCrossedScene": return Story.WormholeCrossedScene((int)a[0], (int)a[1]);
            case "runOverScene": return Story.RunOverScene((int)a[0]);
            // ---- Races ----
            case "raceTrait": return Races.RaceTrait(I(a[0]));
            case "raceLabel": return Races.RaceLabel(I(a[0]), (string)a[1]);
            // ---- Rifts and modes ----
            case "marksFor": return Rifts.MarksFor(Cards.Def((string)a[0]));
            case "markOf": { var m = Rifts.MarkOf((string)a[0]); return m == null ? null : new { mark = m.Value.mark, @base = m.Value.baseId }; }
            case "markedId": return Rifts.MarkedId((string)a[0], (string)a[1]);
            case "cardMechanics": return Modes.CardMechanics(Cards.Def((string)a[0]));
            case "cardThings": return Modes.CardThings(Cards.Def((string)a[0]));
            case "modeProblem": return Modes.ModeProblem(Cards.Def((string)a[0]), (string)a[1]);
            case "mechanicName": return Modes.MechanicName((string)a[0]);
            case "modeOf": return Modes.ModeOf((string)a[0]);
            // ---- Encounters ----
            case "visitorLook": return Encounters.VisitorLook((string)a[0]);
            case "visitorName": return Encounters.VisitorName((string)a[0], (int)a[1]);
            case "encounterPrice": return Encounters.EncounterPrice((string)a[0], (int)a[1], (int)a[2]);
            case "encounterChoices": return Encounters.EncounterChoices((string)a[0], (int)a[1], (int)a[2]);
            case "openingLines": return Encounters.OpeningLines((string)a[0], (int)a[1], (int)a[2], Strs(a[3]));
            case "closingLines": return Encounters.ClosingLines((string)a[0], (string)a[1], (int)a[2], Strs(a[3]));
            // ---- Research ----
            case "researchBonus": return Research.ResearchBonus(As<ResearchState>(a[0]));
            case "supersededResearch": return Research.SupersededResearch(Strs(a[0]), (string)a[1]);
            case "isExperiment": return Research.IsExperiment((string)a[0]);
            // ---- Ship parts ----
            case "slotKind": return Parts.SlotKind((string)a[0]);
            case "partSlots": return Parts.PartSlots((string)a[0]);
            case "shipFit": return Parts.ShipFit(As<Dictionary<string, string>>(a[0]));
            case "partRarity": return Parts.PartRarity((int)a[0], (double)a[1], (bool)a[2]);
            case "newCurio": return Parts.NewCurio(Strs(a[0]), (double)a[1]);
            case "newPart": return Parts.NewPart(Strs(a[0]), (string)a[1], (double)a[2]);
            // ---- Lessons ----
            case "lessonOpen": return Lessons.LessonOpen((string)a[0], Strs(a[1]));
            // ---- Puzzles ----
            case "solution": return Puzzle.Solution(As<Game.DreamSpec>(a[0]));
            case "rivalDay": return Puzzle.RivalDay(Puzzle.PuzzleGame(As<Game.DreamSpec>(a[0])));
            case "reach": return Puzzle.Reach(Puzzle.PuzzleGame(As<Game.DreamSpec>(a[0])), (int)a[1]).Select(r => new { depth = r.Depth, line = r.Line, heat = r.S.Players[1].Heat }).ToList();
            case "reachLeaving": return Puzzle.Reach(Puzzle.PuzzleGame(As<Game.DreamSpec>(a[0])), (int)a[1], Puzzle.LeavesTheirBoard).Select(r => r.Line).ToList();
            case "solves": { var spec = As<Game.DreamSpec>(a[0]); return Puzzle.Reach(Puzzle.PuzzleGame(spec), (int)a[1]).Select(r => Puzzle.Solves(spec, r.S)).ToList(); }
            case "keepsWinnable": { var spec = As<Game.DreamSpec>(a[0]); return Puzzle.KeepsWinnable(spec, Puzzle.PuzzleGame(spec), As<BlueLoop.Engine.Action>(a[1])); }
            case "mostHeatWithin": return Puzzle.MostHeatWithin(Puzzle.PuzzleGame(As<Game.DreamSpec>(a[0])), (int)a[1]);
        }
        throw new Exception("no such call: " + f);
    }
}
