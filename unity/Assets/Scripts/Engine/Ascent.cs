using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>What an upgrade gives: attack, stability levels (+2 each), energy off the cost, an ability slot, or something learnt.</summary>
    public class Gift
    {
        public int? Attack;
        public int? Stability;
        public int? Cheaper;
        public int? Slot;
        /// <summary>The Captain: an ability, a way of leading, a singularity.</summary>
        public string Ability;
        public string Lead;
        public string Sing;
        /// <summary>A companion: a trait (companions.ts).</summary>
        public string Trait;
    }

    public class AscentNode
    {
        public string Id;
        public int Tier;
        /// <summary>What it is called on the tree (an ability's, lead's or trait's own name when it gives one).</summary>
        public string Name;
        public Gift Give;
    }

    /// <summary>What a character's tree has taken: its upgrades, and the gates passed (ascent.ts's Ascent).</summary>
    public class AscentState
    {
        public List<string> Nodes = new List<string>();
        public int Gates;
    }

    /// <summary>What an ascent gives in all (its upgrades', and its gates').</summary>
    public class AscentGifts
    {
        public int Attack, Stability, Cheaper, Slots;
        public List<string> Abilities, Leads, Sings, Traits;
    }

    /// <summary>
    /// The Captain's and the companions' ascent (ascent.ts). Four tiers, each upgrade a skill point, at most
    /// TierPicks taken in a tier; the Astral Gate between two tiers (a point, once the tier below has its picks) opens
    /// the next, giving Gate's buffs and costing an energy more. The trees are data (ascent.json).
    /// </summary>
    public static class Ascent
    {
        public const int Tiers = 4;
        public const int TierPicks = 3;
        /// <summary>What passing an Astral Gate gives: attack, stability levels (each +2), and energy on the cost.</summary>
        public static readonly Builds.GateData Gate = new Builds.GateData { Attack = 1, Stability = 1, Cost = 1 };

        /// <summary>The names a character takes at each tier (the first its own).</summary>
        public static readonly List<string> CaptainTitles = new List<string> { "The Captain", "The Star-Captain", "The Astral Captain", "The Sunforged Captain" };

        class Data
        {
            public List<AscentNode> CaptainTree;
            public Dictionary<string, List<AscentNode>> CompanionTrees;
        }

        /// <summary>The Captain's tree (abilities, leads and singularities named by their own names in the UI).</summary>
        public static List<AscentNode> CaptainTree { get; private set; } = new List<AscentNode>();
        /// <summary>Each companion's tree (traits named by their own names in the UI).</summary>
        public static Dictionary<string, List<AscentNode>> CompanionTrees { get; private set; } = new Dictionary<string, List<AscentNode>>();

        public static void Load(string json)
        {
            var d = Json.Read<Data>(json);
            CaptainTree = d.CaptainTree;
            CompanionTrees = d.CompanionTrees;
        }

        public static AscentState PlainAscent() => new AscentState();

        /// <summary>The upgrades of a tree taken in a tier (tierPicks: TierPicks is the most).</summary>
        public static int TierPicksTaken(List<AscentNode> tree, AscentState a, int tier) => tree.Count(x => x.Tier == tier && a.Nodes.Contains(x.Id));

        /// <summary>Skill points an ascent took in all: one an upgrade, one a gate.</summary>
        public static int AscentSpent(List<AscentNode> tree, AscentState a) => a.Nodes.Count(id => tree.Any(x => x.Id == id)) + a.Gates;

        /// <summary>Why it can't be taken now (null if it can): a node's id, or "gate".</summary>
        public static string AscentProblem(List<AscentNode> tree, AscentState a, string what, double points)
        {
            if (what == "gate")
            {
                if (a.Gates >= Tiers - 1) return "At the highest tier.";
                if (TierPicksTaken(tree, a, a.Gates + 1) < TierPicks) return $"Take {TierPicks} in this tier first.";
            }
            else
            {
                var node = tree.FirstOrDefault(x => x.Id == what);
                if (node == null) return "Unknown.";
                if (a.Nodes.Contains(what)) return "Learnt.";
                if (node.Tier > a.Gates + 1) return "Pass the Astral Gate below first.";
                if (TierPicksTaken(tree, a, node.Tier) >= TierPicks) return $"{TierPicks} taken in this tier.";
            }
            if (points < 1) return "Needs a skill point.";
            return null;
        }

        /// <summary>Take it (a new ascent; unchanged if it can't be had).</summary>
        public static AscentState Ascend(List<AscentNode> tree, AscentState a, string what, double points)
        {
            if (AscentProblem(tree, a, what, points) != null) return a;
            return what == "gate"
                ? new AscentState { Nodes = a.Nodes.ToList(), Gates = a.Gates + 1 }
                : new AscentState { Nodes = a.Nodes.Append(what).ToList(), Gates = a.Gates };
        }

        /// <summary>What an ascent gives in all (its upgrades', and its gates').</summary>
        public static AscentGifts AscentGifts(List<AscentNode> tree, AscentState a)
        {
            var got = tree.Where(x => a.Nodes.Contains(x.Id)).ToList();
            return new AscentGifts
            {
                Attack = got.Sum(x => x.Give.Attack ?? 0),
                Stability = got.Sum(x => x.Give.Stability ?? 0),
                Cheaper = got.Sum(x => x.Give.Cheaper ?? 0),
                Slots = got.Sum(x => x.Give.Slot ?? 0),
                Abilities = got.Where(x => x.Give.Ability != null).Select(x => x.Give.Ability).ToList(),
                Leads = got.Where(x => x.Give.Lead != null).Select(x => x.Give.Lead).ToList(),
                Sings = got.Where(x => x.Give.Sing != null).Select(x => x.Give.Sing).ToList(),
                Traits = got.Where(x => x.Give.Trait != null).Select(x => x.Give.Trait).ToList(),
            };
        }
    }
}
