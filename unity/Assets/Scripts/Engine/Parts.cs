using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>A ship part (kinds: armour, shield, weapon, booster, warp; rarities: dwarf, stellar, anomaly).</summary>
    public class ShipPartDef
    {
        public string Id;
        public string Name;
        public string Kind;
        public string Rarity;
        /// <summary>What it does, in a few words.</summary>
        public string Text;
        /// <summary>Max health on the sun (armour).</summary>
        public int? Health;
        /// <summary>Defence on every slot of the tableau (armour).</summary>
        public int? Walls;
        /// <summary>Shields up as each battle begins, and each day (shield modules).</summary>
        public int? Shields;
        public int? ShieldPerTurn;
        /// <summary>Attack on its side's two slots (weapons).</summary>
        public int? Guns;
        /// <summary>Heat on the foe's sun as each battle begins (weapons).</summary>
        public int? Opening;
        /// <summary>Cooling on each jump, and jumps more a turn (boosters).</summary>
        public int? Cool;
        public int? March;
        /// <summary>How far the warp drive reaches (in routes' lengths).</summary>
        public double? Warp;
        /// <summary>A travelling merchant's mysterious device, working: never found anywhere else.</summary>
        public bool? Curio;
    }

    /// <summary>One of the ship's slots (armour, shield, port, starboard, booster, warp): which part kind it takes.</summary>
    public class ShipSlot
    {
        public string Id;
        public string Kind;
        public string Name;
    }

    /// <summary>What the ship's fitted parts add up to, for a run.</summary>
    public class ShipFit
    {
        public int Health;
        public int Walls;
        public int Shields;
        public int ShieldPerTurn;
        /// <summary>Attack on each of the tableau's five slots (port the first two, starboard the last two).</summary>
        public int[] Guns = new int[5];
        public int Opening;
        public int Cool;
        public int March;
        /// <summary>The warp drive's reach (0: none).</summary>
        public double Warp;
        /// <summary>Fitted parts' ids, by slot (for the ship's model).</summary>
        public Dictionary<string, string> Fitted = new Dictionary<string, string>();
    }

    /// <summary>
    /// The Captain's ship parts (parts.ts): six slots, each taking its own kind of part. A part is found once and kept
    /// for every run after, in the hangar; what is fitted goes with each run.
    /// </summary>
    public static class Parts
    {
        public class Data
        {
            public List<ShipSlot> Slots;
            public List<ShipPartDef> Parts;
        }

        public static Data D;

        /// <summary>The slots: which part kind each takes.</summary>
        public static List<ShipSlot> ShipSlots => D.Slots;
        /// <summary>Every part there is, by kind, plainest first.</summary>
        public static List<ShipPartDef> ShipParts => D.Parts;

        public static string SlotKind(string slot) => ShipSlots.First(s => s.Id == slot).Kind;
        public static ShipPartDef ShipPart(string id) => ShipParts.FirstOrDefault(p => p.Id == id);

        /// <summary>Which of the ship's slots a part may go in.</summary>
        public static List<string> PartSlots(string id)
        {
            var p = ShipPart(id);
            return p != null ? ShipSlots.Where(s => s.Kind == p.Kind).Select(s => s.Id).ToList() : new List<string>();
        }

        public static ShipFit ShipFit(IDictionary<string, string> fitted)
        {
            var outs = new ShipFit();
            foreach (var slot in ShipSlots)
            {
                string id = null;
                if (fitted != null) fitted.TryGetValue(slot.Id, out id);
                var p = ShipPart(id);
                if (p == null || p.Kind != slot.Kind) continue;
                outs.Fitted[slot.Id] = p.Id;
                outs.Health += p.Health ?? 0;
                outs.Walls += p.Walls ?? 0;
                outs.Shields += p.Shields ?? 0;
                outs.ShieldPerTurn += p.ShieldPerTurn ?? 0;
                outs.Opening += p.Opening ?? 0;
                outs.Cool += p.Cool ?? 0;
                outs.March += p.March ?? 0;
                outs.Warp = Math.Max(outs.Warp, p.Warp ?? 0);
                if ((p.Guns ?? 0) != 0) foreach (var i in slot.Id == "port" ? new[] { 0, 1 } : new[] { 3, 4 }) outs.Guns[i] += p.Guns.Value;
            }
            return outs;
        }

        /// <summary>The rarity of a part found: better the deeper the run (a boss's, a step better again).</summary>
        public static string PartRarity(int universe, double roll, bool boss = false)
        {
            int lift = universe - 1 + (boss ? 1 : 0);
            double anomaly = Math.Min(0.5, 0.08 + 0.12 * lift);
            double stellar = Math.Min(0.9, 0.35 + 0.15 * lift);
            return roll < anomaly ? "anomaly" : roll < anomaly + stellar ? "stellar" : "dwarf";
        }

        static string Pick(List<ShipPartDef> pool, double pick) => pool[(int)(Math.Floor(pick * pool.Count) % pool.Count)].Id;

        /// <summary>A merchant's device that works: one not yet in the hangar (null if every one is had).</summary>
        public static string NewCurio(IList<string> have, double pick)
        {
            var pool = ShipParts.Where(p => p.Curio == true && !have.Contains(p.Id)).ToList();
            return pool.Count > 0 ? Pick(pool, pick) : null;
        }

        /// <summary>A common (white dwarf) part not yet in the hangar, or null if every one is had (Spare parts, from the skill tree).</summary>
        public static string NewCommonPart(IList<string> have, double pick)
        {
            var pool = ShipParts.Where(p => p.Rarity == "dwarf" && p.Curio != true && !have.Contains(p.Id)).ToList();
            return pool.Count > 0 ? Pick(pool, pick) : null;
        }

        /// <summary>A part not yet in the hangar, of a rarity (or the nearest there is), or null if every part is had.</summary>
        public static string NewPart(IList<string> have, string rarity, double pick)
        {
            var order = rarity == "anomaly" ? new[] { "anomaly", "stellar", "dwarf" } : rarity == "stellar" ? new[] { "stellar", "anomaly", "dwarf" } : new[] { "dwarf", "stellar", "anomaly" };
            foreach (var r in order)
            {
                var pool = ShipParts.Where(p => p.Rarity == r && p.Curio != true && !have.Contains(p.Id)).ToList();
                if (pool.Count > 0) return Pick(pool, pick);
            }
            return null;
        }
    }
}
