using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    public static partial class Campaign
    {
        static readonly string[] Syllables = { "ka", "ren", "thu", "vo", "lis", "ar", "mek", "ssa", "dor", "ix", "ul", "phe", "nar", "zo", "qua", "tir", "bel", "osh", "ven", "cy" };
        static readonly string[] Tints = { "weapons", "defences", "economy", "resources" };
        static readonly string[] Numerals = { "I", "II", "III", "IV" };

        static string NodeName(CampaignState s, HashSet<string> used)
        {
            for (;;)
            {
                int parts = 2 + RInt(s, 2);
                var name = "";
                for (int i = 0; i < parts; i++) name += Syllables[RInt(s, Syllables.Length)];
                name = char.ToUpperInvariant(name[0]) + name.Substring(1);
                if (!used.Contains(name) && name.Length <= 9)
                {
                    used.Add(name);
                    return name;
                }
            }
        }

        static CampaignStats EmptyStats() => new CampaignStats();

        public static CampaignState Create(CampaignSetup setup)
        {
            var run = setup.Run ?? Meta.RunBonuses(null);
            var s = new CampaignState
            {
                Version = 6,
                Universe = 0,
                UniverseStart = 1,
                CollapseCol = 0,
                Conquered = 0,
                Petals = 0,
                PetalsBanked = 0,
                Xp = 0,
                XpBanked = 0,
                Run = run,
                RngState = setup.Seed,
                UidCounter = 0,
                LogSeq = 0,
                Turn = 1,
                PlayerId = "f1",
                Factions = new List<Faction>(),
                Nodes = new List<CampaignNode>(),
                Armies = new List<Army>(),
                Story = new CampaignStory { Queue = new List<StoryScene>(), Told = new List<string>() },
                Battle = null,
                Conquest = null,
                CardRewards = new List<CardReward>(),
                Phase = "player",
                AiQueue = new List<string>(),
                Winner = null,
                Log = new List<CampaignLogEntry>(),
            };
            bool human = !string.IsNullOrEmpty(setup.Captain) && Builds.IsCaptain(setup.Captain);
            int race = human ? 0 : Mod(setup.Race ?? 0, Races.RaceNames.Count);
            if (human || Modes.CoreRaces.Contains(race)) s.Mode = "core";
            var hero = human ? setup.Captain : setup.Hero != null && Story.Generals[race].Contains(setup.Hero) ? setup.Hero : Story.Generals[race][0];
            var ship = NewShip();
            ship.Hull = Math.Min(T.ShipMax.Hull, run.Hull);
            ship.Shields = Math.Min(T.ShipMax.Shields, run.Shields);
            if (run.Walls != 0) ship.Rooms.Defence = ship.Rooms.Defence.Select(d => d + run.Walls).ToList();
            var me = new Faction
            {
                Id = "f1",
                Name = string.IsNullOrEmpty(setup.PlayerName) ? "Commander" : setup.PlayerName,
                IsAI = false,
                Race = race,
                Human = human ? true : (bool?)null,
                Affinity = human && run.Affinity != null ? run.Affinity : null,
                Materials = T.StartMaterials + run.Materials,
                Ship = ship,
                Hero = hero,
                Research = new ResearchState { Done = new List<string>() },
                Reserve = new List<string>(),
                Missions = new List<ActiveMission>(),
                MissionDeck = Shuffle(s, D.Missions.Select(m => m.Id).ToList()),
                Stats = EmptyStats(),
                Eliminated = false,
            };
            s.Factions.Add(me);
            if ((run.Heirloom ?? 0) != 0)
            {
                var slots = Heroes.RaceSlots[race];
                var kind = slots[(int)Math.Floor(R(s) * slots.Count)].Kind;
                me.Relics = new List<Relic> { Heroes.MakeRelic($"item{++s.UidCounter}", kind, "stellar", race, R(s)) };
            }
            s.Factions.Add(new Faction { Id = "lost", Name = "Raiders", IsAI = true, Race = 0, Materials = 0, Ship = NewShip(), Reserve = new List<string>(), Missions = new List<ActiveMission>(), MissionDeck = new List<string>(), Stats = EmptyStats(), Eliminated = false, Lost = true });
            BuildUniverse(s, 1);
            var army = Flagship(s, me.Id);
            var own = Pool.Where(c => (human ? c.Race == null && c.Rarity == null : c.Race == race) && c.Kind != "command" && c.Rarity != "anomaly" && c.Fusion != true && c.SpendAll != true && LegalIn(s.Mode, c.Id) && !army.Deck.Contains(c.Id)).ToList();
            army.Deck.AddRange(own.Take(run.Cards).Select(c => c.Id));
            if (!human)
                foreach (var id in run.Deck ?? new List<string>())
                    if (Pool.Any(c => c.Id == id) && army.Deck.Count(x => x == id) < CampaignCopies(id)) army.Deck.Add(id);
            for (int k = 0; k < run.Picks; k++) s.CardRewards.Add(new CardReward { Source = "Requisition", Options = RandomCardChoices(s, me), ToDeck = army.Id });
            if (human) army.Deck.AddRange(run.Companions ?? new List<string>());
            if (!string.IsNullOrEmpty(run.Kept) && Pool.Any(c => c.Id == run.Kept))
            {
                army.Deck.Add(run.Kept);
                s.KeptIn = run.Kept;
            }
            s.StartDeck = army.Deck.ToList();
            army.Refit = false;
            Tell(s, human ? Story.CaptainIntroScene(me.Id, army.General) : Story.IntroScene(me.Race, me.Id, army.General));
            NoticeStory(s);
            return s;
        }

        public static int UniverseStability(CampaignState s)
        {
            if (s.Rift != null) return 999;
            return Math.Max(T.StabilityMin, T.StabilityTurns - T.StabilityStep * (s.Universe - 1)) + (s.Run?.Grace ?? 0);
        }

        public struct MapAt { public double X, Y, H; }

        static Func<int, double, double, double, MapAt> MapPlacer(CampaignState s, string layout, string terrain)
        {
            int L = T.Lanes, C = T.Columns;
            double gap = T.LaneGap, mid = (L - 1) / 2.0;
            double W = T.MapWidth, H = T.MapHeight;
            double bendA = 120 + R(s) * 260, bendF = 0.35 + R(s) * 0.4, bendP = R(s) * Math.PI * 2;
            double spreadA = 0.25 + R(s) * 0.3, spreadF = 0.6 + R(s) * 0.7, spreadP = R(s) * Math.PI * 2;
            double hillsA = 120 + R(s) * 120, hillsF = 0.7 + R(s) * 0.5, hillsP = R(s) * Math.PI * 2;
            double Height(double c) => terrain == "rolling" ? hillsA * Math.Sin(c * hillsF + hillsP) : terrain == "climb" ? c / C * 300 - 120 : 0;
            if (layout == "spiral")
            {
                const double R0 = 1150, R1 = 520;
                double Radius(int c) => R0 - (R0 - R1) * Math.Min(c, C - 1) / (C - 1);
                var angle = new double[C + 1];
                angle[0] = Math.PI;
                for (int c = 1; c <= C; c++) angle[c] = angle[c - 1] + T.ColGap / Radius(c - 1);
                return (c, l, dx, dy) =>
                {
                    if (c >= C) return new MapAt { X = W / 2, Y = H / 2, H = Height(C) };
                    double rad = Radius(c) + (l - mid) * gap * 0.75 + dy * 0.6;
                    double a = angle[c] + dx / Radius(c);
                    return new MapAt { X = W / 2 + Math.Cos(a) * rad, Y = H / 2 + Math.Sin(a) * rad, H = Height(c) };
                };
            }
            return (c, l, dx, dy) =>
            {
                double centre = H / 2 + bendA * Math.Sin(c * bendF + bendP);
                double wide = Math.Max(0.85, Math.Min(1.6, 1.15 + spreadA * Math.Sin(c * spreadF + spreadP)));
                return new MapAt { X = T.MapMargin + c * T.ColGap + dx, Y = centre + (l - mid) * gap * wide + dy, H = Height(c) };
            };
        }

        static CampaignNode Blank(CampaignState s, string id, string name, double x, double y, int tier, int c, double l)
        {
            int n = 2 + RInt(s, 3);
            var planets = new List<MapPlanet>();
            for (int j = 0; j < n; j++) planets.Add(new MapPlanet { Name = $"{name} {Numerals[j]}", Tint = Tints[RInt(s, Tints.Length)] });
            return new CampaignNode
            {
                Id = id,
                Name = name,
                X = x,
                Y = y,
                Planets = planets,
                Owner = null,
                Links = new List<string>(),
                Fortification = 0,
                Damage = 0,
                Garrison = new List<GarrisonCard>(),
                Hazard = new List<string>(),
                Yield = new NodeYield { Materials = 3 + RInt(s, 3) + tier + tier / 2 },
                Tier = tier,
                Col = c,
                Lane = l,
            };
        }

        static void Link(CampaignNode a, CampaignNode b)
        {
            if (a.Links.Contains(b.Id)) return;
            a.Links.Add(b.Id);
            b.Links.Add(a.Id);
        }

        static bool Open(CampaignNode n) => n.Home == null && n.Heart != true;

        /// <summary>A new universe: its galaxy, its strip, the wormhole past its far end, its stations.</summary>
        public static void BuildUniverse(CampaignState s, int universe, string layout = null)
        {
            var me = Player(s);
            int L = T.Lanes, C = T.Columns;
            s.Universe = universe;
            s.UniverseStart = s.Turn;
            s.CollapseCol = 0;
            s.Conquered = 0;
            s.Nodes = new List<CampaignNode>();
            s.Armies = s.Armies.Where(a => a.Owner == me.Id).ToList();
            int lift = 2 * (universe - 1);
            var used = new HashSet<string>();
            int Jitter(int n) => Round((R(s) - 0.5) * 2 * n);
            s.Layout = layout ?? (universe == 1 ? "strip" : R(s) < (s.Layout == "spiral" ? 0.25 : 0.55) ? "spiral" : "strip");
            var terrains = new[] { "flat", "rolling", "climb" };
            var terrain = terrains[RInt(s, terrains.Length)];
            s.Terrain = universe == 1 ? "flat" : terrain;
            var place = MapPlacer(s, s.Layout, s.Terrain);
            double midLane = (L - 1) / 2.0;
            var at0 = place(0, midLane, 0, 0);
            var home = Blank(s, "n0", NodeName(s, used), at0.X, at0.Y, 0, 0, midLane);
            home.H = at0.H;
            s.Nodes.Add(home);
            var grid = new CampaignNode[C][];
            for (int c = 1; c < C; c++)
            {
                grid[c] = new CampaignNode[L];
                for (int l = 0; l < L; l++)
                {
                    int tier = (c <= 2 ? 0 : c <= 5 ? 1 : 2) + lift;
                    // (Its jitters rolled before its name, as the arguments are evaluated in order.)
                    int jx = Jitter(55), jy = Jitter(45);
                    var p = place(c, l, jx, jy);
                    var n = Blank(s, $"n{s.Nodes.Count}", NodeName(s, used), p.X, p.Y, tier, c, l);
                    n.H = p.H;
                    grid[c][l] = n;
                    s.Nodes.Add(n);
                }
            }
            var atHole = place(C, midLane, 0, 0);
            CampaignNode At(int c, int l) => grid[c][l];
            var hole = new CampaignNode
            {
                Id = $"n{s.Nodes.Count}",
                Name = "Stellari Wormhole",
                X = atHole.X,
                Y = atHole.Y,
                H = atHole.H,
                Planets = new List<MapPlanet>(),
                Owner = null,
                Links = new List<string>(),
                Fortification = 0,
                Damage = 0,
                Garrison = new List<GarrisonCard>(),
                Hazard = new List<string>(),
                Yield = new NodeYield { Materials = 0 },
                Tier = 3 + lift,
                Col = C,
                Lane = midLane,
                Heart = true,
                Stellaria = 1,
            };
            s.Nodes.Add(hole);
            for (int l = 0; l < L; l++) Link(home, At(1, l));
            for (int c = 1; c < C; c++)
            {
                for (int l = 0; l < L; l++)
                {
                    if (c + 1 < C) Link(At(c, l), At(c + 1, l));
                    else Link(At(c, l), hole);
                }
                if (c + 1 >= C) continue;
                for (int l = 0; l + 1 < L; l++)
                {
                    double r = R(s);
                    if (r < 0.22) Link(At(c, l), At(c + 1, l + 1));
                    else if (r < 0.44) Link(At(c, l + 1), At(c + 1, l));
                    if (c > 1 && R(s) < 0.15) Link(At(c, l), At(c, l + 1));
                }
            }
            home.Owner = me.Id;
            home.Home = me.Id;
            var army = Flagship(s, me.Id);
            if (army != null)
            {
                army.NodeId = home.Id;
                army.Moved = false;
                army.Refit = false;
                army.Steps = 0;
            }
            else RaiseArmy(s, me, me.Hero ?? Story.Generals[me.Race][0], home.Id);
            var odds = T.StarOdds;
            foreach (var n in s.Nodes.Where(Open).ToList())
            {
                double r = R(s);
                string kind = r < odds.Red ? "red" : r < odds.Red + odds.White ? "white" : r < odds.Red + odds.White + odds.Brown ? "brown" : r < odds.Red + odds.White + odds.Brown + odds.Neutron ? "neutron" : null;
                if (kind == null) continue;
                n.Star = kind;
                if (kind == "red") n.Yield.Materials = Math.Max(0, n.Yield.Materials - 1);
                if (kind == "white") n.Yield.Materials += 2;
                if (kind == "neutron") n.Yield.Materials += 3;
            }
            var kinds = D.GalaxyKinds.Where(k => k != s.Galaxy).ToList();
            s.Galaxy = kinds[RInt(s, kinds.Count)];
            var lords = D.Overlords.Where(o => o.Id != s.Overlord).ToList();
            s.Overlord = lords[RInt(s, lords.Count)].Id;
            var sites = Shuffle(s, s.Nodes.Where(n => Open(n) && (n.Col ?? 0) >= 2 && (n.Col ?? 0) <= C - 2).ToList());
            foreach (var n in sites.Take(T.Armories)) n.Station = new Station { Kind = "armory", Cards = ArmoryStock(s, n) };
            var projects = new HashSet<string>(me.Research?.Done ?? new List<string>());
            foreach (var n in sites.Skip(T.Armories).Take(T.ResearchStations))
            {
                var options = PickResearch(s, projects);
                foreach (var id in options) projects.Add(id);
                n.Station = new Station { Kind = "research", Options = options };
            }
            int i0 = 0;
            foreach (var n in sites.Skip(T.Armories + T.ResearchStations).Take(T.BonusPlanets))
            {
                n.Bonus = new NodeBonus { Materials = 4 + n.Tier + (i0 % 2) * 2 };
                i0++;
            }
            foreach (var n in s.Nodes.Where(x => Open(x) && x.Station == null && x.Bonus == null && (x.Col ?? 0) >= 1).ToList())
            {
                var find = D.StarFinds[n.Star ?? "yellow"];
                if (R(s) >= find.Find) continue;
                var weights = find.Kinds.Select(k => (kind: (string)k[0], w: Convert.ToDouble(k[1]))).ToList();
                double roll = R(s) * weights.Sum(x => x.w);
                string kind = null;
                foreach (var (k, w) in weights) if ((roll -= w) < 0) { kind = k; break; }
                kind ??= weights[0].kind;
                n.Cache = new Cache { Kind = kind, Amount = kind == "cards" ? 3 : 4 + 2 * n.Tier };
            }
            var extras = RollExtras(s, universe);
            PlaceChallenges(s, extras.secret);
            PlaceRivals(s, extras.rival);
            PlaceEncounters(s);
            foreach (var n in Shuffle(s, s.Nodes.Where(x => x.Home == null && x.Heart != true && x.Challenge == null && x.Rival == null && x.Encounter == null).ToList()).Take(extras.dream)) n.Dream = true;
            foreach (var n in s.Nodes.Where(x => Open(x) && x.Station == null && x.Cache == null && x.Challenge == null && x.Encounter == null && (x.Col ?? 0) >= 1).ToList())
                if (R(s) < T.VaultChance) n.Vault = R(s) < T.VaultTwoChance ? 2 : 1;
            Clog(s, universe == 1 ? $"The run begins. {me.Name} holds {home.Name}, at the near end of the strip." : $"{me.Name} comes through into galaxy {universe}, at {home.Name}.");
            Tell(s, Story.WormholeSightedScene(universe));
            s.Crystal = me.Human == true && !HasCompanion(s, "lancer");
        }

        // ---- The Captain's companions ----

        public static bool HasCompanion(CampaignState s, string id)
        {
            var card = Builds.D.Companions.First(c => c.Id == id).Card;
            return s.Freed?.Contains(id) == true || s.Run?.Companions?.Any(c => c == card || c.StartsWith(card + "@")) == true;
        }

        static void JoinCompanion(CampaignState s, string id, string line)
        {
            if (HasCompanion(s, id)) return;
            var f = Player(s);
            var c = Builds.D.Companions.First(x => x.Id == id);
            (s.Freed ??= new List<string>()).Add(id);
            var army = Flagship(s, f.Id);
            bool full = CrewInDeck(s).Count >= Companions.ActiveCrew;
            if (!full)
            {
                if (army != null) army.Deck.Add(c.Card);
                else f.Reserve.Add(c.Card);
            }
            Clog(s, $"{c.Name}, {c.Title.ToLowerInvariant()}, joins the Captain's ship.", army?.NodeId, f.Id);
            (s.Joined ??= new List<JoinedCompanion>()).Add(new JoinedCompanion { Id = id, Line = line, Swap = full ? true : (bool?)null });
        }

        public static List<string> CrewInDeck(CampaignState s)
        {
            var f = Player(s);
            var cards = (Flagship(s, f.Id)?.Deck ?? new List<string>()).Concat(f.Reserve).ToList();
            return Companions.CompanionIds.Where(id => cards.Any(c => Companions.CompanionOf(c) == id)).ToList();
        }

        static void CrewSwap(CampaignState s, string outId)
        {
            var j = s.Joined?.FirstOrDefault();
            if (j?.Swap != true) throw new GameError("No one is waiting to come aboard.");
            var f = Player(s);
            var army = Flagship(s, f.Id);
            string Name(string id) => Builds.D.Companions.First(c => c.Id == id).Name;
            if (outId != null)
            {
                if (!CrewInDeck(s).Contains(outId)) throw new GameError("They are not aboard.");
                var pile = army?.Deck ?? f.Reserve;
                int i = pile.FindIndex(c => Companions.CompanionOf(c) == outId);
                if (i >= 0) pile.RemoveAt(i);
                pile.Add(Builds.D.Companions.First(c => c.Id == j.Id).Card);
                Clog(s, $"{Name(outId)} stands down; {Name(j.Id)} takes their place.", army?.NodeId, f.Id);
            }
            else Clog(s, $"{Name(j.Id)} waits ashore for another run.", army?.NodeId, f.Id);
            s.Joined = s.Joined.Skip(1).ToList();
            if (s.Joined.Count == 0) s.Joined = null;
        }

        static void MeetEngineer(CampaignState s, CampaignNode n)
        {
            var f = Player(s);
            if (f.Human != true || n.Station == null || HasCompanion(s, "engineer")) return;
            if ((s.Run?.Ship?.Fitted?.Count ?? 0) < Companions.EngineerParts) return;
            JoinCompanion(s, "engineer", "Three good parts on a hull like that? Somebody aboard cares. I'm coming with you, Captain. She needs an engineer.");
        }

        static void NoteActs(CampaignState s, GameState game)
        {
            foreach (var id in Companions.CompanionIds)
            {
                Acts a = null;
                game.Acts?.TryGetValue(id, out a);
                int xp = a != null ? Companions.XpFromActs(id, a) : 0;
                if (xp > 0)
                {
                    s.CompanionXp ??= new Dictionary<string, int>();
                    s.CompanionXp.TryGetValue(id, out var had);
                    s.CompanionXp[id] = had + xp;
                }
            }
        }

        public static int CrystalHealth(int universe) => 10 + 4 * (universe - 1);
        public const int CrystalDays = 4;

        /// <summary>A copy of a system to fight at, with nothing of its own in the way (the crystal, a struggle, a fight chosen).</summary>
        static CampaignNode Bare(CampaignNode n)
        {
            var c = Json.Clone(n);
            c.Owner = null;
            c.Station = null;
            c.Vault = null;
            c.Garrison = new List<GarrisonCard>();
            c.Fortification = 0;
            c.Damage = 0;
            c.Star = null;
            return c;
        }

        static int BattleSeed(CampaignState s) => (int)Math.Floor(R(s) * 2147483648.0);

        static void StartCrystal(CampaignState s, Army army, CampaignNode target)
        {
            var f = FactionById(s, army.Owner);
            army.Moved = true;
            s.Crystal = false;
            var me = BattleSetup(s, army, Bare(target))[0];
            var side = new PlayerSetup { Name = "The Crystal Prison", IsAI = true, Deck = new List<string>(), Boss = true, BossLeader = "crystal_prison", BossHealth = CrystalHealth(s.Universe), Tableau = new List<string> { "crystal_prison" } };
            var game = Game.Create(new GameSetup { Seed = BattleSeed(s), Players = new List<PlayerSetup> { me, side }, Campaign = true, Mode = s.Mode, Challenge = new Challenge { Kind = "crystal", Days = CrystalDays, Broken = 0 } });
            Clog(s, $"On the way to {target.Name}, {f.Name}'s flagship finds Kaelen, held in a crystal.", new[] { army.NodeId, target.Id }, f.Id);
            s.Battle = new BattleContext { Attacker = f.Id, Defender = null, FromId = army.NodeId, NodeId = army.NodeId, ArmyId = army.Id, DefenderArmyId = null, Game = game, Crystal = new BattleCrystal { Damage = army.Damage } };
        }

        static bool AttackerWon(GameState game) => !Game.IsDraw(game) && game.WinnerId == game.Players[0].Id;

        static void ResolveCrystal(CampaignState s, GameState game)
        {
            var b = s.Battle;
            s.Battle = null;
            var army = s.Armies.FirstOrDefault(a => a.Id == b.ArmyId);
            bool won = AttackerWon(game);
            if (army != null) army.Damage = won ? Math.Max(Balance.MinHeat, game.Players[0].Heat) : b.Crystal.Damage;
            GainXp(s, won ? T.XpChallenge : T.XpBattleLost);
            if (!won)
            {
                Clog(s, "The crystal holds. Kaelen is lost to sight again.", b.NodeId, b.Attacker);
                return;
            }
            JoinCompanion(s, "lancer", "Free. Free! I knew you would come for me, Captain. Where you fly, my lance flies.");
        }

        // ---- Rifts ----

        static readonly (int n, double r)[] TimeRings = { (4, 420), (5, 720), (6, 1000), (7, 1270) };
        static readonly (int n, double r) TimeArrival = (1, 1500);

        public struct Spun { public double X, Y, A; }

        static Spun SpunAt(int ring, int slot, double turn)
        {
            var Rr = ring > TimeRings.Length ? TimeArrival : TimeRings[ring - 1];
            int dir = ring % 2 != 0 ? -1 : 1;
            double a = 2 * Math.PI * slot / Rr.n + ring * 0.9 + dir * turn * (Math.PI / Rr.n);
            return new Spun { X = T.MapWidth / 2.0 + Math.Cos(a) * Rr.r, Y = T.MapHeight / 2.0 + Math.Sin(a) * Rr.r, A = a };
        }

        static double CentreAngle(CampaignNode n) => Math.Atan2(n.Y - T.MapHeight / 2.0, n.X - T.MapWidth / 2.0);
        static double AngleGap(double a, double b) => Math.Abs(Math.Atan2(Math.Sin(a - b), Math.Cos(a - b)));

        public static void TurnTime(CampaignState s)
        {
            if (s.Rift?.Kind != "time") return;
            var ship = Flagship(s, s.PlayerId);
            var on = ship != null ? s.Nodes.FirstOrDefault(n => n.Id == ship.NodeId)?.SpinRing : null;
            var turns = new Dictionary<int, int>(s.RingSpins ?? new Dictionary<int, int>());
            for (int r = 1; r <= TimeRings.Length; r++)
                if (r != on)
                {
                    turns.TryGetValue(r, out var t);
                    turns[r] = t + 1;
                }
            s.RingSpins = turns;
            SpinGalaxy(s);
        }

        public static void SpinGalaxy(CampaignState s, bool relink = true, Dictionary<int, double> turnsAt = null)
        {
            if (s.Rift?.Kind != "time") return;
            var ringed = s.Nodes.Where(n => n.SpinRing != null).ToList();
            if (ringed.Any(n => n.SpinStep != null))
            {
                var was = new Dictionary<int, int>();
                for (int r = 1; r <= TimeRings.Length; r++)
                {
                    var on = ringed.Where(n => n.SpinRing == r).ToList();
                    was[r] = Round(on.Sum(n => n.SpinStep ?? 0) / Math.Max(1, on.Count));
                }
                foreach (var n in ringed) n.SpinStep = null;
                s.RingSpins = was;
            }
            double At(int ring)
            {
                if (turnsAt != null) return turnsAt.TryGetValue(ring, out var t) ? t : 0;
                return s.RingSpins != null && s.RingSpins.TryGetValue(ring, out var u) ? u : 0;
            }
            foreach (var n in ringed)
            {
                var p = SpunAt(n.SpinRing.Value, n.SpinSlot ?? 0, n.SpinRing.Value > TimeRings.Length ? 0 : At(n.SpinRing.Value));
                n.X = p.X;
                n.Y = p.Y;
            }
            if (!relink) return;
            var heart = s.Nodes.FirstOrDefault(n => n.Heart == true);
            foreach (var n in s.Nodes) n.Links = new List<string>();
            void Lk(CampaignNode a, CampaignNode b)
            {
                if (!a.Links.Contains(b.Id)) a.Links.Add(b.Id);
                if (!b.Links.Contains(a.Id)) b.Links.Add(a.Id);
            }
            List<CampaignNode> Ring(int r) => ringed.Where(n => n.SpinRing == r).OrderBy(n => n.SpinSlot ?? 0).ToList();
            for (int r = 1; r <= TimeRings.Length; r++)
            {
                var stars = Ring(r);
                if (stars.Count > 1) for (int i = 0; i < stars.Count; i++) Lk(stars[i], stars[(i + 1) % stars.Count]);
            }
            if (heart != null) foreach (var n in Ring(1)) Lk(n, heart);
            foreach (var n in Ring(TimeRings.Length + 1))
            {
                CampaignNode near = null;
                foreach (var m in Ring(TimeRings.Length))
                    if (near == null || AngleGap(CentreAngle(n), CentreAngle(m)) < AngleGap(CentreAngle(n), CentreAngle(near))) near = m;
                if (near != null) Lk(n, near);
            }
            for (int r = 2; r <= TimeRings.Length; r++)
            {
                var outer = Ring(r);
                var inner = Ring(r - 1);
                double within = Math.PI / TimeRings[r - 2].n / 2;
                CampaignNode bo = null, bi = null;
                double bg = 0;
                bool any = false;
                foreach (var o in outer)
                    foreach (var i in inner)
                    {
                        double g = AngleGap(CentreAngle(o), CentreAngle(i));
                        if (g <= within)
                        {
                            Lk(o, i);
                            any = true;
                        }
                        if (bo == null || g < bg) { bo = o; bi = i; bg = g; }
                    }
                if (!any && bo != null) Lk(bo, bi);
            }
        }

        public class Preview { public string Id; public double X, Y; }

        public static List<Preview> TimePreview(CampaignState s, string toId)
        {
            if (s.Rift?.Kind != "time") return new List<Preview>();
            var ahead = Json.Clone(s);
            var ship = Flagship(ahead, ahead.PlayerId);
            var to = ahead.Nodes.FirstOrDefault(n => n.Id == toId);
            if (ship == null || to == null || to.SpinRing == null) return new List<Preview>();
            ship.NodeId = toId;
            TurnTime(ahead);
            var there = ahead.Nodes.First(n => n.Id == toId);
            return there.Links.Select(id => ahead.Nodes.First(n => n.Id == id)).Where(n => (n.SpinRing ?? 0) < (there.SpinRing ?? 0) && n.Heart != true).Select(n => new Preview { Id = n.Id, X = n.X, Y = n.Y }).ToList();
        }

        static CampaignNode RiftNode(CampaignState s, HashSet<string> used, double x, double y, int tier, int col, double lane)
        {
            var name = NodeName(s, used);
            int n = 2 + RInt(s, 2);
            var planets = new List<MapPlanet>();
            for (int j = 0; j < n; j++) planets.Add(new MapPlanet { Name = $"{name} {Numerals[j]}", Tint = Tints[RInt(s, Tints.Length)] });
            return new CampaignNode
            {
                Id = $"n{s.Nodes.Count}",
                Name = name,
                X = x,
                Y = y,
                Planets = planets,
                Owner = null,
                Links = new List<string>(),
                Fortification = 0,
                Damage = 0,
                Garrison = new List<GarrisonCard>(),
                Hazard = new List<string>(),
                Yield = new NodeYield { Materials = 5 + RInt(s, 4) + tier },
                Tier = tier,
                Col = col,
                Lane = lane,
            };
        }

        static void BuildRift(CampaignState s, string kind)
        {
            var me = Player(s);
            s.Rift = new CampaignRift { Kind = kind };
            s.UniverseStart = s.Turn;
            s.CollapseCol = 0;
            s.Conquered = 0;
            s.Nodes = new List<CampaignNode>();
            s.Armies = s.Armies.Where(a => a.Owner == me.Id).ToList();
            s.Galaxy = null;
            s.Terrain = "flat";
            s.Spin = 0;
            s.RingSpins = new Dictionary<int, int>();
            var used = new HashSet<string>();
            int tier = 2 * (s.Universe - 1) + 3;
            double W = T.MapWidth, H = T.MapHeight;
            int jumps = Rifts.RiftJumps;
            CampaignNode home;
            var heart = RiftNode(s, used, W / 2, H / 2, tier + 1, jumps, 0);
            heart.Name = Cards.Def(Rifts.ByKind[kind].Ruler).Name;
            heart.Planets = new List<MapPlanet>();
            heart.Yield = new NodeYield { Materials = 0 };
            heart.Heart = true;
            if (kind == "dark")
            {
                s.Layout = "strip";
                int L = 2, C = jumps;
                MapAt Place(int c, double l) => new MapAt { X = T.MapMargin + 600 + c * T.ColGap, Y = H / 2 + (l - (L - 1) / 2.0) * T.LaneGap * 1.2 + Round((R(s) - 0.5) * 80) };
                var p0 = Place(0, (L - 1) / 2.0);
                home = RiftNode(s, used, p0.X, p0.Y, tier, 0, 0);
                s.Nodes.Add(home);
                var grid = new CampaignNode[C][];
                for (int c = 1; c < C; c++)
                {
                    grid[c] = new CampaignNode[L];
                    for (int l = 0; l < L; l++)
                    {
                        var p = Place(c, l);
                        var n = RiftNode(s, used, p.X, p.Y, tier, c, l);
                        grid[c][l] = n;
                        s.Nodes.Add(n);
                    }
                }
                var ph = Place(C, (L - 1) / 2.0);
                heart.Id = $"n{s.Nodes.Count}";
                heart.X = ph.X;
                heart.Y = ph.Y;
                heart.Col = C;
                s.Nodes.Add(heart);
                void Lk(CampaignNode a, CampaignNode b)
                {
                    a.Links.Add(b.Id);
                    b.Links.Add(a.Id);
                }
                for (int l = 0; l < L; l++) Lk(home, grid[1][l]);
                for (int c = 1; c < C; c++)
                {
                    for (int l = 0; l < L; l++) Lk(grid[c][l], c + 1 < C ? grid[c + 1][l] : heart);
                    if (c + 1 < C)
                    {
                        var from = grid[c][R(s) < 0.5 ? 0 : 1];
                        var to = grid[c + 1][R(s) < 0.5 ? 0 : 1];
                        Lk(from, to);
                    }
                }
                foreach (var n in s.Nodes) n.Links = n.Links.Distinct().ToList();
                if (R(s) < 0.6)
                {
                    int c = 1 + RInt(s, C - 2);
                    grid[c][RInt(s, L)].Prophet = true;
                }
            }
            else
            {
                s.Layout = "ring";
                heart.X = W / 2;
                heart.Y = H / 2;
                heart.Col = jumps;
                s.Nodes.Add(heart);
                var p0 = SpunAt(TimeRings.Length + 1, 0, 0);
                home = RiftNode(s, used, p0.X, p0.Y, tier, 0, 0);
                home.SpinRing = TimeRings.Length + 1;
                home.SpinSlot = 0;
                s.Nodes.Add(home);
                for (int i = 0; i < TimeRings.Length; i++)
                {
                    int ring = i + 1;
                    for (int j = 0; j < TimeRings[i].n; j++)
                    {
                        var p = SpunAt(ring, j, 0);
                        var n = RiftNode(s, used, p.X, p.Y, tier, jumps - ring, j);
                        n.SpinRing = ring;
                        n.SpinSlot = j;
                        s.Nodes.Add(n);
                    }
                }
            }
            home.Owner = me.Id;
            home.Home = me.Id;
            home.Yield = new NodeYield { Materials = 0 };
            var army = Flagship(s, me.Id);
            if (army != null)
            {
                army.NodeId = home.Id;
                army.Moved = false;
                army.Refit = false;
                army.Steps = 0;
            }
            else RaiseArmy(s, me, me.Hero ?? Story.Generals[me.Race][0], home.Id);
            bool OpenR(CampaignNode n) => n.Home == null && n.Heart != true && n.Prophet != true;
            var mid = Shuffle(s, s.Nodes.Where(n => OpenR(n) && (n.Col ?? 0) >= 1 && (n.Col ?? 0) <= jumps - 2).ToList());
            if (mid.Count > 0) mid[0].Station = new Station { Kind = "armory", Cards = ArmoryStock(s, mid[0]) };
            if (mid.Count > 1) mid[1].Station = new Station { Kind = "research", Options = PickResearch(s, new HashSet<string>(me.Research?.Done ?? new List<string>())) };
            var lost = kind == "dark" ? "shade" : "seer";
            var host = mid.Skip(2).FirstOrDefault();
            if (me.Human == true && host != null && !HasCompanion(s, lost)) host.Encounter = kind == "dark" ? "exile" : "stillness";
            SpinGalaxy(s);
            Clog(s, $"{me.Name} comes through the rift into {Rifts.ByKind[kind].Name}. {Rifts.ByKind[kind].Text}");
        }

        static void EnterRift(CampaignState s, Army army, CampaignNode target)
        {
            var kind = target.Challenge.Rift ?? "dark";
            target.Challenge.Done = "won";
            army.Moved = true;
            Clog(s, $"{ArmyLeader(army)} enters the rift at {target.Name}.", target.Id, army.Owner);
            BuildRift(s, kind);
        }

        static void DarkenBehind(CampaignState s)
        {
            if (s.Rift?.Kind != "dark") return;
            var ship = Flagship(s, s.PlayerId);
            if (ship == null) return;
            int col = NodeById(s, ship.NodeId).Col ?? 0;
            foreach (var n in s.Nodes) if ((n.Col ?? 0) < col && n.Id != ship.NodeId) n.Vanished = true;
        }

        static List<ProphetOffer> ProphetOffers(CampaignState s, Army army)
        {
            var cards = Shuffle(s, army.Deck.Distinct().ToList()).Where(id => Rifts.MarksFor(Cards.Def(id)).Count > 0).ToList();
            return cards.Take(3).Select(card =>
            {
                var marks = Rifts.MarksFor(Cards.Def(card));
                return new ProphetOffer { Card = card, Mark = marks[RInt(s, marks.Count)] };
            }).ToList();
        }

        static List<Relic> SerenEmblems(CampaignState s)
        {
            var names = new Dictionary<string, string> { ["paradise"] = "Paradise Seed", ["orbitShift"] = "Tidecaller's Astrolabe", ["starsworn"] = "Starsworn Circlet" };
            return Relics.SerenPowers.Select(power =>
            {
                int n = Relics.Powers[power].Amounts[2];
                return new Relic { Id = $"item{++s.UidCounter}", Name = names.TryGetValue(power, out var nm) ? nm : power, Slot = "star", Rarity = "anomaly", Boons = new List<string>(), Power = power, N = n, Text = Relics.Powers[power].Text(n) };
            }).ToList();
        }

        static List<string> RiftDeck(CampaignState s, CampaignNode n)
        {
            int race = RiftRace(s).Value;
            var pool = Shuffle(s, Pool.Where(c => c.Race == race && c.Kind != "command" && c.Rarity != "enigma" && RiftLegal(s, c.Id)).Select(c => c.Id).ToList());
            int size = n.Heart == true ? 20 : Math.Min(20, T.EnemyDeck + 6);
            var deck = new List<string>();
            for (int i = 0; deck.Count < size && i < pool.Count * 2; i++)
            {
                var id = pool[i % pool.Count];
                if (deck.Count(x => x == id) < CopyLimit(id)) deck.Add(id);
            }
            return deck;
        }

        // ---- Power Struggles ----

        public const double StruggleChance = 0.3;

        public static int FlagshipMaxHealth(CampaignState s, Army army) => Balance.SupernovaAt + (ArmyBonusOf(s, army).Mods.MaxHealthDelta ?? 0) + (FlagshipSetup(s, army).Hull.MaxHealthDelta ?? 0);

        public static bool FlagshipOverheated(CampaignState s, Army army) => army.Damage * 2 >= FlagshipMaxHealth(s, army);

        public static string StruggleRival(CampaignState s, Army army)
        {
            var f = FactionById(s, army.Owner);
            var waiting = new HashSet<string>(s.Nodes.Where(n => !string.IsNullOrEmpty(n.Rival)).Select(n => n.Rival));
            var pool = f.Human == true ? Modes.CoreRaces.SelectMany(r => Story.Generals[r]).ToList() : (f.Race < Story.Generals.Count ? Story.Generals[f.Race] : new List<string>());
            var free = pool.Where(h => h != army.General && !army.Deck.Contains(h) && !f.Reserve.Contains(h) && s.Slain?.Contains(h) != true && !waiting.Contains(h) && s.Beaten?.Hero != h).ToList();
            return free.Count > 0 ? free[RInt(s, free.Count)] : null;
        }

        public const int ExtrasFrom = 2, ExtrasMost = 2;
        public const double ExtrasRival = 0.25, ExtrasDream = 0.25, ExtrasSecret = 0.3;

        public static (int rival, int dream, int secret) RollExtras(CampaignState s, int universe)
        {
            if (universe < ExtrasFrom) return (0, 0, 0);
            var hit = new List<string>();
            if (R(s) < ExtrasRival) hit.Add("rival");
            if (R(s) < ExtrasDream) hit.Add("dream");
            if (R(s) < ExtrasSecret) hit.Add("secret");
            var picked = Shuffle(s, hit.ToList()).Take(ExtrasMost).ToList();
            return (picked.Contains("rival") ? 1 : 0, picked.Contains("dream") ? 1 : 0, picked.Contains("secret") ? 1 : 0);
        }

        public const double AmbushChance = 0.02;

        static void RivalHere(CampaignState s, Army army)
        {
            if (army.Owner != s.PlayerId || army.Lost != null || s.Struggle != null || s.Beaten != null) return;
            var n = NodeById(s, army.NodeId);
            if (string.IsNullOrEmpty(n.Rival)) return;
            s.Struggle = new StruggleWaiting { NodeId = n.Id, Hero = n.Rival };
            n.Rival = null;
        }

        static void PlaceRivals(CampaignState s, int count)
        {
            var me = Player(s);
            var army = Flagship(s, me.Id);
            if (me.Human != true || army == null || s.Rift != null) return;
            var open = s.Nodes.Where(n => n.Home == null && n.Heart != true && n.Challenge == null && n.Station == null && n.Prophet != true && (n.Col ?? 0) >= 2).ToList();
            foreach (var n in Shuffle(s, open).Take(count).ToList())
            {
                var hero = StruggleRival(s, army);
                if (hero != null) n.Rival = hero;
            }
        }

        static readonly string[] CaptainTaunts =
        {
            "A human, flying a ship like that, this close to the Heart? The light deserves better. I am taking her.",
            "Your ship runs hot and stupid, human. In my hands she will burn true. Stand aside, or burn with her.",
            "The tide has carried you far enough, little human. Your ship is mine now.",
            "Such a fine hull, and only one of you to fill it. We will take it, and grow.",
        };

        public static string StruggleLine(string hero, bool human = false)
        {
            if (human)
            {
                int i = Story.Generals.FindIndex(g => g.Contains(hero));
                return i >= 0 && i < CaptainTaunts.Length ? CaptainTaunts[i] : "That ship is wasted on a human. I am taking it.";
            }
            return Story.StruggleLines.TryGetValue(hero, out var line) ? line : "Your star is failing, and so are you. You are not fit to lead.";
        }

        static void StartStruggle(CampaignState s)
        {
            var p = s.Struggle;
            s.Struggle = null;
            var f = Player(s);
            var army = Flagship(s, f.Id);
            if (army == null) return;
            var n = NodeById(s, p.NodeId);
            var me = BattleSetup(s, army, Bare(n))[0];
            var deckAt = Json.Clone(n);
            deckAt.Heart = false;
            deckAt.Tier = Math.Max(n.Tier, 1);
            var strongAt = Json.Clone(n);
            strongAt.Tier = Math.Max(n.Tier, 2);
            var own = f.Race < Story.Generals.Count ? Story.Generals[f.Race] : new List<string>();
            var rival = new PlayerSetup
            {
                Name = Cards.Def(p.Hero).Name,
                IsAI = true,
                Deck = StationDeck(s, deckAt, f.Race).Where(id => !own.Contains(id)).ToList(),
                Hero = p.Hero,
                HeroStats = new HeroStats { Attack = T.HeroAttack, Defence = T.HeroDefence },
                Tableau = new List<string> { p.Hero },
                Rooms = StationRooms(strongAt),
                Modifiers = SunBase(strongAt),
            };
            var game = Game.Create(new GameSetup { Seed = BattleSeed(s), Players = new List<PlayerSetup> { me, rival }, Campaign = true, Mode = s.Mode });
            Clog(s, $"{Cards.Def(p.Hero).Name} comes for {f.Name}'s command.", n.Id, f.Id);
            s.Battle = new BattleContext { Attacker = f.Id, Defender = null, FromId = n.Id, NodeId = n.Id, ArmyId = army.Id, DefenderArmyId = null, Game = game, Struggle = new BattleStruggle { Hero = p.Hero, Damage = army.Damage } };
        }

        static void ResolveStruggle(CampaignState s, GameState game)
        {
            var b = s.Battle;
            s.Battle = null;
            var f = FactionById(s, b.Attacker);
            var army = s.Armies.FirstOrDefault(a => a.Id == b.ArmyId);
            var hero = b.Struggle.Hero;
            bool won = AttackerWon(game);
            GainXp(s, won ? T.XpChallenge : T.XpBattleLost);
            if (!won)
            {
                Clog(s, $"{Cards.Def(hero).Name} takes the command. {f.Name}'s run is over.", b.NodeId, f.Id);
                PlayerFalls(s);
                return;
            }
            if (army != null) army.Damage = Math.Max(Balance.MinHeat, game.Players[0].Heat);
            if (f.Human == true)
            {
                s.Beaten = new BeatenHero { NodeId = b.NodeId, Hero = hero };
                Clog(s, $"{Cards.Def(hero).Name} is beaten, and kneels before the Captain.", b.NodeId, f.Id);
                return;
            }
            if (army != null) army.Deck.Add(hero);
            else f.Reserve.Add(hero);
            Clog(s, $"{Cards.Def(hero).Name} is beaten, and bends the knee: they join {f.Name}'s flagship.", b.NodeId, f.Id);
        }

        // ---- Story encounters ----

        public static int HuntersStage(CampaignState s) => (s.Run?.Hunters ?? 0) + (s.Hunted ?? 0);

        static void PlaceEncounters(CampaignState s)
        {
            var me = Player(s);
            if (me.Human != true || s.Rift != null) return;
            int C = s.Nodes.Max(n => n.Col ?? 0);
            var open = s.Nodes.Where(n => n.Home == null && n.Heart != true && n.Challenge == null && n.Station == null && n.Prophet != true && string.IsNullOrEmpty(n.Rival) && n.Cache == null && n.Dream != true && (n.Col ?? 0) >= 1 && (n.Col ?? 0) <= C - 1).ToList();
            var kinds = Shuffle(s, new List<string> { "merchant", "pirates" });
            if (HasCompanion(s, "lancer") && HuntersStage(s) < Encounters.HunterStages) kinds.Insert(0, "hunters");
            int i = 0;
            foreach (var n in Shuffle(s, open).Take(Encounters.EncountersPerGalaxy).ToList())
            {
                n.Encounter = kinds[i % kinds.Count];
                i++;
            }
        }

        static void MeetEncounter(CampaignState s, Faction f, CampaignNode n)
        {
            var kind = n.Encounter;
            n.Encounter = null;
            n.Owner = f.Id;
            n.Yield = new NodeYield { Materials = 0 };
            int stage = kind == "hunters" ? HuntersStage(s) : 0;
            s.Encounter = new EncounterPlaying { NodeId = n.Id, Kind = kind, Price = Encounters.EncounterPrice(kind, s.Universe, stage), Stage = stage };
            Clog(s, $"{Encounters.VisitorName(kind, stage)} come{(kind == "merchant" ? "s" : "")} alongside at {n.Name}.", n.Id, f.Id);
        }

        public static string EncounterProblem(CampaignState s, string choice)
        {
            var e = s.Encounter;
            if (e == null) return "There is no one alongside.";
            if (choice == "done") return e.Outcome != null ? null : "Decide first.";
            if (e.Outcome != null) return "That is decided.";
            if (!Encounters.EncounterChoices(e.Kind, e.Price, e.Stage).Any(c => c.Id == choice)) return "That is not on offer.";
            if ((choice == "buy" || choice == "pay") && Player(s).Materials < e.Price) return "Not enough materials";
            if (choice == "fight" && Flagship(s, s.PlayerId) == null) return "You have no flagship.";
            return null;
        }

        static void ChooseEncounter(CampaignState s, string choice)
        {
            var why = EncounterProblem(s, choice);
            if (why != null) throw new GameError(why);
            var e = s.Encounter;
            var f = Player(s);
            if (choice == "done")
            {
                s.Encounter = null;
                return;
            }
            if (choice == "fight")
            {
                StartEncounterFight(s);
                return;
            }
            if (choice == "free")
            {
                e.Outcome = "joined";
                JoinCompanion(s, "seer", "The hour moves again. I am Ilyra, and I have read this ending too many times. Let us write another.");
                return;
            }
            if (choice == "leave")
            {
                e.Outcome = "declined";
                return;
            }
            f.Materials -= e.Price;
            if (choice == "pay")
            {
                e.Outcome = "paid";
                Clog(s, $"{f.Name} pays {Encounters.VisitorName(e.Kind, e.Stage)} {e.Price} materials.", e.NodeId, f.Id);
                return;
            }
            string part = null;
            if (R(s) < Encounters.CurioGood) part = Parts.NewCurio((s.Run?.Hangar ?? new List<string>()).Concat(s.PartsFound ?? new List<string>()).ToList(), R(s));
            if (part != null)
            {
                e.Outcome = "good";
                e.Part = part;
                (s.PartsFound ??= new List<string>()).Add(part);
                Clog(s, $"The merchant's device works: {Parts.ShipPart(part).Name}.", e.NodeId, f.Id);
                return;
            }
            e.Outcome = "bad";
            e.Slot = RInt(s, Balance.TableauSlots);
            s.WreckedSlot = e.Slot;
            Clog(s, $"The merchant's device explodes aboard: slot {e.Slot + 1} is wrecked until a space station.", e.NodeId, f.Id);
        }

        static void StartEncounterFight(CampaignState s)
        {
            var e = s.Encounter;
            var f = Player(s);
            var army = Flagship(s, f.Id);
            var n = NodeById(s, e.NodeId);
            int tier = Math.Max(1, n.Tier + 1 + (e.Kind == "hunters" ? e.Stage : 0));
            var at = Bare(n);
            at.Tier = tier;
            at.Heart = false;
            var me = BattleSetup(s, army, at)[0];
            var foe = new PlayerSetup
            {
                Name = Encounters.VisitorName(e.Kind, e.Stage),
                IsAI = true,
                Deck = StationDeck(s, at, e.Kind == "hunters" ? 0 : (int?)null),
                Rooms = StationRooms(at),
                Modifiers = SunBase(at),
            };
            var game = Game.Create(new GameSetup { Seed = BattleSeed(s), Players = new List<PlayerSetup> { me, foe }, Campaign = true, Mode = s.Mode });
            Clog(s, $"{f.Name} fights {Encounters.VisitorName(e.Kind, e.Stage)}.", n.Id, f.Id);
            s.Battle = new BattleContext { Attacker = f.Id, Defender = null, FromId = n.Id, NodeId = n.Id, ArmyId = army.Id, DefenderArmyId = null, Game = game, Encounter = new BattleEncounter { Kind = e.Kind, Stage = e.Stage, Price = e.Price } };
        }

        static void ResolveEncounterFight(CampaignState s, GameState game)
        {
            var b = s.Battle;
            s.Battle = null;
            var f = Player(s);
            var army = s.Armies.FirstOrDefault(a => a.Id == b.ArmyId);
            bool won = AttackerWon(game);
            if (army != null) army.Damage = Math.Min(T.MaxDamage, Math.Max(Balance.MinHeat, game.Players[0].Heat));
            GainXp(s, won ? T.XpChallenge : T.XpBattleLost);
            var kind = b.Encounter.Kind;
            int stage = b.Encounter.Stage, price = b.Encounter.Price;
            if (s.Encounter != null) s.Encounter.Outcome = won ? "won" : "lost";
            if (kind == "pirates")
            {
                var before = LootMark(s);
                if (won) f.Materials += price;
                else f.Materials = Math.Max(0, f.Materials - price);
                if (won) s.Loot = LootSince(s, before, true);
                Clog(s, won ? $"{f.Name} beats the pirates and takes their hold: {price} materials." : $"The pirates take {f.Name}'s materials.", b.NodeId, f.Id);
                return;
            }
            if (kind == "exile")
            {
                if (won) JoinCompanion(s, "shade", "They are gone. For now. I am Nyss, Captain, and my blade is yours.");
                Clog(s, won ? "The Nyxari hunters are driven off." : "The Nyxari take their exile back into the dark.", b.NodeId, f.Id);
                return;
            }
            if (!won)
            {
                Clog(s, $"{Encounters.VisitorName(kind, stage)} fall back. They will come for Kaelen again.", b.NodeId, f.Id);
                return;
            }
            s.Hunted = (s.Hunted ?? 0) + 1;
            s.CompanionXp ??= new Dictionary<string, int>();
            s.CompanionXp.TryGetValue("lancer", out var lx);
            s.CompanionXp["lancer"] = lx + 40 * (stage + 1);
            Clog(s, stage >= Encounters.HunterStages - 1 ? "The Solarch's Executioner falls. No one will come for Kaelen again." : $"{Encounters.VisitorName(kind, stage)} are beaten.", b.NodeId, f.Id);
        }

        public const double PartChanceSlay = 0.5, PartChanceDream = 0.35, PartChanceVault = 0.3;

        static string FindPart(CampaignState s, double chance, bool boss = false)
        {
            var f = Player(s);
            if (f.Human != true || R(s) >= chance) return null;
            var held = (s.Run?.Hangar ?? new List<string>()).Concat(s.PartsFound ?? new List<string>()).ToList();
            var rarity = Parts.PartRarity(s.Universe, R(s), boss);
            var id = Parts.NewPart(held, rarity, R(s));
            if (id == null) return null;
            (s.PartsFound ??= new List<string>()).Add(id);
            Clog(s, $"{f.Name} salvages a ship part: {Parts.ShipPart(id).Name}.", (string)null, f.Id);
            return id;
        }

        public const int SlayMaterials = 10, SlayPerGalaxy = 4, SlayPetals = 2, SlayCards = 3;

        static void DecideBeaten(CampaignState s, bool recruit)
        {
            var p = s.Beaten;
            s.Beaten = null;
            var f = Player(s);
            var army = Flagship(s, f.Id);
            var name = Cards.Def(p.Hero).Name;
            if (recruit)
            {
                if (army != null) army.Deck.Add(p.Hero);
                else f.Reserve.Add(p.Hero);
                Clog(s, $"{name} joins the Captain's ship.", p.NodeId, f.Id);
                s.Spared = (s.Spared ?? 0) + 1;
                if ((s.Run?.Spared ?? 0) + s.Spared >= Companions.DefectorSpared) JoinCompanion(s, "defector", "You spare the ones you beat. My Hierarch never spared anyone. I tore out his shard. Let me fight for you, human.");
                return;
            }
            (s.Slain ??= new List<string>()).Add(p.Hero);
            int materials = SlayMaterials + SlayPerGalaxy * (s.Universe - 1);
            f.Materials += materials;
            s.Petals += SlayPetals;
            var race = Cards.Def(p.Hero).Race;
            var rares = Shuffle(s, Pool.Where(c => c.Race == race && c.Kind != "command" && (c.Rarity == "stellar" || c.Rarity == "anomaly") && c.Fusion != true && LegalIn(s.Mode, c.Id)).Select(c => c.Id).ToList()).Take(SlayCards).ToList();
            if (rares.Count > 0) s.CardRewards.Add(new CardReward { Source = $"{name}'s hoard", Options = rares, ToDeck = army?.Id });
            FindPart(s, PartChanceSlay);
            Clog(s, $"{name} is slain. The Captain takes their hoard: {materials} materials and {SlayPetals} petals.", p.NodeId, f.Id);
        }

        // ---- Dreams of the Lost ----

        public static int DreamTier(CampaignState s) => Math.Min(4, s.Universe);
        public static double DreamAnomalyChance(int universe) => universe <= 2 ? 0 : 1 - Math.Pow(0.9, universe - 2);

        static int? enigmaFrom;
        public static int EnigmaFrom
        {
            get
            {
                if (enigmaFrom == null)
                {
                    int u = 1;
                    while (DreamAnomalyChance(u) < 0.5) u++;
                    enigmaFrom = u;
                }
                return enigmaFrom.Value;
            }
        }

        public static double EnigmaChance(int universe, bool hard = false)
        {
            if (universe < EnigmaFrom) return 0;
            double b = Math.Min(0.04, 0.01 + 0.005 * (universe - EnigmaFrom));
            return hard ? b * 3 : b;
        }

        static List<string> WithEnigma(CampaignState s, List<string> options, bool hard)
        {
            double chance = EnigmaChance(s.Universe, hard);
            if (chance == 0 || options.Count == 0 || R(s) >= chance) return options;
            var f = Player(s);
            var held = new HashSet<string>(f.Reserve.Concat(s.Armies.Where(a => a.Owner == f.Id).SelectMany(a => a.Deck)));
            var free = D.EnigmaIds.Where(id => !held.Contains(id)).ToList();
            if (free.Count == 0) return options;
            var id = free[RInt(s, free.Count)];
            Clog(s, $"Something impossible glimmers among the spoils: {Cards.Def(id).Name}.", (string)null, f.Id);
            return options.Take(options.Count - 1).Concat(new[] { id }).ToList();
        }

        static string PickDream(CampaignState s)
        {
            int race = Player(s).Race;
            for (int t = DreamTier(s); t >= 1; t--)
            {
                var fits = DreamsData.Dreams.Where(d => d.Tier == t && d.Race != race).ToList();
                if (fits.Count > 0) return fits[RInt(s, fits.Count)].Id;
            }
            return null;
        }

        static void DreamHere(CampaignState s, Army army)
        {
            if (army.Owner != s.PlayerId || army.Lost != null || s.Dream != null) return;
            var n = NodeById(s, army.NodeId);
            if (n.Dream != true) return;
            n.Dream = false;
            var id = PickDream(s);
            if (id != null) s.Dream = new DreamWaiting { NodeId = n.Id, Id = id };
        }

        static void StartDream(CampaignState s)
        {
            var p = s.Dream;
            s.Dream = null;
            var f = Player(s);
            var army = Flagship(s, f.Id);
            var spec = DreamsData.Dreams.FirstOrDefault(d => d.Id == p.Id);
            if (army == null || spec == null) return;
            var game = Game.CreateDream(spec, BattleSeed(s), $"{f.Name} (dreaming)", "The Dream", s.Mode);
            Clog(s, $"{f.Name} drifts into a sorrowful slumber.", p.NodeId, f.Id);
            s.Battle = new BattleContext { Attacker = f.Id, Defender = null, FromId = p.NodeId, NodeId = p.NodeId, ArmyId = army.Id, DefenderArmyId = null, Game = game, Dream = new BattleDream { Id = spec.Id, Damage = army.Damage } };
        }

        static List<string> DreamCards(CampaignState s, int tier = 1)
        {
            var f = Player(s);
            List<string> Of(string r) => Shuffle(s, Pool.Where(c => (c.Rarity ?? "dwarf") == r && c.Kind != "command" && c.Kind != "global" && c.Fusion != true && RewardRace(f, c.Race) && LegalIn(s.Mode, c.Id)).Select(c => c.Id).ToList());
            var stellar = Of("stellar");
            var anomaly = Of("anomaly");
            var o = new List<string>();
            while (o.Count < T.CardChoices + (s.Run?.Choices ?? 0))
            {
                var poolNow = R(s) < DreamAnomalyChance(s.Universe) && anomaly.Count > 0 ? anomaly : stellar;
                if (poolNow.Count == 0) break;
                var id = poolNow[0];
                poolNow.RemoveAt(0);
                o.Add(id);
            }
            return WithEnigma(s, o, tier >= 3);
        }

        static void ResolveDream(CampaignState s, GameState game)
        {
            var b = s.Battle;
            s.Battle = null;
            var f = FactionById(s, b.Attacker);
            var army = s.Armies.FirstOrDefault(a => a.Id == b.ArmyId);
            if (army != null) army.Damage = b.Dream.Damage;
            if (!AttackerWon(game))
            {
                Clog(s, $"{f.Name} wakes, the dream unsolved.", b.NodeId, f.Id);
                return;
            }
            int tier = DreamsData.Dreams.FirstOrDefault(d => d.Id == b.Dream.Id)?.Tier ?? 1;
            int petals = 2 + 2 * tier;
            s.Petals += petals;
            GainXp(s, T.XpChallenge);
            Clog(s, $"{f.Name} wakes from the dream with {petals} Stellari petals.", b.NodeId, f.Id);
            FindPart(s, PartChanceDream);
            var options = DreamCards(s, tier);
            if (options.Count > 0) s.CardRewards.Add(new CardReward { Source = "The Dreams of the Lost", Options = options, ToDeck = army?.Id, Take = "dreams up" });
        }

        static Army RaiseArmy(CampaignState s, Faction f, string general, string nodeId)
        {
            var army = new Army { Id = $"army{++s.UidCounter}", Owner = f.Id, General = general, NodeId = nodeId, Deck = f.Human == true ? CaptainDeck(general) : ArmyDeck(f.Race, general, s.Mode), Damage = 0, Moved = false };
            s.Armies.Add(army);
            return army;
        }

        static void Tell(CampaignState s, StoryScene scene)
        {
            if (s.Story.Told.Contains(scene.Id)) return;
            s.Story.Told.Add(scene.Id);
            s.Story.Queue.Add(scene);
        }

        static void NoticeStory(CampaignState s)
        {
            var me = Player(s);
            if (me.Eliminated) return;
            var seen = VisibleNodes(s, me.Id);
            var myGeneral = ArmiesOf(s, me.Id).FirstOrDefault()?.General ?? Story.Generals[me.Race][0];
            foreach (var id in seen)
            {
                var n = NodeById(s, id);
                if ((n.Stellaria ?? 0) > 0) Tell(s, Story.StellariaSightedScene());
                if (n.Heart == true) Tell(s, Story.HeartSightedScene());
                var here = ArmyAt(s, id);
                if (here?.Lost != null) Tell(s, Story.LostSightedScene(here.Lost));
                string rivalId = n.Owner != null && n.Owner != me.Id ? n.Owner : here?.Owner != me.Id ? here?.Owner : null;
                if (rivalId != null && rivalId != "lost" && !s.Story.Told.Contains($"contact:{rivalId}"))
                {
                    var rival = FactionById(s, rivalId);
                    var rivalGeneral = ArmiesOf(s, rival.Id).FirstOrDefault()?.General ?? Story.Generals[rival.Race][0];
                    Tell(s, Story.ContactScene(rival.Race, rivalGeneral, rival.Id, myGeneral, me.Id));
                }
            }
        }

        static double Hops(CampaignState s, string from, string to)
        {
            var seen = new Dictionary<string, int> { [from] = 0 };
            var queue = new Queue<string>();
            queue.Enqueue(from);
            while (queue.Count > 0)
            {
                var id = queue.Dequeue();
                if (id == to) return seen[id];
                foreach (var next in NodeById(s, id).Links)
                    if (!seen.ContainsKey(next) && NodeById(s, next).Collapsed != true)
                    {
                        seen[next] = seen[id] + 1;
                        queue.Enqueue(next);
                    }
            }
            return double.PositiveInfinity;
        }

        static void Clog(CampaignState s, string text, string at = null, string who = null) => Clog(s, text, at == null ? null : new[] { at }, who);

        static void Clog(CampaignState s, string text, IEnumerable<string> at, string who = null)
        {
            s.LogSeq += 1;
            s.Log.Add(new CampaignLogEntry { Seq = s.LogSeq, Turn = s.Turn, Text = text, At = at?.ToList(), Who = who });
            if (s.Log.Count > 200) s.Log.RemoveRange(0, s.Log.Count - 200);
        }

        // ---- Rewards ----

        static List<string> RiftPool(CampaignState s)
        {
            var race = RiftRace(s);
            if (race == null) return null;
            return Pool.Where(c => c.Race == race && c.Kind != "command" && RiftLegal(s, c.Id)).SelectMany(c => Enumerable.Repeat(c.Id, OfferWeight(c.Rarity ?? "dwarf", s.Universe + 2))).ToList();
        }

        public static bool RewardRace(Faction f, int? race)
        {
            if (race == null) return true;
            return f.Human == true ? Modes.CoreRaces.Contains(race.Value) : race == f.Race;
        }

        public static double RaceWeight(Faction f, int? race)
        {
            if (race == null) return 1;
            if (f.Human != true) return race == f.Race ? 2 : 1;
            var a = f.Affinity;
            return 1 + (a != null && race == a.Primary ? a.PrimaryBoost : 0) + (a != null && race == a.Secondary ? a.SecondaryBoost : 0);
        }

        static List<string> OfferPool(Faction f, string mode, int universe = 1)
        {
            bool Hero(CardDef c) => c.Kind == "command" && (f.Human == true || (f.Race < Story.Generals.Count && Story.Generals[f.Race].Contains(c.Id)));
            return Pool.Where(c => !Hero(c) && RewardRace(f, c.Race) && LegalIn(mode, c.Id)).SelectMany(c =>
            {
                double n = OfferWeight(c.Rarity ?? "dwarf", universe) * RaceWeight(f, c.Race);
                return Enumerable.Repeat(c.Id, Math.Max(1, Round(n)));
            }).ToList();
        }

        public static int OfferWeight(string rarity, int universe)
        {
            int on = Math.Max(0, universe - 1);
            return D.OfferWeight[rarity] * 2 + (rarity == "stellar" ? on : rarity == "anomaly" ? Round(on * 0.6) : 0);
        }

        static List<CardDef> stock;
        static List<CardDef> Stock => stock ??= Pool.Where(c => c.Kind != "command" && c.Kind != "global" && c.Fusion != true).ToList();

        static List<string> ArmoryStock(CampaignState s, CampaignNode n)
        {
            bool near = DeepIn(s, n);
            var race = RiftRace(s);
            List<string> Of(string r) => Shuffle(s, Stock.Where(c => (c.Rarity ?? "dwarf") == r && RiftLegal(s, c.Id) && (race == null || c.Race == race)).Select(c => c.Id).ToList());
            var dwarfs = Of("dwarf");
            var stellar = Of("stellar");
            var anomaly = Of("anomaly");
            var rares = new List<string>();
            bool plain = R(s) < (near ? 0.1 : 0.25);
            if (!plain)
            {
                var chances = near ? new[] { 0.95, 0.45 } : new[] { 0.6, 0.1 };
                foreach (var c in chances)
                    if (R(s) < c)
                    {
                        var from = R(s) < (near ? 0.45 : 0.2) ? anomaly : stellar;
                        if (from.Count > 0)
                        {
                            rares.Add(from[0]);
                            from.RemoveAt(0);
                        }
                        else rares.Add(null);
                    }
            }
            var got = rares.Where(x => x != null).ToList();
            return Shuffle(s, got.Concat(dwarfs.Take(Math.Max(0, T.ArmoryStock + (s.Run?.Stock ?? 0) - got.Count))).ToList());
        }

        static List<string> PickResearch(CampaignState s, HashSet<string> taken)
        {
            var race = RiftRace(s);
            var free = (race == null ? Research.Experiments : Research.All.Where(r => r.Race == race)).Where(r => !taken.Contains(r.Id) && !Research.RetiredResearch.Contains(r.Id)).ToList();
            return Shuffle(s, free.ToList()).Take(T.ResearchOptions).Select(r => r.Id).ToList();
        }

        public static bool DeepIn(CampaignState s, CampaignNode n) => n.Tier - 2 * (s.Universe - 1) >= 2;

        static List<string> RandomCardChoices(CampaignState s, Faction f)
        {
            var poolNow = Shuffle(s, RiftPool(s) ?? OfferPool(f, s.Mode, s.Universe)).Distinct().ToList();
            var options = poolNow.Take(T.CardChoices + (f.Id == s.PlayerId ? s.Run?.Choices ?? 0 : 0)).ToList();
            return f.Id == s.PlayerId ? WithEnigma(s, options, s.Rift != null) : options;
        }
    }
}
