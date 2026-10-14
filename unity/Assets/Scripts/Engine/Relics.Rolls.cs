using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>Which powers a relic can carry, and the roll that picks one (relics.ts).</summary>
    public static partial class Relics
    {
        static List<string> S(params string[] p) => p.ToList();

        /// <summary>The powers a relic of each kind can carry (its slot's flavour: a weapon strikes, a core cools...).</summary>
        public static readonly Dictionary<string, List<string>> SlotPowers = new Dictionary<string, List<string>>
        {
            ["weapon"] = S("edge", "splash", "flurry", "starfall", "leech", "ram", "might", "multishot"),
            ["helm"] = S("walls", "vigour", "herald", "anchor", "ward"),
            ["mantle"] = S("aegis", "renew", "walls", "fortress", "ward"),
            ["sigil"] = S("herald", "firstLight", "overcharge", "harvest", "grasp", "might", "bargain", "echo"),
            ["core"] = S("frost", "coolant", "bounty", "phoenix", "freeze"),
            ["facet"] = S("splash", "nova", "bounty", "sear", "multishot"),
            ["ring"] = S("mend", "vigour", "aegis", "thorns", "steady"),
            ["carapace"] = S("walls", "vigour", "renew", "thorns", "ram", "steady"),
            ["gland"] = S("gift", "recycle", "renew", "reclaim", "steady", "bargain"),
            ["mask"] = S("flurry", "recall", "bounty", "devour", "freeze", "displace"),
            ["plate"] = S("walls", "aegis", "mend", "anchor", "ward"),
            ["star"] = S("shift", "firstLight", "gift", "duskShift", "grasp", "displace", "echo"),
            ["ember"] = S("nova", "recycle", "starfall", "sear", "multishot"),
        };

        /// <summary>The Seren's emblems: Aster's to grant, never found any other way.</summary>
        public static readonly List<string> SerenPowers = S("paradise", "orbitShift", "starsworn");

        /// <summary>Every power a roll can fall on (all but the Seren's emblems), in RELIC_POWERS's order.</summary>
        /// <remarks>(A property: Powers is another part's field, and parts' initializers run in no set order.)</remarks>
        public static List<string> AllPowers => allPowers ?? (allPowers = Powers.Keys.Where(p => !SerenPowers.Contains(p)).ToList());
        static List<string> allPowers;

        /// <summary>
        /// The power a relic of a kind carries, by its roll (0–1): never one already held, while any other is left
        /// (its kind's own if it can, else any).
        /// </summary>
        public static string RollPower(string slot, double roll, ICollection<string> held = null)
        {
            held = held ?? new HashSet<string>();
            var own = SlotPowers[slot].Where(p => !held.Contains(p)).ToList();
            var all = AllPowers.Where(p => !held.Contains(p)).ToList();
            string Pick(List<string> list, double r) => list[(int)(Math.Floor(r * list.Count) % list.Count)];
            if (all.Count == 0) return Pick(SlotPowers[slot], roll);
            if (own.Count == 0) return Pick(all, roll);
            return roll < 0.5 ? Pick(own, roll / 0.5) : Pick(all, (roll - 0.5) / 0.5);
        }

        /// <summary>relicN: how much of a power a side has (see N).</summary>
        public static int RelicN(List<RelicInPlay> relics, string power) => N(relics, power);

        /// <summary>relicOf: the first relic of a power a side carries (see Of).</summary>
        public static RelicInPlay RelicOf(List<RelicInPlay> relics, string power) => Of(relics, power);
    }
}
