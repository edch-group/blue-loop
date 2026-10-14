using System.Collections.Generic;

namespace BlueLoop.Engine
{
    public class DeckList
    {
        public string Name;
        public List<string> Cards;
        public bool? Mixed;
        public string Cover;
        public string Mode;
    }

    /// <summary>
    /// The cards with fixed ids, as they play, and the preset decks: data written by the TypeScript engine
    /// (scripts/export-engine.ts), loaded once before any game.
    /// </summary>
    public static class CardData
    {
        static readonly Dictionary<string, CardDef> ById = new Dictionary<string, CardDef>();
        public static List<CardDef> All { get; private set; } = new List<CardDef>();
        public static List<DeckList> Decks { get; private set; } = new List<DeckList>();

        public static void Load(string cardsJson, string decksJson)
        {
            All = Json.Read<List<CardDef>>(cardsJson);
            ById.Clear();
            foreach (var c in All) ById[c.Id] = c;
            Decks = Json.Read<List<DeckList>>(decksJson);
        }

        public static bool TryGet(string id, out CardDef def) => ById.TryGetValue(id, out def);
    }
}
