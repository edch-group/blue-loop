using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace BlueLoop.Engine
{
    /// <summary>
    /// Cards made from their ids rather than listed (cards.ts, captain.ts, companions.ts, rifts.ts): fused cards
    /// ("fuse:a+b"), cards the Dark Prophet has marked ("nyx:veil:id"), the Captain as petals have built them
    /// ("human_captain@attack.stability.cheaper.abilities.lead.sing.gates") and the crew as they have grown
    /// ("companion_lancer@attack.stability.cheaper.traits.gates"). Each is built once, then kept.
    /// </summary>
    public static class Builds
    {
        public class CaptainAbility { public string Id; public int Price; public HeroAbility Ability; }
        public class CaptainLead { public string Id; public string Name; public int Price; public string Text; public CardDef Def; }
        public class CaptainBase { public int Cost; public int Stability; public int Attack; }
        public class CaptainData
        {
            public List<CaptainAbility> Abilities;
            public List<CaptainLead> Leads;
            public CaptainBase Base;
            public int StabilityStep;
            public string StartAbility;
            public int MaxSlots;
            public List<string> Titles;
            public Dictionary<string, string> SingularityLines;
        }
        public class GateData { public int Attack; public int Stability; public int Cost; }
        public class CompanionTrait { public string Id; public string Name; public int Price; public string Text; public CardDef Def; }
        public class CompanionBase { public int Cost; public int Health; public int Attack; }
        public class CompanionDef
        {
            public string Id;
            public string Card;
            public string Name;
            public string Title;
            public string Kind;
            public int? Race;
            public CompanionBase Base;
            public List<string> Titles;
            public string Start;
            public List<CompanionTrait> Traits;
            public Dictionary<string, double> Learns;
            public string LearnsText;
            public string UnlockText;
            public string Flavour;
        }
        public class MarkDef { public string Name; public string Text; }
        public class Data
        {
            public CaptainData Captain;
            public GateData Gate;
            public int Tiers;
            public List<CompanionDef> Companions;
            public Dictionary<string, MarkDef> NyxMarks;
        }

        public static Data D { get; private set; }
        static readonly Dictionary<string, CardDef> made = new Dictionary<string, CardDef>();

        public static void Load(string json)
        {
            D = Json.Read<Data>(json);
            made.Clear();
        }

        /// <summary>The card an id builds (null if it isn't a built card's id).</summary>
        public static CardDef Make(string defId)
        {
            if (made.TryGetValue(defId, out var def)) return def;
            def = Fused(defId) ?? Marked(defId) ?? Captain(defId) ?? Companion(defId);
            if (def != null) made[defId] = def;
            return def;
        }

        static CardDef Plain(string id) => CardData.TryGet(id, out var d) ? d : null;

        /// <summary>"7" → 7, clamped to 0..most (anything unreadable: 0).</summary>
        static int N(string[] parts, int i, int most)
        {
            if (i >= parts.Length || !double.TryParse(parts[i], NumberStyles.Float, CultureInfo.InvariantCulture, out var x) || double.IsNaN(x)) return 0;
            return (int)Math.Max(0, Math.Min(most, Math.Floor(x)));
        }

        static List<T> Concat<T>(List<T> a, List<T> b) => a == null && b == null ? null : (a ?? new List<T>()).Concat(b ?? new List<T>()).ToList();

        // ---- Fused cards ----

        public const string FusePrefix = "fuse:";
        static readonly Dictionary<string, int> RarityRank = new Dictionary<string, int> { ["dwarf"] = 0, ["stellar"] = 1, ["anomaly"] = 2, ["enigma"] = 3 };
        public static string FusedId(string a, string b) => FusePrefix + a + "+" + b;
        public static bool IsFused(string id) => id.StartsWith(FusePrefix);

        static string FusedName(CardDef a, CardDef b)
        {
            var first = a.Name.Split(' ')[0];
            var last = b.Name.Split(' ').Last();
            var name = first + " " + last;
            return name == a.Name || name == b.Name || first == last ? "Fused " + a.Name : name;
        }

        static readonly Regex Summable = new Regex(@"^((?:\{(?:dawn|dusk)\}: )?)(?:\{(heat|cool|shield|sturdy|repair|renew|plant|grows|sting|soothe):(\d+)\}|Draw (\d+))\.$");
        static List<string> Sentences(string text) => Regex.Split(text.Trim(), @"(?<=\.)\s+").Where(x => x.Length > 0).ToList();

        /// <summary>Text added to a card's, with like abilities summed ("Draw 1" and "Draw 1" read "Draw 2").</summary>
        public static (string text, string rest) MergeCardText(string text, string added)
        {
            var own = Sentences(text);
            var rest = new List<string>();
            foreach (var line in Sentences(added))
            {
                var m = Summable.Match(line);
                int at = -1;
                if (m.Success)
                {
                    var mk = m.Groups[2].Success ? m.Groups[2].Value : "draw";
                    at = own.FindIndex(o =>
                    {
                        var n2 = Summable.Match(o);
                        return n2.Success && n2.Groups[1].Value == m.Groups[1].Value && (n2.Groups[2].Success ? n2.Groups[2].Value : "draw") == mk;
                    });
                }
                if (!m.Success || at < 0)
                {
                    rest.Add(line);
                    continue;
                }
                var n = Summable.Match(own[at]);
                int sum = int.Parse(n.Groups[3].Success ? n.Groups[3].Value : n.Groups[4].Value) + int.Parse(m.Groups[3].Success ? m.Groups[3].Value : m.Groups[4].Value);
                own[at] = m.Groups[2].Success ? $"{n.Groups[1].Value}{{{m.Groups[2].Value}:{sum}}}." : $"{n.Groups[1].Value}Draw {sum}.";
            }
            return (string.Join(" ", own), string.Join(" ", rest));
        }

        static CardDef Fused(string id)
        {
            if (!IsFused(id)) return null;
            var ab = id.Substring(FusePrefix.Length).Split('+');
            if (ab.Length < 2) return null;
            CardDef da = Plain(ab[0]), db = Plain(ab[1]);
            if (da == null || db == null) return null;
            var (text, rest) = MergeCardText(da.Text, db.Text);
            return new CardDef
            {
                Id = id,
                Name = FusedName(da, db),
                Kind = da.Kind,
                Cost = (da.Cost ?? 1) + (db.Cost ?? 1),
                Race = da.Race == db.Race ? da.Race : null,
                Rarity = RarityRank[db.Rarity ?? "dwarf"] > RarityRank[da.Rarity ?? "dwarf"] ? db.Rarity : da.Rarity,
                Text = rest.Length > 0 ? text + " " + rest : text,
                OnPlay = Concat(da.OnPlay, db.OnPlay),
                OnTurn = Concat(da.OnTurn, db.OnTurn),
                OnLeave = Concat(da.OnLeave, db.OnLeave),
                OnRecover = Concat(da.OnRecover, db.OnRecover),
                Passive = Concat(da.Passive, db.Passive),
                Attack = (da.Attack ?? 0) != 0 || (db.Attack ?? 0) != 0 ? Math.Max(da.Attack ?? 0, db.Attack ?? 0) : (int?)null,
                Defence = (da.Defence ?? 0) != 0 || (db.Defence ?? 0) != 0 ? Math.Max(da.Defence ?? 0, db.Defence ?? 0) : (int?)null,
                Stability = da.Stability != null || db.Stability != null ? Math.Max(da.Stability ?? 0, db.Stability ?? 0) : (int?)null,
                FusedFrom = new List<string> { ab[0], ab[1] },
            };
        }

        // ---- Marked cards ----

        public const string MarkPrefix = "nyx:";
        public static string MarkedId(string mark, string id) => MarkPrefix + mark + ":" + id;
        public static bool IsMarked(string id) => id.StartsWith(MarkPrefix);

        public static (string mark, string baseId)? MarkOf(string id)
        {
            if (!IsMarked(id)) return null;
            var rest = id.Substring(MarkPrefix.Length);
            int i = rest.IndexOf(':');
            // (JS's slice(0, -1) when there is no colon: all but the last character.)
            var mark = i < 0 ? rest.Substring(0, Math.Max(0, rest.Length - 1)) : rest.Substring(0, i);
            return D.NyxMarks.ContainsKey(mark) ? (mark, rest.Substring(i + 1)) : ((string, string)?)null;
        }

        static CardDef Marked(string id)
        {
            var m = MarkOf(id);
            if (m == null) return null;
            var d = Plain(m.Value.baseId) ?? Fused(m.Value.baseId);
            if (d == null) return null;
            var def = Json.Clone(d);
            def.Id = id;
            def.Text = $"{D.NyxMarks[m.Value.mark].Text}. {d.Text}".Trim();
            switch (m.Value.mark)
            {
                case "darkspeed": def.Darkspeed = true; break;
                case "unmake": def.OnPlay = Concat(def.OnPlay, new List<Effect> { new Effect { Type = "destroy", MaxDefence = 1 } }); break;
                case "veil": def.OnPlay = Concat(def.OnPlay, new List<Effect> { new Effect { Type = "shield", Amount = 2 } }); break;
                case "nightfall": def.OnTurn = Concat(def.OnTurn, new List<Effect> { new Effect { Type = "heat", Amount = 1, To = "target" } }); break;
                case "sting": def.Passive = Concat(def.Passive, new List<Passive> { new Passive { Type = "retaliate", Amount = 1 } }); break;
            }
            return def;
        }

        // ---- Heroes as they read (heroes-battle.ts) ----

        static string PayText(HeroAbility a) => string.Join(", ", new[]
        {
            (a.Pay?.Stability ?? 0) != 0 ? $"−{a.Pay.Stability} stability" : "",
            a.Pay?.Sacrifice == true ? "Sacrifice a card" : "",
            (a.Pay?.SelfHeat ?? 0) != 0 ? $"{{heat:{a.Pay.SelfHeat}}} to your sun" : "",
        }.Where(x => x.Length > 0));

        static string Line(HeroAbility a)
        {
            var pay = PayText(a);
            var body = (a.Cost ?? 0) != 0 ? $"{{cost:{a.Cost}}}{(pay.Length > 0 ? " " + pay : "")} : {a.Text}" : pay.Length > 0 ? $"{pay}: {a.Text}" : a.Text;
            return $"{{act:{a.Name}}}{body}";
        }

        /// <summary>A Hero card: what it does as it leads, then its abilities.</summary>
        public static CardDef Hero(CardDef def, string lead, List<HeroAbility> abilities)
        {
            def.Kind = "command";
            def.Abilities = abilities;
            var parts = new List<string> { lead, abilities.Count > 0 ? "{abilities}" : "" };
            parts.AddRange(abilities.Select(Line));
            def.Text = string.Join(" ", parts.Where(x => !string.IsNullOrEmpty(x)));
            return def;
        }

        // ---- The Captain ----

        public const string CaptainId = "human_captain";
        public static bool IsCaptain(string id) => id == CaptainId || id.StartsWith(CaptainId + "@");

        public class CaptainBuild { public int Attack, Stability, Cheaper, Gates; public List<string> Abilities; public string Lead; public string Sing; }

        public static CaptainBuild CaptainBuildOf(string id)
        {
            if (id == CaptainId) return new CaptainBuild { Abilities = new List<string> { D.Captain.StartAbility } };
            if (!id.StartsWith(CaptainId + "@")) return null;
            var p = id.Substring(CaptainId.Length + 1).Split('.');
            string At(int i) => i < p.Length ? p[i] : null;
            var abilities = At(3);
            var lead = At(4);
            var sing = Singularities.CaptainSingularityId(id);
            return new CaptainBuild
            {
                Attack = N(p, 0, 12),
                Stability = N(p, 1, 12),
                Cheaper = N(p, 2, 4),
                Gates = N(p, 6, D.Tiers - 1),
                Abilities = abilities != null && abilities != "-" ? abilities.Split('+').Where(x => D.Captain.Abilities.Any(a => a.Id == x)).ToList() : new List<string>(),
                Lead = D.Captain.Leads.Any(l => l.Id == lead) ? lead : null,
                Sing = sing != "wall" ? sing : null,
            };
        }

        static CardDef Captain(string id)
        {
            var b = CaptainBuildOf(id);
            if (b == null) return null;
            var c = D.Captain;
            var lead = c.Leads.FirstOrDefault(l => l.Id == b.Lead);
            var def = new CardDef
            {
                Id = id,
                Name = b.Gates < c.Titles.Count ? c.Titles[b.Gates] : "The Captain",
                Stability = c.Base.Stability + (b.Stability + b.Gates * D.Gate.Stability) * c.StabilityStep,
                Cost = Math.Max(0, c.Base.Cost + b.Gates * D.Gate.Cost - b.Cheaper),
                Attack = c.Base.Attack + b.Attack + b.Gates * D.Gate.Attack,
                Ascended = b.Gates != 0 ? b.Gates : (int?)null,
                OnTurn = lead?.Def?.OnTurn,
                OnPlay = lead?.Def?.OnPlay,
                Passive = lead?.Def?.Passive,
                ArtOf = CaptainId,
            };
            Hero(def, lead?.Text, b.Abilities.Select(x => c.Abilities.First(a => a.Id == x).Ability).ToList());
            // Its singularity's line, after its abilities.
            var sid = Singularities.CaptainSingularityId(id);
            if (c.SingularityLines.TryGetValue(sid, out var line) && !def.Text.Contains("{sing:")) def.Text = $"{def.Text} {line}";
            return def;
        }

        // ---- The crew ----

        public static CompanionDef CompanionOfCard(string defId)
        {
            var baseId = defId.Split('@')[0];
            return D.Companions.FirstOrDefault(c => c.Card == baseId);
        }

        public class CompanionBuild { public int Attack, Stability, Cheaper, Gates; public List<string> Traits; }

        public static CompanionBuild CompanionBuildOf(string defId, out CompanionDef c)
        {
            c = CompanionOfCard(defId);
            if (c == null) return null;
            if (!defId.Contains("@")) return new CompanionBuild { Traits = new List<string> { c.Start } };
            var p = defId.Substring(c.Card.Length + 1).Split('.');
            var traits = p.Length > 3 ? p[3] : null;
            var cd = c;
            return new CompanionBuild
            {
                Attack = N(p, 0, 12),
                Stability = N(p, 1, 12),
                Cheaper = N(p, 2, 4),
                Traits = traits != null && traits != "-" ? traits.Split('+').Where(x => cd.Traits.Any(k => k.Id == x)).ToList() : new List<string>(),
                Gates = N(p, 4, D.Tiers - 1),
            };
        }

        static CardDef Companion(string defId)
        {
            var b = CompanionBuildOf(defId, out var c);
            if (b == null) return null;
            var traits = c.Traits.Where(x => b.Traits.Contains(x.Id)).ToList();
            var onPlay = traits.SelectMany(x => x.Def.OnPlay ?? new List<Effect>()).ToList();
            var onTurn = traits.SelectMany(x => x.Def.OnTurn ?? new List<Effect>()).ToList();
            var passive = traits.SelectMany(x => x.Def.Passive ?? new List<Passive>()).ToList();
            int defence = traits.Sum(x => x.Def.Defence ?? 0);
            return new CardDef
            {
                Id = defId,
                Name = b.Gates < c.Titles.Count ? c.Titles[b.Gates] : c.Name,
                Kind = c.Kind,
                Race = c.Race,
                Rarity = "stellar",
                Character = true,
                Cost = Math.Max(0, c.Base.Cost + b.Gates * D.Gate.Cost - b.Cheaper),
                Health = c.Base.Health + 2 * (b.Stability + b.Gates * D.Gate.Stability),
                Attack = c.Base.Attack + b.Attack + b.Gates * D.Gate.Attack,
                Ascended = b.Gates != 0 ? b.Gates : (int?)null,
                Text = string.Join(" ", traits.Select(x => x.Text)),
                OnPlay = onPlay.Count > 0 ? onPlay : null,
                OnTurn = onTurn.Count > 0 ? onTurn : null,
                Passive = passive.Count > 0 ? passive : null,
                Defence = defence != 0 ? defence : (int?)null,
                Darkspeed = traits.Any(x => x.Def.Darkspeed == true) ? true : (bool?)null,
                ArtOf = defId != c.Card ? c.Card : null,
            };
        }
    }
}
