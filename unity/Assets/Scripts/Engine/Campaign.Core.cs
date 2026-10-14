using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>The campaign's tuning and tables, exported from campaign.ts (campaign.json).</summary>
    public class CampaignTuning
    {
        public class ShipMaxes { public int Defence, Attack, Command, Shields, Hull; }
        public class StarOddsDef { public double Red, White, Brown, Neutron; }
        public int ArmySize, SalvageChoices, Armories, ResearchStations, ArmoryStock, ResearchOptions, HeroAttack, HeroDefence;
        public int ShipBase, ShipPerLevel, CommandRoom, HullHealth, HeartDeck, EnemyDeck, StartMaterials;
        public ShipMaxes ShipMax;
        public int MaxFortification, FortifyBaseCost, FortifyCostPerLevel, FortifyHealth, FusionBase, MaxDamage, WinMaterials;
        public double VaultChance, VaultTwoChance;
        public int CardChoices, Lanes, Columns, ColGap, LaneGap, MapWidth, MapHeight, MapMargin, BonusPlanets;
        public int PetalBase, BossPetals, BossCardChoices, XpBattle, XpBattleLost, XpConquer, XpChallenge, XpGalaxy, XpBoss, PetalShare;
        public int BattleActionCap, ArmyRepelledDamage, ArmyHealCost, StabilityTurns, StabilityStep, StabilityMin, StabiliseCost, StabiliseTurns;
        public double RecycleShare;
        public int LostRelicMaterials, HeartWardenHealth;
        public StarOddsDef StarOdds;
    }

    public class StarTypeDef { public string Name, Text, Boon, Cost; }
    public class StarFind { public double Find; public List<List<object>> Kinds; }
    public class GalaxyDef { public string Kind, Name, Text, Short; public BattleModifiers Modifiers; }
    public class ChallengeDef { public string Name, Text, Reward; }
    public class FrostWaves { public int Days; public List<string> Spawn; public int Per; }
    public class FrostLine { public List<string> Start; public FrostWaves Waves; }
    public class MissionDef { public string Id, Name, Text; public int Target; public bool Counting; }
    public class OverlordDef { public string Id, Name, Blurb, Hero; public List<string> Parts; }

    public class CampaignData
    {
        public CampaignTuning Tuning;
        public Dictionary<string, int> ArmoryPrice;
        public Dictionary<string, int> OfferWeight;
        public Dictionary<string, StarTypeDef> StarTypes;
        public Dictionary<string, StarFind> StarFinds;
        public Dictionary<string, GalaxyDef> Galaxies;
        public List<string> GalaxyKinds;
        public Dictionary<string, ChallengeDef> Challenges;
        public List<FrostLine> FrostLines;
        public List<OverlordDef> Overlords;
        public List<string> LostLords;
        public List<string> EnigmaIds;
        public List<MissionDef> Missions;
    }

    /// <summary>
    /// Campaign mode (campaign.ts): a run across a dying universe's galaxies, strip by strip, wormhole to wormhole.
    /// Pure and deterministic like the battle engine: <see cref="Apply"/> clones the state, uses the seeded RNG
    /// stored in it, and throws GameError on invalid actions.
    /// </summary>
    public static partial class Campaign
    {
        public static CampaignData D { get; private set; }
        public static CampaignTuning T => D.Tuning;
        static List<CardDef> pool;
        /// <summary>CARDS: the card pool, in order.</summary>
        public static List<CardDef> Pool => pool ??= Cards.Pool.ToList();

        public static void Load(string json)
        {
            D = Json.Read<CampaignData>(json);
            pool = null;
        }

        static double R(CampaignState s) => Rng.Next(s);
        static int RInt(CampaignState s, int n) => Rng.Int(s, n);
        static List<T> Shuffle<T>(CampaignState s, List<T> xs) => Rng.Shuffle(s, xs);
        /// <summary>JS Math.round: halves round up.</summary>
        static int Round(double x) => (int)Math.Floor(x + 0.5);
        static int Mod(int a, int n) => ((a % n) + n) % n;

        // ---- Cards (cards.ts helpers the campaign uses) ----

        public static string RarityOf(string id) => Cards.Def(id).Rarity ?? "dwarf";
        public static bool IsEnigma(string id) => D.EnigmaIds.Contains(id);
        public static int CopyLimit(string id)
        {
            var r = RarityOf(id);
            return r == "anomaly" || r == "enigma" ? Balance.MaxAnomalyCopies : Balance.MaxCopies;
        }

        public static int? MainRace(List<string> cards)
        {
            var counts = new Dictionary<int, int>();
            var order = new List<int>();
            foreach (var id in cards)
            {
                if (!CardData.TryGet(id, out var d) || d.Race == null) continue;
                int r = d.Race.Value;
                if (!counts.ContainsKey(r)) { counts[r] = 0; order.Add(r); }
                counts[r]++;
            }
            if (counts.Count == 0) return null;
            int best = counts.Values.Max();
            var tied = order.Where(r => counts[r] == best).ToList();
            var heroes = cards.Select(id => CardData.TryGet(id, out var d) ? d : null).Where(c => c != null && c.Kind == "command" && c.Race != null && tied.Contains(c.Race.Value));
            var top = heroes.OrderByDescending(c => c.Cost ?? 1).FirstOrDefault();
            return top?.Race ?? tied[0];
        }

        public static DeckList PresetDeck(int race, string mode = "lost")
        {
            var decks = CardData.Decks;
            return decks.FirstOrDefault(d => d.Mixed != true && (d.Mode ?? "lost") == mode && MainRace(d.Cards) == race)
                ?? decks.FirstOrDefault(d => d.Mixed != true && MainRace(d.Cards) == race) ?? decks[0];
        }

        // ---- Galaxies ----

        public static BattleModifiers MergeModifiers(BattleModifiers a, BattleModifiers b)
        {
            var o = Json.Clone(a ?? new BattleModifiers());
            if (b == null) return o;
            foreach (var f in typeof(BattleModifiers).GetFields())
            {
                var v = (int?)f.GetValue(b);
                if (v == null) continue;
                f.SetValue(o, ((int?)f.GetValue(o) ?? 0) + v.Value);
            }
            return o;
        }

        static BattleModifiers Merge(BattleModifiers init, params BattleModifiers[] xs) => xs.Aggregate(init ?? new BattleModifiers(), MergeModifiers);

        public class GalaxyEffect { public BattleModifiers Modifiers; public List<BattleCondition> Conditions; }

        public static GalaxyEffect GalaxyEffects(CampaignState s)
        {
            if (s.Galaxy == null || !D.Galaxies.TryGetValue(s.Galaxy, out var g)) return null;
            return new GalaxyEffect { Modifiers = g.Modifiers, Conditions = new List<BattleCondition> { new BattleCondition { Name = g.Name, Text = g.Text, Short = g.Short, Galaxy = true } } };
        }

        public static string StarOddsText(CampaignNode n) => n.Star != null ? D.StarTypes[n.Star].Boon : "An ordinary star: usually guarded, now and then a little of anything.";

        // ---- Missions ----

        public static int MissionValue(CampaignState s, Faction f, string id)
        {
            switch (id)
            {
                case "c_colonist": return f.Stats.Settled;
                case "c_harvest": case "c_warlord": return f.Stats.BattlesWon;
                case "c_bulwark": return f.Stats.Defences;
                case "c_blitz": return f.Stats.SwiftWins;
                case "c_cold": return f.Stats.ColdWins;
                case "c_expanse": return OwnedNodes(s, f.Id).Count;
            }
            throw new Exception("Unknown campaign mission: " + id);
        }

        public static int MissionProgress(CampaignState s, Faction f, ActiveMission m)
        {
            var def = D.Missions.FirstOrDefault(x => x.Id == m.Id) ?? throw new Exception("Unknown campaign mission: " + m.Id);
            return Math.Min(def.Target, MissionValue(s, f, m.Id) - (def.Counting ? m.Base : 0));
        }

        // ---- Queries ----

        public static CampaignNode NodeById(CampaignState s, string id) => s.Nodes.FirstOrDefault(x => x.Id == id) ?? throw new GameError("Unknown system.");
        public static Faction FactionById(CampaignState s, string id) => s.Factions.FirstOrDefault(x => x.Id == id) ?? throw new GameError("Unknown faction.");
        public static Faction Player(CampaignState s) => FactionById(s, s.PlayerId);
        public static List<CampaignNode> OwnedNodes(CampaignState s, string factionId) => s.Nodes.Where(n => n.Owner == factionId).ToList();

        /// <summary>What a faction can see: the whole strip (a Dark Galaxy: only the star it stands at and those one jump ahead).</summary>
        public static List<string> VisibleNodes(CampaignState s, string factionId)
        {
            if (s.Rift?.Kind == "dark")
            {
                var ship = Flagship(s, s.PlayerId);
                var here = ship != null ? NodeById(s, ship.NodeId) : null;
                if (here == null) return new List<string>();
                var o = new List<string> { here.Id };
                foreach (var id in here.Links) if (NodeById(s, id).Vanished != true && !o.Contains(id)) o.Add(id);
                return o;
            }
            return s.Nodes.Where(n => n.Challenge?.Hidden != true).Select(n => n.Id).ToList();
        }

        public static Army ArmyById(CampaignState s, string id) => s.Armies.FirstOrDefault(x => x.Id == id) ?? throw new GameError("Unknown army.");
        public static List<Army> ArmiesOf(CampaignState s, string factionId) => s.Armies.Where(a => a.Owner == factionId).ToList();
        public static Army ArmyAt(CampaignState s, string nodeId) => s.Armies.FirstOrDefault(a => a.NodeId == nodeId);
        public static Army Flagship(CampaignState s, string factionId) => s.Armies.FirstOrDefault(a => a.Owner == factionId);

        public static Ship NewShip() => new Ship
        {
            Rooms = new ShipRooms { Defence = new List<int> { 0, 0, 0, 0, 0 }, Attack = new List<int> { 0, 0, 0, 0, 0 }, Command = T.CommandRoom },
            Shields = 0,
            Hull = 0,
        };

        public static HeroState HeroStateOf(Faction f, string hero)
        {
            f.Heroes ??= new Dictionary<string, HeroState>();
            if (!f.Heroes.TryGetValue(hero, out var h)) f.Heroes[hero] = h = new HeroState { Xp = 0, Skills = new List<string>(), Gear = new Dictionary<string, Item>() };
            return h;
        }

        public static HeroStats HeroStatsOf(Faction f, string hero) => new HeroStats { Attack = T.HeroAttack, Defence = T.HeroDefence };

        public static string ArmyLeader(Army a) => a.Lost != null ? $"The last of the {a.Lost}" : Cards.Def(a.General).Name;

        // ---- Stations ----

        public static string StationProblem(CampaignState s, Faction f, CampaignNode n)
        {
            if (n.Station == null) return $"{n.Name} has no station.";
            if (Flagship(s, f.Id)?.NodeId != n.Id) return $"Your flagship must be at {n.Name} to use its {(n.Station.Kind == "armory" ? "space station" : "research station")}.";
            return null;
        }

        public static string ResearchProblem(CampaignState s, Faction f, CampaignNode n, string projectId = null)
        {
            var why = StationProblem(s, f, n);
            if (why != null) return why;
            if (n.Station?.Kind != "research") return $"{n.Name} has no research station.";
            if (n.Station.TakenBy != null) return $"{n.Name}'s research has already been taken.";
            var done = f.Research?.Done ?? new List<string>();
            var open = n.Station.Options.Where(id => !done.Contains(id)).ToList();
            if (projectId == null) return open.Count > 0 ? null : "You have all of its upgrades already.";
            if (!n.Station.Options.Contains(projectId)) return $"{n.Name}'s research station doesn't offer that.";
            if (done.Contains(projectId)) return "You have that upgrade already.";
            if (Research.SupersededResearch(done.Concat(new[] { projectId }).ToList(), projectId)) return "You have a better one already.";
            return null;
        }

        public static string BuyProblem(CampaignState s, Faction f, CampaignNode n, int index)
        {
            var why = StationProblem(s, f, n);
            if (why != null) return why;
            if (n.Station?.Kind != "armory") return $"{n.Name} has no space station.";
            var id = index >= 0 && index < n.Station.Cards.Count ? n.Station.Cards[index] : null;
            if (string.IsNullOrEmpty(id)) return "That card has been sold.";
            if (n.Station.Used?.Buy == true) return "One purchase per station";
            if (f.Materials < BuyPrice(s, f, id)) return "Not enough materials";
            return null;
        }

        /// <summary>The parts the Captain has to fit on this run: the hangar's as the run began, and those found since.</summary>
        public static List<string> RunHangar(CampaignState s) => (s.Run?.Hangar ?? new List<string>()).Concat(s.PartsFound ?? new List<string>()).Distinct().ToList();

        public static string SwapPartProblem(CampaignState s, Faction f, CampaignNode n, string slot, string id)
        {
            var why = StationProblem(s, f, n);
            if (why != null) return why;
            if (n.Station?.Kind != "armory") return $"{n.Name} has no space station.";
            if (f.Human != true) return "No parts to fit.";
            if (n.Station.Used?.Part == true) return "One part swap per station";
            string now = null;
            s.Run?.Ship?.Fitted?.TryGetValue(slot, out now);
            if (id == null) return !string.IsNullOrEmpty(now) ? null : "Nothing fitted there.";
            if (!RunHangar(s).Contains(id)) return "Not in your hangar.";
            if (!Parts.PartSlots(id).Contains(slot)) return "It doesn't fit there.";
            if (now == id) return "Fitted there already.";
            return null;
        }

        public static string RecycleProblem(CampaignState s, Faction f, CampaignNode n, string defId)
        {
            var why = StationProblem(s, f, n);
            if (why != null) return why;
            if (n.Station?.Kind != "armory") return $"{n.Name} has no space station.";
            if (n.Station.Used?.Recycle == true) return "One recycle per station";
            var army = Flagship(s, f.Id);
            if (army == null) return "You have no flagship.";
            if (IsCharacter(defId)) return "Characters can't be recycled";
            return DeckRemoveProblem(army, defId);
        }

        public static bool IsCharacter(string defId) => Cards.Def(defId).Kind == "command" || Builds.IsCaptain(defId) || defId.StartsWith("companion_");

        public static string FuseProblem(CampaignState s, Faction f, CampaignNode n, string a, string b)
        {
            var why = StationProblem(s, f, n);
            if (why != null) return why;
            if (n.Station?.Kind != "armory") return $"{n.Name} has no space station.";
            if (n.Station.Fuse != true) return $"{n.Name}'s station can't fuse cards.";
            if (n.Station.Used?.Fuse == true) return "One fusion per station";
            var army = Flagship(s, f.Id);
            if (army == null) return "You have no flagship.";
            int Have(string id) => army.Deck.Count(x => x == id);
            if (a == b ? Have(a) < 2 : Have(a) == 0 || Have(b) == 0) return "Choose two cards of your deck.";
            if ((a == army.General || b == army.General) && Have(army.General) <= (a == b ? 2 : 1)) return $"{Cards.Def(army.General).Name} leads this flagship: their card stays.";
            if (army.Deck.Count - 1 < T.ArmySize) return $"{T.ArmySize} cards minimum";
            var problem = FusionProblem(a, b);
            if (problem != null) return problem;
            if (f.Materials < FusionCost(a, b)) return "Not enough materials";
            return null;
        }

        // ---- Fusion (cards.ts) ----

        static HashSet<string> ChoiceKinds(CardDef def)
        {
            var kinds = new HashSet<string>();
            foreach (var e in def.OnPlay ?? new List<Effect>())
            {
                if (e.Type == "destroy" || e.Type == "bounce" || (e.Type == "erode" && e.All != true) || (e.Type == "shift" && e.Enemy == true)) kinds.Add("enemy");
                if (e.Type == "recall" || e.Type == "empower" || (e.Type == "restore" && e.All != true && e.Self != true) || (e.Type == "shift" && e.Enemy != true)) kinds.Add("ally");
                if (e.Type == "recover") kinds.Add("recover");
            }
            return kinds;
        }

        public static string Unfusable(string id)
        {
            if (!CardData.TryGet(id, out var d)) return "A fused card cannot be fused again.";
            if (d.Kind == "command") return "Heroes cannot be fused (a deck needs exactly two).";
            if (d.Kind == "global") return "Global cards cannot be fused.";
            if (d.Kind == "trap") return "Traps cannot be fused.";
            if (d.Kind == "relic") return "Relics cannot be fused.";
            if (d.Rarity == "enigma") return "Enigmas cannot be fused.";
            return null;
        }

        public static string FusionProblem(string a, string b)
        {
            var whole = Unfusable(a) ?? Unfusable(b);
            if (whole != null) return whole;
            CardData.TryGet(a, out var da);
            CardData.TryGet(b, out var db);
            var ka = ChoiceKinds(da);
            if (ChoiceKinds(db).Any(ka.Contains)) return "Both cards ask for the same kind of choice when played.";
            if (da.SpendAll == true || db.SpendAll == true) return "Cards that spend all your energy cannot be fused.";
            int cost = (da.Cost ?? 1) + (db.Cost ?? 1);
            if (cost > Balance.MaxPlays) return $"Together they would cost {cost} energy: more than a day ever gives ({Balance.MaxPlays}).";
            return null;
        }

        public static int FusionCost(string a, string b)
        {
            int Rr(string id) => D.ArmoryPrice[Cards.Def(id).Rarity ?? "dwarf"];
            return T.FusionBase + Rr(a) + Rr(b);
        }

        public static int ArmoryPrice(string defId)
        {
            var def = Cards.Def(defId);
            return D.ArmoryPrice[def.Rarity ?? "dwarf"] + (def.Race == null ? 0 : D.ArmoryPrice["race"]);
        }

        public static int BuyPrice(CampaignState s, Faction f, string defId) => Math.Max(1, ArmoryPrice(defId) - (f.Id == s.PlayerId ? s.Run?.ArmoryDiscount ?? 0 : 0));

        public static int RecycleValue(string defId) => Math.Max(1, (int)Math.Floor(ArmoryPrice(defId) * T.RecycleShare));

        public static int? FortifyCost(CampaignNode node) => node.Fortification >= T.MaxFortification ? (int?)null : T.FortifyBaseCost + node.Fortification * T.FortifyCostPerLevel;

        public static bool CanGarrison(string defId) => Cards.Def(defId).Kind != "global";

        // ---- Ship ----

        public static int ShipLevel(Ship ship, string part, int room = 0)
        {
            if (part == "defence") return room < ship.Rooms.Defence.Count ? ship.Rooms.Defence[room] : 0;
            if (part == "attack") return room < ship.Rooms.Attack.Count ? ship.Rooms.Attack[room] : 0;
            if (part == "command") return ship.Rooms.Command - T.CommandRoom;
            return part == "shields" ? ship.Shields : ship.Hull;
        }

        public static int? ShipUpgradeCost(Ship ship, string part, int room = 0)
        {
            if ((part == "defence" || part == "attack") && !(room >= 0 && room < Balance.TableauSlots)) return null;
            int level = ShipLevel(ship, part, room);
            int most = part == "defence" ? T.ShipMax.Defence : part == "attack" ? T.ShipMax.Attack : part == "command" ? T.ShipMax.Command : part == "shields" ? T.ShipMax.Shields : T.ShipMax.Hull;
            if (level >= most) return null;
            return T.ShipBase + level * T.ShipPerLevel;
        }

        // ---- Decks ----

        public static int CampaignCopies(string id) => IsEnigma(id) ? 1 : Balance.MaxCopies;

        public static string DeckAddProblem(Faction f, Army army, string defId)
        {
            if (!f.Reserve.Contains(defId)) return $"{Cards.Def(defId).Name} is not in your reserve.";
            int copies = army.Deck.Count(id => id == defId);
            if (copies >= CampaignCopies(defId)) return $"At most {CampaignCopies(defId)} copies of a card.";
            if (Cards.Def(defId).Kind == "command" && defId != army.General) return $"An army is led by its own hero: {Cards.Def(defId).Name} can lead an army of their own.";
            return null;
        }

        /// <summary>DeckAddProblem as if the card were in the reserve.</summary>
        static string DeckAddProblemFor(Faction f, Army army, string id) => DeckAddProblem(new Faction { Reserve = new List<string> { id } }, army, id);

        public static string DeckRemoveProblem(Army army, string defId)
        {
            if (!army.Deck.Contains(defId)) return $"{Cards.Def(defId).Name} is not in that deck.";
            if (defId == army.General && army.Deck.Count(x => x == defId) == 1) return $"{Cards.Def(defId).Name} leads this army: their card stays in its deck.";
            if (army.Deck.Count == T.ArmySize) return $"A flagship's deck keeps at least {T.ArmySize} cards once it has that many.";
            return null;
        }

        public static string DeckSwapProblem(Faction f, Army army, int slot, int reserveIndex)
        {
            var id = reserveIndex >= 0 && reserveIndex < f.Reserve.Count ? f.Reserve[reserveIndex] : null;
            if (string.IsNullOrEmpty(id) || slot < 0 || slot >= army.Deck.Count) return "No such card.";
            if (army.Deck[slot] == army.General && army.Deck.Count(x => x == army.General) == 1) return $"{Cards.Def(army.General).Name} leads this army: their card stays in its deck.";
            var next = army.Deck.ToList();
            next[slot] = id;
            return ArmyDeckProblems(next, army.General).FirstOrDefault();
        }

        public static List<string> ArmyDeckProblems(List<string> deck, string general)
        {
            var o = new List<string>();
            if (!deck.Contains(general)) o.Add($"{Cards.Def(general).Name} leads this flagship: their card must be in its deck.");
            var race = Cards.Def(general).Race;
            bool Aboard(string id) => Builds.IsCaptain(general) ? Story.Generals.Any(g => g.Contains(id)) : race != null && race.Value < Story.Generals.Count && Story.Generals[race.Value].Contains(id);
            var heroes = deck.Where(id => Cards.Def(id).Kind == "command" && id != general && !Aboard(id)).ToList();
            if (heroes.Count > 0) o.Add($"A flagship has one hero: {Cards.Def(heroes[0]).Name} can't come aboard.");
            var counts = new Dictionary<string, int>();
            var order = new List<string>();
            foreach (var id in deck)
            {
                if (!counts.ContainsKey(id)) { counts[id] = 0; order.Add(id); }
                counts[id]++;
            }
            foreach (var id in order) if (counts[id] > CampaignCopies(id)) o.Add($"At most {CampaignCopies(id)} copies of {Cards.Def(id).Name}.");
            return o;
        }

        /// <summary>Whether a card can be in a deck in this mode (in Core, as its core version).</summary>
        public static bool LegalIn(string mode, string id) => mode != "core" || Modes.InMode(Cards.Def(id), "core");

        public static int? RiftRace(CampaignState s) => s.Rift != null ? Rifts.ByKind[s.Rift.Kind].Race : (int?)null;
        static bool RiftLegal(CampaignState s, string id) => (RiftRace(s) != null && Cards.Def(id).Race == RiftRace(s)) || LegalIn(s.Mode, id);

        static readonly string[] CoreFill = { "coronal_lance", "thermal_exchange", "cryo_vault", "gravity_sling", "heat_sink", "plasma_relay", "deep_scanners", "solar_battery", "coolant_array", "dreadnought" };
        static readonly string[] GuardNeutrals = { "coronal_lance", "thermal_exchange", "photon_drill", "scatter_shot", "plasma_relay", "gravity_sling", "nova_shell", "cryo_vault", "heat_sink", "deflector_grid", "deep_scanners", "solar_mirror" };
        public static readonly string[] CaptainDeckCards = { "coronal_lance", "coronal_lance", "thermal_exchange", "thermal_exchange", "plasma_relay", "cryo_vault", "heat_sink", "p_barrier_drone", "deep_scanners" };

        static List<string> FitMode(CampaignState s, List<string> deck)
        {
            if (s.Mode != "core") return deck;
            int k = 0;
            return deck.Select(id => LegalIn("core", id) ? id : CoreFill[k++ % CoreFill.Length]).ToList();
        }

        static bool Repairs(CardDef c) => (c.OnPlay ?? new List<Effect>()).Concat(c.OnTurn ?? new List<Effect>()).Concat(c.OnDusk ?? new List<Effect>()).Any(e => e.Type == "repair");

        public static List<string> CaptainDeck(string captain) => new[] { captain }.Concat(CaptainDeckCards).ToList();

        /// <summary>A flagship's starting deck, ten cards: its hero, the race's own first cards, plain neutral ones.</summary>
        public static List<string> ArmyDeck(int race, string general, string mode = "lost")
        {
            int r = Mod(race, Races.RaceNames.Count);
            bool Plain(CardDef c) => c.Kind != "command" && c.Rarity != "anomaly" && c.Fusion != true && c.SpendAll != true && LegalIn(mode, c.Id);
            var mine = Pool.Where(c => c.Race == r && Plain(c)).ToList();
            var defences = mine.Where(c => c.Kind == "defence").ToList();
            var own = mine.Where(c => c.Kind == "attack").Take(2).Concat(defences.Where(Repairs).Concat(defences).Take(1)).Select(c => c.Id).ToList();
            var deck = new List<string> { general };
            foreach (var id in own) { deck.Add(id); deck.Add(id); }
            foreach (var id in new[] { "coronal_lance", "deflector_grid", "heat_sink" }.Concat(GuardNeutrals).Concat(CoreFill))
            {
                if (deck.Count >= T.ArmySize) break;
                if (!LegalIn(mode, id)) continue;
                if (deck.Count(x => x == id) < 2) deck.Add(id);
            }
            var gens = r < Story.Generals.Count ? Story.Generals[r] : null;
            int tier = Math.Max(0, gens?.IndexOf(general) ?? 0);
            if (tier > 0)
            {
                var sub = Cards.Def(general).Sub;
                List<string> Best(string rarity) => Game.Sorted(
                        Pool.Where(c => c.Race == r && c.Kind != "command" && (c.Rarity ?? "dwarf") == rarity && c.Fusion != true && c.SpendAll != true && LegalIn(mode, c.Id) && !deck.Contains(c.Id)).ToList(),
                        (a, b) => (B(b.Sub == sub && sub != null) - B(a.Sub == sub && sub != null)) != 0 ? B(b.Sub == sub && sub != null) - B(a.Sub == sub && sub != null) : (b.Cost ?? 1) - (a.Cost ?? 1))
                    .Select(c => c.Id).ToList();
                var stellar = Best("stellar");
                var anomaly = Best("anomaly");
                var giftIds = new List<string> { stellar.ElementAtOrDefault(0) };
                if (tier >= 2) giftIds.Add(anomaly.ElementAtOrDefault(0) ?? stellar.ElementAtOrDefault(1));
                var gifts = giftIds.Where(x => !string.IsNullOrEmpty(x)).SelectMany(id => new[] { id, id }).ToList();
                var outDeck = deck.Take(T.ArmySize).ToList();
                foreach (var id in gifts)
                {
                    int k = -1;
                    for (int i = outDeck.Count - 1; i >= 0; i--)
                        if (outDeck[i] != general && Cards.Def(outDeck[i]).Race != r) { k = i; break; }
                    if (k < 0) break;
                    outDeck[k] = id;
                }
                return outDeck;
            }
            return deck.Take(T.ArmySize).ToList();
        }

        static int B(bool x) => x ? 1 : 0;

        /// <summary>A race's plain 30-card deck, for those who defend without an army.</summary>
        public static List<string> StarterDeck(int race, string mode = "lost")
        {
            int r = Mod(race, Races.RaceNames.Count);
            if (mode == "core") return PresetDeck(r, "core").Cards.ToList();
            var mine = Pool.Where(c => c.Race == r && c.Kind != "command" && c.Rarity != "anomaly" && c.Fusion != true).ToList();
            var rest = mine.Where(c => c.Kind != "attack").ToList();
            var own = mine.Where(c => c.Kind == "attack").Take(2).Concat(rest.Where(Repairs).Concat(rest).Take(1)).Select(c => c.Id).ToList();
            var g = Story.Generals[r];
            var heroes = CopyLimit(g[0]) > 1 ? new List<string> { g[0], g[0], g[1] } : new List<string> { g[0], g[1], g.ElementAtOrDefault(2) };
            return GuardNeutrals.SelectMany(id => new[] { id, id }).Concat(own).Concat(heroes).ToList();
        }
    }
}
