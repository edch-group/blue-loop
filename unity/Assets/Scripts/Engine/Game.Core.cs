using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>
    /// The battle rules (game.ts), ported line for line: a game is plain data (GameState) and every move makes a new
    /// state from the old (Apply). Kept in step with the TypeScript engine by replaying its recorded games.
    /// </summary>
    public static partial class Game
    {
        public const int CommandSlot = -1;
        public const string Draw = "~draw";
        public const int DevourSunHeat = 5;
        static readonly string[] PlanetNames = { "dead", "abundant", "industrial" };
        public static readonly int OrbitLength = PlanetNames.Length * Balance.OrbitTurns;

        // ---- small helpers (the TypeScript's idioms) ----

        /// <summary>A stable sort (as JavaScript's is), into a new list.</summary>
        internal static List<T> Sorted<T>(IEnumerable<T> items, Comparison<T> cmp) => items.OrderBy(x => x, Comparer<T>.Create(cmp)).ToList();

        internal static int Sign(double d) => d < 0 ? -1 : d > 0 ? 1 : 0;

        static TurnStats EmptyTurn() => new TurnStats { HeatDealt = 0, CardsPlayed = 0, Cooled = 0 };

        static CardInstance NewCard(GameState state, string defId)
        {
            state.UidCounter += 1;
            return new CardInstance { Uid = $"c{state.UidCounter}", DefId = Cards.Def(defId).Id };
        }

        /// <summary>A game state copied for a move, or a look ahead.</summary>
        public static GameState Clone(GameState state) => Json.Clone(state);

        static void Log(GameState state, string text)
        {
            int seq = (state.Log.Count > 0 ? state.Log[state.Log.Count - 1].Seq : 0) + 1;
            state.Log.Add(new LogEntry { Seq = seq, Turn = state.TurnNumber, Text = text });
            if (state.Log.Count > Balance.MaxLogEntries) state.Log.RemoveRange(0, state.Log.Count - Balance.MaxLogEntries);
        }

        static string Cap(string s) => string.IsNullOrEmpty(s) ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);

        // ---- the dawn/dusk tally: a dawn's or a dusk's sums, logged as one line ----

        class SunTally { public string Name; public int Applied, Blocked, Cooled, To; }
        class Tally
        {
            public string Phase;
            public PlayerState Owner;
            public readonly List<KeyValuePair<string, SunTally>> Suns = new List<KeyValuePair<string, SunTally>>();
            public int Shields, Repaired;
        }
        static Tally tally;

        static SunTally TallySun(PlayerState p)
        {
            var t = tally;
            foreach (var kv in t.Suns) if (kv.Key == p.Id) return kv.Value;
            var at = new SunTally { Name = p.Name, To = p.Heat };
            t.Suns.Add(new KeyValuePair<string, SunTally>(p.Id, at));
            return at;
        }

        static void BeginTally(GameState state, string phase, PlayerState owner)
        {
            if (tally != null) FlushTally(state);
            tally = new Tally { Phase = phase, Owner = owner };
        }

        static void FlushTally(GameState state)
        {
            var t = tally;
            tally = null;
            if (t == null) return;
            var parts = new List<string>();
            var order = Sorted(t.Suns, (a, b) => (a.Key == t.Owner.Id ? 1 : 0) - (b.Key == t.Owner.Id ? 1 : 0));
            foreach (var kv in order)
            {
                var x = kv.Value;
                bool own = kv.Key == t.Owner.Id;
                string whose = own ? "own sun" : $"{x.Name}'s sun";
                int net = x.Applied - x.Cooled;
                if (x.Applied != 0 || x.Cooled != 0) parts.Add($"{whose} {(net >= 0 ? "+" : "−")}{Math.Abs(net)} → {x.To}{(x.Blocked != 0 ? $" ({x.Blocked} into shields)" : "")}");
                else if (x.Blocked != 0) parts.Add($"{x.Blocked} into {x.Name}'s shields");
            }
            if (t.Shields != 0) parts.Add($"+{t.Shields} shield{(t.Shields == 1 ? "" : "s")}");
            if (t.Repaired != 0) parts.Add($"repair {t.Repaired}");
            if (parts.Count > 0) Log(state, $"{t.Owner.Name}'s {t.Phase}: {string.Join(" · ", parts)}.");
        }

        // ---------------------------------------------------------------------------
        // Setup
        // ---------------------------------------------------------------------------

        public static GameState Create(GameSetup setup)
        {
            int n = setup.Players.Count;
            if (n < Balance.MinPlayers || n > Balance.MaxPlayers) throw new GameError($"Blue Loop needs {Balance.MinPlayers}-{Balance.MaxPlayers} players.");
            var state = new GameState
            {
                Version = 7,
                RngState = setup.Seed,
                UidCounter = 0,
                TurnNumber = 1,
                Round = 1,
                ActivePlayerIndex = 0,
                WinnerId = null,
            };
            if (setup.Campaign == true) state.Campaign = true;
            if (setup.Challenge != null) state.Challenge = Json.Clone(setup.Challenge);
            if (setup.Mode == "core") state.Mode = "core";

            bool CatchUp(int i) => i > 0 && n <= Balance.CatchUpMaxPlayers;
            for (int i = 0; i < n; i++)
            {
                var ps = setup.Players[i];
                var presets = CardData.Decks.Where(d => !(d.Mixed ?? false) && (d.Mode ?? "lost") == (setup.Mode ?? "lost")).ToList();
                var fallback = presets[i % 4];
                var list = ps.Deck ?? fallback.Cards;
                var deck = Rng.Shuffle(state, list.Select(id => NewCard(state, id)).ToList());
                var p = new PlayerState
                {
                    Id = $"p{i + 1}",
                    Name = ps.Name,
                    IsAI = ps.IsAI,
                    DeckName = ps.DeckName ?? (ps.Deck != null ? null : fallback.Name),
                    Avatar = string.IsNullOrEmpty(ps.Avatar) ? null : ps.Avatar,
                    Heat = Balance.StartingHeat + (ps.HeatDelta ?? 0) + (ps.Modifiers?.StartingHeat ?? 0) - (CatchUp(i) ? Balance.LaterSeatCool : 0),
                    Shields = ps.Opening?.Shields ?? 0,
                    Deck = deck,
                    DeckSize = deck.Count + (ps.Tableau?.Count ?? 0),
                    Hand = new List<CardInstance>(),
                    Tableau = new List<CardInstance>(),
                    Discard = new List<CardInstance>(),
                    Lightspeed = null,
                    Eliminated = false,
                    TargetId = null,
                    TurnsTaken = 0,
                    PlaysLeft = 0,
                    Orbit = 0,
                    Turn = EmptyTurn(),
                    Modifiers = ps.Modifiers,
                    Conditions = ps.Conditions,
                };
                if (ps.HeroBoons != null && ps.HeroBoons.Boons.Count > 0) p.HeroBoons = ps.HeroBoons;
                if (ps.Relics != null && ps.Relics.Count > 0) p.Relics = ps.Relics.Select(r => new RelicInPlay { Power = r.Power, N = r.N, Name = r.Name }).ToList();
                if (ps.Skills != null && ps.Skills.Count > 0) p.Skills = ps.Skills.Select(k => Json.Clone(k)).ToList();
                if (!string.IsNullOrEmpty(ps.Hero)) p.Hero = ps.Hero;
                if (ps.HeroStats != null) p.HeroStats = new HeroStats { Attack = ps.HeroStats.Attack, Defence = ps.HeroStats.Defence };
                if (ps.Rooms != null)
                    p.Rooms = new ShipRooms { Defence = ps.Rooms.Defence.ToList(), Attack = ps.Rooms.Attack.ToList(), Command = ps.Rooms.Command, Boons = ps.Rooms.Boons?.Select(b => b.ToList()).ToList() };
                if (ps.ClosedSlots != null && ps.ClosedSlots.Count > 0) p.ClosedSlots = ps.ClosedSlots.ToList();
                p.Heat = Math.Max(Balance.MinHeat, Math.Min(p.Heat, SupernovaThreshold(p) - 1));
                var safest = SlotsBySafety().Where(s => !SlotClosed(p, s)).ToList();
                foreach (var id in (ps.Tableau ?? new List<string>()).Where(Persists))
                {
                    int k = p.Deck.FindIndex(c => c.DefId == id);
                    CardInstance card;
                    if (k >= 0 && Cards.Def(id).Kind == "command") { card = p.Deck[k]; p.Deck.RemoveAt(k); }
                    else card = NewCard(state, id);
                    if (Cards.Def(id).Kind == "command")
                    {
                        if (CommandCard(p) == null) Place(p, card, CommandSlot);
                    }
                    else if (safest.Count > 0) { Place(p, card, safest[0]); safest.RemoveAt(0); }
                }
                if (!string.IsNullOrEmpty(ps.Lightspeed) && Cards.Def(ps.Lightspeed).Kind == "trap") p.Lightspeed = NewCard(state, ps.Lightspeed);
                if (Relics.N(p.Relics, "orbitShift") != 0) p.Orbit = (p.Orbit + Relics.N(p.Relics, "orbitShift")) % OrbitLength;
                if (ps.Boss == true)
                {
                    var leader = !string.IsNullOrEmpty(ps.BossLeader) ? p.Tableau.FirstOrDefault(c => c.DefId == ps.BossLeader) : CommandCard(p);
                    if (leader != null && (ps.BossHealth ?? 0) != 0) leader.Health = leader.MaxHealth = ps.BossHealth;
                    p.Boss = new BossState { Intent = BossOrder(p).FirstOrDefault()?.Uid, Leader = leader?.Uid };
                }
                state.Players.Add(p);
                DrawCards(state, p, Balance.OpeningHand + (CatchUp(i) ? Balance.LaterSeatCards : 0) + (ps.Modifiers?.OpeningHand ?? 0) + (ps.Opening?.Draw ?? 0));
            }
            foreach (var p in state.Players) p.TargetId = NextOpponent(state, p)?.Id;

            Log(state, $"A new Blue Loop begins with {string.Join(", ", state.Players.Select(p => p.Name))}.");
            StartTurn(state);
            RechooseBossIntents(state);
            return state;
        }

        // ---------------------------------------------------------------------------
        // Queries
        // ---------------------------------------------------------------------------

        public static PlayerState ActivePlayer(GameState state) => state.Players[state.ActivePlayerIndex];

        public static List<PlayerState> LivingOpponents(GameState state, PlayerState p) => state.Players.Where(o => o.Id != p.Id && !o.Eliminated).ToList();

        static PlayerState NextOpponent(GameState state, PlayerState p)
        {
            int n = state.Players.Count;
            int start = state.Players.IndexOf(p);
            for (int k = 1; k < n; k++)
            {
                var o = state.Players[(start + k) % n];
                if (!o.Eliminated) return o;
            }
            return null;
        }

        public static PlayerState TargetOf(GameState state, PlayerState p)
        {
            var t = state.Players.FirstOrDefault(o => o.Id == p.TargetId);
            if (t != null && !t.Eliminated && t.Id != p.Id) return t;
            return NextOpponent(state, p);
        }

        public static int SupernovaThreshold(PlayerState p) => Balance.SupernovaAt + (p.Modifiers?.MaxHealthDelta ?? 0);

        public static bool IsOverheated(PlayerState p) => p.Heat * 2 >= SupernovaThreshold(p);

        public static int InstabilityHeat(GameState state) => InstabilityHeat(state.Round);

        static int InstabilityHeat(int round)
        {
            if (round < Balance.InstabilityStartsRound) return 0;
            return 1 + (round - Balance.InstabilityStartsRound) / Balance.InstabilityRampEvery;
        }

        static IEnumerable<(CardInstance card, Passive passive)> Passives(PlayerState p) =>
            p.Tableau.SelectMany(card => CardPassives(card).Select(passive => (card, passive))).ToList();

        public static bool HasPower(PlayerState p, string type) => !p.Eliminated && p.Tableau.Any(card => CardPassives(card).Any(x => x.Type == type));

        public static bool Silenced(GameState state, PlayerState p) => state.Players.Any(o => o != p && HasPower(o, "silence"));

        static readonly Dictionary<string, CardDef> FusedBonus = new Dictionary<string, CardDef>();

        /// <summary>What a Fusion card lends the card it is fused onto: its Fusion bonus, and nothing else of it.</summary>
        public static CardDef FusedDef(string defId)
        {
            if (!FusedBonus.TryGetValue(defId, out var d))
            {
                var def = Cards.Def(defId);
                var f = def.Fuse ?? new FuseBonus { Text = "" };
                d = new CardDef { Id = def.Id, Name = def.Name, Kind = def.Kind, Race = def.Race, Text = f.Text, OnPlay = f.OnPlay, OnTurn = f.OnTurn, OnDusk = f.OnDusk, Passive = f.Passive, Defence = f.Defence };
                FusedBonus[defId] = d;
            }
            return d;
        }

        static List<CardDef> Extras(CardInstance card) =>
            (card.Fused ?? new List<CardInstance>()).Select(f => FusedDef(f.DefId)).Concat((card.Boons ?? new List<string>()).Select(Cards.Def)).ToList();

        public static List<Passive> CardPassives(CardInstance card) =>
            (Cards.Def(card.DefId).Passive ?? new List<Passive>()).Concat(Extras(card).SelectMany(d => d.Passive ?? new List<Passive>())).ToList();

        public static int CardSturdy(CardInstance card) => (Cards.Def(card.DefId).Defence ?? 0) + Extras(card).Sum(d => d.Defence ?? 0);

        public static List<CardInstance> FusionHosts(PlayerState p) =>
            p.Tableau.Where(c => (c.Fused?.Count ?? 0) < Balance.MaxFused && Cards.Def(c.DefId).Kind != "relic").ToList();

        // ---- Orbit ----

        public static string PlanetAt(int orbit) => PlanetNames[(((orbit % OrbitLength) + OrbitLength) % OrbitLength) / Balance.OrbitTurns];

        public static string CurrentPlanet(PlayerState p, GameState state = null) => state != null && PlanetsEaten(state, p) ? "dead" : PlanetAt(p.Orbit);

        public static bool PlanetsEaten(GameState state, PlayerState p) =>
            state.Players.Any(o => o.Id != p.Id && !o.Eliminated && Passives(o).Any(x => x.passive.Type == "eatPlanets"));

        public static int PlanetTurnsLeft(PlayerState p) => Balance.OrbitTurns - (((p.Orbit % OrbitLength) + OrbitLength) % OrbitLength) % Balance.OrbitTurns;

        static void MoveOrbit(GameState state, PlayerState p, int by)
        {
            var before = CurrentPlanet(p);
            p.Orbit = (((p.Orbit + by) % OrbitLength) + OrbitLength) % OrbitLength;
            Charge(state, p, "orbit", Math.Abs(by));
            var now = CurrentPlanet(p);
            int left = PlanetTurnsLeft(p);
            Log(state, $"{p.Name}'s orbit {(by > 0 ? "speeds on" : "slips back")} {Math.Abs(by)}: the {now} planet{(now == before ? "" : " swings round")}{(Balance.OrbitTurns > 1 ? $" ({left} turn{(left == 1 ? "" : "s")} left)" : "")}.");
        }

        public static int PlaysAllowed(GameState state, PlayerState p)
        {
            int extra = Passives(p).Sum(x => x.passive.Type == "extraPlay" && (x.passive.Planet == null || CurrentPlanet(p, state) == x.passive.Planet) ? (x.passive.Amount ?? 0) : 0);
            int catchUp = p.TurnsTaken == 1 && state.Players.IndexOf(p) > 0 && state.Players.Count <= Balance.CatchUpMaxPlayers ? Balance.LaterSeatPlays : 0;
            int industry = CurrentPlanet(p, state) == "industrial" ? Balance.IndustrialPlays + (p.Modifiers?.IndustrialPlays ?? 0) : 0;
            return Math.Min(p.TurnsTaken, Balance.MaxPlays) + extra + catchUp + industry + (p.Modifiers?.ExtraPlays ?? 0);
        }

        public static CardInstance CommandCard(PlayerState p) => p.Tableau.FirstOrDefault(c => c.Slot == CommandSlot);

        public static bool InSlots(string defId) => Persists(defId) && Cards.Def(defId).Kind != "command" && !Cards.IsBurst(Cards.Def(defId));

        public static bool TableauFull(PlayerState p) => p.Tableau.Count(c => c.Slot != CommandSlot) + (p.ClosedSlots?.Count ?? 0) >= Balance.TableauSlots;

        public class GlobalInPlay { public CardInstance Card; public PlayerState Owner; }

        public static GlobalInPlay ActiveGlobal(GameState state)
        {
            foreach (var owner in state.Players)
            {
                if (owner.Eliminated) continue;
                var card = owner.Tableau.FirstOrDefault(c => Cards.Def(c.DefId).Kind == "global");
                if (card != null) return new GlobalInPlay { Card = card, Owner = owner };
            }
            return null;
        }

        static bool FieldActive(GameState state, string field)
        {
            var g = ActiveGlobal(state);
            return g != null && (Cards.Def(g.Card.DefId).Passive ?? new List<Passive>()).Any(ps => ps.Type == "field" && ps.Field == field);
        }

        static bool IsEnemyEffect(Effect e) =>
            e.Type == "destroy" || e.Type == "bounce" || (e.Type == "erode" && e.All != true) || (e.Type == "shift" && e.Enemy == true) || e.Type == "offer" || (e.Type == "rootbreak" && e.Shields != true) || e.Type == "steal";

        public static Effect EnemyEffect(string defId) => (Cards.Def(defId).OnPlay ?? new List<Effect>()).FirstOrDefault(IsEnemyEffect);

        public static bool DestroyImmune(string defId)
        {
            var part = Cards.Def(defId).OverlordPart;
            return part == "overlord" || part == "body" || part == "gear" || part == "lost lord" || part == "vault";
        }

        static bool CanReach(PlayerState owner, CardInstance c, Effect e, int wear = 0)
        {
            if (owner.Boss?.Leader == c.Uid && e.Type != "offer" && e.Type != "rootbreak" && !(e.Type == "destroy" && DestroyImmune(c.DefId))) return false;
            if (e.Type == "shift") return c.Slot != CommandSlot;
            if (e.Type == "steal") return c.Slot != CommandSlot && !DestroyImmune(c.DefId);
            if (e.Type == "rootbreak") return CardDefence(owner, c) > 0;
            if (e.Type == "offer") return true;
            if (e.Type == "destroy" && e.Kind != null && Cards.Def(c.DefId).Kind != e.Kind) return false;
            if ((e.Type == "destroy" || e.Type == "bounce") && Cards.Def(c.DefId).OverlordPart == "vault") return false;
            if (e.Type == "destroy" && DestroyImmune(c.DefId)) return true;
            if (e.Type != "erode" && e.MaxDefence != null && CardDefence(owner, c) - wear > e.MaxDefence && Cards.Def(c.DefId).Kind != "relic") return false;
            return true;
        }

        public static List<CardInstance> EnemyChoices(GameState state, PlayerState p, string defId, string aimUid = null)
        {
            var e = EnemyEffect(defId);
            var t = TargetOf(state, p);
            if (e == null || t == null) return new List<CardInstance>();
            var effects = Cards.Def(defId).OnPlay ?? new List<Effect>();
            int wear = HeatFirst(defId) ? effects.Take(effects.IndexOf(e)).Sum(x => x.Type == "heat" && x.To == "target" ? (x.Amount ?? 0) : 0) : 0;
            return t.Tableau.Where(c => CanReach(t, c, e, c.Uid == aimUid ? wear : 0)).ToList();
        }

        public static bool HeatFirst(string defId)
        {
            if (defId != "void_bolt") return false;
            var effects = Cards.Def(defId).OnPlay ?? new List<Effect>();
            var e = EnemyEffect(defId);
            return e != null && effects.Take(effects.IndexOf(e)).Any(x => x.Type == "heat" && x.To == "target");
        }

        public static bool IsGuard(PlayerState _, CardInstance c) => CardPassives(c).Any(x => x.Type == "taunt") || (c.Fortified ?? 0) > 0;

        public static List<CardInstance> Guards(PlayerState p) => p.Tableau.Where(c => IsGuard(p, c)).ToList();

        public class AimOptions { public List<CardInstance> Cards; public bool Sun; }

        public static AimOptions AimChoices(GameState state, PlayerState p, bool attack = false)
        {
            var t = TargetOf(state, p);
            if (t == null) return new AimOptions { Cards = new List<CardInstance>(), Sun = true };
            var g = attack ? Guards(t) : new List<CardInstance>();
            bool sun = t.Boss == null && !(SurvivalDream(state) && t == state.Players[1]);
            return g.Count > 0 ? new AimOptions { Cards = g, Sun = false } : new AimOptions { Cards = t.Tableau.ToList(), Sun = sun };
        }

        public static bool SurvivalDream(GameState state) => state.Challenge?.Kind == "dream" && state.Challenge.Goal == "survive";

        public static bool Chillable(string defId) => (Cards.Def(defId).OnPlay ?? new List<Effect>()).Any(e => e.Type == "cool");

        public static List<CardInstance> ChillChoices(GameState state, PlayerState p)
        {
            var t = TargetOf(state, p);
            return t != null ? t.Tableau.Where(c => CardAttack(state, t, c) > 0).ToList() : new List<CardInstance>();
        }

        public static bool Aimable(string defId) => (Cards.Def(defId).OnPlay ?? new List<Effect>()).Any(e => e.Type == "heat" && e.To == "target");

        public static bool AbilityAimable(string defId, int index)
        {
            var ab = Cards.Def(defId).Abilities;
            return ab != null && index < ab.Count && (ab[index].Effects ?? new List<Effect>()).Any(e => e.Type == "heat" && e.To == "target");
        }

        public static List<HeroAbility> HeroAbilities(PlayerState p, CardInstance hero = null, bool heroGiven = false)
        {
            if (!heroGiven) hero = CommandCard(p);
            if (hero == null) return new List<HeroAbility>();
            var lent = (p.Relics ?? new List<RelicInPlay>()).SelectMany(r =>
            {
                var a = Relics.Powers.TryGetValue(r.Power, out var def) ? def.Ability?.Invoke(r.N) : null;
                return a != null ? new[] { new HeroAbility { Id = $"relic-{r.Power}", Name = a.Name, Text = a.Text, Effects = new List<Effect>(), Relic = r.Name, Choices = a.Choice } } : new HeroAbility[0];
            });
            return (Cards.Def(hero.DefId).Abilities ?? new List<HeroAbility>()).Concat(lent).ToList();
        }

        public static bool Overdrivable(CardInstance c, int n) => (c.Health ?? 0) > n;

        static bool ChoiceOpen(GameState state, PlayerState p, string kind, int amount = 1)
        {
            var rival = TargetOf(state, p);
            if (kind == "aim") return rival != null && (rival.Tableau.Count > 0 || rival.Boss == null);
            if (kind == "freeze") return rival != null && rival.Tableau.Count > 0;
            if (kind == "displace") return rival != null && rival.Tableau.Any(c => c.Slot != CommandSlot);
            if (kind == "shift") return p.Tableau.Any(c => c.Slot != CommandSlot);
            if (kind == "recall") return p.Tableau.Any(Returnable);
            if (kind == "discount") return p.Hand.Any(c => HandCost(c) > 0);
            if (kind == "empower") return p.Tableau.Any(c => Overdrivable(c, amount));
            return p.Tableau.Count > 0;
        }

        static CardInstance AimedCard(GameState state, PlayerState p, string aim)
        {
            var t = TargetOf(state, p);
            if (t == null) return null;
            return aim != null ? t.Tableau.FirstOrDefault(c => c.Uid == aim) : null;
        }

        public static bool Tidewall(PlayerState p) => p.Tableau.Any(c => CardPassives(c).Any(x => x.Type == "tidewall"));

        public static string EnemyEffectKind(string defId) => EnemyEffect(defId)?.Type;

        public static List<CardInstance> AllyChoices(PlayerState p, string defId)
        {
            var k = AllyEffectKind(defId);
            if (k == "shift") return p.Tableau.Where(c => c.Slot != CommandSlot).ToList();
            if (k == "offer") return p.Tableau.Where(c => Armed(p, c) && c.Dimmed != true && (c.SpentAttack ?? 0) == 0).ToList();
            if (k == "rootbreak") return p.Tableau.Where(c => (c.Growth ?? 0) > 0).ToList();
            if (!(Cards.Def(defId).OnPlay ?? new List<Effect>()).Any(e => e.Type == "recall" || e.Type == "empower" || (e.Type == "restore" && e.All != true && e.Self != true))) return new List<CardInstance>();
            return k == "recall" ? p.Tableau.Where(Returnable).ToList() : p.Tableau.ToList();
        }

        public static bool Returnable(CardInstance card) => Cards.Def(card.DefId).Kind != "command";

        public static bool RecallsInto(PlayerState p, string defId) => AllyEffectKind(defId) == "recall" && p.Tableau.Any(Returnable);

        public static string RoomProblem(PlayerState p, string defId)
        {
            if (NeedsAlly(defId) && AllyChoices(p, defId).Count == 0)
                return AllyEffectKind(defId) == "offer" ? "Needs a ready ally with attack" : "Needs a grown card of yours";
            if (Cards.Def(defId).Consume == true && Consumable(p).Count == 0) return "Nothing to consume";
            return null;
        }

        public static bool HasRoomFor(PlayerState p, string defId) => RoomProblem(p, defId) == null;

        public static bool Replaces(PlayerState p, string defId)
        {
            var def = Cards.Def(defId);
            return InSlots(defId) && TableauFull(p) && def.Consume != true && !RecallsInto(p, defId) && Consumable(p).Count > 0;
        }

        public static List<CardInstance> Consumable(PlayerState p) => p.Tableau.Where(c => c.Slot != CommandSlot).ToList();

        public static string AllyEffectKind(string defId)
        {
            var e = (Cards.Def(defId).OnPlay ?? new List<Effect>()).FirstOrDefault(x => x.Type == "recall" || x.Type == "empower" || (x.Type == "restore" && x.All != true && x.Self != true) || (x.Type == "shift" && x.Enemy != true) || x.Type == "offer" || x.Type == "rootbreak");
            return e?.Type;
        }

        static bool NeedsAlly(string defId)
        {
            var k = AllyEffectKind(defId);
            return k == "offer" || k == "rootbreak";
        }

        public static string ShiftEffect(string defId)
        {
            var e = (Cards.Def(defId).OnPlay ?? new List<Effect>()).FirstOrDefault(x => x.Type == "shift");
            return e == null ? null : e.Enemy == true ? "rival" : "mine";
        }

        public static List<int> ShiftSlots(CardInstance card, PlayerState owner = null) =>
            Enumerable.Range(0, Balance.TableauSlots).Where(i => i != card.Slot && !(owner != null && SlotClosed(owner, i))).ToList();

        public static List<CardInstance> RecoverChoices(PlayerState p, string defId)
        {
            var e = (Cards.Def(defId).OnPlay ?? new List<Effect>()).FirstOrDefault(x => x.Type == "recover");
            if (e == null) return new List<CardInstance>();
            return p.Discard.Where(c => Returnable(c) && (e.Kind == null || Cards.Def(c.DefId).Kind == e.Kind)).ToList();
        }

        public static bool SlotClosed(PlayerState p, int slot) => p.ClosedSlots != null && p.ClosedSlots.Contains(slot);

        public static List<int> FreeSlots(PlayerState p)
        {
            var taken = new HashSet<int?>(p.Tableau.Select(c => c.Slot));
            return Enumerable.Range(0, Balance.TableauSlots).Where(i => !taken.Contains(i) && !SlotClosed(p, i)).ToList();
        }

        static List<int> SlotsBySafety() => Sorted(Enumerable.Range(0, Balance.TableauSlots), (a, b) => Balance.SlotDefence[b] - Balance.SlotDefence[a] != 0 ? Balance.SlotDefence[b] - Balance.SlotDefence[a] : a - b);

        public static bool NeedsSlot(PlayerState p, string defId) => InSlots(defId) && FreeSlots(p).Count > 1;

        public static int BaseHealth(string defId)
        {
            var def = Cards.Def(defId);
            if (def.Health != null) return def.Health.Value;
            if (def.FusedFrom != null) return def.FusedFrom.Max(BaseHealth);
            if (def.Kind == "command") return Math.Max(1, def.Stability ?? Balance.HeroStability);
            int b = Math.Max(Balance.MinHealth, Math.Min(Balance.MaxHealth, 1 + (def.Cost ?? 1) + (def.Kind == "defence" ? 1 : 0)));
            return Math.Max(1, b - (def.Fusion == true ? 1 : 0));
        }

        public static int CardCost(string defId) => Cards.Def(defId).Cost ?? 1;

        public static int HandCost(CardInstance c, PlayerState p = null)
        {
            if (p != null && HasPower(p, "freeCards")) return 0;
            return Math.Max(0, CardCost(c.DefId) - (c.Discount ?? 0));
        }

        static List<CardDef> EchoHeroes() => Cards.Pool.Where(c => c.Kind == "command" && c.Token != true && !Cards.IsBossCard(c.Id) && !c.Id.StartsWith("boon_")).ToList();

        static void Place(PlayerState p, CardInstance card, int slot)
        {
            card.Slot = slot;
            card.Health = BaseHealth(card.DefId);
            card.AttackBonus = null;
            if (p.HeroBoons != null && card.DefId == p.HeroBoons.Hero)
            {
                card.Boons = p.HeroBoons.Boons.ToList();
                card.Health = Math.Min(Balance.MaxHealth + 4, card.Health.Value + card.Boons.Sum(b => Cards.Def(b).Stability ?? 0));
                card.MaxHealth = card.Health;
            }
            int vigour = Relics.N(p.Relics, "vigour");
            if (vigour != 0 && Cards.Def(card.DefId).Kind != "relic")
            {
                card.Health = (card.Health ?? 0) + vigour;
                card.MaxHealth = (card.MaxHealth ?? BaseHealth(card.DefId)) + vigour;
            }
            var roomBoons = slot != CommandSlot && p.Rooms?.Boons != null && slot < p.Rooms.Boons.Count ? p.Rooms.Boons[slot] : null;
            if (roomBoons != null && roomBoons.Count > 0) card.Boons = (card.Boons ?? new List<string>()).Concat(roomBoons).ToList();
            int wear = p.SlotWear != null && p.SlotWear.TryGetValue(slot, out var w) ? w : 0;
            if (wear > 0) card.Dented = wear;
            p.SlotWear?.Remove(slot);
            p.Tableau.Add(card);
            p.Tableau = Sorted(p.Tableau, (a, b) => (a.Slot ?? 0) - (b.Slot ?? 0));
        }

        static int Distance(CardInstance a, CardInstance b)
        {
            if (a.Slot == CommandSlot || b.Slot == CommandSlot) return a.Uid == b.Uid ? 0 : 99;
            return Math.Abs((a.Slot ?? 0) - (b.Slot ?? 0));
        }

        public static int CardDefence(PlayerState p, CardInstance card)
        {
            int d = SlotDefence(card.Slot) + CardSturdy(card) + RoomDefence(p, card) + (card.Fortified ?? 0);
            if (p.Relics != null && IsGuard(p, card)) d += Relics.N(p.Relics, "anchor");
            if ((p.Modifiers?.GuardDefence ?? 0) != 0 && IsGuard(p, card)) d += p.Modifiers.GuardDefence.Value;
            foreach (var src in p.Tableau)
            {
                int k = Distance(src, card);
                if (k == 0) continue;
                foreach (var ps in CardPassives(src)) if (ps.Type == "guard" && k <= ps.Amounts.Count) d += ps.Amounts[k - 1];
            }
            return Math.Max(0, Math.Max(0, d) - (card.Dented ?? 0));
        }

        static int RoomDefence(PlayerState p, CardInstance card)
        {
            int d = 0;
            if (p.Rooms != null) d += card.Slot == CommandSlot ? p.Rooms.Command : (card.Slot != null && card.Slot >= 0 && card.Slot < p.Rooms.Defence.Count ? p.Rooms.Defence[card.Slot.Value] : 0);
            if (p.HeroStats != null && card.DefId == p.Hero) d += p.HeroStats.Defence;
            return d;
        }

        public static int SlotDefence(int? slot)
        {
            if (slot == CommandSlot) return Balance.CommandSlotDefence;
            int s = slot ?? 0;
            return s >= 0 && s < Balance.SlotDefence.Length ? Balance.SlotDefence[s] : 1;
        }

        public static int FullDefence(PlayerState p, CardInstance card)
        {
            var copy = (CardInstance)Json.Clone(card);
            copy.Dented = 0;
            // (The copy stands where the card does: its neighbours' Bulwark reaches it as it would.)
            return CardDefenceAs(p, card, copy);
        }

        static int CardDefenceAs(PlayerState p, CardInstance card, CardInstance asIf)
        {
            int d = SlotDefence(asIf.Slot) + CardSturdy(asIf) + RoomDefence(p, asIf) + (asIf.Fortified ?? 0);
            if (p.Relics != null && IsGuard(p, asIf)) d += Relics.N(p.Relics, "anchor");
            if ((p.Modifiers?.GuardDefence ?? 0) != 0 && IsGuard(p, asIf)) d += p.Modifiers.GuardDefence.Value;
            foreach (var src in p.Tableau)
            {
                int k = Distance(src, asIf);
                if (k == 0) continue;
                foreach (var ps in CardPassives(src)) if (ps.Type == "guard" && k <= ps.Amounts.Count) d += ps.Amounts[k - 1];
            }
            return Math.Max(0, Math.Max(0, d) - (asIf.Dented ?? 0));
        }

        static bool Anchored(PlayerState p, CardInstance card) => p.Tableau.Any(src => Distance(src, card) == 1 && CardPassives(src).Any(ps => ps.Type == "anchor"));

        public static bool CanSetTrap(PlayerState p) => p.Lightspeed == null;

        public static bool DualTrap(string defId)
        {
            var def = Cards.Def(defId);
            return def.Kind != "trap" && def.Trap != null;
        }

        public static int PlayCost(string defId, bool faceDown = false) => CardCost(defId) + (faceDown && DualTrap(defId) ? 1 : 0);

        public static bool CanSetFaceDown(PlayerState p, string defId) => DualTrap(defId) && CanSetTrap(p) && PlayCost(defId, true) <= p.PlaysLeft;

        public static bool IsLightspeed(string defId) => Cards.Def(defId).Lightspeed == true;

        public static List<string> CardChoices(string defId) => (Cards.Def(defId).Choices ?? new List<CardChoice>()).Select(c => c.Id).ToList();

        public static List<Effect> DawnEffects(CardInstance card, PlayerState p = null, GameState state = null)
        {
            var def = Cards.Def(card.DefId);
            var chosen = def.Choices?.FirstOrDefault(c => c.Id == card.Choice) ?? def.Choices?.FirstOrDefault();
            var own = (def.OnTurn ?? new List<Effect>()).Concat(chosen?.OnTurn ?? new List<Effect>()).Concat(Extras(card).SelectMany(d => d.OnTurn ?? new List<Effect>())).ToList();
            int attune = (def.Attune ?? 0) + Extras(card).Sum(d => d.Attune ?? 0);
            if (attune != 0) attune += Races.Trait(def.Race)?.Attune ?? 0;
            if (p != null && card.Slot == CommandSlot && def.Kind == "command") attune += Relics.N(p.Relics, "starsworn");
            if (attune == 0 || p == null) return own;
            return own.Concat(Attunement.Effects(Attunement.Position(p.Orbit, state != null && PlanetsEaten(state, p)), attune)).ToList();
        }

        public static bool Persists(string defId) => Cards.Def(defId).Kind != "trap";

        public static int ResonanceBonus(PlayerState p, CardInstance card)
        {
            if (!p.Tableau.Any(c => c.Uid == card.Uid)) return 0;
            int bonus = 0;
            foreach (var src in p.Tableau)
            {
                int d = Distance(src, card);
                if (d == 0) continue;
                foreach (var ps in CardPassives(src))
                    if (ps.Type == "adjacent" && d <= ps.Amounts.Count && (ps.Kind == null || HasRole(p, card, ps.Kind))) bonus += ps.Amounts[d - 1];
            }
            return bonus;
        }

        static List<CardInstance> Neighbours(PlayerState p, CardInstance card)
        {
            if (!p.Tableau.Any(c => c.Uid == card.Uid)) return new List<CardInstance>();
            return p.Tableau.Where(c => Distance(c, card) == 1).ToList();
        }

        static int Floor(double x) => (int)Math.Floor(x);

        static int CountOf(PlayerState p, CardInstance card, Count c, GameState state = null)
        {
            double per = c.Per != null && c.Per != 0 ? c.Per.Value : 1;
            switch (c.Of)
            {
                case "kind": return Floor(p.Tableau.Count(t => HasRole(p, t, c.Kind)) / per);
                case "cards": return Floor(p.Tableau.Count / per);
                case "rested": return Floor(p.Tableau.Count(t => t.Uid != card.Uid && t.Dimmed != true && Cards.Def(t.DefId).Token != true) / per);
                case "race": return Floor(p.Tableau.Count(t => OfRace(Cards.Def(t.DefId), c.Race, c.Sub)) / per);
                case "shields": return Floor(p.Shields / per);
                case "defence": return Floor(p.Tableau.Sum(t => CardDefence(p, t)) / per);
                case "growth": return card.Growth ?? 0;
                case "adjacent": return Neighbours(p, card).Count(n => c.Kind == null || HasRole(p, n, c.Kind));
                case "planet": return CurrentPlanet(p, state) == c.Planet ? (c.Amount ?? 0) : 0;
                case "spent": return (card.Spent ?? 0) * (c.Times ?? 1);
                case "cold":
                {
                    var sun = c.Rival == true ? (state != null ? TargetOf(state, p) : null) : p;
                    return sun != null ? Floor(Math.Max(0, -sun.Heat) / per) * (c.Times ?? 1) : 0;
                }
            }
            return 0;
        }

        public static bool ConditionMet(PlayerState p, Condition cond, GameState state = null, CardInstance card = null)
        {
            if (cond == null) return true;
            if (cond.Vigil != null) return card?.Dimmed != true;
            if (cond.Overheated != null) return IsOverheated(p);
            if (cond.MinKind != null) return p.Tableau.Count(t => HasRole(p, t, cond.MinKind)) >= cond.N;
            if (cond.Planet != null) return CurrentPlanet(p, state) == cond.Planet;
            if (cond.MinRace != null) return p.Tableau.Count(t => OfRace(Cards.Def(t.DefId), cond.MinRace, cond.Sub)) >= cond.N;
            return p.Tableau.Count >= cond.MinCards;
        }

        static bool OfRace(CardDef def, int? race, string sub = null) => (race == null || def.Race == race) && (string.IsNullOrEmpty(sub) || def.Sub == sub);

        /// <summary>How much an effect does right now, with every bonus.</summary>
        public static int EffectAmount(GameState state, PlayerState p, CardInstance card, Effect e, string when = "play")
        {
            if (e.Type != "heat" && e.Type != "cool" && e.Type != "shield" && e.Type != "selfHeat" && e.Type != "draw") return 0;
            bool scaled = e.Type == "heat" || e.Type == "cool" || e.Type == "shield";
            int b = e.Amount ?? 0;
            if (scaled && e.Plus != null) b += CountOf(p, card, e.Plus, state);
            if (scaled && e.Max != null) b = Math.Min(b, e.Max.Value);
            if (b <= 0) return 0;
            if (e.Type != "draw" && e.Type != "selfHeat") b += ResonanceBonus(p, card);
            if (scaled)
            {
                var def = Cards.Def(card.DefId);
                int bonus = 0;
                var counted = new HashSet<string>();
                foreach (var (src, passive) in Passives(p))
                {
                    if (passive.Type != "kindBonus" || (passive.Stat ?? "heat") != e.Type) continue;
                    if ((passive.Kind != null && !(p.Tableau.Contains(card) ? HasRole(p, card, passive.Kind) : DefHasRole(def, passive.Kind))) || (passive.Race != null && passive.Race != def.Race) || (!string.IsNullOrEmpty(passive.Sub) && passive.Sub != def.Sub)) continue;
                    if ((passive.Others == true && src.Uid == card.Uid) || (passive.OnTurnOnly == true && when != "turn") || counted.Contains(src.DefId)) continue;
                    counted.Add(src.DefId);
                    bonus += passive.Amount ?? 0;
                }
                if (e.Type == "heat" && FieldActive(state, "solarMaximum")) bonus += 1;
                return b + bonus;
            }
            return b;
        }

        public class TurnForecast
        {
            public int Heat;
            public string TargetId;
            public int Shields, Cool, SelfHeat, Unstable, UnstableRound, Round, Draw, PlanetDraw, PlanetPlays, Plays;
            public string Planet;
        }

        public static TurnForecast Forecast(GameState state, PlayerState p)
        {
            var target = TargetOf(state, p);
            int orbit = p.TurnsTaken > 0 ? (p.Orbit + 1) % OrbitLength : p.Orbit;
            var planet = PlanetsEaten(state, p) ? "dead" : PlanetAt(orbit);
            int round = state.Round + (state.Players.IndexOf(p) > state.ActivePlayerIndex ? 0 : 1);
            var f = new TurnForecast { TargetId = target?.Id, UnstableRound = state.Round + 1, Round = round, Planet = planet };
            if (p.Eliminated) return f;
            if (planet == "abundant" && p.TurnsTaken > 0) f.PlanetDraw = Balance.AbundantDraw + (p.Modifiers?.AbundantDraw ?? 0);
            if (planet == "industrial") f.PlanetPlays = Balance.IndustrialPlays + (p.Modifiers?.IndustrialPlays ?? 0);
            f.Draw += f.PlanetDraw;
            f.Plays += f.PlanetPlays;
            // (A shallow copy of the player, as `{ ...p, orbit, tableau: copies }` makes it.)
            var me = (PlayerState)typeof(PlayerState).GetMethod("MemberwiseClone", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(p, null);
            me.Orbit = orbit;
            me.Tableau = p.Tableau.Select(c => (CardInstance)typeof(CardInstance).GetMethod("MemberwiseClone", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(c, null)).ToList();
            foreach (var card in Silenced(state, p) ? new List<CardInstance>() : me.Tableau)
            {
                foreach (var e in DawnEffects(card, me, state).Concat(DuskEffects(card)))
                {
                    if (!ConditionMet(me, e.If, state, card)) continue;
                    switch (e.Type)
                    {
                        case "grow": card.Growth = Math.Max(card.Growth ?? 0, Math.Min(e.Max ?? 0, (card.Growth ?? 0) + 1)); break;
                        case "heat": f.Heat += EffectAmount(state, me, card, e, "turn"); break;
                        case "selfHeat": f.SelfHeat += e.Amount ?? 0; break;
                        case "cool": f.Cool += EffectAmount(state, me, card, e, "turn"); break;
                        case "shield": f.Shields += EffectAmount(state, me, card, e, "turn"); break;
                        case "draw": f.Draw += e.Amount ?? 0; break;
                        case "plays": f.Plays += e.Amount ?? 0; break;
                    }
                }
            }
            f.Unstable = InstabilityHeat(f.UnstableRound);
            if (FieldActive(state, "solarStorm")) f.SelfHeat += 1;
            if (FieldActive(state, "iceAge")) f.Cool += 1;
            var m = p.Modifiers;
            f.SelfHeat += m?.HeatPerTurn ?? 0;
            f.Cool += m?.CoolPerTurn ?? 0;
            f.Shields += m?.ShieldPerTurn ?? 0;
            f.Draw += m?.ExtraDraw ?? 0;
            return f;
        }

        public static List<Effect> DuskEffects(CardInstance card) =>
            (Cards.Def(card.DefId).OnDusk ?? new List<Effect>()).Concat(Extras(card).SelectMany(d => d.OnDusk ?? new List<Effect>())).ToList();

        public static int BaseAttack(CardDef def)
        {
            int a = def.Attack ?? 0;
            return a > 0 ? a : 0;
        }

        public static int CardAttack(GameState state, PlayerState p, CardInstance card)
        {
            var def = Cards.Def(card.DefId);
            int b = BaseAttack(def);
            bool hero = p.HeroStats != null && card.DefId == p.Hero;
            if (hero) b += p.HeroStats.Attack;
            b += card.AttackBonus ?? 0;
            if (Balance.GrowthAttack != 0 && (card.Growth ?? 0) != 0 && (b > 0 || Balance.GrowthAttackAll != 0)) b += card.Growth.Value * Balance.GrowthAttack;
            if (b <= 0) return 0;
            if (p.Rooms != null && card.Slot != CommandSlot) b += card.Slot != null && card.Slot >= 0 && card.Slot < p.Rooms.Attack.Count ? p.Rooms.Attack[card.Slot.Value] : 0;
            int ram = p.Relics != null ? Math.Min(Relics.N(p.Relics, "ram"), CardDefence(p, card)) : 0;
            return Math.Max(0, EffectAmount(state, p, card, new Effect { Type = "heat", Amount = b, To = "target" }, "play") + ram - (card.SpentAttack ?? 0) - (card.Chill ?? 0));
        }

        public static bool Armed(PlayerState p, CardInstance card)
        {
            int b = BaseAttack(Cards.Def(card.DefId)) + (card.AttackBonus ?? 0);
            if (p.HeroStats != null && card.DefId == p.Hero) b += p.HeroStats.Attack;
            if (Balance.GrowthAttack != 0 && (card.Growth ?? 0) != 0 && (b > 0 || Balance.GrowthAttackAll != 0)) b += card.Growth.Value * Balance.GrowthAttack;
            return b > 0;
        }

        public static bool HasRole(PlayerState p, CardInstance card, string kind)
        {
            var k = Cards.Def(card.DefId).Kind;
            if (kind == "attack") return k != "command" && Armed(p, card);
            if (kind == "defence") return k != "command" && CardSturdy(card) > 0;
            if (kind == "growth") return k != "command" && k != "relic" && !Armed(p, card) && CardSturdy(card) <= 0;
            return k == kind;
        }

        public static bool DefHasRole(CardDef def, string kind)
        {
            bool own = def.Kind != "command" && def.Kind != "trap" && def.Kind != "relic" && def.Kind != "global";
            if (kind == "attack") return own && ((def.Attack ?? 0) > 0 || (def.OnPlay ?? new List<Effect>()).Any(e => e.Type == "heat" && e.To == "target"));
            if (kind == "defence") return own && (def.Defence ?? 0) > 0;
            if (kind == "growth") return own && Cards.IsBurst(def);
            return def.Kind == kind;
        }

        public static int CardSting(CardInstance card)
        {
            var def = Cards.Def(card.DefId);
            int race = def.FusedFrom != null ? def.FusedFrom.Sum(id => Races.Trait(Cards.Def(id).Race)?.Sting ?? 0) : Races.Trait(def.Race)?.Sting ?? 0;
            return CardPassives(card).Sum(x => x.Type == "retaliate" ? (x.Amount ?? 0) : 0) + race;
        }

        public static int CounterDamage(GameState state, PlayerState owner, CardInstance card) =>
            CardAttack(state, owner, card) + CardSting(card) + Relics.N(owner.Relics, "thorns");

        public static CardInstance SacrificeOf(PlayerState p)
        {
            CardInstance low = null;
            foreach (var c in p.Tableau.Where(c => c.Slot != CommandSlot))
                if (low == null || (c.Health ?? 99) < (low.Health ?? 99)) low = c;
            return low;
        }

        public static bool IsGameOver(GameState state) => state.WinnerId != null;

        public static bool IsDraw(GameState state) => state.WinnerId == Draw;
    }
}
