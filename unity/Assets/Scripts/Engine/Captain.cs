using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>What petals have made of the Captain (captain.ts's CaptainBuild).</summary>
    public class CaptainBuild
    {
        /// <summary>Attack added (levels bought).</summary>
        public int Attack;
        /// <summary>Stability levels bought (each CaptainStabilityStep more).</summary>
        public int Stability;
        /// <summary>Energy off its cost (levels bought).</summary>
        public int Cheaper;
        /// <summary>The abilities it carries into battle (at most its slots).</summary>
        public List<string> Abilities = new List<string>();
        /// <summary>How it leads (a lasting effect while in play), if one is chosen.</summary>
        public string Lead;
        /// <summary>Its singularity (Cards.Rules.CaptainSingularities), if not the first.</summary>
        public string Sing;
        /// <summary>Astral Gates passed (Ascent): stronger, an energy dearer, and a new title.</summary>
        public int? Gates;
    }

    /// <summary>
    /// The Captain (captain.ts): the nameless human every run begins with. Its card is built from what petals have
    /// bought: its attack, its stability, its cost, the abilities it carries into battle and how it leads. What was
    /// bought is written into the card's id (`human_captain@attack.stability.cheaper.ability+ability.lead`), so a saved
    /// battle or a replay always reads the very card that fought; the card itself is built by Builds. The abilities,
    /// leads and base are data (builds.json).
    /// </summary>
    public static class Captain
    {
        /// <summary>The plain Captain's id (CAPTAIN).</summary>
        public const string CaptainCard = Builds.CaptainId;
        const char Sep = '@';
        const string StartSingularity = "wall";

        /// <summary>The plain Captain: no attack, a little stability, two energy to play, and one small ability.</summary>
        public static Builds.CaptainBase CaptainBase => Builds.D.Captain.Base;
        public static int CaptainStabilityStep => Builds.D.Captain.StabilityStep;
        public static string CaptainStartAbility => Builds.D.Captain.StartAbility;

        /// <summary>Everything the Captain can learn, cheapest first.</summary>
        public static List<Builds.CaptainAbility> CaptainAbilities => Builds.D.Captain.Abilities;
        public static Builds.CaptainAbility CaptainAbility(string id) => CaptainAbilities.FirstOrDefault(a => a.Id == id);

        /// <summary>Ability slots: one to start, more bought (their prices).</summary>
        public static readonly int[] CaptainSlotPrices = { 2, 3 };
        public static int CaptainSlots(int bought) => 1 + Math.Min(bought, CaptainSlotPrices.Length);

        /// <summary>How the Captain can lead (one at a time): a lasting effect while it is in play.</summary>
        public static List<Builds.CaptainLead> CaptainLeads => Builds.D.Captain.Leads;
        public static Builds.CaptainLead CaptainLead(string id) => CaptainLeads.FirstOrDefault(l => l.Id == id);

        /// <summary>Stat upgrades: the price of each level, in skill points (their count is the most).</summary>
        public static readonly Dictionary<string, int[]> CaptainStatPrices = new Dictionary<string, int[]>
        {
            ["attack"] = new[] { 1, 2, 3 },
            ["stability"] = new[] { 1, 1, 2, 2 },
            ["cheaper"] = new[] { 2, 3 },
        };

        public static CaptainBuild PlainBuild() => new CaptainBuild { Abilities = new List<string> { CaptainStartAbility } };

        /// <summary>The Captain's card id for a build (the plain id for the plain Captain).</summary>
        public static string CaptainId(CaptainBuild b)
        {
            var abilities = b.Abilities.Where(a => CaptainAbility(a) != null).Take(CaptainSlots(CaptainSlotPrices.Length)).ToList();
            var sing = !string.IsNullOrEmpty(b.Sing) && b.Sing != StartSingularity && Cards.Rules.CaptainSingularities.ContainsKey(b.Sing) ? b.Sing : null;
            var gates = Math.Max(0, Math.Min(Ascent.Tiers - 1, b.Gates ?? 0));
            var plain = b.Attack == 0 && b.Stability == 0 && b.Cheaper == 0 && string.IsNullOrEmpty(b.Lead) && sing == null && gates == 0 && abilities.Count == 1 && abilities[0] == CaptainStartAbility;
            if (plain) return CaptainCard;
            var ab = abilities.Count > 0 ? string.Join("+", abilities) : "-";
            return $"{CaptainCard}{Sep}{b.Attack}.{b.Stability}.{b.Cheaper}.{ab}.{b.Lead ?? "-"}{(sing != null || gates != 0 ? $".{sing ?? "-"}" : "")}{(gates != 0 ? $".{gates}" : "")}";
        }

        /// <summary>Whether a card is the Captain (any build of it).</summary>
        public static bool IsCaptain(string id) => Builds.IsCaptain(id);

        /// <summary>The build a Captain's card id was made from (null if it isn't one).</summary>
        public static CaptainBuild CaptainBuild(string id)
        {
            var b = Builds.CaptainBuildOf(id);
            if (b == null) return null;
            return new CaptainBuild { Attack = b.Attack, Stability = b.Stability, Cheaper = b.Cheaper, Gates = b.Gates != 0 ? b.Gates : (int?)null, Abilities = b.Abilities, Lead = b.Lead, Sing = b.Sing };
        }

        /// <summary>The Captain's card for an id (built once, then kept: Builds), or null if the id isn't the Captain's.</summary>
        public static CardDef CaptainDef(string id) => IsCaptain(id) ? Builds.Make(id) : null;
    }
}
