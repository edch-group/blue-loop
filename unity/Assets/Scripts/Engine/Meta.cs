using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace BlueLoop.Engine
{
    /// <summary>What a run starts with and is played under, bought between runs (meta.ts RunBonuses).</summary>
    public class RunBonuses
    {
        public int Materials;
        /// <summary>Extra race cards in the starting deck, and card picks to add to it.</summary>
        public int Cards;
        public int Picks;
        public int Hull;
        public int Shields;
        public int Walls;
        /// <summary>Extra turns of regional stability in every universe.</summary>
        public int Grace;
        public int ArmoryDiscount;
        /// <summary>Share more petals at each wormhole (0.2 a level).</summary>
        public double PetalBonus;
        public int Salvage;
        /// <summary>Materials whenever the flagship enters a new galaxy (Founders' Hoard).</summary>
        public int Hoard;
        /// <summary>How much the flagship's sun cools after every battle it wins (Stellari's Favour).</summary>
        public int Favour;
        /// <summary>Cards bought into the starting deck (for the run's race).</summary>
        public List<string> Deck;
        /// <summary>The flagship's battles: its sun's start, health, shields and cooling, its hand and energy.</summary>
        public BattleModifiers Mods;
        public int? Mend;
        public double? Loot;
        public int? Heirloom;
        public int? Stock;
        public int? Legacy;
        public int? Plunder;
        /// <summary>The Captain's ship as fitted (parts.ts), and the parts already in the hangar.</summary>
        public ShipFit Ship;
        public List<string> Hangar;
        /// <summary>The Captain's companions' cards (companions.ts), as their trees have made them.</summary>
        public List<string> Companions;
        /// <summary>A card kept from the last run, in the starting deck this run.</summary>
        public string Kept;
        public int? Spared;
        /// <summary>Stages of Kaelen's hunters beaten in runs before (encounters.ts).</summary>
        public int? Hunters;
        /// <summary>The races the Captain's rewards lean to (Kinship, Fellowship), and how far.</summary>
        public Affinity Affinity;
        public double? XpBonus;
        public int? Choices;
        public int? Tithe;
        public int? Vault;
    }

    /// <summary>What must be bought first: an upgrade, to a level (written as TS's [id, level] pair).</summary>
    [JsonConverter(typeof(MetaRequirementConverter))]
    public class MetaRequirement
    {
        public string Id;
        public int Level;
    }

    class MetaRequirementConverter : JsonConverter
    {
        public override bool CanConvert(Type t) => t == typeof(MetaRequirement);

        public override object ReadJson(JsonReader reader, Type t, object existing, JsonSerializer s)
        {
            var a = JArray.Load(reader);
            return new MetaRequirement { Id = (string)a[0], Level = (int)a[1] };
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer s)
        {
            var r = (MetaRequirement)value;
            new JArray(r.Id, r.Level).WriteTo(writer);
        }
    }

    /// <summary>A skill on the Stellari's tree, or an unlock (meta.ts MetaUpgrade; its price flat or rising, as data).</summary>
    public class MetaUpgrade
    {
        public string Id;
        /// <summary>'sun', 'command', 'flagship', 'perk', 'start', 'spoils', 'lore' or 'unlock'.</summary>
        public string Group;
        public string Name;
        /// <summary>What the next level gives (or, at the most, what it gives now).</summary>
        public string Text;
        /// <summary>Levels it can be bought to.</summary>
        public int Max;
        /// <summary>Its tier in its branch (1, 2, then the capstone, 3).</summary>
        public int? Tier;
        public List<MetaRequirement> Requires;
        /// <summary>The price of the first level, and how much more each level after.</summary>
        public int CostBase;
        public int CostStep;

        /// <summary>
        /// The price of the level after `level`: petals, for unlocks. (For the skill tree, what it once cost in XP,
        /// kept to bring older saves up to date.)
        /// </summary>
        public int Cost(int level) => CostBase + CostStep * level;
    }

    /// <summary>The Captain, as skill points have made them (meta.ts CaptainMeta: an ascent, and what is carried).</summary>
    public class CaptainMeta
    {
        /// <summary>The ascent (unset in an older build, from before tiers).</summary>
        public List<string> Nodes;
        public int? Gates;
        public List<string> Equipped;
        public string Lead;
        /// <summary>The singularity chosen (unset: the first, Back to the Wall).</summary>
        public string Sing;
        /// <summary>An older build, from before skill points (read only to refund it: migrateMeta).</summary>
        public int? Attack, Stability, Cheaper, Slots;
        public List<string> Abilities;
        public List<string> Leads;

        public CaptainMeta Copy() => (CaptainMeta)MemberwiseClone();
        public AscentState Ascent() => new AscentState { Nodes = Nodes ?? new List<string>(), Gates = Gates ?? 0 };
    }

    /// <summary>A companion as kept: their experience and their ascent (meta.ts CompanionMeta).</summary>
    public class CompanionMeta
    {
        public double Xp;
        /// <summary>Unset in an older build, from before tiers (it starts afresh).</summary>
        public List<string> Nodes;
        public int? Gates;
    }

    /// <summary>The races Kinship and Fellowship lean the Captain's rewards to.</summary>
    public class MetaAffinity
    {
        public int? Primary;
        public int? Secondary;
    }

    /// <summary>What a player has banked and bought (kept on the account).</summary>
    public class MetaState
    {
        public int Petals;
        /// <summary>Experience earned in all, every run (never spent: it makes the commander's level).</summary>
        public double Xp;
        public int? V;
        public Dictionary<string, int> Upgrades = new Dictionary<string, int>();
        /// <summary>Cards bought (with petals) into each race's starting deck, by race.</summary>
        public Dictionary<string, List<string>> Deck = new Dictionary<string, List<string>>();
        /// <summary>Starter cards bought for good, by race.</summary>
        public Dictionary<string, List<string>> Owned;
        /// <summary>Stars conquered in all, by race.</summary>
        public Dictionary<string, int> Conquests;
        public int Best;
        public int Runs;
        public CaptainMeta Captain;
        public MetaAffinity Affinity;
        /// <summary>Ship parts found (parts.ts), kept for good; and which is fitted in each of the ship's slots.</summary>
        public List<string> Hangar;
        public Dictionary<string, string> Fitted;
        /// <summary>The campaign menu's sections opened up so far.</summary>
        public Dictionary<string, bool> Opened;
        public Dictionary<string, CompanionMeta> Companions;
        public int? Spared;
        public int? Hunters;
        public string Kept;
        /// <summary>The companions chosen to fly on the next run (unset: the first found).</summary>
        public List<string> Crew;

        /// <summary>A shallow copy (TS's { ...meta }).</summary>
        public MetaState Copy() => (MetaState)MemberwiseClone();
    }

    /// <summary>The commander's level, the experience into it, and what it needs.</summary>
    public class MetaLevel
    {
        public int Level, Into, Need;
    }

    /// <summary>What the Captain's ascent gives, with the ability slots and gates passed.</summary>
    public class CaptainGifts : AscentGifts
    {
        public int SlotCount;
        public int Gates;
    }

    /// <summary>Something the Captain's tree can take: an upgrade (kind 'node', its id), or the next Astral Gate ('gate').</summary>
    public class CaptainBuy
    {
        public string Kind;
        public string Id;
    }

    /// <summary>The race and stars a hero's unlock needs.</summary>
    public class HeroUnlock
    {
        public int Race;
        public int Stars;
    }

    /// <summary>
    /// The loop's lasting progress (meta.ts): experience that raises the commander's level, petals that buy the
    /// Stellari's skill tree, unlocks and starter cards, the Captain's and the companions' ascents, the ship's parts.
    /// The tables are data (meta.json).
    /// </summary>
    public static partial class Meta
    {
        class Data
        {
            public List<MetaUpgrade> Upgrades;
            public List<List<string>> StarterOffers;
            public int[] TreePetals;
            public int[] KinshipBoost;
            public double[] FellowshipBoost;
            public List<int> StartingRaces;
            public int[] HeroUnlockStars;
        }

        static Data D = new Data
        {
            Upgrades = new List<MetaUpgrade>(), StarterOffers = new List<List<string>>(), TreePetals = new int[0], KinshipBoost = new int[0],
            FellowshipBoost = new double[0], StartingRaces = new List<int>(), HeroUnlockStars = new int[0],
        };

        public static void Load(string json) => D = Json.Read<Data>(json);

        public static List<MetaUpgrade> MetaUpgrades => D.Upgrades;
        /// <summary>A skill's price in petals, every level of it, by its tier (the capstones dearest).</summary>
        public static int[] TreePetals => D.TreePetals;
        /// <summary>How far Kinship and Fellowship lean rewards, by level.</summary>
        public static int[] KinshipBoost => D.KinshipBoost;
        public static double[] FellowshipBoost => D.FellowshipBoost;
        /// <summary>The four races there from the start.</summary>
        public static List<int> StartingRaces => D.StartingRaces;
        /// <summary>The stars a race must have conquered to unlock each of its heroes.</summary>
        public static int[] HeroUnlockStars => D.HeroUnlockStars;
        /// <summary>Each race's six cards that can be bought into its starting deck with petals.</summary>
        public static List<List<string>> StarterOffers => D.StarterOffers;

        /// <summary>The skill that leans to each of the two races.</summary>
        public static readonly Dictionary<string, string> AffinitySkill = new Dictionary<string, string> { ["primary"] = "kinship", ["secondary"] = "fellowship" };
        /// <summary>The campaign menu's sections other than the companions'.</summary>
        public static readonly List<string> MenuSections = new List<string> { "captain", "ship", "stellari" };
        /// <summary>The petals it costs to take back every skill point placed.</summary>
        public const int SkillResetPetals = 5;
        const string CaptainStartSingularity = "wall";

        static int? At(int[] xs, int i) => i >= 0 && i < xs.Length ? xs[i] : (int?)null;
        static T Get<T>(Dictionary<string, T> d, string k) => d != null && k != null && d.TryGetValue(k, out var v) ? v : default;
        static bool Has<T>(Dictionary<string, T> d, string k) where T : class => Get(d, k) != null;

        /// <summary>JS's array.slice(0, n).</summary>
        static IEnumerable<int> Upto(int[] xs, int n) => xs.Take(n < 0 ? Math.Max(0, xs.Length + n) : n);

        /// <summary>What an upgrade is bought with: petals, now, for the skill tree and unlocks alike.</summary>
        public static string CurrencyOf(MetaUpgrade u) => "petals";

        public static int PointCost(MetaUpgrade u) => At(TreePetals, u.Tier ?? 1) ?? 3;

        /// <summary>An upgrade's next level's price, in petals.</summary>
        public static int PriceOf(MetaUpgrade u, int level) => u.Group == "unlock" ? u.Cost(level) : PointCost(u);

        /// <summary>The experience to rise from a level to the next: a little more each level.</summary>
        public static int CommanderXpToNext(int level) => 25 + level;

        /// <summary>The commander's level for the experience earned in all.</summary>
        public static MetaLevel LevelFor(double xp)
        {
            int level = 1;
            double left = Math.Max(0, Math.Floor(xp));
            while (left >= CommanderXpToNext(level))
            {
                left -= CommanderXpToNext(level);
                level++;
            }
            return new MetaLevel { Level = level, Into = (int)left, Need = CommanderXpToNext(level) };
        }

        /// <summary>The experience it takes, in all, to reach a level.</summary>
        public static int XpForLevel(int level) => Enumerable.Range(1, Math.Max(0, level - 1)).Sum(CommanderXpToNext);

        static IEnumerable<MetaUpgrade> Tree => MetaUpgrades.Where(u => u.Group != "unlock");

        /// <summary>Skill levels bought on the tree, each by its tier (kept for older saves).</summary>
        static int TreeTiers(MetaState meta) => Tree.Sum(u => (u.Tier ?? 1) * Get(meta.Upgrades, u.Id));

        /// <summary>Petals the skill tree's skills cost in all (what a reset gives back).</summary>
        public static int TreePetalsSpent(MetaState meta) => Tree.Sum(u => PointCost(u) * Math.Min(Get(meta.Upgrades, u.Id), u.Max));

        /// <summary>Skill points spent: on the Captain.</summary>
        public static int PointsSpent(MetaState meta) => CaptainPointsSpent(meta);

        /// <summary>Skill points to spend: one for every level past the first, less those spent.</summary>
        public static int PointsLeft(MetaState meta) => LevelFor(meta.Xp).Level - 1 - PointsSpent(meta);

        // ---- The companions ----

        /// <summary>A companion as kept, read safely (an older build, from before tiers, starts afresh).</summary>
        static AscentState CompanionAscent(CompanionMeta c) =>
            c?.Nodes != null ? new AscentState { Nodes = c.Nodes, Gates = c.Gates ?? 0 } : Engine.Ascent.PlainAscent();

        /// <summary>The companions found so far, in order.</summary>
        public static List<string> CompanionsFound(MetaState meta) => Companions.CompanionIds.Where(id => Has(meta.Companions, id)).ToList();

        /// <summary>The companions who fly with the Captain on the next run: those chosen, or, with none chosen, the first found.</summary>
        public static List<string> ActiveCrew(MetaState meta)
        {
            var found = CompanionsFound(meta);
            return (meta.Crew != null ? meta.Crew.Where(found.Contains) : found).Take(Companions.ActiveCrew).ToList();
        }

        /// <summary>A companion sent aboard for the next run, or ashore (none sent aboard past ActiveCrew).</summary>
        public static MetaState SetCrewAboard(MetaState meta, string id, bool aboard)
        {
            var now = ActiveCrew(meta).Where(x => x != id).ToList();
            if (aboard && now.Count >= Companions.ActiveCrew) return meta;
            var m = meta.Copy();
            m.Crew = aboard ? now.Append(id).ToList() : now;
            return m;
        }

        /// <summary>The active crew's cards for the next run (each id carries the build).</summary>
        public static List<string> CompanionCards(MetaState meta) =>
            ActiveCrew(meta).Select(id => Companions.CompanionCardId(id, Companions.CompanionFromAscent(id, CompanionAscent(meta.Companions[id])))).ToList();

        /// <summary>Skill points a companion has spent (an upgrade or a gate, one each).</summary>
        public static int CompanionSpent(MetaState meta, string id) =>
            Has(meta.Companions, id) ? Engine.Ascent.AscentSpent(Engine.Ascent.CompanionTrees[id], CompanionAscent(meta.Companions[id])) : 0;

        /// <summary>A companion's ascent, as kept.</summary>
        public static AscentState CompanionTree(MetaState meta, string id) => CompanionAscent(Get(meta.Companions, id));

        /// <summary>A companion's skill points left: one for every level past the first, less those spent.</summary>
        public static int CompanionPoints(MetaState meta, string id)
        {
            var c = Get(meta.Companions, id);
            return c != null ? Companions.CompanionLevel(c.Xp).Level - 1 - CompanionSpent(meta, id) : 0;
        }

        /// <summary>Why a companion can't take it now (null if it can): an upgrade's id, or 'gate'.</summary>
        public static string CompanionProblem(MetaState meta, string id, string what) =>
            Has(meta.Companions, id) ? Engine.Ascent.AscentProblem(Engine.Ascent.CompanionTrees[id], CompanionTree(meta, id), what, CompanionPoints(meta, id)) : "Not found yet.";

        /// <summary>Take it (a new state; unchanged if it can't be had).</summary>
        public static MetaState BuyCompanion(MetaState meta, string id, string what)
        {
            var c = Get(meta.Companions, id);
            if (c == null || CompanionProblem(meta, id, what) != null) return meta;
            var a = Engine.Ascent.Ascend(Engine.Ascent.CompanionTrees[id], CompanionTree(meta, id), what, CompanionPoints(meta, id));
            var m = meta.Copy();
            m.Companions = new Dictionary<string, CompanionMeta>(meta.Companions) { [id] = new CompanionMeta { Xp = c.Xp, Nodes = a.Nodes, Gates = a.Gates } };
            return m;
        }

        /// <summary>What a run brings back for the companions: those who joined, the experience each earnt, and beaten heroes spared.</summary>
        public static MetaState BankCompanions(MetaState meta, List<string> freed, Dictionary<string, double> xp, int spared, int hunters = 0)
        {
            if (hunters > 0)
            {
                meta = meta.Copy();
                meta.Hunters = (meta.Hunters ?? 0) + hunters;
            }
            xp = xp ?? new Dictionary<string, double>();
            if (freed.Count == 0 && spared == 0 && !xp.Values.Any(n => n > 0)) return meta;
            var companions = meta.Companions != null ? new Dictionary<string, CompanionMeta>(meta.Companions) : new Dictionary<string, CompanionMeta>();
            // (One who joins takes a place aboard for the next run too, while there is one free.)
            var crew = meta.Crew;
            foreach (var id in freed)
            {
                if (Get(companions, id) == null && crew != null && crew.Count < Companions.ActiveCrew) crew = crew.Append(id).ToList();
                if (Get(companions, id) == null) companions[id] = new CompanionMeta { Xp = 0, Nodes = new List<string>(), Gates = 0 };
            }
            if (crew != meta.Crew)
            {
                meta = meta.Copy();
                meta.Crew = crew;
            }
            foreach (var id in Companions.CompanionIds)
                if (Get(companions, id) != null && Get(xp, id) > 0)
                {
                    var c = companions[id];
                    companions[id] = new CompanionMeta { Xp = c.Xp + xp[id], Nodes = c.Nodes, Gates = c.Gates };
                }
            var m = meta.Copy();
            m.Companions = companions;
            m.Spared = (meta.Spared ?? 0) + spared;
            return m;
        }

        // ---- The campaign menu ----

        /// <summary>Whether a section of the campaign menu is open: once there is first something in it, and from then on for good.</summary>
        public static bool SectionOpen(MetaState meta, string s)
        {
            if (Get(meta.Opened, s)) return true;
            if (s == "captain") return PointsLeft(meta) > 0 || CaptainPointsSpent(meta) > 0;
            if (s == "ship") return (meta.Hangar?.Count ?? 0) > 0;
            // (A companion's: once they are found and have a skill point to spend.)
            if (s != "stellari") return Has(meta.Companions, s) && (CompanionPoints(meta, s) > 0 || CompanionSpent(meta, s) > 0);
            return meta.Petals > 0 || TreePetalsSpent(meta) > 0;
        }

        /// <summary>The sections open now, marked open for good.</summary>
        public static MetaState OpenSections(MetaState meta)
        {
            var opened = meta.Opened != null ? new Dictionary<string, bool>(meta.Opened) : new Dictionary<string, bool>();
            bool changed = false;
            foreach (var s in MenuSections.Concat(Companions.CompanionIds))
                if (!Get(opened, s) && SectionOpen(meta, s))
                {
                    opened[s] = true;
                    changed = true;
                }
            if (!changed) return meta;
            var m = meta.Copy();
            m.Opened = opened;
            return m;
        }

        // ---- The ship ----

        /// <summary>Fit a part from the hangar into a slot of its kind (taking it from any other slot it was in), or empty a slot.</summary>
        public static MetaState FitPart(MetaState meta, string slot, string id)
        {
            var fitted = meta.Fitted != null ? new Dictionary<string, string>(meta.Fitted) : new Dictionary<string, string>();
            var m = meta.Copy();
            if (id == null)
            {
                fitted.Remove(slot);
                m.Fitted = fitted;
                return m;
            }
            if (meta.Hangar == null || !meta.Hangar.Contains(id) || !Parts.PartSlots(id).Contains(slot)) return meta;
            foreach (var k in fitted.Keys.ToList()) if (fitted[k] == id) fitted.Remove(k);
            fitted[slot] = id;
            m.Fitted = fitted;
            return m;
        }

        /// <summary>Parts found on a run, into the hangar for good (each once).</summary>
        public static MetaState StowParts(MetaState meta, IEnumerable<string> ids)
        {
            var hangar = (meta.Hangar ?? new List<string>()).ToList();
            foreach (var id in ids) if (Parts.ShipPart(id) != null && !hangar.Contains(id)) hangar.Add(id);
            var m = meta.Copy();
            m.Hangar = hangar;
            return m;
        }

        /// <summary>Set the favoured race (Kinship, 'primary') or the second one ('secondary'); the other is moved off it if they would match.</summary>
        public static MetaState SetAffinity(MetaState meta, string which, int? race)
        {
            var a = new MetaAffinity { Primary = meta.Affinity?.Primary, Secondary = meta.Affinity?.Secondary };
            if (which == "primary") a.Primary = race; else a.Secondary = race;
            if (race != null)
            {
                if (which == "primary" && a.Secondary == race) a.Secondary = null;
                if (which != "primary" && a.Primary == race) a.Primary = null;
            }
            var m = meta.Copy();
            m.Affinity = a;
            return m;
        }

        // ---- The Captain ----

        public static CaptainMeta PlainCaptain() => new CaptainMeta { Nodes = new List<string>(), Gates = 0, Equipped = new List<string> { Captain.CaptainStartAbility } };

        /// <summary>The Captain as kept (an older build, from before tiers, starts afresh).</summary>
        public static CaptainMeta CaptainMeta(MetaState meta)
        {
            if (meta.Captain?.Nodes == null) return PlainCaptain();
            var c = meta.Captain.Copy();
            c.Equipped = c.Equipped ?? new List<string> { Captain.CaptainStartAbility };
            c.Gates = c.Gates ?? 0;
            return c;
        }

        /// <summary>What the Captain's ascent gives: abilities learnt (the first always), slots, leads and singularities learnt, stats.</summary>
        public static CaptainGifts CaptainGifts(MetaState meta)
        {
            var c = CaptainMeta(meta);
            var g = Engine.Ascent.AscentGifts(Engine.Ascent.CaptainTree, c.Ascent());
            return new CaptainGifts
            {
                Attack = g.Attack, Stability = g.Stability, Cheaper = g.Cheaper, Slots = g.Slots,
                Abilities = new[] { Captain.CaptainStartAbility }.Concat(g.Abilities).ToList(),
                Leads = g.Leads, Sings = g.Sings, Traits = g.Traits,
                SlotCount = 1 + g.Slots, Gates = c.Gates ?? 0,
            };
        }

        /// <summary>The Captain's card for the next run (its id carries the build: captain.ts).</summary>
        public static string CaptainCard(MetaState meta)
        {
            var c = CaptainMeta(meta);
            var g = CaptainGifts(meta);
            var abilities = c.Equipped.Where(g.Abilities.Contains).Take(g.SlotCount).ToList();
            var lead = !string.IsNullOrEmpty(c.Lead) && g.Leads.Contains(c.Lead) ? c.Lead : null;
            var sing = !string.IsNullOrEmpty(c.Sing) && g.Sings.Contains(c.Sing) ? c.Sing : null;
            return Captain.CaptainId(new CaptainBuild { Attack = g.Attack, Stability = g.Stability, Cheaper = g.Cheaper, Abilities = abilities, Gates = c.Gates, Lead = lead, Sing = sing });
        }

        static string What(CaptainBuy buy) => buy.Kind == "gate" ? "gate" : buy.Id;

        /// <summary>Why it can't be taken now (null if it can).</summary>
        public static string CaptainBuyProblem(MetaState meta, CaptainBuy buy) =>
            Engine.Ascent.AscentProblem(Engine.Ascent.CaptainTree, CaptainMeta(meta).Ascent(), What(buy), PointsLeft(meta));

        /// <summary>Skill points spent on the Captain, in all.</summary>
        public static int CaptainPointsSpent(MetaState meta) =>
            meta.Captain?.Nodes != null ? Engine.Ascent.AscentSpent(Engine.Ascent.CaptainTree, CaptainMeta(meta).Ascent()) : 0;

        /// <summary>Take it (a new state; throws if it can't be had). A new ability is carried at once if a slot is free; a new lead, or singularity, is taken up.</summary>
        public static MetaState BuyCaptain(MetaState meta, CaptainBuy buy)
        {
            var why = CaptainBuyProblem(meta, buy);
            if (why != null) throw new InvalidOperationException(why);
            var c = CaptainMeta(meta);
            var a = Engine.Ascent.Ascend(Engine.Ascent.CaptainTree, c.Ascent(), What(buy), PointsLeft(meta));
            var next = c.Copy();
            next.Nodes = a.Nodes;
            next.Gates = a.Gates;
            next.Equipped = c.Equipped.ToList();
            var node = buy.Kind == "node" ? Engine.Ascent.CaptainTree.FirstOrDefault(x => x.Id == buy.Id) : null;
            var after = meta.Copy();
            after.Captain = next;
            if (!string.IsNullOrEmpty(node?.Give.Ability) && next.Equipped.Count < CaptainGifts(after).SlotCount) next.Equipped.Add(node.Give.Ability);
            if (!string.IsNullOrEmpty(node?.Give.Lead)) next.Lead = node.Give.Lead;
            if (!string.IsNullOrEmpty(node?.Give.Sing)) next.Sing = node.Give.Sing;
            return after;
        }

        /// <summary>Carry a learnt ability into battle, or leave it behind (carried only while a slot is free).</summary>
        public static MetaState EquipCaptainAbility(MetaState meta, string id)
        {
            var c = CaptainMeta(meta);
            var g = CaptainGifts(meta);
            if (!g.Abilities.Contains(id)) return meta;
            bool on = c.Equipped.Contains(id);
            if (!on && c.Equipped.Count(g.Abilities.Contains) >= g.SlotCount) return meta;
            var next = c.Copy();
            next.Equipped = on ? c.Equipped.Where(x => x != id).ToList() : c.Equipped.Append(id).ToList();
            var m = meta.Copy();
            m.Captain = next;
            return m;
        }

        /// <summary>Lead in a learnt way (or in none: null).</summary>
        public static MetaState SetCaptainLead(MetaState meta, string id)
        {
            var c = CaptainMeta(meta);
            if (id != null && !CaptainGifts(meta).Leads.Contains(id)) return meta;
            var next = c.Copy();
            next.Lead = id;
            var m = meta.Copy();
            m.Captain = next;
            return m;
        }

        /// <summary>Choose a learnt singularity (the first is always known).</summary>
        public static MetaState SetCaptainSingularity(MetaState meta, string id)
        {
            var c = CaptainMeta(meta);
            if (id != CaptainStartSingularity && !CaptainGifts(meta).Sings.Contains(id)) return meta;
            var next = c.Copy();
            next.Sing = id == CaptainStartSingularity ? null : id;
            var m = meta.Copy();
            m.Captain = next;
            return m;
        }

        public static MetaState EmptyMeta() => new MetaState { Petals = 0, Xp = 0, Upgrades = new Dictionary<string, int>(), Deck = new Dictionary<string, List<string>>(), Best = 0, Runs = 0, V = 4 };

        // ---- Skills and unlocks ----

        /// <summary>Skills taken out of the tree, with what each level cost: a save that bought them has its XP back.</summary>
        static readonly Dictionary<string, int[]> Retired = new Dictionary<string, int[]>
        {
            ["doctrine"] = new[] { 25, 50 }, ["insight"] = new[] { 90 }, ["calm"] = new[] { 90 }, ["secondsun"] = new[] { 200 },
        };

        // (The Captain's prices before skill points, to refund an older build.)
        static readonly Dictionary<string, int[]> OldStats = new Dictionary<string, int[]>
        {
            ["attack"] = new[] { 5, 9, 14 }, ["stability"] = new[] { 3, 6, 10, 15 }, ["cheaper"] = new[] { 8, 16 }, ["slots"] = new[] { 6, 12 },
        };
        static readonly Dictionary<string, int> OldAbility = new Dictionary<string, int>
        {
            ["patch"] = 3, ["scout"] = 4, ["volley"] = 5, ["bulwark"] = 6, ["vent"] = 6, ["strafe"] = 8, ["overdrive"] = 8, ["rally"] = 10, ["mend"] = 10,
        };
        static readonly Dictionary<string, int> OldLead = new Dictionary<string, int> { ["steady"] = 12, ["iron"] = 12, ["salvo"] = 14, ["gunnery"] = 16 };

        /// <summary>A save brought up to date: retired skills refunded, skills from before points counted as experience, the Captain's petals back, Kinship split.</summary>
        public static MetaState MigrateMeta(MetaState meta)
        {
            var gone = (meta.Upgrades ?? new Dictionary<string, int>()).Keys.Where(Retired.ContainsKey).ToList();
            if (gone.Count > 0)
            {
                var upgrades = new Dictionary<string, int>(meta.Upgrades);
                int back = 0;
                foreach (var id in gone)
                {
                    back += Upto(Retired[id], upgrades[id]).Sum();
                    upgrades.Remove(id);
                }
                meta = meta.Copy();
                meta.Upgrades = upgrades;
                meta.Xp += back;
            }
            // Skills bought with XP, from before levels and points: the XP spent on them counts again, and the
            // commander stands at least high enough to have the points for every skill already bought.
            if ((meta.V ?? 1) < 2)
            {
                double spent = 0;
                foreach (var u in Tree) for (int l = 0; l < Get(meta.Upgrades, u.Id); l++) spent += u.Cost(l);
                var xp = Math.Max(meta.Xp + spent, XpForLevel(TreeTiers(meta) + 1));
                meta = meta.Copy();
                meta.Xp = xp;
                meta.V = 2;
            }
            // Skill points to the Captain, petals to the skill tree: the petals once spent on the Captain come back,
            // and the Captain is plain again.
            if ((meta.V ?? 1) < 3)
            {
                var c = meta.Captain;
                int back = 0;
                if (c != null)
                {
                    back += Upto(OldStats["attack"], c.Attack ?? 0).Sum() + Upto(OldStats["stability"], c.Stability ?? 0).Sum()
                        + Upto(OldStats["cheaper"], c.Cheaper ?? 0).Sum() + Upto(OldStats["slots"], c.Slots ?? 0).Sum();
                    foreach (var a in c.Abilities ?? new List<string>()) back += Get(OldAbility, a);
                    foreach (var l in c.Leads ?? new List<string>()) back += Get(OldLead, l);
                }
                meta = meta.Copy();
                meta.Petals += back;
                meta.V = 3;
                if (c != null) meta.Captain = PlainCaptain();
            }
            // Kinship split in two: its levels past the third (the second race's) are Fellowship's now.
            if ((meta.V ?? 1) < 4)
            {
                int k = Get(meta.Upgrades, "kinship");
                var upgrades = new Dictionary<string, int>(meta.Upgrades);
                if (k > 3)
                {
                    upgrades["kinship"] = 3;
                    upgrades["fellowship"] = Math.Min(2, k - 3);
                }
                meta = meta.Copy();
                meta.Upgrades = upgrades;
                meta.V = 4;
            }
            return meta;
        }

        public static MetaUpgrade MetaUpgrade(string id) => MetaUpgrades.FirstOrDefault(u => u.Id == id);

        public static int LevelOf(MetaState meta, string id) => Get(meta.Upgrades, id);

        /// <summary>Why an upgrade can't be bought now (null if it can).</summary>
        public static string BuyUpgradeProblem(MetaState meta, string id)
        {
            var u = MetaUpgrade(id);
            if (u == null) return "No such upgrade.";
            int level = LevelOf(meta, id);
            if (level >= u.Max) return "Already at its most.";
            var missing = (u.Requires ?? new List<MetaRequirement>()).FirstOrDefault(r => LevelOf(meta, r.Id) < r.Level);
            if (missing != null) return $"Needs {MetaUpgrade(missing.Id)?.Name ?? missing.Id} {new string('I', missing.Level)} first.";
            int price = PriceOf(u, level);
            if (meta.Petals < price) return $"Needs {price} petals.";
            return null;
        }

        /// <summary>Whether an upgrade's prerequisites are all bought.</summary>
        public static bool UpgradeOpen(MetaState meta, string id) => (MetaUpgrade(id)?.Requires ?? new List<MetaRequirement>()).All(r => LevelOf(meta, r.Id) >= r.Level);

        /// <summary>Buy the next level of an upgrade (a new state; throws if it can't be bought).</summary>
        public static MetaState BuyUpgrade(MetaState meta, string id)
        {
            var why = BuyUpgradeProblem(meta, id);
            if (why != null) throw new InvalidOperationException(why);
            int level = LevelOf(meta, id);
            var u = MetaUpgrade(id);
            var m = meta.Copy();
            m.Petals = meta.Petals - PriceOf(u, level);
            m.Upgrades = new Dictionary<string, int>(meta.Upgrades) { [id] = level + 1 };
            return m;
        }

        /// <summary>Take back the last level of a skill: its petals back.</summary>
        public static MetaState RefundUpgrade(MetaState meta, string id)
        {
            int level = LevelOf(meta, id);
            var u = MetaUpgrade(id);
            if (u == null || level <= 0) return meta;
            var upgrades = new Dictionary<string, int>(meta.Upgrades) { [id] = level - 1 };
            if (upgrades[id] == 0) upgrades.Remove(id);
            var m = meta.Copy();
            m.Petals = meta.Petals + PriceOf(u, level - 1);
            m.Upgrades = upgrades;
            return m;
        }

        /// <summary>Why the skill tree can't be reset now (null if it can).</summary>
        public static string ResetSkillsProblem(MetaState meta)
        {
            if (TreePetalsSpent(meta) == 0) return "No skills to reset.";
            if (meta.Petals + TreePetalsSpent(meta) < SkillResetPetals) return $"Needs {SkillResetPetals} petals.";
            return null;
        }

        /// <summary>Every skill on the tree taken back, its petals returned, less SkillResetPetals (unlocks kept).</summary>
        public static MetaState ResetSkills(MetaState meta)
        {
            var why = ResetSkillsProblem(meta);
            if (why != null) throw new InvalidOperationException(why);
            var m = meta.Copy();
            m.Upgrades = meta.Upgrades.Where(kv => MetaUpgrade(kv.Key)?.Group == "unlock").ToDictionary(kv => kv.Key, kv => kv.Value);
            m.Petals = meta.Petals + TreePetalsSpent(meta) - SkillResetPetals;
            return m;
        }

        /// <summary>Why the Captain can't be reset now (null if they can).</summary>
        public static string ResetCaptainProblem(MetaState meta)
        {
            if (CaptainPointsSpent(meta) == 0) return "Nothing to reset.";
            if (meta.Petals < SkillResetPetals) return $"Needs {SkillResetPetals} petals.";
            return null;
        }

        /// <summary>The Captain made plain again, every skill point back to spend, for SkillResetPetals.</summary>
        public static MetaState ResetCaptain(MetaState meta)
        {
            var why = ResetCaptainProblem(meta);
            if (why != null) throw new InvalidOperationException(why);
            var m = meta.Copy();
            m.Petals = meta.Petals - SkillResetPetals;
            m.Captain = PlainCaptain();
            return m;
        }

        public static bool RaceUnlocked(MetaState meta, int race) => StartingRaces.Contains(race) || LevelOf(meta, $"race:{race}") > 0;

        /// <summary>The stars the race must have conquered to unlock this hero (null: its first, open from the start).</summary>
        public static HeroUnlock HeroUnlockNeed(string hero)
        {
            int race = Story.Generals.FindIndex(h => h.Contains(hero));
            int i = race >= 0 ? Story.Generals[race].IndexOf(hero) : 0;
            return i > 0 ? new HeroUnlock { Race = race, Stars = At(HeroUnlockStars, i) ?? 50 } : null;
        }

        /// <summary>Stars conquered as a race, over every run.</summary>
        public static int RaceConquests(MetaState meta, int race) => Get(meta.Conquests, race.ToString());

        /// <summary>A race's first hero is open from the start; the others once the race has conquered enough stars.</summary>
        public static bool HeroUnlocked(MetaState meta, string hero)
        {
            var need = HeroUnlockNeed(hero);
            // (One bought with petals, in an older save, stays open.)
            return need == null || RaceConquests(meta, need.Race) >= need.Stars || LevelOf(meta, $"hero:{hero}") > 0;
        }

        // ---- The starting deck ----

        /// <summary>What a starter card costs in petals, by its rarity.</summary>
        public static int StarterCardPrice(string rarity) => rarity == "anomaly" ? 14 : rarity == "stellar" ? 8 : 4;

        static List<string> RaceList(Dictionary<string, List<string>> d, int race) => Get(d, race.ToString()) ?? new List<string>();

        /// <summary>Whether a starter card has been bought for a race (once bought, it is theirs for good).</summary>
        public static bool StarterOwned(MetaState meta, int race, string defId) => RaceList(meta.Owned, race).Contains(defId) || RaceList(meta.Deck, race).Contains(defId);

        /// <summary>What putting a starter card into the deck costs now: its price once, nothing after.</summary>
        public static int StarterAddPrice(MetaState meta, int race, string defId, string rarity) => StarterOwned(meta, race, defId) ? 0 : StarterCardPrice(rarity);

        /// <summary>Why this card can't be put into this race's starting deck now (null if it can).</summary>
        public static string StarterAddProblem(MetaState meta, int race, string defId, string rarity)
        {
            if (race < 0 || race >= StarterOffers.Count || !StarterOffers[race].Contains(defId)) return "That card isn't offered to this race's starting deck.";
            if (RaceList(meta.Deck, race).Contains(defId)) return "Already in the starting deck.";
            int price = StarterAddPrice(meta, race, defId, rarity);
            if (meta.Petals < price) return $"Needs {price} petals.";
            return null;
        }

        /// <summary>Put a card into a race's starting deck: bought for good the first time, free after (throws if it can't).</summary>
        public static MetaState BuyStarterCard(MetaState meta, int race, string defId, string rarity)
        {
            var why = StarterAddProblem(meta, race, defId, rarity);
            if (why != null) throw new InvalidOperationException(why);
            var owned = RaceList(meta.Owned, race);
            var key = race.ToString();
            var m = meta.Copy();
            m.Petals = meta.Petals - StarterAddPrice(meta, race, defId, rarity);
            m.Deck = new Dictionary<string, List<string>>(meta.Deck ?? new Dictionary<string, List<string>>()) { [key] = RaceList(meta.Deck, race).Append(defId).ToList() };
            m.Owned = new Dictionary<string, List<string>>(meta.Owned ?? new Dictionary<string, List<string>>()) { [key] = owned.Contains(defId) ? owned : owned.Append(defId).ToList() };
            return m;
        }

        /// <summary>Take a bought card back out of a race's starting deck (still owned: it goes back in for nothing).</summary>
        public static MetaState RemoveStarterCard(MetaState meta, int race, int index)
        {
            var have = RaceList(meta.Deck, race).ToList();
            var owned = RaceList(meta.Owned, race);
            var key = race.ToString();
            // (JS's splice(index, 1): a negative index counts from the end.)
            int at = index < 0 ? Math.Max(have.Count + index, 0) : index;
            string outs = null;
            if (at < have.Count)
            {
                outs = have[at];
                have.RemoveAt(at);
            }
            if (!string.IsNullOrEmpty(outs) && !owned.Contains(outs))
            {
                meta = meta.Copy();
                meta.Owned = new Dictionary<string, List<string>>(meta.Owned ?? new Dictionary<string, List<string>>()) { [key] = owned.Append(outs).ToList() };
            }
            var m = meta.Copy();
            m.Deck = new Dictionary<string, List<string>>(meta.Deck ?? new Dictionary<string, List<string>>()) { [key] = have };
            return m;
        }

        // ---- A run's bonuses ----

        /// <summary>What a run begins with, and the rules it is played under, from the upgrades bought (null: nothing bought).</summary>
        public static RunBonuses RunBonuses(MetaState meta, int? race = null)
        {
            // (A level bought before a skill's most was lowered counts only up to its most now.)
            int L(string id) => meta != null ? Math.Min(LevelOf(meta, id), MetaUpgrade(id)?.Max ?? 0) : 0;
            var mods = new BattleModifiers();
            if (L("cryo") != 0) mods.StartingHeat = -L("cryo");
            if (L("plating") != 0) mods.MaxHealthDelta = 2 * L("plating");
            if (L("mantle") != 0) mods.ShieldPerTurn = L("mantle");
            if (L("abundance") + L("aligned") != 0) mods.AbundantDraw = L("abundance") + L("aligned");
            if (L("foundry") + L("aligned") != 0) mods.IndustrialPlays = L("foundry") + L("aligned");
            if (L("coldworld") + L("aligned") != 0) mods.DeadCool = 2 * (L("coldworld") + L("aligned"));
            if (L("bastion") != 0) mods.GuardDefence = 2 * L("bastion");
            var r = new RunBonuses
            {
                Materials = 3 * L("materials"),
                Cards = L("cards"),
                Picks = L("pick"),
                Hull = L("hull"),
                Shields = L("shields"),
                Walls = L("walls"),
                Grace = L("grace"),
                ArmoryDiscount = L("armory"),
                PetalBonus = 0.2 * L("petals"),
                Salvage = L("salvage"),
                Hoard = 6 * L("hoard"),
                Favour = 3 * L("favour"),
                Deck = meta != null && race != null ? RaceList(meta.Deck, race.Value).ToList() : new List<string>(),
                Mods = mods,
                Mend = L("mend"),
                Loot = 0.1 * L("scouts"),
                Heirloom = L("heirloom"),
                Stock = 3 * L("stock"),
                Legacy = L("legacy"),
                Plunder = 2 * L("plunder"),
                XpBonus = 0.1 * L("study"),
                Choices = L("choice"),
                Tithe = 2 * L("tithe"),
                Vault = 2 * L("vault"),
                // (The Captain's companions found so far, their cards as their trees have made them; and beaten heroes spared.)
                Companions = meta != null ? CompanionCards(meta) : new List<string>(),
                Spared = meta?.Spared ?? 0,
                Hunters = meta?.Hunters ?? 0,
            };
            if ((meta?.Hangar?.Count ?? 0) > 0)
            {
                r.Ship = Parts.ShipFit(meta.Fitted);
                r.Hangar = meta.Hangar.ToList();
            }
            if (!string.IsNullOrEmpty(meta?.Kept)) r.Kept = meta.Kept;
            if (L("kinship") != 0 || L("fellowship") != 0)
                r.Affinity = new Affinity
                {
                    Primary = meta?.Affinity?.Primary,
                    PrimaryBoost = At(KinshipBoost, L("kinship")) ?? 0,
                    Secondary = meta?.Affinity?.Secondary,
                    SecondaryBoost = L("fellowship") >= 0 && L("fellowship") < FellowshipBoost.Length ? FellowshipBoost[L("fellowship")] : 0,
                };
            return r;
        }
    }
}
