namespace BlueLoop.Engine
{
    /// <summary>Every tunable number in the game (balance.ts).</summary>
    public static class Balance
    {
        public const int MinPlayers = 2, MaxPlayers = 2;
        public const int StartingHeat = 0, MinHeat = -10, SupernovaAt = 20;
        public const int DeckSize = 30, MaxDeckSize = 40, CardsPerCommand = 10, MaxCopies = 2, MaxAnomalyCopies = 1;
        public const int OpeningHand = 5, DrawPerTurn = 1, WreckPerDawn = 2, MaxHand = 5;
        public const int LaterSeatCards = 1, LaterSeatPlays = 0, LaterSeatCool = 0, CatchUpMaxPlayers = 2, FatigueHeat = 2;
        public const int MaxPlays = 5, OrbitTurns = 1, AbundantDraw = 1, IndustrialPlays = 1, TableauSlots = 5;
        public static readonly int[] SlotDefence = { 1, 2, 3, 2, 1 };
        public const double PierceShieldShare = 0.5;
        public const int CommandSlotDefence = 3, MaxFused = 2, DefenceMend = 0, HeroStability = 5;
        public const int MaxGrowth = 5, GrowthAttack = 1, GrowthAttackAll = 1, GrowthHealth = 0;
        public const int MinHealth = 2, MaxHealth = 8, MaxKeptShields = 12;
        public const int InstabilityStartsRound = 8, InstabilityRampEvery = 1;
        public const int MaxLogEntries = 20;
    }
}
