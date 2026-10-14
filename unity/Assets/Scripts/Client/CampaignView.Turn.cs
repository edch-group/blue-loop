using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;

/// <summary>
/// Time Dense Space turns a notch as each of the player's turns ends (Campaign.TurnTime), seen as a short sequence
/// (campaign.ts animateTurn) [direction: slow; before turning, the routes it breaks away from retract (with a sound);
/// it turns; the new routes extend out (a noise as they extend, another as they link), lighting up once fully
/// connected]: from the rings and routes before the move to the state's own.
/// </summary>
public partial class CampaignView
{
    /// <summary>Time Dense Space before a move: its rings' turns and its routes, to turn from.</summary>
    class TimeWas
    {
        public Dictionary<int, int> Turns;
        public HashSet<string> Edges;
    }

    /// <summary>A route mid-turn, drawn from its end that turns.</summary>
    class TurnEdge
    {
        public string From, To;
    }

    /// <summary>A turn under way: its rings from and to, the routes breaking (drawn back in) and making (reaching out, then linking).</summary>
    class TurnRun
    {
        public CampaignState State;
        public Dictionary<int, int> From, To;
        public HashSet<int> Turned;
        public List<TurnEdge> Breaking, Making;
        public float T0, Retract, Spin, Extend, Link;
        public string Phase = "retract", Heard = "retract";
        public float K;
    }

    TurnRun turnAnim;

    static HashSet<string> EdgesOf(CampaignState s) =>
        new HashSet<string>(s.Nodes.SelectMany(n => n.Links.Where(m => string.CompareOrdinal(n.Id, m) < 0).Select(m => n.Id + "|" + m)));

    static TimeWas TimeNow(CampaignState s) =>
        s.Rift?.Kind == "time" ? new TimeWas { Turns = new Dictionary<int, int>(s.RingSpins ?? new Dictionary<int, int>()), Edges = EdgesOf(s) } : null;

    static int TurnOf(Dictionary<int, int> turns, int ring) => turns != null && turns.TryGetValue(ring, out var v) ? v : 0;

    /// <summary>Whether a route is mid-turn (drawn by the turn, not as it stands).</summary>
    bool Turning(string a, string b)
    {
        var run = turnAnim;
        if (run == null) return false;
        bool Is(TurnEdge e) => (e.From == a && e.To == b) || (e.From == b && e.To == a);
        return run.Breaking.Any(Is) || run.Making.Any(Is);
    }

    /// <summary>A move made: if Time Dense Space's rings turned, the turn plays out.</summary>
    void BeginTurn(TimeWas from)
    {
        var s = state;
        if (from == null || s.Rift?.Kind != "time" || !Application.isPlaying) return;
        var to = new Dictionary<int, int>(s.RingSpins ?? new Dictionary<int, int>());
        var edges = EdgesOf(s);
        var turned = new HashSet<int>(to.Keys.Where(ring => TurnOf(to, ring) != TurnOf(from.Turns, ring)));
        if (turned.Count == 0) return;
        bool Moves(string id) => turned.Contains(s.Nodes.FirstOrDefault(q => q.Id == id)?.SpinRing ?? -1);
        bool Known(string id) => s.Nodes.Any(q => q.Id == id);
        // (Each route drawn from its end that turns.)
        TurnEdge Ends(string e)
        {
            var ab = e.Split('|');
            return Moves(ab[0]) || !Moves(ab[1]) ? new TurnEdge { From = ab[0], To = ab[1] } : new TurnEdge { From = ab[1], To = ab[0] };
        }
        var breaking = from.Edges.Where(e => !edges.Contains(e) && Known(e.Split('|')[0]) && Known(e.Split('|')[1])).Select(Ends).ToList();
        var making = edges.Where(e => !from.Edges.Contains(e)).Select(Ends).ToList();
        turnAnim = new TurnRun
        {
            State = s, From = from.Turns, To = to, Turned = turned, Breaking = breaking, Making = making, T0 = Clock,
            Retract = breaking.Count > 0 ? 0.45f : 0, Spin = 2, Extend = making.Count > 0 ? 0.52f : 0, Link = making.Count > 0 ? 0.52f : 0,
        };
        if (breaking.Count > 0) Sound.Play("link-retract");
        LayTurn(0);
    }

    /// <summary>The turned rings laid part way round (0 as they were, 1 as they are now): their systems and the ships at them.</summary>
    void LayTurn(float k)
    {
        var run = turnAnim;
        var s = state;
        var mid = new Dictionary<int, double>();
        foreach (var ring in run.To.Keys.Concat(run.From.Keys).Distinct())
            mid[ring] = TurnOf(run.From, ring) + (TurnOf(run.To, ring) - TurnOf(run.From, ring)) * (double)k;
        Campaign.SpinGalaxy(s, false, mid);
        PlaceTurned(run.Turned);
    }

