namespace BlueLoop.Engine
{
    /// <summary>
    /// Seeded RNG (mulberry32), bit for bit the TypeScript engine's (rng.ts): its state is stored in the game, so a
    /// game replays exactly from its seed and its actions.
    /// </summary>
    public interface IRngState
    {
        int RngState { get; set; }
    }

    public static class Rng
    {
        public static double Next(IRngState s)
        {
            unchecked
            {
                int t = s.RngState = s.RngState + 0x6d2b79f5;
                t = (int)((uint)(t ^ (int)((uint)t >> 15)) * (uint)(t | 1));
                t ^= t + (int)((uint)(t ^ (int)((uint)t >> 7)) * (uint)(t | 61));
                return (uint)(t ^ (int)((uint)t >> 14)) / 4294967296.0;
            }
        }

        public static int Int(IRngState s, int maxExclusive) => (int)System.Math.Floor(Next(s) * maxExclusive);

        public static System.Collections.Generic.List<T> Shuffle<T>(IRngState s, System.Collections.Generic.List<T> items)
        {
            for (int i = items.Count - 1; i > 0; i--)
            {
                int j = Int(s, i + 1);
                (items[i], items[j]) = (items[j], items[i]);
            }
            return items;
        }
    }
}
