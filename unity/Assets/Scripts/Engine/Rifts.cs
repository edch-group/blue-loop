using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>A rift's galaxy: the Lost Race that rules it, its name, its ruler (a Hero card) and how it reads.</summary>
    public class Rift
    {
        public int Race;
        public string Name;
        public string Ruler;
        public string Text;
    }

    /// <summary>
    /// Rifts (rifts.ts): tears off the route, each into a short, extremely hard galaxy ruled by one of the Lost Races,
    /// and the Dark Prophet's marks, a Nyxari keyword set on a card for good (the marked cards themselves: Builds).
    /// </summary>
    public static class Rifts
    {
        public class Data
        {
            public Dictionary<string, Rift> Rifts;
            public List<string> Kinds;
            public int Jumps;
        }

        public static Data D;

        /// <summary>The rifts by kind ("dark", "time"). (RIFTS, named apart from its class.)</summary>
        public static Dictionary<string, Rift> ByKind => D.Rifts;
        /// <summary>The rifts there are so far.</summary>
        public static List<string> RiftKinds => D.Kinds;
        /// <summary>How many jumps a rift's galaxy is, from where it is entered to its ruler.</summary>
        public static int RiftJumps => D.Jumps;

        public static Dictionary<string, Builds.MarkDef> NyxMarks => Builds.D.NyxMarks;
        public static string MarkedId(string mark, string id) => Builds.MarkedId(mark, id);
        public static bool IsMarked(string id) => Builds.IsMarked(id);
        /// <summary>A marked card's mark and the card it marks (null if it isn't one).</summary>
        public static (string mark, string baseId)? MarkOf(string id) => Builds.MarkOf(id);
        /// <summary>A marked card: its own, with the mark's keyword set first in its text and its work added (null if not one).</summary>
        public static CardDef MarkedDef(string id) => MarkOf(id) == null ? null : Builds.Make(id);

        /// <summary>Whether a card stays in play once played (not one that does its work and is gone).</summary>
        static bool Stays(CardDef d) =>
            d.Kind != "trap" && d.Kind != "relic" && d.Kind != "global"
            && ((d.OnTurn?.Count ?? 0) > 0 || (d.Passive?.Count ?? 0) > 0 || (d.Attack ?? 0) > 0 || (d.Defence ?? 0) > 0 || d.Kind == "command" || (d.Health ?? 0) != 0);

        /// <summary>The marks a card can take (none it has already; Darkspeed only on a card that attacks).</summary>
        public static List<string> MarksFor(CardDef d)
        {
            var outs = new List<string>();
            if (IsMarked(d.Id) || d.Kind == "trap" || d.Kind == "relic" || d.Kind == "global") return outs;
            var text = d.Text ?? "";
            if ((d.Attack ?? 0) > 0 && d.Darkspeed != true && !text.Contains("{darkspeed}")) outs.Add("darkspeed");
            if (!(d.OnPlay ?? new List<Effect>()).Any(e => e.Type == "destroy")) outs.Add("unmake");
            outs.Add("veil");
            if (Stays(d)) outs.Add("nightfall");
            if (Stays(d) && !text.Contains("{sting")) outs.Add("sting");
            return outs;
        }
    }
}
