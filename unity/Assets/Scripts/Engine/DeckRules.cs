using System;
using System.Collections.Generic;
using System.Linq;

namespace BlueLoop.Engine
{
    /// <summary>What makes a deck legal (cards.ts deckProblems, commandCardsFor).</summary>
    public static class DeckRules
    {
        /// <summary>How many Heroes a deck of this size runs: one per CardsPerCommand cards (3 in 30, 4 in 40).</summary>
        public static int CommandCardsFor(int size) => Math.Max(1, Math.Max(size, Balance.DeckSize) / Balance.CardsPerCommand);

        /// <summary>Why a deck can't be played in a mode (empty if it can).</summary>
        public static List<string> DeckProblems(List<string> cards, string mode = "lost")
        {
            var problems = new List<string>();
            foreach (var id in cards.Distinct())
            {
                if (!CardData.TryGet(id, out var def)) continue;
                var why = Modes.ModeProblem(Cards.Def(id), mode);
                if (why != null) problems.Add($"{def.Name}: {why}");
            }
            if (cards.Count < Balance.DeckSize || cards.Count > Balance.MaxDeckSize) problems.Add($"A deck needs {Balance.DeckSize}–{Balance.MaxDeckSize} cards (this has {cards.Count}).");
            var order = new List<string>();
            var counts = new Dictionary<string, int>();
            foreach (var id in cards)
            {
                if (!counts.ContainsKey(id)) { counts[id] = 0; order.Add(id); }
                counts[id]++;
            }
            foreach (var id in order)
            {
                bool known = CardData.TryGet(id, out var d) && d.Token != true;
                if (!known && !Builds.IsFused(id)) problems.Add($"Unknown card: {id}.");
                else if (counts[id] > Campaign.CopyLimit(id)) problems.Add(Campaign.CopyLimit(id) == 1 ? $"{Cards.Def(id).Name} is an Anomaly: only one copy per deck." : $"At most {Balance.MaxCopies} copies of {Cards.Def(id).Name}.");
            }
            int commands = cards.Count(id => (CardData.TryGet(id, out var d) ? d : Builds.IsFused(id) ? Cards.Def(id) : null)?.Kind == "command");
            int need = CommandCardsFor(cards.Count);
            if (commands != need) problems.Add($"A deck of {cards.Count} needs exactly {need} Heroes: one per {Balance.CardsPerCommand} cards (this has {commands}).");
            return problems;
        }
    }
}
