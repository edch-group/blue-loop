using System.Collections.Generic;

namespace BlueLoop.Engine
{
    /// <summary>A race's trait as a player reads it: the keyword it gives, and which of its cards it shows on as a tag.</summary>
    public partial class RaceTrait
    {
        /// <summary>The keyword it gives ("Name: what it does.").</summary>
        public string Bonus;
        /// <summary>"text" (written into the card's own text), "darkspeed" or "attune".</summary>
        public string BonusOn;

        // (Written as the TypeScript engine writes a trait: the numbers a trait doesn't give, left out.)
        public bool ShouldSerializeSturdy() => Sturdy != 0;
        public bool ShouldSerializeSting() => Sting != 0;
        public bool ShouldSerializeAttune() => Attune != 0;
        public bool ShouldSerializeAmbush() => Ambush;
    }

    /// <summary>A sub-race of the newer races: its race, its name and what it does.</summary>
    public class Subrace
    {
        public int Race;
        public string Name;
        public string Theme;
    }

    /// <summary>
    /// The races (races.ts). Some carry a trait: an existing keyword written onto each of their cards (Vorthane and Pyrr
    /// Sting, Nyxari Darkspeed, Korrath Sturdy, Seren an extra Attune). The four newer races also split into sub-races.
    /// </summary>
    public static partial class Races
    {
        public class Data
        {
            public List<string> Names;
            public List<RaceTrait> Traits;
            public Dictionary<string, Subrace> Subraces;
        }

        public static Data D;

        public static List<string> RaceNames => D.Names;
        /// <summary>By race: a trait, or none (null).</summary>
        public static List<RaceTrait> RaceTraits => D.Traits;
        /// <summary>The sub-races of the newer races, by id (on cards, as `sub`).</summary>
        public static Dictionary<string, Subrace> Subraces => D.Subraces;

        /// <summary>A race's trait, with its words (none for neutral cards).</summary>
        public static RaceTrait RaceTrait(int? race) => race == null || race < 0 || race >= RaceTraits.Count ? null : RaceTraits[race.Value];

        /// <summary>The sub-race's name, or its race's (or "neutral").</summary>
        public static string RaceLabel(int? race, string sub = null)
        {
            if (!string.IsNullOrEmpty(sub) && Subraces.TryGetValue(sub, out var s)) return s.Name;
            return race == null ? "neutral" : RaceNames[race.Value];
        }
    }
}
