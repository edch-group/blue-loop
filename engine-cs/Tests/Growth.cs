using System;
using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

/// <summary>
/// The growth recording's cases (scripts/record-growth.ts): each a function of heroes, boons, modules, ascent, relic
/// rolls, the companions, the Captain or progression, called here with the same arguments.
/// </summary>
public static class Growth
{
    static readonly JsonSerializer Ser = JsonSerializer.Create(Json.Settings);

    static T A<T>(JArray args, int i) => args.Count > i && args[i].Type != JTokenType.Null ? args[i].ToObject<T>(Ser) : default;

    static List<AscentNode> Tree(string key) => key == "captain" ? Ascent.CaptainTree : Ascent.CompanionTrees[key];

    static int? Booster(JToken t) => t.Type == JTokenType.String ? (int?)null : (int)t;

    /// <summary>What the C# engine returns for a case, as JSON.</summary>
    public static JToken Run(string fn, JArray a)
    {
        object o = fn switch
        {
            "boons" => Boons.All,
            "moduleKinds" => Modules.ModuleKinds,
            "makeModule" => Modules.MakeModule(A<string>(a, 0), A<string>(a, 1), A<string>(a, 2)),
            "moduleValue" => Modules.ModuleValue(A<ShipModule>(a, 0)),
            "ascentProblem" => Ascent.AscentProblem(Tree(A<string>(a, 0)), A<AscentState>(a, 1), A<string>(a, 2), A<double>(a, 3)),
            "ascend" => Ascent.Ascend(Tree(A<string>(a, 0)), A<AscentState>(a, 1), A<string>(a, 2), A<double>(a, 3)),
            "ascentGifts" => Ascent.AscentGifts(Tree(A<string>(a, 0)), A<AscentState>(a, 1)),
            "ascentSpent" => Ascent.AscentSpent(Tree(A<string>(a, 0)), A<AscentState>(a, 1)),
            "tierPicks" => Ascent.TierPicksTaken(Tree(A<string>(a, 0)), A<AscentState>(a, 1), A<int>(a, 2)),
            "companionFromAscent" => Companions.CompanionFromAscent(A<string>(a, 0), A<AscentState>(a, 1)),
            "allPowers" => Relics.AllPowers,
            "rollPower" => Relics.RollPower(A<string>(a, 0), A<double>(a, 1), A<List<string>>(a, 2)),
            "heroLevel" => Heroes.HeroLevel(A<double>(a, 0)),
            "nextLevelXp" => Heroes.NextLevelXp(A<double>(a, 0)),
            "makeItem" => Heroes.MakeItem(A<string>(a, 0), A<string>(a, 1), A<string>(a, 2), A<int>(a, 3)),
            "slotsFor" => Heroes.SlotsFor(A<int>(a, 0), A<string>(a, 1)),
            "itemBoons" => Heroes.ItemBoons(A<Item>(a, 0)),
            "itemText" => Heroes.ItemText(A<Item>(a, 0)),
            "itemValue" => Heroes.ItemValue(A<Item>(a, 0)),
            "boonsText" => Heroes.BoonsText(A<List<string>>(a, 0)),
            "learnProblem" => Heroes.LearnProblem(A<string>(a, 0), A<HeroState>(a, 1), A<string>(a, 2)),
            "skillPoints" => Heroes.SkillPoints(A<HeroState>(a, 0), A<string>(a, 1)),
            "heroBonus" => Heroes.HeroBonus(A<string>(a, 0), A<HeroState>(a, 1)),
            "makeRelic" => Heroes.MakeRelic(A<string>(a, 0), A<string>(a, 1), A<string>(a, 2), A<int>(a, 3), A<double>(a, 4), A<List<Relic>>(a, 5)),
            "relicText" => Heroes.RelicText(A<Relic>(a, 0)),
            "relicBonus" => Heroes.RelicBonus(A<List<Relic>>(a, 0), A<string>(a, 1)),
            "companionCardId" => Companions.CompanionCardId(A<string>(a, 0), A<Builds.CompanionBuild>(a, 1)),
            "companionBuild" => Companions.CompanionBuild(A<string>(a, 0)),
            "companionOf" => Companions.CompanionOf(A<string>(a, 0)),
            "xpFromActs" => Companions.XpFromActs(A<string>(a, 0), A<Acts>(a, 1)),
            "companionLevel" => Companions.CompanionLevel(A<double>(a, 0)),
            "captainId" => Captain.CaptainId(A<CaptainBuild>(a, 0)),
            "captainBuild" => Captain.CaptainBuild(A<string>(a, 0)),
            "captainSlots" => Captain.CaptainSlots(A<int>(a, 0)),
            "rankOf" => Progression.RankOf(A<double>(a, 0)),
            "rankName" => Progression.RankName(A<double>(a, 0)),
            "stageIndex" => Progression.StageIndex(A<double>(a, 0)),
            "canMatch" => Progression.CanMatch(A<double>(a, 0), A<double>(a, 1)),
            "applyRank" => Progression.ApplyRank(A<double>(a, 0), A<double>(a, 1)),
            "gameReward" => Progression.GameReward(A<string>(a, 0), A<bool>(a, 1), (double?)a[2]["me"], (double?)a[2]["rival"], (bool?)a[2]["conceded"] ?? false),
            "addXp" => Progression.AddXp(A<int>(a, 0), A<int>(a, 1), A<int>(a, 2)),
            "starterGrant" => Progression.StarterGrant(),
            "craftCost" => Progression.CraftCost(A<string>(a, 0)),
            "breakdownValue" => Progression.BreakdownValue(A<string>(a, 0)),
            "breakable" => Progression.Breakable(A<Dictionary<string, int>>(a, 0), A<string>(a, 1)),
            "wantsCopy" => Progression.WantsCopy(A<Dictionary<string, int>>(a, 0), A<string>(a, 1)),
            "ownsDeck" => Progression.OwnsDeck(A<Dictionary<string, int>>(a, 0), A<List<string>>(a, 1)),
            "boosterPool" => Progression.BoosterPool(Booster(a[0])).Select(c => c.Id).ToList(),
            "openBooster" => OpenBooster(Booster(a[0]), A<Dictionary<string, int>>(a, 1), A<int>(a, 2)),
            _ => throw new Exception($"no such case: {fn}"),
        };
        return o == null ? JValue.CreateNull() : JToken.Parse(Json.Write(o));
    }

