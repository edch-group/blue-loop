using System.Collections.Generic;

namespace BlueLoop.Engine
{
    /// <summary>What a run starts with and is played under, bought between runs (meta.ts RunBonuses).</summary>
    public class RunBonuses
    {
        public int Materials;
        public int Cards;
        public int Picks;
        public int Hull;
        public int Shields;
        public int Walls;
        public int Grace;
        public int ArmoryDiscount;
        public double PetalBonus;
        public int Salvage;
        public int Hoard;
        public int Favour;
        public List<string> Deck;
        public BattleModifiers Mods;
        public int? Mend;
        public double? Loot;
        public int? Heirloom;
        public int? Stock;
        public int? Legacy;
        public int? Plunder;
        public ShipFit Ship;
        public List<string> Hangar;
        public List<string> Companions;
        public string Kept;
        public int? Spared;
        public int? Hunters;
        public Affinity Affinity;
        public double? XpBonus;
        public int? Choices;
        public int? Tithe;
        public int? Vault;
    }

    /// <summary>The loop's lasting progress (meta.ts): what carries from run to run.</summary>
    public static partial class Meta
    {
        /// <summary>A run's bonuses with nothing bought (runBonuses(null)).</summary>
        public static RunBonuses RunBonusesFor(object meta) => new RunBonuses
        {
            Deck = new List<string>(),
            Mods = new BattleModifiers(),
            Mend = 0,
            Loot = 0,
            Heirloom = 0,
            Stock = 0,
            Legacy = 0,
            Plunder = 0,
            XpBonus = 0,
            Choices = 0,
            Tithe = 0,
            Vault = 0,
            Companions = new List<string>(),
            Spared = 0,
            Hunters = 0,
        };
    }
}
