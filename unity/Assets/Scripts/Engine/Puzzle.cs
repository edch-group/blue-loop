using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace BlueLoop.Engine
{
    /// <summary>A position reached in a search: the game there, the fewest moves to reach it, and those moves.</summary>
    public class Reached
    {
        public GameState S;
        public int Depth;
        public List<Action> Line;
    }

    /// <summary>
    /// Set positions as puzzles (puzzle.ts: dreams, lessons, challenges): a full search of what the player can do in their
    /// day, and whether a line of play solves the puzzle (a win before the day ends, or the rival's next day lived through).
    /// </summary>
    public static class Puzzle
    {
        static string N(int? x) => x?.ToString(System.Globalization.CultureInfo.InvariantCulture);

        /// <summary>A position's identity for the search (what a later move can tell apart).</summary>
        static string Key(GameState s)
        {
            var sb = new StringBuilder("[");
            for (int i = 0; i < s.Players.Count; i++)
            {
                var p = s.Players[i];
                if (i > 0) sb.Append(',');
                // (Each card as a row, sorted as JavaScript sorts arrays: by the row's text, its parts joined with commas.)
                var rows = p.Tableau.Select(c =>
                {
                    var parts = new[] { c.DefId, N(c.Slot), N(c.Health), c.Dimmed == true ? "1" : "0", (c.SpentAttack ?? 0) != 0 ? "1" : "0", N(c.Dented ?? 0), N(c.Shields ?? 0), N(c.AttackBonus ?? 0), N(c.Growth ?? 0) };
                    var json = "[" + Json.Write(c.DefId) + "," + string.Join(",", parts.Skip(1).Select(x => x ?? "null")) + "]";
                    return (text: string.Join(",", parts.Select(x => x ?? "")), json);
                }).OrderBy(r => r.text, StringComparer.Ordinal).Select(r => r.json);
                var hand = p.Hand.Select(c => c.DefId).OrderBy(x => x, StringComparer.Ordinal).Select(x => Json.Write(x));
                sb.Append('[').Append(p.Heat).Append(',').Append(p.Shields).Append(',').Append(p.PlaysLeft).Append(",[")
                    .Append(string.Join(",", rows)).Append("],[").Append(string.Join(",", hand)).Append("],")
                    .Append(Json.Write(p.Lightspeed?.DefId ?? "")).Append(']');
            }
            return sb.Append(']').ToString();
        }

        /// <summary>A move made, or null if it can't be (or it opens a choice the search doesn't follow).</summary>
        public static GameState Step(GameState s, Action a)
        {
            try
            {
                var n = Game.Apply(s, a);
                if (n.Reaction != null || (n.Players[0].DawnChoices?.Count ?? 0) > 0) return null;
                return n;
            }
            catch (Exception)
            {
                return null;
            }
        }

        static bool PlayersMove(GameState g) => Game.ActivePlayer(g) == g.Players[0];

        /// <summary>The rival's whole day, played by the AI, back round to the player (or to an end).</summary>
        public static GameState RivalDay(GameState s)
        {
            var g = Step(s, new Action { Type = "endTurn" });
            if (g == null) return s;
            for (int i = 0; i < 80 && !Game.IsGameOver(g) && !PlayersMove(g); i++)
            {
                var n = RivalMove(g, AI.Choose(g));
                if (n == null) break;
                g = n;
            }
            return g;
        }

        /// <summary>A rival's move, any answer of the player's to it resolved (a trap set face down springs by itself; nothing more is played).</summary>
        static GameState RivalMove(GameState g, Action a)
        {
            try
            {
                var n = Game.Apply(g, a);
                for (int k = 0; k < 4 && n.Reaction != null; k++) n = Game.Apply(n, new Action { Type = "react" });
                return n.Reaction != null ? null : n;
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>Every position reachable this day (to a cap), with the fewest moves to reach it, and the moves (only those `allow` lets through, if given).</summary>
        public static List<Reached> Reach(GameState start, int cap = 6000, Func<GameState, Action, bool> allow = null)
        {
            var seen = new HashSet<string> { Key(start) };
            var outs = new List<Reached>();
            var queue = new Queue<Reached>();
            queue.Enqueue(new Reached { S = start, Depth = 0, Line = new List<Action>() });
            while (queue.Count > 0 && outs.Count < cap)
            {
                var cur = queue.Dequeue();
                outs.Add(cur);
                if (Game.IsGameOver(cur.S)) continue;
                foreach (var a in AI.MovesNow(cur.S))
                {
                    if (allow != null && !allow(cur.S, a)) continue;
                    var n = Step(cur.S, a);
                    if (n == null) continue;
                    if (!seen.Add(Key(n))) continue;
                    queue.Enqueue(new Reached { S = n, Depth = cur.Depth + 1, Line = cur.Line.Append(a).ToList() });
                }
            }
            return outs;
        }

        /// <summary>A move that leaves the rival's board alone: no attack, aimed heat or removal at any card of theirs.</summary>
        public static bool LeavesTheirBoard(GameState s, Action a)
        {
            var text = Json.Write(a);
            return !s.Players[1].Tableau.Any(c => text.Contains($"\"{c.Uid}\""));
        }

        static bool Won(GameState s) => s.WinnerId == s.Players[0].Id;

        /// <summary>The dreamer's next day: the rival's day played out, back to the dreamer (null: it never came, or the game ended).</summary>
        public static GameState NextDay(GameState s)
        {
            var g = RivalDay(s);
            return Game.IsGameOver(g) || !PlayersMove(g) ? null : g;
        }

        /// <summary>Whether a line solves it: a win reached this day, or (survive) the rival's day lived through after it.</summary>
        public static bool Solves(string goal, GameState s)
        {
            // (A win may come as the day ends: a dusk's heat.)
            if (goal == "win") return Won(s) || (!Game.IsGameOver(s) && Won(Step(s, new Action { Type = "endTurn" }) ?? s));
            if (Game.IsGameOver(s)) return Won(s);
            return Won(RivalDay(s));
        }

        public static bool Solves(Game.DreamSpec spec, GameState s) => Solves(spec.Goal, s);

        /// <summary>A position as a game (the same seed always, so a search and a test see the same game).</summary>
        public static GameState PuzzleGame(Game.DreamSpec spec) => Game.CreateDream(spec, 7, "Dreamer", "Dream");

        /// <summary>The shortest solution (its moves; a multi-day one with each day's end between), or null if none is in reach.</summary>
        public static List<Action> Solution(Game.DreamSpec spec)
        {
            if ((spec.Days ?? 1) > 1) return WinWithin(PuzzleGame(spec), spec.Days.Value);
            List<Action> best = null;
            foreach (var r in Reach(PuzzleGame(spec)))
                if ((best == null || r.Line.Count < best.Count) && Solves(spec, r.S)) best = r.Line;
            return best;
        }

        /// <summary>
        /// A win within `days` of the player's days from here (the rival's days played by its AI between): the moves, each
        /// day's closed by its end, or null. Positions met at the start of a day are searched once.
        /// </summary>
        public static List<Action> WinWithin(GameState start, int days, int cap = 3000, Dictionary<string, int> seen = null, Func<GameState, Action, bool> allow = null)
        {
            seen ??= new Dictionary<string, int>();
            var all = Reach(start, cap, allow);
            // (A win this day, the shortest first; a dusk's heat counts.)
            List<Action> best = null;
            foreach (var r in all)
                if ((best == null || r.Line.Count < best.Count) && Solves("win", r.S)) best = r.Line;
            if (best != null || days <= 1) return best;
            foreach (var r in all)
            {
                if (Game.IsGameOver(r.S)) continue;
                var next = NextDay(r.S);
                if (next == null) continue;
                var k = Key(next);
                // (A position already searched with as many days left, or more, adds nothing.)
                if ((seen.TryGetValue(k, out var had) ? had : 0) >= days - 1) continue;
                seen[k] = days - 1;
                var rest = WinWithin(next, days - 1, cap, seen, allow);
                if (rest != null) return r.Line.Append(new Action { Type = "endTurn" }).Concat(rest).ToList();
            }
            return null;
        }

        /// <summary>The most heat the player can put on the rival's sun within `days` of their days (for setting a multi-day puzzle's sun).</summary>
        public static int MostHeatWithin(GameState start, int days, int cap = 3000, Dictionary<string, int> seen = null)
        {
            seen ??= new Dictionary<string, int>();
            var all = Reach(start, cap);
            int most = all.Max(r => r.S.Players[1].Heat);
            if (days <= 1) return most;
            foreach (var r in all)
            {
                if (Game.IsGameOver(r.S)) continue;
                var next = NextDay(r.S);
                if (next == null) continue;
                var k = Key(next);
                if ((seen.TryGetValue(k, out var had) ? had : 0) >= days - 1) continue;
                seen[k] = days - 1;
                most = Math.Max(most, MostHeatWithin(next, days - 1, cap, seen));
            }
            return most;
        }

        /// <summary>
        /// Whether a move keeps a puzzle winnable from here (in the tutorial, Oriel blocks a wrong move and says what was
        /// wrong). Moves the rules refuse anyway pass (the rules say why); a move that wins passes.
        /// </summary>
        public static bool KeepsWinnable(Game.DreamSpec spec, GameState state, Action action)
        {
            var s = Game.Clone(state);
            var n = Step(s, action);
            if (n == null) return true;
            if (Won(n)) return true;
            if (Game.IsGameOver(n)) return false;
            int daysLeft = (spec.Days ?? 1) - Math.Max(0, state.Players[0].TurnsTaken - 1);
            if (action.Type == "endTurn")
            {
                if (spec.Goal == "survive") return Solves(spec, s);
                if (daysLeft <= 1) return false;
                var next = NextDay(s);
                return next != null && WinWithin(next, daysLeft - 1, 1500) != null;
            }
            if (spec.Goal == "win") return WinWithin(n, daysLeft, 1500) != null;
            return Reach(n, 1500).Any(x => Solves(spec, x.S));
        }
    }
}
