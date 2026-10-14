using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>
    /// Boons (boons.ts): abilities a campaign hero's card carries while it is in play, from the gear they wear and the
    /// skills they have learned. Each is a small hidden card definition (never in a deck, shop or collection): its
    /// dawn effects, play effects, passives, Sturdy and stability join the hero card's own, the same way a Fusion
    /// card's do. Ids name what they do ("boon_heat_2"), so a save needs nothing more than the id.
    /// </summary>
    public static class Boons
    {
        class Spec
        {
            public string Text;
            public List<Effect> OnTurn, OnPlay;
            public List<Passive> Passive;
            public int? Defence, Stability;
        }

        static List<Effect> L(Effect e) => new List<Effect> { e };
        static Effect Heat(int n, bool pierce = false) => new Effect { Type = "heat", Amount = n, To = "target", Pierce = pierce ? true : (bool?)null };
        static Effect E(string type, int n) => new Effect { Type = type, Amount = n };

        /// <summary>Each kind's words and work, by its number (in the TS order).</summary>
        static readonly List<(string kind, System.Func<int, Spec> spec)> Specs = new List<(string, System.Func<int, Spec>)>
        {
            ("heat", n => new Spec { Text = $"{{dawn}}: {{heat:{n}}}.", OnTurn = L(Heat(n)) }),
            ("pierce", n => new Spec { Text = $"{{dawn}}: {{heat:{n}}}, {{pierce}}.", OnTurn = L(Heat(n, true)) }),
            ("shield", n => new Spec { Text = $"{{dawn}}: {{shield:{n}}}.", OnTurn = L(E("shield", n)) }),
            ("cool", n => new Spec { Text = $"{{dawn}}: {{cool:{n}}}.", OnTurn = L(E("cool", n)) }),
            ("repair", n => new Spec { Text = $"{{dawn}}: {{repair:{n}}}.", OnTurn = L(E("repair", n)) }),
            ("draw", n => new Spec { Text = $"{{dawn}}: Draw {n}.", OnTurn = L(E("draw", n)) }),
            ("energy", n => new Spec { Text = $"{{dawn}}: {{energy:{n}}}.", OnTurn = L(E("plays", n)) }),
            ("sturdy", n => new Spec { Text = $"{{sturdy:{n}}}.", Defence = n }),
            ("stability", n => new Spec { Text = $"+{n} stability.", Stability = n }),
            ("bulwark", n => new Spec { Text = $"{{bulwark:{n}}}.", Passive = new List<Passive> { new Passive { Type = "guard", Amounts = new List<int> { n } } } }),
            ("tidewall", n => new Spec { Text = "{tidewall}.", Passive = new List<Passive> { new Passive { Type = "tidewall" } } }),
            ("guard", n => new Spec { Text = "{guard}.", Passive = new List<Passive> { new Passive { Type = "taunt" } } }),
            ("playheat", n => new Spec { Text = $"As it is played: {{heat:{n}}}.", OnPlay = L(Heat(n)) }),
            ("playshield", n => new Spec { Text = $"As it is played: {{shield:{n}}}.", OnPlay = L(E("shield", n)) }),
            ("playcool", n => new Spec { Text = $"As it is played: {{cool:{n}}}.", OnPlay = L(E("cool", n)) }),
            ("playdraw", n => new Spec { Text = $"As it is played: Draw {n}.", OnPlay = L(E("draw", n)) }),
            ("plant", n => new Spec { Text = $"As it is played: {{plant:{n}}}.", OnPlay = L(E("plant", n)) }),
        };

        /// <summary>A boon's id: what it does and how much ("boon_heat_2"; "boon_tidewall" for those without a number).</summary>
        public static string Boon(string kind, int n = 0) => n != 0 ? $"boon_{kind}_{n}" : $"boon_{kind}";

        /// <summary>Every boon there is (numbers 1–6), as hidden card definitions.</summary>
        public static readonly List<CardDef> All = Specs.SelectMany(k =>
            (k.kind == "tidewall" || k.kind == "guard" ? new[] { 0 } : new[] { 1, 2, 3, 4, 5, 6 }).Select(n =>
            {
                var s = k.spec(n);
                return new CardDef
                {
                    Id = Boon(k.kind, n),
                    Name = "Boon",
                    Kind = "command",
                    Token = true,
                    Cost = 0,
                    Stability = s.Stability ?? 0,
                    Text = s.Text,
                    OnTurn = s.OnTurn,
                    OnPlay = s.OnPlay,
                    Passive = s.Passive,
                    Defence = s.Defence,
                };
            })).ToList();
    }
}
