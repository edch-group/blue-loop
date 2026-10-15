using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using Newtonsoft.Json.Linq;
using UnityEngine;
using EngineAction = BlueLoop.Engine.Action;

/// <summary>
/// A game's anonymous summary, for balancing (src/engine/stats.ts, app.ts statsRec): the decks on each side, who went
/// first and who won, how long it took, which cards were played when, and (against the AI or pass and play) the whole
/// game to replay: its opening, with no names, and every move since. Made as the game is played on this device (online,
/// the room makes it); kept beside the save ("blue-loop:stats-rec"), so a game resumed is still summed up; sent once the
/// game is over (Account.SendGameStats), unless sharing is switched off.
/// </summary>
public partial class BattleView
{
    const string StatsRecKey = "blue-loop:stats-rec";

    /// <summary>The running summary (null: this game isn't summed up here).</summary>
    JObject statsRec;
    /// <summary>The point of the game the summary kept beside the save goes with (written again only when it moves on).</summary>
    string statsMark;

    /// <summary>
    /// The game begun (app.ts begin): a fresh one is summed up from its start ("campaign", "ai", or "hotseat"); a resumed
    /// one picks its summary up where it was left; a lesson, a challenge or an online game, none.
    /// </summary>
    void BeginStats()
    {
        statsRec = null;
        statsMark = null;
        if (state == null || puzzleKind != null || online || Autoplay || !Application.isPlaying) return;
        int humans = state.Players.Count(p => !p.IsAI);
        if (state.WinnerId != null || humans == 0) return;
        if (state.TurnNumber <= 1) statsRec = StartStats(state, campaignOf != null ? "campaign" : humans == 1 ? "ai" : "hotseat");
        else
        {
            var kept = Store.Get(StatsRecKey);
            try
            {
                var o = kept != null ? JObject.Parse(kept) : null;
                if (o != null && (string)o["mark"] == GameMark(state)) statsRec = o["rec"] as JObject;
            }
            catch
            {
                // Unreadable: a resumed game just goes unrecorded.
            }
        }
    }

    /// <summary>stats.ts beginStats: the start of a game's summary, from its opening state.</summary>
    static JObject StartStats(GameState s, string mode)
    {
        var seats = new JArray();
        foreach (var p in s.Players)
        {
            var cards = DeckCards(p);
            seats.Add(new JObject { ["human"] = !p.IsAI, ["starter"] = StarterOf(cards), ["cards"] = new JArray(cards) });
        }
        var o = new JObject
        {
            ["v"] = 1,
            ["mode"] = mode,
            ["seats"] = seats,
            ["winner"] = null,
            ["end"] = "other",
            ["rounds"] = s.Round,
            ["plays"] = new JArray(),
        };
        if (mode == "ai" || mode == "hotseat") o["trace"] = new JObject { ["start"] = JObject.Parse(Json.Write(Anonymous(s))), ["moves"] = new JArray() };
        return o;
    }

    /// <summary>stats.ts deckCards: every card a player has, wherever it is (sorted card ids): at the start of a game, its deck.</summary>
    static List<string> DeckCards(PlayerState p)
    {
        var all = new List<CardInstance>();
        all.AddRange(p.Deck ?? new List<CardInstance>());
        all.AddRange(p.Hand ?? new List<CardInstance>());
        all.AddRange(p.Discard ?? new List<CardInstance>());
        all.AddRange(p.Wreck ?? new List<CardInstance>());
        foreach (var c in p.Tableau ?? new List<CardInstance>())
        {
            all.Add(c);
            all.AddRange(c.Fused ?? new List<CardInstance>());
        }
        if (p.Lightspeed != null) all.Add(p.Lightspeed);
        var ids = all.Select(c => c.DefId).ToList();
        ids.Sort(string.CompareOrdinal);
        return ids;
    }

    /// <summary>stats.ts starterOf: the starter deck these cards are, if they are exactly one.</summary>
    static string StarterOf(List<string> cards)
    {
        string Key(IEnumerable<string> ids)
        {
            var l = ids.ToList();
            l.Sort(string.CompareOrdinal);
            return string.Join(",", l);
        }
        var key = Key(cards);
        return CardData.Decks.FirstOrDefault(d => Key(d.Cards) == key)?.Name;
    }

    /// <summary>stats.ts anonymous: a game's opening state with nothing about who plays it (seats for names, and no log: it names them).</summary>
    static GameState Anonymous(GameState s)
    {
        var a = Json.Clone(s);
        for (int i = 0; i < a.Players.Count; i++) a.Players[i].Name = $"Seat {i + 1}";
        a.Log = new List<LogEntry>();
        a.TurnPulses = new List<TurnPulse>();
        return a;
    }

    /// <summary>stats.ts noteMove: a move noted (for the replay); a card played written down, with its seat and the round.</summary>
    void NoteMove(GameState prev, EngineAction a)
    {
        if (statsRec == null) return;
        (statsRec["trace"]?["moves"] as JArray)?.Add(JObject.Parse(Json.Write(a)));
        if (a.Type != "playCard") return;
        int seat = prev.ActivePlayerIndex;
        var card = seat < prev.Players.Count ? prev.Players[seat].Hand?.FirstOrDefault(c => c.Uid == a.CardUid) : null;
        if (card != null && CardData.TryGet(card.DefId, out _)) ((JArray)statsRec["plays"]).Add(new JArray(seat, prev.Round, card.DefId));
    }

    /// <summary>
    /// app.ts persist: over, the summary goes off (once: stats.ts finishStats, who won and how); else it is kept beside
    /// the save, with the point of the game it goes with.
    /// </summary>
    void KeepStats()
    {
        if (statsRec == null || state == null || !Application.isPlaying) return;
        if (state.WinnerId != null)
        {
            int winner = state.Players.FindIndex(p => p.Id == state.WinnerId);
            statsRec["winner"] = winner >= 0 ? winner : (JToken)null;
            statsRec["end"] = state.ConcededBy != null ? "concede" : winner >= 0 ? "supernova" : "other";
            statsRec["rounds"] = state.Round;
            Account.SendGameStats(statsRec);
            statsRec = null;
            statsMark = null;
            Store.Remove(StatsRecKey);
            return;
        }
        var mark = GameMark(state);
        if (mark == statsMark) return;
        statsMark = mark;
        Store.Set(StatsRecKey, new JObject { ["mark"] = mark, ["rec"] = statsRec }.ToString(Newtonsoft.Json.Formatting.None));
    }

    /// <summary>app.ts gameMark: which game, at which point (the summary kept goes with the save made at the same move).</summary>
    static string GameMark(GameState s) => $"{s.TurnNumber}|{string.Join(",", s.Players.Select(p => $"{p.Id}:{p.Heat}:{p.Deck?.Count ?? 0}:{p.Hand?.Count ?? 0}"))}";
}