    /// <summary>The systems on the turned rings where the state has them now, and the ships at them.</summary>
    void PlaceTurned(HashSet<int> turned)
    {
        var s = state;
        foreach (var n in s.Nodes)
            if (turned.Contains(n.SpinRing ?? -1) && nodes.TryGetValue(n.Id, out var t) && t != null) t.localPosition = NodePos(n.Id);
        float now = Clock;
        foreach (var army in s.Armies)
        {
            if (!tracks.TryGetValue(army.Id, out var sh) || sh.T == null || sh.Cruise != null) continue;
            var n = s.Nodes.FirstOrDefault(q => q.Id == army.NodeId);
            if (n == null || !turned.Contains(n.SpinRing ?? -1)) continue;
            var w = Web(n.X, n.Y);
            // (Bound there: it flies on to where its star is now; at rest there: carried round with it.)
            if (now - sh.T0 >= sh.Dur) sh.From = w;
            sh.To = w;
            sh.ToY = (float)(n.H ?? 0) * MapK;
        }
    }

    static float EaseTurn(float k) => k < 0.5f ? 4 * k * k * k : 1 - Mathf.Pow(-2 * k + 2, 3) / 2;

    /// <summary>The turn this frame: retracting, turning, extending, linking; then done.</summary>
    void StepTurn()
    {
        var run = turnAnim;
        if (run == null) return;
        if (run.State != state) { EndTurnAnim(); return; }
        float at = Clock - run.T0, total = run.Retract + run.Spin + run.Extend + run.Link;
        if (at < run.Retract)
        {
            run.Phase = "retract";
            run.K = at / run.Retract;
        }
        else if (at < run.Retract + run.Spin)
        {
            run.Phase = "turn";
            if (run.Heard != "turn")
            {
                run.Heard = "turn";
                Sound.Play("boom-tick");
            }
            LayTurn(EaseTurn((at - run.Retract) / run.Spin));
        }
        else if (at < run.Retract + run.Spin + run.Extend)
        {
            if (run.Heard == "turn" || run.Heard == "retract") LayTurn(1);
            run.Phase = "extend";
            run.K = (at - run.Retract - run.Spin) / run.Extend;
            if (run.Heard != "extend")
            {
                run.Heard = "extend";
                Sound.Play("link-extend");
            }
        }
        else if (at < total)
        {
            if (run.Heard == "turn" || run.Heard == "retract") LayTurn(1);
            run.Phase = "link";
            run.K = (at - run.Retract - run.Spin - run.Extend) / run.Link;
            if (run.Heard != "link")
            {
                run.Heard = "link";
                Sound.Play("link-confirm");
            }
        }
        else
        {
            EndTurnAnim();
            return;
        }
        RedrawRoutes();
    }

    /// <summary>The turn over (or cut short by another move): the rings where they are, the routes as they stand.</summary>
    void EndTurnAnim()
    {
        var run = turnAnim;
        if (run == null) return;
        turnAnim = null;
        if (run.State != state) return;
        Campaign.SpinGalaxy(state);
        PlaceTurned(run.Turned);
        RedrawRoutes();
    }

    void RedrawRoutes()
    {
        if (mapRoot == null) return;
        Routes(new HashSet<string>(Campaign.VisibleNodes(state, state.PlayerId)));
    }

    /// <summary>The routes mid-turn: those breaking drawn back into their moving star, the new ones reaching out from it and flaring as they link.</summary>
    void TurnRoutes(List<RouteLine> lines, HashSet<string> seen, System.Func<CampaignNode, Vector3> at)
    {
        var run = turnAnim;
        void Part(TurnEdge e, float t, float glow)
        {
            if (t <= 0 || !seen.Contains(e.From) || !seen.Contains(e.To)) return;
            var p = state.Nodes.FirstOrDefault(q => q.Id == e.From);
            var o = state.Nodes.FirstOrDefault(q => q.Id == e.To);
            if (p == null || o == null) return;
            Vector3 a = at(p), b = at(o);
            lines.Add(new RouteLine { A = a, B = a + (b - a) * Mathf.Min(1, t), Colour = Color.white, Glow = glow });
        }
        if (run.Phase == "retract") foreach (var e in run.Breaking) Part(e, 1 - run.K, 0);
        else if (run.Phase == "extend") foreach (var e in run.Making) Part(e, run.K, 0);
        else if (run.Phase == "link") foreach (var e in run.Making) Part(e, 1, Mathf.Sin(Mathf.PI * Mathf.Min(1, run.K * 1.2f)) + 0.0001f);
    }
}
