using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>A rank as rank points: every stage is StagePoints points, from 0 (Olivine I) up.</summary>
    public class Rank
    {
        public int Tier;
        /// <summary>0–2: stage I, II or III of the tier.</summary>
        public int Stage;
        /// <summary>Points towards the next stage (0–99).</summary>
        public int Points;
    }

    /// <summary>What a game earns a player.</summary>
    public class Reward
    {
        public int Stardust;
        public int Flux;
        public int Xp;
        /// <summary>Ranked: rank points gained (negative: lost).</summary>
        public int? Rank;
    }

    /// <summary>A level after experience is added (addXp).</summary>
    public class LevelUp
    {
        public int Level;
        public int Xp;
        public int LevelsGained;
    }

    public class BoosterCard
    {
        public string Id;
        /// <summary>The first copy you own.</summary>
        public bool? IsNew;
        /// <summary>Already owned as many as a deck can use: it comes as flux instead.</summary>
        public int? Flux;
    }

    /// <summary>
    /// Progression outside a single game (progression.ts): a player's level, two currencies, their card collection, and
    /// (online) their rank. Pure rules only. Stardust buys booster packs; Flux crafts cards (breaking one down returns
    /// half its cost); experience raises your level; rank is six tiers of rare matter, three stages each. (PROGRESSION's
    /// numbers are this class's constants.) Collections are card id → copies owned.
    /// </summary>
    public static class Progression
    {
        /// <summary>Rewards for a game, by kind ("ai", "online", "ranked") and result.</summary>
        public static readonly Dictionary<string, (Reward win, Reward loss)> Rewards = new Dictionary<string, (Reward, Reward)>
        {
            ["ai"] = (new Reward { Stardust = 20, Flux = 5, Xp = 40 }, new Reward { Stardust = 8, Flux = 2, Xp = 20 }),
            ["online"] = (new Reward { Stardust = 60, Flux = 15, Xp = 100 }, new Reward { Stardust = 25, Flux = 6, Xp = 50 }),
            ["ranked"] = (new Reward { Stardust = 120, Flux = 30, Xp = 160 }, new Reward { Stardust = 50, Flux = 12, Xp = 80 }),
        };
        /// <summary>Ranked: how much each stage of difference changes a win's or a loss's currency and experience.</summary>
        public const double WinPerStage = 0.2, LossPerStage = 0.3;
        /// <summary>Ranked: rank points for a win and a loss against an equal, and how much each stage of difference changes them.</summary>
        public const int RankWinPoints = 25, RankLossPoints = 20;
        public const double RankPerStage = 0.15;
        /// <summary>Rank points to climb a stage.</summary>
        public const int StagePoints = 100;
        /// <summary>Experience for the next level: base + step × (level − 1).</summary>
        public const int LevelBase = 100, LevelStep = 25;
        public static readonly Reward LevelReward = new Reward { Stardust = 50, Flux = 10 };
        /// <summary>A booster pack's price in stardust, and how many cards it holds.</summary>
        public const int BoosterPrice = 100, BoosterSize = 5;
        /// <summary>Flux to craft a card, by rarity. Breaking one down returns BreakdownShare of it.</summary>
        public static readonly Dictionary<string, int> Craft = new Dictionary<string, int> { ["dwarf"] = 40, ["stellar"] = 100, ["anomaly"] = 400 };
        public const double BreakdownShare = 0.5;

        static int Round(double x) => (int)Math.Floor(x + 0.5);

        // ---- Ranks ----

        /// <summary>The rank tiers, lowest first: rare matter found in space.</summary>
        public static readonly string[] RankTiers = { "Olivine", "Cobalt", "Iridium", "Lonsdaleite", "Neutronium", "Strange Matter" };
        public const int StagesPerTier = 3;
        static int TopStage => RankTiers.Length * StagesPerTier - 1;

        public static Rank RankOf(double rankPoints)
        {
            var rp = Math.Max(0, Round(rankPoints));
            var index = Math.Min(TopStage, rp / StagePoints);
            return new Rank { Tier = index / StagesPerTier, Stage = index % StagesPerTier, Points = index == TopStage ? rp - TopStage * StagePoints : rp % StagePoints };
        }

        /// <summary>The stage index (0 = Olivine I … 17 = Strange Matter III).</summary>
        public static int StageIndex(double rankPoints)
        {
            var r = RankOf(rankPoints);
            return r.Tier * StagesPerTier + r.Stage;
        }

        public static string RankName(double rankPoints)
        {
            var r = RankOf(rankPoints);
            return $"{RankTiers[r.Tier]} {new[] { "I", "II", "III" }[r.Stage]}";
        }

        /// <summary>Whether two players may meet in a ranked game: at most one tier apart.</summary>
        public static bool CanMatch(double a, double b) => Math.Abs(RankOf(a).Tier - RankOf(b).Tier) <= 1;

        /// <summary>The bottom of the ladder: the lowest stage, with no points.</summary>
        public static bool AtFloor(double rankPoints) => StageIndex(rankPoints) == 0;

        // ---- Rewards ----

        /// <summary>
        /// What a game earns a player. Ranked games weigh the rank gap: beating a higher-ranked player is worth more (and
        /// climbs further), beating a lower one less; losing to a higher-ranked player costs less, losing to a lower one
        /// more (and losing to a player at the very bottom of the ladder earns nothing). Conceding earns half the
        /// experience, and no currency.
        /// </summary>
        public static Reward GameReward(string kind, bool won, double? me = null, double? rival = null, bool conceded = false)
        {
            var b = won ? Rewards[kind].win : Rewards[kind].loss;
            if (conceded) return new Reward { Stardust = 0, Flux = 0, Xp = Round(b.Xp / 2.0), Rank = kind == "ranked" ? -RankLoss(me ?? 0, rival ?? 0) : (int?)null };
            if (kind != "ranked") return new Reward { Stardust = b.Stardust, Flux = b.Flux, Xp = b.Xp };
            double m = me ?? 0, r = rival ?? 0;
            // Stages the rival sits above you (negative: below).
            var gap = StageIndex(r) - StageIndex(m);
            double mult;
            if (won) mult = Math.Max(0.4, 1 + WinPerStage * gap);
            else if (gap < 0 && AtFloor(r)) mult = 0;
            else mult = Math.Max(0, Math.Min(1.6, 1 + LossPerStage * gap));
            int Scale(int n) => Round(n * mult);
            return new Reward { Stardust = Scale(b.Stardust), Flux = Scale(b.Flux), Xp = Scale(b.Xp), Rank = won ? RankWin(m, r) : -RankLoss(m, r) };
        }

        static int RankWin(double me, double rival)
        {
            var gap = StageIndex(rival) - StageIndex(me);
            return Round(Math.Min(45, Math.Max(8, RankWinPoints * (1 + RankPerStage * gap))));
        }

        static int RankLoss(double me, double rival)
        {
            var gap = StageIndex(rival) - StageIndex(me);
            return Round(Math.Min(40, Math.Max(6, RankLossPoints * (1 - RankPerStage * gap))));
        }

        /// <summary>Rank points after a ranked game (never below the bottom of the ladder).</summary>
        public static double ApplyRank(double rankPoints, double change) => Math.Max(0, rankPoints + change);

        // ---- Levels ----

        /// <summary>Experience needed to go from a level to the next.</summary>
        public static int XpToNext(int level) => LevelBase + LevelStep * (level - 1);

        /// <summary>Add experience: the new level and leftover experience, and how many levels were gained.</summary>
        public static LevelUp AddXp(int level, int xp, int gain)
        {
            int l = level, x = xp + gain, gained = 0;
            while (x >= XpToNext(l))
            {
                x -= XpToNext(l);
                l += 1;
                gained += 1;
            }
            return new LevelUp { Level = l, Xp = x, LevelsGained = gained };
        }

        // ---- The collection ----

        static string RarityOf(string id) => Cards.Def(id).Rarity ?? "dwarf";
        static int CopyLimit(string id)
        {
            var r = RarityOf(id);
            return r == "anomaly" || r == "enigma" ? Balance.MaxAnomalyCopies : Balance.MaxCopies;
        }
        static int Get(Dictionary<string, int> c, string id) => c.TryGetValue(id, out var n) ? n : 0;

        /// <summary>
        /// The copies every player has: every card in the game, as many as a deck can hold (two of each, one of an
        /// Anomaly). Every card is unlocked from the start; boosters and crafting only ever add flux now.
        /// </summary>
        public static Dictionary<string, int> StarterGrant()
        {
            var grant = new Dictionary<string, int>();
            foreach (var c in Cards.Pool) if (c.Token != true) grant[c.Id] = CopyLimit(c.Id);
            // (And whatever the starter decks hold, should one ever run a card outside the pool.)
            foreach (var d in CardData.Decks)
            {
                var counts = new Dictionary<string, int>();
                foreach (var id in d.Cards) counts[id] = Get(counts, id) + 1;
                foreach (var kv in counts) grant[kv.Key] = Math.Max(Get(grant, kv.Key), kv.Value);
            }
            return grant;
        }

        public static int CraftCost(string id) => Craft[RarityOf(id)];

        public static int BreakdownValue(string id) => Round(CraftCost(id) * BreakdownShare);

        /// <summary>Copies of a card that can be broken down: those beyond the starter grant (starter cards are kept).</summary>
        public static int Breakable(Dictionary<string, int> collection, string id) => Math.Max(0, Get(collection, id) - Get(StarterGrant(), id));

        /// <summary>Whether another copy of a card would still be any use in a deck.</summary>
        public static bool WantsCopy(Dictionary<string, int> collection, string id) => Get(collection, id) < CopyLimit(id);

        /// <summary>Whether a deck can be built from a collection (every copy owned).</summary>
        public static bool OwnsDeck(Dictionary<string, int> collection, List<string> cards) =>
            cards.GroupBy(id => id).All(g => Get(collection, g.Key) >= g.Count());

        // ---- Booster packs ----

        /// <summary>One booster per race (its cards), and a general booster (every card of no race: null here).</summary>
        public static readonly List<int?> Boosters = new List<int?> { 0, 1, 2, 3, 4, 5, 6, 7, null };

        /// <summary>The cards a booster can hold (race null: the general booster).</summary>
        public static List<CardDef> BoosterPool(int? kind) => Cards.Pool.Where(c => c.Race == kind).ToList();

        /// <summary>
        /// Open a booster: five cards from its pool. Most are White Dwarfs; the fourth may be Stellar, and the fifth is
        /// Stellar or (sometimes) an Anomaly. A card you already own as many of as a deck can use turns into flux.
        /// </summary>
        public static List<BoosterCard> OpenBooster(int? kind, Dictionary<string, int> collection, Func<double> random)
        {
            var pool = BoosterPool(kind);
            List<CardDef> Of(string r) => pool.Where(c => RarityOf(c.Id) == r).ToList();
            CardDef Pick(string r)
            {
                var list = Of(r).Count > 0 ? Of(r) : Of("dwarf").Count > 0 ? Of("dwarf") : pool;
                return list[(int)Math.Floor(random() * list.Count)];
            }
            var rarities = new List<string>();
            for (int i = 0; i < BoosterSize; i++)
            {
                if (i < BoosterSize - 2) rarities.Add("dwarf");
                else if (i == BoosterSize - 2) rarities.Add(random() < 0.3 ? "stellar" : "dwarf");
                else rarities.Add(random() < 0.18 ? "anomaly" : "stellar");
            }
            var owned = new Dictionary<string, int>(collection);
            return rarities.Select(r =>
            {
                var c = Pick(r);
                if (!WantsCopy(owned, c.Id)) return new BoosterCard { Id = c.Id, Flux = BreakdownValue(c.Id) };
                var isNew = Get(owned, c.Id) == 0;
                owned[c.Id] = Get(owned, c.Id) + 1;
                return isNew ? new BoosterCard { Id = c.Id, IsNew = true } : new BoosterCard { Id = c.Id };
            }).ToList();
        }
    }
}