    class Seeded : IRngState { public int RngState { get; set; } }

    static List<BoosterCard> OpenBooster(int? kind, Dictionary<string, int> coll, int seed)
    {
        var s = new Seeded { RngState = seed };
        return Progression.OpenBooster(kind, coll, () => Rng.Next(s));
    }

    /// <summary>Every case run and compared; the cases that differ (at most `show` of them described), by function.</summary>
    public static (int total, int bad, List<string> shown) Check(JArray cases, int show = 10)
    {
        int bad = 0;
        var shown = new List<string>();
        foreach (var c in cases)
        {
            var fn = (string)c["fn"];
            string d;
            try { d = JsonDiff.First(c["out"], Run(fn, (JArray)c["args"])); }
            catch (Exception e) { d = $"{e.GetType().Name}: {e.Message}"; }
            // (A false or empty result and a missing one compare alike; a bool or number result must match exactly.)
            if (d == null && c["out"].Type == JTokenType.Boolean && !JToken.DeepEquals(c["out"], Run(fn, (JArray)c["args"]))) d = "bool differs";
            if (d != null && bad++ < show) shown.Add($"{fn}({c["args"].ToString(Formatting.None).Substring(0, Math.Min(160, c["args"].ToString(Formatting.None).Length))}): {d}");
        }
        return (cases.Count, bad, shown);
    }
}
