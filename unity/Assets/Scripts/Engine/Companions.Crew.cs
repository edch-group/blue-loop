using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>A companion and the build its card id was made from (companionBuild).</summary>
    public class CompanionCardBuild
    {
        public string Id;
        public Builds.CompanionBuild Build;
    }

    /// <summary>A companion's level for its experience, the experience into it and what the next needs.</summary>
    public class CompanionLevelInfo
    {
        public int Level, Into, Need;
    }

    /// <summary>
    /// The Captain's companions (companions.ts): permanent characters, earnt over time and in different ways, each a
    /// playable card with a skill tree and experience of its own, earnt from what it does in battle. A companion's card
    /// is built from its tree as the Captain's is: what was learnt is written into the id
    /// (`companion_lancer@attack.stability.cheaper.trait+trait`), and Builds builds it. The companions are data (builds.json).
    /// </summary>
    public static partial class Companions
    {
        public static readonly List<string> CompanionIds = new List<string> { "lancer", "engineer", "defector", "shade", "seer" };
        /// <summary>The companions who fly with the Captain on a run, at most.</summary>
        public const int ActiveCrew = 3;
        /// <summary>How many beaten heroes must be spared for the defector to come.</summary>
        public const int DefectorSpared = 2;
        /// <summary>Ship parts fitted for the engineer to be found at a station.</summary>
        public const int EngineerParts = 3;

        /// <summary>No acts yet (Acts, in Types.cs: what a companion learns from in a battle).</summary>
        public static Acts NoActs() => new Acts();

        public static List<Builds.CompanionDef> All => Builds.D.Companions;
        public static Builds.CompanionDef CompanionDef(string id) => All.First(c => c.Id == id);

        public static Builds.CompanionBuild PlainCompanion(string id) => new Builds.CompanionBuild { Traits = new List<string> { CompanionDef(id).Start } };

        /// <summary>The build an ascent makes: its upgrades' gifts, its traits after its first, its gates.</summary>
        public static Builds.CompanionBuild CompanionFromAscent(string id, AscentState a)
        {
            var g = Ascent.AscentGifts(Ascent.CompanionTrees[id], a);
            return new Builds.CompanionBuild
            {
                Attack = g.Attack,
                Stability = g.Stability,
                Cheaper = g.Cheaper,
                Traits = new[] { CompanionDef(id).Start }.Concat(g.Traits).ToList(),
                Gates = Math.Min(Ascent.Tiers - 1, a.Gates),
            };
        }

        /// <summary>The companion a card is (any build of it), or null.</summary>
        public static string CompanionOf(string defId) => All.FirstOrDefault(c => c.Card == defId.Split('@')[0])?.Id;

        /// <summary>A companion's card id for a build (the plain id for the plain build).</summary>
        public static string CompanionCardId(string id, Builds.CompanionBuild b)
        {
            var c = CompanionDef(id);
            var traits = c.Traits.Where(x => b.Traits.Contains(x.Id)).Select(x => x.Id).ToList();
            var plain = b.Attack == 0 && b.Stability == 0 && b.Cheaper == 0 && b.Gates == 0 && traits.Count == 1 && traits[0] == c.Start;
            return plain ? c.Card : $"{c.Card}@{b.Attack}.{b.Stability}.{b.Cheaper}.{(traits.Count > 0 ? string.Join("+", traits) : "-")}{(b.Gates != 0 ? $".{b.Gates}" : "")}";
        }

        /// <summary>The build a companion's card id was made from (null if it isn't one).</summary>
        public static CompanionCardBuild CompanionBuild(string defId)
        {
            var b = Builds.CompanionBuildOf(defId, out var c);
            return b == null ? null : new CompanionCardBuild { Id = c.Id, Build = b };
        }

        /// <summary>A companion's card for an id (built once, then kept: Builds), or null if the id isn't a companion's.</summary>
        public static CardDef CompanionCard(string defId) => CompanionOf(defId) != null ? Builds.Make(defId) : null;

        static double W(Dictionary<string, double> w, string k) => w != null && w.TryGetValue(k, out var v) ? v : 0;

        /// <summary>The experience a companion takes from a battle's acts.</summary>
        public static int XpFromActs(string id, Acts a)
        {
            var w = CompanionDef(id).Learns;
            return (int)Math.Floor(W(w, "damage") * a.Damage + W(w, "support") * a.Support + W(w, "kills") * a.Kills + W(w, "sun") * a.Sun + W(w, "dawns") * a.Dawns);
        }

        /// <summary>The experience to rise from a level to the next.</summary>
        public static int CompanionXpToNext(int level) => 10 + 6 * level;

        /// <summary>A companion's level for the experience it has, the experience into it and what the next needs.</summary>
        public static CompanionLevelInfo CompanionLevel(double xp)
        {
            int level = 1;
            var left = (int)Math.Max(0, Math.Floor(xp));
            while (left >= CompanionXpToNext(level))
            {
                left -= CompanionXpToNext(level);
                level++;
            }
            return new CompanionLevelInfo { Level = level, Into = left, Need = CompanionXpToNext(level) };
        }
    }
}
