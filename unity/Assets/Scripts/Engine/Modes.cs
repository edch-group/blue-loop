using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>
    /// Game modes (modes.ts). Core is the simple game: four races, each with one mechanic of its own, on top of the
    /// fundamentals every card shares. Lost Races ("lost") is everything: all eight races, their sub-races and every
    /// mechanic.
    /// </summary>
    public static partial class Modes
    {
        public class GameModeInfo { public string Name; public string Blurb; }

        public static readonly Dictionary<string, GameModeInfo> GameModes = new Dictionary<string, GameModeInfo>
        {
            ["core"] = new GameModeInfo { Name = "Core", Blurb = "Four core races, limited mechanics." },
            ["lost"] = new GameModeInfo { Name = "Lost Races", Blurb = "All races, all mechanics." },
        };

        /// <summary>A deck saved without a mode is from before modes: everything was legal then.</summary>
        public static string ModeOf(string deckMode) => deckMode ?? "lost";
        public static string ModeOf(DeckList deck) => ModeOf(deck?.Mode);

        static string rules = "lost";
        /// <summary>The rules in force (cards play the same in every mode, so nothing in the battle rules reads it).</summary>
        public static string RulesMode() => rules;
        public static void SetRulesMode(string mode) => rules = mode ?? "lost";

        /// <summary>Runs `f` under a mode's rules, then puts the rules back.</summary>
        public static T UnderRules<T>(string mode, System.Func<T> f)
        {
            var was = rules;
            rules = mode ?? "lost";
            try { return f(); }
            finally { rules = was; }
        }

        /// <summary>The one mechanic each core race is built round: Aureline, Xel'Naru, Vorthane, Ixquor.</summary>
        public static readonly Dictionary<int, string> CoreSignature = new Dictionary<int, string> { [0] = "forge", [1] = "overheat", [2] = "shields", [3] = "growth" };
        public static readonly int[] CoreRaces = { 0, 1, 2, 3 };
        /// <summary>Mechanics every race may use in Core, beyond the fundamentals.</summary>
        public static readonly string[] CoreMechanics = { "lightspeed", "trap", "repair" };

        static readonly Dictionary<string, string> MechanicNames = new Dictionary<string, string>
        {
            ["forge"] = "Forge", ["overheat"] = "Overheat", ["shields"] = "Shields", ["growth"] = "Growth", ["resonance"] = "Resonance", ["bulwark"] = "Bulwark",
            ["pierce"] = "Pierce", ["removal"] = "Removal", ["erode"] = "Erode", ["restore"] = "Restore", ["repair"] = "Repair", ["recall"] = "Recall",
            ["recover"] = "Recover", ["shift"] = "Shift", ["plant"] = "Plant", ["orbit"] = "Orbit", ["attune"] = "Attune", ["lightspeed"] = "Lightspeed", ["trap"] = "Trap",
            ["fusion"] = "Fusion", ["consume"] = "Consume", ["spendAll"] = "Spend all", ["global"] = "Global", ["leave"] = "Leaving play", ["sting"] = "Sting", ["anchor"] = "Anchor",
            ["thermosiphon"] = "Thermosiphon", ["darkspeed"] = "Darkspeed", ["empower"] = "Chosen", ["halt"] = "Halt", ["relic"] = "Relic",
        };
        /// <summary>Every mechanic beyond the fundamentals, as the card classifier names them.</summary>
        public static IEnumerable<string> Mechanics => MechanicNames.Keys;
        public static string MechanicName(string m) => MechanicNames.TryGetValue(m, out var n) ? n : null;

        static void OfCount(Count c, System.Action<string> add)
        {
            if (c == null) return;
            switch (c.Of)
            {
                case "growth": add("growth"); break;
                case "shields": add("shields"); break;
                case "adjacent": add("forge"); break;
                case "planet": add("orbit"); break;
                case "spent": add("spendAll"); break;
                case "cold": add("thermosiphon"); break;
                case "defence": add("bulwark"); break;
                case "rested": add("darkspeed"); break;
            }
        }

        static void OfEffect(Effect e, System.Action<string> add)
        {
            if (e.If?.Overheated != null) add("overheat");
            if (e.If?.Planet != null) add("orbit");
            OfCount(e.Plus, add);
            switch (e.Type)
            {
                case "heat": if (e.Pierce == true) add("pierce"); break;
                case "selfHeat": add("overheat"); break;
                case "shield": add("shields"); break;
                case "grow": case "growOthers": add("growth"); break;
                case "destroy": case "bounce": break; // (plain removal is a fundamental: Core has a few answers too)
                case "erode": add("erode"); break;
                case "restore": add("restore"); break;
                case "repair": add("repair"); break;
                case "empower": add("empower"); break;
                case "plant": add("plant"); break;
                case "recall": add("recall"); break;
                case "shift": add("shift"); break;
                case "recover": add("recover"); break;
                case "halt": add("halt"); break;
                case "orbit": add("orbit"); break;
            }
        }

        static void OfPassive(Passive p, System.Action<string> add)
        {
            switch (p.Type)
            {
                case "kindBonus": if (p.Stat == "shield") add("shields"); break; // (a plain buff to heat or cooling is a fundamental)
                case "keepShields": case "tidewall": case "absorbCool": add("shields"); break;
                case "retaliate": add("sting"); break;
                case "catalyst": add("growth"); break;
                case "field": add("global"); break;
                case "allyLeaves": add("leave"); break;
                case "adjacent": add(p.Kind == "attack" ? "forge" : "resonance"); break;
                case "guard": add("bulwark"); break;
                case "anchor": add("anchor"); break;
                case "eatPlanets": add("orbit"); break;
            }
        }

        /// <summary>The mechanics a card uses, beyond the fundamentals (in the order they are found).</summary>
        public static List<string> CardMechanics(CardDef def)
        {
            var outs = new List<string>();
            void Add(string m) { if (!outs.Contains(m)) outs.Add(m); }
            var lists = new List<List<Effect>> { def.OnPlay, def.OnTurn, def.OnDusk, def.OnLeave, def.OnRecover, def.Trap?.Effects };
            lists.AddRange((def.Choices ?? new List<CardChoice>()).Select(c => c.OnTurn));
            lists.AddRange((def.Abilities ?? new List<HeroAbility>()).Select(a => a.Effects));
            foreach (var list in lists)
                foreach (var e in list ?? new List<Effect>()) OfEffect(e, Add);
            foreach (var p in def.Passive ?? new List<Passive>()) OfPassive(p, Add);
            if ((def.OnLeave?.Count ?? 0) > 0) Add("leave");
            if ((def.OnRecover?.Count ?? 0) > 0) Add("recover");
            if (def.Trap != null) Add("trap");
            if (def.Lightspeed == true) Add("lightspeed");
            if (def.Fusion == true) Add("fusion");
            if (def.Consume == true) Add("consume");
            if (def.SpendAll == true) Add("spendAll");
            if ((def.Attune ?? 0) != 0) Add("attune");
            if (def.Kind == "global") Add("global");
            if (def.Kind == "relic") Add("relic");
            foreach (var a in def.Abilities ?? new List<HeroAbility>()) if ((a.Pay?.SelfHeat ?? 0) != 0) Add("overheat");
            return outs;
        }

        /// <summary>How many things a card does: each trigger's effects of one type count once, and each passive once.</summary>
        public static int CardThings(CardDef def)
        {
            int n = 0;
            foreach (var list in new[] { def.OnPlay, def.OnTurn, def.OnDusk, def.OnLeave, def.Trap?.Effects })
                n += (list ?? new List<Effect>()).Select(e => e.Type).Distinct().Count();
            return n + (def.Passive?.Count ?? 0);
        }

        /// <summary>Cards allowed in Core as they are, whatever their mechanics.</summary>
        static readonly HashSet<string> CoreAllowed = new HashSet<string> { "ion_cannon" };

        /// <summary>Why a card can't be played in this mode (null if it can).</summary>
        public static string ModeProblem(CardDef def, string mode)
        {
            if (mode == "lost" || CoreAllowed.Contains(def.Id)) return null;
            if (def.Race != null && !CoreRaces.Contains(def.Race.Value)) return "Lost Races only.";
            string own = def.Race != null && CoreSignature.TryGetValue(def.Race.Value, out var sig) ? sig : null;
            // (Lightspeed is core: the board has a slot for it in every game.)
            var extra = CardMechanics(def).Where(m => m != own && !CoreMechanics.Contains(m)).ToList();
            if (extra.Count > 0) return $"{string.Join(", ", extra.Select(MechanicName))}: Lost Races only.";
            if (def.Kind != "command" && CardThings(def) > 2) return "Does too much for Core.";
            return null;
        }

        public static bool InMode(CardDef def, string mode) => ModeProblem(def, mode) == null;

        /// <summary>Whether a card is legal in Core (a card plays the same in every mode).</summary>
        public static bool InCore(CardDef def) => InMode(def, "core");
    }
}
