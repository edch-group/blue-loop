using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>What a finished project gives every army of its faction (in a faction's total, every field is set).</summary>
    public class ResearchEffect
    {
        public BattleModifiers Mods;
        public int? March;
        public int? Mend;
        public double? Loot;
        public int? Sight;
        public int? Dread;
    }

    public class ResearchProject
    {
        public string Id;
        public string Name;
        public string Text;
        /// <summary>Materials, paid when it starts (left from the old research tree).</summary>
        public int Cost;
        /// <summary>Turns it takes (left from the old research tree).</summary>
        public int Turns;
        /// <summary>The tree's four branches: 0 Power, 1 Armour, 2 Command, 3 Navigation.</summary>
        public int Branch;
        /// <summary>Its place up the branch (1 first): each needs the one before it.</summary>
        public int Tier;
        /// <summary>The project that must be done first (the one before it in its branch).</summary>
        public string Needs;
        public string Icon;
        public ResearchEffect Effect;
        /// <summary>A Lost Race's own: offered only in its rift's galaxy, never anywhere else.</summary>
        public int? Race;
        /// <summary>An experiment (what research stations offer now): what it gives, and what it costs, in words.</summary>
        public string Boon;
        public string Bane;
    }

    /// <summary>A faction's research: what is done, and what is under way.</summary>
    public class ResearchState
    {
        public class Underway { public string Id; public int Left; }
        public List<string> Done = new List<string>();
        public Underway Current;
    }

    /// <summary>
    /// Research (research.ts): upgrades a faction's flagship carries for good. Each research station offers a few; the
    /// first flagship to use it picks one, free. Stations now offer experiments, each a big upside with a big downside.
    /// </summary>
    public static class Research
    {
        public class Data
        {
            public List<ResearchProject> Projects;
            public List<string> Branches;
            public List<string> Retired;
        }

        static Dictionary<string, ResearchProject> byId = new Dictionary<string, ResearchProject>();

        public static void Load(Data d)
        {
            All = d.Projects;
            ResearchBranches = d.Branches;
            RetiredResearch = new HashSet<string>(d.Retired);
            Experiments = All.Where(p => p.Boon != null).ToList();
            byId = new Dictionary<string, ResearchProject>();
            foreach (var p in All) if (!byId.ContainsKey(p.Id)) byId[p.Id] = p;
        }

        /// <summary>Every project: the tree's branches in order, the Lost Races' own, then the experiments. (RESEARCH.)</summary>
        public static List<ResearchProject> All { get; private set; }
        public static List<string> ResearchBranches { get; private set; }
        /// <summary>What research stations offer now: each a boon and a bane at once, for the rest of the run.</summary>
        public static List<ResearchProject> Experiments { get; private set; }
        /// <summary>Projects no station offers any more (a save that carries one keeps it, harmlessly).</summary>
        public static HashSet<string> RetiredResearch { get; private set; }

        public static bool IsExperiment(string id) => Experiments.Any(x => x.Id == id);
        public static ResearchProject ResearchProject(string id) => id != null && byId.TryGetValue(id, out var p) ? p : null;

        /// <summary>Whether a faction's upgrade is outdone by a higher one of the same kind it also holds.</summary>
        public static bool SupersededResearch(List<string> done, string id)
        {
            var p = ResearchProject(id);
            // (Retired upgrades add up as they always did; experiments stand on their own.)
            if (p == null || RetiredResearch.Contains(id) || p.Race != null || !string.IsNullOrEmpty(p.Boon)) return false;
            return done.Any(o =>
            {
                var q = ResearchProject(o);
                return o != id && q != null && q.Race == null && string.IsNullOrEmpty(q.Boon) && q.Icon == p.Icon && q.Tier > p.Tier;
            });
        }

        static readonly System.Reflection.FieldInfo[] ModFields = typeof(BattleModifiers).GetFields();

        /// <summary>Everything a faction's research gives each of its armies.</summary>
        public static ResearchEffect ResearchBonus(ResearchState r)
        {
            var outs = new ResearchEffect { Mods = new BattleModifiers(), March = 0, Mend = 0, Loot = 0, Sight = 0, Dread = 0 };
            // (Each upgrade states its total: of two of a kind, the higher stands in place of the lower, not on top of it.)
            foreach (var id in r?.Done ?? new List<string>())
            {
                if (SupersededResearch(r.Done, id)) continue;
                var e = ResearchProject(id)?.Effect;
                if (e == null) continue;
                if (e.Mods != null)
                    foreach (var f in ModFields)
                    {
                        var v = (int?)f.GetValue(e.Mods);
                        if (v != null) f.SetValue(outs.Mods, ((int?)f.GetValue(outs.Mods) ?? 0) + v.Value);
                    }
                outs.March += e.March ?? 0;
                outs.Mend += e.Mend ?? 0;
                outs.Loot += e.Loot ?? 0;
                outs.Sight += e.Sight ?? 0;
                outs.Dread += e.Dread ?? 0;
            }
            return outs;
        }
    }
}
