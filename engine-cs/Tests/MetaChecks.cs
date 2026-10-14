using System;
using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

/// <summary>
/// The meta recording's cases (scripts/record-meta.ts): each a function of meta.ts (the loop's lasting progress),
/// called here with the same arguments.
/// </summary>
public static class MetaChecks
{
    static readonly JsonSerializer Ser = JsonSerializer.Create(Json.Settings);

    static T A<T>(JArray args, int i) => args.Count > i && args[i].Type != JTokenType.Null ? args[i].ToObject<T>(Ser) : default;
    static MetaState S(JArray a) => A<MetaState>(a, 0);
    static MetaUpgrade U(JArray a) => Meta.MetaUpgrade(A<string>(a, 0));

    /// <summary>A call that may throw: what it returned, or the error (as the recording keeps it).</summary>
    static object Try(Func<object> f)
    {
        try { return f(); }
        catch (InvalidOperationException e) { return new { error = e.Message }; }
    }

    /// <summary>What the C# engine returns for a case, as JSON.</summary>
    public static JToken Run(string fn, JArray a)
    {
        object o = fn switch
        {
            "metaUpgrades" => Meta.MetaUpgrades,
            "starterOffers" => Meta.StarterOffers,
            "treePetals" => Meta.TreePetals,
            "kinshipBoost" => Meta.KinshipBoost,
            "fellowshipBoost" => Meta.FellowshipBoost,
            "affinitySkill" => Meta.AffinitySkill,
            "startingRaces" => Meta.StartingRaces,
            "heroUnlockStars" => Meta.HeroUnlockStars,
            "skillResetPetals" => Meta.SkillResetPetals,
            "emptyMeta" => Meta.EmptyMeta(),
            "plainCaptain" => Meta.PlainCaptain(),
            "metaUpgrade" => U(a),
            "currencyOf" => Meta.CurrencyOf(U(a)),
            "pointCost" => Meta.PointCost(U(a)),
            "cost" => U(a).Cost(A<int>(a, 1)),
            "priceOf" => Meta.PriceOf(U(a), A<int>(a, 1)),
            "commanderXpToNext" => Meta.CommanderXpToNext(A<int>(a, 0)),
            "xpForLevel" => Meta.XpForLevel(A<int>(a, 0)),
            "levelFor" => Meta.LevelFor(A<double>(a, 0)),
            "starterCardPrice" => Meta.StarterCardPrice(A<string>(a, 0)),
            "heroUnlockNeed" => Meta.HeroUnlockNeed(A<string>(a, 0)),
            "treePetalsSpent" => Meta.TreePetalsSpent(S(a)),
            "pointsSpent" => Meta.PointsSpent(S(a)),
            "pointsLeft" => Meta.PointsLeft(S(a)),
            "companionsFound" => Meta.CompanionsFound(S(a)),
            "activeCrew" => Meta.ActiveCrew(S(a)),
            "companionCards" => Meta.CompanionCards(S(a)),
            "companionSpent" => Meta.CompanionSpent(S(a), A<string>(a, 1)),
            "companionTree" => Meta.CompanionTree(S(a), A<string>(a, 1)),
            "companionPoints" => Meta.CompanionPoints(S(a), A<string>(a, 1)),
            "companionProblem" => Meta.CompanionProblem(S(a), A<string>(a, 1), A<string>(a, 2)),
            "buyCompanion" => Meta.BuyCompanion(S(a), A<string>(a, 1), A<string>(a, 2)),
            "setCrewAboard" => Meta.SetCrewAboard(S(a), A<string>(a, 1), A<bool>(a, 2)),
            "bankCompanions" => Meta.BankCompanions(S(a), A<List<string>>(a, 1), A<Dictionary<string, double>>(a, 2), A<int>(a, 3), A<int>(a, 4)),
            "sectionOpen" => Meta.SectionOpen(S(a), A<string>(a, 1)),
            "openSections" => Meta.OpenSections(S(a)),
            "fitPart" => Meta.FitPart(S(a), A<string>(a, 1), A<string>(a, 2)),
            "stowParts" => Meta.StowParts(S(a), A<List<string>>(a, 1)),
            "setAffinity" => Meta.SetAffinity(S(a), A<string>(a, 1), A<int?>(a, 2)),
            "captainMeta" => Meta.CaptainMeta(S(a)),
            "captainGifts" => Meta.CaptainGifts(S(a)),
            "captainCard" => Meta.CaptainCard(S(a)),
            "captainPointsSpent" => Meta.CaptainPointsSpent(S(a)),
            "captainBuyProblem" => Meta.CaptainBuyProblem(S(a), A<CaptainBuy>(a, 1)),
            "buyCaptain" => Try(() => Meta.BuyCaptain(S(a), A<CaptainBuy>(a, 1))),
            "equipCaptainAbility" => Meta.EquipCaptainAbility(S(a), A<string>(a, 1)),
            "setCaptainLead" => Meta.SetCaptainLead(S(a), A<string>(a, 1)),
            "setCaptainSingularity" => Meta.SetCaptainSingularity(S(a), A<string>(a, 1)),
            "migrateMeta" => Meta.MigrateMeta(S(a)),
            "levelOf" => Meta.LevelOf(S(a), A<string>(a, 1)),
            "buyUpgradeProblem" => Meta.BuyUpgradeProblem(S(a), A<string>(a, 1)),
            "upgradeOpen" => Meta.UpgradeOpen(S(a), A<string>(a, 1)),
            "buyUpgrade" => Try(() => Meta.BuyUpgrade(S(a), A<string>(a, 1))),
            "refundUpgrade" => Meta.RefundUpgrade(S(a), A<string>(a, 1)),
            "resetSkillsProblem" => Meta.ResetSkillsProblem(S(a)),
            "resetSkills" => Try(() => Meta.ResetSkills(S(a))),
            "resetCaptainProblem" => Meta.ResetCaptainProblem(S(a)),
            "resetCaptain" => Try(() => Meta.ResetCaptain(S(a))),
            "raceUnlocked" => Meta.RaceUnlocked(S(a), A<int>(a, 1)),
            "raceConquests" => Meta.RaceConquests(S(a), A<int>(a, 1)),
            "heroUnlocked" => Meta.HeroUnlocked(S(a), A<string>(a, 1)),
            "starterOwned" => Meta.StarterOwned(S(a), A<int>(a, 1), A<string>(a, 2)),
            "starterAddPrice" => Meta.StarterAddPrice(S(a), A<int>(a, 1), A<string>(a, 2), A<string>(a, 3)),
            "starterAddProblem" => Meta.StarterAddProblem(S(a), A<int>(a, 1), A<string>(a, 2), A<string>(a, 3)),
            "buyStarterCard" => Try(() => Meta.BuyStarterCard(S(a), A<int>(a, 1), A<string>(a, 2), A<string>(a, 3))),
            "removeStarterCard" => Meta.RemoveStarterCard(S(a), A<int>(a, 1), A<int>(a, 2)),
            "runBonuses" => Meta.RunBonuses(S(a), A<int?>(a, 1)),
            _ => throw new Exception($"no such case: {fn}"),
        };
        return o == null ? JValue.CreateNull() : JToken.Parse(Json.Write(o));
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
            JToken got = null;
            try { got = Run(fn, (JArray)c["args"]); d = JsonDiff.First(c["out"], got); }
            catch (Exception e) { d = $"{e.GetType().Name}: {e.Message}"; }
            // (A false or empty result and a missing one compare alike; a bool or number result must match exactly.)
            if (d == null && c["out"].Type == JTokenType.Boolean && !JToken.DeepEquals(c["out"], got)) d = "bool differs";
            if (d != null && bad++ < show)
            {
                var args = c["args"].ToString(Formatting.None);
                shown.Add($"{fn}({args.Substring(0, Math.Min(300, args.Length))}): {d}");
            }
        }
        return (cases.Count, bad, shown);
    }
}
