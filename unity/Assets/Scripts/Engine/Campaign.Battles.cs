using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    public static partial class Campaign
    {
        /// <summary>What an army brings to battle and the map (armyBonus).</summary>
        public class ArmyBonus
        {
            public List<string> Boons = new List<string>();
            public bool Start;
            public List<BattleSkill> Skills = new List<BattleSkill>();
            public BattleModifiers Mods = new BattleModifiers();
            public int March, Mend, Sight, Dread;
            public double Loot;
            public BattleModifiers FoeMods = new BattleModifiers();
            public int FoeHeat;
            public List<BattleCondition> FoeConditions = new List<BattleCondition>();
            public int Walls, Guns;
            public List<RelicInPlay> Powers = new List<RelicInPlay>();
            public List<int> SlotGuns;
            public int OpenShields, JumpCool;
            public double Warp;
        }

        public static ArmyBonus ArmyBonusOf(CampaignState s, Army a)
        {
            var f = s.Factions.FirstOrDefault(x => x.Id == a.Owner);
            bool plain = a.Lost != null || f == null;
            HeroState hs = null;
            if (!plain) f.Heroes?.TryGetValue(a.General, out hs);
            var hero = Heroes.HeroBonus(a.General, plain ? null : hs);
            var r = Research.ResearchBonus(plain ? null : f.Research);
            var bonus = new ArmyBonus
            {
                Boons = hero.Boons.ToList(),
                Start = hero.Start,
                Skills = hero.Skills.ToList(),
                Mods = Json.Clone(r.Mods ?? new BattleModifiers()),
                March = r.March ?? 0,
                Mend = r.Mend ?? 0,
                Loot = r.Loot ?? 0,
                Sight = r.Sight ?? 0,
                Dread = r.Dread ?? 0,
            };
            if (f != null && a.Lost == null && (f.Relics?.Count ?? 0) > 0)
            {
                var rel = Heroes.RelicBonus(f.Relics, a.General);
                bonus.Boons.AddRange(rel.Boons);
                bonus.Mods = MergeModifiers(bonus.Mods, rel.Mods);
                bonus.Skills.AddRange(rel.Skills);
                if (rel.Start) bonus.Start = true;
                bonus.Walls = rel.Walls;
                bonus.Guns = rel.Guns;
                bonus.Powers = rel.Powers.ToList();
            }
            if (a.Owner == s.PlayerId && s.Run != null)
            {
                var run = s.Run;
                if (run.Mods != null) bonus.Mods = MergeModifiers(bonus.Mods, run.Mods);
                bonus.Mend += run.Mend ?? 0;
                bonus.Loot += run.Loot ?? 0;
            }
            var ship = a.Owner == s.PlayerId && a.Lost == null && f?.Human == true ? s.Run?.Ship : null;
            if (ship != null)
            {
                var m = new BattleModifiers();
                if (ship.Health != 0) m.MaxHealthDelta = ship.Health;
                if (ship.ShieldPerTurn != 0) m.ShieldPerTurn = ship.ShieldPerTurn;
                bonus.Mods = MergeModifiers(bonus.Mods, m);
                bonus.FoeHeat += ship.Opening;
                bonus.March += ship.March;
                bonus.Walls += ship.Walls;
            }
            bonus.SlotGuns = ship?.Guns?.ToList() ?? new List<int> { 0, 0, 0, 0, 0 };
            bonus.OpenShields = ship?.Shields ?? 0;
            bonus.JumpCool = ship?.Cool ?? 0;
            bonus.Warp = ship?.Warp ?? 0;
            return bonus;
        }

        // ---- Moves ----

        public class Move { public string ToId; public bool Battle; public bool? Surrender; public bool? Warp; }

        public static List<Move> ArmyMoves(CampaignState s, Army army)
        {
            if (army.Moved || army.Refit == true || (army.Steps ?? 0) >= 1 + ArmyBonusOf(s, army).March) return new List<Move>();
            var here = NodeById(s, army.NodeId);
            var o = new List<Move>();
            var reach = WarpReach(s, army);
            foreach (var id in here.Links.Concat(reach).ToList())
            {
                var n = NodeById(s, id);
                if (n.Collapsed == true || n.Vanished == true) continue;
                if (s.Rift?.Kind == "time" && (n.SpinRing ?? 0) > (here.SpinRing ?? 99) && n.Heart != true) continue;
                if (DoomProblem(s, army, id) != null) continue;
                if (n.Challenge != null)
                {
                    if (army.Owner == s.PlayerId && !n.Challenge.Hidden && n.Challenge.Done == null) o.Add(new Move { ToId = id, Battle = n.Challenge.Kind != "rift" });
                    continue;
                }
                var there = ArmyAt(s, id);
                if (n.Owner == army.Owner || n.Station != null || ((n.Ruined == true || n.Cache != null || n.Prophet == true) && n.Owner == null && there == null))
                {
                    if (there == null) o.Add(new Move { ToId = id, Battle = false });
                    continue;
                }
                if (HazardBlocks(n, army.Owner)) continue;
                o.Add(Surrenders(s, army, n) ? new Move { ToId = id, Battle = false, Surrender = true } : new Move { ToId = id, Battle = true });
            }
            foreach (var m in o) if (reach.Contains(m.ToId)) m.Warp = true;
            return o;
        }

        public static List<string> WarpReach(CampaignState s, Army army)
        {
            double range = army.Owner == s.PlayerId ? ArmyBonusOf(s, army).Warp : 0;
            if (range == 0 || s.Rift != null) return new List<string>();
            var here = NodeById(s, army.NodeId);
            double most = range * T.ColGap;
            return s.Nodes.Where(n => n.Id != here.Id && !here.Links.Contains(n.Id) && n.Heart != true && n.Challenge == null && n.Collapsed != true && n.Vanished != true && Hypot(n.X - here.X, n.Y - here.Y) <= most).Select(n => n.Id).ToList();
        }

        static double Hypot(double x, double y) => Math.Sqrt(x * x + y * y);

        public static string DoomProblem(CampaignState s, Army army, string toId)
        {
            if (army.Owner != s.PlayerId || army.Lost != null) return null;
            var here = NodeById(s, army.NodeId);
            var to = NodeById(s, toId);
            var dest = to.Challenge != null ? here : to;
            if (dest.Heart == true) return null;
            if ((army.Steps ?? 0) + 1 < 1 + ArmyBonusOf(s, army).March) return null;
            if (dest.Collapsing == true) return $"{dest.Name} collapses as the turn ends: your flagship would go down with it.";
            bool marks = UniverseStability(s) - (s.Turn + 1 - s.UniverseStart) <= 0;
            bool Goes(CampaignNode n) => n.Collapsed == true || n.Collapsing == true || (marks && n.Col == s.CollapseCol);
            if (!Goes(dest)) return null;
            bool outWay = dest.Links.Select(id => NodeById(s, id)).Any(n => n.Heart == true || (!Goes(n) && n.Challenge == null));
            return outWay ? null : $"{dest.Name} would be cut off: every way out of it collapses before your flagship could leave.";
        }

        public static bool Surrenders(CampaignState s, Army army, CampaignNode n) => n.Owner == null && n.Heart != true && ArmyAt(s, n.Id) == null && n.Tier < ArmyBonusOf(s, army).Dread;

        public static int RegionalStability(CampaignState s) => Math.Max(0, UniverseStability(s) - (s.Turn - s.UniverseStart));
        public static int CollapsesPerTurn(CampaignState s) => 1;
        public static string StabiliseProblem(Faction f, CampaignNode n) => "Nothing holds back the collapse: keep moving.";
        public static bool HazardBlocks(CampaignNode n, string factionId) => n.Hazard.Contains(factionId);

        public class AttackOption { public string ToId; public List<string> ArmyIds; }

        public static List<AttackOption> AttackOptions(CampaignState s, string factionId)
        {
            var o = new List<AttackOption>();
            foreach (var a in ArmiesOf(s, factionId))
                foreach (var m in ArmyMoves(s, a))
                    if (m.Battle)
                    {
                        var e = o.FirstOrDefault(x => x.ToId == m.ToId);
                        if (e == null) o.Add(e = new AttackOption { ToId = m.ToId, ArmyIds = new List<string>() });
                        e.ArmyIds.Add(a.Id);
                    }
            return o;
        }

        public class GarrisonBonusOf { public List<string> Tableau = new List<string>(); public string Lightspeed; }

        public static GarrisonBonusOf GarrisonBonus(CampaignNode n)
        {
            var b = new GarrisonBonusOf();
            foreach (var g in n.Garrison)
            {
                if (g.Status != "stationed") continue;
                if (Cards.Def(g.DefId).Kind == "trap")
                {
                    b.Lightspeed ??= g.DefId;
                    continue;
                }
                b.Tableau.Add(g.DefId);
            }
            return b;
        }

        // ---- Loot ----

        class LootMarkOf { public int Materials, Xp, Petals, Parts; public HashSet<string> Relics; public List<string> Cards; }

        static LootMarkOf LootMark(CampaignState s)
        {
            var f = FactionById(s, s.PlayerId);
            var cards = s.Armies.Where(a => a.Owner == f.Id).SelectMany(a => a.Deck).Concat(f.Reserve).ToList();
            return new LootMarkOf { Materials = f.Materials, Xp = s.Xp ?? 0, Petals = s.Petals, Relics = new HashSet<string>((f.Relics ?? new List<Relic>()).Select(r => r.Id)), Cards = cards, Parts = s.PartsFound?.Count ?? 0 };
        }

        static Loot LootSince(CampaignState s, LootMarkOf before, bool won)
        {
            var now = LootMark(s);
            var f = FactionById(s, s.PlayerId);
            var had = new Dictionary<string, int>();
            foreach (var id in before.Cards) had[id] = (had.TryGetValue(id, out var k) ? k : 0) + 1;
            var cards = new List<string>();
            foreach (var id in now.Cards)
            {
                int n = had.TryGetValue(id, out var k) ? k : 0;
                if (n > 0) had[id] = n - 1;
                else cards.Add(id);
            }
            return new Loot
            {
                Won = won,
                Materials = Math.Max(0, now.Materials - before.Materials),
                Xp = Math.Max(0, now.Xp - before.Xp),
                Petals = Math.Max(0, now.Petals - before.Petals),
                Relics = (f.Relics ?? new List<Relic>()).Where(r => !before.Relics.Contains(r.Id)).ToList(),
                Cards = cards,
                Parts = (s.PartsFound ?? new List<string>()).Skip(before.Parts).ToList(),
            };
        }

        static bool AnyLoot(Loot l) => l.Materials != 0 || l.Xp != 0 || l.Petals != 0 || l.Relics.Count > 0 || l.Cards.Count > 0 || (l.Parts?.Count ?? 0) > 0;

        // ---- Battles ----

        static List<string> StationDeck(CampaignState s, CampaignNode n, int? race = null)
        {
            if (s.Rift != null && race == null) return RiftDeck(s, n);
            if (n.Heart == true)
            {
                var w = WardenDeck(s).Where(id => Cards.Def(id).Kind != "command").ToList();
                int size = Math.Min(20, T.HeartDeck + 2 * (s.Universe - 1));
                var front = w.Skip(8).Take(6).ToList();
                var rest = Shuffle(s, w.Take(8).Concat(w.Skip(14)).ToList()).Take(size - 6);
                return front.Concat(rest).ToList();
            }
            int tier = Math.Max(0, n.Tier);
            var pool = (race == null ? NeutralDeck(s, tier) : FitMode(s, StarterDeck(race.Value, s.Mode))).Where(id => Cards.Def(id).Kind != "command").ToList();
            int sz = Math.Min(20, T.EnemyDeck + 2 * tier);
            var deck = new List<string>();
            foreach (var id in Shuffle(s, pool))
            {
                if (deck.Count >= sz) break;
                if (deck.Count(x => x == id) < CopyLimit(id)) deck.Add(id);
            }
            return deck;
        }

        static ShipRooms StationRooms(CampaignNode n)
        {
            int d = Math.Min(3, Math.Max(0, n.Heart == true ? 2 + FloorDiv(n.Tier, 3) : FloorDiv(n.Tier + 1, 2)));
            int a = Math.Min(2, Math.Max(0, FloorDiv(n.Tier, 2)));
            return new ShipRooms { Defence = Enumerable.Repeat(d, 5).ToList(), Attack = Enumerable.Repeat(a, 5).ToList(), Command = 0 };
        }

        static int FloorDiv(int a, int b) => (int)Math.Floor(a / (double)b);

        public class FlagshipSide
        {
            public string Hero;
            public List<string> Tableau;
            public HeroStats HeroStats;
            public ShipRooms Rooms;
            public GameOpening Opening;
            public BattleModifiers Hull;
        }

        static FlagshipSide FlagshipSetup(CampaignState s, Army army)
        {
            var f = s.Factions.FirstOrDefault(x => x.Id == army.Owner);
            if (army.Lost != null || f == null) return new FlagshipSide { Hero = army.General, Tableau = new List<string>(), HeroStats = new HeroStats { Attack = T.HeroAttack + 1, Defence = T.HeroDefence }, Hull = new BattleModifiers() };
            var ship = f.Ship ?? NewShip();
            var bonus = ArmyBonusOf(s, army);
            int walls = bonus.Walls, guns = bonus.Guns;
            var rooms = new ShipRooms
            {
                Defence = ship.Rooms.Defence.Select(d => d + walls).ToList(),
                Attack = ship.Rooms.Attack.Select((d, i) => d + guns + (i < bonus.SlotGuns.Count ? bonus.SlotGuns[i] : 0)).ToList(),
                Command = ship.Rooms.Command,
                Boons = ship.Rooms.Boons,
            };
            if (ship.Modules?.Any(m => m != null) == true) rooms.Boons = Enumerable.Range(0, 5).Select(r => (r < ship.Modules.Count ? ship.Modules[r]?.Boons : null) ?? new List<string>()).ToList();
            int shields = ship.Shields + bonus.OpenShields;
            return new FlagshipSide
            {
                Hero = army.General,
                Tableau = bonus.Start ? new List<string> { army.General } : new List<string>(),
                HeroStats = HeroStatsOf(f, army.General),
                Rooms = rooms,
                Opening = shields != 0 ? new GameOpening { Shields = shields } : null,
                Hull = ship.Hull != 0 || (f.SunBonus ?? 0) != 0 ? new BattleModifiers { MaxHealthDelta = ship.Hull * T.HullHealth + (f.SunBonus ?? 0) } : new BattleModifiers(),
            };
        }

        static readonly string[] SentinelExtras = { "solar_battery", "solar_battery", "frost_bulwark", "frost_bulwark", "ion_cannon", "ion_cannon", "solar_maximum", "ice_age", "stellar_aegis", "stellar_aegis", "dreadnought", "dreadnought", "star_breaker", "star_breaker", "meltdown", "meltdown" };

        static List<string> NeutralDeck(CampaignState s, int tier)
        {
            var deck = StarterDeck(s.Mode == "core" ? Modes.CoreRaces[RInt(s, Modes.CoreRaces.Length)] : RInt(s, Races.RaceNames.Count), s.Mode);
            var extras = SentinelExtras.Take(2 + Math.Max(0, tier) * 5).ToList();
            for (int i = 0; i < extras.Count; i++)
            {
                if (i < deck.Count) deck[i] = extras[i];
                else deck.Add(extras[i]);
            }
            return FitMode(s, deck);
        }

        static List<string> WardenDeck(CampaignState s)
        {
            var deck = NeutralDeck(s, Math.Max(2, s.Universe * 2));
            var heavy = new[] { "star_breaker", "star_breaker", "dreadnought", "dreadnought", "stellar_aegis", "stellar_aegis" };
            for (int i = 0; i < heavy.Length; i++)
            {
                while (deck.Count <= 8 + i) deck.Add(null);
                deck[8 + i] = heavy[i];
            }
            return FitMode(s, deck);
        }

        public static int Depth(CampaignNode n) => n.Heart == true ? 0 : Math.Max(1, 5 - n.Tier);

        public static int SunHealth(CampaignNode n) => Math.Min(Balance.SupernovaAt, 14 + 3 * Math.Max(0, n.Tier) + (n.Heart == true ? 2 : 0));
        static BattleModifiers SunBase(CampaignNode n) => new BattleModifiers { MaxHealthDelta = SunHealth(n) - Balance.SupernovaAt };

        static BattleModifiers CapDefence(BattleModifiers mods, BattleModifiers galaxy, bool flagshipDefends = false)
        {
            if (flagshipDefends) return mods;
            int most = galaxy?.MaxHealthDelta ?? 0;
            if ((mods.MaxHealthDelta ?? 0) > most)
            {
                var c = Json.Clone(mods);
                c.MaxHealthDelta = most;
                return c;
            }
            return mods;
        }

        static BattleModifiers None() => new BattleModifiers();

        public class SideOdds { public int Heat; public BattleModifiers Mods; public List<string> Sources; }

        public static (SideOdds attacker, SideOdds defender) BattleOdds(CampaignState s, Army army, CampaignNode target)
        {
            var owner = target.Owner != null ? FactionById(s, target.Owner) : null;
            var guard = DefenderOf(s, target, army);
            var fx = GalaxyEffects(s);
            var atk = ArmyBonusOf(s, army);
            var def = guard != null && guard.Id != army.Id ? ArmyBonusOf(s, guard) : null;
            var starBoth = target.Star == "white" ? new BattleModifiers { StartingHeat = -2 } : target.Star == "neutron" ? new BattleModifiers { HeatPerTurn = 1 } : None();
            var bse = SunBase(target);
            var defBase = guard != null && guard.Id != army.Id ? None() : bse;
            var defMods = CapDefence(Merge(fx?.Modifiers, defBase,
                target.Fortification != 0 ? new BattleModifiers { MaxHealthDelta = target.Fortification * T.FortifyHealth } : None(),
                target.Heart == true && owner == null ? new BattleModifiers { MaxHealthDelta = T.HeartWardenHealth } : None(),
                starBoth,
                target.Star == "brown" ? new BattleModifiers { MaxHealthDelta = 3 } : None(),
                def?.Mods ?? None(),
                atk.FoeMods), fx?.Modifiers, guard != null && guard.Id != army.Id);
            var atkMods = Merge(fx?.Modifiers, starBoth, atk.Mods, def?.FoeMods ?? None());
            int defHeat = (guard != null && guard.Id != army.Id ? guard.Damage : target.Damage) + atk.FoeHeat + (defMods.StartingHeat ?? 0);
            int atkHeat = army.Damage + (def?.FoeHeat ?? 0) + (atkMods.StartingHeat ?? 0);
            var names = (fx?.Conditions ?? new List<BattleCondition>()).Select(c => c.Name).ToList();
            var aSrc = names.ToList();
            if (target.Star == "white" || target.Star == "neutron") aSrc.Add(D.StarTypes[target.Star].Name);
            var dSrc = names.ToList();
            if (target.Star != null && target.Star != "red") dSrc.Add(D.StarTypes[target.Star].Name);
            if (target.Fortification != 0) dSrc.Add("Fortified");
            if (target.Heart == true && owner == null) dSrc.Add("Lost Overlord");
            return (new SideOdds { Heat = atkHeat, Mods = atkMods, Sources = aSrc }, new SideOdds { Heat = defHeat, Mods = defMods, Sources = dSrc });
        }

        public static Army DefenderOf(CampaignState s, CampaignNode target, Army attacker = null)
        {
            var here = ArmyAt(s, target.Id);
            if (here != null) return here.Id == attacker?.Id ? null : here;
            if (target.Owner == null) return null;
            var near = s.Armies.Where(a => a.Owner == target.Owner && a.Lost == null && a != attacker && target.Links.Contains(a.NodeId)).ToList();
            return near.OrderBy(a => a.Damage).ThenBy(a => a.Id, StringComparer.Ordinal).FirstOrDefault();
        }

        public static OverlordDef OverlordById(string id) => D.Overlords.FirstOrDefault(o => o.Id == id) ?? D.Overlords[0];
        public static int OverlordHealth(int galaxy) => 36 + 6 * (galaxy - 1);

        static List<PlayerSetup> BattleSetup(CampaignState s, Army army, CampaignNode target)
        {
            var attacker = FactionById(s, army.Owner);
            var owner = target.Owner != null ? FactionById(s, target.Owner) : null;
            var guard = DefenderOf(s, target, army);
            var g = GarrisonBonus(target);
            var fx = GalaxyEffects(s);
            var fortified = target.Fortification != 0 ? new BattleModifiers { MaxHealthDelta = target.Fortification * T.FortifyHealth } : None();
            var wardens = target.Heart == true && owner == null ? new BattleModifiers { MaxHealthDelta = T.HeartWardenHealth } : None();
            var core = SunBase(target);
            var starBoth = target.Star == "white" ? new BattleModifiers { StartingHeat = -2 } : target.Star == "neutron" ? new BattleModifiers { HeatPerTurn = 1 } : None();
            var starDef = target.Star == "brown" ? new BattleModifiers { MaxHealthDelta = 3 } : None();
            var starCond = target.Star != null && target.Star != "red" ? new List<BattleCondition> { new BattleCondition { Name = D.StarTypes[target.Star].Name, Text = target.Star == "brown" ? D.StarTypes["brown"].Boon : D.StarTypes[target.Star].Cost } } : new List<BattleCondition>();
            var defenceConditions = new List<BattleCondition>();
            defenceConditions.AddRange(starCond);
            defenceConditions.AddRange(fx?.Conditions ?? new List<BattleCondition>());
            if (target.Heart == true && owner == null) defenceConditions.Add(new BattleCondition { Name = "Lost Overlord", Text = $"The wormhole's guardian: destroy the Overlord itself ({OverlordHealth(s.Universe)} stability) to win. Each day one of its parts takes its best action for the board, shown ahead: destroy that part, and it must choose another." });
            if (target.Fortification != 0) defenceConditions.Add(new BattleCondition { Name = "Fortified", Text = $"+{target.Fortification * T.FortifyHealth} max health (fortification level {target.Fortification})." });
            if (g.Tableau.Count > 0 || g.Lightspeed != null) defenceConditions.Add(new BattleCondition { Name = "Garrison", Text = $"{g.Tableau.Count} stationed card{(g.Tableau.Count == 1 ? "" : "s")} start in play." });
            var atk = ArmyBonusOf(s, army);
            var def = guard != null ? ArmyBonusOf(s, guard) : null;
            var ruler = target.Heart == true && owner == null && guard == null && s.Rift != null ? Rifts.ByKind[s.Rift.Kind].Ruler : null;
            var lord = target.Heart == true && owner == null && guard == null && ruler == null ? OverlordById(s.Overlord ?? D.Overlords[0].Id) : null;
            var defenderName = guard != null ? (guard.Lost != null ? ArmyLeader(guard) : $"{ArmyLeader(guard)}'s flagship") : owner != null ? $"{target.Name} Station" : lord != null ? lord.Name : ruler != null ? Cards.Def(ruler).Name : $"{target.Name} Sentinels";
            var defenderDeck = guard != null ? guard.Deck : StationDeck(s, target, owner?.Human == true ? null : owner?.Race);
            var atkShip = FlagshipSetup(s, army);
            var defShip = guard != null ? FlagshipSetup(s, guard) : null;

            var aConds = new List<BattleCondition>();
            aConds.AddRange(fx?.Conditions ?? new List<BattleCondition>());
            if (target.Star == "white" || target.Star == "neutron") aConds.AddRange(starCond);
            aConds.AddRange(def?.FoeConditions ?? new List<BattleCondition>());
            var me = new PlayerSetup
            {
                Name = army.Lost != null ? ArmyLeader(army) : $"{ArmyLeader(army)} ({attacker.Name})",
                IsAI = attacker.IsAI,
                Deck = army.Deck,
                DeckName = $"{ArmyLeader(army)}'s flagship",
                HeatDelta = army.Damage + (def?.FoeHeat ?? 0),
                Modifiers = Merge(fx?.Modifiers, starBoth, atk.Mods, def?.FoeMods ?? None(), atkShip.Hull),
                Skills = atk.Skills.Count > 0 ? atk.Skills : null,
                HeroBoons = atk.Boons.Count > 0 ? new HeroBoons { Hero = army.General, Boons = atk.Boons } : null,
                Relics = atk.Powers.Count > 0 ? atk.Powers : null,
                Hero = atkShip.Hero,
                Tableau = atkShip.Tableau,
                HeroStats = atkShip.HeroStats,
                Rooms = atkShip.Rooms,
                Opening = atkShip.Opening,
                ClosedSlots = army.Owner == s.PlayerId && s.WreckedSlot != null ? new List<int> { s.WreckedSlot.Value } : null,
                Conditions = aConds,
            };
            var foe = new PlayerSetup
            {
                Name = owner != null ? $"{defenderName} ({owner.Name})" : defenderName,
                IsAI = owner?.IsAI ?? true,
                Deck = lord != null ? new List<string>() : defenderDeck,
                HeatDelta = (guard != null ? guard.Damage : target.Damage) + atk.FoeHeat,
                Lightspeed = g.Lightspeed,
            };
            if (lord != null)
            {
                foe.Boss = true;
                foe.BossHealth = OverlordHealth(s.Universe);
            }
            if (defShip != null)
            {
                foe.Hero = defShip.Hero;
                foe.HeroStats = defShip.HeroStats;
                if (defShip.Rooms != null) foe.Rooms = defShip.Rooms;
                if (defShip.Opening != null) foe.Opening = defShip.Opening;
            }
            else if (lord == null)
            {
                if (ruler != null)
                {
                    foe.Hero = ruler;
                    foe.HeroStats = new HeroStats { Attack = T.HeroAttack + 3, Defence = T.HeroDefence + 3 };
                    foe.Rooms = new ShipRooms { Defence = new List<int> { 3, 3, 3, 3, 3 }, Attack = new List<int> { 2, 2, 2, 2, 2 }, Command = 3 };
                }
                else foe.Rooms = StationRooms(target);
            }
            if (lord != null) foe.Tableau = new[] { lord.Hero }.Concat(lord.Parts).ToList();
            else if (ruler != null) foe.Tableau = new List<string> { ruler };
            else
            {
                var t = new List<string>();
                t.AddRange(defShip?.Tableau ?? new List<string>());
                t.AddRange(g.Tableau);
                if ((target.Vault ?? 0) != 0 && owner == null && guard == null && army.Owner == s.PlayerId) t.Add(target.Vault > 1 ? "reliquary_obelisk_2" : "reliquary_obelisk");
                foe.Tableau = t;
            }
            foe.Modifiers = lord != null
                ? Merge(fx?.Modifiers, new BattleModifiers { MaxHealthDelta = OverlordHealth(s.Universe) - Balance.SupernovaAt }, starBoth, atk.FoeMods)
                : ruler != null
                    ? Merge(None(), new BattleModifiers { MaxHealthDelta = 10 + 3 * (s.Universe - 1), ShieldPerTurn = 1, ExtraDraw = 1 }, atk.FoeMods)
                    : CapDefence(Merge(fx?.Modifiers, fortified, wardens, guard != null ? None() : core, starBoth, starDef, def?.Mods ?? None(), atk.FoeMods, defShip?.Hull ?? None()), fx?.Modifiers, guard != null);
            if (def != null && def.Skills.Count > 0) foe.Skills = def.Skills;
            if (guard != null && def.Boons.Count > 0) foe.HeroBoons = new HeroBoons { Hero = guard.General, Boons = def.Boons };
            if (guard != null && def.Powers.Count > 0) foe.Relics = def.Powers;
            var conds = defenceConditions.Concat(atk.FoeConditions).ToList();
            foe.Conditions = conds.Count > 0 ? conds : null;
            return new List<PlayerSetup> { me, foe };
        }

        /// <summary>Plays a battle out with the AI on every seat.</summary>
        public static GameState SimulateBattle(GameState game)
        {
            var g = Json.Clone(game);
            foreach (var p in g.Players) p.IsAI = true;
            int steps = 0;
            while (!Game.IsGameOver(g) && steps++ < T.BattleActionCap) g = Game.Apply(g, AI.Choose(g));
            if (!Game.IsGameOver(g)) g.WinnerId = Game.Draw;
            return g;
        }

        static void MoveArmy(CampaignState s, Army army, string toId)
        {
            var f = FactionById(s, army.Owner);
            if (army.Moved || (army.Steps ?? 0) >= 1 + ArmyBonusOf(s, army).March) throw new GameError($"{ArmyLeader(army)}'s army has already moved this turn.");
            if (army.Refit == true) throw new GameError($"{ArmyLeader(army)}'s army is refitting this turn: it can march next turn.");
            var here = NodeById(s, army.NodeId);
            var target = NodeById(s, toId);
            if (!here.Links.Contains(toId) && !WarpReach(s, army).Contains(toId)) throw new GameError("There is no route between those systems.");
            if (target.Vanished == true) throw new GameError($"{target.Name} is gone into the dark.");
            if (s.Rift?.Kind == "time" && (target.SpinRing ?? 0) > (here.SpinRing ?? 99) && target.Heart != true) throw new GameError("Never outward here");
            if (target.Collapsed == true) throw new GameError($"{target.Name} has collapsed. There is nothing left there.");
            var doom = DoomProblem(s, army, toId);
            if (doom != null) throw new GameError(doom);
            int cool = ArmyBonusOf(s, army).JumpCool;
            if (cool != 0 && army.Damage > Balance.MinHeat) army.Damage = Math.Max(Balance.MinHeat, army.Damage - cool);
            if (target.Challenge != null)
            {
                if (target.Challenge.Hidden || target.Challenge.Done != null || f.Id != s.PlayerId) throw new GameError("There is nothing there to try.");
                if (target.Challenge.Kind == "rift") EnterRift(s, army, target);
                else StartChallenge(s, army, target);
                return;
            }
            if (target.Owner == f.Id || target.Station != null || ((target.Ruined == true || target.Cache != null || target.Prophet == true || target.Encounter != null) && target.Owner == null && ArmyAt(s, toId) == null))
            {
                if (ArmyAt(s, toId) != null) throw new GameError($"{(target.Station != null ? "A ship is already docked at" : "An army already stands in")} {target.Name}.");
                army.NodeId = toId;
                if (target.Cache != null && army.Lost == null) TakeCache(s, f, target, army);
                if (target.Encounter != null && f.Id == s.PlayerId && f.Human == true && army.Lost == null) MeetEncounter(s, f, target);
                if (target.Station?.Kind == "armory" && f.Id == s.PlayerId && s.WreckedSlot != null)
                {
                    Clog(s, $"{target.Name}'s station crews mend the wrecked slot.", target.Id, f.Id);
                    s.WreckedSlot = null;
                }
                if (target.Prophet == true && f.Id == s.PlayerId)
                {
                    target.Prophet = false;
                    target.Owner = f.Id;
                    var offers = ProphetOffers(s, army);
                    if (offers.Count > 0) s.Prophet = new ProphetWaiting { NodeId = target.Id, Offers = offers };
                    Clog(s, $"A Dark Prophet waits at {target.Name}.", target.Id, f.Id);
                }
                if (f.Id == s.PlayerId) MeetEngineer(s, target);
                army.Steps = (army.Steps ?? 0) + 1;
                if (army.Steps >= 1 + ArmyBonusOf(s, army).March) army.Moved = true;
                Clog(s, $"{ArmyLeader(army)}'s army marches to {target.Name}.", new[] { here.Id, toId }, f.Id);
                RivalHere(s, army);
                bool ambush = f.Human == true ? s.Universe >= ExtrasFrom && R(s) < AmbushChance : FlagshipOverheated(s, army) && R(s) < StruggleChance;
                if (f.Id == s.PlayerId && army.Lost == null && s.Prophet == null && s.Struggle == null && s.Beaten == null && ambush)
                {
                    var hero = StruggleRival(s, army);
                    if (hero != null) s.Struggle = new StruggleWaiting { NodeId = toId, Hero = hero, Ambush = true };
                }
                DreamHere(s, army);
                return;
            }
            if (HazardBlocks(target, f.Id)) throw new GameError($"{target.Name} is still reeling from a supernova.");
            if (s.Crystal == true && f.Id == s.PlayerId && f.Human == true && army.Lost == null && s.Rift == null)
            {
                StartCrystal(s, army, target);
                return;
            }
            if (Surrenders(s, army, target))
            {
                army.Moved = true;
                Clog(s, $"{target.Name}'s sentinels surrender to {ArmyLeader(army)} without a fight.", new[] { here.Id, target.Id }, f.Id);
                if (army.Lost == null && R(s) < Heroes.ItemChance + ArmyBonusOf(s, army).Loot) FindItem(s, f, army, target);
                Conquer(s, f, target, army);
                return;
            }
            var problem = army.Lost != null ? null : ArmyDeckProblems(army.Deck, army.General).FirstOrDefault();
            if (problem != null) throw new GameError($"{ArmyLeader(army)}'s deck isn't ready to fight: {problem}");
            army.Moved = true;
            var players = BattleSetup(s, army, target);
            var game = Game.Create(new GameSetup { Seed = BattleSeed(s), Players = players, Campaign = true, Mode = s.Mode });
            var guard = DefenderOf(s, target, army);
            if (guard != null && guard.NodeId != toId) Clog(s, $"{ArmyLeader(guard)} comes from {NodeById(s, guard.NodeId).Name} to defend {target.Name}.", new[] { guard.NodeId, toId }, guard.Owner);
            Clog(s, army.Lost != null ? $"{ArmyLeader(army)} strike from {here.Name} at {target.Name} ({players[1].Name})." : $"{ArmyLeader(army)} leads {f.Name}'s army from {here.Name} against {target.Name} ({players[1].Name}).", new[] { here.Id, target.Id }, f.Id);
            var defenderId = target.Owner ?? (guard != null && guard.Lost == null ? guard.Owner : null);
            s.Battle = new BattleContext { Attacker = f.Id, Defender = defenderId, FromId = here.Id, NodeId = toId, ArmyId = army.Id, DefenderArmyId = guard?.Id, Game = game };
            bool playerInvolved = !f.IsAI || (defenderId != null && !FactionById(s, defenderId).IsAI);
            if (!playerInvolved) ResolveBattle(s, SimulateBattle(game), null, false);
        }

        static void Rout(CampaignState s, Army army)
        {
            var here = NodeById(s, army.NodeId);
            bool Free(CampaignNode n) => n.Owner == army.Owner && n.Collapsed != true && ArmyAt(s, n.Id) == null;
            bool OpenN(CampaignNode n) => n.Collapsed != true && n.Collapsing != true && n.Heart != true && ArmyAt(s, n.Id) == null;
            var refuge = here.Links.Select(id => NodeById(s, id)).FirstOrDefault(Free)
                ?? (army.Lost != null ? null : s.Nodes.Where(Free).OrderBy(n => Hops(s, here.Id, n.Id)).FirstOrDefault())
                ?? (army.Lost != null ? null : here.Links.Select(id => NodeById(s, id)).Where(OpenN).OrderByDescending(n => n.Col ?? 0).FirstOrDefault());
            if (refuge != null)
            {
                army.NodeId = refuge.Id;
                army.Damage = T.MaxDamage;
                Clog(s, $"{ArmyLeader(army)}'s army falls back to {refuge.Name}.", new[] { here.Id, refuge.Id }, army.Owner);
                return;
            }
            NoteFall(s, army);
            s.Armies.Remove(army);
            if (army.Lost != null)
            {
                Clog(s, $"{ArmyLeader(army)} are gone. Another people the dark has taken.", here.Id, army.Owner);
                return;
            }
            Clog(s, $"{Cards.Def(army.General).Name}'s flagship has nowhere left to go.", here.Id, army.Owner);
            CheckEliminated(s, FactionById(s, army.Owner));
        }

        // ---- Salvage and finds ----

        static IEnumerable<CardInstance> AllCards(PlayerState p) => p.Deck.Concat(p.Hand).Concat(p.Tableau).Concat(p.Discard).Concat(p.Wreck ?? new List<CardInstance>()).Concat(p.Fallen ?? new List<CardInstance>());

        public static string SalvageKind(CampaignState s, GameState game)
        {
            var b = s.Battle;
            if (b == null || b.Challenge != null || !Game.IsGameOver(game) || game.WinnerId == null) return null;
            int seat = b.Attacker == s.PlayerId ? 0 : b.Defender == s.PlayerId ? 1 : -1;
            if (seat < 0 || game.Players[seat].Id != game.WinnerId) return null;
            var foe = game.Players[1 - seat];
            var counts = new Dictionary<int, int>();
            var order = new List<int>();
            foreach (var c in AllCards(foe))
            {
                var r = Cards.Def(c.DefId).Race;
                if (r == null) continue;
                if (!counts.ContainsKey(r.Value)) { counts[r.Value] = 0; order.Add(r.Value); }
                counts[r.Value]++;
            }
            int? race = order.Count > 0 ? order.OrderByDescending(r => counts[r]).First() : (int?)null;
            var me = FactionById(s, s.PlayerId);
            return me.Human != true && race != null && race == me.Race ? "defectors" : "prisoners";
        }

        public static List<string> SalvageOptions(CampaignState s, GameState game)
        {
            var kind = SalvageKind(s, game);
            if (kind == null) return new List<string>();
            var b = s.Battle;
            int seat = b.Attacker == s.PlayerId ? 0 : 1;
            var foe = game.Players[1 - seat];
            int myRace = FactionById(s, s.PlayerId).Race;
            var cards = AllCards(foe).ToList();
            if (foe.Lightspeed != null) cards.Add(foe.Lightspeed);
            bool Usable(string id)
            {
                var def = Cards.Def(id);
                return def.Token != true && def.Kind != "command" && def.OverlordPart == null && LegalIn(s.Mode, id);
            }
            var flag = Flagship(s, s.PlayerId);
            bool Room(string id) => flag == null || flag.Deck.Count(x => x == id) < CampaignCopies(id);
            var me = FactionById(s, s.PlayerId);
            bool Fits(string id) => Room(id) && (me.Human == true ? RewardRace(me, Cards.Def(id).Race) : kind == "defectors" ? Cards.Def(id).Race == myRace || Cards.Def(id).Race == null : Cards.Def(id).Race == null);
            var ids = cards.SelectMany(c => new[] { c.DefId }.Concat((c.Fused ?? new List<CardInstance>()).Select(x => x.DefId))).Distinct().Where(id => Usable(id) && Fits(id)).OrderBy(x => x, StringComparer.Ordinal).ToList();
            var next = SpoilsRng(game, b.NodeId);
            List<string> Sh(List<string> list)
            {
                for (int i = list.Count - 1; i > 0; i--)
                {
                    int j = (int)Math.Floor(next() * (i + 1));
                    (list[i], list[j]) = (list[j], list[i]);
                }
                return list;
            }
            int want = T.SalvageChoices + (s.Run?.Salvage ?? 0);
            var o = Sh(ids).Take(want).ToList();
            if (o.Count < want)
            {
                var more = Sh(Pool.Where(c => c.Race == null && c.Fusion != true && c.Kind != "global" && Usable(c.Id) && Room(c.Id) && !o.Contains(c.Id)).Select(c => c.Id).OrderBy(x => x, StringComparer.Ordinal).ToList());
                o.AddRange(more.Take(want - o.Count));
            }
            return o;
        }

        /// <summary>A battle's own random numbers for its spoils: the same every time they're asked for.</summary>
        static Func<double> SpoilsRng(GameState game, string salt)
        {
            unchecked
            {
                int h = game.RngState ^ (int)0x9e3779b9;
                foreach (var ch in salt) h = (int)((uint)(h ^ ch) * 0x01000193u);
                return () =>
                {
                    h = (int)((uint)(h ^ (int)((uint)h >> 15)) * 0x2c1b3c6du) ^ 0x6a09e667;
                    return (uint)h / 4294967296.0;
                };
            }
        }

        static string FindRarity(CampaignNode n, double r, int universe = 1)
        {
            r *= Math.Max(0.55, 1 - 0.07 * Math.Max(0, universe - 1));
            return n.Heart == true || Depth(n) <= 2 ? (r < 0.4 ? "anomaly" : "stellar") : n.Tier >= 1 ? (r < 0.15 ? "anomaly" : r < 0.6 ? "stellar" : "dwarf") : r < 0.25 ? "stellar" : "dwarf";
        }

        public static List<Relic> BattleFinds(CampaignState s, GameState game)
        {
            var none = new List<Relic>();
            var b = s.Battle;
            if (b == null || b.Challenge != null || !Game.IsGameOver(game) || game.WinnerId == null || Game.IsDraw(game)) return none;
            bool attackerWon = game.WinnerId == game.Players[0].Id;
            var fid = attackerWon ? b.Attacker : b.Defender;
            var f = fid != null ? s.Factions.FirstOrDefault(x => x.Id == fid) : null;
            if (f == null || f.Lost == true) return none;
            var army = s.Armies.FirstOrDefault(a => a.Id == (attackerWon ? b.ArmyId : b.DefenderArmyId));
            var n = NodeById(s, b.NodeId);
            var next = SpoilsRng(game, $"{b.NodeId}:finds");
            int uid = s.UidCounter;
            var items = new List<Relic>();
            if (next() < Heroes.ItemChance + (army != null ? ArmyBonusOf(s, army).Loot : 0))
            {
                var slots = Heroes.RaceSlots[f.Race];
                var slot = slots[(int)Math.Floor(next() * slots.Count)].Kind;
                var rarity = FindRarity(n, next(), s.Universe);
                double roll = next();
                items.Add(Heroes.MakeRelic($"item{++uid}", slot, rarity, f.Race, roll, f.Relics ?? new List<Relic>()));
            }
            return items;
        }

        public static List<Relic> VaultFinds(CampaignState s, GameState game)
        {
            var b = s.Battle;
            if (b == null || b.Challenge != null || !Game.IsGameOver(game) || game.VaultOpened != true || b.Attacker != s.PlayerId) return new List<Relic>();
            var n = NodeById(s, b.NodeId);
            var f = FactionById(s, b.Attacker);
            var next = SpoilsRng(game, $"{b.NodeId}:vault");
            int uid = s.UidCounter + 10;
            var held = (f.Relics ?? new List<Relic>()).Concat(BattleFinds(s, game)).ToList();
            var o = new List<Relic>();
            for (int i = 0; i < (n.Vault ?? 0); i++)
            {
                var slots = Heroes.RaceSlots[f.Race];
                var slot = slots[(int)Math.Floor(next() * slots.Count)].Kind;
                var rarity = FindRarity(n, next(), s.Universe);
                var relic = Heroes.MakeRelic($"item{++uid}", slot, rarity, f.Race, next(), held);
                held.Add(relic);
                o.Add(relic);
            }
            return o;
        }

        static void TakeFinds(CampaignState s, GameState game)
        {
            var vault = VaultFinds(s, game);
            if (vault.Count > 0)
            {
                var b = s.Battle;
                var me = Player(s);
                (me.Relics ??= new List<Relic>()).AddRange(vault);
                s.UidCounter += 10 + vault.Count;
                NodeById(s, b.NodeId).Vault = null;
                Clog(s, $"{me.Name} breaks open the emblem cache: {string.Join(" and ", vault.Select(r => r.Name))}.", b.NodeId, me.Id);
                FindPart(s, PartChanceVault);
            }
            var items = BattleFinds(s, game);
            if (items.Count == 0) return;
            var bb = s.Battle;
            var f = FactionById(s, game.WinnerId == game.Players[0].Id ? bb.Attacker : bb.Defender);
            s.UidCounter += items.Count;
            (f.Relics ??= new List<Relic>()).AddRange(items);
            foreach (var r in items) Clog(s, $"{f.Name} finds {r.Name}.", bb.NodeId, f.Id);
            Clog(s, $"{f.Name} finds {string.Join(" and ", items.Select(x => x.Name))} in the wreckage.", bb.NodeId, f.Id);
            if (f.IsAI)
            {
                AiEquip(f);
                AiFitModules(f);
            }
        }

        public static bool SalvageToDeck(CampaignState s, string id)
        {
            var b = s.Battle;
            if (b == null) return false;
            var want = b.Attacker == s.PlayerId ? b.ArmyId : b.Defender == s.PlayerId ? b.DefenderArmyId : null;
            var army = s.Armies.FirstOrDefault(a => a.Id == want);
            return army != null && DeckAddProblemFor(FactionById(s, s.PlayerId), army, id) == null;
        }

        static void GainCard(CampaignState s, Faction f, string id)
        {
            var army = Flagship(s, f.Id);
            if (army != null && DeckAddProblemFor(f, army, id) == null) army.Deck.Add(id);
            else f.Reserve.Add(id);
        }

        static void TakeSalvage(CampaignState s, Faction f, Army army, string id, string verb = "salvages")
        {
            f.Reserve.Add(id);
            if (army != null && army.Owner == f.Id && DeckAddProblem(f, army, id) == null)
            {
                f.Reserve.RemoveAt(f.Reserve.LastIndexOf(id));
                army.Deck.Add(id);
                Clog(s, $"{f.Name} {verb} {Cards.Def(id).Name}: it joins {ArmyLeader(army)}'s deck.", army.NodeId, f.Id);
            }
            else Clog(s, $"{f.Name} {verb} {Cards.Def(id).Name}: it waits in the reserve.", (string)null, f.Id);
        }

        static void OverlordBounty(CampaignState s, Faction f, Army army)
        {
            var lordName = s.Rift != null ? Cards.Def(Rifts.ByKind[s.Rift.Kind].Ruler).Name : OverlordById(s.Overlord ?? D.Overlords[0].Id).Name;
            int petals = Math.Max(1, Round(T.BossPetals * s.Universe * (1 + (s.Run?.PetalBonus ?? 0)))) + (s.Run?.Tithe ?? 0);
            s.Petals += petals;
            GainXp(s, T.XpBoss);
            Clog(s, $"{lordName} falls: {f.Name} gathers {petals} Stellari petal{(petals == 1 ? "" : "s")} from its remains.", (string)null, f.Id);
            if (f.Id == s.PlayerId) FindPart(s, 1, true);
            bool Fits(string id) => RarityOf(id) != "dwarf" && Cards.Def(id).Kind != "command" && (army == null || DeckAddProblemFor(f, army, id) == null);
            var hoard = Shuffle(s, RiftPool(s) ?? OfferPool(f, s.Mode, s.Universe)).Distinct().Where(Fits).Take(T.BossCardChoices + (s.Run?.Vault ?? 0)).ToList();
            var options = f.Id == s.PlayerId ? WithEnigma(s, hoard, true) : hoard;
            if (options.Count > 0) s.CardRewards.Add(new CardReward { Source = $"{lordName}'s hoard", Options = options, ToDeck = army?.Id, Take = "claims" });
        }

        /// <summary>A battle handed back. <paramref name="salvage"/>: the card taken; null with <paramref name="salvageNone"/> false: owed as a choice.</summary>
        static void ResolveBattle(CampaignState s, GameState game, string salvage, bool salvageNone)
        {
            var b = s.Battle;
            if (b == null) throw new GameError("There is no battle to finish.");
            if (!Game.IsGameOver(game)) throw new GameError("That battle is not over yet.");
            NoteActs(s, game);
            if (b.Crystal != null) { ResolveCrystal(s, game); return; }
            if (b.Challenge != null) { ResolveChallenge(s, game); return; }
            if (b.Struggle != null) { ResolveStruggle(s, game); return; }
            if (b.Encounter != null) { ResolveEncounterFight(s, game); return; }
            if (b.Dream != null) { ResolveDream(s, game); return; }
            var salvageable = SalvageOptions(s, game);
            if (!string.IsNullOrEmpty(salvage) && !salvageable.Contains(salvage)) throw new GameError("That card is not there to salvage.");
            TakeFinds(s, game);
            s.Battle = null;
            var attacker = FactionById(s, b.Attacker);
            var defender = b.Defender != null ? FactionById(s, b.Defender) : null;
            var target = NodeById(s, b.NodeId);
            var army = s.Armies.FirstOrDefault(a => a.Id == b.ArmyId);
            var guard = b.DefenderArmyId != null ? s.Armies.FirstOrDefault(a => a.Id == b.DefenderArmyId) : null;
            bool attackerWon = game.WinnerId == game.Players[0].Id;
            bool draw = Game.IsDraw(game);
            var winnerSeat = attackerWon ? game.Players[0] : game.Players[1];
            var winner = draw ? null : attackerWon ? attacker : defender;
            int carried = Math.Max(0, Math.Min(T.MaxDamage, winnerSeat.Heat));
            int flagHeat = Math.Max(Balance.MinHeat, winnerSeat.Heat);
            if (draw) { }
            else if (attackerWon)
            {
                if (army != null) army.Damage = flagHeat;
            }
            else
            {
                if (guard != null) guard.Damage = flagHeat;
                else target.Damage = carried;
                if (army != null) army.Damage = Math.Min(T.MaxDamage, army.Damage + T.ArmyRepelledDamage);
            }
            if (salvageable.Count > 0)
            {
                var f = FactionById(s, s.PlayerId);
                var mine = attackerWon ? army : guard;
                if (!string.IsNullOrEmpty(salvage)) TakeSalvage(s, f, mine, salvage);
                // (As campaign.ts: the battle is already let go when its salvage is named, so an owed choice always
                // reads as freed prisoners. Kept the same until the TypeScript is fixed.)
                else if (!salvageNone) s.CardRewards.Add(new CardReward { Source = SalvageKind(s, game) == "defectors" ? "Defectors" : "Freed prisoners", Options = salvageable, ToDeck = mine?.Id });
            }
            if (winner?.Id == s.PlayerId) GainXp(s, T.XpBattle);
            else if (b.Attacker == s.PlayerId || b.Defender == s.PlayerId) GainXp(s, T.XpBattleLost);
            if (attackerWon && army != null && army.Owner == s.PlayerId && (s.Run?.Favour ?? 0) != 0) army.Damage = Math.Max(Balance.MinHeat, army.Damage - s.Run.Favour);
            if (winner != null)
            {
                winner.Materials += T.WinMaterials + (winner.Id == s.PlayerId ? s.Run?.Plunder ?? 0 : 0);
                if (winner.Id == s.PlayerId && (s.Run?.Legacy ?? 0) != 0) s.Petals += s.Run.Legacy.Value;
                winner.Stats.BattlesWon += 1;
                if (game.Round <= 6) winner.Stats.SwiftWins += 1;
                if (winnerSeat.Heat <= 0) winner.Stats.ColdWins += 1;
                if (!attackerWon) winner.Stats.Defences += 1;
            }
            if (attackerWon)
            {
                Clog(s, $"{attacker.Name} wins the battle for {target.Name}.", target.Id, attacker.Id);
                if (guard?.Lost != null)
                {
                    attacker.Materials += T.LostRelicMaterials;
                    Clog(s, $"{attacker.Name} takes the emblems of the {guard.Lost}: +{T.LostRelicMaterials} materials.", target.Id, attacker.Id);
                    if (!attacker.IsAI) s.CardRewards.Add(new CardReward { Source = $"Emblems of the {guard.Lost}", Options = RandomCardChoices(s, attacker) });
                }
                if (guard?.NodeId == target.Id) Rout(s, guard);
                else if (guard != null) guard.Damage = T.MaxDamage;
                Conquer(s, attacker, target, army);
            }
            else if (draw) Clog(s, $"The battle for {target.Name} ends in a draw: {attacker.Name}'s attack is held off.", target.Id, attacker.Id);
            else Clog(s, $"{target.Name} holds: {attacker.Name}'s attack is repelled.", target.Id, attacker.Id);
            string playerSide = b.Attacker == s.PlayerId ? "attacker" : b.Defender == s.PlayerId ? "defender" : null;
            if (!draw && playerSide != null && (playerSide == "attacker") != attackerWon) PlayerFalls(s);
        }

        static void GainXp(CampaignState s, int amount) => s.Xp = (s.Xp ?? 0) + Round(amount * (1 + (s.Run?.XpBonus ?? 0)));

        static void PlayerFalls(CampaignState s)
        {
            var f = FactionById(s, s.PlayerId);
            var army = Flagship(s, f.Id);
            if (army != null)
            {
                NoteFall(s, army);
                s.Armies.Remove(army);
                Clog(s, $"{Cards.Def(army.General).Name}'s flagship is destroyed.", army.NodeId, f.Id);
            }
            f.Eliminated = true;
            CheckVictory(s);
        }

        static void Conquer(CampaignState s, Faction f, CampaignNode n, Army army)
        {
            var spoils = n.Garrison.Select(g => g.DefId).ToList();
            f.Reserve.AddRange(spoils);
            n.Garrison = new List<GarrisonCard>();
            if (spoils.Count > 0) Clog(s, $"{f.Name} seizes {string.Join(", ", spoils.Select(id => Cards.Def(id).Name))} from {n.Name}.", n.Id, f.Id);
            if (f.Id == s.PlayerId && n.Heart != true) GainXp(s, T.XpConquer);
            if (n.Heart == true)
            {
                if (army != null && s.Armies.Contains(army)) army.NodeId = n.Id;
                if (f.Id == s.PlayerId) OverlordBounty(s, f, army);
                if (f.Id == s.PlayerId && s.Rift?.Kind == "time") s.EmblemChoice = SerenEmblems(s);
                CrossWormhole(s, f);
                return;
            }
            if (f.Id == s.PlayerId && f.Stats.Settled + f.Stats.Absorbed + f.Stats.Novas == 0) Tell(s, Story.FirstConquestScene());
            n.Home = null;
            n.Gate = null;
            int materials = n.Yield.Materials;
            f.Materials += materials;
            if ((n.Bonus?.Materials ?? 0) != 0) f.Materials += n.Bonus.Materials.Value;
            var extra = (n.Bonus?.Materials ?? 0) != 0 ? $" and {n.Bonus.Materials} more from its stores" : "";
            n.Bonus = null;
            n.Yield = new NodeYield { Materials = 0 };
            n.Damage = 0;
            n.Fortification = 0;
            n.Owner = f.Id;
            f.Stats.Settled += 1;
            s.Conquered += 1;
            if (f.Id == s.PlayerId) s.StarsTaken = (s.StarsTaken ?? 0) + 1;
            Clog(s, $"{f.Name} conquers {n.Name}: +{materials} materials{extra}.", n.Id, f.Id);
            RevealChallenges(s, f, n);
            if (army != null && s.Armies.Contains(army) && ArmyAt(s, n.Id) == null) army.NodeId = n.Id;
            if (army != null && s.Armies.Contains(army)) RivalHere(s, army);
            if (army != null && s.Armies.Contains(army)) DreamHere(s, army);
        }

        static void RevealChallenges(CampaignState s, Faction f, CampaignNode n)
        {
            if (f.Id != s.PlayerId) return;
            foreach (var c in s.Nodes)
            {
                if (c.Challenge?.Hidden != true || c.Challenge.From != n.Id) continue;
                c.Challenge.Hidden = false;
                Clog(s, $"{f.Name} finds a hidden route from {n.Name}: {D.Challenges[c.Challenge.Kind].Name}.", new[] { n.Id, c.Id }, f.Id);
            }
        }

        static void PlaceChallenges(CampaignState s, int count)
        {
            int C = T.Columns;
            double gap = T.LaneGap;
            var kindList = new List<string> { "mine", "frost", "rift" };
            if (D.LostLords.Any(id => s.LordsWon?.Contains(id) != true)) kindList.Add("lord");
            var kinds = Shuffle(s, kindList).Take(count).ToList();
            var hosts = Shuffle(s, s.Nodes.Where(n => n.Heart != true && n.Home == null && n.Station == null && (n.Col ?? 0) >= 2 && (n.Col ?? 0) <= C - 2).ToList());
            double SegDist(double px, double py, CampaignNode a, CampaignNode b)
            {
                double vx = b.X - a.X, vy = b.Y - a.Y, len = vx * vx + vy * vy;
                if (len == 0) len = 1;
                double t = Math.Max(0, Math.Min(1, ((px - a.X) * vx + (py - a.Y) * vy) / len));
                return Hypot(px - (a.X + vx * t), py - (a.Y + vy * t));
            }
            (double x, double y)? Spot(CampaignNode from)
            {
                var lane = s.Nodes.Where(n => n.Lane == from.Lane && n.Challenge == null && Math.Abs((n.Col ?? 0) - (from.Col ?? 0)) == 1).ToList();
                CampaignNode a, b;
                if (lane.Count == 2) { a = lane[0]; b = lane[1]; }
                else { a = from; b = lane.FirstOrDefault() ?? from; }
                double tx = b.X - a.X, ty = b.Y - a.Y;
                double tl = Hypot(tx, ty);
                if (tl == 0) tl = 1;
                tx /= tl;
                ty /= tl;
                var sides = Shuffle(s, new List<int> { 1, -1 });
                foreach (var side in sides)
                {
                    double x = from.X - ty * side * gap * 0.62, y = from.Y + tx * side * gap * 0.62;
                    if (x < 60 || y < 60 || x > T.MapWidth - 60 || y > T.MapHeight - 60) continue;
                    if (s.Nodes.Any(n => n != from && Hypot(n.X - x, n.Y - y) < gap * 0.55)) continue;
                    bool clear = s.Nodes.All(n => n.Links.All(id =>
                    {
                        var m = s.Nodes.First(k => k.Id == id);
                        return n == from || m == from || SegDist(x, y, n, m) > 95;
                    }));
                    if (clear) return (x, y);
                }
                return null;
            }
            int hi = 0;
            foreach (var kind in kinds)
            {
                CampaignNode from = null;
                (double x, double y)? at = null;
                while (hi < hosts.Count && at == null)
                {
                    from = hosts[hi++];
                    at = Spot(from);
                }
                if (from == null || at == null) return;
                string lord = kind == "lord" ? Shuffle(s, D.LostLords.Where(id => s.LordsWon?.Contains(id) != true).ToList()).FirstOrDefault() : null;
                var node = new CampaignNode
                {
                    Id = $"n{s.Nodes.Count}",
                    Name = D.Challenges[kind].Name,
                    X = at.Value.x,
                    Y = at.Value.y,
                    H = from.H,
                    Planets = new List<MapPlanet>(),
                    Owner = null,
                    Links = new List<string> { from.Id },
                    Fortification = 0,
                    Damage = 0,
                    Garrison = new List<GarrisonCard>(),
                    Hazard = new List<string>(),
                    Yield = new NodeYield { Materials = 0 },
                    Tier = from.Tier,
                    Col = from.Col,
                    Lane = from.Lane,
                    Challenge = new NodeChallenge { Kind = kind, Hidden = true, From = from.Id, Lord = lord, Rift = kind == "rift" ? Rifts.RiftKinds[RInt(s, Rifts.RiftKinds.Count)] : null },
                };
                from.Links.Add(node.Id);
                s.Nodes.Add(node);
            }
        }

        static void StartChallenge(CampaignState s, Army army, CampaignNode target)
        {
            var f = FactionById(s, army.Owner);
            var kind = target.Challenge.Kind;
            army.Moved = true;
            var me = BattleSetup(s, army, target)[0];
            int level = s.FrostLevel ?? 0;
            var lord = target.Challenge.Lord ?? D.LostLords[0];
            var frost = D.FrostLines[Math.Min(level, D.FrostLines.Count - 1)];
            PlayerSetup side = kind == "mine"
                ? new PlayerSetup { Name = "The Antimatter Mine", IsAI = true, Deck = new List<string>(), Boss = true, Tableau = Enumerable.Repeat("antimatter_crystal", 5).ToList() }
                : kind == "frost"
                    ? new PlayerSetup { Name = $"The Frost Line{(level != 0 ? $" ({level + 1})" : "")}", IsAI = true, Deck = new List<string>(), Boss = true, Tableau = new[] { "rime_golem" }.Concat(frost.Start).ToList() }
                    : new PlayerSetup { Name = Cards.Def(lord).Name, IsAI = true, Deck = new List<string>(), Boss = true, BossLeader = lord, BossHealth = 18 + 3 * (s.Universe - 1), Tableau = new List<string> { lord, "lost_retinue", "lost_retinue" } };
            var challenge = kind == "mine"
                ? new Challenge { Kind = kind, Days = 6, Spawn = new List<string> { "antimatter_crystal" }, Per = 2, Broken = 0 }
                : kind == "frost"
                    ? new Challenge { Kind = kind, Broken = 0, Days = frost.Waves.Days, Spawn = frost.Waves.Spawn.ToList(), Per = frost.Waves.Per }
                    : new Challenge { Kind = kind, Broken = 0 };
            var game = Game.Create(new GameSetup { Seed = BattleSeed(s), Players = new List<PlayerSetup> { me, side }, Campaign = true, Mode = s.Mode, Challenge = challenge });
            Clog(s, $"{ArmyLeader(army)} takes on {D.Challenges[kind].Name}.", new[] { army.NodeId, target.Id }, f.Id);
            s.Battle = new BattleContext { Attacker = f.Id, Defender = null, FromId = army.NodeId, NodeId = target.Id, ArmyId = army.Id, DefenderArmyId = null, Game = game, Challenge = new BattleChallenge { Kind = kind, Damage = army.Damage } };
        }

        static void ResolveChallenge(CampaignState s, GameState game)
        {
            var b = s.Battle;
            s.Battle = null;
            var f = FactionById(s, b.Attacker);
            var army = s.Armies.FirstOrDefault(a => a.Id == b.ArmyId);
            var n = NodeById(s, b.NodeId);
            var c = n.Challenge;
            bool won = AttackerWon(game);
            c.Done = won ? "won" : "lost";
            if (f.Id == s.PlayerId) GainXp(s, won ? T.XpChallenge : T.XpBattleLost);
            if (!won)
            {
                n.Dimmed = true;
                if (army != null) army.Damage = b.Challenge.Damage;
                Clog(s, $"{f.Name}'s flagship is thrown clear of {n.Name}, battered but whole. It will not let them in again.", n.Id, f.Id);
                return;
            }
            if (army != null) army.Damage = Math.Max(Balance.MinHeat, game.Players[0].Heat);
            if (c.Kind == "mine")
            {
                int broken = game.Challenge?.Broken ?? 0;
                f.Materials += broken * 3;
                Clog(s, $"{f.Name} breaks {broken} antimatter crystal{(broken == 1 ? "" : "s")} in {n.Name}: +{broken * 3} materials.", n.Id, f.Id);
            }
            else if (c.Kind == "lord")
            {
                var lord = c.Lord ?? D.LostLords[0];
                (s.LordsWon ??= new List<string>()).Add(lord);
                if (army != null) army.Deck.Add(lord);
                else f.Reserve.Add(lord);
                Clog(s, $"{Cards.Def(lord).Name} is beaten, and joins {f.Name}'s flagship.", n.Id, f.Id);
            }
            else
            {
                s.FrostLevel = (s.FrostLevel ?? 0) + 1;
                s.Boon = new BoonWaiting { Source = n.Name };
                Clog(s, $"{f.Name} holds {n.Name}.", n.Id, f.Id);
            }
        }

        static void TakeCache(CampaignState s, Faction f, CampaignNode n, Army army)
        {
            var c = n.Cache;
            n.Cache = null;
            n.Owner = f.Id;
            n.Yield = new NodeYield { Materials = 0 };
            s.Conquered += 1;
            if (f.Id == s.PlayerId) s.StarsTaken = (s.StarsTaken ?? 0) + 1;
            RevealChallenges(s, f, n);
            if (c.Kind == "relic")
            {
                FindItem(s, f, army, n);
                return;
            }
            if (c.Kind == "materials") f.Materials += c.Amount;
            else if (!f.IsAI) s.CardRewards.Add(new CardReward { Source = $"A derelict at {n.Name}", Options = RandomCardChoices(s, f) });
            var what = c.Kind == "cards" ? "a derelict, with cards to choose from" : $"{c.Amount} {c.Kind}";
            Clog(s, $"{f.Name} finds {what} at {n.Name}.", n.Id, f.Id);
        }

        static void FindItem(CampaignState s, Faction f, Army army, CampaignNode n)
        {
            var rarity = FindRarity(n, R(s), s.Universe);
            var slots = Heroes.RaceSlots[f.Race];
            var kind = slots[RInt(s, slots.Count)].Kind;
            var relic = Heroes.MakeRelic($"item{++s.UidCounter}", kind, rarity, f.Race, R(s), f.Relics ?? new List<Relic>());
            (f.Relics ??= new List<Relic>()).Add(relic);
            Clog(s, $"{Cards.Def(army.General).Name}'s army finds {relic.Name} in {n.Name}.", n.Id, f.Id);
            if (f.Id == s.PlayerId && !f.IsAI) s.Loot = new Loot { Won = true, Materials = 0, Xp = 0, Petals = 0, Relics = new List<Relic> { relic }, Cards = new List<string>(), Parts = new List<string>(), Found = n.Name };
        }

        static void FitModule(Faction f, ShipModule m, int room)
        {
            var mods = f.Ship.Modules ??= new List<ShipModule> { null, null, null, null, null };
            var old = mods[room];
            mods[room] = m;
            f.Modules = (f.Modules ?? new List<ShipModule>()).Where(x => x != m).ToList();
            if (old != null) f.Modules.Add(old);
        }

        static void AiFitModules(Faction f)
        {
            foreach (var m in (f.Modules ?? new List<ShipModule>()).OrderByDescending(Modules.ModuleValue).ToList())
            {
                int? room = new[] { 2, 1, 3, 0, 4 }.Cast<int?>().FirstOrDefault(r => f.Ship.Modules == null || f.Ship.Modules[r.Value] == null || Modules.ModuleValue(f.Ship.Modules[r.Value]) < Modules.ModuleValue(m));
                if (room != null) FitModule(f, m, room.Value);
            }
        }

        static void AiEquip(Faction f)
        {
            foreach (var item in (f.Items ?? new List<Item>()).ToList())
            {
                var hero = f.Hero ?? Story.Generals[f.Race][0];
                var h = HeroStateOf(f, hero);
                var slot = Heroes.RaceSlots[f.Race].FirstOrDefault(x => x.Kind == item.Slot && (!h.Gear.ContainsKey(x.Id) || h.Gear[x.Id] == null || Heroes.ItemValue(h.Gear[x.Id]) < Heroes.ItemValue(item)));
                if (slot == null) continue;
                h.Gear.TryGetValue(slot.Id, out var old);
                h.Gear[slot.Id] = item;
                f.Items = f.Items.Where(x => x != item).ToList();
                if (old != null) f.Items.Add(old);
            }
        }

        static void TakeResearch(CampaignState s, Faction f, CampaignNode n, string projectId)
        {
            var why = ResearchProblem(s, f, n, projectId);
            if (why != null) throw new GameError(why);
            var st = n.Station;
            st.TakenBy = f.Id;
            st.Project = projectId;
            n.Owner = f.Id;
            (f.Research ??= new ResearchState { Done = new List<string>() }).Done.Add(projectId);
            Clog(s, $"{f.Name} takes {Research.ResearchProject(projectId).Name} from {n.Name}'s research station.", n.Id, f.Id);
        }

        static void BuyCard(CampaignState s, Faction f, CampaignNode n, int index)
        {
            var why = BuyProblem(s, f, n, index);
            if (why != null) throw new GameError(why);
            var st = n.Station;
            var id = st.Cards[index];
            f.Materials -= BuyPrice(s, f, id);
            st.Cards.RemoveAt(index);
            (st.Used ??= new StationUsed()).Buy = true;
            Clog(s, $"{f.Name} buys {Cards.Def(id).Name} at {n.Name}'s space station.", n.Id, f.Id);
            GainCard(s, f, id);
        }

        static void CheckEliminated(CampaignState s, Faction f)
        {
            if (f.Eliminated || f.Lost == true || ArmiesOf(s, f.Id).Count > 0) return;
            f.Eliminated = true;
            s.AiQueue = s.AiQueue.Where(id => id != f.Id).ToList();
            Clog(s, $"{f.Name}'s flagship is lost.");
            CheckVictory(s);
        }

        static void Collapse(CampaignState s, CampaignNode n)
        {
            var army = ArmyAt(s, n.Id);
            n.Collapsing = false;
            n.Collapsed = true;
            n.Owner = null;
            n.Garrison = new List<GarrisonCard>();
            n.Fortification = 0;
            n.Damage = 0;
            n.Hazard = new List<string>();
            n.Yield = new NodeYield { Materials = 0 };
            n.Stellaria = n.Stellaria == null ? (int?)null : 0;
            n.Home = null;
            Clog(s, $"{n.Name} collapses into the dark.", n.Id);
            if (army != null)
            {
                NoteFall(s, army);
                s.Armies.Remove(army);
                Clog(s, $"{ArmyLeader(army)}{(army.Lost != null ? "" : "'s flagship")} goes down with {n.Name}.", n.Id, army.Owner);
                CheckEliminated(s, FactionById(s, army.Owner));
            }
        }

        static void MarkCollapses(CampaignState s)
        {
            int col = s.CollapseCol;
            var marked = s.Nodes.Where(x => x.Col == col && x.Collapsed != true).ToList();
            s.CollapseCol += 1;
            if (marked.Count == 0) return;
            foreach (var n in marked) n.Collapsing = true;
            Clog(s, $"Column {col + 1} of the strip is collapsing: it will be gone next turn.", marked.Select(n => n.Id));
            Tell(s, Story.CollapseScene());
        }

        static void NoteFall(CampaignState s, Army army)
        {
            if (army.Owner == s.PlayerId && army.Lost == null && s.FallenDeck == null) s.FallenDeck = army.Deck.ToList();
        }

        public static List<string> KeepableCards(CampaignState s)
        {
            var f = Player(s);
            var pool = (s.FallenDeck ?? Flagship(s, f.Id)?.Deck ?? new List<string>()).Concat(f.Reserve).ToList();
            if (s.KeptIn != null)
            {
                int i = pool.IndexOf(s.KeptIn);
                if (i >= 0) pool.RemoveAt(i);
            }
            var companions = new HashSet<string>(s.Run?.Companions ?? new List<string>());
            return pool.Distinct().Where(id =>
            {
                var c = Pool.FirstOrDefault(x => x.Id == id);
                return c != null && c.Kind != "command" && c.Token != true && !companions.Contains(id);
            }).ToList();
        }

        static void CheckVictory(CampaignState s)
        {
            if (s.Winner != null) return;
            var player = Player(s);
            if (!player.Eliminated && ArmiesOf(s, player.Id).Count == 0) player.Eliminated = true;
            if (!player.Eliminated) return;
            s.Winner = "none";
            Clog(s, $"The run is over, in galaxy {s.Universe}, with {s.Petals} petal{(s.Petals == 1 ? "" : "s")} grabbed.");
            Tell(s, Story.RunOverScene(s.Universe));
        }

        public static int WormholePetals(CampaignState s)
        {
            int systems = s.Nodes.Count(n => n.Heart != true && n.Home == null && n.Challenge == null);
            double share = Math.Min(1, s.Conquered / (double)Math.Max(1, systems));
            return Math.Max(1, Round((T.PetalBase + T.PetalShare * share) * (1 + 0.5 * (s.Universe - 1)) * (1 + (s.Run?.PetalBonus ?? 0))));
        }

        static void CrossWormhole(CampaignState s, Faction f)
        {
            int petals = WormholePetals(s);
            s.Petals += petals;
            if (f.Id == s.PlayerId)
            {
                GainXp(s, T.XpGalaxy);
                if ((s.Run?.Hoard ?? 0) != 0)
                {
                    f.Materials += s.Run.Hoard;
                    Clog(s, $"The Founders' Hoard opens: +{s.Run.Hoard} materials.", (string)null, f.Id);
                }
            }
            Clog(s, $"{f.Name} takes the wormhole, grabbing {petals} Stellari petal{(petals == 1 ? "" : "s")} on the way through.");
            Tell(s, Story.WormholeCrossedScene(s.Universe, petals));
            s.Rift = null;
            s.Spin = null;
            s.RingSpins = null;
            BuildUniverse(s, s.Universe + 1);
        }
    }
}
