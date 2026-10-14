using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace BlueLoop.Engine
{
    /// <summary>A gear slot of a race's: its id ("ring2") and kind ("ring").</summary>
    public class GearSlot
    {
        public string Id;
        public string Kind;
    }

    /// <summary>A piece of gear: the boons it gives its hero's card while it is in play.</summary>
    public class Item
    {
        public string Id;
        public string Name;
        public string Slot;
        /// <summary>'dwarf' | 'stellar' | 'anomaly'.</summary>
        public string Rarity;
        /// <summary>Boons on the hero's card (older saves: worked out from the slot and rarity).</summary>
        public List<string> Boons;
        public string Text;
    }

    /// <summary>
    /// A relic: found on the way, and at work at once. Each carries a power over the whole board in every battle its
    /// faction's flagship fights (relics.ts). (An older save's relic, from before relics had powers, still blesses the
    /// hero's card as gear does.)
    /// </summary>
    public class Relic : Item
    {
        /// <summary>Its power, and how strong (by its rarity).</summary>
        public string Power;
        public int? N;
    }

    /// <summary>What a skill does: boons on the hero's card ("boon"), or (Herald) the hero starting every battle in play ("start").</summary>
    public class SkillEffect
    {
        public string Kind;
        public List<string> Boons;
    }

    public class HeroSkill
    {
        public string Id;
        public string Name;
        public string Text;
        /// <summary>The tree's three branches: 0 Might (the card's attack), 1 Ward (its defence), 2 Legacy (the race's way).</summary>
        public int Branch;
        /// <summary>1–6, from the hero up: each needs the one before it in its branch. Deeper tiers cost more.</summary>
        public int Tier;
        public string Icon;
        public SkillEffect Effect;
    }

    /// <summary>Campaign: skill points put into the hero's own attack and defence (each point +1 in battle).</summary>
    public class HeroTrain
    {
        public int Attack;
        public int Defence;
    }

    /// <summary>A hero's progress (kept by their faction, even while they lead no army).</summary>
    public class HeroState
    {
        public int Xp;
        public List<string> Skills = new List<string>();
        /// <summary>Equipped gear, by slot id.</summary>
        public Dictionary<string, Item> Gear = new Dictionary<string, Item>();
        public HeroTrain Train;
    }

    /// <summary>Everything a hero brings to battle (heroBonus).</summary>
    public class HeroBonus
    {
        public List<string> Boons = new List<string>();
        public bool Start;
        public List<BattleSkill> Skills = new List<BattleSkill>();
    }

    /// <summary>All the relics' work in battle, sorted by where it goes (relicBonus).</summary>
    public class RelicBonus
    {
        public List<string> Boons = new List<string>();
        public BattleModifiers Mods = new BattleModifiers();
        public int Walls;
        public int Guns;
        public bool Start;
        public List<BattleSkill> Skills = new List<BattleSkill>();
        public List<RelicInPlay> Powers = new List<RelicInPlay>();
    }

    /// <summary>
    /// Campaign heroes (heroes.ts): the generals who lead armies grow with them. Each hero gains experience by winning
    /// battles, and with each level a point to spend on their own skill tree; and each can carry a weapon and armour
    /// shaped to their race. Skills and gear alike are boons on the hero's own card (Boons). The race slots, skill
    /// trees, gear names and boons' words are data (heroes.json).
    /// </summary>
    public static class Heroes
    {
        class Data
        {
            public List<List<GearSlot>> RaceSlots;
            public Dictionary<string, string> SlotName;
            public Dictionary<string, List<HeroSkill>> SkillTrees;
            public Dictionary<string, List<string>> GearNames;
            public Dictionary<string, string> BoonText;
        }

        /// <summary>Each race's gear slots (ids, in order), the weapon first.</summary>
        public static List<List<GearSlot>> RaceSlots { get; private set; } = new List<List<GearSlot>>();
        public static Dictionary<string, string> SlotName { get; private set; } = new Dictionary<string, string>();
        /// <summary>Each hero's own tree: three branches of six, from the hero up to a capstone.</summary>
        public static Dictionary<string, List<HeroSkill>> SkillTrees { get; private set; } = new Dictionary<string, List<HeroSkill>>();
        /// <summary>What each kind of gear is called, by race (a Vorthane helm is not an Aureline one).</summary>
        public static Dictionary<string, List<string>> GearNames { get; private set; } = new Dictionary<string, List<string>>();
        static Dictionary<string, string> boonText = new Dictionary<string, string>();

        public static void Load(string json)
        {
            var d = Json.Read<Data>(json);
            RaceSlots = d.RaceSlots;
            SlotName = d.SlotName;
            SkillTrees = d.SkillTrees;
            GearNames = d.GearNames;
            boonText = d.BoonText;
        }

        /// <summary>
        /// Experience needed for each level (level 1 at 0): 21 levels, each a little further than the last. Each level
        /// after the first gives a skill point: 20 in all, fewer than the tree costs, so every hero is a choice.
        /// </summary>
        public static readonly int[] XpLevels = Enumerable.Range(0, 21).Select(i => i * 9 + i * i).ToArray();
        /// <summary>Skill points a skill costs, by tier (SKILL_COST): the deep skills, and above all the capstones, cost more.</summary>
        public static readonly int[] SkillCostByTier = { 0, 1, 1, 1, 2, 2, 3 };
        public static int SkillCost(HeroSkill k) => SkillCostByTier[k.Tier];

        // HEROES:
        /// <summary>Experience from a battle won, attacking or defending; and from one lost.</summary>
        public const int WinXp = 20, DefendXp = 16, LossXp = 6;
        /// <summary>Chance an army finds gear when it takes a system (research can add to it).</summary>
        public const double ItemChance = 0.35;

        public static int HeroLevel(double xp) => XpLevels.Count(x => xp >= x);
        public static int? NextLevelXp(double xp) => XpLevels.Any(x => x > xp) ? XpLevels.First(x => x > xp) : (int?)null;

        public static HeroSkill HeroSkill(string hero, string id) =>
            hero != null && SkillTrees.TryGetValue(hero, out var tree) ? tree.FirstOrDefault(k => k.Id == id) : null;

        /// <summary>Why a hero can't learn a skill (null if they can).</summary>
        public static string LearnProblem(string hero, HeroState h, string id)
        {
            var k = HeroSkill(hero, id);
            if (k == null) return "No such skill.";
            if (h.Skills.Contains(id)) return "Already learned.";
            if (k.Tier > 1 && !SkillTrees[hero].Any(x => x.Branch == k.Branch && x.Tier == k.Tier - 1 && h.Skills.Contains(x.Id))) return "Learn the skill before it in this branch first.";
            var cost = SkillCost(k);
            if (SkillPoints(h, hero) < cost) return SkillPoints(h, hero) < 1 ? "No skill points: win battles to gain levels." : $"Needs {cost} skill points.";
            return null;
        }

        /// <summary>Skill points not yet spent: one per level after the first, less what the skills learned cost.</summary>
        public static int SkillPoints(HeroState h, string hero = null) =>
            HeroLevel(h.Xp) - 1 - (h.Train?.Attack ?? 0) - (h.Train?.Defence ?? 0)
            - h.Skills.Sum(id => !string.IsNullOrEmpty(hero) ? (HeroSkill(hero, id) is HeroSkill k ? SkillCost(k) : 0) : SpentCost(id));

        static readonly Regex LastDigit = new Regex(@"(\d)$");

        /// <summary>What a learned skill cost, from its id alone (ids are the same in every hero's tree: "might4").</summary>
        static int SpentCost(string id)
        {
            var m = LastDigit.Match(id);
            if (!m.Success) return 0;
            int t = m.Groups[1].Value[0] - '0';
            return t < SkillCostByTier.Length ? SkillCostByTier[t] : 0;
        }

        /// <summary>Everything a hero brings to battle: the boons on their card (skills and gear), and whether they start in play.</summary>
        public static HeroBonus HeroBonus(string hero, HeroState h)
        {
            var out_ = new HeroBonus();
            foreach (var id in h?.Skills ?? new List<string>())
            {
                var k = HeroSkill(hero, id);
                if (k == null) continue;
                if (k.Effect.Kind == "boon") out_.Boons.AddRange(k.Effect.Boons);
                else out_.Start = true;
            }
            foreach (var item in (h?.Gear ?? new Dictionary<string, Item>()).Values) out_.Boons.AddRange(ItemBoons(item));
            return out_;
        }

        /// <summary>A list of boons, in words ("Dawn: heat 2. Sturdy 1.").</summary>
        public static string BoonsText(IEnumerable<string> boons) => string.Join(" ", boons.Select(b => boonText[b]));

        // ---- Gear ----

        static readonly Dictionary<string, string> Quality = new Dictionary<string, string> { ["dwarf"] = "Worn", ["stellar"] = "Bright", ["anomaly"] = "Starforged" };
        static readonly Dictionary<string, int> Step = new Dictionary<string, int> { ["dwarf"] = 1, ["stellar"] = 2, ["anomaly"] = 3 };

        static string B(string kind, int n = 0) => Boons.Boon(kind, n);

        /// <summary>What a piece of gear puts on its hero's card, by slot and quality (1 worn, 2 bright, 3 starforged).</summary>
        static List<string> GearBoons(string slot, int n)
        {
            switch (slot)
            {
                case "weapon": return new List<string> { n == 3 ? B("pierce", 2) : B("heat", n) };
                case "helm":
                case "carapace": return new List<string> { B("sturdy", n) };
                case "mantle": return new List<string> { B("shield", n) };
                case "core": return new List<string> { B("cool", n) };
                case "sigil": return new List<string> { n == 1 ? B("playdraw", 1) : n == 2 ? B("draw", 1) : B("energy", 1) };
                case "facet": return new List<string> { n == 1 ? B("stability", 1) : n == 2 ? B("heat", 1) : B("pierce", 1) };
                // Many rings, each a little.
                case "ring": return new List<string> { n == 1 ? B("stability", 1) : n == 2 ? B("shield", 1) : B("repair", 1) };
                case "gland": return new List<string> { n == 1 ? B("cool", 1) : B("plant", n - 1) };
                // Strike from the dark: the hero's entrance hits harder.
                case "mask": return new List<string> { B("playheat", n + 1) };
                case "plate": return new List<string> { B("bulwark", n) };
                // Three small stars, each a little.
                case "star": return new List<string> { n == 1 ? B("cool", 1) : n == 2 ? B("shield", 1) : B("draw", 1) };
                case "ember": return new List<string> { n == 1 ? B("heat", 1) : n == 2 ? B("playheat", 2) : B("heat", 2) };
            }
            throw new ArgumentException($"Unknown gear slot: {slot}");
        }

        /// <summary>The boons a piece of gear gives (an older save's item: worked out from its slot and quality).</summary>
        public static List<string> ItemBoons(Item i) => i.Boons ?? GearBoons(i.Slot, Step[i.Rarity]);

        static string GearName(string slot, int race)
        {
            var names = GearNames[slot];
            return race >= 0 && race < names.Count && names[race] != null ? names[race] : names[0];
        }

        /// <summary>A piece of gear for a slot, of a rarity: what it puts on its hero's card grows with its rarity.</summary>
        public static Item MakeItem(string id, string slot, string rarity, int race, double roll = 0)
        {
            var boons = GearBoons(slot, Step[rarity]);
            return new Item { Id = id, Name = $"{Quality[rarity]} {GearName(slot, race)}", Slot = slot, Rarity = rarity, Boons = boons, Text = $"Hero card: {BoonsText(boons)}" };
        }

        /// <summary>The gear slots of a race's that an item of a kind fits.</summary>
        public static List<GearSlot> SlotsFor(int race, string kind) => RaceSlots[race].Where(x => x.Kind == kind).ToList();

        /// <summary>A short line for what an item does in battle.</summary>
        public static string ItemText(Item i) => $"Hero card: {BoonsText(ItemBoons(i))}";

        /// <summary>How strong an item is, for the AI's choosing.</summary>
        public static int ItemValue(Item i) => Step[i.Rarity] * 10;

        // ---- Relics ----

        /// <summary>
        /// A relic for a race, of a rarity: a power (one its kind can carry, chosen by the roll). Never the same as one
        /// already held: no power twice, while there are others to be had.
        /// </summary>
        public static Relic MakeRelic(string id, string slot, string rarity, int race, double roll, List<Relic> held = null)
        {
            var power = Relics.RollPower(slot, roll, new HashSet<string>((held ?? new List<Relic>()).Where(r => r.Power != null).Select(r => r.Power)));
            var n = Relics.Powers[power].Amounts[Step[rarity] - 1];
            return new Relic { Id = id, Name = $"{Quality[rarity]} {GearName(slot, race)}", Slot = slot, Rarity = rarity, Boons = new List<string>(), Power = power, N = n, Text = Relics.Powers[power].Text(n) };
        }

        /// <summary>A relic's words: its power (an older blessing: what it puts on the hero's card).</summary>
        public static string RelicText(Relic r) => !string.IsNullOrEmpty(r.Power) ? r.Text : ItemText(r);

        static void Add(BattleModifiers m, string k, int v)
        {
            switch (k)
            {
                case "shieldPerTurn": m.ShieldPerTurn = (m.ShieldPerTurn ?? 0) + v; break;
                case "coolPerTurn": m.CoolPerTurn = (m.CoolPerTurn ?? 0) + v; break;
                case "openingHand": m.OpeningHand = (m.OpeningHand ?? 0) + v; break;
            }
        }

        /// <summary>
        /// All the relics' work in battle, sorted by where it goes: the passive powers that are battle modifiers (shields
        /// and cooling at dawn, a fuller first hand); the slots' walls and guns; whether the Hero starts in play; the
        /// once-a-battle powers (as battle skills, by the hero); the rest, carried into the battle for the engine to
        /// answer; and an older save's blessings on the hero's card.
        /// </summary>
        public static RelicBonus RelicBonus(List<Relic> relics, string hero = "")
        {
            var out_ = new RelicBonus();
            foreach (var r in relics ?? new List<Relic>())
            {
                if (string.IsNullOrEmpty(r.Power))
                {
                    out_.Boons.AddRange(ItemBoons(r));
                    continue;
                }
                var n = r.N ?? 1;
                var def = Relics.Powers[r.Power];
                if (r.Power == "aegis") Add(out_.Mods, "shieldPerTurn", n);
                else if (r.Power == "frost") Add(out_.Mods, "coolPerTurn", n);
                else if (r.Power == "firstLight") Add(out_.Mods, "openingHand", n);
                else if (r.Power == "walls") out_.Walls += n;
                else if (r.Power == "edge") out_.Guns += n;
                else if (r.Power == "herald") out_.Start = true;
                else if (def.Kind == "once" || def.Kind == "daily")
                    out_.Skills.Add(new BattleSkill { Id = $"relic-{r.Id}", Name = r.Name, Text = def.Text(n), Hero = hero, Effects = def.Effects(n), Cost = 0, Once = def.Kind == "once", Relic = r.Name, Choices = def.Choices?.Invoke(n) });
                else out_.Powers.Add(new RelicInPlay { Power = r.Power, N = n, Name = r.Name });
            }
            return out_;
        }
    }
}
