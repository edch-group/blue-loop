using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    public class RelicAbility
    {
        public string Name;
        public string Text;
        public AbilityChoices Choice;
    }

    /// <summary>A relic power (relics.ts RELIC_POWERS): its kind, words, and what it does as its holder calls on it.</summary>
    public class RelicPowerDef
    {
        public string Kind;
        public int[] Amounts;
        public System.Func<int, string> Text;
        public System.Func<int, List<Effect>> Effects;
        public System.Func<int, AbilityChoices> Choices;
        public System.Func<int, RelicAbility> Ability;
    }

    public static partial class Relics
    {
        static RelicPowerDef P(string kind, int a, int b, int c, System.Func<int, string> text) => new RelicPowerDef { Kind = kind, Amounts = new[] { a, b, c }, Text = text };
        static List<Effect> L(params Effect[] e) => e.ToList();
        static RelicAbility Ab(string name, string text, string kind, int times, int? amount = null) => new RelicAbility { Name = name, Text = text, Choice = new AbilityChoices { Kind = kind, Times = times, Amount = amount } };

        public static readonly Dictionary<string, RelicPowerDef> Powers = new Dictionary<string, RelicPowerDef>
        {
            ["aegis"] = P("passive", 2, 3, 4, n => $"Dawn: gain {n} shields."),
            ["walls"] = P("passive", 1, 2, 3, n => $"+{n} defence (all slots)."),
            ["edge"] = P("passive", 1, 2, 3, n => $"+{n} attack."),
            ["frost"] = P("passive", 1, 2, 3, n => $"+{n} cooling."),
            ["vigour"] = P("trigger", 1, 2, 3, n => $"+{n} stability."),
            ["herald"] = P("passive", 1, 1, 1, n => "Hero starts on your board."),
            ["firstLight"] = P("passive", 2, 3, 4, n => $"Draw {n} additional cards on day 1."),
            ["flurry"] = P("trigger", 1, 2, 3, n => $"When you attack with 3 cards in one turn, deal {n} heat to any target."),
            ["splash"] = P("trigger", 1, 1, 2, n => $"Splash damage: attacks deal {n} heat either side of the target."),
            ["recycle"] = P("trigger", 4, 5, 6, n => $"Every time your reserves are shuffled back into your deck, deal {n} heat to any target."),
            ["recall"] = new RelicPowerDef { Kind = "daily", Amounts = new[] { 1, 1, 1 }, Text = n => "Once per day: Recall 1.", Effects = n => L(), Choices = n => new AbilityChoices { Kind = "recall", Times = 1 } },
            ["shift"] = new RelicPowerDef { Kind = "daily", Amounts = new[] { 1, 1, 1 }, Text = n => "Once per day: Shift 1.", Effects = n => L(), Choices = n => new AbilityChoices { Kind = "shift", Times = 1 } },
            ["mend"] = P("trigger", 2, 3, 4, n => $"Dawn: Repair {n}."),
            ["gift"] = P("trigger", 1, 2, 3, n => "Dawn: add a random card to your hand."),
            ["bounty"] = P("trigger", 1, 2, 3, n => $"Each rival card you destroy: cool {n}."),
            ["nova"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 2, 2, 3 }, Text = n => $"Once per battle: deal {n} heat to each card in your opponent's tableau.", Effects = n => L(new Effect { Type = "strikeAll", Amount = n }) },
            ["renew"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 2, 3, 4 }, Text = n => $"Once per battle: renew {n}.", Effects = n => L(new Effect { Type = "restore", Amount = n, All = true }) },
            ["coolant"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 4, 5, 6 }, Text = n => $"Once per battle: cool {n}.", Effects = n => L(new Effect { Type = "cool", Amount = n }) },
            ["starfall"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 1, 2, 3 }, Text = n => $"Once per battle: deal {n} heat to the rival's sun, +2 for each of your cards that hasn't attacked this turn.", Effects = n => L(new Effect { Type = "heat", Amount = n, To = "target", Plus = new Count { Of = "rested", Per = 0.5 } }) },
            ["overcharge"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 2, 2, 3 }, Text = n => $"Once per battle: +{n} energy.", Effects = n => L(new Effect { Type = "plays", Amount = n }) },
            ["recallTwo"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 2, 2, 2 }, Text = n => $"Once per battle: recall {n}.", Effects = n => L(), Choices = n => new AbilityChoices { Kind = "recall", Times = n } },
            ["duskShift"] = new RelicPowerDef { Kind = "daily", Amounts = new[] { 1, 1, 1 }, Text = n => "Once per day: Shift 1.", Effects = n => L(), Choices = n => new AbilityChoices { Kind = "shift", Times = 1 } },
            ["reclaim"] = P("trigger", 1, 1, 1, n => $"Cards in your reserves can be played for +{n} energy."),
            ["thorns"] = P("trigger", 1, 2, 3, n => $"Your cards hit back for +{n}."),
            ["leech"] = P("trigger", 1, 1, 2, n => $"Attacking the rival's sun cools yours by {n}."),
            ["harvest"] = P("trigger", 1, 1, 2, n => $"Play 3 cards in one turn: draw {n}."),
            ["anchor"] = P("trigger", 1, 2, 3, n => $"Your Guards have +{n} defence."),
            ["sear"] = P("trigger", 1, 1, 2, n => $"Dawn: deal {n} heat to the rival card with the most attack."),
            ["devour"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 1, 1, 1 }, Text = n => "Once per battle: destroy the rival card with the least stability.", Effects = n => L(new Effect { Type = "devour" }) },
            ["fortress"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 2, 3, 4 }, Text = n => $"Once per battle: your best-defended card gains +{n} defence and Guard.", Effects = n => L(new Effect { Type = "fortify", Amount = n, Who = "best" }) },
            ["paradise"] = P("trigger", 1, 1, 2, n => $"Your dead planet becomes a paradise planet, providing renew {n} each turn it faces you."),
            ["grasp"] = P("trigger", 1, 1, 2, n => $"+{n} hand size."),
            ["ram"] = P("trigger", 2, 3, 4, n => $"Your attackers add their defence to their attack (up to +{n})."),
            ["might"] = new RelicPowerDef { Kind = "ability", Amounts = new[] { 1, 1, 2 }, Text = n => $"Hero ability: a card gains +{n} attack and loses {n} stability.", Ability = n => Ab("Overdrive", $"+{n} attack to a card; it loses {n} stability.", "empower", 1, n) },
            ["steady"] = new RelicPowerDef { Kind = "ability", Amounts = new[] { 2, 3, 4 }, Text = n => $"Hero ability: a card gains {n} stability.", Ability = n => Ab("Steady", $"{n} stability to a card.", "renew", 1, n) },
            ["multishot"] = new RelicPowerDef { Kind = "ability", Amounts = new[] { 3, 3, 3 }, Text = n => $"Hero ability: Multishot, {n} heat split among up to {n} targets.", Ability = n => Ab("Multishot", $"{n} heat, split among up to {n} targets.", "aim", n, 1) },
            ["ward"] = new RelicPowerDef { Kind = "ability", Amounts = new[] { 2, 2, 3 }, Text = n => $"Hero ability: a card gains {n} shields.", Ability = n => Ab("Ward", $"{n} shields to a card.", "ward", 1, n) },
            ["freeze"] = new RelicPowerDef { Kind = "ability", Amounts = new[] { 1, 1, 1 }, Text = n => "Hero ability: a rival card can't attack next turn.", Ability = n => Ab("Freeze", "A rival card can't attack next turn.", "freeze", 1) },
            ["displace"] = new RelicPowerDef { Kind = "ability", Amounts = new[] { 1, 1, 1 }, Text = n => "Hero ability: shift a rival card.", Ability = n => Ab("Displace", "Shift a rival card.", "displace", 1) },
            ["bargain"] = new RelicPowerDef { Kind = "ability", Amounts = new[] { 2, 2, 3 }, Text = n => $"Hero ability: a card in your hand costs {n} less.", Ability = n => Ab("Bargain", $"A card in hand costs {n} less.", "discount", 1, n) },
            ["echo"] = P("trigger", 10, 10, 10, n => $"Cards you play have a {n}% chance to become a random Hero while in play."),
            ["orbitShift"] = P("trigger", 1, 1, 1, n => $"Your orbit +{n} as each battle begins."),
            ["starsworn"] = P("trigger", 3, 3, 3, n => $"Your Hero gains Attunement {n}."),
            ["phoenix"] = new RelicPowerDef { Kind = "once", Amounts = new[] { 1, 1, 1 }, Text = n => "Once per battle: return your last discarded card to your hand.", Effects = n => L(new Effect { Type = "recover", Latest = true }) },
        };

        /// <summary>How much of a power a side has (two relics of the same power add up).</summary>
        public static int N(List<RelicInPlay> relics, string power) => relics == null ? 0 : relics.Where(r => r.Power == power).Sum(r => r.N);

        /// <summary>The first relic of a power a side carries.</summary>
        public static RelicInPlay Of(List<RelicInPlay> relics, string power) => relics?.FirstOrDefault(r => r.Power == power);
    }

    public static class Singularities
    {
        const string Captain = "human_captain";
        const string CaptainStart = "wall";

        /// <summary>The Captain's singularity's id from its card's id (its seventh part).</summary>
        public static string CaptainSingularityId(string defId)
        {
            int at = defId.IndexOf('@');
            string id = null;
            if (at >= 0)
            {
                var parts = defId.Substring(at + 1).Split('.');
                if (parts.Length > 5) id = parts[5];
            }
            return id != null && Cards.Rules.CaptainSingularities.ContainsKey(id) ? id : CaptainStart;
        }

        /// <summary>A Hero card's singularity (the Captain's, the one its build has chosen), or null.</summary>
        public static Singularity Of(string defId)
        {
            if (defId == Captain || defId.StartsWith(Captain + "@")) return Cards.Rules.CaptainSingularities[CaptainSingularityId(defId)];
            return Cards.Rules.Singularities.TryGetValue(defId, out var s) ? s : null;
        }
    }

    public static partial class Companions
    {
        /// <summary>The companion a card is (its base id, before any build), or null.</summary>
        public static string Of(string defId)
        {
            var b = defId.Split('@')[0];
            foreach (var kv in Cards.Rules.CompanionCards) if (kv.Value == b) return kv.Key;
            return null;
        }
    }

    /// <summary>
    /// Cards made from their ids, not stored: fused cards ("fuse:a+b"), marked cards, the Captain's and the
    /// companions' builds. (Ported with the campaign.)
    /// </summary>
}
